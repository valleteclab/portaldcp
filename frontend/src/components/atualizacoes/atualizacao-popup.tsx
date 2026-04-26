"use client"

import { useEffect, useState } from "react"
import { Megaphone, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { API_URL, authFetch } from "@/lib/api"

interface Atualizacao {
  id: string
  versao: number
  titulo: string
  conteudo: string
  publico_alvo: string
  created_at: string
}

export function AtualizacaoPopup() {
  const [atualizacao, setAtualizacao] = useState<Atualizacao | null>(null)
  const [naoMostrarMais, setNaoMostrarMais] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dismissLoading, setDismissLoading] = useState(false)

  useEffect(() => {
    const fornecedorStr = localStorage.getItem("fornecedor")
    if (!fornecedorStr) {
      setLoading(false)
      return
    }

    const fornecedor = JSON.parse(fornecedorStr)
    if (!fornecedor?.id) {
      setLoading(false)
      return
    }

    authFetch(`${API_URL}/api/atualizacoes/nao-lida?fornecedorId=${fornecedor.id}`)
      .then((res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (data && data.id) {
          setAtualizacao(data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDismiss = async () => {
    if (!atualizacao) return

    if (naoMostrarMais) {
      setDismissLoading(true)
      try {
        const fornecedorStr = localStorage.getItem("fornecedor")
        const fornecedor = JSON.parse(fornecedorStr || "{}")
        await authFetch(
          `${API_URL}/api/atualizacoes/${atualizacao.id}/marcar-lida`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fornecedor_id: fornecedor.id }),
          },
        )
      } catch {
        // silencioso
      }
      setDismissLoading(false)
    }

    setAtualizacao(null)
  }

  if (loading) {
    return null
  }

  if (!atualizacao) {
    return null
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <Megaphone className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base">
                {atualizacao.titulo}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Atualização #{atualizacao.versao} •{" "}
                {new Date(atualizacao.created_at).toLocaleDateString("pt-BR")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed max-h-[50vh] overflow-y-auto">
          {atualizacao.conteudo}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Checkbox
            id="nao-mostrar"
            checked={naoMostrarMais}
            onCheckedChange={(checked) => setNaoMostrarMais(checked === true)}
          />
          <label
            htmlFor="nao-mostrar"
            className="text-xs text-slate-500 cursor-pointer select-none"
          >
            Não mostrar esta atualização novamente
          </label>
        </div>

        <DialogFooter className="pt-2">
          <Button
            onClick={handleDismiss}
            disabled={dismissLoading}
            className="w-full"
          >
            {dismissLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
