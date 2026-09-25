"use client"

/**
 * CONCURSO — painel do órgão (Lei 14.133/2021 art. 30; plano E7c).
 *  - fase interna: regulamento (art. 30 I a III) + quesitos e banca (≥ 3 — art. 37 §1º);
 *  - banca: trabalhos só por CÓDIGO (sigilo de autoria até o julgamento), notas por quesito;
 *  - julgamento publicado: autoria revelada, classificação, conferência da
 *    qualificação do vencedor (envelope de identificação), recursos (art. 165);
 *  - homologado: premiação, cessão de direitos (art. 93) e pagamento do prêmio.
 */
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Award, Loader2 } from "lucide-react"
import { API_URL } from "@/lib/api"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { JulgamentoTecnicoConfig } from "@/components/julgamento/JulgamentoTecnicoConfig"
import { RecursosPanel } from "@/components/disputa-v3/RecursosPanel"
import { FormRegulamentoConcurso, type Valores } from "./formularios"
import { abrirArquivo, classeInput, fmtDataHora, fmtMoeda, usePainel } from "./comum"

const FASES_INTERNAS = ["PLANEJAMENTO", "TERMO_REFERENCIA", "PESQUISA_PRECOS", "ANALISE_JURIDICA", "APROVACAO_INTERNA"]

export function ConcursoPainel({ licitacaoId, onAtualizado }: { licitacaoId: string; onAtualizado?: () => void }) {
  const base = `/api/concurso/licitacao/${licitacaoId}`
  const { dados, carregando, erro, executando, executar, recarregar } = usePainel<any>(`${API_URL}${base}`)
  const fase: string | undefined = dados?.licitacao?.fase
  const bancaUrl = fase === "ANALISE_PROPOSTAS" ? `${API_URL}${base}/banca` : null
  const banca = usePainel<any>(bancaUrl)
  const [reg, setReg] = useState<Valores>({})
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState("")

  useEffect(() => {
    if (dados) setReg(dados.regulamento ?? { natureza_trabalho: "TECNICO", tipo_retribuicao: "PREMIO", exige_cessao_direitos: true })
  }, [dados])
  useEffect(() => {
    const n: Record<string, string> = {}
    for (const x of banca.dados?.minhasNotas ?? []) n[`${x.trabalhoId}|${x.quesitoId}`] = String(x.nota)
    setNotas(n)
  }, [banca.dados])

  const ato = async (chave: string, caminho: string, body?: any, method = "POST") => {
    const r = await executar(chave, caminho, { body, method })
    if (r) onAtualizado?.()
    return r
  }
  const vencedorNaVez = useMemo(() => (dados?.classificacao ?? []).find((c: any) => c.qualificacao !== "NAO_QUALIFICADO") ?? null, [dados])

  if (carregando && !dados) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o concurso…</div>
  if (!dados) return <ErroPendencias erro={erro} />
  const interna = FASES_INTERNAS.includes(fase!)

  return (
    <Card>
      <CardHeader className="border-b bg-violet-50">
        <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4" /> Concurso — regulamento, banca e premiação</CardTitle>
        <CardDescription>
          Lei 14.133/2021, art. 30. Sigilo de autoria: os trabalhos aparecem só por código até a publicação do julgamento
          {dados.autoriaRevelada ? " (autoria já revelada)." : "."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <ErroPendencias erro={erro} />
        {interna && dados.pendenciasEdital?.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <p className="font-medium">Para publicar o edital do concurso:</p>
            <ul className="list-disc pl-4">{dados.pendenciasEdital.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Regulamento (art. 30)</h3>
          {interna ? (
            <>
              <FormRegulamentoConcurso valor={reg} onChange={setReg} />
              <Button size="sm" onClick={() => ato("reg", `${base}/regulamento`, reg, "PUT")} disabled={!!executando}>Salvar regulamento</Button>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              {reg.natureza_trabalho === "ARTISTICO" ? "Trabalho artístico" : reg.natureza_trabalho === "CIENTIFICO" ? "Trabalho científico" : "Trabalho técnico"} ·{" "}
              {reg.tipo_retribuicao === "REMUNERACAO" ? "remuneração" : "prêmio"} de {fmtMoeda(reg.valor_premio)}
              {reg.exige_cessao_direitos ? " · com cessão de direitos (art. 93)" : ""}
            </p>
          )}
        </section>
        {(interna || fase === "PUBLICADO" || fase === "ACOLHIMENTO_PROPOSTAS") && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Quesitos e banca (art. 37)</h3>
            <JulgamentoTecnicoConfig licitacaoId={licitacaoId} />
          </section>
        )}
        {!interna && (
          <p className="text-sm text-slate-600">
            Trabalhos inscritos: <b>{dados.totalTrabalhos}</b>
            {dados.inscricaoAberta ? " · inscrições abertas" : ""}
          </p>
        )}

        {fase === "ANALISE_PROPOSTAS" && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Julgamento da banca — trabalhos por código</h3>
            <ErroPendencias erro={banca.erro} />
            {banca.dados && (
              <>
                {!banca.dados.souMembro && <p className="text-xs text-slate-500">Você não integra a banca: só os membros atribuem notas.</p>}
                <div className="space-y-2">
                  {banca.dados.trabalhos.map((t: any) => (
                    <div key={t.id} className="rounded border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold">{t.codigo}</span>
                        <span className="flex-1 truncate">{t.titulo}</span>
                        <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/trabalhos/${t.id}/arquivo`)}>Abrir trabalho</Button>
                      </div>
                      {banca.dados.souMembro && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {banca.dados.quesitos.map((q: any) => (
                            <label key={q.id} className="text-xs">
                              {q.descricao} (0–{q.notaMaxima})
                              <input
                                type="number"
                                min={0}
                                max={q.notaMaxima}
                                step="0.01"
                                className={`${classeInput} w-24`}
                                value={notas[`${t.id}|${q.id}`] ?? ""}
                                onChange={(e) => setNotas({ ...notas, [`${t.id}|${q.id}`]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {banca.dados.souMembro && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!banca.executando}
                    onClick={() =>
                      banca.executar("notas", `${base}/banca/notas`, {
                        method: "PUT",
                        body: {
                          notas: Object.entries(notas)
                            .filter(([, v]) => v !== "")
                            .map(([k, v]) => {
                              const [trabalhoId, quesitoId] = k.split("|")
                              return { trabalhoId, quesitoId, nota: Number(v) }
                            }),
                        },
                      })
                    }
                  >
                    Salvar minhas notas
                  </Button>
                )}
                <div className="text-xs text-slate-500">
                  {banca.dados.progresso.map((p: any) => `${p.membro}: ${p.notas}/${p.esperadas}`).join(" · ")}
                </div>
                {banca.dados.pendencias.length > 0 && <p className="text-xs text-amber-700">{banca.dados.pendencias.join(" · ")}</p>}
              </>
            )}
            <Button size="sm" onClick={async () => { await ato("julgar", `${base}/julgar`); banca.recarregar() }} disabled={!!executando}>
              {executando === "julgar" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Publicar o julgamento (revela a autoria)
            </Button>
          </section>
        )}

        {dados.classificacao && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Classificação publicada</h3>
            {dados.classificacao.map((c: any) => (
              <div key={c.codigo} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                <span>{c.posicao}º <span className="font-mono">{c.codigo}</span> — {c.titulo} · {c.autor}</span>
                <span>nota {Number(c.notaTecnica).toFixed(2)}</span>
                <Badge variant="outline">{c.qualificacao === "QUALIFICADO" ? "qualificado" : c.qualificacao === "NAO_QUALIFICADO" ? "não qualificado" : "qualificação pendente"}</Badge>
                {c.trabalhoId && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/trabalhos/${c.trabalhoId}/identificacao`)}>Envelope de identificação</Button>}
              </div>
            ))}
            {fase === "JULGAMENTO" && vencedorNaVez && vencedorNaVez.qualificacao === "PENDENTE" && (
              <div className="flex flex-wrap items-center gap-2 rounded border border-violet-200 bg-violet-50 p-2 text-sm">
                <span>Conferir a qualificação de <b>{vencedorNaVez.codigo}</b> (art. 30, I):</span>
                <Button size="sm" onClick={() => ato("qualif", `${base}/trabalhos/${vencedorNaVez.trabalhoId}/qualificacao`, { qualificado: true })} disabled={!!executando}>Qualificado</Button>
                <input className={`${classeInput} max-w-xs`} placeholder="Motivo da não qualificação" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <Button size="sm" variant="destructive" onClick={() => ato("naoqualif", `${base}/trabalhos/${vencedorNaVez.trabalhoId}/qualificacao`, { qualificado: false, motivo })} disabled={!!executando}>
                  Não qualificado
                </Button>
              </div>
            )}
          </section>
        )}

        {dados.sessaoId && ["JULGAMENTO", "RECURSO", "ADJUDICACAO"].includes(fase!) && <RecursosPanel sessaoId={dados.sessaoId} />}

        {(dados.premiacoes ?? []).length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Premiação e cessão de direitos</h3>
            {dados.premiacoes.map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                <span>{fmtMoeda(p.valor)} · {p.status === "AGUARDANDO_CESSAO" ? "aguardando o aceite da cessão pelo vencedor" : p.status === "CESSAO_ACEITA" ? `cessão aceita ${fmtDataHora(p.cessaoAceitaEm)}` : "prêmio pago"}</span>
                <div className="flex gap-2">
                  {p.termoGeradoEm && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/premiacao/${p.id}/termo`)}>Termo</Button>}
                  {p.status === "CESSAO_ACEITA" && (
                    <Button size="sm" onClick={() => ato(`pag-${p.id}`, `${base}/premiacao/${p.id}/pagamento`, {})} disabled={!!executando}>Registrar pagamento do prêmio</Button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
        {fase === "HOMOLOGACAO" && (dados.premiacoes ?? []).length === 0 && (
          <Button size="sm" variant="outline" onClick={async () => { await ato("prem", `${base}/premiacao`); await recarregar() }}>Gerar premiação</Button>
        )}
      </CardContent>
    </Card>
  )
}
