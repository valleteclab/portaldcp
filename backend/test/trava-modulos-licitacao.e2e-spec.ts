/**
 * Trava de módulo no servidor para as rotas de licitação e processo.
 *
 * O menu já esconde as telas de quem não contratou o módulo; aqui se prova que
 * a rota também recusa quem souber o endereço (CLAUDE.md: "só o menu não basta").
 *
 * Três garantias:
 *  1. órgão SEM o módulo recebe 403 em cada controlador travado;
 *  2. órgão COM o módulo não é barrado pela trava (a rota responde o que for);
 *  3. fornecedor nunca é barrado pela trava (ele não tem módulo).
 */
import { AppE2E, criarApp, criarOrgao, criarFornecedor, criarUsuarioOrgao, OrgaoFixture, FornecedorFixture } from './support';
import { ModuloSistema } from '../src/orgaos/enums/modulos.enum';

const Z = '00000000-0000-4000-8000-000000000000';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

/**
 * Uma rota não pública de cada controlador travado, e os módulos que a liberam.
 * Sem verbo = GET. As rotas de consulta pública (portal da transparência, vitrine
 * de editais) ficam de fora de propósito: continuam abertas, com ou sem módulo.
 */
const L = [ModuloSistema.LICITACOES];
const INTERNA = [ModuloSistema.LICITACOES, ModuloSistema.PROCESSOS, ModuloSistema.DEMANDAS, ModuloSistema.CREDENCIAMENTO];
const SALA = [ModuloSistema.LICITACOES, ModuloSistema.DISPUTA];
const LP = [ModuloSistema.LICITACOES, ModuloSistema.PROCESSOS];
const LC = [ModuloSistema.LICITACOES, ModuloSistema.CREDENCIAMENTO];
const ROTAS: Array<[string, ModuloSistema[]]> = [
  // fase interna
  [`/api/fase-interna/${Z}/conformidade`, INTERNA],
  [`/api/fase-interna/despachos/${Z}/pdf`, INTERNA],
  [`/api/fase-interna/estruturado/${Z}/conformidade`, INTERNA],
  [`/api/fase-interna/${Z}/consumo-limite`, INTERNA],
  [`/api/fluxo-fase-interna/modelos`, INTERNA],
  [`/api/fase-interna/${Z}/rascunho-ia`, INTERNA],
  [`/api/fase-interna/${Z}/tramitacoes`, INTERNA],
  [`/api/fase-interna/${Z}/minutas`, INTERNA],
  [`/api/fase-interna/${Z}/etp`, INTERNA],
  [`/api/numero-processo/configuracao`, INTERNA],
  [`/api/parametros-licitacao/limites-dispensa`, INTERNA],
  // sala: sessão, disputa, julgamento, recursos, diligências
  ['GET /api/disputa/sessao/' + Z + '/fila', SALA],
  ['POST /api/disputa/sessao/' + Z + '/lance-fechado', SALA],
  [`/api/sessao/licitacao/${Z}/sessoes`, SALA],
  ['GET /api/recursos/' + Z + '/razoes/arquivo', SALA],
  [`/api/diligencias/licitacao/${Z}`, SALA],
  [`/api/julgamento/sessao/${Z}/desempate`, SALA],
  ['GET /api/julgamento/licitacao/' + Z + '/tecnica/notas', SALA],
  [`/api/julgamento/sessao/${Z}/ranking`, SALA],
  [`/api/julgamento/sessao/${Z}/me-epp`, SALA],
  [`/api/julgamento/sessao/${Z}/negociacao`, SALA],
  // cadastro da licitação
  ['PUT /api/itens/' + Z, LP],
  ['PUT /api/lotes/' + Z, LP],
  [`/api/documentos/licitacao/${Z}`, LP],
  // compartilhadas com o credenciamento e com as atas
  ['GET /api/habilitacao/licitacao/' + Z, LC],
  [`/api/publicacao/licitacao/${Z}/prazos`, LC],
  [`/api/resultado/licitacao/${Z}`, [ModuloSistema.LICITACOES, ModuloSistema.ATAS]],
  // fase externa
  ['PUT /api/esclarecimentos/' + Z + '/arquivar', L],
  ['PUT /api/impugnacoes/' + Z + '/em-analise', L],
  ['GET /api/propostas/minhas', L],
  [`/api/comprovantes/licitacao/${Z}`, L],
  ['PUT /api/leilao/licitacao/' + Z + '/configuracao', L],
  ['PUT /api/concurso/licitacao/' + Z + '/regulamento', L],
  ['PUT /api/dialogo-competitivo/licitacao/' + Z + '/configuracao', L],
  [`/api/licitacoes/${Z}/bll/historico`, L],
  // credenciamento
  [`/api/credenciamento/${Z}/estatisticas`, [ModuloSistema.CREDENCIAMENTO]],
];

const chamar = (ctx: AppE2E, rota: string, token: string) => {
  const [a, b] = rota.split(' ');
  const [verbo, caminho] = b ? [a.toLowerCase(), b] : ['get', a];
  return (ctx.http() as any)[verbo](caminho).set(bearer(token)).send(verbo === 'get' ? undefined : {});
};

const barradoPelaTrava = (r: { status: number; body: any }) =>
  r.status === 403 && /acesso ao módulo|acessar o módulo/i.test(String(r.body?.message ?? ''));

describe('Trava de módulo nas rotas de licitação e processo', () => {
  let ctx: AppE2E;
  let semModulo: OrgaoFixture; // só contratos, almoxarifado e frota
  let comLicitacoes: OrgaoFixture;
  let fornecedor: FornecedorFixture;

  beforeAll(async () => {
    ctx = await criarApp();
    semModulo = await criarOrgao(ctx, { modulos: [ModuloSistema.CONTRATOS, ModuloSistema.ALMOXARIFADO, ModuloSistema.FROTA] });
    comLicitacoes = await criarOrgao(ctx, { modulos: [ModuloSistema.LICITACOES] });
    fornecedor = await criarFornecedor(ctx);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  it.each(ROTAS)('%s recusa o órgão sem o módulo', async (rota) => {
    const r = await chamar(ctx, rota, semModulo.token);
    expect({ rota, status: r.status, msg: r.body?.message }).toEqual(
      expect.objectContaining({ status: 403, msg: expect.stringMatching(/acesso ao módulo/i) }),
    );
  });

  it.each(ROTAS.filter(([, m]) => m.includes(ModuloSistema.LICITACOES)))(
    '%s não barra o órgão que tem Licitações',
    async (rota) => {
      const r = await chamar(ctx, rota, comLicitacoes.token);
      expect({ rota, barrado: barradoPelaTrava(r) }).toEqual({ rota, barrado: false });
    },
  );

  it.each(ROTAS)('%s não barra o fornecedor', async (rota) => {
    const r = await chamar(ctx, rota, fornecedor.token);
    expect({ rota, barrado: barradoPelaTrava(r) }).toEqual({ rota, barrado: false });
  });

  it('cada módulo da lista libera a rota, e só eles', async () => {
    for (const modulo of [ModuloSistema.PROCESSOS, ModuloSistema.DEMANDAS, ModuloSistema.CREDENCIAMENTO, ModuloSistema.DISPUTA, ModuloSistema.ATAS]) {
      const orgao = await criarOrgao(ctx, { modulos: [modulo] });
      for (const [rota, modulos] of ROTAS) {
        const r = await chamar(ctx, rota, orgao.token);
        expect({ modulo, rota, barrado: barradoPelaTrava(r) }).toEqual({ modulo, rota, barrado: !modulos.includes(modulo) });
      }
    }
  });

  it('usuário com lista própria sem Licitações é barrado mesmo num órgão que tem o módulo', async () => {
    const orgao = await criarOrgao(ctx, { modulos: [ModuloSistema.LICITACOES, ModuloSistema.CONTRATOS] });
    const usuario = await criarUsuarioOrgao(ctx, orgao);
    const livre = await ctx.http().get(`/api/fase-interna/${Z}/etp`).set(bearer(usuario.token));
    expect(barradoPelaTrava(livre)).toBe(false);

    const r = await ctx.http().put(`/api/usuarios/${usuario.id}/modulos`).set(bearer(orgao.token)).send({ modulos: [ModuloSistema.CONTRATOS] });
    expect([200, 201]).toContain(r.status);
    const barrado = await ctx.http().get(`/api/fase-interna/${Z}/etp`).set(bearer(usuario.token));
    expect(barrado.status).toBe(403);
    expect(String(barrado.body?.message)).toMatch(/permissão para acessar o módulo/i);
  });

  it('o que alimenta telas sem módulo continua aberto: contagem de tarefas (menu) e assinaturas pendentes (Central de Aprovações)', async () => {
    const usuario = await criarUsuarioOrgao(ctx, semModulo);
    for (const rota of ['/api/tarefas/contagem', '/api/assinaturas-internas/pendentes']) {
      const r = await ctx.http().get(rota).set(bearer(usuario.token));
      expect({ rota, status: r.status }).toEqual({ rota, status: 200 });
    }
  });

  it('rotas públicas dos controladores travados seguem abertas sem login', async () => {
    const r = await ctx.http().get('/api/credenciamento/publicos');
    expect(r.status).toBe(200);
  });
});
