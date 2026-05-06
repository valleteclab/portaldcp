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
