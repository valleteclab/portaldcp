import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum TipoContratacaoDireta {
  DISPENSA = 'DISPENSA',
  INEXIGIBILIDADE = 'INEXIGIBILIDADE'
}

export enum StatusContratacaoDireta {
  RASCUNHO = 'RASCUNHO',
  EM_ELABORACAO = 'EM_ELABORACAO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  APROVADO = 'APROVADO',
  PUBLICADO = 'PUBLICADO',
  EM_COTACAO = 'EM_COTACAO',
  ADJUDICADO = 'ADJUDICADO',
  HOMOLOGADO = 'HOMOLOGADO',
  CONTRATADO = 'CONTRATADO',
  CANCELADO = 'CANCELADO',
  FRACASSADO = 'FRACASSADO'
}

export enum HipoteseDispensa {
  // Art. 75 da Lei 14.133/2021
  VALOR_OBRAS = 'I', // até R$ 100.000
  VALOR_OUTROS = 'II', // até R$ 50.000
  GUERRA = 'III',
  EMERGENCIA = 'IV',
  DESERTA_FRACASSADA = 'V',
  INTERVENCAO_DOMINIO = 'VI',
  SEGURANCA_NACIONAL = 'VII',
  CALAMIDADE = 'VIII',
  LICITACAO_INTERNACIONAL = 'IX',
  COMPRA_PRODUCAO = 'X',
  CONTRATACAO_REMANESCENTE = 'XI',
  COMPRA_HORTIFRUTIGRANJEIROS = 'XII',
  AQUISICAO_MATERIAIS_FFAA = 'XIII',
  BENS_SERVICOS_ESTRANGEIROS = 'XIV',
  AQUISICAO_COMPONENTES = 'XV',
  IMPRESSAO_DIARIO_OFICIAL = 'XVI',
  DISPENSA_ELETRONICA = 'DISPENSA_ELETRONICA' // Art. 75, §3º
}

export enum HipoteseInexigibilidade {
  // Art. 74 da Lei 14.133/2021
  FORNECEDOR_EXCLUSIVO = 'I',
  SERVICOS_TECNICOS = 'II',
  PROFISSIONAL_SETOR_ARTISTICO = 'III',
  OBJETOS_NATUREZA_SINGULAR = 'IV',
  CREDENCIAMENTO = 'V'
}

@Entity('contratacoes_diretas')
export class ContratacaoDireta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Órgão
  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  // Identificação
  @Column()
  numero_processo: string;

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  @Column({
    type: 'enum',
    enum: TipoContratacaoDireta
  })
  tipo: TipoContratacaoDireta;

  @Column({
    type: 'enum',
    enum: StatusContratacaoDireta,
    default: StatusContratacaoDireta.RASCUNHO
  })
  status: StatusContratacaoDireta;

  // Hipótese Legal
  @Column({ nullable: true })
  hipotese_dispensa: HipoteseDispensa;

  @Column({ nullable: true })
  hipotese_inexigibilidade: HipoteseInexigibilidade;

  @Column({ type: 'text' })
  fundamentacao_legal: string;

  // Objeto
  @Column({ type: 'text' })
  objeto: string;

  @Column({ type: 'text', nullable: true })
  objeto_detalhado: string;

  @Column({ type: 'text' })
  justificativa: string;

  @Column({ type: 'text', nullable: true })
  razao_escolha_fornecedor: string;

  @Column({ type: 'text', nullable: true })
  justificativa_preco: string;

  // Fornecedor
  @Column({ nullable: true })
  fornecedor_id: string;

  @Column({ nullable: true })
  fornecedor_cnpj: string;

  @Column({ nullable: true })
  fornecedor_razao_social: string;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_contratado: number;

  // Datas
  @Column({ type: 'timestamp', nullable: true })
  data_abertura: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_publicacao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_limite_propostas: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_adjudicacao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_homologacao: Date;

  // Dispensa Eletrônica (Art. 75, §3º)
  @Column({ default: false })
  dispensa_eletronica: boolean;

  @Column({ type: 'int', nullable: true })
  prazo_propostas_horas: number; // Mínimo 3 horas úteis

  // Responsáveis
  @Column({ nullable: true })
  responsavel_elaboracao: string;

  @Column({ nullable: true })
  autoridade_competente: string;

  // Documentos
  @Column({ nullable: true })
  termo_referencia_url: string;

  @Column({ nullable: true })
  pesquisa_precos_url: string;

  @Column({ nullable: true })
  parecer_juridico_url: string;

  @Column({ nullable: true })
  aviso_contratacao_url: string;

  // Integração PNCP
  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ type: 'int', nullable: true })
  ano_compra_pncp: number;

  @Column({ type: 'int', nullable: true })
  sequencial_compra_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  // Contrato gerado
  @Column({ nullable: true })
  contrato_id: string;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

// Itens da Contratação Direta
@Entity('itens_contratacao_direta')
export class ItemContratacaoDireta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ContratacaoDireta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contratacao_direta_id' })
  contratacao_direta: ContratacaoDireta;

  @Column()
  contratacao_direta_id: string;

  @Column({ type: 'int' })
  numero_item: number;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ nullable: true })
  unidade_medida: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_unitario_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_unitario_contratado: number;

  @Column({ nullable: true })
  codigo_catalogo: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
