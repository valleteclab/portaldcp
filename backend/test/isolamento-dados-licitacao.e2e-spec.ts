/**
 * ============================================================================
 * ISOLAMENTO DE DADOS DA LICITAÇÃO — regressão de AUTORIZAÇÃO (QA defensivo)
 * ============================================================================
 *
 * Cada caso afirma o comportamento SEGURO: requisição não autorizada é recusada
 * (401/403/404) ou a resposta não carrega dados de outra parte.
 *
 *  - Onde o sistema já é seguro: `it(...)` normal.
 *  - Onde hoje VAZA: `test.failing(...)` com o comentário
 *    `// VAZAMENTO CONHECIDO: <o quê> — <arquivo:linha> — corrigir na E2`
 *    (E1 para checagem de órgão/tenant nas licitações). O teste passa enquanto
 *    a brecha existir e passa a FALHAR quando for corrigida — aí vira `it`.
 *
 * Cenário (tudo pela API pública):
 *   órgão A (+ pregoeiro) e órgão B (+ pregoeiro);
 *   X = pregão de A em disputa (F1 e F2), sigilo_orcamento = SIGILOSO;
 *   Y = dispensa de A com a janela de lances aberta (F1 e F2);
 *   Z = pregão de B em disputa (só F3);
 *   W = pregão de A em disputa "descartável" (ações destrutivas: se a brecha
 *       existir, estraga W e não X);
 *   W2 = pregão de A com sessão criada e ainda não iniciada (ações do pregoeiro);
 *   P / P2 / P3 = pregões de A em acolhimento (sigilo das propostas);
 *   L1 / L2 = pregões de A na fase interna (atos da licitação).
 *
 * O status HTTP / evento observado em cada caso é impresso no fim (stdout),
 * para distinguir fixture quebrada de brecha real.
 */
import { Socket } from 'socket.io-client';
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  aguardarEvento,
  conectarSocket,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  datasEditalPadrao,
  enviarProposta,
  fecharSockets,
  levarAteFase,
} from './support';
import {
  aguardarUmDe,
  darLance as darLanceSala,
  desligarLimiteDeRequisicoes,
  entrarNaSala,
  iniciarItensNaSala,
} from './support/pregao';
import { abrirJanelaLances, criarDispensaComPropostas, darLance as darLanceDispensa, painelPublico } from './support/dispensa';
import {
  PregaoEmSessao,
  RECUSADO,
  ValoresDecrescentes,
  bearer,
  identidadeNoPayload,
  imprimirObservacoes,
  lanceV2,
  prepararPregaoEmAcolhimento,
  prepararPregaoEmDisputa,
  recebeEm,
  registrar,
  registrarHttp,
} from './support/isolamento';
import { FaseLicitacao, Licitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';

describe('Isolamento de dados da licitação (autorização)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let pregA: UsuarioOrgaoFixture;
  let pregB: UsuarioOrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;

  let X: PregaoEmSessao;
  let Z: PregaoEmSessao;
  let W: PregaoEmSessao;
  let W2: PregaoEmSessao;
  let Y: LicitacaoFixture;
  let P: { lic: LicitacaoFixture; propostas: Record<string, string> };
  let P2: { lic: LicitacaoFixture; propostas: Record<string, string> };
  let P3: LicitacaoFixture;
  let L1: LicitacaoFixture;
  let L2: LicitacaoFixture;
  /** Proposta de F1 em P2 deixada em RASCUNHO (alvo de cancelar/excluir). */
  let rascunhoF1P2: string;
  /** Um lance real de F1 em X (alvo dos cancelamentos da v3). */
  let lanceF1X: string;

  const valores = new ValoresDecrescentes(850);

  beforeAll(async () => {
    ctx = await criarApp();
    // Throttle global (100 req/min/IP): tudo sai de 127.0.0.1 no e2e — um 429
    // não pode ser confundido com "bloqueado".
    desligarLimiteDeRequisicoes(ctx);

    A = await criarOrgao(ctx, { nome: 'Prefeitura A (isolamento)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura B (isolamento)' });
    pregA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO });
    pregB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.PREGOEIRO });
    F1 = await criarFornecedor(ctx, { porte: 'ME' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });

    const dupla = [
      { fornecedor: F1, valores: [95, 45] },
      { fornecedor: F2, valores: [90, 44] },
    ];
    X = await prepararPregaoEmDisputa(ctx, A, dupla);
    Z = await prepararPregaoEmDisputa(ctx, B, [{ fornecedor: F3, valores: [96, 46] }]);
    W = await prepararPregaoEmDisputa(ctx, A, dupla);
    W2 = await prepararPregaoEmDisputa(ctx, A, dupla, { iniciarSessao: false });

    // Sigilo do orçamento em X (art. 24) — pela edição da licitação (PUT /licitacoes/:id)
    const sig = await ctx
      .http()
      .put(`/api/licitacoes/${X.lic.id}`)
      .set(bearer(A.token))
      .send({ sigilo_orcamento: 'SIGILOSO', justificativa_sigilo: 'Orçamento sigiloso (teste e2e)' });
    const licX = await ctx.http().get(`/api/licitacoes/${X.lic.id}`).set(bearer(A.token));
    if (licX.body?.sigilo_orcamento !== 'SIGILOSO') {
      // Sem rota que grave o campo (o DTO pode filtrá-lo): cai para o repositório.
      registrar('fixture: sigilo_orcamento via PUT', `HTTP ${sig.status} não gravou — gravado pelo repositório`);
      await ctx.dataSource.getRepository(Licitacao).update(X.lic.id, { sigilo_orcamento: 'SIGILOSO' });
    }

    // Lances de base em X (F1 e F2 pela REST da v2, como eles mesmos)
    const l1 = await lanceV2(
      ctx,
      X.sessaoId,
      { itemId: X.lic.itens[0].id, fornecedorId: F1.id, fornecedorNome: F1.razao_social, valor: valores.proximo() },
      F1.token,
    );
    if (l1.status !== 201) throw new Error(`[fixture] lance base F1 → ${l1.status} ${JSON.stringify(l1.body)}`);
    lanceF1X = l1.body.id;
    const l2 = await lanceV2(
      ctx,
      X.sessaoId,
      { itemId: X.lic.itens[0].id, fornecedorId: F2.id, fornecedorNome: F2.razao_social, valor: valores.proximo() },
      F2.token,
    );
    if (l2.status !== 201) throw new Error(`[fixture] lance base F2 → ${l2.status} ${JSON.stringify(l2.body)}`);

    // Pregões em acolhimento (sigilo das propostas)
    P = await prepararPregaoEmAcolhimento(ctx, A, [{ fornecedor: F1, valores: [95, 45] }]);
    P2 = await prepararPregaoEmAcolhimento(ctx, A, [{ fornecedor: F2, valores: [90, 44] }]);
    rascunhoF1P2 = (await enviarProposta(ctx, F1, P2.lic, [95, 45], { enviar: false })).id;
    P3 = (await prepararPregaoEmAcolhimento(ctx, A, [])).lic;

    // Atos da licitação
    L1 = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
    await levarAteFase(ctx, L1, FaseLicitacao.APROVACAO_INTERNA);
    L2 = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);

    // Dispensa com a janela de lances aberta
    Y = await criarDispensaComPropostas(ctx, A, [
      { fornecedor: F1, valores: [99, 49] },
      { fornecedor: F2, valores: [97, 48] },
    ]);
    const jan = await abrirJanelaLances(ctx, Y, { duracao_minutos: 60, prorrogacao_minutos: 2 });
    if (jan.status !== 201) throw new Error(`[fixture] abrir janela da dispensa → ${jan.status} ${JSON.stringify(jan.body)}`);
  });

  afterAll(async () => {
    imprimirObservacoes('isolamento-dados-licitacao');
    fecharSockets();
    await ctx?.fechar();
  });

  // ==========================================================================
  // 1. disputa-v2 REST (disputa.controller.ts — todas as rotas @Public)
  // ==========================================================================
  describe('1. disputa-v2 REST', () => {
    // CORRIGIDO NA E1a (era vazamento): lance da v2 é @Public e confia no fornecedorId do corpo — disputa-v2/disputa.controller.ts:155-175
    test('anônimo (sem token) não registra lance', async () => {
      const r = await lanceV2(ctx, X.sessaoId, {
        itemId: X.lic.itens[0].id,
        fornecedorId: F1.id,
        fornecedorNome: F1.razao_social,
        valor: valores.proximo(),
      });
      registrarHttp('1 anônimo POST lance (X)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): identidade do lance vem do corpo, não do token — disputa-v2/disputa.controller.ts:167-174
    test('F2 não registra lance com o fornecedorId de F1', async () => {
      const r = await lanceV2(
        ctx,
        X.sessaoId,
        { itemId: X.lic.itens[0].id, fornecedorId: F1.id, fornecedorNome: F1.razao_social, valor: valores.proximo() },
        F2.token,
      );
      registrarHttp('1 F2 POST lance como F1 (X)', r);
      expect([401, 403]).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): mensagem da sala é @Public e o remetente vem do corpo — disputa-v2/disputa.controller.ts:177-189
    test('anônimo não envia mensagem na sala (remetente livre)', async () => {
      const r = await ctx
        .http()
        .post(`/api/disputa-v2/sessao/${X.sessaoId}/mensagem`)
        .send({ remetente: 'Pregoeiro', conteudo: 'Atenção: disputa suspensa (mensagem forjada)' });
      registrarHttp('1 anônimo POST mensagem (X)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): iniciar itens é @Public — disputa-v2/disputa.controller.ts:97-104
    test('anônimo não inicia itens', async () => {
      const r = await ctx
        .http()
        .post(`/api/disputa-v2/sessao/${W.sessaoId}/iniciar-itens`)
        .send({ itensIds: [] });
      registrarHttp('1 anônimo POST iniciar-itens (W)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): configurações da sessão são @Public — disputa-v2/disputa.controller.ts:201-217
    test('anônimo não altera configurações da sessão', async () => {
      const r = await ctx
        .http()
        .put(`/api/disputa-v2/sessao/${W.sessaoId}/configuracoes`)
        .send({ tempo_inatividade_minutos: 10 });
      registrarHttp('1 anônimo PUT configuracoes (W)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): encerrar item é @Public — disputa-v2/disputa.controller.ts:106-113
    test('anônimo não encerra item', async () => {
      const r = await ctx.http().post(`/api/disputa-v2/sessao/${W.sessaoId}/encerrar-item/${W.lic.itens[1].id}`);
      registrarHttp('1 anônimo POST encerrar-item (W)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): suspender/retomar são @Public — disputa-v2/disputa.controller.ts:115-140
    test('anônimo não suspende nem retoma a sessão', async () => {
      const s = await ctx
        .http()
        .post(`/api/disputa-v2/sessao/${W.sessaoId}/suspender`)
        .send({ motivo: 'ADMINISTRATIVO', justificativa: 'forjado' });
      registrarHttp('1 anônimo POST suspender (W)', s);
      const r = await ctx.http().post(`/api/disputa-v2/sessao/${W.sessaoId}/retomar`);
      registrarHttp('1 anônimo POST retomar (W)', r);
      expect(RECUSADO).toContain(s.status);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): reiniciar a sessão (cancela todos os lances) é @Public — disputa-v2/disputa.controller.ts:142-153
    test('anônimo não reinicia a sessão', async () => {
      const r = await ctx
        .http()
        .post(`/api/disputa-v2/sessao/${W.sessaoId}/reiniciar`)
        .send({ justificativa: 'forjado' });
      registrarHttp('1 anônimo POST reiniciar (W)', r);
      expect(RECUSADO).toContain(r.status);
    });
  });

  // ==========================================================================
  // 2. socket /disputa-v2 (disputa.gateway.ts — sem validação de token)
  // ==========================================================================
  describe('2. socket /disputa-v2', () => {
    let s2: Socket;
    let s1: Socket;

    beforeAll(async () => {
      // F2 na sala como o frontend faz (fornecedor/disputa/page.tsx: usuarioNome = razão social)
      const e2 = await entrarNaSala(ctx, X.sessaoId, { id: F2.id, nome: F2.razao_social, tipo: 'FORNECEDOR', token: F2.token });
      if (e2.resposta.evento !== 'dados_iniciais') {
        throw new Error(`[fixture] F2 não entrou na sala de X: ${e2.resposta.evento} ${JSON.stringify(e2.resposta.payload)}`);
      }
      s2 = e2.socket;
    });

    // CORRIGIDO NA E1a (era vazamento): tipo=PREGOEIRO é declarado pelo cliente, sem token — disputa-v2/disputa.gateway.ts:63-105,135-144
    test('anônimo declarando tipo=PREGOEIRO não executa ação de pregoeiro', async () => {
      const anon = await entrarNaSala(ctx, X.sessaoId, { id: 'pregoeiro-falso', nome: 'Pregoeiro', tipo: 'PREGOEIRO' });
      if (anon.resposta.evento !== 'dados_iniciais') {
        registrar('2 anônimo PREGOEIRO entrar_sala', `evento=${anon.resposta.evento}`);
        return; // entrada recusada = seguro
      }
      const r = await iniciarItensNaSala(anon.socket, X.sessaoId, []);
      registrar('2 anônimo PREGOEIRO iniciar_itens (X)', `entrar=${anon.resposta.evento} → ${r.evento}`);
      anon.socket.close();
      expect(r.evento).toBe('erro');
    });

    // CORRIGIDO NA E1a (era vazamento): usuarioId do entrar_sala vem do cliente; lance sai em nome de F1 — disputa-v2/disputa.gateway.ts:79-102,331-338
    test('anônimo declarando usuarioId=F1 não dá lance como F1', async () => {
      const anon = await entrarNaSala(ctx, X.sessaoId, { id: F1.id, nome: 'Qualquer', tipo: 'FORNECEDOR' });
      if (anon.resposta.evento !== 'dados_iniciais') {
        registrar('2 anônimo usuarioId=F1 entrar_sala', `evento=${anon.resposta.evento}`);
        return;
      }
      const r = await darLanceSala(anon.socket, X.sessaoId, X.lic.itens[0].id, valores.proximo());
      registrar('2 anônimo usuarioId=F1 enviar_lance (X)', `ok=${r.ok} ${r.mensagem ?? ''}`);
      anon.socket.close();
      expect(r.ok).toBe(false);
    });

    // CORRIGIDO NA E1a (era vazamento): token de F2 não é confrontado com o usuarioId declarado — disputa-v2/disputa.gateway.ts:79-102
    test('F2 (com o próprio token) declarando usuarioId=F1 não dá lance como F1', async () => {
      const e = await entrarNaSala(
        ctx,
        X.sessaoId,
        { id: F2.id, nome: F2.razao_social, tipo: 'FORNECEDOR', token: F2.token },
        { usuarioIdDeclarado: F1.id },
      );
      if (e.resposta.evento !== 'dados_iniciais') {
        registrar('2 F2 usuarioId=F1 entrar_sala', `evento=${e.resposta.evento}`);
        return;
      }
      const r = await darLanceSala(e.socket, X.sessaoId, X.lic.itens[0].id, valores.proximo());
      registrar('2 F2 usuarioId=F1 enviar_lance (X)', `ok=${r.ok} ${r.mensagem ?? ''}`);
      e.socket.close();
      expect(r.ok).toBe(false);
    });

    it('socket /disputa-v2: só órgão dono e fornecedor com proposta entram; token inválido é recusado (E1a)', async () => {
      const entrar = async (token?: string) => {
        const e = await entrarNaSala(ctx, X.sessaoId, { id: 'x', nome: 'x', tipo: 'FORNECEDOR', token });
        e.socket.close();
        return e.resposta.evento;
      };
      const resultado = {
        anonimo: await entrar(),
        orgaoA: await entrar(A.token),
        pregA: await entrar(pregA.token),
        F1: await entrar(F1.token),
        orgaoB: await entrar(B.token),
        pregB: await entrar(pregB.token),
        F3: await entrar(F3.token),
      };
      registrar('2 socket /disputa-v2 entrar_sala (X)', JSON.stringify(resultado));
      await expect(conectarSocket(ctx, '/disputa-v2', { token: 'token.invalido.x' })).rejects.toThrow(/Token inválido/);
      expect(resultado).toEqual({
        anonimo: 'acesso_negado',
        orgaoA: 'dados_iniciais',
        pregA: 'dados_iniciais',
        F1: 'dados_iniciais',
        orgaoB: 'acesso_negado',
        pregB: 'acesso_negado',
        F3: 'acesso_negado',
      });
    });

    it('socket /disputa-v2: pregoeiro de A na sala de X não age na sessão de W (outra sala)', async () => {
      const e = await entrarNaSala(ctx, X.sessaoId, { id: pregA.id, nome: 'Pregoeiro A', tipo: 'PREGOEIRO', token: pregA.token });
      const r = await iniciarItensNaSala(e.socket, W2.sessaoId, W2.lic.itens.map((i) => i.id));
      registrar('2 pregoeiro A (sala X) iniciar_itens em W2', r.evento);
      e.socket.close();
      expect(r.evento).toBe('erro');
    });

    it('buscar_lances_item sem a flag, durante a disputa, vem anonimizado (controle)', async () => {
      const resp = aguardarEvento(s2, 'lances_item');
      s2.emit('buscar_lances_item', { itemId: X.lic.itens[0].id, tipo: 'todos' });
      const r: any = await resp;
      const achados = identidadeNoPayload(r.dados, F1);
      registrar('2 buscar_lances_item sem flag (X)', `itens=${r.dados?.length} identidadeF1=[${achados}]`);
      expect(r.dados.length).toBeGreaterThan(0);
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): itemEncerrado vem do cliente e desliga a anonimização — disputa-v2/disputa.gateway.ts:405-425
    test('buscar_lances_item com itemEncerrado=true durante a disputa não revela identidades', async () => {
      const resp = aguardarEvento(s2, 'lances_item');
      s2.emit('buscar_lances_item', { itemId: X.lic.itens[0].id, tipo: 'todos', itemEncerrado: true });
      const r: any = await resp;
      const achados = identidadeNoPayload(r.dados, F1);
      registrar('2 buscar_lances_item itemEncerrado=true (X)', `identidadeF1=[${achados}]`);
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): participante_entrou repassa o usuarioNome (razão social) — disputa-v2/disputa.gateway.ts:121-124
    test('participante_entrou não carrega a razão social de outro licitante', async () => {
      const evento = aguardarEvento(s2, 'participante_entrou');
      const e1 = await entrarNaSala(ctx, X.sessaoId, { id: F1.id, nome: F1.razao_social, tipo: 'FORNECEDOR', token: F1.token });
      if (e1.resposta.evento !== 'dados_iniciais') {
        throw new Error(`[fixture] F1 não entrou na sala: ${e1.resposta.evento}`);
      }
      s1 = e1.socket;
      const p = await evento;
      const achados = identidadeNoPayload(p, F1);
      registrar('2 participante_entrou recebido por F2', `chaves=${Object.keys(p || {})} identidadeF1=[${achados}]`);
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): novo_lance leva lance.fornecedorNome = usuarioNome do autor — disputa-v2/disputa.gateway.ts:350-356
    test('novo_lance não carrega razão social/cnpj/id de outro licitante', async () => {
      if (!s1) {
        const e1 = await entrarNaSala(ctx, X.sessaoId, { id: F1.id, nome: F1.razao_social, tipo: 'FORNECEDOR', token: F1.token });
        s1 = e1.socket;
      }
      const evento = aguardarEvento(s2, 'novo_lance');
      const r = await darLanceSala(s1, X.sessaoId, X.lic.itens[0].id, valores.proximo());
      if (!r.ok) throw new Error(`[fixture] lance legítimo de F1 recusado: ${r.mensagem}`);
      const p: any = await evento;
      const achados = identidadeNoPayload(p, F1);
      registrar('2 novo_lance recebido por F2', `lance=${JSON.stringify(p?.lance)} identidadeF1=[${achados}]`);
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): nova_mensagem leva remetente = usuarioNome (razão social) — disputa-v2/disputa.gateway.ts:300-305
    test('chat (nova_mensagem) não carrega a razão social de outro licitante', async () => {
      if (!s1) {
        const e1 = await entrarNaSala(ctx, X.sessaoId, { id: F1.id, nome: F1.razao_social, tipo: 'FORNECEDOR', token: F1.token });
        s1 = e1.socket;
      }
      const evento = aguardarEvento(s2, 'nova_mensagem');
      s1.emit('enviar_mensagem', { sessaoId: X.sessaoId, conteudo: 'Pergunta ao pregoeiro' });
      const p: any = await evento;
      const achados = identidadeNoPayload(p, F1);
      registrar('2 nova_mensagem recebida por F2', `remetente=${p?.remetente} identidadeF1=[${achados}]`);
      expect(achados).toEqual([]);
    });
  });

  // ==========================================================================
  // 3. socket /sessao e socket padrão "/" (sessao.gateway.ts, lances.gateway.ts)
  // ==========================================================================
  describe('3. socket /sessao e "/"', () => {
    async function entrarSessao(sessaoId: string, participante: string, tipo: 'PREGOEIRO' | 'FORNECEDOR', token?: string) {
      const s = await conectarSocket(ctx, '/sessao', { token });
      const hist = aguardarEvento<any[]>(s, 'historico_eventos');
      s.emit('entrar_sessao', { sessaoId, participante, tipo });
      return { socket: s, historico: await hist };
    }

    // CORRIGIDO NA E1a (era vazamento): histórico de eventos entregue a qualquer um traz fornecedor_id real — sessao/sessao.gateway.ts:49-51
    test('/sessao: entrar_sessao anônimo não recebe ids reais dos licitantes no histórico', async () => {
      const { socket, historico } = await entrarSessao(X.sessaoId, 'Visitante', 'FORNECEDOR');
      const achados = [...identidadeNoPayload(historico, F1), ...identidadeNoPayload(historico, F2)];
      registrar('3 /sessao historico_eventos anônimo (X)', `eventos=${historico?.length} identidade=[${achados}]`);
      socket.close();
      expect(historico.length).toBeGreaterThan(0);
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): enviar_lance do /sessao aceita fornecedorId do corpo, sem token nem proposta — sessao/sessao.gateway.ts:183-204
    test('/sessao: anônimo não dá lance em nome de F1', async () => {
      const { socket } = await entrarSessao(X.sessaoId, 'Visitante', 'FORNECEDOR');
      const resp = aguardarUmDe(socket, ['novo_lance', 'erro_lance']);
      socket.emit('enviar_lance', {
        sessaoId: X.sessaoId,
        itemId: X.lic.itens[1].id,
        fornecedorId: F1.id,
        fornecedorNome: F1.razao_social,
        valor: valores.proximo(),
      });
      const r = await resp;
      registrar('3 /sessao anônimo enviar_lance como F1 (X)', `${r.evento} ${JSON.stringify(r.payload?.mensagem ?? '')}`);
      socket.close();
      expect(r.evento).toBe('erro_lance');
    });

    // CORRIGIDO NA E1a (era vazamento): novo_lance do /sessao difunde a entidade Lance (fornecedor_identificador real) — sessao/sessao.gateway.ts:207-212
    // O lance por esta sala foi desativado (E1a): nenhum novo_lance é difundido; se algum chegasse, não pode levar F1.
    test('/sessao: novo_lance não carrega o id real de outro licitante (lance pela sala /sessao recusado)', async () => {
      const { socket: vigia } = await entrarSessao(X.sessaoId, F2.razao_social, 'FORNECEDOR', F2.token);
      const { socket: s1 } = await entrarSessao(X.sessaoId, F1.razao_social, 'FORNECEDOR', F1.token);
      const evento = recebeEm<any>(vigia, 'novo_lance', 2000);
      const resp = aguardarUmDe(s1, ['novo_lance', 'erro_lance']);
      // como a sala do fornecedor faz (fornecedor/sala-disputa/page.tsx)
      s1.emit('enviar_lance', {
        sessaoId: X.sessaoId,
        itemId: X.lic.itens[1].id,
        fornecedorId: F1.id,
        fornecedorNome: F1.razao_social,
        valor: valores.proximo(),
      });
      const r = await resp;
      const p: any = await evento;
      const achados = identidadeNoPayload(p, F1);
      registrar(
        '3 /sessao novo_lance recebido por F2',
        `F1 recebeu=${r.evento} vigia=${p ? `chaves=${Object.keys(p)}` : 'nada'} identidadeF1=[${achados}]`,
      );
      vigia.close();
      s1.close();
      expect(r.evento).toBe('erro_lance');
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): mensagem_chat aceita isPregoeiro do cliente — sessao/sessao.gateway.ts:360-411
    test('/sessao: anônimo não fala no chat como pregoeiro', async () => {
      const { socket: vigia } = await entrarSessao(X.sessaoId, F2.razao_social, 'FORNECEDOR', F2.token);
      const { socket: anon } = await entrarSessao(X.sessaoId, 'Visitante', 'FORNECEDOR');
      const evento = recebeEm<any>(vigia, 'nova_mensagem', 2000);
      anon.emit('mensagem_chat', { sessaoId: X.sessaoId, remetente: 'Pregoeiro', mensagem: 'Sessão encerrada (forjado)', isPregoeiro: true });
      const p = await evento;
      registrar('3 /sessao anônimo mensagem_chat isPregoeiro', p ? `vigia recebeu remetente=${p.remetente} isPregoeiro=${p.isPregoeiro}` : 'nada chegou');
      vigia.close();
      anon.close();
      expect(p?.isPregoeiro === true).toBe(false);
    });

    // CORRIGIDO NA E1a (era vazamento): nova_mensagem do /sessao difunde fornecedorId real — sessao/sessao.gateway.ts:405-411
    test('/sessao: nova_mensagem de F1 não carrega o id real de F1', async () => {
      const { socket: vigia } = await entrarSessao(X.sessaoId, F2.razao_social, 'FORNECEDOR', F2.token);
      const { socket: s1 } = await entrarSessao(X.sessaoId, F1.razao_social, 'FORNECEDOR', F1.token);
      const evento = aguardarEvento<any>(vigia, 'nova_mensagem');
      s1.emit('mensagem_chat', { sessaoId: X.sessaoId, remetente: F1.razao_social, mensagem: 'Dúvida', isPregoeiro: false, fornecedorId: F1.id });
      const p = await evento;
      const achados = identidadeNoPayload(p, F1);
      registrar('3 /sessao nova_mensagem recebida por F2', `remetente=${p?.remetente} identidadeF1=[${achados}]`);
      vigia.close();
      s1.close();
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): encerrar_item do /sessao sem checagem de pregoeiro — sessao/sessao.gateway.ts:268-283
    test('/sessao: anônimo não encerra item', async () => {
      const { socket: anon } = await entrarSessao(W.sessaoId, 'Visitante', 'FORNECEDOR');
      const resp = aguardarUmDe(anon, ['item_encerrado', 'erro']);
      anon.emit('encerrar_item', { sessaoId: W.sessaoId, itemId: W.lic.itens[0].id });
      const r = await resp;
      registrar('3 /sessao anônimo encerrar_item (W)', r.evento);
      anon.close();
      expect(r.evento).toBe('erro');
    });

    // CORRIGIDO NA E1a (era vazamento): reiniciar_disputa do /sessao sem checagem de pregoeiro — sessao/sessao.gateway.ts:340-355
    test('/sessao: anônimo não reinicia a disputa', async () => {
      const { socket: anon } = await entrarSessao(W.sessaoId, 'Visitante', 'FORNECEDOR');
      const resp = aguardarUmDe(anon, ['disputa_reiniciada', 'erro']);
      anon.emit('reiniciar_disputa', { sessaoId: W.sessaoId, motivo: 'forjado' });
      const r = await resp;
      registrar('3 /sessao anônimo reiniciar_disputa (W)', r.evento);
      anon.close();
      expect(r.evento).toBe('erro');
    });

    // REMOVIDO NA E2: o gateway legado "/" (módulo `lances`) foi apagado — o único
    // caminho de lance é o motor /disputa-v2. Um cliente no namespace padrão não
    // recebe estado, não dá lance, não fala no chat e não encerra nada.
    test('"/": gateway legado removido — entrar_sala/enviar_lance/enviar_mensagem/encerrar_item não têm efeito', async () => {
      const s = await conectarSocket(ctx, '/');
      const estado = recebeEm<any>(s, 'estado_sessao', 1500);
      const lance = recebeEm<any>(s, 'lance_confirmado', 1500);
      const msg = recebeEm<any>(s, 'nova_mensagem', 1500);
      const antes = (await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE licitacao_id = $1`, [X.lic.id]))[0].n;
      s.emit('entrar_sala', { licitacaoId: X.lic.id, participanteId: 'visitante', nome: 'Visitante', tipo: 'PREGOEIRO' });
      s.emit('enviar_lance', { licitacaoId: X.lic.id, fornecedorId: F1.id, valor: valores.proximo() });
      s.emit('enviar_mensagem', { licitacaoId: X.lic.id, conteudo: 'Encerrada (forjado)', remetente: 'Pregoeiro', isPregoeiro: true });
      s.emit('encerrar_item', { licitacaoId: W.lic.id });
      const [e, l, m] = await Promise.all([estado, lance, msg]);
      const depois = (await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE licitacao_id = $1`, [X.lic.id]))[0].n;
      const sw = await ctx.http().get(`/api/sessao/${W.sessaoId}`);
      registrar('3 "/" gateway legado (E2: removido)', `estado=${!!e} lance=${!!l} msg=${!!m} lances ${antes}→${depois} W=${sw.body?.status}`);
      s.close();
      expect([e, l, m]).toEqual([null, null, null]);
      expect(depois).toBe(antes);
      expect(sw.body.status).not.toBe('ENCERRADA');
    });
  });

  // ==========================================================================
  // 4. sessao REST (sessao.controller.ts — só exige token, sem papel/órgão)
  // ==========================================================================
  describe('4. sessao REST', () => {
    const acoes: Array<{ nome: string; metodo: 'put'; caminho: () => string; corpo?: () => any }> = [
      { nome: 'iniciar', metodo: 'put', caminho: () => `/api/sessao/${W2.sessaoId}/iniciar` },
      { nome: 'suspender', metodo: 'put', caminho: () => `/api/sessao/${W2.sessaoId}/suspender`, corpo: () => ({ motivo: 'forjado' }) },
      { nome: 'habilitar (aprovar habilitação)', metodo: 'put', caminho: () => `/api/sessao/${W2.sessaoId}/habilitacao/aprovar/${F1.id}` },
      {
        nome: 'adjudicar item',
        metodo: 'put',
        caminho: () => `/api/sessao/${W2.sessaoId}/adjudicar/${W2.lic.itens[0].id}`,
        corpo: () => ({ fornecedorId: F1.id, valor: 1 }),
      },
      { nome: 'homologar', metodo: 'put', caminho: () => `/api/sessao/${W2.sessaoId}/homologar`, corpo: () => ({ nome: 'Forjado' }) },
      { nome: 'encerrar', metodo: 'put', caminho: () => `/api/sessao/${W2.sessaoId}/encerrar` },
    ];
    const atores: Array<{ nome: string; token: () => string }> = [
      { nome: 'órgão B', token: () => B.token },
      { nome: 'fornecedor F2', token: () => F2.token },
    ];

    for (const acao of acoes) {
      for (const ator of atores) {
        // CORRIGIDO NA E1a (era vazamento): ações do pregoeiro sem checagem de órgão/papel — sessao/sessao.controller.ts:100-345
        test(`${ator.nome} não executa "${acao.nome}" na sessão de A`, async () => {
          const r = await ctx.http()[acao.metodo](acao.caminho()).set(bearer(ator.token())).send(acao.corpo ? acao.corpo() : {});
          registrarHttp(`4 ${ator.nome} ${acao.nome} (W2)`, r);
          expect(RECUSADO).toContain(r.status);
        });
      }
    }

    // CORRIGIDO NA E1a (era vazamento): ranking de habilitação (cnpj, razão social, valores) sem checagem de órgão — sessao/sessao.controller.ts:164-167; sessao/sessao.service.ts:1144-1170
    test('órgão B não lê a habilitação de X', async () => {
      const r = await ctx.http().get(`/api/sessao/${X.sessaoId}/habilitacao`).set(bearer(B.token));
      registrarHttp('4 órgão B GET habilitacao (X)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): fornecedor lê o ranking de habilitação com cnpj dos concorrentes — sessao/sessao.controller.ts:164-167
    test('F2 não lê a habilitação de X (cnpj/valores dos concorrentes)', async () => {
      const r = await ctx.http().get(`/api/sessao/${X.sessaoId}/habilitacao`).set(bearer(F2.token));
      registrarHttp('4 F2 GET habilitacao (X)', r);
      const vaza = r.status === 200 && identidadeNoPayload(r.body, F1).length > 0;
      expect(vaza).toBe(false);
    });

    // CORRIGIDO NA E1a (era vazamento): eventos públicos trazem fornecedor_id real dos lances — sessao/sessao.controller.ts:366-370
    test('eventos públicos não revelam ids dos licitantes durante a disputa', async () => {
      const r = await ctx.http().get(`/api/sessao/${X.sessaoId}/eventos`);
      const achados = [...identidadeNoPayload(r.body, F1), ...identidadeNoPayload(r.body, F2)];
      registrar('4 anônimo GET eventos (X)', `HTTP ${r.status} eventos=${r.body?.length} identidade=[${achados}]`);
      expect(achados).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): lances-por-fornecedor é @Public e devolve fornecedorId real dos outros — sessao/sessao.controller.ts:33-40; sessao/sessao.service.ts:2498-2508
    test('lances/fornecedor público não revela id de outro licitante', async () => {
      const r = await ctx.http().get(`/api/sessao/item/${X.lic.itens[0].id}/lances/fornecedor/${F2.id}`);
      const achados = identidadeNoPayload(r.body, F1);
      registrar('4 anônimo GET lances/fornecedor/F2 (X)', `HTTP ${r.status} lances=${r.body?.lances?.length} identidadeF1=[${achados}]`);
      expect(achados).toEqual([]);
    });
  });

  // ==========================================================================
  // 5. licitacoes REST — checagem de órgão (E1)
  // ==========================================================================
  describe('5. licitacoes REST (órgão B sobre licitações de A)', () => {
    it('órgão B não lê a licitação de A por id (404) nem a lista com ?orgao_id=A (E1a)', async () => {
      const um = await ctx.http().get(`/api/licitacoes/${L2.id}`).set(bearer(pregB.token));
      const lista = await ctx.http().get(`/api/licitacoes?orgao_id=${A.id}`).set(bearer(B.token)).expect(200);
      registrarHttp('5 pregoeiro B GET licitacoes/:id (L2)', um);
      expect(um.status).toBe(404);
      expect(lista.body.some((l: any) => l.orgao_id === A.id)).toBe(false);
    });

    it('fornecedor não lê licitação na fase interna nem vê credenciais do órgão (E1a)', async () => {
      const interna = await ctx.http().get(`/api/licitacoes/${L2.id}`).set(bearer(F1.token));
      expect(interna.status).toBe(404);
      const publica = await ctx.http().get(`/api/licitacoes/${X.lic.id}`).set(bearer(F1.token)).expect(200);
      const lista = await ctx.http().get('/api/licitacoes').set(bearer(F1.token)).expect(200);
      const dono = await ctx.http().get(`/api/licitacoes/${X.lic.id}`).set(bearer(A.token)).expect(200);
      for (const corpo of [publica.body, lista.body, dono.body]) {
        expect(JSON.stringify(corpo)).not.toMatch(/senha_hash|pncp_senha|email_smtp_senha|whatsapp_token/);
      }
      expect(lista.body.some((l: any) => l.id === L2.id)).toBe(false);
      // X tem orçamento sigiloso: o fornecedor não vê o valor estimado
      expect(publica.body.valor_total_estimado ?? null).toBeNull();
    });

    it('fornecedor não executa atos do órgão (publicar, homologar, abrir lances) (E1a)', async () => {
      const pub = await ctx.http().put(`/api/licitacoes/${L1.id}/publicar-edital`).set(bearer(F1.token)).send(datasEditalPadrao());
      const hom = await ctx.http().put(`/api/licitacoes/${L2.id}/homologar`).set(bearer(F1.token)).send({ valor_homologado: 1 });
      const jan = await ctx.http().post(`/api/licitacoes/${Y.id}/dispensa/abrir-lances`).set(bearer(F1.token)).send({});
      expect([pub.status, hom.status, jan.status]).toEqual([403, 403, 403]);
    });

    // CORRIGIDO NA E1a (era vazamento): processo-completo sem checagem de órgão — licitacoes/licitacoes.controller.ts:120-123
    test('órgão B não lê o processo-completo de X', async () => {
      const r = await ctx.http().get(`/api/licitacoes/${X.lic.id}/processo-completo`).set(bearer(B.token));
      registrarHttp('5 órgão B GET processo-completo (X)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): PUT /licitacoes/:id sem checagem de órgão — licitacoes/licitacoes.controller.ts:68-74
    test('órgão B não altera licitação de A', async () => {
      const r = await ctx.http().put(`/api/licitacoes/${L2.id}`).set(bearer(B.token)).send({ objeto: 'Objeto alterado pelo órgão B' });
      registrarHttp('5 órgão B PUT licitacao (L2)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): publicar-edital sem checagem de órgão — licitacoes/licitacoes.controller.ts:93-99
    test('órgão B não publica o edital de A', async () => {
      const r = await ctx.http().put(`/api/licitacoes/${L1.id}/publicar-edital`).set(bearer(B.token)).send(datasEditalPadrao());
      registrarHttp('5 órgão B PUT publicar-edital (L1)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): resultado-externo sem checagem de órgão — licitacoes/licitacoes.controller.ts:211-223
    test('órgão B não registra resultado externo em licitação de A', async () => {
      const r = await ctx
        .http()
        .post(`/api/licitacoes/${L2.id}/resultado-externo`)
        .set(bearer(B.token))
        .send({ plataforma_externa: 'Outra', itens: [{ item_id: L2.itens[0].id, fornecedor_id: F3.id, valor_unitario: 1 }] });
      registrarHttp('5 órgão B POST resultado-externo (L2)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): julgar-dispensa sem checagem de órgão (hoje só a janela aberta segura) —
    // licitacoes/licitacoes.controller.ts:126-129
    test('órgão B não julga a dispensa de A', async () => {
      const r = await ctx.http().post(`/api/licitacoes/${Y.id}/julgar-dispensa`).set(bearer(B.token));
      registrarHttp('5 órgão B POST julgar-dispensa (Y)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): homologar sem checagem de órgão — licitacoes/licitacoes.controller.ts:111-117
    test('órgão B não homologa licitação de A', async () => {
      const r = await ctx.http().put(`/api/licitacoes/${L2.id}/homologar`).set(bearer(B.token)).send({ valor_homologado: 1 });
      registrarHttp('5 órgão B PUT homologar (L2)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): suspender sem checagem de órgão — licitacoes/licitacoes.controller.ts:225-231
    test('órgão B não suspende licitação de A', async () => {
      const r = await ctx.http().put(`/api/licitacoes/${L2.id}/suspender`).set(bearer(B.token)).send({ motivo: 'forjado' });
      registrarHttp('5 órgão B PUT suspender (L2)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): revogar sem checagem de órgão — licitacoes/licitacoes.controller.ts:233-239
    test('órgão B não revoga licitação de A', async () => {
      const r = await ctx.http().put(`/api/licitacoes/${L2.id}/revogar`).set(bearer(B.token)).send({ motivo: 'forjado' });
      registrarHttp('5 órgão B PUT revogar (L2)', r);
      expect(RECUSADO).toContain(r.status);
    });
  });

  // ==========================================================================
  // 6. propostas (propostas.controller.ts)
  // ==========================================================================
  describe('6. propostas', () => {
    const propF1 = () => P.propostas[F1.id];
    const propF2P2 = () => P2.propostas[F2.id];

    it('lista pública de propostas respeita o sigilo (controle)', async () => {
      const r = await ctx.http().get(`/api/propostas/licitacao/${P.lic.id}`).expect(200);
      registrar('6 anônimo GET propostas/licitacao (P, sigilo)', `n=${r.body.length} ids=${r.body.map((p: any) => p.id)}`);
      expect(r.body.length).toBe(1);
      expect(r.body.every((p: any) => p.id === null && p.fornecedor === null && p.valor_total_proposta === null)).toBe(true);
    });

    it('ranking público por item vem vazio durante o sigilo (controle)', async () => {
      const r = await ctx.http().get(`/api/propostas/ranking/item/${P.lic.itens[0].id}`).expect(200);
      registrarHttp('6 anônimo GET ranking/item (P, sigilo)', r);
      expect(r.body).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): GET /propostas/:id é @Public, sem dono nem sigilo — propostas/propostas.controller.ts:39-43
    test('F2 não lê a proposta de F1 por id antes do fim do sigilo', async () => {
      const r = await ctx.http().get(`/api/propostas/${propF1()}`).set(bearer(F2.token));
      registrarHttp('6 F2 GET propostas/:id de F1 (P)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): GET /propostas/:id/itens é @Public (valores de F1) — propostas/propostas.controller.ts:45-49
    test('F2 não lê os itens da proposta de F1 antes do fim do sigilo', async () => {
      const r = await ctx.http().get(`/api/propostas/${propF1()}/itens`).set(bearer(F2.token));
      registrarHttp('6 F2 GET propostas/:id/itens de F1 (P)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): PUT /propostas/:id sem checagem de dono — propostas/propostas.controller.ts:150-156
    test('F2 não altera a proposta de F1', async () => {
      const r = await ctx.http().put(`/api/propostas/${propF1()}`).set(bearer(F2.token)).send({ valor_total_proposta: 1 });
      registrarHttp('6 F2 PUT propostas/:id de F1 (P)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): PUT /propostas/item/:itemId sem checagem de dono — propostas/propostas.controller.ts:158-164
    test('F2 não altera item da proposta de F1', async () => {
      const itens = await ctx.http().get(`/api/propostas/${propF1()}/itens`).set(bearer(F1.token)).expect(200);
      const r = await ctx.http().put(`/api/propostas/item/${itens.body[0].id}`).set(bearer(F2.token)).send({ valor_unitario: 1 });
      registrarHttp('6 F2 PUT propostas/item de F1 (P)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): cancelar proposta sem checagem de dono — propostas/propostas.controller.ts:145-148
    test('F2 não retira (cancela) a proposta de F1', async () => {
      const r = await ctx.http().put(`/api/propostas/${rascunhoF1P2}/cancelar`).set(bearer(F2.token));
      registrarHttp('6 F2 PUT cancelar proposta de F1 (P2)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): exclusão confia no ?fornecedorId= da query — propostas/propostas.controller.ts:166-173; propostas/propostas.service.ts:333-346
    test('F2 não exclui a proposta de F1 (fornecedorId na query)', async () => {
      const r = await ctx.http().delete(`/api/propostas/${rascunhoF1P2}?fornecedorId=${F1.id}`).set(bearer(F2.token));
      registrarHttp('6 F2 DELETE proposta de F1 (P2)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): POST /propostas usa fornecedor_id do corpo — propostas/propostas.controller.ts:18-21; propostas/propostas.service.ts:69-101
    test('F2 não cria proposta em nome de F1', async () => {
      const r = await ctx
        .http()
        .post('/api/propostas')
        .set(bearer(F2.token))
        .send({
          licitacao_id: P3.id,
          fornecedor_id: F1.id,
          declaracao_termos: true,
          declaracao_integridade: true,
          declaracao_inexistencia_fatos: true,
          declaracao_menor: true,
          itens: [{ item_licitacao_id: P3.itens[0].id, valor_unitario: 1 }],
        });
      registrarHttp('6 F2 POST proposta como F1 (P3)', r);
      expect([401, 403]).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): o 409 de proposta duplicada devolve o id da proposta de outro fornecedor — propostas/propostas.service.ts:80-85
    test('erro de proposta duplicada não devolve o id da proposta de outro fornecedor', async () => {
      const r = await ctx
        .http()
        .post('/api/propostas')
        .set(bearer(F2.token))
        .send({
          licitacao_id: P.lic.id,
          fornecedor_id: F1.id,
          declaracao_termos: true,
          declaracao_integridade: true,
          declaracao_inexistencia_fatos: true,
          declaracao_menor: true,
          itens: [{ item_licitacao_id: P.lic.itens[0].id, valor_unitario: 1 }],
        });
      registrarHttp('6 F2 POST proposta duplicada como F1 (P)', r);
      expect(JSON.stringify(r.body)).not.toContain(propF1());
      expect([401, 403]).toContain(r.status);
    });

    const classificadores: Array<{ nome: string; token: () => string }> = [
      { nome: 'fornecedor F1 (concorrente)', token: () => F1.token },
      { nome: 'fornecedor F2 (a própria)', token: () => F2.token },
      { nome: 'órgão B', token: () => B.token },
    ];
    for (const c of classificadores) {
      // CORRIGIDO NA E1a (era vazamento): classificar sem checagem de papel/órgão — propostas/propostas.controller.ts:62-65
      test(`${c.nome} não classifica proposta de licitação de A`, async () => {
        const r = await ctx.http().put(`/api/propostas/${propF2P2()}/classificar`).set(bearer(c.token()));
        registrarHttp(`6 ${c.nome} PUT classificar (P2)`, r);
        expect(RECUSADO).toContain(r.status);
      });
    }
    for (const c of [classificadores[0], classificadores[2]]) {
      // CORRIGIDO NA E1a (era vazamento): desclassificar sem checagem de papel/órgão — propostas/propostas.controller.ts:67-113
      test(`${c.nome} não desclassifica proposta de licitação de A`, async () => {
        const r = await ctx
          .http()
          .put(`/api/propostas/${propF2P2()}/desclassificar`)
          .set(bearer(c.token()))
          .send({ motivo: 'forjado' });
        registrarHttp(`6 ${c.nome} PUT desclassificar (P2)`, r);
        expect(RECUSADO).toContain(r.status);
      });
    }

    it('F1 lê a própria proposta; órgão A vê só autoria durante o sigilo; órgão B e anônimo não leem (E1a)', async () => {
      const dono = await ctx.http().get(`/api/propostas/${propF1()}`).set(bearer(F1.token)).expect(200);
      const itensDono = await ctx.http().get(`/api/propostas/${propF1()}/itens`).set(bearer(F1.token)).expect(200);
      const orgao = await ctx.http().get(`/api/propostas/${propF1()}`).set(bearer(pregA.token)).expect(200);
      const itensOrgao = await ctx.http().get(`/api/propostas/${propF1()}/itens`).set(bearer(pregA.token));
      const orgaoB = await ctx.http().get(`/api/propostas/${propF1()}`).set(bearer(B.token));
      const anon = await ctx.http().get(`/api/propostas/${propF1()}`);
      registrar(
        '6 leitura por id (P, sigilo)',
        `F1=${dono.status} itensF1=${itensDono.body.length} orgaoA sigilo=${orgao.body.sigilo} itensOrgaoA=${itensOrgao.status} orgaoB=${orgaoB.status} anon=${anon.status}`,
      );
      expect(Number(dono.body.valor_total_proposta)).toBeGreaterThan(0);
      expect(JSON.stringify(dono.body)).not.toMatch(/"senha"|api_key_hash|spedy_api_key/);
      expect(itensDono.body.length).toBeGreaterThan(0);
      expect(orgao.body).toMatchObject({ fornecedor_id: F1.id, sigilo: true, valor_total_proposta: null });
      expect(orgao.body.itens).toBeUndefined();
      expect(itensOrgao.status).toBe(403);
      expect(orgaoB.status).toBe(404);
      expect(anon.status).toBe(401);
    });

    it('lista "minhas" traz só as propostas do token; /fornecedor/:id de outro é 403 (E1a)', async () => {
      const minhas = await ctx.http().get('/api/propostas/minhas').set(bearer(F2.token)).expect(200);
      const outro = await ctx.http().get(`/api/propostas/fornecedor/${F1.id}`).set(bearer(F2.token));
      expect(minhas.body.length).toBeGreaterThan(0);
      expect(minhas.body.every((p: any) => p.fornecedor_id === F2.id)).toBe(true);
      expect(JSON.stringify(minhas.body)).not.toMatch(/senha_hash|pncp_senha|email_smtp_senha/);
      expect(outro.status).toBe(403);
    });

    it('F2 não altera o cadastro de F1 (PUT /fornecedores/:id) (controle)', async () => {
      const r = await ctx.http().put(`/api/fornecedores/${F1.id}`).set(bearer(F2.token)).send({ telefone: '71000000000' });
      registrarHttp('6 F2 PUT fornecedores/F1', r);
      expect(r.status).toBe(403);
    });
  });

  // ==========================================================================
  // 7. disputa-v2 item/:id/propostas durante o sigilo
  // ==========================================================================
  describe('7. disputa-v2 propostas do item', () => {
    // CORRIGIDO NA E1a (era vazamento): sem sessão não há anonimização nem sigilo — disputa-v2/disputa.controller.ts:62-66; disputa-v2/disputa.service.ts:1060-1095
    test('item/:id/propostas durante o acolhimento não expõe nomes nem valores', async () => {
      const r = await ctx.http().get(`/api/disputa-v2/item/${P.lic.itens[0].id}/propostas`);
      const achados = identidadeNoPayload(r.body, F1);
      const comValor = Array.isArray(r.body) && r.body.some((p: any) => p.valor !== null && p.valor !== undefined);
      registrar('7 anônimo GET item/:id/propostas (P, sigilo)', `HTTP ${r.status} n=${r.body?.length} identidadeF1=[${achados}] comValor=${comValor}`);
      expect(achados).toEqual([]);
      expect(comValor).toBe(false);
    });
  });

  // ==========================================================================
  // 8. Dispensa (Y) — identidade no corpo
  // ==========================================================================
  describe('8. dispensa (Y)', () => {
    // CORRIGIDO NA E1a (era vazamento): painel aceita ?fornecedorId= de qualquer um — licitacoes/licitacoes.controller.ts:154-161;
    // licitacoes/licitacoes.service.ts:1624-1638
    test('F2 não vê o valor atual de F1 no painel (?fornecedorId=F1)', async () => {
      const r = await painelPublico(ctx, Y, F1.id).set(bearer(F2.token));
      registrar('8 F2 GET painel ?fornecedorId=F1 (Y)', `HTTP ${r.status} meu_valor=${JSON.stringify(r.body?.itens?.map((i: any) => i.meu_valor))}`);
      expect(r.body.itens.every((i: any) => i.meu_valor === undefined)).toBe(true);
    });

    it('F2 logado vê só o PRÓPRIO valor no painel (E1a)', async () => {
      const r = await painelPublico(ctx, Y).set(bearer(F2.token)).expect(200);
      expect(r.body.itens.map((i: any) => i.meu_valor)).toEqual([97, 48]);
    });

    it('socket /dispensa: token inválido é recusado no handshake (E1a)', async () => {
      await expect(conectarSocket(ctx, '/dispensa', { token: 'token.invalido.x' })).rejects.toThrow(/Token inválido/);
    });

    it('socket /dispensa: anônimo, órgão dono e fornecedor com proposta entram; órgão B e fornecedor sem proposta não (E1a)', async () => {
      const entrar = async (token?: string) => {
        const s = await conectarSocket(ctx, '/dispensa', { token });
        const r = aguardarUmDe(s, ['sala_ok', 'erro']);
        s.emit('entrar_sala', { licitacaoId: Y.id });
        const ev = await r;
        s.close();
        return ev.evento;
      };
      const resultado = {
        anonimo: await entrar(),
        orgaoA: await entrar(A.token),
        pregA: await entrar(pregA.token),
        F1: await entrar(F1.token),
        orgaoB: await entrar(B.token),
        F3: await entrar(F3.token),
      };
      registrar('8 socket /dispensa entrar_sala (Y)', JSON.stringify(resultado));
      expect(resultado).toEqual({ anonimo: 'sala_ok', orgaoA: 'sala_ok', pregA: 'sala_ok', F1: 'sala_ok', orgaoB: 'erro', F3: 'erro' });
    });

    // CORRIGIDO NA E1a (era vazamento): lance da dispensa usa fornecedor_id do corpo — licitacoes/licitacoes.controller.ts:145-151;
    // licitacoes/licitacoes.service.ts:1330
    test('F2 não dá lance na dispensa em nome de F1', async () => {
      const r = await darLanceDispensa(ctx, F2, Y, Y.itens[1].id, 47, F1.id);
      registrarHttp('8 F2 POST lance dispensa como F1 (Y)', r);
      expect([401, 403]).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): chat da dispensa usa fornecedor_id do corpo — licitacoes/licitacoes.controller.ts:196-208;
    // licitacoes/licitacoes.service.ts:1538
    test('F2 não envia mensagem no chat da dispensa em nome de F1', async () => {
      const r = await ctx
        .http()
        .post(`/api/licitacoes/${Y.id}/dispensa/mensagens`)
        .set(bearer(F2.token))
        .send({ autor_tipo: 'FORNECEDOR', fornecedor_id: F1.id, mensagem: 'Desisto (forjado)' });
      registrarHttp('8 F2 POST mensagem como F1 (Y)', r);
      expect([401, 403]).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): autor_tipo=ORGAO aceito de token de fornecedor — licitacoes/licitacoes.controller.ts:196-208;
    // licitacoes/licitacoes.service.ts:1555-1573
    test('F2 não envia mensagem no chat da dispensa como órgão', async () => {
      const r = await ctx
        .http()
        .post(`/api/licitacoes/${Y.id}/dispensa/mensagens`)
        .set(bearer(F2.token))
        .send({ autor_tipo: 'ORGAO', autor_nome: 'Agente de contratação', mensagem: 'Janela encerrada (forjado)' });
      registrarHttp('8 F2 POST mensagem como ORGAO (Y)', r);
      expect([401, 403]).toContain(r.status);
    });
  });

  // ==========================================================================
  // 9. disputa-v3 board + cancelamento de lance
  // ==========================================================================
  describe('9. disputa-v3', () => {
    it('órgão B (token ORGAO) não lê o board do pregoeiro de X (controle)', async () => {
      const r = await ctx.http().get(`/api/disputa-v3/sessao/${X.sessaoId}/board`).set(bearer(B.token));
      registrarHttp('9 órgão B GET board (X)', r);
      expect(r.status).toBe(403);
    });

    // CORRIGIDO NA E1a (era vazamento): token USUARIO não passa orgaoId para a checagem — disputa-v3/disputa-v3.controller.ts:47-49
    test('pregoeiro de B (token USUARIO) não lê o board de X', async () => {
      const r = await ctx.http().get(`/api/disputa-v3/sessao/${X.sessaoId}/board`).set(bearer(pregB.token));
      registrarHttp('9 pregoeiro B GET board (X)', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): ?fornecedorId= pula a checagem de órgão (visão de F1 para o órgão B) — disputa-v3/disputa-v3.controller.ts:43-45
    test('órgão B não lê o board de F1 em X via ?fornecedorId=', async () => {
      const r = await ctx.http().get(`/api/disputa-v3/sessao/${X.sessaoId}/board?fornecedorId=${F1.id}`).set(bearer(B.token));
      registrarHttp('9 órgão B GET board ?fornecedorId=F1 (X)', r);
      expect(RECUSADO).toContain(r.status);
    });

    it('F2 não vê o board "como" F1 (?fornecedorId=F1); F3 (sem proposta) não lê o board de X (E1a)', async () => {
      const f2 = await ctx.http().get(`/api/disputa-v3/sessao/${X.sessaoId}/board?fornecedorId=${F1.id}`).set(bearer(F2.token));
      const f3 = await ctx.http().get(`/api/disputa-v3/sessao/${X.sessaoId}/board`).set(bearer(F3.token));
      const proprio = await ctx.http().get(`/api/disputa-v3/sessao/${X.sessaoId}/board`).set(bearer(F2.token));
      registrar('9 board F2 como F1 / F3 / F2 próprio', `${f2.status}/${f3.status}/${proprio.status}`);
      expect(f2.status).toBe(403);
      expect(f3.status).toBe(403);
      expect(proprio.status).toBe(200);
      expect(proprio.body.visao).toBe('FORNECEDOR');
      expect(identidadeNoPayload(proprio.body, F1)).toEqual([]);
    });

    const base = () => `/api/disputa-v3/sessao/${X.sessaoId}/item/${X.lic.itens[0].id}/lance/${lanceF1X}`;

    it('F2 não cancela o lance de F1 (controle)', async () => {
      const r = await ctx.http().post(`${base()}/cancelar-fornecedor`).set(bearer(F2.token));
      registrarHttp('9 F2 POST cancelar-fornecedor lance F1', r);
      expect(r.status).toBe(403);
    });

    it('F2 não solicita cancelamento do lance de F1 (controle)', async () => {
      const r = await ctx.http().post(`${base()}/solicitar-cancelamento`).set(bearer(F2.token)).send({ motivo: 'x' });
      registrarHttp('9 F2 POST solicitar-cancelamento lance F1', r);
      expect(r.status).toBe(403);
    });

    it('órgão B e pregoeiro de B não cancelam lance em X; fornecedor não cancela como pregoeiro (controle)', async () => {
      const corpo = { justificativa: 'forjado' };
      const b = await ctx.http().post(`${base()}/pregoeiro-cancelar`).set(bearer(B.token)).send(corpo);
      const pb = await ctx.http().post(`${base()}/pregoeiro-cancelar`).set(bearer(pregB.token)).send(corpo);
      const f = await ctx.http().post(`${base()}/pregoeiro-cancelar`).set(bearer(F2.token)).send(corpo);
      const anon = await ctx.http().post(`${base()}/pregoeiro-cancelar`).send(corpo);
      registrarHttp('9 órgão B pregoeiro-cancelar', b);
      registrarHttp('9 pregoeiro B pregoeiro-cancelar', pb);
      registrarHttp('9 F2 pregoeiro-cancelar', f);
      registrarHttp('9 anônimo pregoeiro-cancelar', anon);
      expect(b.status).toBe(403);
      expect(pb.status).toBe(403);
      expect(f.status).toBe(403);
      expect(anon.status).toBe(401);
    });
  });

  // ==========================================================================
  // 10. parametros-licitacao
  // ==========================================================================
  describe('10. parametros-licitacao', () => {
    // CORRIGIDO NA E1a (era vazamento): PUT/DELETE /parametros-licitacao/:orgaoId sem checagem de órgão —
    // parametros-licitacao/parametros-licitacao.controller.ts:28-40
    test('órgão B não sobrescreve os parâmetros de A', async () => {
      const r = await ctx
        .http()
        .put(`/api/parametros-licitacao/${A.id}`)
        .set(bearer(B.token))
        .send({ tempo_inatividade_minutos: 1, tempo_prorrogacao_minutos: 1 });
      registrarHttp('10 órgão B PUT parametros de A', r);
      expect(RECUSADO).toContain(r.status);
    });

    // CORRIGIDO NA E1a (era vazamento): restaurar (DELETE) parâmetros de outro órgão —
    // parametros-licitacao/parametros-licitacao.controller.ts:37-40
    test('órgão B não restaura (apaga) os parâmetros de A', async () => {
      const r = await ctx.http().delete(`/api/parametros-licitacao/${A.id}`).set(bearer(B.token));
      registrarHttp('10 órgão B DELETE parametros de A', r);
      expect(RECUSADO).toContain(r.status);
    });
  });

  // ==========================================================================
  // 11. atas, credenciamento, documentos por id
  // ==========================================================================
  describe('11. atas, credenciamento e documentos', () => {
    let ataId: string;
    let credId: string;
    let docId: string;

    beforeAll(async () => {
      const hoje = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const ata = await ctx
        .http()
        .post('/api/atas')
        .set(bearer(pregA.token))
        .send({
          orgao_id: A.id,
          licitacao_id: X.lic.id,
          fornecedor_id: F1.id,
          fornecedor_cnpj: F1.cnpj,
          fornecedor_razao_social: F1.razao_social,
          objeto: 'Ata de teste (isolamento)',
          valor_total: 1000,
          data_assinatura: iso(hoje),
          data_vigencia_inicio: iso(hoje),
          data_vigencia_fim: iso(new Date(hoje.getTime() + 365 * 86_400_000)),
        });
      if (ata.status !== 201) throw new Error(`[fixture] criar ata → ${ata.status} ${JSON.stringify(ata.body)}`);
      ataId = ata.body.id;

      const cred = await ctx
        .http()
        .post('/api/credenciamento')
        .set(bearer(pregA.token))
        .send({ orgao_id: A.id, numero_processo: `CRED-${Date.now()}`, objeto: 'Credenciamento de teste (isolamento)' });
      if (cred.status !== 201) throw new Error(`[fixture] criar credenciamento → ${cred.status} ${JSON.stringify(cred.body)}`);
      credId = cred.body.id;

      const doc = await ctx
        .http()
        .post(`/api/documentos/licitacao/${X.lic.id}/vincular`)
        .set(bearer(pregA.token))
        .send({ tipo: 'ETP', titulo: 'ETP interno', nome_original: 'etp.pdf', caminho: '/uploads/isolamento-inexistente.pdf', publico: false });
      if (doc.status !== 201) throw new Error(`[fixture] vincular documento → ${doc.status} ${JSON.stringify(doc.body)}`);
      docId = doc.body.id;
    });

    it('GET /atas é limitado ao órgão do token, mesmo com ?orgaoId= de outro (controle)', async () => {
      const deA = await ctx.http().get('/api/atas').set(bearer(pregA.token)).expect(200);
      const deB = await ctx.http().get(`/api/atas?orgaoId=${A.id}`).set(bearer(pregB.token)).expect(200);
      registrar('11 GET /atas', `pregoeiro A vê=${deA.body.some((a: any) => a.id === ataId)} pregoeiro B vê=${deB.body.some((a: any) => a.id === ataId)}`);
      expect(deA.body.some((a: any) => a.id === ataId)).toBe(true);
      expect(deB.body.some((a: any) => a.id === ataId)).toBe(false);
    });

    it('GET /credenciamento é limitado ao órgão do token, mesmo com ?orgaoId= de outro (controle)', async () => {
      const deA = await ctx.http().get('/api/credenciamento').set(bearer(pregA.token)).expect(200);
      const deB = await ctx.http().get(`/api/credenciamento?orgaoId=${A.id}`).set(bearer(pregB.token)).expect(200);
      registrar('11 GET /credenciamento', `pregoeiro A vê=${deA.body.some((c: any) => c.id === credId)} pregoeiro B vê=${deB.body.some((c: any) => c.id === credId)}`);
      expect(deA.body.some((c: any) => c.id === credId)).toBe(true);
      expect(deB.body.some((c: any) => c.id === credId)).toBe(false);
    });

    // Corrigido na E1a: ata por id só para o órgão dono (AcessoLicitacaoService.assertOrgaoDaAta)
    test('órgão B não lê a ata de A por id', async () => {
      const r = await ctx.http().get(`/api/atas/${ataId}`).set(bearer(pregB.token));
      registrarHttp('11 pregoeiro B GET atas/:id', r);
      expect(RECUSADO).toContain(r.status);
    });

    // Corrigido na E1a: alterar ata / status só pelo órgão dono
    test('órgão B não altera a ata de A (dados e status)', async () => {
      const put = await ctx.http().put(`/api/atas/${ataId}`).set(bearer(pregB.token)).send({ observacoes: 'alterado pelo órgão B' });
      const st = await ctx.http().patch(`/api/atas/${ataId}/status`).set(bearer(pregB.token)).send({ status: 'SUSPENSA' });
      registrarHttp('11 pregoeiro B PUT atas/:id', put);
      registrarHttp('11 pregoeiro B PATCH atas/:id/status', st);
      expect(RECUSADO).toContain(put.status);
      expect(RECUSADO).toContain(st.status);
    });

    // Corrigido na E1a: credenciamento por id só para o órgão dono
    test('órgão B não lê o credenciamento de A por id', async () => {
      const r = await ctx.http().get(`/api/credenciamento/${credId}`).set(bearer(pregB.token));
      registrarHttp('11 pregoeiro B GET credenciamento/:id', r);
      expect(RECUSADO).toContain(r.status);
    });

    // Corrigido na E1a: alterar / publicar credenciamento só pelo órgão dono
    test('órgão B não altera nem publica o credenciamento de A', async () => {
      const put = await ctx.http().put(`/api/credenciamento/${credId}`).set(bearer(pregB.token)).send({ objeto: 'alterado pelo órgão B' });
      const pub = await ctx.http().patch(`/api/credenciamento/${credId}/publicar`).set(bearer(pregB.token));
      registrarHttp('11 pregoeiro B PUT credenciamento/:id', put);
      registrarHttp('11 pregoeiro B PATCH credenciamento/:id/publicar', pub);
      expect(RECUSADO).toContain(put.status);
      expect(RECUSADO).toContain(pub.status);
    });

    // Corrigido na E1a: documento não público só para o órgão dono (demais → 404)
    test('órgão B não lê documento não público de A por id', async () => {
      const r = await ctx.http().get(`/api/documentos/${docId}`).set(bearer(pregB.token));
      registrarHttp('11 pregoeiro B GET documentos/:id', r);
      expect(RECUSADO).toContain(r.status);
    });

    // Corrigido na E1a: publicar documento só pelo órgão dono
    test('órgão B não publica documento de A', async () => {
      const r = await ctx.http().put(`/api/documentos/${docId}/publicar`).set(bearer(pregB.token));
      registrarHttp('11 pregoeiro B PUT documentos/:id/publicar', r);
      expect(RECUSADO).toContain(r.status);
    });
  });

  // ==========================================================================
  // 12. lance v2 com item de outra licitação
  // ==========================================================================
  describe('12. lance v2 cruzando licitações', () => {
    // CORRIGIDO NA E1a (era vazamento): registrarLance não confere se o item pertence à licitação da sessão — disputa-v2/disputa.service.ts:603-615
    test('lance para item de Z enviado na sessão de X é recusado', async () => {
      const r = await lanceV2(
        ctx,
        X.sessaoId,
        { itemId: Z.lic.itens[0].id, fornecedorId: F3.id, fornecedorNome: F3.razao_social, valor: valores.proximo() },
        F3.token,
      );
      registrarHttp('12 F3 POST lance item de Z na sessão de X', r);
      expect(r.status).not.toBe(201);
      expect([400, 403, 404]).toContain(r.status);
    });

    it('participante de X com item de W (outra licitação do mesmo órgão) na sessão de X é recusado (E1a)', async () => {
      const r = await lanceV2(
        ctx,
        X.sessaoId,
        { itemId: W.lic.itens[0].id, fornecedorId: F1.id, fornecedorNome: F1.razao_social, valor: valores.proximo() },
        F1.token,
      );
      registrarHttp('12 F1 POST lance item de W na sessão de X', r);
      expect(r.status).toBe(400);
      expect(String(r.body?.message)).toMatch(/não pertence/);
    });
  });

  // ==========================================================================
  // 13. sigilo do orçamento (X = SIGILOSO) e melhor lance
  // ==========================================================================
  describe('13. sigilo do orçamento e melhor lance', () => {
    // CORRIGIDO NA E1a (era vazamento): leitura pública seleciona valor_total_estimado e itens.valor_unitario_estimado sem olhar
    // sigilo_orcamento — licitacoes/licitacoes.service.ts:1896-1970
    test('licitação pública com orçamento sigiloso não expõe valor estimado', async () => {
      const r = await ctx.http().get(`/api/licitacoes/publicas/${X.lic.id}`);
      const lic = r.body || {};
      const expostos = [
        lic.valor_total_estimado != null ? 'valor_total_estimado' : '',
        (lic.itens || []).some((i: any) => i.valor_unitario_estimado != null) ? 'itens.valor_unitario_estimado' : '',
      ].filter(Boolean);
      registrar('13 anônimo GET licitacoes/publicas/:id (X sigiloso)', `HTTP ${r.status} sigilo=${lic.sigilo_orcamento} expostos=[${expostos}]`);
      expect(r.status).toBe(200);
      expect(expostos).toEqual([]);
    });

    // CORRIGIDO NA E1a (era vazamento): GET /itens/:id e /itens/licitacao/:id são @Public e devolvem a entidade inteira — itens/itens.controller.ts:24-40
    test('item público com orçamento sigiloso não expõe valor estimado', async () => {
      const um = await ctx.http().get(`/api/itens/${X.lic.itens[0].id}`);
      const lista = await ctx.http().get(`/api/itens/licitacao/${X.lic.id}`);
      registrar(
        '13 anônimo GET itens/:id e itens/licitacao/:id (X sigiloso)',
        `HTTP ${um.status}/${lista.status} valor_unitario_estimado=${um.body?.valor_unitario_estimado} lista=${JSON.stringify((lista.body || []).map((i: any) => i.valor_unitario_estimado))}`,
      );
      expect(um.body?.valor_unitario_estimado ?? null).toBeNull();
      expect((lista.body || []).every((i: any) => i.valor_unitario_estimado == null)).toBe(true);
    });

    // CORRIGIDO NA E1a (era vazamento): item público traz melhor_lance_fornecedor_id durante a disputa — itens/itens.controller.ts:36-40; sessao/sessao.service.ts:524-528
    test('item público não expõe melhor_lance_fornecedor_id durante a disputa', async () => {
      // lance legítimo de F1 pela sala /sessao (como fornecedor/sala-disputa/page.tsx)
      const s1 = await conectarSocket(ctx, '/sessao', { token: F1.token });
      const hist = aguardarEvento(s1, 'historico_eventos');
      s1.emit('entrar_sessao', { sessaoId: X.sessaoId, participante: F1.razao_social, tipo: 'FORNECEDOR' });
      await hist;
      const resp = aguardarUmDe(s1, ['novo_lance', 'erro_lance']);
      s1.emit('enviar_lance', {
        sessaoId: X.sessaoId,
        itemId: X.lic.itens[1].id,
        fornecedorId: F1.id,
        fornecedorNome: F1.razao_social,
        valor: valores.proximo(),
      });
      const lance = await resp;
      s1.close();
      const r = await ctx.http().get(`/api/itens/${X.lic.itens[1].id}`);
      registrar(
        '13 anônimo GET itens/:id melhor lance (X)',
        `lance /sessao=${lance.evento} status_disputa=${r.body?.status_disputa} melhor_lance_fornecedor_id=${r.body?.melhor_lance_fornecedor_id === F1.id ? 'F1' : r.body?.melhor_lance_fornecedor_id}`,
      );
      expect(r.body?.melhor_lance_fornecedor_id ?? null).toBeNull();
      expect(identidadeNoPayload(r.body, F1)).toEqual([]);
    });

    it('órgão dono vê os valores estimados dos itens de X; órgão B não altera nem cria item em X (E1a)', async () => {
      const dono = await ctx.http().get(`/api/itens/licitacao/${X.lic.id}`).set(bearer(pregA.token)).expect(200);
      const put = await ctx.http().put(`/api/itens/${X.lic.itens[0].id}`).set(bearer(B.token)).send({ descricao_resumida: 'alterado por B' });
      const post = await ctx
        .http()
        .post('/api/itens')
        .set(bearer(B.token))
        .send({
          licitacao_id: X.lic.id,
          numero_item: 99,
          descricao_resumida: 'Item de B',
          quantidade: 1,
          unidade_medida: 'UNIDADE',
          valor_unitario_estimado: 1,
          sem_pca: true,
          justificativa_sem_pca: 'Item de teste E2E',
        });
      const adj = await ctx
        .http()
        .put(`/api/itens/${X.lic.itens[0].id}/adjudicar`)
        .set(bearer(F1.token))
        .send({ fornecedor_id: F1.id, fornecedor_nome: F1.razao_social, valor_unitario_homologado: 1 });
      registrar('13 itens: órgão B PUT/POST, F1 adjudicar (X)', `put=${put.status} post=${post.status} adj=${adj.status}`);
      expect(dono.body.every((i: any) => Number(i.valor_unitario_estimado) > 0)).toBe(true);
      expect(put.status).toBe(403);
      expect(post.status).toBe(403);
      expect(adj.status).toBe(403);
    });

    it('itens de licitação na fase interna não são lidos por fornecedor nem por outro órgão (E1a)', async () => {
      const f = await ctx.http().get(`/api/itens/licitacao/${L2.id}`).set(bearer(F1.token));
      const b = await ctx.http().get(`/api/itens/${L2.itens[0].id}`).set(bearer(B.token));
      const a = await ctx.http().get(`/api/itens/licitacao/${L2.id}`).set(bearer(A.token)).expect(200);
      expect([f.status, b.status]).toEqual([404, 404]);
      expect(a.body.length).toBe(L2.itens.length);
    });
  });

  // ==========================================================================
  // 14. impugnações, esclarecimentos e fase interna (E1a)
  // ==========================================================================
  describe('14. impugnações, esclarecimentos e fase interna', () => {
    let L3: LicitacaoFixture;
    let impF1: string;
    let impF2: string;
    let escF1: string;
    let docFaseInterna: string;

    beforeAll(async () => {
      // Pregão de A com edital publicado (prazo de impugnação aberto)
      L3 = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, L3, FaseLicitacao.PUBLICADO);

      const imp1 = await ctx
        .http()
        .post('/api/impugnacoes')
        .set(bearer(F1.token))
        .send({ licitacao_id: L3.id, fornecedor_id: F1.id, texto_impugnacao: 'Impugnação sigilosa de F1 (isolamento)' });
      if (imp1.status !== 201) throw new Error(`[fixture] impugnação F1 → ${imp1.status} ${JSON.stringify(imp1.body)}`);
      impF1 = imp1.body.id;

      const imp2 = await ctx
        .http()
        .post('/api/impugnacoes')
        .set(bearer(F2.token))
        .send({ licitacao_id: L3.id, texto_impugnacao: 'Impugnação de F2 (isolamento)' });
      if (imp2.status !== 201) throw new Error(`[fixture] impugnação F2 → ${imp2.status} ${JSON.stringify(imp2.body)}`);
      impF2 = imp2.body.id;

      const esc = await ctx
        .http()
        .post('/api/esclarecimentos')
        .set(bearer(F1.token))
        .send({ licitacao_id: L3.id, texto_esclarecimento: 'Pergunta de F1 (isolamento)' });
      if (esc.status !== 201) throw new Error(`[fixture] esclarecimento F1 → ${esc.status} ${JSON.stringify(esc.body)}`);
      escF1 = esc.body.id;

      // Documento da fase interna de L2 (pregão de A ainda na fase interna)
      const doc = await ctx
        .http()
        .post(`/api/fase-interna/${L2.id}/documento`)
        .set(bearer(A.token))
        .send({ tipo: 'DFD', titulo: 'DFD interno (isolamento)' });
      if (doc.status !== 201) throw new Error(`[fixture] documento fase interna → ${doc.status} ${JSON.stringify(doc.body)}`);
      docFaseInterna = doc.body.id;
    });

    test('F2 não impugna em nome de F1 (fornecedor_id do corpo ≠ token)', async () => {
      const r = await ctx
        .http()
        .post('/api/impugnacoes')
        .set(bearer(F2.token))
        .send({ licitacao_id: L3.id, fornecedor_id: F1.id, texto_impugnacao: 'em nome de F1' });
      registrarHttp('14 F2 POST impugnacoes como F1', r);
      expect(r.status).toBe(403);
    });

    test('órgão B (e fornecedor) não responde nem põe em análise impugnação de A', async () => {
      const resp = await ctx
        .http()
        .put(`/api/impugnacoes/${impF2}/responder`)
        .set(bearer(pregB.token))
        .send({ resposta: 'respondido pelo órgão B', status: 'INDEFERIDA', respondido_por: 'B' });
      const anal = await ctx.http().put(`/api/impugnacoes/${impF2}/em-analise`).set(bearer(pregB.token));
      const forn = await ctx
        .http()
        .put(`/api/impugnacoes/${impF2}/responder`)
        .set(bearer(F1.token))
        .send({ resposta: 'respondido por F1', status: 'DEFERIDA', respondido_por: 'F1' });
      registrarHttp('14 pregoeiro B PUT impugnacoes/:id/responder', resp);
      registrarHttp('14 pregoeiro B PUT impugnacoes/:id/em-analise', anal);
      expect(resp.status).toBe(403);
      expect(anal.status).toBe(403);
      expect(forn.status).toBe(403);
    });

    test('órgão B não responde nem arquiva esclarecimento de A', async () => {
      const resp = await ctx
        .http()
        .put(`/api/esclarecimentos/${escF1}/responder`)
        .set(bearer(pregB.token))
        .send({ resposta: 'respondido pelo órgão B', respondido_por: 'B' });
      const arq = await ctx.http().put(`/api/esclarecimentos/${escF1}/arquivar`).set(bearer(pregB.token));
      registrarHttp('14 pregoeiro B PUT esclarecimentos/:id/responder', resp);
      registrarHttp('14 pregoeiro B PUT esclarecimentos/:id/arquivar', arq);
      expect(resp.status).toBe(403);
      expect(arq.status).toBe(403);
    });

    test('fornecedor não vê impugnação pendente de outro fornecedor (lista e por id)', async () => {
      const lista = await ctx.http().get(`/api/impugnacoes/licitacao/${L3.id}`).set(bearer(F2.token)).expect(200);
      const porId = await ctx.http().get(`/api/impugnacoes/${impF1}`).set(bearer(F2.token));
      const anon = await ctx.http().get(`/api/impugnacoes/licitacao/${L3.id}`).expect(200);
      const orgaoB = await ctx.http().get(`/api/impugnacoes/licitacao/${L3.id}`).set(bearer(pregB.token)).expect(200);
      const donoA = await ctx.http().get(`/api/impugnacoes/licitacao/${L3.id}`).set(bearer(pregA.token)).expect(200);
      registrarHttp('14 F2 GET impugnacoes/:id de F1', porId);
      const ids = (b: any[]) => b.map((i) => i.id);
      expect(ids(lista.body)).toContain(impF2); // a própria
      expect(ids(lista.body)).not.toContain(impF1);
      expect(JSON.stringify(lista.body)).not.toContain(F1.id);
      expect(porId.status).toBe(404);
      expect(ids(anon.body)).toEqual([]);
      expect(ids(orgaoB.body)).toEqual([]);
      expect(ids(donoA.body)).toEqual(expect.arrayContaining([impF1, impF2]));
      // Sem a senha do fornecedor (relação resumida) nem para o dono
      expect(JSON.stringify(donoA.body)).not.toMatch(/"senha"/);
    });

    test('esclarecimento respondido fica público sem identificar quem perguntou', async () => {
      await ctx
        .http()
        .put(`/api/esclarecimentos/${escF1}/responder`)
        .set(bearer(pregA.token))
        .send({ resposta: 'Resposta do órgão A', respondido_por: 'Pregoeiro A' })
        .expect(200);
      const f2 = await ctx.http().get(`/api/esclarecimentos/licitacao/${L3.id}`).set(bearer(F2.token)).expect(200);
      const f1 = await ctx.http().get(`/api/esclarecimentos/licitacao/${L3.id}`).set(bearer(F1.token)).expect(200);
      const visto = f2.body.find((e: any) => e.id === escF1);
      expect(visto?.resposta).toBe('Resposta do órgão A');
      expect(visto?.fornecedor_id).toBeNull();
      expect(JSON.stringify(f2.body)).not.toContain(F1.id);
      expect(f1.body.find((e: any) => e.id === escF1)?.fornecedor_id).toBe(F1.id);
    });

    test('órgão B (e fornecedor) não lê nem altera documentos da fase interna de A', async () => {
      const lista = await ctx.http().get(`/api/fase-interna/${L2.id}/documentos`).set(bearer(pregB.token));
      const criar = await ctx
        .http()
        .post(`/api/fase-interna/${L2.id}/documento`)
        .set(bearer(pregB.token))
        .send({ tipo: 'ETP', titulo: 'ETP do órgão B' });
      const porId = await ctx.http().get(`/api/fase-interna/documento/${docFaseInterna}`).set(bearer(pregB.token));
      const submeter = await ctx.http().put(`/api/fase-interna/documento/${docFaseInterna}/submeter`).set(bearer(pregB.token));
      const estruturado = await ctx
        .http()
        .put(`/api/fase-interna/estruturado/${docFaseInterna}/dados`)
        .set(bearer(pregB.token))
        .send({ dados: { alterado: 'pelo órgão B' } });
      const instrucao = await ctx.http().get(`/api/fase-interna/${L2.id}/instrucao`).set(bearer(pregB.token));
      const avancar = await ctx.http().put(`/api/fase-interna/${L2.id}/avancar`).set(bearer(pregB.token));
      const preparar = await ctx.http().post(`/api/fase-interna/${L2.id}/preparar-automatico`).set(bearer(pregB.token));
      const fornecedor = await ctx.http().get(`/api/fase-interna/${L2.id}/documentos`).set(bearer(F1.token));
      const dono = await ctx.http().get(`/api/fase-interna/${L2.id}/documentos`).set(bearer(pregA.token));
      registrar(
        '14 órgão B fase-interna (L2)',
        `lista=${lista.status} criar=${criar.status} porId=${porId.status} submeter=${submeter.status} estruturado=${estruturado.status} instrucao=${instrucao.status} avancar=${avancar.status} preparar=${preparar.status} F1=${fornecedor.status} dono=${dono.status}`,
      );
      expect(lista.status).toBe(404);
      expect(porId.status).toBe(404);
      expect(instrucao.status).toBe(404);
      expect(criar.status).toBe(403);
      expect(submeter.status).toBe(403);
      expect(estruturado.status).toBe(403);
      expect(avancar.status).toBe(403);
      expect(preparar.status).toBe(403);
      expect(fornecedor.status).toBe(403);
      expect(dono.status).toBe(200);
    });

    test('documento público de licitação divulgada: outros leem só a visão pública; órgão B não exclui', async () => {
      const pub = await ctx
        .http()
        .post(`/api/documentos/licitacao/${X.lic.id}/vincular`)
        .set(bearer(pregA.token))
        .send({ tipo: 'ANEXO', titulo: 'Anexo público (isolamento)', nome_original: 'anexo.pdf', caminho: '/uploads/isolamento-inexistente-2.pdf', publico: true });
      expect(pub.status).toBe(201);
      const meta = await ctx.http().get(`/api/documentos/${pub.body.id}`).set(bearer(F2.token));
      const lista = await ctx.http().get(`/api/documentos/licitacao/${X.lic.id}`).set(bearer(F2.token)).expect(200);
      const del = await ctx.http().delete(`/api/documentos/${pub.body.id}`).set(bearer(pregB.token));
      expect(meta.status).toBe(200);
      expect(meta.body.caminho_arquivo).toBeUndefined();
      expect(lista.body.length).toBeGreaterThan(0);
      expect(lista.body.every((d: any) => d.caminho_arquivo === undefined)).toBe(true);
      expect(del.status).toBe(403);
    });

    test('pesquisa de preços pública: 404 na fase interna e com orçamento sigiloso; disponível após divulgar', async () => {
      const interna = await ctx.http().get(`/api/fase-interna/publico/precos/${L2.id}`);
      const sigilosa = await ctx.http().get(`/api/fase-interna/publico/precos/${X.lic.id}`);
      const divulgada = await ctx.http().get(`/api/fase-interna/publico/precos/${L3.id}`);
      registrar('14 GET publico/precos', `interna=${interna.status} sigilosa=${sigilosa.status} divulgada=${divulgada.status}`);
      expect(interna.status).toBe(404);
      expect(sigilosa.status).toBe(404);
      expect(divulgada.status).toBe(200);
      expect(JSON.stringify(divulgada.body)).not.toContain('documento_comprobatorio_path');
    });

    test('órgão B não lê, altera nem remove modelo e fluxo de aprovação de A', async () => {
      const modelo = await ctx
        .http()
        .post('/api/fase-interna/modelos')
        .set(bearer(A.token))
        .send({ tipo: 'DFD', nome: 'Modelo de A (isolamento)', secoes: [{ id: 's1', titulo: 'Seção 1' }] });
      expect(modelo.status).toBe(201);
      expect(modelo.body.orgao_id).toBe(A.id);
      const fluxo = await ctx
        .http()
        .post('/api/fase-interna/fluxos-aprovacao')
        .set(bearer(A.token))
        .send({ nome: 'Fluxo de A (isolamento)', tipo_documento: 'DFD', etapas: [{ nome: 'Chefia' }] });
      expect(fluxo.status).toBe(201);
      expect(fluxo.body.orgao_id).toBe(A.id);

      const lerModelo = await ctx.http().get(`/api/fase-interna/modelos/${modelo.body.id}`).set(bearer(pregB.token));
      const putModelo = await ctx.http().put(`/api/fase-interna/modelos/${modelo.body.id}`).set(bearer(pregB.token)).send({ nome: 'alterado por B' });
      const delModelo = await ctx.http().delete(`/api/fase-interna/modelos/${modelo.body.id}`).set(bearer(pregB.token));
      const putFluxo = await ctx.http().put(`/api/fase-interna/fluxos-aprovacao/${fluxo.body.id}`).set(bearer(pregB.token)).send({ nome: 'alterado por B' });
      const delFluxo = await ctx.http().delete(`/api/fase-interna/fluxos-aprovacao/${fluxo.body.id}`).set(bearer(pregB.token));
      const listaFluxosB = await ctx.http().get(`/api/fase-interna/fluxos-aprovacao?orgaoId=${A.id}`).set(bearer(B.token)).expect(200);
      registrar(
        '14 órgão B modelos/fluxos de A',
        `lerModelo=${lerModelo.status} putModelo=${putModelo.status} delModelo=${delModelo.status} putFluxo=${putFluxo.status} delFluxo=${delFluxo.status}`,
      );
      expect(lerModelo.status).toBe(404);
      expect(putModelo.status).toBe(403);
      expect(delModelo.status).toBe(403);
      expect(putFluxo.status).toBe(403);
      expect(delFluxo.status).toBe(403);
      expect(listaFluxosB.body.some((f: any) => f.id === fluxo.body.id)).toBe(false);
      // O dono continua podendo
      await ctx.http().put(`/api/fase-interna/modelos/${modelo.body.id}`).set(bearer(A.token)).send({ nome: 'alterado por A' }).expect(200);
    });

    test('caixas de entrada/aprovação: setor e usuário de outro órgão são recusados; servidor só vê a própria caixa', async () => {
      const setorA = (
        await ctx.dataSource.query(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, $2, $3) RETURNING id`, [
          A.id,
          `ISO-${Date.now()}`,
          'Setor de A (isolamento)',
        ])
      )[0].id;
      const entradaSetor = await ctx.http().get(`/api/fase-interna/tramitacoes/caixa-entrada?setorId=${setorA}`).set(bearer(B.token));
      const entradaUsuario = await ctx.http().get(`/api/fase-interna/tramitacoes/caixa-entrada?usuarioId=${pregA.id}`).set(bearer(B.token));
      const aprovSetor = await ctx.http().get(`/api/fase-interna/aprovacoes/caixa?setorId=${setorA}`).set(bearer(B.token));
      const aprovUsuario = await ctx.http().get(`/api/fase-interna/aprovacoes/caixa?usuarioId=${pregA.id}`).set(bearer(B.token));
      // Pregoeiro (sem papel ADMIN) não consulta a caixa de outra pessoa do próprio órgão
      const outraPessoa = await ctx.http().get(`/api/fase-interna/aprovacoes/caixa?usuarioId=${A.id}`).set(bearer(pregA.token));
      // Controles: o próprio órgão / o próprio servidor
      const donoSetor = await ctx.http().get(`/api/fase-interna/tramitacoes/caixa-entrada?setorId=${setorA}`).set(bearer(A.token));
      const propria = await ctx.http().get(`/api/fase-interna/aprovacoes/caixa?usuarioId=${pregA.id}`).set(bearer(pregA.token));
      registrar(
        '14 caixas',
        `B setorA=${entradaSetor.status}/${aprovSetor.status} B usuarioA=${entradaUsuario.status}/${aprovUsuario.status} pregA outra=${outraPessoa.status} donoSetor=${donoSetor.status} propria=${propria.status}`,
      );
      expect([entradaSetor.status, entradaUsuario.status, aprovSetor.status, aprovUsuario.status]).toEqual([403, 403, 403, 403]);
      expect(outraPessoa.status).toBe(403);
      expect(donoSetor.status).toBe(200);
      expect(propria.status).toBe(200);
    });
  });
});
