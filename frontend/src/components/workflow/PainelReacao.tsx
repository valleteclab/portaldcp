"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"

const TIPOS = [
  ["EMAIL", "Enviar e-mail"], ["WHATSAPP", "Enviar WhatsApp"], ["NOTIFICACAO", "Notificação interna"],
  ["GERAR_DOCUMENTO", "Gerar documento"], ["AVANCAR", "Avançar no fluxo"],
] as const

export function PainelReacao({ workflowId, acaoId, acaoNome, aoFechar, aoSalvar }: { workflowId: string; acaoId: string; acaoNome: string; aoFechar: () => void; aoSalvar: () => Promise<void> }) {
  const [tipo, setTipo] = useState("EMAIL")
  const [nome, setNome] = useState("Enviar e-mail")
  const [destinatario, setDestinatario] = useState("{{responsavel.email}}")
  const [assunto, setAssunto] = useState(`Tarefa: ${acaoNome}`)
  const [mensagem, setMensagem] = useState("Você possui uma nova tarefa no Portal DCP: {{link_tarefa}}")
  const [salvando, setSalvando] = useState(false)
  const trocarTipo = (valor: string) => {
    setTipo(valor); setNome(TIPOS.find(([id]) => id === valor)?.[1] ?? valor)
    if (valor === "WHATSAPP") setDestinatario("{{responsavel.telefone}}")
    if (valor === "EMAIL") setDestinatario("{{responsavel.email}}")
  }
  const salvar = async () => {
    if (!nome.trim()) return toast.error("Informe o nome da reação")
    if (["EMAIL", "WHATSAPP"].includes(tipo) && (!destinatario.trim() || !mensagem.trim())) return toast.error("Informe destinatário e mensagem")
    setSalvando(true)
    try {
      const configuracao = { destinatario, assunto: tipo === "EMAIL" ? assunto : undefined, mensagem }
      const r = await authFetch(`${API_URL}/api/workflows/${workflowId}/acoes/${acaoId}/reacoes`, { method: "POST", body: JSON.stringify({ tipo, nome, configuracao }) })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Não foi possível salvar")
      await aoSalvar(); aoFechar(); toast.success("Reação adicionada")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar") } finally { setSalvando(false) }
  }
  return <aside className="fixed inset-y-0 right-0 z-[60] w-full max-w-md overflow-y-auto border-l bg-white p-6 shadow-2xl">
    <div className="flex justify-between"><div><p className="text-xs font-semibold uppercase text-blue-700">Automação</p><h2 className="text-xl font-bold">Adicionar reação</h2></div><button onClick={aoFechar}><X className="h-5 w-5" /></button></div>
    <div className="mt-6 space-y-5">
      <label className="block text-sm font-medium">O que deve acontecer?<select className="mt-1 h-10 w-full rounded-md border px-3" value={tipo} onChange={(e) => trocarTipo(e.target.value)}>{TIPOS.map(([id, rotulo]) => <option key={id} value={id}>{rotulo}</option>)}</select></label>
      <label className="block text-sm font-medium">Nome<Input className="mt-1" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      {["EMAIL", "WHATSAPP"].includes(tipo) && <><label className="block text-sm font-medium">Destinatário<Input className="mt-1" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} /><span className="text-xs text-slate-500">Use variáveis como {"{{responsavel.email}}"} ou {"{{solicitante.telefone}}"}.</span></label>{tipo === "EMAIL" && <label className="block text-sm font-medium">Assunto<Input className="mt-1" value={assunto} onChange={(e) => setAssunto(e.target.value)} /></label>}<label className="block text-sm font-medium">Mensagem<textarea className="mt-1 min-h-32 w-full rounded-md border p-3" value={mensagem} onChange={(e) => setMensagem(e.target.value)} /></label></>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={aoFechar}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar reação</Button></div>
    </div>
  </aside>
}
