import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type AgenteAcaoTipo =
  | 'BUSCA_PORTAL'
  | 'IMPORTACAO_CONTRATO'
  | 'EXTRACAO_PDF'
  | 'ANALISE'
  | 'COBRANCA'
  | 'VALIDACAO'
  | 'NOTIFICACAO';

export type AgenteStatus = 'SUCESSO' | 'ERRO' | 'PENDENTE' | 'AVISO';

@Entity('agente_logs')
@Index(['created_at'])
@Index(['tipo_acao'])
@Index(['status'])
export class AgenteLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  tipo_acao: AgenteAcaoTipo;

  @Column({ type: 'varchar', length: 50, nullable: true })
  orgao_id?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contrato_numero?: string;

  @Column({ type: 'uuid', nullable: true })
  contrato_id?: string;

  @Column({ type: 'uuid', nullable: true })
  fornecedor_id?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cnpj_fornecedor?: string;

  @Column({ type: 'varchar', length: 50 })
  status: AgenteStatus;

  @Column({ type: 'text', nullable: true })
  mensagem?: string;

  @Column({ type: 'jsonb', nullable: true })
  detalhes?: {
    pdf_baixado?: boolean;
    itens_extraidos?: number;
    itens_criados?: number;
    erro?: string;
    stack?: string;
    [key: string]: any;
  };

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
