"use client"

/**
 * PUBLICAR EDITAL (E7 — art. 55 da Lei 14.133/2021).
 * Modalidades competitivas, ao fim da fase interna (APROVACAO_INTERNA):
 * anexa o PDF do edital (hash registrado), define a natureza do objeto quando
 * o prazo depende dela, monta o cronograma e confere o prazo mínimo em dias
 * úteis contado pelo backend com o calendário de feriados do órgão.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Megaphone, FileText, Upload, CalendarClock, AlertTriangle } from "lucide-react"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import {
  consultarPrazos,
  erroDeExcecao,
  fmtDiaISO,
  isoParaInputLocal,
  inputLocalParaISO,
  lerErro,
  sugestaoAPartirDoMinimo,
  abrirArquivoEdital,
  type EditalDaLicitacao,
  type ErroBackend,
  type PrazosPublicacao,
} from "@/lib/publicacao"

export const MODALIDADES_COMPETITIVAS = [
  "PREGAO_ELETRONICO", "CONCORRENCIA", "LEILAO", "CONCURSO", "DIALOGO_COMPETITIVO",
]

export interface LicitacaoPublicacao {
  modalidade: string
  fase: string
  natureza_objeto?: string | null
  data_limite_impugnacao?: string | null
  data_inicio_acolhimento?: string | null
  data_fim_acolhimento?: string | null
  data_abertura_sessao?: string | null
}

interface Cronograma {
  data_limite_impugnacao: string
  data_inicio_acolhimento: string
  data_fim_acolhimento: string
  data_abertura_sessao: string
}

/** Painel do prazo mínimo (reusado na retificação). */
export function PainelPrazos({ prazos, carregando }: { prazos: PrazosPublicacao | null; carregando?: boolean }) {
  if (!prazos) {
    return carregando ? (
      <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> calculando prazos…</p>
    ) : null
  }
  return (
    <div className="border rounded-md p-3 bg-slate-50 space-y-2 text-sm">
      {prazos.dias_uteis != null ? (
        <p>
          <b>Prazo mínimo: {prazos.dias_uteis} dias úteis</b>
          {prazos.fundamento && <span className="text-gray-600"> ({prazos.fundamento}{prazos.descricao ? ` — ${prazos.descricao}` : ""})</span>}
        </p>
      ) : (
        <p className="text-amber-700">Prazo mínimo ainda indefinido — resolva as pendências abaixo.</p>
      )}
      {prazos.data_minima_abertura && (
        <p className="flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-blue-600" />
          Abertura a partir de <b>{fmtRelogio(prazos.data_minima_abertura)}</b>
          <span className="text-xs text-gray-400">(horário de Brasília, divulgando agora)</span>
        </p>
      )}
      {prazos.hipoteses?.length > 1 && (
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer">Hipóteses consideradas ({prazos.hipoteses.length}) — vale a maior</summary>
          <ul className="list-disc pl-5 mt-1">
            {prazos.hipoteses.map((h, i) => (
              <li key={i}>{h.dias} dias úteis — {h.fundamento}: {h.descricao}</li>
            ))}
          </ul>
        </details>
      )}
      {prazos.feriados_no_periodo?.length > 0 && (
        <div className="text-xs text-gray-600">
          <span className="font-medium">Sem expediente no período (não contam):</span>{" "}
          {prazos.feriados_no_periodo.map((f) => `${fmtDiaISO(f.data)} ${f.descricao}`).join(" · ")}
        </div>
      )}
      {prazos.calendario_orgao === false && (
        <p className="text-xs text-amber-700">
          O órgão ainda não tem feriados próprios cadastrados — confira o{" "}
          <Link href="/orgao/configuracoes/feriados" className="underline">calendário de feriados</Link>.
        </p>
      )}
      <p className="text-[11px] text-gray-400">{prazos.contagem}</p>
      {prazos.pendencias?.length > 0 && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <ul className="list-disc pl-4 space-y-0.5">
            {prazos.pendencias.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/** "AAAA-MM-DDTHH:MM:SS" (relógio de Brasília) → "dd/mm/aaaa hh:mm". */
export function fmtRelogio(v: string | null | undefined): string {
  if (!v) return "—"
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : String(v)
}

export function PublicacaoEdital({
  licitacaoId,
  licitacao,
  onAtualizado,
}: {
  licitacaoId: string
  licitacao: LicitacaoPublicacao
  onAtualizado: () => void
}) {
  const [edital, setEdital] = useState<EditalDaLicitacao | null>(null)
  const [enviandoPdf, setEnviandoPdf] = useState(false)
  const [erroEdital, setErroEdital] = useState<ErroBackend | null>(null)
  const inputPdf = useRef<HTMLInputElement>(null)

  const [natureza, setNatureza] = useState<string>(licitacao.natureza_objeto || "")
  const [salvandoNatureza, setSalvandoNatureza] = useState(false)

  const [crono, setCrono] = useState<Cronograma>({
    data_limite_impugnacao: isoParaInputLocal(licitacao.data_limite_impugnacao),
    data_inicio_acolhimento: isoParaInputLocal(licitacao.data_inicio_acolhimento),
    data_fim_acolhimento: isoParaInputLocal(licitacao.data_fim_acolhimento),
    data_abertura_sessao: isoParaInputLocal(licitacao.data_abertura_sessao),
  })
  const [prazos, setPrazos] = useState<PrazosPublicacao | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [erroPrazos, setErroPrazos] = useState<string | null>(null)

  const [publicando, setPublicando] = useState(false)
  const [erroPublicar, setErroPublicar] = useState<ErroBackend | null>(null)

  const carregarEdital = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/edital`)
      if (res.ok) setEdital(await res.json())
    } catch { /* card mostra "sem edital" */ }
  }, [licitacaoId])

  useEffect(() => { carregarEdital() }, [carregarEdital])

  // Recalcula o prazo mínimo a cada mudança do cronograma/natureza (com espera curta)
  useEffect(() => {
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
          natureza_objeto: natureza || undefined,
        })
        if (!cancelado) { setPrazos(p); setErroPrazos(null) }
      } catch (e: any) {
        if (!cancelado) setErroPrazos(e.message || "Erro ao calcular os prazos")
      } finally {
        if (!cancelado) setCalculando(false)
      }
    }, 400)
    return () => { cancelado = true; clearTimeout(t) }
  }, [licitacaoId, crono, natureza])

  const enviarPdf = async (arquivo: File | undefined) => {
    if (!arquivo) return
    if (arquivo.type !== "application/pdf" && !arquivo.name.toLowerCase().endsWith(".pdf")) {
      setErroEdital({ mensagem: "O edital deve ser um arquivo PDF.", pendencias: [] })
      return
    }
    setEnviandoPdf(true)
    setErroEdital(null)
    try {
      const fd = new FormData()
      fd.append("arquivo", arquivo)
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/edital`, { method: "POST", body: fd })
      if (!res.ok) {
        setErroEdital(await lerErro(res, "Erro ao anexar o edital"))
        return
      }
      await carregarEdital()
    } catch (e) {
      setErroEdital(erroDeExcecao(e))
    } finally {
      setEnviandoPdf(false)
      if (inputPdf.current) inputPdf.current.value = ""
    }
  }

  const abrirPdf = async (documentoId: string) => {
    try {
      await abrirArquivoEdital(licitacaoId, documentoId)
    } catch (e) {
      setErroEdital(erroDeExcecao(e))
    }
  }

  const salvarNatureza = async (valor: string) => {
    setNatureza(valor)
    if (!valor) return
    setSalvandoNatureza(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`, {
        method: "PUT",
        body: JSON.stringify({ natureza_objeto: valor }),
      })
      if (!res.ok) setErroPublicar(await lerErro(res, "Erro ao salvar a natureza do objeto"))
    } catch (e) {
      setErroPublicar(erroDeExcecao(e))
    } finally {
      setSalvandoNatureza(false)
    }
  }

  const usarDataMinima = () => {
    const sug = sugestaoAPartirDoMinimo(prazos?.data_minima_abertura)
    if (!sug) return
    setCrono((c) => ({
      ...c,
      data_fim_acolhimento: sug,
      data_abertura_sessao: sug,
    }))
  }

  const publicar = async () => {
    setErroPublicar(null)
    const faltando: string[] = []
    if (!crono.data_fim_acolhimento) faltando.push("Informe o fim do recebimento de propostas.")
    if (!crono.data_abertura_sessao) faltando.push("Informe a data de abertura da sessão.")
    if (faltando.length) {
      setErroPublicar({ mensagem: faltando.join(" "), pendencias: faltando })
      return
    }
    setPublicando(true)
    try {
      const agora = new Date().toISOString()
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/publicar-edital`, {
        method: "PUT",
        body: JSON.stringify({
          data_publicacao_edital: agora,
          data_limite_impugnacao: inputLocalParaISO(crono.data_limite_impugnacao),
          data_inicio_acolhimento: inputLocalParaISO(crono.data_inicio_acolhimento) || agora,
          data_fim_acolhimento: inputLocalParaISO(crono.data_fim_acolhimento),
          data_abertura_sessao: inputLocalParaISO(crono.data_abertura_sessao),
        }),
      })
      if (!res.ok) {
        setErroPublicar(await lerErro(res, "Erro ao publicar o edital"))
        return
      }
      onAtualizado()
    } catch (e) {
      setErroPublicar(erroDeExcecao(e))
    } finally {
      setPublicando(false)
    }
  }

  const vigente = edital?.vigente
  const mostrarNatureza = !!prazos?.exige_natureza_objeto || !!natureza || !!prazos?.natureza_objeto
  const campo = (k: keyof Cronograma, rotulo: string, dica?: string) => (
    <div>
      <label className="text-xs text-gray-600">{rotulo}</label>
      <Input
        type="datetime-local"
        className="mt-1 h-9"
        value={crono[k]}
        onChange={(e) => setCrono((c) => ({ ...c, [k]: e.target.value }))}
      />
      {dica && <p className="text-[10px] text-gray-400 mt-0.5">{dica}</p>}
    </div>
  )

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-blue-700" /> Publicar edital
          <span className="text-xs font-normal text-gray-400">art. 55 da Lei 14.133/2021</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1. Edital (PDF) */}
        <div className="space-y-2">
          <p className="text-sm font-medium">1. Edital (PDF)</p>
          {vigente ? (
            <div className="flex items-center gap-2 flex-wrap text-sm border rounded px-3 py-2 bg-white">
              <FileText className="w-4 h-4 text-gray-500" />
              <button type="button" className="text-blue-600 hover:underline" onClick={() => abrirPdf(vigente.documento_id)}>
                {vigente.nome || `Edital v${vigente.versao}`}
              </button>
              <Badge variant="outline">v{vigente.versao}</Badge>
              <Badge variant="outline" className={vigente.status === "RASCUNHO" ? "border-amber-300 text-amber-700" : ""}>{vigente.status}</Badge>
              {vigente.hash && (
                <span className="text-[11px] text-gray-400 font-mono" title={`SHA-256: ${vigente.hash}`}>hash {vigente.hash.slice(0, 12)}…</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-amber-700">Nenhum edital anexado.</p>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputPdf}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => enviarPdf(e.target.files?.[0])}
            />
            <Button size="sm" variant="outline" onClick={() => inputPdf.current?.click()} disabled={enviandoPdf}>
              {enviandoPdf ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              {vigente ? "Substituir PDF" : "Anexar PDF do edital"}
            </Button>
            <span className="text-[11px] text-gray-400">Pode ser trocado até a publicação; depois, só por retificação.</span>
          </div>
          <ErroPendencias erro={erroEdital} />
        </div>

        {/* 2. Natureza do objeto (quando o prazo depende dela) */}
        {mostrarNatureza && (
          <div className="space-y-1">
            <p className="text-sm font-medium">2. Natureza do objeto</p>
            <div className="flex items-center gap-2">
              <select
                className="border rounded-md h-9 px-2 text-sm bg-white w-60"
                value={natureza || prazos?.natureza_objeto || ""}
                onChange={(e) => salvarNatureza(e.target.value)}
                disabled={salvandoNatureza}
              >
                <option value="">— selecionar —</option>
                <option value="COMUM">Comum</option>
                <option value="ESPECIAL">Especial</option>
              </select>
              {salvandoNatureza && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            <p className="text-[11px] text-gray-400">
              Bens/serviços comuns ou especiais têm prazos mínimos diferentes (art. 55, I e II).
            </p>
          </div>
        )}

        {/* 3. Cronograma */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium">{mostrarNatureza ? "3" : "2"}. Cronograma</p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={usarDataMinima} disabled={!prazos?.data_minima_abertura}>
              Usar data mínima
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {campo("data_limite_impugnacao", "Limite para impugnação (opcional)", "Vazio: 3 dias úteis antes da abertura (art. 164).")}
            {campo("data_inicio_acolhimento", "Início do recebimento de propostas", "Vazio: a partir da publicação.")}
            {campo("data_fim_acolhimento", "Fim do recebimento de propostas")}
            {campo("data_abertura_sessao", "Abertura da sessão pública")}
          </div>
          {erroPrazos && <p className="text-xs text-red-600">{erroPrazos}</p>}
          <PainelPrazos prazos={prazos} carregando={calculando} />
        </div>

        <ErroPendencias erro={erroPublicar} />
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] text-gray-400">
            Ao publicar, o aviso vai para a fila do PNCP automaticamente e o prazo de propostas é aberto.
          </span>
          <Button onClick={publicar} disabled={publicando} className="bg-[#1351b4] hover:bg-[#0c326f] text-white">
            {publicando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
            Publicar edital
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
