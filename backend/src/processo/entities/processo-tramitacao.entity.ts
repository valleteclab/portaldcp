import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * MOVIMENTAÇÃO do processo eletrônico (tramitação genérica dos tipos sem
 * licitação: ADITIVO, RENOVACAO, AVULSO). Cada linha é uma remessa; a última
 * é a posse atual ("está com"). `recebida_em` nulo = aguardando recebimento.
 * Toda coluna anulável tem `type` explícito (união com null não é inferida).
 */
@Entity('processo_movimentacoes')
@Unique('UQ_processo_mov_seq', ['processo_id', 'sequencia'])
@Index('IDX_processo_mov_processo', ['processo_id'])
export class ProcessoMovimentacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  processo_id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'int' })
  sequencia: number;

  /** ABERTURA (posse inicial), ENVIO ou DEVOLUCAO. */
  @Column({ type: 'varchar', length: 20 })
  tipo: string;

  @Column({ type: 'uuid', nullable: true })
  de_setor_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  de_setor_nome: string | null;

  @Column({ type: 'uuid', nullable: true })
  de_usuario_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  de_usuario_nome: string | null;

  @Column({ type: 'uuid', nullable: true })
  para_setor_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  para_setor_nome: string | null;

  @Column({ type: 'uuid', nullable: true })
  para_usuario_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  para_usuario_nome: string | null;

  @Column({ type: 'text' })
  despacho: string;

  @Column({ type: 'timestamptz', nullable: true })
  recebida_em: Date | null;

  @Column({ type: 'uuid', nullable: true })
  recebida_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  recebida_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/**
 * PEÇA dos autos do processo (tipos sem licitação): texto feito no sistema ou
 * arquivo anexado (enviado por /uploads). Recebe folhas na ordem de juntada.
 * `etapa` = chave da etapa padrão que a peça conclui (nulo = peça avulsa).
 */
@Entity('processo_pecas')
@Unique('UQ_processo_peca_num', ['processo_id', 'numero_peca'])
@Index('IDX_processo_peca_processo', ['processo_id'])
export class ProcessoPeca {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  processo_id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'int' })
  numero_peca: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  etapa: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  tipo_peca: string | null;

  @Column({ type: 'varchar', length: 300 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  texto: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  arquivo_url: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  arquivo_nome: string | null;

  @Column({ type: 'int' })
  folha_inicial: number;

  @Column({ type: 'int' })
  folha_final: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  criado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  criado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
