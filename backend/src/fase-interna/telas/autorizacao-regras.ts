/**
 * AUTORIZAÇÃO DA AUTORIDADE (etapa 6 — Entrega 3B) — regras puras.
 *
 *  - Situação da autorização a partir da peça AA (despacho): sem despacho,
 *    em elaboração, aguardando as assinaturas (autoridade COLEGIADA — só fica
 *    autorizada quando TODOS assinam), autorizada (assinada no sistema ou
 *    anexada assinada fora) ou devolvida com motivo.
 *  - Portão B (checklist do art. 72): nesta entrega só é MOSTRADO (o bloqueio
 *    vem na Entrega 4). Exigidos para autorizar: incisos I, II e IV; III, V,
 *    VI e VII vêm depois (parecer e fase externa); VIII é esta etapa.
 *  - Resumo para a tela do celular (mockup Autorizacao).
 */

export type SituacaoAutorizacao = 'SEM_DESPACHO' | 'EM_ELABORACAO' | 'AGUARDANDO_ASSINATURAS' | 'AUTORIZADA' | 'DEVOLVIDA';

export interface DespachoParaSituacao {
  status: string;
  origem: string;
  dados_estruturados?: any;
}

export function situacaoDaAutorizacao(doc: DespachoParaSituacao | null | undefined): SituacaoAutorizacao {
  if (!doc) return 'SEM_DESPACHO';
  if (doc.status === 'REPROVADO') return 'DEVOLVIDA';
  if (doc.status === 'AGUARDANDO_ASSINATURA') return 'AGUARDANDO_ASSINATURAS';
  if (doc.status === 'ASSINADO' || doc.status === 'APROVADO') return 'AUTORIZADA';
  if (doc.origem !== 'INTERNO' && doc.status === 'IMPORTADO') return 'AUTORIZADA';
  return 'EM_ELABORACAO';
}

export interface LinhaInstrucaoPortao {
  tipo: string;
  titulo: string;
  status: string; // OK | NAO_SE_APLICA | PENDENTE | EM_ELABORACAO | EM_APROVACAO | EM_ASSINATURA
  obrigatorio?: boolean;
}

export type MomentoInciso = 'ANTES' | 'ESTA_ETAPA' | 'DEPOIS' | 'FASE_EXTERNA';

export const INCISOS_ART72: Array<{ inciso: string; texto: string; tipos: string[]; momento: MomentoInciso }> = [
  { inciso: 'I', texto: 'Formalização da demanda e, se for o caso, estudo técnico, análise de riscos e termo de referência', tipos: ['DFD', 'ETP', 'AR', 'TR'], momento: 'ANTES' },
  { inciso: 'II', texto: 'Estimativa de despesa (art. 23)', tipos: ['PP'], momento: 'ANTES' },
  { inciso: 'III', texto: 'Parecer jurídico e pareceres técnicos, se for o caso', tipos: ['PJ'], momento: 'DEPOIS' },
  { inciso: 'IV', texto: 'Compatibilidade da previsão de recursos orçamentários', tipos: ['DO'], momento: 'ANTES' },
  { inciso: 'V', texto: 'Habilitação e qualificação mínima do contratado', tipos: [], momento: 'FASE_EXTERNA' },
  { inciso: 'VI', texto: 'Razão da escolha do contratado', tipos: ['RAG', 'JC'], momento: 'FASE_EXTERNA' },
  { inciso: 'VII', texto: 'Justificativa de preço', tipos: ['RAG', 'JC'], momento: 'FASE_EXTERNA' },
  { inciso: 'VIII', texto: 'Autorização da autoridade competente', tipos: ['AA'], momento: 'ESTA_ETAPA' },
];

export interface LinhaPortaoB {
  inciso: string;
  referencia: string;
  texto: string;
  momento: MomentoInciso;
  /** Exigido para autorizar (I, II e IV). */
  exigido: boolean;
  situacao: 'OK' | 'PENDENTE' | 'EM_ANDAMENTO' | 'DEPOIS';
  pecas: Array<{ tipo: string; titulo: string; status: string }>;
}

const PRONTA = new Set(['OK', 'NAO_SE_APLICA']);

/**
 * PORTÃO B — checklist do art. 72 (só leitura nesta entrega). Uma peça do
 * inciso fora da instrução do processo (ex.: rito completo) não conta.
 */
export function portaoBArt72(itens: LinhaInstrucaoPortao[]): { linhas: LinhaPortaoB[]; ok: boolean; pendentes: string[] } {
  const linhas: LinhaPortaoB[] = INCISOS_ART72.map((i) => {
    const pecas = i.tipos
      .map((t) => itens.find((x) => x.tipo === t))
      .filter((x): x is LinhaInstrucaoPortao => !!x)
      .map((x) => ({ tipo: x.tipo, titulo: x.titulo, status: x.status }));
    const exigido = i.momento === 'ANTES';
    let situacao: LinhaPortaoB['situacao'];
    if (i.momento !== 'ANTES' && i.momento !== 'ESTA_ETAPA') situacao = pecas.length && pecas.every((p) => PRONTA.has(p.status)) ? 'OK' : 'DEPOIS';
    else if (!pecas.length) situacao = 'OK';
    else if (pecas.every((p) => PRONTA.has(p.status))) situacao = 'OK';
    else if (pecas.some((p) => p.status !== 'PENDENTE')) situacao = 'EM_ANDAMENTO';
    else situacao = 'PENDENTE';
    return { inciso: i.inciso, referencia: `Art. 72, ${i.inciso}`, texto: i.texto, momento: i.momento, exigido, situacao, pecas };
  });
  const pendentes = linhas.filter((l) => l.exigido && l.situacao !== 'OK').map((l) => `${l.referencia} — ${l.texto}`);
  return { linhas, ok: pendentes.length === 0, pendentes };
}

export interface SignatarioSituacao {
  usuario_id: string | null;
  nome: string;
  papel: string;
  status: string; // PENDENTE | ASSINADO | …
  data_assinatura?: string | Date | null;
}

/** Quem falta assinar e se o usuário do token é um signatário que ainda não assinou. */
export function situacaoDasAssinaturas(signatarios: SignatarioSituacao[], usuarioId: string | null) {
  const assinaram = signatarios.filter((s) => s.status === 'ASSINADO').length;
  const meu = usuarioId ? signatarios.find((s) => s.usuario_id === usuarioId) ?? null : null;
  return {
    total: signatarios.length,
    assinaram,
    faltam: signatarios.filter((s) => s.status !== 'ASSINADO').map((s) => `${s.nome} (${s.papel})`),
    sou_signatario: !!meu,
    ja_assinei: meu?.status === 'ASSINADO',
    posso_assinar: !!meu && meu.status !== 'ASSINADO',
  };
}

/**
 * RESUMO DA AUTORIZAÇÃO (tela do celular): o que a autoridade precisa ver
 * para decidir — objeto, teto (valor estimado da pesquisa), fundamento,
 * dotação, requisitante, peças do art. 72 conferidas e as folhas dos autos.
 */
export function resumoDaAutorizacao(e: {
  numero_processo: string;
  objeto: string;
  modalidade_rotulo: string;
  fundamento_referencia: string | null;
  teto: number | null;
  sigiloso: boolean;
  reserva: { status: string | null; texto: string | null } | null;
  requisitante: string | null;
  itens: LinhaInstrucaoPortao[];
  folhas: number | null;
}) {
  const portao = portaoBArt72(e.itens);
  const conferidas = portao.linhas.filter((l) => l.exigido && l.situacao === 'OK').flatMap((l) => l.pecas.filter((p) => p.status === 'OK').map((p) => p.tipo));
  return {
    titulo: `Autorizar a abertura do PA ${e.numero_processo}`,
    objeto: e.objeto,
    teto: e.teto,
    teto_sigiloso: e.sigiloso,
    modalidade: e.fundamento_referencia ? `${e.modalidade_rotulo} · ${e.fundamento_referencia}` : e.modalidade_rotulo,
    dotacao: !e.reserva ? 'Sem reserva' : e.reserva.status === 'EMITIDA' ? 'Reservada' : 'Em preparação',
    dotacao_texto: e.reserva?.texto ?? null,
    requisitante: e.requisitante,
    documentos: portao.ok
      ? `${conferidas.join(', ') || 'Peças do art. 72'} — completos`
      : `Faltam: ${portao.pendentes.map((p) => p.split(' — ')[0]).join('; ')}`,
    documentos_ok: portao.ok,
    folhas: e.folhas,
    portao_b: portao,
  };
}
