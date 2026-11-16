import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Roteiro do guia em andamento no órgão. Guarda só o começo e a demanda de
 * teste que o roteiro acompanha; os passos são deduzidos dos dados (ver
 * roteiro-guia.ts). Fica no servidor para que o usuário seguinte (outro
 * setor) veja o passo em que o roteiro parou.
 */
@Entity('guia_andamentos')
@Index('IDX_guia_andamentos_orgao', ['orgao_id', 'roteiro'])
export class GuiaAndamento {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) orgao_id: string;
  @Column({ type: 'varchar', length: 30 }) roteiro: string;
  @Column({ type: 'uuid', nullable: true }) demanda_id: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) iniciado_por_id: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) iniciado_em: Date;
  @Column({ type: 'timestamptz', nullable: true }) encerrado_em: Date | null;
}
