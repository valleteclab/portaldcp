import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';

export enum TipoOrgao {
  PREFEITURA = 'PREFEITURA',
  CAMARA = 'CAMARA',
  AUTARQUIA = 'AUTARQUIA',
  FUNDACAO = 'FUNDACAO',
  EMPRESA_PUBLICA = 'EMPRESA_PUBLICA',
  SOCIEDADE_ECONOMIA_MISTA = 'SOCIEDADE_ECONOMIA_MISTA',
  CONSORCIO = 'CONSORCIO',
}

export enum EsferaAdministrativa {
  FEDERAL = 'FEDERAL',
  ESTADUAL = 'ESTADUAL',
  MUNICIPAL = 'MUNICIPAL',
  DISTRITAL = 'DISTRITAL',
}

@Entity('orgaos')
export class Orgao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Código UASG ou equivalente municipal
  @Column({ unique: true })
  codigo: string;

  @Column()
  nome: string;

  @Column({ nullable: true })
  nome_fantasia: string;

  @Column({ unique: true })
  cnpj: string;

  @Column({
    type: 'enum',
    enum: TipoOrgao,
    default: TipoOrgao.PREFEITURA
  })
  tipo: TipoOrgao;

  @Column({
    type: 'enum',
    enum: EsferaAdministrativa,
    default: EsferaAdministrativa.MUNICIPAL
  })
  esfera: EsferaAdministrativa;

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
  @Column({ nullable: true })
  telefone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  site: string;

  // Responsável Legal
  @Column()
  responsavel_nome: string;

  @Column()
  responsavel_cpf: string;

  @Column({ nullable: true })
  responsavel_cargo: string;

  // Autenticação
  @Column({ nullable: true, unique: true })
  email_login: string;

  @Column({ nullable: true })
  senha_hash: string;

  @Column({ nullable: true })
  pncp_codigo_unidade: string;

  @Column({ default: false })
  ativo: boolean;

  // ============ CREDENCIAIS PNCP ============

  @Column({ nullable: true })
  pncp_api_url: string;

  @Column({ nullable: true })
  pncp_login: string;

  @Column({ nullable: true })
  pncp_senha: string; // Será criptografada

  @Column({ nullable: true })
  pncp_cnpj_orgao: string;

  // ============ INTEGRAÇÃO PNCP ============
  // A plataforma (LicitaFácil) tem UMA credencial no PNCP
  // e vincula os CNPJs dos órgãos à plataforma

  @Column({ nullable: true, default: false })
  pncp_vinculado: boolean; // Se o CNPJ do órgão está vinculado à plataforma no PNCP

  @Column({ nullable: true })
  pncp_data_vinculacao: Date; // Data em que foi vinculado à plataforma

  @Column({ nullable: true })
  pncp_ultimo_envio: Date; // Data do último envio ao PNCP

  @Column({ nullable: true })
  pncp_status: string; // 'VINCULADO', 'PENDENTE', 'ERRO'

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
