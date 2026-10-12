"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { apiFluxo, type OpcoesAplicacao, type PreviaContratacao } from "@/lib/fluxo/desenho"
import { telaDaFaseInterna } from "@/lib/fluxo/ponte"
import type { ConteudoLicitacao } from "@/lib/processo/processo"

const AZUL = "#1351b4"
const JUSTIFICATIVA_MINIMA = 20

/**
 * ETAPA "DEFINIÇÃO DA MODALIDADE" (mockup aprovado em 12/10/2026, tela 2):
 * o Setor de Licitações escolhe modalidade e enquadramento, com justificativa
 * (art. 18, VIII). Ao concluir, a licitação recebe a modalidade e o número, o
 * despacho vai para os autos e o processo passa para o fluxo da modalidade.
 */
export function DefinicaoModalidadePainel({
  licitacao,
  processando,
  onConcluir,
}: {
  licitacao: ConteudoLicitacao | null
  processando: boolean
  onConcluir: (resposta: { modalidade: string; fundamento: string | null; justificativa: string }) => void
}) {
  const [opcoes, setOpcoes] = useState<OpcoesAplicacao | null>(null)
  const [modalidade, setModalidade] = useState(licitacao?.modalidade ?? "")
  const [fundamento, setFundamento] = useState(licitacao?.fundamento_legal ?? "")
  const [justificativa, setJustificativa] = useState("")
  const [previa, setPrevia] = useState<{ chave: string; dados: PreviaContratacao } | null>(null)

  useEffect(() => {
    apiFluxo<OpcoesAplicacao>("/contratacao/opcoes")
      .then(setOpcoes)
      .catch(() => setOpcoes({ modalidades: [], padrao_de: null }))
  }, [])

  const enquadramentos = opcoes?.modalidades.find((m) => m.codigo === modalidade)?.enquadramentos ?? []
  const fundamentoValido = enquadramentos.some((e) => e.codigo === fundamento) ? fundamento : ""
  const chave = `${modalidade}|${fundamentoValido}`
  useEffect(() => {
    if (!modalidade) return
    let vivo = true
    apiFluxo<PreviaContratacao>(`/contratacao/previa?modalidade=${encodeURIComponent(modalidade)}${fundamentoValido ? `&fundamento=${encodeURIComponent(fundamentoValido)}` : ""}`)
      .then((dados) => vivo && setPrevia({ chave, dados }))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [modalidade, fundamentoValido, chave])

  const p = previa?.chave === chave ? previa.dados : null
  const rotulo = opcoes?.modalidades.find((m) => m.codigo === modalidade)?.rotulo ?? "a modalidade"
  const indicada = opcoes?.modalidades.find((m) => m.codigo === licitacao?.modalidade)?.rotulo ?? null
  const podeConcluir = !!modalidade && justificativa.trim().length >= JUSTIFICATIVA_MINIMA && !!p?.fluxo && !processando
  const tr = licitacao?.id ? telaDaFaseInterna("TR", licitacao.id) : null
  const etp = licitacao?.id ? telaDaFaseInterna("ETP", licitacao.id) : null

  return (
    <section aria-labelledby="t-definicao" className="flex flex-col gap-4 rounded-xl border-2 p-5" style={{ borderColor: AZUL }}>
      <div className="flex flex-col gap-1">
        <h3 id="t-definicao" className="m-0 text-lg font-bold">Defina a modalidade da contratação</h3>
        <p className="m-0 text-[13px] text-gray-600">Lei 14.133/2021, art. 18, VIII. A escolha fica nos autos com a justificativa e decide o fluxo que o processo segue daqui em diante.</p>
      </div>

      <div role="note" className="flex flex-col gap-1.5 rounded-lg border border-[#C9DAF3] bg-[#F5F8FD] px-3.5 py-3 text-[13px]">
        <span className="font-bold text-[#1E3A5F]">O que já está no processo</span>
        {indicada ? (
          <span>
            • Indicada até aqui: <b>{indicada}</b>
            {licitacao?.modalidade_definida ? " (informada ao abrir o processo)" : " (provisória, sugerida pelo valor ao abrir)"}.
          </span>
        ) : null}
        <span>
          • Confira o que o ETP e o TR concluíram:{" "}
          {etp ? <Link href={etp.href} className="font-semibold">abrir o ETP</Link> : null}
          {etp && tr ? " · " : null}
          {tr ? <Link href={tr.href} className="font-semibold">abrir o TR</Link> : null}
        </span>
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[13px] font-bold">Modalidade</legend>
        {!opcoes ? (
          <p className="text-sm text-gray-600">Carregando…</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {opcoes.modalidades.map((m) => (
              <label
                key={m.codigo}
                className={`flex min-h-10 items-center gap-2.5 rounded-lg border px-3 text-sm ${modalidade === m.codigo ? "border-[#1351b4] bg-[#F5F8FD]" : "border-[#E3E7EC] bg-white"}`}
              >
                <input type="radio" name="definicao-modalidade" className="h-[18px] w-[18px] accent-[#1351b4]" checked={modalidade === m.codigo} onChange={() => { setModalidade(m.codigo); setFundamento("") }} />
                {m.rotulo}
                {licitacao?.modalidade === m.codigo ? <span className="ml-auto rounded-full bg-[#EAF1FB] px-2 py-0.5 text-[11px] font-bold text-[#1E3A5F]">indicada</span> : null}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {enquadramentos.length ? (
        <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold">
          Enquadramento
          <select value={fundamentoValido} onChange={(e) => setFundamento(e.target.value)} className="w-full min-w-0 rounded-lg border border-[#CBD3DA] bg-white px-2.5 py-2 text-sm font-normal">
            <option value="">{modalidade === "DISPENSA_ELETRONICA" ? "Pelo valor — art. 75, I (obras) ou II (demais)" : "Art. 74, caput"}</option>
            {enquadramentos.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.referencia} — {e.descricao}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
        Justificativa da escolha
        <textarea
          rows={4}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Ex.: Conforme o TR (item 11.2), o objeto é bem comum, com padrões de desempenho definidos no edital, o que indica o pregão eletrônico (art. 6º, XLI, e art. 28, I)."
          className="rounded-lg border border-[#CBD3DA] px-2.5 py-2 text-sm font-normal"
        />
        <span className="text-xs font-normal text-gray-500">Vai para os autos como despacho. Mínimo de {JUSTIFICATIVA_MINIMA} caracteres.</span>
      </label>

      {modalidade ? (
        p?.fluxo ? (
          <div role="note" className="flex flex-col gap-2 rounded-lg border border-[#97D2B4] bg-[#F1FAF5] px-4 py-3 text-[13px]">
            <span className="font-bold text-[#155C3B]">Ao concluir</span>
            <span>
              • A licitação passa a ser <b>{rotulo}</b>
              {licitacao?.numero_edital ? ` nº ${licitacao.numero_edital}` : " e recebe o número da modalidade no ano"}; o despacho entra nos autos.
            </span>
            <span>
              • Segue o fluxo <b>{p.fluxo.nome}</b> (versão {p.fluxo.versao}), escolhido por: {p.por}:
            </span>
            <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
              {p.etapas.map((e, i) => (
                <li key={`${e.nome}-${i}`} className="inline-flex items-center gap-1.5">
                  <span className="rounded border border-[#97D2B4] bg-white px-2 py-1 text-xs font-semibold">
                    {e.nome}
                    {e.responsavel ? <span className="font-normal text-gray-600"> · {e.responsavel}</span> : null}
                  </span>
                  {i < p.etapas.length - 1 ? <span aria-hidden="true" className="text-gray-500">→</span> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : p ? (
          <p role="alert" className="m-0 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            Nenhum fluxo ativo vale para {p.por || rotulo}. Ative em Configurações › Fluxos de processo um fluxo para essa modalidade (ou um fluxo padrão) antes de concluir.
          </p>
        ) : null
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={!podeConcluir}
          onClick={() => onConcluir({ modalidade, fundamento: fundamentoValido || null, justificativa: justificativa.trim() })}
          className="h-11 rounded-lg px-5 text-[15px] font-semibold text-white disabled:opacity-50"
          style={{ background: AZUL }}
        >
          {processando ? "Concluindo..." : `Concluir e seguir no fluxo da ${rotulo}`}
        </button>
      </div>
    </section>
  )
}
