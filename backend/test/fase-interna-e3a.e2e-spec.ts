/**
 * FASE INTERNA — ENTREGA 3A (telas por etapa: DFD, ETP, TR, pesquisa de
 * preços e reserva orçamentária). docs/licitacao/PLANO-FASE-INTERNA.md §9.
 *
 *  A. Fluxo da dispensa: DFD (campos das tabelas, PCA/justificativa, gerar
 *     pelo modelo) → ETP "não se aplica" (art. 72, I) → TR gerado do processo
 *     (fundamento legal único) → pesquisa (parâmetros do art. 23 com "sem
 *     retorno", 3 cotações, método e justificativas, mapa e certidão) →
 *     reserva com 2 exercícios → as tarefas da Entrega 2 concluem sozinhas.
 *     Renovar dotação cria a versão nova e a tarefa (que a sincronização não
 *     mexe) e a nova emissão a conclui.
 *  B. Pesquisa feita fora: anexar o mapa + valor unitário nos itens.
 *  C. Assistente do ETP: marca detectada, sugestão nunca aplicada sem clique,
 *     texto aceito registrado como do usuário; IA indisponível não quebra.
 *  D. Isolamento em todos os endpoints novos: outro órgão (leitura 404 /
 *     escrita 403), fornecedor 403, anônimo 401; tabelas orçamentárias só do
 *     órgão do token.
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
  cumprirEtapasAnteriores,
} from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { TarefasService } from '../src/fase-interna/tarefas/tarefas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ANO = Number(hoje().slice(0, 4));

describe('Fase interna — Entrega 3A (telas por etapa)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F: FornecedorFixture;
  let agente: UsuarioOrgaoFixture;
  let setorA: string;
  let setorB: string;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);
  const tarefas = () => ctx.app.get(TarefasService);
  const tarefasDoProcesso = async (lic: { id: string }) => {
    await tarefas().aguardarPendentes();
    return sql(`SELECT * FROM tarefas WHERE licitacao_id = $1 ORDER BY created_at`, [lic.id]);
  };
  const situacaoDoPasso = async (lic: { id: string }, passo: string) =>
    (await tarefasDoProcesso(lic)).filter((t: any) => t.passo === passo && t.origem === 'ETAPA').map((t: any) => t.status);
  const naoSeAplica = (lic: { id: string }, tipo: string, token: string) =>
    http().post(`/api/fase-interna/${lic.id}/instrucao/${tipo}/nao-se-aplica`).set(bearer(token)).send({ justificativa: 'Contratação direta de objeto simples (art. 72, I — "se for o caso").' });

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara E3A A' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E3A B' });
    F = await criarFornecedor(ctx);
    agente = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO, nome: 'Joana Agente' });
    [{ id: setorA }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'DAF', 'Diretoria Administrativa') RETURNING id::text AS id`, [A.id]);
    [{ id: setorB }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, 'SEC', 'Secretaria de B') RETURNING id::text AS id`, [B.id]);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('A. dispensa: DFD → ETP (não se aplica) → TR → pesquisa → reserva', () => {
    let lic: LicitacaoFixture;
    let dotacaoAno: string;
    let dotacaoProx: string;
    let ldoAno: string;
    let loaAno: string;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
    });

    it('DFD: tela com checklist e listas das tabelas; salva campos, justificativa de ausência de PCA e necessidade', async () => {
      const r0 = await http().get(`/api/fase-interna/${lic.id}/dfd`).set(bearer(agente.token)).expect(200);
      expect(r0.body.opcoes.setores.map((s: any) => s.id)).toEqual([setorA]);
      expect(r0.body.checklist.find((c: any) => c.chave === 'pca').ok).toBe(false);
      expect(r0.body.checklist.find((c: any) => c.chave === 'itens').texto).toMatch(/2 itens sem código CATMAT\/CATSER/);
      expect(await situacaoDoPasso(lic, 'DFD')).toEqual(['ABERTA']);

      // setor de outro órgão: recusado (lista vem da tabela do órgão)
      await http().put(`/api/fase-interna/${lic.id}/dfd`).set(bearer(agente.token)).send({ unidade_requisitante_id: setorB }).expect(400);
      await http().put(`/api/fase-interna/${lic.id}/dfd`).set(bearer(agente.token)).send({ sem_pca: true, justificativa_sem_pca: 'curta' }).expect(400);

      const r = await http()
        .put(`/api/fase-interna/${lic.id}/dfd`)
        .set(bearer(agente.token))
        .send({
          unidade_requisitante_id: setorA,
          responsavel_id: agente.id,
          data_pretendida: somarDias(hoje(), 60),
          prioridade: 'MEDIA',
          sem_pca: true,
          justificativa_sem_pca: 'Demanda surgida após a aprovação do PCA do exercício (art. 12, §1º).',
          necessidade_html: '<p>As rotinas editoriais usam ferramentas fragmentadas e sem rastreabilidade.</p>',
        })
        .expect(200);
      expect(r.body.campos).toMatchObject({ unidade_requisitante_nome: 'Diretoria Administrativa', responsavel_nome: 'Joana Agente', prioridade: 'MEDIA' });
      expect(r.body.licitacao).toMatchObject({ sem_pca: true, item_pca_id: null });
      expect(r.body.checklist.find((c: any) => c.chave === 'pca').ok).toBe(true);
      expect(r.body.secoes.previsao).toMatch(/não consta do Plano de Contratações Anual/);
      expect(r.body.secoes.demanda).toMatch(/fragmentadas/);
    });

    it('DFD gerado pelo modelo (PDF): a tarefa da demanda conclui sozinha e libera ETP, TR e pesquisa', async () => {
      const g = await http().post(`/api/fase-interna/${lic.id}/documentos/DFD/gerar`).set(bearer(agente.token)).expect(201);
      expect(g.body.peca).toMatchObject({ tem_arquivo: true, origem: 'INTERNO' });
      expect(g.body.secoes.quantidade).toMatch(/Item E2E 1/);
      const pdf = await http().get(`/api/fase-interna/documento/${g.body.peca.documento_id}/arquivo`).set(bearer(agente.token)).expect(200);
      expect(pdf.headers['content-type']).toMatch(/pdf/);
      expect(await situacaoDoPasso(lic, 'DFD')).toEqual(['CONCLUIDA']);
      const abertas = (await tarefasDoProcesso(lic)).filter((t: any) => t.status === 'ABERTA').map((t: any) => t.passo).sort();
      expect(abertas).toEqual(['ETP', 'PESQUISA', 'TR']);
      // a caixa leva direto à tela da etapa
      const cx = (await http().get('/api/tarefas?aba=para-mim').set(bearer(agente.token)).expect(200)).body;
      const t = cx.tarefas.find((x: any) => x.processo.id === lic.id && x.passo === 'PESQUISA');
      expect(t.destino).toBe(`/orgao/processos/${lic.id}/fase-interna/pesquisa`);
    });

    it('ETP na dispensa: "não se aplica" (art. 72, I) com a análise de riscos conclui a etapa', async () => {
      const e = await http().get(`/api/fase-interna/${lic.id}/etp`).set(bearer(agente.token)).expect(200);
      expect(e.body.contratacao_direta).toBe(true);
      expect(e.body.instrucao.etp.pode_nao_se_aplicar).toBe(true);
      expect(e.body.obrigatorios_vazios.map((i: any) => i.inciso)).toEqual(['I', 'IV', 'VI', 'VIII', 'XIII']);
      expect((await naoSeAplica(lic, 'ETP', agente.token)).status).toBe(201);
      expect((await naoSeAplica(lic, 'AR', agente.token)).status).toBe(201);
      expect(await situacaoDoPasso(lic, 'ETP')).toEqual(['CONCLUIDA']);
      const e2 = await http().get(`/api/fase-interna/${lic.id}/etp`).set(bearer(agente.token)).expect(200);
      expect(e2.body.etp.peca).toMatchObject({ nao_se_aplica: true });
    });

    it('TR: fundamento legal lido do processo; gerado pela derivação (sem apagar o que existe); a tarefa conclui', async () => {
      const t0 = await http().get(`/api/fase-interna/${lic.id}/tr`).set(bearer(agente.token)).expect(200);
      expect(t0.body.fundamento_legal.codigo).toBe('ART75_II');
      expect(t0.body.fundamento_legal.texto).toMatch(/75/);
      expect(t0.body.itens).toHaveLength(2);
      expect(t0.body.valor_total).toBe(2000);
      expect(t0.body.dotacao).toBeNull();
      // seção escrita pelo usuário não é sobrescrita pela geração
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/TR/secao/modelo_execucao`)
        .set(bearer(agente.token))
        .send({ html: '<p>Entrega em até 10 dias na sede.</p>' })
        .expect(200);
      const g = await http().post(`/api/fase-interna/${lic.id}/documentos/TR/gerar`).set(bearer(agente.token)).expect(201);
      expect(g.body.secoes.fundamentacao).toMatch(/Fundamento legal: .*75/);
      expect(g.body.secoes.modelo_execucao).toBe('<p>Entrega em até 10 dias na sede.</p>');
      expect(g.body.secoes.estimativa_valor_tr).toMatch(/R\$\s?2\.000,00/);
      expect(g.body.peca.tem_arquivo).toBe(true);
      expect(await situacaoDoPasso(lic, 'TR')).toEqual(['CONCLUIDA']);
    });

    it('pesquisa: parâmetros do art. 23 com "consultado sem retorno"; 3 propostas; método e justificativas obrigatórios; mapa e certidão', async () => {
      const p0 = await http().get(`/api/fase-interna/${lic.id}/pesquisa`).set(bearer(agente.token)).expect(200);
      expect(p0.body.parametros.map((p: any) => p.situacao_tela)).toEqual(['PENDENTE', 'PENDENTE', 'PENDENTE', 'PENDENTE', 'PENDENTE']);
      expect(p0.body.consumo_limite).toMatchObject({ aplicavel: true, inciso: 'II' });

      await http().put(`/api/fase-interna/${lic.id}/pesquisa/parametros/I`).set(bearer(agente.token)).send({ situacao: 'SEM_RETORNO', data_consulta: hoje(), resultado: '0 resultados equivalentes' }).expect(200);
      await http().put(`/api/fase-interna/${lic.id}/pesquisa/parametros/II`).set(bearer(agente.token)).send({ situacao: 'SEM_RETORNO' }).expect(400); // sem data
      await http().put(`/api/fase-interna/${lic.id}/pesquisa/parametros/II`).set(bearer(agente.token)).send({ situacao: 'SEM_RETORNO', data_consulta: somarDias(hoje(), 1) }).expect(400); // futura
      const p1 = await http().put(`/api/fase-interna/${lic.id}/pesquisa/parametros/II`).set(bearer(agente.token)).send({ situacao: 'SEM_RETORNO', data_consulta: hoje(), resultado: '0 resultados' }).expect(200);
      expect(p1.body.parametros.slice(0, 2).map((p: any) => p.situacao_tela)).toEqual(['SEM_RETORNO', 'SEM_RETORNO']);
      const ev = await http()
        .post(`/api/fase-interna/${lic.id}/pesquisa/parametros/I/evidencia`)
        .set(bearer(agente.token))
        .attach('arquivo', pdfDeTeste('Painel sem resultado'), { filename: 'painel.pdf', contentType: 'application/pdf' })
        .expect(201);
      expect(ev.body.parametros[0].evidencia_nome).toBe('painel.pdf');
      await http().get(`/api/fase-interna/${lic.id}/pesquisa/arquivos/evidencia/I`).set(bearer(agente.token)).expect(200);

      // CNPJ inválido e emissão futura: recusados
      await http().post(`/api/fase-interna/${lic.id}/pesquisa/propostas`).set(bearer(agente.token)).send({ fornecedor: 'X', cnpj: '11111111111111', data_emissao: hoje(), itens: [{ item_numero: 1, valor_unitario: 90 }] }).expect(400);
      await http().post(`/api/fase-interna/${lic.id}/pesquisa/propostas`).set(bearer(agente.token)).send({ fornecedor: 'X', cnpj: gerarCnpj(), data_emissao: somarDias(hoje(), 2), itens: [{ item_numero: 1, valor_unitario: 90 }] }).expect(400);

      const propor = (fornecedor: string, v1: number, v2: number, validade: string) =>
        http()
          .post(`/api/fase-interna/${lic.id}/pesquisa/propostas`)
          .set(bearer(agente.token))
          .send({ fornecedor, cnpj: gerarCnpj(), data_emissao: hoje(), validade_ate: validade, itens: [{ item_numero: 1, valor_unitario: v1 }, { item_numero: 2, valor_unitario: v2 }] })
          .expect(201);
      const q1 = await propor('Alfa Comércio', 90, 45, somarDias(hoje(), 60));
      await propor('Beta Serviços', 100, 50, somarDias(hoje(), 60));
      await propor('Gama Ltda', 110, 55, somarDias(hoje(), 20));
      await http()
        .post(`/api/fase-interna/${lic.id}/pesquisa/propostas/${q1.body.grupo_id}/comprovante`)
        .set(bearer(agente.token))
        .attach('arquivo', pdfDeTeste('Proposta Alfa'), { filename: 'proposta.pdf', contentType: 'application/pdf' })
        .expect(201);

      // publicação prevista depois da validade da Gama → alerta
      const pm = await http().put(`/api/fase-interna/${lic.id}/pesquisa/metodo`).set(bearer(agente.token)).send({ publicacao_prevista: somarDias(hoje(), 45) }).expect(200);
      expect(pm.body.propostas).toHaveLength(3);
      expect(pm.body.propostas[0]).toMatchObject({ fornecedor: 'Alfa Comércio', total: 1800, comprovante: true });
      expect(pm.body.alertas.map((a: any) => a.tipo)).toEqual(expect.arrayContaining(['VENCE_ANTES_DA_PUBLICACAO', 'ESCOLHA_FORNECEDORES']));
      expect(pm.body.resumo.totais).toEqual({ MENOR: 1800, MEDIANA: 2000, MEDIA: 2000 });
      expect(pm.body.resumo.tres_precos.atende).toBe(true);
      expect(pm.body.parametros[3]).toMatchObject({ inciso: 'IV', situacao_tela: 'ATENDIDO' });

      // sem método/justificativas: não emite
      const e400 = await http().post(`/api/fase-interna/${lic.id}/pesquisa/emitir`).set(bearer(agente.token)).send({}).expect(400);
      expect(e400.body.pendencias.join(' ')).toMatch(/método/);
      await http()
        .put(`/api/fase-interna/${lic.id}/pesquisa/metodo`)
        .set(bearer(agente.token))
        .send({ metodo: 'MENOR', justificativa_metodo: 'Menor valor, conforme o regulamento do órgão (Portaria 089/2024).' })
        .expect(200);
      const e2 = await http().post(`/api/fase-interna/${lic.id}/pesquisa/emitir`).set(bearer(agente.token)).send({}).expect(400);
      expect(e2.body.pendencias.join(' ')).toMatch(/escolha dos fornecedores/);
      await http()
        .put(`/api/fase-interna/${lic.id}/pesquisa/metodo`)
        .set(bearer(agente.token))
        .send({ justificativa_fornecedores: 'Empresas do ramo com atuação comprovada no município e cadastro ativo.' })
        .expect(200);
      const em = await http().post(`/api/fase-interna/${lic.id}/pesquisa/emitir`).set(bearer(agente.token)).send({}).expect(201);
      expect(em.body.certidao.path).toBeTruthy();
      expect(em.body.peca.tem_arquivo).toBe(true);
      expect(em.body.resumo.total_adotado).toBe(1800);
      const cert = await http().get(`/api/fase-interna/${lic.id}/pesquisa/arquivos/certidao/pp`).set(bearer(agente.token)).expect(200);
      expect(cert.headers['content-type']).toMatch(/pdf/);
      // o valor de referência (menor) vira o valor dos itens na fase interna
      const itens = await sql(`SELECT numero_item, valor_unitario_estimado FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`, [lic.id]);
      expect(itens.map((i: any) => Number(i.valor_unitario_estimado))).toEqual([90, 45]);
      expect(await situacaoDoPasso(lic, 'PESQUISA')).toEqual(['CONCLUIDA']);
    });

    it('tabelas do órgão: dotações por exercício e leis (tabela única); validação', async () => {
      const dot = (exercicio: number) =>
        http()
          .post('/api/orcamento/dotacoes')
          .set(bearer(agente.token))
          .send({
            exercicio,
            unidade_orcamentaria: '01.01.000 — Câmara Municipal',
            projeto_atividade: '1.31.101.2.029 — Gestão das ações da TV e Rádio',
            elemento_despesa: '3.3.90.40 — Serviços de TIC — PJ',
            fonte_recurso: '500 — Recursos não vinculados de impostos',
            saldo: 100000,
          })
          .expect(201);
      dotacaoAno = (await dot(ANO)).body.id;
      dotacaoProx = (await dot(ANO + 1)).body.id;
      await http().post('/api/orcamento/dotacoes').set(bearer(agente.token)).send({ exercicio: ANO }).expect(400);
      ldoAno = (await http().post('/api/orcamento/leis').set(bearer(agente.token)).send({ tipo: 'LDO', numero: `1.234/${ANO - 1}`, exercicio: ANO }).expect(201)).body.id;
      loaAno = (await http().post('/api/orcamento/leis').set(bearer(agente.token)).send({ tipo: 'LOA', numero: `1.300/${ANO - 1}`, exercicio: ANO }).expect(201)).body.id;
      await http().post('/api/orcamento/leis').set(bearer(agente.token)).send({ tipo: 'LDO', numero: `1.400/${ANO}`, exercicio: ANO + 1 }).expect(201);
      await http().post('/api/orcamento/leis').set(bearer(agente.token)).send({ tipo: 'LEI', numero: '1', exercicio: ANO }).expect(400);
      const l = await http().get('/api/orcamento/leis').set(bearer(agente.token)).expect(200);
      expect(l.body).toHaveLength(3);
    });

    it('reserva com 2 exercícios: rascunho (autosave), emissão gera a peça DO pelo modelo e a tarefa conclui', async () => {
      const r0 = await http().get(`/api/fase-interna/${lic.id}/reserva`).set(bearer(agente.token)).expect(200);
      expect(r0.body.atual).toBeNull();
      expect(r0.body.opcoes.dotacoes).toHaveLength(2);
      expect(r0.body.valor_estimado).toBe(1800);
      expect(await situacaoDoPasso(lic, 'RESERVA')).toEqual(['ABERTA']);

      // LOA escolhida no campo da LDO: recusado; linha repetida: recusado
      await http().put(`/api/fase-interna/${lic.id}/reserva`).set(bearer(agente.token)).send({ lei_ldo_id: loaAno }).expect(400);
      await http()
        .put(`/api/fase-interna/${lic.id}/reserva`)
        .set(bearer(agente.token))
        .send({ linhas: [{ exercicio: ANO, valor: 1 }, { exercicio: ANO, valor: 2 }] })
        .expect(400);

      const r1 = await http()
        .put(`/api/fase-interna/${lic.id}/reserva`)
        .set(bearer(agente.token))
        .send({
          dotacao_id: dotacaoAno,
          lei_ldo_id: ldoAno,
          lei_loa_id: loaAno,
          linhas: [
            { exercicio: ANO, valor: 300, situacao: 'PREVISAO' },
            { exercicio: ANO + 1, valor: 1500, situacao: 'PREVISAO' },
          ],
        })
        .expect(200);
      expect(r1.body.atual).toMatchObject({ status: 'RASCUNHO', versao: 1, total: 1800, elemento_despesa: '3.3.90.40 — Serviços de TIC — PJ' });
      // sem as declarações: não emite
      const e400 = await http().post(`/api/fase-interna/${lic.id}/reserva/emitir`).set(bearer(agente.token)).expect(400);
      expect(e400.body.pendencias.join(' ')).toMatch(/LRF/);
      await http().put(`/api/fase-interna/${lic.id}/reserva`).set(bearer(agente.token)).send({ declaracao_adequacao: true, declaracao_lrf: true }).expect(200);

      const em = await http().post(`/api/fase-interna/${lic.id}/reserva/emitir`).set(bearer(agente.token)).expect(201);
      expect(em.body.atual).toMatchObject({ status: 'EMITIDA', exercicio_base: ANO });
      expect(em.body.atual.linhas.map((l: any) => [l.exercicio, l.valor, l.situacao])).toEqual([
        [ANO, 300, 'RESERVADO'],
        [ANO + 1, 1500, 'PREVISAO'],
      ]);
      expect(em.body.peca).toMatchObject({ tem_arquivo: true, origem: 'INTERNO', da_reserva_atual: true });
      const [doc] = await sql(`SELECT descricao, dados_estruturados FROM documentos_fase_interna WHERE id = $1`, [em.body.peca.documento_id]);
      expect(doc.descricao).toMatch(/3\.3\.90\.40/);
      expect(doc.descricao).toMatch(new RegExp(`Lei nº 1\\.234/${ANO - 1} \\(LDO ${ANO}\\)`));
      expect(doc.descricao).not.toMatch(/empenh/i);
      expect(await situacaoDoPasso(lic, 'RESERVA')).toEqual(['CONCLUIDA']);
      // emitida não se edita: nova versão
      await http().put(`/api/fase-interna/${lic.id}/reserva`).set(bearer(agente.token)).send({ observacao: 'x' }).expect(409);
      // o TR passa a ler a dotação da reserva
      const tr = await http().get(`/api/fase-interna/${lic.id}/tr`).set(bearer(agente.token)).expect(200);
      expect(tr.body.dotacao.texto).toMatch(/3\.3\.90\.40/);
    });

    it('renovar dotação (virada do exercício): nova versão, histórico e tarefa da Contabilidade; a nova emissão conclui a tarefa', async () => {
      await http().post(`/api/fase-interna/${lic.id}/reserva/renovar`).set(bearer(agente.token)).send({ exercicio: ANO }).expect(400);
      const rn = await http()
        .post(`/api/fase-interna/${lic.id}/reserva/renovar`)
        .set(bearer(agente.token))
        .send({ exercicio: ANO + 1, motivo: 'Contrato não assinado até 31/12.' })
        .expect(201);
      expect(rn.body.atual).toMatchObject({ versao: 2, status: 'RASCUNHO', dotacao_id: dotacaoProx, declaracao_lrf: false });
      expect(rn.body.atual.linhas).toEqual([{ exercicio: ANO + 1, valor: 1800, situacao: 'PREVISAO', numero_reserva: null }]);
      expect(rn.body.historico.map((h: any) => [h.versao, h.status])).toEqual([[1, 'SUBSTITUIDA']]);
      expect(rn.body.tarefa_renovacao).toBeTruthy();
      const [t] = await sql(`SELECT * FROM tarefas WHERE id = $1`, [rn.body.tarefa_criada_id]);
      expect(t).toMatchObject({ origem: 'SISTEMA', passo: 'RESERVA', status: 'ABERTA', tipo_peca: 'DO', responsavel_usuario_id: agente.id, chave: 'sistema:renovar-dotacao' });
      // renovar de novo não duplica a tarefa (idempotência pela chave)
      await tarefas().sincronizar(lic.id);
      expect((await tarefasDoProcesso(lic)).filter((x: any) => x.chave === 'sistema:renovar-dotacao' && x.status === 'ABERTA')).toHaveLength(1);

      await http().put(`/api/fase-interna/${lic.id}/reserva`).set(bearer(agente.token)).send({ declaracao_adequacao: true, declaracao_lrf: true }).expect(200);
      const em = await http().post(`/api/fase-interna/${lic.id}/reserva/emitir`).set(bearer(agente.token)).expect(201);
      expect(em.body.atual).toMatchObject({ versao: 2, status: 'EMITIDA' });
      expect(em.body.peca.versao).toBe(2);
      const [t2] = await sql(`SELECT status, concluida_por_nome FROM tarefas WHERE id = $1`, [rn.body.tarefa_criada_id]);
      expect(t2).toMatchObject({ status: 'CONCLUIDA', concluida_por_nome: 'Joana Agente' });
      const log = await sql(`SELECT descricao FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'DOCUMENTO_VERSIONADO'`, [lic.id]);
      expect(log.some((l: any) => /Dotação renovada/.test(l.descricao))).toBe(true);
    });
  });

  // ==========================================================================
  describe('B. pesquisa feita fora: mapa anexado + valor unitário nos itens', () => {
    it('anexar o PDF da pesquisa e digitar o valor dos itens conclui a etapa e atualiza o valor do processo', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      await http()
        .post(`/api/fase-interna/${lic.id}/documentos/DFD/anexo`)
        .set(bearer(agente.token))
        .field('data_documento', hoje())
        .attach('arquivo', pdfDeTeste('DFD'), { filename: 'dfd.pdf', contentType: 'application/pdf' })
        .expect(201);
      await http()
        .post(`/api/fase-interna/${lic.id}/documentos/PP/anexo`)
        .set(bearer(agente.token))
        .field('data_documento', hoje())
        .field('numero_peca', 'Mapa 12/2026')
        .attach('arquivo', pdfDeTeste('Mapa de preços'), { filename: 'mapa.pdf', contentType: 'application/pdf' })
        .expect(201);
      const p = await http().get(`/api/fase-interna/${lic.id}/pesquisa`).set(bearer(agente.token)).expect(200);
      expect(p.body.peca).toMatchObject({ anexada: true, numero_peca: 'Mapa 12/2026' });
      await http().put(`/api/fase-interna/${lic.id}/pesquisa/valores-itens`).set(bearer(agente.token)).send({ itens: [{ item_id: lic.itens[0].id, valor_unitario: 0 }] }).expect(400);
      const v = await http()
        .put(`/api/fase-interna/${lic.id}/pesquisa/valores-itens`)
        .set(bearer(agente.token))
        .send({ itens: [{ item_id: lic.itens[0].id, valor_unitario: 120 }, { item_id: lic.itens[1].id, valor_unitario: 60.5 }] })
        .expect(200);
      expect(v.body.itens_licitacao.map((i: any) => [i.valor_unitario, i.valor_total])).toEqual([
        [120, 1200],
        [60.5, 1210],
      ]);
      const [l] = await sql(`SELECT valor_total_estimado FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(Number(l.valor_total_estimado)).toBe(2410);
      // a etapa conta como concluída (anexada) — e não fica tarefa aberta dela
      expect(await situacaoDoPasso(lic, 'PESQUISA')).not.toContain('ABERTA');
      const et = await http().get(`/api/fase-interna/${lic.id}/etapas`).set(bearer(agente.token)).expect(200);
      const passo = et.body.etapas.flatMap((e: any) => e.passos).find((x: any) => x.passo === 'PESQUISA');
      expect(passo.situacao).toBe('CONCLUIDO');
      // o anexo continua sendo a peça: nada de versão nova só por ler/digitar valores
      const [pp] = await sql(`SELECT origem::text AS origem, versao FROM documentos_fase_interna WHERE licitacao_id = $1 AND tipo::text = 'PP' AND versao_atual = true`, [lic.id]);
      expect(pp).toMatchObject({ origem: 'ARQUIVO' });
    });
  });

  // ==========================================================================
  describe('C. assistente do ETP', () => {
    let lic: LicitacaoFixture;
    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      // Homologação multiusuário: o ETP só depois da demanda (aprovada) — ordem do fluxo
      await cumprirEtapasAnteriores(ctx, lic, 'ETP');
    });

    it('marca "similar ou superior ao ARION" → ATENÇÃO; justificativa do art. 41, I resolve; texto aceito fica como do usuário', async () => {
      const trecho = '<p>A solução deverá ser similar ou superior ao software ARION (SNEWS), com integração ao ambiente de broadcast.</p>';
      await http()
        .patch(`/api/fase-interna/${lic.id}/documentos/ETP/secao/solucao`)
        .set(bearer(agente.token))
        .send({ html: trecho, origem: 'IA_ACEITA' })
        .expect(200);
      const e = await http().get(`/api/fase-interna/${lic.id}/etp`).set(bearer(agente.token)).expect(200);
      expect(e.body.marca.map((m: any) => [m.marca, m.severidade])).toEqual(expect.arrayContaining([['ARION', 'ATENCAO']]));
      expect(e.body.etp.edicoes.solucao).toMatchObject({ origem: 'IA_ACEITA', por_id: agente.id, por_nome: 'Joana Agente' });
      const log = await sql(`SELECT descricao, usuario_nome FROM logs_fase_interna WHERE licitacao_id = $1 AND acao::text = 'DOCUMENTO_EDITADO'`, [lic.id]);
      expect(log.some((l: any) => /aceita/.test(l.descricao) && l.usuario_nome === 'Joana Agente')).toBe(true);
      // chave interna não é seção
      await http().patch(`/api/fase-interna/${lic.id}/documentos/ETP/secao/_edicoes`).set(bearer(agente.token)).send({ html: 'x' }).expect(400);

      await http().put(`/api/fase-interna/${lic.id}/etp/marca`).set(bearer(agente.token)).send({ justificativa: 'curta' }).expect(400);
      const j = await http()
        .put(`/api/fase-interna/${lic.id}/etp/marca`)
        .set(bearer(agente.token))
        .send({ justificativa: 'Padronização: compatibilidade com os equipamentos de broadcast já instalados na TV Câmara.' })
        .expect(200);
      expect(j.body.marca.every((m: any) => m.severidade === 'JUSTIFICADO')).toBe(true);
      expect(j.body.obrigatorios_vazios.map((i: any) => i.inciso)).toEqual(['I', 'IV', 'VI', 'VIII', 'XIII']);
    });

    it('rascunho pela IA: só sugere (nada gravado); sem IA configurada devolve "indisponível" com a análise', async () => {
      const r = await http().post(`/api/fase-interna/${lic.id}/etp/assistente`).set(bearer(agente.token)).send({ acao: 'RASCUNHO', secao_id: 'necessidade' }).expect(201);
      expect(r.body.disponivel).toBe(false);
      expect(r.body.analise.obrigatorios_vazios.length).toBe(5);
      const e = await http().get(`/api/fase-interna/${lic.id}/etp`).set(bearer(agente.token)).expect(200);
      expect(e.body.etp.secoes.necessidade ?? '').toBe('');
      await http().post(`/api/fase-interna/${lic.id}/etp/assistente`).set(bearer(agente.token)).send({ acao: 'RASCUNHO', secao_id: 'inexistente' }).expect(400);
      const a = await http().post(`/api/fase-interna/${lic.id}/etp/assistente`).set(bearer(agente.token)).send({ acao: 'ANALISAR' }).expect(201);
      expect(a.body.analise.marca.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  describe('D. isolamento dos endpoints novos', () => {
    let lic: LicitacaoFixture;
    let dotacaoA: string;
    beforeAll(async () => {
      lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA, { extras: { pregoeiro_id: agente.id } });
      dotacaoA = (
        await http()
          .post('/api/orcamento/dotacoes')
          .set(bearer(A.token))
          .send({ exercicio: ANO, unidade_orcamentaria: 'UO A', projeto_atividade: 'PA A', elemento_despesa: '3.3.90.30', fonte_recurso: '500' })
          .expect(201)
      ).body.id;
    });

    const LEITURAS = (id: string) => [
      `/api/fase-interna/${id}/dfd`,
      `/api/fase-interna/${id}/etp`,
      `/api/fase-interna/${id}/tr`,
      `/api/fase-interna/${id}/pesquisa`,
      `/api/fase-interna/${id}/pesquisa/arquivos/certidao/pp`,
      `/api/fase-interna/${id}/reserva`,
    ];
    const ESCRITAS = (id: string): Array<['put' | 'post' | 'delete', string]> => [
      ['put', `/api/fase-interna/${id}/dfd`],
      ['post', `/api/fase-interna/${id}/documentos/DFD/gerar`],
      ['post', `/api/fase-interna/${id}/etp/assistente`],
      ['put', `/api/fase-interna/${id}/etp/marca`],
      ['put', `/api/fase-interna/${id}/pesquisa/parametros/I`],
      ['post', `/api/fase-interna/${id}/pesquisa/parametros/I/evidencia`],
      ['post', `/api/fase-interna/${id}/pesquisa/propostas`],
      ['delete', `/api/fase-interna/${id}/pesquisa/propostas/qualquer`],
      ['post', `/api/fase-interna/${id}/pesquisa/propostas/qualquer/comprovante`],
      ['put', `/api/fase-interna/${id}/pesquisa/metodo`],
      ['post', `/api/fase-interna/${id}/pesquisa/emitir`],
      ['put', `/api/fase-interna/${id}/pesquisa/valores-itens`],
      ['put', `/api/fase-interna/${id}/reserva`],
      ['post', `/api/fase-interna/${id}/reserva/emitir`],
      ['post', `/api/fase-interna/${id}/reserva/retificar`],
      ['post', `/api/fase-interna/${id}/reserva/renovar`],
      ['post', `/api/fase-interna/${id}/reserva/devolver`],
    ];

    it('outro órgão: leitura 404, escrita 403 (nada gravado)', async () => {
      for (const url of LEITURAS(lic.id)) {
        const r = await http().get(url).set(bearer(B.token));
        expect([url, r.status]).toEqual([url, 404]);
      }
      for (const [m, url] of ESCRITAS(lic.id)) {
        const r = await (http() as any)[m](url).set(bearer(B.token)).send({});
        expect([m, url, r.status]).toEqual([m, url, 403]);
      }
      const [n] = await sql(`SELECT count(*)::int AS n FROM reservas_orcamentarias WHERE licitacao_id = $1`, [lic.id]);
      expect(n.n).toBe(0);
    });

    it('fornecedor 403 e anônimo 401 em todos', async () => {
      for (const url of LEITURAS(lic.id)) {
        expect([url, (await http().get(url).set(bearer(F.token))).status]).toEqual([url, 403]);
        expect([url, (await http().get(url)).status]).toEqual([url, 401]);
      }
      for (const [m, url] of ESCRITAS(lic.id)) {
        expect([url, (await (http() as any)[m](url).set(bearer(F.token)).send({})).status]).toEqual([url, 403]);
        expect([url, (await (http() as any)[m](url).send({})).status]).toEqual([url, 401]);
      }
      for (const url of ['/api/orcamento/dotacoes', '/api/orcamento/leis']) {
        expect((await http().get(url).set(bearer(F.token))).status).toBe(403);
        expect((await http().get(url)).status).toBe(401);
        expect((await http().post(url).set(bearer(F.token)).send({})).status).toBe(403);
        expect((await http().post(url).send({})).status).toBe(401);
      }
    });

    it('tabelas orçamentárias: cada órgão vê só as suas; alterar a de outro órgão 403; usar dotação de outro órgão na reserva 400', async () => {
      const deB = await http().get('/api/orcamento/dotacoes').set(bearer(B.token)).expect(200);
      expect(deB.body.some((d: any) => d.id === dotacaoA)).toBe(false);
      await http().put(`/api/orcamento/dotacoes/${dotacaoA}`).set(bearer(B.token)).send({ saldo: 1 }).expect(403);
      const licB = await criarLicitacao(ctx, B, ModalidadeLicitacao.DISPENSA_ELETRONICA);
      await cumprirEtapasAnteriores(ctx, licB, 'RESERVA'); // a reserva só depois da pesquisa (ordem do fluxo)
      await http().put(`/api/fase-interna/${licB.id}/reserva`).set(bearer(B.token)).send({ dotacao_id: dotacaoA }).expect(400);
      // o próprio órgão altera
      await http().put(`/api/orcamento/dotacoes/${dotacaoA}`).set(bearer(A.token)).send({ saldo: 5000 }).expect(200);
    });
  });
});
