import { criarCalendario } from '../../common/prazos/calendario';
import { configEfetiva, validarConfiguracao } from './configuracao-fase-interna';
import { etapasDaFaseInterna, PapelFaseInterna, PassoFaseInterna as P, passosDasEtapas } from './etapas-fase-interna';
import { chaveDoPasso, planejarSincronizacao, prazoDaTarefa, quemCumpriu, responsavelDoPasso, TarefaAberta, tarefaAtrasada } from './tarefa-regras';

describe('prazo da tarefa em dias úteis (calendário do órgão)', () => {
  const semFeriado = criarCalendario([]);

  it('exclui o dia do começo e vence às 23:59:59 de Brasília do N-ésimo dia útil', () => {
    // sexta 25/09/2026, 10h em Brasília; 3 dias úteis → seg 28, ter 29, qua 30
    const inicio = new Date('2026-09-25T13:00:00Z');
    expect(prazoDaTarefa(inicio, 3, semFeriado)!.toISOString()).toBe('2026-10-01T02:59:59.999Z');
  });

  it('feriado do órgão no caminho não conta', () => {
    const comFeriado = criarCalendario([{ descricao: 'Aniversário da cidade', data: '2026-09-29' }]);
    const inicio = new Date('2026-09-25T13:00:00Z');
    // seg 28 (1), ter 29 feriado, qua 30 (2), qui 01/10 (3)
    expect(prazoDaTarefa(inicio, 3, comFeriado)!.toISOString()).toBe('2026-10-02T02:59:59.999Z');
  });

  it('sem prazo (null/0) → null; 30 dias úteis da Portaria 089 para Compras', () => {
    expect(prazoDaTarefa(new Date(), null, semFeriado)).toBeNull();
    expect(prazoDaTarefa(new Date(), 0, semFeriado)).toBeNull();
    const inicio = new Date('2026-09-01T13:00:00Z'); // terça
    expect(prazoDaTarefa(inicio, 30, semFeriado)!.toISOString().slice(0, 10)).toBe('2026-10-14');
  });

  it('atrasada = aberta e com o prazo vencido', () => {
    const agora = new Date('2026-09-26T12:00:00Z');
    expect(tarefaAtrasada({ status: 'ABERTA', prazo: '2026-09-25T02:59:59Z' }, agora)).toBe(true);
    expect(tarefaAtrasada({ status: 'CONCLUIDA', prazo: '2026-09-25T02:59:59Z' }, agora)).toBe(false);
    expect(tarefaAtrasada({ status: 'ABERTA', prazo: null }, agora)).toBe(false);
  });
});

describe('configuração efetiva e responsável do passo', () => {
  it('sem linha: modo SIMPLES, controle interno desativado, prazos da Portaria 089', () => {
    const c = configEfetiva('o1', null);
    expect(c).toMatchObject({ modo: 'SIMPLES', controle_interno_ativo: false, padrao: true });
    expect(c.prazos).toMatchObject({ PESQUISA: 30, RESERVA: 3, AUTORIZACAO: 3, MINUTAS: 5, PARECER: 5, CONTROLE_INTERNO: 3, PUBLICACAO: 5, DFD: null });
    expect(c.responsaveis.PARECER).toEqual({ papel: 'JURIDICO', setor_id: null });
  });

  it('SIMPLES: tudo para o agente do processo; sem agente, para quem criou; sem ninguém, a caixa do papel', () => {
    const c = configEfetiva('o1', null);
    expect(responsavelDoPasso(P.PARECER, c, { agente_id: 'u-agente', criador_usuario_id: 'u-criador' })).toEqual({ usuario_id: 'u-agente', papel: null, setor_id: null });
    expect(responsavelDoPasso(P.PARECER, c, { criador_usuario_id: 'u-criador' })).toEqual({ usuario_id: 'u-criador', papel: null, setor_id: null });
    expect(responsavelDoPasso(P.PARECER, c, {})).toEqual({ usuario_id: null, papel: 'AGENTE_CONTRATACAO', setor_id: null });
  });

  it('POR_SETOR: papel/setor configurado; o do agente vai direto ao agente do processo', () => {
    const c = configEfetiva('o1', { modo: 'POR_SETOR', responsaveis: { RESERVA: { papel: null, setor_id: 's-contab' } } });
    expect(responsavelDoPasso(P.PARECER, c, { agente_id: 'u-agente' })).toEqual({ usuario_id: null, papel: 'JURIDICO', setor_id: null });
    expect(responsavelDoPasso(P.RESERVA, c, { agente_id: 'u-agente' })).toEqual({ usuario_id: null, papel: null, setor_id: 's-contab' });
    expect(responsavelDoPasso(P.MINUTAS, c, { agente_id: 'u-agente' })).toEqual({ usuario_id: 'u-agente', papel: null, setor_id: null });
    expect(responsavelDoPasso(P.MINUTAS, c, {})).toEqual({ usuario_id: null, papel: 'AGENTE_CONTRATACAO', setor_id: null });
  });

  it('validação do PUT: modo, papel, setor de outro órgão e prazo', () => {
    expect(validarConfiguracao({ modo: 'XYZ' }, []).ok).toBe(false);
    const setorAlheio = validarConfiguracao({ responsaveis: { RESERVA: { papel: null, setor_id: 's-outro' } } }, ['s-meu']);
    expect(setorAlheio).toMatchObject({ ok: false, erros: [expect.stringMatching(/não pertence/)] });
    expect(validarConfiguracao({ responsaveis: { PARECER: { papel: 'PAPA' } } }, []).ok).toBe(false);
    expect(validarConfiguracao({ prazos: { PESQUISA: -1 } }, []).ok).toBe(false);
    const bom = validarConfiguracao({ modo: 'POR_SETOR', controle_interno_ativo: true, prazos: { PESQUISA: 20, DFD: '' } }, []);
    expect(bom).toMatchObject({ ok: true, valores: { modo: 'POR_SETOR', controle_interno_ativo: true, prazos: { PESQUISA: 20, DFD: null } } });
  });
});

describe('plano de sincronização das tarefas (idempotente)', () => {
  const instr = (status: Record<string, string>) =>
    ['DFD', 'PP', 'AA', 'ETP', 'TR', 'AR', 'PJ', 'DO', 'JC', 'DP', 'RAG', 'MC'].map((tipo) => ({ tipo, titulo: tipo, obrigatorio: false, status: status[tipo] ?? 'PENDENTE' }));
  const processo = { contratacao_direta: true, fase: 'PLANEJAMENTO', situacao: 'ATIVA' };
  const config = configEfetiva('o1', null);
  const resp = (p: P) => responsavelDoPasso(p, config, { agente_id: 'u1' });
  const aberta = (passo: P, extra: Partial<TarefaAberta> = {}): TarefaAberta => ({
    id: `t-${passo}`,
    chave: chaveDoPasso(passo),
    origem: 'ETAPA',
    atribuicao_manual: false,
    responsavel_usuario_id: 'u1',
    responsavel_papel: null,
    responsavel_setor_id: null,
    ...extra,
  });

  it('processo novo: cria só a tarefa da demanda; com ela aberta, não cria de novo', () => {
    const passos = passosDasEtapas(etapasDaFaseInterna(processo, instr({}), { controle_interno_ativo: false }));
    const p1 = planejarSincronizacao(passos, [], resp);
    expect(p1.criar.map((c) => c.passo.passo)).toEqual([P.DFD]);
    expect(p1.criar[0].responsavel).toEqual({ usuario_id: 'u1', papel: null, setor_id: null });
    const p2 = planejarSincronizacao(passos, [aberta(P.DFD)], resp);
    expect(p2).toEqual({ criar: [], concluir: [], cancelar: [], reatribuir: [] });
  });

  it('peça pronta: conclui a tarefa e cria as que ficaram disponíveis', () => {
    const passos = passosDasEtapas(etapasDaFaseInterna(processo, instr({ DFD: 'OK' }), { controle_interno_ativo: false }));
    const p = planejarSincronizacao(passos, [aberta(P.DFD)], resp);
    expect(p.concluir.map((c) => c.tarefa_id)).toEqual(['t-DFD']);
    expect(p.criar.map((c) => c.passo.passo)).toEqual([P.ETP, P.TR, P.PESQUISA]);
    // aplicado o plano, nada mais a fazer
    const depois = planejarSincronizacao(passos, [aberta(P.ETP), aberta(P.TR), aberta(P.PESQUISA)], resp);
    expect(depois).toEqual({ criar: [], concluir: [], cancelar: [], reatribuir: [] });
  });

  it('controle interno desativado cancela a tarefa aberta dele', () => {
    const passos = passosDasEtapas(etapasDaFaseInterna(processo, instr({}), { controle_interno_ativo: false }));
    const p = planejarSincronizacao(passos, [aberta(P.DFD), aberta(P.CONTROLE_INTERNO)], resp);
    expect(p.cancelar).toEqual([{ tarefa_id: 't-CONTROLE_INTERNO', motivo: expect.stringMatching(/deixou de se aplicar/) }]);
  });

  it('processo revogado: cancela todas as abertas (inclusive diligência) e não cria nada', () => {
    const passos = passosDasEtapas(etapasDaFaseInterna({ ...processo, situacao: 'REVOGADA' }, instr({}), { controle_interno_ativo: false }));
    const dil = { ...aberta(P.DFD), id: 't-dil', chave: 'diligencia:1', origem: 'DILIGENCIA' };
    const p = planejarSincronizacao(passos, [aberta(P.DFD), dil], resp, { processo_encerrado: true });
    expect(p.cancelar.map((c) => c.tarefa_id)).toEqual(['t-DFD', 't-dil']);
    expect(p.criar).toEqual([]);
  });

  it('responsável mudou (modo/agente): reatribui — salvo se foi reatribuída à mão', () => {
    const passos = passosDasEtapas(etapasDaFaseInterna(processo, instr({}), { controle_interno_ativo: false }));
    const porSetor = configEfetiva('o1', { modo: 'POR_SETOR' });
    const respSetor = (p: P) => responsavelDoPasso(p, porSetor, { agente_id: 'u1' });
    const p = planejarSincronizacao(passos, [aberta(P.DFD)], respSetor);
    expect(p.reatribuir).toEqual([{ tarefa_id: 't-DFD', de: { usuario_id: 'u1', papel: null, setor_id: null }, para: { usuario_id: null, papel: PapelFaseInterna.REQUISITANTE, setor_id: null } }]);
    expect(planejarSincronizacao(passos, [aberta(P.DFD, { atribuicao_manual: true })], respSetor).reatribuir).toEqual([]);
  });

  it('fase interna encerrada sem a peça: cancela a tarefa', () => {
    const passos = passosDasEtapas(etapasDaFaseInterna({ ...processo, fase: 'PUBLICADO' }, instr({ DFD: 'OK' }), { controle_interno_ativo: false }));
    const p = planejarSincronizacao(passos, [aberta(P.ETP)], resp);
    expect(p.cancelar).toEqual([{ tarefa_id: 't-ETP', motivo: expect.stringMatching(/encerrada/) }]);
  });
});

describe('quem cumpriu a peça', () => {
  it('assinada: o último signatário; não se aplica: quem marcou; anexada: quem anexou', () => {
    expect(
      quemCumpriu({
        status: 'ASSINADO',
        assinaturas: [
          { assinante_id: 'a', assinante_nome: 'Presidente', data_assinatura: '2026-09-02T10:00:00Z' },
          { assinante_id: 'b', assinante_nome: '1º Secretário', data_assinatura: '2026-09-03T10:00:00Z' },
        ],
      }),
    ).toEqual({ id: 'b', nome: '1º Secretário' });
    expect(quemCumpriu({ status: 'APROVADO', aprovador_id: 'x', aprovador_nome: 'Agente' })).toEqual({ id: 'x', nome: 'Agente' });
    expect(quemCumpriu({ status: 'IMPORTADO', criado_por_id: 'u9' })).toEqual({ id: 'u9', nome: null });
  });
});
