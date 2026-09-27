"use client"

/**
 * DESENHO DA FASE INTERNA (F3b) — a visão do processo por dentro, na mesma
 * linguagem da barra de etapas do processo (faixa colorida + título + texto
 * da situação): uma coluna por NÍVEL de dependência (etapas lado a lado podem
 * andar ao mesmo tempo; a seta mostra o que vem depois). Cada etapa diz a
 * situação, o responsável, o prazo e as peças, e tem os botões Abrir,
 * Avançar (concluir) e Voltar conforme o servidor permite.
 *
 * No celular as colunas empilham (seta para baixo); na tela larga, se não
 * couber, só o desenho rola na horizontal — a página não.
 */
import Link from "next/link"
import { ArrowDown, ArrowRight, CheckCircle2, Circle, CircleDashed, Clock, MinusCircle, RotateCcw, Scale, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { rotaDaTela, telaDoPasso, fmtDia } from "@/lib/fase-interna/telas"
import { rotuloPrazo } from "@/lib/tarefas"
import { TRAVAS_DA_LEI, textoDaTrava } from "@/lib/fase-interna/travas"
import {
  acoesDoPasso, colunasDoDesenho, textoDaSituacao, SITUACAO_DO_PASSO, todosOsPassos,
  type AcaoConcluir, type EtapasFluxoResposta, type PassoFluxo, type TomSituacao,
} from "@/lib/fase-interna/visao-fluxo"
import { AjudaTravaDaLei } from "./AjudaTravaDaLei"

/** Mesmas cores da BarraEtapas do processo. */
const TOM: Record<TomSituacao, { barra: string; texto: string }> = {
  ok: { barra: "bg-green-600", texto: "text-green-800" },
  atual: { barra: "bg-blue-600", texto: "text-blue-800" },
  alerta: { barra: "bg-amber-500", texto: "text-amber-800" },
  futura: { barra: "bg-gray-200", texto: "text-gray-600" },
  neutra: { barra: "bg-slate-300", texto: "text-slate-600" },
}

function IconeSituacao({ p }: { p: PassoFluxo }) {
  const cls = "w-3.5 h-3.5 shrink-0"
  if (p.reaberta && p.situacao !== "CONCLUIDO") return <Undo2 className={`${cls} text-amber-700`} aria-hidden="true" />
  switch (p.situacao) {
    case "CONCLUIDO":
      return <CheckCircle2 className={`${cls} text-green-700`} aria-hidden="true" />
    case "EM_ANDAMENTO":
      return <Clock className={`${cls} text-blue-700`} aria-hidden="true" />
    case "DISPONIVEL":
      return <Circle className={`${cls} text-blue-700`} aria-hidden="true" />
    case "A_REVISAR":
      return <RotateCcw className={`${cls} text-amber-700`} aria-hidden="true" />
    case "NAO_REALIZADO":
    case "CANCELADO":
      return <MinusCircle className={`${cls} text-slate-500`} aria-hidden="true" />
    default:
      return <CircleDashed className={`${cls} text-gray-400`} aria-hidden="true" />
  }
}

export interface AcoesDoDesenho {
  onConcluir: (p: PassoFluxo, acao: AcaoConcluir) => void
  onVoltar: (p: PassoFluxo) => void
  onIrParaPeca: (tipo: string | null) => void
  onDispensarParecer: () => void
}

export function DesenhoFaseInterna({
  licitacaoId,
  dados,
  interna,
  ocupado,
  acoes,
}: {
  licitacaoId: string
  dados: EtapasFluxoResposta
  interna: boolean
  ocupado: boolean
  acoes: AcoesDoDesenho
}) {
  const colunas = colunasDoDesenho(dados)
  const passos = todosOsPassos(dados)
  return (
    <div className="space-y-2">
      <Legenda />
      <div className="md:overflow-x-auto pb-1" role="region" aria-label="Desenho da fase interna" tabIndex={0}>
        <ol className="flex flex-col gap-2 md:flex-row md:items-stretch md:min-w-max">
          {colunas.map((c, i) => (
            <li key={c.nivel} className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <div className="flex flex-col gap-2 md:w-52">
                <p className="text-[11px] uppercase tracking-wide text-slate-600">
                  {i === 0 ? "Início" : `Depois · passo ${c.nivel}`}
                  {c.passos.length > 1 ? " · lado a lado" : ""}
                </p>
                <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                  {c.passos.map((p) => (
                    <CartaoEtapa key={p.passo} licitacaoId={licitacaoId} p={p} dados={dados} passos={passos} interna={interna} ocupado={ocupado} acoes={acoes} />
                  ))}
                </ul>
              </div>
              {i < colunas.length - 1 && (
                <>
                  <ArrowDown className="mx-auto h-4 w-4 text-slate-400 md:hidden" aria-hidden="true" />
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-400 md:block" aria-hidden="true" />
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Legenda() {
  const itens: Array<[TomSituacao, string]> = [
    ["ok", "concluída"],
    ["atual", "em andamento ou pode começar"],
    ["alerta", "a revisar / reaberta"],
    ["futura", "aguardando a anterior"],
    ["neutra", "não realizada"],
  ]
  return (
    <div className="text-[11px] text-gray-700 space-y-0.5">
      <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Legenda">
        {itens.map(([t, r]) => (
          <li key={t} className="flex items-center gap-1">
            <span className={`inline-block h-1.5 w-4 rounded-full ${TOM[t].barra}`} aria-hidden="true" /> {r}
          </li>
        ))}
      </ul>
      <p>Etapas na mesma coluna andam ao mesmo tempo; uma etapa só começa quando terminam as de que ela depende.</p>
    </div>
  )
}

function CartaoEtapa({
  licitacaoId,
  p,
  dados,
  passos,
  interna,
  ocupado,
  acoes,
}: {
  licitacaoId: string
  p: PassoFluxo
  dados: EtapasFluxoResposta
  passos: PassoFluxo[]
  interna: boolean
  ocupado: boolean
  acoes: AcoesDoDesenho
}) {
  const a = acoesDoPasso(p, { interna, permissoes: dados.permissoes, passos })
  const tom = p.reaberta && p.situacao !== "CONCLUIDO" ? TOM.alerta : TOM[SITUACAO_DO_PASSO[p.situacao]?.tom ?? "futura"]
  const tela = telaDoPasso(p.passo)
  const tarefa = p.tarefa
  const aberta = tarefa?.status === "ABERTA"
  const encerrada = p.situacao === "CONCLUIDO" || p.situacao === "NAO_REALIZADO" || p.situacao === "CANCELADO"
  const responsavel = aberta ? tarefa!.responsavel.rotulo : p.responsavel_previsto?.rotulo
  const parecer = p.passo === "PARECER" ? dados.parecer : null
  const podeDispensar =
    !!parecer?.dispensavel_por_ato && !parecer.dispensa && !!dados.permissoes?.dispensar_parecer && interna && !encerrada && a.podeIniciar
  const semInicio = a.aguardando.length > 0

  return (
    <li className={`rounded-md border bg-white shadow-sm overflow-hidden ${p.situacao === "AGUARDANDO" ? "border-gray-200" : "border-gray-300"}`}>
      <div className={`h-1 ${tom.barra}`} aria-hidden="true" />
      <div className="p-2 space-y-1 text-xs">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-semibold leading-snug text-gray-900">{p.titulo}</p>
          {p.opcional && <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-700">opcional</span>}
        </div>
        <p className={`flex items-center gap-1 font-medium ${tom.texto}`}>
          <IconeSituacao p={p} />
          {textoDaSituacao(p)}
        </p>
        {!encerrada && responsavel && <p className="text-gray-700">Responsável: {responsavel}</p>}
        {aberta ? (
          <p className={tarefa!.atrasada ? "font-semibold text-red-800" : "text-gray-700"}>Prazo: {rotuloPrazo(tarefa!)}</p>
        ) : !encerrada && p.prazo_dias_uteis ? (
          <p className="text-gray-600">Prazo: {p.prazo_dias_uteis} dias úteis</p>
        ) : null}
        {p.pecas.length > 0 && (
          <p className="text-gray-600">
            {p.pecas.map((x, i) => (
              <span key={x.tipo}>
                {i > 0 && " · "}
                {x.titulo}
                {x.pronta && <span className="text-green-700" aria-label=" (pronta)"> ✓</span>}
              </span>
            ))}
          </p>
        )}
        {semInicio && <p className="rounded bg-gray-50 px-1.5 py-1 text-gray-800">Aguardando: {a.aguardando.join(", ")}</p>}
        {p.reaberta && p.situacao !== "CONCLUIDO" && (
          <p className="text-amber-900">Voltou{p.reaberta.por_nome ? ` (${p.reaberta.por_nome})` : ""}: {p.reaberta.motivo}</p>
        )}
        {p.a_revisar && <p className="text-amber-900">A revisar: {p.a_revisar.motivo}</p>}
        {p.conclusao === "REGISTRO" && p.registro?.texto && p.situacao === "CONCLUIDO" && (
          <p className="text-green-900">Despacho: {p.registro.texto}{p.registro.por_nome ? ` (${p.registro.por_nome})` : ""}</p>
        )}
        {parecer?.dispensa && (
          <p className="text-green-900">
            Dispensado por ato do jurídico — nº {parecer.dispensa.numero_ato}, de {fmtDia(parecer.dispensa.data_ato)} (art. 53, §5º)
          </p>
        )}
        {p.bloqueio_portao?.length ? (
          <div className="rounded border border-[#E8B48C] bg-[#FBEBDD] px-1.5 py-1 text-[#7A3505]">
            <p className="font-medium">
              {TRAVAS_DA_LEI.A.rotulo} <AjudaTravaDaLei destaque="A" />
            </p>
            <p>Não conclui enquanto:</p>
            <ul className="list-disc pl-4">
              {p.bloqueio_portao.map((b, i) => <li key={i}>{textoDaTrava(b).replace(/^Trava da lei — [^—]+— /, "")}</li>)}
            </ul>
          </div>
        ) : null}
        {aberta === false && tarefa?.status === "CONCLUIDA" && p.situacao === "CONCLUIDO" && tarefa.concluida_por_nome && (
          <p className="text-gray-600">Concluída por {tarefa.concluida_por_nome} em {fmtDia(tarefa.concluida_em)}</p>
        )}

        <div className="flex flex-wrap gap-1 pt-1">
          {a.abrir && !semInicio && tela && (
            <Button asChild size="sm" variant={encerrada ? "ghost" : "outline"} className="h-7 px-2 text-[11px]">
              <Link href={rotaDaTela(licitacaoId, tela)}>{encerrada ? "Abrir" : "Abrir a etapa"}</Link>
            </Button>
          )}
          {a.abrir && !semInicio && !tela && !encerrada && p.peca_pendente && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => acoes.onIrParaPeca(p.peca_pendente)}>
              Ir para a peça
            </Button>
          )}
          {a.concluir && (
            <Button size="sm" className="h-7 px-2 text-[11px]" disabled={ocupado} onClick={() => acoes.onConcluir(p, a.concluir!)}>
              {a.concluir.rotulo}
            </Button>
          )}
          {podeDispensar && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={ocupado} onClick={acoes.onDispensarParecer}>
              <Scale className="w-3 h-3 mr-1" aria-hidden="true" /> Dispensar parecer (ato do jurídico)
            </Button>
          )}
          {a.voltar && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-amber-900" disabled={ocupado} onClick={() => acoes.onVoltar(p)}>
              <Undo2 className="w-3 h-3 mr-1" aria-hidden="true" /> Voltar
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
