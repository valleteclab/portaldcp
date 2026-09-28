import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { DocumentoFaseInterna } from './documento-fase-interna.entity';

/**
 * Log de auditoria da Fase Interna (Art. 169, Lei 14.133/2021 — 3 linhas de defesa).
 * Registra TODA ação relevante: criação, edição, submissão, aprovação, reprovação,
 * geração de PDF, assinatura, publicação no PNCP.
 */
export enum AcaoLogFaseInterna {
  DOCUMENTO_CRIADO = 'DOCUMENTO_CRIADO',
  DOCUMENTO_EDITADO = 'DOCUMENTO_EDITADO',
  DOCUMENTO_SUBMETIDO = 'DOCUMENTO_SUBMETIDO',
  DOCUMENTO_APROVADO = 'DOCUMENTO_APROVADO',
  DOCUMENTO_REPROVADO = 'DOCUMENTO_REPROVADO',
  DOCUMENTO_VERSIONADO = 'DOCUMENTO_VERSIONADO',
  DOCUMENTO_IMPORTADO = 'DOCUMENTO_IMPORTADO',
  PDF_GERADO = 'PDF_GERADO',
  DOCX_GERADO = 'DOCX_GERADO',
  ASSINATURA_ADICIONADA = 'ASSINATURA_ADICIONADA',
  ASSINATURA_CONCLUIDA = 'ASSINATURA_CONCLUIDA',
  PUBLICADO_PNCP = 'PUBLICADO_PNCP',
  FASE_AVANCADA = 'FASE_AVANCADA',
  IA_INVOCADA = 'IA_INVOCADA',
  // Tramitação do processo entre setores (estilo SEI)
  PROCESSO_TRAMITADO = 'PROCESSO_TRAMITADO',
  TRAMITACAO_RECEBIDA = 'TRAMITACAO_RECEBIDA',
  TRAMITACAO_DEVOLVIDA = 'TRAMITACAO_DEVOLVIDA',
  // Fluxo de aprovação multi-etapa
  ETAPA_APROVACAO_APROVADA = 'ETAPA_APROVACAO_APROVADA',
  ETAPA_APROVACAO_REPROVADA = 'ETAPA_APROVACAO_REPROVADA',
  // Etapas da fase interna e tarefas (Entrega 2) — histórico de quem, quando, de/para
  ETAPA_ALTERADA = 'ETAPA_ALTERADA',
  TAREFA_CRIADA = 'TAREFA_CRIADA',
  TAREFA_CONCLUIDA = 'TAREFA_CONCLUIDA',
  TAREFA_CANCELADA = 'TAREFA_CANCELADA',
  TAREFA_REATRIBUIDA = 'TAREFA_REATRIBUIDA',
  // Modelo de fluxo em dados (F1): voltar/avançar etapa, aprovação da demanda, parecer dispensado
  ETAPA_REABERTA = 'ETAPA_REABERTA',
  ETAPA_REVISADA = 'ETAPA_REVISADA',
  ETAPA_REGISTRADA = 'ETAPA_REGISTRADA',
  DEMANDA_APROVADA = 'DEMANDA_APROVADA',
  PARECER_DISPENSADO = 'PARECER_DISPENSADO',
  // IA em toda etapa (F4a): rascunho gerado/aceito/descartado e a revisão humana na emissão
  IA_RASCUNHO_GERADO = 'IA_RASCUNHO_GERADO',
  IA_RASCUNHO_ACEITO = 'IA_RASCUNHO_ACEITO',
  IA_RASCUNHO_DESCARTADO = 'IA_RASCUNHO_DESCARTADO',
  IA_REVISADA_POR = 'IA_REVISADA_POR',
  // Autos em ordem cronológica de juntada (27/09/2026): folhas recalculadas uma vez (migração)
  AUTOS_RENUMERADOS = 'AUTOS_RENUMERADOS',
  // Isolamento das peças (homologação multiusuário): administrador/login do órgão trabalhou fora da responsabilidade/posse
  ACAO_FORA_DA_RESPONSABILIDADE = 'ACAO_FORA_DA_RESPONSABILIDADE',
  // Construtor de fluxo: condição respondida (pelo sistema ou por quem conduz) e devolução por uma aprovação
  CONDICAO_RESPONDIDA = 'CONDICAO_RESPONDIDA',
  ETAPA_DEVOLVIDA = 'ETAPA_DEVOLVIDA',
}

@Entity('logs_fase_interna')
@Index(['licitacao_id', 'created_at'])
@Index(['documento_id', 'created_at'])
export class LogFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => DocumentoFaseInterna, { nullable: true })
  @JoinColumn({ name: 'documento_id' })
  documento: DocumentoFaseInterna;

  @Column({ nullable: true })
  documento_id: string;

  @Column({ type: 'enum', enum: AcaoLogFaseInterna })
  acao: AcaoLogFaseInterna;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  // Diff: o que mudou
  @Column({ type: 'jsonb', nullable: true })
  dados_antes: any;

  @Column({ type: 'jsonb', nullable: true })
  dados_depois: any;

  // Quem
  @Column({ nullable: true })
  usuario_id: string;

  @Column({ nullable: true })
  usuario_nome: string;

  @Column({ nullable: true })
  usuario_email: string;

  // Contexto
  @Column({ nullable: true })
  ip_origem: string;

  @Column({ nullable: true })
  user_agent: string;

  @CreateDateColumn()
  created_at: Date;
}
