/**
 * NÚMERO DO PROCESSO ADMINISTRATIVO — gerador único (decisão do dono, 27/09/2026).
 *
 *  1. Unicidade por órgão: a restrição antiga (só na coluna) sai no boot; a nova
 *     é (órgão, nº) — dois órgãos podem ter "2026/00001".
 *  2. Sem número digitado → o sistema gera, sequencial POR ÓRGÃO e ANO, no
 *     formato que o servidor já usava (AAAA/NNNNN); sequências independentes.
 *  3. Criação simultânea (N em paralelo) nunca duplica.
 *  4. Número digitado aceito; repetido no mesmo órgão → 409 claro; o mesmo
 *     número em outro órgão → aceito; digitado no formato gerado é pulado.
 *  5. Todos os caminhos de criação usam o gerador: assistente (POST
 *     /licitacoes), demanda/DFD, credenciamento, importação, fase interna feita
 *     fora (número dos autos, único no órgão).
 *  6. Processos antigos não são renumerados; a sequência começa depois do
 *     maior número existente do órgão/ano no formato (boot idempotente).
 *  7. Máscara do órgão (Configurações › Parâmetros de licitação) com prévia;
 *     isolamento (órgão do JWT; fornecedor 403; anônimo 401).
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  criarApp,
  criarFornecedor,
  criarOrgao,
  criarUsuarioOrgao,
  pdfDeTeste,
} from './support';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { NumeroProcessoService, UQ_LICITACOES_ORGAO_NUMERO_PROCESSO } from '../src/numero-processo/numero-processo.service';
import { anoBrasilia } from '../src/numero-processo/mascara-numero-processo';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const ANO = anoBrasilia();
const fmt = (n: number) => `${ANO}/${String(n).padStart(5, '0')}`;

describe('Nº do processo administrativo — gerador único por órgão/ano', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const numeros = () => ctx.app.get(NumeroProcessoService);
  /** Próximo número automático esperado do órgão A (conta os gerados). */
  let proximoA = 1;

  /** Criação pelo assistente "Novo processo" (POST /licitacoes). */
  const criarPeloAssistente = (org: OrgaoFixture, extra: Record<string, unknown> = {}) =>
    http()
      .post('/api/licitacoes')
      .set(bearer(org.token))
      .send({
        orgao_id: org.id,
        objeto: 'Aquisição de material de expediente para as secretarias',
        modalidade: 'PREGAO_ELETRONICO',
        tipo_contratacao: 'COMPRA',
        criterio_julgamento: 'MENOR_PRECO',
        modo_disputa: 'ABERTO',
        valor_total_estimado: 1000,
        ...extra,
      });
  const numeroDe = async (id: string) => (await sql(`SELECT numero_processo FROM licitacoes WHERE id = $1`, [id]))[0]?.numero_processo;

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Numeração A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Numeração B' });
    F = await criarFornecedor(ctx);
  });

  afterAll(async () => {
    await ctx.app.get(TarefasService)?.aguardarPendentes().catch(() => undefined);
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. unicidade por órgão (boot)', () => {
    it('a restrição nova (órgão + nº) existe; a antiga só na coluna é removida pelo boot', async () => {
      const [nova] = await sql(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [UQ_LICITACOES_ORGAO_NUMERO_PROCESSO]);
      expect(nova).toBeTruthy();
      // Simula o banco antigo: unicidade global na coluna (restrição e índice)
      let restricaoCriada = true;
      try {
        await sql(`ALTER TABLE licitacoes ADD CONSTRAINT "UQ_antigo_numero_processo_teste" UNIQUE (numero_processo)`);
      } catch {
        restricaoCriada = false; // banco compartilhado já com números iguais em órgãos diferentes
      }
      await sql(`CREATE UNIQUE INDEX "IDX_antigo_numero_processo_teste" ON licitacoes (numero_processo) WHERE orgao_id = '${A.id}'`);
      await numeros().migrarNoBoot();
      const sobrou = await sql(
        `SELECT conname FROM pg_constraint WHERE conname = 'UQ_antigo_numero_processo_teste'
         UNION ALL SELECT indexname FROM pg_indexes WHERE indexname = 'IDX_antigo_numero_processo_teste'`,
      );
      expect(sobrou).toEqual([]);
      const [nova2] = await sql(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [UQ_LICITACOES_ORGAO_NUMERO_PROCESSO]);
      expect(nova2).toBeTruthy();
    });
  });

  // ==========================================================================
  describe('2. gerado pelo sistema: sequencial por órgão e ano', () => {
    it('sem número → AAAA/NNNNN do órgão; dois órgãos com sequências independentes (e o mesmo número)', async () => {
      const a1 = await criarPeloAssistente(A).expect(201);
      const a2 = await criarPeloAssistente(A).expect(201);
      const b1 = await criarPeloAssistente(B).expect(201);
      expect(a1.body.numero_processo).toBe(fmt(proximoA++));
      expect(a2.body.numero_processo).toBe(fmt(proximoA++));
      expect(b1.body.numero_processo).toBe(fmt(1)); // mesmo número do 1º de A — outro órgão
      const [seqA] = await sql(`SELECT ultimo FROM sequencias_numero_processo WHERE orgao_id = $1 AND ano = $2`, [A.id, ANO]);
      const [seqB] = await sql(`SELECT ultimo FROM sequencias_numero_processo WHERE orgao_id = $1 AND ano = $2`, [B.id, ANO]);
      expect([seqA.ultimo, seqB.ultimo]).toEqual([2, 1]);
      // número vazio / só espaços também é "gerar"
      const a3 = await criarPeloAssistente(A, { numero_processo: '   ' }).expect(201);
      expect(a3.body.numero_processo).toBe(fmt(proximoA++));
    });

    it('criação simultânea: N processos em paralelo, nenhum número repetido, sem buracos', async () => {
      const C = await criarOrgao(ctx, { nome: 'Órgão Concorrência C' });
      const N = 12;
      const rs = await Promise.all(Array.from({ length: N }, () => criarPeloAssistente(C)));
      expect(rs.map((r) => r.status)).toEqual(Array(N).fill(201));
      const obtidos = rs.map((r) => r.body.numero_processo).sort();
      expect(new Set(obtidos).size).toBe(N);
      expect(obtidos).toEqual(Array.from({ length: N }, (_, i) => fmt(i + 1)));
      // O gerador direto, em rajada (sem transação do chamador): também sem repetir
      const D = await criarOrgao(ctx, { nome: 'Órgão Rajada D' });
      const gerados = await Promise.all(Array.from({ length: 20 }, () => numeros().gerar(D.id)));
      expect(new Set(gerados.map((g) => g.numero)).size).toBe(20);
      expect(gerados.map((g) => g.sequencial).sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });
  });

  // ==========================================================================
  describe('3. número digitado pelo órgão', () => {
    it('aceito; repetido no mesmo órgão → 409 claro (também com espaços diferentes); em outro órgão → aceito', async () => {
      const r = await criarPeloAssistente(A, { numero_processo: '  PA   139/2025 ' }).expect(201);
      expect(r.body.numero_processo).toBe('PA 139/2025');
      const dup = await criarPeloAssistente(A, { numero_processo: 'PA 139/2025' });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toBe(
        'Já existe um processo administrativo nº PA 139/2025 neste órgão. Informe outro número ou deixe o campo em branco para o sistema gerar.',
      );
      expect((await criarPeloAssistente(A, { numero_processo: 'PA  139/2025' })).status).toBe(409);
      await criarPeloAssistente(B, { numero_processo: 'PA 139/2025' }).expect(201);
      // o digitado não consome a sequência
      const auto = await criarPeloAssistente(A).expect(201);
      expect(auto.body.numero_processo).toBe(fmt(proximoA++));
    });

    it('digitado no formato gerado, à frente da sequência: o gerador pula o número ocupado', async () => {
      await criarPeloAssistente(A, { numero_processo: fmt(proximoA) }).expect(201);
      proximoA++;
      const auto = await criarPeloAssistente(A).expect(201);
      expect(auto.body.numero_processo).toBe(fmt(proximoA++));
    });

    it('longo demais → 400; edição para número de outro processo do órgão → 409; para número livre → 200', async () => {
      expect((await criarPeloAssistente(A, { numero_processo: '9'.repeat(61) })).status).toBe(400);
      const x = (await criarPeloAssistente(A).expect(201)).body;
      proximoA++;
      const ed = await http().put(`/api/licitacoes/${x.id}`).set(bearer(A.token)).send({ numero_processo: 'PA 139/2025' });
      expect(ed.status).toBe(409);
      expect(ed.body.message).toMatch(/Já existe um processo administrativo nº PA 139\/2025 neste órgão/);
      await http().put(`/api/licitacoes/${x.id}`).set(bearer(A.token)).send({ numero_processo: 'PA 200/2026' }).expect(200);
      expect(await numeroDe(x.id)).toBe('PA 200/2026');
      // vazio na edição = mantém
      await http().put(`/api/licitacoes/${x.id}`).set(bearer(A.token)).send({ numero_processo: '' }).expect(200);
      expect(await numeroDe(x.id)).toBe('PA 200/2026');
    });

    it('disponível? (aviso do formulário) — só olha o próprio órgão', async () => {
      const q = (org: OrgaoFixture, n: string) => http().get(`/api/numero-processo/disponivel`).query({ numero: n }).set(bearer(org.token)).expect(200);
      expect((await q(A, 'PA 200/2026')).body).toMatchObject({ numero: 'PA 200/2026', disponivel: false });
      expect((await q(B, 'PA 200/2026')).body).toMatchObject({ numero: 'PA 200/2026', disponivel: true });
      expect((await q(A, '')).body).toMatchObject({ disponivel: true, gerado: true });
    });
  });

  // ==========================================================================
  describe('4. todos os caminhos de criação usam o gerador', () => {
    it('demanda aprovada → processo (rota antiga e DFD): número gerado do órgão; digitado repetido → 409', async () => {
      const plan = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Planejamento A' });
      await sql(`UPDATE usuarios SET papeis_fase_interna = '["PLANEJAMENTO"]'::jsonb WHERE id = $1`, [plan.id]);
      const demanda = async (objeto: string) => {
        const d = await http()
          .post('/api/demandas')
          .set(bearer(A.token))
          .send({ ano_referencia: ANO, unidade_requisitante: 'Secretaria', descricao_sucinta_objeto: objeto, observacoes: 'Justificativa' })
          .expect(201);
        await http()
          .post(`/api/demandas/${d.body.id}/itens`)
          .set(bearer(A.token))
          .send({ categoria: 'MATERIAL', descricao_objeto: objeto, quantidade_estimada: 2, unidade_medida: 'UN', valor_unitario_estimado: 300 })
          .expect(201);
        await http().patch(`/api/demandas/${d.body.id}/enviar`).set(bearer(A.token)).expect(200);
        await http().patch(`/api/demandas/${d.body.id}/aprovar`).set(bearer(A.token)).expect(200);
        return d.body.id as string;
      };
      const d1 = await demanda('Cadeiras');
      const r1 = await http().post('/api/licitacoes/a-partir-de-demanda').set(bearer(plan.token)).send({ demanda_id: d1, modalidade: 'DISPENSA_ELETRONICA' }).expect(201);
      expect(r1.body.numero_processo).toBe(fmt(proximoA++));
      // DFD consolidado → abrir processo
      const d2 = await demanda('Mesas');
      const dfd = (await http().post(`/api/dfds-consolidados/a-partir-de-demanda/${d2}`).set(bearer(plan.token)).expect(201)).body;
      const dfdId = dfd.id ?? dfd.dfd?.id;
      const dupDfd = await http().post(`/api/dfds-consolidados/${dfdId}/abrir-processo`).set(bearer(plan.token)).send({ modalidade: 'DISPENSA_ELETRONICA', numero_processo: 'PA 139/2025' });
      expect(dupDfd.status).toBe(409);
      expect(dupDfd.body.message).toMatch(/Já existe um processo administrativo nº PA 139\/2025 neste órgão/);
      const r2 = (await http().post(`/api/dfds-consolidados/${dfdId}/abrir-processo`).set(bearer(plan.token)).send({ modalidade: 'DISPENSA_ELETRONICA' }).expect(201)).body;
      expect(r2.licitacao.numero_processo).toBe(fmt(proximoA++));
    });

    it('credenciamento: sem número → gerador do órgão (não mais "CRED-…"); digitado repetido → 409', async () => {
      const corpo = {
        objeto: 'Credenciamento de clínicas para exames laboratoriais',
        tipo_contratacao: 'SERVICO',
        hipotese: 'PARALELA_NAO_EXCLUDENTE',
        regra_distribuicao: 'RODIZIO',
        itens: [{ descricao: 'Hemograma', quantidade: 100, valor_unitario: 20, unidade_medida: 'UNIDADE' }],
      };
      const r = await http().post('/api/credenciamento').set(bearer(A.token)).send(corpo).expect(201);
      const [lic] = await sql(`SELECT numero_processo FROM licitacoes WHERE orgao_id = $1 AND modalidade = 'CREDENCIAMENTO' ORDER BY created_at DESC LIMIT 1`, [A.id]);
      expect(lic.numero_processo).toBe(fmt(proximoA++));
      expect(r.body).toBeTruthy();
      const dup = await http().post('/api/credenciamento').set(bearer(A.token)).send({ ...corpo, numero_processo: 'PA 139/2025' });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toMatch(/Já existe um processo administrativo nº PA 139\/2025 neste órgão/);
    });

    it('importação de processo de outro sistema: sem número → gerador; órgão SEMPRE o do token (o do corpo é ignorado)', async () => {
      const r = await http()
        .post('/api/fase-interna/importar-processo')
        .set(bearer(A.token))
        .send({ sistemaOrigem: 'BLL', idExterno: 'X-1', objeto: 'Processo importado', modalidade: 'PREGAO_ELETRONICO', orgaoId: B.id, documentos: [] })
        .expect(201);
      const [lic] = await sql(`SELECT orgao_id::text AS orgao_id, numero_processo FROM licitacoes WHERE id = $1`, [r.body.licitacao.id]);
      expect(lic).toEqual({ orgao_id: A.id, numero_processo: fmt(proximoA++) });
      const dup = await http()
        .post('/api/fase-interna/importar-processo')
        .set(bearer(A.token))
        .send({ sistemaOrigem: 'BLL', idExterno: 'X-2', numero_processo: 'PA 139/2025', objeto: 'Outro', modalidade: 'PREGAO_ELETRONICO', documentos: [] });
      expect(dup.status).toBe(409);
    });

    it('fase interna feita fora: nº dos autos único NO ÓRGÃO (outro órgão pode ter o mesmo)', async () => {
      const arquivos = [
        { nome: 'dfd.pdf', tipo: 'DFD' },
        { nome: 'termo-referencia.pdf', tipo: 'TR' },
        { nome: 'mapa.pdf', tipo: 'PP' },
        { nome: 'orcamentaria.pdf', tipo: 'DO' },
        { nome: 'despacho.pdf', tipo: 'AA' },
        { nome: 'parecer.pdf', tipo: 'PJ' },
      ];
      const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
      const criarExterna = (org: OrgaoFixture, numero: string) => {
        let req = http()
          .post('/api/fase-interna/externa/processo')
          .set(bearer(org.token))
          .field(
            'dados',
            JSON.stringify({
              modalidade: 'DISPENSA_ELETRONICA',
              tipo_contratacao: 'SERVICO',
              fundamento_legal: 'ART75_II',
              objeto: 'Contratação de software gerador de caracteres',
              numero_processo: numero,
              area_demandante: 'Comunicação',
              dispensa_com_lances: false,
              itens: [{ descricao: 'Licença anual', quantidade: 1, unidade: 'UNIDADE', valor_unitario: 900, tipo_item: 'SERVICO' }],
              classificacao: {
                pecas: arquivos.map((a, i) => ({
                  arquivo: i,
                  tipo: a.tipo,
                  numero_peca: `${a.tipo} 0${i + 1}/${ANO}`,
                  data_documento: hoje,
                  signatarios: [{ nome: 'Maria Presidente', cargo: 'Presidente' }],
                })),
                nao_se_aplica: [
                  { tipo: 'ETP', justificativa: 'Objeto simples — estudo técnico dispensado (art. 72, I).' },
                  { tipo: 'AR', justificativa: 'Riscos irrelevantes para a contratação (art. 72, I).' },
                ],
                usar_portaria_orgao: false,
              },
            }),
          );
        for (const a of arquivos) req = req.attach('arquivos', pdfDeTeste(`Peca ${a.tipo}`), { filename: a.nome, contentType: 'application/pdf' });
        return req;
      };
      // "PA 200/2026" é de um processo de A (item 3)
      const emA = await criarExterna(A, 'PA 200/2026');
      expect(emA.status).toBe(400);
      expect(emA.body.message).toMatch(/Já existe um processo administrativo nº PA 200\/2026 neste órgão/);
      const emB = await criarExterna(B, 'PA 200/2026');
      expect(emB.status).toBe(201);
      expect(await numeroDe(emB.body.licitacao_id)).toBe('PA 200/2026');
      await ctx.app.get(TarefasService).aguardarPendentes();
    });
  });

  // ==========================================================================
  describe('5. processos antigos: não renumerados; a sequência começa depois do maior existente', () => {
    it('números antigos (servidor global e aleatório do assistente) ficam; o 1º gerado vem depois do maior do órgão/ano', async () => {
      const E = await criarOrgao(ctx, { nome: 'Órgão Legado E' });
      // Como estavam antes: o servidor numerava pela sequência GLOBAL; o assistente, aleatório
      const antigos = [
        (await criarPeloAssistente(E, { numero_processo: fmt(41) }).expect(201)).body.id,
        (await criarPeloAssistente(E, { numero_processo: fmt(7) }).expect(201)).body.id,
        (await criarPeloAssistente(E, { numero_processo: `${ANO}09.91299` }).expect(201)).body.id,
        (await criarPeloAssistente(E, { numero_processo: `${ANO - 1}/00300` }).expect(201)).body.id,
      ];
      const antes = await Promise.all(antigos.map(numeroDe));
      const novo = await criarPeloAssistente(E).expect(201);
      expect(novo.body.numero_processo).toBe(fmt(42));
      expect(await Promise.all(antigos.map(numeroDe))).toEqual(antes);
    });

    it('boot idempotente: inicializa a sequência pelos dados e nunca volta atrás', async () => {
      const G = await criarOrgao(ctx, { nome: 'Órgão Boot G' });
      const id = (await criarPeloAssistente(G, { numero_processo: fmt(15) }).expect(201)).body.id;
      await numeros().migrarNoBoot();
      const seq = async () => (await sql(`SELECT ultimo FROM sequencias_numero_processo WHERE orgao_id = $1 AND ano = $2`, [G.id, ANO]))[0]?.ultimo;
      expect(await seq()).toBe(15);
      expect((await criarPeloAssistente(G).expect(201)).body.numero_processo).toBe(fmt(16));
      await numeros().migrarNoBoot();
      await numeros().migrarNoBoot();
      expect(await seq()).toBe(16);
      expect(await numeroDe(id)).toBe(fmt(15));
      expect((await criarPeloAssistente(G).expect(201)).body.numero_processo).toBe(fmt(17));
    });
  });

  // ==========================================================================
  describe('6. máscara do órgão (Configurações) e isolamento', () => {
    let H: OrgaoFixture;
    beforeAll(async () => {
      H = await criarOrgao(ctx, { nome: 'Câmara Máscara H' });
    });
    const cfg = (org: OrgaoFixture, q: Record<string, string> = {}) => http().get('/api/numero-processo/configuracao').query(q).set(bearer(org.token));

    it('padrão sem configuração; prévia não consome a sequência', async () => {
      const c = (await cfg(H).expect(200)).body;
      expect(c).toMatchObject({ mascara: '{ano}/{seq:5}', mascara_padrao: '{ano}/{seq:5}', personalizada: false, ano: ANO, proximo: fmt(1) });
      expect((await cfg(H).expect(200)).body.proximo).toBe(fmt(1));
      expect((await cfg(H, { mascara: 'PA {seq:3}/{ano}' }).expect(200)).body.proximo).toBe(`PA 001/${ANO}`);
      expect((await cfg(H, { mascara: '{seq}' })).status).toBe(400);
    });

    it('grava a máscara (inválida → 400) e o próximo processo sai no formato; outro órgão não é afetado', async () => {
      const inv = await http().put('/api/numero-processo/configuracao').set(bearer(H.token)).send({ mascara: 'PA {seq:3}' });
      expect(inv.status).toBe(400);
      expect(inv.body.message).toMatch(/ano/);
      const ok = (await http().put('/api/numero-processo/configuracao').set(bearer(H.token)).send({ mascara: 'PA {seq:3}/{ano}' }).expect(200)).body;
      expect(ok).toMatchObject({ mascara: 'PA {seq:3}/{ano}', personalizada: true, proximo: `PA 001/${ANO}` });
      expect((await criarPeloAssistente(H).expect(201)).body.numero_processo).toBe(`PA 001/${ANO}`);
      expect((await criarPeloAssistente(H).expect(201)).body.numero_processo).toBe(`PA 002/${ANO}`);
      // B continua no padrão
      expect((await cfg(B).expect(200)).body).toMatchObject({ mascara: '{ano}/{seq:5}', personalizada: false });
      const [linha] = await sql(`SELECT atualizado_por FROM numeracao_processo_orgao WHERE orgao_id = $1`, [H.id]);
      expect(linha.atualizado_por).toBe('Câmara Máscara H');
      // volta ao padrão: a sequência do ano continua (não reinicia)
      const pad = (await http().put('/api/numero-processo/configuracao').set(bearer(H.token)).send({ mascara: '' }).expect(200)).body;
      expect(pad).toMatchObject({ mascara: '{ano}/{seq:5}', personalizada: false, proximo: fmt(3) });
    });

    it('órgão do JWT: ?orgaoId= de outro órgão é ignorado; fornecedor 403; anônimo 401; admin escolhe o órgão', async () => {
      await http().put('/api/numero-processo/configuracao').set(bearer(H.token)).send({ mascara: 'H-{seq}/{ano}' }).expect(200);
      const deB = (await cfg(B, { orgaoId: H.id }).expect(200)).body;
      expect(deB.mascara).toBe('{ano}/{seq:5}');
      await http().put('/api/numero-processo/configuracao').query({ orgaoId: H.id }).set(bearer(B.token)).send({ mascara: 'B-{seq}/{ano}' }).expect(200);
      expect((await cfg(H).expect(200)).body.mascara).toBe('H-{seq}/{ano}');
      expect((await cfg(B).expect(200)).body.mascara).toBe('B-{seq}/{ano}');
      await http().get('/api/numero-processo/configuracao').set(bearer(F.token)).expect(403);
      await http().put('/api/numero-processo/configuracao').set(bearer(F.token)).send({ mascara: 'X-{seq}/{ano}' }).expect(403);
      await http().get('/api/numero-processo/disponivel').query({ numero: 'PA 139/2025' }).set(bearer(F.token)).expect(403);
      await http().get('/api/numero-processo/configuracao').expect(401);
      await http().get('/api/numero-processo/configuracao').set(bearer(ctx.tokenAdmin())).expect(400);
      expect((await http().get('/api/numero-processo/configuracao').query({ orgaoId: H.id }).set(bearer(ctx.tokenAdmin())).expect(200)).body.mascara).toBe('H-{seq}/{ano}');
      // a sequência de um órgão não mexe na do outro
      const [sh] = await sql(`SELECT ultimo FROM sequencias_numero_processo WHERE orgao_id = $1 AND ano = $2`, [H.id, ANO]);
      const [sb] = await sql(`SELECT ultimo FROM sequencias_numero_processo WHERE orgao_id = $1 AND ano = $2`, [B.id, ANO]);
      expect(sh.ultimo).toBe(2);
      expect(sb.ultimo).toBe(1);
    });
  });
});
