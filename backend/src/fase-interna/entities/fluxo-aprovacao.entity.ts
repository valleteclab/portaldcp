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
  /**
   * Modelo pronto: quem o modelo sugere para a etapa (ex.: "Chefe do setor
   * requisitante"). Só orientação na tela — o órgão escolhe o setor/pessoa.
   */
  sugestao_responsavel?: string;
}

/**
 * Configuração de fluxo de aprovação de documentos por órgão (estilo SEI).
 * Tipos do fluxo = `tipo_documento` ∪ `tipos_documento` (um fluxo pode valer
 * para várias peças — ex.: as minutas). Sem tipo nenhum = fluxo GENÉRICO do
 * órgão (vale para as peças sem fluxo próprio). Sem nenhum fluxo configurado,
 * vale a aprovação única (quem conduz o processo aprova).
 *
 * O fluxo só é aplicado AUTOMATICAMENTE às peças das etapas com "aprovação
 * interna" ligada no modelo de fluxo da fase interna (Configurações › Fluxo).
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

  /** Tipos adicionais (além de `tipo_documento`) — mesma regra de resolução. */
  @Column({ type: 'jsonb', nullable: true })
  tipos_documento: string[] | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  etapas: EtapaFluxoDef[];

  /** Código do modelo pronto usado para criar o fluxo (nulo = feito do zero). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  modelo_origem: string | null;

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

  /** Rodada da submissão (reenvio após reprovação = rodada nova). */
  @Column({ type: 'int', default: 1 })
  rodada: number;

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

  /** Quem enviou a peça ao fluxo (o autor da peça, na submissão automática). */
  @Column({ type: 'varchar', nullable: true })
  submetido_por_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  submetido_por_nome: string | null;

  /** Enviada sozinha ao emitir/anexar (etapa com "aprovação interna" ligada). */
  @Column({ type: 'boolean', default: false })
  automatica: boolean;

  @CreateDateColumn()
  created_at: Date;
}

/** Etapa de um modelo pronto (o responsável é só SUGESTÃO; o órgão escolhe). */
export interface EtapaModeloAprovacaoDef {
  ordem: number;
  nome: string;
  descricao?: string;
  exige_assinatura: boolean;
  sugestao_responsavel: string;
}

/**
 * CATÁLOGO DE MODELOS PRONTOS de fluxo de aprovação (dados, semeados no boot —
 * não ficam na tela). "Usar este modelo" abre o editor do órgão já preenchido;
 * o órgão escolhe o setor/pessoa de cada etapa. Só o administrador da
 * plataforma altera o catálogo.
 */
@Entity('modelos_fluxo_aprovacao')
export class ModeloFluxoAprovacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Chave estável (semente idempotente). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  nome: string;

  /** Uma linha: para que serve. */
  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  tipos_documento: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  etapas: EtapaModeloAprovacaoDef[];

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  /** Alterado pelo admin da plataforma: a semente não sobrescreve. */
  @Column({ type: 'boolean', default: false })
  editado: boolean;

  @Column({ type: 'varchar', nullable: true })
  atualizado_por_nome: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
