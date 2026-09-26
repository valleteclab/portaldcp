"use client"

/**
 * Tela inicial da área de fase interna = CAIXA DE TAREFAS do usuário
 * (Entrega 2 — SPEC §5: "tela inicial de cada usuário = suas tarefas
 * abertas, ordenadas por prazo"). O painel antigo está em /orgao/fase-interna/painel.
 */
import { CaixaTarefas } from "@/components/fase-interna/CaixaTarefas"

export default function MinhasTarefasPage() {
  return <CaixaTarefas />
}
