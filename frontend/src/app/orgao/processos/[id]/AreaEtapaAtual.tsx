"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ResultadoPanel } from "@/components/resultado/ResultadoPanel"
import { CotasMeEppCard } from "@/components/licitacao/CotasMeEppCard"
import { LeilaoPainel } from "@/components/modalidades/LeilaoPainel"
import { ConcursoPainel } from "@/components/modalidades/ConcursoPainel"
import { DialogoPainel } from "@/components/modalidades/DialogoPainel"
import { FASES_INTERNAS } from "@/lib/licitacao-rotulos"
import { ROTULO_SITUACAO, situacaoDaLicitacao } from "@/lib/licitacao-situacao"
import { BllIntegracao } from "./BllIntegracao"
import { ChecklistPrePublicacao } from "./ChecklistPrePublicacao"
import { ContratosProcesso } from "./ContratosProcesso"
import { EtapaDispensa } from "./EtapaDispensa"
import { ConsumoLimiteDispensa } from "./ConsumoLimiteDispensa"
import { PecasFaseInterna } from "./PecasFaseInterna"
import { PublicacaoEdital, MODALIDADES_COMPETITIVAS } from "./PublicacaoEdital"
import { SessaoPublicaCard } from "./SessaoPublicaCard"
import {
  SITUACOES_ENCERRADAS,
  type ConferenciaPrePublicacao, type MensagemDispensa, type ProcessoCompleto, type RegrasChat, type SituacaoDivulgacao,
} from "./tipos"

/**
 * ÁREA DA ETAPA ATUAL (coluna principal) — muda com a fase; o layout é o
 * mesmo para todas as modalidades:
 *  - fase interna / aguardando o PNCP: checklist de pré-publicação + peças da
 *    fase interna ("fazer aqui · anexar PDF · não se aplica"), consumo do
 *    limite da dispensa e publicação do edital nas licitações;
 *  - dispensa publicada: recebimento (quantidade sigilosa + avisos), lances,
 *    julgamento e negociação com o vencedor;
 *  - licitações: sessão pública (sala), resultado, contratos;
 *  - seleção externa: registro do resultado + integração BLL.
 */
export function AreaEtapaAtual({
  dados,
  conferencia,
  divulgacao,
  mensagens,
  regras,
  onMensagem,
  onDivulgarAviso,
  onCancelarPublicacao,
  onRegistrarResultadoExterno,
  onAtualizado,
}: {
  dados: ProcessoCompleto
  conferencia: ConferenciaPrePublicacao | null
  divulgacao: SituacaoDivulgacao | null
  mensagens: MensagemDispensa[]
  regras: RegrasChat | null
  onMensagem: () => void
  onDivulgarAviso: () => void
  onCancelarPublicacao: () => void
  onRegistrarResultadoExterno: (() => void) | null
  onAtualizado: () => void
}) {
  const l = dados.licitacao
  const { checklist } = dados
  const id = l.id
  const interna = FASES_INTERNAS.includes(l.fase)
  const aguardando = l.fase === "AGUARDANDO_DIVULGACAO"
  const dispensa = l.modalidade === "DISPENSA_ELETRONICA"
  const situacao = situacaoDaLicitacao(l)
  const encerrada = SITUACOES_ENCERRADAS.includes(situacao) && situacao !== "CONCLUIDA"
  const ativa = situacao === "ATIVA"
  // Resultado único (E6): adjudicação/homologação no ResultadoPanel
  const mostrarResultado =
    checklist.resultado_registrado ||
    ["HABILITACAO", "RECURSO", "ADJUDICACAO", "HOMOLOGACAO"].includes(l.fase) ||
    (["LEILAO", "CONCURSO"].includes(l.modalidade) && l.fase === "JULGAMENTO")


  return (
    <div className="space-y-5">
      {encerrada && (
        <div className="rounded-md border border-gray-300 bg-gray-50 p-3 text-sm" role="status">
          Processo encerrado: <b>{ROTULO_SITUACAO[situacao]}</b>. Nenhum ato adicional é possível; os registros continuam nas abas abaixo.
        </div>
      )}
      {situacao === "SUSPENSA" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          Processo suspenso — os prazos e atos ficam parados até a retomada (menu &quot;Mais ações&quot; → Retomar).
        </div>
      )}

      {/* Painéis próprios das modalidades especiais */}
      {l.modalidade === "CREDENCIAMENTO" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm flex items-center justify-between gap-2 flex-wrap">
          <span>
            Credenciamento (Lei 14.133/2021, arts. 78, I, e 79): edital, inscrições, análise, contratações pela regra do edital e
            descredenciamento ficam no painel do credenciamento.
          </span>
          <Link href={`/orgao/credenciamentos/${id}`} className="text-blue-800 font-medium hover:underline">Abrir painel do credenciamento</Link>
        </div>
      )}
      {l.modalidade === "LEILAO" && <LeilaoPainel licitacaoId={id} onAtualizado={onAtualizado} />}
      {l.modalidade === "CONCURSO" && <ConcursoPainel licitacaoId={id} onAtualizado={onAtualizado} />}
      {l.modalidade === "DIALOGO_COMPETITIVO" && <DialogoPainel licitacaoId={id} onAtualizado={onAtualizado} />}

      {/* Publicação: checklist de pré-publicação (fase interna e aguardando o PNCP) */}
      {(interna || aguardando) && !encerrada && (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <ChecklistPrePublicacao
            licitacaoId={id}
            dados={dados}
            conferencia={conferencia}
            divulgacao={divulgacao}
            onDivulgarAviso={onDivulgarAviso}
            onCancelarPublicacao={onCancelarPublicacao}
            onAtualizado={onAtualizado}
          />
          {dispensa && <ConsumoLimiteDispensa licitacaoId={id} atualizacao={dados} />}
          {interna && (
            <PecasFaseInterna licitacaoId={id} mostrarCopiloto={!l.preparacao_automatica || l.preparacao_automatica.status === "ERRO"} atualizacao={dados} onAtualizado={onAtualizado} />
          )}
          {interna && (
            <div id="cotas-me-epp">
              <CotasMeEppCard licitacaoId={id} onGerado={onAtualizado} />
            </div>
          )}
          {MODALIDADES_COMPETITIVAS.includes(l.modalidade) && l.fase === "APROVACAO_INTERNA" && ativa && (
            <div id="publicacao-edital">
              <PublicacaoEdital licitacaoId={id} licitacao={l} onAtualizado={onAtualizado} />
            </div>
          )}
        </div>
      )}

      {/* Dispensa publicada: recebimento, lances, julgamento e negociação */}
      {dispensa && !l.selecao_externa && !interna && !aguardando && !checklist.homologado && !encerrada && (
        <div className="rounded-lg border bg-white p-4">
          <EtapaDispensa licitacaoId={id} dados={dados} mensagens={mensagens} regras={regras} onMensagem={onMensagem} onAtualizado={onAtualizado} />
        </div>
      )}

      {/* Licitações: sessão pública (sala do agente/pregoeiro) */}
      {MODALIDADES_COMPETITIVAS.includes(l.modalidade) && !l.selecao_externa && !aguardando && (
        <SessaoPublicaCard
          licitacaoId={id}
          fase={l.fase}
          criterioJulgamento={l.criterio_julgamento}
          dataAbertura={l.data_abertura_sessao}
          propostas={dados.propostas}
          propostasEmSigilo={dados.propostas_em_sigilo}
        />
      )}

      {/* Seleção externa: a disputa foi fora — registre o resultado */}
      {l.selecao_externa && !checklist.homologado && !encerrada && (
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Etapa atual</p>
          <h2 className="text-lg font-semibold">Seleção em plataforma externa</h2>
          <p className="text-sm text-gray-700">
            Disputa em {l.plataforma_externa || "plataforma externa"}
            {l.numero_processo_externo ? ` — nº ${l.numero_processo_externo}` : ""}. Registre o vencedor e o valor de cada item; a homologação gera o contrato.
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            {onRegistrarResultadoExterno && (
              <Button size="sm" onClick={onRegistrarResultadoExterno}>
                {checklist.resultado_registrado ? "Editar resultado externo" : "Registrar resultado externo"}
              </Button>
            )}
            {l.url_externa && (
              <a href={l.url_externa} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-800 hover:underline">Ver na plataforma</a>
            )}
          </div>
        </div>
      )}

      {mostrarResultado && <ResultadoPanel licitacaoId={id} onAtualizado={onAtualizado} />}

      {/* Disputa em plataforma externa: troca de arquivos com a BLL Compras */}
      {!dispensa && checklist.possui_itens && (
        <BllIntegracao licitacaoId={id} homologado={!!checklist.homologado} onAtualizado={onAtualizado} />
      )}

      <ContratosProcesso dados={dados} onAtualizado={onAtualizado} />
    </div>
  )
}
