"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"

/**
 * Diálogo de confirmação / pedido de motivo — substitui `confirm()` e
 * `prompt()` nos fluxos da licitação (regra 4 do plano: nada de
 * alert/prompt como fluxo). Uso:
 *
 *   const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
 *   if (!(await confirmar({ titulo: "Excluir?", mensagem: "..." }))) return
 *   const motivo = await pedirTexto({ titulo: "Desclassificar", rotulo: "Motivo", obrigatorio: true })
 *   ...
 *   return <>{...}{dialogo}</>
 */
export interface OpcoesBase {
  titulo: string
  mensagem?: ReactNode
  confirmarRotulo?: string
  cancelarRotulo?: string
  /** Botão de confirmação vermelho (atos irreversíveis). */
  destrutivo?: boolean
}

export interface OpcoesTexto extends OpcoesBase {
  rotulo?: string
  placeholder?: string
  valorInicial?: string
  obrigatorio?: boolean
  /** Mínimo de caracteres (padrão 1 quando obrigatório). */
  minimo?: number
  /** Campo de uma linha (ex.: número) em vez de área de texto. */
  linhaUnica?: boolean
  tipoInput?: string
}

type Estado =
  | ({ tipo: "confirmar"; resolve: (v: boolean) => void } & OpcoesBase)
  | ({ tipo: "texto"; resolve: (v: string | null) => void } & OpcoesTexto)

export function useDialogoConfirmacao() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const resolvido = useRef(false)

  const confirmar = useCallback(
    (opcoes: OpcoesBase) =>
      new Promise<boolean>((resolve) => {
        resolvido.current = false
        setErro(null)
        setEstado({ tipo: "confirmar", resolve, ...opcoes })
      }),
    [],
  )

  const pedirTexto = useCallback(
    (opcoes: OpcoesTexto) =>
      new Promise<string | null>((resolve) => {
        resolvido.current = false
        setErro(null)
        setTexto(opcoes.valorInicial ?? "")
        setEstado({ tipo: "texto", resolve, ...opcoes })
      }),
    [],
  )

  const fechar = () => {
    if (estado && !resolvido.current) {
      resolvido.current = true
      if (estado.tipo === "confirmar") estado.resolve(false)
      else estado.resolve(null)
    }
    setEstado(null)
  }

  const ok = () => {
    if (!estado) return
    if (estado.tipo === "texto") {
      const v = texto.trim()
      const minimo = estado.minimo ?? (estado.obrigatorio ? 1 : 0)
      if (v.length < minimo) {
        setErro(minimo > 1 ? `Informe ao menos ${minimo} caracteres.` : "Campo obrigatório.")
        return
      }
      resolvido.current = true
      estado.resolve(v)
    } else {
      resolvido.current = true
      estado.resolve(true)
    }
    setEstado(null)
  }

  const dialogo = (
    <Dialog open={!!estado} onOpenChange={(aberto) => { if (!aberto) fechar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{estado?.titulo}</DialogTitle>
          {estado?.mensagem && (
            <DialogDescription asChild>
              <div className="text-sm text-gray-600 whitespace-pre-line">{estado.mensagem}</div>
            </DialogDescription>
          )}
        </DialogHeader>
        {estado?.tipo === "texto" && (
          <div className="space-y-1">
            {estado.rotulo && <label className="text-sm font-medium">{estado.rotulo}</label>}
            {estado.linhaUnica ? (
              <Input
                type={estado.tipoInput || "text"}
                value={texto}
                placeholder={estado.placeholder}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ok() }}
                autoFocus
              />
            ) : (
              <Textarea
                value={texto}
                placeholder={estado.placeholder}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                autoFocus
              />
            )}
          </div>
        )}
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>{estado?.cancelarRotulo || "Cancelar"}</Button>
          <Button variant={estado?.destrutivo ? "destructive" : "default"} onClick={ok}>
            {estado?.confirmarRotulo || "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { confirmar, pedirTexto, dialogo }
}
