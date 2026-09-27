import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { RegimeAutos } from '../../licitacoes/autos/juntadas-regras';

/**
 * REGIME DOS AUTOS DO PROCESSO (decisão do dono de 27/09/2026).
 *
 *  - CRONOLOGICO (padrão; processo sem linha aqui): autos na ordem de
 *    juntada, folhas definitivas (`juntadas_autos`).
 *  - LOGICO_LEGADO: processo JÁ PUBLICADO antes da regra — os autos continuam
 *    montados como foram (ordem lógica, folhas do PDF), para não mudar autos
 *    que já saíram. A linha registra o motivo (o "registro" pedido pelo dono).
 *
 * Gravada pela migração de boot (uma vez por processo); o processo cujas
 * folhas foram recalculadas também ganha a linha CRONOLOGICO com o antes e o
 * depois em `detalhe`.
 */
@Entity('autos_processo')
export class AutosProcesso {
  @PrimaryColumn({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 20 })
  regime: RegimeAutos;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  definido_em: Date;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detalhe: any;
}
