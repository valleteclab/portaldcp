"use client"

/**
 * OS DOIS CAMINHOS DA PEÇA (decisão 1 do dono — Entrega 3A): toda etapa pode
 * ser cumprida "fazendo aqui" (a própria tela) OU "anexando o PDF feito fora"
 * (setores manuais continuam). Onde a lei permite, "Não se aplica" com
 * justificativa (art. 72, I — "se for o caso"). Mostra a situação da peça
 * (instrução do processo), as versões (histórico — Entrega 1) e o envio para
 * assinatura com vários signatários.
 * Fontes: GET /api/fase-interna/:id/instrucao, /documentos/:tipo, /documentos/:tipo/assinatura.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Circle, FilePlus2, FileText, History, Loader2, PenLine, Upload } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { AnexarPecaDialog } from "./AnexarPecaDialog"
import { aoAtualizarFaseInterna, avisarFaseInternaAtualizada, criarUltimaCarga, erroDaApi, fmtDia } from "@/lib/fase-interna/telas"

export interface LinhaInstrucao {
  tipo: string
  titulo: string
  obrigatorio: boolean
  fundamento: string
  status: string
  documento_id?: string
  justificativa?: string
  pode_nao_se_aplicar?: boolean
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
      toast.success(`${titulo}: documento gerado — a peça está pronta`)
      await aposAcao()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const naoSeAplica = async (desfazer: boolean) => {
    let corpo: Record<string, unknown> = { desfazer: true }
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
              {p.numero_peca ? ` · ${p.numero_peca}` : ""}
              {p.data_documento ? ` · de ${fmtDia(p.data_documento)}` : ""}
              {p.folha_inicial != null ? ` · fls. ${p.folha_inicial}${p.folha_final && p.folha_final !== p.folha_inicial ? `–${p.folha_final}` : ""}` : ""}
              {` · versão ${p.versao}`}
            </p>
          )}
          {status === "NAO_SE_APLICA" && linha?.justificativa && <p className="text-xs text-gray-700">Justificativa: {linha.justificativa}</p>}
          {status === "EM_ELABORACAO" && feitaAqui && (
            <p className="text-xs text-blue-900">
              Rascunho salvo — ainda não é a peça. Ela fica pronta depois de {emitir ? "gerar o documento" : fazerAqui ?? "gerar o documento"} (ou de anexar o PDF feito fora).
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {p?.tem_arquivo && linha?.documento_id && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${linha.documento_id}/arquivo`)}>
              <FileText className="w-3.5 h-3.5 mr-1" /> Ver PDF
            </Button>
          )}
          {emitir && feitaAqui && status === "EM_ELABORACAO" && (
            <Button size="sm" className="h-8" disabled={ocupado} onClick={gerarDocumento} title="Gerar o documento é a emissão: só assim a peça feita aqui fica pronta (o rascunho salvo não conta)">
              {ocupado ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5 mr-1" />} Gerar documento (PDF)
            </Button>
          )}
          {status !== "NAO_SE_APLICA" && (
            <Button size="sm" variant="outline" className="h-8" disabled={ocupado} onClick={() => setAnexando(true)}>
              <Upload className="w-3.5 h-3.5 mr-1" /> Anexar feito fora
            </Button>
          )}
          {permitirAssinatura && feitaAqui && status !== "NAO_SE_APLICA" && status !== "EM_ASSINATURA" && p?.status !== "ASSINADO" && (
            <Button size="sm" variant="outline" className="h-8" disabled={ocupado} onClick={() => setAssinar(true)} title="Envia a peça feita aqui para os signatários (a data da peça é a da última assinatura)">
              <PenLine className="w-3.5 h-3.5 mr-1" /> Enviar para assinatura
            </Button>
          )}
          {linha?.pode_nao_se_aplicar && status !== "NAO_SE_APLICA" && status !== "OK" && (
            <Button size="sm" variant="ghost" className="h-8" disabled={ocupado} onClick={() => naoSeAplica(false)}>
              Não se aplica
            </Button>
          )}
          {status === "NAO_SE_APLICA" && (
            <Button size="sm" variant="ghost" className="h-8" disabled={ocupado} onClick={() => naoSeAplica(true)}>
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
      {!compacto && status !== "NAO_SE_APLICA" && (
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
