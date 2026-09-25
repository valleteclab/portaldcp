import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ============================================================================
 * ARP — tabelas do saldo, da adesão e do cadastro de reserva (plano E6)
 * Lei 14.133/2021 arts. 82–86; Decreto 11.462/2023 (referência — o município
 * pode adotar o regulamento federal).
 * ============================================================================
 * Situações/origens em varchar (sem enum no banco: novos valores não exigem
 * ALTER TYPE — mesmo padrão de `licitantes_unidade`).
 */

/** Origem do consumo do saldo da ata. */
export enum OrigemConsumoAta {
  /** Contrato criado a partir da ata ("contratar a partir da ata"). */
  CONTRATO = 'CONTRATO',
  /** Ordem de fornecimento/serviço criada a partir da ata. */
  ORDEM = 'ORDEM',
  /** Utilização registrada pela rota antiga (`itens/:id/utilizar`), sem instrumento. */
  MANUAL = 'MANUAL',
  /** Retrato do `quantidade_utilizada` anterior (migração E6 — idempotente). */
  MIGRACAO = 'MIGRACAO',
}

/**
 * CONSUMO DO SALDO — fonte da verdade do saldo por item. `adesao_id` nulo =
 * consumo do gerenciador/participantes (reduz `quantidade_saldo`); preenchido
 * = consumo do órgão não participante (reduz o autorizado na adesão e conta em
 * `quantidade_adesao_utilizada`, nunca no saldo do gerenciador).
 */
@Entity('ata_consumos')
@Index('IDX_ata_consumos_ata', ['ata_id'])
@Index('IDX_ata_consumos_item', ['item_ata_id'])
export class AtaConsumo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ata_id: string;

  @Column({ type: 'uuid' })
  item_ata_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  /** OrigemConsumoAta */
  @Column({ type: 'varchar', length: 20 })
  origem: string;

  @Column({ type: 'uuid', nullable: true })
  adesao_id: string | null;

  /** Órgão que consumiu (gerenciador ou aderente). */
  @Column({ type: 'varchar' })
  orgao_consumidor_id: string;

  /** Contrato/ordem gerado (contratos.id) — nulo em MANUAL/MIGRACAO. */
  @Column({ type: 'uuid', nullable: true })
  contrato_id: string | null;

  @Column({ type: 'date' })
  data: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ator_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  ator_id: string | null;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @CreateDateColumn()
  created_at: Date;
}

/** Situação da adesão (carona — art. 86 §2º). */
export enum StatusAdesao {
  /** Pedido do órgão não participante — aguarda a anuência do gerenciador. */
  SOLICITADA = 'SOLICITADA',
  /** Gerenciador anuiu — aguarda o aceite do fornecedor. */
  ANUENCIA_GERENCIADOR = 'ANUENCIA_GERENCIADOR',
  /** Fornecedor aceitou — aguarda a autorização final do gerenciador. */
  ACEITE_FORNECEDOR = 'ACEITE_FORNECEDOR',
  /** Autorizada: o aderente contrata até as quantidades autorizadas. */
  AUTORIZADA = 'AUTORIZADA',
  RECUSADA = 'RECUSADA',
  /** Desistência do próprio aderente antes da autorização. */
  CANCELADA = 'CANCELADA',
}

@Entity('adesoes_ata')
@Index('IDX_adesoes_ata_ata', ['ata_id'])
@Index('IDX_adesoes_ata_aderente', ['orgao_aderente_id'])
export class AdesaoAta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ata_id: string;

  @Column({ type: 'varchar' })
  orgao_gerenciador_id: string;

  @Column({ type: 'varchar' })
  orgao_aderente_id: string;

  /** Justificativa + demonstração de vantagem (art. 86 §2º I e II). */
  @Column({ type: 'text' })
  justificativa_vantagem: string;

  /** StatusAdesao */
  @Column({ type: 'varchar', length: 30, default: StatusAdesao.SOLICITADA })
  status: string;

  @Column({ type: 'text', nullable: true })
  motivo_recusa: string | null;

  /** GERENCIADOR | FORNECEDOR | ADERENTE */
  @Column({ type: 'varchar', length: 20, nullable: true })
  recusada_por: string | null;

  @Column({ type: 'timestamp', nullable: true })
  anuencia_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  aceite_fornecedor_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  autorizada_em: Date | null;

  /** Autorizada + 90 dias, limitado ao fim da vigência da ata (Dec. 11.462). */
  @Column({ type: 'date', nullable: true })
  prazo_contratacao: string | null;

  @Column({ type: 'timestamp', nullable: true })
  recusada_em: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ator_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  ator_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('adesoes_ata_itens')
@Index('UQ_adesoes_ata_itens', ['adesao_id', 'item_ata_id'], { unique: true })
export class AdesaoAtaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  adesao_id: string;

  @Column({ type: 'uuid' })
  item_ata_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_utilizada: number;

  @CreateDateColumn()
  created_at: Date;
}

/** Situação do licitante no cadastro de reserva do item da ata. */
export enum StatusReserva {
  /** Convocado a manifestar se cota ao preço do vencedor (prazo em curso). */
  PENDENTE = 'PENDENTE',
  /** Aceitou cotar ao preço do vencedor — integra o cadastro de reserva. */
  ADERIU = 'ADERIU',
  RECUSOU = 'RECUSOU',
  /** Não respondeu no prazo. */
  EXPIRADO = 'EXPIRADO',
  /** Convocado para assumir o saldo (registro do titular cancelado). */
  CONVOCADO = 'CONVOCADO',
}

/**
 * CADASTRO DE RESERVA (art. 82 VII; Dec. 11.462 art. 18): por item da ata,
 * os demais licitantes não excluídos, na ordem do ranking, convocados a
 * cotar ao preço do vencedor. Quem ADERIU forma o cadastro; cancelado o
 * registro do titular, o primeiro da ordem é convocado (nova ata).
 */
@Entity('ata_cadastro_reserva')
@Index('UQ_ata_cadastro_reserva', ['item_ata_id', 'fornecedor_id'], { unique: true })
@Index('IDX_ata_cadastro_reserva_ata', ['ata_id'])
export class AtaCadastroReserva {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ata_id: string;

  @Column({ type: 'uuid' })
  item_ata_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** Posição no ranking da unidade (2 = primeiro depois do vencedor). */
  @Column({ type: 'int' })
  posicao: number;

  /** Oferta original do licitante (retrato do ranking). */
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_ofertado: number | null;

  /** StatusReserva */
  @Column({ type: 'varchar', length: 20, default: StatusReserva.PENDENTE })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  prazo_resposta: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  respondido_em: Date | null;

  /** Ata gerada na convocação (quando assumiu o saldo). */
  @Column({ type: 'uuid', nullable: true })
  ata_convocada_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
