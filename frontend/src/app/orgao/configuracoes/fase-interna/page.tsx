"use client"

/**
 * CONFIGURAÇÃO DA FASE INTERNA DO ÓRGÃO (Entrega 2).
 *  - Modo: SIMPLES (padrão — uma pessoa pode fazer tudo; as tarefas vão para
 *    o agente do processo) ou POR SETOR (cada etapa vai para o papel/setor).
 *  - Controle interno: etapa opcional entre o parecer e a publicação.
 *  - Responsável e prazo (dias úteis) por etapa — modelo Portaria 089/2024.
 *  - Papéis funcionais e setor de cada usuário (não mudam as permissões de
 *    sistema — Administrador/Pregoeiro/Equipe de apoio continuam iguais).
 * Só o administrador do órgão altera. Fonte: /api/fase-interna/configuracao.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"
import { ROTULO_PAPEL } from "@/lib/tarefas"

interface PassoConfig {
  passo: string
  etapa: string
  etapa_titulo: string
  titulo: string
  papel_padrao: string
  prazo_padrao: number | null
}

interface Configuracao {
  modo: "SIMPLES" | "POR_SETOR"
  controle_interno_ativo: boolean
  responsaveis: Record<string, { papel: string | null; setor_id: string | null }>
  prazos: Record<string, number | null>
  padrao: boolean
  setores: Array<{ id: string; nome: string; codigo: string }>
  papeis: Array<{ codigo: string; rotulo: string }>
  passos: PassoConfig[]
}

interface UsuarioPapel {
  id: string
  nome: string
  email: string
  cargo: string | null
  role: string
  ativo: boolean
  setor_id: string | null
  papeis: string[]
}

const ROTULO_ROLE: Record<string, string> = { ADMIN: "Administrador", PREGOEIRO: "Pregoeiro/agente", EQUIPE_APOIO: "Equipe de apoio" }

function ehAdminDoOrgao(): boolean {
  try {
    const u = localStorage.getItem("usuario")
    if (!u) return true // login do próprio órgão
    return JSON.parse(u)?.role === "ADMIN"
  } catch {
    return false
  }
}

async function lerErro(r: Response): Promise<string> {
  const j = await r.json().catch(() => null)
  return j?.message ? (Array.isArray(j.message) ? j.message.join(" ") : j.message) : `HTTP ${r.status}`
}

export default function ConfiguracaoFaseInternaPage() {
  const [cfg, setCfg] = useState<Configuracao | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioPapel[]>([])
  const [salvando, setSalvando] = useState(false)
  const [salvandoUsuario, setSalvandoUsuario] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)

  const carregar = useCallback(async () => {
    const [c, u] = await Promise.all([
      authFetch(`${API_URL}/api/fase-interna/configuracao`),
      authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios`),
    ])
    if (c.ok) setCfg(await c.json())
    else toast.error(`Configuração: ${await lerErro(c)}`)
    if (u.ok) setUsuarios(await u.json())
  }, [])

  useEffect(() => {
    setAdmin(ehAdminDoOrgao())
    carregar()
  }, [carregar])

  const passosVisiveis = useMemo(
    () => (cfg?.passos ?? []).filter((p) => p.passo !== "CONTROLE_INTERNO" || cfg?.controle_interno_ativo),
    [cfg],
  )

  if (!cfg) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" aria-label="Carregando" />
      </div>
    )
  }

  const alterarResponsavel = (passo: string, campo: "papel" | "setor_id", valor: string) =>
    setCfg({ ...cfg, responsaveis: { ...cfg.responsaveis, [passo]: { ...cfg.responsaveis[passo], [campo]: valor || null } } })

  const alterarPrazo = (passo: string, valor: string) =>
    setCfg({ ...cfg, prazos: { ...cfg.prazos, [passo]: valor === "" ? null : Math.max(0, Math.floor(Number(valor))) } })

  const aplicarModelo089 = () => {
    setCfg({
      ...cfg,
      responsaveis: Object.fromEntries(cfg.passos.map((p) => [p.passo, { papel: p.papel_padrao, setor_id: null }])),
      prazos: Object.fromEntries(cfg.passos.map((p) => [p.passo, p.prazo_padrao])),
    })
    toast.info("Modelo da Portaria 089/2024 (Câmara de LEM) aplicado — confira e salve.")
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/configuracao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: cfg.modo, controle_interno_ativo: cfg.controle_interno_ativo, responsaveis: cfg.responsaveis, prazos: cfg.prazos }),
      })
      if (!r.ok) throw new Error(await lerErro(r))
      setCfg(await r.json())
      toast.success("Configuração salva. As tarefas abertas foram ajustadas.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const salvarUsuario = async (u: UsuarioPapel) => {
    setSalvandoUsuario(u.id)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papeis: u.papeis, setor_id: u.setor_id }),
      })
      if (!r.ok) throw new Error(await lerErro(r))
      toast.success(`Papéis de ${u.nome} salvos`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvandoUsuario(null)
    }
  }

  const alterarUsuario = (id: string, mudanca: Partial<UsuarioPapel>) =>
    setUsuarios((lista) => lista.map((u) => (u.id === id ? { ...u, ...mudanca } : u)))

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link href="/orgao/configuracoes" className="text-sm text-blue-800 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Configurações
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1">Fase interna e tarefas</h1>
        <p className="text-sm text-slate-600">
          Como as tarefas da fase interna são distribuídas no órgão. Qualquer peça pode sempre ser feita no sistema ou anexada em PDF feito fora.
        </p>
        {!admin && <p className="text-sm text-amber-800 mt-2">Somente o administrador do órgão altera esta configuração.</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modo de trabalho</CardTitle>
          <CardDescription>O modo simples é o padrão: uma pessoa pode conduzir o processo inteiro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <fieldset className="space-y-2" disabled={!admin}>
            <legend className="sr-only">Modo</legend>
            <label className="flex gap-2 items-start text-sm">
              <input type="radio" name="modo" className="mt-1" checked={cfg.modo === "SIMPLES"} onChange={() => setCfg({ ...cfg, modo: "SIMPLES" })} />
              <span>
                <b>Simples</b> — todas as tarefas vão para o agente de contratação do processo (sem agente: para quem criou o processo).
              </span>
            </label>
            <label className="flex gap-2 items-start text-sm">
              <input type="radio" name="modo" className="mt-1" checked={cfg.modo === "POR_SETOR"} onChange={() => setCfg({ ...cfg, modo: "POR_SETOR" })} />
              <span>
                <b>Por setor</b> — cada etapa vai para o papel ou setor escolhido abaixo; quem tem o papel vê a tarefa e pode assumi-la.
              </span>
            </label>
          </fieldset>
          <label className="flex gap-2 items-start text-sm pt-2 border-t">
            <input
              type="checkbox"
              className="mt-1"
              disabled={!admin}
              checked={cfg.controle_interno_ativo}
              onChange={(e) => setCfg({ ...cfg, controle_interno_ativo: e.target.checked })}
            />
            <span>
              <b>Manifestação do controle interno</b> — etapa entre o parecer jurídico e a publicação (ex.: Portaria 089/2024, art. 85). Por enquanto é um
              aviso: não impede a publicação. Ao desativar, as tarefas abertas dessa etapa são canceladas.
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Responsável e prazo por etapa</CardTitle>
            <CardDescription>
              Prazo em dias úteis pelo calendário do órgão (vazio = sem prazo). {cfg.modo === "SIMPLES" && "No modo simples, o responsável é sempre o agente do processo; os papéis abaixo valem no modo por setor."}
            </CardDescription>
          </div>
          {admin && (
            <Button variant="outline" size="sm" onClick={aplicarModelo089}>
              <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" /> Modelo Portaria 089
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b">
                <th className="py-2 pr-2 font-medium">Etapa</th>
                <th className="py-2 pr-2 font-medium">Papel</th>
                <th className="py-2 pr-2 font-medium">Setor</th>
                <th className="py-2 font-medium w-28">Prazo (dias úteis)</th>
              </tr>
            </thead>
            <tbody>
              {passosVisiveis.map((p) => {
                const r = cfg.responsaveis[p.passo] ?? { papel: p.papel_padrao, setor_id: null }
                return (
                  <tr key={p.passo} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{p.titulo}</div>
                      <div className="text-xs text-slate-500">{p.etapa_titulo}</div>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        aria-label={`Papel responsável por ${p.titulo}`}
                        className="border rounded h-8 px-1 bg-white w-full min-w-40"
                        disabled={!admin || cfg.modo === "SIMPLES"}
                        value={r.papel ?? ""}
                        onChange={(e) => alterarResponsavel(p.passo, "papel", e.target.value)}
                      >
                        <option value="">— nenhum —</option>
                        {cfg.papeis.map((x) => (
                          <option key={x.codigo} value={x.codigo}>{x.rotulo}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        aria-label={`Setor responsável por ${p.titulo}`}
                        className="border rounded h-8 px-1 bg-white w-full min-w-40"
                        disabled={!admin || cfg.modo === "SIMPLES"}
                        value={r.setor_id ?? ""}
                        onChange={(e) => alterarResponsavel(p.passo, "setor_id", e.target.value)}
                      >
                        <option value="">— qualquer —</option>
                        {cfg.setores.map((s) => (
                          <option key={s.id} value={s.id}>{s.nome}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        aria-label={`Prazo de ${p.titulo} em dias úteis`}
                        className="h-8 w-24"
                        disabled={!admin}
                        value={cfg.prazos[p.passo] ?? ""}
                        onChange={(e) => alterarPrazo(p.passo, e.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {admin && (
            <div className="flex justify-end pt-3">
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" aria-hidden="true" />} Salvar configuração
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Papéis dos usuários na fase interna</CardTitle>
          <CardDescription>
            Um usuário pode ter vários papéis. Isto não muda as permissões de sistema. Os setores são cadastrados em Configurações → Setores.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b">
                <th className="py-2 pr-2 font-medium">Usuário</th>
                <th className="py-2 pr-2 font-medium">Setor</th>
                <th className="py-2 pr-2 font-medium">Papéis</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={`border-b last:border-0 align-top ${u.ativo ? "" : "opacity-60"}`}>
                  <td className="py-2 pr-2">
                    <div className="font-medium">{u.nome}</div>
                    <div className="text-xs text-slate-500">{ROTULO_ROLE[u.role] ?? u.role}{u.cargo ? ` · ${u.cargo}` : ""}{u.ativo ? "" : " · inativo"}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      aria-label={`Setor de ${u.nome}`}
                      className="border rounded h-8 px-1 bg-white min-w-36"
                      disabled={!admin}
                      value={u.setor_id ?? ""}
                      onChange={(e) => alterarUsuario(u.id, { setor_id: e.target.value || null })}
                    >
                      <option value="">— sem setor —</option>
                      {cfg.setores.map((s) => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {Object.entries(ROTULO_PAPEL).map(([codigo, rotulo]) => (
                        <label key={codigo} className="inline-flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            disabled={!admin}
                            checked={u.papeis.includes(codigo)}
                            onChange={(e) =>
                              alterarUsuario(u.id, { papeis: e.target.checked ? [...u.papeis, codigo] : u.papeis.filter((p) => p !== codigo) })
                            }
                          />
                          {rotulo}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    {admin && (
                      <Button size="sm" variant="outline" onClick={() => salvarUsuario(u)} disabled={salvandoUsuario === u.id}>
                        {salvandoUsuario === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!usuarios.length && (
                <tr>
                  <td colSpan={4} className="py-4 text-slate-600">Nenhum usuário cadastrado no órgão.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
