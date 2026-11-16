import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Canal do Teams do órgão: webhook do app "Workflows" ("Post to a channel
 * when a webhook request is received"), criado pelo próprio órgão dentro do
 * canal do Teams. A URL é segredo (quem a tiver posta no canal em nome do
 * órgão) — fica cifrada com o mesmo padrão de `whatsapp_token`/senha SMTP
 * (ver `common/crypto.util.ts`) e nunca é devolvida inteira pela API.
 */
@Entity('workflow_teams_canais')
@Index('idx_workflow_teams_canal_orgao', ['orgao_id'])
export class WorkflowTeamsCanal {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) orgao_id: string;
  @Column({ type: 'varchar', length: 160 }) nome: string;
  /** "ivHex:cipherHex" — ver `encryptText`/`decryptTextOrRaw`. */
  @Column({ type: 'text' }) webhook_url: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) criado_por_id: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at: Date;
}
