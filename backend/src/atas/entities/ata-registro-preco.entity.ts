import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Fornecedor } from '../../fornecedores/entities/fornecedor.entity';

/**
 * Situação da ARP (Lei 14.133/2021 arts. 82–86; Decreto 11.462/2023):
 *  - AGUARDANDO_ASSINATURA: gerada pela homologação (ou convocação do
 *    cadastro de reserva), termo aguardando as assinaturas das partes;
 *  - VIGENTE: assinada por todas as partes (data_assinatura = última);
 *  - ESGOTADA: todo o quantitativo do gerenciador/participantes consumido
 *    (adesões autorizadas ainda consomem o que lhes foi autorizado);
 *  - VENCIDA: passou do fim da vigência (job diário) — nada mais se consome;
 *  - CANCELADA: registro do fornecedor cancelado (motivo + hipótese);
 *  - ENCERRADA / SUSPENSA: legado do cadastro manual.
 */
export enum StatusAta {
  AGUARDANDO_ASSINATURA = 'AGUARDANDO_ASSINATURA',
  VIGENTE = 'VIGENTE',
  ENCERRADA = 'ENCERRADA',
  CANCELADA = 'CANCELADA',
  SUSPENSA = 'SUSPENSA',
  ESGOTADA = 'ESGOTADA',
  VENCIDA = 'VENCIDA',
}

/** Origem da ata: homologação do SRP, convocação do cadastro de reserva ou cadastro manual (legado). */
export enum OrigemAta {
  HOMOLOGACAO = 'HOMOLOGACAO',
  RESERVA = 'RESERVA',
  MANUAL = 'MANUAL',
}

@Entity('atas_registro_preco')
export class AtaRegistroPreco {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Identificação
  @Column()
  numero_ata: string; // Ex: "001/2024"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  // Relacionamentos
  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => Fornecedor)
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  fornecedor_id: string;

  // Dados do Fornecedor (snapshot)
  @Column()
  fornecedor_cnpj: string;

  @Column()
  fornecedor_razao_social: string;

  // Status
  @Column({
    type: 'enum',
    enum: StatusAta,
    default: StatusAta.VIGENTE
  })
  status: StatusAta;

  // Objeto
  @Column({ type: 'text' })
  objeto: string;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_utilizado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_saldo: number;

  // Datas — data_assinatura só existe depois da ÚLTIMA assinatura (E6)
  @Column({ type: 'date', nullable: true })
  data_assinatura: Date | null;

  @Column({ type: 'date' })
  data_vigencia_inicio: Date;

  @Column({ type: 'date' })
  data_vigencia_fim: Date;

  @Column({ type: 'date', nullable: true })
  data_publicacao: Date;

  // Prazo
  @Column({ type: 'int', default: 12 })
  prazo_vigencia_meses: number;

  // Permite Adesão (Carona)
  @Column({ default: false })
  permite_adesao: boolean;

  @Column({ type: 'int', nullable: true })
  limite_adesao_percentual: number; // Limite de adesão em %

  // Documento
  @Column({ nullable: true })
  arquivo_ata: string;

  // Integração PNCP
  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ type: 'int', nullable: true })
  sequencial_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // ==========================================================================
  // ARP gerada pelo resultado (plano E6 — parte ARP)
  // ==========================================================================

  @Column({ type: 'varchar', length: 20, default: OrigemAta.MANUAL })
  origem: OrigemAta;

  /** Ata cancelada cujo saldo esta ata (convocação do cadastro de reserva) assumiu. */
  @Column({ type: 'uuid', nullable: true })
  ata_origem_id: string | null;

  /** Documento do assinador eletrônico (documentos_assinatura.id) do termo da ata. */
  @Column({ type: 'uuid', nullable: true })
  documento_assinatura_id: string | null;

  /** Prazo para os demais licitantes aderirem ao cadastro de reserva (Dec. 11.462 art. 18). */
  @Column({ type: 'timestamp', nullable: true })
  prazo_cadastro_reserva: Date | null;

  // Prorrogação (art. 84: uma vez, por até igual período, preço vantajoso)
  @Column({ type: 'boolean', default: false })
  prorrogada: boolean;

  @Column({ type: 'int', nullable: true })
  prorrogacao_meses: number | null;

  @Column({ type: 'text', nullable: true })
  prorrogacao_motivo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  prorrogada_em: Date | null;

  @Column({ type: 'date', nullable: true })
  data_vigencia_fim_original: Date | null;

  // Cancelamento do registro do fornecedor (Dec. 11.462 arts. 28–29)
  @Column({ type: 'varchar', length: 40, nullable: true })
  cancelamento_hipotese: string | null;

  @Column({ type: 'text', nullable: true })
  cancelamento_motivo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelada_em: Date | null;

  // Itens da Ata
  @OneToMany(() => ItemAta, item => item.ata)
  itens: ItemAta[];

  // Auditoria
  @Column({ nullable: true })
  usuario_cadastro_id: string;

  @Column({ nullable: true })
  usuario_cadastro_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('itens_ata')
export class ItemAta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AtaRegistroPreco, ata => ata.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ata_id' })
  ata: AtaRegistroPreco;

  @Column()
  ata_id: string;

  // Identificação do Item
  @Column({ type: 'int' })
  numero_item: number;

  @Column()
  descricao: string;

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  @Column({ nullable: true })
  codigo_catalogo: string;

  // Unidade e Quantidade
  @Column()
  unidade_medida: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade_registrada: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_utilizada: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_saldo: number;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  // Marca/Modelo (se aplicável)
  @Column({ nullable: true })
  marca: string;

  @Column({ nullable: true })
  modelo: string;

  @Column({ nullable: true })
  fabricante: string;

  // Status
  @Column({ default: true })
  ativo: boolean;

  /** Item da licitação de origem (ARP gerada pela homologação). */
  @Column({ type: 'uuid', nullable: true })
  item_licitacao_id: string | null;

  /**
   * Adesões (art. 86): soma das quantidades AUTORIZADAS e das consumidas por
   * órgãos não participantes — contadores SEPARADOS do saldo do gerenciador.
   */
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_adesao_autorizada: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_adesao_utilizada: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
