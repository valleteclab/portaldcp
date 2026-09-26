import { modoDisputaDaDispensa } from '../../licitacoes/modo-disputa-dispensa';
/**
 * MONTAGEM DO CONTEXTO do motor de conformidade (Entrega 4) — função PURA
 * sobre as linhas lidas do banco (o serviço lê; o teste monta à mão).
 *
 *  - Processo: fundamento legal efetivo (fonte única da E1) e o inciso do
 *    art. 75, número da dispensa, sigilo, cronograma, exercício.
 *  - Peças: todas as ATIVAS (versão atual; pode haver duas do mesmo tipo —
 *    DUP-01). Texto: da peça feita no sistema, as seções (uma "página" por
 *    seção, na folha inicial); da anexada, o texto extraído do PDF página a
 *    página (folha inicial + página − 1). PDF sem texto (digitalizado) fica
 *    marcado `sem_texto` — sem OCR (a IA sobre PDFs é a Entrega 7).
 *  - Data da peça (`data_documento`, E1) no dia de Brasília.
 */
import { definicaoDoFundamento, fundamentoEfetivo } from '../../licitacoes/fundamento-legal';
import type { CalendarioDiasUteis } from '../../common/prazos/dias-uteis';
import type { ConsumoDoLimiteProcesso } from '../../parametros-licitacao/consumo-limite.service';
import { hojeEmBrasilia } from '../peca-regras';
import { metodoDaMetodologia } from '../telas/pesquisa-regras';
import { hashSecoes, secoesDaPeca } from '../telas/minutas-regras';
import type { LinhaInstrucaoPortao } from './art72';
import { diaEmBrasiliaIso } from './regras';
import { normalizarNumeroLei, textoPuro } from './texto';
import type { AnexoAvulso, AtoProtegido, ContextoConformidade, Cronograma, PecaConformidade } from './tipos';

export interface LicitacaoLinha {
  id: string;
  orgao_id: string;
  numero_processo: string;
  numero_edital?: string | null;
  objeto?: string | null;
  modalidade: string;
  tipo_contratacao?: string | null;
  criterio_julgamento?: string | null;
  regime_execucao?: string | null;
  natureza_objeto?: string | null;
  fase: string;
  situacao?: string | null;
  fundamento_legal?: string | null;
  sigilo_orcamento?: string | null;
  justificativa_sigilo?: string | null;
  valor_total_estimado?: number | string | null;
  exercicio?: number | null;
  selecao_externa?: boolean | null;
  data_publicacao_edital?: Date | string | null;
  data_inicio_acolhimento?: Date | string | null;
  data_fim_acolhimento?: Date | string | null;
  data_abertura_sessao?: Date | string | null;
  /** Escolha da disputa da dispensa (Entrega 5) e o padrão/regulamento do órgão. */
  dispensa_com_lances?: boolean | null;
  padrao_dispensa_com_lances?: boolean | null;
  regulamento_adota_in67?: boolean | null;
}

export interface DocumentoLinha {
  id: string;
  tipo: string;
  titulo?: string | null;
  descricao?: string | null;
  versao?: number | null;
  status: string;
  origem: string;
  data_documento?: Date | string | null;
  folha_inicial?: number | null;
  folha_final?: number | null;
  hash_arquivo?: string | null;
  dados_estruturados?: any;
  assinaturas?: Array<{ assinante_id?: string; assinante_nome?: string }> | null;
  signatarios_exigidos?: Array<{ usuario_id: string; nome: string; papel: string }> | null;
  sistema_origem?: string | null;
  id_externo?: string | null;
}

export interface EntradaContexto {
  agora: Date;
  licitacao: LicitacaoLinha;
  /** Soma dos itens (valor estimado do processo); sem itens, o da licitação. */
  valor_itens?: number | null;
  instrucao: { contratacao_direta: boolean; itens: LinhaInstrucaoPortao[] };
  documentos: DocumentoLinha[];
  /** Texto extraído dos PDFs das peças anexadas, por documento (null = sem texto). */
  textos_pdf?: Record<string, string[] | null>;
  anexos_avulsos?: AnexoAvulso[];
  /** Dados da pesquisa (documento PP — a versão com itens). */
  pesquisa_dados?: any;
  reserva?: {
    status: string;
    exercicio_base: number | null;
    documento_id?: string | null;
    linhas: Array<{ exercicio: number; valor: number | string; situacao: string }>;
    leis?: Partial<Record<'LDO' | 'LOA' | 'PPA', string | null>>;
  } | null;
  limite?: ConsumoDoLimiteProcesso | null;
  calendario: CalendarioDiasUteis;
  ato_pretendido?: AtoProtegido | null;
  /** Cronograma do ato (ex.: as datas do pedido de publicação) — prevalece sobre o gravado. */
  cronograma?: Partial<Cronograma> | null;
}

const TITULO_PADRAO: Record<string, string> = {
  DFD: 'DFD',
  ETP: 'Estudo técnico preliminar',
  AR: 'Análise de riscos',
  TR: 'Termo de referência',
  PP: 'Pesquisa de preços',
  MCP: 'Mapa de preços',
  DO: 'Informação orçamentária',
  AA: 'Despacho de autorização',
  DP: 'Designação do agente',
  RAG: 'Relatório do agente',
  ME: 'Minuta do aviso',
  MC: 'Minuta do contrato',
  PJ: 'Parecer jurídico',
  PJE: 'Parecer da fase externa',
  MCI: 'Manifestação do controle interno',
  JC: 'Justificativa da contratação',
};

const iso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Inciso do art. 75 do código do fundamento ("ART75_II" → "II"; "ART75_III_A" → "III"). */
export function incisoArt75DoFundamento(codigo: string | null | undefined): string | null {
  const m = String(codigo ?? '').match(/^ART75_([IVXL]+)/);
  return m ? m[1] : null;
}

export function pecaDoContexto(d: DocumentoLinha, textosPdf?: string[] | null): PecaConformidade {
  const dados = d.dados_estruturados || {};
  const anexada = d.origem !== 'INTERNO';
  const secoes = anexada ? {} : secoesDaPeca(dados);
  let paginas: PecaConformidade['paginas'];
  if (anexada) {
    paginas = (textosPdf ?? [])
      .map((texto, i) => ({ folha: d.folha_inicial != null ? d.folha_inicial + i : null, secao: `p${i + 1}`, texto }))
      .filter((p) => textoPuro(p.texto).length > 0);
  } else {
    paginas = Object.entries(secoes)
      .filter(([, v]) => textoPuro(v).length > 0)
      .map(([k, v]) => ({ folha: d.folha_inicial ?? null, secao: k, texto: v }));
    if (!paginas.length && textoPuro(d.descricao).length) paginas = [{ folha: d.folha_inicial ?? null, secao: 'texto', texto: String(d.descricao) }];
  }
  const assinaram = new Set((d.assinaturas ?? []).map((a) => a.assinante_id).filter(Boolean));
  const faltantes = d.status === 'AGUARDANDO_ASSINATURA' ? (d.signatarios_exigidos ?? []).filter((s) => !assinaram.has(s.usuario_id)).map((s) => `${s.nome} (${s.papel})`) : [];
  const impressao = anexada
    ? d.hash_arquivo || null
    : Object.keys(secoes).length
      ? hashSecoes(secoes)
      : textoPuro(d.descricao)
        ? hashSecoes({ texto: textoPuro(d.descricao) })
        : null;
  return {
    documento_id: d.id,
    tipo: d.tipo,
    titulo: TITULO_PADRAO[d.tipo] ?? (d.titulo || d.tipo),
    versao: Number(d.versao) || 1,
    status: d.status,
    origem: d.origem,
    anexada,
    data_documento: diaEmBrasiliaIso(iso(d.data_documento)),
    folha_inicial: d.folha_inicial ?? null,
    folha_final: d.folha_final ?? null,
    nao_se_aplica: !!dados.nao_se_aplica,
    secoes,
    paginas,
    sem_texto: anexada && !paginas.length,
    impressao,
    exige_assinatura: !!dados._exige_assinatura,
    signatarios_faltantes: faltantes,
    desatualizada: dados._desatualizada?.texto ? { texto: String(dados._desatualizada.texto), motivo: dados._desatualizada.motivo } : null,
    justificativa_marca: dados._marca?.justificativa ? String(dados._marca.justificativa) : null,
    id_externo: d.sistema_origem === 'documentos_licitacao' ? d.id_externo ?? null : null,
  };
}

export function montarContexto(e: EntradaContexto): ContextoConformidade {
  const lic = e.licitacao;
  const fundamento = fundamentoEfetivo(lic);
  const def = definicaoDoFundamento(fundamento);
  const cron: Cronograma = {
    data_publicacao_edital: iso(e.cronograma?.data_publicacao_edital ?? lic.data_publicacao_edital),
    data_inicio_acolhimento: iso(e.cronograma?.data_inicio_acolhimento ?? lic.data_inicio_acolhimento),
    data_fim_acolhimento: iso(e.cronograma?.data_fim_acolhimento ?? lic.data_fim_acolhimento),
    data_abertura_sessao: iso(e.cronograma?.data_abertura_sessao ?? lic.data_abertura_sessao),
  };
  const pd = e.pesquisa_dados;
  const dfd = e.documentos.find((d) => d.tipo === 'DFD' && !d.dados_estruturados?.nao_se_aplica);
  const valorItens = Number(e.valor_itens);
  const valorLic = Number(lic.valor_total_estimado);
  return {
    hoje: hojeEmBrasilia(e.agora),
    agora: e.agora,
    processo: {
      id: lic.id,
      orgao_id: lic.orgao_id,
      numero_processo: lic.numero_processo,
      numero_dispensa: lic.numero_edital ?? null,
      objeto: String(lic.objeto ?? ''),
      modalidade: lic.modalidade,
      tipo_contratacao: lic.tipo_contratacao ?? null,
      criterio_julgamento: lic.criterio_julgamento ?? null,
      regime_execucao: lic.regime_execucao ?? null,
      natureza_objeto: lic.natureza_objeto ?? null,
      fase: lic.fase,
      situacao: lic.situacao ?? null,
      contratacao_direta: e.instrucao.contratacao_direta,
      selecao_externa: !!lic.selecao_externa,
      fundamento_legal: fundamento,
      fundamento_referencia: def?.referencia ?? null,
      inciso_art75: incisoArt75DoFundamento(fundamento),
      sigiloso: lic.sigilo_orcamento === 'SIGILOSO',
      justificativa_sigilo: lic.justificativa_sigilo ?? null,
      valor_estimado: Number.isFinite(valorItens) && valorItens > 0 ? valorItens : Number.isFinite(valorLic) && valorLic > 0 ? valorLic : null,
      exercicio: Number(lic.exercicio) || Number(hojeEmBrasilia(e.agora).slice(0, 4)),
      cronograma: cron,
      data_pretendida: dfd?.dados_estruturados?._dfd?.data_pretendida ? String(dfd.dados_estruturados._dfd.data_pretendida).slice(0, 10) : null,
      dispensa_com_lances: (() => {
        const modo = modoDisputaDaDispensa(lic, lic.padrao_dispensa_com_lances);
        return modo.aplica ? modo.com_lances : null;
      })(),
      regulamento_adota_in67: lic.regulamento_adota_in67 === true,
    },
    instrucao: e.instrucao.itens,
    pecas: e.documentos.filter((d) => d.status !== 'SUBSTITUIDO').map((d) => pecaDoContexto(d, e.textos_pdf?.[d.id] ?? null)),
    anexos_avulsos: e.anexos_avulsos ?? [],
    pesquisa:
      pd && Array.isArray(pd.itens)
        ? {
            metodo: pd.metodo ?? metodoDaMetodologia(pd.metodologia_geral),
            justificativa_metodo: pd.justificativa_metodo ?? null,
            publicacao_prevista: pd.publicacao_prevista ? String(pd.publicacao_prevista).slice(0, 10) : null,
            itens: pd.itens,
          }
        : null,
    reserva: e.reserva
      ? {
          status: e.reserva.status,
          exercicio_base: e.reserva.exercicio_base ?? null,
          documento_id: e.reserva.documento_id ?? null,
          linhas: (e.reserva.linhas || []).map((l) => ({ exercicio: Number(l.exercicio), valor: Number(l.valor), situacao: l.situacao })),
          leis: Object.fromEntries(
            Object.entries(e.reserva.leis ?? {})
              .map(([tipo, numero]) => {
                const m = String(numero ?? '').match(/(\d[\d.]*)\s*\/\s*(\d{4})/);
                return [tipo, m ? normalizarNumeroLei(m[1], m[2]) : null];
              })
              .filter(([, v]) => !!v),
          ) as Partial<Record<'LDO' | 'LOA' | 'PPA', string>>,
        }
      : null,
    limite: e.limite ?? null,
    calendario: e.calendario,
    ato_pretendido: e.ato_pretendido ?? null,
  };
}
