import { Column, Entity, Generated, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RetratoComprovante } from './comprovantes.regras';

/**
 * Comprovante emitido ao fornecedor a cada ação na proposta ou nos anexos
 * (ver comprovantes.regras.ts). Guarda o RETRATO do que ficou gravado naquele
 * instante — o PDF é gerado a partir dele, sempre igual. Nunca é alterado.
 */
@Entity('comprovantes_fornecedor')
@Index(['licitacao_id', 'fornecedor_id'])
export class ComprovanteFornecedor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Sequência única, base do número de exibição (CP-AAAA-NNNNNN). */
  @Column({ type: 'int' })
  @Generated('increment')
  sequencia: number;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  fornecedor_id: string;

  /** Proposta a que se refere (o id permanece mesmo se ela for excluída). */
  @Column({ type: 'uuid', nullable: true })
  proposta_id: string | null;

  @Column({ type: 'varchar', length: 40 })
  tipo: string;

  /** O que foi feito, em uma frase (ex.: "Anexado alfa-cndt.pdf — CNDT"). */
  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'jsonb' })
  retrato: RetratoComprovante;

  /** SHA-256 de tipo + descrição + instante + retrato. */
  @Column({ type: 'varchar', length: 64 })
  codigo_verificacao: string;

  /** Instante da emissão (entra no código de verificação; gravado pelo serviço). */
  @Column({ type: 'timestamptz' })
  emitido_em: Date;
}
