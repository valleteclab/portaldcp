import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';

/**
 * Status da Sessao de Disputa conforme Lei 14.133/2021
 * Art. 56 - Modos de disputa
 */
export enum StatusSessao {
  AGUARDANDO_INICIO = 'AGUARDANDO_INICIO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  MODO_ABERTO = 'MODO_ABERTO',           // Lances sucessivos
  MODO_FECHADO = 'MODO_FECHADO',         // Lance unico sigiloso
  RANDOM_ENCERRANDO = 'RANDOM_ENCERRANDO', // Tempo aleatorio antes de encerrar
  ENCERRADA = 'ENCERRADA',
  SUSPENSA = 'SUSPENSA',
  CANCELADA = 'CANCELADA',
}

/**
 * Etapas da Sessao conforme fluxo do Pregao Eletronico
 */
export enum EtapaSessao {
  // Abertura
  ABERTURA_SESSAO = 'ABERTURA_SESSAO',
  
  // Analise de Propostas
  ANALISE_PROPOSTAS = 'ANALISE_PROPOSTAS',
  DESCLASSIFICACAO_PROPOSTAS = 'DESCLASSIFICACAO_PROPOSTAS',
  
  // Disputa
  DISPUTA_LANCES = 'DISPUTA_LANCES',
  RANDOM_ENCERRAMENTO = 'RANDOM_ENCERRAMENTO',
  
  // Negociacao
  NEGOCIACAO = 'NEGOCIACAO',
  
  // Habilitacao
  CONVOCACAO_HABILITACAO = 'CONVOCACAO_HABILITACAO',
  ANALISE_HABILITACAO = 'ANALISE_HABILITACAO',
  
  // Beneficio ME/EPP (LC 123/2006)
  BENEFICIO_MPE = 'BENEFICIO_MPE',
  
  // Recursos
  INTENCAO_RECURSO = 'INTENCAO_RECURSO',
  PRAZO_RECURSAL = 'PRAZO_RECURSAL',
  ANALISE_RECURSOS = 'ANALISE_RECURSOS',
  
  // Finalizacao
  ADJUDICACAO = 'ADJUDICACAO',
  ENCERRAMENTO = 'ENCERRAMENTO',
}

@Entity('sessoes_disputa')
export class SessaoDisputa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === RELACIONAMENTOS ===
  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => ItemLicitacao, { nullable: true })
  @JoinColumn({ name: 'item_atual_id' })
  item_atual: ItemLicitacao;

  @Column({ nullable: true })
  item_atual_id: string;

  // === STATUS E ETAPA ===
  @Column({ type: 'enum', enum: StatusSessao, default: StatusSessao.AGUARDANDO_INICIO })
  status: StatusSessao;

  @Column({ type: 'enum', enum: EtapaSessao, default: EtapaSessao.ABERTURA_SESSAO })
  etapa: EtapaSessao;

  // === DATAS E HORARIOS ===
  @Column({ type: 'timestamp', nullable: true })
  data_hora_inicio_prevista: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_hora_inicio_real: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_hora_encerramento: Date;

  // === CONTROLE DE TEMPO DA DISPUTA ===
  // Art. 56, §3º - Tempo minimo entre lances
  @Column({ type: 'int', default: 3 })
  intervalo_minimo_lances_minutos: number;

  // Tempo de inatividade para encerramento (padrao 10 min)
  @Column({ type: 'int', default: 10 })
  tempo_inatividade_minutos: number;

  // Tempo aleatorio para encerramento (2 a 30 min conforme IN)
  @Column({ type: 'int', default: 2 })
  tempo_aleatorio_min_minutos: number;

  @Column({ type: 'int', default: 30 })
  tempo_aleatorio_max_minutos: number;

  // Tempo sorteado para encerramento
  @Column({ type: 'int', nullable: true })
  tempo_aleatorio_sorteado: number;

  // Timestamp do ultimo lance (para calcular inatividade)
  @Column({ type: 'timestamp', nullable: true })
  ultimo_lance_em: Date;

  // Timestamp de inicio do tempo aleatorio
  @Column({ type: 'timestamp', nullable: true })
  inicio_tempo_aleatorio: Date;

  // === PRORROGACAO ===
  // Art. 56, §4º - Prorrogacao automatica
  @Column({ type: 'int', default: 2 })
  tempo_prorrogacao_minutos: number;

  @Column({ type: 'int', default: 0 })
  quantidade_prorrogacoes: number;

  @Column({ type: 'int', default: 0 })
  prorrogacoes_utilizadas: number;

  // === CONFIGURACOES ===
  @Column({ default: false })
  disputa_por_item: boolean; // true = item a item, false = lote

  @Column({ default: true })
  modo_aberto: boolean; // true = aberto, false = fechado

  @Column({ default: false })
  modo_aberto_fechado: boolean; // Hibrido

  // === PREGOEIRO ===
  @Column({ nullable: true })
  pregoeiro_id: string;

  @Column({ nullable: true })
  pregoeiro_nome: string;

  // === OBSERVACOES ===
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'text', nullable: true })
  motivo_suspensao: string;

  // === AUDITORIA ===
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
