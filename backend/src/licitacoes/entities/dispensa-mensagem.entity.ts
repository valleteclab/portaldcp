import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Chat da DISPENSA ELETRÔNICA — registrado nos autos (transparência).
 * Usado para avisos do órgão e para a NEGOCIAÇÃO pós-lances com o melhor
 * classificado (dever de negociar condições mais vantajosas), como no
 * modelo federal (Compras.gov / IN SEGES 67/2021).
 * Enquanto a janela de lances está aberta, a autoria dos fornecedores é
 * exibida de forma anônima (mascarada na leitura, preservada no registro).
 */
@Entity('dispensa_mensagens')
@Index(['licitacao_id', 'created_at'])
export class DispensaMensagem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 20 })
  autor_tipo: 'ORGAO' | 'FORNECEDOR';

  @Column({ type: 'uuid', nullable: true })
  fornecedor_id: string | null;

  /** Nome real registrado (auditoria); a leitura pode mascarar durante os lances */
  @Column({ type: 'varchar', length: 200 })
  autor_nome: string;

  @Column({ type: 'text' })
  mensagem: string;

  @CreateDateColumn()
  created_at: Date;
}
