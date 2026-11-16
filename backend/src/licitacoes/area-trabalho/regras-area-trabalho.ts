/**
 * ÁREA DE TRABALHO DO AGENTE DE CONTRATAÇÃO / PREGOEIRO — regra pura.
 *
 * Para cada processo em fase externa, diz QUAL É A PRÓXIMA AÇÃO e de quem é a
 * vez: do agente (`VOCE`) ou de terceiros/relógio (`AGUARDANDO`). A leitura
 * dos números fica no serviço; aqui só a decisão, na ordem em que o agente
 * trabalha: o que depende dele vem antes do que depende de prazo.
 */

export type VezDeQuem = 'VOCE' | 'AGUARDANDO';

export interface ResumoProcesso {
  modalidade: string;
  fase: string;
  situacao: string;
  agora: Date;
  /** Datas do processo */
  fimPropostas: Date | null;
  aberturaSessao: Date | null;
  /** Propostas */
  propostas: number;
  propostasParaAnalisar: number;
  /** Sessão do pregão */
  sessaoAberta: boolean;
  unidadesEmDisputa: number;
  unidadesAguardandoDisputa: number;
  /** Julgamento */
  desempatesEmCurso: number;
  aConvocarProposta: number;
  propostasAguardandoEnvio: number;
  prazoPropostaAte: Date | null;
  propostasParaJulgar: number;
  /** Convocado que não enviou a proposta readequada no prazo: cabe ao agente recusar e chamar o próximo. */
  propostasComPrazoVencido: number;
  /** Habilitação */
  aConvocarHabilitacao: number;
  habilitacoesAguardandoEnvio: number;
  prazoHabilitacaoAte: Date | null;
  habilitacoesParaAnalisar: number;
  habilitacoesEmDiligencia: number;
  /** Diligências gerais */
  diligenciasRespondidas: number;
  diligenciasAbertas: number;
  /** Recursos */
  janelaRecursoAbertaAte: Date | null;
  houveJanelaFinal: boolean;
  intencoesParaAdmitir: number;
  recursosParaReconsiderar: number;
  recursosNaAutoridade: number;
  recursosComPrazoDasPartes: number;
  /** Dispensa */
  dispensaComLances: boolean;
  dispensaLancesInicio: Date | null;
  dispensaLancesFim: Date | null;
  vencedoresSemHabilitacao: number;
  contrapropostasPendentes: number;
}

export interface ProximaAcao {
  vez: VezDeQuem;
  titulo: string;
  detalhe: string | null;
  /** Até quando (prazo que está correndo), para ordenar e mostrar na tela. */
  prazo: Date | null;
  /** Para onde o botão leva: a sala do pregão ou a página do processo. */
  destino: 'SALA' | 'PROCESSO';
}

const n = (q: number, singular: string, plural: string) => `${q} ${q === 1 ? singular : plural}`;
const voce = (titulo: string, detalhe: string | null, destino: ProximaAcao['destino'], prazo: Date | null = null): ProximaAcao => ({ vez: 'VOCE', titulo, detalhe, prazo, destino });
const aguardando = (titulo: string, detalhe: string | null, destino: ProximaAcao['destino'], prazo: Date | null = null): ProximaAcao => ({
  vez: 'AGUARDANDO',
  titulo,
  detalhe,
  prazo,
  destino,
});

export const FASES_AREA_DE_TRABALHO = ['AGUARDANDO_DIVULGACAO', 'PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'ADJUDICACAO'];

/** O que o agente faz agora neste processo (ou o que ele está esperando). */
export function proximaAcao(r: ResumoProcesso): ProximaAcao {
  const dispensa = r.modalidade === 'DISPENSA_ELETRONICA';
  const destinoPadrao: ProximaAcao['destino'] = dispensa ? 'PROCESSO' : 'SALA';
  if (r.situacao === 'SUSPENSA') return voce('Processo suspenso', 'Retome o processo quando o motivo da suspensão cessar.', 'PROCESSO');

  // O que depende do agente em qualquer fase
  if (r.diligenciasRespondidas > 0) {
    return voce(`Concluir ${n(r.diligenciasRespondidas, 'diligência respondida', 'diligências respondidas')}`, 'O licitante respondeu: analise e encerre a diligência.', destinoPadrao);
  }

  switch (r.fase) {
    case 'AGUARDANDO_DIVULGACAO':
      return aguardando('Aguardando a confirmação da divulgação', 'O prazo de propostas começa quando a publicação oficial for confirmada.', 'PROCESSO');
    case 'PUBLICADO':
    case 'IMPUGNACAO':
    case 'ACOLHIMENTO_PROPOSTAS':
      return aguardando(
        'Recebendo propostas',
        `${n(r.propostas, 'proposta recebida', 'propostas recebidas')}${!dispensa && r.aberturaSessao ? ' · sessão marcada' : ''}`,
        'PROCESSO',
        r.fimPropostas ?? r.aberturaSessao,
      );
    case 'ANALISE_PROPOSTAS':
      // Prazo encerrado sem nenhuma proposta: não há o que abrir nem julgar
      if (r.propostas === 0 && (!r.fimPropostas || r.agora >= r.fimPropostas)) {
        return voce('Declarar deserta', 'O prazo terminou sem nenhuma proposta recebida.', 'PROCESSO');
      }
      if (dispensa) {
        if (r.dispensaComLances && !r.dispensaLancesInicio) return voce('Abrir a etapa de lances', `${n(r.propostas, 'proposta recebida', 'propostas recebidas')} — janela de 6 a 10 horas.`, 'PROCESSO');
        if (r.dispensaLancesFim && r.agora < r.dispensaLancesFim) return aguardando('Etapa de lances em andamento', 'O julgamento libera quando a janela encerrar.', 'PROCESSO', r.dispensaLancesFim);
        return voce('Julgar as propostas', `${n(r.propostas, 'proposta', 'propostas')} — menor preço por item.`, 'PROCESSO');
      }
      if (!r.sessaoAberta) {
        if (r.aberturaSessao && r.agora < r.aberturaSessao) return aguardando('Sessão pública marcada', `${n(r.propostas, 'proposta recebida', 'propostas recebidas')}.`, 'SALA', r.aberturaSessao);
        return voce('Abrir a sessão pública', `${n(r.propostas, 'proposta recebida', 'propostas recebidas')} — a hora marcada já chegou.`, 'SALA');
      }
      if (r.propostasParaAnalisar > 0) return voce(`Analisar ${n(r.propostasParaAnalisar, 'proposta', 'propostas')}`, 'Classifique ou desclassifique e conclua a análise para liberar os lances.', 'SALA');
      return voce('Concluir a análise e abrir os lances', 'Propostas analisadas: ligue a fila ou abra os itens.', 'SALA');
    case 'EM_DISPUTA':
      if (r.unidadesEmDisputa === 0 && r.unidadesAguardandoDisputa > 0) {
        return voce(`Abrir ${n(r.unidadesAguardandoDisputa, 'unidade para lances', 'unidades para lances')}`, 'Nenhuma unidade em disputa agora: ligue a fila ou abra as próximas.', 'SALA');
      }
      return aguardando(
        'Etapa de lances em andamento',
        `${n(r.unidadesEmDisputa, 'unidade em disputa', 'unidades em disputa')}${r.unidadesAguardandoDisputa ? ` · ${r.unidadesAguardandoDisputa} na fila` : ''}`,
        'SALA',
      );
    case 'JULGAMENTO':
    case 'HABILITACAO': {
      // 1º o que está na mão do agente
      if (r.propostasParaJulgar > 0) return voce(`Julgar ${n(r.propostasParaJulgar, 'proposta readequada', 'propostas readequadas')}`, 'Aceite ou recuse (a recusa chama o próximo colocado).', 'SALA');
      if (r.propostasComPrazoVencido > 0) {
        return voce(
          `Decidir ${n(r.propostasComPrazoVencido, 'convocação com prazo vencido', 'convocações com prazo vencido')}`,
          'O licitante não enviou a proposta readequada no prazo: recuse e chame o próximo colocado.',
          'SALA',
        );
      }
      if (r.habilitacoesParaAnalisar > 0) {
        return voce(`Analisar a habilitação de ${n(r.habilitacoesParaAnalisar, 'empresa', 'empresas')}`, 'Documentos entregues: marque Atende ou Não atende e decida.', 'SALA');
      }
      if (r.intencoesParaAdmitir > 0) return voce(`Decidir ${n(r.intencoesParaAdmitir, 'intenção de recurso', 'intenções de recurso')}`, 'Prazo de intenção encerrado: admita ou não cada uma.', 'SALA');
      if (r.recursosParaReconsiderar > 0) {
        return voce(`Reconsiderar ou encaminhar ${n(r.recursosParaReconsiderar, 'recurso', 'recursos')}`, 'Prazos das partes encerrados: juízo de reconsideração.', 'SALA');
      }
      if (r.recursosNaAutoridade > 0) return voce(`Registrar a decisão da autoridade em ${n(r.recursosNaAutoridade, 'recurso', 'recursos')}`, 'Recurso mantido e encaminhado à autoridade superior.', 'SALA');
      if (r.desempatesEmCurso === 0 && r.aConvocarProposta > 0) {
        return voce(`Convocar ${n(r.aConvocarProposta, 'proposta readequada', 'propostas readequadas')}`, 'Use "Convocar todos" na sala para chamar de uma vez.', 'SALA');
      }
      if (r.aConvocarHabilitacao > 0) return voce(`Convocar ${n(r.aConvocarHabilitacao, 'empresa', 'empresas')} para a habilitação`, 'Proposta aceita: peça os documentos.', 'SALA');
      // 2º o que depende de terceiros ou do relógio
      if (r.desempatesEmCurso > 0) return aguardando('Desempate ME/EPP em curso', `${n(r.desempatesEmCurso, 'unidade aguarda', 'unidades aguardam')} a resposta da empresa convocada.`, 'SALA');
      if (r.propostasAguardandoEnvio > 0) {
        return aguardando(`Aguardando ${n(r.propostasAguardandoEnvio, 'proposta readequada', 'propostas readequadas')}`, 'O licitante convocado está no prazo de envio.', 'SALA', r.prazoPropostaAte);
      }
      if (r.habilitacoesAguardandoEnvio > 0) {
        return aguardando(`Aguardando documentos de ${n(r.habilitacoesAguardandoEnvio, 'empresa', 'empresas')}`, 'Prazo de envio da habilitação em curso.', 'SALA', r.prazoHabilitacaoAte);
      }
      if (r.habilitacoesEmDiligencia > 0 || r.diligenciasAbertas > 0) {
        return aguardando('Aguardando resposta de diligência', `${n(r.habilitacoesEmDiligencia + r.diligenciasAbertas, 'diligência aberta', 'diligências abertas')}.`, 'SALA');
      }
      if (r.janelaRecursoAbertaAte && r.agora < r.janelaRecursoAbertaAte) {
        return aguardando('Prazo de intenção de recurso aberto', 'Os licitantes podem manifestar a intenção de recorrer.', 'SALA', r.janelaRecursoAbertaAte);
      }
      if (r.recursosComPrazoDasPartes > 0) return aguardando('Recurso em prazo de razões ou contrarrazões', `${n(r.recursosComPrazoDasPartes, 'recurso', 'recursos')} com prazo das partes correndo.`, 'SALA');
      if (r.fase === 'HABILITACAO') {
        if (!r.houveJanelaFinal) return voce('Abrir o prazo de intenção de recurso', 'Habilitação concluída em todas as unidades.', 'SALA');
        return voce('Adjudicar o objeto', 'Sem recurso pendente: registre a adjudicação.', 'SALA');
      }
      return voce('Seguir com o julgamento', 'Abra a sala para ver a situação de cada unidade.', 'SALA');
    }
    case 'ADJUDICACAO':
      if (dispensa) {
        if (r.contrapropostasPendentes > 0) {
          return aguardando(`Aguardando resposta de ${n(r.contrapropostasPendentes, 'contraproposta', 'contrapropostas')}`, 'O vencedor aceita ou recusa na sala dele.', 'PROCESSO');
        }
        if (r.vencedoresSemHabilitacao > 0) {
          return voce(`Conferir a habilitação de ${n(r.vencedoresSemHabilitacao, 'vencedor', 'vencedores')}`, 'Marque os documentos conferidos e habilite, ou inabilite com o motivo.', 'PROCESSO');
        }
        return voce('Homologar o resultado', 'Todos os vencedores habilitados.', 'PROCESSO');
      }
      return voce('Homologar o resultado', 'Objeto adjudicado: registre a homologação.', 'SALA');
    default:
      return aguardando('Sem ação pendente', null, 'PROCESSO');
  }
}

/** Ordem da lista: primeiro o que depende do agente; depois, o prazo que vence antes. */
export function ordenarPorUrgencia<T extends { acao: ProximaAcao }>(linhas: T[]): T[] {
  const peso = (a: ProximaAcao) => (a.vez === 'VOCE' ? 0 : 1);
  const tempo = (a: ProximaAcao) => (a.prazo ? new Date(a.prazo).getTime() : Number.MAX_SAFE_INTEGER);
  return [...linhas].sort((x, y) => peso(x.acao) - peso(y.acao) || tempo(x.acao) - tempo(y.acao));
}
