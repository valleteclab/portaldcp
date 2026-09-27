/**
 * FASE INTERNA — F1: MODELO DE FLUXO EM DADOS
 * (docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §10 e §11).
 *
 *  A. Modelo do órgão: leitura, validação pela lei (400 com o artigo),
 *     gravação com versão, restaurar padrão, PUT antigo da configuração
 *     gravando no modelo, modelo do sistema / requisitos / travas só pelo
 *     admin da plataforma; isolamento entre órgãos.
 *  B. Aprovação da demanda: a DFD pronta aguarda quem aprova; só o designado
 *     aprova; demanda aprovada no módulo de demandas conta.
 *  C. Voltar/avançar: reabrir etapa (motivo, permissão), dependentes "a
 *     revisar", conformidade reflete (FLUXO-01), revisão encerrada pela peça
 *     nova ou pela confirmação.
 *  D. Etapa opcional de registro e snapshot do caminho (edição do modelo não
 *     muda processo em andamento).
 *  E. Parecer dispensado por ato (art. 53, §5º).
 *  F. Migração: processo existente = legado (não trava); órgão com
 *     configuração ganha modelo próprio; idempotente.
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
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { ModeloFluxoService } from '../src/fase-interna/fluxo/modelo-fluxo.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const amanha = () => new Date(Date.now() + 21 * 3_600_000).toISOString().slice(0, 10);

describe('Fase interna — F1: modelo de fluxo em dados', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let adminA: UsuarioOrgaoFixture;
  let agenteA: UsuarioOrgaoFixture;
  let apoioA: UsuarioOrgaoFixture;
  let adminB: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);

  const tarefasDoProcesso = async (lic: { id: string }) => {
    await tarefas().aguardarPendentes();
    return sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 ORDER BY created_at`, [lic.id]);
  };
  const abertas = async (lic: { id: string }) => (await tarefasDoProcesso(lic)).filter((t: any) => t.status === 'ABERTA');
  const etapas = async (lic: { id: string }, token: string) => (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(token)).expect(200)).body;
  const passo = (et: any, codigo: string) => et.etapas.flatMap((e: any) => e.passos).find((p: any) => p.passo === codigo);
  const anexar = (lic: { id: string }, tipo: string, token: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(`Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Objeto simples, sem necessidade.' });
  const modelo = (token: string, tipo = 'DISPENSA', q = '') => http().get(`/api/fluxo-fase-interna/modelos/${tipo}${q}`).set(bearer(token));
  const salvar = (token: string | null, corpo: any, tipo = 'DISPENSA', q = '') => {
    const r = http().put(`/api/fluxo-fase-interna/modelos/${tipo}${q}`);
    return (token ? r.set(bearer(token)) : r).send(corpo);
  };
  const etapaDoModelo = (m: any, codigo: string) => m.modelo.etapas.find((e: any) => e.codigo === codigo);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara F1 A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura F1 B' });
    F = await criarFornecedor(ctx);
    adminA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Adm A' });
    agenteA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Agente A' });
    apoioA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Apoio A' });
    adminB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.ADMIN, nome: 'Adm B' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. modelo do órgão: leitura, validação pela lei, gravação e isolamento', () => {
    it('sem modelo próprio, o órgão vê o modelo do sistema "Câmara — Portaria 089" (três tipos), válido e com o desenho', async () => {
      const lista = (await http().get('/api/fluxo-fase-interna/modelos').set(bearer(agenteA.token)).expect(200)).body;
      expect(lista.map((m: any) => [m.tipo, m.proprio])).toEqual([
        ['DISPENSA', false],
        ['INEXIGIBILIDADE', false],
        ['LICITACAO', false],
      ]);
      const m = (await modelo(agenteA.token).expect(200)).body;
      expect(m.modelo.nome).toBe('Câmara — Portaria 089');
      expect(m.validacao).toMatchObject({ ok: true, erros: [] });
      expect(m.desenho[1].etapas).toEqual(['ETP', 'TR', 'PESQUISA']);
      expect(etapaDoModelo(m, 'AUTORIZACAO_INICIO')).toMatchObject({ ligada: false, obrigatoria: false, conclusao: 'REGISTRO' });
      expect(etapaDoModelo(m, 'CONTROLE_INTERNO').ligada).toBe(false);
    });

    it('isolamento da leitura: fornecedor 403, anônimo 401; tipo inválido 400', async () => {
      expect((await modelo(F.token)).status).toBe(403);
      expect((await http().get('/api/fluxo-fase-interna/modelos/DISPENSA')).status).toBe(401);
      expect((await modelo(agenteA.token, 'QUALQUER')).status).toBe(400);
    });

    it('escrita só do administrador do órgão: agente 403, fornecedor 403, anônimo 401', async () => {
      expect((await salvar(agenteA.token, { etapas: [] })).status).toBe(403);
      expect((await salvar(F.token, { etapas: [] })).status).toBe(403);
      expect((await salvar(null, { etapas: [] })).status).toBe(401);
    });

    it('modelo que a lei não permite: 400 com o artigo (sem gravar)', async () => {
      const r = await salvar(adminA.token, { etapas: [{ codigo: 'AUTORIZACAO', obrigatoria: false, ligada: false }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/art\. 72, VIII/);
      expect(r.body.erros).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'RL-CD-AUTORIZACAO', fundamento: 'art. 72, VIII' })]));
      const v = (await http()
        .post('/api/fluxo-fase-interna/modelos/DISPENSA/validar')
        .set(bearer(adminA.token))
        .send({ etapas: [{ codigo: 'AUTORIZACAO', depende_de: ['DFD'] }] })
        .expect(201)).body;
      expect(v.validacao.ok).toBe(false);
      expect(v.validacao.erros.map((e: any) => e.codigo)).toEqual(expect.arrayContaining(['RL-CD-AUT-PESQ', 'RL-CD-AUT-RES']));
      expect((await modelo(adminA.token).expect(200)).body.proprio).toBe(false);
    });

    it('gravar: o órgão ganha o modelo próprio (versão 1, 2…); outro órgão não vê nem muda', async () => {
      const r1 = (await salvar(adminA.token, { etapas: [{ codigo: 'RESERVA', prazo_dias_uteis: 7 }] }).expect(200)).body;
      expect(r1).toMatchObject({ proprio: true, modelo: { versao: 1 } });
      expect(etapaDoModelo(r1, 'RESERVA').prazo_dias_uteis).toBe(7);
      const r2 = (await salvar(A.token, { etapas: [{ codigo: 'RESERVA', prazo_dias_uteis: 8 }] }).expect(200)).body;
      expect(r2.modelo.versao).toBe(2);
      const deB = (await modelo(adminB.token).expect(200)).body;
      expect(deB.proprio).toBe(false);
      expect(etapaDoModelo(deB, 'RESERVA').prazo_dias_uteis).toBe(3);
      await salvar(adminB.token, { etapas: [{ codigo: 'RESERVA', prazo_dias_uteis: 10 }] }).expect(200);
      expect(etapaDoModelo((await modelo(adminA.token).expect(200)).body, 'RESERVA').prazo_dias_uteis).toBe(8);
    });

    it('segregação de funções: aviso (art. 7º, §1º), sem impedir a gravação', async () => {
      await http().put(`/api/fase-interna/configuracao/usuarios/${apoioA.id}`).set(bearer(A.token)).send({ papeis: ['COMPRAS', 'AUTORIDADE'] }).expect(200);
      const r = (await salvar(A.token, { etapas: [{ codigo: 'PESQUISA', responsavel: { papel: 'COMPRAS' } }] }).expect(200)).body;
      expect(r.validacao.avisos).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'RL-SEG-PESQ-AUT', fundamento: 'art. 7º, §1º', mensagem: expect.stringMatching(/Apoio A/) })]));
    });

    it('PUT antigo da configuração grava no modelo (prazo e controle interno); restaurar volta ao padrão', async () => {
      await http().put('/api/fase-interna/configuracao').set(bearer(A.token)).send({ prazos: { PESQUISA: 20 }, controle_interno_ativo: true }).expect(200);
      const m = (await modelo(A.token).expect(200)).body;
      expect(etapaDoModelo(m, 'PESQUISA').prazo_dias_uteis).toBe(20);
      expect(etapaDoModelo(m, 'CONTROLE_INTERNO').ligada).toBe(true);
      const cfg = (await http().get('/api/fase-interna/configuracao').set(bearer(A.token)).expect(200)).body;
      expect(cfg).toMatchObject({ controle_interno_ativo: true, prazos: { PESQUISA: 20 } });
      const rest = (await http().post('/api/fluxo-fase-interna/modelos/DISPENSA/restaurar').set(bearer(A.token)).expect(201)).body;
      expect(etapaDoModelo(rest, 'PESQUISA').prazo_dias_uteis).toBe(30);
      expect(etapaDoModelo(rest, 'CONTROLE_INTERNO').ligada).toBe(false);
      expect((await http().post('/api/fluxo-fase-interna/modelos/DISPENSA/restaurar').set(bearer(agenteA.token))).status).toBe(403);
      // a config antiga liga o controle interno em todos os tipos: desliga de volta
      await http().put('/api/fase-interna/configuracao').set(bearer(A.token)).send({ controle_interno_ativo: false }).expect(200);
    });

    it('modelo do sistema, requisitos da lei e travas por ato: só o administrador da plataforma altera', async () => {
      expect((await http().get('/api/fluxo-fase-interna/modelos').set(bearer(ctx.tokenAdmin()))).status).toBe(400);
      expect((await http().get(`/api/fluxo-fase-interna/modelos?orgao_id=${A.id}`).set(bearer(ctx.tokenAdmin()))).status).toBe(200);
      expect((await salvar(A.token, { nome: 'x' }, 'DISPENSA', '?sistema=true')).status).toBe(403);
      const req = (await http().get('/api/fluxo-fase-interna/requisitos').set(bearer(agenteA.token)).expect(200)).body;
      expect(req.find((r: any) => r.codigo === 'RL-CD-AUTORIZACAO')).toMatchObject({ fundamento: 'art. 72, VIII', ativo: true });
      expect((await http().put('/api/fluxo-fase-interna/requisitos/RL-CD-AUTORIZACAO').set(bearer(A.token)).send({ ativo: false })).status).toBe(403);
      expect((await http().put('/api/fluxo-fase-interna/requisitos/RL-CD-AUTORIZACAO').set(bearer(adminA.token)).send({ ativo: false })).status).toBe(403);
      await http().put('/api/fluxo-fase-interna/requisitos/RL-CD-AUTORIZACAO').set(bearer(ctx.tokenAdmin())).send({ mensagem: 'Falta a autorização da autoridade competente' }).expect(200);
      const travas = (await http().get('/api/fluxo-fase-interna/travas').set(bearer(agenteA.token)).expect(200)).body;
      expect(travas.map((t: any) => t.ato)).toEqual(['CONCLUIR_PESQUISA', 'AUTORIZAR', 'PUBLICAR']);
      expect(travas[1].regras.map((r: any) => r.regra)).toEqual(['LIM-01', 'LIM-02', 'A72-I', 'A72-II', 'A72-IV']);
      expect((await http().put('/api/fluxo-fase-interna/travas/AUTORIZAR/A72-I').set(bearer(A.token)).send({ ativa: false })).status).toBe(403);
      await http().put('/api/fluxo-fase-interna/travas/AUTORIZAR/A72-I').set(bearer(ctx.tokenAdmin())).send({ severidade: 'BLOQUEIO' }).expect(200);
      const sis = (await modelo(ctx.tokenAdmin(), 'DISPENSA', '?sistema=true').expect(200)).body;
      expect(sis).toMatchObject({ sistema: true, proprio: false });
    });
  });

  // ==========================================================================
  describe('B. aprovação da demanda (pessoa designada)', () => {
    let C: OrgaoFixture;
    let requisitante: UsuarioOrgaoFixture;
    let aprovador: UsuarioOrgaoFixture;
    let outro: UsuarioOrgaoFixture;
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      C = await criarOrgao(ctx, { nome: 'Câmara F1 C (por setor)' });
      requisitante = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Rita Requisitante' });
      aprovador = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paula Presidente' });
      outro = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Outro C' });
      await sql(`UPDATE usuarios SET pode_aprovar_demandas = true WHERE id = $1`, [aprovador.id]);
      await http().put(`/api/fase-interna/configuracao/usuarios/${requisitante.id}`).set(bearer(C.token)).send({ papeis: ['REQUISITANTE'] }).expect(200);
      await http().put('/api/fase-interna/configuracao').set(bearer(C.token)).send({ modo: 'POR_SETOR' }).expect(200);
      lic = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    });

    it('DFD feita no sistema por quem não aprova: a etapa aguarda a aprovação e as demais não abrem', async () => {
      await http().post(`/api/fase-interna/${lic.id}/documento`).set(bearer(requisitante.token)).send({ tipo: 'DFD', titulo: 'DFD', descricao: 'Demanda de teste F1' }).expect(201);
      const et = await etapas(lic, C.token);
      expect(et.aprovacao_demanda).toMatchObject({ exigida: true, aprovada: false, pode_aprovar: true });
      expect(passo(et, 'DFD')).toMatchObject({ situacao: 'EM_ANDAMENTO', aguardando_aprovacao: true });
      expect(passo(et, 'ETP').situacao).toBe('AGUARDANDO');
      expect(et.modelo).toMatchObject({ nome: 'Câmara — Portaria 089', tipo_processo: 'DISPENSA', legado: false });
      expect((await abertas(lic)).map((t: any) => t.passo)).toEqual(['DFD']);
      expect((await etapas(lic, requisitante.token)).aprovacao_demanda.pode_aprovar).toBe(false);
    });

    it('só quem foi designado aprova: requisitante 403, outro 403, outro órgão 403, fornecedor 403, anônimo 401', async () => {
      const aprovar = (token: string | null) => {
        const r = http().post(`/api/fase-interna/${lic.id}/demanda/aprovar`);
        return (token ? r.set(bearer(token)) : r).send({ observacao: 'ok' });
      };
      expect((await aprovar(requisitante.token)).status).toBe(403);
      expect((await aprovar(outro.token)).status).toBe(403);
      expect((await aprovar(B.token)).status).toBe(403);
      expect((await aprovar(F.token)).status).toBe(403);
      expect((await aprovar(null)).status).toBe(401);
      const r = await aprovar(aprovador.token);
      expect(r.status).toBe(201);
      expect(r.body.aprovacao_demanda).toMatchObject({ aprovada: true, registro: { origem: 'MANUAL', por_nome: 'Paula Presidente' } });
      expect(passo(r.body, 'DFD').situacao).toBe('CONCLUIDO');
      expect((await abertas(lic)).map((t: any) => t.passo).sort()).toEqual(['ETP', 'PESQUISA', 'TR']);
      expect((await aprovar(aprovador.token)).status).toBe(409);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'DEMANDA_APROVADA'`, [lic.id]);
      expect(log.descricao).toMatch(/Paula Presidente/);
    });

    it('processo que nasceu de demanda APROVADA no módulo de demandas: conta como aprovada', async () => {
      const outroLic = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const [dem] = await sql(`INSERT INTO demandas (orgao_id, ano_referencia, unidade_requisitante, status) VALUES ($1, 2026, 'Secretaria', 'APROVADA') RETURNING id`, [C.id]);
      await sql(`UPDATE licitacoes SET demanda_id = $2 WHERE id = $1`, [outroLic.id, dem.id]);
      await http().post(`/api/fase-interna/${outroLic.id}/documento`).set(bearer(requisitante.token)).send({ tipo: 'DFD', titulo: 'DFD', descricao: 'Demanda do PCA' }).expect(201);
      const et = await etapas(outroLic, C.token);
      expect(et.aprovacao_demanda).toMatchObject({ aprovada: true, registro: { origem: 'DEMANDA' } });
      expect(passo(et, 'ETP').situacao).toBe('DISPONIVEL');
    });

    it('DFD juntada feita fora: a aprovação consta da peça (sem clique)', async () => {
      const l = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await anexar(l, 'DFD', requisitante.token)).status).toBe(201);
      const et = await etapas(l, C.token);
      expect(et.aprovacao_demanda.registro).toMatchObject({ origem: 'PECA_EXTERNA' });
      expect(passo(et, 'DFD').situacao).toBe('CONCLUIDO');
    });
  });

  // ==========================================================================
  describe('C. voltar (reabrir) e avançar etapas', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agenteA.id } });
      for (const t of ['DFD', 'PP', 'DO']) expect((await anexar(lic, t, agenteA.token)).status).toBe(201);
    });

    const reabrir = (token: string | null, codigo: string, motivo?: string) => {
      const r = http().post(`/api/fase-interna/${lic.id}/etapas/${codigo}/reabrir`);
      return (token ? r.set(bearer(token)) : r).send(motivo === undefined ? {} : { motivo });
    };

    it('permissão e validação: sem motivo 400; quem não conduz 403; outro órgão 403; fornecedor 403; anônimo 401; etapa não concluída 409; desconhecida 404', async () => {
      const et = await etapas(lic, agenteA.token);
      expect(passo(et, 'PESQUISA').situacao).toBe('CONCLUIDO');
      expect(passo(et, 'RESERVA').situacao).toBe('CONCLUIDO');
      expect(et.permissoes).toMatchObject({ reabrir: true });
      expect((await etapas(lic, apoioA.token)).permissoes.reabrir).toBe(false);
      expect((await reabrir(agenteA.token, 'PESQUISA')).status).toBe(400);
      expect((await reabrir(apoioA.token, 'PESQUISA', 'Cotação vencida — refazer')).status).toBe(403);
      expect((await reabrir(adminB.token, 'PESQUISA', 'Cotação vencida — refazer')).status).toBe(403);
      expect((await reabrir(F.token, 'PESQUISA', 'Cotação vencida — refazer')).status).toBe(403);
      expect((await reabrir(null, 'PESQUISA', 'Cotação vencida — refazer')).status).toBe(401);
      expect((await reabrir(agenteA.token, 'ETP', 'Rever o estudo técnico')).status).toBe(409);
      expect((await reabrir(agenteA.token, 'NAO_EXISTE', 'Rever a etapa inexistente')).status).toBe(404);
    });

    it('reabrir a pesquisa: ela volta a andamento, a reserva (dependente concluída) fica "a revisar", nada é apagado e a conformidade trava a publicação', async () => {
      const r = await reabrir(agenteA.token, 'PESQUISA', 'Cotação vencida — refazer a pesquisa');
      expect(r.status).toBe(201);
      expect(passo(r.body, 'PESQUISA')).toMatchObject({ situacao: 'EM_ANDAMENTO', reaberta: { motivo: 'Cotação vencida — refazer a pesquisa', por_nome: 'Agente A' } });
      expect(passo(r.body, 'RESERVA')).toMatchObject({ situacao: 'A_REVISAR', pode_iniciar: false });
      const [pp] = await sql(`SELECT COUNT(*)::int AS n FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'PP' AND versao_atual = true`, [lic.id]);
      expect(pp.n).toBe(1);
      const ab = await abertas(lic);
      expect(ab.find((t: any) => t.passo === 'PESQUISA')).toMatchObject({ titulo: expect.stringMatching(/^Refazer \(etapa reaberta\)/) });
      expect(ab.some((t: any) => t.passo === 'RESERVA')).toBe(false); // revisão da reserva espera a pesquisa voltar a concluir
      const resumo = (await http().get(`/api/fase-interna/${lic.id}/conformidade/resumo`).set(bearer(agenteA.token)).expect(200)).body;
      expect(resumo.achados.some((a: any) => a.regra === 'FLUXO-01')).toBe(true);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'ETAPA_REABERTA'`, [lic.id]);
      expect(log.descricao).toMatch(/Cotação vencida/);
    });

    it('a pesquisa refeita (peça nova) encerra a reabertura sozinha; a reserva ganha a tarefa de revisão e é confirmada pelo "avançar"', async () => {
      expect((await anexar(lic, 'PP', agenteA.token)).status).toBe(201);
      const et = await etapas(lic, agenteA.token);
      expect(passo(et, 'PESQUISA').situacao).toBe('CONCLUIDO');
      expect(passo(et, 'RESERVA').situacao).toBe('A_REVISAR');
      expect((await abertas(lic)).find((t: any) => t.passo === 'RESERVA')).toMatchObject({ titulo: expect.stringMatching(/^Revisar:/) });
      const concluir = (token: string, codigo: string, texto?: string) =>
        http().post(`/api/fase-interna/${lic.id}/etapas/${codigo}/concluir`).set(bearer(token)).send(texto ? { texto } : {});
      expect((await concluir(agenteA.token, 'RESERVA')).status).toBe(400);
      expect((await concluir(apoioA.token, 'RESERVA', 'Dotação continua suficiente.')).status).toBe(403);
      const r = await concluir(agenteA.token, 'RESERVA', 'Dotação continua suficiente para o novo valor.');
      expect(r.status).toBe(201);
      expect(passo(r.body, 'RESERVA').situacao).toBe('CONCLUIDO');
      expect((await abertas(lic)).some((t: any) => t.passo === 'RESERVA')).toBe(false);
      expect((await concluir(agenteA.token, 'RESERVA', 'De novo, sem nada a revisar.')).status).toBe(409);
      const resumo = (await http().get(`/api/fase-interna/${lic.id}/conformidade/resumo`).set(bearer(agenteA.token)).expect(200)).body;
      expect(resumo.achados.some((a: any) => a.regra === 'FLUXO-01')).toBe(false);
    });
  });

  // ==========================================================================
  describe('D. etapa opcional de registro e o caminho do processo (snapshot)', () => {
    let D: OrgaoFixture;
    let antigo: LicitacaoFixture;

    beforeAll(async () => {
      D = await criarOrgao(ctx, { nome: 'Câmara F1 D' });
      antigo = await criarLicitacao(ctx, D, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await anexar(antigo, 'DFD', D.token)).status).toBe(201);
      expect((await naoSeAplica(antigo, 'ETP', D.token)).status).toBe(201); // o estudo já começou
      await salvar(D.token, {
        etapas: [
          { codigo: 'AUTORIZACAO_INICIO', ligada: true },
          { codigo: 'TR', depende_de: ['DFD', 'AUTORIZACAO_INICIO', 'ETP'] },
        ],
      }).expect(200);
    });

    it('processo em andamento não muda: nem a etapa ligada depois (o estudo já tinha começado) nem as dependências novas', async () => {
      const et = await etapas(antigo, D.token);
      expect(passo(et, 'AUTORIZACAO_INICIO')).toBeUndefined();
      expect(passo(et, 'TR').depende_de).toEqual(['DFD']);
      expect(et.modelo.versao).toBe(1);
    });

    it('processo novo segue o modelo novo: a autorização de início trava estudo, TR e pesquisa até o despacho registrado', async () => {
      const novo = await criarLicitacao(ctx, D, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await anexar(novo, 'DFD', D.token)).status).toBe(201);
      let et = await etapas(novo, D.token);
      expect(et.modelo.versao).toBe(1); // primeira versão do modelo PRÓPRIO do órgão
      expect(passo(et, 'AUTORIZACAO_INICIO')).toMatchObject({ situacao: 'DISPONIVEL', conclusao: 'REGISTRO', opcional: true });
      expect(passo(et, 'ETP')).toMatchObject({ situacao: 'AGUARDANDO', pendencias: ['AUTORIZACAO_INICIO'] });
      expect(passo(et, 'TR').depende_de).toEqual(['DFD', 'AUTORIZACAO_INICIO', 'ETP']);
      expect((await abertas(novo)).map((t: any) => t.passo)).toEqual(['AUTORIZACAO_INICIO']);
      const r = await http().post(`/api/fase-interna/${novo.id}/etapas/AUTORIZACAO_INICIO/concluir`).set(bearer(D.token)).send({ texto: 'Autorizo o início do processo de contratação.' });
      expect(r.status).toBe(201);
      et = r.body;
      expect(passo(et, 'AUTORIZACAO_INICIO')).toMatchObject({ situacao: 'CONCLUIDO', registro: { texto: 'Autorizo o início do processo de contratação.' } });
      expect(passo(et, 'ETP').situacao).toBe('DISPONIVEL');
      expect(passo(et, 'PESQUISA').situacao).toBe('DISPONIVEL');
      expect(et.desenho[1].etapas).toEqual(['AUTORIZACAO_INICIO']);
    });
  });

  // ==========================================================================
  describe('E. parecer jurídico dispensado por ato (art. 53, §5º)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agenteA.id } });
    });

    const dispensar = (token: string | null, corpo: any) => {
      const r = http().post(`/api/fase-interna/${lic.id}/parecer/dispensar`);
      return (token ? r.set(bearer(token)) : r).send(corpo);
    };

    it('validação e permissão: sem número 400; data futura 400; quem não conduz 403; outro órgão 403; fornecedor 403; anônimo 401', async () => {
      expect((await dispensar(agenteA.token, { data_ato: hoje() })).status).toBe(400);
      expect((await dispensar(agenteA.token, { numero_ato: '12/2025', data_ato: amanha() })).status).toBe(400);
      expect((await dispensar(apoioA.token, { numero_ato: '12/2025', data_ato: hoje() })).status).toBe(403);
      expect((await dispensar(adminB.token, { numero_ato: '12/2025', data_ato: hoje() })).status).toBe(403);
      expect((await dispensar(F.token, { numero_ato: '12/2025', data_ato: hoje() })).status).toBe(403);
      expect((await dispensar(null, { numero_ato: '12/2025', data_ato: hoje() })).status).toBe(401);
    });

    it('com o ato: o parecer fica "não se aplica" com a justificativa citando o ato (termo nos autos) e a etapa conclui', async () => {
      const r = await dispensar(agenteA.token, { numero_ato: 'Portaria PGM 12/2025', data_ato: '2025-03-10', hipotese: 'dispensa de pequeno valor com minuta padronizada' });
      expect(r.status).toBe(201);
      expect(r.body.parecer.dispensa).toMatchObject({ numero_ato: 'Portaria PGM 12/2025', data_ato: '2025-03-10', fundamento: 'art. 53, §5º' });
      const inst = (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(agenteA.token)).expect(200)).body;
      const pj = inst.itens.find((i: any) => i.tipo === 'PJ');
      expect(pj.status).toBe('NAO_SE_APLICA');
      expect(pj.justificativa).toMatch(/art\. 53, §5º.*Portaria PGM 12\/2025, de 10\/03\/2025/);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'PARECER_DISPENSADO'`, [lic.id]);
      expect(log.descricao).toMatch(/Portaria PGM 12\/2025/);
    });

    it('modelo do órgão que não permite: 409', async () => {
      const E = await criarOrgao(ctx, { nome: 'Prefeitura F1 E' });
      await salvar(E.token, { etapas: [{ codigo: 'PARECER', dispensavel_por_ato: false }] }).expect(200);
      const l = await criarLicitacao(ctx, E, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const r = await http().post(`/api/fase-interna/${l.id}/parecer/dispensar`).set(bearer(E.token)).send({ numero_ato: '1/2025', data_ato: hoje() });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/art\. 53, §5º/);
    });
  });

  // ==========================================================================
  describe('F. migração: processos existentes não mudam nem travam', () => {
    it('processo anterior ao modelo de fluxo = LEGADO: a demanda conta como aprovada', async () => {
      const G = await criarOrgao(ctx, { nome: 'Câmara F1 G (legado)' });
      const req = await criarUsuarioOrgao(ctx, G, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Req G' });
      await http().put('/api/fase-interna/configuracao').set(bearer(G.token)).send({ modo: 'POR_SETOR' }).expect(200);
      const lic = await criarLicitacao(ctx, G, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await tarefas().aguardarPendentes();
      // "de antes da F1": sem fluxo gravado e criado antes do marco (a semente do modelo do sistema)
      await sql(`DELETE FROM fluxos_processo_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      await sql(`UPDATE licitacoes SET created_at = now() - interval '400 days' WHERE id = $1`, [lic.id]);
      const r1 = await ctx.app.get(ModeloFluxoService).migrar();
      expect(r1.processos).toBeGreaterThanOrEqual(1);
      const [f] = await sql(`SELECT legado, demanda_aprovada, aprovacao_demanda FROM fluxos_processo_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      expect(f).toMatchObject({ legado: true, demanda_aprovada: true, aprovacao_demanda: { origem: 'LEGADO' } });
      // DFD feita por quem não aprova: no legado, segue como antes (não trava)
      await http().post(`/api/fase-interna/${lic.id}/documento`).set(bearer(req.token)).send({ tipo: 'DFD', titulo: 'DFD', descricao: 'Demanda antiga' }).expect(201);
      const et = await etapas(lic, G.token);
      expect(et.modelo.legado).toBe(true);
      expect(passo(et, 'DFD').situacao).toBe('CONCLUIDO');
      expect((await abertas(lic)).map((t: any) => t.passo).sort()).toEqual(['ETP', 'PESQUISA', 'TR']);
      // idempotente
      const r2 = await ctx.app.get(ModeloFluxoService).migrar();
      expect(r2.processos).toBe(0);
    });

    it('órgão que já tinha configuração ganha modelo próprio equivalente (prazos, responsáveis, controle interno)', async () => {
      const H = await criarOrgao(ctx, { nome: 'Câmara F1 H (configurada)' });
      await sql(
        `INSERT INTO configuracoes_fase_interna (orgao_id, modo, controle_interno_ativo, responsaveis, prazos) VALUES ($1, 'POR_SETOR', true, $2::jsonb, $3::jsonb)`,
        [H.id, JSON.stringify({ RESERVA: { papel: 'AGENTE_CONTRATACAO', setor_id: null } }), JSON.stringify({ PESQUISA: 12, RESERVA: null })],
      );
      const r = await ctx.app.get(ModeloFluxoService).migrar();
      expect(r.orgaos).toBeGreaterThanOrEqual(1);
      const m = (await modelo(H.token).expect(200)).body;
      expect(m.proprio).toBe(true);
      expect(etapaDoModelo(m, 'PESQUISA').prazo_dias_uteis).toBe(12);
      expect(etapaDoModelo(m, 'RESERVA')).toMatchObject({ prazo_dias_uteis: null, responsavel: { papel: 'AGENTE_CONTRATACAO' } });
      expect(etapaDoModelo(m, 'CONTROLE_INTERNO').ligada).toBe(true);
      expect(etapaDoModelo((await modelo(H.token, 'LICITACAO').expect(200)).body, 'PESQUISA').prazo_dias_uteis).toBe(12);
      const r2 = await ctx.app.get(ModeloFluxoService).migrar();
      expect(r2.orgaos).toBe(0);
    });
  });
});
