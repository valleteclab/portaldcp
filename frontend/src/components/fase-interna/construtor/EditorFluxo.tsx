"use client"

/**
 * CONSTRUTOR DE FLUXO — editor de arrastar e soltar de um tipo de processo
 * (docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md; protótipo aprovado
 * referencia-construtor.html). Sobre a API /api/fluxo-fase-interna/construtor:
 *  - o que se edita é o RASCUNHO (salva sozinho); "Ativar" confere pela lei e
 *    publica a nova versão — processos novos seguem ela, os em andamento
 *    continuam no fluxo em que começaram;
 *  - conferência ao vivo (estrutura + lei, com o artigo);
 *  - "Começar de" (modelos prontos, modelo padrão), "Montar com IA",
 *    histórico de versões e "Testar" (mesma regra do processo real).
 * Só o administrador do órgão (ou o login do órgão) edita e ativa; os demais
 * veem e testam.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, History, Loader2, Save, Sparkles, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { API_URL, authFetch } from "@/lib/api"
import {
  alterarAresta,
  alterarNo,
  apagarSelecao,
  criarNo,
  dataHoraBrasilia,
  descreverCondicao,
  focoEmCampoDeTexto,
  grafoEmBranco,
  lerValorEmReais,
  ligarNos,
  moverNo,
  noDoErro,
  nosComErro,
  rotuloDoResponsavel,
  sugerirPosicao,
  type Conferencia,
  type ErroConferencia,
  type NoFluxo,
  type Selecao,
  type TipoNo,
} from "@/lib/fluxo/grafo-editor"
import {
  assinatura,
  assinaturaDaConferencia,
  corpoDoRascunho,
  erroDoCorpo,
  exigidasPelaLei,
  mensagemAtivado,
  modeloEmEdicao,
  rotuloDaOrigem,
  situacaoDaEdicao,
  type ModeloEmEdicao,
  type TelaConstrutor,
  type TipoProcesso,
  type VersaoFluxo,
} from "@/lib/fluxo/tela-construtor"
import { MIME_PALETA, PalcoFluxo } from "./PalcoFluxo"
import { PainelCaixa } from "./PainelCaixa"
import { PainelConferencia } from "./PainelConferencia"
import { PainelTeste, type AcaoDoTeste, type EstadoDoTeste } from "./PainelTeste"

const BASE = `${API_URL}/api/fluxo-fase-interna/construtor`
const ESPERA_SALVAR = 1500
const ESPERA_CONFERIR = 600

const BLOCOS: Array<{ tipo: TipoNo; titulo: string; ajuda: string; forma: string }> = [
  { tipo: "etapa", titulo: "Etapa", ajuda: "um setor faz peças", forma: "rounded-lg" },
  { tipo: "aprovacao", titulo: "Aprovação", ajuda: "aprova ou devolve", forma: "rounded-lg" },
  { tipo: "condicao", titulo: "Condição", ajuda: "sim ou não", forma: "rounded-lg border-dashed" },
  { tipo: "fim", titulo: "Fim", ajuda: "onde termina", forma: "rounded-full" },
]

async function jsonOuErro(r: Response) {
  const j = await r.json().catch(() => null)
  if (!r.ok) {
    const e = erroDoCorpo(j, r.status)
    throw Object.assign(new Error(e.texto), { status: r.status, detalhe: e })
  }
  return j
}

type ErroApi = Error & { status?: number; detalhe?: ReturnType<typeof erroDoCorpo> }

export function EditorFluxo({ tipo, admin }: { tipo: TipoProcesso; admin: boolean }) {
  const [tela, setTela] = useState<TelaConstrutor | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [modelo, setModelo] = useState<ModeloEmEdicao | null>(null)
  const [salvoAss, setSalvoAss] = useState("")
  const [temRascunho, setTemRascunho] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState<Date | string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [semPermissao, setSemPermissao] = useState(!admin)
  const [conferencia, setConferencia] = useState<Conferencia | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [ajustes, setAjustes] = useState<Array<{ no: string | null; mensagem: string }>>([])
  const [sel, setSel] = useState<Selecao>(null)
  const [modo, setModo] = useState<"desenhar" | "testar">("desenhar")
  const [teste, setTeste] = useState<EstadoDoTeste | null>(null)
  const [testando, setTestando] = useState(false)
  const [valorTeste, setValorTeste] = useState("60.000,00")
  const [tipoTeste, setTipoTeste] = useState("")
  const [ativado, setAtivado] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [dialogoAtivar, setDialogoAtivar] = useState<{ conferencia: Conferencia; erro: string | null } | null>(null)
  const [versoes, setVersoes] = useState<VersaoFluxo[] | null>(null)
  const [descricaoIa, setDescricaoIa] = useState("")
  const [gerandoIa, setGerandoIa] = useState(false)
  const [statusIa, setStatusIa] = useState<string | null>(null)
  const { confirmar, dialogo } = useDialogoConfirmacao()
  const palcoRef = useRef<HTMLDivElement>(null)
  const ultimoConferido = useRef("")
  const atual = useRef<{ modelo: ModeloEmEdicao | null; salvoAss: string; editavel: boolean }>({ modelo: null, salvoAss: "", editavel: false })

  const editavel = !semPermissao
  const alterado = !!modelo && assinatura(modelo) !== salvoAss

  // ---------------------------------------------------------------- carga
  const aplicarTela = useCallback(
    (t: TelaConstrutor) => {
      // Quem só vê (não é administrador) vê a versão ATIVA — a que os processos seguem
      const somenteAtivo = !admin && !!t.rascunho
      const m = modeloEmEdicao(somenteAtivo ? { ativo: t.ativo, rascunho: null } : t)
      setTela(t)
      setModelo(m)
      setSalvoAss(assinatura(m))
      setTemRascunho(!!t.rascunho)
      setSalvoEm(t.rascunho?.atualizado_em ?? null)
      setErroSalvar(null)
      setConferencia(t.conferencia)
      // A conferência da tela é a do rascunho: para a versão ativa, confere de novo
      ultimoConferido.current = somenteAtivo ? "" : assinaturaDaConferencia(m)
      setSel(null)
    },
    [admin],
  )

  useEffect(() => {
    let vivo = true
    authFetch(`${BASE}/${tipo}`)
      .then(jsonOuErro)
      .then((t: TelaConstrutor) => {
        if (vivo) aplicarTela(t)
      })
      .catch((e: ErroApi) => {
        if (vivo) setErroCarga(e.message)
      })
    return () => {
      vivo = false
    }
  }, [tipo, aplicarTela])

  useEffect(() => {
    atual.current = { modelo, salvoAss, editavel }
  })

  // ---------------------------------------------------------------- salvar (rascunho, sozinho)
  const salvar = useCallback(async (m: ModeloEmEdicao): Promise<boolean> => {
    setSalvando(true)
    setErroSalvar(null)
    try {
      const r = await authFetch(`${BASE}/${tipo}/rascunho`, { method: "PUT", body: JSON.stringify(corpoDoRascunho(m)) })
      const t: TelaConstrutor = await jsonOuErro(r)
      setTela(t)
      setSalvoAss(assinatura(m))
      setTemRascunho(true)
      setSalvoEm(new Date())
      setAjustes(t.ajustes ?? [])
      if (atual.current.modelo && assinaturaDaConferencia(atual.current.modelo) === assinaturaDaConferencia(m)) {
        setConferencia(t.conferencia)
        ultimoConferido.current = assinaturaDaConferencia(m)
      }
      return true
    } catch (e) {
      const err = e as ErroApi
      if (err.status === 403) setSemPermissao(true)
      setErroSalvar(err.message)
      return false
    } finally {
      setSalvando(false)
    }
  }, [tipo])

  useEffect(() => {
    if (!modelo || !editavel || salvando || erroSalvar || assinatura(modelo) === salvoAss) return
    const t = setTimeout(() => salvar(modelo), ESPERA_SALVAR)
    return () => clearTimeout(t)
  }, [modelo, salvoAss, editavel, salvando, erroSalvar, salvar])

  /** Salva já (antes de ativar, de trocar de aba, do botão). */
  const salvarAgora = useCallback(async (): Promise<boolean> => {
    const { modelo: m, salvoAss: s, editavel: e } = atual.current
    if (!m || !e || assinatura(m) === s) return true
    return salvar(m)
  }, [salvar])

  // Ao sair (trocar de aba, fechar a tela): grava o que faltou
  useEffect(
    () => () => {
      const { modelo: m, salvoAss: s, editavel: e } = atual.current
      if (m && e && assinatura(m) !== s) {
        authFetch(`${BASE}/${tipo}/rascunho`, { method: "PUT", body: JSON.stringify(corpoDoRascunho(m)), keepalive: true }).catch(() => undefined)
      }
    },
    [tipo],
  )
  useEffect(() => {
    if (!alterado && !salvando) return
    const aviso = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener("beforeunload", aviso)
    return () => window.removeEventListener("beforeunload", aviso)
  }, [alterado, salvando])

  // ---------------------------------------------------------------- conferência ao vivo
  const chaveConferencia = modelo ? assinaturaDaConferencia(modelo) : ""
  useEffect(() => {
    if (!modelo || !chaveConferencia || chaveConferencia === ultimoConferido.current) return
    const t = setTimeout(async () => {
      setConferindo(true)
      try {
        const r = await authFetch(`${BASE}/${tipo}/conferir`, { method: "POST", body: JSON.stringify(corpoDoRascunho(modelo)) })
        const c: Conferencia = await jsonOuErro(r)
        ultimoConferido.current = chaveConferencia
        setConferencia(c)
      } catch {
        /* a conferência do último salvamento continua na tela */
      } finally {
        setConferindo(false)
      }
    }, ESPERA_CONFERIR)
    return () => clearTimeout(t)
  }, [chaveConferencia, modelo, tipo])

  // ---------------------------------------------------------------- edição
  const mudarGrafo = useCallback((f: (g: ModeloEmEdicao["grafo"]) => ModeloEmEdicao["grafo"]) => {
    setModelo((m) => (m ? { ...m, grafo: f(m.grafo) } : m))
    setErroSalvar(null)
    setAtivado(null)
  }, [])

  const apagar = useCallback(() => {
    if (!sel) return
    mudarGrafo((g) => apagarSelecao(g, sel))
    setSel(null)
  }, [sel, mudarGrafo])

  const ligar = useCallback(
    (de: string, para: string) => {
      if (!modelo) return
      const r = ligarNos(modelo.grafo, de, para)
      if ("erro" in r) {
        toast.error(r.erro)
        return
      }
      mudarGrafo(() => r.grafo)
      setSel({ aresta: r.id })
    },
    [modelo, mudarGrafo],
  )

  const criar = useCallback(
    (tipoNo: TipoNo, x?: number, y?: number) => {
      if (!modelo) return
      let pos = x !== undefined && y !== undefined ? { x, y } : null
      if (!pos) {
        const el = palcoRef.current
        pos = sugerirPosicao(modelo.grafo.nos, { x: el?.scrollLeft ?? 0, y: el?.scrollTop ?? 0, largura: el?.clientWidth ?? 800, altura: el?.clientHeight ?? 500 })
      }
      const r = criarNo(modelo.grafo, tipoNo, pos.x, pos.y)
      mudarGrafo(() => r.grafo)
      setSel({ no: r.id })
    },
    [modelo, mudarGrafo],
  )

  // Tecla Delete (fora de campo de texto) apaga o que está selecionado
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.key !== "Delete" && ev.key !== "Backspace") || modo !== "desenhar" || !editavel || !sel) return
      if (focoEmCampoDeTexto(document.activeElement as HTMLElement | null)) return
      ev.preventDefault()
      apagar()
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [modo, editavel, sel, apagar])

  // ---------------------------------------------------------------- ações da barra
  const substituirPor = async (url: string, metodo: string, texto: string) => {
    setOcupado(true)
    try {
      await salvarAgora()
      const t: TelaConstrutor = await jsonOuErro(await authFetch(url, { method: metodo }))
      aplicarTela(t)
      setAjustes(t.ajustes ?? [])
      setAtivado(null)
      toast.success(texto)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const comecarDe = async (valor: string) => {
    if (!tela || !valor) return
    if (valor === "ativa") {
      const ok = await confirmar({
        titulo: "Descartar o rascunho?",
        mensagem: `O desenho volta a ser o da versão ativa (${tela.ativo.versao}). O que estava no rascunho se perde.`,
        confirmarRotulo: "Descartar o rascunho",
        destrutivo: true,
      })
      if (ok) await substituirPor(`${BASE}/${tipo}/rascunho`, "DELETE", "Rascunho descartado: voltou para a versão ativa.")
      return
    }
    const pronto = tela.modelos_prontos.find((x) => x.codigo === valor)
    const nome = valor === "padrao" ? "o modelo padrão do sistema" : valor === "branco" ? "um desenho em branco" : `"${pronto?.nome ?? valor}"`
    const ok = await confirmar({
      titulo: "Começar de outro desenho?",
      mensagem: `O rascunho passa a ser ${nome}. A versão ativa não muda até você ativar.`,
      confirmarRotulo: "Carregar no rascunho",
    })
    if (!ok) return
    if (valor === "branco") {
      setModelo((m) => (m ? { ...m, grafo: grafoEmBranco() } : m))
      setSel(null)
      setAtivado(null)
      return
    }
    if (valor === "padrao") await substituirPor(`${BASE}/${tipo}/restaurar`, "POST", "Modelo padrão carregado no rascunho.")
    else await substituirPor(`${BASE}/${tipo}/modelos-prontos/${encodeURIComponent(valor)}`, "POST", `"${pronto?.nome ?? valor}" carregado no rascunho.`)
  }

  const abrirAtivar = async () => {
    setOcupado(true)
    try {
      if (!(await salvarAgora())) {
        toast.error("O rascunho não foi salvo; ative depois de salvar.")
        return
      }
      const r = await authFetch(`${BASE}/${tipo}/conferir`, { method: "POST", body: "{}" })
      const c: Conferencia = await jsonOuErro(r)
      setConferencia(c)
      setDialogoAtivar({ conferencia: c, erro: null })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const ativar = async () => {
    setOcupado(true)
    try {
      const t: TelaConstrutor = await jsonOuErro(await authFetch(`${BASE}/${tipo}/ativar`, { method: "POST" }))
      aplicarTela(t)
      setAjustes([])
      const v = t.ativado?.versao ?? t.ativo.versao
      setAtivado(mensagemAtivado(v))
      setDialogoAtivar(null)
      setVersoes(null)
      toast.success(`Versão ${v} ativa.`)
    } catch (e) {
      const err = e as ErroApi
      if (err.status === 400 && err.detalhe) {
        setDialogoAtivar({ conferencia: { ok: false, erros: err.detalhe.erros, avisos: err.detalhe.avisos, lei: err.detalhe.lei }, erro: err.message })
      } else setDialogoAtivar((d) => (d ? { ...d, erro: err.message } : d))
    } finally {
      setOcupado(false)
    }
  }

  const abrirVersoes = async () => {
    try {
      setVersoes(await jsonOuErro(await authFetch(`${BASE}/${tipo}/versoes`)))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const carregarVersao = async (v: VersaoFluxo) => {
    const ok = await confirmar({
      titulo: `Carregar a versão ${v.versao} no rascunho?`,
      mensagem: "O desenho dessa versão vira o rascunho. Para valer nos processos novos, ative depois.",
      confirmarRotulo: "Carregar no rascunho",
    })
    if (!ok) return
    try {
      const d = await jsonOuErro(await authFetch(`${BASE}/${tipo}/versoes/${v.versao}`))
      setModelo((m) =>
        m
          ? {
              ...m,
              grafo: { formato: 1, nos: d.grafo?.nos ?? [], arestas: d.grafo?.arestas ?? [] },
              ...(d.aprovacao_demanda ? { aprovacao_demanda: d.aprovacao_demanda } : {}),
              ...(typeof d.exigir_posse_pecas === "boolean" ? { exigir_posse_pecas: d.exigir_posse_pecas } : {}),
            }
          : m,
      )
      setSel(null)
      setAtivado(null)
      setVersoes(null)
      toast.success(`Versão ${v.versao} carregada no rascunho.`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const montarComIa = async () => {
    const texto = descricaoIa.trim()
    if (texto.length < 15) {
      setStatusIa("Descreva como o fluxo funciona no seu órgão (pelo menos 15 caracteres).")
      return
    }
    if (temRascunho || alterado) {
      const ok = await confirmar({
        titulo: "Montar com IA?",
        mensagem: "O desenho que a IA montar substitui o rascunho atual. Nada é ativado: confira e ajuste antes de ativar.",
        confirmarRotulo: "Montar com IA",
      })
      if (!ok) return
    }
    setGerandoIa(true)
    setStatusIa("Montando o fluxo… (pode levar alguns segundos)")
    try {
      const r = await authFetch(`${BASE}/${tipo}/gerar-com-ia`, { method: "POST", body: JSON.stringify({ descricao: texto }) })
      if (r.status === 503) {
        const e = erroDoCorpo(await r.json().catch(() => null), 503)
        setStatusIa(`IA indisponível: ${e.texto}`)
        return
      }
      const t: TelaConstrutor = await jsonOuErro(r)
      aplicarTela(t)
      if (t.ia) {
        setConferencia(t.ia.conferencia)
        setAjustes(t.ia.ajustes)
      }
      setAtivado(null)
      setStatusIa("Pronto. Confira a conferência ao lado e ajuste o que quiser. Nada foi ativado.")
    } catch (e) {
      setStatusIa((e as Error).message)
    } finally {
      setGerandoIa(false)
    }
  }

  // ---------------------------------------------------------------- testar
  const simular = useCallback(
    async (acao: { tipo: "iniciar" } | AcaoDoTeste, estado: unknown) => {
      if (!modelo) return
      setTestando(true)
      try {
        const dados = { valor_total_estimado: lerValorEmReais(valorTeste), tipo_contratacao: tipoTeste || null }
        const corpo = { grafo: corpoDoRascunho(modelo).grafo, acao, dados, ...(acao.tipo === "iniciar" ? {} : { estado }) }
        const r = await jsonOuErro(await authFetch(`${BASE}/${tipo}/simular`, { method: "POST", body: JSON.stringify(corpo) }))
        if (!r.estado) {
          const bloqueio: string[] = (r.conferencia?.erros ?? []).map((e: ErroConferencia) => e.mensagem)
          setTeste({ estado: null, log: [], ativos: [], fim: false, erro: r.erro, bloqueio: bloqueio.length ? bloqueio : [r.erro ?? "Ajuste o desenho antes de testar."] })
          return
        }
        setTeste((t) => ({
          estado: r.estado,
          log: acao.tipo === "iniciar" ? r.log : [...(t?.log ?? []), ...r.log],
          ativos: r.ativos ?? [],
          fim: !!r.fim,
          erro: r.erro ?? null,
          bloqueio: [],
        }))
      } catch (e) {
        setTeste((t) => (t ? { ...t, erro: (e as Error).message } : { estado: null, log: [], ativos: [], fim: false, erro: (e as Error).message, bloqueio: [] }))
      } finally {
        setTestando(false)
      }
    },
    [modelo, tipo, valorTeste, tipoTeste],
  )

  const trocarModo = (m: "desenhar" | "testar") => {
    setModo(m)
    setSel(null)
    if (m === "testar") simular({ tipo: "iniciar" }, null)
  }

  // ---------------------------------------------------------------- derivados
  const exigidas = useMemo(() => exigidasPelaLei(tela?.requisitos ?? []), [tela])
  const comErro = useMemo(() => (modelo && conferencia ? nosComErro(modelo.grafo, conferencia.erros) : new Set<string>()), [modelo, conferencia])
  const estadoTeste = teste?.estado as { ativos?: string[]; feitos?: string[] } | null | undefined
  const ativos = useMemo(() => new Set(estadoTeste?.ativos ?? []), [estadoTeste])
  const feitos = useMemo(() => new Set(estadoTeste?.feitos ?? []), [estadoTeste])

  if (erroCarga) {
    return (
      <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        Não foi possível abrir o fluxo: {erroCarga}
      </p>
    )
  }
  if (!tela || !modelo) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Carregando" />
      </div>
    )
  }

  const subtitulo = (n: NoFluxo): string => {
    if (n.tipo === "condicao") return descreverCondicao(n.condicao)
    if (n.tipo !== "etapa" && n.tipo !== "aprovacao") return ""
    const quem = rotuloDoResponsavel(n.responsavel, tela)
    const doCatalogo = !!n.codigo && tela.catalogo.etapas.some((c) => c.codigo === n.codigo)
    const base = quem ?? (doCatalogo ? "quem conduz" : "escolha quem faz")
    return `${base}${n.prazo_dias_uteis ? ` · ${n.prazo_dias_uteis} d.u.` : ""}`
  }

  const situacao = editavel
    ? situacaoDaEdicao(tela, { temRascunho, salvoEm, salvando, alterado, erroAoSalvar: erroSalvar })
    : {
        titulo: `Você está vendo a versão ativa ${tela.ativo.versao}.`,
        detalhe: tela.rascunho ? "O administrador tem um rascunho em edição, que ainda não vale para os processos." : "",
      }
  const ativoEm = tela.ativo.ativado_em ? ` em ${dataHoraBrasilia(tela.ativo.ativado_em)}` : ""
  const ativoPor = tela.ativo.ativado_por_nome ? ` por ${tela.ativo.ativado_por_nome}` : ""
  const irParaErro = (e: ErroConferencia) => {
    const id = noDoErro(modelo.grafo, e)
    if (id) setSel({ no: id })
  }

  return (
    <div className="min-w-0 space-y-3">
      {dialogo}

      {/* Barra superior: rascunho × versão ativa e as ações */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-72" role="status" aria-live="polite">
          <p className="text-sm font-semibold text-slate-900">{situacao.titulo}</p>
          <p className={`text-xs ${erroSalvar ? "text-red-700" : "text-slate-600"}`}>
            {situacao.detalhe}
            {ativoPor || ativoEm ? ` Versão ${tela.ativo.versao} ativada${ativoPor}${ativoEm}.` : ""}
            {tela.processos_em_andamento > 0 && ` ${tela.processos_em_andamento} processo(s) em andamento continuam no fluxo em que começaram.`}
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="Modo">
          {(["desenhar", "testar"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              className={`h-9 px-3 text-sm font-semibold ${modo === m ? "bg-blue-50 text-blue-900" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              onClick={() => trocarModo(m)}
            >
              {m === "desenhar" ? "Desenhar" : "Testar"}
            </button>
          ))}
        </div>
        {editavel && (
          <div className="flex items-center gap-2">
            <label htmlFor={`comecar-${tipo}`} className="text-xs font-semibold text-slate-700">
              Começar de
            </label>
            <select
              id={`comecar-${tipo}`}
              className="h-9 max-w-[16rem] rounded-md border border-slate-300 bg-white px-2 text-sm"
              value=""
              disabled={ocupado || modo !== "desenhar"}
              onChange={(e) => comecarDe(e.target.value)}
            >
              <option value="">— escolha —</option>
              {tela.modelos_prontos.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.nome}
                </option>
              ))}
              <option value="padrao">Modelo padrão do sistema (restaurar)</option>
              <option value="branco">Em branco</option>
              {temRascunho && <option value="ativa">A versão ativa (descartar o rascunho)</option>}
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={abrirVersoes}>
            <History aria-hidden="true" /> Versões
          </Button>
          {editavel && (
            <>
              <Button type="button" variant="outline" size="sm" disabled={salvando || ocupado || (!alterado && !erroSalvar)} onClick={() => salvarAgora()}>
                {salvando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />} Salvar rascunho
              </Button>
              <Button type="button" size="sm" disabled={ocupado || salvando || (!temRascunho && !alterado)} onClick={abrirAtivar}>
                {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />} Ativar
              </Button>
            </>
          )}
        </div>
      </div>

      {semPermissao && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Somente o administrador do órgão altera e ativa o fluxo. Você pode ver o desenho e testar.
        </p>
      )}
      {tela.rascunho?.desatualizado && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          A versão ativa mudou depois que este rascunho começou (versão {tela.rascunho.base_versao} → {tela.ativo.versao}). Ao ativar, o rascunho substitui a versão ativa.
        </p>
      )}
      {ativado && (
        <p role="status" className="flex items-start gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {ativado}
        </p>
      )}

      <div className="grid min-w-0 gap-3 lg:grid-cols-[190px_minmax(0,1fr)_330px]">
        {/* Paleta */}
        <aside className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3" aria-label="Blocos">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{editavel ? "Arraste para o desenho" : "Blocos"}</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {BLOCOS.map((b) => (
              <button
                key={b.tipo}
                type="button"
                draggable={editavel && modo === "desenhar"}
                disabled={!editavel || modo !== "desenhar"}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(MIME_PALETA, b.tipo)
                  ev.dataTransfer.effectAllowed = "copy"
                }}
                onClick={() => criar(b.tipo)}
                className={`flex w-full cursor-grab flex-col items-start border border-slate-300 bg-white px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${b.forma}`}
              >
                <span className="text-sm font-bold text-slate-900">{b.titulo}</span>
                <span className="text-xs text-slate-600">{b.ajuda}</span>
              </button>
            ))}
          </div>
          {editavel && (
            <p className="text-xs leading-relaxed text-slate-600">
              Ligar: puxe a bolinha azul de uma caixa até outra. Clique numa caixa ou numa seta para editar. Tecla Delete apaga o que está selecionado.
            </p>
          )}
          {editavel && (
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Montar com IA</p>
              <label htmlFor={`ia-${tipo}`} className="text-xs font-semibold text-slate-700">
                Descreva o fluxo do seu órgão
              </label>
              <textarea
                id={`ia-${tipo}`}
                className="min-h-24 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Ex.: depois do parecer, se passar de 50 mil, vai para o secretário de Finanças aprovar; se ele devolver, volta para a pesquisa de preços."
                value={descricaoIa}
                disabled={!tela.ia_disponivel || gerandoIa}
                onChange={(e) => setDescricaoIa(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full border-violet-400 bg-violet-50 text-violet-800 hover:bg-violet-100"
                disabled={!tela.ia_disponivel || gerandoIa || modo !== "desenhar"}
                onClick={montarComIa}
              >
                {gerandoIa ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />} Montar com IA
              </Button>
              <p className="text-xs text-violet-800" aria-live="polite">
                {!tela.ia_disponivel ? "IA indisponível nesta instalação. Use um modelo pronto em \"Começar de\"." : statusIa}
              </p>
            </div>
          )}
        </aside>

        {/* Desenho */}
        <PalcoFluxo
          grafo={modelo.grafo}
          sel={sel}
          editavel={editavel}
          modo={modo}
          ativos={ativos}
          feitos={feitos}
          comErro={comErro}
          exigidaPorLei={(n) => !!n.codigo && exigidas.has(n.codigo)}
          subtitulo={subtitulo}
          onSelecionar={setSel}
          onMover={(id, x, y) => mudarGrafo((g) => moverNo(g, id, x, y))}
          onLigar={ligar}
          onSoltarBloco={(t, x, y) => criar(t, x, y)}
          palcoRef={palcoRef}
        />

        {/* Painel da seleção + conferência / teste */}
        <aside className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-3 lg:max-h-[calc(100vh-260px)] lg:min-h-[520px] lg:overflow-y-auto" aria-label="Detalhes">
          {modo === "desenhar" ? (
            <>
              <PainelCaixa
                tela={tela}
                modelo={modelo}
                sel={sel}
                editavel={editavel}
                onAlterarNo={(id, m) => mudarGrafo((g) => alterarNo(g, id, m))}
                onTrocarNo={(n) => mudarGrafo((g) => ({ ...g, nos: g.nos.map((x) => (x.id === n.id ? n : x)) }))}
                onAlterarAresta={(id, r) => mudarGrafo((g) => alterarAresta(g, id, r))}
                onApagar={apagar}
                onLigar={ligar}
                onAlterarModelo={(m) => {
                  setModelo((x) => (x ? { ...x, ...m } : x))
                  setErroSalvar(null)
                }}
              />
              <div className="border-t border-slate-100 pt-3">
                <PainelConferencia conferencia={conferencia} conferindo={conferindo} ajustes={ajustes} onIrParaErro={irParaErro} />
              </div>
            </>
          ) : (
            <PainelTeste
              teste={teste}
              ocupado={testando}
              valor={valorTeste}
              tipoContratacao={tipoTeste}
              onValor={setValorTeste}
              onTipoContratacao={setTipoTeste}
              onRecomecar={() => simular({ tipo: "iniciar" }, null)}
              onAcao={(a) => simular(a, teste?.estado)}
            />
          )}
        </aside>
      </div>

      {/* Ativar: o resultado da conferência e a confirmação */}
      <Dialog open={!!dialogoAtivar} onOpenChange={(v) => !v && setDialogoAtivar(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogoAtivar?.conferencia.erros.length ? "Ainda não dá para ativar" : `Ativar a versão ${tela.ativo.versao + 1}?`}</DialogTitle>
            <DialogDescription>
              {dialogoAtivar?.conferencia.erros.length
                ? "Ajuste o que falta no desenho e tente de novo."
                : `Processos novos passam a seguir este fluxo. ${
                    tela.processos_em_andamento > 0 ? `Os ${tela.processos_em_andamento} em andamento continuam` : "Os em andamento continuam"
                  } no fluxo em que começaram.`}
            </DialogDescription>
          </DialogHeader>
          {dialogoAtivar && <PainelConferencia conferencia={dialogoAtivar.conferencia} conferindo={false} ajustes={[]} />}
          {dialogoAtivar?.erro && (
            <p role="alert" className="text-sm text-red-800">
              {dialogoAtivar.erro}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAtivar(null)}>
              {dialogoAtivar?.conferencia.erros.length ? "Fechar" : "Cancelar"}
            </Button>
            {!dialogoAtivar?.conferencia.erros.length && (
              <Button onClick={ativar} disabled={ocupado}>
                {ocupado && <Loader2 className="animate-spin" aria-hidden="true" />} Ativar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico de versões */}
      <Dialog open={!!versoes} onOpenChange={(v) => !v && setVersoes(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Versões do fluxo — {tela.rotulo_tipo}</DialogTitle>
            <DialogDescription>Cada ativação vira uma versão. Os processos guardam a versão em que começaram.</DialogDescription>
          </DialogHeader>
          {versoes && versoes.length === 0 && <p className="text-sm text-slate-600">Ainda não há versões gravadas.</p>}
          <ul className="divide-y divide-slate-100">
            {(versoes ?? []).map((v) => (
              <li key={v.versao} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">
                    Versão {v.versao}
                    {v.ativa && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-bold text-green-800">ativa</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    {v.nome} · {rotuloDaOrigem(v.origem)} · {v.ativado_por_nome ? `ativada por ${v.ativado_por_nome}` : "sem autor registrado"} em {dataHoraBrasilia(v.ativado_em)}
                  </p>
                </div>
                {editavel && !v.ativa && (
                  <Button size="sm" variant="outline" onClick={() => carregarVersao(v)}>
                    Carregar no rascunho
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
