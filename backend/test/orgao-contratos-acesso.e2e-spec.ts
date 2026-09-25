/**
 * ============================================================================
 * EXECUÇÃO CONTRATUAL — o órgão só enxerga e altera o que é dele
 * ============================================================================
 *
 * Rotas do órgão em /api/contratos/** (contrato, termos aditivos, documentos,
 * medições, atestação, ordens de serviço) e /api/almoxarifado (ordens):
 *  - recurso de OUTRO órgão → 404 na leitura, 403 na escrita — e nada muda;
 *  - criação: `orgao_id` vem do token (outro informado → 403);
 *  - o próprio órgão lê e altera; admin da plataforma passa;
 *  - fornecedor → 403 (usa /api/fornecedor/**); anônimo → 401.
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
} from './support';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { Medicao, StatusMedicao } from '../src/contratos/entities/medicao.entity';
import { OrdemFornecimento } from '../src/almoxarifado/entities/ordem-fornecimento.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

interface Dados {
  contrato: string;
  medicao: string;
  os: string;
  termo: string;
  documento: string;
  ordem: string;
}

describe('Execução contratual — isolamento entre órgãos', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let gestorA: UsuarioOrgaoFixture;
  let F: FornecedorFixture;
  let dA: Dados;
  let dB: Dados;
  const http = () => ctx.http();

  async function criarContrato(orgao: OrgaoFixture): Promise<string> {
    const r = await http()
      .post('/api/contratos')
      .set(bearer(orgao.token))
      .send({
        fornecedor_id: F.id,
        fornecedor_cnpj: F.cnpj,
        fornecedor_razao_social: F.razao_social,
        objeto: `Serviço continuado E2E — ${orgao.nome}`,
        modalidade_execucao: 'CONTINUADO',
        valor_inicial: 12000,
        valor_global: 12000,
        data_assinatura: '2026-01-10',
        data_vigencia_inicio: '2026-01-10',
        data_vigencia_fim: '2026-12-31',
      });
    if (![200, 201].includes(r.status)) throw new Error(`[fixture] contrato → ${r.status} ${JSON.stringify(r.body)}`);
    expect(r.body.orgao_id).toBe(orgao.id); // órgão veio do token
    return r.body.id;
  }

  async function montar(orgao: OrgaoFixture, seq: number): Promise<Dados> {
    const contrato = await criarContrato(orgao);

    const termo = await http()
      .post(`/api/contratos/${contrato}/termos`)
      .set(bearer(orgao.token))
      .send({ tipo: 'APOSTILAMENTO', objeto: 'Apostilamento E2E', data_assinatura: '2026-02-01' });
    if (![200, 201].includes(termo.status)) throw new Error(`[fixture] termo → ${termo.status} ${JSON.stringify(termo.body)}`);

    const doc = await http()
      .post(`/api/contratos/${contrato}/documentos`)
      .set(bearer(orgao.token))
      .attach('arquivo', PDF, { filename: 'contrato.pdf', contentType: 'application/pdf' })
      .field('titulo', 'Contrato assinado');
    if (![200, 201].includes(doc.status)) throw new Error(`[fixture] documento → ${doc.status} ${JSON.stringify(doc.body)}`);

    const os = await http()
      .post(`/api/contratos/${contrato}/ordens-servico`)
      .set(bearer(orgao.token))
      .send({ descricao: 'OS global E2E', tipo_escopo: 'GLOBAL', data_abertura: '2026-02-01', data_prazo: '2026-06-30', valor_total: 1000 });
    if (![200, 201].includes(os.status)) throw new Error(`[fixture] OS → ${os.status} ${JSON.stringify(os.body)}`);

    // Medição por repositório: pela API ela exige OS AUTORIZADA pelo fluxo de
    // requisição do almoxarifado (itens, estoque, aprovação) — fora do objeto
    // deste teste, que é o isolamento de acesso às medições existentes.
    const repoM = ctx.dataSource.getRepository(Medicao);
    const medicao: any = await repoM.save(
      repoM.create({
        contrato_id: contrato,
        numero_medicao: 1,
        periodo_inicio: new Date('2026-02-01'),
        periodo_fim: new Date('2026-02-28'),
        valor_medido: 1000,
        valor_acumulado_atual: 1000,
        percentual_fisico_medido: 10,
        status: StatusMedicao.AGUARDANDO_ATESTE,
      } as any),
    );

    // Ordem de fornecimento por repositório (idem: nasce de requisição autorizada)
    const repoO = ctx.dataSource.getRepository(OrdemFornecimento);
    const ordem: any = await repoO.save(
      repoO.create({
        orgao_id: orgao.id,
        contrato_id: contrato,
        fornecedor_id: F.id,
        numero: `OF-E2E-ORG-${seq}-${Date.now()}`,
        ano: 2026,
        sequencial: 800000 + seq,
        data_emissao: new Date('2026-02-01'),
        valor_total: 500,
        usuario_emitente_id: orgao.id,
        usuario_emitente_nome: 'Órgão E2E',
      } as any),
    );

    return { contrato, medicao: medicao.id, os: os.body.id, termo: termo.body.id, documento: doc.body.id, ordem: ordem.id };
  }

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Contratos A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Contratos B' });
    gestorA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN });
    F = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    dA = await montar(A, 1);
    dB = await montar(B, 2);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  const leituras = (d: Dados) => [
    `/api/contratos/${d.contrato}`,
    `/api/contratos/${d.contrato}/historico`,
    `/api/contratos/${d.contrato}/termos`,
    `/api/contratos/termos/${d.termo}`,
    `/api/contratos/${d.contrato}/documentos`,
    `/api/contratos/${d.contrato}/documentos/${d.documento}/download`,
    `/api/contratos/${d.contrato}/medicoes`,
    `/api/contratos/medicoes/${d.medicao}`,
    `/api/contratos/medicoes/${d.medicao}/discriminacoes`,
    `/api/contratos/medicoes/${d.medicao}/anexos`,
    `/api/contratos/${d.contrato}/execucao-financeira`,
    `/api/contratos/${d.contrato}/atestacoes`,
    `/api/contratos/${d.contrato}/ordens-servico`,
    `/api/contratos/ordens-servico/${d.os}`,
    `/api/contratos/ordens-servico/${d.os}/saldo`,
    `/api/almoxarifado/ordens/${d.ordem}`,
    `/api/almoxarifado/contratos/${d.contrato}/itens`,
  ];

  // ==========================================================================
  it('o próprio órgão (login do órgão e usuário do órgão) lê os seus recursos', async () => {
    for (const rota of leituras(dA)) {
      const r = await http().get(rota).set(bearer(A.token));
      expect([rota, r.status]).toEqual([rota, 200]);
    }
    const u = await http().get(`/api/contratos/${dA.contrato}`).set(bearer(gestorA.token));
    expect(u.status).toBe(200);
    expect(u.body.id).toBe(dA.contrato);
  });

  it('órgão B NÃO lê contrato/aditivo/documento/medição/OS/ordem de A (404)', async () => {
    for (const rota of leituras(dA)) {
      const r = await http().get(rota).set(bearer(B.token));
      expect([rota, r.status]).toEqual([rota, 404]);
    }
    // lista do órgão B não contém o contrato de A
    const lista = await http().get('/api/contratos').set(bearer(B.token)).expect(200);
    expect(JSON.stringify(lista.body)).not.toContain(dA.contrato);
  });

  it('órgão B NÃO altera, atesta nem exclui recursos de A (403) — nada muda', async () => {
    const escritas: Array<[string, () => any]> = [
      ['PUT contrato', () => http().put(`/api/contratos/${dA.contrato}`).set(bearer(B.token)).send({ objeto: 'invasão' })],
      ['PATCH status', () => http().patch(`/api/contratos/${dA.contrato}/status`).set(bearer(B.token)).send({ status: 'RESCINDIDO' })],
      ['DELETE contrato', () => http().delete(`/api/contratos/${dA.contrato}`).set(bearer(B.token))],
      ['POST termo', () => http().post(`/api/contratos/${dA.contrato}/termos`).set(bearer(B.token)).send({ tipo: 'APOSTILAMENTO', objeto: 'x' })],
      ['PATCH termo', () => http().patch(`/api/contratos/${dA.contrato}/termos/${dA.termo}`).set(bearer(B.token)).send({ objeto: 'invasão' })],
      ['cancelar termo', () => http().patch(`/api/contratos/${dA.contrato}/termos/${dA.termo}/cancelar`).set(bearer(B.token))],
      ['DELETE documento', () => http().delete(`/api/contratos/${dA.contrato}/documentos/${dA.documento}`).set(bearer(B.token))],
      ['atestar medição', () => http().patch(`/api/contratos/medicoes/${dA.medicao}/atestar`).set(bearer(B.token)).send({ fiscal_id: B.id, fiscal_nome: 'Invasor' })],
      ['aprovar medição', () => http().patch(`/api/contratos/medicoes/${dA.medicao}/aprovar`).set(bearer(B.token)).send({})],
      ['devolver medição', () => http().patch(`/api/contratos/medicoes/${dA.medicao}/devolver`).set(bearer(B.token)).send({ motivo: 'x' })],
      ['DELETE medição', () => http().delete(`/api/contratos/medicoes/${dA.medicao}`).set(bearer(B.token))],
      ['criar medição', () => http().post(`/api/contratos/${dA.contrato}/medicoes`).set(bearer(B.token)).send({ periodo_inicio: '2026-03-01', periodo_fim: '2026-03-31' })],
      ['PUT OS', () => http().put(`/api/contratos/ordens-servico/${dA.os}`).set(bearer(B.token)).send({ descricao: 'invasão' })],
      ['aprovar OS', () => http().patch(`/api/contratos/ordens-servico/${dA.os}/aprovar`).set(bearer(B.token)).send({})],
      ['cancelar OS', () => http().patch(`/api/contratos/ordens-servico/${dA.os}/cancelar`).set(bearer(B.token)).send({})],
      ['criar OS', () => http().post(`/api/contratos/${dA.contrato}/ordens-servico`).set(bearer(B.token)).send({ descricao: 'x' })],
      ['cancelar ordem', () => http().post(`/api/almoxarifado/ordens/${dA.ordem}/cancelar`).set(bearer(B.token)).send({ motivo: 'x' })],
      ['solicitar-lote', () => http().post('/api/contratos/medicoes/solicitar-lote').set(bearer(B.token)).send({ contrato_ids: [dA.contrato], mes_referencia: '2026-02' })],
    ];
    for (const [nome, req] of escritas) {
      const r = await req();
      expect([nome, r.status]).toEqual([nome, 403]);
    }
    const [c] = await ctx.dataSource.query(`SELECT objeto, status FROM contratos WHERE id = $1`, [dA.contrato]);
    expect(c.objeto).not.toBe('invasão');
    const [m] = await ctx.dataSource.query(`SELECT status FROM medicoes WHERE id = $1`, [dA.medicao]);
    expect(m).toBeTruthy();
    expect(m.status).toBe(StatusMedicao.AGUARDANDO_ATESTE);
    const [t] = await ctx.dataSource.query(`SELECT objeto FROM termos_aditivos WHERE id = $1`, [dA.termo]);
    expect(t.objeto).not.toBe('invasão');
    const [d] = await ctx.dataSource.query(`SELECT count(*)::int AS n FROM documentos_contrato WHERE id = $1`, [dA.documento]);
    expect(d.n).toBe(1);
    const [os] = await ctx.dataSource.query(`SELECT status, descricao FROM ordens_servico_contrato WHERE id = $1`, [dA.os]);
    expect(os.descricao).not.toBe('invasão');
    expect(os.status).not.toBe('CANCELADA');
    const [{ n }] = await ctx.dataSource.query(`SELECT count(*)::int AS n FROM termos_aditivos WHERE contrato_id = $1`, [dA.contrato]);
    expect(n).toBe(1);
  });

  it('criação: orgao_id de outro órgão → 403; sem orgao_id usa o do token', async () => {
    const r = await http()
      .post('/api/contratos')
      .set(bearer(B.token))
      .send({
        orgao_id: A.id,
        fornecedor_id: F.id,
        fornecedor_cnpj: F.cnpj,
        fornecedor_razao_social: F.razao_social,
        objeto: 'Contrato forjado em nome de A',
        valor_inicial: 1,
        valor_global: 1,
        data_vigencia_inicio: '2026-01-10',
        data_vigencia_fim: '2026-12-31',
      });
    expect(r.status).toBe(403);
    const [{ n }] = await ctx.dataSource.query(`SELECT count(*)::int AS n FROM contratos WHERE objeto = 'Contrato forjado em nome de A'`);
    expect(n).toBe(0);
  });

  it('o próprio órgão altera o que é dele (controle positivo)', async () => {
    const r = await http().patch(`/api/contratos/${dA.contrato}/termos/${dA.termo}`).set(bearer(A.token)).send({ objeto: 'Apostilamento corrigido' });
    expect([200, 201]).toContain(r.status);
    const os = await http().put(`/api/contratos/ordens-servico/${dA.os}`).set(bearer(A.token)).send({ descricao: 'OS corrigida' });
    expect([200, 201]).toContain(os.status);
  });

  it('admin da plataforma lê recursos de qualquer órgão', async () => {
    expect((await http().get(`/api/contratos/${dB.contrato}`).set(bearer(ctx.tokenAdmin()))).status).toBe(200);
    expect((await http().get(`/api/contratos/medicoes/${dB.medicao}`).set(bearer(ctx.tokenAdmin()))).status).toBe(200);
  });

  it('fornecedor (mesmo o do contrato) → 403 nas rotas do órgão; lista de contratos só com os dele', async () => {
    const rotas = [
      `/api/contratos/${dA.contrato}`,
      `/api/contratos/medicoes/${dA.medicao}`,
      `/api/contratos/ordens-servico/${dA.os}`,
      `/api/contratos/${dA.contrato}/termos`,
      `/api/almoxarifado/ordens/${dA.ordem}`,
    ];
    for (const rota of rotas) {
      const r = await http().get(rota).set(bearer(F.token));
      expect([rota, r.status]).toEqual([rota, 403]);
    }
    const atestar = await http().patch(`/api/contratos/medicoes/${dA.medicao}/atestar`).set(bearer(F.token)).send({ fiscal_id: F.id, fiscal_nome: 'x' });
    expect(atestar.status).toBe(403);
    const lista = await http().get('/api/contratos').set(bearer(F.token));
    expect(lista.status).toBe(200);
    const texto = JSON.stringify(lista.body);
    expect(texto).toContain(dA.contrato);
    expect(texto).toContain(dB.contrato); // F é o fornecedor dos dois contratos
  });

  it('anônimo → 401', async () => {
    for (const rota of [`/api/contratos/${dA.contrato}`, `/api/contratos/medicoes/${dA.medicao}`, `/api/contratos/ordens-servico/${dA.os}`, '/api/contratos']) {
      const r = await http().get(rota);
      expect([rota, r.status]).toEqual([rota, 401]);
    }
  });
});
