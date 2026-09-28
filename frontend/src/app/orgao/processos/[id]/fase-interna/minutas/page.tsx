"use client"

/**
 * ETAPA 7 (parte do agente) — RELATÓRIO DO AGENTE E MINUTAS (Entrega 3B).
 * Relatório do agente (RAG), minuta do aviso (ME) e minuta do contrato (MC)
 * gerados pelo MODELO lendo SEMPRE os dados do processo — número do PA e da
 * dispensa, fundamento legal, valores, dotação, sigilo (art. 24) e a portaria
 * de designação (evita o erro real do PA 139/2025: contrato citando o "PA
 * 115/2025" de outro processo). Mudar o fundamento regera as minutas geradas
 * e intocadas; a editada à mão ganha o aviso "desatualizada — regerar?".
 * Tudo aceita o PDF feito fora (anexo).
 * API: GET /api/fase-interna/:id/minutas, POST /minutas/:tipo/gerar, PUT /minutas/sigilo.
 */
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { AlertTriangle, FileText, Loader2, Lock, RefreshCw } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { PERMISSAO_LIVRE, type PermissaoTrabalho } from "@/lib/fase-interna/permissao-etapa"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { erroDaApi, fmtDia, fmtMoeda, rotaDaTela } from "@/lib/fase-interna/telas"

const DocumentoSeccionado = dynamic(() => import("@/components/editor/DocumentoSeccionado").then((m) => ({ default: m.DocumentoSeccionado })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-hidden="true" />
    </div>
  ),
})

type TipoMinuta = "RAG" | "ME" | "MC"
const ABAS: Array<{ tipo: TipoMinuta; titulo: string; ajuda: string }> = [
  { tipo: "RAG", titulo: "Relatório do agente", ajuda: "Enquadramento, justificativa do preço e razão da escolha (art. 72, VI e VII)" },
  { tipo: "ME", titulo: "Minuta do aviso", ajuda: "Aviso de contratação direta com os anexos (art. 75, §3º)" },
  { tipo: "MC", titulo: "Minuta do contrato", ajuda: "Cláusulas necessárias do art. 92" },
]

interface PecaMinuta {
  peca: {
    documento_id: string
    versao: number
    status: string
    anexada: boolean
    nao_se_aplica: boolean
    gerada_pelo_modelo: boolean
    gerada_em: string | null
    editada: boolean
    desatualizada: { texto: string; motivo: string } | null
  } | null
  secoes: Record<string, string>
  instrucao: { status: string } | null
  referencias_divergentes: string[]
}

interface MinutasTela {
  licitacao: { id: string; numero_processo: string; numero_dispensa: string | null; objeto: string; fase_interna: boolean }
  contratacao_direta: boolean
  dados_do_processo: {
    fundamento_legal: { codigo: string | null; texto: string | null }
    valor_estimado: number
    dotacao: { status: string; texto: string } | null
    sigilo: { sigiloso: boolean; justificativa: string | null }
    agente: string | null
    portaria: { origem: string; numero: string } | null
  }
  pecas: Record<TipoMinuta, PecaMinuta>
}

export default function MinutasPage() {
  const { id } = useParams() as { id: string }
  // Isolamento das peças: a permissão de quem vê nesta etapa (EtapaShell)
  const [perm, setPerm] = useState<PermissaoTrabalho>(PERMISSAO_LIVRE)
  const { confirmar, dialogo } = useDialogoConfirmacao()
  const [d, setD] = useState<MinutasTela | null>(null)
  const [aba, setAba] = useState<TipoMinuta>("RAG")
  const [documento, setDocumento] = useState<any>(undefined)
  const [licitacao, setLicitacao] = useState<any>(null)
  const [editorChave, setEditorChave] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)
  const [sigiloso, setSigiloso] = useState(false)
  const [justificativa, setJustificativa] = useState("")

  const carregar = useCallback(async () => {
    try {
      const [r, docRes, licRes] = await Promise.all([
        authFetch(`${API_URL}/api/fase-interna/${id}/minutas`),
        authFetch(`${API_URL}/api/fase-interna/${id}/documentos/${aba}`),
        authFetch(`${API_URL}/api/licitacoes/${id}`),
      ])
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j: MinutasTela = await r.json()
      setD(j)
      setSigiloso(j.dados_do_processo.sigilo.sigiloso)
      setJustificativa(j.dados_do_processo.sigilo.justificativa ?? "")
      const lista = docRes.ok ? await docRes.json() : []
      setDocumento(Array.isArray(lista) ? lista.find((x: any) => x.versao_atual) ?? lista[0] ?? null : lista)
      if (licRes.ok) setLicitacao(await licRes.json())
      setEditorChave((n) => n + 1)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id, aba])
  useEffect(() => {
    carregar()
  }, [carregar])

  const gerar = async (tipo: TipoMinuta | "TODAS") => {
    const p = tipo !== "TODAS" ? d?.pecas[tipo]?.peca : null
    if (p?.editada && !(await confirmar({ titulo: "Regerar pelo modelo?", mensagem: "O texto editado à mão será substituído pelo texto do modelo com os dados atuais do processo (a versão anterior fica no histórico quando já assinada ou anexada).", confirmarRotulo: "Regerar" }))) return
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/minutas/${tipo}/gerar`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success(tipo === "TODAS" ? "Relatório e minutas gerados com os dados do processo." : "Peça gerada com os dados do processo.")
      await carregar()
      setAtualizacao((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const salvarSigilo = async () => {
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/minutas/sigilo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sigiloso, justificativa }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success(sigiloso ? "Orçamento sigiloso (art. 24) — as minutas geradas foram atualizadas." : "Orçamento público — as minutas geradas foram atualizadas.")
      await carregar()
      setAtualizacao((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando as minutas" />
      </div>
    )
  }
  const dp = d.dados_do_processo
  const atual = d.pecas[aba]
  const somenteLeitura = !d.licitacao.fase_interna || !!atual.peca?.nao_se_aplica || !!atual.peca?.anexada || !perm.pode

  return (
    <EtapaShell
      onPermissao={setPerm}
      licitacaoId={id}
      tela="minutas"
      titulo="Relatório do agente e minutas"
      subtitulo={<span>Art. 72 da Lei 14.133/2021 · as peças leem os dados do processo {d.licitacao.numero_processo}</span>}
      atualizacao={atualizacao}
      acoes={
        <Button onClick={() => gerar("TODAS")} disabled={ocupado || !d.licitacao.fase_interna || !perm.pode} title="Gera o relatório do agente, a minuta do aviso e a minuta do contrato pelo modelo">
          {ocupado ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} Gerar as três pelo modelo
        </Button>
      }
    >
      {dialogo}
      <section aria-label="Dados do processo" className="rounded-lg border bg-white p-4 grid gap-3 md:grid-cols-3 text-sm">
        <div>
          <h2 className="text-xs font-semibold uppercase text-gray-600">Processo e dispensa</h2>
          <p className="text-gray-900">PA {d.licitacao.numero_processo}{d.licitacao.numero_dispensa ? ` · nº ${d.licitacao.numero_dispensa}` : " · número da dispensa na divulgação"}</p>
          <p className="text-gray-900">{dp.fundamento_legal.texto ?? "—"}</p>
          <Link className="text-xs text-blue-800 hover:underline" href={`/orgao/processos/${id}/editar`}>Mudar o fundamento (Editar processo)</Link>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-gray-600">Valor e dotação</h2>
          <p className="text-gray-900">{fmtMoeda(dp.valor_estimado)}{dp.sigilo.sigiloso ? " (sigiloso — as minutas públicas omitem)" : ""}</p>
          <p className="text-gray-700 text-xs">
            {dp.dotacao ? dp.dotacao.texto : <>Sem reserva — <Link className="text-blue-800 hover:underline" href={rotaDaTela(id, "reserva")}>abrir a reserva</Link></>}
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase text-gray-600">Agente e designação</h2>
          <p className="text-gray-900">{dp.agente ?? "Agente não definido no processo"}</p>
          <p className="text-gray-700 text-xs">{dp.portaria ? `${dp.portaria.numero}${dp.portaria.origem === "ORGAO" ? " (portaria do órgão no exercício)" : ""}` : "Sem portaria de designação — cadastre a do órgão"}</p>
        </div>
      </section>

      <section aria-label="Sigilo do orçamento" className="rounded-lg border bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-700" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900">Sigilo do orçamento (art. 24)</h2>
        </div>
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <label className="flex items-center gap-2">
            <input type="radio" name="sigilo" checked={!sigiloso} onChange={() => setSigiloso(false)} disabled={!d.licitacao.fase_interna || !perm.pode} /> Público
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="sigilo" checked={sigiloso} onChange={() => setSigiloso(true)} disabled={!d.licitacao.fase_interna || !perm.pode} /> Sigiloso até o julgamento
          </label>
        </div>
        {sigiloso && (
          <div className="space-y-1">
            <Label htmlFor="just-sigilo">Justificativa do sigilo</Label>
            <Textarea id="just-sigilo" rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Ex.: evitar a ancoragem dos preços na disputa, com divulgação após o julgamento (art. 24)." />
          </div>
        )}
        <Button size="sm" variant="outline" onClick={salvarSigilo} disabled={ocupado || !d.licitacao.fase_interna || !perm.pode}>
          Salvar a decisão
        </Button>
      </section>

      <div role="tablist" aria-label="Peças" className="flex gap-1 border-b">
        {ABAS.map((a) => {
          const p = d.pecas[a.tipo]
          const aviso = !!p.peca?.desatualizada || p.referencias_divergentes.length > 0
          return (
            <button
              key={a.tipo}
              type="button"
              role="tab"
              aria-selected={aba === a.tipo}
              onClick={() => setAba(a.tipo)}
              className={`px-3 h-10 text-sm -mb-px border-b-2 ${aba === a.tipo ? "border-blue-800 font-semibold text-gray-900" : "border-transparent text-gray-600"}`}
            >
              {a.titulo}
              {p.instrucao?.status === "OK" && <span className="ml-1 text-green-700" aria-label="pronta">●</span>}
              {aviso && <span className="ml-1 text-amber-700" aria-label="atenção">▲</span>}
            </button>
          )
        })}
      </div>

      {ABAS.filter((a) => a.tipo === aba).map((a) => (
        <div key={a.tipo} className="space-y-3">
          <CaminhosDaPeca
            licitacaoId={id}
            tipo={a.tipo}
            titulo={a.titulo}
            fazerAqui={`gerar pelo modelo e editar — ${a.ajuda.toLowerCase()}`}
            atualizacao={atualizacao}
            onAtualizado={() => {
              carregar()
              setAtualizacao((n) => n + 1)
            }}
          />
          {atual.peca && !atual.peca.anexada && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-700">
              {atual.peca.gerada_pelo_modelo ? <span>Gerada pelo modelo em {fmtDia(atual.peca.gerada_em)}</span> : <span>Feita no editor (não acompanha o processo sozinha)</span>}
              {atual.peca.editada && <span className="rounded bg-blue-50 text-blue-900 px-1.5 py-0.5">editada à mão</span>}
              <Button size="sm" variant="ghost" className="h-7" onClick={() => gerar(a.tipo)} disabled={ocupado || somenteLeitura}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Regerar pelo modelo
              </Button>
            </div>
          )}
          {!atual.peca && (
            <Button variant="outline" onClick={() => gerar(a.tipo)} disabled={ocupado || !d.licitacao.fase_interna || !perm.pode}>
              <FileText className="w-4 h-4 mr-1" /> Gerar {a.titulo.toLowerCase()} pelo modelo
            </Button>
          )}
          {atual.peca?.desatualizada && (
            <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-center justify-between gap-2 flex-wrap">
              <span>{atual.peca.desatualizada.texto}</span>
              <Button size="sm" onClick={() => gerar(a.tipo)} disabled={ocupado || somenteLeitura}>Regerar</Button>
            </div>
          )}
          {atual.referencias_divergentes.length > 0 && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              A peça cita outro processo: <b>{atual.referencias_divergentes.join("; ")}</b>. Este é o PA {d.licitacao.numero_processo} — corrija (ou regere pelo modelo).
            </div>
          )}
          {atual.peca?.nao_se_aplica ? (
            <div className="rounded-lg border bg-slate-50 p-4 text-sm text-gray-700">Marcada como <b>não se aplica</b>.</div>
          ) : atual.peca?.anexada ? (
            <div className="rounded-lg border bg-slate-50 p-4 text-sm text-gray-700">Peça anexada (feita fora) — veja o PDF acima. Para fazer aqui, gere pelo modelo (vira uma versão nova).</div>
          ) : (
            <div className="rounded-lg border bg-white overflow-hidden h-[70vh] lg:h-[calc(100vh-260px)] min-h-[480px]">
              {documento !== undefined && (
                <DocumentoSeccionado key={`${a.tipo}-${editorChave}`} licitacaoId={id} tipo={a.tipo} documento={documento} licitacao={licitacao} ocultarPdf somenteLeitura={somenteLeitura} />
              )}
            </div>
          )}
        </div>
      ))}
    </EtapaShell>
  )
}
