/**
 * F4a — IA EM TODA ETAPA (docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §2, §7 e
 * entrega T4). "Sempre com IA para fazer e humano revisar". A IA é MOCKADA
 * (nunca chama o OpenRouter).
 *
 *  A. Rascunho ao chegar: modelo com `ia_rascunho` na etapa → rascunho em
 *     segundo plano (origem IA, modelo, disparo automático), idempotente; o
 *     contexto enviado não leva dados pessoais.
 *  B. Não gera: etapa sem `ia_rascunho` (padrão) e IA sem chave.
 *  C. O rascunho não torna a peça pronta; o aceite preenche só seções vazias
 *     (texto humano nunca é sobrescrito); a emissão registra quem revisou
 *     (histórico, rascunho e metadado discreto da peça).
 *  D. Despacho da autoridade (AA) e minuta do parecer (PJ, só o jurídico
 *     aceita; a conclusão nunca é preenchida; a emissão registra a revisão);
 *     controle interno e despacho de envio.
 *  E. Falha da IA não quebra a sincronização: registra, a tela mostra e o
 *     "Gerar com IA" manual funciona.
 *  F. Isolamento: outro órgão 404 (leitura e escrita), fornecedor 403,
 *     anônimo 401, rascunho de outro processo 404.
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
  cumprirEtapasAnteriores,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { IaService } from '../src/ia/ia.service';
import { RascunhoIaService } from '../src/fase-interna/ia-rascunho/rascunho-ia.service';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('F4a — IA em toda etapa: rascunho ao chegar e revisão humana', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let jurista: UsuarioOrgaoFixture;
  let deB: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = async () => {
    await ctx.app.get(TarefasService).aguardarPendentes();
    await ctx.app.get(RascunhoIaService).aguardarPendentes();
    await ctx.app.get(TarefasService).aguardarPendentes();
  };
  const rascunhosDe = async (lic: { id: string }) => {
    await esperar();
    return sql(`SELECT * FROM rascunhos_ia_fase_interna WHERE licitacao_id = $1 ORDER BY created_at`, [lic.id]);
  };
  const tela = async (lic: { id: string }, peca: string, token: string, etapa?: string) =>
    (await http().get(`/api/fase-interna/${lic.id}/rascunho-ia?peca=${peca}${etapa ? `&etapa=${etapa}` : ''}`).set(bearer(token)).expect(200)).body;
  const gerar = (lic: { id: string }, token: string, corpo: Record<string, unknown>) =>
    http().post(`/api/fase-interna/${lic.id}/rascunho-ia/gerar`).set(bearer(token)).send(corpo);
  const aceitar = (lic: { id: string }, id: string, token: string) => http().post(`/api/fase-interna/${lic.id}/rascunho-ia/${id}/aceitar`).set(bearer(token)).send({});
  const logs = (lic: { id: string }, acao: string) =>
    sql(`SELECT acao::text AS acao, descricao, usuario_id::text AS usuario_id, usuario_nome, documento_id::text AS documento_id, dados_depois FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = $2 ORDER BY created_at`, [lic.id, acao]);
  const instrucao = async (lic: { id: string }, token: string) => (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(token)).expect(200)).body;
  const itemDe = (inst: any, tipo: string) => inst.itens.find((i: any) => i.tipo === tipo);
  const papeis = (orgao: OrgaoFixture, u: UsuarioOrgaoFixture, lista: string[]) =>
    http().put(`/api/fase-interna/configuracao/usuarios/${u.id}`).set(bearer(orgao.token)).send({ papeis: lista, setor_id: null }).expect(200);

  // ---- IA mockada ----------------------------------------------------------
  const pedidos: string[] = [];
  let falharIa = false;
  let iaConfigurada = true;
  /** Responde o JSON com as chaves que o prompt pede ("Texto IA de <chave>"). */
  const respostaMock = (usuario: string) => {
    const linha = usuario.split('\n').find((l) => l.startsWith('Responda com um JSON com as chaves')) ?? '';
    const chaves = [...linha.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const o: Record<string, string> = {};
    for (const c of chaves) o[c] = c === 'conclusao_sugerida' ? 'FAVORAVEL_COM_RESSALVAS' : c === 'texto' || c === 'relatorio' || c === 'fundamentacao' || c === 'ressalvas' || c === 'apontamentos' || c === 'conclusao' ? `Texto IA de ${c}.` : `<p>Texto IA de ${c}.</p>`;
    return '```json\n' + JSON.stringify(o) + '\n```';
  };

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    const ia = ctx.app.get(IaService);
    jest.spyOn(ia, 'configurada').mockImplementation(async () => iaConfigurada);
    jest.spyOn(ia, 'gerarRascunhoJson').mockImplementation(async (_sistema: string, usuario: string) => {
      pedidos.push(usuario);
      if (falharIa) throw new Error('OpenRouter fora do ar (mock)');
      return { texto: respostaMock(usuario), modelo: 'mock/ia-e2e' };
    });
    A = await criarOrgao(ctx, { nome: 'Câmara F4a IA' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura F4a (outro órgão)' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
    jurista = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paula Procuradora' });
    deB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.ADMIN, nome: 'Admin do outro órgão' });
    await papeis(A, agente, ['AGENTE_CONTRATACAO', 'REQUISITANTE']);
    await papeis(A, jurista, ['JURIDICO']);
    // O MODELO diz em que etapa a IA prepara o rascunho ao chegar (dado, não código)
    await http().put('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(A.token)).send({ etapas: [{ codigo: 'DFD', ia_rascunho: true }] }).expect(200);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. rascunho ao chegar (modelo com ia_rascunho)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, {
        extras: { pregoeiro_id: agente.id, objeto: 'Aquisição de papel A4 — contato do requisitante fulano@camara.gov.br, CPF 123.456.789-09' },
      });
    });

    it('a etapa do DFD fica disponível → a IA prepara o rascunho em segundo plano (origem IA, modelo, automático)', async () => {
      const rs = await rascunhosDe(lic);
      expect(rs).toHaveLength(1);
      expect(rs[0]).toMatchObject({ peca: 'DFD', etapa: 'DFD', status: 'GERADO', origem_rascunho: 'IA', disparo: 'AUTOMATICO', modelo_ia: 'mock/ia-e2e', orgao_id: A.id });
      expect(rs[0].chave).toBe(`auto:${lic.id}:DFD:DFD`);
      expect(rs[0].secoes).toEqual({ demanda: '<p>Texto IA de demanda.</p>' });
      const t = await tela(lic, 'DFD', agente.token);
      expect(t).toMatchObject({ ia_disponivel: true, peca: 'DFD', etapa: 'DFD', rascunho: { status: 'GERADO', disparo: 'AUTOMATICO', modelo_ia: 'mock/ia-e2e' } });
      expect(t.aviso).toMatch(/revise antes de emitir/);
      expect(t.rascunho.secoes).toEqual([{ id: 'demanda', titulo: '1. Descrição da necessidade', texto: '<p>Texto IA de demanda.</p>', ja_preenchida_na_peca: false }]);
      const [log] = await logs(lic, 'IA_RASCUNHO_GERADO');
      expect(log.descricao).toMatch(/gerado pela IA \(modelo mock\/ia-e2e\) — automático, ao chegar à etapa/);
      expect(log.dados_depois).toMatchObject({ rascunho_id: rs[0].id, disparo: 'AUTOMATICO', modelo_ia: 'mock/ia-e2e' });
    });

    it('o contexto enviado à IA é do processo e sem dados pessoais (e-mail e CPF mascarados)', async () => {
      const meu = pedidos.find((p) => p.includes(lic.numero_processo));
      expect(meu).toBeDefined();
      expect(meu).toContain('Aquisição de papel A4');
      expect(meu).toContain('[e-mail]');
      expect(meu).toContain('[CPF]');
      expect(meu).not.toContain('fulano@camara.gov.br');
      expect(meu).not.toContain('123.456.789-09');
      expect(meu).not.toContain(B.nome);
    });

    it('idempotente: sincronizar de novo não gera outro rascunho', async () => {
      await ctx.app.get(TarefasService).agendar(lic.id);
      await ctx.app.get(TarefasService).agendar(lic.id);
      expect(await rascunhosDe(lic)).toHaveLength(1);
    });

    it('aparece no histórico do processo (etapas)', async () => {
      await esperar();
      const etapas = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(agente.token)).expect(200)).body;
      expect(etapas.historico.some((h: any) => h.acao === 'IA_RASCUNHO_GERADO')).toBe(true);
    });
  });

  // ==========================================================================
  describe('B. não gera com a etapa desligada ou sem IA', () => {
    it('modelo padrão (ia_rascunho desligado): nada é pedido à IA; a tela oferece o botão', async () => {
      const antes = pedidos.length;
      const lic = await criarLicitacao(ctx, B, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect(await rascunhosDe(lic)).toEqual([]);
      expect(pedidos.length).toBe(antes);
      const t = await tela(lic, 'DFD', B.token);
      expect(t).toMatchObject({ ia_disponivel: true, rascunho: null });
    });

    it('IA sem chave: não pede nada ao chegar; a tela explica e o "Gerar com IA" responde 409', async () => {
      iaConfigurada = false;
      try {
        const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
        expect(await rascunhosDe(lic)).toEqual([]);
        const t = await tela(lic, 'DFD', A.token);
        expect(t).toMatchObject({ ia_disponivel: false, rascunho: null });
        expect(t.motivo_indisponivel).toMatch(/não está configurada/);
        expect((await gerar(lic, A.token, { peca: 'DFD' })).status).toBe(409);
      } finally {
        iaConfigurada = true;
      }
    });
  });

  // ==========================================================================
  describe('C. revisão humana: peça não fica pronta, texto humano preservado, revisão registrada', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await esperar();
    });

    it('o rascunho NÃO torna a peça pronta (nem cria a peça); aceitar preenche a seção vazia e a peça fica em elaboração', async () => {
      expect(itemDe(await instrucao(lic, agente.token), 'DFD').status).toBe('PENDENTE');
      const [r] = await rascunhosDe(lic);
      const res = (await aceitar(lic, r.id, agente.token).expect(201)).body;
      expect(res.aceite).toMatchObject({ aplicadas: ['demanda'], mantidas: [] });
      expect(res.rascunho).toMatchObject({ status: 'ACEITO', decidido_por_nome: 'Ana Agente', secoes_aplicadas: ['demanda'] });
      const dfd = (await http().get(`/api/fase-interna/${lic.id}/dfd`).set(bearer(agente.token)).expect(200)).body;
      expect(dfd.secoes.demanda).toBe('<p>Texto IA de demanda.</p>');
      expect(dfd.peca.ia_rascunho).toMatchObject({ modelo_ia: 'mock/ia-e2e', aceito_por_nome: 'Ana Agente', revisado_por_nome: null });
      await esperar();
      expect(itemDe(await instrucao(lic, agente.token), 'DFD').status).toBe('EM_ELABORACAO');
      const etapas = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(agente.token)).expect(200)).body;
      const dfdPasso = etapas.etapas.flatMap((e: any) => e.passos).find((p: any) => p.passo === 'DFD');
      expect(dfdPasso.situacao).toBe('EM_ANDAMENTO');
      const [log] = await logs(lic, 'IA_RASCUNHO_ACEITO');
      expect(log).toMatchObject({ usuario_id: agente.id, usuario_nome: 'Ana Agente' });
      expect(log.descricao).toMatch(/aceito como base por Ana Agente — seções preenchidas: 1\. Descrição da necessidade/);
      // Aceitar de novo: 409
      expect((await aceitar(lic, r.id, agente.token)).status).toBe(409);
    });

    it('gerar a peça a partir do rascunho aceito registra QUEM REVISOU (histórico, rascunho e metadado da peça — fora do texto)', async () => {
      await http().post(`/api/fase-interna/${lic.id}/documentos/DFD/gerar`).set(bearer(agente.token)).expect(201);
      const [log] = await logs(lic, 'IA_REVISADA_POR');
      expect(log).toMatchObject({ usuario_id: agente.id, usuario_nome: 'Ana Agente' });
      expect(log.descricao).toMatch(/gerado a partir do rascunho da IA \(modelo mock\/ia-e2e, gerado em .+\) — revisado por Ana Agente/);
      const [r] = await rascunhosDe(lic);
      expect(r).toMatchObject({ status: 'ACEITO', revisado_por_id: agente.id, revisado_por_nome: 'Ana Agente' });
      const dfd = (await http().get(`/api/fase-interna/${lic.id}/dfd`).set(bearer(agente.token)).expect(200)).body;
      expect(dfd.peca.ia_rascunho).toMatchObject({ revisado_por_nome: 'Ana Agente' });
      const [doc] = await sql(`SELECT descricao FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo = 'DFD' AND versao_atual = true`, [lic.id]);
      expect(doc.descricao).not.toMatch(/rascunho da IA|revisado por|mock\/ia-e2e/i); // o texto oficial não ganha marca
      // gerar de novo a mesma versão não repete o registro
      const etapas = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(agente.token)).expect(200)).body;
      expect(etapas.historico.some((h: any) => h.acao === 'IA_REVISADA_POR' && /Ana Agente/.test(h.descricao))).toBe(true);
    });

    it('texto humano nunca é sobrescrito: ETP com a necessidade escrita pelo servidor', async () => {
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/ETP/secao/necessidade`)
        .set(bearer(agente.token))
        .send({ html: '<p>Necessidade escrita pelo servidor.</p>' })
        .expect(200);
      const g = (await gerar(lic, agente.token, { peca: 'ETP' }).expect(201)).body;
      expect(g.rascunho).toMatchObject({ status: 'GERADO', disparo: 'MANUAL', gerado_por_nome: 'Ana Agente' });
      const necessidade = g.rascunho.secoes.find((s: any) => s.id === 'necessidade');
      expect(necessidade).toMatchObject({ ja_preenchida_na_peca: true });
      expect(g.rascunho.secoes.some((s: any) => s.id === 'estimativa_valor')).toBe(false); // seção do sistema (pesquisa)
      // O prompt levou o que já estava escrito e o DFD pronto
      const ultimo = pedidos[pedidos.length - 1];
      expect(ultimo).toContain('Necessidade escrita pelo servidor');
      const res = (await aceitar(lic, g.rascunho.id, agente.token).expect(201)).body;
      expect(res.aceite.mantidas).toEqual(['necessidade']);
      expect(res.aceite.aplicadas).toContain('solucao');
      const etp = (await http().get(`/api/fase-interna/${lic.id}/etp`).set(bearer(agente.token)).expect(200)).body;
      expect(etp.etp.secoes.necessidade).toBe('<p>Necessidade escrita pelo servidor.</p>');
      expect(etp.etp.secoes.solucao).toBe('<p>Texto IA de solucao.</p>');
      expect(etp.etp.edicoes.solucao).toMatchObject({ origem: 'IA_ACEITA', por_nome: 'Ana Agente' });
      expect(etp.etp.edicoes.necessidade).toMatchObject({ origem: 'USUARIO' });
    });

    it('"Gerar de novo" substitui o anterior; "Descartar" some da tela e fica no histórico', async () => {
      const g1 = (await gerar(lic, agente.token, { peca: 'TR' }).expect(201)).body;
      const g2 = (await gerar(lic, agente.token, { peca: 'TR' }).expect(201)).body;
      expect(g2.rascunho.id).not.toBe(g1.rascunho.id);
      const [antigo] = await sql(`SELECT status FROM rascunhos_ia_fase_interna WHERE id = $1`, [g1.rascunho.id]);
      expect(antigo.status).toBe('SUBSTITUIDO');
      const d = (await http().post(`/api/fase-interna/${lic.id}/rascunho-ia/${g2.rascunho.id}/descartar`).set(bearer(agente.token)).send({}).expect(201)).body;
      expect(d.rascunho).toBeNull();
      expect(await logs(lic, 'IA_RASCUNHO_DESCARTADO')).toHaveLength(1);
      expect((await aceitar(lic, g2.rascunho.id, agente.token)).status).toBe(409);
    });
  });

  // ==========================================================================
  describe('D. despacho da autoridade, minuta do parecer, controle interno e envio', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await esperar();
      // As etapas até o parecer (demanda, ETP/TR, pesquisa, reserva e minutas), na ordem do fluxo
      await cumprirEtapasAnteriores(ctx, lic, 'PARECER');
    });

    it('PJ: minuta para o jurídico — só o papel Jurídico aceita; a conclusão NUNCA é preenchida; a emissão registra quem revisou', async () => {
      const g = (await gerar(lic, agente.token, { peca: 'PJ' }).expect(201)).body;
      expect(g.aviso).toMatch(/MINUTA .* não é parecer/);
      expect(g.rascunho.conclusao_sugerida).toBe('FAVORAVEL_COM_RESSALVAS');
      expect((await aceitar(lic, g.rascunho.id, agente.token)).status).toBe(403);
      const res = (await aceitar(lic, g.rascunho.id, jurista.token).expect(201)).body;
      expect(res.aceite.aplicadas.sort()).toEqual(['fundamentacao', 'ressalvas']);
      const p = (await http().get(`/api/fase-interna/${lic.id}/parecer`).set(bearer(jurista.token)).expect(200)).body;
      expect(p.analise.fundamentacao).toContain('Relatório. Texto IA de relatorio.');
      expect(p.analise.fundamentacao).toContain('Texto IA de fundamentacao.');
      expect(p.analise.ressalvas).toBe('Texto IA de ressalvas.');
      expect(p.analise.conclusao).toBeNull();
      expect(p.parecer).toBeNull(); // nada emitido
      const e = await http().post(`/api/fase-interna/${lic.id}/parecer/emitir`).set(bearer(jurista.token)).send({ conclusao: 'FAVORAVEL_COM_RESSALVAS' });
      expect(e.status).toBe(201);
      const revs = await logs(lic, 'IA_REVISADA_POR');
      const doParecer = revs.find((l: any) => l.dados_depois?.peca === 'PJ');
      expect(doParecer).toMatchObject({ usuario_id: jurista.id, usuario_nome: 'Paula Procuradora' });
      const [doc] = await sql(`SELECT dados_estruturados->'_ia_rascunho' AS meta FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo = 'PJ' AND versao_atual = true`, [lic.id]);
      expect(doc.meta).toMatchObject({ aceito_por_nome: 'Paula Procuradora', revisado_por_nome: 'Paula Procuradora' });
    });

    // Ordem do fluxo (art. 53, §4º): o despacho da autoridade vem DEPOIS do parecer
    it('AA: rascunho cita o art. 72, VIII; aceitar GERA o despacho com o texto revisado (não autoriza nada) e registra a revisão', async () => {
      const g = (await gerar(lic, agente.token, { peca: 'AA' }).expect(201)).body;
      expect(g.rascunho.secoes.map((s: any) => s.id)).toEqual(['autorizacao']);
      expect(pedidos[pedidos.length - 1]).toContain('art. 72, VIII');
      const res = (await aceitar(lic, g.rascunho.id, agente.token).expect(201)).body;
      expect(res.aceite.documento_id).toBeTruthy();
      const aut = (await http().get(`/api/fase-interna/${lic.id}/autorizacao`).set(bearer(agente.token)).expect(200)).body;
      expect(aut.secoes.autorizacao).toContain('Texto IA de autorizacao.');
      expect(aut.situacao).toBe('EM_ELABORACAO'); // só vale assinado pela autoridade
      expect(aut.peca.ia_rascunho).toMatchObject({ revisado_por_nome: 'Ana Agente' });
      expect(itemDe(await instrucao(lic, agente.token), 'AA').status).not.toBe('OK');
      const [rev] = await logs(lic, 'IA_REVISADA_POR');
      expect(rev).toMatchObject({ usuario_id: agente.id, documento_id: res.aceite.documento_id });
    });

    it('MCI: só quem tem o papel Controle interno aceita (os campos vão para o formulário)', async () => {
      const g = (await gerar(lic, agente.token, { peca: 'MCI' }).expect(201)).body;
      expect(g.rascunho.secoes.map((s: any) => s.id)).toEqual(['texto', 'apontamentos']);
      expect((await aceitar(lic, g.rascunho.id, agente.token)).status).toBe(403);
    });

    it('despacho de envio: a IA ajusta a finalidade; o aceite devolve o texto para o formulário', async () => {
      const g = (await gerar(lic, agente.token, { peca: 'TRAMITACAO', destino: 'Contabilidade', finalidade: 'reserva orçamentária', despacho: 'Encaminhe-se ao(à) Contabilidade.' }).expect(201)).body;
      expect(g.rascunho).toMatchObject({ status: 'GERADO' });
      expect(pedidos[pedidos.length - 1]).toContain('Destino do envio: Contabilidade');
      const res = (await aceitar(lic, g.rascunho.id, agente.token).expect(201)).body;
      expect(res.aceite.campos).toMatchObject({ texto: 'Texto IA de texto.' });
      expect((await gerar(lic, agente.token, { peca: 'TRAMITACAO' })).status).toBe(400); // sem destino
      expect((await gerar(lic, agente.token, { peca: 'XYZ' })).status).toBe(400);
    });
  });

  // ==========================================================================
  describe('D2. etapa de registro (despacho "autorizo o início") com rascunho ao chegar', () => {
    it('DFD juntada → a etapa de registro chega, a IA sugere o despacho; registrar a partir dele registra quem revisou', async () => {
      const C = await criarOrgao(ctx, { nome: 'Câmara F4a Registro' });
      const agenteC = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.PREGOEIRO, nome: 'Rui Agente' });
      await papeis(C, agenteC, ['AGENTE_CONTRATACAO', 'REQUISITANTE', 'AUTORIDADE']);
      await http()
        .put('/api/fluxo-fase-interna/modelos/DISPENSA')
        .set(bearer(C.token))
        .send({ etapas: [{ codigo: 'AUTORIZACAO_INICIO', ligada: true, ia_rascunho: true }] })
        .expect(200);
      const lic = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agenteC.id } });
      expect(await rascunhosDe(lic)).toEqual([]); // ainda depende da demanda
      const anexo = await http()
        .post(`/api/fase-interna/${lic.id}/documentos/DFD/anexo`)
        .set(bearer(agenteC.token))
        .field('data_documento', new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10))
        .field('numero_peca', 'DFD 001/2026')
        .attach('arquivo', pdfDeTeste('DFD'), { filename: 'dfd.pdf', contentType: 'application/pdf' });
      expect(anexo.status).toBe(201);
      const rs = await rascunhosDe(lic);
      expect(rs.map((r: any) => [r.peca, r.etapa, r.status])).toEqual([['REGISTRO', 'AUTORIZACAO_INICIO', 'GERADO']]);
      expect(pedidos[pedidos.length - 1]).toContain('AUTORIZA O INÍCIO');
      const t = await tela(lic, 'REGISTRO', agenteC.token, 'AUTORIZACAO_INICIO');
      const res = (await aceitar(lic, t.rascunho.id, agenteC.token).expect(201)).body;
      expect(res.aceite.campos).toMatchObject({ texto: 'Texto IA de texto.' });
      await http().post(`/api/fase-interna/${lic.id}/etapas/AUTORIZACAO_INICIO/concluir`).set(bearer(agenteC.token)).send({ texto: 'Autorizo o início do processo (texto revisado).' }).expect(201);
      const [rev] = await logs(lic, 'IA_REVISADA_POR');
      expect(rev).toMatchObject({ usuario_id: agenteC.id });
      expect(rev.descricao).toMatch(/Despacho da etapa registrado a partir do rascunho da IA/);
    });
  });

  // ==========================================================================
  describe('E. falha da IA não quebra a sincronização', () => {
    it('IA fora do ar: tarefas sincronizam, o rascunho fica FALHOU (histórico) e o "Gerar com IA" manual resolve depois', async () => {
      falharIa = true;
      let lic: LicitacaoFixture;
      try {
        lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
        const [r] = await rascunhosDe(lic);
        expect(r).toMatchObject({ status: 'FALHOU', disparo: 'AUTOMATICO' });
        expect(r.erro).toMatch(/fora do ar/);
      } finally {
        falharIa = false;
      }
      const tarefas = await sql(`SELECT passo, status FROM tarefas WHERE licitacao_id = $1`, [lic!.id]);
      expect(tarefas.some((t: any) => t.passo === 'DFD' && t.status === 'ABERTA')).toBe(true);
      const tramit = await sql(`SELECT posse_inicial FROM tramitacoes_processo WHERE licitacao_id = $1`, [lic!.id]);
      expect(tramit).toHaveLength(1); // a integração da tramitação também rodou
      const t = await tela(lic!, 'DFD', agente.token);
      expect(t.rascunho).toMatchObject({ status: 'FALHOU' });
      expect((await logs(lic!, 'IA_INVOCADA')).some((l: any) => /não foi gerado/.test(l.descricao))).toBe(true);
      const g = (await gerar(lic!, agente.token, { peca: 'DFD' }).expect(201)).body;
      expect(g.rascunho).toMatchObject({ status: 'GERADO', disparo: 'MANUAL' });
      const rs = await rascunhosDe(lic!);
      expect(rs.map((x: any) => x.status)).toEqual(['SUBSTITUIDO', 'GERADO']);
    });
  });

  // ==========================================================================
  describe('F. isolamento', () => {
    let lic: LicitacaoFixture;
    let rascunhoId: string;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      [{ id: rascunhoId }] = await rascunhosDe(lic);
    });

    it('outro órgão: 404 na leitura e na escrita (login do órgão e usuário)', async () => {
      for (const token of [B.token, deB.token]) {
        expect((await http().get(`/api/fase-interna/${lic.id}/rascunho-ia?peca=DFD`).set(bearer(token))).status).toBe(404);
        expect((await gerar(lic, token, { peca: 'DFD' })).status).toBe(404);
        expect((await aceitar(lic, rascunhoId, token)).status).toBe(404);
        expect((await http().post(`/api/fase-interna/${lic.id}/rascunho-ia/${rascunhoId}/descartar`).set(bearer(token)).send({})).status).toBe(404);
      }
      const [r] = await rascunhosDe(lic);
      expect(r.status).toBe('GERADO');
    });

    it('rascunho de outro processo (mesmo órgão) pela rota deste: 404', async () => {
      const outro = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await aceitar(outro, rascunhoId, agente.token)).status).toBe(404);
      expect((await aceitar(outro, 'nao-e-uuid', agente.token)).status).toBe(404);
    });

    it('fornecedor 403, anônimo 401', async () => {
      expect((await http().get(`/api/fase-interna/${lic.id}/rascunho-ia?peca=DFD`).set(bearer(F.token))).status).toBe(403);
      expect((await gerar(lic, F.token, { peca: 'DFD' })).status).toBe(403);
      expect((await http().get(`/api/fase-interna/${lic.id}/rascunho-ia?peca=DFD`)).status).toBe(401);
      expect((await http().post(`/api/fase-interna/${lic.id}/rascunho-ia/${rascunhoId}/aceitar`).send({})).status).toBe(401);
    });
  });
});
