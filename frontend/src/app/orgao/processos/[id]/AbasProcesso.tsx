"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { FASES_INTERNAS } from "@/lib/licitacao-rotulos"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Lock } from "lucide-react"
import { ItensProcesso } from "./ItensProcesso"
import { DocumentosProcesso } from "./DocumentosProcesso"
import { RetificarEdital } from "./RetificarEdital"
import { FilaPncp } from "./FilaPncp"
import { HistoricoProcesso } from "./HistoricoProcesso"
import { FASES_SALA } from "./SessaoPublicaCard"
import { fmtMoeda, type ProcessoCompleto } from "./tipos"

export type AbaProcesso = "itens" | "documentos" | "propostas" | "pncp" | "historico"

function Contador({ n, alerta }: { n: number; alerta?: boolean }) {
  return (
    <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${alerta ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
      {n}
      {alerta && <span className="sr-only"> (nenhum item: pendência)</span>}
    </span>
  )
}

/** Propostas: durante o recebimento só a quantidade (sigilo); depois, a lista. */
function PropostasAba({ dados }: { dados: ProcessoCompleto }) {
  const l = dados.licitacao
  const validas = dados.propostas.filter((p) => !["RASCUNHO", "CANCELADA"].includes(p.status))
  if (dados.propostas_em_sigilo) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Lock className="w-4 h-4 text-amber-700" aria-hidden="true" />
        <span>
          <b>{validas.length}</b> {validas.length === 1 ? "proposta recebida" : "propostas recebidas"}. Licitantes e valores em sigilo até o fim do
          prazo (Lei 14.133/2021, art. 13, parágrafo único, I; IN SEGES 67/2021, art. 13).
        </span>
      </p>
    )
  }
  if (validas.length === 0) return <p className="text-sm text-gray-700">Nenhuma proposta recebida.</p>
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-700">
            <tr>
              <th scope="col" className="text-left px-3 py-2">Fornecedor</th>
              <th scope="col" className="text-right px-3 py-2">Valor global</th>
              <th scope="col" className="text-left px-3 py-2">Enviada em</th>
              <th scope="col" className="text-left px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {validas.map((p, i) => (
              <tr key={p.id ?? i} className="border-t">
                <td className="px-3 py-2">{p.razao_social ?? "—"}</td>
                <td className="px-3 py-2 text-right">{p.valor_total_proposta != null ? fmtMoeda(p.valor_total_proposta) : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtBrasilia(p.data_envio)}</td>
                <td className="px-3 py-2">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {FASES_SALA.includes(l.fase) && l.modalidade !== "DISPENSA_ELETRONICA" && (
        <Link href={`/orgao/processos/${l.id}/propostas`} className="text-sm text-blue-800 hover:underline">Análise detalhada das propostas</Link>
      )}
    </div>
  )
}

/** PNCP: envios da fila + reenvio manual de resultado e contratos (art. 94). */
function PncpAba({ dados, onAtualizado }: { dados: ProcessoCompleto; onAtualizado: () => void }) {
  const l = dados.licitacao
  const [enviando, setEnviando] = useState<string | null>(null)
  const enviar = async (acao: "resultado" | "contratos") => {
    setEnviando(acao)
    try {
      const rota = acao === "resultado" ? "resultados-homologacao" : "contratos"
      const res = await authFetch(`${API_URL}/api/pncp/compras/${l.id}/${rota}`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      toast.success(acao === "resultado" ? `Resultado: ${j?.enviados}/${j?.total} item(ns) enviados ao PNCP.` : `Contratos: ${j?.enviados}/${j?.total} publicado(s) no PNCP.`)
      onAtualizado()
    } catch (e: any) {
      toast.error(`PNCP: ${e.message}`)
    } finally {
      setEnviando(null)
    }
  }
  return (
    <div className="space-y-3">
      <FilaPncp licitacaoId={l.id} linkPncp={l.link_pncp} atualizacao={dados} />
      {(dados.checklist.homologado || dados.checklist.contrato_gerado) && !l.selecao_externa && (
        <div className="flex gap-2 flex-wrap">
          {dados.checklist.homologado && (
            <Button size="sm" variant="outline" onClick={() => enviar("resultado")} disabled={enviando !== null}>
              {enviando === "resultado" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Enviar resultado
            </Button>
          )}
          {dados.checklist.contrato_gerado && (
            <Button size="sm" variant="outline" onClick={() => enviar("contratos")} disabled={enviando !== null}>
              {enviando === "contratos" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Enviar contratos
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-gray-700">
        Publicação automática: aviso/edital ao publicar; resultado e contratos ao homologar (art. 94 — a divulgação do contrato no PNCP é
        condição de eficácia). Os botões servem para reenvio em caso de falha.
      </p>
    </div>
  )
}

/**
 * ABAS DO RODAPÉ: Itens (contador vermelho se 0), Documentos (lista única),
 * Propostas (sigilo no recebimento), PNCP (envios) e Histórico. Todas ficam
 * montadas (forceMount) para o menu poder abrir a retificação e a contagem de
 * documentos aparecer sem abrir a aba.
 */
export function AbasProcesso({
  dados,
  aba,
  onAba,
  retificarSinal,
  onAtualizado,
}: {
  dados: ProcessoCompleto
  aba: AbaProcesso
  onAba: (a: AbaProcesso) => void
  retificarSinal: number
  onAtualizado: () => void
}) {
  const l = dados.licitacao
  const [totalDocs, setTotalDocs] = useState<number | null>(null)
  const aoTotal = useCallback((n: number) => setTotalDocs(n), [])
  const interna = FASES_INTERNAS.includes(l.fase)
  const itensAtivos = dados.itens.filter((i) => i.status !== "CANCELADO").length
  const propostas = dados.propostas.filter((p) => !["RASCUNHO", "CANCELADA"].includes(p.status)).length
  const conteudo = "data-[state=inactive]:hidden"

  return (
    <section id="abas-processo" aria-label="Detalhes do processo" className="rounded-lg border bg-white">
      <Tabs value={aba} onValueChange={(v) => onAba(v as AbaProcesso)}>
        <TabsList className="w-full justify-start overflow-x-auto rounded-none rounded-t-lg border-b bg-white p-0 h-auto">
          {(
            [
              ["itens", "Itens", <Contador key="c" n={itensAtivos} alerta={itensAtivos === 0} />],
              ["documentos", "Documentos", totalDocs != null ? <Contador key="c" n={totalDocs} /> : null],
              ["propostas", "Propostas", <Contador key="c" n={propostas} />],
              ["pncp", "PNCP", null],
              ["historico", "Histórico", null],
            ] as const
          ).map(([v, rotulo, extra]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-700 data-[state=active]:text-blue-800 data-[state=active]:shadow-none"
            >
              {rotulo}
              {extra}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="p-4">
          <TabsContent value="itens" forceMount className={conteudo}>
            {l.modalidade === "CREDENCIAMENTO" ? (
              <p className="text-sm text-gray-700">
                No credenciamento, os objetos e valores ficam no <Link href={`/orgao/credenciamentos/${l.id}`} className="text-blue-800 hover:underline">painel do credenciamento</Link>.
              </p>
            ) : (
              <ItensProcesso licitacaoId={l.id} itens={dados.itens} emFaseInterna={interna && l.modalidade !== "LEILAO"} />
            )}
          </TabsContent>
          <TabsContent value="documentos" forceMount className={`${conteudo} space-y-4`}>
            <DocumentosProcesso licitacaoId={l.id} faseInterna={dados.documentos} onTotal={aoTotal} />
            {!interna && (
              <RetificarEdital
                licitacaoId={l.id}
                // disponibilidade decidida pela máquina de estados (acoes_menu)
                podeRetificar={(dados.acoes_menu || []).some((a) => a.ato === "RETIFICAR_EDITAL" && a.disponivel)}
                datas={l}
                onAtualizado={onAtualizado}
                abrirSinal={retificarSinal}
              />
            )}
          </TabsContent>
          <TabsContent value="propostas" forceMount className={conteudo}>
            <PropostasAba dados={dados} />
          </TabsContent>
          <TabsContent value="pncp" forceMount className={conteudo}>
            <PncpAba dados={dados} onAtualizado={onAtualizado} />
          </TabsContent>
          <TabsContent value="historico" forceMount className={conteudo}>
            <HistoricoProcesso licitacaoId={l.id} atualizacao={dados} />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}
