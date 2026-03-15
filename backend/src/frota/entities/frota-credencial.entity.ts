import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { FrotaContrato } from './frota-contrato.entity';

export enum TipoCredencialFrota {
  POSTO = 'POSTO',
  VEREADOR = 'VEREADOR',
  /** Portal único por órgão — um link para todos os vereadores acessarem com codigo+senha */
  VEREADOR_PORTAL = 'VEREADOR_PORTAL',
}

@Entity('frota_credenciais')
export class FrotaCredencial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TipoCredencialFrota })
  tipo: TipoCredencialFrota;

  /** Nome de exibição: "Ver. João Ribeiro" ou "Posto Shell ABC" */
  @Column()
  nome: string;

  /** Código de login (ex: VER001, POSTO01) — único por órgão */
  @Column()
  codigo_acesso: string;

  @Column()
  senha_hash: string;

  /** Cargo (para vereador): "Vereador", "Presidente" */
  @Column({ nullable: true })
  solicitante_cargo: string;

  /** Cota mensal em litros (para vereador) */
  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  cota_mensal_litros: number;

  /** IDs dos veículos vinculados ao vereador (JSON array) */
  @Column({ type: 'simple-json', nullable: true })
  veiculo_ids: string[];

  /** Slug único para URL do posto: /frota/posto/{url_slug} */
  @Column({ nullable: true, unique: true })
  url_slug: string;

  /** Contrato de abastecimento vinculado a este posto (para saber qual contrato/preço usar) */
  @ManyToOne(() => FrotaContrato, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: FrotaContrato;

  @Column({ nullable: true })
  contrato_id: string | null;

  @Column({ default: true })
  ativo: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  ultimo_acesso: Date;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
