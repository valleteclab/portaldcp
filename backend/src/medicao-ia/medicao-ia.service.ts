import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IaService } from '../ia/ia.service';
import { XmlNfeParserService } from '../almoxarifado/xml-nfe-parser.service';
import { MedicaoService } from '../contratos/medicao.service';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import {
  ResultadoExtracao,
  CamposExtraidosNF,
  ValidacaoNF,
  DiscriminacaoSugerida,
  NfRawData,
  NfRawItem,
  CriarRascunhoDto,
} from './dto/medicao-ia.dto';

const MESES_PT: Record<number, string> = {
  1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL',
  5: 'MAIO', 6: 'JUNHO', 7: 'JULHO', 8: 'AGOSTO',
  9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO',
};

const SYSTEM_PROMPT_NF = `Você é um especialista em Nota Fiscal Eletrônica (NF-e) e DANFE brasileiros.
Extraia os dados da nota fiscal e retorne APENAS JSON válido, sem markdown, sem explicações.

CAMPOS A EXTRAIR:
- numero: número da NF (campo "Nº" no DANFE ou nNF no XML, ex: "000001234")
- serie: série da NF (ex: "001")
- data_emissao: data de emissão no formato YYYY-MM-DD
- valor_total: valor total da nota (número decimal, ex: 36598.50)
- cnpj_emitente: CNPJ do EMITENTE/FORNECEDOR (somente 14 dígitos, sem pontuação)
- razao_social_emitente: razão social da empresa emitente
- competencia: mês/ano de referência se explicitamente escrito no documento (ex: "MARÇO/2026"), ou null
- itens: lista de produtos/serviços da nota

Retorne EXATAMENTE este JSON (sem texto antes ou depois):
{
  "numero": "000001234",
  "serie": "001",
  "data_emissao": "YYYY-MM-DD",
  "valor_total": 0.00,
  "cnpj_emitente": "00000000000000",
  "razao_social_emitente": "NOME DA EMPRESA",
  "competencia": null,
  "itens": [
    {"descricao": "...", "quantidade": 1, "unidade": "UN", "valor_unitario": 0.00, "valor_total": 0.00}
  ]
}`;

@Injectable()
export class MedicaoIaService {
  private readonly logger = new Logger(MedicaoIaService.name);

  constructor(
    private readonly iaService: IaService,
    private readonly xmlNfeParserService: XmlNfeParserService,
    private readonly medicaoService: MedicaoService,
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
    @InjectRepository(Medicao)
    private readonly medicaoRepo: Repository<Medicao>,
  ) {}

  async extrairNF(
    file: Express.Multer.File,
    contratoId: string,
    fornecedorCnpj: string,
  ): Promise<ResultadoExtracao> {
    this.logger.log(`Extraindo NF: ${file.originalname} (${file.mimetype})`);

    let rawData: NfRawData;
    let fonte: ResultadoExtracao['fonte'];

    const isXml =
      file.mimetype === 'application/xml' ||
      file.mimetype === 'text/xml' ||
      file.originalname.toLowerCase().endsWith('.xml');

    if (isXml) {
      // Caminho 1: XML NF-e — mais preciso
      fonte = 'xml';
      rawData = this.extrairDeXml(file.buffer);
    } else if (file.mimetype === 'application/pdf') {
      // Caminho 2: PDF DANFE
      const texto = await this.iaService.extrairTextoDoPdf(file.buffer);
      this.logger.log(`Texto PDF extraído: ${texto.length} chars`);

      if (texto.trim().length >= 100) {
        fonte = 'pdf_ia';
        const resposta = await this.iaService.chatComArquivo(
          SYSTEM_PROMPT_NF,
          undefined,
          undefined,
          texto,
        );
        rawData = this.parsearRespostaIA(resposta);
      } else {
        // PDF escaneado — usa Vision
        fonte = 'imagem_ia';
        const resposta = await this.iaService.chatComPdfEscaneado(
          SYSTEM_PROMPT_NF,
          file.buffer,
        );
        rawData = this.parsearRespostaIA(resposta);
      }
    } else {
      // Caminho 3: Imagem (JPG/PNG) — usa Vision
      fonte = 'imagem_ia';
      const base64 = file.buffer.toString('base64');
      const resposta = await this.iaService.chatComArquivo(
        SYSTEM_PROMPT_NF,
        base64,
        file.mimetype,
      );
      rawData = this.parsearRespostaIA(resposta);
    }

    // Mapear para campos do boletim
    const campos = this.mapearCampos(rawData);

    // Buscar contrato para validações
    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId } });

    // Calcular saldo disponível
    let saldoDisponivel: number | null = null;
    if (contrato) {
      try {
        const resumo = await this.medicaoService.resumoMedicoes(contratoId);
        saldoDisponivel = resumo?.saldo_disponivel ?? null;
      } catch {
        // ignora erro — validação de saldo é opcional
      }
    }

    // Gerar validações
    const validacoes = this.gerarValidacoes(rawData, fornecedorCnpj, saldoDisponivel);

    // Sugestões de discriminação a partir dos itens da NF
    const discriminacoesSugeridas = this.sugerirDiscriminacoes(rawData, campos.nota_fiscal_valor);

    return { campos, validacoes, discriminacoes_sugeridas: discriminacoesSugeridas, fonte };
  }

  async criarRascunho(dto: CriarRascunhoDto): Promise<Medicao> {
    const payload: any = {
      periodo_inicio: dto.periodo_inicio,
      periodo_fim: dto.periodo_fim,
      competencia: dto.competencia || undefined,
      observacoes: dto.observacoes || undefined,
      nota_fiscal_numero: dto.nota_fiscal_numero || undefined,
      nota_fiscal_valor: dto.nota_fiscal_valor || undefined,
      nota_fiscal_data: dto.nota_fiscal_data || undefined,
      fornecedor_id: dto.fornecedor_id,
      fornecedor_nome: dto.fornecedor_nome,
      valor_medido: dto.valor_medido || undefined,
      itens: dto.itens || [],
    };

    const medicao = await this.medicaoService.criarMedicao(dto.contrato_id, payload);

    // Salvar discriminações se fornecidas
    if (dto.discriminacoes && dto.discriminacoes.length > 0 && medicao?.id) {
      try {
        await this.medicaoService.salvarDiscriminacoes(medicao.id, dto.fornecedor_id, dto.discriminacoes);
      } catch (err) {
        this.logger.warn(`Erro ao salvar discriminações: ${err}`);
      }
    }

    return medicao;
  }

  // ─── Parsing XML ──────────────────────────────────────────────────────────

  private extrairDeXml(buffer: Buffer): NfRawData {
    const xml = buffer.toString('utf-8');
    const parsed = this.xmlNfeParserService.parse(xml);

    const itens: NfRawItem[] = parsed.produtos.map((p) => ({
      descricao: p.xProd,
      quantidade: p.qCom,
      unidade: p.uCom,
      valor_unitario: p.vUnCom,
      valor_total: p.vProd,
    }));

    return {
      numero: parsed.header.numero,
      serie: parsed.header.serie,
      data_emissao: this.normalizarData(parsed.header.dataEmissao),
      valor_total: parsed.header.valorTotal,
      cnpj_emitente: parsed.header.cnpjEmitente,
      razao_social_emitente: parsed.header.razaoSocialEmitente,
      competencia: null,
      itens,
    };
  }

  // ─── Parsing resposta IA ──────────────────────────────────────────────────

  private parsearRespostaIA(resposta: string): NfRawData {
    let json = resposta.trim();

    // Remove markdown code blocks se presentes
    json = json.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    try {
      return JSON.parse(json) as NfRawData;
    } catch {
      // Tenta extrair JSON com regex
      const match = json.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as NfRawData;
        } catch {
          this.logger.warn('Falha ao parsear JSON da IA. Resposta: ' + json.substring(0, 200));
        }
      }
      return {};
    }
  }

  // ─── Mapeamento de campos ─────────────────────────────────────────────────

  private mapearCampos(raw: NfRawData): CamposExtraidosNF {
    const dataEmissao = raw.data_emissao || null;
    const competencia = raw.competencia || (dataEmissao ? this.derivarCompetencia(dataEmissao) : null);
    const { inicio, fim } = competencia ? this.derivarPeriodo(competencia) : { inicio: null, fim: null };

    return {
      nota_fiscal_numero: raw.numero || null,
      nota_fiscal_valor: raw.valor_total ?? null,
      nota_fiscal_data: dataEmissao,
      cnpj_emitente: raw.cnpj_emitente || null,
      razao_social_emitente: raw.razao_social_emitente || null,
      competencia: competencia || null,
      periodo_inicio: inicio,
      periodo_fim: fim,
    };
  }

  // ─── Validações ───────────────────────────────────────────────────────────

  private gerarValidacoes(
    raw: NfRawData,
    fornecedorCnpj: string,
    saldoDisponivel: number | null,
  ): ValidacaoNF[] {
    const validacoes: ValidacaoNF[] = [];

    // Confirma campos preenchidos
    if (raw.numero) {
      validacoes.push({
        tipo: 'info',
        campo: 'nota_fiscal_numero',
        mensagem: `Número da NF preenchido automaticamente: ${raw.numero}`,
      });
    }

    if (raw.valor_total != null) {
      validacoes.push({
        tipo: 'info',
        campo: 'nota_fiscal_valor',
        mensagem: `Valor da NF: ${raw.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      });
    }

    // Valida CNPJ do emitente vs fornecedor logado
    if (raw.cnpj_emitente && fornecedorCnpj) {
      const cnpjNF = raw.cnpj_emitente.replace(/\D/g, '');
      const cnpjForn = fornecedorCnpj.replace(/\D/g, '');
      if (cnpjNF !== cnpjForn) {
        validacoes.push({
          tipo: 'warning',
          campo: 'cnpj_emitente',
          mensagem: `O CNPJ da NF (${this.formatarCnpj(cnpjNF)}) é diferente do seu CNPJ cadastrado (${this.formatarCnpj(cnpjForn)}). Verifique se é a nota correta.`,
        });
      }
    }

    // Valida valor vs saldo disponível
    if (raw.valor_total != null && saldoDisponivel != null && raw.valor_total > saldoDisponivel + 0.01) {
      validacoes.push({
        tipo: 'warning',
        campo: 'nota_fiscal_valor',
        mensagem: `O valor da NF (${raw.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) excede o saldo disponível do contrato (${saldoDisponivel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Verifique antes de enviar.`,
      });
    }

    if (validacoes.length === 0 || validacoes.every((v) => v.tipo === 'info')) {
      if (!raw.numero && !raw.valor_total) {
        validacoes.push({
          tipo: 'warning',
          campo: 'geral',
          mensagem: 'Não foi possível extrair os dados da nota. Verifique se o arquivo está legível.',
        });
      }
    }

    return validacoes;
  }

  // ─── Discriminações sugeridas ─────────────────────────────────────────────

  private sugerirDiscriminacoes(raw: NfRawData, valorTotal: number | null): DiscriminacaoSugerida[] {
    if (!raw.itens || raw.itens.length === 0 || !valorTotal || valorTotal <= 0) return [];

    // Agrupar itens em categorias se muitos
    if (raw.itens.length > 10) {
      // Muitos itens: retorna só o total como uma linha
      return [{ descricao: 'Serviços/Produtos conforme NF', valor: valorTotal, percentual: 100 }];
    }

    let totalItens = raw.itens.reduce((s, i) => s + (i.valor_total || 0), 0);
    if (totalItens <= 0) totalItens = valorTotal;

    const sugestoes: DiscriminacaoSugerida[] = raw.itens.map((item) => {
      const valor = item.valor_total || 0;
      const percentual = totalItens > 0 ? Math.round((valor / totalItens) * valorTotal * 100) / 100 : 0;
      return {
        descricao: item.descricao?.substring(0, 200) || 'Item sem descrição',
        valor: Math.round((valor / totalItens) * valorTotal * 100) / 100,
        percentual: Math.round((valor / totalItens) * 10000) / 100,
      };
    });

    // Ajustar arredondamento para o total bater exatamente
    const totalSug = sugestoes.reduce((s, d) => s + d.valor, 0);
    const diff = Math.round((valorTotal - totalSug) * 100) / 100;
    if (sugestoes.length > 0 && Math.abs(diff) > 0.001) {
      sugestoes[sugestoes.length - 1].valor = Math.round((sugestoes[sugestoes.length - 1].valor + diff) * 100) / 100;
    }

    return sugestoes;
  }

  // ─── Utilitários ──────────────────────────────────────────────────────────

  private normalizarData(data: string): string | null {
    if (!data) return null;
    // Formatos: "2026-03-15T00:00:00", "2026-03-15", "15/03/2026"
    if (/^\d{4}-\d{2}-\d{2}/.test(data)) return data.substring(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}/.test(data)) {
      const [d, m, y] = data.split('/');
      return `${y}-${m}-${d}`;
    }
    return null;
  }

  private derivarCompetencia(data: string): string | null {
    // Espera YYYY-MM-DD
    const match = data.match(/^(\d{4})-(\d{2})/);
    if (!match) return null;
    const ano = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const nomeMes = MESES_PT[mes];
    if (!nomeMes) return null;
    return `${nomeMes}/${ano}`;
  }

  private derivarPeriodo(competencia: string): { inicio: string | null; fim: string | null } {
    // Espera "MARÇO/2026"
    const mesNomes = Object.entries(MESES_PT);
    const match = competencia.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)\/(\d{4})$/i);
    if (!match) return { inicio: null, fim: null };

    const nomeMes = match[1].toUpperCase();
    const ano = parseInt(match[2]);
    const entrada = mesNomes.find(([, v]) => v === nomeMes);
    if (!entrada) return { inicio: null, fim: null };

    const mes = parseInt(entrada[0]);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const mesStr = String(mes).padStart(2, '0');
    return {
      inicio: `${ano}-${mesStr}-01`,
      fim: `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`,
    };
  }

  private formatarCnpj(cnpj: string): string {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
  }
}
