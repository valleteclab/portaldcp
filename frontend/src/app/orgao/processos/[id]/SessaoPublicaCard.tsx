"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileText, Gavel, ListChecks, Lock, Scale } from "lucide-react"

/** Fases em que a sala da sessão pública está aberta ao agente/pregoeiro. */
export const FASES_SALA = [
  "ANALISE_PROPOSTAS", "EM_DISPUTA", "JULGAMENTO", "HABILITACAO", "RECURSO", "ADJUDICACAO", "HOMOLOGACAO",
]
const FASES_ANTES_DA_SALA = ["PUBLICADO", "IMPUGNACAO", "ACOLHIMENTO_PROPOSTAS"]

interface Props {
  licitacaoId: string
  fase: string
  criterioJulgamento?: string
  dataAbertura?: string | null
  propostas: Array<{ id: string; status: string }>
  propostasEmSigilo?: boolean
}

/**
 * SESSÃO PÚBLICA — propostas recebidas (sem identificar licitantes antes da
 * sessão) e a porta de entrada da SALA do agente/pregoeiro
 * (/orgao/processos/[id]/sessao). Disputa, aceitação, ME/EPP, negociação,
 * habilitação e recursos são conduzidos na sala — não no cockpit.
 */
export function SessaoPublicaCard({
  licitacaoId, fase, criterioJulgamento, dataAbertura, propostas, propostasEmSigilo,
}: Props) {
  const tecnico = ["MELHOR_TECNICA", "TECNICA_E_PRECO"].includes(criterioJulgamento ?? "")
  const salaAberta = FASES_SALA.includes(fase)
  const validas = propostas.filter((p) => !["RASCUNHO", "CANCELADA"].includes(p.status))

  if (!salaAberta && !FASES_ANTES_DA_SALA.includes(fase)) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gavel className="w-4 h-4" /> Sessão pública
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span>
            <b>{validas.length}</b> proposta(s) recebida(s)
          </span>
          {propostasEmSigilo && (
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              <Lock className="w-3 h-3 mr-1" /> licitantes e valores em sigilo até a abertura
            </Badge>
          )}
          {dataAbertura && (
            <span className="text-gray-500">
              · abertura em {new Date(dataAbertura).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {salaAberta ? (
            <Link href={`/orgao/processos/${licitacaoId}/sessao`}>
              <Button size="sm">
                <Gavel className="w-4 h-4 mr-1" /> Abrir sala da sessão
              </Button>
            </Link>
          ) : (
            <Button size="sm" disabled title="A sala abre com o fim do recebimento de propostas (ato do cronograma)">
              <Gavel className="w-4 h-4 mr-1" /> Sala da sessão (após o recebimento)
            </Button>
          )}
          {salaAberta && (
            <Link href={`/orgao/processos/${licitacaoId}/propostas`}>
              <Button size="sm" variant="outline">
                <ListChecks className="w-4 h-4 mr-1" /> Propostas recebidas
              </Button>
            </Link>
          )}
          {salaAberta && fase !== "ANALISE_PROPOSTAS" && (
            <Link href={`/orgao/processos/${licitacaoId}/ata`}>
              <Button size="sm" variant="outline">
                <FileText className="w-4 h-4 mr-1" /> Ata da sessão
              </Button>
            </Link>
          )}
          {tecnico && (
            <Link href={`/orgao/processos/${licitacaoId}/julgamento-tecnico`}>
              <Button size="sm" variant="outline">
                <Scale className="w-4 h-4 mr-1" /> Julgamento técnico
              </Button>
            </Link>
          )}
        </div>
        <p className="text-[11px] text-gray-400">
          Na sala: disputa de lances, aceitação da proposta, desempate ME/EPP, negociação, habilitação, recursos e a ata da sessão.
          Adjudicação e homologação aparecem aqui no processo, em &quot;Resultado&quot;.
        </p>
      </CardContent>
    </Card>
  )
}
