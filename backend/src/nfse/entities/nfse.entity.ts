import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StatusNfse {
  PENDENTE = 'PENDENTE',       // Aguardando processamento pela Spedy/prefeitura
  PROCESSANDO = 'PROCESSANDO', // Em processamento assíncrono
  AUTORIZADA = 'AUTORIZADA',   // Emitida com sucesso pela prefeitura
  CANCELADA = 'CANCELADA',     // Cancelada após emissão
  ERRO = 'ERRO',               // Falha na emissão
}

/**
 * Registro de cada NFS-e emitida pelo portal.
 * Vinculada ao fornecedor e, opcionalmente, a uma medição aprovada.
 */
@Entity('nfse')
export class Nfse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Fornecedor ────────────────────────────────────────────────────────────

  @Column()
  fornecedor_id: string;

  @Column({ nullable: true })
  fornecedor_cnpj: string | null;

  @Column({ nullable: true })
  fornecedor_razao_social: string | null;

  // ─── Vínculo com medição/contrato ─────────────────────────────────────────

  /** Medição que originou esta NFS-e (opcional) */
  @Column({ nullable: true })
  medicao_id: string | null;

  /** Contrato vinculado (opcional) */
  @Column({ nullable: true })
  contrato_id: string | null;

  /** Número do contrato (para exibição) */
  @Column({ nullable: true })
  numero_contrato: string | null;

  // ─── RPS (Recibo Provisório de Serviços) ───────────────────────────────────

  @Column({ nullable: true })
  numero_rps: string | null;

  @Column({ nullable: true })
  serie_rps: string | null;

  // ─── NFS-e emitida pela prefeitura ─────────────────────────────────────────

  /** Número da NFS-e atribuído pela prefeitura */
  @Column({ nullable: true })
  numero_nfse: string | null;

  /** Chave de acesso da NFS-e */
  @Column({ nullable: true })
  chave_acesso: string | null;

  /** ID interno da Spedy para consulta/cancelamento */
  @Column({ nullable: true })
  spedy_id: string | null;

  // ─── Dados do serviço ─────────────────────────────────────────────────────

  @Column({ type: 'date', nullable: true })
  data_emissao: string | null;

  @Column({ nullable: true })
  competencia: string | null; // ex: "MARÇO/2026"

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_servico: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_deducoes: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  base_calculo: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  aliquota_iss: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_iss: number | null;

  @Column({ default: false })
  iss_retido: boolean;

  @Column({ type: 'text', nullable: true })
  discriminacao: string | null; // Descrição do serviço

  @Column({ nullable: true })
  item_lista_servico: string | null;

  // ─── Tomador (quem recebe o serviço / órgão público) ─────────────────────

  @Column({ nullable: true })
  tomador_cnpj: string | null;

  @Column({ nullable: true })
  tomador_razao_social: string | null;

  @Column({ nullable: true })
  tomador_email: string | null;

  @Column({ nullable: true })
  tomador_municipio: string | null;

  @Column({ nullable: true })
  tomador_uf: string | null;

  // ─── Status e controle ────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: StatusNfse, default: StatusNfse.PENDENTE })
  status: StatusNfse;

  @Column({ type: 'text', nullable: true })
  motivo_erro: string | null;

  /** Resposta completa da Spedy (JSON bruto para debug) */
  @Column({ type: 'text', nullable: true })
  resposta_spedy: string | null;

  // ─── Documentos gerados ───────────────────────────────────────────────────

  @Column({ nullable: true })
  pdf_url: string | null;

  @Column({ nullable: true })
  xml_url: string | null;

  // ─── Cancelamento ─────────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  motivo_cancelamento: string | null;

  @Column({ type: 'timestamp', nullable: true })
  data_cancelamento: Date | null;

  // ─── Auditoria ────────────────────────────────────────────────────────────

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
