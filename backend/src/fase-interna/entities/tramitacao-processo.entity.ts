import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

export enum StatusTramitacao {
  PENDENTE = 'PENDENTE',       // enviada, aguardando recebimento no destino
  RECEBIDA = 'RECEBIDA',       // destino confirmou recebimento
  DEVOLVIDA = 'DEVOLVIDA',     // destino devolveu ao remetente com motivo
  CONCLUIDA = 'CONCLUIDA',     // encerrada (processo saiu do setor por nova tramitação)
}

/**
 * Tramitação do processo licitatório entre setores (estilo SEI).
 * Cada envio gera um registro com despacho; o setor atual do processo é o
 * destino da última tramitação não devolvida.
 */
@Entity('tramitacoes_processo')
@Index(['licitacao_id', 'sequencia'])
@Index(['para_setor_id', 'status'])
export class TramitacaoProcesso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  /** Ordem cronológica dentro do processo (1, 2, 3…) */
  @Column({ type: 'int' })
  sequencia: number;

  // === ORIGEM ===
  @Column({ nullable: true })
  de_setor_id: string;

  @Column({ nullable: true })
  de_setor_nome: string;

  @Column({ nullable: true })
  de_usuario_id: string;

  @Column({ nullable: true })
  de_usuario_nome: string;

  // === DESTINO ===
  @Column()
  para_setor_id: string;

  @Column()
  para_setor_nome: string;

  /** Opcional: atribuição direta a um usuário do setor */
  @Column({ nullable: true })
  para_usuario_id: string;

  @Column({ nullable: true })
  para_usuario_nome: string;

  // === DESPACHO ===
  /** Instrução/motivo do encaminhamento (obrigatório, vira peça do processo) */
  @Column({ type: 'text' })
  despacho: string;

  @Column({ type: 'int', nullable: true })
  prazo_dias: number;

  @Column({ type: 'timestamp', nullable: true })
  data_prazo: Date;

  // === CICLO DE VIDA ===
  @Column({ type: 'enum', enum: StatusTramitacao, default: StatusTramitacao.PENDENTE })
  status: StatusTramitacao;

  @Column({ type: 'timestamp', nullable: true })
  data_recebimento: Date;

  @Column({ nullable: true })
  recebido_por_id: string;

  @Column({ nullable: true })
  recebido_por_nome: string;

  @Column({ type: 'text', nullable: true })
  motivo_devolucao: string;

  @Column({ type: 'timestamp', nullable: true })
  data_devolucao: Date;

  @CreateDateColumn()
  data_envio: Date;
}
