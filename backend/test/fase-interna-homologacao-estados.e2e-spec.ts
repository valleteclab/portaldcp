/**
 * FASE INTERNA — correções da HOMOLOGAÇÃO de 26/09/2026 (estado das peças e
 * das etapas, conformidade, autorização). docs/fase interna/relatorio-homologacao-portaldcp.md.
 *
 *  A. E4 — peça feita aqui só é PRONTA depois de gerada/emitida: o rascunho
 *     salvo automaticamente é "em elaboração" (DFD, pesquisa antes do mapa,
 *     peças do editor); editar depois de gerar volta a "em elaboração";
 *     "Gerar documento" (POST …/documentos/:tipo/emitir) para as peças sem
 *     ato próprio; a pesquisa com 3 fornecedores e 2 itens conta 3 propostas.
 *  B. Dados existentes: migração de boot marca como emitidas as peças que já
 *     contavam (regra anterior) em processo JÁ DIVULGADO; na fase interna,
 *     rascunho continua rascunho. Idempotente (2x).
 *  C. E6 — contagens da conformidade de UMA fonte (motor): o checklist de
 *     pré-publicação e o quadro do processo mostram o mesmo número; "Revisar
 *     agora" atualiza a última revisão (manual, com o horário novo).
 *  D. A72-VI/VII — na dispensa eletrônica não acusam falta antes de publicar
 *     ("cumprido após a seleção do fornecedor", art. 75, §3º); na
 *     inexigibilidade (sem aviso) são exigidos ANTES da autorização (portão B),
 *     com mensagem clara.
 *  E. Autorização — depois de autorizada, "regerar" é recusado (409) e só o
 *     fluxo explícito de nova autorização (com motivo) cria versão nova;
 *     trocar com/sem lances NÃO desatualiza o despacho (art. 75, §3º).
 *  F. Isolamento do endpoint novo (…/documentos/:tipo/emitir).
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  gerarCnpj,
  pdfDeTeste,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { MinutasSubscriber } from '../src/fase-interna/telas/minutas.subscriber';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';
import { MigracaoPecaEmitidaBootService } from '../src/fase-interna/migracao-peca-emitida-boot.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const esperarMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Fase interna — correções da homologação (estados, conformidade, autorização)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let presidente: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = async () => {
    await ctx.app.get(MinutasSubscriber).aguardarPendentes();
    await ctx.app.get(TarefasService).aguardarPendentes();
  };
  const statusDa = async (lic: { id: string }, tipo: string) => {
    await esperar();
    const r = (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(agente.token)).expect(200)).body;
    return r.itens.find((i: any) => i.tipo === tipo)?.status;
  };
  const passo = async (lic: { id: string }, p: string) => {
    await esperar();
    const r = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(agente.token)).expect(200)).body;
    return r.etapas.flatMap((e: any) => e.passos).find((x: any) => x.passo === p)?.situacao;
  };
  const anexar = (lic: { id: string }, tipo: string, token = agente.token, texto?: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(texto ?? `Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token = agente.token) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Não se aplica a esta contratação direta (art. 72).' });

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara Homologação A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Homologação B' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
    presidente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paulo Presidente' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. E4 — a peça só fica pronta gerada/emitida (rascunho = em elaboração)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('DFD: o salvamento automático (necessidade, responsável) NÃO deixa a peça pronta; a etapa segue aberta', async () => {
      await http()
        .put(`/api/fase-interna/${lic.id}/dfd`)
        .set(bearer(agente.token))
        .send({ responsavel_id: agente.id, data_pretendida: somarDias(hoje(), 30), necessidade_html: '<p>As rotinas usam ferramentas fragmentadas e sem rastreabilidade.</p>' })
        .expect(200);
      expect(await statusDa(lic, 'DFD')).toBe('EM_ELABORACAO');
      expect(await passo(lic, 'DFD')).not.toBe('CONCLUIDO');
      const [t] = await sql(`SELECT status FROM tarefas WHERE licitacao_id = $1 AND passo = 'DFD' ORDER BY created_at DESC LIMIT 1`, [lic.id]);
      expect(t.status).toBe('ABERTA');
    });

    it('DFD gerado: pronta (a etapa conclui); editar depois volta a "em elaboração"; gerar de novo, pronta', async () => {
      await http().post(`/api/fase-interna/${lic.id}/documentos/DFD/gerar`).set(bearer(agente.token)).expect(201);
      expect(await statusDa(lic, 'DFD')).toBe('OK');
      expect(await passo(lic, 'DFD')).toBe('CONCLUIDO');
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/DFD/secao/demanda`)
        .set(bearer(agente.token))
        .send({ html: '<p>Necessidade revista depois da geração.</p>' })
        .expect(200);
      expect(await statusDa(lic, 'DFD')).toBe('EM_ELABORACAO');
      expect(await passo(lic, 'DFD')).not.toBe('CONCLUIDO');
      await http().post(`/api/fase-interna/${lic.id}/documentos/DFD/gerar`).set(bearer(agente.token)).expect(201);
      expect(await statusDa(lic, 'DFD')).toBe('OK');
    });

    it('pesquisa: 3 fornecedores com 2 itens contam 3 propostas (não 6); com cotações e sem o mapa, "em elaboração"; com o mapa, pronta', async () => {
      const propor = (fornecedor: string, v1: number, v2: number) =>
        http()
          .post(`/api/fase-interna/${lic.id}/pesquisa/propostas`)
          .set(bearer(agente.token))
          .send({ fornecedor, cnpj: gerarCnpj(), data_emissao: hoje(), validade_ate: somarDias(hoje(), 60), itens: [{ item_numero: 1, valor_unitario: v1 }, { item_numero: 2, valor_unitario: v2 }] })
          .expect(201);
      await propor('Fornecedor A Ltda', 90, 45);
      await propor('Fornecedor B Ltda', 100, 50);
      const r = (await propor('Fornecedor C Ltda', 110, 55)).body;
      const iv = r.parametros.find((p: any) => p.inciso === 'IV');
      expect(iv.evidencia_resumo).toMatch(/· 3 propostas/);
      expect(iv.evidencia_resumo).not.toMatch(/6 propostas/);
      expect(r.propostas).toHaveLength(3);
      expect(await statusDa(lic, 'PP')).toBe('EM_ELABORACAO');
      expect(await passo(lic, 'PESQUISA')).not.toBe('CONCLUIDO');

      await http()
        .put(`/api/fase-interna/${lic.id}/pesquisa/metodo`)
        .set(bearer(agente.token))
        .send({ metodo: 'MENOR', justificativa_metodo: 'Menor valor, conforme o regulamento do órgão.', justificativa_fornecedores: 'Empresas do ramo com atuação comprovada no município.' })
        .expect(200);
      expect(await statusDa(lic, 'PP')).toBe('EM_ELABORACAO');
      await http().post(`/api/fase-interna/${lic.id}/pesquisa/emitir`).set(bearer(agente.token)).send({}).expect(201);
      expect(await statusDa(lic, 'PP')).toBe('OK');
      expect(await passo(lic, 'PESQUISA')).toBe('CONCLUIDO');
    });

    it('peça do editor (justificativa): rascunho não conta; "Gerar documento" emite; peças com ato próprio recusam o genérico', async () => {
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/JC/secao/justificativa`)
        .set(bearer(agente.token))
        .send({ html: '<p>Contratação direta de pequeno valor (art. 75, II).</p>' })
        .expect(200);
      expect(await statusDa(lic, 'JC')).toBe('EM_ELABORACAO');
      for (const tipo of ['PP', 'DO', 'AA', 'PJ']) {
        const r = await http().post(`/api/fase-interna/${lic.id}/documentos/${tipo}/emitir`).set(bearer(agente.token));
        expect(r.status).toBe(400);
      }
      const e = await http().post(`/api/fase-interna/${lic.id}/documentos/JC/emitir`).set(bearer(agente.token)).expect(201);
      expect(e.body.emitido).toMatchObject({ impressao: expect.any(String), por_id: agente.id });
      expect(await statusDa(lic, 'JC')).toBe('OK');
      // peça vazia não se emite; peça anexada já é o documento
      expect((await http().post(`/api/fase-interna/${lic.id}/documentos/MC/emitir`).set(bearer(agente.token))).status).toBe(404);
    });

    it('API de registro com o conteúdo final (POST …/documento com texto) gera o documento: conta como pronta', async () => {
      await http().post(`/api/fase-interna/${lic.id}/documento`).set(bearer(A.token)).send({ tipo: 'DP', titulo: 'Designação', descricao: 'Portaria 12/2026 designa a agente.' }).expect(201);
      expect(await statusDa(lic, 'DP')).toBe('OK');
    });
  });

  // ==========================================================================
  describe('B. dados existentes: migração de boot (não "despronta" o que já foi divulgado)', () => {
    it('processo divulgado: peça só com texto recebe o registro de emissão (legado) e continua pronta; fase interna: rascunho continua rascunho; 2x idempotente', async () => {
      const divulgado = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const interno = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      const inserir = (licId: string) =>
        sql(
          `INSERT INTO documentos_fase_interna (licitacao_id, tipo, titulo, descricao, dados_estruturados, status, origem, versao, versao_atual, obrigatorio)
           VALUES ($1, 'JC', 'Justificativa', '<p>Texto antigo</p>', '{"justificativa":"<p>Texto antigo</p>"}'::jsonb, 'EM_ELABORACAO', 'INTERNO', 1, true, false)
           RETURNING id::text AS id`,
          [licId],
        );
      const [{ id: docDivulgado }] = await inserir(divulgado.id);
      const [{ id: docInterno }] = await inserir(interno.id);
      await sql(`UPDATE licitacoes SET fase = 'PUBLICADO' WHERE id = $1`, [divulgado.id]);

      const mig = ctx.app.get(MigracaoPecaEmitidaBootService);
      const r1 = await mig.executarMigracao();
      expect(r1.marcadas).toBeGreaterThanOrEqual(1);
      const [d1] = await sql(`SELECT dados_estruturados FROM documentos_fase_interna WHERE id = $1`, [docDivulgado]);
      expect(d1.dados_estruturados._emitido).toMatchObject({ legado: true });
      const [i1] = await sql(`SELECT dados_estruturados FROM documentos_fase_interna WHERE id = $1`, [docInterno]);
      expect(i1.dados_estruturados._emitido).toBeUndefined();
      const inst = (await http().get(`/api/fase-interna/${divulgado.id}/instrucao`).set(bearer(A.token)).expect(200)).body;
      expect(inst.itens.find((i: any) => i.tipo === 'JC').status).toBe('OK');
      expect((await http().get(`/api/fase-interna/${interno.id}/instrucao`).set(bearer(A.token)).expect(200)).body.itens.find((i: any) => i.tipo === 'JC').status).toBe('EM_ELABORACAO');
      // segunda execução: nada muda
      const antes = JSON.stringify(d1.dados_estruturados);
      await mig.executarMigracao();
      const [d2] = await sql(`SELECT dados_estruturados FROM documentos_fase_interna WHERE id = $1`, [docDivulgado]);
      expect(JSON.stringify(d2.dados_estruturados)).toBe(antes);
    });
  });

  // ==========================================================================
  describe('C. E6 — contagens da conformidade de uma fonte só; "Revisar agora"', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('processo recém-criado: o checklist de pré-publicação mostra os MESMOS bloqueios do quadro "Fluxo" (art. 72 e autorização)', async () => {
      const resumo = (await http().get(`/api/fase-interna/${lic.id}/conformidade/resumo`).set(bearer(agente.token)).expect(200)).body;
      expect(resumo.bloqueios).toBeGreaterThan(0);
      expect(resumo.bloqueios_por_portao.B).toBeGreaterThan(0);
      const conf = (await http().get(`/api/licitacoes/${lic.id}/conferencia-publicacao`).set(bearer(A.token)).expect(200)).body;
      const linha = conf.itens.find((i: any) => i.chave === 'CONFORMIDADE');
      expect(linha.detalhe).not.toMatch(/Nenhum bloqueio/);
      expect(linha.detalhe).toMatch(new RegExp(`^${resumo.bloqueios} bloqueios? abertos? na conformidade`));
      expect(linha).toMatchObject({ estado: 'ALERTA', acao: 'ABRIR_CONFORMIDADE' });
      const tela = (await http().get(`/api/fase-interna/${lic.id}/conformidade`).set(bearer(agente.token)).expect(200)).body;
      expect(tela.contagem.bloqueios).toBe(resumo.bloqueios);
    });

    it('"Revisar agora": a última revisão passa a ser a manual, com o horário novo', async () => {
      const t0 = (await http().get(`/api/fase-interna/${lic.id}/conformidade`).set(bearer(agente.token)).expect(200)).body;
      await esperarMs(1100);
      const t1 = (await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201)).body;
      expect(t1.revisao).toMatchObject({ origem: 'MANUAL', por_nome: 'Ana Agente' });
      expect(new Date(t1.revisao.em).getTime()).toBeGreaterThan(new Date(t0.revisao.em).getTime());
      await esperar();
      const t2 = (await http().get(`/api/fase-interna/${lic.id}/conformidade`).set(bearer(agente.token)).expect(200)).body;
      expect(t2.revisao).toMatchObject({ origem: 'MANUAL', em: t1.revisao.em });
    });
  });

  // ==========================================================================
  describe('D. A72-VI/VII — escolha do contratado e preço (art. 72, VI e VII)', () => {
    it('dispensa eletrônica: antes de publicar não acusa falta — "cumprido após a seleção do fornecedor" (art. 75, §3º)', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      const t = (await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201)).body;
      expect(t.achados.some((a: any) => a.regra === 'A72-VI' || a.regra === 'A72-VII')).toBe(false);
      for (const codigo of ['A72-VI', 'A72-VII']) {
        const r = t.regras.find((x: any) => x.codigo === codigo);
        expect(r).toMatchObject({ situacao: 'NAO_SE_APLICA', portao: 'B' });
        expect(r.motivo).toMatch(/após a seleção do fornecedor/);
      }
    });

    it('inexigibilidade (sem aviso): sem relatório/justificativa com a escolha e o preço, a autorização é recusada com mensagem clara; com o relatório, vai', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.INEXIGIBILIDADE, { extras: { pregoeiro_id: agente.id } });
      for (const t of ['DFD', 'PP']) expect((await anexar(lic, t)).status).toBe(201);
      for (const t of ['ETP', 'AR', 'TR', 'DO']) expect((await naoSeAplica(lic, t)).status).toBe(201);
      const barrado = await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({ signatarios: [{ usuario_id: presidente.id, papel: 'Presidente' }] });
      expect(barrado.status).toBe(400);
      expect(barrado.body.portao).toBe('B');
      const txt = barrado.body.pendencias.join(' ');
      expect(txt).toMatch(/A72-VI: Art\. 72, VI — Razão da escolha do contratado: falta a razão da escolha do contratado/);
      expect(txt).toMatch(/A72-VII: .*justificativa do preço \(art\. 23, §4º\)/);
      expect(txt).toMatch(/inexigibilidade/);
      // "não se aplica" não supre os incisos VI e VII
      expect((await naoSeAplica(lic, 'JC')).status).toBe(201);
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({ signatarios: [{ usuario_id: presidente.id, papel: 'Presidente' }] })).status).toBe(400);
      expect((await anexar(lic, 'RAG', agente.token, 'Relatorio do agente: fornecedor exclusivo; preco conforme contratacoes anteriores')).status).toBe(201);
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({ signatarios: [{ usuario_id: presidente.id, papel: 'Presidente' }] }).expect(201);
    });
  });

  // ==========================================================================
  describe('E. autorização: regerar bloqueado depois de autorizada; com/sem lances não desatualiza o despacho', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      for (const t of ['DFD', 'PP']) expect((await anexar(lic, t)).status).toBe(201);
      for (const t of ['ETP', 'AR', 'TR', 'DO']) expect((await naoSeAplica(lic, t)).status).toBe(201);
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/gerar`).set(bearer(agente.token)).send({}).expect(201);
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({ signatarios: [{ usuario_id: presidente.id, papel: 'Presidente' }] }).expect(201);
      const r = await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(presidente.token)).send({}).expect(201);
      expect(r.body.situacao).toBe('AUTORIZADA');
    });

    it('autorizada: a tela diz que não se regera; "regerar" é recusado (409); nada muda', async () => {
      const tela = (await http().get(`/api/fase-interna/${lic.id}/autorizacao`).set(bearer(agente.token)).expect(200)).body;
      expect(tela.regerar).toMatchObject({ permitido: false, nova_autorizacao: true, motivo: expect.stringMatching(/Nova autorização/) });
      const r = await http().post(`/api/fase-interna/${lic.id}/autorizacao/gerar`).set(bearer(agente.token)).send({});
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/já foi dada/);
      const [aa] = await sql(`SELECT status::text AS status, versao FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'AA' AND versao_atual`, [lic.id]);
      expect(aa).toMatchObject({ status: 'ASSINADO', versao: 1 });
    });

    it('trocar com/sem lances (escolha do agente — art. 75, §3º) não deixa o despacho assinado "desatualizado"', async () => {
      expect((await naoSeAplica(lic, 'DP')).status).toBe(201); // a etapa 6 é o despacho + a designação
      expect(await passo(lic, 'AUTORIZACAO')).toBe('CONCLUIDO');
      await http().put(`/api/fase-interna/${lic.id}/modo-disputa`).set(bearer(agente.token)).send({ com_lances: false }).expect(200);
      await esperar();
      const tela = (await http().get(`/api/fase-interna/${lic.id}/autorizacao`).set(bearer(agente.token)).expect(200)).body;
      expect(tela.situacao).toBe('AUTORIZADA');
      expect(tela.peca.desatualizada).toBeNull();
      const conf = (await http().post(`/api/fase-interna/${lic.id}/conformidade/revisar`).set(bearer(agente.token)).expect(201)).body;
      expect(conf.achados.some((a: any) => a.regra === 'MINUTA-DESAT' && a.evidencias.some((e: any) => e.tipo === 'AA'))).toBe(false);
      expect(await passo(lic, 'AUTORIZACAO')).toBe('CONCLUIDO');
    });

    it('nova autorização é o fluxo explícito: exige o motivo; cria versão nova que volta para a autoridade', async () => {
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/gerar`).set(bearer(agente.token)).send({ nova_autorizacao: true, motivo: 'curto' })).status).toBe(400);
      const r = (await http()
        .post(`/api/fase-interna/${lic.id}/autorizacao/gerar`)
        .set(bearer(agente.token))
        .send({ nova_autorizacao: true, motivo: 'O teto mudou depois da nova pesquisa de preços.' })
        .expect(201)).body;
      expect(r.situacao).toBe('EM_ELABORACAO');
      expect(r.peca.versao).toBe(2);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND descricao LIKE 'Nova autorização%' ORDER BY created_at DESC LIMIT 1`, [lic.id]);
      expect(log.descricao).toMatch(/O teto mudou/);
    });
  });

  // ==========================================================================
  describe('F. isolamento do "Gerar documento" (…/documentos/:tipo/emitir)', () => {
    it('outro órgão 403, fornecedor 403, anônimo 401 — e nada é emitido', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await http().patch(`/api/fase-interna/${lic.id}/documentos/JC/secao/justificativa`).set(bearer(A.token)).send({ html: '<p>Rascunho</p>' }).expect(200);
      const url = `/api/fase-interna/${lic.id}/documentos/JC/emitir`;
      expect((await http().post(url).set(bearer(B.token))).status).toBe(403);
      expect((await http().post(url).set(bearer(F.token))).status).toBe(403);
      expect((await http().post(url)).status).toBe(401);
      const [doc] = await sql(`SELECT dados_estruturados, arquivo_pdf_path FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'JC' AND versao_atual`, [lic.id]);
      expect(doc.arquivo_pdf_path).toBeNull();
      expect(doc.dados_estruturados._emitido).toBeUndefined();
    });
  });
});
