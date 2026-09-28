/**
 * HOMOLOGAÇÃO MULTIUSUÁRIO — frente B (assinaturas internas, diligência,
 * tramitação e conteúdo do TR). docs/fase interna/relatorio-homologacao-multiusuario.
 *
 *  A. E1 — TR enviado para assinatura: aparece na Central (aba Assinaturas)
 *     do signatário, com a tarefa "Assinar" e o aviso; só ele assina (403
 *     para os demais; outro órgão 404); assinado, a peça fica ASSINADA e a
 *     tarefa conclui. A tela da peça diz quem assina e se o usuário pode assinar.
 *  B. E5 — o TR anexado (v2) não apaga as seções da v1: a tela as devolve
 *     como base, com quem anexou; "Gerar" a partir da base = versão nova
 *     PRONTA (emitida = pronta); salvar a seção com o mesmo texto não a
 *     desapronta. A tarefa de assinatura da versão substituída é cancelada.
 *  C. Diligência pela tela da peça: lista, quem pode sanar, exige versão
 *     nova (ou "não há o que alterar"); outro órgão 404.
 *  D. Próximo destino: depois da autorização (sem agente designado) → o
 *     setor do agente; depois das minutas → o Jurídico, mesmo com o agente
 *     também tendo o papel Jurídico.
 *  E. "Desfazer não se aplica" de etapa concluída = voltar: motivo
 *     obrigatório, só quem conduz ou o responsável, dependentes "a revisar".
 */
import {
  AppE2E,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  pdfDeTeste,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';
import { ModeloDocumentoService } from '../src/fase-interna/modelo-documento.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe('Homologação multiusuário — assinaturas internas, diligência e tramitação', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let carlos: UsuarioOrgaoFixture; // Compras (faz o TR)
  let paulo: UsuarioOrgaoFixture; // Presidência (autoridade)
  let ana: UsuarioOrgaoFixture; // Licitações (agente)
  let julia: UsuarioOrgaoFixture; // Jurídico
  let adminSemSetor: UsuarioOrgaoFixture;
  let deB: UsuarioOrgaoFixture;
  const setor: Record<string, string> = {};
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const esperar = () => ctx.app.get(TarefasService).aguardarPendentes();
  const anexar = (lic: { id: string }, tipo: string, token: string) =>
    http()
      .post(`/api/fase-interna/${lic.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 001/2026`)
      .attach('arquivo', pdfDeTeste(`Peca ${tipo}`), { filename: 'peca.pdf', contentType: 'application/pdf' });
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Não se aplica a esta contratação direta (art. 72).' });
  const papeis = (u: UsuarioOrgaoFixture, lista: string[], setorId: string | null) =>
    http().put(`/api/fase-interna/configuracao/usuarios/${u.id}`).set(bearer(A.token)).send({ papeis: lista, setor_id: setorId }).expect(200);
  const instrucao = async (lic: { id: string }) => (await http().get(`/api/fase-interna/${lic.id}/instrucao`).set(bearer(A.token)).expect(200)).body;
  const itemDe = (inst: any, tipo: string) => inst.itens.find((i: any) => i.tipo === tipo);

  beforeAll(async () => {
    ctx = await criarApp();
    await ctx.app.get(ModeloDocumentoService).seedModelosPadrao();
    A = await criarOrgao(ctx, { nome: 'Câmara Homologação A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Homologação B' });
    for (const [chave, nome] of [
      ['compras', 'Compras'],
      ['presidencia', 'Presidência'],
      ['licitacoes', 'Licitações'],
      ['juridico', 'Jurídico'],
    ]) {
      [{ id: setor[chave] }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, $2, $3) RETURNING id::text AS id`, [A.id, chave.slice(0, 6).toUpperCase(), nome]);
    }
    carlos = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Carlos Compras' });
    paulo = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paulo Presidente' });
    ana = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Ana Agente' });
    julia = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Júlia Jurídico' });
    adminSemSetor = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Suporte Sem Setor' });
    deB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Servidor de B' });
    await http().put('/api/fase-interna/configuracao').set(bearer(A.token)).send({ modo: 'POR_SETOR', signatarios_autorizacao: [{ usuario_id: paulo.id, papel: 'Presidente' }] }).expect(200);
    await papeis(carlos, ['COMPRAS', 'REQUISITANTE'], setor.compras);
    await papeis(paulo, ['AUTORIDADE'], setor.presidencia);
    await papeis(ana, ['AGENTE_CONTRATACAO', 'JURIDICO'], setor.licitacoes);
    await papeis(julia, ['JURIDICO'], setor.juridico);
    await papeis(adminSemSetor, ['AGENTE_CONTRATACAO'], null);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A–C. TR: assinatura interna, versões e diligência', () => {
    let lic: LicitacaoFixture;
    let docAss: string;
    let docTr: string;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/TR/secao/objeto`)
        .set(bearer(carlos.token))
        .send({ html: '<p>Aquisição de papel A4 para a Câmara.</p>' })
        .expect(200);
    });

    it('A. enviar para assinatura: tarefa "Assinar" e aviso para o signatário; aparece só na Central dele', async () => {
      const env = await http()
        .post(`/api/fase-interna/${lic.id}/documentos/TR/assinatura`)
        .set(bearer(carlos.token))
        .send({ signatarios: [{ usuario_id: carlos.id, papel: 'Chefe de Compras' }] })
        .expect(201);
      expect(env.body.status).toBe('AGUARDANDO_ASSINATURA');
      docTr = env.body.id;
      docAss = env.body.documento_assinatura_id;
      await esperar();
      const [t] = await sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 AND origem = 'ASSINATURA'`, [lic.id]);
      expect(t).toMatchObject({ status: 'ABERTA', tipo: 'ASSINATURA', responsavel_usuario_id: carlos.id, chave: `assinatura:${docTr}:${carlos.id}`, tipo_peca: 'TR' });
      expect(t.titulo).toMatch(/^Assinar: .*versão 1/);
      // aviso (sino/e-mail/WhatsApp) com o link da Central › Assinaturas
      const avisos = await sql(`SELECT * FROM notificacoes WHERE entidade_id = $1`, [t.id]);
      expect(avisos.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(avisos[0].metadata)).toMatch(/aprovacoes\?tab=assinaturas/);

      const minhas = (await http().get('/api/assinaturas-internas/pendentes').set(bearer(carlos.token)).expect(200)).body;
      expect(minhas.itens).toHaveLength(1);
      expect(minhas.itens[0]).toMatchObject({
        documento_assinatura_id: docAss,
        origem: 'FASE_INTERNA',
        papel: 'Chefe de Compras',
        processo: { id: lic.id },
        peca: { documento_id: docTr, tipo: 'TR', versao: 1, tela: 'tr' },
        pdf_url: `/api/fase-interna/documento/${docTr}/arquivo`,
      });
      // os outros não veem; o login do órgão recebe o aviso de que a assinatura é pessoal
      expect((await http().get('/api/assinaturas-internas/pendentes').set(bearer(paulo.token)).expect(200)).body.itens).toEqual([]);
      const orgao = (await http().get('/api/assinaturas-internas/pendentes').set(bearer(A.token)).expect(200)).body;
      expect(orgao.itens).toEqual([]);
      expect(orgao.aviso).toMatch(/pessoal/);
      expect((await http().get('/api/assinaturas-internas/pendentes').set(bearer(deB.token)).expect(200)).body.itens).toEqual([]);
      // anônimo 401
      expect((await http().get('/api/assinaturas-internas/pendentes')).status).toBe(401);
    });

    it('A. tela da peça: quem assina e se o usuário pode assinar; PDF só do órgão', async () => {
      const s1 = (await http().get(`/api/fase-interna/${lic.id}/documentos/TR/assinatura`).set(bearer(carlos.token)).expect(200)).body;
      expect(s1).toMatchObject({ status: 'AGUARDANDO_ASSINATURA', pode_assinar: true, eu_assino: true });
      expect(s1.signatarios).toEqual([expect.objectContaining({ nome: 'Carlos Compras', papel: 'Chefe de Compras', status: 'PENDENTE', usuario_id: carlos.id })]);
      const s2 = (await http().get(`/api/fase-interna/${lic.id}/documentos/TR/assinatura`).set(bearer(paulo.token)).expect(200)).body;
      expect(s2).toMatchObject({ pode_assinar: false, eu_assino: false });
      const pdf = await http().get(`/api/fase-interna/documento/${docTr}/arquivo`).set(bearer(carlos.token)).expect(200);
      expect(pdf.headers['content-type']).toMatch(/pdf/);
      expect((await http().get(`/api/assinaturas-internas/${docAss}/arquivo`).set(bearer(carlos.token))).status).toBe(200);
      expect((await http().get(`/api/assinaturas-internas/${docAss}/arquivo`).set(bearer(deB.token))).status).toBe(404);
      expect((await http().get(`/api/fase-interna/${lic.id}/documentos/TR/assinatura`).set(bearer(deB.token))).status).toBe(404);
    });

    it('A. só o signatário assina: outro usuário 403, login do órgão 403, outro órgão 404', async () => {
      expect((await http().post(`/api/assinaturas-internas/${docAss}/assinar`).set(bearer(paulo.token))).status).toBe(403);
      expect((await http().post(`/api/assinaturas-internas/${docAss}/assinar`).set(bearer(A.token))).status).toBe(403);
      expect((await http().post(`/api/assinaturas-internas/${docAss}/assinar`).set(bearer(deB.token))).status).toBe(404);
      expect((await http().post(`/api/fase-interna/${lic.id}/documentos/TR/assinar`).set(bearer(paulo.token))).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/documentos/TR/assinar`).set(bearer(deB.token))).status).toBe(404);
      const [d] = await sql(`SELECT status::text AS status FROM documentos_fase_interna WHERE id = $1`, [docTr]);
      expect(d.status).toBe('AGUARDANDO_ASSINATURA');
    });

    it('A. o signatário assina pela Central: peça ASSINADA, tarefa concluída, sai da lista', async () => {
      const r = (await http().post(`/api/assinaturas-internas/${docAss}/assinar`).set(bearer(carlos.token)).expect(201)).body;
      expect(r).toMatchObject({ concluida: true, status: 'ASSINADO', peca: { tipo: 'TR', versao: 1 } });
      await esperar();
      const [t] = await sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 AND origem = 'ASSINATURA'`, [lic.id]);
      expect(t).toMatchObject({ status: 'CONCLUIDA', concluida_por_id: carlos.id });
      expect((await http().get('/api/assinaturas-internas/pendentes').set(bearer(carlos.token)).expect(200)).body.itens).toEqual([]);
      expect(itemDe(await instrucao(lic), 'TR').status).toBe('OK');
      expect((await http().post(`/api/assinaturas-internas/${docAss}/assinar`).set(bearer(carlos.token))).status).toBe(409);
    });

    it('B. versão nova em assinatura e depois TR anexado: a tarefa da versão substituída é cancelada; as seções continuam como base, com quem anexou', async () => {
      // editar a peça assinada abre a v2 COM o texto da v1 (antes nascia vazia)
      await http().patch(`/api/fase-interna/${lic.id}/documentos/TR/secao/prazo`).set(bearer(carlos.token)).send({ html: '<p>Entrega em 10 dias.</p>' }).expect(200);
      const [v2] = await sql(`SELECT id::text AS id, versao, dados_estruturados FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'TR' AND versao_atual`, [lic.id]);
      expect(v2.versao).toBe(2);
      expect(v2.dados_estruturados.objeto).toMatch(/papel A4/);
      await http().post(`/api/fase-interna/${lic.id}/documentos/TR/assinatura`).set(bearer(carlos.token)).send({ signatarios: [{ usuario_id: paulo.id, papel: 'Presidente' }] }).expect(201);
      await esperar();
      expect((await http().get('/api/assinaturas-internas/pendentes').set(bearer(paulo.token)).expect(200)).body.itens).toHaveLength(1);
      // Carlos anexa o TR feito fora (v3): o pedido da v2 morre e a tarefa do Paulo é cancelada
      expect((await anexar(lic, 'TR', carlos.token)).status).toBe(201);
      await ctx.app.get(TarefasService).agendar(lic.id);
      await esperar();
      const [tp] = await sql(`SELECT status FROM tarefas WHERE licitacao_id = $1 AND chave = $2`, [lic.id, `assinatura:${v2.id}:${paulo.id}`]);
      expect(tp.status).toBe('CANCELADA');
      expect((await http().get('/api/assinaturas-internas/pendentes').set(bearer(paulo.token)).expect(200)).body.itens).toEqual([]);
      // a tela do TR: a vigente é o anexo (de Carlos), mas as seções da v2 continuam como base
      const tela = (await http().get(`/api/fase-interna/${lic.id}/tr`).set(bearer(carlos.token)).expect(200)).body;
      expect(tela.tr.peca).toMatchObject({ versao: 3, anexada: true });
      expect(tela.tr.base).toMatchObject({ versao: 2 });
      expect(tela.tr.secoes.objeto).toMatch(/papel A4/);
      expect(tela.tr.secoes.prazo).toMatch(/10 dias/);
      expect(Array.isArray(tela.obrigatorias_faltando)).toBe(true);
      const tr = itemDe(await instrucao(lic), 'TR');
      expect(tr.status).toBe('OK');
      expect(tr.peca).toMatchObject({ versao: 3, anexada: true, registrada_por: 'Carlos Compras' });
      const versoes = (await http().get(`/api/fase-interna/${lic.id}/documentos/TR`).set(bearer(carlos.token)).expect(200)).body;
      expect(versoes.find((v: any) => v.versao === 3).criado_por_nome).toBe('Carlos Compras');
    });

    it('B. "Gerar TR" a partir da base: versão nova, emitida = pronta; salvar a seção com o mesmo texto não a desapronta', async () => {
      const g = (await http().post(`/api/fase-interna/${lic.id}/documentos/TR/gerar`).set(bearer(carlos.token)).expect(201)).body;
      expect(g.peca).toMatchObject({ versao: 4, anexada: false });
      expect(g.secoes.objeto).toMatch(/papel A4/);
      expect(itemDe(await instrucao(lic), 'TR').status).toBe('OK');
      // o editor, ao montar, salva de novo o mesmo texto: nada muda
      await http().patch(`/api/fase-interna/${lic.id}/documentos/TR/secao/objeto`).set(bearer(carlos.token)).send({ html: g.secoes.objeto }).expect(200);
      const tr = itemDe(await instrucao(lic), 'TR');
      expect(tr.status).toBe('OK');
      expect(tr.peca.versao).toBe(4);
      // texto novo: volta a "em elaboração"
      await http().patch(`/api/fase-interna/${lic.id}/documentos/TR/secao/objeto`).set(bearer(carlos.token)).send({ html: '<p>Aquisição de papel A4 reciclado.</p>' }).expect(200);
      expect(itemDe(await instrucao(lic), 'TR').status).toBe('EM_ELABORACAO');
      await http().post(`/api/fase-interna/${lic.id}/documentos/TR/gerar`).set(bearer(carlos.token)).expect(201);
      expect(itemDe(await instrucao(lic), 'TR').status).toBe('OK');
    });

    it('C. diligência na tela da peça: quem pode sanar, exige versão nova (ou "não há o que alterar"); outro órgão 404', async () => {
      await http()
        .post(`/api/fase-interna/${lic.id}/parecer/diligencias`)
        .set(bearer(julia.token))
        .send({ tipo_alvo: 'TR', descricao: 'O TR não traz o prazo de garantia (art. 40).', trecho: 'garantia' })
        .expect(201);
      const lista = (await http().get(`/api/fase-interna/${lic.id}/diligencias?tipo=TR`).set(bearer(carlos.token)).expect(200)).body;
      expect(lista.diligencias).toHaveLength(1);
      const d = lista.diligencias[0];
      expect(d).toMatchObject({ status: 'ABERTA', aberta_por_nome: 'Júlia Jurídico', pode_sanar: true, versao_nova_pronta: false, trecho: 'garantia' });
      expect((await http().get(`/api/fase-interna/${lic.id}/diligencias?tipo=TR`).set(bearer(paulo.token)).expect(200)).body.diligencias[0].pode_sanar).toBe(false);
      expect((await http().get(`/api/fase-interna/${lic.id}/diligencias?tipo=TR`).set(bearer(deB.token))).status).toBe(404);
      const url = `/api/fase-interna/${lic.id}/parecer/diligencias/${d.id}/sanar`;
      // sem versão nova: 400; "não há o que alterar" sem explicação: 400; outro usuário 403; outro órgão 403/404
      expect((await http().post(url).set(bearer(carlos.token)).send({ retorno: 'PECA' })).status).toBe(400);
      expect((await http().post(url).set(bearer(carlos.token)).send({ retorno: 'PECA', sem_alteracao: true, resposta: 'curta' })).status).toBe(400);
      expect((await http().post(url).set(bearer(paulo.token)).send({ retorno: 'PECA', sem_alteracao: true, resposta: 'Não há o que alterar no TR.' })).status).toBe(403);
      expect([403, 404]).toContain((await http().post(url).set(bearer(deB.token)).send({ retorno: 'PECA' })).status);
      // versão nova (anexada) → sanar pela tela da peça
      expect((await anexar(lic, 'TR', carlos.token)).status).toBe(201);
      const depois = (await http().get(`/api/fase-interna/${lic.id}/diligencias?tipo=TR`).set(bearer(carlos.token)).expect(200)).body;
      expect(depois.diligencias[0].versao_nova_pronta).toBe(true);
      const r = (await http().post(url).set(bearer(carlos.token)).send({ retorno: 'PECA', resposta: 'Incluído o prazo de garantia.' }).expect(201)).body;
      expect(r.diligencias[0]).toMatchObject({ status: 'SANADA', sanada_por_nome: 'Carlos Compras' });
      await esperar();
      const [t] = await sql(`SELECT status FROM tarefas WHERE licitacao_id = $1 AND chave = $2`, [lic.id, `diligencia:${d.id}`]);
      expect(t.status).toBe('CONCLUIDA');
    });
  });

  // ==========================================================================
  describe('D–E. próximo destino (depois da autorização e para o Jurídico) e desfazer "não se aplica"', () => {
    let lic: LicitacaoFixture;
    const tramitar = (para: string, despacho: string) =>
      http().post(`/api/fase-interna/${lic.id}/tramitar`).set(bearer(A.token)).send({ para_setor_id: para, despacho });
    const sugestao = async (token = A.token) => {
      await esperar();
      return (await http().get(`/api/fase-interna/${lic.id}/tramitacao/sugestao-envio`).set(bearer(token)).expect(200)).body;
    };

    beforeAll(async () => {
      // sem agente designado (o condutor não resolve o papel do agente)
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      for (const t of ['DFD', 'TR', 'PP', 'DO']) expect((await anexar(lic, t, A.token)).status).toBe(201);
      const inst = await instrucao(lic);
      for (const i of inst.itens) {
        if (['DFD', 'TR', 'PP', 'DO', 'AA', 'PJ', 'RAG', 'ME', 'MC', 'JC'].includes(i.tipo) || i.status === 'OK') continue;
        if (i.pode_nao_se_aplicar) expect((await naoSeAplica(lic, i.tipo, A.token)).status).toBe(201);
      }
      expect((await anexar(lic, 'AA', A.token)).status).toBe(201);
      await esperar();
    });

    it('D. depois da autorização: sugere o setor do agente (Licitações) — o suporte sem setor com o mesmo papel não tira a sugestão', async () => {
      await tramitar(setor.presidencia, 'À Presidência para a autorização.').expect(201);
      const s = await sugestao(paulo.token);
      const principal = s.destinos.find((d: any) => d.principal);
      expect(principal).toMatchObject({ setor_id: setor.licitacoes });
      expect(principal.etapas.map(([c]: [string]) => c)).toContain('MINUTAS');
      expect(s.despacho_sugerido).toMatch(/Licitações/);
    });

    it('D. depois das minutas: sugere o Jurídico (7b), mesmo com o agente também tendo o papel Jurídico', async () => {
      for (const t of ['RAG', 'ME', 'MC']) {
        const r = await anexar(lic, t, A.token);
        expect([201, 400]).toContain(r.status); // tipo fora da instrução desta modalidade: recusado
      }
      const inst = await instrucao(lic);
      for (const i of inst.itens) if (i.tipo === 'JC' && i.status !== 'OK' && i.pode_nao_se_aplicar) await naoSeAplica(lic, 'JC', A.token);
      await tramitar(setor.licitacoes, 'A Licitações para as minutas.').expect(201);
      const s = await sugestao(ana.token);
      const principal = s.destinos.find((d: any) => d.principal);
      expect(principal).toMatchObject({ setor_id: setor.juridico });
      expect(principal.etapas.map(([c]: [string]) => c)).toEqual(['PARECER']);
      expect(s.despacho_sugerido).toMatch(/Jurídico/);
      expect(s.etapas_sem_destino).toEqual([]);
    });

    it('E. desfazer "não se aplica" de etapa concluída: motivo obrigatório; só quem conduz ou o responsável; dependentes "a revisar"', async () => {
      const url = `/api/fase-interna/${lic.id}/instrucao/ETP/nao-se-aplica`;
      expect((await http().post(url).set(bearer(carlos.token)).send({ desfazer: true })).status).toBe(400);
      expect((await http().post(url).set(bearer(julia.token)).send({ desfazer: true, motivo: 'Precisamos do estudo técnico completo.' })).status).toBe(403);
      await http().post(url).set(bearer(carlos.token)).send({ desfazer: true, motivo: 'Precisamos do estudo técnico completo.' }).expect(201);
      await esperar();
      const etapas = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(carlos.token)).expect(200)).body;
      const passos = etapas.etapas.flatMap((e: any) => e.passos);
      expect(passos.find((p: any) => p.passo === 'ETP').situacao).not.toBe('CONCLUIDO');
      expect(passos.find((p: any) => p.passo === 'AUTORIZACAO').situacao).toBe('A_REVISAR');
      expect(etapas.historico.some((h: any) => /reaberta/.test(h.descricao) && /estudo técnico completo/.test(h.descricao))).toBe(true);
      // "Voltar" na tela da etapa: o responsável (Paulo, autoridade) pode voltar a autorização; Júlia não
      expect(passos.find((p: any) => p.passo === 'AUTORIZACAO').pode_reabrir).toBe(false); // Carlos não é o responsável
      const doPaulo = (await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(paulo.token)).expect(200)).body.etapas.flatMap((e: any) => e.passos);
      expect(doPaulo.find((p: any) => p.passo === 'AUTORIZACAO').pode_reabrir).toBe(true);
      expect((await http().post(`/api/fase-interna/${lic.id}/etapas/AUTORIZACAO/reabrir`).set(bearer(julia.token)).send({ motivo: 'Tentativa de quem não responde.' })).status).toBe(403);
      expect((await http().post(`/api/fase-interna/${lic.id}/etapas/AUTORIZACAO/reabrir`).set(bearer(deB.token)).send({ motivo: 'Outro órgão tentando reabrir.' })).status).toBe(403);
    });
  });
});
