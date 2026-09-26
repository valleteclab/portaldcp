/**
 * ITENS OBRIGATÓRIOS NA PUBLICAÇÃO + ASSISTENTE DA FASE INTERNA (homologação).
 *
 *  1. Gate de itens: CONCLUIR_FASE_INTERNA e PUBLICAR (dispensa e pregão)
 *     recusam processo sem item ativo com quantidade e valor estimado — a
 *     pendência aparece na recusa e na lista de atos do cockpit.
 *  2. Itens pelo lote (POST /itens/licitacao/:id/batch — caminho do
 *     assistente) aparecem no processo-completo; só o órgão dono grava.
 *  3. Publicada sem itens (dado anterior ao gate): a fila do PNCP não envia a
 *     compra (ERRO_DEFINITIVO com a explicação); o órgão cancela a publicação
 *     pelo cockpit (motivo obrigatório; outro órgão 403), o processo volta à
 *     fase interna, recebe os itens e é publicado de novo.
 *  4. Pesquisa de preços real (módulo PP): os itens da pesquisa acompanham os
 *     itens da contratação; o documento gerado atende a "estimativa de
 *     despesa" do art. 72 e devolve o valor referencial aos itens; o agente
 *     (fonte PNCP, mockada) coleta e aprova cotação.
 */
import {
  AppE2E,
  buscarLicitacao,
  criarApp,
  criarLicitacao,
  criarOrgao,
  levarAteFase,
  LicitacaoFixture,
  OrgaoFixture,
  pncpMock,
} from './support';
import {
  corpoDivulgacao,
  criarDispensaPublicada,
  criarDocumentoInstrucao,
  DOCUMENTOS_ART_72,
  fimPropostasSugerido,
  vincularOrgaoPncp,
} from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from '../src/fase-interna/entities/documento-fase-interna.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PENDENCIA = /Cadastre pelo menos um item com quantidade e valor estimado/;

describe('Itens obrigatórios na publicação + assistente', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outroOrgao: OrgaoFixture;
  const http = () => ctx.http();

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Itens/Assistente E2E' });
    outroOrgao = await criarOrgao(ctx, { nome: 'Outro Órgão Itens E2E' });
    await vincularOrgaoPncp(ctx, orgao, '1');
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  const itemLote = (n: number, extra: Record<string, any> = {}) => ({
    numero_item: n,
    descricao_resumida: `Resma de papel A4 ${n}`,
    quantidade: 10,
    unidade_medida: 'CAIXA',
    valor_unitario_estimado: 25.5,
    tipo_item: 'MATERIAL',
    sem_pca: true,
    justificativa_sem_pca: 'Teste E2E',
    ...extra,
  });

  // --------------------------------------------------------------------------
  describe('1. gate de itens', () => {
    it('dispensa sem itens: concluir a instrução e publicar recusam com a pendência', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA, { itens: [] });
      for (const [tipo, titulo] of DOCUMENTOS_ART_72) await criarDocumentoInstrucao(ctx, lic, tipo, titulo);

      const concluir = await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token));
      expect(concluir.status).toBe(400);
      expect(JSON.stringify(concluir.body)).toMatch(PENDENCIA);

      const atos = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body as any[];
      const ato = atos.find((a) => a.ato === 'CONCLUIR_FASE_INTERNA');
      expect(ato.disponivel).toBe(false);
      expect(ato.pendencias.join(' ')).toMatch(PENDENCIA);

      // item com valor zero não conta
      await http()
        .post(`/api/itens/licitacao/${lic.id}/batch`)
        .set(bearer(orgao.token))
        .send([itemLote(1, { valor_unitario_estimado: 0.0001, quantidade: 1 })])
        .expect(201);
      await ctx.dataSource.query(`UPDATE itens_licitacao SET valor_unitario_estimado = 0 WHERE licitacao_id = $1`, [lic.id]);
      const zerado = await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token));
      expect(zerado.status).toBe(400);
      expect(JSON.stringify(zerado.body)).toMatch(/nenhum dos 1 item/);

      await ctx.dataSource.query(`UPDATE itens_licitacao SET valor_unitario_estimado = 25.5, valor_total_estimado = 25.5 WHERE licitacao_id = $1`, [lic.id]);
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token)).expect(200);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
    });

    it('dispensa já concluída cujos itens foram removidos: publicar recusa (nada vai ao PNCP)', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      for (const [tipo, titulo] of DOCUMENTOS_ART_72) await criarDocumentoInstrucao(ctx, lic, tipo, titulo);
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token)).expect(200);
      for (const it of lic.itens) await http().delete(`/api/itens/${it.id}`).set(bearer(orgao.token)).expect(200);

      pncpMock.limpar();
      const pub = await http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(fimPropostasSugerido()));
      expect(pub.status).toBe(400);
      expect(JSON.stringify(pub.body)).toMatch(PENDENCIA);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      expect(pncpMock.filtrar('POST', /\/compras$/)).toHaveLength(0);
    });

    it('pregão sem itens: não publica (pendência na recusa)', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, { itens: [] });
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const pub = await http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(new Date(Date.now() + 70 * 24 * 3_600_000)));
      expect(pub.status).toBe(400);
      expect(JSON.stringify(pub.body)).toMatch(PENDENCIA);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
    });
  });

  // --------------------------------------------------------------------------
  describe('2. itens pelo lote (assistente)', () => {
    it('batch grava os itens e o processo-completo os mostra; outro órgão 403', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, { itens: [] });
      const r = await http()
        .post(`/api/itens/licitacao/${lic.id}/batch`)
        .set(bearer(orgao.token))
        .send([itemLote(1), itemLote(2, { quantidade: 3, valor_unitario_estimado: 100, tipo_item: 'SERVICO', unidade_medida: 'SERVICO' })]);
      expect(r.status).toBe(201);
      expect(r.body).toHaveLength(2);

      const pc = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200)).body;
      expect(pc.itens).toHaveLength(2);
      expect(pc.itens.map((i: any) => Number(i.valor_unitario_estimado))).toEqual([25.5, 100]);
      expect(pc.checklist.possui_itens).toBe(true);

      const alheio = await http()
        .post(`/api/itens/licitacao/${lic.id}/batch`)
        .set(bearer(outroOrgao.token))
        .send([itemLote(3)]);
      expect(alheio.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  describe('3. publicada sem itens → PNCP não envia → cancelar publicação → republicar', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      // publicada e ainda AGUARDANDO a confirmação do PNCP (a fila não rodou)
      lic = await criarDispensaPublicada(ctx, orgao, { confirmar: false });
    });

    it('a fila recusa a compra sem itens com a explicação (ERRO_DEFINITIVO, nada enviado) — a divulgação NÃO é confirmada', async () => {
      // Estado anterior ao gate (caso da homologação): publicada sem itens
      await ctx.dataSource.query(`DELETE FROM itens_licitacao WHERE licitacao_id = $1`, [lic.id]);
      pncpMock.limpar();
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      expect(pncpMock.filtrar('POST', /\/compras$/)).toHaveLength(0);
      const [compra] = await ctx.dataSource.query(
        `SELECT status::text AS status, erro_mensagem FROM pncp_sync WHERE licitacao_id = $1 AND tipo::text = 'COMPRA' ORDER BY created_at DESC LIMIT 1`,
        [lic.id],
      );
      expect(compra.status).toBe('ERRO_DEFINITIVO');
      expect(compra.erro_mensagem).toMatch(/Compra não enviada ao PNCP/);
      expect(compra.erro_mensagem).toMatch(/Cancele a publicação/);
      // sem compra no PNCP não houve divulgação oficial: o prazo não começou
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
    });

    it('cancelar: outro órgão 403, sem motivo 400', async () => {
      const alheio = await http()
        .post(`/api/licitacoes/${lic.id}/cancelar-publicacao`)
        .set(bearer(outroOrgao.token))
        .send({ motivo: 'Tentativa de outro órgão' });
      expect(alheio.status).toBe(403);
      const semMotivo = await http().post(`/api/licitacoes/${lic.id}/cancelar-publicacao`).set(bearer(orgao.token)).send({});
      expect(semMotivo.status).toBe(400);
      expect((await buscarLicitacao(ctx, lic)).fase).not.toBe(FaseLicitacao.APROVACAO_INTERNA);
    });

    it('cancelar pelo cockpit: volta à fase interna, fila limpa, histórico com o motivo', async () => {
      const atos = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body as any[];
      expect(atos.some((a) => a.ato === 'CANCELAR_PUBLICACAO')).toBe(false); // ato do sistema, rota própria

      pncpMock.limpar();
      const r = await http()
        .post(`/api/licitacoes/${lic.id}/cancelar-publicacao`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Publicada sem itens — cadastrar os itens e publicar de novo' });
      expect(r.status).toBe(201);
      expect(r.body.compra_excluida_pncp).toBe(false);
      expect(pncpMock.filtrar('DELETE')).toHaveLength(0);

      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
      const pendentes = await ctx.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM pncp_sync WHERE licitacao_id = $1 AND status::text <> 'EXCLUIDO' AND tipo::text IN ('COMPRA','ITEM','DOCUMENTO')`,
        [lic.id],
      );
      expect(pendentes[0].n).toBe(0);
      const hist = (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(orgao.token)).expect(200)).body as any[];
      expect(hist.pop()).toMatchObject({ ato: 'CANCELAR_PUBLICACAO', fase_para: 'APROVACAO_INTERNA', ator_tipo: 'ORGAO' });
    });

    it('cadastra os itens e publica de novo: a compra vai ao PNCP com os itens', async () => {
      await http().post(`/api/itens/licitacao/${lic.id}/batch`).set(bearer(orgao.token)).send([itemLote(1)]).expect(201);
      await http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(fimPropostasSugerido()))
        .expect(200);
      pncpMock.limpar();
      for (let i = 0; i < 4 && (await ctx.processarFilaPncp({ licitacaoId: lic.id })).processados > 0; i++);
      expect(pncpMock.filtrar('POST', /\/compras$/)).toHaveLength(1);
      expect(pncpMock.filtrar('POST', /\/itens$/).length).toBeGreaterThanOrEqual(1);
      // compra aceita = divulgação confirmada: o recebimento abre
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    });

    it('publicada: itens não são mais incluídos, alterados nem excluídos (só voltando à fase interna)', async () => {
      const itens = await http().get(`/api/itens/licitacao/${lic.id}`).set(bearer(orgao.token)).expect(200);
      const item = itens.body[0];
      expect(item).toBeDefined();

      const incluir = await http().post(`/api/itens/licitacao/${lic.id}/batch`).set(bearer(orgao.token)).send([itemLote(2)]);
      expect(incluir.status).toBe(409);
      expect(incluir.body.message).toMatch(/depois da publicação/);

      const alterar = await http().put(`/api/itens/${item.id}`).set(bearer(orgao.token)).send({ quantidade: 999 });
      expect(alterar.status).toBe(409);

      const excluir = await http().delete(`/api/itens/${item.id}`).set(bearer(orgao.token));
      expect(excluir.status).toBe(409);

      const depois = await http().get(`/api/itens/licitacao/${lic.id}`).set(bearer(orgao.token)).expect(200);
      expect(depois.body).toHaveLength(itens.body.length);
      expect(Number(depois.body[0].quantidade)).toBe(Number(item.quantidade));
    });
  });

  // --------------------------------------------------------------------------
  describe('4. pesquisa de preços real (módulo PP)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA, { itens: [] });
    });

    const instrucaoPP = async () => {
      const ins = (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(orgao.token)).expect(200)).body;
      return ins.itens.find((i: any) => i.tipo === TipoDocumentoFaseInterna.PESQUISA_PRECOS);
    };

    it('abrir o módulo antes dos itens e cadastrar depois: a pesquisa acompanha os itens', async () => {
      const antes = (await http().get(`/api/fase-interna/${lic.id}/precos`).set(bearer(orgao.token)).expect(200)).body;
      expect(antes.dados.itens).toHaveLength(1); // provisório (objeto)
      expect((await instrucaoPP()).status).not.toBe('OK'); // só abrir não é estimativa de despesa

      await http()
        .post(`/api/itens/licitacao/${lic.id}/batch`)
        .set(bearer(orgao.token))
        .send([itemLote(1, { codigo_catmat: '461234' }), itemLote(2, { descricao_resumida: 'Caneta azul' })])
        .expect(201);
      const depois = (await http().get(`/api/fase-interna/${lic.id}/precos`).set(bearer(orgao.token)).expect(200)).body;
      expect(depois.dados.itens.map((i: any) => i.descricao)).toEqual(['Resma de papel A4 1', 'Caneta azul']);
    });

    it('agente (fonte PNCP mockada) coleta e aprova cotação para o item', async () => {
      pncpMock.limpar();
      pncpMock.responder('GET', /\/api\/consulta\/v1\/contratacoes\/publicacao/, {
        status: 200,
        corpo: {
          data: [
            {
              numeroControlePNCP: '12345678000195-1-000010/2026',
              orgaoEntidade: { cnpj: '12345678000195', razaoSocial: 'Município Referência' },
              anoCompra: 2026,
              sequencialCompra: 10,
              objetoCompra: 'Aquisição de papel',
              dataPublicacaoPncp: new Date().toISOString(),
            },
          ],
        },
      });
      pncpMock.responder('GET', /\/orgaos\/12345678000195\/compras\/2026\/10\/itens/, {
        status: 200,
        corpo: [
          {
            numeroItem: 1,
            descricao: 'Resma de papel A4 CATMAT 461234',
            quantidade: 50,
            unidadeMedida: 'CAIXA',
            valorUnitarioEstimado: 24,
            valorUnitarioHomologado: 23.9,
            dataAtualizacao: new Date().toISOString(),
          },
        ],
      });
      const r = await http()
        .post(`/api/fase-interna/${lic.id}/precos/item/1/agente/executar`)
        .set(bearer(orgao.token))
        .send({ fontes: ['PNCP'], maxPorFonte: 3, autoAprovar: true, usarBrowserFallback: true });
      expect(r.status).toBe(201);
      expect(pncpMock.filtrar('GET', /contratacoes\/publicacao/).length).toBeGreaterThanOrEqual(1);
      const item1 = r.body.dados.itens.find((i: any) => i.item_numero === 1);
      expect(item1.cotacoes.length).toBeGreaterThanOrEqual(1);
      expect(item1.cotacoes[0].fonte).toBe('PNCP');
      expect(Number(item1.cotacoes[0].valor_unitario)).toBeCloseTo(23.9, 2);
    });

    it('documento PP gerado: estimativa de despesa OK na instrução e valor referencial vai aos itens', async () => {
      const fonte = (item: number, valor: number, i: number) =>
        http()
          .post(`/api/fase-interna/${lic.id}/precos/fonte`)
          .set(bearer(orgao.token))
          .send({
            itemNumero: item,
            cotacao: {
              fonte: 'FORNECEDOR_DIRETO',
              descricao_fonte: `Cotação ${i}`,
              fornecedor_razao_social: `Fornecedor ${i}`,
              fornecedor_cnpj: `1234567800019${i}`,
              url_referencia: `https://exemplo.invalid/cotacao/${item}/${i}`,
              data_pesquisa: new Date().toISOString().slice(0, 10),
              valor_unitario: valor,
            },
          })
          .expect(201);
      await fonte(2, 2, 1);
      await fonte(2, 3, 2);
      await fonte(2, 4, 3);
      await http()
        .put(`/api/fase-interna/${lic.id}/precos/metodologia`)
        .set(bearer(orgao.token))
        .send({ metodologia: 'MEDIANA' })
        .expect(200);
      const g = await http()
        .post(`/api/fase-interna/${lic.id}/precos/gerar-documento`)
        .set(bearer(orgao.token))
        .send({ responsavel: { nome: 'Servidor E2E', cargo: 'Agente de contratação' }, metodologia: 'MEDIANA' });
      expect(g.status).toBe(201);

      const pp = await instrucaoPP();
      expect(pp.status).toBe('OK');
      const pc = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200)).body;
      const item2 = pc.itens.find((i: any) => i.numero_item === 2);
      expect(Number(item2.valor_unitario_estimado)).toBeCloseTo(3, 2);
    });
  });
});
