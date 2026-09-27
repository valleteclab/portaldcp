import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

/**
 * DESPACHO DE ETAPA NOS AUTOS (F3): o despacho das etapas que concluem por
 * REGISTRO no modelo de fluxo ("autorização de início", "indicação da
 * modalidade" …) vira FOLHA dos autos, como o despacho de tramitação (F2):
 * PDF próprio, mesma sequência de folhas das peças e dos despachos de
 * tramitação (`folhas-autos.ts`) e intercalado em ordem cronológica na
 * montagem dos autos. Não é peça (`documentos_fase_interna`): não entra na
 * conformidade, nas tarefas nem na substituição de versões.
 */
@Entity('despachos_fase_interna')
@Index(['licitacao_id', 'registrado_em'])
export class DespachoFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Órgão dono (isolamento — é o da licitação). */
  @Column({ type: 'uuid' })
  orgao_id: string;

  /** REGISTRO_ETAPA (hoje o único). */
  @Column({ type: 'varchar', length: 30, default: 'REGISTRO_ETAPA' })
  tipo: string;

  /** Código da etapa no modelo de fluxo (AUTORIZACAO_INICIO, INDICACAO_MODALIDADE…). */
  @Column({ type: 'varchar', length: 40 })
  etapa: string;

  @Column({ type: 'varchar', length: 250 })
  titulo: string;

  @Column({ type: 'text' })
  texto: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  autor_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  autor_nome: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  autor_cargo: string | null;

  /** Quando o despacho foi registrado (vale para a ordem cronológica nos autos). */
  @Column({ type: 'timestamptz' })
  registrado_em: Date;

  /** PDF do despacho (referência lógica `licitacoes/<id>/despacho-etapa-….pdf`). */
  @Column({ type: 'varchar', nullable: true })
  arquivo: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  hash: string | null;

  @Column({ type: 'int', nullable: true })
  paginas: number | null;

  @Column({ type: 'int', nullable: true })
  folha_inicial: number | null;

  @Column({ type: 'int', nullable: true })
  folha_final: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
