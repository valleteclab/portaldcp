"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowRight, ChevronRight, FileStack, Home, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type ModoFaseInterna, ultimaEscolhaModo } from "@/lib/fase-interna/criacao"

/** Última escolha (localStorage) sem efeito: servidor null, cliente o valor guardado. */
const semAssinatura = () => () => {}
const useUltimaEscolha = () => useSyncExternalStore(semAssinatura, ultimaEscolhaModo, () => null)

const OPCOES: Array<{ modo: ModoFaseInterna; titulo: string; texto: string; icone: typeof Sparkles }> = [
  {
    modo: "GUIADO",
    titulo: "Vou fazer aqui no Portal DCP (guiado)",
    texto: "Assistente passo a passo: demanda, estudo técnico, riscos, pesquisa de preços, TR, dotação, autorização, aviso e parecer — com modelos e IA.",
    icone: Sparkles,
  },
  {
    modo: "FORA",
    titulo: "Já foi feita fora — tenho os documentos (PDF)",
    texto: "Em 3 passos: os dados do processo, os itens (com o valor da pesquisa) e os PDFs das peças, enviados de uma vez e classificados um a um.",
    icone: FileStack,
  },
]

/**
 * As duas respostas de "Como a fase interna deste processo foi feita?"
 * (cartões de escolha). A última escolha do usuário vem marcada como
 * sugestão — a pergunta nunca é pulada. Na dispensa, "feita fora" ganha
 * destaque: é o caso comum (autos montados em Word/outro sistema).
 */
export function OpcoesModoFaseInterna({
  valor,
  onChange,
  modalidade,
  compacto = false,
}: {
  valor: ModoFaseInterna | null
  onChange: (m: ModoFaseInterna) => void
  modalidade?: string | null
  compacto?: boolean
}) {
  const ultima = useUltimaEscolha()
  const dispensa = modalidade === "DISPENSA_ELETRONICA"
  return (
    <fieldset className="space-y-2">
      <legend className={`font-semibold text-gray-900 ${compacto ? "text-sm mb-1" : "text-lg mb-2"}`}>Como a fase interna deste processo foi feita?</legend>
      <div className={`grid gap-3 ${compacto ? "" : "sm:grid-cols-2"}`}>
        {OPCOES.map((o) => {
          const Icone = o.icone
          const marcado = valor === o.modo
          return (
            <label
              key={o.modo}
              className={`relative flex gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                marcado ? "border-[#1351b4] bg-[#ecf3fc] ring-1 ring-[#1351b4]" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="modo-fase-interna"
                className="mt-1 accent-[#1351b4]"
                checked={marcado}
                onChange={() => onChange(o.modo)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 flex-wrap">
                  <Icone className="w-4 h-4 text-[#1351b4] shrink-0" aria-hidden="true" />
                  <b className="text-sm text-gray-900">{o.titulo}</b>
                  {o.modo === "FORA" && dispensa && (
                    <span className="text-[10px] font-semibold text-amber-900 bg-amber-100 rounded-full px-2 py-0.5">comum na dispensa</span>
                  )}
                  {ultima === o.modo && <span className="text-[10px] text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">sua última escolha</span>}
                </span>
                {!compacto && <span className="block text-xs text-gray-600 mt-1">{o.texto}</span>}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * PERGUNTA INICIAL DA CRIAÇÃO (antes do passo 1 do assistente, para toda
 * modalidade): guiado aqui ou fase interna já feita fora do sistema.
 */
export function EscolhaModoFaseInterna({
  modalidade,
  onEscolher,
}: {
  modalidade?: string | null
  onEscolher: (m: ModoFaseInterna) => void
}) {
  const [escolhido, setValor] = useState<ModoFaseInterna | null>(null)
  // Sugestão: a última escolha deste usuário (marcada, mas ele confirma)
  const ultima = useUltimaEscolha()
  const valor = escolhido ?? ultima
  const dispensa = modalidade === "DISPENSA_ELETRONICA"
  return (
    <div className="h-full flex flex-col">
      <nav aria-label="Trilha" className="flex items-center gap-1.5 text-xs text-gray-500 px-6 py-3 border-b border-gray-100 shrink-0">
        <Home className="w-3.5 h-3.5" aria-hidden="true" />
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <Link href="/orgao/fase-interna/processos" className="hover:text-[#1351b4]">Processos</Link>
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <span className="text-[#1351b4] font-medium">{dispensa ? "Nova dispensa" : "Novo processo"}</span>
      </nav>
      <div className="flex-1 overflow-y-auto p-6 sm:p-10">
        <div className="max-w-3xl mx-auto space-y-5">
          {dispensa && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <b>Dispensa:</b> se o DFD, a pesquisa, a informação orçamentária, o despacho e o parecer já estão prontos em PDF,
              escolha <b>&quot;Já foi feita fora&quot;</b> — você junta tudo de uma vez e o checklist do art. 72 mostra o que falta.
            </p>
          )}
          <OpcoesModoFaseInterna valor={valor} onChange={setValor} modalidade={modalidade} />
          <p className="text-xs text-gray-600">
            Dá para misturar: quem começa guiado pode, no processo, &quot;Juntar documentos feitos fora&quot; a qualquer momento.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => valor && onEscolher(valor)} disabled={!valor} className="bg-[#1351b4] hover:bg-[#0c326f]">
              Continuar <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
