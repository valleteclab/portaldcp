import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * NEGOCIAÇÃO (Lei 14.133/2021 art. 61; IN SEGES 73/2022 art. 30) — uma linha
 * por negociação do agente de contratação com o licitante NA VEZ de uma
 * unidade (item, ou lote na disputa por lote):
 *
 *   EM_ANDAMENTO ──(contraproposta do agente)──► contraproposta PENDENTE
 *      PENDENTE ──(licitante aceita)──► lance NEGOCIACAO no motor → CONCLUIDA (REDUZIDO)
 *      PENDENTE ──(licitante recusa)──► RECUSADA (nova contraproposta, encerrar ou desclassificar)
 *   EM_ANDAMENTO ──(encerrar)──► CONCLUIDA (MANTIDO)
 *   EM_ANDAMENTO ──(desclassificar: acima do preço máximo)──► CONCLUIDA (DESCLASSIFICADO) → próximo
 *   EM_ANDAMENTO ──(licitante saiu do ranking por outro ato)──► CANCELADA
 *
 * Valores na BASE do lance da licitação (unitário, total do item ou global do
 * lote) + o total correspondente. Mensagens e contrapropostas são eventos
 * PRIVADOS da sessão (`dados_adicionais.visibilidade = 'PRIVADA'`).
 */
@Entity('negociacoes_unidade')
@Index('IDX_negociacoes_unidade', ['unidade_id', 'status'])
@Index('IDX_negociacoes_licitacao', ['licitacao_id'])
export class NegociacaoUnidade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  sessao_id: string;

  /** ITEM | LOTE */
  @Column({ type: 'varchar', length: 10 })
  tipo_unidade: string;

  @Column({ type: 'uuid' })
  unidade_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** Posição no ranking único quando a negociação foi aberta. */
  @Column({ type: 'int', nullable: true })
  posicao: number | null;

  /** StatusNegociacao (regras-negociacao.ts). */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  /** ResultadoNegociacao (quando CONCLUIDA). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  resultado: string | null;

  @Column({ type: 'varchar', length: 12 })
  base_lance: string;

  /** Quantidade usada para converter a base UNITARIO em total (item). */
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 1 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_inicial: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_inicial_total: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_final: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_final_total: number | null;

  /** Preço máximo (estimado) da unidade no momento da abertura — nunca vai ao licitante. */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  preco_maximo_total: number | null;

  /** Aberta com o valor acima do preço máximo (negociação obrigatória antes do aceite). */
  @Column({ type: 'boolean', default: false })
  obrigatoria: boolean;

  // --- contraproposta corrente ---
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  contraproposta_valor: number | null;

  @Column({ type: 'timestamp', nullable: true })
  contraproposta_em: Date | null;

  /** StatusContraproposta (regras-negociacao.ts). */
  @Column({ type: 'varchar', length: 12, nullable: true })
  contraproposta_status: string | null;

  /** Histórico das contrapropostas (valor, datas, resposta, motivo, lance). */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  rodadas: Array<{
    valor: number;
    valorTotal: number;
    enviadaEm: string;
    status: string;
    respondidaEm?: string | null;
    motivo?: string | null;
    lanceId?: string | null;
  }>;

  @Column({ type: 'varchar', nullable: true })
  lance_id: string | null;

  // --- abertura / encerramento ---
  @Column({ type: 'timestamp' })
  aberta_em: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  aberta_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  aberta_por_id: string | null;

  /** MANUAL | AUTOMATICA (convocação do próximo após desclassificação). */
  @Column({ type: 'varchar', length: 12, default: 'MANUAL' })
  origem: string;

  @Column({ type: 'timestamp', nullable: true })
  encerrada_em: Date | null;

  @Column({ type: 'text', nullable: true })
  encerrada_motivo: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
