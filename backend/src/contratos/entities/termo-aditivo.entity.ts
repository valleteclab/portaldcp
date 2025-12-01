import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Contrato } from './contrato.entity';

export enum TipoTermoAditivo {
  ADITIVO_PRAZO = 'ADITIVO_PRAZO',
  ADITIVO_VALOR = 'ADITIVO_VALOR',
  ADITIVO_PRAZO_VALOR = 'ADITIVO_PRAZO_VALOR',
  ADITIVO_OBJETO = 'ADITIVO_OBJETO',
  APOSTILAMENTO = 'APOSTILAMENTO',
  RESCISAO = 'RESCISAO',
  SUSPENSAO = 'SUSPENSAO',
  REAJUSTE = 'REAJUSTE'
}

export enum StatusTermoAditivo {
  VIGENTE = 'VIGENTE',
  ENCERRADO = 'ENCERRADO',
  CANCELADO = 'CANCELADO'
}

@Entity('termos_aditivos')
export class TermoAditivo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento
  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  // Identificação
  @Column()
  numero_termo: string; // Ex: "1º Termo Aditivo", "2º Apostilamento"

  @Column({ type: 'int' })
  sequencial: number;

  @Column({
    type: 'enum',
    enum: TipoTermoAditivo
  })
  tipo: TipoTermoAditivo;

  @Column({
    type: 'enum',
    enum: StatusTermoAditivo,
    default: StatusTermoAditivo.VIGENTE
  })
  status: StatusTermoAditivo;

  // Objeto do Termo
  @Column({ type: 'text' })
  objeto: string;

  @Column({ type: 'text' })
  justificativa: string;

  // Alterações de Valor
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_acrescimo: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_supressao: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  percentual_acrescimo: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  percentual_supressao: number;

  // Alterações de Prazo
  @Column({ type: 'int', nullable: true })
  prazo_acrescimo_dias: number;

  @Column({ type: 'date', nullable: true })
  nova_data_vigencia_fim: Date;

  // Datas
  @Column({ type: 'date' })
  data_assinatura: Date;

  @Column({ type: 'date', nullable: true })
  data_publicacao: Date;

  @Column({ type: 'date', nullable: true })
  data_vigencia_inicio: Date;

  @Column({ type: 'date', nullable: true })
  data_vigencia_fim: Date;

  // Amparo Legal
  @Column({ nullable: true })
  amparo_legal: string;

  // Documento
  @Column({ nullable: true })
  arquivo_termo: string;

  // Integração PNCP
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
