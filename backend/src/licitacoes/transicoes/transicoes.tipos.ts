import type { EntityManager } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import {
  FaseLicitacao,
  Licitacao,
  ModalidadeLicitacao,
  SituacaoLicitacao,
} from '../entities/licitacao.entity';

/**
 * ATOS NOMEADOS da licitação (plano E1 — "um ato, um caminho").
 *
 * Toda mudança de `fase` ou `situacao` é um destes atos, executado pelo
 * TransicoesService: valida fase + situação, confere pré-condições, aplica os
 * efeitos (datas), grava `licitacao_transicoes` e emite o evento.
 */
export enum AtoLicitacao {
  // --- Fase interna (preparatória, art. 18) ---
  CONCLUIR_PLANEJAMENTO = 'CONCLUIR_PLANEJAMENTO', // ETP/DFD → TR
  CONCLUIR_TERMO_REFERENCIA = 'CONCLUIR_TERMO_REFERENCIA', // TR → pesquisa de preços
  CONCLUIR_PESQUISA_PRECOS = 'CONCLUIR_PESQUISA_PRECOS', // pesquisa → análise jurídica
  CONCLUIR_ANALISE_JURIDICA = 'CONCLUIR_ANALISE_JURIDICA', // parecer (art. 53) → aprovação
  CONCLUIR_FASE_INTERNA = 'CONCLUIR_FASE_INTERNA', // autorização: pronta para divulgar
  DEVOLVER_FASE_INTERNA = 'DEVOLVER_FASE_INTERNA', // volta uma etapa interna (motivo)

  // --- Fase externa ---
  PUBLICAR = 'PUBLICAR', // edital/aviso divulgado (art. 54)
  CANCELAR_PUBLICACAO = 'CANCELAR_PUBLICACAO', // retirada do PNCP antes de propostas (uso do sistema)
  /** @deprecated fora dos fluxos (E1 item 6): prazo de impugnação é por data. Mantido para o histórico. */
  ABRIR_IMPUGNACAO = 'ABRIR_IMPUGNACAO',
  INICIAR_ACOLHIMENTO = 'INICIAR_ACOLHIMENTO', // recebimento de propostas
  ENCERRAR_ACOLHIMENTO = 'ENCERRAR_ACOLHIMENTO', // fim do prazo de propostas
  INICIAR_DISPUTA = 'INICIAR_DISPUTA', // abertura da sessão / etapa de lances
  ENCERRAR_DISPUTA = 'ENCERRAR_DISPUTA', // fim dos lances → julgamento
  INICIAR_HABILITACAO = 'INICIAR_HABILITACAO', // julgamento concluído → habilitação (art. 62)
  ABRIR_PRAZO_RECURSAL = 'ABRIR_PRAZO_RECURSAL', // intenção/razões (art. 165)
  DECIDIR_RECURSOS = 'DECIDIR_RECURSOS', // decisão dos recursos + adjudicação (art. 165 §2º, art. 71 I)
  ADJUDICAR = 'ADJUDICAR', // sem recurso: adjudicação (art. 71, IV)
  RETORNAR_JULGAMENTO = 'RETORNAR_JULGAMENTO', // inabilitação / recurso provido (motivo)
  RETORNAR_HABILITACAO = 'RETORNAR_HABILITACAO', // recurso provido que refez o resultado da habilitação (E5; só a sala)
  JULGAR_DISPENSA = 'JULGAR_DISPENSA', // dispensa: julga por menor preço e adjudica
  REGISTRAR_RESULTADO_EXTERNO = 'REGISTRAR_RESULTADO_EXTERNO', // seleção feita fora do sistema
  HOMOLOGAR = 'HOMOLOGAR', // art. 71, IV

  // --- Publicação (plano E7a) ---
  RETIFICAR_EDITAL = 'RETIFICAR_EDITAL', // art. 55 §1º: nova versão do edital (reabre prazos se afetar propostas)
  INTENCAO_REVOGAR = 'INTENCAO_REVOGAR', // art. 71 §3º: prazo de manifestação prévia dos interessados
  INTENCAO_ANULAR = 'INTENCAO_ANULAR', // art. 71 §3º

  // --- Credenciamento (plano E7b — Lei 14.133 arts. 78 I, 79 e 74 IV) ---
  // Atos que NÃO mudam a fase (a inscrição fica aberta durante toda a
  // vigência): passam pela máquina para ter trava da linha, histórico e
  // evento. Só o CredenciamentoService os pratica (somenteSistema).
  DEFERIR_CREDENCIAMENTO = 'DEFERIR_CREDENCIAMENTO', // inscrição analisada → credenciado
  INDEFERIR_CREDENCIAMENTO = 'INDEFERIR_CREDENCIAMENTO', // inscrição indeferida (motivo; cabe recurso — art. 165)
  DECIDIR_RECURSO_CREDENCIAMENTO = 'DECIDIR_RECURSO_CREDENCIAMENTO', // recurso contra o indeferimento
  CONTRATAR_CREDENCIADO = 'CONTRATAR_CREDENCIADO', // demanda distribuída pela regra do edital (art. 79 par. único II)
  DESCREDENCIAR = 'DESCREDENCIAR', // descredenciamento pela Administração ou denúncia do credenciado (art. 79 par. único VI)

  // --- Modalidades especiais (plano E7c) ---
  JULGAR_CONCURSO = 'JULGAR_CONCURSO', // concurso (art. 30): banca julga, notas publicadas, autoria revelada
  CONCLUIR_DIALOGO = 'CONCLUIR_DIALOGO', // diálogo (art. 32 §1º V e VIII): decisão fundamentada + juntada dos registros
  ABRIR_FASE_COMPETITIVA = 'ABRIR_FASE_COMPETITIVA', // diálogo (art. 32 §1º VIII): edital da fase competitiva, ≥ 60 dias úteis

  // --- Situação ---
  SUSPENDER = 'SUSPENDER',
  RETOMAR = 'RETOMAR',
  REVOGAR = 'REVOGAR', // art. 71, II
  ANULAR = 'ANULAR', // art. 71, III
  DECLARAR_DESERTA = 'DECLARAR_DESERTA',
  DECLARAR_FRACASSADA = 'DECLARAR_FRACASSADA',
  CONCLUIR = 'CONCLUIR',
}

/** Registros do histórico que não são atos executáveis. */
export const REGISTRO_CRIACAO = 'CRIAR';
export const REGISTRO_MIGRACAO_SITUACAO = 'MIGRACAO_SITUACAO';

/** Quem pediu a transição (gravado no histórico). */
export interface AtorTransicao {
  tipo: 'ORGAO' | 'USUARIO' | 'ADMIN' | 'FORNECEDOR' | 'SISTEMA';
  /** id do órgão/usuário/fornecedor, ou a origem do sistema (ex.: 'scheduler'). */
  id: string | null;
}

export function atorSistema(origem: string): AtorTransicao {
  return { tipo: 'SISTEMA', id: origem };
}

/** Converte o Ator do JWT (E1a) no ator do histórico. */
export function atorTransicaoDe(ator: Ator | null | undefined): AtorTransicao {
  if (!ator) return atorSistema('desconhecido');
  if (ator.tipo === 'USUARIO') return { tipo: 'USUARIO', id: ator.usuarioId ?? ator.id };
  return { tipo: ator.tipo, id: ator.id };
}

/**
 * Consultas que as pré-condições podem fazer. O serviço entrega uma
 * implementação sobre o banco (dentro da transação); os testes unitários
 * entregam valores fixos.
 */
export interface ConsultasTransicao {
  /** Propostas enviadas e ainda válidas (≠ RASCUNHO/DESCLASSIFICADA/CANCELADA). */
  propostasRecebidas(): Promise<number>;
  /** Propostas aptas à disputa (ENVIADA/VALIDA/CLASSIFICADA) — regra antiga do avançar. */
  propostasAptasDisputa(): Promise<number>;
  /** Contratos da licitação já assinados (e não cancelados). */
  contratosAssinados(): Promise<number>;
  /** Contratos + atas de registro de preço gerados a partir da licitação. */
  contratosOuAtasGerados(): Promise<number>;
  /** Status e vencedor de cada item. */
  itens(): Promise<Array<{ status: string; fornecedor_vencedor_id: string | null }>>;
  /**
   * Instrução documental da fase interna (gate único, E1.7): contratação
   * direta → checklist do art. 72 (etapa ignorada); rito completo → documentos
   * obrigatórios da `etapa` informada ou, sem etapa, de todas as etapas
   * internas (art. 18). null quando indisponível.
   */
  instrucaoProcesso(etapa?: FaseLicitacao): Promise<{ pode_divulgar: boolean; pendentes: string[] } | null>;
  /**
   * Unidades (item/lote) com lances e resultado possível que ainda NÃO têm
   * licitante com proposta aceita (plano E3 — aceitação, IN 73 art. 29).
   * Opcional: ausente = sem checagem (testes unitários antigos).
   */
  unidadesSemPropostaAceita?(): Promise<string[]>;
  /**
   * Conferência do art. 48 I da LC 123/2006 (plano E3 — ME/EPP): unidades com
   * valor estimado e exclusividade; null fora das modalidades licitatórias.
   * Opcional: ausente = sem checagem (testes unitários antigos).
   */
  conferenciaArt48?(): Promise<import('../../julgamento/me-epp/regras-me-epp').ConferenciaArt48 | null>;
  /**
   * INVERSÃO DE FASES (plano E4 — Lei 14.133 art. 17 §1º): licitantes com
   * proposta apta ainda não HABILITADOS. Vazio fora da inversão.
   * Opcional: ausente = sem checagem (testes unitários antigos).
   */
  habilitacaoPreviaPendente?(): Promise<string[]>;
  /**
   * Unidades com proposta ACEITA cujo licitante ainda não foi HABILITADO
   * (plano E4 — adjudicar só a quem passou pela habilitação, art. 62).
   * Opcional: ausente = sem checagem.
   */
  unidadesSemHabilitado?(): Promise<string[]>;
  /**
   * Estado recursal (plano E5 — Lei 14.133 arts. 165 e 168): janela de
   * intenção aberta/encerrada, recursos pendentes (efeito suspensivo),
   * intenções admitidas e provimentos cujo efeito ainda não levou a
   * licitação ao ato de fase. Opcional: ausente = sem checagem.
   */
  estadoRecursal?(): Promise<EstadoRecursal>;
  /**
   * PUBLICAÇÃO (plano E7a): edital vigente anexado (documento EDITAL /
   * EDITAL_RETIFICADO ou edital aprovado da fase interna com arquivo).
   * Opcional: ausente = sem checagem.
   */
  editalVigente?(): Promise<{ documento_id: string; versao: number; hash: string | null } | null>;
  /** Impugnações acolhidas com `altera_edital` ainda sem retificação (art. 55 §1º). */
  impugnacoesSemRetificacao?(): Promise<string[]>;
  /** Propostas que aguardam confirmação do licitante depois de retificação que afetou propostas. */
  propostasAguardandoConfirmacao?(): Promise<number>;
  /**
   * Interessados a ouvir antes de revogar/anular (art. 71 §3º): licitantes com
   * proposta e, no credenciamento (E7b), os inscritos/credenciados.
   * Opcional: ausente = conta só as propostas (`propostasRecebidas`).
   */
  interessadosExtincao?(): Promise<number>;
  /** Intenção de revogar/anular aberta (art. 71 §3º). */
  intencaoExtincaoAberta?(): Promise<{ id: string; tipo: 'REVOGAR' | 'ANULAR'; prazo_fim: Date } | null>;
  /**
   * CREDENCIAMENTO (plano E7b): regras do edital de chamamento (hipótese do
   * art. 79, regra de distribuição, vigência) e itens com o valor fixado.
   * null = sem configuração. Opcional: ausente = sem checagem.
   */
  credenciamento?(): Promise<import('../../credenciamento/regras-credenciamento').EstadoEditalCredenciamento | null>;
  /**
   * MODALIDADES ESPECIAIS (plano E7c — leilão, concurso, diálogo competitivo):
   * pendências específicas por CHAVE (ex.: 'LEILAO_EDITAL', 'DIALOGO_CONCLUIR'),
   * calculadas por SQL sem DI em `modalidades-especiais/pendencias.sql.ts`.
   * Opcional: ausente = sem checagem (testes unitários antigos).
   */
  pendenciasModalidade?(chave: string, contexto?: { dados?: Record<string, any>; agora?: Date; somenteAvaliacao?: boolean }): Promise<string[]>;
}

/** Retrato do estado recursal da licitação (consulta das pré-condições — E5). */
export interface EstadoRecursal {
  janelaAberta: boolean;
  /** Há janela de intenção ENCERRADA e não superada (o direito de recorrer foi dado sobre o resultado atual). */
  janelaEncerrada: boolean;
  /** Rótulos dos recursos/intenções sem decisão final. */
  pendentes: string[];
  intencoesAdmitidas: number;
  providosSemDesfecho: number;
}

export interface ContextoTransicao {
  licitacao: Licitacao;
  ato: AtoLicitacao;
  motivo?: string | null;
  /** Dados do ato (ex.: cronograma do PUBLICAR, novas datas do RETOMAR). */
  dados?: Record<string, any>;
  agora: Date;
  consultas: ConsultasTransicao;
  /**
   * true quando só se está LISTANDO os atos disponíveis (sem o formulário do
   * ato): pré-condições que dependem de `dados` devem ser puladas.
   */
  somenteAvaliacao?: boolean;
}

/** Pré-condição: devolve as pendências (vazio/null = ok). */
export type Precondicao = (
  ctx: ContextoTransicao,
) => Promise<string[] | string | null | undefined> | string[] | string | null | undefined;

/** Efeito síncrono aplicado na licitação antes de salvar (datas, flags). */
export type Efeito = (lic: Licitacao, ctx: ContextoTransicao) => void;

/** Efeito no banco, na transação do ato (E7a). */
export type EfeitoPersistido = (lic: Licitacao, manager: EntityManager, ctx: ContextoTransicao) => Promise<void>;

export interface DefinicaoAto {
  ato: AtoLicitacao;
  rotulo: string;
  /** Fases em que o ato pode ser praticado. */
  de: FaseLicitacao[];
  /** Fase de destino (fixa ou calculada — com os dados do ato, quando houver). Ausente = mantém a fase. */
  para?: FaseLicitacao | ((lic: Licitacao, ctx?: ContextoTransicao) => FaseLicitacao);
  /** Situações de origem aceitas (padrão: só ATIVA). */
  situacoesOrigem?: SituacaoLicitacao[];
  /** Situação de destino (ausente = mantém). */
  situacaoPara?: SituacaoLicitacao;
  requerMotivo?: boolean;
  /**
   * O ato precisa de dados de formulário próprio (cronograma, valor...) e tem
   * endpoint dedicado — o "avançar fase" genérico não o executa às cegas.
   */
  requerDados?: boolean;
  /** Endpoint dedicado (informativo para a tela). */
  endpoint?: string;
  /** Ato "seguinte" usado pelo PUT avancar-fase (compatibilidade). */
  principal?: boolean;
  /** Ato de retorno usado pelo PUT retroceder-fase (compatibilidade). */
  retorno?: boolean;
  /** Só o próprio sistema pratica (ex.: exclusão da compra no PNCP). Fora da tela. */
  somenteSistema?: boolean;
  precondicoes?: Precondicao[];
  efeitos?: Efeito[];
  /**
   * Efeitos no BANCO, dentro da transação do ato (depois dos efeitos e do
   * `aplicar` do chamador). Ex.: ENCERRAR_ACOLHIMENTO tira da disputa as
   * propostas não confirmadas depois de retificação (E7a).
   */
  efeitosPersistidos?: EfeitoPersistido[];
  /** Mensagem específica quando a fase atual não permite o ato. */
  mensagemForaDaFase?: (lic: Licitacao) => string | null;
}

export type FluxosPorModalidade = Record<ModalidadeLicitacao, DefinicaoAto[]>;

/** Evento emitido depois de cada transição confirmada. */
export interface EventoTransicao {
  transicao_id: string;
  licitacao_id: string;
  orgao_id: string | null;
  modalidade: ModalidadeLicitacao;
  ato: AtoLicitacao;
  fase_de: FaseLicitacao | null;
  fase_para: FaseLicitacao;
  situacao_de: SituacaoLicitacao | null;
  situacao_para: SituacaoLicitacao;
  motivo: string | null;
  ator: AtorTransicao;
  ocorrido_em: Date;
}

export interface OpcoesExecucao {
  ator: AtorTransicao;
  motivo?: string | null;
  dados?: Record<string, any>;
  /**
   * Alterações extras do chamador, feitas DENTRO da transação e depois da
   * validação (ex.: gravar itens adjudicados, valor homologado).
   */
  aplicar?: (lic: Licitacao, manager: EntityManager) => Promise<void> | void;
  /** Participar de uma transação já aberta pelo chamador. */
  manager?: EntityManager;
  /**
   * Pedido idempotente (cron, PNCP): se a licitação já estiver na fase de
   * destino ou além, devolve sem erro e sem registrar nada.
   */
  ignorarSeJaAplicado?: boolean;
  /** Informações extras gravadas em `licitacao_transicoes.dados`. */
  registro?: Record<string, any>;
}

/** Ato disponível para a tela (cockpit). */
export interface AtoDisponivel {
  ato: AtoLicitacao;
  rotulo: string;
  fase_para: FaseLicitacao | null;
  situacao_para: SituacaoLicitacao | null;
  requer_motivo: boolean;
  requer_dados: boolean;
  endpoint: string | null;
  disponivel: boolean;
  pendencias: string[];
}
