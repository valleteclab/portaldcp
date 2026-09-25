import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Alcance do feriado (art. 183, III — expediente do órgão). */
export enum AbrangenciaFeriado {
  NACIONAL = 'NACIONAL',
  ESTADUAL = 'ESTADUAL',
  MUNICIPAL = 'MUNICIPAL',
}

/**
 * CALENDÁRIO DE FERIADOS (plano E7a item 1). Uma linha por feriado/ponto
 * facultativo:
 *  - NACIONAL (orgao_id nulo): semeado no boot (`chave_sistema`);
 *  - ESTADUAL (orgao_id nulo, `uf`): cadastrado pelo administrador da plataforma
 *    — vale para os órgãos da UF;
 *  - do ÓRGÃO (orgao_id preenchido — municipal, ou estadual/ponto facultativo
 *    que só aquele órgão observa): cadastrado pelo próprio órgão; vale só para ele.
 * `data` = dia exato ('YYYY-MM-DD'); com `recorrente`, repete todo ano (dia/mês);
 * `movel` = calculado da Páscoa (Carnaval, Paixão de Cristo, Corpus Christi).
 * `ponto_facultativo`: só conta como dia sem expediente se o órgão o adotar
 * (`feriados_adotados`) — o do próprio órgão conta sempre (ele o cadastrou).
 */
@Entity('feriados')
@Index(['orgao_id'])
export class Feriado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  descricao: string;

  @Column({ type: 'date', nullable: true })
  data: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  movel: string | null;

  @Column({ type: 'boolean', default: false })
  recorrente: boolean;

  @Column({ type: 'varchar', length: 12, default: AbrangenciaFeriado.MUNICIPAL })
  abrangencia: AbrangenciaFeriado;

  @Column({ type: 'varchar', length: 2, nullable: true })
  uf: string | null;

  @Column({ type: 'uuid', nullable: true })
  orgao_id: string | null;

  /** Código IBGE do município (informativo — o vínculo que decide é o órgão). */
  @Column({ type: 'varchar', length: 7, nullable: true })
  codigo_ibge: string | null;

  @Column({ type: 'boolean', default: false })
  ponto_facultativo: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true })
  base_legal: string | null;

  /** Chave da semente do sistema (idempotência do boot); nula nos cadastrados. */
  @Column({ type: 'varchar', length: 40, nullable: true, unique: true })
  chave_sistema: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  criado_por: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** Ponto facultativo (nacional/estadual) adotado pelo órgão — passa a não ter expediente. */
@Entity('feriados_adotados')
@Index(['orgao_id', 'feriado_id'], { unique: true })
export class FeriadoAdotado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'uuid' })
  feriado_id: string;

  @CreateDateColumn()
  created_at: Date;
}
