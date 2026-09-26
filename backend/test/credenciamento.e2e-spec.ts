/**
 * ============================================================================
 * E7b — CREDENCIAMENTO COMO PROCESSO (Lei 14.133/2021 arts. 6º XLIII, 78 I,
 * 79 e 74 IV)
 * ============================================================================
 *
 * O credenciamento é uma licitação com modalidade CREDENCIAMENTO: fase
 * interna (instrução do art. 72 + edital), PUBLICAR pela máquina de estados
 * (PNCP pela fila: edital, modalidade 12, amparo art. 78 I), inscrições
 * durante toda a vigência (documentos pela habilitação da E4), deferir /
 * indeferir (recurso — art. 165), contratações pela regra do edital (rodízio,
 * sorteio auditável) com contrato por inexigibilidade (art. 74 IV),
 * descredenciamento/denúncia, fim da vigência pelo relógio e migração do
 * modelo antigo (tabelas credenciamentos/credenciados).
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  anexarEdital,
  criarApp,
  criarFornecedor,
  criarOrgao,
  criarUsuarioOrgao,
  pncpMock,
  prepararInstrucaoContratacaoDireta,
  confirmarDivulgacao,
} from './support';
import { vincularOrgaoAoPncp, jsonDaParteMultipart } from './support/pregao';
import { analisarDocumentoHabilitacao, enviarDocumentosFaltantes, entregarHabilitacao } from './support/habilitacao';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { LicitacoesSchedulerService } from '../src/licitacoes/licitacoes-scheduler.service';
import { migrarCredenciamentosLegados } from '../src/credenciamento/migracao-credenciamento';
import { formatarDataHoraBrasilia } from '../src/pncp/mapeamento-pncp';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const DIA = 86_400_000;

function exigir(r: { status: number; body: any }, status: number, oque: string) {
  if (r.status !== status) throw new Error(`[credenciamento] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
}

describe('E7b — credenciamento como processo', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  let F4: FornecedorFixture;
  let F5: FornecedorFixture;
  let FX: FornecedorFixture; // nunca se inscreve
  let F6: FornecedorFixture;
  let pregoeiroA: { token: string };
  const http = () => ctx.http();

  let cred: any; // visão do órgão
  let itemId: string;
  const insc: Record<string, string> = {};

  /** Cria o credenciamento (fase interna) com as regras do edital. */
  async function criarCredenciamento(orgao: OrgaoFixture, extra: Record<string, any> = {}) {
    const r = await http()
      .post('/api/credenciamento')
      .set(bearer(orgao.token))
      .send({
        numero_processo: `CRED-E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        objeto: 'Credenciamento de clínicas para consultas médicas especializadas',
        tipo_contratacao: 'SERVICO',
        hipotese: 'PARALELA_NAO_EXCLUDENTE',
        regra_distribuicao: 'RODIZIO',
        vigencia_inicio: new Date(Date.now() - 60_000).toISOString(),
        vigencia_fim: new Date(Date.now() + 90 * DIA).toISOString(),
        condicoes_padronizadas: 'Pagamento em até 30 dias do atesto; atendimento em até 5 dias úteis da demanda; valores da tabela do edital.',
        prazo_denuncia_dias: 30,
        itens: [{ descricao: 'Consulta médica especializada', quantidade: 1000, valor_unitario: 150, unidade_medida: 'UNIDADE' }],
        ...extra,
      });
    exigir(r, 201, 'criar credenciamento');
    return r.body;
  }

  const fixture = (c: any, orgao: OrgaoFixture): LicitacaoFixture => ({
    id: c.id,
    numero_processo: c.numero_processo,
    modalidade: ModalidadeLicitacao.CREDENCIAMENTO,
    orgao,
    itens: [],
  });

  /** Instrução do art. 72 + edital + PATCH publicar. */
  /**
   * Publica o edital de chamamento. A divulgação oficial é a do PNCP (arts. 54
   * e 174): o PUBLICAR deixa o credenciamento AGUARDANDO_DIVULGACAO e as
   * inscrições só abrem quando a compra é confirmada (`confirmar: false` para
   * olhar o estado intermediário).
   */
  async function publicar(c: any, orgao: OrgaoFixture, opts: { confirmar?: boolean } = {}) {
    await prepararInstrucaoContratacaoDireta(ctx, fixture(c, orgao));
    await anexarEdital(ctx, fixture(c, orgao), 'Edital de chamamento publico E2E');
    const r = await http().patch(`/api/credenciamento/${c.id}/publicar`).set(bearer(orgao.token)).send({});
    exigir(r, 200, 'publicar credenciamento');
    if (opts.confirmar === false) return r.body;
    await confirmarDivulgacao(ctx, fixture(c, orgao));
    return (await http().get(`/api/credenciamento/${c.id}`).set(bearer(orgao.token)).expect(200)).body;
  }

  async function inscrever(c: { id: string }, f: FornecedorFixture): Promise<string> {
    const r = await http().post(`/api/credenciamento/${c.id}/inscrever`).set(bearer(f.token)).send({});
    exigir(r, 201, `inscrever ${f.razao_social}`);
    return r.body.inscricao.id;
  }

  /** Interessado anexa um PDF por exigência obrigatória e entrega. */
  async function documentarEEntregar(c: { id: string }, f: FornecedorFixture) {
    await enviarDocumentosFaltantes(ctx, c.id, f.token);
    exigir(await entregarHabilitacao(ctx, c.id, f.token), 201, 'entregar documentação');
  }

  /** Órgão marca ATENDE em todos os documentos pendentes da inscrição. */
  async function atenderDocumentos(inscricaoId: string, orgao: OrgaoFixture) {
    const r = await http().get(`/api/credenciamento/inscricoes/${inscricaoId}/habilitacao`).set(bearer(orgao.token));
    exigir(r, 200, 'habilitação da inscrição');
    for (const e of r.body.habilitacao.exigencias) {
      for (const d of e.documentos) {
        if (d.analise === 'PENDENTE') exigir(await analisarDocumentoHabilitacao(ctx, d.id, orgao.token, 'ATENDE'), 201, 'analisar documento');
      }
    }
  }

  async function credenciar(c: { id: string }, f: FornecedorFixture, orgao: OrgaoFixture): Promise<string> {
    const id = await inscrever(c, f);
    await documentarEEntregar(c, f);
    await atenderDocumentos(id, orgao);
    exigir(await http().post(`/api/credenciamento/inscricoes/${id}/deferir`).set(bearer(orgao.token)).send({}), 201, 'deferir');
    return id;
  }

  const contratar = (c: { id: string }, corpo: Record<string, any>, token = A.token) =>
    http().post(`/api/credenciamento/${c.id}/contratacoes`).set(bearer(token)).send(corpo);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Credenciamento E2E (A)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Credenciamento E2E (B)' });
    await vincularOrgaoAoPncp(ctx, A);
    [F1, F2, F3, F4, F5, FX, F6] = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(() => criarFornecedor(ctx, { porte: 'DEMAIS' })));
    pregoeiroA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO });
    pncpMock.limpar();
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. processo: fase interna → publicar (PNCP pela fila)', () => {
    it('cria como licitação CREDENCIAMENTO na fase interna, com as regras do art. 79', async () => {
      cred = await criarCredenciamento(A);
      expect(cred).toMatchObject({ modalidade: 'CREDENCIAMENTO', fase: 'PLANEJAMENTO', situacao: 'ATIVA' });
      expect(cred.configuracao).toMatchObject({ hipotese: 'PARALELA_NAO_EXCLUDENTE', regra_distribuicao: 'RODIZIO', prazo_denuncia_dias: 30 });
      expect(cred.itens).toHaveLength(1);
      expect(cred.itens[0].valor_unitario_estimado).toBe(150);
      itemId = cred.itens[0].id;
      const [l] = await ctx.dataSource.query(`SELECT modalidade::text AS m FROM licitacoes WHERE id = $1`, [cred.id]);
      expect(l.m).toBe('CREDENCIAMENTO');
    });

    it('regra incompatível com a hipótese → 400 (II só admite a escolha do beneficiário)', async () => {
      const r = await http()
        .post('/api/credenciamento')
        .set(bearer(A.token))
        .send({ objeto: 'Credenciamento inválido E2E', hipotese: 'SELECAO_POR_TERCEIROS', regra_distribuicao: 'RODIZIO' });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toMatch(/não se aplica/);
    });

    it('publicar sem a instrução do art. 72 e sem o edital → 400 com as pendências', async () => {
      const r = await http().patch(`/api/credenciamento/${cred.id}/publicar`).set(bearer(A.token)).send({});
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toMatch(/Art\. 72|instrução/i);
    });

    it('publicar com instrução + edital: PUBLICAR → aguarda o PNCP → inscrições abertas (vigência iniciada), histórico pela máquina', async () => {
      const aguardando = await publicar(cred, A, { confirmar: false });
      expect(aguardando.fase).toBe('AGUARDANDO_DIVULGACAO');
      expect(aguardando.inscricoes_abertas).toBeFalsy();
      await confirmarDivulgacao(ctx, fixture(cred, A));
      cred = (await http().get(`/api/credenciamento/${cred.id}`).set(bearer(A.token)).expect(200)).body;
      expect(cred.fase).toBe('ACOLHIMENTO_PROPOSTAS');
      expect(cred.inscricoes_abertas).toBe(true);
      const t = await http().get(`/api/licitacoes/${cred.id}/transicoes`).set(bearer(A.token)).expect(200);
      expect(t.body.map((x: any) => x.ato)).toEqual(expect.arrayContaining(['CRIAR', 'CONCLUIR_FASE_INTERNA', 'PUBLICAR', 'INICIAR_ACOLHIMENTO']));
    });

    it('edital publicado não se altera pelo cadastro (409)', async () => {
      const r = await http().put(`/api/credenciamento/${cred.id}`).set(bearer(A.token)).send({ objeto: 'Mudança depois da publicação' });
      expect(r.status).toBe(409);
    });

    it('PNCP: compra + itens enfileirados; worker envia modalidade 12 (credenciamento), edital, amparo art. 78 I, sem disputa', async () => {
      const f = (await http().get('/api/pncp/fila').query({ licitacaoId: cred.id }).set(bearer(A.token)).expect(200)).body;
      expect(f.map((l: any) => l.tipo)).toEqual(expect.arrayContaining(['COMPRA', 'ITEM']));
      const r = await ctx.processarFilaPncp({ licitacaoId: cred.id });
      expect(r.erros).toBe(0);
      const cnpj = A.cnpj.replace(/\D/g, '');
      const [compra] = pncpMock.filtrar('POST', new RegExp(`/orgaos/${cnpj}/compras$`));
      const dto = jsonDaParteMultipart(compra.corpo, 'compra');
      const [l] = await ctx.dataSource.query(`SELECT data_fim_acolhimento FROM licitacoes WHERE id = $1`, [cred.id]);
      expect(dto).toMatchObject({
        modalidadeId: 12, // Credenciamento
        tipoInstrumentoConvocatorioId: 1, // Edital (de chamamento)
        amparoLegalId: 47, // Lei 14.133/2021, art. 78, I
        modoDisputaId: 5, // não se aplica
        srp: false,
        dataEncerramentoProposta: formatarDataHoraBrasilia(new Date(l.data_fim_acolhimento)), // fim da vigência
      });
      expect(dto.itensCompra[0]).toMatchObject({ criterioJulgamentoId: 7, valorUnitarioEstimado: 150, materialOuServico: 'S' });
    });
  });

  // ==========================================================================
  describe('2. público: só o divulgado', () => {
    let rascunho: any;
    beforeAll(async () => {
      rascunho = await criarCredenciamento(A, { objeto: 'Credenciamento ainda em rascunho E2E' });
    });

    it('lista pública mostra o publicado (inscrições abertas) e não o rascunho', async () => {
      const r = await http().get('/api/credenciamento/publicos').expect(200);
      const ids = r.body.map((x: any) => x.id);
      expect(ids).toContain(cred.id);
      expect(ids).not.toContain(rascunho.id);
      expect(r.body.find((x: any) => x.id === cred.id)).toMatchObject({ inscricoes_abertas: true, regra_distribuicao: 'RODIZIO' });
    });

    it('detalhe público: tabela de valores, edital para download e exigências; rascunho → 404', async () => {
      const r = await http().get(`/api/credenciamento/publicos/${cred.id}`).expect(200);
      expect(r.body.itens[0]).toMatchObject({ valor_unitario: 150 });
      expect(r.body.edital.arquivo_url).toMatch(/\/api\/publicacao\/licitacao\/.+\/edital\/.+\/arquivo/);
      expect(r.body.exigencias.length).toBeGreaterThan(0);
      await http().get(r.body.edital.arquivo_url).expect(200);
      await http().get(`/api/credenciamento/publicos/${rascunho.id}`).expect(404);
    });
  });

  // ==========================================================================
  describe('3. inscrições (habilitação da E4) e isolamento', () => {
    it('fornecedor se inscreve (identidade do token); de novo → 409; órgão não se inscreve', async () => {
      insc.F1 = await inscrever(cred, F1);
      const r = await http().post(`/api/credenciamento/${cred.id}/inscrever`).set(bearer(F1.token)).send({});
      expect(r.status).toBe(409);
      const outro = await http().post(`/api/credenciamento/${cred.id}/inscrever`).set(bearer(F1.token)).send({ fornecedor_id: F2.id });
      expect(outro.status).toBe(403);
      expect((await http().post(`/api/credenciamento/${cred.id}/inscrever`).set(bearer(A.token)).send({})).status).toBe(403);
      const m = await http().get(`/api/credenciamento/${cred.id}/minha-inscricao`).set(bearer(F1.token)).expect(200);
      expect(m.body.inscricao).toMatchObject({ status: 'PENDENTE' });
      expect(m.body.habilitacao).toMatchObject({ origem: 'INSCRICAO', status: 'AGUARDANDO_ENVIO' });
    });

    it('documentos pela habilitação; deferir antes da análise → 409/400', async () => {
      await documentarEEntregar(cred, F1);
      const cedo = await http().post(`/api/credenciamento/inscricoes/${insc.F1}/deferir`).set(bearer(A.token)).send({});
      expect([400, 409]).toContain(cedo.status);
    });

    it('isolamento: órgão B não lê nem decide; fornecedor não usa rotas do órgão; outro fornecedor não vê/recorre a inscrição alheia', async () => {
      expect((await http().get(`/api/credenciamento/${cred.id}`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/credenciamento/inscricoes/${insc.F1}/habilitacao`).set(bearer(B.token))).status).toBe(404);
      expect((await http().post(`/api/credenciamento/inscricoes/${insc.F1}/deferir`).set(bearer(B.token)).send({})).status).toBe(403);
      expect((await contratar(cred, { descricao: 'Demanda do órgão B', itens: [{ item_id: itemId, quantidade: 1 }] }, B.token)).status).toBe(403);
      expect((await http().get(`/api/credenciamento/${cred.id}`).set(bearer(F1.token))).status).toBe(403);
      expect((await http().get(`/api/credenciamento?orgaoId=${A.id}`).set(bearer(B.token)).expect(200)).body.some((x: any) => x.id === cred.id)).toBe(false);
      // F2 (sem inscrição) não vê a de F1 e não recorre por ela
      const m2 = await http().get(`/api/credenciamento/${cred.id}/minha-inscricao`).set(bearer(F2.token)).expect(200);
      expect(m2.body.inscricao).toBeNull();
      expect((await http().post(`/api/credenciamento/inscricoes/${insc.F1}/recurso`).set(bearer(F2.token)).send({ razoes: 'Recurso de terceiro indevido' })).status).toBe(404);
      expect((await http().get(`/api/habilitacao/licitacao/${cred.id}`).set(bearer(F2.token))).status).toBe(403);
      // público não lê a inscrição
      expect((await http().get(`/api/credenciamento/${cred.id}/minha-inscricao`)).status).toBe(401);
    });

    it('deferir (documentos atendidos) → CREDENCIADO com ordem de rodízio e validade = fim da vigência', async () => {
      await atenderDocumentos(insc.F1, A);
      const r = await http().post(`/api/credenciamento/inscricoes/${insc.F1}/deferir`).set(bearer(A.token)).send({ observacao: 'Documentação conforme o edital.' });
      exigir(r, 201, 'deferir F1');
      const i = r.body.inscricoes.find((x: any) => x.id === insc.F1);
      expect(i).toMatchObject({ status: 'CREDENCIADO', ordem_rodizio: 1, apto_a_contratar: true, habilitacao_status: 'HABILITADO' });
      expect(new Date(i.validade_ate).getTime()).toBe(new Date(r.body.configuracao.vigencia_fim).getTime());
      insc.F3 = await credenciar(cred, F3, A);
    });

    it('indeferir exige motivo; indeferido tem 3 dias úteis para recorrer (art. 165 I); recurso provido credencia', async () => {
      insc.F2 = await inscrever(cred, F2);
      exigir(await entregarHabilitacao(ctx, cred.id, F2.token), 201, 'entregar sem documentos');
      expect((await http().post(`/api/credenciamento/inscricoes/${insc.F2}/indeferir`).set(bearer(A.token)).send({ motivo: 'curto' })).status).toBe(400);
      const ind = await http()
        .post(`/api/credenciamento/inscricoes/${insc.F2}/indeferir`)
        .set(bearer(A.token))
        .send({ motivo: 'Não apresentou a documentação de regularidade fiscal exigida no edital.' });
      exigir(ind, 201, 'indeferir F2');
      const i = ind.body.inscricoes.find((x: any) => x.id === insc.F2);
      expect(i).toMatchObject({ status: 'INDEFERIDO', habilitacao_status: 'INABILITADO' });
      expect(i.recurso.prazo_aberto).toBe(true);
      const base = `/api/credenciamento/inscricoes/${insc.F2}/recurso`;
      // sem recurso: nada a reconsiderar; órgão não recorre
      expect((await http().post(`${base}/reconsiderar`).set(bearer(A.token)).send({ reconsiderar: true, fundamentacao: 'Sem recurso ainda para reconsiderar.' })).status).toBe(409);
      expect((await http().post(base).set(bearer(A.token)).send({ razoes: 'x' })).status).toBe(403);
      // razões do próprio interessado, com arquivo (privado)
      const rec = await http()
        .post(base)
        .set(bearer(F2.token))
        .field('razoes', 'A certidão fiscal consta do registro cadastral válido (art. 70) e foi desconsiderada.')
        .attach('arquivo', Buffer.from('%PDF-1.4\n% razoes do recurso\n%%EOF\n'), { filename: 'razoes.pdf', contentType: 'application/pdf' });
      exigir(rec, 201, 'recurso F2');
      expect(rec.body.inscricao.recurso).toMatchObject({ status: 'INTERPOSTO', arquivo: { nome: 'razoes.pdf' } });
      expect(new Date(rec.body.inscricao.recurso.prazo_reconsideracao).getTime()).toBeGreaterThan(Date.now() + DIA); // 3 dias úteis
      expect((await http().post(base).set(bearer(F2.token)).send({ razoes: 'Segundo recurso repetido' })).status).toBe(409);
      // arquivo: órgão dono e o próprio recorrente; outro fornecedor 404; sem login 401
      expect((await http().get(`${base}/arquivo`).set(bearer(F2.token))).status).toBe(200);
      expect((await http().get(`${base}/arquivo`).set(bearer(A.token))).status).toBe(200);
      expect((await http().get(`${base}/arquivo`).set(bearer(F1.token))).status).toBe(404);
      expect((await http().get(`${base}/arquivo`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`${base}/arquivo`)).status).toBe(401);
      // a autoridade só decide depois que o agente mantém (art. 165 §2º)
      expect((await http().post(`${base}/decisao-autoridade`).set(bearer(A.token)).send({ provido: true, fundamentacao: 'Autoridade antes do agente decidir.', nome: 'Prefeita', cargo: 'Prefeita Municipal' })).status).toBe(409);
      expect((await http().post(`${base}/reconsiderar`).set(bearer(A.token)).send({ reconsiderar: false, fundamentacao: 'curta' })).status).toBe(400);
      // agente (pregoeiro) MANTÉM → encaminha à autoridade (10 dias úteis)
      const man = await http()
        .post(`${base}/reconsiderar`)
        .set(bearer(pregoeiroA.token))
        .send({ reconsiderar: false, fundamentacao: 'Mantido: a certidão do cadastro estava vencida na data da análise.' });
      exigir(man, 201, 'agente mantém');
      const im = man.body.inscricoes.find((x: any) => x.id === insc.F2);
      expect(im).toMatchObject({ status: 'INDEFERIDO', recurso: { status: 'AGUARDANDO_AUTORIDADE' } });
      expect(new Date(im.recurso.prazo_autoridade).getTime()).toBeGreaterThan(Date.now() + 9 * DIA);
      // pregoeiro não é a autoridade superior; órgão B também não
      expect((await http().post(`${base}/decisao-autoridade`).set(bearer(pregoeiroA.token)).send({ provido: true, fundamentacao: 'Pregoeiro tentando decidir como autoridade.' })).status).toBe(403);
      expect((await http().post(`${base}/decisao-autoridade`).set(bearer(B.token)).send({ provido: true, fundamentacao: 'Órgão B tentando decidir o recurso.', nome: 'X', cargo: 'Y' })).status).toBe(403);
      expect((await http().post(`${base}/decisao-autoridade`).set(bearer(A.token)).send({ provido: true, fundamentacao: 'Conta do órgão sem identificar a autoridade.' })).status).toBe(400);
      // autoridade superior PROVÊ → credenciado (efeito do provimento)
      const dec = await http()
        .post(`${base}/decisao-autoridade`)
        .set(bearer(A.token))
        .send({ provido: true, fundamentacao: 'Certidão válida no registro cadastral na data do pedido — indeferimento reformado.', nome: 'Maria Prefeita', cargo: 'Prefeita Municipal' });
      exigir(dec, 201, 'decisão da autoridade');
      expect(dec.body.inscricoes.find((x: any) => x.id === insc.F2)).toMatchObject({
        status: 'CREDENCIADO',
        ordem_rodizio: 3,
        habilitacao_status: 'HABILITADO',
        recurso: { status: 'PROVIDO', instancia: 'AUTORIDADE', autoridade: { nome: 'Maria Prefeita', cargo: 'Prefeita Municipal' } },
      });
      const t = await http().get(`/api/licitacoes/${cred.id}/transicoes`).set(bearer(A.token)).expect(200);
      const atos = t.body.filter((x: any) => x.ato === 'DECIDIR_RECURSO_CREDENCIAMENTO').map((x: any) => x.dados?.instancia);
      expect(atos).toEqual(['AGENTE', 'AUTORIDADE']);
    });

    it('agente RECONSIDERA (provido na 1ª instância) → credenciado sem ir à autoridade', async () => {
      const id = await inscrever(cred, F6);
      exigir(await entregarHabilitacao(ctx, cred.id, F6.token), 201, 'entregar');
      exigir(await http().post(`/api/credenciamento/inscricoes/${id}/indeferir`).set(bearer(A.token)).send({ motivo: 'Alvará sanitário não apresentado.' }), 201, 'indeferir F6');
      exigir(await http().post(`/api/credenciamento/inscricoes/${id}/recurso`).set(bearer(F6.token)).send({ razoes: 'O alvará foi enviado no registro cadastral.' }), 201, 'recurso F6');
      const r = await http()
        .post(`/api/credenciamento/inscricoes/${id}/recurso/reconsiderar`)
        .set(bearer(A.token))
        .send({ reconsiderar: true, fundamentacao: 'Reconsiderado: o alvará consta do registro cadastral válido.' });
      exigir(r, 201, 'reconsiderar');
      expect(r.body.inscricoes.find((x: any) => x.id === id)).toMatchObject({ status: 'CREDENCIADO', recurso: { status: 'PROVIDO', instancia: 'AGENTE' } });
      // tira do rodízio para não mudar a ordem esperada nas seções seguintes
      exigir(
        await http().post(`/api/credenciamento/inscricoes/${id}/descredenciar`).set(bearer(A.token)).send({ motivo: 'Retirado para isolar o teste de rodízio.' }),
        201,
        'descredenciar F6',
      );
    });

    it('recurso fora do prazo → 409 (preclusão)', async () => {
      const id = await inscrever(cred, F5);
      exigir(await entregarHabilitacao(ctx, cred.id, F5.token), 201, 'entregar');
      exigir(
        await http().post(`/api/credenciamento/inscricoes/${id}/indeferir`).set(bearer(A.token)).send({ motivo: 'Documentação incompleta conforme o edital.' }),
        201,
        'indeferir F5',
      );
      await ctx.dataSource.query(`UPDATE credenciamento_inscricoes SET recurso_prazo_ate = $2 WHERE id = $1`, [id, new Date(Date.now() - 60_000)]);
      const r = await http().post(`/api/credenciamento/inscricoes/${id}/recurso`).set(bearer(F5.token)).send({ razoes: 'Recurso intempestivo de teste.' });
      expect(r.status).toBe(409);
    });
  });

  // ==========================================================================
  describe('4. contratações pela regra do edital (rodízio) → contrato por inexigibilidade', () => {
    const ordem: string[] = [];

    it('valida a demanda (itens do credenciamento, quantidade > 0)', async () => {
      expect((await contratar(cred, { descricao: 'Demanda sem itens' })).status).toBe(400);
      expect((await contratar(cred, { descricao: 'Demanda inválida', itens: [{ item_id: itemId, quantidade: 0 }] })).status).toBe(400);
      expect((await contratar(cred, { descricao: 'Item de outro processo', itens: [{ item_id: '00000000-0000-4000-8000-000000000000', quantidade: 1 }] })).status).toBe(400);
    });

    it('rodízio na ordem do credenciamento (F1 → F3 → F2), contrato AGUARDANDO_ASSINATURA por inexigibilidade (art. 74 IV)', async () => {
      for (let k = 1; k <= 3; k++) {
        const r = await contratar(cred, { descricao: `Consultas — demanda ${k}`, itens: [{ item_id: itemId, quantidade: 10 }], prazo_execucao_dias: 15 });
        exigir(r, 201, `contratação ${k}`);
        expect(r.body).toMatchObject({ numero: k, regra: 'RODIZIO', status: 'CONTRATO_GERADO', valor_total: 1500 });
        ordem.push(r.body.inscricao_id);
        const [ct] = await ctx.dataSource.query(
          `SELECT licitacao_id::text AS lic, fornecedor_id::text AS forn, modalidade_licitacao, amparo_legal, status::text AS status,
                  valor_global, data_assinatura, (SELECT COUNT(*)::int FROM itens_contrato ic WHERE ic.contrato_id = c.id) AS itens
             FROM contratos c WHERE c.id = $1`,
          [r.body.contrato_id],
        );
        expect(ct).toMatchObject({ lic: cred.id, modalidade_licitacao: 'INEXIGIBILIDADE', status: 'AGUARDANDO_ASSINATURA', data_assinatura: null, itens: 1 });
        expect(ct.amparo_legal).toMatch(/art\. 74, IV/);
        expect(Number(ct.valor_global)).toBe(1500);
      }
      expect(ordem).toEqual([insc.F1, insc.F3, insc.F2]);
      // o registro guarda a fila e o ponteiro do rodízio
      const lista = (await http().get(`/api/credenciamento/${cred.id}/contratacoes`).set(bearer(A.token)).expect(200)).body;
      expect(lista[1].registro).toMatchObject({ ordem_do_ultimo: 1 });
      expect(lista[1].registro.fila.map((x: any) => x.ordem)).toEqual([1, 2, 3]);
    });

    it('inscrição tardia durante a vigência: credenciado depois entra no FIM da fila', async () => {
      insc.F4 = await credenciar(cred, F4, A);
      const r1 = await contratar(cred, { descricao: 'Consultas — demanda 4', itens: [{ item_id: itemId, quantidade: 2 }] });
      exigir(r1, 201, 'contratação 4');
      expect(r1.body.inscricao_id).toBe(insc.F4);
      const r2 = await contratar(cred, { descricao: 'Consultas — demanda 5', itens: [{ item_id: itemId, quantidade: 2 }] });
      expect(r2.body.inscricao_id).toBe(insc.F1); // volta ao início
    });

    it('a contratação é do credenciado: aparece na "minha inscrição" dele e o contrato na lista do processo', async () => {
      const m = await http().get(`/api/credenciamento/${cred.id}/minha-inscricao`).set(bearer(F1.token)).expect(200);
      expect(m.body.contratacoes.map((c: any) => c.numero)).toEqual([1, 5]);
      const p = await http().get(`/api/licitacoes/${cred.id}/processo-completo`).set(bearer(A.token));
      if (p.status === 200) expect((p.body.contratos ?? []).length).toBeGreaterThanOrEqual(5);
    });
  });

  // ==========================================================================
  describe('5. descredenciamento e denúncia (art. 79 par. único VI)', () => {
    it('descredenciar por descumprimento: efeito imediato — sai do rodízio', async () => {
      expect((await http().post(`/api/credenciamento/inscricoes/${insc.F3}/descredenciar`).set(bearer(A.token)).send({ motivo: 'x' })).status).toBe(400);
      const r = await http()
        .post(`/api/credenciamento/inscricoes/${insc.F3}/descredenciar`)
        .set(bearer(A.token))
        .send({ motivo: 'Descumprimento reiterado do prazo de atendimento do edital.' });
      exigir(r, 201, 'descredenciar F3');
      expect(r.body.inscricoes.find((x: any) => x.id === insc.F3)).toMatchObject({ status: 'DESCREDENCIADO', apto_a_contratar: false });
      // último foi F1 (ordem 1); F3 (ordem 2) saiu → próximo é F2 (ordem 3)
      const c = await contratar(cred, { descricao: 'Consultas — demanda 6', itens: [{ item_id: itemId, quantidade: 1 }] });
      expect(c.body.inscricao_id).toBe(insc.F2);
    });

    it('denúncia do credenciado: continua apto durante o aviso prévio; depois sai', async () => {
      const d = await http().post(`/api/credenciamento/inscricoes/${insc.F4}/denunciar`).set(bearer(F4.token)).send({ motivo: 'Encerramento das atividades da clínica.' });
      exigir(d, 201, 'denúncia F4');
      expect(new Date(d.body.inscricao.descredenciamento.efeitos_em).getTime()).toBeGreaterThan(Date.now() + 29 * DIA);
      expect(d.body.inscricao.status).toBe('CREDENCIADO');
      // outro fornecedor não denuncia por ele
      expect((await http().post(`/api/credenciamento/inscricoes/${insc.F4}/denunciar`).set(bearer(F1.token)).send({ motivo: 'Denúncia em nome de outro' })).status).toBe(404);
      const c1 = await contratar(cred, { descricao: 'Consultas — demanda 7', itens: [{ item_id: itemId, quantidade: 1 }] });
      expect(c1.body.inscricao_id).toBe(insc.F4); // aviso prévio correndo
      // o relógio passa do aviso
      await ctx.dataSource.query(`UPDATE credenciamento_inscricoes SET descredenciamento_efeitos_em = $2 WHERE id = $1`, [insc.F4, new Date(Date.now() - 60_000)]);
      const c2 = await contratar(cred, { descricao: 'Consultas — demanda 8', itens: [{ item_id: itemId, quantidade: 1 }] });
      expect(c2.body.inscricao_id).toBe(insc.F1);
      const v = await http().get(`/api/credenciamento/${cred.id}`).set(bearer(A.token)).expect(200);
      expect(v.body.inscricoes.find((x: any) => x.id === insc.F4).status).toBe('DESCREDENCIADO');
    });
  });

  // ==========================================================================
  describe('6. sorteio auditável a cada demanda', () => {
    let s: any;
    let sI1: string;
    let sI2: string;
    let contratacao: any;

    beforeAll(async () => {
      s = await criarCredenciamento(A, { regra_distribuicao: 'SORTEIO', objeto: 'Credenciamento de laboratórios (sorteio) E2E' });
      await publicar(s, A);
      sI1 = await credenciar(s, F1, A);
      sI2 = await credenciar(s, F2, A);
    });

    it('sorteia entre os aptos com entrada pública registrada; confere pelo órgão e pelo credenciado', async () => {
      const item = s.itens[0].id;
      const r = await contratar(s, { descricao: 'Exames — demanda 1', itens: [{ item_id: item, quantidade: 3 }] });
      exigir(r, 201, 'contratar por sorteio');
      contratacao = r.body;
      expect(contratacao.regra).toBe('SORTEIO');
      expect([sI1, sI2]).toContain(contratacao.inscricao_id);
      expect(contratacao.registro.sorteio).toMatchObject({ algoritmo: 'SHA256-FY-v1' });
      expect(contratacao.registro.sorteio.entrada).toContain(`unidade=${contratacao.id}`);
      expect(contratacao.registro.sorteio.ordem[0]).toBe(contratacao.inscricao_id);
      const o = await http().get(`/api/credenciamento/contratacoes/${contratacao.id}/sorteio`).set(bearer(A.token)).expect(200);
      expect(o.body.conferido).toBe(true);
      const f = await http().get(`/api/credenciamento/contratacoes/${contratacao.id}/sorteio`).set(bearer(F2.token)).expect(200);
      expect(f.body.conferido).toBe(true);
      expect(contratacao.status).toBe('CONTRATO_GERADO');
    });

    it('conferência isolada: órgão B e fornecedor não inscrito → 404', async () => {
      expect((await http().get(`/api/credenciamento/contratacoes/${contratacao.id}/sorteio`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/credenciamento/contratacoes/${contratacao.id}/sorteio`).set(bearer(FX.token))).status).toBe(404);
    });
  });

  // ==========================================================================
  describe('6b. revogar com inscritos: manifestação prévia (art. 71 §3º)', () => {
    let r: any;
    beforeAll(async () => {
      r = await criarCredenciamento(A, { objeto: 'Credenciamento a revogar (art. 71 §3º) E2E' });
      await publicar(r, A);
      await credenciar(r, F1, A);
      await inscrever(r, F2); // inscrito ainda em análise também é interessado
    });

    it('com inscritos/credenciados, REVOGAR direto → 400 (exige a intenção + prazo de manifestação)', async () => {
      const x = await http().post(`/api/licitacoes/${r.id}/atos/REVOGAR`).set(bearer(A.token)).send({ motivo: 'Demanda deixou de existir por fato superveniente.' });
      expect(x.status).toBe(400);
      expect(JSON.stringify(x.body)).toMatch(/71, §3º/);
    });

    it('intenção avisa os inscritos; inscrito se manifesta, estranho não; revogar só depois do prazo', async () => {
      const i = await http()
        .post(`/api/publicacao/licitacao/${r.id}/intencao-extincao`)
        .set(bearer(A.token))
        .send({ tipo: 'REVOGAR', motivo: 'Demanda deixou de existir por fato superveniente.', prazo_dias_uteis: 1 });
      exigir(i, 201, 'intenção de revogar');
      expect(i.body.licitantes_notificados).toBe(2);
      exigir(await http().post(`/api/publicacao/licitacao/${r.id}/extincao/manifestacao`).set(bearer(F2.token)).send({ texto: 'Discordo: ainda há demanda na rede.' }), 201, 'manifestação F2');
      expect((await http().post(`/api/publicacao/licitacao/${r.id}/extincao/manifestacao`).set(bearer(FX.token)).send({ texto: 'Não sou interessado.' })).status).toBe(403);
      const cedo = await http().post(`/api/licitacoes/${r.id}/atos/REVOGAR`).set(bearer(A.token)).send({ motivo: 'Demanda deixou de existir por fato superveniente.' });
      expect(cedo.status).toBe(400);
      // o prazo passa (relógio do teste)
      await ctx.dataSource.query(`UPDATE extincoes_licitacao SET prazo_fim = $2 WHERE licitacao_id = $1`, [r.id, new Date(Date.now() - 60_000)]);
      const ok = await http().post(`/api/licitacoes/${r.id}/atos/REVOGAR`).set(bearer(A.token)).send({ motivo: 'Demanda deixou de existir por fato superveniente.' });
      exigir(ok, 201, 'revogar depois do prazo');
      const v = await http().get(`/api/credenciamento/${r.id}`).set(bearer(A.token)).expect(200);
      expect(v.body.situacao).toBe('REVOGADA');
    });
  });

  // ==========================================================================
  describe('7. fim da vigência pelo relógio (job) — sem novas inscrições nem contratações', () => {
    it('ENCERRAR antes do fim da vigência → 400 (encerrar antes = revogar)', async () => {
      const r = await http().patch(`/api/credenciamento/${cred.id}/encerrar`).set(bearer(A.token));
      expect(r.status).toBe(400);
    });

    it('scheduler conclui o credenciamento no fim da vigência e arquiva a inscrição sem decisão', async () => {
      const pendente = await inscrever(cred, FX);
      const passado = new Date(Date.now() - 60_000);
      await ctx.dataSource.query(`UPDATE licitacoes SET data_fim_acolhimento = $2 WHERE id = $1`, [cred.id, passado]);
      await ctx.dataSource.query(`UPDATE credenciamento_configuracoes SET vigencia_fim = $2 WHERE licitacao_id = $1`, [cred.id, passado]);
      await ctx.app.get(LicitacoesSchedulerService).atualizarFasesAutomaticamente();
      const v = await http().get(`/api/credenciamento/${cred.id}`).set(bearer(A.token)).expect(200);
      expect(v.body.situacao).toBe('CONCLUIDA');
      expect(v.body.status).toBe('ENCERRADO');
      expect(v.body.inscricoes.find((x: any) => x.id === pendente).status).toBe('ARQUIVADA');
      const t = await http().get(`/api/licitacoes/${cred.id}/transicoes`).set(bearer(A.token)).expect(200);
      const ultima = t.body[t.body.length - 1];
      expect(ultima).toMatchObject({ ato: 'ENCERRAR_ACOLHIMENTO', situacao_para: 'CONCLUIDA', ator_tipo: 'SISTEMA' });
    });

    it('depois: nova inscrição → 409; contratação → 409; fora da lista pública', async () => {
      expect((await http().post(`/api/credenciamento/${cred.id}/inscrever`).set(bearer(F5.token)).send({})).status).toBe(409);
      expect((await contratar(cred, { descricao: 'Demanda fora da vigência', itens: [{ item_id: itemId, quantidade: 1 }] })).status).toBe(409);
      const pub = await http().get('/api/credenciamento/publicos').expect(200);
      expect(pub.body.some((x: any) => x.id === cred.id)).toBe(false);
    });
  });

  // ==========================================================================
  describe('8. migração do modelo antigo (credenciamentos/credenciados) — idempotente', () => {
    const idCred = '3f0e6a52-8d0b-4c1a-9f7e-7d5c2b1a0e01';
    const idPre = '3f0e6a52-8d0b-4c1a-9f7e-7d5c2b1a0e02';
    const idAprovado = '3f0e6a52-8d0b-4c1a-9f7e-7d5c2b1a0e11';
    const idInscrito = '3f0e6a52-8d0b-4c1a-9f7e-7d5c2b1a0e12';

    beforeAll(async () => {
      const q = (s: string, p: any[] = []) => ctx.dataSource.query(s, p);
      await q(`CREATE TABLE IF NOT EXISTS credenciamentos (
        id uuid PRIMARY KEY, orgao_id uuid NOT NULL, numero_edital varchar, ano int, sequencial int, numero_processo varchar,
        tipo varchar DEFAULT 'CREDENCIAMENTO', status varchar DEFAULT 'RASCUNHO', objeto text, objeto_detalhado text, justificativa text,
        requisitos_habilitacao text, requisitos_tecnicos text, documentos_exigidos text, valor_estimado numeric, forma_pagamento varchar,
        data_publicacao timestamp, data_inicio_inscricoes timestamp, data_fim_inscricoes timestamp, data_resultado timestamp,
        inscricao_permanente boolean DEFAULT false, responsavel_nome varchar, responsavel_cargo varchar, responsavel_email varchar,
        edital_url varchar, anexos_url varchar, amparo_legal varchar, numero_controle_pncp varchar, enviado_pncp boolean DEFAULT false,
        data_envio_pncp timestamp, observacoes text, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now())`);
      await q(`CREATE TABLE IF NOT EXISTS credenciados (
        id uuid PRIMARY KEY, credenciamento_id uuid NOT NULL, fornecedor_id varchar NOT NULL, fornecedor_cnpj varchar, fornecedor_razao_social varchar,
        status varchar DEFAULT 'INSCRITO', data_inscricao timestamp DEFAULT now(), data_analise timestamp, data_aprovacao timestamp,
        data_validade timestamp, analista_nome varchar, parecer text, motivo_reprovacao text, documentos_enviados jsonb, documentos_pendentes jsonb,
        created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now())`);
      await q(
        `INSERT INTO credenciamentos (id, orgao_id, numero_edital, ano, sequencial, numero_processo, tipo, status, objeto, data_publicacao,
                                      data_inicio_inscricoes, data_fim_inscricoes, requisitos_habilitacao)
         VALUES ($1, $2, '7/2025', 2025, 7, $3, 'CREDENCIAMENTO', 'EM_ANDAMENTO', 'Credenciamento legado de fisioterapia', now() - interval '30 days',
                 now() - interval '30 days', now() + interval '300 days', 'Alvará e CNES')`,
        [idCred, A.id, `LEGADO-${Date.now()}`],
      );
      await q(
        `INSERT INTO credenciamentos (id, orgao_id, numero_edital, numero_processo, tipo, status, objeto)
         VALUES ($1, $2, '8/2025', $3, 'PRE_QUALIFICACAO', 'PUBLICADO', 'Pré-qualificação legada')`,
        [idPre, A.id, `LEGADO-PRE-${Date.now()}`],
      );
      await q(
        `INSERT INTO credenciados (id, credenciamento_id, fornecedor_id, fornecedor_cnpj, fornecedor_razao_social, status, data_aprovacao, data_validade, parecer)
         VALUES ($1, $2, $3, $4, $5, 'APROVADO', now() - interval '10 days', now() + interval '355 days', 'Aprovado no modelo antigo')`,
        [idAprovado, idCred, F1.id, F1.cnpj, F1.razao_social],
      );
      await q(
        `INSERT INTO credenciados (id, credenciamento_id, fornecedor_id, fornecedor_cnpj, fornecedor_razao_social, status, documentos_enviados)
         VALUES ($1, $2, $3, $4, $5, 'INSCRITO', '{"alvara":"alvara.pdf"}'::jsonb)`,
        [idInscrito, idCred, F2.id, F2.cnpj, F2.razao_social],
      );
    });

    it('converte em processo (mesmo id), mapeia status e inscritos; pré-qualificação fica no modelo antigo', async () => {
      const r1 = await ctx.dataSource.transaction((m) => migrarCredenciamentosLegados(m));
      expect(r1).toMatchObject({ processos: 1, inscricoes: 2, ignorados: 1 });
      const r2 = await ctx.dataSource.transaction((m) => migrarCredenciamentosLegados(m));
      expect(r2).toMatchObject({ processos: 0, inscricoes: 0 });
      const v = await http().get(`/api/credenciamento/${idCred}`).set(bearer(A.token)).expect(200);
      expect(v.body).toMatchObject({ modalidade: 'CREDENCIAMENTO', fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'ATIVA', numero_edital: '7/2025' });
      expect(v.body.configuracao).toMatchObject({ origem: 'LEGADO', regra_distribuicao: 'RODIZIO' });
      expect(v.body.inscricoes.find((x: any) => x.id === idAprovado)).toMatchObject({ status: 'CREDENCIADO', ordem_rodizio: 1, origem: 'LEGADO' });
      expect(v.body.inscricoes.find((x: any) => x.id === idInscrito)).toMatchObject({ status: 'PENDENTE' });
      expect((await http().get(`/api/credenciamento/${idPre}`).set(bearer(A.token))).status).toBe(404);
      expect((await http().get(`/api/credenciamento/${idCred}`).set(bearer(B.token))).status).toBe(404);
    });

    it('inscrito legado (documentos do modelo antigo) é analisado pelo órgão pela mesma máquina', async () => {
      const r = await http().post(`/api/credenciamento/inscricoes/${idInscrito}/deferir`).set(bearer(A.token)).send({ observacao: 'Alvará conferido (documentos do cadastro antigo).' });
      exigir(r, 201, 'deferir legado');
      expect(r.body.inscricoes.find((x: any) => x.id === idInscrito)).toMatchObject({ status: 'CREDENCIADO', ordem_rodizio: 2 });
    });
  });
});
