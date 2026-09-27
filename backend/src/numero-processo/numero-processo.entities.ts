import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Configuração da numeração do processo administrativo do órgão (1 linha por
 * órgão). Sem linha, ou `mascara` NULL, vale a máscara padrão
 * (`{ano}/{seq:5}` — mascara-numero-processo.ts).
 */
@Entity('numeracao_processo_orgao')
export class NumeracaoProcessoOrgao {
  @PrimaryColumn({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  mascara: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  atualizado_por: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * Último sequencial usado por órgão/ano. Incremento atômico
 * (`INSERT … ON CONFLICT … DO UPDATE … RETURNING`): dois processos criados ao
 * mesmo tempo nunca recebem o mesmo número. Um órgão não lê nem altera a
 * linha de outro (chave = órgão + ano).
 */
@Entity('sequencias_numero_processo')
export class SequenciaNumeroProcesso {
  @PrimaryColumn({ type: 'uuid' })
  orgao_id: string;

  @PrimaryColumn({ type: 'int' })
  ano: number;

  @Column({ type: 'int', default: 0 })
  ultimo: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
