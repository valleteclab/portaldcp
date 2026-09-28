"use client"

/**
 * ETAPA 3 — TERMO DE REFERÊNCIA (Entrega 3A). Editor por seções (art. 6º,
 * XXIII, a–j), DERIVADO do ETP (derivação existente), com os itens e valores
 * (respeitando o orçamento sigiloso — art. 24), o fundamento legal lido do
 * processo (fonte única) e a dotação lida da reserva orçamentária. Ou
 * "Anexar TR feito fora".
 * API: GET /api/fase-interna/:id/tr, POST /documentos/TR/gerar.
 */
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { AlertTriangle, FileText, Loader2, Lock } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { RascunhoIaFaixa } from "@/components/fase-interna/etapas/RascunhoIaFaixa"
import { BaseEditavelAviso } from "@/components/fase-interna/etapas/BaseEditavelAviso"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { erroDaApi, fmtMoeda, rotaDaTela, vigenteEBaseDoEditor } from "@/lib/fase-interna/telas"

const DocumentoSeccionado = dynamic(() => import("@/components/editor/DocumentoSeccionado").then((m) => ({ default: m.DocumentoSeccionado })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-hidden="true" />
    </div>
  ),
})

interface TrTela {
  licitacao: { id: string; numero_processo: string; objeto: string; modalidade: string; fase_interna: boolean }
  contratacao_direta: boolean
  tr: { peca: { documento_id: string; versao: number; nao_se_aplica: boolean } | null; secoes: Record<string, string> }
  etp: { peca: { status: string; nao_se_aplica: boolean } | null; pronto: boolean }
  itens: Array<{ id: string; numero_item: number; descricao: string; unidade: string; quantidade: number; valor_unitario: number | null; valor_total: number | null; codigo: string | null; catalogo: string | null }>
  valor_total: number
  sigilo: { sigiloso: boolean; justificativa: string | null }
  fundamento_legal: { codigo: string | null; texto: string | null }
  dotacao: { status: string; texto: string } | null
  derivaveis: Array<{ secao_id: string; origem: string }>
  /** Seções obrigatórias (art. 6º, XXIII) sem texto e que o sistema não completa sozinho. */
  obrigatorias_faltando?: Array<{ id: string; titulo: string }>
}

export default function TrPage() {
  const { id } = useParams() as { id: string }
  const [d, setD] = useState<TrTela | null>(null)
  const [documento, setDocumento] = useState<any>(undefined)
  /** Versão vigente (pode ser o PDF anexado) — o editor mostra a base (última feita aqui). */
  const [vigente, setVigente] = useState<any>(null)
  const { confirmar, dialogo } = useDialogoConfirmacao()
  const [licitacao, setLicitacao] = useState<any>(null)
  const [editorChave, setEditorChave] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const [r, docRes, licRes] = await Promise.all([
        authFetch(`${API_URL}/api/fase-interna/${id}/tr`),
        authFetch(`${API_URL}/api/fase-interna/${id}/documentos/TR`),
        authFetch(`${API_URL}/api/licitacoes/${id}`),
      ])
      if (!r.ok) throw new Error(await erroDaApi(r))
      setD(await r.json())
      const lista = docRes.ok ? await docRes.json() : []
      // E5: com o TR anexado, o editor mostra a última versão feita aqui (base para gerar de novo)
      const vb = vigenteEBaseDoEditor(Array.isArray(lista) ? lista : [])
      setVigente(vb.vigente)
      setDocumento(vb.base)
      if (licRes.ok) setLicitacao(await licRes.json())
      setEditorChave((n) => n + 1)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const gerar = async () => {
    // Antes de gerar: o que falta (as seções obrigatórias vazias saem como "não preenchida")
    const faltando = d?.obrigatorias_faltando ?? []
    const anexada = !!vigente && vigente.origem !== "INTERNO"
    if (faltando.length || anexada) {
      const ok = await confirmar({
        titulo: "Gerar o TR (PDF)",
        mensagem: [
          anexada ? `A versão vigente é o PDF anexado (versão ${vigente.versao}). Gerar cria a versão ${Number(vigente.versao) + 1} a partir das seções abaixo; o anexo fica no histórico.` : "",
          faltando.length
            ? `Seções obrigatórias ainda vazias (art. 6º, XXIII): ${faltando.map((f) => f.titulo).join("; ")}. Elas sairão como "Seção não preenchida" — o TR gerado conta como pronto assim mesmo.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        confirmarRotulo: faltando.length ? "Gerar mesmo assim" : "Gerar",
      })
      if (!ok) return
    }
    setGerando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/documentos/TR/gerar`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json()
      toast.success(
        j.secoes_derivadas?.length
          ? `TR gerado (PDF). Seções vazias completadas a partir do ETP, do fundamento legal e da reserva — revise.`
          : "TR gerado (PDF).",
      )
      await carregar()
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando o TR" />
      </div>
    )
  }
  const naoSeAplica = !!d.tr.peca?.nao_se_aplica
  const somenteLeitura = !d.licitacao.fase_interna || naoSeAplica

  return (
    <EtapaShell
      licitacaoId={id}
      tela="tr"
      titulo="Termo de Referência"
      subtitulo={<span>Art. 6º, XXIII, alíneas a–j, e art. 40 da Lei 14.133/2021{d.tr.peca ? ` · versão ${d.tr.peca.versao}` : ""}</span>}

      atualizacao={atualizacao}
      acoes={
        <Button onClick={gerar} disabled={gerando || somenteLeitura} title="Completa as seções vazias a partir do ETP, do fundamento legal e da reserva, e gera o PDF pelo modelo">
          {gerando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} Gerar TR (PDF)
        </Button>
      }
    >
      {dialogo}
      <CaminhosDaPeca licitacaoId={id} tipo="TR" titulo="Termo de referência" fazerAqui="redigir e gerar o TR (derivado do ETP)" atualizacao={atualizacao} onAtualizado={() => { carregar(); setAtualizacao((n) => n + 1) }} />
      {!naoSeAplica && (
        <RascunhoIaFaixa
          licitacaoId={id}
          peca="TR"
          somenteLeitura={somenteLeitura}
          atualizacao={atualizacao}
          explicacaoAceite="Aceitar preenche só as seções vazias do TR. Valor estimado, dotação e critérios de seleção continuam vindo do processo."
          onAceito={async () => {
            await carregar()
            setAtualizacao((n) => n + 1)
          }}
        />
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-lg border bg-white p-3 space-y-1" aria-label="Fundamento legal">
          <h2 className="text-xs font-semibold uppercase text-gray-600">Fundamento legal (do processo)</h2>
          <p className="text-sm text-gray-900">{d.fundamento_legal.texto ?? "—"}</p>
          <p className="text-xs text-gray-600">Fonte única: o TR e as demais peças leem o campo do processo.</p>
        </section>
        <section className="rounded-lg border bg-white p-3 space-y-1" aria-label="Dotação">
          <h2 className="text-xs font-semibold uppercase text-gray-600">Dotação (da reserva)</h2>
          {d.dotacao ? (
            <p className="text-sm text-gray-900">{d.dotacao.texto}{d.dotacao.status !== "EMITIDA" ? " (em preparação)" : ""}</p>
          ) : (
            <p className="text-sm text-gray-700">
              Sem reserva ainda. <Link className="text-blue-800 hover:underline" href={rotaDaTela(id, "reserva")}>Abrir a reserva orçamentária</Link>
            </p>
          )}
        </section>
        <section className="rounded-lg border bg-white p-3 space-y-1" aria-label="Estudo técnico">
          <h2 className="text-xs font-semibold uppercase text-gray-600">Base: estudo técnico</h2>
          <p className="text-sm text-gray-900">
            {d.etp.peca?.nao_se_aplica ? "ETP não se aplica (art. 72, I)" : d.etp.pronto ? "ETP disponível para derivar" : "ETP ainda não elaborado"}
          </p>
          <Link className="text-xs text-blue-800 hover:underline" href={rotaDaTela(id, "etp")}>Abrir o ETP</Link>
        </section>
      </div>

      <section className="rounded-lg border bg-white p-4 space-y-2" aria-label="Itens e valores">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Itens e valores</h2>
          {d.sigilo.sigiloso && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              <Lock className="w-3 h-3" aria-hidden="true" /> Orçamento sigiloso (art. 24): o texto do TR não traz os valores
            </span>
          )}
        </div>
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Item</th>
                <th scope="col" className="text-left px-3 py-2">Descrição</th>
                <th scope="col" className="text-left px-3 py-2">CATMAT/CATSER</th>
                <th scope="col" className="text-right px-3 py-2">Qtde</th>
                <th scope="col" className="text-right px-3 py-2">Valor unitário</th>
                <th scope="col" className="text-right px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.itens.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{String(i.numero_item).padStart(2, "0")}</td>
                  <td className="px-3 py-2">{i.descricao}</td>
                  <td className="px-3 py-2 text-xs">{i.codigo ? `${i.catalogo} ${i.codigo}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{i.quantidade.toLocaleString("pt-BR")} {i.unidade}</td>
                  <td className="px-3 py-2 text-right">{fmtMoeda(i.valor_unitario)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoeda(i.valor_total ?? (i.valor_unitario ?? 0) * i.quantidade)}</td>
                </tr>
              ))}
              <tr className="border-t bg-gray-50 font-medium">
                <td className="px-3 py-2" colSpan={5}>Total estimado{d.sigilo.sigiloso ? " (sigiloso — só nos autos)" : ""}</td>
                <td className="px-3 py-2 text-right">{fmtMoeda(d.valor_total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600">
          Itens e valores vêm do cadastro do processo (DFD e pesquisa de preços). Para mudar, use a <Link className="text-blue-800 hover:underline" href={rotaDaTela(id, "dfd")}>demanda</Link> ou a{" "}
          <Link className="text-blue-800 hover:underline" href={rotaDaTela(id, "pesquisa")}>pesquisa</Link>.
        </p>
      </section>

      {!naoSeAplica && !!d.obrigatorias_faltando?.length && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950" aria-label="O que falta no TR">
          <p className="font-medium">Faltam {d.obrigatorias_faltando.length} seção(ões) obrigatória(s) do TR (art. 6º, XXIII):</p>
          <ul className="list-disc ml-5 text-xs mt-1 space-y-0.5">
            {d.obrigatorias_faltando.map((f) => (
              <li key={f.id}>
                <a className="underline" href={`#secao-${f.id}`}>{f.titulo}</a>
              </li>
            ))}
          </ul>
          <p className="text-xs mt-1">As demais o &quot;Gerar TR&quot; completa a partir do ETP, do fundamento legal e da reserva. Gerado, o TR conta como pronto.</p>
        </section>
      )}
      {!naoSeAplica && <BaseEditavelAviso vigente={vigente} base={documento} titulo="o TR" />}
      {naoSeAplica ? (
        <div className="rounded-lg border bg-slate-50 p-4 text-sm text-gray-700">O TR foi marcado como <b>não se aplica</b>. Para elaborá-lo, desfaça a marcação acima.</div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden h-[70vh] lg:h-[calc(100vh-260px)] min-h-[480px]">
          {documento !== undefined && (
            <DocumentoSeccionado key={editorChave} licitacaoId={id} tipo="TR" documento={documento} licitacao={licitacao} ocultarPdf somenteLeitura={somenteLeitura} />
          )}
        </div>
      )}
    </EtapaShell>
  )
}
