/**
 * FASE INTERNA — ENTREGA 2 (Tarefas e caixa de entrada + etapas).
 * docs/licitacao/PLANO-FASE-INTERNA.md §8.
 *
 *  A. Modo SIMPLES (padrão): ao abrir o processo nasce a tarefa da demanda
 *     para o responsável (agente); anexar a peça conclui a tarefa (registrando
 *     quem cumpriu) e libera as seguintes; "não se aplica" também conclui;
 *     assinatura concluída conclui; histórico das etapas; etapas na tela.
 *  B. Modo POR_SETOR: a tarefa vai para o papel certo; assumir; reatribuir.
 *  C. Controle interno: ativo cria a etapa/tarefa; desativado cancela.
 *  D. Processo revogado cancela as tarefas abertas.
 *  E. Caixa: ordem por prazo, atrasadas, contagem (badge), abas.
 *  F. Migração de boot rodada 2x (idempotente).
 *  Isolamento em todo endpoint novo: outro órgão (leitura 404 / escrita 403),
 *  usuário do mesmo órgão sem o papel não vê, fornecedor 403, anônimo 401.
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  pdfDeTeste,
} from './support';
import { criarDocumentoInstrucao } from './support/dispensa';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from '../src/fase-interna/entities/documento-fase-interna.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe('Fase interna — Entrega 2 (tarefas e etapas)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let requisitante: UsuarioOrgaoFixture;
  let juridico: UsuarioOrgaoFixture;
  let semPapel: UsuarioOrgaoFixture;
  let deB: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);

  const caixa = async (token: string, aba = 'para-mim') => (await http().get(`/api/tarefas?aba=${aba}`).set(bearer(token)).expect(200)).body;
  const tarefasDoProcesso = async (lic: { id: string }) => {
    await tarefas().aguardarPendentes();
    return sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 ORDER BY created_at`, [lic.id]);
  };
  const abertaDe = async (lic: { id: string }, passo: string) =>
    (await tarefasDoProcesso(lic)).find((t: any) => t.passo === passo && t.status === 'ABERTA');
  const anexar = (lic: { id: string }, tipo: string, token: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(`Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Objeto simples, sem necessidade.' });
  const configurar = (token: string, corpo: any) => http().put('/api/fase-interna/configuracao').set(bearer(token)).send(corpo);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara E2 A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E2 B' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Joel Agente' });
    requisitante = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Rita Requisitante' });
    juridico = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paulo Procurador' });
    semPapel = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Sem Papel' });
    deB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.ADMIN, nome: 'Admin de B' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. modo SIMPLES (padrão): tudo para o responsável do processo', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('configuração padrão: SIMPLES, controle interno desativado, prazos da Portaria 089', async () => {
      const r = await http().get('/api/fase-interna/configuracao').set(bearer(agente.token)).expect(200);
      expect(r.body).toMatchObject({ modo: 'SIMPLES', controle_interno_ativo: false, padrao: true });
      expect(r.body.prazos).toMatchObject({ PESQUISA: 30, RESERVA: 3, PARECER: 5, CONTROLE_INTERNO: 3, PUBLICACAO: 5 });
    });

    it('ao abrir o processo nasce SÓ a tarefa da demanda, para o agente, na caixa dele', async () => {
      const ts = await tarefasDoProcesso(lic);
      expect(ts.map((t: any) => [t.passo, t.status])).toEqual([['DFD', 'ABERTA']]);
      expect(ts[0]).toMatchObject({ responsavel_usuario_id: agente.id, origem: 'ETAPA', tipo: 'PECA', tipo_peca: 'DFD', orgao_id: A.id });
      const cx = await caixa(agente.token);
      const t = cx.tarefas.find((x: any) => x.processo.id === lic.id);
      expect(t).toMatchObject({ titulo: 'Formalizar a demanda (DFD)', destino: `/orgao/processos/${lic.id}#peca-DFD`, atrasada: false });
      expect(t.responsavel.nome).toBe('Joel Agente');
      // o login do órgão vê a tarefa em "Aguardando outros" (está com uma pessoa)
      expect((await caixa(A.token, 'aguardando')).tarefas.some((x: any) => x.processo.id === lic.id)).toBe(true);
      expect((await caixa(A.token)).tarefas.some((x: any) => x.processo.id === lic.id)).toBe(false);
    });

    it('anexar o DFD conclui a tarefa (quem cumpriu = quem anexou) e libera estudo, TR e pesquisa', async () => {
      expect((await anexar(lic, 'DFD', agente.token)).status).toBe(201);
      const ts = await tarefasDoProcesso(lic);
      const dfd = ts.find((t: any) => t.passo === 'DFD');
      expect(dfd).toMatchObject({ status: 'CONCLUIDA', concluida_por_id: agente.id, concluida_por_nome: 'Joel Agente' });
      expect(dfd.concluida_em).toBeTruthy();
      const abertas = ts.filter((t: any) => t.status === 'ABERTA');
      expect(abertas.map((t: any) => t.passo).sort()).toEqual(['ETP', 'PESQUISA', 'TR']);
      expect(abertas.every((t: any) => t.responsavel_usuario_id === agente.id)).toBe(true);
      const pesquisa = abertas.find((t: any) => t.passo === 'PESQUISA');
      expect(pesquisa.prazo_dias_uteis).toBe(30);
      expect(pesquisa.prazo).toBeTruthy();
      // concluída aparece na aba "Concluídas" de quem cumpriu
      expect((await caixa(agente.token, 'concluidas')).tarefas.some((x: any) => x.id === dfd.id)).toBe(true);
    });

    it('"não se aplica" também conclui (ETP e riscos) — autor do JWT', async () => {
      expect((await naoSeAplica(lic, 'ETP', agente.token)).status).toBe(201);
      expect((await abertaDe(lic, 'ETP'))).toBeTruthy(); // falta a análise de riscos
      expect((await naoSeAplica(lic, 'AR', agente.token)).status).toBe(201);
      const etp = (await tarefasDoProcesso(lic)).find((t: any) => t.passo === 'ETP');
      expect(etp).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Joel Agente' });
    });

    it('etapas na tela do processo: situação, responsável, prazo, etapa atual; histórico das mudanças', async () => {
      const r = await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(agente.token)).expect(200);
      expect(r.body.modo).toBe('SIMPLES');
      const etapa = (e: string) => r.body.etapas.find((x: any) => x.etapa === e);
      expect(etapa('DEMANDA').situacao).toBe('CONCLUIDA');
      expect(etapa('ETP_RISCOS')).toMatchObject({ situacao: 'CONCLUIDA', nao_se_aplica: true });
      expect(etapa('PESQUISA_PRECOS').situacao).toBe('DISPONIVEL');
      expect(etapa('PESQUISA_PRECOS').passos[0].tarefa.responsavel.nome).toBe('Joel Agente');
      expect(etapa('PESQUISA_PRECOS').passos[0].prazo_dias_uteis).toBe(30);
      expect(etapa('RESERVA_ORCAMENTARIA').situacao).toBe('AGUARDANDO');
      expect(r.body.etapa_atual).toBe('TERMO_REFERENCIA');
      expect(r.body.etapas.some((e: any) => e.etapa === 'CONTROLE_INTERNO')).toBe(false);
      const logs = await sql(`SELECT descricao, dados_depois FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'ETAPA_ALTERADA'`, [lic.id]);
      expect(logs.some((l: any) => l.dados_depois.etapa === 'DEMANDA' && l.dados_depois.situacao === 'CONCLUIDA')).toBe(true);
      expect(r.body.historico.length).toBeGreaterThan(0);
    });

    it('isolamento das etapas: outro órgão 404, fornecedor 403, anônimo 401', async () => {
      expect((await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(F.token))).status).toBe(403);
      expect((await http().get(`/api/fase-interna/${lic.id}/etapas`)).status).toBe(401);
    });

    it('peça que volta a ser trabalhada (enviada para assinatura) reabre a tarefa; a assinatura concluída a conclui', async () => {
      const outro = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      expect(await abertaDe(outro, 'DFD')).toBeTruthy();
      await criarDocumentoInstrucao(ctx, outro, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'DFD');
      expect((await tarefasDoProcesso(outro)).find((t: any) => t.passo === 'DFD').status).toBe('CONCLUIDA');
      const envio = await http()
        .post(`/api/fase-interna/${outro.id}/documentos/DFD/assinatura`)
        .set(bearer(A.token))
        .send({ signatarios: [{ usuario_id: requisitante.id, papel: 'Requisitante' }] });
      expect(envio.status).toBe(201);
      const reaberta = await abertaDe(outro, 'DFD');
      expect(reaberta).toBeTruthy();
      const [sig] = await sql(`SELECT id::text AS id FROM signatarios_documento WHERE documento_id = $1`, [envio.body.documento_assinatura_id]);
      const r = await http().post(`/api/portal-assinaturas/${envio.body.documento_assinatura_id}/signatarios/${sig.id}/assinar`).set(bearer(requisitante.token)).send({});
      expect(r.status).toBe(201);
      let t: any = null;
      for (let i = 0; i < 100; i++) {
        [t] = await sql(`SELECT * FROM tarefas WHERE id = $1`, [reaberta.id]);
        if (t.status === 'CONCLUIDA') break;
        await new Promise((res) => setTimeout(res, 100));
      }
      expect(t).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Rita Requisitante' });
    });
  });

  // ==========================================================================
  describe('B. modo POR_SETOR: papel certo, assumir e reatribuir', () => {
    let lic: LicitacaoFixture;
    let dfd: any;

    it('configuração: só o administrador do órgão altera; fornecedor 403; anônimo 401; validação', async () => {
      expect((await configurar(semPapel.token, { modo: 'POR_SETOR' })).status).toBe(403);
      expect((await configurar(agente.token, { modo: 'POR_SETOR' })).status).toBe(403);
      expect((await configurar(F.token, { modo: 'POR_SETOR' })).status).toBe(403);
      expect((await http().put('/api/fase-interna/configuracao').send({ modo: 'POR_SETOR' })).status).toBe(401);
      expect((await configurar(A.token, { modo: 'QUALQUER' })).status).toBe(400);
      // o admin de B configura só o próprio órgão
      expect((await configurar(deB.token, { modo: 'POR_SETOR' })).status).toBe(200);
      expect((await http().get('/api/fase-interna/configuracao').set(bearer(A.token)).expect(200)).body.modo).toBe('SIMPLES');
      const r = await configurar(A.token, { modo: 'POR_SETOR' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ modo: 'POR_SETOR', padrao: false });
    });

    it('papéis: o administrador atribui; usuário de outro órgão 403; papel inválido 400; não-admin 403', async () => {
      const put = (token: string, u: string, corpo: any) => http().put(`/api/fase-interna/configuracao/usuarios/${u}`).set(bearer(token)).send(corpo);
      expect((await put(A.token, requisitante.id, { papeis: ['REQUISITANTE'] })).body.papeis).toEqual(['REQUISITANTE']);
      expect((await put(A.token, juridico.id, { papeis: ['JURIDICO', 'CONTROLE_INTERNO'] })).status).toBe(200);
      expect((await put(A.token, requisitante.id, { papeis: ['PAPA'] })).status).toBe(400);
      expect((await put(A.token, deB.id, { papeis: ['JURIDICO'] })).status).toBe(403);
      expect((await put(deB.token, requisitante.id, { papeis: ['JURIDICO'] })).status).toBe(403);
      expect((await put(semPapel.token, semPapel.id, { papeis: ['JURIDICO'] })).status).toBe(403);
      expect((await put(F.token, semPapel.id, { papeis: ['JURIDICO'] })).status).toBe(403);
      const lista = (await http().get('/api/fase-interna/configuracao/usuarios').set(bearer(agente.token)).expect(200)).body;
      expect(lista.find((u: any) => u.id === juridico.id).papeis).toEqual(['JURIDICO', 'CONTROLE_INTERNO']);
      expect(lista.some((u: any) => u.id === deB.id)).toBe(false);
    });

    it('a tarefa da demanda vai para o papel Requisitante: quem tem o papel vê; sem o papel, não', async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      dfd = await abertaDe(lic, 'DFD');
      expect(dfd).toMatchObject({ responsavel_usuario_id: null, responsavel_papel: 'REQUISITANTE' });
      const cx = await caixa(requisitante.token);
      expect(cx.tarefas.find((t: any) => t.id === dfd.id)).toMatchObject({ pode_assumir: true, responsavel: { rotulo: 'Requisitante' } });
      for (const u of [juridico, semPapel]) {
        for (const aba of ['para-mim', 'aguardando', 'concluidas']) {
          expect((await caixa(u.token, aba)).tarefas.some((t: any) => t.id === dfd.id)).toBe(false);
        }
      }
      expect((await caixa(deB.token)).tarefas.some((t: any) => t.processo.id === lic.id)).toBe(false);
      expect((await caixa(deB.token, 'aguardando')).tarefas.some((t: any) => t.processo.id === lic.id)).toBe(false);
      // o agente do processo acompanha em "Aguardando outros"
      expect((await caixa(agente.token, 'aguardando')).tarefas.some((t: any) => t.id === dfd.id)).toBe(true);
    });

    it('caixa: fornecedor 403, anônimo 401', async () => {
      expect((await http().get('/api/tarefas').set(bearer(F.token))).status).toBe(403);
      expect((await http().get('/api/tarefas')).status).toBe(401);
      expect((await http().get('/api/tarefas/contagem').set(bearer(F.token))).status).toBe(403);
      expect((await http().get('/api/tarefas/contagem')).status).toBe(401);
    });

    it('assumir: só quem tem o papel; depois a tarefa é dela', async () => {
      expect((await http().post(`/api/tarefas/${dfd.id}/assumir`).set(bearer(juridico.token))).status).toBe(403);
      expect((await http().post(`/api/tarefas/${dfd.id}/assumir`).set(bearer(deB.token))).status).toBe(403);
      expect((await http().post(`/api/tarefas/${dfd.id}/assumir`).set(bearer(F.token))).status).toBe(403);
      expect((await http().post(`/api/tarefas/${dfd.id}/assumir`)).status).toBe(401);
      const r = await http().post(`/api/tarefas/${dfd.id}/assumir`).set(bearer(requisitante.token));
      expect(r.status).toBe(201);
      expect(r.body.responsavel).toMatchObject({ usuario_id: requisitante.id, nome: 'Rita Requisitante' });
      const [t] = await sql(`SELECT atribuicao_manual FROM tarefas WHERE id = $1`, [dfd.id]);
      expect(t.atribuicao_manual).toBe(true);
    });

    it('reatribuir: a outra pessoa do mesmo órgão; outro órgão 403; sem permissão 403; fornecedor 403; anônimo 401', async () => {
      const reatribuir = (token: string | null, usuario_id: string) => {
        const r = http().post(`/api/tarefas/${dfd.id}/reatribuir`);
        return (token ? r.set(bearer(token)) : r).send({ usuario_id, motivo: 'Férias' });
      };
      expect((await reatribuir(requisitante.token, deB.id)).status).toBe(403); // usuário de outro órgão
      expect((await reatribuir(semPapel.token, juridico.id)).status).toBe(403); // não é responsável
      expect((await reatribuir(deB.token, deB.id)).status).toBe(403); // tarefa de outro órgão
      expect((await reatribuir(F.token, juridico.id)).status).toBe(403);
      expect((await reatribuir(null, juridico.id)).status).toBe(401);
      const r = await reatribuir(requisitante.token, juridico.id);
      expect(r.status).toBe(201);
      expect(r.body.responsavel.usuario_id).toBe(juridico.id);
      expect((await caixa(juridico.token)).tarefas.some((t: any) => t.id === dfd.id)).toBe(true);
      expect((await caixa(requisitante.token)).tarefas.some((t: any) => t.id === dfd.id)).toBe(false);
      const [log] = await sql(`SELECT descricao, usuario_nome FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'TAREFA_REATRIBUIDA' ORDER BY created_at DESC LIMIT 1`, [lic.id]);
      expect(log.descricao).toMatch(/Paulo Procurador/);
      expect(log.usuario_nome).toBe('Rita Requisitante');
    });

    it('com o DFD pronto, a pesquisa vai para Compras (30 dias úteis) e o estudo para o Requisitante', async () => {
      expect((await anexar(lic, 'DFD', juridico.token)).status).toBe(201);
      expect(await abertaDe(lic, 'PESQUISA')).toMatchObject({ responsavel_papel: 'COMPRAS', prazo_dias_uteis: 30 });
      expect(await abertaDe(lic, 'ETP')).toMatchObject({ responsavel_papel: 'REQUISITANTE' });
      expect((await tarefasDoProcesso(lic)).find((t: any) => t.passo === 'DFD')).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Paulo Procurador' });
    });

    afterAll(async () => {
      await configurar(A.token, { modo: 'SIMPLES' });
    });
  });

  // ==========================================================================
  describe('C. controle interno ativável/desativável por órgão', () => {
    let C: OrgaoFixture;
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      C = await criarOrgao(ctx, { nome: 'Câmara E2 C (controle interno)' });
      expect((await configurar(C.token, { controle_interno_ativo: true })).status).toBe(200);
      lic = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    });

    it('ativo: a manifestação entra na instrução (não bloqueia a publicação) e a etapa aparece', async () => {
      const inst = (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(C.token)).expect(200)).body;
      const mci = inst.itens.find((i: any) => i.tipo === 'MCI');
      expect(mci).toMatchObject({ obrigatorio: false, pode_nao_se_aplicar: false });
      const etapas = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(C.token)).expect(200)).body;
      expect(etapas.etapas.some((e: any) => e.etapa === 'CONTROLE_INTERNO')).toBe(true);
    });

    it('com parecer pronto nasce a tarefa do controle interno (caixa do papel, sem agente); desativar cancela', async () => {
      for (const t of ['DFD', 'PP', 'AA']) expect((await anexar(lic, t, C.token)).status).toBe(201);
      for (const t of ['ETP', 'AR', 'TR', 'DO', 'DP', 'RAG', 'MC', 'JC', 'PJ']) expect((await naoSeAplica(lic, t, C.token)).status).toBe(201);
      const ci = await abertaDe(lic, 'CONTROLE_INTERNO');
      // processo criado pelo login do órgão, sem agente: a caixa do papel "Agente de contratação"
      expect(ci).toMatchObject({ responsavel_papel: 'AGENTE_CONTRATACAO', prazo_dias_uteis: 3, tipo_peca: 'MCI' });
      expect(await abertaDe(lic, 'PUBLICACAO')).toBeFalsy(); // publicação espera o controle interno
      // o login do órgão vê a tarefa sem dono em "Para mim"
      expect((await caixa(C.token)).tarefas.some((t: any) => t.id === ci.id)).toBe(true);

      expect((await configurar(C.token, { controle_interno_ativo: false })).status).toBe(200);
      const [t] = await sql(`SELECT status, motivo_cancelamento FROM tarefas WHERE id = $1`, [ci.id]);
      expect(t).toMatchObject({ status: 'CANCELADA', motivo_cancelamento: expect.stringMatching(/deixou de se aplicar/) });
      expect(await abertaDe(lic, 'PUBLICACAO')).toMatchObject({ tipo: 'PUBLICACAO', prazo_dias_uteis: 5 });
      const logs = await sql(`SELECT dados_depois FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'ETAPA_ALTERADA'`, [lic.id]);
      expect(logs.some((l: any) => l.dados_depois.etapa === 'CONTROLE_INTERNO' && l.dados_depois.situacao === 'NAO_APLICAVEL')).toBe(true);
    });
  });

  // ==========================================================================
  describe('D. processo revogado cancela as tarefas abertas', () => {
    it('REVOGAR na fase interna → tarefas canceladas', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      expect(await abertaDe(lic, 'DFD')).toBeTruthy();
      const r = await http().post(`/api/licitacoes/${lic.id}/atos/REVOGAR`).set(bearer(A.token)).send({ motivo: 'Demanda deixou de existir' });
      expect(r.status).toBe(201);
      const ts = await tarefasDoProcesso(lic);
      expect(ts.every((t: any) => t.status === 'CANCELADA')).toBe(true);
      expect(ts[0].motivo_cancelamento).toMatch(/revogado/);
    });
  });

  // ==========================================================================
  describe('E. caixa: prazo, atrasadas e contagem', () => {
    it('ordena por prazo, destaca atrasada e conta no badge', async () => {
      const D = await criarOrgao(ctx, { nome: 'Órgão E2 D (caixa)' });
      const ag = await criarUsuarioOrgao(ctx, D, { role: RoleUsuario.PREGOEIRO, nome: 'Agente D' });
      const l1 = await criarLicitacao(ctx, D, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: ag.id } });
      const l2 = await criarLicitacao(ctx, D, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: ag.id } });
      const t1 = await abertaDe(l1, 'DFD');
      const t2 = await abertaDe(l2, 'DFD');
      await sql(`UPDATE tarefas SET prazo = now() - interval '2 days' WHERE id = $1`, [t2.id]);
      await sql(`UPDATE tarefas SET prazo = now() + interval '5 days' WHERE id = $1`, [t1.id]);
      const cx = await caixa(ag.token);
      expect(cx.tarefas.map((t: any) => t.id)).toEqual([t2.id, t1.id]);
      expect(cx.tarefas[0].atrasada).toBe(true);
      expect(cx.tarefas[1].atrasada).toBe(false);
      expect(cx.contagem).toMatchObject({ para_mim: 2, atrasadas: 1 });
      expect(cx.prazos_semana.map((p: any) => p.tarefa_id)).toEqual([t2.id, t1.id]);
      expect((await http().get('/api/tarefas/contagem').set(bearer(ag.token)).expect(200)).body).toEqual({ para_mim: 2, atrasadas: 1 });
    });
  });

  // ==========================================================================
  describe('F. migração de boot (tarefas dos processos existentes)', () => {
    it('cria as tarefas abertas que faltam e, rodada 2x, não duplica', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await tarefas().aguardarPendentes();
      // processo "de antes da Entrega 2": sem tarefa nenhuma
      await sql(`DELETE FROM tarefas WHERE licitacao_id = $1`, [lic.id]);
      const r1 = await tarefas().migrarProcessosExistentes();
      expect(r1.criadas).toBeGreaterThanOrEqual(1);
      const depois1 = await sql(`SELECT id, passo, status FROM tarefas ORDER BY id`);
      expect(depois1.filter((t: any) => t.status === 'ABERTA' && t.passo === 'DFD').length).toBeGreaterThan(0);
      expect((await tarefasDoProcesso(lic)).map((t: any) => t.passo)).toEqual(['DFD']);
      const r2 = await tarefas().migrarProcessosExistentes();
      expect(r2.criadas).toBe(0);
      expect(await sql(`SELECT id, passo, status FROM tarefas ORDER BY id`)).toEqual(depois1);
      // no banco: nunca duas abertas com a mesma chave
      const [{ n }] = await sql(`SELECT COUNT(*)::int AS n FROM (SELECT licitacao_id, chave FROM tarefas WHERE status = 'ABERTA' GROUP BY 1, 2 HAVING COUNT(*) > 1) x`);
      expect(n).toBe(0);
    });
  });
});
