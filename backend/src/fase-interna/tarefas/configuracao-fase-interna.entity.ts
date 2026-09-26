import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

/**
 * Configuração da fase interna do órgão (Entrega 2). Uma linha por órgão;
 * sem linha, vale o padrão (`configEfetiva`): modo SIMPLES, controle interno
 * desativado, prazos da Portaria 089/2024 (Câmara de LEM) como modelo.
 */
@Entity('configuracoes_fase_interna')
export class ConfiguracaoFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'uuid', unique: true })
  orgao_id: string;

  /** SIMPLES (padrão: tudo para o responsável do processo) | POR_SETOR. */
  @Column({ type: 'varchar', length: 20, default: 'SIMPLES' })
  modo: string;

  /** Etapa de controle interno (entre o parecer e a publicação). */
  @Column({ type: 'boolean', default: false })
  controle_interno_ativo: boolean;

  /** Passo → { papel, setor_id } (modo POR_SETOR). */
  @Column({ type: 'jsonb', nullable: true })
  responsaveis: Record<string, { papel: string | null; setor_id: string | null }> | null;

  /** Passo → prazo em dias úteis (null = sem prazo). */
  @Column({ type: 'jsonb', nullable: true })
  prazos: Record<string, number | null> | null;

  /**
   * Quem assina a AUTORIZAÇÃO (etapa 6 — Entrega 3B). A autoridade pode ser
   * COLEGIADA (ex.: Mesa Diretora com 4 signatários: Presidente, Vice, 1º e 2º
   * Secretários): a autorização só fica pronta quando TODOS assinam. Vazio =
   * os usuários com o papel AUTORIDADE (ou os escolhidos no envio).
   */
  @Column({ type: 'jsonb', nullable: true })
  signatarios_autorizacao: Array<{ usuario_id: string; papel: string }> | null;

  /** Nome da autoridade nos despachos (ex.: "Mesa Diretora", "Prefeito Municipal"). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  autoridade_rotulo: string | null;

  /**
   * PADRÃO SUGERIDO para novas dispensas: com disputa de lances (true) ou só
   * recebimento de propostas (false). A regra é a ESCOLHA do agente no
   * processo (`licitacoes.dispensa_com_lances`); isto vale só enquanto ele não
   * escolhe. Entrega 5.
   */
  @Column({ type: 'boolean', default: true })
  dispensa_com_lances: boolean;

  /**
   * O regulamento local da Lei 14.133 adota a IN SEGES 67/2021 (disputa de
   * lances na dispensa)? Com true, a conformidade avisa (ATENÇÃO, DISP-01) a
   * dispensa escolhida SEM lances. Padrão false (sem aviso).
   */
  @Column({ type: 'boolean', default: false })
  regulamento_adota_in67: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  atualizado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  atualizado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
