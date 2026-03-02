import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { ModuloSistema } from '../../orgaos/enums/modulos.enum';

export enum RoleUsuario {
  ADMIN = 'ADMIN',
  PREGOEIRO = 'PREGOEIRO',
  EQUIPE_APOIO = 'EQUIPE_APOIO',
}

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ unique: true })
  email: string;

  @Column()
  senha_hash: string;

  @Column({ nullable: true })
  cpf: string;

  @Column({ nullable: true })
  telefone: string;

  @Column({ nullable: true })
  cargo: string;

  @Column({
    type: 'enum',
    enum: RoleUsuario,
    default: RoleUsuario.EQUIPE_APOIO,
  })
  role: RoleUsuario;

  @Column({ nullable: true })
  orgao_id: string;

  @ManyToOne(() => Orgao, { nullable: true })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ default: true })
  ativo: boolean;

  @Column({ nullable: true })
  ultimo_acesso: Date;

  /**
   * Módulos habilitados para este usuário.
   * Se null/vazio: herda todos os módulos do órgão
   * Se preenchido: deve ser um subconjunto dos módulos do órgão
   */
  @Column({
    type: 'simple-array',
    nullable: true,
    default: null,
  })
  modulos_habilitados: ModuloSistema[];

  /**
   * Indica se o usuário pode aprovar requisições no almoxarifado.
   * Apenas usuários com essa permissão veem a página de aprovações.
   */
  @Column({ default: false })
  pode_aprovar_requisicoes: boolean;

  /**
   * Indica se o usuário pode cancelar requisições e estornar recebimentos.
   * Apenas usuários com essa permissão podem realizar essas ações críticas.
   */
  @Column({ default: false })
  pode_cancelar_estornar: boolean;

  /**
   * Indica se o usuário pode liberar contratos para pedidos/requisições.
   * Contratos precisam ser liberados antes de permitir requisições.
   */
  @Column({ default: false })
  pode_liberar_contratos: boolean;

  /**
   * Indica se o usuário pode excluir medições (inclusive aprovadas).
   * Ao excluir medição aprovada, o saldo das etapas é revertido automaticamente.
   */
  @Column({ default: false })
  pode_excluir_medicao: boolean;

  /**
   * Indica se o usuário é fiscal de contrato.
   * Fiscais podem atestar medições, devolver ao fornecedor e acessar o painel de medições.
   */
  @Column({ default: false })
  eh_fiscal_contrato: boolean;

  @Column({ default: false })
  pode_gerenciar_os: boolean;

  /**
   * Indica se o usuário pode aceitar recebimentos de itens permanentes (patrimônio).
   * Itens permanentes exigem esta permissão para dar baixa no contrato.
   */
  @Column({ default: false })
  pode_receber_patrimonio: boolean;

  @Column({ nullable: true })
  google_id: string;

  @Column({ default: false })
  google_login: boolean;

  @Column({
    type: 'enum',
    enum: ['PENDENTE', 'ATIVO', 'BLOQUEADO', 'INATIVO'],
    default: 'ATIVO',
  })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  data_solicitacao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_aprovacao: Date;

  @Column({ nullable: true })
  aprovado_por: string;

  @Column({ nullable: true })
  foto_url: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
