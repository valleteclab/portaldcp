/**
 * Setor/Departamento do órgão.
 * Usado em requisições e ordens de serviço como setor solicitante.
 * Cada órgão tem sua própria configuração de setores.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Orgao } from './orgao.entity';

@Entity('setores')
@Unique(['orgao_id', 'codigo'])
export class Setor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  /** Código do setor (ex: DCOMP-001) - único por órgão */
  @Column({ length: 50 })
  codigo: string;

  /** Nome do setor (ex: Departamento de Compras) */
  @Column()
  nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
