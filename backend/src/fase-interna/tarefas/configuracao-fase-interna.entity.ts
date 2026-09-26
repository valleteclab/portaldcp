import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

/**
 * Configuração da fase interna do órgão (Entrega 2). Uma linha por órgão;
 * sem linha, vale o padrão (`configEfetiva`): modo SIMPLES, controle interno
 * desativado, prazos da Portaria 089/2024 (Câmara de LEM) como modelo.
 */
@Entity('configuracoes_fase_interna')
export class ConfiguracaoFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'uuid', unique: true })
  orgao_id: string;

  /** SIMPLES (padrão: tudo para o responsável do processo) | POR_SETOR. */
  @Column({ type: 'varchar', length: 20, default: 'SIMPLES' })
  modo: string;

  /** Etapa de controle interno (entre o parecer e a publicação). */
  @Column({ type: 'boolean', default: false })
  controle_interno_ativo: boolean;

  /** Passo → { papel, setor_id } (modo POR_SETOR). */
  @Column({ type: 'jsonb', nullable: true })
  responsaveis: Record<string, { papel: string | null; setor_id: string | null }> | null;

  /** Passo → prazo em dias úteis (null = sem prazo). */
  @Column({ type: 'jsonb', nullable: true })
  prazos: Record<string, number | null> | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  atualizado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  atualizado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
