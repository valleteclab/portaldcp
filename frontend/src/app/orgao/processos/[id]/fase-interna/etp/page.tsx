"use client"

/**
 * ETAPA 2 — ESTUDO TÉCNICO PRELIMINAR E RISCOS (Entrega 3A; mockup ETP.dc.html).
 * Editor por seções do art. 18, §1º (o editor existente — DocumentoSeccionado),
 * com os incisos obrigatórios do §2º (I, IV, VI, VIII e XIII) indicados e o
 * assistente de IA no painel (rascunho, marca, coerência, pendências). A
 * sugestão só entra com o clique do usuário. Na contratação direta o ETP é
 * "se for o caso" (art. 72, I): "Não se aplica" com justificativa.
 * API: GET /api/fase-interna/:id/etp, POST /etp/assistente, PUT /etp/marca,
 * POST /documentos/ETP/gerar; riscos na tela de riscos existente.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { AlertTriangle, FileText, Loader2, ShieldAlert } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { AssistenteEtp, type AnaliseEtp } from "@/components/fase-interna/etapas/AssistenteEtp"
import { RascunhoIaFaixa } from "@/components/fase-interna/etapas/RascunhoIaFaixa"
import { erroDaApi } from "@/lib/fase-interna/telas"

const DocumentoSeccionado = dynamic(() => import("@/components/editor/DocumentoSeccionado").then((m) => ({ default: m.DocumentoSeccionado })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-hidden="true" />
    </div>
  ),
})

interface EtpTela extends AnaliseEtp {
  licitacao: { id: string; numero_processo: string; objeto: string; modalidade: string; fase_interna: boolean }
  contratacao_direta: boolean
  etp: {
    peca: { documento_id: string; versao: number; status: string; origem: string; anexada: boolean; nao_se_aplica: boolean; tem_arquivo: boolean } | null
    secoes: Record<string, string>
    justificativa_marca: string | null
  }
  instrucao: { etp: any; riscos: any }
  dfd: { necessidade: string | null }
  modelo: Array<{ id: string; titulo: string }>
}

export default function EtpPage() {
  const { id } = useParams() as { id: string }
  const [d, setD] = useState<EtpTela | null>(null)
  const [documento, setDocumento] = useState<any>(null)
  const [licitacao, setLicitacao] = useState<any>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editorChave, setEditorChave] = useState(0)
  const [sugestao, setSugestao] = useState<{ secaoId: string; html: string; nonce: number } | null>(null)
  const [conteudo, setConteudo] = useState<Record<string, string>>({})
  const [gerando, setGerando] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregarAnalise = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/etp`)
      if (!r.ok) throw new Error(await erroDaApi(r))
      setD(await r.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id])

  const carregarDocumento = useCallback(async () => {
    const [docRes, licRes] = await Promise.all([
      authFetch(`${API_URL}/api/fase-interna/${id}/documentos/ETP`),
      authFetch(`${API_URL}/api/licitacoes/${id}`),
    ])
    if (docRes.ok) {
      const lista = await docRes.json()
      setDocumento(Array.isArray(lista) ? lista.find((x: any) => x.versao_atual) ?? lista[0] ?? null : lista)
    }
    if (licRes.ok) setLicitacao(await licRes.json())
    setEditorChave((n) => n + 1)
  }, [id])

  useEffect(() => {
    carregarAnalise()
    carregarDocumento()
  }, [carregarAnalise, carregarDocumento])

  // Análise ao vivo: depois de cada edição (autosave), recarrega a análise do servidor
  const aoMudarConteudo = useCallback(
    (c: Record<string, string>) => {
      setConteudo(c)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => carregarAnalise(), 2000)
    },
    [carregarAnalise],
  )

  const gerar = async () => {
    setGerando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/documentos/ETP/gerar`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success("ETP gerado pelo modelo (PDF). Seções vazias foram completadas com o que já existe (DFD e processo) — revise.")
      await Promise.all([carregarAnalise(), carregarDocumento()])
      setAtualizacao((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setGerando(false)
    }
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando o ETP" />
      </div>
    )
  }

  const naoSeAplica = !!d.etp.peca?.nao_se_aplica
  const somenteLeitura = !d.licitacao.fase_interna || naoSeAplica
  const bloqueios = d.marca.filter((m) => m.severidade === "BLOQUEIO").length
  const recarregarTudo = () => {
    carregarAnalise()
    carregarDocumento()
    setAtualizacao((n) => n + 1)
  }
  const painel = (
    <AssistenteEtp
      licitacaoId={id}
      analise={{ ...d, justificativa_marca: d.etp.justificativa_marca }}
      secoes={{ ...d.etp.secoes, ...conteudo }}
      modelo={d.modelo}
      somenteLeitura={somenteLeitura}
      onAplicar={(secaoId, html) => setSugestao({ secaoId, html, nonce: Date.now() })}
      onJustificativaSalva={carregarAnalise}
    />
  )

  return (
    <EtapaShell
      licitacaoId={id}
      tela="etp"
      titulo="Estudo Técnico Preliminar"
      subtitulo={
        <span>
          Art. 18, §1º · obrigatórios pelo §2º: I, IV, VI, VIII e XIII
          {d.etp.peca ? ` · versão ${d.etp.peca.versao}` : ""}
          {d.contratacao_direta ? ' · contratação direta: "se for o caso" (art. 72, I)' : ""}
        </span>
      }
      atualizacao={atualizacao}
      acoes={
        <>
          <Button asChild variant="outline">
            <Link href={`/orgao/fase-interna/processos/${id}/riscos`}>
              <ShieldAlert className="w-4 h-4 mr-1" /> Análise de riscos ({d.riscos.total})
            </Link>
          </Button>
          <Button onClick={gerar} disabled={gerando || somenteLeitura} title="Completa as seções vazias com o que já existe e gera o PDF pelo modelo">
            {gerando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} Gerar ETP (PDF)
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <CaminhosDaPeca licitacaoId={id} tipo="ETP" titulo="Estudo técnico preliminar" fazerAqui="redigir e gerar o ETP" atualizacao={atualizacao} onAtualizado={recarregarTudo} compacto />
        <CaminhosDaPeca licitacaoId={id} tipo="AR" titulo="Análise de riscos" fazerAqui="preencher a matriz de riscos e gerar o documento" atualizacao={atualizacao} onAtualizado={recarregarTudo} permitirAssinatura={false} emitir compacto />
      </div>

      {!naoSeAplica && (
        <RascunhoIaFaixa
          licitacaoId={id}
          peca="ETP"
          somenteLeitura={somenteLeitura}
          atualizacao={atualizacao}
          explicacaoAceite="Aceitar preenche só os incisos vazios do ETP — o que você já escreveu fica. Previsão no PCA e estimativa de valor continuam vindo do DFD e da pesquisa."
          onAceito={recarregarTudo}
        />
      )}

      {bloqueios > 0 && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {bloqueios} {bloqueios === 1 ? "indicação de marca" : "indicações de marca"} sem a forma &quot;apenas como referência, ou similar/equivalente&quot; e sem justificativa (art. 41, I). Veja o assistente.
        </p>
      )}

      {naoSeAplica ? (
        <div className="rounded-lg border bg-slate-50 p-4 text-sm text-gray-700">
          O ETP foi marcado como <b>não se aplica</b> nesta contratação direta (art. 72, I). Para elaborá-lo, desfaça a marcação acima.
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-white overflow-hidden h-[70vh] lg:h-[calc(100vh-260px)] min-h-[480px]">
            {documento !== undefined && (
              <DocumentoSeccionado
                key={editorChave}
                licitacaoId={id}
                tipo="ETP"
                documento={documento}
                licitacao={licitacao}
                painelLateral={painel}
                iaSoPorSugestao
                ocultarPdf
                somenteLeitura={somenteLeitura}
                sugestaoAceita={sugestao}
                onConteudoChange={aoMudarConteudo}
              />
            )}
          </div>
          {/* No celular o assistente vem depois do editor */}
          <div className="lg:hidden rounded-lg border bg-white">{painel}</div>
        </>
      )}
    </EtapaShell>
  )
}
