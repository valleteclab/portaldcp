import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * HABILITAÇÃO DO VENCEDOR NA DISPENSA ELETRÔNICA (Lei 14.133/2021, art. 72, V;
 * IN SEGES 67/2021, art. 17). Homologação 08/11/2026: o julgamento adjudicava e
 * a etapa "Habilitação" ficava verde sem ninguém conferir documento. Vale o
 * registro mais recente de cada fornecedor na licitação.
 */
@Entity('habilitacoes_dispensa')
@Index(['licitacao_id', 'fornecedor_id'])
export class HabilitacaoDispensa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  fornecedor_id: string;

  /** HABILITADO | INABILITADO */
  @Column({ type: 'varchar', length: 20 })
  resultado: string;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  /** Documentos conferidos (rótulos) — o que o agente marcou na conferência. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  conferidos: string[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  registrado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/**
 * NEGOCIAÇÃO DA DISPENSA (IN SEGES 67/2021, art. 16): contraproposta do órgão
 * ao vencedor do item; o fornecedor ACEITA ou RECUSA pelo sistema. Aceita, o
 * valor vira o adjudicado (homologação 08/11/2026: o valor combinado no chat
 * não tinha onde ser registrado e o contrato saía com o valor antigo).
 */
@Entity('negociacoes_dispensa')
@Index(['licitacao_id', 'item_licitacao_id'])
export class NegociacaoDispensa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  item_licitacao_id: string;

  @Column({ type: 'uuid' })
  fornecedor_id: string;

  @Column({ type: 'numeric', precision: 15, scale: 4 })
  valor_unitario: string;

  /** Valor unitário que estava adjudicado quando a contraproposta foi feita. */
  @Column({ type: 'numeric', precision: 15, scale: 4 })
  valor_anterior: string;

  /** PENDENTE | ACEITA | RECUSADA | CANCELADA */
  @Column({ type: 'varchar', length: 20, default: 'PENDENTE' })
  status: string;

  @Column({ type: 'text', nullable: true })
  mensagem: string | null;

  @Column({ type: 'text', nullable: true })
  motivo_recusa: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  proposta_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondida_em: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/**
 * SAÍDA DE UM FORNECEDOR DE UM ITEM da dispensa (pedido do dono, 11/11/2026):
 * a proposta é por item — preço inexequível, marca errada ou falta de
 * qualificação para UM item não pode tirar o fornecedor dos outros. Quem está
 * aqui não entra na classificação daquele item; o próximo é chamado só ali.
 */
@Entity('exclusoes_item_dispensa')
@Index(['licitacao_id', 'item_licitacao_id'])
export class ExclusaoItemDispensa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  item_licitacao_id: string;

  @Column({ type: 'uuid' })
  fornecedor_id: string;

  /** PROPOSTA (desclassificada no item) | HABILITACAO (inabilitado só no item) */
  @Column({ type: 'varchar', length: 20 })
  tipo: string;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  registrado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
