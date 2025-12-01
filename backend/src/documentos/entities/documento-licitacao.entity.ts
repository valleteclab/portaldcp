import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

export enum TipoDocumentoLicitacao {
  // Documentos da Fase Interna
  ETP = 'ETP', // Estudo Técnico Preliminar
  TERMO_REFERENCIA = 'TERMO_REFERENCIA',
  PROJETO_BASICO = 'PROJETO_BASICO',
  PESQUISA_PRECOS = 'PESQUISA_PRECOS',
  PARECER_JURIDICO = 'PARECER_JURIDICO',
  MATRIZ_RISCOS = 'MATRIZ_RISCOS',
  MAPA_RISCOS = 'MAPA_RISCOS',
  AUTORIZACAO = 'AUTORIZACAO',
  DOTACAO_ORCAMENTARIA = 'DOTACAO_ORCAMENTARIA',
  
  // Documentos da Fase Externa
  EDITAL = 'EDITAL',
  EDITAL_RETIFICADO = 'EDITAL_RETIFICADO',
  MINUTA_CONTRATO = 'MINUTA_CONTRATO',
  ANEXO = 'ANEXO',
  AVISO_LICITACAO = 'AVISO_LICITACAO',
  ESCLARECIMENTO = 'ESCLARECIMENTO',
  IMPUGNACAO_RESPOSTA = 'IMPUGNACAO_RESPOSTA',
  
  // Documentos da Sessão
  ATA_SESSAO = 'ATA_SESSAO',
  RELATORIO_JULGAMENTO = 'RELATORIO_JULGAMENTO',
  MAPA_COMPARATIVO = 'MAPA_COMPARATIVO',
  
  // Documentos de Habilitação
  PARECER_HABILITACAO = 'PARECER_HABILITACAO',
  
  // Documentos de Recurso
  RECURSO = 'RECURSO',
  CONTRARRAZOES = 'CONTRARRAZOES',
  DECISAO_RECURSO = 'DECISAO_RECURSO',
  
  // Documentos Finais
  TERMO_ADJUDICACAO = 'TERMO_ADJUDICACAO',
  TERMO_HOMOLOGACAO = 'TERMO_HOMOLOGACAO',
  ATA_REGISTRO_PRECO = 'ATA_REGISTRO_PRECO',
  CONTRATO = 'CONTRATO',
  
  // Outros
  OUTROS = 'OUTROS'
}

export enum StatusDocumento {
  RASCUNHO = 'RASCUNHO',
  PUBLICADO = 'PUBLICADO',
  REVOGADO = 'REVOGADO',
  SUBSTITUIDO = 'SUBSTITUIDO'
}

@Entity('documentos_licitacao')
export class DocumentoLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @Column({
    type: 'enum',
    enum: TipoDocumentoLicitacao
  })
  tipo: TipoDocumentoLicitacao;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  // Arquivo
  @Column()
  nome_arquivo: string;

  @Column()
  nome_original: string;

  @Column()
  caminho_arquivo: string;

  @Column()
  mime_type: string;

  @Column({ type: 'bigint' })
  tamanho_bytes: number;

  @Column({ nullable: true })
  hash_arquivo: string; // SHA256 para integridade

  // Versionamento
  @Column({ type: 'int', default: 1 })
  versao: number;

  @Column({ nullable: true })
  documento_anterior_id: string; // Referência à versão anterior

  // Status
  @Column({
    type: 'enum',
    enum: StatusDocumento,
    default: StatusDocumento.RASCUNHO
  })
  status: StatusDocumento;

  @Column({ default: false })
  publico: boolean; // Se pode ser visualizado publicamente

  // Metadados
  @Column({ nullable: true })
  numero_documento: string; // Ex: "Edital 001/2024"

  @Column({ type: 'timestamp', nullable: true })
  data_documento: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_publicacao: Date;

  // Responsável
  @Column({ nullable: true })
  usuario_upload_id: string;

  @Column({ nullable: true })
  usuario_upload_nome: string;

  // Integração PNCP
  @Column({ nullable: true })
  sequencial_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
