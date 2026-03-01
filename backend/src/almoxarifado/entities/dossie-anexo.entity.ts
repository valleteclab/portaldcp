import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DossieOrdem } from './dossie-ordem.entity';

@Entity('dossies_anexo')
export class DossieAnexo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  dossie_ordem_id: string;

  @ManyToOne(() => DossieOrdem, (d) => d.anexos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossie_ordem_id' })
  dossie_ordem: DossieOrdem;

  @Column({ length: 255 })
  nome_arquivo: string;

  @Column({ length: 500 })
  caminho: string;

  @Column({ length: 100 })
  tipo_mime: string;

  @Column()
  usuario_upload_id: string;

  @Column({ length: 255 })
  usuario_upload_nome: string;

  @CreateDateColumn()
  created_at: Date;
}
