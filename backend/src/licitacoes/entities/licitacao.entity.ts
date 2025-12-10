import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';
import { LoteLicitacao } from '../../lotes/entities/lote-licitacao.entity';
import { ItemPCA } from '../../pca/entities/pca.entity';

/**
 * ============================================================================
 * MODOS DE VINCULAÇÃO AO PCA
 * ============================================================================
 * 
 * Lei 14.133/2021, Art. 12, VII:
 * "As contratações públicas deverão submeter-se a práticas contínuas e 
 * permanentes de gestão de riscos e de controle preventivo, inclusive 
 * mediante adoção de recursos de tecnologia da informação, e, além de 
 * estar subordinadas ao controle social, sujeitar-se-ão às seguintes 
 * linhas de defesa: VII - o plano de contratações anual"
 * 
 * O sistema oferece 3 modos de vinculação ao PCA:
 * 
 * 1. POR_LICITACAO: Todos os itens vinculam ao mesmo PCA
 *    - Ideal para objetos homogêneos
 *    - Ex: "Aquisição de Equipamentos de TI"
 * 
 * 2. POR_LOTE: Cada lote vincula a um PCA diferente
 *    - Ideal para objetos parcelados (Art. 40, §3º)
 *    - Ex: "Computadores (Lote 1) + Alimentos (Lote 2)"
 * 
 * 3. POR_ITEM: Cada item vincula individualmente
 *    - Ideal para casos especiais ou itens avulsos
 *    - Ex: Contratações emergenciais
 */
export enum ModoVinculacaoPCA {
  POR_LICITACAO = 'POR_LICITACAO',
  POR_LOTE = 'POR_LOTE',
  POR_ITEM = 'POR_ITEM',
}

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

  // === UNIDADE COMPRADORA (PNCP) ===
  @Column({ nullable: true })
  codigo_unidade_compradora: string; // Código da unidade no PNCP (ex: "1", "10", "15")

  @Column({ nullable: true })
  nome_unidade_compradora: string; // Nome da unidade para referência

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
  // Usando 'timestamp without time zone' para armazenar horário de Brasília sem conversão UTC
  @Column({ type: 'timestamp without time zone', nullable: true })
  data_publicacao_edital: Date;

  @Column({ type: 'timestamp without time zone', nullable: true })
  data_limite_impugnacao: Date;

  @Column({ type: 'timestamp without time zone', nullable: true })
  data_inicio_acolhimento: Date;

  @Column({ type: 'timestamp without time zone', nullable: true })
  data_fim_acolhimento: Date;

  @Column({ type: 'timestamp without time zone', nullable: true })
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

  // === BENEFÍCIO ME/EPP (LC 123/2006) ===
  @Column({ default: 'GERAL' })
  modo_beneficio_mpe: 'GERAL' | 'POR_LOTE' | 'POR_ITEM'; // Modo de aplicação do benefício

  @Column({ default: 'NENHUM' })
  tipo_beneficio_mpe: 'NENHUM' | 'EXCLUSIVO' | 'COTA_RESERVADA'; // Tipo de benefício quando GERAL

  // === PREFERÊNCIAS (mantidos para compatibilidade) ===
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
  enviado_pncp: boolean; // Indica se foi enviado ao PNCP

  @Column({ default: false })
  srp: boolean; // Sistema de Registro de Preços

  // === AUDITORIA ===
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // === RELAÇÃO COM ITENS ===
  @OneToMany(() => ItemLicitacao, item => item.licitacao)
  itens: ItemLicitacao[];

  // ============================================================================
  // VINCULAÇÃO COM PCA - Lei 14.133/2021, Art. 12, VII
  // ============================================================================

  /**
   * Modo de vinculação ao PCA
   * 
   * Lei 14.133/2021, Art. 12, VII:
   * "As contratações públicas deverão submeter-se a práticas contínuas e 
   * permanentes de gestão de riscos e de controle preventivo, inclusive 
   * mediante adoção de recursos de tecnologia da informação, e, além de 
   * estar subordinadas ao controle social, sujeitar-se-ão às seguintes 
   * linhas de defesa: VII - o plano de contratações anual"
   * 
   * - POR_LICITACAO: Todos os itens vinculam ao mesmo PCA (objeto homogêneo)
   * - POR_LOTE: Cada lote vincula a um PCA diferente (objeto parcelado - Art. 40, §3º)
   * - POR_ITEM: Cada item vincula individualmente (casos especiais)
   */
  @Column({
    type: 'enum',
    enum: ModoVinculacaoPCA,
    default: ModoVinculacaoPCA.POR_ITEM
  })
  modo_vinculacao_pca: ModoVinculacaoPCA;

  /**
   * Vinculação direta com Item do PCA (quando modo = POR_LICITACAO)
   * 
   * Quando o modo é POR_LICITACAO, todos os itens da licitação
   * herdam automaticamente este item_pca_id.
   */
  @ManyToOne(() => ItemPCA, { nullable: true })
  @JoinColumn({ name: 'item_pca_id' })
  item_pca: ItemPCA;

  @Column({ type: 'uuid', nullable: true })
  item_pca_id: string;

  /**
   * Flag para indicar se a licitação não possui vinculação com PCA
   * 
   * Lei 14.133/2021, Art. 12, §1º:
   * "A não observância do disposto no inciso VII do caput deste artigo 
   * deverá ser justificada pelo ordenador de despesa"
   */
  @Column({ type: 'boolean', default: false })
  sem_pca: boolean;

  /**
   * Justificativa para licitação sem vinculação ao PCA
   * OBRIGATÓRIA quando sem_pca = true
   */
  @Column({ type: 'text', nullable: true })
  justificativa_sem_pca: string;

  // ============================================================================
  // LOTES - Lei 14.133/2021, Art. 40, §3º
  // ============================================================================

  /**
   * Flag para indicar se a licitação utiliza lotes
   * 
   * Lei 14.133/2021, Art. 40, §3º:
   * "O parcelamento será adotado quando técnica e economicamente viável, 
   * e deverá ser justificado quando não for adotado."
   * 
   * Quando true, os itens devem ser organizados em lotes.
   */
  @Column({ type: 'boolean', default: false })
  usa_lotes: boolean;

  /**
   * Relação com os lotes da licitação
   */
  @OneToMany(() => LoteLicitacao, lote => lote.licitacao)
  lotes: LoteLicitacao[];

  /**
   * Justificativa para não parcelamento (quando usa_lotes = false)
   * 
   * Lei 14.133/2021, Art. 40, §3º:
   * "O parcelamento será adotado quando técnica e economicamente viável, 
   * e deverá ser justificado quando não for adotado."
   */
  @Column({ type: 'text', nullable: true })
  justificativa_nao_parcelamento: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
