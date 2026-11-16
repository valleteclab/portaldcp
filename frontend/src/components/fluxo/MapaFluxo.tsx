"use client"

import type { CSSProperties } from "react"
import type { SituacaoNo } from "@/lib/fluxo/andamento"
import { etapaGenerica, grupoDaEtapa, posicaoNoMapa } from "@/lib/fluxo/mapa"
import s from "./mapa.module.css"

export interface EtapaMapa {
  chave: string
  nome: string
  tipo: string | null
  quem: string | null
  /** No processo: em que pé está a etapa (sem = desenho do fluxo). */
  situacao?: SituacaoNo
  atrasada?: boolean
}

const COR = { INSTRUCAO: s.instrucao, DECISAO: s.decisao, PUBLICIDADE: s.publicidade }

/**
 * MAPA DO FLUXO (aprovado em 12/10/2026): as etapas numeradas em zigue-zague,
 * quem faz cada uma e a cor do grupo, como a imagem montada dos autos. No
 * processo, marca o que já foi feito e a etapa atual.
 */
export function MapaFluxo({ etapas, numeroInicial = 1 }: { etapas: EtapaMapa[]; numeroInicial?: number }) {
  if (!etapas.length) return null
  const comSituacao = etapas.some((e) => e.situacao)
  const temGenerica = etapas.some((e) => etapaGenerica(e.tipo))
  return (
    <div className="flex flex-col gap-4">
      <ol className={s.mapa} aria-label="Mapa do fluxo">
        {etapas.map((e, i) => {
          const p = posicaoNoMapa(i, etapas.length)
          const classes = [
            s.caixa,
            COR[grupoDaEtapa(e.tipo)],
            etapaGenerica(e.tipo) ? s.generica : "",
            e.situacao === "CONCLUIDA" ? s.concluida : "",
            e.situacao === "EM_ANDAMENTO" ? s.atual : "",
          ].join(" ")
          return (
            <li key={e.chave} className={classes} data-seta={p.seta} style={{ "--c": p.coluna, "--r": p.linha } as CSSProperties} aria-current={e.situacao === "EM_ANDAMENTO" ? "step" : undefined}>
              <b>
                {numeroInicial + i} {e.nome}
              </b>
              {e.quem ? <span className={s.quem}>{e.quem}</span> : null}
              {e.situacao === "CONCLUIDA" ? <span className={`${s.situacao} ${s.feita}`}>✓ Concluída</span> : null}
              {e.situacao === "EM_ANDAMENTO" ? <span className={`${s.situacao} ${e.atrasada ? s.vencida : s.andamento}`}>{e.atrasada ? "Em andamento · prazo vencido" : "Em andamento"}</span> : null}
            </li>
          )
        })}
      </ol>
      <div className={s.legenda}>
        <span><i className={`${s.amostra} ${s.instrucao}`} />Instrução e habilitação</span>
        <span><i className={`${s.amostra} ${s.decisao}`} />Decisão da autoridade</span>
        <span><i className={`${s.amostra} ${s.publicidade}`} />Parecer e publicidade</span>
        {temGenerica ? <span><i className={s.amostraGenerica} />Etapa genérica (falta etapa própria)</span> : null}
        {comSituacao ? <span>Contorno azul: etapa atual</span> : null}
      </div>
    </div>
  )
}
