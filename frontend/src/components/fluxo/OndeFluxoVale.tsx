"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { apiFluxo, ErroFluxo, type AplicacaoFluxo, type Desenho, type OpcoesAplicacao } from "@/lib/fluxo/desenho"

/**
 * ONDE ESTE FLUXO VALE (mockup aprovado em 12/10/2026) — fluxo de Contratação:
 * modalidades, enquadramentos (dispensa e inexigibilidade) e o padrão. Casos
 * que outro fluxo ativo já tem aparecem travados, com o nome dele: cada caso
 * fica com um só fluxo.
 */
export function OndeFluxoVale({ desenho, onSalvo }: { desenho: Desenho; onSalvo: (d: Desenho) => void }) {
  const gravada = desenho.modelo.aplicacao
  const [opcoes, setOpcoes] = useState<OpcoesAplicacao | null>(null)
  const [ap, setAp] = useState<AplicacaoFluxo>(gravada ?? { modalidades: [], fundamentos: [], padrao: false })
  // Modalidades em que o fluxo vale só para alguns incisos (o resto marcado = todos)
  const [soAlguns, setSoAlguns] = useState<Set<string>>(() => new Set())
  const [sujo, setSujo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const somenteLeitura = desenho.modelo.status === "SUBSTITUIDO"

  useEffect(() => {
    apiFluxo<OpcoesAplicacao>(`/contratacao/opcoes?fluxo=${encodeURIComponent(desenho.modelo.id)}`)
      .then((o) => {
        setOpcoes(o)
        const fs = new Set(gravada?.fundamentos ?? [])
        setSoAlguns(new Set(o.modalidades.filter((m) => m.enquadramentos.some((e) => fs.has(e.codigo))).map((m) => m.codigo)))
      })
      .catch(() => setOpcoes({ modalidades: [], padrao_de: null }))
  }, [desenho.modelo.id, gravada])

  const alterar = (novo: AplicacaoFluxo) => {
    setAp(novo)
    setSujo(true)
  }
  const marcarModalidade = (codigo: string, marcada: boolean) => {
    const enq = new Set(opcoes?.modalidades.find((m) => m.codigo === codigo)?.enquadramentos.map((e) => e.codigo) ?? [])
    alterar({
      ...ap,
      modalidades: marcada ? [...ap.modalidades, codigo] : ap.modalidades.filter((m) => m !== codigo),
      fundamentos: marcada ? ap.fundamentos : ap.fundamentos.filter((f) => !enq.has(f)),
    })
  }
  const marcarEnquadramento = (codigo: string, marcado: boolean) =>
    alterar({ ...ap, fundamentos: marcado ? [...ap.fundamentos, codigo] : ap.fundamentos.filter((f) => f !== codigo) })
  const escolherAlcance = (modalidade: string, alguns: boolean) => {
    const proximo = new Set(soAlguns)
    if (alguns) proximo.add(modalidade)
    else proximo.delete(modalidade)
    setSoAlguns(proximo)
    if (!alguns) {
      const enq = new Set(opcoes?.modalidades.find((m) => m.codigo === modalidade)?.enquadramentos.map((e) => e.codigo) ?? [])
      alterar({ ...ap, fundamentos: ap.fundamentos.filter((f) => !enq.has(f)) })
    }
  }

  async function salvar() {
    setSalvando(true)
    try {
      const d = await apiFluxo<Desenho>(`/${desenho.modelo.id}/aplicacao`, { metodo: "PUT", corpo: ap })
      setSujo(false)
      onSalvo(d)
      toast.success("Gravado onde este fluxo vale.")
    } catch (e) {
      const erros = e instanceof ErroFluxo ? e.erros : []
      toast.error(erros.length ? erros.join(" ") : e instanceof Error ? e.message : "Não foi possível gravar.")
    } finally {
      setSalvando(false)
    }
  }

  const casos = [
    ...ap.modalidades.map((m) => {
      const op = opcoes?.modalidades.find((x) => x.codigo === m)
      const fs = op?.enquadramentos.filter((e) => ap.fundamentos.includes(e.codigo)).map((e) => e.referencia) ?? []
      return fs.length ? `${op?.rotulo ?? m} · ${fs.join("; ")}` : (op?.rotulo ?? m)
    }),
    ...(ap.padrao ? ["o que não tem fluxo próprio (padrão)"] : []),
  ]

  return (
    <section aria-labelledby="t-onde-vale" className="flex flex-col gap-4 rounded-xl border-2 border-[#1351b4] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="t-onde-vale" className="text-[17px] font-bold">Onde este fluxo vale</h2>
          <p className="text-[13px] text-[#4B5563]">Os processos de contratação abertos com estas modalidades e enquadramentos nascem neste fluxo.</p>
        </div>
        {!somenteLeitura ? (
          <button type="button" onClick={salvar} disabled={!sujo || salvando} className="rounded-lg bg-[#1B4A63] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {salvando ? "Gravando…" : sujo ? "Gravar onde vale" : "Gravado"}
          </button>
        ) : null}
      </div>

      {!gravada ? (
        <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Este fluxo ainda não diz onde vale. {desenho.modelo.status === "PUBLICADO" ? "Hoje ele é usado como padrão: vale para toda contratação sem fluxo próprio." : "Escolha abaixo antes de ativar."}
        </p>
      ) : null}

      {!opcoes ? (
        <p className="text-sm text-slate-600">Carregando…</p>
      ) : (
        <fieldset disabled={somenteLeitura} className="flex flex-col gap-3">
          <legend className="mb-1 text-[13px] font-bold">Modalidade</legend>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {opcoes.modalidades.map((m) => {
              const marcada = ap.modalidades.includes(m.codigo)
              const travada = !!m.ocupado_por && !m.enquadramentos.length && !marcada
              return (
                <div key={m.codigo} className="flex flex-col gap-2">
                  <label className={`flex min-h-8 items-center gap-2.5 text-sm ${travada ? "text-slate-500" : ""}`}>
                    <input type="checkbox" className="h-[18px] w-[18px] accent-[#1351b4]" checked={marcada} disabled={travada} onChange={(e) => marcarModalidade(m.codigo, e.target.checked)} />
                    {m.rotulo}
                    {m.ocupado_por && !marcada ? <span className="text-xs text-[#5A6675]">no fluxo &quot;{m.ocupado_por}&quot;</span> : null}
                  </label>
                  {marcada && m.enquadramentos.length ? (
                    <div className="ml-7 flex flex-col gap-1.5 rounded-lg border border-[#E3E7EC] p-3">
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="radio" name={`alcance-${m.codigo}`} checked={!soAlguns.has(m.codigo)} onChange={() => escolherAlcance(m.codigo, false)} />
                        Todos os incisos
                        {m.ocupado_por ? <span className="text-xs text-amber-800">— já são do fluxo &quot;{m.ocupado_por}&quot;; escolha só alguns</span> : null}
                      </label>
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="radio" name={`alcance-${m.codigo}`} checked={soAlguns.has(m.codigo)} onChange={() => escolherAlcance(m.codigo, true)} />
                        Só os incisos marcados
                      </label>
                      {soAlguns.has(m.codigo) ? (
                        <div className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto pl-6">
                          {m.enquadramentos.map((e) => {
                            const ocupado = !!e.ocupado_por && !ap.fundamentos.includes(e.codigo)
                            return (
                              <label key={e.codigo} className={`flex items-start gap-2 text-[13px] ${ocupado ? "text-slate-500" : ""}`}>
                                <input type="checkbox" className="mt-0.5" checked={ap.fundamentos.includes(e.codigo)} disabled={ocupado} onChange={(ev) => marcarEnquadramento(e.codigo, ev.target.checked)} />
                                <span>
                                  {e.referencia} — {e.descricao}
                                  {ocupado ? <span className="text-xs text-[#5A6675]"> · no fluxo &quot;{e.ocupado_por}&quot;</span> : null}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <label className={`flex items-start gap-2.5 text-sm ${opcoes.padrao_de && !ap.padrao ? "text-slate-500" : ""}`}>
            <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-[#1351b4]" checked={ap.padrao} disabled={!!opcoes.padrao_de && !ap.padrao} onChange={(e) => alterar({ ...ap, padrao: e.target.checked })} />
            <span>
              Usar como <b>fluxo padrão</b> da contratação
              <br />
              <span className="text-xs text-[#5A6675]">
                Vale para o que não tem fluxo próprio.{opcoes.padrao_de ? ` Hoje o padrão é "${opcoes.padrao_de}".` : " Hoje não há fluxo padrão: o que não tem fluxo próprio abre sem fluxo."}
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {casos.length ? (
        <div role="note" className="flex flex-col gap-1.5 rounded-lg border border-[#C9DAF3] bg-[#F5F8FD] px-4 py-3 text-[13px]">
          <span className="font-bold text-[#1E3A5F]">{desenho.modelo.status === "PUBLICADO" ? "Valendo agora" : "Ao ativar"}</span>
          <span>Passam a seguir este fluxo: {casos.join(", ")}.</span>
          <span>Nenhum outro fluxo é desativado. Processos já abertos continuam no fluxo em que nasceram.</span>
        </div>
      ) : null}
    </section>
  )
}
