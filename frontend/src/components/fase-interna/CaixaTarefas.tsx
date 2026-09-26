"use client"

/**
 * CAIXA DE TAREFAS (Entrega 2 — mockup Tarefas.dc.html). Tela inicial da
 * área de fase interna: as tarefas abertas do usuário, por prazo.
 *  - Abas: "Para mim" (minhas + do meu papel/setor), "Aguardando outros"
 *    (processos em que sou o agente — ou todo o órgão, para o administrador)
 *    e "Concluídas".
 *  - Cada tarefa leva direto à peça/etapa na tela do processo.
 *  - Atrasadas em destaque; coluna "Prazos da semana".
 * Fonte: GET /api/tarefas?aba=…; POST /api/tarefas/:id/assumir | /reatribuir.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Hand, Loader2, RefreshCw, UserRoundCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { API_URL, authFetch } from "@/lib/api"
import { avisarTarefasAtualizadas, fmtDia, fmtDiaCurto, rotuloPrazo, type CaixaTarefas as Caixa, type TarefaTela } from "@/lib/tarefas"

type Aba = "para-mim" | "aguardando" | "concluidas"

const ABAS: Array<{ chave: Aba; rotulo: string }> = [
  { chave: "para-mim", rotulo: "Para mim" },
  { chave: "aguardando", rotulo: "Aguardando outros" },
  { chave: "concluidas", rotulo: "Concluídas" },
]

interface UsuarioOrgao {
  id: string
  nome: string
  ativo: boolean
  papeis: string[]
}

export function CaixaTarefas() {
  const [aba, setAba] = useState<Aba>("para-mim")
  const [dados, setDados] = useState<Caixa | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [reatribuindo, setReatribuindo] = useState<TarefaTela | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const r = await authFetch(`${API_URL}/api/tarefas?aba=${aba}`)
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      setDados(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [aba])

  useEffect(() => { carregar() }, [carregar])

  const assumir = async (t: TarefaTela) => {
    setOcupada(t.id)
    try {
      const r = await authFetch(`${API_URL}/api/tarefas/${t.id}/assumir`, { method: "POST" })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      toast.success("Tarefa assumida — agora está com você")
      avisarTarefasAtualizadas()
      carregar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupada(null)
    }
  }

  const contagem = dados?.contagem
  const rotuloAba = (a: Aba) => {
    const base = ABAS.find((x) => x.chave === a)!.rotulo
    if (!contagem) return base
    if (a === "para-mim") return `${base} (${contagem.para_mim})`
    if (a === "aguardando") return `${base} (${contagem.aguardando})`
    return base
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Minhas tarefas</h1>
          <p className="text-sm text-slate-600">
            O que você tem para fazer na fase interna, pelo prazo. Cada tarefa abre a peça dentro do processo: faça aqui, anexe o PDF feito fora ou marque &quot;não se aplica&quot;.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`w-4 h-4 mr-1 ${carregando ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar
          </Button>
          <Button asChild size="sm">
            <Link href="/orgao/fase-interna/processos/novo">Novo processo</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Tarefas">
          <div role="tablist" aria-label="Abas da caixa de tarefas" className="flex gap-1 border-b mb-3 overflow-x-auto">
            {ABAS.map((a) => (
              <button
                key={a.chave}
                role="tab"
                aria-selected={aba === a.chave}
                onClick={() => setAba(a.chave)}
                className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
                  aba === a.chave ? "border-blue-700 text-blue-800" : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {rotuloAba(a.chave)}
              </button>
            ))}
          </div>

          {contagem && contagem.atrasadas > 0 && aba === "para-mim" && (
            <div className="mb-3 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900 flex items-center gap-2" role="status">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {contagem.atrasadas === 1 ? "1 tarefa atrasada." : `${contagem.atrasadas} tarefas atrasadas.`}
            </div>
          )}

          {carregando && !dados ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" aria-label="Carregando" /></div>
          ) : erro ? (
            <p className="text-sm text-red-700 py-6">Não foi possível carregar as tarefas: {erro}</p>
          ) : !dados?.tarefas.length ? (
            <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-600">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-700" aria-hidden="true" />
              {aba === "para-mim" ? "Nenhuma tarefa aberta para você." : aba === "aguardando" ? "Nada aguardando outras pessoas." : "Nenhuma tarefa concluída ainda."}
            </div>
          ) : (
            <ul className="space-y-2">
              {dados.tarefas.map((t) => (
                <ItemTarefa
                  key={t.id}
                  t={t}
                  ocupada={ocupada === t.id}
                  onAssumir={() => assumir(t)}
                  onReatribuir={() => setReatribuindo(t)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4" aria-label="Prazos da semana">
          <div className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
              <CalendarClock className="w-4 h-4" aria-hidden="true" /> Prazos da semana
            </h2>
            {!dados?.prazos_semana?.length ? (
              <p className="text-sm text-slate-600">Nenhum prazo nos próximos 7 dias.</p>
            ) : (
              <ul className="space-y-2">
                {dados.prazos_semana.map((p, i) => (
                  <li key={`${p.tarefa_id ?? p.licitacao_id}-${i}`} className="text-sm flex gap-2">
                    <span className={`font-mono text-xs pt-0.5 shrink-0 ${p.atrasada ? "text-orange-800 font-semibold" : "text-slate-600"}`}>{fmtDiaCurto(p.data)}</span>
                    <Link href={`/orgao/processos/${p.licitacao_id}`} className="text-slate-800 hover:underline">{p.titulo}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-slate-600 px-1">
            Os prazos contam em dias úteis pelo calendário do órgão. A configuração (modo simples ou por setor, prazos e papéis) fica em Configurações → Fase interna e tarefas.
          </p>
        </aside>
      </div>

      <ReatribuirDialog
        tarefa={reatribuindo}
        onFechar={() => setReatribuindo(null)}
        onFeito={() => {
          setReatribuindo(null)
          avisarTarefasAtualizadas()
          carregar()
        }}
      />
    </div>
  )
}

function ItemTarefa({ t, ocupada, onAssumir, onReatribuir }: { t: TarefaTela; ocupada: boolean; onAssumir: () => void; onReatribuir: () => void }) {
  const aberta = t.status === "ABERTA"
  const prazo = rotuloPrazo(t)
  return (
    <li className={`rounded-lg border bg-white p-3 flex gap-3 ${t.atrasada ? "border-orange-300" : ""}`}>
      <div className={`w-1 rounded-full shrink-0 ${t.atrasada ? "bg-orange-600" : aberta ? "bg-blue-700" : "bg-slate-300"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-slate-900">{t.titulo}</span>
          <span className="text-xs text-slate-600">Processo {t.processo.numero_processo}</span>
          {t.etapa_titulo && <span className="text-xs text-slate-500">· {t.etapa_titulo}</span>}
        </div>
        {t.processo.objeto && <p className="text-sm text-slate-700 truncate" title={t.processo.objeto}>{t.processo.objeto}</p>}
        <p className="text-xs text-slate-600 mt-0.5">
          Responsável: {t.responsavel.rotulo}
          {!aberta && t.status === "CONCLUIDA" && ` · concluída ${t.concluida_por_nome ? `por ${t.concluida_por_nome} ` : ""}em ${fmtDia(t.concluida_em)}`}
          {!aberta && t.status === "CANCELADA" && ` · cancelada em ${fmtDia(t.cancelada_em)}${t.motivo_cancelamento ? ` — ${t.motivo_cancelamento}` : ""}`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {aberta && (
          <span className={`text-xs ${t.atrasada ? "text-orange-800 font-semibold" : "text-slate-600"}`}>
            {t.atrasada && <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" aria-hidden="true" />}
            {prazo}
          </span>
        )}
        <div className="flex gap-1.5 flex-wrap justify-end">
          {t.pode_assumir && (
            <Button size="sm" variant="outline" onClick={onAssumir} disabled={ocupada} title="A tarefa é do seu papel/setor: assuma para ficar com ela">
              {ocupada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hand className="w-3.5 h-3.5 mr-1" aria-hidden="true" />} Assumir
            </Button>
          )}
          {t.pode_reatribuir && (
            <Button size="sm" variant="ghost" onClick={onReatribuir} title="Passar a tarefa para outra pessoa do órgão">
              <UserRoundCog className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Reatribuir
            </Button>
          )}
          <Button asChild size="sm" variant={aberta ? "default" : "outline"}>
            <Link href={t.destino}>
              {aberta ? (t.tipo === "PUBLICACAO" ? "Abrir publicação" : "Abrir peça") : "Ver processo"} <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </li>
  )
}

function ReatribuirDialog({ tarefa, onFechar, onFeito }: { tarefa: TarefaTela | null; onFechar: () => void; onFeito: () => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioOrgao[]>([])
  const [usuarioId, setUsuarioId] = useState("")
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!tarefa) return
    setUsuarioId("")
    setMotivo("")
    authFetch(`${API_URL}/api/fase-interna/configuracao/usuarios`)
      .then(async (r) => (r.ok ? setUsuarios(((await r.json()) as UsuarioOrgao[]).filter((u) => u.ativo)) : setUsuarios([])))
      .catch(() => setUsuarios([]))
  }, [tarefa])

  const enviar = async () => {
    if (!tarefa || !usuarioId) return
    setEnviando(true)
    try {
      const r = await authFetch(`${API_URL}/api/tarefas/${tarefa.id}/reatribuir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: usuarioId, motivo: motivo.trim() || undefined }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      toast.success("Tarefa reatribuída")
      onFeito()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={!!tarefa} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reatribuir tarefa</DialogTitle>
          <DialogDescription>{tarefa ? `${tarefa.titulo} — processo ${tarefa.processo.numero_processo}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="reatribuir-usuario">Passar para</Label>
            <select
              id="reatribuir-usuario"
              className="w-full border rounded-md h-9 px-2 text-sm bg-white"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
            >
              <option value="">Escolha a pessoa…</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reatribuir-motivo">Motivo (opcional — vai para o histórico)</Label>
            <Textarea id="reatribuir-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!usuarioId || enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Reatribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
