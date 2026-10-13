"use client"

/**
 * ETAPA — PESQUISA DE PREÇOS (mockup "Tela da pesquisa de preços", aprovado
 * em 13/10/2026; antes: Entrega 3A).
 *  - 4 passos no topo dizem onde a etapa está: Fontes consultadas → Cotações
 *    diretas → Valor de referência → Mapa e certidão;
 *  - o VALOR DE REFERÊNCIA POR ITEM (menor/mediana/média, adotado, total) é o
 *    centro da tela, com o método escolhido em cima e as justificativas junto;
 *  - as 5 fontes do art. 23, §1º viram cartões, com o registro no próprio
 *    cartão (consultado / sem retorno / não consultado — justificar);
 *  - cotações diretas com validade conferida contra a publicação prevista;
 *  - as pendências ficam no passo 4 (antes de emitir), não num quadro à parte;
 *  - lateral: peça, limite da dispensa, "Veio do processo" (DFD/PCA) e ferramentas
 *    (pesquisa detalhada, PNCP de novo). "Concluir etapa" vem da moldura (EtapaShell).
 * API: /api/fase-interna/:id/pesquisa (+ /parametros, /propostas, /metodo, /emitir, /valores-itens, /arquivos).
 */
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, FileText, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { PERMISSAO_LIVRE, type PermissaoTrabalho } from "@/lib/fase-interna/permissao-etapa"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { PesquisaPrecosDetalhe } from "@/components/fase-interna/PesquisaPrecosDetalhe"
import type { PrevisaoPcaTela } from "@/components/fase-interna/etapas/PrevisaoPcaCard"
import { ConsumoLimiteDispensa } from "../../ConsumoLimiteDispensa"
import { erroDaApi, fmtDia, fmtMoeda, hojeBrasilia } from "@/lib/fase-interna/telas"
import { passosDaPesquisa, type DadosDosPassos, type PassoPesquisa } from "@/lib/fase-interna/passos-pesquisa"

type Metodo = "MENOR" | "MEDIA" | "MEDIANA"

interface PesquisaTela extends DadosDosPassos {
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
  itens: Array<{ item_numero: number; descricao: string; quantidade: number; unidade: string; codigo: string | null; cotacoes: number; descartadas?: number }>
  resumo: {
    metodo: Metodo | null
    totais: Record<Metodo, number>
    total_adotado: number | null
    tres_precos: { atende: boolean; motivo: string }
    precos_validos_por_item_minimo?: number
    itens: Array<{ item_numero: number; estatistica: { quantidade: number; menor: number | null; media: number | null; mediana: number | null }; valor_unitario_adotado: number | null; valor_total_adotado?: number | null }>
  }
  metodo: Metodo | null
  justificativa_metodo: string
  justificativa_fornecedores: string
  justificativa_menos_de_tres: string
  solicitacao_enviada_em: string | null
  publicacao_prevista: string | null
  pendencias: { bloqueios: string[]; avisos: string[] }
  alertas: Array<{ tipo: string; titulo: string; mensagem: string }>
  pca?: PrevisaoPcaTela | null
  itens_licitacao: Array<{ id: string; numero_item: number; descricao: string; quantidade: number; unidade: string; valor_unitario: number | null; valor_total: number | null }>
}

const ROTULO_METODO: Record<Metodo, string> = { MENOR: "Menor preço", MEDIANA: "Mediana", MEDIA: "Média" }
const METODOS: Metodo[] = ["MENOR", "MEDIANA", "MEDIA"]

/** Cores dos cartões/selos por situação (fonte, passo, cotação). */
const TOM = {
  ok: { borda: "border-green-200", fundo: "bg-green-50/40", cor: "text-green-800", bola: "bg-green-700" },
  atual: { borda: "border-blue-300", fundo: "bg-blue-50/40", cor: "text-blue-800", bola: "bg-blue-800" },
  falta: { borda: "border-amber-300", fundo: "bg-amber-50/40", cor: "text-amber-900", bola: "bg-amber-600" },
  neutro: { borda: "border-slate-200", fundo: "bg-white", cor: "text-slate-600", bola: "bg-slate-400" },
}

const nome2 = (n: number) => String(n).padStart(2, "0")

export default function PesquisaPage() {
  const { id } = useParams() as { id: string }
  // Isolamento das peças: a permissão de quem vê nesta etapa (EtapaShell)
  const [perm, setPerm] = useState<PermissaoTrabalho>(PERMISSAO_LIVRE)
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
      toast.success("Consulta ao PNCP e ao Painel de Preços concluída — veja os candidatos na pesquisa detalhada e registre o resultado nas fontes I e II.")
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
  const bloqueada = !d.licitacao.fase_interna || !perm.pode
  const dispensa = d.licitacao.modalidade === "DISPENSA_ELETRONICA"
  const passos = passosDaPesquisa(d)

  return (
    <EtapaShell
      onPermissao={setPerm}
      licitacaoId={id}
      tela="pesquisa"
      titulo="Pesquisa de preços"
      subtitulo="Art. 23 da Lei 14.133/2021 · IN SEGES/ME 65/2021 · cada fonte consultada fica registrada com data e evidência, mesmo sem retorno"
      atualizacao={atualizacao}
      acoes={
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
              {m === "aqui" ? "Pesquisa feita aqui" : "Feita fora (anexar o mapa)"}
            </button>
          ))}
        </div>
      }
    >
      {modo === "fora" ? (
        <PesquisaFeitaFora d={d} licitacaoId={id} bloqueada={bloqueada} atualizacao={atualizacao} onGravado={aposGravar} chamar={chamar} />
      ) : (
        <>
          <Passos passos={passos} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4 min-w-0">
              <Fontes d={d} bloqueada={bloqueada} chamar={chamar} onGravado={aposGravar} licitacaoId={id} />
              <ValorReferencia d={d} bloqueada={bloqueada} chamar={chamar} onGravado={aposGravar} dispensa={dispensa} />
              <Cotacoes d={d} bloqueada={bloqueada} chamar={chamar} onGravado={aposGravar} licitacaoId={id} />

              <section className="rounded-lg border bg-white p-4 space-y-3" aria-labelledby="mapa-titulo">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 id="mapa-titulo" className="text-[15px] font-semibold text-gray-900">4. Mapa e certidão</h2>
                    <p className="text-xs text-gray-600">O mapa consolida as fontes e as cotações; a certidão atesta os parâmetros do art. 23. Juntos, são a peça &quot;Pesquisa de preços&quot; dos autos.</p>
                  </div>
                  <Button onClick={emitir} disabled={emitindo || bloqueada || d.pendencias.bloqueios.length > 0} title={d.pendencias.bloqueios.join(" ") || "Gera o mapa e a certidão"}>
                    {emitindo ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} {d.certidao ? "Emitir de novo" : "Emitir mapa e certidão"}
                  </Button>
                </div>
                {d.pendencias.bloqueios.length > 0 || d.alertas.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 space-y-1" role="status">
                    <b>Antes de emitir:</b>
                    <ul className="list-disc ml-5 space-y-0.5">
                      {d.pendencias.bloqueios.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                      {d.alertas.map((a, i) => (
                        <li key={`a${i}`}>
                          <b>{a.titulo}.</b> {a.mensagem}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : d.certidao ? (
                  <p className="text-sm text-green-800">Mapa e certidão emitidos em {fmtDia(d.certidao.gerada_em)}. A peça conta como pronta para concluir a etapa.</p>
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

              {verDetalhe && (
                <section className="rounded-lg border bg-white" aria-label="Pesquisa detalhada por item">
                  <div className="flex items-center justify-between gap-2 p-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Pesquisa detalhada por item</h2>
                      <p className="text-xs text-gray-600">Agentes de pesquisa (PNCP, Painel, Fonte de Preços), CSV, cotações por fonte, estatística e outliers</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setVerDetalhe(false)}>Fechar</Button>
                  </div>
                  <div className="border-t px-2 sm:px-4">
                    <PesquisaPrecosDetalhe key={detalheChave} licitacaoId={id} embutido onAtualizado={() => { carregar(); setAtualizacao((n) => n + 1) }} />
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-4" aria-label="Peça, limite, origem e ferramentas">
              <CaminhosDaPeca licitacaoId={id} tipo="PP" titulo="Pesquisa de preços" fazerAqui="emitir o mapa e a certidão" atualizacao={atualizacao} onAtualizado={() => aposGravar()} permitirAssinatura compacto />
              {dispensa && (
                <section className="rounded-lg border bg-white p-4 space-y-2">
                  <h2 className="text-sm font-semibold text-gray-900">Limite da dispensa (art. 75, §1º)</h2>
                  <p className="text-xs text-gray-600">Soma das dispensas do exercício no mesmo ramo (classe CATMAT/CATSER + unidade gestora).</p>
                  <ConsumoLimiteDispensa licitacaoId={id} atualizacao={atualizacao} />
                </section>
              )}
              <VeioDoProcesso d={d} licitacaoId={id} />
              <section className="rounded-lg border bg-white p-4 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Ferramentas</h2>
                <button type="button" className="block text-left text-sm text-blue-800 hover:underline" onClick={() => setVerDetalhe((v) => !v)}>
                  {verDetalhe ? "Fechar a pesquisa detalhada por item" : "Pesquisa detalhada por item (agentes, CSV, outliers)"}
                </button>
                <button type="button" className="inline-flex items-center gap-1 text-left text-sm text-blue-800 hover:underline disabled:opacity-60" onClick={consultarPncp} disabled={consultando || bloqueada} title="Roda os agentes de pesquisa (PNCP e Painel de Preços)">
                  {consultando ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                  {consultando ? "Consultando o PNCP…" : "Consultar PNCP e Painel de Preços de novo"}
                </button>
              </section>
            </aside>
          </div>
        </>
      )}
    </EtapaShell>
  )
}

type Chamar = (metodo: string, caminho: string, corpo?: unknown) => Promise<PesquisaTela | null>

/** Os 4 passos da etapa, no topo: onde está e o que falta. */
function Passos({ passos }: { passos: PassoPesquisa[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Passos da pesquisa de preços">
      {passos.map((p) => {
        const t = TOM[p.tom]
        return (
          <li key={p.n} className={`flex items-start gap-2.5 rounded-lg border bg-white px-3 py-2.5 ${t.borda}`}>
            <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${t.bola}`} aria-hidden="true">
              {p.n}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-gray-900">{p.nome}</span>
              <span className={`block text-xs ${t.cor}`}>{p.situacao}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Fontes({ d, bloqueada, chamar, onGravado, licitacaoId }: { d: PesquisaTela; bloqueada: boolean; chamar: Chamar; onGravado: (j?: PesquisaTela) => void; licitacaoId: string }) {
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<{ situacao: string; data_consulta: string; resultado: string }>({ situacao: "SEM_RETORNO", data_consulta: hojeBrasilia(), resultado: "" })
  const [enviando, setEnviando] = useState(false)
  const registradas = d.parametros.filter((p) => p.situacao_tela !== "PENDENTE").length

  const abrir = (p: PesquisaTela["parametros"][number]) => {
    setEditando(p.inciso)
    setForm({
      situacao: p.situacao === "NAO_CONSULTADO" && !p.resultado ? (p.cotacoes ? "CONSULTADO" : "SEM_RETORNO") : p.situacao,
      data_consulta: p.data_consulta || hojeBrasilia(),
      resultado: p.resultado || "",
    })
  }
  const salvar = async (inciso: string) => {
    if (form.situacao === "NAO_CONSULTADO" && form.resultado.trim().length < 10) {
      toast.error("Fonte não consultada: escreva a justificativa (vai para o mapa).")
      return
    }
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
  const tomDe = (p: PesquisaTela["parametros"][number]) => (p.situacao_tela === "ATENDIDO" ? TOM.ok : p.situacao_tela === "SEM_RETORNO" ? TOM.neutro : TOM.falta)
  const rotulo = (p: PesquisaTela["parametros"][number]) => (p.situacao_tela === "ATENDIDO" ? "Consultado" : p.situacao_tela === "SEM_RETORNO" ? (p.situacao === "NAO_CONSULTADO" ? "Não consultado" : "Sem retorno") : "Pendente")

  return (
    <section className="rounded-lg border bg-white p-4 space-y-3" aria-labelledby="fontes-titulo">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="fontes-titulo" className="text-[15px] font-semibold text-gray-900">1. Fontes consultadas (art. 23, §1º)</h2>
          <p className="text-xs text-gray-600">A ordem da lei é de preferência: I e II primeiro; III, IV e V completam. Sem retorno também é registro.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${registradas === d.parametros.length ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {registradas} de {d.parametros.length} registradas
        </span>
      </div>
      <ol className="grid gap-2.5 md:grid-cols-2">
        {d.parametros.map((p) => {
          const t = tomDe(p)
          const aberto = editando === p.inciso
          return (
            <li key={p.inciso} className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${aberto ? "border-blue-700 md:col-span-2" : `${t.borda} ${t.fundo}`}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex gap-2 items-baseline min-w-0">
                  <span className="font-mono text-xs text-gray-500 w-6 shrink-0">{p.inciso}</span>
                  <b className="text-[13px] text-gray-900">{p.titulo}</b>
                </span>
                <span className={`rounded-full border border-current bg-white px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${t.cor}`}>{rotulo(p)}</span>
              </div>
              <p className="text-xs text-gray-700 pl-8">
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
              {!bloqueada && !aberto && (
                <div className="flex flex-wrap gap-1.5 pl-8">
                  <Button size="sm" variant={p.situacao_tela === "PENDENTE" ? "default" : "outline"} className="h-8 text-xs" onClick={() => abrir(p)}>
                    {p.situacao_tela === "PENDENTE" ? "Registrar consulta" : "Editar registro"}
                  </Button>
                  {p.situacao !== "NAO_CONSULTADO" && (
                    <label className="inline-flex items-center gap-1 h-8 px-2 text-xs rounded-md border bg-white hover:bg-slate-50 cursor-pointer">
                      <Upload className="w-3 h-3" aria-hidden="true" /> Evidência
                      <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => evidencia(p.inciso, e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              )}
              {aberto && (
                <div className="space-y-2 pl-8 pt-1">
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={`Situação da fonte ${p.inciso}`}>
                    {(
                      [
                        ["SEM_RETORNO", "Consultado, sem retorno", "Nenhum preço equivalente encontrado"],
                        ["CONSULTADO", "Consultado, com preços", "Informe o resultado e anexe a evidência"],
                        ["NAO_CONSULTADO", "Não consultado — justificar", "Ex.: sem acesso à base; fonte não se aplica"],
                      ] as const
                    ).map(([v, t1, t2]) => (
                      <label key={v} className={`flex gap-2 items-start rounded-md border px-2.5 py-2 text-xs cursor-pointer ${form.situacao === v ? "border-blue-700 bg-blue-50" : "border-slate-200"}`}>
                        <input type="radio" name={`sit-${p.inciso}`} className="mt-0.5" checked={form.situacao === v} onChange={() => setForm({ ...form, situacao: v })} />
                        <span>
                          <b className="block text-gray-900">{t1}</b>
                          <span className="text-gray-600">{t2}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <div className="space-y-1">
                      <Label htmlFor={`data-${p.inciso}`} className="text-xs">Consultado em</Label>
                      <Input id={`data-${p.inciso}`} type="date" className="h-8" max={hojeBrasilia()} disabled={form.situacao === "NAO_CONSULTADO"} value={form.data_consulta} onChange={(e) => setForm({ ...form, data_consulta: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`res-${p.inciso}`} className="text-xs">{form.situacao === "NAO_CONSULTADO" ? "Justificativa (obrigatória)" : "Resultado"}</Label>
                      <Input id={`res-${p.inciso}`} className="h-8" placeholder={form.situacao === "NAO_CONSULTADO" ? "Por que esta fonte não foi consultada" : "Ex.: 6 preços em 3 contratações de 2025–2026"} value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditando(null)}>Cancelar</Button>
                    <Button size="sm" className="h-8" disabled={enviando} onClick={() => salvar(p.inciso)}>
                      {enviando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Salvar registro
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ValorReferencia({ d, bloqueada, chamar, onGravado, dispensa }: { d: PesquisaTela; bloqueada: boolean; chamar: Chamar; onGravado: (j?: PesquisaTela) => void; dispensa: boolean }) {
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
  const metodo = d.metodo
  const descartadas = d.itens.reduce((s, i) => s + (i.descartadas ?? 0), 0)
  const porNumero = new Map(d.itens.map((i) => [i.item_numero, i]))
  const colAtiva = (m: Metodo) => (metodo === m ? "bg-blue-50 font-semibold" : "")
  return (
    <section className="rounded-lg border-2 border-blue-700 bg-white p-4 space-y-3" aria-labelledby="valor-titulo">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="valor-titulo" className="text-[15px] font-semibold text-gray-900">3. Valor de referência por item</h2>
          <p className="text-xs text-gray-600">Por item: menor, mediana e média dos preços válidos (até 6 meses, sem os descartados). O método escolhido define o valor adotado.</p>
        </div>
        <div className="inline-flex rounded-md border bg-white p-0.5 gap-0.5" role="radiogroup" aria-label="Método adotado">
          {METODOS.map((m) => {
            const ativo = metodo === m
            return (
              <button key={m} type="button" role="radio" aria-checked={ativo} disabled={bloqueada} onClick={() => !ativo && salvar({ metodo: m })} className={`h-8 rounded px-3 text-xs font-medium disabled:opacity-60 ${ativo ? "bg-blue-800 text-white" : "text-gray-700 hover:bg-slate-50"}`}>
                {ROTULO_METODO[m]}
                {ativo ? " · adotado" : ""}
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
            <tr>
              <th scope="col" className="text-left px-3 py-2 font-semibold">Item</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">Qtde</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">Preços</th>
              <th scope="col" className={`text-right px-3 py-2 font-semibold ${metodo === "MENOR" ? "text-blue-800" : ""}`}>Menor</th>
              <th scope="col" className={`text-right px-3 py-2 font-semibold ${metodo === "MEDIANA" ? "text-blue-800" : ""}`}>Mediana</th>
              <th scope="col" className={`text-right px-3 py-2 font-semibold ${metodo === "MEDIA" ? "text-blue-800" : ""}`}>Média</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">Adotado</th>
              <th scope="col" className="text-right px-3 py-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {d.resumo.itens.map((r) => {
              const i = porNumero.get(r.item_numero)
              const q = i?.quantidade ?? 0
              const total = r.valor_total_adotado ?? (r.valor_unitario_adotado != null ? r.valor_unitario_adotado * q : null)
              return (
                <tr key={r.item_numero} className="border-t align-top">
                  <td className="px-3 py-2">
                    <span className="font-mono text-[11px] text-gray-500 mr-1.5">{nome2(r.item_numero)}</span>
                    {i?.descricao ?? ""}
                    {r.estatistica.quantidade < 3 && <span className="block text-[11px] text-amber-900">menos de 3 preços válidos</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {q.toLocaleString("pt-BR")} {i?.unidade ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{r.estatistica.quantidade} {r.estatistica.quantidade === 1 ? "preço" : "preços"}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${colAtiva("MENOR")}`}>{r.estatistica.menor != null ? fmtMoeda(r.estatistica.menor) : "—"}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${colAtiva("MEDIANA")}`}>{r.estatistica.mediana != null ? fmtMoeda(r.estatistica.mediana) : "—"}</td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${colAtiva("MEDIA")}`}>{r.estatistica.media != null ? fmtMoeda(r.estatistica.media) : "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-bold">{r.valor_unitario_adotado != null ? fmtMoeda(r.valor_unitario_adotado) : "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-bold">{total != null ? fmtMoeda(total) : "—"}</td>
                </tr>
              )
            })}
            {d.resumo.itens.length === 0 && (
              <tr className="border-t">
                <td colSpan={8} className="px-3 py-3 text-sm text-gray-600">A pesquisa ainda não tem itens — eles vêm dos itens do processo.</td>
              </tr>
            )}
            <tr className="border-t-2 bg-gray-50">
              <td colSpan={7} className="px-3 py-2 font-bold">
                Valor estimado da contratação{metodo ? ` (${ROTULO_METODO[metodo].toLowerCase()})` : ""}
              </td>
              <td className="px-3 py-2 text-right font-bold text-[15px] whitespace-nowrap">{d.resumo.total_adotado != null ? fmtMoeda(d.resumo.total_adotado) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
        <span className={d.resumo.tres_precos.atende ? "text-green-800 font-semibold" : "text-amber-900 font-semibold"}>{d.resumo.tres_precos.atende ? "✓ " : ""}{d.resumo.tres_precos.motivo}</span>
        {descartadas > 0 && <span>· {descartadas} {descartadas === 1 ? "preço descartado" : "preços descartados"} por fugir da faixa (veja na pesquisa detalhada)</span>}
        {!metodo && <span>· sem método: os totais dos três métodos ficam em {METODOS.map((m) => `${ROTULO_METODO[m].toLowerCase()} ${fmtMoeda(d.resumo.totais[m])}`).join(", ")}</span>}
        {dispensa && <span>· o consumo do limite da dispensa (art. 75) está na lateral</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="just-metodo">Justificativa do método adotado (obrigatória)</Label>
          <Textarea id="just-metodo" rows={2} disabled={bloqueada} value={justMetodo} onChange={(e) => setJustMetodo(e.target.value)} onBlur={() => justMetodo !== d.justificativa_metodo && salvar({ justificativa_metodo: justMetodo })} placeholder="Fundamento para usar o menor valor, a média ou a mediana (ex.: regulamento do órgão, IN 65/2021)." />
        </div>
        {d.propostas.length > 0 ? (
          <div className="space-y-1">
            <Label htmlFor="just-forn">Justificativa da escolha dos fornecedores (inc. IV)</Label>
            <Textarea id="just-forn" rows={2} disabled={bloqueada} value={justForn} onChange={(e) => setJustForn(e.target.value)} onBlur={() => justForn !== d.justificativa_fornecedores && salvar({ justificativa_fornecedores: justForn })} placeholder="Por que estas empresas foram consultadas?" />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="pub-prev">Publicação prevista</Label>
            <Input id="pub-prev" type="date" className="h-9 w-48" disabled={bloqueada} value={publicacao} onChange={(e) => setPublicacao(e.target.value)} onBlur={() => publicacao !== (d.publicacao_prevista || "") && salvar({ publicacao_prevista: publicacao })} />
            <p className="text-xs text-gray-600">Base do alerta de validade das cotações diretas.</p>
          </div>
        )}
        {!d.resumo.tres_precos.atende && (
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="just-tres">Justificativa por ter menos de 3 preços válidos</Label>
            <Textarea id="just-tres" rows={2} disabled={bloqueada} value={justTres} onChange={(e) => setJustTres(e.target.value)} onBlur={() => justTres !== d.justificativa_menos_de_tres && salvar({ justificativa_menos_de_tres: justTres })} />
          </div>
        )}
      </div>
      {d.licitacao.sigiloso && <p className="text-xs text-amber-900">Orçamento sigiloso (art. 24): o valor não vai para o aviso; só é divulgado após o julgamento.</p>}
    </section>
  )
}

function Cotacoes({ d, bloqueada, chamar, onGravado, licitacaoId }: { d: PesquisaTela; bloqueada: boolean; chamar: Chamar; onGravado: (j?: PesquisaTela) => void; licitacaoId: string }) {
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
  const [publicacao, setPublicacao] = useState(d.publicacao_prevista || "")
  const umItem = d.itens.length === 1

  const salvarData = async (corpo: Record<string, unknown>) => {
    try {
      onGravado((await chamar("PUT", "/metodo", corpo)) ?? undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const salvar = async () => {
    setEnviando(true)
    try {
      const itens = Object.entries(f.valores)
        .map(([n, v]) => ({ item_numero: Number(n), valor_unitario: Number(String(v).replace(/\./g, "").replace(",", ".")) }))
        .filter((x) => x.valor_unitario > 0)
      onGravado((await chamar("POST", "/propostas", { fornecedor: f.fornecedor, cnpj: f.cnpj, data_emissao: f.data_emissao, validade_ate: f.validade_ate || undefined, itens })) ?? undefined)
      setNova(false)
      setF({ fornecedor: "", cnpj: "", data_emissao: hojeBrasilia(), validade_ate: "", valores: {} })
      toast.success("Cotação registrada — anexe o comprovante da proposta na linha dela.")
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
    if (p.alertas.some((a) => a.codigo === "VENCIDA")) return { t: "Vencida", c: "text-red-800" }
    if (p.alertas.some((a) => a.codigo === "EMITIDA_HA_MAIS_DE_6_MESES")) return { t: "Mais de 6 meses", c: "text-red-800" }
    if (p.alertas.some((a) => a.codigo === "VENCE_ANTES_DA_PUBLICACAO")) return { t: "Vence antes da publicação", c: "text-amber-900" }
    return { t: "Válida", c: "text-green-800" }
  }
  const validas = d.propostas.filter((p) => p.valida).length
  const totalNova = d.itens.reduce((s, i) => s + i.quantidade * (Number(String(f.valores[i.item_numero] ?? "").replace(/\./g, "").replace(",", ".")) || 0), 0)

  return (
    <section className="rounded-lg border bg-white p-4 space-y-3" aria-labelledby="cot-titulo">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 id="cot-titulo" className="text-[15px] font-semibold text-gray-900">2. Cotações diretas com fornecedores (inc. IV)</h2>
          <p className="text-xs text-gray-600">
            {d.propostas.length ? `${d.propostas.length} ${d.propostas.length === 1 ? "recebida" : "recebidas"} · ${validas} ${validas === 1 ? "válida" : "válidas"}` : "Nenhuma cotação registrada"} · validade conferida contra a publicação prevista{d.publicacao_prevista ? ` (${fmtDia(d.publicacao_prevista)})` : ""}
          </p>
        </div>
        {!bloqueada && (
          <Button size="sm" variant="outline" onClick={() => setNova((v) => !v)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Nova cotação
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-700">
        <span className="inline-flex items-center gap-2">
          <Label htmlFor="solic" className="text-xs">Solicitação enviada em</Label>
          <Input id="solic" type="date" className="h-7 w-40" max={hojeBrasilia()} disabled={bloqueada} value={solicitacao} onChange={(e) => setSolicitacao(e.target.value)} onBlur={() => solicitacao !== (d.solicitacao_enviada_em || "") && salvarData({ solicitacao_enviada_em: solicitacao })} />
        </span>
        {d.propostas.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <Label htmlFor="pub-prev-cot" className="text-xs">Publicação prevista</Label>
            <Input id="pub-prev-cot" type="date" className="h-7 w-40" disabled={bloqueada} value={publicacao} onChange={(e) => setPublicacao(e.target.value)} onBlur={() => publicacao !== (d.publicacao_prevista || "") && salvarData({ publicacao_prevista: publicacao })} />
          </span>
        )}
      </div>

      {nova && (
        <div className="rounded-md border border-blue-700 bg-white p-3 space-y-2">
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
              <Label htmlFor="q-emis" className="text-xs">Emissão da proposta</Label>
              <Input id="q-emis" type="date" className="h-8" max={hojeBrasilia()} value={f.data_emissao} onChange={(e) => setF({ ...f, data_emissao: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-val" className="text-xs">Validade até</Label>
              <Input id="q-val" type="date" className="h-8" value={f.validade_ate} onChange={(e) => setF({ ...f, validade_ate: e.target.value })} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
                <tr>
                  <th scope="col" className="text-left px-3 py-1.5 font-semibold">Item</th>
                  <th scope="col" className="text-right px-3 py-1.5 font-semibold">Qtde</th>
                  <th scope="col" className="text-right px-3 py-1.5 font-semibold">Unitário</th>
                  <th scope="col" className="text-right px-3 py-1.5 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.itens.map((i) => {
                  const vu = Number(String(f.valores[i.item_numero] ?? "").replace(/\./g, "").replace(",", ".")) || 0
                  return (
                    <tr key={i.item_numero} className="border-t">
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-[11px] text-gray-500 mr-1.5">{nome2(i.item_numero)}</span>
                        {i.descricao}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{i.quantidade.toLocaleString("pt-BR")} {i.unidade}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Input aria-label={`Valor unitário do item ${i.item_numero}`} className="h-8 w-32 ml-auto text-right" inputMode="decimal" placeholder="0,00" value={f.valores[i.item_numero] ?? ""} onChange={(e) => setF({ ...f, valores: { ...f.valores, [i.item_numero]: e.target.value } })} />
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap font-semibold">{vu ? fmtMoeda(vu * i.quantidade) : "—"}</td>
                    </tr>
                  )
                })}
                <tr className="border-t bg-gray-50 font-semibold">
                  <td colSpan={3} className="px-3 py-1.5">Total da proposta</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{fmtMoeda(totalNova)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600">Depois de registrar, anexe o comprovante da proposta (PDF) na linha da cotação.</p>
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
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold">Fornecedor</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">{umItem ? "Unitário" : "Itens"}</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold">Total</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">Emissão</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">Validade</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold">Situação</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {d.propostas.map((p) => {
                const s = situacao(p)
                const semArquivo = p.grupo_id.startsWith("cnpj:")
                return (
                  <tr key={p.grupo_id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{p.fornecedor}</p>
                      <p className="text-xs text-gray-600">{p.cnpj ?? "—"}</p>
                      {p.alertas.map((a) => (
                        <p key={a.codigo} className="text-xs text-amber-900">{a.mensagem}</p>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{umItem ? (p.itens[0] ? fmtMoeda(p.itens[0].valor_unitario) : "—") : `${p.itens.length} de ${d.itens.length}`}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{fmtMoeda(p.total)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDia(p.data_emissao)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.validade_ate ? fmtDia(p.validade_ate) : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border border-current px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${s.c}`}>{s.t}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {p.comprovante && !semArquivo ? (
                        <button type="button" className="text-xs text-blue-800 hover:underline mr-2" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/${licitacaoId}/pesquisa/arquivos/comprovante/${p.grupo_id}`)}>
                          comprovante
                        </button>
                      ) : (
                        !bloqueada &&
                        !semArquivo && (
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
        <p className="text-sm text-gray-600">Nenhuma cotação direta registrada. Pelo inc. IV, a pesquisa direta pede ao menos 3 fornecedores — registre também quem não respondeu, na fonte IV.</p>
      )}
    </section>
  )
}

/** O que a pesquisa herda do processo: DFD (itens) e item do PCA, para conferir o valor de referência. */
function VeioDoProcesso({ d, licitacaoId }: { d: PesquisaTela; licitacaoId: string }) {
  const pca = d.pca ?? null
  const item = pca?.item ?? null
  const total = d.resumo.total_adotado
  const dentro = item?.valor_estimado != null && total != null ? total <= item.valor_estimado : null
  return (
    <section className="rounded-lg border bg-white p-4 space-y-1.5">
      <h2 className="text-sm font-semibold text-gray-900">Veio do processo</h2>
      <p className="text-xs text-gray-700">
        Itens e quantidades: {pca?.dfd_numero ? <b>DFD nº {pca.dfd_numero}</b> : <Link href={`/orgao/processos/${licitacaoId}/fase-interna/dfd`} className="text-blue-800 hover:underline">DFD do processo</Link>} · {d.itens.length} {d.itens.length === 1 ? "item" : "itens"}
      </p>
      {item ? (
        <p className="text-xs text-gray-700">
          {item.numero_pca || `PCA ${item.ano_exercicio}`}, item nº {item.numero_item}: {item.valor_estimado != null ? fmtMoeda(item.valor_estimado) : "sem valor"}
        </p>
      ) : (
        <p className="text-xs text-gray-700">{pca?.situacao === "FORA_DO_PCA" ? "Contratação fora do PCA (justificada no DFD)." : "Sem item do PCA vinculado no DFD."}</p>
      )}
      {dentro === true && <p className="text-xs font-semibold text-green-800">✓ Valor de referência dentro do previsto no PCA</p>}
      {dentro === false && <p className="text-xs font-semibold text-amber-900">Valor de referência acima do previsto no PCA ({fmtMoeda(item!.valor_estimado!)}) — confira a estimativa.</p>}
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
  const valorDe = (id: string) => Number(String(valores[id] ?? "").replace(/\./g, "").replace(",", ".")) || 0
  const total = d.itens_licitacao.reduce((s, i) => s + i.quantidade * valorDe(i.id), 0)
  const mapaAnexado = !!(d.peca?.anexada && d.peca.tem_arquivo)
  const valoresOk = d.itens_licitacao.length > 0 && d.itens_licitacao.every((i) => i.valor_unitario != null && i.valor_unitario > 0)
  const passos: PassoPesquisa[] = [
    { n: 1, nome: "Mapa anexado", situacao: mapaAnexado ? "Anexado" : "Anexe o mapa feito fora", tom: mapaAnexado ? "ok" : "atual" },
    { n: 2, nome: "Valor por item", situacao: valoresOk ? "Gravados nos itens" : "O PNCP exige o unitário", tom: valoresOk ? "ok" : mapaAnexado ? "atual" : "neutro" },
    { n: 3, nome: "Concluir etapa", situacao: mapaAnexado && valoresOk ? "Liberada — na barra acima" : "Libera com 1 e 2", tom: mapaAnexado && valoresOk ? "ok" : "neutro" },
  ]
  return (
    <>
      <Passos passos={passos} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4 min-w-0">
          <CaminhosDaPeca licitacaoId={licitacaoId} tipo="PP" titulo="Mapa da pesquisa de preços (feito fora)" fazerAqui="a pesquisa feita aqui (outra aba)" atualizacao={atualizacao} onAtualizado={() => onGravado()} permitirAssinatura={false} />
          <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Valor unitário dos itens">
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">2. Valor unitário de cada item (do mapa)</h2>
              <p className="text-xs text-gray-600">Com a pesquisa feita fora, anexe o mapa e digite aqui o valor unitário de cada item — o PNCP exige o valor por item.</p>
            </div>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">Item</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">Qtde</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">Unitário</th>
                    <th scope="col" className="text-right px-3 py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {d.itens_licitacao.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="px-3 py-2">
                        <span className="font-mono text-[11px] text-gray-500 mr-1.5">{nome2(i.numero_item)}</span>
                        {i.descricao}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{i.quantidade.toLocaleString("pt-BR")} {i.unidade}</td>
                      <td className="px-3 py-2 text-right">
                        <Input aria-label={`Valor unitário do item ${i.numero_item}`} className="h-8 w-32 ml-auto text-right" inputMode="decimal" disabled={bloqueada} value={valores[i.id] ?? ""} onChange={(e) => setValores({ ...valores, [i.id]: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{valorDe(i.id) ? fmtMoeda(valorDe(i.id) * i.quantidade) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-gray-50 font-bold">
                    <td className="px-3 py-2" colSpan={3}>Valor estimado</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{fmtMoeda(total)}</td>
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
        </div>
        <aside className="space-y-4" aria-label="Limite e origem">
          {d.licitacao.modalidade === "DISPENSA_ELETRONICA" && (
            <section className="rounded-lg border bg-white p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Limite da dispensa (art. 75, §1º)</h2>
              <ConsumoLimiteDispensa licitacaoId={licitacaoId} atualizacao={atualizacao} />
            </section>
          )}
          <VeioDoProcesso d={d} licitacaoId={licitacaoId} />
        </aside>
      </div>
    </>
  )
}
