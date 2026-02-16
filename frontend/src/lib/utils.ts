import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
