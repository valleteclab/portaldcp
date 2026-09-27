/**
 * FLUXO DE APROVAÇÃO DAS PEÇAS NAS TELAS DAS ETAPAS
 * (Configurações › Fluxos de aprovação + "aprovação interna" do modelo de fluxo).
 *
 *  A. Modelos prontos (dados semeados no boot): leitura pelo órgão, edição só
 *     pelo admin da plataforma, semente não sobrescreve o editado.
 *  B. "Usar este modelo": sem escolher setor/pessoa → 400; escolhido → fluxo do
 *     órgão; só o administrador do órgão grava; conflito de tipo → 409.
 *  C. Etapa TR com aprovação interna: emitir o TR → vai sozinho para o fluxo →
 *     aparece na Central do chefe (só dele) → quem não é o aprovador 403 →
 *     reprovar exige motivo e volta a peça com o motivo → nova versão volta ao
 *     fluxo → aprovar → etapa conclui. Avisos (sino/e-mail/WhatsApp).
 *  D. Duas etapas, a 2ª com assinatura: aprovar a 2ª ASSINA a peça.
 *  E. Sem aprovação interna nada muda; aprovação interna ligada sem fluxo =
 *     aprovação única por quem conduz o processo (com o aviso).
 *  F. Isolamento: outro órgão 404/403/sem nada na caixa, fornecedor 403,
 *     anônimo 401; setor de outro órgão recusado.
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
import { AprovacaoPecasService } from '../src/fase-interna/aprovacao-pecas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe('Fluxo de aprovação das peças nas telas das etapas', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let adminA: UsuarioOrgaoFixture;
  let agente: UsuarioOrgaoFixture;
  let chefe: UsuarioOrgaoFixture;
  let diretor: UsuarioOrgaoFixture;
  let apoio: UsuarioOrgaoFixture;
  let setorReq: string;
  let setorB: string;
  let lic: LicitacaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);

  const instrucao = async (l: { id: string }, tipo: string, token = A.token) => {
    await tarefas().aguardarPendentes();
    const r = (await http().get(`/api/fase-interna/${l.id}/instrucao`).set(bearer(token)).expect(200)).body;
    return r.itens.find((i: any) => i.tipo === tipo);
  };
  const passo = async (l: { id: string }, codigo: string) => {
    const et = (await http().get(`/api/fase-interna/${l.id}/etapas`).set(bearer(A.token)).expect(200)).body;
    return et.etapas.flatMap((e: any) => e.passos).find((p: any) => p.passo === codigo);
  };
  const caixa = async (token: string) => (await http().get('/api/fase-interna/aprovacoes/caixa').set(bearer(token)).expect(200)).body as any[];
  const emitir = (l: { id: string }, tipo: string, texto: string, token = agente.token) =>
    http().post(`/api/fase-interna/${l.id}/documento`).set(bearer(token)).send({ tipo, titulo: tipo, descricao: texto });
  const decidir = (etapaId: string, acao: 'aprovar' | 'reprovar', token: string | null, corpo: any = {}) => {
    const r = http().put(`/api/fase-interna/aprovacoes/etapa/${etapaId}/${acao}`);
    return (token ? r.set(bearer(token)) : r).send(corpo);
  };
  const ligarAprovacaoInterna = (codigo: string, ligada = true, tipo = 'DISPENSA') =>
    http().put(`/api/fluxo-fase-interna/modelos/${tipo}`).set(bearer(adminA.token)).send({ etapas: [{ codigo, aprovacao_interna: ligada }] }).expect(200);
  const modeloPronto = async (codigo: string) =>
    ((await http().get('/api/fase-interna/fluxos-aprovacao/modelos-prontos').set(bearer(A.token)).expect(200)).body as any[]).find((m) => m.codigo === codigo);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Aprovações A' });
    B = await criarOrgao(ctx, { nome: 'Câmara Aprovações B' });
    F = await criarFornecedor(ctx);
    adminA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Adm A' });
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
    chefe = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Carlos Chefe' });
    diretor = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Dora Diretora' });
    apoio = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paulo Apoio' });
    [{ id: setorReq }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'REQ', 'Setor Requisitante') RETURNING id::text AS id`, [A.id]);
    [{ id: setorB }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'RB', 'Setor de B') RETURNING id::text AS id`, [B.id]);
    await sql(`UPDATE usuarios SET setor_id = $2 WHERE id = $1`, [chefe.id, setorReq]);
    await sql(`UPDATE usuarios SET cargo = 'Diretora Administrativa' WHERE id = $1`, [diretor.id]);
    lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. modelos prontos (catálogo em dados)', () => {
    it('o órgão vê os 4 modelos da Câmara, com descrição de uma linha, tipos reais e o rascunho sem setor/pessoa', async () => {
      const lista = (await http().get('/api/fase-interna/fluxos-aprovacao/modelos-prontos').set(bearer(apoio.token)).expect(200)).body;
      expect(lista.map((m: any) => m.nome)).toEqual(['TR conferido pelo chefe', 'Pesquisa conferida', 'Minutas revisadas', 'DFD assinado pela Diretoria']);
      const pesquisa = lista.find((m: any) => m.codigo === 'PESQUISA_CONFERIDA');
      expect(pesquisa.tipos_documento).toEqual(['PP', 'MCP']);
      expect(pesquisa.descricao).toMatch(/chefe de Compras/);
      expect(pesquisa.rascunho.etapas.map((e: any) => [e.nome, e.sugestao_responsavel, e.setor_id, e.usuario_id])).toEqual([
        ['Conferência do chefe de Compras', 'Chefe do setor de Compras', null, null],
        ['Aprovação do Diretor Administrativo', 'Diretor(a) Administrativo(a)', null, null],
      ]);
      expect(lista.find((m: any) => m.codigo === 'MINUTAS_REVISADAS').tipos_documento).toEqual(['ME', 'MC', 'RAG']);
    });

    it('só o admin da plataforma altera: login do órgão e ADMIN do órgão 403; a semente não sobrescreve o editado', async () => {
      const tr = await modeloPronto('TR_CONFERIDO_PELO_CHEFE');
      const url = `/api/fase-interna/fluxos-aprovacao/modelos-prontos/${tr.id}`;
      expect((await http().put(url).set(bearer(A.token)).send({ descricao: 'x' })).status).toBe(403);
      expect((await http().put(url).set(bearer(adminA.token)).send({ descricao: 'x' })).status).toBe(403);
      expect((await http().post('/api/fase-interna/fluxos-aprovacao/modelos-prontos').set(bearer(adminA.token)).send({ codigo: 'X' })).status).toBe(403);
      const nova = 'O chefe do setor requisitante confere o TR antes de ele valer.';
      const r = (await http().put(url).set(bearer(ctx.tokenAdmin())).send({ descricao: nova }).expect(200)).body;
      expect(r).toMatchObject({ descricao: nova, editado: true });
      await ctx.app.get(AprovacaoPecasService).garantirSemente();
      expect((await modeloPronto('TR_CONFERIDO_PELO_CHEFE')).descricao).toBe(nova);
    });
  });

  // ==========================================================================
  describe('B. "Usar este modelo" → fluxo do órgão', () => {
    it('sem escolher o setor/pessoa de cada etapa: 400 com a sugestão do modelo', async () => {
      const tr = await modeloPronto('TR_CONFERIDO_PELO_CHEFE');
      const r = await http().post('/api/fase-interna/fluxos-aprovacao').set(bearer(A.token)).send(tr.rascunho);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Etapa 1 .*escolha o setor ou a pessoa \(sugestão do modelo: Chefe do setor requisitante\)/);
    });

    it('só o administrador do órgão grava (agente 403); escolhido o setor → fluxo do TR; outro fluxo do TR → 409', async () => {
      const tr = await modeloPronto('TR_CONFERIDO_PELO_CHEFE');
      const corpo = { ...tr.rascunho, etapas: tr.rascunho.etapas.map((e: any) => ({ ...e, setor_id: setorReq })) };
      expect((await http().post('/api/fase-interna/fluxos-aprovacao').set(bearer(agente.token)).send(corpo)).status).toBe(403);
      const f = (await http().post('/api/fase-interna/fluxos-aprovacao').set(bearer(adminA.token)).send(corpo).expect(201)).body;
      expect(f).toMatchObject({ orgao_id: A.id, nome: 'TR conferido pelo chefe', tipos: ['TR'], generico: false, modelo_origem: 'TR_CONFERIDO_PELO_CHEFE' });
      expect(f.etapas[0]).toMatchObject({ setor_id: setorReq, setor_nome: 'Setor Requisitante', exige_assinatura: false });
      const dup = await http().post('/api/fase-interna/fluxos-aprovacao').set(bearer(A.token)).send({ nome: 'Outro TR', tipo_documento: 'TR', etapas: [{ nome: 'X' }] });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toMatch(/TR conferido pelo chefe/);
    });

    it('assinatura só na última etapa; setor de outro órgão é recusado', async () => {
      const r1 = await http()
        .post('/api/fase-interna/fluxos-aprovacao')
        .set(bearer(A.token))
        .send({ nome: 'ETP', tipo_documento: 'ETP', etapas: [{ nome: 'Assina', exige_assinatura: true, usuario_id: diretor.id }, { nome: 'Confere', setor_id: setorReq }] });
      expect(r1.status).toBe(400);
      expect(r1.body.message).toMatch(/só a última etapa pode exigir assinatura/);
      const r2 = await http().post('/api/fase-interna/fluxos-aprovacao').set(bearer(A.token)).send({ nome: 'ETP', tipo_documento: 'ETP', etapas: [{ nome: 'Confere', setor_id: setorB }] });
      expect(r2.status).toBe(400);
      expect(r2.body.message).toMatch(/setor escolhido não é deste órgão/);
    });
  });

  // ==========================================================================
  describe('C. etapa TR com aprovação interna: emitir → Central do chefe → reprovar → corrigir → aprovar', () => {
    let etapaId: string;
    let trId: string;

    it('cobertura: sem aprovação interna ligada, a tela avisa que o fluxo não vale para nada; ligada, mostra a etapa, a peça e o fluxo', async () => {
      const antes = (await http().get('/api/fase-interna/fluxos-aprovacao/cobertura').set(bearer(A.token)).expect(200)).body;
      expect(antes.alguma_ligada).toBe(false);
      await ligarAprovacaoInterna('TR');
      const depois = (await http().get('/api/fase-interna/fluxos-aprovacao/cobertura').set(bearer(apoio.token)).expect(200)).body;
      expect(depois.alguma_ligada).toBe(true);
      const dispensa = depois.tipos.find((t: any) => t.tipo === 'DISPENSA');
      expect(dispensa.etapas).toEqual([
        expect.objectContaining({ codigo: 'TR', pecas: expect.arrayContaining([expect.objectContaining({ tipo: 'TR', fluxo: expect.objectContaining({ nome: 'TR conferido pelo chefe', generico: false }) })]) }),
      ]);
      expect(depois.tipos.find((t: any) => t.tipo === 'LICITACAO').etapas).toEqual([]);
    });

    it('emitir o TR: vai sozinho para o fluxo; a etapa mostra "Aguardando aprovação: … (1 de 1)" e não conclui', async () => {
      const r = (await emitir(lic, 'TR', 'Termo de referência — versão 1').expect(201)).body;
      trId = r.id;
      await tarefas().aguardarPendentes();
      expect(r.status).toBe('AGUARDANDO_APROVACAO');
      expect((await sql(`SELECT status::text AS status FROM documentos_fase_interna WHERE id = $1`, [trId]))[0].status).toBe('AGUARDANDO_APROVACAO');
      const linha = await instrucao(lic, 'TR');
      expect(linha).toMatchObject({ status: 'EM_APROVACAO', aprovacao_interna: true, exige_aprovacao: true, sem_fluxo_aprovacao: false, fluxo_aprovacao: { nome: 'TR conferido pelo chefe' } });
      expect(linha.aprovacao.rotulo).toBe('Aguardando aprovação: Conferência do chefe do setor requisitante — setor Setor Requisitante (1 de 1)');
      expect((await passo(lic, 'TR')).situacao).toBe('EM_ANDAMENTO');
      const [e] = await sql(`SELECT * FROM aprovacoes_documento WHERE documento_id = $1`, [trId]);
      expect(e).toMatchObject({ status: 'EM_ANALISE', automatica: true, rodada: 1, submetido_por_nome: 'Ana Agente', setor_id: setorReq });
      etapaId = e.id;
    });

    it('a Central mostra só a quem aprova (chefe do setor); aviso por sino/e-mail/WhatsApp com o link da Central', async () => {
      const doChefe = await caixa(chefe.token);
      expect(doChefe.map((x) => x.id)).toContain(etapaId);
      const item = doChefe.find((x) => x.id === etapaId);
      expect(item).toMatchObject({ licitacao_id: lic.id, ordem: 1, total: 1, documento: { tipo: 'TR', status: 'AGUARDANDO_APROVACAO' }, processo: { numero_processo: lic.numero_processo } });
      for (const t of [agente.token, apoio.token, diretor.token, adminA.token, A.token]) {
        expect((await caixa(t)).map((x) => x.id)).not.toContain(etapaId);
      }
      const [n] = await sql(`SELECT * FROM notificacoes WHERE usuario_id = $1 AND entidade_id = $2`, [chefe.id, trId]);
      expect(n).toMatchObject({ link: '/orgao/aprovacoes?tab=documentos', usuario_email: chefe.email });
      expect(n.metadata.whatsapp_url).toMatch(/\/orgao\/aprovacoes\?tab=documentos$/);
    });

    it('quem não é o aprovador: 403 (agente, admin do órgão, login do órgão); fornecedor 403; anônimo 401', async () => {
      for (const t of [agente.token, adminA.token, A.token, apoio.token]) {
        const r = await decidir(etapaId, 'aprovar', t);
        expect(r.status).toBe(403);
      }
      expect((await decidir(etapaId, 'aprovar', agente.token)).body.message).toMatch(/não é sua/);
      expect((await decidir(etapaId, 'aprovar', F.token)).status).toBe(403);
      expect((await decidir(etapaId, 'aprovar', null)).status).toBe(401);
    });

    it('reprovar: motivo obrigatório; a peça volta para elaboração com o motivo e quem fez é avisado', async () => {
      expect((await decidir(etapaId, 'reprovar', chefe.token, { justificativa: '  ' })).status).toBe(400);
      await decidir(etapaId, 'reprovar', chefe.token, { justificativa: 'Faltou o prazo de entrega.' }).expect(200);
      const linha = await instrucao(lic, 'TR');
      expect(linha.status).toBe('EM_ELABORACAO');
      expect(linha.reprovacao).toMatchObject({ motivo: 'Faltou o prazo de entrega.', por: 'Carlos Chefe', etapa_nome: 'Conferência do chefe do setor requisitante' });
      expect((await caixa(chefe.token)).map((x) => x.id)).not.toContain(etapaId);
      const [n] = await sql(`SELECT * FROM notificacoes WHERE usuario_id = $1 AND entidade_id = $2 AND titulo LIKE 'Peça devolvida%'`, [agente.id, trId]);
      expect(n.mensagem).toMatch(/Faltou o prazo de entrega/);
      expect(n.link).toBe(`/orgao/processos/${lic.id}/fase-interna/tr`);
      // A mesma emissão não volta sozinha (nada mudou)
      await tarefas().agendar(lic.id);
      await tarefas().aguardarPendentes();
      expect((await sql(`SELECT count(*)::int AS n FROM aprovacoes_documento WHERE documento_id = $1`, [trId]))[0].n).toBe(1);
    });

    it('corrigida (nova versão emitida): volta sozinha ao fluxo; o chefe aprova e a etapa TR conclui', async () => {
      const r = (await emitir(lic, 'TR', 'Termo de referência — versão 2, com prazo de entrega').expect(201)).body;
      // a fila do processo (envio ao fluxo → juntada nos autos → tramitação) drena antes de conferir
      await tarefas().aguardarPendentes();
      const [agora] = await sql(`SELECT status::text AS status, versao FROM documentos_fase_interna WHERE id = $1`, [r.id]);
      expect(agora).toEqual({ status: 'AGUARDANDO_APROVACAO', versao: 2 });
      expect(r.status).toBe('AGUARDANDO_APROVACAO'); // a resposta já traz a peça em aprovação
      // em aprovação, a versão corrigida ainda não é juntada nos autos (só quando aprovada)
      expect(await sql(`SELECT 1 FROM juntadas_autos WHERE documento_id = $1`, [r.id])).toEqual([]);
      const [e] = await sql(`SELECT id::text AS id FROM aprovacoes_documento WHERE documento_id = $1 AND status = 'EM_ANALISE'`, [r.id]);
      expect((await caixa(chefe.token)).map((x) => x.id)).toEqual(expect.arrayContaining([e.id]));
      const ap = (await decidir(e.id, 'aprovar', chefe.token, { justificativa: 'Conferido.' }).expect(200)).body;
      expect(ap).toMatchObject({ documentoAprovado: true, assinada: false });
      const linha = await instrucao(lic, 'TR');
      expect(linha.status).toBe('OK');
      expect((await passo(lic, 'TR')).situacao).toBe('CONCLUIDO');
      const [doc] = await sql(`SELECT status::text AS status, aprovador_nome FROM documentos_fase_interna WHERE id = $1`, [r.id]);
      expect(doc).toMatchObject({ status: 'APROVADO', aprovador_nome: 'Carlos Chefe' });
      // aprovada, a versão corrigida é juntada uma vez nos autos
      await tarefas().aguardarPendentes();
      expect((await sql(`SELECT COUNT(*)::int AS n FROM juntadas_autos WHERE documento_id = $1`, [r.id]))[0].n).toBe(1);
      // Etapa já decidida: 400
      expect((await decidir(e.id, 'aprovar', chefe.token)).status).toBe(400);
    });
  });

  // ==========================================================================
  describe('D. duas etapas, a 2ª com assinatura (DFD)', () => {
    it('chefe confere → Diretora aprova e ASSINA; a 2ª etapa não é do chefe (403)', async () => {
      await http()
        .post('/api/fase-interna/fluxos-aprovacao')
        .set(bearer(adminA.token))
        .send({
          nome: 'DFD conferido e assinado',
          tipos_documento: ['DFD'],
          etapas: [
            { nome: 'Conferência do chefe', setor_id: setorReq },
            { nome: 'Aprovação e assinatura da Diretora', usuario_id: diretor.id, exige_assinatura: true },
          ],
        })
        .expect(201);
      await ligarAprovacaoInterna('DFD');
      const l = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const dfd = (await emitir(l, 'DFD', 'Demanda: material de escritório', apoio.token).expect(201)).body;
      expect(dfd.status).toBe('AGUARDANDO_APROVACAO');
      const e1 = (await caixa(chefe.token)).find((x) => x.documento_id === dfd.id);
      expect(e1).toMatchObject({ ordem: 1, total: 2, exige_assinatura: false });
      await decidir(e1.id, 'aprovar', chefe.token).expect(200);

      const linha = await instrucao(l, 'DFD');
      expect(linha.status).toBe('EM_APROVACAO');
      expect(linha.aprovacao.rotulo).toBe('Aguardando aprovação: Aprovação e assinatura da Diretora — Dora Diretora (2 de 2)');
      const e2 = (await caixa(diretor.token)).find((x) => x.documento_id === dfd.id);
      expect(e2).toMatchObject({ ordem: 2, total: 2, exige_assinatura: true, assina_ao_aprovar: true });
      expect((await caixa(chefe.token)).some((x) => x.documento_id === dfd.id)).toBe(false);
      expect((await decidir(e2.id, 'aprovar', chefe.token)).status).toBe(403);
      const [aviso] = await sql(`SELECT count(*)::int AS n FROM notificacoes WHERE usuario_id = $1 AND entidade_id = $2`, [diretor.id, dfd.id]);
      expect(aviso.n).toBe(1);

      const r = (await decidir(e2.id, 'aprovar', diretor.token).expect(200)).body;
      expect(r).toMatchObject({ documentoAprovado: true, assinada: true });
      const [doc] = await sql(`SELECT status::text AS status, assinaturas, folha_inicial FROM documentos_fase_interna WHERE id = $1`, [dfd.id]);
      expect(doc.status).toBe('ASSINADO');
      expect(doc.assinaturas.map((a: any) => [a.assinante_nome, a.assinante_cargo])).toEqual([['Dora Diretora', 'Diretora Administrativa']]);
      expect((await instrucao(l, 'DFD')).status).toBe('OK');
    });
  });

  // ==========================================================================
  describe('E. sem aprovação interna nada muda; ligada sem fluxo = aprovação única', () => {
    it('licitação (modelo sem aprovação interna no TR): o TR emitido fica pronto, sem ir para o fluxo — mesmo com fluxo do TR cadastrado', async () => {
      const l = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const r = (await emitir(l, 'TR', 'TR do pregão').expect(201)).body;
      expect(r.status).toBe('EM_ELABORACAO');
      const linha = await instrucao(l, 'TR');
      expect(linha).toMatchObject({ status: 'OK', aprovacao_interna: false, exige_aprovacao: false });
      expect((await sql(`SELECT count(*)::int AS n FROM aprovacoes_documento WHERE licitacao_id = $1`, [l.id]))[0].n).toBe(0);
    });

    it('anexar feito fora na etapa com aprovação interna: a peça anexada também passa pela conferência', async () => {
      const l = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const r = await http()
        .post(`/api/fase-interna/${l.id}/documentos/TR/anexo`)
        .set(bearer(agente.token))
        .field('data_documento', hoje())
        .field('numero_peca', 'TR 7/2026')
        .attach('arquivo', pdfDeTeste('TR feito fora'), { filename: 'tr.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('AGUARDANDO_APROVACAO');
      expect((await instrucao(l, 'TR')).status).toBe('EM_APROVACAO');
      expect((await caixa(chefe.token)).some((x) => x.documento_id === r.body.id)).toBe(true);
    });

    it('aprovação interna ligada SEM fluxo para a peça: aviso na etapa; aprovação única por quem conduz (login/ADMIN do órgão)', async () => {
      await ligarAprovacaoInterna('ETP');
      const l = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const etp = (await emitir(l, 'ETP', 'Estudo técnico preliminar').expect(201)).body;
      const linha = await instrucao(l, 'ETP');
      expect(linha).toMatchObject({ status: 'EM_APROVACAO', aprovacao_interna: true, sem_fluxo_aprovacao: true, fluxo_aprovacao: null });
      expect(linha.aprovacao.rotulo).toBe('Aguardando aprovação: Aprovação — quem conduz o processo (1 de 1)');
      const cob = (await http().get('/api/fase-interna/fluxos-aprovacao/cobertura').set(bearer(A.token)).expect(200)).body;
      const etpCob = cob.tipos.find((t: any) => t.tipo === 'DISPENSA').etapas.find((e: any) => e.codigo === 'ETP');
      expect(etpCob.pecas.find((p: any) => p.tipo === 'ETP').fluxo).toBeNull();

      expect((await caixa(chefe.token)).some((x) => x.documento_id === etp.id)).toBe(false);
      const doAdmin = (await caixa(adminA.token)).find((x) => x.documento_id === etp.id);
      expect(doAdmin).toBeTruthy();
      expect((await caixa(A.token)).some((x) => x.documento_id === etp.id)).toBe(true);
      expect((await decidir(doAdmin.id, 'aprovar', chefe.token)).status).toBe(403);
      await decidir(doAdmin.id, 'aprovar', adminA.token).expect(200);
      expect((await instrucao(l, 'ETP')).status).toBe('OK');
      await ligarAprovacaoInterna('ETP', false);
    });
  });

  // ==========================================================================
  describe('F. isolamento', () => {
    let etapaAberta: string;
    let docA: string;

    beforeAll(async () => {
      const l = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      docA = (await emitir(l, 'TR', 'TR para isolamento').expect(201)).body.id;
      [{ id: etapaAberta }] = await sql(`SELECT id::text AS id FROM aprovacoes_documento WHERE documento_id = $1 AND status = 'EM_ANALISE'`, [docA]);
    });

    it('outro órgão: 404 ao decidir e ao ler as etapas; nada de A na caixa nem na cobertura', async () => {
      const adminB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.ADMIN, nome: 'Adm B' });
      expect((await decidir(etapaAberta, 'aprovar', B.token)).status).toBe(404);
      expect((await decidir(etapaAberta, 'reprovar', adminB.token, { justificativa: 'x' })).status).toBe(404);
      expect((await http().get(`/api/fase-interna/documento/${docA}/etapas-aprovacao`).set(bearer(B.token))).status).toBe(404);
      expect(await caixa(B.token)).toEqual([]);
      expect(await caixa(adminB.token)).toEqual([]);
      const cob = (await http().get('/api/fase-interna/fluxos-aprovacao/cobertura').set(bearer(B.token)).expect(200)).body;
      expect(cob.alguma_ligada).toBe(false);
      // ?orgaoId de outro órgão é ignorado para quem não é admin da plataforma
      const cobA = (await http().get(`/api/fase-interna/fluxos-aprovacao/cobertura?orgaoId=${A.id}`).set(bearer(B.token)).expect(200)).body;
      expect(cobA.alguma_ligada).toBe(false);
      const fluxosB = (await http().get(`/api/fase-interna/fluxos-aprovacao?orgaoId=${A.id}`).set(bearer(B.token)).expect(200)).body;
      expect(fluxosB).toEqual([]);
      // setor de A num fluxo de B: recusado
      const r = await http().post('/api/fase-interna/fluxos-aprovacao').set(bearer(B.token)).send({ nome: 'x', tipo_documento: 'TR', etapas: [{ nome: 'x', setor_id: setorReq }] });
      expect(r.status).toBe(400);
      // e nada mudou na etapa de A
      const [e] = await sql(`SELECT status::text AS status FROM aprovacoes_documento WHERE id = $1`, [etapaAberta]);
      expect(e.status).toBe('EM_ANALISE');
    });

    it('fornecedor 403 e anônimo 401 na caixa, nos modelos prontos e na cobertura', async () => {
      for (const url of ['/api/fase-interna/aprovacoes/caixa', '/api/fase-interna/fluxos-aprovacao/modelos-prontos', '/api/fase-interna/fluxos-aprovacao/cobertura']) {
        expect((await http().get(url).set(bearer(F.token))).status).toBe(403);
        expect((await http().get(url)).status).toBe(401);
      }
    });

    it('servidor não consulta a caixa de outra pessoa (403); ADMIN do órgão consulta um setor do órgão', async () => {
      expect((await http().get(`/api/fase-interna/aprovacoes/caixa?usuarioId=${chefe.id}`).set(bearer(apoio.token))).status).toBe(403);
      const doSetor = (await http().get(`/api/fase-interna/aprovacoes/caixa?setorId=${setorReq}`).set(bearer(adminA.token)).expect(200)).body;
      expect(doSetor.map((x: any) => x.id)).toContain(etapaAberta);
      expect((await http().get(`/api/fase-interna/aprovacoes/caixa?setorId=${setorReq}`).set(bearer(B.token))).status).toBe(403);
    });
  });
});
