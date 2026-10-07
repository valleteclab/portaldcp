"use client"

import { useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { estilos as s } from "@/components/processo/BlocosProcesso"

interface ModeloResumo {
  id: string
  nome: string
  descricao: string | null
  status: string
}

/**
 * Oferece ligar um fluxo desenhado a este processo (item 4 do pedido):
 * escolher um fluxo PUBLICADO do órgão, ou usar o modelo pronto
 * "Contratação — demanda ao DFD" (Demanda → Aprovação → DFD) para testar.
 */
export function IniciarFluxoProcesso({ processoId, onIniciado }: { processoId: string; onIniciado: () => void }) {
  const [modelos, setModelos] = useState<ModeloResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [escolhido, setEscolhido] = useState("")
  const [iniciando, setIniciando] = useState(false)
  const [criandoModelo, setCriandoModelo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/workflows`)
      .then((r) => (r.ok ? (r.json() as Promise<ModeloResumo[]>) : []))
      .then((d) => vivo && setModelos((Array.isArray(d) ? d : []).filter((m) => m.status === "PUBLICADO")))
      .catch(() => vivo && setModelos([]))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [])

  async function iniciar(workflowId: string) {
    setErro(null)
    setIniciando(true)
    try {
      const r = await authFetch(`${API_URL}/api/workflows/${workflowId}/iniciar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo_id: processoId }),
      })
      const corpo = await r.json().catch(() => null)
      if (!r.ok) throw new Error((Array.isArray(corpo?.message) ? corpo.message.join("; ") : corpo?.message) || "Não foi possível iniciar o fluxo.")
      onIniciado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível iniciar o fluxo.")
    } finally {
      setIniciando(false)
    }
  }

  async function usarModeloDeTeste() {
    setErro(null)
    setCriandoModelo(true)
    try {
      const r = await authFetch(`${API_URL}/api/workflows/modelos-prontos/demanda-dfd`, { method: "POST" })
      const corpo = await r.json().catch(() => null)
      if (!r.ok) throw new Error(corpo?.message || "Não foi possível criar o modelo.")
      await iniciar(corpo.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o modelo.")
    } finally {
      setCriandoModelo(false)
    }
  }

  return (
    <section className={s.bloco} aria-labelledby="iniciar-fluxo">
      <div className={s.eyebrow} id="iniciar-fluxo">
        Fluxo
      </div>
      <h2>Nenhum fluxo ligado a este processo</h2>
      <p className={s.texto} style={{ marginTop: 6 }}>
        Ligue um fluxo desenhado para acompanhar este processo etapa por etapa, com responsável e prazo em cada uma.
      </p>
      {erro ? (
        <div className={s.erro} role="alert" style={{ marginTop: 8 }}>
          {erro}
        </div>
      ) : null}
      <div className={s.formulario} style={{ marginTop: 10 }}>
        <label className={s.rotulo} htmlFor="fluxo-escolhido">
          Fluxo publicado do órgão
        </label>
        <select id="fluxo-escolhido" className={s.campo} value={escolhido} onChange={(e) => setEscolhido(e.target.value)} disabled={carregando}>
          <option value="">{carregando ? "Carregando..." : modelos.length ? "Escolha o fluxo" : "Nenhum fluxo publicado"}</option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        <div className={s.acoes}>
          <button type="button" className={`${s.botao} ${s.primario}`} onClick={() => escolhido && iniciar(escolhido)} disabled={!escolhido || iniciando}>
            {iniciando ? "Iniciando..." : "Iniciar fluxo"}
          </button>
          <button type="button" className={`${s.botao} ${s.secundario}`} onClick={usarModeloDeTeste} disabled={criandoModelo || iniciando}>
            {criandoModelo ? "Criando..." : "Usar modelo: Demanda → Aprovação → DFD"}
          </button>
        </div>
      </div>
    </section>
  )
}
