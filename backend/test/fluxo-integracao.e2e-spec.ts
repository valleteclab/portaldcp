/**
 * F3a — INTEGRAÇÃO TRAMITAÇÃO ↔ TAREFAS (docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §2, §6 e §10).
 *
 *  A. Modo SIMPLES: posse inicial com o condutor (sem aviso, sem folha); ao
 *     concluir as etapas dele, envio AUTOMÁTICO ao setor definido no modelo
 *     (despacho padrão + folha nos autos); a tarefa da etapa vai para o
 *     destino e o aviso não se repete (tramitação já avisou).
 *  B. Modo POR_SETOR: posse inicial no setor da etapa atual; etapas do
 *     detentor concluídas → tarefa "Enviar o processo para …"; o envio a uma
 *     pessoa conclui a tarefa e leva a tarefa da etapa a ela; sugestão de
 *     envio (contrato com a tela) e isolamento.
 *  C. "Aprovar a demanda": tarefa ao aprovador com aviso (link do processo);
 *     conclui na aprovação; cancelada quando o aprovador designado muda.
 *  D. Processo antigo sem tramitação: posse inicial na migração, sem avisar;
 *     processo divulgado não ganha nada.
 *  E. Despacho da etapa de REGISTRO vira folha dos autos (PDF + folha +
 *     intercalado na montagem); isolamento do PDF.
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
import { paginasDoPdf } from '../src/fase-interna/conformidade/texto-pdf';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const ontem = () => new Date(Date.now() - 3 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
const binario = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

describe('F3a — integração da tramitação com as tarefas', () => {
  let ctx: AppE2E;
  let F: FornecedorFixture;
  let OUTRO: OrgaoFixture;
  let deOutro: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);
  const esperar = () => tarefas().aguardarPendentes();

  const criarSetor = async (org: OrgaoFixture, nome: string) =>
    (await http().post(`/api/orgaos/${org.id}/setores`).set(bearer(org.token)).send({ nome }).expect(201)).body.id as string;
  const lotar = (u: UsuarioOrgaoFixture, setorId: string | null, papeis: string[], telefone: string) =>
    sql(`UPDATE usuarios SET setor_id = $2, papeis_fase_interna = $3::jsonb, telefone = $4 WHERE id = $1`, [u.id, setorId, JSON.stringify(papeis), telefone]);
  const anexar = (lic: { id: string }, tipo: string, token: string, data = hoje()) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', data)
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(`Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Objeto simples, sem necessidade do estudo.' });
  const tramitacoes = async (lic: { id: string }) => {
    await esperar();
    return sql(`SELECT * FROM tramitacoes_processo WHERE licitacao_id = $1 ORDER BY sequencia`, [lic.id]);
  };
  const tarefasDe = async (lic: { id: string }) => {
    await esperar();
    return sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 ORDER BY created_at`, [lic.id]);
  };
  const avisosTramitacao = (lic: { id: string }) =>
    sql(`SELECT usuario_id::text AS usuario_id, metadata FROM notificacoes WHERE tipo = 'PROCESSO_TRAMITADO' AND entidade_id = $1 ORDER BY created_at`, [lic.id]);
  const avisosDaTarefa = (tarefaId: string) =>
    sql(`SELECT usuario_id::text AS usuario_id, link, metadata FROM notificacoes WHERE entidade_tipo = 'TAREFA' AND entidade_id = $1 ORDER BY created_at`, [tarefaId]);
  const sugestao = (lic: { id: string }, token?: string) => {
    const r = http().get(`/api/fase-interna/${lic.id}/tramitacao/sugestao-envio`);
    return token ? r.set(bearer(token)) : r;
  };

  beforeAll(async () => {
    ctx = await criarApp();
    F = await criarFornecedor(ctx);
    OUTRO = await criarOrgao(ctx, { nome: 'Prefeitura F3 (outro órgão)' });
    deOutro = await criarUsuarioOrgao(ctx, OUTRO, { role: RoleUsuario.ADMIN, nome: 'Admin do outro órgão' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. modo SIMPLES: posse inicial, envio automático e tarefa do destino', () => {
    let S: OrgaoFixture;
    let agente: UsuarioOrgaoFixture;
    let katia: UsuarioOrgaoFixture;
    let sContab: string;
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      S = await criarOrgao(ctx, { nome: 'Câmara F3 Simples' });
      agente = await criarUsuarioOrgao(ctx, S, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
      katia = await criarUsuarioOrgao(ctx, S, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Kátia Contadora' });
      sContab = await criarSetor(S, 'Contabilidade');
      await lotar(katia, sContab, ['CONTABILIDADE'], '77999991001');
      await lotar(agente, null, ['AGENTE_CONTRATACAO'], '77999991002');
      // O modelo diz QUEM faz a reserva: o setor Contabilidade (nada em código)
      await http().put('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(S.token)).send({ etapas: [{ codigo: 'RESERVA', responsavel: { setor_id: sContab } }] }).expect(200);
      lic = await criarLicitacao(ctx, S, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('posse inicial: com o condutor (etapa atual), registro do sistema sem aviso e sem folha', async () => {
      const [t, ...resto] = await tramitacoes(lic);
      expect(resto).toHaveLength(0);
      expect(t).toMatchObject({ sequencia: 1, posse_inicial: true, automatico: true, status: 'RECEBIDA', para_usuario_id: agente.id, despacho_arquivo: null, folha_inicial: null });
      expect(t.despacho).toMatch(/^Autue-se e encaminhe-se ao\(à\) Ana Agente para /);
      expect(await avisosTramitacao(lic)).toEqual([]);
      const com = (await http().get(`/api/fase-interna/${lic.id}/tramitacao/com-quem-esta`).set(bearer(agente.token)).expect(200)).body;
      expect(com).toMatchObject({ status: 'RECEBIDA', usuario: { id: agente.id }, posse_inicial: true });
      // "desde" no mesmo relógio das demais datas (coluna sem fuso): nunca no futuro
      expect(new Date(com.desde).getTime()).toBeLessThanOrEqual(Date.now());
      expect(Date.now() - new Date(com.desde).getTime()).toBeLessThan(10 * 60_000);
    });

    it('etapas do condutor concluídas → envio automático à Contabilidade (despacho padrão, folha, prazo do modelo, aviso)', async () => {
      expect((await anexar(lic, 'DFD', agente.token)).status).toBe(201);
      expect((await naoSeAplica(lic, 'ETP', agente.token)).status).toBe(201);
      expect((await naoSeAplica(lic, 'AR', agente.token)).status).toBe(201);
      expect((await anexar(lic, 'TR', agente.token)).status).toBe(201);
      await esperar();
      expect((await tramitacoes(lic)).length).toBe(1); // ainda há etapa do condutor (a pesquisa)
      expect((await anexar(lic, 'PP', agente.token)).status).toBe(201);
      const ts = await tramitacoes(lic);
      expect(ts).toHaveLength(2);
      const auto = ts[1];
      expect(auto).toMatchObject({ automatico: true, posse_inicial: false, para_setor_id: sContab, status: 'PENDENTE', etapas: ['RESERVA'], prazo_dias_uteis: 3 });
      expect(auto.despacho).toBe('Encaminhe-se ao(à) Contabilidade para informação orçamentária e reserva.');
      expect(auto.despacho_arquivo).toMatch(/^licitacoes\//);
      expect(auto.folha_inicial).toBeGreaterThan(1);
      const [ant] = await sql(`SELECT status::text AS status FROM tramitacoes_processo WHERE id = $1`, [ts[0].id]);
      expect(ant.status).toBe('CONCLUIDA');
      expect((await avisosTramitacao(lic)).map((a: any) => a.usuario_id)).toEqual([katia.id]);
    });

    it('a tarefa da reserva é do destino (setor Contabilidade) e o aviso dela NÃO se repete para quem a tramitação avisou', async () => {
      const reserva = (await tarefasDe(lic)).find((t: any) => t.passo === 'RESERVA' && t.status === 'ABERTA');
      expect(reserva).toMatchObject({ origem: 'ETAPA', responsavel_setor_id: sContab, responsavel_usuario_id: null });
      expect(await avisosDaTarefa(reserva.id)).toEqual([]); // Kátia já recebeu o aviso da tramitação; ninguém mais recebe o da tarefa
      const caixa = (await http().get('/api/tarefas?aba=para-mim').set(bearer(katia.token)).expect(200)).body;
      expect(caixa.tarefas.some((t: any) => t.id === reserva.id)).toBe(true);
    });

    it('a Contabilidade conclui a reserva → o processo volta sozinho ao condutor para a autorização', async () => {
      expect((await anexar(lic, 'DO', katia.token)).status).toBe(201);
      const ts = await tramitacoes(lic);
      expect(ts).toHaveLength(3);
      expect(ts[2]).toMatchObject({ automatico: true, para_usuario_id: agente.id, de_setor_nome: 'Contabilidade' });
      expect(ts[2].despacho).toMatch(/^Encaminhe-se ao\(à\) Ana Agente para autorização/);
    });
  });

  // ==========================================================================
  describe('B. modo POR_SETOR: tarefa "Enviar o processo", envio a uma pessoa e sugestão de envio', () => {
    let P: OrgaoFixture;
    let carla: UsuarioOrgaoFixture;
    let katia: UsuarioOrgaoFixture;
    let sCompras: string;
    let sContab: string;
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      P = await criarOrgao(ctx, { nome: 'Câmara F3 Por setor' });
      carla = await criarUsuarioOrgao(ctx, P, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Carla Compras' });
      katia = await criarUsuarioOrgao(ctx, P, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Kátia Contab' });
      sCompras = await criarSetor(P, 'Compras');
      sContab = await criarSetor(P, 'Contabilidade');
      await lotar(carla, sCompras, ['COMPRAS', 'REQUISITANTE'], '77999992001');
      await lotar(katia, sContab, ['CONTABILIDADE'], '77999992002');
      await http().put('/api/fase-interna/configuracao').set(bearer(P.token)).send({ modo: 'POR_SETOR' }).expect(200);
      lic = await criarLicitacao(ctx, P, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    });

    it('posse inicial no setor de quem faz a etapa atual (a demanda: o papel Requisitante está só em Compras)', async () => {
      const [t] = await tramitacoes(lic);
      expect(t).toMatchObject({ posse_inicial: true, para_setor_id: sCompras, para_usuario_id: null, status: 'RECEBIDA' });
      expect(await avisosTramitacao(lic)).toEqual([]);
    });

    it('etapas de Compras concluídas → tarefa ao setor "Enviar o processo para Contabilidade (…)" com o despacho sugerido', async () => {
      expect((await anexar(lic, 'DFD', carla.token)).status).toBe(201);
      expect((await naoSeAplica(lic, 'ETP', carla.token)).status).toBe(201);
      expect((await naoSeAplica(lic, 'AR', carla.token)).status).toBe(201);
      expect((await anexar(lic, 'TR', carla.token)).status).toBe(201);
      expect((await anexar(lic, 'PP', carla.token)).status).toBe(201);
      const enviar = (await tarefasDe(lic)).find((t: any) => t.chave === 'tramitacao:enviar');
      expect(enviar).toMatchObject({ status: 'ABERTA', origem: 'TRAMITACAO', responsavel_setor_id: sCompras, titulo: 'Enviar o processo para Contabilidade (Informação orçamentária e reserva)' });
      expect(enviar.descricao).toMatch(/Encaminhe-se ao\(à\) Contabilidade para informação orçamentária e reserva\./);
      expect((await tramitacoes(lic)).length).toBe(1); // POR_SETOR: nada se move sozinho
      const avisos = await avisosDaTarefa(enviar.id);
      expect(avisos.map((a: any) => a.usuario_id)).toEqual([carla.id]);
      expect(avisos[0].link).toBe(`/orgao/processos/${lic.id}`);
    });

    it('sugestão de envio (contrato com a tela): destinos, principal, despacho, finalidade e quem pode enviar', async () => {
      const s = (await sugestao(lic, carla.token).expect(200)).body;
      expect(s).toMatchObject({
        destinos: [{ setor_id: sContab, usuario_id: null, rotulo: 'Contabilidade', etapas: [['RESERVA', 'Informação orçamentária e reserva']], principal: true }],
        despacho_sugerido: 'Encaminhe-se ao(à) Contabilidade para informação orçamentária e reserva.',
        finalidade: 'informação orçamentária e reserva',
        pode_enviar: true,
        modo: 'POR_SETOR',
      });
      expect(s.motivo_bloqueio).toBeUndefined();
      const k = (await sugestao(lic, katia.token).expect(200)).body;
      expect(k.pode_enviar).toBe(false);
      expect(k.motivo_bloqueio).toMatch(/está com Compras/);
      expect((await sugestao(lic, P.token).expect(200)).body.pode_enviar).toBe(true); // login do órgão = administrador
    });

    it('isolamento da sugestão: outro órgão 404 (login e usuário), fornecedor 403, anônimo 401; nada do processo vaza', async () => {
      const b = await sugestao(lic, OUTRO.token);
      expect(b.status).toBe(404);
      expect(JSON.stringify(b.body)).not.toContain('Contabilidade');
      expect((await sugestao(lic, deOutro.token)).status).toBe(404);
      expect((await sugestao(lic, F.token)).status).toBe(403);
      expect((await sugestao(lic)).status).toBe(401);
    });

    it('Carla envia à Kátia (pessoa) para a reserva: a tarefa "Enviar" conclui e a tarefa da reserva passa a ser dela', async () => {
      const r = await http()
        .post(`/api/fase-interna/${lic.id}/tramitar`)
        .set(bearer(carla.token))
        .send({ para_usuario_id: katia.id, despacho: 'À Kátia, para a informação orçamentária e a reserva.', etapas: ['RESERVA'] });
      expect(r.status).toBe(201);
      expect(r.body.etapas).toEqual(['RESERVA']);
      const ts = await tarefasDe(lic);
      expect(ts.find((t: any) => t.chave === 'tramitacao:enviar')).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Carla Compras' });
      expect(ts.find((t: any) => t.passo === 'RESERVA' && t.status === 'ABERTA')).toMatchObject({ responsavel_usuario_id: katia.id, responsavel_papel: null });
      // etapas inválidas no envio → 400
      await http().post(`/api/fase-interna/${lic.id}/tramitar`).set(bearer(katia.token)).send({ para_setor_id: sCompras, despacho: 'x', etapas: ['invalida!'] }).expect(400);
    });
  });

  // ==========================================================================
  describe('C. "Aprovar a demanda": tarefa ao aprovador designado', () => {
    let Q: OrgaoFixture;
    let rita: UsuarioOrgaoFixture;
    let paula: UsuarioOrgaoFixture;
    let otavio: UsuarioOrgaoFixture;

    beforeAll(async () => {
      Q = await criarOrgao(ctx, { nome: 'Câmara F3 Aprovação' });
      rita = await criarUsuarioOrgao(ctx, Q, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Rita Requisitante' });
      paula = await criarUsuarioOrgao(ctx, Q, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paula Presidente' });
      otavio = await criarUsuarioOrgao(ctx, Q, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Otávio Ordenador' });
      await lotar(rita, null, ['REQUISITANTE'], '77999993001');
      await lotar(paula, null, [], '77999993002');
      await sql(`UPDATE usuarios SET pode_aprovar_demandas = true WHERE id = $1`, [paula.id]);
      await http().put('/api/fase-interna/configuracao').set(bearer(Q.token)).send({ modo: 'POR_SETOR' }).expect(200);
    });

    const demandaFeitaPorRita = async () => {
      const lic = await criarLicitacao(ctx, Q, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await http().post(`/api/fase-interna/${lic.id}/documento`).set(bearer(rita.token)).send({ tipo: 'DFD', titulo: 'DFD', descricao: 'Demanda de teste F3' }).expect(201);
      await esperar();
      return lic;
    };

    it('DFD pronta aguardando: tarefa "Aprovar a demanda" para quem pode aprovar, com aviso (e-mail/WhatsApp) e link da Central de Aprovações; conclui na aprovação', async () => {
      const lic = await demandaFeitaPorRita();
      const aprovar = (await tarefasDe(lic)).find((t: any) => t.origem === 'APROVACAO' && t.status === 'ABERTA');
      expect(aprovar).toMatchObject({ chave: `demanda:aprovar:${paula.id}`, titulo: 'Aprovar a demanda', responsavel_usuario_id: paula.id, passo: 'DFD' });
      const avisos = await avisosDaTarefa(aprovar.id);
      expect(avisos.map((a: any) => a.usuario_id)).toEqual([paula.id]);
      // o link leva à Central de Aprovações (todas as aprovações num lugar só)
      expect(avisos[0].link).toBe(`/orgao/aprovacoes?tab=demandas&processo=${lic.id}`);
      expect(avisos[0].metadata.whatsapp_url).toBe(`http://localhost:3000/orgao/aprovacoes?tab=demandas&processo=${lic.id}`);
      const caixa = (await http().get('/api/tarefas?aba=para-mim').set(bearer(paula.token)).expect(200)).body;
      expect(caixa.tarefas.find((t: any) => t.id === aprovar.id)?.destino).toBe(`/orgao/aprovacoes?tab=demandas&processo=${lic.id}`);
      // e aparece na Central para quem aprova (só para ela)
      const central = (await http().get('/api/dfds-consolidados/central').set(bearer(paula.token)).expect(200)).body;
      expect(central.processos.map((p: any) => p.licitacao_id)).toContain(lic.id);

      await http().post(`/api/fase-interna/${lic.id}/demanda/aprovar`).set(bearer(paula.token)).send({ observacao: 'Aprovada.' }).expect(201);
      const depois = (await tarefasDe(lic)).find((t: any) => t.id === aprovar.id);
      expect(depois).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Paula Presidente' });
    });

    it('o aprovador designado muda: a tarefa antiga é cancelada e nasce a do novo', async () => {
      const lic = await demandaFeitaPorRita();
      const antiga = (await tarefasDe(lic)).find((t: any) => t.origem === 'APROVACAO' && t.status === 'ABERTA');
      expect(antiga.responsavel_usuario_id).toBe(paula.id);
      await http()
        .put('/api/fluxo-fase-interna/modelos/DISPENSA')
        .set(bearer(Q.token))
        .send({ aprovacao_demanda: { aprovador: { tipo: 'USUARIO', valor: otavio.id } } })
        .expect(200);
      await tarefas().agendar(lic.id);
      const ts = await tarefasDe(lic);
      expect(ts.find((t: any) => t.id === antiga.id)).toMatchObject({ status: 'CANCELADA', motivo_cancelamento: 'O aprovador designado no modelo mudou.' });
      expect(ts.find((t: any) => t.origem === 'APROVACAO' && t.status === 'ABERTA')).toMatchObject({ chave: 'demanda:aprovar', responsavel_usuario_id: otavio.id });
    });
  });

  // ==========================================================================
  describe('D. processo antigo sem tramitação: posse inicial na migração, sem avisar', () => {
    it('em andamento ganha a posse; divulgado não ganha nada; ninguém é avisado', async () => {
      const L = await criarOrgao(ctx, { nome: 'Câmara F3 Legado' });
      const agente = await criarUsuarioOrgao(ctx, L, { role: RoleUsuario.PREGOEIRO, nome: 'Agente Legado' });
      const andamento = await criarLicitacao(ctx, L, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      const divulgado = await criarLicitacao(ctx, L, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await esperar();
      // "de antes da F3": sem tramitação nenhuma; um deles já divulgado
      await sql(`DELETE FROM tramitacoes_processo WHERE licitacao_id = ANY($1::uuid[])`, [[andamento.id, divulgado.id]]);
      await sql(`UPDATE licitacoes SET fase = 'ACOLHIMENTO_PROPOSTAS' WHERE id = $1`, [divulgado.id]);
      await tarefas().migrarProcessosExistentes();
      await esperar();
      const [t, ...resto] = await tramitacoes(andamento);
      expect(resto).toHaveLength(0);
      expect(t).toMatchObject({ posse_inicial: true, para_usuario_id: agente.id, despacho_arquivo: null });
      expect(await tramitacoes(divulgado)).toEqual([]);
      expect(await avisosTramitacao(andamento)).toEqual([]);
      expect(await avisosTramitacao(divulgado)).toEqual([]);
      // idempotente: rodar de novo não cria outra
      await tarefas().migrarProcessosExistentes();
      expect(await tramitacoes(andamento)).toHaveLength(1);
    });

    it('lançamento posterior (processo físico) não é barrado pela posse inicial', async () => {
      const L2 = await criarOrgao(ctx, { nome: 'Câmara F3 Físico' });
      const agente = await criarUsuarioOrgao(ctx, L2, { role: RoleUsuario.PREGOEIRO, nome: 'Agente Físico' });
      const setor = await criarSetor(L2, 'Protocolo');
      const lic = await criarLicitacao(ctx, L2, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      expect((await tramitacoes(lic))[0].posse_inicial).toBe(true);
      const cincoDiasAtras = new Date(Date.now() - 3 * 3_600_000 - 5 * 86_400_000).toISOString().slice(0, 10);
      const r = await http()
        .post(`/api/fase-interna/${lic.id}/tramitar`)
        .set(bearer(agente.token))
        .send({ para_setor_id: setor, despacho: 'Enviado ao protocolo no papel.', data_ocorrencia: cincoDiasAtras });
      expect(r.status).toBe(201);
      expect(r.body.lancado_posteriormente).toBe(true);
      // a posse inicial não se devolve
      const [ini] = await tramitacoes(lic);
      await http().put(`/api/fase-interna/tramitacoes/${ini.id}/devolver`).set(bearer(L2.token)).send({ motivo: 'teste' }).expect(400);
    });
  });

  // ==========================================================================
  describe('E. despacho da etapa de registro vira folha dos autos', () => {
    let R: OrgaoFixture;
    let lic: LicitacaoFixture;
    let despacho: any;

    beforeAll(async () => {
      R = await criarOrgao(ctx, { nome: 'Câmara F3 Registro' });
      await http().put('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(R.token)).send({ etapas: [{ codigo: 'AUTORIZACAO_INICIO', ligada: true }] }).expect(200);
      lic = await criarLicitacao(ctx, R, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await anexar(lic, 'DFD', R.token, ontem())).status).toBe(201); // peça datada de ontem: o despacho de hoje vem depois
    });

    it('concluir a etapa de registro gera o PDF do despacho com folha na sequência das peças', async () => {
      const r = await http().post(`/api/fase-interna/${lic.id}/etapas/AUTORIZACAO_INICIO/concluir`).set(bearer(R.token)).send({ texto: 'Autorizo o início do processo de contratação.' });
      expect(r.status).toBe(201);
      const p = r.body.etapas.flatMap((e: any) => e.passos).find((x: any) => x.passo === 'AUTORIZACAO_INICIO');
      expect(p.situacao).toBe('CONCLUIDO');
      despacho = p.registro.despacho;
      expect(despacho).toMatchObject({ folha_inicial: 2, folha_final: 2, url: `/api/fase-interna/despachos/${despacho.id}/pdf` }); // DFD = fl. 1
      const [d] = await sql(`SELECT etapa, texto, folha_inicial, arquivo FROM despachos_fase_interna WHERE id = $1`, [despacho.id]);
      expect(d).toMatchObject({ etapa: 'AUTORIZACAO_INICIO', texto: 'Autorizo o início do processo de contratação.', folha_inicial: 2 });
      const pdf = await http().get(despacho.url).set(bearer(R.token)).buffer(true).parse(binario);
      expect(pdf.status).toBe(200);
      const texto = ((await paginasDoPdf(pdf.body)) ?? []).join(' ').replace(/\s+/g, ' ');
      expect(texto).toMatch(/DESPACHO DE AUTORIZAÇÃO DO INÍCIO/);
      expect(texto).toMatch(/Autorizo o início do processo de contratação\./);
      expect(texto).toMatch(/horário de Brasília/);
    });

    it('isolamento do PDF do despacho: outro órgão 404, fornecedor 403, anônimo 401', async () => {
      expect((await http().get(despacho.url).set(bearer(OUTRO.token))).status).toBe(404);
      expect((await http().get(despacho.url).set(bearer(deOutro.token))).status).toBe(404);
      expect((await http().get(despacho.url).set(bearer(F.token))).status).toBe(403);
      expect((await http().get(despacho.url)).status).toBe(401);
    });

    it('os autos trazem o despacho intercalado, com as folhas gravadas nele', async () => {
      const g = await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(R.token));
      expect(g.status).toBe(201);
      const limite = Date.now() + 90_000;
      let s: any;
      do {
        s = (await http().get(`/api/licitacoes/${lic.id}/processo-pdf/situacao`).set(bearer(R.token)).expect(200)).body;
        if (s.situacao === 'PRONTO') break;
        await new Promise((r) => setTimeout(r, 200));
      } while (Date.now() < limite);
      expect(s.situacao).toBe('PRONTO');
      const idx = s.indice as any[];
      const e = idx.find((x) => x.despacho_etapa_id === despacho.id);
      expect(e).toBeTruthy();
      expect(e.titulo).toBe('Despacho de autorização do início');
      const dfd = idx.findIndex((x) => /DFD|demanda/i.test(x.titulo));
      expect(idx.indexOf(e)).toBeGreaterThan(dfd);
      const [d] = await sql(`SELECT folha_inicial, folha_final FROM despachos_fase_interna WHERE id = $1`, [despacho.id]);
      expect(d).toEqual({ folha_inicial: e.folha_inicial, folha_final: e.folha_final });
      // a folha é a da juntada (a que a tela mostrou ao concluir a etapa) — a montagem não renumera
      expect(e.folha_inicial).toBe(despacho.folha_inicial);
      expect(e.juntado_em).toBeTruthy();
    });
  });
});
