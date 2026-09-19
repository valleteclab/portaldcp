import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Setor } from '../../orgaos/entities/setor.entity';
import { CategoriaBem } from './categoria-bem.entity';
import { ManutencaoBem } from './manutencao-bem.entity';
import { LocacaoBem } from './locacao-bem.entity';
import { ServidorBem } from './servidor-bem.entity';
import { ComodatoBem } from './comodato-bem.entity';
import { HistoricoBem } from './historico-bem.entity';
import { TipoBem, EstadoConservacao, StatusBem, TipoAquisicaoBem } from './enums';

@Entity('bens_patrimoniais')
@Index('IDX_bens_orgao_plaqueta', ['orgao_id', 'plaqueta'])
@Index('IDX_bens_orgao_epc', ['orgao_id', 'epc'])
export class BemPatrimonial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ nullable: true })
  plaqueta: string;

  /** Código gravado no chip RFID (EPC), quando a etiqueta for dual. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  epc: string | null;

  @Column()
  descricao: string;

  @Column({ nullable: true })
  categoria_id: string;

  @ManyToOne(() => CategoriaBem, { nullable: true })
  @JoinColumn({ name: 'categoria_id' })
  categoria: CategoriaBem;

  @Column({ type: 'enum', enum: TipoBem })
  tipo: TipoBem;

  @Column({ type: 'int', default: 1 })
  quantidade: number;

  @Column({ type: 'enum', enum: EstadoConservacao, nullable: true })
  estado_conservacao: EstadoConservacao;

  /** Setor do cadastro do órgão (base da conferência setor a setor). */
  @Column({ type: 'uuid', nullable: true })
  setor_id: string | null;

  @ManyToOne(() => Setor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  @Column({ nullable: true })
  localizacao_codigo: string;

  @Column({ nullable: true })
  localizacao_nome: string;

  @Column({ nullable: true })
  responsavel_nome: string;

  @Column({ nullable: true })
  responsavel_cargo: string;

  /** CPF do responsável (só dígitos) — obrigatório no arquivo do SIGA (TCM-BA). */
  @Column({ type: 'varchar', length: 14, nullable: true })
  responsavel_cpf: string | null;

  // ─── Aquisição / identificação ────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  marca: string | null;

  @Column({ type: 'varchar', nullable: true })
  modelo: string | null;

  @Column({ type: 'varchar', nullable: true })
  numero_serie: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_aquisicao: number | null;

  @Column({ type: 'date', nullable: true })
  data_aquisicao: Date | null;

  @Column({ type: 'varchar', nullable: true })
  nota_fiscal_numero: string | null;

  @Column({ type: 'varchar', nullable: true })
  fornecedor_nome: string | null;

  @Column({ type: 'varchar', nullable: true })
  foto_url: string | null;

  // ─── Dados do legado: aquisição / contabilidade (todos opcionais) ─────
  /** Como o bem entrou no patrimônio (compra, doação, cessão…). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  tipo_aquisicao: TipoAquisicaoBem | null;

  /** Licitação de origem (uuid de `licitacoes`, sem relação para evitar ciclo). */
  @Column({ type: 'uuid', nullable: true })
  licitacao_id: string | null;

  /** Contrato de origem (uuid de `contratos`, sem relação para evitar ciclo). */
  @Column({ type: 'uuid', nullable: true })
  contrato_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  processo_pagamento: string | null;

  @Column({ type: 'date', nullable: true })
  data_pagamento: Date | null;

  /** Nº da despesa na contabilidade. */
  @Column({ type: 'varchar', nullable: true })
  referencia_contabil: string | null;

  // ─── Depreciação por bem (quando nulos, valem os da categoria) ────────
  @Column({ type: 'varchar', nullable: true })
  conta_contabil: string | null;

  @Column({ type: 'int', nullable: true })
  vida_util_anos: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  valor_residual_pct: number | null;

  // ─── Corresponsável, garantia e seguro ────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  corresponsavel_nome: string | null;

  @Column({ type: 'date', nullable: true })
  garantia_ate: Date | null;

  @Column({ type: 'varchar', nullable: true })
  seguro_seguradora: string | null;

  @Column({ type: 'varchar', nullable: true })
  seguro_apolice: string | null;

  @Column({ type: 'date', nullable: true })
  seguro_vigencia_inicio: Date | null;

  @Column({ type: 'date', nullable: true })
  seguro_vigencia_fim: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  seguro_valor: number | null;

  /** Última vez que o bem foi lido em uma campanha de inventário. */
  @Column({ type: 'timestamp', nullable: true })
  ultima_conferencia_em: Date | null;

  // ─── Empréstimo em curso / baixa ─────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  emprestado_para: string | null;

  @Column({ type: 'date', nullable: true })
  emprestado_ate: Date | null;

  @Column({ type: 'date', nullable: true })
  data_baixa: Date | null;

  @Column({ type: 'varchar', nullable: true })
  motivo_baixa: string | null;

  @Column({ type: 'enum', enum: StatusBem, default: StatusBem.ATIVO })
  status: StatusBem;

  // ─── SIGA (TCM-BA) ────────────────────────────────────────────────────
  /** Tipo do bem no SIGA (1–9); quando nulo, vale o da categoria. */
  @Column({ type: 'int', nullable: true })
  siga_tipo_bem: number | null;

  /** Quando o bem foi confirmado como importado no SIGA Captura. */
  @Column({ type: 'timestamp', nullable: true })
  siga_enviado_em: Date | null;

  /** Quando a baixa foi lançada (digitada) na tela do SIGA. */
  @Column({ type: 'timestamp', nullable: true })
  siga_baixa_lancada_em: Date | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @OneToMany(() => ManutencaoBem, (m) => m.bem)
  manutencoes: ManutencaoBem[];

  @OneToMany(() => LocacaoBem, (l) => l.bem)
  locacoes: LocacaoBem[];

  @OneToMany(() => ServidorBem, (s) => s.bem)
  servidores: ServidorBem[];

  @OneToMany(() => ComodatoBem, (c) => c.bem)
  comodatos: ComodatoBem[];

  @OneToMany(() => HistoricoBem, (h) => h.bem)
  historicos: HistoricoBem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
