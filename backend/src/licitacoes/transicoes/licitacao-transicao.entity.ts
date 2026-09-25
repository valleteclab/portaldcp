import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Licitacao } from '../entities/licitacao.entity';

/**
 * HISTÓRICO DE TRANSIÇÕES da licitação (plano E1 §2.3) — uma linha por ato
 * praticado (mudança de fase e/ou de situação), gravada na MESMA transação
 * da mudança pelo TransicoesService. Nunca é editada.
 *
 * `fase_de`/`fase_para`/`situacao_*` são texto (não enum) de propósito: o
 * histórico guarda também valores legados (ex.: fase 'SUSPENSO' migrada).
 */
@Entity('licitacao_transicoes')
@Index('IDX_licitacao_transicoes_licitacao_criado', ['licitacao_id', 'created_at'])
export class LicitacaoTransicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'varchar', length: 40, nullable: true })
  fase_de: string | null;

  @Column({ type: 'varchar', length: 40 })
  fase_para: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  situacao_de: string | null;

  @Column({ type: 'varchar', length: 20 })
  situacao_para: string;

  /** Ato nomeado (AtoLicitacao) ou registro especial (CRIAR, MIGRACAO_SITUACAO). */
  @Column({ type: 'varchar', length: 60 })
  ato: string;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  /** ORGAO | USUARIO | ADMIN | FORNECEDOR | SISTEMA */
  @Column({ type: 'varchar', length: 20 })
  ator_tipo: string;

  /** id do órgão/usuário/fornecedor ou origem do sistema (ex.: 'scheduler'). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  ator_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  dados: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
