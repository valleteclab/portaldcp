"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { fmtMoeda, type ProcessoCompleto } from "./tipos"

interface FornecedorOpt { id: string; razao_social: string; cpf_cnpj?: string; cnpj?: string }

/**
 * REGISTRAR RESULTADO DA SELEÇÃO EXTERNA (ato REGISTRAR_RESULTADO_EXTERNO):
 * a disputa aconteceu fora do sistema — onde e o vencedor/valor de cada item.
 * POST /licitacoes/:id/resultado-externo (o backend valida).
 */
export function ResultadoExternoDialog({
  licitacaoId,
  dados,
  aberto,
  onFechar,
  onAtualizado,
}: {
  licitacaoId: string
  dados: ProcessoCompleto
  aberto: boolean
  onFechar: () => void
  onAtualizado: () => void
}) {
  const l = dados.licitacao
  const [fornecedores, setFornecedores] = useState<FornecedorOpt[]>([])
  const [plataforma, setPlataforma] = useState("")
  const [numero, setNumero] = useState("")
  const [url, setUrl] = useState("")
  const [linhas, setLinhas] = useState<Record<string, { fornecedor_id: string; valor_unitario: string }>>({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setPlataforma(l.plataforma_externa || "")
    setNumero(l.numero_processo_externo || "")
    setUrl(l.url_externa || "")
    const iniciais: Record<string, { fornecedor_id: string; valor_unitario: string }> = {}
    for (const it of dados.itens) {
      iniciais[it.id] = {
        fornecedor_id: it.fornecedor_vencedor_id || "",
        valor_unitario: it.valor_unitario_homologado != null ? String(it.valor_unitario_homologado) : "",
      }
    }
    setLinhas(iniciais)
    if (fornecedores.length === 0) {
      authFetch(`${API_URL}/api/fornecedores?status=APROVADO`)
        .then(async (r) => {
          if (!r.ok) return
          const lista = await r.json()
          setFornecedores(Array.isArray(lista) ? lista : lista?.data || [])
        })
        .catch(() => { /* dropdown fica vazio */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const salvar = async () => {
    const itens = dados.itens
      .map((it) => ({ item_id: it.id, ...linhas[it.id] }))
      .filter((x) => x.fornecedor_id && Number(String(x.valor_unitario).replace(",", ".")) > 0)
      .map((x) => ({ item_id: x.item_id, fornecedor_id: x.fornecedor_id, valor_unitario: Number(String(x.valor_unitario).replace(",", ".")) }))
    if (itens.length === 0) {
      toast.error("Preencha vencedor e valor de pelo menos um item.")
      return
    }
    setSalvando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/resultado-externo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plataforma_externa: plataforma || undefined, numero_processo_externo: numero || undefined, url_externa: url || undefined, itens }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || `HTTP ${res.status}`)
      }
      onFechar()
      onAtualizado()
    } catch (e: any) {
      toast.error(`Erro ao registrar resultado: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar resultado da seleção externa</DialogTitle>
          <DialogDescription>
            A disputa aconteceu fora do sistema? Informe onde e o vencedor de cada item. Ao homologar, o contrato é gerado automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="rx-plataforma" className="text-xs text-gray-700">Plataforma</label>
            <Input id="rx-plataforma" placeholder="ex.: BLL, BNC, Compras.gov" value={plataforma} onChange={(e) => setPlataforma(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rx-numero" className="text-xs text-gray-700">Nº na plataforma</label>
            <Input id="rx-numero" placeholder="ex.: PE 012/2026" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rx-url" className="text-xs text-gray-700">Link (opcional)</label>
            <Input id="rx-url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
        </div>
        <div className="border rounded-md overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700 text-xs">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Item</th>
                <th scope="col" className="text-left px-3 py-2 w-[280px]">Fornecedor vencedor</th>
                <th scope="col" className="text-right px-3 py-2 w-[140px]">Vl. unitário (R$)</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((it) => (
                <tr key={it.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.numero_item} — {it.descricao?.slice(0, 70)}</div>
                    <div className="text-xs text-gray-600">
                      Qtd: {Number(it.quantidade).toLocaleString("pt-BR")} {it.unidade_medida || ""}
                      {it.valor_unitario_estimado ? ` · Estimado: ${fmtMoeda(it.valor_unitario_estimado)}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Fornecedor vencedor do item ${it.numero_item}`}
                      className="w-full border rounded-md h-9 px-2 text-sm bg-white"
                      value={linhas[it.id]?.fornecedor_id || ""}
                      onChange={(e) => setLinhas((p) => ({ ...p, [it.id]: { ...p[it.id], fornecedor_id: e.target.value } }))}
                    >
                      <option value="">— selecionar —</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>{f.razao_social} {(f.cpf_cnpj || f.cnpj) ? `(${f.cpf_cnpj || f.cnpj})` : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Valor unitário do item ${it.numero_item}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={linhas[it.id]?.valor_unitario || ""}
                      onChange={(e) => setLinhas((p) => ({ ...p, [it.id]: { ...p[it.id], valor_unitario: e.target.value } }))}
                      className="text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600">
          Fornecedor não aparece na lista? <Link href="/orgao/fornecedores" className="text-blue-800 hover:underline">Cadastre-o primeiro</Link> e reabra este formulário.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar resultado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
