import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { FornecedorSocio } from './fornecedor-socio.entity';
import { FornecedorAtividade } from './fornecedor-atividade.entity';
import { TipoPessoa, PorteEmpresa, NivelCadastro, StatusCadastro } from './enums';

// Re-exporta os enums para manter compatibilidade
export { TipoPessoa, PorteEmpresa, NivelCadastro, StatusCadastro } from './enums';

@Entity('fornecedores')
export class Fornecedor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === NÍVEL I - CREDENCIAMENTO ===
  @Column({
    type: 'enum',
    enum: TipoPessoa,
    default: TipoPessoa.JURIDICA
  })
  tipo_pessoa: TipoPessoa;

  @Column({ unique: true })
  cpf_cnpj: string;

  @Column()
  razao_social: string;

  @Column({ nullable: true })
  nome_fantasia: string;

  @Column({ nullable: true })
  inscricao_estadual: string;

  @Column({ nullable: true })
  inscricao_municipal: string;

  @Column({
    type: 'enum',
    enum: PorteEmpresa,
    nullable: true
  })
  porte: PorteEmpresa;

  // Endereço
  @Column()
  logradouro: string;

  @Column({ nullable: true })
  numero: string;

  @Column({ nullable: true })
  complemento: string;

  @Column()
  bairro: string;

  @Column()
  cidade: string;

  @Column({ length: 2 })
  uf: string;

  @Column({ length: 9 })
  cep: string;

  // Contato
  @Column()
  telefone: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  site: string;

  // Autenticação
  @Column({ nullable: true })
  senha: string;

  // Representante Legal
  @Column()
  representante_nome: string;

  @Column()
  representante_cpf: string;

  @Column({ nullable: true })
  representante_cargo: string;

  @Column({ nullable: true })
  representante_email: string;

  @Column({ nullable: true })
  representante_telefone: string;

  // === CONTROLE DE NÍVEIS ===
  @Column({
    type: 'enum',
    enum: NivelCadastro,
    default: NivelCadastro.NIVEL_I
  })
  nivel_atual: NivelCadastro;

  @Column({
    type: 'enum',
    enum: StatusCadastro,
    default: StatusCadastro.PENDENTE
  })
  status: StatusCadastro;

  // Flags de conclusão de cada nível
  @Column({ default: false })
  nivel_i_completo: boolean;

  @Column({ default: false })
  nivel_ii_completo: boolean;

  @Column({ default: false })
  nivel_iii_completo: boolean;

  @Column({ default: false })
  nivel_iv_completo: boolean;

  @Column({ default: false })
  nivel_v_completo: boolean;

  @Column({ default: false })
  nivel_vi_completo: boolean;

  // Validade do cadastro
  @Column({ type: 'timestamp', nullable: true })
  data_validade_cadastro: Date;

  // Ramos de atividade (CNAEs) - mantido para compatibilidade
  @Column({ type: 'simple-array', nullable: true })
  cnaes: string[];

  // === DADOS DA API CNPJ ===
  @Column({ nullable: true })
  natureza_juridica: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  capital_social: number;

  @Column({ type: 'date', nullable: true })
  data_inicio_atividade: Date;

  @Column({ nullable: true })
  tipo_estabelecimento: string; // Matriz ou Filial

  @Column({ nullable: true })
  telefone_secundario: string;

  // Situação cadastral na Receita
  @Column({ nullable: true })
  situacao_cadastral: string; // Ativa, Inapta, etc.

  @Column({ type: 'date', nullable: true })
  data_situacao_cadastral: Date;

  @Column({ nullable: true })
  motivo_situacao_cadastral: string;

  // Simples Nacional
  @Column({ default: false })
  optante_simples: boolean;

  @Column({ type: 'date', nullable: true })
  data_opcao_simples: Date;

  @Column({ type: 'date', nullable: true })
  data_exclusao_simples: Date;

  // MEI
  @Column({ default: false })
  optante_mei: boolean;

  @Column({ type: 'date', nullable: true })
  data_opcao_mei: Date;

  @Column({ type: 'date', nullable: true })
  data_exclusao_mei: Date;

  // Tipo do logradouro
  @Column({ nullable: true })
  tipo_logradouro: string;

  // Data da última consulta na API
  @Column({ type: 'timestamp', nullable: true })
  data_consulta_cnpj: Date;

  // Observações internas
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relacionamentos
  @OneToMany(() => FornecedorSocio, socio => socio.fornecedor)
  socios: FornecedorSocio[];

  @OneToMany(() => FornecedorAtividade, atividade => atividade.fornecedor)
  atividades: FornecedorAtividade[];

  @OneToMany('FornecedorDocumento', 'fornecedor')
  documentos: any[];
}
