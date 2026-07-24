import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('whatsapp_agent_sessions')
export class WhatsappAgentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  phone: string;

  @Column({ default: 'INICIO', length: 50 })
  estado: string;

  @Column({ type: 'jsonb', nullable: true })
  dados: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  historico_ia: Array<{ role: string; content: string }>;

  @Column({ nullable: true })
  fornecedor_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  expires_at: Date;

  // ── Anti-loop / rate-limit (evita ficar respondendo em loop, ex.: IA-com-IA) ──
  /** Enquanto no futuro, o agente NÃO responde este número (pausa automática). */
  @Column({ type: 'timestamp', nullable: true })
  silenciado_ate: Date | null;

  /** Motivo da última pausa (loop de resposta repetida / excesso de mensagens). */
  @Column({ nullable: true, length: 40 })
  silenciado_motivo: string | null;

  /** Nº de vezes que a MESMA resposta foi enviada seguidas (detecção de loop). */
  @Column({ type: 'int', default: 0 })
  repeticoes_resposta: number;

  /** Hash da última resposta enviada (para comparar repetição). */
  @Column({ nullable: true, length: 64 })
  ultima_resposta_hash: string | null;

  /** Início da janela de rate-limit. */
  @Column({ type: 'timestamp', nullable: true })
  janela_inicio: Date | null;

  /** Contador de mensagens na janela atual (rate-limit). */
  @Column({ type: 'int', default: 0 })
  janela_contador: number;
}
