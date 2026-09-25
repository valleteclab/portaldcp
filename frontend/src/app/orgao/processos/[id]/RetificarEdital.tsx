"use client"

/**
 * EDITAL PUBLICADO + RETIFICAÇÃO (E7 — art. 55, §1º da Lei 14.133/2021).
 * Mostra a versão vigente, o histórico de versões e de retificações e, nas
 * fases em que cabe, o formulário de retificação: nova versão em PDF, motivo,
 * o que mudou e se a alteração afeta a formulação das propostas (se afetar,
 * o prazo mínimo é recontado e as propostas já enviadas aguardam confirmação).
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
import { Loader2, FileText, FilePen, History } from "lucide-react"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { PainelPrazos } from "./PublicacaoEdital"
import {
  abrirArquivoEdital,
  consultarPrazos,
  erroDeExcecao,
  fmtBrasilia,
  inputLocalParaISO,
  isoParaInputLocal,
  lerErro,
  sugestaoAPartirDoMinimo,
  type EditalDaLicitacao,
  type ErroBackend,
  type PrazosPublicacao,
} from "@/lib/publicacao"

export const FASES_RETIFICACAO = ["PUBLICADO", "IMPUGNACAO", "ACOLHIMENTO_PROPOSTAS", "ANALISE_PROPOSTAS"]

interface DatasAtuais {
  data_limite_impugnacao?: string | null
  data_inicio_acolhimento?: string | null
  data_fim_acolhimento?: string | null
  data_abertura_sessao?: string | null
}

const MIN_TEXTO = 10

export function RetificarEdital({
  licitacaoId,
  podeRetificar,
  datas,
  onAtualizado,
}: {
  licitacaoId: string
  podeRetificar: boolean
  datas: DatasAtuais
  onAtualizado: () => void
}) {
  const [edital, setEdital] = useState<EditalDaLicitacao | null>(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)

  const [aberto, setAberto] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [motivo, setMotivo] = useState("")
  const [alteracoes, setAlteracoes] = useState("")
  const [afeta, setAfeta] = useState<"" | "SIM" | "NAO">("")
  const [justificativa, setJustificativa] = useState("")
  const [crono, setCrono] = useState({ data_limite_impugnacao: "", data_inicio_acolhimento: "", data_fim_acolhimento: "", data_abertura_sessao: "" })
  const [prazos, setPrazos] = useState<PrazosPublicacao | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<ErroBackend | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/edital`)
      if (res.ok) setEdital(await res.json())
    } catch { /* histórico fica oculto */ }
  }, [licitacaoId])

  useEffect(() => { carregar() }, [carregar])

  // Prazo mínimo republicado (só quando a alteração afeta as propostas)
  useEffect(() => {
    if (!aberto || afeta !== "SIM") return
    let cancelado = false
    setCalculando(true)
    const t = setTimeout(async () => {
      try {
        const p = await consultarPrazos(licitacaoId, {
          data_publicacao_edital: new Date().toISOString(),
          data_limite_impugnacao: inputLocalParaISO(crono.data_limite_impugnacao),
          data_inicio_acolhimento: inputLocalParaISO(crono.data_inicio_acolhimento),
          data_fim_acolhimento: inputLocalParaISO(crono.data_fim_acolhimento),
          data_abertura_sessao: inputLocalParaISO(crono.data_abertura_sessao),
        })
        if (!cancelado) setPrazos(p)
      } catch { if (!cancelado) setPrazos(null) }
      finally { if (!cancelado) setCalculando(false) }
    }, 400)
    return () => { cancelado = true; clearTimeout(t) }
  }, [aberto, afeta, crono, licitacaoId])

  const abrir = () => {
    setArquivo(null)
    setMotivo("")
    setAlteracoes("")
    setAfeta("")
    setJustificativa("")
    setCrono({
      data_limite_impugnacao: "",
      data_inicio_acolhimento: "",
      data_fim_acolhimento: isoParaInputLocal(datas.data_fim_acolhimento),
      data_abertura_sessao: isoParaInputLocal(datas.data_abertura_sessao),
    })
    setPrazos(null)
    setErro(null)
    setAberto(true)
  }

  const abrirPdf = async (documentoId: string) => {
    setErroArquivo(null)
    try {
      await abrirArquivoEdital(licitacaoId, documentoId)
    } catch (e: any) {
      setErroArquivo(e.message || "Não foi possível abrir o edital")
    }
  }

  const enviar = async () => {
    const faltando: string[] = []
    if (!arquivo) faltando.push("Anexe o PDF da nova versão do edital.")
    if (motivo.trim().length < MIN_TEXTO) faltando.push(`Informe o motivo (mínimo ${MIN_TEXTO} caracteres).`)
    if (alteracoes.trim().length < MIN_TEXTO) faltando.push(`Descreva o que foi alterado (mínimo ${MIN_TEXTO} caracteres).`)
    if (!afeta) faltando.push("Informe se a alteração afeta a formulação das propostas.")
    if (afeta === "SIM" && (!crono.data_fim_acolhimento || !crono.data_abertura_sessao)) {
      faltando.push("Alteração que afeta as propostas exige novo cronograma (fim do recebimento e abertura).")
    }
    if (afeta === "NAO" && justificativa.trim().length < MIN_TEXTO) {
      faltando.push(`Justifique por que a alteração não afeta as propostas (mínimo ${MIN_TEXTO} caracteres).`)
    }
    if (faltando.length) {
      setErro({ mensagem: faltando.join(" "), pendencias: faltando })
      return
    }

    // Cronograma: obrigatório se afeta; se não afeta, só quando houver adiamento
    const cronograma: Record<string, string> = {}
    for (const [k, v] of Object.entries(crono)) {
      const iso = inputLocalParaISO(v)
      if (!iso) continue
      if (afeta === "NAO") {
        const atual = isoParaInputLocal((datas as any)[k])
        if (v === atual) continue
      }
      cronograma[k] = iso
    }

    setEnviando(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append("arquivo", arquivo!)
      fd.append("motivo", motivo.trim())
      fd.append("alteracoes", alteracoes.trim())
      fd.append("afeta_propostas", afeta === "SIM" ? "true" : "false")
      if (afeta === "NAO") fd.append("justificativa_nao_afeta", justificativa.trim())
      if (Object.keys(cronograma).length) fd.append("cronograma", JSON.stringify(cronograma))
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/retificar`, { method: "POST", body: fd })
      if (!res.ok) {
        setErro(await lerErro(res, "Erro ao retificar o edital"))
        return
      }
      setAberto(false)
      await carregar()
      onAtualizado()
    } catch (e) {
      setErro(erroDeExcecao(e))
    } finally {
      setEnviando(false)
    }
  }

  const vigente = edital?.vigente
  const versoes = edital?.versoes || []
  const retificacoes = edital?.retificacoes || []
  if (!vigente && versoes.length === 0 && retificacoes.length === 0 && !podeRetificar) return null

  const campo = (k: keyof typeof crono, rotulo: string) => (
    <div>
      <label className="text-xs text-gray-600">{rotulo}</label>
      <Input
        type="datetime-local"
        className="mt-1 h-9"
        value={crono[k]}
        onChange={(e) => setCrono((c) => ({ ...c, [k]: e.target.value }))}
      />
    </div>
  )

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Edital
              {vigente && <Badge variant="outline">v{vigente.versao}</Badge>}
              {retificacoes.length > 0 && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                  {retificacoes.length} retificação(ões)
                </Badge>
              )}
            </CardTitle>
            {podeRetificar && (
              <Button size="sm" variant="outline" onClick={abrir}>
                <FilePen className="w-4 h-4 mr-1" /> Retificar edital
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {vigente ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-500">Vigente:</span>
              <button type="button" className="text-blue-600 hover:underline" onClick={() => abrirPdf(vigente.documento_id)}>
                {vigente.nome || `Edital v${vigente.versao}`}
              </button>
              {vigente.hash && (
                <span className="text-[11px] text-gray-400 font-mono" title={`SHA-256: ${vigente.hash}`}>hash {vigente.hash.slice(0, 12)}…</span>
              )}
            </div>
          ) : (
            <p className="text-gray-400">Nenhum PDF de edital registrado.</p>
          )}
          {erroArquivo && <p className="text-xs text-red-600">{erroArquivo}</p>}

          {retificacoes.length > 0 && (
            <div className="border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-1.5">Nº</th>
                    <th className="text-left px-3 py-1.5">Divulgada em</th>
                    <th className="text-left px-3 py-1.5">Motivo / alterações</th>
                    <th className="text-left px-3 py-1.5">Afeta propostas</th>
                    <th className="text-right px-3 py-1.5">Notificadas</th>
                  </tr>
                </thead>
                <tbody>
                  {retificacoes.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="px-3 py-1.5">{r.numero}ª</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtBrasilia(r.data_divulgacao)}</td>
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{r.motivo}</div>
                        <div className="text-gray-500 whitespace-pre-line">{r.alteracoes}</div>
                        {!r.afeta_propostas && r.justificativa_nao_afeta && (
                          <div className="text-gray-400 italic">Não afeta: {r.justificativa_nao_afeta}</div>
                        )}
                        {r.documento_id && (
                          <button type="button" className="text-blue-600 hover:underline" onClick={() => abrirPdf(r.documento_id!)}>
                            PDF{r.versao_edital ? ` v${r.versao_edital}` : ""}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.afeta_propostas
                          ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">sim — prazo reaberto</Badge>
                          : <Badge variant="outline">não</Badge>}
                      </td>
                      <td className="px-3 py-1.5 text-right">{r.propostas_notificadas ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {versoes.length > 1 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-600 flex items-center gap-1">
                <History className="w-3.5 h-3.5 inline" /> Versões do edital ({versoes.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {versoes.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">v{v.versao}</span>
                    <button type="button" className="text-blue-600 hover:underline" onClick={() => abrirPdf(v.id)}>
                      {v.nome_original || v.titulo || v.tipo}
                    </button>
                    <Badge variant="outline" className="text-[10px]">{v.status}</Badge>
                    {v.hash && <span className="font-mono text-gray-400">{v.hash.slice(0, 12)}…</span>}
                    <span className="text-gray-400">{fmtBrasilia(v.data_publicacao || v.created_at)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={(v) => !v && !enviando && setAberto(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Retificar edital (art. 55, §1º)</DialogTitle>
            <DialogDescription>
              A nova versão é divulgada pelos mesmos meios do edital original e os licitantes são avisados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">PDF da nova versão do edital *</label>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                className="mt-1"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Motivo *</label>
              <Textarea rows={2} className="mt-1" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="ex.: acolhimento da impugnação nº 1 quanto à exigência de atestado" />
            </div>
            <div>
              <label className="text-sm font-medium">O que foi alterado *</label>
              <Textarea rows={3} className="mt-1" value={alteracoes} onChange={(e) => setAlteracoes(e.target.value)}
                placeholder="Itens/cláusulas alterados, como estavam e como ficaram" />
              <p className="text-[11px] text-gray-400 mt-0.5">{alteracoes.trim().length}/{MIN_TEXTO} caracteres mínimos</p>
            </div>
            <div>
              <p className="text-sm font-medium">A alteração afeta a formulação das propostas? *</p>
              <div className="flex gap-4 mt-1 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="afeta" checked={afeta === "SIM"} onChange={() => setAfeta("SIM")} /> Sim
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="afeta" checked={afeta === "NAO"} onChange={() => setAfeta("NAO")} /> Não
                </label>
              </div>
            </div>

            {afeta === "SIM" && (
              <div className="space-y-2 border rounded-md p-3 bg-amber-50/40">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium">Novo cronograma (prazo reaberto integralmente)</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!prazos?.data_minima_abertura}
                    onClick={() => {
                      const sug = sugestaoAPartirDoMinimo(prazos?.data_minima_abertura)
                      if (sug) setCrono((c) => ({ ...c, data_fim_acolhimento: sug, data_abertura_sessao: sug }))
                    }}
                  >
                    Usar data mínima
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {campo("data_fim_acolhimento", "Fim do recebimento de propostas *")}
                  {campo("data_abertura_sessao", "Abertura da sessão *")}
                  {campo("data_limite_impugnacao", "Limite para impugnação (opcional)")}
                  {campo("data_inicio_acolhimento", "Início do recebimento (opcional)")}
                </div>
                <PainelPrazos prazos={prazos} carregando={calculando} />
                <p className="text-xs text-amber-800">
                  As propostas já enviadas ficarão <b>aguardando confirmação do licitante</b>; sem confirmação até o
                  novo fim do recebimento, saem da disputa.
                </p>
              </div>
            )}

            {afeta === "NAO" && (
              <div className="space-y-2 border rounded-md p-3 bg-slate-50">
                <div>
                  <label className="text-sm font-medium">Por que não afeta as propostas? *</label>
                  <Textarea rows={2} className="mt-1" value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                    placeholder="ex.: correção de erro material no endereço do órgão, sem reflexo em preço ou especificação" />
                </div>
                <p className="text-xs text-gray-500">
                  As datas são mantidas. Se quiser, adie o fim do recebimento e a abertura (só é possível adiar):
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {campo("data_fim_acolhimento", "Fim do recebimento de propostas")}
                  {campo("data_abertura_sessao", "Abertura da sessão")}
                </div>
              </div>
            )}

            <ErroPendencias erro={erro} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Divulgar retificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
