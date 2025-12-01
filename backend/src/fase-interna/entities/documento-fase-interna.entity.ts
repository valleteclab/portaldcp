import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

/**
 * Tipos de Documentos da Fase Interna conforme Lei 14.133/2021
 */
export enum TipoDocumentoFaseInterna {
  // Planejamento (Art. 18)
  DOCUMENTO_FORMALIZACAO_DEMANDA = 'DFD',      // Art. 18, I
  ESTUDO_TECNICO_PRELIMINAR = 'ETP',           // Art. 18, §1º
  ANALISE_RISCOS = 'AR',                       // Art. 18, X
  TERMO_REFERENCIA = 'TR',                     // Art. 18, §1º, II
  PROJETO_BASICO = 'PB',                       // Para obras
  PROJETO_EXECUTIVO = 'PE',                    // Para obras
  
  // Pesquisa de Precos (Art. 23)
  PESQUISA_PRECOS = 'PP',
  MAPA_COMPARATIVO_PRECOS = 'MCP',
  
  // Pareceres
  PARECER_JURIDICO = 'PJ',                     // Art. 53
  PARECER_TECNICO = 'PT',
  
  // Autorizacoes
  AUTORIZACAO_ABERTURA = 'AA',
  DESIGNACAO_PREGOEIRO = 'DP',
  DESIGNACAO_EQUIPE_APOIO = 'DEA',
  
  // Edital
  MINUTA_EDITAL = 'ME',
  EDITAL_APROVADO = 'EA',
  ANEXOS_EDITAL = 'AE',
  
  // Outros
  JUSTIFICATIVA_CONTRATACAO = 'JC',
  DOTACAO_ORCAMENTARIA = 'DO',
  OUTROS = 'OUT',
}

export enum StatusDocumento {
  PENDENTE = 'PENDENTE',
  EM_ELABORACAO = 'EM_ELABORACAO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  APROVADO = 'APROVADO',
  REPROVADO = 'REPROVADO',
  IMPORTADO = 'IMPORTADO', // Quando vem de outro sistema
}

export enum OrigemDocumento {
  INTERNO = 'INTERNO',           // Criado no sistema
  IMPORTADO_PNCP = 'PNCP',       // Portal Nacional de Contratacoes Publicas
  IMPORTADO_COMPRASNET = 'COMPRASNET',
  IMPORTADO_ARQUIVO = 'ARQUIVO', // Upload manual
}

@Entity('documentos_fase_interna')
export class DocumentoFaseInterna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === RELACIONAMENTO ===
  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  // === IDENTIFICACAO ===
  @Column({ type: 'enum', enum: TipoDocumentoFaseInterna })
  tipo: TipoDocumentoFaseInterna;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  // === ARQUIVO ===
  @Column({ nullable: true })
  nome_arquivo: string;

  @Column({ nullable: true })
  caminho_arquivo: string;

  @Column({ nullable: true })
  tipo_mime: string;

  @Column({ type: 'bigint', nullable: true })
  tamanho_bytes: number;

  @Column({ nullable: true })
  hash_arquivo: string; // SHA-256 para integridade

  // === ORIGEM ===
  @Column({ type: 'enum', enum: OrigemDocumento, default: OrigemDocumento.INTERNO })
  origem: OrigemDocumento;

  @Column({ nullable: true })
  sistema_origem: string; // Nome do sistema de origem

  @Column({ nullable: true })
  id_externo: string; // ID no sistema de origem

  @Column({ type: 'timestamp', nullable: true })
  data_importacao: Date;

  // === STATUS E APROVACAO ===
  @Column({ type: 'enum', enum: StatusDocumento, default: StatusDocumento.PENDENTE })
  status: StatusDocumento;

  @Column({ nullable: true })
  aprovador_id: string;

  @Column({ nullable: true })
  aprovador_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  data_aprovacao: Date;

  @Column({ type: 'text', nullable: true })
  observacao_aprovacao: string;

  // === VERSAO ===
  @Column({ type: 'int', default: 1 })
  versao: number;

  @Column({ default: true })
  versao_atual: boolean;

  @Column({ nullable: true })
  versao_anterior_id: string;

  // === OBRIGATORIEDADE ===
  @Column({ default: false })
  obrigatorio: boolean;

  @Column({ type: 'int', nullable: true })
  ordem_exibicao: number;

  // === AUDITORIA ===
  @Column({ nullable: true })
  criado_por_id: string;

  @Column({ nullable: true })
  criado_por_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
