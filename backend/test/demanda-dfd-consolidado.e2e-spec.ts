/**
 * ============================================================================
 * DEMANDA → DFD CONSOLIDADO → PROCESSO (unidade de planejamento)
 * ============================================================================
 *
 * Conceito aprovado pelo dono:
 *  - DEMANDA = pedido de qualquer setor (o que precisa, quanto, por quê, quando);
 *  - DFD = feito pela UNIDADE DE PLANEJAMENTO, junta pedidos parecidos de
 *    vários setores (art. 12, VII — evita o fracionamento) e abre 1 processo;
 *  - aprovação padrão = só a da demanda (Central de Aprovações), com o
 *    aprovador pelo TOKEN; 2ª aprovação (do DFD) opcional, ligada em
 *    Configurações › Fluxo;
 *  - demanda consolidada fica travada; alerta de parecidos (atenção);
 *  - isolamento por órgão em todas as rotas novas.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { MigracaoDfdBootService } from '../src/demandas/dfd/migracao-dfd-boot.service';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const ANO = 2036;

describe('Demanda → DFD consolidado → processo', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let rita: UsuarioOrgaoFixture; // Comunicação (requisitante)
  let gil: UsuarioOrgaoFixture; // Gabinete (requisitante)
  let edu: UsuarioOrgaoFixture; // Educação (requisitante)
  let paula: UsuarioOrgaoFixture; // aprova demandas (pode_aprovar_demandas)
  let plinio: UsuarioOrgaoFixture; // unidade de planejamento (papel PLANEJAMENTO)
  let aut: UsuarioOrgaoFixture; // autoridade (2ª aprovação, quando ligada)
  let planejB: UsuarioOrgaoFixture; // planejamento do órgão B
  let setorDaf: string;
  let setorCom: string;
  let itemPca: string;
  let d1: string; // Comunicação — 3 notebooks + nada
  let d2: string; // Gabinete — 2 notebooks + 5 toners
  let d3: string; // Educação — 10 toners (parecida, fica fora do 1º DFD)
  let demandaB: string;
  let dfd1: string;
  let lic1: string;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);

  async function criarDemanda(u: { token: string }, unidade: string, objeto: string, itens: any[], data?: string): Promise<string> {
    const d = await http()
      .post('/api/demandas')
      .set(bearer(u.token))
      .send({ ano_referencia: ANO, unidade_requisitante: unidade, descricao_sucinta_objeto: objeto, observacoes: `Justificativa de ${unidade}`, data_desejada_contratacao: data })
      .expect(201);
    for (const i of itens) await http().post(`/api/demandas/${d.body.id}/itens`).set(bearer(u.token)).send(i).expect(201);
    return d.body.id;
  }
  const notebook = (qtd: number, valor: number, prioridade: number) => ({
    categoria: 'MATERIAL',
    codigo_item_catalogo: 'M-451',
    codigo_classe: '7010',
    nome_classe: 'Equipamentos de informática',
    descricao_objeto: 'Notebook 14 polegadas',
    quantidade_estimada: qtd,
    unidade_medida: 'UN',
    valor_unitario_estimado: valor,
    prioridade,
  });
  const toner = (qtd: number) => ({
    categoria: 'MATERIAL',
    codigo_classe: '7510',
    nome_classe: 'Suprimentos de impressão',
    descricao_objeto: 'Toner HP 85A',
    quantidade_estimada: qtd,
    unidade_medida: 'UN',
    valor_unitario_estimado: 100,
  });
  const status = async (id: string) => (await sql(`SELECT status::text AS s FROM demandas WHERE id = $1`, [id]))[0].s;

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara DFD (A)' });
    B = await criarOrgao(ctx, { nome: 'Câmara DFD (B)' });
    F = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    [{ id: setorDaf }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'DAF', 'Diretoria Administrativa') RETURNING id::text AS id`, [A.id]);
    [{ id: setorCom }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'COM', 'Comunicação') RETURNING id::text AS id`, [A.id]);
    await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'GAB', 'Gabinete'), ($1, 'EDU', 'Educação')`, [A.id]);
    rita = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Rita Comunicação' });
    gil = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Gil Gabinete' });
    edu = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Edu Educação' });
    paula = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paula Aprovadora' });
    plinio = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Plínio Planejamento' });
    aut = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Aurora Autoridade' });
    planejB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.PREGOEIRO, nome: 'Planejamento B' });
    await sql(`UPDATE usuarios SET setor_id = $2 WHERE id = $1`, [rita.id, setorCom]);
    await sql(`UPDATE usuarios SET pode_aprovar_demandas = true WHERE id = $1`, [paula.id]);
    await sql(`UPDATE usuarios SET papeis_fase_interna = '["PLANEJAMENTO"]'::jsonb, setor_id = $2 WHERE id = $1`, [plinio.id, setorDaf]);
    await sql(`UPDATE usuarios SET papeis_fase_interna = '["AUTORIDADE"]'::jsonb WHERE id = $1`, [aut.id]);
    await sql(`UPDATE usuarios SET papeis_fase_interna = '["PLANEJAMENTO"]'::jsonb WHERE id = $1`, [planejB.id]);
    const pca = (await http().post('/api/pca').set(bearer(A.token)).send({ ano_exercicio: ANO }).expect(201)).body.id;
    itemPca = (await http().post(`/api/pca/${pca}/itens`).set(bearer(A.token)).send({ categoria: 'MATERIAL', descricao_objeto: 'Informática e suprimentos', valor_estimado: 50000 }).expect(201)).body.id;
    demandaB = await criarDemanda(B, 'Secretaria B', 'Notebook B', [notebook(1, 4000, 3)]);
    await http().patch(`/api/demandas/${demandaB}/enviar`).set(bearer(B.token)).expect(200);
    await http().patch(`/api/demandas/${demandaB}/aprovar`).set(bearer(B.token)).expect(200);
  });

  afterAll(async () => {
    await tarefas()?.aguardarPendentes().catch(() => undefined);
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. setores criam demandas → aprovador aprova na Central', () => {
    it('cada setor cria a sua demanda (setor como id quando existe; quem pediu vem do token) e envia — o aprovador é avisado', async () => {
      d1 = await criarDemanda(rita, 'Comunicação', 'Notebooks para a equipe de vídeo', [notebook(3, 4000, 2)], `${ANO}-11-10`);
      d2 = await criarDemanda(gil, 'Gabinete', 'Notebook e toner do gabinete', [notebook(2, 4600, 1), toner(5)], `${ANO}-10-01`);
      d3 = await criarDemanda(edu, 'Educação', 'Toner para as escolas', [toner(10)], `${ANO}-12-01`);
      const [r] = await sql(`SELECT setor_id::text AS setor_id, criado_por_id, criado_por_nome FROM demandas WHERE id = $1`, [d1]);
      expect(r).toMatchObject({ setor_id: setorCom, criado_por_id: rita.id, criado_por_nome: 'Rita Comunicação' });
      // PCA: os itens de d1 e d2 apontam o mesmo item do PCA
      const itens = await sql(`SELECT id::text AS id FROM itens_demanda WHERE demanda_id::text = ANY($1::text[])`, [[d1, d2]]);
      for (const i of itens) await http().patch(`/api/demandas/itens/${i.id}/vincular-pca`).set(bearer(A.token)).send({ itemPcaId: itemPca }).expect(200);
      for (const [u, d] of [[rita, d1], [gil, d2], [edu, d3]] as const) await http().patch(`/api/demandas/${d}/enviar`).set(bearer(u.token)).expect(200);
      const avisos = await sql(`SELECT usuario_id::text AS usuario_id, link, metadata FROM notificacoes WHERE entidade_id = $1`, [d1]);
      expect(avisos.map((a: any) => a.usuario_id)).toEqual([paula.id]);
      expect(avisos[0].link).toBe('/orgao/aprovacoes?tab=demandas');
      expect(avisos[0].metadata.whatsapp_url).toMatch(/\/orgao\/aprovacoes\?tab=demandas$/);
    });

    it('Central de Aprovações: cada um vê só o que aprova', async () => {
      const cp = (await http().get('/api/dfds-consolidados/central').set(bearer(paula.token)).expect(200)).body;
      expect(cp.demandas.map((d: any) => d.id).sort()).toEqual([d1, d2, d3].sort());
      expect(cp.permissoes).toMatchObject({ pode_aprovar_demanda: true, pode_montar: false });
      const cr = (await http().get('/api/dfds-consolidados/central').set(bearer(rita.token)).expect(200)).body;
      expect(cr.demandas).toEqual([]);
      const cpl = (await http().get('/api/dfds-consolidados/central').set(bearer(plinio.token)).expect(200)).body;
      expect(cpl.demandas).toEqual([]);
      expect(cpl.permissoes.pode_montar).toBe(true);
    });

    it('aprovar: sem permissão → 403; o aprovador é o do TOKEN (o "aprovadoPor" do corpo é ignorado)', async () => {
      await http().patch(`/api/demandas/${d1}/aprovar`).set(bearer(plinio.token)).send({ aprovadoPor: 'x' }).expect(403);
      for (const d of [d1, d2]) await http().patch(`/api/demandas/${d}/aprovar`).set(bearer(paula.token)).send({ aprovadoPor: 'Fulano Forjado' }).expect(200);
      const [r] = await sql(`SELECT aprovado_por, aprovado_por_id FROM demandas WHERE id = $1`, [d1]);
      expect(r).toEqual({ aprovado_por: 'Paula Aprovadora', aprovado_por_id: paula.id });
      const aviso = await sql(`SELECT usuario_id::text AS usuario_id FROM notificacoes WHERE entidade_id = $1 AND tipo::text = 'DEMANDA_APROVADA'`, [d1]);
      expect(aviso.map((a: any) => a.usuario_id)).toEqual([rita.id]);
    });

    it('demanda rejeitada volta a rascunho pelo setor, é corrigida e reenviada', async () => {
      await http().patch(`/api/demandas/${d3}/rejeitar`).set(bearer(paula.token)).send({ motivo: 'Informe a quantidade por escola' }).expect(200);
      expect(await status(d3)).toBe('REJEITADA');
      await http().patch(`/api/demandas/${d3}/voltar-rascunho`).set(bearer(edu.token)).expect(200);
      expect(await status(d3)).toBe('RASCUNHO');
      await http().put(`/api/demandas/${d3}`).set(bearer(edu.token)).send({ observacoes: '10 escolas, 1 toner cada' }).expect(200);
      await http().patch(`/api/demandas/${d3}/enviar`).set(bearer(edu.token)).expect(200);
      await http().patch(`/api/demandas/${d3}/aprovar`).set(bearer(paula.token)).expect(200);
      expect(await status(d3)).toBe('APROVADA');
    });
  });

  // ==========================================================================
  describe('2. planejamento monta o DFD juntando demandas', () => {
    it('só a unidade de planejamento monta (requisitante → 403); a prévia soma os itens e alerta a 3ª demanda parecida', async () => {
      await http().post('/api/dfds-consolidados').set(bearer(rita.token)).send({ demanda_ids: [d1, d2] }).expect(403);
      const p = (await http().post('/api/dfds-consolidados/previa').set(bearer(plinio.token)).send({ demanda_ids: [d1, d2] }).expect(201)).body;
      const nb = p.itens.find((i: any) => i.codigo_item_catalogo === 'M-451');
      expect(nb).toMatchObject({ quantidade_somada: 5, quantidade: 5 });
      expect(p.alertas.map((a: any) => [a.tipo, a.id, a.link])).toEqual([['DEMANDA', d3, `/orgao/demandas/${d3}`]]);
      expect(p.alerta).toMatch(/art\. 12, VII/);
    });

    it('cria o DFD em rascunho: itens somados com a origem, campos sugeridos, unidade de planejamento e responsável', async () => {
      const r = (await http().post('/api/dfds-consolidados').set(bearer(plinio.token)).send({ demanda_ids: [d1, d2] }).expect(201)).body;
      dfd1 = r.id;
      expect(r).toMatchObject({
        ano: ANO,
        status: 'RASCUNHO',
        rotulo: expect.stringMatching(new RegExp(`^DFD nº \\d+/${ANO}$`)),
        unidade_planejamento_id: setorDaf,
        unidade_planejamento_nome: 'Diretoria Administrativa',
        responsavel_id: plinio.id,
        data_pretendida: `${ANO}-10-01`,
        prioridade: 'URGENTE',
        item_pca_id: itemPca,
      });
      const nb = r.itens.find((i: any) => i.codigo_item_catalogo === 'M-451');
      expect(nb.origens.map((o: any) => [o.setor, o.quantidade])).toEqual([
        ['Comunicação', 3],
        ['Gabinete', 2],
      ]);
      expect(r.demandas.map((d: any) => d.id).sort()).toEqual([d1, d2].sort());
      expect(r.alertas.map((a: any) => a.id)).toEqual([d3]);
      expect(r.permissoes).toMatchObject({ editar: true, abrir_processo: true, enviar_aprovacao: false });
    });

    it('as demandas juntadas ficam travadas: não se editam, não entram em outro DFD, não abrem processo sozinhas', async () => {
      await http().put(`/api/demandas/${d1}`).set(bearer(rita.token)).send({ observacoes: 'mudei' }).expect(400);
      await http().patch(`/api/demandas/${d1}/voltar-rascunho`).set(bearer(rita.token)).expect(400);
      const outro = await http().post('/api/dfds-consolidados').set(bearer(plinio.token)).send({ demanda_ids: [d1] });
      expect(outro.status).toBe(409);
      expect(outro.body.message).toMatch(/já está no DFD nº/);
      await http().post(`/api/dfds-consolidados/a-partir-de-demanda/${d1}`).set(bearer(plinio.token)).expect(409);
      const l = await http().post('/api/licitacoes/a-partir-de-demanda').set(bearer(A.token)).send({ demanda_id: d1, modalidade: ModalidadeLicitacao.DISPENSA_ELETRONICA });
      expect(l.status).toBe(409);
      const lista = (await http().get(`/api/demandas?ano=${ANO}`).set(bearer(rita.token)).expect(200)).body;
      expect(lista.find((d: any) => d.id === d1).dfd).toMatchObject({ id: dfd1, status: 'RASCUNHO' });
    });

    it('o planejamento ajusta a quantidade antes de abrir (a soma original fica guardada)', async () => {
      const r0 = (await http().get(`/api/dfds-consolidados/${dfd1}`).set(bearer(plinio.token)).expect(200)).body;
      const nb0 = r0.itens.find((i: any) => i.codigo_item_catalogo === 'M-451');
      const r = (
        await http()
          .put(`/api/dfds-consolidados/${dfd1}`)
          .set(bearer(plinio.token))
          .send({ ajustes: { [nb0.chave]: { quantidade: 4, justificativa: 'Um notebook remanejado' } }, objeto: 'Aquisição de notebooks e toner — consolidação Comunicação e Gabinete' })
          .expect(200)
      ).body;
      const nb = r.itens.find((i: any) => i.codigo_item_catalogo === 'M-451');
      expect(nb).toMatchObject({ quantidade_somada: 5, quantidade: 4, ajustado: true });
      await http().put(`/api/dfds-consolidados/${dfd1}`).set(bearer(rita.token)).send({ objeto: 'invasão' }).expect(403);
    });

    it('PDF do DFD (lista setores e demandas de origem)', async () => {
      const r = await http().get(`/api/dfds-consolidados/${dfd1}/pdf`).set(bearer(rita.token)).buffer(true).parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/application\/pdf/);
      const b: Buffer = r.body;
      expect(b.subarray(0, 4).toString()).toBe('%PDF');
      expect(b.length).toBeGreaterThan(2000);
      expect(b.toString('latin1')).not.toContain('{{');
    });
  });

  // ==========================================================================
  describe('3. abrir o processo a partir do DFD', () => {
    it('requisitante → 403; planejamento abre: itens somados, peça DFD preenchida, ligação N:1, demandas em contratação e alerta', async () => {
      await http().post(`/api/dfds-consolidados/${dfd1}/abrir-processo`).set(bearer(rita.token)).send({ modalidade: 'DISPENSA_ELETRONICA' }).expect(403);
      const r = (await http().post(`/api/dfds-consolidados/${dfd1}/abrir-processo`).set(bearer(plinio.token)).send({ modalidade: 'DISPENSA_ELETRONICA' }).expect(201)).body;
      lic1 = r.licitacao.id;
      expect(r.alertas.map((a: any) => a.id)).toEqual([d3]);
      const [lic] = await sql(`SELECT demanda_id, item_pca_id::text AS item_pca_id, objeto FROM licitacoes WHERE id = $1`, [lic1]);
      expect(lic).toMatchObject({ demanda_id: null, item_pca_id: itemPca, objeto: 'Aquisição de notebooks e toner — consolidação Comunicação e Gabinete' });
      const itens = await sql(`SELECT descricao_resumida, quantidade::float AS q FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`, [lic1]);
      expect(itens).toEqual([
        { descricao_resumida: 'Notebook 14 polegadas', q: 4 },
        { descricao_resumida: 'Toner HP 85A', q: 5 },
      ]);
      const [doc] = await sql(`SELECT dados_estruturados FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'DFD' AND versao_atual = true`, [lic1]);
      expect(doc.dados_estruturados._dfd).toMatchObject({
        unidade_requisitante_id: setorDaf,
        responsavel_id: plinio.id,
        responsavel_nome: 'Plínio Planejamento',
        data_pretendida: `${ANO}-10-01`,
        prioridade: 'URGENTE',
      });
      expect(doc.dados_estruturados._dfd.unidade_requisitante_nome).toMatch(/Comunicação; Gabinete/);
      expect(doc.dados_estruturados.demanda).toMatch(/Comunicação; Gabinete/);
      const [f] = await sql(`SELECT status, licitacao_id::text AS licitacao_id FROM dfds_consolidados WHERE id = $1`, [dfd1]);
      expect(f).toEqual({ status: 'EM_PROCESSO', licitacao_id: lic1 });
      expect(await status(d1)).toBe('EM_CONTRATACAO');
      expect(await status(d2)).toBe('EM_CONTRATACAO');
      expect(await status(d3)).toBe('APROVADA');
    });

    it('a aprovação da demanda do processo conta sozinha (todas as demandas de origem aprovadas)', async () => {
      const et = (await http().get(`/api/fase-interna/${lic1}/etapas`).set(bearer(plinio.token)).expect(200)).body;
      expect(et.aprovacao_demanda).toMatchObject({ aprovada: true, registro: { origem: 'DEMANDA' } });
      expect(et.aprovacao_demanda.registro.por_nome).toMatch(/DFD consolidado nº \d+\/\d+ \(2 demanda/);
    });

    it('depois do processo: DFD não abre outro nem se cancela; o requisitante acompanha o processo pela demanda', async () => {
      await http().post(`/api/dfds-consolidados/${dfd1}/abrir-processo`).set(bearer(plinio.token)).send({ modalidade: 'DISPENSA_ELETRONICA' }).expect(409);
      await http().post(`/api/dfds-consolidados/${dfd1}/cancelar`).set(bearer(plinio.token)).send({ motivo: 'Não precisa mais' }).expect(409);
      await http().put(`/api/dfds-consolidados/${dfd1}`).set(bearer(plinio.token)).send({ objeto: 'Outro objeto qualquer' }).expect(409);
      const ac = (await http().get(`/api/demandas/${d2}/acompanhamento`).set(bearer(gil.token)).expect(200)).body;
      expect(ac.processo.id).toBe(lic1);
      expect(ac.dfd).toMatchObject({ id: dfd1, status: 'EM_PROCESSO' });
    });
  });

  // ==========================================================================
  describe('4. 2ª aprovação (do DFD) ligada em Configurações › Fluxo', () => {
    let dfd2: string;

    it('só o administrador liga; ligada, o processo só abre depois da aprovação do DFD', async () => {
      await http().put('/api/fluxo-fase-interna/planejamento').set(bearer(plinio.token)).send({ aprovacao_dfd: { exigida: true } }).expect(403);
      const cfg = (
        await http()
          .put('/api/fluxo-fase-interna/planejamento')
          .set(bearer(A.token))
          .send({ aprovacao_dfd: { exigida: true, aprovador: { tipo: 'PAPEL', valor: 'AUTORIDADE' } } })
          .expect(200)
      ).body;
      expect(cfg.planejamento.aprovacao_dfd).toEqual({ exigida: true, aprovador: { tipo: 'PAPEL', valor: 'AUTORIDADE' } });
      await http().put('/api/fluxo-fase-interna/planejamento').set(bearer(A.token)).send({ responsavel_dfd: { tipo: 'SETOR', valor: '00000000-0000-4000-8000-000000000000' } }).expect(400);

      const r = (await http().post('/api/dfds-consolidados').set(bearer(plinio.token)).send({ demanda_ids: [d3] }).expect(201)).body;
      dfd2 = r.id;
      expect(r.permissoes).toMatchObject({ abrir_processo: false, enviar_aprovacao: true });
      const semAprovacao = await http().post(`/api/dfds-consolidados/${dfd2}/abrir-processo`).set(bearer(plinio.token)).send({ modalidade: 'DISPENSA_ELETRONICA' });
      expect(semAprovacao.status).toBe(409);
      expect(semAprovacao.body.message).toMatch(/2ª aprovação/);
    });

    it('enviado: o aprovador configurado é avisado e vê na Central; os demais não aprovam; devolver e aprovar', async () => {
      await http().post(`/api/dfds-consolidados/${dfd2}/enviar-aprovacao`).set(bearer(plinio.token)).expect(201);
      const avisos = await sql(`SELECT usuario_id::text AS usuario_id FROM notificacoes WHERE entidade_id = $1`, [dfd2]);
      expect(avisos.map((a: any) => a.usuario_id)).toEqual([aut.id]);
      const ca = (await http().get('/api/dfds-consolidados/central').set(bearer(aut.token)).expect(200)).body;
      expect(ca.dfds.map((f: any) => f.id)).toEqual([dfd2]);
      const cp = (await http().get('/api/dfds-consolidados/central').set(bearer(paula.token)).expect(200)).body;
      expect(cp.dfds).toEqual([]);
      await http().post(`/api/dfds-consolidados/${dfd2}/aprovar`).set(bearer(paula.token)).send({}).expect(403);
      await http().post(`/api/dfds-consolidados/${dfd2}/aprovar`).set(bearer(plinio.token)).send({}).expect(403);
      await http().post(`/api/dfds-consolidados/${dfd2}/devolver`).set(bearer(aut.token)).send({ motivo: 'Confira a data pretendida' }).expect(201);
      expect((await sql(`SELECT status FROM dfds_consolidados WHERE id = $1`, [dfd2]))[0].status).toBe('RASCUNHO');
      await http().put(`/api/dfds-consolidados/${dfd2}`).set(bearer(plinio.token)).send({ data_pretendida: `${ANO}-12-15` }).expect(200);
      await http().post(`/api/dfds-consolidados/${dfd2}/enviar-aprovacao`).set(bearer(plinio.token)).expect(201);
      const ap = (await http().post(`/api/dfds-consolidados/${dfd2}/aprovar`).set(bearer(aut.token)).send({ observacao: 'De acordo.' }).expect(201)).body;
      expect(ap).toMatchObject({ status: 'APROVADO', aprovacao: { por_nome: 'Aurora Autoridade', observacao: 'De acordo.' } });
    });

    it('aprovado: abre o processo; a aprovação da demanda do processo registra o DFD aprovado', async () => {
      const r = (await http().post(`/api/dfds-consolidados/${dfd2}/abrir-processo`).set(bearer(plinio.token)).send({ modalidade: 'DISPENSA_ELETRONICA' }).expect(201)).body;
      const [lic] = await sql(`SELECT demanda_id::text AS demanda_id FROM licitacoes WHERE id = $1`, [r.licitacao.id]);
      expect(lic.demanda_id).toBe(d3); // 1 demanda: o vínculo antigo continua (compatibilidade)
      const et = (await http().get(`/api/fase-interna/${r.licitacao.id}/etapas`).set(bearer(plinio.token)).expect(200)).body;
      expect(et.aprovacao_demanda.registro.por_nome).toMatch(/DFD aprovado por Aurora Autoridade/);
      // desliga de novo (padrão)
      await http().put('/api/fluxo-fase-interna/planejamento').set(bearer(A.token)).send({ aprovacao_dfd: { exigida: false } }).expect(200);
    });
  });

  // ==========================================================================
  describe('5. isolamento entre órgãos', () => {
    it('outro órgão não vê, não altera, não aprova, não baixa o PDF e não abre processo do DFD alheio', async () => {
      await http().get(`/api/dfds-consolidados/${dfd1}`).set(bearer(planejB.token)).expect(404);
      await http().get(`/api/dfds-consolidados/${dfd1}/pdf`).set(bearer(B.token)).expect(404);
      await http().put(`/api/dfds-consolidados/${dfd1}`).set(bearer(planejB.token)).send({ objeto: 'invasão de B' }).expect(403);
      await http().post(`/api/dfds-consolidados/${dfd1}/aprovar`).set(bearer(B.token)).send({}).expect(403);
      await http().post(`/api/dfds-consolidados/${dfd1}/cancelar`).set(bearer(B.token)).send({ motivo: 'invasão de B' }).expect(403);
      await http().post(`/api/dfds-consolidados/${dfd1}/abrir-processo`).set(bearer(planejB.token)).send({ modalidade: 'DISPENSA_ELETRONICA' }).expect(403);
      const listaB = (await http().get('/api/dfds-consolidados').set(bearer(planejB.token)).expect(200)).body;
      expect(listaB.map((f: any) => f.id)).not.toContain(dfd1);
      const centralB = (await http().get('/api/dfds-consolidados/central').set(bearer(B.token)).expect(200)).body;
      expect(centralB.demandas.map((d: any) => d.id)).not.toContain(d1);
      const dispB = (await http().get(`/api/dfds-consolidados/demandas-disponiveis?ano=${ANO}`).set(bearer(planejB.token)).expect(200)).body;
      expect(dispB.map((d: any) => d.id)).toEqual([demandaB]);
      const [f] = await sql(`SELECT objeto, status FROM dfds_consolidados WHERE id = $1`, [dfd1]);
      expect(f.status).toBe('EM_PROCESSO');
      expect(f.objeto).not.toMatch(/invasão/);
    });

    it('demanda de outro órgão no corpo → 403 e nada é criado (sozinha ou misturada)', async () => {
      const antes = (await sql(`SELECT count(*)::int AS n FROM dfds_consolidados`))[0].n;
      await http().post('/api/dfds-consolidados').set(bearer(planejB.token)).send({ demanda_ids: [d3] }).expect(403);
      await http().post('/api/dfds-consolidados').set(bearer(plinio.token)).send({ demanda_ids: [demandaB] }).expect(403);
      await http().post('/api/dfds-consolidados/previa').set(bearer(planejB.token)).send({ demanda_ids: [demandaB, d1] }).expect(403);
      await http().post(`/api/dfds-consolidados/a-partir-de-demanda/${demandaB}`).set(bearer(plinio.token)).expect(403);
      expect((await sql(`SELECT count(*)::int AS n FROM dfds_consolidados`))[0].n).toBe(antes);
    });

    it('anônimo → 401; fornecedor → 403', async () => {
      await http().get('/api/dfds-consolidados').expect(401);
      await http().get(`/api/dfds-consolidados/${dfd1}`).expect(401);
      await http().get('/api/dfds-consolidados').set(bearer(F.token)).expect(403);
      await http().post('/api/dfds-consolidados').set(bearer(F.token)).send({ demanda_ids: [d1] }).expect(403);
      await http().get('/api/fluxo-fase-interna/planejamento').set(bearer(F.token)).expect(403);
    });
  });

  // ==========================================================================
  describe('6. compatibilidade', () => {
    it('"Iniciar contratação" de UMA demanda (rota antiga): DFD de 1 demanda por baixo; só o planejamento', async () => {
      const d = await criarDemanda(B, 'Secretaria B2', 'Cadeiras', [{ categoria: 'MATERIAL', descricao_objeto: 'Cadeira', quantidade_estimada: 4, valor_unitario_estimado: 300 }]);
      await http().patch(`/api/demandas/${d}/enviar`).set(bearer(B.token)).expect(200);
      await http().patch(`/api/demandas/${d}/aprovar`).set(bearer(B.token)).expect(200);
      const semPapel = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.PREGOEIRO, nome: 'Sem papel B' });
      await http().post('/api/licitacoes/a-partir-de-demanda').set(bearer(semPapel.token)).send({ demanda_id: d, modalidade: 'DISPENSA_ELETRONICA' }).expect(403);
      const r = (await http().post('/api/licitacoes/a-partir-de-demanda').set(bearer(planejB.token)).send({ demanda_id: d, modalidade: 'DISPENSA_ELETRONICA' }).expect(201)).body;
      expect(r.demanda_id).toBe(d);
      const [f] = await sql(`SELECT origem, status, licitacao_id::text AS licitacao_id FROM dfds_consolidados f JOIN dfds_consolidados_demandas fd ON fd.dfd_id = f.id WHERE fd.demanda_id = $1`, [d]);
      expect(f).toEqual({ origem: 'DEMANDA_UNICA', status: 'EM_PROCESSO', licitacao_id: r.id });
      expect(await status(d)).toBe('EM_CONTRATACAO');
    });

    it('processo antigo de 1 demanda: a migração de boot grava o vínculo na tabela nova (idempotente)', async () => {
      const dem = await criarDemanda(A, 'Setor Antigo', 'Pedido antigo', [toner(2)]);
      await sql(`UPDATE demandas SET status = 'EM_CONTRATACAO' WHERE id = $1`, [dem]);
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await sql(`UPDATE licitacoes SET demanda_id = $2 WHERE id = $1`, [lic.id, dem]);
      const mig = ctx.app.get(MigracaoDfdBootService);
      await mig.executarMigracao();
      await mig.executarMigracao();
      const linhas = await sql(`SELECT f.origem, f.status, f.licitacao_id::text AS licitacao_id FROM dfds_consolidados f JOIN dfds_consolidados_demandas fd ON fd.dfd_id = f.id WHERE fd.demanda_id = $1`, [dem]);
      expect(linhas).toEqual([{ origem: 'MIGRACAO', status: 'EM_PROCESSO', licitacao_id: lic.id }]);
      await tarefas().aguardarPendentes();
    });
  });

  // ==========================================================================
  describe('7. visibilidade por setor (homologação multiusuário) e rascunho editável', () => {
    let setorCompras: string;
    let carla: UsuarioOrgaoFixture; // Compras (requisitante)
    let rui: UsuarioOrgaoFixture; // Comunicação, colega da Rita (não criou nada)
    let dc: string; // demanda de Compras (Carla)
    let dr: string; // 2ª demanda da Comunicação (Rita)
    let dLegado: string; // demanda antiga, sem setor gravado, da "Comunicação"
    const ids = (lista: any[]) => lista.map((d: any) => d.id);

    beforeAll(async () => {
      [{ id: setorCompras }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'CPR', 'Compras') RETURNING id::text AS id`, [A.id]);
      carla = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Carla Compras' });
      rui = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Rui Comunicação' });
      await sql(`UPDATE usuarios SET setor_id = $2 WHERE id = $1`, [carla.id, setorCompras]);
      await sql(`UPDATE usuarios SET setor_id = $2 WHERE id = $1`, [rui.id, setorCom]);
      dc = await criarDemanda(carla, 'Compras', 'Papel A4 para compras', [{ ...toner(3), valor_unitario_estimado: 1000 }], `${ANO}-03-10`);
      dr = await criarDemanda(rita, 'Comunicação', 'Microfones', [{ ...toner(1), valor_unitario_estimado: 50 }]);
      dLegado = await criarDemanda(A, 'Comunicação', 'Pedido antigo da comunicação', []);
      await sql(`UPDATE demandas SET setor_id = NULL, criado_por_id = NULL WHERE id = $1`, [dLegado]);
    });

    it('requisitante: lista, estatísticas e unidades só do seu setor (e as que criou)', async () => {
      const lr = (await http().get(`/api/demandas?ano=${ANO}`).set(bearer(rita.token)).expect(200)).body;
      expect(ids(lr)).toEqual(expect.arrayContaining([d1, dr, dLegado]));
      for (const outro of [dc, d2, d3, demandaB]) expect(ids(lr)).not.toContain(outro);
      // colega do mesmo setor vê as da Comunicação, mesmo sem ter criado
      const lrui = ids((await http().get(`/api/demandas?ano=${ANO}`).set(bearer(rui.token)).expect(200)).body);
      expect(lrui).toEqual(expect.arrayContaining([d1, dr, dLegado]));
      expect(lrui).not.toContain(dc);
      // quem não tem setor: só as que criou
      const lgil = ids((await http().get(`/api/demandas?ano=${ANO}`).set(bearer(gil.token)).expect(200)).body);
      expect(lgil).toContain(d2);
      expect(lgil).not.toContain(d1);
      expect(lgil).not.toContain(dc);
      // estatísticas no mesmo escopo (sem os valores do órgão inteiro)
      const est = (await http().get(`/api/demandas/estatisticas?ano=${ANO}`).set(bearer(rita.token)).expect(200)).body;
      const soma = lr.reduce((t: number, d: any) => t + (d.itens || []).reduce((s: number, i: any) => s + Number(i.valor_total_estimado || 0), 0), 0);
      expect(est.total).toBe(lr.length);
      expect(est.valorTotal).toBeCloseTo(soma, 2);
      expect(est.porUnidade.map((u: any) => u.unidade)).not.toContain('Compras');
      const un = (await http().get('/api/demandas/unidades').set(bearer(rita.token)).expect(200)).body;
      expect(un).not.toContain('Compras');
      // escopo + quem está logado (a "Nova demanda" já vem com o setor e o responsável)
      expect((await http().get('/api/demandas/escopo').set(bearer(rita.token)).expect(200)).body).toEqual({
        todas: false,
        setor_id: setorCom,
        setor_nome: 'Comunicação',
        usuario: expect.objectContaining({ id: rita.id, nome: 'Rita Comunicação', setor_id: setorCom, setor_nome: 'Comunicação' }),
      });
      expect((await http().get('/api/demandas/escopo').set(bearer(A.token)).expect(200)).body).toMatchObject({ todas: true, usuario: null });
    });

    it('requisitante: demanda de outro setor por id → 404 na leitura e 403 na escrita (nada muda)', async () => {
      await http().get(`/api/demandas/${dc}`).set(bearer(rita.token)).expect(404);
      await http().get(`/api/demandas/${dc}/acompanhamento`).set(bearer(rita.token)).expect(404);
      await http().put(`/api/demandas/${dc}`).set(bearer(rita.token)).send({ observacoes: 'invasão' }).expect(403);
      await http().post(`/api/demandas/${dc}/itens`).set(bearer(rita.token)).send(toner(1)).expect(403);
      await http().patch(`/api/demandas/${dc}/enviar`).set(bearer(rita.token)).expect(403);
      await http().delete(`/api/demandas/${dc}`).set(bearer(rita.token)).expect(403);
      const [item] = await sql(`SELECT id::text AS id FROM itens_demanda WHERE demanda_id = $1 LIMIT 1`, [dc]);
      await http().put(`/api/demandas/itens/${item.id}`).set(bearer(rita.token)).send({ quantidade_estimada: 99 }).expect(403);
      await http().delete(`/api/demandas/itens/${item.id}`).set(bearer(rita.token)).expect(403);
      const [r] = await sql(`SELECT status::text AS status, observacoes FROM demandas WHERE id = $1`, [dc]);
      expect(r).toEqual({ status: 'RASCUNHO', observacoes: 'Justificativa de Compras' });
      const [q] = await sql(`SELECT count(*)::int AS n, max(quantidade_estimada)::int AS q FROM itens_demanda WHERE demanda_id = $1`, [dc]);
      expect(q).toEqual({ n: 1, q: 3 });
      // a própria (e a do colega de setor) continuam abertas
      await http().get(`/api/demandas/${dr}`).set(bearer(rita.token)).expect(200);
      await http().get(`/api/demandas/${dr}`).set(bearer(rui.token)).expect(200);
      await http().get(`/api/demandas/${dLegado}`).set(bearer(rita.token)).expect(200);
    });

    it('aprovador, planejamento e login do órgão veem todas; outro órgão continua sem ver', async () => {
      for (const u of [paula, plinio, A]) {
        const l = ids((await http().get(`/api/demandas?ano=${ANO}`).set(bearer(u.token)).expect(200)).body);
        expect(l).toEqual(expect.arrayContaining([d1, d2, d3, dc, dr, dLegado]));
        expect(l).not.toContain(demandaB);
        await http().get(`/api/demandas/${dc}`).set(bearer(u.token)).expect(200);
        expect((await http().get('/api/demandas/escopo').set(bearer(u.token)).expect(200)).body.todas).toBe(true);
      }
      await http().get(`/api/demandas/${dc}`).set(bearer(planejB.token)).expect(404);
      expect(ids((await http().get(`/api/demandas?ano=${ANO}`).set(bearer(planejB.token)).expect(200)).body)).not.toContain(dc);
    });

    it('rascunho (inclusive devolvido): o PUT troca "para quando", unidade, tipo e responsável — nunca dono/status/vínculos', async () => {
      await http().patch(`/api/demandas/${dc}/enviar`).set(bearer(carla.token)).expect(200);
      await http().patch(`/api/demandas/${dc}/rejeitar`).set(bearer(paula.token)).send({ motivo: 'Corrija a data' }).expect(200);
      await http().patch(`/api/demandas/${dc}/voltar-rascunho`).set(bearer(carla.token)).expect(200);
      const r = (
        await http()
          .put(`/api/demandas/${dc}`)
          .set(bearer(carla.token))
          .send({
            data_desejada_contratacao: `${ANO}-08-15`,
            unidade_requisitante: 'Compras',
            renovacao_contrato: true,
            responsavel_nome: 'Carla Compras',
            responsavel_email: 'carla@camara.test',
            responsavel_telefone: '(77) 99999-0000',
            // ignorados
            status: 'APROVADA',
            orgao_id: B.id,
            criado_por_id: rita.id,
            aprovado_por: 'Forjado',
            pca_id: itemPca,
          })
          .expect(200)
      ).body;
      // data só-dia (sem hora): a tela formata sem fuso
      expect(r.data_desejada_contratacao).toBe(`${ANO}-08-15`);
      const [d] = await sql(
        `SELECT status::text AS status, orgao_id::text AS orgao_id, criado_por_id, aprovado_por, pca_id, setor_id::text AS setor_id, renovacao_contrato,
                responsavel_nome, responsavel_email, to_char(data_desejada_contratacao, 'YYYY-MM-DD') AS data
           FROM demandas WHERE id = $1`,
        [dc],
      );
      expect(d).toEqual({
        status: 'RASCUNHO',
        orgao_id: A.id,
        criado_por_id: carla.id,
        aprovado_por: null,
        pca_id: null,
        setor_id: setorCompras,
        renovacao_contrato: true,
        responsavel_nome: 'Carla Compras',
        responsavel_email: 'carla@camara.test',
        data: `${ANO}-08-15`,
      });
      // o item que herdou a data da demanda acompanha
      const [i] = await sql(`SELECT to_char(data_desejada_contratacao, 'YYYY-MM-DD') AS data FROM itens_demanda WHERE demanda_id = $1`, [dc]);
      expect(i.data).toBe(`${ANO}-08-15`);
      // GET devolve a data só-dia
      expect((await http().get(`/api/demandas/${dc}`).set(bearer(carla.token)).expect(200)).body.data_desejada_contratacao).toBe(`${ANO}-08-15`);
      // data inválida → 400; setor de outro órgão → 400; data vazia → sem data
      await http().put(`/api/demandas/${dc}`).set(bearer(carla.token)).send({ data_desejada_contratacao: 'amanhã' }).expect(400);
      const [{ id: setorB }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'SB', 'Setor B') RETURNING id::text AS id`, [B.id]);
      await http().put(`/api/demandas/${dc}`).set(bearer(carla.token)).send({ setor_id: setorB }).expect(400);
      const semData = (await http().put(`/api/demandas/${dc}`).set(bearer(carla.token)).send({ data_desejada_contratacao: '' }).expect(200)).body;
      expect(semData.data_desejada_contratacao).toBeNull();
      await http().put(`/api/demandas/${dc}`).set(bearer(carla.token)).send({ data_desejada_contratacao: `${ANO}-08-15` }).expect(200);
    });

    it('aprovada: a demanda mostra quem aprovou e quando', async () => {
      await http().patch(`/api/demandas/${dc}/enviar`).set(bearer(carla.token)).expect(200);
      await http().patch(`/api/demandas/${dc}/aprovar`).set(bearer(paula.token)).expect(200);
      const d = (await http().get(`/api/demandas/${dc}`).set(bearer(carla.token)).expect(200)).body;
      expect(d.aprovado_por).toBe('Paula Aprovadora');
      expect(d.data_aprovacao).toBeTruthy();
    });
  });
});
