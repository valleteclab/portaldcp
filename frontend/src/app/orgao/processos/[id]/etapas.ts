/**
 * BARRA DE ETAPAS da tela do processo — função PURA (sem React, sem fetch).
 *
 * As etapas dependem da modalidade (Lei 14.133/2021, art. 17, e o rito que o
 * sistema executa — fluxos em backend/src/licitacoes/transicoes/definicoes.ts):
 *  - dispensa eletrônica: planejamento, fase interna, publicação,
 *    propostas/lances, julgamento, habilitação, homologação, contrato
 *    (IN SEGES 67/2021: lances obrigatórios antes do julgamento; não há recurso);
 *  - pregão/concorrência (e diálogo): + disputa, habilitação e recurso;
 *  - leilão e concurso: lances/trabalhos, julgamento, recurso;
 *  - inexigibilidade: instrução, publicação, escolha do contratado;
 *  - credenciamento: instrução, publicação, inscrições e contratações;
 *  - seleção externa: a disputa acontece fora — só o resultado entra aqui.
 *
 * A etapa ATUAL sai da fase gravada pelo backend; estados: ok (concluída),
 * alerta (concluída com ressalva ou suspensa), erro (falha/encerramento),
 * atual e futura.
 */

import { FASES_INTERNAS, rotuloFase } from "@/lib/licitacao-rotulos"

export type EstadoEtapa = "ok" | "alerta" | "erro" | "atual" | "futura"

export interface Etapa {
  chave: string
  titulo: string
  estado: EstadoEtapa
  detalhe: string
}

export interface EntradaEtapas {
  modalidade: string
  fase: string
  situacao?: string | null
  selecao_externa?: boolean
  vinculado_pca: boolean
  documentos_fase_interna: number
  propostas: number
  resultado_registrado: boolean
  homologado: boolean
  contratos: number
  dispensa_lances_fim?: string | null
  /** Falha do PNCP na publicação (banner de divulgação com erro). */
  divulgacao_com_erro?: boolean
  agora?: Date
}

interface DefEtapa {
  chave: string
  titulo: string
  /** Fases do backend em que esta etapa é a atual. */
  fases: string[]
  feita: (e: EntradaEtapas) => string
  atual: (e: EntradaEtapas) => string
  futura: string
}

const PROPOSTAS_ABERTAS = ["PUBLICADO", "IMPUGNACAO", "ACOLHIMENTO_PROPOSTAS"]
const SALA = ["ANALISE_PROPOSTAS", "EM_DISPUTA"]

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

const FASE_INTERNA = (titulo = "Fase interna"): DefEtapa => ({
  chave: "fase_interna",
  titulo,
  fases: FASES_INTERNAS,
  feita: (e) => `Concluída${e.documentos_fase_interna ? ` · ${plural(e.documentos_fase_interna, "doc", "docs")}` : ""}`,
  atual: (e) => `Em andamento · ${rotuloFase(e.fase)}`,
  futura: "",
})

const PUBLICACAO: DefEtapa = {
  chave: "publicacao",
  titulo: "Publicação",
  fases: ["AGUARDANDO_DIVULGACAO"],
  feita: (e) => (e.selecao_externa ? "Divulgada na plataforma" : "Publicada no PNCP"),
  atual: (e) => (e.divulgacao_com_erro ? "Etapa atual · com erro" : "Aguardando o PNCP"),
  futura: "Após a fase interna",
}

const HOMOLOGACAO = (fases = ["ADJUDICACAO"]): DefEtapa => ({
  chave: "homologacao",
  titulo: "Homologação",
  fases,
  feita: () => "Homologado",
  atual: () => "Adjudicar e homologar",
  futura: "Autoridade competente",
})

const CONTRATO: DefEtapa = {
  chave: "contrato",
  titulo: "Contrato",
  fases: [],
  feita: (e) => plural(e.contratos, "contrato gerado", "contratos gerados"),
  atual: () => "Formalizar e assinar",
  futura: "Após homologar",
}

function lancesDispensaEmCurso(e: EntradaEtapas): boolean {
  const fim = e.dispensa_lances_fim ? new Date(e.dispensa_lances_fim) : null
  // IN 67 art. 15: a etapa de lances é obrigatória — até ela terminar, o processo está em propostas/lances
  return !fim || fim.getTime() > (e.agora ?? new Date()).getTime()
}

function definicoes(e: EntradaEtapas): DefEtapa[] {
  const planejamento: DefEtapa = {
    chave: "planejamento",
    titulo: "Planejamento",
    fases: [],
    feita: (x) => (x.vinculado_pca ? "PCA vinculado ou justificado" : "Sem PCA — justificar"),
    atual: () => "",
    futura: "",
  }

  if (e.selecao_externa) {
    return [
      planejamento,
      FASE_INTERNA(),
      { ...PUBLICACAO, fases: ["AGUARDANDO_DIVULGACAO", "PUBLICADO"] },
      {
        chave: "selecao",
        titulo: "Seleção externa",
        fases: ["IMPUGNACAO", "ACOLHIMENTO_PROPOSTAS", ...SALA, "JULGAMENTO", "HABILITACAO", "RECURSO"],
        feita: () => "Resultado registrado",
        atual: () => "Registrar o resultado",
        futura: "Na plataforma externa",
      },
      HOMOLOGACAO(),
      CONTRATO,
    ]
  }

  switch (e.modalidade) {
    case "DISPENSA_ELETRONICA": {
      const emLances = lancesDispensaEmCurso(e)
      return [
        planejamento,
        FASE_INTERNA("Fase interna"),
        PUBLICACAO,
        {
          chave: "propostas",
          titulo: "Propostas/lances",
          fases: [...PROPOSTAS_ABERTAS, ...(emLances ? SALA : [])],
          feita: (x) => plural(x.propostas, "proposta", "propostas"),
          atual: (x) => (PROPOSTAS_ABERTAS.includes(x.fase) ? "Recebendo propostas" : "Etapa de lances (IN 67, art. 11)"),
          futura: "Após publicar",
        },
        {
          chave: "julgamento",
          titulo: "Julgamento",
          fases: [...(emLances ? [] : SALA), "JULGAMENTO"],
          feita: () => "Julgado",
          atual: () => "Julgar e negociar com o vencedor",
          futura: "Após a etapa de lances",
        },
        {
          chave: "habilitacao",
          titulo: "Habilitação",
          fases: ["HABILITACAO", "RECURSO"],
          feita: () => "Documentos do vencedor (IN 67)",
          atual: () => "Documentos do vencedor",
          futura: "Após o julgamento",
        },
        HOMOLOGACAO(),
        CONTRATO,
      ]
    }
    case "INEXIGIBILIDADE":
      return [
        planejamento,
        FASE_INTERNA("Instrução (art. 72)"),
        PUBLICACAO,
        {
          chave: "resultado",
          titulo: "Contratado",
          fases: [...PROPOSTAS_ABERTAS, ...SALA, "JULGAMENTO", "HABILITACAO", "RECURSO"],
          feita: () => "Resultado registrado",
          atual: () => "Registrar o contratado",
          futura: "Após publicar",
        },
        HOMOLOGACAO(),
        CONTRATO,
      ]
    case "CREDENCIAMENTO":
      return [
        planejamento,
        FASE_INTERNA("Instrução (art. 72)"),
        PUBLICACAO,
        {
          chave: "inscricoes",
          titulo: "Inscrições e contratações",
          fases: [...PROPOSTAS_ABERTAS, ...SALA, "JULGAMENTO", "HABILITACAO", "RECURSO", "ADJUDICACAO", "HOMOLOGACAO"],
          feita: () => "Vigência encerrada",
          atual: () => "Edital vigente (arts. 78 e 79)",
          futura: "Após publicar",
        },
      ]
    case "LEILAO":
    case "CONCURSO": {
      const leilao = e.modalidade === "LEILAO"
      return [
        planejamento,
        FASE_INTERNA(),
        PUBLICACAO,
        {
          chave: "propostas",
          titulo: leilao ? "Lances" : "Trabalhos",
          fases: [...PROPOSTAS_ABERTAS, ...SALA],
          feita: (x) => plural(x.propostas, "participante", "participantes"),
          atual: () => (leilao ? "Recebendo lances" : "Recebendo trabalhos"),
          futura: "Após publicar",
        },
        {
          chave: "julgamento",
          titulo: leilao ? "Julgamento" : "Julgamento (banca)",
          fases: ["JULGAMENTO", "HABILITACAO"],
          feita: () => "Julgado",
          atual: () => "Declarar o resultado",
          futura: leilao ? "Após os lances" : "Após a entrega",
        },
        {
          chave: "recurso",
          titulo: "Recurso",
          fases: ["RECURSO"],
          feita: () => "Sem recurso pendente",
          atual: () => "Prazo recursal (art. 165)",
          futura: "Art. 165",
        },
        HOMOLOGACAO(),
        CONTRATO,
      ]
    }
    default:
      // Pregão, concorrência e diálogo competitivo (FLUXO_COMPETITIVO)
      return [
        planejamento,
        FASE_INTERNA(),
        PUBLICACAO,
        {
          chave: "propostas",
          titulo: "Propostas",
          fases: PROPOSTAS_ABERTAS,
          feita: (x) => plural(x.propostas, "proposta", "propostas"),
          atual: () => "Recebendo propostas",
          futura: "Após publicar",
        },
        {
          chave: "disputa",
          titulo: "Disputa",
          fases: SALA,
          feita: () => "Lances encerrados",
          atual: () => "Sessão pública",
          futura: "Na sala da sessão",
        },
        {
          chave: "julgamento",
          titulo: "Julgamento",
          fases: ["JULGAMENTO"],
          feita: () => "Propostas aceitas",
          atual: () => "Aceitação e negociação",
          futura: "Após a disputa",
        },
        {
          chave: "habilitacao",
          titulo: "Habilitação",
          fases: ["HABILITACAO"],
          feita: () => "Concluída",
          atual: () => "Documentos do vencedor",
          futura: "Após o julgamento",
        },
        {
          chave: "recurso",
          titulo: "Recurso",
          fases: ["RECURSO"],
          feita: () => "Sem recurso pendente",
          atual: () => "Prazo recursal (art. 165)",
          futura: "Art. 165",
        },
        HOMOLOGACAO(),
        CONTRATO,
      ]
  }
}

const ROTULO_ENCERRAMENTO: Record<string, string> = {
  SUSPENSA: "Processo suspenso",
  REVOGADA: "Revogado (art. 71, II)",
  ANULADA: "Anulado (art. 71, III)",
  DESERTA: "Deserta — sem propostas",
  FRACASSADA: "Fracassada",
}

export function etapasDoProcesso(e: EntradaEtapas): Etapa[] {
  const defs = definicoes(e)
  const situacao = e.situacao || "ATIVA"

  // Índice da etapa atual pela fase do backend
  let atual = defs.findIndex((d) => d.fases.includes(e.fase))
  if (e.fase === "HOMOLOGACAO") {
    const iContrato = defs.findIndex((d) => d.chave === "contrato")
    atual = iContrato < 0 ? defs.length : e.contratos > 0 ? defs.length : iContrato
  }
  if (situacao === "CONCLUIDA") atual = defs.length
  if (atual < 0) atual = defs.length > 1 ? 1 : 0

  return defs.map((d, i): Etapa => {
    if (d.chave === "planejamento") {
      return { chave: d.chave, titulo: d.titulo, estado: e.vinculado_pca ? "ok" : "alerta", detalhe: d.feita(e) }
    }
    if (i < atual) return { chave: d.chave, titulo: d.titulo, estado: "ok", detalhe: d.feita(e) }
    if (i > atual) return { chave: d.chave, titulo: d.titulo, estado: "futura", detalhe: d.futura }
    // etapa atual
    if (situacao !== "ATIVA" && ROTULO_ENCERRAMENTO[situacao]) {
      return {
        chave: d.chave,
        titulo: d.titulo,
        estado: situacao === "SUSPENSA" ? "alerta" : "erro",
        detalhe: ROTULO_ENCERRAMENTO[situacao],
      }
    }
    const erro = d.chave === "publicacao" && !!e.divulgacao_com_erro
    return { chave: d.chave, titulo: d.titulo, estado: erro ? "erro" : "atual", detalhe: d.atual(e) }
  })
}

/** Etapa atual (ou null se tudo concluído) e a seguinte — para o card "próxima etapa". */
export function etapaAtualESeguinte(etapas: Etapa[]): { atual: Etapa | null; seguinte: Etapa | null } {
  const i = etapas.findIndex((x) => x.estado === "atual" || x.estado === "erro" || (x.estado === "alerta" && x.chave !== "planejamento"))
  if (i < 0) return { atual: null, seguinte: null }
  return { atual: etapas[i], seguinte: etapas[i + 1] ?? null }
}
