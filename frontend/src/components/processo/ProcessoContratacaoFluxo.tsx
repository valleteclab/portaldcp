"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, ChevronDown } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { pedirTextoAcao } from "@/components/DialogoGlobal"
import { diaMes, type Andamento, type NoAndamento } from "@/lib/fluxo/andamento"
import { telaDaFaseInterna } from "@/lib/fluxo/ponte"
import { ETAPAS_DA_BARRA, aoAtualizarFaseInterna } from "@/lib/fase-interna/telas"
import { rotuloModalidade } from "@/lib/licitacao-rotulos"
import type { ComQuemEsta, ConteudoLicitacao, EventoLinhaDoTempo, ProcessoVisao } from "@/lib/processo/processo"
import { BlocoDadosLicitacao, SecaoLinhaDoTempo } from "@/components/processo/BlocosProcesso"
import { BotaoGerarAutos } from "@/app/orgao/processos/[id]/BotaoGerarAutos"

/**
 * TELA DO PROCESSO DE CONTRATAÇÃO QUE SEGUE O FLUXO (mockup "Processo enxuto",
 * aprovado em 10/10/2026): onde está, com quem, o que falta e UMA ação para
 * quem está com o processo. O processo anda sozinho pelo fluxo — sem "Enviar
 * para". Cada documento abre a tela da fase interna que já existe (e a
 * pesquisa de preços abre a pesquisa de sempre: PNCP, internet e as fontes
 * configuradas). O resto fica recolhido.
 */

const AZUL = "#1351b4"

interface ItemInstrucao {
  tipo: string
  titulo: string
  obrigatorio: boolean
  status: string
}

interface ConsumoLimite {
  aplicavel: boolean
  inciso?: "I" | "II"
  exercicio: number
  limite?: { valor: number; ato_normativo: string } | null
  maior: { percentual: number; excede: boolean } | null
}

async function acaoDaEtapa(caminho: string, corpo?: unknown): Promise<{ ok: boolean; mensagem: string | null; pendencias: string[] | null }> {
  try {
    const r = await authFetch(`${API_URL}/api/workflows${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo ?? {}),
    })
    const j = await r.json().catch(() => null)
    if (r.ok) return { ok: true, mensagem: null, pendencias: null }
    const m = Array.isArray(j?.message) ? j.message.join("; ") : j?.message
    return { ok: false, mensagem: m || "Não foi possível concluir a operação.", pendencias: Array.isArray(j?.pendencias) ? j.pendencias : null }
  } catch {
    return { ok: false, mensagem: "Sem conexão com o servidor. Verifique sua internet e tente de novo.", pendencias: null }
  }
}

/** Tela da fase interna de uma peça da instrução (DFD → dfd, PP → pesquisa…). */
function telaDaPeca(tipo: string): string | null {
  return ETAPAS_DA_BARRA.find((e) => e.tipos.includes(tipo))?.tela ?? null
}

/** Rota da fase interna de uma etapa do fluxo (para ligar documento ↔ etapa ↔ responsável). */
function rotaDaEtapa(no: NoAndamento, licitacaoId: string): string | null {
  const href = telaDaFaseInterna(no.tipo, licitacaoId)?.href ?? null
  const m = href?.match(/fase-interna\/([a-z-]+)/)
  return m ? m[1] : null
}

const moeda = (v: unknown) => {
  const n = Number(v)
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function ProcessoContratacaoFluxo({
  processo,
  licitacao,
  andamento,
  posse,
  podeReceber,
  onReceber,
  recebendo,
  erroReceber,
  linhaDoTempo,
  onAtualizar,
}: {
  processo: ProcessoVisao
  licitacao: ConteudoLicitacao | null
  andamento: Andamento
  posse: ComQuemEsta | null
  podeReceber: boolean
  onReceber: () => void
  recebendo: boolean
  erroReceber: string | null
  linhaDoTempo: EventoLinhaDoTempo[]
  onAtualizar: () => void
}) {
  const licitacaoId = andamento.licitacao_id!
  const atual = andamento.atual
  const idxAtual = atual ? andamento.nos.findIndex((n) => n.chave === atual.chave) : -1
  const proxima = idxAtual >= 0 ? andamento.nos[idxAtual + 1] ?? null : null
  const podeAgir = !!andamento.pode_agir && !andamento.encerrado
  const ponte = atual ? telaDaFaseInterna(atual.tipo, licitacaoId) : null
  const ehAprovacao = atual?.tipo === "APROVACAO"
  const ehPrimeira = idxAtual === 0

  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const linhaMeta = [
    rotuloModalidade(licitacao?.modalidade) || null,
    licitacao?.fundamento_legal || null,
    moeda(licitacao?.valor_total_estimado),
    `Processo nº ${processo.numero}`,
  ]
    .filter(Boolean)
    .join(" · ")

  async function concluir(resposta?: Record<string, unknown>) {
    if (!atual?.tarefa_id || !andamento.instancia_id) return
    setErro(null)
    setPendencias(null)
    setProcessando(true)
    const r = await acaoDaEtapa(`/execucoes/${andamento.instancia_id}/tarefas/${atual.tarefa_id}/concluir`, { resposta })
    setProcessando(false)
    if (!r.ok) {
      setErro(r.mensagem)
      setPendencias(r.pendencias)
      return
    }
    setAviso(
      !proxima
        ? `${atual.titulo} concluída. O fluxo deste processo chegou ao fim.`
        : proxima.responsavel && proxima.responsavel !== atual.responsavel
          ? `${atual.titulo} concluída. O processo foi enviado a ${proxima.responsavel} pelo fluxo, com despacho registrado nos autos.`
          : `${atual.titulo} concluída. A próxima etapa, ${proxima.titulo}, também fica com você.`,
    )
    onAtualizar()
  }

  async function devolver() {
    if (!atual?.tarefa_id || !andamento.instancia_id) return
    const motivo = await pedirTextoAcao({ titulo: "Devolver à etapa anterior", mensagem: "Explique ao responsável anterior por que está devolvendo.", rotulo: "Motivo", obrigatorio: true, minimo: 3 })
    if (!motivo) return
    setErro(null)
    setProcessando(true)
    const r = await acaoDaEtapa(`/execucoes/${andamento.instancia_id}/tarefas/${atual.tarefa_id}/devolver`, { motivo })
    setProcessando(false)
    if (!r.ok) return setErro(r.mensagem)
    setAviso(`Processo devolvido à etapa anterior.`)
    onAtualizar()
  }

  async function indeferir() {
    if (!atual?.tarefa_id || !andamento.instancia_id) return
    const motivo = await pedirTextoAcao({ titulo: "Indeferir", mensagem: "Explique o motivo. O indeferimento encerra este processo.", rotulo: "Motivo", obrigatorio: true, minimo: 3 })
    if (!motivo) return
    setErro(null)
    setProcessando(true)
    const r = await acaoDaEtapa(`/execucoes/${andamento.instancia_id}/tarefas/${atual.tarefa_id}/indeferir`, { motivo })
    setProcessando(false)
    if (!r.ok) return setErro(r.mensagem)
    onAtualizar()
  }

  // De onde o processo chegou (a posse da fase interna): "Chegou pelo fluxo em 07/10"
  const chegou = posse
    ? [
        posse.despacho?.startsWith("Encaminhado pelo fluxo") ? "Chegou pelo fluxo" : posse.enviado_por ? `Enviado por ${posse.enviado_por}` : "Chegou",
        posse.desde ? `em ${diaMes(posse.desde)}` : null,
        !posse.recebida ? "· aguardando recebimento" : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null

  const depois = !atual
    ? null
    : !proxima
      ? "Esta é a última etapa do fluxo."
      : proxima.responsavel && proxima.responsavel === atual.responsavel
        ? `Ao concluir, a próxima etapa (${proxima.titulo}) também fica com ${podeAgir ? "você" : atual.responsavel}.`
        : `Ao concluir, o processo segue sozinho para ${proxima.responsavel ?? "o próximo responsável"} (${proxima.titulo}). Não é preciso usar "Enviar para".`

  return (
    <div className="flex flex-col gap-4 text-[#111827]">
      <div className="text-sm text-gray-600">
        <Link href="/orgao/processo" className="text-[#1351b4] hover:underline">
          Processos
        </Link>{" "}
        / {processo.numero}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold">{processo.objeto}</h1>
          <p className="m-0 text-sm text-gray-700">{linhaMeta}</p>
        </div>
        <MaisAcoes
          licitacaoId={licitacaoId}
          numeroProcesso={processo.numero}
          linkDocumentoAtual={podeAgir ? ponte?.href ?? null : null}
          onDevolver={podeAgir && !ehPrimeira && !ehAprovacao ? devolver : null}
        />
      </header>

      {aviso ? (
        <p role="status" className="m-0 flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          {aviso}
        </p>
      ) : null}

      <section aria-label="Onde está" className="flex flex-col gap-3.5 rounded-xl border border-[#E3E7EC] bg-white p-5">
        {andamento.encerrado || !atual ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Situação</span>
            <span className="text-lg font-bold">Fluxo concluído</span>
            <span className="text-sm text-gray-700">Todas as etapas do fluxo foram concluídas.</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {podeAgir ? `Com você${atual.responsavel ? ` · ${atual.responsavel}` : ""}` : `Está com ${atual.responsavel ?? "o responsável da etapa"}`}
              </span>
              <span className="text-lg font-bold">{atual.titulo}</span>
              <span className="text-sm text-gray-700">
                {[atual.desde ? `Desde ${diaMes(atual.desde)}` : null, atual.prazo_em ? `prazo ${atual.atrasada ? "vencido em" : "até"} ${diaMes(atual.prazo_em)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {chegou ? <span className="text-xs text-gray-500">{chegou}</span> : null}
            </div>
            {podeReceber ? (
              <button
                type="button"
                onClick={onReceber}
                disabled={recebendo}
                className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                style={{ background: AZUL }}
              >
                {recebendo ? "Recebendo..." : "Receber processo"}
              </button>
            ) : podeAgir && ehAprovacao ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => concluir({ decisao: "APROVADO" })} disabled={processando} className="h-11 rounded-lg px-5 text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: AZUL }}>
                  {processando ? "Aprovando..." : "Aprovar"}
                </button>
                {!ehPrimeira ? (
                  <button type="button" onClick={devolver} disabled={processando} className="h-11 rounded-lg border border-[#CBD3DA] bg-white px-4 text-sm font-medium">
                    Devolver
                  </button>
                ) : null}
                <button type="button" onClick={indeferir} disabled={processando} className="h-11 rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-800">
                  Indeferir
                </button>
              </div>
            ) : podeAgir ? (
              <div className="flex flex-wrap items-center gap-2">
                {ponte ? (
                  <Link href={ponte.href} className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[15px] font-semibold text-white no-underline" style={{ background: AZUL }}>
                    {ponte.rotulo.replace(/ na (fase interna|tela da licitação)$/, "")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => concluir()}
                  disabled={processando}
                  className={ponte ? "h-11 rounded-lg border border-[#CBD3DA] bg-white px-4 text-sm font-medium disabled:opacity-60" : "h-11 rounded-lg px-5 text-[15px] font-semibold text-white disabled:opacity-60"}
                  style={ponte ? undefined : { background: AZUL }}
                >
                  {processando ? "Concluindo..." : proxima?.responsavel && proxima.responsavel !== atual.responsavel ? `Concluir e enviar a ${proxima.responsavel}` : "Concluir etapa"}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {erroReceber ? <p className="m-0 text-sm text-red-800" role="alert">{erroReceber}</p> : null}
        {pendencias?.length ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <b>Falta para concluir esta etapa:</b>
            <ul className="mb-0 mt-1 pl-5">
              {pendencias.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ) : erro ? (
          <p role="alert" className="m-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {erro}
          </p>
        ) : null}

        <Caminho nos={andamento.nos} />
        {depois && !andamento.encerrado ? <p className="m-0 text-sm text-gray-600">{depois}</p> : null}
      </section>

      <LimiteDispensaLinha licitacaoId={licitacaoId} />

      <DocumentosDoProcesso licitacaoId={licitacaoId} andamento={andamento} />

      <section aria-label="Mais informações" className="flex flex-col gap-2">
        <BlocoDadosLicitacao licitacaoId={licitacaoId} lic={licitacao} />
        <SecaoLinhaDoTempo eventos={linhaDoTempo} />
      </section>
    </div>
  )
}

/** Barra do caminho: etapas do fluxo com o setor de cada uma. */
function Caminho({ nos }: { nos: NoAndamento[] }) {
  return (
    <ol aria-label="Caminho do processo" className="m-0 grid list-none gap-1.5 p-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, nos.length)}, minmax(0, 1fr))` }}>
      {nos.map((n) => {
        const cor = n.situacao === "CONCLUIDA" ? "#16A34A" : n.situacao === "EM_ANDAMENTO" ? (n.atrasada ? "#C2410C" : AZUL) : "#E5E7EB"
        return (
          <li key={n.chave} className="flex min-w-0 flex-col gap-1" title={`${n.titulo}${n.responsavel ? ` — ${n.responsavel}` : ""}`}>
            <span className="h-1.5 rounded-full" style={{ background: cor }} aria-hidden="true" />
            <span className={`truncate text-xs ${n.situacao === "EM_ANDAMENTO" ? "font-bold text-gray-900" : "font-medium text-gray-500"}`}>
              {n.situacao === "CONCLUIDA" ? "✓ " : ""}
              {n.titulo}
            </span>
            <span className="truncate text-[11px] text-gray-500">{n.responsavel ?? "—"}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** O alerta do limite da dispensa numa linha só (art. 75, §1º) — só quando passa de 80%. */
function LimiteDispensaLinha({ licitacaoId }: { licitacaoId: string }) {
  const [dados, setDados] = useState<ConsumoLimite | null>(null)
  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/consumo-limite`)
      .then(async (r) => vivo && setDados(r.ok ? await r.json() : null))
      .catch(() => vivo && setDados(null))
    return () => {
      vivo = false
    }
  }, [licitacaoId])
  const m = dados?.aplicavel ? dados.maior : null
  if (!m || (!m.excede && m.percentual < 80)) return null
  const pct = m.percentual.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <p role="note" className={`m-0 rounded-lg border px-4 py-2.5 text-sm ${m.excede ? "border-red-300 bg-red-50 text-red-950" : "border-orange-300 bg-orange-50 text-orange-950"}`}>
      <b>Limite da dispensa:</b> {m.excede ? "este processo passa do limite" : `este processo leva o órgão a ${pct}% do limite`} de {dados?.exercicio} (art. 75, {dados?.inciso ?? "II"}).{" "}
      {m.excede ? "Revise o enquadramento." : "Atenção ao fracionamento."}
    </p>
  )
}

/** Documentos da instrução: obrigatórios à vista, "se for o caso" recolhidos; cada um abre a sua tela. */
function DocumentosDoProcesso({ licitacaoId, andamento }: { licitacaoId: string; andamento: Andamento }) {
  const [itens, setItens] = useState<ItemInstrucao[] | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => aoAtualizarFaseInterna(licitacaoId, () => setVersao((v) => v + 1)), [licitacaoId])
  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/instrucao`)
      .then(async (r) => vivo && setItens(r.ok ? ((await r.json())?.itens ?? []) : []))
      .catch(() => vivo && setItens([]))
    return () => {
      vivo = false
    }
  }, [licitacaoId, versao])

  // Documento ↔ etapa do fluxo pela tela da fase interna: diz quem responde e se é a etapa de agora
  const etapaPorTela = useMemo(() => {
    const m = new Map<string, NoAndamento>()
    for (const n of andamento.nos) {
      const rota = rotaDaEtapa(n, licitacaoId)
      if (rota && !m.has(rota)) m.set(rota, n)
    }
    return m
  }, [andamento.nos, licitacaoId])

  if (!itens) return null
  const obrigatorias = itens.filter((i) => i.obrigatorio)
  const opcionais = itens.filter((i) => !i.obrigatorio)
  const prontas = obrigatorias.filter((i) => i.status === "OK").length
  const feitasOpcionais = opcionais.filter((i) => i.status === "OK" || i.status === "NAO_SE_APLICA").length

  const linha = (it: ItemInstrucao) => {
    const tela = telaDaPeca(it.tipo)
    const etapa = tela ? etapaPorTela.get(tela) : undefined
    const agora = etapa?.situacao === "EM_ANDAMENTO"
    const situacao =
      it.status === "OK"
        ? "Pronto"
        : it.status === "NAO_SE_APLICA"
          ? "Não se aplica"
          : it.status === "EM_ASSINATURA"
            ? "Em assinatura"
            : it.status === "EM_APROVACAO"
              ? "Em aprovação"
              : it.status === "EM_ELABORACAO"
                ? "Em elaboração"
                : etapa?.responsavel
                  ? `${etapa.responsavel}${agora ? " · agora" : ""}`
                  : "A fazer"
    const cor = it.status === "OK" ? "#16A34A" : it.status === "NAO_SE_APLICA" ? "#9CA3AF" : agora ? AZUL : "#9CA3AF"
    return (
      <li key={it.tipo} className="flex items-center justify-between gap-3 border-t border-[#F1F3F6] py-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2" style={{ borderColor: cor, background: it.status === "OK" ? cor : "transparent" }} aria-hidden="true" />
          <span className={`text-sm ${it.status === "NAO_SE_APLICA" ? "text-gray-500 line-through" : ""}`}>{it.titulo}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-gray-500">{situacao}</span>
          {tela ? (
            <Link href={`/orgao/processos/${licitacaoId}/fase-interna/${tela}`} className="text-[13px] font-semibold text-[#1351b4] hover:underline">
              {agora && andamento.pode_agir ? "Abrir" : "Ver"}
            </Link>
          ) : null}
        </span>
      </li>
    )
  }

  return (
    <section aria-labelledby="t-docs-processo" className="flex flex-col gap-2.5 rounded-xl border border-[#E3E7EC] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-docs-processo" className="m-0 text-base font-bold">
          Documentos do processo
        </h2>
        <span className="text-sm text-gray-600">
          {prontas} de {obrigatorias.length} obrigatórios prontos
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">{obrigatorias.map(linha)}</ul>
      {opcionais.length ? (
        <details className="border-t border-[#F1F3F6] pt-2.5">
          <summary className="cursor-pointer text-sm font-semibold text-[#1351b4]">
            Documentos &quot;se for o caso&quot; ({opcionais.length}) · {feitasOpcionais ? `${feitasOpcionais} resolvidos` : "nenhum resolvido"}
          </summary>
          <ul className="m-0 mt-1 flex list-none flex-col p-0">{opcionais.map(linha)}</ul>
        </details>
      ) : null}
    </section>
  )
}

/** "Mais ações": o que não é o caminho normal do processo. */
function MaisAcoes({
  licitacaoId,
  numeroProcesso,
  linkDocumentoAtual,
  onDevolver,
}: {
  licitacaoId: string
  numeroProcesso: string
  linkDocumentoAtual: string | null
  onDevolver: (() => void) | null
}) {
  const item = "block rounded-md px-3 py-2.5 text-sm text-gray-900 no-underline hover:bg-slate-50"
  return (
    <details className="relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-[#CBD3DA] bg-white px-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Mais ações
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-12 z-20 flex w-72 flex-col rounded-xl border border-[#E3E7EC] bg-white p-1.5 shadow-lg">
        {linkDocumentoAtual ? (
          <Link href={linkDocumentoAtual} className={item}>
            Anexar documento feito fora
          </Link>
        ) : null}
        <Link href={`/orgao/processos/${licitacaoId}/editar`} className={item}>
          Editar dados do processo
        </Link>
        <div className="px-1.5 py-1">
          <BotaoGerarAutos licitacaoId={licitacaoId} numeroProcesso={numeroProcesso} />
        </div>
        <Link href={`/orgao/processos/${licitacaoId}?detalhes=1`} className={item}>
          Tela completa da licitação
        </Link>
        {onDevolver ? (
          <button type="button" onClick={onDevolver} className={`${item} mt-1 border-t border-[#F1F3F6] pt-3 text-left`}>
            Devolver à etapa anterior
          </button>
        ) : null}
      </div>
    </details>
  )
}
