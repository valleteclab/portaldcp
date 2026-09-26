"use client"

/**
 * Itens da contratação no cockpit do processo.
 *  - Sem item ativo com quantidade e valor estimado o processo não conclui a
 *    fase interna nem publica (gate do backend) e a compra não vai ao PNCP.
 *  - Na fase interna: "Editar itens" abre a aba Itens da edição do processo
 *    (mesmo editor do assistente) e "Pesquisa de preços" o módulo por item.
 *  - Depois da publicação os itens só mudam por retificação — ou, sem
 *    propostas, cancelando a publicação (CancelarPublicacao).
 */
import Link from "next/link"
import { AlertTriangle, ListChecks, Pencil, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface ItemCockpit {
  id: string
  numero_item: number
  descricao: string
  quantidade: number
  unidade_medida?: string
  valor_unitario_estimado?: number
  status: string
}

const moeda = (v?: number | string | null) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export function itemValidoParaPublicar(i: ItemCockpit): boolean {
  return i.status !== "CANCELADO" && Number(i.quantidade) > 0 && Number(i.valor_unitario_estimado) > 0
}

export function ItensProcesso({ licitacaoId, itens, emFaseInterna }: {
  licitacaoId: string
  itens: ItemCockpit[]
  emFaseInterna: boolean
}) {
  const ativos = itens.filter((i) => i.status !== "CANCELADO")
  const validos = ativos.filter(itemValidoParaPublicar)
  const semValor = ativos.length - validos.length
  const total = ativos.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario_estimado || 0), 0)
  const bloqueia = validos.length === 0

  return (
    <Card className={bloqueia ? "border-amber-300" : undefined}>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="w-4 h-4" /> Itens da contratação
          <span className="text-xs font-normal text-gray-500">
            {ativos.length} item(ns){total > 0 ? ` · ${moeda(total)}` : ""}
          </span>
        </CardTitle>
        {emFaseInterna && (
          <div className="flex gap-2">
            <Link href={`/orgao/fase-interna/processos/${licitacaoId}/precos`}>
              <Button variant="outline" size="sm" title="Pesquisa de preços por item (art. 23) — o documento gerado preenche o valor estimado dos itens">
                <Search className="w-3.5 h-3.5 mr-1.5" /> Pesquisa de preços
              </Button>
            </Link>
            <Link href={`/orgao/processos/${licitacaoId}/editar?aba=itens`}>
              <Button size="sm" variant={bloqueia ? "default" : "outline"}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> {ativos.length ? "Editar itens" : "Cadastrar itens"}
              </Button>
            </Link>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {bloqueia && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {ativos.length === 0
                ? "O processo não tem itens. "
                : "Nenhum item tem quantidade e valor unitário estimado. "}
              Cadastre pelo menos um item com quantidade e valor estimado — sem isso a fase interna não conclui, o
              edital/aviso não é publicado e a compra não vai ao PNCP.
              {!emFaseInterna && " Já publicado sem propostas? Cancele a publicação (menu Mais ações), corrija os itens e publique de novo."}
            </span>
          </div>
        )}
        {!bloqueia && semValor > 0 && (
          <p className="text-xs text-amber-700">{semValor} item(ns) sem valor estimado — defina pela pesquisa de preços.</p>
        )}
        {ativos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1 pr-2">Nº</th>
                  <th className="py-1 pr-2">Descrição</th>
                  <th className="py-1 pr-2 text-right">Qtd.</th>
                  <th className="py-1 pr-2">Unid.</th>
                  <th className="py-1 pr-2 text-right">Valor unit. est.</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {ativos.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">{i.numero_item}</td>
                    <td className="py-1 pr-2 max-w-[320px] truncate" title={i.descricao}>{i.descricao}</td>
                    <td className="py-1 pr-2 text-right">{Number(i.quantidade).toLocaleString("pt-BR")}</td>
                    <td className="py-1 pr-2">{i.unidade_medida || "—"}</td>
                    <td className={`py-1 pr-2 text-right ${itemValidoParaPublicar(i) ? "" : "text-amber-700"}`}>
                      {Number(i.valor_unitario_estimado) > 0 ? moeda(i.valor_unitario_estimado) : "—"}
                    </td>
                    <td className="py-1 text-right">{moeda(Number(i.quantidade || 0) * Number(i.valor_unitario_estimado || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
