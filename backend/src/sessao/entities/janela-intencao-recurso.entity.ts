import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * JANELA DE INTENÇÃO DE RECURSO (Lei 14.133/2021 art. 165 §1º I; IN SEGES
 * 73/2022 art. 40) — plano E5.
 *
 * Aberta pelo agente de contratação depois do resultado da habilitação (no
 * pregão/concorrência há uma só fase recursal, após a habilitação — art. 165
 * §1º II). Dura no mínimo 10 minutos (parâmetro `prazo_intencao_recurso_minutos`
 * do órgão, nunca menos que 10). Durante ela, cada licitante manifesta a
 * intenção de recorrer pela sala, com o próprio token; encerrada, ocorre a
 * PRECLUSÃO (intenção fora da janela → 409). Não se encerra antes do prazo.
 *
 * `superada_em`: quando o provimento de um recurso devolve a licitação ao
 * julgamento, o resultado muda e a janela anterior deixa de valer — a
 * adjudicação passa a exigir uma nova janela, sobre o novo resultado.
 */
@Entity('janelas_intencao_recurso')
@Index('IDX_janelas_intencao_sessao', ['sessao_id'])
@Index('IDX_janelas_intencao_licitacao', ['licitacao_id'])
export class JanelaIntencaoRecurso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessao_id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'timestamp' })
  aberta_em: Date;

  @Column({ type: 'timestamp' })
  fecha_em: Date;

  @Column({ type: 'int' })
  minutos: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  aberta_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  aberta_por_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  aberta_por_nome: string | null;

  @Column({ type: 'timestamp', nullable: true })
  superada_em: Date | null;

  @Column({ type: 'text', nullable: true })
  superada_motivo: string | null;

  /** SALA | MIGRACAO_E5 */
  @Column({ type: 'varchar', length: 20, default: 'SALA' })
  origem: string;

  @CreateDateColumn()
  created_at: Date;
}
