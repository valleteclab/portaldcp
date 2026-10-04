"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Clock3, GitBranch, Loader2, Play, Plus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"

type Modelo = { id: string; nome: string; descricao: string | null; status: string; versao: number }
type Execucao = { id: string; workflow_id: string; numero: string; titulo: string; status: string; created_at: string; updated_at: string }

const BASE = `${API_URL}/api/workflows`

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await authFetch(url, init)
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(corpo?.message || `Erro ${resposta.status}`)
  return corpo
}

export default function CentralWorkflowsPage() {
  const router = useRouter()
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [modeloId, setModeloId] = useState("")
  const [titulo, setTitulo] = useState("")
  const [iniciando, setIniciando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [listaModelos, listaExecucoes] = await Promise.all([
        api<Modelo[]>(BASE),
        api<Execucao[]>(`${BASE}/execucoes/listar`),
      ])
      setModelos(listaModelos.filter((item) => item.status === "PUBLICADO"))
      setExecucoes(listaExecucoes)
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível carregar os processos")
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => void carregar(), [carregar])

  const escolherModelo = (id: string) => {
    setModeloId(id)
    const modelo = modelos.find((item) => item.id === id)
    if (modelo && !titulo) setTitulo(modelo.nome)
  }

  const iniciar = async () => {
    if (!modeloId) return toast.error("Escolha o processo que deseja iniciar")
    if (!titulo.trim()) return toast.error("Informe um assunto para o processo")
    setIniciando(true)
    try {
      const criada = await api<Execucao>(`${BASE}/${modeloId}/iniciar`, {
        method: "POST",
        body: JSON.stringify({ titulo: titulo.trim() }),
      })
      setAberto(false)
      router.push(`/orgao/workflows/${criada.id}`)
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível iniciar o processo")
    } finally {
      setIniciando(false)
    }
  }

  const andamento = execucoes.filter((item) => item.status === "EM_ANDAMENTO")
  const finalizadas = execucoes.filter((item) => item.status !== "EM_ANDAMENTO")

  return <div className="mx-auto max-w-6xl space-y-6 pb-16">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/orgao" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" />Início</Link>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Processos de trabalho</h1>
        <p className="mt-1 text-slate-600">Inicie processos e execute as tarefas encaminhadas para você ou para seu setor.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" asChild><Link href="/orgao/configuracoes/fluxos"><GitBranch className="mr-2 h-4 w-4" />Configurar modelos</Link></Button>
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Iniciar processo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Iniciar um processo</DialogTitle><DialogDescription>Escolha um modelo publicado e informe o assunto desta execução.</DialogDescription></DialogHeader>
            <div className="space-y-4 pt-2">
              <label className="block text-sm font-medium">Processo<select className="mt-1 h-10 w-full rounded-md border bg-white px-3" value={modeloId} onChange={(e) => escolherModelo(e.target.value)}><option value="">Selecione</option>{modelos.map((modelo) => <option key={modelo.id} value={modelo.id}>{modelo.nome}</option>)}</select></label>
              <label className="block text-sm font-medium">Assunto<Input className="mt-1" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Aditivo do Contrato nº 12/2026" /></label>
              {!modelos.length && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Nenhum modelo publicado. Publique um modelo na configuração antes de iniciar.</p>}
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button><Button onClick={iniciar} disabled={iniciando || !modelos.length}>{iniciando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Iniciar</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>

    {carregando ? <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-blue-700" /></div> : <>
      <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Em andamento</h2><p className="text-sm text-slate-500">Abra um processo para trabalhar na etapa atual.</p></div><Badge variant="secondary">{andamento.length}</Badge></div>
        {andamento.length === 0 ? <Card><CardContent className="py-10 text-center text-slate-500">Nenhum processo em andamento.</CardContent></Card> : <div className="grid gap-3 md:grid-cols-2">{andamento.map((item) => <Card key={item.id} className="transition hover:border-blue-400 hover:shadow-sm"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-blue-700">{item.numero}</p><CardTitle className="mt-1 text-base">{item.titulo}</CardTitle></div><Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Em andamento</Badge></div></CardHeader><CardContent className="flex items-center justify-between pt-2"><p className="flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />Atualizado em {new Date(item.updated_at).toLocaleString("pt-BR")}</p><Button size="sm" asChild><Link href={`/orgao/workflows/${item.id}`}><Play className="mr-1 h-4 w-4" />Abrir</Link></Button></CardContent></Card>)}</div>}
      </section>

      {finalizadas.length > 0 && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Concluídos</h2><Badge variant="outline">{finalizadas.length}</Badge></div><Card><CardContent className="divide-y p-0">{finalizadas.map((item) => <Link key={item.id} href={`/orgao/workflows/${item.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"><div><p className="text-xs text-slate-500">{item.numero}</p><p className="font-medium text-slate-800">{item.titulo}</p></div><Badge variant="outline">Concluído</Badge></Link>)}</CardContent></Card></section>}
    </>}
  </div>
}
