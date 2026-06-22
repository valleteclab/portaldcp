import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Fornecedor } from '../../fornecedores/entities/fornecedor.entity';
import { ItemContrato } from '../../almoxarifado/entities/item-contrato.entity';
import { DocumentoContrato } from './documento-contrato.entity';
import { TermoAditivo } from './termo-aditivo.entity';
import { Medicao } from './medicao.entity';

export enum TipoContrato {
  CONTRATO = 'CONTRATO',
  NOTA_EMPENHO = 'NOTA_EMPENHO',
  ORDEM_SERVICO = 'ORDEM_SERVICO',
  ORDEM_FORNECIMENTO = 'ORDEM_FORNECIMENTO',
  CARTA_CONTRATO = 'CARTA_CONTRATO',
  TERMO_ADESAO = 'TERMO_ADESAO',
  ATA_REGISTRO_PRECO = 'ATA_REGISTRO_PRECO'
}

export enum StatusContrato {
  RASCUNHO = 'RASCUNHO',
  AGUARDANDO_LIBERACAO = 'AGUARDANDO_LIBERACAO',
  VIGENTE = 'VIGENTE',
  ENCERRADO = 'ENCERRADO',
  VENCIDO = 'VENCIDO',
  RESCINDIDO = 'RESCINDIDO',
  SUSPENSO = 'SUSPENSO',
  CANCELADO = 'CANCELADO'
}

export enum CategoriaContrato {
  COMPRAS = 'COMPRAS',
  SERVICOS = 'SERVICOS',
  OBRAS = 'OBRAS',
  SERVICOS_ENGENHARIA = 'SERVICOS_ENGENHARIA',
  LOCACAO = 'LOCACAO',
  ALIENACAO = 'ALIENACAO'
}

export enum ModalidadeExecucao {
  ITEM_QUANTIDADE = 'ITEM_QUANTIDADE',     // Compras (padrão)
  MEDICAO = 'MEDICAO',                     // Obras/Engenharia
  CONTINUADO = 'CONTINUADO',               // Serviços mensais (limpeza, vigilância)
  LICENCA = 'LICENCA',                     // Software/SaaS
  ORDEM_SERVICO = 'ORDEM_SERVICO',         // Consultoria/Demanda
}

@Entity('contratos')
export class Contrato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Identificação
  @Column()
  numero_contrato: string; // Ex: "001/2024"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  // Relacionamentos
  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Licitacao, { nullable: true })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ nullable: true })
  licitacao_id: string;

  @ManyToOne(() => Fornecedor)
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  fornecedor_id: string;

  // Dados do Fornecedor (snapshot)
  @Column()
  fornecedor_cnpj: string;

  @Column()
  fornecedor_razao_social: string;

  // Classificação
  @Column({
    type: 'enum',
    enum: TipoContrato,
    default: TipoContrato.CONTRATO
  })
  tipo: TipoContrato;

  @Column({
    type: 'enum',
    enum: CategoriaContrato,
    default: CategoriaContrato.COMPRAS
  })
  categoria: CategoriaContrato;

  @Column({
    type: 'enum',
    enum: ModalidadeExecucao,
    default: ModalidadeExecucao.ITEM_QUANTIDADE
  })
  modalidade_execucao: ModalidadeExecucao;

  @Column({
    type: 'enum',
    enum: StatusContrato,
    default: StatusContrato.RASCUNHO
  })
  status: StatusContrato;

  // Objeto
  @Column({ type: 'text' })
  objeto: string;

  @Column({ type: 'text', nullable: true })
  objeto_detalhado: string;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_inicial: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_global: number; // Valor atualizado com aditivos

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_acrescimos: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_supressoes: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_executado_anterior: number;

  @Column({ type: 'date', nullable: true })
  data_renovacao_ciclo: Date; // data do ciclo mais recente; null = sem renovação de ciclo

  @Column({ type: 'text', nullable: true })
  observacao_ajuste: string;

  // Datas
  @Column({ type: 'date' })
  data_assinatura: Date;

  @Column({ type: 'date' })
  data_vigencia_inicio: Date;

  @Column({ type: 'date' })
  data_vigencia_fim: Date;

  @Column({ type: 'date', nullable: true })
  data_publicacao: Date;

  // Prazos
  @Column({ type: 'int', nullable: true })
  prazo_execucao_dias: number;

  @Column({ type: 'int', nullable: true })
  prazo_vigencia_meses: number;

  // Garantia
  @Column({ default: false })
  exige_garantia: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  percentual_garantia: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_garantia: number;

  @Column({ nullable: true })
  tipo_garantia: string; // Caução, Fiança, Seguro

  // Fiscal do Contrato
  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  @Column({ nullable: true })
  fiscal_matricula: string;

  // Gestor do Contrato
  @Column({ nullable: true })
  gestor_id: string;

  @Column({ nullable: true })
  gestor_nome: string;

  @Column({ nullable: true })
  gestor_matricula: string;

  // Engenheiro do Projeto (assina o boletim de medição quando exigido)
  @Column({ nullable: true })
  engenheiro_nome: string;

  @Column({ nullable: true })
  engenheiro_cpf: string;

  @Column({ nullable: true })
  engenheiro_crea: string;

  @Column({ nullable: true })
  engenheiro_whatsapp: string;

  /** Quando true, habilita a solicitação de assinatura do engenheiro na medição. */
  @Column({ default: false })
  exigir_assinatura_engenheiro_medicao: boolean;

  // Dotação Orçamentária
  @Column({ nullable: true })
  dotacao_orcamentaria: string;

  @Column({ nullable: true })
  fonte_recurso: string;

  @Column({ nullable: true })
  programa_trabalho: string;

  @Column({ nullable: true })
  elemento_despesa: string;

  // Amparo Legal
  @Column({ nullable: true })
  amparo_legal: string; // Ex: "Art. 75, II da Lei 14.133/2021"

  @Column({ nullable: true })
  numero_processo: string;

  /** Tipo/modalidade da licitação (ex: PREGAO_ELETRONICO). Usado quando contrato não tem licitação vinculada. */
  @Column({ nullable: true, length: 50 })
  modalidade_licitacao: string;

  // Documentos
  @Column({ nullable: true })
  arquivo_contrato: string; // Caminho do PDF

  // Integração PNCP
  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ type: 'int', nullable: true })
  ano_pncp: number;

  @Column({ type: 'int', nullable: true })
  sequencial_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  // Liberação para pedidos
  @Column({ nullable: true })
  liberado_por_id: string;

  @Column({ nullable: true })
  liberado_por_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  liberado_em: Date;

  /** Quando true, o boletim de medição exibe Execução Fiscal por quantidade (un, h, m) em vez de dias */
  @Column({ default: false })
  boletim_por_quantidade: boolean;

  /** Quando true, o campo "Período" do boletim exibe a competência gravada da medição em vez do intervalo de datas */
  @Column({ default: false })
  boletim_periodo_competencia: boolean;

  /** Quando false, os valores calculados (valor_mensal, valor_total) são truncados em vez de arredondados */
  @Column({ default: true })
  arredondar_calculo: boolean;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Auditoria
  @Column({ nullable: true })
  usuario_cadastro_id: string;

  @Column({ nullable: true })
  usuario_cadastro_nome: string;

  // Relações OneToMany
  @OneToMany(() => ItemContrato, item => item.contrato)
  itens: ItemContrato[];

  @OneToMany(() => DocumentoContrato, doc => doc.contrato)
  documentos: DocumentoContrato[];

  @OneToMany(() => TermoAditivo, termo => termo.contrato)
  termos_aditivos: TermoAditivo[];

  @OneToMany(() => Medicao, medicao => medicao.contrato)
  medicoes: Medicao[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
