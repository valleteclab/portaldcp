import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';

/**
 * LINK DO PAINEL PARA TV — acesso SOMENTE LEITURA do painel do setor de
 * licitação, sem login de usuário (a TV abre `/painel-tv/<token>`).
 *
 * O token (32 bytes aleatórios, 64 hex) aparece UMA vez, na geração; aqui fica
 * só o SHA-256. Revogado = `revogado_em` preenchido (a URL passa a 404, sem
 * dizer que existiu). Um órgão pode ter vários links (uma TV por setor).
 */
@Entity('painel_tv_links')
export class PainelTvLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Index()
  @Column({ type: 'uuid' })
  orgao_id: string;

  /** Nome dado pelo administrador ("TV da sala de licitações"). */
  @Column({ type: 'varchar', length: 80 })
  nome: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token_hash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  criado_por_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  criado_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  ultimo_acesso: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revogado_em: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  revogado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

/**
 * CONFIGURAÇÃO DO PAINEL PARA TV (uma linha por órgão; sem linha = padrão).
 * `janela_contratos_dias`: contratos vigentes que vencem em até N dias
 * (30, 60, 90 ou 120; padrão 90).
 */
@Entity('configuracoes_painel_tv')
export class ConfiguracaoPainelTv {
  @PrimaryColumn({ type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'int', default: 90 })
  janela_contratos_dias: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  atualizado_por_nome: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  atualizado_em: Date | null;
}
