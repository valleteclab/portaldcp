import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';

// === ENUMS CONFORME LEI 14.133/2021 ===

export enum ModalidadeLicitacao {
  PREGAO_ELETRONICO = 'PREGAO_ELETRONICO', // Art. 28, I
  CONCORRENCIA = 'CONCORRENCIA', // Art. 28, II
  CONCURSO = 'CONCURSO', // Art. 28, III
  LEILAO = 'LEILAO', // Art. 28, IV
  DIALOGO_COMPETITIVO = 'DIALOGO_COMPETITIVO', // Art. 28, V
  DISPENSA_ELETRONICA = 'DISPENSA_ELETRONICA', // Art. 75 (Contratação Direta)
  INEXIGIBILIDADE = 'INEXIGIBILIDADE', // Art. 74
}

export enum CriterioJulgamento {
  MENOR_PRECO = 'MENOR_PRECO', // Art. 33, I
  MAIOR_DESCONTO = 'MAIOR_DESCONTO', // Art. 33, II
  MELHOR_TECNICA = 'MELHOR_TECNICA', // Art. 33, III
  TECNICA_E_PRECO = 'TECNICA_E_PRECO', // Art. 33, IV
  MAIOR_LANCE = 'MAIOR_LANCE', // Art. 33, V (Leilão)
  MAIOR_RETORNO_ECONOMICO = 'MAIOR_RETORNO_ECONOMICO', // Art. 33, VI
}

export enum ModoDisputa {
  ABERTO = 'ABERTO', // Art. 56, I
  ABERTO_FECHADO = 'ABERTO_FECHADO', // Art. 56, II
  FECHADO_ABERTO = 'FECHADO_ABERTO', // Art. 56, III
  FECHADO = 'FECHADO', // Exceção
}

export enum FaseLicitacao {
  // FASE INTERNA (Preparatória)
  PLANEJAMENTO = 'PLANEJAMENTO', // Estudo Técnico Preliminar
  TERMO_REFERENCIA = 'TERMO_REFERENCIA', // Elaboração do TR
  PESQUISA_PRECOS = 'PESQUISA_PRECOS', // Art. 23
  ANALISE_JURIDICA = 'ANALISE_JURIDICA', // Parecer Jurídico
  APROVACAO_INTERNA = 'APROVACAO_INTERNA', // Autorização da autoridade

  // FASE EXTERNA
  PUBLICADO = 'PUBLICADO', // Edital publicado
  IMPUGNACAO = 'IMPUGNACAO', // Prazo para impugnações
  ACOLHIMENTO_PROPOSTAS = 'ACOLHIMENTO_PROPOSTAS', // Recebendo propostas
  ANALISE_PROPOSTAS = 'ANALISE_PROPOSTAS', // Verificação de conformidade
  EM_DISPUTA = 'EM_DISPUTA', // Sessão de lances
  JULGAMENTO = 'JULGAMENTO', // Análise do vencedor
  HABILITACAO = 'HABILITACAO', // Verificação de documentos
  RECURSO = 'RECURSO', // Prazo recursal
  ADJUDICACAO = 'ADJUDICACAO', // Declaração do vencedor
  HOMOLOGACAO = 'HOMOLOGACAO', // Aprovação final

  // FINALIZADOS
  CONCLUIDO = 'CONCLUIDO',
  FRACASSADO = 'FRACASSADO',
  DESERTO = 'DESERTO',
  REVOGADO = 'REVOGADO',
  ANULADO = 'ANULADO',
  SUSPENSO = 'SUSPENSO',
}

export enum TipoContratacao {
  COMPRA = 'COMPRA',
  SERVICO = 'SERVICO',
  OBRA = 'OBRA',
  SERVICO_ENGENHARIA = 'SERVICO_ENGENHARIA',
  LOCACAO = 'LOCACAO',
  ALIENACAO = 'ALIENACAO',
}

export enum RegimeExecucao {
  EMPREITADA_PRECO_GLOBAL = 'EMPREITADA_PRECO_GLOBAL',
  EMPREITADA_PRECO_UNITARIO = 'EMPREITADA_PRECO_UNITARIO',
  TAREFA = 'TAREFA',
  CONTRATACAO_INTEGRADA = 'CONTRATACAO_INTEGRADA',
  CONTRATACAO_SEMI_INTEGRADA = 'CONTRATACAO_SEMI_INTEGRADA',
  FORNECIMENTO_MAO_OBRA = 'FORNECIMENTO_MAO_OBRA',
}

@Entity('licitacoes')
export class Licitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === IDENTIFICAÇÃO ===
  @Column({ unique: true })
  numero_processo: string;

  @Column({ nullable: true })
  numero_edital: string;

  @Column({ type: 'int', nullable: true })
  ano: number;

  @Column({ type: 'int', nullable: true })
  sequencial: number;

  // === RELACIONAMENTO COM ÓRGÃO ===
  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ nullable: true })
  orgao_id: string;

  // === OBJETO ===
  @Column({ type: 'text' })
  objeto: string;

  @Column({ type: 'text', nullable: true })
  objeto_detalhado: string;

  @Column({ type: 'text', nullable: true })
  justificativa: string;

  // === CLASSIFICAÇÃO ===
  @Column({
    type: 'enum',
    enum: ModalidadeLicitacao,
    default: ModalidadeLicitacao.PREGAO_ELETRONICO
  })
  modalidade: ModalidadeLicitacao;

  @Column({
    type: 'enum',
    enum: TipoContratacao,
    default: TipoContratacao.COMPRA
  })
  tipo_contratacao: TipoContratacao;

  @Column({
    type: 'enum',
    enum: CriterioJulgamento,
    default: CriterioJulgamento.MENOR_PRECO
  })
  criterio_julgamento: CriterioJulgamento;

  @Column({
    type: 'enum',
    enum: ModoDisputa,
    default: ModoDisputa.ABERTO
  })
  modo_disputa: ModoDisputa;

  @Column({
    type: 'enum',
    enum: RegimeExecucao,
    nullable: true
  })
  regime_execucao: RegimeExecucao;

  // === FASE E STATUS ===
  @Column({
    type: 'enum',
    enum: FaseLicitacao,
    default: FaseLicitacao.PLANEJAMENTO
  })
  fase: FaseLicitacao;

  // === VALORES ===
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_homologado: number;

  // === DATAS - FASE INTERNA ===
  @Column({ type: 'timestamp', nullable: true })
  data_abertura_processo: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_aprovacao_tr: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_parecer_juridico: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_autorizacao: Date;

  // === DATAS - FASE EXTERNA ===
  @Column({ type: 'timestamp', nullable: true })
  data_publicacao_edital: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_limite_impugnacao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_inicio_acolhimento: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_fim_acolhimento: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_abertura_sessao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_inicio_disputa: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_fim_disputa: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_adjudicacao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_homologacao: Date;

  // === CONFIGURAÇÕES DA DISPUTA ===
  @Column({ type: 'int', default: 3 })
  intervalo_minimo_lances: number; // Em minutos

  @Column({ type: 'int', default: 2 })
  tempo_prorrogacao: number; // Em minutos

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  diferenca_minima_lances: number; // Valor mínimo entre lances

  @Column({ default: true })
  permite_lances_intermediarios: boolean;

  @Column({ default: true })
  tratamento_diferenciado_mpe: boolean; // ME/EPP

  // === PREFERÊNCIAS ===
  @Column({ default: false })
  exclusivo_mpe: boolean; // Exclusivo para ME/EPP

  @Column({ default: false })
  cota_reservada: boolean; // Cota reservada para ME/EPP

  @Column({ type: 'int', nullable: true })
  percentual_cota_reservada: number;

  @Column({ default: false })
  margem_preferencia: boolean;

  // === RESPONSÁVEIS ===
  @Column({ nullable: true })
  pregoeiro_id: string;

  @Column({ nullable: true })
  pregoeiro_nome: string;

  @Column({ nullable: true })
  equipe_apoio: string; // JSON com IDs/nomes

  // === FASE INTERNA ===
  @Column({ default: false })
  fase_interna_concluida: boolean;

  // === SIGILO DO ORÇAMENTO (Art. 24, Lei 14.133/2021) ===
  @Column({ default: 'PUBLICO' })
  sigilo_orcamento: 'PUBLICO' | 'SIGILOSO';

  @Column({ type: 'text', nullable: true })
  justificativa_sigilo: string;

  // === INTEGRAÇÃO ===
  @Column({ nullable: true })
  sistema_origem: string;

  @Column({ nullable: true })
  codigo_externo: string;

  @Column({ nullable: true })
  link_pncp: string; // Portal Nacional de Contratações Públicas

  @Column({ nullable: true })
  numero_controle_pncp: string; // Número de controle retornado pelo PNCP

  @Column({ type: 'int', nullable: true })
  ano_compra_pncp: number;

  @Column({ type: 'int', nullable: true })
  sequencial_compra_pncp: number;

  @Column({ default: false })
  srp: boolean; // Sistema de Registro de Preços

  // === AUDITORIA ===
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // === RELAÇÃO COM ITENS ===
  @OneToMany(() => ItemLicitacao, item => item.licitacao)
  itens: ItemLicitacao[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
