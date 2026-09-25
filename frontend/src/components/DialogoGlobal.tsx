"use client"

import { useEffect } from "react"
import {
  useDialogoConfirmacao,
  type OpcoesBase,
  type OpcoesTexto,
} from "@/components/licitacao/useDialogoConfirmacao"

/**
 * Diálogo de confirmação ÚNICO da aplicação (E9 — fim de `confirm()`/`prompt()`).
 * É o mesmo `useDialogoConfirmacao` das telas da licitação, montado uma vez no
 * layout raiz, para que qualquer tela (ou função fora de componente) peça
 * confirmação ou um texto sem montar o próprio diálogo:
 *
 *   if (!(await confirmarAcao({ titulo: "Excluir o item?", destrutivo: true }))) return
 *   const motivo = await pedirTextoAcao({ titulo: "Motivo", obrigatorio: true })
 *
 * Telas que já usam o hook diretamente continuam iguais.
 */
type Api = Pick<ReturnType<typeof useDialogoConfirmacao>, "confirmar" | "pedirTexto">
let api: Api | null = null

export function DialogoGlobal() {
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
  useEffect(() => {
    api = { confirmar, pedirTexto }
    return () => { api = null }
  }, [confirmar, pedirTexto])
  return dialogo
}

/** Substitui `confirm()`: resolve `true` só quando o usuário confirma. */
export function confirmarAcao(opcoes: OpcoesBase): Promise<boolean> {
  return api ? api.confirmar(opcoes) : Promise.resolve(false)
}

/** Substitui `prompt()`: resolve o texto digitado ou `null` se cancelar. */
export function pedirTextoAcao(opcoes: OpcoesTexto): Promise<string | null> {
  return api ? api.pedirTexto(opcoes) : Promise.resolve(null)
}
