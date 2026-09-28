/**
 * FASE INTERNA — ENTREGA 4 (motor de conformidade e portões A, B e C).
 * docs/licitacao/PLANO-FASE-INTERNA.md §11.
 *
 *  A. Portão C: PUBLICAR é recusado com achado BLOQUEIO aberto (VINC-01 lido
 *     do PDF anexado da minuta do contrato — o "PA 115/2025" do caso real),
 *     com o que falta e onde (peça e folha); o achado cria a TAREFA do
 *     responsável pela peça; corrigida a peça (versão nova), o achado se
 *     resolve sozinho, a tarefa conclui e a publicação passa.
 *  B. ATENÇÃO que exige justificativa (marca "similar ou superior ao ARION"
 *     no ETP anexado) segura a publicação até ser JUSTIFICADO; a
 *     justificativa vai para os autos; bloqueio não se justifica (409).
 *  C. Portão A: LIM-01 (soma das dispensas do órgão no ramo acima do limite
 *     do art. 75, II) recusa CONCLUIR_PESQUISA_PRECOS e a emissão do mapa, e
 *     segura a etapa da pesquisa; reduzido o valor, libera (LIM-02 ATENÇÃO).
 *  D. Portão B: sem o art. 72, I, II e IV completos não se anexa, não se envia
 *     e não se assina o despacho de autorização.
 *  E. EXERC-01: reserva de um exercício e publicação no seguinte → tarefa da
 *     Contabilidade (renovar a dotação), concluída quando o achado se resolve.
 *  F. Processo já publicado não é travado (o portão vale para o ato que ainda
 *     vai ser praticado): a conferência fica congelada, os atos seguem.
 *  G. Isolamento de todos os endpoints novos (outro órgão 404/403, fornecedor
 *     403, anônimo 401; achado de outro processo 404).
 *  Sem migração de boot (tabelas novas pelo synchronize; nada a converter).
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  confirmarDivulgacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  gerarAvisoDispensa,
  gerarCnpj,
  pdfDeTeste,
  cumprirEtapasAnteriores,
} from './support';
import { corpoDivulgacao, criarDocumentoInstrucao, fimPropostasSugerido } from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from '../src/fase-interna/entities/documento-fase-interna.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { MinutasSubscriber } from '../src/fase-interna/telas/minutas.subscriber';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe('Fase interna — Entrega 4 (motor de conformidade e portões A, B e C)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = async () => {
    await ctx.app.get(MinutasSubscriber).aguardarPendentes();
    await ctx.app.get(TarefasService).aguardarPendentes();
  };
  const anexar = (lic: { id: string }, tipo: string, token: string, texto?: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(texto ?? `Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Não se aplica a esta contratação direta (art. 72).' });
  const conformidade = async (lic: { id: string }, token = agente.token) => {
    await esperar();
    return (await http().get(`/api/fase-interna/${lic.id}/conformidade`).set(bearer(token)).expect(200)).body;
  };
  /**
   * Art. 72, I, II e IV completos (portão B) e o que é "se for o caso" decidido — NA ORDEM DO FLUXO
   * (homologação multiusuário; art. 53, §4º): demanda → ETP/TR/pesquisa → reserva → minutas → parecer →
   * autorização. DFD, estimativa, informação orçamentária (art. 72, IV não admite "não se aplica") e autorização
   * anexadas; as demais anexadas quando informadas, senão "não se aplica".
   */
  const instruir = async (lic: { id: string }, token: string, anexos: Record<string, string> = {}) => {
    for (const t of ['DFD', 'PP', 'ETP', 'AR', 'TR', 'DO', 'RAG', 'ME', 'MC', 'JC', 'PJ', 'AA', 'DP']) {
      const status = ['DFD', 'PP', 'DO', 'AA'].includes(t) || anexos[t] ? (await anexar(lic, t, token, anexos[t])).status : (await naoSeAplica(lic, t, token)).status;
      expect([t, status]).toEqual([t, 201]);
    }
  };
  const publicar = (lic: LicitacaoFixture) => http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(A.token)).send(corpoDivulgacao(fimPropostasSugerido()));
  const prepararPublicacao = async (lic: LicitacaoFixture) => {
    await http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(A.token)).expect(200);
    await gerarAvisoDispensa(ctx, lic);
  };

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara E4 A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E4 B' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. portão C: BLOQUEIO aberto impede publicar; corrigido, libera (tarefa do achado)', () => {
    let lic: LicitacaoFixture;
    let achadoId: string;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await sql(`UPDATE licitacoes SET numero_processo = '777/2026', numero_edital = '031/2026' WHERE id = $1`, [lic.id]);
      // a minuta do contrato feita fora herdou a vinculação de OUTRO processo (caso real do PA 139/2025)
      await instruir(lic, agente.token, { MC: 'Minuta do contrato vinculada ao PA 115/2025 Dispensa 025/2025' });
      await prepararPublicacao(lic);
    });

    it('a revisão lê o PDF anexado: VINC-01 BLOQUEIO com a peça, a folha e o trecho', async () => {
      const t = await conformidade(lic);
      expect(t.aplicavel).toBe(true);
      const a = t.achados.find((x: any) => x.regra === 'VINC-01');
      expect(a).toMatchObject({ severidade: 'BLOQUEIO', status: 'ABERTO', pode_justificar: false });
      expect(a.mensagem).toMatch(/PA nº 115\/2025.*não é este processo \(PA 777\/2026/);
      expect(a.evidencias[0]).toMatchObject({ tipo: 'MC', folha: expect.any(Number), trecho: expect.stringMatching(/115\/2025/) });
      expect(a.acao).toMatchObject({ tipo: 'CORRIGIR_PECA', destino: `/orgao/processos/${lic.id}/fase-interna/minutas` });
      expect(t.contagem.bloqueios).toBe(1);
      expect(t.publicar).toMatchObject({ pode: false, rotulo: 'Publicar — resolva 1 bloqueio' });
      expect(t.aviso.canais.length).toBeGreaterThan(0);
      expect(t.autos.map((x: any) => x.tipo)).toEqual(expect.arrayContaining(['DFD', 'PP', 'AA', 'MC']));
      expect(t.revisao).toMatchObject({ origem: expect.any(String) });
      achadoId = a.id;
    });

    it('o achado BLOQUEIO cria a tarefa (origem ACHADO) do responsável pela peça; a caixa leva à conformidade', async () => {
      const [t] = await sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 AND chave = $2`, [lic.id, `achado:${achadoId}`]);
      expect(t).toMatchObject({ status: 'ABERTA', origem: 'ACHADO', tipo: 'ACHADO', origem_id: achadoId, passo: 'MINUTAS', tipo_peca: 'MC', responsavel_usuario_id: agente.id });
      const cx = (await http().get('/api/tarefas?aba=para-mim').set(bearer(agente.token)).expect(200)).body;
      expect(cx.tarefas.find((x: any) => x.id === t.id).destino).toBe(`/orgao/processos/${lic.id}/fase-interna/conformidade#achado-${achadoId}`);
      const resumo = (await http().get(`/api/fase-interna/${lic.id}/conformidade/resumo`).set(bearer(agente.token)).expect(200)).body;
      expect(resumo).toMatchObject({ aplicavel: true, bloqueios: 1, impedem_publicar: 1 });
    });

    it('bloqueio não se justifica (409); a pré-publicação mostra a linha da conformidade', async () => {
      const r = await http().post(`/api/fase-interna/${lic.id}/conformidade/achados/${achadoId}/justificar`).set(bearer(agente.token)).send({ justificativa: 'Tentativa de justificar um bloqueio — não pode.' });
      expect(r.status).toBe(409);
      const conf = (await http().get(`/api/licitacoes/${lic.id}/conferencia-publicacao`).set(bearer(A.token)).expect(200)).body;
      expect(conf.itens.find((i: any) => i.chave === 'CONFORMIDADE')).toMatchObject({ estado: 'PENDENTE', bloqueia: true, acao: 'ABRIR_CONFORMIDADE' });
      expect(conf.pode_publicar).toBe(false);
    });

    it('PUBLICAR é recusado: o que falta e onde (peça e folha)', async () => {
      const r = await publicar(lic);
      expect(r.status).toBe(400);
      const pend = (r.body.pendencias ?? [r.body.message]).join(' ');
      expect(pend).toMatch(/Trava da lei \(publicar\) — VINC-01: Minuta do contrato cita PA nº 115\/2025/);
      expect(pend).toMatch(/\[Minuta do contrato, fl\. \d+\]/);
      const [l] = await sql(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.fase).toBe(FaseLicitacao.APROVACAO_INTERNA);
    });

    it('corrigida a minuta (versão nova), o achado se resolve sozinho, a tarefa conclui e a publicação passa', async () => {
      expect((await anexar(lic, 'MC', agente.token, 'Minuta do contrato vinculada ao PA 777/2026 Dispensa 031/2026')).status).toBe(201);
      const t = await conformidade(lic);
      expect(t.achados.some((x: any) => x.regra === 'VINC-01')).toBe(false);
      const resolvido = t.resolvidos.find((x: any) => x.id === achadoId);
      expect(resolvido).toMatchObject({ status: 'RESOLVIDO', motivo_resolucao: expect.stringMatching(/Deixou de ocorrer/) });
      expect(resolvido.historico.map((h: any) => h.acao)).toEqual(['DETECTADO', 'RESOLVIDO']);
      expect(t.publicar.pode).toBe(true);
      const [tarefa] = await sql(`SELECT status FROM tarefas WHERE licitacao_id = $1 AND chave = $2`, [lic.id, `achado:${achadoId}`]);
      expect(tarefa.status).toBe('CONCLUIDA');
      // idempotente: revisar de novo não muda nada
      const antes = await sql(`SELECT id, status, updated_at FROM achados_conformidade WHERE licitacao_id = $1 ORDER BY id`, [lic.id]);
      await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201);
      const depois = await sql(`SELECT id, status, updated_at FROM achados_conformidade WHERE licitacao_id = $1 ORDER BY id`, [lic.id]);
      expect(depois).toEqual(antes);
      const pub = await publicar(lic);
      expect(pub.status).toBe(200);
      expect(pub.body.fase).toBe(FaseLicitacao.AGUARDANDO_DIVULGACAO);
    });

    it('F. processo já publicado não é travado: a conferência fica congelada e os atos seguem', async () => {
      // o número muda depois da publicação: a minuta passaria a divergir — mas o portão já passou
      await sql(`UPDATE licitacoes SET numero_processo = '888/2026' WHERE id = $1`, [lic.id]);
      await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201);
      const t = await conformidade(lic);
      expect(t).toMatchObject({ aplicavel: false, publicar: { pode: false } });
      expect(t.motivo).toMatch(/já foi divulgado/);
      expect(t.achados.filter((x: any) => x.status === 'ABERTO' && x.severidade === 'BLOQUEIO')).toEqual([]);
      const confirmada = await confirmarDivulgacao(ctx, lic);
      expect([FaseLicitacao.PUBLICADO, FaseLicitacao.ACOLHIMENTO_PROPOSTAS]).toContain(confirmada.fase);
    });
  });

  // ==========================================================================
  describe('B. ATENÇÃO com justificativa obrigatória (marca como referência) — justificado, libera', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await instruir(lic, agente.token, { ETP: 'A solucao devera ser similar ou superior ao ARION SNEWS para a TV' });
      await prepararPublicacao(lic);
    });

    it('MARCA-01 ATENÇÃO exige justificativa: publicar é recusado até justificar', async () => {
      const t = await conformidade(lic);
      const a = t.achados.find((x: any) => x.regra === 'MARCA-01');
      expect(a).toMatchObject({ severidade: 'ATENCAO', exige_justificativa: true, pode_justificar: true, status: 'ABERTO' });
      expect(a.evidencias[0]).toMatchObject({ tipo: 'ETP' });
      expect(t.contagem).toMatchObject({ bloqueios: 0, impedem_publicar: 1 });
      const r = await publicar(lic);
      expect(r.status).toBe(400);
      expect((r.body.pendencias ?? [r.body.message]).join(' ')).toMatch(/MARCA-01 \(justificativa obrigatória\)/);
      // não há tarefa para ATENÇÃO
      const [n] = await sql(`SELECT COUNT(*)::int AS n FROM tarefas WHERE licitacao_id = $1 AND origem = 'ACHADO'`, [lic.id]);
      expect(n.n).toBe(0);
    });

    it('justificativa curta 400; justificada, vai para os autos e a publicação passa', async () => {
      const t0 = await conformidade(lic);
      const a = t0.achados.find((x: any) => x.regra === 'MARCA-01');
      const url = `/api/fase-interna/${lic.id}/conformidade/achados/${a.id}/justificar`;
      expect((await http().post(url).set(bearer(agente.token)).send({ justificativa: 'curta' })).status).toBe(400);
      const texto = 'Padronização com o acervo e o fluxo de redação já instalados na TV Câmara (art. 41, I, b).';
      const t = (await http().post(url).set(bearer(agente.token)).send({ justificativa: texto }).expect(201)).body;
      const j = t.achados.find((x: any) => x.id === a.id);
      expect(j).toMatchObject({ status: 'JUSTIFICADO', justificativa: texto, justificado_por_nome: 'Ana Agente' });
      expect(t.justificativas).toEqual([expect.objectContaining({ regra: 'MARCA-01', justificativa: texto })]);
      const [log] = await sql(`SELECT descricao, dados_depois FROM logs_fase_interna WHERE licitacao_id = $1 AND dados_depois->>'conformidade' = 'true'`, [lic.id]);
      expect(log.descricao).toMatch(/justificativa do achado MARCA-01/);
      // continua justificado depois de outra revisão (mesma ocorrência)
      await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201);
      expect((await conformidade(lic)).achados.find((x: any) => x.id === a.id).status).toBe('JUSTIFICADO');
      const pub = await publicar(lic);
      expect(pub.status).toBe(200);
    });
  });

  // ==========================================================================
  describe('C. portão A: LIM-01 (limite do art. 75, II no ramo) segura a pesquisa', () => {
    let X: OrgaoFixture;
    let agenteX: UsuarioOrgaoFixture;
    let l2: LicitacaoFixture;

    beforeAll(async () => {
      X = await criarOrgao(ctx, { nome: 'Câmara E4 X (limite)' });
      agenteX = await criarUsuarioOrgao(ctx, X, { role: RoleUsuario.PREGOEIRO, nome: 'Xavier Agente' });
      await criarLicitacao(ctx, X, ModalidadeLicitacao.DISPENSA_ELETRONICA, { itens: [{ descricao: 'Serviço A', quantidade: 1, valor_unitario_estimado: 40_000 }] });
      l2 = await criarLicitacao(ctx, X, ModalidadeLicitacao.DISPENSA_ELETRONICA, { itens: [{ descricao: 'Serviço B', quantidade: 1, valor_unitario_estimado: 30_000 }], extras: { pregoeiro_id: agenteX.id } });
      // E6 (homologação multiusuário): o ramo é o da classe do catálogo — item sem código não soma com outras dispensas
      await classificar();
      // A pesquisa só anda com a demanda aprovada (ordem do fluxo) — e só então nasce a tarefa do achado
      await cumprirEtapasAnteriores(ctx, l2, 'PESQUISA');
    });
    const classificar = () =>
      sql(`UPDATE itens_licitacao SET classe_catalogo = '0859', tipo_item = 'SERVICO' WHERE licitacao_id IN (SELECT id FROM licitacoes WHERE orgao_id = $1)`, [X.id]);

    it('soma do ramo (R$ 70.000,00) acima do limite: LIM-01 BLOQUEIO com tarefa da pesquisa', async () => {
      const t = await conformidade(l2, X.token);
      const a = t.achados.find((x: any) => x.regra === 'LIM-01');
      expect(a).toMatchObject({ severidade: 'BLOQUEIO', etapa: 'PESQUISA', portao: 'A' });
      expect(a.mensagem).toMatch(/R\$\s?70\.000,00.*2 processo\(s\)/);
      const [tarefa] = await sql(`SELECT passo, status FROM tarefas WHERE licitacao_id = $1 AND chave = $2`, [l2.id, `achado:${a.id}`]);
      expect(tarefa).toMatchObject({ passo: 'PESQUISA', status: 'ABERTA' });
    });

    it('CONCLUIR_PESQUISA_PRECOS recusado; a etapa da pesquisa não conclui (as seguintes não abrem)', async () => {
      await sql(`UPDATE licitacoes SET fase = 'PESQUISA_PRECOS' WHERE id = $1`, [l2.id]);
      const r = await http().post(`/api/licitacoes/${l2.id}/atos/CONCLUIR_PESQUISA_PRECOS`).set(bearer(X.token)).send({});
      expect(r.status).toBe(400);
      expect((r.body.pendencias ?? [r.body.message]).join(' ')).toMatch(/Trava da lei \(concluir a pesquisa\) — LIM-01/);
      // pesquisa feita fora: o mapa anexado não conclui a etapa enquanto o limite estoura
      expect((await anexar(l2, 'PP', X.token)).status).toBe(201);
      await esperar();
      const et = (await http().get(`/api/fase-interna/${l2.id}/etapas`).set(bearer(X.token)).expect(200)).body;
      const passos = et.etapas.flatMap((e: any) => e.passos);
      expect(passos.find((p: any) => p.passo === 'PESQUISA')).toMatchObject({ situacao: 'EM_ANDAMENTO', portao: 'A_LIMITE', bloqueio_portao: [expect.stringMatching(/^LIM-01/)] });
      expect(passos.find((p: any) => p.passo === 'RESERVA').situacao).toBe('AGUARDANDO');
    });

    it('emitir o mapa e a certidão com o valor que estoura o limite: 400 (portão A)', async () => {
      const l3 = await criarLicitacao(ctx, X, ModalidadeLicitacao.DISPENSA_ELETRONICA, { itens: [{ descricao: 'Serviço C', quantidade: 1, valor_unitario_estimado: 1 }] });
      await classificar();
      await cumprirEtapasAnteriores(ctx, l3, 'PESQUISA');
      for (const [f, v] of [['Alfa', 10_000], ['Beta', 11_000], ['Gama', 12_000]] as const) {
        await http()
          .post(`/api/fase-interna/${l3.id}/pesquisa/propostas`)
          .set(bearer(X.token))
          .send({ fornecedor: f, cnpj: gerarCnpj(), data_emissao: hoje(), itens: [{ item_numero: 1, valor_unitario: v }] })
          .expect(201);
      }
      await http()
        .put(`/api/fase-interna/${l3.id}/pesquisa/metodo`)
        .set(bearer(X.token))
        .send({ metodo: 'MENOR', justificativa_metodo: 'Menor valor, conforme o regulamento do órgão.', justificativa_fornecedores: 'Empresas do ramo com atuação comprovada no município.' })
        .expect(200);
      const r = await http().post(`/api/fase-interna/${l3.id}/pesquisa/emitir`).set(bearer(X.token)).send({});
      expect(r.status).toBe(400);
      expect(r.body.portao).toBe('A');
      expect(r.body.pendencias.join(' ')).toMatch(/LIM-01/);
    });

    it('reduzido o valor (pesquisa feita fora): LIM-01 resolve (fica a ATENÇÃO LIM-02), a etapa conclui e o ato passa', async () => {
      await http()
        .put(`/api/fase-interna/${l2.id}/pesquisa/valores-itens`)
        .set(bearer(X.token))
        .send({ itens: [{ item_id: l2.itens[0].id, valor_unitario: 18_000 }] })
        .expect(200);
      // a terceira dispensa (portão A recusou a emissão) não tem valor adotado
      const t = await conformidade(l2, X.token);
      expect(t.achados.some((x: any) => x.regra === 'LIM-01')).toBe(false);
      expect(t.achados.find((x: any) => x.regra === 'LIM-02')).toMatchObject({ severidade: 'ATENCAO' });
      const et = (await http().get(`/api/fase-interna/${l2.id}/etapas`).set(bearer(X.token)).expect(200)).body;
      expect(et.etapas.flatMap((e: any) => e.passos).find((p: any) => p.passo === 'PESQUISA').situacao).toBe('CONCLUIDO');
      expect((await http().post(`/api/licitacoes/${l2.id}/atos/CONCLUIR_PESQUISA_PRECOS`).set(bearer(X.token)).send({})).status).toBe(201);
    });
  });

  // ==========================================================================
  describe('D. portão B: sem o art. 72 completo não se autoriza', () => {
    let lic: LicitacaoFixture;
    let presidente: UsuarioOrgaoFixture;

    beforeAll(async () => {
      presidente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paulo Presidente' });
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('anexar o despacho assinado fora, enviar para a autoridade e o envio genérico para assinatura: recusados antes das etapas anteriores', async () => {
      // Homologação multiusuário: a autorização só começa com as etapas anteriores concluídas (art. 72, I, II
      // e IV; parecer — art. 53, §4º) — a recusa vem antes do portão B, com o que falta
      const r = await anexar(lic, 'AA', agente.token);
      expect(r.status).toBe(403);
      expect(r.body.codigo).toBe('AGUARDANDO_DEMANDA');
      const env = await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({ signatarios: [{ usuario_id: presidente.id, papel: 'Presidente' }] });
      expect(env.status).toBe(403);
      const ass = await http().post(`/api/fase-interna/${lic.id}/documentos/AA/assinatura`).set(bearer(A.token)).send({ signatarios: [{ usuario_id: presidente.id, papel: 'Presidente' }] });
      expect(ass.status).toBe(403);
      const [{ n }] = await sql(`SELECT COUNT(*)::int AS n FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'AA'`, [lic.id]);
      expect(n).toBe(0); // nada gerado
      // com a demanda e a pesquisa, mas sem a reserva e o parecer: ainda não
      await cumprirEtapasAnteriores(ctx, lic, 'PESQUISA', { incluirAlvo: true });
      const r2 = await anexar(lic, 'AA', agente.token);
      expect(r2.status).toBe(403);
      expect(r2.body.codigo).toBe('AGUARDANDO_ETAPAS');
      expect(r2.body.message).toMatch(/Informação orçamentária e reserva/);
      const tela = (await http().get(`/api/fase-interna/${lic.id}/autorizacao`).set(bearer(agente.token)).expect(200)).body;
      expect(tela.portao_b_bloqueios.join(' ')).toMatch(/A72-I/);
    });

    it('com o art. 72, I, II e IV completos (e o parecer), o despacho vai para a autoridade e é assinado', async () => {
      await cumprirEtapasAnteriores(ctx, lic, 'AUTORIZACAO', { token: agente.token });
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({ signatarios: [{ usuario_id: presidente.id, papel: 'Presidente' }] }).expect(201);
      const r = await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(presidente.token)).send({}).expect(201);
      expect(r.body.situacao).toBe('AUTORIZADA');
    });
  });

  // ==========================================================================
  describe('E. EXERC-01: reserva de um exercício e publicação no seguinte → tarefa da Contabilidade', () => {
    it('cria a tarefa "renovar a dotação" (origem ACHADO) e a conclui quando o achado se resolve', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      const ano = Number(hoje().slice(0, 4));
      await sql(`UPDATE licitacoes SET data_publicacao_edital = $2 WHERE id = $1`, [lic.id, `${ano + 1}-01-15 12:00:00`]);
      await sql(
        `INSERT INTO reservas_orcamentarias (orgao_id, licitacao_id, versao, versao_atual, status, exercicio_base, declaracao_adequacao, declaracao_lrf, created_at, updated_at)
         VALUES ($1, $2, 1, true, 'EMITIDA', $3, true, true, now(), now())`,
        [A.id, lic.id, ano],
      );
      const t = (await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201)).body;
      const a = t.achados.find((x: any) => x.regra === 'EXERC-01');
      expect(a).toMatchObject({ severidade: 'ATENCAO', acao: expect.objectContaining({ tipo: 'AGENDAR' }) });
      expect(a.mensagem).toMatch(new RegExp(`reserva é de ${ano}`));
      const [tarefa] = await sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 AND chave = 'sistema:renovar-dotacao'`, [lic.id]);
      expect(tarefa).toMatchObject({ status: 'ABERTA', origem: 'ACHADO', origem_id: a.id, passo: 'RESERVA', tipo_peca: 'DO' });
      // dotação renovada para o exercício da publicação: o achado se resolve e a tarefa conclui
      await sql(`UPDATE reservas_orcamentarias SET exercicio_base = $2, updated_at = now() WHERE licitacao_id = $1`, [lic.id, ano + 1]);
      await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201);
      const [depois] = await sql(`SELECT status FROM tarefas WHERE id = $1`, [tarefa.id]);
      expect(depois.status).toBe('CONCLUIDA');
      const [ach] = await sql(`SELECT status FROM achados_conformidade WHERE id = $1`, [a.id]);
      expect(ach.status).toBe('RESOLVIDO');
    });
  });

  // ==========================================================================
  describe('G. isolamento de todos os endpoints novos', () => {
    let lic: LicitacaoFixture;
    let achadoId: string;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      const t = (await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201)).body;
      achadoId = t.achados[0]?.id;
      expect(achadoId).toBeTruthy();
    });

    it('leitura: outro órgão 404, fornecedor 403, anônimo 401', async () => {
      for (const rota of ['conformidade', 'conformidade/resumo']) {
        expect((await http().get(`/api/fase-interna/${lic.id}/${rota}`).set(bearer(B.token))).status).toBe(404);
        expect((await http().get(`/api/fase-interna/${lic.id}/${rota}`).set(bearer(F.token))).status).toBe(403);
        expect((await http().get(`/api/fase-interna/${lic.id}/${rota}`)).status).toBe(401);
      }
    });

    it('escrita: outro órgão 403, fornecedor 403, anônimo 401 (nada gravado); achado de outro processo 404', async () => {
      const escritas = ['conformidade/revisar', `conformidade/achados/${achadoId}/justificar`];
      for (const rota of escritas) {
        const url = `/api/fase-interna/${lic.id}/${rota}`;
        const corpo = { justificativa: 'Justificativa de quem não é dono do processo.' };
        expect([rota, (await http().post(url).set(bearer(B.token)).send(corpo)).status]).toEqual([rota, 403]);
        expect([rota, (await http().post(url).set(bearer(F.token)).send(corpo)).status]).toEqual([rota, 403]);
        expect([rota, (await http().post(url).send(corpo)).status]).toEqual([rota, 401]);
      }
      const [a] = await sql(`SELECT status, justificativa FROM achados_conformidade WHERE id = $1`, [achadoId]);
      expect(a).toMatchObject({ status: 'ABERTO', justificativa: null });
      // achado de um processo usado na rota de outro (mesmo órgão): 404
      const outro = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const r = await http().post(`/api/fase-interna/${outro.id}/conformidade/achados/${achadoId}/justificar`).set(bearer(A.token)).send({ justificativa: 'Justificativa suficientemente longa para passar.' });
      expect(r.status).toBe(404);
      // o órgão B não vê achados de A pela própria rota
      const licB = await criarLicitacao(ctx, B, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const tb = (await http().get(`/api/fase-interna/${licB.id}/conformidade`).set(bearer(B.token)).expect(200)).body;
      expect(tb.achados.every((x: any) => x.id !== achadoId)).toBe(true);
    });
  });
});
