import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { FontePesquisaTipo } from '../types/pesquisa-precos.type';
import { PesquisaPrecoExecucao } from './pesquisa-preco-execucao.entity';

export enum StatusCandidatoPesquisaPreco {
  CANDIDATO = 'CANDIDATO',
  APROVADO = 'APROVADO',
  REJEITADO = 'REJEITADO',
}

@Entity('pesquisa_preco_candidatos')
export class PesquisaPrecoCandidato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PesquisaPrecoExecucao, (execucao) => execucao.candidatos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'execucao_id' })
  execucao: PesquisaPrecoExecucao;

  @Column()
  execucao_id: string;

  @Column({ type: 'int' })
  item_numero: number;

  @Column({ type: 'varchar', length: 40 })
  fonte_tipo: FontePesquisaTipo;

  @Column({ type: 'text' })
  descricao_fonte: string;

  @Column({ type: 'text', nullable: true })
  url_referencia: string;

  @Column({ type: 'date' })
  data_pesquisa: string;

  @Column({ nullable: true })
  fornecedor_cnpj: string;

  @Column({ nullable: true })
  fornecedor_razao_social: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantidade_base: number;

  @Column({ nullable: true })
  unidade: string;

  @Column({ type: 'jsonb', nullable: true })
  evidencia: {
    tipo?: 'api' | 'html' | 'screenshot' | 'arquivo' | 'manual';
    path?: string;
    hash?: string;
    titulo?: string;
    coletado_em?: string;
    origem?: string;
  };

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  score: number;

  @Column({ type: 'jsonb', nullable: true })
  flags: string[];

  @Column({ type: 'enum', enum: StatusCandidatoPesquisaPreco, default: StatusCandidatoPesquisaPreco.CANDIDATO })
  status: StatusCandidatoPesquisaPreco;

  @Column({ type: 'text', nullable: true })
  motivo_rejeicao: string;

  @Column({ type: 'timestamp', nullable: true })
  decidido_em: Date;

  @Column({ nullable: true })
  decidido_por_id: string;

  @Column({ nullable: true })
  decidido_por_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
