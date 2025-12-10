/**
 * ============================================================================
 * ENTIDADE: LOTE DE LICITAÇÃO
 * ============================================================================
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * 
 * Art. 40, §3º - "O parcelamento será adotado quando técnica e economicamente 
 * viável, e deverá ser justificado quando não for adotado."
 * 
 * Art. 40, §1º - "Os itens de consumo que se enquadrem como de luxo deverão 
 * ser identificados e justificados no processo de contratação."
 * 
 * Decreto 11.462/2023 (Regulamenta o PCA):
 * "Os itens do PCA devem ser agrupados por categoria de contratação e 
 * natureza do objeto."
 * 
 * ============================================================================
 * 
 * CONCEITO:
 * Um LOTE agrupa itens de mesma natureza dentro de uma licitação, permitindo
 * que cada lote seja vinculado a um item específico do PCA.
 * 
 * EXEMPLO:
 * Licitação: "Aquisição de Equipamentos de TI e Gêneros Alimentícios"
 * 
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ LOTE 1: Equipamentos de Informática                                │
 * │ ├── Item 1: Notebook Dell - 10 un                                  │
 * │ ├── Item 2: Mouse sem fio - 20 un                                  │
 * │ └── PCA Vinculado: "Equipamentos de TI" (R$ 50.000,00)             │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ LOTE 2: Gêneros Alimentícios                                       │
 * │ ├── Item 3: Arroz tipo 1 - 100 kg                                  │
 * │ ├── Item 4: Feijão carioca - 50 kg                                 │
 * │ └── PCA Vinculado: "Alimentos e Bebidas" (R$ 10.000,00)            │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * ============================================================================
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';
import { ItemPCA } from '../../pca/entities/pca.entity';

@Entity('lotes_licitacao')
export class LoteLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Número sequencial do lote dentro da licitação
   * Exemplo: 1, 2, 3...
   */
  @Column({ type: 'int' })
  numero: number;

  /**
   * Descrição do lote
   * Deve refletir a natureza dos itens agrupados
   * 
   * Lei 14.133/2021, Art. 40, §3º:
   * "O parcelamento será adotado quando técnica e economicamente viável"
   * 
   * Exemplo: "Equipamentos de Informática", "Gêneros Alimentícios"
   */
  @Column({ type: 'varchar', length: 500 })
  descricao: string;

  /**
   * Referência à licitação pai
   */
  @ManyToOne(() => Licitacao, licitacao => licitacao.lotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /**
   * Vinculação com Item do PCA
   * 
   * Lei 14.133/2021, Art. 12, VII:
   * "As contratações públicas deverão submeter-se a práticas contínuas e 
   * permanentes de gestão de riscos e de controle preventivo, inclusive 
   * mediante adoção de recursos de tecnologia da informação, e, além de 
   * estar subordinadas ao controle social, sujeitar-se-ão às seguintes 
   * linhas de defesa: VII - o plano de contratações anual"
   * 
   * Quando o modo de vinculação é POR_LOTE, todos os itens deste lote
   * herdam automaticamente este item_pca_id.
   */
  @ManyToOne(() => ItemPCA, { nullable: true })
  @JoinColumn({ name: 'item_pca_id' })
  item_pca: ItemPCA;

  @Column({ type: 'uuid', nullable: true })
  item_pca_id: string;

  /**
   * Flag para indicar se o lote não possui vinculação com PCA
   * 
   * Lei 14.133/2021, Art. 12, §1º:
   * "A não observância do disposto no inciso VII do caput deste artigo 
   * deverá ser justificada pelo ordenador de despesa"
   * 
   * Se true, justificativa_sem_pca é OBRIGATÓRIA
   */
  @Column({ type: 'boolean', default: false })
  sem_pca: boolean;

  /**
   * Justificativa para lote sem vinculação ao PCA
   * 
   * OBRIGATÓRIA quando sem_pca = true
   * 
   * Lei 14.133/2021, Art. 12, §1º:
   * "A não observância do disposto no inciso VII do caput deste artigo 
   * deverá ser justificada pelo ordenador de despesa"
   * 
   * Exemplos de justificativas válidas:
   * - "Contratação emergencial não prevista no planejamento anual"
   * - "Demanda surgida após aprovação do PCA do exercício"
   * - "Necessidade decorrente de situação imprevisível"
   */
  @Column({ type: 'text', nullable: true })
  justificativa_sem_pca: string;

  /**
   * Itens pertencentes a este lote
   */
  @OneToMany(() => ItemLicitacao, item => item.lote)
  itens: ItemLicitacao[];

  /**
   * Valor total estimado do lote
   * Calculado como soma de (quantidade * valor_unitario) de todos os itens
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total_estimado: number;

  /**
   * Valor total homologado do lote (após conclusão do certame)
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_homologado: number;

  /**
   * Quantidade de itens no lote
   */
  @Column({ type: 'int', default: 0 })
  quantidade_itens: number;

  /**
   * Status do lote
   * - RASCUNHO: Em elaboração
   * - ATIVO: Lote válido e ativo
   * - DESERTO: Nenhuma proposta recebida
   * - FRACASSADO: Propostas inabilitadas/desclassificadas
   * - CANCELADO: Lote cancelado
   * - HOMOLOGADO: Lote homologado com vencedor
   */
  @Column({
    type: 'varchar',
    length: 20,
    default: 'RASCUNHO'
  })
  status: 'RASCUNHO' | 'ATIVO' | 'DESERTO' | 'FRACASSADO' | 'CANCELADO' | 'HOMOLOGADO';

  /**
   * Observações adicionais sobre o lote
   */
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  /**
   * Critério de julgamento específico do lote (se diferente da licitação)
   * 
   * Lei 14.133/2021, Art. 33:
   * "O julgamento das propostas será realizado de acordo com os seguintes 
   * critérios: I - menor preço; II - maior desconto; III - melhor técnica 
   * ou conteúdo artístico; IV - técnica e preço; V - maior lance; 
   * VI - maior retorno econômico"
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  criterio_julgamento: string;

  /**
   * Indica se o lote é exclusivo para ME/EPP
   * 
   * Lei Complementar 123/2006, Art. 48:
   * "Para o cumprimento do disposto no art. 47 desta Lei Complementar, 
   * a administração pública: I - deverá realizar processo licitatório 
   * destinado exclusivamente à participação de microempresas e empresas 
   * de pequeno porte nos itens de contratação cujo valor seja de até 
   * R$ 80.000,00 (oitenta mil reais)"
   */
  @Column({ type: 'boolean', default: false })
  exclusivo_mpe: boolean;

  /**
   * Percentual de cota reservada para ME/EPP (se aplicável)
   * 
   * Lei Complementar 123/2006, Art. 48, III:
   * "III - deverá estabelecer, em certames para aquisição de bens de 
   * natureza divisível, cota de até 25% (vinte e cinco por cento) do 
   * objeto para a contratação de microempresas e empresas de pequeno porte"
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  percentual_cota_reservada: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
