"use client"

import { useCallback, useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { pedirTextoAcao } from "@/components/DialogoGlobal"
import { estilos as s } from "@/components/processo/BlocosProcesso"

interface Item {
  codigo: string
  rotulo: string
  fundamento: string
  obrigatorio: boolean
}
interface Marcacao {
  status: "ATENDIDO" | "NAO_SE_APLICA"
  justificativa?: string | null
  origem: "MANUAL" | "IA"
  trecho?: string | null
  por: string | null
}
interface Checklist {
  itens: Item[]
  estado: Record<string, Marcacao>
  resumo: { total: number; atendidos: number; justificados: number; pendencias: string[] }
  documento: { titulo: string } | null
}

async function api<T>(caminho: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const r = await authFetch(`${API_URL}/api/workflows${caminho}`, {
    method: metodo,
    headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(typeof j?.message === "string" ? j.message : Array.isArray(j?.message) ? j.message.join(" ") : `Erro ${r.status}`)
  return j as T
}

/**
 * CHECKLIST DO DOCUMENTO DA ETAPA (mockup aprovado, tela "Contratação 1"):
 * no ETP, os 13 elementos do art. 18, § 1º. Obrigatórios (I, IV, VI, VIII e
 * XIII, § 2º) precisam estar atendidos; os demais, atendidos ou justificados.
 * A IA lê o documento juntado e marca o que encontrou — a pessoa confere.
 */
export function ChecklistEtapa({ instanciaId, tarefaId, versaoDocumento }: { instanciaId: string; tarefaId: string; versaoDocumento: number }) {
  const [dados, setDados] = useState<Checklist | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const base = `/execucoes/${instanciaId}/tarefas/${tarefaId}/checklist`

  const carregar = useCallback(() => {
    api<Checklist>(base)
      .then(setDados)
      .catch(() => setDados(null))
  }, [base])

  useEffect(() => {
    carregar()
  }, [carregar, versaoDocumento])

  if (!dados || !dados.itens.length) return null

  async function marcar(codigo: string, status: Marcacao["status"] | null, justificativa?: string) {
    setOcupado(true)
    setErro(null)
    try {
      setDados(await api<Checklist>(base, "PUT", { codigo, status, justificativa }))
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível marcar.")
    } finally {
      setOcupado(false)
    }
  }

  async function naoSeAplica(item: Item) {
    const j = await pedirTextoAcao({
      titulo: `${item.rotulo} não se aplica`,
      mensagem: "Explique por que este elemento não se aplica a esta contratação (fica registrado no processo).",
      rotulo: "Justificativa",
      obrigatorio: true,
      minimo: 10,
    })
    if (j) await marcar(item.codigo, "NAO_SE_APLICA", j)
  }

  async function analisar() {
    setOcupado(true)
    setErro(null)
    try {
      setDados(await api<Checklist>(`${base}/analisar`, "POST"))
    } catch (e) {
      setErro(e instanceof Error ? e.message : "A IA não conseguiu ler o documento.")
    } finally {
      setOcupado(false)
    }
  }

  const { resumo } = dados
  const feitos = resumo.atendidos + resumo.justificados
  const pct = Math.round((feitos / Math.max(1, resumo.total)) * 100)

  return (
    <div className={s.formulario} style={{ marginTop: 12, gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <b>Elementos do art. 18, § 1º</b>
        <span className={s.texto} style={{ margin: 0 }}>
          {resumo.atendidos} atendidos{resumo.justificados ? ` · ${resumo.justificados} justificados` : ""} · de {resumo.total}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--linha)", overflow: "hidden" }} aria-hidden="true">
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--azul)" }} />
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {dados.itens.map((i) => {
          const m = dados.estado[i.codigo]
          return (
            <li key={i.codigo} style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <label htmlFor={`ck-${i.codigo}`} style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: "1 1 260px", minWidth: 0, cursor: "pointer" }}>
                <input
                  id={`ck-${i.codigo}`}
                  type="checkbox"
                  checked={m?.status === "ATENDIDO"}
                  disabled={ocupado}
                  onChange={(e) => marcar(i.codigo, e.target.checked ? "ATENDIDO" : null)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  {i.rotulo}
                  {i.obrigatorio ? <b style={{ color: "var(--vez)", fontSize: 12 }}> · obrigatório</b> : null}
                  <span style={{ display: "block", fontSize: 12, color: "var(--apagado)" }}>
                    {i.fundamento}
                    {m?.origem === "IA" ? ` · marcado pela IA${m.trecho ? `: “${m.trecho}”` : ""} — confira` : ""}
                    {m?.status === "NAO_SE_APLICA" ? ` · não se aplica: ${m.justificativa}` : ""}
                  </span>
                </span>
              </label>
              {!i.obrigatorio && m?.status !== "ATENDIDO" ? (
                m?.status === "NAO_SE_APLICA" ? (
                  <button type="button" className={s.link} onClick={() => marcar(i.codigo, null)} disabled={ocupado}>
                    Desfazer
                  </button>
                ) : (
                  <button type="button" className={s.link} onClick={() => naoSeAplica(i)} disabled={ocupado}>
                    Não se aplica…
                  </button>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
      {erro ? (
        <div className={s.erro} role="alert">
          {erro}
        </div>
      ) : null}
      <div className={s.acoes}>
        <button type="button" className={`${s.botao} ${s.secundario}`} onClick={analisar} disabled={ocupado || !dados.documento} title={dados.documento ? undefined : "Junte o documento primeiro"}>
          {ocupado ? "Aguarde..." : "Conferir o documento com a IA"}
        </button>
      </div>
      <p className={s.texto} style={{ margin: 0 }}>
        “Concluir” libera quando os elementos obrigatórios (art. 18, § 2º) estiverem atendidos e os demais atendidos ou justificados, com o documento juntado.
      </p>
    </div>
  )
}

interface Trazido {
  dfd: { id: string; rotulo: string; demandas: number; setores: string[]; valor_total: number } | null
  documentos: Array<{ titulo: string; created_at: string }>
}

/** "Trazido das etapas anteriores" (mockup): DFD consolidado e documentos já juntados pelas etapas. */
export function TrazidoEtapasAnteriores({ processoId, versao }: { processoId: string; versao: number }) {
  const [dados, setDados] = useState<Trazido | null>(null)
  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/processos/${processoId}/trazido`)
      .then((r) => (r.ok ? (r.json() as Promise<Trazido>) : null))
      .then((d) => vivo && setDados(d))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [processoId, versao])
  if (!dados || (!dados.dfd && !dados.documentos.length)) return null
  return (
    <div className={s.formulario} style={{ marginTop: 12, gap: 8 }}>
      <b>Trazido das etapas anteriores</b>
      {dados.dfd ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span className={s.texto} style={{ margin: 0 }}>
              Demandas reunidas no {dados.dfd.rotulo}
            </span>
            <b>
              {dados.dfd.demandas} {dados.dfd.demandas === 1 ? "demanda" : "demandas"}
              {dados.dfd.setores.length ? ` · ${dados.dfd.setores.join(", ")}` : ""}
            </b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span className={s.texto} style={{ margin: 0 }}>
              Valor estimado
            </span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{dados.dfd.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>
          </div>
        </>
      ) : null}
      {dados.documentos.length ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {dados.documentos.map((d, i) => (
            <li key={i} className={s.texto} style={{ margin: 0 }}>
              {d.titulo} — {new Date(d.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
