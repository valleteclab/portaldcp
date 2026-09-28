/**
 * CONSTRUTOR DE FLUXO — PR 1: O MOTOR (docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md).
 *
 *  A. API do construtor: tela (ativa + rascunho + conferência + catálogo),
 *     permissões (admin do órgão escreve; usuário lê; outro órgão 404;
 *     fornecedor 403; anônimo 401), rascunho × versão ativa, conferência
 *     pela lei (400 no ativar), histórico de versões, tela antiga sobre o grafo.
 *  B. Processo NOVO segue o grafo: condição por valor (avaliada pelo sistema
 *     ao chegar), etapa criada pelo órgão "Finanças aprova" (conclui por
 *     despacho), devolução à pesquisa e retorno direto a Finanças.
 *  C. Abaixo do limite: Finanças some e a reserva não espera.
 *  D. Processo ANTIGO inalterado (antes da ativação; e o retrato legado
 *     convertido pela migração de boot).
 *  E. Condição manual (modelo pronto): quem conduz responde.
 *  F. Simular ("Testar") sem gravar nada.
 *  G. Montar com IA (IA mockada): vira rascunho, não ativa.
 *  H. Isolamento de cada endpoint novo.
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
import { IaService } from '../src/ia/ia.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe('Construtor de fluxo — motor (PR 1)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let adminA: UsuarioOrgaoFixture;
  let agenteA: UsuarioOrgaoFixture;
  let marta: UsuarioOrgaoFixture; // Finanças
  let comumA: UsuarioOrgaoFixture;
  let adminB: UsuarioOrgaoFixture;
  let setorFinancas: string;
  let licAntigo: LicitacaoFixture;
  let etapasAntigoAntes: any;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = () => ctx.app.get(TarefasService).aguardarPendentes();

  const C = '/api/fluxo-fase-interna/construtor';
  const tela = (token: string, tipo = 'DISPENSA', q = '') => http().get(`${C}/${tipo}${q}`).set(bearer(token));
  const put = (token: string | null, corpo: any, tipo = 'DISPENSA', q = '') => {
    const r = http().put(`${C}/${tipo}/rascunho${q}`);
    return (token ? r.set(bearer(token)) : r).send(corpo);
  };
  const post = (token: string | null, rota: string, corpo: any = {}, tipo = 'DISPENSA', q = '') => {
    const r = http().post(`${C}/${tipo}/${rota}${q}`);
    return (token ? r.set(bearer(token)) : r).send(corpo);
  };
  const etapas = async (lic: { id: string }, token: string) => (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(token)).expect(200)).body;
  const passo = (et: any, codigo: string) => et.etapas.flatMap((e: any) => e.passos).find((p: any) => p.passo === codigo);
  const codigos = (et: any) => et.etapas.flatMap((e: any) => e.passos).map((p: any) => p.passo);
  const anexar = (lic: { id: string }, tipo: string, token: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 00${Math.floor(Math.random() * 9)}/2026`)
      .attach('arquivo', pdfDeTeste(`Peca ${tipo} ${Date.now()}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const devolver = (lic: { id: string }, codigo: string, token: string | null, corpo: any) => {
    const r = http().post(`/api/fase-interna/${lic.id}/etapas/${codigo}/devolver`);
    return (token ? r.set(bearer(token)) : r).send(corpo);
  };
  const concluir = (lic: { id: string }, codigo: string, token: string, corpo: any) => http().post(`/api/fase-interna/${lic.id}/etapas/${codigo}/concluir`).set(bearer(token)).send(corpo);
  const processo = (org: OrgaoFixture, valor: number, agente: UsuarioOrgaoFixture) =>
    criarLicitacao(ctx, org, ModalidadeLicitacao.DISPENSA_ELETRONICA, { itens: [{ descricao: 'Material de expediente', quantidade: 1, valor_unitario_estimado: valor }], extras: { pregoeiro_id: agente.id } });

  /** O desenho do órgão: o do sistema + depois da pesquisa, "valor > R$ 20 mil?" → "Finanças aprova" (setor Finanças), que devolve à pesquisa. */
  const desenhoComFinancas = (base: any) => {
    const g = JSON.parse(JSON.stringify(base));
    const pesquisa = g.nos.find((n: any) => n.codigo === 'PESQUISA').id;
    const reserva = g.nos.find((n: any) => n.codigo === 'RESERVA').id;
    g.arestas = g.arestas.filter((a: any) => !(a.de === pesquisa && a.para === reserva));
    g.nos.push(
      { id: 'q_valor', tipo: 'condicao', nome: 'Valor acima de R$ 20 mil?', x: 900, y: 500, condicao: { campo: 'valor_total_estimado', operador: '>', valor: 20000 } },
      { id: 'fin', tipo: 'aprovacao', nome: 'Finanças aprova', x: 1100, y: 500, pecas: [], responsavel: { setor_id: setorFinancas }, prazo_dias_uteis: 2 },
    );
    g.arestas.push(
      { id: 'x1', de: pesquisa, para: 'q_valor', rotulo: 'normal' },
      { id: 'x2', de: 'q_valor', para: 'fin', rotulo: 'sim' },
      { id: 'x3', de: 'q_valor', para: reserva, rotulo: 'não' },
      { id: 'x4', de: 'fin', para: reserva, rotulo: 'normal' },
      { id: 'x5', de: 'fin', para: pesquisa, rotulo: 'devolve' },
    );
    return g;
  };

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Construtor A' });
    B = await criarOrgao(ctx, { nome: 'Câmara Construtor B' });
    F = await criarFornecedor(ctx);
    adminA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Adm A' });
    agenteA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
    marta = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Marta Finanças' });
    comumA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Comum A' });
    adminB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.ADMIN, nome: 'Adm B' });
    setorFinancas = (await http().post(`/api/orgaos/${A.id}/setores`).set(bearer(A.token)).send({ nome: 'Finanças' }).expect(201)).body.id;
    await sql(`UPDATE usuarios SET setor_id = $2, papeis_fase_interna = '["CONTABILIDADE"]'::jsonb WHERE id = $1`, [marta.id, setorFinancas]);
    await sql(`UPDATE usuarios SET papeis_fase_interna = '["AGENTE_CONTRATACAO","REQUISITANTE","COMPRAS"]'::jsonb WHERE id = $1`, [agenteA.id]);
    // Processo que nasce ANTES da ativação do desenho novo
    licAntigo = await processo(A, 30000, agenteA);
    expect((await anexar(licAntigo, 'DFD', agenteA.token)).status).toBe(201);
    expect((await anexar(licAntigo, 'PP', agenteA.token)).status).toBe(201);
    etapasAntigoAntes = await etapas(licAntigo, agenteA.token);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. API do construtor: rascunho × versão ativa, conferência e versões', () => {
    it('tela: o órgão sem modelo próprio vê o do sistema como grafo (início, fim, etapas), conferido e com o catálogo', async () => {
      const t = (await tela(comumA.token).expect(200)).body;
      expect(t).toMatchObject({ tipo: 'DISPENSA', sistema: false, proprio: false, rascunho: null, conferencia: { ok: true, erros: [] } });
      expect(t.ativo.grafo.nos.filter((n: any) => n.tipo === 'inicio')).toHaveLength(1);
      expect(t.ativo.grafo.nos.some((n: any) => n.codigo === 'DFD' && n.tipo === 'etapa')).toBe(true);
      expect(t.ativo.grafo.nos.find((n: any) => n.codigo === 'PARECER').tipo).toBe('aprovacao');
      expect(t.ativo.grafo.arestas.some((a: any) => a.de === 'PARECER' && a.rotulo === 'devolve')).toBe(true);
      expect(t.catalogo.etapas.find((e: any) => e.codigo === 'PESQUISA')).toMatchObject({ pecas: ['PP', 'MCP'] });
      expect(t.catalogo.campos_condicao.map((c: any) => c.campo)).toEqual(['manual', 'valor_total_estimado', 'tipo_contratacao', 'modalidade', 'fundamento_legal']);
      expect(t.modelos_prontos.map((m: any) => m.codigo)).toEqual(['CAMARA_PORTARIA_089', 'CAMARA_089_CONTROLE_INTERNO', 'PREFEITURA_FINANCAS_VALOR']);
      expect(t.conferencia.lei.length).toBeGreaterThan(5);
      expect(t.conferencia.lei.every((x: any) => x.ok)).toBe(true);
      expect(t.setores).toEqual([{ id: setorFinancas, nome: 'Finanças' }]);
      expect((await tela(comumA.token, 'QUALQUER')).status).toBe(400);
    });

    it('escrita só do administrador do órgão (usuário 403, fornecedor 403, anônimo 401); leitura de outro órgão 404', async () => {
      const t = (await tela(adminA.token).expect(200)).body;
      expect((await put(agenteA.token, { grafo: t.ativo.grafo })).status).toBe(403);
      expect((await put(F.token, { grafo: t.ativo.grafo })).status).toBe(403);
      expect((await put(null, { grafo: t.ativo.grafo })).status).toBe(401);
      expect((await post(agenteA.token, 'ativar')).status).toBe(403);
      expect((await tela(adminB.token, 'DISPENSA', `?orgao_id=${A.id}`)).status).toBe(404);
      expect((await tela(F.token)).status).toBe(403);
      expect((await tela(A.token, 'DISPENSA', '?sistema=true')).status).toBe(403);
      expect((await tela(ctx.tokenAdmin(), 'DISPENSA', '?sistema=true').expect(200)).body).toMatchObject({ sistema: true });
    });

    it('rascunho: salva o desenho com a etapa criada e a condição; a versão ativa NÃO muda', async () => {
      const t = (await tela(adminA.token).expect(200)).body;
      const r = (await put(adminA.token, { grafo: desenhoComFinancas(t.ativo.grafo) }).expect(200)).body;
      expect(r.proprio).toBe(false);
      expect(r.ativo.versao).toBe(t.ativo.versao);
      expect(r.rascunho).toMatchObject({ origem: 'EDICAO', atualizado_por_nome: 'Adm A', desatualizado: false });
      const fin = r.rascunho.grafo.nos.find((n: any) => n.id === 'fin');
      expect(fin).toMatchObject({ codigo: 'U_FIN', tipo: 'aprovacao', pecas: [], conclusao: 'REGISTRO', responsavel: { setor_id: setorFinancas } });
      expect(r.rascunho.grafo.nos.find((n: any) => n.id === 'q_valor')).toMatchObject({ codigo: 'C_Q_VALOR', condicao: { campo: 'valor_total_estimado', operador: '>', valor: 20000 } });
      expect(r.rascunho.grafo.arestas.find((a: any) => a.id === 'x3').rotulo).toBe('nao');
      expect(r.conferencia).toMatchObject({ ok: true, erros: [] });
      // Quem só lê também vê o rascunho (mesmo órgão)
      expect((await tela(comumA.token).expect(200)).body.rascunho.grafo.nos.some((n: any) => n.id === 'fin')).toBe(true);
    });

    it('conferir (sem gravar): tirar a autorização → erro com o artigo; nada muda no rascunho', async () => {
      const t = (await tela(adminA.token).expect(200)).body;
      const g = JSON.parse(JSON.stringify(t.rascunho.grafo));
      const aut = g.nos.find((n: any) => n.codigo === 'AUTORIZACAO').id;
      g.nos = g.nos.filter((n: any) => n.id !== aut);
      g.arestas = g.arestas.filter((a: any) => a.de !== aut && a.para !== aut);
      const c = (await post(comumA.token, 'conferir', { grafo: g }).expect(201)).body;
      expect(c.ok).toBe(false);
      expect(c.erros).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'RL-CD-AUTORIZACAO', fundamento: 'art. 72, VIII' })]));
      expect(c.lei.find((x: any) => x.codigo === 'RL-CD-AUTORIZACAO').ok).toBe(false);
      expect((await tela(adminA.token).expect(200)).body.rascunho.grafo.nos.some((n: any) => n.codigo === 'AUTORIZACAO')).toBe(true);
    });

    it('ativar um rascunho que não confere: 400 com os erros; a versão ativa continua', async () => {
      const t = (await tela(adminA.token).expect(200)).body;
      const valido = t.rascunho.grafo;
      const g = JSON.parse(JSON.stringify(valido));
      g.nos.find((n: any) => n.id === 'fin').responsavel = null; // etapa criada sem quem faz
      expect((await put(adminA.token, { grafo: g }).expect(200)).body.conferencia.ok).toBe(false);
      const r = await post(adminA.token, 'ativar');
      expect(r.status).toBe(400);
      expect(r.body.erros).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'GRAFO_SEM_RESPONSAVEL' })]));
      expect((await tela(adminA.token).expect(200)).body.proprio).toBe(false);
      await put(adminA.token, { grafo: valido }).expect(200);
    });

    it('ativar: nova versão do órgão, com quem ativou; o rascunho sai; histórico de versões', async () => {
      const r = (await post(adminA.token, 'ativar').expect(201)).body;
      expect(r).toMatchObject({ proprio: true, rascunho: null, ativado: { versao: 1 }, ativo: { versao: 1, ativado_por_nome: 'Adm A' } });
      expect(r.ativo.grafo.nos.some((n: any) => n.codigo === 'U_FIN')).toBe(true);
      const v = (await http().get(`${C}/DISPENSA/versoes`).set(bearer(comumA.token)).expect(200)).body;
      expect(v).toEqual([expect.objectContaining({ versao: 1, origem: 'CONSTRUTOR', ativado_por_nome: 'Adm A', ativa: true })]);
      const v1 = (await http().get(`${C}/DISPENSA/versoes/1`).set(bearer(comumA.token)).expect(200)).body;
      expect(v1.grafo.nos.some((n: any) => n.codigo === 'C_Q_VALOR')).toBe(true);
      expect((await http().get(`${C}/DISPENSA/versoes/99`).set(bearer(comumA.token))).status).toBe(404);
      expect((await post(adminA.token, 'ativar')).status).toBe(409); // sem rascunho
    });

    it('tela antiga sobre o grafo: lista as etapas criadas e a condição; editar o prazo de "Finanças aprova" grava nova versão sem perder o desenho', async () => {
      const m = (await http().get('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(adminA.token)).expect(200)).body;
      expect(m.modelo.etapas.find((e: any) => e.codigo === 'U_FIN')).toMatchObject({ conclusao: 'REGISTRO', depende_de: ['C_Q_VALOR'], ramos: { C_Q_VALOR: 'sim' } });
      expect(m.modelo.etapas.find((e: any) => e.codigo === 'C_Q_VALOR')).toMatchObject({ conclusao: 'CONDICAO', depende_de: ['PESQUISA'] });
      expect(m.validacao.ok).toBe(true);
      const r = (await http().put('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(adminA.token)).send({ etapas: [{ codigo: 'U_FIN', prazo_dias_uteis: 4 }] }).expect(200)).body;
      expect(r.modelo.versao).toBe(2);
      expect(r.modelo.etapas.find((e: any) => e.codigo === 'U_FIN')).toMatchObject({ prazo_dias_uteis: 4, ramos: { C_Q_VALOR: 'sim' } });
      const v = (await http().get(`${C}/DISPENSA/versoes`).set(bearer(adminA.token)).expect(200)).body;
      expect(v.map((x: any) => [x.versao, x.origem])).toEqual([
        [2, 'TELA_ANTIGA'],
        [1, 'CONSTRUTOR'],
      ]);
    });
  });

  // ==========================================================================
  describe('B. processo novo segue o grafo: condição por valor, "Finanças aprova", devolução e retorno', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await processo(A, 30000, agenteA);
      expect((await anexar(lic, 'DFD', agenteA.token)).status).toBe(201);
    });

    it('antes da pesquisa: a condição e Finanças aguardam; o retrato do processo tem o grafo da versão ativa', async () => {
      const et = await etapas(lic, agenteA.token);
      expect(et.modelo.versao).toBe(2);
      expect(passo(et, 'C_Q_VALOR')).toMatchObject({ situacao: 'AGUARDANDO', tipo_no: 'condicao', decisao: null });
      expect(passo(et, 'U_FIN')).toMatchObject({ situacao: 'AGUARDANDO', tipo_no: 'aprovacao', conclusao: 'REGISTRO' });
      const [f] = await sql(`SELECT snapshot FROM fluxos_processo_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      expect(f.snapshot.grafo.nos.some((n: any) => n.codigo === 'U_FIN')).toBe(true);
    });

    it('pesquisa pronta: o sistema avalia "valor > R$ 20 mil" (R$ 30 mil → sim), grava a resposta e o histórico; Finanças fica disponível e a reserva espera', async () => {
      expect((await anexar(lic, 'PP', agenteA.token)).status).toBe(201);
      const et = await etapas(lic, agenteA.token);
      expect(passo(et, 'C_Q_VALOR')).toMatchObject({ situacao: 'CONCLUIDO', decisao: { resposta: 'sim', automatica: true } });
      expect(passo(et, 'U_FIN')).toMatchObject({ situacao: 'DISPONIVEL', pode_iniciar: true });
      expect(passo(et, 'RESERVA')).toMatchObject({ situacao: 'AGUARDANDO', pendencias: ['U_FIN'] });
      await esperar();
      const [f] = await sql(`SELECT decisoes FROM fluxos_processo_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      expect(f.decisoes.C_Q_VALOR).toMatchObject({ resposta: 'sim', automatica: true, por_nome: 'Sistema' });
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'CONDICAO_RESPONDIDA'`, [lic.id]);
      expect(log.descricao).toMatch(/Valor acima de R\$ 20 mil\?.*sim.*valor total estimado > R\$ 20\.000,00/);
      const [tarefa] = await sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 AND passo = 'U_FIN' AND status = 'ABERTA'`, [lic.id]);
      expect(tarefa).toBeTruthy();
    });

    it('devolver: validação e permissão (sem motivo 400; para fora do desenho 400; quem não responde 403; outro órgão 403; fornecedor 403; anônimo 401)', async () => {
      expect((await devolver(lic, 'U_FIN', marta.token, {})).status).toBe(400);
      expect((await devolver(lic, 'U_FIN', marta.token, { motivo: 'Refazer a pesquisa com 3 cotações', para: ['DFD'] })).status).toBe(400);
      expect((await devolver(lic, 'U_FIN', comumA.token, { motivo: 'Refazer a pesquisa com 3 cotações' })).status).toBe(403);
      expect((await devolver(lic, 'U_FIN', adminB.token, { motivo: 'Refazer a pesquisa com 3 cotações' })).status).toBe(403);
      expect((await devolver(lic, 'U_FIN', F.token, { motivo: 'Refazer a pesquisa com 3 cotações' })).status).toBe(403);
      expect((await devolver(lic, 'U_FIN', null, { motivo: 'Refazer a pesquisa com 3 cotações' })).status).toBe(401);
      expect((await devolver(lic, 'RESERVA', agenteA.token, { motivo: 'Refazer a pesquisa com 3 cotações' })).status).toBe(409); // não é aprovação
    });

    it('Finanças (Marta) devolve à pesquisa: a pesquisa reabre, Finanças espera, o despacho vai aos autos', async () => {
      const r = await devolver(lic, 'U_FIN', marta.token, { motivo: 'Refazer a pesquisa com 3 cotações' });
      expect(r.status).toBe(201);
      expect(passo(r.body, 'PESQUISA')).toMatchObject({ situacao: 'EM_ANDAMENTO', retorno: { de: 'U_FIN', motivo: 'Refazer a pesquisa com 3 cotações', por_nome: 'Marta Finanças' } });
      expect(passo(r.body, 'U_FIN')).toMatchObject({ situacao: 'AGUARDANDO', pendencias: ['PESQUISA'] });
      expect(passo(r.body, 'C_Q_VALOR')).toMatchObject({ situacao: 'CONCLUIDO' }); // não é refeita
      expect((await concluir(lic, 'U_FIN', marta.token, { texto: 'Aprovo a despesa estimada.' })).status).toBe(409);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'ETAPA_DEVOLVIDA'`, [lic.id]);
      expect(log.descricao).toMatch(/devolvida por Marta Finanças a Pesquisa de preços e mapa: Refazer a pesquisa com 3 cotações — ao concluir, volta direto/);
      const [d] = await sql(`SELECT texto FROM despachos_fase_interna WHERE licitacao_id = $1 AND etapa = 'U_FIN'`, [lic.id]);
      expect(d.texto).toMatch(/^Devolva-se a Pesquisa de preços e mapa para correção/);
    });

    it('pesquisa refeita: o processo volta DIRETO para Finanças (a condição não é refeita); Finanças aprova por despacho; a reserva abre; a devolução se encerra', async () => {
      expect((await anexar(lic, 'PP', agenteA.token)).status).toBe(201);
      const et = await etapas(lic, agenteA.token);
      expect(passo(et, 'PESQUISA').situacao).toBe('CONCLUIDO');
      expect(passo(et, 'U_FIN')).toMatchObject({ situacao: 'DISPONIVEL', pendencias: [] });
      expect(passo(et, 'RESERVA').situacao).toBe('AGUARDANDO');
      expect((await concluir(lic, 'U_FIN', comumA.token, { texto: 'Aprovo a despesa estimada.' })).status).toBe(403);
      const r = await concluir(lic, 'U_FIN', marta.token, { texto: 'Aprovo a despesa estimada.' });
      expect(r.status).toBe(201);
      expect(passo(r.body, 'U_FIN')).toMatchObject({ situacao: 'CONCLUIDO', registro: { texto: 'Aprovo a despesa estimada.', por_nome: 'Marta Finanças' } });
      expect(passo(r.body, 'RESERVA')).toMatchObject({ situacao: 'DISPONIVEL', pendencias: [] });
      await esperar();
      const [f] = await sql(`SELECT retornos, decisoes FROM fluxos_processo_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      expect(f.retornos).toEqual({});
      expect(Object.keys(f.decisoes)).toEqual(['C_Q_VALOR']);
    });
  });

  // ==========================================================================
  describe('C. abaixo do limite', () => {
    it('R$ 5 mil: a condição responde "não"; Finanças sai do processo e a reserva não espera', async () => {
      const lic = await processo(A, 5000, agenteA);
      for (const t of ['DFD', 'PP']) expect((await anexar(lic, t, agenteA.token)).status).toBe(201);
      const et = await etapas(lic, agenteA.token);
      expect(passo(et, 'C_Q_VALOR')).toMatchObject({ situacao: 'CONCLUIDO', decisao: { resposta: 'nao' } });
      expect(codigos(et)).not.toContain('U_FIN');
      expect(passo(et, 'RESERVA')).toMatchObject({ situacao: 'DISPONIVEL', pendencias: [] });
    });
  });

  // ==========================================================================
  describe('D. processo antigo inalterado', () => {
    it('o processo que nasceu antes da ativação continua com o caminho dele (sem Finanças nem condição)', async () => {
      const depois = await etapas(licAntigo, agenteA.token);
      expect(codigos(depois)).toEqual(codigos(etapasAntigoAntes));
      expect(codigos(depois)).not.toContain('U_FIN');
      const situacoes = (et: any) => et.etapas.flatMap((e: any) => e.passos).map((p: any) => [p.passo, p.situacao, p.pendencias]);
      expect(situacoes(depois)).toEqual(situacoes(etapasAntigoAntes));
      expect(depois.modelo).toMatchObject({ versao: etapasAntigoAntes.modelo.versao, nome: 'Câmara — Portaria 089' });
    });

    it('retrato LEGADO (sem grafo): a migração de boot acrescenta o grafo equivalente sem tocar as etapas; é idempotente', async () => {
      const lic = await processo(B, 1000, adminB);
      expect((await anexar(lic, 'DFD', B.token)).status).toBe(201);
      await esperar();
      // Como era antes do construtor: sem grafo e sem os campos novos nas etapas
      await sql(
        `UPDATE fluxos_processo_fase_interna
            SET snapshot = (snapshot - 'grafo') || jsonb_build_object('etapas',
              (SELECT jsonb_agg(e - 'no_id' - 'tipo_no' - 'raiz' - 'devolve_para' - 'ramos' - 'condicao') FROM jsonb_array_elements(snapshot->'etapas') e))
          WHERE licitacao_id = $1`,
        [lic.id],
      );
      const antes = await etapas(lic, B.token);
      const [s0] = await sql(`SELECT snapshot->'etapas' AS etapas FROM fluxos_processo_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      const r = await ctx.app.get(ModeloFluxoService).migrarParaGrafo();
      expect(r.retratos_convertidos).toBeGreaterThanOrEqual(1);
      const [s1] = await sql(`SELECT snapshot->'etapas' AS etapas, snapshot->'grafo' AS grafo FROM fluxos_processo_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      expect(s1.etapas).toEqual(s0.etapas);
      expect(s1.grafo.nos.filter((n: any) => n.tipo === 'inicio')).toHaveLength(1);
      const depois = await etapas(lic, B.token);
      const semNovos = (et: any) => JSON.parse(JSON.stringify(et.etapas, (k, v) => (['tipo_no', 'decisao', 'retorno', 'tarefa', 'prazo'].includes(k) ? undefined : v)));
      expect(semNovos(depois)).toEqual(semNovos(antes));
      expect((await ctx.app.get(ModeloFluxoService).migrarParaGrafo()).retratos_convertidos).toBe(0);
    });
  });

  // ==========================================================================
  describe('E. condição manual (a partir do modelo pronto)', () => {
    let lic: LicitacaoFixture;

    it('modelo pronto "Prefeitura" no rascunho; condição trocada para manual; ativar (versão 3)', async () => {
      const r = (await post(adminA.token, 'modelos-prontos/PREFEITURA_FINANCAS_VALOR').expect(201)).body;
      expect(r.rascunho).toMatchObject({ origem: 'MODELO_PRONTO:PREFEITURA_FINANCAS_VALOR', nome: 'Prefeitura — Finanças aprova acima de R$ 50 mil' });
      const g = r.rascunho.grafo;
      g.nos.find((n: any) => n.codigo === 'C_VALOR_FINANCAS').condicao = { campo: 'manual' };
      g.nos.find((n: any) => n.codigo === 'U_FINANCAS').responsavel = { setor_id: setorFinancas };
      await put(adminA.token, { grafo: g }).expect(200);
      expect((await post(adminA.token, 'ativar').expect(201)).body.ativo.versao).toBe(3);
      expect((await post(adminA.token, 'modelos-prontos/NAO_EXISTE')).status).toBe(404);
      expect((await post(agenteA.token, 'modelos-prontos/CAMARA_PORTARIA_089')).status).toBe(403);
    });

    it('a pergunta chega a quem conduz: responde "não" (histórico) → Finanças sai e a reserva abre; responder de novo 409', async () => {
      lic = await processo(A, 90000 / 10, agenteA);
      for (const t of ['DFD', 'PP']) expect((await anexar(lic, t, agenteA.token)).status).toBe(201);
      const et = await etapas(lic, agenteA.token);
      expect(passo(et, 'C_VALOR_FINANCAS')).toMatchObject({ situacao: 'DISPONIVEL', decisao: null });
      expect(passo(et, 'RESERVA').situacao).toBe('AGUARDANDO');
      expect((await concluir(lic, 'C_VALOR_FINANCAS', agenteA.token, { resposta: 'talvez' })).status).toBe(400);
      expect((await concluir(lic, 'C_VALOR_FINANCAS', comumA.token, { resposta: 'nao' })).status).toBe(403);
      const r = await concluir(lic, 'C_VALOR_FINANCAS', agenteA.token, { resposta: 'não', texto: 'Despesa já prevista no orçamento da pasta.' });
      expect(r.status).toBe(201);
      expect(passo(r.body, 'C_VALOR_FINANCAS')).toMatchObject({ situacao: 'CONCLUIDO', decisao: { resposta: 'nao', automatica: false, por_nome: 'Ana Agente' } });
      expect(codigos(r.body)).not.toContain('U_FINANCAS');
      expect(passo(r.body, 'RESERVA').situacao).toBe('DISPONIVEL');
      expect((await concluir(lic, 'C_VALOR_FINANCAS', agenteA.token, { resposta: 'sim' })).status).toBe(409);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'CONDICAO_RESPONDIDA'`, [lic.id]);
      expect(log.descricao).toMatch(/respondida por Ana Agente: não — Despesa já prevista/);
    });

    it('voltar a condição desfaz a resposta (motivo obrigatório) e a pergunta volta', async () => {
      const r = await http().post(`/api/fase-interna/${lic.id}/etapas/C_VALOR_FINANCAS/reabrir`).set(bearer(agenteA.token)).send({ motivo: 'Respondida por engano, rever' });
      expect(r.status).toBe(201);
      expect(passo(r.body, 'C_VALOR_FINANCAS')).toMatchObject({ situacao: 'DISPONIVEL', decisao: null });
    });
  });

  // ==========================================================================
  describe('F. simular ("Testar") — a mesma regra, sem gravar', () => {
    it('caminho com condição automática, devolução e retorno; nada gravado', async () => {
      const antes = (await sql(`SELECT COUNT(*)::int AS n FROM tarefas`))[0].n;
      const t = (await tela(adminA.token).expect(200)).body;
      // O desenho sobre o modelo do sistema (o de B, que não tem modelo próprio)
      const g = desenhoComFinancas((await tela(adminB.token).expect(200)).body.ativo.grafo);
      const sim = (corpo: any) => post(comumA.token, 'simular', { grafo: g, dados: { valor_total_estimado: 30000 }, ...corpo }).expect(201);
      let r = (await sim({ acao: { tipo: 'iniciar' } })).body;
      expect(r.ativos.map((a: any) => a.nome)).toEqual(['Formalizar a demanda (DFD)']);
      for (const no of ['DFD', 'PESQUISA']) r = (await sim({ estado: r.estado, acao: { tipo: 'concluir', no } })).body;
      const fin = r.ativos.find((a: any) => a.id === 'fin');
      expect(fin).toMatchObject({ quem: 'Finanças', pode_devolver: true, devolve_para: ['PESQUISA'] });
      expect(r.log.join(' | ')).toMatch(/O sistema avaliou "Valor acima de R\$ 20 mil\?"/);
      r = (await sim({ estado: r.estado, acao: { tipo: 'devolver', no: 'fin' } })).body;
      expect(r.log).toEqual(['Finanças devolveu: Finanças aprova', 'Voltou para Compras: Pesquisa de preços e mapa']);
      r = (await sim({ estado: r.estado, acao: { tipo: 'concluir', no: 'PESQUISA' } })).body;
      expect(r.ativos.map((a: any) => a.id).sort()).toEqual(['ETP', 'TR', 'fin']);
      // Ação inválida: recusada sem mudar o estado
      const e = (await sim({ estado: r.estado, acao: { tipo: 'concluir', no: 'MINUTAS' } })).body;
      expect(e.erro).toMatch(/não está com ninguém/);
      // Desenho com erro de estrutura: não testa
      const quebrado = { ...g, arestas: g.arestas.filter((a: any) => a.id !== 'x3') };
      expect((await post(comumA.token, 'simular', { grafo: quebrado, acao: { tipo: 'iniciar' } }).expect(201)).body.erro).toMatch(/Ajuste o desenho/);
      expect((await post(comumA.token, 'simular', { grafo: g, acao: { tipo: 'concluir', no: 'nao-existe' }, estado: r.estado })).status).toBe(400);
      expect((await sql(`SELECT COUNT(*)::int AS n FROM tarefas`))[0].n).toBe(antes);
      expect((await tela(adminA.token).expect(200)).body.ativo.versao).toBe(t.ativo.versao);
    });
  });

  // ==========================================================================
  describe('G. montar com IA (IA mockada)', () => {
    let pedidos: string[] = [];
    let configurada = true;

    beforeAll(() => {
      const ia = ctx.app.get(IaService);
      jest.spyOn(ia, 'configurada').mockImplementation(async () => configurada);
      jest.spyOn(ia, 'gerarRascunhoJson').mockImplementation(async (sistema: string, usuario: string) => {
        pedidos.push(`${sistema}\n${usuario}`);
        const nos = [
          { id: 'i', tipo: 'inicio', nome: 'Início' },
          { id: 'd', tipo: 'etapa', nome: 'DFD', papel: 'REQUISITANTE', pecas: ['DFD'] },
          { id: 'e', tipo: 'etapa', nome: 'ETP', papel: 'Compras', pecas: ['ETP'] },
          { id: 't', tipo: 'etapa', nome: 'TR', papel: 'COMPRAS', pecas: ['TR'] },
          { id: 'p', tipo: 'etapa', nome: 'Pesquisa', papel: 'COMPRAS', pecas: ['PP'] },
          { id: 'q', tipo: 'condicao', nome: 'Acima de 80 mil?', condicao: { campo: 'valor_total_estimado', operador: '>', valor: 80000 } },
          { id: 'f', tipo: 'aprovacao', nome: 'Secretário de Finanças aprova', setor: 'financas', pecas: [] },
          { id: 'r', tipo: 'etapa', nome: 'Reserva', setor: 'Setor que não existe', pecas: ['DO'] },
          { id: 'm', tipo: 'etapa', nome: 'Minutas', papel: 'AGENTE_CONTRATACAO', pecas: ['RAG'] },
          { id: 'j', tipo: 'aprovacao', nome: 'Parecer', papel: 'JURIDICO', pecas: ['PJ'] },
          { id: 'a', tipo: 'aprovacao', nome: 'Autorização', papel: 'AUTORIDADE', pecas: ['AA'] },
          { id: 'v', tipo: 'etapa', nome: 'Aviso', papel: 'AGENTE_CONTRATACAO', pecas: ['AVISO'] },
          { id: 'z', tipo: 'fim', nome: 'Fim' },
        ];
        const arestas = [
          ['i', 'd'], ['d', 'e'], ['d', 't'], ['d', 'p'], ['p', 'q'], ['q', 'f', 'sim'], ['q', 'r', 'nao'], ['f', 'r'], ['f', 'p', 'devolve'],
          ['e', 'm'], ['t', 'm'], ['r', 'm'], ['m', 'j'], ['j', 'a'], ['j', 'm', 'devolve'], ['a', 'v'], ['v', 'z'],
        ].map(([de, para, rotulo]) => ({ de, para, rotulo }));
        return { texto: '```json\n' + JSON.stringify({ nos, arestas }) + '\n```', modelo: 'mock/ia-construtor' };
      });
    });

    it('a descrição vira RASCUNHO conferido (setor do órgão pelo nome, peças do catálogo, posição automática); a versão ativa não muda', async () => {
      const ativa = (await tela(adminA.token).expect(200)).body.ativo.versao;
      const r = (await post(adminA.token, 'gerar-com-ia', { descricao: 'Na prefeitura, acima de 80 mil o secretário de Finanças aprova antes da reserva.' }).expect(201)).body;
      expect(pedidos[0]).toMatch(/"Finanças"/);
      expect(pedidos[0]).toMatch(/Na prefeitura, acima de 80 mil/);
      expect(r.ia).toMatchObject({ modelo: 'mock/ia-construtor', salvo_no_rascunho: true });
      expect(r.rascunho.origem).toBe('IA');
      const no = (id: string) => r.rascunho.grafo.nos.find((n: any) => n.id === id);
      expect(no('f')).toMatchObject({ codigo: 'U_F', responsavel: { setor_id: setorFinancas } });
      expect(no('e')).toMatchObject({ codigo: 'ETP', responsavel: { papel: 'COMPRAS' } });
      expect(no('r')).toMatchObject({ codigo: 'RESERVA', responsavel: { setor_id: null } });
      expect(no('v')).toMatchObject({ codigo: 'PUBLICACAO' });
      expect(r.ia.ajustes.map((a: any) => a.mensagem).join(' ')).toMatch(/Setor "Setor que não existe" não existe no órgão/);
      expect(r.rascunho.grafo.nos.every((n: any) => n.x >= 40 && n.y >= 40)).toBe(true);
      expect(r.ia.conferencia).toMatchObject({ ok: true, erros: [] });
      expect(r.ativo.versao).toBe(ativa);
      expect(r.proprio).toBe(true);
    });

    it('IA desligada 503; descrição curta 400; quem não administra 403; fornecedor 403', async () => {
      configurada = false;
      expect((await post(adminA.token, 'gerar-com-ia', { descricao: 'Fluxo simples de dispensa com parecer.' })).status).toBe(503);
      configurada = true;
      expect((await post(adminA.token, 'gerar-com-ia', { descricao: 'curta' })).status).toBe(400);
      expect((await post(agenteA.token, 'gerar-com-ia', { descricao: 'Fluxo simples de dispensa com parecer.' })).status).toBe(403);
      expect((await post(F.token, 'gerar-com-ia', { descricao: 'Fluxo simples de dispensa com parecer.' })).status).toBe(403);
    });
  });

  // ==========================================================================
  describe('H. isolamento de cada endpoint novo', () => {
    it('outro órgão não lê nem escreve o modelo de A (404), nem vê o rascunho de A pelo próprio', async () => {
      const q = `?orgao_id=${A.id}`;
      expect((await tela(adminB.token, 'DISPENSA', q)).status).toBe(404);
      expect((await http().get(`${C}/DISPENSA/versoes${q}`).set(bearer(adminB.token))).status).toBe(404);
      expect((await http().get(`${C}/DISPENSA/versoes/1${q}`).set(bearer(adminB.token))).status).toBe(404);
      expect((await post(adminB.token, 'conferir', {}, 'DISPENSA', q)).status).toBe(404);
      expect((await post(adminB.token, 'simular', { acao: { tipo: 'iniciar' } }, 'DISPENSA', q)).status).toBe(404);
      expect((await put(adminB.token, { grafo: { nos: [], arestas: [] } }, 'DISPENSA', q)).status).toBe(404);
      expect((await post(adminB.token, 'ativar', {}, 'DISPENSA', q)).status).toBe(404);
      expect((await post(adminB.token, 'restaurar', {}, 'DISPENSA', q)).status).toBe(404);
      expect((await post(adminB.token, 'modelos-prontos/CAMARA_PORTARIA_089', {}, 'DISPENSA', q)).status).toBe(404);
      expect((await post(adminB.token, 'gerar-com-ia', { descricao: 'Fluxo de outro órgão qualquer.' }, 'DISPENSA', q)).status).toBe(404);
      expect((await http().delete(`${C}/DISPENSA/rascunho${q}`).set(bearer(adminB.token))).status).toBe(404);
      // B pelo próprio token: o modelo DELE (do sistema), sem o rascunho de A
      const deB = (await tela(adminB.token).expect(200)).body;
      expect(deB).toMatchObject({ proprio: false, rascunho: null });
      expect(deB.ativo.grafo.nos.some((n: any) => n.codigo === 'U_FIN')).toBe(false);
      expect((await http().get(`${C}/DISPENSA/versoes`).set(bearer(adminB.token)).expect(200)).body.every((v: any) => v.origem !== 'CONSTRUTOR')).toBe(true);
    });

    it('fornecedor 403 e anônimo 401 em todos; admin da plataforma escolhe o órgão', async () => {
      for (const [metodo, rota] of [
        ['get', 'DISPENSA'],
        ['get', 'DISPENSA/versoes'],
        ['get', 'modelos-prontos'],
        ['post', 'DISPENSA/conferir'],
        ['post', 'DISPENSA/simular'],
        ['post', 'DISPENSA/ativar'],
        ['put', 'DISPENSA/rascunho'],
      ] as const) {
        expect([rota, (await (http() as any)[metodo](`${C}/${rota}`).set(bearer(F.token)).send({})).status]).toEqual([rota, 403]);
        expect([rota, (await (http() as any)[metodo](`${C}/${rota}`).send({})).status]).toEqual([rota, 401]);
      }
      expect((await tela(ctx.tokenAdmin(), 'DISPENSA', `?orgao_id=${A.id}`).expect(200)).body.proprio).toBe(true);
      expect((await tela(ctx.tokenAdmin())).status).toBe(400);
    });

    it('restaurar o padrão vai para o RASCUNHO; descartar o rascunho volta à versão ativa', async () => {
      const r = (await post(adminA.token, 'restaurar').expect(201)).body;
      expect(r.rascunho).toMatchObject({ origem: 'RESTAURAR', nome: 'Câmara — Portaria 089' });
      expect(r.rascunho.grafo.nos.some((n: any) => n.codigo === 'U_FINANCAS')).toBe(false);
      expect(r.ativo.grafo.nos.some((n: any) => n.codigo === 'U_FINANCAS')).toBe(true);
      const d = (await http().delete(`${C}/DISPENSA/rascunho`).set(bearer(adminA.token)).expect(200)).body;
      expect(d.rascunho).toBeNull();
    });
  });
});
