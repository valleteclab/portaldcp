import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * AUTORIDADE COMPETENTE do órgão (Lei 14.133/2021 art. 71 IV — adjudicar e
 * homologar é ato da autoridade superior). O órgão cadastra uma ou mais
 * (prefeito, secretário com delegação...), com uma PADRÃO; quem opera o
 * sistema (agente de contratação/pregoeiro) escolhe a autoridade ao registrar
 * o ato. Nome/cargo/delegação vão para o termo publicado no Diário Oficial.
 */
@Entity('autoridades_orgao')
@Index(['orgao_id'])
export class AutoridadeOrgao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'varchar', length: 200 })
  nome: string;

  @Column({ type: 'varchar', length: 200 })
  cargo: string;

  /** Opcional. Com CPF, a assinatura eletrônica usa o link externo (CPF + código). */
  @Column({ type: 'varchar', length: 14, nullable: true })
  cpf: string | null;

  /** Obrigatório para o modo ASSINATURA_ELETRONICA (convite e código de assinatura). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  /** Ato de delegação de competência (portaria/decreto), quando a autoridade não é o titular. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  ato_delegacao_numero: string | null;

  @Column({ type: 'date', nullable: true })
  ato_delegacao_data: string | null;

  @Column({ type: 'boolean', default: false })
  padrao: boolean;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/**
 * FORMALIZAÇÃO de um ato do resultado (ADJUDICAÇÃO ou HOMOLOGAÇÃO): quem
 * REGISTROU no sistema (operador) × quem PRATICA o ato (autoridade), o modo
 * do órgão, o termo gerado e — conforme o modo — o documento de assinatura
 * eletrônica ou o termo externo enviado.
 */
@Entity('formalizacoes_resultado')
@Index(['licitacao_id'])
@Index(['documento_assinatura_id'])
export class FormalizacaoResultado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 64 })
  orgao_id: string;

  /** ADJUDICACAO | HOMOLOGACAO */
  @Column({ type: 'varchar', length: 20 })
  tipo: string;

  /** REGISTRO_DIRETO | ASSINATURA_ELETRONICA | TERMO_EXTERNO */
  @Column({ type: 'varchar', length: 30 })
  modo: string;

  /** EFETIVADO | PENDENTE_ASSINATURA | EFETIVANDO | FALHOU | CANCELADO */
  @Column({ type: 'varchar', length: 30 })
  status: string;

  // --- autoridade (retrato do cadastro no momento do ato) ---
  @Column({ type: 'uuid', nullable: true })
  autoridade_id: string | null;

  @Column({ type: 'varchar', length: 200 })
  autoridade_nome: string;

  @Column({ type: 'varchar', length: 200 })
  autoridade_cargo: string;

  @Column({ type: 'varchar', length: 14, nullable: true })
  autoridade_cpf: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  autoridade_email: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  autoridade_ato_delegacao_numero: string | null;

  @Column({ type: 'date', nullable: true })
  autoridade_ato_delegacao_data: string | null;

  // --- operador (quem clicou) ---
  @Column({ type: 'varchar', length: 20 })
  operador_tipo: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  operador_id: string | null;

  @Column({ type: 'varchar', length: 200 })
  operador_nome: string;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  valor_total: number | null;

  /** Retrato das unidades/itens do termo e dados da publicação externa. */
  @Column({ type: 'jsonb', nullable: true })
  dados: Record<string, any> | null;

  /** Termo gerado pelo sistema (caminho lógico `resultados/<licitacao>/<arquivo>.pdf`). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  arquivo_termo: string | null;

  /** Termo assinado (assinador) ou enviado (termo externo / publicação no DO). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  arquivo_assinado: string | null;

  @Column({ type: 'uuid', nullable: true })
  documento_assinatura_id: string | null;

  @Column({ type: 'text', nullable: true })
  erro: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  efetivado_em: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
