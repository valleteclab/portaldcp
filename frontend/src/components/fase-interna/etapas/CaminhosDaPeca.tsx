"use client"

/**
 * OS DOIS CAMINHOS DA PEÇA (decisão 1 do dono — Entrega 3A): toda etapa pode
 * ser cumprida "fazendo aqui" (a própria tela) OU "anexando o PDF feito fora"
 * (setores manuais continuam). Onde a lei permite, "Não se aplica" com
 * justificativa (art. 72, I — "se for o caso"). Mostra a situação da peça
 * (instrução do processo), as versões (histórico — Entrega 1) e o envio para
 * assinatura com vários signatários.
 * Homologação multiusuário: quem assina vê "Assinar" aqui (os demais, "Aguardando
 * assinatura de …"); a diligência do parecer sobre a peça aparece como aviso
 * com "Sanar"; cada versão diz quem gerou/anexou; desfazer "não se aplica" pede
 * o motivo (é voltar a etapa).
 * Fontes: GET /api/fase-interna/:id/instrucao, /documentos/:tipo, /documentos/:tipo/assinatura,
 * /diligencias?tipo=.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Circle, FilePlus2, FileText, Gavel, History, Loader2, PenLine, ShieldCheck, Upload } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { AnexarPecaDialog } from "./AnexarPecaDialog"
import { aoAtualizarFaseInterna, avisarFaseInternaAtualizada, criarUltimaCarga, erroDaApi, fmtDia } from "@/lib/fase-interna/telas"
import { avisarTarefasAtualizadas } from "@/lib/tarefas"
import { usePermissaoEtapa } from "@/lib/fase-interna/permissao-etapa"

export interface LinhaInstrucao {
  tipo: string
  titulo: string
  obrigatorio: boolean
  fundamento: string
  status: string
  documento_id?: string
  justificativa?: string
  pode_nao_se_aplicar?: boolean
  /** Aprovação interna da etapa (fluxo de aprovação do órgão). */
  exige_aprovacao?: boolean
  aprovacao_interna?: boolean
  aprovacao?: { etapa: number; total: number; etapa_nome: string; responsavel: string | null; rotulo?: string }
  fluxo_aprovacao?: { id: string; nome: string; generico: boolean } | null
  sem_fluxo_aprovacao?: boolean
  reprovacao?: { motivo: string | null; por: string | null; em: string | null; etapa_nome: string }
  peca?: {
    versao: number
    origem: string
    anexada: boolean
    status: string
    numero_peca: string | null
    data_documento: string | null
    folha_inicial: number | null
    folha_final: number | null
    tem_arquivo: boolean
    /** Quem anexou/gerou a versão atual e quando. */
    registrada_por?: string | null
    registrada_em?: string | null
  }
}

const ROTULO_STATUS: Record<string, { texto: string; cls: string }> = {
  OK: { texto: "Pronta", cls: "bg-green-50 text-green-900 border-green-200" },
  NAO_SE_APLICA: { texto: "Não se aplica", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  PENDENTE: { texto: "Pendente", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  EM_ELABORACAO: { texto: "Em elaboração", cls: "bg-blue-50 text-blue-900 border-blue-200" },
  EM_APROVACAO: { texto: "Em aprovação", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  EM_ASSINATURA: { texto: "Aguardando assinaturas", cls: "bg-amber-50 text-amber-900 border-amber-200" },
}

/**
 * Linha da instrução de um tipo (hook compartilhado pelas telas). Recarrega
 * quando a tela grava (`atualizacao`), quando outro quadro avisa que mudou e
 * ao voltar para a aba; resposta fora de ordem não sobrescreve a mais nova
 * (homologação E9: a reserva ficava "Pendente" até recarregar a página).
 */
export function useLinhaInstrucao(licitacaoId: string, tipo: string, atualizacao?: unknown) {
  const [linha, setLinha] = useState<LinhaInstrucao | null>(null)
  const [contratacaoDireta, setContratacaoDireta] = useState(false)
  const ultima = useRef(criarUltimaCarga())
  const carregar = useCallback(async () => {
    const vigente = ultima.current()
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/instrucao`, { cache: "no-store" })
      if (!r.ok) return
      const j = await r.json()
      if (!vigente()) return
      setContratacaoDireta(!!j.contratacao_direta)
      setLinha((j.itens || []).find((i: LinhaInstrucao) => i.tipo === tipo) ?? null)
    } catch {
      /* sem linha */
    }
  }, [licitacaoId, tipo])
  useEffect(() => {
    carregar()
  }, [carregar, atualizacao])
  useEffect(() => aoAtualizarFaseInterna(licitacaoId, carregar), [licitacaoId, carregar])
  return { linha, contratacaoDireta, recarregar: carregar }
}

export function CaminhosDaPeca({
  licitacaoId,
  tipo,
  titulo,
  fazerAqui,
  atualizacao,
  onAtualizado,
  permitirAssinatura = true,
  compacto = false,
  emitir = false,
}: {
  licitacaoId: string
  tipo: string
  titulo: string
  /** Texto do caminho "fazer aqui" (o que a tela faz). */
  fazerAqui?: string
  atualizacao?: unknown
  onAtualizado: () => void
  permitirAssinatura?: boolean
  compacto?: boolean
  /**
   * Oferece "Gerar documento (PDF)" para a peça feita aqui em elaboração —
   * gerar é a emissão (a peça só fica pronta gerada, anexada ou assinada).
   * Para as peças sem ato próprio (análise de riscos, editor de seções).
   */
  emitir?: boolean
}) {
  const { pedirTexto, dialogo } = useDialogoConfirmacao()
  const { linha, recarregar } = useLinhaInstrucao(licitacaoId, tipo, atualizacao)
  // Isolamento das peças: sem permissão na etapa, as ações de escrita ficam desabilitadas (com o motivo)
  const permissao = usePermissaoEtapa()
  const bloqueado = !permissao.pode
  const motivoBloqueio = bloqueado ? permissao.motivo ?? "Você não pode alterar as peças desta etapa agora." : undefined
  const [anexando, setAnexando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [versoes, setVersoes] = useState<any[] | null>(null)
  const [assinar, setAssinar] = useState(false)

  const p = linha?.peca
  const status = linha?.status ?? (p ? "EM_ELABORACAO" : "PENDENTE")
  const rotulo = ROTULO_STATUS[status] ?? { texto: status, cls: "bg-slate-50 text-slate-700 border-slate-200" }
  const feitaAqui = !!p && !p.anexada
  /** Depois de qualquer ação: este quadro, a tela e os demais quadros (barra de etapas, fluxo) recarregam. */
  const aposAcao = async () => {
    await recarregar()
    onAtualizado()
    avisarFaseInternaAtualizada(licitacaoId)
  }

  const gerarDocumento = async () => {
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/emitir`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json().catch(() => null)
      toast.success(j?.em_aprovacao ? `${titulo}: documento gerado e enviado para a aprovação interna` : `${titulo}: documento gerado — a peça está pronta`)
      await aposAcao()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const naoSeAplica = async (desfazer: boolean) => {
    let corpo: Record<string, unknown> = { desfazer: true }
    if (desfazer) {
      // Desfazer "não se aplica" de etapa concluída é VOLTAR a etapa: motivo obrigatório e as
      // etapas que dependem dela ficam "a revisar" (homologação — antes reabria sem nada)
      const m = await pedirTexto({
        titulo: `Desfazer "não se aplica" — ${titulo}`,
        mensagem: "A etapa volta a ficar em elaboração. Se ela já estava concluída, as etapas que dependem dela ficam \"a revisar\". O motivo vai para o histórico do processo.",
        rotulo: "Motivo",
        obrigatorio: true,
        minimo: 10,
        confirmarRotulo: "Desfazer e reabrir",
      })
      if (!m) return
      corpo = { desfazer: true, motivo: m.trim() }
    }
    if (!desfazer) {
      const j = await pedirTexto({
        titulo: `"${titulo}" não se aplica`,
        mensagem: "A justificativa fica registrada nos autos (art. 72, I — peça \"se for o caso\" na contratação direta).",
        rotulo: "Justificativa",
        obrigatorio: true,
        confirmarRotulo: "Marcar não se aplica",
      })
      if (!j) return
      corpo = { justificativa: j.trim() }
    }
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/instrucao/${tipo}/nao-se-aplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success(desfazer ? "Marcação desfeita" : `${titulo}: não se aplica (registrado nos autos)`)
      await aposAcao()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const verVersoes = async () => {
    if (versoes) return setVersoes(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}`)
      setVersoes(r.ok ? await r.json() : [])
    } catch {
      setVersoes([])
    }
  }

  return (
    <section aria-label={`Caminhos da peça ${titulo}`} className={`rounded-lg border bg-white ${compacto ? "p-3" : "p-4"} space-y-2`}>
      {dialogo}
      <AnexarPecaDialog
        licitacaoId={licitacaoId}
        peca={anexando ? { tipo, titulo, jaTem: !!p } : null}
        onFechar={() => setAnexando(false)}
        onAnexado={() => {
          setAnexando(false)
          void aposAcao()
        }}
      />
      <AssinaturaDialog
        licitacaoId={licitacaoId}
        tipo={tipo}
        titulo={titulo}
        aberto={assinar}
        onFechar={() => setAssinar(false)}
        onEnviado={() => {
          setAssinar(false)
          void aposAcao()
        }}
      />
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {status === "OK" ? (
              <CheckCircle2 className="w-4 h-4 text-green-700" aria-hidden="true" />
            ) : (
              <Circle className="w-4 h-4 text-amber-600" aria-hidden="true" />
            )}
            <span className="text-sm font-medium text-gray-900">{titulo}</span>
            <span className={`text-[11px] border rounded px-1.5 py-0.5 ${rotulo.cls}`}>{rotulo.texto}</span>
            {linha && <span className="text-[11px] text-gray-600">{linha.fundamento}{linha.obrigatorio ? " · obrigatória" : ""}</span>}
          </div>
          {p && status !== "NAO_SE_APLICA" && (
            <p className="text-xs text-gray-700">
              {p.anexada ? "Anexada (feita fora)" : "Feita no sistema"}
              {p.registrada_por ? ` · ${p.anexada ? "anexada" : "gerada"} por ${p.registrada_por}${p.registrada_em ? ` em ${fmtDia(p.registrada_em)}` : ""}` : ""}
              {p.numero_peca ? ` · ${p.numero_peca}` : ""}
              {p.data_documento ? ` · de ${fmtDia(p.data_documento)}` : ""}
              {p.folha_inicial != null ? ` · fls. ${p.folha_inicial}${p.folha_final && p.folha_final !== p.folha_inicial ? `–${p.folha_final}` : ""}` : ""}
              {` · versão ${p.versao}`}
            </p>
          )}
          {status === "NAO_SE_APLICA" && linha?.justificativa && <p className="text-xs text-gray-700">Justificativa: {linha.justificativa}</p>}
          {status === "EM_ELABORACAO" && feitaAqui && !linha?.reprovacao && (
            <p className="text-xs text-blue-900">
              Rascunho salvo — ainda não é a peça. Ela fica pronta depois de {emitir ? "gerar o documento" : fazerAqui ?? "gerar o documento"} (ou de anexar o PDF feito fora)
              {linha?.aprovacao_interna ? " e de aprovada na conferência interna" : ""}.
            </p>
          )}
          <AprovacaoInternaDaPeca linha={linha} status={status} />
          {status === "EM_ASSINATURA" && <AssinaturaDaPeca licitacaoId={licitacaoId} tipo={tipo} titulo={titulo} atualizacao={atualizacao} onAssinado={() => void aposAcao()} />}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {p?.tem_arquivo && linha?.documento_id && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${linha.documento_id}/arquivo`)}>
              <FileText className="w-3.5 h-3.5 mr-1" /> Ver PDF
            </Button>
          )}
          {emitir && feitaAqui && status === "EM_ELABORACAO" && (
            <Button size="sm" className="h-8" disabled={ocupado || bloqueado} onClick={gerarDocumento} title={motivoBloqueio ?? "Gerar o documento é a emissão: só assim a peça feita aqui fica pronta (o rascunho salvo não conta)"}>
              {ocupado ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5 mr-1" />} Gerar documento (PDF)
            </Button>
          )}
          {status !== "NAO_SE_APLICA" && (
            <Button size="sm" variant="outline" className="h-8" disabled={ocupado || bloqueado} title={motivoBloqueio} onClick={() => setAnexando(true)}>
              <Upload className="w-3.5 h-3.5 mr-1" /> Anexar feito fora
            </Button>
          )}
          {permitirAssinatura && feitaAqui && status !== "NAO_SE_APLICA" && status !== "EM_ASSINATURA" && status !== "EM_APROVACAO" && p?.status !== "ASSINADO" && (
            <Button size="sm" variant="outline" className="h-8" disabled={ocupado || bloqueado} onClick={() => setAssinar(true)} title={motivoBloqueio ?? "Envia a peça feita aqui para os signatários (a data da peça é a da última assinatura)"}>
              <PenLine className="w-3.5 h-3.5 mr-1" /> Enviar para assinatura
            </Button>
          )}
          {linha?.pode_nao_se_aplicar && status !== "NAO_SE_APLICA" && status !== "OK" && (
            <Button size="sm" variant="ghost" className="h-8" disabled={ocupado || bloqueado} title={motivoBloqueio} onClick={() => naoSeAplica(false)}>
              Não se aplica
            </Button>
          )}
          {status === "NAO_SE_APLICA" && (
            <Button size="sm" variant="ghost" className="h-8" disabled={ocupado || bloqueado} title={motivoBloqueio} onClick={() => naoSeAplica(true)}>
              Desfazer &quot;não se aplica&quot;
            </Button>
          )}
          {p && (
            <Button size="sm" variant="ghost" className="h-8" onClick={verVersoes} aria-expanded={!!versoes}>
              <History className="w-3.5 h-3.5 mr-1" /> Versões
            </Button>
          )}
        </div>
      </div>
      <DiligenciasDaPeca licitacaoId={licitacaoId} tipo={tipo} titulo={titulo} atualizacao={atualizacao} onSanada={() => void aposAcao()} />
      {bloqueado && (
        <p className="text-xs text-slate-700" role="note">
          Somente leitura: {motivoBloqueio}
        </p>
      )}
      {!compacto && !bloqueado && status !== "NAO_SE_APLICA" && (
        <p className="text-xs text-gray-600">
          Dois caminhos, que contam igual: <b>{fazerAqui ?? "fazer aqui"}</b> nesta tela, ou <b>anexar o PDF feito fora</b> (com a data que consta na peça e quem assinou).
        </p>
      )}
      {versoes && (
        <ul className="text-xs border-t pt-2 space-y-1">
          {versoes.length === 0 && <li className="text-gray-600">Sem versões.</li>}
          {versoes.map((v: any) => (
            <li key={v.id} className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                Versão {v.versao} · {v.origem === "INTERNO" ? "feita no sistema" : "anexada"} · {String(v.status).replaceAll("_", " ").toLowerCase()}
                {autorDaVersao(v) ? ` · ${v.origem === "INTERNO" ? "gerada" : "anexada"} por ${autorDaVersao(v)}` : ""}
                {v.data_documento ? ` · de ${fmtDia(v.data_documento)}` : ""} · gravada em {fmtDia(v.updated_at || v.created_at)}
              </span>
              {(v.caminho_arquivo || v.arquivo_pdf_path) && (
                <button type="button" className="text-blue-800 hover:underline" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${v.id}/arquivo`)}>
                  ver PDF
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * APROVAÇÃO INTERNA DA PEÇA (fluxo de aprovação do órgão, nas etapas com
 * "aprovação interna" ligada): com quem está, o motivo da reprovação e o aviso
 * de aprovação interna ligada sem fluxo cadastrado (aprovação única).
 */
function AprovacaoInternaDaPeca({ linha, status }: { linha: LinhaInstrucao | null; status: string }) {
  if (!linha) return null
  if (status === "EM_APROVACAO") {
    const a = linha.aprovacao
    return (
      <p className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1.5 flex items-start gap-1.5" role="status">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          {a?.rotulo ?? (a ? `Aguardando aprovação: ${a.etapa_nome} — ${a.responsavel ?? "quem conduz o processo"} (${a.etapa} de ${a.total})` : "Aguardando aprovação interna")}
          . Quem aprova vê a peça em <Link className="underline" href="/orgao/aprovacoes?tab=documentos">Aprovações › Documentos</Link>.
        </span>
      </p>
    )
  }
  if (linha.reprovacao && status !== "OK" && status !== "NAO_SE_APLICA") {
    const r = linha.reprovacao
    return (
      <p className="text-xs rounded border border-red-200 bg-red-50 text-red-900 px-2 py-1.5 flex items-start gap-1.5" role="alert">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Reprovada em &quot;{r.etapa_nome}&quot;{r.por ? ` por ${r.por}` : ""}{r.em ? ` em ${fmtDia(r.em)}` : ""}: <b>{r.motivo || "sem motivo informado"}</b>. Corrija e gere a peça de novo (ou anexe a
          corrigida) — ela volta sozinha para a aprovação.
        </span>
      </p>
    )
  }
  if (!linha.aprovacao_interna || status === "OK" || status === "NAO_SE_APLICA") return null
  if (linha.sem_fluxo_aprovacao) {
    return (
      <p className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1.5">
        Aprovação interna ligada, mas sem fluxo cadastrado para esta peça: ao gerar ou anexar, vale a aprovação única por quem conduz o processo.{" "}
        <Link className="underline" href="/orgao/configuracoes/fluxos-aprovacao">Cadastrar um fluxo</Link>
      </p>
    )
  }
  return (
    <p className="text-xs text-gray-700 flex items-center gap-1.5">
      <ShieldCheck className="w-3.5 h-3.5 text-blue-800" aria-hidden="true" />
      Com conferência interna: ao gerar ou anexar, a peça vai para o fluxo &quot;{linha.fluxo_aprovacao?.nome}&quot;{linha.fluxo_aprovacao?.generico ? " (genérico)" : ""} e só vale depois de aprovada.
    </p>
  )
}

/** Envio da peça feita aqui para assinatura (vários signatários — Entrega 1). */
function AssinaturaDialog({
  licitacaoId,
  tipo,
  titulo,
  aberto,
  onFechar,
  onEnviado,
}: {
  licitacaoId: string
  tipo: string
  titulo: string
  aberto: boolean
  onFechar: () => void
  onEnviado: () => void
}) {
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string; cargo?: string | null; email?: string | null; ativo: boolean }>>([])
  const [escolhidos, setEscolhidos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setErro(null)
    authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios`)
      .then(async (r) => (r.ok ? setUsuarios((await r.json()).filter((u: any) => u.ativo)) : setUsuarios([])))
      .catch(() => setUsuarios([]))
  }, [aberto])

  const enviar = async () => {
    const signatarios = Object.entries(escolhidos).map(([usuario_id, papel]) => ({ usuario_id, papel }))
    if (!signatarios.length) return setErro("Escolha ao menos um signatário.")
    setEnviando(true)
    setErro(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/assinatura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatarios }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success(`${titulo} enviada para ${signatarios.length} ${signatarios.length === 1 ? "signatário" : "signatários"}`)
      setEscolhidos({})
      onEnviado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar para assinatura — {titulo}</DialogTitle>
          <DialogDescription>
            Gera o PDF da peça e o envia aos signatários (todos precisam assinar). A data da peça é a da última assinatura; as folhas dos autos são numeradas nessa hora.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
          {usuarios.map((u) => {
            const marcado = escolhidos[u.id] !== undefined
            return (
              <li key={u.id} className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 min-w-[12rem] flex-1 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={marcado}
                    onChange={(e) =>
                      setEscolhidos((m) => {
                        const n = { ...m }
                        if (e.target.checked) n[u.id] = u.cargo || ""
                        else delete n[u.id]
                        return n
                      })
                    }
                  />
                  <span>
                    {u.nome}
                    {!u.email && <span className="text-xs text-amber-800"> (sem e-mail)</span>}
                  </span>
                </label>
                {marcado && (
                  <div className="flex-1 min-w-[10rem]">
                    <Label className="sr-only" htmlFor={`papel-${u.id}`}>Papel no ato</Label>
                    <Input
                      id={`papel-${u.id}`}
                      className="h-8"
                      placeholder="Papel (ex.: Presidente, 1º Secretário)"
                      value={escolhidos[u.id]}
                      onChange={(e) => setEscolhidos((m) => ({ ...m, [u.id]: e.target.value }))}
                    />
                  </div>
                )}
              </li>
            )
          })}
          {!usuarios.length && <li className="text-sm text-gray-600">Nenhum usuário ativo no órgão.</li>}
        </ul>
        {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Quem gerou/anexou a versão: quem anexou, quem emitiu o documento ou quem assinou. */
function autorDaVersao(v: any): string | null {
  if (v?.criado_por_nome) return v.criado_por_nome
  if (v?.dados_estruturados?._emitido?.por_nome) return v.dados_estruturados._emitido.por_nome
  const ass = Array.isArray(v?.assinaturas) ? v.assinaturas.map((a: any) => a?.assinante_nome).filter(Boolean) : []
  return ass.length ? ass.join(", ") : null
}

interface SituacaoAssinatura {
  status: string
  pode_assinar?: boolean
  eu_assino?: boolean
  signatarios: Array<{ nome: string; papel: string | null; status: string; data_assinatura: string | null; usuario_id?: string | null }>
}

/**
 * ASSINATURA DA PEÇA (homologação E1): todos veem de quem falta a
 * assinatura; o signatário designado assina aqui mesmo, com o próprio login
 * (o servidor confere — 403 para os demais). Também fica na Central de
 * Aprovações › Assinaturas.
 */
function AssinaturaDaPeca({ licitacaoId, tipo, titulo, atualizacao, onAssinado }: { licitacaoId: string; tipo: string; titulo: string; atualizacao?: unknown; onAssinado: () => void }) {
  const { confirmar, dialogo } = useDialogoConfirmacao()
  const [s, setS] = useState<SituacaoAssinatura | null>(null)
  const [assinando, setAssinando] = useState(false)
  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/assinatura`, { cache: "no-store" })
      setS(r.ok ? await r.json() : null)
    } catch {
      setS(null)
    }
  }, [licitacaoId, tipo])
  useEffect(() => {
    carregar()
  }, [carregar, atualizacao])

  if (!s || !s.signatarios?.length) return null
  const faltam = s.signatarios.filter((x) => x.status !== "ASSINADO")
  const assinaram = s.signatarios.filter((x) => x.status === "ASSINADO")

  const assinar = async () => {
    const ok = await confirmar({
      titulo: `Assinar — ${titulo}`,
      mensagem: "Você assina com o seu usuário; a assinatura fica registrada com data e hora (Brasília). A peça só vale quando todos os signatários assinarem.",
      confirmarRotulo: "Assinar",
    })
    if (!ok) return
    setAssinando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/assinar`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json().catch(() => null)
      toast.success(j?.concluida ? `${titulo}: assinada por todos.` : `${titulo}: sua assinatura foi registrada.`)
      avisarTarefasAtualizadas()
      await carregar()
      onAssinado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setAssinando(false)
    }
  }

  return (
    <div className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-950 px-2 py-1.5 flex items-start justify-between gap-2 flex-wrap" role="status">
      {dialogo}
      <span className="flex items-start gap-1.5 min-w-0">
        <PenLine className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Aguardando assinatura de <b>{faltam.map((x) => `${x.nome}${x.papel ? ` (${x.papel})` : ""}`).join(", ") || "—"}</b>
          {assinaram.length > 0 && <> · já assinaram: {assinaram.map((x) => x.nome).join(", ")}</>}
          {!s.pode_assinar && (
            <>
              {" "}· quem assina vê a peça em <Link className="underline" href="/orgao/aprovacoes?tab=assinaturas">Aprovações › Assinaturas</Link>
            </>
          )}
        </span>
      </span>
      {s.pode_assinar && (
        <Button size="sm" className="h-7" onClick={assinar} disabled={assinando}>
          {assinando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" aria-hidden="true" /> : <PenLine className="w-3.5 h-3.5 mr-1" aria-hidden="true" />} Assinar
        </Button>
      )}
    </div>
  )
}

interface DiligenciaDaPeca {
  id: string
  status: "ABERTA" | "SANADA"
  descricao: string
  trecho: string | null
  folha: number | null
  aberta_por_nome: string | null
  created_at: string
  versao_alvo: number | null
  versao_atual: number | null
  versao_nova_pronta: boolean
  pode_sanar: boolean
  resposta: string | null
  sanada_por_nome: string | null
  sanada_em: string | null
}

/**
 * DILIGÊNCIA DO PARECER NA TELA DA PEÇA (homologação: a tarefa levava à peça,
 * mas o aviso e o "Sanar" só existiam na tela do Parecer). Mesma regra do
 * parecer: sanar exige versão nova PRONTA da peça (gerada, anexada ou
 * assinada) ou a resposta "não há o que alterar", com a explicação.
 */
function DiligenciasDaPeca({ licitacaoId, tipo, titulo, atualizacao, onSanada }: { licitacaoId: string; tipo: string; titulo: string; atualizacao?: unknown; onSanada: () => void }) {
  const [lista, setLista] = useState<DiligenciaDaPeca[]>([])
  const [sanando, setSanando] = useState<DiligenciaDaPeca | null>(null)
  const [resposta, setResposta] = useState("")
  const [semAlteracao, setSemAlteracao] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/diligencias?tipo=${encodeURIComponent(tipo)}`, { cache: "no-store" })
      setLista(r.ok ? ((await r.json()).diligencias ?? []) : [])
    } catch {
      setLista([])
    }
  }, [licitacaoId, tipo])
  useEffect(() => {
    carregar()
  }, [carregar, atualizacao])
  useEffect(() => aoAtualizarFaseInterna(licitacaoId, carregar), [licitacaoId, carregar])

  const abertas = lista.filter((d) => d.status === "ABERTA")
  if (!abertas.length) return null

  const sanar = async () => {
    if (!sanando) return
    if (semAlteracao && resposta.trim().length < 10) return setErro("Explique por que a peça não precisa ser alterada (pelo menos 10 caracteres).")
    setEnviando(true)
    setErro(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/parecer/diligencias/${sanando.id}/sanar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retorno: "PECA", resposta: resposta.trim(), sem_alteracao: semAlteracao }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success("Diligência sanada — o processo volta para a Procuradoria.")
      setSanando(null)
      avisarTarefasAtualizadas()
      await carregar()
      onSanada()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-2" aria-label={`Diligências sobre ${titulo}`}>
      {abertas.map((d) => (
        <div key={d.id} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 flex items-start justify-between gap-2 flex-wrap" role="alert">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1.5 font-medium">
              <Gavel className="w-4 h-4 shrink-0" aria-hidden="true" /> Diligência do parecer jurídico sobre esta peça
            </p>
            <p>{d.descricao}</p>
            {d.trecho && <p className="text-xs">Trecho: “{d.trecho}”{d.folha != null ? ` · fl. ${d.folha}` : ""}</p>}
            <p className="text-xs text-red-900">
              Aberta por {d.aberta_por_nome ?? "Procuradoria"} em {fmtDia(d.created_at)} · sobre a versão {d.versao_alvo ?? "—"}
              {d.versao_atual && d.versao_atual !== d.versao_alvo ? ` · agora na versão ${d.versao_atual}${d.versao_nova_pronta ? " (pronta)" : " (ainda não pronta)"}` : ""}
            </p>
            {!d.versao_nova_pronta && d.pode_sanar && (
              <p className="text-xs text-red-900">Corrija a peça (gere de novo ou anexe a versão corrigida) e clique em Sanar — ou responda que não há o que alterar.</p>
            )}
          </div>
          {d.pode_sanar ? (
            <Button size="sm" className="h-8" onClick={() => { setSanando(d); setResposta(""); setSemAlteracao(!d.versao_nova_pronta); setErro(null) }}>
              Sanar
            </Button>
          ) : (
            <span className="text-xs text-red-900">Quem responde pela peça sana a diligência.</span>
          )}
        </div>
      ))}
      <Dialog open={!!sanando} onOpenChange={(v) => !v && setSanando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sanar a diligência — {titulo}</DialogTitle>
            <DialogDescription>O processo volta para a Procuradoria com a sua resposta. A diligência: “{sanando?.descricao}”</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {sanando?.versao_nova_pronta ? (
              <p className="text-sm text-green-900 rounded border border-green-200 bg-green-50 px-2 py-1.5">A peça tem versão nova pronta (versão {sanando.versao_atual}) — ela será a resposta.</p>
            ) : (
              <p className="text-sm text-amber-950 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                Ainda não há versão nova pronta da peça. Para sanar agora, responda que não há o que alterar, explicando.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={semAlteracao} onChange={(e) => setSemAlteracao(e.target.checked)} disabled={!sanando?.versao_nova_pronta} />
              Não há o que alterar na peça (esclarecimento à Procuradoria)
            </label>
            <div>
              <Label htmlFor="resposta-diligencia">Resposta{semAlteracao ? " *" : " (opcional)"}</Label>
              <Textarea id="resposta-diligencia" className="mt-1" rows={3} value={resposta} onChange={(e) => setResposta(e.target.value)} />
            </div>
            {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSanando(null)} disabled={enviando}>Cancelar</Button>
            <Button onClick={sanar} disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" />} Sanar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
