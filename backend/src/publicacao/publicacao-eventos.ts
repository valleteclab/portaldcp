import { Injectable, Logger } from '@nestjs/common';

/**
 * Eventos de DOMÍNIO da publicação (plano E7a), para quem integra (PNCP —
 * E7b): além dos eventos de transição (TransicoesEventos: RETIFICAR_EDITAL,
 * INTENCAO_REVOGAR/ANULAR, REVOGAR/ANULAR), estes trazem os dados do ato.
 *
 *  - EDITAL_RETIFICADO: nova versão do edital divulgada — o PNCP retifica a
 *    compra e publica o novo arquivo (`EditalService.editalVigente`).
 *  - INTENCAO_EXTINCAO_ABERTA / INTENCAO_EXTINCAO_CANCELADA: prazo de
 *    manifestação do art. 71 §3º aberto/cancelado (a revogação/anulação em si
 *    é a transição REVOGAR/ANULAR).
 *
 * Emitido DEPOIS do commit; ouvinte que falha é logado e não afeta o ato.
 */
export type EventoPublicacao =
  | {
      tipo: 'EDITAL_RETIFICADO';
      licitacao_id: string;
      orgao_id: string | null;
      retificacao_id: string;
      numero: number;
      afeta_propostas: boolean;
      motivo: string;
      alteracoes: string;
      documento_id: string | null;
      versao_edital: number | null;
      hash_edital: string | null;
      cronograma_novo: Record<string, string | null> | null;
      ocorrido_em: Date;
    }
  | {
      tipo: 'INTENCAO_EXTINCAO_ABERTA' | 'INTENCAO_EXTINCAO_CANCELADA';
      licitacao_id: string;
      orgao_id: string | null;
      extincao_id: string;
      extincao: 'REVOGAR' | 'ANULAR';
      motivo: string;
      prazo_fim: Date;
      ocorrido_em: Date;
    };

export type OuvintePublicacao = (evento: EventoPublicacao) => void | Promise<void>;

@Injectable()
export class PublicacaoEventos {
  private readonly logger = new Logger(PublicacaoEventos.name);
  private readonly ouvintes = new Set<OuvintePublicacao>();

  inscrever(ouvinte: OuvintePublicacao): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  emitir(evento: EventoPublicacao): void {
    for (const ouvinte of this.ouvintes) {
      Promise.resolve()
        .then(() => ouvinte(evento))
        .catch((e: any) => this.logger.warn(`Ouvinte de publicação falhou (${evento.tipo} ${evento.licitacao_id}): ${e?.message ?? e}`));
    }
  }
}
