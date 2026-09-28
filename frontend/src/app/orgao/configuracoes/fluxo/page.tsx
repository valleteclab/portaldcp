"use client"

/**
 * MODELO DE FLUXO DA FASE INTERNA (F1 — docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §5 e §10).
 * Um modelo por tipo de processo (dispensa, inexigibilidade, licitação). A
 * edição é POR LISTA (etapas, responsável, prazo, liga/desliga as opcionais,
 * IA, aprovação interna, dependências) e a tela MOSTRA O DESENHO (colunas por
 * nível de dependência). O servidor valida pela Lei 14.133 a cada alteração
 * e recusa o que a lei não permite, citando o artigo.
 * Fonte: /api/fluxo-fase-interna/modelos/:tipo (+ /validar, /restaurar).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RotateCcw, Save, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { API_URL, authFetch } from "@/lib/api"
import { DesenhoFluxo } from "@/components/fase-interna/fluxo/DesenhoFluxo"
import { PlanejamentoFluxoCard } from "@/components/fase-interna/fluxo/PlanejamentoFluxoCard"

type Tipo = "DISPENSA" | "INEXIGIBILIDADE" | "LICITACAO"

interface Responsavel {
  papel: string | null
  setor_id: string | null
  usuario_id: string | null
}

interface EtapaModelo {
  codigo: string
  grupo: string
  grupo_titulo: string
  titulo: string
  ordem: number
  tipos_peca: string[]
  tela: string | null
  conclusao: "PECAS" | "DIVULGACAO" | "REGISTRO"
  fundamento: string | null
  responsavel: Responsavel
  prazo_dias_uteis: number | null
  obrigatoria: boolean
  ligada: boolean
  ia_rascunho: boolean
  aprovacao_interna: boolean
  dispensavel_por_ato: boolean
  depende_de: string[]
}

interface AprovacaoDemanda {
  exigida: boolean
  etapa: string
  aprovador: { tipo: "PERMISSAO" | "PAPEL" | "SETOR" | "USUARIO"; valor: string | null }
  aceita_peca_externa: boolean
}

interface ErroModelo {
  codigo: string
  etapa: string | null
  fundamento: string | null
  mensagem: string
}

interface Requisito {
  codigo: string
  tipo: "ETAPA_OBRIGATORIA" | "DEPENDENCIA" | "SEGREGACAO"
  etapa: string
  outra_etapa: string | null
  permite_dispensa_por_ato: boolean
  fundamento: string
  mensagem: string
}

interface TelaModelo {
  tipo: Tipo
  rotulo_tipo: string
  proprio: boolean
  modelo: { id: string | null; nome: string; descricao: string | null; versao: number; aprovacao_demanda: AprovacaoDemanda; exigir_posse_pecas?: boolean; etapas: EtapaModelo[] }
  validacao: { ok: boolean; erros: ErroModelo[]; avisos: ErroModelo[] }
  desenho: Array<{ nivel: number; etapas: string[] }>
  requisitos: Requisito[]
  papeis: Array<{ codigo: string; rotulo: string }>
  setores: Array<{ id: string; nome: string }>
  usuarios: Array<{ id: string; nome: string }>
  processos_em_andamento: number
}

const TIPOS: Array<{ tipo: Tipo; rotulo: string }> = [
  { tipo: "DISPENSA", rotulo: "Dispensa" },
  { tipo: "INEXIGIBILIDADE", rotulo: "Inexigibilidade" },
  { tipo: "LICITACAO", rotulo: "Licitação" },
]

const horaBrasilia = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

function ehAdminDoOrgao(): boolean {
  try {
    const u = localStorage.getItem("usuario")
    if (!u) return true // login do próprio órgão
    return JSON.parse(u)?.role === "ADMIN"
  } catch {
    return false
  }
}

async function lerErro(r: Response): Promise<{ texto: string; erros: ErroModelo[] }> {
  const j = await r.json().catch(() => null)
  const texto = j?.message ? (Array.isArray(j.message) ? j.message.join(" ") : j.message) : `HTTP ${r.status}`
  return { texto, erros: Array.isArray(j?.erros) ? j.erros : [] }
}

/** O que o "Salvar modelo" envia (só os campos editáveis). */
function corpoDo(etapas: EtapaModelo[], aprovacao: AprovacaoDemanda, exigirPosse: boolean) {
  return {
    aprovacao_demanda: { exigida: aprovacao.exigida, aceita_peca_externa: aprovacao.aceita_peca_externa, aprovador: aprovacao.aprovador },
    exigir_posse_pecas: exigirPosse,
    etapas: etapas.map((e) => ({
      codigo: e.codigo,
      titulo: e.titulo,
      ordem: e.ordem,
      responsavel: e.responsavel,
      prazo_dias_uteis: e.prazo_dias_uteis,
      obrigatoria: e.obrigatoria,
      ligada: e.ligada,
      ia_rascunho: e.ia_rascunho,
      aprovacao_interna: e.aprovacao_interna,
      dispensavel_por_ato: e.dispensavel_por_ato,
      depende_de: e.depende_de,
    })),
  }
}

type Retorno = { tipo: "ok" | "erro"; texto: string }

export default function ModeloFluxoPage() {
  const [tipo, setTipo] = useState<Tipo>("DISPENSA")
  const [tela, setTela] = useState<TelaModelo | null>(null)
  const [etapas, setEtapas] = useState<EtapaModelo[]>([])
  const [aprovacao, setAprovacao] = useState<AprovacaoDemanda | null>(null)
  const [exigirPosse, setExigirPosse] = useState(true)
  const [gravado, setGravado] = useState("")
  const [validando, setValidando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [retorno, setRetorno] = useState<Retorno | null>(null)
  const [admin, setAdmin] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aplicarTela = useCallback((t: TelaModelo, marcarGravado: boolean) => {
    setTela(t)
    if (marcarGravado) {
      setEtapas(t.modelo.etapas)
      setAprovacao(t.modelo.aprovacao_demanda)
      setExigirPosse(t.modelo.exigir_posse_pecas !== false)
      setGravado(JSON.stringify(corpoDo(t.modelo.etapas, t.modelo.aprovacao_demanda, t.modelo.exigir_posse_pecas !== false)))
    }
  }, [])

  const carregar = useCallback(
    async (t: Tipo) => {
      setTela(null)
      setRetorno(null)
      const r = await authFetch(`${API_URL}/api/fluxo-fase-interna/modelos/${t}`)
      if (!r.ok) {
        toast.error(`Modelo de fluxo: ${(await lerErro(r)).texto}`)
        return
      }
      aplicarTela(await r.json(), true)
    },
    [aplicarTela],
  )

  useEffect(() => {
    setAdmin(ehAdminDoOrgao())
    // Link direto para uma aba (ex.: vindo de Fluxos de aprovação: ?tipo=LICITACAO)
    try {
      const t = new URLSearchParams(window.location.search).get("tipo")?.toUpperCase()
      if (t === "DISPENSA" || t === "INEXIGIBILIDADE" || t === "LICITACAO") setTipo(t as Tipo)
    } catch {
      /* aba padrão */
    }
  }, [])
  useEffect(() => {
    carregar(tipo)
  }, [carregar, tipo])

  const corpo = useMemo(() => (aprovacao ? corpoDo(etapas, aprovacao, exigirPosse) : null), [etapas, aprovacao, exigirPosse])
  const alterado = !!corpo && !!gravado && JSON.stringify(corpo) !== gravado

  // Validação ao vivo (sem gravar): o servidor aplica a lista, valida pela lei e devolve o desenho
  useEffect(() => {
    if (!corpo || !alterado) return
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(async () => {
      setValidando(true)
      try {
        const r = await authFetch(`${API_URL}/api/fluxo-fase-interna/modelos/${tipo}/validar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        })
        if (r.ok) aplicarTela(await r.json(), false)
      } finally {
        setValidando(false)
      }
    }, 500)
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    }
  }, [corpo, alterado, tipo, aplicarTela])

  const exigidasPelaLei = useMemo(
    () => new Set((tela?.requisitos ?? []).filter((r) => r.tipo === "ETAPA_OBRIGATORIA").map((r) => r.etapa)),
    [tela],
  )
  const dispensaPermitida = useMemo(
    () => new Set((tela?.requisitos ?? []).filter((r) => r.tipo === "ETAPA_OBRIGATORIA" && r.permite_dispensa_por_ato).map((r) => r.etapa)),
    [tela],
  )

  if (!tela || !aprovacao) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" aria-label="Carregando" />
      </div>
    )
  }

  const titulo = (c: string) => etapas.find((e) => e.codigo === c)?.titulo ?? c
  const alterar = (codigo: string, mudanca: Partial<EtapaModelo>) => {
    setRetorno(null)
    setEtapas((lista) => lista.map((e) => (e.codigo === codigo ? { ...e, ...mudanca } : e)))
  }
  const alterarResponsavel = (codigo: string, campo: keyof Responsavel, valor: string) => {
    const e = etapas.find((x) => x.codigo === codigo)!
    alterar(codigo, { responsavel: { ...e.responsavel, [campo]: valor || null } })
  }
  const alternarDependencia = (codigo: string, dep: string, marcado: boolean) => {
    const e = etapas.find((x) => x.codigo === codigo)!
    alterar(codigo, { depende_de: marcado ? [...e.depende_de, dep] : e.depende_de.filter((d) => d !== dep) })
  }
  const rotuloResponsavel = (r: Responsavel) =>
    r.usuario_id
      ? tela.usuarios.find((u) => u.id === r.usuario_id)?.nome ?? "Pessoa"
      : [r.papel ? tela.papeis.find((p) => p.codigo === r.papel)?.rotulo ?? r.papel : null, r.setor_id ? `setor ${tela.setores.find((s) => s.id === r.setor_id)?.nome ?? ""}` : null]
          .filter(Boolean)
          .join(" · ") || "—"

  const trocarTipo = (t: Tipo) => {
    if (t === tipo) return
    if (alterado && !confirm("Há alterações não salvas neste modelo. Trocar de tipo e descartá-las?")) return
    setTipo(t)
  }

  const salvar = async () => {
    if (!corpo) return
    setSalvando(true)
    setRetorno(null)
    try {
      const r = await authFetch(`${API_URL}/api/fluxo-fase-interna/modelos/${tipo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) {
        const e = await lerErro(r)
        if (e.erros.length && tela) setTela({ ...tela, validacao: { ok: false, erros: e.erros, avisos: tela.validacao.avisos } })
        throw new Error(e.texto)
      }
      const t: TelaModelo = await r.json()
      aplicarTela(t, true)
      const texto = `Modelo salvo às ${horaBrasilia(new Date())} (versão ${t.modelo.versao}). Processos em andamento mantêm o caminho; responsáveis e prazos já valem para eles.`
      setRetorno({ tipo: "ok", texto })
      toast.success(texto)
    } catch (e) {
      const texto = `Não foi salvo: ${e instanceof Error ? e.message : String(e)}`
      setRetorno({ tipo: "erro", texto })
      toast.error(texto)
    } finally {
      setSalvando(false)
    }
  }

  const restaurar = async () => {
    if (!confirm("Restaurar o modelo padrão do sistema (Câmara — Portaria 089) para este tipo de processo? As alterações do órgão neste tipo serão substituídas.")) return
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fluxo-fase-interna/modelos/${tipo}/restaurar`, { method: "POST" })
      if (!r.ok) throw new Error((await lerErro(r)).texto)
      const t: TelaModelo = await r.json()
      aplicarTela(t, true)
      const texto = `Modelo padrão restaurado às ${horaBrasilia(new Date())} (versão ${t.modelo.versao}).`
      setRetorno({ tipo: "ok", texto })
      toast.success(texto)
    } catch (e) {
      const texto = `Não foi restaurado: ${e instanceof Error ? e.message : String(e)}`
      setRetorno({ tipo: "erro", texto })
      toast.error(texto)
    } finally {
      setSalvando(false)
    }
  }

  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo))
  const erros = tela.validacao.erros
  const avisos = tela.validacao.avisos
  const etapasDoDesenho = etapas.map((e) => ({ ...e, responsavel_rotulo: rotuloResponsavel(e.responsavel) }))

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
        <span className="text-amber-800 font-medium">Há alterações não salvas{validando ? " (conferindo pela lei…)" : ""}.</span>
      ) : (
        <span className="text-slate-500">Tudo salvo.</span>
      )}
    </span>
  )

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link href="/orgao/configuracoes/fase-interna" className="text-sm text-blue-800 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Fase interna e tarefas
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1">Modelo de fluxo da fase interna</h1>
        <p className="text-sm text-slate-600">
          O caminho que o processo percorre: quais etapas, quem faz, em quanto tempo e o que depende do quê. Etapas sem dependência entre si correm em
          paralelo. O sistema só impede o que a lei impede — e explica com o artigo.
        </p>
        {!admin && <p className="text-sm text-amber-800 mt-2">Somente o administrador do órgão altera o modelo.</p>}
      </div>

      <PlanejamentoFluxoCard admin={admin} />

      <div role="tablist" aria-label="Tipo de processo" className="flex gap-2 flex-wrap">
        {TIPOS.map((t) => (
          <Button key={t.tipo} role="tab" aria-selected={tipo === t.tipo} variant={tipo === t.tipo ? "default" : "outline"} size="sm" onClick={() => trocarTipo(t.tipo)}>
            {t.rotulo}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tela.modelo.nome}</CardTitle>
          <CardDescription>
            {tela.rotulo_tipo} · versão {tela.modelo.versao} · {tela.proprio ? "modelo próprio do órgão" : "padrão do sistema (o órgão ainda não alterou)"}
            {tela.processos_em_andamento > 0 &&
              ` · ${tela.processos_em_andamento} processo(s) em andamento: o caminho deles não muda com a edição (etapas e dependências ficam as do início); responsáveis e prazos passam a valer já.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DesenhoFluxo niveis={tela.desenho} etapas={etapasDoDesenho} />
        </CardContent>
      </Card>

      {(erros.length > 0 || avisos.length > 0) && (
        <div className="space-y-2">
          {erros.length > 0 && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold inline-flex items-center gap-1">
                <ShieldAlert className="w-4 h-4" aria-hidden="true" /> A lei não permite este modelo — não será salvo:
              </p>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                {erros.map((e, i) => (
                  <li key={`${e.codigo}-${i}`}>
                    {e.mensagem}
                    {e.fundamento && !e.mensagem.includes(e.fundamento) ? ` (${e.fundamento})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {avisos.length > 0 && (
            <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Atenção (não impede salvar):</p>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                {avisos.map((a, i) => (
                  <li key={`${a.codigo}-${i}`}>{a.mensagem}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Aprovação de início: a demanda</CardTitle>
          <CardDescription>
            Enquanto a demanda (DFD) não for aprovada por quem foi designado, as demais etapas aguardam. Processo que nasceu de demanda já aprovada no
            módulo de demandas conta como aprovado; no modo simples, o agente que conduz o processo aprova.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset className="space-y-3" disabled={!admin}>
            <label className="flex gap-2 items-start text-sm">
              <input type="checkbox" className="mt-1" checked={aprovacao.exigida} onChange={(e) => setAprovacao({ ...aprovacao, exigida: e.target.checked })} />
              <span>
                <b>Exigir a aprovação da demanda</b> antes das demais etapas
              </span>
            </label>
            <div className="flex gap-2 flex-wrap items-center text-sm">
              <label htmlFor="aprovador-tipo" className="font-medium">
                Quem aprova
              </label>
              <select
                id="aprovador-tipo"
                className="h-9 border rounded-md px-2 bg-white"
                value={aprovacao.aprovador.tipo}
                onChange={(e) => setAprovacao({ ...aprovacao, aprovador: { tipo: e.target.value as AprovacaoDemanda["aprovador"]["tipo"], valor: null } })}
              >
                <option value="PERMISSAO">Quem tem a permissão &quot;aprovar demandas&quot;</option>
                <option value="PAPEL">Um papel</option>
                <option value="SETOR">Um setor</option>
                <option value="USUARIO">Uma pessoa</option>
              </select>
              {aprovacao.aprovador.tipo !== "PERMISSAO" && (
                <select
                  aria-label="Aprovador"
                  className="h-9 border rounded-md px-2 bg-white min-w-48"
                  value={aprovacao.aprovador.valor ?? ""}
                  onChange={(e) => setAprovacao({ ...aprovacao, aprovador: { ...aprovacao.aprovador, valor: e.target.value || null } })}
                >
                  <option value="">— escolha —</option>
                  {(aprovacao.aprovador.tipo === "PAPEL"
                    ? tela.papeis.map((p) => ({ id: p.codigo, nome: p.rotulo }))
                    : aprovacao.aprovador.tipo === "SETOR"
                      ? tela.setores
                      : tela.usuarios
                  ).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <label className="flex gap-2 items-start text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={aprovacao.aceita_peca_externa}
                onChange={(e) => setAprovacao({ ...aprovacao, aceita_peca_externa: e.target.checked })}
              />
              <span>DFD juntada feita fora (assinada no papel) já traz a aprovação — não pede de novo</span>
            </label>
            <label className="flex gap-2 items-start text-sm border-t pt-3">
              <input type="checkbox" className="mt-1" checked={exigirPosse} onChange={(e) => setExigirPosse(e.target.checked)} />
              <span>
                <b>Exigir a posse para trabalhar nas peças</b> (modo por setor): só quem está com o processo — o setor ou a pessoa para quem ele foi
                enviado — gera, anexa ou altera as peças da própria etapa. No modo simples não se aplica. O administrador do órgão pode agir fora da
                vez, com registro no histórico.
              </span>
            </label>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etapas</CardTitle>
          <CardDescription>
            Ordem sugerida, quem faz (no modo por setor), prazo em dias úteis, se a etapa está ligada (só as opcionais desligam), se a IA prepara o
            rascunho, se a peça passa por aprovação interna e de quais etapas ela depende.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ordenadas.map((e) => {
            const pelaLei = exigidasPelaLei.has(e.codigo)
            const errosDaEtapa = erros.filter((x) => x.etapa === e.codigo)
            return (
              <fieldset
                key={e.codigo}
                disabled={!admin}
                className={`rounded-md border p-3 space-y-2 ${e.ligada ? "bg-white" : "bg-slate-50 opacity-80"} ${errosDaEtapa.length ? "border-red-300" : ""}`}
              >
                <legend className="sr-only">{e.titulo}</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    aria-label={`Ordem de ${e.titulo}`}
                    className="h-8 w-20"
                    value={e.ordem}
                    onChange={(ev) => alterar(e.codigo, { ordem: Math.max(0, Math.floor(Number(ev.target.value) || 0)) })}
                  />
                  <Input aria-label={`Nome da etapa ${e.codigo}`} className="h-8 flex-1 min-w-48" value={e.titulo} onChange={(ev) => alterar(e.codigo, { titulo: ev.target.value })} />
                  <span className={`text-xs rounded px-1.5 py-0.5 ${pelaLei ? "bg-slate-800 text-white" : e.obrigatoria ? "bg-slate-200 text-slate-800" : "bg-blue-100 text-blue-900"}`}>
                    {pelaLei ? "obrigatória pela lei" : e.obrigatoria ? "obrigatória no órgão" : "opcional"}
                  </span>
                  {e.fundamento && <span className="text-xs text-slate-500">{e.fundamento}</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm items-center">
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={e.ligada} disabled={e.obrigatoria} onChange={(ev) => alterar(e.codigo, { ligada: ev.target.checked })} /> Ligada
                  </label>
                  {!pelaLei && (
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={e.obrigatoria} onChange={(ev) => alterar(e.codigo, { obrigatoria: ev.target.checked, ligada: ev.target.checked ? true : e.ligada })} /> Obrigatória no
                      órgão
                    </label>
                  )}
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={e.ia_rascunho} onChange={(ev) => alterar(e.codigo, { ia_rascunho: ev.target.checked })} /> IA prepara o rascunho
                  </label>
                  {e.conclusao === "PECAS" && e.tipos_peca.length > 0 && (
                    <label className="inline-flex items-center gap-1" title="A peça feita no sistema só conta depois de aprovada (fluxo de aprovação do órgão) ou assinada">
                      <input type="checkbox" checked={e.aprovacao_interna} onChange={(ev) => alterar(e.codigo, { aprovacao_interna: ev.target.checked })} /> Aprovação interna
                    </label>
                  )}
                  {(dispensaPermitida.has(e.codigo) || e.dispensavel_por_ato) && (
                    <label className="inline-flex items-center gap-1" title="Art. 53, §5º: o processo pode dispensar o parecer informando o nº e a data do ato da autoridade jurídica que define as hipóteses">
                      <input type="checkbox" checked={e.dispensavel_por_ato} onChange={(ev) => alterar(e.codigo, { dispensavel_por_ato: ev.target.checked })} /> Dispensável por ato
                      (art. 53, §5º)
                    </label>
                  )}
                  <label className="inline-flex items-center gap-1">
                    Prazo
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      aria-label={`Prazo de ${e.titulo} em dias úteis`}
                      className="h-8 w-20"
                      value={e.prazo_dias_uteis ?? ""}
                      onChange={(ev) => alterar(e.codigo, { prazo_dias_uteis: ev.target.value === "" ? null : Math.max(0, Math.floor(Number(ev.target.value))) })}
                    />
                    <span className="text-xs text-slate-500">dias úteis</span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 text-sm items-center">
                  <span className="text-slate-700">Quem faz:</span>
                  <select
                    aria-label={`Papel responsável por ${e.titulo}`}
                    className="border rounded h-8 px-1 bg-white"
                    value={e.responsavel.papel ?? ""}
                    onChange={(ev) => alterarResponsavel(e.codigo, "papel", ev.target.value)}
                  >
                    <option value="">— papel —</option>
                    {tela.papeis.map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {p.rotulo}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Setor responsável por ${e.titulo}`}
                    className="border rounded h-8 px-1 bg-white"
                    value={e.responsavel.setor_id ?? ""}
                    onChange={(ev) => alterarResponsavel(e.codigo, "setor_id", ev.target.value)}
                  >
                    <option value="">— qualquer setor —</option>
                    {tela.setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Pessoa responsável por ${e.titulo}`}
                    className="border rounded h-8 px-1 bg-white"
                    value={e.responsavel.usuario_id ?? ""}
                    onChange={(ev) => alterarResponsavel(e.codigo, "usuario_id", ev.target.value)}
                  >
                    <option value="">— pessoa (opcional) —</option>
                    {tela.usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-slate-700">
                    Depende de: {e.depende_de.length ? e.depende_de.map(titulo).join(", ") : "nenhuma (pode começar logo)"}
                  </summary>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {ordenadas
                      .filter((x) => x.codigo !== e.codigo)
                      .map((x) => (
                        <label key={x.codigo} className="inline-flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={e.depende_de.includes(x.codigo)} onChange={(ev) => alternarDependencia(e.codigo, x.codigo, ev.target.checked)} />
                          {x.titulo}
                          {!x.ligada ? " (desligada)" : ""}
                        </label>
                      ))}
                  </div>
                </details>
                {errosDaEtapa.length > 0 && (
                  <ul className="text-xs text-red-800 list-disc ml-5">
                    {errosDaEtapa.map((x, i) => (
                      <li key={i}>{x.mensagem}</li>
                    ))}
                  </ul>
                )}
              </fieldset>
            )
          })}
        </CardContent>
      </Card>

      {admin && (
        <div
          className={`sticky bottom-0 z-10 -mx-2 px-4 py-3 rounded-lg border shadow-sm flex items-center justify-between gap-3 flex-wrap ${
            alterado ? "bg-amber-50 border-amber-300" : retorno?.tipo === "erro" ? "bg-red-50 border-red-300" : "bg-white border-slate-200"
          }`}
        >
          {statusSalvar}
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={restaurar} disabled={salvando}>
              <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" /> Restaurar modelo padrão
            </Button>
            <Button onClick={salvar} disabled={salvando || !alterado || erros.length > 0}>
              {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" aria-hidden="true" />} Salvar modelo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
