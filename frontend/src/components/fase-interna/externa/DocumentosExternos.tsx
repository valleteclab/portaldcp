"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, Circle, Copy, FileText, Loader2, RotateCcw, Trash2, Upload } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { sugerirPecaDoArquivo } from "@/lib/fase-interna/criacao"
import { CamposMetadadosPeca, erroDaData, metadadosVazios, type MetadadosPeca } from "@/components/fase-interna/etapas/CamposMetadadosPeca"

// ─── Estado ──────────────────────────────────────────────────────────
export interface ArquivoExterno {
  id: string
  file: File
  /** Peça escolhida (DFD, TR, PP...) — "" = ainda não classificado. */
  tipo: string
  /** Sugestão automática (Entrega 7 — IA lendo o PDF); hoje sempre null. */
  sugerido: string | null
  meta: MetadadosPeca
}

export interface EstadoDocumentosExternos {
  arquivos: ArquivoExterno[]
  /** Peça "se for o caso" que não se aplica → justificativa. */
  naoSeAplica: Record<string, string>
  /** Juntar a portaria de designação vigente do órgão (peça DP), sem arquivo. */
  usarPortaria: boolean
}

export const estadoDocumentosVazio = (): EstadoDocumentosExternos => ({ arquivos: [], naoSeAplica: {}, usarPortaria: false })

interface LinhaChecklist {
  tipo: string
  titulo: string
  obrigatorio: boolean
  fundamento: string
  pode_nao_se_aplicar: boolean
  status: "OK" | "NAO_SE_APLICA" | "PENDENTE"
  origem: "ARQUIVO" | "PORTARIA_ORGAO" | "JA_NO_PROCESSO" | "NAO_SE_APLICA" | null
}

interface Quadro {
  contratacao_direta: boolean
  opcoes: Array<{ tipo: string; rotulo: string }>
  checklist: {
    linhas: LinhaChecklist[]
    obrigatorias_pendentes: string[]
    fora_do_checklist: string[]
    antes_da_autorizacao: string[]
    completo: boolean
  }
  portaria_do_orgao: { numero: string; exercicio: number } | null
}

export interface ErroExterno {
  passo: "DADOS" | "ITENS" | "DOCUMENTOS"
  mensagem: string
  indice?: number
}

export interface PendenciaJuntada {
  tipo: string
  titulo: string
  arquivo: string | null
  indice: number | null
  erro: string
}

export interface ResultadoJuntada {
  licitacao_id: string
  numero_processo: string
  modo: "EXTERNA" | "MISTA"
  juntadas: Array<{ tipo: string; titulo: string; arquivo: string | null }>
  nao_se_aplica: string[]
  pendencias: PendenciaJuntada[]
  tarefas_concluidas: number
  destino: string
  conformidade: string
}

const ehPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
const tamanho = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
let contador = 0

/**
 * Classificação para o backend (campo `classificacao`) + os arquivos na MESMA
 * ordem (o índice do arquivo é a ligação arquivo → peça).
 */
export function montarEnvioDocumentos(e: EstadoDocumentosExternos, so?: (a: ArquivoExterno) => boolean) {
  const arquivos = e.arquivos.filter((a) => (so ? so(a) : true))
  return {
    arquivos: arquivos.map((a) => a.file),
    classificacao: {
      pecas: arquivos.map((a, i) => ({
        arquivo: i,
        tipo: a.tipo,
        numero_peca: a.meta.numero.trim(),
        data_documento: a.meta.data,
        signatarios: a.meta.signatarios.filter((s) => s.nome.trim()),
        observacao: a.meta.observacao.trim(),
      })),
      nao_se_aplica: Object.entries(e.naoSeAplica).map(([tipo, justificativa]) => ({ tipo, justificativa: justificativa.trim() })),
      usar_portaria_orgao: e.usarPortaria,
    },
  }
}

/** Conferência na tela (o backend confere de novo, antes de gravar qualquer coisa). */
export function errosLocaisDocumentos(e: EstadoDocumentosExternos, opcoes?: Quadro["opcoes"]): string[] {
  const erros: string[] = []
  const rotulo = (t: string) => opcoes?.find((o) => o.tipo === t)?.rotulo ?? t
  const vistos = new Map<string, string>()
  for (const a of e.arquivos) {
    if (!a.tipo) {
      erros.push(`Escolha qual peça é o arquivo "${a.file.name}".`)
      continue
    }
    const outro = vistos.get(a.tipo)
    if (outro) erros.push(`Dois arquivos para a mesma peça (${rotulo(a.tipo)}): "${outro}" e "${a.file.name}" — junte num PDF só ou escolha outra peça.`)
    vistos.set(a.tipo, a.file.name)
    const d = erroDaData(a.meta.data)
    if (d) erros.push(`${rotulo(a.tipo)} ("${a.file.name}"): ${d}`)
  }
  for (const [tipo, j] of Object.entries(e.naoSeAplica)) {
    if (!j.trim()) erros.push(`Justifique por que "${rotulo(tipo)}" não se aplica (a justificativa fica nos autos).`)
  }
  return erros
}

/**
 * PASSO "DOCUMENTOS" DA FASE INTERNA FEITA FORA (e "Juntar documentos feitos
 * fora" no processo): vários PDFs de uma vez (arrastar e soltar); para cada
 * arquivo, QUAL PEÇA É (DFD, ETP, riscos, TR, mapa de pesquisa, informação
 * orçamentária, despacho, portaria, relatório do agente, minutas, parecer,
 * controle interno, outro) com número, data do documento e signatários — os
 * mesmos campos do "Anexar PDF" da peça. Ao lado, o checklist do art. 72 (ou
 * do art. 18) atualizado conforme os arquivos são classificados — calculado
 * pelo backend (mesma regra do processo); "não se aplica" com justificativa
 * onde a lei permite; "usar a portaria do órgão".
 */
export function DocumentosExternos({
  modalidade,
  licitacaoId,
  valor,
  onChange,
  errosServidor = [],
  onQuadro,
}: {
  /** Processo ainda não criado: a modalidade escolhida no passo "Dados". */
  modalidade?: string
  /** Juntada num processo existente (considera o que ele já tem). */
  licitacaoId?: string
  valor: EstadoDocumentosExternos
  onChange: (v: EstadoDocumentosExternos) => void
  errosServidor?: ErroExterno[]
  onQuadro?: (q: Quadro | null) => void
}) {
  const [quadro, setQuadro] = useState<Quadro | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const valorRef = useRef(valor)
  valorRef.current = valor

  const classificadas = valor.arquivos.map((a) => a.tipo).filter(Boolean)
  const chave = JSON.stringify([modalidade, licitacaoId, classificadas, Object.keys(valor.naoSeAplica).sort(), valor.usarPortaria])

  // Checklist incremental (backend — mesma regra do processo), a cada mudança na classificação
  useEffect(() => {
    if (!modalidade && !licitacaoId) return
    const t = window.setTimeout(async () => {
      setCarregando(true)
      try {
        const url = licitacaoId ? `${API_URL}/api/fase-interna/${licitacaoId}/externa/checklist` : `${API_URL}/api/fase-interna/externa/checklist`
        const r = await authFetch(url, {
          method: "POST",
          body: JSON.stringify({
            modalidade,
            classificadas,
            nao_se_aplica: Object.keys(valorRef.current.naoSeAplica),
            usar_portaria_orgao: valorRef.current.usarPortaria,
          }),
        })
        if (r.ok) {
          const q = await r.json()
          setQuadro(q)
          onQuadro?.(q)
        }
      } catch {
        /* o quadro fica como estava */
      } finally {
        setCarregando(false)
      }
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const adicionar = async (lista: FileList | File[] | null) => {
    const files = Array.from(lista ?? [])
    const recusados = files.filter((f) => !ehPdf(f))
    if (recusados.length) toast.error(`Só PDF: ${recusados.map((f) => f.name).join(", ")} ${recusados.length > 1 ? "foram ignorados" : "foi ignorado"}.`)
    const novos: ArquivoExterno[] = []
    for (const f of files.filter(ehPdf)) {
      // Gancho da Entrega 7: a IA sugere a peça lendo o PDF (hoje não sugere)
      const sugerido = await sugerirPecaDoArquivo(f).catch(() => null)
      novos.push({ id: `arq-${Date.now()}-${++contador}`, file: f, tipo: sugerido ?? "", sugerido, meta: metadadosVazios() })
    }
    if (novos.length) onChange({ ...valorRef.current, arquivos: [...valorRef.current.arquivos, ...novos] })
  }

  const atualizar = (id: string, parcial: Partial<ArquivoExterno>) =>
    onChange({ ...valor, arquivos: valor.arquivos.map((a) => (a.id === id ? { ...a, ...parcial } : a)) })
  const remover = (id: string) => onChange({ ...valor, arquivos: valor.arquivos.filter((a) => a.id !== id) })
  const copiarParaOsDemais = (origem: ArquivoExterno) =>
    onChange({
      ...valor,
      arquivos: valor.arquivos.map((a) =>
        a.id === origem.id ? a : { ...a, meta: { ...a.meta, data: a.meta.data || origem.meta.data, signatarios: a.meta.signatarios.some((s) => s.nome.trim()) ? a.meta.signatarios : origem.meta.signatarios } },
      ),
    })
  const marcarNaoSeAplica = (tipo: string, marcado: boolean) => {
    const n = { ...valor.naoSeAplica }
    if (marcado) n[tipo] = n[tipo] ?? ""
    else delete n[tipo]
    onChange({ ...valor, naoSeAplica: n })
  }

  const opcoes = quadro?.opcoes ?? []
  const rotulo = (t: string) => opcoes.find((o) => o.tipo === t)?.rotulo ?? t
  const errosDoArquivo = (i: number) => errosServidor.filter((e) => e.passo === "DOCUMENTOS" && e.indice === i)
  const errosGerais = errosServidor.filter((e) => e.passo === "DOCUMENTOS" && e.indice === undefined)
  const aaClassificado = classificadas.includes("AA")

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4 min-w-0">
        <div
          role="button"
          tabIndex={0}
          aria-label="Enviar PDFs: arraste os arquivos aqui ou clique para escolher"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click() } }}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files) }}
          className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${arrastando ? "border-[#1351b4] bg-[#ecf3fc]" : "border-gray-300 hover:border-[#1351b4] hover:bg-gray-50"}`}
        >
          <Upload className="w-6 h-6 mx-auto text-[#1351b4]" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-gray-900">Arraste os PDFs aqui ou clique para escolher</p>
          <p className="text-xs text-gray-600">Vários de uma vez — DFD, estudo técnico, TR, mapa de preços, informação orçamentária, despacho, parecer... Só PDF.</p>
          <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={(e) => { adicionar(e.target.files); e.target.value = "" }} />
        </div>

        {errosGerais.length > 0 && (
          <ul className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-1" role="alert">
            {errosGerais.map((e, i) => <li key={i}>{e.mensagem}</li>)}
          </ul>
        )}

        {valor.arquivos.length === 0 && (
          <p className="text-sm text-gray-600">Nenhum PDF ainda. Para cada arquivo você vai dizer qual peça é, o número, a data do documento e quem assinou.</p>
        )}

        <ol className="space-y-3">
          {valor.arquivos.map((a, i) => {
            const usadoPorOutro = (t: string) => valor.arquivos.some((x) => x.id !== a.id && x.tipo === t)
            const erros = errosDoArquivo(i)
            return (
              <li key={a.id} className={`rounded-xl border bg-white p-4 space-y-3 ${erros.length ? "border-red-300" : "border-gray-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium text-gray-900 truncate" title={a.file.name}>{a.file.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">{tamanho(a.file.size)}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {valor.arquivos.length > 1 && a.meta.data && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => copiarParaOsDemais(a)} title="Copia a data e os signatários para os arquivos que ainda não têm">
                        <Copy className="w-3 h-3 mr-1" aria-hidden="true" /> Data e signatários para os demais
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remover ${a.file.name}`} onClick={() => remover(a.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${a.id}-tipo`}>Qual peça é este arquivo? *</Label>
                  <select
                    id={`${a.id}-tipo`}
                    value={a.tipo}
                    onChange={(e) => atualizar(a.id, { tipo: e.target.value })}
                    className="w-full h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
                  >
                    <option value="">Escolha a peça…</option>
                    {opcoes.map((o) => (
                      <option key={o.tipo} value={o.tipo} disabled={usadoPorOutro(o.tipo)}>
                        {o.rotulo}{usadoPorOutro(o.tipo) ? " (já escolhida em outro arquivo)" : ""}
                      </option>
                    ))}
                  </select>
                  {a.sugerido && <p className="text-[11px] text-gray-600">Sugestão automática: {rotulo(a.sugerido)} — confira.</p>}
                </div>
                <CamposMetadadosPeca idBase={a.id} valor={a.meta} onChange={(m) => atualizar(a.id, { meta: m })} />
                {erros.length > 0 && (
                  <ul className="text-sm text-red-700 space-y-0.5" role="alert">
                    {erros.map((e, k) => <li key={k}>{e.mensagem}</li>)}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Checklist incremental */}
      <aside className="space-y-3 lg:sticky lg:top-4 self-start" aria-label="Checklist da instrução">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {quadro?.contratacao_direta === false ? "Checklist do art. 18" : "Checklist do art. 72"}
            </h3>
            {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" aria-label="Atualizando" />}
          </div>
          {!quadro && <p className="text-xs text-gray-600">Escolha a modalidade no passo &quot;Dados&quot; para ver o checklist.</p>}
          <ul className="space-y-2">
            {quadro?.checklist.linhas.map((l) => {
              const nsaMarcado = valor.naoSeAplica[l.tipo] !== undefined
              const podeNsa = l.pode_nao_se_aplicar && l.origem !== "ARQUIVO" && l.origem !== "JA_NO_PROCESSO"
              return (
                <li key={l.tipo} className="text-xs">
                  <div className="flex items-start gap-1.5">
                    {l.status === "OK" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-700 shrink-0 mt-0.5" aria-label="Pronta" />
                    ) : l.status === "NAO_SE_APLICA" ? (
                      <span className="w-3.5 text-center text-gray-600 shrink-0" aria-label="Não se aplica">∅</span>
                    ) : (
                      <Circle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${l.obrigatorio ? "text-amber-600" : "text-gray-400"}`} aria-label="Pendente" />
                    )}
                    <span className="min-w-0">
                      <span className={l.status === "NAO_SE_APLICA" ? "line-through text-gray-600" : "font-medium text-gray-900"}>{l.titulo}</span>
                      <span className="text-gray-600"> ({l.fundamento})</span>
                      {l.obrigatorio && l.status === "PENDENTE" && <span className="text-amber-800"> · obrigatória</span>}
                      {l.origem === "JA_NO_PROCESSO" && <span className="text-gray-600"> · já no processo</span>}
                      {l.origem === "PORTARIA_ORGAO" && <span className="text-gray-600"> · portaria do órgão</span>}
                    </span>
                  </div>
                  {l.tipo === "DP" && quadro.portaria_do_orgao && l.origem !== "ARQUIVO" && l.origem !== "JA_NO_PROCESSO" && (
                    <label className="flex items-center gap-1.5 pl-5 mt-1 text-gray-800">
                      <input type="checkbox" checked={valor.usarPortaria} onChange={(e) => onChange({ ...valor, usarPortaria: e.target.checked })} />
                      Usar a portaria do órgão ({quadro.portaria_do_orgao.numero})
                    </label>
                  )}
                  {podeNsa && (
                    <div className="pl-5 mt-1 space-y-1">
                      <label className="flex items-center gap-1.5 text-gray-800">
                        <input type="checkbox" checked={nsaMarcado} onChange={(e) => marcarNaoSeAplica(l.tipo, e.target.checked)} />
                        Não se aplica
                      </label>
                      {nsaMarcado && (
                        <Textarea
                          rows={2}
                          aria-label={`Justificativa: ${l.titulo} não se aplica`}
                          placeholder="Justificativa (fica nos autos)"
                          value={valor.naoSeAplica[l.tipo]}
                          onChange={(e) => onChange({ ...valor, naoSeAplica: { ...valor.naoSeAplica, [l.tipo]: e.target.value } })}
                          className="text-xs"
                        />
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {quadro && quadro.checklist.fora_do_checklist.length > 0 && (
            <p className="text-[11px] text-gray-600">Também vão para os autos: {quadro.checklist.fora_do_checklist.map(rotulo).join(", ")}.</p>
          )}
        </div>
        {quadro && aaClassificado && quadro.checklist.antes_da_autorizacao.length > 0 && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="status">
            <AlertCircle className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />
            O despacho de autorização só entra com o que o art. 72 exige antes dele: {quadro.checklist.antes_da_autorizacao.join("; ")}. Junte o PDF ou marque &quot;não se aplica&quot;.
          </p>
        )}
        {quadro && (
          <p className={`rounded-lg border p-3 text-xs ${quadro.checklist.completo ? "border-green-200 bg-green-50 text-green-900" : "border-gray-200 bg-gray-50 text-gray-800"}`}>
            {quadro.checklist.completo
              ? "Obrigatórias completas. Depois de criar, confira a conformidade e publique."
              : `Faltam obrigatórias: ${quadro.checklist.obrigatorias_pendentes.join("; ")}. Dá para criar assim e completar depois, no processo.`}
          </p>
        )}
      </aside>
    </div>
  )
}

/**
 * RESULTADO DA JUNTADA: o que entrou e, se algo não entrou, as PENDÊNCIAS com
 * o motivo (ex.: despacho recusado pelo portão B) e "Tentar de novo" com os
 * mesmos arquivos. As pendências ficam registradas no processo (a tela do
 * processo as mostra, com "Juntar documentos feitos fora").
 */
export function ResultadoDaJuntada({
  resultado,
  onTentarDeNovo,
  tentando,
}: {
  resultado: ResultadoJuntada
  onTentarDeNovo?: () => void
  tentando?: boolean
}) {
  const pend = resultado.pendencias
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${pend.length ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50"}`}>
        <p className="text-sm font-semibold text-gray-900">
          Processo {resultado.numero_processo}: {resultado.juntadas.length} peça(s) juntada(s)
          {resultado.nao_se_aplica.length ? `, ${resultado.nao_se_aplica.length} "não se aplica"` : ""}
          {resultado.tarefas_concluidas ? ` · ${resultado.tarefas_concluidas} tarefa(s) da fase interna concluída(s)` : ""}.
        </p>
        {pend.length > 0 && (
          <p className="text-sm text-amber-900 mt-1">
            {pend.length} peça(s) NÃO entraram — o processo foi criado com o resto e as pendências ficaram registradas nele. Corrija e tente de novo (aqui ou depois, no processo).
          </p>
        )}
      </div>
      {pend.length > 0 && (
        <ul className="space-y-2" aria-label="Pendências da juntada">
          {pend.map((p, i) => (
            <li key={`${p.tipo}-${i}`} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
              <b>{p.titulo}</b>{p.arquivo ? ` — "${p.arquivo}"` : ""}
              <span className="block text-xs text-red-800 mt-0.5">{p.erro}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 justify-end">
        {pend.length > 0 && onTentarDeNovo && (
          <Button variant="outline" onClick={onTentarDeNovo} disabled={tentando}>
            {tentando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" />}
            Tentar de novo as pendências
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={resultado.conformidade}>Conferir a conformidade</Link>
        </Button>
        <Button asChild className="bg-[#1351b4] hover:bg-[#0c326f]">
          <Link href={resultado.destino}>Abrir o processo →</Link>
        </Button>
      </div>
    </div>
  )
}
