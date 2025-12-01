import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SessaoDisputa } from './sessao-disputa.entity';

/**
 * Tipos de Eventos da Sessao para composicao da Ata Eletronica
 * Conforme Art. 17, §2º da Lei 14.133/2021
 */
export enum TipoEvento {
  // Sessao
  SESSAO_INICIADA = 'SESSAO_INICIADA',
  SESSAO_SUSPENSA = 'SESSAO_SUSPENSA',
  SESSAO_RETOMADA = 'SESSAO_RETOMADA',
  SESSAO_ENCERRADA = 'SESSAO_ENCERRADA',
  
  // Propostas
  PROPOSTA_RECEBIDA = 'PROPOSTA_RECEBIDA',
  PROPOSTA_CLASSIFICADA = 'PROPOSTA_CLASSIFICADA',
  PROPOSTA_DESCLASSIFICADA = 'PROPOSTA_DESCLASSIFICADA',
  PROPOSTA_RECUSADA = 'PROPOSTA_RECUSADA',
  
  // Lances
  LANCE_REGISTRADO = 'LANCE_REGISTRADO',
  LANCE_CANCELADO = 'LANCE_CANCELADO',
  LANCE_RECUSADO = 'LANCE_RECUSADO',
  
  // Disputa
  DISPUTA_INICIADA = 'DISPUTA_INICIADA',
  DISPUTA_ITEM_INICIADA = 'DISPUTA_ITEM_INICIADA',
  DISPUTA_ITEM_ENCERRADA = 'DISPUTA_ITEM_ENCERRADA',
  TEMPO_ALEATORIO_INICIADO = 'TEMPO_ALEATORIO_INICIADO',
  DISPUTA_ENCERRADA = 'DISPUTA_ENCERRADA',
  PRORROGACAO_AUTOMATICA = 'PRORROGACAO_AUTOMATICA',
  
  // Negociacao
  NEGOCIACAO_INICIADA = 'NEGOCIACAO_INICIADA',
  NEGOCIACAO_PROPOSTA = 'NEGOCIACAO_PROPOSTA',
  NEGOCIACAO_ACEITA = 'NEGOCIACAO_ACEITA',
  NEGOCIACAO_RECUSADA = 'NEGOCIACAO_RECUSADA',
  NEGOCIACAO_ENCERRADA = 'NEGOCIACAO_ENCERRADA',
  
  // Habilitacao
  CONVOCACAO_HABILITACAO = 'CONVOCACAO_HABILITACAO',
  DOCUMENTO_HABILITACAO_ENVIADO = 'DOCUMENTO_HABILITACAO_ENVIADO',
  HABILITACAO_APROVADA = 'HABILITACAO_APROVADA',
  HABILITACAO_REPROVADA = 'HABILITACAO_REPROVADA',
  
  // ME/EPP
  BENEFICIO_MPE_APLICADO = 'BENEFICIO_MPE_APLICADO',
  EMPATE_FICTO_DETECTADO = 'EMPATE_FICTO_DETECTADO',
  LANCE_MPE_SOLICITADO = 'LANCE_MPE_SOLICITADO',
  LANCE_MPE_REGISTRADO = 'LANCE_MPE_REGISTRADO',
  LANCE_MPE_NAO_REGISTRADO = 'LANCE_MPE_NAO_REGISTRADO',
  
  // Recursos
  INTENCAO_RECURSO_REGISTRADA = 'INTENCAO_RECURSO_REGISTRADA',
  INTENCAO_RECURSO_ACEITA = 'INTENCAO_RECURSO_ACEITA',
  INTENCAO_RECURSO_RECUSADA = 'INTENCAO_RECURSO_RECUSADA',
  PRAZO_RECURSAL_INICIADO = 'PRAZO_RECURSAL_INICIADO',
  RECURSO_REGISTRADO = 'RECURSO_REGISTRADO',
  CONTRARRAZOES_REGISTRADAS = 'CONTRARRAZOES_REGISTRADAS',
  RECURSO_PROVIDO = 'RECURSO_PROVIDO',
  RECURSO_IMPROVIDO = 'RECURSO_IMPROVIDO',
  
  // Adjudicacao e Homologacao
  ITEM_ADJUDICADO = 'ITEM_ADJUDICADO',
  LICITACAO_ADJUDICADA = 'LICITACAO_ADJUDICADA',
  LICITACAO_HOMOLOGADA = 'LICITACAO_HOMOLOGADA',
  
  // Outros
  MENSAGEM_PREGOEIRO = 'MENSAGEM_PREGOEIRO',
  MENSAGEM_FORNECEDOR = 'MENSAGEM_FORNECEDOR',
  MENSAGEM_SISTEMA = 'MENSAGEM_SISTEMA',
  DILIGENCIA_SOLICITADA = 'DILIGENCIA_SOLICITADA',
  DILIGENCIA_RESPONDIDA = 'DILIGENCIA_RESPONDIDA',
  ESCLARECIMENTO_SOLICITADO = 'ESCLARECIMENTO_SOLICITADO',
  ESCLARECIMENTO_RESPONDIDO = 'ESCLARECIMENTO_RESPONDIDO',
}

@Entity('eventos_sessao')
export class EventoSessao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === RELACIONAMENTO ===
  @ManyToOne(() => SessaoDisputa)
  @JoinColumn({ name: 'sessao_id' })
  sessao: SessaoDisputa;

  @Column()
  sessao_id: string;

  // === EVENTO ===
  @Column({ type: 'enum', enum: TipoEvento })
  tipo: TipoEvento;

  @Column({ type: 'text' })
  descricao: string;

  // === CONTEXTO ===
  @Column({ nullable: true })
  item_id: string;

  @Column({ nullable: true })
  fornecedor_id: string;

  @Column({ nullable: true })
  fornecedor_identificador: string;

  @Column({ nullable: true })
  lance_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor: number;

  // === DADOS ADICIONAIS (JSON) ===
  @Column({ type: 'jsonb', nullable: true })
  dados_adicionais: Record<string, any>;

  // === AUDITORIA ===
  @Column({ nullable: true })
  usuario_id: string;

  @Column({ nullable: true })
  usuario_nome: string;

  @Column({ default: false })
  is_sistema: boolean; // true = evento automatico do sistema

  @Column({ nullable: true })
  ip_origem: string;

  @CreateDateColumn()
  created_at: Date;
}
