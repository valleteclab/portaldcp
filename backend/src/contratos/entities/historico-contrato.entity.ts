import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { Contrato } from './contrato.entity';

export enum TipoAcaoContrato {
  // Ciclo de vida
  CRIADO = 'CRIADO',
  EDITADO = 'EDITADO',
  EXCLUIDO = 'EXCLUIDO',

  // Fluxo de liberação
  ENVIADO_LIBERACAO = 'ENVIADO_LIBERACAO',
  LIBERADO = 'LIBERADO',
  LIBERACAO_REJEITADA = 'LIBERACAO_REJEITADA',

  // Status
  STATUS_ALTERADO = 'STATUS_ALTERADO',

  // Termos aditivos
  TERMO_ADITIVO_CRIADO = 'TERMO_ADITIVO_CRIADO',

  // Requisições / Pedidos
  REQUISICAO_CRIADA = 'REQUISICAO_CRIADA',

  // Ajuste de migração
  AJUSTE_MIGRACAO = 'AJUSTE_MIGRACAO',

  // PNCP
  ENVIADO_PNCP = 'ENVIADO_PNCP',

  // Itens
  ITEM_ADICIONADO = 'ITEM_ADICIONADO',
  ITEM_REMOVIDO = 'ITEM_REMOVIDO',
  ITEM_ALTERADO = 'ITEM_ALTERADO',

  // Documentos
  DOCUMENTO_ANEXADO = 'DOCUMENTO_ANEXADO',

  // Outros
  OBSERVACAO = 'OBSERVACAO',
}

@Entity('historico_contratos')
export class HistoricoContrato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento
  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  // Dados da ação
  @Column({
    type: 'enum',
    enum: TipoAcaoContrato
  })
  tipo_acao: TipoAcaoContrato;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'text', nullable: true })
  detalhes: string | null;

  @Column({ type: 'varchar', nullable: true })
  status_anterior: string | null;

  @Column({ type: 'varchar', nullable: true })
  status_novo: string | null;

  // Usuário que realizou a ação
  @Column({ type: 'varchar', nullable: true })
  usuario_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_nome: string | null;

  // Auditoria
  @CreateDateColumn()
  created_at: Date;
}
