import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { FrotaCredencial } from './frota-credencial.entity';

export enum AcaoFrotaLog {
  LOGIN = 'LOGIN',
  FALHA_LOGIN = 'FALHA_LOGIN',
  LOGOUT = 'LOGOUT',
  VERIFICAR_REQ = 'VERIFICAR_REQ',
  CONFIRMAR_ABASTECIMENTO = 'CONFIRMAR_ABASTECIMENTO',
  CRIAR_REQUISICAO = 'CRIAR_REQUISICAO',
  ALTERAR_SENHA = 'ALTERAR_SENHA',
  VER_QR = 'VER_QR',
  LIBERAR_COTA_EXTRA = 'LIBERAR_COTA_EXTRA',
}

@Entity('frota_acessos_log')
export class FrotaAcessoLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FrotaCredencial, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'credencial_id' })
  credencial: FrotaCredencial;

  @Column({ nullable: true })
  credencial_id: string;

  @Column()
  orgao_id: string;

  @Column({ length: 50 })
  ip: string;

  @Column({ nullable: true, length: 500 })
  user_agent: string;

  @Column({ type: 'enum', enum: AcaoFrotaLog })
  acao: AcaoFrotaLog;

  /** JSON com detalhes adicionais (código verificado, ID da req, etc.) */
  @Column({ type: 'text', nullable: true })
  detalhes: string;

  @Column({ default: true })
  sucesso: boolean;

  @CreateDateColumn()
  created_at: Date;
}
