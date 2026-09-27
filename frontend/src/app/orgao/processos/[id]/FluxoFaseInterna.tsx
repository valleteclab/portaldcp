"use client"

/**
 * VISÃO DA FASE INTERNA (F3b — plano PLANO-FLUXO-TRAMITACAO.md §10) — na área
 * da etapa atual da tela do processo, na mesma linguagem da barra de etapas do
 * processo inteiro:
 *  - aprovação da demanda (início do processo de compra): "Aguardando
 *    aprovação da demanda por <aprovador>" + "Aprovar a demanda" para quem pode;
 *  - DESENHO das etapas em colunas por nível de dependência: as que não
 *    dependem umas das outras ficam lado a lado e andam ao mesmo tempo; a que
 *    depende de outra mostra "Aguardando: …" e não tem ação de início;
 *  - em cada etapa: situação, responsável, prazo, peças; Abrir (tela da
 *    etapa), Avançar (despacho da etapa de registro ou confirmar a revisão) e
 *    Voltar (motivo obrigatório; as dependentes concluídas ficam "a revisar");
 *  - parecer dispensado por ato do jurídico (art. 53, §5º), quando o modelo permite.
 * As etapas vêm da tela do processo (useEtapasFluxo — GET /api/fase-interna/:id/etapas);
 * as ações devolvem as etapas atualizadas e avisam a tela (topo "Está com…" e
 * linha do tempo recarregam).
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, FileStack, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { JuntarDocumentosDialog } from "@/components/fase-interna/externa/JuntarDocumentosDialog"
import { carregarRascunhoIa, paragrafosDoRascunho } from "@/components/fase-interna/etapas/RascunhoIaFaixa"
import { DesenhoFaseInterna } from "@/components/fase-interna/fluxo/DesenhoFaseInterna"
import { mensagemDoErro } from "@/components/fase-interna/fluxo/despacho"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { hojeBrasilia } from "@/lib/fase-interna/telas"
import { dependentesAfetados, todosOsPassos, type AcaoConcluir, type EtapasFluxoResposta, type PassoFluxo } from "@/lib/fase-interna/visao-fluxo"
import type { EtapasFluxo } from "./useEtapasFluxo"

/** Entrega 4 — resumo do motor de conformidade (GET /fase-interna/:id/conformidade/resumo). */
interface ResumoConformidade {
  aplicavel: boolean
  revisado_em: string | null
  bloqueios: number
  atencoes: number
  impedem_publicar: number
  achados: Array<{ id: string; regra: string; titulo: string; severidade: string; exige_justificativa: boolean }>
  destino: string
}

/** Fase interna feita fora (GET /api/fase-interna/:id/externa): pendências da juntada ainda abertas. */
interface SituacaoExterna {
  externa: boolean
  modo: "EXTERNA" | "MISTA" | null
  pendencias: Array<{ tipo: string; titulo: string; arquivo: string | null; erro: string }>
  pode_juntar: boolean
}

/** Como a aprovação da demanda foi dada (mesmos rótulos do histórico no servidor). */
const ORIGEM_APROVACAO: Record<string, string> = {
  DEMANDA: "demanda aprovada no módulo de demandas",
  PECA_EXTERNA: "DFD juntada feita fora — a aprovação consta da peça",
  APROVADOR: "feita, aprovada ou assinada por quem aprova",
  MANUAL: "aprovação registrada no processo",
  LEGADO: "processo anterior ao modelo de fluxo",
}

export function FluxoFaseInterna({
  licitacaoId,
  atualizacao,
  fluxo,
  interna,
  onAtualizado,
}: {
  licitacaoId: string
  atualizacao?: unknown
  fluxo: EtapasFluxo
  interna: boolean
  onAtualizado?: () => void
}) {
  const dados = fluxo.dados
  const [externa, setExterna] = useState<SituacaoExterna | null>(null)
  const [juntando, setJuntando] = useState(false)
  const [historico, setHistorico] = useState(false)
  const [conformidade, setConformidade] = useState<ResumoConformidade | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [dispensando, setDispensando] = useState(false)
  const { pedirTexto, dialogo } = useDialogoConfirmacao()

  const carregarExtras = useCallback(async () => {
    try {
      const c = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/conformidade/resumo`)
      if (c.ok) setConformidade(await c.json())
      const x = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/externa`)
      if (x.ok) setExterna(await x.json())
    } catch {
      /* quadros auxiliares ficam ocultos */
    }
  }, [licitacaoId])
  useEffect(() => { carregarExtras() }, [carregarExtras, atualizacao])

  /**
   * Ação do fluxo: devolve as etapas atualizadas; erro do servidor (403/400/409)
   * aparece na tela. Resolve com a mensagem de erro, ou null quando deu certo.
   */
  const acao = async (url: string, corpo: unknown, ok: string): Promise<string | null> => {
    setOcupado(true)
    setErroAcao(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error(await mensagemDoErro(r, "Não foi possível concluir a ação"))
      fluxo.definir((await r.json()) as EtapasFluxoResposta)
      onAtualizado?.()
      carregarExtras()
      toast.success(ok)
      return null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErroAcao(msg)
      toast.error(msg)
      return msg
    } finally {
      setOcupado(false)
    }
  }

  if (!dados?.etapas?.length) {
    return fluxo.erro ? (
      <p role="alert" className="text-sm text-red-800">Fluxo da fase interna indisponível: {fluxo.erro}</p>
    ) : null
  }
  const aprovacao = dados.aprovacao_demanda
  const passos = todosOsPassos(dados)

  const aprovarDemanda = async () => {
    const obs = await pedirTexto({
      titulo: "Aprovar a demanda",
      mensagem: "A aprovação da demanda dá início ao processo de compra: as etapas seguintes passam a poder andar. Fica registrada no histórico com o seu nome.",
      rotulo: "Observação (opcional)",
      confirmarRotulo: "Aprovar a demanda",
    })
    if (obs === null) return
    await acao("demanda/aprovar", obs ? { observacao: obs } : {}, "Demanda aprovada.")
  }

  const concluir = async (p: PassoFluxo, a: AcaoConcluir) => {
    // F4a: despacho da etapa de registro sugerido pela IA (rascunho ao chegar) — vem no campo para revisar
    const ia = a.tipo === "REGISTRO" ? await carregarRascunhoIa(licitacaoId, "REGISTRO", p.passo) : null
    const sugerido = ia?.rascunho && ["GERADO", "ACEITO"].includes(ia.rascunho.status) && !ia.rascunho.revisado_por_nome ? ia.rascunho : null
    const textoSugerido = sugerido ? paragrafosDoRascunho(sugerido.secoes.find((x) => x.id === "texto")?.texto ?? "").join("\n") : ""
    const texto = await pedirTexto({
      titulo: `${a.rotulo} — ${p.titulo}`,
      mensagem:
        a.tipo === "REGISTRO"
          ? `Esta etapa conclui com o despacho registrado no processo.${
              textoSugerido ? `\n\nTexto sugerido pela IA em ${fmtBrasilia(sugerido!.gerado_em)} — revise antes de registrar (quem registra fica como revisor).` : ""
            }`
          : "Confirme que a etapa foi conferida depois da etapa que voltou. Ela volta a contar como concluída.",
      valorInicial: textoSugerido || undefined,
      rotulo: a.pedido,
      placeholder: a.tipo === "REGISTRO" ? "Ex.: Autorizo o início do processo de contratação." : "Ex.: Conferido — o TR continua compatível com o ETP revisto.",
      obrigatorio: true,
      minimo: 10,
      confirmarRotulo: a.rotulo,
    })
    if (texto === null) return
    // Usou o texto da IA: o rascunho vira "aceito" e o registro do despacho anota quem revisou
    if (sugerido?.status === "GERADO") {
      await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/rascunho-ia/${sugerido.id}/aceitar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null)
    }
    await acao(`etapas/${p.passo}/concluir`, { texto }, a.tipo === "REGISTRO" ? "Despacho registrado." : "Revisão registrada.")
  }

  const voltar = async (p: PassoFluxo) => {
    const afetadas = dependentesAfetados(p.passo, passos)
    const desfazAprovacao = !!aprovacao?.exigida && aprovacao.aprovada && aprovacao.etapa === p.passo
    const motivo = await pedirTexto({
      titulo: `Voltar a etapa "${p.titulo}"`,
      mensagem: [
        "A etapa volta para ajuste. Nenhuma peça é apagada.",
        afetadas.length
          ? `As etapas que dependem dela e já estavam concluídas ficam "a revisar" até serem conferidas de novo: ${afetadas.map((x) => x.titulo).join(", ")}.`
          : "Nenhuma etapa concluída depende dela.",
        desfazAprovacao ? "A aprovação da demanda é desfeita e precisa ser dada de novo." : null,
        "Enquanto houver etapa reaberta ou a revisar, a trava da lei segura a publicação.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      rotulo: "Motivo (vai para o histórico do processo)",
      obrigatorio: true,
      minimo: 10,
      confirmarRotulo: "Voltar a etapa",
      destrutivo: true,
    })
    if (motivo === null) return
    await acao(`etapas/${p.passo}/reabrir`, { motivo }, `Etapa "${p.titulo}" reaberta.`)
  }

  const irParaPeca = (tipo: string | null) => {
    const el = tipo ? document.getElementById(`peca-${tipo}`) : null
    if (el) {
      history.replaceState(null, "", `#peca-${tipo}`)
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    } else {
      document.getElementById("area-etapa-atual")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <section id="fluxo-fase-interna" aria-label="Fluxo da fase interna" className="border rounded-md p-3 bg-white space-y-3 scroll-mt-4 min-w-0">
      {dialogo}
      <JuntarDocumentosDialog
        licitacaoId={licitacaoId}
        aberto={juntando}
        onFechar={() => setJuntando(false)}
        onJuntado={() => { fluxo.recarregar(); carregarExtras(); onAtualizado?.() }}
      />
      {dispensando && (
        <DispensarParecerDialog
          onFechar={() => setDispensando(false)}
          onConfirmar={async (corpo) => {
            const erro = await acao("parecer/dispensar", corpo, "Dispensa do parecer registrada (art. 53, §5º).")
            if (!erro) setDispensando(false)
            return erro
          }}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Fluxo da fase interna</h3>
          <p className="text-xs text-gray-600">
            {dados.concluidas} de {dados.total} etapas concluídas · {dados.modo === "SIMPLES" ? "modo simples (tudo com o agente)" : "por setor"}
            {dados.modelo?.nome ? ` · fluxo: ${dados.modelo.nome}${dados.modelo.versao ? ` (versão ${dados.modelo.versao})` : ""}` : ""}
          </p>
        </div>
        {externa?.pode_juntar !== false && (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setJuntando(true)}>
            <FileStack className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Juntar documentos feitos fora (vários PDFs)
          </Button>
        )}
      </div>

      {externa && externa.pendencias.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-950" role="status">
          <b>Pendências da juntada dos documentos feitos fora:</b>
          <ul className="mt-1 space-y-0.5">
            {externa.pendencias.map((p, i) => (
              <li key={`${p.tipo}-${i}`}>{p.titulo}{p.arquivo ? ` ("${p.arquivo}")` : ""} — {p.erro}</li>
            ))}
          </ul>
          <button type="button" className="mt-1 text-blue-800 hover:underline" onClick={() => setJuntando(true)}>Juntar de novo →</button>
        </div>
      )}

      {/* Início do processo de compra = aprovação da demanda (pedido do dono) */}
      {aprovacao?.exigida && !aprovacao.aprovada && (
        <div className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap" role="status">
          <div className="min-w-0 text-sm text-amber-950">
            <p className="font-semibold">Aguardando aprovação da demanda por {aprovacao.aprovador.rotulo}</p>
            <p className="text-xs">A aprovação da demanda dá início ao processo de compra. As etapas que dependem dela só começam depois.</p>
          </div>
          {(aprovacao.pode_aprovar || aprovacao.eh_aprovador) && (
            <div className="text-right">
              <Button
                size="sm"
                disabled={ocupado || !aprovacao.pode_aprovar}
                onClick={aprovarDemanda}
                aria-describedby={!aprovacao.pode_aprovar && aprovacao.motivo_bloqueio ? "motivo-aprovar-demanda" : undefined}
              >
                {ocupado ? <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 mr-1" aria-hidden="true" />}
                Aprovar a demanda
              </Button>
              {!aprovacao.pode_aprovar && aprovacao.motivo_bloqueio && (
                <p id="motivo-aprovar-demanda" className="text-xs text-amber-950 mt-1 max-w-xs">{aprovacao.motivo_bloqueio}</p>
              )}
            </div>
          )}
        </div>
      )}
      {aprovacao?.exigida && aprovacao.aprovada && aprovacao.registro && (
        <p className="flex items-center gap-1.5 text-xs text-green-900">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          Demanda aprovada
          {aprovacao.registro.por_nome ? ` por ${aprovacao.registro.por_nome}` : ""}
          {aprovacao.registro.em ? ` em ${fmtBrasilia(aprovacao.registro.em)}` : ""}
          {aprovacao.registro.origem && ORIGEM_APROVACAO[aprovacao.registro.origem] ? ` (${ORIGEM_APROVACAO[aprovacao.registro.origem]})` : ""}
        </p>
      )}

      {conformidade?.aplicavel && (
        <div
          className={`rounded border px-2.5 py-2 text-xs flex items-start justify-between gap-2 flex-wrap ${conformidade.impedem_publicar ? "border-[#E8B48C] bg-[#FBEBDD]" : "bg-[#E3ECF5] border-[#C5D6E8]"}`}
          role="status"
        >
          <div className="min-w-0">
            <span className="font-semibold text-gray-900">Conformidade das peças: </span>
            {conformidade.bloqueios} bloqueio(s) · {conformidade.atencoes} atenção(ões)
            {conformidade.impedem_publicar ? ` — ${conformidade.impedem_publicar} impede(m) publicar` : " — nada impede publicar"}
            {conformidade.achados.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {conformidade.achados.map((a) => (
                  <li key={a.id}>
                    <span className="font-mono text-[10px] text-gray-600 mr-1">{a.regra}</span>
                    {a.titulo}
                    {a.severidade === "BLOQUEIO" ? " (bloqueio)" : a.exige_justificativa ? " (justificar)" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link className="text-blue-800 hover:underline shrink-0" href={conformidade.destino}>
            Abrir a conformidade →
          </Link>
        </div>
      )}

      {erroAcao && (
        <p role="alert" className="flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{erroAcao}</span>
        </p>
      )}

      <DesenhoFaseInterna
        licitacaoId={licitacaoId}
        dados={dados}
        interna={interna}
        ocupado={ocupado}
        acoes={{ onConcluir: concluir, onVoltar: voltar, onIrParaPeca: irParaPeca, onDispensarParecer: () => setDispensando(true) }}
      />

      {dados.historico.length > 0 && (
        <div>
          <button type="button" className="text-xs text-blue-800 hover:underline" onClick={() => setHistorico((h) => !h)} aria-expanded={historico}>
            {historico ? "Ocultar histórico das etapas" : "Ver histórico das etapas e tarefas"}
          </button>
          {historico && (
            <ul className="mt-1 space-y-0.5 text-xs text-gray-700 max-h-48 overflow-y-auto">
              {dados.historico.map((h, i) => (
                <li key={i}>
                  <span className="text-gray-500">{fmtBrasilia(h.created_at)}</span> — {h.descricao}
                  {h.usuario_nome ? ` (${h.usuario_nome})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * PARECER DISPENSADO POR ATO (art. 53, §5º): número e data do ato da
 * autoridade jurídica que define as hipóteses (obrigatórios; data não futura).
 * O registro vira o "não se aplica" do parecer, citando o ato nos autos.
 */
function DispensarParecerDialog({
  onFechar,
  onConfirmar,
}: {
  onFechar: () => void
  /** Resolve com a mensagem de erro do servidor, ou null quando registrou. */
  onConfirmar: (corpo: { numero_ato: string; data_ato: string; hipotese?: string }) => Promise<string | null>
}) {
  const [numero, setNumero] = useState("")
  const [data, setData] = useState("")
  const [hipotese, setHipotese] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const confirmar = async () => {
    if (!numero.trim()) return setErro("Informe o número do ato do jurídico.")
    if (!data) return setErro("Informe a data do ato.")
    if (data > hojeBrasilia()) return setErro("A data do ato não pode ser futura.")
    setErro(null)
    setEnviando(true)
    const e = await onConfirmar({ numero_ato: numero.trim(), data_ato: data, ...(hipotese.trim() ? { hipotese: hipotese.trim() } : {}) })
    setEnviando(false)
    if (e) setErro(e)
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dispensar o parecer jurídico</DialogTitle>
          <DialogDescription>
            Só nas hipóteses definidas em ato da autoridade jurídica (Lei 14.133/2021, art. 53, §5º). O ato é citado nos autos, no termo de justificativas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[10rem]">
              <Label htmlFor="ato-numero">Nº do ato *</Label>
              <Input id="ato-numero" className="mt-1" value={numero} placeholder="Ex.: Portaria 12/2025" onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ato-data">Data do ato *</Label>
              <Input id="ato-data" type="date" className="mt-1 w-44" max={hojeBrasilia()} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="ato-hipotese">Hipótese do ato (opcional)</Label>
            <Textarea id="ato-hipotese" className="mt-1" rows={2} value={hipotese} placeholder="Ex.: contratação direta de baixo valor com minuta padronizada" onChange={(e) => setHipotese(e.target.value)} />
          </div>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={confirmar} disabled={enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" />}
            Registrar a dispensa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
