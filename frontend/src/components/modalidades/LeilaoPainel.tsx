"use client"

/**
 * LEILÃO — painel do órgão (Lei 14.133/2021 art. 31; plano E7c).
 *  - fase interna: configuração (leiloeiro/servidor, pagamento, visitação) e bens
 *    (avaliação, preço mínimo, localização, ônus, fotos públicas);
 *  - julgamento: declarar os arrematantes (maior lance ≥ preço mínimo);
 *  - depois da fase recursal: convocar para o pagamento, confirmar ou declarar
 *    a inadimplência (lance subsequente); termo de arrematação após a homologação.
 * `modo="sala"` mostra só arrematação/pagamento (usado na sala V3).
 */
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Gavel, ImagePlus, Loader2 } from "lucide-react"
import { API_URL, getAssetUrl } from "@/lib/api"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { FormBemLeilao, FormConfiguracaoLeilao, type Valores } from "./formularios"
import { abrirArquivo, classeInput, fmtDataHora, fmtMoeda, usePainel } from "./comum"

const FASES_INTERNAS = ["PLANEJAMENTO", "TERMO_REFERENCIA", "PESQUISA_PRECOS", "ANALISE_JURIDICA", "APROVACAO_INTERNA"]

const ROTULO_STATUS: Record<string, string> = {
  DECLARADA: "Declarada (aguarda a fase recursal)",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  PAGAMENTO_INFORMADO: "Pagamento informado",
  PAGA: "Paga",
  INADIMPLENTE: "Inadimplente",
  CANCELADA: "Cancelada",
}

export function LeilaoPainel({ licitacaoId, modo = "cockpit", onAtualizado }: { licitacaoId: string; modo?: "cockpit" | "sala"; onAtualizado?: () => void }) {
  const base = `/api/leilao/licitacao/${licitacaoId}`
  const { dados, carregando, erro, executando, executar } = usePainel<any>(`${API_URL}${base}`)
  const [config, setConfig] = useState<Valores>({})
  const [bens, setBens] = useState<Record<string, Valores>>({})
  const [motivo, setMotivo] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!dados) return
    setConfig(dados.configuracao ?? { tipo_leiloeiro: "SERVIDOR", forma_pagamento: "A_VISTA", prazo_pagamento_dias_uteis: 1 })
    const b: Record<string, Valores> = {}
    for (const x of dados.bens ?? []) b[x.itemId] = x.bem ?? { tipo_bem: "MOVEL", descricao: x.descricaoItem ?? "" }
    setBens(b)
  }, [dados])

  const ato = async (chave: string, caminho: string, body?: any, method = "POST") => {
    const r = await executar(chave, caminho, { body, method })
    if (r) onAtualizado?.()
    return r
  }

  if (carregando && !dados) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o leilão…</div>
  if (!dados) return <ErroPendencias erro={erro} />

  const fase: string = dados.licitacao.fase
  const interna = FASES_INTERNAS.includes(fase)
  const arrematacoes: any[] = dados.arrematacoes ?? []

  const blocoArrematacao = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {fase === "JULGAMENTO" && (
          <Button size="sm" onClick={() => ato("declarar", `${base}/arrematantes/declarar`)} disabled={!!executando}>
            {executando === "declarar" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Declarar arrematantes (maior lance ≥ preço mínimo)
          </Button>
        )}
        {arrematacoes.some((a) => a.status === "DECLARADA") && (
          <Button size="sm" variant="outline" onClick={() => ato("convocar", `${base}/pagamento/convocar`)} disabled={!!executando || !dados.pagamento?.faseRecursalSuperada} title={dados.pagamento?.motivos?.join(" ")}>
            Convocar para pagamento
          </Button>
        )}
        {fase === "HOMOLOGACAO" && (
          <Button size="sm" variant="outline" onClick={() => ato("termos", `${base}/termos`)} disabled={!!executando}>
            Gerar termos de arrematação
          </Button>
        )}
      </div>
      {!dados.pagamento?.faseRecursalSuperada && arrematacoes.some((a) => a.status === "DECLARADA") && (
        <p className="text-xs text-amber-700">Pagamento só depois da fase recursal (art. 31 §4º): {dados.pagamento?.motivos?.join(" ")}</p>
      )}
      {arrematacoes.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma arrematação declarada.</p>
      ) : (
        <div className="space-y-2">
          {arrematacoes.map((a) => (
            <div key={a.id} className="rounded border p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {a.tipoUnidade === "LOTE" ? "Lote" : "Item"} {a.numero}
                  {a.ordem > 1 && <span className="ml-1 text-xs text-slate-500">(lance subsequente nº {a.ordem})</span>} — {a.arrematante ?? "—"}
                </span>
                <span>
                  {fmtMoeda(a.valor)}
                  {a.valorComissao ? <span className="text-xs text-slate-500"> + comissão {fmtMoeda(a.valorComissao)}</span> : null}
                </span>
                <Badge variant="outline">{ROTULO_STATUS[a.status] ?? a.status}</Badge>
              </div>
              {a.prazoPagamento && ["AGUARDANDO_PAGAMENTO", "PAGAMENTO_INFORMADO"].includes(a.status) && (
                <p className="text-xs text-slate-500">Prazo de pagamento: {fmtDataHora(a.prazoPagamento)}</p>
              )}
              {a.motivo && <p className="text-xs text-red-700">Motivo: {a.motivo}</p>}
              <div className="mt-1 flex flex-wrap gap-2">
                {a.comprovante && (
                  <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arrematacoes/${a.id}/comprovante`)}>Ver comprovante</Button>
                )}
                {["AGUARDANDO_PAGAMENTO", "PAGAMENTO_INFORMADO"].includes(a.status) && (
                  <>
                    <Button size="sm" onClick={() => ato(`conf-${a.id}`, `${base}/arrematacoes/${a.id}/confirmar-pagamento`)} disabled={!!executando}>
                      Confirmar pagamento
                    </Button>
                    <input className={`${classeInput} max-w-xs`} placeholder="Motivo da inadimplência" value={motivo[a.id] ?? ""} onChange={(e) => setMotivo({ ...motivo, [a.id]: e.target.value })} />
                    <Button size="sm" variant="destructive" onClick={() => ato(`inad-${a.id}`, `${base}/arrematacoes/${a.id}/inadimplencia`, { motivo: motivo[a.id] ?? "" })} disabled={!!executando}>
                      Declarar inadimplência
                    </Button>
                  </>
                )}
                {a.temTermo && (
                  <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arrematacoes/${a.id}/termo`)}>Termo de arrematação</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <Card>
      <CardHeader className="border-b bg-amber-50">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gavel className="h-4 w-4" /> Leilão — {modo === "sala" ? "arrematação e pagamento" : "edital, arrematação e pagamento"}
        </CardTitle>
        <CardDescription>
          Lei 14.133/2021, art. 31: sem habilitação; homologação depois da fase de lances, da fase recursal e do pagamento (§4º).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <ErroPendencias erro={erro} />
        {modo === "cockpit" && (
          <>
            {dados.alertas?.length > 0 && <p className="text-xs text-amber-700">{dados.alertas.join(" ")}</p>}
            {interna && dados.pendenciasEdital?.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <p className="font-medium">Para publicar o edital do leilão:</p>
                <ul className="list-disc pl-4">{dados.pendenciasEdital.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Condução, pagamento e visitação</h3>
              {interna ? (
                <>
                  <FormConfiguracaoLeilao valor={config} onChange={setConfig} />
                  <Button size="sm" onClick={() => ato("config", `${base}/configuracao`, config, "PUT").then(() => undefined)} disabled={!!executando}>
                    Salvar configuração
                  </Button>
                </>
              ) : (
                <p className="text-sm text-slate-600">
                  {config.tipo_leiloeiro === "OFICIAL" ? `Leiloeiro oficial ${config.leiloeiro_nome ?? ""}` : `Servidor designado ${config.servidor_nome ?? ""}`} ·
                  pagamento {config.forma_pagamento === "PARCELADO" ? "parcelado" : "à vista"} em {config.prazo_pagamento_dias_uteis} dia(s) útil(eis)
                </p>
              )}
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Bens (art. 31 §2º)</h3>
              {(dados.bens ?? []).map((x: any) => (
                <div key={x.itemId} className="space-y-2 rounded border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Item {x.numero} — {x.descricaoItem}</span>
                    <Badge variant="outline">{x.status}</Badge>
                  </div>
                  {interna ? (
                    <>
                      <FormBemLeilao valor={bens[x.itemId] ?? {}} onChange={(v) => setBens({ ...bens, [x.itemId]: v })} />
                      <Button size="sm" variant="outline" onClick={() => ato(`bem-${x.itemId}`, `${base}/bens/${x.itemId}`, { ...(bens[x.itemId] ?? {}) }, "PUT").then(() => undefined)} disabled={!!executando}>
                        Salvar bem
                      </Button>
                    </>
                  ) : x.bem ? (
                    <p className="text-xs text-slate-600">
                      {x.bem.descricao} · avaliação {fmtMoeda(x.bem.valor_avaliacao)} · preço mínimo {fmtMoeda(x.bem.valor_minimo)} · {x.bem.localizacao ?? x.bem.matricula_imovel ?? ""}
                    </p>
                  ) : null}
                  {x.bem && (
                    <div className="flex flex-wrap items-center gap-2">
                      {(x.bem.fotos ?? []).map((f: any) => (
                        <a key={f.url} href={getAssetUrl(f.url)} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={getAssetUrl(f.url)} alt={f.nome} className="h-14 w-14 rounded object-cover" />
                        </a>
                      ))}
                      <label className="flex cursor-pointer items-center gap-1 text-xs text-blue-700">
                        <ImagePlus className="h-4 w-4" /> foto
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const arq = e.target.files?.[0]
                            if (!arq) return
                            const fd = new FormData()
                            fd.append("arquivo", arq)
                            await executar(`foto-${x.itemId}`, `${base}/bens/${x.itemId}/fotos`, { body: fd })
                            e.target.value = ""
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
        {!interna && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Arrematação e pagamento</h3>
            {blocoArrematacao}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
