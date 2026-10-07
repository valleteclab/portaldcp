"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { API_URL, authFetch } from "@/lib/api"
import { pedirTextoAcao } from "@/components/DialogoGlobal"
import { diaMes } from "@/lib/fluxo/andamento"
import type { Andamento } from "@/lib/fluxo/andamento"
import { FormularioPeca, estilos as s } from "@/components/processo/BlocosProcesso"
import type { Etapa } from "@/lib/processo/processo"

interface ItemCatalogo {
  tipo: string
  rotulo: string
  documento: { produz: boolean; aceita_externo: boolean }
}

interface DemandaResumo {
  id: string
  descricao_sucinta_objeto: string | null
  unidade_requisitante: string
  status: string
}

interface DfdDisponivel {
  id: string
  ano: number
  numero: number
  status: string
  objeto: string
}

interface RespostaWorkflow<T> {
  ok: boolean
  dados: T | null
  mensagem: string | null
  pendencias: string[] | null
}

async function apiWorkflows<T>(caminho: string, opcoes?: { metodo?: string; corpo?: unknown }): Promise<RespostaWorkflow<T>> {
  let res: Response
  try {
    res = await authFetch(`${API_URL}/api/workflows${caminho}`, {
      method: opcoes?.metodo || "GET",
      headers: opcoes?.corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: opcoes?.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    })
  } catch {
    return { ok: false, dados: null, mensagem: "Sem conexão com o servidor. Verifique sua internet e tente de novo.", pendencias: null }
  }
  const corpo = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = Array.isArray(corpo?.message) ? corpo.message.join("; ") : corpo?.message
    return { ok: false, dados: null, mensagem: msg || "Não foi possível concluir a operação.", pendencias: Array.isArray(corpo?.pendencias) ? corpo.pendencias : null }
  }
  return { ok: true, dados: corpo as T, mensagem: null, pendencias: null }
}

/**
 * ETAPA DO FLUXO em andamento (processo com `andamento.modo === 'FLUXO'`):
 * título, responsável, prazo; Concluir/Devolver (e Indeferir em APROVACAO);
 * e, para nós que produzem documento (DEMANDA, DFD), a opção de escrever no
 * sistema ou anexar o que foi feito fora — mesmo editor/IA do processo
 * (`FormularioPeca`), com a peça gravada em `etapa = 'no:<acao_id>'`.
 */
export function PainelEtapaFluxo({ processoId, andamento, onAtualizar }: { processoId: string; andamento: Andamento; onAtualizar: () => void }) {
  const no = andamento.atual
  const instanciaId = andamento.instancia_id

  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [escrevendo, setEscrevendo] = useState(false)
  const [demandas, setDemandas] = useState<DemandaResumo[] | null>(null)
  const [demandaEscolhida, setDemandaEscolhida] = useState("")
  const [dfds, setDfds] = useState<DfdDisponivel[] | null>(null)
  const [dfdEscolhido, setDfdEscolhido] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState<string[] | null>(null)
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/workflows/catalogo-nos`)
      .then((r) => (r.ok ? (r.json() as Promise<ItemCatalogo[]>) : []))
      .then((d) => vivo && setCatalogo(Array.isArray(d) ? d : []))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (no?.tipo !== "DEMANDA") return
    let vivo = true
    // Opcional: pode não estar disponível (módulo Demandas desligado para o órgão) — some a opção, sem travar o painel.
    authFetch(`${API_URL}/api/demandas`)
      .then((r) => (r.ok ? (r.json() as Promise<DemandaResumo[]>) : Promise.reject()))
      .then((d) => vivo && setDemandas(Array.isArray(d) ? d : []))
      .catch(() => vivo && setDemandas([]))
    return () => {
      vivo = false
    }
  }, [no?.tipo])

  useEffect(() => {
    if (no?.tipo !== "DFD") return
    let vivo = true
    // Opcional: sem o módulo Demandas (403), a opção do DFD consolidado some e fica só escrever/anexar.
    authFetch(`${API_URL}/api/dfds-consolidados/disponiveis-para-processo`)
      .then((r) => (r.ok ? (r.json() as Promise<DfdDisponivel[]>) : Promise.reject()))
      .then((d) => vivo && setDfds(Array.isArray(d) ? d : []))
      .catch(() => vivo && setDfds(null))
    return () => {
      vivo = false
    }
  }, [no?.tipo])

  if (!no || !instanciaId || !no.tarefa_id) return null

  const definicao = catalogo.find((c) => c.tipo === no.tipo)
  const produzDocumento = definicao?.documento.produz ?? false
  const etapaDoNo: Etapa = { chave: `no:${no.chave}`, rotulo: no.titulo, ordem: 1, estado: "ATUAL", tipo_peca: null, titulo_peca: no.titulo }

  async function concluir(resposta?: Record<string, unknown>) {
    setErro(null)
    setPendencias(null)
    setProcessando(true)
    const r = await apiWorkflows(`/execucoes/${instanciaId}/tarefas/${no!.tarefa_id}/concluir`, { metodo: "POST", corpo: { resposta } })
    setProcessando(false)
    if (!r.ok) {
      setErro(r.mensagem)
      setPendencias(r.pendencias)
      return
    }
    onAtualizar()
  }

  async function devolver() {
    const motivo = await pedirTextoAcao({ titulo: "Devolver a etapa", mensagem: "Explique ao responsável anterior por que está devolvendo.", rotulo: "Motivo", obrigatorio: true, minimo: 3 })
    if (!motivo) return
    setErro(null)
    setProcessando(true)
    const r = await apiWorkflows(`/execucoes/${instanciaId}/tarefas/${no!.tarefa_id}/devolver`, { metodo: "POST", corpo: { motivo } })
    setProcessando(false)
    if (!r.ok) {
      setErro(r.mensagem)
      return
    }
    onAtualizar()
  }

  async function indeferir() {
    const motivo = await pedirTextoAcao({ titulo: "Indeferir", mensagem: "Explique o motivo. O indeferimento encerra este processo.", rotulo: "Motivo", obrigatorio: true, minimo: 3 })
    if (!motivo) return
    setErro(null)
    setProcessando(true)
    const r = await apiWorkflows(`/execucoes/${instanciaId}/tarefas/${no!.tarefa_id}/indeferir`, { metodo: "POST", corpo: { motivo } })
    setProcessando(false)
    if (!r.ok) {
      setErro(r.mensagem)
      return
    }
    onAtualizar()
  }

  async function juntarDfd() {
    if (!dfdEscolhido) return
    setErro(null)
    setPendencias(null)
    setProcessando(true)
    try {
      const r = await authFetch(`${API_URL}/api/dfds-consolidados/${dfdEscolhido}/juntar-ao-processo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo_id: processoId }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        const m = j?.message
        setErro(Array.isArray(m) ? m.join(" ") : m || "Não foi possível juntar o DFD ao processo.")
        return
      }
      onAtualizar()
    } finally {
      setProcessando(false)
    }
  }

  const ehPrimeiraEtapa = andamento.nos[0]?.chave === no.chave
  const ehAprovacao = no.tipo === "APROVACAO"

  return (
    <section className={s.bloco} aria-labelledby="painel-etapa-fluxo">
      <div className={s.eyebrow} id="painel-etapa-fluxo">
        Etapa pendente do fluxo
      </div>
      <h2>{no.titulo}</h2>
      <p className={s.texto} style={{ marginTop: 6 }}>
        {[no.responsavel, no.prazo_em ? `prazo ${no.atrasada ? "vencido em" : "até"} ${diaMes(no.prazo_em)}` : null].filter(Boolean).join(" · ") || "Sem responsável definido."}
      </p>

      {pendencias?.length ? (
        <div className={s.erro} role="alert" style={{ marginTop: 8 }}>
          <b>Pendências para concluir esta etapa:</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {pendencias.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : erro ? (
        <div className={s.erro} role="alert" style={{ marginTop: 8 }}>
          {erro}
        </div>
      ) : null}

      {no.tipo === "DEMANDA" && demandas && demandas.length > 0 ? (
        <div className={s.formulario} style={{ marginTop: 10 }}>
          <label className={s.rotulo} htmlFor="demanda-vinculada">
            Vincular uma demanda já cadastrada (em vez de redigir)
          </label>
          <select id="demanda-vinculada" className={s.campo} value={demandaEscolhida} onChange={(e) => setDemandaEscolhida(e.target.value)}>
            <option value="">Escolha a demanda</option>
            {demandas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.descricao_sucinta_objeto || d.unidade_requisitante} — {d.unidade_requisitante}
              </option>
            ))}
          </select>
          <div className={s.acoes}>
            <button type="button" className={`${s.botao} ${s.secundario}`} onClick={() => concluir({ demanda_id: demandaEscolhida })} disabled={!demandaEscolhida || processando}>
              Vincular esta demanda e concluir
            </button>
          </div>
        </div>
      ) : null}

      {no.tipo === "DFD" && dfds !== null ? (
        <div className={s.formulario} style={{ marginTop: 10 }}>
          <p className={s.texto}>
            <b>DFD consolidado</b> — reúna as demandas dos setores num DFD só (art. 12, VII, da Lei 14.133) e junte-o aos autos como documento desta etapa.
          </p>
          {dfds.length ? (
            <>
              <label className={s.rotulo} htmlFor="dfd-consolidado">
                DFD já montado
              </label>
              <select id="dfd-consolidado" className={s.campo} value={dfdEscolhido} onChange={(e) => setDfdEscolhido(e.target.value)}>
                <option value="">Escolha o DFD</option>
                {dfds.map((d) => (
                  <option key={d.id} value={d.id}>
                    DFD nº {d.numero}/{d.ano} — {d.objeto}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <div className={s.acoes}>
            {dfds.length ? (
              <button type="button" className={`${s.botao} ${s.primario}`} onClick={juntarDfd} disabled={!dfdEscolhido || processando}>
                {processando ? "Juntando..." : "Juntar este DFD ao processo"}
              </button>
            ) : null}
            <Link href={`/orgao/demandas/consolidacao?processo=${encodeURIComponent(processoId)}`} className={`${s.botao} ${s.secundario}`}>
              Montar DFD com as demandas
            </Link>
          </div>
        </div>
      ) : null}

      {produzDocumento ? (
        escrevendo ? (
          <FormularioPeca
            processoId={processoId}
            etapa={etapaDoNo}
            tituloInicial={no.titulo}
            rotuloBotao="Juntar documento da etapa"
            onJuntada={() => {
              setEscrevendo(false)
              onAtualizar()
            }}
            onCancelar={() => setEscrevendo(false)}
          />
        ) : (
          <div className={s.acoes} style={{ marginTop: 10 }}>
            <button type="button" className={`${s.botao} ${s.secundario}`} onClick={() => setEscrevendo(true)}>
              Escrever ou anexar o documento desta etapa
            </button>
          </div>
        )
      ) : null}

      <div className={s.acoes} style={{ marginTop: 12 }}>
        {ehAprovacao ? (
          <>
            <button type="button" className={`${s.botao} ${s.primario}`} onClick={() => concluir({ decisao: "APROVADO" })} disabled={processando}>
              {processando ? "Aprovando..." : "Aprovar"}
            </button>
            {!ehPrimeiraEtapa ? (
              <button type="button" className={`${s.botao} ${s.secundario}`} onClick={devolver} disabled={processando}>
                Devolver
              </button>
            ) : null}
            <button type="button" className={`${s.botao} ${s.perigo}`} onClick={indeferir} disabled={processando}>
              Indeferir
            </button>
          </>
        ) : (
          <>
            <button type="button" className={`${s.botao} ${s.primario}`} onClick={() => concluir()} disabled={processando}>
              {processando ? "Concluindo..." : "Concluir etapa"}
            </button>
            {!ehPrimeiraEtapa ? (
              <button type="button" className={`${s.botao} ${s.secundario}`} onClick={devolver} disabled={processando}>
                Devolver
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
