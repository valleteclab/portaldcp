/**
 * AUTORIZAÇÃO DA AUTORIDADE (etapa 6 — Entrega 3B) — regras puras.
 *
 *  - Situação da autorização a partir da peça AA (despacho): sem despacho,
 *    em elaboração, aguardando as assinaturas (autoridade COLEGIADA — só fica
 *    autorizada quando TODOS assinam), autorizada (assinada no sistema ou
 *    anexada assinada fora) ou devolvida com motivo.
 *  - Portão B (checklist do art. 72): exigidos para autorizar os incisos I,
 *    II e IV; III, V, VI e VII vêm depois (parecer e fase externa); VIII é
 *    esta etapa. Desde a Entrega 4 BLOQUEIA o envio do despacho para
 *    assinatura, a assinatura e o anexo do despacho (motor de conformidade).
 *  - Resumo para a tela do celular (mockup Autorizacao).
 */

// Portão B (art. 72): a implementação é a do motor de conformidade
// (Entrega 4: `conformidade/art72.ts`), reexportada aqui.
import { portaoBArt72, LinhaInstrucaoPortao } from '../conformidade/art72';
export { INCISOS_ART72, portaoBArt72 } from '../conformidade/art72';
export type { LinhaInstrucaoPortao, LinhaPortaoB, MomentoInciso } from '../conformidade/art72';


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
