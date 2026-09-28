"use client"

/**
 * ISOLAMENTO DAS PEÇAS POR ETAPA (homologação multiusuário, 27/09/2026) —
 * a tela mostra o que o backend decide: cada etapa vem de
 * GET /api/fase-interna/:id/etapas com `permissoes_trabalho[etapa]` =
 * { pode_trabalhar, motivo }. Quem não pode (não responde pela etapa, a etapa
 * ainda não pode começar ou o processo não está com a pessoa) vê a tela só
 * para leitura, com a explicação; as ações de escrita ficam desabilitadas.
 * O backend recusa do mesmo jeito (403 com a mesma mensagem).
 */
import { createContext, useContext } from "react"
import { Lock } from "lucide-react"
import { ETAPAS_DA_BARRA } from "./telas"

export interface PermissaoTrabalho {
  /** Pode fazer as ações de escrita desta etapa. Sem a resposta do servidor: sim (o servidor confere). */
  pode: boolean
  motivo: string | null
  /** A resposta do servidor já chegou. */
  carregada: boolean
}

export type PermissoesTrabalho = Record<string, { pode_trabalhar: boolean; motivo: string | null; codigo?: string }>

export const PERMISSAO_LIVRE: PermissaoTrabalho = { pode: true, motivo: null, carregada: false }

export const PermissaoEtapaContext = createContext<PermissaoTrabalho>(PERMISSAO_LIVRE)

/** Permissão da etapa da tela em que o componente está (EtapaShell); fora dela, livre. */
export function usePermissaoEtapa(): PermissaoTrabalho {
  return useContext(PermissaoEtapaContext)
}

/** Etapa do modelo que produz a peça do tipo (a mesma tabela da barra de etapas). */
export function passoDoTipo(tipo: string): string | null {
  return ETAPAS_DA_BARRA.find((e) => e.tipos.includes(tipo))?.passo ?? null
}

/** Permissão de uma etapa pelo mapa do servidor (etapa sem entrada: livre). */
export function permissaoDoPasso(mapa: PermissoesTrabalho | null | undefined, passo: string | null): PermissaoTrabalho {
  if (!mapa || !passo) return PERMISSAO_LIVRE
  const p = mapa[passo]
  if (!p) return { ...PERMISSAO_LIVRE, carregada: true }
  return { pode: p.pode_trabalhar !== false, motivo: p.motivo ?? null, carregada: true }
}

/** Faixa "só leitura" com o motivo (topo da tela da etapa). */
export function AvisoSomenteLeitura({ permissao, className = "" }: { permissao: PermissaoTrabalho; className?: string }) {
  if (permissao.pode) return null
  return (
    <div role="status" className={`flex items-start gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 ${className}`}>
      <Lock className="w-4 h-4 mt-0.5 shrink-0 text-slate-600" aria-hidden="true" />
      <p>
        <b>Somente leitura.</b> {permissao.motivo ?? "Você não pode alterar as peças desta etapa agora."}
      </p>
    </div>
  )
}
