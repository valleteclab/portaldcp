import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Orgao } from './orgao.entity';

@Entity('unidades_orgao')
export class UnidadeOrgao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Órgão
  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  // Código da unidade no PNCP (ex: "1", "2", "3")
  @Column()
  codigo_unidade: string;

  // Nome da unidade (ex: "Secretaria de Administração", "Secretaria de Saúde")
  @Column()
  nome: string;

  // Sigla da unidade (ex: "SEMAD", "SMS")
  @Column({ nullable: true })
  sigla: string;

  // CNPJ da unidade (se diferente do órgão principal)
  @Column({ nullable: true })
  cnpj: string;

  // Código UASG da unidade (se aplicável)
  @Column({ nullable: true })
  codigo_uasg: string;

  // Responsável pela unidade
  @Column({ nullable: true })
  responsavel_nome: string;

  @Column({ nullable: true })
  responsavel_cargo: string;

  @Column({ nullable: true })
  responsavel_email: string;

  @Column({ nullable: true })
  responsavel_telefone: string;

  // Endereço (se diferente do órgão)
  @Column({ nullable: true })
  endereco: string;

  // Status
  @Column({ default: true })
  ativo: boolean;

  // Se é a unidade principal/padrão
  @Column({ default: false })
  principal: boolean;

  // Dados do PNCP
  @Column({ nullable: true })
  pncp_codigo_ibge: string;

  @Column({ nullable: true })
  pncp_poder: string; // 'E' = Executivo, 'L' = Legislativo, 'J' = Judiciário

  @Column({ nullable: true })
  pncp_esfera: string; // 'M' = Municipal, 'E' = Estadual, 'F' = Federal

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
