"use client"

/**
 * PAINEL DO GESTOR NA TV (`/painel-tv/<token>/andamento`): a fila de
 * processos com o caminho de cada um, onde está e há quanto tempo, mais os
 * gargalos por setor. Só leitura, sem login; atualiza a cada minuto. Sem
 * valores nem despachos (o backend já não manda).
 */
import { useEffect, useMemo, useState } from "react"
import type { ResultadoCarga } from "./PainelTv"

const ATUALIZAR_MS = 60_000
const GIRAR_MS = 20_000
const POR_PAGINA = 8

const COR = {
  fundo: "#070b14",
  painel: "#0f172a",
  cartao: "#162036",
  borda: "#24314d",
  texto: "#f8fafc",
  suave: "#cbd5e1",
  apagado: "#94a3b8",
  verde: "#22c55e",
  amarelo: "#facc15",
  vermelho: "#f43f5e",
  azul: "#38bdf8",
}

interface Etapa {
  chave: string
  rotulo: string
  estado: "CONCLUIDA" | "ATUAL" | "FUTURA"
}
interface Linha {
  id: string
  tipo: string
  rotulo_tipo: string
  numero: string
  objeto: string
  estado: "OK" | "LENTO" | "PARADO" | "CONCLUIDO"
  etapas: Etapa[]
  etapa_atual: string | null
  esta_com: { setor_nome: string | null; usuario_nome: string | null; recebida: boolean; dias: number } | null
  prazo: { rotulo: string; data: string | null; vencido: boolean } | null
}
export interface AndamentoTv {
  orgao: { nome: string; logo_url: string | null }
  gerado_em: string
  kpis: { em_andamento: number; parados: number; aguardando_recebimento: number; pedidos_aguardando_dfd: number; concluidos_mes: number }
  gargalos: Array<{ setor_nome: string; processos: number; parados: number; media_dias: number }>
  linhas: Linha[]
}
export type ResultadoAndamento = { status: "ok"; dados: AndamentoTv } | { status: "fim"; mensagem: string } | { status: "adiado" } | { status: "erro" }

const corDoEstado = (e: Linha["estado"]) => (e === "PARADO" ? COR.vermelho : e === "LENTO" ? COR.amarelo : COR.azul)
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

export function PainelTvAndamento({ carregar }: { carregar: (signal: AbortSignal) => Promise<ResultadoAndamento> }) {
  const [dados, setDados] = useState<AndamentoTv | null>(null)
  const [fim, setFim] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    let vivo = true
    let parar = false
    let id: ReturnType<typeof setInterval> | null = null
    const buscar = async () => {
      if (parar) return
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 20_000)
      try {
        const r = await carregar(ctl.signal)
        if (!vivo) return
        if (r.status === "ok") {
          setDados(r.dados)
          setErro(false)
        } else if (r.status === "fim") {
          setFim(r.mensagem)
          parar = true
          if (id) clearInterval(id)
        } else if (r.status === "erro") setErro(true)
      } catch {
        if (vivo) setErro(true)
      } finally {
        clearTimeout(t)
      }
    }
    void buscar()
    id = setInterval(buscar, ATUALIZAR_MS)
    return () => {
      vivo = false
      if (id) clearInterval(id)
    }
  }, [carregar])

  const abertos = useMemo(() => (dados?.linhas ?? []).filter((l) => l.estado !== "CONCLUIDO"), [dados])
  const paginas = Math.max(1, Math.ceil(abertos.length / POR_PAGINA))
  useEffect(() => {
    if (paginas <= 1) return
    const id = setInterval(() => setPagina((p) => (p + 1) % paginas), GIRAR_MS)
    return () => clearInterval(id)
  }, [paginas])
  const visiveis = abertos.slice((pagina % paginas) * POR_PAGINA, (pagina % paginas) * POR_PAGINA + POR_PAGINA)

  if (fim) {
    return (
      <main style={{ minHeight: "100%", background: COR.fundo, color: COR.texto, display: "grid", placeItems: "center", padding: 32, fontSize: 28, textAlign: "center" }}>
        {fim}
      </main>
    )
  }

  return (
    <main style={{ minHeight: "100%", background: COR.fundo, color: COR.texto, padding: "20px 28px 28px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 16 }}>
        {dados?.orgao.logo_url ? <img src={dados.orgao.logo_url} alt="" style={{ height: 56, width: "auto", objectFit: "contain" }} /> : null}
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontSize: 16, color: COR.apagado, letterSpacing: ".08em", textTransform: "uppercase" }}>{dados?.orgao.nome ?? "Painel do gestor"}</div>
          <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.1 }}>Andamento dos processos</h1>
        </div>
        <div style={{ textAlign: "right", color: COR.apagado, fontSize: 18 }}>
          {dados ? `Atualizado às ${hora(dados.gerado_em)}` : "Carregando…"}
          {erro ? <div style={{ color: COR.amarelo }}>Sem resposta na última atualização</div> : null}
          {paginas > 1 ? <div>Página {(pagina % paginas) + 1} de {paginas}</div> : null}
        </div>
      </header>

      <section aria-label="Resumo" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
        {[
          ["Em andamento", dados?.kpis.em_andamento ?? 0, COR.azul],
          ["Parados além do limite", dados?.kpis.parados ?? 0, COR.vermelho],
          ["Aguardando recebimento", dados?.kpis.aguardando_recebimento ?? 0, COR.amarelo],
          ["Pedidos aguardando DFD", dados?.kpis.pedidos_aguardando_dfd ?? 0, COR.suave],
          ["Concluídos no mês", dados?.kpis.concluidos_mes ?? 0, COR.verde],
        ].map(([rotulo, n, cor]) => (
          <div key={String(rotulo)} style={{ background: COR.painel, border: `1px solid ${COR.borda}`, borderRadius: 14, padding: "12px 18px" }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: String(cor), lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 16, color: COR.apagado, marginTop: 6 }}>{rotulo}</div>
          </div>
        ))}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16 }}>
        <section aria-label="Processos" style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {visiveis.map((l) => (
            <article key={l.id} style={{ background: COR.cartao, border: `1px solid ${COR.borda}`, borderLeft: `8px solid ${corDoEstado(l.estado)}`, borderRadius: 12, padding: "12px 16px", display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: COR.azul, background: "#1e293b", borderRadius: 6, padding: "2px 8px" }}>{l.rotulo_tipo}</span>
                <span style={{ fontSize: 24, fontWeight: 700 }}>{l.numero}</span>
                <span style={{ fontSize: 20, color: COR.suave, flex: "1 1 320px", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={l.objeto}>
                  {l.objeto}
                </span>
              </div>
              <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "1fr", gap: 4 }}>
                {l.etapas.map((e) => (
                  <div key={e.chave} title={e.rotulo} style={{ minWidth: 0 }}>
                    <div style={{ height: 8, borderRadius: 999, background: e.estado === "CONCLUIDA" ? COR.verde : e.estado === "ATUAL" ? corDoEstado(l.estado) : COR.borda }} />
                    <div style={{ fontSize: 12, color: e.estado === "ATUAL" ? COR.texto : COR.apagado, fontWeight: e.estado === "ATUAL" ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 3 }}>{e.rotulo}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 20 }}>
                <span>
                  Está com <strong>{[l.esta_com?.setor_nome, l.esta_com?.usuario_nome].filter(Boolean).join(" · ") || "—"}</strong>
                </span>
                {l.esta_com ? (
                  <span style={{ color: corDoEstado(l.estado), fontWeight: 700 }}>
                    há {l.esta_com.dias} dia{l.esta_com.dias === 1 ? "" : "s"}
                    {!l.esta_com.recebida ? " · aguardando recebimento" : ""}
                  </span>
                ) : null}
                {l.prazo?.data ? (
                  <span style={{ color: l.prazo.vencido ? COR.vermelho : COR.suave }}>
                    {l.prazo.rotulo}: {new Date(l.prazo.data).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
          {!abertos.length && dados ? <p style={{ fontSize: 24, color: COR.apagado }}>Nenhum processo em andamento.</p> : null}
        </section>

        <aside style={{ background: COR.painel, border: `1px solid ${COR.borda}`, borderRadius: 14, padding: "14px 18px", alignSelf: "start" }}>
          <div style={{ fontSize: 14, color: COR.apagado, letterSpacing: ".08em", textTransform: "uppercase" }}>Gargalos</div>
          <h2 style={{ margin: "4px 0 12px", fontSize: 26 }}>Onde os processos param</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {(dados?.gargalos ?? []).slice(0, 7).map((g) => {
              const max = Math.max(1, ...(dados?.gargalos ?? []).map((x) => x.processos))
              return (
                <div key={g.setor_nome}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 20 }}>
                    <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.setor_nome}</strong>
                    <span style={{ color: g.parados ? COR.vermelho : COR.suave, whiteSpace: "nowrap" }}>
                      {g.processos}
                      {g.parados ? ` · ${g.parados} parado${g.parados === 1 ? "" : "s"}` : ""}
                    </span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: COR.borda, overflow: "hidden", marginTop: 4 }}>
                    <div style={{ width: `${Math.round((g.processos / max) * 100)}%`, height: "100%", background: g.parados ? COR.vermelho : COR.azul }} />
                  </div>
                  <div style={{ fontSize: 15, color: COR.apagado, marginTop: 3 }}>média de {g.media_dias} dia{g.media_dias === 1 ? "" : "s"} por processo</div>
                </div>
              )
            })}
            {dados && !dados.gargalos.length ? <p style={{ color: COR.apagado, fontSize: 18 }}>Nenhum processo tramitando.</p> : null}
          </div>
        </aside>
      </div>
    </main>
  )
}
