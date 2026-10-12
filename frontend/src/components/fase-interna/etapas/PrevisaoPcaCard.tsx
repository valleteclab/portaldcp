"use client"

/**
 * PREVISÃO NO PCA (inc. II do ETP, art. 18, § 1º) — mostrada como DADO DO
 * PLANEJAMENTO, não como campo a redigir (mockup "Tela do ETP no fluxo",
 * 12/10/2026): o item do PCA vem do DFD/demanda; o texto do inciso é montado
 * pelo sistema (previsao-pca.ts) e entra na seção com um clique, continuando
 * editável. Sem item: pede a decisão — vincular no DFD ou justificar.
 */
import Link from "next/link"
import { CalendarCheck, ExternalLink } from "lucide-react"

export interface PrevisaoPcaTela {
  item: {
    id: string
    numero_item: number
    descricao_objeto: string
    valor_estimado: number | null
    trimestre_previsto: number | null
    mes_previsto_contratacao: number | null
    pca_id: string
    ano_exercicio: number
    numero_pca: string | null
    pca_status: string | null
    data_aprovacao: string | null
  } | null
  origem: "PROCESSO" | "ITENS" | "DFD" | "DEMANDA" | null
  dfd_numero: string | null
  sem_pca: boolean
  justificativa_sem_pca: string | null
  texto: string
  situacao: "PREVISTA" | "FORA_DO_PCA" | "SEM_VINCULO"
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const ORIGEM: Record<string, string> = { PROCESSO: "do DFD do processo", ITENS: "dos itens do processo", DFD: "do DFD consolidado", DEMANDA: "da demanda" }

function dataBr(iso: string | null): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/** O texto da seção já é o do PCA (não precisa aplicar de novo)? */
export function secaoJaTemOTexto(secaoHtml: string | undefined, texto: string): boolean {
  const limpa = (s: string) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  return !!secaoHtml && limpa(secaoHtml) === limpa(texto)
}

export function PrevisaoPcaCard({
  pca,
  licitacaoId,
  secaoAtual,
  somenteLeitura,
  onAplicar,
}: {
  pca: PrevisaoPcaTela
  licitacaoId: string
  /** HTML atual da seção previsao_pca do ETP. */
  secaoAtual?: string
  somenteLeitura: boolean
  /** Põe o texto montado na seção II do editor (sugestão aceita). */
  onAplicar: (html: string) => void
}) {
  const jaAplicado = secaoJaTemOTexto(secaoAtual, pca.texto)
  const i = pca.item
  if (i) {
    const quando = i.trimestre_previsto ? `${i.trimestre_previsto}º trimestre` : null
    return (
      <section className="rounded-lg border-2 border-[#1351b4] bg-white" aria-labelledby="pca-titulo">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C9DAF3] bg-[#F5F8FD] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-[#1351b4]" aria-hidden="true" />
            <h2 id="pca-titulo" className="m-0 text-sm font-semibold text-gray-900">
              2. Previsão no PCA (inc. II) <span className="ml-1 text-xs font-normal text-gray-600">Art. 18, § 1º, II · Art. 12, § 1º</span>
            </h2>
          </div>
          <span className="rounded-full border border-[#C9DAF3] bg-[#EAF1FB] px-2.5 py-0.5 text-[11px] font-bold text-[#1E3A5F]">
            Preenchido pelo sistema {pca.origem ? ORIGEM[pca.origem] : ""}
          </span>
        </div>
        <div className="grid gap-3 px-4 py-3 md:grid-cols-[150px_minmax(0,1fr)] text-sm">
          <span className="text-gray-600">Plano</span>
          <span>
            {i.numero_pca || `PCA ${i.ano_exercicio}`}
            {i.pca_status === "APROVADO" && dataBr(i.data_aprovacao) ? ` — aprovado em ${dataBr(i.data_aprovacao)}` : i.pca_status ? ` — ${String(i.pca_status).toLowerCase()}` : ""}
          </span>
          <span className="text-gray-600">Item do PCA</span>
          <span>
            <b>nº {i.numero_item}</b> — {i.descricao_objeto}
          </span>
          <span className="text-gray-600">Valor previsto</span>
          <span>
            {i.valor_estimado != null ? BRL.format(i.valor_estimado) : "—"}
            {quando ? ` · ${quando}` : ""}
          </span>
          {pca.dfd_numero ? (
            <>
              <span className="text-gray-600">Vínculo</span>
              <span>DFD nº {pca.dfd_numero}</span>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-2.5">
          {jaAplicado ? (
            <span className="text-xs font-semibold text-green-800">✓ Texto do inciso II no ETP — edite no editor se precisar.</span>
          ) : (
            <button
              type="button"
              onClick={() => onAplicar(pca.texto)}
              disabled={somenteLeitura}
              className="h-9 rounded-md border border-[#CBD3DA] bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              title="Coloca o texto montado pelo sistema na seção 2 do ETP; o que estiver lá é substituído"
            >
              {secaoAtual?.trim() ? "Substituir o inciso II pelo texto do PCA" : "Preencher o inciso II"}
            </button>
          )}
          <Link href="/orgao/pca" className="inline-flex items-center gap-1 text-sm text-[#1351b4] hover:underline">
            Abrir o PCA <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    )
  }

  const foraDoPca = pca.situacao === "FORA_DO_PCA"
  return (
    <section className="rounded-lg border border-amber-300 bg-white" aria-labelledby="pca-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
        <h2 id="pca-titulo" className="m-0 text-sm font-semibold text-gray-900">
          2. Previsão no PCA (inc. II) <span className="ml-1 text-xs font-normal text-gray-600">Art. 18, § 1º, II · Art. 12, § 1º</span>
        </h2>
        <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">{foraDoPca ? "Fora do PCA · justificada" : "Sem item do PCA"}</span>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-gray-700">
        {foraDoPca ? (
          <p className="m-0">
            O DFD registrou que a contratação não consta do PCA. Justificativa (art. 12, § 1º): <i>{pca.justificativa_sem_pca}</i>
          </p>
        ) : (
          <p className="m-0">
            O DFD{pca.dfd_numero ? ` nº ${pca.dfd_numero}` : ""} não aponta item do PCA. Vincule o item na tela do DFD ou registre lá que a contratação está fora do plano, com justificativa (art. 12, § 1º). O inciso II do ETP é preenchido a partir dessa decisão.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {foraDoPca && !jaAplicado ? (
            <button type="button" onClick={() => onAplicar(pca.texto)} disabled={somenteLeitura} className="h-9 rounded-md border border-[#CBD3DA] bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">
              {secaoAtual?.trim() ? "Substituir o inciso II pela justificativa" : "Preencher o inciso II com a justificativa"}
            </button>
          ) : null}
          <Link href={`/orgao/processos/${licitacaoId}/fase-interna/dfd`} className="text-sm text-[#1351b4] hover:underline">
            Abrir o DFD
          </Link>
        </div>
      </div>
    </section>
  )
}
