/**
 * FASE INTERNA — ENTREGA 5 (publicação e dispensa com/sem etapa de lances).
 * docs/licitacao/PLANO-FASE-INTERNA.md §12.
 *
 *  A. Padrão SUGERIDO do órgão `dispensa_com_lances` (true — com lances) e
 *     "regulamento local adota a IN 67" (false).
 *  A2. ESCOLHA no processo (PUT /fase-interna/:id/modo-disputa): sobrepõe o
 *     padrão sugerido; quem escolheu vai para o histórico; congelada no
 *     PUBLICAR; depois de publicar, 409; o PUT genérico do processo não a muda.
 *  B. Dispensa SEM disputa de lances: publica (gravado no processo; o aviso diz
 *     "sem disputa de lances — Lei 14.133, art. 75, §3º"), recebe propostas, a
 *     janela não abre (409) e o julgamento é pelo menor preço sem janela;
 *     empate → a proposta registrada primeiro.
 *  C. Dispensa COM disputa de lances continua exigindo a janela; mudar o padrão
 *     do órgão DEPOIS de publicar não afeta nenhum dos dois processos.
 *  D. Publicar pela tela da conformidade: o portão C segura (BLOQUEIO), a tela
 *     mostra o quadro (modo, canais, controle interno); corrigido, publica; a
 *     etapa 8 fica EM ANDAMENTO até a confirmação do PNCP, que conclui a etapa
 *     e a tarefa.
 *  E. Diário Oficial como peça da publicação: órgão sem PNCP — o registro é a
 *     divulgação oficial (confirma, conclui a etapa 8 e a tarefa); antes de
 *     publicar 409.
 *  F. Controle interno ativo: aviso antes de publicar, não bloqueia. DISP-01:
 *     sem lances num órgão que adota a IN 67 → ATENÇÃO (não bloqueia).
 *  G. Isolamento dos endpoints novos.
 *  Sem migração de boot (colunas novas nullable/default; NULL = regra da época).
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  abrirSessaoAgora,
  confirmarDivulgacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  enviarProposta,
  gerarAvisoDispensa,
  pdfDeTeste,
  cumprirEtapasAnteriores,
} from './support';
import { abrirJanelaLances, corpoDivulgacao, criarDispensaPublicada, fimPropostasSugerido, moverFimDaJanela, vincularOrgaoPncp } from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { MinutasSubscriber } from '../src/fase-interna/telas/minutas.subscriber';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';
import { paginasDoPdf } from '../src/fase-interna/conformidade/texto-pdf';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Fase interna — Entrega 5 (publicação; dispensa com ou sem etapa de lances)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture; // sem etapa de lances (regulamento local), sem PNCP
  let B: OrgaoFixture; // padrão IN 67 (com lances), integrado ao PNCP
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  let agenteA: UsuarioOrgaoFixture;
  let agenteB: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = async () => {
    await ctx.app.get(MinutasSubscriber).aguardarPendentes();
    await ctx.app.get(TarefasService).aguardarPendentes();
  };
  const configurar = (orgao: OrgaoFixture, corpo: Record<string, unknown>) => http().put('/api/fase-interna/configuracao').set(bearer(orgao.token)).send(corpo);
  const processo = async (lic: { id: string }, token: string) => (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(token)).expect(200)).body;
  const anexar = (lic: { id: string }, tipo: string, token: string, texto?: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(texto ?? `Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Não se aplica a esta contratação direta (art. 72).' });
  /** Art. 72 completo pelos anexos (como a E4). */
  /**
   * NA ORDEM DO FLUXO (homologação multiusuário; art. 53, §4º): demanda → ETP/TR/pesquisa → reserva →
   * minutas → parecer → (controle interno, quando ligado) → autorização. `ate` para antes de uma peça.
   */
  const instruir = async (lic: { id: string }, token: string, anexos: Record<string, string> = {}, opcoes: { controleInterno?: boolean; ate?: string } = {}) => {
    const ordem = ['DFD', 'PP', 'ETP', 'AR', 'TR', 'DO', 'RAG', 'ME', 'MC', 'JC', 'PJ', ...(opcoes.controleInterno ? ['MCI'] : []), 'AA', 'DP'];
    for (const t of ordem) {
      if (t === opcoes.ate) return;
      // DO: art. 72, IV não admite "não se aplica" — anexada
      const status = ['DFD', 'PP', 'DO', 'AA', 'MCI'].includes(t) || anexos[t] ? (await anexar(lic, t, token, anexos[t])).status : (await naoSeAplica(lic, t, token)).status;
      expect([t, status]).toEqual([t, 201]);
    }
  };
  const conformidade = async (lic: { id: string }, token: string) => {
    await esperar();
    return (await http().get(`/api/fase-interna/${lic.id}/conformidade`).set(bearer(token)).expect(200)).body;
  };
  const tarefaPublicacao = async (lic: { id: string }) =>
    (await esperar(), await sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 AND passo = 'PUBLICACAO' AND origem = 'ETAPA' ORDER BY created_at DESC LIMIT 1`, [lic.id]))[0];
  const passoPublicacao = async (lic: { id: string }, token: string) => {
    await esperar();
    const r = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(token)).expect(200)).body;
    const passos = (r.etapas ?? r).flatMap((e: any) => e.passos);
    return passos.find((p: any) => p.passo === 'PUBLICACAO');
  };
  const textoDoAviso = async (lic: { id: string }, token: string) => {
    const av = (await http().get(`/api/publicacao/licitacao/${lic.id}/aviso`).set(bearer(token)).expect(200)).body;
    const pdf = await http().get(`/api/publicacao/licitacao/${lic.id}/aviso/${av.vigente.documento_id}/arquivo`).set(bearer(token)).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(pdf.status).toBe(200);
    return ((await paginasDoPdf(pdf.body as Buffer)) ?? []).join('\n').replace(/\s+/g, ' ');
  };

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara E5 A (sem lances)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E5 B (IN 67)' });
    await vincularOrgaoPncp(ctx, B);
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    agenteA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente E5' });
    agenteB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.PREGOEIRO, nome: 'Bruno Agente E5' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. configuração por órgão (decisão 5 do dono)', () => {
    it('padrão SUGERIDO = com lances; o órgão sugere "sem lances"; valor não booleano 400', async () => {
      const antes = (await http().get('/api/fase-interna/configuracao').set(bearer(A.token)).expect(200)).body;
      expect(antes.dispensa_com_lances).toBe(true);
      expect((await configurar(A, { dispensa_com_lances: 'nao' })).status).toBe(400);
      const r = await configurar(A, { dispensa_com_lances: false });
      expect(r.status).toBe(200);
      expect(r.body.dispensa_com_lances).toBe(false);
      // B não foi tocado
      expect((await http().get('/api/fase-interna/configuracao').set(bearer(B.token)).expect(200)).body.dispensa_com_lances).toBe(true);
      // mudar outro campo sem mandar o modo não o altera
      const r2 = await configurar(A, { modo: 'SIMPLES' });
      expect(r2.body.dispensa_com_lances).toBe(false);
    });
  });

  // ==========================================================================
  describe('A2. escolha da disputa no processo (sobrepõe o padrão do órgão; congelada na publicação)', () => {
    let lic: LicitacaoFixture;

    it('o agente escolhe "com lances" num órgão cujo padrão é "sem lances": vale a escolha; quem escolheu vai para o histórico', async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await processo(lic, A.token)).licitacao.modo_disputa_dispensa).toMatchObject({ com_lances: false, fonte: 'SUGERIDO' });
      expect((await http().put(`/api/fase-interna/${lic.id}/modo-disputa`).set(bearer(agenteA.token)).send({ com_lances: 'sim' })).status).toBe(400);
      const r = await http().put(`/api/fase-interna/${lic.id}/modo-disputa`).set(bearer(agenteA.token)).send({ com_lances: true });
      expect(r.status).toBe(200);
      expect(r.body.modo_disputa).toMatchObject({ com_lances: true, fonte: 'ESCOLHA', editavel: true, padrao_do_orgao: false });
      expect(r.body.modo_disputa.escolhido_por.nome).toBe('Ana Agente E5');
      expect(r.body.modo_disputa.opcoes.map((o: any) => o.rotulo)).toEqual([
        'Com disputa de lances (sessão de lances em tempo real)',
        'Sem disputa de lances (só recebimento de propostas no prazo do aviso)',
      ]);
      const [log] = await sql(
        `SELECT usuario_nome, descricao, dados_antes, dados_depois FROM logs_fase_interna WHERE licitacao_id = $1 AND dados_depois ? 'dispensa_com_lances' ORDER BY created_at DESC LIMIT 1`,
        [lic.id],
      );
      expect(log).toMatchObject({ usuario_nome: 'Ana Agente E5', dados_antes: { dispensa_com_lances: null }, dados_depois: { dispensa_com_lances: true } });
      expect(log.descricao).toMatch(/COM disputa de lances/);
      // o PUT genérico do processo não muda a escolha (só a rota própria, que confere a fase)
      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ dispensa_com_lances: false }).expect(200);
      expect((await processo(lic, A.token)).licitacao.modo_disputa_dispensa).toMatchObject({ com_lances: true, fonte: 'ESCOLHA' });
    });

    it('publicar congela a ESCOLHA (não o padrão); depois de publicar a escolha não muda (409)', async () => {
      const DOCS = ['DFD', 'PP', 'AA'];
      for (const t of DOCS) {
        // Na ordem do fluxo: antes da autorização, as etapas anteriores ("se for o caso" = "não se aplica")
        if (t === 'AA') await cumprirEtapasAnteriores(ctx, lic, 'AUTORIZACAO');
        await http().post(`/api/fase-interna/${lic.id}/documento`).set(bearer(A.token)).send({ tipo: t, titulo: t, descricao: `${t} — documento de teste E2E` }).expect(201);
      }
      await cumprirEtapasAnteriores(ctx, lic, 'PUBLICACAO');
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(A.token)).expect(200);
      await gerarAvisoDispensa(ctx, lic);
      const pub = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(agenteA.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(pub.status).toBe(200);
      const [l] = await sql(`SELECT dispensa_com_lances FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.dispensa_com_lances).toBe(true);
      const [t] = await sql(`SELECT dados FROM licitacao_transicoes WHERE licitacao_id = $1 AND ato = 'PUBLICAR'`, [lic.id]);
      expect(t.dados.dados).toMatchObject({ dispensa_com_lances: true, dispensa_modo_origem: 'ESCOLHA_DO_PROCESSO' });
      expect(await textoDoAviso(lic, A.token)).toMatch(/disputa de lances em tempo real/);
      const r = await http().put(`/api/fase-interna/${lic.id}/modo-disputa`).set(bearer(agenteA.token)).send({ com_lances: false });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/congelada na publicação/);
      expect((await processo(lic, A.token)).licitacao.modo_disputa_dispensa).toMatchObject({ com_lances: true, congelado: true, editavel: false });
      // outra modalidade: 400
      const pregao = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      expect((await http().put(`/api/fase-interna/${pregao.id}/modo-disputa`).set(bearer(agenteA.token)).send({ com_lances: false })).status).toBe(400);
    });
  });

  // ==========================================================================
  describe('B/C. dispensa sem lances × com lances; congelamento na publicação', () => {
    let semLances: LicitacaoFixture;
    let comLances: LicitacaoFixture;

    it('na fase interna, sem escolha, vale o padrão sugerido (ainda não congelado); a minuta do aviso o reflete', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await cumprirEtapasAnteriores(ctx, lic, 'MINUTAS'); // a minuta só depois da reserva (ordem do fluxo)
      const p = await processo(lic, A.token);
      expect(p.licitacao.modo_disputa_dispensa).toMatchObject({ aplica: true, com_lances: false, congelado: false, fonte: 'SUGERIDO', editavel: true });
      expect(p.licitacao.modo_disputa_dispensa.descricao).toMatch(/Sem disputa de lances — só o recebimento de propostas no prazo do aviso/);
      expect(p.licitacao.modo_disputa_dispensa.referencia).toBe('Lei nº 14.133/2021, art. 75, §3º (aviso de 3 dias úteis para propostas adicionais)');
      await http().post(`/api/fase-interna/${lic.id}/minutas/ME/gerar`).set(bearer(A.token)).expect(201);
      const [me] = await sql(`SELECT dados_estruturados FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo = 'ME' AND versao_atual = true`, [lic.id]);
      expect(JSON.stringify(me.dados_estruturados)).toMatch(/Não haverá disputa de lances/);
    });

    it('publicar grava o modo no processo (congelado) e o aviso diz "sem disputa de lances"', async () => {
      semLances = await criarDispensaPublicada(ctx, A);
      const [l] = await sql(`SELECT dispensa_com_lances, fase::text AS fase FROM licitacoes WHERE id = $1`, [semLances.id]);
      expect(l.dispensa_com_lances).toBe(false);
      const [t] = await sql(`SELECT dados FROM licitacao_transicoes WHERE licitacao_id = $1 AND ato = 'PUBLICAR'`, [semLances.id]);
      expect(t.dados.dados).toMatchObject({ dispensa_com_lances: false, dispensa_modo_origem: 'PADRAO_SUGERIDO_DO_ORGAO' }); // anotado nos dados do ato (histórico)
      const texto = await textoDoAviso(semLances, A.token);
      expect(texto).toMatch(/Sem disputa de lances \(só recebimento de propostas no prazo do aviso\)/);
      expect(texto).toMatch(/art\. 75, §3º/);
      expect(texto).toMatch(/registrada primeiro/);
      expect(texto).not.toMatch(/haverá sessão de disputa de lances/);
      const p = await processo(semLances, A.token);
      expect(p.licitacao.modo_disputa_dispensa).toMatchObject({ com_lances: false, congelado: true, fonte: 'PROCESSO' });

      comLances = await criarDispensaPublicada(ctx, B);
      const [l2] = await sql(`SELECT dispensa_com_lances FROM licitacoes WHERE id = $1`, [comLances.id]);
      expect(l2.dispensa_com_lances).toBe(true);
      const textoCom = await textoDoAviso(comLances, B.token);
      expect(textoCom).toMatch(/disputa de lances em tempo real/);
      expect(textoCom).toMatch(/IN SEGES nº 67\/2021, quando adotada pelo órgão/);
    });

    it('mudar a configuração DEPOIS de publicar não altera nenhum dos dois processos', async () => {
      expect((await configurar(A, { dispensa_com_lances: true })).status).toBe(200);
      expect((await configurar(B, { dispensa_com_lances: false })).status).toBe(200);
      expect((await processo(semLances, A.token)).licitacao.modo_disputa_dispensa).toMatchObject({ com_lances: false, congelado: true });
      expect((await processo(comLances, B.token)).licitacao.modo_disputa_dispensa).toMatchObject({ com_lances: true, congelado: true });
      const [a] = await sql(`SELECT dispensa_com_lances FROM licitacoes WHERE id = $1`, [semLances.id]);
      const [b] = await sql(`SELECT dispensa_com_lances FROM licitacoes WHERE id = $1`, [comLances.id]);
      expect([a.dispensa_com_lances, b.dispensa_com_lances]).toEqual([false, true]);
    });

    it('sem lances: recebe propostas; a janela não abre (409); julga pelo menor preço SEM janela; empate → a registrada primeiro', async () => {
      await enviarProposta(ctx, F1, semLances, [90, 48]); // registrada primeiro
      await pausa(30);
      await enviarProposta(ctx, F2, semLances, [90, 45]); // empata no item 1, vence no item 2
      await pausa(30);
      await enviarProposta(ctx, F3, semLances, [95, 49]);
      await abrirSessaoAgora(ctx, semLances);

      const jan = await abrirJanelaLances(ctx, semLances, { duracao_minutos: 360 });
      expect(jan.status).toBe(409);
      expect(jan.body.message).toMatch(/SEM disputa de lances/);

      const atos = (await http().get(`/api/licitacoes/${semLances.id}/atos`).set(bearer(A.token)).expect(200)).body;
      expect(atos.find((x: any) => x.ato === 'JULGAR_DISPENSA')).toMatchObject({ disponivel: true });

      const j = await http().post(`/api/licitacoes/${semLances.id}/julgar-dispensa`).set(bearer(A.token));
      expect(j.status).toBe(201);
      expect(j.body.com_lances).toBe(false);
      const itens = await sql(`SELECT numero_item, fornecedor_vencedor_id::text AS v, valor_unitario_homologado FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`, [semLances.id]);
      expect(itens[0].v).toBe(F1.id); // empate a 90 → F1 registrou primeiro
      expect(itens[1].v).toBe(F2.id);
      const [t] = await sql(`SELECT dados FROM licitacao_transicoes WHERE licitacao_id = $1 AND ato = 'JULGAR_DISPENSA'`, [semLances.id]);
      expect(JSON.stringify(t.dados)).toMatch(/SEM_LANCES/);
      // negociação com o vencedor (IN 67, art. 16) vale também sem lances
      const regras = (await http().get(`/api/licitacoes/${semLances.id}/dispensa/mensagens/regras`).set(bearer(A.token)).expect(200)).body;
      expect(regras.modo).toBe('NEGOCIACAO');
    });

    it('com lances (IN 67) continua exigindo a janela, mesmo com a configuração do órgão agora "sem lances"', async () => {
      await enviarProposta(ctx, F1, comLances, [90, 45]);
      await enviarProposta(ctx, F2, comLances, [92, 44]);
      await abrirSessaoAgora(ctx, comLances);
      const j = await http().post(`/api/licitacoes/${comLances.id}/julgar-dispensa`).set(bearer(B.token));
      expect(j.status).toBe(400);
      expect(JSON.stringify(j.body)).toMatch(/Abra a fase de lances/);
      expect((await abrirJanelaLances(ctx, comLances, { duracao_minutos: 360 })).status).toBe(201);
      await moverFimDaJanela(ctx, comLances.id, new Date(Date.now() - 1_000));
      const ok = await http().post(`/api/licitacoes/${comLances.id}/julgar-dispensa`).set(bearer(B.token));
      expect(ok.status).toBe(201);
      expect(ok.body.com_lances).toBe(true);
      // volta o padrão de B para os próximos casos
      expect((await configurar(B, { dispensa_com_lances: true })).status).toBe(200);
    });
  });

  // ==========================================================================
  describe('D. publicar pela tela da conformidade (portão C) e confirmação do PNCP (etapa 8)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      expect((await configurar(B, { dispensa_com_lances: true })).status).toBe(200);
      lic = await criarLicitacao(ctx, B, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agenteB.id } });
      await sql(`UPDATE licitacoes SET numero_processo = '555/2026', numero_edital = '055/2026' WHERE id = $1`, [lic.id]);
      await instruir(lic, agenteB.token, { MC: 'Minuta do contrato vinculada ao PA 115/2025 Dispensa 025/2025' });
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(B.token)).expect(200);
      await gerarAvisoDispensa(ctx, lic);
    });

    it('a tela mostra o quadro: modo da dispensa, canais com a situação e o botão "Publicar — resolva 1 bloqueio"', async () => {
      const t = await conformidade(lic, agenteB.token);
      expect(t.publicar).toMatchObject({ pode: false, rotulo: 'Publicar — resolva 1 bloqueio' });
      expect(t.aviso.modo_disputa).toMatchObject({ com_lances: true, congelado: false });
      expect(t.publicacao.etapa8.situacao).toBe('PENDENTE');
      expect(t.aviso.canais.map((c: any) => c.chave)).toEqual(['PNCP', 'SITIO', 'DIARIO_OFICIAL', 'PLATAFORMA']);
      expect(t.aviso.canais[0].situacao).toBe('Aguardando a conformidade');
      expect(t.aviso.canais[2].situacao).toBe('Registrar depois de publicar');
      const tarefa = await tarefaPublicacao(lic);
      expect(tarefa).toMatchObject({ status: 'ABERTA', tipo: 'PUBLICACAO' });
    });

    it('o PUBLICAR da tela é recusado pelo portão C com o que falta e onde; o Diário Oficial antes de publicar é 409', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(agenteB.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(r.status).toBe(400);
      expect(r.body.pendencias.join(' ')).toMatch(/Trava da lei \(publicar\) — VINC-01/);
      const d = await http()
        .post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`)
        .set(bearer(agenteB.token))
        .field('numero_edicao', 'nº 100')
        .field('data_publicacao', hoje());
      expect(d.status).toBe(409);
    });

    it('corrigida a peça, publica: etapa 8 EM ANDAMENTO e a tarefa aberta até a confirmação do PNCP', async () => {
      expect((await anexar(lic, 'MC', agenteB.token, 'Minuta do contrato vinculada ao PA 555/2026 Dispensa 055/2026')).status).toBe(201);
      const t = await conformidade(lic, agenteB.token);
      expect(t.publicar.pode).toBe(true);
      await gerarAvisoDispensa(ctx, lic);
      const r = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(agenteB.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(r.status).toBe(200);
      expect(r.body.fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
      expect((await passoPublicacao(lic, agenteB.token)).situacao).toBe('EM_ANDAMENTO');
      expect((await tarefaPublicacao(lic)).status).toBe('ABERTA');
      const q = (await http().get(`/api/fase-interna/${lic.id}/publicacao`).set(bearer(agenteB.token)).expect(200)).body;
      expect(q.etapa8.situacao).toBe('AGUARDANDO_CONFIRMACAO');
      expect(q.canais.find((c: any) => c.chave === 'PNCP').situacao).toMatch(/fila|aguardando/i);
      expect(q.modo_disputa).toMatchObject({ congelado: true, com_lances: true });
    });

    it('a confirmação do PNCP conclui a etapa 8 e fecha a tarefa (quem cumpriu = quem publicou)', async () => {
      const l = await confirmarDivulgacao(ctx, lic);
      expect([FaseLicitacao.PUBLICADO, FaseLicitacao.ACOLHIMENTO_PROPOSTAS]).toContain(l.fase);
      expect((await passoPublicacao(lic, agenteB.token)).situacao).toBe('CONCLUIDO');
      const tarefa = await tarefaPublicacao(lic);
      expect(tarefa.status).toBe('CONCLUIDA');
      expect(tarefa.concluida_por_id).toBe(agenteB.id);
      const q = (await http().get(`/api/fase-interna/${lic.id}/publicacao`).set(bearer(agenteB.token)).expect(200)).body;
      expect(q.etapa8.situacao).toBe('CONCLUIDA');
      expect(q.canais.find((c: any) => c.chave === 'PNCP')).toMatchObject({ ok: true });
      expect(q.canais.find((c: any) => c.chave === 'SITIO')).toMatchObject({ ok: true });
    });

    it('órgão integrado: o Diário Oficial vira peça da publicação (com a página anexada e folhas), sem mudar a divulgação', async () => {
      const r = await http()
        .post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`)
        .set(bearer(agenteB.token))
        .field('numero_edicao', 'nº 2.001')
        .field('data_publicacao', hoje())
        .field('pagina', '12')
        .attach('arquivo', pdfDeTeste('Diario Oficial pagina 12'), { filename: 'do.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      expect(r.body.confirmou_divulgacao).toBe(false);
      const [doc] = await sql(`SELECT tipo::text AS tipo, numero_peca, folha_inicial, status::text AS status FROM documentos_fase_interna WHERE id = $1`, [r.body.documento_id]);
      expect(doc).toMatchObject({ tipo: 'PDO', numero_peca: 'Diário Oficial nº 2.001, p. 12', status: 'IMPORTADO' });
      expect(doc.folha_inicial).toBeGreaterThan(0);
      expect(r.body.publicacao.canais.find((c: any) => c.chave === 'DIARIO_OFICIAL')).toMatchObject({ ok: true });
      const [l] = await sql(`SELECT meio_divulgacao_oficial FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.meio_divulgacao_oficial).toBe('PNCP');
      // data futura recusada; sem número recusado
      const futura = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      expect((await http().post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`).set(bearer(agenteB.token)).field('numero_edicao', 'nº 1').field('data_publicacao', futura)).status).toBe(400);
      expect((await http().post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`).set(bearer(agenteB.token)).field('data_publicacao', hoje())).status).toBe(400);
    });
  });

  // ==========================================================================
  describe('E/F. órgão sem PNCP: o Diário Oficial é a divulgação oficial; controle interno ativo é só aviso', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      expect((await configurar(A, { dispensa_com_lances: false, controle_interno_ativo: true, regulamento_adota_in67: true })).status).toBe(200);
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agenteA.id } });
      await instruir(lic, agenteA.token, {}, { controleInterno: true, ate: 'MCI' });
    });

    it('controle interno ativo: é etapa do fluxo entre o parecer e a autorização — sem a manifestação, a autorização espera; com ela, segue', async () => {
      // Homologação multiusuário (mapa do dono: Jurídico → Controle Interno → Presidência — Portaria 089/2024)
      const cedo = await anexar(lic, 'AA', agenteA.token);
      expect(cedo.status).toBe(403);
      expect(cedo.body.message).toMatch(/Manifestação do controle interno/);
      const conf = (await http().get(`/api/licitacoes/${lic.id}/conferencia-publicacao`).set(bearer(A.token)).expect(200)).body;
      const ci = conf.itens.find((i: any) => i.chave === 'CONTROLE_INTERNO');
      expect(ci).toMatchObject({ estado: 'ALERTA', bloqueia: false, acao: 'ABRIR_CONTROLE_INTERNO' });
      expect(conf.itens.find((i: any) => i.chave === 'ETAPAS')).toMatchObject({ estado: 'PENDENTE', bloqueia: true });
      for (const t of ['MCI', 'AA']) expect([t, (await anexar(lic, t, agenteA.token)).status]).toEqual([t, 201]);
      expect((await naoSeAplica(lic, 'DP', agenteA.token)).status).toBe(201);
      await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(A.token)).expect(200);
      await gerarAvisoDispensa(ctx, lic);
      const t = await conformidade(lic, agenteA.token);
      expect(t.publicacao.controle_interno).toMatchObject({ ativo: true, manifestado: true });
      // DISP-01: sem lances num órgão cujo regulamento adota a IN 67 → ATENÇÃO, não bloqueia
      const disp = t.achados.find((a: any) => a.regra === 'DISP-01');
      expect(disp).toMatchObject({ severidade: 'ATENCAO', exige_justificativa: false });
      expect(t.publicar.pode).toBe(true);
    });

    it('publica (sem lances, controle interno manifestado) e o registro no Diário Oficial confirma a divulgação: etapa 8 e tarefa concluídas', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(agenteA.token)).send(corpoDivulgacao(fimPropostasSugerido()));
      expect(r.status).toBe(200);
      expect(r.body.fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
      expect((await tarefaPublicacao(lic)).status).toBe('ABERTA');
      const q = (await http().get(`/api/fase-interna/${lic.id}/publicacao`).set(bearer(agenteA.token)).expect(200)).body;
      expect(q.diario_oficial).toMatchObject({ pode_registrar: true, confirma_divulgacao: true });
      expect(q.canais[0].situacao).toMatch(/sem integração/);

      const d = await http()
        .post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`)
        .set(bearer(agenteA.token))
        .field('numero_edicao', 'nº 3.100')
        .field('data_publicacao', hoje())
        .field('pagina', '4');
      expect(d.status).toBe(201);
      expect(d.body.confirmou_divulgacao).toBe(true);
      const [l] = await sql(`SELECT fase::text AS fase, meio_divulgacao_oficial, referencia_divulgacao_oficial, dispensa_com_lances FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.fase).not.toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
      expect(l).toMatchObject({ meio_divulgacao_oficial: 'DIARIO_OFICIAL', referencia_divulgacao_oficial: 'Diário Oficial nº 3.100, p. 4', dispensa_com_lances: false });
      expect((await passoPublicacao(lic, agenteA.token)).situacao).toBe('CONCLUIDO');
      expect((await tarefaPublicacao(lic)).status).toBe('CONCLUIDA');
      expect(d.body.publicacao.etapa8.situacao).toBe('CONCLUIDA');
      // sem anexo: a peça existe sem folhas (não há página a numerar)
      const [doc] = await sql(`SELECT folha_inicial, caminho_arquivo FROM documentos_fase_interna WHERE id = $1`, [d.body.documento_id]);
      expect(doc).toMatchObject({ folha_inicial: null, caminho_arquivo: null });
    });
  });

  // ==========================================================================
  describe('G. isolamento dos endpoints novos', () => {
    let lic: LicitacaoFixture;
    beforeAll(async () => {
      lic = await criarDispensaPublicada(ctx, A, { confirmar: false });
    });

    it('GET /fase-interna/:id/publicacao — outro órgão 404, fornecedor 403, anônimo 401', async () => {
      await http().get(`/api/fase-interna/${lic.id}/publicacao`).set(bearer(A.token)).expect(200);
      await http().get(`/api/fase-interna/${lic.id}/publicacao`).set(bearer(B.token)).expect(404);
      await http().get(`/api/fase-interna/${lic.id}/publicacao`).set(bearer(F1.token)).expect(403);
      await http().get(`/api/fase-interna/${lic.id}/publicacao`).expect(401);
    });

    it('POST /fase-interna/:id/publicacao/diario-oficial — outro órgão 403, fornecedor 403, anônimo 401 (nada gravado)', async () => {
      const corpo = (req: any) => req.field('numero_edicao', 'nº 9').field('data_publicacao', hoje());
      expect((await corpo(http().post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`).set(bearer(B.token)))).status).toBe(403);
      expect((await corpo(http().post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`).set(bearer(F1.token)))).status).toBe(403);
      expect((await corpo(http().post(`/api/fase-interna/${lic.id}/publicacao/diario-oficial`))).status).toBe(401);
      const [{ n }] = await sql(`SELECT COUNT(*)::int AS n FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo = 'PDO'`, [lic.id]);
      expect(n).toBe(0);
    });

    it('PUT /fase-interna/:id/modo-disputa — outro órgão 403, fornecedor 403, anônimo 401 (nada gravado)', async () => {
      const outra = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await http().put(`/api/fase-interna/${outra.id}/modo-disputa`).set(bearer(B.token)).send({ com_lances: false })).status).toBe(403);
      expect((await http().put(`/api/fase-interna/${outra.id}/modo-disputa`).set(bearer(F1.token)).send({ com_lances: false })).status).toBe(403);
      expect((await http().put(`/api/fase-interna/${outra.id}/modo-disputa`).send({ com_lances: false })).status).toBe(401);
      const [l] = await sql(`SELECT dispensa_com_lances FROM licitacoes WHERE id = $1`, [outra.id]);
      expect(l.dispensa_com_lances).toBeNull();
    });

    it('a configuração do modo é do órgão do token (B não muda a de A)', async () => {
      const antes = (await http().get('/api/fase-interna/configuracao').set(bearer(A.token)).expect(200)).body.dispensa_com_lances;
      await configurar(B, { dispensa_com_lances: !antes }).expect(200);
      expect((await http().get('/api/fase-interna/configuracao').set(bearer(A.token)).expect(200)).body.dispensa_com_lances).toBe(antes);
      expect((await http().put('/api/fase-interna/configuracao').set(bearer(F1.token)).send({ dispensa_com_lances: false })).status).toBe(403);
      expect((await http().put('/api/fase-interna/configuracao').send({ dispensa_com_lances: false })).status).toBe(401);
    });
  });
});
