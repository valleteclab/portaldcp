import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  DocumentoFaseInterna,
  TipoDocumentoFaseInterna,
} from './documento-fase-interna.entity';

/** Definição de uma etapa dentro da configuração do fluxo */
export interface EtapaFluxoDef {
  ordem: number;
  /** Ex.: "Revisão técnica", "Aprovação da autoridade competente" */
  nome: string;
  descricao?: string;
  /** Responsável previsto: setor e/ou usuário específico */
  setor_id?: string;
  setor_nome?: string;
  usuario_id?: string;
  usuario_nome?: string;
  /** Ao aprovar esta etapa, o decisor assina o documento */
  exige_assinatura: boolean;
}

/**
 * Configuração de fluxo de aprovação de documentos por órgão (estilo SEI).
 * `tipo_documento` NULL = fluxo genérico do órgão (fallback para tipos sem fluxo próprio).
 * Sem nenhum fluxo configurado, vale o comportamento legado: uma única aprovação.
 */
@Entity('fluxos_aprovacao_documento')
@Index(['orgao_id', 'tipo_documento'])
export class FluxoAprovacaoDocumento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orgao_id: string;

  @Column({ type: 'enum', enum: TipoDocumentoFaseInterna, nullable: true })
  tipo_documento: TipoDocumentoFaseInterna | null;

  @Column()
  nome: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  etapas: EtapaFluxoDef[];

  @Column({ default: true })
  ativo: boolean;

  @Column({ nullable: true })
  criado_por_id: string;

  @Column({ nullable: true })
  criado_por_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

export enum StatusEtapaAprovacao {
  PENDENTE = 'PENDENTE',       // aguardando a vez (etapas anteriores em aberto)
  EM_ANALISE = 'EM_ANALISE',   // é a etapa atual
  APROVADA = 'APROVADA',
  REPROVADA = 'REPROVADA',
  CANCELADA = 'CANCELADA',     // fluxo interrompido (reprovação anterior ou nova versão)
}

/**
 * Instância de etapa de aprovação de um documento específico.
 * Criadas ao submeter o documento, a partir do fluxo configurado.
 */
@Entity('aprovacoes_documento')
@Index(['documento_id', 'ordem'])
@Index(['setor_id', 'status'])
@Index(['usuario_id', 'status'])
export class AprovacaoDocumento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DocumentoFaseInterna)
  @JoinColumn({ name: 'documento_id' })
  documento: DocumentoFaseInterna;

  @Column()
  documento_id: string;

  @Column()
  licitacao_id: string;

  @Column({ nullable: true })
  fluxo_id: string;

  @Column({ type: 'int' })
  ordem: number;

  @Column()
  nome: string;

  // Responsável previsto
  @Column({ nullable: true })
  setor_id: string;

  @Column({ nullable: true })
  setor_nome: string;

  @Column({ nullable: true })
  usuario_id: string;

  @Column({ nullable: true })
  usuario_nome: string;

  @Column({ default: false })
  exige_assinatura: boolean;

  @Column({ type: 'enum', enum: StatusEtapaAprovacao, default: StatusEtapaAprovacao.PENDENTE })
  status: StatusEtapaAprovacao;

  // Decisão
  @Column({ nullable: true })
  decidido_por_id: string;

  @Column({ nullable: true })
  decidido_por_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  data_decisao: Date;

  @Column({ type: 'text', nullable: true })
  justificativa: string;

  @CreateDateColumn()
  created_at: Date;
}
