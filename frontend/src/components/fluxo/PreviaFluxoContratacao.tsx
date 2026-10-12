"use client"

import { useEffect, useState } from "react"
import { apiFluxo, type OpcoesAplicacao, type PreviaContratacao } from "@/lib/fluxo/desenho"

/** Enquadramento presumido quando o usuário não escolhe (o mesmo que o servidor grava por padrão). */
const PRESUMIDO: Record<string, string> = { DISPENSA_ELETRONICA: "ART75_II", INEXIGIBILIDADE: "ART74_CAPUT" }

/**
 * Abrir o processo (mockup de 12/10/2026, tela 3): enquadramento da dispensa
 * ou da inexigibilidade e, antes de confirmar, o fluxo que o processo vai
 * seguir — escolhido pela modalidade e pelo enquadramento. Sem acesso ao
 * Processo Eletrônico, não aparece (o processo abre como antes).
 */
export function PreviaFluxoContratacao({ modalidade, fundamento, onFundamento }: { modalidade: string; fundamento: string; onFundamento: (f: string) => void }) {
  const [opcoes, setOpcoes] = useState<OpcoesAplicacao | null>(null)
  const [previa, setPrevia] = useState<{ chave: string; dados: PreviaContratacao } | null>(null)
  const [semAcesso, setSemAcesso] = useState(false)

  useEffect(() => {
    apiFluxo<OpcoesAplicacao>("/contratacao/opcoes")
      .then(setOpcoes)
      .catch(() => setSemAcesso(true))
  }, [])

  const efetivo = fundamento || PRESUMIDO[modalidade] || ""
  const chave = `${modalidade}|${efetivo}`
  useEffect(() => {
    if (semAcesso) return
    let vivo = true
    apiFluxo<PreviaContratacao>(`/contratacao/previa?modalidade=${encodeURIComponent(modalidade)}${efetivo ? `&fundamento=${encodeURIComponent(efetivo)}` : ""}`)
      .then((dados) => vivo && setPrevia({ chave, dados }))
      .catch(() => vivo && setSemAcesso(true))
    return () => {
      vivo = false
    }
  }, [modalidade, efetivo, chave, semAcesso])

  if (semAcesso) return null
  const enquadramentos = opcoes?.modalidades.find((m) => m.codigo === modalidade)?.enquadramentos ?? []
  const p = previa?.chave === chave ? previa.dados : null

  return (
    <div className="space-y-2 min-w-0">
      {enquadramentos.length ? (
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="abrir-enquadramento" className="text-sm font-semibold">Enquadramento</label>
          <select id="abrir-enquadramento" value={fundamento} onChange={(e) => onFundamento(e.target.value)} className="w-full min-w-0 max-w-full rounded-md border px-3 py-2 text-sm bg-white">
            <option value="">{modalidade === "DISPENSA_ELETRONICA" ? "Pelo valor — art. 75, I (obras) ou II (demais)" : "Art. 74, caput — definir depois"}</option>
            {enquadramentos.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.referencia} — {e.descricao}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <section aria-label="Fluxo que o processo vai seguir" className={`rounded-md border-2 p-3 space-y-2 ${p?.fluxo ? "border-blue-600 bg-blue-50" : "border-amber-300 bg-amber-50"}`}>
        {!p ? (
          <p className="text-sm text-gray-700">Conferindo o fluxo…</p>
        ) : p.fluxo ? (
          <>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">Este processo vai seguir</p>
              <p className="text-sm font-semibold">{p.fluxo.nome} · versão {p.fluxo.versao}</p>
              <p className="text-xs text-gray-700">Escolhido por: {p.por}.</p>
            </div>
            {p.etapas.length ? (
              <ol className="flex flex-wrap items-center gap-1.5 text-xs">
                {p.etapas.map((e, i) => (
                  <li key={`${e.nome}-${i}`} className="flex items-center gap-1.5">
                    <span className="rounded border border-blue-200 bg-white px-2 py-1 font-medium">
                      {e.nome}
                      {e.responsavel ? <span className="font-normal text-gray-600"> · {e.responsavel}</span> : null}
                    </span>
                    {i < p.etapas.length - 1 ? <span aria-hidden="true" className="text-gray-500">→</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-amber-900">
            Nenhum fluxo ativo vale para {p.por || "esta modalidade"}: o processo abre sem fluxo e a tramitação fica manual (&quot;Enviar para&quot;). Ajuste em Configurações › Fluxos de processo.
          </p>
        )}
      </section>
    </div>
  )
}
