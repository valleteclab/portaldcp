import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, BeforeInsert } from 'typeorm';
import { fundamentoPadrao } from '../fundamento-legal';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';
import { LoteLicitacao } from '../../lotes/entities/lote-licitacao.entity';
import { ItemPCA } from '../../pca/entities/pca.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Demanda } from '../../demandas/entities/demanda.entity';
import { BaseLance } from '../../disputa/modelo-lance';

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
  /**
   * Procedimento auxiliar (art. 78 I e art. 79) — não é modalidade de
   * licitação (art. 28), mas é um PROCESSO da mesma base (fase interna,
   * edital, PNCP, cockpit). Contratação dos credenciados por inexigibilidade
   * (art. 74 IV). Plano E7b — backend/src/credenciamento/.
   */
  CREDENCIAMENTO = 'CREDENCIAMENTO',
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
  /**
   * Ato de publicação praticado, mas a divulgação OFICIAL ainda não foi
   * confirmada (PNCP — arts. 54 e 174; art. 176 par. único para quem ainda não
   * adotou o PNCP). Os prazos (art. 55; art. 75 §3º) só correm da divulgação
   * confirmada: nada é recebido nesta fase e a licitação não é pública.
   */
  AGUARDANDO_DIVULGACAO = 'AGUARDANDO_DIVULGACAO',
  PUBLICADO = 'PUBLICADO', // Edital publicado (divulgação oficial confirmada)
  IMPUGNACAO = 'IMPUGNACAO', // Prazo para impugnações
  ACOLHIMENTO_PROPOSTAS = 'ACOLHIMENTO_PROPOSTAS', // Recebendo propostas
  ANALISE_PROPOSTAS = 'ANALISE_PROPOSTAS', // Verificação de conformidade
  EM_DISPUTA = 'EM_DISPUTA', // Sessão de lances
  JULGAMENTO = 'JULGAMENTO', // Análise do vencedor
  HABILITACAO = 'HABILITACAO', // Verificação de documentos
  RECURSO = 'RECURSO', // Prazo recursal
  ADJUDICACAO = 'ADJUDICACAO', // Declaração do vencedor
  HOMOLOGACAO = 'HOMOLOGACAO', // Aprovação final

  // LEGADO (E1) — NÃO atribuir. A situação do processo (suspenso, revogado,
  // deserto...) agora vive em `licitacao.situacao` (SituacaoLicitacao) e a
  // `fase` guarda só a fase do processo. Os valores continuam no enum apenas
  // para o Postgres/TypeORM não falharem ao ler linhas antigas antes do
  // backfill (transicoes/migracao-situacao.ts) e para o synchronize não tentar
  // recriar o tipo `licitacoes_fase_enum`.
  /** @deprecated use SituacaoLicitacao.CONCLUIDA */
  CONCLUIDO = 'CONCLUIDO',
  /** @deprecated use SituacaoLicitacao.FRACASSADA */
  FRACASSADO = 'FRACASSADO',
  /** @deprecated use SituacaoLicitacao.DESERTA */
  DESERTO = 'DESERTO',
  /** @deprecated use SituacaoLicitacao.REVOGADA */
  REVOGADO = 'REVOGADO',
  /** @deprecated use SituacaoLicitacao.ANULADA */
  ANULADO = 'ANULADO',
  /** @deprecated use SituacaoLicitacao.SUSPENSA */
  SUSPENSO = 'SUSPENSO',
}

/**
 * SITUAÇÃO do processo — separada da fase (plano E1 §2.3).
 *
 * `fase` diz ONDE o processo está (publicado, disputa, homologação...);
 * `situacao` diz COMO ele está: correndo (ATIVA), parado (SUSPENSA) ou
 * encerrado por um ato (REVOGADA, ANULADA, DESERTA, FRACASSADA, CONCLUIDA).
 * Suspender/revogar/anular não apagam a fase: dá para saber em que ponto o
 * processo foi suspenso/revogado e retomar exatamente dali.
 */
export enum SituacaoLicitacao {
  ATIVA = 'ATIVA',
  SUSPENSA = 'SUSPENSA',
  REVOGADA = 'REVOGADA', // Art. 71, II — interesse público (fato superveniente)
  ANULADA = 'ANULADA', // Art. 71, III — ilegalidade insanável
  DESERTA = 'DESERTA', // nenhum interessado
  FRACASSADA = 'FRACASSADA', // interessados, mas nenhum vencedor
  CONCLUIDA = 'CONCLUIDA', // homologada e com contrato/ata gerados
}

/** Situações que encerram o processo (nenhum ato de fase é possível). */
export const SITUACOES_TERMINAIS: SituacaoLicitacao[] = [
  SituacaoLicitacao.REVOGADA,
  SituacaoLicitacao.ANULADA,
  SituacaoLicitacao.DESERTA,
  SituacaoLicitacao.FRACASSADA,
  SituacaoLicitacao.CONCLUIDA,
];

/** Valores LEGADOS de `fase` que eram, na verdade, situação. */
export const FASES_LEGADAS_DE_SITUACAO: FaseLicitacao[] = [
  FaseLicitacao.CONCLUIDO,
  FaseLicitacao.FRACASSADO,
  FaseLicitacao.DESERTO,
  FaseLicitacao.REVOGADO,
  FaseLicitacao.ANULADO,
  FaseLicitacao.SUSPENSO,
];

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

  // === ORIGEM: DEMANDA ===
  @Column({ type: 'uuid', nullable: true })
  demanda_id: string;

  @ManyToOne(() => Demanda, { nullable: true })
  @JoinColumn({ name: 'demanda_id' })
  demanda: Demanda;

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

  /**
   * FUNDAMENTO LEGAL — fonte única do enquadramento (art. 28/74/75/78), em
   * código (`FundamentoLegal`, licitacoes/fundamento-legal.ts). PNCP (amparo
   * legal), modelos de documento, aviso e limite de dispensa derivam dele.
   * NULL = processo antigo ainda não migrado → vale o padrão da modalidade
   * (`fundamentoEfetivo`). varchar (não enum) para a tabela crescer sem
   * recriar tipo no Postgres; `type` explícito (synchronize em produção).
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  fundamento_legal: string | null;

  /** Todo processo novo nasce com o fundamento gravado (padrão da modalidade quando não informado). */
  @BeforeInsert()
  preencherFundamentoLegal() {
    if (!this.fundamento_legal) this.fundamento_legal = fundamentoPadrao(this.modalidade, this.tipo_contratacao);
  }

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

  /**
   * INVERSÃO DE FASES (Lei 14.133 art. 17 §1º — só concorrência, plano E4):
   * todos os licitantes entregam a habilitação com a proposta; a comissão
   * julga a habilitação de todos ANTES da etapa de lances e só os HABILITADOS
   * disputam (pré-condição do INICIAR_DISPUTA). Congelada após a publicação.
   */
  @Column({ type: 'boolean', default: false })
  inversao_fases: boolean;

  @Column({
    type: 'enum',
    enum: RegimeExecucao,
    nullable: true
  })
  regime_execucao: RegimeExecucao;

  /**
   * Natureza do objeto (Lei 14.133/2021, art. 6º XIII — bens e serviços
   * COMUNS; XIV — ESPECIAIS). Define o prazo mínimo do art. 55, II (10 ou 25
   * dias úteis) para serviços e obras por menor preço/maior desconto; exigida
   * na publicação quando decide o prazo (plano E7a). Pregão = sempre COMUM.
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  natureza_objeto: 'COMUM' | 'ESPECIAL' | null;

  // === FASE E STATUS ===
  @Column({
    type: 'enum',
    enum: FaseLicitacao,
    default: FaseLicitacao.PLANEJAMENTO
  })
  fase: FaseLicitacao;

  /**
   * Situação do processo (E1). Só muda por ato do TransicoesService
   * (suspender, retomar, revogar, anular, declarar deserta/fracassada, concluir).
   */
  @Column({
    type: 'enum',
    enum: SituacaoLicitacao,
    // Sem `enumName`: o nome padrão do TypeORM já é `licitacoes_situacao_enum`
    // (<tabela>_<coluna>_enum). Declará-lo igual ao padrão fazia o synchronize
    // ver diferença a cada boot e recriar o tipo enum.
    default: SituacaoLicitacao.ATIVA,
  })
  situacao: SituacaoLicitacao;

  /**
   * Fase imediatamente anterior à atual (gravada a cada mudança de fase pelo
   * TransicoesService). O histórico completo fica em `licitacao_transicoes`.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  fase_anterior: FaseLicitacao | null;

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

  /**
   * DIVULGAÇÃO OFICIAL CONFIRMADA (arts. 54, 55 e 174; art. 75 §3º): momento em
   * que o PNCP devolveu o número de controle da compra (ou, para quem ainda não
   * adotou o PNCP, a data da publicação no diário oficial — art. 176 par.
   * único). É daqui que os prazos mínimos são contados; `data_publicacao_edital`
   * guarda a data do ATO de publicação praticado na plataforma.
   */
  @Column({ type: 'timestamp without time zone', nullable: true })
  data_divulgacao_oficial: Date | null;

  /** Meio da divulgação oficial: PNCP (automático) | DIARIO_OFICIAL (art. 176 par. único). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  meio_divulgacao_oficial: string | null;

  /** Número de controle PNCP ou referência da publicação (edição/página/link do diário). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  referencia_divulgacao_oficial: string | null;

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

  /**
   * Autoridade que homologou (Lei 14.133 art. 71 IV) — retrato do cadastro no
   * momento do ato (usuário do token ou responsável do órgão), nunca do corpo.
   * Plano E6 (ResultadoService.homologar).
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  homologacao_autoridade_nome: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  homologacao_autoridade_cargo: string | null;

  // === CONFIGURAÇÕES DA DISPUTA ===
  // Overrides do edital sobre os parâmetros do órgão (resolvedor:
  // licitação → órgão → sistema — disputa/parametros-disputa.ts). NULL = herda.
  @Column({ type: 'int', nullable: true })
  tempo_inatividade: number | null; // Etapa inicial do modo aberto (min) — IN 73 art. 23

  @Column({ type: 'int', nullable: true })
  intervalo_minimo_lances: number | null; // Tempo entre lances do mesmo fornecedor (min) — não é exigência legal

  @Column({ type: 'int', nullable: true })
  tempo_prorrogacao: number | null; // Prorrogação automática (min) — IN 73 art. 23

  /** Intervalo mínimo de diferença entre lances (IN 73 art. 21 §2º, art. 22 §1º; Lei art. 56 §3º). */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  diferenca_minima_lances: number;

  /** VALOR (R$, na unidade da base do lance) ou PERCENTUAL. */
  @Column({ type: 'varchar', length: 12, default: 'VALOR' })
  tipo_diferenca_minima_lances: 'VALOR' | 'PERCENTUAL';

  /**
   * Unidade dos lances (plano E2 §2.3): UNITARIO, TOTAL_ITEM (padrão — como o
   * pregão por item sempre funcionou) ou TOTAL_LOTE (disputa por lote).
   */
  @Column({ type: 'varchar', length: 20, default: BaseLance.TOTAL_ITEM })
  base_lance: BaseLance;

  @Column({ default: true })
  permite_lances_intermediarios: boolean;

  @Column({ default: true })
  tratamento_diferenciado_mpe: boolean; // ME/EPP

  // === BENEFÍCIO ME/EPP (LC 123/2006) ===
  @Column({ default: 'GERAL' })
  modo_beneficio_mpe: 'GERAL' | 'POR_LOTE' | 'POR_ITEM'; // Modo de aplicação do benefício

  @Column({ default: 'NENHUM' })
  tipo_beneficio_mpe: 'NENHUM' | 'EXCLUSIVO' | 'COTA_RESERVADA'; // Tipo de benefício quando GERAL

  // === PREFERÊNCIAS (legado) ===
  /**
   * @deprecated E3/E9 — DERIVADO de `tipo_beneficio_mpe` (fonte); gravado só
   * para as telas antigas (edição, detalhe público, lotes). Nenhuma regra lê.
   * Drop físico quando o frontend usar só `tipo_beneficio_mpe` (plano, E9).
   */
  @Column({ default: false })
  exclusivo_mpe: boolean;

  /** @deprecated E3/E9 — ver `exclusivo_mpe`. */
  @Column({ default: false })
  cota_reservada: boolean;

  /**
   * Percentual da cota reservada (LC 123/2006 art. 48 III, ≤ 25%) — PARÂMETRO
   * de `tipo_beneficio_mpe = COTA_RESERVADA` (não é cópia de outro campo; fica).
   */
  @Column({ type: 'int', nullable: true })
  percentual_cota_reservada: number;

  /**
   * Justificativa (LC 123/2006 art. 49) para itens de até R$ 80.000 SEM
   * participação exclusiva de ME/EPP (art. 48 I). Exigida no ato PUBLICAR
   * (informada no ato ou gravada antes na edição); o ato a grava aqui e na
   * transição.
   */
  @Column({ type: 'text', nullable: true })
  justificativa_nao_exclusividade_mpe: string | null;

  @Column({ default: false })
  margem_preferencia: boolean;

  // === RESPONSÁVEIS ===
  @Column({ nullable: true })
  pregoeiro_id: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'pregoeiro_id' })
  pregoeiro: Usuario;

  /**
   * @deprecated E9 — texto livre; a fonte é `pregoeiro_id` (usuário do órgão —
   * migração no boot por nome único). Lido só como alternativa quando não há
   * vínculo (`nomeDoPregoeiro`). Drop físico: plano, E9.
   */
  @Column({ nullable: true })
  pregoeiro_nome: string;

  /**
   * @deprecated E9 — texto livre (JSON/nomes) sem nenhuma regra que o leia; a
   * equipe de apoio não é usada em ato algum. Mantido só para a tela de
   * edição; tabela própria só quando houver regra (plano, E9).
   */
  @Column({ nullable: true })
  equipe_apoio: string;

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

  /**
   * Link da compra no PNCP INFORMADO pelo órgão (seleção externa — compra
   * publicada por outra plataforma). Compra publicada por ESTA plataforma: o
   * link sai de `pncp_sync` (`pncp/estado-compra-pncp.ts`, E9).
   */
  @Column({ nullable: true })
  link_pncp: string;

  /**
   * @deprecated E9 — cópia do estado da compra no PNCP. Fonte: `pncp_sync`
   * (linha COMPRA ENVIADA; migração no boot). Ninguém mais grava; as telas
   * recebem o mesmo campo por `aplicarEstadoCompraPncp`. Drop físico: plano, E9.
   */
  @Column({ nullable: true })
  numero_controle_pncp: string;

  /** @deprecated E9 — ver `numero_controle_pncp`. */
  @Column({ type: 'int', nullable: true })
  ano_compra_pncp: number;

  /** @deprecated E9 — ver `numero_controle_pncp`. */
  @Column({ type: 'int', nullable: true })
  sequencial_compra_pncp: number;

  /** @deprecated E9 — ver `numero_controle_pncp`. */
  @Column({ default: false })
  enviado_pncp: boolean;

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

  // ============================================================================
  // SELEÇÃO EXTERNA (Degrau 1) — disputa realizada FORA do sistema
  // (ex.: BLL, BNC, Compras.gov). A fase interna e o contrato ficam no Portal;
  // o resultado é registrado manualmente e a homologação gera o contrato.
  // ============================================================================
  @Column({ default: false })
  selecao_externa: boolean;

  /** Plataforma onde a disputa ocorreu (ex.: "BLL Compras", "Compras.gov.br") */
  @Column({ type: 'varchar', nullable: true, length: 120 })
  plataforma_externa: string | null;

  /** Nº do processo/pregão na plataforma externa */
  @Column({ type: 'varchar', nullable: true, length: 60 })
  numero_processo_externo: string | null;

  /** Link para o processo na plataforma externa */
  @Column({ type: 'varchar', nullable: true, length: 300 })
  url_externa: string | null;

  // Dados pedidos pelo leiaute das plataformas de disputa (BLL e similares),
  // preenchidos na exportação do edital. Só informativos para o portal.
  @Column({ type: 'varchar', length: 500, nullable: true })
  entrega_local: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  entrega_prazo: string | null;

  @Column({ type: 'text', nullable: true })
  garantia_produto: string | null;

  /** Vigência da ata em meses (registro de preços). */
  @Column({ type: 'int', nullable: true })
  ata_vigencia_meses: number | null;

  // ============================================================================
  // DISPENSA ELETRÔNICA — fase de LANCES (opcional, espelha IN SEGES 67/2021)
  // Janela aberta pelo órgão após o fim do acolhimento de propostas.
  // ============================================================================
  @Column({ type: 'timestamp', nullable: true })
  dispensa_lances_inicio: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  dispensa_lances_fim: Date | null;

  /**
   * MODO CO-WORK (copiloto): status/progresso da preparação automática do
   * processo (pesquisa de preços + rascunhos IA da instrução) —
   * { status: EXECUTANDO|CONCLUIDA|ERRO, etapa, log[], iniciada_em, concluida_em }.
   */
  @Column({ type: 'jsonb', nullable: true })
  preparacao_automatica: any;

  /**
   * Prorrogação automática da janela de lances (minutos). Lance recebido nos
   * últimos N minutos empurra o fim para +N minutos, sucessivamente (modelo do
   * modo de disputa aberto, art. 56 §1º da Lei 14.133 — a IN 67/2021 federal
   * encerra sem prorrogação, por isso é OPCIONAL e definida ao abrir a janela).
   * null/0 = sem prorrogação (encerramento seco, padrão IN 67).
   */
  @Column({ type: 'int', nullable: true })
  dispensa_lances_prorrogacao_min: number | null;

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
