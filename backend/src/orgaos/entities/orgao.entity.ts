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

  // Status
  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
