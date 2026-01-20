/**
 * ============================================================================
 * ENTIDADE: CONFIGURAÇÃO DE APROVAÇÃO
 * ============================================================================
 * 
 * Define as regras de aprovação de requisições por órgão.
 * Cada órgão pode ter múltiplos níveis de aprovação baseados em:
 * - Valor da requisição (alçada)
 * - Perfil do aprovador
 * - Usuários específicos autorizados
 * 
 * Exemplo de configuração:
 * - Nível 1: Até R$ 5.000 - Qualquer usuário do almoxarifado
 * - Nível 2: R$ 5.001 a R$ 50.000 - Gestor do setor
 * - Nível 3: Acima de R$ 50.000 - Ordenador de despesa
 * 
 * ============================================================================
 */

import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum TipoAprovador {
  QUALQUER_USUARIO = 'QUALQUER_USUARIO',       // Qualquer usuário com acesso ao módulo
  PERFIL_ESPECIFICO = 'PERFIL_ESPECIFICO',     // Usuário com perfil específico (ADMIN, GESTOR, etc)
  USUARIO_ESPECIFICO = 'USUARIO_ESPECIFICO',   // Lista de usuários específicos
  GESTOR_SETOR = 'GESTOR_SETOR',               // Gestor do setor solicitante
}

@Entity('configuracoes_aprovacao')
export class ConfiguracaoAprovacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // RELACIONAMENTO COM ÓRGÃO
  // ============================================================================

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  // ============================================================================
  // CONFIGURAÇÃO DO NÍVEL
  // ============================================================================

  @Column({ type: 'int' })
  nivel: number; // 1, 2, 3... (ordem de prioridade)

  @Column()
  nome: string; // Ex: "Aprovação Básica", "Gestor", "Ordenador de Despesa"

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  // ============================================================================
  // CRITÉRIOS DE VALOR (ALÇADA)
  // ============================================================================

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_minimo: number; // Valor mínimo para este nível (0 = qualquer valor)

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_maximo: number | null; // Valor máximo (null = sem limite)

  // ============================================================================
  // QUEM PODE APROVAR
  // ============================================================================

  @Column({
    type: 'enum',
    enum: TipoAprovador,
    default: TipoAprovador.QUALQUER_USUARIO
  })
  tipo_aprovador: TipoAprovador;

  /**
   * Perfis que podem aprovar (se tipo_aprovador = PERFIL_ESPECIFICO)
   * Ex: ['ADMIN', 'GESTOR_ALMOXARIFADO']
   */
  @Column({ type: 'simple-array', nullable: true })
  perfis_permitidos: string[] | null;

  /**
   * IDs dos usuários que podem aprovar (se tipo_aprovador = USUARIO_ESPECIFICO)
   */
  @Column({ type: 'simple-array', nullable: true })
  usuarios_aprovadores_ids: string[] | null;

  // ============================================================================
  // REGRAS ADICIONAIS
  // ============================================================================

  /**
   * Impede que o solicitante aprove sua própria requisição
   */
  @Column({ default: true })
  bloquear_auto_aprovacao: boolean;

  /**
   * Exige justificativa ao aprovar
   */
  @Column({ default: false })
  exigir_justificativa_aprovacao: boolean;

  /**
   * Exige justificativa ao negar
   */
  @Column({ default: true })
  exigir_justificativa_negacao: boolean;

  /**
   * Notificar por email ao receber requisição para aprovação
   */
  @Column({ default: true })
  notificar_email_aprovador: boolean;

  /**
   * Notificar por email o solicitante sobre o resultado
   */
  @Column({ default: true })
  notificar_email_solicitante: boolean;

  // ============================================================================
  // STATUS
  // ============================================================================

  @Column({ default: true })
  ativo: boolean;

  // ============================================================================
  // AUDITORIA
  // ============================================================================

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
