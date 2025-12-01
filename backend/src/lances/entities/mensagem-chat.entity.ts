import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

@Entity('chat_mensagens')
export class MensagemChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  remetente: string; // Nome do Fornecedor ou "PREGOEIRO"

  @Column({ type: 'text' })
  conteudo: string;

  @Column({ default: false })
  is_pregoeiro: boolean; // Identifica se a mensagem é oficial

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;
}
