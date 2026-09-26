"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Gavel, Loader2, Lock } from "lucide-react"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { MensagensDispensa } from "./MensagensDispensa"
import { fmtMoeda, type AtoDisponivel, type MensagemDispensa, type ProcessoCompleto, type RegrasChat } from "./tipos"

interface Classificacao {
  em_sigilo: boolean
  itens: Array<{
    item_licitacao_id: string
    numero_item: number
    descricao: string
    status: string
    fornecedor_vencedor_id: string | null
    classificacao: Array<{ posicao: number; fornecedor_id: string; razao_social: string; valor_unitario: number }>
  }>
}

/**
 * ETAPA ATUAL DA DISPENSA ELETRÔNICA depois da publicação confirmada:
 *  - recebimento: só a QUANTIDADE de propostas (sigilo — Lei 14.133 art. 13
 *    par. único, I; IN 67 art. 13) e os avisos do órgão (IN 67 art. 10);
 *  - fim do prazo: etapa de lances (IN 67 art. 11, obrigatória antes do
 *    julgamento — art. 15), propostas com valores e o julgar (motivo do backend);
 *  - julgado: classificação por item (valor final) e a negociação PRIVADA com
 *    o vencedor (IN 67 art. 16).
 */
export function EtapaDispensa({
  licitacaoId,
  dados,
  mensagens,
  regras,
  onMensagem,
  onAtualizado,
}: {
  licitacaoId: string
  dados: ProcessoCompleto
  mensagens: MensagemDispensa[]
  regras: RegrasChat | null
  onMensagem: () => void
  onAtualizado: () => void
}) {
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
  const l = dados.licitacao
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const fimPrazo = l.data_fim_acolhimento || l.data_abertura_sessao
  const recebendo = !!fimPrazo && agora < new Date(fimPrazo)
  const lancesFim = l.dispensa_lances_fim ? new Date(l.dispensa_lances_fim) : null
  const lancesAberta = !!lancesFim && agora < lancesFim
  const julgado = dados.checklist.resultado_registrado
  const atoJulgar: AtoDisponivel | undefined = (dados.atos_disponiveis || []).find((a) => a.ato === "JULGAR_DISPENSA")
  const validas = dados.propostas.filter((p) => !["RASCUNHO", "CANCELADA"].includes(p.status))

  // Painel de lances (menor valor anônimo por item) — atualiza sozinho com a janela aberta
  const [painel, setPainel] = useState<any>(null)
  const carregarPainel = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/lances/painel`)
      if (res.ok) setPainel(await res.json())
    } catch { /* mantém */ }
  }, [licitacaoId])
  useEffect(() => {
    if (!lancesAberta) return
    carregarPainel()
    const t = setInterval(carregarPainel, 3000)
    return () => clearInterval(t)
  }, [lancesAberta, carregarPainel])

  // Classificação por item (depois do prazo; o backend devolve vazio em sigilo)
  const [classificacao, setClassificacao] = useState<Classificacao | null>(null)
  useEffect(() => {
    if (recebendo) return
    authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/classificacao`)
      .then(async (r) => (r.ok ? setClassificacao(await r.json()) : null))
      .catch(() => null)
  }, [licitacaoId, recebendo, dados])

  // Abrir a etapa de lances (IN SEGES 67/2021, art. 11 — 6 a 10 h)
  const [modalLances, setModalLances] = useState(false)
  const [duracao, setDuracao] = useState("360")
  const [prorrogacao, setProrrogacao] = useState("2")
  const [abrindo, setAbrindo] = useState(false)
  const abrirLances = async () => {
    setAbrindo(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/abrir-lances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duracao_minutos: Number(duracao) || 360, prorrogacao_minutos: Number(prorrogacao) || 0 }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setModalLances(false)
      toast.success(`Etapa de lances aberta até ${fmtBrasilia(j.dispensa_lances_fim)}.`)
      onAtualizado()
    } catch (e: any) {
      toast.error(`Erro ao abrir lances: ${e.message}`)
    } finally {
      setAbrindo(false)
    }
  }

  const [julgando, setJulgando] = useState(false)
  const julgar = async () => {
    if (!(await confirmar({
      titulo: julgado ? "Rejulgar as propostas" : "Julgar as propostas",
      mensagem: "Julgar por MENOR PREÇO unitário por item (valor final = proposta ou lance)? O vencedor de cada item é adjudicado; você revisa antes de homologar.",
      confirmarRotulo: "Julgar",
    }))) return
    setJulgando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/julgar-dispensa`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      const sem = j?.itens_sem_proposta?.length ? ` Itens sem proposta: ${j.itens_sem_proposta.join(", ")}.` : ""
      toast.success(`Julgamento concluído: ${j?.adjudicados?.length || 0} item(ns) adjudicado(s).${sem}`)
      onAtualizado()
    } catch (e: any) {
      toast.error(`Erro no julgamento: ${e.message}`)
    } finally {
      setJulgando(false)
    }
  }

  const desclassificar = async (propostaId: string, fornecedor: string) => {
    const motivo = await pedirTexto({
      titulo: "Desclassificar proposta",
      mensagem: `Desclassificar a proposta de ${fornecedor}? O motivo fica registrado no processo.`,
      rotulo: "Motivo",
      obrigatorio: true,
      confirmarRotulo: "Desclassificar",
      destrutivo: true,
    })
    if (!motivo) return
    try {
      const fd = new FormData()
      fd.append("motivo", motivo.trim())
      const res = await authFetch(`${API_URL}/api/propostas/${propostaId}/desclassificar`, { method: "PUT", body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || `HTTP ${res.status}`)
      }
      toast.success("Proposta desclassificada. Se já houve julgamento, rejulgue para recalcular os vencedores.")
      onAtualizado()
    } catch (e: any) {
      toast.error(`Erro ao desclassificar: ${e.message}`)
    }
  }

  // --- Recebimento de propostas -------------------------------------------
  if (recebendo) {
    return (
      <section aria-labelledby="titulo-recebimento" className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Etapa atual</p>
          <h2 id="titulo-recebimento" className="text-lg font-semibold">Recebimento de propostas e avisos aos fornecedores</h2>
          <p className="text-sm text-gray-700">Propostas até {fmtBrasilia(fimPrazo)} (horário de Brasília).</p>
        </div>
        <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-3">
          <Lock className="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            <b>{validas.length}</b> {validas.length === 1 ? "proposta recebida" : "propostas recebidas"}. Quem propôs e os valores ficam em
            sigilo até o fim do prazo (Lei 14.133/2021, art. 13, parágrafo único, I; IN SEGES 67/2021, art. 13).
          </p>
        </div>
        <MensagensDispensa licitacaoId={licitacaoId} mensagens={mensagens} regras={regras} onEnviado={onMensagem} />
      </section>
    )
  }

  // --- Lances / julgamento ------------------------------------------------
  return (
    <section aria-labelledby="titulo-julgamento" className="space-y-4">
      {dialogo}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Etapa atual</p>
          <h2 id="titulo-julgamento" className="text-lg font-semibold">
            {julgado ? "Julgamento e negociação com o vencedor" : lancesAberta ? "Etapa de lances" : "Etapa de lances e julgamento"}
          </h2>
          <p className="text-sm text-gray-700">
            {validas.length} {validas.length === 1 ? "proposta" : "propostas"} · prazo encerrado em {fmtBrasilia(fimPrazo)}
            {lancesFim ? ` · lances ${lancesAberta ? "até" : "encerrados em"} ${fmtBrasilia(lancesFim)}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!lancesFim && !julgado && validas.length > 0 && (
            <Button variant="outline" onClick={() => setModalLances(true)}>Abrir etapa de lances</Button>
          )}
          <Button onClick={julgar} disabled={julgando || (!!atoJulgar && !atoJulgar.disponivel) || (!atoJulgar && !julgado)}>
            {julgando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Gavel className="w-4 h-4 mr-1" aria-hidden="true" />}
            {julgado ? "Rejulgar (menor preço)" : "Julgar propostas (menor preço)"}
          </Button>
        </div>
      </div>
      {atoJulgar && !atoJulgar.disponivel && atoJulgar.pendencias?.length > 0 && (
        <p className="text-xs text-gray-700">Julgar: {atoJulgar.pendencias.join(" · ")}</p>
      )}

      {lancesAberta && painel?.itens?.length > 0 && (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Menor lance por item</caption>
            <thead className="bg-gray-50 text-gray-700 text-xs">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Item</th>
                <th scope="col" className="text-right px-3 py-2">Menor valor atual</th>
                <th scope="col" className="text-right px-3 py-2">Lances</th>
              </tr>
            </thead>
            <tbody>
              {painel.itens.map((it: any) => (
                <tr key={it.item_licitacao_id} className="border-t">
                  <td className="px-3 py-2">{it.numero_item} — {String(it.descricao || "").slice(0, 60)}</td>
                  <td className="px-3 py-2 text-right font-medium text-green-800">{it.menor_valor != null ? fmtMoeda(it.menor_valor) : "—"}</td>
                  <td className="px-3 py-2 text-right">{it.total_lances}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Classificação por item (valor final = proposta ou lance) */}
      {classificacao && !classificacao.em_sigilo && classificacao.itens.length > 0 && (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-left px-3 py-2 text-sm font-semibold">Classificação por item</caption>
            <thead className="bg-gray-50 text-gray-700 text-xs">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Item</th>
                <th scope="col" className="text-left px-3 py-2">Classificação (valor unitário final)</th>
                <th scope="col" className="text-left px-3 py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {classificacao.itens.map((it) => (
                <tr key={it.item_licitacao_id} className="border-t align-top">
                  <td className="px-3 py-2">{it.numero_item} — {String(it.descricao || "").slice(0, 60)}</td>
                  <td className="px-3 py-2">
                    {it.classificacao.length === 0 ? (
                      <span className="text-gray-600">Sem proposta</span>
                    ) : (
                      <ol className="space-y-0.5">
                        {it.classificacao.map((c) => (
                          <li key={c.fornecedor_id} className={c.fornecedor_id === it.fornecedor_vencedor_id ? "font-semibold text-green-800" : ""}>
                            {c.posicao}º {c.razao_social} — {fmtMoeda(c.valor_unitario)}
                            {c.fornecedor_id === it.fornecedor_vencedor_id && <span className="text-xs font-normal"> (vencedor)</span>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{it.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Propostas (valores visíveis depois do prazo) */}
      {!julgado && validas.length > 0 && (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-left px-3 py-2 text-sm font-semibold">Propostas recebidas</caption>
            <thead className="bg-gray-50 text-gray-700 text-xs">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Fornecedor</th>
                <th scope="col" className="text-right px-3 py-2">Valor global</th>
                <th scope="col" className="text-left px-3 py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {validas.map((p, i) => (
                <tr key={p.id ?? i} className="border-t">
                  <td className="px-3 py-2">{p.razao_social ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{p.valor_total_proposta != null ? fmtMoeda(p.valor_total_proposta) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className="mr-2">{p.status}</span>
                    {p.id && p.status !== "DESCLASSIFICADA" && (
                      <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => desclassificar(p.id!, p.razao_social || "fornecedor")}>
                        desclassificar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {julgado && (
        <a href={`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/ata`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-800 hover:underline">
          Ata da sessão (PDF)
        </a>
      )}

      <MensagensDispensa licitacaoId={licitacaoId} mensagens={mensagens} regras={regras} onEnviado={onMensagem} />

      <Dialog open={modalLances} onOpenChange={setModalLances}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir a etapa de lances</DialogTitle>
            <DialogDescription>
              IN SEGES 67/2021, art. 11: os fornecedores com proposta válida reduzem os próprios valores; o menor valor é público e anônimo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="duracao-lances" className="text-sm font-medium">Duração (minutos)</label>
              <Input id="duracao-lances" type="number" min={360} max={600} className="mt-1" value={duracao} onChange={(e) => setDuracao(e.target.value)} />
              <p className="text-xs text-gray-600 mt-1">De 360 a 600 minutos (6 a 10 horas).</p>
            </div>
            <div>
              <label htmlFor="prorrogacao-lances" className="text-sm font-medium">Prorrogação automática (minutos)</label>
              <Input id="prorrogacao-lances" type="number" min={0} className="mt-1" value={prorrogacao} onChange={(e) => setProrrogacao(e.target.value)} />
              <p className="text-xs text-gray-600 mt-1">Lance nos últimos N minutos prorroga a janela por mais N. 0 = encerra no horário.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalLances(false)} disabled={abrindo}>Cancelar</Button>
            <Button onClick={abrirLances} disabled={abrindo}>
              {abrindo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Abrir lances
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
