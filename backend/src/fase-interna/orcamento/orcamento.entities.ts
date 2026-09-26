import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

/**
 * ORÇAMENTO DO ÓRGÃO (Entrega 3A — tabelas cadastráveis pelo órgão; SPEC:
 * "formulários com listas vindas de tabelas (dotação, lei), sem digitação
 * livre"). Nada disto existia: só o documento DO (texto) e
 * `contratos.dotacao_orcamentaria` (texto livre, legado).
 */

/** Dotação orçamentária do exercício (QDD): classificação + saldo informado. */
@Entity('dotacoes_orcamentarias')
@Index('IDX_dotacoes_orgao_exercicio', ['orgao_id', 'exercicio'])
export class DotacaoOrcamentaria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'int' })
  exercicio: number;

  /** Ex.: "01.01.000 — Câmara Municipal" (código + nome). */
  @Column({ type: 'varchar', length: 200 })
  unidade_orcamentaria: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  programa: string | null;

  /** Ex.: "1.31.101.2.029 — Gestão das ações da TV e Rádio". */
  @Column({ type: 'varchar', length: 200 })
  projeto_atividade: string;

  /** Ex.: "3.3.90.40 — Serviços de TIC — PJ". */
  @Column({ type: 'varchar', length: 200 })
  elemento_despesa: string;

  /** Ex.: "500 — Recursos não vinculados de impostos". */
  @Column({ type: 'varchar', length: 200 })
  fonte_recurso: string;

  /** Saldo disponível informado pela Contabilidade (QDD) — só informativo. */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  saldo: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  criado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

export type TipoLeiOrcamentaria = 'LDO' | 'LOA' | 'PPA';

/**
 * TABELA ÚNICA DE LEIS orçamentárias (LDO, LOA, PPA): despacho, informação
 * orçamentária e parecer citam sempre o mesmo número (regra LEI-01 da SPEC).
 */
@Entity('leis_orcamentarias')
@Index('IDX_leis_orgao_tipo', ['orgao_id', 'tipo'])
export class LeiOrcamentaria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'varchar', length: 3 })
  tipo: TipoLeiOrcamentaria;

  /** Número da lei (ex.: "1.234/2024"). */
  @Column({ type: 'varchar', length: 40 })
  numero: string;

  /** Exercício de referência (LDO/LOA: o ano; PPA: o primeiro ano do quadriênio). */
  @Column({ type: 'int' })
  exercicio: number;

  /** PPA: último ano do quadriênio. */
  @Column({ type: 'int', nullable: true })
  exercicio_fim: number | null;

  @Column({ type: 'date', nullable: true })
  data_publicacao: string | null;

  @Column({ type: 'text', nullable: true })
  ementa: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

export type StatusReserva = 'RASCUNHO' | 'EMITIDA' | 'DEVOLVIDA' | 'SUBSTITUIDA';

/**
 * RESERVA ORÇAMENTÁRIA do processo (informação orçamentária — etapa 5 da
 * SPEC). Versionada: "Renovar dotação" (virada do exercício) cria a versão
 * nova (`substitui_reserva_id`) e a anterior vira SUBSTITUIDA — nunca some.
 * A classificação é copiada da dotação escolhida (a peça não muda se a
 * tabela mudar depois). A peça DO (INFO_ORCAMENTARIA) é gerada na emissão.
 */
@Entity('reservas_orcamentarias')
@Index('IDX_reservas_licitacao', ['licitacao_id', 'versao_atual'])
export class ReservaOrcamentaria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'int', default: 1 })
  versao: number;

  @Column({ type: 'boolean', default: true })
  versao_atual: boolean;

  @Column({ type: 'uuid', nullable: true })
  substitui_reserva_id: string | null;

  @Column({ type: 'varchar', length: 20, default: 'RASCUNHO' })
  status: StatusReserva;

  /** Exercício em que a informação foi emitida (base da renovação). */
  @Column({ type: 'int', nullable: true })
  exercicio_base: number | null;

  @ManyToOne(() => DotacaoOrcamentaria, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dotacao_id' })
  dotacao: DotacaoOrcamentaria | null;

  @Column({ type: 'uuid', nullable: true })
  dotacao_id: string | null;

  // Cópia da classificação da dotação (na emissão/escolha)
  @Column({ type: 'varchar', length: 200, nullable: true })
  unidade_orcamentaria: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  programa: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  projeto_atividade: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  elemento_despesa: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fonte_recurso: string | null;

  @Column({ type: 'uuid', nullable: true })
  lei_ldo_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  lei_loa_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  lei_ppa_id: string | null;

  /** Adequação à LOA, LDO e PPA (art. 16, II, da LRF). */
  @Column({ type: 'boolean', default: false })
  declaracao_adequacao: boolean;

  /** Compatível com os arts. 15, 16 e 17 da LRF. */
  @Column({ type: 'boolean', default: false })
  declaracao_lrf: boolean;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_renovacao: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_devolucao: string | null;

  /** Peça DO (informação orçamentária) gerada na emissão. */
  @Column({ type: 'uuid', nullable: true })
  documento_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emitida_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  emitida_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  emitida_por_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  criado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  criado_por_nome: string | null;

  @OneToMany(() => ReservaOrcamentariaLinha, (l) => l.reserva, { cascade: true })
  linhas: ReservaOrcamentariaLinha[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/** Linha por exercício (contrato de 12 meses cruza o ano). */
@Entity('reservas_orcamentarias_linhas')
export class ReservaOrcamentariaLinha {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ReservaOrcamentaria, (r) => r.linhas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reserva_id' })
  reserva: ReservaOrcamentaria;

  @Column({ type: 'uuid' })
  reserva_id: string;

  @Column({ type: 'int' })
  exercicio: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: string;

  /** RESERVADO (saldo reservado no exercício) | PREVISAO (exercício futuro — LOA ainda não votada). */
  @Column({ type: 'varchar', length: 12, default: 'PREVISAO' })
  situacao: 'RESERVADO' | 'PREVISAO';

  /** Nº da nota de reserva no sistema contábil, se houver. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  numero_reserva: string | null;
}
