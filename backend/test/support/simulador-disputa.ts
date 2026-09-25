/**
 * ============================================================================
 * SIMULADOR DE DISPUTA — fornecedores robôs por socket (plano E0 item 3)
 * ============================================================================
 *
 * Motor reutilizável: dado um cenário (licitação com sessão criada e propostas
 * classificadas), conecta N fornecedores robôs no namespace `/disputa-v2` — cada
 * um com o SEU token e a SUA conexão, exatamente como o `useDisputaV3.ts` do
 * frontend (entrar_sala → enviar_lance → novo_lance/lance_confirmado/erro) —,
 * dá lances conforme a estratégia de cada robô, força prorrogações com lances
 * nos últimos segundos, espera o relógio do backend (DisputaTimerService,
 * `criarApp({ crons: true })`) encerrar os itens e devolve um relatório.
 *
 * USO
 *   const cenario = await prepararCenarioDisputa(ctx, { robos: ESTRATEGIAS_PADRAO, semente: 42 });
 *   const sim = new SimuladorDisputa(ctx, cenario, { semente: 42 });
 *   const rel = await sim.executar();          // conecta, disputa, encerra, confere no banco
 *   expect(verificarRanking(rel)).toEqual([]); // verificadores devolvem lista de violações
 *
 * RELÓGIO VIRTUAL (por que se mexe em timestamps pelo DataSource)
 *   O relógio da disputa-v2 lê `sessoes_disputa.tempo_inatividade_minutos` e
 *   `tempo_prorrogacao_minutos`: colunas INT em MINUTOS, e o PUT
 *   /api/disputa-v2/sessao/:id/configuracoes recusa valores < 1. Não há como
 *   configurar segundos. Então o simulador usa os tempos LEGAIS (10 min + 2 min,
 *   IN 73 art. 23), configurados pela API, e "adianta o relógio" de cada item
 *   deslocando para trás, juntos, `disputa_iniciada_em` e `ultimo_lance_em`
 *   (UPDATE direto em itens_licitacao). Deslocar os dois pelo mesmo Δ equivale
 *   a passar Δ de tempo para aquele item: a posição do último lance dentro da
 *   janela (inicial × prorrogação) é preservada e o tempo restante cai Δ.
 *   Só se adianta com os robôs parados (nenhum lance em voo). O Δ acumulado de
 *   cada item fica no relatório (`avancoRelogioMs`) para converter horários
 *   reais em horários virtuais.
 *
 * O motor não conhece "o que é certo": ele registra tudo (tentativas, respostas,
 * eventos por robô, estado final no banco) e os verificadores `verificar*`
 * comparam com as regras (IN 73 art. 21/23). Serve para qualquer modo de
 * disputa futuro: troque a fase final (`executar`) quando o modo mudar.
 */
import { Socket } from 'socket.io-client';
import { AppE2E } from './app';
import {
  FornecedorFixture,
  ItemEntrada,
  LicitacaoFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  levarAteFase,
} from './fixtures';
import { aguardarEvento, conectarSocket } from './socket';
import { FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../../src/licitacoes/entities/licitacao.entity';
import { DisputaTimerService } from '../../src/disputa-v2/disputa-timer.service';

// ---------------------------------------------------------------------------
// Aleatoriedade com semente (determinismo no CI)
// ---------------------------------------------------------------------------

/** mulberry32 — gerador pequeno e determinístico. */
export function criarAleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------------------
// Estratégias
// ---------------------------------------------------------------------------

export type Estrategia =
  /** Cobre o melhor lance a cada rodada (passo aleatório de 0,3% a 1% do estimado). */
  | { tipo: 'agressivo' }
  /** Reduz o próprio lance devagar; às vezes tenta lance inválido (acima do próprio / igual ao melhor). */
  | { tipo: 'conservador'; probInvalido?: number }
  /** Agressivo até ter `k` lances aceitos; depois desiste. */
  | { tipo: 'desiste_apos'; k: number }
  /**
   * Membro de um grupo que dispara o MESMO valor no MESMO milissegundo
   * (um socket por robô). Duas situações por item: valor que vira o melhor
   * lance e valor intermediário (entre o melhor e o próprio).
   */
  | { tipo: 'simultaneo'; grupo: string }
  /** Não dá lance nas rodadas; só nos últimos segundos, para forçar prorrogação. */
  | { tipo: 'ultimos_segundos' };

/** 10 robôs: 3 agressivos, 2 conservadores, 1 desistente, 2 simultâneos, 2 de último segundo. */
export const ESTRATEGIAS_PADRAO: Estrategia[] = [
  { tipo: 'agressivo' },
  { tipo: 'agressivo' },
  { tipo: 'agressivo' },
  { tipo: 'conservador', probInvalido: 0.35 },
  { tipo: 'conservador', probInvalido: 0.35 },
  { tipo: 'desiste_apos', k: 2 },
  { tipo: 'simultaneo', grupo: 'S1' },
  { tipo: 'simultaneo', grupo: 'S1' },
  { tipo: 'ultimos_segundos' },
  { tipo: 'ultimos_segundos' },
];

const rotuloEstrategia = (e: Estrategia) =>
  e.tipo === 'desiste_apos' ? `desiste_apos_${e.k}` : e.tipo === 'simultaneo' ? `simultaneo_${e.grupo}` : e.tipo;

// ---------------------------------------------------------------------------
// Cenário: licitação em sessão, com propostas classificadas
// ---------------------------------------------------------------------------

export interface RoboCenario {
  indice: number;
  fornecedor: FornecedorFixture;
  estrategia: Estrategia;
  /** Proposta (valor TOTAL do item — é a base do lance na v2) por itemId. */
  propostas: Record<string, number>;
}

export interface CenarioDisputa {
  nome: string;
  orgao: OrgaoFixture;
  licitacao: LicitacaoFixture;
  sessaoId: string;
  robos: RoboCenario[];
  /** Valor total estimado (quantidade × unitário) por itemId. */
  estimado: Record<string, number>;
}

export interface OpcoesCenario {
  nome?: string;
  robos?: Estrategia[];
  itens?: ItemEntrada[];
  semente?: number;
  orgao?: OrgaoFixture;
  /** Modo de disputa da licitação (E2.4). Padrão ABERTO. */
  modo?: ModoDisputa;
}

/**
 * Monta o cenário pela API pública: órgão → pregão eletrônico aberto → robôs
 * cadastrados → propostas enviadas pelos próprios robôs → abertura → análise
 * → classificação → sessão criada (POST /api/sessao/:licitacaoId) e iniciada.
 */
export async function prepararCenarioDisputa(ctx: AppE2E, opts: OpcoesCenario = {}): Promise<CenarioDisputa> {
  const aleatorio = criarAleatorio(opts.semente ?? 1);
  const estrategias = opts.robos ?? ESTRATEGIAS_PADRAO;
  const orgao = opts.orgao ?? (await criarOrgao(ctx));
  const licitacao = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
    modo_disputa: opts.modo ?? ModoDisputa.ABERTO,
    itens: opts.itens,
  });
  await levarAteFase(ctx, licitacao, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);

  const estimado: Record<string, number> = {};
  for (const item of licitacao.itens) estimado[item.id] = centavos(item.quantidade * item.valor_unitario_estimado);

  const robos: RoboCenario[] = [];
  const usados = new Set<string>();
  for (let i = 0; i < estrategias.length; i++) {
    const fornecedor = await criarFornecedor(ctx, { porte: i % 3 === 0 ? 'ME' : 'DEMAIS' });
    // Unitário entre 88% e 100% do estimado, sem repetir total no mesmo item
    const unitarios = licitacao.itens.map((item) => {
      let u = centavos(item.valor_unitario_estimado * (0.88 + 0.12 * aleatorio()));
      while (usados.has(`${item.id}:${centavos(u * item.quantidade)}`)) u = centavos(u - 0.01);
      usados.add(`${item.id}:${centavos(u * item.quantidade)}`);
      return u;
    });
    await enviarProposta(ctx, fornecedor, licitacao, unitarios);
    const propostas: Record<string, number> = {};
    licitacao.itens.forEach((item, idx) => (propostas[item.id] = centavos(unitarios[idx] * item.quantidade)));
    robos.push({ indice: i, fornecedor, estrategia: estrategias[i], propostas });
  }

  await abrirSessaoAgora(ctx, licitacao);
  const av = await ctx.http().put(`/api/licitacoes/${licitacao.id}/avancar-fase`).set(bearer(orgao.token)).send({});
  if (av.status !== 200) throw new Error(`[simulador] avançar para análise → ${av.status} ${JSON.stringify(av.body)}`);

  const propostas = await ctx.http().get(`/api/propostas/licitacao/${licitacao.id}`).set(bearer(orgao.token));
  for (const p of propostas.body as any[]) {
    const r = await ctx.http().put(`/api/propostas/${p.id}/classificar`).set(bearer(orgao.token));
    if (r.status !== 200) throw new Error(`[simulador] classificar proposta → ${r.status}`);
  }

  const s = await ctx
    .http()
    .post(`/api/sessao/${licitacao.id}`)
    .set(bearer(orgao.token))
    .send({ pregoeiroId: orgao.id, pregoeiroNome: 'Pregoeiro Simulador' });
  if (s.status !== 201) throw new Error(`[simulador] criar sessão → ${s.status} ${JSON.stringify(s.body)}`);
  const sessaoId: string = s.body.id;
  const ini = await ctx.http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token));
  if (ini.status !== 200) throw new Error(`[simulador] iniciar sessão → ${ini.status} ${JSON.stringify(ini.body)}`);

  return { nome: opts.nome ?? licitacao.numero_processo, orgao, licitacao, sessaoId, robos, estimado };
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export interface EventoRecebido {
  evento: string;
  recebidoEm: number;
  payload: any;
}

export type RotuloTentativa =
  | 'normal'
  | 'invalido_acima_do_proprio'
  | 'invalido_igual_ao_melhor'
  | 'simultaneo_melhor'
  | 'simultaneo_intermediario'
  | 'ultimos_segundos'
  | 'pos_encerramento';

export interface TentativaLance {
  roboId: string;
  itemId: string;
  valor: number;
  rotulo: RotuloTentativa;
  rodada: number;
  /** Id do disparo simultâneo (mesmo valor, mesmo ms), quando houver. */
  grupoSimultaneo?: string;
  enviadoEm: number;
  respondidoEm: number;
  /** O robô recebeu `lance_confirmado`. */
  aceito: boolean;
  /**
   * O lance está gravado no banco (conferido no fim). Pode ser true com
   * `aceito` false: o gateway grava e depois falha ao montar o broadcast.
   */
  gravadoNoBanco: boolean;
  /** Mensagem de recusa do backend (evento `erro`). */
  motivo?: string;
  /** Momento virtual (ms desde o início do item, com o avanço de relógio). */
  momentoVirtualMs: number;
}

export interface RegistroProrrogacao {
  itemId: string;
  roboId: string;
  /** Tempo restante (virtual) quando o lance foi dado. */
  restanteAntesMs: number;
  aceito: boolean;
  /** O item continuou aberto depois do fim original (esperado: true). */
  itemSeguiuAberto: boolean;
}

export interface RankingLinha {
  posicao: number;
  fornecedorId: string;
  fornecedorNome: string;
  melhorValor: number;
}

export interface RelatorioItem {
  itemId: string;
  numero: number;
  propostas: Record<string, number>;
  tentativas: TentativaLance[];
  /** Ranking final do backend (GET /api/disputa-v2/item/:id/melhores após encerrar). */
  ranking: RankingLinha[];
  prorrogacoes: RegistroProrrogacao[];
  /** Lances aceitos cujo momento virtual caiu na janela de prorrogação (últimos P min ou depois). */
  lancesEmProrrogacao: number;
  encerramento: {
    recebidoEm: number | null;
    vencedor: any;
    /** Banco, após o encerramento (fuso do app — comparar só entre si). */
    disputaIniciadaEm: Date | null;
    ultimoLanceEm: Date | null;
    disputaEncerradaEm: Date | null;
    /** Horário virtual do encerramento (real + avanço de relógio). */
    encerradoEmVirtual: Date | null;
  };
  banco: {
    status: string;
    melhorLanceValor: number | null;
    melhorLanceFornecedorId: string | null;
    menorLance: number | null;
    /** Lances de robô (ip ≠ SISTEMA) não cancelados, por fornecedor, na ordem de gravação. */
    lancesPorFornecedor: Record<string, number[]>;
  };
  avancoRelogioMs: number;
}

export interface RelatorioRobo {
  id: string;
  cnpj: string;
  razaoSocial: string;
  estrategia: string;
  eventos: EventoRecebido[];
  contagemEventos: Record<string, number>;
}

export interface RelatorioDisputa {
  cenario: string;
  /** mapeamento_anonimo da sessão: código anônimo → fornecedores que o receberam. */
  codigosAnonimos: Record<string, string[]>;
  licitacaoId: string;
  sessaoId: string;
  itemIds: string[];
  semente: number;
  parametros: { tempoInicialMin: number; prorrogacaoMin: number };
  itens: RelatorioItem[];
  robos: RelatorioRobo[];
  eventosPregoeiro: EventoRecebido[];
  iniciadoEm: number;
  finalizadoEm: number;
  duracaoMs: number;
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export interface OpcoesSimulador {
  semente?: number;
  /** Rodadas de lances antes da fase final. Padrão 4. */
  rodadas?: number;
  /** Lances "de último segundo" por item (cada um força uma prorrogação). Padrão 2. */
  prorrogacoesForcadas?: number;
  /** Tempo restante (s) a que o relógio é adiantado antes do lance de último segundo. Padrão 3. */
  margemSegundos?: number;
  /** Minutos configurados na sessão (IN 73 art. 23: 10 e 2). */
  tempoInicialMin?: number;
  prorrogacaoMin?: number;
  /** Tempo máximo de espera pelo encerramento automático de cada item (ms). Padrão 15000. */
  timeoutEncerramentoMs?: number;
}

interface RoboVivo {
  cenario: RoboCenario;
  socket: Socket;
  eventos: EventoRecebido[];
  aleatorio: () => number;
  /** Lances aceitos por item (contagem) — p/ `desiste_apos`. */
  aceitos: Record<string, number>;
  /** Fila: um lance por vez por robô (o `erro` do gateway não diz de qual lance é). */
  fila: Promise<unknown>;
}

interface EstadoItem {
  itemId: string;
  numero: number;
  inicioReal: number;
  avancoMs: number;
  /** Menor valor de cada robô (proposta ou lance aceito) — visão do simulador. */
  melhorPorRobo: Map<string, number>;
  tentativas: TentativaLance[];
  prorrogacoes: RegistroProrrogacao[];
  encerradoRecebidoEm: number | null;
  vencedor: any;
}

export class SimuladorDisputa {
  private readonly semente: number;
  private readonly rodadas: number;
  private readonly prorrogacoesForcadas: number;
  private readonly margemMs: number;
  private readonly tempoInicialMin: number;
  private readonly prorrogacaoMin: number;
  private readonly timeoutEncerramentoMs: number;

  private robos: RoboVivo[] = [];
  private pregoeiro?: Socket;
  private eventosPregoeiro: EventoRecebido[] = [];
  private itens = new Map<string, EstadoItem>();
  private contadorSimultaneo = 0;

  constructor(
    private readonly ctx: AppE2E,
    private readonly cenario: CenarioDisputa,
    opcoes: OpcoesSimulador = {},
  ) {
    this.semente = opcoes.semente ?? 1;
    this.rodadas = opcoes.rodadas ?? 4;
    this.prorrogacoesForcadas = opcoes.prorrogacoesForcadas ?? 2;
    this.margemMs = (opcoes.margemSegundos ?? 3) * 1000;
    this.tempoInicialMin = opcoes.tempoInicialMin ?? 10;
    this.prorrogacaoMin = opcoes.prorrogacaoMin ?? 2;
    this.timeoutEncerramentoMs = opcoes.timeoutEncerramentoMs ?? 15_000;
  }

  private get T() {
    return this.tempoInicialMin * 60_000;
  }
  private get P() {
    return this.prorrogacaoMin * 60_000;
  }

  // ------------------------------------------------------------------ conexão

  /** Configura a sessão (API), conecta pregoeiro e robôs e entra na sala. */
  async conectar(): Promise<void> {
    const { ctx, cenario } = this;
    const cfg = await ctx
      .http()
      .put(`/api/disputa-v2/sessao/${cenario.sessaoId}/configuracoes`)
      .set(bearer(cenario.orgao.token))
      .send({
        tempo_inatividade_minutos: this.tempoInicialMin,
        tempo_prorrogacao_minutos: this.prorrogacaoMin,
        // Padrão do sistema é 3 min entre lances do mesmo fornecedor; 0 desliga
        intervalo_minimo_lances_minutos: 0,
      });
    if (cfg.status !== 200) throw new Error(`[simulador] configurar sessão → ${cfg.status} ${JSON.stringify(cfg.body)}`);

    this.pregoeiro = await conectarSocket(ctx, '/disputa-v2', { token: cenario.orgao.token });
    this.pregoeiro.onAny((evento, payload) => this.eventosPregoeiro.push({ evento, recebidoEm: Date.now(), payload }));
    const iniPreg = aguardarEvento(this.pregoeiro, 'dados_iniciais', 10_000);
    // E1a: papel e identidade vêm do token do handshake
    this.pregoeiro.emit('entrar_sala', { sessaoId: cenario.sessaoId });
    await iniPreg;

    for (const rc of cenario.robos) {
      const socket = await conectarSocket(ctx, '/disputa-v2', { token: rc.fornecedor.token });
      const eventos: EventoRecebido[] = [];
      socket.onAny((evento, payload) => eventos.push({ evento, recebidoEm: Date.now(), payload }));
      const robo: RoboVivo = {
        cenario: rc,
        socket,
        eventos,
        aleatorio: criarAleatorio(this.semente * 1000 + rc.indice + 1),
        aceitos: {},
        fila: Promise.resolve(),
      };
      const dados = aguardarEvento(socket, 'dados_iniciais', 10_000);
      const negado = aguardarEvento(socket, 'acesso_negado', 10_000).then((p) => {
        throw new Error(`[simulador] robô ${rc.indice} sem acesso: ${JSON.stringify(p)}`);
      });
      negado.catch(() => undefined);
      // Mesmo payload do frontend: nome = razão social do fornecedor logado
      socket.emit('entrar_sala', { sessaoId: cenario.sessaoId });
      await Promise.race([dados, negado]);
      this.robos.push(robo);
    }
  }

  // ------------------------------------------------------------------ lance

  private estado(itemId: string): EstadoItem {
    const e = this.itens.get(itemId);
    if (!e) throw new Error(`[simulador] item desconhecido ${itemId}`);
    return e;
  }

  private melhorGlobal(itemId: string): number {
    return Math.min(...this.estado(itemId).melhorPorRobo.values());
  }

  private meuMelhor(robo: RoboVivo, itemId: string): number {
    return this.estado(itemId).melhorPorRobo.get(robo.cenario.fornecedor.id)!;
  }

  /**
   * Envia um lance pelo socket do robô e espera a resposta (lance_confirmado
   * do mesmo item/valor, ou `erro`). Os lances de um mesmo robô são enfileirados.
   * `disparo`: quando informado, o emit acontece só quando a promessa resolver
   * (usado para soltar vários robôs no mesmo ms).
   */
  private darLance(
    robo: RoboVivo,
    itemId: string,
    valor: number,
    rotulo: RotuloTentativa,
    rodada: number,
    extra: { grupoSimultaneo?: string; disparo?: Promise<void> } = {},
  ): Promise<TentativaLance> {
    const execucao = robo.fila.then(async () => {
      const estado = this.estado(itemId);
      const socket = robo.socket;
      const resposta = new Promise<{ aceito: boolean; motivo?: string }>((resolve) => {
        const timer = setTimeout(() => {
          limpar();
          resolve({ aceito: false, motivo: 'TIMEOUT (sem resposta do gateway em 20 s)' });
        }, 20_000);
        const ok = (p: any) => {
          if (p?.itemId === itemId && Number(p?.valor) === valor) {
            limpar();
            resolve({ aceito: true });
          }
        };
        const erro = (p: any) => {
          limpar();
          resolve({ aceito: false, motivo: p?.mensagem ?? JSON.stringify(p) });
        };
        const limpar = () => {
          clearTimeout(timer);
          socket.off('lance_confirmado', ok);
          socket.off('erro', erro);
        };
        socket.on('lance_confirmado', ok);
        socket.on('erro', erro);
      });
      if (extra.disparo) await extra.disparo;
      const enviadoEm = Date.now();
      socket.emit('enviar_lance', { sessaoId: this.cenario.sessaoId, itemId, valor });
      const r = await resposta;
      const respondidoEm = Date.now();
      const t: TentativaLance = {
        roboId: robo.cenario.fornecedor.id,
        itemId,
        valor,
        rotulo,
        rodada,
        grupoSimultaneo: extra.grupoSimultaneo,
        enviadoEm,
        respondidoEm,
        aceito: r.aceito,
        gravadoNoBanco: false, // conferido em montarRelatorio
        motivo: r.motivo,
        momentoVirtualMs: respondidoEm + estado.avancoMs - estado.inicioReal,
      };
      estado.tentativas.push(t);
      if (r.aceito) {
        const atual = estado.melhorPorRobo.get(t.roboId)!;
        estado.melhorPorRobo.set(t.roboId, Math.min(atual, valor));
        robo.aceitos[itemId] = (robo.aceitos[itemId] ?? 0) + 1;
      }
      return t;
    });
    robo.fila = execucao.catch(() => undefined);
    return execucao;
  }

  // ------------------------------------------------------------------ estratégias

  private passo(robo: RoboVivo, itemId: string): number {
    return Math.max(0.01, centavos(this.cenario.estimado[itemId] * (0.003 + 0.007 * robo.aleatorio())));
  }

  /** Decide o lance de uma rodada comum (sem os simultâneos). */
  private decidir(robo: RoboVivo, itemId: string): { valor: number; rotulo: RotuloTentativa } | null {
    const est = robo.cenario.estrategia;
    const meu = this.meuMelhor(robo, itemId);
    const melhor = this.melhorGlobal(itemId);
    const piso = this.cenario.estimado[itemId] * 0.5;
    const cobrir = () => {
      const v = centavos(Math.min(melhor, meu) - this.passo(robo, itemId));
      return v > piso ? { valor: v, rotulo: 'normal' as const } : null;
    };
    switch (est.tipo) {
      case 'agressivo':
        return cobrir();
      case 'desiste_apos':
        return (robo.aceitos[itemId] ?? 0) >= est.k ? null : cobrir();
      case 'conservador': {
        const sorte = robo.aleatorio();
        if (sorte < (est.probInvalido ?? 0.3)) {
          // Metade: acima do próprio; metade: igual ao melhor (se o melhor não for dele)
          if (robo.aleatorio() < 0.5 || melhor >= meu) {
            return { valor: centavos(meu + this.cenario.estimado[itemId] * 0.01), rotulo: 'invalido_acima_do_proprio' };
          }
          return { valor: melhor, rotulo: 'invalido_igual_ao_melhor' };
        }
        if (sorte < 0.8) return { valor: centavos(meu * (1 - (0.002 + 0.006 * robo.aleatorio()))), rotulo: 'normal' };
        return null;
      }
      case 'simultaneo':
        // Fora do disparo simultâneo, só um lance modesto na 1ª rodada
        return (robo.aceitos[itemId] ?? 0) === 0 ? { valor: centavos(meu * 0.995), rotulo: 'normal' } : null;
      case 'ultimos_segundos':
        return null;
    }
  }

  /** Mesmo valor, mesmo ms, um socket por robô do grupo. */
  private async dispararSimultaneo(
    membros: RoboVivo[],
    itemId: string,
    tipo: 'simultaneo_melhor' | 'simultaneo_intermediario',
    rodada: number,
  ): Promise<void> {
    if (membros.length < 2) return;
    const melhor = this.melhorGlobal(itemId);
    const menorProprio = Math.min(...membros.map((m) => this.meuMelhor(m, itemId)));
    let valor: number;
    if (tipo === 'simultaneo_melhor') {
      valor = centavos(Math.min(melhor, menorProprio) - this.passo(membros[0], itemId));
    } else {
      // Entre o melhor e o menor próprio do grupo: não bate o melhor, mas é válido para os dois
      valor = centavos((melhor + menorProprio) / 2);
      if (!(valor > melhor && valor < menorProprio)) return;
      const ocupado = [...this.estado(itemId).melhorPorRobo.values()].includes(valor);
      if (ocupado) valor = centavos(valor + 0.01);
      if (!(valor > melhor && valor < menorProprio)) return;
    }
    const grupo = `${tipo}#${++this.contadorSimultaneo}`;
    let soltar!: () => void;
    const disparo = new Promise<void>((r) => (soltar = r));
    const ps = membros.map((m) => this.darLance(m, itemId, valor, tipo, rodada, { grupoSimultaneo: grupo, disparo }));
    // Todos os robôs estão parados (fila vazia) → os emits saem no mesmo tick
    await dormir(20);
    soltar();
    await Promise.all(ps);
  }

  // ------------------------------------------------------------------ relógio

  /** Lê o item e calcula o tempo restante com a MESMA regra do DisputaTimerService. */
  private async lerItem(itemId: string): Promise<any> {
    const [row] = await this.ctx.dataSource.query(
      `SELECT status_disputa, disputa_iniciada_em, ultimo_lance_em, disputa_encerrada_em,
              melhor_lance_valor, melhor_lance_fornecedor_id
         FROM itens_licitacao WHERE id = $1`,
      [itemId],
    );
    return row;
  }

  private restanteMs(row: any, agora = Date.now()): number {
    const inicio = new Date(row.disputa_iniciada_em).getTime();
    const ultimo = row.ultimo_lance_em ? new Date(row.ultimo_lance_em).getTime() : inicio;
    const decorrido = agora - inicio;
    const momento = ultimo - inicio;
    if (decorrido < this.T && momento < this.T - this.P) return this.T - decorrido;
    return Math.max(0, this.P - (agora - ultimo));
  }

  /**
   * Adianta o relógio de um item em `ms` (virtual). Ver cabeçalho: não há
   * configuração em segundos, então os dois marcos do item são deslocados
   * juntos pelo DataSource. Só com o item EM_DISPUTA e sem lance em voo.
   */
  private async avancarRelogio(itemId: string, ms: number): Promise<void> {
    if (ms <= 0) return;
    await this.ctx.dataSource.query(
      `UPDATE itens_licitacao
          SET disputa_iniciada_em = disputa_iniciada_em - ($1::double precision * interval '1 millisecond'),
              ultimo_lance_em     = ultimo_lance_em     - ($1::double precision * interval '1 millisecond')
        WHERE id = $2 AND status_disputa = 'EM_DISPUTA'`,
      [Math.round(ms), itemId],
    );
    this.estado(itemId).avancoMs += Math.round(ms);
  }

  /** Adianta até faltar `restanteAlvoMs` para o fim (virtual). */
  private async adiantarAte(itemId: string, restanteAlvoMs: number): Promise<number> {
    const row = await this.lerItem(itemId);
    const restante = this.restanteMs(row);
    await this.avancarRelogio(itemId, restante - restanteAlvoMs);
    return Math.min(restante, restanteAlvoMs);
  }

  // ------------------------------------------------------------------ execução

  /** Roda a disputa completa (conecta se preciso) e devolve o relatório. */
  async executar(): Promise<RelatorioDisputa> {
    const iniciadoEm = Date.now();
    if (!this.pregoeiro) await this.conectar();
    const itemIds = this.cenario.licitacao.itens.map((i) => i.id);

    // 1. Pregoeiro inicia todos os itens pelo socket (como a tela V3)
    const iniciados = aguardarEvento(this.pregoeiro!, 'itens_iniciados', 15_000);
    this.pregoeiro!.emit('iniciar_itens', { sessaoId: this.cenario.sessaoId, itensIds: itemIds });
    await iniciados;
    const inicioReal = Date.now();
    for (const item of this.cenario.licitacao.itens) {
      const melhorPorRobo = new Map<string, number>();
      for (const r of this.cenario.robos) melhorPorRobo.set(r.fornecedor.id, r.propostas[item.id]);
      this.itens.set(item.id, {
        itemId: item.id,
        numero: item.numero_item,
        inicioReal,
        avancoMs: 0,
        melhorPorRobo,
        tentativas: [],
        prorrogacoes: [],
        encerradoRecebidoEm: null,
        vencedor: null,
      });
    }
    this.pregoeiro!.on('item_encerrado', (p: any) => {
      const e = this.itens.get(p?.itemId);
      if (e && e.encerradoRecebidoEm === null) {
        e.encerradoRecebidoEm = Date.now();
        e.vencedor = p.vencedor;
      }
    });

    // 2. Rodadas: lances comuns em paralelo; depois os disparos simultâneos, sozinhos
    const grupos = new Map<string, RoboVivo[]>();
    for (const r of this.robos) {
      if (r.cenario.estrategia.tipo === 'simultaneo') {
        const g = r.cenario.estrategia.grupo;
        grupos.set(g, [...(grupos.get(g) ?? []), r]);
      }
    }
    for (let rodada = 1; rodada <= this.rodadas; rodada++) {
      const ps: Promise<unknown>[] = [];
      for (const itemId of itemIds) {
        for (const robo of this.robos) {
          const d = this.decidir(robo, itemId);
          if (d) ps.push(this.darLance(robo, itemId, d.valor, d.rotulo, rodada));
        }
      }
      await Promise.all(ps);
      for (const itemId of itemIds) {
        for (const membros of grupos.values()) {
          if (rodada === 2) await this.dispararSimultaneo(membros, itemId, 'simultaneo_melhor', rodada);
          if (rodada === 3) await this.dispararSimultaneo(membros, itemId, 'simultaneo_intermediario', rodada);
        }
      }
    }

    // 3. Fase final por item (em paralelo): lances nos últimos segundos → prorrogação → encerramento
    const atiradores = this.robos.filter((r) => r.cenario.estrategia.tipo === 'ultimos_segundos');
    const atiradoresOuTodos = atiradores.length ? atiradores : this.robos;
    await Promise.all(
      itemIds.map(async (itemId) => {
        const estado = this.estado(itemId);
        for (let p = 0; p < this.prorrogacoesForcadas; p++) {
          const robo = atiradoresOuTodos[p % atiradoresOuTodos.length];
          const restanteAntes = await this.adiantarAte(itemId, this.margemMs);
          const valor = centavos(Math.min(this.melhorGlobal(itemId), this.meuMelhor(robo, itemId)) - this.passo(robo, itemId));
          const t = await this.darLance(robo, itemId, valor, 'ultimos_segundos', this.rodadas + 1 + p);
          // Espera passar o fim ORIGINAL (margem + 2 s): o item tem de seguir aberto
          await dormir(Math.max(0, this.margemMs - (Date.now() - t.enviadoEm)) + 2_000);
          const row = await this.lerItem(itemId);
          estado.prorrogacoes.push({
            itemId,
            roboId: robo.cenario.fornecedor.id,
            restanteAntesMs: restanteAntes,
            aceito: t.aceito,
            itemSeguiuAberto: row.status_disputa === 'EM_DISPUTA',
          });
        }
        // Sem mais lances: adianta até faltar pouco da janela e espera o relógio do backend
        await this.adiantarAte(itemId, 1_500);
        const limite = Date.now() + this.timeoutEncerramentoMs;
        while (estado.encerradoRecebidoEm === null && Date.now() < limite) await dormir(200);
      }),
    );

    // 4. Lance depois do encerramento (deve ser recusado)
    for (const itemId of itemIds) {
      const robo = this.robos[0];
      const valor = centavos(this.melhorGlobal(itemId) - 1);
      await this.darLance(robo, itemId, valor, 'pos_encerramento', this.rodadas + this.prorrogacoesForcadas + 1);
    }
    await dormir(300); // últimos eventos em trânsito

    const relatorio = await this.montarRelatorio(iniciadoEm);
    return relatorio;
  }

  /** Fecha os sockets do simulador. */
  desconectar(): void {
    this.pregoeiro?.close();
    for (const r of this.robos) r.socket.close();
  }

  private async montarRelatorio(iniciadoEm: number): Promise<RelatorioDisputa> {
    const itens: RelatorioItem[] = [];
    for (const item of this.cenario.licitacao.itens) {
      const e = this.estado(item.id);
      const row = await this.lerItem(item.id);
      const rk = await this.ctx.http().get(`/api/disputa-v2/item/${item.id}/melhores`);
      const lances: Array<{ fornecedor_id: string; valor: string }> = await this.ctx.dataSource.query(
        `SELECT fornecedor_id, valor FROM lances
          WHERE item_id = $1 AND cancelado = false AND ip_origem <> 'SISTEMA'
          ORDER BY created_at ASC, valor DESC`,
        [item.id],
      );
      const [{ menor }] = await this.ctx.dataSource.query(
        `SELECT MIN(valor) AS menor FROM lances WHERE item_id = $1 AND cancelado = false`,
        [item.id],
      );
      const lancesPorFornecedor: Record<string, number[]> = {};
      for (const l of lances) (lancesPorFornecedor[l.fornecedor_id] ??= []).push(Number(l.valor));
      // Reconciliação: o que o robô ouviu × o que ficou gravado. Cada lance
      // gravado (robô + valor) é atribuído a UMA tentativa: primeiro às
      // confirmadas, depois às "recusadas" na ordem de envio (o robô que ouviu
      // erro pode reenviar o mesmo valor, que aí é recusado de verdade).
      const saldo = new Map<string, number>();
      for (const l of lances) {
        const k = `${l.fornecedor_id}|${Number(l.valor)}`;
        saldo.set(k, (saldo.get(k) ?? 0) + 1);
      }
      const ordenadas = [...e.tentativas].sort(
        (x, y) => Number(y.aceito) - Number(x.aceito) || x.enviadoEm - y.enviadoEm,
      );
      for (const t of ordenadas) {
        const k = `${t.roboId}|${t.valor}`;
        t.gravadoNoBanco = (saldo.get(k) ?? 0) > 0;
        if (t.gravadoNoBanco) saldo.set(k, saldo.get(k)! - 1);
      }
      const P = this.P;
      const T = this.T;
      itens.push({
        itemId: item.id,
        numero: item.numero_item,
        propostas: Object.fromEntries(this.cenario.robos.map((r) => [r.fornecedor.id, r.propostas[item.id]])),
        tentativas: e.tentativas,
        ranking: (rk.body as any[]).map((l) => ({
          posicao: l.posicao,
          fornecedorId: l.fornecedorId,
          fornecedorNome: l.fornecedorNome,
          melhorValor: Number(l.melhorValor),
        })),
        prorrogacoes: e.prorrogacoes,
        lancesEmProrrogacao: e.tentativas.filter((t) => t.gravadoNoBanco && t.momentoVirtualMs >= T - P).length,
        encerramento: {
          recebidoEm: e.encerradoRecebidoEm,
          vencedor: e.vencedor,
          disputaIniciadaEm: row.disputa_iniciada_em ? new Date(row.disputa_iniciada_em) : null,
          ultimoLanceEm: row.ultimo_lance_em ? new Date(row.ultimo_lance_em) : null,
          disputaEncerradaEm: row.disputa_encerrada_em ? new Date(row.disputa_encerrada_em) : null,
          encerradoEmVirtual: e.encerradoRecebidoEm ? new Date(e.encerradoRecebidoEm + e.avancoMs) : null,
        },
        banco: {
          status: row.status_disputa,
          melhorLanceValor: row.melhor_lance_valor === null ? null : Number(row.melhor_lance_valor),
          melhorLanceFornecedorId: row.melhor_lance_fornecedor_id,
          menorLance: menor === null ? null : Number(menor),
          lancesPorFornecedor,
        },
        avancoRelogioMs: e.avancoMs,
      });
    }

    const robos: RelatorioRobo[] = this.robos.map((r) => {
      const contagemEventos: Record<string, number> = {};
      for (const ev of r.eventos) contagemEventos[ev.evento] = (contagemEventos[ev.evento] ?? 0) + 1;
      return {
        id: r.cenario.fornecedor.id,
        cnpj: r.cenario.fornecedor.cnpj,
        razaoSocial: r.cenario.fornecedor.razao_social,
        estrategia: rotuloEstrategia(r.cenario.estrategia),
        eventos: r.eventos,
        contagemEventos,
      };
    });

    const mapeamentos: Array<{ codigo_anonimo: string; fornecedor_id: string }> = await this.ctx.dataSource.query(
      `SELECT codigo_anonimo, fornecedor_id FROM mapeamento_anonimo WHERE sessao_id = $1 ORDER BY indice, codigo_anonimo`,
      [this.cenario.sessaoId],
    );
    const codigosAnonimos: Record<string, string[]> = {};
    for (const m of mapeamentos) (codigosAnonimos[m.codigo_anonimo] ??= []).push(m.fornecedor_id);

    const finalizadoEm = Date.now();
    return {
      cenario: this.cenario.nome,
      codigosAnonimos,
      licitacaoId: this.cenario.licitacao.id,
      sessaoId: this.cenario.sessaoId,
      itemIds: this.cenario.licitacao.itens.map((i) => i.id),
      semente: this.semente,
      parametros: { tempoInicialMin: this.tempoInicialMin, prorrogacaoMin: this.prorrogacaoMin },
      itens,
      robos,
      eventosPregoeiro: this.eventosPregoeiro,
      iniciadoEm,
      finalizadoEm,
      duracaoMs: finalizadoEm - iniciadoEm,
    };
  }
}

// ---------------------------------------------------------------------------
// Verificadores de invariantes — cada um devolve a lista de violações ([] = ok)
// ---------------------------------------------------------------------------

/** Lance efetivo = gravado no banco (inclui os "recusados" que o gateway gravou — ver verificarRespostasCoerentes). */
const efetivo = (t: TentativaLance) => t.aceito || t.gravadoNoBanco;

/** Menor valor de cada robô: proposta ou lance efetivo. */
export function melhorEsperadoPorRobo(item: RelatorioItem): Map<string, number> {
  const m = new Map<string, number>(Object.entries(item.propostas));
  for (const t of item.tentativas) if (efetivo(t)) m.set(t.roboId, Math.min(m.get(t.roboId)!, t.valor));
  return m;
}

/** 1. Ranking = ordem do melhor valor de cada robô; sem duplicata; um lugar por robô. */
export function verificarRanking(rel: RelatorioDisputa): string[] {
  const v: string[] = [];
  for (const item of rel.itens) {
    const esperado = melhorEsperadoPorRobo(item);
    const vistos = new Set<string>();
    item.ranking.forEach((l, i) => {
      if (vistos.has(l.fornecedorId)) v.push(`item ${item.numero}: fornecedor ${l.fornecedorId} aparece mais de uma vez`);
      vistos.add(l.fornecedorId);
      if (!esperado.has(l.fornecedorId)) v.push(`item ${item.numero}: ${l.fornecedorId} no ranking não é robô do cenário`);
      else if (Math.abs(esperado.get(l.fornecedorId)! - l.melhorValor) > 0.001)
        v.push(`item ${item.numero}: ${l.fornecedorId} com ${l.melhorValor}, esperado ${esperado.get(l.fornecedorId)}`);
      if (i > 0 && l.melhorValor < item.ranking[i - 1].melhorValor) v.push(`item ${item.numero}: ranking fora de ordem na posição ${i + 1}`);
      if (l.posicao !== i + 1) v.push(`item ${item.numero}: posição ${l.posicao} na linha ${i + 1}`);
    });
    for (const id of esperado.keys()) if (!vistos.has(id)) v.push(`item ${item.numero}: robô ${id} fora do ranking`);
  }
  return v;
}

/** 2. Nenhum lance aceito ≥ o anterior do próprio robô, nem ≥ a proposta (simulador e banco). */
export function verificarLancesDecrescentes(rel: RelatorioDisputa): string[] {
  const v: string[] = [];
  for (const item of rel.itens) {
    const ultimo = new Map<string, number>(Object.entries(item.propostas));
    const aceitos = item.tentativas.filter(efetivo).sort((a, b) => a.respondidoEm - b.respondidoEm);
    for (const t of aceitos) {
      if (t.valor >= item.propostas[t.roboId]) v.push(`item ${item.numero}: aceito ${t.valor} ≥ proposta ${item.propostas[t.roboId]} (${t.roboId})`);
      if (t.valor >= ultimo.get(t.roboId)!) v.push(`item ${item.numero}: aceito ${t.valor} ≥ anterior ${ultimo.get(t.roboId)} (${t.roboId})`);
      ultimo.set(t.roboId, t.valor);
    }
    for (const [forn, valores] of Object.entries(item.banco.lancesPorFornecedor)) {
      let anterior = item.propostas[forn] ?? Infinity;
      for (const val of valores) {
        if (val >= anterior) v.push(`item ${item.numero}: banco tem ${val} ≥ anterior ${anterior} (${forn})`);
        anterior = val;
      }
    }
  }
  return v;
}

/** 3. Disparos simultâneos (mesmo valor, mesmo ms): no máximo um aceito por disparo. */
export function verificarSimultaneos(rel: RelatorioDisputa, tipo?: RotuloTentativa): string[] {
  const v: string[] = [];
  for (const item of rel.itens) {
    const grupos = new Map<string, TentativaLance[]>();
    for (const t of item.tentativas) {
      if (!t.grupoSimultaneo || (tipo && t.rotulo !== tipo)) continue;
      grupos.set(t.grupoSimultaneo, [...(grupos.get(t.grupoSimultaneo) ?? []), t]);
    }
    for (const [g, ts] of grupos) {
      const aceitos = ts.filter(efetivo).length;
      if (aceitos > 1) v.push(`item ${item.numero}: ${g} (R$ ${ts[0].valor}) teve ${aceitos} lances iguais aceitos`);
    }
  }
  return v;
}

/** Quantos disparos simultâneos aconteceram (para o teste não passar "no vazio"). */
export function contarDisparosSimultaneos(rel: RelatorioDisputa, tipo: RotuloTentativa): number {
  const g = new Set<string>();
  for (const item of rel.itens) for (const t of item.tentativas) if (t.grupoSimultaneo && t.rotulo === tipo) g.add(t.grupoSimultaneo);
  return g.size;
}

/**
 * 4. Prorrogação (IN 73 art. 23): lance nos últimos P min estende o fim; o
 * item só encerra após uma janela INTEIRA sem lance; nenhum lance aceito após
 * o encerramento.
 */
export function verificarProrrogacaoEncerramento(rel: RelatorioDisputa, toleranciaAtrasoMs = 10_000): string[] {
  const v: string[] = [];
  const P = rel.parametros.prorrogacaoMin * 60_000;
  for (const item of rel.itens) {
    if (item.prorrogacoes.length === 0) v.push(`item ${item.numero}: nenhuma prorrogação forçada`);
    for (const p of item.prorrogacoes) {
      if (!p.aceito) v.push(`item ${item.numero}: lance de último segundo recusado (${p.roboId})`);
      if (!p.itemSeguiuAberto) v.push(`item ${item.numero}: item encerrou no fim original apesar do lance de último segundo`);
    }
    const e = item.encerramento;
    if (item.banco.status !== 'ENCERRADO' || e.recebidoEm === null) {
      v.push(`item ${item.numero}: não encerrou automaticamente (status ${item.banco.status})`);
      continue;
    }
    if (e.disputaEncerradaEm && e.ultimoLanceEm) {
      const janela = e.disputaEncerradaEm.getTime() - e.ultimoLanceEm.getTime();
      if (janela < P) v.push(`item ${item.numero}: encerrou ${janela} ms após o último lance (< ${P} ms)`);
      if (janela > P + toleranciaAtrasoMs) v.push(`item ${item.numero}: encerrou com atraso (${janela - P} ms além da janela)`);
    }
    for (const t of item.tentativas) {
      if (efetivo(t) && t.enviadoEm > e.recebidoEm) v.push(`item ${item.numero}: lance ${t.valor} aceito após o encerramento`);
      if (t.rotulo === 'pos_encerramento' && efetivo(t)) v.push(`item ${item.numero}: lance pós-encerramento aceito`);
    }
  }
  return v;
}

/** Remove do payload o que é legitimamente identificado (itens já encerrados). */
function semDadosDeItensEncerrados(evento: string, payload: any): any {
  const limpar = (x: any): any => {
    if (Array.isArray(x)) return x.map(limpar);
    if (x && typeof x === 'object') {
      const o: any = {};
      for (const [k, val] of Object.entries(x)) {
        if (k === 'encerrados') continue;
        if (evento === 'item_encerrado' && k === 'vencedor') continue;
        o[k] = limpar(val);
      }
      return o;
    }
    return x;
  };
  return limpar(payload);
}

export interface Vazamento {
  robo: string;
  evento: string;
  identidadeDe: string;
  campo: 'id' | 'cnpj' | 'razao_social';
}

/**
 * 5. Sigilo (IN 73 art. 21 §6º): durante a disputa nenhum robô recebe o id, o
 * CNPJ ou a razão social de outro robô. Dados de itens já encerrados são
 * desconsiderados (a identidade pode ser revelada após o encerramento).
 */
export function encontrarVazamentosIdentidade(rel: RelatorioDisputa): Vazamento[] {
  const out: Vazamento[] = [];
  for (const robo of rel.robos) {
    const outros = rel.robos.filter((o) => o.id !== robo.id);
    for (const ev of robo.eventos) {
      const texto = JSON.stringify(semDadosDeItensEncerrados(ev.evento, ev.payload) ?? null);
      for (const o of outros) {
        if (texto.includes(`"${o.id}"`)) out.push({ robo: robo.id, evento: ev.evento, identidadeDe: o.id, campo: 'id' });
        if (texto.includes(o.cnpj)) out.push({ robo: robo.id, evento: ev.evento, identidadeDe: o.id, campo: 'cnpj' });
        if (texto.includes(JSON.stringify(o.razaoSocial))) out.push({ robo: robo.id, evento: ev.evento, identidadeDe: o.id, campo: 'razao_social' });
      }
    }
  }
  return out;
}

/** 6. Isolamento: robôs de A não recebem nada que cite a sessão/licitação/itens/robôs de B. */
export function encontrarVazamentosEntreLicitacoes(a: RelatorioDisputa, b: RelatorioDisputa): string[] {
  const marcasB = [b.sessaoId, b.licitacaoId, ...b.itemIds, ...b.robos.map((r) => r.id), ...b.robos.map((r) => r.cnpj)];
  const out: string[] = [];
  for (const robo of a.robos) {
    for (const ev of robo.eventos) {
      const texto = JSON.stringify(ev.payload ?? null);
      const achou = marcasB.find((m) => texto.includes(m));
      if (achou) out.push(`robô ${robo.id} (${a.cenario}) recebeu '${ev.evento}' com ${achou} de ${b.cenario}`);
    }
  }
  return out;
}

/** 7. Banco (lances e item.melhor_lance_*) bate com o relatório. */
export function verificarBanco(rel: RelatorioDisputa): string[] {
  const v: string[] = [];
  for (const item of rel.itens) {
    const esperado = melhorEsperadoPorRobo(item);
    let vencedor = '';
    let melhor = Infinity;
    for (const [id, val] of esperado) if (val < melhor) [melhor, vencedor] = [val, id];
    if (item.banco.menorLance !== melhor) v.push(`item ${item.numero}: MIN(lances) ${item.banco.menorLance} ≠ relatório ${melhor}`);
    if (item.banco.melhorLanceValor !== melhor) v.push(`item ${item.numero}: melhor_lance_valor ${item.banco.melhorLanceValor} ≠ ${melhor}`);
    if (item.banco.melhorLanceFornecedorId !== vencedor)
      v.push(`item ${item.numero}: melhor_lance_fornecedor_id ${item.banco.melhorLanceFornecedorId} ≠ ${vencedor}`);
    if (item.ranking[0] && item.ranking[0].fornecedorId !== vencedor) v.push(`item ${item.numero}: 1º do ranking ≠ vencedor`);
    // Todo lance gravado corresponde a uma tentativa de robô (nada "fantasma")
    for (const [forn, valores] of Object.entries(item.banco.lancesPorFornecedor)) {
      for (const val of valores) {
        if (!item.tentativas.some((t) => t.roboId === forn && t.valor === val))
          v.push(`item ${item.numero}: lance ${val} de ${forn} no banco sem tentativa correspondente`);
      }
    }
  }
  return v;
}

/**
 * 7b. A resposta ao robô bate com o banco: todo lance gravado recebeu
 * `lance_confirmado`, e nenhum lance confirmado deixou de ser gravado.
 */
export function verificarRespostasCoerentes(rel: RelatorioDisputa): string[] {
  const v: string[] = [];
  for (const item of rel.itens) {
    for (const t of item.tentativas) {
      if (t.gravadoNoBanco && !t.aceito) v.push(`item ${item.numero}: lance ${t.valor} GRAVADO mas o robô recebeu erro: ${t.motivo}`);
      if (t.aceito && !t.gravadoNoBanco) v.push(`item ${item.numero}: lance ${t.valor} confirmado mas não gravado`);
    }
  }
  return v;
}

/** 5c. Cada fornecedor com código anônimo próprio na sessão (sem "Fornecedor B" para dois). */
export function verificarCodigosAnonimosUnicos(rel: RelatorioDisputa): string[] {
  return Object.entries(rel.codigosAnonimos)
    .filter(([, forns]) => forns.length > 1)
    .map(([cod, forns]) => `'${cod}' atribuído a ${forns.length} fornecedores`);
}

// ---------------------------------------------------------------------------
// Resumo legível
// ---------------------------------------------------------------------------

export function resumirRelatorio(rel: RelatorioDisputa): string {
  const nomes = new Map(rel.robos.map((r, i) => [r.id, `R${String(i + 1).padStart(2, '0')}(${r.estrategia})`]));
  const linhas: string[] = [
    `== Simulador de disputa — ${rel.cenario} (semente ${rel.semente}, ${rel.parametros.tempoInicialMin}+${rel.parametros.prorrogacaoMin} min, ${(rel.duracaoMs / 1000).toFixed(1)} s)`,
  ];
  for (const item of rel.itens) {
    const aceitos = item.tentativas.filter((t) => t.aceito);
    const recusados = item.tentativas.filter((t) => !t.aceito);
    const gravadosComErro = recusados.filter((t) => t.gravadoNoBanco).length;
    const motivos: Record<string, number> = {};
    for (const t of recusados) {
      const m = `${t.rotulo}: ${(t.motivo ?? '').replace(/\(R\$ [^)]*\)/g, '(R$ …)')}`;
      motivos[m] = (motivos[m] ?? 0) + 1;
    }
    linhas.push(
      `-- Item ${item.numero}: ${aceitos.length} aceitos, ${recusados.length} recusados (${gravadosComErro} deles gravados no banco), ${item.prorrogacoes.length} prorrogações forçadas, ${item.lancesEmProrrogacao} lances na janela de prorrogação, relógio adiantado ${(item.avancoRelogioMs / 1000).toFixed(0)} s`,
    );
    for (const [m, n] of Object.entries(motivos)) linhas.push(`   recusa ×${n}: ${m}`);
    linhas.push(
      `   encerramento: real ${item.encerramento.disputaEncerradaEm?.toISOString() ?? '-'} | virtual ${item.encerramento.encerradoEmVirtual?.toISOString() ?? '-'}`,
    );
    for (const l of item.ranking) linhas.push(`   ${l.posicao}º ${nomes.get(l.fornecedorId) ?? l.fornecedorId} R$ ${l.melhorValor.toFixed(2)}`);
  }
  const dup = verificarCodigosAnonimosUnicos(rel);
  if (dup.length) linhas.push(`-- códigos anônimos repetidos: ${dup.join('; ')}`);
  for (const r of rel.robos) {
    linhas.push(`   eventos ${nomes.get(r.id)}: ${Object.entries(r.contagemEventos).map(([k, n]) => `${k}=${n}`).join(' ')}`);
  }
  return linhas.join('\n');
}

// ===========================================================================
// MODOS DE DISPUTA (E2.4) — robôs cientes do modo
// ===========================================================================
//
// Para os modos com fases (aberto-fechado, fechado-aberto, reinício), cada
// robô é um fornecedor com o SEU socket e o SEU token, como no simulador
// acima, mas dirigido pelo teste: dá lance aberto ou lance final fechado, e
// registra TUDO o que recebe — para provar o sigilo (nenhum robô recebe o
// valor de um lance fechado alheio antes do fim do prazo). `expirarFase`
// adianta o relógio SÓ da fase atual do item (etapa aberta, tempo aleatório,
// prazo do lance fechado) e dá um tique do relógio oficial.

export interface RoboModo {
  nome: string;
  fornecedor: FornecedorFixture;
  socket: Socket;
  eventos: EventoRecebido[];
}

export class SalaModos {
  readonly robos = new Map<string, RoboModo>();
  pregoeiro?: { socket: Socket; eventos: EventoRecebido[] };

  constructor(
    private readonly ctx: AppE2E,
    readonly sessaoId: string,
  ) {}

  private gravarTudo(socket: Socket, eventos: EventoRecebido[]) {
    socket.onAny((evento: string, payload: any) => eventos.push({ evento, recebidoEm: Date.now(), payload }));
  }

  private async entrar(token: string): Promise<{ socket: Socket; eventos: EventoRecebido[] }> {
    const socket = await conectarSocket(this.ctx, '/disputa-v2', { token });
    const eventos: EventoRecebido[] = [];
    this.gravarTudo(socket, eventos);
    const espera = aguardarEvento(socket, 'dados_iniciais');
    socket.emit('entrar_sala', { sessaoId: this.sessaoId });
    await espera;
    return { socket, eventos };
  }

  async conectarPregoeiro(orgao: OrgaoFixture) {
    this.pregoeiro = await this.entrar(orgao.token);
    return this.pregoeiro;
  }

  async conectarRobo(nome: string, fornecedor: FornecedorFixture): Promise<RoboModo> {
    const { socket, eventos } = await this.entrar(fornecedor.token);
    const robo = { nome, fornecedor, socket, eventos };
    this.robos.set(nome, robo);
    return robo;
  }

  /** Lance pelo socket (`enviar_lance`): na etapa fechada o motor o registra como LANCE_FECHADO. */
  async lance(nome: string, itemId: string, valor: number): Promise<{ ok: boolean; mensagem?: string }> {
    const robo = this.robos.get(nome)!;
    const resposta = new Promise<{ ok: boolean; mensagem?: string }>((resolve) => {
      const ok = () => {
        robo.socket.off('erro', ko);
        resolve({ ok: true });
      };
      const ko = (p: any) => {
        robo.socket.off('lance_confirmado', ok);
        resolve({ ok: false, mensagem: p?.mensagem });
      };
      robo.socket.once('lance_confirmado', ok);
      robo.socket.once('erro', ko);
    });
    robo.socket.emit('enviar_lance', { sessaoId: this.sessaoId, itemId, valor });
    return resposta;
  }

  /** Lance final fechado explícito pela API (POST /disputa-v2/sessao/:id/lance-fechado). */
  lanceFechadoRest(nome: string, itemId: string, valor: number) {
    const robo = this.robos.get(nome)!;
    return this.ctx
      .http()
      .post(`/api/disputa-v2/sessao/${this.sessaoId}/lance-fechado`)
      .set(bearer(robo.fornecedor.token))
      .send({ itemId, valor });
  }

  /**
   * Adianta o relógio da FASE ATUAL do item até expirar e dá um tique do
   * relógio oficial (DisputaTimerService): etapa aberta (art. 23 ou etapa fixa
   * do aberto-fechado) → tempo aleatório → prazo do lance fechado.
   */
  async expirarFase(itemId: string): Promise<void> {
    const ds = this.ctx.dataSource;
    // Unidade de disputa: item ou LOTE (mesmas colunas — unidade-disputa.ts)
    const [lote] = await ds.query(`SELECT status_disputa::text AS st FROM lotes_licitacao WHERE id = $1`, [itemId]);
    const [item] = lote ? [lote] : await ds.query(`SELECT status_disputa::text AS st FROM itens_licitacao WHERE id = $1`, [itemId]);
    const [est] = await ds.query(`SELECT fase, aleatorio_sorteado_segundos FROM disputa_estado_modo_item WHERE item_id = $1`, [itemId]);
    // Datas calculadas no processo (mesmo fuso do app que grava/lê as colunas `timestamp`)
    const ha = (ms: number) => new Date(Date.now() - ms);
    if (item?.st === 'TEMPO_ALEATORIO') {
      await ds.query(`UPDATE disputa_estado_modo_item SET aleatorio_iniciado_em = $2 WHERE item_id = $1`, [
        itemId,
        ha((Number(est?.aleatorio_sorteado_segundos ?? 600) + 2) * 1000),
      ]);
    } else if (est?.fase === 'FECHADA') {
      await ds.query(`UPDATE disputa_estado_modo_item SET fase_termina_em = $2 WHERE item_id = $1`, [itemId, ha(2000)]);
    } else {
      await ds.query(`UPDATE ${lote ? 'lotes_licitacao' : 'itens_licitacao'} SET disputa_iniciada_em = $2, ultimo_lance_em = $2 WHERE id = $1`, [
        itemId,
        ha(2 * 3_600_000),
      ]);
    }
    await this.ctx.app.get(DisputaTimerService, { strict: false }).verificarItensEmDisputa();
  }

  /** Robôs (e o pregoeiro, como 'PREGOEIRO') que receberam algum payload contendo o texto. */
  quemRecebeu(texto: string, desde = 0): string[] {
    const quem: string[] = [];
    const contem = (evs: EventoRecebido[]) => evs.some((e) => e.recebidoEm >= desde && JSON.stringify(e.payload ?? null).includes(texto));
    for (const [nome, r] of this.robos) if (contem(r.eventos)) quem.push(nome);
    if (this.pregoeiro && contem(this.pregoeiro.eventos)) quem.push('PREGOEIRO');
    return quem;
  }

  fechar() {
    for (const r of this.robos.values()) r.socket.disconnect();
    this.pregoeiro?.socket.disconnect();
  }
}
