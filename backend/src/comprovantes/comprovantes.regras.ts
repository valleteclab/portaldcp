/**
 * COMPROVANTES DO FORNECEDOR (dono, 10/11/2026 — como a BLL): toda inclusão ou
 * alteração da proposta e todo envio de anexo gera um documento que mostra o que
 * foi feito e o que ficou gravado, "como uma garantia de que foi colocado no
 * sistema". Regras puras: tipos, número e código de verificação.
 */
import { createHash } from 'crypto';

export const TIPOS_COMPROVANTE = {
  PROPOSTA_ENVIADA: 'Proposta enviada',
  PROPOSTA_ALTERADA: 'Proposta alterada',
  PROPOSTA_EXCLUIDA: 'Proposta excluída',
  DOCUMENTO_ANEXADO: 'Documento de habilitação anexado',
  DOCUMENTO_REMOVIDO: 'Documento de habilitação removido',
  DOCUMENTACAO_ENTREGUE: 'Documentação de habilitação entregue',
} as const;
export type TipoComprovante = keyof typeof TIPOS_COMPROVANTE;

export interface RetratoComprovante {
  licitacao: { id: string; processo: string | null; edital: string | null; objeto: string | null; orgao: string | null };
  fornecedor: { id: string; razaoSocial: string | null; cpfCnpj: string | null };
  proposta: {
    id: string;
    status: string;
    enviadaEm: string | null;
    valorTotal: number;
    itens: Array<{
      numero: number;
      lote: number | null;
      descricao: string;
      quantidade: number;
      unidade: string | null;
      valorUnitario: number;
      valorTotal: number;
      marca: string | null;
      modelo: string | null;
    }>;
  } | null;
  anexos: Array<{ exigencia: string; arquivo: string; tamanho: number | null; sha256: string | null; enviadoEm: string | null }>;
}

/** Número de exibição: CP-AAAA-NNNNNN (ano da emissão + sequência única). */
export function numeroDoComprovante(sequencia: number, emitidoEm: Date): string {
  const ano = Number(emitidoEm.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 4));
  return `CP-${ano}-${String(sequencia).padStart(6, '0')}`;
}

/** JSON canônico (chaves em ordem) — o mesmo retrato gera sempre o mesmo código. */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  const o = valor as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`)
    .join(',')}}`;
}

/** Código de verificação: SHA-256 do tipo, da descrição, do instante e do retrato. */
export function codigoDeVerificacao(p: { tipo: string; descricao: string; emitidoEm: string; retrato: RetratoComprovante }): string {
  return createHash('sha256').update(jsonCanonico(p)).digest('hex');
}

export const brl = (v: number | null | undefined) =>
  `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dataHoraBrasilia = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
