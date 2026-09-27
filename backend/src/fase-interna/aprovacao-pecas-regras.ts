/**
 * APROVAÇÃO INTERNA DAS PEÇAS (fluxo de aprovação de documentos ligado às
 * telas das etapas) — funções PURAS, sem banco.
 *
 *  - Resolução do fluxo da peça: fluxo próprio do tipo → fluxo GENÉRICO do
 *    órgão → nenhum (aprovação única, por quem conduz o processo).
 *  - Quando a peça vai SOZINHA para o fluxo: só nas etapas com "aprovação
 *    interna" ligada no modelo de fluxo; peça feita no sistema depois de
 *    EMITIDA (gerada), ou anexada pela etapa; nunca duas vezes a mesma emissão.
 *  - Quem decide uma etapa: a pessoa indicada; senão o setor indicado; sem
 *    responsável, quem conduz o processo.
 *  - Validação do fluxo do órgão e o rascunho a partir de um MODELO PRONTO.
 */
import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { TITULO_DOCUMENTO } from './documentos-obrigatorios';
import { pecaEmitida, RegistroEmissao } from './peca-regras';

const TIPOS_VALIDOS = new Set<string>(Object.values(TipoDocumentoFaseInterna));

export function tipoDocumentoValido(tipo: unknown): tipo is TipoDocumentoFaseInterna {
  return typeof tipo === 'string' && TIPOS_VALIDOS.has(tipo);
}

export function tituloDoTipo(tipo: string): string {
  return TITULO_DOCUMENTO[tipo as TipoDocumentoFaseInterna] ?? tipo;
}

// ---------------------------------------------------------------------------
// Resolução do fluxo
// ---------------------------------------------------------------------------

export interface FluxoParaResolver {
  id: string;
  nome?: string;
  tipo_documento: string | null;
  tipos_documento?: string[] | null;
  ativo: boolean;
  updated_at?: Date | string | null;
}

/** Tipos de peça do fluxo (`tipo_documento` ∪ `tipos_documento`), sem repetição. */
export function tiposDoFluxo(f: Pick<FluxoParaResolver, 'tipo_documento' | 'tipos_documento'>): string[] {
  const lista = [f.tipo_documento, ...(Array.isArray(f.tipos_documento) ? f.tipos_documento : [])].filter(
    (t): t is string => typeof t === 'string' && !!t,
  );
  return [...new Set(lista)];
}

/** Sem tipo nenhum = GENÉRICO: vale para toda peça sem fluxo próprio. */
export function fluxoEhGenerico(f: Pick<FluxoParaResolver, 'tipo_documento' | 'tipos_documento'>): boolean {
  return tiposDoFluxo(f).length === 0;
}

const quando = (f: FluxoParaResolver) => (f.updated_at ? new Date(f.updated_at).getTime() : 0);

/** Fluxo efetivo da peça: próprio do tipo (o mais recente) → genérico → null. */
export function fluxoParaTipo<T extends FluxoParaResolver>(fluxos: T[], tipo: string): T | null {
  const ativos = fluxos.filter((f) => f.ativo).sort((a, b) => quando(b) - quando(a));
  return ativos.find((f) => tiposDoFluxo(f).includes(tipo)) ?? ativos.find((f) => fluxoEhGenerico(f)) ?? null;
}

// ---------------------------------------------------------------------------
// Submissão automática
// ---------------------------------------------------------------------------

export interface PecaParaSubmissao {
  tipo: string;
  status: string;
  origem: string;
  versao_atual?: boolean;
  descricao?: string | null;
  dados_estruturados?: any;
  caminho_arquivo?: string | null;
  arquivo_pdf_path?: string | null;
}

export interface EtapaJaCriada {
  status: string;
  data_decisao?: Date | string | null;
}

export type ResultadoSubmissao = { submeter: true } | { submeter: false; motivo: string };

const ABERTAS = new Set(['EM_ANALISE', 'PENDENTE']);

/**
 * A peça deve ir SOZINHA para o fluxo de aprovação agora?
 *  - só com a "aprovação interna" ligada na etapa da peça;
 *  - peça feita no sistema: EMITIDA (gerada) com o conteúdo atual, ainda não
 *    enviada, ou emitida DE NOVO depois da última decisão (reprovada → o autor
 *    corrigiu e gerou de novo);
 *  - peça anexada: só a anexada agora pela etapa (a juntada em lote da fase
 *    interna feita fora já traz as conferências de fora) e nunca enviada;
 *  - nunca: com aprovação em curso, "não se aplica", peça que só vale assinada
 *    (despacho, parecer, controle interno) ou versão substituída.
 */
export function deveSubmeterAutomaticamente(
  doc: PecaParaSubmissao,
  etapas: EtapaJaCriada[],
  opcoes: { aprovacaoInterna: boolean; anexadaAgora?: boolean },
): ResultadoSubmissao {
  if (!opcoes.aprovacaoInterna) return { submeter: false, motivo: 'a etapa da peça não tem aprovação interna' };
  if (doc.versao_atual === false) return { submeter: false, motivo: 'versão substituída' };
  const dados = doc.dados_estruturados && typeof doc.dados_estruturados === 'object' ? doc.dados_estruturados : {};
  if (dados.nao_se_aplica) return { submeter: false, motivo: 'não se aplica' };
  if (dados._exige_assinatura) return { submeter: false, motivo: 'peça que só vale assinada' };
  if (etapas.some((e) => ABERTAS.has(e.status))) return { submeter: false, motivo: 'já está em aprovação' };

  if (doc.origem !== 'INTERNO') {
    if (!opcoes.anexadaAgora) return { submeter: false, motivo: 'anexada fora da etapa (juntada em lote)' };
    if (doc.status !== 'IMPORTADO') return { submeter: false, motivo: `anexada com status ${doc.status}` };
    if (etapas.length) return { submeter: false, motivo: 'anexada já enviada' };
    return { submeter: true };
  }

  if (!['EM_ELABORACAO', 'PENDENTE', 'REPROVADO'].includes(doc.status)) {
    return { submeter: false, motivo: `status ${doc.status}` };
  }
  if (!pecaEmitida(doc)) return { submeter: false, motivo: 'ainda não emitida (rascunho)' };
  const emitido = dados._emitido as RegistroEmissao | undefined;
  if (emitido?.legado) return { submeter: false, motivo: 'peça anterior à regra (legado)' };
  const decisoes = etapas
    .filter((e) => (e.status === 'APROVADA' || e.status === 'REPROVADA') && e.data_decisao)
    .map((e) => new Date(e.data_decisao as any).getTime());
  if (decisoes.length) {
    const emitidaEm = emitido?.em ? new Date(emitido.em).getTime() : 0;
    if (!(emitidaEm > Math.max(...decisoes))) return { submeter: false, motivo: 'sem nova emissão desde a última decisão' };
  }
  return { submeter: true };
}

// ---------------------------------------------------------------------------
// Quem decide
// ---------------------------------------------------------------------------

export interface PessoaAprovadora {
  /** Admin da plataforma. */
  admin: boolean;
  /** Id do usuário (ou do órgão, no login do órgão). */
  id: string | null;
  setor_id: string | null;
  /** Conduz ESTE processo (login do órgão, ADMIN do órgão, agente do processo). */
  conduz: boolean;
}

/**
 * A pessoa decide esta etapa? Pessoa indicada → só ela; setor indicado → quem
 * é do setor; sem responsável → quem conduz o processo.
 */
export function podeDecidirEtapa(etapa: { usuario_id?: string | null; setor_id?: string | null }, p: PessoaAprovadora): boolean {
  if (p.admin) return true;
  if (etapa.usuario_id) return !!p.id && p.id === etapa.usuario_id;
  if (etapa.setor_id) return !!p.setor_id && p.setor_id === etapa.setor_id;
  return p.conduz;
}

/** "quem" da etapa, para a tela. */
export function responsavelDaEtapa(etapa: { usuario_nome?: string | null; setor_nome?: string | null }): string {
  if (etapa.usuario_nome) return etapa.usuario_nome;
  if (etapa.setor_nome) return `setor ${etapa.setor_nome}`;
  return 'quem conduz o processo';
}

/** "Aguardando aprovação: Conferência — Maria (1 de 2)". */
export function rotuloAguardando(etapa: { ordem: number; nome: string; usuario_nome?: string | null; setor_nome?: string | null }, total: number): string {
  return `Aguardando aprovação: ${etapa.nome} — ${responsavelDaEtapa(etapa)} (${etapa.ordem} de ${Math.max(total, etapa.ordem)})`;
}

// ---------------------------------------------------------------------------
// Validação do fluxo do órgão
// ---------------------------------------------------------------------------

export interface EtapaFluxoEntrada {
  ordem?: number;
  nome?: string;
  descricao?: string;
  setor_id?: string | null;
  setor_nome?: string | null;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  exige_assinatura?: boolean;
  sugestao_responsavel?: string | null;
}

export interface FluxoEntrada {
  nome?: string;
  tipo_documento?: string | null;
  tipos_documento?: string[] | null;
  modelo_origem?: string | null;
  etapas?: EtapaFluxoEntrada[];
}

export interface FluxoNormalizado {
  nome: string;
  tipo_documento: string | null;
  tipos_documento: string[] | null;
  modelo_origem: string | null;
  etapas: Array<{
    ordem: number;
    nome: string;
    descricao?: string;
    setor_id?: string;
    setor_nome?: string;
    usuario_id?: string;
    usuario_nome?: string;
    exige_assinatura: boolean;
    sugestao_responsavel?: string;
  }>;
}

/**
 * Valida e normaliza o fluxo do órgão. `setores`/`usuarios`: ids (com nome)
 * do órgão — setor ou pessoa de fora é recusado. Fluxo feito a partir de um
 * modelo pronto: toda etapa precisa do setor ou da pessoa escolhidos.
 * Assinatura só na ÚLTIMA etapa (a assinatura fecha a peça).
 */
export function validarFluxoAprovacao(
  corpo: FluxoEntrada,
  ctx: { setores: Map<string, string>; usuarios: Map<string, string> },
  parcial = false,
): { ok: true; valor: FluxoNormalizado } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const nome = String(corpo?.nome ?? '').trim();
  if (!parcial && !nome) erros.push('Dê um nome ao fluxo.');
  const tipos = tiposDoFluxo({ tipo_documento: corpo?.tipo_documento ?? null, tipos_documento: corpo?.tipos_documento ?? null });
  const invalidos = tipos.filter((t) => !tipoDocumentoValido(t));
  if (invalidos.length) erros.push(`Tipo de peça inválido: ${invalidos.join(', ')}.`);
  const etapas = Array.isArray(corpo?.etapas) ? corpo.etapas : [];
  if (!etapas.length) erros.push('O fluxo precisa de pelo menos uma etapa.');
  const doModelo = !!corpo?.modelo_origem;
  const normalizadas: FluxoNormalizado['etapas'] = [];
  etapas.forEach((e, i) => {
    const n = i + 1;
    const nomeEtapa = String(e?.nome ?? '').trim();
    if (!nomeEtapa) erros.push(`Etapa ${n}: dê um nome à etapa.`);
    const setorId = e?.setor_id ? String(e.setor_id) : null;
    const usuarioId = e?.usuario_id ? String(e.usuario_id) : null;
    if (setorId && !ctx.setores.has(setorId)) erros.push(`Etapa ${n}: o setor escolhido não é deste órgão.`);
    if (usuarioId && !ctx.usuarios.has(usuarioId)) erros.push(`Etapa ${n}: a pessoa escolhida não é deste órgão.`);
    if (doModelo && !setorId && !usuarioId) {
      const sug = String(e?.sugestao_responsavel ?? '').trim();
      erros.push(`Etapa ${n} ("${nomeEtapa || 'sem nome'}"): escolha o setor ou a pessoa${sug ? ` (sugestão do modelo: ${sug})` : ''}.`);
    }
    if (e?.exige_assinatura && i !== etapas.length - 1) {
      erros.push(`Etapa ${n}: só a última etapa pode exigir assinatura (a assinatura fecha a peça).`);
    }
    normalizadas.push({
      ordem: n,
      nome: nomeEtapa,
      ...(e?.descricao ? { descricao: String(e.descricao).slice(0, 500) } : {}),
      ...(setorId ? { setor_id: setorId, setor_nome: ctx.setores.get(setorId) } : {}),
      ...(usuarioId ? { usuario_id: usuarioId, usuario_nome: ctx.usuarios.get(usuarioId) } : {}),
      exige_assinatura: !!e?.exige_assinatura,
      ...(e?.sugestao_responsavel ? { sugestao_responsavel: String(e.sugestao_responsavel).slice(0, 200) } : {}),
    });
  });
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      nome: nome.slice(0, 200),
      tipo_documento: tipos[0] ?? null,
      tipos_documento: tipos.length ? tipos : null,
      modelo_origem: corpo?.modelo_origem ? String(corpo.modelo_origem).slice(0, 80) : null,
      etapas: normalizadas,
    },
  };
}

/** Outro fluxo ativo do órgão já cobre algum destes tipos (ou é também genérico)? */
export function conflitoDeFluxo<T extends FluxoParaResolver>(fluxos: T[], novo: { id?: string | null; tipos: string[] }): { fluxo: T; tipos: string[] } | null {
  for (const f of fluxos) {
    if (!f.ativo || (novo.id && f.id === novo.id)) continue;
    const deles = tiposDoFluxo(f);
    if (!novo.tipos.length && !deles.length) return { fluxo: f, tipos: [] };
    const comuns = novo.tipos.filter((t) => deles.includes(t));
    if (comuns.length) return { fluxo: f, tipos: comuns };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Modelos prontos (catálogo em dados — semente do boot)
// ---------------------------------------------------------------------------

export interface ModeloProntoSemente {
  codigo: string;
  nome: string;
  descricao: string;
  tipos_documento: string[];
  ordem: number;
  etapas: Array<{ ordem: number; nome: string; descricao?: string; exige_assinatura: boolean; sugestao_responsavel: string }>;
}

/**
 * Carga inicial do catálogo (Câmara — exemplos do dono). Vai para a tabela
 * `modelos_fluxo_aprovacao` no boot; a tela lê da tabela. Só insere o que
 * falta e atualiza o que o admin da plataforma não editou.
 */
export const MODELOS_PRONTOS_SEMENTE: ModeloProntoSemente[] = [
  {
    codigo: 'TR_CONFERIDO_PELO_CHEFE',
    nome: 'TR conferido pelo chefe',
    descricao: 'O chefe do setor que pediu confere o termo de referência antes de ele valer.',
    tipos_documento: [TipoDocumentoFaseInterna.TERMO_REFERENCIA],
    ordem: 1,
    etapas: [
      { ordem: 1, nome: 'Conferência do chefe do setor requisitante', exige_assinatura: false, sugestao_responsavel: 'Chefe do setor requisitante' },
    ],
  },
  {
    codigo: 'PESQUISA_CONFERIDA',
    nome: 'Pesquisa conferida',
    descricao: 'O chefe de Compras confere a pesquisa de preços e o Diretor Administrativo aprova.',
    tipos_documento: [TipoDocumentoFaseInterna.PESQUISA_PRECOS, TipoDocumentoFaseInterna.MAPA_COMPARATIVO_PRECOS],
    ordem: 2,
    etapas: [
      { ordem: 1, nome: 'Conferência do chefe de Compras', exige_assinatura: false, sugestao_responsavel: 'Chefe do setor de Compras' },
      { ordem: 2, nome: 'Aprovação do Diretor Administrativo', exige_assinatura: false, sugestao_responsavel: 'Diretor(a) Administrativo(a)' },
    ],
  },
  {
    codigo: 'MINUTAS_REVISADAS',
    nome: 'Minutas revisadas',
    descricao: 'O agente de contratação revisa as minutas (aviso, contrato e relatório) e a Diretoria Administrativa aprova.',
    tipos_documento: [TipoDocumentoFaseInterna.MINUTA_EDITAL, TipoDocumentoFaseInterna.MINUTA_CONTRATO, TipoDocumentoFaseInterna.RELATORIO_AGENTE],
    ordem: 3,
    etapas: [
      { ordem: 1, nome: 'Revisão do agente de contratação', exige_assinatura: false, sugestao_responsavel: 'Agente de contratação' },
      { ordem: 2, nome: 'Aprovação da Diretoria Administrativa', exige_assinatura: false, sugestao_responsavel: 'Diretoria Administrativa' },
    ],
  },
  {
    codigo: 'DFD_ASSINADO_PELA_DIRETORIA',
    nome: 'DFD assinado pela Diretoria',
    descricao: 'O Diretor Administrativo aprova e assina o DFD.',
    tipos_documento: [TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA],
    ordem: 4,
    etapas: [
      { ordem: 1, nome: 'Aprovação e assinatura do Diretor Administrativo', exige_assinatura: true, sugestao_responsavel: 'Diretor(a) Administrativo(a)' },
    ],
  },
];

/**
 * Rascunho do fluxo do órgão a partir de um modelo pronto: mesmas etapas,
 * SEM setor/pessoa (o órgão escolhe — obrigatório antes de salvar).
 */
export function rascunhoDoModelo(m: { codigo: string; nome: string; tipos_documento: string[]; etapas: ModeloProntoSemente['etapas'] }): FluxoEntrada & { tipos_documento: string[] } {
  const tipos = (m.tipos_documento ?? []).filter(tipoDocumentoValido);
  return {
    nome: m.nome,
    tipo_documento: tipos[0] ?? null,
    tipos_documento: tipos,
    modelo_origem: m.codigo,
    etapas: [...(m.etapas ?? [])]
      .sort((a, b) => a.ordem - b.ordem)
      .map((e, i) => ({
        ordem: i + 1,
        nome: e.nome,
        ...(e.descricao ? { descricao: e.descricao } : {}),
        exige_assinatura: !!e.exige_assinatura,
        sugestao_responsavel: e.sugestao_responsavel,
        setor_id: null,
        usuario_id: null,
      })),
  };
}

/** Valida um modelo pronto (edição pelo admin da plataforma). */
export function validarModeloPronto(corpo: any): { ok: true; valor: Omit<ModeloProntoSemente, 'codigo'> } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const nome = String(corpo?.nome ?? '').trim();
  const descricao = String(corpo?.descricao ?? '').trim();
  if (!nome) erros.push('Dê um nome ao modelo.');
  if (!descricao) erros.push('Descreva em uma linha para que serve o modelo.');
  const tipos = Array.isArray(corpo?.tipos_documento) ? [...new Set(corpo.tipos_documento.map(String))] as string[] : [];
  const invalidos = tipos.filter((t) => !tipoDocumentoValido(t));
  if (invalidos.length) erros.push(`Tipo de peça inválido: ${invalidos.join(', ')}.`);
  const etapas = Array.isArray(corpo?.etapas) ? corpo.etapas : [];
  if (!etapas.length) erros.push('O modelo precisa de pelo menos uma etapa.');
  etapas.forEach((e: any, i: number) => {
    if (!String(e?.nome ?? '').trim()) erros.push(`Etapa ${i + 1}: dê um nome à etapa.`);
    if (!String(e?.sugestao_responsavel ?? '').trim()) erros.push(`Etapa ${i + 1}: diga quem o modelo sugere (ex.: "Chefe do setor requisitante").`);
    if (e?.exige_assinatura && i !== etapas.length - 1) erros.push(`Etapa ${i + 1}: só a última etapa pode exigir assinatura.`);
  });
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      nome: nome.slice(0, 200),
      descricao: descricao.slice(0, 300),
      tipos_documento: tipos,
      ordem: Number.isFinite(Number(corpo?.ordem)) ? Number(corpo.ordem) : 0,
      etapas: etapas.map((e: any, i: number) => ({
        ordem: i + 1,
        nome: String(e.nome).trim().slice(0, 200),
        ...(e?.descricao ? { descricao: String(e.descricao).slice(0, 500) } : {}),
        exige_assinatura: !!e?.exige_assinatura,
        sugestao_responsavel: String(e.sugestao_responsavel).trim().slice(0, 200),
      })),
    },
  };
}
