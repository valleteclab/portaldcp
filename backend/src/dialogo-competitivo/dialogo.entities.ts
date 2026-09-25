import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * ============================================================================
 * DIÁLOGO COMPETITIVO (Lei 14.133/2021 arts. 6º XLII e 32; plano E7c)
 * ============================================================================
 * Pré-seleção, fase de diálogo (reuniões registradas em ata e gravadas — §1º
 * VI), sigilo das soluções entre licitantes (§1º IV) e fase competitiva
 * (§1º VIII). Arquivos grandes (gravações) ficam na pasta SENSÍVEL
 * `dialogo-competitivo/<licitação>/` (nunca servida sem checagem de dono).
 * Produção: synchronize (nada a migrar).
 */

export type EtapaDialogo = 'MANIFESTACAO' | 'PRE_SELECAO' | 'DIALOGO' | 'CONCLUIDO' | 'COMPETITIVA';

@Entity('dialogo_competitivo')
export class DialogoCompetitivo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Hipóteses do art. 32 I (a, b, c) e II (a, b, c) — ex.: ['I_A', 'I_C', 'II_A']. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  hipoteses: string[];

  @Column({ type: 'text', nullable: true })
  justificativa_hipotese: string | null;

  /** §1º I — necessidades da Administração. */
  @Column({ type: 'text', nullable: true })
  necessidades: string | null;

  /** §1º I — exigências já definidas. */
  @Column({ type: 'text', nullable: true })
  exigencias_definidas: string | null;

  /** §1º II — critérios OBJETIVOS de pré-seleção: [{ id, descricao }]. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  criterios_preselecao: Array<{ id: string; descricao: string }>;

  /** §1º VII — fases sucessivas previstas no edital. */
  @Column({ type: 'boolean', default: false })
  fases_sucessivas: boolean;

  @Column({ type: 'varchar', length: 16, default: 'MANIFESTACAO' })
  etapa: EtapaDialogo;

  @Column({ type: 'timestamptz', nullable: true })
  dialogo_iniciado_em: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dialogo_concluido_em: Date | null;

  /** §1º V — decisão fundamentada que identifica a(s) solução(ões). */
  @Column({ type: 'text', nullable: true })
  conclusao_motivacao: string | null;

  @Column({ type: 'text', nullable: true })
  solucao_identificada: string | null;

  /** §1º VIII — juntada dos registros e gravações aos autos. */
  @Column({ type: 'timestamptz', nullable: true })
  registros_juntados_em: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fase_competitiva_publicada_em: Date | null;

  /** §1º VIII — especificação da solução e critérios objetivos de seleção. */
  @Column({ type: 'text', nullable: true })
  especificacao_solucao: string | null;

  @Column({ type: 'text', nullable: true })
  criterios_selecao: string | null;

  /** Edital da fase competitiva (pasta sensível; público depois de publicado). */
  @Column({ type: 'varchar', length: 400, nullable: true })
  edital_competitivo_caminho: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  edital_competitivo_sha256: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * Comissão de contratação (§1º XI): pelo menos 3 servidores EFETIVOS ou
 * empregados públicos dos quadros permanentes; assessores contratados
 * assinam termo de confidencialidade (§2º).
 */
@Entity('dialogo_comissao')
export class DialogoComissaoMembro {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid', nullable: true })
  usuario_id: string | null;

  @Column({ type: 'varchar', length: 200 })
  nome: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cargo: string | null;

  /** EFETIVO | EMPREGADO_PERMANENTE | ASSESSOR_CONTRATADO */
  @Column({ type: 'varchar', length: 24 })
  vinculo: 'EFETIVO' | 'EMPREGADO_PERMANENTE' | 'ASSESSOR_CONTRATADO';

  @Column({ type: 'varchar', length: 12, default: 'MEMBRO' })
  papel: 'PRESIDENTE' | 'MEMBRO' | 'ASSESSOR';

  /** §2º — termo de confidencialidade e declaração de ausência de conflito de interesses (assessor). */
  @Column({ type: 'timestamptz', nullable: true })
  termo_confidencialidade_em: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/** Interessado que manifestou interesse (§1º I) e sua pré-seleção (§1º II). */
@Entity('dialogo_participantes')
@Unique('UQ_dialogo_participante', ['licitacao_id', 'fornecedor_id'])
export class DialogoParticipante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 64 })
  fornecedor_id: string;

  @Column({ type: 'text' })
  manifestacao: string;

  /** Documentos que comprovam os critérios de pré-seleção (no banco). */
  @Column({ type: 'bytea', nullable: true, select: false })
  documento: Buffer | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documento_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  documento_mime: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  documento_sha256: string | null;

  @Column({ type: 'timestamptz' })
  manifestado_em: Date;

  @Column({ type: 'varchar', length: 16, default: 'INTERESSADO' })
  situacao: 'INTERESSADO' | 'PRE_SELECIONADO' | 'NAO_SELECIONADO';

  /** Critérios atendidos (ids de `criterios_preselecao`). */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  criterios_atendidos: string[];

  @Column({ type: 'text', nullable: true })
  decisao_motivo: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidido_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  decidido_por: string | null;

  // --- Pedido de reconsideração da NÃO seleção (Lei 14.133 art. 165, II — ato sem recurso hierárquico) ---
  @Column({ type: 'varchar', length: 12, nullable: true })
  reconsideracao_status: 'PENDENTE' | 'PROVIDA' | 'IMPROVIDA' | null;

  @Column({ type: 'text', nullable: true })
  reconsideracao_razoes: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  reconsideracao_arquivo: Buffer | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reconsideracao_arquivo_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reconsideracao_arquivo_mime: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reconsideracao_arquivo_sha256: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reconsideracao_pedida_em: Date | null;

  /** Prazo da decisão (3 dias úteis do pedido — parâmetro da plataforma; sinalizado, nunca decidido sozinho). */
  @Column({ type: 'timestamptz', nullable: true })
  reconsideracao_prazo_decisao: Date | null;

  @Column({ type: 'text', nullable: true })
  reconsideracao_fundamentacao: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reconsideracao_decidida_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reconsideracao_decidida_por: string | null;

  /** Trilha da pré-seleção/reconsideração: [{ em, ato, por, detalhe }]. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  historico: Array<{ em: string; ato: string; por: string | null; detalhe?: string | null }>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/** Reunião da fase de diálogo — sempre com UM licitante (sigilo — §1º III e IV). */
@Entity('dialogo_reunioes')
export class DialogoReuniao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Index()
  @Column({ type: 'uuid' })
  participante_id: string;

  @Column({ type: 'int', default: 1 })
  rodada: number;

  @Column({ type: 'timestamptz' })
  agendada_para: Date;

  @Column({ type: 'text' })
  pauta: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  local_ou_link: string | null;

  @Column({ type: 'varchar', length: 12, default: 'AGENDADA' })
  status: 'AGENDADA' | 'REALIZADA' | 'CANCELADA';

  @Column({ type: 'timestamptz', nullable: true })
  realizada_em: Date | null;

  /** §1º VI — ata da reunião (texto e/ou arquivo). */
  @Column({ type: 'text', nullable: true })
  ata_texto: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  ata_arquivo: string | null;

  /** §1º VI — gravação em áudio e vídeo (arquivo na pasta sensível ou link do repositório oficial). */
  @Column({ type: 'varchar', length: 400, nullable: true })
  gravacao_arquivo: string | null;

  @Column({ type: 'varchar', length: 600, nullable: true })
  gravacao_link: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  gravacao_sha256: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_cancelamento: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  registrada_por: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/** Solução/informação apresentada pelo licitante — sigilosa entre licitantes (§1º IV). */
@Entity('dialogo_documentos')
export class DialogoDocumento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Index()
  @Column({ type: 'uuid' })
  participante_id: string;

  @Column({ type: 'uuid', nullable: true })
  reuniao_id: string | null;

  @Column({ type: 'varchar', length: 200 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  arquivo: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  arquivo_nome: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  arquivo_sha256: string | null;

  /** §1º IV — consentimento do licitante para revelar a solução aos demais. */
  @Column({ type: 'boolean', default: false })
  consentimento_divulgacao: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
