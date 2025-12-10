/**
 * ============================================================================
 * ENTIDADE: ITEM DE LICITAÇÃO
 * ============================================================================
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * 
 * Art. 40, §1º - "Os itens de consumo que se enquadrem como de luxo deverão 
 * ser identificados e justificados no processo de contratação."
 * 
 * Art. 40, §3º - "O parcelamento será adotado quando técnica e economicamente 
 * viável, e deverá ser justificado quando não for adotado."
 * 
 * Art. 12, VII - Vinculação obrigatória ao PCA ou justificativa
 * 
 * ============================================================================
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { ItemPCA } from '../../pca/entities/pca.entity';
import { LoteLicitacao } from '../../lotes/entities/lote-licitacao.entity';

export enum UnidadeMedida {
  UNIDADE = 'UNIDADE',
  PECA = 'PECA',
  CAIXA = 'CAIXA',
  PACOTE = 'PACOTE',
  METRO = 'METRO',
  METRO_QUADRADO = 'METRO_QUADRADO',
  METRO_CUBICO = 'METRO_CUBICO',
  LITRO = 'LITRO',
  QUILOGRAMA = 'QUILOGRAMA',
  TONELADA = 'TONELADA',
  HORA = 'HORA',
  DIARIA = 'DIARIA',
  MES = 'MES',
  ANO = 'ANO',
  SERVICO = 'SERVICO',
  GLOBAL = 'GLOBAL',
}

export enum StatusItem {
  ATIVO = 'ATIVO',
  CANCELADO = 'CANCELADO',
  DESERTO = 'DESERTO',
  FRACASSADO = 'FRACASSADO',
  ADJUDICADO = 'ADJUDICADO',
  HOMOLOGADO = 'HOMOLOGADO',
}

export enum TipoParticipacao {
  AMPLA = 'AMPLA', // Todos podem participar
  EXCLUSIVO_MPE = 'EXCLUSIVO_MPE', // Exclusivo ME/EPP
  COTA_RESERVADA = 'COTA_RESERVADA', // Cota reservada ME/EPP
}

@Entity('itens_licitacao')
export class ItemLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Licitação
  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  // ============================================================================
  // VINCULAÇÃO COM LOTE - Lei 14.133/2021, Art. 40, §3º
  // ============================================================================

  /**
   * Relacionamento com Lote (opcional)
   * 
   * Lei 14.133/2021, Art. 40, §3º:
   * "O parcelamento será adotado quando técnica e economicamente viável, 
   * e deverá ser justificado quando não for adotado."
   * 
   * Quando a licitação usa lotes (usa_lotes = true), cada item deve
   * pertencer a um lote. O item herda o PCA do lote quando o modo
   * de vinculação é POR_LOTE.
   */
  @ManyToOne(() => LoteLicitacao, lote => lote.itens, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lote_id' })
  lote: LoteLicitacao;

  @Column({ type: 'uuid', nullable: true })
  lote_id: string;

  // ============================================================================
  // VINCULAÇÃO COM PCA - Lei 14.133/2021, Art. 12, VII
  // ============================================================================
  
  /**
   * Relacionamento com Item do PCA (opcional)
   * 
   * Lei 14.133/2021, Art. 12, VII:
   * "As contratações públicas deverão submeter-se a práticas contínuas e 
   * permanentes de gestão de riscos e de controle preventivo, inclusive 
   * mediante adoção de recursos de tecnologia da informação, e, além de 
   * estar subordinadas ao controle social, sujeitar-se-ão às seguintes 
   * linhas de defesa: VII - o plano de contratações anual"
   * 
   * A vinculação pode ser:
   * - Direta: item_pca_id preenchido diretamente (modo POR_ITEM)
   * - Herdada do lote: quando modo = POR_LOTE
   * - Herdada da licitação: quando modo = POR_LICITACAO
   */
  @ManyToOne(() => ItemPCA, { nullable: true })
  @JoinColumn({ name: 'item_pca_id' })
  item_pca: ItemPCA;

  @Column({ nullable: true })
  item_pca_id: string;

  /**
   * Flag para indicar se o item não possui vinculação com PCA
   * 
   * Lei 14.133/2021, Art. 12, §1º:
   * "A não observância do disposto no inciso VII do caput deste artigo 
   * deverá ser justificada pelo ordenador de despesa"
   * 
   * Se true, justificativa_sem_pca é OBRIGATÓRIA
   */
  @Column({ default: false })
  sem_pca: boolean;

  /**
   * Justificativa para item sem vinculação ao PCA
   * 
   * OBRIGATÓRIA quando sem_pca = true
   * 
   * Exemplos de justificativas válidas:
   * - "Contratação emergencial não prevista no planejamento anual"
   * - "Demanda surgida após aprovação do PCA do exercício"
   * - "Necessidade decorrente de situação imprevisível"
   */
  @Column({ type: 'text', nullable: true })
  justificativa_sem_pca: string;

  // ============================================================================
  // IDENTIFICAÇÃO
  // ============================================================================
  
  @Column({ type: 'int' })
  numero_item: number;

  /**
   * @deprecated Use lote_id ao invés de numero_lote
   * Mantido para compatibilidade com dados antigos
   */
  @Column({ nullable: true })
  numero_lote: number;

  @Column({ nullable: true })
  codigo_catalogo: string; // Código CATMAT/CATSER

  // Dados do Catálogo de Compras (compras.gov.br)
  @Column({ nullable: true })
  codigo_catmat: string; // Código CATMAT (materiais)

  @Column({ nullable: true })
  codigo_catser: string; // Código CATSER (serviços)

  @Column({ nullable: true })
  codigo_pdm: string; // Código do PDM (Padrão Descritivo de Materiais)

  @Column({ nullable: true })
  nome_pdm: string; // Nome do PDM

  @Column({ nullable: true })
  classe_catalogo: string; // Classe/categoria do catálogo

  @Column({ nullable: true })
  codigo_grupo: string; // Código do grupo

  @Column({ nullable: true })
  nome_grupo: string; // Nome do grupo

  // Descrição
  @Column()
  descricao_resumida: string;

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  @Column({ nullable: true })
  marca_referencia: string;

  // Quantidades
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantidade_minima: number; // Para registro de preços

  @Column({
    type: 'enum',
    enum: UnidadeMedida,
    default: UnidadeMedida.UNIDADE
  })
  unidade_medida: UnidadeMedida;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_unitario_homologado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_homologado: number;

  // Participação
  @Column({
    type: 'enum',
    enum: TipoParticipacao,
    default: TipoParticipacao.AMPLA
  })
  tipo_participacao: TipoParticipacao;

  @Column({ default: false })
  margem_preferencia: boolean;

  @Column({ type: 'int', nullable: true })
  percentual_margem: number;

  // Status
  @Column({
    type: 'enum',
    enum: StatusItem,
    default: StatusItem.ATIVO
  })
  status: StatusItem;

  // Vencedor (preenchido após adjudicação)
  @Column({ nullable: true })
  fornecedor_vencedor_id: string;

  @Column({ nullable: true })
  fornecedor_vencedor_nome: string;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
