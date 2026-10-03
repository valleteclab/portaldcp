"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, ChevronDown, Circle, Clock3, GitBranch, Loader2, Plus, Save, ShieldCheck, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"
import { corpoDoRascunho, modeloEmEdicao, TIPOS_PROCESSO, type ModeloEmEdicao, type TelaConstrutor, type TipoProcesso } from "@/lib/fluxo/tela-construtor"
import type { NoFluxo } from "@/lib/fluxo/grafo-editor"

const BASE = `${API_URL}/api/fluxo-fase-interna/construtor`

type Passo = "escolher" | "montar" | "revisar"

const tipoVisual = (no: NoFluxo) => {
  if (no.tipo === "inicio") return { rotulo: "Início", cor: "border-emerald-300 bg-emerald-50", icone: Circle }
  if (no.tipo === "fim") return { rotulo: "Fim", cor: "border-slate-300 bg-slate-50", icone: Check }
  if (no.tipo === "condicao") return { rotulo: "Decisão", cor: "border-amber-300 bg-amber-50", icone: GitBranch }
  if (no.tipo === "aprovacao") return { rotulo: "Aprovação", cor: "border-violet-300 bg-violet-50", icone: ShieldCheck }
  return { rotulo: "Tarefa", cor: "border-blue-300 bg-blue-50", icone: UserRound }
}

async function jsonOuErro(resposta: Response) {
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(Array.isArray(corpo?.message) ? corpo.message.join(" ") : corpo?.message || `Erro ${resposta.status}`)
  return corpo
}

function ordenarNos(modelo: ModeloEmEdicao | null) {
  return [...(modelo?.grafo.nos ?? [])].sort((a, b) => a.x - b.x || a.y - b.y)
}

export default function FluxosSimplesPage() {
  const [tipo, setTipo] = useState<TipoProcesso>("DISPENSA")
  const [passo, setPasso] = useState<Passo>("escolher")
  const [tela, setTela] = useState<TelaConstrutor | null>(null)
  const [modelo, setModelo] = useState<ModeloEmEdicao | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [publicando, setPublicando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = (await jsonOuErro(await authFetch(`${BASE}/${tipo}`))) as TelaConstrutor
      const atual = modeloEmEdicao(dados)
      setTela(dados)
      setModelo(atual)
      setSelecionado(ordenarNos(atual).find((no) => no.tipo !== "inicio" && no.tipo !== "fim")?.id ?? null)
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível carregar o fluxo")
    } finally {
      setCarregando(false)
    }
  }, [tipo])

  useEffect(() => void carregar(), [carregar])

  const nos = useMemo(() => ordenarNos(modelo), [modelo])
  const no = modelo?.grafo.nos.find((item) => item.id === selecionado) ?? null
  const erros = tela?.conferencia?.erros ?? []

  const alterarNo = (mudanca: Partial<NoFluxo>) => {
    if (!modelo || !selecionado) return
    setModelo({ ...modelo, grafo: { ...modelo.grafo, nos: modelo.grafo.nos.map((item) => item.id === selecionado ? { ...item, ...mudanca } : item) } })
  }

  const salvar = async () => {
    if (!modelo) return
    setSalvando(true)
    try {
      const dados = (await jsonOuErro(await authFetch(`${BASE}/${tipo}/rascunho`, { method: "PUT", body: JSON.stringify(corpoDoRascunho(modelo)) }))) as TelaConstrutor
      setTela(dados)
      toast.success("Rascunho salvo. Nada mudou nos processos em andamento.")
      setPasso("revisar")
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar")
    } finally {
      setSalvando(false)
    }
  }

  const publicar = async () => {
    setPublicando(true)
    try {
      await salvar()
      const dados = await jsonOuErro(await authFetch(`${BASE}/${tipo}/ativar`, { method: "POST" }))
      toast.success(`Versão ${dados?.ativado?.versao ?? dados?.versao ?? "nova"} ativada para processos novos.`)
      await carregar()
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "O fluxo ainda precisa de ajustes")
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/orgao/configuracoes" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Configurações
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Fluxos de trabalho</h1>
          <p className="mt-1 max-w-2xl text-slate-600">Monte o caminho como sua equipe trabalha. Você não precisa conhecer BPMN: o sistema cuida das regras e do desenho técnico.</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Modo seguro:</strong> alterações ficam em rascunho até você ativar.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["escolher", "montar", "revisar"] as Passo[]).map((item, indice) => {
          const titulos = ["1. Escolha o processo", "2. Monte as etapas", "3. Revise e ative"]
          const ativo = passo === item
          return <button key={item} onClick={() => setPasso(item)} className={`rounded-xl border p-4 text-left transition ${ativo ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <span className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${ativo ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>{indice + 1}</span>
            <div className="font-semibold text-slate-900">{titulos[indice]}</div>
          </button>
        })}
      </div>

      {passo === "escolher" && (
        <Card><CardContent className="p-6">
          <h2 className="text-xl font-semibold">Qual processo você quer organizar?</h2>
          <p className="mt-1 text-sm text-slate-600">Comece por um fluxo existente. A versão ativa continuará valendo até a publicação.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {TIPOS_PROCESSO.map((item) => <button key={item.tipo} onClick={() => { setTipo(item.tipo); setPasso("montar") }} className={`rounded-xl border p-5 text-left hover:border-blue-500 hover:bg-blue-50 ${tipo === item.tipo ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <GitBranch className="mb-4 h-7 w-7 text-blue-700" />
              <div className="font-semibold text-slate-900">{item.rotulo}</div>
              <div className="mt-1 text-sm text-slate-500">Abrir e simplificar este fluxo</div>
            </button>)}
          </div>
        </CardContent></Card>
      )}

      {passo !== "escolher" && carregando && <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-blue-700" /></div>}

      {passo === "montar" && !carregando && modelo && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card><CardContent className="p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-semibold">Caminho do processo</h2><p className="text-sm text-slate-500">Clique em uma etapa para configurar.</p></div>
              <Button variant="outline" onClick={() => toast.info("Na próxima fatia, esta ação abrirá o catálogo de tarefas sem exigir desenho manual.")}><Plus className="mr-2 h-4 w-4" />Adicionar etapa</Button>
            </div>
            <div className="overflow-x-auto pb-4">
              <div className="flex min-w-max items-center gap-2">
                {nos.map((item, indice) => {
                  const visual = tipoVisual(item); const Icone = visual.icone
                  return <div key={item.id} className="flex items-center gap-2">
                    <button onClick={() => setSelecionado(item.id)} className={`w-48 rounded-xl border-2 p-4 text-left transition ${visual.cor} ${selecionado === item.id ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Icone className="h-4 w-4" />{visual.rotulo}</div>
                      <div className="mt-2 line-clamp-2 font-semibold text-slate-900">{item.nome}</div>
                      {item.prazo_dias_uteis != null && <div className="mt-2 flex items-center gap-1 text-xs text-slate-600"><Clock3 className="h-3.5 w-3.5" />{item.prazo_dias_uteis} dias úteis</div>}
                    </button>
                    {indice < nos.length - 1 && <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />}
                  </div>
                })}
              </div>
            </div>
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">O sistema mantém decisões, devoluções e validações legais do fluxo original. Esta visão mostra apenas o necessário para configurar o trabalho.</div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            {!no ? <p className="text-sm text-slate-500">Selecione uma etapa.</p> : <div className="space-y-5">
              <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tipoVisual(no).rotulo}</div><h3 className="text-lg font-semibold">Configurar etapa</h3></div>
              <label className="block text-sm font-medium">Nome<Input className="mt-1" value={no.nome} disabled={no.tipo === "inicio" || no.tipo === "fim"} onChange={(e) => alterarNo({ nome: e.target.value })} /></label>
              {no.tipo !== "inicio" && no.tipo !== "fim" && <>
                <label className="block text-sm font-medium">Responsável<select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3" value={no.responsavel?.setor_id ? `setor:${no.responsavel.setor_id}` : no.responsavel?.usuario_id ? `usuario:${no.responsavel.usuario_id}` : no.responsavel?.papel ? `papel:${no.responsavel.papel}` : ""} onChange={(e) => { const [origem, id] = e.target.value.split(":"); alterarNo({ responsavel: { papel: origem === "papel" ? id : null, setor_id: origem === "setor" ? id : null, usuario_id: origem === "usuario" ? id : null } }) }}><option value="">Quem estiver com o processo</option><optgroup label="Setores">{tela?.setores.map((s) => <option key={s.id} value={`setor:${s.id}`}>{s.nome}</option>)}</optgroup><optgroup label="Pessoas">{tela?.usuarios.map((u) => <option key={u.id} value={`usuario:${u.id}`}>{u.nome}</option>)}</optgroup><optgroup label="Papéis">{tela?.papeis.map((p) => <option key={p.codigo} value={`papel:${p.codigo}`}>{p.rotulo}</option>)}</optgroup></select></label>
                <label className="block text-sm font-medium">Prazo em dias úteis<Input className="mt-1" type="number" min={0} value={no.prazo_dias_uteis ?? ""} onChange={(e) => alterarNo({ prazo_dias_uteis: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              </>}
              <Button className="w-full" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar rascunho</Button>
            </div>}
          </CardContent></Card>
        </div>
      )}

      {passo === "revisar" && !carregando && tela && (
        <Card><CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Tudo pronto para testar?</h2><p className="mt-1 text-sm text-slate-600">A versão ativa é a {tela.ativo.versao}. Processos em andamento não serão alterados.</p></div><div className={`rounded-full px-3 py-1 text-sm font-semibold ${erros.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{erros.length ? `${erros.length} ajuste(s) necessário(s)` : "Fluxo conferido"}</div></div>
          {erros.length > 0 && <div className="mt-5 space-y-2">{erros.map((erro, i) => <div key={`${erro.codigo}-${i}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><strong>{erro.mensagem}</strong>{erro.fundamento && <div className="mt-1 text-amber-800">{erro.fundamento}</div>}</div>)}</div>}
          <div className="mt-6 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setPasso("montar")}>Voltar e ajustar</Button><Button onClick={publicar} disabled={publicando || erros.length > 0}>{publicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ativar para novos processos</Button><Link href={`/orgao/configuracoes/fluxo?tipo=${tipo}`}><Button variant="ghost">Abrir editor técnico <ChevronDown className="ml-2 h-4 w-4 -rotate-90" /></Button></Link></div>
        </CardContent></Card>
      )}
    </div>
  )
}
