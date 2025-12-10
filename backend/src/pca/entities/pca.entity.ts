import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum StatusPCA {
  RASCUNHO = 'RASCUNHO',
  EM_ELABORACAO = 'EM_ELABORACAO',
  APROVADO = 'APROVADO',
  PUBLICADO = 'PUBLICADO',
  ENVIADO_PNCP = 'ENVIADO_PNCP',
  CANCELADO = 'CANCELADO'
}

export enum CategoriaItemPCA {
  MATERIAL = 'MATERIAL',
  SERVICO = 'SERVICO',
  OBRA = 'OBRA',
  SERVICO_ENGENHARIA = 'SERVICO_ENGENHARIA',
  SOLUCAO_TIC = 'SOLUCAO_TIC',
  LOCACAO_IMOVEL = 'LOCACAO_IMOVEL',
  ALIENACAO = 'ALIENACAO'
}

export enum StatusItemPCA {
  PLANEJADO = 'PLANEJADO',
  EM_PREPARACAO = 'EM_PREPARACAO',
  LICITACAO_INICIADA = 'LICITACAO_INICIADA',
  CONTRATADO = 'CONTRATADO',
  CANCELADO = 'CANCELADO',
  ADIADO = 'ADIADO'
}

@Entity('planos_contratacao_anual')
export class PlanoContratacaoAnual {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Órgão
  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  // Unidade do órgão (para órgãos com múltiplas unidades)
  @Column({ nullable: true })
  unidade_id: string;

  @Column({ nullable: true })
  codigo_unidade: string; // Código da unidade no PNCP (ex: "1", "2")

  @Column({ nullable: true })
  nome_unidade: string; // Nome da unidade para referência

  // Identificação
  @Column({ type: 'int' })
  ano_exercicio: number;

  @Column({ nullable: true })
  numero_pca: string; // Ex: "PCA 2024"

  @Column({
    type: 'enum',
    enum: StatusPCA,
    default: StatusPCA.RASCUNHO
  })
  status: StatusPCA;

  // Datas
  @Column({ type: 'date', nullable: true })
  data_aprovacao: Date;

  @Column({ type: 'date', nullable: true })
  data_publicacao: Date;

  // Responsável
  @Column({ nullable: true })
  responsavel_id: string;

  @Column({ nullable: true })
  responsavel_nome: string;

  @Column({ nullable: true })
  responsavel_cargo: string;

  // Valores Totais (calculados)
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total_estimado: number;

  @Column({ type: 'int', default: 0 })
  quantidade_itens: number;

  // Integração PNCP
  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ type: 'int', nullable: true })
  sequencial_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Itens do PCA
  @OneToMany(() => ItemPCA, item => item.pca)
  itens: ItemPCA[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('itens_pca')
export class ItemPCA {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com PCA
  @ManyToOne(() => PlanoContratacaoAnual, pca => pca.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pca_id' })
  pca: PlanoContratacaoAnual;

  @Column()
  pca_id: string;

  // Identificação
  @Column({ type: 'int' })
  numero_item: number;

  @Column({
    type: 'enum',
    enum: CategoriaItemPCA
  })
  categoria: CategoriaItemPCA;

  @Column({
    type: 'enum',
    enum: StatusItemPCA,
    default: StatusItemPCA.PLANEJADO
  })
  status: StatusItemPCA;

  // Descrição do Objeto
  @Column({ type: 'text' })
  descricao_objeto: string;

  @Column({ type: 'text', nullable: true })
  justificativa: string;

  // === CATÁLOGO COMPRAS.GOV.BR ===
  
  // Catálogo utilizado
  @Column({ default: 'COMPRASGOV' })
  catalogo_utilizado: 'COMPRASGOV' | 'OUTROS';

  // Classificação do catálogo (Material/Serviço)
  @Column({ nullable: true })
  classificacao_catalogo: 'MATERIAL' | 'SERVICO';

  // Código da classe/grupo (ex: "859", "800")
  @Column({ nullable: true })
  codigo_classe: string;

  // Nome da classe/grupo (ex: "OUTROS SERVIÇOS DE SUPORTE")
  @Column({ nullable: true })
  nome_classe: string;

  // Código PDM (Padrão Descritivo de Materiais)
  @Column({ nullable: true })
  codigo_pdm: string;

  // Nome PDM
  @Column({ nullable: true })
  nome_pdm: string;

  // Código do item CATMAT/CATSER (ex: "100844")
  @Column({ nullable: true })
  codigo_item_catalogo: string;

  // Descrição do item do catálogo
  @Column({ nullable: true })
  descricao_item_catalogo: string;

  // Identificador da futura contratação (ex: "931500-21/2026")
  @Column({ nullable: true })
  identificador_contratacao: string;

  // Nome da futura contratação
  @Column({ nullable: true })
  nome_contratacao: string;

  // Valor unitário estimado
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_unitario_estimado: number;

  // Valor orçamentário para o exercício
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_orcamentario_exercicio: number;

  // Unidade Requisitante
  @Column({ nullable: true })
  unidade_requisitante: string;

  @Column({ nullable: true })
  responsavel_demanda: string;

  @Column({ nullable: true })
  email_responsavel: string;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantidade_estimada: number;

  @Column({ nullable: true })
  unidade_medida: string;

  // Datas Previstas
  @Column({ type: 'int', nullable: true })
  mes_previsto_contratacao: number; // 1-12

  @Column({ type: 'int', nullable: true })
  trimestre_previsto: number; // 1-4

  @Column({ type: 'date', nullable: true })
  data_prevista_inicio: Date;

  @Column({ type: 'date', nullable: true })
  data_prevista_conclusao: Date;

  // Modalidade Prevista
  @Column({ nullable: true })
  modalidade_prevista: string;

  @Column({ default: false })
  srp: boolean; // Sistema de Registro de Preços

  @Column({ default: false })
  exclusivo_mpe: boolean;

  // Vinculação com Licitação (quando iniciada)
  @Column({ nullable: true })
  licitacao_id: string;

  @Column({ nullable: true })
  numero_processo: string;

  // Controle de utilização do valor
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_utilizado: number; // Soma dos valores das licitações vinculadas

  @Column({ default: false })
  esgotado: boolean; // true quando valor_utilizado >= valor_estimado

  // Prioridade
  @Column({ type: 'int', default: 3 })
  prioridade: number; // 1=Muito Alta, 2=Alta, 3=Média, 4=Baixa, 5=Muito Baixa

  // Código e Nome do Grupo (classificação superior)
  @Column({ nullable: true })
  codigo_grupo: string;

  @Column({ nullable: true })
  nome_grupo: string;

  // Serviços Continuados
  @Column({ type: 'int', nullable: true })
  duracao_meses: number; // Duração do contrato em meses

  @Column({ nullable: true })
  renovacao_contrato: string; // 'SIM' ou 'NAO'

  @Column({ type: 'date', nullable: true })
  data_desejada_contratacao: Date;

  @Column({ nullable: true })
  contrato_anterior_id: string;

  // Grau de Complexidade
  @Column({ nullable: true })
  complexidade: 'BAIXA' | 'MEDIA' | 'ALTA';

  // Alinhamento Estratégico
  @Column({ type: 'text', nullable: true })
  objetivo_estrategico: string;

  @Column({ type: 'text', nullable: true })
  meta_ppa: string; // Plano Plurianual

  // Integração PNCP
  @Column({ type: 'int', nullable: true })
  sequencial_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
