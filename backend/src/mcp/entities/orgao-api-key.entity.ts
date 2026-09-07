import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

/**
 * Chave de integração do ÓRGÃO (MCP / agentes de IA). Somente leitura da
 * carteira de contratos do órgão. Guarda só o hash; o valor aparece uma vez.
 */
@Entity('orgao_api_keys')
export class OrgaoApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Index()
  @Column({ type: 'uuid' })
  orgao_id: string;

  /** Rótulo escolhido pelo gestor: "Copilot da Secretaria", "Agente de contratos"… */
  @Column({ type: 'varchar', length: 120 })
  nome: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key_hash: string;

  /** Primeiros caracteres da chave, para o gestor reconhecer na lista */
  @Column({ type: 'varchar', length: 12 })
  prefixo: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  criado_por: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  ultimo_uso: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revogada_em: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
