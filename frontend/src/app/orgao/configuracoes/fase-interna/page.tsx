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
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

const NOME_CURTO_PASSO: Record<string, string> = {
  DFD: "DFD",
  ETP: "ETP/riscos",
  TR: "TR",
  PESQUISA: "Pesquisa",
  RESERVA: "Reserva",
  AUTORIZACAO: "Autorização",
  MINUTAS: "Minutas",
  PARECER: "Parecer",
  CONTROLE_INTERNO: "Controle interno",
  PUBLICACAO: "Publicação",
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
  const [avisoModelo, setAvisoModelo] = useState<{ mudancas: string[]; passosAlterados: string[] } | null>(null)
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

  const passosVisiveis = useMemo(
    () => (cfg?.passos ?? []).filter((p) => p.passo !== "CONTROLE_INTERNO" || cfg?.controle_interno_ativo),
    [cfg],
  )

  const alterado = useMemo(() => !!cfg && !!gravado && JSON.stringify(corpoDaConfiguracao(cfg)) !== gravado, [cfg, gravado])

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

  const rotuloPapel = (codigo: string | null | undefined) => cfg.papeis.find((x) => x.codigo === codigo)?.rotulo ?? codigo ?? "nenhum"
  const rotuloPrazoDias = (v: number | null | undefined) => (v === null || v === undefined ? "sem prazo" : `${v} dia${v === 1 ? "" : "s"} úte${v === 1 ? "il" : "is"}`)

  /**
   * Modelo da Portaria 089/2024 (Câmara de LEM, arts. 79–87): prazos e papéis
   * padrão de cada passo (vêm do servidor — `prazo_padrao`/`papel_padrao`,
   * a mesma tabela usada quando o órgão não tem configuração). Mostra o que
   * foi aplicado e o que mudou — inclusive "nada mudou" (a configuração
   * padrão JÁ É o modelo 089).
   */
  const aplicarModelo089 = () => {
    const mudancas: string[] = []
    const passosAlterados: string[] = []
    for (const p of cfg.passos) {
      const prazoAntes = cfg.prazos[p.passo] ?? null
      const papelAntes = cfg.responsaveis[p.passo]?.papel ?? null
      const setorAntes = cfg.responsaveis[p.passo]?.setor_id ?? null
      const partes: string[] = []
      if (prazoAntes !== p.prazo_padrao) partes.push(`prazo ${rotuloPrazoDias(prazoAntes)} → ${rotuloPrazoDias(p.prazo_padrao)}`)
      if (papelAntes !== p.papel_padrao) partes.push(`papel ${rotuloPapel(papelAntes)} → ${rotuloPapel(p.papel_padrao)}`)
      if (setorAntes) partes.push("setor → qualquer")
      if (partes.length) {
        passosAlterados.push(p.passo)
        mudancas.push(`${p.titulo}: ${partes.join("; ")}`)
      }
    }
    setCfg({
      ...cfg,
      responsaveis: Object.fromEntries(cfg.passos.map((p) => [p.passo, { papel: p.papel_padrao, setor_id: null }])),
      prazos: Object.fromEntries(cfg.passos.map((p) => [p.passo, p.prazo_padrao])),
    })
    setAvisoModelo({ mudancas, passosAlterados })
    setRetorno(null)
    toast.info(
      mudancas.length
        ? `Modelo da Portaria 089/2024 aplicado: ${mudancas.length} etapa(s) mudaram — clique em "Salvar configuração" para gravar.`
        : "A configuração já seguia o modelo da Portaria 089/2024 — nada mudou.",
    )
  }

  const salvar = async () => {
    setSalvando(true)
    setRetorno(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/configuracao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDaConfiguracao(cfg)),
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
      setAvisoModelo(null)
      const texto = `Configuração salva às ${horaBrasilia(new Date())}. As tarefas abertas foram ajustadas.`
      setRetorno({ tipo: "ok", texto })
      toast.success(texto)
    } catch (e) {
      const texto = `Não foi salva: ${e instanceof Error ? e.message : String(e)}`
      setRetorno({ tipo: "erro", texto })
      toast.error(texto)
    } finally {
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
          As etapas, as dependências entre elas, as opcionais (autorização de início, indicação da modalidade, controle interno) e a aprovação da
          demanda ficam no{" "}
          <Link href="/orgao/configuracoes/fluxo" className="text-blue-800 hover:underline font-medium">
            modelo de fluxo
          </Link>
          {cfg.modelo_fluxo ? ` (${cfg.modelo_fluxo.nome}, versão ${cfg.modelo_fluxo.versao}${cfg.modelo_fluxo.proprio ? "" : " — padrão do sistema"})` : ""}. Os prazos e
          responsáveis abaixo são os da dispensa e gravam no mesmo modelo.
        </p>
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
          <CardTitle>Autorização (etapa 6) — quem assina</CardTitle>
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

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 flex-wrap">
          <div className="min-w-0 flex-1">
            <CardTitle>Responsável e prazo por etapa</CardTitle>
            <CardDescription>
              Prazo em dias úteis pelo calendário do órgão (vazio = sem prazo). {cfg.modo === "SIMPLES" && "No modo simples, o responsável é sempre o agente do processo; os papéis abaixo valem no modo por setor."}
            </CardDescription>
          </div>
          {admin && (
            <Button
              variant="outline"
              size="sm"
              onClick={aplicarModelo089}
              title="Prazos da Portaria 089/2024 (Câmara de LEM, arts. 79–87): DFD, ETP e TR sem prazo; Pesquisa 30; Reserva 3; Autorização 3; Minutas 5; Parecer 5; Controle interno 3; Publicação 5 dias úteis"
            >
              <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" /> Modelo Portaria 089
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {avisoModelo && (
            <div role="status" className={`mb-3 rounded-md border p-3 text-sm ${avisoModelo.mudancas.length ? "bg-blue-50 border-blue-200 text-blue-950" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
              <p className="font-medium">
                {avisoModelo.mudancas.length
                  ? `Modelo da Portaria 089/2024 aplicado na tela — ${avisoModelo.mudancas.length} etapa(s) mudaram (destacadas abaixo). Ainda não foi gravado: clique em "Salvar configuração".`
                  : "Modelo da Portaria 089/2024 conferido: a configuração já seguia o modelo — nada mudou."}
              </p>
              <p className="text-xs mt-1">
                Modelo (Câmara de LEM, arts. 79–87): {cfg.passos.map((p) => `${NOME_CURTO_PASSO[p.passo] ?? p.titulo} ${p.prazo_padrao === null ? "sem prazo" : p.prazo_padrao}`).join(" · ")}
                {" "}(dias úteis). Papéis: o do setor de cada etapa (valem no modo por setor).
              </p>
              {avisoModelo.mudancas.length > 0 && (
                <ul className="text-xs mt-1 list-disc ml-5">
                  {avisoModelo.mudancas.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                  <tr key={p.passo} className={`border-b last:border-0 ${avisoModelo?.passosAlterados.includes(p.passo) ? "bg-blue-50" : ""}`}>
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
