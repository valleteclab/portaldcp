"use client"

/**
 * ETAPA 7 (parte da Procuradoria) — PARECER JURÍDICO COM DILIGÊNCIAS
 * (Entrega 3B; mockup Parecer). À esquerda, os AUTOS (peças na ordem, com as
 * folhas); à direita, o ROTEIRO de análise (art. 72, enquadramento do art. 75,
 * marca do art. 41, sigilo do art. 24, cláusulas do art. 92, vinculação ao
 * processo). Clicar num item ou numa diligência abre a peça na folha.
 * DILIGÊNCIA: vira tarefa do responsável pela peça-alvo; sanada (peça
 * corrigida em versão nova), o processo volta para a Procuradoria — nada
 * assinado depois é desfeito. O parecer (favorável, com ressalvas ou
 * desfavorável) é montado do roteiro e ASSINADO por quem tem o papel
 * Jurídico; ou anexado (feito fora). `?fase=EXTERNA`: parecer da fase
 * externa (depois da sessão, antes da adjudicação).
 * API: GET/PUT /api/fase-interna/:id/parecer, POST /parecer/diligencias[/:id/{sanar,reabrir,cancelar}],
 *      POST /parecer/emitir, POST /parecer/fase-externa/solicitar.
 */
import { useCallback, useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, FileText, Gavel, Loader2, MessageSquareWarning, PenLine } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { RascunhoIaFaixa } from "@/components/fase-interna/etapas/RascunhoIaFaixa"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { VisorDosAutos, type PecaAberta } from "@/components/fase-interna/etapas/VisorDosAutos"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { erroDaApi, fmtDia, rotaDaTela, telaDoTipo } from "@/lib/fase-interna/telas"
import { FASES_INTERNAS } from "@/lib/licitacao-rotulos"

interface Peca {
  documento_id: string
  tipo: string
  titulo: string
  versao: number
  status: string
  anexada: boolean
  numero_peca: string | null
  folha_inicial: number | null
  folha_final: number | null
  tem_arquivo: boolean
  secoes: Record<string, string>
  texto: string
}
interface ItemRoteiro {
  id: string
  ref: string
  texto: string
  tipos: string[]
  automatico: { situacao: string; detalhe: string }
  situacao: string
  observacao: string | null
  marcado_pela_procuradoria: boolean
  diligencias_abertas: number
}
interface DiligenciaTela {
  id: string
  tipo_alvo: string
  titulo_alvo: string
  descricao: string
  item_roteiro: string | null
  folha: number | null
  trecho: string | null
  status: "ABERTA" | "SANADA" | "CANCELADA"
  versao_alvo: number | null
  versao_atual: number | null
  corrigida: boolean
  resposta: string | null
  aberta_por_nome: string | null
  created_at: string
  sanada_por_nome: string | null
  sanada_em: string | null
}
interface ParecerTela {
  licitacao: { id: string; numero_processo: string; objeto: string; fase: string }
  fase: "PREVIA" | "EXTERNA"
  disponivel: boolean
  motivo: string | null
  fundamento_legal: { texto: string | null }
  autos: Peca[]
  roteiro: ItemRoteiro[]
  analise: { status: string; conclusao: string | null; fundamentacao: string | null; ressalvas: string | null; emitido_em: string | null; emitido_por_nome: string | null } | null
  diligencias: DiligenciaTela[]
  diligencias_abertas: number
  parecer: { documento_id: string; tipo: string; status: string; versao: number; anexada: boolean } | null
  conclusao_do_parecer: string | null
  conclusoes: Array<{ codigo: string; rotulo: string }>
  minutas_prontas: boolean
  pode_emitir: boolean
  tarefa_fase_externa: { id: string; status: string } | null
}

const COR: Record<string, { texto: string; cls: string }> = {
  CONFORME: { texto: "Conforme", cls: "bg-[#E3ECF5] text-[#1F4E79]" },
  ATENCAO: { texto: "Atenção", cls: "bg-amber-50 text-amber-900" },
  PENDENTE: { texto: "Pendente", cls: "bg-slate-100 text-slate-700" },
  DILIGENCIA: { texto: "Diligência", cls: "bg-[#FBEBDD] text-[#9A4308]" },
  RESSALVA: { texto: "Ressalva", cls: "bg-amber-50 text-amber-900" },
  NAO_SE_APLICA: { texto: "Não se aplica", cls: "bg-slate-50 text-slate-600" },
}

export default function ParecerPage() {
  const { id } = useParams() as { id: string }
  const busca = useSearchParams()
  const fase = (busca.get("fase") || "PREVIA").toUpperCase() === "EXTERNA" ? "EXTERNA" : "PREVIA"
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
  const [d, setD] = useState<ParecerTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)
  const [aberta, setAberta] = useState<PecaAberta | null>(null)
  const [conclusao, setConclusao] = useState("FAVORAVEL")
  const [fundamentacao, setFundamentacao] = useState("")
  const [ressalvas, setRessalvas] = useState("")
  const [novaDil, setNovaDil] = useState<{ tipo_alvo: string; descricao: string; item_roteiro: string; trecho: string } | null>(null)
  const [sanando, setSanando] = useState<DiligenciaTela | null>(null)
  const [resposta, setResposta] = useState("")
  const [semAlteracao, setSemAlteracao] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/parecer?fase=${fase}`)
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j: ParecerTela = await r.json()
      setD(j)
      setConclusao((c) => j.analise?.conclusao ?? c)
      setFundamentacao(j.analise?.fundamentacao ?? "")
      setRessalvas(j.analise?.ressalvas ?? "")
      setAberta((a) => a ?? (j.autos[0] ? { tipo: j.autos[0].tipo, folha: j.autos[0].folha_inicial, trecho: null } : null))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id, fase])
  useEffect(() => {
    carregar()
  }, [carregar])


  const chamar = async (metodo: string, rota: string, corpo: unknown, sucesso: string) => {
    setOcupado(true)
    setErroAcao(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/${rota}`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo ?? {}),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json().catch(() => null)
      if (j?.autos) setD(j)
      else await carregar()
      setAtualizacao((n) => n + 1)
      toast.success(sucesso)
      return true
    } catch (e) {
      // A recusa fica NA TELA (o aviso some e podia ficar coberto) — homologação E5
      const msg = e instanceof Error ? e.message : String(e)
      setErroAcao(msg)
      toast.error(msg)
      return false
    } finally {
      setOcupado(false)
    }
  }

  const marcar = (item: ItemRoteiro, situacao: string) =>
    chamar("PUT", "parecer", { fase, roteiro: { [item.id]: { situacao, observacao: item.observacao } } }, "Roteiro atualizado.")
  const observar = async (item: ItemRoteiro) => {
    const obs = await pedirTexto({ titulo: `Observação — ${item.ref}`, rotulo: "Observação (vai para o texto do parecer)", valorInicial: item.observacao ?? "" })
    if (obs === null) return
    await chamar("PUT", "parecer", { fase, roteiro: { [item.id]: { situacao: item.marcado_pela_procuradoria ? item.situacao : "CONFORME", observacao: obs } } }, "Observação registrada.")
  }
  const emitir = async () => {
    if (!(await confirmar({ titulo: "Assinar o parecer", mensagem: "O parecer é montado a partir do roteiro, das diligências e da conclusão, e assinado com o seu usuário.", confirmarRotulo: "Assinar parecer" }))) return
    await chamar("POST", "parecer/emitir", { fase, conclusao, fundamentacao, ressalvas }, "Parecer emitido e assinado.")
  }
  const salvarTexto = () => chamar("PUT", "parecer", { fase, conclusao, fundamentacao, ressalvas }, "Rascunho do parecer salvo.")

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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando o parecer" />
      </div>
    )
  }
  const tipoParecer = fase === "EXTERNA" ? "PJE" : "PJ"
  const emitido = d.parecer?.status === "ASSINADO" || d.parecer?.anexada
  // O processo ainda está na fase interna: o parecer desta tela é o PRÉVIO (art. 53); o da fase externa só existe depois da sessão
  const naFaseInterna = FASES_INTERNAS.includes(d.licitacao.fase)
  // Favorável com diligência aberta é recusado pelo backend: o botão já explica (homologação E5)
  const bloqueioAssinatura =
    conclusao === "FAVORAVEL" && d.diligencias_abertas > 0
      ? `Há ${d.diligencias_abertas} ${d.diligencias_abertas === 1 ? "diligência aberta" : "diligências abertas"}: aguarde o saneamento (ou cancele) antes do parecer favorável — ou escolha "favorável com ressalvas".`
      : null

  return (
    <EtapaShell
      licitacaoId={id}
      tela="parecer"
      titulo={fase === "EXTERNA" ? "Parecer jurídico da fase externa" : "Parecer jurídico prévio (fase interna)"}
      subtitulo={
        <span>
          {fase === "EXTERNA" ? "Depois da sessão, antes da adjudicação" : "Análise jurídica prévia da contratação — art. 53 c/c art. 72, III da Lei 14.133/2021"} · PA {d.licitacao.numero_processo}
          {fase === "EXTERNA" ? (
            <>
              {" · "}
              <Link className="text-blue-800 hover:underline" href="?fase=PREVIA">ver o parecer prévio</Link>
            </>
          ) : !naFaseInterna ? (
            <>
              {" · "}
              <Link className="text-blue-800 hover:underline" href="?fase=EXTERNA">ir para o parecer da fase externa</Link>
            </>
          ) : null}
        </span>
      }
      atualizacao={atualizacao}
      acoes={
        d.pode_emitir && d.disponivel ? (
          <>
            <Button variant="outline" disabled={ocupado} onClick={() => { setErroAcao(null); setNovaDil({ tipo_alvo: aberta?.tipo ?? d.autos[0]?.tipo ?? "", descricao: "", item_roteiro: "", trecho: "" }) }}>
              <MessageSquareWarning className="w-4 h-4 mr-1" /> Devolver com diligência
            </Button>
            <Button disabled={ocupado || !!bloqueioAssinatura} onClick={emitir} title={bloqueioAssinatura ?? "Monta o parecer do roteiro e assina com o seu usuário"}>
              {ocupado ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PenLine className="w-4 h-4 mr-1" />} Assinar parecer
            </Button>
          </>
        ) : null
      }
    >
      {dialogo}
      {erroAcao && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 flex items-start justify-between gap-2" role="alert">
          <span>
            <b>Não foi possível concluir:</b> {erroAcao}
          </span>
          <button type="button" className="text-xs underline shrink-0" onClick={() => setErroAcao(null)}>
            fechar
          </button>
        </div>
      )}
      {fase === "PREVIA" && naFaseInterna && (
        <RascunhoIaFaixa
          licitacaoId={id}
          peca="PJ"
          somenteLeitura={!d.pode_emitir || !d.disponivel || !!emitido}
          atualizacao={atualizacao}
          rotuloAceitar="Usar a minuta como base"
          explicacaoAceite="Usar como base preenche a fundamentação e as ressalvas só se estiverem vazias. A conclusão é sua: escolha abaixo e assine."
          onAceito={async () => {
            // o que o jurista já digitou (e ainda não salvou) fica
            const f = fundamentacao
            const r = ressalvas
            await carregar()
            if (f.trim()) setFundamentacao(f)
            if (r.trim()) setRessalvas(r)
            setAtualizacao((n) => n + 1)
          }}
        />
      )}
      {bloqueioAssinatura && d.pode_emitir && d.disponivel && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
          {bloqueioAssinatura}
        </div>
      )}
      {!d.disponivel && (
        <div className="rounded-lg border bg-slate-50 px-4 py-2.5 text-sm text-gray-800 flex items-center justify-between gap-2 flex-wrap" role="status">
          <span>{d.motivo}</span>
        </div>
      )}
      {fase === "EXTERNA" && d.disponivel && !d.tarefa_fase_externa && !emitido && (
        <div className="rounded-lg border bg-blue-50 px-4 py-2.5 text-sm text-blue-900 flex items-center justify-between gap-2 flex-wrap">
          <span>O parecer da fase externa não foi pedido. Peça à Procuradoria (vira tarefa dela).</span>
          <Button size="sm" disabled={ocupado} onClick={() => chamar("POST", "parecer/fase-externa/solicitar", {}, "Pedido enviado à Procuradoria.")}>
            <Gavel className="w-4 h-4 mr-1" /> Pedir o parecer
          </Button>
        </div>
      )}
      {fase === "PREVIA" && !d.minutas_prontas && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          O parecer analisa as minutas: o relatório do agente e as minutas ainda não estão prontos (<Link className="underline" href={`/orgao/processos/${id}/fase-interna/minutas`}>abrir as minutas</Link>).
        </div>
      )}
      {!d.pode_emitir && d.disponivel && (
        <p className="text-xs text-gray-600">Você acompanha a análise. Só quem tem o papel <b>Jurídico</b> abre diligência e assina o parecer — o parecer feito fora pode ser anexado abaixo.</p>
      )}
      {d.parecer && (
        <div className={`rounded-lg border px-4 py-2 text-sm ${emitido ? "bg-green-50 border-green-200 text-green-900" : "bg-slate-50 text-gray-800"}`}>
          Parecer {d.parecer.anexada ? "anexado (feito fora)" : emitido ? "assinado" : d.parecer.status.replaceAll("_", " ").toLowerCase()} · versão {d.parecer.versao}
          {d.conclusao_do_parecer && ` · ${d.conclusoes.find((c) => c.codigo === d.conclusao_do_parecer)?.rotulo ?? d.conclusao_do_parecer}`}
          {d.analise?.emitido_por_nome && ` · ${d.analise.emitido_por_nome}, ${fmtDia(d.analise.emitido_em)}`}
        </div>
      )}

      {/* Homologação: o roteiro ficava espremido ao lado do visor (44rem fixos) — agora metade/metade no xl e empilhado abaixo */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* AUTOS (visor comum — Entrega 4 o reaproveita na conformidade) */}
        <VisorDosAutos autos={d.autos} aberta={aberta} onAbrir={setAberta} />

        {/* ROTEIRO */}
        <main className="space-y-4 min-w-0">
          <section aria-label="Roteiro de análise" className="rounded-lg border bg-white">
            <h2 className="px-4 pt-3 pb-2 font-serif text-xl font-semibold text-gray-900">Roteiro de análise</h2>
            <ul>
              {d.roteiro.map((i) => (
                <li key={i.id} className="flex flex-wrap gap-x-3 gap-y-1.5 px-4 py-2.5 border-t items-start">
                  <span className="w-20 shrink-0 font-mono text-xs text-gray-600 pt-0.5 break-words">{i.ref}</span>
                  <button
                    type="button"
                    className="flex-1 min-w-[12rem] text-left text-sm hover:underline"
                    onClick={() => {
                      const tipo = i.tipos.find((t) => d.autos.some((p) => p.tipo === t))
                      if (tipo) setAberta({ tipo, folha: d.autos.find((p) => p.tipo === tipo)?.folha_inicial ?? null, trecho: null })
                    }}
                    title="Abrir a peça"
                  >
                    {i.texto}
                    <span className="block text-xs text-gray-600">{i.observacao ?? i.automatico.detalhe}</span>
                  </button>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${COR[i.situacao]?.cls ?? ""}`}>{COR[i.situacao]?.texto ?? i.situacao}</span>
                  {d.pode_emitir && d.disponivel && (
                    <div className="shrink-0 flex flex-row sm:flex-col items-center sm:items-stretch gap-1">
                      <select
                        aria-label={`Situação de ${i.ref}`}
                        className="h-7 text-xs border rounded px-1"
                        value={i.marcado_pela_procuradoria ? i.situacao : ""}
                        onChange={(e) => e.target.value && marcar(i, e.target.value)}
                        disabled={ocupado}
                      >
                        <option value="">automático</option>
                        <option value="CONFORME">Conforme</option>
                        <option value="RESSALVA">Ressalva</option>
                        <option value="NAO_SE_APLICA">Não se aplica</option>
                        <option value="PENDENTE">Pendente</option>
                      </select>
                      <button type="button" className="text-[11px] text-blue-800 hover:underline" onClick={() => observar(i)}>observação</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Diligências" className="rounded-lg border bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Diligências {d.diligencias_abertas ? `(${d.diligencias_abertas} aberta${d.diligencias_abertas > 1 ? "s" : ""})` : ""}</h2>
            {!d.diligencias.length && <p className="text-sm text-gray-600">Nenhuma diligência.</p>}
            <ul className="space-y-2">
              {d.diligencias.map((x) => (
                <li key={x.id} className="rounded border p-2 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button type="button" className="font-medium text-left hover:underline" onClick={() => setAberta({ tipo: x.tipo_alvo, folha: x.folha, trecho: x.trecho })}>
                      {x.titulo_alvo}
                      {x.folha != null && <span className="font-mono text-xs text-gray-600"> · fl. {x.folha}</span>}
                    </button>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${x.status === "ABERTA" ? COR.DILIGENCIA.cls : x.status === "SANADA" ? COR.CONFORME.cls : COR.NAO_SE_APLICA.cls}`}>
                      {x.status === "ABERTA" ? "Aberta" : x.status === "SANADA" ? "Sanada" : "Cancelada"}
                    </span>
                  </div>
                  <p className="text-gray-800">{x.descricao}</p>
                  {x.trecho && <p className="text-xs text-gray-600">Trecho: “{x.trecho}”</p>}
                  <p className="text-xs text-gray-600">
                    {x.aberta_por_nome ?? "Procuradoria"}, {fmtDia(x.created_at)} · peça na versão {x.versao_alvo ?? "—"}
                    {x.versao_atual && x.versao_atual !== x.versao_alvo ? ` → agora v${x.versao_atual}` : ""}
                    {x.status === "SANADA" && ` · sanada por ${x.sanada_por_nome ?? "—"} em ${fmtDia(x.sanada_em)}${x.resposta ? `: ${x.resposta}` : ""}`}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {x.status === "ABERTA" && (
                      <Button size="sm" variant="outline" className="h-7" disabled={ocupado} onClick={() => { setErroAcao(null); setSanando(x); setResposta(""); setSemAlteracao(false) }}>
                        Sanar
                      </Button>
                    )}
                    {x.status === "SANADA" && d.pode_emitir && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={ocupado}
                        onClick={async () => {
                          const m = await pedirTexto({ titulo: "Reabrir a diligência", rotulo: "Por que continua pendente?", obrigatorio: true, minimo: 10 })
                          if (m) await chamar("POST", `parecer/diligencias/${x.id}/reabrir`, { motivo: m }, "Diligência reaberta.")
                        }}
                      >
                        Reabrir
                      </Button>
                    )}
                    {x.status === "ABERTA" && d.pode_emitir && (
                      <Button size="sm" variant="ghost" className="h-7" disabled={ocupado} onClick={() => chamar("POST", `parecer/diligencias/${x.id}/cancelar`, { motivo: "Cancelada pela Procuradoria" }, "Diligência cancelada.")}>
                        Cancelar
                      </Button>
                    )}
                    {/* A tela da peça também mostra a diligência e o "Sanar" (homologação) */}
                    <Link
                      className="text-xs text-blue-800 hover:underline self-center"
                      href={telaDoTipo(x.tipo_alvo) ? rotaDaTela(id, telaDoTipo(x.tipo_alvo)!) : `/orgao/processos/${id}#peca-${x.tipo_alvo}`}
                    >
                      abrir a peça
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {d.pode_emitir && d.disponivel && (
            <section aria-label="Conclusão" className="rounded-lg border bg-white p-4 space-y-2">
              <Label htmlFor="conclusao" className="font-semibold">Conclusão</Label>
              <select id="conclusao" className="w-full h-11 border rounded-md px-3 text-sm" value={conclusao} onChange={(e) => setConclusao(e.target.value)}>
                {d.conclusoes.map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>
                ))}
              </select>
              <Label htmlFor="fund">Fundamentação</Label>
              <Textarea id="fund" rows={3} value={fundamentacao} onChange={(e) => setFundamentacao(e.target.value)} placeholder="Obrigatória no desfavorável." />
              <Label htmlFor="ress">Ressalvas</Label>
              <Textarea id="ress" rows={2} value={ressalvas} onChange={(e) => setRessalvas(e.target.value)} placeholder="Condições para o prosseguimento (favorável com ressalvas)." />
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" disabled={ocupado} onClick={salvarTexto}>Salvar rascunho</Button>
                <Button size="sm" disabled={ocupado || !!bloqueioAssinatura} onClick={emitir} title={bloqueioAssinatura ?? undefined}><PenLine className="w-4 h-4 mr-1" /> Assinar parecer</Button>
              </div>
              <p className="text-xs text-gray-600">O texto do parecer é montado a partir deste roteiro. Cada diligência vira tarefa do responsável pela peça e o processo volta à Procuradoria quando sanada.</p>
            </section>
          )}

          <CaminhosDaPeca
            licitacaoId={id}
            tipo={tipoParecer}
            titulo={fase === "EXTERNA" ? "Parecer da fase externa" : "Parecer jurídico"}
            fazerAqui="analisar pelo roteiro e assinar"
            atualizacao={atualizacao}
            permitirAssinatura={false}
            compacto
            onAtualizado={() => {
              carregar()
              setAtualizacao((n) => n + 1)
            }}
          />
        </main>
      </div>

      <Dialog open={!!novaDil} onOpenChange={(v) => !v && setNovaDil(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Devolver com diligência</DialogTitle>
            <DialogDescription>Vira tarefa do responsável pela peça. O processo volta para ela sem desfazer nada assinado depois; quando sanada, volta para a Procuradoria.</DialogDescription>
          </DialogHeader>
          {novaDil && (
            <div className="space-y-2">
              <Label htmlFor="alvo">Peça a corrigir</Label>
              <select id="alvo" className="w-full h-10 border rounded-md px-2 text-sm" value={novaDil.tipo_alvo} onChange={(e) => setNovaDil({ ...novaDil, tipo_alvo: e.target.value })}>
                {d.autos.map((p) => (
                  <option key={p.tipo} value={p.tipo}>{p.tipo} — {p.titulo}{p.folha_inicial != null ? ` (fl. ${p.folha_inicial})` : ""}</option>
                ))}
              </select>
              <Label htmlFor="item">Item do roteiro (opcional)</Label>
              <select id="item" className="w-full h-10 border rounded-md px-2 text-sm" value={novaDil.item_roteiro} onChange={(e) => setNovaDil({ ...novaDil, item_roteiro: e.target.value })}>
                <option value="">—</option>
                {d.roteiro.map((i) => (
                  <option key={i.id} value={i.id}>{i.ref} — {i.texto}</option>
                ))}
              </select>
              <Label htmlFor="desc">O que corrigir</Label>
              <Textarea id="desc" rows={3} value={novaDil.descricao} onChange={(e) => setNovaDil({ ...novaDil, descricao: e.target.value })} placeholder="Ex.: a minuta deve referenciar o PA deste processo e a dispensa correta." />
              <Label htmlFor="trecho">Trecho (opcional — destacado na peça)</Label>
              <Input id="trecho" value={novaDil.trecho} onChange={(e) => setNovaDil({ ...novaDil, trecho: e.target.value })} />
            </div>
          )}
          {erroAcao && <p className="text-sm text-red-700" role="alert">{erroAcao}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaDil(null)} disabled={ocupado}>Cancelar</Button>
            <Button
              disabled={ocupado}
              onClick={async () => {
                if (!novaDil) return
                const ok = await chamar("POST", "parecer/diligencias", { fase, ...novaDil, item_roteiro: novaDil.item_roteiro || null }, "Diligência aberta — tarefa criada para o responsável.")
                if (ok) setNovaDil(null)
              }}
            >
              {ocupado && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Abrir diligência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sanando} onOpenChange={(v) => !v && setSanando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sanar a diligência — {sanando?.titulo_alvo}</DialogTitle>
            <DialogDescription>
              Corrija a peça antes (nova versão feita aqui ou anexada). Se não houver o que alterar, responda com o esclarecimento. O processo volta para a Procuradoria.
            </DialogDescription>
          </DialogHeader>
          {sanando && (
            <div className="space-y-2 text-sm">
              <p className="text-gray-800">{sanando.descricao}</p>
              <p className={sanando.corrigida ? "text-green-800" : "text-amber-800"}>
                {sanando.corrigida ? `A peça já tem versão nova (v${sanando.versao_atual}).` : "A peça ainda está na mesma versão."}{" "}
                <Link className="text-blue-800 hover:underline" href={`/orgao/processos/${id}#peca-${sanando.tipo_alvo}`}>
                  <FileText className="inline w-3.5 h-3.5" /> corrigir a peça
                </Link>
              </p>
              <Label htmlFor="resp">Resposta à Procuradoria</Label>
              <Textarea id="resp" rows={3} value={resposta} onChange={(e) => setResposta(e.target.value)} />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={semAlteracao} onChange={(e) => setSemAlteracao(e.target.checked)} /> Não há o que alterar (esclarecimento)
              </label>
            </div>
          )}
          {erroAcao && <p className="text-sm text-red-700" role="alert">{erroAcao}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSanando(null)} disabled={ocupado}>Cancelar</Button>
            <Button
              disabled={ocupado}
              onClick={async () => {
                if (!sanando) return
                const ok = await chamar("POST", `parecer/diligencias/${sanando.id}/sanar`, { resposta, sem_alteracao: semAlteracao }, "Diligência sanada — o processo voltou para a Procuradoria.")
                if (ok) setSanando(null)
              }}
            >
              Sanar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EtapaShell>
  )
}
