"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { ModuleGuard } from "@/components/ModuleGuard"
import { ModuloSistema } from "@/hooks/useModulosOrgao"
import { DesenhoFluxo } from "@/components/fluxo/DesenhoFluxo"
import { CanaisAvisoOrgao } from "@/components/fluxo/CanaisAvisoOrgao"
import { apiFluxo, rotuloMotivoCobertura, rotuloTipoProcesso, TIPOS_PROCESSO_FLUXO, type Desenho, type FluxoResumo, type LinhaCobertura } from "@/lib/fluxo/desenho"

/**
 * FLUXOS DE PROCESSO — lista dos fluxos do órgão e a tela "Desenhar o fluxo"
 * (mockup aprovado em 06/10/2026). `?fluxo=<id>` abre o editor daquela versão.
 */
function Fluxos() {
  const router = useRouter()
  const busca = useSearchParams()
  const fluxoId = busca.get("fluxo")
  const abrir = useCallback((id: string | null) => router.push(id ? `/orgao/configuracoes/fluxos?fluxo=${encodeURIComponent(id)}` : "/orgao/configuracoes/fluxos"), [router])

  if (fluxoId) return <DesenhoFluxo key={fluxoId} fluxoId={fluxoId} onTrocarFluxo={(id) => abrir(id)} />
  return <ListaFluxos onAbrir={abrir} />
}

function ListaFluxos({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [fluxos, setFluxos] = useState<FluxoResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [nome, setNome] = useState("")
  const [tipo, setTipo] = useState("CONTRATACAO")
  const [criando, setCriando] = useState(false)

  const [cobertura, setCobertura] = useState<LinhaCobertura[] | null>(null)

  useEffect(() => {
    apiFluxo<FluxoResumo[]>("/desenhos")
      .then(setFluxos)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar os fluxos."))
    apiFluxo<LinhaCobertura[]>("/contratacao/cobertura")
      .then(setCobertura)
      .catch(() => setCobertura([]))
  }, [])

  async function criar() {
    setCriando(true)
    try {
      const d = await apiFluxo<Desenho>("/desenhos", { metodo: "POST", corpo: { nome: nome.trim(), tipo_processo: tipo || null } })
      onAbrir(d.modelo.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o fluxo.")
      setCriando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 text-[#0F172A]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/orgao/configuracoes" className="inline-flex w-fit items-center gap-1 text-sm text-[#1B4A63] hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />Configurações
          </Link>
          <h1 className="text-2xl font-bold">Fluxos de processo</h1>
          <p className="text-sm text-[#5A6675]">O caminho que cada tipo de processo segue: etapas, responsáveis, prazos e avisos.</p>
        </div>
        <button type="button" data-guia="novo-fluxo" onClick={() => setNovo((v) => !v)} aria-expanded={novo} className="flex items-center gap-2 rounded-lg bg-[#1B4A63] px-4 py-2.5 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" aria-hidden="true" />Novo fluxo
        </button>
      </div>

      {novo ? (
        <section className="flex flex-col gap-3 rounded-xl border border-[#E3E7EC] bg-white p-5" aria-labelledby="novo-fluxo">
          <h2 id="novo-fluxo" className="text-[15px] font-bold">
            Novo fluxo
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="novo-fluxo-nome" className="text-[13px] font-semibold text-slate-700">
                Nome
              </label>
              <input id="novo-fluxo-nome" value={nome} maxLength={160} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Contratação — Câmara" className="rounded-lg border border-[#CBD3DA] px-3 py-2 text-[15px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="novo-fluxo-tipo" className="text-[13px] font-semibold text-slate-700">
                Para qual tipo de processo
              </label>
              <select id="novo-fluxo-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-[15px]">
                {TIPOS_PROCESSO_FLUXO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-[#5A6675]">Contratação, aditivo e renovação exigem parecer jurídico e publicação — o fluxo só é ativado com essas etapas.</p>
          <div className="flex gap-2">
            <button type="button" onClick={criar} disabled={criando || nome.trim().length < 3} className="rounded-lg bg-[#1B4A63] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {criando ? "Criando…" : "Criar e desenhar"}
            </button>
            <button type="button" onClick={() => setNovo(false)} className="rounded-lg border border-[#CBD3DA] px-4 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {cobertura && cobertura.length ? <CoberturaContratacao linhas={cobertura} onAbrir={onAbrir} /> : null}

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3" aria-label="Fluxos do órgão">
          {erro ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erro}</p> : null}
          {!fluxos && !erro ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Carregando…
            </p>
          ) : null}
          {fluxos && !fluxos.length ? <p className="rounded-xl border border-dashed border-[#CBD3DA] bg-white p-8 text-center text-sm text-[#5A6675]">Nenhum fluxo ainda. Crie o primeiro em “Novo fluxo”.</p> : null}
          {(fluxos ?? []).map((f) => (
            <div key={f.familia_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E3E7EC] bg-white p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <b className="text-[15px]">{f.nome}</b>
                <span className="text-sm text-[#5A6675]">
                  {rotuloTipoProcesso(f.tipo_processo)}
                  {f.ativo ? ` · versão ${f.ativo.versao} ativa` : f.desativado ? ` · versão ${f.desativado.versao} desativada` : " · nenhuma versão ativa"}
                  {f.rascunho ? ` · rascunho da versão ${f.rascunho.versao}` : ""}
                  {f.em_andamento ? ` · ${f.em_andamento} em andamento` : ""}
                </span>
                {f.vale_para?.length ? (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[#5A6675]">Vale para:</span>
                    {f.vale_para.map((v) => (
                      <span key={v} className="rounded-full border border-[#C9DAF3] bg-[#EAF1FB] px-2.5 py-0.5 text-xs font-semibold text-[#1E3A5F]">
                        {v}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                {f.rascunho ? (
                  <button type="button" onClick={() => onAbrir(f.rascunho!.id)} className="rounded-lg bg-[#1B4A63] px-3.5 py-2 text-sm font-semibold text-white">
                    Continuar rascunho
                  </button>
                ) : null}
                {f.ativo ? (
                  <button type="button" onClick={() => onAbrir(f.ativo!.id)} className="rounded-lg border border-[#CBD3DA] px-3.5 py-2 text-sm">
                    Ver versão ativa
                  </button>
                ) : f.desativado ? (
                  <button type="button" onClick={() => onAbrir(f.desativado!.id)} className="rounded-lg border border-[#CBD3DA] px-3.5 py-2 text-sm">
                    Ver versão desativada
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </section>
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col">
          <CanaisAvisoOrgao />
        </aside>
      </div>
    </div>
  )
}

/** "Qual fluxo cada contratação segue" (mockup de 12/10/2026): modalidade e enquadramento → fluxo, com as lacunas. */
function CoberturaContratacao({ linhas, onAbrir }: { linhas: LinhaCobertura[]; onAbrir: (id: string) => void }) {
  const ativos = new Set(linhas.filter((l) => l.fluxo).map((l) => l.fluxo!.id)).size
  return (
    <section aria-labelledby="t-cobertura" className="flex flex-col gap-3.5 rounded-xl border border-[#E3E7EC] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="t-cobertura" className="text-[17px] font-bold">Qual fluxo cada contratação segue</h2>
          <p className="text-[13px] text-[#4B5563]">O processo nasce no fluxo da sua modalidade e do seu enquadramento. O que não tem fluxo próprio segue o fluxo padrão.</p>
        </div>
        <span className="text-[13px] text-[#4B5563]">{ativos} {ativos === 1 ? "fluxo ativo" : "fluxos ativos"}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#5A6675]">
              <th scope="col" className="border-b border-[#E3E7EC] px-3 py-2.5">Modalidade</th>
              <th scope="col" className="border-b border-[#E3E7EC] px-3 py-2.5">Enquadramento</th>
              <th scope="col" className="border-b border-[#E3E7EC] px-3 py-2.5">Segue o fluxo</th>
              <th scope="col" className="border-b border-[#E3E7EC] px-3 py-2.5">Por quê</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const proprio = l.motivo === "ENQUADRAMENTO" || l.motivo === "MODALIDADE"
              const alerta = l.motivo === "NENHUM" || l.motivo === "AMBIGUO"
              return (
                <tr key={`${l.modalidade}-${i}`} className="border-t border-[#F1F3F6]">
                  <td className="px-3 py-2.5 font-semibold">{l.modalidade_rotulo}</td>
                  <td className="px-3 py-2.5 text-[#374151]">{l.enquadramento}</td>
                  <td className="px-3 py-2.5">
                    {l.fluxo ? (
                      <button type="button" onClick={() => onAbrir(l.fluxo!.id)} className="font-semibold text-[#1351b4] hover:underline">
                        {l.fluxo.nome}
                      </button>
                    ) : (
                      <span className="text-[#5A6675]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${proprio ? "bg-[#EAF6EE] text-green-700" : alerta ? "border border-amber-300 bg-amber-50 text-amber-900" : "bg-[#F1F3F6] text-[#374151]"}`}>
                      {rotuloMotivoCobertura(l.motivo)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function FluxosPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.PROCESSOS}>
      <div className="mx-auto w-full max-w-[1216px] px-4 py-6">
        <Suspense fallback={null}>
          <Fluxos />
        </Suspense>
      </div>
    </ModuleGuard>
  )
}
