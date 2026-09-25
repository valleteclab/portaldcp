import { Injectable, Logger } from '@nestjs/common';
import { EventoTransicao } from './transicoes.tipos';

export type OuvinteTransicao = (evento: EventoTransicao) => void | Promise<void>;

/**
 * Barramento TIPADO dos eventos de transição (o projeto não tem
 * @nestjs/event-emitter). Outros módulos se inscrevem no `onModuleInit`:
 *
 *   constructor(private readonly eventos: TransicoesEventos) {}
 *   onModuleInit() {
 *     this.eventos.inscrever((e) => { if (e.ato === AtoLicitacao.HOMOLOGAR) ... });
 *   }
 *
 * Emitido DEPOIS do commit. Ouvinte que falha é logado e não afeta a
 * transição nem os demais ouvintes (efeitos colaterais como PNCP/contrato
 * continuam, por ora, nos métodos do LicitacoesService — E7 os move para cá).
 */
@Injectable()
export class TransicoesEventos {
  private readonly logger = new Logger(TransicoesEventos.name);
  private readonly ouvintes = new Set<OuvinteTransicao>();

  /** Inscreve um ouvinte; devolve a função que cancela a inscrição. */
  inscrever(ouvinte: OuvinteTransicao): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  emitir(evento: EventoTransicao): void {
    for (const ouvinte of this.ouvintes) {
      Promise.resolve()
        .then(() => ouvinte(evento))
        .catch((e: any) =>
          this.logger.warn(`Ouvinte de transição falhou (${evento.ato} ${evento.licitacao_id}): ${e?.message ?? e}`),
        );
    }
  }
}
