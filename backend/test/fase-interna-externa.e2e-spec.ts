/**
 * FASE INTERNA FEITA FORA DO SISTEMA — entrada "já tenho os documentos (PDF)".
 * docs/licitacao/PLANO-FASE-INTERNA.md, §"Entrada: fase interna feita fora".
 *
 *  A. Criar pelo fluxo curto (dispensa, 2 itens, 6 PDFs classificados — DFD,
 *     TR, mapa, informação orçamentária, despacho e parecer — + ETP e riscos
 *     "não se aplica"): processo, itens, peças no checklist, tarefas que
 *     NASCEM concluídas, histórico, etiqueta, conformidade roda.
 *  B. Recusas que não gravam nada: data futura, não-PDF, despacho sem o art. 72,
 *     item sem unidade, número de processo repetido.
 *  C. Falha no meio: o despacho recusado pelo portão B (limite da dispensa)
 *     vira PENDÊNCIA registrada e retomável; falha inesperada nos itens DESFAZ
 *     a criação (nem processo, nem histórico, demanda de volta).
 *  D. "Juntar documentos feitos fora" num processo criado pelo assistente.
 *  E. Demanda de origem.
 *  F. Isolamento: outro órgão (leitura 404 / escrita 403), fornecedor 403,
 *     anônimo 401 — em todos os endpoints novos.
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
  pdfDeTeste,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { FaseInternaExternaService } from '../src/fase-interna/externa/fase-interna-externa.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const amanha = () => new Date(Date.now() - 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
let seq = 0;
const numero = (p = 'PA') => `${p} ${++seq}${Date.now().toString().slice(-6)}/2026`;

interface Arquivo {
  nome: string;
  tipo?: string;
  buffer?: Buffer;
  contentType?: string;
  data?: string;
}

describe('Fase interna feita fora do sistema (entrada "já tenho os documentos")', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let C1: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let agenteC: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = () => ctx.app.get(TarefasService).aguardarPendentes();

  const itensPadrao = [
    { descricao: 'Licença anual de software gerador de caracteres', quantidade: 12, unidade: 'MES', valor_unitario: 900, tipo_item: 'SERVICO' },
    { descricao: 'Treinamento da equipe', quantidade: 1, unidade: 'SERVICO', valor_unitario: 1500, tipo_item: 'SERVICO' },
  ];
  const dadosPadrao = (extra: Record<string, unknown> = {}) => ({
    modalidade: 'DISPENSA_ELETRONICA',
    tipo_contratacao: 'SERVICO',
    fundamento_legal: 'ART75_II',
    objeto: 'Contratação de software gerador de caracteres para a TV Câmara',
    numero_processo: numero(),
    numero_edital: `Dispensa ${seq}/2026`,
    area_demandante: 'Diretoria de Comunicação',
    dispensa_com_lances: false,
    sigilo: { sigiloso: true, justificativa: 'Orçamento sigiloso para não balizar as propostas (art. 24).' },
    itens: itensPadrao,
    ...extra,
  });
  /** Os 6 PDFs do caso A (fora de ordem, como o usuário arrasta). */
  const seisPdfs = (): Arquivo[] => [
    { nome: 'parecer-167-2025.pdf', tipo: 'PJ' },
    { nome: 'despacho-mesa.pdf', tipo: 'AA' },
    { nome: 'dfd.pdf', tipo: 'DFD' },
    { nome: 'termo-referencia.pdf', tipo: 'TR' },
    { nome: 'mapa-certidao.pdf', tipo: 'PP' },
    { nome: 'informacao-orcamentaria.pdf', tipo: 'DO' },
  ];
  const nsaEtpRiscos = [
    { tipo: 'ETP', justificativa: 'Objeto simples e padronizado — estudo técnico dispensado (art. 72, I).' },
    { tipo: 'AR', justificativa: 'Riscos irrelevantes para a contratação (art. 72, I).' },
  ];
  const classificacao = (arquivos: Arquivo[], extra: Record<string, unknown> = {}) => ({
    pecas: arquivos.map((a, i) => ({
      arquivo: i,
      tipo: a.tipo,
      numero_peca: `${a.tipo} 0${i + 1}/2026`,
      data_documento: a.data ?? hoje(),
      signatarios: [{ nome: 'Maria Presidente', cargo: 'Presidente da Mesa' }],
    })),
    nao_se_aplica: nsaEtpRiscos,
    usar_portaria_orgao: false,
    ...extra,
  });
  const anexarArquivos = (req: any, arquivos: Arquivo[]) => {
    for (const a of arquivos) {
      req = req.attach('arquivos', a.buffer ?? pdfDeTeste(`Peca ${a.tipo} ${a.nome}`), { filename: a.nome, contentType: a.contentType ?? 'application/pdf' });
    }
    return req;
  };
  const criar = (token: string, dados: Record<string, unknown>, arquivos: Arquivo[], cls?: Record<string, unknown>) =>
    anexarArquivos(
      http()
        .post('/api/fase-interna/externa/processo')
        .set(bearer(token))
        .field('dados', JSON.stringify({ ...dados, classificacao: cls ?? classificacao(arquivos) })),
      arquivos,
    );
  const juntar = (licId: string, token: string, arquivos: Arquivo[], cls: Record<string, unknown>) =>
    anexarArquivos(http().post(`/api/fase-interna/${licId}/externa/documentos`).set(bearer(token)).field('classificacao', JSON.stringify(cls)), arquivos);
  const processosComNumero = async (n: string) => sql(`SELECT id FROM licitacoes WHERE numero_processo = $1`, [n]);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Externa A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Externa B' });
    C1 = await criarOrgao(ctx, { nome: 'Câmara Externa C (limite)' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
    // DFD consolidado: abrir processo a partir de demanda é da unidade de planejamento (papel PLANEJAMENTO)
    await sql(`UPDATE usuarios SET papeis_fase_interna = COALESCE(papeis_fase_interna, '[]'::jsonb) || '["PLANEJAMENTO"]'::jsonb WHERE id = $1`, [agente.id]);
    agenteC = await criarUsuarioOrgao(ctx, C1, { role: RoleUsuario.PREGOEIRO, nome: 'Caio Agente' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. criar pelo fluxo "feita fora" — dados, itens e 6 PDFs de uma vez', () => {
    let dados: ReturnType<typeof dadosPadrao>;
    let r: any;
    let licId: string;

    beforeAll(async () => {
      dados = dadosPadrao();
      r = await criar(agente.token, dados, seisPdfs());
      licId = r.body?.licitacao_id;
      await esperar();
    });

    it('checklist antes de criar: linhas do art. 72, catálogo de peças, disputa da dispensa com o padrão do órgão', async () => {
      const q = await http()
        .post('/api/fase-interna/externa/checklist')
        .set(bearer(agente.token))
        .send({ modalidade: 'DISPENSA_ELETRONICA', classificadas: ['DFD', 'PP'], nao_se_aplica: ['ETP', 'AR', 'TR'] })
        .expect(201);
      expect(q.body.contratacao_direta).toBe(true);
      expect(q.body.opcoes.map((o: any) => o.tipo)).toEqual(expect.arrayContaining(['DFD', 'PP', 'DO', 'AA', 'DP', 'PJ', 'OUT']));
      const dfd = q.body.checklist.linhas.find((l: any) => l.tipo === 'DFD');
      expect(dfd).toMatchObject({ status: 'OK', origem: 'ARQUIVO', obrigatorio: true });
      expect(q.body.checklist.obrigatorias_pendentes).toEqual(['Autorização da autoridade competente (Art. 72, VIII)']);
      expect(q.body.checklist.antes_da_autorizacao).toEqual(['Art. 72, IV — Compatibilidade orçamentária']);
      expect(q.body.disputa.opcoes).toHaveLength(2);
      expect(q.body.disputa.padrao_do_orgao).toBe(true);
      // licitação (art. 18): sem "não se aplica"
      const l = await http().post('/api/fase-interna/externa/checklist').set(bearer(agente.token)).send({ modalidade: 'PREGAO_ELETRONICO' }).expect(201);
      expect(l.body.contratacao_direta).toBe(false);
      expect(l.body.checklist.linhas.every((x: any) => !x.pode_nao_se_aplicar)).toBe(true);
      expect(l.body.disputa).toBeNull();
    });

    it('processo criado com os dados, os itens (unidade e valor unitário) e as escolhas (disputa, sigilo)', async () => {
      expect(r.status).toBe(201);
      expect(r.body.pendencias).toEqual([]);
      expect(r.body.juntadas.map((j: any) => j.tipo)).toEqual(['DFD', 'TR', 'PP', 'DO', 'AA', 'PJ']);
      expect(r.body.nao_se_aplica).toEqual(['ETP', 'AR']);
      expect(r.body.destino).toBe(`/orgao/processos/${licId}`);
      expect(r.body.conformidade).toBe(`/orgao/processos/${licId}/fase-interna/conformidade`);
      const [lic] = await sql(`SELECT * FROM licitacoes WHERE id = $1`, [licId]);
      expect(lic).toMatchObject({
        orgao_id: A.id,
        numero_processo: dados.numero_processo,
        numero_edital: dados.numero_edital,
        modalidade: 'DISPENSA_ELETRONICA',
        fundamento_legal: 'ART75_II',
        dispensa_com_lances: false,
        sigilo_orcamento: 'SIGILOSO',
        fase: 'PLANEJAMENTO',
      });
      expect(Number(lic.valor_total_estimado)).toBe(12 * 900 + 1500);
      expect(lic.fase_interna_externa).toMatchObject({ modo: 'EXTERNA', por_nome: 'Ana Agente', area_demandante: 'Diretoria de Comunicação', pendencias: [] });
      const itens = await sql(`SELECT numero_item, unidade_medida::text AS un, valor_unitario_estimado::float AS v, quantidade::float AS q FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`, [licId]);
      expect(itens).toEqual([
        { numero_item: 1, un: 'MES', v: 900, q: 12 },
        { numero_item: 2, un: 'SERVICO', v: 1500, q: 1 },
      ]);
    });

    it('peças contam no checklist do art. 72 (anexadas com nº, data, signatários e folhas); área demandante no DFD', async () => {
      const instr = (await http().get(`/api/fase-interna/${licId}/instrucao`).set(bearer(agente.token)).expect(200)).body;
      const st = (t: string) => instr.itens.find((i: any) => i.tipo === t)?.status;
      for (const t of ['DFD', 'TR', 'PP', 'DO', 'AA', 'PJ']) expect(st(t)).toBe('OK');
      expect(st('ETP')).toBe('NAO_SE_APLICA');
      expect(st('AR')).toBe('NAO_SE_APLICA');
      expect(instr.pode_divulgar).toBe(true);
      const aa = instr.itens.find((i: any) => i.tipo === 'AA');
      expect(aa.peca).toMatchObject({ anexada: true, numero_peca: 'AA 02/2026', tem_arquivo: true });
      expect(aa.peca.folha_inicial).toEqual(expect.any(Number));
      const [dfd] = await sql(
        `SELECT origem::text AS origem, status::text AS status, signatarios_informados, dados_estruturados FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo = 'DFD' AND versao_atual`,
        [licId],
      );
      expect(dfd).toMatchObject({ origem: 'ARQUIVO', status: 'IMPORTADO' });
      expect(dfd.signatarios_informados).toEqual([{ nome: 'Maria Presidente', cargo: 'Presidente da Mesa' }]);
      expect(dfd.dados_estruturados._dfd.unidade_requisitante_nome).toBe('Diretoria de Comunicação');
    });

    it('tarefas da E2 NASCEM concluídas para os passos cumpridos (sem tarefa aberta antes), quem cumpriu = quem juntou', async () => {
      const etapas = (await http().get(`/api/fase-interna/${licId}/etapas`).set(bearer(agente.token)).expect(200)).body;
      const concluidos = etapas.etapas.flatMap((e: any) => e.passos).filter((p: any) => p.situacao === 'CONCLUIDO').map((p: any) => p.passo);
      expect(concluidos).toEqual(expect.arrayContaining(['DFD', 'ETP', 'TR', 'PESQUISA', 'RESERVA', 'PARECER']));
      const tarefas = await sql(`SELECT passo, status, concluida_por_nome, chave FROM tarefas WHERE licitacao_id = $1`, [licId]);
      for (const p of concluidos) {
        const t = tarefas.filter((x: any) => x.passo === p && x.chave === `etapa:${p}`);
        expect(t).toHaveLength(1);
        expect(t[0]).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Ana Agente' });
      }
      expect(r.body.tarefas_concluidas).toBe(concluidos.length);
      // nasceram concluídas: nenhuma foi criada ABERTA para esses passos
      const criadas = await sql(`SELECT dados_depois->>'passo' AS passo FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'TAREFA_CRIADA'`, [licId]);
      expect(criadas.map((c: any) => c.passo).filter((p: string) => concluidos.includes(p))).toEqual([]);
      const logs = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'TAREFA_CONCLUIDA'`, [licId]);
      expect(logs.some((l: any) => /juntada ao processo/.test(l.descricao))).toBe(true);
    });

    it('histórico: a escolha "fase interna feita fora" no ato de criação (quem e quando) e no log da fase interna; etiqueta no processo', async () => {
      const hist = (await http().get(`/api/licitacoes/${licId}/transicoes`).set(bearer(agente.token)).expect(200)).body;
      const criar = hist.find((h: any) => h.ato === 'CRIAR');
      expect(criar.resumo).toMatch(/Fase interna feita fora do sistema/);
      expect(criar.ator_nome).toBe('Ana Agente');
      expect(criar.created_at).toBeTruthy();
      const [log] = await sql(`SELECT descricao, dados_depois, usuario_nome FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'DOCUMENTO_IMPORTADO'`, [licId]);
      expect(log.descricao).toMatch(/Fase interna feita fora do sistema — processo criado.*Ana Agente: 6 peça\(s\) juntada\(s\), 2 "não se aplica"/);
      expect(log.dados_depois).toMatchObject({ fase_interna_externa: true, modo: 'EXTERNA', nao_se_aplica: ['ETP', 'AR'] });
      expect(log.usuario_nome).toBe('Ana Agente');
      const completo = (await http().get(`/api/licitacoes/${licId}/processo-completo`).set(bearer(agente.token)).expect(200)).body;
      expect(completo.licitacao.fase_interna_externa).toMatchObject({ modo: 'EXTERNA', por_nome: 'Ana Agente' });
      const sit = (await http().get(`/api/fase-interna/${licId}/externa`).set(bearer(agente.token)).expect(200)).body;
      expect(sit).toMatchObject({ externa: true, modo: 'EXTERNA', por_nome: 'Ana Agente', pendencias: [], pode_juntar: true, juntadas: 8 });
    });

    it('a conformidade (E4) roda sobre as peças anexadas', async () => {
      await http().post(`/api/fase-interna/${licId}/conformidade/revisar`).set(bearer(agente.token)).expect(201);
      await esperar();
      const conf = (await http().get(`/api/fase-interna/${licId}/conformidade`).set(bearer(agente.token)).expect(200)).body;
      expect(conf.aplicavel).toBe(true);
      expect(conf.revisao).toBeTruthy();
      expect(conf.autos.map((x: any) => x.tipo)).toEqual(expect.arrayContaining(['DFD', 'PP', 'AA', 'PJ']));
    });
  });

  // ==========================================================================
  describe('B. recusas que não gravam nada (400, com o passo para corrigir)', () => {
    it('data do documento futura', async () => {
      const dados = dadosPadrao();
      const arqs = seisPdfs().map((a) => (a.tipo === 'TR' ? { ...a, data: amanha() } : a));
      const r = await criar(agente.token, dados, arqs);
      expect(r.status).toBe(400);
      expect(r.body.passo).toBe('DOCUMENTOS');
      expect(r.body.message).toMatch(/termo-referencia\.pdf.*não pode ser futura/);
      expect(await processosComNumero(dados.numero_processo)).toHaveLength(0);
    });

    it('arquivo que não é PDF (conteúdo e extensão)', async () => {
      const dados = dadosPadrao();
      const arqs: Arquivo[] = [
        ...seisPdfs().filter((a) => a.tipo !== 'PJ'),
        { nome: 'parecer.pdf', tipo: 'PJ', buffer: Buffer.from('isto nao e um pdf'), contentType: 'application/pdf' },
        { nome: 'planilha.docx', tipo: 'OUT', buffer: pdfDeTeste('x'), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      ];
      const r = await criar(agente.token, dados, arqs);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/"parecer\.pdf": Só é aceito arquivo PDF/);
      expect(r.body.message).toMatch(/"planilha\.docx": Só é aceito arquivo PDF/);
      expect(r.body.erros.map((e: any) => e.indice)).toEqual(expect.arrayContaining([5, 6]));
      expect(await processosComNumero(dados.numero_processo)).toHaveLength(0);
    });

    it('despacho de autorização sem o que o art. 72 exige antes (sem a informação orçamentária)', async () => {
      const dados = dadosPadrao();
      const arqs = seisPdfs().filter((a) => a.tipo !== 'DO');
      const r = await criar(agente.token, dados, arqs);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Para juntar o despacho de autorização.*Art\. 72, IV — Compatibilidade orçamentária/);
      expect(await processosComNumero(dados.numero_processo)).toHaveLength(0);
    });

    it('item sem unidade e sem valor unitário; número de processo repetido', async () => {
      const dados = dadosPadrao({ itens: [{ descricao: 'Item sem unidade', quantidade: 1, unidade: '', valor_unitario: 0 }] });
      const r = await criar(agente.token, dados, seisPdfs());
      expect(r.status).toBe(400);
      expect(r.body.passo).toBe('ITENS');
      expect(r.body.message).toMatch(/Item 1: informe a unidade de medida/);
      expect(r.body.message).toMatch(/Item 1: informe o valor unitário/);
      expect(await processosComNumero(dados.numero_processo)).toHaveLength(0);
      const [um] = await sql(`SELECT numero_processo FROM licitacoes WHERE orgao_id = $1 LIMIT 1`, [A.id]);
      const dup = await criar(agente.token, dadosPadrao({ numero_processo: um.numero_processo }), seisPdfs());
      expect(dup.status).toBe(400);
      expect(dup.body.message).toMatch(/Já existe um processo administrativo nº .* neste órgão/);
    });
  });

  // ==========================================================================
  describe('C. falha no meio: pendência clara e retomável; falha inesperada desfaz tudo', () => {
    it('despacho recusado pelo portão B (limite da dispensa): processo criado com o resto, pendência registrada; juntar de novo resolve', async () => {
      const dados = dadosPadrao({
        itens: [{ descricao: 'Serviço acima do limite da dispensa', quantidade: 1, unidade: 'SERVICO', valor_unitario: 70000 }],
        sigilo: { sigiloso: false },
      });
      const r = await criar(agenteC.token, dados, seisPdfs());
      expect(r.status).toBe(201);
      const licId = r.body.licitacao_id;
      expect(r.body.juntadas.map((j: any) => j.tipo)).toEqual(['DFD', 'TR', 'PP', 'DO', 'PJ']);
      expect(r.body.pendencias).toHaveLength(1);
      expect(r.body.pendencias[0]).toMatchObject({ tipo: 'AA', arquivo: 'despacho-mesa.pdf', indice: 1 });
      expect(r.body.pendencias[0].erro).toMatch(/LIM-01/);
      await esperar();
      const sit = (await http().get(`/api/fase-interna/${licId}/externa`).set(bearer(agenteC.token)).expect(200)).body;
      expect(sit.pendencias.map((p: any) => p.tipo)).toEqual(['AA']);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'DOCUMENTO_IMPORTADO'`, [licId]);
      expect(log.descricao).toMatch(/1 pendência\(s\): Despacho de autorização — .*LIM-01/);
      // corrigido o valor, a retomada junta o despacho e a pendência some
      await sql(`UPDATE itens_licitacao SET valor_unitario_estimado = 30000, valor_total_estimado = 30000 WHERE licitacao_id = $1`, [licId]);
      const rr = await juntar(licId, agenteC.token, [{ nome: 'despacho-mesa.pdf', tipo: 'AA' }], {
        pecas: [{ arquivo: 0, tipo: 'AA', data_documento: hoje(), numero_peca: 'Despacho 01/2026' }],
      });
      expect(rr.status).toBe(201);
      expect(rr.body.pendencias).toEqual([]);
      expect(rr.body.modo).toBe('EXTERNA');
      await esperar();
      const sit2 = (await http().get(`/api/fase-interna/${licId}/externa`).set(bearer(agenteC.token)).expect(200)).body;
      expect(sit2.pendencias).toEqual([]);
      const instr = (await http().get(`/api/fase-interna/${licId}/instrucao`).set(bearer(agenteC.token)).expect(200)).body;
      expect(instr.itens.find((i: any) => i.tipo === 'AA').status).toBe('OK');
    });

    it('falha inesperada ao gravar os itens: a criação é desfeita (nem processo, nem histórico) e a demanda volta', async () => {
      const [dem] = await sql(
        `INSERT INTO demandas (id, orgao_id, ano_referencia, unidade_requisitante, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 2026, 'Secretaria Falha', 'APROVADA', now(), now()) RETURNING id`,
        [A.id],
      );
      const servico = ctx.app.get(FaseInternaExternaService) as any;
      const espiao = jest.spyOn(servico, 'gravarItens').mockRejectedValueOnce(new Error('falha simulada no banco'));
      const dados = dadosPadrao({ demanda_id: dem.id });
      const r = await criar(agente.token, dados, seisPdfs());
      espiao.mockRestore();
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/nada foi criado.*falha simulada/);
      expect(await processosComNumero(dados.numero_processo)).toHaveLength(0);
      const [d] = await sql(`SELECT status::text AS s FROM demandas WHERE id = $1`, [dem.id]);
      expect(d.s).toBe('APROVADA');
      const orfas = await sql(`SELECT count(*)::int AS n FROM licitacao_transicoes t WHERE NOT EXISTS (SELECT 1 FROM licitacoes l WHERE l.id = t.licitacao_id)`);
      expect(orfas[0].n).toBe(0);
    });
  });

  // ==========================================================================
  describe('D. "Juntar documentos feitos fora" num processo criado pelo assistente', () => {
    it('junta vários PDFs de uma vez; tarefa aberta conclui, as demais nascem concluídas; etiqueta MISTA', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await esperar();
      const [dfdAntes] = await sql(`SELECT id, status FROM tarefas WHERE licitacao_id = $1 AND chave = 'etapa:DFD'`, [lic.id]);
      expect(dfdAntes.status).toBe('ABERTA');
      // o checklist considera o que o processo já tem
      const q = (await http().post(`/api/fase-interna/${lic.id}/externa/checklist`).set(bearer(agente.token)).send({ classificadas: ['DFD'] }).expect(201)).body;
      expect(q.checklist.linhas.find((l: any) => l.tipo === 'DFD')).toMatchObject({ status: 'OK', origem: 'ARQUIVO' });
      const arqs: Arquivo[] = [
        { nome: 'dfd.pdf', tipo: 'DFD' },
        { nome: 'tr.pdf', tipo: 'TR' },
        { nome: 'pesquisa.pdf', tipo: 'PP' },
      ];
      const r = await juntar(lic.id, agente.token, arqs, classificacao(arqs));
      expect(r.status).toBe(201);
      expect(r.body.modo).toBe('MISTA');
      expect(r.body.juntadas.map((j: any) => j.tipo)).toEqual(['DFD', 'TR', 'PP']);
      await esperar();
      const [dfd] = await sql(`SELECT status, concluida_por_nome FROM tarefas WHERE id = $1`, [dfdAntes.id]);
      expect(dfd).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Ana Agente' });
      const ts = await sql(`SELECT passo, status FROM tarefas WHERE licitacao_id = $1 AND passo IN ('ETP','TR','PESQUISA')`, [lic.id]);
      expect(ts.map((t: any) => `${t.passo}:${t.status}`).sort()).toEqual(['ETP:CONCLUIDA', 'PESQUISA:CONCLUIDA', 'TR:CONCLUIDA']);
      const [l] = await sql(`SELECT fase_interna_externa FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.fase_interna_externa).toMatchObject({ modo: 'MISTA', por_nome: 'Ana Agente' });
      // a próxima juntada: peça já pronta → nova versão; "não se aplica" de peça pronta é recusado
      const nsa = await juntar(lic.id, agente.token, [], { pecas: [], nao_se_aplica: [{ tipo: 'TR', justificativa: 'Não precisa mais do TR aqui.' }] });
      expect(nsa.status).toBe(400);
      expect(nsa.body.message).toMatch(/já está pronta no processo/);
      const vazio = await juntar(lic.id, agente.token, [], { pecas: [] });
      expect(vazio.status).toBe(400);
      expect(vazio.body.message).toMatch(/Nada para juntar/);
    });

    it('processo divulgado: a juntada é recusada (409)', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await sql(`UPDATE licitacoes SET fase = 'PUBLICADO' WHERE id = $1`, [lic.id]);
      const r = await juntar(lic.id, agente.token, [{ nome: 'dfd.pdf', tipo: 'DFD' }], classificacao([{ nome: 'dfd.pdf', tipo: 'DFD' }], { nao_se_aplica: [] }));
      expect(r.status).toBe(409);
    });
  });

  // ==========================================================================
  describe('E. demanda de origem', () => {
    it('cria com a demanda (processo vinculado, demanda em contratação); demanda de outro órgão não', async () => {
      const [dem] = await sql(
        `INSERT INTO demandas (id, orgao_id, ano_referencia, unidade_requisitante, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 2026, 'Secretaria de Obras', 'APROVADA', now(), now()) RETURNING id`,
        [A.id],
      );
      const dados = dadosPadrao({ demanda_id: dem.id });
      const r = await criar(agente.token, dados, seisPdfs());
      expect(r.status).toBe(201);
      const [lic] = await sql(`SELECT demanda_id::text AS demanda_id FROM licitacoes WHERE id = $1`, [r.body.licitacao_id]);
      expect(lic.demanda_id).toBe(dem.id);
      const [d] = await sql(`SELECT status::text AS s FROM demandas WHERE id = $1`, [dem.id]);
      expect(d.s).toBe('EM_CONTRATACAO');
      // a mesma demanda não origina outro processo; demanda de outro órgão: não encontrada
      const de2 = dadosPadrao({ demanda_id: dem.id });
      const r2 = await criar(agente.token, de2, seisPdfs());
      expect(r2.status).toBe(400);
      // já em contratação: não origina outro processo
      expect(r2.body.message).toMatch(/Apenas demandas aprovadas|já originou o processo/);
      const [demB] = await sql(
        `INSERT INTO demandas (id, orgao_id, ano_referencia, unidade_requisitante, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 2026, 'Secretaria de B', 'APROVADA', now(), now()) RETURNING id`,
        [B.id],
      );
      const r3 = await criar(agente.token, dadosPadrao({ demanda_id: demB.id }), seisPdfs());
      expect(r3.status).toBe(400);
      expect(r3.body.message).toMatch(/Demanda não encontrada/);
    });

    it('fase interna feita fora a partir do DFD consolidado (N demandas → 1 processo, vínculo pela tabela de ligação)', async () => {
      const ids: string[] = [];
      for (const setor of ['Setor DFD 1', 'Setor DFD 2']) {
        const [dem] = await sql(
          `INSERT INTO demandas (id, orgao_id, ano_referencia, unidade_requisitante, status, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 2026, $2, 'APROVADA', now(), now()) RETURNING id`,
          [A.id, setor],
        );
        await sql(
          `INSERT INTO itens_demanda (demanda_id, categoria, descricao_objeto, quantidade_estimada, unidade_medida, valor_unitario_estimado, valor_total_estimado, codigo_item_catalogo)
           VALUES ($1, 'MATERIAL', 'Cadeira giratória', 2, 'UN', 500, 1000, 'M-CAD-1')`,
          [dem.id],
        );
        ids.push(dem.id);
      }
      const dfd = (await http().post('/api/dfds-consolidados').set(bearer(agente.token)).send({ demanda_ids: ids }).expect(201)).body;
      expect(dfd.itens).toHaveLength(1);
      expect(dfd.itens[0].quantidade).toBe(4);
      const dados = dadosPadrao({ dfd_id: dfd.id });
      const r = await criar(agente.token, dados, seisPdfs());
      expect(r.status).toBe(201);
      const [lic] = await sql(`SELECT demanda_id FROM licitacoes WHERE id = $1`, [r.body.licitacao_id]);
      expect(lic.demanda_id).toBeNull();
      const [f] = await sql(`SELECT status, licitacao_id::text AS licitacao_id FROM dfds_consolidados WHERE id = $1`, [dfd.id]);
      expect(f).toEqual({ status: 'EM_PROCESSO', licitacao_id: r.body.licitacao_id });
      const st = await sql(`SELECT status::text AS s FROM demandas WHERE id = ANY($1::uuid[])`, [ids]);
      expect(st.map((x: any) => x.s)).toEqual(['EM_CONTRATACAO', 'EM_CONTRATACAO']);
      // o mesmo DFD não abre outro processo
      const r2 = await criar(agente.token, dadosPadrao({ dfd_id: dfd.id }), seisPdfs());
      expect(r2.status).toBe(400);
      expect(r2.body.message).toMatch(/já abriu o processo/);
    });

    it('só a unidade de planejamento abre o processo a partir da demanda (sem o papel → 403, nada criado)', async () => {
      const [dem] = await sql(
        `INSERT INTO demandas (id, orgao_id, ano_referencia, unidade_requisitante, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 2026, 'Secretaria sem planejamento', 'APROVADA', now(), now()) RETURNING id`,
        [A.id],
      );
      const semPapel = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Beto Sem Papel' });
      const dados = dadosPadrao({ demanda_id: dem.id });
      const r = await criar(semPapel.token, dados, seisPdfs());
      expect(r.status).toBe(403);
      expect(await processosComNumero(dados.numero_processo)).toHaveLength(0);
      const [d] = await sql(`SELECT status::text AS s FROM demandas WHERE id = $1`, [dem.id]);
      expect(d.s).toBe('APROVADA');
    });
  });

  // ==========================================================================
  describe('F. isolamento', () => {
    let licA: string;

    beforeAll(async () => {
      const r = await criar(agente.token, dadosPadrao(), seisPdfs());
      licA = r.body.licitacao_id;
    });

    it('criar: fornecedor 403, anônimo 401 (nada gravado); o órgão é sempre o do token', async () => {
      const d1 = dadosPadrao();
      expect((await criar(F.token, d1, seisPdfs())).status).toBe(403);
      const semToken = anexarArquivos(http().post('/api/fase-interna/externa/processo').field('dados', JSON.stringify(d1)), seisPdfs());
      expect((await semToken).status).toBe(401);
      expect(await processosComNumero(d1.numero_processo)).toHaveLength(0);
      const d2 = dadosPadrao({ orgao_id: A.id });
      const r = await criar(B.token, d2, seisPdfs());
      expect(r.status).toBe(201);
      const [lic] = await sql(`SELECT orgao_id::text AS orgao_id FROM licitacoes WHERE id = $1`, [r.body.licitacao_id]);
      expect(lic.orgao_id).toBe(B.id);
      expect((await http().post('/api/fase-interna/externa/checklist').set(bearer(F.token)).send({ modalidade: 'DISPENSA_ELETRONICA' })).status).toBe(403);
      expect((await http().post('/api/fase-interna/externa/checklist').send({ modalidade: 'DISPENSA_ELETRONICA' })).status).toBe(401);
    });

    it('situação e checklist do processo: outro órgão 404/403, fornecedor 403, anônimo 401', async () => {
      expect((await http().get(`/api/fase-interna/${licA}/externa`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/fase-interna/${licA}/externa`).set(bearer(F.token))).status).toBe(403);
      expect((await http().get(`/api/fase-interna/${licA}/externa`)).status).toBe(401);
      expect((await http().post(`/api/fase-interna/${licA}/externa/checklist`).set(bearer(B.token)).send({})).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${licA}/externa/checklist`).set(bearer(F.token)).send({})).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${licA}/externa/checklist`).send({})).status).toBe(401);
    });

    it('juntar: outro órgão 403 (nada gravado), fornecedor 403, anônimo 401', async () => {
      const antes = await sql(`SELECT count(*)::int AS n FROM documentos_fase_interna WHERE licitacao_id = $1`, [licA]);
      const arq: Arquivo[] = [{ nome: 'outro.pdf', tipo: 'OUT' }];
      const cls = { pecas: [{ arquivo: 0, tipo: 'OUT', data_documento: hoje() }] };
      expect((await juntar(licA, B.token, arq, cls)).status).toBe(403);
      expect((await juntar(licA, F.token, arq, cls)).status).toBe(403);
      const semToken = anexarArquivos(http().post(`/api/fase-interna/${licA}/externa/documentos`).field('classificacao', JSON.stringify(cls)), arq);
      expect((await semToken).status).toBe(401);
      const depois = await sql(`SELECT count(*)::int AS n FROM documentos_fase_interna WHERE licitacao_id = $1`, [licA]);
      expect(depois[0].n).toBe(antes[0].n);
    });
  });
});
