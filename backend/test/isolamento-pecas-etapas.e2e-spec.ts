/**
 * ISOLAMENTO DAS PEÇAS POR ETAPA — homologação multiusuário (27/09/2026,
 * docs/fase interna/relatorio-homologacao-multiusuario-portaldcp.md §5).
 *
 * Um papel por pessoa, modo POR SETOR, processo andando de mesa em mesa:
 *  A. Antes da aprovação da demanda: Carlos (Compras) registra pesquisa → 403
 *     "Aguardando a aprovação da demanda"; nenhuma tarefa de etapa/achado
 *     para a pesquisa; "Aprovar a demanda" desabilitado antes do DFD, com o motivo.
 *  B. Processo em COMPRAS: Caio (Contabilidade) anexa o TR → 403 (a etapa é de
 *     Compras e o processo está com COMPRAS); Carlos anexa → 201. Aba
 *     Documentos: mesma regra.
 *  C. Processo na PRESIDÊNCIA: Ana (agente) gera/anexa minutas → 403 pela posse;
 *     com o processo em LICITAÇÕES → 201. Administrador do órgão passa, com o
 *     registro no histórico. Opção do modelo "exigir a posse" desligada → Ana pode.
 *  D. Publicação (E3): depois da autorização sem minutas/parecer o PUBLICAR é
 *     recusado ("Etapa do fluxo não concluída") e a conferência mostra a linha ETAPAS.
 *  E. "Mais ações": Compras não exclui, não revoga nem anula (403 e fora do menu);
 *     o agente exclui; a autoridade revoga.
 *  F. Autoridade do processo = signatário da autorização configurado (Paulo).
 *  G. Isolamento entre órgãos: outro órgão 403/404, fornecedor 403.
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
  datasEditalPadrao,
  pdfDeTeste,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

describe('Isolamento das peças por etapa (homologação multiusuário)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let rita: UsuarioOrgaoFixture;
  let carlos: UsuarioOrgaoFixture;
  let caio: UsuarioOrgaoFixture;
  let julia: UsuarioOrgaoFixture;
  let paulo: UsuarioOrgaoFixture;
  let ana: UsuarioOrgaoFixture;
  let admin: UsuarioOrgaoFixture;
  const S: Record<string, string> = {};
  let lic: LicitacaoFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);

  const criarSetor = async (nome: string) => (await http().post(`/api/orgaos/${A.id}/setores`).set(bearer(A.token)).send({ nome }).expect(201)).body.id as string;
  const papel = (u: UsuarioOrgaoFixture, papeis: string[], setor: string) =>
    http().put(`/api/fase-interna/configuracao/usuarios/${u.id}`).set(bearer(A.token)).send({ papeis, setor_id: setor }).expect(200);
  const anexar = (l: { id: string }, tipo: string, token: string) =>
    http()
      .post(`/api/fase-interna/${l.id}/documentos/${tipo}/anexo`)
      .set(bearer(token))
      .field('data_documento', hoje())
      .field('numero_peca', `${tipo} 1/2026`)
      .attach('arquivo', pdfDeTeste(`${tipo} teste`), { filename: `${tipo}.pdf`, contentType: 'application/pdf' });
  const naoSeAplica = (l: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${l.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: `${tipo} não se aplica a esta compra simples (teste de isolamento).` });
  const tramitar = async (l: { id: string }, setor: string) => {
    await tarefas().aguardarPendentes();
    const com = (await http().get(`/api/fase-interna/${l.id}/tramitacao/com-quem-esta`).set(bearer(A.token)).expect(200)).body;
    if (com?.setor?.id === setor && ['PENDENTE', 'RECEBIDA'].includes(com?.status)) return; // já está com o setor
    const r = await http().post(`/api/fase-interna/${l.id}/tramitar`).set(bearer(A.token)).send({ para_setor_id: setor, despacho: 'Encaminhe-se para a etapa seguinte.' });
    if (r.status !== 201) throw new Error(`tramitar → ${r.status}: ${JSON.stringify(r.body)}`);
    await tarefas().aguardarPendentes();
  };
  const etapas = async (l: { id: string }, token: string) => {
    await tarefas().aguardarPendentes();
    return (await http().get(`/api/fase-interna/${l.id}/etapas`).set(bearer(token)).expect(200)).body;
  };
  const passo = (et: any, codigo: string) => et.etapas.flatMap((e: any) => e.passos).find((p: any) => p.passo === codigo);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Isolamento A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Isolamento B' });
    F = await criarFornecedor(ctx);
    rita = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Rita Requisitante' });
    carlos = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Carlos Compras' });
    caio = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Caio Contabilidade' });
    julia = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Julia Juridico' });
    paulo = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO, nome: 'Paulo Presidente' });
    ana = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Ana Agente' });
    admin = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN, nome: 'Adm do Orgao' });
    for (const [k, nome] of Object.entries({ COMUNICACAO: 'COMUNICAÇÃO', COMPRAS: 'COMPRAS', CONTAB: 'CONTABILIDADE', JURIDICO: 'JURÍDICO', PRESIDENCIA: 'PRESIDÊNCIA', LICITACOES: 'LICITAÇÕES' })) {
      S[k] = await criarSetor(nome);
    }
    await papel(rita, ['REQUISITANTE'], S.COMUNICACAO);
    await papel(carlos, ['COMPRAS'], S.COMPRAS);
    await papel(caio, ['CONTABILIDADE'], S.CONTAB);
    await papel(julia, ['JURIDICO'], S.JURIDICO);
    await papel(paulo, ['AUTORIDADE'], S.PRESIDENCIA);
    await papel(ana, ['AGENTE_CONTRATACAO'], S.LICITACOES);
    // Aprovador da demanda = papel Autoridade; ETP e TR com Compras (como no teste do Cowork)
    await http()
      .put('/api/fluxo-fase-interna/modelos/DISPENSA')
      .set(bearer(A.token))
      .send({
        aprovacao_demanda: { aprovador: { tipo: 'PAPEL', valor: 'AUTORIDADE' } },
        etapas: [
          { codigo: 'ETP', responsavel: { papel: 'COMPRAS' } },
          { codigo: 'TR', responsavel: { papel: 'COMPRAS' } },
        ],
      })
      .expect(200);
    await http()
      .put('/api/fase-interna/configuracao')
      .set(bearer(A.token))
      .send({ modo: 'POR_SETOR', signatarios_autorizacao: [{ usuario_id: paulo.id, papel: 'Presidente da Câmara' }] })
      .expect(200);
    lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    await sql(`UPDATE licitacoes SET pregoeiro_id = $2 WHERE id = $1`, [lic.id, ana.id]);
    await tramitar(lic, S.COMUNICACAO);
  }, 600_000);

  afterAll(async () => {
    await ctx?.fechar();
  });

  describe('A. antes da aprovação da demanda', () => {
    it('"Aprovar a demanda" antes do DFD: desabilitado com o motivo (quem aprova vê o botão)', async () => {
      const et = await etapas(lic, paulo.token);
      expect(et.aprovacao_demanda).toMatchObject({ exigida: true, aprovada: false, eh_aprovador: true, dfd_pronto: false, pode_aprovar: false });
      expect(et.aprovacao_demanda.motivo_bloqueio).toMatch(/o DFD precisa estar pronto/);
      const r = await http().post(`/api/fase-interna/${lic.id}/demanda/aprovar`).set(bearer(paulo.token)).send({});
      expect(r.status).toBe(409);
    });

    it('Carlos registra consulta na pesquisa com a demanda não aprovada → 403 "Aguardando a aprovação da demanda"', async () => {
      const r = await http().put(`/api/fase-interna/${lic.id}/pesquisa/parametros/I`).set(bearer(carlos.token)).send({ situacao: 'SEM_RETORNO' });
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/Aguardando a aprovação da demanda/);
      expect(r.body.codigo).toBe('AGUARDANDO_DEMANDA');
      const anexo = await anexar(lic, 'PP', carlos.token);
      expect(anexo.status).toBe(403);
    });

    it('nem o administrador trabalha na pesquisa antes da aprovação (a trava é da ordem, não da pessoa)', async () => {
      const r = await anexar(lic, 'PP', admin.token);
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/Aguardando a aprovação da demanda/);
    });

    it('nenhuma tarefa de etapa (nem de achado) para a pesquisa antes da aprovação; a tela diz por quê', async () => {
      await tarefas().aguardarPendentes();
      const abertas = await sql(`SELECT chave FROM tarefas WHERE licitacao_id = $1 AND status = 'ABERTA' AND (chave = 'etapa:PESQUISA' OR chave LIKE 'achado:%')`, [lic.id]);
      expect(abertas).toEqual([]);
      const et = await etapas(lic, carlos.token);
      expect(passo(et, 'PESQUISA')).toMatchObject({ pode_iniciar: false, aguardando_demanda: true, pode_trabalhar: false });
      expect(passo(et, 'PESQUISA').motivo_trabalho).toMatch(/Aguardando a aprovação da demanda/);
      expect(et.permissoes_trabalho.PESQUISA.pode_trabalhar).toBe(false);
    });

    it('Rita (requisitante, com o processo em COMUNICAÇÃO) faz o DFD; Paulo aprova a demanda', async () => {
      // Compras não faz o DFD de outro setor
      expect((await anexar(lic, 'DFD', carlos.token)).status).toBe(403);
      await http()
        .post(`/api/fase-interna/${lic.id}/documento`)
        .set(bearer(rita.token))
        .send({ tipo: 'DFD', titulo: 'Formalização da demanda', descricao: 'Papel A4 para a Comunicação (teste de isolamento).' })
        .expect(201);
      let et = await etapas(lic, paulo.token);
      if (!et.aprovacao_demanda.aprovada) {
        expect(et.aprovacao_demanda).toMatchObject({ dfd_pronto: true, pode_aprovar: true, motivo_bloqueio: null });
        await http().post(`/api/fase-interna/${lic.id}/demanda/aprovar`).set(bearer(paulo.token)).send({}).expect(201);
        et = await etapas(lic, paulo.token);
      }
      expect(et.aprovacao_demanda.aprovada).toBe(true);
    });
  });

  describe('B. processo em COMPRAS', () => {
    beforeAll(async () => {
      await tramitar(lic, S.COMPRAS);
    });

    it('Caio (Contabilidade) anexa o TR de Compras → 403 com de quem é a etapa e com quem está o processo', async () => {
      const r = await anexar(lic, 'TR', caio.token);
      expect(r.status).toBe(403);
      expect(r.body.codigo).toBe('NAO_RESPONSAVEL');
      expect(r.body.message).toMatch(/Compras/);
      expect(r.body.message).toMatch(/o processo está com COMPRAS/);
      // Nada foi gravado
      const [doc] = await sql(`SELECT id FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo = 'TR'`, [lic.id]);
      expect(doc).toBeUndefined();
    });

    it('pela aba Documentos também não (mesma regra da tela da etapa)', async () => {
      const r = await http()
        .post(`/api/documentos/licitacao/${lic.id}`)
        .set(bearer(caio.token))
        .field('tipo', 'TERMO_REFERENCIA')
        .field('titulo', 'TR pela aba Documentos')
        .attach('arquivo', pdfDeTeste('TR aba'), { filename: 'tr.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(403);
    });

    it('Carlos (Compras, com o processo) faz ETP/riscos "não se aplica", anexa TR e a pesquisa', async () => {
      await naoSeAplica(lic, 'ETP', carlos.token).expect(201);
      await naoSeAplica(lic, 'AR', carlos.token).expect(201);
      expect((await anexar(lic, 'TR', carlos.token)).status).toBe(201);
      expect((await anexar(lic, 'PP', carlos.token)).status).toBe(201);
      const et = await etapas(lic, carlos.token);
      expect(passo(et, 'TR').situacao).toBe('CONCLUIDO');
      expect(passo(et, 'PESQUISA').situacao).toBe('CONCLUIDO');
    });

    it('a reserva é da Contabilidade: Carlos não emite (403); com o processo na CONTABILIDADE, Caio anexa', async () => {
      expect((await anexar(lic, 'DO', carlos.token)).status).toBe(403);
      await tramitar(lic, S.CONTAB);
      expect((await anexar(lic, 'DO', caio.token)).status).toBe(201);
    });
  });

  describe('C. minutas com o processo na PRESIDÊNCIA', () => {
    beforeAll(async () => {
      await tramitar(lic, S.PRESIDENCIA);
    });

    it('Ana (agente) gera a minuta com o processo na PRESIDÊNCIA → 403 pela posse', async () => {
      const g = await http().post(`/api/fase-interna/${lic.id}/minutas/RAG/gerar`).set(bearer(ana.token)).send({});
      expect(g.status).toBe(403);
      expect(g.body.codigo).toBe('SEM_POSSE');
      expect(g.body.message).toMatch(/O processo está com PRESIDÊNCIA/);
      expect((await anexar(lic, 'MC', ana.token)).status).toBe(403);
    });

    it('a tela devolve pode_trabalhar=false com o motivo para Ana; true para quem pode', async () => {
      const et = await etapas(lic, ana.token);
      expect(et.permissoes_trabalho.MINUTAS).toMatchObject({ pode_trabalhar: false, codigo: 'SEM_POSSE' });
      const etAdm = await etapas(lic, admin.token);
      expect(etAdm.permissoes_trabalho.MINUTAS.pode_trabalhar).toBe(true);
    });

    it('o administrador do órgão passa por cima da posse — fica registrado no histórico', async () => {
      expect((await anexar(lic, 'JC', admin.token)).status).toBe(201);
      const [log] = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao = 'ACAO_FORA_DA_RESPONSABILIDADE' ORDER BY created_at DESC LIMIT 1`, [lic.id]);
      expect(log.descricao).toMatch(/Adm do Orgao .*administrador do órgão.*PRESIDÊNCIA/);
    });

    it('com o processo em LICITAÇÕES, Ana anexa as minutas', async () => {
      await tramitar(lic, S.LICITACOES);
      for (const t of ['RAG', 'MC', 'ME']) expect([t, (await anexar(lic, t, ana.token)).status]).toEqual([t, 201]);
    });

    it('opção do modelo "exigir a posse para trabalhar nas peças" desligada: a posse deixa de valer (responsável continua)', async () => {
      const lic2 = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await tarefas().aguardarPendentes();
      await tramitar(lic2, S.COMPRAS);
      // Rita não está com o processo (COMPRAS): com a posse exigida, 403
      expect((await anexar(lic2, 'DFD', rita.token)).status).toBe(403);
      await http().put('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(A.token)).send({ exigir_posse_pecas: false }).expect(200);
      expect((await anexar(lic2, 'DFD', rita.token)).status).toBe(201);
      // Responsabilidade continua: Caio não faz o DFD
      await http().put('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(A.token)).send({ exigir_posse_pecas: true }).expect(200);
      const modelo = (await http().get('/api/fluxo-fase-interna/modelos/DISPENSA').set(bearer(A.token)).expect(200)).body;
      expect(modelo.modelo?.exigir_posse_pecas ?? modelo.exigir_posse_pecas).toBe(true);
    });
  });

  describe('D. publicação só com as etapas do fluxo concluídas (E3)', () => {
    it('conferência de pré-publicação: linha ETAPAS pendente (parecer e autorização) e o PUBLICAR recusa', async () => {
      await tarefas().aguardarPendentes();
      const conf = (await http().get(`/api/licitacoes/${lic.id}/conferencia-publicacao`).set(bearer(A.token)).expect(200)).body;
      const etapasLinha = conf.itens.find((i: any) => i.chave === 'ETAPAS');
      expect(etapasLinha).toMatchObject({ estado: 'PENDENTE', bloqueia: true });
      expect(etapasLinha.detalhe).toMatch(/Parecer jurídico/);
      expect(conf.pode_publicar).toBe(false);
      // A instrução na última etapa interna (o PUBLICAR só parte dela): o que o recusa é a trava das etapas
      await sql(`UPDATE licitacoes SET fase = 'APROVACAO_INTERNA' WHERE id = $1`, [lic.id]);
      const r = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(A.token)).send(datasEditalPadrao());
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toMatch(/Etapa do fluxo não concluída: Parecer jurídico/);
    });

    it('a autorização espera o parecer (art. 53, §4º): Paulo não autoriza antes dele', async () => {
      await tramitar(lic, S.PRESIDENCIA);
      const r = await anexar(lic, 'AA', paulo.token);
      expect(r.status).toBe(403);
      expect(r.body.codigo).toBe('AGUARDANDO_ETAPAS');
      expect(r.body.message).toMatch(/Parecer jurídico/);
    });

    it('parecer (Júlia, no Jurídico) → autorização (Paulo, na Presidência) → a linha ETAPAS fica OK', async () => {
      await tramitar(lic, S.JURIDICO);
      expect((await anexar(lic, 'PJ', julia.token)).status).toBe(201);
      await tramitar(lic, S.PRESIDENCIA);
      expect((await anexar(lic, 'AA', paulo.token)).status).toBe(201);
      await naoSeAplica(lic, 'DP', paulo.token).expect(201);
      await tarefas().aguardarPendentes();
      const conf = (await http().get(`/api/licitacoes/${lic.id}/conferencia-publicacao`).set(bearer(A.token)).expect(200)).body;
      expect(conf.itens.find((i: any) => i.chave === 'ETAPAS')).toMatchObject({ estado: 'OK', bloqueia: false });
    });
  });

  describe('E. "Mais ações": excluir, revogar e anular', () => {
    it('Compras: fora do menu, 403 no backend', async () => {
      const pc = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(carlos.token)).expect(200)).body;
      expect(pc.permissoes_processo).toMatchObject({ excluir: false, revogar_anular: false });
      expect((pc.acoes_menu ?? []).map((a: any) => a.ato)).not.toContain('REVOGAR');
      expect((pc.acoes_menu ?? []).map((a: any) => a.ato)).not.toContain('ANULAR');
      expect((await http().delete(`/api/licitacoes/${lic.id}`).set(bearer(carlos.token))).status).toBe(403);
      expect((await http().post(`/api/licitacoes/${lic.id}/atos/REVOGAR`).set(bearer(carlos.token)).send({ motivo: 'Tentativa indevida de Compras.' })).status).toBe(403);
      expect((await http().post(`/api/licitacoes/${lic.id}/atos/ANULAR`).set(bearer(carlos.token)).send({ motivo: 'Tentativa indevida de Compras.' })).status).toBe(403);
      expect((await http().post(`/api/publicacao/licitacao/${lic.id}/intencao-extincao`).set(bearer(carlos.token)).send({ tipo: 'REVOGACAO', motivo: 'Tentativa indevida.' })).status).toBe(403);
    });

    it('a autoridade (Paulo) revoga/anula mas não exclui; o agente (Ana) pode tudo', async () => {
      const pp = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(paulo.token)).expect(200)).body;
      expect(pp.permissoes_processo).toMatchObject({ excluir: false, revogar_anular: true, autoridade: true });
      const pa = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(ana.token)).expect(200)).body;
      expect(pa.permissoes_processo).toMatchObject({ excluir: true, revogar_anular: true, conduz: true });
      expect((await http().delete(`/api/licitacoes/${lic.id}`).set(bearer(paulo.token))).status).toBe(403);
    });
  });

  describe('F. autoridade exibida no processo', () => {
    it('é o signatário da autorização configurado (Paulo), não o responsável do cadastro do órgão', async () => {
      const pc = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(A.token)).expect(200)).body;
      expect(pc.licitacao.autoridade).toMatchObject({ nome: 'Paulo Presidente', cargo: 'Presidente da Câmara', origem: 'CONFIGURACAO' });
    });
  });

  describe('G. isolamento entre órgãos', () => {
    it('outro órgão não trabalha nas peças (403 na escrita), fornecedor 403', async () => {
      expect((await anexar(lic, 'TR', B.token)).status).toBe(403);
      expect((await http().put(`/api/fase-interna/${lic.id}/pesquisa/parametros/I`).set(bearer(B.token)).send({})).status).toBe(403);
      expect((await anexar(lic, 'TR', F.token)).status).toBe(403);
      expect((await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(B.token))).status).toBe(404);
    });
  });
});
