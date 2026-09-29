/**
 * CONSTRUTOR DE FLUXO — O MODELO COMO GRAFO (docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md).
 * Tipos e funções PURAS (sem banco).
 *
 * O órgão desenha o caminho da fase interna como um GRAFO: nós (início,
 * etapa, aprovação, condição, fim) e arestas (normal, sim, não, devolve). O
 * motor que já existia (etapas, tarefas, posse, sugestão de envio, travas,
 * permissão por etapa) continua lendo a LISTA DE ETAPAS do modelo — que agora
 * é a PROJEÇÃO do grafo (`projetarGrafo`):
 *  - nó etapa/aprovação/condição → etapa (código, responsável, prazo, peças…);
 *  - aresta normal/sim/não → dependência (`depende_de`; a resposta da
 *    condição fica em `ramos`);
 *  - aresta saindo do início → `raiz`;
 *  - aresta devolve → `devolve_para` da aprovação.
 *
 * Modelo antigo (lista de etapas com dependências) vira grafo equivalente por
 * `grafoDeEtapas` (etapa → nó; dependência → aresta; diligência do parecer →
 * aresta devolve para quem fez a peça). `projetarGrafo(grafoDeEtapas(e))`
 * devolve as MESMAS etapas (teste em `grafo-fluxo.spec.ts`).
 */
import { CATALOGO_ETAPAS } from './catalogo-fluxo';
import { PAPEIS_FASE_INTERNA, PapelFaseInterna } from './codigos';
import {
  CampoCondicao,
  CondicaoFluxo,
  ConclusaoEtapa,
  EtapaDoModelo,
  OperadorCondicao,
  ResponsavelEtapa,
  TipoProcessoFluxo,
  ehContratacaoDireta,
} from './modelo-fluxo';
import { etapasSemente } from './semente-fluxo';

export type TipoNo = 'inicio' | 'etapa' | 'aprovacao' | 'condicao' | 'fim';
export const TIPOS_NO: TipoNo[] = ['inicio', 'etapa', 'aprovacao', 'condicao', 'fim'];
export type RotuloAresta = 'normal' | 'sim' | 'nao' | 'devolve';
export const ROTULOS_ARESTA: RotuloAresta[] = ['normal', 'sim', 'nao', 'devolve'];

export interface NoGrafo {
  id: string;
  tipo: TipoNo;
  nome: string;
  /** Posição no desenho (editor). */
  x: number;
  y: number;
  /** Etapa/aprovação/condição: código da etapa que o motor executa (catálogo: DFD, ETP…; criada pelo órgão: U_…; condição: C_…). */
  codigo?: string;
  /** Tipos de peça que o nó produz (códigos reais: DFD, ETP, TR, PP, DO, PJ, AA…). Vazio = conclui por despacho/registro. */
  pecas?: string[];
  responsavel?: ResponsavelEtapa;
  prazo_dias_uteis?: number | null;
  ia_rascunho?: boolean;
  aprovacao_interna?: boolean;
  dispensavel_por_ato?: boolean;
  obrigatoria?: boolean;
  /** Etapa opcional desligada: fica no desenho, mas o processo passa por ela sem parar (modelos antigos). */
  ligada?: boolean;
  /** Ordem sugerida (desempate da lista); sem ela, depois das anteriores. */
  ordem?: number;
  // Do catálogo (etapa que o sistema sabe fazer) — preenchidos pela normalização/conversão
  grupo?: string;
  grupo_titulo?: string;
  tela?: string | null;
  conclusao?: ConclusaoEtapa;
  fase_maquina?: string;
  portao?: string | null;
  fundamento?: string | null;
  /** Condição: o que o sistema avalia (ou `manual`). */
  condicao?: CondicaoFluxo | null;
}

export interface ArestaGrafo {
  id: string;
  de: string;
  para: string;
  rotulo: RotuloAresta;
}

export interface GrafoFluxo {
  formato: 1;
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
}

/** Ajuste feito na normalização (entrada corrigida ou descartada). */
export interface AjusteGrafo {
  no: string | null;
  mensagem: string;
}

export const LIMITE_NOS = 80;
export const LIMITE_ARESTAS = 300;

export const ehNoDeEtapa = (n: Pick<NoGrafo, 'tipo'> | null | undefined): boolean => !!n && (n.tipo === 'etapa' || n.tipo === 'aprovacao' || n.tipo === 'condicao');
export const ehCodigoCriado = (c: string | null | undefined) => /^U_[A-Z0-9_]{1,38}$/.test(String(c ?? ''));
export const ehCodigoCondicao = (c: string | null | undefined) => /^C_[A-Z0-9_]{1,38}$/.test(String(c ?? ''));
const CODIGOS_CATALOGO = new Set<string>(CATALOGO_ETAPAS.map((c) => c.codigo));
export const ehCodigoDoCatalogo = (c: string | null | undefined) => CODIGOS_CATALOGO.has(String(c ?? ''));

/** Etapas do catálogo que, no modelo antigo, são uma APROVAÇÃO (alguém aprova ou devolve). */
const APROVACOES_DO_CATALOGO = new Set(['AUTORIZACAO_INICIO', 'PARECER', 'CONTROLE_INTERNO', 'AUTORIZACAO']);

const clonar = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------------
// Catálogo das peças (o que um nó pode produzir)
// ---------------------------------------------------------------------------

/** Apelidos aceitos em `pecas` além dos códigos reais (protótipo, IA): levam à etapa do catálogo. */
const APELIDOS: Record<string, string> = {
  PESQUISA: 'PESQUISA',
  RESERVA: 'RESERVA',
  MINUTAS: 'MINUTAS',
  PARECER: 'PARECER',
  CONTROLE: 'CONTROLE_INTERNO',
  CONTROLE_INTERNO: 'CONTROLE_INTERNO',
  AUTORIZACAO: 'AUTORIZACAO',
  AVISO: 'PUBLICACAO',
  PUBLICACAO: 'PUBLICACAO',
  PDO: 'PUBLICACAO',
  AUTORIZACAO_INICIO: 'AUTORIZACAO_INICIO',
  INDICACAO_MODALIDADE: 'INDICACAO_MODALIDADE',
};

/**
 * Peça (código real ou apelido) → etapa do catálogo, no rito do tipo de
 * processo (a justificativa da contratação vai com as minutas na
 * contratação direta e com o TR na licitação).
 */
export function etapaDaPeca(peca: string, tipo: TipoProcessoFluxo): string | null {
  const p = String(peca ?? '').trim().toUpperCase();
  if (!p) return null;
  const direta = ehContratacaoDireta(tipo);
  const c = CATALOGO_ETAPAS.find((x) => (direta ? x.tipos_peca.direta : x.tipos_peca.licitacao).includes(p));
  if (c) return c.codigo;
  if (APELIDOS[p]) return APELIDOS[p];
  return CODIGOS_CATALOGO.has(p) ? p : null;
}

/** Catálogo para o editor: as etapas que o sistema sabe fazer e as peças de cada uma, no rito do tipo. */
export function catalogoDoConstrutor(tipo: TipoProcessoFluxo) {
  const semente = etapasSemente(tipo);
  return semente.map((e) => ({
    codigo: e.codigo,
    titulo: e.titulo,
    grupo_titulo: e.grupo_titulo,
    pecas: e.tipos_peca,
    conclusao: e.conclusao,
    tela: e.tela,
    fundamento: e.fundamento,
    papel_padrao: e.responsavel.papel,
    prazo_padrao: e.prazo_dias_uteis,
    tipo_no_sugerido: APROVACOES_DO_CATALOGO.has(e.codigo) ? 'aprovacao' : 'etapa',
  }));
}

// ---------------------------------------------------------------------------
// Projeção: grafo → etapas (o que o motor executa)
// ---------------------------------------------------------------------------

/** Ordem sugerida dos nós sem `ordem`: depois das anteriores (topológica pelas arestas normais). */
function ordensSugeridas(g: GrafoFluxo): Map<string, number> {
  const r = new Map<string, number>();
  const porId = new Map(g.nos.map((n) => [n.id, n]));
  const entradas = new Map<string, string[]>();
  for (const a of g.arestas) {
    if (a.rotulo === 'devolve' || !porId.has(a.de) || !porId.has(a.para)) continue;
    entradas.set(a.para, [...(entradas.get(a.para) ?? []), a.de]);
  }
  const visitando = new Set<string>();
  const calcular = (id: string): number => {
    if (r.has(id)) return r.get(id)!;
    const n = porId.get(id);
    if (!n) return 0;
    if (typeof n.ordem === 'number' && Number.isFinite(n.ordem)) {
      r.set(id, n.ordem);
      return n.ordem;
    }
    if (visitando.has(id)) return 0; // ciclo: a conferência recusa
    visitando.add(id);
    const antes = (entradas.get(id) ?? []).map(calcular);
    visitando.delete(id);
    const v = antes.length ? Math.max(...antes) + 1 : 1;
    r.set(id, v);
    return v;
  };
  for (const n of g.nos) calcular(n.id);
  return r;
}

/** Fase da máquina herdada pelo nó sem etapa do catálogo: a da anterior mais próxima (ou da seguinte). */
function faseHerdada(g: GrafoFluxo, id: string): string {
  const porId = new Map(g.nos.map((n) => [n.id, n]));
  const procurar = (sentido: 'antes' | 'depois'): string | null => {
    const vistos = new Set<string>([id]);
    let fronteira = [id];
    while (fronteira.length) {
      const prox: string[] = [];
      for (const x of fronteira) {
        for (const a of g.arestas) {
          if (a.rotulo === 'devolve') continue;
          const y = sentido === 'antes' ? (a.para === x ? a.de : null) : a.de === x ? a.para : null;
          if (!y || vistos.has(y)) continue;
          vistos.add(y);
          const n = porId.get(y);
          if (n?.fase_maquina) return n.fase_maquina;
          prox.push(y);
        }
      }
      fronteira = prox;
    }
    return null;
  };
  return procurar('antes') ?? procurar('depois') ?? 'PLANEJAMENTO';
}

const responsavelDo = (r: ResponsavelEtapa | null | undefined): ResponsavelEtapa => ({
  papel: r?.papel ?? null,
  setor_id: r?.setor_id ?? null,
  usuario_id: r?.usuario_id ?? null,
});

/**
 * PROJEÇÃO do grafo na lista de etapas que o motor executa. Só os nós de
 * etapa/aprovação/condição viram etapa; início e fim marcam `raiz` e nada
 * mais. As dependências seguem a ordem das arestas (a do modelo antigo, na
 * conversão).
 */
export function projetarGrafo(g: GrafoFluxo): EtapaDoModelo[] {
  const porId = new Map(g.nos.map((n) => [n.id, n]));
  const ordens = ordensSugeridas(g);
  const saida: EtapaDoModelo[] = [];
  for (const n of g.nos) {
    if (!ehNoDeEtapa(n) || !n.codigo) continue;
    const deps: string[] = [];
    const ramos: Record<string, 'sim' | 'nao'> = {};
    let raiz = false;
    for (const a of g.arestas) {
      if (a.para !== n.id || a.rotulo === 'devolve') continue;
      const src = porId.get(a.de);
      if (!src) continue;
      if (src.tipo === 'inicio') {
        raiz = true;
        continue;
      }
      if (!ehNoDeEtapa(src) || !src.codigo || src.codigo === n.codigo) continue;
      if (!deps.includes(src.codigo)) deps.push(src.codigo);
      if (src.tipo === 'condicao' && (a.rotulo === 'sim' || a.rotulo === 'nao')) ramos[src.codigo] = a.rotulo;
    }
    const condicao = n.tipo === 'condicao';
    const e: EtapaDoModelo = {
      codigo: n.codigo,
      grupo: n.grupo ?? n.codigo,
      grupo_titulo: n.grupo_titulo ?? n.nome,
      titulo: n.nome,
      ordem: ordens.get(n.id) ?? 0,
      tipos_peca: condicao ? [] : [...(n.pecas ?? [])],
      tela: condicao ? null : n.tela ?? null,
      conclusao: condicao ? 'CONDICAO' : n.conclusao ?? 'REGISTRO',
      fase_maquina: n.fase_maquina ?? faseHerdada(g, n.id),
      portao: condicao ? null : n.portao ?? null,
      fundamento: n.fundamento ?? null,
      responsavel: responsavelDo(n.responsavel),
      prazo_dias_uteis: n.prazo_dias_uteis ?? null,
      obrigatoria: n.obrigatoria ?? !condicao,
      ligada: n.ligada !== false,
      ia_rascunho: !!n.ia_rascunho,
      aprovacao_interna: !!n.aprovacao_interna,
      dispensavel_por_ato: !!n.dispensavel_por_ato,
      depende_de: deps,
      no_id: n.id,
      tipo_no: n.tipo as EtapaDoModelo['tipo_no'],
      raiz,
    };
    if (condicao) e.condicao = n.condicao ? clonar(n.condicao) : { campo: 'manual' };
    if (Object.keys(ramos).length) e.ramos = ramos;
    if (n.tipo === 'aprovacao') {
      e.devolve_para = g.arestas
        .filter((a) => a.de === n.id && a.rotulo === 'devolve')
        .map((a) => porId.get(a.para))
        .filter((x): x is NoGrafo => ehNoDeEtapa(x) && !!x!.codigo)
        .map((x) => x.codigo!);
    }
    saida.push(e);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Conversão: modelo antigo (etapas) → grafo equivalente
// ---------------------------------------------------------------------------

/** Etapas das quais `codigo` depende, direta ou indiretamente (pelas dependências gravadas). */
function ancestraisPorDependencia(etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de'>[], codigo: string): Set<string> {
  const deps = new Map(etapas.map((e) => [e.codigo, e.depende_de]));
  const vistos = new Set<string>();
  const fila = [...(deps.get(codigo) ?? [])];
  while (fila.length) {
    const c = fila.shift()!;
    if (vistos.has(c) || c === codigo) continue;
    vistos.add(c);
    fila.push(...(deps.get(c) ?? []));
  }
  return vistos;
}

/**
 * Modelo antigo → GRAFO EQUIVALENTE: cada etapa vira um nó (com todos os
 * campos), cada dependência vira uma aresta normal (na mesma ordem), a etapa
 * sem dependência sai do início, a que ninguém espera vai ao fim. A
 * diligência do parecer vira aresta "devolve" para quem fez cada peça que ele
 * examina (as anteriores com peça); a devolução da autorização, para o
 * relatório e as minutas do agente. Etapas desligadas continuam como nós
 * desligados (o processo passa por elas sem parar — como antes).
 */
export function grafoDeEtapas(etapas: EtapaDoModelo[]): GrafoFluxo {
  const codigos = new Set(etapas.map((e) => e.codigo));
  const nos: NoGrafo[] = [{ id: 'inicio', tipo: 'inicio', nome: 'Início', x: 0, y: 0 }];
  const arestas: ArestaGrafo[] = [];
  let seq = 0;
  const aresta = (de: string, para: string, rotulo: RotuloAresta) => {
    if (arestas.some((a) => a.de === de && a.para === para && a.rotulo === rotulo)) return;
    arestas.push({ id: `a${++seq}`, de, para, rotulo });
  };
  const idDe = new Map<string, string>();
  for (const e of etapas) {
    const id = e.no_id && e.no_id !== 'inicio' && e.no_id !== 'fim' && !idDe.has(e.codigo) ? e.no_id : e.codigo;
    idDe.set(e.codigo, id);
    const tipo: TipoNo = e.tipo_no ?? (e.conclusao === 'CONDICAO' ? 'condicao' : APROVACOES_DO_CATALOGO.has(e.codigo) ? 'aprovacao' : 'etapa');
    const no: NoGrafo = {
      id,
      tipo,
      nome: e.titulo,
      x: 0,
      y: 0,
      codigo: e.codigo,
      pecas: [...(e.tipos_peca ?? [])],
      responsavel: responsavelDo(e.responsavel),
      prazo_dias_uteis: e.prazo_dias_uteis ?? null,
      ia_rascunho: !!e.ia_rascunho,
      aprovacao_interna: !!e.aprovacao_interna,
      dispensavel_por_ato: !!e.dispensavel_por_ato,
      obrigatoria: !!e.obrigatoria,
      ligada: e.ligada !== false,
      ordem: e.ordem,
      grupo: e.grupo,
      grupo_titulo: e.grupo_titulo,
      tela: e.tela ?? null,
      conclusao: e.conclusao,
      fase_maquina: e.fase_maquina,
      portao: e.portao ?? null,
      fundamento: e.fundamento ?? null,
    };
    if (tipo === 'condicao') no.condicao = e.condicao ? clonar(e.condicao) : { campo: 'manual' };
    nos.push(no);
  }
  const fim: NoGrafo = { id: 'fim', tipo: 'fim', nome: 'Fase interna concluída', x: 0, y: 0 };
  for (const e of etapas) {
    const validas = e.depende_de.filter((d) => d !== e.codigo && codigos.has(d));
    for (const d of validas) aresta(idDe.get(d)!, idDe.get(e.codigo)!, e.ramos?.[d] ?? 'normal');
    const raiz = e.raiz === undefined ? validas.length === 0 : e.raiz;
    if (raiz) aresta('inicio', idDe.get(e.codigo)!, 'normal');
  }
  // Devolução: a da aprovação (quando já veio do grafo) ou a de sempre
  for (const e of etapas) {
    const id = idDe.get(e.codigo)!;
    const no = nos.find((n) => n.id === id)!;
    if (no.tipo !== 'aprovacao') continue;
    let alvos: string[];
    if (e.devolve_para !== undefined) alvos = e.devolve_para.filter((c) => codigos.has(c));
    else if (e.codigo === 'PARECER') {
      const anc = ancestraisPorDependencia(etapas, e.codigo);
      alvos = etapas
        .filter((x) => anc.has(x.codigo) && x.ligada !== false && (x.tipos_peca ?? []).length > 0)
        .sort((a, b) => b.ordem - a.ordem || a.codigo.localeCompare(b.codigo))
        .map((x) => x.codigo);
    } else if (e.codigo === 'AUTORIZACAO' && codigos.has('MINUTAS') && ancestraisPorDependencia(etapas, e.codigo).has('MINUTAS')) alvos = ['MINUTAS'];
    else alvos = [];
    for (const c of alvos) aresta(id, idDe.get(c)!, 'devolve');
  }
  nos.push(fim);
  const g: GrafoFluxo = { formato: 1, nos, arestas };
  ligarAoFim(g);
  return autoPosicionar(g);
}

/** Nós de etapa sem saída (normal/sim/não) vão ao fim (cria o fim, se faltar). Muda o grafo recebido. */
export function ligarAoFim(g: GrafoFluxo): void {
  let fim = g.nos.find((n) => n.tipo === 'fim');
  for (const n of g.nos) {
    if (!ehNoDeEtapa(n)) continue;
    if (g.arestas.some((a) => a.de === n.id && a.rotulo !== 'devolve')) continue;
    if (!fim) {
      fim = { id: 'fim', tipo: 'fim', nome: 'Fase interna concluída', x: 0, y: 0 };
      g.nos.push(fim);
    }
    g.arestas.push({ id: novoIdAresta(g), de: n.id, para: fim.id, rotulo: n.tipo === 'condicao' ? 'sim' : 'normal' });
  }
}

function novoIdAresta(g: GrafoFluxo): string {
  const usados = new Set(g.arestas.map((a) => a.id));
  let i = g.arestas.length + 1;
  while (usados.has(`a${i}`)) i++;
  return `a${i}`;
}

/**
 * Posição automática (grafo convertido ou montado pela IA): coluna = maior
 * distância do início pelas arestas normais; linha = ordem dentro da coluna.
 * Devolve uma cópia.
 */
export function autoPosicionar(entrada: GrafoFluxo): GrafoFluxo {
  const g = clonar(entrada);
  const nivel = new Map<string, number>();
  const inicio = g.nos.find((n) => n.tipo === 'inicio');
  if (inicio) {
    nivel.set(inicio.id, 0);
    const fila = [inicio.id];
    let passos = 0;
    while (fila.length && passos < 5000) {
      passos++;
      const x = fila.shift()!;
      for (const a of g.arestas) {
        if (a.de !== x || a.rotulo === 'devolve') continue;
        const nv = (nivel.get(x) ?? 0) + 1;
        if (nv < 60 && (nivel.get(a.para) === undefined || nivel.get(a.para)! < nv)) {
          nivel.set(a.para, nv);
          fila.push(a.para);
        }
      }
    }
  }
  // O fim vai depois de tudo
  const max = Math.max(0, ...[...nivel.entries()].filter(([id]) => g.nos.find((n) => n.id === id)?.tipo !== 'fim').map(([, v]) => v));
  for (const n of g.nos) if (n.tipo === 'fim') nivel.set(n.id, max + 1);
  const porNivel = new Map<number, NoGrafo[]>();
  for (const n of g.nos) {
    const l = nivel.get(n.id) ?? 0;
    porNivel.set(l, [...(porNivel.get(l) ?? []), n]);
  }
  for (const [l, lista] of porNivel) {
    lista
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.id.localeCompare(b.id))
      .forEach((n, i) => {
        n.x = 40 + l * 240;
        n.y = 40 + i * 120;
      });
  }
  return g;
}

// ---------------------------------------------------------------------------
// Normalização (entrada do editor, da IA ou de um modelo pronto)
// ---------------------------------------------------------------------------

export interface ContextoNormalizacao {
  tipo: TipoProcessoFluxo;
  /** Setores do órgão (ids) — só para descartar (IA); o editor recebe o erro na conferência. */
  setores?: string[];
  /** Usuários ativos do órgão (ids). */
  usuarios?: string[];
  /** Descarta responsável de fora do órgão (IA). Sem isso, fica e a conferência aponta. */
  descartarInvalidos?: boolean;
}

const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'NO';

const NOME_PADRAO: Record<TipoNo, string> = { inicio: 'Início', etapa: 'Nova etapa', aprovacao: 'Nova aprovação', condicao: 'Nova pergunta?', fim: 'Fim' };

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(typeof v === 'string' ? v.replace(/\./g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? n : null;
}

/** Responsável aceito como {papel, setor_id, usuario_id} ou {tipo: PAPEL|SETOR|USUARIO, valor}. */
function normalizarResponsavel(r: any, ctx: ContextoNormalizacao, ajustes: AjusteGrafo[], no: string): ResponsavelEtapa {
  const saida: ResponsavelEtapa = { papel: null, setor_id: null, usuario_id: null };
  if (!r || typeof r !== 'object') return saida;
  if (typeof r.tipo === 'string' && 'valor' in r) {
    const v = r.valor ? String(r.valor) : null;
    if (r.tipo === 'PAPEL') saida.papel = v;
    else if (r.tipo === 'SETOR') saida.setor_id = v;
    else if (r.tipo === 'USUARIO') saida.usuario_id = v;
  } else {
    saida.papel = r.papel ? String(r.papel) : null;
    saida.setor_id = r.setor_id ? String(r.setor_id) : null;
    saida.usuario_id = r.usuario_id ? String(r.usuario_id) : null;
  }
  if (saida.papel && !PAPEIS_FASE_INTERNA.includes(saida.papel)) {
    ajustes.push({ no, mensagem: `Papel desconhecido (${saida.papel}) retirado.` });
    saida.papel = null;
  }
  if (ctx.descartarInvalidos) {
    if (saida.setor_id && !(ctx.setores ?? []).includes(saida.setor_id)) {
      ajustes.push({ no, mensagem: 'Setor que não é do órgão retirado.' });
      saida.setor_id = null;
    }
    if (saida.usuario_id && !(ctx.usuarios ?? []).includes(saida.usuario_id)) {
      ajustes.push({ no, mensagem: 'Pessoa que não é do órgão retirada.' });
      saida.usuario_id = null;
    }
  }
  return saida;
}

const OPERADORES_NUMERO: OperadorCondicao[] = ['>', '>=', '<', '<=', 'entre'];
const OPERADORES_TEXTO: OperadorCondicao[] = ['igual', 'diferente', 'em'];

/** Condição limpa (campos e operadores conhecidos); o que não fecha vira `manual` com ajuste. */
export function normalizarCondicao(c: any, ajustes: AjusteGrafo[] = [], no: string | null = null): CondicaoFluxo {
  const campo = String(c?.campo ?? 'manual') as CampoCondicao;
  if (campo === 'manual' || !c || typeof c !== 'object') return { campo: 'manual' };
  if (campo === 'valor_total_estimado') {
    const operador = (OPERADORES_NUMERO.includes(c.operador) ? c.operador : '>') as OperadorCondicao;
    const valor = numero(c.valor);
    const ate = numero(c.valor_ate);
    if (valor === null || valor < 0 || (operador === 'entre' && (ate === null || ate < valor))) {
      ajustes.push({ no, mensagem: 'Condição de valor sem o valor de comparação: ficou para quem conduz responder (manual).' });
      return { campo: 'manual' };
    }
    return { campo, operador, valor, ...(operador === 'entre' ? { valor_ate: ate } : {}) };
  }
  if (campo === 'tipo_contratacao' || campo === 'modalidade') {
    const valores = Array.isArray(c.valores) ? c.valores.map((x: unknown) => texto(x, 60).toUpperCase()).filter(Boolean).slice(0, 20) : [];
    const valor = texto(c.valor, 60).toUpperCase();
    const operador = (OPERADORES_TEXTO.includes(c.operador) ? c.operador : valores.length ? 'em' : 'igual') as OperadorCondicao;
    if (operador === 'em' ? !valores.length && !valor : !valor) {
      ajustes.push({ no, mensagem: 'Condição sem o valor de comparação: ficou para quem conduz responder (manual).' });
      return { campo: 'manual' };
    }
    return operador === 'em' ? { campo, operador, valores: valores.length ? valores : [valor] } : { campo, operador, valor };
  }
  if (campo === 'fundamento_legal') {
    const valor = texto(c.valor, 200);
    const operador = (c.operador === 'igual' ? 'igual' : 'contem') as OperadorCondicao;
    if (!valor) {
      ajustes.push({ no, mensagem: 'Condição do fundamento legal sem o texto de comparação: ficou manual.' });
      return { campo: 'manual' };
    }
    return { campo, operador, valor };
  }
  ajustes.push({ no, mensagem: `Campo de condição desconhecido (${campo}): ficou manual.` });
  return { campo: 'manual' };
}

const bool = (v: unknown, padrao: boolean): boolean => (typeof v === 'boolean' ? v : padrao);

function prazo(v: unknown, padrao: number | null): number | null {
  if (v === undefined) return padrao;
  const n = numero(v);
  if (n === null || n <= 0) return null;
  return Math.min(365, Math.floor(n));
}

/**
 * NORMALIZA o grafo recebido (editor, IA, modelo pronto): ids únicos, tipos
 * e rótulos válidos, peças → etapa do catálogo (código, tela, conclusão…),
 * nó sem peça → etapa criada pelo órgão (conclui por despacho), condição com
 * expressão válida, arestas para nós que existem. Não recusa: o que não fecha
 * vira ajuste; o que a lei ou a estrutura não permitem, a CONFERÊNCIA aponta.
 */
export function normalizarGrafo(entrada: any, ctx: ContextoNormalizacao): { grafo: GrafoFluxo; ajustes: AjusteGrafo[] } {
  const ajustes: AjusteGrafo[] = [];
  const semente = new Map(etapasSemente(ctx.tipo).map((e) => [e.codigo, e]));
  const brutos: any[] = Array.isArray(entrada?.nos) ? entrada.nos.slice(0, LIMITE_NOS) : [];
  if (Array.isArray(entrada?.nos) && entrada.nos.length > LIMITE_NOS) ajustes.push({ no: null, mensagem: `O desenho aceita até ${LIMITE_NOS} caixas; as demais foram descartadas.` });
  const ids = new Set<string>();
  const mapaId = new Map<string, string>();
  const codigosUsados = new Set<string>();
  const nos: NoGrafo[] = [];
  for (const b of brutos) {
    if (!b || typeof b !== 'object') continue;
    const tipo = String(b.tipo ?? '') as TipoNo;
    if (!TIPOS_NO.includes(tipo)) {
      ajustes.push({ no: b.id ? String(b.id) : null, mensagem: `Tipo de caixa desconhecido (${String(b.tipo)}): descartada.` });
      continue;
    }
    const original = texto(b.id, 60);
    let id = original.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || `n${nos.length + 1}`;
    while (ids.has(id)) id = `${id.slice(0, 36)}_${nos.length + 1}`;
    ids.add(id);
    if (original && !mapaId.has(original)) mapaId.set(original, id);
    const nome = texto(b.nome, 120) || NOME_PADRAO[tipo];
    const xy = (v: unknown) => Math.max(0, Math.min(6000, Math.round(numero(v) ?? 0)));
    const no: NoGrafo = { id, tipo, nome, x: xy(b.x), y: xy(b.y) };
    if (tipo === 'etapa' || tipo === 'aprovacao') {
      // Peças → etapa do catálogo
      const entradaPecas: string[] = Array.isArray(b.pecas) ? b.pecas.map((p: unknown) => String(p ?? '')) : [];
      const etapasDasPecas: string[] = [];
      for (const p of entradaPecas) {
        const c = etapaDaPeca(p, ctx.tipo);
        if (!c) ajustes.push({ no: id, mensagem: `Peça desconhecida (${p}) retirada de "${nome}".` });
        else if (!etapasDasPecas.includes(c)) etapasDasPecas.push(c);
      }
      if (!entradaPecas.length && ehCodigoDoCatalogo(b.codigo)) etapasDasPecas.push(String(b.codigo));
      const ordenadas = etapasDasPecas.sort((a, z) => (semente.get(a)?.ordem ?? 0) - (semente.get(z)?.ordem ?? 0));
      if (ordenadas.length > 1) {
        ajustes.push({
          no: id,
          mensagem: `"${nome}" tinha peças de ${ordenadas.length} etapas do sistema (${ordenadas.map((c) => semente.get(c)?.titulo ?? c).join(', ')}): ficou só "${semente.get(ordenadas[0])?.titulo ?? ordenadas[0]}". Use uma caixa para cada.`,
        });
      }
      const cat = ordenadas.length ? semente.get(ordenadas[0]) : undefined;
      if (cat && codigosUsados.has(cat.codigo)) {
        ajustes.push({ no: id, mensagem: `"${cat.titulo}" já está em outra caixa: "${nome}" ficou sem peça (conclui por despacho).` });
      }
      if (cat && !codigosUsados.has(cat.codigo)) {
        codigosUsados.add(cat.codigo);
        Object.assign(no, {
          codigo: cat.codigo,
          pecas: [...cat.tipos_peca],
          grupo: cat.grupo,
          grupo_titulo: cat.grupo_titulo,
          tela: cat.tela,
          conclusao: cat.conclusao,
          fase_maquina: cat.fase_maquina,
          portao: cat.portao,
          fundamento: cat.fundamento,
          ordem: numero(b.ordem) ?? cat.ordem,
          obrigatoria: bool(b.obrigatoria, cat.obrigatoria),
          ligada: bool(b.ligada, true),
          dispensavel_por_ato: bool(b.dispensavel_por_ato, cat.dispensavel_por_ato),
          responsavel: b.responsavel === undefined ? { ...cat.responsavel } : normalizarResponsavel(b.responsavel, ctx, ajustes, id),
          prazo_dias_uteis: prazo(b.prazo_dias_uteis ?? b.prazo, cat.prazo_dias_uteis),
          ia_rascunho: bool(b.ia_rascunho, false),
          aprovacao_interna: bool(b.aprovacao_interna, false) && cat.tipos_peca.length > 0,
        });
      } else {
        // Etapa criada pelo órgão: sem peça do catálogo, conclui por despacho/registro
        let codigo = ehCodigoCriado(b.codigo) ? String(b.codigo) : `U_${slug(id)}`;
        while (codigosUsados.has(codigo)) codigo = `${codigo.slice(0, 34)}_${codigosUsados.size}`;
        codigosUsados.add(codigo);
        Object.assign(no, {
          codigo,
          pecas: [],
          conclusao: 'REGISTRO' as ConclusaoEtapa,
          tela: null,
          portao: null,
          fundamento: texto(b.fundamento, 200) || 'regulamento do órgão',
          ...(numero(b.ordem) !== null ? { ordem: numero(b.ordem)! } : {}),
          obrigatoria: bool(b.obrigatoria, true),
          ligada: bool(b.ligada, true),
          dispensavel_por_ato: false,
          responsavel: normalizarResponsavel(b.responsavel, ctx, ajustes, id),
          prazo_dias_uteis: prazo(b.prazo_dias_uteis ?? b.prazo, null),
          ia_rascunho: bool(b.ia_rascunho, false),
          aprovacao_interna: false,
        });
      }
    } else if (tipo === 'condicao') {
      let codigo = ehCodigoCondicao(b.codigo) ? String(b.codigo) : `C_${slug(id)}`;
      while (codigosUsados.has(codigo)) codigo = `${codigo.slice(0, 34)}_${codigosUsados.size}`;
      codigosUsados.add(codigo);
      Object.assign(no, {
        codigo,
        pecas: [],
        conclusao: 'CONDICAO' as ConclusaoEtapa,
        tela: null,
        portao: null,
        fundamento: null,
        ...(numero(b.ordem) !== null ? { ordem: numero(b.ordem)! } : {}),
        obrigatoria: false,
        ligada: true,
        responsavel:
          b.responsavel === undefined ? { papel: PapelFaseInterna.AGENTE_CONTRATACAO, setor_id: null, usuario_id: null } : normalizarResponsavel(b.responsavel, ctx, ajustes, id),
        prazo_dias_uteis: prazo(b.prazo_dias_uteis ?? b.prazo, null),
        condicao: normalizarCondicao(b.condicao, ajustes, id),
      });
    }
    nos.push(no);
  }
  // Arestas
  const brutas: any[] = Array.isArray(entrada?.arestas) ? entrada.arestas.slice(0, LIMITE_ARESTAS) : [];
  if (Array.isArray(entrada?.arestas) && entrada.arestas.length > LIMITE_ARESTAS) ajustes.push({ no: null, mensagem: `O desenho aceita até ${LIMITE_ARESTAS} ligações; as demais foram descartadas.` });
  const porId = new Map(nos.map((n) => [n.id, n]));
  const arestas: ArestaGrafo[] = [];
  const idsA = new Set<string>();
  for (const b of brutas) {
    if (!b || typeof b !== 'object') continue;
    const de = mapaId.get(texto(b.de, 60)) ?? texto(b.de, 60);
    const para = mapaId.get(texto(b.para, 60)) ?? texto(b.para, 60);
    if (!porId.has(de) || !porId.has(para)) {
      ajustes.push({ no: null, mensagem: 'Ligação com uma caixa que não existe: descartada.' });
      continue;
    }
    if (de === para) {
      ajustes.push({ no: de, mensagem: 'Ligação de uma caixa para ela mesma: descartada.' });
      continue;
    }
    const r = String(b.rotulo ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const rotulo: RotuloAresta = r === 'sim' ? 'sim' : r === 'nao' ? 'nao' : r === 'devolve' ? 'devolve' : 'normal';
    if (arestas.some((a) => a.de === de && a.para === para && a.rotulo === rotulo)) continue;
    let id = texto(b.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || `a${arestas.length + 1}`;
    while (idsA.has(id)) id = `${id.slice(0, 34)}_${arestas.length + 1}`;
    idsA.add(id);
    arestas.push({ id, de, para, rotulo });
  }
  return { grafo: { formato: 1, nos, arestas }, ajustes };
}

// ---------------------------------------------------------------------------
// Edição pela tela antiga (lista de etapas) aplicada no grafo
// ---------------------------------------------------------------------------

const mesmaLista = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * A TELA ANTIGA (`/orgao/configuracoes/fluxo`, lista de etapas) continua
 * funcionando sobre o grafo: os campos de cada etapa vão para o nó do mesmo
 * código; dependência trocada reescreve as arestas que chegam ao nó (as de
 * uma condição mantêm o sim/não); quem ficou sem saída vai ao fim. Devolve
 * uma cópia.
 */
export function aplicarEdicaoLegadaNoGrafo(grafo: GrafoFluxo, antes: EtapaDoModelo[], depois: EtapaDoModelo[]): GrafoFluxo {
  const g = clonar(grafo);
  const porCodigo = new Map(g.nos.filter((n) => ehNoDeEtapa(n) && n.codigo).map((n) => [n.codigo!, n]));
  const inicio = g.nos.find((n) => n.tipo === 'inicio');
  // Etapa do catálogo que ainda não estava no desenho (acrescentada ao catálogo depois): entra como nó
  for (const e of depois) {
    if (porCodigo.has(e.codigo)) continue;
    const novo = grafoDeEtapas([{ ...e, depende_de: [] }]).nos.find((n) => n.codigo === e.codigo)!;
    if (g.nos.some((n) => n.id === novo.id)) novo.id = `${novo.id}_${g.nos.length}`;
    g.nos.push({ ...novo, x: 40, y: 40 + g.nos.length * 20 });
    porCodigo.set(e.codigo, g.nos[g.nos.length - 1]);
    const deps = e.depende_de.filter((d) => d !== e.codigo && porCodigo.has(d));
    for (const d of deps) g.arestas.push({ id: novoIdAresta(g), de: porCodigo.get(d)!.id, para: novo.id, rotulo: 'normal' });
    if (!deps.length && inicio) g.arestas.push({ id: novoIdAresta(g), de: inicio.id, para: novo.id, rotulo: 'normal' });
  }
  for (const e of depois) {
    const no = porCodigo.get(e.codigo);
    if (!no) continue;
    no.nome = e.titulo;
    no.ordem = e.ordem;
    no.responsavel = responsavelDo(e.responsavel);
    no.prazo_dias_uteis = e.prazo_dias_uteis ?? null;
    no.obrigatoria = !!e.obrigatoria;
    no.ligada = e.ligada !== false;
    no.ia_rascunho = !!e.ia_rascunho;
    no.aprovacao_interna = !!e.aprovacao_interna;
    no.dispensavel_por_ato = !!e.dispensavel_por_ato;
    const a = antes.find((x) => x.codigo === e.codigo);
    if (!a || mesmaLista(a.depende_de, e.depende_de)) continue;
    const novas = e.depende_de.filter((d) => d !== e.codigo && porCodigo.has(d));
    // Sai o que deixou de ser dependência (arestas vindas de nós de etapa)
    g.arestas = g.arestas.filter((x) => {
      if (x.para !== no.id || x.rotulo === 'devolve') return true;
      const src = g.nos.find((n) => n.id === x.de);
      if (!src || !ehNoDeEtapa(src)) return true;
      return novas.includes(src.codigo!);
    });
    for (const d of novas) {
      const src = porCodigo.get(d)!;
      if (!g.arestas.some((x) => x.de === src.id && x.para === no.id && x.rotulo !== 'devolve')) {
        g.arestas.push({ id: novoIdAresta(g), de: src.id, para: no.id, rotulo: 'normal' });
      }
    }
    if (inicio) {
      const tinhaInicio = g.arestas.some((x) => x.de === inicio.id && x.para === no.id);
      const antesValidas = a.depende_de.filter((d) => d !== e.codigo && porCodigo.has(d));
      if (!novas.length && !tinhaInicio) g.arestas.push({ id: novoIdAresta(g), de: inicio.id, para: no.id, rotulo: 'normal' });
      if (novas.length && tinhaInicio && !antesValidas.length) g.arestas = g.arestas.filter((x) => !(x.de === inicio.id && x.para === no.id));
    }
  }
  ligarAoFim(g);
  return g;
}
