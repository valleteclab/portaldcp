import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata valor para input de moeda: R$45,560.05 (vírgula milhares, ponto decimal) */
export function formatarMoedaInput(valor: number | string): string {
  const n = typeof valor === 'string' ? parseFloat(String(valor).replace(/[^\d.]/g, '')) || 0 : Number(valor) || 0
  const [intPart, decPart = '00'] = n.toFixed(2).split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `R$ ${formatted}.${decPart}`
}

/** Parseia string formatada de moeda para número */
export function parsearMoedaInput(valor: string): number {
  const cleaned = String(valor || '').replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) return parseFloat(parts[0] + '.' + parts.slice(1).join('')) || 0
  return parseFloat(cleaned) || 0
}

/** Formata modalidade de licitação para exibição (ex: PREGAO_ELETRONICO → Pregão Eletrônico) */
export function formatarModalidadeLicitacao(modalidade: string | null | undefined): string {
  if (!modalidade) return '—'
  const labels: Record<string, string> = {
    PREGAO_ELETRONICO: 'Pregão Eletrônico',
    CONCORRENCIA: 'Concorrência',
    CONCURSO: 'Concurso',
    LEILAO: 'Leilão',
    DIALOGO_COMPETITIVO: 'Diálogo Competitivo',
    DISPENSA_ELETRONICA: 'Dispensa Eletrônica',
    INEXIGIBILIDADE: 'Inexigibilidade',
    PREGAO_PRESENCIAL: 'Pregão Presencial',
    CONCORRENCIA_PUBLICA: 'Concorrência Pública',
  }
  return labels[modalidade] || modalidade.replace(/_/g, ' ')
}
