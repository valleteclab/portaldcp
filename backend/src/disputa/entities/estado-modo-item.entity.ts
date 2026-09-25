import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Estado da ESTRATÉGIA do modo de disputa por UNIDADE — item ou lote (plano E2.4 —
 * `modos-disputa.ts`). Uma linha por item que entrou num modo com fase
 * própria (aberto-fechado, fechado-aberto, reinício para as demais colocações).
 * Item sem linha = modo aberto puro (art. 23), sem restrição de participantes.
 *
 * SIGILO: `aleatorio_sorteado_segundos` (IN 73 art. 24 §1º) fica SÓ aqui —
 * nenhuma rota serializa esta tabela; a coluna antiga
 * `itens_licitacao.tempo_aleatorio_sorteado` não é usada pelo motor de modos
 * (as rotas de item a devolveriam ao público).
 */
@Entity('disputa_estado_modo_item')
export class EstadoModoItem {
  /** Id da UNIDADE de disputa: item ou lote (ver `tipo_unidade`). Nome mantido por compatibilidade. */
  @PrimaryColumn('uuid')
  item_id: string;

  /** ITEM | LOTE (`unidade-disputa.ts`). Linhas anteriores ao lote = ITEM. */
  @Column({ type: 'varchar', length: 10, default: 'ITEM' })
  tipo_unidade: string;

  @Column({ type: 'uuid' })
  sessao_id: string;

  /** ABERTO | ABERTO_FECHADO | FECHADO_ABERTO | FECHADO (cópia do modo no início do item). */
  @Column({ type: 'varchar', length: 20 })
  modo: string;

  /** ABERTA | ALEATORIO | FECHADA | REINICIO_DEMAIS | ENCERRADA */
  @Column({ type: 'varchar', length: 20 })
  fase: string;

  /**
   * Fornecedores que podem dar lance na fase (null = todos com proposta):
   * classificados para a etapa fechada (art. 24 §§2º/4º), para a etapa aberta
   * do fechado-aberto (art. 25) ou as demais colocações no reinício (art. 56 §4º).
   */
  @Column({ type: 'jsonb', nullable: true })
  participantes: string[] | null;

  /** Percentual da faixa usada na classificação (10 ou 20). */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  faixa_percentual: number | null;

  @Column({ type: 'timestamp', nullable: true })
  fase_iniciada_em: Date | null;

  /** Fim da fase de prazo fixo (lance final fechado). */
  @Column({ type: 'timestamp', nullable: true })
  fase_termina_em: Date | null;

  /** Tempo aleatório: início (= aviso de fechamento iminente) e duração sorteada (s) — SIGILOSA. */
  @Column({ type: 'timestamp', nullable: true })
  aleatorio_iniciado_em: Date | null;

  @Column({ type: 'int', nullable: true })
  aleatorio_sorteado_segundos: number | null;

  /** Reinício (art. 56 §4º): licitante e valor da 1ª colocação, que ficam fora da nova etapa. */
  @Column({ type: 'varchar', nullable: true })
  primeiro_fornecedor_id: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 4, nullable: true })
  primeiro_valor: number | null;

  @Column({ type: 'int', default: 0 })
  reinicios: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
