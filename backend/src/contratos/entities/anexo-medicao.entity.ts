/**
 * ============================================================================
 * ENTIDADE: ANEXO DE MEDIÇÃO
 * ============================================================================
 * 
 * Armazena fotos de evidência e documentos anexados a uma medição.
 * Pode ser enviado pelo fornecedor (fotos da obra, NF) ou pelo fiscal.
 * 
 * Tipos:
 * - FOTO: Evidência fotográfica da execução
 * - DOCUMENTO: PDF, relatório, nota fiscal digitalizada
 * 
 * ============================================================================
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Medicao } from './medicao.entity';

export enum TipoAnexoMedicao {
  FOTO = 'FOTO',
  DOCUMENTO = 'DOCUMENTO',
}

@Entity('anexos_medicao')
export class AnexoMedicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Medição
  @ManyToOne(() => Medicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicao_id' })
  medicao: Medicao;

  @Column()
  medicao_id: string;

  // Tipo do anexo
  @Column({
    type: 'enum',
    enum: TipoAnexoMedicao,
    default: TipoAnexoMedicao.FOTO,
  })
  tipo: TipoAnexoMedicao;

  // Dados do arquivo
  @Column()
  nome_original: string;

  @Column()
  nome_arquivo: string;

  @Column()
  mime_type: string;

  @Column({ type: 'int' })
  tamanho_bytes: number;

  @Column()
  url: string;

  // Descrição opcional (legenda da foto, título do documento)
  @Column({ type: 'text', nullable: true })
  descricao: string;

  // Quem enviou
  @Column({ nullable: true })
  enviado_por_id: string;

  @Column({ nullable: true })
  enviado_por_nome: string;

  @Column({ default: 'fornecedor' })
  origem: string; // 'fornecedor' ou 'fiscal'

  // Auditoria
  @CreateDateColumn()
  created_at: Date;
}
