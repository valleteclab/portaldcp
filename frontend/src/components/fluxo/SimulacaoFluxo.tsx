"use client"

import { useState } from "react"
import type { EtapaDesenho, ItemCatalogo, OpcoesDesenho } from "@/lib/fluxo/desenho"

/**
 * TESTAR COM PROCESSO FICTÍCIO (mockup aprovado, tela "Desenhar o fluxo"):
 * percorre o desenho etapa por etapa mostrando quem recebe, o prazo, os avisos
 * que sairiam e o que a etapa exige. É só simulação na tela — não cria
 * processo, não gera número, não grava nada e não envia aviso.
 */

const CANAL: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "e-mail", TEAMS: "Teams" }

/** Soma dias úteis (seg–sex) a partir de hoje, como o motor calcula o prazo. */
function somarDiasUteis(dias: number, base = new Date()): Date {
  const d = new Date(base)
  let restantes = dias
  while (restantes > 0) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) restantes--
  }
  return d
}

export function SimulacaoFluxo({
  etapas,
  catalogo,
  opcoes,
  modelos,
  onFechar,
}: {
  etapas: EtapaDesenho[]
  catalogo: Map<string, ItemCatalogo>
  opcoes: OpcoesDesenho
  modelos: Map<string, Array<{ id: string; nome: string }>>
  onFechar: () => void
}) {
  const [atual, setAtual] = useState(0)
  const [historico, setHistorico] = useState<string[]>([])
  const [chegada, setChegada] = useState(() => new Date())
  const etapa = etapas[atual] ?? null
  const def = etapa ? catalogo.get(etapa.tipo) ?? null : null

  const nomes = (e: EtapaDesenho) =>
    e.responsavel_tipo === "SOLICITANTE"
      ? ["quem abriu o processo"]
      : e.responsaveis.map((id) => (e.responsavel_tipo === "SETOR" ? opcoes.setores : opcoes.usuarios).find((x) => x.id === id)?.nome ?? "—")

  function registrar(texto: string) {
    setHistorico((h) => [...h, texto])
  }
  function concluir() {
    if (!etapa) return
    registrar(`${etapa.nome}: concluída${def?.automatico ? " (automática)" : ""}`)
    setAtual((i) => i + 1)
    setChegada(new Date())
  }
  function devolver() {
    if (!etapa || atual === 0) return
    const destino = etapa.devolver_para ? etapas.findIndex((e) => e.chave === etapa.devolver_para) : atual - 1
    const alvo = destino >= 0 ? destino : atual - 1
    registrar(`${etapa.nome}: devolvida para ${etapas[alvo].nome}`)
    setAtual(alvo)
  }
  function reiniciar() {
    setAtual(0)
    setHistorico([])
    setChegada(new Date())
  }

  const responsaveis = etapa ? nomes(etapa) : []
  const semResponsavel = !!etapa && !def?.automatico && etapa.responsavel_tipo !== "SOLICITANTE" && !etapa.responsaveis.length
  const avisos = etapa?.avisos?.canais?.length ? etapa.avisos : null
  const canalTeams = avisos?.teams_canal_id ? opcoes.teams.find((t) => t.id === avisos.teams_canal_id)?.nome : null
  const modeloNome = etapa?.modelo_documento_id && def?.tipo_documento ? modelos.get(def.tipo_documento)?.find((m) => m.id === etapa.modelo_documento_id)?.nome : null

  return (
    <section className="flex flex-col gap-4 rounded-xl border-2 border-dashed border-[#1B4A63] bg-[#F6F9FB] p-5" aria-labelledby="simulacao">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1B4A63]">Teste com processo fictício</p>
          <h2 id="simulacao" className="text-lg font-bold">
            {etapa ? `Etapa ${atual + 1} de ${etapas.length}: ${etapa.nome}` : "Fluxo concluído na simulação"}
          </h2>
          <p className="text-xs text-[#5A6675]">Simulação: nada é gravado, nenhum número é gerado e nenhum aviso é enviado.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reiniciar} className="rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-sm">
            Recomeçar
          </button>
          <button type="button" onClick={onFechar} className="rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-sm">
            Fechar teste
          </button>
        </div>
      </div>

      {/* Andamento da simulação */}
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Andamento da simulação">
        {etapas.map((e, i) => (
          <li
            key={e.chave}
            className={`rounded-md px-2.5 py-1 text-xs ${i < atual ? "bg-[#E8F5EE] text-[#2E7A55]" : i === atual ? "bg-[#1B4A63] font-semibold text-white" : "border border-[#CBD3DA] bg-white text-[#5A6675]"}`}
          >
            {i < atual ? "✓ " : ""}
            {e.nome}
          </li>
        ))}
      </ol>

      {etapa ? (
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-lg bg-white p-3">
            <b>Quem recebe</b>
            {def?.automatico ? (
              <span>Etapa automática: executa sozinha e o processo segue.</span>
            ) : semResponsavel ? (
              <span className="text-[#9A3412]">Ninguém — sem responsável definido, o processo pararia aqui.</span>
            ) : (
              <span>{responsaveis.join(", ")}</span>
            )}
            {etapa.prazo_dias_uteis ? (
              <span className="text-[#5A6675]">
                Prazo: {etapa.prazo_dias_uteis} dias úteis — chegando hoje, vence em {somarDiasUteis(etapa.prazo_dias_uteis, chegada).toLocaleDateString("pt-BR")}
              </span>
            ) : (
              <span className="text-[#5A6675]">Sem prazo definido.</span>
            )}
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-white p-3">
            <b>Avisos que sairiam</b>
            {def?.automatico && etapa.notificar ? (
              <span>
                {etapa.notificar.canais.map((c) => CANAL[c]).join(", ") || "nenhum canal"} para {etapa.notificar.destinatarios.length} destinatário(s)
                {etapa.notificar.mensagem ? `: “${etapa.notificar.mensagem}”` : ""}
              </span>
            ) : avisos ? (
              <span>
                {avisos.canais.map((c) => (c === "TEAMS" && canalTeams ? `Teams (${canalTeams})` : CANAL[c])).join(", ")}
                {avisos.chegada ? " na chegada" : ""}
                {avisos.chegada && avisos.vespera_prazo ? " e" : ""}
                {avisos.vespera_prazo ? " 1 dia útil antes do prazo" : ""}
              </span>
            ) : (
              <span className="text-[#5A6675]">Nenhum aviso configurado.</span>
            )}
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-white p-3 sm:col-span-2">
            <b>O que a etapa exige</b>
            {def?.documento.produz ? (
              <span>
                Documento: {modeloNome ? `modelo “${modeloNome}”` : "modelo padrão"}
                {etapa.aceita_documento_externo ? "; aceita anexar PDF feito fora" : "; feito no sistema (não aceita PDF pronto)"}.
              </span>
            ) : (
              <span>Decisão ou providência registrada no sistema.</span>
            )}
            {etapa.obrigatoria_lei ?? def?.obrigatoria_lei ? <span className="text-[#8A5A00]">Obrigatória pela {def?.obrigatoria_lei?.fundamento}.</span> : null}
            {atual > 0 ? <span className="text-[#5A6675]">Se devolver: volta para {etapa.devolver_para ? etapas.find((e) => e.chave === etapa.devolver_para)?.nome : etapas[atual - 1].nome}.</span> : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" onClick={concluir} className="rounded-lg bg-[#1B4A63] px-4 py-2 text-sm font-semibold text-white">
              {def?.automatico ? "Executar e seguir" : "Concluir etapa"}
            </button>
            {atual > 0 && !def?.automatico ? (
              <button type="button" onClick={devolver} className="rounded-lg border border-[#CBD3DA] bg-white px-4 py-2 text-sm">
                Devolver
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[#2E7A55]">Todas as etapas foram percorridas. O processo real seguiria encerrado neste ponto.</p>
      )}

      {historico.length ? (
        <div className="text-xs text-[#5A6675]">
          <b>Percurso:</b> {historico.join(" → ")}
        </div>
      ) : null}
    </section>
  )
}
