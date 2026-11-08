"use client"

/**
 * CONFIGURAÇÃO DA FASE INTERNA DO ÓRGÃO (Entrega 2).
 *  - Modo: SIMPLES (padrão — uma pessoa pode fazer tudo; as tarefas vão para
 *    o agente do processo) ou POR SETOR (cada etapa vai para o papel/setor).
 *  - Controle interno: etapa opcional entre o parecer e a publicação.
 *  - Autorização (Entrega 3B): quem assina (autoridade colegiada) e o nome da autoridade.
 *  - Responsável e prazo (dias úteis) por etapa — modelo Portaria 089/2024.
 *  - Papéis funcionais e setor de cada usuário (não mudam as permissões de
 *    sistema — Administrador/Pregoeiro/Equipe de apoio continuam iguais).
 * Só o administrador do órgão altera. Fonte: /api/fase-interna/configuracao.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, CheckCircle2, GitBranch, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { API_URL, authFetch } from "@/lib/api"
import { ROTULO_PAPEL } from "@/lib/tarefas"
import { PlanejamentoFluxoCard } from "@/components/fase-interna/fluxo/PlanejamentoFluxoCard"

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
  /** Entrega 3B: quem assina a autorização (autoridade colegiada) e o nome da autoridade. */
  signatarios_autorizacao: Array<{ usuario_id: string; papel: string; /** chave da linha na tela (não vai ao servidor) */ _k?: string }>
  autoridade_rotulo: string
  /** Entrega 5: PADRÃO SUGERIDO para novas dispensas (a escolha é do agente em cada processo). */
  dispensa_com_lances: boolean
  /** O regulamento local adota a IN SEGES 67/2021? (aviso DISP-01 da conformidade) */
  regulamento_adota_in67: boolean
  padrao: boolean
  setores: Array<{ id: string; nome: string; codigo: string }>
  papeis: Array<{ codigo: string; rotulo: string }>
  passos: PassoConfig[]
  /** F1: o modelo de fluxo de onde vêm responsáveis, prazos e o controle interno. */
  modelo_fluxo?: { nome: string; versao: number; proprio: boolean; tela: string }
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


const ROTULO_ROLE: Record<string, string> ={ ADMIN: "Administrador", PREGOEIRO: "Pregoeiro/agente", EQUIPE_APOIO: "Equipe de apoio" }

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

/** O que o "Salvar configuração" grava (para saber se há alteração não salva). */
function corpoDaConfiguracao(cfg: Configuracao) {
  return {
    modo: cfg.modo,
    controle_interno_ativo: cfg.controle_interno_ativo,
    responsaveis: cfg.responsaveis,
    prazos: cfg.prazos,
    signatarios_autorizacao: cfg.signatarios_autorizacao.filter((s) => s.usuario_id).map(({ usuario_id, papel }) => ({ usuario_id, papel })),
    autoridade_rotulo: cfg.autoridade_rotulo,
    dispensa_com_lances: cfg.dispensa_com_lances !== false,
    regulamento_adota_in67: cfg.regulamento_adota_in67 === true,
  }
}

let seqChave = 0
const novaChave = () => `sig-${++seqChave}`
const comChaves = (c: Configuracao): Configuracao => ({
  ...c,
  signatarios_autorizacao: (c.signatarios_autorizacao ?? []).map((s) => ({ ...s, _k: s._k ?? novaChave() })),
})

const horaBrasilia = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

type Retorno = { tipo: "ok" | "erro"; texto: string }

export default function ConfiguracaoFaseInternaPage() {
  const [cfg, setCfg] = useState<Configuracao | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioPapel[]>([])
  const [salvando, setSalvando] = useState(false)
  const [salvandoUsuario, setSalvandoUsuario] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)
  /** Última versão gravada (compara com a tela: "alterações não salvas"). */
  const [gravado, setGravado] = useState<string>("")
  /** Retorno visível do "Salvar configuração" (fica na tela — o aviso flutuante some sozinho). */
  const [retorno, setRetorno] = useState<Retorno | null>(null)
  /** Retorno do "Modelo Portaria 089": o que foi aplicado e o que mudou. */
  /** Retorno do "Salvar" de cada usuário. */
  const [retornoUsuario, setRetornoUsuario] = useState<Record<string, Retorno>>({})
  const papelRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const signatarioRefs = useRef<Record<string, HTMLSelectElement | null>>({})
  const [focarSignatario, setFocarSignatario] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [c, u] = await Promise.all([
      authFetch(`${API_URL}/api/fase-interna/configuracao`),
      authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios`),
    ])
    if (c.ok) {
      const lido = comChaves(await c.json())
      setCfg(lido)
      setGravado(JSON.stringify(corpoDaConfiguracao(lido)))
    } else toast.error(`Configuração: ${await lerErro(c)}`)
    if (u.ok) setUsuarios(await u.json())
  }, [])

  useEffect(() => {
    setAdmin(ehAdminDoOrgao())
    carregar()
  }, [carregar])

  // Linha nova de signatário: o foco vai para a escolha do usuário (sem rolar a página)
  useEffect(() => {
    if (!focarSignatario) return
    signatarioRefs.current[focarSignatario]?.focus({ preventScroll: true })
    setFocarSignatario(null)
  }, [focarSignatario])



  const alterado = useMemo(() => !!cfg && !!gravado && JSON.stringify(corpoDaConfiguracao(cfg)) !== gravado, [cfg, gravado])

  if (!cfg) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" aria-label="Carregando" />
      </div>
    )
  }


  /**
   * Modelo da Portaria 089/2024 (Câmara de LEM, arts. 79–87): prazos e papéis
   * padrão de cada passo (vêm do servidor — `prazo_padrao`/`papel_padrao`,
   * a mesma tabela usada quando o órgão não tem configuração). Mostra o que
   * foi aplicado e o que mudou — inclusive "nada mudou" (a configuração
   * padrão JÁ É o modelo 089).
   */


  const salvar = async () => {
    setSalvando(true)
    setRetorno(null)
    // O botão nunca fica preso em "Salvando…": o servidor responde logo (o ajuste das
    // tarefas roda em segundo plano) e, se a rede travar, desiste em 45 s com aviso.
    const controle = new AbortController()
    const limite = setTimeout(() => controle.abort(), 45000)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/configuracao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDaConfiguracao(cfg)),
        signal: controle.signal,
      }).catch((e) => {
        if (controle.signal.aborted) throw new Error("o servidor demorou a responder. Recarregue a página para conferir se a configuração foi gravada.")
        throw e
      })
      if (!r.ok) throw new Error(await lerErro(r))
      // Mantém as chaves das linhas de signatário (o foco e o texto digitado não "pulam")
      const salvo: Configuracao = await r.json()
      const chaves = cfg.signatarios_autorizacao.filter((s) => s.usuario_id).map((s) => s._k)
      const comAsMesmasChaves = comChaves({
        ...salvo,
        signatarios_autorizacao: (salvo.signatarios_autorizacao ?? []).map((s, i) => ({ ...s, _k: chaves[i] })),
      })
      setCfg(comAsMesmasChaves)
      setGravado(JSON.stringify(corpoDaConfiguracao(comAsMesmasChaves)))
      
      const texto = `Configuração salva às ${horaBrasilia(new Date())}. As tarefas abertas dos processos estão sendo ajustadas (em alguns instantes aparecem nas caixas).`
      setRetorno({ tipo: "ok", texto })
      toast.success(texto)
    } catch (e) {
      const texto = `Não foi salva: ${e instanceof Error ? e.message : String(e)}`
      setRetorno({ tipo: "erro", texto })
      toast.error(texto)
    } finally {
      clearTimeout(limite)
      setSalvando(false)
    }
  }

  const salvarUsuario = async (u: UsuarioPapel) => {
    setSalvandoUsuario(u.id)
    setRetornoUsuario((m) => {
      const n = { ...m }
      delete n[u.id]
      return n
    })
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papeis: u.papeis, setor_id: u.setor_id }),
      })
      if (!r.ok) throw new Error(await lerErro(r))
      setRetornoUsuario((m) => ({ ...m, [u.id]: { tipo: "ok", texto: `Salvo às ${horaBrasilia(new Date())}` } }))
      toast.success(`Papéis de ${u.nome} salvos`)
    } catch (e) {
      const texto = e instanceof Error ? e.message : String(e)
      setRetornoUsuario((m) => ({ ...m, [u.id]: { tipo: "erro", texto: `Não foi salvo: ${texto}` } }))
      toast.error(texto)
    } finally {
      setSalvandoUsuario(null)
    }
  }

  const alterarUsuario = (id: string, mudanca: Partial<UsuarioPapel>) => {
    setUsuarios((lista) => lista.map((u) => (u.id === id ? { ...u, ...mudanca } : u)))
    setRetornoUsuario((m) => {
      if (!m[id]) return m
      const n = { ...m }
      delete n[id]
      return n
    })
  }

  const alterarSignatario = (k: string, mudanca: Partial<{ usuario_id: string; papel: string }>) =>
    setCfg({ ...cfg, signatarios_autorizacao: cfg.signatarios_autorizacao.map((x) => (x._k === k ? { ...x, ...mudanca } : x)) })

  /** Usuário escolhido: o papel ganha o cargo do cadastro (se vazio) e o foco vai para ele, sem rolar a página. */
  const escolherSignatario = (k: string, usuarioId: string) => {
    const atual = cfg.signatarios_autorizacao.find((x) => x._k === k)
    const cargo = usuarios.find((u) => u.id === usuarioId)?.cargo ?? ""
    alterarSignatario(k, { usuario_id: usuarioId, ...(atual && !atual.papel.trim() && cargo ? { papel: cargo } : {}) })
    if (usuarioId) requestAnimationFrame(() => papelRefs.current[k]?.focus({ preventScroll: true }))
  }

  const adicionarSignatario = () => {
    const k = novaChave()
    setCfg({ ...cfg, signatarios_autorizacao: [...cfg.signatarios_autorizacao, { usuario_id: "", papel: "", _k: k }] })
    setFocarSignatario(k)
  }

  const statusSalvar = (
    <span role="status" aria-live="polite" className="text-sm">
      {salvando ? (
        <span className="text-slate-600">Salvando…</span>
      ) : retorno && !alterado ? (
        <span className={`inline-flex items-center gap-1 ${retorno.tipo === "ok" ? "text-green-800" : "text-red-800"}`}>
          {retorno.tipo === "ok" ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4" aria-hidden="true" />}
          {retorno.texto}
        </span>
      ) : retorno?.tipo === "erro" ? (
        <span className="inline-flex items-center gap-1 text-red-800">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" /> {retorno.texto}
        </span>
      ) : alterado ? (
        <span className="text-amber-800 font-medium">Há alterações não salvas.</span>
      ) : (
        <span className="text-slate-500">Tudo salvo.</span>
      )}
    </span>
  )

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
        <p className="text-sm text-slate-700 mt-2">
          O caminho de cada processo — etapas, responsáveis, prazos e avisos — fica em{" "}
          <Link href="/orgao/configuracoes/fluxos" className="text-blue-800 hover:underline font-medium">
            Configurações › Fluxos de processo
          </Link>
          . Aqui ficam as opções do órgão para a contratação, quem assina a autorização, os papéis dos usuários e o que vem antes do processo
          (aprovação da demanda e DFD consolidado).
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/orgao/configuracoes/fluxos">
            <GitBranch aria-hidden="true" /> Fluxos de processo
          </Link>
        </Button>
        {!admin && <p className="text-sm text-amber-800 mt-2">Somente o administrador do órgão altera esta configuração.</p>}
        {admin && (
          <p className="text-sm text-slate-600 mt-2">
            Os quatro primeiros quadros são gravados juntos pelo botão <b>Salvar configuração</b> (na barra no fim da tela). Os papéis de cada usuário têm o
            seu próprio <b>Salvar</b>, na linha do usuário.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opções da contratação</CardTitle>
          <CardDescription>Controle interno e o padrão da dispensa eletrônica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex gap-2 items-start text-sm">
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
          <fieldset className="space-y-2 pt-2 border-t" disabled={!admin}>
            <legend className="text-sm font-semibold">Dispensa eletrônica — padrão sugerido para novas dispensas</legend>
            <p className="text-xs text-gray-600">
              Quem escolhe é o agente, em cada processo (Editar processo › Classificação ou a tela da conformidade), até a publicação. Aqui fica só o
              valor que já vem marcado.
            </p>
            <label className="flex gap-2 items-start text-sm">
              <input
                type="radio"
                name="dispensa-lances"
                className="mt-1"
                checked={cfg.dispensa_com_lances !== false}
                onChange={() => setCfg({ ...cfg, dispensa_com_lances: true })}
              />
              <span>
                <b>Com disputa de lances</b> (sessão de lances em tempo real, de 6 a 10 horas, depois do prazo de propostas — IN SEGES nº 67/2021, quando
                adotada pelo órgão).
              </span>
            </label>
            <label className="flex gap-2 items-start text-sm">
              <input
                type="radio"
                name="dispensa-lances"
                className="mt-1"
                checked={cfg.dispensa_com_lances === false}
                onChange={() => setCfg({ ...cfg, dispensa_com_lances: false })}
              />
              <span>
                <b>Sem disputa de lances</b> (só recebimento de propostas no prazo do aviso — Lei nº 14.133/2021, art. 75, §3º, aviso de 3 dias úteis para
                propostas adicionais); vence o menor preço e, no empate, a proposta registrada primeiro.
              </span>
            </label>
            <label className="flex gap-2 items-start text-sm pt-1">
              <input
                type="checkbox"
                className="mt-1"
                checked={cfg.regulamento_adota_in67 === true}
                onChange={(e) => setCfg({ ...cfg, regulamento_adota_in67: e.target.checked })}
              />
              <span>
                <b>O regulamento local adota a IN SEGES nº 67/2021</b> — com esta opção, a conformidade avisa (atenção, não bloqueio) a dispensa definida sem
                disputa de lances.
              </span>
            </label>
            <p className="text-xs text-gray-600">
              A escolha de cada processo é gravada quando ele é publicado: mudar aqui não altera os processos já criados com escolha nem os publicados.
            </p>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autorização da contratação — quem assina</CardTitle>
          <CardDescription>
            A autoridade pode ser colegiada (ex.: Mesa Diretora com Presidente, Vice, 1º e 2º Secretários): a autorização só vale quando todos assinam.
            Sem ninguém aqui, recebem o despacho os usuários com o papel &quot;Autoridade&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <fieldset className="space-y-3" disabled={!admin}>
            <div className="space-y-1 max-w-sm">
              <Label htmlFor="autoridade-rotulo">Nome da autoridade nos despachos</Label>
              <Input id="autoridade-rotulo" value={cfg.autoridade_rotulo} onChange={(e) => setCfg({ ...cfg, autoridade_rotulo: e.target.value })} placeholder="Ex.: Mesa Diretora" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">Signatários da autorização</p>
              {!cfg.signatarios_autorizacao.length && (
                <p className="text-xs text-slate-600">Nenhum signatário: o despacho vai para quem tem o papel &quot;Autoridade&quot; (quadro &quot;Papéis dos usuários&quot;).</p>
              )}
            </div>
            <ul className="space-y-2">
              {cfg.signatarios_autorizacao.map((s, i) => {
                const k = s._k ?? `sig-idx-${i}`
                return (
                  <li key={k} className="flex items-center gap-2 flex-wrap">
                    <select
                      ref={(el) => {
                        signatarioRefs.current[k] = el
                      }}
                      aria-label={`Signatário ${i + 1}`}
                      className="h-9 border rounded-md px-2 text-sm min-w-[14rem] bg-white"
                      value={s.usuario_id}
                      onChange={(e) => escolherSignatario(k, e.target.value)}
                    >
                      <option value="">— escolha o usuário —</option>
                      {usuarios.filter((u) => u.ativo).map((u) => (
                        <option key={u.id} value={u.id}>{u.nome}{u.cargo ? ` (${u.cargo})` : ""}</option>
                      ))}
                    </select>
                    <Input
                      ref={(el) => {
                        papelRefs.current[k] = el
                      }}
                      aria-label={`Papel do signatário ${i + 1}`}
                      className="h-9 max-w-[14rem]"
                      value={s.papel}
                      placeholder="Papel no ato (ex.: Presidente)"
                      onChange={(e) => alterarSignatario(k, { papel: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCfg({ ...cfg, signatarios_autorizacao: cfg.signatarios_autorizacao.filter((x) => (x._k ?? "") !== k) })}
                    >
                      Remover
                    </Button>
                  </li>
                )
              })}
            </ul>
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={adicionarSignatario}>
                Adicionar signatário
              </Button>
              {!cfg.signatarios_autorizacao.length && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCfg({
                      ...cfg,
                      autoridade_rotulo: cfg.autoridade_rotulo === "Autoridade competente" ? "Mesa Diretora" : cfg.autoridade_rotulo,
                      signatarios_autorizacao: ["Presidente", "Vice-Presidente", "1º Secretário", "2º Secretário"].map((papel) => ({ usuario_id: "", papel, _k: novaChave() })),
                    })
                  }
                >
                  Modelo Mesa Diretora (4)
                </Button>
              )}
            </div>
          </fieldset>
        </CardContent>
      </Card>


      {/* Barra de gravação (fica visível ao rolar): vale para os quatro quadros acima */}
      {admin && (
        <div
          className={`sticky bottom-0 z-10 -mx-2 px-4 py-3 rounded-lg border shadow-sm flex items-center justify-between gap-3 flex-wrap ${
            alterado ? "bg-amber-50 border-amber-300" : retorno?.tipo === "erro" ? "bg-red-50 border-red-300" : "bg-white border-slate-200"
          }`}
        >
          {statusSalvar}
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" aria-hidden="true" />} Salvar configuração
          </Button>
        </div>
      )}

      <Card id="planejamento">
        <CardHeader>
          <CardTitle>Antes do processo: aprovação da demanda e DFD consolidado</CardTitle>
          <CardDescription>Quem monta o DFD consolidado e quem aprova as demandas e o DFD.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlanejamentoFluxoCard admin={!!admin} />
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
                      <div className="flex flex-col items-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => salvarUsuario(u)} disabled={salvandoUsuario === u.id}>
                          {salvandoUsuario === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                        </Button>
                        {retornoUsuario[u.id] && (
                          <span
                            role="status"
                            className={`text-xs inline-flex items-center gap-1 ${retornoUsuario[u.id].tipo === "ok" ? "text-green-800" : "text-red-800"}`}
                          >
                            {retornoUsuario[u.id].tipo === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
                            {retornoUsuario[u.id].texto}
                          </span>
                        )}
                      </div>
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
