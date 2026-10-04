"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Bell, CheckCircle2, ClipboardList, FileInput, FileText, GitBranch, Loader2, Mail, MessageCircle, Plus, Send, Settings2, Smartphone, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"
import { PainelAcao } from "@/components/workflow/PainelAcao"
import { PainelReacao } from "@/components/workflow/PainelReacao"

type Reacao = { id: string; tipo: string; nome: string; configuracao: Record<string, unknown> }
type Acao = { id: string; nome: string; tipo: string; formulario_id?: string | null; responsavel_tipo?: string; responsavel_valor?: string | null; prazo_dias_uteis: number | null; configuracao?: { responsaveis?: string[]; regra_conclusao?: string; quantidade_minima?: number } | null; reacoes: Reacao[] }
type Fase = { id: string; nome: string; cor: string; ordem: number; acoes: Acao[] }
type Campo = { id: string; rotulo: string; tipo: string; obrigatorio: boolean }
type Formulario = { id: string; nome: string; campos: Campo[] }
type Workflow = { id: string; nome: string; descricao: string | null; status: string; versao: number; fases: Fase[]; formularios: Formulario[] }
type Execucao = { id: string; numero: string; titulo: string; status: string; fase_atual_id: string | null; created_at: string }
type TarefaExecucao = { id: string; status: string; responsavel_tipo: string; responsaveis: string[] | null; prazo_em: string | null; created_at: string }
type HistoricoExecucao = { id: string; evento: string; descricao: string; created_at: string }
type ExecucaoDetalhe = Execucao & { tarefas: TarefaExecucao[]; historico: HistoricoExecucao[] }

const BASE = `${API_URL}/api/workflows`

async function requisicao(url: string, init?: RequestInit) {
  const resposta = await authFetch(url, init)
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(Array.isArray(corpo?.message) ? corpo.message.join(" ") : corpo?.message || `Erro ${resposta.status}`)
  return corpo
}

const ACAO = {
  FORMULARIO: { nome: "Preenchimento de formulário", cor: "#0891b2", Icone: ClipboardList },
  APROVACAO: { nome: "Aprovação", cor: "#eab308", Icone: UserCheck },
  DOCUMENTO: { nome: "Envio de documento", cor: "#0ea5e9", Icone: FileInput },
  TAREFA: { nome: "Tarefa", cor: "#6366f1", Icone: CheckCircle2 },
} as const

const REACAO = {
  EMAIL: { nome: "Enviar e-mail", Icone: Mail },
  WHATSAPP: { nome: "Enviar WhatsApp", Icone: Smartphone },
  NOTIFICACAO: { nome: "Notificação interna", Icone: Bell },
  GERAR_DOCUMENTO: { nome: "Gerar documento", Icone: FileText },
  AVANCAR: { nome: "Avançar no fluxo", Icone: Send },
} as const

export default function WorkflowsPage() {
  const [lista, setLista] = useState<Workflow[]>([])
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [nomeNovo, setNomeNovo] = useState("")
  const [criando, setCriando] = useState(false)
  const [formulariosAbertos, setFormulariosAbertos] = useState(false)
  const [faseMenu, setFaseMenu] = useState<string | null>(null)
  const [execucoes, setExecucoes] = useState<Execucao[] | null>(null)
  const [execucao, setExecucao] = useState<ExecucaoDetalhe | null>(null)
  const [acaoEditando, setAcaoEditando] = useState<Acao | null>(null)
  const [acaoDaReacao, setAcaoDaReacao] = useState<Acao | null>(null)

  const listar = useCallback(async () => {
    setCarregando(true)
    try { setLista(await requisicao(BASE)) } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar processos") } finally { setCarregando(false) }
  }, [])
  useEffect(() => void listar(), [listar])

  const abrir = async (id: string) => {
    try { setWorkflow(await requisicao(`${BASE}/${id}`)) } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao abrir processo") }
  }
  const recarregar = async () => { if (workflow) await abrir(workflow.id) }
  const criar = async () => {
    if (!nomeNovo.trim()) return toast.error("Digite o nome do processo")
    setCriando(true)
    try { const criado = await requisicao(BASE, { method: "POST", body: JSON.stringify({ nome: nomeNovo }) }); setNomeNovo(""); setWorkflow(criado); await listar() } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao criar") } finally { setCriando(false) }
  }
  const criarModeloAditivo = async () => {
    setCriando(true)
    try { const modelo = await requisicao(`${BASE}/modelos-prontos/aditivo`, { method: "POST" }); setWorkflow(modelo); await listar(); toast.success("Modelo de aditivo preparado para revisão") } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao criar modelo") } finally { setCriando(false) }
  }
  const adicionarFase = async () => {
    if (!workflow) return
    const nome = window.prompt("Nome da nova fase:", "Análise")?.trim(); if (!nome) return
    await requisicao(`${BASE}/${workflow.id}/fases`, { method: "POST", body: JSON.stringify({ nome }) }); await recarregar()
  }
  const adicionarAcao = async (fase: Fase, tipo: keyof typeof ACAO) => {
    if (!workflow) return
    const nome = window.prompt("Nome da ação:", ACAO[tipo].nome)?.trim(); if (!nome) return
    const criada = await requisicao(`${BASE}/${workflow.id}/fases/${fase.id}/acoes`, { method: "POST", body: JSON.stringify({ tipo, nome }) }); await recarregar(); setAcaoEditando({ ...criada, reacoes: [] })
    setFaseMenu(null)
  }
  const adicionarReacao = (acao: Acao) => setAcaoDaReacao(acao)
  const criarFormulario = async () => {
    if (!workflow) return
    const nome = window.prompt("Nome do formulário:", "Formulário da solicitação")?.trim(); if (!nome) return
    await requisicao(`${BASE}/${workflow.id}/formularios`, { method: "POST", body: JSON.stringify({ nome }) }); await recarregar(); setFormulariosAbertos(true)
  }
  const adicionarCampo = async (formulario: Formulario) => {
    if (!workflow) return
    const rotulo = window.prompt("Nome do campo:", "Descrição")?.trim(); if (!rotulo) return
    const tipo = (window.prompt("Tipo: TEXTO, TEXTO_LONGO, NUMERO, MOEDA, DATA, LISTA, ARQUIVO, USUARIO ou SETOR", "TEXTO") || "TEXTO").toUpperCase()
    const obrigatorio = window.confirm("Este campo é obrigatório?")
    await requisicao(`${BASE}/${workflow.id}/formularios/${formulario.id}/campos`, { method: "POST", body: JSON.stringify({ rotulo, tipo, obrigatorio }) }); await recarregar()
  }
  const publicar = async () => {
    if (!workflow) return
    try { await requisicao(`${BASE}/${workflow.id}`, { method: "PATCH", body: JSON.stringify({ status: "PUBLICADO" }) }); toast.success("Processo publicado"); await recarregar() } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao publicar") }
  }
  const carregarExecucoes = async () => {
    try { setExecucoes(await requisicao(`${BASE}/execucoes/listar`)) } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar execuções") }
  }
  const iniciarTeste = async () => {
    if (!workflow) return
    if (workflow.status !== "PUBLICADO") return toast.error("Publique o processo antes de executar")
    const titulo = window.prompt("Nome desta execução de teste:", `Teste — ${workflow.nome}`)?.trim()
    if (!titulo) return
    try { const criada = await requisicao(`${BASE}/${workflow.id}/iniciar`, { method: "POST", body: JSON.stringify({ titulo, dados: { demonstracao: true } }) }); toast.success(`${criada.numero} iniciada com sucesso`) } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao iniciar execução") }
  }
  const abrirExecucao = async (id: string) => {
    try { setExecucao(await requisicao(`${BASE}/execucoes/${id}`)) } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao abrir execução") }
  }
  const concluirTarefa = async (tarefa: TarefaExecucao) => {
    if (!execucao) return
    const observacao = window.prompt("Observação da conclusão (opcional):", "")
    if (observacao === null) return
    try { setExecucao(await requisicao(`${BASE}/execucoes/${execucao.id}/tarefas/${tarefa.id}/concluir`, { method: "POST", body: JSON.stringify({ resposta: { observacao } }) })); toast.success("Tarefa concluída; o processo avançou") } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao concluir tarefa") }
  }

  if (carregando && !workflow) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>

  if (!workflow) return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><Link href="/orgao/configuracoes" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" />Configurações</Link><h1 className="mt-2 text-3xl font-bold">Gestão de processos e workflow</h1><p className="mt-1 text-slate-600">Crie processos com formulários, aprovações, documentos e automações.</p></div><Button variant="outline" onClick={execucoes === null ? carregarExecucoes : () => setExecucoes(null)}>{execucoes === null ? "Ver execuções" : "Voltar aos modelos"}</Button></div>
    {execucoes !== null && !execucao && <Card><CardContent className="space-y-2 p-5"><h2 className="mb-4 text-lg font-semibold">Execuções dos processos</h2>{execucoes.length === 0 && <p className="text-sm text-slate-500">Nenhuma execução iniciada.</p>}{execucoes.map((item) => <button key={item.id} onClick={() => abrirExecucao(item.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left hover:border-blue-500 hover:bg-blue-50"><div><strong>{item.numero} · {item.titulo}</strong><p className="text-xs text-slate-500">Iniciada em {new Date(item.created_at).toLocaleString("pt-BR")}</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{item.status}</span></button>)}</CardContent></Card>}
    {execucoes !== null && execucao && <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><Card><CardContent className="p-5"><button onClick={() => setExecucao(null)} className="mb-3 text-sm text-blue-700 hover:underline">← Todas as execuções</button><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{execucao.numero}</h2><p className="text-slate-600">{execucao.titulo}</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{execucao.status}</span></div><h3 className="mt-6 font-semibold">Tarefas</h3><div className="mt-3 space-y-3">{execucao.tarefas.map((tarefa, indice) => <div key={tarefa.id} className={`rounded-lg border p-4 ${tarefa.status === "ABERTA" ? "border-blue-300 bg-blue-50" : "bg-slate-50"}`}><div className="flex items-center justify-between"><strong>Tarefa {indice + 1}</strong><span className="text-xs font-semibold">{tarefa.status}</span></div><p className="mt-1 text-sm text-slate-600">Responsável: {tarefa.responsavel_tipo}{tarefa.responsaveis?.length ? ` · ${tarefa.responsaveis.length} participante(s)` : ""}</p>{tarefa.prazo_em && <p className="text-sm text-slate-600">Prazo: {new Date(tarefa.prazo_em).toLocaleDateString("pt-BR")}</p>}{tarefa.status === "ABERTA" && <Button className="mt-3" size="sm" onClick={() => concluirTarefa(tarefa)}>Concluir e avançar</Button>}</div>)}</div></CardContent></Card><Card><CardContent className="p-5"><h3 className="font-semibold">Linha do tempo</h3><div className="mt-4 space-y-4">{execucao.historico.map((item) => <div key={item.id} className="relative border-l-2 border-blue-200 pl-4"><span className="absolute -left-1.5 top-1 h-2.5 w-2.5 rounded-full bg-blue-600" /><p className="text-sm font-medium">{item.descricao}</p><p className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString("pt-BR")}</p></div>)}</div></CardContent></Card></div>}
    {execucoes === null && <>
    <Card><CardContent className="flex flex-wrap gap-3 p-5"><Input className="max-w-md" placeholder="Ex.: Solicitação de compras" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} /><Button onClick={criar} disabled={criando}>{criando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Criar processo</Button><Button variant="outline" onClick={criarModeloAditivo} disabled={criando}><FileText className="mr-2 h-4 w-4" />Usar modelo: Solicitação de aditivo</Button></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3">{lista.map((item) => <button key={item.id} onClick={() => abrir(item.id)} className="rounded-xl border bg-white p-5 text-left shadow-sm hover:border-blue-500"><div className="flex items-start justify-between"><GitBranch className="h-7 w-7 text-blue-700" /><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "PUBLICADO" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{item.status}</span></div><h2 className="mt-4 font-semibold text-slate-900">{item.nome}</h2><p className="mt-1 text-sm text-slate-500">Versão {item.versao}</p></button>)}</div></>}
  </div>

  const acoesDoProcesso = workflow.fases.flatMap((fase) =>
    fase.acoes.map((acao) => ({ acao, faseNome: fase.nome })),
  )
  const responsavelDefinido = (acao: Acao) =>
    acao.responsavel_tipo === "SOLICITANTE" ||
    Boolean(acao.responsavel_valor) ||
    Boolean(acao.configuracao?.responsaveis?.length)
  const acoesPendentes = acoesDoProcesso.filter(({ acao }) => !responsavelDefinido(acao))

  return <div className="space-y-5 pb-16">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><button onClick={() => setWorkflow(null)} className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" />Todos os processos</button><h1 className="mt-1 text-2xl font-bold">{workflow.nome}</h1><p className="text-sm text-slate-500">Versão {workflow.versao} · {workflow.status}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setFormulariosAbertos(!formulariosAbertos)}><ClipboardList className="mr-2 h-4 w-4" />Formulários</Button><Button variant="outline" onClick={adicionarFase}><Plus className="mr-2 h-4 w-4" />Fase</Button>{workflow.status === "PUBLICADO" && <Button variant="outline" onClick={iniciarTeste}>Executar teste</Button>}<Button onClick={publicar}>Publicar</Button></div></div>

    {formulariosAbertos && <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Formulários do processo</h2><p className="text-sm text-slate-500">Os campos preenchidos ficam disponíveis para ações e mensagens.</p></div><Button size="sm" onClick={criarFormulario}><Plus className="mr-1 h-4 w-4" />Formulário</Button></div><div className="mt-4 grid gap-3 md:grid-cols-3">{workflow.formularios.map((form) => <div key={form.id} className="rounded-lg border p-4"><div className="flex justify-between"><strong>{form.nome}</strong><button onClick={() => adicionarCampo(form)} className="text-sm text-blue-700">+ Campo</button></div><div className="mt-3 space-y-1">{form.campos.map((campo) => <div key={campo.id} className="rounded bg-slate-50 px-2 py-1 text-sm">{campo.rotulo} <span className="text-xs text-slate-400">{campo.tipo}{campo.obrigatorio ? " · obrigatório" : ""}</span></div>)}</div></div>)}</div></CardContent></Card>}

    <div className="overflow-x-auto pb-4"><div className="flex min-w-max items-start gap-4">{workflow.fases.map((fase) => <section key={fase.id} className="w-80 rounded-xl border border-slate-200 bg-slate-50 shadow-sm"><div className="rounded-t-xl border-b bg-white px-4 py-3" style={{ borderTop: `5px solid ${fase.cor}` }}><div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">{fase.nome}</h2><Settings2 className="h-4 w-4 text-slate-400" /></div><button onClick={() => setFaseMenu(faseMenu === fase.id ? null : fase.id)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><Plus className="h-4 w-4" />AÇÃO</button>{faseMenu === fase.id && <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border bg-white p-2 shadow-lg">{Object.entries(ACAO).map(([tipo, item]) => <button key={tipo} onClick={() => adicionarAcao(fase, tipo as keyof typeof ACAO)} className="rounded p-2 text-left text-xs hover:bg-blue-50"><item.Icone className="mb-1 h-4 w-4" style={{ color: item.cor }} />{item.nome}</button>)}</div>}</div><div className="space-y-3 p-3">{fase.acoes.map((acao) => { const visual = ACAO[acao.tipo as keyof typeof ACAO] ?? ACAO.TAREFA; const Icone = visual.Icone; return <article key={acao.id} className="overflow-hidden rounded-lg border bg-white shadow-sm"><div className="border-l-4 p-3" style={{ borderLeftColor: visual.cor }}><div className="flex gap-2"><Icone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: visual.cor }} /><div><div className="text-xs font-semibold uppercase text-slate-400">{visual.nome}</div><h3 className="font-semibold text-slate-800">{acao.nome}</h3></div></div></div><div className="border-t bg-slate-50 px-3 py-2"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase text-slate-400">Reações</span><button onClick={() => adicionarReacao(acao)} className="text-xs font-semibold text-blue-700">+ REAÇÃO</button></div><div className="mt-2 space-y-1">{acao.reacoes.map((reacao) => { const item = REACAO[reacao.tipo as keyof typeof REACAO]; const RIcone = item?.Icone ?? Bell; return <div key={reacao.id} className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-sm"><RIcone className={`h-4 w-4 ${reacao.tipo === "WHATSAPP" ? "text-green-600" : "text-blue-600"}`} />{reacao.nome}</div> })}</div></div></article>})}{fase.acoes.length === 0 && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-400">Adicione a primeira ação</div>}</div></section>)}<button onClick={adicionarFase} className="flex h-32 w-48 items-center justify-center rounded-xl border-2 border-dashed text-sm font-semibold text-slate-500 hover:border-blue-500 hover:text-blue-700"><Plus className="mr-2 h-4 w-4" />Nova fase</button></div></div>
    <Card className={acoesPendentes.length ? "border-amber-300" : "border-emerald-300"}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Responsáveis das ações</h2>
            <p className="mt-1 text-sm text-slate-500">
              Escolha uma pessoa, várias pessoas, um ou vários setores ou o próprio solicitante.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${acoesPendentes.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
            {acoesPendentes.length ? `${acoesPendentes.length} pendente(s)` : "Tudo configurado"}
          </span>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {acoesDoProcesso.map(({ acao, faseNome }) => {
            const definido = responsavelDefinido(acao)
            return <button
              key={acao.id}
              type="button"
              onClick={() => setAcaoEditando(acao)}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition hover:border-blue-500 hover:bg-blue-50 ${definido ? "bg-white" : "border-amber-300 bg-amber-50"}`}
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-slate-500">{faseNome}</p>
                <p className="truncate text-sm font-semibold text-slate-800">{acao.nome}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${definido ? "bg-emerald-100 text-emerald-700" : "bg-amber-200 text-amber-900"}`}>
                {definido ? "Configurar" : "Definir responsável"}
              </span>
            </button>
          })}
        </div>
      </CardContent>
    </Card>
    {acaoEditando && <PainelAcao workflowId={workflow.id} acao={acaoEditando} formularios={workflow.formularios} aoFechar={() => setAcaoEditando(null)} aoSalvar={recarregar} />}
    {acaoDaReacao && <PainelReacao workflowId={workflow.id} acaoId={acaoDaReacao.id} acaoNome={acaoDaReacao.nome} aoFechar={() => setAcaoDaReacao(null)} aoSalvar={recarregar} />}
    <div className="fixed bottom-5 right-5 rounded-full bg-green-600 p-3 text-white shadow-lg" title="WhatsApp integrado"><MessageCircle className="h-5 w-5" /></div>
  </div>
}
