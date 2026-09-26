import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

export type StatusAchadoConformidade = 'ABERTO' | 'RESOLVIDO' | 'JUSTIFICADO';
export type SeveridadeAchado = 'BLOQUEIO' | 'ATENCAO';

/**
 * ACHADO DO MOTOR DE CONFORMIDADE (Entrega 4; SPEC §2 "Regra / Achado").
 *
 * Um por ocorrência: (processo, regra, chave). A revisão é idempotente — a
 * ocorrência que continua não gera linha nova; a que deixa de ocorrer vira
 * RESOLVIDO (quem/quando/por quê); a que reaparece é REABERTA. Achado ATENÇÃO
 * pode ser JUSTIFICADO com texto obrigatório: a justificativa vai para os
 * autos (disponível para o PDF dos autos da Entrega 6). Achado BLOQUEIO não
 * se justifica — corrige-se a peça. Histórico de cada mudança em `historico`.
 * Colunas de união com `type:` explícito (synchronize em produção).
 */
@Entity('achados_conformidade')
@Index('UQ_achado_ocorrencia', ['licitacao_id', 'regra', 'chave'], { unique: true })
@Index('IDX_achados_orgao_status', ['orgao_id', 'status'])
export class AchadoConformidade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Código da regra (LIM-01, ENQ-01, …). */
  @Column({ type: 'varchar', length: 20 })
  regra: string;

  /** Ocorrência dentro da regra (estável entre revisões). */
  @Column({ type: 'varchar', length: 300 })
  chave: string;

  @Column({ type: 'varchar', length: 10 })
  severidade: SeveridadeAchado;

  /** Etapa em que a regra roda (PESQUISA | AUTORIZACAO | PUBLICACAO) e o portão (A | B | C). */
  @Column({ type: 'varchar', length: 20 })
  etapa: string;

  @Column({ type: 'varchar', length: 1 })
  portao: string;

  @Column({ type: 'varchar', length: 250 })
  titulo: string;

  @Column({ type: 'text' })
  mensagem: string;

  /** Onde está: [{ documento_id, tipo, titulo, folha, trecho }]. */
  // jsonb SEM default (default em jsonb faz o synchronize recriar a coluna)
  @Column({ type: 'jsonb', nullable: true })
  evidencias: Array<{ documento_id: string | null; tipo: string | null; titulo: string; folha: number | null; trecho: string | null }>;

  /** ATENÇÃO que precisa de justificativa para publicar (ex.: marca "ou similar"). */
  @Column({ type: 'boolean', default: false })
  exige_justificativa: boolean;

  /** Tipo da peça cujo responsável recebe a tarefa. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  tipo_peca: string | null;

  /** Ação que a tela oferece (CORRIGIR_PECA, JUSTIFICAR, ABRIR, AGENDAR, RESOLVER). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  acao: string | null;

  @Column({ type: 'boolean', default: false })
  sem_tarefa: boolean;

  @Column({ type: 'varchar', length: 12, default: 'ABERTO' })
  status: StatusAchadoConformidade;

  @Column({ type: 'text', nullable: true })
  justificativa: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  justificado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  justificado_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  justificado_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resolvido_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  resolvido_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvido_em: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo_resolucao: string | null;

  @Column({ type: 'timestamptz' })
  primeira_deteccao: Date;

  @Column({ type: 'timestamptz' })
  ultima_deteccao: Date;

  /** [{ acao: DETECTADO | ATUALIZADO | REABERTO | RESOLVIDO | JUSTIFICADO, em, por, texto }]. */
  @Column({ type: 'jsonb', nullable: true })
  historico: Array<{ acao: string; em: string; por: string | null; texto?: string | null }>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * ÚLTIMA REVISÃO de conformidade do processo (uma linha por processo): quando,
 * por quem/qual gatilho e o resumo — "N regras aprovadas" da tela.
 */
@Entity('revisoes_conformidade')
export class RevisaoConformidade {
  @PrimaryColumn({ type: 'uuid' })
  licitacao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'timestamptz' })
  revisado_em: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  revisado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  revisado_por_nome: string | null;

  /** MANUAL (botão "Revisar agora") | AUTOMATICA (peça mudou) | TELA (primeira abertura). */
  @Column({ type: 'varchar', length: 20 })
  origem: string;

  /** [{ codigo, aplicavel, motivo, achados, erro }]. */
  @Column({ type: 'jsonb', nullable: true })
  regras: Array<{ codigo: string; aplicavel: boolean; motivo: string | null; achados: number; erro?: string | null }>;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
