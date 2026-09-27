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
import { ArrowLeft, CheckCircle2, Circle, Loader2, Pencil, Plus } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { DotacaoDialog, LeiDialog, type DotacaoTabela, type LeiTabela } from "@/components/fase-interna/etapas/CadastroOrcamentoDialogs"
import { erroDaApi, fmtMoeda } from "@/lib/fase-interna/telas"

export default function OrcamentoConfigPage() {
  const [dotacoes, setDotacoes] = useState<DotacaoTabela[] | null>(null)
  const [leis, setLeis] = useState<LeiTabela[] | null>(null)
  const [editDot, setEditDot] = useState<DotacaoTabela | null | "nova">(null)
  const [editLei, setEditLei] = useState<LeiTabela | null | "nova">(null)
  /** Tipo já marcado ao abrir "Nova lei" pelos atalhos do quadro "O que a reserva usa". */
  const [tipoNovaLei, setTipoNovaLei] = useState<"LDO" | "LOA" | "PPA" | undefined>(undefined)
  const [todas, setTodas] = useState(false)
  const exercicio = Number(new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 4))
  const leiDoExercicio = (tipo: "LDO" | "LOA" | "PPA") =>
    (leis ?? []).find(
      (l) => l.tipo === tipo && l.ativo !== false && (tipo === "PPA" ? l.exercicio <= exercicio && (l.exercicio_fim ?? l.exercicio) >= exercicio : l.exercicio === exercicio),
    )
  const novaLei = (tipo?: "LDO" | "LOA" | "PPA") => {
    setTipoNovaLei(tipo)
    setEditLei("nova")
  }

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
        tipoSugerido={tipoNovaLei}
        onFechar={() => setEditLei(null)}
        onSalvo={() => {
          setEditLei(null)
          carregar()
        }}
      />

      {/* Homologação 26/09/2026: a reserva exige a LDO, e o roteiro só mandava cadastrar 1 lei.
          Cada lei é cadastrada separada, com o seu TIPO (LDO e LOA são leis diferentes). */}
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2" aria-label="O que a reserva orçamentária usa">
        <h2 className="text-base font-semibold text-gray-900">O que a reserva orçamentária usa ({exercicio})</h2>
        <p className="text-sm text-gray-700">
          Cadastre <b>cada lei separadamente</b>, escolhendo o tipo: a <b>LDO</b> e a <b>LOA</b> do exercício são duas leis diferentes (e o PPA, uma terceira,
          opcional). A reserva de cada processo escolhe a dotação e as leis daqui.
        </p>
        {!leis || !dotacoes ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" aria-label="Carregando" />
        ) : (
          <ul className="text-sm space-y-1.5">
            {[
              { tipo: "LDO" as const, rotulo: "LDO — Lei de Diretrizes Orçamentárias", nota: "obrigatória na reserva (campo \"Lei da LDO *\")" },
              { tipo: "LOA" as const, rotulo: "LOA — Lei Orçamentária Anual", nota: "citada na informação orçamentária e no despacho" },
              { tipo: "PPA" as const, rotulo: "PPA — Plano Plurianual", nota: "opcional" },
            ].map(({ tipo, rotulo, nota }) => {
              const lei = leiDoExercicio(tipo)
              return (
                <li key={tipo} className="flex items-center gap-2 flex-wrap">
                  {lei ? (
                    <CheckCircle2 className="w-4 h-4 text-green-700" aria-hidden="true" />
                  ) : (
                    <Circle className={`w-4 h-4 ${tipo === "PPA" ? "text-gray-400" : "text-amber-600"}`} aria-hidden="true" />
                  )}
                  <span>
                    <b>{rotulo}</b> <span className="text-gray-600">— {nota}:</span>{" "}
                    {lei ? <span className="text-green-800">Lei nº {lei.numero} cadastrada</span> : <span className={tipo === "PPA" ? "text-gray-600" : "text-amber-800"}>não cadastrada para {exercicio}</span>}
                  </span>
                  {!lei && (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => novaLei(tipo)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Cadastrar {tipo} {exercicio}
                    </Button>
                  )}
                </li>
              )
            })}
            <li className="flex items-center gap-2 flex-wrap">
              {dotacoes.some((d) => d.ativo !== false && Number(d.exercicio) === exercicio) ? (
                <CheckCircle2 className="w-4 h-4 text-green-700" aria-hidden="true" />
              ) : (
                <Circle className="w-4 h-4 text-amber-600" aria-hidden="true" />
              )}
              <span>
                <b>Dotação de {exercicio}</b> <span className="text-gray-600">— unidade, programa, projeto/atividade, elemento e fonte, com saldo</span>
              </span>
            </li>
          </ul>
        )}
      </section>

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
          <h2 className="text-base font-semibold text-gray-900">Leis orçamentárias (LDO, LOA, PPA — uma linha por lei)</h2>
          <Button size="sm" onClick={() => novaLei()}>
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
