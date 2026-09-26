import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Licitacao } from './entities/licitacao.entity';
import { GeradorDocumentoService } from '../fase-interna/gerador-documento.service';
import { ConformidadeService } from '../fase-interna/conformidade/conformidade.service';
import { pecaContaComoPronta } from '../fase-interna/peca-regras';
import { TITULO_DOCUMENTO } from '../fase-interna/documentos-obrigatorios';
import { LicitacoesService } from './licitacoes.service';
import { estadoCompraPncp } from '../pncp/estado-compra-pncp';
import { basesDeLeitura, caminhoContido, diretorioDeGravacao, resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import {
  FaixaDeFolhas,
  LINHAS_INDICE_POR_PAGINA,
  carimboDeFolha,
  dataPorExtenso,
  impressaoDosAutos,
  numerarFolhas,
  ordenarPecasDosAutos,
  paginasDoIndice,
  posicaoDoCarimbo,
  quebrarLinhas,
  rotuloFaixa,
  textoSeguroPdf,
} from './autos/autos-regras';

/**
 * ============================================================================
 * AUTOS DO PROCESSO EM PDF (GET /licitacoes/:id/processo-pdf) — fase interna,
 * Entrega 6. Evolução do compilador que existia (não é outro).
 * ============================================================================
 *
 *  - CAPA (órgão, PA, dispensa/licitação, objeto, interessado, data), TERMO
 *    DE ABERTURA, ÍNDICE (peça, folhas, data do documento, origem, signatários,
 *    "substitui a versão X"), as PEÇAS na ORDEM LÓGICA dos autos
 *    (`autos/autos-regras.ts`), TERMO DE JUSTIFICATIVAS (achados justificados
 *    da conformidade — E4 — e peças "não se aplica"), REGISTRO DAS PUBLICAÇÕES
 *    (PNCP, Diário Oficial, sítio) e TERMO DE ENCERRAMENTO.
 *  - Peça ANEXADA entra com o PDF original (páginas reais); peça gerada, com o
 *    PDF gerado/assinado. Só a versão ATIVA; versões substituídas ficam fora.
 *  - CARIMBO "Fl. 000123" no canto superior direito de TODAS as folhas,
 *    numeração contínua. O PDF é a fonte das folhas: as peças recebem as
 *    folhas do PDF (idempotente — só grava o que mudou).
 *  - DESEMPENHO: montagem peça a peça (cada PDF lido do disco, copiado e
 *    liberado), um processo por vez (fila única), arquivo final em disco e
 *    servido por stream. CACHE pela impressão das peças: nada mudou → o PDF
 *    já gerado é servido sem regenerar. Geração em segundo plano
 *    (POST …/processo-pdf/gerar) com aviso ao usuário quando fica pronto.
 *  - Os autos completos são do ÓRGÃO DONO (@SomenteOrgao + dono no
 *    controller); não há versão pública dos autos.
 */

type Origem = 'GERADA' | 'ASSINADA' | 'ANEXADA' | 'DOCUMENTO' | 'TERMO';
const ROTULO_ORIGEM: Record<Origem, string> = {
  GERADA: 'Gerada no sistema',
  ASSINADA: 'Assinada no sistema',
  ANEXADA: 'Anexada (feita fora)',
  DOCUMENTO: 'Documento do processo',
  TERMO: 'Termo dos autos',
};

type Fonte =
  | { tipo: 'ARQUIVO'; caminho: string }
  | { tipo: 'GERAR_PECA'; documento_id: string }
  | { tipo: 'BUFFER'; gerar: () => Promise<Buffer> };

interface EntradaAutos {
  chave: string;
  ordem?: string | number | null;
  titulo: string;
  origem: Origem;
  data_documento: Date | null;
  signatarios: string[];
  observacao: string | null;
  documento_id: string | null;
  fonte: Fonte;
  /** Impressão do conteúdo (id, versão, arquivo/conteúdo, status). */
  impressao: string;
}

export interface EntradaIndice {
  titulo: string;
  folhas: string;
  folha_inicial: number;
  folha_final: number;
  data_documento: string | null;
  origem: string;
  signatarios: string[];
  observacao: string | null;
  documento_id: string | null;
}

export interface MetaAutos {
  hash: string;
  folhas: number;
  gerado_em: string;
  duracao_ms: number;
  indice: EntradaIndice[];
  ausentes: string[];
}

export type SituacaoAutos =
  | { situacao: 'PRONTO'; hash: string; folhas: number; gerado_em: string; indice: EntradaIndice[]; ausentes: string[] }
  | { situacao: 'GERANDO'; hash: string; iniciado_em: string; anterior: { gerado_em: string; folhas: number } | null }
  | { situacao: 'DESATUALIZADO' | 'NAO_GERADO'; hash: string; anterior: { gerado_em: string; folhas: number } | null; erro?: string | null };

const A4: [number, number] = [595.28, 841.89];
const AZUL = rgb(0.08, 0.15, 0.35);
const CINZA = rgb(0.4, 0.4, 0.4);
const fmtDia = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const fmtDataHora = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const ROTULO_MODALIDADE: Record<string, string> = {
  DISPENSA_ELETRONICA: 'Dispensa Eletrônica',
  INEXIGIBILIDADE: 'Inexigibilidade',
  PREGAO_ELETRONICO: 'Pregão Eletrônico',
  CONCORRENCIA: 'Concorrência',
  LEILAO: 'Leilão',
  CONCURSO: 'Concurso',
  DIALOGO_COMPETITIVO: 'Diálogo Competitivo',
  CREDENCIAMENTO: 'Credenciamento',
};

/** Documentos do processo (aba Documentos) da FASE EXTERNA que entram nos autos. */
const TIPOS_DOC_FASE_EXTERNA = [
  'IMPUGNACAO_RESPOSTA',
  'ESCLARECIMENTO',
  'ATA_SESSAO',
  'RELATORIO_JULGAMENTO',
  'MAPA_COMPARATIVO',
  'PARECER_HABILITACAO',
  'RECURSO',
  'CONTRARRAZOES',
  'DECISAO_RECURSO',
  'TERMO_ADJUDICACAO',
  'TERMO_HOMOLOGACAO',
  'ATA_REGISTRO_PRECO',
  'CONTRATO',
];
const TITULO_DOC_EXTERNO: Record<string, string> = {
  IMPUGNACAO_RESPOSTA: 'Resposta a impugnação',
  ESCLARECIMENTO: 'Esclarecimento',
  ATA_SESSAO: 'Ata da sessão',
  RELATORIO_JULGAMENTO: 'Relatório de julgamento',
  MAPA_COMPARATIVO: 'Mapa comparativo (classificação)',
  PARECER_HABILITACAO: 'Parecer de habilitação',
  RECURSO: 'Recurso',
  CONTRARRAZOES: 'Contrarrazões',
  DECISAO_RECURSO: 'Decisão do recurso',
  TERMO_ADJUDICACAO: 'Termo de adjudicação',
  TERMO_HOMOLOGACAO: 'Termo de homologação',
  ATA_REGISTRO_PRECO: 'Ata de registro de preços',
  CONTRATO: 'Contrato',
};

@Injectable()
export class ProcessoPdfService {
  private readonly logger = new Logger(ProcessoPdfService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  /** Fila ÚNICA de montagem (um processo por vez — memória do Node sob controle). */
  private fila: Promise<unknown> = Promise.resolve();
  /** Montagens em andamento por processo (coalescidas pela impressão). */
  private readonly emAndamento = new Map<string, { hash: string; iniciado_em: Date; promessa: Promise<MetaAutos> }>();
  private readonly ultimoErro = new Map<string, string>();

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly geradorDocumentoService: GeradorDocumentoService,
    private readonly licitacoesService: LicitacoesService,
    private readonly conformidade: ConformidadeService,
  ) {}

  // ==========================================================================
  // API do serviço
  // ==========================================================================

  /** Compatível com o uso antigo: gera (ou pega do cache) e devolve o PDF inteiro. */
  async gerarProcessoCompleto(licitacaoId: string): Promise<Buffer> {
    const { caminho } = await this.obterArquivo(licitacaoId);
    return fs.promises.readFile(caminho);
  }

  /** Caminho do PDF dos autos atualizado (do cache; se não houver, monta agora pela fila). */
  async obterArquivo(licitacaoId: string): Promise<{ caminho: string; meta: MetaAutos; nome: string }> {
    const lic = await this.carregarLicitacao(licitacaoId);
    const plano = await this.planejar(lic);
    let meta = this.lerMeta(licitacaoId, plano.hash);
    if (!meta) meta = await this.agendar(lic, plano, null);
    return { caminho: this.caminhoPdf(licitacaoId, plano.hash), meta, nome: `autos-${String(lic.numero_processo || licitacaoId).replace(/[^\w.-]+/g, '-')}.pdf` };
  }

  /** Situação para a tela: pronto (cache válido), gerando, desatualizado ou nunca gerado. */
  async situacao(licitacaoId: string): Promise<SituacaoAutos> {
    const lic = await this.carregarLicitacao(licitacaoId);
    const plano = await this.planejar(lic);
    const meta = this.lerMeta(licitacaoId, plano.hash);
    if (meta) return { situacao: 'PRONTO', hash: plano.hash, folhas: meta.folhas, gerado_em: meta.gerado_em, indice: meta.indice, ausentes: meta.ausentes };
    const anterior = this.ultimaMeta(licitacaoId);
    const resumoAnterior = anterior ? { gerado_em: anterior.gerado_em, folhas: anterior.folhas } : null;
    const andando = this.emAndamento.get(licitacaoId);
    if (andando && andando.hash === plano.hash) {
      return { situacao: 'GERANDO', hash: plano.hash, iniciado_em: andando.iniciado_em.toISOString(), anterior: resumoAnterior };
    }
    return { situacao: anterior ? 'DESATUALIZADO' : 'NAO_GERADO', hash: plano.hash, anterior: resumoAnterior, erro: this.ultimoErro.get(licitacaoId) ?? null };
  }

  /**
   * "Gerar autos (PDF)": se o cache vale, PRONTO na hora; senão a montagem vai
   * para a fila em SEGUNDO PLANO e o usuário é avisado (notificação) quando
   * ficar pronta. Devolve a situação.
   */
  async solicitar(licitacaoId: string, solicitante: { usuario_id: string | null; orgao_id: string | null }): Promise<SituacaoAutos> {
    const lic = await this.carregarLicitacao(licitacaoId);
    const plano = await this.planejar(lic);
    if (!this.lerMeta(licitacaoId, plano.hash)) {
      void this.agendar(lic, plano, solicitante).catch(() => undefined);
    }
    return this.situacao(licitacaoId);
  }

  // ==========================================================================
  // Fila e cache
  // ==========================================================================

  private pasta(licitacaoId: string): string {
    return path.join(diretorioDeGravacao('licitacoes'), licitacaoId, 'autos');
  }
  private caminhoPdf(licitacaoId: string, hash: string): string {
    return path.join(this.pasta(licitacaoId), `autos-${hash.slice(0, 32)}.pdf`);
  }
  private caminhoMeta(licitacaoId: string, hash: string): string {
    return path.join(this.pasta(licitacaoId), `autos-${hash.slice(0, 32)}.json`);
  }

  private lerMeta(licitacaoId: string, hash: string): MetaAutos | null {
    try {
      const pdf = this.caminhoPdf(licitacaoId, hash);
      const metaArq = this.caminhoMeta(licitacaoId, hash);
      if (!fs.existsSync(pdf) || !fs.existsSync(metaArq)) return null;
      const meta = JSON.parse(fs.readFileSync(metaArq, 'utf8')) as MetaAutos;
      return meta.hash === hash ? meta : null;
    } catch {
      return null;
    }
  }

  /** Última montagem guardada (qualquer impressão) — para "desatualizado". */
  private ultimaMeta(licitacaoId: string): MetaAutos | null {
    try {
      const dir = this.pasta(licitacaoId);
      if (!fs.existsSync(dir)) return null;
      const metas = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as MetaAutos)
        .sort((a, b) => String(b.gerado_em).localeCompare(String(a.gerado_em)));
      return metas[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Coloca a montagem na fila única (coalescida por processo e impressão). */
  private agendar(
    lic: Licitacao & { orgao?: any },
    plano: { hash: string; entradas: EntradaAutos[]; extras: ExtrasAutos },
    solicitante: { usuario_id: string | null; orgao_id: string | null } | null,
  ): Promise<MetaAutos> {
    const atual = this.emAndamento.get(lic.id);
    if (atual && atual.hash === plano.hash) return atual.promessa;
    const inicio = new Date();
    const promessa = this.fila
      .catch(() => undefined)
      .then(async () => {
        const pronta = this.lerMeta(lic.id, plano.hash);
        if (pronta) return pronta;
        const meta = await this.montar(lic, plano);
        this.ultimoErro.delete(lic.id);
        if (solicitante) await this.avisarPronto(lic, meta, solicitante);
        return meta;
      })
      .catch((e: any) => {
        this.ultimoErro.set(lic.id, String(e?.message ?? e).slice(0, 300));
        this.logger.error(`[autos] Processo ${lic.numero_processo}: falha na montagem — ${e?.message ?? e}`);
        throw e;
      })
      .finally(() => {
        if (this.emAndamento.get(lic.id)?.promessa === promessa) this.emAndamento.delete(lic.id);
      });
    this.fila = promessa.catch(() => undefined);
    this.emAndamento.set(lic.id, { hash: plano.hash, iniciado_em: inicio, promessa });
    return promessa;
  }

  /** Aviso "autos prontos" (notificação do sistema) para quem pediu em segundo plano. */
  private async avisarPronto(lic: Licitacao, meta: MetaAutos, s: { usuario_id: string | null; orgao_id: string | null }) {
    const destinatario = s.usuario_id ?? s.orgao_id ?? lic.orgao_id ?? null;
    if (!destinatario || !lic.orgao_id) return;
    try {
      await this.dataSource.query(
        `INSERT INTO notificacoes (id, orgao_id, usuario_id, tipo, titulo, mensagem, prioridade, entidade_tipo, entidade_id, link, lida, email_enviado, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'SISTEMA', $3, $4, 'NORMAL', 'LICITACAO', $5, $6, false, false, NOW(), NOW())`,
        [
          lic.orgao_id,
          destinatario,
          `Autos em PDF prontos — ${lic.numero_processo ?? ''}`.trim(),
          `Os autos do processo ${lic.numero_processo ?? ''} foram montados: ${meta.folhas} folhas numeradas.`,
          lic.id,
          `/orgao/processos/${lic.id}?autos=pronto`,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`[autos] aviso de autos prontos não gravado: ${e?.message ?? e}`);
    }
  }

  // ==========================================================================
  // Plano: o que entra nos autos (só metadados — nenhum PDF é lido aqui)
  // ==========================================================================

  private async carregarLicitacao(licitacaoId: string): Promise<Licitacao & { orgao?: any }> {
    const licitacao = await this.licitacaoRepository.findOne({ where: { id: licitacaoId }, relations: ['orgao'] });
    if (!licitacao) throw new NotFoundException('Processo não encontrado');
    return licitacao as any;
  }

  private caminhoFisico(ref: string | null | undefined): string | null {
    if (!ref) return null;
    const porUrl = resolverArquivoDeUrl(ref);
    if (porUrl && fs.existsSync(porUrl)) return porUrl;
    if (path.isAbsolute(ref) && fs.existsSync(ref)) {
      const abs = path.resolve(ref);
      const bases = [...basesDeLeitura(), path.resolve(this.uploadDir), path.resolve(process.cwd(), 'uploads')];
      if (bases.some((b) => !path.relative(b, abs).startsWith('..'))) return abs;
    }
    for (const base of [...basesDeLeitura(), path.resolve(this.uploadDir), path.resolve(process.cwd(), 'uploads')]) {
      const c = caminhoContido(base, ref);
      if (c && fs.existsSync(c)) return c;
    }
    return null;
  }

  private async planejar(lic: Licitacao & { orgao?: any }): Promise<{ hash: string; entradas: EntradaAutos[]; extras: ExtrasAutos }> {
    const id = lic.id;
    const entradas: EntradaAutos[] = [];
    const ausentes: string[] = [];
    const naoSeAplica: Array<{ titulo: string; justificativa: string; por: string | null }> = [];

    // ── 1. Peças da fase interna (e as da publicação/fase externa que vivem lá: PDO, PJE) — só a versão ATIVA
    const docs: any[] = await this.dataSource.query(
      `SELECT id::text AS id, tipo::text AS tipo, titulo, status::text AS status, origem::text AS origem, versao,
              versao_anterior_id::text AS versao_anterior_id, caminho_arquivo, arquivo_pdf_path, hash_arquivo,
              data_documento, data_geracao_arquivo, updated_at, numero_peca, assinaturas, signatarios_informados,
              descricao, dados_estruturados, aprovador_nome, md5(COALESCE(descricao, '') || COALESCE(dados_estruturados::text, '')) AS conteudo
         FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND versao_atual = true AND status::text <> 'SUBSTITUIDO'`,
      [id],
    );
    const caminhosUsados = new Set<string>();
    for (const d of docs) {
      const dados = d.dados_estruturados ?? {};
      const titulo = TITULO_DOCUMENTO[d.tipo as keyof typeof TITULO_DOCUMENTO] ?? d.titulo ?? d.tipo;
      if (dados?.nao_se_aplica) {
        naoSeAplica.push({ titulo, justificativa: String(dados.justificativa_nao_se_aplica ?? d.descricao ?? '').trim(), por: d.aprovador_nome ?? null });
        continue;
      }
      if (!pecaContaComoPronta(d)) continue; // ainda não é ato (em elaboração, aguardando assinatura…)
      const signatarios = this.signatariosDe(d);
      const obs = [d.numero_peca, Number(d.versao) > 1 ? `substitui a versão ${Number(d.versao) - 1}` : null].filter(Boolean).join(' · ') || null;
      const base = { chave: d.tipo, titulo, signatarios, observacao: obs, documento_id: d.id, data_documento: d.data_documento ? new Date(d.data_documento) : null };
      const anexada = d.origem !== 'INTERNO';
      const proprio = anexada || d.status === 'ASSINADO' ? this.caminhoFisico(d.caminho_arquivo) : null;
      if (proprio) {
        caminhosUsados.add(proprio);
        entradas.push({ ...base, origem: anexada ? 'ANEXADA' : 'ASSINADA', fonte: { tipo: 'ARQUIVO', caminho: proprio }, impressao: `${d.id}:${d.versao}:${d.status}:${d.hash_arquivo ?? d.caminho_arquivo}` });
        continue;
      }
      if (anexada && !d.caminho_arquivo) continue; // registro sem arquivo (ex.: Diário Oficial sem a página) → vai no registro das publicações
      // Peça feita aqui: o PDF gerado (reaproveitado se o conteúdo não mudou depois)
      const gerado = this.caminhoFisico(d.arquivo_pdf_path);
      const fresco =
        gerado &&
        (['PP', 'MCP'].includes(d.tipo) ||
          (d.data_geracao_arquivo && new Date(d.updated_at).getTime() <= new Date(d.data_geracao_arquivo).getTime() + 5_000));
      if (d.tipo === 'MCP' && gerado && caminhosUsados.has(gerado)) continue; // mapa já está na pesquisa
      if (gerado) caminhosUsados.add(gerado);
      entradas.push({
        ...base,
        origem: 'GERADA',
        fonte: fresco ? { tipo: 'ARQUIVO', caminho: gerado! } : { tipo: 'GERAR_PECA', documento_id: d.id },
        impressao: `${d.id}:${d.versao}:${d.status}:${d.conteudo}${['PP', 'MCP'].includes(d.tipo) ? `:${d.arquivo_pdf_path}` : ''}`,
      });
      // Pesquisa de preços: a CERTIDÃO (art. 23) logo depois do mapa
      if (d.tipo === 'PP' && dados?.certidao?.path) {
        const certidao = this.caminhoFisico(dados.certidao.path);
        if (certidao && certidao.toLowerCase().endsWith('.pdf')) {
          entradas.push({
            chave: 'PP_CERTIDAO',
            titulo: 'Certidão da pesquisa de preços',
            origem: 'GERADA',
            data_documento: dados.certidao.gerada_em ? new Date(dados.certidao.gerada_em) : null,
            signatarios: dados.responsavel_pesquisa?.nome ? [dados.responsavel_pesquisa.nome] : [],
            observacao: null,
            documento_id: null,
            fonte: { tipo: 'ARQUIVO', caminho: certidao },
            impressao: `certidao:${dados.certidao.path}:${dados.certidao.gerada_em}`,
          });
        }
      }
    }

    // ── 2. Termo de justificativas (achados justificados — E4 — e peças "não se aplica")
    const justificativas = await this.conformidade.justificativasParaAutos(id).catch(() => [] as any[]);
    if (justificativas.length || naoSeAplica.length) {
      entradas.push({
        chave: 'TERMO_JUSTIFICATIVAS',
        titulo: 'Termo de justificativas (conformidade e peças dispensadas)',
        origem: 'TERMO',
        data_documento: null,
        signatarios: [],
        observacao: `${justificativas.length} achado(s) justificado(s) · ${naoSeAplica.length} peça(s) "não se aplica"`,
        documento_id: null,
        fonte: { tipo: 'BUFFER', gerar: () => this.pdfTermoJustificativas(lic, justificativas, naoSeAplica) },
        impressao: `just:${JSON.stringify(justificativas.map((j: any) => [j.regra, j.justificativa, j.justificado_em]))}:${JSON.stringify(naoSeAplica)}`,
      });
    }

    // ── 3. Publicação: aviso/edital publicado + registro das publicações (PNCP, Diário Oficial, sítio)
    const publicado = !['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA'].includes(String(lic.fase));
    if (publicado) {
      const [aviso] = await this.dataSource.query(
        `SELECT id::text AS id, tipo::text AS tipo, versao, caminho_arquivo, hash_arquivo, data_publicacao, titulo
           FROM documentos_licitacao
          WHERE licitacao_id::text = $1 AND tipo::text IN ('AVISO_LICITACAO','EDITAL','EDITAL_RETIFICADO') AND status::text = 'PUBLICADO'
          ORDER BY versao DESC, created_at DESC LIMIT 1`,
        [id],
      );
      const arqAviso = aviso ? this.caminhoFisico(aviso.caminho_arquivo) : null;
      if (aviso && arqAviso) {
        entradas.push({
          chave: 'AVISO_PUBLICADO',
          titulo: aviso.tipo === 'AVISO_LICITACAO' ? `Aviso de contratação direta publicado (v${aviso.versao})` : `Edital publicado (v${aviso.versao})`,
          origem: 'DOCUMENTO',
          data_documento: aviso.data_publicacao ? new Date(aviso.data_publicacao) : null,
          signatarios: [],
          observacao: null,
          documento_id: null,
          fonte: { tipo: 'ARQUIVO', caminho: arqAviso },
          impressao: `aviso:${aviso.id}:${aviso.hash_arquivo}`,
        });
      } else if (publicado) {
        ausentes.push('Aviso/edital publicado (arquivo não encontrado)');
      }
      const pncp: any[] = await this.dataSource.query(
        `SELECT tipo::text AS tipo, numero_controle_pncp, COALESCE(enviado_em, updated_at) AS em
           FROM pncp_sync WHERE licitacao_id::text = $1 AND status::text = 'ENVIADO' ORDER BY created_at ASC`,
        [id],
      );
      const dos: any[] = await this.dataSource.query(
        `SELECT numero_peca, dados_estruturados->'_diario_oficial' AS d, versao FROM documentos_fase_interna
          WHERE licitacao_id::text = $1 AND tipo::text = 'PDO' AND versao_atual = true`,
        [id],
      );
      const link = (await estadoCompraPncp(this.dataSource.manager, [id]).catch(() => new Map())).get(id)?.link_pncp ?? (lic as any).link_pncp ?? null;
      entradas.push({
        chave: 'REGISTRO_PUBLICACOES',
        titulo: 'Registro das publicações (PNCP, Diário Oficial e sítio oficial)',
        origem: 'TERMO',
        data_documento: (lic as any).data_divulgacao_oficial ? new Date((lic as any).data_divulgacao_oficial) : null,
        signatarios: [],
        observacao: (lic as any).meio_divulgacao_oficial ? `Divulgação oficial: ${(lic as any).meio_divulgacao_oficial === 'DIARIO_OFICIAL' ? 'Diário Oficial' : 'PNCP'}` : null,
        documento_id: null,
        fonte: { tipo: 'BUFFER', gerar: () => this.pdfRegistroPublicacoes(lic, pncp, dos, link) },
        impressao: `pub:${(lic as any).data_divulgacao_oficial}:${(lic as any).referencia_divulgacao_oficial}:${JSON.stringify(pncp.map((p) => [p.tipo, p.numero_controle_pncp]))}:${JSON.stringify(dos)}:${link}`,
      });
    }

    // ── 4. Fase externa: ata da dispensa (depois do julgamento), documentos do processo, contratos
    const ehDispensa = String(lic.modalidade) === 'DISPENSA_ELETRONICA';
    if (ehDispensa && (lic as any).data_adjudicacao) {
      const [{ n_lances, n_eventos }] = await this.dataSource.query(
        `SELECT (SELECT COUNT(*)::int FROM lances WHERE licitacao_id::text = $1) AS n_lances,
                (SELECT COUNT(*)::int FROM eventos_sessao e JOIN sessoes_disputa s ON s.id = e.sessao_id WHERE s.licitacao_id::text = $1) AS n_eventos`,
        [id],
      );
      entradas.push({
        chave: 'ATA_SESSAO',
        ordem: '0',
        titulo: 'Ata da sessão da dispensa eletrônica',
        origem: 'GERADA',
        data_documento: new Date((lic as any).data_adjudicacao),
        signatarios: [],
        observacao: null,
        documento_id: null,
        fonte: { tipo: 'BUFFER', gerar: () => this.licitacoesService.gerarAtaDispensa(id, true) },
        impressao: `ata:${(lic as any).data_adjudicacao}:${(lic as any).data_homologacao}:${n_lances}:${n_eventos}`,
      });
    }
    const docsExternos: any[] = publicado
      ? await this.dataSource.query(
          `SELECT id::text AS id, tipo::text AS tipo, titulo, versao, caminho_arquivo, hash_arquivo, data_documento, created_at
             FROM documentos_licitacao
            WHERE licitacao_id::text = $1 AND tipo::text = ANY($2::text[]) AND status::text NOT IN ('RASCUNHO','SUBSTITUIDO','REVOGADO')
            ORDER BY created_at ASC`,
          [id, TIPOS_DOC_FASE_EXTERNA],
        )
      : [];
    for (const d of docsExternos) {
      const arq = this.caminhoFisico(d.caminho_arquivo);
      if (!arq || !arq.toLowerCase().endsWith('.pdf')) continue;
      entradas.push({
        chave: d.tipo,
        ordem: new Date(d.created_at).toISOString(),
        titulo: d.titulo || TITULO_DOC_EXTERNO[d.tipo] || d.tipo,
        origem: 'DOCUMENTO',
        data_documento: d.data_documento ? new Date(d.data_documento) : null,
        signatarios: [],
        observacao: Number(d.versao) > 1 ? `substitui a versão ${Number(d.versao) - 1}` : null,
        documento_id: null,
        fonte: { tipo: 'ARQUIVO', caminho: arq },
        impressao: `doc:${d.id}:${d.hash_arquivo ?? d.caminho_arquivo}`,
      });
    }
    const contratos: any[] = await this.dataSource.query(
      `SELECT c.id::text AS id, c.numero_contrato, c.arquivo_contrato, c.data_assinatura, c.updated_at, da.status AS assinatura_status
         FROM contratos c LEFT JOIN documentos_assinatura da ON da.id = c.documento_assinatura_id
        WHERE c.licitacao_id::text = $1 ORDER BY c.numero_contrato ASC`,
      [id],
    );
    for (const c of contratos) {
      const arq = c.arquivo_contrato ? this.caminhoFisico(c.arquivo_contrato) ?? (fs.existsSync(path.join(this.uploadDir, c.arquivo_contrato)) ? path.join(this.uploadDir, c.arquivo_contrato) : null) : null;
      if (!arq) {
        ausentes.push(`Termo do contrato ${c.numero_contrato} (${c.arquivo_contrato ? 'arquivo não encontrado' : 'não gerado'})`);
        continue;
      }
      entradas.push({
        chave: 'CONTRATO',
        ordem: String(c.numero_contrato ?? ''),
        titulo: `Termo de contrato ${c.numero_contrato}${c.assinatura_status === 'CONCLUIDO' ? ' (assinado eletronicamente)' : ''}`,
        origem: 'DOCUMENTO',
        data_documento: c.data_assinatura ? new Date(c.data_assinatura) : null,
        signatarios: [],
        observacao: null,
        documento_id: null,
        fonte: { tipo: 'ARQUIVO', caminho: arq },
        impressao: `contrato:${c.id}:${c.arquivo_contrato}:${c.assinatura_status}`,
      });
    }

    const ordenadas = ordenarPecasDosAutos(entradas);
    const extras: ExtrasAutos = { ausentes, interessado: await this.interessado(lic) };
    const hash = impressaoDosAutos({
      processo: [lic.numero_processo, lic.numero_edital, lic.objeto, lic.modalidade, (lic as any).created_at, (lic as any).orgao?.nome, extras.interessado],
      pecas: ordenadas.map((e) => [e.chave, e.titulo, e.origem, e.data_documento, e.signatarios, e.observacao, e.impressao]),
      ausentes,
    });
    return { hash, entradas: ordenadas, extras };
  }

  private signatariosDe(d: any): string[] {
    const ass = Array.isArray(d.assinaturas) ? d.assinaturas : [];
    if (ass.length) return ass.map((a: any) => [a.assinante_nome, a.assinante_cargo].filter(Boolean).join(' — ')).filter(Boolean);
    const inf = Array.isArray(d.signatarios_informados) ? d.signatarios_informados : [];
    return inf.map((s: any) => [s.nome, s.cargo].filter(Boolean).join(' — ')).filter(Boolean);
  }

  /** Interessado da capa: a unidade requisitante do DFD, senão a da demanda, senão a unidade compradora. */
  private async interessado(lic: Licitacao & { orgao?: any }): Promise<string> {
    const [dfd] = await this.dataSource.query(
      `SELECT dados_estruturados->'_dfd'->>'unidade_requisitante_nome' AS unidade FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND tipo::text = 'DFD' AND versao_atual = true LIMIT 1`,
      [lic.id],
    );
    if (dfd?.unidade) return dfd.unidade;
    if ((lic as any).demanda_id) {
      const [dem] = await this.dataSource.query(`SELECT unidade_requisitante FROM demandas WHERE id::text = $1`, [(lic as any).demanda_id]).catch(() => []);
      if (dem?.unidade_requisitante) return dem.unidade_requisitante;
    }
    return (lic as any).nome_unidade_compradora || lic.orgao?.nome || '—';
  }

  // ==========================================================================
  // Montagem (peça a peça, na fila)
  // ==========================================================================

  private async montar(lic: Licitacao & { orgao?: any }, plano: { hash: string; entradas: EntradaAutos[]; extras: ExtrasAutos }): Promise<MetaAutos> {
    const t0 = Date.now();
    const ausentes = [...plano.extras.ausentes];
    const tmp = path.join(this.pasta(lic.id), `tmp-${randomUUID()}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      // PASSO 1 — materializa cada peça em arquivo e conta as páginas (uma por vez)
      const prontas: Array<{ e: EntradaAutos; caminho: string; paginas: number }> = [];
      for (const e of plano.entradas) {
        try {
          let caminho: string;
          if (e.fonte.tipo === 'ARQUIVO') caminho = e.fonte.caminho;
          else if (e.fonte.tipo === 'GERAR_PECA') caminho = (await this.geradorDocumentoService.gerarPdf(e.fonte.documento_id)).caminho;
          else {
            caminho = path.join(tmp, `${prontas.length}-${e.chave}.pdf`);
            fs.writeFileSync(caminho, await e.fonte.gerar());
          }
          const doc = await PDFDocument.load(await fs.promises.readFile(caminho), { ignoreEncryption: true, updateMetadata: false });
          prontas.push({ e, caminho, paginas: Math.max(1, doc.getPageCount()) });
        } catch (err: any) {
          this.logger.warn(`[autos] peça "${e.titulo}" fora dos autos: ${err?.message ?? err}`);
          ausentes.push(`${e.titulo} (arquivo ilegível ou indisponível)`);
        }
      }

      // Numeração contínua: capa, termo de abertura, índice, peças, termo de encerramento
      const folhasIndice = paginasDoIndice(prontas.length + 1);
      const inicioPecas = 2 + folhasIndice + 1;
      const faixas = numerarFolhas(prontas.map((p) => p.paginas), inicioPecas);
      const folhaEncerramento = (faixas.length ? faixas[faixas.length - 1].folha_final : inicioPecas - 1) + 1;
      const total = folhaEncerramento;
      const indice: EntradaIndice[] = prontas.map((p, i) => ({
        titulo: p.e.titulo,
        folhas: rotuloFaixa(faixas[i]),
        folha_inicial: faixas[i].folha_inicial,
        folha_final: faixas[i].folha_final,
        data_documento: p.e.data_documento ? p.e.data_documento.toISOString() : null,
        origem: ROTULO_ORIGEM[p.e.origem],
        signatarios: p.e.signatarios,
        observacao: p.e.observacao,
        documento_id: p.e.documento_id,
      }));

      // PASSO 2 — monta: termos + peças copiadas uma a uma, carimbando cada folha
      const merged = await PDFDocument.create();
      merged.setTitle(textoSeguroPdf(`Autos do Processo ${lic.numero_processo ?? ''}`));
      merged.setProducer('Portal DCP');
      const fonte = await merged.embedFont(StandardFonts.Helvetica);
      const negrito = await merged.embedFont(StandardFonts.HelveticaBold);
      let folha = 0;
      const carimbar = (pg: PDFPage) => {
        folha++;
        this.carimbar(pg, folha, negrito);
      };
      carimbar(this.paginaCapa(merged, lic, plano.extras.interessado, total, fonte, negrito));
      carimbar(this.paginaTermoAbertura(merged, lic, fonte, negrito));
      for (const pg of this.paginasIndice(merged, lic, indice, folhaEncerramento, folhasIndice, fonte, negrito)) carimbar(pg);
      for (const p of prontas) {
        const origem = await PDFDocument.load(await fs.promises.readFile(p.caminho), { ignoreEncryption: true, updateMetadata: false });
        const copiadas = await merged.copyPages(origem, origem.getPageIndices());
        for (const pg of copiadas) carimbar(merged.addPage(pg));
      }
      carimbar(this.paginaTermoEncerramento(merged, lic, total, plano.hash, ausentes, fonte, negrito));

      const bytes = await merged.save({ objectsPerTick: 50 });
      fs.mkdirSync(this.pasta(lic.id), { recursive: true });
      const destino = this.caminhoPdf(lic.id, plano.hash);
      await fs.promises.writeFile(`${destino}.parcial`, bytes);
      await fs.promises.rename(`${destino}.parcial`, destino);
      const meta: MetaAutos = { hash: plano.hash, folhas: total, gerado_em: new Date().toISOString(), duracao_ms: Date.now() - t0, indice, ausentes };
      await fs.promises.writeFile(this.caminhoMeta(lic.id, plano.hash), JSON.stringify(meta));
      await this.limparAntigos(lic.id, plano.hash);
      await this.gravarFolhasNasPecas(indice);
      this.logger.log(`[autos] Processo ${lic.numero_processo}: ${prontas.length} peça(s), ${total} folha(s), ${ausentes.length} ausente(s), ${meta.duracao_ms} ms`);
      return meta;
    } finally {
      fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Remove montagens de impressões antigas (fica só a atual). */
  private async limparAntigos(licitacaoId: string, hash: string) {
    const dir = this.pasta(licitacaoId);
    const manter = new Set([path.basename(this.caminhoPdf(licitacaoId, hash)), path.basename(this.caminhoMeta(licitacaoId, hash))]);
    for (const f of await fs.promises.readdir(dir).catch(() => [] as string[])) {
      if (/^autos-.*\.(pdf|json)$/.test(f) && !manter.has(f)) await fs.promises.rm(path.join(dir, f), { force: true }).catch(() => undefined);
    }
  }

  /**
   * O PDF é a fonte das folhas: a peça ativa recebe a faixa do PDF (só grava o
   * que mudou — idempotente; SQL direto, sem mexer em updated_at nem disparar
   * as rotinas de gravação de peça).
   */
  private async gravarFolhasNasPecas(indice: EntradaIndice[]) {
    for (const e of indice) {
      if (!e.documento_id) continue;
      await this.dataSource
        .query(
          `UPDATE documentos_fase_interna SET folha_inicial = $2, folha_final = $3, total_paginas = $4
            WHERE id::text = $1 AND (folha_inicial IS DISTINCT FROM $2 OR folha_final IS DISTINCT FROM $3 OR total_paginas IS DISTINCT FROM $4)`,
          [e.documento_id, e.folha_inicial, e.folha_final, e.folha_final - e.folha_inicial + 1],
        )
        .catch((err: any) => this.logger.warn(`[autos] folhas da peça ${e.documento_id} não gravadas: ${err?.message ?? err}`));
    }
  }

  // ==========================================================================
  // Desenho: carimbo, capa, termos e índice
  // ==========================================================================

  private carimbar(pg: PDFPage, folha: number, fonte: PDFFont) {
    const texto = carimboDeFolha(folha);
    const tamanho = 9;
    const largura = fonte.widthOfTextAtSize(texto, tamanho);
    const caixa = pg.getCropBox();
    const pos = posicaoDoCarimbo(caixa, pg.getRotation().angle, largura, tamanho);
    pg.drawText(texto, { x: pos.x, y: pos.y, size: tamanho, font: fonte, color: rgb(0.1, 0.1, 0.1), rotate: degrees(pos.angulo) });
  }

  private escritor(pg: PDFPage, fonte: PDFFont, negrito: PDFFont) {
    const [w] = [pg.getWidth()];
    return {
      centro: (texto: string, y: number, size: number, bold = false, cor = AZUL) => {
        const f = bold ? negrito : fonte;
        const t = textoSeguroPdf(texto);
        pg.drawText(t, { x: Math.max(40, (w - f.widthOfTextAtSize(t, size)) / 2), y, size, font: f, color: cor });
      },
      paragrafo: (texto: string, x: number, y: number, largura: number, size: number, bold = false, cor = rgb(0, 0, 0), entre = 1.45): number => {
        const f = bold ? negrito : fonte;
        let yy = y;
        for (const linha of quebrarLinhas(texto, largura, (s) => f.widthOfTextAtSize(s, size))) {
          pg.drawText(linha, { x, y: yy, size, font: f, color: cor });
          yy -= size * entre;
        }
        return yy;
      },
    };
  }

  private rotuloModalidade(lic: Licitacao): string {
    return ROTULO_MODALIDADE[String(lic.modalidade)] ?? String(lic.modalidade || '').replaceAll('_', ' ');
  }

  private paginaCapa(doc: PDFDocument, lic: Licitacao & { orgao?: any }, interessado: string, total: number, fonte: PDFFont, negrito: PDFFont): PDFPage {
    const pg = doc.addPage(A4);
    const [, h] = A4;
    const w = this.escritor(pg, fonte, negrito);
    w.centro(String(lic.orgao?.nome || 'ÓRGÃO').toUpperCase(), h - 130, 14, true);
    w.centro('AUTOS DO PROCESSO ADMINISTRATIVO', h - 190, 18, true);
    w.centro(`Processo Administrativo nº ${lic.numero_processo ?? '—'}`, h - 230, 14);
    w.centro(`${this.rotuloModalidade(lic)} nº ${lic.numero_edital || '(a atribuir)'}`, h - 255, 13);
    pg.drawText('OBJETO', { x: 70, y: h - 320, size: 10, font: negrito, color: AZUL });
    let y = w.paragrafo(String(lic.objeto || '—'), 70, h - 338, A4[0] - 140, 11);
    y -= 14;
    pg.drawText('INTERESSADO', { x: 70, y, size: 10, font: negrito, color: AZUL });
    y = w.paragrafo(interessado, 70, y - 18, A4[0] - 140, 11);
    y -= 14;
    pg.drawText('AUTUAÇÃO', { x: 70, y, size: 10, font: negrito, color: AZUL });
    pg.drawText(textoSeguroPdf(fmtDia((lic as any).created_at)), { x: 70, y: y - 18, size: 11, font: fonte });
    w.centro(`Autos com ${total} folhas numeradas — montados pelo Portal DCP em ${fmtDataHora(new Date())}`, 100, 9, false, CINZA);
    w.centro('Lei nº 14.133/2021', 80, 10, true);
    return pg;
  }

  private paginaTermoAbertura(doc: PDFDocument, lic: Licitacao, fonte: PDFFont, negrito: PDFFont): PDFPage {
    const pg = doc.addPage(A4);
    const [, h] = A4;
    const w = this.escritor(pg, fonte, negrito);
    w.centro('TERMO DE ABERTURA', h - 120, 15, true);
    const autuacao = (lic as any).created_at ? new Date((lic as any).created_at) : new Date();
    w.paragrafo(
      `Aos ${dataPorExtenso(autuacao)}, autuei o presente Processo Administrativo nº ${lic.numero_processo ?? '—'}, referente à ${this.rotuloModalidade(lic)} nº ${
        lic.numero_edital || '(a atribuir)'
      }, cujo objeto é ${String(lic.objeto || '—')}, que se inicia com a folha ${carimboDeFolha(1).replace('Fl. ', '')} (capa), seguida deste termo e do índice das peças.`,
      80,
      h - 180,
      A4[0] - 160,
      11.5,
    );
    w.centro('Setor de Licitações / Agente de contratação', h - 360, 10, false, CINZA);
    return pg;
  }

  private paginasIndice(
    doc: PDFDocument,
    lic: Licitacao,
    indice: EntradaIndice[],
    folhaEncerramento: number,
    folhasIndice: number,
    fonte: PDFFont,
    negrito: PDFFont,
  ): PDFPage[] {
    const linhas: EntradaIndice[] = [
      ...indice,
      {
        titulo: 'Termo de encerramento',
        folhas: String(folhaEncerramento),
        folha_inicial: folhaEncerramento,
        folha_final: folhaEncerramento,
        data_documento: null,
        origem: ROTULO_ORIGEM.TERMO,
        signatarios: [],
        observacao: null,
        documento_id: null,
      },
    ];
    const paginas: PDFPage[] = [];
    const [largura, h] = A4;
    const colunas = { peca: 40, folhas: 262, data: 318, origem: 374, sign: 452 };
    for (let p = 0; p < folhasIndice; p++) {
      const pg = doc.addPage(A4);
      paginas.push(pg);
      const w = this.escritor(pg, fonte, negrito);
      w.centro(`ÍNDICE DOS AUTOS — Processo ${lic.numero_processo ?? ''}${folhasIndice > 1 ? ` (${p + 1}/${folhasIndice})` : ''}`, h - 60, 12, true);
      let y = h - 92;
      const cab = (t: string, x: number) => pg.drawText(t, { x, y, size: 8, font: negrito, color: AZUL });
      cab('Peça', colunas.peca);
      cab('Folhas', colunas.folhas);
      cab('Data', colunas.data);
      cab('Origem', colunas.origem);
      cab('Signatários', colunas.sign);
      y -= 6;
      pg.drawLine({ start: { x: 40, y }, end: { x: largura - 40, y }, thickness: 0.5, color: CINZA });
      y -= 12;
      for (const e of linhas.slice(p * LINHAS_INDICE_POR_PAGINA, (p + 1) * LINHAS_INDICE_POR_PAGINA)) {
        const corta = (t: string, max: number, f: PDFFont = fonte, size = 8) => {
          let s = textoSeguroPdf(t);
          while (s.length > 1 && f.widthOfTextAtSize(s, size) > max) s = s.slice(0, -2) + '…';
          return s;
        };
        pg.drawText(corta(e.titulo, colunas.folhas - colunas.peca - 6), { x: colunas.peca, y, size: 8, font: fonte });
        pg.drawText(textoSeguroPdf(e.folhas), { x: colunas.folhas, y, size: 8, font: negrito });
        pg.drawText(e.data_documento ? fmtDia(e.data_documento) : '—', { x: colunas.data, y, size: 8, font: fonte });
        pg.drawText(corta(e.origem, colunas.sign - colunas.origem - 4), { x: colunas.origem, y, size: 8, font: fonte });
        pg.drawText(corta(e.signatarios.join('; ') || '—', largura - 40 - colunas.sign), { x: colunas.sign, y, size: 8, font: fonte });
        if (e.observacao) pg.drawText(corta(e.observacao, largura - 80, fonte, 7), { x: colunas.peca + 8, y: y - 9, size: 7, font: fonte, color: CINZA });
        y -= 26;
      }
    }
    return paginas;
  }

  private paginaTermoEncerramento(doc: PDFDocument, lic: Licitacao, total: number, hash: string, ausentes: string[], fonte: PDFFont, negrito: PDFFont): PDFPage {
    const pg = doc.addPage(A4);
    const [, h] = A4;
    const w = this.escritor(pg, fonte, negrito);
    w.centro('TERMO DE ENCERRAMENTO', h - 120, 15, true);
    let y = w.paragrafo(
      `Em ${dataPorExtenso(new Date())}, encerro os presentes autos do Processo Administrativo nº ${lic.numero_processo ?? '—'} (${this.rotuloModalidade(lic)} nº ${
        lic.numero_edital || '(a atribuir)'
      }), com ${total} (${total === 1 ? 'uma' : 'total de'}) folhas numeradas de ${carimboDeFolha(1).replace('Fl. ', '')} a ${carimboDeFolha(total).replace('Fl. ', '')}, incluídos a capa, o termo de abertura, o índice e este termo.`,
      80,
      h - 180,
      A4[0] - 160,
      11.5,
    );
    if (ausentes.length) {
      y -= 16;
      pg.drawText('Peças que não integram esta montagem:', { x: 80, y, size: 9, font: negrito, color: rgb(0.5, 0.3, 0) });
      y -= 14;
      for (const a of ausentes.slice(0, 15)) {
        y = w.paragrafo(`• ${a}`, 86, y, A4[0] - 170, 8.5, false, CINZA);
      }
    }
    w.centro(`Impressão das peças (SHA-256): ${hash.slice(0, 32)}`, 90, 8, false, CINZA);
    w.centro('Setor de Licitações / Agente de contratação', 70, 9, false, CINZA);
    return pg;
  }

  /** Termo de justificativas: achados ATENÇÃO justificados (E4) e peças "não se aplica" (art. 72). */
  private async pdfTermoJustificativas(
    lic: Licitacao,
    justificativas: Array<{ regra: string; titulo: string; mensagem?: string; justificativa: string | null; justificado_por_nome: string | null; justificado_em: Date | string | null }>,
    naoSeAplica: Array<{ titulo: string; justificativa: string; por: string | null }>,
  ): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const fonte = await doc.embedFont(StandardFonts.Helvetica);
    const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
    let pg = doc.addPage(A4);
    const [, h] = A4;
    let w = this.escritor(pg, fonte, negrito);
    w.centro('TERMO DE JUSTIFICATIVAS', h - 70, 14, true);
    w.centro(`Processo Administrativo nº ${lic.numero_processo ?? '—'}`, h - 88, 10, false, CINZA);
    let y = h - 120;
    const novaPagina = () => {
      pg = doc.addPage(A4);
      w = this.escritor(pg, fonte, negrito);
      y = h - 70;
    };
    const bloco = (titulo: string, texto: string, rodape: string) => {
      if (y < 140) novaPagina();
      y = w.paragrafo(titulo, 60, y, A4[0] - 120, 10, true, AZUL);
      y = w.paragrafo(texto || '—', 60, y - 2, A4[0] - 120, 10);
      y = w.paragrafo(rodape, 60, y - 2, A4[0] - 120, 8.5, false, CINZA);
      y -= 12;
    };
    if (justificativas.length) {
      y = w.paragrafo('Achados da conformidade justificados antes da publicação (o sistema cruza as peças dos autos entre si):', 60, y, A4[0] - 120, 10, true);
      y -= 6;
      for (const j of justificativas) bloco(`${j.regra} — ${j.titulo}`, `"${j.justificativa ?? ''}"`, `Justificado por ${j.justificado_por_nome ?? '—'} em ${fmtDataHora(j.justificado_em)}.`);
    }
    if (naoSeAplica.length) {
      if (y < 160) novaPagina();
      y = w.paragrafo('Peças da instrução marcadas "não se aplica" (art. 72 da Lei nº 14.133/2021 — "se for o caso"):', 60, y - 4, A4[0] - 120, 10, true);
      y -= 6;
      for (const n of naoSeAplica) bloco(n.titulo, n.justificativa, n.por ? `Registrado por ${n.por}.` : '');
    }
    return Buffer.from(await doc.save());
  }

  /** Registro das publicações: PNCP (números de controle), divulgação oficial, Diário Oficial e sítio. */
  private async pdfRegistroPublicacoes(lic: Licitacao, pncp: any[], dos: any[], link: string | null): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const fonte = await doc.embedFont(StandardFonts.Helvetica);
    const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
    const pg = doc.addPage(A4);
    const [, h] = A4;
    const w = this.escritor(pg, fonte, negrito);
    w.centro('REGISTRO DAS PUBLICAÇÕES', h - 70, 14, true);
    w.centro('Lei nº 14.133/2021, arts. 54, 94 e 174; art. 75, §3º', h - 88, 9, false, CINZA);
    let y = h - 125;
    const l: any = lic;
    y = w.paragrafo(
      `Divulgação oficial: ${l.data_divulgacao_oficial ? fmtDataHora(l.data_divulgacao_oficial) : 'aguardando a confirmação'}${
        l.meio_divulgacao_oficial ? ` — ${l.meio_divulgacao_oficial === 'DIARIO_OFICIAL' ? 'Diário Oficial (art. 176, parágrafo único)' : 'PNCP'}` : ''
      }${l.referencia_divulgacao_oficial ? ` — ${l.referencia_divulgacao_oficial}` : ''}.`,
      60,
      y,
      A4[0] - 120,
      10,
      true,
    );
    y -= 10;
    pg.drawText('Portal Nacional de Contratações Públicas (PNCP)', { x: 60, y, size: 10, font: negrito, color: AZUL });
    y -= 16;
    if (!pncp.length) y = w.paragrafo('Nenhum envio confirmado pelo PNCP.', 70, y, A4[0] - 140, 9.5);
    for (const s of pncp.slice(0, 25)) {
      y = w.paragrafo(`${s.tipo} — enviado em ${fmtDataHora(s.em)}${s.numero_controle_pncp ? ` — nº de controle ${s.numero_controle_pncp}` : ''}`, 70, y, A4[0] - 140, 9.5);
    }
    if (link) y = w.paragrafo(`Consulta pública: ${link}`, 70, y - 2, A4[0] - 140, 9, false, rgb(0.1, 0.3, 0.7));
    y -= 10;
    pg.drawText('Diário Oficial do órgão', { x: 60, y, size: 10, font: negrito, color: AZUL });
    y -= 16;
    if (!dos.length) y = w.paragrafo('Publicação no Diário Oficial não registrada.', 70, y, A4[0] - 140, 9.5);
    for (const d of dos) {
      const dd = d.d ?? {};
      y = w.paragrafo(
        `${d.numero_peca ?? 'Diário Oficial'} — publicado em ${dd.data_publicacao ? fmtDia(`${dd.data_publicacao}T12:00:00-03:00`) : '—'}${dd.link ? ` — ${dd.link}` : ''}${dd.anexada ? ' (página anexada a seguir)' : ''}`,
        70,
        y,
        A4[0] - 140,
        9.5,
      );
    }
    y -= 10;
    pg.drawText('Sítio oficial', { x: 60, y, size: 10, font: negrito, color: AZUL });
    y -= 16;
    w.paragrafo(
      l.data_divulgacao_oficial ? `Processo publicado no portal público do Portal DCP em ${fmtDataHora(l.data_divulgacao_oficial)}.` : 'Publicado no portal público com a confirmação da divulgação oficial.',
      70,
      y,
      A4[0] - 140,
      9.5,
    );
    return Buffer.from(await doc.save());
  }
}

interface ExtrasAutos {
  ausentes: string[];
  interessado: string;
}

export type { FaixaDeFolhas };
