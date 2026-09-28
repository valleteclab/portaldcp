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

  /**
   * Chefe do setor (opcional) — usuário do MESMO órgão. Recebe o aviso de
   * chegada de todo processo tramitado para o setor (tramitação da fase
   * interna) e pode receber/devolver por ele.
   */
  @Column({ type: 'uuid', nullable: true })
  chefe_usuario_id: string | null;

  /**
   * Setor superior (hierarquia) — do MESMO órgão, sem ciclos (validado no
   * serviço). Nulo = topo da árvore. Usado pela cadeia de aprovação
   * ("chefe da secretaria requisitante" sobe a hierarquia).
   */
  @Column({ type: 'uuid', nullable: true })
  setor_superior_id: string | null;

  /**
   * Marca a SECRETARIA / unidade gestora (ex.: "Secretaria de Saúde"). A
   * secretaria de um setor é a marcada mais próxima subindo a árvore; sem
   * marca no caminho, o topo. Ver `hierarquia-setores.ts`.
   */
  @Column({ type: 'boolean', default: false })
  eh_unidade_superior: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
