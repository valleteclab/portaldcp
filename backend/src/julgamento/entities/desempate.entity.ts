import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * DESEMPATE (Lei 14.133/2021 art. 60; IN SEGES 73/2022 art. 28) de um grupo de
 * licitantes empatados numa unidade (item ou lote). Guarda o rito inteiro:
 * disputa final (I) com prazo, critérios II..§1º IV (trilha com o motivo dos
 * "não aplicáveis") e o SORTEIO em ato público (instante do ato registrado
 * antes do sorteio, entrada canônica, semente e algoritmo — sorteio.ts).
 * O `RankingService` consulta `ordem_final` para ordenar o grupo; enquanto o
 * desempate não termina, o grupo fica PENDENTE (a aceitação não convoca).
 */
export enum StatusDesempate {
  EM_DISPUTA_FINAL = 'EM_DISPUTA_FINAL',
  AGUARDANDO_SORTEIO = 'AGUARDANDO_SORTEIO',
  RESOLVIDO = 'RESOLVIDO',
  /** Reinício da disputa / grupo desfeito. */
  CANCELADO = 'CANCELADO',
}

@Entity('desempates')
@Index('IDX_desempates_unidade', ['unidade_id'])
@Index('IDX_desempates_licitacao', ['licitacao_id'])
export class Desempate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid', nullable: true })
  sessao_id: string | null;

  /** ITEM | LOTE */
  @Column({ type: 'varchar', length: 10 })
  tipo_unidade: string;

  @Column({ type: 'uuid' })
  unidade_id: string;

  /** StatusDesempate */
  @Column({ type: 'varchar', length: 30 })
  status: string;

  /** Licitantes empatados (ids, ordem crescente). */
  @Column({ type: 'jsonb' })
  fornecedores: string[];

  /** Valor (ou pontuação, nos critérios pontuados) empatado. */
  @Column({ type: 'decimal', precision: 18, scale: 6 })
  valor_empatado: number;

  /** Chave do empate: VALOR (menor preço/maior desconto/maior lance) ou PONTUACAO. */
  @Column({ type: 'varchar', length: 12, default: 'VALOR' })
  chave: string;

  // --- Disputa final (art. 60, I) -----------------------------------------
  @Column({ type: 'timestamp', nullable: true })
  disputa_final_convocada_em: Date | null;

  @Column({ type: 'int', nullable: true })
  disputa_final_prazo_minutos: number | null;

  @Column({ type: 'timestamp', nullable: true })
  disputa_final_prazo_ate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  disputa_final_encerrada_em: Date | null;

  /** Motivo quando a disputa final não se aplica (ex.: dispensa — ver julgarDispensa). */
  @Column({ type: 'text', nullable: true })
  disputa_final_nao_aplicada: string | null;

  // --- Critérios e resultado -----------------------------------------------
  /** Blocos ainda empatados depois dos critérios II..§1º IV (entrada do sorteio). */
  @Column({ type: 'jsonb', nullable: true })
  blocos: string[][] | null;

  /** Passos do art. 60 (critério, base legal, aplicável/motivo, efeito, blocos). */
  @Column({ type: 'jsonb', nullable: true })
  trilha: any[] | null;

  /** Ordem final do grupo (1º = melhor). */
  @Column({ type: 'jsonb', nullable: true })
  ordem_final: string[] | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  criterio_decisivo: string | null;

  // --- Sorteio (IN 73 art. 28 §2º) ------------------------------------------
  /** Instante do ato público, registrado ANTES de calcular o sorteio (entra na semente). */
  @Column({ type: 'timestamp', nullable: true })
  sorteio_ato_em: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  sorteio_algoritmo: string | null;

  /** Um registro por bloco sorteado: { candidatos, entrada, semente, ordem }. */
  @Column({ type: 'jsonb', nullable: true })
  sorteio: any[] | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvido_em: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ator_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  ator_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** Nova proposta SELADA de um empatado na disputa final (vira lance DISPUTA_FINAL no encerramento). */
@Entity('desempate_ofertas')
@Index('UQ_desempate_ofertas', ['desempate_id', 'fornecedor_id'], { unique: true })
export class DesempateOferta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  desempate_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: number;

  @Column({ type: 'timestamp' })
  enviada_em: Date;

  /** Lance gerado no encerramento da disputa final. */
  @Column({ type: 'uuid', nullable: true })
  lance_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
