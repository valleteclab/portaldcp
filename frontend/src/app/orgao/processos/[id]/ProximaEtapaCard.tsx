import type { Etapa } from "./etapas"

const QUANDO: Record<string, { libera: (dispensa: boolean) => string; texto: (dispensa: boolean) => string }> = {
  publicacao: {
    libera: () => "Libera quando o checklist estiver completo",
    texto: () => "Envio do aviso/edital ao PNCP. O prazo de propostas só começa quando o PNCP confirmar a publicação (arts. 54 e 55).",
  },
  propostas: {
    libera: () => "Libera quando o PNCP confirmar a publicação",
    texto: (d) =>
      d
        ? "Durante o prazo: quantidade de propostas (quem propôs e os valores ficam em sigilo) e avisos oficiais do órgão. Depois: etapa de lances e negociação só com o melhor classificado, registrada no processo."
        : "Recebimento das propostas (sigilosas até a abertura da sessão) e o prazo de impugnação e esclarecimento (art. 164).",
  },
  disputa: {
    libera: () => "Libera no fim do recebimento de propostas",
    texto: () => "Sessão pública na sala: disputa de lances conforme o modo definido no edital.",
  },
  julgamento: {
    libera: (d) => (d ? "Libera com o fim do prazo e da etapa de lances" : "Libera ao encerrar a disputa"),
    texto: (d) =>
      d
        ? "Julgamento por menor preço por item (valor final = proposta ou lance) e negociação privada com o vencedor (IN SEGES 67/2021, art. 16)."
        : "Aceitação da proposta, desempate ME/EPP e negociação com o melhor classificado (art. 61).",
  },
  habilitacao: {
    libera: () => "Libera depois do julgamento",
    texto: () => "Conferência dos documentos de habilitação do vencedor (arts. 62 a 70).",
  },
  recurso: {
    libera: () => "Libera depois da habilitação",
    texto: () => "Intenção e razões de recurso (art. 165) e a decisão.",
  },
  homologacao: {
    libera: () => "Libera com o resultado adjudicado",
    texto: () => "Adjudicação e homologação pela autoridade competente (art. 71).",
  },
  contrato: {
    libera: () => "Libera com a homologação",
    texto: () => "O contrato (ou a ata) é gerado na homologação; assinatura eletrônica e publicação no PNCP (art. 94).",
  },
  resultado: {
    libera: () => "Libera quando o PNCP confirmar a publicação",
    texto: () => "Registro do contratado e do valor.",
  },
  selecao: {
    libera: () => "Libera com a divulgação",
    texto: () => "A disputa acontece na plataforma externa; aqui só se registra o resultado.",
  },
  inscricoes: {
    libera: () => "Libera quando o PNCP confirmar a publicação",
    texto: () => "Inscrições, análise e contratações pela regra do edital (arts. 78 e 79).",
  },
}

/** PRÓXIMA ETAPA (bloqueada) — card tracejado explicando quando libera. */
export function ProximaEtapaCard({ etapa, dispensa }: { etapa: Etapa | null; dispensa: boolean }) {
  if (!etapa || etapa.estado !== "futura") return null
  const q = QUANDO[etapa.chave]
  if (!q) return null
  return (
    <section aria-label="Próxima etapa (bloqueada)" className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/60 p-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Próxima etapa · bloqueada</p>
          <h2 className="text-base font-semibold text-gray-800">{etapa.titulo}</h2>
        </div>
        <p className="text-xs text-gray-700">{q.libera(dispensa)}</p>
      </div>
      <p className="text-sm text-gray-700 mt-1">{q.texto(dispensa)}</p>
    </section>
  )
}
