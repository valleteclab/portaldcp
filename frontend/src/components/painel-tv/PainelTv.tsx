"use client"

/**
 * PAINEL PARA TV (uso interno do setor de licitação) — a tela.
 *
 *  - tela cheia, tema escuro, alto contraste, letra grande (legível a 3–4 m);
 *  - escala proporcional: 1em = 16 px em 1920×1080 e 32 px em 3840×2160;
 *  - sem mouse/teclado: atualiza a cada 60 s e roda as páginas a cada 25 s
 *    (quadro de processos, com as colunas "rolando por página", e contratos);
 *  - sem conexão: mantém os últimos dados e avisa "sem conexão desde HH:MM";
 *  - ligada por dias: um intervalo de cada tipo, limpos ao desmontar; os dados
 *    são SUBSTITUÍDOS a cada leitura (nada acumula); recarrega de madrugada
 *    depois de 20 h no ar.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertOctagon, CalendarClock, Clock, Megaphone, PauseCircle, User, Users, WifiOff } from "lucide-react"
import { getAssetUrl } from "@/lib/api"
import {
  CartaoContratoTv,
  CartaoProcessoTv,
  PaginaTv,
  PainelTvDados,
  dataLongaTv,
  dataPuraTv,
  diaHoraTv,
  horaDoDiaTv,
  horaTv,
  moedaTv,
  paginarPainel,
} from "@/lib/painel-tv"

export type ResultadoCarga =
  | { status: "ok"; dados: PainelTvDados }
  | { status: "fim"; mensagem: string } // link inválido/revogado: para de consultar
  | { status: "adiado" } // limite de requisições: tenta na próxima
  | { status: "erro" }

const ATUALIZAR_MS = 60_000
const GIRAR_MS = 25_000
const TEMPO_LIMITE_MS = 20_000
const RECARREGAR_DEPOIS_MS = 20 * 3_600_000

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

const corDoPrazo = (c: CartaoProcessoTv["cor_prazo"]) =>
  c === "VERMELHO" ? COR.vermelho : c === "AMARELO" ? COR.amarelo : c === "VERDE" ? COR.verde : COR.borda
const corDaFaixa = (f: CartaoContratoTv["faixa"]) => (f === "VERMELHO" ? COR.vermelho : f === "AMARELO" ? COR.amarelo : COR.suave)

/** Relógio isolado (só ele re-renderiza a cada segundo). */
const Relogio = memo(function Relogio() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right leading-none">
      <div className="font-bold tabular-nums" style={{ fontSize: "3.1em" }}>{horaTv(agora)}</div>
      <div className="mt-[0.25em]" style={{ fontSize: "1.15em", color: COR.suave }}>{dataLongaTv(agora)}</div>
    </div>
  )
})

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: string }) {
  return (
    <div className="rounded-[0.5em] px-[0.8em] py-[0.45em] flex flex-col justify-center" style={{ background: COR.painel, border: `0.08em solid ${destaque && valor > 0 ? destaque : COR.borda}` }}>
      <div className="font-extrabold tabular-nums leading-none" style={{ fontSize: "3em", color: destaque && valor > 0 ? destaque : COR.texto }}>{valor}</div>
      <div className="mt-[0.2em] leading-tight" style={{ fontSize: "1.05em", color: COR.suave }}>{rotulo}</div>
    </div>
  )
}

function Etiqueta({ texto, cor, fundo }: { texto: string; cor: string; fundo?: string }) {
  return (
    <span className="rounded-[0.3em] px-[0.4em] py-[0.05em] font-bold uppercase whitespace-nowrap" style={{ fontSize: "0.85em", color: fundo ? "#0b1020" : cor, background: fundo ?? "transparent", border: `0.08em solid ${cor}` }}>
      {texto}
    </span>
  )
}

function Cartao({ p }: { p: CartaoProcessoTv }) {
  const lateral = p.atrasado ? COR.vermelho : corDoPrazo(p.cor_prazo)
  const evento = p.evento ? `${p.evento.tipo === "SESSAO" ? "Sessão" : "Propostas até"} ${diaHoraTv(p.evento.data)}` : null
  return (
    <div
      className="rounded-[0.5em] px-[0.7em] py-[0.5em] flex flex-col gap-[0.2em] min-h-0"
      style={{ background: COR.cartao, borderLeft: `0.45em solid ${lateral}`, opacity: p.suspenso ? 0.8 : 1 }}
    >
      <div className="flex items-center gap-[0.4em] min-w-0">
        <span className="font-bold truncate" style={{ fontSize: "1.4em" }}>{p.numero}</span>
        <span className="ml-auto flex items-center gap-[0.35em] shrink-0">
          {p.bloqueios > 0 && (
            <span className="flex items-center gap-[0.15em] font-bold" style={{ fontSize: "1.2em", color: COR.vermelho }} title="Achados de bloqueio abertos na conformidade">
              <AlertOctagon className="w-[1em] h-[1em]" />
              {p.bloqueios}
            </span>
          )}
          {p.suspenso && <Etiqueta texto="Suspenso" cor={COR.amarelo} />}
          {p.atrasado && <Etiqueta texto="Atrasado" cor={COR.vermelho} fundo={COR.vermelho} />}
        </span>
      </div>
      <div className="leading-snug line-clamp-2" style={{ fontSize: "1.2em", color: COR.texto }}>{p.objeto}</div>
      <div className="flex items-center gap-[0.5em] min-w-0" style={{ fontSize: "1.1em", color: COR.suave }}>
        {p.com_quem ? (
          <span className="flex items-center gap-[0.25em] min-w-0 truncate">
            {p.com_quem.tipo === "SETOR" ? <Users className="w-[1em] h-[1em] shrink-0" /> : <User className="w-[1em] h-[1em] shrink-0" />}
            <span className="truncate">{p.com_quem.nome}</span>
          </span>
        ) : (
          <span style={{ color: COR.apagado }}>sem responsável</span>
        )}
        {p.dias_na_etapa !== null && (
          <span className="ml-auto flex items-center gap-[0.2em] shrink-0 tabular-nums">
            <Clock className="w-[0.9em] h-[0.9em]" />
            {p.dias_na_etapa === 0 ? "hoje" : `${p.dias_na_etapa} ${p.dias_na_etapa === 1 ? "dia" : "dias"}`}
          </span>
        )}
      </div>
      <div className="truncate" style={{ fontSize: "1em", color: COR.apagado }}>
        {p.modalidade} · {p.etapa}
        {evento && <span style={{ color: COR.azul }}> · {evento}</span>}
        {!evento && p.prazo && !p.atrasado && <span> · prazo {diaHoraTv(p.prazo).slice(0, 5)}</span>}
      </div>
    </div>
  )
}

function CartaoContrato({ c }: { c: CartaoContratoTv }) {
  const cor = corDaFaixa(c.faixa)
  return (
    <div className="rounded-[0.6em] px-[0.9em] py-[0.6em] flex gap-[0.8em] min-h-0" style={{ background: COR.cartao, borderLeft: `0.45em solid ${cor}` }}>
      <div className="flex flex-col items-center justify-center shrink-0 w-[5.2em]">
        <div className="font-extrabold tabular-nums leading-none" style={{ fontSize: "3em", color: cor }}>{c.dias_restantes}</div>
        <div style={{ fontSize: "1em", color: COR.suave }}>{c.dias_restantes === 1 ? "dia" : "dias"}</div>
      </div>
      <div className="flex flex-col gap-[0.15em] min-w-0 flex-1">
        <div className="flex items-baseline gap-[0.5em] min-w-0">
          <span className="font-bold truncate" style={{ fontSize: "1.4em" }}>Contrato {c.numero}</span>
          <span className="ml-auto shrink-0 tabular-nums" style={{ fontSize: "1.1em", color: COR.suave }}>fim {dataPuraTv(c.fim_vigencia)}</span>
        </div>
        <div className="font-semibold truncate" style={{ fontSize: "1.2em" }}>{c.contratado}</div>
        <div className="truncate" style={{ fontSize: "1.1em", color: COR.suave }}>{c.objeto}</div>
        <div className="flex items-center gap-[0.5em] min-w-0" style={{ fontSize: "1.05em", color: COR.apagado }}>
          {c.responsavel && <span className="truncate">{c.responsavel.papel}: {c.responsavel.nome}</span>}
          {c.valor !== null && <span className="ml-auto shrink-0 tabular-nums">{moedaTv(c.valor)}</span>}
        </div>
        {(c.prorrogacao_rotulo || c.aditivo_prazo_em_andamento) && (
          <div className="flex flex-wrap gap-[0.4em] mt-[0.1em]">
            {c.prorrogacao_rotulo && <Etiqueta texto={c.prorrogacao_rotulo} cor={c.prorrogacao === "NAO_PRORROGAVEL" ? COR.vermelho : COR.verde} />}
            {c.aditivo_prazo_em_andamento && <Etiqueta texto="Aditivo de prazo em andamento" cor={COR.azul} />}
          </div>
        )}
      </div>
    </div>
  )
}

function Rodape({ d }: { d: PainelTvDados }) {
  const bloco = (titulo: string, icone: React.ReactNode, linhas: string[], vazio: string) => (
    <div className="rounded-[0.5em] px-[0.8em] py-[0.45em] min-w-0" style={{ background: COR.painel, border: `0.08em solid ${COR.borda}` }}>
      <div className="flex items-center gap-[0.35em] font-bold uppercase tracking-wide" style={{ fontSize: "0.95em", color: COR.apagado }}>
        {icone}
        {titulo}
      </div>
      {linhas.length ? (
        linhas.slice(0, 2).map((l, i) => (
          <div key={i} className="truncate" style={{ fontSize: "1.15em" }}>{l}</div>
        ))
      ) : (
        <div style={{ fontSize: "1.15em", color: COR.apagado }}>{vazio}</div>
      )}
    </div>
  )
  return (
    <div className="grid grid-cols-3 gap-[0.6em]">
      {bloco(
        "Próximas sessões e fins de prazo",
        <CalendarClock className="w-[1.1em] h-[1.1em]" />,
        d.rodape.proximos_eventos.map((e) => `${diaHoraTv(e.data)} — ${e.tipo === "SESSAO" ? "sessão" : "fim das propostas"} — ${e.numero}`),
        "Nenhuma nos próximos dias",
      )}
      {bloco(
        "Publicados no PNCP (24 h)",
        <Megaphone className="w-[1.1em] h-[1.1em]" />,
        d.rodape.publicacoes_24h.map((p) => `${horaTv(p.data)} — ${p.numero} — ${p.objeto}`),
        "Nenhuma publicação nas últimas 24 h",
      )}
      {bloco(
        "Contratos vencendo em 7 dias",
        <CalendarClock className="w-[1.1em] h-[1.1em]" />,
        d.rodape.contratos_7_dias.map((c) => `${c.numero} — ${c.contratado} — ${c.dias_restantes === 0 ? "vence hoje" : `${c.dias_restantes} ${c.dias_restantes === 1 ? "dia" : "dias"}`}`),
        "Nenhum contrato vence nesta semana",
      )}
    </div>
  )
}

function PaginaQuadro({ pagina }: { pagina: Extract<PaginaTv, { tipo: "QUADRO" }> }) {
  if (!pagina.segmentos.length) {
    return (
      <div className="h-full flex items-center justify-center" style={{ fontSize: "2em", color: COR.apagado }}>
        Nenhum processo em andamento
      </div>
    )
  }
  return (
    <div className="h-full grid gap-[0.7em]" style={{ gridTemplateColumns: `repeat(${Math.max(pagina.segmentos.length, 3)}, minmax(0, 1fr))` }}>
      {pagina.segmentos.map((s) => (
        <div key={`${s.chave}-${s.parte}`} className="flex flex-col gap-[0.5em] min-h-0 min-w-0">
          <div className="flex items-baseline gap-[0.4em] px-[0.2em]">
            <span className="font-bold truncate" style={{ fontSize: "1.45em" }}>{s.titulo}</span>
            <span className="ml-auto shrink-0 tabular-nums font-bold" style={{ fontSize: "1.3em", color: COR.azul }}>{s.total}</span>
          </div>
          {s.partes > 1 && (
            <div className="px-[0.2em] -mt-[0.4em]" style={{ fontSize: "0.95em", color: COR.apagado }}>parte {s.parte} de {s.partes}</div>
          )}
          <div className="flex flex-col gap-[0.5em] min-h-0">
            {s.processos.map((p) => (
              <Cartao key={p.chave} p={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PaginaContratos({ pagina, janela }: { pagina: Extract<PaginaTv, { tipo: "CONTRATOS" }>; janela: number }) {
  return (
    <div className="h-full flex flex-col gap-[0.6em] min-h-0">
      <div className="flex items-baseline gap-[0.6em]">
        <span className="font-bold" style={{ fontSize: "1.7em" }}>Contratos vigentes que vencem nos próximos {janela} dias</span>
        {pagina.partes > 1 && <span style={{ fontSize: "1.1em", color: COR.apagado }}>parte {pagina.parte} de {pagina.partes}</span>}
      </div>
      {pagina.contratos.length ? (
        <div className="grid grid-cols-3 gap-[0.7em] flex-1 min-h-0" style={{ gridAutoRows: "minmax(0, 1fr)", gridTemplateRows: "repeat(3, minmax(0, 1fr))" }}>
          {pagina.contratos.map((c) => (
            <CartaoContrato key={c.chave} c={c} />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center" style={{ fontSize: "2em", color: COR.apagado }}>
          Nenhum contrato vence nos próximos {janela} dias
        </div>
      )}
    </div>
  )
}

/** Quantos cartões cabem na altura de uma coluna (medida real da tela). */
function useCartoesPorColuna(ref: React.RefObject<HTMLDivElement | null>, pronto: boolean): number {
  const [n, setN] = useState(4)
  useEffect(() => {
    const el = ref.current
    if (!pronto || !el || typeof ResizeObserver === "undefined") return
    const calcular = () => {
      const em = Math.min(window.innerWidth * 0.008333, window.innerHeight * 0.014815)
      const util = el.clientHeight - 4 * em // cabeçalho da coluna
      const cartao = 9.9 * em + 0.5 * em
      setN(Math.max(2, Math.min(8, Math.floor((util + 0.5 * em) / cartao))))
    }
    calcular()
    const ro = new ResizeObserver(calcular)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, pronto])
  return n
}

export function PainelTv({ carregar, previa = false }: { carregar: (signal: AbortSignal) => Promise<ResultadoCarga>; previa?: boolean }) {
  const [dados, setDados] = useState<PainelTvDados | null>(null)
  const [fim, setFim] = useState<string | null>(null)
  const [semConexaoDesde, setSemConexaoDesde] = useState<Date | null>(null)
  const [indice, setIndice] = useState(0)
  const carregarRef = useRef(carregar)
  carregarRef.current = carregar
  const refMedida = useRef<HTMLDivElement | null>(null)

  // Atualização a cada 60 s (um intervalo só; a leitura anterior é abortada)
  useEffect(() => {
    let vivo = true
    let controle: AbortController | null = null
    const inicio = Date.now()
    let id: ReturnType<typeof setInterval> | null = null
    const buscar = async () => {
      if (!previa && Date.now() - inicio > RECARREGAR_DEPOIS_MS && horaDoDiaTv(new Date()) === 4) {
        window.location.reload()
        return
      }
      controle?.abort()
      const atual = new AbortController()
      controle = atual
      const limite = setTimeout(() => atual.abort(), TEMPO_LIMITE_MS)
      try {
        const r = await carregarRef.current(atual.signal)
        if (!vivo) return
        if (r.status === "ok") {
          setDados(r.dados)
          setSemConexaoDesde(null)
        } else if (r.status === "fim") {
          setFim(r.mensagem)
          if (id) clearInterval(id)
          id = null
        } else if (r.status === "erro") {
          setSemConexaoDesde((d) => d ?? new Date())
        }
      } catch {
        if (vivo) setSemConexaoDesde((d) => d ?? new Date())
      } finally {
        clearTimeout(limite)
      }
    }
    void buscar()
    id = setInterval(buscar, ATUALIZAR_MS)
    return () => {
      vivo = false
      if (id) clearInterval(id)
      controle?.abort()
    }
  }, [previa])

  const cartoesPorColuna = useCartoesPorColuna(refMedida, !!dados && !fim)
  const paginas = useMemo(() => (dados ? paginarPainel(dados, { cartoesPorColuna }) : []), [dados, cartoesPorColuna])
  const total = paginas.length

  // Rotação das páginas a cada 25 s
  useEffect(() => {
    if (total <= 1) return
    const id = setInterval(() => setIndice((i) => (i + 1) % total), GIRAR_MS)
    return () => clearInterval(id)
  }, [total])
  const atual = total ? paginas[Math.min(indice, total - 1)] : null

  const telaCheia = useCallback(() => {
    const el = document.documentElement
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => undefined)
  }, [])

  const visiveis = new Set(atual?.tipo === "QUADRO" ? atual.segmentos.map((s) => s.chave) : [])

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none flex flex-col gap-[0.6em] p-[0.9em]"
      style={{ fontSize: "min(0.8333vw, 1.4815vh)", background: COR.fundo, color: COR.texto, cursor: previa ? "default" : "none" }}
      onDoubleClick={telaCheia}
    >
      {fim ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-[0.6em]">
          <div className="font-bold" style={{ fontSize: "2.6em" }}>Painel indisponível</div>
          <div style={{ fontSize: "1.6em", color: COR.suave, maxWidth: "40em" }}>{fim}</div>
        </div>
      ) : !dados ? (
        <div className="flex-1 flex items-center justify-center" style={{ fontSize: "2em", color: COR.apagado }}>
          {semConexaoDesde ? `Sem conexão desde ${horaTv(semConexaoDesde)} — tentando de novo…` : "Carregando o painel…"}
        </div>
      ) : (
        <>
          {/* Cabeçalho: órgão, relógio e situação da conexão */}
          <div className="flex items-center gap-[1em] shrink-0">
            {dados.orgao.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getAssetUrl(dados.orgao.logo_url)} alt="" className="object-contain shrink-0" style={{ height: "4.2em", width: "4.2em" }} />
            )}
            <div className="min-w-0">
              <div className="font-bold truncate leading-tight" style={{ fontSize: "2em" }}>{dados.orgao.nome}</div>
              <div style={{ fontSize: "1.15em", color: COR.suave }}>
                Licitações e contratos {previa && <span style={{ color: COR.amarelo }}>· pré-visualização</span>}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-[1.2em]">
              <div className="text-right" style={{ fontSize: "1.05em" }}>
                {semConexaoDesde ? (
                  <span className="flex items-center gap-[0.3em] font-bold" style={{ color: COR.vermelho }}>
                    <WifiOff className="w-[1.1em] h-[1.1em]" /> sem conexão desde {horaTv(semConexaoDesde)}
                  </span>
                ) : (
                  <span style={{ color: COR.apagado }}>atualizado às {horaTv(dados.gerado_em)}</span>
                )}
                <div className="tabular-nums" style={{ color: COR.apagado }}>página {Math.min(indice, total - 1) + 1} de {total}</div>
              </div>
              <Relogio />
            </div>
          </div>

          {/* Números do topo */}
          <div className="grid grid-cols-8 gap-[0.6em] shrink-0">
            <Numero rotulo="Processos em andamento" valor={dados.numeros.em_andamento} />
            <Numero rotulo="Atrasados" valor={dados.numeros.atrasados} destaque={COR.vermelho} />
            <Numero rotulo="Publicados (7 dias)" valor={dados.numeros.publicados_7_dias} />
            <Numero rotulo="Sessões/propostas hoje" valor={dados.numeros.eventos_hoje} destaque={COR.azul} />
            <Numero rotulo="Sessões/propostas 7 dias" valor={dados.numeros.eventos_7_dias} />
            <Numero rotulo="Contratos até 30 dias" valor={dados.numeros.contratos_30} destaque={COR.vermelho} />
            <Numero rotulo="Contratos até 60 dias" valor={dados.numeros.contratos_60} destaque={COR.amarelo} />
            <Numero rotulo="Contratos até 90 dias" valor={dados.numeros.contratos_90} />
          </div>

          {/* Todas as etapas, com a quantidade (as da página atual em destaque) */}
          <div className="flex gap-[0.35em] shrink-0">
            {dados.colunas.map((c) => (
              <div
                key={c.chave}
                className="flex-1 min-w-0 rounded-[0.4em] px-[0.4em] py-[0.25em] flex items-baseline gap-[0.3em]"
                style={{
                  background: visiveis.has(c.chave) ? "#1e3a5f" : COR.painel,
                  border: `0.08em solid ${visiveis.has(c.chave) ? COR.azul : COR.borda}`,
                  opacity: c.total ? 1 : 0.55,
                }}
              >
                <span className="truncate" style={{ fontSize: "0.95em", color: COR.suave }}>{c.titulo}</span>
                <span className="ml-auto font-bold tabular-nums" style={{ fontSize: "1.2em" }}>{c.total}</span>
              </div>
            ))}
          </div>

          {/* Página da rotação */}
          <div ref={refMedida} className="flex-1 min-h-0">
            {atual?.tipo === "CONTRATOS" ? (
              <PaginaContratos pagina={atual} janela={dados.janela_contratos_dias} />
            ) : atual?.tipo === "QUADRO" ? (
              <PaginaQuadro pagina={atual} />
            ) : null}
          </div>

          <div className="shrink-0">
            <Rodape d={dados} />
          </div>

          {/* Indicador de página */}
          {total > 1 && (
            <div className="absolute bottom-[0.25em] left-1/2 -translate-x-1/2 flex gap-[0.35em]">
              {paginas.map((p, i) => (
                <span
                  key={i}
                  className="rounded-full"
                  style={{
                    width: "0.55em",
                    height: "0.55em",
                    background: i === Math.min(indice, total - 1) ? (p.tipo === "CONTRATOS" ? COR.amarelo : COR.azul) : COR.borda,
                  }}
                />
              ))}
            </div>
          )}
          {!previa ? null : (
            <div className="absolute top-[0.3em] left-1/2 -translate-x-1/2 flex items-center gap-[0.3em] rounded-[0.3em] px-[0.6em]" style={{ background: COR.amarelo, color: "#0b1020", fontSize: "0.9em" }}>
              <PauseCircle className="w-[1em] h-[1em]" /> Pré-visualização — na TV, abra o link gerado em tela cheia
            </div>
          )}
        </>
      )}
    </div>
  )
}
