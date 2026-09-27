import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { Orgao } from '../../orgaos/entities/orgao.entity';

/**
 * MODELO DE FLUXO DA FASE INTERNA (F1 — docs/licitacao/PLANO-FLUXO-TRAMITACAO.md).
 * Um por órgão e tipo de processo (DISPENSA, INEXIGIBILIDADE, LICITACAO);
 * `orgao_id` null = MODELO DO SISTEMA (catálogo global, semeado no boot:
 * "Câmara — Portaria 089"). O órgão sem modelo próprio usa o do sistema;
 * ao editar, ganha uma cópia. Cada gravação soma 1 na `versao` — o processo
 * guarda um retrato (snapshot) do caminho com a versão em que nasceu.
 */
@Entity('modelos_fluxo_fase_interna')
@Index('uq_modelo_fluxo_orgao_tipo', ['orgao_id', 'tipo_processo'], { unique: true, where: 'orgao_id IS NOT NULL' })
@Index('uq_modelo_fluxo_sistema_tipo', ['tipo_processo'], { unique: true, where: 'orgao_id IS NULL' })
export class ModeloFluxoFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao | null;

  @Column({ type: 'uuid', nullable: true })
  orgao_id: string | null;

  /** DISPENSA | INEXIGIBILIDADE | LICITACAO. */
  @Column({ type: 'varchar', length: 20 })
  tipo_processo: string;

  @Column({ type: 'varchar', length: 60 })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'int', default: 1 })
  versao: number;

  /** { exigida, etapa, aprovador: { tipo, valor }, aceita_peca_externa }. */
  @Column({ type: 'jsonb' })
  aprovacao_demanda: Record<string, any>;

  /** Modelo de que este foi copiado (o do sistema). */
  @Column({ type: 'uuid', nullable: true })
  origem_modelo_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  atualizado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  atualizado_por_nome: string | null;

  @OneToMany(() => EtapaModeloFluxo, (e) => e.modelo)
  etapas: EtapaModeloFluxo[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/** Etapa do modelo: catálogo (código, peças, tela, conclusão) + o que o órgão configura. */
@Entity('modelos_fluxo_etapas')
@Index('uq_modelo_fluxo_etapa', ['modelo_id', 'codigo'], { unique: true })
export class EtapaModeloFluxo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ModeloFluxoFaseInterna, (m) => m.etapas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'modelo_id' })
  modelo: ModeloFluxoFaseInterna;

  @Column({ type: 'uuid' })
  modelo_id: string;

  @Column({ type: 'varchar', length: 40 })
  codigo: string;

  @Column({ type: 'varchar', length: 40 })
  grupo: string;

  @Column({ type: 'varchar', length: 120 })
  grupo_titulo: string;

  @Column({ type: 'varchar', length: 200 })
  titulo: string;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ type: 'jsonb', nullable: true })
  tipos_peca: string[] | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  tela: string | null;

  /** PECAS | DIVULGACAO | REGISTRO. */
  @Column({ type: 'varchar', length: 20, default: 'PECAS' })
  conclusao: string;

  @Column({ type: 'varchar', length: 40 })
  fase_maquina: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  portao: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fundamento: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  responsavel_papel: string | null;

  @Column({ type: 'uuid', nullable: true })
  responsavel_setor_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  responsavel_usuario_id: string | null;

  @Column({ type: 'int', nullable: true })
  prazo_dias_uteis: number | null;

  @Column({ type: 'boolean', default: true })
  obrigatoria: boolean;

  @Column({ type: 'boolean', default: true })
  ligada: boolean;

  @Column({ type: 'boolean', default: false })
  ia_rascunho: boolean;

  @Column({ type: 'boolean', default: false })
  aprovacao_interna: boolean;

  @Column({ type: 'boolean', default: false })
  dispensavel_por_ato: boolean;

  /** Códigos das etapas de que esta depende (grafo). */
  @Column({ type: 'jsonb', nullable: true })
  depende_de: string[] | null;
}

/**
 * REQUISITOS MÍNIMOS DA LEI para validar o modelo (dados; semeados no boot;
 * editáveis só pelo administrador da plataforma — AdminGuard).
 */
@Entity('requisitos_legais_fluxo')
export class RequisitoLegalFluxo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  codigo: string;

  /** CONTRATACAO_DIRETA | LICITACAO | TODOS. */
  @Column({ type: 'varchar', length: 30 })
  alcance: string;

  /** ETAPA_OBRIGATORIA | DEPENDENCIA | SEGREGACAO. */
  @Column({ type: 'varchar', length: 30 })
  tipo: string;

  @Column({ type: 'varchar', length: 40 })
  etapa: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  outra_etapa: string | null;

  @Column({ type: 'boolean', default: false })
  permite_dispensa_por_ato: boolean;

  @Column({ type: 'varchar', length: 200 })
  fundamento: string;

  @Column({ type: 'text' })
  mensagem: string;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  atualizado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * TRAVAS DA LEI POR ATO: ato → regra do motor de conformidade + severidade
 * aplicada no ato (dados; semeados com o comportamento de sempre; editáveis
 * só pelo administrador da plataforma).
 */
@Entity('travas_ato_fluxo')
@Index('uq_trava_ato_regra', ['ato', 'regra'], { unique: true })
export class TravaAtoFluxo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** CONCLUIR_PESQUISA | AUTORIZAR | PUBLICAR. */
  @Column({ type: 'varchar', length: 30 })
  ato: string;

  @Column({ type: 'varchar', length: 30 })
  regra: string;

  /** BLOQUEIO | ATENCAO. */
  @Column({ type: 'varchar', length: 10 })
  severidade: string;

  @Column({ type: 'boolean', default: true })
  ativa: boolean;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  atualizado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * FLUXO DO PROCESSO: o retrato do caminho (snapshot do modelo, com a versão)
 * e o estado que não é derivado das peças — aprovação da demanda, etapas
 * reabertas, etapas a revisar e despachos das etapas de registro. Uma linha
 * por processo, criada quando o processo nasce (ou na migração: legado).
 */
@Entity('fluxos_processo_fase_interna')
export class FluxoProcessoFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid', unique: true })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'varchar', length: 20 })
  tipo_processo: string;

  @Column({ type: 'uuid', nullable: true })
  modelo_id: string | null;

  @Column({ type: 'int', default: 1 })
  modelo_versao: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  modelo_nome: string | null;

  /** SnapshotModelo (fluxo/modelo-fluxo.ts). */
  @Column({ type: 'jsonb' })
  snapshot: Record<string, any>;

  @Column({ type: 'timestamptz' })
  snapshot_em: Date;

  /** Processo que já existia quando o modelo de fluxo em dados entrou (F1). */
  @Column({ type: 'boolean', default: false })
  legado: boolean;

  @Column({ type: 'boolean', default: false })
  demanda_aprovada: boolean;

  /** { origem: LEGADO|DEMANDA|APROVADOR|PECA_EXTERNA|MANUAL, por_id, por_nome, em, observacao }. */
  @Column({ type: 'jsonb', nullable: true })
  aprovacao_demanda: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  reabertas: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  a_revisar: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  registros: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
