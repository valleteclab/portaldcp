/**
 * ============================================================================
 * E7b — FILA DO PNCP (outbox) E PUBLICAÇÃO AUTOMÁTICA NAS TRANSIÇÕES
 * ============================================================================
 *
 * Toda operação no PNCP é uma linha de `pncp_sync` processada pelo worker
 * (`PncpFilaService.processarFila`, cron de 1 min — desligado no e2e, aqui
 * chamado explicitamente por `ctx.processarFilaPncp()`), com payload montado
 * na hora do envio, ordem de dependência, backoff e idempotência.
 *
 * Cenários (PNCP = mock HTTP): publicar enfileira compra + itens com o edital
 * real e ordem compra → itens; 500 → erro temporário com reenvio automático
 * depois do backoff; erro de negócio → erro definitivo e "reenviar agora";
 * "já existe" = sucesso; retificação do edital → documento + retificação;
 * suspender/retomar/revogar/anular → situação da compra na ordem; homologar
 * → resultado por item com indicadores reais (ME/EPP, desempate do art. 60,
 * porte do retrato) + termo de homologação; contrato SÓ depois da última
 * assinatura (art. 94); isolamento da fila entre órgãos/fornecedores.
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  enviarProposta,
  levarAteFase,
  pdfDeTeste,
  pncpMock,
} from './support';
import { vincularOrgaoAoPncp, jsonDaParteMultipart } from './support/pregao';
import { corpoComoTexto, criarDispensaPublicada, headerCapturado, jsonDaParte } from './support/dispensa';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { convocarAceitacao, decidirAceitacao, enviarPropostaAdequada } from './support/julgamento';
import { habilitarLicitante } from './support/habilitacao';
import { precluirIntencaoDeRecurso } from './support/recursos';
import { adjudicarResultado, homologarResultado } from './support/resultado';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { assinarContrato } from './support/contratos';
import { formatarDataHoraBrasilia, dataBrasilia } from '../src/pncp/mapeamento-pncp';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const MIN = 60_000;

function exigir(r: { status: number; body: any }, status: number, oque: string) {
  if (r.status !== status) throw new Error(`[pncp-fila] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
}

describe('E7b — fila do PNCP (outbox) e publicação automática', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let cnpjA: string;
  let F1: FornecedorFixture;
  const http = () => ctx.http();

  const fila = async (lic: { id: string }, token = A.token): Promise<any[]> =>
    (await http().get('/api/pncp/fila').query({ licitacaoId: lic.id }).set(bearer(token)).expect(200)).body;
  const linha = async (lic: { id: string }, tipo: string) => (await fila(lic)).find((l) => l.tipo === tipo);
  const compras = () => pncpMock.filtrar('POST', new RegExp(`/orgaos/${cnpjA}/compras$`));

  /** Pregão de A publicado (edital real anexado pelo fixture) — a publicação ENFILEIRA, não envia. */
  async function pregaoPublicado(): Promise<LicitacaoFixture> {
    const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
    await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO);
    return lic;
  }

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Fila PNCP E2E (A)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Fila PNCP E2E (B)' });
    cnpjA = A.cnpj.replace(/\D/g, '');
    await vincularOrgaoAoPncp(ctx, A);
    await vincularOrgaoAoPncp(ctx, B);
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    pncpMock.limpar();
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. PUBLICAR → compra + itens pela fila (edital real, ordem, idempotência)', () => {
    let lic: LicitacaoFixture;

    it('publicar enfileira compra e itens; nada vai ao PNCP antes do worker', async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      // item 2 é SERVIÇO (tipo do item, não o da licitação — mapeamento materialOuServico)
      await http().put(`/api/itens/${lic.itens[1].id}`).set(bearer(A.token)).send({ tipo_item: 'SERVICO' }).expect(200);
      pncpMock.limpar();
      await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO);
      const f = await fila(lic);
      expect(f.map((l) => [l.tipo, l.status])).toEqual([
        ['COMPRA', 'PENDENTE'],
        ['ITEM', 'PENDENTE'],
      ]);
      expect(compras()).toHaveLength(0);
    });

    it('worker: compra antes dos itens, com o EDITAL anexado (não PDF em branco) e mapeamento da licitação', async () => {
      const r = await ctx.processarFilaPncp({ licitacaoId: lic.id });
      expect(r).toMatchObject({ bloqueado: false, enviados: 2, erros: 0 });
      const [compra] = compras();
      const [itens] = pncpMock.filtrar('POST', /\/compras\/\d+\/\d+\/itens$/);
      expect(pncpMock.requisicoes.indexOf(compra)).toBeLessThan(pncpMock.requisicoes.indexOf(itens));

      // documento obrigatório = edital vigente da licitação (tipo 2)
      expect(headerCapturado(compra, 'Tipo-Documento-Id')).toBe('2');
      const texto = corpoComoTexto(compra.corpo);
      expect(texto).toContain('filename="edital.pdf"');
      expect(texto).toContain('%PDF-1.4');
      const edital = (await http().get(`/api/publicacao/licitacao/${lic.id}/edital`).expect(200)).body.vigente;
      expect(edital.status).toBe('PUBLICADO');

      const l = await buscarLicitacao(ctx, lic);
      const dto = jsonDaParteMultipart(compra.corpo, 'compra');
      expect(dto).toMatchObject({
        modalidadeId: 6, // pregão eletrônico
        tipoInstrumentoConvocatorioId: 1, // edital
        modoDisputaId: 1, // aberto
        amparoLegalId: 1, // art. 28, I
        srp: false,
        numeroProcesso: lic.numero_processo,
        anoCompra: Number(dataBrasilia(new Date(l.data_publicacao_edital))!.slice(0, 4)),
        dataAberturaProposta: formatarDataHoraBrasilia(new Date(l.data_inicio_acolhimento)),
        dataEncerramentoProposta: formatarDataHoraBrasilia(new Date(l.data_fim_acolhimento)),
      });
      expect(dto.itensCompra.map((i: any) => [i.numeroItem, i.materialOuServico, i.criterioJulgamentoId, i.tipoBeneficioId])).toEqual([
        [1, 'M', 1, 4],
        [2, 'S', 1, 4],
      ]);
      expect(itens.corpo.map((i: any) => i.materialOuServico)).toEqual(['M', 'S']);

      const f = await fila(lic);
      expect(f.map((x) => [x.tipo, x.status, x.tentativas])).toEqual([
        ['COMPRA', 'ENVIADO', 1],
        ['ITEM', 'ENVIADO', 1],
      ]);
      expect(f[0].numero_controle_pncp).toMatch(new RegExp(`^${cnpjA}-1-\\d{6}/\\d{4}$`));
      expect(f[0].rotulo).toBe('Compra (aviso/edital)');
      // cockpit (processo-completo) mostra as mesmas operações
      const pc = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(A.token)).expect(200)).body;
      expect(pc.pncp.map((x: any) => x.status)).toEqual(['ENVIADO', 'ENVIADO']);
    });

    it('idempotência: worker de novo não reenvia; o botão do cockpit devolve a compra já publicada', async () => {
      expect((await ctx.processarFilaPncp({ licitacaoId: lic.id })).processados).toBe(0);
      const r = await http().post(`/api/pncp/compras/${lic.id}/completo`).set(bearer(A.token));
      expect(r.status).toBe(201);
      expect(r.body.sucesso).toBe(true);
      expect(compras()).toHaveLength(1);
    });

    it('retificação do edital → documento (nova versão) + retificação da compra', async () => {
      pncpMock.limpar();
      const r = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/retificar`)
        .set(bearer(A.token))
        .field('motivo', 'Correção de erro material no edital')
        .field('alteracoes', 'Endereço de entrega corrigido')
        .field('afeta_propostas', 'false')
        .field('justificativa_nao_afeta', 'O endereço não interfere na formulação das propostas')
        .attach('arquivo', pdfDeTeste('Edital retificado v2'), { filename: 'edital-v2.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      expect(pncpMock.filtrar()).toHaveLength(0); // só enfileirou
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const [doc] = pncpMock.filtrar('POST', /\/compras\/\d+\/\d+\/arquivos$/);
      expect(doc).toBeDefined();
      expect(headerCapturado(doc, 'Tipo-Documento-Id')).toBe('2');
      expect(headerCapturado(doc, 'Titulo-Documento')).toBe('Edital retificado (versao 2)');
      expect(corpoComoTexto(doc.corpo)).toContain('filename="edital-v2.pdf"');
      const [ret] = pncpMock.filtrar('PATCH', /\/compras\/\d+\/\d+$/);
      expect(ret.corpo).toMatchObject({ justificativa: 'Correção de erro material no edital', modalidadeId: 6 });
      expect(pncpMock.requisicoes.indexOf(doc)).toBeLessThan(pncpMock.requisicoes.indexOf(ret));
      const tipos = (await fila(lic)).map((x) => [x.tipo, x.status]);
      expect(tipos).toEqual(expect.arrayContaining([['DOCUMENTO', 'ENVIADO'], ['RETIFICACAO_COMPRA', 'ENVIADO']]));
    });

    it('suspender, retomar e revogar → situação da compra na ordem dos atos', async () => {
      pncpMock.limpar();
      const ato = (nome: string, motivo: string) => http().post(`/api/licitacoes/${lic.id}/atos/${nome}`).set(bearer(A.token)).send({ motivo });
      exigir(await ato('SUSPENDER', 'Suspensão para análise de questionamento'), 201, 'suspender');
      exigir(await ato('RETOMAR', 'Questionamento respondido — retomada'), 201, 'retomar');
      exigir(await ato('REVOGAR', 'Fato superveniente: dotação orçamentária cancelada'), 201, 'revogar');
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const patches = pncpMock.filtrar('PATCH', /\/compras\/\d+\/\d+$/).map((p) => p.corpo);
      expect(patches.map((p) => p.situacaoCompraId)).toEqual([4, 1, 2]); // suspensa, divulgada, revogada
      expect(patches[2].justificativa).toBe('Fato superveniente: dotação orçamentária cancelada');
    });
  });

  // ==========================================================================
  describe('2. Falhas: temporária (backoff), definitiva, benigna e "reenviar agora"', () => {
    it('500 do PNCP → ERRO_TEMPORARIO com backoff; itens esperam a compra; reenvio automático depois do backoff', async () => {
      pncpMock.limpar();
      pncpMock.responder('POST', new RegExp(`/orgaos/${cnpjA}/compras$`), { status: 500, corpo: { message: 'Serviço indisponível' } }, 1);
      const lic = await pregaoPublicado();
      const inicio = Date.now();
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      let compra = await linha(lic, 'COMPRA');
      expect(compra).toMatchObject({ status: 'ERRO_TEMPORARIO', tentativas: 1 });
      expect(compra.erro_mensagem).toMatch(/indisponível|500/);
      expect(new Date(compra.proximo_envio).getTime()).toBeGreaterThanOrEqual(inicio + 55_000);
      expect(await linha(lic, 'ITEM')).toMatchObject({ status: 'PENDENTE', tentativas: 0 });
      expect(pncpMock.filtrar('POST', /\/itens$/)).toHaveLength(0);

      // antes do backoff: nada
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      expect(compras()).toHaveLength(1);
      // relógio do worker depois do backoff: reenvia sozinho e libera os itens
      await ctx.processarFilaPncp({ licitacaoId: lic.id, agora: new Date(Date.now() + 2 * MIN) });
      compra = await linha(lic, 'COMPRA');
      expect(compra).toMatchObject({ status: 'ENVIADO', tentativas: 2, erro_mensagem: null });
      expect(await linha(lic, 'ITEM')).toMatchObject({ status: 'ENVIADO' });
      expect(compras()).toHaveLength(2);
    });

    let licDefinitivo: LicitacaoFixture;
    it('erro de regra do PNCP (422) → ERRO_DEFINITIVO, sem novas tentativas; dependentes aguardam', async () => {
      pncpMock.limpar();
      pncpMock.responder('POST', new RegExp(`/orgaos/${cnpjA}/compras$`), { status: 422, corpo: { message: 'Unidade compradora não cadastrada' } }, 1);
      licDefinitivo = await pregaoPublicado();
      await ctx.processarFilaPncp({ licitacaoId: licDefinitivo.id });
      // horas depois (bem além de qualquer backoff, antes do limite de 24 h de espera por dependência)
      await ctx.processarFilaPncp({ licitacaoId: licDefinitivo.id, agora: new Date(Date.now() + 6 * 60 * MIN) });
      expect(compras()).toHaveLength(1);
      const compra = await linha(licDefinitivo, 'COMPRA');
      expect(compra).toMatchObject({ status: 'ERRO_DEFINITIVO', tentativas: 1 });
      expect(compra.erro_mensagem).toMatch(/Unidade compradora não cadastrada/);
      const item = await linha(licDefinitivo, 'ITEM');
      expect(item.status).toBe('PENDENTE');
      expect(item.erro_mensagem).toMatch(/Aguardando: a compra ainda não foi publicada/);
    });

    it('isolamento da fila: outro órgão e fornecedor não leem nem reenviam', async () => {
      const compra = await linha(licDefinitivo, 'COMPRA');
      expect([403, 404]).toContain((await http().get('/api/pncp/fila').query({ licitacaoId: licDefinitivo.id }).set(bearer(B.token))).status);
      expect([403, 404]).toContain((await http().get('/api/pncp/fila').query({ licitacaoId: licDefinitivo.id }).set(bearer(F1.token))).status);
      expect((await http().get('/api/pncp/fila').query({ licitacaoId: licDefinitivo.id })).status).toBe(401);
      expect([403, 404]).toContain((await http().post(`/api/pncp/fila/${compra.id}/reenviar`).set(bearer(B.token))).status);
      expect([403, 404]).toContain((await http().post(`/api/pncp/fila/${compra.id}/reenviar`).set(bearer(F1.token))).status);
      expect([403, 404]).toContain((await http().post(`/api/pncp/reenviar/${compra.id}`).set(bearer(B.token))).status);
      expect(compras()).toHaveLength(1);
    });

    it('"reenviar agora" do órgão dono (depois de corrigido o dado) envia e libera os dependentes', async () => {
      const compra = await linha(licDefinitivo, 'COMPRA');
      const r = await http().post(`/api/pncp/fila/${compra.id}/reenviar`).set(bearer(A.token));
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('ENVIADO');
      expect(await linha(licDefinitivo, 'ITEM')).toMatchObject({ status: 'ENVIADO' });
    });

    it('recusa "já existe" do PNCP = sucesso: vincula a compra existente (sem duplicar)', async () => {
      pncpMock.limpar();
      pncpMock.responder(
        'POST',
        new RegExp(`/orgaos/${cnpjA}/compras$`),
        { status: 400, corpo: { message: `Contratação já existente. Id contratação PNCP: ${cnpjA}-1-000777/2026` } },
        1,
      );
      const lic = await pregaoPublicado();
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const compra = await linha(lic, 'COMPRA');
      expect(compra).toMatchObject({ status: 'ENVIADO', numero_controle_pncp: `${cnpjA}-1-000777/2026` });
      const [itens] = pncpMock.filtrar('POST', /\/itens$/);
      expect(itens.caminho).toMatch(new RegExp(`/orgaos/${cnpjA}/compras/2026/777/itens$`));
      // anular sem licitantes (ato direto) → situação 3
      pncpMock.limpar();
      exigir(
        await http().post(`/api/licitacoes/${lic.id}/atos/ANULAR`).set(bearer(A.token)).send({ motivo: 'Ilegalidade insanável no edital (teste)' }),
        201,
        'anular',
      );
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const [p] = pncpMock.filtrar('PATCH', /\/compras\/2026\/777$/);
      expect(p.corpo.situacaoCompraId).toBe(3);
    });
  });

  // ==========================================================================
  describe('3. HOMOLOGAR → resultado por item e termo; contrato só depois da assinatura (art. 94)', () => {
    let ME1: FornecedorFixture;
    let EPP1: FornecedorFixture;
    let lic: LicitacaoFixture;
    let contratoId: string;

    it('pregão exclusivo ME/EPP homologado: resultado com benefício ME/EPP, ordem e porte do retrato; termo antes dos resultados', async () => {
      ME1 = await criarFornecedor(ctx, { porte: 'ME' });
      EPP1 = await criarFornecedor(ctx, { porte: 'EPP' });
      pncpMock.limpar();
      const p = await prepararPregaoEmDisputa(
        ctx,
        A,
        [
          { fornecedor: ME1, valores: [90] },
          { fornecedor: EPP1, valores: [95] },
        ],
        { itens: [{ descricao: 'Resma de papel A4 (fila PNCP)', quantidade: 10, valor_unitario_estimado: 100 }], extras: { tipo_beneficio_mpe: 'EXCLUSIVO' } },
      );
      lic = p.lic;
      await ctx.processarFilaPncp({ licitacaoId: lic.id }); // compra + itens da publicação
      expect(compras().length).toBeGreaterThanOrEqual(1);
      const item = lic.itens[0].id;
      exigir(await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/encerrar-item/${item}`).set(bearer(A.token)), 201, 'encerrar item');
      const c = await convocarAceitacao(ctx, p.sessaoId, item, A.token);
      exigir(c, 201, 'convocar aceitação');
      exigir(await enviarPropostaAdequada(ctx, p.sessaoId, c.body.id, ME1.token, [{ itemId: item, valorUnitario: 89 }]), 201, 'proposta adequada');
      exigir(await decidirAceitacao(ctx, p.sessaoId, c.body.id, A.token, 'aceitar'), 201, 'aceitar');
      await habilitarLicitante(ctx, lic.id, ME1, A.token);
      await precluirIntencaoDeRecurso(ctx, p.sessaoId, A.token);
      exigir(await adjudicarResultado(ctx, lic.id, A.token), 200, 'adjudicar');
      pncpMock.limpar();
      exigir(await homologarResultado(ctx, lic.id, A.token), 200, 'homologar');

      // porte mudou no cadastro depois da proposta: o PNCP recebe o do RETRATO da proposta (E3)
      await ctx.dataSource.query(`UPDATE fornecedores SET porte = 'MEDIO' WHERE id = $1`, [ME1.id]);
      await ctx.processarFilaPncp({ licitacaoId: lic.id });

      const [termo] = pncpMock.filtrar('POST', /\/compras\/\d+\/\d+\/arquivos$/);
      expect(termo).toBeDefined();
      expect(headerCapturado(termo, 'Titulo-Documento')).toBe('Termo de Adjudicacao e Homologacao');
      expect(corpoComoTexto(termo.corpo)).toContain('%PDF');
      const [res] = pncpMock.filtrar('POST', /\/itens\/1\/resultados$/);
      expect(pncpMock.requisicoes.indexOf(termo)).toBeLessThan(pncpMock.requisicoes.indexOf(res));
      const l = await buscarLicitacao(ctx, lic);
      expect(res.corpo).toMatchObject({
        niFornecedor: ME1.cnpj.replace(/\D/g, ''),
        quantidadeHomologada: 10,
        valorUnitarioHomologado: 89,
        valorTotalHomologado: 890,
        porteFornecedorId: 1, // ME — do retrato da proposta
        ordemClassificacaoSrp: 1,
        aplicacaoBeneficioMeEpp: true, // item exclusivo ME/EPP (LC 123 art. 48, I)
        aplicacaoCriterioDesempate: false,
        percentualDesconto: 0,
        dataResultado: dataBrasilia(new Date(l.data_homologacao)),
      });
      expect(res.corpo.amparoLegalCriterioDesempateId).toBeUndefined();
    });

    it('contrato gerado AGUARDANDO_ASSINATURA não vai ao PNCP (nem entra na fila)', async () => {
      const [ct] = await ctx.dataSource.query(`SELECT id::text AS id, status::text AS status FROM contratos WHERE licitacao_id = $1`, [lic.id]);
      contratoId = ct.id;
      expect(ct.status).toBe('AGUARDANDO_ASSINATURA');
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      expect(pncpMock.filtrar('POST', /\/contratos$/)).toHaveLength(0);
      expect((await fila(lic)).some((x) => x.tipo === 'CONTRATO')).toBe(false);
      const r = await http().post(`/api/pncp/contratos/${contratoId}/enviar`).set(bearer(A.token));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/assinado/);
    });

    it('última assinatura → CONTRATO na fila → publicado com o termo assinado', async () => {
      const U = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Secretária de Administração E2E' });
      await assinarContrato(ctx, contratoId, U, ME1, { esperarFilaPncp: true });
      const operacao = await linha(lic, 'CONTRATO');
      expect(operacao).toMatchObject({ status: 'PENDENTE' });
      pncpMock.limpar();
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const [envio] = pncpMock.filtrar('POST', new RegExp(`/orgaos/${cnpjA}/contratos$`));
      expect(envio).toBeDefined();
      expect(headerCapturado(envio, 'Tipo-Documento-Id')).toBe('12');
      expect(corpoComoTexto(envio.corpo)).toContain('filename="termo-contrato-');
      const [ct] = await ctx.dataSource.query(`SELECT data_assinatura FROM contratos WHERE id = $1`, [contratoId]);
      const dto = jsonDaParte(envio.corpo, 'contrato');
      expect(dto).toMatchObject({
        niFornecedor: ME1.cnpj.replace(/\D/g, ''),
        processo: lic.numero_processo,
        valorGlobal: 890,
        dataAssinatura: dataBrasilia(ct.data_assinatura),
      });
      expect(dto.numeroControlePNCPCompra).toMatch(new RegExp(`^${cnpjA}-1-`));
      expect(await linha(lic, 'CONTRATO')).toMatchObject({ status: 'ENVIADO' });
    });
  });

  // ==========================================================================
  describe('4. Desempate do art. 60 → aplicacaoCriterioDesempate + amparo do inciso', () => {
    it('dispensa com empate resolvido pelo §1º, I (empresa do Estado do órgão) informa o critério e o amparo', async () => {
      const FBA = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const FSP = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      // Atalho de fixture: o cadastro de FSP é de outro Estado (a fábrica cria tudo na BA)
      await ctx.dataSource.query(`UPDATE fornecedores SET uf = 'SP' WHERE id = $1`, [FSP.id]);
      pncpMock.limpar();
      pncpMock.responder('GET', /\/amparos-legais/, {
        status: 200,
        corpo: [
          { id: 140, nome: 'Lei 14.133/2021, Art. 60, I', descricao: 'Disputa final' },
          { id: 146, nome: 'Lei 14.133/2021, Art. 60, § 1º, I', descricao: 'Empresas estabelecidas no Estado' },
          { id: 147, nome: 'Lei 14.133/2021, Art. 60, § 1º, II', descricao: 'Empresas brasileiras' },
        ],
      });
      const lic = await criarDispensaPublicada(ctx, A, {
        itens: [{ descricao: 'Toner (desempate E2E)', quantidade: 2, valor_unitario_estimado: 100 }],
      });
      await enviarProposta(ctx, FSP, lic, [90]);
      await enviarProposta(ctx, FBA, lic, [90]);
      await abrirSessaoAgora(ctx, lic);
      exigir(await http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(A.token)), 201, 'julgar dispensa');
      exigir(await homologarResultado(ctx, lic.id, A.token), 200, 'homologar');
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const [res] = pncpMock.filtrar('POST', /\/itens\/1\/resultados$/);
      expect(res).toBeDefined();
      expect(res.corpo).toMatchObject({
        niFornecedor: FBA.cnpj.replace(/\D/g, ''),
        aplicacaoCriterioDesempate: true,
        amparoLegalCriterioDesempateId: 146,
        aplicacaoBeneficioMeEpp: false,
        porteFornecedorId: 3,
      });
    });
  });

  // ==========================================================================
  describe('5. Seleção externa e órgão sem integração: nada é enfileirado', () => {
    it('órgão não vinculado ao PNCP publica sem operação na fila', async () => {
      const C = await criarOrgao(ctx, { nome: 'Prefeitura sem PNCP (C)' });
      const lic = await criarLicitacao(ctx, C, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO);
      expect(await fila(lic, C.token)).toEqual([]);
    });
  });
});
