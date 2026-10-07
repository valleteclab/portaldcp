"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"

type ConfigAvisos = { canais: string[]; teams_canal_id?: string | null; chegada: boolean; vespera_prazo: boolean }
type DestinatarioNotificar = { tipo: "SETOR" | "USUARIO" | "SOLICITANTE"; id?: string }
type ConfigNotificar = { destinatarios: DestinatarioNotificar[]; canais: string[]; teams_canal_id?: string | null; mensagem: string }
type Acao = { id: string; nome: string; tipo: string; formulario_id?: string | null; responsavel_tipo?: string; responsavel_valor?: string | null; prazo_dias_uteis: number | null; configuracao?: { responsaveis?: string[]; regra_conclusao?: string; quantidade_minima?: number; avisos?: ConfigAvisos; notificar?: ConfigNotificar } | null }
type Formulario = { id: string; nome: string }
type TeamsCanal = { id: string; nome: string; webhook_mascarado: string }

const CANAIS_AVISO = [
  { id: "WHATSAPP", rotulo: "WhatsApp" },
  { id: "EMAIL", rotulo: "E-mail" },
  { id: "TEAMS", rotulo: "Microsoft Teams" },
] as const

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
  const [teamsCanais, setTeamsCanais] = useState<TeamsCanal[]>([])
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true)
  const [erroOpcoes, setErroOpcoes] = useState("")
  const [salvando, setSalvando] = useState(false)

  const ehNotificar = acao.tipo === "NOTIFICAR"
  const [avisoCanais, setAvisoCanais] = useState<string[]>(acao.configuracao?.avisos?.canais ?? [])
  const [avisoTeamsCanal, setAvisoTeamsCanal] = useState(acao.configuracao?.avisos?.teams_canal_id ?? "")
  const [avisoChegada, setAvisoChegada] = useState(acao.configuracao?.avisos?.chegada ?? true)
  const [avisoVespera, setAvisoVespera] = useState(acao.configuracao?.avisos?.vespera_prazo ?? false)

  const [notifDestinatarios, setNotifDestinatarios] = useState<DestinatarioNotificar[]>(acao.configuracao?.notificar?.destinatarios ?? [])
  const [notifCanais, setNotifCanais] = useState<string[]>(acao.configuracao?.notificar?.canais ?? [])
  const [notifTeamsCanal, setNotifTeamsCanal] = useState(acao.configuracao?.notificar?.teams_canal_id ?? "")
  const [notifMensagem, setNotifMensagem] = useState(acao.configuracao?.notificar?.mensagem ?? "")

  useEffect(() => {
    setCarregandoOpcoes(true)
    setErroOpcoes("")
    Promise.all([
      authFetch(`${API_URL}/api/fase-interna/configuracao`),
      authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios`),
      authFetch(`${API_URL}/api/workflows/teams-canais`),
    ]).then(async ([c, u, t]) => {
      if (!c.ok || !u.ok) throw new Error("Não foi possível carregar pessoas e setores")
      setSetores((await c.json()).setores ?? [])
      setUsuarios((await u.json()).filter((x: { ativo?: boolean }) => x.ativo !== false))
      setTeamsCanais(t.ok ? await t.json() : [])
    }).catch(() => setErroOpcoes("Não foi possível carregar pessoas e setores. Feche e abra este painel para tentar novamente."))
      .finally(() => setCarregandoOpcoes(false))
  }, [])

  const alternarCanal = (lista: string[], setLista: (v: string[]) => void, canal: string) =>
    setLista(lista.includes(canal) ? lista.filter((c) => c !== canal) : [...lista, canal])

  const adicionarDestinatarioNotif = (tipo: DestinatarioNotificar["tipo"], id?: string) => {
    if (tipo !== "SOLICITANTE" && notifDestinatarios.some((d) => d.tipo === tipo && d.id === id)) return
    setNotifDestinatarios([...notifDestinatarios.filter((d) => !(tipo === "SOLICITANTE" && d.tipo === "SOLICITANTE")), { tipo, id }])
  }
  const removerDestinatarioNotif = (idx: number) => setNotifDestinatarios(notifDestinatarios.filter((_, i) => i !== idx))
  const nomeDestinatario = (d: DestinatarioNotificar) => {
    if (d.tipo === "SOLICITANTE") return "Solicitante"
    const opcoes = d.tipo === "SETOR" ? setores : usuarios
    return opcoes.find((o) => o.id === d.id)?.nome ?? d.id
  }

  const ehAprovacao = acao.tipo === "APROVACAO"
  const opcoes = tipoResponsavel === "SETOR" ? setores : usuarios
  const nomesSelecionados = opcoes.filter((item) => responsaveis.includes(item.id)).map((item) => item.nome)
  const alternar = (id: string) => setResponsaveis((atuais) => atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id])
  const salvar = async () => {
    if (!nome.trim()) return toast.error("Informe o nome da ação")
    if (!ehNotificar) {
      if (tipoResponsavel !== "SOLICITANTE" && !responsaveis.length) return toast.error("Escolha ao menos um responsável")
      if (regra === "MINIMO" && minimo > responsaveis.length) return toast.error("A quantidade mínima não pode superar os responsáveis")
    }
    if (avisoCanais.includes("TEAMS") && !avisoTeamsCanal) return toast.error("Selecione o canal do Teams para os avisos desta etapa")
    if (ehNotificar) {
      if (!notifDestinatarios.length) return toast.error("Informe ao menos um destinatário do aviso")
      if (!notifCanais.length) return toast.error("Escolha ao menos um canal do aviso")
      if (notifCanais.includes("TEAMS") && !notifTeamsCanal) return toast.error("Selecione o canal do Teams")
      if (!notifMensagem.trim()) return toast.error("Informe a mensagem do aviso")
    }
    setSalvando(true)
    try {
      const corpo: Record<string, unknown> = { nome, formulario_id: formulario || null, prazo_dias_uteis: prazo === "" ? null : Number(prazo) }
      if (!ehNotificar) Object.assign(corpo, { responsavel_tipo: tipoResponsavel, responsavel_valor: responsaveis.length === 1 ? responsaveis[0] : null, responsaveis, regra_conclusao: regra, quantidade_minima: minimo })
      if (avisoCanais.length || acao.configuracao?.avisos) corpo.avisos = { canais: avisoCanais, teams_canal_id: avisoCanais.includes("TEAMS") ? avisoTeamsCanal : null, chegada: avisoChegada, vespera_prazo: avisoVespera }
      if (ehNotificar) corpo.notificar = { destinatarios: notifDestinatarios, canais: notifCanais, teams_canal_id: notifCanais.includes("TEAMS") ? notifTeamsCanal : null, mensagem: notifMensagem }
      const r = await authFetch(`${API_URL}/api/workflows/${workflowId}/acoes/${acao.id}`, { method: "PATCH", body: JSON.stringify(corpo) })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Não foi possível salvar")
      await aoSalvar(); aoFechar(); toast.success("Ação configurada")
    } catch (e) { toast.error(e instanceof TypeError && e.message === "Failed to fetch" ? "A API está reiniciando ou indisponível. Aguarde alguns segundos e tente novamente." : e instanceof Error ? e.message : "Erro ao salvar") } finally { setSalvando(false) }
  }

  return <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l bg-white p-6 shadow-2xl">
    <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-blue-700">{acao.tipo}</p><h2 className="text-xl font-bold">Configurar ação</h2></div><button onClick={aoFechar}><X className="h-5 w-5" /></button></div>
    <div className="mt-6 space-y-5">
      <label className="block text-sm font-medium">Nome<Input className="mt-1" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      {acao.tipo === "FORMULARIO" && <label className="block text-sm font-medium">Formulário<select className="mt-1 h-10 w-full rounded-md border px-3" value={formulario} onChange={(e) => setFormulario(e.target.value)}><option value="">Selecione</option>{formularios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>}
      {!ehNotificar && <label className="block text-sm font-medium">{ehAprovacao ? "Quem aprova?" : "Responsável"}<select className="mt-1 h-10 w-full rounded-md border px-3" value={tipoResponsavel} onChange={(e) => { setTipoResponsavel(e.target.value); setResponsaveis([]) }}><option value="USUARIO">Uma ou várias pessoas</option><option value="SETOR">Um ou vários setores</option><option value="SOLICITANTE">Solicitante</option></select></label>}
      {!ehNotificar && tipoResponsavel !== "SOLICITANTE" && <div><p className="text-sm font-medium">{ehAprovacao ? "Selecione os aprovadores" : "Quem participa?"}</p><div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">{opcoes.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50"><input type="checkbox" checked={responsaveis.includes(item.id)} onChange={() => alternar(item.id)} />{item.nome}</label>)}{carregandoOpcoes && <p className="p-2 text-sm text-slate-500">Carregando opções...</p>}{!carregandoOpcoes && !opcoes.length && !erroOpcoes && <p className="p-2 text-sm text-slate-500">Nenhuma opção cadastrada.</p>}{erroOpcoes && <p className="p-2 text-sm text-red-600">{erroOpcoes}</p>}</div>{nomesSelecionados.length > 0 && <p className="mt-2 text-xs text-blue-700">Selecionado(s): {nomesSelecionados.join(", ")}</p>}</div>}
      {!ehNotificar && responsaveis.length > 1 && <><label className="block text-sm font-medium">Como concluir?<select className="mt-1 h-10 w-full rounded-md border px-3" value={regra} onChange={(e) => setRegra(e.target.value)}><option value="QUALQUER">Qualquer pessoa pode concluir</option><option value="TODOS">Todos precisam concluir</option><option value="MINIMO">Quantidade mínima</option><option value="SEQUENCIAL">Um após o outro</option></select></label>{regra === "MINIMO" && <label className="block text-sm font-medium">Quantidade mínima<Input className="mt-1" type="number" min={1} max={responsaveis.length} value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} /></label>}</>}
      {!ehNotificar && <label className="block text-sm font-medium">Prazo em dias úteis<Input className="mt-1" type="number" min={0} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>}

      {ehNotificar && <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">Destinatários do aviso</p>
        <div className="flex flex-wrap gap-2">
          <select className="h-9 rounded-md border px-2 text-sm" onChange={(e) => { const [tipo, id] = e.target.value.split(":"); if (tipo) adicionarDestinatarioNotif(tipo as DestinatarioNotificar["tipo"], id || undefined); e.target.value = "" }}>
            <option value="">Adicionar destinatário...</option>
            <option value="SOLICITANTE:">Solicitante do processo</option>
            {setores.map((s) => <option key={s.id} value={`SETOR:${s.id}`}>Setor: {s.nome}</option>)}
            {usuarios.map((u) => <option key={u.id} value={`USUARIO:${u.id}`}>Pessoa: {u.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1">{notifDestinatarios.map((d, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs shadow">{nomeDestinatario(d)}<button onClick={() => removerDestinatarioNotif(i)}><X className="h-3 w-3" /></button></span>)}{!notifDestinatarios.length && <p className="text-xs text-slate-400">Nenhum destinatário adicionado.</p>}</div>
        <p className="text-sm font-semibold text-slate-800">Canais</p>
        <div className="flex flex-wrap gap-3">{CANAIS_AVISO.map((c) => <label key={c.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={notifCanais.includes(c.id)} onChange={() => alternarCanal(notifCanais, setNotifCanais, c.id)} />{c.rotulo}</label>)}</div>
        {notifCanais.includes("TEAMS") && <select className="h-9 w-full rounded-md border px-2 text-sm" value={notifTeamsCanal} onChange={(e) => setNotifTeamsCanal(e.target.value)}><option value="">Canal do Teams...</option>{teamsCanais.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
        <label className="block text-sm font-medium">Mensagem<textarea className="mt-1 w-full rounded-md border p-2 text-sm" rows={3} value={notifMensagem} onChange={(e) => setNotifMensagem(e.target.value)} placeholder="Ex.: Favor regularizar a pendência apontada no parecer." /></label>
      </div>}

      <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">Avisos desta etapa</p>
        <p className="text-xs text-slate-500">Quando o processo chegar e 1 dia antes do prazo</p>
        <div className="flex flex-wrap gap-3">{CANAIS_AVISO.map((c) => <label key={c.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={avisoCanais.includes(c.id)} onChange={() => alternarCanal(avisoCanais, setAvisoCanais, c.id)} />{c.rotulo}</label>)}</div>
        {avisoCanais.includes("TEAMS") && <select className="h-9 w-full rounded-md border px-2 text-sm" value={avisoTeamsCanal} onChange={(e) => setAvisoTeamsCanal(e.target.value)}><option value="">Canal do Teams...</option>{teamsCanais.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
        {avisoCanais.includes("TEAMS") && !teamsCanais.length && <p className="text-xs text-amber-700">Nenhum canal do Teams cadastrado — configure em &quot;Canais de aviso do órgão&quot;.</p>}
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={avisoChegada} onChange={(e) => setAvisoChegada(e.target.checked)} />Na chegada</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={avisoVespera} onChange={(e) => setAvisoVespera(e.target.checked)} />1 dia antes do prazo</label>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={aoFechar}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar ação</Button></div>
    </div>
  </aside>
}
