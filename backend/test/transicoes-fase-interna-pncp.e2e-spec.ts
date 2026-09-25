/**
 * E1 (parte 2) — fase interna e PNCP pelos ATOS da máquina de estados.
 *
 *  1. Gate documental ÚNICO da fase interna (E1.7): o pregão não conclui etapa
 *     sem os documentos obrigatórios — nem pelo avançar genérico
 *     (PUT /licitacoes/:id/avancar-fase) nem pela tela da fase interna
 *     (PUT /fase-interna/:id/avancar) — e a recusa traz a lista de pendências;
 *     com os documentos, avança e cada etapa vira linha do histórico.
 *  2. PNCP: enviar a compra de uma licitação já em acolhimento NÃO a devolve a
 *     PUBLICADO; publicar pelo PNCP respeita os gates do PUBLICAR.
 *  3. PNCP: excluir a compra = CANCELAR_PUBLICACAO, só sem propostas.
 *  4. Importação de processo pronto: nasce em PLANEJAMENTO e conclui pelos atos.
 */
import {
  AppE2E,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  levarAteFase,
  LicitacaoFixture,
  OrgaoFixture,
  pncpMock,
  prepararDocumentosEtapa,
} from './support';
import { corpoDivulgacao, criarDocumentoInstrucao, DOCUMENTOS_ART_72, vincularOrgaoPncp } from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from '../src/fase-interna/entities/documento-fase-interna.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E1 — fase interna (gate único) e PNCP pelos atos', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;

  const http = () => ctx.http();
  const historico = async (lic: LicitacaoFixture) =>
    (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(lic.orgao.token)).expect(200)).body as any[];

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Fase Interna/PNCP E2E' });
    await vincularOrgaoPncp(ctx, orgao, '1');
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('1. gate documental único da fase interna (pregão)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
    });

    it('sem DFD/ETP, nem o avançar genérico nem a tela da fase interna concluem o planejamento', async () => {
      const generico = await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({});
      expect(generico.status).toBe(400);
      expect(generico.body.ato).toBe('CONCLUIR_PLANEJAMENTO');
      expect(generico.body.pendencias).toHaveLength(2);
      expect(generico.body.pendencias.join(' | ')).toMatch(/Formalização da Demanda/);
      expect(generico.body.pendencias.join(' | ')).toMatch(/Estudo Técnico Preliminar/);

      const tela = await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token));
      expect(tela.status).toBe(400);
      expect(tela.body.pendencias).toEqual(generico.body.pendencias);

      // a lista de atos do cockpit mostra a mesma pendência
      const atos = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body as any[];
      const concluir = atos.find((a) => a.ato === 'CONCLUIR_PLANEJAMENTO');
      expect(concluir.disponivel).toBe(false);
      expect(concluir.pendencias).toEqual(generico.body.pendencias);

      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.PLANEJAMENTO);
      expect((await historico(lic)).map((t) => t.ato)).toEqual(['CRIAR']);
    });

    it('só o DFD: a pendência que resta é o ETP', async () => {
      await criarDocumentoInstrucao(ctx, lic, TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'DFD');
      const r = await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token));
      expect(r.status).toBe(400);
      expect(r.body.pendencias).toHaveLength(1);
      expect(r.body.pendencias[0]).toMatch(/Estudo Técnico Preliminar/);
    });

    it('com os documentos de cada etapa, avança pelos dois caminhos e grava o histórico', async () => {
      // PLANEJAMENTO → TERMO_REFERENCIA pela tela da fase interna
      await prepararDocumentosEtapa(ctx, lic, FaseLicitacao.PLANEJAMENTO);
      const t1 = await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token)).expect(200);
      expect(t1.body.fase).toBe(FaseLicitacao.TERMO_REFERENCIA);

      // TR sem documentos: recusa com as pendências DA ETAPA (não as do planejamento)
      const semTr = await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({});
      expect(semTr.status).toBe(400);
      expect(semTr.body.pendencias.join(' | ')).toMatch(/Termo de Referência/);
      expect(semTr.body.pendencias.join(' | ')).not.toMatch(/Estudo Técnico/);

      // demais etapas pelo avançar genérico
      for (const etapa of [FaseLicitacao.TERMO_REFERENCIA, FaseLicitacao.PESQUISA_PRECOS, FaseLicitacao.ANALISE_JURIDICA]) {
        await prepararDocumentosEtapa(ctx, lic, etapa);
        await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({}).expect(200);
      }
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);

      // concluir a fase interna exige autorização/designação/dotação
      const semAut = await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token));
      expect(semAut.status).toBe(400);
      expect(semAut.body.ato).toBe('CONCLUIR_FASE_INTERNA');
      expect(semAut.body.pendencias).toHaveLength(3);

      // publicar sem concluir também passa pelo mesmo gate
      const pub = await http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send(corpoDivulgacao(new Date(Date.now() + 10 * 24 * 3_600_000)));
      expect(pub.status).toBe(400);
      expect(pub.body.pendencias.join(' | ')).toMatch(/Autorização de abertura/);

      await prepararDocumentosEtapa(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const fim = await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token)).expect(200);
      expect(fim.body.fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
      expect(fim.body.fase_interna_concluida).toBe(true);

      // idempotente: concluir de novo não gera transição
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token)).expect(200);

      const h = await historico(lic);
      expect(h.map((t) => [t.ato, t.fase_de, t.fase_para])).toEqual([
        ['CRIAR', null, 'PLANEJAMENTO'],
        ['CONCLUIR_PLANEJAMENTO', 'PLANEJAMENTO', 'TERMO_REFERENCIA'],
        ['CONCLUIR_TERMO_REFERENCIA', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS'],
        ['CONCLUIR_PESQUISA_PRECOS', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA'],
        ['CONCLUIR_ANALISE_JURIDICA', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA'],
        ['CONCLUIR_FASE_INTERNA', 'APROVACAO_INTERNA', 'APROVACAO_INTERNA'],
      ]);
      for (const t of h) {
        expect(t.ator_tipo).toBe('ORGAO');
        expect(t.ator_id).toBe(orgao.id);
      }
    });

    it('a edição (PUT) não marca a fase interna como concluída', async () => {
      const outra = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await http().put(`/api/licitacoes/${outra.id}`).set(bearer(orgao.token)).send({ fase_interna_concluida: true }).expect(200);
      expect((await buscarLicitacao(ctx, outra)).fase_interna_concluida).toBe(false);
    });

    it('tela da fase interna após a divulgação: 409', async () => {
      const pub = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, pub, FaseLicitacao.PUBLICADO);
      const r = await http().put(`/api/fase-interna/${pub.id}/avancar`).set(bearer(orgao.token));
      expect(r.status).toBe(409);
    });
  });

  // --------------------------------------------------------------------------
  describe('2. PNCP — enviar compra', () => {
    it('licitação já em acolhimento: registra o PNCP e NÃO volta para PUBLICADO', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const antes = await historico(lic);

      pncpMock.limpar();
      const r = await http().post(`/api/pncp/compras/${lic.id}`).set(bearer(orgao.token)).send({});
      expect(r.status).toBe(201);
      expect(r.body.sucesso).toBe(true);
      expect(pncpMock.filtrar('POST', /\/compras$/)).toHaveLength(1);

      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect(l.numero_controle_pncp).toBeTruthy();
      expect(l.enviado_pncp).toBe(true);
      expect((await historico(lic)).length).toBe(antes.length); // nenhuma transição
    });

    it('dispensa ainda não divulgada: PUBLICAR pelo PNCP respeita o prazo mínimo e, cumprido, publica pelo ato', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      for (const [tipo, titulo] of DOCUMENTOS_ART_72) await criarDocumentoInstrucao(ctx, lic, tipo, titulo);
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token)).expect(200);

      // cronograma curto (1 dia): o PUBLICAR recusaria — o envio ao PNCP também
      const curto = new Date(Date.now() + 24 * 3_600_000).toISOString();
      await http()
        .put(`/api/licitacoes/${lic.id}`)
        .set(bearer(orgao.token))
        .send({ data_fim_acolhimento: curto, data_abertura_sessao: curto })
        .expect(200);
      pncpMock.limpar();
      const recusa = await http().post(`/api/pncp/compras/${lic.id}`).set(bearer(orgao.token)).send({});
      expect(recusa.status).toBe(400);
      expect(recusa.body.message).toMatch(/3 dias úteis/);
      expect(pncpMock.filtrar('POST', /\/compras$/)).toHaveLength(0); // nada foi ao PNCP
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);

      const longo = new Date(Date.now() + 10 * 24 * 3_600_000).toISOString();
      await http()
        .put(`/api/licitacoes/${lic.id}`)
        .set(bearer(orgao.token))
        .send({ data_fim_acolhimento: longo, data_abertura_sessao: longo })
        .expect(200);
      const ok = await http().post(`/api/pncp/compras/${lic.id}`).set(bearer(orgao.token)).send({});
      expect(ok.status).toBe(201);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.PUBLICADO);
      const publicar = (await historico(lic)).filter((t) => t.ato === 'PUBLICAR');
      expect(publicar).toHaveLength(1);
      expect(publicar[0].dados?.origem).toBe('PNCP');
      expect(publicar[0].ator_tipo).toBe('ORGAO');
    });
  });

  // --------------------------------------------------------------------------
  describe('3. PNCP — excluir compra = CANCELAR_PUBLICACAO (só sem propostas)', () => {
    const enviar = async (lic: LicitacaoFixture) => {
      const r = await http().post(`/api/pncp/compras/${lic.id}`).set(bearer(orgao.token)).send({});
      expect(r.status).toBe(201);
      return r.body as { ano: number; sequencial: number };
    };

    it('com proposta recebida: recusa ANTES de excluir no PNCP e mantém a fase', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const compra = await enviar(lic);
      const f = await criarFornecedor(ctx);
      await enviarProposta(ctx, f, lic, lic.itens.map((i) => i.valor_unitario_estimado * 0.9));

      pncpMock.limpar();
      const r = await http()
        .delete(`/api/pncp/compras/${compra.ano}/${compra.sequencial}`)
        .set(bearer(orgao.token))
        .send({ justificativa: 'Erro no edital', licitacaoId: lic.id });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/revogue ou anule/);
      expect(pncpMock.filtrar('DELETE')).toHaveLength(0);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect(l.numero_controle_pncp).toBeTruthy();
    });

    it('sem propostas: exclui no PNCP e volta a APROVACAO_INTERNA com o motivo no histórico', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const compra = await enviar(lic);

      pncpMock.limpar();
      await http()
        .delete(`/api/pncp/compras/${compra.ano}/${compra.sequencial}`)
        .set(bearer(orgao.token))
        .send({ justificativa: 'Publicação em duplicidade', licitacaoId: lic.id })
        .expect(200);
      expect(pncpMock.filtrar('DELETE')).toHaveLength(1);

      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.APROVACAO_INTERNA); // não mais PLANEJAMENTO
      expect(l.numero_controle_pncp).toBeFalsy();
      expect(l.enviado_pncp).toBe(false);
      const ultima = (await historico(lic)).pop();
      expect(ultima).toMatchObject({
        ato: 'CANCELAR_PUBLICACAO',
        fase_de: 'ACOLHIMENTO_PROPOSTAS',
        fase_para: 'APROVACAO_INTERNA',
        motivo: 'Publicação em duplicidade',
        ator_tipo: 'ORGAO',
      });
    });
  });

  // --------------------------------------------------------------------------
  describe('4. importação de processo pronto', () => {
    it('nasce em PLANEJAMENTO, conclui pelos atos com os documentos importados', async () => {
      const r = await http()
        .post('/api/fase-interna/importar-processo')
        .set(bearer(orgao.token))
        .send({
          sistemaOrigem: 'SEI',
          idExterno: 'SEI-123',
          numero_processo: `IMP-${Date.now()}`,
          objeto: 'Processo importado de outro sistema (E2E)',
          modalidade: ModalidadeLicitacao.DISPENSA_ELETRONICA,
          orgaoId: orgao.id,
          documentos: DOCUMENTOS_ART_72.map(([tipo, titulo], i) => ({ tipo, titulo, idExterno: `DOC-${i}` })),
        });
      expect(r.status).toBe(201);
      expect(r.body.pendencias).toEqual([]);
      expect(r.body.licitacao.fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
      expect(r.body.licitacao.fase_interna_concluida).toBe(true);

      const h = (
        await http().get(`/api/licitacoes/${r.body.licitacao.id}/transicoes`).set(bearer(orgao.token)).expect(200)
      ).body as any[];
      expect(h.map((t) => [t.ato, t.fase_de, t.fase_para])).toEqual([
        ['CRIAR', null, 'PLANEJAMENTO'],
        ['CONCLUIR_FASE_INTERNA', 'PLANEJAMENTO', 'APROVACAO_INTERNA'],
      ]);
    });

    it('pregão importado sem todos os documentos para na etapa e devolve as pendências', async () => {
      const r = await http()
        .post('/api/fase-interna/importar-processo')
        .set(bearer(orgao.token))
        .send({
          sistemaOrigem: 'SEI',
          idExterno: 'SEI-456',
          numero_processo: `IMP-P-${Date.now()}`,
          objeto: 'Pregão importado incompleto (E2E)',
          modalidade: ModalidadeLicitacao.PREGAO_ELETRONICO,
          orgaoId: orgao.id,
          documentos: [
            { tipo: TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, titulo: 'DFD', idExterno: 'D1' },
            { tipo: TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR, titulo: 'ETP', idExterno: 'D2' },
          ],
        });
      expect(r.status).toBe(201);
      expect(r.body.licitacao.fase).toBe(FaseLicitacao.TERMO_REFERENCIA);
      expect(r.body.licitacao.fase_interna_concluida).toBe(false);
      expect(r.body.pendencias.join(' | ')).toMatch(/Termo de Referência/);
    });
  });
});
