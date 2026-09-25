import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { rotuloModalidade } from "./licitacao-rotulos"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata modalidade de licitação para exibição (ex: PREGAO_ELETRONICO → Pregão Eletrônico) */
export function formatarModalidadeLicitacao(modalidade: string | null | undefined): string {
  return rotuloModalidade(modalidade)
}
