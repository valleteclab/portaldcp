"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, CalendarClock, Check, CheckCircle2, Circle, ClipboardList, FileInput, Loader2, ShieldCheck, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { API_URL, authFetch } from "@/lib/api"

type Campo = { id: string; chave: string; rotulo: string; tipo: string; obrigatorio: boolean; opcoes?: unknown[] | null }
type Formulario = { id: string; nome: string; descricao: string | null; campos: Campo[] }
type Acao = { id: string; nome: string; tipo: string; formulario_id: string | null; responsavel_tipo: string; prazo_dias_uteis: number | null }
type Fase = { id: string; nome: string; cor: string; ordem: number; acoes: Acao[] }
type Modelo = { id: string; nome: string; fases: Fase[]; formularios: Formulario[] }
type Tarefa = { id: string; acao_id: string; status: string; responsavel_tipo: string; responsaveis: string[] | null; regra_conclusao: string; quantidade_minima: number | null; prazo_em: string | null; resposta: Record<string, unknown> | null; created_at: string }
type Historico = { id: string; evento: string; descricao: string; created_at: string }
type Execucao = { id: string; workflow_id: string; numero: string; titulo: string; status: string; acao_atual_id: string | null; fase_atual_id: string | null; created_at: string; tarefas: Tarefa[]; historico: Historico[] }
type Opcao = { id: string; nome: string }

const BASE = `${API_URL}/api/workflows`

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await authFetch(url, init)
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(corpo?.message || `Erro ${resposta.status}`)
  return corpo
}

function iconeDaAcao(tipo: string) {
  if (tipo === "APROVACAO") return ShieldCheck
  if (tipo === "FORMULARIO") return ClipboardList
  if (tipo === "DOCUMENTO") return FileInput
  return CheckCircle2
}

export default function ExecucaoWorkflowPage() {
  const { id } = useParams<{ id: string }>()
  const [execucao, setExecucao] = useState<Execucao | null>(null)
  const [modelo, setModelo] = useState<Modelo | null>(null)
  const [usuarios, setUsuarios] = useState<Opcao[]>([])
  const [setores, setSetores] = useState<Opcao[]>([])
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [observacao, setObservacao] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const instancia = await api<Execucao>(`${BASE}/execucoes/${id}`)
      const [modeloCarregado, config, pessoas] = await Promise.all([
        api<Modelo>(`${BASE}/${instancia.workflow_id}`),
        api<{ setores?: Opcao[] }>(`${API_URL}/api/fase-interna/configuracao`),
        api<Array<Opcao & { ativo?: boolean }>>(`${API_URL}/api/fase-interna/configuracao/usuarios`),
      ])
      setExecucao(instancia)
      setModelo(modeloCarregado)
      setSetores(config.setores ?? [])
      setUsuarios(pessoas.filter((pessoa) => pessoa.ativo !== false))
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível abrir o processo")
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => void carregar(), [carregar])

  const passos = useMemo(() => modelo?.fases.flatMap((fase) => fase.acoes.map((acao) => ({ fase, acao }))) ?? [], [modelo])
  const indiceAtual = passos.findIndex(({ acao }) => acao.id === execucao?.acao_atual_id)
  const passoAtual = indiceAtual >= 0 ? passos[indiceAtual] : null
  const tarefaAtual = execucao?.tarefas.find((tarefa) => tarefa.status === "ABERTA" && tarefa.acao_id === execucao.acao_atual_id) ?? null
  const formulario = modelo?.formularios.find((item) => item.id === passoAtual?.acao.formulario_id) ?? null

  const nomesResponsaveis = useMemo(() => {
    if (!tarefaAtual) return []
    if (tarefaAtual.responsavel_tipo === "SOLICITANTE") return ["Solicitante do processo"]
    const origem = tarefaAtual.responsavel_tipo === "SETOR" ? setores : usuarios
    return origem.filter((item) => tarefaAtual.responsaveis?.includes(item.id)).map((item) => item.nome)
  }, [setores, tarefaAtual, usuarios])

  const concluir = async () => {
    if (!execucao || !tarefaAtual || !passoAtual) return
    if (formulario) {
      const faltando = formulario.campos.find((campo) => campo.obrigatorio && !respostas[campo.chave]?.trim())
      if (faltando) return toast.error(`Preencha o campo obrigatório: ${faltando.rotulo}`)
    }
    setSalvando(true)
    try {
      const atualizada = await api<Execucao>(`${BASE}/execucoes/${execucao.id}/tarefas/${tarefaAtual.id}/concluir`, {
        method: "POST",
        body: JSON.stringify({ resposta: { campos: respostas, observacao, decisao: passoAtual.acao.tipo === "APROVACAO" ? "APROVADO" : "CONCLUIDO" } }),
      })
      setExecucao(atualizada)
      setRespostas({})
      setObservacao("")
      toast.success(passoAtual.acao.tipo === "APROVACAO" ? "Aprovação registrada" : "Etapa concluída")
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a etapa")
    } finally {
      setSalvando(false)
    }
  }

  const devolver = async () => {
    if (!execucao || !tarefaAtual) return
    if (!observacao.trim()) return toast.error("Informe o motivo da devolução")
    setSalvando(true)
    try {
      const atualizada = await api<Execucao>(`${BASE}/execucoes/${execucao.id}/tarefas/${tarefaAtual.id}/devolver`, {
        method: "POST",
        body: JSON.stringify({ motivo: observacao.trim() }),
      })
      setExecucao(atualizada)
      setObservacao("")
      toast.success("Processo devolvido para correção")
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível devolver a etapa")
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-blue-700" /></div>
  if (!execucao || !modelo) return <div className="py-20 text-center text-slate-500">Processo não encontrado.</div>

  const IconeAtual = iconeDaAcao(passoAtual?.acao.tipo ?? "TAREFA")
  const finalizado = execucao.status !== "EM_ANDAMENTO"
  const concluidas = execucao.tarefas.filter((tarefa) => tarefa.status === "CONCLUIDA").length

  return <div className="mx-auto max-w-7xl space-y-5 pb-16">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/orgao/workflows" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" />Processos de trabalho</Link><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700">{execucao.numero}</p><h1 className="text-2xl font-bold text-slate-900">{execucao.titulo}</h1><p className="text-sm text-slate-500">Modelo: {modelo.nome}</p></div>
      <Badge className={finalizado ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-blue-100 text-blue-800 hover:bg-blue-100"}>{finalizado ? "Concluído" : "Em andamento"}</Badge>
    </div>

    <Card><CardContent className="overflow-x-auto p-4"><div className="flex min-w-max items-start">{passos.map(({ fase, acao }, indice) => { const concluida = indice < indiceAtual || finalizado; const atual = indice === indiceAtual && !finalizado; return <div key={acao.id} className="flex items-start"><div className="w-44 text-center"><div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 ${concluida ? "border-emerald-600 bg-emerald-600 text-white" : atual ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-400"}`}>{concluida ? <Check className="h-5 w-5" /> : <Circle className="h-4 w-4" />}</div><p className={`mt-2 text-xs font-semibold ${atual ? "text-blue-700" : "text-slate-700"}`}>{acao.nome}</p><p className="text-[11px] text-slate-400">{fase.nome}</p></div>{indice < passos.length - 1 && <div className={`mt-4 h-0.5 w-12 ${indice < indiceAtual || finalizado ? "bg-emerald-500" : "bg-slate-200"}`} />}</div> })}</div></CardContent></Card>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        {finalizado ? <Card className="border-emerald-300 bg-emerald-50"><CardContent className="flex items-center gap-3 p-6"><CheckCircle2 className="h-9 w-9 text-emerald-600" /><div><h2 className="font-semibold text-emerald-900">Processo concluído</h2><p className="text-sm text-emerald-700">Todas as etapas deste fluxo foram finalizadas.</p></div></CardContent></Card> : passoAtual && tarefaAtual ? <Card className="border-blue-200 shadow-sm"><CardHeader className="border-b bg-blue-50/60"><div className="flex items-start gap-3"><div className="rounded-lg bg-blue-700 p-2 text-white"><IconeAtual className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase text-blue-700">Etapa atual · {passoAtual.fase.nome}</p><CardTitle className="mt-1 text-xl">{passoAtual.acao.nome}</CardTitle></div></div></CardHeader><CardContent className="space-y-5 p-6">
          <div className="grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2"><div className="flex gap-2"><UserRound className="mt-0.5 h-4 w-4 text-slate-500" /><div><p className="text-xs text-slate-500">Responsável</p><p className="text-sm font-medium">{nomesResponsaveis.join(", ") || tarefaAtual.responsavel_tipo}</p></div></div><div className="flex gap-2"><CalendarClock className="mt-0.5 h-4 w-4 text-slate-500" /><div><p className="text-xs text-slate-500">Prazo</p><p className="text-sm font-medium">{tarefaAtual.prazo_em ? new Date(tarefaAtual.prazo_em).toLocaleDateString("pt-BR") : "Sem prazo definido"}</p></div></div></div>

          {formulario && <div><h3 className="font-semibold">{formulario.nome}</h3>{formulario.descricao && <p className="text-sm text-slate-500">{formulario.descricao}</p>}<div className="mt-4 grid gap-4 sm:grid-cols-2">{formulario.campos.map((campo) => <label key={campo.id} className={`block text-sm font-medium ${campo.tipo === "TEXTO_LONGO" ? "sm:col-span-2" : ""}`}>{campo.rotulo}{campo.obrigatorio && <span className="text-red-600"> *</span>}{campo.tipo === "TEXTO_LONGO" ? <Textarea className="mt-1" value={respostas[campo.chave] ?? ""} onChange={(e) => setRespostas((atual) => ({ ...atual, [campo.chave]: e.target.value }))} /> : <Input className="mt-1" type={campo.tipo === "DATA" ? "date" : campo.tipo === "NUMERO" || campo.tipo === "MOEDA" ? "number" : "text"} value={respostas[campo.chave] ?? ""} onChange={(e) => setRespostas((atual) => ({ ...atual, [campo.chave]: e.target.value }))} />}</label>)}</div></div>}

          {!formulario && <label className="block text-sm font-medium">Observação{passoAtual.acao.tipo !== "APROVACAO" && <span className="font-normal text-slate-400"> (opcional)</span>}<Textarea className="mt-1" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder={passoAtual.acao.tipo === "APROVACAO" ? "Registre a justificativa da decisão" : "Registre o que foi realizado nesta etapa"} /></label>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-slate-500">{tarefaAtual.regra_conclusao !== "QUALQUER" && `Regra: ${tarefaAtual.regra_conclusao.toLowerCase()}`}</p><div className="flex gap-2">{passoAtual.acao.tipo === "APROVACAO" && indiceAtual > 0 && <Button variant="outline" onClick={devolver} disabled={salvando}>Devolver para correção</Button>}<Button onClick={concluir} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{passoAtual.acao.tipo === "APROVACAO" ? <><ShieldCheck className="mr-2 h-4 w-4" />Aprovar e avançar</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Concluir etapa</>}</Button></div></div>
        </CardContent></Card> : null}

        <Card><CardHeader><CardTitle className="text-base">Etapas realizadas</CardTitle></CardHeader><CardContent className="space-y-2">{execucao.tarefas.filter((tarefa) => tarefa.status !== "ABERTA").map((tarefa) => { const passo = passos.find(({ acao }) => acao.id === tarefa.acao_id); return <div key={tarefa.id} className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-sm font-medium">{passo?.acao.nome ?? "Etapa concluída"}</p><p className="text-xs text-slate-500">{passo?.fase.nome}</p></div></div>})}{concluidas === 0 && <p className="text-sm text-slate-500">Nenhuma etapa concluída ainda.</p>}</CardContent></Card>
      </div>

      <Card className="h-fit"><CardHeader><CardTitle className="text-base">Histórico do processo</CardTitle></CardHeader><CardContent><div className="space-y-5">{execucao.historico.slice().reverse().map((item) => <div key={item.id} className="relative border-l-2 border-blue-200 pl-4"><span className="absolute -left-1.5 top-1 h-2.5 w-2.5 rounded-full bg-blue-600" /><p className="text-sm font-medium text-slate-800">{item.descricao}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")}</p></div>)}</div></CardContent></Card>
    </div>
  </div>
}
