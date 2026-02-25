import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { WhatsappConversa } from './whatsapp-conversa.entity';

export type DirecaoMensagem = 'ENVIADA' | 'RECEBIDA';
export type StatusMensagem  = 'PENDENTE' | 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHA';

@Entity('whatsapp_mensagens')
export class WhatsappMensagem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  conversa_id: string;

  @ManyToOne(() => WhatsappConversa, c => c.mensagens)
  @JoinColumn({ name: 'conversa_id' })
  conversa: WhatsappConversa;

  @Column({ length: 10 })
  direcao: DirecaoMensagem;

  @Column({ type: 'text' })
  conteudo: string;

  @Column({ length: 20, default: 'PENDENTE' })
  status: StatusMensagem;

  @Column({ length: 150, nullable: true })
  zapi_message_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
