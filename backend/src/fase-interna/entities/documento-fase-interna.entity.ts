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

  // Peças novas do catálogo (Entrega 1 — autos reais do PA 139/2025).
  // Equivalentes que JÁ existiam não foram duplicados (CATALOGO_PECAS):
  // despacho de autorização = AA; informação orçamentária = DO; parecer
  // jurídico = PJ; portaria de designação = DP (documento do órgão com
  // vigência, referenciado pelo processo); minuta do aviso = ME.
  RELATORIO_AGENTE = 'RAG', // relatório do agente de contratação (razão da escolha, preço, enquadramento)
  PARECER_FASE_EXTERNA = 'PJE', // parecer jurídico nº 2 — depois da sessão, antes da adjudicação
  MINUTA_CONTRATO = 'MC', // minuta do contrato (art. 92)
}

export enum StatusDocumento {
  PENDENTE = 'PENDENTE',
  EM_ELABORACAO = 'EM_ELABORACAO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  APROVADO = 'APROVADO',
  REPROVADO = 'REPROVADO',
  IMPORTADO = 'IMPORTADO', // Quando vem de outro sistema / anexado feito fora (origem ARQUIVO)
  AGUARDANDO_ASSINATURA = 'AGUARDANDO_ASSINATURA', // enviada aos signatários (portal de assinaturas)
  ASSINADO = 'ASSINADO', // todos os signatários assinaram (data = da assinatura)
  SUBSTITUIDO = 'SUBSTITUIDO', // versão anterior — nunca some (versao_atual = false)
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

  // === DADOS ESTRUTURADOS (Lei 14.133/2021) ===
  // JSON tipado por TipoDocumentoFaseInterna; permite validar conteúdo mínimo
  // Ver shared/types: EtpDados, TrDados, PesquisaPrecosDados, MatrizRiscosDados, etc.
  @Column({ type: 'jsonb', nullable: true })
  dados_estruturados: any;

  // === DOCUMENTO GERADO (PDF/DOCX) ===
  @Column({ nullable: true })
  arquivo_pdf_path: string;

  @Column({ nullable: true })
  arquivo_docx_path: string;

  @Column({ type: 'timestamp', nullable: true })
  data_geracao_arquivo: Date;

  // === ASSINATURA DIGITAL ===
  @Column({ type: 'jsonb', nullable: true })
  assinaturas: Array<{
    assinante_id: string;
    assinante_nome: string;
    assinante_cargo?: string;
    cpf?: string;
    tipo: 'ICP_BRASIL' | 'GOVBR' | 'INTERNA';
    data_assinatura: string;
    hash_documento: string;
  }>;

  @Column({ default: false })
  exige_assinatura: boolean;

  @Column({ default: false })
  totalmente_assinado: boolean;

  // === PUBLICAÇÃO PNCP ===
  @Column({ default: false })
  publicado_pncp: boolean;

  @Column({ nullable: true })
  pncp_id_externo: string;

  @Column({ type: 'timestamp', nullable: true })
  data_publicacao_pncp: Date;

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

  /**
   * Versão que ESTA substitui (o "substitui_documento_id" da SPEC — a coluna já
   * existia com este nome e foi reaproveitada, sem duplicar). A anterior fica
   * com status SUBSTITUIDO e versao_atual = false; nunca é apagada.
   */
  @Column({ nullable: true })
  versao_anterior_id: string;

  // === AUTOS: DATA DA PEÇA E FOLHAS (Entrega 1) ===
  /**
   * Data DA PEÇA (não do envio). Gerada e assinada no sistema: momento da
   * última assinatura (nunca digitada). Anexada (feita fora): informada por
   * quem anexa — obrigatória, não pode ser futura; a data do ENVIO fica em
   * `data_importacao`.
   */
  @Column({ type: 'timestamp', nullable: true })
  data_documento: Date | null;

  /** Número de páginas do PDF da peça (anexo ou gerado para assinatura). */
  @Column({ type: 'int', nullable: true })
  total_paginas: number | null;

  /**
   * Folhas nos autos, em sequência por processo — atribuídas quando a peça é
   * finalizada (anexo recebido ou assinatura concluída). Versões substituídas
   * guardam as suas (nos autos físicos elas continuam juntadas).
   */
  @Column({ type: 'int', nullable: true })
  folha_inicial: number | null;

  @Column({ type: 'int', nullable: true })
  folha_final: number | null;

  // === PEÇA ANEXADA (feita fora do sistema) ===
  /** Número da peça no órgão, ex.: "Parecer 167/2025". */
  @Column({ type: 'varchar', length: 120, nullable: true })
  numero_peca: string | null;

  /** Quem assinou a peça feita fora (informado por quem anexa). */
  @Column({ type: 'jsonb', nullable: true })
  signatarios_informados: Array<{ nome: string; cargo?: string | null }> | null;

  @Column({ type: 'text', nullable: true })
  observacao_anexo: string | null;

  /** Documento do ÓRGÃO referenciado (ex.: portaria de designação do exercício). */
  @Column({ type: 'uuid', nullable: true })
  documento_orgao_id: string | null;

  // === ASSINATURA COM VÁRIOS SIGNATÁRIOS (portal de assinaturas) ===
  /** documentos_assinatura.id — a peça fica ASSINADA quando TODOS assinam. */
  @Column({ type: 'uuid', nullable: true })
  documento_assinatura_id: string | null;

  /** Quem precisa assinar (papel = cargo no ato: Presidente, 1º Secretário...). */
  @Column({ type: 'jsonb', nullable: true })
  signatarios_exigidos: Array<{ usuario_id: string; nome: string; papel: string; email?: string | null }> | null;

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
