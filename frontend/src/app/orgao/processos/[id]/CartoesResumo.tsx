"use client"

import { useEffect, useState, type ReactNode } from "react"
import { fmtBrasilia } from "@/lib/publicacao"
import { FASES_INTERNAS, rotuloFase } from "@/lib/licitacao-rotulos"
import { ROTULO_SITUACAO, situacaoDaLicitacao } from "@/lib/licitacao-situacao"
import { fmtMoeda, type ProcessoCompleto, type SituacaoDivulgacao } from "./tipos"

function Cartao({ rotulo, valor, detalhe, tom = "normal" }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "normal" | "erro" | "alerta" | "ok" }) {
  const cor = tom === "erro" ? "text-red-700" : tom === "alerta" ? "text-amber-800" : tom === "ok" ? "text-green-800" : "text-gray-900"
  return (
    <div className="rounded-lg border bg-white p-3 min-w-0">
      <p className="text-xs text-gray-600">{rotulo}</p>
      <p className={`text-base font-semibold truncate ${cor}`}>{valor}</p>
      {detalhe && <p className="text-xs text-gray-600 mt-0.5">{detalhe}</p>}
    </div>
  )
}

/** "2 d 4 h" / "3 h 12 min" até a data. */
function faltam(ate: Date, agora: Date): string {
  let min = Math.max(0, Math.floor((ate.getTime() - agora.getTime()) / 60_000))
  const d = Math.floor(min / 1440)
  min -= d * 1440
  const h = Math.floor(min / 60)
  min -= h * 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${min} min`
  return `${min} min`
}

/**
 * CINCO CARTÕES DE RESUMO: situação, prazo de propostas (contagem regressiva
 * quando iniciado), propostas (só a QUANTIDADE enquanto o recebimento está
 * aberto — Lei 14.133 art. 13 par. único, I; IN SEGES 67/2021 art. 13),
 * valor estimado + nº de itens e PNCP. Tudo vem do backend.
 */
export function CartoesResumo({ dados, divulgacao }: { dados: ProcessoCompleto; divulgacao: SituacaoDivulgacao | null }) {
  const l = dados.licitacao
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const situacao = situacaoDaLicitacao(l)
  const interna = FASES_INTERNAS.includes(l.fase)
  const aguardando = l.fase === "AGUARDANDO_DIVULGACAO"
  const erroPncp = divulgacao?.banner?.tipo === "ERRO"
  const dispensa = l.modalidade === "DISPENSA_ELETRONICA"

  // Situação
  const situacaoCartao = (
    <Cartao
      rotulo="Situação"
      valor={situacao === "ATIVA" ? rotuloFase(l.fase) : ROTULO_SITUACAO[situacao]}
      tom={erroPncp ? "erro" : situacao === "ATIVA" ? (aguardando ? "alerta" : "normal") : situacao === "CONCLUIDA" ? "ok" : "erro"}
      detalhe={erroPncp ? "Publicação falhou" : situacao !== "ATIVA" ? `Fase: ${rotuloFase(l.fase)}` : l.srp ? "Registro de preços" : undefined}
    />
  )

  // Prazo de propostas
  const fim = l.data_fim_acolhimento || l.data_abertura_sessao
  const fimData = fim ? new Date(fim) : null
  let prazo: ReactNode
  if (interna || aguardando || !fimData) {
    prazo = (
      <Cartao
        rotulo="Prazo de propostas"
        valor="Não iniciado"
        detalhe={
          aguardando
            ? "Começa quando o PNCP confirmar a publicação"
            : dispensa
              ? "Mín. 3 dias úteis após publicar (art. 75, §3º)"
              : "Prazo mínimo do art. 55 após publicar"
        }
      />
    )
  } else if (fimData.getTime() > agora.getTime()) {
    prazo = <Cartao rotulo="Prazo de propostas" valor={`Faltam ${faltam(fimData, agora)}`} tom="ok" detalhe={`Até ${fmtBrasilia(fimData)}`} />
  } else {
    prazo = <Cartao rotulo="Prazo de propostas" valor="Encerrado" detalhe={`Em ${fmtBrasilia(fimData)}`} />
  }

  // Propostas (quantidade; nomes e valores sob sigilo)
  const validas = dados.propostas.filter((p) => !["RASCUNHO", "CANCELADA"].includes(p.status)).length
  const propostas = (
    <Cartao
      rotulo="Propostas"
      valor={interna || aguardando ? "0" : String(validas)}
      detalhe={dados.propostas_em_sigilo ? "Licitantes e valores sigilosos até o fim do prazo" : interna || aguardando ? "Recebidas só após a publicação" : undefined}
    />
  )

  // Valor estimado + itens
  const ativos = dados.itens.filter((i) => i.status !== "CANCELADO")
  const somaItens = ativos.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario_estimado || 0), 0)
  const valor = Number(l.valor_total_estimado || 0) || somaItens
  const valorCartao = (
    <Cartao
      rotulo="Valor estimado"
      valor={fmtMoeda(valor)}
      detalhe={<span className={ativos.length === 0 ? "text-red-700 font-medium" : undefined}>{ativos.length} {ativos.length === 1 ? "item cadastrado" : "itens cadastrados"}</span>}
    />
  )

  // PNCP
  let pncp: ReactNode
  const compra = divulgacao?.compra
  if (l.selecao_externa || divulgacao?.estado === "EXTERNA") {
    pncp = <Cartao rotulo="PNCP" valor="Plataforma externa" detalhe={l.plataforma_externa || undefined} />
  } else if (divulgacao?.estado === "CONFIRMADA" || l.numero_controle_pncp) {
    pncp = <Cartao rotulo="PNCP" valor="Publicado" tom="ok" detalhe={l.numero_controle_pncp || (l.data_divulgacao_oficial ? `em ${fmtBrasilia(l.data_divulgacao_oficial)}` : undefined)} />
  } else if (aguardando && erroPncp) {
    pncp = <Cartao rotulo="PNCP" valor="Rejeitado" tom="erro" detalhe={compra ? `${compra.tentativas}/${compra.max_tentativas} tentativas${compra.erro_status_http ? ` · HTTP ${compra.erro_status_http}` : ""}` : undefined} />
  } else if (aguardando) {
    pncp = <Cartao rotulo="PNCP" valor="Aguardando" tom="alerta" detalhe={divulgacao?.integrado_pncp === false ? "Órgão sem PNCP: registre o diário oficial" : "Na fila de envio"} />
  } else {
    pncp = <Cartao rotulo="PNCP" valor="Não enviado" detalhe="Enviado ao publicar" />
  }

  return (
    <section aria-label="Resumo do processo" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {situacaoCartao}
      {prazo}
      {propostas}
      {valorCartao}
      {pncp}
    </section>
  )
}
