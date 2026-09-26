"use client"

import type { ReactNode } from "react"
import { fmtBrasilia } from "@/lib/publicacao"
import { FASES_INTERNAS, ROTULO_CRITERIO, rotuloModalidade } from "@/lib/licitacao-rotulos"
import { ImpugnacoesEsclarecimentos } from "./ImpugnacoesEsclarecimentos"
import { fmtMoeda, type MensagemDispensa, type ProcessoCompleto, type RegrasChat } from "./tipos"

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-lg border bg-white p-4">
      <h2 className="text-sm font-semibold mb-2">{titulo}</h2>
      {children}
    </section>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-gray-600">{rotulo}</dt>
      <dd className="text-gray-900 break-words">{valor}</dd>
    </div>
  )
}

const pendente = (t: string) => <span className="text-gray-600">{t}</span>

/**
 * COLUNA LATERAL: dados da contratação, prazos (horário de Brasília — a data
 * final é recalculada quando o PNCP confirma) e comunicação. Na DISPENSA não
 * há impugnação nem esclarecimento formal (a IN SEGES 67/2021 não prevê; o
 * art. 164 é do edital de licitação): o bloco é "Mensagens/avisos" (IN 67,
 * art. 10). Nas licitações, impugnações e esclarecimentos (art. 164).
 */
export function ColunaLateral({
  dados,
  mensagens,
  regras,
}: {
  dados: ProcessoCompleto
  mensagens: MensagemDispensa[]
  regras: RegrasChat | null
}) {
  const l = dados.licitacao
  const dispensa = l.modalidade === "DISPENSA_ELETRONICA"
  const interna = FASES_INTERNAS.includes(l.fase)
  const aguardando = l.fase === "AGUARDANDO_DIVULGACAO"
  const ativos = dados.itens.filter((i) => i.status !== "CANCELADO")
  const valor = Number(l.valor_total_estimado || 0) || ativos.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario_estimado || 0), 0)
  const avisos = mensagens.filter((m) => m.autor_tipo === "ORGAO").length

  return (
    <div className="space-y-4">
      <Bloco titulo="Dados da contratação">
        <dl>
          <Linha rotulo="Modalidade" valor={`${rotuloModalidade(l.modalidade)}${l.srp ? " (SRP)" : ""}`} />
          <Linha rotulo="Fundamento" valor={l.fundamento_legal || pendente("—")} />
          <Linha rotulo="Critério" valor={(l.criterio_julgamento && ROTULO_CRITERIO[l.criterio_julgamento]) || l.criterio_julgamento || pendente("—")} />
          <Linha rotulo="Valor estimado" valor={fmtMoeda(valor)} />
          <Linha rotulo="Unidade" valor={l.unidade_compradora || pendente("não informada")} />
          <Linha rotulo="Agente" valor={l.agente_contratacao || pendente("não designado")} />
          <Linha rotulo="Autoridade" valor={l.autoridade ? `${l.autoridade.nome}${l.autoridade.cargo ? ` / ${l.autoridade.cargo}` : ""}` : pendente("não cadastrada")} />
          <Linha rotulo="Nº PNCP" valor={l.numero_controle_pncp ? <span className="font-mono text-xs">{l.numero_controle_pncp}</span> : pendente("ainda não gerado")} />
        </dl>
      </Bloco>

      <Bloco titulo="Prazos">
        <dl>
          <Linha
            rotulo="Publicação no PNCP"
            valor={
              l.data_divulgacao_oficial
                ? fmtBrasilia(l.data_divulgacao_oficial)
                : aguardando
                  ? <span className="text-red-700 font-medium">Pendente</span>
                  : interna
                    ? pendente("Após publicar")
                    : pendente("—")
            }
          />
          <Linha
            rotulo="Fim das propostas"
            valor={
              interna || aguardando || !(l.data_fim_acolhimento || l.data_abertura_sessao)
                ? dispensa ? "Publicação + 3 dias úteis" : "Publicação + prazo do art. 55"
                : fmtBrasilia(l.data_fim_acolhimento || l.data_abertura_sessao)
            }
          />
          {!dispensa && l.data_abertura_sessao && !interna && !aguardando && <Linha rotulo="Abertura da sessão" valor={fmtBrasilia(l.data_abertura_sessao)} />}
          <Linha rotulo="Fuso do órgão" valor="America/Bahia (UTC−3)" />
        </dl>
        <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-gray-700">
          A data final é recalculada automaticamente quando o PNCP confirma a publicação, usando o calendário de dias úteis do órgão.
        </p>
      </Bloco>

      {dispensa ? (
        <Bloco titulo="Mensagens e avisos">
          <p className="text-sm text-gray-800">{regras?.rotulo || (interna || aguardando ? "Fechado até a publicação" : "Mensagens do processo")}</p>
          {regras?.explicacao && <p className="text-xs text-gray-700 mt-1">{regras.explicacao}</p>}
          <p className="text-xs text-gray-700 mt-2">
            {mensagens.length} mensagem(ns) · {avisos} aviso(s) do órgão.{" "}
            {mensagens.length > 0 || regras?.orgao_pode_enviar ? <a href="#mensagens-dispensa" className="text-blue-800 hover:underline">Ir para as mensagens</a> : null}
          </p>
          {/* Sem impugnação/esclarecimento formal na dispensa; registros antigos, se houver, continuam visíveis */}
          <div className="mt-2">
            <ImpugnacoesEsclarecimentos licitacaoId={l.id} dispensa />
          </div>
        </Bloco>
      ) : !interna && !l.selecao_externa ? (
        <ImpugnacoesEsclarecimentos licitacaoId={l.id} />
      ) : null}
    </div>
  )
}
