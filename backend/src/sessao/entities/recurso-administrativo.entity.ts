import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SessaoDisputa } from './sessao-disputa.entity';

/**
 * Recurso administrativo (Art. 165, Lei 14.133/2021).
 *
 * Ciclo: intenção (registrada como evento na sessão) → razões do recurso
 * (prazo de 3 dias úteis) → contrarrazões dos demais → decisão do pregoeiro
 * (juízo de retratação) e/ou da autoridade superior (provido/improvido).
 */
export enum StatusRecurso {
  INTENCAO = 'INTENCAO',                 // manifestou intenção na sessão
  AGUARDANDO_RAZOES = 'AGUARDANDO_RAZOES', // intenção aceita, prazo p/ razões
  RAZOES_APRESENTADAS = 'RAZOES_APRESENTADAS',
  CONTRARRAZOES = 'CONTRARRAZOES',       // aberto p/ contrarrazões dos demais
  EM_ANALISE = 'EM_ANALISE',             // em julgamento
  PROVIDO = 'PROVIDO',                   // recurso deferido
  IMPROVIDO = 'IMPROVIDO',               // recurso indeferido
  NAO_CONHECIDO = 'NAO_CONHECIDO',       // intenção recusada / intempestivo
  DESISTENCIA = 'DESISTENCIA',
}

@Entity('recursos_administrativos')
@Index(['sessao_id', 'status'])
@Index(['licitacao_id'])
export class RecursoAdministrativo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SessaoDisputa)
  @JoinColumn({ name: 'sessao_id' })
  sessao: SessaoDisputa;

  @Column()
  sessao_id: string;

  @Column()
  licitacao_id: string;

  /** Item objeto do recurso (opcional — pode ser sobre a licitação toda) */
  @Column({ nullable: true })
  item_id: string;

  // === RECORRENTE ===
  @Column()
  fornecedor_id: string;

  @Column({ nullable: true })
  fornecedor_nome: string;

  // === INTENÇÃO ===
  @Column({ type: 'text', nullable: true })
  motivacao_intencao: string;

  @Column({ type: 'timestamp', nullable: true })
  data_intencao: Date;

  /** Intenção aceita pelo pregoeiro (juízo de admissibilidade) */
  @Column({ nullable: true })
  intencao_aceita: boolean;

  @Column({ type: 'text', nullable: true })
  motivo_recusa_intencao: string;

  // === RAZÕES ===
  @Column({ type: 'text', nullable: true })
  razoes: string;

  @Column({ type: 'timestamp', nullable: true })
  data_razoes: Date;

  @Column({ type: 'timestamp', nullable: true })
  prazo_razoes: Date;

  // === CONTRARRAZÕES ===
  @Column({ type: 'jsonb', nullable: true })
  contrarrazoes: Array<{
    fornecedor_id: string;
    fornecedor_nome?: string;
    texto: string;
    data: string;
  }>;

  @Column({ type: 'timestamp', nullable: true })
  prazo_contrarrazoes: Date;

  // === DECISÃO ===
  @Column({ type: 'enum', enum: StatusRecurso, default: StatusRecurso.INTENCAO })
  status: StatusRecurso;

  @Column({ type: 'text', nullable: true })
  decisao: string;

  /** Quem decidiu (pregoeiro em retratação ou autoridade superior) */
  @Column({ type: 'varchar', nullable: true })
  decidido_por: string | null;

  @Column({ type: 'varchar', nullable: true })
  decidido_por_cargo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  data_decisao: Date;

  // === DOCUMENTO ANEXO (opcional) ===
  @Column({ nullable: true })
  documento_nome: string;

  @Column({ nullable: true })
  documento_caminho: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
