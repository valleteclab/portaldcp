"use client"

/**
 * ETAPA 4 — PESQUISA DE PREÇOS (Entrega 3A; mockup Pesquisa.dc.html).
 *  - os 5 parâmetros do art. 23, §1º, cada um com "consultado em [data]",
 *    resultado e evidência — inclusive "consultado sem retorno";
 *  - cotações diretas (propostas): fornecedor, CNPJ, valores por item, emissão,
 *    validade e comprovante; alertas de validade e de 6 meses;
 *  - menor, média e mediana calculados; método adotado com justificativa e a
 *    justificativa da escolha dos fornecedores;
 *  - consumo do limite do art. 75 ("98,4% de R$ 62.725,59 — Dec. 12.343/2024");
 *  - emissão do mapa e da certidão; pesquisa feita fora = anexar o mapa +
 *    valor unitário nos itens (decisão 2 do dono);
 *  - o módulo detalhado (agentes PNCP/Painel, CSV, estatística por item) fica
 *    embutido, reaproveitado.
 * API: /api/fase-interna/:id/pesquisa (+ /parametros, /propostas, /metodo, /emitir, /valores-itens, /arquivos).
 */
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, ChevronDown, ChevronUp, FileText, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { PesquisaPrecosDetalhe } from "@/components/fase-interna/PesquisaPrecosDetalhe"
import { ConsumoLimiteDispensa } from "../../ConsumoLimiteDispensa"
import { erroDaApi, fmtDia, fmtMoeda, hojeBrasilia } from "@/lib/fase-interna/telas"

type Metodo = "MENOR" | "MEDIA" | "MEDIANA"

interface PesquisaTela {
  licitacao: { id: string; numero_processo: string; objeto: string; modalidade: string; fase_interna: boolean; sigiloso: boolean }
  peca: { documento_id: string; anexada: boolean; tem_arquivo: boolean; numero_peca: string | null } | null
  mapa: { documento_id: string; tem_arquivo: boolean } | null
  certidao: { path: string; gerada_em: string } | null
  mapa_gerado_em: string | null
  parametros: Array<{
    inciso: string
    titulo: string
    texto: string
    situacao: "CONSULTADO" | "SEM_RETORNO" | "NAO_CONSULTADO"
    situacao_tela: "ATENDIDO" | "SEM_RETORNO" | "PENDENTE"
    data_consulta: string | null
    resultado: string | null
    evidencia_nome?: string | null
    evidencia_resumo: string
    cotacoes: number
  }>
  propostas: Array<{
    grupo_id: string
    fornecedor: string
    cnpj: string | null
    data_emissao: string | null
    validade_ate: string | null
    comprovante: boolean
    itens: Array<{ item_numero: number; valor_unitario: number; valor_total: number }>
    total: number
    alertas: Array<{ codigo: string; mensagem: string }>
    valida: boolean
  }>
  itens: Array<{ item_numero: number; descricao: string; quantidade: number; unidade: string; codigo: string | null; cotacoes: number }>
  resumo: {
    metodo: Metodo | null
    totais: Record<Metodo, number>
    total_adotado: number | null
    tres_precos: { atende: boolean; motivo: string }
    itens: Array<{ item_numero: number; estatistica: { quantidade: number; menor: number | null; media: number | null; mediana: number | null }; valor_unitario_adotado: number | null }>
  }
  metodo: Metodo | null
  justificativa_metodo: string
  justificativa_fornecedores: string
  justificativa_menos_de_tres: string
  solicitacao_enviada_em: string | null
  publicacao_prevista: string | null
  pendencias: { bloqueios: string[]; avisos: string[] }
  alertas: Array<{ tipo: string; titulo: string; mensagem: string }>
  itens_licitacao: Array<{ id: string; numero_item: number; descricao: string; quantidade: number; unidade: string; valor_unitario: number | null; valor_total: number | null }>
}

const COR_SIT: Record<string, string> = {
  ATENDIDO: "bg-blue-50 text-blue-900 border-blue-200",
  SEM_RETORNO: "bg-slate-50 text-slate-700 border-slate-200",
  PENDENTE: "bg-orange-50 text-orange-900 border-orange-200",
}
const ROTULO_SIT: Record<string, string> = { ATENDIDO: "Atendido", SEM_RETORNO: "Sem retorno", PENDENTE: "Pendente" }
const ROTULO_METODO: Record<Metodo, string> = { MENOR: "Menor preço", MEDIANA: "Mediana", MEDIA: "Média" }

export default function PesquisaPage() {
  const { id } = useParams() as { id: string }
  const [d, setD] = useState<PesquisaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizacao, setAtualizacao] = useState(0)
  const [detalheChave, setDetalheChave] = useState(0)
  const [modo, setModo] = useState<"aqui" | "fora" | null>(null)
  const [verDetalhe, setVerDetalhe] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [consultando, setConsultando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/pesquisa`)
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = (await r.json()) as PesquisaTela
      setD(j)
      setModo((m) => m ?? (j.peca?.anexada ? "fora" : "aqui"))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const aposGravar = (j?: PesquisaTela) => {
    if (j) setD(j)
    else carregar()
    setAtualizacao((n) => n + 1)
    setDetalheChave((n) => n + 1)
  }

  const chamar = async (metodo: string, caminho: string, corpo?: unknown): Promise<PesquisaTela | null> => {
    const r = await authFetch(`${API_URL}/api/fase-interna/${id}/pesquisa${caminho}`, {
      method: metodo,
      headers: corpo instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: corpo instanceof FormData ? corpo : corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
    if (!r.ok) throw new Error(await erroDaApi(r))
    return r.json()
  }

  const emitir = async () => {
    setEmitindo(true)
    try {
      const j = await chamar("POST", "/emitir", {})
      toast.success("Mapa e certidão emitidos. O valor de referência passou para os itens.")
      aposGravar(j ?? undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEmitindo(false)
    }
  }

  const consultarPncp = async () => {
    setConsultando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/precos/agente/executar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontes: ["PNCP", "PAINEL_DE_PRECOS"] }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success("Consulta ao PNCP e ao Painel de Preços concluída — veja os candidatos no detalhamento e registre o resultado nos parâmetros I e II.")
      setVerDetalhe(true)
      aposGravar()
    } catch (e) {
      toast.error(`Consulta não concluída: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConsultando(false)
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando a pesquisa" />
      </div>
    )
  }
  const bloqueada = !d.licitacao.fase_interna
  const dispensa = d.licitacao.modalidade === "DISPENSA_ELETRONICA"

  return (
    <EtapaShell
      licitacaoId={id}
      tela="pesquisa"
      titulo="Pesquisa de preços"
      subtitulo="Art. 23 da Lei 14.133/2021 · IN SEGES/ME 65/2021 · o sistema registra cada fonte consultada, com data e evidência, mesmo quando não há retorno"
      atualizacao={atualizacao}
      acoes={
        modo === "aqui" && (
          <>
            <Button variant="outline" onClick={consultarPncp} disabled={consultando || bloqueada} title="Roda os agentes de pesquisa (PNCP e Painel de Preços)">
              {consultando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} Consultar PNCP de novo
            </Button>
            <Button onClick={emitir} disabled={emitindo || bloqueada || d.pendencias.bloqueios.length > 0} title={d.pendencias.bloqueios.join(" ") || "Gera o mapa e a certidão"}>
              {emitindo ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} Emitir mapa e certidão
            </Button>
          </>
        )
      }
    >
      <div className="inline-flex rounded-md border bg-white p-0.5" role="tablist" aria-label="Como a pesquisa foi feita">
        {(["aqui", "fora"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            type="button"
            onClick={() => setModo(m)}
            className={`px-3 py-1.5 text-sm rounded ${modo === m ? "bg-blue-800 text-white" : "text-gray-700 hover:bg-slate-50"}`}
          >
            {m === "aqui" ? "Pesquisa feita aqui" : "Pesquisa feita fora (anexar o mapa)"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          {modo === "fora" ? (
            <PesquisaFeitaFora d={d} licitacaoId={id} bloqueada={bloqueada} atualizacao={atualizacao} onGravado={aposGravar} chamar={chamar} />
          ) : (
            <>
              <Parametros d={d} bloqueada={bloqueada} chamar={chamar} onGravado={aposGravar} licitacaoId={id} />
              <Propostas d={d} bloqueada={bloqueada} chamar={chamar} onGravado={aposGravar} licitacaoId={id} />
              <MetodoCalculo d={d} bloqueada={bloqueada} chamar={chamar} onGravado={aposGravar} />
              <section className="rounded-lg border bg-white p-4 space-y-2" aria-label="Mapa e certidão">
                <h2 className="text-sm font-semibold text-gray-900">Mapa e certidão</h2>
                {d.pendencias.bloqueios.length > 0 ? (
                  <ul className="text-sm list-disc ml-5 text-orange-900">
                    {d.pendencias.bloqueios.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-green-800">Tudo pronto para emitir.</p>
                )}
                <div className="flex gap-2 flex-wrap">
                  {d.mapa?.tem_arquivo && d.peca?.documento_id && !d.peca.anexada && (
                    <Button size="sm" variant="outline" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${d.peca!.documento_id}/arquivo`)}>
                      <FileText className="w-3.5 h-3.5 mr-1" /> Ver mapa
                    </Button>
                  )}
                  {d.certidao && (
                    <Button size="sm" variant="outline" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/${id}/pesquisa/arquivos/certidao/pp`)}>
                      <FileText className="w-3.5 h-3.5 mr-1" /> Ver certidão ({fmtDia(d.certidao.gerada_em)})
                    </Button>
                  )}
                </div>
              </section>
              <section className="rounded-lg border bg-white" aria-label="Pesquisa detalhada por item">
                <button type="button" className="w-full flex items-center justify-between p-4 text-left" onClick={() => setVerDetalhe((v) => !v)} aria-expanded={verDetalhe}>
                  <span>
                    <span className="text-sm font-semibold text-gray-900">Pesquisa detalhada por item</span>
                    <span className="block text-xs text-gray-600">Agentes de pesquisa (PNCP, Painel, Fonte de Preços), CSV, cotações por fonte, estatística e outliers</span>
                  </span>
                  {verDetalhe ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {verDetalhe && (
                  <div className="border-t px-2 sm:px-4">
                    <PesquisaPrecosDetalhe key={detalheChave} licitacaoId={id} embutido onAtualizado={() => { carregar(); setAtualizacao((n) => n + 1) }} />
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="space-y-4" aria-label="Limite e avisos">
          {dispensa && (
            <section className="rounded-lg border bg-white p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Limite e fracionamento (art. 75, §1º)</h2>
              <p className="text-xs text-gray-600">Soma das dispensas do exercício no mesmo ramo (classe CATMAT/CATSER + unidade gestora).</p>
              <ConsumoLimiteDispensa licitacaoId={id} atualizacao={atualizacao} />
            </section>
          )}
          <section className="rounded-lg border bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Avisos desta etapa</h2>
            {d.alertas.length ? (
              <ul className="space-y-2 text-sm">
                {d.alertas.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                    <span>
                      <b>{a.titulo}.</b> {a.mensagem}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-700">Nenhum aviso.</p>
            )}
          </section>
          <CaminhosDaPeca licitacaoId={id} tipo="PP" titulo="Pesquisa de preços" fazerAqui="emitir o mapa e a certidão" atualizacao={atualizacao} onAtualizado={() => aposGravar()} permitirAssinatura compacto />
        </aside>
      </div>
    </EtapaShell>
  )
}

type Chamar = (metodo: string, caminho: string, corpo?: unknown) => Promise<PesquisaTela | null>

function Parametros({ d, bloqueada, chamar, onGravado, licitacaoId }: { d: PesquisaTela; bloqueada: boolean; chamar: Chamar; onGravado: (j?: PesquisaTela) => void; licitacaoId: string }) {
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<{ situacao: string; data_consulta: string; resultado: string }>({ situacao: "SEM_RETORNO", data_consulta: hojeBrasilia(), resultado: "" })
  const [enviando, setEnviando] = useState(false)

  const abrir = (p: PesquisaTela["parametros"][number]) => {
    setEditando(p.inciso)
    setForm({
      situacao: p.situacao === "NAO_CONSULTADO" ? (p.cotacoes ? "CONSULTADO" : "SEM_RETORNO") : p.situacao,
      data_consulta: p.data_consulta || hojeBrasilia(),
      resultado: p.resultado || "",
    })
  }
  const salvar = async (inciso: string) => {
    setEnviando(true)
    try {
      onGravado((await chamar("PUT", `/parametros/${inciso}`, form)) ?? undefined)
      setEditando(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }
  const evidencia = async (inciso: string, arquivo: File | undefined) => {
    if (!arquivo) return
    const fd = new FormData()
    fd.append("arquivo", arquivo)
    try {
      onGravado((await chamar("POST", `/parametros/${inciso}/evidencia`, fd)) ?? undefined)
      toast.success("Evidência anexada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Parâmetros do art. 23, §1º">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Parâmetros (art. 23, §1º)</h2>
        <p className="text-xs text-gray-600">Registre cada fonte consultada, com a data e a evidência — inclusive quando não houve retorno.</p>
      </div>
      <ul className="divide-y">
        {d.parametros.map((p) => (
          <li key={p.inciso} className="py-2 space-y-2">
            <div className="flex items-start gap-3 flex-wrap">
              <span className="font-mono text-xs w-8 shrink-0 pt-0.5">{p.inciso}</span>
              <div className="flex-1 min-w-[12rem]">
                <p className="text-sm font-medium text-gray-900">{p.titulo}</p>
                <p className="text-xs text-gray-600">
                  {p.evidencia_resumo}
                  {p.evidencia_nome ? (
                    <>
                      {" · "}
                      <button type="button" className="text-blue-800 hover:underline" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/${licitacaoId}/pesquisa/arquivos/evidencia/${p.inciso}`)}>
                        evidência
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
              <span className={`text-[11px] border rounded px-1.5 py-0.5 ${COR_SIT[p.situacao_tela]}`}>{ROTULO_SIT[p.situacao_tela]}</span>
              {!bloqueada && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => (editando === p.inciso ? setEditando(null) : abrir(p))}>
                    Registrar consulta
                  </Button>
                  {p.situacao !== "NAO_CONSULTADO" && (
                    <label className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md hover:bg-slate-100 cursor-pointer">
                      <Upload className="w-3 h-3" aria-hidden="true" /> Evidência
                      <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => evidencia(p.inciso, e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              )}
            </div>
            {editando === p.inciso && (
              <div className="ml-11 grid gap-2 sm:grid-cols-[180px_150px_minmax(0,1fr)_auto] items-end bg-slate-50 rounded p-2">
                <div className="space-y-1">
                  <Label htmlFor={`sit-${p.inciso}`} className="text-xs">Situação</Label>
                  <select id={`sit-${p.inciso}`} className="w-full h-8 rounded-md border px-2 text-sm bg-white" value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value })}>
                    <option value="CONSULTADO">Consultado, com preços</option>
                    <option value="SEM_RETORNO">Consultado, sem retorno</option>
                    <option value="NAO_CONSULTADO">Não consultado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`data-${p.inciso}`} className="text-xs">Consultado em</Label>
                  <Input id={`data-${p.inciso}`} type="date" className="h-8" max={hojeBrasilia()} disabled={form.situacao === "NAO_CONSULTADO"} value={form.data_consulta} onChange={(e) => setForm({ ...form, data_consulta: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`res-${p.inciso}`} className="text-xs">Resultado</Label>
                  <Input id={`res-${p.inciso}`} className="h-8" placeholder="Ex.: 0 resultados equivalentes" value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value })} />
                </div>
                <Button size="sm" className="h-8" disabled={enviando} onClick={() => salvar(p.inciso)}>
                  Salvar
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Propostas({ d, bloqueada, chamar, onGravado, licitacaoId }: { d: PesquisaTela; bloqueada: boolean; chamar: Chamar; onGravado: (j?: PesquisaTela) => void; licitacaoId: string }) {
  const [nova, setNova] = useState(false)
  const [f, setF] = useState<{ fornecedor: string; cnpj: string; data_emissao: string; validade_ate: string; valores: Record<number, string> }>({
    fornecedor: "",
    cnpj: "",
    data_emissao: hojeBrasilia(),
    validade_ate: "",
    valores: {},
  })
  const [enviando, setEnviando] = useState(false)
  const [solicitacao, setSolicitacao] = useState(d.solicitacao_enviada_em || "")

  const salvar = async () => {
    setEnviando(true)
    try {
      const itens = Object.entries(f.valores)
        .map(([n, v]) => ({ item_numero: Number(n), valor_unitario: Number(String(v).replace(/\./g, "").replace(",", ".")) }))
        .filter((x) => x.valor_unitario > 0)
      onGravado((await chamar("POST", "/propostas", { fornecedor: f.fornecedor, cnpj: f.cnpj, data_emissao: f.data_emissao, validade_ate: f.validade_ate || undefined, itens })) ?? undefined)
      setNova(false)
      setF({ fornecedor: "", cnpj: "", data_emissao: hojeBrasilia(), validade_ate: "", valores: {} })
      toast.success("Cotação registrada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }
  const remover = async (grupo: string) => {
    try {
      onGravado((await chamar("DELETE", `/propostas/${encodeURIComponent(grupo)}`)) ?? undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const comprovante = async (grupo: string, arquivo?: File) => {
    if (!arquivo) return
    const fd = new FormData()
    fd.append("arquivo", arquivo)
    try {
      onGravado((await chamar("POST", `/propostas/${encodeURIComponent(grupo)}/comprovante`, fd)) ?? undefined)
      toast.success("Comprovante anexado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const situacao = (p: PesquisaTela["propostas"][number]) => {
    if (p.alertas.some((a) => a.codigo === "VENCIDA")) return { t: "Vencida", c: "bg-red-50 text-red-900 border-red-200" }
    if (p.alertas.some((a) => a.codigo === "EMITIDA_HA_MAIS_DE_6_MESES")) return { t: "Mais de 6 meses", c: "bg-red-50 text-red-900 border-red-200" }
    if (p.alertas.some((a) => a.codigo === "VENCE_ANTES_DA_PUBLICACAO")) return { t: "Vence antes", c: "bg-orange-50 text-orange-900 border-orange-200" }
    return { t: "Válida", c: "bg-blue-50 text-blue-900 border-blue-200" }
  }

  return (
    <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Cotações diretas">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Cotações diretas (inciso IV)</h2>
          <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
            <Label htmlFor="solic" className="text-xs">Solicitação enviada em</Label>
            <Input
              id="solic"
              type="date"
              className="h-7 w-40"
              max={hojeBrasilia()}
              disabled={bloqueada}
              value={solicitacao}
              onChange={(e) => setSolicitacao(e.target.value)}
              onBlur={async () => {
                if (solicitacao === (d.solicitacao_enviada_em || "")) return
                try {
                  onGravado((await chamar("PUT", "/metodo", { solicitacao_enviada_em: solicitacao })) ?? undefined)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e))
                }
              }}
            />
          </div>
        </div>
        {!bloqueada && (
          <Button size="sm" variant="outline" onClick={() => setNova((v) => !v)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Nova cotação
          </Button>
        )}
      </div>

      {nova && (
        <div className="rounded-md border bg-slate-50 p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="q-forn" className="text-xs">Fornecedor</Label>
              <Input id="q-forn" className="h-8" value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-cnpj" className="text-xs">CNPJ</Label>
              <Input id="q-cnpj" className="h-8" inputMode="numeric" placeholder="00.000.000/0000-00" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-emis" className="text-xs">Data de emissão (a da proposta)</Label>
              <Input id="q-emis" type="date" className="h-8" max={hojeBrasilia()} value={f.data_emissao} onChange={(e) => setF({ ...f, data_emissao: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-val" className="text-xs">Validade até</Label>
              <Input id="q-val" type="date" className="h-8" value={f.validade_ate} onChange={(e) => setF({ ...f, validade_ate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Valor unitário por item</p>
            {d.itens.map((i) => (
              <div key={i.item_numero} className="flex items-center gap-2">
                <span className="text-xs flex-1 min-w-0 truncate">
                  {String(i.item_numero).padStart(2, "0")} — {i.descricao} ({i.quantidade.toLocaleString("pt-BR")} {i.unidade})
                </span>
                <Input
                  aria-label={`Valor unitário do item ${i.item_numero}`}
                  className="h-8 w-36 text-right"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={f.valores[i.item_numero] ?? ""}
                  onChange={(e) => setF({ ...f, valores: { ...f.valores, [i.item_numero]: e.target.value } })}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNova(false)}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={enviando}>
              {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Registrar cotação
            </Button>
          </div>
        </div>
      )}

      {d.propostas.length ? (
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Fornecedor</th>
                <th scope="col" className="text-right px-3 py-2">Total</th>
                <th scope="col" className="text-left px-3 py-2">Emissão</th>
                <th scope="col" className="text-left px-3 py-2">Validade</th>
                <th scope="col" className="text-left px-3 py-2">Situação</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {d.propostas.map((p) => {
                const s = situacao(p)
                return (
                  <tr key={p.grupo_id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{p.fornecedor}</p>
                      <p className="text-xs text-gray-600">{p.cnpj ?? "—"}</p>
                      {p.alertas.map((a) => (
                        <p key={a.codigo} className="text-xs text-orange-900">{a.mensagem}</p>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{fmtMoeda(p.total)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDia(p.data_emissao)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.validade_ate ? fmtDia(p.validade_ate) : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] border rounded px-1.5 py-0.5 ${s.c}`}>{s.t}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {p.comprovante && !p.grupo_id.startsWith("cnpj:") ? (
                        <button type="button" className="text-xs text-blue-800 hover:underline mr-2" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/${licitacaoId}/pesquisa/arquivos/comprovante/${p.grupo_id}`)}>
                          comprovante
                        </button>
                      ) : (
                        !bloqueada &&
                        !p.grupo_id.startsWith("cnpj:") && (
                          <label className="text-xs text-blue-800 hover:underline cursor-pointer mr-2">
                            anexar comprovante
                            <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => comprovante(p.grupo_id, e.target.files?.[0])} />
                          </label>
                        )
                      )}
                      {!bloqueada && (
                        <button type="button" aria-label={`Remover a cotação de ${p.fornecedor}`} className="text-gray-500 hover:text-red-700" onClick={() => remover(p.grupo_id)}>
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Nenhuma cotação direta registrada.</p>
      )}
    </section>
  )
}

function MetodoCalculo({ d, bloqueada, chamar, onGravado }: { d: PesquisaTela; bloqueada: boolean; chamar: Chamar; onGravado: (j?: PesquisaTela) => void }) {
  const [justMetodo, setJustMetodo] = useState(d.justificativa_metodo)
  const [justForn, setJustForn] = useState(d.justificativa_fornecedores)
  const [justTres, setJustTres] = useState(d.justificativa_menos_de_tres)
  const [publicacao, setPublicacao] = useState(d.publicacao_prevista || "")
  const salvar = async (corpo: Record<string, unknown>) => {
    try {
      onGravado((await chamar("PUT", "/metodo", corpo)) ?? undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const cards: Metodo[] = ["MENOR", "MEDIANA", "MEDIA"]
  return (
    <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Método e justificativas">
      <h2 className="text-sm font-semibold text-gray-900">Método de cálculo</h2>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Método adotado">
        {cards.map((m) => {
          const ativo = d.metodo === m
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={ativo}
              disabled={bloqueada}
              onClick={() => salvar({ metodo: m })}
              className={`rounded-md border p-3 text-left ${ativo ? "border-blue-800 bg-blue-50" : "bg-white hover:bg-slate-50"}`}
            >
              <span className="block text-xs text-gray-600">{ROTULO_METODO[m]}{ativo ? " · adotado" : ""}</span>
              <span className="block text-lg font-semibold text-gray-900">{fmtMoeda(d.resumo.totais[m])}</span>
            </button>
          )
        })}
      </div>
      <p className={`text-xs ${d.resumo.tres_precos.atende ? "text-gray-600" : "text-orange-900"}`}>{d.resumo.tres_precos.motivo}</p>
      <div className="space-y-1">
        <Label htmlFor="just-metodo">Justificativa do método adotado (obrigatória)</Label>
        <Textarea id="just-metodo" rows={2} disabled={bloqueada} value={justMetodo} onChange={(e) => setJustMetodo(e.target.value)} onBlur={() => justMetodo !== d.justificativa_metodo && salvar({ justificativa_metodo: justMetodo })} placeholder="Fundamento para usar o menor valor, a média ou a mediana (ex.: regulamento do órgão)." />
      </div>
      {d.propostas.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="just-forn">Justificativa da escolha dos fornecedores (art. 23, §1º, IV)</Label>
          <Textarea id="just-forn" rows={2} disabled={bloqueada} value={justForn} onChange={(e) => setJustForn(e.target.value)} onBlur={() => justForn !== d.justificativa_fornecedores && salvar({ justificativa_fornecedores: justForn })} placeholder="Por que estas empresas foram consultadas?" />
        </div>
      )}
      {!d.resumo.tres_precos.atende && (
        <div className="space-y-1">
          <Label htmlFor="just-tres">Justificativa por ter menos de 3 preços válidos</Label>
          <Textarea id="just-tres" rows={2} disabled={bloqueada} value={justTres} onChange={(e) => setJustTres(e.target.value)} onBlur={() => justTres !== d.justificativa_menos_de_tres && salvar({ justificativa_menos_de_tres: justTres })} />
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Label htmlFor="pub-prev" className="text-sm">Publicação prevista</Label>
        <Input id="pub-prev" type="date" className="h-8 w-44" disabled={bloqueada} value={publicacao} onChange={(e) => setPublicacao(e.target.value)} onBlur={() => publicacao !== (d.publicacao_prevista || "") && salvar({ publicacao_prevista: publicacao })} />
        <span className="text-xs text-gray-600">base do alerta de validade das cotações</span>
      </div>
      {d.licitacao.sigiloso && <p className="text-xs text-amber-900">Orçamento sigiloso (art. 24): o valor não vai para o aviso; só é divulgado após o julgamento.</p>}
    </section>
  )
}

function PesquisaFeitaFora({
  d,
  licitacaoId,
  bloqueada,
  atualizacao,
  onGravado,
  chamar,
}: {
  d: PesquisaTela
  licitacaoId: string
  bloqueada: boolean
  atualizacao: number
  onGravado: (j?: PesquisaTela) => void
  chamar: Chamar
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(d.itens_licitacao.map((i) => [i.id, i.valor_unitario != null ? String(i.valor_unitario).replace(".", ",") : ""])),
  )
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    try {
      const itens = Object.entries(valores)
        .filter(([, v]) => String(v).trim())
        .map(([item_id, v]) => ({ item_id, valor_unitario: Number(String(v).replace(/\./g, "").replace(",", ".")) }))
      onGravado((await chamar("PUT", "/valores-itens", { itens })) ?? undefined)
      toast.success("Valores unitários gravados nos itens")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }
  const total = d.itens_licitacao.reduce((s, i) => s + i.quantidade * (Number(String(valores[i.id] ?? "").replace(/\./g, "").replace(",", ".")) || 0), 0)
  return (
    <>
      <CaminhosDaPeca licitacaoId={licitacaoId} tipo="PP" titulo="Mapa da pesquisa de preços (feito fora)" fazerAqui="a pesquisa feita aqui (outra aba)" atualizacao={atualizacao} onAtualizado={() => onGravado()} permitirAssinatura={false} />
      <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Valor unitário dos itens">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Valor unitário de cada item</h2>
          <p className="text-xs text-gray-600">Com a pesquisa feita fora, anexe o mapa acima e digite aqui o valor unitário de cada item — o PNCP exige o valor por item.</p>
        </div>
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Item</th>
                <th scope="col" className="text-left px-3 py-2">Descrição</th>
                <th scope="col" className="text-right px-3 py-2">Qtde</th>
                <th scope="col" className="text-right px-3 py-2">Valor unitário</th>
              </tr>
            </thead>
            <tbody>
              {d.itens_licitacao.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{String(i.numero_item).padStart(2, "0")}</td>
                  <td className="px-3 py-2">{i.descricao}</td>
                  <td className="px-3 py-2 text-right">{i.quantidade.toLocaleString("pt-BR")} {i.unidade}</td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      aria-label={`Valor unitário do item ${i.numero_item}`}
                      className="h-8 w-36 ml-auto text-right"
                      inputMode="decimal"
                      disabled={bloqueada}
                      value={valores[i.id] ?? ""}
                      onChange={(e) => setValores({ ...valores, [i.id]: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-gray-50 font-medium">
                <td className="px-3 py-2" colSpan={3}>Total estimado</td>
                <td className="px-3 py-2 text-right">{fmtMoeda(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button onClick={salvar} disabled={salvando || bloqueada}>
            {salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Gravar valores nos itens
          </Button>
        </div>
      </section>
    </>
  )
}
