import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { EmpenhoFator } from '../fator-transparencia.service';

/** Vínculo financeiro auditável. Não modifica execução ou saldo contratual. */
@Entity('conciliacoes_pagamento')
@Index('IDX_conciliacao_pagamento_contrato', ['contrato_id'])
@Index('IDX_conciliacao_pagamento_origem', ['orgao_id', 'pagamento_chave'])
export class ConciliacaoPagamento {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') contrato_id: string;
  @Column('uuid') orgao_id: string;
  @Column('uuid') medicao_id: string;
  @Column({ length: 64 }) pagamento_chave: string;
  @Column({ type: 'jsonb' }) pagamento: EmpenhoFator;
  @Column({ type: 'decimal', precision: 15, scale: 2 }) valor: number;
  @Column('text') justificativa: string;
  @Column() usuario_id: string;
  @Column() usuario_nome: string;
  @CreateDateColumn() criado_em: Date;
  @Column({ type: 'timestamp', nullable: true }) cancelado_em: Date | null;
  @Column({ type: 'varchar', nullable: true }) cancelado_por: string | null;
  @Column({ type: 'text', nullable: true }) motivo_cancelamento: string | null;
}
