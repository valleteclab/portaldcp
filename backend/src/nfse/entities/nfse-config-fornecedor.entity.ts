import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Configuração NFS-e por fornecedor.
 * Armazena as credenciais Spedy e os dados fiscais necessários
 * para emissão automática de Nota Fiscal de Serviço Eletrônica.
 *
 * O certificado digital A1 é configurado diretamente no painel da Spedy
 * (não armazenamos o .pfx aqui). O fornecedor nos fornece apenas a API key.
 */
@Entity('nfse_config_fornecedor')
export class NfseConfigFornecedor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ID do fornecedor no Portal DCP */
  @Column({ unique: true })
  fornecedor_id: string;

  /**
   * API Key da Spedy do fornecedor — armazenada criptografada (AES-256-CBC).
   * O fornecedor obtém esta chave em: Spedy > Minha empresa > Credenciais de API.
   */
  @Column({ type: 'text', nullable: true })
  spedy_api_key_encrypted: string | null;

  /**
   * Inscrição Municipal do fornecedor na prefeitura onde presta serviços.
   * Obrigatório para emissão de NFS-e.
   */
  @Column({ nullable: true })
  inscricao_municipal: string | null;

  /**
   * Regime tributário do fornecedor.
   * Valores: SIMPLES_NACIONAL | LUCRO_PRESUMIDO | LUCRO_REAL | MEI | ISENTO
   */
  @Column({ nullable: true })
  regime_tributario: string | null;

  /**
   * Código do item da Lista de Serviços (Anexo da LC 116/2003).
   * Exemplo: "14.01" (serviços de informática), "17.06" (propaganda), etc.
   */
  @Column({ nullable: true })
  item_lista_servico: string | null;

  /**
   * Código CNAE da atividade principal do fornecedor.
   * Exemplo: "6201500" (desenvolvimento de programas de computador)
   */
  @Column({ nullable: true })
  codigo_cnae: string | null;

  /**
   * Alíquota do ISS em % (ex: 2.00 para 2%).
   * Varia por município e tipo de serviço.
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  aliquota_iss: number | null;

  /**
   * Código IBGE do município onde o serviço é prestado.
   * Exemplo: 3550308 = São Paulo, 3304557 = Rio de Janeiro
   */
  @Column({ nullable: true })
  municipio_prestacao_codigo_ibge: string | null;

  /**
   * Próximo número de RPS a ser usado.
   * Incrementado automaticamente a cada NFS-e emitida.
   */
  @Column({ type: 'int', default: 1 })
  proximo_numero_rps: number;

  /**
   * Série do RPS (Recibo Provisório de Serviços).
   * Padrão: "RPS" ou "NFS" — verificar exigência do município.
   */
  @Column({ default: 'RPS' })
  serie_rps: string;

  /**
   * Feature flag: habilita NFS-e para este fornecedor (beta).
   * Apenas fornecedores com ativo=true podem usar a funcionalidade.
   */
  @Column({ default: false })
  ativo: boolean;

  /** Observações internas do administrador */
  @Column({ type: 'text', nullable: true })
  observacoes_admin: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
