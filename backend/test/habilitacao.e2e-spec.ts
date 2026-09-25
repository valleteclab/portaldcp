/**
 * ============================================================================
 * E4 — HABILITAÇÃO REAL, contra o banco real
 * ============================================================================
 *
 * Base legal: Lei 14.133/2021 arts. 62–70 (jurídica, técnica, fiscal/social/
 * trabalhista, econômico-financeira; art. 63 II — documentos só do vencedor,
 * salvo inversão; art. 64 — sem substituição, só complementação em
 * diligência; art. 70 — registro cadastral substitui documentos; art. 17 §1º —
 * inversão de fases); IN SEGES 73/2022 art. 39 (prazo ≥ 2 h prorrogável).
 *
 *  A. Exigências do edital: modelo padrão por objeto, edição na fase interna,
 *     congeladas a partir da publicação; leitura pública.
 *  B. Pregão por item — fluxo completo: registro cadastral pré-preenche (só
 *     documento aprovado e válido; vencido pelo job não conta), envio,
 *     isolamento, entrega sem substituição, análise por documento, diligência
 *     com complementação, habilitar → ADJUDICAR sem pendência de habilitação.
 *  C. Inabilitar → próximo pelos lances convocado para a aceitação; prazo
 *     vencido = documentação entregue; o vencedor final é o habilitado.
 *  D. Inversão de fases (concorrência): documentos com a proposta; habilitação
 *     de todos antes da disputa; só os habilitados disputam; confirmação do
 *     vencedor depois da aceitação.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  levarAteFase,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { aceitarPropostaDaUnidade, painelAceitacao } from './support/julgamento';
import {
  PDF_HABILITACAO,
  analisarDocumentoHabilitacao,
  atenderTodos,
  convocarHabilitacao,
  decidirHabilitacao,
  documentoNoCadastro,
  entregarHabilitacao,
  enviarDocumentoHabilitacao,
  enviarDocumentosFaltantes,
  habilitarLicitante,
  painelHabilitacao,
} from './support/habilitacao';
import { CriterioJulgamento, FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';
import { EtapaSessao } from '../src/sessao/entities/sessao-disputa.entity';
import { VencimentoDocumentosService } from '../src/habilitacao/vencimento-documentos.service';
import { MigracaoHabilitacaoBootService } from '../src/habilitacao/migracao-habilitacao-boot.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const diaMais = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

describe('E4 — habilitação real (arts. 62–70; IN 73 art. 39)', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  const encerrar = async (orgao: OrgaoFixture, sessaoId: string, unidadeId: string) => {
    const r = await http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${unidadeId}`).set(bearer(orgao.token));
    expect(r.status).toBe(201);
  };

  const atos = async (licId: string, token: string) => {
    const r = await http().get(`/api/licitacoes/${licId}/atos`).set(bearer(token));
    expect(r.status).toBe(200);
    return r.body as Array<{ ato: string; pendencias: string[]; disponivel: boolean }>;
  };

  const arquivo = (url: string, token: string) =>
    http()
      .get(url)
      .set(bearer(token))
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });

  // --------------------------------------------------------------------------
  describe('A. exigências do edital: modelo, edição na fase interna, congeladas após a publicação', () => {
    test('modelo padrão pelo objeto; editor valida; público lê; publicação congela', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Exigências E4' });
      const orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura Exigências E4' });
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, { tipo_contratacao: 'SERVICO' as any });

      const pub = await http().get(`/api/habilitacao/licitacao/${lic.id}/exigencias`).expect(200);
      expect(pub.body.modeloPadrao).toBe('SERVICOS');
      expect(pub.body.editavel).toBe(true);
      const categorias = new Set(pub.body.exigencias.map((e: any) => e.categoria));
      expect([...categorias].sort()).toEqual(['ECONOMICO_FINANCEIRA', 'FISCAL', 'JURIDICA', 'SOCIAL_TRABALHISTA', 'TECNICA']);
      const cnd = pub.body.exigencias.find((e: any) => e.tipos_documento_cadastro.includes('CND_RECEITA_FEDERAL_PGFN'));
      expect(cnd).toMatchObject({ categoria: 'FISCAL', aceita_registro_cadastral: true, exige_validade: true, obrigatorio: true });

      // aplicar outro modelo e editar (órgão dono)
      const obras = await http().post(`/api/habilitacao/licitacao/${lic.id}/exigencias/modelo`).set(bearer(orgao.token)).send({ modelo: 'OBRAS' });
      expect(obras.status).toBe(201);
      expect(obras.body.exigencias.some((e: any) => e.tipos_documento_cadastro.includes('REGISTRO_CONSELHO_CLASSE'))).toBe(true);
      const invalida = await http()
        .put(`/api/habilitacao/licitacao/${lic.id}/exigencias`)
        .set(bearer(orgao.token))
        .send({ exigencias: [{ categoria: 'NADA', descricao: 'x' }] });
      expect(invalida.status).toBe(400);
      const lista = [
        { categoria: 'FISCAL', descricao: 'CND federal (RFB/PGFN)', tipos_documento_cadastro: ['CND_RECEITA_FEDERAL_PGFN'], exige_validade: true },
        { categoria: 'TECNICA', descricao: 'Atestado de capacidade técnica', tipos_documento_cadastro: ['ATESTADO_CAPACIDADE_TECNICA'], obrigatorio: false },
      ];
      const salva = await http().put(`/api/habilitacao/licitacao/${lic.id}/exigencias`).set(bearer(orgao.token)).send({ exigencias: lista });
      expect(salva.status).toBe(200);
      expect(salva.body.exigencias).toHaveLength(2);
      expect(salva.body.exigencias[1]).toMatchObject({ obrigatorio: false, modelo: null });

      // isolamento: outro órgão e fornecedor não editam; anônimo não edita
      const F = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      expect([403, 404]).toContain((await http().put(`/api/habilitacao/licitacao/${lic.id}/exigencias`).set(bearer(orgaoB.token)).send({ exigencias: lista })).status);
      expect((await http().put(`/api/habilitacao/licitacao/${lic.id}/exigencias`).set(bearer(F.token)).send({ exigencias: lista })).status).toBe(403);
      expect((await http().put(`/api/habilitacao/licitacao/${lic.id}/exigencias`).send({ exigencias: lista })).status).toBe(401);

      // publicado → congelado (retificação é a E7)
      await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO);
      const depois = await http().put(`/api/habilitacao/licitacao/${lic.id}/exigencias`).set(bearer(orgao.token)).send({ exigencias: lista });
      expect(depois.status).toBe(409);
      expect(depois.body.message).toMatch(/congeladas/);
      expect((await http().get(`/api/habilitacao/licitacao/${lic.id}/exigencias`).expect(200)).body.editavel).toBe(false);
    });

    test('inversão de fases só na concorrência e só antes da publicação (art. 17 §1º)', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Inversão Config E4' });
      const pregao = await http()
        .post('/api/licitacoes')
        .set(bearer(orgao.token))
        .send({ numero_processo: `E4-INV-${Date.now()}`, orgao_id: orgao.id, objeto: 'Teste', modalidade: 'PREGAO_ELETRONICO', inversao_fases: true });
      expect(pregao.status).toBe(400);
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.CONCORRENCIA, { extras: { inversao_fases: true } });
      expect((await buscarLicitacao(ctx, lic)).inversao_fases).toBe(true);
      await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO);
      const r = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(orgao.token)).send({ inversao_fases: false });
      expect(r.status).toBe(409);
    });
  });

  // --------------------------------------------------------------------------
  describe('B. pregão: cadastro, envio, isolamento, sem substituição, análise, diligência, habilitar', () => {
    let orgao: OrgaoFixture;
    let orgaoB: OrgaoFixture;
    let F1: FornecedorFixture;
    let F2: FornecedorFixture;
    let intruso: FornecedorFixture;
    let licId: string;
    let sessaoId: string;
    let item: string;
    let hab: any;
    let exFederal: any;
    let exFgts: any;
    let exContrato: any;
    let docCadastroFgts: string;

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura Habilitação E4' });
      orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura Habilitação E4' });
      F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      intruso = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      // Registro cadastral do F1: federal APROVADO e válido; FGTS APROVADO mas vencido; contrato social só PENDENTE
      await documentoNoCadastro(ctx, F1.id, { tipo: 'CND_RECEITA_FEDERAL_PGFN', data_validade: diaMais(60) });
      docCadastroFgts = await documentoNoCadastro(ctx, F1.id, { tipo: 'CRF_FGTS', data_validade: diaMais(-2) });
      await documentoNoCadastro(ctx, F1.id, { tipo: 'CONTRATO_SOCIAL', nivel: 'NIVEL_II', aprovar: false });

      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F1, valores: [95] },
          { fornecedor: F2, valores: [96] },
        ],
        { itens: [{ descricao: 'Cadeira', quantidade: 10, valor_unitario_estimado: 100 }] },
      );
      licId = p.lic.id;
      sessaoId = p.sessaoId;
      item = p.lic.itens[0].id;
      await encerrar(orgao, sessaoId, item);
      await aceitarPropostaDaUnidade(ctx, sessaoId, item, orgao.token, F1.token);
    });

    test('job diário marca VENCIDO o documento do cadastro com validade passada (idempotente)', async () => {
      const job = ctx.app.get(VencimentoDocumentosService, { strict: false });
      const r = await job.marcarVencidos();
      expect(r.vencidos).toBeGreaterThanOrEqual(1);
      const [d] = await q(`SELECT status::text AS status FROM fornecedor_documentos WHERE id = $1`, [docCadastroFgts]);
      expect(d.status).toBe('VENCIDO');
      const [d2] = await q(`SELECT status::text AS status FROM fornecedor_documentos WHERE fornecedor_id = $1 AND tipo::text = 'CND_RECEITA_FEDERAL_PGFN'`, [F1.id]);
      expect(d2.status).toBe('APROVADO');
      expect((await job.marcarVencidos()).vencidos).toBe(0);
    });

    test('convocação: só quem tem proposta aceita; prazo ≥ 2 h; licitação em HABILITACAO; rotas antigas removidas', async () => {
      expect((await convocarHabilitacao(ctx, licId, F2.id, orgao.token)).status).toBe(400);
      expect((await convocarHabilitacao(ctx, licId, F1.id, orgao.token, 1)).status).toBe(400);
      expect((await convocarHabilitacao(ctx, licId, F1.id, F1.token)).status).toBe(403);
      expect([403, 404]).toContain((await convocarHabilitacao(ctx, licId, F1.id, orgaoB.token)).status);
      for (const antiga of ['convocar', 'aprovar', 'reprovar']) {
        expect((await http().put(`/api/sessao/${sessaoId}/habilitacao/${antiga}/${F1.id}`).set(bearer(orgao.token)).send({})).status).toBe(404);
      }
      expect((await http().get(`/api/sessao/${sessaoId}/habilitacao`).set(bearer(orgao.token))).status).toBe(404);

      const c = await convocarHabilitacao(ctx, licId, F1.id, orgao.token, 3);
      expect(c.status).toBe(201);
      hab = c.body;
      expect(hab).toMatchObject({ fornecedorId: F1.id, status: 'AGUARDANDO_ENVIO', prazoHoras: 3, origem: 'CONVOCACAO' });
      expect((new Date(hab.prazoAte).getTime() - Date.now()) / 3_600_000).toBeGreaterThan(2.9);
      expect((await buscarLicitacao(ctx, { id: licId, orgao } as any)).fase).toBe(FaseLicitacao.HABILITACAO);
      const s = (await http().get(`/api/disputa-v2/sessao/${sessaoId}`).expect(200)).body;
      expect(s.etapa).toBe(EtapaSessao.CONVOCACAO_HABILITACAO);
      expect((await convocarHabilitacao(ctx, licId, F1.id, orgao.token)).status).toBe(409);
    });

    test('registro cadastral (art. 70): só o documento APROVADO e válido pré-preenche a exigência', async () => {
      exFederal = hab.exigencias.find((e: any) => e.tipos_documento_cadastro.includes('CND_RECEITA_FEDERAL_PGFN'));
      exFgts = hab.exigencias.find((e: any) => e.tipos_documento_cadastro.includes('CRF_FGTS'));
      exContrato = hab.exigencias.find((e: any) => e.tipos_documento_cadastro.includes('CONTRATO_SOCIAL'));
      expect(exFederal.cobertaPeloCadastro).toBe(true);
      expect(exFederal.documentos).toHaveLength(1);
      expect(exFederal.documentos[0]).toMatchObject({ origem: 'CADASTRO', analise: 'PENDENTE', cadastro: { tipo: 'CND_RECEITA_FEDERAL_PGFN' } });
      // vencido não é aceito; pendente de aprovação também não
      expect(exFgts).toMatchObject({ cobertaPeloCadastro: false, documentos: [] });
      expect(exFgts.motivoCadastro).toMatch(/vencido/);
      expect(exContrato.cobertaPeloCadastro).toBe(false);
      expect(exContrato.motivoCadastro).toMatch(/não aprovado/);
      // o licitante vê o próprio checklist com o que o cadastro já cobre
      const minha = (await painelHabilitacao(ctx, licId, F1.token)).minha;
      expect(minha.exigencias.find((e: any) => e.id === exFederal.id)).toMatchObject({ cobertaPeloCadastro: true, podeEnviar: true });
    });

    test('isolamento: outro licitante não vê nem envia; órgão B não lê; público nunca', async () => {
      const deF2 = await painelHabilitacao(ctx, licId, F2.token);
      expect(deF2.minha).toBeNull();
      expect(JSON.stringify(deF2)).not.toContain(F1.id);
      expect((await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, F2.token)).status).toBe(404);
      expect((await http().get(`/api/habilitacao/licitacao/${licId}`).set(bearer(intruso.token))).status).toBe(403);
      expect((await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, intruso.token)).status).toBe(403);
      expect([403, 404]).toContain((await http().get(`/api/habilitacao/licitacao/${licId}`).set(bearer(orgaoB.token))).status);
      expect((await http().get(`/api/habilitacao/licitacao/${licId}`)).status).toBe(401);
      expect((await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, null)).status).toBe(401);
    });

    test('envio no prazo: arquivo obrigatório (PDF/JPG/PNG); rascunho pode ser retirado antes da entrega', async () => {
      expect((await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, F1.token, { arquivo: null })).status).toBe(400);
      expect(
        (await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, F1.token, { arquivo: Buffer.from('MZ executável'), nome: 'virus.exe' })).status,
      ).toBe(400);
      const r1 = await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, F1.token, { validade: diaMais(30), nome: 'fgts-errado.pdf' });
      expect(r1.status).toBe(201);
      const docErrado = r1.body.exigencias.find((e: any) => e.id === exFgts.id).documentos[0];
      expect(docErrado).toMatchObject({ origem: 'ENVIO', podeRemover: true });
      expect((await http().delete(`/api/habilitacao/documentos/${docErrado.id}`).set(bearer(F2.token))).status).toBe(404);
      expect((await http().delete(`/api/habilitacao/documentos/${docErrado.id}`).set(bearer(F1.token))).status).toBe(200);
      // nada foi para a pasta pública: o arquivo mora no banco
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM documentos_habilitacao WHERE id = $1`, [docErrado.id]);
      expect(n).toBe(0);
      // análise e decisão ainda não cabem (licitante no prazo)
      const docCadastro = exFederal.documentos[0].id;
      expect((await analisarDocumentoHabilitacao(ctx, docCadastro, orgao.token, 'ATENDE')).status).toBe(409);
      expect((await decidirHabilitacao(ctx, hab.id, orgao.token, 'habilitar')).status).toBe(409);
      expect((await decidirHabilitacao(ctx, hab.id, orgao.token, 'inabilitar', { motivo: 'Documentação incompleta' })).status).toBe(409);
      // envia o que falta e entrega
      await enviarDocumentosFaltantes(ctx, licId, F1.token);
      const e = await entregarHabilitacao(ctx, licId, F1.token);
      expect(e.status).toBe(201);
      expect(e.body.status).toBe('ENVIADA');
      const s = (await http().get(`/api/disputa-v2/sessao/${sessaoId}`).expect(200)).body;
      expect(s.etapa).toBe(EtapaSessao.ANALISE_HABILITACAO);
    });

    test('entregue: sem substituição nem documento novo (art. 64)', async () => {
      const novo = await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, F1.token);
      expect(novo.status).toBe(409);
      expect(novo.body.message).toMatch(/art\. 64/);
      const minha = (await painelHabilitacao(ctx, licId, F1.token)).minha;
      const doc = minha.exigencias.find((e: any) => e.id === exFgts.id).documentos[0];
      expect(doc.podeRemover).toBe(false);
      expect((await http().delete(`/api/habilitacao/documentos/${doc.id}`).set(bearer(F1.token))).status).toBe(409);
      expect((await entregarHabilitacao(ctx, licId, F1.token)).status).toBe(409);
    });

    test('arquivo: órgão dono e o próprio licitante; outro licitante, órgão B e público não', async () => {
      const painel = await painelHabilitacao(ctx, licId, orgao.token);
      const h = painel.habilitacoes.find((x: any) => x.id === hab.id);
      const doc = h.exigencias.find((e: any) => e.id === exFgts.id).documentos[0];
      const url = `/api/habilitacao/documentos/${doc.id}/arquivo`;
      const doOrgao = await arquivo(url, orgao.token);
      expect(doOrgao.status).toBe(200);
      expect(Buffer.from(doOrgao.body).equals(PDF_HABILITACAO)).toBe(true);
      expect((await http().get(url).set(bearer(F1.token))).status).toBe(200);
      expect((await http().get(url).set(bearer(F2.token))).status).toBe(404);
      expect([403, 404]).toContain((await http().get(url).set(bearer(orgaoB.token))).status);
      expect((await http().get(url)).status).toBe(401);
      // órgão B não analisa nem decide
      expect([403, 404]).toContain((await analisarDocumentoHabilitacao(ctx, doc.id, orgaoB.token, 'ATENDE')).status);
      expect([403, 404]).toContain((await decidirHabilitacao(ctx, hab.id, orgaoB.token, 'habilitar')).status);
      expect((await decidirHabilitacao(ctx, hab.id, F1.token, 'habilitar')).status).toBe(403);
    });

    test('arquivo do REGISTRO CADASTRAL (origem CADASTRO): lido do diretório privado; URL de outro fornecedor recusada', async () => {
      const enviar = (token: string) =>
        http()
          .post('/api/uploads')
          .set(bearer(token))
          .attach('file', PDF_HABILITACAO, { filename: 'cnd.pdf', contentType: 'application/pdf' })
          .field('tipo', 'documentos');
      const upF1 = await enviar(F1.token);
      const upF2 = await enviar(F2.token);
      expect([upF1.status, upF2.status]).toEqual([201, 201]);
      const docCadastro = exFederal.documentos[0].id;
      const url = `/api/habilitacao/documentos/${docCadastro}/arquivo`;
      const [{ fornecedor_documento_id }] = await q(`SELECT fornecedor_documento_id FROM documentos_habilitacao WHERE id = $1`, [docCadastro]);

      await q(`UPDATE fornecedor_documentos SET caminho_arquivo = $2 WHERE id = $1`, [fornecedor_documento_id, `/api/uploads/documentos/${upF1.body.filename}`]);
      const doOrgao = await arquivo(url, orgao.token);
      expect(doOrgao.status).toBe(200);
      expect(Buffer.from(doOrgao.body).equals(PDF_HABILITACAO)).toBe(true);
      expect((await http().get(url).set(bearer(F2.token))).status).toBe(404);

      // cadastro de F1 apontando para o arquivo de F2 (dono registrado em arquivos_upload) → recusado
      await q(`UPDATE fornecedor_documentos SET caminho_arquivo = $2 WHERE id = $1`, [fornecedor_documento_id, `/api/uploads/documentos/${upF2.body.filename}`]);
      expect((await arquivo(url, orgao.token)).status).toBe(404);
      await q(`UPDATE fornecedor_documentos SET caminho_arquivo = NULL WHERE id = $1`, [fornecedor_documento_id]);
    });

    test('análise por documento persistida; NÃO ATENDE exige motivo; habilitar com pendência → 400', async () => {
      const painel = await painelHabilitacao(ctx, licId, orgao.token);
      const h = painel.habilitacoes.find((x: any) => x.id === hab.id);
      const docFgts = h.exigencias.find((e: any) => e.id === exFgts.id).documentos[0];
      expect((await analisarDocumentoHabilitacao(ctx, docFgts.id, orgao.token, 'NAO_ATENDE')).status).toBe(400);
      expect((await analisarDocumentoHabilitacao(ctx, docFgts.id, orgao.token, 'DILIGENCIA')).status).toBe(400);
      const na = await analisarDocumentoHabilitacao(ctx, docFgts.id, orgao.token, 'NAO_ATENDE', 'CRF emitido para outro CNPJ (filial)');
      expect(na.status).toBe(201);
      await atenderTodos(ctx, licId, hab.id, orgao.token); // os demais pendentes (inclusive o do cadastro)
      const [linha] = await q(`SELECT analise, analise_motivo, analisado_por_tipo FROM documentos_habilitacao WHERE id = $1`, [docFgts.id]);
      expect(linha).toMatchObject({ analise: 'NAO_ATENDE', analise_motivo: 'CRF emitido para outro CNPJ (filial)', analisado_por_tipo: 'ORGAO' });
      const r = await decidirHabilitacao(ctx, hab.id, orgao.token, 'habilitar');
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toMatch(/FGTS/);
      // ADJUDICAR ainda bloqueado pela habilitação pendente
      const adj = (await atos(licId, orgao.token)).find((a) => a.ato === 'ADJUDICAR');
      expect(adj?.pendencias.join(' ')).toMatch(/Habilitação pendente/);
    });

    test('diligência (art. 64): motivo e prazo próprios; só complementa o indicado; original preservado', async () => {
      const url = `/api/habilitacao/${hab.id}/diligencia`;
      expect((await http().post(url).set(bearer(orgao.token)).send({ motivo: 'Apresentar CRF da matriz', prazoHoras: 1, exigenciaIds: [exFgts.id] })).status).toBe(400);
      expect((await http().post(url).set(bearer(orgao.token)).send({ motivo: 'curto', prazoHoras: 2, exigenciaIds: [exFgts.id] })).status).toBe(400);
      expect((await http().post(url).set(bearer(F1.token)).send({ motivo: 'Apresentar CRF da matriz', prazoHoras: 2, exigenciaIds: [exFgts.id] })).status).toBe(403);
      const d = await http().post(url).set(bearer(orgao.token)).send({ motivo: 'Apresentar o CRF da matriz (CNPJ licitante)', prazoHoras: 2, exigenciaIds: [exFgts.id] });
      expect(d.status).toBe(201);
      expect(d.body.status).toBe('EM_DILIGENCIA');
      expect(d.body.exigencias.find((e: any) => e.id === exFgts.id).documentos[0].analise).toBe('DILIGENCIA');
      expect((await http().post(url).set(bearer(orgao.token)).send({ motivo: 'Outra diligência qualquer', prazoHoras: 2, exigenciaIds: [exFgts.id] })).status).toBe(409);

      // fora do indicado → recusado; na exigência indicada → COMPLEMENTO
      expect((await enviarDocumentoHabilitacao(ctx, licId, exContrato.id, F1.token)).status).toBe(409);
      const comp = await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, F1.token, { validade: diaMais(30), nome: 'crf-matriz.pdf' });
      expect(comp.status).toBe(201);
      const docs = comp.body.exigencias.find((e: any) => e.id === exFgts.id).documentos;
      expect(docs.map((x: any) => x.origem)).toEqual(['ENVIO', 'COMPLEMENTO']);
      const diligenciaId = comp.body.diligenciaVigenteId;
      expect(diligenciaId).toBeTruthy();
      expect((await http().post(`/api/habilitacao/diligencias/${diligenciaId}/responder`).set(bearer(F2.token)).send({})).status).toBe(404);
      const resp = await http().post(`/api/habilitacao/diligencias/${diligenciaId}/responder`).set(bearer(F1.token)).send({ resposta: 'CRF da matriz anexado' });
      expect(resp.status).toBe(201);
      expect(resp.body.status).toBe('ENVIADA');
      expect(resp.body.diligencias[0]).toMatchObject({ status: 'RESPONDIDA', resposta: 'CRF da matriz anexado' });
      // diligência encerrada: nada mais entra
      expect((await enviarDocumentoHabilitacao(ctx, licId, exFgts.id, F1.token)).status).toBe(409);
    });

    test('complemento ATENDE → HABILITAR: licitante HABILITADO na unidade; sessão na intenção de recurso; adjudicação liberada da habilitação', async () => {
      await atenderTodos(ctx, licId, hab.id, orgao.token);
      // o original NÃO ATENDE continua registrado; a exigência é atendida pelo complemento
      const r = await decidirHabilitacao(ctx, hab.id, orgao.token, 'habilitar');
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('HABILITADO');
      const [lu] = await q(`SELECT situacao FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [item, F1.id]);
      expect(lu.situacao).toBe('HABILITADO');
      const s = (await http().get(`/api/disputa-v2/sessao/${sessaoId}`).expect(200)).body;
      expect(s.etapa).toBe(EtapaSessao.INTENCAO_RECURSO);
      const eventos = (await http().get(`/api/sessao/${sessaoId}/eventos`).set(bearer(orgao.token)).expect(200)).body;
      expect(eventos.some((e: any) => e.tipo === 'HABILITACAO_APROVADA' && e.fornecedor_identificador === F1.id)).toBe(true);
      expect(eventos.some((e: any) => e.tipo === 'CONVOCACAO_HABILITACAO')).toBe(true);
      expect(eventos.some((e: any) => /Diligência na habilitação/.test(e.descricao))).toBe(true);
      const adj = (await atos(licId, orgao.token)).find((a) => a.ato === 'ADJUDICAR');
      expect(adj?.pendencias.join(' ') ?? '').not.toMatch(/Habilitação pendente/);
      // decidida: nada mais
      expect((await decidirHabilitacao(ctx, hab.id, orgao.token, 'inabilitar', { motivo: 'Tentativa após a decisão' })).status).toBe(409);
      // o licitante vê o próprio resultado
      expect((await painelHabilitacao(ctx, licId, F1.token)).minha.status).toBe('HABILITADO');
    });
  });

  // --------------------------------------------------------------------------
  describe('C. inabilitação → próximo pelos lances; prazo vencido = entregue; vencedor final habilitado', () => {
    test('F1 inabilitado: RETORNAR_JULGAMENTO, F2 convocado para a aceitação e depois habilitado', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Inabilitação E4' });
      const F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F1, valores: [90] },
          { fornecedor: F2, valores: [95] },
        ],
        { itens: [{ descricao: 'Mesa', quantidade: 5, valor_unitario_estimado: 100 }] },
      );
      const licId = p.lic.id;
      const item = p.lic.itens[0].id;
      await encerrar(orgao, p.sessaoId, item);
      await aceitarPropostaDaUnidade(ctx, p.sessaoId, item, orgao.token, F1.token);

      const c = await convocarHabilitacao(ctx, licId, F1.id, orgao.token);
      expect(c.status).toBe(201);
      expect(c.body.prazoHoras).toBe(2);
      // prorrogação única pelo mesmo período
      const prorrogar = `/api/habilitacao/${c.body.id}/prorrogar`;
      expect((await http().post(prorrogar).set(bearer(orgao.token)).send({})).status).toBe(400);
      const pr = await http().post(prorrogar).set(bearer(orgao.token)).send({ motivo: 'Pedido do licitante deferido' });
      expect(pr.status).toBe(201);
      expect((new Date(pr.body.prazoAte).getTime() - new Date(c.body.prazoAte).getTime()) / 3_600_000).toBeCloseTo(2, 5);
      expect((await http().post(prorrogar).set(bearer(orgao.token)).send({ motivo: 'De novo' })).status).toBe(409);

      // prazo vence sem o ato de entrega: documentação considerada entregue (nada anexado)
      await q(`UPDATE habilitacoes_licitante SET prazo_ate = $2 WHERE id = $1`, [c.body.id, new Date(Date.now() - 60_000)]);
      const minha = (await painelHabilitacao(ctx, licId, F1.token)).minha;
      expect(minha).toMatchObject({ status: 'ENVIADA', prazoEncerrado: true, podeConcluirEnvio: false });
      expect((await enviarDocumentoHabilitacao(ctx, licId, minha.exigencias[0].id, F1.token)).status).toBe(409);

      expect((await decidirHabilitacao(ctx, c.body.id, orgao.token, 'inabilitar', { motivo: 'curto' })).status).toBe(400);
      const hab = (await painelHabilitacao(ctx, licId, orgao.token)).habilitacoes[0];
      expect(hab.podeHabilitar).toBe(false);
      expect(hab.pendencias.length).toBeGreaterThan(0);
      const r = await decidirHabilitacao(ctx, c.body.id, orgao.token, 'inabilitar', { motivo: 'Não apresentou os documentos de habilitação no prazo' });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('INABILITADO');

      expect((await buscarLicitacao(ctx, { id: licId, orgao } as any)).fase).toBe(FaseLicitacao.JULGAMENTO);
      const [lu] = await q(`SELECT situacao, motivo FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [item, F1.id]);
      expect(lu).toMatchObject({ situacao: 'INABILITADO', motivo: 'Não apresentou os documentos de habilitação no prazo' });
      const painel = await painelAceitacao(ctx, p.sessaoId, orgao.token);
      expect(painel.unidades[0].aceitacaoAtual).toMatchObject({ fornecedorId: F2.id, status: 'AGUARDANDO_ENVIO' });
      const s = (await http().get(`/api/disputa-v2/sessao/${p.sessaoId}`).expect(200)).body;
      expect(s.etapa).toBe(EtapaSessao.ACEITACAO_PROPOSTA);
      const eventos = (await http().get(`/api/sessao/${p.sessaoId}/eventos`).set(bearer(orgao.token)).expect(200)).body;
      expect(eventos.some((e: any) => e.tipo === 'HABILITACAO_REPROVADA' && /no prazo/.test(e.descricao))).toBe(true);
      // o inabilitado não é convocado de novo
      expect((await convocarHabilitacao(ctx, licId, F1.id, orgao.token)).status).toBe(400);

      // F2: aceitação e habilitação
      const conv = painel.unidades[0].aceitacaoAtual;
      const env = await http()
        .post(`/api/julgamento/sessao/${p.sessaoId}/aceitacao/${conv.id}/proposta`)
        .set(bearer(F2.token))
        .field('valores', JSON.stringify([{ itemId: item, valorUnitario: 95 }]))
        .attach('arquivo', PDF_HABILITACAO, { filename: 'proposta.pdf', contentType: 'application/pdf' });
      expect(env.status).toBe(201);
      expect((await http().post(`/api/julgamento/sessao/${p.sessaoId}/aceitacao/${conv.id}/aceitar`).set(bearer(orgao.token)).send({})).status).toBe(201);
      const h2 = await habilitarLicitante(ctx, licId, F2, orgao.token);
      expect(h2.status).toBe('HABILITADO');

      // vencedor final = o habilitado (nunca o inabilitado)
      const adj = await http().get(`/api/sessao/${p.sessaoId}/adjudicacao`).set(bearer(orgao.token)).expect(200);
      expect(adj.body.itens[0].vencedor.fornecedorId).toBe(F2.id);
      const hab2 = (await painelHabilitacao(ctx, licId, orgao.token)).habilitacoes.map((h: any) => [h.fornecedorId, h.status]);
      expect(hab2).toEqual([
        [F1.id, 'INABILITADO'],
        [F2.id, 'HABILITADO'],
      ]);

      // MIGRAÇÃO (boot, idempotente): licitação em HABILITACAO sem exigências recebe o modelo;
      // convocado da habilitação antiga (sessão) vira habilitação do fluxo novo (origem MIGRACAO)
      const legado = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      await q(`DELETE FROM exigencias_habilitacao WHERE licitacao_id = $1`, [licId]);
      await q(`UPDATE sessoes_disputa SET fornecedor_habilitacao_id = $2 WHERE id = $1`, [p.sessaoId, legado.id]);
      const boot = ctx.app.get(MigracaoHabilitacaoBootService, { strict: false });
      await boot.onApplicationBootstrap();
      await boot.onApplicationBootstrap();
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM exigencias_habilitacao WHERE licitacao_id = $1`, [licId]);
      expect(n).toBeGreaterThan(5);
      const migradas = await q(`SELECT origem, status, prazo_horas FROM habilitacoes_licitante WHERE licitacao_id = $1 AND fornecedor_id = $2`, [licId, legado.id]);
      expect(migradas).toEqual([{ origem: 'MIGRACAO', status: 'AGUARDANDO_ENVIO', prazo_horas: '24.00' }]);
    });
  });

  // --------------------------------------------------------------------------
  describe('D. inversão de fases (concorrência — art. 17 §1º): só os habilitados disputam', () => {
    let orgao: OrgaoFixture;
    let F1: FornecedorFixture;
    let F2: FornecedorFixture;
    let F3: FornecedorFixture;
    let intruso: FornecedorFixture;
    let lic: any;
    let sessaoId: string;
    let propostas: Record<string, string>;

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura Concorrência Inversão E4' });
      F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      intruso = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      await documentoNoCadastro(ctx, F2.id, { tipo: 'CND_RECEITA_FEDERAL_PGFN', data_validade: diaMais(60) });
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.CONCORRENCIA, {
        modo_disputa: ModoDisputa.ABERTO,
        criterio: CriterioJulgamento.MENOR_PRECO,
        itens: [{ descricao: 'Serviço de manutenção predial', quantidade: 1, valor_unitario_estimado: 1000 }],
        extras: { inversao_fases: true },
      });
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      propostas = {};
      for (const [f, v] of [
        [F1, 900],
        [F2, 950],
        [F3, 850],
      ] as Array<[FornecedorFixture, number]>) {
        propostas[f.id] = (await enviarProposta(ctx, f, lic, [v])).id;
      }
    });

    test('no acolhimento: habilitação anexada com a proposta; cadastro mostrado antes do 1º envio; sem proposta → 403', async () => {
      const antes = await painelHabilitacao(ctx, lic.id, F2.token);
      expect(antes).toMatchObject({ inversaoFases: true, envioInversaoAberto: true, minha: null });
      const exFed = antes.exigencias.find((e: any) => e.tipos_documento_cadastro.includes('CND_RECEITA_FEDERAL_PGFN'));
      expect(antes.coberturaCadastro.find((c: any) => c.exigenciaId === exFed.id).coberta).toBe(true);
      expect((await enviarDocumentoHabilitacao(ctx, lic.id, exFed.id, intruso.token)).status).toBe(403);
      const p1 = await enviarDocumentosFaltantes(ctx, lic.id, F1.token);
      expect(p1.minha).toMatchObject({ origem: 'INVERSAO', status: 'AGUARDANDO_ENVIO' });
      const p2 = await enviarDocumentosFaltantes(ctx, lic.id, F2.token);
      expect(p2.minha.exigencias.find((e: any) => e.id === exFed.id)).toMatchObject({ cobertaPeloCadastro: true });
      expect(p2.minha.exigencias.find((e: any) => e.id === exFed.id).documentos[0].origem).toBe('CADASTRO');
      // F3 não anexa nada; convocar não existe na inversão
      expect((await convocarHabilitacao(ctx, lic.id, F1.id, orgao.token)).status).toBe(409);
    });

    test('fim do acolhimento: envio fechado; disputa bloqueada até julgar a habilitação de todos', async () => {
      await abrirSessaoAgora(ctx, lic);
      expect((await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({})).status).toBe(200);
      for (const id of Object.values(propostas)) {
        expect((await http().put(`/api/propostas/${id}/classificar`).set(bearer(orgao.token))).status).toBe(200);
      }
      const ex = (await painelHabilitacao(ctx, lic.id, F1.token)).exigencias[0];
      expect((await enviarDocumentoHabilitacao(ctx, lic.id, ex.id, F1.token)).status).toBe(409);
      const s = await http().post(`/api/sessao/${lic.id}`).set(bearer(orgao.token)).send({ pregoeiroId: orgao.id, pregoeiroNome: 'Comissão E4' });
      expect(s.status).toBe(201);
      sessaoId = s.body.id;
      expect((await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token))).status).toBe(200);
      const it = await http().post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: lic.itens.map((i: any) => i.id) });
      expect(it.status).toBe(400);
      expect(JSON.stringify(it.body)).toMatch(/Inversão de fases/);
    });

    test('comissão julga todos: F1 e F2 habilitados, F3 inabilitado (proposta desclassificada)', async () => {
      const painel = await painelHabilitacao(ctx, lic.id, orgao.token);
      expect(painel.inversaoFases).toBe(true);
      expect(painel.habilitacoes).toHaveLength(3); // F3 garantido sem ter anexado nada
      const deF = (f: FornecedorFixture) => painel.habilitacoes.find((h: any) => h.fornecedorId === f.id);
      expect(deF(F1).status).toBe('ENVIADA');
      expect(deF(F3).status).toBe('ENVIADA');
      for (const f of [F1, F2]) {
        await atenderTodos(ctx, lic.id, deF(f).id, orgao.token);
        const r = await decidirHabilitacao(ctx, deF(f).id, orgao.token, 'habilitar');
        expect(r.status).toBe(201);
        expect(r.body.status).toBe('HABILITADO');
      }
      const r3 = await decidirHabilitacao(ctx, deF(F3).id, orgao.token, 'inabilitar', { motivo: 'Não apresentou os documentos de habilitação exigidos no edital' });
      expect(r3.status).toBe(201);
      const [p3] = await q(`SELECT status::text AS status, motivo_desclassificacao FROM propostas WHERE id = $1`, [propostas[F3.id]]);
      expect(p3.status).toBe('DESCLASSIFICADA');
      expect(p3.motivo_desclassificacao).toMatch(/art\. 17 §1º/);
    });

    test('só os habilitados disputam: F3 (inabilitado) sem lance; vencedor confirmado habilitado após a aceitação', async () => {
      const it = await http().post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: lic.itens.map((i: any) => i.id) });
      expect(it.status).toBe(201);
      const item = lic.itens[0].id;
      const lance3 = await http().post(`/api/disputa-v2/sessao/${sessaoId}/lance`).set(bearer(F3.token)).send({ itemId: item, valor: 800 });
      expect(lance3.status).toBeGreaterThanOrEqual(400);
      const [n3] = await q(`SELECT COUNT(*)::int AS n FROM lances WHERE item_id = $1 AND fornecedor_id = $2`, [item, F3.id]);
      expect(n3.n).toBe(0);
      expect((await http().post(`/api/disputa-v2/sessao/${sessaoId}/lance`).set(bearer(F2.token)).send({ itemId: item, valor: 880 })).status).toBe(201);
      await encerrar(orgao, sessaoId, item);
      const linhas = await q(`SELECT fornecedor_id FROM licitantes_unidade WHERE unidade_id = $1 ORDER BY posicao_final`, [item]);
      expect(linhas.map((l: any) => l.fornecedor_id)).toEqual([F2.id, F1.id]);

      await aceitarPropostaDaUnidade(ctx, sessaoId, item, orgao.token, F2.token);
      const hab = (await painelHabilitacao(ctx, lic.id, orgao.token)).habilitacoes.find((h: any) => h.fornecedorId === F2.id);
      const c = await decidirHabilitacao(ctx, hab.id, orgao.token, 'habilitar');
      expect(c.status).toBe(201);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.HABILITACAO);
      const [lu] = await q(`SELECT situacao FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [item, F2.id]);
      expect(lu.situacao).toBe('HABILITADO');
      const adj = (await atos(lic.id, orgao.token)).find((a) => a.ato === 'ADJUDICAR');
      expect(adj?.pendencias.join(' ') ?? '').not.toMatch(/Habilitação pendente/);
      const s = (await http().get(`/api/disputa-v2/sessao/${sessaoId}`).expect(200)).body;
      expect(s.etapa).toBe(EtapaSessao.INTENCAO_RECURSO);
    });
  });
});
