/**
 * ETAPAS DA FASE INTERNA (Entrega 2 — docs/licitacao/PLANO-FASE-INTERNA.md,
 * SPEC §3) — funções PURAS, sem banco.
 *
 * As 8 etapas da SPEC (+ controle interno opcional) são uma VISÃO MAIS FINA da
 * fase interna. Não há máquina paralela nem coluna com o status de cada etapa:
 * a situação é DERIVADA das peças (instrução do processo — `getInstrucao`:
 * peça pronta = anexada, assinada, OK ou "não se aplica") e das dependências.
 * A máquina de estados continua sendo a da licitação (fases PLANEJAMENTO …
 * APROVACAO_INTERNA e atos CONCLUIR_*); cada etapa diz a fase da máquina a que
 * corresponde (`fase_maquina`).
 *
 * Cada etapa tem um ou mais PASSOS — a unidade de trabalho que vira tarefa.
 * Só a etapa 7 tem dois (minutas, do agente; parecer, da procuradoria —
 * "o parecer exige as minutas").
 *
 * Decisão do dono (26/09/2026): a ordem das etapas é SUGESTÃO; o que trava são
 * as dependências. Aqui as dependências decidem QUANDO a tarefa nasce (etapa
 * "disponível"); a peça pode ser feita/anexada a qualquer momento e conta na
 * hora. Os portões que BLOQUEIAM atos (B: autorização exige o art. 72;
 * parecer exige as minutas; C: publicação exige a conformidade) vêm na
 * Entrega 4 — aqui ficam marcados em `portao` (gancho).
 */
import { FaseLicitacao } from '../../licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna as T } from '../entities/documento-fase-interna.entity';

export enum EtapaFaseInterna {
  DEMANDA = 'DEMANDA',
  ETP_RISCOS = 'ETP_RISCOS',
  TERMO_REFERENCIA = 'TERMO_REFERENCIA',
  PESQUISA_PRECOS = 'PESQUISA_PRECOS',
  RESERVA_ORCAMENTARIA = 'RESERVA_ORCAMENTARIA',
  AUTORIZACAO = 'AUTORIZACAO',
  MINUTAS_PARECER = 'MINUTAS_PARECER',
  CONTROLE_INTERNO = 'CONTROLE_INTERNO',
  CONFORMIDADE_PUBLICACAO = 'CONFORMIDADE_PUBLICACAO',
}

/** Unidade de trabalho de uma etapa (vira tarefa; a config é por passo). */
export enum PassoFaseInterna {
  DFD = 'DFD',
  ETP = 'ETP',
  TR = 'TR',
  PESQUISA = 'PESQUISA',
  RESERVA = 'RESERVA',
  AUTORIZACAO = 'AUTORIZACAO',
  MINUTAS = 'MINUTAS',
  PARECER = 'PARECER',
  CONTROLE_INTERNO = 'CONTROLE_INTERNO',
  PUBLICACAO = 'PUBLICACAO',
}

/**
 * Papel FUNCIONAL do usuário na fase interna (não é permissão de sistema —
 * isso continua em RoleUsuario ADMIN/PREGOEIRO/EQUIPE_APOIO). Um usuário pode
 * ter vários.
 */
export enum PapelFaseInterna {
  REQUISITANTE = 'REQUISITANTE',
  COMPRAS = 'COMPRAS',
  CONTABILIDADE = 'CONTABILIDADE',
  JURIDICO = 'JURIDICO',
  CONTROLE_INTERNO = 'CONTROLE_INTERNO',
  AUTORIDADE = 'AUTORIDADE',
  AGENTE_CONTRATACAO = 'AGENTE_CONTRATACAO',
}

export const ROTULO_PAPEL: Record<PapelFaseInterna, string> = {
  [PapelFaseInterna.REQUISITANTE]: 'Requisitante',
  [PapelFaseInterna.COMPRAS]: 'Compras',
  [PapelFaseInterna.CONTABILIDADE]: 'Contabilidade',
  [PapelFaseInterna.JURIDICO]: 'Jurídico',
  [PapelFaseInterna.CONTROLE_INTERNO]: 'Controle interno',
  [PapelFaseInterna.AUTORIDADE]: 'Autoridade',
  [PapelFaseInterna.AGENTE_CONTRATACAO]: 'Agente de contratação',
};

export type SituacaoPasso =
  | 'AGUARDANDO' // dependências ainda não cumpridas (a peça pode ser feita mesmo assim)
  | 'DISPONIVEL' // dependências cumpridas, nada começado
  | 'EM_ANDAMENTO' // alguma peça em elaboração/aprovação/assinatura ou parte pronta
  | 'CONCLUIDO' // todas as peças prontas (ou "não se aplica"); publicação: processo divulgado
  | 'NAO_REALIZADO' // a fase interna acabou (processo divulgado) sem a peça
  | 'CANCELADO'; // processo revogado/anulado na fase interna

export type SituacaoEtapa =
  | 'AGUARDANDO'
  | 'DISPONIVEL'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'NAO_REALIZADA'
  | 'CANCELADA';

/** Portão (Entrega 4) que vai travar o ato ligado ao passo — gancho. */
export type Portao = 'B_ART72' | 'MINUTAS_ANTES_DO_PARECER' | 'C_CONFORMIDADE';

export interface DefinicaoPasso {
  passo: PassoFaseInterna;
  etapa: EtapaFaseInterna;
  titulo: string;
  /** Papel que responde pelo passo no modo POR_SETOR (padrão da Portaria 089). */
  papel_padrao: PapelFaseInterna;
  /** Prazo padrão em dias úteis (Portaria 089/2024 da Câmara de LEM); null = sem prazo. */
  prazo_padrao: number | null;
  portao?: Portao;
}

export const DEFINICAO_PASSO: Record<PassoFaseInterna, DefinicaoPasso> = {
  DFD: { passo: PassoFaseInterna.DFD, etapa: EtapaFaseInterna.DEMANDA, titulo: 'Formalizar a demanda (DFD)', papel_padrao: PapelFaseInterna.REQUISITANTE, prazo_padrao: null },
  ETP: { passo: PassoFaseInterna.ETP, etapa: EtapaFaseInterna.ETP_RISCOS, titulo: 'Estudo técnico preliminar e análise de riscos', papel_padrao: PapelFaseInterna.REQUISITANTE, prazo_padrao: null },
  TR: { passo: PassoFaseInterna.TR, etapa: EtapaFaseInterna.TERMO_REFERENCIA, titulo: 'Termo de referência', papel_padrao: PapelFaseInterna.REQUISITANTE, prazo_padrao: null },
  PESQUISA: { passo: PassoFaseInterna.PESQUISA, etapa: EtapaFaseInterna.PESQUISA_PRECOS, titulo: 'Pesquisa de preços e mapa', papel_padrao: PapelFaseInterna.COMPRAS, prazo_padrao: 30 },
  RESERVA: { passo: PassoFaseInterna.RESERVA, etapa: EtapaFaseInterna.RESERVA_ORCAMENTARIA, titulo: 'Informação orçamentária e reserva', papel_padrao: PapelFaseInterna.CONTABILIDADE, prazo_padrao: 3 },
  AUTORIZACAO: { passo: PassoFaseInterna.AUTORIZACAO, etapa: EtapaFaseInterna.AUTORIZACAO, titulo: 'Autorização da autoridade competente', papel_padrao: PapelFaseInterna.AUTORIDADE, prazo_padrao: 3, portao: 'B_ART72' },
  MINUTAS: { passo: PassoFaseInterna.MINUTAS, etapa: EtapaFaseInterna.MINUTAS_PARECER, titulo: 'Relatório do agente e minutas', papel_padrao: PapelFaseInterna.AGENTE_CONTRATACAO, prazo_padrao: 5 },
  PARECER: { passo: PassoFaseInterna.PARECER, etapa: EtapaFaseInterna.MINUTAS_PARECER, titulo: 'Parecer jurídico', papel_padrao: PapelFaseInterna.JURIDICO, prazo_padrao: 5, portao: 'MINUTAS_ANTES_DO_PARECER' },
  CONTROLE_INTERNO: { passo: PassoFaseInterna.CONTROLE_INTERNO, etapa: EtapaFaseInterna.CONTROLE_INTERNO, titulo: 'Manifestação do controle interno', papel_padrao: PapelFaseInterna.CONTROLE_INTERNO, prazo_padrao: 3 },
  PUBLICACAO: { passo: PassoFaseInterna.PUBLICACAO, etapa: EtapaFaseInterna.CONFORMIDADE_PUBLICACAO, titulo: 'Conformidade e publicação', papel_padrao: PapelFaseInterna.AGENTE_CONTRATACAO, prazo_padrao: 5, portao: 'C_CONFORMIDADE' },
};

export const TITULO_ETAPA: Record<EtapaFaseInterna, string> = {
  DEMANDA: 'Demanda (DFD)',
  ETP_RISCOS: 'ETP e análise de riscos',
  TERMO_REFERENCIA: 'Termo de referência',
  PESQUISA_PRECOS: 'Pesquisa de preços (art. 23)',
  RESERVA_ORCAMENTARIA: 'Reserva orçamentária',
  AUTORIZACAO: 'Autorização',
  MINUTAS_PARECER: 'Minutas e parecer jurídico',
  CONTROLE_INTERNO: 'Controle interno',
  CONFORMIDADE_PUBLICACAO: 'Conformidade e publicação',
};

/** Fase da máquina de estados (rito completo) em que a etapa se encaixa. */
export const FASE_MAQUINA_DA_ETAPA: Record<EtapaFaseInterna, FaseLicitacao> = {
  DEMANDA: FaseLicitacao.PLANEJAMENTO,
  ETP_RISCOS: FaseLicitacao.PLANEJAMENTO,
  TERMO_REFERENCIA: FaseLicitacao.TERMO_REFERENCIA,
  PESQUISA_PRECOS: FaseLicitacao.PESQUISA_PRECOS,
  RESERVA_ORCAMENTARIA: FaseLicitacao.APROVACAO_INTERNA,
  AUTORIZACAO: FaseLicitacao.APROVACAO_INTERNA,
  MINUTAS_PARECER: FaseLicitacao.ANALISE_JURIDICA,
  CONTROLE_INTERNO: FaseLicitacao.ANALISE_JURIDICA,
  CONFORMIDADE_PUBLICACAO: FaseLicitacao.APROVACAO_INTERNA,
};

/**
 * Ordem SUGERIDA das etapas e dependências dos passos, por rito:
 *  - contratação direta (art. 72; autos da Câmara de LEM): demanda → estudo,
 *    TR e pesquisa → reserva (precisa do valor da pesquisa) → autorização
 *    (portão B: art. 72, I, II e IV) → minutas → parecer → controle interno →
 *    publicação;
 *  - rito completo (art. 18 e 53; máquina PLANEJAMENTO … APROVACAO_INTERNA):
 *    o parecer vem antes da autorização da abertura.
 */
const P = PassoFaseInterna;
const E = EtapaFaseInterna;

const DEPENDENCIAS_DIRETA: Record<PassoFaseInterna, PassoFaseInterna[]> = {
  DFD: [],
  ETP: [P.DFD],
  TR: [P.DFD],
  PESQUISA: [P.DFD],
  RESERVA: [P.PESQUISA],
  AUTORIZACAO: [P.DFD, P.ETP, P.TR, P.PESQUISA, P.RESERVA],
  MINUTAS: [P.AUTORIZACAO],
  PARECER: [P.MINUTAS],
  CONTROLE_INTERNO: [P.PARECER],
  PUBLICACAO: [P.PARECER, P.CONTROLE_INTERNO],
};

const DEPENDENCIAS_RITO: Record<PassoFaseInterna, PassoFaseInterna[]> = {
  DFD: [],
  ETP: [P.DFD],
  TR: [P.DFD],
  PESQUISA: [P.DFD],
  RESERVA: [P.PESQUISA],
  MINUTAS: [P.ETP, P.TR, P.PESQUISA],
  PARECER: [P.MINUTAS, P.ETP, P.TR, P.PESQUISA],
  AUTORIZACAO: [P.PARECER, P.RESERVA],
  CONTROLE_INTERNO: [P.PARECER],
  PUBLICACAO: [P.AUTORIZACAO, P.CONTROLE_INTERNO],
};

const ORDEM_ETAPAS_DIRETA: EtapaFaseInterna[] = [
  E.DEMANDA, E.ETP_RISCOS, E.TERMO_REFERENCIA, E.PESQUISA_PRECOS, E.RESERVA_ORCAMENTARIA,
  E.AUTORIZACAO, E.MINUTAS_PARECER, E.CONTROLE_INTERNO, E.CONFORMIDADE_PUBLICACAO,
];
const ORDEM_ETAPAS_RITO: EtapaFaseInterna[] = [
  E.DEMANDA, E.ETP_RISCOS, E.TERMO_REFERENCIA, E.PESQUISA_PRECOS, E.RESERVA_ORCAMENTARIA,
  E.MINUTAS_PARECER, E.AUTORIZACAO, E.CONTROLE_INTERNO, E.CONFORMIDADE_PUBLICACAO,
];
/** Passos na ordem topológica (dependências antes). */
const ORDEM_PASSOS_DIRETA: PassoFaseInterna[] = [P.DFD, P.ETP, P.TR, P.PESQUISA, P.RESERVA, P.AUTORIZACAO, P.MINUTAS, P.PARECER, P.CONTROLE_INTERNO, P.PUBLICACAO];
const ORDEM_PASSOS_RITO: PassoFaseInterna[] = [P.DFD, P.ETP, P.TR, P.PESQUISA, P.RESERVA, P.MINUTAS, P.PARECER, P.AUTORIZACAO, P.CONTROLE_INTERNO, P.PUBLICACAO];

export function dependenciasDoPasso(passo: PassoFaseInterna, contratacaoDireta: boolean): PassoFaseInterna[] {
  return (contratacaoDireta ? DEPENDENCIAS_DIRETA : DEPENDENCIAS_RITO)[passo];
}

/**
 * Passo a que a peça pertence. Na contratação direta a justificativa (JC —
 * razão da escolha e do preço, art. 72 VI e VII) vai com o relatório do
 * agente; no rito completo, com o TR (a máquina a cobra no TERMO_REFERENCIA).
 * Peças da fase externa (parecer nº 2) e genéricas não entram.
 */
export function passoDaPeca(tipo: string, contratacaoDireta: boolean): PassoFaseInterna | null {
  switch (tipo) {
    case T.DOCUMENTO_FORMALIZACAO_DEMANDA:
      return P.DFD;
    case T.ESTUDO_TECNICO_PRELIMINAR:
    case T.ANALISE_RISCOS:
      return P.ETP;
    case T.TERMO_REFERENCIA:
    case T.PROJETO_BASICO:
    case T.PROJETO_EXECUTIVO:
      return P.TR;
    case T.PESQUISA_PRECOS:
    case T.MAPA_COMPARATIVO_PRECOS:
      return P.PESQUISA;
    case T.DOTACAO_ORCAMENTARIA:
      return P.RESERVA;
    case T.AUTORIZACAO_ABERTURA:
    case T.DESIGNACAO_PREGOEIRO:
    case T.DESIGNACAO_EQUIPE_APOIO:
      return P.AUTORIZACAO;
    case T.RELATORIO_AGENTE:
    case T.MINUTA_EDITAL:
    case T.MINUTA_CONTRATO:
    case T.ANEXOS_EDITAL:
      return P.MINUTAS;
    case T.JUSTIFICATIVA_CONTRATACAO:
      return contratacaoDireta ? P.MINUTAS : P.TR;
    case T.PARECER_JURIDICO:
    case T.PARECER_TECNICO:
      return P.PARECER;
    case T.MANIFESTACAO_CONTROLE_INTERNO:
      return P.CONTROLE_INTERNO;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Entrada e saída da função
// ---------------------------------------------------------------------------

export interface ProcessoParaEtapas {
  contratacao_direta: boolean;
  fase: string;
  situacao?: string | null;
}

/** Linha da instrução (`FaseInternaService.getInstrucao().itens`). */
export interface PecaParaEtapas {
  tipo: string;
  titulo: string;
  obrigatorio: boolean;
  /** OK | NAO_SE_APLICA | PENDENTE | EM_ELABORACAO | EM_APROVACAO | EM_ASSINATURA */
  status: string;
  documento_id?: string;
}

export interface ConfigParaEtapas {
  controle_interno_ativo: boolean;
}

export interface PecaDoPasso {
  tipo: string;
  titulo: string;
  obrigatorio: boolean;
  status: string;
  pronta: boolean;
  documento_id: string | null;
}

export interface PassoCalculado {
  passo: PassoFaseInterna;
  etapa: EtapaFaseInterna;
  titulo: string;
  situacao: SituacaoPasso;
  pecas: PecaDoPasso[];
  depende_de: PassoFaseInterna[];
  /** Dependências ainda não cumpridas. */
  pendencias: PassoFaseInterna[];
  /** Primeira peça ainda não pronta (destino do botão da tarefa). */
  peca_pendente: string | null;
  portao: Portao | null;
}

export interface EtapaCalculada {
  etapa: EtapaFaseInterna;
  numero: number;
  titulo: string;
  situacao: SituacaoEtapa;
  /** Todas as peças da etapa marcadas "não se aplica". */
  nao_se_aplica: boolean;
  fase_maquina: FaseLicitacao;
  passos: PassoCalculado[];
}

const STATUS_PRONTA = new Set(['OK', 'NAO_SE_APLICA']);
const STATUS_EM_ANDAMENTO = new Set(['EM_ELABORACAO', 'EM_APROVACAO', 'EM_ASSINATURA']);
const SITUACOES_CANCELAM = new Set(['REVOGADA', 'ANULADA']);
const FASES_INTERNAS = new Set<string>([
  FaseLicitacao.PLANEJAMENTO,
  FaseLicitacao.TERMO_REFERENCIA,
  FaseLicitacao.PESQUISA_PRECOS,
  FaseLicitacao.ANALISE_JURIDICA,
  FaseLicitacao.APROVACAO_INTERNA,
]);

/** A peça conta como pronta para a etapa (anexada, assinada, OK ou não se aplica)? */
export function pecaProntaParaEtapa(status: string): boolean {
  return STATUS_PRONTA.has(status);
}

/**
 * ETAPAS DA FASE INTERNA — situação de cada etapa e passo, derivada das peças
 * (instrução) e das dependências. Pura: mesmo resultado para a mesma entrada.
 *
 *  - Passo com peças: CONCLUIDO quando todas estão prontas; EM_ANDAMENTO quando
 *    alguma começou; senão DISPONIVEL (dependências cumpridas) ou AGUARDANDO.
 *  - Passo sem peça na instrução do processo (ex.: minutas no rito completo)
 *    não aparece; dependência dele conta como cumprida.
 *  - Controle interno: só com `controle_interno_ativo`.
 *  - Publicação: CONCLUIDO quando o processo saiu da fase interna.
 *  - Processo divulgado: o que não ficou pronto vira NAO_REALIZADO; revogado
 *    ou anulado na fase interna: CANCELADO.
 */
export function etapasDaFaseInterna(
  processo: ProcessoParaEtapas,
  pecas: PecaParaEtapas[],
  config: ConfigParaEtapas,
): EtapaCalculada[] {
  const direta = !!processo.contratacao_direta;
  const faseInterna = FASES_INTERNAS.has(processo.fase);
  const cancelado = SITUACOES_CANCELAM.has(String(processo.situacao ?? '')) && faseInterna;
  const divulgado = !faseInterna;

  // Peças por passo (na ordem da instrução)
  const pecasPorPasso = new Map<PassoFaseInterna, PecaDoPasso[]>();
  for (const p of pecas) {
    const passo = passoDaPeca(p.tipo, direta);
    if (!passo) continue;
    if (passo === P.CONTROLE_INTERNO && !config.controle_interno_ativo) continue;
    const lista = pecasPorPasso.get(passo) ?? [];
    lista.push({
      tipo: p.tipo,
      titulo: p.titulo,
      obrigatorio: !!p.obrigatorio,
      status: p.status,
      pronta: pecaProntaParaEtapa(p.status),
      documento_id: p.documento_id ?? null,
    });
    pecasPorPasso.set(passo, lista);
  }

  const passosAtivos = (direta ? ORDEM_PASSOS_DIRETA : ORDEM_PASSOS_RITO).filter((passo) => {
    if (passo === P.PUBLICACAO) return true;
    if (passo === P.CONTROLE_INTERNO && !config.controle_interno_ativo) return false;
    return (pecasPorPasso.get(passo) ?? []).length > 0;
  });
  const ativos = new Set(passosAtivos);

  const calculados = new Map<PassoFaseInterna, PassoCalculado>();
  for (const passo of passosAtivos) {
    const def = DEFINICAO_PASSO[passo];
    const lista = pecasPorPasso.get(passo) ?? [];
    const depende = dependenciasDoPasso(passo, direta).filter((d) => ativos.has(d));
    const pendencias = depende.filter((d) => {
      const s = calculados.get(d)?.situacao;
      return s !== 'CONCLUIDO' && s !== 'NAO_REALIZADO';
    });

    let situacao: SituacaoPasso;
    if (passo === P.PUBLICACAO) {
      situacao = divulgado ? 'CONCLUIDO' : cancelado ? 'CANCELADO' : pendencias.length ? 'AGUARDANDO' : 'DISPONIVEL';
    } else {
      const todas = lista.every((x) => x.pronta);
      const comecou = lista.some((x) => x.pronta || STATUS_EM_ANDAMENTO.has(x.status));
      if (todas) situacao = 'CONCLUIDO';
      else if (cancelado) situacao = 'CANCELADO';
      else if (divulgado) situacao = 'NAO_REALIZADO';
      else if (comecou) situacao = 'EM_ANDAMENTO';
      else situacao = pendencias.length ? 'AGUARDANDO' : 'DISPONIVEL';
    }

    calculados.set(passo, {
      passo,
      etapa: def.etapa,
      titulo: def.titulo,
      situacao,
      pecas: lista,
      depende_de: depende,
      pendencias,
      peca_pendente: lista.find((x) => !x.pronta)?.tipo ?? null,
      portao: def.portao ?? null,
    });
  }

  const ordemEtapas = direta ? ORDEM_ETAPAS_DIRETA : ORDEM_ETAPAS_RITO;
  const etapas: EtapaCalculada[] = [];
  for (const etapa of ordemEtapas) {
    const passos = passosAtivos.filter((p) => DEFINICAO_PASSO[p].etapa === etapa).map((p) => calculados.get(p)!);
    if (!passos.length) continue;
    const todasPecas = passos.flatMap((p) => p.pecas);
    etapas.push({
      etapa,
      numero: etapas.length + 1,
      titulo: TITULO_ETAPA[etapa],
      situacao: situacaoDaEtapa(passos.map((p) => p.situacao)),
      nao_se_aplica: todasPecas.length > 0 && todasPecas.every((x) => x.status === 'NAO_SE_APLICA'),
      fase_maquina: FASE_MAQUINA_DA_ETAPA[etapa],
      passos,
    });
  }
  return etapas;
}

export function situacaoDaEtapa(passos: SituacaoPasso[]): SituacaoEtapa {
  if (passos.every((s) => s === 'CONCLUIDO')) return 'CONCLUIDA';
  if (passos.some((s) => s === 'CANCELADO')) return 'CANCELADA';
  if (passos.every((s) => s === 'CONCLUIDO' || s === 'NAO_REALIZADO')) return 'NAO_REALIZADA';
  if (passos.some((s) => s === 'EM_ANDAMENTO' || s === 'CONCLUIDO')) return 'EM_ANDAMENTO';
  if (passos.some((s) => s === 'DISPONIVEL')) return 'DISPONIVEL';
  return 'AGUARDANDO';
}

/**
 * ETAPA ATUAL (derivada, nunca gravada): a primeira, na ordem sugerida, que
 * está em andamento ou disponível. null = nada a fazer (tudo concluído ou
 * processo encerrado).
 */
export function etapaAtual(etapas: EtapaCalculada[]): EtapaCalculada | null {
  return etapas.find((e) => e.situacao === 'EM_ANDAMENTO' || e.situacao === 'DISPONIVEL') ?? null;
}

/** Todos os passos, na ordem das etapas. */
export function passosDasEtapas(etapas: EtapaCalculada[]): PassoCalculado[] {
  return etapas.flatMap((e) => e.passos);
}
