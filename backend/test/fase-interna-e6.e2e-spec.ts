/**
 * FASE INTERNA — ENTREGA 6 (autos em PDF com folhas numeradas), na regra de
 * 27/09/2026: ORDEM CRONOLÓGICA DE JUNTADA (como no papel — Lei nº
 * 9.784/1999, art. 22, §4º). docs/licitacao/PLANO-FASE-INTERNA.md §13.
 *
 *  A. "Gerar autos (PDF)" em segundo plano: NAO_GERADO → GERANDO → PRONTO e,
 *     logo depois, continua PRONTO (a montagem não grava nada — nunca
 *     "desatualizado" ao gerar); capa, termo de abertura e índice SEM folha;
 *     os documentos na ORDEM DE JUNTADA (o ETP com data anterior, juntado
 *     depois do DFD, vem depois), cada um na FOLHA DA JUNTADA (a mesma da
 *     tela); a versão substituída CONTINUA nos autos, anotada "Substituída
 *     pela versão 2 — fls. 6–7", e a nova cita "Substitui as fls. 4–5";
 *     carimbo "Fl." contínuo; índice com a data de juntada de cada documento.
 *  B. Cache pela impressão das juntadas: nada mudou → mesmo arquivo; peça
 *     nova → DESATUALIZADO e nova montagem, com a folha nova no fim e a
 *     versão anterior mantida.
 *  C. Depois de publicar: o aviso publicado é juntado na publicação, a página
 *     do Diário Oficial quando registrada, o registro das publicações quando
 *     os autos são pedidos — nessa ordem.
 *  D. Isolamento dos endpoints (GET processo-pdf, GET situacao, POST gerar).
 *  E. Desempenho: processo com 200 folhas montado em segundo plano.
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

    // Instrução: DFD anexado (3 páginas, HOJE); ETP v1 e v2 com data ANTERIOR ao DFD — mas juntados depois (vale a ordem de juntada)
    expect((await anexar('DFD', await pdfPaginas('DFD', 3))).status).toBe(201);
    expect((await anexar('ETP', await pdfPaginas('ETPVERSAOUM', 2), diaBrasilia(12))).status).toBe(201);
    expect((await anexar('ETP', await pdfPaginas('ETPVERSAODOIS solucao similar ou superior ao ARION (SNEWS)', 2), diaBrasilia(12))).status).toBe(201);
    // Na ordem do fluxo (homologação multiusuário): pesquisa → reserva → minutas → parecer → autorização
    for (const t of ['AR', 'TR']) expect((await naoSeAplica(t)).status).toBe(201);
    expect((await anexar('PP', await pdfPaginas('PESQUISA', 2, true))).status).toBe(201);
    // art. 72, IV não admite "não se aplica": a informação orçamentária é anexada
    expect((await anexar('DO', await pdfPaginas('INFORMACAO ORCAMENTARIA', 1))).status).toBe(201);
    for (const t of ['JC', 'ME', 'MC']) expect([t, (await naoSeAplica(t)).status]).toEqual([t, 201]);
    // Relatório do agente GERADO no sistema (peça feita aqui, PDF gerado)
    expect((await http().post(`/api/fase-interna/${lic.id}/minutas/RAG/gerar`).set(bearer(agente.token))).status).toBe(201);
    await esperar(); // a peça gerada é juntada na sincronização (depois do commit), antes do próximo anexo
    expect((await naoSeAplica('PJ')).status).toBe(201);
    expect((await anexar('AA', await pdfPaginas('DESPACHO', 1))).status).toBe(201);
    expect((await naoSeAplica('DP')).status).toBe(201);
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
  describe('A. montagem em segundo plano; ordem de juntada, folhas da tela, versões mantidas', () => {
    let paginas: string[];
    let meta: any;
    /** Página do PDF que traz a folha `f` (capa, termo de abertura e índice vêm antes, sem folha). */
    let pre: number;
    const daFolha = (f: number) => paginas[pre + f - 1];

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

    it('logo depois de gerar, a situação continua PRONTO (a montagem não muda a impressão)', async () => {
      await esperar();
      for (let i = 0; i < 3; i++) {
        const s = await situacao();
        expect(s.situacao).toBe('PRONTO');
        expect(s.hash).toBe(meta.hash);
      }
    });

    it('o PDF: capa, termo de abertura e índice sem folha; carimbo contínuo de 000001 até o fim; encerramento sem folha', async () => {
      const { buffer, folhas } = await baixar();
      const pdf = await PDFDocument.load(buffer);
      expect(folhas).toBe(meta.folhas);
      paginas = ((await paginasDoPdf(buffer)) ?? []).map((t) => t.replace(/\s+/g, ' '));
      expect(paginas.length).toBe(pdf.getPageCount());
      pre = paginas.length - folhas - 1;
      expect(pre).toBe(3); // capa, termo de abertura, índice (1 página)
      expect(paginas[0]).toMatch(/AUTOS DO PROCESSO ADMINISTRATIVO/);
      expect(paginas[0]).toMatch(/Processo Administrativo nº 139\/2025/);
      expect(paginas[0]).toMatch(/Dispensa Eletrônica nº 029\/2025/);
      expect(paginas[0]).toMatch(/INTERESSADO/);
      expect(paginas[1]).toMatch(/TERMO DE ABERTURA/);
      expect(paginas[1]).toMatch(/ordem cronológica de juntada/);
      expect(paginas[2]).toMatch(/ÍNDICE DOS AUTOS/);
      // sem folha: nada de carimbo "Fl. 0…" na capa, no termo, no índice e no encerramento
      for (const i of [0, 1, 2, paginas.length - 1]) expect(paginas[i]).not.toMatch(/Fl\. 0\d{5}/);
      for (let f = 1; f <= folhas; f++) expect(daFolha(f)).toContain(carimboDeFolha(f));
      const fim = paginas[paginas.length - 1];
      expect(fim).toMatch(/TERMO DE ENCERRAMENTO/);
      expect(fim).toMatch(new RegExp(`${folhas} \\(total de\\) folhas numeradas de 000001 a ${String(folhas).padStart(6, '0')}`));
      // nenhuma página em branco, nenhum defeito de texto
      paginas.forEach((t, i) => {
        expect({ pagina: i + 1, vazia: t.replace(/Fl\. \d{6}/g, '').trim().length < 15 }).toEqual({ pagina: i + 1, vazia: false });
        expect(t).not.toMatch(/\{\{|A definir/);
      });
    });

    it('ordem de JUNTADA: DFD fls. 1–3, ETP v1 fls. 4–5 (mantido e anotado), ETP v2 fls. 6–7, pesquisa, informação orçamentária, relatório, despacho, justificativas', async () => {
      expect(daFolha(1)).toMatch(/DFD PAGINA 1 DE 3/);
      expect(daFolha(3)).toMatch(/DFD PAGINA 3 DE 3/);
      // a versão substituída CONTINUA nos autos, na folha original, anotada
      expect(daFolha(4)).toMatch(/ETPVERSAOUM PAGINA 1 DE 2/);
      expect(daFolha(4)).toMatch(/Substituída pela versão 2 — fls\. 6–7/);
      expect(daFolha(5)).toMatch(/Substituída pela versão 2 — fls\. 6–7/);
      expect(daFolha(6)).toMatch(/ETPVERSAODOIS/);
      expect(daFolha(6)).toMatch(/Substitui as fls\. 4–5/);
      expect(daFolha(8)).toMatch(/PESQUISA PAGINA 1 DE 2/);
      expect(daFolha(9)).toMatch(/PESQUISA PAGINA 2 DE 2/); // página girada, também carimbada
      expect(daFolha(10)).toMatch(/INFORMACAO ORCAMENTARIA PAGINA 1 DE 1/); // art. 72, IV (anexada — não admite "não se aplica")
      const idx = meta.indice as any[];
      const primeiro = (re: RegExp) => idx.find((e) => re.test(e.titulo));
      const rag = primeiro(/[Rr]elatório do agente/);
      const aa = primeiro(/[Aa]utoriza/);
      const just = primeiro(/Termo de justificativas/);
      expect(rag.folha_inicial).toBe(11);
      expect(rag.origem).toBe('Gerada no sistema');
      expect(aa.folha_inicial).toBe(rag.folha_final + 1); // o despacho foi juntado depois do relatório
      expect(daFolha(aa.folha_inicial)).toMatch(/DESPACHO PAGINA 1 DE 1/);
      expect(just.folha_inicial).toBe(aa.folha_final + 1); // juntado quando os autos foram pedidos
      const textoJust = paginas.slice(pre + just.folha_inicial - 1, pre + just.folha_final).join(' ');
      expect(textoJust).toMatch(/TERMO DE JUSTIFICATIVAS/);
      expect(textoJust).toMatch(/MARCA-01/);
      expect(textoJust).toMatch(/apenas como referência de desempenho/);
      expect(textoJust).toMatch(/Peça TR dispensada/);
    });

    it('o índice: na ordem das folhas, com a data de JUNTADA de cada documento e as substituídas marcadas', async () => {
      const idx = meta.indice as any[];
      const inicios = idx.map((e) => e.folha_inicial);
      expect(inicios).toEqual([...inicios].sort((a, b) => a - b));
      expect(idx[0].folha_inicial).toBe(1);
      for (let i = 1; i < idx.length; i++) expect(idx[i].folha_inicial).toBe(idx[i - 1].folha_final + 1); // contínuo
      // toda juntada com data (nunca "—") e em ordem cronológica
      expect(idx.every((e) => !!e.juntado_em)).toBe(true);
      const datas = idx.map((e) => new Date(e.juntado_em).getTime());
      expect(datas).toEqual([...datas].sort((a, b) => a - b));
      const etps = idx.filter((e) => /Estudo Técnico/.test(e.titulo));
      expect(etps.map((e) => [e.folha_inicial, e.folha_final])).toEqual([
        [4, 5],
        [6, 7],
      ]);
      expect(etps[0].substituida_por).toMatchObject({ versao: 2, folha_inicial: 6 });
      expect(etps[0].observacao).toMatch(/Substituída pela versão 2 — fls\. 6–7/);
      expect(etps[1].substitui).toEqual({ folha_inicial: 4, folha_final: 5 });
      const dfd = idx.find((e) => /Formalização da Demanda/.test(e.titulo));
      expect(dfd).toMatchObject({ folha_inicial: 1, folha_final: 3, folhas: '1–3', origem: 'Anexada (feita fora)' });
      expect(dfd.signatarios).toEqual(['Carla Signatária — Diretora']);
      expect(dfd.observacao).toMatch(/juntado em \d{2}\/\d{2}\/\d{4}/);
      expect(paginas[2]).toMatch(/Juntada/);
      expect(paginas[2]).toMatch(/\(substituída\)/);
      expect(paginas[2]).toMatch(/Carla Signatária/);
    });

    it('a folha da tela é a folha dos autos: nada foi reescrito na montagem', async () => {
      const idx = meta.indice as any[];
      const pecas = await sql(
        `SELECT id::text AS id, tipo::text AS tipo, versao, versao_atual, folha_inicial, folha_final FROM documentos_fase_interna WHERE licitacao_id = $1 AND folha_inicial IS NOT NULL`,
        [lic.id],
      );
      expect(pecas.length).toBeGreaterThanOrEqual(6);
      for (const p of pecas) {
        const e = idx.find((x) => x.documento_id === p.id && !x.substituida_por) ?? idx.find((x) => x.documento_id === p.id);
        expect({ peca: `${p.tipo} v${p.versao}`, folhas: [e?.folha_inicial, e?.folha_final] }).toEqual({
          peca: `${p.tipo} v${p.versao}`,
          folhas: [p.folha_inicial, p.folha_final],
        });
      }
      // e o livro de juntadas bate com o índice
      const livro = await sql(`SELECT folha_inicial FROM juntadas_autos WHERE licitacao_id = $1 ORDER BY folha_inicial`, [lic.id]);
      expect(livro.map((l: any) => l.folha_inicial)).toEqual(idx.map((e) => e.folha_inicial));
    });
  });

  // ==========================================================================
  describe('B. cache pela impressão das juntadas', () => {
    it('nada mudou → o mesmo arquivo; peça nova → DESATUALIZADO e nova montagem (folha nova no fim, anterior mantida)', async () => {
      const antes = await situacao();
      expect(antes.situacao).toBe('PRONTO');
      const a1 = await baixar();
      const a2 = await baixar();
      expect(a2.impressao).toBe(a1.impressao);
      expect((await situacao()).gerado_em).toBe(antes.gerado_em);
      expect((await situacao()).hash).toBe(antes.hash);

      const r = await anexar('AA', await pdfPaginas('DESPACHONOVO', 2), diaBrasilia(), 'Despacho 002/2026');
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ folha_inicial: antes.folhas + 1, folha_final: antes.folhas + 2 }); // a folha da tela
      await esperar();
      const depois = await situacao();
      expect(depois.situacao).toBe('DESATUALIZADO');
      expect(depois.hash).not.toBe(antes.hash);
      expect(depois.anterior).toMatchObject({ folhas: antes.folhas });
      // o GET monta na hora (fila) quando não há cache
      const novo = await baixar();
      expect(novo.impressao).not.toBe(a1.impressao);
      expect(novo.folhas).toBe(antes.folhas + 2); // a versão nova (2 páginas) entra no fim; nada sai
      const paginas = ((await paginasDoPdf(novo.buffer)) ?? []).map((t) => t.replace(/\s+/g, ' '));
      const pre = paginas.length - novo.folhas - 1;
      expect(paginas[pre + antes.folhas]).toMatch(/DESPACHONOVO PAGINA 1 DE 2/);
      expect(paginas[pre + antes.folhas]).toContain(carimboDeFolha(antes.folhas + 1));
      const velho = paginas.findIndex((t) => /DESPACHO PAGINA 1 DE 1/.test(t));
      expect(velho).toBeGreaterThanOrEqual(pre);
      expect(paginas[velho]).toMatch(new RegExp(`Substituída pela versão 2 — fls\\. ${antes.folhas + 1}–${antes.folhas + 2}`));
    });
  });

  // ==========================================================================
  describe('C. depois de publicar: aviso, Diário Oficial e registro das publicações', () => {
    it('entram na ordem em que foram juntados: aviso (na publicação), página do Diário Oficial, registro (ao pedir os autos)', async () => {
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(A.token)).expect(200);
      await gerarAvisoDispensa(ctx, lic);
      const pub = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(agente.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(pub.status).toBe(200);
      await esperar();
      const d = await http()
        .post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`)
        .set(bearer(agente.token))
        .field('numero_edicao', 'nº 777')
        .field('data_publicacao', diaBrasilia())
        .field('pagina', '3')
        .attach('arquivo', await pdfPaginas('DIARIOOFICIAL', 1), { filename: 'do.pdf', contentType: 'application/pdf' });
      expect(d.status).toBe(201);
      await esperar();
      const { buffer, folhas } = await baixar();
      const paginas = ((await paginasDoPdf(buffer)) ?? []).map((t) => t.replace(/\s+/g, ' '));
      const pre = paginas.length - folhas - 1;
      const onde = (re: RegExp) => paginas.findIndex((t, i) => i >= pre && re.test(t));
      const just = onde(/TERMO DE JUSTIFICATIVAS/);
      const aviso = onde(/AVISO DE CONTRATAÇÃO DIRETA/);
      const diario = onde(/DIARIOOFICIAL PAGINA 1 DE 1/);
      const registro = onde(/REGISTRO DAS PUBLICAÇÕES/);
      expect(just).toBeGreaterThanOrEqual(pre);
      expect(aviso).toBeGreaterThan(just);
      expect(diario).toBeGreaterThan(aviso);
      expect(registro).toBeGreaterThan(diario);
      expect(paginas[registro]).toMatch(/Diário Oficial nº 777, p\. 3/);
      for (let f = 1; f <= folhas; f++) expect(paginas[pre + f - 1]).toContain(carimboDeFolha(f));
    });
  });

  // ==========================================================================
  describe('E. desempenho — processo com 200 folhas', () => {
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
      expect(s.folhas).toBe(200); // as 200 folhas do DFD (capa, abertura, índice e encerramento sem folha)
      const pdf = await http().get(`/api/licitacoes/${grande.id}/processo-pdf`).set(bearer(agente.token)).buffer(true).parse(binario).expect(200);
      const paginas = (await paginasDoPdf(pdf.body as Buffer)) ?? [];
      expect(paginas.length).toBe(204);
      expect(paginas[3]).toContain(carimboDeFolha(1));
      expect(paginas[202]).toContain(carimboDeFolha(200));
      expect(paginas[153]).toContain(carimboDeFolha(151));
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
