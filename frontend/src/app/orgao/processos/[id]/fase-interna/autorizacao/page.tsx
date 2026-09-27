"use client"

/**
 * ETAPA 6 — AUTORIZAÇÃO DA AUTORIDADE (Entrega 3B; mockup Autorizacao, 390 px).
 *  - Para o SIGNATÁRIO designado (ex.: vereador da Mesa Diretora): a tela do
 *    celular — resumo (objeto, teto, modalidade/fundamento, dotação,
 *    requisitante, peças do art. 72 conferidas, folhas dos autos) e os botões
 *    "Autorizar e assinar" / "Devolver com observação".
 *  - Para o agente: gerar o despacho pelo modelo (lê o processo), enviar à
 *    autoridade (signatários da configuração do órgão — autoridade colegiada:
 *    só vale quando TODOS assinam), acompanhar as assinaturas, ou anexar o
 *    despacho assinado fora. O portão B (art. 72) é só MOSTRADO (o bloqueio
 *    vem na Entrega 4).
 * API: GET/POST /api/fase-interna/:id/autorizacao{,/gerar,/enviar,/assinar,/devolver}.
 */
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Circle, FileText, Loader2, PenLine, Send, Undo2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { RascunhoIaFaixa } from "@/components/fase-interna/etapas/RascunhoIaFaixa"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { erroDaApi, fmtDia, fmtMoeda } from "@/lib/fase-interna/telas"
import { textoDaTrava } from "@/lib/fase-interna/travas"
import { AjudaTravaDaLei } from "@/components/fase-interna/fluxo/AjudaTravaDaLei"

interface LinhaPortao {
  inciso: string
  referencia: string
  texto: string
  exigido: boolean
  momento: string
  situacao: "OK" | "PENDENTE" | "EM_ANDAMENTO" | "DEPOIS"
  pecas: Array<{ tipo: string; titulo: string; status: string }>
}

interface AutorizacaoTela {
  licitacao: { id: string; numero_processo: string; objeto: string; fase_interna: boolean }
  situacao: "SEM_DESPACHO" | "EM_ELABORACAO" | "AGUARDANDO_ASSINATURAS" | "AUTORIZADA" | "DEVOLVIDA"
  autoridade: string
  resumo: {
    titulo: string
    objeto: string
    teto: number | null
    teto_sigiloso: boolean
    modalidade: string
    dotacao: string
    dotacao_texto: string | null
    requisitante: string | null
    documentos: string
    documentos_ok: boolean
    folhas: number | null
    portao_b: { linhas: LinhaPortao[]; ok: boolean; pendentes: string[] }
  }
  /** Entrega 4: o que impede autorizar agora (art. 72, I, II e IV; limite da dispensa). */
  portao_b_bloqueios?: string[]
  fundamento_legal: { texto: string | null }
  peca: { documento_id: string; versao: number; status: string; anexada: boolean; tem_arquivo: boolean; gerada_pelo_modelo: boolean; desatualizada: { texto: string } | null } | null
  secoes: Record<string, string>
  signatarios: Array<{ usuario_id: string; nome: string; papel: string; status: string; data_assinatura: string | null }>
  signatarios_configurados: Array<{ usuario_id: string; nome: string; papel: string; ativo: boolean }>
  assinaturas: { total: number; assinaram: number; faltam: string[]; sou_signatario: boolean; ja_assinei: boolean; posso_assinar: boolean }
  pode_devolver: boolean
  /** "Regerar despacho": só antes de autorizar; depois, só pelo fluxo de nova autorização (motivo). */
  regerar?: { permitido: boolean; nova_autorizacao: boolean; motivo: string | null }
  devolucoes: Array<{ motivo: string; por_nome: string | null; em: string; versao: number }>
  ultima_devolucao: { motivo: string; por_nome: string | null; em: string } | null
  autos_pdf: string
}

const SITUACAO: Record<AutorizacaoTela["situacao"], { texto: string; cls: string }> = {
  SEM_DESPACHO: { texto: "Sem despacho", cls: "bg-slate-50 text-slate-800 border-slate-200" },
  EM_ELABORACAO: { texto: "Despacho em elaboração", cls: "bg-blue-50 text-blue-900 border-blue-200" },
  AGUARDANDO_ASSINATURAS: { texto: "Aguardando as assinaturas da autoridade", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  AUTORIZADA: { texto: "Autorizada", cls: "bg-green-50 text-green-900 border-green-200" },
  DEVOLVIDA: { texto: "Devolvida pela autoridade", cls: "bg-red-50 text-red-900 border-red-200" },
}

const SIT_PORTAO: Record<LinhaPortao["situacao"], { texto: string; cls: string }> = {
  OK: { texto: "Conforme", cls: "bg-green-50 text-green-900" },
  PENDENTE: { texto: "Pendente", cls: "bg-amber-50 text-amber-900" },
  EM_ANDAMENTO: { texto: "Em andamento", cls: "bg-blue-50 text-blue-900" },
  DEPOIS: { texto: "Etapa seguinte", cls: "bg-slate-50 text-slate-700" },
}

/** Cartão de decisão da autoridade (mockup do celular, 390 px). */
function DecisaoNoCelular({
  d,
  ocupado,
  onAssinar,
  onDevolver,
}: {
  d: AutorizacaoTela
  ocupado: boolean
  onAssinar: () => void
  onDevolver: () => void
}) {
  const r = d.resumo
  return (
    <section aria-label="Decisão da autoridade" className="mx-auto w-full max-w-[420px] rounded-2xl border border-[#DDD6C8] bg-[#F4F1EA] overflow-hidden shadow-sm">
      <header className="bg-[#18202B] text-white px-5 pt-5 pb-4 space-y-1">
        <p className="text-xs text-[#CFC9BC]">
          {d.assinaturas.posso_assinar
            ? `Aguardando sua assinatura · ${d.assinaturas.assinaram + 1} de ${d.assinaturas.total}`
            : d.assinaturas.ja_assinei
              ? `Você já assinou · ${d.assinaturas.assinaram} de ${d.assinaturas.total}`
              : SITUACAO[d.situacao].texto}
        </p>
        <h2 className="text-[22px] leading-tight font-semibold font-serif">{r.titulo}</h2>
      </header>
      <div className="px-5 py-4 space-y-3.5">
        <p className="text-[15px] leading-relaxed text-[#18202B]">{r.objeto}</p>
        <dl className="bg-white border border-[#DDD6C8] rounded-xl px-4 py-3.5 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#4A5361]">Teto autorizado</dt>
            <dd className="font-mono font-semibold text-right">{r.teto != null ? fmtMoeda(r.teto) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#4A5361]">Modalidade</dt>
            <dd className="font-medium text-right">{r.modalidade}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#4A5361]">Dotação</dt>
            <dd className="font-medium text-right">{r.dotacao}</dd>
          </div>
          {r.requisitante && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#4A5361]">Requisitante</dt>
              <dd className="font-medium text-right">{r.requisitante}</dd>
            </div>
          )}
        </dl>
        <div className="bg-white border border-[#DDD6C8] rounded-xl px-4 py-3.5 space-y-2">
          <p className="text-[13px] font-semibold">Documentos conferidos pelo sistema</p>
          <p className={`text-[13px] ${r.documentos_ok ? "text-[#1F4E79]" : "text-amber-800"}`}>{r.documentos}</p>
          <button type="button" className="text-[13px] font-medium text-[#1F4E79] hover:underline" onClick={() => abrirArquivoAutenticado(`${API_URL}${d.autos_pdf}`)}>
            Ler os documentos{r.folhas ? ` (${r.folhas} folhas)` : ""}
          </button>
        </div>
        <p className="text-xs text-[#4A5361] leading-snug">A data e a hora da assinatura entram no despacho automaticamente. Ela só vale quando todos os signatários assinarem.</p>
      </div>
      {(d.assinaturas.posso_assinar || d.pode_devolver) && (
        <footer className="sticky bottom-0 bg-white border-t border-[#DDD6C8] px-5 pt-3.5 pb-5 space-y-2.5">
          {d.assinaturas.posso_assinar && (
            <button
              type="button"
              disabled={ocupado}
              onClick={onAssinar}
              className="w-full h-[52px] rounded-xl bg-[#1F4E79] text-white text-base font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PenLine className="w-4 h-4" aria-hidden="true" />} Autorizar e assinar
            </button>
          )}
          {d.pode_devolver && (
            <button
              type="button"
              disabled={ocupado}
              onClick={onDevolver}
              className="w-full h-12 rounded-xl border border-[#C9C1B1] bg-white text-[15px] font-medium disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <Undo2 className="w-4 h-4" aria-hidden="true" /> Devolver com observação
            </button>
          )}
        </footer>
      )}
    </section>
  )
}

export default function AutorizacaoPage() {
  const { id } = useParams() as { id: string }
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
  const [d, setD] = useState<AutorizacaoTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [atualizacao, setAtualizacao] = useState(0)
  /** Recusa do backend fica NA TELA (não só no aviso que some) — homologação E5. */
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/autorizacao`, { cache: "no-store" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      setD(await r.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const acao = async (rota: string, corpo: unknown, sucesso: string) => {
    setOcupado(rota)
    setErroAcao(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/autorizacao/${rota}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo ?? {}),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json()
      setD(j)
      setAtualizacao((n) => n + 1)
      toast.success(j.concluida ? "Autorização assinada por todos — processo autorizado." : sucesso)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErroAcao(msg)
      toast.error(msg)
    } finally {
      setOcupado(null)
    }
  }
  const novaAutorizacao = async () => {
    const motivo = await pedirTexto({
      titulo: "Nova autorização",
      mensagem:
        "A autorização já foi dada. Uma nova autorização cria uma versão nova do despacho, que volta a passar pela trava da lei do art. 72 e pela assinatura da autoridade; até lá o processo fica sem autorização. A anterior fica no histórico.",
      rotulo: "Motivo (fica registrado no histórico do processo)",
      obrigatorio: true,
      minimo: 10,
      confirmarRotulo: "Gerar nova autorização",
    })
    if (!motivo) return
    await acao("gerar", { nova_autorizacao: true, motivo: motivo.trim() }, "Despacho novo gerado — envie à autoridade para assinar.")
  }

  const assinar = async () => {
    if (!(await confirmar({ titulo: "Autorizar e assinar", mensagem: "Você assina o despacho de autorização com o seu usuário. A data e a hora entram no despacho.", confirmarRotulo: "Autorizar e assinar" }))) return
    await acao("assinar", {}, "Assinatura registrada.")
  }
  const devolver = async () => {
    const motivo = await pedirTexto({
      titulo: "Devolver com observação",
      mensagem: "O despacho volta para o agente de contratação com o motivo (vira uma tarefa dele). As assinaturas já dadas não valem para a nova versão.",
      rotulo: "Motivo",
      obrigatorio: true,
      minimo: 10,
      confirmarRotulo: "Devolver",
    })
    if (!motivo) return
    await acao("devolver", { motivo: motivo.trim() }, "Despacho devolvido ao agente.")
  }

  if (erro) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-600 mb-2" aria-hidden="true" />
        <p>{erro}</p>
        <Link href={`/orgao/processos/${id}`} className="text-blue-800 hover:underline text-sm">Voltar ao processo</Link>
      </div>
    )
  }
  if (!d) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando a autorização" />
      </div>
    )
  }

  const sit = SITUACAO[d.situacao]
  const aguardando = d.situacao === "AGUARDANDO_ASSINATURAS"
  const podeGerar = d.licitacao.fase_interna && !aguardando
  // Depois de autorizado o despacho não é regerado (só pelo fluxo explícito de nova autorização)
  const podeRegerar = podeGerar && (d.regerar ? d.regerar.permitido : d.situacao !== "AUTORIZADA")
  const decisao = d.assinaturas.sou_signatario || d.pode_devolver

  return (
    <EtapaShell
      licitacaoId={id}
      tela="autorizacao"
      titulo="Autorização da autoridade"
      subtitulo={<span>Art. 72, VIII da Lei 14.133/2021 · {d.autoridade}{d.peca ? ` · despacho versão ${d.peca.versao}` : ""}</span>}
      atualizacao={atualizacao}
      acoes={
        !decisao || !aguardando ? (
          <>
            <Button
              variant="outline"
              onClick={() => acao("gerar", {}, "Despacho gerado pelo modelo (lê o processo).")}
              disabled={!!ocupado || !podeRegerar}
              title={!podeRegerar && d.regerar?.motivo ? d.regerar.motivo : "Gera o despacho pelo modelo com objeto, fundamento, teto, dotação e leis do processo"}
            >
              {ocupado === "gerar" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} {d.peca && !d.peca.anexada ? "Regerar despacho" : "Gerar despacho"}
            </Button>
            {d.regerar?.nova_autorizacao && (
              <Button variant="outline" onClick={novaAutorizacao} disabled={!!ocupado} title="Cria um despacho novo, que volta para a assinatura da autoridade">
                <Undo2 className="w-4 h-4 mr-1" /> Nova autorização…
              </Button>
            )}
            <Button onClick={() => acao("enviar", {}, "Despacho enviado à autoridade para assinatura.")} disabled={!!ocupado || !podeGerar || d.situacao === "AUTORIZADA"}>
              {ocupado === "enviar" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Enviar à autoridade
            </Button>
          </>
        ) : null
      }
    >
      {dialogo}
      <div className={`rounded-lg border px-4 py-2.5 text-sm ${sit.cls}`} role="status">
        <b>{sit.texto}</b>
        {aguardando && ` — ${d.assinaturas.assinaram} de ${d.assinaturas.total} assinaturas. A autorização só vale quando todos assinarem.`}
        {d.situacao === "DEVOLVIDA" && d.ultima_devolucao && ` — "${d.ultima_devolucao.motivo}" (${d.ultima_devolucao.por_nome ?? "autoridade"}, ${fmtDia(d.ultima_devolucao.em)}). Corrija e reenvie.`}
        {d.situacao === "AUTORIZADA" && d.regerar?.motivo && <span className="block text-xs font-normal mt-0.5">{d.regerar.motivo}</span>}
      </div>
      {ocupado === "assinar" && (
        <p className="text-sm text-blue-900 flex items-center gap-2" role="status">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Registrando a assinatura e gerando o despacho assinado…
        </p>
      )}
      {erroAcao && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 flex items-start justify-between gap-2" role="alert">
          <span>
            <b>Não foi possível concluir:</b> {erroAcao}
          </span>
          <button type="button" className="text-xs underline shrink-0" onClick={() => setErroAcao(null)}>
            fechar
          </button>
        </div>
      )}

      {decisao && <DecisaoNoCelular d={d} ocupado={!!ocupado} onAssinar={assinar} onDevolver={devolver} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4 min-w-0">
          <CaminhosDaPeca
            licitacaoId={id}
            tipo="AA"
            titulo="Despacho de autorização"
            fazerAqui="gerar o despacho pelo modelo e enviar à autoridade"
            atualizacao={atualizacao}
            permitirAssinatura={false}
            onAtualizado={() => {
              carregar()
              setAtualizacao((n) => n + 1)
            }}
          />
          <RascunhoIaFaixa
            licitacaoId={id}
            peca="AA"
            somenteLeitura={!podeRegerar}
            atualizacao={atualizacao}
            rotuloAceitar="Aceitar e gerar o despacho"
            explicacaoAceite="Aceitar gera o despacho com este texto (o local, a data e a autoridade vêm do modelo). Ele só vale depois de assinado pela autoridade; “Regerar despacho” volta ao texto do modelo."
            onAceito={() => {
              carregar()
              setAtualizacao((n) => n + 1)
            }}
          />
          <section aria-label="Despacho" className="rounded-lg border bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Texto do despacho</h2>
            {d.peca?.desatualizada && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">{d.peca.desatualizada.texto}</p>}
            {d.secoes.autorizacao ? (
              <div className="prose prose-sm max-w-none text-gray-900" dangerouslySetInnerHTML={{ __html: d.secoes.autorizacao }} />
            ) : (
              <p className="text-sm text-gray-600">
                {d.peca?.anexada ? "Despacho anexado (assinado fora) — veja o PDF acima." : "Ainda não gerado. \"Gerar despacho\" monta o texto com os dados do processo; ou anexe o despacho assinado fora."}
              </p>
            )}
            {d.peca && !d.peca.anexada && (
              <p className="text-xs text-gray-600">
                Para ajustar o texto antes de enviar, use o{" "}
                <Link className="text-blue-800 hover:underline" href={`/orgao/fase-interna/processos/${id}/editor?tipo=AA&texto=1`}>editor de seções</Link>. Texto editado à mão não é regerado sozinho.
              </p>
            )}
          </section>

          <section aria-label="Trava da lei — autorizar (art. 72)" className="rounded-lg border bg-white p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900">
                Instrução do art. 72 — trava da lei para autorizar <AjudaTravaDaLei destaque="B" />
              </h2>
              <span className={`text-xs rounded px-2 py-0.5 border ${d.resumo.portao_b.ok ? "bg-green-50 text-green-900 border-green-200" : "bg-amber-50 text-amber-900 border-amber-200"}`}>
                {d.resumo.portao_b.ok ? "Peças exigidas para autorizar: completas" : `${d.resumo.portao_b.pendentes.length} pendência(s)`}
              </span>
            </div>
            {d.portao_b_bloqueios?.length ? (
              <div className="rounded border border-[#E8B48C] bg-[#FBEBDD] px-3 py-2 text-xs text-[#6B2F05] space-y-1" role="alert">
                <p className="font-semibold">A autorização está bloqueada: o despacho não vai para a autoridade, não é assinado nem anexado enquanto houver:</p>
                <ul className="list-disc pl-4">
                  {d.portao_b_bloqueios.map((b, i) => (
                    <li key={i}>{textoDaTrava(b).replace(/^Trava da lei — [^—]+— /, "")}</li>
                  ))}
                </ul>
                <Link className="text-blue-800 hover:underline" href={`/orgao/processos/${id}/fase-interna/conformidade`}>Ver na conformidade</Link>
              </div>
            ) : (
              <p className="text-xs text-gray-600">A trava da lei do art. 72 bloqueia a autorização (envio, assinatura e anexo do despacho) enquanto faltar peça dos incisos I, II ou IV — e, na inexigibilidade (sem aviso), a razão da escolha e o preço (VI e VII). Na dispensa eletrônica, VI e VII se cumprem depois da seleção do fornecedor.</p>
            )}
            <ul className="divide-y">
              {d.resumo.portao_b.linhas.map((l) => (
                <li key={l.inciso} className="flex items-start gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 font-mono text-xs text-gray-600 pt-0.5">{l.referencia}</span>
                  <span className="flex-1 min-w-0">
                    {l.texto}
                    {l.pecas.length > 0 && <span className="block text-xs text-gray-600">{l.pecas.map((p) => `${p.tipo}: ${p.status.replaceAll("_", " ").toLowerCase()}`).join(" · ")}</span>}
                  </span>
                  <span className={`text-[11px] rounded-full px-2 py-0.5 shrink-0 ${SIT_PORTAO[l.situacao].cls}`}>{l.exigido ? SIT_PORTAO[l.situacao].texto : l.momento === "ESTA_ETAPA" ? "Esta etapa" : SIT_PORTAO[l.situacao].texto}</span>
                </li>
              ))}
            </ul>
          </section>

          <CaminhosDaPeca
            licitacaoId={id}
            tipo="DP"
            titulo="Designação do agente de contratação"
            fazerAqui="juntar a portaria do órgão (quadro do processo)"
            atualizacao={atualizacao}
            permitirAssinatura={false}
            compacto
            onAtualizado={() => setAtualizacao((n) => n + 1)}
          />
        </div>

        <aside className="space-y-4">
          <section aria-label="Signatários" className="rounded-lg border bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Quem assina — {d.autoridade}</h2>
            {(d.signatarios.length ? d.signatarios : d.signatarios_configurados.map((s) => ({ ...s, status: "—", data_assinatura: null }))).map((s) => (
              <div key={s.usuario_id} className="flex items-center gap-2 text-sm">
                {s.status === "ASSINADO" ? <CheckCircle2 className="w-4 h-4 text-green-700" aria-hidden="true" /> : <Circle className="w-4 h-4 text-slate-400" aria-hidden="true" />}
                <span className="flex-1 min-w-0">
                  {s.nome} <span className="text-xs text-gray-600">· {s.papel}</span>
                </span>
                <span className="text-xs text-gray-600">{s.status === "ASSINADO" ? fmtDia(s.data_assinatura) : s.status === "—" ? "" : "pendente"}</span>
              </div>
            ))}
            {!d.signatarios.length && !d.signatarios_configurados.length && (
              <p className="text-sm text-amber-900">
                Defina quem assina em <Link className="underline" href="/orgao/configuracoes/fase-interna">Configurações › Fase interna</Link> (ex.: os 4 membros da Mesa Diretora) ou dê o papel &quot;Autoridade&quot; a quem autoriza.
              </p>
            )}
            {!d.signatarios.length && d.signatarios_configurados.length > 0 && <p className="text-xs text-gray-600">Da configuração do órgão — recebem o despacho ao enviar.</p>}
          </section>
          <section aria-label="Resumo" className="rounded-lg border bg-white p-4 space-y-1 text-sm">
            <h2 className="text-sm font-semibold text-gray-900">Dados do processo (lidos pelo despacho)</h2>
            <p><span className="text-gray-600">Fundamento:</span> {d.fundamento_legal.texto ?? "—"}</p>
            <p><span className="text-gray-600">Teto:</span> {d.resumo.teto != null ? fmtMoeda(d.resumo.teto) : "—"}{d.resumo.teto_sigiloso ? " (orçamento sigiloso — só nos autos)" : ""}</p>
            <p><span className="text-gray-600">Dotação:</span> {d.resumo.dotacao_texto ?? d.resumo.dotacao}</p>
          </section>
          {d.devolucoes.length > 0 && (
            <section aria-label="Devoluções" className="rounded-lg border bg-white p-4 space-y-1">
              <h2 className="text-sm font-semibold text-gray-900">Devoluções</h2>
              <ul className="text-xs text-gray-700 space-y-1">
                {d.devolucoes.map((x, i) => (
                  <li key={i}>
                    v{x.versao} · {fmtDia(x.em)} · {x.por_nome ?? "autoridade"}: {x.motivo}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </EtapaShell>
  )
}
