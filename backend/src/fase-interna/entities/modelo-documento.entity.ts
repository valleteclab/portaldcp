import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TipoDocumentoFaseInterna } from './documento-fase-interna.entity';

/**
 * Seção de um modelo de documento.
 * `texto_padrao` aceita variáveis no formato {{caminho}} resolvidas ao instanciar:
 * {{orgao.nome}}, {{orgao.cnpj}}, {{licitacao.numero_processo}}, {{licitacao.objeto}},
 * {{licitacao.modalidade}}, {{licitacao.valor_estimado}}, {{data_atual}}, {{responsavel.nome}}
 */
export interface SecaoModelo {
  /** Chave no JSON de dados_estruturados */
  id: string;
  titulo: string;
  placeholder?: string;
  /** Conteúdo pré-preenchido (HTML) com variáveis {{...}} */
  texto_padrao?: string;
  obrigatorio: boolean;
  fundamento_legal?: string;
  rows?: number;
}

/**
 * Modelo de documento da fase interna, personalizável por órgão (estilo SEI).
 *
 * Resolução ao criar documento: modelo ativo do órgão para o tipo → modelo padrão
 * do sistema (orgao_id IS NULL). Órgãos personalizam duplicando o padrão.
 */
@Entity('modelos_documento')
@Index(['orgao_id', 'tipo'])
export class ModeloDocumento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NULL = modelo padrão do sistema (não editável pelos órgãos) */
  @Column({ nullable: true })
  orgao_id: string;

  @Column({ type: 'enum', enum: TipoDocumentoFaseInterna })
  tipo: TipoDocumentoFaseInterna;

  @Column()
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  /** Ex.: "Art. 18, §1º · Lei 14.133/2021" */
  @Column({ nullable: true })
  fundamento_legal: string;

  /** Texto introdutório exibido no editor */
  @Column({ type: 'text', nullable: true })
  intro: string;

  /** Cabeçalho do documento gerado (HTML; aceita variáveis {{...}}) */
  @Column({ type: 'text', nullable: true })
  cabecalho_html: string;

  /** Rodapé do documento gerado (HTML; aceita variáveis {{...}}) */
  @Column({ type: 'text', nullable: true })
  rodape_html: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  secoes: SecaoModelo[];

  /** Modelo criado no seed do sistema (protegido contra edição/exclusão) */
  @Column({ default: false })
  padrao_sistema: boolean;

  @Column({ default: true })
  ativo: boolean;

  @Column({ type: 'int', default: 1 })
  versao: number;

  @Column({ nullable: true })
  criado_por_id: string;

  @Column({ nullable: true })
  criado_por_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
