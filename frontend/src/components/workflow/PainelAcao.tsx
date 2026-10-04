"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"

type Acao = { id: string; nome: string; tipo: string; formulario_id?: string | null; responsavel_tipo?: string; responsavel_valor?: string | null; prazo_dias_uteis: number | null; configuracao?: { responsaveis?: string[]; regra_conclusao?: string; quantidade_minima?: number } | null }
type Formulario = { id: string; nome: string }

export function PainelAcao({ workflowId, acao, formularios, aoFechar, aoSalvar }: { workflowId: string; acao: Acao; formularios: Formulario[]; aoFechar: () => void; aoSalvar: () => Promise<void> }) {
  const [nome, setNome] = useState(acao.nome)
  const [tipoResponsavel, setTipoResponsavel] = useState(acao.responsavel_tipo || "USUARIO")
  const [responsaveis, setResponsaveis] = useState<string[]>(acao.configuracao?.responsaveis ?? (acao.responsavel_valor ? [acao.responsavel_valor] : []))
  const [regra, setRegra] = useState(acao.configuracao?.regra_conclusao || "QUALQUER")
  const [minimo, setMinimo] = useState(acao.configuracao?.quantidade_minima ?? 1)
  const [prazo, setPrazo] = useState<string>(acao.prazo_dias_uteis?.toString() ?? "")
  const [formulario, setFormulario] = useState(acao.formulario_id ?? "")
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string }>>([])
  const [setores, setSetores] = useState<Array<{ id: string; nome: string }>>([])
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true)
  const [erroOpcoes, setErroOpcoes] = useState("")
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setCarregandoOpcoes(true)
    setErroOpcoes("")
    Promise.all([authFetch(`${API_URL}/api/fase-interna/configuracao`), authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios`)]).then(async ([c, u]) => {
      if (!c.ok || !u.ok) throw new Error("Não foi possível carregar pessoas e setores")
      setSetores((await c.json()).setores ?? [])
      setUsuarios((await u.json()).filter((x: { ativo?: boolean }) => x.ativo !== false))
    }).catch(() => setErroOpcoes("Não foi possível carregar pessoas e setores. Feche e abra este painel para tentar novamente."))
      .finally(() => setCarregandoOpcoes(false))
  }, [])

  const ehAprovacao = acao.tipo === "APROVACAO"
  const opcoes = tipoResponsavel === "SETOR" ? setores : usuarios
  const nomesSelecionados = opcoes.filter((item) => responsaveis.includes(item.id)).map((item) => item.nome)
  const alternar = (id: string) => setResponsaveis((atuais) => atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id])
  const salvar = async () => {
    if (!nome.trim()) return toast.error("Informe o nome da ação")
    if (tipoResponsavel !== "SOLICITANTE" && !responsaveis.length) return toast.error("Escolha ao menos um responsável")
    if (regra === "MINIMO" && minimo > responsaveis.length) return toast.error("A quantidade mínima não pode superar os responsáveis")
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/workflows/${workflowId}/acoes/${acao.id}`, { method: "PATCH", body: JSON.stringify({ nome, formulario_id: formulario || null, prazo_dias_uteis: prazo === "" ? null : Number(prazo), responsavel_tipo: tipoResponsavel, responsavel_valor: responsaveis.length === 1 ? responsaveis[0] : null, responsaveis, regra_conclusao: regra, quantidade_minima: minimo }) })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Não foi possível salvar")
      await aoSalvar(); aoFechar(); toast.success("Ação configurada")
    } catch (e) { toast.error(e instanceof TypeError && e.message === "Failed to fetch" ? "A API está reiniciando ou indisponível. Aguarde alguns segundos e tente novamente." : e instanceof Error ? e.message : "Erro ao salvar") } finally { setSalvando(false) }
  }

  return <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l bg-white p-6 shadow-2xl">
    <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-blue-700">{acao.tipo}</p><h2 className="text-xl font-bold">Configurar ação</h2></div><button onClick={aoFechar}><X className="h-5 w-5" /></button></div>
    <div className="mt-6 space-y-5">
      <label className="block text-sm font-medium">Nome<Input className="mt-1" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      {acao.tipo === "FORMULARIO" && <label className="block text-sm font-medium">Formulário<select className="mt-1 h-10 w-full rounded-md border px-3" value={formulario} onChange={(e) => setFormulario(e.target.value)}><option value="">Selecione</option>{formularios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>}
      <label className="block text-sm font-medium">{ehAprovacao ? "Quem aprova?" : "Responsável"}<select className="mt-1 h-10 w-full rounded-md border px-3" value={tipoResponsavel} onChange={(e) => { setTipoResponsavel(e.target.value); setResponsaveis([]) }}><option value="USUARIO">Uma ou várias pessoas</option><option value="SETOR">Um ou vários setores</option><option value="SOLICITANTE">Solicitante</option></select></label>
      {tipoResponsavel !== "SOLICITANTE" && <div><p className="text-sm font-medium">{ehAprovacao ? "Selecione os aprovadores" : "Quem participa?"}</p><div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">{opcoes.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50"><input type="checkbox" checked={responsaveis.includes(item.id)} onChange={() => alternar(item.id)} />{item.nome}</label>)}{carregandoOpcoes && <p className="p-2 text-sm text-slate-500">Carregando opções...</p>}{!carregandoOpcoes && !opcoes.length && !erroOpcoes && <p className="p-2 text-sm text-slate-500">Nenhuma opção cadastrada.</p>}{erroOpcoes && <p className="p-2 text-sm text-red-600">{erroOpcoes}</p>}</div>{nomesSelecionados.length > 0 && <p className="mt-2 text-xs text-blue-700">Selecionado(s): {nomesSelecionados.join(", ")}</p>}</div>}
      {responsaveis.length > 1 && <><label className="block text-sm font-medium">Como concluir?<select className="mt-1 h-10 w-full rounded-md border px-3" value={regra} onChange={(e) => setRegra(e.target.value)}><option value="QUALQUER">Qualquer pessoa pode concluir</option><option value="TODOS">Todos precisam concluir</option><option value="MINIMO">Quantidade mínima</option><option value="SEQUENCIAL">Um após o outro</option></select></label>{regra === "MINIMO" && <label className="block text-sm font-medium">Quantidade mínima<Input className="mt-1" type="number" min={1} max={responsaveis.length} value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} /></label>}</>}
      <label className="block text-sm font-medium">Prazo em dias úteis<Input className="mt-1" type="number" min={0} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
      <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={aoFechar}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar ação</Button></div>
    </div>
  </aside>
}
