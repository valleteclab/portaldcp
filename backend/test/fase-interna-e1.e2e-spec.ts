/**
 * FASE INTERNA — ENTREGA 1 (Base). docs/licitacao/PLANO-FASE-INTERNA.md.
 *
 *  A. "Anexar PDF": a peça feita fora conta no checklist e libera a
 *     publicação quando é a única pendência; substituir cria versão (a
 *     anterior fica SUBSTITUIDO); data futura, sem data e não-PDF recusados;
 *     folhas em sequência; arquivo só para o órgão dono.
 *  B. Fundamento legal único (campo do processo) + consumo do limite da
 *     dispensa por exercício, ramo e unidade gestora (art. 75, §1º).
 *  C. Limites por exercício (leitura; cadastro só do admin da plataforma).
 *  D. Migrações de boot idempotentes (fundamento, limites, espelho dos anexos
 *     da aba Documentos) — rodar 2x não muda nada.
 *  E. Portaria de designação do órgão (vigência anual) referenciada no processo.
 *  F. Assinatura com 4 signatários (Mesa Diretora): só fica ASSINADA quando todos assinam.
 *  Isolamento em TODO endpoint novo: outro órgão (leitura 404 / escrita 403),
 *  fornecedor 403, anônimo 401.
 */
import { createHash } from 'crypto';
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  gerarAvisoDispensa,
  levarAteFase,
  pdfDeTeste,
} from './support';
import { corpoDivulgacao, criarDocumentoInstrucao, fimPropostasSugerido, vincularOrgaoPncp } from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from '../src/fase-interna/entities/documento-fase-interna.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { limiteDispensa } from '../src/parametros-licitacao/limites-dispensa';
import { migrarFundamentoLegal } from '../src/licitacoes/migracao-fundamento-legal';
import { migrarLimitesDispensaPorExercicio } from '../src/parametros-licitacao/migracao-limites-dispensa';
import { espelharDocumentosLicitacaoExistentes } from '../src/fase-interna/espelho-documentos-licitacao';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const amanha = () => new Date(Date.now() - 3 * 3_600_000 + 24 * 3_600_000).toISOString().slice(0, 10);

describe('Fase interna — Entrega 1 (base)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);

  const anexar = (lic: { id: string }, tipo: string, token: string, campos: Record<string, string> = {}, arquivo: Buffer | null = pdfDeTeste('Peca anexada'), nome = 'peca.pdf', mime = 'application/pdf') => {
    let r = http().post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`).set(bearer(token));
    const padrao = { data_documento: hoje(), numero_peca: 'Peça 001/2026', signatarios: JSON.stringify([{ nome: 'Ana Compras', cargo: 'Setor de Compras' }]) };
    for (const [k, v] of Object.entries({ ...padrao, ...campos })) r = r.field(k, v);
    if (arquivo) r = r.attach('arquivo', arquivo, { filename: nome, contentType: mime });
    return r;
  };
  const instrucao = async (lic: LicitacaoFixture) =>
    (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(lic.orgao.token)).expect(200)).body;
  const itemDe = (inst: any, tipo: string) => inst.itens.find((i: any) => i.tipo === tipo);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara E1 A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E1 B' });
    await vincularOrgaoPncp(ctx, A, '1');
    F = await criarFornecedor(ctx);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. anexar PDF da peça feita fora', () => {
    let lic: LicitacaoFixture;
    let v1: any;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      await criarDocumentoInstrucao(ctx, lic, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'DFD');
      await criarDocumentoInstrucao(ctx, lic, TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA, 'Despacho de autorização');
      await gerarAvisoDispensa(ctx, lic);
    });

    it('sem a estimativa de despesa, a publicação é recusada (única pendência)', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(A.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toMatch(/Estimativa de despesa/);
      const inst = await instrucao(lic);
      expect(inst.pendentes).toHaveLength(1);
    });

    it('recusa arquivo que não é PDF, data futura e falta de data (nada gravado)', async () => {
      const naoPdf = await anexar(lic, 'PP', A.token, {}, Buffer.from('GIF89a imagem'), 'foto.gif', 'image/gif');
      expect(naoPdf.status).toBe(400);
      expect(naoPdf.body.message).toMatch(/PDF/);
      const disfarcado = await anexar(lic, 'PP', A.token, {}, Buffer.from('não sou pdf'), 'falso.pdf', 'application/pdf');
      expect(disfarcado.status).toBe(400);
      const futura = await anexar(lic, 'PP', A.token, { data_documento: amanha() });
      expect(futura.status).toBe(400);
      expect(futura.body.message).toMatch(/futura/);
      const semData = await anexar(lic, 'PP', A.token, { data_documento: '' });
      expect(semData.status).toBe(400);
      const semArquivo = await anexar(lic, 'PP', A.token, {}, null);
      expect(semArquivo.status).toBe(400);
      const tipoInvalido = await anexar(lic, 'XYZ', A.token);
      expect(tipoInvalido.status).toBe(400);
      const [{ n }] = await sql(`SELECT COUNT(*)::int AS n FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'PP'`, [lic.id]);
      expect(n).toBe(0);
    });

    it('isolamento do anexo: outro órgão 403, fornecedor 403, anônimo 401', async () => {
      expect((await anexar(lic, 'PP', B.token)).status).toBe(403);
      expect((await anexar(lic, 'PP', F.token)).status).toBe(403);
      const anon = await http().post(`/api/fase-interna/${lic.id}/documentos/PP/anexo`).field('data_documento', hoje()).attach('arquivo', pdfDeTeste('x'), 'x.pdf');
      expect(anon.status).toBe(401);
    });

    it('anexo válido: IMPORTADO/ARQUIVO, SHA-256, data da peça + data do envio, folhas, e conta no checklist', async () => {
      const pdf = pdfDeTeste('Mapa de precos feito fora');
      const r = await anexar(lic, 'PP', A.token, { data_documento: '2026-01-15', numero_peca: 'Mapa 012/2026', observacao: 'Pesquisa feita pelo Setor de Compras' }, pdf, 'mapa.pdf');
      expect(r.status).toBe(201);
      v1 = r.body;
      expect(v1).toMatchObject({
        tipo: 'PP',
        status: 'IMPORTADO',
        origem: 'ARQUIVO',
        versao: 1,
        versao_atual: true,
        numero_peca: 'Mapa 012/2026',
        hash_arquivo: createHash('sha256').update(pdf).digest('hex'),
        folha_inicial: 1,
        folha_final: 1,
        total_paginas: 1,
      });
      expect(String(v1.data_documento)).toMatch(/^2026-01-15/);
      expect(v1.data_importacao).toBeTruthy();
      expect(v1.signatarios_informados).toEqual([{ nome: 'Ana Compras', cargo: 'Setor de Compras' }]);

      const inst = await instrucao(lic);
      const pp = itemDe(inst, 'PP');
      expect(pp.status).toBe('OK');
      expect(pp.peca).toMatchObject({ anexada: true, numero_peca: 'Mapa 012/2026', folha_inicial: 1, versao: 1 });
      expect(inst.pode_divulgar).toBe(true);
      expect(pp.pode_nao_se_aplicar).toBe(false); // obrigatória no art. 72
      expect(itemDe(inst, 'ETP').pode_nao_se_aplicar).toBe(true);
    });

    it('substituir cria nova versão; a anterior fica SUBSTITUIDO e as folhas seguem a sequência', async () => {
      const r = await anexar(lic, 'PP', A.token, { numero_peca: 'Mapa 012/2026 (retificado)' }, pdfDeTeste('Mapa v2'));
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ versao: 2, versao_anterior_id: v1.id, folha_inicial: 2, folha_final: 2 });
      const versoes = (await http().get(`/api/fase-interna/${lic.id}/documentos/PP`).set(bearer(A.token)).expect(200)).body as any[];
      expect(versoes.map((v) => [v.versao, v.status, v.versao_atual])).toEqual([
        [2, 'IMPORTADO', true],
        [1, 'SUBSTITUIDO', false],
      ]);
    });

    it('arquivo da peça: só o órgão dono', async () => {
      const ok = await http().get(`/api/fase-interna/documento/${v1.id}/arquivo`).set(bearer(A.token));
      expect(ok.status).toBe(200);
      expect(ok.headers['content-type']).toMatch(/pdf/);
      expect((await http().get(`/api/fase-interna/documento/${v1.id}/arquivo`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/fase-interna/documento/${v1.id}/arquivo`).set(bearer(F.token))).status).toBe(403);
      expect((await http().get(`/api/fase-interna/documento/${v1.id}/arquivo`)).status).toBe(401);
    });

    it('com a peça anexada, a publicação passa', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(A.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(r.status).toBe(200);
      expect([FaseLicitacao.AGUARDANDO_DIVULGACAO, FaseLicitacao.PUBLICADO]).toContain(r.body.fase);
      // divulgado: a peça da fase interna não muda mais
      expect((await anexar(lic, 'PP', A.token)).status).toBe(409);
    });
  });

  // ==========================================================================
  describe('B. fundamento legal único + consumo do limite da dispensa', () => {
    let l1: LicitacaoFixture;
    let l2: LicitacaoFixture;
    let lEmergencia: LicitacaoFixture;
    let C: OrgaoFixture; // órgão próprio: as dispensas das outras seções não entram na soma
    const exercicio = () => Number(new Date().getFullYear());

    beforeAll(async () => {
      C = await criarOrgao(ctx, { nome: 'Câmara E1 C (consumo)' });
      l1 = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA); // 2 itens = R$ 2.000
      l2 = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      lEmergencia = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA); // outro órgão: não soma
    });

    it('processo nasce com o fundamento gravado (padrão da modalidade) e o PNCP/tela leem o campo', async () => {
      const [l] = await sql(`SELECT fundamento_legal FROM licitacoes WHERE id = $1`, [l1.id]);
      expect(l.fundamento_legal).toBe('ART75_II');
      const pc = (await http().get(`/api/licitacoes/${l1.id}/processo-completo`).set(bearer(C.token)).expect(200)).body;
      expect(pc.licitacao.fundamento_legal).toBe('Lei 14.133/2021, art. 75, II');
      expect(pc.licitacao.fundamento_legal_codigo).toBe('ART75_II');
    });

    it('editar: só fundamento compatível com a modalidade', async () => {
      const ruim = await http().put(`/api/licitacoes/${l1.id}`).set(bearer(C.token)).send({ fundamento_legal: 'ART74_I' });
      expect(ruim.status).toBe(400);
      const bom = await http().put(`/api/licitacoes/${lEmergencia.id}`).set(bearer(C.token)).send({ fundamento_legal: 'ART75_VIII' });
      expect(bom.status).toBe(200);
      expect(bom.body.fundamento_legal).toBe('ART75_VIII');
    });

    it('consumo: soma as dispensas por valor do órgão no exercício e no ramo (fora: outro órgão e outra hipótese)', async () => {
      const r = (await http().get(`/api/fase-interna/${l1.id}/consumo-limite`).set(bearer(C.token)).expect(200)).body;
      const lim = limiteDispensa(exercicio(), 'II')!;
      expect(r).toMatchObject({ aplicavel: true, inciso: 'II', exercicio: exercicio(), fundamento: 'ART75_II' });
      expect(r.limite).toMatchObject({ valor: lim.valor, ato_normativo: lim.ato_normativo });
      // l1 + l2 (2 × R$ 2.000); a de emergência (art. 75, VIII) e a do órgão B não entram
      expect(r.maior).toMatchObject({ total: 4000, deste_processo: 2000, outros_processos: 2000, quantidade_processos: 2 });
      expect(r.maior.percentual).toBe(Math.floor((4000 / lim.valor) * 1000) / 10);
      expect(r.maior.ramo).toEqual({ classe: 'MATERIAL:SEM_CODIGO', unidade_gestora: '' });

      const emerg = (await http().get(`/api/fase-interna/${lEmergencia.id}/consumo-limite`).set(bearer(C.token)).expect(200)).body;
      expect(emerg.aplicavel).toBe(false);
      expect(emerg.motivo).toMatch(/art\. 75, VIII/);
    });

    it('consumo: unidade gestora diferente é outro ramo', async () => {
      await http().put(`/api/licitacoes/${l2.id}`).set(bearer(C.token)).send({ codigo_unidade_compradora: '99' }).expect(200);
      const r = (await http().get(`/api/fase-interna/${l1.id}/consumo-limite`).set(bearer(C.token)).expect(200)).body;
      expect(r.maior).toMatchObject({ total: 2000, quantidade_processos: 1 });
    });

    it('isolamento do consumo: outro órgão 404, fornecedor 403, anônimo 401', async () => {
      expect((await http().get(`/api/fase-interna/${l1.id}/consumo-limite`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/fase-interna/${l1.id}/consumo-limite`).set(bearer(F.token))).status).toBe(403);
      expect((await http().get(`/api/fase-interna/${l1.id}/consumo-limite`)).status).toBe(401);
    });
  });

  // ==========================================================================
  describe('C. limites da dispensa por exercício e catálogo de fundamentos', () => {
    it('leitura: valores oficiais com o ato normativo', async () => {
      const r = (await http().get('/api/parametros-licitacao/limites-dispensa?exercicio=2025').set(bearer(A.token)).expect(200)).body;
      expect(r.II).toMatchObject({ valor: 62725.59, ato_normativo: 'Dec. 12.343/2024', provisorio: false });
      expect(r.I).toMatchObject({ valor: 125451.15 });
      const r23 = (await http().get('/api/parametros-licitacao/limites-dispensa?exercicio=2023').set(bearer(A.token)).expect(200)).body;
      expect(r23.II).toMatchObject({ valor: 57208.33, ato_normativo: 'Dec. 11.317/2022' });
      expect((await http().get('/api/parametros-licitacao/limites-dispensa')).status).toBe(401);
    });

    it('cadastro do exercício seguinte: só o admin da plataforma', async () => {
      const ano = new Date().getFullYear() + 1;
      const corpo = { exercicio: ano, valor_inciso_i: 136000.5, valor_inciso_ii: 68000.25, ato_normativo: 'Dec. E2E/2026' };
      expect((await http().post('/api/parametros-licitacao/limites-dispensa').send(corpo)).status).toBe(401);
      expect((await http().post('/api/parametros-licitacao/limites-dispensa').set(bearer(A.token)).send(corpo)).status).toBe(403);
      expect((await http().post('/api/parametros-licitacao/limites-dispensa').set(bearer(F.token)).send(corpo)).status).toBe(403);
      const antes = (await http().get(`/api/parametros-licitacao/limites-dispensa?exercicio=${ano}`).set(bearer(A.token))).body;
      expect(antes.II.provisorio).toBe(true);
      const ok = await http().post('/api/parametros-licitacao/limites-dispensa').set(bearer(ctx.tokenAdmin())).send(corpo);
      expect(ok.status).toBe(201);
      const depois = (await http().get(`/api/parametros-licitacao/limites-dispensa?exercicio=${ano}`).set(bearer(A.token))).body;
      expect(depois.II).toMatchObject({ valor: 68000.25, ato_normativo: 'Dec. E2E/2026', provisorio: false });
      expect(depois.I.valor).toBe(136000.5);
      const invalido = await http().post('/api/parametros-licitacao/limites-dispensa').set(bearer(ctx.tokenAdmin())).send({ ...corpo, ato_normativo: '' });
      expect(invalido.status).toBe(400);
    });

    it('fundamentos da modalidade (select do "Editar processo")', async () => {
      const r = (await http().get('/api/parametros-licitacao/fundamentos-legais?modalidade=DISPENSA_ELETRONICA&tipo_contratacao=OBRA').set(bearer(A.token)).expect(200)).body;
      expect(r.padrao).toBe('ART75_I');
      expect(r.fundamentos).toHaveLength(29);
      expect(r.fundamentos[1]).toMatchObject({ codigo: 'ART75_II', inciso_limite: 'II', amparo_pncp: 19 });
      expect((await http().get('/api/parametros-licitacao/fundamentos-legais')).status).toBe(401);
    });
  });

  // ==========================================================================
  describe('D. migrações de boot idempotentes', () => {
    it('fundamento legal: lê o amparo da peça JC; rodar 2x não muda nada', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/JC/secao/amparo_legal`)
        .set(bearer(A.token))
        .send({ html: '<p>Dispensa com fundamento no Art. 75, inciso VIII (emergência)</p>' })
        .expect(200);
      const semTexto = await criarLicitacao(ctx, A, ModalidadeLicitacao.INEXIGIBILIDADE);
      await sql(`UPDATE licitacoes SET fundamento_legal = NULL WHERE id = ANY($1)`, [[lic.id, semTexto.id]]);

      const r1 = await ctx.dataSource.transaction((m) => migrarFundamentoLegal(m));
      expect(r1.preenchidas).toBeGreaterThanOrEqual(2);
      expect(r1.doTexto).toBeGreaterThanOrEqual(1);
      const linhas = await sql(`SELECT id::text AS id, fundamento_legal FROM licitacoes WHERE id = ANY($1)`, [[lic.id, semTexto.id]]);
      expect(Object.fromEntries(linhas.map((l: any) => [l.id, l.fundamento_legal]))).toEqual({ [lic.id]: 'ART75_VIII', [semTexto.id]: 'ART74_CAPUT' });

      const r2 = await ctx.dataSource.transaction((m) => migrarFundamentoLegal(m));
      expect(r2).toEqual({ preenchidas: 0, doTexto: 0 });
    });

    it('limites: corrige a semente antiga (valores de 2024 rotulados 2025) e não duplica ao rodar 2x', async () => {
      await sql(
        `INSERT INTO limites_legais (id, orgao_id, chave, descricao, valor, vigencia_inicio, fonte, created_at, updated_at)
         VALUES (gen_random_uuid(), NULL, 'DISPENSA_COMPRAS_SERVICOS', 'semente antiga', 59906.02, '2025-01-01', 'Decreto 12.343/2024', now(), now())`,
      );
      const r1 = await ctx.dataSource.transaction((m) => migrarLimitesDispensaPorExercicio(m));
      expect(r1.corrigidas).toBe(1);
      const r2 = await ctx.dataSource.transaction((m) => migrarLimitesDispensaPorExercicio(m));
      expect(r2).toEqual({ corrigidas: 0, criadas: 0 });
      const linhas = await sql(`SELECT exercicio, valor::float AS valor, fonte FROM limites_legais WHERE orgao_id IS NULL AND chave = 'DISPENSA_COMPRAS_SERVICOS' AND exercicio IN (2024, 2025) ORDER BY exercicio`);
      expect(linhas).toEqual([
        { exercicio: 2024, valor: 59906.02, fonte: 'Dec. 11.871/2023' },
        { exercicio: 2025, valor: 62725.59, fonte: 'Dec. 12.343/2024' },
      ]);
    });

    it('anexo pela aba Documentos conta como a peça (espelho), e o espelho de boot é idempotente', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const up = await http()
        .post(`/api/documentos/licitacao/${lic.id}`)
        .set(bearer(A.token))
        .field('tipo', 'PESQUISA_PRECOS')
        .field('titulo', 'Pesquisa de preços (aba Documentos)')
        .attach('arquivo', pdfDeTeste('Pesquisa aba documentos'), { filename: 'pp.pdf', contentType: 'application/pdf' });
      expect(up.status).toBe(201);
      const pp = itemDe(await instrucao(lic), 'PP');
      expect(pp.status).toBe('OK');
      expect(pp.peca.anexada).toBe(true);

      // anexo antigo (anterior à Entrega 1): sem espelho → a migração cria; 2ª rodada não faz nada
      await sql(`DELETE FROM documentos_fase_interna WHERE licitacao_id = $1 AND sistema_origem = 'documentos_licitacao'`, [lic.id]);
      expect(itemDe(await instrucao(lic), 'PP').status).toBe('PENDENTE');
      const r1 = await ctx.dataSource.transaction((m) => espelharDocumentosLicitacaoExistentes(m));
      expect(r1.espelhados).toBeGreaterThanOrEqual(1);
      expect(itemDe(await instrucao(lic), 'PP').status).toBe('OK');
      const r2 = await ctx.dataSource.transaction((m) => espelharDocumentosLicitacaoExistentes(m));
      expect(r2.espelhados).toBe(0);
    });
  });

  // ==========================================================================
  describe('E. portaria de designação do órgão (uma por exercício, referenciada)', () => {
    let portariaId: string;
    let lic: LicitacaoFixture;

    const anexarPortaria = (token: string, extra: Record<string, string> = {}) => {
      let r = http().post('/api/fase-interna/orgao/portarias').set(bearer(token));
      for (const [k, v] of Object.entries({ numero_peca: 'Portaria 012/2026', data_documento: hoje(), ...extra })) r = r.field(k, v);
      return r.attach('arquivo', pdfDeTeste('Portaria de designacao'), { filename: 'portaria.pdf', contentType: 'application/pdf' });
    };

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    });

    it('órgão anexa a portaria do exercício; fornecedor 403, anônimo 401', async () => {
      expect((await anexarPortaria(F.token)).status).toBe(403);
      const anon = await http().post('/api/fase-interna/orgao/portarias').field('numero_peca', 'x').attach('arquivo', pdfDeTeste('x'), 'x.pdf');
      expect(anon.status).toBe(401);
      const r = await anexarPortaria(A.token);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ exercicio: Number(hoje().slice(0, 4)), versao: 1, ativo: true, numero: 'Portaria 012/2026' });
      portariaId = r.body.id;
    });

    it('lista e arquivo só do próprio órgão', async () => {
      const deA = (await http().get('/api/fase-interna/orgao/portarias').set(bearer(A.token)).expect(200)).body;
      expect(deA.map((p: any) => p.id)).toContain(portariaId);
      const deB = (await http().get('/api/fase-interna/orgao/portarias').set(bearer(B.token)).expect(200)).body;
      expect(deB.map((p: any) => p.id)).not.toContain(portariaId);
      expect((await http().get(`/api/fase-interna/orgao/portarias/${portariaId}/arquivo`).set(bearer(A.token))).status).toBe(200);
      expect((await http().get(`/api/fase-interna/orgao/portarias/${portariaId}/arquivo`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/fase-interna/orgao/portarias/${portariaId}/arquivo`).set(bearer(F.token))).status).toBe(403);
      expect((await http().get('/api/fase-interna/orgao/portarias'))).toMatchObject({ status: 401 });
    });

    it('processo referencia a portaria vigente (peça DP) sem copiar o arquivo', async () => {
      const r = await http().post(`/api/fase-interna/${lic.id}/portaria-designacao`).set(bearer(A.token)).send({});
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ tipo: 'DP', status: 'IMPORTADO', documento_orgao_id: portariaId, numero_peca: 'Portaria 012/2026' });
      expect(itemDe(await instrucao(lic), 'DP')).toMatchObject({ status: 'OK', peca: expect.objectContaining({ documento_orgao_id: portariaId }) });
    });

    it('isolamento: outro órgão não junta a portaria de A (nem no próprio processo) nem mexe no processo de A', async () => {
      const licB = await criarLicitacao(ctx, B, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await http().post(`/api/fase-interna/${licB.id}/portaria-designacao`).set(bearer(B.token)).send({ portaria_id: portariaId })).status).toBe(404);
      expect((await http().post(`/api/fase-interna/${lic.id}/portaria-designacao`).set(bearer(B.token)).send({})).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/portaria-designacao`).set(bearer(F.token)).send({})).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/portaria-designacao`).send({})).status).toBe(401);
    });

    it('nova portaria do mesmo exercício vira versão 2; a anterior fica inativa (não some)', async () => {
      const r = await anexarPortaria(A.token, { numero_peca: 'Portaria 015/2026' });
      expect(r.body).toMatchObject({ versao: 2, substitui_documento_id: portariaId, ativo: true });
      const todas = (await http().get('/api/fase-interna/orgao/portarias?todas=true').set(bearer(A.token))).body;
      expect(todas.find((p: any) => p.id === portariaId).ativo).toBe(false);
    });
  });

  // ==========================================================================
  describe('F. assinatura com 4 signatários (Mesa Diretora)', () => {
    let lic: LicitacaoFixture;
    let mesa: Array<{ id: string; token: string; email: string }>;
    const papeis = ['Presidente', 'Vice-Presidente', '1º Secretário', '2º Secretário'];
    const assinaturaAA = (token?: string) => {
      const r = http().get(`/api/fase-interna/${lic.id}/documentos/AA/assinatura`);
      return token ? r.set(bearer(token)) : r;
    };

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      mesa = [];
      for (const p of papeis) mesa.push(await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: `Vereador ${p}` }));
      await criarDocumentoInstrucao(ctx, lic, TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA, 'Despacho da Mesa Diretora');
    });

    it('signatário de outro órgão é recusado; isolamento do envio (403/403/401) e da consulta (404/403/401)', async () => {
      const deB = await criarUsuarioOrgao(ctx, B);
      const r = await http()
        .post(`/api/fase-interna/${lic.id}/documentos/AA/assinatura`)
        .set(bearer(A.token))
        .send({ signatarios: [{ usuario_id: deB.id, papel: 'Presidente' }] });
      expect(r.status).toBe(400);
      const corpo = { signatarios: [{ usuario_id: mesa[0].id, papel: 'Presidente' }] };
      expect((await http().post(`/api/fase-interna/${lic.id}/documentos/AA/assinatura`).set(bearer(B.token)).send(corpo)).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/documentos/AA/assinatura`).set(bearer(F.token)).send(corpo)).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/documentos/AA/assinatura`).send(corpo)).status).toBe(401);
      expect((await assinaturaAA(B.token)).status).toBe(404);
      expect((await assinaturaAA(F.token)).status).toBe(403);
      expect((await assinaturaAA()).status).toBe(401);
    });

    it('envia para os 4; a peça só fica ASSINADA quando todos assinam (data = última assinatura, hash, folhas)', async () => {
      const envio = await http()
        .post(`/api/fase-interna/${lic.id}/documentos/AA/assinatura`)
        .set(bearer(A.token))
        .send({ signatarios: mesa.map((u, i) => ({ usuario_id: u.id, papel: papeis[i] })) });
      expect(envio.status).toBe(201);
      expect(envio.body).toMatchObject({ status: 'AGUARDANDO_ASSINATURA' });
      expect(envio.body.signatarios_exigidos).toHaveLength(4);
      const docAssId = envio.body.documento_assinatura_id;
      expect(itemDe(await instrucao(lic), 'AA').status).toBe('EM_ASSINATURA');

      const sigs: any[] = await sql(`SELECT id::text AS id, email, papel FROM signatarios_documento WHERE documento_id = $1`, [docAssId]);
      expect(sigs.map((s) => s.papel).sort()).toEqual([...papeis].sort());
      for (let i = 0; i < 4; i++) {
        const u = mesa[i];
        const sig = sigs.find((s) => s.email === u.email);
        const r = await http().post(`/api/portal-assinaturas/${docAssId}/signatarios/${sig.id}/assinar`).set(bearer(u.token)).send({});
        expect(r.status).toBe(201);
        if (i < 3) {
          // 1, 2 e 3 assinaturas: ainda não conta
          const [d] = await sql(`SELECT status::text AS status FROM documentos_fase_interna WHERE id = $1`, [envio.body.id]);
          expect(d.status).toBe('AGUARDANDO_ASSINATURA');
          expect(itemDe(await instrucao(lic), 'AA').status).toBe('EM_ASSINATURA');
        }
      }
      let doc: any = null;
      for (let t = 0; t < 100; t++) {
        [doc] = await sql(`SELECT * FROM documentos_fase_interna WHERE id = $1`, [envio.body.id]);
        if (doc.status === 'ASSINADO') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(doc.status).toBe('ASSINADO');
      expect(doc.totalmente_assinado).toBe(true);
      expect(doc.data_documento).toBeTruthy();
      expect(doc.hash_arquivo).toMatch(/^[0-9a-f]{64}$/);
      expect(doc.folha_inicial).toBe(1);
      expect(doc.folha_final).toBeGreaterThanOrEqual(1);
      expect(doc.assinaturas).toHaveLength(4);
      expect(doc.assinaturas.map((a: any) => a.assinante_cargo).sort()).toEqual([...papeis].sort());
      const inst = await instrucao(lic);
      expect(itemDe(inst, 'AA').status).toBe('OK');
      const sit = (await assinaturaAA(A.token).expect(200)).body;
      expect(sit.signatarios.every((s: any) => s.status === 'ASSINADO')).toBe(true);
    });

    it('editar a peça assinada ("fazer aqui") abre versão nova; a assinada fica SUBSTITUIDO', async () => {
      await http().patch(`/api/fase-interna/${lic.id}/documentos/AA/conteudo`).set(bearer(A.token)).send({ html: '<p>Novo despacho</p>' }).expect(200);
      const versoes = (await http().get(`/api/fase-interna/${lic.id}/documentos/AA`).set(bearer(A.token)).expect(200)).body as any[];
      expect(versoes.map((v) => [v.versao, v.status])).toEqual([
        [2, 'EM_ELABORACAO'],
        [1, 'SUBSTITUIDO'],
      ]);
    });
  });
});
