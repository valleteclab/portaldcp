/**
 * ============================================================================
 * ENTIDADE: RECEBIMENTO DE MATERIAIS
 * ============================================================================
 * 
 * Registra o recebimento de materiais/serviços de uma Ordem de Fornecimento.
 * 
 * Tipos de Recebimento (Art. 140, Lei 14.133/2021):
 * - PROVISORIO: Recebimento para verificação de conformidade
 * - DEFINITIVO: Aceite final após verificação
 * 
 * Fluxo:
 * 1. Fornecedor entrega materiais
 * 2. Servidor faz recebimento PROVISÓRIO (confere NF, quantidades)
 * 3. Após verificação de qualidade, faz recebimento DEFINITIVO
 * 4. Baixa do saldo empenhado e registro de entrada no estoque
 * 
 * ============================================================================
 */

import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { OrdemFornecimento } from './ordem-fornecimento.entity';
import { NotaFiscalFornecedor } from './nota-fiscal-fornecedor.entity';

export enum TipoRecebimento {
  PROVISORIO = 'PROVISORIO',
  DEFINITIVO = 'DEFINITIVO',
}

export enum StatusRecebimento {
  PENDENTE = 'PENDENTE',       // Aguardando conferência
  CONFERIDO = 'CONFERIDO',     // Conferido, aguardando aceite
  ACEITO = 'ACEITO',           // Aceito definitivamente
  REJEITADO = 'REJEITADO',     // Rejeitado (problemas na entrega)
  ACEITO_PARCIAL = 'ACEITO_PARCIAL', // Aceito parcialmente
  ESTORNADO = 'ESTORNADO',     // Estornado (baixa revertida)
  PENDENTE_ALMOXARIFADO = 'PENDENTE_ALMOXARIFADO',  // Patrimônio aceitou; falta almoxarifado
  PENDENTE_PATRIMONIO = 'PENDENTE_PATRIMONIO',      // Almoxarifado aceitou; falta patrimônio
}

@Entity('recebimentos')
export class Recebimento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // RELACIONAMENTOS
  // ============================================================================

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @ManyToOne(() => OrdemFornecimento)
  @JoinColumn({ name: 'ordem_fornecimento_id' })
  ordem_fornecimento: OrdemFornecimento;

  @Column()
  ordem_fornecimento_id: string;

  // ============================================================================
  // IDENTIFICAÇÃO
  // ============================================================================

  @Column()
  numero: string; // Ex: "REC-001/2026"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  @Column({
    type: 'enum',
    enum: TipoRecebimento,
    default: TipoRecebimento.PROVISORIO
  })
  tipo: TipoRecebimento;

  @Column({
    type: 'enum',
    enum: StatusRecebimento,
    default: StatusRecebimento.PENDENTE
  })
  status: StatusRecebimento;

  // ============================================================================
  // DADOS DA NOTA FISCAL
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  numero_nota_fiscal: string | null;

  @Column({ type: 'varchar', nullable: true })
  serie_nota_fiscal: string | null;

  @Column({ type: 'date', nullable: true })
  data_nota_fiscal: Date | null;

  @Column({ type: 'varchar', nullable: true })
  chave_nfe: string | null; // Chave de acesso da NF-e

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_nota_fiscal: number | null;

  // ============================================================================
  // DADOS DO RECEBIMENTO
  // ============================================================================

  @Column({ type: 'date' })
  data_recebimento: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_conferencia: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  data_aceite: Date | null;

  @Column({ type: 'text', nullable: true })
  local_recebimento: string | null;

  // ============================================================================
  // ITENS RECEBIDOS (JSON)
  // ============================================================================

  @Column({ type: 'jsonb', default: [] })
  itens: {
    item_contrato_id: string;
    numero_item: number;
    descricao: string;
    unidade_medida: string;
    tipo_item?: string;
    quantidade_esperada: number;    // Quantidade da OF
    quantidade_recebida: number;    // Quantidade efetivamente recebida
    quantidade_aceita: number;      // Quantidade aceita (após conferência)
    valor_unitario: number;
    valor_total: number;
    observacao?: string;            // Observação por item (divergências)
  }[];

  // ============================================================================
  // VALORES
  // ============================================================================

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total_recebido: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_aceito: number;

  // ============================================================================
  // RESPONSÁVEIS
  // ============================================================================

  @Column()
  usuario_recebedor_id: string;

  @Column()
  usuario_recebedor_nome: string;

  @Column({ type: 'varchar', nullable: true })
  usuario_conferente_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_conferente_nome: string | null;

  // ============================================================================
  // ACEITE SEPARADO (ALMOXARIFADO / PATRIMÔNIO)
  // ============================================================================

  @Column({ type: 'timestamp', nullable: true })
  aceite_almoxarifado_data: Date | null;

  @Column({ type: 'varchar', nullable: true })
  aceite_almoxarifado_usuario_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  aceite_almoxarifado_usuario_nome: string | null;

  @Column({ type: 'timestamp', nullable: true })
  aceite_patrimonio_data: Date | null;

  @Column({ type: 'varchar', nullable: true })
  aceite_patrimonio_usuario_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  aceite_patrimonio_usuario_nome: string | null;

  // ============================================================================
  // OBSERVAÇÕES E OCORRÊNCIAS
  // ============================================================================

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_rejeicao: string | null;

  @Column({ type: 'jsonb', nullable: true })
  ocorrencias: {
    data: Date;
    tipo: string;
    descricao: string;
    usuario: string;
  }[] | null;

  // ============================================================================
  // CONTROLE DE BAIXA NO ESTOQUE
  // ============================================================================

  /**
   * Indica se já foi feita a baixa no saldo do contrato
   * e entrada no estoque (para recebimento definitivo)
   */
  @Column({ default: false })
  baixa_realizada: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_baixa: Date | null;

  // ============================================================================
  // ESTORNO
  // ============================================================================

  @Column({ type: 'timestamp', nullable: true })
  data_estorno: Date | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_estorno_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_estorno_nome: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_estorno: string | null;

  // ============================================================================
  // VINCULAÇÃO COM NOTA FISCAL DO FORNECEDOR
  // ============================================================================

  @ManyToOne(() => NotaFiscalFornecedor, { nullable: true })
  @JoinColumn({ name: 'nota_fiscal_fornecedor_id' })
  nota_fiscal_fornecedor: NotaFiscalFornecedor | null;

  @Column({ type: 'varchar', nullable: true })
  nota_fiscal_fornecedor_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  mapeamento_ia: {
    produto_nf_index: number;
    xProd_nf: string;
    item_contrato_id: string | null;
    descricao_of: string | null;
    confianca: number;
    confirmado_usuario: boolean;
    confirmado_por: string | null;
    confirmado_em: string | null;
  }[] | null;

  // ============================================================================
  // AUDITORIA
  // ============================================================================

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
