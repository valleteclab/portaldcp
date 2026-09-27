"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { fmtBrasilia } from "@/lib/publicacao"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ClipboardList, Pencil } from "lucide-react"
import { SituacaoBadge } from "@/components/licitacao/SituacaoBadge"
import { FASES_INTERNAS, ROTULO_CRITERIO, corFase, rotuloFase, rotuloModalidade } from "@/lib/licitacao-rotulos"
import { MenuAcoes, type EntradaMenu } from "./MenuAcoes"
import { BotaoGerarAutos } from "./BotaoGerarAutos"
import type { LicitacaoProcesso } from "./tipos"

/**
 * CABEÇALHO: título, fase/situação reais, objeto, linha com fundamento legal /
 * critério / unidade / criação e, à direita, editar dados, "Gerar autos (PDF)"
 * (Entrega 6 — montagem em segundo plano, folhas numeradas) e o menu "Mais ações".
 */
export function CabecalhoProcesso({
  licitacao: l,
  entradasMenu,
  onAcao,
}: {
  licitacao: LicitacaoProcesso
  entradasMenu: EntradaMenu[]
  onAcao: (chave: string) => void
}) {
  const router = useRouter()
  const interna = FASES_INTERNAS.includes(l.fase)
  const meta = [
    l.fundamento_legal,
    l.criterio_julgamento ? ROTULO_CRITERIO[l.criterio_julgamento] || l.criterio_julgamento : null,
    l.unidade_compradora ? `Unidade: ${l.unidade_compradora}` : null,
    l.created_at ? `Criado em ${fmtBrasilia(l.created_at)}` : null,
  ].filter(Boolean) as string[]

  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Voltar">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">
              {rotuloModalidade(l.modalidade)}{" "}
              <span className="font-normal text-gray-500 text-lg whitespace-nowrap">· Processo administrativo nº {l.numero_processo}</span>
            </h1>
            <Badge className={`${corFase(l.fase)} hover:opacity-100`}>{rotuloFase(l.fase)}</Badge>
            <SituacaoBadge licitacao={l} />
            {l.srp && <Badge variant="outline">SRP</Badge>}
            {l.selecao_externa && <Badge className="bg-indigo-100 text-indigo-900 hover:bg-indigo-100">Seleção externa</Badge>}
            {l.fase_interna_externa && (
              <Badge
                variant="outline"
                className="text-gray-700 border-gray-300 font-normal"
                title={`${l.fase_interna_externa.por_nome ? `Por ${l.fase_interna_externa.por_nome}` : ""}${l.fase_interna_externa.em ? ` em ${fmtBrasilia(l.fase_interna_externa.em)}` : ""}`}
              >
                {l.fase_interna_externa.modo === "MISTA" ? "Fase interna mista (parte anexada)" : "Fase interna externa (documentos anexados)"}
              </Badge>
            )}
          </div>
          <p className="text-gray-800 mt-1 max-w-3xl">{l.objeto}</p>
          {meta.length > 0 && (
            <p className="text-sm text-gray-700 mt-1">
              {meta.map((m, i) => (
                <span key={m}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {m}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap justify-end">
        {interna && (
          <Button variant="outline" asChild>
            <Link href={`/orgao/processos/${l.id}#fluxo-fase-interna`}>
              <ClipboardList className="w-4 h-4 mr-2" aria-hidden="true" /> Fase interna
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={`/orgao/processos/${l.id}/editar`}>
            <Pencil className="w-4 h-4 mr-2" aria-hidden="true" /> Editar dados
          </Link>
        </Button>
        <BotaoGerarAutos licitacaoId={l.id} numeroProcesso={l.numero_processo} />
        <MenuAcoes entradas={entradasMenu} onEscolher={onAcao} />
      </div>
    </header>
  )
}
