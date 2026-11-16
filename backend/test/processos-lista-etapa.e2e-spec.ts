/**
 * Lista de processos mostra ONDE a licitação está (dono, 09/11/2026: o pregão
 * homologado aparecia só "Em andamento").
 */
import { AppE2E, OrgaoFixture, criarApp, criarLicitacao, criarOrgao, levarAteFase } from './support';
import { pararTodosOsCrons } from './support/pregao';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Lista de processos — etapa da licitação', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Câmara da Lista de Processos' });
  });
  afterAll(async () => ctx?.fechar());

  test('a lista traz a etapa e o id da licitação; acompanha a mudança de fase', async () => {
    const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
      itens: [{ descricao: 'Item da lista', quantidade: 1, valor_unitario_estimado: 100 }],
    });
    // o processo da licitação existe (criado com ela ou na 1ª leitura)
    await ctx.http().get(`/api/processos/referencia/LICITACAO/${lic.id}`).set(bearer(orgao.token));
    const lista = async () => (await ctx.http().get('/api/processos?limit=50').set(bearer(orgao.token)).expect(200)).body as any[];
    let p = (await lista()).find((x) => x.etapa?.licitacao_id === lic.id);
    expect(p).toBeTruthy();
    expect(p.etapa.tom).toBe('interna');
    await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    p = (await lista()).find((x) => x.etapa?.licitacao_id === lic.id);
    expect(p.etapa).toMatchObject({ rotulo: 'Recebendo propostas', tom: 'externa', sala: false });
  });
});
