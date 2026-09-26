import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

export type StatusTarefa = 'ABERTA' | 'CONCLUIDA' | 'CANCELADA';
/** De onde a tarefa veio. DILIGENCIA (parecer — Entrega 3) e ACHADO (conformidade — Entrega 4) são ganchos. */
export type OrigemTarefa = 'ETAPA' | 'DILIGENCIA' | 'ACHADO' | 'SISTEMA';
/** O que a tarefa pede: produzir/anexar a peça, publicar, responder diligência, sanar achado. */
export type TipoTarefa = 'PECA' | 'PUBLICACAO' | 'DILIGENCIA' | 'ACHADO' | 'OUTRO';

/**
 * TAREFA da fase interna (Entrega 2; SPEC §2 "Tarefa").
 *
 * Nasce sozinha quando uma etapa fica disponível (dependências cumpridas) e é
 * concluída sozinha quando a peça fica pronta (anexada, assinada, OK ou não se
 * aplica). Responsável: um usuário OU um papel/setor do órgão (caixa
 * compartilhada: quem tem o papel/setor vê e pode "assumir").
 *
 * Idempotência: no máximo UMA tarefa ABERTA por (processo, chave) — índice
 * único parcial. Chave da tarefa de etapa: `etapa:<PASSO>`.
 *
 * Relação com a tramitação (`tramitacoes_processo`): a tramitação continua
 * sendo o despacho formal/histórico entre setores (estilo SEI); a tarefa é o
 * "o que eu tenho que fazer". Uma não cria a outra.
 */
@Entity('tarefas')
@Index('UQ_tarefas_aberta_por_chave', ['licitacao_id', 'chave'], { unique: true, where: `"status" = 'ABERTA'` })
@Index('IDX_tarefas_orgao_status', ['orgao_id', 'status'])
@Index('IDX_tarefas_responsavel', ['responsavel_usuario_id', 'status'])
export class Tarefa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Órgão dono (isolamento — é o da licitação). */
  @Column({ type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Peça da tarefa (versão atual quando a tarefa nasceu), se houver. */
  @Column({ type: 'uuid', nullable: true })
  documento_id: string | null;

  /** Tipo da peça que a tarefa pede (destino do botão: `#peca-<tipo>`). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  tipo_peca: string | null;

  /** Etapa (EtapaFaseInterna) e passo (PassoFaseInterna) de origem. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  etapa: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  passo: string | null;

  /** Chave de idempotência (`etapa:<PASSO>`, `diligencia:<id>`...). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  chave: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PECA' })
  tipo: TipoTarefa;

  @Column({ type: 'varchar', length: 20, default: 'ETAPA' })
  origem: OrigemTarefa;

  /** Id do registro de origem (diligência, achado) — gancho das Entregas 3 e 4. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  origem_id: string | null;

  @Column({ type: 'varchar', length: 250 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  // === RESPONSÁVEL: usuário OU papel/setor ===
  @Column({ type: 'uuid', nullable: true })
  responsavel_usuario_id: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  responsavel_papel: string | null;

  @Column({ type: 'uuid', nullable: true })
  responsavel_setor_id: string | null;

  /** Reatribuída/assumida por alguém: a sincronização não muda mais o responsável. */
  @Column({ type: 'boolean', default: false })
  atribuicao_manual: boolean;

  // === PRAZO (dias úteis pelo calendário do órgão) ===
  @Column({ type: 'int', nullable: true })
  prazo_dias_uteis: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  prazo: Date | null;

  // === CICLO DE VIDA ===
  @Column({ type: 'varchar', length: 20, default: 'ABERTA' })
  status: StatusTarefa;

  @Column({ type: 'varchar', length: 100, nullable: true })
  criada_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  criada_por_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  concluida_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  concluida_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  concluida_em: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelada_em: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo_cancelamento: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
