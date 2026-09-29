/**
 * MOTOR DO FLUXO DESENHADO (construtor de fluxo — docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md).
 * Funções PURAS (sem banco), testadas em `motor-grafo.spec.ts`.
 *
 * SEMÂNTICA (a mesma do protótipo aprovado pelo dono):
 *  - um nó fica disponível quando alguma aresta normal chega nele e NÃO há
 *    predecessor ainda pendente que possa chegar (paralelo espera todos; o
 *    ramo de uma condição que não foi escolhido não bloqueia);
 *  - condição: o sistema avalia a expressão sobre os dados do processo quando
 *    o processo chega a ela (ou quem conduz responde, se for `manual`); só a
 *    saída da resposta segue;
 *  - devolve: a aprovação devolve ao nó-alvo; quando ele conclui de novo, o
 *    processo VOLTA DIRETO para quem devolveu (sem refazer o que está no
 *    meio). Sem aresta devolve, devolve às etapas imediatamente anteriores
 *    (as condições são atravessadas).
 *
 * Duas leituras da mesma regra:
 *  - `simular`: por eventos, no grafo (o "Testar" do editor — nada gravado);
 *  - `etapasVivas` + `etapasDaFaseInterna`: derivada, no processo real (as
 *    peças, os despachos, as decisões e as devoluções dizem o que já foi
 *    feito). O teste de equivalência (`motor-grafo.spec.ts`) percorre os dois
 *    lados e compara, passo a passo, o que está disponível.
 */
import {
  AprovacaoDemandaModelo,
  CondicaoFluxo,
  EtapaDoModelo,
  ErroModelo,
  ModeloFluxo,
  RequisitoLegal,
  ResultadoValidacao,
  TipoProcessoFluxo,
  UsuarioParaSegregacao,
  dependeTransitivamente,
  requisitoSeAplica,
  validarModelo,
} from './modelo-fluxo';
import { CODIGOS_DO_CATALOGO } from './catalogo-fluxo';
import { ROTULO_PAPEL } from './codigos';
import { GrafoFluxo, NoGrafo, ehCodigoDoCatalogo, ehNoDeEtapa, projetarGrafo } from './grafo-fluxo';

// ---------------------------------------------------------------------------
// Condição
// ---------------------------------------------------------------------------

/** Dados do processo que a condição lê. */
export interface DadosCondicao {
  valor_total_estimado?: number | null;
  tipo_contratacao?: string | null;
  modalidade?: string | null;
  fundamento_legal?: string | null;
}

export type Resposta = 'sim' | 'nao';

/** Campos que o editor oferece (rótulo, operadores e opções). */
export const CAMPOS_CONDICAO = [
  { campo: 'manual', rotulo: 'Pergunta para quem conduz (sim ou não)', operadores: [], valor: null },
  { campo: 'valor_total_estimado', rotulo: 'Valor total estimado (R$)', operadores: ['>', '>=', '<', '<=', 'entre'], valor: 'numero' },
  {
    campo: 'tipo_contratacao',
    rotulo: 'Tipo de contratação',
    operadores: ['igual', 'diferente', 'em'],
    valor: 'opcao',
    opcoes: ['COMPRA', 'SERVICO', 'OBRA', 'SERVICO_ENGENHARIA', 'LOCACAO', 'ALIENACAO'],
  },
  { campo: 'modalidade', rotulo: 'Modalidade', operadores: ['igual', 'diferente', 'em'], valor: 'texto' },
  { campo: 'fundamento_legal', rotulo: 'Fundamento legal (contém o texto)', operadores: ['contem', 'igual'], valor: 'texto' },
] as const;

const semAcento = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Avalia a condição com os dados do processo: 'sim' | 'nao'; null = não dá
 * para avaliar (manual, ou o dado ainda não existe — ex.: sem valor estimado).
 */
export function avaliarCondicao(c: CondicaoFluxo | null | undefined, dados: DadosCondicao | null | undefined): Resposta | null {
  if (!c || c.campo === 'manual' || !dados) return null;
  const r = (b: boolean): Resposta => (b ? 'sim' : 'nao');
  if (c.campo === 'valor_total_estimado') {
    const v = dados.valor_total_estimado;
    if (v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) <= 0) return null;
    const n = Number(v);
    const x = Number(c.valor);
    if (!Number.isFinite(x)) return null;
    switch (c.operador) {
      case '>=':
        return r(n >= x);
      case '<':
        return r(n < x);
      case '<=':
        return r(n <= x);
      case 'entre':
        return r(n >= x && n <= Number(c.valor_ate));
      default:
        return r(n > x);
    }
  }
  const atual = semAcento(dados[c.campo]);
  if (!atual) return null;
  if (c.campo === 'fundamento_legal') {
    const alvo = semAcento(c.valor);
    return c.operador === 'igual' ? r(atual === alvo) : r(atual.includes(alvo));
  }
  if (c.operador === 'em') return r((c.valores ?? []).map(semAcento).includes(atual));
  if (c.operador === 'diferente') return r(atual !== semAcento(c.valor));
  return r(atual === semAcento(c.valor));
}

const moeda = (n: number) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Valor total estimado > R$ 50.000,00" — para o histórico e a tela. */
export function descreverCondicao(c: CondicaoFluxo | null | undefined): string {
  if (!c || c.campo === 'manual') return 'resposta de quem conduz (sim ou não)';
  if (c.campo === 'valor_total_estimado') {
    return c.operador === 'entre' ? `valor total estimado entre ${moeda(Number(c.valor))} e ${moeda(Number(c.valor_ate))}` : `valor total estimado ${c.operador ?? '>'} ${moeda(Number(c.valor))}`;
  }
  const rot = { tipo_contratacao: 'tipo de contratação', modalidade: 'modalidade', fundamento_legal: 'fundamento legal' }[c.campo];
  if (c.operador === 'em') return `${rot} é uma de: ${(c.valores ?? []).join(', ')}`;
  if (c.operador === 'contem') return `${rot} contém "${c.valor}"`;
  return `${rot} ${c.operador === 'diferente' ? 'diferente de' : 'igual a'} ${c.valor}`;
}

// ---------------------------------------------------------------------------
// Execução no processo real (derivada): quais etapas o processo ainda pode alcançar
// ---------------------------------------------------------------------------

/**
 * ETAPAS VIVAS: as que o processo alcança pelo caminho desenhado — saem do
 * início (`raiz`) ou de uma etapa viva, sem atravessar a saída não escolhida
 * de uma condição já respondida. Etapa alcançada só por "devolve" (ex.:
 * "Corrigir o pedido") fica viva enquanto houver devolução para ela ou
 * depois de feita. As mortas saem da lista do processo (como uma etapa
 * desligada: quem dependia dela passa a depender do que vinha antes).
 *
 * `null` = modelo antigo (nenhuma etapa tem `raiz`): todas vivas, como antes.
 */
export function etapasVivas(
  etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de' | 'raiz' | 'ramos'>[],
  decisoes: Record<string, Resposta | { resposta: Resposta } | null | undefined>,
  marcas: { retornos?: Record<string, unknown> | null; registros?: Record<string, unknown> | null; reabertas?: Record<string, unknown> | null } = {},
): Set<string> | null {
  if (!etapas.some((e) => e.raiz !== undefined)) return null;
  const resposta = (c: string): Resposta | null => {
    const d = decisoes[c];
    if (!d) return null;
    return typeof d === 'string' ? d : d.resposta ?? null;
  };
  const porCodigo = new Map(etapas.map((e) => [e.codigo, e]));
  const vivas = new Set<string>();
  for (const e of etapas) {
    if (e.raiz === undefined || e.raiz) vivas.add(e.codigo);
    if (marcas.retornos?.[e.codigo] || marcas.registros?.[e.codigo] || marcas.reabertas?.[e.codigo]) vivas.add(e.codigo);
  }
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const e of etapas) {
      if (vivas.has(e.codigo)) continue;
      const alcanca = e.depende_de.some((d) => {
        if (!porCodigo.has(d) || !vivas.has(d)) return false;
        const ramo = e.ramos?.[d];
        if (!ramo) return true;
        const r = resposta(d);
        return r === null || r === ramo;
      });
      if (alcanca) {
        vivas.add(e.codigo);
        mudou = true;
      }
    }
  }
  return vivas;
}

/**
 * PARA ONDE A APROVAÇÃO DEVOLVE: as arestas "devolve" dela; sem elas, as
 * etapas imediatamente anteriores (a condição no caminho é atravessada).
 */
export function alvosDaDevolucao(etapas: Pick<EtapaDoModelo, 'codigo' | 'depende_de' | 'devolve_para' | 'tipo_no'>[], codigo: string): string[] {
  const e = etapas.find((x) => x.codigo === codigo);
  if (!e) return [];
  if (e.devolve_para?.length) return [...e.devolve_para];
  const porCodigo = new Map(etapas.map((x) => [x.codigo, x]));
  const saida: string[] = [];
  const vistos = new Set<string>([codigo]);
  const fila = [...e.depende_de];
  while (fila.length) {
    const c = fila.shift()!;
    if (vistos.has(c)) continue;
    vistos.add(c);
    const x = porCodigo.get(c);
    if (!x) continue;
    if (x.tipo_no === 'condicao') fila.push(...x.depende_de);
    else saida.push(c);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Simulação no grafo ("Testar" do editor) — nada é gravado
// ---------------------------------------------------------------------------

export interface EstadoSimulacao {
  /** Nós com alguém trabalhando agora. */
  ativos: string[];
  /** Nós já feitos (o início conta). */
  feitos: string[];
  /** Devolução em curso: nó corrigindo → quem devolveu. */
  retornos: Record<string, string>;
  /** Respostas das condições. */
  decisoes: Record<string, Resposta>;
  fim: boolean;
}

export type AcaoSimulacao =
  | { tipo: 'iniciar' }
  | { tipo: 'concluir'; no: string }
  | { tipo: 'responder'; no: string; resposta: Resposta }
  | { tipo: 'devolver'; no: string; para?: string[] };

export interface ResultadoSimulacao {
  estado: EstadoSimulacao;
  /** O que aconteceu nesta ação (em ordem). */
  log: string[];
  /** Ação recusada (nada mudou). */
  erro: string | null;
}

export interface OpcoesSimulacao {
  /** Dados do exemplo (as condições automáticas são avaliadas com eles; sem eles, perguntam). */
  dados?: DadosCondicao | null;
  /** "Contabilidade", "Maria"… (rótulo de quem faz o nó). */
  quem?: (n: NoGrafo) => string | null;
}

/** Quem faz o nó, pelo responsável (papel/setor/pessoa) — o serviço troca pelos nomes do órgão. */
export function rotuloPadraoDoResponsavel(n: NoGrafo): string | null {
  const r = n.responsavel;
  if (!r) return null;
  if (r.usuario_id) return 'pessoa designada';
  if (r.setor_id) return 'setor designado';
  if (r.papel) return ROTULO_PAPEL[r.papel as keyof typeof ROTULO_PAPEL] ?? r.papel;
  return null;
}

/**
 * UMA AÇÃO NO TESTE do fluxo (mesma regra do motor): iniciar, concluir um nó
 * ativo, responder uma condição ou devolver (aprovação). Devolve o novo
 * estado e o que aconteceu. Nó desligado é atravessado sem parar.
 */
export function simular(grafo: GrafoFluxo, estadoAtual: EstadoSimulacao | null, acao: AcaoSimulacao, opcoes: OpcoesSimulacao = {}): ResultadoSimulacao {
  const porId = new Map(grafo.nos.map((n) => [n.id, n]));
  const log: string[] = [];
  const quem = (n: NoGrafo) => (opcoes.quem ?? rotuloPadraoDoResponsavel)(n);
  const saidas = (id: string, incluirDevolve = false) => grafo.arestas.filter((a) => a.de === id && (incluirDevolve || a.rotulo !== 'devolve'));
  const entradas = (id: string) => grafo.arestas.filter((a) => a.para === id && a.rotulo !== 'devolve');
  const vazio: EstadoSimulacao = { ativos: [], feitos: [], retornos: {}, decisoes: {}, fim: false };
  const base = acao.tipo === 'iniciar' || !estadoAtual ? vazio : estadoAtual;
  const ativos = new Set(base.ativos);
  const feitos = new Set(base.feitos);
  const retornos = { ...base.retornos };
  const decisoes = { ...base.decisoes };
  let fim = base.fim;
  const recusar = (erro: string): ResultadoSimulacao => ({ estado: estadoAtual ?? vazio, log: [], erro });
  const estado = (): EstadoSimulacao => ({ ativos: [...ativos], feitos: [...feitos], retornos, decisoes, fim });

  /**
   * Predecessor que ainda pode chegar: alcançável do início pelas setas
   * normais sem atravessar a saída não escolhida de uma condição respondida
   * (ou em correção por devolução). É o mesmo critério do processo real
   * (`etapasVivas`) e não depende da ordem em que as saídas são percorridas
   * (o protótipo olhava só a partir dos nós ativos no momento e, conforme a
   * ordem das setas, deixava a autorização começar antes do parecer).
   */
  const vivos = (): Set<string> => {
    const v = new Set<string>();
    const ini = grafo.nos.find((n) => n.tipo === 'inicio');
    const pilha = ini ? [ini.id] : [];
    for (const t of Object.keys(retornos)) pilha.push(t);
    while (pilha.length) {
      const x = pilha.pop()!;
      if (v.has(x)) continue;
      v.add(x);
      const nx = porId.get(x);
      for (const a of saidas(x)) {
        if (nx?.tipo === 'condicao' && decisoes[x] && a.rotulo !== decisoes[x]) continue;
        pilha.push(a.para);
      }
    }
    return v;
  };
  const podeAindaChegar = (p: string): boolean => vivos().has(p);

  const seguir = (id: string, resposta?: Resposta) => {
    const n = porId.get(id)!;
    for (const a of saidas(id)) {
      if (n.tipo === 'condicao' && a.rotulo !== resposta) continue;
      chegar(a.para);
    }
  };

  const chegar = (id: string) => {
    const n = porId.get(id);
    if (!n) return;
    if (ativos.has(id) || feitos.has(id)) return;
    const pendentes = entradas(id).filter((a) => !feitos.has(a.de) && podeAindaChegar(a.de));
    if (pendentes.length) return; // espera as etapas em paralelo
    if (n.tipo === 'fim') {
      feitos.add(id);
      fim = true;
      log.push(`Fim: ${n.nome}`);
      return;
    }
    if (ehNoDeEtapa(n) && n.ligada === false) {
      // Etapa desligada: o processo passa por ela sem parar
      feitos.add(id);
      seguir(id);
      return;
    }
    if (n.tipo === 'condicao') {
      const r = avaliarCondicao(n.condicao, opcoes.dados);
      if (r) {
        feitos.add(id);
        decisoes[id] = r;
        log.push(`O sistema avaliou "${n.nome}" (${descreverCondicao(n.condicao)}): ${r === 'sim' ? 'sim' : 'não'}`);
        seguir(id, r);
        return;
      }
    }
    ativos.add(id);
    feitos.delete(id);
    const q = n.tipo === 'condicao' ? 'quem conduz' : quem(n);
    log.push(`Chegou${q ? ` para ${q}` : ''}: ${n.nome}`);
  };

  if (acao.tipo === 'iniciar') {
    const ini = grafo.nos.find((n) => n.tipo === 'inicio');
    if (!ini) return recusar('O fluxo não tem início.');
    feitos.add(ini.id);
    log.push(`Começou: ${ini.nome}`);
    for (const a of saidas(ini.id)) chegar(a.para);
    return { estado: estado(), log, erro: null };
  }

  const n = porId.get(acao.no);
  if (!n) return recusar('Caixa não encontrada no desenho.');
  if (!ativos.has(n.id)) return recusar(`"${n.nome}" não está com ninguém agora.`);

  if (acao.tipo === 'devolver') {
    if (n.tipo !== 'aprovacao') return recusar('Só uma aprovação devolve.');
    const permitidos = alvosNoGrafo(grafo, n.id);
    const alvos = acao.para?.length ? acao.para.filter((t) => permitidos.includes(t)) : permitidos;
    if (!alvos.length) return recusar(`"${n.nome}" não tem para onde devolver.`);
    ativos.delete(n.id);
    feitos.delete(n.id);
    log.push(`${quem(n) ?? 'Quem aprova'} devolveu: ${n.nome}`);
    for (const t of alvos) {
      const nt = porId.get(t)!;
      feitos.delete(t);
      ativos.add(t);
      retornos[t] = n.id;
      const q = quem(nt);
      log.push(`Voltou${q ? ` para ${q}` : ''}: ${nt.nome}`);
    }
    return { estado: estado(), log, erro: null };
  }

  if (n.tipo === 'condicao' && acao.tipo !== 'responder') return recusar(`"${n.nome}" é uma pergunta: responda sim ou não.`);
  if (acao.tipo === 'responder' && n.tipo !== 'condicao') return recusar(`"${n.nome}" não é uma pergunta.`);
  ativos.delete(n.id);
  feitos.add(n.id);
  // Corrigiu depois de uma devolução: volta direto para quem devolveu
  if (retornos[n.id]) {
    const volta = porId.get(retornos[n.id])!;
    delete retornos[n.id];
    log.push(`${quem(n) ?? 'Quem faz'} corrigiu: ${n.nome}`);
    // Outras correções da mesma devolução ainda em curso: quem devolveu espera
    if (!Object.values(retornos).includes(volta.id)) {
      ativos.add(volta.id);
      feitos.delete(volta.id);
      const q = quem(volta);
      log.push(`Voltou${q ? ` para ${q}` : ''}: ${volta.nome}`);
    }
    return { estado: estado(), log, erro: null };
  }
  if (acao.tipo === 'responder') {
    decisoes[n.id] = acao.resposta;
    log.push(`Respondido "${acao.resposta === 'sim' ? 'sim' : 'não'}": ${n.nome}`);
    seguir(n.id, acao.resposta);
  } else {
    log.push(`${quem(n) ?? 'Quem faz'} ${n.tipo === 'aprovacao' ? 'aprovou' : 'concluiu'}: ${n.nome}`);
    seguir(n.id);
  }
  return { estado: estado(), log, erro: null };
}

/** Alvos da devolução no grafo (ids): arestas devolve; sem elas, as anteriores (condições atravessadas; o início não). */
export function alvosNoGrafo(grafo: GrafoFluxo, id: string): string[] {
  const porId = new Map(grafo.nos.map((n) => [n.id, n]));
  const devolve = grafo.arestas.filter((a) => a.de === id && a.rotulo === 'devolve' && ehNoDeEtapa(porId.get(a.para))).map((a) => a.para);
  if (devolve.length) return devolve;
  const saida: string[] = [];
  const vistos = new Set<string>([id]);
  const fila = grafo.arestas.filter((a) => a.para === id && a.rotulo !== 'devolve').map((a) => a.de);
  while (fila.length) {
    const x = fila.shift()!;
    if (vistos.has(x)) continue;
    vistos.add(x);
    const n = porId.get(x);
    if (!n || !ehNoDeEtapa(n)) continue;
    if (n.tipo === 'condicao') fila.push(...grafo.arestas.filter((a) => a.para === x && a.rotulo !== 'devolve').map((a) => a.de));
    else saida.push(x);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Conferência (estrutura + lei)
// ---------------------------------------------------------------------------

export interface ItemLei {
  codigo: string;
  ok: boolean;
  texto: string;
  fundamento: string;
}

export interface ResultadoConferencia extends ResultadoValidacao {
  /** Lista da lei (peças exigidas e ordem), item a item — o quadro "conforme a lei" do editor. */
  lei: ItemLei[];
}

export interface OpcoesConferencia {
  tipo: TipoProcessoFluxo;
  requisitos: RequisitoLegal[];
  papeis: string[];
  setores?: string[];
  usuarios?: UsuarioParaSegregacao[];
  aprovacao_demanda?: AprovacaoDemandaModelo;
  exigir_posse_pecas?: boolean;
  nome?: string;
}

/** Até quantas condições a conferência combina as respostas (2^n cenários). */
const LIMITE_CONDICOES_CENARIOS = 8;

const erro = (codigo: string, mensagem: string, etapa: string | null = null, fundamento: string | null = null): ErroModelo => ({ codigo, etapa, fundamento, mensagem });

/**
 * CONFERÊNCIA do grafo — erros bloqueiam ATIVAR; avisos, não.
 * Estrutura: 1 início; ao menos 1 fim; tudo alcançável; toda caixa tem para
 * onde ir; condição com "sim" e "não" (e só elas); "devolve" só de
 * aprovação; sem ciclo nas setas normais (voltar é "devolve"); quem faz
 * definido na etapa criada pelo órgão.
 * Lei (`requisitos_legais_fluxo`, pela validação do modelo sobre a projeção):
 * etapas exigidas, dependências mínimas (ancestrais, ignorando "devolve"),
 * dispensa por ato, aprovação da demanda; e, com condições, cada combinação
 * de respostas: a etapa exigida não pode ser pulada num ramo, e a anterior
 * exigida (ex.: pesquisa antes da autorização) tem de acontecer sempre que a
 * posterior acontece. Segregação de funções e ordem sugerida: avisos.
 */
export function conferirGrafo(grafo: GrafoFluxo, opcoes: OpcoesConferencia): ResultadoConferencia {
  const erros: ErroModelo[] = [];
  const avisos: ErroModelo[] = [];
  const porId = new Map(grafo.nos.map((n) => [n.id, n]));
  const inicios = grafo.nos.filter((n) => n.tipo === 'inicio');
  if (inicios.length !== 1) erros.push(erro('GRAFO_INICIO', inicios.length ? 'O fluxo precisa de exatamente um início.' : 'Falta o início do fluxo.'));
  if (!grafo.nos.some((n) => n.tipo === 'fim')) erros.push(erro('GRAFO_FIM', 'Falta um fim.'));
  for (const a of grafo.arestas) {
    const de = porId.get(a.de);
    const para = porId.get(a.para);
    if (!de || !para) erros.push(erro('GRAFO_ARESTA_INVALIDA', 'Há uma ligação com uma caixa que não existe.'));
    else if (para.tipo === 'inicio') erros.push(erro('GRAFO_ARESTA_INVALIDA', `Nada entra no início ("${de.nome}" aponta para ele).`, de.codigo ?? null));
    else if (de.tipo === 'fim') erros.push(erro('GRAFO_ARESTA_INVALIDA', `Nada sai do fim ("${de.nome}").`));
    else if ((a.rotulo === 'sim' || a.rotulo === 'nao') && de.tipo !== 'condicao') erros.push(erro('GRAFO_ROTULO', `"${de.nome}" não é uma pergunta: a ligação dela não pode ser "sim"/"não".`, de.codigo ?? null));
    else if (a.rotulo === 'devolve' && de.tipo !== 'aprovacao') erros.push(erro('GRAFO_ROTULO', `Só uma aprovação devolve: "${de.nome}" não é aprovação.`, de.codigo ?? null));
  }
  if (inicios.length) {
    const alcance = new Set<string>(inicios.map((n) => n.id));
    const pilha = inicios.map((n) => n.id);
    while (pilha.length) {
      const x = pilha.pop()!;
      for (const a of grafo.arestas) if (a.de === x && !alcance.has(a.para)) {
        alcance.add(a.para);
        pilha.push(a.para);
      }
    }
    for (const n of grafo.nos) if (!alcance.has(n.id)) erros.push(erro('GRAFO_NAO_ALCANCAVEL', `"${n.nome}" não está ligada a nada que venha do início.`, n.codigo ?? null));
  }
  for (const n of grafo.nos) {
    const saidas = grafo.arestas.filter((a) => a.de === n.id && a.rotulo !== 'devolve');
    if (n.tipo !== 'fim' && !saidas.length) erros.push(erro('GRAFO_SEM_SAIDA', `"${n.nome}" não tem para onde ir depois.`, n.codigo ?? null));
    if (n.tipo === 'condicao') {
      const r = saidas.map((a) => a.rotulo);
      if (!r.includes('sim') || !r.includes('nao')) erros.push(erro('GRAFO_CONDICAO_SAIDAS', `Condição "${n.nome}": ligue uma saída "sim" e uma "não".`, n.codigo ?? null));
      if (r.some((x) => x === 'normal')) erros.push(erro('GRAFO_CONDICAO_SAIDAS', `Condição "${n.nome}": toda saída dela é "sim" ou "não".`, n.codigo ?? null));
      const c = n.condicao;
      if (c && c.campo !== 'manual' && c.campo === 'valor_total_estimado' && !Number.isFinite(Number(c.valor))) {
        erros.push(erro('GRAFO_CONDICAO_INVALIDA', `Condição "${n.nome}": informe o valor de comparação.`, n.codigo ?? null));
      }
    }
    if ((n.tipo === 'etapa' || n.tipo === 'aprovacao') && n.ligada !== false) {
      const r = n.responsavel;
      const definido = !!(r && (r.papel || r.setor_id || r.usuario_id));
      if (!definido) {
        if (ehCodigoDoCatalogo(n.codigo)) {
          avisos.push(erro('GRAFO_SEM_RESPONSAVEL', `"${n.nome}" está sem quem faz: no modo por setor a tarefa fica sem dono (no modo simples, vai para quem conduz).`, n.codigo ?? null));
        } else erros.push(erro('GRAFO_SEM_RESPONSAVEL', `"${n.nome}": escolha quem faz (papel, setor ou pessoa).`, n.codigo ?? null));
      }
    }
  }
  const ciclo = cicloNormal(grafo);

  // Lei e modelo (sobre a projeção)
  const etapas = projetarGrafo(grafo);
  const modelo: ModeloFluxo = {
    id: null,
    orgao_id: null,
    tipo_processo: opcoes.tipo,
    codigo: 'CONFERENCIA',
    nome: opcoes.nome ?? 'Fluxo',
    descricao: null,
    versao: 0,
    aprovacao_demanda: opcoes.aprovacao_demanda ?? { exigida: false, etapa: 'DFD', aprovador: { tipo: 'PERMISSAO', valor: null }, aceita_peca_externa: true },
    exigir_posse_pecas: opcoes.exigir_posse_pecas !== false,
    etapas,
  };
  const criados = etapas.filter((e) => !ehCodigoDoCatalogo(e.codigo)).map((e) => e.codigo);
  const v = validarModelo(modelo, opcoes.requisitos, {
    catalogo: [...CODIGOS_DO_CATALOGO, ...criados],
    papeis: opcoes.papeis,
    setores: opcoes.setores,
    usuarios: opcoes.usuarios,
  });
  erros.push(...v.erros);
  avisos.push(...v.avisos);
  // Ciclo que a validação das etapas não vê (passa pelo início ou pelo fim)
  if (ciclo && !v.erros.some((e) => e.codigo === 'CICLO')) {
    erros.push(
      erro('GRAFO_CICLO', `Há um caminho que volta nele mesmo: ${ciclo.map((id) => porId.get(id)?.nome ?? id).join(' → ')}. Para voltar e corrigir, use uma ligação "devolve".`, porId.get(ciclo[0])?.codigo ?? null),
    );
  }

  // Combinações das respostas das condições: a lei vale em todo ramo
  const aplicaveis = opcoes.requisitos.filter((r) => requisitoSeAplica(r, opcoes.tipo));
  const condicoes = etapas.filter((e) => e.tipo_no === 'condicao' && e.ligada);
  const titulo = (c: string) => etapas.find((e) => e.codigo === c)?.titulo ?? c;
  const jaApontado = new Set(erros.map((e) => `${e.codigo}|${e.etapa ?? ''}`));
  if (!ciclo && condicoes.length) {
    if (condicoes.length > LIMITE_CONDICOES_CENARIOS) {
      avisos.push(erro('CONFERENCIA_PARCIAL', `Com mais de ${LIMITE_CONDICOES_CENARIOS} perguntas, a conferência da lei ramo a ramo não é feita: confira à mão que nenhum ramo pula uma etapa exigida.`));
    } else {
      for (let mascara = 0; mascara < 1 << condicoes.length; mascara++) {
        const decisoes: Record<string, Resposta> = {};
        condicoes.forEach((c, i) => (decisoes[c.codigo] = mascara & (1 << i) ? 'sim' : 'nao'));
        const vivas = etapasVivas(etapas, decisoes) ?? new Set(etapas.map((e) => e.codigo));
        const ligadas = (c: string) => vivas.has(c) && !!etapas.find((e) => e.codigo === c)?.ligada;
        const cenario = condicoes
          .filter((c) => vivas.has(c.codigo))
          .map((c) => `"${c.titulo}" = ${decisoes[c.codigo] === 'sim' ? 'sim' : 'não'}`)
          .join('; ');
        for (const r of aplicaveis) {
          const chave = `${r.codigo}|${r.etapa}`;
          if (jaApontado.has(chave) || !etapas.some((e) => e.codigo === r.etapa)) continue;
          if (r.tipo === 'ETAPA_OBRIGATORIA' && !ligadas(r.etapa)) {
            erros.push(erro(r.codigo, `Quando ${cenario}, o processo pula "${titulo(r.etapa)}": ${r.mensagem} (${r.fundamento}).`, r.etapa, r.fundamento));
            jaApontado.add(chave);
          } else if (r.tipo === 'DEPENDENCIA' && r.outra_etapa && ligadas(r.etapa) && etapas.some((e) => e.codigo === r.outra_etapa) && !ligadas(r.outra_etapa)) {
            erros.push(erro(r.codigo, `Quando ${cenario}, "${titulo(r.etapa)}" acontece sem "${titulo(r.outra_etapa)}": ${r.mensagem} (${r.fundamento}).`, r.etapa, r.fundamento));
            jaApontado.add(chave);
          }
        }
      }
    }
  }

  // Quadro da lei, item a item
  const lei: ItemLei[] = [];
  const codigosComErro = new Set(erros.map((e) => e.codigo));
  for (const r of aplicaveis) {
    if (r.tipo === 'ETAPA_OBRIGATORIA') lei.push({ codigo: r.codigo, ok: !codigosComErro.has(r.codigo), texto: `${titulo(r.etapa)}`, fundamento: r.fundamento });
    else if (r.tipo === 'DEPENDENCIA' && r.outra_etapa) {
      const ok = !codigosComErro.has(r.codigo) && etapas.some((e) => e.codigo === r.etapa) && etapas.some((e) => e.codigo === r.outra_etapa) && dependeTransitivamente(etapas, r.etapa, r.outra_etapa);
      lei.push({ codigo: r.codigo, ok, texto: `${titulo(r.outra_etapa)} antes de ${titulo(r.etapa)}`, fundamento: r.fundamento });
    }
  }
  return { ok: erros.length === 0, erros: dedupe(erros), avisos: dedupe(avisos), lei };
}

function dedupe(lista: ErroModelo[]): ErroModelo[] {
  const vistos = new Set<string>();
  return lista.filter((e) => {
    const k = `${e.codigo}|${e.etapa ?? ''}|${e.mensagem}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Ciclo nas setas normais/sim/não (ids, fechando no primeiro) ou null. */
export function cicloNormal(grafo: GrafoFluxo): string[] | null {
  const saidas = new Map<string, string[]>();
  for (const a of grafo.arestas) if (a.rotulo !== 'devolve') saidas.set(a.de, [...(saidas.get(a.de) ?? []), a.para]);
  const cor = new Map<string, 0 | 1 | 2>();
  const pilha: string[] = [];
  let achado: string[] | null = null;
  const visitar = (x: string): boolean => {
    cor.set(x, 1);
    pilha.push(x);
    for (const y of saidas.get(x) ?? []) {
      const k = cor.get(y) ?? 0;
      if (k === 1) {
        achado = [...pilha.slice(pilha.indexOf(y)), y];
        return true;
      }
      if (k === 0 && visitar(y)) return true;
    }
    pilha.pop();
    cor.set(x, 2);
    return false;
  };
  for (const n of grafo.nos) if ((cor.get(n.id) ?? 0) === 0 && visitar(n.id)) break;
  return achado;
}
