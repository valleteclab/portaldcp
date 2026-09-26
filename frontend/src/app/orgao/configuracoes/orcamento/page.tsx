"use client"

/**
 * CONFIGURAÇÕES › ORÇAMENTO (Entrega 3A): tabelas do órgão usadas na reserva
 * orçamentária — dotações por exercício (classificação e saldo) e a tabela
 * ÚNICA de leis (LDO, LOA, PPA). Sem digitação livre na reserva: ela escolhe
 * daqui. API: GET/POST/PUT /api/orcamento/{dotacoes,leis}.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Pencil, Plus } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { DotacaoDialog, LeiDialog, type DotacaoTabela, type LeiTabela } from "@/components/fase-interna/etapas/CadastroOrcamentoDialogs"
import { erroDaApi, fmtMoeda } from "@/lib/fase-interna/telas"

export default function OrcamentoConfigPage() {
  const [dotacoes, setDotacoes] = useState<DotacaoTabela[] | null>(null)
  const [leis, setLeis] = useState<LeiTabela[] | null>(null)
  const [editDot, setEditDot] = useState<DotacaoTabela | null | "nova">(null)
  const [editLei, setEditLei] = useState<LeiTabela | null | "nova">(null)
  const [todas, setTodas] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        authFetch(`${API_URL}/api/orcamento/dotacoes${todas ? "?todas=true" : ""}`),
        authFetch(`${API_URL}/api/orcamento/leis${todas ? "?todas=true" : ""}`),
      ])
      if (!a.ok) throw new Error(await erroDaApi(a))
      if (!b.ok) throw new Error(await erroDaApi(b))
      setDotacoes(await a.json())
      setLeis(await b.json())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      setDotacoes([])
      setLeis([])
    }
  }, [todas])
  useEffect(() => {
    carregar()
  }, [carregar])

  const alternarAtivo = async (tipo: "dotacoes" | "leis", item: { id: string; ativo?: boolean }) => {
    try {
      const r = await authFetch(`${API_URL}/api/orcamento/${tipo}/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: item.ativo === false }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      carregar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-5">
      <Link href="/orgao/configuracoes" className="inline-flex items-center gap-1 text-sm text-blue-800 hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Configurações
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Orçamento</h1>
        <p className="text-sm text-gray-600">
          Dotações por exercício e leis orçamentárias. A reserva orçamentária dos processos escolhe destas listas — despacho, informação orçamentária e parecer citam sempre
          o mesmo número de lei.
        </p>
        <label className="mt-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Mostrar também os desativados
        </label>
      </div>

      <DotacaoDialog
        aberto={editDot !== null}
        inicial={editDot && editDot !== "nova" ? editDot : null}
        onFechar={() => setEditDot(null)}
        onSalvo={() => {
          setEditDot(null)
          carregar()
        }}
      />
      <LeiDialog
        aberto={editLei !== null}
        inicial={editLei && editLei !== "nova" ? editLei : null}
        onFechar={() => setEditLei(null)}
        onSalvo={() => {
          setEditLei(null)
          carregar()
        }}
      />

      <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Dotações">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900">Dotações orçamentárias</h2>
          <Button size="sm" onClick={() => setEditDot("nova")}>
            <Plus className="w-4 h-4 mr-1" /> Nova dotação
          </Button>
        </div>
        {!dotacoes ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" aria-label="Carregando" />
        ) : dotacoes.length ? (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-700">
                <tr>
                  <th scope="col" className="text-left px-3 py-2">Exercício</th>
                  <th scope="col" className="text-left px-3 py-2">Unidade orçamentária</th>
                  <th scope="col" className="text-left px-3 py-2">Projeto/atividade</th>
                  <th scope="col" className="text-left px-3 py-2">Elemento</th>
                  <th scope="col" className="text-left px-3 py-2">Fonte</th>
                  <th scope="col" className="text-right px-3 py-2">Saldo</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {dotacoes.map((d) => (
                  <tr key={d.id} className={`border-t ${d.ativo === false ? "text-gray-500" : ""}`}>
                    <td className="px-3 py-2">{d.exercicio}</td>
                    <td className="px-3 py-2">{d.unidade_orcamentaria}</td>
                    <td className="px-3 py-2">{d.projeto_atividade}</td>
                    <td className="px-3 py-2">{d.elemento_despesa}</td>
                    <td className="px-3 py-2">{d.fonte_recurso}</td>
                    <td className="px-3 py-2 text-right">{d.saldo !== null && d.saldo !== undefined ? fmtMoeda(d.saldo) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditDot(d)} aria-label="Editar dotação">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => alternarAtivo("dotacoes", d)}>
                        {d.ativo === false ? "Reativar" : "Desativar"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-600">Nenhuma dotação cadastrada.</p>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Leis orçamentárias">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900">Leis orçamentárias (LDO, LOA, PPA)</h2>
          <Button size="sm" onClick={() => setEditLei("nova")}>
            <Plus className="w-4 h-4 mr-1" /> Nova lei
          </Button>
        </div>
        {!leis ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" aria-label="Carregando" />
        ) : leis.length ? (
          <ul className="divide-y border rounded-md">
            {leis.map((l) => (
              <li key={l.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm flex-wrap ${l.ativo === false ? "text-gray-500" : ""}`}>
                <span>
                  <b>{l.tipo}</b> {l.tipo === "PPA" && l.exercicio_fim ? `${l.exercicio}–${l.exercicio_fim}` : l.exercicio} · Lei nº {l.numero}
                  {l.ementa ? <span className="text-gray-600"> — {l.ementa}</span> : null}
                </span>
                <span className="whitespace-nowrap">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditLei(l)} aria-label="Editar lei">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => alternarAtivo("leis", l)}>
                    {l.ativo === false ? "Reativar" : "Desativar"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Nenhuma lei cadastrada.</p>
        )}
      </section>
    </div>
  )
}
