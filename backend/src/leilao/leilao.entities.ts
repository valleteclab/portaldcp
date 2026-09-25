import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ============================================================================
 * LEILÃO (Lei 14.133/2021 arts. 6º XL, 31 e 76; plano E7c) — dados próprios
 * ============================================================================
 * Produção: synchronize cria as tabelas (nada a migrar — leilão nunca rodou).
 */

export type TipoLeiloeiro = 'SERVIDOR' | 'OFICIAL';
export type FormaPagamentoLeilao = 'A_VISTA' | 'PARCELADO';
export type TipoBemLeilao = 'MOVEL' | 'VEICULO' | 'SEMOVENTE' | 'IMOVEL';

/** Configuração do leilão: condução (art. 31 caput e §1º) e condições do edital (art. 31 §2º II a IV). */
@Entity('leilao_configuracoes')
export class LeilaoConfiguracao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** SERVIDOR designado pela autoridade competente ou LEILOEIRO OFICIAL (art. 31 caput). */
  @Column({ type: 'varchar', length: 10, default: 'SERVIDOR' })
  tipo_leiloeiro: TipoLeiloeiro;

  // --- Servidor designado ---
  @Column({ type: 'uuid', nullable: true })
  servidor_usuario_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  servidor_nome: string | null;

  /** Ato de designação (portaria nº/data). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  ato_designacao: string | null;

  // --- Leiloeiro oficial (art. 31 §1º: selecionado por credenciamento ou pregão, maior desconto na comissão) ---
  @Column({ type: 'varchar', length: 200, nullable: true })
  leiloeiro_nome: string | null;

  @Column({ type: 'varchar', length: 14, nullable: true })
  leiloeiro_cpf: string | null;

  /** Matrícula na Junta Comercial (Decreto 21.981/1932). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  leiloeiro_matricula: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  leiloeiro_uf: string | null;

  /** Comissão (%) sobre o valor arrematado — paga pelo arrematante (art. 31 §2º II). */
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  comissao_percentual: number | null;

  /** CREDENCIAMENTO ou PREGAO (art. 31 §1º) e nº do processo de seleção. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  leiloeiro_forma_selecao: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  leiloeiro_processo_selecao: string | null;

  // --- Pagamento (art. 31 §2º II; art. 31 §4º) ---
  @Column({ type: 'varchar', length: 10, default: 'A_VISTA' })
  forma_pagamento: FormaPagamentoLeilao;

  /** Prazo para o pagamento, em dias úteis contados da convocação (calendário do órgão). */
  @Column({ type: 'int', default: 1 })
  prazo_pagamento_dias_uteis: number;

  @Column({ type: 'int', nullable: true })
  parcelas: number | null;

  @Column({ type: 'text', nullable: true })
  condicoes_pagamento: string | null;

  // --- Visitação (art. 31 §2º III) ---
  @Column({ type: 'text', nullable: true })
  local_visitacao: string | null;

  @Column({ type: 'text', nullable: true })
  periodo_visitacao: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/** Bem leiloado — um por item da licitação (art. 31 §2º I, II, III e V). */
@Entity('leilao_bens')
export class LeilaoBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  item_licitacao_id: string;

  @Column({ type: 'varchar', length: 12, default: 'MOVEL' })
  tipo_bem: TipoBemLeilao;

  /** Descrição com as características (art. 31 §2º I). */
  @Column({ type: 'text' })
  descricao: string;

  /** Valor da avaliação (art. 31 §2º II; art. 76 — avaliação prévia). */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_avaliacao: number;

  @Column({ type: 'date', nullable: true })
  data_avaliacao: string | null;

  /** Responsável/laudo da avaliação. */
  @Column({ type: 'text', nullable: true })
  avaliacao_responsavel: string | null;

  /** Preço mínimo de arrematação (art. 31 §2º II) — total do item. */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_minimo: number;

  /** Onde está o bem (art. 31 §2º III — móveis, veículos, semoventes). */
  @Column({ type: 'text', nullable: true })
  localizacao: string | null;

  @Column({ type: 'text', nullable: true })
  visitacao: string | null;

  /** Ônus, gravames ou pendências (art. 31 §2º V). */
  @Column({ type: 'text', nullable: true })
  onus_gravames: string | null;

  // --- Imóvel (art. 31 §2º I: situação, divisas, matrícula e registros; art. 76 I: autorização legislativa) ---
  @Column({ type: 'varchar', length: 120, nullable: true })
  matricula_imovel: string | null;

  @Column({ type: 'text', nullable: true })
  situacao_divisas: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  autorizacao_legislativa: string | null;

  /** Fotos (pasta PÚBLICA `leilao-bens/` — públicas por natureza): [{ url, nome, enviadoEm }]. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  fotos: Array<{ url: string; nome: string; enviadoEm: string }>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

export type StatusArrematacao =
  | 'DECLARADA' // arrematante declarado no julgamento (maior lance ≥ preço mínimo)
  | 'AGUARDANDO_PAGAMENTO' // fase recursal superada: convocado a pagar no prazo do edital
  | 'PAGAMENTO_INFORMADO' // arrematante enviou o comprovante
  | 'PAGA' // pagamento confirmado pelo órgão (art. 31 §4º)
  | 'INADIMPLENTE' // não pagou: lance subsequente convocado (Decreto 11.461/2023 art. 26 §3º)
  | 'CANCELADA'; // resultado refeito (recurso provido etc.)

/** Arrematação de uma unidade (item/bem ou lote) — trilha do julgamento ao termo. */
@Entity('leilao_arrematacoes')
@Index(['licitacao_id', 'unidade_id'])
export class Arrematacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  unidade_id: string;

  @Column({ type: 'varchar', length: 5 })
  tipo_unidade: 'ITEM' | 'LOTE';

  @Column({ type: 'int' })
  numero_unidade: number;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  fornecedor_id: string;

  /** Valor arrematado (maior lance válido do arrematante, na base do lance). */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: number;

  /** Comissão do leiloeiro oficial (quando houver). */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_comissao: number | null;

  /** Ordem na unidade (1 = original; 2+ = lance subsequente após inadimplência). */
  @Column({ type: 'int', default: 1 })
  ordem: number;

  @Column({ type: 'varchar', length: 24, default: 'DECLARADA' })
  status: StatusArrematacao;

  @Column({ type: 'timestamptz' })
  declarada_em: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  declarada_por_tipo: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  declarada_por_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  convocado_pagamento_em: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  prazo_pagamento: Date | null;

  // Comprovante do pagamento (no banco — só órgão dono e o arrematante)
  @Column({ type: 'bytea', nullable: true, select: false })
  comprovante: Buffer | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  comprovante_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  comprovante_mime: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  comprovante_sha256: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  pagamento_informado_em: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pagamento_confirmado_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pagamento_confirmado_por: string | null;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  /** Termo de arrematação (pasta sensível `leilao/<licitação>/`). */
  @Column({ type: 'varchar', length: 400, nullable: true })
  termo_caminho: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  termo_gerado_em: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
