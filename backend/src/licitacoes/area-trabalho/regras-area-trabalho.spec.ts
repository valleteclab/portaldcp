import { ordenarPorUrgencia, proximaAcao, ResumoProcesso } from './regras-area-trabalho';

const AGORA = new Date('2026-11-12T12:00:00Z');
const em = (min: number) => new Date(AGORA.getTime() + min * 60_000);
const base = (p: Partial<ResumoProcesso> = {}): ResumoProcesso => ({
  modalidade: 'PREGAO_ELETRONICO', fase: 'JULGAMENTO', situacao: 'ATIVA', agora: AGORA, fimPropostas: null, aberturaSessao: null,
  propostas: 4, propostasParaAnalisar: 0, sessaoAberta: true, unidadesEmDisputa: 0, unidadesAguardandoDisputa: 0,
  desempatesEmCurso: 0, aConvocarProposta: 0, propostasAguardandoEnvio: 0, prazoPropostaAte: null, propostasParaJulgar: 0,
  aConvocarHabilitacao: 0, habilitacoesAguardandoEnvio: 0, prazoHabilitacaoAte: null, habilitacoesParaAnalisar: 0, habilitacoesEmDiligencia: 0,
  diligenciasRespondidas: 0, diligenciasAbertas: 0, janelaRecursoAbertaAte: null, houveJanelaFinal: false, intencoesParaAdmitir: 0,
  recursosParaReconsiderar: 0, recursosNaAutoridade: 0, recursosComPrazoDasPartes: 0,
  dispensaComLances: false, dispensaLancesInicio: null, dispensaLancesFim: null, vencedoresSemHabilitacao: 0, contrapropostasPendentes: 0,
  ...p,
});

describe('área de trabalho — próxima ação', () => {
  it('pregão antes da hora: aguarda a sessão; depois da hora: abrir a sessão', () => {
    expect(proximaAcao(base({ fase: 'ANALISE_PROPOSTAS', sessaoAberta: false, aberturaSessao: em(30) }))).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Sessão pública marcada', destino: 'SALA' });
    expect(proximaAcao(base({ fase: 'ANALISE_PROPOSTAS', sessaoAberta: false, aberturaSessao: em(-1) }))).toMatchObject({ vez: 'VOCE', titulo: 'Abrir a sessão pública' });
  });

  it('julgamento: o que está na mão do agente vem antes do que depende de prazo', () => {
    const a = proximaAcao(base({ propostasParaJulgar: 2, propostasAguardandoEnvio: 3, prazoPropostaAte: em(60) }));
    expect(a).toMatchObject({ vez: 'VOCE', titulo: 'Julgar 2 propostas readequadas' });
    expect(proximaAcao(base({ propostasAguardandoEnvio: 1, prazoPropostaAte: em(60) }))).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Aguardando 1 proposta readequada', prazo: em(60) });
  });

  it('desempate ME/EPP em curso segura a convocação da proposta, mas não a habilitação de quem já foi aceito', () => {
    expect(proximaAcao(base({ desempatesEmCurso: 1, aConvocarProposta: 2 }))).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Desempate ME/EPP em curso' });
    expect(proximaAcao(base({ desempatesEmCurso: 1, aConvocarProposta: 2, aConvocarHabilitacao: 1 }))).toMatchObject({ vez: 'VOCE', titulo: 'Convocar 1 empresa para a habilitação' });
  });

  it('habilitação concluída: abrir o prazo de recurso; com a janela fechada e sem recurso: adjudicar', () => {
    expect(proximaAcao(base({ fase: 'HABILITACAO' }))).toMatchObject({ vez: 'VOCE', titulo: 'Abrir o prazo de intenção de recurso' });
    expect(proximaAcao(base({ fase: 'HABILITACAO', houveJanelaFinal: true, janelaRecursoAbertaAte: em(5) }))).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Prazo de intenção de recurso aberto' });
    expect(proximaAcao(base({ fase: 'HABILITACAO', houveJanelaFinal: true, janelaRecursoAbertaAte: em(-5) }))).toMatchObject({ vez: 'VOCE', titulo: 'Adjudicar o objeto' });
    expect(proximaAcao(base({ fase: 'HABILITACAO', houveJanelaFinal: true, intencoesParaAdmitir: 1 }))).toMatchObject({ vez: 'VOCE', titulo: 'Decidir 1 intenção de recurso' });
  });

  it('diligência respondida passa à frente de tudo', () => {
    expect(proximaAcao(base({ diligenciasRespondidas: 1, propostasParaJulgar: 3 }))).toMatchObject({ vez: 'VOCE', titulo: 'Concluir 1 diligência respondida' });
  });

  it('dispensa: abrir lances, aguardar a janela, julgar, habilitar e homologar — sempre na página do processo', () => {
    const d = (p: Partial<ResumoProcesso>) => proximaAcao(base({ modalidade: 'DISPENSA_ELETRONICA', fase: 'ANALISE_PROPOSTAS', dispensaComLances: true, ...p }));
    expect(d({})).toMatchObject({ vez: 'VOCE', titulo: 'Abrir a etapa de lances', destino: 'PROCESSO' });
    expect(d({ dispensaLancesInicio: em(-60), dispensaLancesFim: em(300) })).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Etapa de lances em andamento', prazo: em(300) });
    expect(d({ dispensaLancesInicio: em(-400), dispensaLancesFim: em(-40) })).toMatchObject({ vez: 'VOCE', titulo: 'Julgar as propostas' });
    expect(d({ dispensaComLances: false })).toMatchObject({ vez: 'VOCE', titulo: 'Julgar as propostas' });
    expect(d({ fase: 'ADJUDICACAO', vencedoresSemHabilitacao: 2 })).toMatchObject({ vez: 'VOCE', titulo: 'Conferir a habilitação de 2 vencedores', destino: 'PROCESSO' });
    expect(d({ fase: 'ADJUDICACAO' })).toMatchObject({ vez: 'VOCE', titulo: 'Homologar o resultado' });
  });

  it('ordenação: primeiro o que é do agente; entre os que aguardam, o prazo que vence antes', () => {
    const l = ordenarPorUrgencia([
      { id: 'a', acao: proximaAcao(base({ propostasAguardandoEnvio: 1, prazoPropostaAte: em(120) })) },
      { id: 'b', acao: proximaAcao(base({ propostasParaJulgar: 1 })) },
      { id: 'c', acao: proximaAcao(base({ propostasAguardandoEnvio: 1, prazoPropostaAte: em(10) })) },
    ]);
    expect(l.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});
