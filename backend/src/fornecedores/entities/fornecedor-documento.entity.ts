import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { NivelCadastro, TipoDocumento, TipoComprovante, StatusDocumento } from './enums';

// Re-exporta os enums para manter compatibilidade
export { TipoDocumento, TipoComprovante, StatusDocumento } from './enums';

@Entity('fornecedor_documentos')
export class FornecedorDocumento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Fornecedor', 'documentos', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: any;

  @Column()
  fornecedor_id: string;

  @Column({
    type: 'enum',
    enum: NivelCadastro
  })
  nivel: NivelCadastro;

  @Column({
    type: 'enum',
    enum: TipoDocumento
  })
  tipo: TipoDocumento;

  // Tipo de comprovante (Certidão, Decisão Judicial, Isenção)
  @Column({
    type: 'enum',
    enum: TipoComprovante,
    nullable: true
  })
  tipo_comprovante: TipoComprovante;

  @Column({ nullable: true })
  nome_arquivo: string;

  @Column({ nullable: true })
  caminho_arquivo: string;

  // Código de controle da certidão
  @Column({ nullable: true })
  codigo_controle: string;

  @Column({ nullable: true })
  numero_documento: string;

  @Column({ type: 'date', nullable: true })
  data_emissao: Date;

  @Column({ type: 'date', nullable: true })
  data_validade: Date;

  @Column({
    type: 'enum',
    enum: StatusDocumento,
    default: StatusDocumento.PENDENTE
  })
  status: StatusDocumento;

  @Column({ type: 'text', nullable: true })
  observacao_analise: string;

  @Column({ nullable: true })
  analisado_por: string;

  @Column({ type: 'timestamp', nullable: true })
  data_analise: Date;

  // Campos específicos para Atestado Técnico
  @Column({ nullable: true })
  atestado_emissor: string; // Nome de quem emitiu o atestado

  @Column({ type: 'date', nullable: true })
  atestado_data: Date;

  @Column({ type: 'text', nullable: true })
  atestado_descricao: string;

  // Campos específicos para Balanço Patrimonial
  @Column({ nullable: true })
  balanco_tipo: string; // Balanço Anual, Balanço Intermediário

  @Column({ nullable: true })
  balanco_exercicio: string; // Ex: "01/2024 a 12/2024"

  @Column({ nullable: true })
  balanco_demonstracao_contabil: string; // Ex: "01/2024"

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
