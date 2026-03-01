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
import { Fornecedor } from '../../fornecedores/entities/fornecedor.entity';

export enum StatusNotaFiscalFornecedor {
  ENVIADA = 'ENVIADA',
  PROCESSADA = 'PROCESSADA',
  VINCULADA = 'VINCULADA',
  RECUSADA = 'RECUSADA',
  ERRO = 'ERRO',
}

export interface ProdutoXml {
  nItem: number;
  cProd: string;
  xProd: string;
  qCom: number;
  uCom: string;
  vUnCom: number;
  vProd: number;
  NCM: string;
}

export interface MapeamentoAiItem {
  produto_nf_index: number;
  xProd_nf: string;
  item_contrato_id: string | null;
  descricao_of: string | null;
  confianca: number;
  justificativa: string;
}

export interface MapeamentoConfirmadoItem {
  produto_nf_index: number;
  xProd_nf: string;
  item_contrato_id: string;
  descricao_of: string;
  confirmado_por: string;
  confirmado_em: string;
}

@Entity('notas_fiscais_fornecedor')
export class NotaFiscalFornecedor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Fornecedor)
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  fornecedor_id: string;

  @ManyToOne(() => OrdemFornecimento)
  @JoinColumn({ name: 'ordem_fornecimento_id' })
  ordem_fornecimento: OrdemFornecimento;

  @Column()
  ordem_fornecimento_id: string;

  /**
   * Quando modo_envio_nf da ordem é SEPARADA: indica se esta NF é para itens CONSUMO ou PERMANENTE.
   * Null = NF conjunta (todos os itens).
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  tipo_itens: 'CONSUMO' | 'PERMANENTE' | null;

  @Column({ type: 'varchar', nullable: true })
  numero: string | null;

  @Column({ type: 'varchar', nullable: true })
  serie: string | null;

  @Column({ type: 'varchar', length: 44, nullable: true })
  chave_acesso: string | null;

  @Column({ type: 'date', nullable: true })
  data_emissao: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total: number | null;

  @Column({ type: 'varchar', nullable: true })
  cnpj_emitente: string | null;

  @Column({ type: 'varchar', nullable: true })
  razao_social_emitente: string | null;

  @Column({ type: 'jsonb', default: [] })
  produtos_xml: ProdutoXml[];

  @Column({ type: 'jsonb', nullable: true })
  mapeamento_ai: MapeamentoAiItem[] | null;

  @Column({ type: 'jsonb', nullable: true })
  mapeamento_confirmado: MapeamentoConfirmadoItem[] | null;

  @Column({ type: 'varchar', nullable: true })
  caminho_xml: string | null;

  @Column({ type: 'varchar', nullable: true })
  caminho_pdf: string | null;

  @Column({ type: 'jsonb', default: [] })
  documentos_extras: Array<{
    nome: string;
    caminho: string;
    tipo: string;
  }>;

  @Column({ type: 'text', nullable: true })
  xml_raw: string | null;

  @Column({
    type: 'enum',
    enum: StatusNotaFiscalFornecedor,
    default: StatusNotaFiscalFornecedor.ENVIADA,
  })
  status: StatusNotaFiscalFornecedor;

  @Column({ type: 'text', nullable: true })
  erro_processamento: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_recusa: string | null;

  @Column({ type: 'jsonb', default: [] })
  historico: Array<{
    data: string;
    tipo: string;
    descricao: string;
    usuario: string;
  }>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
