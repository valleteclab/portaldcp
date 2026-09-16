import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Licitacao } from './licitacao.entity';

/**
 * Troca de arquivos com plataformas externas de disputa (BLL Compras e
 * portais com o mesmo leiaute). Guarda cada exportação (.IMP) e importação
 * (.EXP) com o arquivo e um resumo, para histórico e conferência.
 */
@Entity('licitacoes_integracao_plataforma')
@Index('IDX_lic_integracao_licitacao', ['licitacao_id'])
export class IntegracaoPlataformaLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  /** BLL, COMPRAS_BR, VA_SISTEMAS… */
  @Column({ type: 'varchar', length: 30, default: 'BLL' })
  plataforma: string;

  /** EXPORTACAO (edital → portal) ou IMPORTACAO (resultado ← portal) */
  @Column({ type: 'varchar', length: 20 })
  tipo: string;

  /** GERADO (exportação), PREVIA ou APLICADO (importação) */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'varchar' })
  nome_arquivo: string;

  @Column({ type: 'varchar' })
  caminho_arquivo: string;

  /** Contagens, avisos, fornecedores e lances (inclusive não vencedores). */
  @Column({ type: 'jsonb', nullable: true })
  resumo: any;

  @Column({ type: 'varchar', nullable: true })
  usuario_nome: string | null;

  @CreateDateColumn()
  created_at: Date;
}
