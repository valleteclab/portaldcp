"use client"

import { diaMes, haQuantoTempo, type Andamento, type NoAndamento } from "@/lib/fluxo/andamento"
import s from "./andamento.module.css"

/**
 * ANDAMENTO do processo (mockup aprovado em 06/10/2026): uma fila de etapas —
 * concluída (verde), em andamento (azul, "há N dias"), a realizar (contorno).
 * O mesmo componente serve ao ofício (caminho livre: o que aconteceu) e à
 * contratação (caminho desenhado: as etapas futuras já aparecem).
 */
export function AndamentoFluxo({ andamento }: { andamento: Andamento | null }) {
  if (!andamento || !andamento.nos.length) return null
  const livre = andamento.modo === "LIVRE"
  return (
    <section className={s.bloco} aria-labelledby="bloco-andamento">
      <div className={s.topo}>
        <h2 id="bloco-andamento" className={s.titulo}>
          Andamento
        </h2>
        <p className={s.sub}>
          {livre
            ? "Sem fluxo definido: o caminho é a tramitação registrada."
            : `${andamento.fluxo?.nome ?? "Fluxo"}, versão ${andamento.fluxo?.versao ?? 1} · ${andamento.concluidas} de ${andamento.total} etapas concluídas`}
        </p>
      </div>

      <ol className={s.fila}>
        {andamento.nos.map((no, i) => (
          <li key={no.chave} className={s.item}>
            {i > 0 ? <Seta feita={no.situacao !== "A_REALIZAR"} /> : null}
            <Cartao no={no} />
          </li>
        ))}
      </ol>

      <div className={s.legenda} aria-hidden="true">
        <span><i className={`${s.amostra} ${s.feita}`} />Concluída</span>
        <span><i className={`${s.amostra} ${s.atual}`} />Em andamento</span>
        {andamento.nos.some((n) => n.situacao === "A_REALIZAR") ? <span><i className={`${s.amostra} ${s.futura}`} />A realizar</span> : null}
        {livre ? null : <span><Cadeado />Obrigatória por lei</span>}
        {andamento.nos.some((n) => n.atrasada) ? <span><i className={`${s.amostra} ${s.atrasadaAmostra}`} />Prazo vencido</span> : null}
      </div>
    </section>
  )
}

function Cartao({ no }: { no: NoAndamento }) {
  const classe =
    no.situacao === "CONCLUIDA" ? s.feita : no.situacao === "EM_ANDAMENTO" ? (no.atrasada ? `${s.atual} ${s.atrasada}` : s.atual) : s.futura
  const situacao = no.situacao === "CONCLUIDA" ? "concluída" : no.situacao === "EM_ANDAMENTO" ? "em andamento" : "a realizar"
  const detalhe =
    no.situacao === "EM_ANDAMENTO"
      ? [no.responsavel, haQuantoTempo(no.desde)].filter(Boolean).join(" · ")
      : no.situacao === "CONCLUIDA" && no.concluida_em
        ? [no.responsavel, diaMes(no.concluida_em)].filter(Boolean).join(" · ")
        : no.responsavel
  return (
    <div className={`${s.cartao} ${classe}`} aria-current={no.situacao === "EM_ANDAMENTO" ? "step" : undefined}>
      <Marca situacao={no.situacao} />
      <span className={s.texto}>
        <b>{no.titulo}</b>
        <span className="sr-only"> — {situacao}{no.atrasada ? ", prazo vencido" : ""}{no.devolvida ? ", devolvida" : ""}</span>
        {detalhe ? <span className={s.detalhe}>{detalhe}</span> : null}
        {no.situacao === "EM_ANDAMENTO" && no.prazo_em ? (
          <span className={s.detalhe}>{no.atrasada ? "venceu" : "vence"} {diaMes(no.prazo_em)}</span>
        ) : null}
        {no.devolvida ? <span className={s.detalhe}>devolvida</span> : null}
      </span>
      {no.obrigatoria_lei ? (
        <span className={s.trava} title={`Obrigatória: ${no.obrigatoria_lei}`}>
          <Cadeado />
        </span>
      ) : null}
    </div>
  )
}

function Marca({ situacao }: { situacao: NoAndamento["situacao"] }) {
  if (situacao === "CONCLUIDA")
    return (
      <svg className={s.marca} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12l5 5L20 7" />
      </svg>
    )
  if (situacao === "EM_ANDAMENTO")
    return (
      <svg className={s.marca} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7" fill="currentColor" />
      </svg>
    )
  return (
    <svg className={s.marca} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
    </svg>
  )
}

function Seta({ feita }: { feita: boolean }) {
  return (
    <svg className={`${s.seta} ${feita ? s.setaFeita : ""}`} width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
      <path d="M1 5 H22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={feita ? undefined : "4 4"} />
      <path d="M21 1 L27 5 L21 9 Z" fill="currentColor" />
    </svg>
  )
}

function Cadeado() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
