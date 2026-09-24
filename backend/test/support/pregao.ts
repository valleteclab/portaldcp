/**
 * Helpers do e2e de pregão eletrônico (sala de disputa, relógio, PNCP).
 *
 * Arquivo separado do resto do support/ de propósito: é usado pelo teste de
 * referência do pregão (pregao-eletronico-completo.e2e-spec.ts) e pode ser
 * reaproveitado pelo simulador de disputa. Nada aqui altera o backend — só
 * encapsula a API pública (REST + socket) do jeito que o frontend a usa.
 */
import { Socket } from 'socket.io-client';
import { ThrottlerStorage } from '@nestjs/throttler';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppE2E } from './app';
import { conectarSocket } from './socket';
import { OrgaoFixture } from './fixtures';
import { pncpMock, RequisicaoCapturada } from './pncp-mock';
import { ItemLicitacao } from '../../src/itens/entities/item-licitacao.entity';
import { DisputaTimerService } from '../../src/disputa-v2/disputa-timer.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ---------------------------------------------------------------------------
// Limite de requisições
// ---------------------------------------------------------------------------

/**
 * O ThrottlerGuard global limita 100 requisições/min por IP. No e2e TUDO vem
 * de 127.0.0.1 (órgão, pregoeiro e quatro fornecedores), e um pregão completo
 * passa disso em poucos segundos — em produção cada participante tem o seu IP.
 * Desliga a contagem só nesta instância do app (não mexe no src/).
 */
export function desligarLimiteDeRequisicoes(ctx: AppE2E): void {
  const storage = ctx.app.get(ThrottlerStorage, { strict: false }) as any;
  storage.increment = async () => ({
    totalHits: 1,
    timeToExpire: 60,
    isBlocked: false,
    timeToBlockExpire: 0,
  });
}

// ---------------------------------------------------------------------------
// Crons
// ---------------------------------------------------------------------------

/**
 * O backend importa ScheduleModule.forRoot() em TRÊS módulos (app.module.ts,
 * catalogo.module.ts, sessao.module.ts): sobem 3 SchedulerRegistry, cada um
 * com TODOS os @Cron (em produção cada cron roda 3×). O criarApp() para só os
 * jobs do registry que o `app.get(SchedulerRegistry)` devolve — os outros dois
 * continuam rodando no e2e (relógio da disputa a cada segundo, transição de
 * fase por data a cada minuto) e tornam o teste não determinístico.
 * Para os jobs de todos os registries desta instância do app.
 */
export function pararTodosOsCrons(ctx: AppE2E): number {
  let parados = 0;
  const modulos: Map<string, any> = (ctx.app as any).container.getModules();
  for (const [, modulo] of modulos) {
    for (const [, provider] of modulo.providers as Map<any, any>) {
      if (provider?.instance instanceof SchedulerRegistry) {
        provider.instance.getCronJobs().forEach((job: any) => {
          if (job.isActive) parados += 1;
          job.stop();
        });
      }
    }
  }
  return parados;
}

// ---------------------------------------------------------------------------
// Socket da sala (/disputa-v2) — mesmo protocolo do useDisputaV3.ts
// ---------------------------------------------------------------------------

export interface EventoRecebido<T = any> {
  evento: string;
  payload: T;
}

/**
 * Espera o PRIMEIRO de vários eventos (ex.: 'lance_confirmado' ou 'erro').
 * Diferente de combinar vários `aguardarEvento`, não deixa promessas
 * penduradas que rejeitam depois do timeout.
 */
export function aguardarUmDe<T = any>(
  socket: Socket,
  eventos: string[],
  timeout = 5000,
): Promise<EventoRecebido<T>> {
  return new Promise((resolve, reject) => {
    const handlers = new Map<string, (p: any) => void>();
    const limpar = () => {
      clearTimeout(timer);
      for (const [ev, h] of handlers) socket.off(ev, h);
    };
    const timer = setTimeout(() => {
      limpar();
      reject(
        new Error(
          `[socket] nenhum de [${eventos.join(', ')}] chegou em ${timeout} ms`,
        ),
      );
    }, timeout);
    for (const ev of eventos) {
      const h = (payload: any) => {
        limpar();
        resolve({ evento: ev, payload });
      };
      handlers.set(ev, h);
      socket.on(ev, h);
    }
  });
}

export interface AtorSala {
  id: string;
  nome: string;
  tipo: 'PREGOEIRO' | 'FORNECEDOR';
  token?: string;
}

export interface EntradaSala {
  socket: Socket;
  /** Evento que respondeu ao `entrar_sala`: 'dados_iniciais' (ok), 'acesso_negado' ou 'erro'. */
  resposta: EventoRecebido;
}

/** Conecta em /disputa-v2 e emite `entrar_sala` como o hook do frontend faz. */
export async function entrarNaSala(
  ctx: AppE2E,
  sessaoId: string,
  ator: AtorSala,
  opts: { usuarioIdDeclarado?: string } = {},
): Promise<EntradaSala> {
  const socket = await conectarSocket(ctx, '/disputa-v2', {
    token: ator.token,
  });
  const espera = aguardarUmDe(socket, [
    'dados_iniciais',
    'acesso_negado',
    'erro',
  ]);
  socket.emit('entrar_sala', {
    sessaoId,
    tipo: ator.tipo,
    // o frontend manda o id que está no localStorage; o gateway confia nele
    usuarioId: opts.usuarioIdDeclarado ?? ator.id,
    usuarioNome: ator.nome,
  });
  return { socket, resposta: await espera };
}

export interface ResultadoLance {
  ok: boolean;
  /** Mensagem do evento 'erro' quando recusado. */
  mensagem?: string;
  payload: any;
}

/** Emite `enviar_lance` e espera 'lance_confirmado' ou 'erro' no mesmo socket. */
export async function darLance(
  socket: Socket,
  sessaoId: string,
  itemId: string,
  valor: number,
): Promise<ResultadoLance> {
  const espera = aguardarUmDe(socket, ['lance_confirmado', 'erro']);
  socket.emit('enviar_lance', { sessaoId, itemId, valor });
  const r = await espera;
  return r.evento === 'lance_confirmado'
    ? { ok: true, payload: r.payload }
    : { ok: false, mensagem: r.payload?.mensagem, payload: r.payload };
}

/** Pregoeiro inicia os itens pela sala (evento `iniciar_itens`, como a V3). */
export async function iniciarItensNaSala(
  socket: Socket,
  sessaoId: string,
  itensIds: string[],
): Promise<EventoRecebido> {
  const espera = aguardarUmDe(socket, ['itens_iniciados', 'erro']);
  socket.emit('iniciar_itens', { sessaoId, itensIds });
  return espera;
}

// ---------------------------------------------------------------------------
// Relógio da disputa
// ---------------------------------------------------------------------------

/**
 * Simula a passagem do tempo de um item em disputa, reescrevendo o início da
 * disputa e o momento do último lance. Não existe rota para isso (e não deve
 * existir): cai para o repositório — o relógio da disputa-v2 lê exatamente
 * esses dois campos (disputa-timer.service.ts, verificarItemModoAberto).
 */
export async function deslocarRelogioItem(
  ctx: AppE2E,
  itemId: string,
  tempos: { inicioHaMs: number; ultimoLanceHaMs: number },
): Promise<void> {
  const agora = Date.now();
  await ctx.dataSource.getRepository(ItemLicitacao).update(itemId, {
    disputa_iniciada_em: new Date(agora - tempos.inicioHaMs),
    ultimo_lance_em: new Date(agora - tempos.ultimoLanceHaMs),
  });
}

/** Recua o relógio de um item (início e último lance) em `ms`, mantendo o intervalo entre eles. */
export async function recuarRelogioItem(
  ctx: AppE2E,
  itemId: string,
  ms: number,
): Promise<void> {
  const item = await ctx.dataSource
    .getRepository(ItemLicitacao)
    .findOneByOrFail({ id: itemId });
  await ctx.dataSource.getRepository(ItemLicitacao).update(itemId, {
    disputa_iniciada_em: new Date(
      new Date(item.disputa_iniciada_em).getTime() - ms,
    ),
    ultimo_lance_em: new Date(new Date(item.ultimo_lance_em).getTime() - ms),
  });
}

/**
 * Um "tique" do relógio oficial da disputa (o @Cron de 1 s do
 * DisputaTimerService), chamado na mão: os crons ficam desligados no e2e para
 * o teste ser determinístico.
 */
export async function tiqueRelogioDisputa(ctx: AppE2E): Promise<void> {
  await ctx.app
    .get(DisputaTimerService, { strict: false })
    .verificarItensEmDisputa();
}

// ---------------------------------------------------------------------------
// Órgão / PNCP
// ---------------------------------------------------------------------------

/**
 * Vincula o órgão ao PNCP (PUT /api/orgaos/:id/pncp, super admin) — sem o
 * código da unidade compradora o PncpService recusa o envio da compra.
 */
export async function vincularOrgaoAoPncp(
  ctx: AppE2E,
  orgao: OrgaoFixture,
): Promise<void> {
  const r = await ctx
    .http()
    .put(`/api/orgaos/${orgao.id}/pncp`)
    .set(bearer(ctx.tokenAdmin()))
    .send({ pncp_vinculado: true, pncp_codigo_unidade: '1' });
  if (r.status !== 200) {
    throw new Error(
      `[pregao] vincular órgão ao PNCP → HTTP ${r.status}: ${JSON.stringify(r.body)}`,
    );
  }
}

/** Espera o PNCP (mock) receber `quantidade` requisições que casem com o filtro. */
export async function aguardarPncp(
  metodo: string,
  caminho: RegExp,
  quantidade = 1,
  timeout = 10_000,
): Promise<RequisicaoCapturada[]> {
  const inicio = Date.now();
  for (;;) {
    const achadas = pncpMock.filtrar(metodo, caminho);
    if (achadas.length >= quantidade) return achadas;
    if (Date.now() - inicio > timeout) return achadas;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Extrai a parte JSON de um corpo multipart capturado pelo mock (o PNCP
 * recebe compra e contrato como multipart: parte JSON + PDF).
 */
export function jsonDaParteMultipart(corpo: unknown, nomeParte: string): any {
  const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  const marca = texto.indexOf(`name="${nomeParte}"`);
  if (marca < 0)
    throw new Error(
      `[pregao] parte "${nomeParte}" não encontrada no multipart`,
    );
  const inicioCorpo = texto.indexOf('\r\n\r\n', marca) + 4;
  const fim = texto.indexOf('\r\n--', inicioCorpo);
  return JSON.parse(texto.slice(inicioCorpo, fim));
}

/** GET /api/licitacoes/:id/processo-completo — a visão do cockpit (orgao/processos/[id]). */
export async function processoCompleto(
  ctx: AppE2E,
  licitacaoId: string,
  token: string,
): Promise<any> {
  const r = await ctx
    .http()
    .get(`/api/licitacoes/${licitacaoId}/processo-completo`)
    .set(bearer(token));
  if (r.status !== 200) {
    throw new Error(
      `[pregao] processo-completo → HTTP ${r.status}: ${JSON.stringify(r.body)}`,
    );
  }
  return r.body;
}
