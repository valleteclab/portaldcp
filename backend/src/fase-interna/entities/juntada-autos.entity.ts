import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import type { NaturezaJuntada, OrigemJuntada } from '../../licitacoes/autos/juntadas-regras';

/**
 * LIVRO DE JUNTADAS DOS AUTOS (decisão do dono de 27/09/2026 — autos em ordem
 * cronológica de juntada, como no papel; Lei nº 9.784/1999, art. 22, §4º).
 *
 * Uma linha por juntada: a faixa de folhas atribuída NA JUNTADA (definitiva —
 * a tela e o PDF dos autos mostram a mesma), o arquivo tal como juntado e a
 * data. As folhas de `documentos_fase_interna`, `tramitacoes_processo` e
 * `despachos_fase_interna` continuam gravadas nessas tabelas (a tela lê de
 * lá) e são sempre as da juntada mais recente do registro.
 *
 * Nada sai do livro: a versão substituída fica com `substituida_por_id`
 * (anotada nos autos); a juntada cancelada fica com `cancelada_em` e a folha
 * sai como "folha sem documento" (sem renumerar as seguintes).
 *
 * Só processos no regime CRONOLÓGICO (ver `autos_processo`) escrevem aqui.
 */
@Entity('juntadas_autos')
@Index(['licitacao_id', 'folha_inicial'], { unique: true })
@Index(['licitacao_id', 'vaga'])
@Index(['documento_id'])
export class JuntadaAutos {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'int' })
  folha_inicial: number;

  @Column({ type: 'int' })
  folha_final: number;

  @Column({ type: 'int' })
  paginas: number;

  /** PECA, DESPACHO_TRAMITACAO, DESPACHO_ETAPA, DOCUMENTO (fase externa) ou TERMO. */
  @Column({ type: 'varchar', length: 30 })
  natureza: NaturezaJuntada;

  /** Vaga nos autos (`peca:TR`, `tramitacao:<id>`, `aviso`…): juntada nova na mesma vaga substitui a anterior. */
  @Column({ type: 'varchar', length: 200 })
  vaga: string;

  /** Tipo da peça/documento (DFD, TR, ATA_SESSAO, TERMO_JUSTIFICATIVAS…). */
  @Column({ type: 'varchar', length: 60 })
  chave: string;

  @Column({ type: 'varchar', length: 300 })
  titulo: string;

  @Column({ type: 'varchar', length: 20 })
  origem: OrigemJuntada;

  @Column({ type: 'int', nullable: true })
  versao: number | null;

  @Column({ type: 'uuid', nullable: true })
  documento_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  tramitacao_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  despacho_etapa_id: string | null;

  /** Conteúdo tal como juntado (hash do arquivo ou impressão do texto emitido) — não junta duas vezes o mesmo. */
  @Column({ type: 'varchar', length: 300 })
  conteudo: string;

  /** Arquivo juntado (referência lógica): o original imutável ou a cópia feita na juntada. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  arquivo: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  hash_arquivo: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  data_documento: Date | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  signatarios: string[];

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  /** Quando a juntada foi registrada (data do índice dos autos). */
  @Column({ type: 'timestamptz' })
  juntado_em: Date;

  @Column({ type: 'varchar', length: 200, nullable: true })
  juntado_por_nome: string | null;

  @Column({ type: 'uuid', nullable: true })
  substituida_por_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  substituida_em: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelada_em: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo_cancelamento: string | null;

  /** Folhas recalculadas pela migração de 27/09/2026 (processo ainda na fase interna). */
  @Column({ type: 'boolean', default: false })
  renumerada: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
