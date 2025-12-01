import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Fornecedor } from '../../fornecedores/entities/fornecedor.entity';

export enum TipoContrato {
  CONTRATO = 'CONTRATO',
  NOTA_EMPENHO = 'NOTA_EMPENHO',
  ORDEM_SERVICO = 'ORDEM_SERVICO',
  ORDEM_FORNECIMENTO = 'ORDEM_FORNECIMENTO',
  CARTA_CONTRATO = 'CARTA_CONTRATO',
  TERMO_ADESAO = 'TERMO_ADESAO',
  ATA_REGISTRO_PRECO = 'ATA_REGISTRO_PRECO'
}

export enum StatusContrato {
  VIGENTE = 'VIGENTE',
  ENCERRADO = 'ENCERRADO',
  RESCINDIDO = 'RESCINDIDO',
  SUSPENSO = 'SUSPENSO',
  CANCELADO = 'CANCELADO'
}

export enum CategoriaContrato {
  COMPRAS = 'COMPRAS',
  SERVICOS = 'SERVICOS',
  OBRAS = 'OBRAS',
  SERVICOS_ENGENHARIA = 'SERVICOS_ENGENHARIA',
  LOCACAO = 'LOCACAO',
  ALIENACAO = 'ALIENACAO'
}

@Entity('contratos')
export class Contrato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Identificação
  @Column()
  numero_contrato: string; // Ex: "001/2024"

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

  @ManyToOne(() => Licitacao, { nullable: true })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ nullable: true })
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

  // Classificação
  @Column({
    type: 'enum',
    enum: TipoContrato,
    default: TipoContrato.CONTRATO
  })
  tipo: TipoContrato;

  @Column({
    type: 'enum',
    enum: CategoriaContrato,
    default: CategoriaContrato.COMPRAS
  })
  categoria: CategoriaContrato;

  @Column({
    type: 'enum',
    enum: StatusContrato,
    default: StatusContrato.VIGENTE
  })
  status: StatusContrato;

  // Objeto
  @Column({ type: 'text' })
  objeto: string;

  @Column({ type: 'text', nullable: true })
  objeto_detalhado: string;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_inicial: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_global: number; // Valor atualizado com aditivos

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_acrescimos: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_supressoes: number;

  // Datas
  @Column({ type: 'date' })
  data_assinatura: Date;

  @Column({ type: 'date' })
  data_vigencia_inicio: Date;

  @Column({ type: 'date' })
  data_vigencia_fim: Date;

  @Column({ type: 'date', nullable: true })
  data_publicacao: Date;

  // Prazos
  @Column({ type: 'int', nullable: true })
  prazo_execucao_dias: number;

  @Column({ type: 'int', nullable: true })
  prazo_vigencia_meses: number;

  // Garantia
  @Column({ default: false })
  exige_garantia: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  percentual_garantia: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_garantia: number;

  @Column({ nullable: true })
  tipo_garantia: string; // Caução, Fiança, Seguro

  // Fiscal do Contrato
  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  @Column({ nullable: true })
  fiscal_matricula: string;

  // Gestor do Contrato
  @Column({ nullable: true })
  gestor_id: string;

  @Column({ nullable: true })
  gestor_nome: string;

  @Column({ nullable: true })
  gestor_matricula: string;

  // Dotação Orçamentária
  @Column({ nullable: true })
  dotacao_orcamentaria: string;

  @Column({ nullable: true })
  fonte_recurso: string;

  @Column({ nullable: true })
  programa_trabalho: string;

  @Column({ nullable: true })
  elemento_despesa: string;

  // Amparo Legal
  @Column({ nullable: true })
  amparo_legal: string; // Ex: "Art. 75, II da Lei 14.133/2021"

  @Column({ nullable: true })
  numero_processo: string;

  // Documentos
  @Column({ nullable: true })
  arquivo_contrato: string; // Caminho do PDF

  // Integração PNCP
  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ type: 'int', nullable: true })
  ano_pncp: number;

  @Column({ type: 'int', nullable: true })
  sequencial_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

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
