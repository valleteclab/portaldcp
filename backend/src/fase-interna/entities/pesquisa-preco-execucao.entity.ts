import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DocumentoFaseInterna } from './documento-fase-interna.entity';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { PesquisaPrecoCandidato } from './pesquisa-preco-candidato.entity';

export enum StatusExecucaoPesquisaPreco {
  PENDENTE = 'PENDENTE',
  RODANDO = 'RODANDO',
  CONCLUIDA = 'CONCLUIDA',
  FALHOU = 'FALHOU',
  CANCELADA = 'CANCELADA',
}

@Entity('pesquisa_preco_execucoes')
export class PesquisaPrecoExecucao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => DocumentoFaseInterna)
  @JoinColumn({ name: 'documento_id' })
  documento: DocumentoFaseInterna;

  @Column()
  documento_id: string;

  @Column({ type: 'enum', enum: StatusExecucaoPesquisaPreco, default: StatusExecucaoPesquisaPreco.PENDENTE })
  status: StatusExecucaoPesquisaPreco;

  @Column({ type: 'jsonb', nullable: true })
  escopo: {
    itemNumeros?: number[];
    fontes?: string[];
    maxPorFonte?: number;
    usarBrowserFallback?: boolean;
  };

  @Column({ nullable: true })
  iniciado_por_id: string;

  @Column({ nullable: true })
  iniciado_por_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  iniciado_em: Date;

  @Column({ type: 'timestamp', nullable: true })
  finalizado_em: Date;

  @Column({ type: 'jsonb', nullable: true })
  resumo: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  erro: string;

  @OneToMany(() => PesquisaPrecoCandidato, (candidato) => candidato.execucao)
  candidatos: PesquisaPrecoCandidato[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
