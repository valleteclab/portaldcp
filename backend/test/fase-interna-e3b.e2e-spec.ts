/**
 * FASE INTERNA — ENTREGA 3B (autorização no celular, minutas e relatório do
 * agente, parecer com diligências, controle interno opcional).
 * docs/licitacao/PLANO-FASE-INTERNA.md §10.
 *
 *  A. Autorização COLEGIADA (Mesa Diretora, 4 signatários da configuração):
 *     despacho gerado pelo modelo (teto, fundamento, dotação) não conta antes
 *     de assinado; só fica AUTORIZADA na 4ª assinatura; a tarefa da etapa
 *     conclui; quem não é signatário não assina (403).
 *  B. "Devolver com observação": motivo obrigatório, pedido de assinatura
 *     cancelado, despacho devolvido não conta, TAREFA do agente com o motivo;
 *     reenviar conclui a tarefa. Despacho assinado fora (anexo) também vale.
 *  C. Minutas (RAG, ME, MC) lendo o número e o fundamento DO PROCESSO (PA
 *     139/2025 — nunca o "PA 115/2025" de outro); sigilo com justificativa;
 *     mudar o fundamento REGERA as geradas e marca a editada à mão.
 *  D. Parecer (modo por setor): diligência cria a tarefa do responsável pela
 *     peça-alvo; favorável bloqueado com diligência aberta; sanada (peça com
 *     versão nova) volta para a Procuradoria SEM perder a autorização assinada
 *     depois; parecer favorável emitido e assinado pelo JURÍDICO conclui as
 *     tarefas; sem o papel Jurídico: 403.
 *  E. Parecer da fase externa (depois da sessão, antes da adjudicação).
 *  F. Controle interno ativo/inativo.
 *  G. Isolamento em TODOS os endpoints novos: outro órgão (leitura 404 /
 *     escrita 403), fornecedor 403, anônimo 401.
 *  Sem migração de boot nesta entrega (colunas novas nullable; tabelas novas
 *  pelo synchronize; modelos novos pelo seed idempotente já existente).
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
  pdfDeTeste,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { MinutasSubscriber } from '../src/fase-interna/telas/minutas.subscriber';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const PAPEIS_MESA = ['Presidente', 'Vice-Presidente', '1º Secretário', '2º Secretário'];

describe('Fase interna — Entrega 3B (autorização, minutas, parecer, controle interno)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let C: OrgaoFixture; // modo POR_SETOR (parecer)
  let D: OrgaoFixture; // controle interno
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let semPapel: UsuarioOrgaoFixture;
  let mesa: UsuarioOrgaoFixture[];
  let agenteC: UsuarioOrgaoFixture;
  let juridicoC: UsuarioOrgaoFixture;
  let semPapelC: UsuarioOrgaoFixture;
  let presidenteC: UsuarioOrgaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);
  const esperar = async () => {
    await ctx.app.get(MinutasSubscriber).aguardarPendentes();
    await tarefas().aguardarPendentes();
  };
  const tarefasDoProcesso = async (lic: { id: string }) => {
    await esperar();
    return sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 ORDER BY created_at`, [lic.id]);
  };
  const instrucao = async (lic: LicitacaoFixture, token = lic.orgao.token) => (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(token)).expect(200)).body;
  const itemDe = (inst: any, tipo: string) => inst.itens.find((i: any) => i.tipo === tipo);
  const anexar = (lic: { id: string }, tipo: string, token: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(`Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Não se aplica a esta contratação direta (art. 72).' });
  const papeis = (orgao: OrgaoFixture, u: UsuarioOrgaoFixture, lista: string[]) =>
    http().put(`/api/fase-interna/configuracao/usuarios/${u.id}`).set(bearer(orgao.token)).send({ papeis: lista, setor_id: null }).expect(200);

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara E3B A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E3B B' });
    C = await criarOrgao(ctx, { nome: 'Câmara E3B C' });
    D = await criarOrgao(ctx, { nome: 'Câmara E3B D' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Joana Agente' });
    semPapel = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Sem Papel A' });
    mesa = [];
    for (const p of PAPEIS_MESA) mesa.push(await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: `Vereador ${p}` }));
    agenteC = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.PREGOEIRO, nome: 'Caio Agente' });
    juridicoC = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paula Procuradora' });
    semPapelC = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Sem Papel C' });
    presidenteC = await criarUsuarioOrgao(ctx, C, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Presidente C' });
    await papeis(C, juridicoC, ['JURIDICO']);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. autorização colegiada (Mesa Diretora, 4 signatários)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('configuração: signatários da autorização (outro órgão recusado; só admin altera)', async () => {
      const deB = await criarUsuarioOrgao(ctx, B);
      const ruim = await http()
        .put('/api/fase-interna/configuracao')
        .set(bearer(A.token))
        .send({ modo: 'SIMPLES', signatarios_autorizacao: [{ usuario_id: deB.id, papel: 'Presidente' }] });
      expect(ruim.status).toBe(400);
      const corpo = { modo: 'SIMPLES', autoridade_rotulo: 'Mesa Diretora', signatarios_autorizacao: mesa.map((u, i) => ({ usuario_id: u.id, papel: PAPEIS_MESA[i] })) };
      expect((await http().put('/api/fase-interna/configuracao').set(bearer(agente.token)).send(corpo)).status).toBe(403);
      const ok = await http().put('/api/fase-interna/configuracao').set(bearer(A.token)).send(corpo).expect(200);
      expect(ok.body.signatarios_autorizacao).toHaveLength(4);
      expect(ok.body.autoridade_rotulo).toBe('Mesa Diretora');
      // outro PUT sem os campos não apaga os signatários
      const outro = await http().put('/api/fase-interna/configuracao').set(bearer(A.token)).send({ modo: 'SIMPLES' }).expect(200);
      expect(outro.body.signatarios_autorizacao).toHaveLength(4);
    });

    it('tela: resumo do celular (título, teto, fundamento) e o portão B do art. 72 só MOSTRADO', async () => {
      const r = (await http().get(`/api/fase-interna/${lic.id}/autorizacao`).set(bearer(agente.token)).expect(200)).body;
      expect(r.situacao).toBe('SEM_DESPACHO');
      expect(r.autoridade).toBe('Mesa Diretora');
      expect(r.resumo).toMatchObject({ titulo: `Autorizar a abertura do PA ${lic.numero_processo}`, teto: 2000, modalidade: 'Dispensa · art. 75, II', dotacao: 'Sem reserva', documentos_ok: false });
      expect(r.resumo.portao_b.linhas.map((l: any) => l.inciso)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']);
      expect(r.signatarios_configurados.map((s: any) => s.papel)).toEqual(PAPEIS_MESA);
    });

    it('despacho gerado pelo modelo (processo, fundamento, teto, dotação, autoridade) NÃO conta antes de assinado', async () => {
      const g = (await http().post(`/api/fase-interna/${lic.id}/autorizacao/gerar`).set(bearer(agente.token)).expect(201)).body;
      expect(g.situacao).toBe('EM_ELABORACAO');
      expect(g.peca).toMatchObject({ gerada_pelo_modelo: true, exige_assinatura: true, tem_arquivo: true });
      const texto = g.secoes.autorizacao as string;
      expect(texto).toContain(lic.numero_processo);
      expect(texto).toContain('art. 75, II');
      expect(texto).toMatch(/teto\) de R\$\s?2\.000,00/);
      expect(texto).toContain('Mesa Diretora');
      expect(texto).toMatch(/reserva ainda não emitida/);
      expect(itemDe(await instrucao(lic), 'AA').status).toBe('EM_ELABORACAO');
    });

    it('enviar à Mesa; quem não é signatário não assina; só fica AUTORIZADA na 4ª assinatura; a tarefa da etapa conclui', async () => {
      const env = (await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({}).expect(201)).body;
      expect(env.situacao).toBe('AGUARDANDO_ASSINATURAS');
      expect(env.signatarios.map((s: any) => s.papel)).toEqual(PAPEIS_MESA);
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(semPapel.token)).send({})).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(agente.token)).send({})).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(A.token)).send({})).status).toBe(403);
      // tela do celular para cada vereador: "posso assinar"
      const vista = (await http().get(`/api/fase-interna/${lic.id}/autorizacao`).set(bearer(mesa[1].token)).expect(200)).body;
      expect(vista.assinaturas).toMatchObject({ sou_signatario: true, posso_assinar: true, total: 4, assinaram: 0 });
      expect(vista.pode_devolver).toBe(true);

      for (let i = 0; i < 4; i++) {
        const r = await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(mesa[i].token)).send({});
        expect(r.status).toBe(201);
        if (i < 3) {
          expect(r.body.situacao).toBe('AGUARDANDO_ASSINATURAS');
          expect(r.body.assinaturas.assinaram).toBe(i + 1);
          expect(itemDe(await instrucao(lic), 'AA').status).toBe('EM_ASSINATURA');
        } else {
          expect(r.body.concluida).toBe(true);
          expect(r.body.situacao).toBe('AUTORIZADA');
        }
      }
      // assinar de novo: 409
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(mesa[0].token)).send({})).status).toBe(409);
      const [doc] = await sql(`SELECT status::text AS status, assinaturas, data_documento, folha_inicial FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'AA' AND versao_atual`, [lic.id]);
      expect(doc.status).toBe('ASSINADO');
      expect(doc.assinaturas.map((a: any) => a.assinante_cargo).sort()).toEqual([...PAPEIS_MESA].sort());
      expect(doc.data_documento).toBeTruthy();
      expect(doc.folha_inicial).toBeGreaterThanOrEqual(1);
      expect(itemDe(await instrucao(lic), 'AA').status).toBe('OK');

      // designação "não se aplica" → a etapa 6 conclui e a tarefa dela também
      expect((await naoSeAplica(lic, 'DP', agente.token)).status).toBe(201);
      const t = (await tarefasDoProcesso(lic)).find((x: any) => x.chave === 'etapa:AUTORIZACAO');
      expect(t).toMatchObject({ status: 'CONCLUIDA' });
    });
  });

  // ==========================================================================
  describe('B. devolver com observação (tarefa do agente) e despacho anexado', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({}).expect(201);
    });

    it('só a autoridade devolve; motivo obrigatório', async () => {
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/devolver`).set(bearer(semPapel.token)).send({ motivo: 'Falta a pesquisa de preços completa.' })).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/devolver`).set(bearer(mesa[0].token)).send({ motivo: 'curto' })).status).toBe(400);
    });

    it('devolver: despacho DEVOLVIDO (não conta), pedido de assinatura cancelado e tarefa do agente com o motivo', async () => {
      const motivo = 'Falta a informação orçamentária do exercício — refazer depois da reserva.';
      const r = (await http().post(`/api/fase-interna/${lic.id}/autorizacao/devolver`).set(bearer(mesa[2].token)).send({ motivo }).expect(201)).body;
      expect(r.situacao).toBe('DEVOLVIDA');
      expect(r.ultima_devolucao).toMatchObject({ motivo, por_nome: 'Vereador 1º Secretário' });
      expect(itemDe(await instrucao(lic), 'AA').status).toBe('EM_ELABORACAO');
      const [docAss] = await sql(
        `SELECT da.status::text AS status FROM documentos_assinatura da JOIN documentos_fase_interna d ON d.documento_assinatura_id = da.id WHERE d.licitacao_id = $1 AND d.tipo::text = 'AA' AND d.versao_atual`,
        [lic.id],
      );
      expect(docAss.status).toBe('CANCELADO');
      const t = (await tarefasDoProcesso(lic)).find((x: any) => x.chave === 'sistema:autorizacao-devolvida');
      expect(t).toMatchObject({ status: 'ABERTA', responsavel_usuario_id: agente.id, origem: 'SISTEMA', tipo_peca: 'AA' });
      expect(t.descricao).toContain(motivo);
      const cx = (await http().get('/api/tarefas?aba=para-mim').set(bearer(agente.token)).expect(200)).body;
      expect(cx.tarefas.find((x: any) => x.id === t.id).destino).toBe(`/orgao/processos/${lic.id}/fase-interna/autorizacao`);
      // assinar o devolvido: 409
      expect((await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(mesa[0].token)).send({})).status).toBe(409);
    });

    it('reenviar gera versão nova do despacho e conclui a tarefa da devolução', async () => {
      const r = (await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agente.token)).send({}).expect(201)).body;
      expect(r.situacao).toBe('AGUARDANDO_ASSINATURAS');
      expect(r.peca.versao).toBe(2);
      expect(r.devolucoes).toHaveLength(1); // o histórico da devolução acompanha
      const t = (await tarefasDoProcesso(lic)).find((x: any) => x.chave === 'sistema:autorizacao-devolvida');
      expect(t).toMatchObject({ status: 'CONCLUIDA', concluida_por_id: agente.id });
    });

    it('despacho assinado FORA (anexo) também autoriza', async () => {
      const outro = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      expect((await anexar(outro, 'AA', agente.token)).status).toBe(201);
      const r = (await http().get(`/api/fase-interna/${outro.id}/autorizacao`).set(bearer(agente.token)).expect(200)).body;
      expect(r.situacao).toBe('AUTORIZADA');
      expect(r.peca.anexada).toBe(true);
    });
  });

  // ==========================================================================
  describe('C. minutas e relatório do agente lendo o processo; sigilo; regeração pelo fundamento', () => {
    let lic: LicitacaoFixture;
    let outro: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      outro = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await sql(`UPDATE licitacoes SET numero_processo = '139/2025', numero_edital = '029/2025' WHERE id = $1`, [lic.id]);
      await sql(`UPDATE licitacoes SET numero_processo = '115/2025', numero_edital = '025/2025' WHERE id = $1`, [outro.id]);
      // portaria de designação do órgão (Entrega 1) — citada no relatório
      await http()
        .post('/api/fase-interna/orgao/portarias')
        .set(bearer(A.token))
        .field('numero_peca', 'Portaria 089/2024')
        .field('data_documento', hoje())
        .attach('arquivo', pdfDeTeste('Portaria'), { filename: 'portaria.pdf', contentType: 'application/pdf' })
        .expect(201);
      // o OUTRO processo gera as suas minutas antes (não pode vazar para este)
      await http().post(`/api/fase-interna/${outro.id}/minutas/TODAS/gerar`).set(bearer(agente.token)).expect(201);
    });

    it('gera RAG, ME e MC com o número e o fundamento DESTE processo (nunca o PA 115/2025)', async () => {
      const r = (await http().post(`/api/fase-interna/${lic.id}/minutas/TODAS/gerar`).set(bearer(agente.token)).expect(201)).body;
      for (const t of ['RAG', 'ME', 'MC']) {
        expect(r.pecas[t].peca).toMatchObject({ gerada_pelo_modelo: true, editada: false, desatualizada: null });
        const texto = Object.values(r.pecas[t].secoes).join(' ');
        expect(texto).toContain('139/2025');
        expect(texto).not.toContain('115/2025');
        expect(r.pecas[t].referencias_divergentes).toEqual([]);
      }
      expect(r.pecas.MC.secoes.vinculacao).toMatch(/Processo Administrativo nº 139\/2025 \(DISPENSA_ELETRONICA nº 029\/2025\), com fundamento na Lei 14\.133\/2021, art\. 75, II/);
      expect(r.pecas.RAG.secoes.identificacao).toContain('designado pela Portaria 089/2024');
      expect(r.pecas.RAG.secoes.enquadramento).toMatch(/art\. 75, II, valor atualizado pelo Dec\./);
      expect(r.dados_do_processo.fundamento_legal.codigo).toBe('ART75_II');
      expect(itemDe(await instrucao(lic), 'ME')).toMatchObject({ status: 'OK', pode_nao_se_aplicar: true });
      // a minuta do outro processo continua com o número dele
      const o = (await http().get(`/api/fase-interna/${outro.id}/minutas`).set(bearer(agente.token)).expect(200)).body;
      expect(o.pecas.MC.secoes.vinculacao).toContain('115/2025');
    });

    it('sigilo do orçamento (art. 24): justificativa obrigatória e o aviso passa a omitir o valor', async () => {
      expect((await http().put(`/api/fase-interna/${lic.id}/minutas/sigilo`).set(bearer(agente.token)).send({ sigiloso: true, justificativa: 'curta' })).status).toBe(400);
      const r = (await http()
        .put(`/api/fase-interna/${lic.id}/minutas/sigilo`)
        .set(bearer(agente.token))
        .send({ sigiloso: true, justificativa: 'Evitar a ancoragem dos preços na disputa (art. 24 da Lei 14.133/2021).' })
        .expect(200)).body;
      expect(r.dados_do_processo.sigilo).toMatchObject({ sigiloso: true });
      expect(r.pecas.ME.secoes.preambulo).toMatch(/Valor estimado: sigiloso \(art\. 24/);
      expect(r.pecas.RAG.secoes.preco).toMatch(/SIGILOSO/);
    });

    it('mudar o fundamento REGERA as minutas geradas; a editada à mão fica "desatualizada, regerar?"', async () => {
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/RAG/secao/escolha`)
        .set(bearer(agente.token))
        .send({ html: '<p>Menor preço entre as propostas — escrito pelo agente.</p>' })
        .expect(200);
      const antes = (await http().get(`/api/fase-interna/${lic.id}/minutas`).set(bearer(agente.token)).expect(200)).body;
      expect(antes.pecas.RAG.peca.editada).toBe(true);
      const versaoMc = antes.pecas.MC.peca.versao;

      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ fundamento_legal: 'ART75_VIII' }).expect(200);
      await esperar();
      const depois = (await http().get(`/api/fase-interna/${lic.id}/minutas`).set(bearer(agente.token)).expect(200)).body;
      expect(depois.pecas.MC.secoes.vinculacao).toContain('art. 75, VIII');
      expect(depois.pecas.MC.secoes.vinculacao).not.toContain('art. 75, II,');
      expect(depois.pecas.MC.peca).toMatchObject({ versao: versaoMc, editada: false, desatualizada: null });
      expect(depois.pecas.ME.secoes.preambulo).toContain('art. 75, VIII');
      expect(depois.pecas.RAG.peca.desatualizada).toMatchObject({ motivo: 'EDITADA', campos: ['fundamento legal'] });
      expect(depois.pecas.RAG.secoes.enquadramento).toContain('art. 75, II'); // não foi reescrita
      expect(depois.pecas.RAG.secoes.escolha).toContain('escrito pelo agente');

      // "regerar?" → sim: volta a acompanhar o processo
      const reg = (await http().post(`/api/fase-interna/${lic.id}/minutas/RAG/gerar`).set(bearer(agente.token)).expect(201)).body;
      expect(reg.pecas.RAG.secoes.enquadramento).toContain('art. 75, VIII');
      expect(reg.pecas.RAG.peca).toMatchObject({ desatualizada: null, editada: false });
      // idempotente: salvar o mesmo fundamento não gera versão nova
      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ fundamento_legal: 'ART75_VIII' }).expect(200);
      await esperar();
      const igual = (await http().get(`/api/fase-interna/${lic.id}/minutas`).set(bearer(agente.token)).expect(200)).body;
      expect(igual.pecas.MC.peca.versao).toBe(versaoMc);
    });

    it('tipo inválido: 400; minuta feita fora (anexo) também conta', async () => {
      expect((await http().post(`/api/fase-interna/${lic.id}/minutas/XYZ/gerar`).set(bearer(agente.token))).status).toBe(400);
      const l2 = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      expect((await anexar(l2, 'MC', agente.token)).status).toBe(201);
      const r = (await http().get(`/api/fase-interna/${l2.id}/minutas`).set(bearer(agente.token)).expect(200)).body;
      expect(r.pecas.MC.peca).toMatchObject({ anexada: true, gerada_pelo_modelo: false });
      expect(r.pecas.MC.instrucao.status).toBe('OK');
    });
  });

  // ==========================================================================
  describe('D. parecer com diligências (modo por setor)', () => {
    let lic: LicitacaoFixture;
    let diligenciaId: string;
    let aaAssinado: any;

    beforeAll(async () => {
      await http()
        .put('/api/fase-interna/configuracao')
        .set(bearer(C.token))
        .send({ modo: 'POR_SETOR', signatarios_autorizacao: [{ usuario_id: presidenteC.id, papel: 'Presidente' }] })
        .expect(200);
      lic = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agenteC.id } });
      for (const t of ['DFD', 'TR', 'PP', 'DO']) expect((await anexar(lic, t, agenteC.token)).status).toBe(201);
      for (const t of ['ETP', 'AR', 'DP', 'JC']) expect((await naoSeAplica(lic, t, agenteC.token)).status).toBe(201);
      // autorização assinada (etapa 6) — DEPOIS do TR
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/enviar`).set(bearer(agenteC.token)).send({}).expect(201);
      await http().post(`/api/fase-interna/${lic.id}/autorizacao/assinar`).set(bearer(presidenteC.token)).send({}).expect(201);
      await http().post(`/api/fase-interna/${lic.id}/minutas/TODAS/gerar`).set(bearer(agenteC.token)).expect(201);
      [aaAssinado] = await sql(`SELECT id::text AS id, status::text AS status, versao, assinaturas FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'AA' AND versao_atual`, [lic.id]);
      expect(aaAssinado.status).toBe('ASSINADO');
    });

    it('tela: autos na ordem com folhas e o roteiro; a tarefa do parecer é da Procuradoria (papel JURÍDICO)', async () => {
      const r = (await http().get(`/api/fase-interna/${lic.id}/parecer`).set(bearer(juridicoC.token)).expect(200)).body;
      expect(r).toMatchObject({ fase: 'PREVIA', disponivel: true, pode_emitir: true, minutas_prontas: true });
      expect(r.autos.map((a: any) => a.tipo)).toEqual(expect.arrayContaining(['DFD', 'TR', 'PP', 'DO', 'AA', 'RAG', 'ME', 'MC']));
      const folhas = r.autos.filter((a: any) => a.folha_inicial != null).map((a: any) => a.folha_inicial);
      expect(folhas).toEqual([...folhas].sort((a, b) => a - b));
      expect(r.roteiro.map((i: any) => i.id)).toEqual(expect.arrayContaining(['A72_I', 'A72_II', 'A72_IV', 'A72_VIII', 'ART75', 'ART41', 'ART24', 'ART92', 'VINC']));
      expect(r.roteiro.find((i: any) => i.id === 'VINC').situacao).toBe('CONFORME');
      expect((await http().get(`/api/fase-interna/${lic.id}/parecer`).set(bearer(agenteC.token)).expect(200)).body.pode_emitir).toBe(false);
      const t = (await tarefasDoProcesso(lic)).find((x: any) => x.chave === 'etapa:PARECER');
      expect(t).toMatchObject({ status: 'ABERTA', responsavel_papel: 'JURIDICO' });
    });

    it('sem o papel Jurídico: não abre diligência, não salva o roteiro, não emite (403)', async () => {
      const corpo = { tipo_alvo: 'TR', descricao: 'Ajustar o prazo de execução do TR.' };
      for (const token of [agenteC.token, semPapelC.token, C.token]) {
        expect((await http().post(`/api/fase-interna/${lic.id}/parecer/diligencias`).set(bearer(token)).send(corpo)).status).toBe(403);
        expect((await http().put(`/api/fase-interna/${lic.id}/parecer`).set(bearer(token)).send({ roteiro: {} })).status).toBe(403);
        expect((await http().post(`/api/fase-interna/${lic.id}/parecer/emitir`).set(bearer(token)).send({ conclusao: 'FAVORAVEL' })).status).toBe(403);
      }
    });

    it('diligência: cria a tarefa (origem DILIGENCIA) para o responsável pela peça-alvo; o item fica em diligência', async () => {
      expect((await http().post(`/api/fase-interna/${lic.id}/parecer/diligencias`).set(bearer(juridicoC.token)).send({ tipo_alvo: 'XYZ', descricao: 'Peça que não existe nos autos.' })).status).toBe(400);
      const r = (await http()
        .post(`/api/fase-interna/${lic.id}/parecer/diligencias`)
        .set(bearer(juridicoC.token))
        .send({ tipo_alvo: 'TR', descricao: 'O TR não traz o prazo de execução (art. 6º, XXIII, e).', item_roteiro: 'A72_I', trecho: 'prazo' })
        .expect(201)).body;
      expect(r.diligencias).toHaveLength(1);
      const d = r.diligencias[0];
      diligenciaId = d.id;
      expect(d).toMatchObject({ status: 'ABERTA', tipo_alvo: 'TR', versao_alvo: 1, corrigida: false });
      expect(d.folha).toBeGreaterThanOrEqual(1);
      expect(r.roteiro.find((i: any) => i.id === 'A72_I')).toMatchObject({ situacao: 'DILIGENCIA', diligencias_abertas: 1 });
      const t = (await tarefasDoProcesso(lic)).find((x: any) => x.chave === `diligencia:${d.id}`);
      expect(t).toMatchObject({ status: 'ABERTA', origem: 'DILIGENCIA', tipo: 'DILIGENCIA', origem_id: d.id, passo: 'TR', tipo_peca: 'TR', responsavel_papel: 'REQUISITANTE' });
    });

    it('favorável não sai com diligência aberta', async () => {
      const r = await http().post(`/api/fase-interna/${lic.id}/parecer/emitir`).set(bearer(juridicoC.token)).send({ conclusao: 'FAVORAVEL' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/diligência/);
    });

    it('sanar: só quem responde pela peça (403 para os demais); exige a versão nova da peça-alvo', async () => {
      const url = `/api/fase-interna/${lic.id}/parecer/diligencias/${diligenciaId}/sanar`;
      expect((await http().post(url).set(bearer(semPapelC.token)).send({ resposta: 'feito' })).status).toBe(403);
      expect((await http().post(url).set(bearer(agenteC.token)).send({ resposta: 'feito' })).status).toBe(400);
      // diligência de outro processo do mesmo órgão: 404
      const l2 = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      expect((await http().post(`/api/fase-interna/${l2.id}/parecer/diligencias/${diligenciaId}/sanar`).set(bearer(agenteC.token)).send({})).status).toBe(404);
    });

    it('corrigida (TR v2) e sanada: volta para a Procuradoria SEM perder a autorização assinada depois', async () => {
      expect((await anexar(lic, 'TR', agenteC.token)).status).toBe(201);
      const r = (await http()
        .post(`/api/fase-interna/${lic.id}/parecer/diligencias/${diligenciaId}/sanar`)
        .set(bearer(agenteC.token))
        .send({ resposta: 'Incluído o prazo de 12 meses no TR (versão 2).' })
        .expect(201)).body;
      expect(r.diligencias[0]).toMatchObject({ status: 'SANADA', corrigida: true, versao_corrigida: 2, sanada_por_nome: 'Caio Agente' });
      const ts = await tarefasDoProcesso(lic);
      expect(ts.find((x: any) => x.chave === `diligencia:${diligenciaId}`)).toMatchObject({ status: 'CONCLUIDA', concluida_por_id: agenteC.id });
      const analise = r.analise.id;
      expect(ts.find((x: any) => x.chave === `parecer-retorno:${analise}`)).toMatchObject({ status: 'ABERTA', passo: 'PARECER', responsavel_papel: 'JURIDICO', origem: 'DILIGENCIA' });
      // a autorização (assinada depois do TR) continua a mesma, assinada
      const [aa] = await sql(`SELECT id::text AS id, status::text AS status, versao, assinaturas FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'AA' AND versao_atual`, [lic.id]);
      expect(aa).toMatchObject({ id: aaAssinado.id, status: 'ASSINADO', versao: aaAssinado.versao });
      expect(aa.assinaturas).toHaveLength(1);
      // sanar de novo: 400 (não está aberta)
      expect((await http().post(`/api/fase-interna/${lic.id}/parecer/diligencias/${diligenciaId}/sanar`).set(bearer(agenteC.token)).send({ resposta: 'x' })).status).toBe(400);
    });

    it('roteiro salvo pela Procuradoria; parecer FAVORÁVEL emitido e assinado pelo Jurídico conclui as tarefas', async () => {
      const s = (await http()
        .put(`/api/fase-interna/${lic.id}/parecer`)
        .set(bearer(juridicoC.token))
        .send({ roteiro: { ART41: { situacao: 'CONFORME', observacao: 'Sem marca' } }, fundamentacao: 'Instrução completa.' })
        .expect(200)).body;
      expect(s.roteiro.find((i: any) => i.id === 'ART41')).toMatchObject({ situacao: 'CONFORME', marcado_pela_procuradoria: true });
      const r = (await http().post(`/api/fase-interna/${lic.id}/parecer/emitir`).set(bearer(juridicoC.token)).send({ conclusao: 'FAVORAVEL' }).expect(201)).body;
      expect(r.analise).toMatchObject({ status: 'EMITIDO', conclusao: 'FAVORAVEL', emitido_por_nome: 'Paula Procuradora' });
      expect(r.parecer).toMatchObject({ status: 'ASSINADO', exige_assinatura: true });
      expect(r.conclusao_do_parecer).toBe('FAVORAVEL');
      const [pj] = await sql(`SELECT descricao, assinaturas FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'PJ' AND versao_atual`, [lic.id]);
      expect(pj.descricao).toContain(`Processo Administrativo nº ${lic.numero_processo}`);
      expect(pj.descricao).toMatch(/Parecer FAVORÁVEL/);
      expect(pj.assinaturas).toHaveLength(1);
      expect(itemDe(await instrucao(lic), 'PJ').status).toBe('OK');
      const ts = await tarefasDoProcesso(lic);
      expect(ts.find((x: any) => x.chave === 'etapa:PARECER')).toMatchObject({ status: 'CONCLUIDA', concluida_por_id: juridicoC.id });
      expect(ts.find((x: any) => x.chave === `parecer-retorno:${r.analise.id}`)).toMatchObject({ status: 'CONCLUIDA' });
    });

    it('reabrir e cancelar: só o Jurídico, nas situações certas', async () => {
      const url = (acao: string) => `/api/fase-interna/${lic.id}/parecer/diligencias/${diligenciaId}/${acao}`;
      expect((await http().post(url('reabrir')).set(bearer(agenteC.token)).send({ motivo: 'Ainda falta o prazo.' })).status).toBe(403);
      expect((await http().post(url('cancelar')).set(bearer(juridicoC.token)).send({})).status).toBe(409); // sanada não cancela
      const r = (await http().post(url('reabrir')).set(bearer(juridicoC.token)).send({ motivo: 'O prazo continua sem unidade de medida.' }).expect(201)).body;
      expect(r.diligencias[0]).toMatchObject({ status: 'ABERTA', versao_alvo: 2 });
      const aberta = (await tarefasDoProcesso(lic)).filter((x: any) => x.chave === `diligencia:${diligenciaId}` && x.status === 'ABERTA');
      expect(aberta).toHaveLength(1);
      const c = (await http().post(url('cancelar')).set(bearer(juridicoC.token)).send({ motivo: 'Superada' }).expect(201)).body;
      expect(c.diligencias[0].status).toBe('CANCELADA');
      expect((await tarefasDoProcesso(lic)).filter((x: any) => x.chave === `diligencia:${diligenciaId}` && x.status === 'ABERTA')).toHaveLength(0);
    });
  });

  // ==========================================================================
  describe('E. parecer da fase externa (depois da sessão, antes da adjudicação)', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, C, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agenteC.id } });
    });

    it('na fase interna: indisponível (409 ao pedir)', async () => {
      const r = (await http().get(`/api/fase-interna/${lic.id}/parecer?fase=EXTERNA`).set(bearer(juridicoC.token)).expect(200)).body;
      expect(r.disponivel).toBe(false);
      expect((await http().post(`/api/fase-interna/${lic.id}/parecer/fase-externa/solicitar`).set(bearer(agenteC.token))).status).toBe(409);
    });

    it('no julgamento: pedido cria a tarefa da Procuradoria; emitido e assinado (PJE), a tarefa conclui', async () => {
      await sql(`UPDATE licitacoes SET fase = 'JULGAMENTO' WHERE id = $1`, [lic.id]);
      await http().post(`/api/fase-interna/${lic.id}/parecer/fase-externa/solicitar`).set(bearer(agenteC.token)).expect(201);
      const t = (await tarefasDoProcesso(lic)).find((x: any) => x.chave === 'sistema:parecer-fase-externa');
      expect(t).toMatchObject({ status: 'ABERTA', tipo_peca: 'PJE', responsavel_papel: 'JURIDICO' });
      const cx = (await http().get('/api/tarefas?aba=para-mim').set(bearer(juridicoC.token)).expect(200)).body;
      expect(cx.tarefas.find((x: any) => x.id === t.id).destino).toBe(`/orgao/processos/${lic.id}/fase-interna/parecer?fase=EXTERNA`);
      const g = (await http().get(`/api/fase-interna/${lic.id}/parecer?fase=EXTERNA`).set(bearer(juridicoC.token)).expect(200)).body;
      expect(g).toMatchObject({ disponivel: true, fase: 'EXTERNA' });
      expect(g.roteiro.map((i: any) => i.id)).toEqual(['PREVIO', 'DIVULGACAO', 'JULGAMENTO', 'PRECO', 'HABILITACAO', 'RECURSOS']);
      const r = (await http().post(`/api/fase-interna/${lic.id}/parecer/emitir`).set(bearer(juridicoC.token)).send({ fase: 'EXTERNA', conclusao: 'FAVORAVEL' }).expect(201)).body;
      expect(r.parecer).toMatchObject({ tipo: 'PJE', status: 'ASSINADO' });
      expect((await tarefasDoProcesso(lic)).find((x: any) => x.chave === 'sistema:parecer-fase-externa')).toMatchObject({ status: 'CONCLUIDA', concluida_por_id: juridicoC.id });
    });
  });

  // ==========================================================================
  describe('F. controle interno ativo/inativo', () => {
    let lic: LicitacaoFixture;
    let controlador: UsuarioOrgaoFixture;
    let semPapelD: UsuarioOrgaoFixture;

    beforeAll(async () => {
      controlador = await criarUsuarioOrgao(ctx, D, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Carla Controladora' });
      semPapelD = await criarUsuarioOrgao(ctx, D, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Sem Papel D' });
      await papeis(D, controlador, ['CONTROLE_INTERNO']);
      lic = await criarLicitacao(ctx, D, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    });

    it('desativado (padrão): a etapa não aparece; manifestar 409', async () => {
      const r = (await http().get(`/api/fase-interna/${lic.id}/controle-interno`).set(bearer(controlador.token)).expect(200)).body;
      expect(r.ativo).toBe(false);
      expect((await http().post(`/api/fase-interna/${lic.id}/controle-interno/manifestar`).set(bearer(controlador.token)).send({ conclusao: 'FAVORAVEL' })).status).toBe(409);
      const et = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(D.token)).expect(200)).body;
      expect(et.etapas.some((e: any) => e.etapa === 'CONTROLE_INTERNO')).toBe(false);
    });

    it('ativo: só o papel CONTROLE_INTERNO se manifesta; apontamentos obrigatórios; a peça fica assinada (aviso, não bloqueio)', async () => {
      await http().put('/api/fase-interna/configuracao').set(bearer(D.token)).send({ modo: 'SIMPLES', controle_interno_ativo: true }).expect(200);
      const r = (await http().get(`/api/fase-interna/${lic.id}/controle-interno`).set(bearer(controlador.token)).expect(200)).body;
      expect(r).toMatchObject({ ativo: true, pode_manifestar: true });
      expect(r.instrucao).toMatchObject({ tipo: 'MCI', obrigatorio: false });
      expect((await http().post(`/api/fase-interna/${lic.id}/controle-interno/manifestar`).set(bearer(semPapelD.token)).send({ conclusao: 'FAVORAVEL' })).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/controle-interno/manifestar`).set(bearer(controlador.token)).send({ conclusao: 'COM_APONTAMENTOS' })).status).toBe(400);
      const m = (await http()
        .post(`/api/fase-interna/${lic.id}/controle-interno/manifestar`)
        .set(bearer(controlador.token))
        .send({ conclusao: 'COM_APONTAMENTOS', apontamentos: 'Juntar a certidão do FGTS antes da contratação.' })
        .expect(201)).body;
      expect(m.peca).toMatchObject({ tipo: 'MCI', status: 'ASSINADO' });
      expect(m.manifestacao).toMatchObject({ conclusao: 'COM_APONTAMENTOS' });
      expect(itemDe(await instrucao(lic), 'MCI').status).toBe('OK');
      const et = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(D.token)).expect(200)).body;
      expect(et.etapas.some((e: any) => e.etapa === 'CONTROLE_INTERNO')).toBe(true);
    });
  });

  // ==========================================================================
  describe('G. isolamento de todos os endpoints novos', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('leitura: outro órgão 404, fornecedor 403, anônimo 401', async () => {
      for (const rota of ['autorizacao', 'minutas', 'parecer', 'parecer?fase=EXTERNA', 'controle-interno']) {
        expect((await http().get(`/api/fase-interna/${lic.id}/${rota}`).set(bearer(B.token))).status).toBe(404);
        expect((await http().get(`/api/fase-interna/${lic.id}/${rota}`).set(bearer(F.token))).status).toBe(403);
        expect((await http().get(`/api/fase-interna/${lic.id}/${rota}`)).status).toBe(401);
      }
    });

    it('escrita: outro órgão 403, fornecedor 403, anônimo 401 (nada gravado)', async () => {
      const dil = '00000000-0000-4000-8000-000000000000';
      const escritas: Array<[string, string]> = [
        ['post', 'autorizacao/gerar'],
        ['post', 'autorizacao/enviar'],
        ['post', 'autorizacao/assinar'],
        ['post', 'autorizacao/devolver'],
        ['post', 'minutas/TODAS/gerar'],
        ['put', 'minutas/sigilo'],
        ['put', 'parecer'],
        ['post', 'parecer/diligencias'],
        ['post', `parecer/diligencias/${dil}/sanar`],
        ['post', `parecer/diligencias/${dil}/reabrir`],
        ['post', `parecer/diligencias/${dil}/cancelar`],
        ['post', 'parecer/emitir'],
        ['post', 'parecer/fase-externa/solicitar'],
        ['post', 'controle-interno/manifestar'],
      ];
      for (const [m, rota] of escritas) {
        const url = `/api/fase-interna/${lic.id}/${rota}`;
        expect([rota, (await (http() as any)[m](url).set(bearer(B.token)).send({})).status]).toEqual([rota, 403]);
        expect([rota, (await (http() as any)[m](url).set(bearer(F.token)).send({})).status]).toEqual([rota, 403]);
        expect([rota, (await (http() as any)[m](url).send({})).status]).toEqual([rota, 401]);
      }
      const [{ n }] = await sql(`SELECT COUNT(*)::int AS n FROM documentos_fase_interna WHERE licitacao_id = $1`, [lic.id]);
      expect(n).toBe(0);
    });
  });
});
