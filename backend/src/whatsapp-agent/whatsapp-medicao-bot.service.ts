import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { MedicaoChatService } from '../contratos/medicao-chat.service';
import { MedicaoService } from '../contratos/medicao.service';
import { WhatsappAgentSession } from './entities/whatsapp-agent-session.entity';

export interface MidiaWhatsApp {
  url: string;
  fileName?: string;
  tipo: 'imagem' | 'documento';
}

/**
 * Ponte entre o agente de WhatsApp e o fluxo de medição assistida
 * (MedicaoChatService). O fornecedor envia a NF pelo WhatsApp, a IA extrai os
 * dados, monta o rascunho e a submissão é assinada com o OTP já existente.
 *
 * Segurança: o fluxo só é liberado quando o telefone da conversa bate com o
 * telefone cadastrado do fornecedor (representante_telefone/telefone).
 */
@Injectable()
export class WhatsappMedicaoBotService {
  private readonly logger = new Logger(WhatsappMedicaoBotService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    @InjectRepository(Fornecedor)
    private readonly fornecedorRepo: Repository<Fornecedor>,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepo: Repository<Medicao>,
  ) {}

  private get medicaoChat(): MedicaoChatService {
    return this.moduleRef.get(MedicaoChatService, { strict: false });
  }

  private get medicaoService(): MedicaoService {
    return this.moduleRef.get(MedicaoService, { strict: false });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Identificação do fornecedor pelo telefone da conversa
  // ──────────────────────────────────────────────────────────────────────────

  private normalizarTelefone(valor?: string | null): string {
    const dig = String(valor || '').replace(/\D/g, '');
    // Remove o DDI 55 quando presente
    return dig.startsWith('55') && dig.length >= 12 ? dig.slice(2) : dig;
  }

  /** Compara telefones tolerando o 9º dígito (celulares antigos sem o 9). */
  private telefonesEquivalentes(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length < 10 || b.length < 10) return false;
    const dddA = a.slice(0, 2);
    const dddB = b.slice(0, 2);
    if (dddA !== dddB) return false;
    const numA = a.slice(2).replace(/^9/, '');
    const numB = b.slice(2).replace(/^9/, '');
    return numA === numB && numA.length >= 8;
  }

  async identificarFornecedorPorTelefone(
    phone: string,
  ): Promise<Fornecedor | null> {
    const alvo = this.normalizarTelefone(phone);
    if (alvo.length < 10) return null;
    const sufixo = alvo.slice(-8);

    const candidatos: Fornecedor[] = await this.fornecedorRepo.query(
      `SELECT id, razao_social, nome_fantasia, cpf_cnpj,
              representante_telefone, telefone, telefone_secundario
       FROM fornecedores
       WHERE regexp_replace(COALESCE(representante_telefone,''), '\\D', '', 'g') LIKE '%' || $1
          OR regexp_replace(COALESCE(telefone,''), '\\D', '', 'g') LIKE '%' || $1
          OR regexp_replace(COALESCE(telefone_secundario,''), '\\D', '', 'g') LIKE '%' || $1
       LIMIT 10`,
      [sufixo],
    );

    for (const f of candidatos) {
      const telefones = [
        (f as any).representante_telefone,
        (f as any).telefone,
        (f as any).telefone_secundario,
      ].map((t) => this.normalizarTelefone(t));
      if (telefones.some((t) => this.telefonesEquivalentes(t, alvo))) {
        return f;
      }
    }
    return null;
  }

  async buscarContrato(contratoId: string): Promise<Contrato | null> {
    return this.contratoRepo.findOne({ where: { id: contratoId } });
  }

  async listarContratosMediveis(fornecedorId: string): Promise<Contrato[]> {
    return this.contratoRepo
      .createQueryBuilder('c')
      .where('c.fornecedor_id = :fid', { fid: fornecedorId })
      .andWhere("c.modalidade_execucao IN ('MEDICAO','CONTINUADO')")
      .andWhere('(c.data_vigencia_fim IS NULL OR c.data_vigencia_fim >= NOW())')
      .orderBy('c.numero_contrato', 'ASC')
      .getMany();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fluxo de medição (ponte com o MedicaoChatService)
  // ──────────────────────────────────────────────────────────────────────────

  async iniciarSessaoMedicao(
    session: WhatsappAgentSession,
    contrato: Contrato,
    fornecedorId: string,
  ): Promise<string> {
    const resposta = await this.medicaoChat.iniciarOuRetomarSessao(
      contrato.id,
      fornecedorId,
    );
    session.dados = {
      ...session.dados,
      medicao_chat_session_id: resposta.session.id,
      medicao_contrato_id: contrato.id,
      medicao_fornecedor_id: fornecedorId,
    };
    return (
      `📸 *Medição do contrato ${contrato.numero_contrato}*\n\n` +
      `Envie a *foto ou PDF da nota fiscal* que eu leio os dados e monto a medição para você.\n\n` +
      `Você também pode me escrever normalmente (ex.: "medição de julho, valor 2.186,25").\n\n` +
      `Comandos: *enviar* (finalizar e assinar) · *status* (resumo) · *menu* (sair)`
    );
  }

  private ultimaRespostaAssistente(resposta: any): string {
    const historico = resposta?.session?.historico_ia || [];
    for (let i = historico.length - 1; i >= 0; i--) {
      if (historico[i]?.role === 'assistant' && historico[i]?.content) {
        return this.formatarParaWhatsApp(String(historico[i].content));
      }
    }
    return 'Certo! Pode continuar.';
  }

  /**
   * As respostas do MedicaoChatService são formatadas para o chat web
   * (tabelas markdown, **negrito**, payloads em comentário HTML e instruções
   * de interface). Converte para algo legível no WhatsApp.
   */
  private formatarParaWhatsApp(texto: string): string {
    let t = texto;
    // Payloads internos (ex.: <!--ITENS_MEDICAO_JSON:...-->) nunca vão ao usuário
    t = t.replace(/<!--[\s\S]*?-->/g, '');

    // Tabelas markdown → lista compacta
    const out: string[] = [];
    let header: string[] | null = null;
    for (const linha of t.split('\n')) {
      const l = linha.trim();
      if (/^\|.*\|$/.test(l)) {
        const cells = l
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        if (cells.every((c) => /^[-: ]*$/.test(c))) continue; // separador
        if (!header) {
          header = cells;
          continue;
        }
        const partes = cells
          .map((valor, i) => ({ label: header![i] || '', valor }))
          .filter((p) => p.valor && p.valor !== '—')
          .map((p) => {
            const valor =
              p.valor.length > 60 ? `${p.valor.slice(0, 57)}…` : p.valor;
            const rotular =
              p.label &&
              !/descri|item|status/i.test(p.label) &&
              !/^[✅⚠️❌🔒]/.test(valor);
            return rotular ? `${p.label}: ${valor}` : valor;
          });
        out.push(`▫️ ${partes.join(' · ')}`);
        continue;
      }
      header = null;
      out.push(linha);
    }
    t = out.join('\n');

    // Instruções da interface web → equivalentes de conversa
    t = t.replace(
      /Selecione os itens na tabela[^.\n]*\.?/gi,
      'Me diga o que foi executado — por exemplo: "medir o item 1, 1 mês".',
    );
    t = t.replace(/,?\s*e\s+clique em\s+\*{0,2}[^.\n*]+\*{0,2}/gi, '');
    t = t.replace(/\bclique em\s+\*{0,2}[^.\n*]+\*{0,2}\.?/gi, '');

    // Negrito markdown → negrito WhatsApp
    t = t.replace(/\*\*(.+?)\*\*/g, '*$1*');
    // Títulos markdown
    t = t.replace(/^#{1,4}\s*/gm, '');
    t = t.replace(/\n{3,}/g, '\n\n').trim();

    const MAX = 3500;
    if (t.length > MAX) {
      t = `${t.slice(0, MAX - 25)}\n…\n_(mensagem resumida)_`;
    }
    return t;
  }

  private rodapePadrao(resposta: any): string {
    const medicaoId = resposta?.session?.medicao_id;
    if (medicaoId) {
      return '\n\n➡️ Quando estiver tudo certo, digite *enviar* para assinar e enviar a medição.';
    }
    return '';
  }

  async tratarMensagemMedicao(
    session: WhatsappAgentSession,
    texto: string,
  ): Promise<string> {
    const dados = session.dados || {};
    const resposta = await this.medicaoChat.processarMensagem(
      dados.medicao_chat_session_id,
      dados.medicao_fornecedor_id,
      texto,
    );
    return this.ultimaRespostaAssistente(resposta) + this.rodapePadrao(resposta);
  }

  async tratarMidiaMedicao(
    session: WhatsappAgentSession,
    midia: MidiaWhatsApp,
    legenda?: string,
  ): Promise<string> {
    const dados = session.dados || {};
    const file = await this.baixarMidia(midia);
    const resposta = await this.medicaoChat.anexarArquivo(
      dados.medicao_chat_session_id,
      dados.medicao_fornecedor_id,
      file,
      legenda || 'Nota fiscal enviada pelo WhatsApp',
    );
    return this.ultimaRespostaAssistente(resposta) + this.rodapePadrao(resposta);
  }

  private async baixarMidia(
    midia: MidiaWhatsApp,
  ): Promise<Express.Multer.File> {
    const resp = await axios.get<ArrayBuffer>(midia.url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 15 * 1024 * 1024,
    });
    const buffer = Buffer.from(resp.data as any);
    const contentType =
      resp.headers['content-type'] ||
      (midia.tipo === 'imagem' ? 'image/jpeg' : 'application/pdf');
    const extensao = contentType.includes('pdf')
      ? 'pdf'
      : contentType.includes('png')
        ? 'png'
        : 'jpg';
    const nome =
      midia.fileName || `nota-fiscal-whatsapp.${extensao}`;
    return {
      fieldname: 'file',
      originalname: nome,
      encoding: '7bit',
      mimetype: contentType,
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Assinatura por OTP e submissão
  // ──────────────────────────────────────────────────────────────────────────

  async medicaoIdDaSessao(
    session: WhatsappAgentSession,
  ): Promise<string | null> {
    const dados = session.dados || {};
    if (!dados.medicao_chat_session_id) return null;
    try {
      const resposta = await this.medicaoChat.obterSessao(
        dados.medicao_chat_session_id,
        dados.medicao_fornecedor_id,
      );
      return resposta?.session?.medicao_id || null;
    } catch {
      return null;
    }
  }

  async solicitarOtp(
    session: WhatsappAgentSession,
  ): Promise<{ ok: boolean; mensagem: string; precisaDiscriminacao?: boolean }> {
    const medicaoId = await this.medicaoIdDaSessao(session);
    if (!medicaoId) {
      return {
        ok: false,
        mensagem:
          'Ainda não há uma medição pronta para envio. Envie a nota fiscal ou complete as informações pendentes primeiro.',
      };
    }
    const dados = session.dados || {};

    // Discriminação de despesas é obrigatória antes de assinar — principal
    // motivo de recusa pela contabilidade quando falta (retenções da NF)
    const discriminacoes = await this.medicaoService.listarDiscriminacoes(
      medicaoId,
    );
    if (!discriminacoes || discriminacoes.length === 0) {
      session.dados = { ...dados, medicao_id_otp: medicaoId };
      return {
        ok: false,
        precisaDiscriminacao: true,
        mensagem:
          '🧾 Antes de enviar, preciso da *discriminação de despesas* exatamente como está na nota fiscal — incluindo retenções (ISS, IRRF, INSS...), se houver.\n\n' +
          'Me responda com as linhas separadas por ponto e vírgula, por exemplo:\n' +
          '_ISS 43,73; IRRF 104,94; Serviços 1.835,36_\n\n' +
          'Se a NF *não tem retenções*, responda: *valor integral*',
      };
    }
    try {
      await this.medicaoService.solicitarOtpAssinaturaMedicao(
        medicaoId,
        dados.medicao_fornecedor_id,
      );
      session.dados = { ...dados, medicao_id_otp: medicaoId };
      return {
        ok: true,
        mensagem:
          '🔐 Enviei um *código de verificação* para os seus contatos cadastrados (WhatsApp/e-mail).\n\nDigite o código aqui para *assinar e enviar* a medição.\n\n_(Digite *cancelar* para voltar)_',
      };
    } catch (e: any) {
      return {
        ok: false,
        mensagem: `⚠️ Não consegui iniciar a assinatura: ${e.message || 'erro interno'}`,
      };
    }
  }

  async validarOtp(
    session: WhatsappAgentSession,
    codigo: string,
    orgaoId?: string,
    phone?: string,
  ): Promise<{ ok: boolean; mensagem: string }> {
    const dados = session.dados || {};
    const medicaoId = dados.medicao_id_otp;
    if (!medicaoId) {
      return { ok: false, mensagem: 'Sessão de assinatura expirada. Digite *enviar* para tentar novamente.' };
    }
    try {
      await this.medicaoService.validarOtpAssinaturaMedicao(
        medicaoId,
        dados.medicao_fornecedor_id,
        codigo.trim(),
      );
      const medicao = await this.medicaoRepo.findOne({
        where: { id: medicaoId },
      });
      // Envia o boletim em PDF na conversa (não bloqueia a resposta)
      if (orgaoId && phone) {
        this.enviarBoletimPdf(medicaoId, medicao?.numero_medicao, orgaoId, phone).catch(
          (e) => this.logger.warn(`Falha ao enviar boletim PDF: ${e.message}`),
        );
      }
      return {
        ok: true,
        mensagem:
          `✅ *Medição #${medicao?.numero_medicao || ''} assinada e enviada com sucesso!*\n\n` +
          `📄 Estou gerando o boletim em PDF e envio aqui em seguida.\n\n` +
          `O órgão foi notificado e fará a conferência. Digite *menu* para voltar ao início.`,
      };
    } catch (e: any) {
      return {
        ok: false,
        mensagem: `❌ Código inválido ou expirado (${e.message || 'erro'}). Tente novamente ou digite *enviar* para receber um novo código.`,
      };
    }
  }

  /**
   * Interpreta a resposta do fornecedor com as linhas de discriminação e as
   * salva na medição (valores fiéis ao digitado, como no portal).
   */
  async salvarDiscriminacaoTexto(
    session: WhatsappAgentSession,
    texto: string,
  ): Promise<{ ok: boolean; mensagem: string }> {
    const dados = session.dados || {};
    const medicaoId = dados.medicao_id_otp;
    if (!medicaoId) {
      return { ok: false, mensagem: 'Sessão expirada. Digite *enviar* para recomeçar.' };
    }
    const medicao = await this.medicaoRepo.findOne({ where: { id: medicaoId } });
    const valorMedicao = Number(medicao?.valor_medido || 0);

    const normalizado = texto.toLowerCase().trim();
    let itens: Array<{ descricao: string; valor: number; percentual: number }>;

    if (/^(valor integral|sem reten|integral|nao tem|não tem)/.test(normalizado)) {
      itens = [{ descricao: 'SERVIÇOS', valor: valorMedicao, percentual: 100 }];
    } else {
      const partes = texto
        .split(/[;\n]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      itens = [];
      for (const parte of partes) {
        const m = parte.match(/^(.+?)\s*[:\-]?\s*(?:R\$\s*)?([\d.]+,\d{2}|[\d.]+)$/);
        if (!m) {
          return {
            ok: false,
            mensagem:
              `❌ Não entendi a linha: _"${parte}"_\n\n` +
              'Use o formato *descrição valor*, separando por ponto e vírgula. Ex.:\n_ISS 43,73; IRRF 104,94; Serviços 1.835,36_',
          };
        }
        const valor = Number(m[2].replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(valor) || valor <= 0) {
          return { ok: false, mensagem: `❌ Valor inválido em: _"${parte}"_` };
        }
        itens.push({ descricao: m[1].trim().toUpperCase(), valor, percentual: 0 });
      }
      if (itens.length === 0) {
        return { ok: false, mensagem: 'Nenhuma linha reconhecida. Tente novamente ou responda *valor integral*.' };
      }
    }

    await this.medicaoService.salvarDiscriminacoes(
      medicaoId,
      dados.medicao_fornecedor_id,
      itens,
    );

    const total = itens.reduce((s, i) => s + i.valor, 0);
    const fmt = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const linhas = itens.map((i) => `▫️ ${i.descricao}: ${fmt(i.valor)}`).join('\n');
    const alerta =
      Math.abs(total - valorMedicao) > 0.02
        ? `\n\n⚠️ A soma (${fmt(total)}) difere do valor da medição (${fmt(valorMedicao)}) — confira se está igual à NF.`
        : '';
    return {
      ok: true,
      mensagem: `✔️ Discriminação registrada:\n${linhas}\n*Total: ${fmt(total)}*${alerta}`,
    };
  }

  /** Gera o boletim oficial e envia o PDF ao fornecedor pela conversa. */
  private async enviarBoletimPdf(
    medicaoId: string,
    numeroMedicao: number | undefined,
    orgaoId: string,
    phone: string,
  ): Promise<void> {
    await this.medicaoService.gerarPdfOficialMedicao(medicaoId);
    const uploadDir =
      process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, 'boletins', `boletim_${medicaoId}.pdf`);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Boletim PDF não encontrado em ${filePath}`);
      return;
    }
    const documentoBase64 = fs.readFileSync(filePath).toString('base64');
    const whatsapp = this.moduleRef.get(WhatsAppService, { strict: false });
    await whatsapp.enviarDocumento(orgaoId, {
      to: phone,
      documentoBase64,
      nomeArquivo: `Boletim_Medicao_${numeroMedicao || ''}.pdf`,
      legenda: `📄 Boletim da Medição #${numeroMedicao || ''} — guarde este documento.`,
      extensao: 'pdf',
      mimeType: 'application/pdf',
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Consultas (Fase 3)
  // ──────────────────────────────────────────────────────────────────────────

  async statusResumo(session: WhatsappAgentSession): Promise<string> {
    const dados = session.dados || {};
    try {
      const resposta = await this.medicaoChat.obterSessao(
        dados.medicao_chat_session_id,
        dados.medicao_fornecedor_id,
      );
      return this.ultimaRespostaAssistente(resposta) + this.rodapePadrao(resposta);
    } catch (e: any) {
      return `⚠️ Não consegui consultar a sessão: ${e.message}`;
    }
  }

  async listarMedicoesFornecedor(fornecedorId: string): Promise<string> {
    const medicoes: Array<{
      numero_medicao: number;
      status: string;
      valor_medido: string;
      numero_contrato: string;
      competencia: string | null;
    }> = await this.medicaoRepo.query(
      `SELECT m.numero_medicao, m.status, m.valor_medido, m.competencia,
              c.numero_contrato
       FROM medicoes m
       JOIN contratos c ON c.id = m.contrato_id
       WHERE c.fornecedor_id = $1
       ORDER BY m.created_at DESC
       LIMIT 10`,
      [fornecedorId],
    );
    if (medicoes.length === 0) {
      return 'Você ainda não possui medições registradas.\n\nDigite *menu* para voltar.';
    }
    const statusEmoji: Record<string, string> = {
      RASCUNHO: '📝',
      SUBMETIDA: '📤',
      AGUARDANDO_ATESTE: '🔍',
      PARCIALMENTE_ATESTADA: '🔍',
      AGUARDANDO_APROVACAO: '⏳',
      APROVADA: '✅',
      DEVOLVIDA: '↩️',
    };
    const linhas = medicoes.map((m) => {
      const valor = Number(m.valor_medido || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      const emoji = statusEmoji[m.status] || '▫️';
      return `${emoji} *Medição #${m.numero_medicao}* — ${m.numero_contrato}${m.competencia ? ` (${m.competencia})` : ''}\n   ${valor} · ${m.status.replace(/_/g, ' ')}`;
    });
    return (
      `📋 *Suas últimas medições:*\n\n${linhas.join('\n\n')}\n\n` +
      `Digite *menu* para voltar ao início.`
    );
  }
}
