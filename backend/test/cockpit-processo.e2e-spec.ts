/**
 * TELA DO PROCESSO — ETAPA B (leituras novas do cockpit), contra o banco real.
 *
 *  1. GET /licitacoes/:id/conferencia-publicacao — checklist de pré-publicação
 *     montado com as pré-condições do PUBLICAR (documentos, autorização,
 *     aviso, itens, PCA), com a ação de cada pendência;
 *  2. processo-completo — menu "Mais ações" (acoes_menu: disponíveis e
 *     bloqueadas com o motivo) e os dados da contratação (fundamento legal,
 *     autoridade, datas);
 *  3. isolamento: só o órgão dono lê (outro órgão, fornecedor e anônimo não).
 */
import { AppE2E, OrgaoFixture, criarApp, criarFornecedor, criarLicitacao, criarOrgao } from './support';
import { criarDispensaPublicada } from './support/dispensa';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Tela do processo — Etapa B (conferência de pré-publicação e menu de ações)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  const http = () => ctx.http();

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Cockpit E2E' });
    B = await criarOrgao(ctx, { nome: 'Outra Prefeitura Cockpit E2E' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  describe('1. dispensa na fase interna sem itens nem instrução', () => {
    let licId: string;

    beforeAll(async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { itens: [] });
      licId = lic.id;
    });

    it('checklist com as pendências do PUBLICAR, cada uma com a ação que resolve', async () => {
      const r = (await http().get(`/api/licitacoes/${licId}/conferencia-publicacao`).set(bearer(A.token)).expect(200)).body;
      const por = Object.fromEntries(r.itens.map((i: any) => [i.chave, i]));
      expect(r).toMatchObject({ aplicavel: true, aguardando_divulgacao: false, pode_publicar: false });
      expect(por.DOCUMENTOS).toMatchObject({ estado: 'PENDENTE', bloqueia: true, acao: 'ABRIR_FASE_INTERNA' });
      expect(por.AUTORIZACAO).toMatchObject({ estado: 'PENDENTE', bloqueia: true, fundamento: 'Lei 14.133/2021, art. 72, VIII' });
      expect(por.AVISO).toMatchObject({ estado: 'PENDENTE', acao: 'GERAR_AVISO' });
      expect(por.ITENS).toMatchObject({ estado: 'PENDENTE', acao: 'CADASTRAR_ITENS' });
      expect(por.ITENS.detalhe).toMatch(/não tem itens/);
      expect(r.bloqueantes).toBeGreaterThanOrEqual(4);
    });

    it('menu: suspender bloqueado com o motivo (não divulgado); sem cancelar publicação', async () => {
      const pc = (await http().get(`/api/licitacoes/${licId}/processo-completo`).set(bearer(A.token)).expect(200)).body;
      const m = Object.fromEntries(pc.acoes_menu.map((a: any) => [a.ato, a]));
      expect(m.SUSPENDER).toMatchObject({ disponivel: false, fora_da_fase: true });
      expect(m.SUSPENDER.motivos.join(' ')).toMatch(/ainda não divulgado/);
      expect(m.CANCELAR_PUBLICACAO).toBeUndefined();
      expect(pc.licitacao).toMatchObject({ fundamento_legal: 'Lei 14.133/2021, art. 75, II', sem_pca: false });
      expect(pc.licitacao.created_at).toBeTruthy();
      expect(pc.licitacao.autoridade).toMatchObject({ origem: 'CADASTRO' });
      expect(pc.licitacao.autoridade.nome).toBeTruthy();
    });

    it('isolamento: outro órgão, fornecedor e anônimo não leem a conferência', async () => {
      const outro = await http().get(`/api/licitacoes/${licId}/conferencia-publicacao`).set(bearer(B.token));
      expect([403, 404]).toContain(outro.status);
      expect(JSON.stringify(outro.body)).not.toContain('AUTORIZACAO');
      const f = await criarFornecedor(ctx);
      const forn = await http().get(`/api/licitacoes/${licId}/conferencia-publicacao`).set(bearer(f.token));
      expect(forn.status).toBe(403);
      const anon = await http().get(`/api/licitacoes/${licId}/conferencia-publicacao`);
      expect(anon.status).toBe(401);
    });
  });

  describe('2. dispensa enviada ao PNCP e aguardando a confirmação', () => {
    let licId: string;

    beforeAll(async () => {
      const lic = await criarDispensaPublicada(ctx, A, { confirmar: false });
      licId = lic.id;
    });

    it('menu: deserta/fracassada/retificar bloqueadas com o motivo; cancelar publicação disponível', async () => {
      const pc = (await http().get(`/api/licitacoes/${licId}/processo-completo`).set(bearer(A.token)).expect(200)).body;
      expect(pc.licitacao.fase).toBe('AGUARDANDO_DIVULGACAO');
      const m = Object.fromEntries(pc.acoes_menu.map((a: any) => [a.ato, a]));
      expect(m.DECLARAR_DESERTA).toMatchObject({ disponivel: false, fora_da_fase: true });
      expect(m.DECLARAR_DESERTA.motivos.join(' ')).toMatch(/não publicado no PNCP/);
      expect(m.DECLARAR_FRACASSADA.disponivel).toBe(false);
      expect(m.RETIFICAR_EDITAL).toMatchObject({ disponivel: false, fora_da_fase: true });
      expect(m.CANCELAR_PUBLICACAO).toMatchObject({ disponivel: true, requer_motivo: true });
      expect(m.SUSPENDER.disponivel).toBe(true);
    });

    it('conferência: tudo pronto (nada impede o reenvio) e marcada como aguardando', async () => {
      const r = (await http().get(`/api/licitacoes/${licId}/conferencia-publicacao`).set(bearer(A.token)).expect(200)).body;
      expect(r).toMatchObject({ aplicavel: true, aguardando_divulgacao: true, pode_publicar: true, bloqueantes: 0 });
      const por = Object.fromEntries(r.itens.map((i: any) => [i.chave, i]));
      expect(por.AVISO.estado).toBe('OK');
      expect(por.ITENS.estado).toBe('OK');
      expect(por.OUTRAS).toBeUndefined();
    });

    it('isolamento: outro órgão não lê o menu nem a conferência deste processo', async () => {
      const pc = await http().get(`/api/licitacoes/${licId}/processo-completo`).set(bearer(B.token));
      expect([403, 404]).toContain(pc.status);
      expect(pc.body?.acoes_menu).toBeUndefined();
      const c = await http().get(`/api/licitacoes/${licId}/conferencia-publicacao`).set(bearer(B.token));
      expect([403, 404]).toContain(c.status);
    });
  });
});
