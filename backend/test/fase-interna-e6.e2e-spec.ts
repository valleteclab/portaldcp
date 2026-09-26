/**
 * FASE INTERNA — ENTREGA 6 (autos em PDF com folhas numeradas).
 * docs/licitacao/PLANO-FASE-INTERNA.md §13.
 *
 *  A. "Gerar autos (PDF)" em segundo plano: situação NAO_GERADO → GERANDO →
 *     PRONTO; o PDF tem capa, termo de abertura, índice, as peças na ORDEM
 *     LÓGICA (o DFD antes do ETP, mesmo com o ETP mais antigo), a peça anexada
 *     com as PÁGINAS REAIS, a peça gerada no sistema, o termo de
 *     justificativas (achado da conformidade justificado + "não se aplica") e
 *     o termo de encerramento; carimbo "Fl. 000001…" contínuo em TODAS as
 *     folhas; a versão substituída NÃO entra (o índice cita "substitui a
 *     versão 1"); as folhas das peças passam a ser as do PDF.
 *  B. Cache pela impressão das peças: nada mudou → mesmo arquivo; uma peça
 *     nova → DESATUALIZADO e nova montagem.
 *  C. Depois de publicar: aviso publicado, registro das publicações e a página
 *     do Diário Oficial anexada entram nos autos.
 *  D. Isolamento dos endpoints (GET processo-pdf, GET situacao, POST gerar).
 *  E. Desempenho: processo com 204 folhas montado em segundo plano.
 *  Sem migração de boot: as folhas são gravadas nas peças a cada montagem
 *  (idempotente — o PDF é a fonte).
 */
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
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
  gerarAvisoDispensa,
} from './support';
import { corpoDivulgacao, fimPropostasSugerido } from './support/dispensa';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { MinutasSubscriber } from '../src/fase-interna/telas/minutas.subscriber';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';
import { paginasDoPdf } from '../src/fase-interna/conformidade/texto-pdf';
import { carimboDeFolha } from '../src/licitacoes/autos/autos-regras';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const diaBrasilia = (diasAtras = 0) => new Date(Date.now() - 3 * 3_600_000 - diasAtras * 86_400_000).toISOString().slice(0, 10);

/** PDF com N páginas reais ("<rotulo> PAGINA i DE n"); `girar` põe /Rotate 90 na última. */
async function pdfPaginas(rotulo: string, n: number, girar = false): Promise<Buffer> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(`${rotulo} PAGINA ${i} DE ${n}`, { x: 50, y: 700, size: 14, font: f });
    if (girar && i === n) p.setRotation(degrees(90));
  }
  return Buffer.from(await d.save());
}

const binario = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

describe('Fase interna — Entrega 6 (autos em PDF com folhas numeradas)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let lic: LicitacaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = async () => {
    await ctx.app.get(MinutasSubscriber).aguardarPendentes();
    await ctx.app.get(TarefasService).aguardarPendentes();
  };
  const anexar = (tipo: string, arquivo: Buffer, data = diaBrasilia(), numero = `${tipo} 001/2026`) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(agente.token))
      .field('data_documento', data)
      .field('numero_peca', numero)
      .field('signatarios', JSON.stringify([{ nome: 'Carla Signatária', cargo: 'Diretora' }]))
      .attach('arquivo', arquivo, { filename: `${tipo}.pdf`, contentType: 'application/pdf' });
  const naoSeAplica = (tipo: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(agente.token)).send({ justificativa: `Peça ${tipo} dispensada nesta contratação direta (art. 72).` });
  const situacao = async (token = agente.token) => (await http().get(`/api/licitacoes/${lic.id}/processo-pdf/situacao`).set(bearer(token)).expect(200)).body;
  const aguardarPronto = async () => {
    const limite = Date.now() + 90_000;
    while (Date.now() < limite) {
      const s = await situacao();
      if (s.situacao === 'PRONTO') return s;
      if (s.situacao !== 'GERANDO') throw new Error(`autos: situação inesperada ${JSON.stringify(s)}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('autos: tempo esgotado');
  };
  const baixar = async (token = agente.token) => {
    const r = await http().get(`/api/licitacoes/${lic.id}/processo-pdf`).set(bearer(token)).buffer(true).parse(binario);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toMatch(/pdf/);
    return { buffer: r.body as Buffer, impressao: String(r.headers['x-autos-impressao']), folhas: Number(r.headers['x-autos-folhas']) };
  };

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara E6 A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E6 B' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente E6' });
    lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    await sql(`UPDATE licitacoes SET numero_processo = '139/2025', numero_edital = '029/2025' WHERE id = $1`, [lic.id]);

    // Instrução: DFD anexado (3 páginas, HOJE); ETP anexado v1 e v2 (ANTES do DFD — a ordem dos autos é lógica)
    expect((await anexar('DFD', await pdfPaginas('DFD', 3))).status).toBe(201);
    expect((await anexar('ETP', await pdfPaginas('ETPVERSAOUM', 2), diaBrasilia(12))).status).toBe(201);
    expect((await anexar('ETP', await pdfPaginas('ETPVERSAODOIS solucao similar ou superior ao ARION (SNEWS)', 2), diaBrasilia(12))).status).toBe(201);
    for (const t of ['AR', 'TR', 'DO', 'PJ', 'JC', 'DP', 'ME', 'MC']) expect((await naoSeAplica(t)).status).toBe(201);
    expect((await anexar('PP', await pdfPaginas('PESQUISA', 2, true))).status).toBe(201);
    // Relatório do agente GERADO no sistema (peça feita aqui, PDF gerado)
    expect((await http().post(`/api/fase-interna/${lic.id}/minutas/RAG/gerar`).set(bearer(agente.token))).status).toBe(201);
    expect((await anexar('AA', await pdfPaginas('DESPACHO', 1))).status).toBe(201);
    await esperar();
    // Achado ATENÇÃO (marca "similar ou superior") justificado → vai para os autos
    const conf = (await http().get(`/api/fase-interna/${lic.id}/conformidade`).set(bearer(agente.token)).expect(200)).body;
    const marca = conf.achados.find((a: any) => a.regra === 'MARCA-01');
    expect(marca).toBeTruthy();
    await http()
      .post(`/api/fase-interna/${lic.id}/conformidade/achados/${marca.id}/justificar`)
      .set(bearer(agente.token))
      .send({ justificativa: 'A marca ARION é citada apenas como referência de desempenho, aceito equivalente.' })
      .expect(201);
    await esperar();
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. montagem em segundo plano; capa, índice, ordem lógica, carimbos e versões', () => {
    let paginas: string[];
    let meta: any;

    it('"Gerar autos (PDF)": NAO_GERADO → GERANDO (fila, segundo plano) → PRONTO, com o aviso ao usuário', async () => {
      expect((await situacao()).situacao).toBe('NAO_GERADO');
      const r = await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(agente.token));
      expect(r.status).toBe(201);
      expect(['GERANDO', 'PRONTO']).toContain(r.body.situacao);
      meta = await aguardarPronto();
      expect(meta.folhas).toBeGreaterThan(10);
      const [n] = await sql(`SELECT titulo, link FROM notificacoes WHERE entidade_id = $1 AND titulo LIKE 'Autos em PDF prontos%'`, [lic.id]);
      expect(n).toBeTruthy();
      expect(n.link).toBe(`/orgao/processos/${lic.id}?autos=pronto`);
    });

    it('o PDF: capa, termo de abertura, índice, peças e encerramento, com o carimbo contínuo em TODAS as folhas', async () => {
      const { buffer, folhas } = await baixar();
      const pdf = await PDFDocument.load(buffer);
      expect(pdf.getPageCount()).toBe(folhas);
      expect(folhas).toBe(meta.folhas);
      paginas = ((await paginasDoPdf(buffer)) ?? []).map((t) => t.replace(/\s+/g, ' '));
      expect(paginas.length).toBe(folhas);
      paginas.forEach((t, i) => expect(t).toContain(carimboDeFolha(i + 1)));
      expect(paginas[0]).toMatch(/AUTOS DO PROCESSO ADMINISTRATIVO/);
      expect(paginas[0]).toMatch(/Processo Administrativo nº 139\/2025/);
      expect(paginas[0]).toMatch(/Dispensa Eletrônica nº 029\/2025/);
      expect(paginas[0]).toMatch(/INTERESSADO/);
      expect(paginas[1]).toMatch(/TERMO DE ABERTURA/);
      expect(paginas[2]).toMatch(/ÍNDICE DOS AUTOS/);
      expect(paginas[folhas - 1]).toMatch(/TERMO DE ENCERRAMENTO/);
      expect(paginas[folhas - 1]).toMatch(new RegExp(`${folhas} \\(total de\\) folhas numeradas de 000001 a ${String(folhas).padStart(6, '0')}`));
    });

    it('ordem LÓGICA (DFD antes do ETP mais antigo), anexada com as páginas reais, gerada presente, versão substituída fora', async () => {
      // procura nas folhas das peças (depois da capa, do termo de abertura e do índice)
      const onde = (re: RegExp) => paginas.findIndex((t, i) => i > 2 && re.test(t));
      const dfd = [1, 2, 3].map((i) => onde(new RegExp(`DFD PAGINA ${i} DE 3`)));
      expect(dfd.every((x) => x > 2)).toBe(true);
      expect(dfd).toEqual([dfd[0], dfd[0] + 1, dfd[0] + 2]); // páginas reais, em sequência
      const etp = onde(/ETPVERSAODOIS/);
      expect(etp).toBeGreaterThan(dfd[2]);
      expect(onde(/ETPVERSAOUM/)).toBe(-1); // versão substituída NÃO entra
      const pp = onde(/PESQUISA PAGINA 1 DE 2/);
      const pp2 = onde(/PESQUISA PAGINA 2 DE 2/); // página girada, também carimbada
      expect(pp2).toBe(pp + 1);
      expect(pp).toBeGreaterThan(etp);
      const rag = onde(/[Rr]elat[óo]rio do agente/);
      const aa = onde(/DESPACHO PAGINA 1 DE 1/);
      expect(aa).toBeGreaterThan(pp);
      expect(rag).toBeGreaterThan(aa); // relatório (instrução do agente) depois do despacho
      const just = onde(/TERMO DE JUSTIFICATIVAS/);
      expect(just).toBeGreaterThan(rag);
      expect(paginas[just]).toMatch(/MARCA-01/);
      expect(paginas[just]).toMatch(/apenas como referência de desempenho/);
      expect(paginas[just]).toMatch(/Peça TR dispensada/);
    });

    it('o índice lista peça, folhas, data, origem, signatários e "substitui a versão 1"; as folhas das peças são as do PDF', async () => {
      const idx = meta.indice as any[];
      const dfd = idx.find((e) => /Formalização da Demanda/.test(e.titulo));
      const etp = idx.find((e) => /Estudo Técnico/.test(e.titulo));
      expect(dfd).toMatchObject({ folha_inicial: 4, folha_final: 6, folhas: '4–6', origem: 'Anexada (feita fora)' });
      expect(dfd.signatarios).toEqual(['Carla Signatária — Diretora']);
      expect(etp).toMatchObject({ folha_inicial: 7, folha_final: 8 });
      expect(etp.observacao).toMatch(/substitui a versão 1/);
      expect(idx.find((e) => /[Rr]elatório do agente/.test(e.titulo))).toMatchObject({ origem: 'Gerada no sistema' });
      expect(paginas[2]).toMatch(/substitui a versão 1/);
      expect(paginas[2]).toMatch(/Carla Signatária/);
      // o PDF é a fonte: as peças ativas receberam as folhas do PDF; a versão substituída guarda as suas
      const pecas = await sql(
        `SELECT tipo::text AS tipo, versao, versao_atual, folha_inicial, folha_final FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo IN ('DFD','ETP') ORDER BY tipo, versao`,
        [lic.id],
      );
      expect(pecas.find((p: any) => p.tipo === 'DFD')).toMatchObject({ folha_inicial: 4, folha_final: 6 });
      expect(pecas.find((p: any) => p.tipo === 'ETP' && p.versao_atual)).toMatchObject({ folha_inicial: 7, folha_final: 8 });
      const v1 = pecas.find((p: any) => p.tipo === 'ETP' && !p.versao_atual);
      expect(v1.folha_inicial).toBe(4); // a da juntada (E1) — não é reescrita
    });
  });

  // ==========================================================================
  describe('B. cache pela impressão das peças', () => {
    it('nada mudou → o mesmo arquivo (sem regenerar); peça nova → DESATUALIZADO e nova montagem', async () => {
      const antes = await situacao();
      expect(antes.situacao).toBe('PRONTO');
      const a1 = await baixar();
      const a2 = await baixar();
      expect(a2.impressao).toBe(a1.impressao);
      expect((await situacao()).gerado_em).toBe(antes.gerado_em);
      // gravar as folhas nas peças não muda a impressão (idempotente)
      expect((await situacao()).hash).toBe(antes.hash);

      expect((await anexar('AA', await pdfPaginas('DESPACHONOVO', 2), diaBrasilia(), 'Despacho 002/2026')).status).toBe(201);
      await esperar();
      const depois = await situacao();
      expect(depois.situacao).toBe('DESATUALIZADO');
      expect(depois.hash).not.toBe(antes.hash);
      expect(depois.anterior).toMatchObject({ folhas: antes.folhas });
      // o GET monta na hora (fila) quando não há cache
      const novo = await baixar();
      expect(novo.impressao).not.toBe(a1.impressao);
      expect(novo.folhas).toBe(antes.folhas + 1); // o despacho novo tem 2 páginas (o antigo, 1)
      const textos = ((await paginasDoPdf(novo.buffer)) ?? []).join(' ');
      expect(textos).toMatch(/DESPACHONOVO/);
      expect(textos).not.toMatch(/DESPACHO PAGINA 1 DE 1/);
    });
  });

  // ==========================================================================
  describe('C. depois de publicar: aviso, registro das publicações e Diário Oficial', () => {
    it('o aviso publicado, o registro e a página do Diário Oficial entram na ordem, depois da análise', async () => {
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(A.token)).expect(200);
      await gerarAvisoDispensa(ctx, lic);
      const pub = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(agente.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(pub.status).toBe(200);
      const d = await http()
        .post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`)
        .set(bearer(agente.token))
        .field('numero_edicao', 'nº 777')
        .field('data_publicacao', diaBrasilia())
        .field('pagina', '3')
        .attach('arquivo', await pdfPaginas('DIARIOOFICIAL', 1), { filename: 'do.pdf', contentType: 'application/pdf' });
      expect(d.status).toBe(201);
      await esperar();
      const { buffer } = await baixar();
      const paginas = ((await paginasDoPdf(buffer)) ?? []).map((t) => t.replace(/\s+/g, ' '));
      const onde = (re: RegExp) => paginas.findIndex((t, i) => i > 2 && re.test(t));
      const just = onde(/TERMO DE JUSTIFICATIVAS/);
      const aviso = onde(/AVISO DE CONTRATAÇÃO DIRETA/);
      const registro = onde(/REGISTRO DAS PUBLICAÇÕES/);
      const diario = onde(/DIARIOOFICIAL PAGINA 1 DE 1/);
      expect(aviso).toBeGreaterThan(just);
      expect(registro).toBeGreaterThan(aviso);
      expect(diario).toBeGreaterThan(registro);
      expect(paginas[registro]).toMatch(/Diário Oficial nº 777, p\. 3/);
      paginas.forEach((t, i) => expect(t).toContain(carimboDeFolha(i + 1)));
    });
  });

  // ==========================================================================
  describe('E. desempenho — processo com mais de 200 folhas', () => {
    it('monta em segundo plano, carimba todas as folhas e responde a situação enquanto gera', async () => {
      const grande = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      const r = await http()
        .post(`/api/fase-interna/${grande.id}/documentos/DFD/anexo`)
        .set(bearer(agente.token))
        .field('data_documento', diaBrasilia())
        .attach('arquivo', await pdfPaginas('VOLUMOSO', 200), { filename: 'dfd.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      await esperar();
      const t0 = Date.now();
      const g = await http().post(`/api/licitacoes/${grande.id}/processo-pdf/gerar`).set(bearer(agente.token)).expect(201);
      expect(['GERANDO', 'PRONTO']).toContain(g.body.situacao);
      let s: any;
      do {
        await new Promise((res) => setTimeout(res, 250));
        s = (await http().get(`/api/licitacoes/${grande.id}/processo-pdf/situacao`).set(bearer(agente.token)).expect(200)).body;
      } while (s.situacao === 'GERANDO' && Date.now() - t0 < 90_000);
      expect(s.situacao).toBe('PRONTO');
      expect(s.folhas).toBe(204); // capa + abertura + índice + 200 + encerramento
      const pdf = await http().get(`/api/licitacoes/${grande.id}/processo-pdf`).set(bearer(agente.token)).buffer(true).parse(binario).expect(200);
      const paginas = (await paginasDoPdf(pdf.body as Buffer)) ?? [];
      expect(paginas.length).toBe(204);
      expect(paginas[203]).toContain(carimboDeFolha(204));
      expect(paginas[150]).toContain(carimboDeFolha(151));
      expect(Date.now() - t0).toBeLessThan(90_000);
    });
  });

  // ==========================================================================
  describe('D. isolamento — os autos são do órgão dono', () => {
    it('GET processo-pdf e situação: outro órgão 404, fornecedor 403, anônimo 401', async () => {
      for (const rota of [`/api/licitacoes/${lic.id}/processo-pdf`, `/api/licitacoes/${lic.id}/processo-pdf/situacao`]) {
        await http().get(rota).set(bearer(B.token)).expect(404);
        await http().get(rota).set(bearer(F.token)).expect(403);
        await http().get(rota).expect(401);
      }
    });

    it('POST gerar: outro órgão 403, fornecedor 403, anônimo 401', async () => {
      await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(B.token)).expect(403);
      await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(F.token)).expect(403);
      await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).expect(401);
    });
  });
});
