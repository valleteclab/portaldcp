"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowRight, Check, ChevronLeft, Compass, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { confirmarAcao } from "@/components/DialogoGlobal"
import { useModulosOrgao, ModuloSistema } from "@/hooks/useModulosOrgao"
import { logout } from "@/lib/api"
import {
  caminhoDaRota, carregarGuia, comecarRoteiroDispensa, LETRA_ROTEIRO, numeroDoPasso, passagemDeVez, passoAtual,
  rotuloPessoas, situacaoDoRoteiro, type ChaveRoteiro, type PassoGuia, type ProgressoGuia, type RoteiroGuia,
} from "@/lib/guia/guia"
import { DestaqueGuia, type PedidoDestaque } from "./DestaqueGuia"

const AZUL = "#1351b4"
const INTERVALO_ATUALIZACAO = 20_000
const CHAVE_ULTIMO_VISTO = "guia:ultimo-visto"

/** Quem está logado (usuário do órgão ou login do órgão), para não comparar o que outra pessoa viu. */
function quemEstaLogado(): string | null {
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null")
    if (u?.id) return `u:${u.id}`
    const o = JSON.parse(localStorage.getItem("orgao") || "null")
    return o?.id ? `o:${o.id}` : null
  } catch {
    return null
  }
}

/** Roteiro da dispensa como esta aba o viu por último (conveniência: falha = sem aviso). */
function lerUltimoVisto(): RoteiroGuia | null {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(CHAVE_ULTIMO_VISTO) || "null")
    return salvo && salvo.quem === quemEstaLogado() ? (salvo.roteiro as RoteiroGuia) : null
  } catch {
    return null
  }
}

function gravarUltimoVisto(roteiro: RoteiroGuia) {
  try {
    sessionStorage.setItem(CHAVE_ULTIMO_VISTO, JSON.stringify({ quem: quemEstaLogado(), roteiro }))
  } catch {
    // sem armazenamento: o aviso só aparece sem recarregar a página
  }
}

/**
 * GUIA DE PRIMEIROS PASSOS — botão "Guia" do cabeçalho (módulo Processo
 * Eletrônico). Abre o painel com os dois roteiros, leva à tela de cada passo
 * com o botão destacado e avisa quando a próxima providência é de outro
 * usuário. O andamento vem do servidor (deduzido dos dados do órgão).
 */
export function GuiaPrimeirosPassos() {
  const pathname = usePathname()
  const router = useRouter()
  const { temAcesso, loading } = useModulosOrgao()
  const ativo = pathname.startsWith("/orgao") && !loading && temAcesso(ModuloSistema.PROCESSOS)

  const [progresso, setProgresso] = useState<ProgressoGuia | null>(null)
  const [aberto, setAberto] = useState(false)
  const [vista, setVista] = useState<"roteiros" | ChaveRoteiro>("roteiros")
  const [destaque, setDestaque] = useState<PedidoDestaque | null>(null)
  const [passagem, setPassagem] = useState<{ concluido: PassoGuia; proximo: PassoGuia; numeroConcluido: number; numero: number } | null>(null)
  const [comecando, setComecando] = useState(false)
  const anterior = useRef<ProgressoGuia | null>(null)

  const aplicar = useCallback((p: ProgressoGuia) => {
    // Depois de recarregar a página, o "antes" vem do que esta aba viu por último (mesmo usuário)
    const antes = anterior.current?.roteiros.find((r) => r.chave === "DISPENSA") ?? lerUltimoVisto()
    const depois = p.roteiros.find((r) => r.chave === "DISPENSA")
    const vez = passagemDeVez(antes, depois)
    if (vez && depois) setPassagem({ ...vez, numeroConcluido: numeroDoPasso(depois, vez.concluido.chave), numero: numeroDoPasso(depois, vez.proximo.chave) })
    anterior.current = p
    if (depois) gravarUltimoVisto(depois)
    setProgresso(p)
  }, [])

  const atualizar = useCallback(async () => {
    try {
      aplicar(await carregarGuia())
    } catch {
      // Guia é auxílio: falha de rede não atrapalha a tela
    }
  }, [aplicar])

  useEffect(() => {
    if (!ativo) return
    const t = window.setTimeout(atualizar, 600)
    return () => window.clearTimeout(t)
  }, [ativo, pathname, atualizar])

  useEffect(() => {
    if (!ativo) return
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") atualizar()
    }, INTERVALO_ATUALIZACAO)
    return () => window.clearInterval(id)
  }, [ativo, atualizar])

  const fecharDestaque = useCallback(() => setDestaque(null), [])

  if (!ativo) return null

  const roteiro = (chave: ChaveRoteiro) => progresso?.roteiros.find((r) => r.chave === chave) ?? null

  const abrirPainel = () => {
    setAberto((v) => !v)
    atualizar()
  }

  const irParaTela = (r: RoteiroGuia, passo: PassoGuia) => {
    if (!passo.tela) return
    setDestaque({
      id: Date.now(),
      alvo: passo.tela.alvo,
      caminho: caminhoDaRota(passo.tela.rota),
      rotulo: `Passo ${numeroDoPasso(r, passo.chave)} de ${r.total} · ${passo.quem}`,
      titulo: passo.titulo,
      balao: passo.tela.balao,
    })
    setVista(r.chave)
    setAberto(false)
    router.push(passo.tela.rota)
  }

  const comecar = async (recomecar: boolean) => {
    if (recomecar && !(await confirmarAcao({
      titulo: "Recomeçar o roteiro da dispensa",
      mensagem: "O roteiro volta ao passo 1 e passa a acompanhar a próxima demanda criada no órgão. Nada do que já foi feito é apagado.",
      confirmarRotulo: "Recomeçar",
    }))) return
    setComecando(true)
    try {
      const p = await comecarRoteiroDispensa()
      anterior.current = p
      setProgresso(p)
      setVista("DISPENSA")
    } catch (e: unknown) {
      toast.error(`Não foi possível começar o roteiro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setComecando(false)
    }
  }

  const trocarDeUsuario = () => {
    setPassagem(null)
    logout()
    router.push("/orgao-login")
  }

  const percentual = progresso && progresso.total ? Math.round((progresso.concluidos / progresso.total) * 100) : 0

  return (
    <>
      <button
        type="button"
        onClick={abrirPainel}
        aria-expanded={aberto}
        aria-controls="painel-guia"
        className={`inline-flex h-10 items-center gap-2 rounded-lg border-2 px-3 text-sm font-semibold transition-colors ${aberto ? "border-[#1351b4] bg-[#EAF1FB] text-[#1351b4]" : "border-slate-200 bg-white text-slate-700 hover:border-[#1351b4] hover:text-[#1351b4]"}`}
      >
        <Compass className="h-4 w-4" aria-hidden="true" />
        <span>Guia</span>
        {progresso && (
          <span className="hidden sm:inline rounded-full bg-[#1351b4] px-2 py-px text-xs font-bold text-white">
            {progresso.concluidos} de {progresso.total}
          </span>
        )}
      </button>

      {aberto && (
        <aside
          id="painel-guia"
          aria-label="Guia de primeiros passos"
          className="fixed right-0 top-16 bottom-0 z-40 flex w-full flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-[-8px_0_24px_rgba(17,24,39,.08)] sm:w-[400px]"
        >
          {vista === "roteiros" ? (
            <PainelRoteiros
              progresso={progresso}
              percentual={percentual}
              comecando={comecando}
              onFechar={() => setAberto(false)}
              onVer={setVista}
              onComecar={() => comecar(false)}
              onRecomecar={() => comecar(true)}
            />
          ) : (
            <PainelPassos
              roteiro={roteiro(vista)}
              comecando={comecando}
              onVoltar={() => setVista("roteiros")}
              onFechar={() => setAberto(false)}
              onIr={irParaTela}
              onComecar={() => comecar(false)}
            />
          )}
        </aside>
      )}

      <DestaqueGuia
        pedido={destaque}
        onFechar={fecharDestaque}
        onVerRoteiro={() => { setDestaque(null); setAberto(true) }}
        onSair={() => { setDestaque(null); setAberto(false) }}
      />

      <Dialog open={!!passagem} onOpenChange={(v) => { if (!v) setPassagem(null) }}>
        {passagem && (
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <span className="flex items-center gap-2 text-[13px] font-semibold text-green-700">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-white"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>
                Passo {passagem.numeroConcluido} concluído · {passagem.concluido.titulo}
              </span>
              <DialogTitle>A próxima providência é de outro usuário</DialogTitle>
              <DialogDescription className="text-slate-700">
                O passo seguinte cabe a outro usuário ({passagem.proximo.quem}). Para continuar o roteiro, saia e entre com um dos usuários abaixo: o guia retoma no passo {passagem.numero}, na tela certa.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-[#D6E2F5] bg-[#F5F8FD] px-4 py-3 text-sm">
              <dt className="text-slate-600">Próximo passo</dt>
              <dd className="font-semibold">{passagem.numero} · {passagem.proximo.titulo}</dd>
              <dt className="text-slate-600">Responsável</dt>
              <dd>{passagem.proximo.quem}</dd>
              {passagem.proximo.quem_pode.length > 0 && (
                <>
                  <dt className="text-slate-600">Usuários</dt>
                  <dd>{rotuloPessoas(passagem.proximo.quem_pode)}</dd>
                </>
              )}
            </dl>
            <p className="text-xs text-slate-600">O andamento do roteiro fica gravado no servidor. Quem entrar depois vê o passo em que ele parou.</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPassagem(null)}>Continuar depois</Button>
              <Button className="bg-[#1351b4] hover:bg-[#0c3d8a]" onClick={trocarDeUsuario}>Sair e entrar com outro usuário</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Painel: os dois roteiros
// ---------------------------------------------------------------------------

function CabecalhoPainel({ titulo, subtitulo, onFechar }: { titulo: string; subtitulo: string; onFechar: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
        <p className="text-[13px] text-slate-600">{subtitulo}</p>
      </div>
      <button type="button" aria-label="Fechar o guia" onClick={onFechar} className="h-9 w-9 shrink-0 rounded-md text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center">
        <X className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </div>
  )
}

function Barra({ percentual, fina }: { percentual: number; fina?: boolean }) {
  const h = fina ? "h-1.5" : "h-2"
  return (
    <div className={`${h} rounded-full bg-slate-200`} role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${h} rounded-full bg-[#1351b4]`} style={{ width: `${percentual}%` }} />
    </div>
  )
}

function PainelRoteiros({ progresso, percentual, comecando, onFechar, onVer, onComecar, onRecomecar }: {
  progresso: ProgressoGuia | null
  percentual: number
  comecando: boolean
  onFechar: () => void
  onVer: (c: ChaveRoteiro) => void
  onComecar: () => void
  onRecomecar: () => void
}) {
  const pessoas = quemFazCadaPasso(progresso)
  const dispensa = progresso?.roteiros.find((r) => r.chave === "DISPENSA")
  return (
    <>
      <CabecalhoPainel titulo="Guia de primeiros passos" subtitulo="Do desenho do fluxo à publicação de uma dispensa no PNCP, em dois roteiros." onFechar={onFechar} />
      {!progresso ? (
        <p className="text-sm text-slate-600">Carregando…</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px]"><span className="font-semibold">Progresso geral</span><span className="text-slate-600">{progresso.concluidos} de {progresso.total} passos</span></div>
            <Barra percentual={percentual} />
          </div>
          {progresso.roteiros.map((r) => (
            <CartaoRoteiro key={r.chave} roteiro={r} comecando={comecando} onVer={() => onVer(r.chave)} onComecar={onComecar} onIrParaFluxo={() => onVer("FLUXO")} />
          ))}
          <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-3">
            {pessoas.length > 0 && (
              <>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Quem faz cada passo</span>
                {pessoas.map((p) => (
                  <div key={p.quem} className="flex justify-between gap-3 text-[13px]"><span>{p.quem}</span><span className="text-right text-slate-600">{p.pessoas}</span></div>
                ))}
              </>
            )}
            {dispensa?.iniciado && (
              <button type="button" onClick={onRecomecar} disabled={comecando} className="self-start text-[13px] font-medium text-[#1351b4] underline">Recomeçar o roteiro da dispensa</button>
            )}
          </div>
        </>
      )}
    </>
  )
}

function CartaoRoteiro({ roteiro: r, comecando, onVer, onComecar, onIrParaFluxo }: {
  roteiro: RoteiroGuia
  comecando: boolean
  onVer: () => void
  onComecar: () => void
  onIrParaFluxo: () => void
}) {
  const situacao = situacaoDoRoteiro(r)
  const atual = passoAtual(r)
  const pct = r.total ? Math.round((r.concluidos / r.total) * 100) : 0
  const moldura = situacao === "CONCLUIDO" ? "border border-[#CDE3D2] bg-[#F3FAF5]" : situacao === "EM_ANDAMENTO" ? "border-2 border-[#1351b4]" : "border border-slate-200"
  return (
    <section className={`flex flex-col gap-2.5 rounded-[10px] px-4 py-3.5 ${moldura}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">{LETRA_ROTEIRO[r.chave]} · {r.titulo}</h3>
        {situacao === "CONCLUIDO" && <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><Check className="h-3.5 w-3.5" aria-hidden="true" />Concluído</span>}
        {situacao === "EM_ANDAMENTO" && <span className="text-xs font-bold text-[#1351b4]">Em andamento</span>}
        {situacao === "NAO_INICIADO" && <span className="text-xs font-semibold text-slate-500">Não iniciado</span>}
      </div>
      <p className="text-[13px] text-slate-700">{r.descricao}</p>
      {situacao !== "CONCLUIDO" && r.iniciado && !r.bloqueio && <Barra percentual={pct} fina />}
      <div className="flex flex-col gap-0.5 text-[13px]">
        <span className="text-slate-600">{r.concluidos} de {r.total} passos{r.referencia ? ` · ${r.referencia}` : ""}</span>
        {atual && <span><b>Passo atual:</b> {atual.titulo} · {atual.quem}</span>}
      </div>
      {r.bloqueio && r.chave === "DISPENSA" ? (
        <>
          <p className="text-[13px] text-amber-900 bg-amber-50 border border-amber-300 rounded-md px-3 py-2">{r.bloqueio}</p>
          <Button variant="outline" className="self-start" onClick={onIrParaFluxo}>Ir para o roteiro A</Button>
        </>
      ) : !r.iniciado ? (
        <Button className="self-start bg-[#1351b4] hover:bg-[#0c3d8a]" onClick={onComecar} disabled={comecando}>
          {comecando ? "Começando…" : "Começar"}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      ) : (
        <Button variant={situacao === "CONCLUIDO" ? "outline" : "default"} className={`self-start ${situacao === "CONCLUIDO" ? "" : "bg-[#1351b4] hover:bg-[#0c3d8a]"}`} onClick={onVer}>
          {situacao === "CONCLUIDO" ? "Ver passos" : "Continuar"}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </section>
  )
}

/** Uma linha por responsável, com quem pode fazer (para saber com quem entrar). */
function quemFazCadaPasso(p: ProgressoGuia | null): Array<{ quem: string; pessoas: string }> {
  const vistos = new Map<string, string>()
  for (const r of p?.roteiros ?? []) {
    for (const passo of r.passos) {
      if (!passo.quem_pode.length || vistos.has(passo.quem)) continue
      vistos.set(passo.quem, passo.quem_pode.map((x) => x.email ?? x.nome).join(", "))
    }
  }
  return [...vistos.entries()].map(([quem, pessoas]) => ({ quem, pessoas }))
}

// ---------------------------------------------------------------------------
// Painel: passos de um roteiro
// ---------------------------------------------------------------------------

function PainelPassos({ roteiro: r, comecando, onVoltar, onFechar, onIr, onComecar }: {
  roteiro: RoteiroGuia | null
  comecando: boolean
  onVoltar: () => void
  onFechar: () => void
  onIr: (r: RoteiroGuia, p: PassoGuia) => void
  onComecar: () => void
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1351b4]">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Roteiros
        </button>
        <button type="button" aria-label="Fechar o guia" onClick={onFechar} className="h-9 w-9 rounded-md text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center">
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
      {!r ? (
        <p className="text-sm text-slate-600">Carregando…</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-bold">{LETRA_ROTEIRO[r.chave]} · {r.titulo}</h2>
            <span className="text-[13px] text-slate-600">{r.concluidos} de {r.total} passos{r.referencia ? ` · ${r.referencia}` : ""}</span>
          </div>
          {r.bloqueio && <p className="text-[13px] text-amber-900 bg-amber-50 border border-amber-300 rounded-md px-3 py-2">{r.bloqueio}</p>}
          {!r.iniciado && !r.bloqueio && (
            <Button className="self-start bg-[#1351b4] hover:bg-[#0c3d8a]" onClick={onComecar} disabled={comecando}>
              {comecando ? "Começando…" : "Começar este roteiro"}
            </Button>
          )}
          <ol className="flex flex-col">
            {r.passos.map((p, i) => (
              <ItemPasso key={p.chave} roteiro={r} passo={p} numero={i + 1} onIr={() => onIr(r, p)} />
            ))}
          </ol>
          {r.chave === "DISPENSA" && (
            <p className="border-t border-slate-100 pt-2.5 text-xs text-slate-600">Os passos seguem as etapas do fluxo ativo. Se o fluxo do órgão tiver outras etapas, o roteiro muda junto.</p>
          )}
        </>
      )}
    </>
  )
}

function ItemPasso({ passo: p, numero, onIr }: { roteiro: RoteiroGuia; passo: PassoGuia; numero: number; onIr: () => void }) {
  if (p.situacao === "CONCLUIDO") {
    return (
      <li className="flex items-center gap-2.5 py-[7px]">
        <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-green-700 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
        <span className="flex-1 text-sm text-slate-600 line-through">{p.titulo}<span className="sr-only"> (concluído)</span></span>
        <span className="text-xs text-slate-500">{p.quem}</span>
      </li>
    )
  }
  if (p.situacao === "A_FAZER") {
    return (
      <li className="flex items-center gap-2.5 border-t border-slate-100 py-[7px]">
        <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-xs font-bold text-slate-600">{numero}</span>
        <span className="min-w-0 flex-1 text-sm">{p.titulo}</span>
        <span className="text-xs text-slate-600">{p.quem}</span>
      </li>
    )
  }
  return (
    <li className="my-1.5 flex flex-col gap-2.5 rounded-[10px] border-2 border-[#1351b4] bg-[#F5F8FD] p-3.5" aria-current="step">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: AZUL }}>{numero}</span>
        <span className="flex-1 text-[15px] font-bold">{p.titulo}</span>
      </div>
      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[13px]">
        <dt className="text-slate-500">O que fazer</dt><dd>{p.o_que_fazer}</dd>
        <dt className="text-slate-500">Quem faz</dt><dd>{p.quem}{p.quem_pode.length ? ` (${rotuloPessoas(p.quem_pode)})` : ""}</dd>
        {p.por_que && (<><dt className="text-slate-500">Por quê</dt><dd>{p.por_que}</dd></>)}
      </dl>
      {!p.pode_agir && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Este passo não é do seu usuário ({p.quem}).{p.quem_pode.length ? ` Entre com: ${rotuloPessoas(p.quem_pode)}.` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {p.tela && (
          <Button className="bg-[#1351b4] hover:bg-[#0c3d8a]" onClick={onIr}>
            Ir para a tela<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <span className="text-xs text-slate-600">{p.conclui_quando}</span>
      </div>
    </li>
  )
}
