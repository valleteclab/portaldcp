/**
 * ============================================================================
 * ENTIDADE: ETAPA DE OS (Ordem de Serviço com EtapaCronograma)
 * ============================================================================
 *
 * Vincula uma requisição tipo ORDEM_SERVICO às etapas do cronograma (EtapaCronograma).
 * Usado quando modo_os = ORDEM_DEMANDA e contrato usa etapas (obras/engenharia).
 *
 * ============================================================================
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Requisicao } from './requisicao.entity';
import { EtapaCronograma } from '../../contratos/entities/etapa-cronograma.entity';

@Entity('requisicao_etapas_os')
export class RequisicaoEtapaOS {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Requisicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requisicao_id' })
  requisicao: Requisicao;

  @Column()
  requisicao_id: string;

  @ManyToOne(() => EtapaCronograma, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'etapa_id' })
  etapa: EtapaCronograma;

  @Column()
  etapa_id: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  percentual_solicitado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_solicitado: number;

  @CreateDateColumn()
  created_at: Date;
}
