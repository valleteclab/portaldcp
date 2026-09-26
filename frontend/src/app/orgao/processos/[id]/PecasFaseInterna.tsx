"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Circle, FileText, Loader2, PenLine, Upload } from "lucide-react"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { AnexarPecaDialog } from "./AnexarPecaDialog"

interface ItemInstrucao {
  tipo: string
  titulo: string
  obrigatorio: boolean
  fundamento: string
  status: string
  documento_id?: string
  justificativa?: string
  exige_aprovacao?: boolean
  aprovacao?: { etapa: number; total: number; etapa_nome: string; responsavel: string | null }
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
    documento_orgao_id: string | null
  }
}

interface Instrucao {
  contratacao_direta: boolean
  itens: ItemInstrucao[]
  pode_divulgar: boolean
  pendentes: string[]
}

const fmtData = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null

/**
 * PEÇAS DA FASE INTERNA (tela do processo). Cada peça tem três caminhos, que
 * contam igual no checklist (Entrega 1 — docs/licitacao/PLANO-FASE-INTERNA.md):
 *  - Fazer aqui: editor com modelo (e IA) — abre a peça no editor;
 *  - Anexar PDF: peça feita fora (número, data da peça, quem assinou);
 *  - Não se aplica: só onde a lei permite (peça "se for o caso" do art. 72).
 * Contratação direta: art. 72. Demais modalidades: obrigatórios do art. 18.
 * Fonte: GET /api/fase-interna/:id/instrucao.
 */
export function PecasFaseInterna({
  licitacaoId,
  mostrarCopiloto,
  atualizacao,
  onAtualizado,
}: {
  licitacaoId: string
  mostrarCopiloto: boolean
  atualizacao?: unknown
  onAtualizado: () => void
}) {
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
  const [instrucao, setInstrucao] = useState<Instrucao | null>(null)
  const [carregandoTipo, setCarregandoTipo] = useState<string | null>(null)
  const [disparando, setDisparando] = useState(false)
  const [anexando, setAnexando] = useState<{ tipo: string; titulo: string; jaTem: boolean } | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/instrucao`)
      if (r.ok) setInstrucao(await r.json())
    } catch { /* quadro fica oculto */ }
  }, [licitacaoId])
  useEffect(() => { carregar() }, [carregar, atualizacao])

  // Vindo da caixa de tarefas (#peca-DFD): rola até a peça e destaca
  const [destaque, setDestaque] = useState<string | null>(null)
  const temItens = !!instrucao?.itens?.length
  useEffect(() => {
    if (!temItens || typeof window === "undefined") return
    const irParaHash = () => {
      const m = window.location.hash.match(/^#peca-([A-Z]+)$/)
      if (!m) return
      const el = document.getElementById(`peca-${m[1]}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setDestaque(m[1])
      window.setTimeout(() => setDestaque(null), 4000)
    }
    irParaHash()
    window.addEventListener("hashchange", irParaHash)
    return () => window.removeEventListener("hashchange", irParaHash)
  }, [temItens])

  const naoSeAplica = async (tipo: string, titulo: string, desfazer: boolean) => {
    let corpo: Record<string, unknown> = { desfazer: true }
    if (!desfazer) {
      const j = await pedirTexto({
        titulo: `"${titulo}" não se aplica`,
        mensagem: "Marcar esta peça como NÃO SE APLICA a esta contratação? A justificativa fica registrada nos autos (art. 72).",
        rotulo: "Justificativa",
        obrigatorio: true,
        confirmarRotulo: "Marcar não se aplica",
      })
      if (!j) return
      let usuario: { id?: string; nome?: string } = {}
      try { usuario = JSON.parse(localStorage.getItem("usuario") || "{}") } catch { /* segue sem autor */ }
      corpo = { justificativa: j.trim(), usuarioId: usuario?.id, usuarioNome: usuario?.nome }
    }
    setCarregandoTipo(tipo)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/instrucao/${tipo}/nao-se-aplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      const jj = await res.json().catch(() => null)
      if (!res.ok) throw new Error(jj?.message || `HTTP ${res.status}`)
      setInstrucao(jj)
      onAtualizado()
    } catch (e) {
      toast.error(`Erro: ${(e instanceof Error ? e.message : String(e))}`)
    } finally {
      setCarregandoTipo(null)
    }
  }

  const usarPortaria = async () => {
    setCarregandoTipo("DP")
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/portaria-designacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      toast.success(`Portaria ${j?.numero_peca ?? ""} juntada ao processo`)
      await carregar()
      onAtualizado()
    } catch (e) {
      toast.error((e instanceof Error ? e.message : String(e)))
    } finally {
      setCarregandoTipo(null)
    }
  }

  const copiloto = async () => {
    if (!(await confirmar({
      titulo: "Preparar o processo automaticamente?",
      mensagem:
        "O copiloto pesquisa preços em fontes reais (PNCP/Painel de Preços) e redige os rascunhos do ETP, TR e autorização. " +
        "Tudo fica marcado como SUGERIDO para você revisar — nada é publicado sem a sua validação.",
      confirmarRotulo: "Preparar",
    }))) return
    setDisparando(true)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/preparar-automatico`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      onAtualizado()
    } catch (e) {
      toast.error(`Erro ao iniciar o copiloto: ${(e instanceof Error ? e.message : String(e))}`)
    } finally {
      setDisparando(false)
    }
  }

  if (!instrucao || !instrucao.itens?.length) return null
  const direta = instrucao.contratacao_direta

  return (
    <div className="border rounded-md p-3 bg-slate-50 space-y-2">
      {dialogo}
      <AnexarPecaDialog
        licitacaoId={licitacaoId}
        peca={anexando}
        onFechar={() => setAnexando(null)}
        onAnexado={() => { setAnexando(null); carregar(); onAtualizado() }}
      />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-800">
          {direta ? "Peças da instrução (art. 72)" : "Peças da fase interna (art. 18)"}
        </h3>
        {direta && mostrarCopiloto && !instrucao.pode_divulgar && (
          <Button size="sm" variant="outline" onClick={copiloto} disabled={disparando}>
            {disparando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Preparar automaticamente (copiloto)
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {instrucao.itens.map((it) => {
          const p = it.peca
          const ocupado = carregandoTipo === it.tipo
          return (
            <li
              key={it.tipo}
              id={`peca-${it.tipo}`}
              className={`text-xs bg-white border rounded px-2 py-1.5 space-y-1 scroll-mt-4 ${destaque === it.tipo ? "ring-2 ring-blue-600" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {it.status === "OK" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-700 shrink-0" aria-label="Pronto" />
                  ) : it.status === "NAO_SE_APLICA" ? (
                    <span className="text-gray-600 shrink-0" aria-label="Não se aplica">∅</span>
                  ) : (
                    <Circle className={`w-3.5 h-3.5 shrink-0 ${it.obrigatorio ? "text-amber-600" : "text-gray-400"}`} aria-label="Pendente" />
                  )}
                  <span className={it.status === "NAO_SE_APLICA" ? "line-through text-gray-600" : "font-medium"}>{it.titulo}</span>
                  <span className="text-gray-600">({it.fundamento})</span>
                  {it.obrigatorio && <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-900">obrigatório</Badge>}
                  {it.status === "EM_APROVACAO" && (
                    <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      em aprovação{it.aprovacao ? ` — ${it.aprovacao.etapa_nome} (${it.aprovacao.etapa}/${it.aprovacao.total})${it.aprovacao.responsavel ? ` · ${it.aprovacao.responsavel}` : ""}` : ""}
                    </span>
                  )}
                  {it.status === "EM_ASSINATURA" && (
                    <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">aguardando assinaturas</span>
                  )}
                  {it.status === "EM_ELABORACAO" && it.exige_aprovacao && (
                    <span className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">aguarda envio p/ aprovação</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap">
                  {it.status !== "NAO_SE_APLICA" && (
                    <>
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                        <Link href={`/orgao/fase-interna/processos/${licitacaoId}/editor?tipo=${it.tipo}`}>
                          <PenLine className="w-3 h-3 mr-1" /> Fazer aqui
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={ocupado}
                        onClick={() => setAnexando({ tipo: it.tipo, titulo: it.titulo, jaTem: !!p })}>
                        <Upload className="w-3 h-3 mr-1" /> Anexar PDF
                      </Button>
                      {it.tipo === "DP" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={ocupado} onClick={usarPortaria}>
                          Usar portaria do órgão
                        </Button>
                      )}
                    </>
                  )}
                  {it.pode_nao_se_aplicar && it.status !== "NAO_SE_APLICA" && it.status !== "OK" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={ocupado}
                      onClick={() => naoSeAplica(it.tipo, it.titulo, false)}>
                      Não se aplica
                    </Button>
                  )}
                  {it.status === "NAO_SE_APLICA" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={ocupado}
                      onClick={() => naoSeAplica(it.tipo, it.titulo, true)}>
                      desfazer
                    </Button>
                  )}
                </div>
              </div>
              {(p && it.status !== "NAO_SE_APLICA") && (
                <div className="flex items-center gap-2 flex-wrap pl-5 text-[11px] text-gray-700">
                  <span>{p.anexada ? "Anexada (feita fora)" : "Feita no sistema"}</span>
                  {p.numero_peca && <span>· {p.numero_peca}</span>}
                  {p.data_documento && <span>· de {fmtData(p.data_documento)}</span>}
                  {p.folha_inicial != null && <span>· fls. {p.folha_inicial}{p.folha_final && p.folha_final !== p.folha_inicial ? `–${p.folha_final}` : ""}</span>}
                  {p.versao > 1 && <span>· versão {p.versao}</span>}
                  {p.tem_arquivo && it.documento_id && (
                    <button type="button" className="text-blue-800 hover:underline inline-flex items-center gap-0.5"
                      onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${it.documento_id}/arquivo`)}>
                      <FileText className="w-3 h-3" /> ver PDF
                    </button>
                  )}
                </div>
              )}
              {it.status === "NAO_SE_APLICA" && it.justificativa && (
                <p className="pl-5 text-[11px] text-gray-600">Justificativa: {it.justificativa}</p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-gray-600">
        {direta
          ? <>Mínimo para divulgar: DFD, estimativa de despesa e autorização. As demais são &quot;se for o caso&quot; — marque &quot;não se aplica&quot; com justificativa (fica registrada nos autos).</>
          : <>Cada etapa só conclui com as peças obrigatórias dela prontas — feitas aqui ou anexadas.</>}
        {" "}Peça feita fora do sistema: &quot;Anexar PDF&quot; (com a data que consta na peça).
      </p>
    </div>
  )
}
