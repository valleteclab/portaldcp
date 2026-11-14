"use client"

/**
 * Preços de um item da pesquisa: as cotações que já contam no cálculo e as
 * referências que a busca automática achou e ainda esperam decisão.
 * Usado na tela da pesquisa (linha do item) e na pesquisa detalhada.
 */
import React, { useState } from "react"
import { AlertTriangle, Check, ExternalLink, Loader2, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface CotacaoDoItem {
  fonte: string
  descricao_fonte: string
  url_referencia?: string
  data_pesquisa: string
  fornecedor_razao_social?: string
  valor_unitario: number
  observacao?: string
}

/** Referência que a busca achou e ainda espera a decisão de quem pesquisa. */
export interface CandidatoPendente {
  id: string
  item_numero: number
  fonte_tipo: string
  descricao_fonte: string
  url_referencia?: string
  data_pesquisa: string
  valor_unitario: number
  quantidade_base?: number
  unidade?: string
  origem?: string
  titulo?: string
  flags: string[]
  complementar: boolean
  /** ESTIMADO por outro órgão, preço de MERCADO (loja ou site) ou já PRATICADO em contratação. */
  tipo?: "ESTIMADO" | "MERCADO" | "PRATICADO"
}

const ROTULO_FONTE: Record<string, string> = {
  PNCP: "PNCP",
  PAINEL_DE_PRECOS: "Painel de Preços",
  CONTRATO_VIGENTE_SISTEMA: "Contrato do órgão",
  FORNECEDOR_DIRETO: "Fornecedor",
  MIDIA_ESPECIALIZADA: "Mídia / site",
  NFE: "Nota fiscal",
  OUTRA: "Outra",
}

/** Fontes de preço já praticado em contratação pública (passaram por disputa). */
const FONTES_DE_PRECO_PRATICADO = ["PNCP", "PAINEL_DE_PRECOS", "CONTRATO_VIGENTE_SISTEMA"]

/**
 * Cesta só com preço que já saiu de disputa: a referência fica no piso do
 * mercado e tende a afastar licitantes. Estimado aprovado à mão não conta.
 */
export function soPrecosPraticados(cotacoes: Array<{ fonte: string; observacao?: string }>): boolean {
  if (!cotacoes.length) return false
  // O banco "Fonte de Preços" também traz preço de contratação pública
  const praticado = (c: { fonte: string; observacao?: string }) => FONTES_DE_PRECO_PRATICADO.includes(c.fonte) || /Fonte de Precos/i.test(c.observacao || "")
  return cotacoes.every((c) => praticado(c) && !/valor estimado/i.test(c.observacao || ""))
}

const tipoDe = (c: CandidatoPendente) => c.tipo ?? (c.complementar ? "ESTIMADO" : "PRATICADO")
const SELO = {
  ESTIMADO: { rotulo: "Estimado por outro órgão", cor: "border-amber-300 bg-amber-50 text-[10px] text-amber-800" },
  MERCADO: { rotulo: "Preço de loja ou site", cor: "border-blue-300 bg-blue-50 text-[10px] text-blue-800" },
  PRATICADO: { rotulo: "Preço praticado", cor: "border-green-300 bg-green-50 text-[10px] text-green-800" },
} as const

const fmtMoeda = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtData = (d: string) => {
  const [a, m, dia] = String(d || "").slice(0, 10).split("-")
  return a && m && dia ? `${dia}/${m}/${a}` : d || "—"
}

export function AvisoCestaNoPiso({ itemNumero, temEstimada }: { itemNumero: number; temEstimada: boolean }) {
  return (
    <div data-testid={`aviso-piso-${itemNumero}`} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div>
        <strong>Todos os preços deste item já saíram de disputa.</strong> Valor homologado ou contratado é o preço final de quem venceu: a referência fica perto do piso do mercado e pode afastar licitantes ou deixar o item deserto. Some uma cotação direta de fornecedor
        {temEstimada ? " ou inclua uma das referências de mercado ou estimadas abaixo." : "."}
      </div>
    </div>
  )
}

export function ReferenciasPendentes({
  itemNumero,
  pendentes,
  decidindo,
  bloqueada,
  onDecidir,
}: {
  itemNumero: number
  pendentes: CandidatoPendente[]
  decidindo: string | null
  bloqueada?: boolean
  onDecidir: (c: CandidatoPendente, acao: "aprovar" | "rejeitar") => void
}) {
  // Lista curta por padrão: as melhores primeiro (a API já manda ordenado)
  const [todas, setTodas] = useState(false)
  const LIMITE = 4
  if (!pendentes.length) return null
  const visiveis = todas ? pendentes : pendentes.slice(0, LIMITE)
  return (
    <div data-testid={`pendentes-${itemNumero}`} className="rounded-md border border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 px-3 py-2">
        <p className="text-xs font-semibold text-gray-700">Referências encontradas — aguardando sua decisão ({pendentes.length})</p>
        <p className="text-[11px] text-gray-500">Ainda não contam no cálculo. Abra a fonte, confira se é o mesmo produto e a mesma embalagem, inclua as que servem e descarte as demais.</p>
      </div>
      <ul className="divide-y divide-gray-200">
        {visiveis.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
            <div className="min-w-0 sm:flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">
                  {fmtMoeda(c.valor_unitario)}
                  {c.unidade ? <span className="font-normal text-gray-500"> / {c.unidade}</span> : null}
                </span>
                <Badge variant="outline" className={SELO[tipoDe(c)].cor}>{SELO[tipoDe(c)].rotulo}</Badge>
                <span className="text-[11px] text-gray-500">{fmtData(c.data_pesquisa)}</span>
                {c.quantidade_base ? <span className="text-[11px] text-gray-500">qtd. lá: {Number(c.quantidade_base).toLocaleString("pt-BR")}</span> : null}
              </div>
              <p className="mt-0.5 text-xs text-gray-700">{c.titulo || c.descricao_fonte}</p>
              <p className="text-[11px] text-gray-500">
                {c.descricao_fonte}
                {c.url_referencia ? (
                  <>
                    {" · "}
                    <a href={c.url_referencia} target="_blank" rel="noopener noreferrer" className="text-[#1351b4] hover:underline">
                      abrir a fonte
                    </a>
                  </>
                ) : null}
              </p>
              {c.flags
                .filter((f) => !/^Referência complementar/.test(f))
                .map((f) => (
                  <p key={f} className="text-[11px] text-gray-500">
                    • {f}
                  </p>
                ))}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" className="h-7 border-[#c5d4eb] text-xs text-[#1351b4]" disabled={bloqueada || decidindo === c.id} onClick={() => onDecidir(c, "aprovar")}>
                {decidindo === c.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" /> Incluir na pesquisa
                  </>
                )}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500" disabled={bloqueada || decidindo === c.id} onClick={() => onDecidir(c, "rejeitar")}>
                <X className="mr-1 h-3.5 w-3.5" /> Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {pendentes.length > LIMITE && (
        <button type="button" className="w-full border-t border-gray-200 px-3 py-1.5 text-left text-xs text-[#1351b4] hover:underline" onClick={() => setTodas((v) => !v)}>
          {todas ? "Mostrar menos" : `Mostrar mais ${pendentes.length - LIMITE}`}
        </button>
      )}
    </div>
  )
}

/** O que aparece ao abrir a linha de um item na tabela do valor de referência. */
export function PrecosDoItem({
  itemNumero,
  cotacoes,
  pendentes,
  decidindo,
  removendo,
  buscando,
  bloqueada,
  onDecidir,
  onRemover,
  onBuscar,
}: {
  itemNumero: number
  cotacoes: CotacaoDoItem[]
  pendentes: CandidatoPendente[]
  decidindo: string | null
  removendo: string | null
  buscando: boolean
  bloqueada?: boolean
  onDecidir: (c: CandidatoPendente, acao: "aprovar" | "rejeitar") => void
  onRemover: (itemNumero: number, indice: number) => void
  onBuscar: (itemNumero: number) => void
}) {
  return (
    <div className="space-y-3" data-testid={`precos-item-${itemNumero}`}>
      {soPrecosPraticados(cotacoes) && <AvisoCestaNoPiso itemNumero={itemNumero} temEstimada={pendentes.some((c) => tipoDe(c) !== "PRATICADO")} />}
      {cotacoes.length > 0 ? (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-600">
              <tr>
                <th scope="col" className="hidden px-3 py-1.5 text-left font-semibold sm:table-cell">Fonte</th>
                <th scope="col" className="px-3 py-1.5 text-left font-semibold">De onde veio</th>
                <th scope="col" className="hidden px-3 py-1.5 text-left font-semibold sm:table-cell">Data</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">Valor unitário</th>
                <th scope="col" className="w-16 px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {cotacoes.map((c, idx) => (
                <tr key={`${idx}-${c.valor_unitario}`} className="border-t align-top">
                  <td className="hidden whitespace-nowrap px-3 py-1.5 sm:table-cell">
                    {ROTULO_FONTE[c.fonte] ?? c.fonte}
                    {/valor estimado/i.test(c.observacao || "") && <span className="block text-[10px] text-amber-800">estimado</span>}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700">
                    <span className="block text-[10px] uppercase tracking-wide text-gray-500 sm:hidden">{ROTULO_FONTE[c.fonte] ?? c.fonte}</span>
                    {c.fornecedor_razao_social || c.descricao_fonte}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-1.5 text-gray-600 sm:table-cell">{fmtData(c.data_pesquisa)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">{fmtMoeda(c.valor_unitario)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {c.url_referencia && (
                      <a href={c.url_referencia} target="_blank" rel="noopener noreferrer" className="mr-2 inline-block align-middle text-[#1351b4]" aria-label="Abrir a fonte" title="Abrir a fonte">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button type="button" className="inline-block align-middle text-gray-400 hover:text-red-700 disabled:opacity-50" disabled={bloqueada || removendo === `${itemNumero}-${idx}`} onClick={() => onRemover(itemNumero, idx)} aria-label="Tirar este preço da pesquisa" title="Tirar este preço da pesquisa">
                      {removendo === `${itemNumero}-${idx}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-600">Nenhum preço neste item ainda.</p>
      )}
      <ReferenciasPendentes itemNumero={itemNumero} pendentes={pendentes} decidindo={decidindo} bloqueada={bloqueada} onDecidir={onDecidir} />
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bloqueada || buscando} onClick={() => onBuscar(itemNumero)}>
        {buscando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
        {buscando ? "Buscando…" : "Buscar preços só deste item"}
      </Button>
    </div>
  )
}
