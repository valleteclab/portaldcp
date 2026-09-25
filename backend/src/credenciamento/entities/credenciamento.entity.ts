import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ============================================================================
 * CREDENCIAMENTO COMO PROCESSO (plano E7b)
 * ============================================================================
 *
 * O credenciamento é uma LICITAÇÃO da mesma base (`licitacoes` com
 * modalidade CREDENCIAMENTO): fase interna, edital, PNCP, cockpit, máquina de
 * estados. Estas tabelas guardam só o que é próprio do procedimento:
 *  - `credenciamento_configuracoes`: regras do edital de chamamento (art. 79);
 *  - `credenciamento_inscricoes`: um interessado por linha (documentos pela
 *    habilitação da E4 — `habilitacoes_licitante` com origem INSCRICAO);
 *  - `credenciamento_contratacoes`: cada demanda distribuída pela regra do
 *    edital, com o registro auditável (rodízio, sorteio, escolha, cotações) e
 *    o contrato por inexigibilidade (art. 74 IV).
 *
 * As tabelas antigas `credenciamentos`/`credenciados` (modelo paralelo, sem
 * vínculo com a licitação) deixam de ser entidades: o boot migra as linhas
 * (migracao-credenciamento.ts) e elas ficam só como histórico.
 */

@Entity('credenciamento_configuracoes')
export class ConfiguracaoCredenciamento {
  /** Mesma chave da licitação (uma configuração por processo). */
  @PrimaryColumn('uuid')
  licitacao_id: string;

  /** HipoteseCredenciamento (art. 79 I, II, III). */
  @Column({ type: 'varchar', length: 30 })
  hipotese: string;

  /** RegraDistribuicao. */
  @Column({ type: 'varchar', length: 30 })
  regra_distribuicao: string;

  /** Vigência do edital = período de inscrições (cadastramento permanente — art. 79 par. único I). */
  @Column({ type: 'timestamp', nullable: true })
  vigencia_inicio: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  vigencia_fim: Date | null;

  /** Validade de cada credenciamento, em meses (null = até o fim da vigência do edital). */
  @Column({ type: 'int', nullable: true })
  validade_credenciado_meses: number | null;

  /** Condições padronizadas de contratação (art. 79 par. único III). */
  @Column({ type: 'text', nullable: true })
  condicoes_padronizadas: string | null;

  /** Regras de distribuição em texto (o que o edital diz além da regra escolhida). */
  @Column({ type: 'text', nullable: true })
  regras_distribuicao_texto: string | null;

  /** Prazo de aviso prévio da denúncia, em dias corridos (art. 79 par. único VI). */
  @Column({ type: 'int', nullable: true })
  prazo_denuncia_dias: number | null;

  /** Origem legada (linha de `credenciamentos` migrada). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  origem: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('credenciamento_inscricoes')
@Index('IDX_credenciamento_inscricoes_lic_forn', ['licitacao_id', 'fornecedor_id'])
export class InscricaoCredenciamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fornecedor_cnpj: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fornecedor_razao_social: string | null;

  /** StatusInscricao (regras-credenciamento.ts). */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  /** Habilitação (E4) que recebe os documentos da inscrição. */
  @Column({ type: 'uuid', nullable: true })
  habilitacao_id: string | null;

  @Column({ type: 'timestamp' })
  inscrita_em: Date;

  // --- decisão (deferimento / indeferimento) ---
  @Column({ type: 'timestamp', nullable: true })
  decidida_em: Date | null;

  @Column({ type: 'text', nullable: true })
  decisao_motivo: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  decidida_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  decidida_por_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  credenciado_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  validade_ate: Date | null;

  /** Posição na fila do rodízio (ordem do credenciamento — novos entram no fim). */
  @Column({ type: 'int', nullable: true })
  ordem_rodizio: number | null;

  // --- recurso contra o indeferimento (art. 165 I) ---
  @Column({ type: 'timestamp', nullable: true })
  recurso_prazo_ate: Date | null;

  /** StatusRecursoInscricao (INTERPOSTO → PROVIDO | AGUARDANDO_AUTORIDADE → PROVIDO/IMPROVIDO). */
  @Column({ type: 'varchar', length: 25, nullable: true })
  recurso_status: string | null;

  @Column({ type: 'text', nullable: true })
  recurso_razoes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  recurso_interposto_em: Date | null;

  @Column({ type: 'text', nullable: true })
  recurso_decisao: string | null;

  @Column({ type: 'timestamp', nullable: true })
  recurso_decidido_em: Date | null;

  // Razões em arquivo (privado — no banco, nunca na pasta pública; SHA-256)
  @Column({ type: 'varchar', length: 255, nullable: true })
  recurso_arquivo_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  recurso_arquivo_mime: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  recurso_arquivo_sha256: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  recurso_arquivo_conteudo: Buffer | null;

  // Reconsideração pelo agente (art. 165 §2º — 3 dias úteis)
  @Column({ type: 'timestamp', nullable: true })
  recurso_prazo_reconsideracao: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  recurso_reconsiderado_em: Date | null;

  @Column({ type: 'text', nullable: true })
  recurso_reconsideracao: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  recurso_reconsideracao_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  recurso_reconsideracao_por_id: string | null;

  // Autoridade superior (art. 165 §2º — 10 dias úteis do encaminhamento)
  @Column({ type: 'timestamp', nullable: true })
  recurso_prazo_autoridade: Date | null;

  /** AGENTE (reconsiderou) | AUTORIDADE (decidiu o recurso mantido). */
  @Column({ type: 'varchar', length: 12, nullable: true })
  recurso_instancia: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  recurso_autoridade_nome: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  recurso_autoridade_cargo: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  recurso_decidido_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  recurso_decidido_por_id: string | null;

  // --- descredenciamento / denúncia (art. 79 par. único VI) ---
  /** IniciativaDescredenciamento. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  descredenciamento_iniciativa: string | null;

  @Column({ type: 'text', nullable: true })
  descredenciamento_motivo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  descredenciamento_pedido_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  descredenciamento_efeitos_em: Date | null;

  // --- legado (linha de `credenciados` migrada) ---
  @Column({ type: 'varchar', length: 20, nullable: true })
  origem: string | null;

  @Column({ type: 'jsonb', nullable: true })
  legado: Record<string, any> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('credenciamento_contratacoes')
@Index('IDX_credenciamento_contratacoes_lic', ['licitacao_id', 'numero'])
export class ContratacaoCredenciamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Número sequencial da demanda no credenciamento. */
  @Column({ type: 'int' })
  numero: number;

  @Column({ type: 'text' })
  descricao: string;

  /** RegraDistribuicao aplicada. */
  @Column({ type: 'varchar', length: 30 })
  regra: string;

  @Column({ type: 'uuid' })
  inscricao_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** [{ item_licitacao_id, numero_item, descricao, unidade_medida, quantidade, valor_unitario, valor_total }] */
  @Column({ type: 'jsonb' })
  itens: Array<Record<string, any>>;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  /**
   * Registro auditável da escolha: rodízio (fila e ordem do último), sorteio
   * (algoritmo, entrada, semente, candidatos, ordem), divisão (valores),
   * escolha do beneficiário (quem escolheu, justificativa) ou cotações.
   */
  @Column({ type: 'jsonb' })
  registro: Record<string, any>;

  /** Ordem do credenciado escolhido na fila do rodízio no momento (ponteiro do rodízio). */
  @Column({ type: 'int', nullable: true })
  ordem_rodizio: number | null;

  @Column({ type: 'int', nullable: true })
  prazo_execucao_dias: number | null;

  @Column({ type: 'uuid', nullable: true })
  contrato_id: string | null;

  /** AGUARDANDO_CONTRATO | CONTRATO_GERADO | FALHOU */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'text', nullable: true })
  erro: string | null;

  @Column({ type: 'timestamp' })
  ato_em: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  ator_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  ator_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
