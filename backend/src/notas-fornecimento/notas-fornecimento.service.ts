/**
 * NOTAS DE FORNECIMENTO NA TELA DAS MEDIÇÕES
 *
 * Quando o órgão escolhe que a nota fiscal das ordens de fornecimento também
 * (ou só) chegue a quem cuida das medições, é aqui que essa pessoa trabalha:
 * vê a nota e a situação do recebimento, baixa os arquivos, devolve ao
 * fornecedor, colhe assinaturas num termo de atesto e marca o envio à
 * contabilidade. O aceite do material (baixa no contrato) continua sendo o do
 * Recebimento — este serviço só o consulta.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { NotaFiscalFornecedor, StatusNotaFiscalFornecedor } from '../almoxarifado/entities/nota-fiscal-fornecedor.entity';
import { OrdemFornecimento } from '../almoxarifado/entities/ordem-fornecimento.entity';
import { Recebimento, StatusRecebimento } from '../almoxarifado/entities/recebimento.entity';
import { NotaFiscalFornecedorService } from '../almoxarifado/nota-fiscal-fornecedor.service';
import { DestinoNotaFornecimento, LINK_NOTAS_FORNECIMENTO_MEDICOES, notaVaiParaMedicoes } from '../almoxarifado/destino-nota-fornecimento';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { PortalAssinaturasService } from '../portal-assinaturas/portal-assinaturas.service';
import { StatusDocumentoAssinatura } from '../assinaturas/entities/documento-assinatura.entity';
import { SignatarioDocumento, StatusAssinaturaSignatario } from '../assinaturas/entities/signatario-documento.entity';
import { diretorioDeGravacao, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { MAX_SIGNATARIOS_TERMO, gerarTermoAtestoPdf, posicaoAssinaturaTermo } from './termo-atesto-pdf';

export const PASTA_TERMOS_ATESTO = 'termos-atesto';
/** Página pública onde cada pessoa confere a nota e assina com código (link pessoal). */
export const CAMINHO_ASSINAR_NOTA = '/assinar-nota';
const baseApp = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://portaldcp.com.br').replace(/\/$/, '');

export interface Ator {
  usuarioId: string | null;
  nome: string;
  /** Login do próprio órgão ou administrador: dispensa as permissões por usuário. */
  contaPrincipal: boolean;
}

export interface SignatarioPedido {
  usuario_id?: string;
  nome?: string;
  email?: string;
  cpf_cnpj?: string;
  /** WhatsApp de quem não é usuário do órgão: recebe o link de assinatura por lá também. */
  telefone?: string;
  papel?: string;
}

/** Recebimentos em que o material já entrou (total ou em parte): a nota não pode mais ser devolvida. */
const RECEBIMENTO_COM_ACEITE = [
  StatusRecebimento.ACEITO,
  StatusRecebimento.ACEITO_PARCIAL,
  StatusRecebimento.PENDENTE_ALMOXARIFADO,
  StatusRecebimento.PENDENTE_PATRIMONIO,
];
const RECEBIMENTO_ACEITO = [StatusRecebimento.ACEITO, StatusRecebimento.ACEITO_PARCIAL];

const ROTULO_RECEBIMENTO: Record<string, string> = {
  SEM_RECEBIMENTO: 'Aguardando conferência',
  PENDENTE: 'Em conferência',
  CONFERIDO: 'Conferido, aguardando aceite',
  PENDENTE_ALMOXARIFADO: 'Aguardando aceite do almoxarifado',
  PENDENTE_PATRIMONIO: 'Aguardando aceite do patrimônio',
  ACEITO: 'Material aceito',
  ACEITO_PARCIAL: 'Material aceito em parte',
  REJEITADO: 'Recebimento rejeitado',
  ESTORNADO: 'Recebimento estornado',
};

@Injectable()
export class NotasFornecimentoService {
  private readonly logger = new Logger(NotasFornecimentoService.name);

  constructor(
    @InjectRepository(NotaFiscalFornecedor) private readonly nfRepo: Repository<NotaFiscalFornecedor>,
    @InjectRepository(Recebimento) private readonly recRepo: Repository<Recebimento>,
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Orgao) private readonly orgaoRepo: Repository<Orgao>,
    private readonly nfService: NotaFiscalFornecedorService,
    private readonly assinaturas: PortalAssinaturasService,
    private readonly notificacoes: NotificacoesService,
    @InjectRepository(SignatarioDocumento) private readonly sigRepo: Repository<SignatarioDocumento>,
  ) {}

  // ── Acesso ──────────────────────────────────────────────────────────────

  /** Destino do órgão; recusa quando a nota não é encaminhada às medições. */
  async exigirDestinoMedicoes(orgaoId: string): Promise<DestinoNotaFornecimento> {
    const destino = await this.nfService.destinoDoOrgao(orgaoId);
    if (!notaVaiParaMedicoes(destino)) {
      throw new ForbiddenException(
        'Este órgão não encaminha as notas de fornecimento para as medições. Altere em Configurações › Dados do órgão.',
      );
    }
    return destino;
  }

  private async carregar(id: string, orgaoId: string): Promise<NotaFiscalFornecedor> {
    await this.exigirDestinoMedicoes(orgaoId);
    const nf = await this.nfRepo.findOne({
      where: { id, orgao_id: orgaoId },
      relations: ['ordem_fornecimento', 'ordem_fornecimento.contrato', 'ordem_fornecimento.fornecedor'],
    });
    if (!nf) throw new NotFoundException('Nota fiscal não encontrada');
    return nf;
  }

  /** Recebimento que vale para a nota: o ligado a ela; sem ligação, o mais recente da ordem. */
  private recebimentoDaNota(nf: NotaFiscalFornecedor, daOrdem: Recebimento[]): Recebimento | null {
    const ordenados = [...daOrdem].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return (
      ordenados.find((r) => r.nota_fiscal_fornecedor_id === nf.id) ??
      ordenados.find((r) => !r.nota_fiscal_fornecedor_id && r.numero_nota_fiscal && r.numero_nota_fiscal === nf.numero) ??
      null
    );
  }

  private existe(caminho: string | null | undefined): string | null {
    if (!caminho) return null;
    if (fs.existsSync(caminho)) return caminho;
    return resolverArquivoDeUrl(caminho);
  }

  // ── Consulta ────────────────────────────────────────────────────────────

  async listar(orgaoId: string) {
    const destino = await this.nfService.destinoDoOrgao(orgaoId);
    if (!notaVaiParaMedicoes(destino)) return { destino, notas: [] };

    const notas = await this.nfRepo.find({
      where: { orgao_id: orgaoId },
      relations: ['ordem_fornecimento', 'ordem_fornecimento.contrato', 'ordem_fornecimento.fornecedor'],
      order: { created_at: 'DESC' },
      take: 500,
    });
    const ordemIds = [...new Set(notas.map((n) => n.ordem_fornecimento_id))];
    const recebimentos = ordemIds.length
      ? await this.recRepo.find({ where: { ordem_fornecimento_id: In(ordemIds), orgao_id: orgaoId } })
      : [];
    const porOrdem = new Map<string, Recebimento[]>();
    for (const r of recebimentos) porOrdem.set(r.ordem_fornecimento_id, [...(porOrdem.get(r.ordem_fornecimento_id) ?? []), r]);

    const saida: any[] = [];
    for (const nf of notas) {
      const rec = this.recebimentoDaNota(nf, porOrdem.get(nf.ordem_fornecimento_id) ?? []);
      saida.push(await this.apresentar(nf, rec));
    }
    return { destino, notas: saida };
  }

  async detalhe(id: string, orgaoId: string) {
    const nf = await this.carregar(id, orgaoId);
    const recs = await this.recRepo.find({ where: { ordem_fornecimento_id: nf.ordem_fornecimento_id, orgao_id: orgaoId } });
    return {
      ...(await this.apresentar(nf, this.recebimentoDaNota(nf, recs))),
      itens: (nf.produtos_xml ?? []).map((p) => ({
        descricao: p.xProd, unidade: p.uCom, quantidade: Number(p.qCom), valor_unitario: Number(p.vUnCom), valor_total: Number(p.vProd),
      })),
      historico: nf.historico ?? [],
    };
  }

  private async apresentar(nf: NotaFiscalFornecedor, rec: Recebimento | null) {
    const ordem: OrdemFornecimento | undefined = nf.ordem_fornecimento;
    const situacaoRec = rec?.status ?? 'SEM_RECEBIMENTO';
    return {
      id: nf.id,
      numero: nf.numero,
      serie: nf.serie,
      chave_acesso: nf.chave_acesso,
      data_emissao: nf.data_emissao,
      valor_total: nf.valor_total == null ? null : Number(nf.valor_total),
      status: nf.status,
      motivo_recusa: nf.motivo_recusa,
      recebida_em: nf.created_at,
      tem_pdf: !!this.existe(nf.caminho_pdf),
      tem_xml: !!this.existe(nf.caminho_xml),
      qtd_itens: (nf.produtos_xml ?? []).length,
      ordem: ordem ? { id: ordem.id, numero: ordem.numero, descricao: ordem.descricao } : null,
      contrato: ordem?.contrato ? { id: ordem.contrato.id, numero: (ordem.contrato as any).numero_contrato, objeto: ordem.contrato.objeto } : null,
      fornecedor: {
        razao_social: (ordem as any)?.fornecedor?.razao_social ?? nf.razao_social_emitente ?? '—',
        cpf_cnpj: (ordem as any)?.fornecedor?.cpf_cnpj ?? nf.cnpj_emitente ?? null,
      },
      recebimento: {
        status: situacaoRec,
        rotulo: ROTULO_RECEBIMENTO[situacaoRec] ?? situacaoRec,
        numero: rec?.numero ?? null,
        aceito: !!rec && RECEBIMENTO_ACEITO.includes(rec.status),
        data_aceite: rec?.data_aceite ?? null,
        tem_comprovante: !!this.existe(rec?.comprovacao_aceite_path),
      },
      assinatura: await this.situacaoAssinatura(nf),
      contabilidade: nf.enviado_contabilidade_em
        ? { enviado_em: nf.enviado_contabilidade_em, enviado_por: nf.enviado_contabilidade_por }
        : null,
      pode_devolver: nf.status !== StatusNotaFiscalFornecedor.RECUSADA && !(rec && RECEBIMENTO_COM_ACEITE.includes(rec.status)),
    };
  }

  private async situacaoAssinatura(nf: NotaFiscalFornecedor) {
    if (!nf.documento_assinatura_id) return null;
    const doc = await this.assinaturas.obterDocumento(nf.documento_assinatura_id, nf.orgao_id).catch(() => null);
    if (!doc) return null;
    return {
      documento_id: doc.id,
      status: doc.status,
      criado_em: doc.created_at,
      // sempre na ordem dos quadros do termo (a do pedido)
      signatarios: [...(doc.signatarios || [])].sort((x: any, y: any) => (x.pos_y - y.pos_y) || (x.pos_x - y.pos_x)).map((s: any) => ({
        nome: s.nome,
        papel: s.papel ?? null,
        status: s.status,
        interno: !!s.is_orgao_user,
        data_assinatura: s.data_assinatura ?? null,
        canal: s.telefone ? 'whatsapp' : 'email',
        // link pessoal de assinatura, para quem pediu poder reenviar por conta própria
        link: s.status === 'PENDENTE' && doc.status === StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS ? `${baseApp()}${CAMINHO_ASSINAR_NOTA}/${s.token_acesso}` : null,
      })),
    };
  }

  /** Usuários ativos do órgão, para escolher quem assina. */
  async usuariosParaAssinar(orgaoId: string) {
    await this.exigirDestinoMedicoes(orgaoId);
    const us = await this.usuarioRepo.find({ where: { orgao_id: orgaoId, ativo: true } as any, order: { nome: 'ASC' } as any });
    return us
      .filter((u) => !!u.email)
      .map((u) => ({ id: u.id, nome: u.nome, cargo: (u as any).cargo ?? null, fiscal: !!u.eh_fiscal_contrato, tem_whatsapp: !!(u as any).telefone }));
  }

  // ── Arquivos ────────────────────────────────────────────────────────────

  async arquivo(id: string, orgaoId: string, tipo: string): Promise<{ caminho: string; nome: string; mime: string }> {
    const nf = await this.carregar(id, orgaoId);
    const base = `NF-${(nf.numero || nf.id).toString().replace(/[^\w.-]/g, '_')}`;
    if (tipo === 'pdf' || tipo === 'xml') {
      const caminho = this.existe(tipo === 'pdf' ? nf.caminho_pdf : nf.caminho_xml);
      if (!caminho) throw new NotFoundException(tipo === 'pdf' ? 'A nota não tem PDF anexado' : 'A nota não tem XML anexado');
      return { caminho, nome: `${base}.${tipo}`, mime: tipo === 'pdf' ? 'application/pdf' : 'application/xml' };
    }
    if (tipo === 'termo') {
      const caminho = await this.caminhoDoTermo(nf);
      if (!caminho) throw new NotFoundException('Esta nota ainda não tem termo de atesto');
      return { caminho, nome: `Termo-atesto-${base}.pdf`, mime: 'application/pdf' };
    }
    if (tipo === 'comprovante') {
      const recs = await this.recRepo.find({ where: { ordem_fornecimento_id: nf.ordem_fornecimento_id, orgao_id: orgaoId } });
      const caminho = this.existe(this.recebimentoDaNota(nf, recs)?.comprovacao_aceite_path);
      if (!caminho) throw new NotFoundException('O comprovante de aceite ainda não foi gerado');
      return { caminho, nome: `Comprovante-aceite-${base}.pdf`, mime: 'application/pdf' };
    }
    throw new BadRequestException('Arquivo desconhecido');
  }

  /** Termo de atesto: a versão assinada quando concluída; senão, a original. */
  private async caminhoDoTermo(nf: NotaFiscalFornecedor): Promise<string | null> {
    if (nf.documento_assinatura_id) {
      const doc = await this.assinaturas.obterDocumento(nf.documento_assinatura_id, nf.orgao_id).catch(() => null);
      const assinado = doc?.arquivo_assinado_url
        ? resolverArquivoDeUrl(doc.arquivo_assinado_url) ??
          this.existe(path.join(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), doc.arquivo_assinado_url))
        : null;
      if (assinado) return assinado;
    }
    return nf.termo_atesto_url ? resolverArquivoDeUrl(nf.termo_atesto_url) : null;
  }

  /** Pacote da nota: PDF, XML, anexos, comprovante de aceite e termo de atesto. */
  async pacote(id: string, orgaoId: string): Promise<{ buffer: Buffer; nome: string }> {
    const nf = await this.carregar(id, orgaoId);
    const recs = await this.recRepo.find({ where: { ordem_fornecimento_id: nf.ordem_fornecimento_id, orgao_id: orgaoId } });
    const rec = this.recebimentoDaNota(nf, recs);
    const arquivos: Array<[string, string]> = [];
    const add = (caminho: string | null, nome: string) => { if (caminho) arquivos.push([caminho, nome]); };
    const ordemPdf = this.existe((nf.ordem_fornecimento as any)?.caminho_pdf);
    add(ordemPdf, '01_Ordem_de_fornecimento.pdf');
    add(this.existe(nf.caminho_pdf), '02_Nota_fiscal.pdf');
    add(this.existe(nf.caminho_xml), '02_Nota_fiscal.xml');
    (nf.documentos_extras ?? []).forEach((d, i) =>
      add(this.existe(d.caminho), `03_Anexo_${String(i + 1).padStart(2, '0')}_${String(d.nome).replace(/[^\w.-]/g, '_')}`));
    add(this.existe(rec?.comprovacao_aceite_path), '04_Comprovante_de_aceite.pdf');
    add(await this.caminhoDoTermo(nf), '05_Termo_de_atesto.pdf');
    if (!arquivos.length) throw new NotFoundException('Nenhum arquivo disponível para esta nota');

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const zip = archiver('zip', { zlib: { level: 9 } });
      const partes: Buffer[] = [];
      zip.on('data', (c: Buffer) => partes.push(c));
      zip.on('end', () => resolve(Buffer.concat(partes)));
      zip.on('error', reject);
      for (const [caminho, nome] of arquivos) zip.file(caminho, { name: nome });
      zip.finalize();
    });
    return { buffer, nome: `NF-${(nf.numero || nf.id).toString().replace(/[^\w.-]/g, '_')}-${(nf.ordem_fornecimento?.numero || '').replace(/[^\w.-]/g, '_')}.zip` };
  }

  // ── Ações ───────────────────────────────────────────────────────────────

  /** Devolve a nota ao fornecedor (ele corrige e envia outra). Não vale depois do aceite do material. */
  async devolver(id: string, orgaoId: string, motivo: string, ator: Ator) {
    const nf = await this.carregar(id, orgaoId);
    const texto = String(motivo ?? '').trim();
    if (texto.length < 5) throw new BadRequestException('Informe o motivo da devolução');
    if (nf.status === StatusNotaFiscalFornecedor.RECUSADA) throw new BadRequestException('Esta nota já foi devolvida ao fornecedor');
    const recs = await this.recRepo.find({ where: { ordem_fornecimento_id: nf.ordem_fornecimento_id, orgao_id: orgaoId } });
    const rec = this.recebimentoDaNota(nf, recs);
    if (rec && RECEBIMENTO_COM_ACEITE.includes(rec.status)) {
      throw new BadRequestException(
        `O material desta nota já foi aceito no recebimento ${rec.numero}. Para devolver a nota, o recebimento precisa ser estornado antes.`,
      );
    }
    if (nf.enviado_contabilidade_em) throw new BadRequestException('Esta nota já foi enviada à contabilidade');

    await this.cancelarAssinaturaPendente(nf);
    await this.nfService.recusarNF(nf.id, texto, ator.usuarioId ?? orgaoId, ator.nome);
    return this.detalhe(id, orgaoId);
  }

  /** Gera o termo de atesto e abre a coleta de assinaturas no Portal de Assinaturas. */
  async colherAssinaturas(id: string, orgaoId: string, pedidos: SignatarioPedido[], ator: Ator) {
    const nf = await this.carregar(id, orgaoId);
    if (nf.status === StatusNotaFiscalFornecedor.RECUSADA) throw new BadRequestException('Nota devolvida ao fornecedor não recebe assinaturas');
    if (!Array.isArray(pedidos) || pedidos.length === 0) throw new BadRequestException('Escolha pelo menos uma pessoa para assinar');
    if (pedidos.length > MAX_SIGNATARIOS_TERMO) throw new BadRequestException(`O termo comporta até ${MAX_SIGNATARIOS_TERMO} assinaturas`);

    const atual = await this.situacaoAssinatura(nf);
    if (atual?.status === StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS) {
      throw new BadRequestException('Já existe uma coleta de assinaturas em andamento para esta nota. Cancele-a antes de abrir outra.');
    }
    if (atual?.status === StatusDocumentoAssinatura.CONCLUIDO) {
      throw new BadRequestException('O termo de atesto desta nota já foi assinado por todos.');
    }

    // Quem assina: usuário do órgão (assina dentro do sistema) ou pessoa de fora (link por e-mail)
    const idsInternos = pedidos.map((p) => p.usuario_id).filter(Boolean) as string[];
    const internos = idsInternos.length ? await this.usuarioRepo.find({ where: { id: In(idsInternos), orgao_id: orgaoId } }) : [];
    const signatarios = pedidos.map((p, i) => {
      if (p.usuario_id) {
        const u = internos.find((x) => x.id === p.usuario_id);
        if (!u) throw new BadRequestException('Uma das pessoas escolhidas não pertence a este órgão');
        if (!u.email) throw new BadRequestException(`${u.nome} não tem e-mail cadastrado e não pode assinar`);
        return {
          usuario_id: u.id,
          nome: u.nome, email: u.email, cpf_cnpj: (u as any).cpf ?? undefined, telefone: (u as any).telefone ?? undefined,
          is_orgao_user: true, papel: (p.papel || (u as any).cargo || '').trim() || undefined, ...posicaoAssinaturaTermo(i),
        };
      }
      const nome = String(p.nome ?? '').trim();
      const email = String(p.email ?? '').trim().toLowerCase();
      const cpf = String(p.cpf_cnpj ?? '').replace(/\D/g, '');
      if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || ![11, 14].includes(cpf.length)) {
        throw new BadRequestException('Para quem não é usuário do órgão, informe nome, e-mail e CPF');
      }
      const fone = String(p.telefone ?? '').replace(/\D/g, '');
      if (fone && (fone.length < 10 || fone.length > 13)) throw new BadRequestException('WhatsApp inválido: informe DDD e número');
      return { usuario_id: null as string | null, nome, email, cpf_cnpj: cpf, telefone: fone || undefined, is_orgao_user: false, papel: (p.papel || '').trim() || undefined, ...posicaoAssinaturaTermo(i) };
    });
    const emails = signatarios.map((s) => s.email.toLowerCase());
    if (new Set(emails).size !== emails.length) throw new BadRequestException('A mesma pessoa foi escolhida mais de uma vez');

    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId } });
    const recs = await this.recRepo.find({ where: { ordem_fornecimento_id: nf.ordem_fornecimento_id, orgao_id: orgaoId } });
    const rec = this.recebimentoDaNota(nf, recs);
    const ordem = nf.ordem_fornecimento;
    const { buffer, ultimaPagina } = gerarTermoAtestoPdf({
      orgao: { nome: orgao?.nome ?? '', cnpj: orgao?.cnpj, cidade: (orgao as any)?.cidade, uf: (orgao as any)?.uf },
      nota: { numero: nf.numero, serie: nf.serie, chave_acesso: nf.chave_acesso, data_emissao: nf.data_emissao as any, valor_total: nf.valor_total },
      ordem: { numero: ordem?.numero ?? '—', descricao: ordem?.descricao },
      contrato: { numero: (ordem?.contrato as any)?.numero_contrato, objeto: ordem?.contrato?.objeto },
      fornecedor: {
        razao_social: (ordem as any)?.fornecedor?.razao_social ?? nf.razao_social_emitente ?? '—',
        cpf_cnpj: (ordem as any)?.fornecedor?.cpf_cnpj ?? nf.cnpj_emitente,
      },
      itens: (nf.produtos_xml ?? []).map((p) => ({
        descricao: p.xProd, unidade: p.uCom, quantidade: Number(p.qCom), valor_unitario: Number(p.vUnCom), valor_total: Number(p.vProd),
      })),
      situacao_recebimento: this.fraseRecebimento(rec),
      signatarios: signatarios.map((s) => ({ nome: s.nome, papel: s.papel })),
      emitido_por: ator.nome,
      emitido_em: new Date(),
    });

    const nomeArq = `termo-atesto-${Date.now()}.pdf`;
    const dir = path.join(diretorioDeGravacao(PASTA_TERMOS_ATESTO), nf.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nomeArq), buffer);
    const rel = `${PASTA_TERMOS_ATESTO}/${nf.id}/${nomeArq}`;

    const titulo = `Termo de atesto — NF ${nf.numero || 's/n'} — ${ordem?.numero ?? ''}`.slice(0, 250);
    const doc = await this.assinaturas.criarDocumento(
      orgaoId,
      (ator.usuarioId ?? orgaoId) as string,
      {
        titulo,
        descricao: `Atesto da nota fiscal nº ${nf.numero || 's/n'} de ${(ordem as any)?.fornecedor?.razao_social ?? nf.razao_social_emitente ?? 'fornecedor'}, ordem de fornecimento ${ordem?.numero ?? ''}.`,
        signatarios: signatarios.map(({ usuario_id: _u, ...s }) => ({ ...s, pagina_assinatura: ultimaPagina })),
      } as any,
      rel,
    );
    await this.nfRepo.update(nf.id, { termo_atesto_url: rel, documento_assinatura_id: doc.id });
    await this.registrar(nf.id, 'ASSINATURAS_SOLICITADAS', `Termo de atesto enviado para assinatura de ${signatarios.map((s) => s.nome).join(', ')}`, ator.nome);
    await this.avisarSignatarios(nf, doc, ator.nome);
    return this.detalhe(id, orgaoId);
  }

  async cancelarAssinaturas(id: string, orgaoId: string, ator: Ator) {
    const nf = await this.carregar(id, orgaoId);
    const cancelou = await this.cancelarAssinaturaPendente(nf);
    if (!cancelou) throw new BadRequestException('Não há coleta de assinaturas em andamento para esta nota');
    await this.registrar(nf.id, 'ASSINATURAS_CANCELADAS', 'Coleta de assinaturas do termo de atesto cancelada', ator.nome);
    return this.detalhe(id, orgaoId);
  }

  private async cancelarAssinaturaPendente(nf: NotaFiscalFornecedor): Promise<boolean> {
    const atual = await this.situacaoAssinatura(nf);
    if (atual?.status !== StatusDocumentoAssinatura.AGUARDANDO_ASSINATURAS) return false;
    await this.assinaturas.cancelarDocumento(atual.documento_id, nf.orgao_id);
    return true;
  }

  /** Marca que a nota seguiu para a contabilidade. Só depois do aceite do material. */
  async marcarEnviadoContabilidade(id: string, orgaoId: string, ator: Ator) {
    const nf = await this.carregar(id, orgaoId);
    if (!ator.contaPrincipal) {
      const u = ator.usuarioId ? await this.usuarioRepo.findOne({ where: { id: ator.usuarioId } }) : null;
      if (!u?.pode_enviar_contabilidade) throw new ForbiddenException('Você não tem permissão para marcar envio para contabilidade');
    }
    if (nf.status === StatusNotaFiscalFornecedor.RECUSADA) throw new BadRequestException('Nota devolvida ao fornecedor não segue para a contabilidade');
    if (nf.enviado_contabilidade_em) throw new BadRequestException('Esta nota já foi marcada como enviada à contabilidade');
    const recs = await this.recRepo.find({ where: { ordem_fornecimento_id: nf.ordem_fornecimento_id, orgao_id: orgaoId } });
    const rec = this.recebimentoDaNota(nf, recs);
    if (!rec || !RECEBIMENTO_ACEITO.includes(rec.status)) {
      throw new BadRequestException('A nota só segue para a contabilidade depois que o material for aceito no recebimento');
    }
    await this.nfRepo.update(nf.id, { enviado_contabilidade_em: new Date(), enviado_contabilidade_por: ator.nome });
    await this.registrar(nf.id, 'ENVIADA_CONTABILIDADE', 'Nota marcada como enviada à contabilidade', ator.nome);
    return this.detalhe(id, orgaoId);
  }

  // ── Assinatura por link (mesma experiência da medição) ──────────────────

  /**
   * Cada pessoa recebe no WhatsApp (e no e-mail) um link pessoal: abre, confere
   * a nota e o termo, pede o código e assina — ou recusa. Usuário do órgão
   * também é avisado no sino e pode assinar em Aprovações.
   */
  private async avisarSignatarios(nf: NotaFiscalFornecedor, doc: any, solicitante: string) {
    const ordem = nf.ordem_fornecimento;
    const orgaoNome = (await this.orgaoRepo.findOne({ where: { id: nf.orgao_id } }))?.nome ?? 'Órgão';
    const fornecedor = (ordem as any)?.fornecedor?.razao_social ?? nf.razao_social_emitente ?? 'Fornecedor';
    const valor = Number(nf.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const internos = await this.usuarioRepo.find({ where: { orgao_id: nf.orgao_id } });
    for (const s of doc.signatarios || []) {
      const link = `${baseApp()}${CAMINHO_ASSINAR_NOTA}/${s.token_acesso}`;
      const usuario = s.is_orgao_user ? internos.find((u) => (u.email || '').toLowerCase() === String(s.email || '').toLowerCase()) : null;
      const whatsapp =
        `Olá, *${s.nome}*! 👋\n\n` +
        `Você recebeu uma solicitação de *assinatura do termo de atesto de nota fiscal*.\n\n` +
        `🏛️ *Órgão:* ${orgaoNome}\n` +
        `🧾 *Nota fiscal:* ${nf.numero || 's/n'} — ${valor}\n` +
        `🏢 *Fornecedor:* ${fornecedor}\n` +
        `📦 *Ordem:* ${ordem?.numero ?? '—'}\n` +
        `👤 *Solicitado por:* ${solicitante}\n\n` +
        `Acesse o link abaixo para conferir os documentos e assinar digitalmente:`;
      await this.notificacoes.criar({
        orgao_id: nf.orgao_id,
        usuario_id: usuario?.id ?? 'SYSTEM',
        usuario_email: s.email || undefined,
        usuario_telefone: s.telefone || undefined,
        tipo: TipoNotificacao.SISTEMA,
        titulo: `Assinatura pendente: termo de atesto da NF ${nf.numero || 's/n'}`,
        mensagem:
          `<p>Olá, <strong>${s.nome}</strong>,</p>` +
          `<p>${solicitante} pediu a sua assinatura no termo de atesto da nota fiscal nº ${nf.numero || 's/n'} (${valor}), de ${fornecedor}, ordem ${ordem?.numero ?? '—'}.</p>` +
          `<p><a href="${link}">Conferir os documentos e assinar</a></p>`,
        entidade_tipo: 'nota_fiscal_fornecedor',
        entidade_id: nf.id,
        link: usuario ? '/orgao/aprovacoes' : undefined,
        enviar_email: true,
        metadata: { whatsapp_text: whatsapp, whatsapp_url: link },
      } as any).catch((e: any) => this.logger.warn(`Aviso ao signatário ${s.nome} não enviado: ${e?.message ?? e}`));
    }
  }

  /** Signatário, documento e nota a partir do link pessoal. */
  private async porToken(token: string) {
    const sig = /^[a-f0-9]{64}$/.test(String(token))
      ? await this.sigRepo.findOne({ where: { token_acesso: token }, relations: ['documento', 'documento.signatarios'] })
      : null;
    const nf = sig
      ? await this.nfRepo.findOne({
          where: { documento_assinatura_id: sig.documento_id },
          relations: ['ordem_fornecimento', 'ordem_fornecimento.contrato', 'ordem_fornecimento.fornecedor'],
        })
      : null;
    if (!sig || !nf) throw new NotFoundException('Link de assinatura inválido.');
    return { sig, doc: sig.documento, nf };
  }

  private exigirPendente(sig: SignatarioDocumento, doc: { status: string }) {
    if (doc.status === StatusDocumentoAssinatura.CANCELADO) throw new BadRequestException('Este pedido de assinatura foi cancelado pelo órgão.');
    if (sig.status === StatusAssinaturaSignatario.ASSINADO) throw new BadRequestException('Você já assinou este documento.');
    if (sig.status === StatusAssinaturaSignatario.REJEITADO) throw new BadRequestException('Você recusou a assinatura deste documento.');
  }

  /** O que a página do link mostra: quem assina, a nota e a situação dos demais. */
  async publicoDados(token: string) {
    const { sig, doc, nf } = await this.porToken(token);
    const ordem = nf.ordem_fornecimento;
    const orgao = await this.orgaoRepo.findOne({ where: { id: nf.orgao_id } });
    const fone = String(sig.telefone || '');
    return {
      situacao: doc.status === StatusDocumentoAssinatura.CANCELADO ? 'CANCELADO' : sig.status,
      signatario: {
        nome: sig.nome,
        papel: sig.papel,
        data_assinatura: sig.data_assinatura ?? null,
        canal: fone ? 'whatsapp' : 'email',
        destino_codigo: fone ? `(${fone.slice(-11, -9) || '••'}) •••••-${fone.slice(-4)}` : String(sig.email || '').replace(/^(.).*(@.*)$/, '$1•••$2'),
      },
      orgao_nome: orgao?.nome ?? '',
      nota: {
        numero: nf.numero,
        serie: nf.serie,
        data_emissao: nf.data_emissao,
        valor_total: nf.valor_total == null ? null : Number(nf.valor_total),
        fornecedor: (ordem as any)?.fornecedor?.razao_social ?? nf.razao_social_emitente ?? '—',
        ordem: ordem?.numero ?? null,
        contrato: (ordem?.contrato as any)?.numero_contrato ?? null,
        tem_pdf: !!this.existe(nf.caminho_pdf),
      },
      itens: (nf.produtos_xml ?? []).map((p) => ({
        descricao: p.xProd, unidade: p.uCom, quantidade: Number(p.qCom), valor_unitario: Number(p.vUnCom), valor_total: Number(p.vProd),
      })),
      demais: (doc.signatarios || []).filter((x) => x.id !== sig.id).map((x) => ({ nome: x.nome, papel: x.papel, status: x.status })),
    };
  }

  /** PDF do termo ou da nota, para quem tem o link. */
  async publicoArquivo(token: string, tipo: string): Promise<{ caminho: string; nome: string }> {
    const { nf } = await this.porToken(token);
    const caminho = tipo === 'termo' ? await this.caminhoDoTermo(nf) : tipo === 'nota' ? this.existe(nf.caminho_pdf) : null;
    if (!caminho) throw new NotFoundException('Arquivo não disponível');
    return { caminho, nome: tipo === 'termo' ? 'termo-de-atesto.pdf' : `nota-fiscal-${nf.numero || ''}.pdf` };
  }

  async publicoSolicitarCodigo(token: string) {
    const { sig, doc } = await this.porToken(token);
    this.exigirPendente(sig, doc);
    return this.assinaturas.solicitarCodigoAssinatura(token, sig.cpf_cnpj || '');
  }

  async publicoAssinar(token: string, codigo: string, ip: string, userAgent: string) {
    const { sig, doc, nf } = await this.porToken(token);
    this.exigirPendente(sig, doc);
    if (!/^\d{6}$/.test(String(codigo ?? ''))) throw new BadRequestException('Informe o código de 6 dígitos');
    await this.assinaturas.assinarDocumento(token, sig.cpf_cnpj || '', codigo, ip, userAgent);
    await this.registrar(nf.id, 'TERMO_ASSINADO', `${sig.nome} assinou o termo de atesto`, sig.nome);
    return { sucesso: true };
  }

  /** Recusa de quem foi chamado a assinar: fica registrada e quem pediu é avisado. */
  async publicoRecusar(token: string, motivo: string) {
    const { sig, doc, nf } = await this.porToken(token);
    this.exigirPendente(sig, doc);
    const texto = String(motivo ?? '').trim().slice(0, 500) || 'sem motivo informado';
    await this.sigRepo.update(sig.id, { status: StatusAssinaturaSignatario.REJEITADO });
    await this.registrar(nf.id, 'ASSINATURA_RECUSADA', `${sig.nome} recusou assinar o termo de atesto: ${texto}`, sig.nome);
    if (doc.criado_por_id && doc.criado_por_id !== nf.orgao_id) {
      await this.notificacoes.criar({
        orgao_id: nf.orgao_id,
        usuario_id: doc.criado_por_id,
        tipo: TipoNotificacao.SISTEMA,
        titulo: `Assinatura recusada: termo de atesto da NF ${nf.numero || 's/n'}`,
        mensagem: `${sig.nome} recusou assinar o termo de atesto da nota fiscal nº ${nf.numero || 's/n'}. Motivo: ${texto}`,
        entidade_tipo: 'nota_fiscal_fornecedor',
        entidade_id: nf.id,
        link: LINK_NOTAS_FORNECIMENTO_MEDICOES,
      } as any).catch((e: any) => this.logger.warn(`Aviso de recusa não enviado: ${e?.message ?? e}`));
    }
    return { sucesso: true };
  }

  private fraseRecebimento(rec: Recebimento | null): string {
    if (!rec) return 'Material ainda não conferido no sistema.';
    const rotulo = ROTULO_RECEBIMENTO[rec.status] ?? rec.status;
    const quando = rec.data_aceite
      ? ` em ${new Date(rec.data_aceite).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      : '';
    return `${rotulo}${RECEBIMENTO_ACEITO.includes(rec.status) ? quando : ''} — recebimento ${rec.numero}.`;
  }

  private async registrar(nfId: string, tipo: string, descricao: string, usuario: string) {
    const nf = await this.nfRepo.findOne({ where: { id: nfId } });
    if (!nf) return;
    const historico = [...(nf.historico ?? []), { data: new Date().toISOString(), tipo, descricao, usuario }];
    await this.nfRepo.update(nfId, { historico });
  }
}
