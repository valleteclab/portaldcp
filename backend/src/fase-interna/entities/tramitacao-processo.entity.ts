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
  /**
   * Setor de destino. Nulo só no envio direto a uma pessoa sem lotação
   * (espinha da tramitação). Registros antigos sempre têm setor.
   */
  @Column({ type: 'varchar', nullable: true })
  para_setor_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  para_setor_nome: string | null;

  /** Opcional: atribuição direta a um usuário do setor */
  @Column({ nullable: true })
  para_usuario_id: string;

  @Column({ nullable: true })
  para_usuario_nome: string;

  // === DESPACHO ===
  /** Instrução/motivo do encaminhamento (obrigatório, vira peça do processo) */
  @Column({ type: 'text' })
  despacho: string;

  /** LEGADO: prazo em dias CORRIDOS (registros anteriores à espinha). */
  @Column({ type: 'int', nullable: true })
  prazo_dias: number;

  /** Prazo em DIAS ÚTEIS pelo calendário do órgão (art. 183) — `data_prazo` = fim do prazo. */
  @Column({ type: 'int', nullable: true })
  prazo_dias_uteis: number | null;

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

  /** Momento em que o REGISTRO foi feito (lançamento). O envio efetivo é `data_ocorrencia ?? data_envio`. */
  @CreateDateColumn()
  data_envio: Date;

  // === ESPINHA DA TRAMITAÇÃO (F2) — todos opcionais: registros antigos continuam válidos ===

  /** Finalidade do envio ("para a reserva orçamentária"), usada no despacho padrão. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  finalidade: string | null;

  /** Envio automático do sistema (modo simples): despacho padrão, sem texto digitado. */
  @Column({ type: 'boolean', default: false })
  automatico: boolean;

  /** Esta tramitação é a volta de uma devolução (id da tramitação devolvida). */
  @Column({ type: 'uuid', nullable: true })
  devolucao_de_id: string | null;

  /**
   * LANÇAMENTO POSTERIOR (processo físico): o envio ocorreu em `data_ocorrencia`
   * (não futura, não anterior à movimentação anterior) e foi lançado em
   * `data_envio` por `lancado_por_*`.
   */
  @Column({ type: 'timestamp', nullable: true })
  data_ocorrencia: Date | null;

  @Column({ type: 'boolean', default: false })
  lancado_posteriormente: boolean;

  @Column({ type: 'varchar', nullable: true })
  lancado_por_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  lancado_por_nome: string | null;

  /** Recebimento lançado depois do fato: `data_recebimento` é a data em que ocorreu; aqui, quando foi lançado. */
  @Column({ type: 'boolean', default: false })
  recebimento_lancado_posteriormente: boolean;

  @Column({ type: 'timestamp', nullable: true })
  recebimento_lancado_em: Date | null;

  // === DESPACHO NOS AUTOS (folha) ===
  /** PDF do despacho (referência lógica `licitacoes/<id>/despacho-….pdf`). */
  @Column({ type: 'varchar', nullable: true })
  despacho_arquivo: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  despacho_hash: string | null;

  @Column({ type: 'int', nullable: true })
  despacho_paginas: number | null;

  /** Folhas do despacho nos autos (mesma sequência das peças — `folhas-autos.ts`). */
  @Column({ type: 'int', nullable: true })
  folha_inicial: number | null;

  @Column({ type: 'int', nullable: true })
  folha_final: number | null;

  // === INTEGRAÇÃO COM AS TAREFAS (F3) ===

  /**
   * Etapas (códigos do modelo de fluxo) para as quais o processo foi enviado:
   * as tarefas abertas delas passam ao destino na chegada. Nulo = pelo destino
   * de cada etapa no modelo.
   */
  @Column({ type: 'jsonb', nullable: true })
  etapas: string[] | null;

  /**
   * Registro da POSSE INICIAL (autuação): criado pelo sistema ao abrir o
   * processo (ou na primeira sincronização de processo antigo sem
   * tramitação), sem aviso e sem folha — a autuação já está na capa e no termo
   * de abertura dos autos. Não limita a data de um lançamento posterior.
   */
  @Column({ type: 'boolean', default: false })
  posse_inicial: boolean;

  // === AVISOS DE PRAZO (idempotentes) ===
  @Column({ type: 'timestamp', nullable: true })
  aviso_vespera_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  aviso_vencido_em: Date | null;
}
