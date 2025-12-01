import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

export enum TipoSincronizacao {
  PCA = 'PCA',
  COMPRA = 'COMPRA',
  ITEM = 'ITEM',
  DOCUMENTO = 'DOCUMENTO',
  RESULTADO = 'RESULTADO',
  ATA = 'ATA',
  CONTRATO = 'CONTRATO',
  TERMO = 'TERMO'
}

export enum StatusSincronizacao {
  PENDENTE = 'PENDENTE',
  ENVIANDO = 'ENVIANDO',
  ENVIADO = 'ENVIADO',
  ERRO = 'ERRO',
  ATUALIZADO = 'ATUALIZADO',
  EXCLUIDO = 'EXCLUIDO'
}

@Entity('pncp_sync')
export class PncpSync {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: TipoSincronizacao
  })
  tipo: TipoSincronizacao;

  @Column({ nullable: true })
  entidade_id: string;

  @Column({ nullable: true })
  licitacao_id: string;

  @ManyToOne(() => Licitacao, { nullable: true })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ nullable: true })
  ano_compra: number;

  @Column({ nullable: true })
  sequencial_compra: number;

  @Column({
    type: 'enum',
    enum: StatusSincronizacao,
    default: StatusSincronizacao.PENDENTE
  })
  status: StatusSincronizacao;

  @Column({ type: 'text', nullable: true })
  erro_mensagem: string;

  @Column({ type: 'int', default: 0 })
  tentativas: number;

  @Column({ type: 'timestamp', nullable: true })
  ultima_tentativa: Date;

  @Column({ type: 'jsonb', nullable: true })
  payload_enviado: any;

  @Column({ type: 'jsonb', nullable: true })
  resposta_pncp: any;

  @Column({ nullable: true })
  usuario_envio: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
