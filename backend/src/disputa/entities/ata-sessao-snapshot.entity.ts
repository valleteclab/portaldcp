import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Retrato CONGELADO da sessão pública (plano E2 item 9): gravado antes de um
 * ato que desfaz o resultado da etapa de lances (reinício da disputa). Guarda
 * itens, TODOS os lances (com os ativos na hora), eventos e mapeamento anônimo,
 * com hash SHA-256 do conteúdo canônico — o que existia antes do reinício fica
 * comprovável mesmo depois que os lances forem cancelados logicamente.
 *
 * Só inserção: nenhum código atualiza ou apaga estas linhas.
 */
@Entity('sessao_atas_snapshots')
@Index('IDX_sessao_atas_snapshots_sessao', ['sessao_id', 'created_at'])
export class AtaSessaoSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessao_id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Ato que motivou o retrato (ex.: REINICIO_DISPUTA). */
  @Column({ type: 'varchar', length: 40 })
  motivo_ato: string;

  @Column({ type: 'text', nullable: true })
  justificativa: string | null;

  @Column({ type: 'jsonb' })
  conteudo: Record<string, any>;

  /** SHA-256 (hex) do JSON canônico de `conteudo`. */
  @Column({ type: 'varchar', length: 64 })
  hash_sha256: string;

  @Column({ type: 'varchar', length: 20 })
  ator_tipo: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ator_id: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}
