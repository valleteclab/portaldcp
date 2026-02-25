import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { WhatsappMensagem } from './whatsapp-mensagem.entity';

@Entity('whatsapp_conversas')
export class WhatsappConversa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  orgao_id: string;

  @Column({ length: 30 })
  phone: string;

  @Column({ length: 150, nullable: true })
  nome_contato: string;

  @Column({ type: 'text', nullable: true })
  ultima_mensagem: string;

  @Column({ type: 'timestamptz', nullable: true })
  ultima_mensagem_em: Date;

  @Column({ type: 'int', default: 0 })
  mensagens_nao_lidas: number;

  @Column({ length: 20, default: 'ABERTA' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => WhatsappMensagem, m => m.conversa)
  mensagens: WhatsappMensagem[];
}
