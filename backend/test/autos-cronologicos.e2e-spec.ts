/**
 * AUTOS EM ORDEM CRONOLÓGICA DE JUNTADA (decisão do dono de 27/09/2026 —
 * "como no papel"; Lei nº 9.784/1999, art. 22, §4º). Relatório da
 * homologação com vários usuários, seção "9 · Autos" e E4.
 *
 *  A. Processo com juntadas intercaladas — peça anexada, despacho de
 *     tramitação, peça anexada e a versão que a substitui, peça gerada no
 *     sistema, despacho, parecer: o PDF segue a ORDEM DE JUNTADA; cada
 *     documento na folha mostrada na tela no momento da juntada; os
 *     despachos intercalados; a versão substituída presente e anotada; o
 *     índice com a data de juntada; carimbo contínuo; nenhuma página em
 *     branco; nenhum "{{" nem "A definir" (cadastro do órgão com
 *     "A definir"/SP); o despacho nº 1 (posse inicial) no termo de abertura e
 *     na linha do tempo; a situação continua PRONTO logo depois de gerar.
 *  B. Juntada cancelada: a folha sai "sem documento", o índice explica, as
 *     folhas seguintes não mudam.
 *  C. Dados existentes (migração de boot): processo na fase interna com as
 *     folhas da regra anterior é recalculado UMA vez pela ordem de juntada
 *     (registro no processo); processo já publicado fica na regra anterior
 *     (sem mudar folha nenhuma); a migração é idempotente.
 *  D. Isolamento: a linha do tempo e os autos só para o órgão dono.
 *
 * As peças seguem a ORDEM DO FLUXO (frente A — isolamento das peças por
 * etapa): a demanda aprovada antes das outras peças; as etapas de que as
 * minutas dependem (ETP, pesquisa, reserva) cumpridas antes do relatório do
 * agente; as minutas antes do parecer. Quem junta é o administrador do órgão
 * (pode trabalhar fora da posse, com registro no histórico).
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
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
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { MinutasSubscriber } from '../src/fase-interna/telas/minutas.subscriber';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';
import { TramitacaoService } from '../src/fase-interna/tramitacao.service';
import { MigracaoAutosCronologicosBootService } from '../src/fase-interna/migracao-autos-cronologicos-boot.service';
import { paginasDoPdf } from '../src/fase-interna/conformidade/texto-pdf';
import { carimboDeFolha } from '../src/licitacoes/autos/autos-regras';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const diaBrasilia = (diasAtras = 0) => new Date(Date.now() - 3 * 3_600_000 - diasAtras * 86_400_000).toISOString().slice(0, 10);

const binario = (res: any, cb: (e: Error | null, b: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

async function pdfPaginas(rotulo: string, n: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) d.addPage([595, 842]).drawText(`${rotulo} PAGINA ${i} DE ${n}`, { x: 50, y: 700, size: 14, font: f });
  return Buffer.from(await d.save());
}

describe('Autos em ordem cronológica de juntada', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let admin: UsuarioOrgaoFixture;
  let sCompras: string;
  let sJuridico: string;
  let sGabinete: string;
  let lic: LicitacaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = async () => {
    await ctx.app.get(MinutasSubscriber).aguardarPendentes();
    await ctx.app.get(TarefasService).aguardarPendentes();
  };
  const anexar = (l: { id: string }, tipo: string, arquivo: Buffer, numero = `${tipo} 001/2026`) =>
    http()
      .post(`/api/fase-interna/${l.id}/documentos/${tipo}/anexo`)
      .set(bearer(admin.token))
      .field('data_documento', diaBrasilia())
      .field('numero_peca', numero)
      .field('signatarios', JSON.stringify([{ nome: 'Rita Requisitante', cargo: 'Diretora' }]))
      .attach('arquivo', arquivo, { filename: `${tipo}.pdf`, contentType: 'application/pdf' });
  const aprovarDemanda = async (l: { id: string }) => {
    await esperar();
    const et = (await http().get(`/api/fase-interna/${l.id}/etapas`).set(bearer(A.token)).expect(200)).body;
    if (!et.aprovacao_demanda?.pode_aprovar) return; // sem aprovação exigida ou já aprovada
    const r = await http().post(`/api/fase-interna/${l.id}/demanda/aprovar`).set(bearer(A.token)).send({});
    expect({ status: r.status, erro: r.status === 201 ? null : r.body?.message }).toEqual({ status: 201, erro: null });
    await esperar();
  };
  /** Anexa (1 folha cada) as peças ainda não prontas da etapa, na ordem do fluxo; devolve as faixas juntadas. */
  const cumprirEtapaComAnexos = async (l: { id: string }, passo: string): Promise<Array<[number, number]>> => {
    const et = (await http().get(`/api/fase-interna/${l.id}/etapas`).set(bearer(A.token)).expect(200)).body;
    const p = (et.etapas ?? []).flatMap((e: any) => e.passos ?? []).find((x: any) => x.passo === passo);
    const faixas: Array<[number, number]> = [];
    for (const peca of (p?.pecas ?? []).filter((x: any) => !x.pronta)) {
      const r = await anexar(l, peca.tipo, await pdfPaginas(`PECA${peca.tipo}CRONO`, 1));
      expect({ tipo: peca.tipo, status: r.status, erro: r.status === 201 ? null : r.body?.message }).toEqual({ tipo: peca.tipo, status: 201, erro: null });
      faixas.push([r.body.folha_inicial, r.body.folha_final]);
      await esperar();
    }
    return faixas;
  };
  const tramitar = (l: { id: string }, corpo: any) => http().post(`/api/fase-interna/${l.id}/tramitar`).set(bearer(admin.token)).send(corpo);
  const gerarAutos = async (l: { id: string }, token = agente.token) => {
    const g = await http().post(`/api/licitacoes/${l.id}/processo-pdf/gerar`).set(bearer(token));
    expect(g.status).toBe(201);
    const limite = Date.now() + 90_000;
    let s: any;
    do {
      s = (await http().get(`/api/licitacoes/${l.id}/processo-pdf/situacao`).set(bearer(token)).expect(200)).body;
      if (s.situacao === 'PRONTO') break;
      if (s.situacao !== 'GERANDO') throw new Error(`autos: situação inesperada ${JSON.stringify(s)}`);
      await new Promise((r) => setTimeout(r, 200));
    } while (Date.now() < limite);
    expect(s.situacao).toBe('PRONTO');
    const r = await http().get(`/api/licitacoes/${l.id}/processo-pdf`).set(bearer(token)).buffer(true).parse(binario);
    expect(r.status).toBe(200);
    const paginas = ((await paginasDoPdf(r.body as Buffer)) ?? []).map((t) => t.replace(/\s+/g, ' '));
    const folhas = Number(r.headers['x-autos-folhas']);
    return { meta: s, paginas, folhas, pre: paginas.length - folhas - 1 };
  };

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara Autos Cronológicos A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Autos B' });
    F = await criarFornecedor(ctx);
    // cadastro do órgão INCOMPLETO, como na homologação ("A definir/SP")
    await sql(`UPDATE orgaos SET cidade = 'A definir', uf = 'SP' WHERE id = $1`, [A.id]);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
    admin = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Adm Autos' });
    sCompras = (await http().post(`/api/orgaos/${A.id}/setores`).set(bearer(A.token)).send({ nome: 'Compras' }).expect(201)).body.id;
    sJuridico = (await http().post(`/api/orgaos/${A.id}/setores`).set(bearer(A.token)).send({ nome: 'Jurídico' }).expect(201)).body.id;
    sGabinete = (await http().post(`/api/orgaos/${A.id}/setores`).set(bearer(A.token)).send({ nome: 'Gabinete' }).expect(201)).body.id;
    // modo "por setor": nenhum envio automático entre as juntadas do teste (a ordem fica só a do roteiro)
    await http().put('/api/fase-interna/configuracao').set(bearer(A.token)).send({ modo: 'POR_SETOR' }).expect(200);
    lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    await sql(`UPDATE licitacoes SET numero_processo = 'CRONO-001/2026', numero_edital = '009/2026' WHERE id = $1`, [lic.id]);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. juntadas intercaladas: ordem de juntada, folhas da tela, versões e despachos', () => {
    const tela: Record<string, [number, number]> = {};
    /** Peças das etapas de que as minutas dependem e as demais minutas (na ordem do fluxo). */
    let antesDoRag: Array<[number, number]> = [];
    let depoisDoRag: Array<[number, number]> = [];
    let autuacao: { de_usuario_nome: string; despacho: string };
    let autos: Awaited<ReturnType<typeof gerarAutos>>;
    const daFolha = (f: number) => autos.paginas[autos.pre + f - 1];

    it('cada juntada recebe a folha seguinte NA HORA (a folha da tela)', async () => {
      // posse inicial (autuação — despacho nº 1, sem folha)
      await ctx.app.get(TramitacaoService).registrarPosseInicial(lic.id, { setor_id: sGabinete }, { finalidade: 'a instrução do processo', por: { id: admin.id, nome: 'Adm Autos' } });
      await esperar();
      const [posse] = await sql(`SELECT sequencia, folha_inicial, despacho_arquivo, de_usuario_nome, despacho FROM tramitacoes_processo WHERE licitacao_id = $1 AND posse_inicial = true`, [lic.id]);
      expect(posse).toMatchObject({ folha_inicial: null, despacho_arquivo: null });
      autuacao = posse;

      let r = await anexar(lic, 'DFD', await pdfPaginas('DFDCRONO', 2));
      expect(r.status).toBe(201);
      tela.DFD = [r.body.folha_inicial, r.body.folha_final];
      expect(tela.DFD).toEqual([1, 2]);
      await esperar();
      // a demanda aprovada (quando o modelo a exige): as outras peças podem começar (a aprovação não junta folha)
      await aprovarDemanda(lic);

      r = await tramitar(lic, { para_setor_id: sCompras, despacho: 'Encaminhe-se a Compras para o termo de referência.' });
      expect({ status: r.status, erro: r.status === 201 ? null : r.body?.message }).toEqual({ status: 201, erro: null });
      tela.D1 = [r.body.folha_inicial, r.body.folha_final];
      expect(tela.D1).toEqual([3, 3]);
      await esperar();

      r = await anexar(lic, 'TR', await pdfPaginas('TRVERSAOUM', 1), 'TR 001/2026');
      tela.TR1 = [r.body.folha_inicial, r.body.folha_final];
      expect(tela.TR1).toEqual([4, 4]);
      await esperar();
      r = await anexar(lic, 'TR', await pdfPaginas('TRVERSAODOIS', 2), 'TR 001/2026 (revisto)');
      tela.TR2 = [r.body.folha_inicial, r.body.folha_final];
      expect(tela.TR2).toEqual([5, 6]);
      expect(r.body.versao).toBe(2);
      await esperar();

      // as etapas de que as minutas dependem (ordem do fluxo): cada juntada na folha seguinte
      for (const passo of ['ETP', 'PESQUISA', 'RESERVA']) antesDoRag.push(...(await cumprirEtapaComAnexos(lic, passo)));
      expect(antesDoRag.length).toBeGreaterThanOrEqual(3);
      antesDoRag.forEach((f, i) => expect(f[0]).toBe((i ? antesDoRag[i - 1][1] : tela.TR2[1]) + 1));

      // peça GERADA no sistema: juntada quando fica pronta (sincronização, depois do commit)
      const g = await http().post(`/api/fase-interna/${lic.id}/minutas/RAG/gerar`).set(bearer(admin.token));
      expect({ status: g.status, erro: g.status === 201 ? null : g.body?.message }).toEqual({ status: 201, erro: null });
      await esperar();
      const [rag] = await sql(`SELECT folha_inicial, folha_final FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'RAG' AND versao_atual`, [lic.id]);
      expect(rag.folha_inicial).toBe(antesDoRag[antesDoRag.length - 1][1] + 1);
      tela.RAG = [rag.folha_inicial, rag.folha_final];
      // as demais minutas: o parecer vem depois delas (art. 53)
      depoisDoRag = await cumprirEtapaComAnexos(lic, 'MINUTAS');
      const ultimaAntesDoParecer = depoisDoRag.length ? depoisDoRag[depoisDoRag.length - 1][1] : tela.RAG[1];

      r = await tramitar(lic, { para_setor_id: sJuridico, despacho: 'Ao Jurídico, para o parecer.' });
      tela.D2 = [r.body.folha_inicial, r.body.folha_final];
      expect(tela.D2[0]).toBe(ultimaAntesDoParecer + 1);
      await esperar();

      r = await anexar(lic, 'PJ', await pdfPaginas('PARECERCRONO', 3), 'Parecer 010/2026');
      tela.PJ = [r.body.folha_inicial, r.body.folha_final];
      expect(tela.PJ).toEqual([tela.D2[1] + 1, tela.D2[1] + 3]);
      await esperar();
    });

    it('gerar os autos: PRONTO e, logo depois, continua PRONTO (nunca "desatualizado" ao gerar)', async () => {
      autos = await gerarAutos(lic);
      await esperar();
      const s = (await http().get(`/api/licitacoes/${lic.id}/processo-pdf/situacao`).set(bearer(agente.token)).expect(200)).body;
      expect(s.situacao).toBe('PRONTO');
      expect(s.hash).toBe(autos.meta.hash);
    });

    it('o PDF segue a ordem de JUNTADA, com os despachos intercalados, e cada documento na folha da tela', async () => {
      expect(autos.pre).toBe(3);
      expect(autos.folhas).toBe(tela.PJ[1]);
      expect(daFolha(tela.DFD[0])).toMatch(/DFDCRONO PAGINA 1 DE 2/);
      expect(daFolha(tela.D1[0])).toMatch(/DESPACHO DE TRAMITAÇÃO Nº \d+/);
      expect(daFolha(tela.D1[0])).toMatch(/termo de referência/);
      expect(daFolha(tela.TR1[0])).toMatch(/TRVERSAOUM PAGINA 1 DE 1/);
      expect(daFolha(tela.TR2[0])).toMatch(/TRVERSAODOIS PAGINA 1 DE 2/);
      expect(daFolha(tela.RAG[0])).toMatch(/[Rr]elat[óo]rio do agente/);
      expect(daFolha(tela.D2[0])).toMatch(/Ao Jurídico, para o parecer/);
      expect(daFolha(tela.PJ[0])).toMatch(/PARECERCRONO PAGINA 1 DE 3/);
      expect(daFolha(tela.PJ[1])).toMatch(/PARECERCRONO PAGINA 3 DE 3/);
      // carimbo contínuo, sem pular; nenhuma página em branco; nenhum defeito de texto
      for (let f = 1; f <= autos.folhas; f++) expect(daFolha(f)).toContain(carimboDeFolha(f));
      autos.paginas.forEach((t, i) => {
        expect({ pagina: i + 1, vazia: t.replace(/Fl\. \d{6}/g, '').trim().length < 15 }).toEqual({ pagina: i + 1, vazia: false });
        expect({ pagina: i + 1, defeito: /\{\{|A definir/i.test(t) }).toEqual({ pagina: i + 1, defeito: false });
      });
      // o despacho sai com a data, sem "A definir/SP"
      expect(daFolha(tela.D1[0])).toMatch(/\d{1,2} de [a-zç]+ de \d{4}\./);
      expect(daFolha(tela.D1[0])).not.toMatch(/SP, \d/);
    });

    it('a versão substituída CONTINUA nos autos, na folha original, anotada; a nova cita a que substitui', async () => {
      expect(daFolha(tela.TR1[0])).toMatch(/Substituída pela versão 2 — fls\. 5–6/);
      expect(daFolha(tela.TR2[0])).toMatch(/Substitui a fl\. 4/);
      const [v1] = await sql(`SELECT status::text AS status, folha_inicial FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'TR' AND versao = 1`, [lic.id]);
      expect(v1).toEqual({ status: 'SUBSTITUIDO', folha_inicial: 4 });
    });

    it('o índice: ordem das folhas, data de JUNTADA em todas, substituída marcada; as folhas batem com a tela', async () => {
      const idx = autos.meta.indice as any[];
      expect(idx.map((e) => [e.folha_inicial, e.folha_final])).toEqual([tela.DFD, tela.D1, tela.TR1, tela.TR2, ...antesDoRag, tela.RAG, ...depoisDoRag, tela.D2, tela.PJ]);
      expect(idx.every((e) => e.juntado_em && !Number.isNaN(Date.parse(e.juntado_em)))).toBe(true);
      const datas = idx.map((e) => Date.parse(e.juntado_em));
      expect(datas).toEqual([...datas].sort((a, b) => a - b));
      expect(idx[2]).toMatchObject({ substituida_por: { versao: 2, folha_inicial: 5, folha_final: 6 } });
      expect(idx[3]).toMatchObject({ substitui: { folha_inicial: 4, folha_final: 4 } });
      expect(idx[1].tramitacao_id).toBeTruthy();
      expect(autos.paginas[2]).toMatch(/Juntada/);
      expect(autos.paginas[2]).toMatch(/\(substituída\)/);
      // a tramitação e as peças NÃO foram reescritas pela montagem
      const trs = await sql(`SELECT folha_inicial, folha_final FROM tramitacoes_processo WHERE licitacao_id = $1 AND folha_inicial IS NOT NULL ORDER BY sequencia`, [lic.id]);
      expect(trs.map((t: any) => [t.folha_inicial, t.folha_final])).toEqual([tela.D1, tela.D2]);
      const [pj] = await sql(`SELECT folha_inicial, folha_final FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'PJ' AND versao_atual`, [lic.id]);
      expect([pj.folha_inicial, pj.folha_final]).toEqual(tela.PJ);
    });

    it('despacho nº 1 (posse inicial): é o termo de autuação/abertura — nos autos e na linha do tempo', async () => {
      const abertura = autos.paginas[1];
      expect(abertura).toMatch(/TERMO DE ABERTURA/);
      expect(abertura).toMatch(/DESPACHO DE AUTUAÇÃO/);
      expect(abertura).toMatch(/Autue-se e encaminhe-se/);
      expect(abertura).toContain(autuacao.de_usuario_nome);
      expect(abertura).toMatch(/horário de Brasília/);
      const linha = (await http().get(`/api/fase-interna/${lic.id}/tramitacao/linha-do-tempo`).set(bearer(agente.token)).expect(200)).body;
      const eventos = Array.isArray(linha) ? linha : linha.eventos;
      const posse = eventos.find((e: any) => e.folha === null && e.tipo === 'ENVIO');
      expect(posse).toMatchObject({ nos_autos: 'Termo de abertura (autuação)' });
    });
  });

  // ==========================================================================
  describe('B. juntada cancelada: folha sem documento, sem renumerar', () => {
    it('a folha sai com a certidão "folha sem documento"; o índice explica; as seguintes não mudam', async () => {
      await sql(
        `UPDATE juntadas_autos SET cancelada_em = now(), motivo_cancelamento = 'juntada por engano' WHERE licitacao_id = $1 AND folha_inicial = 4`,
        [lic.id],
      );
      const autos = await gerarAutos(lic);
      const idx = autos.meta.indice as any[];
      const lacuna = idx.find((e) => e.folha_inicial === 4);
      expect(lacuna).toMatchObject({ sem_documento: true, folha_final: 4 });
      expect(lacuna.observacao).toMatch(/Juntada cancelada em \d{2}\/\d{2}\/\d{4}.*juntada por engano/);
      expect(autos.paginas[autos.pre + 3]).toMatch(/FOLHA SEM DOCUMENTO/);
      expect(autos.paginas[autos.pre + 3]).toContain(carimboDeFolha(4));
      expect(autos.paginas[autos.pre + 4]).toMatch(/TRVERSAODOIS PAGINA 1 DE 2/); // fl. 5, como antes
      expect(autos.paginas[autos.paginas.length - 1]).toMatch(/Folhas sem documento/);
      for (let f = 1; f <= autos.folhas; f++) expect(autos.paginas[autos.pre + f - 1]).toContain(carimboDeFolha(f));
    });
  });

  // ==========================================================================
  describe('C. dados existentes: migração de boot (uma vez)', () => {
    let interna: LicitacaoFixture;
    let publicada: LicitacaoFixture;
    const migracao = () => ctx.app.get(MigracaoAutosCronologicosBootService);

    it('processo na FASE INTERNA com folhas da regra anterior: recalculadas pela ordem de juntada, com registro', async () => {
      interna = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      expect((await anexar(interna, 'DFD', await pdfPaginas('MIGDFD', 2))).status).toBe(201);
      await aprovarDemanda(interna);
      const t = (await tramitar(interna, { para_setor_id: sCompras, despacho: 'A Compras.' }).expect(201)).body;
      expect((await anexar(interna, 'ETP', await pdfPaginas('MIGETP', 1))).status).toBe(201);
      await esperar();
      // como a regra anterior deixava: sem livro, peças renumeradas pela ordem lógica (capa=1…) e despachos no fim
      await sql(`DELETE FROM juntadas_autos WHERE licitacao_id = $1`, [interna.id]);
      await sql(`DELETE FROM autos_processo WHERE licitacao_id = $1`, [interna.id]);
      await sql(`UPDATE documentos_fase_interna SET folha_inicial = 4, folha_final = 5 WHERE licitacao_id = $1 AND tipo::text = 'DFD'`, [interna.id]);
      await sql(`UPDATE documentos_fase_interna SET folha_inicial = 6, folha_final = 6 WHERE licitacao_id = $1 AND tipo::text = 'ETP'`, [interna.id]);
      await sql(`UPDATE tramitacoes_processo SET folha_inicial = 7, folha_final = 7 WHERE id = $1`, [t.id]);

      const r = await migracao().executarMigracao();
      expect(r.renumerados).toBeGreaterThanOrEqual(1);
      const folha = async (tipo: string) =>
        (await sql(`SELECT folha_inicial, folha_final FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = $2`, [interna.id, tipo]))[0];
      expect(await folha('DFD')).toEqual({ folha_inicial: 1, folha_final: 2 });
      expect((await sql(`SELECT folha_inicial FROM tramitacoes_processo WHERE id = $1`, [t.id]))[0].folha_inicial).toBe(3);
      expect(await folha('ETP')).toEqual({ folha_inicial: 4, folha_final: 4 });
      const [reg] = await sql(`SELECT regime, motivo, detalhe FROM autos_processo WHERE licitacao_id = $1`, [interna.id]);
      expect(reg.regime).toBe('CRONOLOGICO');
      expect(reg.motivo).toMatch(/ordem cronológica de juntada/);
      expect(reg.detalhe.antes.length).toBe(3);
      expect(reg.detalhe.depois.length).toBe(3);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao = 'AUTOS_RENUMERADOS'`, [interna.id]);
      expect(log.descricao).toMatch(/Folhas recalculadas uma vez/);
      const livro = await sql(`SELECT folha_inicial, renumerada FROM juntadas_autos WHERE licitacao_id = $1 ORDER BY folha_inicial`, [interna.id]);
      expect(livro).toEqual([
        { folha_inicial: 1, renumerada: true },
        { folha_inicial: 3, renumerada: true },
        { folha_inicial: 4, renumerada: true },
      ]);
      // a próxima juntada continua a sequência; os autos batem com a tela
      expect((await anexar(interna, 'TR', await pdfPaginas('MIGTR', 1))).body.folha_inicial).toBe(5);
      const autos = await gerarAutos(interna);
      expect(autos.meta.indice.map((e: any) => e.folha_inicial)).toEqual([1, 3, 4, 5]);
      expect(autos.paginas[autos.pre + 2]).toMatch(/DESPACHO DE TRAMITAÇÃO/);
    });

    it('processo JÁ PUBLICADO com autos da regra anterior: fica na regra anterior (nenhuma folha muda), com o motivo', async () => {
      publicada = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      expect((await anexar(publicada, 'DFD', await pdfPaginas('LEGDFD', 2))).status).toBe(201);
      await esperar();
      await sql(`DELETE FROM juntadas_autos WHERE licitacao_id = $1`, [publicada.id]);
      await sql(`DELETE FROM autos_processo WHERE licitacao_id = $1`, [publicada.id]);
      await sql(`UPDATE documentos_fase_interna SET folha_inicial = 4, folha_final = 5 WHERE licitacao_id = $1`, [publicada.id]);
      await sql(`UPDATE licitacoes SET fase = 'PUBLICADO' WHERE id = $1`, [publicada.id]);

      const r = await migracao().executarMigracao();
      expect(r.legados).toBeGreaterThanOrEqual(1);
      const [reg] = await sql(`SELECT regime, motivo FROM autos_processo WHERE licitacao_id = $1`, [publicada.id]);
      expect(reg.regime).toBe('LOGICO_LEGADO');
      expect(reg.motivo).toMatch(/já publicado/);
      expect((await sql(`SELECT folha_inicial FROM documentos_fase_interna WHERE licitacao_id = $1`, [publicada.id]))[0].folha_inicial).toBe(4);
      expect(await sql(`SELECT 1 FROM juntadas_autos WHERE licitacao_id = $1`, [publicada.id])).toEqual([]);
      // os autos saem como saíam: capa na fl. 1, peças na ordem lógica, DFD às fls. 4–5
      const autos = await gerarAutos(publicada);
      expect(autos.pre).toBe(-1); // regra anterior: todas as páginas são folhas (capa = fl. 1)
      expect(autos.paginas[0]).toContain(carimboDeFolha(1));
      expect(autos.paginas[3]).toMatch(/LEGDFD PAGINA 1 DE 2/);
      expect(autos.meta.indice.find((e: any) => /Formalização/.test(e.titulo))).toMatchObject({ folha_inicial: 4, folha_final: 5 });
    });

    it('idempotente: rodar de novo não muda nada', async () => {
      const antes = await sql(`SELECT id, folha_inicial FROM juntadas_autos WHERE licitacao_id = ANY($1::uuid[]) ORDER BY id`, [[interna.id, publicada.id, lic.id]]);
      const r = await migracao().executarMigracao();
      expect(r.renumerados).toBe(0);
      expect(r.legados).toBe(0);
      expect(await sql(`SELECT id, folha_inicial FROM juntadas_autos WHERE licitacao_id = ANY($1::uuid[]) ORDER BY id`, [[interna.id, publicada.id, lic.id]])).toEqual(antes);
    });
  });

  // ==========================================================================
  describe('D. isolamento', () => {
    it('autos e linha do tempo: outro órgão 404, fornecedor 403, anônimo 401', async () => {
      const [{ n: antes }] = await sql(`SELECT COUNT(*)::int AS n FROM juntadas_autos WHERE licitacao_id = $1`, [lic.id]);
      for (const rota of [`/api/licitacoes/${lic.id}/processo-pdf/situacao`, `/api/fase-interna/${lic.id}/tramitacao/linha-do-tempo`]) {
        expect((await http().get(rota).set(bearer(B.token))).status).toBe(404);
        expect((await http().get(rota).set(bearer(F.token))).status).toBe(403);
        expect((await http().get(rota)).status).toBe(401);
      }
      await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(B.token)).expect(403);
      await http().post(`/api/licitacoes/${lic.id}/processo-pdf/gerar`).set(bearer(F.token)).expect(403);
      await http().get(`/api/licitacoes/${lic.id}/processo-pdf`).set(bearer(B.token)).expect(404);
      await http().get(`/api/licitacoes/${lic.id}/processo-pdf`).set(bearer(F.token)).expect(403);
      // a tentativa de fora não junta nada
      const [{ n }] = await sql(`SELECT COUNT(*)::int AS n FROM juntadas_autos WHERE licitacao_id = $1`, [lic.id]);
      expect(n).toBe(antes);
    });
  });
});
