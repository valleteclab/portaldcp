import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

export type FaseAnaliseJuridica = 'PREVIA' | 'EXTERNA';
export type StatusAnaliseJuridica = 'EM_ANALISE' | 'EMITIDO';
export type StatusDiligenciaEntidade = 'ABERTA' | 'SANADA' | 'CANCELADA';

/**
 * ANÁLISE JURÍDICA (Entrega 3B) — o parecer EM PREPARAÇÃO pela Procuradoria:
 * marcações do roteiro, conclusão e fundamentação. Uma por processo e fase
 * (PREVIA = parecer do art. 53, peça PJ; EXTERNA = parecer nº 2 da fase
 * externa, peça PJE). A peça do parecer (documentos_fase_interna) nasce na
 * EMISSÃO — o rascunho fica aqui para não contar como peça pronta antes da
 * assinatura. Toda coluna de união com `type:` explícito (synchronize).
 */
@Entity('analises_juridicas')
@Index('UQ_analises_juridicas_processo_fase', ['licitacao_id', 'fase'], { unique: true })
export class AnaliseJuridica {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Órgão dono (isolamento — o da licitação). */
  @Column({ type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 10, default: 'PREVIA' })
  fase: FaseAnaliseJuridica;

  @Column({ type: 'varchar', length: 20, default: 'EM_ANALISE' })
  status: StatusAnaliseJuridica;

  /** Item do roteiro → { situacao, observacao } marcado pela Procuradoria. */
  @Column({ type: 'jsonb', nullable: true })
  roteiro: Record<string, { situacao: string; observacao: string | null }> | null;

  /** FAVORAVEL | FAVORAVEL_COM_RESSALVAS | DESFAVORAVEL. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  conclusao: string | null;

  @Column({ type: 'text', nullable: true })
  fundamentacao: string | null;

  @Column({ type: 'text', nullable: true })
  ressalvas: string | null;

  /** Peça do parecer emitido (PJ ou PJE — versão atual quando emitido). */
  @Column({ type: 'uuid', nullable: true })
  documento_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  emitido_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  emitido_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emitido_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  atualizado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  atualizado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * DILIGÊNCIA DO PARECER (Entrega 3B; SPEC §2 "Diligencia"): ligada à análise
 * jurídica (e à peça do parecer, quando emitido), ao DOCUMENTO-ALVO (a versão
 * da peça quando a diligência foi aberta) e à descrição. Cria uma TAREFA
 * (origem DILIGENCIA) para o responsável pela peça-alvo; o processo "volta"
 * àquela peça SEM desfazer nada assinado depois (a peça ganha versão nova).
 * Sanada, nasce a tarefa de retorno para a Procuradoria.
 */
@Entity('diligencias')
@Index('IDX_diligencias_licitacao_status', ['licitacao_id', 'status'])
export class Diligencia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @ManyToOne(() => AnaliseJuridica, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'analise_id' })
  analise: AnaliseJuridica;

  @Column({ type: 'uuid' })
  analise_id: string;

  /** Peça do parecer que registrou a diligência (preenchida na emissão). */
  @Column({ type: 'uuid', nullable: true })
  parecer_documento_id: string | null;

  /** Tipo da peça-alvo (DFD, TR, MC…). */
  @Column({ type: 'varchar', length: 10 })
  tipo_alvo: string;

  /** Versão da peça-alvo quando a diligência foi aberta. */
  @Column({ type: 'uuid', nullable: true })
  documento_alvo_id: string | null;

  @Column({ type: 'int', nullable: true })
  versao_alvo: number | null;

  /** Folha dos autos apontada (abre a peça nela). */
  @Column({ type: 'int', nullable: true })
  folha: number | null;

  /** Trecho destacado (ex.: "Processo Administrativo nº 115/2025"). */
  @Column({ type: 'text', nullable: true })
  trecho: string | null;

  @Column({ type: 'text' })
  descricao: string;

  /** Item do roteiro a que se refere (ART75, VINC, ART92…). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  item_roteiro: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ABERTA' })
  status: StatusDiligenciaEntidade;

  @Column({ type: 'varchar', length: 100, nullable: true })
  aberta_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  aberta_por_nome: string | null;

  /** Resposta de quem sanou (esclarecimento ou o que foi corrigido). */
  @Column({ type: 'text', nullable: true })
  resposta: string | null;

  /** Versão corrigida da peça-alvo (null = respondida sem alteração). */
  @Column({ type: 'uuid', nullable: true })
  documento_corrigido_id: string | null;

  @Column({ type: 'int', nullable: true })
  versao_corrigida: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sanada_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  sanada_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sanada_em: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo_cancelamento: string | null;

  /** Reaberturas pela Procuradoria (histórico). */
  @Column({ type: 'jsonb', nullable: true })
  historico: Array<{ acao: string; por: string | null; em: string; texto?: string | null }> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
