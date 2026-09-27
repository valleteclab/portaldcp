"use client"

/**
 * "ESTÁ COM…" (F3b — plano §2 e §6) — topo da tela do processo na fase
 * interna. Mesmo que as peças sejam feitas à mão, o sistema sabe com quem o
 * processo está: setor (pessoa), desde quando, prazo em dias úteis e atraso.
 *
 *  - Recebi ............ PUT  /api/fase-interna/tramitacoes/:id/receber
 *  - Anexar feito fora . diálogo de anexar da peça pendente (AnexarPecaDialog)
 *  - Enviar para ▾ ..... POST /api/fase-interna/:id/tramitar — destinos e despacho
 *                        de GET …/tramitacao/sugestao-envio (F3a); sem ela (404),
 *                        lista de setores do órgão e despacho em branco
 *  - Devolver .......... PUT  /api/fase-interna/tramitacoes/:id/devolver (motivo)
 *
 * Quem pode agir é o servidor quem decide: o 403/400 volta com a razão e a
 * tela mostra (nunca engole). Toda ação recarrega o topo e avisa a tela
 * (`onAtualizado`), que recarrega as etapas e a linha do tempo.
 *
 * Homologação multiusuário (E7): "com quem está" é lido e mostrado na hora —
 * não espera a sugestão de envio (que aguarda a sincronização do processo);
 * o "Recebi" some assim que o servidor confirma (sem 2º clique) e os botões
 * ficam desabilitados enquanto a ação roda. Depois de publicar, a barra fica
 * com a posse final ("fase interna encerrada") em vez de sumir.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCheck, ChevronDown, CornerUpLeft, FileUp, History, Loader2, MapPin, Send, Sparkles } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { criarUltimaCarga, hojeBrasilia } from "@/lib/fase-interna/telas"
import {
  acoesDoTopo, despachoParaDestino, opcoesDeDestino, pecasParaAnexar, prazoParaDestino, rotuloDaFolha, rotuloDoDestino, situacaoDoPrazo, todosOsPassos,
  type ComQuemEsta, type EtapasFluxoResposta, type OpcaoDestino, type PecaParaAnexar, type SugestaoEnvio,
} from "@/lib/fase-interna/visao-fluxo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnexarPecaDialog } from "@/components/fase-interna/etapas/AnexarPecaDialog"
import { abrirDespachoPdf, mensagemDoErro } from "./despacho"

interface Setor {
  id: string
  nome: string
  codigo?: string | null
}

const ROTULO_STATUS: Record<ComQuemEsta["status"], string> = {
  PENDENTE: "Aguardando o recebimento",
  RECEBIDA: "Recebido",
  DEVOLVIDA: "Devolvido",
  CONCLUIDA: "Tramitação encerrada",
  SEM_TRAMITACAO: "",
}

async function carregarSetores(): Promise<Setor[]> {
  let orgaoId: string | undefined
  try {
    orgaoId = JSON.parse(localStorage.getItem("orgao") || "{}")?.id
  } catch {
    orgaoId = undefined
  }
  if (!orgaoId) return []
  const r = await authFetch(`${API_URL}/api/orgaos/${orgaoId}/setores`)
  if (!r.ok) return []
  const j = await r.json()
  return Array.isArray(j) ? j : j?.setores || []
}

export function ComQuemEstaBarra({
  licitacaoId,
  atualizacao,
  etapas,
  onAtualizado,
  onVerLinhaDoTempo,
  encerrada = null,
}: {
  licitacaoId: string
  atualizacao?: unknown
  etapas: EtapasFluxoResposta | null
  onAtualizado: () => void
  onVerLinhaDoTempo?: () => void
  /** Fase interna encerrada (processo publicado): só a posse final, sem ações. */
  encerrada?: { publicadoEm: string | null } | null
}) {
  const [cqe, setCqe] = useState<ComQuemEsta | null>(null)
  const [sugestao, setSugestao] = useState<SugestaoEnvio | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [enviarAberto, setEnviarAberto] = useState(false)
  const [devolverAberto, setDevolverAberto] = useState(false)
  const [receberData, setReceberData] = useState<string | null>(null)
  const [anexar, setAnexar] = useState<PecaParaAnexar | null>(null)
  const [ultima] = useState(criarUltimaCarga)
  const [ultimaSugestao] = useState(criarUltimaCarga)

  /** Com quem está — leitura rápida, aplicada assim que chega. */
  const carregarPosse = useCallback(async () => {
    const vale = ultima()
    // Estado só muda depois da resposta (nunca no mesmo tique do efeito)
    await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/tramitacao/com-quem-esta`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const msg = await mensagemDoErro(r, "Não foi possível saber com quem o processo está")
          if (vale()) setErroCarga(msg)
          return
        }
        const atual = (await r.json()) as ComQuemEsta
        if (!vale()) return
        setErroCarga(null)
        setCqe(atual)
      })
      .catch((e) => {
        if (vale()) setErroCarga(e instanceof Error ? e.message : String(e))
      })
  }, [licitacaoId, ultima])

  /** Sugestão de envio — espera a sincronização do processo; chega depois, sem segurar a barra. */
  const estaEncerrada = !!encerrada
  const carregarSugestao = useCallback(async () => {
    if (estaEncerrada) return
    const vale = ultimaSugestao()
    // F3a: se ainda não publicado (404) ou com erro, o envio cai no modo manual
    const s = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/tramitacao/sugestao-envio`, { cache: "no-store" }).catch(() => null)
    const sug: SugestaoEnvio | null = s?.ok ? await s.json().catch(() => null) : null
    if (vale()) setSugestao(sug && Array.isArray(sug.destinos) ? sug : null)
  }, [licitacaoId, ultimaSugestao, estaEncerrada])

  const carregar = useCallback(async () => {
    await Promise.all([carregarPosse(), carregarSugestao()])
  }, [carregarPosse, carregarSugestao])
  useEffect(() => { carregar() }, [carregar, atualizacao])

  const depoisDaAcao = (msg: string) => {
    toast.success(msg)
    setErroAcao(null)
    carregar()
    onAtualizado()
  }

  const receber = async (dataOcorrencia?: string) => {
    if (!cqe?.tramitacao_id || ocupado) return
    setOcupado("receber")
    setErroAcao(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/tramitacoes/${cqe.tramitacao_id}/receber`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataOcorrencia ? { data_ocorrencia: dataOcorrencia } : {}),
      })
      if (!r.ok) throw new Error(await mensagemDoErro(r, "Não foi possível confirmar o recebimento"))
      const t = await r.json().catch(() => null)
      setReceberData(null)
      // A barra muda já com a resposta do servidor (o "Recebi" some — sem 2º clique)
      ultima() // invalida leituras em voo, anteriores ao recebimento
      setCqe((c) =>
        c && c.tramitacao_id === cqe.tramitacao_id
          ? { ...c, status: "RECEBIDA", recebido_em: t?.data_recebimento ?? new Date().toISOString(), recebido_por: t?.recebido_por_nome ?? c.recebido_por }
          : c,
      )
      depoisDaAcao("Recebimento registrado.")
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(null)
    }
  }

  const verDespacho = async () => {
    if (!cqe?.folha?.url) return
    setErroAcao(await abrirDespachoPdf(cqe.folha.url))
  }

  const acoes = acoesDoTopo(cqe)
  const pecas = useMemo(() => pecasParaAnexar(etapas), [etapas])
  const principal = sugestao?.destinos.find((d) => d.principal) ?? null

  if (encerrada && (!cqe || cqe.status === "SEM_TRAMITACAO") && !erroCarga) return null
  if (!cqe && !erroCarga) {
    return (
      <section aria-label="Com quem está o processo" className="rounded-lg border bg-white p-3 text-sm text-gray-600 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Verificando com quem está o processo…
      </section>
    )
  }

  const prazo = cqe && !encerrada ? situacaoDoPrazo(cqe) : null
  const sem = !cqe || cqe.status === "SEM_TRAMITACAO"
  const folha = rotuloDaFolha(cqe?.folha)
  const de = cqe?.de ? [cqe.de.setor_nome, cqe.de.usuario_nome].filter(Boolean).join(" · ") : ""

  // Depois de publicar: a posse final, com o despacho e a linha do tempo (nada mais se move)
  if (encerrada && cqe && !sem) {
    return (
      <section aria-label="Com quem está o processo" className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-gray-900">
                <b>Com: {rotuloDoDestino(cqe)}</b>
                {encerrada.publicadoEm ? <span> — publicado em {fmtBrasilia(encerrada.publicadoEm, false)}</span> : <span> — processo publicado</span>}
              </p>
              <p className="text-xs text-gray-700">
                Fase interna encerrada: a tramitação da fase interna terminou aqui
                {cqe.desde && ` (desde ${fmtBrasilia(cqe.desde, false)}`}
                {cqe.desde && (de ? `, enviado por ${de})` : ")")}.
                {cqe.folha?.url && (
                  <>
                    {" "}
                    <button type="button" className="text-blue-800 hover:underline" onClick={verDespacho}>
                      Ver o último despacho{folha ? ` (${folha})` : ""}
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
          {onVerLinhaDoTempo && (
            <Button size="sm" variant="ghost" className="text-blue-800" onClick={onVerLinhaDoTempo}>
              <History className="w-4 h-4 mr-1" aria-hidden="true" /> Linha do tempo
            </Button>
          )}
        </div>
        {erroAcao && <p role="alert" className="mt-2 text-sm text-red-800">{erroAcao}</p>}
      </section>
    )
  }

  return (
    <section
      aria-label="Com quem está o processo"
      className={`rounded-lg border p-3 sm:p-4 space-y-2 ${prazo?.atrasado ? "border-red-300 bg-red-50/60" : "border-blue-200 bg-blue-50/50"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin className={`mt-0.5 h-5 w-5 shrink-0 ${prazo?.atrasado ? "text-red-700" : "text-blue-800"}`} aria-hidden="true" />
          <div className="min-w-0">
            {sem ? (
              <p className="text-sm text-gray-800">Ainda sem registro de com quem está.</p>
            ) : (
              <p className="text-sm text-gray-900">
                <b>Está com: {rotuloDoDestino(cqe!)}</b>
                {cqe!.desde && <span> · desde {fmtBrasilia(cqe!.desde, false)}</span>}
                {cqe!.prazo && (
                  <span>
                    {" "}· prazo {fmtBrasilia(cqe!.prazo, false)}
                    {prazo && (
                      <span className={prazo.atrasado ? "font-semibold text-red-800" : "text-gray-700"}> ({prazo.texto})</span>
                    )}
                  </span>
                )}
                {!cqe!.prazo && <span className="text-gray-600"> · sem prazo</span>}
              </p>
            )}
            {!sem && (
              <p className="text-xs text-gray-700">
                {ROTULO_STATUS[cqe!.status]}
                {cqe!.status === "RECEBIDA" && cqe!.recebido_em && ` em ${fmtBrasilia(cqe!.recebido_em)}${cqe!.recebido_por ? ` por ${cqe!.recebido_por}` : ""}`}
                {de && ` · enviado por ${de}`}
                {cqe!.automatico && " · registrado automaticamente"}
                {cqe!.lancado_posteriormente && " · lançado depois"}
                {cqe!.folha?.url && (
                  <>
                    {" · "}
                    <button type="button" className="text-blue-800 hover:underline" onClick={verDespacho}>
                      Ver despacho{folha ? ` (${folha})` : ""}
                    </button>
                  </>
                )}
              </p>
            )}
            {sem && <p className="text-xs text-gray-700">Registre o envio para o setor que está com o processo — vale também para o processo em papel.</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {acoes.receber && (
            <Button size="sm" onClick={() => receber()} disabled={ocupado !== null} aria-busy={ocupado === "receber"}>
              {ocupado === "receber" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" /> : <CheckCheck className="w-4 h-4 mr-1" aria-hidden="true" />}
              Recebi
            </Button>
          )}
          {!sem && (
            <PecasParaAnexarMenu pecas={pecas} onEscolher={setAnexar} carregando={!etapas} />
          )}
          {acoes.enviar && (
            <Button size="sm" variant={acoes.receber ? "outline" : "default"} onClick={() => setEnviarAberto(true)} disabled={ocupado !== null}>
              <Send className="w-4 h-4 mr-1" aria-hidden="true" />
              <span className="inline-block max-w-[14rem] truncate align-bottom">{principal ? (principal.depois_de?.length ? `Enviar (próximo: ${principal.rotulo})` : `Enviar para: ${principal.rotulo}`) : "Enviar para"}</span>
              <ChevronDown className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
            </Button>
          )}
          {acoes.devolver && (
            <Button size="sm" variant="outline" className="text-red-800 border-red-200 hover:bg-red-50" onClick={() => setDevolverAberto(true)} disabled={ocupado !== null}>
              <CornerUpLeft className="w-4 h-4 mr-1" aria-hidden="true" /> Devolver
            </Button>
          )}
          {onVerLinhaDoTempo && (
            <Button size="sm" variant="ghost" className="text-blue-800" onClick={onVerLinhaDoTempo}>
              <History className="w-4 h-4 mr-1" aria-hidden="true" /> Linha do tempo
            </Button>
          )}
        </div>
      </div>

      {acoes.receber && (
        <div className="text-xs text-gray-700">
          {receberData === null ? (
            <button type="button" className="text-blue-800 hover:underline" onClick={() => setReceberData(hojeBrasilia())}>
              Recebeu antes (processo em papel)? Informar a data do recebimento
            </button>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                receber(receberData)
              }}
            >
              <div>
                <Label htmlFor="receber-data" className="text-xs">Recebido em</Label>
                <Input id="receber-data" type="date" className="h-8 w-40" max={hojeBrasilia()} value={receberData} onChange={(e) => setReceberData(e.target.value)} required />
              </div>
              <Button type="submit" size="sm" disabled={ocupado !== null}>Registrar o recebimento</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setReceberData(null)}>Cancelar</Button>
            </form>
          )}
        </div>
      )}

      {(erroCarga || erroAcao) && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{erroAcao || erroCarga}</span>
        </p>
      )}

      {enviarAberto && (
        <EnviarProcessoDialog
          licitacaoId={licitacaoId}
          sugestao={sugestao}
          etapas={etapas}
          onFechar={() => setEnviarAberto(false)}
          onEnviado={(destino) => {
            setEnviarAberto(false)
            depoisDaAcao(`Processo enviado para ${destino}.`)
          }}
        />
      )}
      <DevolverDialog
        tramitacaoId={devolverAberto ? cqe?.tramitacao_id ?? null : null}
        origem={de}
        onFechar={() => setDevolverAberto(false)}
        onDevolvido={() => {
          setDevolverAberto(false)
          depoisDaAcao("Processo devolvido.")
        }}
      />
      <AnexarPecaDialog
        licitacaoId={licitacaoId}
        peca={anexar ? { tipo: anexar.tipo, titulo: anexar.titulo, jaTem: anexar.jaTem } : null}
        onFechar={() => setAnexar(null)}
        onAnexado={() => {
          setAnexar(null)
          carregar()
          onAtualizado()
        }}
      />
    </section>
  )
}

/** "Anexar feito fora": uma peça pendente abre direto; várias, um menu. */
function PecasParaAnexarMenu({ pecas, onEscolher, carregando }: { pecas: PecaParaAnexar[]; onEscolher: (p: PecaParaAnexar) => void; carregando: boolean }) {
  if (!pecas.length) {
    return (
      <Button size="sm" variant="outline" disabled title={carregando ? "Carregando as etapas…" : "Nenhuma peça pendente nas etapas que podem andar agora"}>
        <FileUp className="w-4 h-4 mr-1" aria-hidden="true" /> Anexar feito fora
      </Button>
    )
  }
  if (pecas.length === 1) {
    return (
      <Button size="sm" variant="outline" onClick={() => onEscolher(pecas[0])}>
        <FileUp className="w-4 h-4 mr-1" aria-hidden="true" />
        <span className="inline-block max-w-[14rem] truncate align-bottom">Anexar feito fora: {pecas[0].titulo}</span>
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <FileUp className="w-4 h-4 mr-1" aria-hidden="true" /> Anexar feito fora <ChevronDown className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="text-xs">Peça feita fora do sistema (PDF)</DropdownMenuLabel>
        {pecas.map((p) => (
          <DropdownMenuItem key={p.tipo} onSelect={() => onEscolher(p)}>
            <span className="truncate">{p.titulo}</span>
            <span className="ml-2 text-xs text-gray-500 truncate">{p.etapa}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * ENVIAR PARA — destino (sugestão com o principal marcado, ou lista de
 * setores), despacho sugerido e editável (vira folha nos autos), prazo em
 * dias úteis e "aconteceu em" (só para movimentação física já ocorrida).
 */
function EnviarProcessoDialog({
  licitacaoId,
  sugestao,
  etapas,
  onFechar,
  onEnviado,
}: {
  licitacaoId: string
  sugestao: SugestaoEnvio | null
  etapas: EtapasFluxoResposta | null
  onFechar: () => void
  onEnviado: (destino: string) => void
}) {
  // Montado só enquanto aberto: cada abertura começa do zero (destino principal pré-selecionado)
  const [setores, setSetores] = useState<Setor[] | null>(null)
  /** Destino escolhido pelo usuário; null = o principal da sugestão. */
  const [chave, setChave] = useState<string | null>(null)
  /** Texto editado; null = o despacho sugerido para o destino. */
  const [despachoEditado, setDespachoEditado] = useState<string | null>(null)
  /** O usuário escreveu o despacho: trocar o destino não sobrescreve o texto dele (homologação). */
  const [despachoDoUsuario, setDespachoDoUsuario] = useState(false)
  const [prazoEditado, setPrazoEditado] = useState<string | null>(null)
  const [aconteceuEm, setAconteceuEm] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  /** F4a: despacho ajustado pela IA (texto sugerido, revisado por quem envia). */
  const [ajustandoIa, setAjustandoIa] = useState(false)
  const [ajustadoIa, setAjustadoIa] = useState(false)

  const { opcoes, inicial, manual } = useMemo(() => opcoesDeDestino(sugestao, setores ?? []), [sugestao, setores])
  const passos = useMemo(() => todosOsPassos(etapas), [etapas])
  const escolhida = opcoes.find((o) => o.chave === (chave ?? inicial)) ?? null
  const despachoSugerido = despachoParaDestino(escolhida, sugestao)
  const despacho = despachoEditado ?? despachoSugerido
  const prazoSugerido = prazoParaDestino(escolhida, passos)
  const prazo = prazoEditado ?? (prazoSugerido ? String(prazoSugerido) : "")

  const aplicarDestino = (o: OpcaoDestino | null) => {
    setChave(o?.chave ?? null)
    // O despacho sugerido acompanha o destino — mas o texto que o usuário escreveu fica
    // (a troca de setor não mistura nem apaga; "Usar o texto sugerido" troca se ele quiser)
    if (!despachoDoUsuario) setDespachoEditado(null)
    setPrazoEditado(null)
    setAjustadoIa(false)
  }

  /** "Ajustar com IA": a IA reescreve o despacho deixando clara a finalidade; quem envia revisa. */
  const ajustarComIa = async () => {
    if (!escolhida) return setErro("Escolha para onde o processo vai.")
    setAjustandoIa(true)
    setErro(null)
    try {
      const base = `${API_URL}/api/fase-interna/${licitacaoId}/rascunho-ia`
      const g = await authFetch(`${base}/gerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peca: "TRAMITACAO", destino: escolhida.rotulo, finalidade: (escolhida.principal && sugestao?.finalidade) || "", despacho }),
      })
      if (!g.ok) throw new Error(await mensagemDoErro(g, "A IA não está disponível agora"))
      const tela = await g.json()
      if (tela?.rascunho?.status !== "GERADO") throw new Error(tela?.rascunho?.erro ? `A IA não conseguiu ajustar o despacho (${tela.rascunho.erro}).` : "A IA não conseguiu ajustar o despacho.")
      const a = await authFetch(`${base}/${tela.rascunho.id}/aceitar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      if (!a.ok) throw new Error(await mensagemDoErro(a, "Não foi possível usar o texto da IA"))
      const texto = (await a.json())?.aceite?.campos?.texto
      if (texto) {
        setDespachoEditado(String(texto))
        setDespachoDoUsuario(true)
        setAjustadoIa(true)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setAjustandoIa(false)
    }
  }

  useEffect(() => {
    let cancelado = false
    carregarSetores()
      .then((s) => { if (!cancelado) setSetores(s) })
      .catch(() => { if (!cancelado) setSetores([]) })
    return () => { cancelado = true }
  }, [])

  const fechar = () => onFechar()

  const bloqueado = !!sugestao && sugestao.pode_enviar === false
  const sugeridos = opcoes.filter((o) => o.origem === "SUGESTAO")
  const outros = opcoes.filter((o) => o.origem === "SETOR")

  const enviar = async () => {
    if (!escolhida) return setErro("Escolha para onde o processo vai.")
    if (!despacho.trim()) return setErro("Escreva o despacho — ele entra nos autos como folha.")
    if (prazo && (!/^\d+$/.test(prazo) || Number(prazo) > 365)) return setErro("Prazo: um número inteiro de dias úteis (0 a 365).")
    if (aconteceuEm && aconteceuEm > hojeBrasilia()) return setErro("\"Aconteceu em\" não pode ser uma data futura.")
    setEnviando(true)
    setErro(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/tramitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          para_setor_id: escolhida.setor_id ?? undefined,
          para_usuario_id: escolhida.usuario_id ?? undefined,
          despacho: despacho.trim(),
          ...(escolhida.principal && sugestao?.finalidade ? { finalidade: sugestao.finalidade } : {}),
          ...(prazo ? { prazo_dias_uteis: Number(prazo) } : {}),
          ...(aconteceuEm ? { data_ocorrencia: aconteceuEm } : {}),
        }),
      })
      if (!r.ok) throw new Error(await mensagemDoErro(r, "Não foi possível enviar o processo"))
      const destino = escolhida.rotulo
      fechar()
      onEnviado(destino)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setEnviando(false)
    }
    // sucesso: o diálogo fecha; "enviando" continua true até lá (sem clique duplo)
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar o processo</DialogTitle>
          <DialogDescription>
            O despacho entra nos autos como folha e quem recebe é avisado (sistema, e-mail e WhatsApp).
          </DialogDescription>
        </DialogHeader>
        {setores === null ? (
          <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando os destinos…</p>
        ) : (
          <div className="space-y-4">
            {bloqueado && (
              <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-sm text-amber-950">
                {sugestao?.motivo_bloqueio || "O envio não está liberado agora."}
              </p>
            )}
            <ExplicacaoDaSugestao sugestao={sugestao} />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Para onde vai</legend>
              {sugeridos.length > 0 && (
                <div className="space-y-1.5" role="radiogroup" aria-label="Destinos sugeridos pelo fluxo">
                  {sugeridos.map((o) => (
                    <label key={o.chave} className={`flex cursor-pointer items-start gap-2 rounded border px-2.5 py-2 text-sm ${escolhida?.chave === o.chave ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}>
                      <input type="radio" name="destino" className="mt-1" checked={escolhida?.chave === o.chave} onChange={() => aplicarDestino(o)} />
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900">{o.rotulo}</span>
                        {o.principal && <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-900">sugerido pelo fluxo</span>}
                        {o.etapas.length > 0 && <span className="block text-xs text-gray-600">Faz: {o.etapas.map(([, n]) => n).join(", ")}</span>}
                        {!!o.depois_de?.length && (
                          <span className="block text-xs text-amber-900">Depois de concluir: {o.depois_de.map(([, n]) => n).join(", ")}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div>
                <Label className="text-xs text-gray-700">{sugeridos.length ? "Outro setor" : "Setor de destino"}</Label>
                <Select value={escolhida?.origem === "SETOR" ? escolhida.chave : ""} onValueChange={(v) => aplicarDestino(opcoes.find((o) => o.chave === v) ?? null)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o setor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {outros.map((o) => (
                      <SelectItem key={o.chave} value={o.chave}>{o.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {manual && outros.length === 0 && <p className="mt-1 text-xs text-gray-600">Nenhum setor cadastrado. Cadastre em Configurações → Setores.</p>}
              </div>
            </fieldset>
            <div>
              <Label htmlFor="enviar-despacho">Despacho *</Label>
              <Textarea
                id="enviar-despacho"
                className="mt-1"
                rows={4}
                value={despacho}
                placeholder="Ex.: Encaminhe-se à Contabilidade para a reserva orçamentária."
                onChange={(e) => {
                  setDespachoEditado(e.target.value)
                  setDespachoDoUsuario(true)
                }}
              />
              {despachoDoUsuario && !!despachoSugerido && despachoSugerido.trim() !== despacho.trim() && (
                <button
                  type="button"
                  className="mt-1 text-xs text-blue-800 hover:underline text-left"
                  onClick={() => {
                    setDespachoEditado(null)
                    setDespachoDoUsuario(false)
                    setAjustadoIa(false)
                  }}
                  title={despachoSugerido}
                >
                  Usar o texto sugerido para {escolhida?.rotulo ?? "o destino"}
                </button>
              )}
              <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-gray-600">
                  {ajustadoIa ? "Texto ajustado pela IA — revise antes de enviar." : despachoDoUsuario ? "Texto seu — trocar o destino não o altera." : !manual ? "Sugerido pelo fluxo; pode editar." : ""}
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-blue-800 hover:underline disabled:opacity-50"
                  onClick={ajustarComIa}
                  disabled={ajustandoIa || !escolhida || bloqueado}
                  title="A IA ajusta o texto para deixar clara a finalidade do envio; você revisa antes de enviar"
                >
                  {ajustandoIa ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3 h-3" aria-hidden="true" />} Ajustar com IA
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <Label htmlFor="enviar-prazo">Prazo (dias úteis)</Label>
                <Input id="enviar-prazo" type="number" min={0} max={365} className="mt-1 w-32" value={prazo} onChange={(e) => setPrazoEditado(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="enviar-aconteceu">Aconteceu em (opcional)</Label>
                <Input id="enviar-aconteceu" type="date" className="mt-1 w-44" max={hojeBrasilia()} value={aconteceuEm} onChange={(e) => setAconteceuEm(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-gray-600">
              &quot;Aconteceu em&quot; só para registrar um envio físico que <b>já ocorreu</b> (não aceita data futura). Fica registrado que o lançamento foi feito depois, por você.
            </p>
            {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando || setores === null || bloqueado}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** DEVOLVER — volta a quem enviou; motivo obrigatório (vira despacho de devolução nos autos). */
function DevolverDialog({ tramitacaoId, origem, onFechar, onDevolvido }: { tramitacaoId: string | null; origem: string; onFechar: () => void; onDevolvido: () => void }) {
  const [motivo, setMotivo] = useState("")
  const [aconteceuEm, setAconteceuEm] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const fechar = () => {
    setMotivo("")
    setAconteceuEm("")
    setErro(null)
    onFechar()
  }

  const devolver = async () => {
    if (!tramitacaoId) return
    if (!motivo.trim()) return setErro("Informe o motivo da devolução.")
    if (aconteceuEm && aconteceuEm > hojeBrasilia()) return setErro("\"Aconteceu em\" não pode ser uma data futura.")
    setEnviando(true)
    setErro(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/tramitacoes/${tramitacaoId}/devolver`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim(), ...(aconteceuEm ? { data_ocorrencia: aconteceuEm } : {}) }),
      })
      if (!r.ok) throw new Error(await mensagemDoErro(r, "Não foi possível devolver o processo"))
      setMotivo("")
      setAconteceuEm("")
      onDevolvido()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={!!tramitacaoId} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver o processo</DialogTitle>
          <DialogDescription>
            O processo volta {origem ? `para ${origem}` : "a quem enviou"}. O motivo entra nos autos como despacho de devolução.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="devolver-motivo">Motivo *</Label>
            <Textarea id="devolver-motivo" className="mt-1" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="devolver-aconteceu">Aconteceu em (opcional)</Label>
            <Input id="devolver-aconteceu" type="date" className="mt-1 w-44" max={hojeBrasilia()} value={aconteceuEm} onChange={(e) => setAconteceuEm(e.target.value)} />
            <p className="mt-1 text-xs text-gray-600">Só para uma devolução física que já ocorreu.</p>
          </div>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Cancelar</Button>
          <Button variant="destructive" onClick={devolver} disabled={enviando || !motivo.trim()}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" />}
            Devolver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Por que o fluxo sugeriu (ou não) um destino: etapas que ainda estão com quem
 * tem o processo e etapas sem setor definido no modelo (homologação: "o fluxo
 * não sugeriu o destino" sem explicar nada).
 */
function ExplicacaoDaSugestao({ sugestao }: { sugestao: SugestaoEnvio | null }) {
  if (!sugestao) return null
  const pendentes = sugestao.pendentes_do_detentor ?? []
  const semDestino = sugestao.etapas_sem_destino ?? []
  const temPrincipal = sugestao.destinos.some((d) => d.principal)
  if (!pendentes.length && !semDestino.length) return null
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800 space-y-1" role="note">
      {pendentes.length > 0 && (
        <p>
          Ainda com quem está com o processo: <b>{pendentes.map(([, n]) => n).join(", ")}</b>.
          {temPrincipal ? " O destino sugerido vale depois de concluí-las." : " Conclua antes de enviar — ou envie a outro setor, se for o caso."}
        </p>
      )}
      {semDestino.length > 0 && (
        <p>
          Sem setor definido no modelo de fluxo para: <b>{semDestino.map(([, n]) => n).join(", ")}</b>. Escolha o setor abaixo (o administrador pode definir o responsável em Configurações › Fluxo).
        </p>
      )}
    </div>
  )
}
