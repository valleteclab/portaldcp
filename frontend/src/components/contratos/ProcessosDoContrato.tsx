"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, FolderOpen } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { chamarProcessos, rotuloDoTipo, soData, textoDoErro, type ProcessoResumo, type TipoProcesso } from "@/lib/processo/processo"

/**
 * Processos (aditivo/renovação) do contrato: abre um novo e lista os que já existem.
 * Não altera o cadastro do contrato: só cria o processo e leva à tela dele.
 */
export function ProcessosDoContrato({ contratoId, numeroContrato }: { contratoId: string; numeroContrato: string }) {
  const router = useRouter()
  const [itens, setItens] = useState<ProcessoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState<TipoProcesso | null>(null)
  const [erroAbrir, setErroAbrir] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const r = await chamarProcessos<ProcessoResumo[]>(`?contrato_id=${encodeURIComponent(contratoId)}&limit=100`, {
        padrao: "Não foi possível carregar os processos do contrato.",
      })
      setItens(Array.isArray(r) ? r : [])
    } catch (e) {
      setErro(textoDoErro(e, "Não foi possível carregar os processos do contrato."))
    } finally {
      setCarregando(false)
    }
  }, [contratoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function abrir(tipo: "ADITIVO" | "RENOVACAO") {
    setErroAbrir(null)
    setAbrindo(tipo)
    try {
      const objeto = tipo === "ADITIVO" ? `Termo aditivo ao contrato nº ${numeroContrato}` : `Renovação do contrato nº ${numeroContrato}`
      const p = await chamarProcessos<ProcessoResumo>("", {
        metodo: "POST",
        padrao: "Não foi possível abrir o processo.",
        corpo: { tipo, contrato_id: contratoId, objeto },
      })
      router.push(`/orgao/processo/${p.id}`)
    } catch (e) {
      setErroAbrir(textoDoErro(e, "Não foi possível abrir o processo."))
      setAbrindo(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="w-4 h-4" /> Processos do contrato
        </CardTitle>
        <CardDescription>
          Abra um processo para tramitar o pedido entre os setores (pedido, parecer, autorização) antes de cadastrar o termo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => abrir("ADITIVO")} disabled={abrindo !== null}>
            {abrindo === "ADITIVO" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Abrir processo de aditivo
          </Button>
          <Button variant="outline" onClick={() => abrir("RENOVACAO")} disabled={abrindo !== null}>
            {abrindo === "RENOVACAO" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Abrir processo de renovação
          </Button>
        </div>
        {erroAbrir ? (
          <p className="text-sm text-red-600" role="alert">
            {erroAbrir}
          </p>
        ) : null}

        {carregando ? (
          <p className="text-sm text-gray-500 flex items-center gap-2" role="status">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando processos...
          </p>
        ) : erro ? (
          <p className="text-sm text-red-600" role="alert">
            {erro}
          </p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-gray-500">Este contrato ainda não tem processos abertos.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {itens.map((p) => (
              <li key={p.id}>
                <Link href={`/orgao/processo/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-slate-50">
                  <span className="font-medium">{p.numero}</span>
                  <Badge variant="outline">{rotuloDoTipo(p.tipo)}</Badge>
                  <Badge variant={p.situacao === "ENCERRADO" ? "secondary" : "default"}>
                    {p.situacao === "ENCERRADO" ? "Encerrado" : "Em andamento"}
                  </Badge>
                  <span className="text-sm text-gray-600 basis-full sm:basis-auto sm:flex-1 min-w-0 truncate">{p.objeto}</span>
                  <span className="text-xs text-gray-500">aberto em {soData(p.aberto_em)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
