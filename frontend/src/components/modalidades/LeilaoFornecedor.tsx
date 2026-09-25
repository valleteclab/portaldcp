"use client"

/**
 * LEILÃO — visão do licitante/arrematante (Lei 14.133/2021 art. 31; plano E7c):
 * bens com avaliação, preço mínimo, localização e fotos; as PRÓPRIAS
 * arrematações com o prazo e o envio do comprovante de pagamento; termo de
 * arrematação depois da homologação. Os lances são dados na sala de disputa
 * (maior lance — lance só acima do seu último).
 */
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Gavel, Loader2, Upload } from "lucide-react"
import { API_URL, getAssetUrl } from "@/lib/api"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { abrirArquivo, fmtDataHora, fmtMoeda, usePainel } from "./comum"

export function LeilaoFornecedor({ licitacaoId }: { licitacaoId: string }) {
  const base = `/api/leilao/licitacao/${licitacaoId}`
  const { dados, carregando, erro, executando, executar } = usePainel<any>(`${API_URL}${base}`)
  if (carregando && !dados) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o leilão…</div>
  if (!dados) return <ErroPendencias erro={erro} />
  const cfg = dados.configuracao
  const emDisputa = ["EM_DISPUTA", "ANALISE_PROPOSTAS", "JULGAMENTO"].includes(dados.licitacao.fase)
  return (
    <Card>
      <CardHeader className="border-b bg-amber-50">
        <CardTitle className="flex items-center gap-2 text-base"><Gavel className="h-4 w-4" /> Leilão — bens e arrematação</CardTitle>
        <CardDescription>
          Sua proposta é o lance inicial fechado (nunca abaixo do preço mínimo). Na sessão, cada lance precisa ser MAIOR que o seu último.
          Sem fase de habilitação; o bem é seu depois do pagamento e da homologação (art. 31 §4º).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <ErroPendencias erro={erro} />
        {cfg && (
          <p className="text-xs text-slate-600">
            {cfg.tipo_leiloeiro === "OFICIAL" ? `Leiloeiro oficial: ${cfg.leiloeiro_nome ?? "—"}` : `Servidor designado: ${cfg.servidor_nome ?? "—"}`}
            {cfg.comissao_percentual ? ` · comissão de ${cfg.comissao_percentual}% (paga pelo arrematante)` : ""} · pagamento{" "}
            {cfg.forma_pagamento === "PARCELADO" ? `parcelado (${cfg.parcelas}x)` : "à vista"} em até {cfg.prazo_pagamento_dias_uteis} dia(s) útil(eis) da convocação
            {cfg.local_visitacao ? ` · visitação: ${cfg.local_visitacao} ${cfg.periodo_visitacao ?? ""}` : ""}
          </p>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {(dados.bens ?? []).map((x: any) => (
            <div key={x.itemId} className="rounded border p-2 text-sm">
              <p className="font-medium">Item {x.numero} — {x.bem?.descricao ?? x.descricaoItem}</p>
              {x.bem && (
                <p className="text-xs text-slate-600">
                  Avaliação {fmtMoeda(x.bem.valor_avaliacao)} · <b>preço mínimo {fmtMoeda(x.bem.valor_minimo)}</b> · {x.bem.localizacao ?? x.bem.matricula_imovel ?? ""}
                  {x.bem.onus_gravames ? ` · ônus: ${x.bem.onus_gravames}` : ""}
                </p>
              )}
              <div className="mt-1 flex gap-1">
                {(x.bem?.fotos ?? []).map((f: any) => (
                  <a key={f.url} href={getAssetUrl(f.url)} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getAssetUrl(f.url)} alt={f.nome} className="h-12 w-12 rounded object-cover" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        {emDisputa && (
          <Link href={`/fornecedor/licitacoes/${licitacaoId}/sessao`} className="text-sm font-medium text-blue-700 hover:underline">
            Abrir a sala de lances →
          </Link>
        )}
        {(dados.arrematacoes ?? []).length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Minhas arrematações</h3>
            {dados.arrematacoes.map((a: any) => (
              <div key={a.id} className="space-y-1 rounded border p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{a.tipoUnidade === "LOTE" ? "Lote" : "Item"} {a.numero} — {fmtMoeda(a.valor)}{a.valorComissao ? ` + comissão ${fmtMoeda(a.valorComissao)}` : ""}</span>
                  <Badge variant="outline">{a.status}</Badge>
                </div>
                {a.prazoPagamento && <p className="text-xs text-slate-500">Pague até {fmtDataHora(a.prazoPagamento)}</p>}
                {a.status === "AGUARDANDO_PAGAMENTO" && (
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-blue-700">
                    <Upload className="h-4 w-4" /> Enviar comprovante do pagamento (PDF/JPG/PNG)
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      className="hidden"
                      disabled={!!executando}
                      onChange={async (e) => {
                        const arq = e.target.files?.[0]
                        if (!arq) return
                        const fd = new FormData()
                        fd.append("comprovante", arq)
                        await executar(`pag-${a.id}`, `${base}/arrematacoes/${a.id}/pagamento`, { body: fd })
                        e.target.value = ""
                      }}
                    />
                  </label>
                )}
                {a.comprovante && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arrematacoes/${a.id}/comprovante`)}>Ver meu comprovante</Button>}
                {a.temTermo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arrematacoes/${a.id}/termo`)}>Termo de arrematação</Button>}
                {a.motivo && <p className="text-xs text-red-700">{a.motivo}</p>}
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
