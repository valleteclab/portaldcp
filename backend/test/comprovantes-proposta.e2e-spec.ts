/**
 * COMPROVANTES DO FORNECEDOR e PLANILHA-MODELO DA PROPOSTA (dono, 10/11/2026 —
 * como a BLL): cada ação na proposta ou nos anexos gera um comprovante com o
 * retrato do que ficou gravado; a planilha-modelo sai com os itens da licitação.
 */
import * as ExcelJS from 'exceljs';
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarLicitacao, criarOrgao, enviarProposta, levarAteFase } from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { enviarDocumentoHabilitacao, painelHabilitacao } from './support/habilitacao';
import { CriterioJulgamento, FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const binario = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

describe('Comprovantes do fornecedor e planilha-modelo da proposta', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let lic: any;
  let propostaId: string;
  const http = () => ctx.http();
  const lista = (token: string) => http().get(`/api/comprovantes/licitacao/${lic.id}`).set(bearer(token));

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Câmara dos Comprovantes' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.CONCORRENCIA, {
      modo_disputa: ModoDisputa.ABERTO,
      criterio: CriterioJulgamento.MENOR_PRECO,
      itens: [
        { descricao: 'Cadeira do comprovante', quantidade: 10, valor_unitario_estimado: 100 },
        { descricao: 'Mesa do comprovante', quantidade: 2, valor_unitario_estimado: 500 },
      ],
      extras: { inversao_fases: true, inversao_fases_motivacao: 'Habilitação prévia evita analisar propostas de licitantes inabilitados.' },
    });
    await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
  });
  afterAll(async () => ctx?.fechar());

  test('planilha-modelo: itens da licitação, colunas do contrato de importação; licitação inexistente → 404', async () => {
    const r = await http().get(`/api/propostas/licitacao/${lic.id}/planilha-modelo`).buffer(true).parse(binario);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    const ws = wb.getWorksheet('Proposta')!;
    const linha = (n: number) => (ws.getRow(n).values as any[]).slice(1);
    expect(linha(5)).toEqual(['Item', 'Lote', 'Descrição', 'Quantidade', 'Unidade', 'Valor de referência (R$)', 'Valor unitário (R$)', 'Marca', 'Modelo']);
    expect(linha(6).slice(0, 4)).toEqual([1, undefined, 'Cadeira do comprovante', 10]);
    expect(linha(7)[2]).toBe('Mesa do comprovante');
    // Só as colunas do fornecedor ficam destravadas
    expect(ws.getRow(6).getCell(7).protection?.locked).toBe(false);
    expect(ws.getRow(6).getCell(3).protection?.locked).not.toBe(false);
    expect((await http().get(`/api/propostas/licitacao/00000000-0000-4000-8000-000000000000/planilha-modelo`)).status).toBe(404);
  });

  test('proposta enviada e alterada: um comprovante por ação, com o retrato do que ficou gravado', async () => {
    propostaId = (await enviarProposta(ctx, F1, lic, [90, 480])).id;
    let l = (await lista(F1.token).expect(200)).body;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ tipo: 'PROPOSTA_ENVIADA', rotulo: 'Proposta enviada', itens: 2, valorTotal: 1860, anexos: 0 });
    expect(l[0].numero).toMatch(/^CP-\d{4}-\d{6}$/);
    expect(l[0].codigoVerificacao).toMatch(/^[0-9a-f]{64}$/);

    // "Salvar" da edição: itens e, por último, o total
    const itens = (await http().get(`/api/propostas/${propostaId}/itens`).set(bearer(F1.token)).expect(200)).body;
    expect((await http().put(`/api/propostas/item/${itens[0].id}`).set(bearer(F1.token)).send({ valor_unitario: 85, marca: 'Marca X' })).status).toBe(200);
    expect((await http().put(`/api/propostas/${propostaId}`).set(bearer(F1.token)).send({ valor_total_proposta: 1810 })).status).toBe(200);
    l = (await lista(F1.token).expect(200)).body;
    expect(l.map((c: any) => c.tipo)).toEqual(['PROPOSTA_ALTERADA', 'PROPOSTA_ENVIADA']);
    expect(l[0].valorTotal).toBe(1810);
    expect(l[0].codigoVerificacao).not.toBe(l[1].codigoVerificacao);
  });

  test('anexo de habilitação: comprovante diz o que foi anexado e lista os anexos gravados', async () => {
    const painel = await painelHabilitacao(ctx, lic.id, F1.token);
    const ex = painel.exigencias[0];
    expect((await enviarDocumentoHabilitacao(ctx, lic.id, ex.id, F1.token)).status).toBe(201);
    const l = (await lista(F1.token).expect(200)).body;
    expect(l[0]).toMatchObject({ tipo: 'DOCUMENTO_ANEXADO', anexos: 1 });
    expect(l[0].descricao).toContain(ex.descricao);
  });

  test('PDF: só o dono baixa; outro fornecedor, órgão e anônimo não', async () => {
    const [c] = (await lista(F1.token).expect(200)).body;
    const pdf = await http().get(`/api/comprovantes/${c.id}/pdf`).set(bearer(F1.token)).buffer(true).parse(binario);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect(pdf.headers['content-disposition']).toContain(c.numero);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await http().get(`/api/comprovantes/${c.id}/pdf`).set(bearer(F2.token))).status).toBe(404);
    expect((await lista(F2.token).expect(200)).body).toEqual([]);
    expect((await lista(orgao.token)).status).toBe(403);
    expect((await http().get(`/api/comprovantes/licitacao/${lic.id}`)).status).toBe(401);
  });

  test('proposta excluída: o comprovante guarda o que foi excluído', async () => {
    expect((await http().delete(`/api/propostas/${propostaId}`).set(bearer(F1.token))).status).toBe(200);
    const l = (await lista(F1.token).expect(200)).body;
    expect(l[0]).toMatchObject({ tipo: 'PROPOSTA_EXCLUIDA', itens: 2, valorTotal: 1810 });
    // os comprovantes anteriores continuam lá
    expect(l.length).toBeGreaterThanOrEqual(4);
  });
});
