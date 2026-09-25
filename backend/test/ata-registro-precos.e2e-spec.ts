/**
 * ============================================================================
 * E6 — ATA DE REGISTRO DE PREÇOS (Lei 14.133/2021 arts. 82–86; Decreto
 * 11.462/2023 como referência)
 * ============================================================================
 *
 *  A. Pregão SRP pela sala → homologar: UMA ATA POR VENCEDOR com o item, o
 *     preço homologado (proposta adequada 89) e a quantidade do item;
 *     AGUARDANDO_ASSINATURA, sem data de assinatura; nenhum contrato;
 *     cadastro de reserva convocado na ordem do ranking; idempotente.
 *  B. Cadastro de reserva: termo só depois das respostas/prazo; D adere, E
 *     recusa; o vencedor não é convocado.
 *  C. Assinatura pelo assinador (órgão + fornecedor) → VIGENTE, data e
 *     vigência reais, publicação no PNCP registrada em pncp_sync.
 *  D. Isolamento: órgão B não gerencia a ata de A; fornecedor só vê as suas.
 *  E. Saldo: contratar a partir da ata decrementa (lock) e recusa além do saldo.
 *  F. Adesão (art. 86): 51% recusado; fluxo pedido → anuência → aceite do
 *     fornecedor → autorização; contrato do aderente consome só o autorizado;
 *     total > 2× recusado; aderente vê só a própria adesão.
 *  G. Prorrogação única (art. 84).
 *  H. Cancelamento do registro → próximo do cadastro de reserva convocado
 *     (nova ata com o saldo, mesmo preço, mesma vigência final).
 *  I. Job de vigência: ata vencida → VENCIDA, sem contratação.
 *  J. Migração do saldo das atas antigas (idempotente) e utilização manual
 *     pelo mesmo caminho do consumo.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarOrgao,
  criarUsuarioOrgao,
  pncpMock,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { gerarInstrumentos } from './support/resultado';
import { assinarAta, pregaoSrpHomologado, rotaAta } from './support/arp';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { ArpService } from '../src/atas/arp.service';
import { migrarSaldoAtas } from '../src/atas/saldo-ata.sql';
import { fimVigencia, hojeBrasilia, somarDias, somarMeses } from '../src/atas/regras-arp';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E6 — Ata de Registro de Preços (SRP → ARP → saldo, adesão, vigência)', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  let orgao: OrgaoFixture; // gerenciador
  let autoridade: UsuarioOrgaoFixture; // ADMIN do órgão: homologa e assina a ata
  let orgaoB: OrgaoFixture; // aderente
  let orgaoC: OrgaoFixture;
  let orgaoD: OrgaoFixture;
  let orgaoE: OrgaoFixture;
  let orgaoF: OrgaoFixture;
  let A: FornecedorFixture; // vencedor
  let D: FornecedorFixture; // 2º — adere ao cadastro de reserva
  let E: FornecedorFixture; // 3º — recusa

  let licId: string;
  let ataId: string;
  let itemAtaId: string;
  let adesaoB: string;

  const ataDb = async (id: string) =>
    (
      await q(
        `SELECT id, status::text AS status, origem, fornecedor_id, data_assinatura, data_vigencia_inicio::text AS ini,
                data_vigencia_fim::text AS fim, valor_total::float AS valor_total, valor_utilizado::float AS valor_utilizado,
                valor_saldo::float AS valor_saldo, enviado_pncp, sequencial_pncp, prorrogada, ata_origem_id, licitacao_id
           FROM atas_registro_preco WHERE id = $1`,
        [id],
      )
    )[0];
  const itemDb = async (id: string) =>
    (
      await q(
        `SELECT quantidade_registrada::float AS reg, quantidade_utilizada::float AS usada, quantidade_saldo::float AS saldo,
                quantidade_adesao_autorizada::float AS ades_aut, quantidade_adesao_utilizada::float AS ades_usada, valor_unitario::float AS unit
           FROM itens_ata WHERE id = $1`,
        [id],
      )
    )[0];

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Gerenciadora ARP' });
    autoridade = await criarUsuarioOrgao(ctx, orgao, { nome: 'Prefeita ARP', role: RoleUsuario.ADMIN });
    orgaoB = await criarOrgao(ctx, { nome: 'Câmara Aderente ARP' });
    orgaoC = await criarOrgao(ctx, { nome: 'Autarquia C ARP' });
    orgaoD = await criarOrgao(ctx, { nome: 'Autarquia D ARP' });
    orgaoE = await criarOrgao(ctx, { nome: 'Autarquia E ARP' });
    orgaoF = await criarOrgao(ctx, { nome: 'Autarquia F ARP' });
    A = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    D = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    E = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. homologação do pregão SRP gera a ARP (uma por vencedor)', () => {
    let homologacao: any;

    beforeAll(async () => {
      const r = await pregaoSrpHomologado(
        ctx,
        orgao,
        autoridade.token,
        [
          { fornecedor: A, valor: 90 },
          { fornecedor: D, valor: 95 },
          { fornecedor: E, valor: 97 },
        ],
        { quantidade: 10, valorAceito: 89 },
      );
      licId = r.lic.id;
      homologacao = r.homologacao;
    });

    test('homologar: instrumento ATA (nunca contrato), gerado sem erro', async () => {
      expect(homologacao.instrumentos).toMatchObject({ tipo: 'ATA', erro: null });
      expect(homologacao.instrumentos.atas).toHaveLength(1);
      expect(homologacao.instrumentos.atas[0]).toMatchObject({ fornecedorId: A.id, valorTotal: 890 });
      ataId = homologacao.instrumentos.atas[0].id;
      expect(await q(`SELECT id FROM contratos WHERE licitacao_id = $1`, [licId])).toHaveLength(0);
    });

    test('ata AGUARDANDO_ASSINATURA, sem data de assinatura; item com preço homologado (89) e quantidade do item (10)', async () => {
      const a = await ataDb(ataId);
      expect(a).toMatchObject({ status: 'AGUARDANDO_ASSINATURA', origem: 'HOMOLOGACAO', fornecedor_id: A.id, data_assinatura: null, valor_total: 890, valor_saldo: 890 });
      const itens = await q(`SELECT id, numero_item, item_licitacao_id FROM itens_ata WHERE ata_id = $1`, [ataId]);
      expect(itens).toHaveLength(1);
      itemAtaId = itens[0].id;
      expect(await itemDb(itemAtaId)).toMatchObject({ reg: 10, usada: 0, saldo: 10, unit: 89 });
    });

    test('cadastro de reserva: D (2º) e E (3º) convocados na ordem do ranking; o vencedor não', async () => {
      const r = await q(`SELECT fornecedor_id, posicao, status FROM ata_cadastro_reserva WHERE ata_id = $1 ORDER BY posicao`, [ataId]);
      expect(r).toEqual([
        { fornecedor_id: D.id, posicao: 2, status: 'PENDENTE' },
        { fornecedor_id: E.id, posicao: 3, status: 'PENDENTE' },
      ]);
    });

    test('idempotente: gerar de novo devolve a mesma ata', async () => {
      const g = await gerarInstrumentos(ctx, licId, orgao.token);
      expect(g.status).toBe(200);
      expect(g.body.atas.map((a: any) => a.id)).toEqual([ataId]);
      expect(await q(`SELECT id FROM atas_registro_preco WHERE licitacao_id = $1`, [licId])).toHaveLength(1);
    });

    test('ata aguardando assinatura não aparece na consulta pública', async () => {
      expect((await http().get(`/api/atas/publicas/${ataId}`)).status).toBe(404);
    });
  });

  // ==========================================================================
  describe('B. cadastro de reserva e termo da ata', () => {
    test('termo só depois das respostas da reserva (prazo em curso) — Dec. 11.462 art. 18', async () => {
      const r = await rotaAta(ctx, 'post', `${ataId}/assinaturas`, autoridade.token);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/cadastro de reserva/);
    });

    test('convocações visíveis a cada licitante; o vencedor não tem convocação', async () => {
      const d = await rotaAta(ctx, 'get', 'fornecedor/reservas', D.token);
      expect(d.status).toBe(200);
      expect(d.body.filter((x: any) => x.ata_id === ataId)).toHaveLength(1);
      expect((await rotaAta(ctx, 'post', `${ataId}/reserva`, A.token, { aderir: true })).status).toBe(404);
      // órgão não usa a rota do fornecedor
      expect([401, 403]).toContain((await rotaAta(ctx, 'post', `${ataId}/reserva`, orgao.token, { aderir: true })).status);
    });

    test('D adere ao preço do vencedor; E recusa; resposta repetida → 400', async () => {
      expect((await rotaAta(ctx, 'post', `${ataId}/reserva`, D.token, { aderir: true })).body).toMatchObject({ status: 'ADERIU' });
      expect((await rotaAta(ctx, 'post', `${ataId}/reserva`, E.token, { aderir: false })).body).toMatchObject({ status: 'RECUSOU' });
      expect((await rotaAta(ctx, 'post', `${ataId}/reserva`, D.token, { aderir: false })).status).toBe(400);
    });

    test('solicitar assinaturas: termo em PDF, órgão + fornecedor (idempotente)', async () => {
      const r = await rotaAta(ctx, 'post', `${ataId}/assinaturas`, autoridade.token);
      expect(r.status).toBe(200);
      expect(r.body.signatarios).toHaveLength(2);
      const de_novo = await rotaAta(ctx, 'post', `${ataId}/assinaturas`, autoridade.token);
      expect(de_novo.body).toMatchObject({ ja_existente: true, documento_assinatura_id: r.body.documento_assinatura_id });
    });
  });

  // ==========================================================================
  describe('C. assinatura → VIGENTE e PNCP', () => {
    test('última assinatura: VIGENTE, data de assinatura e vigência de 12 meses a partir dela; PNCP registrado', async () => {
      // Compra já no PNCP (atalho: a publicação da compra não é objeto deste teste)
      await q(
        `INSERT INTO pncp_sync (id, tipo, licitacao_id, orgao_id, status, numero_controle_pncp, ano_compra, sequencial_compra, tentativas, created_at, updated_at)
         VALUES (gen_random_uuid(), 'COMPRA', $1, $2, 'ENVIADO', $3, 2026, 77, 1, now(), now())`,
        [licId, orgao.id, `${orgao.cnpj.replace(/\D/g, '')}-1-000077/2026`],
      );
      pncpMock.limpar();
      pncpMock.responder('POST', /\/compras\/2026\/77\/atas$/, { status: 201, corpo: { sequencialAta: 3 }, headers: { location: '/atas/3' } });

      await assinarAta(ctx, ataId, autoridade.token, A);
      const hoje = hojeBrasilia();
      let a = await ataDb(ataId);
      expect(a.status).toBe('VIGENTE');
      expect(a.ini).toBe(hoje);
      expect(a.fim).toBe(fimVigencia(hoje, 12));
      for (let i = 0; i < 100 && !a.enviado_pncp; i++) {
        await new Promise((r) => setTimeout(r, 100));
        a = await ataDb(ataId);
      }
      expect(a).toMatchObject({ enviado_pncp: true, sequencial_pncp: 3 });
      const sync = await q(`SELECT status::text AS status FROM pncp_sync WHERE tipo = 'ATA' AND entidade_id = $1`, [ataId]);
      expect(sync.map((s: any) => s.status)).toContain('ENVIADO');
      expect(pncpMock.filtrar('POST', /\/atas$/)).toHaveLength(1);
    });

    test('ata assinada aparece na consulta pública de vigentes', async () => {
      const r = await http().get('/api/atas/publicas/lista?vigentes=true');
      expect(r.status).toBe(200);
      expect(r.body.map((x: any) => x.id)).toContain(ataId);
    });
  });

  // ==========================================================================
  describe('D. isolamento', () => {
    test('órgão B não lê nem gerencia a ata do órgão A', async () => {
      expect((await rotaAta(ctx, 'get', `${ataId}/painel`, orgaoB.token)).status).toBe(404);
      expect((await http().get(`/api/atas/${ataId}`).set(bearer(orgaoB.token))).status).toBe(404);
      expect((await rotaAta(ctx, 'post', `${ataId}/prorrogar`, orgaoB.token, { meses: 12, motivo: 'Tentativa de outro órgão' })).status).toBe(403);
      expect((await rotaAta(ctx, 'post', `${ataId}/cancelar-registro`, orgaoB.token, { hipotese: 'DESCUMPRIMENTO', motivo: 'Tentativa de outro órgão' })).status).toBe(403);
      expect((await rotaAta(ctx, 'post', `${ataId}/contratar`, orgaoB.token, { itens: [{ item_ata_id: itemAtaId, quantidade: 1 }] })).status).toBe(403);
      const lista = await http().get('/api/atas').set(bearer(orgaoB.token));
      expect(lista.body.map((x: any) => x.id)).not.toContain(ataId);
    });

    test('fornecedor vê só as próprias atas', async () => {
      expect((await rotaAta(ctx, 'get', `fornecedor/ata/${ataId}`, D.token)).status).toBe(404);
      expect((await http().get('/api/atas').set(bearer(A.token))).body.map((x: any) => x.id)).toContain(ataId);
      expect((await http().get('/api/atas').set(bearer(D.token))).body.map((x: any) => x.id)).not.toContain(ataId);
    });

    test('situação não muda pela rota genérica (VIGENTE→CANCELADA só pelo cancelamento do registro)', async () => {
      const r = await http().patch(`/api/atas/${ataId}/status`).set(bearer(orgao.token)).send({ status: 'CANCELADA' });
      expect(r.status).toBe(400);
      const put = await http().put(`/api/atas/${ataId}`).set(bearer(orgao.token)).send({ valor_saldo: 999999, observacoes: 'Obs E6' });
      expect(put.status).toBe(200);
      expect((await ataDb(ataId)).valor_saldo).toBe(890);
    });
  });

  // ==========================================================================
  describe('E. saldo: contratar a partir da ata', () => {
    test('gerenciador contrata 6 → contrato AGUARDANDO_ASSINATURA com os itens da ata; saldo 4', async () => {
      const r = await rotaAta(ctx, 'post', `${ataId}/contratar`, orgao.token, { tipo: 'CONTRATO', itens: [{ item_ata_id: itemAtaId, quantidade: 6 }] });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ valor_total: 534, contrato: { tipo: 'CONTRATO', status: 'AGUARDANDO_ASSINATURA' } });
      const [c] = await q(`SELECT orgao_id, licitacao_id, ata_registro_preco_id, fornecedor_id, valor_global::float AS v, data_assinatura FROM contratos WHERE id = $1`, [r.body.contrato.id]);
      expect(c).toMatchObject({ orgao_id: orgao.id, licitacao_id: licId, ata_registro_preco_id: ataId, fornecedor_id: A.id, v: 534, data_assinatura: null });
      const its = await q(`SELECT quantidade_contratada::float AS q, valor_unitario::float AS u FROM itens_contrato WHERE contrato_id = $1`, [r.body.contrato.id]);
      expect(its).toEqual([{ q: 6, u: 89 }]);
      expect(await itemDb(itemAtaId)).toMatchObject({ usada: 6, saldo: 4 });
      expect(await ataDb(ataId)).toMatchObject({ valor_utilizado: 534, valor_saldo: 356 });
      const cons = await q(`SELECT origem, contrato_id, adesao_id FROM ata_consumos WHERE ata_id = $1`, [ataId]);
      expect(cons).toEqual([{ origem: 'CONTRATO', contrato_id: r.body.contrato.id, adesao_id: null }]);
    });

    test('além do saldo → 400 e nada muda (nem contrato novo)', async () => {
      const antes = (await q(`SELECT COUNT(*)::int AS n FROM contratos WHERE ata_registro_preco_id = $1`, [ataId]))[0].n;
      const r = await rotaAta(ctx, 'post', `${ataId}/contratar`, orgao.token, { tipo: 'ORDEM', itens: [{ item_ata_id: itemAtaId, quantidade: 5 }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/maior que o saldo/);
      expect(await itemDb(itemAtaId)).toMatchObject({ usada: 6, saldo: 4 });
      expect((await q(`SELECT COUNT(*)::int AS n FROM contratos WHERE ata_registro_preco_id = $1`, [ataId]))[0].n).toBe(antes);
    });

    test('concorrência: dois pedidos de 3 ao mesmo tempo com saldo 4 → só um passa (lock da ata)', async () => {
      const [r1, r2] = await Promise.all([
        rotaAta(ctx, 'post', `${ataId}/contratar`, orgao.token, { tipo: 'ORDEM', itens: [{ item_ata_id: itemAtaId, quantidade: 3 }] }),
        rotaAta(ctx, 'post', `${ataId}/contratar`, orgao.token, { tipo: 'ORDEM', itens: [{ item_ata_id: itemAtaId, quantidade: 3 }] }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 400]);
      const ok = r1.status === 201 ? r1 : r2;
      expect(ok.body.contrato.tipo).toBe('ORDEM_FORNECIMENTO');
      expect(await itemDb(itemAtaId)).toMatchObject({ usada: 9, saldo: 1 });
    });
  });

  // ==========================================================================
  describe('F. adesão (carona — art. 86)', () => {
    const just = 'Preço registrado 11% abaixo da nossa pesquisa de preços (3 cotações anexas); mesma especificação.';

    test('gerenciador não adere à própria ata', async () => {
      const r = await rotaAta(ctx, 'post', `${ataId}/adesoes`, orgao.token, { justificativa_vantagem: just, itens: [{ item_ata_id: itemAtaId, quantidade: 1 }] });
      expect(r.status).toBe(400);
    });

    test('51% do registrado → 400 (limite de 50% por órgão — §4º); sem justificativa → 400', async () => {
      const r = await rotaAta(ctx, 'post', `${ataId}/adesoes`, orgaoB.token, { justificativa_vantagem: just, itens: [{ item_ata_id: itemAtaId, quantidade: 5.1 }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/50%/);
      const s = await rotaAta(ctx, 'post', `${ataId}/adesoes`, orgaoB.token, { justificativa_vantagem: 'curta', itens: [{ item_ata_id: itemAtaId, quantidade: 5 }] });
      expect(s.status).toBe(400);
    });

    test('pedido de 50% → SOLICITADA; fornecedor não aceita antes da anuência', async () => {
      const r = await rotaAta(ctx, 'post', `${ataId}/adesoes`, orgaoB.token, { justificativa_vantagem: just, itens: [{ item_ata_id: itemAtaId, quantidade: 5 }] });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ status: 'SOLICITADA', orgao_aderente_id: orgaoB.id, orgao_gerenciador_id: orgao.id });
      adesaoB = r.body.id;
      expect((await rotaAta(ctx, 'post', `adesoes/${adesaoB}/fornecedor`, A.token, { aceitar: true })).status).toBe(409);
    });

    test('isolamento da adesão: aderente e partes leem; terceiro órgão/fornecedor → 404; aderente não anui', async () => {
      expect((await rotaAta(ctx, 'get', `adesoes/${adesaoB}`, orgaoB.token)).status).toBe(200);
      expect((await rotaAta(ctx, 'get', `adesoes/${adesaoB}`, orgao.token)).status).toBe(200);
      expect((await rotaAta(ctx, 'get', `adesoes/${adesaoB}`, orgaoC.token)).status).toBe(404);
      expect((await rotaAta(ctx, 'get', `adesoes/${adesaoB}`, D.token)).status).toBe(404);
      expect((await rotaAta(ctx, 'post', `adesoes/${adesaoB}/anuencia`, orgaoB.token, { aceitar: true })).status).toBe(403);
      // aderente não enxerga a gestão da ata do gerenciador
      expect((await rotaAta(ctx, 'get', `${ataId}/painel`, orgaoB.token)).status).toBe(404);
    });

    test('anuência do gerenciador → aceite do fornecedor (outro fornecedor → 404) → autorização', async () => {
      const an = await rotaAta(ctx, 'post', `adesoes/${adesaoB}/anuencia`, orgao.token, { aceitar: true });
      expect(an.body.status).toBe('ANUENCIA_GERENCIADOR');
      expect((await rotaAta(ctx, 'post', `adesoes/${adesaoB}/fornecedor`, D.token, { aceitar: true })).status).toBe(404);
      const ac = await rotaAta(ctx, 'post', `adesoes/${adesaoB}/fornecedor`, A.token, { aceitar: true });
      expect(ac.body.status).toBe('ACEITE_FORNECEDOR');
      const au = await rotaAta(ctx, 'post', `adesoes/${adesaoB}/autorizar`, orgao.token);
      expect(au.status).toBe(200);
      expect(au.body.status).toBe('AUTORIZADA');
      expect(au.body.prazo_contratacao).toBeTruthy();
      expect(await itemDb(itemAtaId)).toMatchObject({ ades_aut: 5, usada: 9, saldo: 1 });
    });

    test('aderente contrata 3 pela adesão (contador separado, saldo do gerenciador intacto); além do autorizado → 400', async () => {
      const r = await rotaAta(ctx, 'post', `${ataId}/contratar`, orgaoB.token, { adesao_id: adesaoB, itens: [{ item_ata_id: itemAtaId, quantidade: 3 }] });
      expect(r.status).toBe(201);
      const [c] = await q(`SELECT orgao_id, licitacao_id, ata_registro_preco_id FROM contratos WHERE id = $1`, [r.body.contrato.id]);
      expect(c).toEqual({ orgao_id: orgaoB.id, licitacao_id: null, ata_registro_preco_id: ataId });
      expect(await itemDb(itemAtaId)).toMatchObject({ ades_usada: 3, usada: 9, saldo: 1 });
      const mais = await rotaAta(ctx, 'post', `${ataId}/contratar`, orgaoB.token, { adesao_id: adesaoB, itens: [{ item_ata_id: itemAtaId, quantidade: 3 }] });
      expect(mais.status).toBe(400);
      // adesão de outro órgão não serve
      expect((await rotaAta(ctx, 'post', `${ataId}/contratar`, orgaoC.token, { adesao_id: adesaoB, itens: [{ item_ata_id: itemAtaId, quantidade: 1 }] })).status).toBe(403);
    });

    test('total das adesões > 2× o registrado → 400 (§5º)', async () => {
      for (const o of [orgaoC, orgaoD, orgaoE]) {
        const r = await rotaAta(ctx, 'post', `${ataId}/adesoes`, o.token, { justificativa_vantagem: just, itens: [{ item_ata_id: itemAtaId, quantidade: 5 }] });
        expect(r.status).toBe(201);
      }
      // 4 × 5 = 20 = 2 × 10: o próximo pedido estoura o dobro
      const f = await rotaAta(ctx, 'post', `${ataId}/adesoes`, orgaoF.token, { justificativa_vantagem: just, itens: [{ item_ata_id: itemAtaId, quantidade: 1 }] });
      expect(f.status).toBe(400);
      expect(f.body.message).toMatch(/dobro/);
    });

    test('aderente vê só as próprias adesões; gerenciador vê as recebidas', async () => {
      const minhas = await rotaAta(ctx, 'get', 'adesoes/minhas', orgaoC.token);
      expect(minhas.body.map((a: any) => a.orgao_aderente_id)).toEqual([orgaoC.id]);
      const recebidas = await rotaAta(ctx, 'get', 'adesoes/recebidas', orgao.token);
      expect(recebidas.body.filter((a: any) => a.ata_id === ataId)).toHaveLength(4);
      expect((await rotaAta(ctx, 'get', 'adesoes/recebidas', orgaoC.token)).body).toHaveLength(0);
    });
  });

  // ==========================================================================
  describe('G. prorrogação (art. 84)', () => {
    test('13 meses → 400; sem motivo → 400; 12 meses com motivo → fim + 12 meses; segunda vez → 400', async () => {
      const antes = await ataDb(ataId);
      expect((await rotaAta(ctx, 'post', `${ataId}/prorrogar`, orgao.token, { meses: 13, motivo: 'Preço segue vantajoso conforme pesquisa' })).status).toBe(400);
      expect((await rotaAta(ctx, 'post', `${ataId}/prorrogar`, orgao.token, { meses: 12 })).status).toBe(400);
      const r = await rotaAta(ctx, 'post', `${ataId}/prorrogar`, orgao.token, { meses: 12, motivo: 'Pesquisa de preços de set/2026 confirma o preço vantajoso' });
      expect(r.status).toBe(200);
      const esperado = somarDias(somarMeses(somarDias(antes.fim, 1), 12), -1);
      expect(r.body.data_vigencia_fim).toBe(esperado);
      expect(await ataDb(ataId)).toMatchObject({ prorrogada: true, fim: esperado });
      const de_novo = await rotaAta(ctx, 'post', `${ataId}/prorrogar`, orgao.token, { meses: 1, motivo: 'Nova tentativa de prorrogação' });
      expect(de_novo.status).toBe(400);
      expect(de_novo.body.message).toMatch(/única vez/);
    });
  });

  // ==========================================================================
  describe('H. cancelamento do registro → cadastro de reserva convocado', () => {
    let novaAtaId: string;

    test('hipótese inválida → 400; cancelamento: CANCELADA, adesões em andamento recusadas, D convocado com o saldo', async () => {
      expect((await rotaAta(ctx, 'post', `${ataId}/cancelar-registro`, orgao.token, { hipotese: 'XYZ', motivo: 'Motivo qualquer longo' })).status).toBe(400);
      const fimOriginal = (await ataDb(ataId)).fim;
      const r = await rotaAta(ctx, 'post', `${ataId}/cancelar-registro`, orgao.token, {
        hipotese: 'DESCUMPRIMENTO',
        motivo: 'Não entregou a ordem de fornecimento no prazo, sem justificativa (processo de sanção 12/2026).',
      });
      expect(r.status).toBe(200);
      expect(r.body.convocadas).toHaveLength(1);
      expect(r.body.convocadas[0]).toMatchObject({ fornecedor_id: D.id, itens: [1] });
      novaAtaId = r.body.convocadas[0].id;
      expect((await ataDb(ataId)).status).toBe('CANCELADA');
      const pend = await q(`SELECT status FROM adesoes_ata WHERE ata_id = $1 AND id <> $2`, [ataId, adesaoB]);
      expect(pend.map((x: any) => x.status)).toEqual(['RECUSADA', 'RECUSADA', 'RECUSADA']);
      expect((await q(`SELECT status FROM adesoes_ata WHERE id = $1`, [adesaoB]))[0].status).toBe('AUTORIZADA');
      // nova ata: D, saldo do gerenciador (10 − 9 = 1) ao preço do vencedor, até o fim original
      const n = await ataDb(novaAtaId);
      expect(n).toMatchObject({ status: 'AGUARDANDO_ASSINATURA', origem: 'RESERVA', fornecedor_id: D.id, ata_origem_id: ataId, fim: fimOriginal, licitacao_id: licId });
      const [it] = await q(`SELECT id, quantidade_registrada::float AS reg, valor_unitario::float AS unit FROM itens_ata WHERE ata_id = $1`, [novaAtaId]);
      expect([it.reg, it.unit]).toEqual([1, 89]);
      expect((await q(`SELECT status, ata_convocada_id FROM ata_cadastro_reserva WHERE ata_id = $1 AND fornecedor_id = $2`, [ataId, D.id]))[0]).toEqual({
        status: 'CONVOCADO',
        ata_convocada_id: novaAtaId,
      });
    });

    test('ata cancelada não admite contratação (nem pela adesão autorizada)', async () => {
      expect((await rotaAta(ctx, 'post', `${ataId}/contratar`, orgao.token, { itens: [{ item_ata_id: itemAtaId, quantidade: 1 }] })).status).toBe(400);
      expect((await rotaAta(ctx, 'post', `${ataId}/contratar`, orgaoB.token, { adesao_id: adesaoB, itens: [{ item_ata_id: itemAtaId, quantidade: 1 }] })).status).toBe(400);
    });

    test('a ata do convocado é assinada (sem reserva pendente) e vigora até o fim da original', async () => {
      const fimOriginal = (await ataDb(novaAtaId)).fim;
      expect((await rotaAta(ctx, 'post', `${novaAtaId}/assinaturas`, autoridade.token)).status).toBe(200);
      await assinarAta(ctx, novaAtaId, autoridade.token, D);
      expect(await ataDb(novaAtaId)).toMatchObject({ status: 'VIGENTE', ini: hojeBrasilia(), fim: fimOriginal });
    });

    // ------------------------------------------------------------------------
    test('I. job de vigência: fim no passado → VENCIDA; sem contratação nem adesão', async () => {
      const [it] = await q(`SELECT id FROM itens_ata WHERE ata_id = $1`, [novaAtaId]);
      // relógio: a vigência terminou ontem
      await q(`UPDATE atas_registro_preco SET data_vigencia_fim = $2::date WHERE id = $1`, [novaAtaId, somarDias(hojeBrasilia(), -1)]);
      // antes do job, a data já barra a contratação
      expect((await rotaAta(ctx, 'post', `${novaAtaId}/contratar`, orgao.token, { itens: [{ item_ata_id: it.id, quantidade: 1 }] })).status).toBe(400);
      const r = await ctx.app.get(ArpService).expirarAtasVencidas();
      expect(r.vencidas).toContain(novaAtaId);
      expect((await ataDb(novaAtaId)).status).toBe('VENCIDA');
      const ades = await rotaAta(ctx, 'post', `${novaAtaId}/adesoes`, orgaoF.token, {
        justificativa_vantagem: 'Pedido depois do fim da vigência — deve ser recusado.',
        itens: [{ item_ata_id: it.id, quantidade: 0.5 }],
      });
      expect(ades.status).toBe(400);
      expect((await rotaAta(ctx, 'post', `${novaAtaId}/prorrogar`, orgao.token, { meses: 6, motivo: 'Prorrogação depois de vencida' })).status).toBe(400);
      // job idempotente
      expect((await ctx.app.get(ArpService).expirarAtasVencidas()).vencidas).not.toContain(novaAtaId);
    });
  });

  // ==========================================================================
  describe('J. atas antigas: saldo migrado do histórico (idempotente) e utilização manual', () => {
    test('utilização antiga vira consumo MIGRACAO; saldo zerado pelo bug é recalculado; 2ª execução não muda nada', async () => {
      // retrato do cadastro manual antigo: item com 3 de 10 utilizados, saldo da ata "zerado" pelo recalcularValorAta
      const [ata] = await q(
        `INSERT INTO atas_registro_preco (id, numero_ata, ano, sequencial, orgao_id, licitacao_id, fornecedor_id, fornecedor_cnpj,
            fornecedor_razao_social, status, objeto, valor_total, valor_utilizado, valor_saldo, data_assinatura,
            data_vigencia_inicio, data_vigencia_fim, created_at, updated_at)
         VALUES (gen_random_uuid(), '900/2025', 2025, 900, $1, $2, $3, $4, 'Legado', 'VIGENTE', 'Ata antiga', 500, 150, 500,
                 '2025-10-01', '2025-10-01', $5::date, now(), now()) RETURNING id`,
        [orgao.id, licId, A.id, A.cnpj, somarDias(hojeBrasilia(), 60)],
      );
      const [it] = await q(
        `INSERT INTO itens_ata (id, ata_id, numero_item, descricao, unidade_medida, quantidade_registrada, quantidade_utilizada,
            quantidade_saldo, valor_unitario, valor_total, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 1, 'Item legado', 'UNIDADE', 10, 3, 10, 50, 500, now(), now()) RETURNING id`,
        [ata.id],
      );
      const r1 = await migrarSaldoAtas(ctx.dataSource);
      expect(r1.consumosMigrados).toBeGreaterThanOrEqual(1);
      expect(await itemDb(it.id)).toMatchObject({ usada: 3, saldo: 7 });
      expect(await ataDb(ata.id)).toMatchObject({ valor_total: 500, valor_utilizado: 150, valor_saldo: 350 });
      const c = await q(`SELECT origem, quantidade::float AS q FROM ata_consumos WHERE item_ata_id = $1`, [it.id]);
      expect(c).toEqual([{ origem: 'MIGRACAO', q: 3 }]);
      const r2 = await migrarSaldoAtas(ctx.dataSource);
      expect(r2).toEqual({ consumosMigrados: 0, atasRecalculadas: 0 });

      // utilização manual (rota antiga) = consumo MANUAL com lock; além do saldo → 400
      const u = await http().post(`/api/atas/itens/${it.id}/utilizar`).set(bearer(orgao.token)).send({ quantidade: 2 });
      expect(u.status).toBe(201);
      expect(await itemDb(it.id)).toMatchObject({ usada: 5, saldo: 5 });
      expect((await http().post(`/api/atas/itens/${it.id}/utilizar`).set(bearer(orgao.token)).send({ quantidade: 6 })).status).toBe(400);
      // editar o item manual não zera o consumo (B10)
      const ed = await http().put(`/api/atas/itens/${it.id}`).set(bearer(orgao.token)).send({ valor_unitario: 40, quantidade_saldo: 999 });
      expect(ed.status).toBe(200);
      expect(await itemDb(it.id)).toMatchObject({ usada: 5, saldo: 5, unit: 40 });
      expect(await ataDb(ata.id)).toMatchObject({ valor_total: 400, valor_utilizado: 200, valor_saldo: 200 });
    });

    test('itens da ata gerada pela homologação não se editam', async () => {
      const r = await http().put(`/api/atas/itens/${itemAtaId}`).set(bearer(orgao.token)).send({ valor_unitario: 1 });
      expect(r.status).toBe(400);
    });
  });
});
