/**
 * ============================================================================
 * E7a — PUBLICAÇÃO, PRAZOS, RETIFICAÇÃO E REVOGAÇÃO/ANULAÇÃO EM DOIS TEMPOS
 * ============================================================================
 *
 * Base legal (texto conferido no Planalto): Lei 14.133/2021
 *  - art. 55 (prazos mínimos de divulgação por objeto/critério/regime) e §1º
 *    (modificação do edital = nova divulgação e mesmos prazos, salvo quando não
 *    compromete a formulação das propostas);
 *  - art. 183 (contagem: exclui o dia do começo, inclui o do vencimento; só dias
 *    com expediente NO ÓRGÃO — feriados municipais contam);
 *  - art. 164 (impugnação até 3 dias úteis antes da abertura);
 *  - art. 71 §3º (prévia manifestação dos interessados antes de revogar/anular).
 *
 * Cenários: bloqueio abaixo do mínimo por categoria (bens 8, serviços comuns
 * 10, especiais 25, técnica e preço 35, integrada 60), edital real exigido,
 * feriado municipal empurra o prazo só do órgão que o cadastrou, retificação
 * com e sem reabertura de prazos (propostas a confirmar e fora da disputa sem
 * confirmação), impugnação acolhida exige retificação, revogação em dois
 * tempos e isolamento entre órgãos/fornecedores.
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  JUSTIFICATIVA_ART49_E2E,
  ajustarCronograma,
  anexarEdital,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  levarAteFase,
  confirmarDivulgacao,
  pdfDeTeste,
  prepararDocumentosEtapa,
} from './support';
import {
  CriterioJulgamento,
  FaseLicitacao,
  ModalidadeLicitacao,
  ModoDisputa,
  RegimeExecucao,
  TipoContratacao,
} from '../src/licitacoes/entities/licitacao.entity';
import {
  calendarioDoOrgao,
  diaEmBrasilia,
  ehDiaUtil,
  fimDoPrazoEmDiasUteis,
  inicioDoDia,
  DIA_MS,
} from '../src/common/prazos/dias-uteis';
import { formatarRelogioBrasilia } from '../src/impugnacoes/prazo-manifestacao.util';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const HORA = 3_600_000;

/** Primeira data/hora aceita para a abertura: 00:00 do N-ésimo dia útil depois da divulgação (art. 55 + art. 183 — inclui o dia do vencimento). */
function minimoAbertura(orgaoId: string | null, dias: number, base = new Date()): Date {
  return inicioDoDia(fimDoPrazoEmDiasUteis(base, dias, calendarioDoOrgao(orgaoId)));
}

/** Corpo do PUT publicar-edital com abertura/fim do recebimento em `abertura`. */
function corpoPublicacao(abertura: Date, extras: Record<string, any> = {}) {
  const agora = new Date();
  return {
    data_publicacao_edital: agora.toISOString(),
    data_inicio_acolhimento: agora.toISOString(),
    data_fim_acolhimento: abertura.toISOString(),
    data_abertura_sessao: abertura.toISOString(),
    data_limite_impugnacao: new Date(abertura.getTime() - HORA).toISOString(),
    justificativa_nao_exclusividade_mpe: JUSTIFICATIVA_ART49_E2E,
    ...extras,
  };
}

describe('E7a — publicação, prazos (art. 55/183), retificação (art. 55 §1º) e revogação em dois tempos (art. 71 §3º)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  const http = () => ctx.http();

  /** Licitação de A pronta para publicar (fase interna documentada + edital anexado). */
  async function prontaParaPublicar(
    orgao: OrgaoFixture,
    modalidade: ModalidadeLicitacao,
    opts: Parameters<typeof criarLicitacao>[3] = {},
  ): Promise<LicitacaoFixture> {
    const lic = await criarLicitacao(ctx, orgao, modalidade, opts);
    await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
    return lic;
  }

  const publicar = (lic: LicitacaoFixture, corpo: Record<string, any>) =>
    http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(lic.orgao.token)).send(corpo);

  const prazos = (lic: LicitacaoFixture, q: Record<string, string> = {}, token = lic.orgao.token) =>
    http().get(`/api/publicacao/licitacao/${lic.id}/prazos`).query(q).set(bearer(token));

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Publicação E2E (A)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Publicação E2E (B)' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. Prazo mínimo do art. 55 por categoria (calendário do órgão)', () => {
    it('pregão de bens, menor preço: 8 dias úteis (art. 55, I, a) — abaixo recusa, no mínimo publica', async () => {
      const lic = await prontaParaPublicar(A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const p = (await prazos(lic).expect(200)).body;
      expect(p).toMatchObject({ dias_uteis: 8, fundamento: 'Lei 14.133/2021, art. 55, I, a' });
      const minimo = minimoAbertura(A.id, 8);
      expect(p.data_minima_abertura).toBe(formatarRelogioBrasilia(minimo));

      const curto = await publicar(lic, corpoPublicacao(new Date(minimo.getTime() - HORA)));
      expect(curto.status).toBe(400);
      expect(curto.body.message).toMatch(/8 dias úteis.*art\. 55, I, a/);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.APROVACAO_INTERNA);

      const ok = await publicar(lic, corpoPublicacao(new Date(minimo.getTime() + HORA)));
      expect(ok.status).toBe(200);
      // divulgação oficial = PNCP: publicado, aguardando a confirmação (arts. 54 e 174)
      expect(ok.body.fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
    });

    it('pregão de serviço (comum por definição — art. 6º XLI): 10 dias úteis (art. 55, II, a)', async () => {
      const lic = await prontaParaPublicar(A, ModalidadeLicitacao.PREGAO_ELETRONICO, { tipo_contratacao: TipoContratacao.SERVICO });
      const p = (await prazos(lic).expect(200)).body;
      expect(p).toMatchObject({ dias_uteis: 10, fundamento: 'Lei 14.133/2021, art. 55, II, a', natureza_objeto: 'COMUM' });
      const r = await publicar(lic, corpoPublicacao(new Date(minimoAbertura(A.id, 8).getTime() + HORA)));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/10 dias úteis/);
    });

    it('concorrência de serviço: exige "comum × especial" para publicar; especial = 25 dias úteis (art. 55, II, b)', async () => {
      const lic = await prontaParaPublicar(A, ModalidadeLicitacao.CONCORRENCIA, { tipo_contratacao: TipoContratacao.SERVICO });
      const semNatureza = (await prazos(lic).expect(200)).body;
      expect(semNatureza.exige_natureza_objeto).toBe(true);
      const r0 = await publicar(lic, corpoPublicacao(new Date(minimoAbertura(A.id, 30).getTime())));
      expect(r0.status).toBe(400);
      expect(r0.body.message).toMatch(/COMUM ou ESPECIAL/);

      // Classificação gravada na fase interna (campo novo do cadastro)
      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ natureza_objeto: 'ESPECIAL' }).expect(200);
      const p = (await prazos(lic).expect(200)).body;
      expect(p).toMatchObject({ dias_uteis: 25, fundamento: 'Lei 14.133/2021, art. 55, II, b' });

      const curto = await publicar(lic, corpoPublicacao(new Date(minimoAbertura(A.id, 20).getTime() + HORA)));
      expect(curto.status).toBe(400);
      expect(curto.body.message).toMatch(/25 dias úteis/);
      const ok = await publicar(lic, corpoPublicacao(new Date(minimoAbertura(A.id, 25).getTime() + HORA)));
      expect(ok.status).toBe(200);
    });

    it('natureza inválida no cadastro é recusada', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.CONCORRENCIA, { tipo_contratacao: TipoContratacao.SERVICO });
      const r = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ natureza_objeto: 'QUALQUER' });
      expect(r.status).toBe(400);
    });

    it('técnica e preço: 35 dias úteis (art. 55, IV) prevalece sobre bens "demais critérios" (15 — I, b)', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.CONCORRENCIA, {
        criterio: CriterioJulgamento.TECNICA_E_PRECO,
        modo_disputa: ModoDisputa.FECHADO,
      });
      const p = (await prazos(lic).expect(200)).body;
      expect(p.dias_uteis).toBe(35);
      expect(p.fundamento).toBe('Lei 14.133/2021, art. 55, IV');
      expect(p.hipoteses.map((h: any) => h.dias).sort((a: number, b: number) => a - b)).toEqual([15, 35]);
    });

    it('obra em contratação integrada: 60 dias úteis (art. 55, II, c); semi-integrada: 35 (II, d)', async () => {
      const integrada = await criarLicitacao(ctx, A, ModalidadeLicitacao.CONCORRENCIA, {
        tipo_contratacao: TipoContratacao.OBRA,
        extras: { regime_execucao: RegimeExecucao.CONTRATACAO_INTEGRADA },
      });
      expect((await prazos(integrada).expect(200)).body).toMatchObject({ dias_uteis: 60, fundamento: 'Lei 14.133/2021, art. 55, II, c' });
      const semi = await criarLicitacao(ctx, A, ModalidadeLicitacao.CONCORRENCIA, {
        tipo_contratacao: TipoContratacao.SERVICO_ENGENHARIA,
        extras: { regime_execucao: RegimeExecucao.CONTRATACAO_SEMI_INTEGRADA },
      });
      expect((await prazos(semi).expect(200)).body).toMatchObject({ dias_uteis: 35, fundamento: 'Lei 14.133/2021, art. 55, II, d' });
    });

    it('ordem das datas: recebimento termina até a abertura; limite de impugnação não encurta o art. 164', async () => {
      const lic = await prontaParaPublicar(A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const ab = new Date(minimoAbertura(A.id, 12).getTime() + HORA);
      const invertida = await publicar(lic, corpoPublicacao(ab, { data_fim_acolhimento: new Date(ab.getTime() + HORA).toISOString() }));
      expect(invertida.status).toBe(400);
      expect(invertida.body.message).toMatch(/terminar até a abertura/);
      const encurtada = await publicar(lic, corpoPublicacao(ab, { data_limite_impugnacao: new Date(ab.getTime() - 8 * DIA_MS).toISOString() }));
      expect(encurtada.status).toBe(400);
      expect(encurtada.body.message).toMatch(/art\. 164/);
    });
  });

  // ==========================================================================
  describe('2. Edital real (art. 54) — sem PDF em branco', () => {
    let lic: LicitacaoFixture;

    it('pregão sem edital anexado não publica', async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ANALISE_JURIDICA);
      await prepararDocumentosEtapa(ctx, lic, FaseLicitacao.ANALISE_JURIDICA);
      await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(A.token)).send({}).expect(200);
      await prepararDocumentosEtapa(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const r = await publicar(lic, corpoPublicacao(new Date(minimoAbertura(A.id, 9).getTime())));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Anexe o edital/);
    });

    it('anexo só aceita PDF; órgão B e fornecedor não anexam', async () => {
      const html = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/edital`)
        .set(bearer(A.token))
        .attach('arquivo', Buffer.from('<html>edital</html>'), { filename: 'edital.html', contentType: 'text/html' });
      expect(html.status).toBe(400);
      for (const token of [B.token, F1.token]) {
        const r = await http()
          .post(`/api/publicacao/licitacao/${lic.id}/edital`)
          .set(bearer(token))
          .attach('arquivo', pdfDeTeste(), { filename: 'edital.pdf', contentType: 'application/pdf' });
        expect([403, 404]).toContain(r.status);
      }
    });

    it('com o edital anexado publica; o edital vira PUBLICADO e público com hash; depois só por retificação', async () => {
      const doc = await anexarEdital(ctx, lic, 'Edital real do pregao');
      expect(doc).toMatchObject({ versao: 1, status: 'RASCUNHO' });
      expect(doc.hash).toMatch(/^[0-9a-f]{64}$/);
      // antes da publicação o edital não é público
      expect((await http().get(`/api/publicacao/licitacao/${lic.id}/edital`)).status).toBe(404);

      await publicar(lic, corpoPublicacao(new Date(minimoAbertura(A.id, 9).getTime()))).expect(200);
      // antes da divulgação oficial (PNCP / diário oficial) o edital ainda não é público
      expect((await http().get(`/api/publicacao/licitacao/${lic.id}/edital`)).status).toBe(404);
      await confirmarDivulgacao(ctx, lic);
      const pub = (await http().get(`/api/publicacao/licitacao/${lic.id}/edital`).expect(200)).body;
      expect(pub.vigente).toMatchObject({ versao: 1, status: 'PUBLICADO', hash: doc.hash });
      const arq = await http().get(`/api/publicacao/licitacao/${lic.id}/edital/${pub.vigente.documento_id}/arquivo`).expect(200);
      expect(Buffer.from(arq.body).subarray(0, 5).toString('latin1')).toBe('%PDF-');

      const troca = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/edital`)
        .set(bearer(A.token))
        .attach('arquivo', pdfDeTeste('outro'), { filename: 'edital.pdf', contentType: 'application/pdf' });
      expect(troca.status).toBe(409);
      expect(troca.body.message).toMatch(/RETIFICAÇÃO/);
    });

    it('cronograma de edital publicado não muda pelo PUT (art. 55 §1º) — campos internos continuam livres', async () => {
      const r = await http()
        .put(`/api/licitacoes/${lic.id}`)
        .set(bearer(A.token))
        .send({ data_abertura_sessao: new Date(Date.now() + 60 * DIA_MS).toISOString() });
      expect(r.status).toBe(409);
      expect(r.body.campos).toContain('data_abertura_sessao');
      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ observacoes: 'anotação interna' }).expect(200);
    });
  });

  // ==========================================================================
  describe('3. Feriado municipal: conta só para o órgão que o cadastrou (art. 183, III)', () => {
    let feriadoId: string;
    let dataFeriado: string;

    it('órgão A cadastra feriado municipal num dia útil da janela; B não é afetado', async () => {
      // 2º dia útil (nacional) depois de hoje, em Brasília
      let t = diaEmBrasilia(new Date());
      let uteis = 0;
      while (uteis < 2) {
        t += DIA_MS;
        if (ehDiaUtil(new Date(t), calendarioDoOrgao(null))) uteis++;
      }
      dataFeriado = new Date(t).toISOString().slice(0, 10);
      const r = await http()
        .post('/api/feriados')
        .set(bearer(A.token))
        .send({ descricao: 'Aniversário do município (E2E)', data: dataFeriado, recorrente: false, base_legal: 'Lei municipal E2E' });
      expect(r.status).toBe(201);
      feriadoId = r.body.id;
      expect(r.body).toMatchObject({ orgao_id: A.id, abrangencia: 'MUNICIPAL' });

      const ano = Number(dataFeriado.slice(0, 4));
      const calA = (await http().get('/api/feriados').query({ ano }).set(bearer(A.token)).expect(200)).body;
      expect(calA.dias_sem_expediente.map((d: any) => d.data)).toContain(dataFeriado);
      const calB = (await http().get('/api/feriados').query({ ano }).set(bearer(B.token)).expect(200)).body;
      expect(calB.dias_sem_expediente.map((d: any) => d.data)).not.toContain(dataFeriado);
      expect(calB.feriados.some((f: any) => f.id === feriadoId)).toBe(false);
    });

    it('o prazo do art. 55 de A vence um dia útil depois do de B; a mesma data publica em B e é recusada em A', async () => {
      const la = await prontaParaPublicar(A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const lb = await prontaParaPublicar(B, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const minA = minimoAbertura(A.id, 8);
      const minB = minimoAbertura(B.id, 8);
      expect(minA.getTime()).toBeGreaterThan(minB.getTime());

      const pa = (await prazos(la).expect(200)).body;
      const pb = (await prazos(lb).expect(200)).body;
      expect(pa.data_minima_abertura).toBe(formatarRelogioBrasilia(minA));
      expect(pb.data_minima_abertura).toBe(formatarRelogioBrasilia(minB));
      expect(pa.feriados_no_periodo.map((f: any) => f.data)).toContain(dataFeriado);
      expect(pb.feriados_no_periodo.map((f: any) => f.data)).not.toContain(dataFeriado);

      const mesmaData = new Date(minB.getTime() + HORA);
      const ra = await publicar(la, corpoPublicacao(mesmaData));
      expect(ra.status).toBe(400);
      expect(ra.body.message).toMatch(/8 dias úteis/);
      await publicar(lb, corpoPublicacao(mesmaData)).expect(200);
    });

    it('ponto facultativo federal (Carnaval) só conta quando o órgão adota', async () => {
      const ano = new Date().getUTCFullYear() + 1;
      const cal = (await http().get('/api/feriados').query({ ano }).set(bearer(A.token)).expect(200)).body;
      const carnaval = cal.feriados.find((f: any) => f.movel === 'CARNAVAL_TERCA');
      expect(carnaval).toMatchObject({ ponto_facultativo: true, adotado: false, conta: false });
      const diaCarnaval = carnaval.datas_no_ano[0];
      expect(cal.dias_sem_expediente.map((d: any) => d.data)).not.toContain(diaCarnaval);

      await http().put(`/api/feriados/${carnaval.id}/adocao`).set(bearer(A.token)).send({ adotar: true }).expect(200);
      const depois = (await http().get('/api/feriados').query({ ano }).set(bearer(A.token)).expect(200)).body;
      expect(depois.dias_sem_expediente.map((d: any) => d.data)).toContain(diaCarnaval);
      const deB = (await http().get('/api/feriados').query({ ano }).set(bearer(B.token)).expect(200)).body;
      expect(deB.dias_sem_expediente.map((d: any) => d.data)).not.toContain(diaCarnaval);
      // Sexta-feira Santa é feriado nacional (móvel pela Páscoa) para todos
      expect(deB.dias_sem_expediente.some((d: any) => /Paixão de Cristo/.test(d.descricao))).toBe(true);
    });

    it('isolamento do calendário: B não altera/remove o feriado de A; fornecedor não cadastra; órgão não altera o nacional', async () => {
      expect((await http().put(`/api/feriados/${feriadoId}`).set(bearer(B.token)).send({ descricao: 'invadido' })).status).toBe(404);
      expect((await http().delete(`/api/feriados/${feriadoId}`).set(bearer(B.token))).status).toBe(404);
      expect((await http().post('/api/feriados').set(bearer(F1.token)).send({ descricao: 'x feriado', data: '2030-01-02' })).status).toBe(403);
      const nac = (await http().get('/api/feriados').set(bearer(A.token)).expect(200)).body.feriados.find((f: any) => f.abrangencia === 'NACIONAL');
      expect((await http().delete(`/api/feriados/${nac.id}`).set(bearer(A.token))).status).toBe(403);
      // leitura pública só dos dias sem expediente
      const pub = (await http().get(`/api/feriados/orgao/${A.id}`).expect(200)).body;
      expect(Object.keys(pub).sort()).toEqual(['ano', 'dias_sem_expediente']);
    });
  });

  // ==========================================================================
  describe('4. Retificação do edital (art. 55 §1º)', () => {
    let lic: LicitacaoFixture;

    const retificar = (campos: Record<string, any>, opts: { token?: string; arquivo?: boolean } = {}) => {
      const req = http().post(`/api/publicacao/licitacao/${lic.id}/retificar`).set(bearer(opts.token ?? A.token));
      for (const [k, v] of Object.entries(campos)) req.field(k, typeof v === 'string' ? v : JSON.stringify(v));
      if (opts.arquivo !== false) req.attach('arquivo', pdfDeTeste('Edital retificado'), { filename: 'edital-v2.pdf', contentType: 'application/pdf' });
      return req;
    };
    const minhaProposta = (f: FornecedorFixture) =>
      http().get(`/api/publicacao/licitacao/${lic.id}/minha-proposta`).set(bearer(f.token));

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await enviarProposta(ctx, F1, lic, [95, 45]);
      await enviarProposta(ctx, F2, lic, [96, 46]);
    });

    it('sem arquivo, sem motivo ou por quem não é o órgão dono → recusado', async () => {
      const base = { motivo: 'Correção do prazo de entrega', alteracoes: 'Prazo de entrega corrigido de 10 para 15 dias', afeta_propostas: 'false', justificativa_nao_afeta: 'Não altera preço nem objeto' };
      expect((await retificar(base, { arquivo: false })).status).toBe(400);
      expect((await retificar({ ...base, motivo: '' })).status).toBe(400);
      expect([403, 404]).toContain((await retificar(base, { token: B.token })).status);
      expect((await retificar(base, { token: F1.token })).status).toBe(403);
    });

    it('NÃO afeta as propostas: nova versão publicada, datas mantidas, propostas não precisam de confirmação', async () => {
      const antes = await buscarLicitacao(ctx, lic);
      const r = await retificar({
        motivo: 'Correção de erro material no edital',
        alteracoes: 'Correção do endereço de entrega (erro material)',
        afeta_propostas: 'false',
        justificativa_nao_afeta: 'Endereço de entrega não interfere no preço nem na formulação das propostas',
      });
      expect(r.status).toBe(201);
      expect(r.body.retificacao).toMatchObject({ numero: 1, afeta_propostas: false, versao_edital: 2, propostas_notificadas: 0 });
      const depois = await buscarLicitacao(ctx, lic);
      expect(depois.data_abertura_sessao).toBe(antes.data_abertura_sessao);
      expect((await minhaProposta(F1).expect(200)).body.requer_confirmacao).toBe(false);

      const ed = (await http().get(`/api/publicacao/licitacao/${lic.id}/edital`).expect(200)).body;
      expect(ed.vigente).toMatchObject({ versao: 2, tipo: 'EDITAL_RETIFICADO', status: 'PUBLICADO' });
      expect(ed.versoes.map((v: any) => [v.versao, v.status])).toEqual([
        [2, 'PUBLICADO'],
        [1, 'SUBSTITUIDO'],
      ]);
    });

    it('NÃO afeta, mas antecipa data → recusado (sem reabertura, só manter ou adiar)', async () => {
      const lAtual = await buscarLicitacao(ctx, lic);
      const antecipada = new Date(new Date(lAtual.data_abertura_sessao).getTime() - DIA_MS).toISOString();
      const r = await retificar({
        motivo: 'Antecipação indevida',
        alteracoes: 'Antecipa a abertura da sessão em um dia',
        afeta_propostas: 'false',
        justificativa_nao_afeta: 'Não altera as propostas (teste)',
        cronograma: { data_abertura_sessao: antecipada, data_fim_acolhimento: antecipada },
      });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/mantidas ou adiadas/);
    });

    it('AFETA as propostas: novo cronograma abaixo do art. 55 contado da retificação → recusado', async () => {
      const curto = new Date(minimoAbertura(A.id, 8).getTime() - HORA).toISOString();
      const r = await retificar({
        motivo: 'Alteração da especificação do item 1',
        alteracoes: 'Especificação técnica do item 1 alterada',
        afeta_propostas: 'true',
        cronograma: { data_fim_acolhimento: curto, data_abertura_sessao: curto },
      });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Republicação: .*8 dias úteis/);
    });

    it('AFETA as propostas: prazos reabertos, propostas sinalizadas e licitantes veem o aviso', async () => {
      const nova = new Date(minimoAbertura(A.id, 8).getTime() + 2 * HORA).toISOString();
      const r = await retificar({
        motivo: 'Alteração da especificação do item 1',
        alteracoes: 'Especificação técnica do item 1 alterada (nova versão do edital)',
        afeta_propostas: 'true',
        cronograma: { data_fim_acolhimento: nova, data_abertura_sessao: nova },
      });
      expect(r.status).toBe(201);
      expect(r.body.retificacao).toMatchObject({ numero: 2, afeta_propostas: true, versao_edital: 3, propostas_notificadas: 2 });
      expect(new Date((await buscarLicitacao(ctx, lic)).data_abertura_sessao).toISOString()).toBe(nova);

      const s1 = (await minhaProposta(F1).expect(200)).body;
      expect(s1).toMatchObject({ requer_confirmacao: true });
      expect(s1.ultima_retificacao).toMatchObject({ numero: 2, afeta_propostas: true });
      // quem não tem proposta: nada a confirmar
      expect((await minhaProposta(F3).expect(200)).body.requer_confirmacao).toBe(false);
      expect((await http().post(`/api/publicacao/licitacao/${lic.id}/confirmar-proposta`).set(bearer(F3.token))).status).toBe(404);
      // órgão não confirma pelo licitante
      expect((await http().post(`/api/publicacao/licitacao/${lic.id}/confirmar-proposta`).set(bearer(A.token))).status).toBe(403);

      const hist = (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(A.token)).expect(200)).body;
      expect(hist.filter((t: any) => t.ato === 'RETIFICAR_EDITAL')).toHaveLength(2);
    });

    it('licitante confirma a própria proposta (uma vez); o outro não confirma', async () => {
      const c = await http().post(`/api/publicacao/licitacao/${lic.id}/confirmar-proposta`).set(bearer(F1.token));
      expect(c.status).toBe(201);
      expect((await minhaProposta(F1).expect(200)).body).toMatchObject({ requer_confirmacao: false });
      expect((await http().post(`/api/publicacao/licitacao/${lic.id}/confirmar-proposta`).set(bearer(F1.token))).status).toBe(409);
      expect((await minhaProposta(F2).expect(200)).body.requer_confirmacao).toBe(true);
    });

    it('fim do novo prazo: a proposta NÃO confirmada sai da disputa; a confirmada segue', async () => {
      const passado = new Date(Date.now() - 1_000);
      await ajustarCronograma(ctx, lic, { data_fim_acolhimento: passado, data_abertura_sessao: passado });
      const r = await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(A.token)).send({});
      expect(r.status).toBe(200);
      expect(r.body.fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);
      const props: Array<{ fornecedor_id: string; status: string; motivo_desclassificacao: string | null }> = await ctx.dataSource.query(
        `SELECT fornecedor_id::text AS fornecedor_id, status::text AS status, motivo_desclassificacao FROM propostas WHERE licitacao_id = $1`,
        [lic.id],
      );
      const por = Object.fromEntries(props.map((p) => [p.fornecedor_id, p]));
      expect(por[F1.id].status).toBe('ENVIADA');
      expect(por[F2.id].status).toBe('CANCELADA');
      expect(por[F2.id].motivo_desclassificacao).toMatch(/não confirmada.*art\. 55, §1º/);
    });

    it('retificação em ANALISE_PROPOSTAS que afeta as propostas reabre o recebimento', async () => {
      const nova = new Date(minimoAbertura(A.id, 8).getTime() + 2 * HORA).toISOString();
      const r = await retificar({
        motivo: 'Nova alteração da especificação',
        alteracoes: 'Quantidade do item 2 esclarecida no edital',
        afeta_propostas: 'true',
        cronograma: { data_inicio_acolhimento: new Date().toISOString(), data_fim_acolhimento: nova, data_abertura_sessao: nova },
      });
      expect(r.status).toBe(201);
      expect(r.body.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect((await minhaProposta(F1).expect(200)).body.requer_confirmacao).toBe(true);
    });

    it('antes da divulgação não há retificação (409 — altera-se o cadastro)', async () => {
      const outra = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, outra, FaseLicitacao.APROVACAO_INTERNA);
      const r = await http()
        .post(`/api/publicacao/licitacao/${outra.id}/retificar`)
        .set(bearer(A.token))
        .field('motivo', 'Antes de publicar')
        .field('alteracoes', 'Alteração antes da divulgação')
        .field('afeta_propostas', 'false')
        .field('justificativa_nao_afeta', 'Ainda não divulgado')
        .attach('arquivo', pdfDeTeste(), { filename: 'e.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/ainda não divulgado/);
    });
  });

  // ==========================================================================
  describe('5. Impugnação acolhida que altera o edital exige retificação antes da sessão', () => {
    let lic: LicitacaoFixture;
    const pendenciasDisputa = async () => {
      const pc = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(A.token)).expect(200)).body;
      return (pc.atos_disponiveis.find((a: any) => a.ato === 'INICIAR_DISPUTA')?.pendencias ?? []).join(' ');
    };

    it('impugnação DEFERIDA com altera_edital bloqueia a abertura da disputa até a retificação', async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const imp = await http()
        .post('/api/impugnacoes')
        .set(bearer(F3.token))
        .send({ licitacao_id: lic.id, texto_impugnacao: 'A especificação do item 1 direciona a marca (E2E)' });
      expect(imp.status).toBe(201);
      await http()
        .put(`/api/impugnacoes/${imp.body.id}/responder`)
        .set(bearer(A.token))
        .send({ resposta: 'Acolhida: a especificação será corrigida', status: 'DEFERIDA', respondido_por: 'Pregoeira', altera_edital: true, alteracoes_edital: 'Especificação do item 1' })
        .expect(200);
      await enviarProposta(ctx, F1, lic, [95, 45]);
      const passado = new Date(Date.now() - 1_000);
      await ajustarCronograma(ctx, lic, { data_fim_acolhimento: passado, data_abertura_sessao: passado });
      await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(A.token)).send({}).expect(200);
      expect(await pendenciasDisputa()).toMatch(/Impugnação acolhida altera o edital: retifique o edital/);
    });

    it('depois da retificação a impugnação fica atendida e a pendência some', async () => {
      const r = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/retificar`)
        .set(bearer(A.token))
        .field('motivo', 'Atendimento à impugnação acolhida')
        .field('alteracoes', 'Especificação do item 1 sem indicação de marca')
        .field('afeta_propostas', 'false')
        .field('justificativa_nao_afeta', 'A indicação de marca era exemplificativa; as propostas não mudam')
        .attach('arquivo', pdfDeTeste('Edital retificado impugnacao'), { filename: 'edital.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      expect(r.body.retificacao.impugnacao_ids).toHaveLength(1);
      expect(await pendenciasDisputa()).not.toMatch(/Impugnação acolhida/);
    });
  });

  // ==========================================================================
  describe('6. Revogação/anulação em dois tempos (art. 71 §3º)', () => {
    let lic: LicitacaoFixture;
    const intencao = (corpo: Record<string, any>, token = A.token) =>
      http().post(`/api/publicacao/licitacao/${lic.id}/intencao-extincao`).set(bearer(token)).send(corpo);
    const ato = (nome: string, motivo = 'Fato superveniente comprovado: a demanda deixou de existir') =>
      http().post(`/api/licitacoes/${lic.id}/atos/${nome}`).set(bearer(A.token)).send({ motivo });

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await enviarProposta(ctx, F1, lic, [95, 45]);
    });

    it('com licitante interessado, revogar direto é recusado (manifestação prévia)', async () => {
      const r = await ato('REVOGAR');
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/manifestação prévia/);
    });

    it('só o órgão dono abre a intenção; motivo obrigatório', async () => {
      expect([403, 404]).toContain((await intencao({ tipo: 'REVOGAR', motivo: 'Tentativa do órgão B' }, B.token)).status);
      expect((await intencao({ tipo: 'REVOGAR', motivo: 'Tentativa do fornecedor' }, F1.token)).status).toBe(403);
      expect((await intencao({ tipo: 'REVOGAR', motivo: 'curto' })).status).toBe(400);
    });

    it('intenção de revogar abre o prazo de manifestação (3 dias úteis do calendário do órgão) e avisa os licitantes', async () => {
      const r = await intencao({ tipo: 'REVOGAR', motivo: 'Fato superveniente comprovado: a demanda deixou de existir' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ tipo: 'REVOGAR', status: 'ABERTA', prazo_dias_uteis: 3, licitantes_notificados: 1 });
      const esperado = fimDoPrazoEmDiasUteis(new Date(r.body.aberta_em), 3, calendarioDoOrgao(A.id));
      expect(new Date(r.body.prazo_fim).getTime()).toBe(esperado.getTime());
      // uma por vez
      expect((await intencao({ tipo: 'ANULAR', motivo: 'Outra intenção simultânea (teste)' })).status).toBe(400);
    });

    it('licitante se manifesta (uma, editável); quem não é licitante não', async () => {
      const m1 = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/extincao/manifestacao`)
        .set(bearer(F1.token))
        .send({ texto: 'Discordo: a demanda persiste conforme o PCA.' });
      expect(m1.status).toBe(201);
      const m2 = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/extincao/manifestacao`)
        .set(bearer(F1.token))
        .send({ texto: 'Discordo: a demanda persiste conforme o PCA (complemento).' });
      expect(m2.body.id).toBe(m1.body.id);
      const semProposta = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/extincao/manifestacao`)
        .set(bearer(F2.token))
        .send({ texto: 'Manifestação de quem não participa' });
      expect(semProposta.status).toBe(403);
    });

    it('leitura por papel: órgão vê as manifestações; licitante só a sua; público e outro órgão, nenhuma', async () => {
      const orgao = (await http().get(`/api/publicacao/licitacao/${lic.id}/extincao`).set(bearer(A.token)).expect(200)).body;
      expect(orgao[0].manifestacoes).toHaveLength(1);
      const f1 = (await http().get(`/api/publicacao/licitacao/${lic.id}/extincao`).set(bearer(F1.token)).expect(200)).body;
      expect(f1[0].manifestacoes).toHaveLength(1);
      const f2 = (await http().get(`/api/publicacao/licitacao/${lic.id}/extincao`).set(bearer(F2.token)).expect(200)).body;
      expect(f2[0].manifestacoes).toHaveLength(0);
      for (const req of [http().get(`/api/publicacao/licitacao/${lic.id}/extincao`), http().get(`/api/publicacao/licitacao/${lic.id}/extincao`).set(bearer(B.token))]) {
        const r = (await req.expect(200)).body;
        expect(r[0].manifestacoes).toBeUndefined();
        expect(r[0].total_manifestacoes).toBeUndefined();
      }
    });

    it('revogar antes do fim do prazo é recusado; depois, revoga com a intenção concluída', async () => {
      const cedo = await ato('REVOGAR');
      expect(cedo.status).toBe(400);
      expect(cedo.body.message).toMatch(/em curso/);
      // RELÓGIO de teste: o prazo de manifestação terminou
      await ctx.dataSource.query(`UPDATE extincoes_licitacao SET prazo_fim = $2 WHERE licitacao_id = $1`, [lic.id, new Date(Date.now() - 60_000)]);
      const tarde = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/extincao/manifestacao`)
        .set(bearer(F1.token))
        .send({ texto: 'Manifestação fora do prazo (teste)' });
      expect(tarde.status).toBe(409);
      const r = await ato('REVOGAR');
      expect(r.status).toBe(201);
      expect(r.body.situacao ?? r.body.licitacao?.situacao).toBe('REVOGADA');
      const [e] = await ctx.dataSource.query(`SELECT status FROM extincoes_licitacao WHERE licitacao_id = $1`, [lic.id]);
      expect(e.status).toBe('CONCLUIDA');
      const hist = (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(A.token)).expect(200)).body.map((t: any) => t.ato);
      expect(hist).toEqual(expect.arrayContaining(['INTENCAO_REVOGAR', 'REVOGAR']));
    });

    it('intenção de anular pode ser cancelada (desistência); sem licitantes a revogação é direta', async () => {
      const outra = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, outra, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await enviarProposta(ctx, F1, outra, [95, 45]);
      await http()
        .post(`/api/publicacao/licitacao/${outra.id}/intencao-extincao`)
        .set(bearer(A.token))
        .send({ tipo: 'ANULAR', motivo: 'Vício insanável aparente no termo de referência', prazo_dias_uteis: 5 })
        .expect(201);
      const c = await http()
        .post(`/api/publicacao/licitacao/${outra.id}/intencao-extincao/cancelar`)
        .set(bearer(A.token))
        .send({ motivo: 'Vício afastado pela assessoria jurídica' });
      expect(c.status).toBe(201);
      expect(c.body.status).toBe('CANCELADA');
      expect((await buscarLicitacao(ctx, outra)).situacao).toBe('ATIVA');

      const semLicitantes = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, semLicitantes, FaseLicitacao.PUBLICADO);
      const r = await http()
        .post(`/api/licitacoes/${semLicitantes.id}/atos/REVOGAR`)
        .set(bearer(A.token))
        .send({ motivo: 'Fato superveniente: dotação cancelada (sem licitantes)' });
      expect(r.status).toBe(201);
    });
  });

  // ==========================================================================
  describe('7. Isolamento das rotas da publicação', () => {
    let lic: LicitacaoFixture;
    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
    });

    it('prazos da fase interna: só o órgão dono (B 404/403, fornecedor 403, anônimo 401)', async () => {
      expect([403, 404]).toContain((await prazos(lic, {}, B.token)).status);
      expect((await prazos(lic, {}, F1.token)).status).toBe(403);
      expect((await http().get(`/api/publicacao/licitacao/${lic.id}/prazos`)).status).toBe(401);
    });

    it('edital em rascunho: invisível para outro órgão, fornecedor e público (404)', async () => {
      const ed = (await http().get(`/api/publicacao/licitacao/${lic.id}/edital`).set(bearer(A.token)).expect(200)).body;
      expect(ed.vigente.status).toBe('RASCUNHO');
      for (const token of [B.token, F1.token]) {
        expect((await http().get(`/api/publicacao/licitacao/${lic.id}/edital`).set(bearer(token))).status).toBe(404);
        expect((await http().get(`/api/publicacao/licitacao/${lic.id}/edital/${ed.vigente.documento_id}/arquivo`).set(bearer(token))).status).toBe(404);
      }
    });

    it('intenção de extinção e retificação de outro órgão: nunca (e id inexistente → 404)', async () => {
      const r = await http()
        .post(`/api/publicacao/licitacao/${lic.id}/intencao-extincao/cancelar`)
        .set(bearer(B.token))
        .send({ motivo: 'Tentativa de B' });
      expect([403, 404]).toContain(r.status);
      expect((await http().get('/api/publicacao/licitacao/00000000-0000-0000-0000-000000000000/edital')).status).toBe(404);
      expect((await http().get('/api/publicacao/licitacao/nao-e-uuid/retificacoes')).status).toBe(404);
    });
  });
});
