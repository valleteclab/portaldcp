/**
 * Smoke da infraestrutura e2e (test/support): prova que o Postgres
 * descartável, o boot do app, as fábricas, o JWT e o mock do PNCP funcionam.
 * Se este arquivo falhar, os demais e2e não significam nada.
 */
import {
  AppE2E,
  criarApp,
  criarOrgao,
  criarFornecedor,
  criarUsuarioOrgao,
  criarLicitacao,
  levarAteFase,
  enviarProposta,
  conectarSocket,
  fecharSockets,
  pncpMock,
} from './support';
import { ModalidadeLicitacao, FaseLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { PorteEmpresa } from '../src/fornecedores/entities/enums';
import { UserType } from '../src/auth/auth.service';
import axios from 'axios';

describe('Infra e2e (smoke)', () => {
  let ctx: AppE2E;

  beforeAll(async () => {
    ctx = await criarApp();
    pncpMock.limpar();
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  it('usa o Postgres descartável com o schema criado pelas entidades', async () => {
    const [{ banco, porta }] = await ctx.dataSource.query(
      `SELECT current_database() AS banco, current_setting('port') AS porta`,
    );
    expect(banco).toBe('portaldcp_e2e');
    expect(porta).toBe(process.env.DB_PORT);

    const [{ total }] = await ctx.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('orgaos', 'fornecedores', 'licitacoes', 'propostas')`,
    );
    expect(total).toBe(4);
  });

  it('sobe o app com o prefixo /api (health público)', async () => {
    const r = await ctx.http().get('/api/health').expect(200);
    expect(r.body.status).toBe('ok');
  });

  it('cria dois órgãos distintos (A e B) e aceita o token em rota protegida', async () => {
    const A = await criarOrgao(ctx, { nome: 'Órgão A' });
    const B = await criarOrgao(ctx, { nome: 'Órgão B' });
    expect(A.id).not.toBe(B.id);

    await ctx.http().get('/api/auth/me').expect(401);

    const me = await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${A.token}`).expect(200);
    expect(me.body).toMatchObject({ sub: A.id, type: UserType.ORGAO });

    const pregoeiro = await criarUsuarioOrgao(ctx, A);
    const meUsuario = await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${pregoeiro.token}`)
      .expect(200);
    expect(meUsuario.body).toMatchObject({ sub: pregoeiro.id, type: UserType.USUARIO, orgaoId: A.id });
  });

  it('cria fornecedores ME/EPP e demais com token próprio', async () => {
    const me = await criarFornecedor(ctx, { porte: 'ME' });
    const demais = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    expect(me.porte).toBe(PorteEmpresa.ME);
    expect(me.mpe).toBe(true);
    expect(demais.mpe).toBe(false);

    const r = await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${me.token}`).expect(200);
    expect(r.body).toMatchObject({ sub: me.id, type: UserType.FORNECEDOR });
  });

  it('leva um pregão até o acolhimento e recebe proposta do fornecedor', async () => {
    const orgao = await criarOrgao(ctx);
    const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
    expect(lic.itens).toHaveLength(2);

    const licitacao = await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    expect(licitacao.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);

    const forn = await criarFornecedor(ctx, { porte: 'EPP' });
    const proposta = await enviarProposta(ctx, forn, lic, [95, 45]);
    expect(proposta.status).toBe('ENVIADA');
  });

  it('conecta num namespace socket.io do app', async () => {
    const s = await conectarSocket(ctx, '/disputa-v2');
    expect(s.connected).toBe(true);
    s.disconnect();
  });

  it('não vazou nada para a rede externa nem para o PNCP sem pedido', () => {
    // Nenhum passo acima publica no PNCP; qualquer captura aqui é inesperada
    expect(pncpMock.filtrar()).toEqual([]);
    expect(pncpMock.bloqueadas).toEqual([]);
  });

  it('o mock do PNCP captura o que o app enviaria', async () => {
    // Chamada direta ao host fictício configurado em PNCP_API_URL
    const r = await axios.post(`${process.env.PNCP_API_URL}/orgaos/12345678000199/compras`, { teste: 1 });
    expect(r.status).toBe(201);
    const envios = pncpMock.filtrar('POST', /\/compras$/);
    expect(envios).toHaveLength(1);
    expect(envios[0].corpo).toEqual({ teste: 1 });
    pncpMock.limpar();
  });
});
