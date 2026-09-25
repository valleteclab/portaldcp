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
 * Recurso administrativo (Lei 14.133/2021, art. 165; IN SEGES 73/2022, art. 40)
 * — plano E5 "recursos com efeito".
 *
 * Ciclo (regras puras em `sessao/regras-recursos.ts`):
 *   INTENCAO            — manifestada PELO LICITANTE na sala, dentro da janela
 *                         (>= 10 min) aberta pelo agente após o resultado da
 *                         habilitação (art. 165 §1º I — preclusão fora dela);
 *   AGUARDANDO_RAZOES   — intenção ADMITIDA; razões do recorrente em 3 dias úteis;
 *   NAO_CONHECIDO       — intenção não admitida (falta evidente de pressuposto)
 *                         ou razões não apresentadas no prazo;
 *   CONTRARRAZOES       — razões apresentadas; demais licitantes em 3 dias úteis
 *                         contados do FIM do prazo das razões (IN 73 art. 40 §2º);
 *   EM_ANALISE          — prazos encerrados; o agente reconsidera ou mantém em
 *                         3 dias úteis (art. 165 §2º);
 *   AGUARDANDO_AUTORIDADE — mantida a decisão, encaminhado à autoridade
 *                         superior, que decide em 10 dias úteis (art. 165 §2º);
 *   PROVIDO / IMPROVIDO — decidido. PROVIDO produz efeito (art. 165 §3º):
 *                         `efeitos` registra os atos invalidados.
 */
export enum StatusRecurso {
  INTENCAO = 'INTENCAO',                 // manifestou intenção na janela
  AGUARDANDO_RAZOES = 'AGUARDANDO_RAZOES', // intenção admitida, prazo p/ razões
  /** @deprecated fluxo anterior à E5 (migrado para CONTRARRAZOES). */
  RAZOES_APRESENTADAS = 'RAZOES_APRESENTADAS',
  CONTRARRAZOES = 'CONTRARRAZOES',       // aberto p/ contrarrazões dos demais
  EM_ANALISE = 'EM_ANALISE',             // reconsideração pelo agente (3 d.u.)
  AGUARDANDO_AUTORIDADE = 'AGUARDANDO_AUTORIDADE', // mantido → autoridade (10 d.u.)
  PROVIDO = 'PROVIDO',                   // recurso deferido (com efeito)
  IMPROVIDO = 'IMPROVIDO',               // recurso indeferido
  NAO_CONHECIDO = 'NAO_CONHECIDO',       // intenção recusada / razões fora do prazo
  /** @deprecated não usado desde a E5. */
  DESISTENCIA = 'DESISTENCIA',
}

/** Ato contra o qual se recorre (define o EFEITO do provimento). */
export enum AtoRecorrido {
  /** A própria inabilitação (provido → volta HABILITADO). */
  INABILITACAO = 'INABILITACAO',
  /** A recusa da própria proposta na aceitação (provido → volta ao ranking). */
  RECUSA_PROPOSTA = 'RECUSA_PROPOSTA',
  /** A desclassificação da própria proposta (provido → volta ao ranking). */
  DESCLASSIFICACAO = 'DESCLASSIFICACAO',
  /** A habilitação de outro licitante (provido → ele é inabilitado). */
  HABILITACAO_TERCEIRO = 'HABILITACAO_TERCEIRO',
  /** A aceitação da proposta de outro licitante (provido → ele é desclassificado). */
  ACEITACAO_TERCEIRO = 'ACEITACAO_TERCEIRO',
  /** Outro ato — provimento sem efeito automático (o agente refaz pela sala). */
  OUTRO = 'OUTRO',
}

/** Retrato do efeito do provimento (art. 165 §3º): o que foi invalidado/restaurado. */
export interface EfeitosRecurso {
  automatico: boolean;
  aplicado_em: string;
  /** Situações alteradas (licitante x unidade): de → para. */
  alteracoes: Array<{
    fornecedor_id: string;
    unidade_id: string;
    rotulo: string;
    de: string | null;
    para: string;
    tipo: 'RESTAURADO' | 'INVALIDADO' | 'EXCLUIDO';
  }>;
  /** Convocações de aceitação canceladas (ids). */
  aceitacoes_canceladas: string[];
  /** O resultado (licitante na vez com proposta aceita) mudou em alguma unidade. */
  alterou_resultado: boolean;
  observacao?: string | null;
  /** Fase recursal concluída com este efeito (ato da máquina de estados praticado). */
  fase_concluida?: boolean;
  ato_fase?: string | null;
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

  /** Unidade (item, ou lote na disputa por lote) objeto do recurso (opcional — sem ela, o ato é do licitante/licitação) */
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
  /**
   * @deprecated fluxo anterior à E5 — as contrarrazões estão em
   * `recursos_contrarrazoes` (uma por licitante, com arquivo). Migradas no boot.
   */
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

  // === E5: OBJETO, JANELA, ADMISSIBILIDADE ===
  /** AtoRecorrido (varchar: valores novos não exigem ALTER TYPE). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  ato_recorrido: string | null;

  /** Licitante cujo ato (habilitação/aceitação) é impugnado — *_TERCEIRO. */
  @Column({ type: 'varchar', nullable: true })
  fornecedor_alvo_id: string | null;

  /** ITEM | LOTE quando `item_id` (a unidade) foi informado. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  tipo_unidade: string | null;

  /** Janela de intenção em que foi manifestada (janelas_intencao_recurso). */
  @Column({ type: 'uuid', nullable: true })
  janela_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  intencao_decidida_em: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  intencao_decidida_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  intencao_decidida_por_id: string | null;

  /** Pressuposto ausente na não admissão (LEGITIMIDADE, INTERESSE, MOTIVACAO, TEMPESTIVIDADE). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  pressuposto_ausente: string | null;

  /** Não conhecimento por falta de razões no prazo (deserção). */
  @Column({ type: 'text', nullable: true })
  motivo_nao_conhecimento: string | null;

  // === E5: ARQUIVO DAS RAZÕES (no banco; leitura: órgão dono e licitantes) ===
  @Column({ type: 'varchar', length: 200, nullable: true })
  razoes_arquivo_nome: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  razoes_arquivo_mime: string | null;

  @Column({ type: 'int', nullable: true })
  razoes_arquivo_tamanho: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  razoes_arquivo_sha256: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  razoes_arquivo_conteudo: Buffer | null;

  // === E5: RECONSIDERAÇÃO PELO AGENTE (art. 165 §2º — 3 dias úteis) ===
  @Column({ type: 'timestamp', nullable: true })
  prazo_reconsideracao: Date | null;

  /** RECONSIDERADO (provê) | MANTIDO (encaminha à autoridade). */
  @Column({ type: 'varchar', length: 15, nullable: true })
  reconsideracao: string | null;

  @Column({ type: 'text', nullable: true })
  reconsideracao_fundamentacao: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reconsideracao_em: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  reconsideracao_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  reconsideracao_por_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  reconsideracao_por_nome: string | null;

  // === E5: AUTORIDADE SUPERIOR (art. 165 §2º — 10 dias úteis) ===
  @Column({ type: 'timestamp', nullable: true })
  encaminhado_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  prazo_decisao_autoridade: Date | null;

  /** AGENTE (reconsideração) | AUTORIDADE | LEGADO (antes da E5). */
  @Column({ type: 'varchar', length: 15, nullable: true })
  instancia_decisao: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  decidido_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  decidido_por_id: string | null;

  /** Efeito do provimento (art. 165 §3º). */
  @Column({ type: 'jsonb', nullable: true })
  efeitos: EfeitosRecurso | null;

  /** SALA | MIGRACAO_E5 */
  @Column({ type: 'varchar', length: 20, nullable: true })
  origem: string | null;

  // === DOCUMENTO ANEXO (legado, sem uso) ===
  @Column({ nullable: true })
  documento_nome: string;

  @Column({ nullable: true })
  documento_caminho: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
