import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

/** Situação do rascunho da IA. */
export type StatusRascunhoIa = 'GERANDO' | 'GERADO' | 'FALHOU' | 'ACEITO' | 'DESCARTADO' | 'SUBSTITUIDO';
/** Quem disparou: ao chegar à etapa (modelo com `ia_rascunho`) ou o botão "Gerar com IA". */
export type DisparoRascunhoIa = 'AUTOMATICO' | 'MANUAL';

/**
 * RASCUNHO DA IA POR ETAPA (F4a — plano PLANO-FLUXO-TRAMITACAO.md §2, §7 e
 * entrega T4: "sempre com IA para fazer e humano revisar").
 *
 * O rascunho NÃO é peça: fica aqui, fora de `documentos_fase_interna`, e
 * nunca conta como peça pronta (regra da #517: pronta só emitida/anexada).
 * Só entra na peça com o clique de uma pessoa ("Aceitar como base"), e só nas
 * seções vazias — texto que um humano escreveu nunca é sobrescrito. Ao emitir
 * a peça feita a partir dele, fica registrado quem revisou (IA_REVISADA_POR).
 *
 * `chave` (única): idempotência do rascunho automático — um por etapa/peça
 * (e por ciclo de reabertura da etapa). O manual não tem chave.
 */
@Entity('rascunhos_ia_fase_interna')
@Index(['licitacao_id', 'peca', 'created_at'])
export class RascunhoIaFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Órgão dono (isolamento — é o da licitação). */
  @Column({ type: 'uuid' })
  orgao_id: string;

  /** DFD | ETP | TR | AA | PJ | MCI | REGISTRO | TRAMITACAO. */
  @Column({ type: 'varchar', length: 20 })
  peca: string;

  /** Código da etapa no modelo de fluxo (DFD, AUTORIZACAO, PARECER, AUTORIZACAO_INICIO…). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  etapa: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  chave: string | null;

  @Column({ type: 'varchar', length: 20, default: 'GERANDO' })
  status: StatusRascunhoIa;

  /** Sempre IA (marca de origem do texto). */
  @Column({ type: 'varchar', length: 10, default: 'IA' })
  origem_rascunho: string;

  @Column({ type: 'varchar', length: 20, default: 'MANUAL' })
  disparo: DisparoRascunhoIa;

  /** Seções/campos do rascunho: { id: texto } (HTML simples nas peças por seção; texto nos demais). */
  @Column({ type: 'jsonb', nullable: true })
  secoes: Record<string, string> | null;

  /** Sugestões que não são texto de seção (ex.: conclusão sugerida do parecer). */
  @Column({ type: 'jsonb', nullable: true })
  extras: Record<string, unknown> | null;

  /** Parâmetros do pedido manual (ex.: destino e finalidade do despacho de tramitação). */
  @Column({ type: 'jsonb', nullable: true })
  parametros: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  modelo_ia: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  gerado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  gerado_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  gerado_em: Date | null;

  @Column({ type: 'text', nullable: true })
  erro: string | null;

  /** "Aceitar como base" (ou "Descartar"): quem decidiu e quando. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  decidido_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  decidido_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidido_em: Date | null;

  /** Seções que entraram na peça no aceite (as que estavam vazias). */
  @Column({ type: 'jsonb', nullable: true })
  secoes_aplicadas: string[] | null;

  /** Peça emitida a partir do rascunho: quem revisou (usuário do JWT) e quando. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  revisado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  revisado_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revisado_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  documento_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
