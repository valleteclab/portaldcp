"use client"

/**
 * REVOGAÇÃO / ANULAÇÃO EM DOIS TEMPOS (E7 — art. 71, §3º da Lei 14.133/2021).
 * 1º tempo: o órgão registra a intenção (motivo) e os licitantes são
 *   notificados para se manifestar no prazo (dias úteis do calendário do órgão).
 * 2º tempo: vencido o prazo, a autoridade pratica o ato (revogar/anular)
 *   considerando as manifestações.
 * Sem propostas, o backend aceita o ato direto (ou devolve as pendências).
 */

import { useCallback, useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Loader2, Ban, MessageSquare } from "lucide-react"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import {
  erroDeExcecao,
  fmtBrasilia,
  lerErro,
  type ErroBackend,
  type IntencaoExtincao,
} from "@/lib/publicacao"
import type { AtoDisponivel } from "./AtosProcesso"

type Tipo = "REVOGAR" | "ANULAR"

const ROTULO: Record<Tipo, { verbo: string; substantivo: string }> = {
  REVOGAR: { verbo: "Revogar", substantivo: "revogação" },
  ANULAR: { verbo: "Anular", substantivo: "anulação" },
}

const MIN_MOTIVO = 10

export function ExtincaoLicitacao({
  licitacaoId,
  atos,
  onAtualizado,
}: {
  licitacaoId: string
  atos: AtoDisponivel[] | undefined
  onAtualizado: () => void
}) {
  const [intencoes, setIntencoes] = useState<IntencaoExtincao[]>([])
  const [carregou, setCarregou] = useState(false)

  // Diálogos
  const [dlgIntencao, setDlgIntencao] = useState<Tipo | null>(null)
  const [dlgDesistir, setDlgDesistir] = useState(false)
  const [dlgAto, setDlgAto] = useState<Tipo | null>(null)
  const [motivo, setMotivo] = useState("")
  const [prazoDias, setPrazoDias] = useState("3")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<ErroBackend | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/extincao`)
      if (res.ok) {
        const j = await res.json()
        setIntencoes(Array.isArray(j) ? j : [])
      }
    } catch { /* card segue sem histórico */ }
    finally { setCarregou(true) }
  }, [licitacaoId])

  useEffect(() => { carregar() }, [carregar])

  const ato = (t: Tipo) => (atos || []).find((a) => a.ato === t)
  const atoIntencao = (t: Tipo) => (atos || []).find((a) => a.ato === `INTENCAO_${t}`)
  /** A intenção cabe se o ato (ou a própria intenção) está entre os atos da fase/situação. */
  const cabe = (t: Tipo) => !!ato(t) || !!atoIntencao(t)
  const temAtos = cabe("REVOGAR") || cabe("ANULAR")
  const aberta = intencoes.find((i) => i.status === "ABERTA") || null
  const historico = intencoes.filter((i) => i.status !== "ABERTA")

  if (!carregou) return null
  if (!temAtos && intencoes.length === 0) return null

  const abrirIntencao = (t: Tipo) => { setMotivo(""); setPrazoDias("3"); setErro(null); setDlgIntencao(t) }
  const abrirDesistir = () => { setMotivo(""); setErro(null); setDlgDesistir(true) }
  const abrirAto = (t: Tipo) => { setMotivo(aberta?.tipo === t ? aberta.motivo : ""); setErro(null); setDlgAto(t) }

  const executar = async (url: string, corpo: Record<string, unknown>, fechar: () => void, padrao: string) => {
    setEnviando(true)
    setErro(null)
    try {
      const res = await authFetch(url, { method: "POST", body: JSON.stringify(corpo) })
      if (!res.ok) {
        setErro(await lerErro(res, padrao))
        return
      }
      fechar()
      await carregar()
      onAtualizado()
    } catch (e) {
      setErro(erroDeExcecao(e))
    } finally {
      setEnviando(false)
    }
  }

  const registrarIntencao = () => {
    if (!dlgIntencao) return
    if (motivo.trim().length < MIN_MOTIVO) {
      setErro({ mensagem: `Fundamente a ${ROTULO[dlgIntencao].substantivo} (mínimo ${MIN_MOTIVO} caracteres).`, pendencias: [] })
      return
    }
    const dias = Number(prazoDias)
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) {
      setErro({ mensagem: "Prazo de manifestação: de 1 a 30 dias úteis.", pendencias: [] })
      return
    }
    executar(
      `${API_URL}/api/publicacao/licitacao/${licitacaoId}/intencao-extincao`,
      { tipo: dlgIntencao, motivo: motivo.trim(), prazo_dias_uteis: dias },
      () => setDlgIntencao(null),
      "Erro ao registrar a intenção",
    )
  }

  const desistir = () => {
    if (motivo.trim().length < MIN_MOTIVO) {
      setErro({ mensagem: `Informe o motivo da desistência (mínimo ${MIN_MOTIVO} caracteres).`, pendencias: [] })
      return
    }
    executar(
      `${API_URL}/api/publicacao/licitacao/${licitacaoId}/intencao-extincao/cancelar`,
      { motivo: motivo.trim() },
      () => setDlgDesistir(false),
      "Erro ao desistir da intenção",
    )
  }

  const praticarAto = () => {
    if (!dlgAto) return
    if (motivo.trim().length < MIN_MOTIVO) {
      setErro({ mensagem: `Fundamente a ${ROTULO[dlgAto].substantivo} (mínimo ${MIN_MOTIVO} caracteres).`, pendencias: [] })
      return
    }
    executar(
      `${API_URL}/api/licitacoes/${licitacaoId}/atos/${dlgAto}`,
      { motivo: motivo.trim() },
      () => setDlgAto(null),
      `Erro ao ${ROTULO[dlgAto].verbo.toLowerCase()}`,
    )
  }

  const manifestacoesDoAto = dlgAto && aberta?.tipo === dlgAto ? aberta.manifestacoes || [] : []

  return (
    <>
      <Card className="border-red-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-600" /> Revogação / anulação
            <span className="text-xs font-normal text-gray-400">art. 71, §3º — prévia manifestação dos licitantes</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {aberta ? (
            <div className="border rounded-md p-3 bg-red-50/40 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                    Intenção de {ROTULO[aberta.tipo].verbo.toLowerCase()}
                  </Badge>
                  {aberta.prazo_aberto ? (
                    <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      prazo de manifestação até {fmtBrasilia(aberta.prazo_fim)} ({aberta.prazo_dias_uteis} dias úteis)
                    </span>
                  ) : (
                    <span className="text-xs text-green-800 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                      prazo encerrado em {fmtBrasilia(aberta.prazo_fim)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={abrirDesistir}>Desistir</Button>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={!aberta.pode_praticar_ato}
                    title={aberta.pode_praticar_ato ? "" : "Disponível depois do fim do prazo de manifestação"}
                    onClick={() => abrirAto(aberta.tipo)}
                  >
                    {ROTULO[aberta.tipo].verbo}
                  </Button>
                </div>
              </div>
              <p><span className="text-gray-500">Motivo:</span> {aberta.motivo}</p>
              <p className="text-xs text-gray-500">
                Aberta em {fmtBrasilia(aberta.aberta_em)} · {aberta.licitantes_notificados ?? 0} licitante(s) notificado(s)
              </p>
              <ListaManifestacoes itens={aberta.manifestacoes || []} />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Com propostas recebidas, a revogação ou anulação começa pela <b>intenção</b>: os licitantes são
                notificados e têm prazo (dias úteis do calendário do órgão) para se manifestar. Sem propostas,
                o ato pode ser praticado direto.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["REVOGAR", "ANULAR"] as Tipo[]).filter(cabe).map((t) => {
                  const pend = atoIntencao(t)?.pendencias || []
                  return (
                    <Button
                      key={`i-${t}`}
                      size="sm"
                      variant="outline"
                      className="text-red-700 border-red-300"
                      title={pend.length ? `Pendências: ${pend.join(" · ")}` : "Notifica os licitantes e abre o prazo de manifestação"}
                      onClick={() => abrirIntencao(t)}
                    >
                      Intenção de {ROTULO[t].verbo.toLowerCase()}
                    </Button>
                  )
                })}
                {(["REVOGAR", "ANULAR"] as Tipo[]).filter((t) => ato(t)).map((t) => {
                  const a = ato(t)!
                  return (
                    <Button
                      key={`d-${t}`}
                      size="sm"
                      variant="ghost"
                      className="text-red-700"
                      title={a.disponivel ? "Ato direto (sem licitantes a notificar)" : `Pendências: ${a.pendencias.join(" · ")}`}
                      onClick={() => abrirAto(t)}
                    >
                      {ROTULO[t].verbo} direto
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          {historico.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-600">Histórico ({historico.length})</summary>
              <ul className="mt-1 space-y-1">
                {historico.map((i) => (
                  <li key={i.id} className="border-l-2 pl-2">
                    <span className="font-medium">{ROTULO[i.tipo].verbo}</span> —{" "}
                    {i.status === "CONCLUIDA" ? "ato praticado" : "intenção cancelada"}
                    {" "}({fmtBrasilia(i.concluida_em || i.aberta_em)}) · {i.motivo}
                    {i.motivo_cancelamento && <span className="text-gray-400"> · desistência: {i.motivo_cancelamento}</span>}
                    {" "}· {i.total_manifestacoes ?? 0} manifestação(ões)
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {/* 1º tempo: intenção */}
      <Dialog open={!!dlgIntencao} onOpenChange={(v) => !v && !enviando && setDlgIntencao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Intenção de {dlgIntencao ? ROTULO[dlgIntencao].verbo.toLowerCase() : ""} a licitação</DialogTitle>
            <DialogDescription>
              Os licitantes são notificados e podem se manifestar até o fim do prazo (art. 71, §3º). O ato só
              pode ser praticado depois disso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Motivo / fundamentação *</label>
              <Textarea rows={4} className="mt-1" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder={dlgIntencao === "ANULAR" ? "Ilegalidade identificada (insanável)…" : "Fato superveniente, razões de interesse público…"} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">Prazo para manifestação</label>
              <Input type="number" min={1} max={30} className="w-20 h-8" value={prazoDias} onChange={(e) => setPrazoDias(e.target.value)} />
              <span className="text-sm text-gray-500">dias úteis</span>
            </div>
            <ErroPendencias erro={erro} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgIntencao(null)} disabled={enviando}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={registrarIntencao} disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar e notificar licitantes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desistência */}
      <Dialog open={dlgDesistir} onOpenChange={(v) => !v && !enviando && setDlgDesistir(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Desistir da intenção</DialogTitle>
            <DialogDescription>O processo segue normalmente; a desistência fica registrada no histórico.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da desistência (obrigatório)" />
          <ErroPendencias erro={erro} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgDesistir(false)} disabled={enviando}>Voltar</Button>
            <Button onClick={desistir} disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Desistir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2º tempo: o ato */}
      <Dialog open={!!dlgAto} onOpenChange={(v) => !v && !enviando && setDlgAto(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlgAto ? ROTULO[dlgAto].verbo : ""} a licitação</DialogTitle>
            <DialogDescription>
              Ato da autoridade competente (art. 71). Fica registrado no histórico do processo e encerra a licitação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dlgAto && aberta?.tipo === dlgAto && (
              <div>
                <p className="text-sm font-medium mb-1">Manifestações dos licitantes</p>
                <ListaManifestacoes itens={manifestacoesDoAto} />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Motivo / fundamentação *</label>
              <Textarea rows={4} className="mt-1" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Fundamente o ato e, se houver, responda às manifestações" />
            </div>
            <ErroPendencias erro={erro} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgAto(null)} disabled={enviando}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={praticarAto} disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {dlgAto ? ROTULO[dlgAto].verbo : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ListaManifestacoes({ itens }: { itens: NonNullable<IntencaoExtincao["manifestacoes"]> }) {
  if (itens.length === 0) {
    return <p className="text-xs text-gray-400 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Nenhuma manifestação recebida.</p>
  }
  return (
    <ul className="space-y-1.5">
      {itens.map((m, i) => (
        <li key={m.id || i} className="text-xs bg-white border rounded p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{m.fornecedor_nome || "Licitante"}</span>
            <span className="text-gray-400">{fmtBrasilia(m.updated_at || m.created_at)}</span>
          </div>
          <p className="whitespace-pre-line text-gray-700 mt-0.5">{m.texto}</p>
        </li>
      ))}
    </ul>
  )
}
