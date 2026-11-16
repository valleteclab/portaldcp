/**
 * DILIGÊNCIA GERAL — regras puras (Lei 14.133/2021, art. 64; IN SEGES 73/2022,
 * arts. 29 §2º e 39 §§3º e 4º; na dispensa, art. 72 e IN SEGES 67/2021).
 *
 * É o pedido do pregoeiro/agente a UM licitante, depois dos lances: um
 * esclarecimento ou documento complementar (planilha de custos, catálogo,
 * comprovação de exequibilidade, produto equivalente...), com prazo. Difere da
 * diligência da habilitação (`habilitacao/`), presa às exigências do edital:
 * aqui o pedido é livre e o licitante responde com texto e anexos.
 *
 * Estados: ABERTA → RESPONDIDA (licitante respondeu) → ENCERRADA (o agente
 * conclui: ATENDIDA ou NAO_ATENDIDA, com motivo). ABERTA com prazo vencido é
 * lida como EXPIRADA.
 *
 * O PRAZO é do licitante até o fim (dono, 11/11/2026): responder não trava. Até
 * o prazo acabar — ou o agente encerrar — ele pode anexar mais documentos,
 * remover ou trocar o que enviou errado e atualizar a resposta. Cada envio e
 * cada remoção ficam na ata, com o resumo (SHA-256) do arquivo.
 */
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { indiceFase } from '../licitacoes/transicoes/fases';

export const PRAZO_MINIMO_DILIGENCIA_GERAL_HORAS = 2; // IN 73, art. 29 §2º
export const PRAZO_MAXIMO_DILIGENCIA_GERAL_HORAS = 30 * 24;
export const TAMANHO_MINIMO_PEDIDO = 15;
export const TAMANHO_MINIMO_MOTIVO = 10;
export const MAXIMO_ANEXOS_POR_LADO = 15;
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;
export const EXTENSOES_ACEITAS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls', '.ods', '.docx', '.doc', '.odt', '.zip'];

export enum StatusDiligenciaGeral {
  ABERTA = 'ABERTA',
  RESPONDIDA = 'RESPONDIDA',
  ENCERRADA = 'ENCERRADA',
}
export type StatusEfetivo = StatusDiligenciaGeral | 'EXPIRADA';
export enum ResultadoDiligencia {
  ATENDIDA = 'ATENDIDA',
  NAO_ATENDIDA = 'NAO_ATENDIDA',
}
export const FASES_DILIGENCIA = ['ACEITACAO', 'HABILITACAO', 'DISPENSA', 'OUTRA'] as const;
export type FaseDiligencia = (typeof FASES_DILIGENCIA)[number];

export interface EstadoDiligencia {
  status: string;
  prazo_ate: Date | string;
}

export function statusEfetivo(d: EstadoDiligencia, agora: Date = new Date()): StatusEfetivo {
  if (d.status === StatusDiligenciaGeral.ABERTA && new Date(d.prazo_ate).getTime() < agora.getTime()) return 'EXPIRADA';
  return d.status as StatusDiligenciaGeral;
}

/** A licitação admite diligência: depois dos lances (identidades reveladas) e antes da homologação. */
export function motivoNaoAbre(e: { fase: string | null | undefined; modalidade: string | null | undefined; pedido: string; prazoHoras: number; minimoHoras?: number }): string | null {
  const i = indiceFase(e.fase);
  const dispensa = e.modalidade === 'DISPENSA_ELETRONICA' || e.modalidade === 'INEXIGIBILIDADE';
  const inicio = dispensa ? indiceFase(FaseLicitacao.ANALISE_PROPOSTAS) : indiceFase(FaseLicitacao.JULGAMENTO);
  if (i < inicio) {
    return 'A diligência só pode ser aberta depois da etapa de lances: até lá os licitantes não são identificados (IN SEGES 73/2022, art. 20).';
  }
  if (e.fase === FaseLicitacao.HOMOLOGACAO) return 'A licitação já foi homologada: não cabe mais diligência.';
  const pedido = (e.pedido ?? '').trim();
  if (pedido.length < TAMANHO_MINIMO_PEDIDO) return `Descreva o que está sendo pedido ao licitante (mín. ${TAMANHO_MINIMO_PEDIDO} caracteres).`;
  const minimo = e.minimoHoras ?? PRAZO_MINIMO_DILIGENCIA_GERAL_HORAS;
  const h = Number(e.prazoHoras);
  if (!Number.isFinite(h) || h < minimo) return `O prazo mínimo da diligência é de ${minimo} hora(s) (IN SEGES 73/2022, art. 29 §2º).`;
  if (h > PRAZO_MAXIMO_DILIGENCIA_GERAL_HORAS) return 'O prazo máximo da diligência é de 30 dias.';
  return null;
}

/** O licitante ainda pode anexar e responder? */
export function motivoNaoResponde(d: EstadoDiligencia, agora: Date = new Date()): string | null {
  if (d.status === StatusDiligenciaGeral.ENCERRADA) return 'Esta diligência já foi encerrada.';
  // Respondida ou não: o que vale é o prazo
  if (new Date(d.prazo_ate).getTime() < agora.getTime()) return 'O prazo desta diligência terminou. Peça a prorrogação ao pregoeiro pelo chat da sala.';
  return null;
}

export function motivoNaoProrroga(d: EstadoDiligencia, horas: number, motivo: string, minimoHoras = 1): string | null {
  if (d.status === StatusDiligenciaGeral.ENCERRADA) return 'Esta diligência já foi encerrada.';
  const h = Number(horas);
  if (!Number.isFinite(h) || h < minimoHoras) return `Informe por quantas horas prorrogar (mín. ${minimoHoras}).`;
  if (h > PRAZO_MAXIMO_DILIGENCIA_GERAL_HORAS) return 'A prorrogação máxima é de 30 dias.';
  if ((motivo ?? '').trim().length < TAMANHO_MINIMO_MOTIVO) return `Justifique a prorrogação (mín. ${TAMANHO_MINIMO_MOTIVO} caracteres).`;
  return null;
}

export function motivoNaoEncerra(d: EstadoDiligencia, resultado: string, motivo: string): string | null {
  if (d.status === StatusDiligenciaGeral.ENCERRADA) return 'Esta diligência já foi encerrada.';
  if (!Object.values(ResultadoDiligencia).includes(resultado as ResultadoDiligencia)) return 'Informe o resultado: ATENDIDA ou NAO_ATENDIDA.';
  if ((motivo ?? '').trim().length < TAMANHO_MINIMO_MOTIVO) return `Registre a conclusão da diligência (mín. ${TAMANHO_MINIMO_MOTIVO} caracteres) — ela vai para a ata.`;
  return null;
}

export function motivoAnexoInvalido(a: { nome: string; tamanho: number } | null | undefined, jaEnviados: number): string | null {
  if (!a) return 'Selecione o arquivo.';
  const nome = String(a.nome ?? '').toLowerCase();
  if (!EXTENSOES_ACEITAS.some((x) => nome.endsWith(x))) return `Tipo de arquivo não aceito. Use: ${EXTENSOES_ACEITAS.join(', ')}.`;
  if (a.tamanho > TAMANHO_MAXIMO_ANEXO) return 'O arquivo passa de 10 MB.';
  if (jaEnviados >= MAXIMO_ANEXOS_POR_LADO) return `Limite de ${MAXIMO_ANEXOS_POR_LADO} anexos atingido nesta diligência.`;
  return null;
}

/** Novo prazo de uma prorrogação: conta do prazo atual, ou de agora se já venceu. */
export function prazoProrrogado(prazoAte: Date | string, horas: number, agora: Date = new Date()): Date {
  const base = Math.max(new Date(prazoAte).getTime(), agora.getTime());
  return new Date(base + Number(horas) * 3_600_000);
}
