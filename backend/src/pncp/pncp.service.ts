import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { PncpSync, TipoSincronizacao, StatusSincronizacao } from './entities/pncp-sync.entity';
import { Licitacao, SituacaoLicitacao } from '../licitacoes/entities/licitacao.entity';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao, atorSistema } from '../licitacoes/transicoes/transicoes.tipos';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';
import { PlanoContratacaoAnual } from '../pca/entities/pca.entity';
import { SystemConfigService } from '../system-config/system-config.service';
import { Orgao } from '../orgaos/entities/orgao.entity';
import {
  ItemCompraPncp,
  PncpResponseDto,
  MODALIDADE_SISTEMA_PARA_PNCP,
} from './dto/pncp.dto';
import { BeneficioParaPncp, ItemParaPncp, LicitacaoParaPncp, instrumentoConvocatorioId, montarCompra, montarItemCompra } from './mapeamento-pncp';
import { ErroPncp, naturezaDaFalhaHttp } from './fila/regras-fila';
import { STATUS_DE_ERRO, STATUS_PROCESSAVEIS } from './fila/regras-fila';
import { registrarCompraExistente } from './estado-compra-pncp';
import { comoErro } from '../common/erros';

@Injectable()
export class PncpService implements OnModuleInit {
  private readonly logger = new Logger(PncpService.name);
  private axiosInstance: AxiosInstance;
  private token: string = '';
  private tokenExpiration: Date | null = null;

  // Credenciais da plataforma armazenadas em memória (cache)
  private static platformCredentials = {
    apiUrl: '',
    login: '',
    senha: '',
    cnpjOrgao: ''
  };

  constructor(
    @InjectRepository(PncpSync)
    private pncpSyncRepository: Repository<PncpSync>,
    @InjectRepository(Licitacao)
    private licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(PlanoContratacaoAnual)
    private pcaRepository: Repository<PlanoContratacaoAnual>,
    @InjectRepository(Orgao)
    private orgaoRepository: Repository<Orgao>,
    private configService: ConfigService,
    private systemConfigService: SystemConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly transicoes: TransicoesService,
  ) {
    // Debug: verificar se as variáveis estão sendo lidas
    this.logger.log(`[INIT] ConfigService PNCP_LOGIN: ${this.configService.get('PNCP_LOGIN') ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    this.logger.log(`[INIT] process.env PNCP_LOGIN: ${process.env.PNCP_LOGIN ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    this.logger.log(`[INIT] process.env PNCP_API_URL: ${process.env.PNCP_API_URL || 'NÃO DEFINIDO'}`);
    this.initializeAxios();
  }

  /**
   * Carrega as credenciais do banco de dados quando o módulo inicializa
   * Isso garante que as credenciais configuradas no admin sejam carregadas após restart
   */
  async onModuleInit() {
    await this.loadCredentialsFromDatabase();
  }

  /**
   * Carrega as credenciais do banco de dados para a memória
   * Prioridade: 1) Banco de dados, 2) Variáveis de ambiente
   */
  private async loadCredentialsFromDatabase(): Promise<void> {
    try {
      const dbCredentials = await this.systemConfigService.getPncpCredentials();
      
      // Prioridade: Banco > Variáveis de ambiente
      const apiUrl = dbCredentials.apiUrl || this.getEnvVar('PNCP_API_URL') || '';
      const login = dbCredentials.login || this.getEnvVar('PNCP_LOGIN') || '';
      const senha = dbCredentials.senha || this.getEnvVar('PNCP_SENHA') || '';
      const cnpjOrgao = dbCredentials.cnpjOrgao || this.getEnvVar('PNCP_CNPJ_ORGAO') || '';

      if (apiUrl) {
        PncpService.platformCredentials.apiUrl = apiUrl;
      }
      if (login) {
        PncpService.platformCredentials.login = login;
      }
      if (senha) {
        PncpService.platformCredentials.senha = senha;
      }
      if (cnpjOrgao) {
        PncpService.platformCredentials.cnpjOrgao = cnpjOrgao;
      }

      const hasCredentials = !!(apiUrl && login && senha);
      const source = dbCredentials.apiUrl ? 'banco de dados' : 'variáveis de ambiente';
      this.logger.log(`[INIT] Credenciais PNCP carregadas de: ${source} (configurado: ${hasCredentials ? 'SIM' : 'NÃO'})`);
      
      // Reinicializar axios com a URL se disponível
      if (apiUrl) {
        this.initializeAxiosWithUrl(apiUrl);
      }
    } catch (error) {
      this.logger.error(`[INIT] Erro ao carregar credenciais PNCP: ${error.message}`);
      
      // Fallback: usar variáveis de ambiente
      const apiUrl = this.getEnvVar('PNCP_API_URL') || '';
      const login = this.getEnvVar('PNCP_LOGIN') || '';
      const senha = this.getEnvVar('PNCP_SENHA') || '';
      const cnpjOrgao = this.getEnvVar('PNCP_CNPJ_ORGAO') || '';

      if (apiUrl) PncpService.platformCredentials.apiUrl = apiUrl;
      if (login) PncpService.platformCredentials.login = login;
      if (senha) PncpService.platformCredentials.senha = senha;
      if (cnpjOrgao) PncpService.platformCredentials.cnpjOrgao = cnpjOrgao;

      const hasEnvCredentials = !!(apiUrl && login && senha);
      this.logger.log(`[INIT] Fallback para variáveis de ambiente: ${hasEnvCredentials ? 'SIM' : 'NÃO'}`);
      
      if (apiUrl) {
        this.initializeAxiosWithUrl(apiUrl);
      }
    }
  }

  // Helper para obter variáveis de ambiente
  // Prioriza process.env pois o dotenv é carregado no main.ts antes do NestJS
  private getEnvVar(key: string): string | undefined {
    return process.env[key] || this.configService.get<string>(key);
  }

  // ============ CREDENCIAIS DA PLATAFORMA ============

  async setPlatformCredentials(credentials: {
    apiUrl?: string;
    login?: string;
    senha?: string;
    cnpjOrgao?: string;
  }): Promise<void> {
    // Atualizar memória (cache)
    if (credentials.apiUrl !== undefined) {
      PncpService.platformCredentials.apiUrl = credentials.apiUrl;
    }
    if (credentials.login !== undefined) {
      PncpService.platformCredentials.login = credentials.login;
    }
    if (credentials.senha !== undefined) {
      PncpService.platformCredentials.senha = credentials.senha;
    }
    if (credentials.cnpjOrgao !== undefined) {
      PncpService.platformCredentials.cnpjOrgao = credentials.cnpjOrgao;
    }
    
    // Reinicializar axios com nova URL se fornecida
    if (credentials.apiUrl) {
      this.initializeAxiosWithUrl(credentials.apiUrl);
    }
    
    // Limpar token para forçar novo login
    this.token = '';
    this.tokenExpiration = null;
    
    // PERSISTIR NO BANCO DE DADOS para sobreviver a restarts
    try {
      await this.systemConfigService.setPncpCredentials(credentials);
      this.logger.log('[PLATFORM] Credenciais da plataforma salvas no banco de dados');
    } catch (error) {
      // Antes o erro só ia para o log e a tela dizia "salvas com sucesso" — a
      // credencial sumia no próximo restart sem ninguém perceber.
      this.logger.error(`[PLATFORM] Erro ao salvar credenciais no banco: ${error.message}`);
      throw new HttpException(
        `Credenciais não foram salvas: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log('[PLATFORM] Credenciais da plataforma atualizadas');
  }

  getPlatformCredentials(): {
    apiUrl: string | null;
    login: string | null;
    cnpjOrgao: string | null;
    configured: boolean;
  } {
    return {
      apiUrl: PncpService.platformCredentials.apiUrl || null,
      login: PncpService.platformCredentials.login || null,
      cnpjOrgao: PncpService.platformCredentials.cnpjOrgao || null,
      configured: !!(
        PncpService.platformCredentials.apiUrl && 
        PncpService.platformCredentials.login && 
        PncpService.platformCredentials.senha && 
        PncpService.platformCredentials.cnpjOrgao
      )
    };
  }

  async testPlatformConnection(): Promise<{
    sucesso: boolean;
    mensagem: string;
  }> {
    const creds = PncpService.platformCredentials;
    
    // Usar credenciais da plataforma ou fallback para env vars
    const apiUrl = creds.apiUrl || this.getEnvVar('PNCP_API_URL') || '';
    const login = creds.login || this.getEnvVar('PNCP_LOGIN') || '';
    const senha = creds.senha || this.getEnvVar('PNCP_SENHA') || '';
    
    if (!apiUrl || !login || !senha) {
      return {
        sucesso: false,
        mensagem: 'Credenciais PNCP não configuradas'
      };
    }

    try {
      this.logger.log(`[TEST] Testando conexão com PNCP: ${apiUrl}`);
      
      const response = await axios.post(
        `${apiUrl}/usuarios/login`,
        { login, senha },
        {
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (response.data.token || response.headers.authorization) {
        return {
          sucesso: true,
          mensagem: 'Conexão com PNCP testada com sucesso!'
        };
      } else {
        return {
          sucesso: false,
          mensagem: 'Resposta inesperada do PNCP'
        };
      }
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      this.logger.error('Erro ao testar conexão PNCP:', error.response?.data || error.message);
      return {
        sucesso: false,
        mensagem: `Erro na conexão: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`
      };
    }
  }

  private initializeAxios() {
    const baseURL = this.getEnvVar('PNCP_API_URL') || 'https://treina.pncp.gov.br/api/pncp/v1';
    this.initializeAxiosWithUrl(baseURL);
  }

  /**
   * Base do portal público do PNCP (links /app/...), derivada do ambiente
   * configurado em PNCP_API_URL — treina.pncp.gov.br ou pncp.gov.br.
   * Fonte única: ao virar produção, basta trocar PNCP_API_URL.
   */
  private getPortalBaseUrl(): string {
    return this.configService.get<string>('PNCP_API_URL')?.includes('treina')
      ? 'https://treina.pncp.gov.br'
      : 'https://pncp.gov.br';
  }

  /**
   * O CNPJ jurídico do cadastro local não deve ser sobrescrito quando um
   * órgão é associado a um ente de homologação (ou a outro ente autorizado).
   * pncp_cnpj_orgao guarda exclusivamente a identidade usada nas APIs PNCP.
   */
  private obterCnpjPncpDoOrgao(orgao?: Partial<Orgao> | null): string {
    return String(orgao?.pncp_cnpj_orgao || orgao?.cnpj || '')
      .replace(/\D/g, '');
  }

  /**
   * CNPJ usado numa operação crua do PNCP: o do escopo (órgão da rota) ou, só
   * para o admin da plataforma, o padrão `PNCP_CNPJ_ORGAO`.
   */
  private cnpjDaOperacao(cnpjEscopo?: string | null): string {
    const cnpj = String(cnpjEscopo || this.configService.get<string>('PNCP_CNPJ_ORGAO') || '').replace(/\D/g, '');
    if (!cnpj) throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    return cnpj;
  }

  /**
   * CNPJ do PNCP do órgão (E9 — escopo das rotas cruas de `/api/pncp`): o
   * órgão só opera compras, atas, contratos e PCAs sob o PRÓPRIO CNPJ no PNCP.
   * O órgão de teste (12.345.678/0001-99) usa o CNPJ padrão da plataforma,
   * como no envio do PCA.
   */
  async cnpjPncpDoOrgaoId(orgaoId: string): Promise<string> {
    const orgao = await this.orgaoRepository.findOne({ where: { id: orgaoId } });
    if (!orgao) throw new HttpException('Órgão não encontrado', HttpStatus.NOT_FOUND);
    const cnpj = this.obterCnpjPncpDoOrgao(orgao);
    if (cnpj === '12345678000199') return this.cnpjDaOperacao(null);
    if (!cnpj) throw new HttpException('CNPJ do órgão não cadastrado', HttpStatus.BAD_REQUEST);
    return cnpj;
  }

  /** Base da API pública de consulta, no mesmo ambiente de PNCP_API_URL. */
  private getConsultaBaseUrl(): string {
    return `${this.getPortalBaseUrl()}/api/consulta/v1`;
  }

  private initializeAxiosWithUrl(baseURL: string) {
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 60000, // 60 segundos para operações do PNCP
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Interceptor para adicionar token
    this.axiosInstance.interceptors.request.use(async (config) => {
      const token = await this.getValidToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Interceptor para log de erros
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.logger.error(`Erro PNCP: ${error.message}`, {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data
        });
        throw error;
      }
    );
  }

  // ============ AUTENTICAÇÃO ============

  private async login(request?: any): Promise<string> {
    // Prioridade: 1) Credenciais da plataforma, 2) Variáveis de ambiente, 3) Headers da requisição
    let apiUrl = PncpService.platformCredentials.apiUrl || this.getEnvVar('PNCP_API_URL') || '';
    let login = PncpService.platformCredentials.login || this.getEnvVar('PNCP_LOGIN');
    let senha = PncpService.platformCredentials.senha || this.getEnvVar('PNCP_SENHA');

    // Debug: mostrar todos os headers recebidos
    if (request) {
      this.logger.log(`[LOGIN DEBUG] Headers recebidos:`, Object.keys(request.headers));
      this.logger.log(`[LOGIN DEBUG] Headers relevantes:`, {
        'x-pncp-api-url': request.headers['x-pncp-api-url'],
        'x-pncp-login': request.headers['x-pncp-login'],
        'x-pncp-senha': request.headers['x-pncp-senha'],
        'x-pncp-cnpj-orgao': request.headers['x-pncp-cnpj-orgao']
      });
    }

    // Se não tiver nas credenciais da plataforma nem no env, tentar dos headers da requisição
    if (request && !login && !senha) {
      apiUrl = request.headers['x-pncp-api-url'] || apiUrl;
      login = request.headers['x-pncp-login'];
      senha = request.headers['x-pncp-senha'];
    }

    this.logger.log(`[LOGIN] Usando credenciais - ApiUrl: ${apiUrl?.substring(0, 30)}..., Login: ${!!login}, Senha: ${!!senha}, UsouPlatform: ${!!PncpService.platformCredentials.login}`);

    if (!login || !senha) {
      this.logger.error(`Credenciais PNCP não configuradas. Login: ${!!login}, Senha: ${!!senha}, ApiUrl: ${!!apiUrl}`);
      throw new HttpException('Credenciais PNCP não configuradas', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      // Criar instância axios dinâmica para usar a URL correta
      const dynamicAxios = axios.create({
        baseURL: apiUrl,
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const response = await dynamicAxios.post(
        `/usuarios/login`,
        { login, senha }
      );

      const tokenFromHeader = response.headers['authorization']?.replace('Bearer ', '');
      this.token = tokenFromHeader || response.data.token || '';
      // Token expira em 1 hora, renovar antes
      this.tokenExpiration = new Date(Date.now() + 55 * 60 * 1000);
      
      // Reconfigurar axios instance com a nova URL se veio dos headers
      if (request && request.headers['x-pncp-api-url']) {
        this.initializeAxiosWithUrl(apiUrl);
      }
      
      this.logger.log('Login PNCP realizado com sucesso');
      return this.token;
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      this.logger.error('Erro ao fazer login no PNCP', error.response?.data || error.message);
      // Distinguir REDE de CREDENCIAL — um timeout aparecia como "falha na
      // autenticação" e mascarava a causa real (ex.: instabilidade do treina).
      const detalhe = error.code
        ? `rede: ${error.code}`
        : error.response?.status
          ? `HTTP ${error.response.status}`
          : error.message?.slice(0, 80) || 'erro desconhecido';
      throw new HttpException(`Falha na autenticação PNCP (${detalhe})`, HttpStatus.UNAUTHORIZED);
    }
  }

  async getValidToken(): Promise<string> {
    if (!this.token || !this.tokenExpiration || new Date() >= this.tokenExpiration) {
      await this.login();
    }
    return this.token;
  }

  async getValidTokenWithRequest(request: any): Promise<string> {
    if (!this.token || !this.tokenExpiration || new Date() >= this.tokenExpiration) {
      await this.login(request);
    }
    return this.token;
  }

  // ============ VALIDAÇÃO/CHECKLIST PNCP ============

  async validarLicitacaoParaPNCP(licitacaoId: string): Promise<{
    valido: boolean;
    erros: string[];
    avisos: string[];
    checklist: { campo: string; status: 'ok' | 'erro' | 'aviso'; mensagem: string }[];
    dadosEnvio?: any;
  }> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens']
    });

    if (!licitacao) {
      return {
        valido: false,
        erros: ['Licitação não encontrada'],
        avisos: [],
        checklist: [{ campo: 'licitacao', status: 'erro', mensagem: 'Licitação não encontrada' }]
      };
    }

    const erros: string[] = [];
    const avisos: string[] = [];
    const checklist: { campo: string; status: 'ok' | 'erro' | 'aviso'; mensagem: string }[] = [];

    // === DADOS DO ÓRGÃO ===
    if (this.obterCnpjPncpDoOrgao(licitacao.orgao)) {
      const cnpjLimpo = this.obterCnpjPncpDoOrgao(licitacao.orgao);
      if (cnpjLimpo.length === 14) {
        checklist.push({ campo: 'CNPJ do Órgão', status: 'ok', mensagem: `CNPJ: ${cnpjLimpo}` });
      } else {
        erros.push('CNPJ do órgão inválido (deve ter 14 dígitos)');
        checklist.push({ campo: 'CNPJ do Órgão', status: 'erro', mensagem: 'CNPJ inválido' });
      }
    } else {
      erros.push('Órgão não possui CNPJ cadastrado');
      checklist.push({ campo: 'CNPJ do Órgão', status: 'erro', mensagem: 'CNPJ não cadastrado' });
    }

    // === UNIDADE COMPRADORA (PNCP) ===
    if (licitacao.orgao?.pncp_codigo_unidade) {
      checklist.push({ campo: 'Unidade PNCP', status: 'ok', mensagem: `Código: ${licitacao.orgao.pncp_codigo_unidade}` });
    } else {
      erros.push('Código da unidade PNCP não configurado no órgão. Configure em Configurações > PNCP.');
      checklist.push({ campo: 'Unidade PNCP', status: 'erro', mensagem: 'Código da unidade não configurado' });
    }

    // === DADOS BÁSICOS ===
    if (licitacao.numero_processo) {
      checklist.push({ campo: 'Número do Processo', status: 'ok', mensagem: licitacao.numero_processo });
    } else {
      erros.push('Número do processo é obrigatório');
      checklist.push({ campo: 'Número do Processo', status: 'erro', mensagem: 'Não informado' });
    }

    if (licitacao.objeto && licitacao.objeto.length >= 10) {
      checklist.push({ campo: 'Objeto', status: 'ok', mensagem: `${licitacao.objeto.substring(0, 50)}...` });
    } else {
      erros.push('Objeto da licitação é obrigatório (mínimo 10 caracteres)');
      checklist.push({ campo: 'Objeto', status: 'erro', mensagem: 'Objeto não informado ou muito curto' });
    }

    // === MODALIDADE ===
    // Fonte única: o mesmo dicionário usado no mapeamento do envio
    // (antes era uma lista hardcoded que não conhecia DISPENSA_ELETRONICA).
    const modalidadesValidas = Object.keys(MODALIDADE_SISTEMA_PARA_PNCP);
    if (modalidadesValidas.includes(licitacao.modalidade)) {
      checklist.push({ campo: 'Modalidade', status: 'ok', mensagem: licitacao.modalidade });
    } else {
      erros.push(`Modalidade inválida: ${licitacao.modalidade}`);
      checklist.push({ campo: 'Modalidade', status: 'erro', mensagem: 'Modalidade não suportada pelo PNCP' });
    }

    // === DATAS ===
    // Credenciamento (E7b): não há sessão — a referência é o fim da vigência do edital (inscrições)
    const dataReferencia =
      licitacao.data_abertura_sessao ||
      ((licitacao.modalidade as string) === 'CREDENCIAMENTO' ? licitacao.data_fim_acolhimento : null);
    if (dataReferencia) {
      const dataAbertura = new Date(dataReferencia);
      if (!isNaN(dataAbertura.getTime())) {
        if (dataAbertura > new Date()) {
          checklist.push({ campo: 'Data Abertura', status: 'ok', mensagem: dataAbertura.toISOString().slice(0, 19) });
        } else {
          avisos.push('Data de abertura está no passado');
          checklist.push({ campo: 'Data Abertura', status: 'aviso', mensagem: 'Data no passado' });
        }
      } else {
        erros.push('Data de abertura inválida');
        checklist.push({ campo: 'Data Abertura', status: 'erro', mensagem: 'Formato inválido' });
      }
    } else {
      erros.push('Data de abertura da sessão é obrigatória');
      checklist.push({ campo: 'Data Abertura', status: 'erro', mensagem: 'Não informada' });
    }

    // === FASE INTERNA ===
    if (licitacao.fase_interna_concluida) {
      checklist.push({ campo: 'Fase Interna', status: 'ok', mensagem: 'Concluída' });
    } else {
      erros.push('Fase interna (preparatória) não foi concluída');
      checklist.push({ campo: 'Fase Interna', status: 'erro', mensagem: 'Não concluída - Art. 18 Lei 14.133/2021' });
    }

    // === ITENS ===
    if (licitacao.itens && licitacao.itens.length > 0) {
      checklist.push({ campo: 'Quantidade de Itens', status: 'ok', mensagem: `${licitacao.itens.length} item(s)` });
      
      let valorTotal = 0;
      licitacao.itens.forEach((item: any, index: number) => {
        const numeroItem = item.numero_item || (index + 1);
        const descricao = item.descricao_resumida || item.descricao;
        const quantidade = parseFloat(item.quantidade) || 0;
        const valorUnitario = parseFloat(item.valor_unitario_estimado) || 0;
        
        if (!descricao || descricao.length < 5) {
          erros.push(`Item ${numeroItem}: Descrição obrigatória (mínimo 5 caracteres)`);
          checklist.push({ campo: `Item ${numeroItem} - Descrição`, status: 'erro', mensagem: 'Descrição inválida' });
        }
        
        if (quantidade <= 0) {
          erros.push(`Item ${numeroItem}: Quantidade deve ser maior que zero`);
          checklist.push({ campo: `Item ${numeroItem} - Quantidade`, status: 'erro', mensagem: 'Quantidade inválida' });
        }
        
        if (valorUnitario <= 0) {
          erros.push(`Item ${numeroItem}: Valor unitário deve ser maior que zero`);
          checklist.push({ campo: `Item ${numeroItem} - Valor`, status: 'erro', mensagem: 'Valor inválido' });
        }
        
        valorTotal += quantidade * valorUnitario;
      });
      
      checklist.push({ campo: 'Valor Total Estimado', status: 'ok', mensagem: `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` });
    } else {
      erros.push('Licitação deve ter pelo menos 1 item');
      checklist.push({ campo: 'Itens', status: 'erro', mensagem: 'Nenhum item cadastrado' });
    }

    // === RESULTADO ===
    const valido = erros.length === 0;
    
    // Se válido, gerar preview dos dados que serão enviados
    let dadosEnvio = null;
    if (valido) {
      // Prévia: o envio real é montado pela fila na hora (PncpEnviosService),
      // com o benefício ME/EPP de cada unidade.
      try {
        // Ainda na fase interna, o envio É a divulgação: a publicação é agora
        // (mesma regra do envio — PncpEnviosService.compra).
        if (ehFaseInterna(licitacao.fase) && !licitacao.data_publicacao_edital) licitacao.data_publicacao_edital = new Date();
        dadosEnvio = montarCompra(licitacao as LicitacaoParaPncp, licitacao.itens as ItemParaPncp[], {
          codigoUnidade: licitacao.codigo_unidade_compradora || licitacao.orgao?.pncp_codigo_unidade,
          linkSistemaOrigem: this.linkSistemaOrigem(licitacao.id),
          beneficioDoItem: (i) => beneficioSimples(licitacao.itens[i], licitacao),
        });
      } catch (eCapturado: unknown) {
        const e = comoErro(eCapturado);
        erros.push(e?.message ?? String(e));
      }
    }

    return {
      valido: erros.length === 0,
      erros,
      avisos,
      checklist,
      dadosEnvio
    };
  }

  // ============ COMPRA/LICITAÇÃO ============

  // Vincular manualmente uma licitação já enviada ao PNCP
  async vincularLicitacaoExistente(
    licitacaoId: string,
    numeroControlePNCP: string,
    anoCompra: number,
    sequencialCompra: number,
    ator: AtorTransicao = atorSistema('pncp'),
  ): Promise<PncpResponseDto> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.NOT_FOUND);
    }

    // Gerar link do PNCP
    const cnpj = this.obterCnpjPncpDoOrgao(licitacao.orgao);
    const linkPncp = `${this.getPortalBaseUrl()}/app/editais/${cnpj}/${anoCompra}/${sequencialCompra}`;

    // Vincular não pode contornar o gate do publicar-edital: ainda não
    // divulgada → o ato PUBLICAR precisa ser possível (senão 409/400, nada
    // é gravado). Já divulgada → só registra os dados do PNCP.
    if (ehFaseInterna(licitacao.fase)) {
      await this.transicoes.verificar(licitacaoId, AtoLicitacao.PUBLICAR, {
        ator,
        dados: this.dadosPublicacaoPncp(licitacao),
      });
    }
    // E9: a compra vinculada vira linha ENVIADA da fila (fonte única do estado no PNCP)
    await registrarCompraExistente(this.dataSource.manager, {
      licitacaoId,
      orgaoId: licitacao.orgao_id,
      numeroControle: numeroControlePNCP,
      ano: Number(anoCompra),
      sequencial: Number(sequencialCompra),
      origem: 'VINCULO_MANUAL',
    });
    await this.registrarPublicacaoPncp(
      licitacaoId,
      { numeroControle: numeroControlePNCP, ano: Number(anoCompra), sequencial: Number(sequencialCompra) },
      ator,
    );

    this.logger.log(`Licitação ${licitacao.numero_processo} vinculada ao PNCP: ${numeroControlePNCP}`);

    return {
      sucesso: true,
      mensagem: 'Licitação vinculada ao PNCP com sucesso',
      numeroControlePNCP,
      ano: anoCompra,
      sequencial: sequencialCompra,
      link: linkPncp
    };
  }

  /** Dados do ato PUBLICAR quando a divulgação vem do PNCP (cronograma já gravado). */
  dadosPublicacaoPncp(licitacao: Licitacao): Record<string, any> {
    const dados: Record<string, any> = { data_publicacao_edital: new Date().toISOString() };
    for (const campo of ['data_limite_impugnacao', 'data_inicio_acolhimento', 'data_fim_acolhimento', 'data_abertura_sessao'] as const) {
      if (licitacao[campo]) dados[campo] = new Date(licitacao[campo] as any).toISOString();
    }
    return dados;
  }

  /**
   * Compra publicada no PNCP: se a licitação ainda está na fase interna,
   * pratica o ato PUBLICAR (idempotente: `ignorarSeJaAplicado`). Nunca move
   * para trás uma licitação já divulgada/adiante. O ESTADO da compra (número
   * de controle, ano/sequencial, link) fica só em `pncp_sync` (E9 — a
   * licitação não guarda mais cópia; ver `estado-compra-pncp.ts`).
   */
  async registrarPublicacaoPncp(
    licitacaoId: string,
    compra: { numeroControle?: string | null; ano: number; sequencial: number },
    ator: AtorTransicao,
  ): Promise<void> {
    const licitacao = await this.licitacaoRepository.findOne({ where: { id: licitacaoId } });
    if (!licitacao || !ehFaseInterna(licitacao.fase)) return;
    try {
      await this.transicoes.executar(licitacaoId, AtoLicitacao.PUBLICAR, {
        ator,
        ignorarSeJaAplicado: true,
        dados: this.dadosPublicacaoPncp(licitacao),
        registro: { origem: 'PNCP', numero_controle_pncp: compra.numeroControle ?? null, compra: `${compra.ano}/${compra.sequencial}` },
      });
    } catch (eCapturado: unknown) {
      const e = comoErro(eCapturado);
      // A compra já está no PNCP (o gate foi conferido antes do envio): não
      // derruba o envio — a divulgação local fica pendente no cockpit.
      this.logger.error(
        `Compra da licitação ${licitacaoId} registrada no PNCP, mas o ato PUBLICAR falhou: ${e?.message ?? e}`,
      );
    }
  }

  // ============ CONSULTAS ============

  async consultarStatusSincronizacao(licitacaoId: string): Promise<PncpSync[]> {
    return this.pncpSyncRepository.find({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' }
    });
  }

  /** Fila: operações à espera (pendentes, enviando ou com erro temporário que volta sozinho). */
  async listarPendentes(orgaoId?: string): Promise<PncpSync[]> {
    return this.listarPorStatus([...STATUS_PROCESSAVEIS, StatusSincronizacao.ENVIANDO], orgaoId, 'ASC');
  }

  /** Fila: operações com erro (definitivo, temporário e os registros anteriores à fila). */
  async listarErros(orgaoId?: string): Promise<PncpSync[]> {
    return this.listarPorStatus([...STATUS_DE_ERRO], orgaoId, 'DESC');
  }

  private listarPorStatus(status: StatusSincronizacao[], orgaoId: string | undefined, ordem: 'ASC' | 'DESC'): Promise<PncpSync[]> {
    const qb = this.pncpSyncRepository
      .createQueryBuilder('sync')
      .leftJoinAndSelect('sync.licitacao', 'licitacao')
      .where('sync.status IN (:...status)', { status });
    // Busca pela licitação (CAST evita "operator does not exist: uuid = text")
    if (orgaoId) qb.andWhere('(sync.orgao_id = :orgaoId OR CAST(licitacao.orgao_id AS TEXT) = :orgaoId)', { orgaoId });
    return qb.orderBy(ordem === 'ASC' ? 'sync.created_at' : 'sync.updated_at', ordem).getMany();
  }

  // ============ CHAMADA À API (usada pela fila — PncpEnviosService) ============

  /** Base da API de integração (credencial da plataforma → env → treinamento). */
  baseApiUrl(): string {
    return PncpService.platformCredentials.apiUrl || this.getEnvVar('PNCP_API_URL') || 'https://treina.pncp.gov.br/api/pncp/v1';
  }

  /** CNPJ usado nas APIs do PNCP para o órgão (pncp_cnpj_orgao ou CNPJ do cadastro). */
  cnpjDoOrgao(orgao?: Partial<Orgao> | null): string {
    return this.obterCnpjPncpDoOrgao(orgao);
  }

  async orgaoDoPca(pcaId: string): Promise<string | null> {
    const pca = await this.pcaRepository.findOne({ where: { id: pcaId }, select: ['id', 'orgao_id'] });
    return pca?.orgao_id ?? null;
  }

  orgaoDoContrato(contratoId: string): Promise<Array<{ orgao_id: string }>> {
    return this.dataSource.query(`SELECT orgao_id::text AS orgao_id FROM contratos WHERE id::text = $1`, [contratoId]);
  }

  linkSistemaOrigem(licitacaoId: string): string {
    return `${this.configService.get('APP_URL') || 'http://localhost:3000'}/licitacoes/${licitacaoId}`;
  }

  linkCompra(cnpj: string, ano: number | string, sequencial: number | string): string {
    return `${this.getPortalBaseUrl()}/app/editais/${String(cnpj).replace(/\D/g, '')}/${ano}/${sequencial}`;
  }

  /**
   * Chamada autenticada ao PNCP. Falha vira `ErroPncp` com a MENSAGEM DO PNCP
   * e a natureza (temporária: rede/5xx/429/401; definitiva: demais 4xx). O
   * 401 descarta o token (novo login na próxima tentativa).
   */
  async chamarApi<T = any>(req: {
    metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    caminho: string;
    dados?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ status: number; data: T; headers: Record<string, any> }> {
    let token: string;
    try {
      token = await this.getValidToken();
    } catch (eCapturado: unknown) {
      const e = comoErro(eCapturado);
      throw new ErroPncp(`Login no PNCP: ${e?.message ?? e}`, 'TEMPORARIA');
    }
    try {
      const r = await axios.request<T>({
        method: req.metodo,
        url: `${this.baseApiUrl()}${req.caminho}`,
        data: req.dados,
        headers: { Accept: 'application/json', ...(req.headers ?? {}), Authorization: `Bearer ${token}` },
        timeout: 60_000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return { status: r.status, data: r.data, headers: (r.headers ?? {}) as Record<string, any> };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      const status: number | undefined = error?.response?.status;
      if (status === 401) {
        this.token = '';
        this.tokenExpiration = null;
      }
      const mensagem = this.extrairMensagemErro(error);
      throw new ErroPncp(status ? `HTTP ${status}: ${mensagem}` : mensagem, naturezaDaFalhaHttp(status, error?.code), status);
    }
  }

  /** Item para as ferramentas manuais (retificar/incluir item): mesmo mapeamento da fila. */
  private itemParaPncp(item: any, numeroItem: number, licitacao: any): ItemCompraPncp {
    const dto = montarItemCompra({ ...item, numero_item: numeroItem }, numeroItem - 1, licitacao, beneficioSimples(item, licitacao), instrumentoConvocatorioId(licitacao));
    return dto;
  }

  private extrairMensagemErro(erro: unknown): string {
    const error = comoErro(erro);
    type ErroCampo = string | { campo?: string; mensagem?: string; field?: string; message?: string };
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.mensagem) {
      return error.response.data.mensagem;
    }
    if (error.response?.data?.erros && Array.isArray(error.response.data.erros)) {
      // Erros podem ser objetos com propriedades como {campo, mensagem}
      return error.response.data.erros.map((e: ErroCampo) => {
        if (typeof e === 'string') return e;
        if (e.mensagem) return `${e.campo || 'Campo'}: ${e.mensagem}`;
        if (e.message) return `${e.field || 'Campo'}: ${e.message}`;
        return JSON.stringify(e);
      }).join(' | ');
    }
    if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
      return error.response.data.errors.map((e: ErroCampo) => {
        if (typeof e === 'string') return e;
        return e.message || e.mensagem || JSON.stringify(e);
      }).join(' | ');
    }
    if (error.response?.data) {
      return JSON.stringify(error.response.data);
    }
    return error.message || 'Erro desconhecido';
  }

  // ============ PCA (Plano de Contratações Anual) ============

  async enviarPCA(pcaId: string, pcaPayload: any): Promise<PncpResponseDto> {
    // Carrega PCA do banco com o órgão vinculado
    const pcaEntity = await this.pcaRepository.findOne({
      where: { id: pcaId },
      relations: ['orgao'],
    });

    if (!pcaEntity) {
      throw new HttpException('PCA não encontrado', HttpStatus.NOT_FOUND);
    }

    const orgao = pcaEntity.orgao;
    if (!orgao) {
      throw new HttpException('PCA não está vinculado a um órgão', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`[ENVIAR-PCA] Órgão: ${orgao.nome} (CNPJ PNCP: ${this.obterCnpjPncpDoOrgao(orgao)})`);
    this.logger.log(`[ENVIAR-PCA] pncp_vinculado: ${orgao.pncp_vinculado}, pncp_codigo_unidade: ${orgao.pncp_codigo_unidade}`);

    const cnpjPadrao = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    const cnpjOrgaoLimpo = this.obterCnpjPncpDoOrgao(orgao);
    const cnpjPadraoLimpo = (cnpjPadrao || '').replace(/\D/g, '');

    if (!cnpjPadraoLimpo) {
      throw new HttpException('CNPJ padrão da plataforma (PNCP_CNPJ_ORGAO) não configurado', HttpStatus.BAD_REQUEST);
    }

    // Regra de envio do CNPJ:
    // - Órgãos reais: usam seu próprio CNPJ (ex: 81.448.637/0001-47)
    // - Órgão de teste "Prefeitura Municipal de Teste" (12.345.678/0001-99):
    //   continua usando o CNPJ padrão da plataforma para manter compatibilidade
    let cnpjEnvio: string;
    if (cnpjOrgaoLimpo === '12345678000199') {
      // CNPJ fictício usado apenas para testes locais
      cnpjEnvio = cnpjPadraoLimpo;
    } else if (cnpjOrgaoLimpo) {
      cnpjEnvio = cnpjOrgaoLimpo;
    } else {
      throw new HttpException('CNPJ do órgão não informado', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`[ENVIAR-PCA] CNPJ para envio: ${cnpjEnvio}`);

    // Verificar se órgão está marcado como vinculado ao PNCP
    if (!orgao.pncp_vinculado) {
      throw new HttpException(
        `Órgão "${orgao.nome}" não está vinculado ao PNCP. Acesse a edição do órgão e marque como "Vinculado ao PNCP".`,
        HttpStatus.BAD_REQUEST
      );
    }

    const codigoUnidade = pcaPayload.codigo_unidade || orgao.pncp_codigo_unidade || '1';

    // Mapear dados do PCA para o formato PNCP (conforme documentação)
    const itensPlano = (pcaPayload.itens || []).map((item: any, index: number) => {
      const valorUnitario = parseFloat(item.valor_unitario_estimado) || parseFloat(item.valor_estimado) || 1000;
      const quantidade = parseFloat(item.quantidade_estimada) || 1;
      const valorTotal = valorUnitario * quantidade;
      
      // Categoria de Item PCA:
      // 1=Material, 2=Serviço, 3=Obra, 4=Serviços de Engenharia, 
      // 5=Soluções de TIC, 6=Locação de Imóveis, 7=Alienação/Concessão/Permissão, 8=Obras e Serviços de Engenharia
      const categoria = this.mapearCategoriaPCA(item.categoria);
      
      // Catálogo: 1=Compras.gov.br, 2=Outros (Próprio)
      const catalogoId = 2;
      
      // Classificação do Catálogo: 1=Material, 2=Serviço (numérico, igual à categoria)
      const classificacaoCatalogo = categoria;
      
      // Código da Classificação Superior (Classe/Grupo) - usar código_classe do item
      const codigoClasseSuperior = item.codigo_classe || '100';
      
      // Nome da Classificação Superior - usar nome_classe do item
      const nomeClasseSuperior = item.nome_classe || (categoria === 1 ? 'MATERIAIS' : 'SERVIÇOS');
      const grupoContratacaoCodigo = item.identificador_contratacao || item.codigo_grupo;
      const grupoContratacaoNome = item.nome_contratacao || item.nome_grupo;
      
      return {
        numeroItem: item.numero_item || (index + 1),
        categoriaItemPca: categoria,
        descricao: (item.descricao_objeto || 'Item do PCA').substring(0, 2000),
        unidadeRequisitante: item.unidade_requisitante || 'Unidade Principal',
        // Valores - nomes exatos da API PNCP
        valorUnitario: valorUnitario,
        quantidade: quantidade,
        valorTotal: valorTotal,
        valorOrcamentoExercicio: parseFloat(item.valor_orcamentario_exercicio) || valorTotal,
        unidadeFornecimento: item.unidade_medida || 'UNIDADE',
        // Catálogo 2 = Outros (Próprio)
        catalogo: catalogoId,
        // Classificação do Catálogo: "Material" ou "Serviço"
        classificacaoCatalogo: classificacaoCatalogo,
        // Código e Nome da Classificação Superior (Classe/Grupo)
        classificacaoSuperiorCodigo: codigoClasseSuperior,
        classificacaoSuperiorNome: nomeClasseSuperior,
        grupoContratacaoCodigo,
        grupoContratacaoNome,
        // Data obrigatória
        dataDesejada: item.data_desejada_contratacao || item.data_prevista_inicio || new Date().toISOString().split('T')[0],
        grauPrioridade: item.prioridade || 3,
        renovacaoContrato: item.renovacao_contrato === 'SIM' || item.renovacao_contrato === true
      };
    });

    // PCA é enviado com itensPlano incluídos
    const pcaDto = {
      anoPca: pcaEntity.ano_exercicio,
      codigoUnidade: codigoUnidade,
      dataPublicacaoPncp: pcaPayload.data_publicacao || pcaEntity.data_publicacao || new Date().toISOString().split('T')[0],
      itensPlano: itensPlano,
    };

    // Criar registro de sincronização
    const sync = this.pncpSyncRepository.create({
      tipo: TipoSincronizacao.PCA,
      entidade_id: pcaId,
      status: StatusSincronizacao.ENVIANDO,
      payload_enviado: pcaDto
    });
    await this.pncpSyncRepository.save(sync);

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpjEnvio}/pca`,
        pcaDto
      );

      // Log da resposta completa para debug
      this.logger.log(`Resposta PNCP PCA: ${JSON.stringify(response.data)}`);

      // Extrair sequencial da resposta - tentar vários campos possíveis
      let sequencial = response.data?.sequencialPca || 
                       response.data?.sequencial || 
                       response.data?.sequencialPCA ||
                       response.data?.sequencialPlano;
      
      // Se não encontrou, tentar extrair do número de controle
      if (!sequencial && response.data?.numeroControlePNCP) {
        sequencial = this.extrairSequencialDeNumeroControle(response.data.numeroControlePNCP);
      }
      
      // Se ainda não encontrou, tentar extrair dos headers
      if (!sequencial && response.headers?.location) {
        const match = response.headers.location.match(/\/(\d+)$/);
        if (match) sequencial = parseInt(match[1]);
      }

      const numeroControlePncp = response.data?.numeroControlePNCP ||
                                 response.data?.numeroControle ||
                                 response.data?.numeroControlePca ||
                                 response.data?.numeroControlePlano ||
                                 (cnpjEnvio && sequencial
                                   ? `${cnpjEnvio}-0-${String(sequencial).padStart(6, '0')}/${pcaEntity.ano_exercicio}`
                                   : null);

      sync.status = StatusSincronizacao.ENVIADO;
      sync.resposta_pncp = response.data;
      sync.numero_controle_pncp = numeroControlePncp || undefined;
      await this.pncpSyncRepository.save(sync);

      // Atualizar PCA no banco com número de controle, sequencial, unidade e marcar como enviado
      await this.pcaRepository.update(pcaId, {
        enviado_pncp: true,
        numero_controle_pncp: numeroControlePncp,
        sequencial_pncp: sequencial,
        codigo_unidade: codigoUnidade,
        nome_unidade: pcaPayload.nome_unidade || `Unidade ${codigoUnidade}`,
        data_envio_pncp: new Date(),
      });

      this.logger.log(`PCA enviado ao PNCP: ${response.data.numeroControlePNCP} - Sequencial: ${sequencial}`);

      return {
        sucesso: true,
        numeroControlePNCP: response.data.numeroControlePNCP,
        sequencial: sequencial,
        mensagem: `PCA enviado com sucesso! Sequencial: ${sequencial}`
      };
    } catch (error) {
      sync.status = StatusSincronizacao.ERRO;
      sync.erro_mensagem = this.extrairMensagemErro(error);
      sync.tentativas += 1;
      sync.ultima_tentativa = new Date();
      await this.pncpSyncRepository.save(sync);

      throw new HttpException(
        `Erro ao enviar PCA ao PNCP: ${sync.erro_mensagem}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // Extrai o sequencial do número de controle PNCP (formato: CNPJ-ANO-SEQUENCIAL)
  private extrairSequencialDeNumeroControle(numeroControle: string): number | null {
    if (!numeroControle) return null;
    const partes = numeroControle.split('-');
    if (partes.length >= 3) {
      return parseInt(partes[partes.length - 1], 10);
    }
    return null;
  }

  async enviarItemPCA(pcaId: string, item: any, cnpjEscopo?: string): Promise<PncpResponseDto> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    // Buscar PCA sync para obter número de controle
    const pcaSync = await this.pncpSyncRepository.findOne({
      where: { 
        entidade_id: pcaId, 
        tipo: TipoSincronizacao.PCA,
        status: StatusSincronizacao.ENVIADO
      }
    });

    if (!pcaSync?.numero_controle_pncp) {
      throw new HttpException('PCA não foi enviado ao PNCP ainda', HttpStatus.BAD_REQUEST);
    }

    const itemDto = {
      categoriaItemPca: this.mapearCategoriaPCA(item.categoria),
      descricao: item.descricao_objeto,
      unidadeRequisitante: item.unidade_requisitante || 'Unidade Principal',
      valorEstimado: parseFloat(item.valor_estimado) || 0,
      quantidadeEstimada: parseFloat(item.quantidade_estimada) || 1,
      unidadeMedida: item.unidade_medida || 'UN',
      dataDesejada: item.data_prevista_inicio || null,
      grauPrioridade: item.prioridade || 3,
      renovacaoContrato: item.renovacao_contrato || false
    };

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj.replace(/\D/g, '')}/pca/${pcaSync.numero_controle_pncp}/itens`,
        itemDto
      );

      return {
        sucesso: true,
        mensagem: 'Item do PCA enviado com sucesso',
        sequencial: response.data.sequencial
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao enviar item do PCA: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private mapearCategoriaPCA(categoria: string): number {
    // PNCP aceita apenas: 1=Material, 2=Serviço para classificacaoCatalogo
    // Outras categorias são mapeadas para Serviço (2) por padrão
    const mapa: Record<string, number> = {
      'MATERIAL': 1,
      'SERVICO': 2,
      'OBRA': 2,              // Mapeia para Serviço
      'SERVICO_ENGENHARIA': 2, // Mapeia para Serviço
      'SOLUCAO_TIC': 2,       // Mapeia para Serviço
      'LOCACAO_IMOVEL': 2,    // Mapeia para Serviço
      'ALIENACAO': 1          // Mapeia para Material
    };
    return mapa[categoria] || 2; // Default: Serviço
  }

  // ============ PCA - RETIFICAÇÃO E EXCLUSÃO ============

  async retificarPCA(anoPca: string, sequencialPca: string, pca: any, orgaoEscopo?: string): Promise<PncpResponseDto> {
    const cnpj = await this.obterCnpjParaOperacaoPca(anoPca, sequencialPca, orgaoEscopo);

    const pcaDto = {
      anoPca: parseInt(anoPca),
      codigoUnidade: pca.codigo_unidade || '1',
      dataPublicacaoPncp: pca.data_publicacao || new Date().toISOString().split('T')[0],
    };

    try {
      const response = await this.axiosInstance.put(
        `/orgaos/${cnpj}/pca/${anoPca}/${sequencialPca}`,
        pcaDto
      );

      this.logger.log(`PCA retificado no PNCP: ${anoPca}/${sequencialPca}`);

      return {
        sucesso: true,
        mensagem: 'PCA retificado com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao retificar PCA: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async excluirPCA(anoPca: string, sequencialPca: string, justificativa?: string, orgaoEscopo?: string): Promise<PncpResponseDto> {
    const cnpj = await this.obterCnpjParaOperacaoPca(anoPca, sequencialPca, orgaoEscopo);

    // Garantir que temos um token válido antes de fazer a requisição
    this.logger.log(`[EXCLUIR_PCA] Iniciando exclusão - Ano: ${anoPca}, Seq: ${sequencialPca}, CNPJ: ${cnpj}`);
    
    try {
      // Forçar renovação do token antes da exclusão
      await this.getValidToken();
      this.logger.log(`[EXCLUIR_PCA] Token obtido/validado com sucesso`);
      
      // PNCP requer justificativa para exclusão
      await this.axiosInstance.delete(
        `/orgaos/${cnpj}/pca/${anoPca}/${sequencialPca}`,
        { data: { justificativa: justificativa || 'Exclusão solicitada pelo usuário' } }
      );

      this.logger.log(`[EXCLUIR_PCA] PCA excluído do PNCP: ${anoPca}/${sequencialPca}`);

      return {
        sucesso: true,
        mensagem: 'PCA excluído com sucesso'
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      const status = error.response?.status;
      const errorData = error.response?.data;
      
      this.logger.error(`[EXCLUIR_PCA] Erro ao excluir PCA ${anoPca}/${sequencialPca}:`, {
        status,
        data: errorData,
        message: error.message
      });

      // Se for erro 401, pode ser token inválido - tentar renovar e informar
      if (status === 401) {
        this.token = '';
        this.tokenExpiration = null;
        throw new HttpException(
          `Erro de autenticação com o PNCP. Token inválido ou expirado. Tente novamente.`,
          HttpStatus.UNAUTHORIZED
        );
      }

      throw new HttpException(
        `Erro ao excluir PCA: ${this.extrairMensagemErro(error)}`,
        error.response?.status || HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * CNPJ do PNCP para operar o PCA `ano/sequencial`. Com `orgaoEscopo` (rota
   * chamada por um órgão), o PCA precisa ser DESSE órgão — 404 caso contrário;
   * sem ele (admin da plataforma), vale o PCA local ou o CNPJ padrão.
   */
  private async obterCnpjParaOperacaoPca(
    anoPca: string | number,
    sequencialPca: string | number,
    orgaoEscopo?: string,
  ): Promise<string> {
    const ano = parseInt(String(anoPca), 10);
    const sequencial = parseInt(String(sequencialPca), 10);

    const pca = await this.pcaRepository.findOne({
      where: orgaoEscopo
        ? { ano_exercicio: ano, sequencial_pncp: sequencial, orgao_id: orgaoEscopo }
        : { ano_exercicio: ano, sequencial_pncp: sequencial },
      relations: ['orgao'],
    });
    if (orgaoEscopo && !pca) {
      throw new HttpException('PCA não encontrado', HttpStatus.NOT_FOUND);
    }

    const cnpjPadrao = this.configService.get<string>('PNCP_CNPJ_ORGAO') || '';
    const cnpjPadraoLimpo = cnpjPadrao.replace(/\D/g, '');

    if (this.obterCnpjPncpDoOrgao(pca?.orgao)) {
      const cnpjOrgaoLimpo = this.obterCnpjPncpDoOrgao(pca?.orgao);
      if (cnpjOrgaoLimpo && cnpjOrgaoLimpo !== '12345678000199') {
        return cnpjOrgaoLimpo;
      }
    }

    if (!cnpjPadraoLimpo) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    return cnpjPadraoLimpo;
  }

  async retificarItemPCA(anoPca: string, sequencialPca: string, numeroItem: string, item: any, orgaoEscopo?: string): Promise<PncpResponseDto> {
    const cnpj = await this.obterCnpjParaOperacaoPca(anoPca, sequencialPca, orgaoEscopo);

    const valorUnitario = parseFloat(item.valor_unitario_estimado) || parseFloat(item.valor_estimado) || undefined;
    const quantidade = parseFloat(item.quantidade_estimada) || undefined;

    // DTO para retificação parcial - enviar apenas campos que serão alterados
    const itemDto: any = {};
    if (item.descricao_objeto) itemDto.descricao = item.descricao_objeto;
    if (item.unidade_requisitante) itemDto.unidadeRequisitante = item.unidade_requisitante;
    if (valorUnitario) itemDto.valorUnitario = valorUnitario;
    if (quantidade) itemDto.quantidade = quantidade;
    if (valorUnitario && quantidade) itemDto.valorTotal = valorUnitario * quantidade;
    if (item.valor_orcamentario_exercicio) itemDto.valorOrcamentoExercicio = parseFloat(item.valor_orcamentario_exercicio);
    if (item.unidade_medida) itemDto.unidadeFornecimento = item.unidade_medida;
    if (item.data_desejada_contratacao) itemDto.dataDesejada = item.data_desejada_contratacao;
    if (item.prioridade) itemDto.grauPrioridade = item.prioridade;

    try {
      // PNCP usa PATCH para retificação parcial
      await this.axiosInstance.patch(
        `/orgaos/${cnpj.replace(/\D/g, '')}/pca/${anoPca}/${sequencialPca}/itens/${numeroItem}`,
        itemDto
      );

      this.logger.log(`Item ${numeroItem} do PCA retificado`);

      return {
        sucesso: true,
        mensagem: 'Item do PCA retificado com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao retificar item do PCA: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async excluirItemPCA(anoPca: string, sequencialPca: string, numeroItem: string, orgaoEscopo?: string): Promise<PncpResponseDto> {
    const cnpj = await this.obterCnpjParaOperacaoPca(anoPca, sequencialPca, orgaoEscopo);

    try {
      await this.axiosInstance.delete(
        `/orgaos/${cnpj.replace(/\D/g, '')}/pca/${anoPca}/${sequencialPca}/itens/${numeroItem}`
      );

      this.logger.log(`Item ${numeroItem} do PCA excluído`);

      return {
        sucesso: true,
        mensagem: 'Item do PCA excluído com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao excluir item do PCA: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ COMPRAS/EDITAIS - INCLUSÃO / RETIFICAÇÃO / EXCLUSÃO ============

  async retificarCompra(anoCompra: string, sequencialCompra: string, compra: any, cnpjEscopo?: string): Promise<PncpResponseDto> {
    // Buscar licitação para obter CNPJ do órgão
    let cnpj = cnpjEscopo || this.configService.get<string>('PNCP_CNPJ_ORGAO');

    if (compra.licitacaoId && !cnpjEscopo) {
      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: compra.licitacaoId },
        relations: ['orgao']
      });
      if (this.obterCnpjPncpDoOrgao(licitacao?.orgao)) {
        cnpj = this.obterCnpjPncpDoOrgao(licitacao?.orgao);
      }
    }

    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    const compraDto: any = {};
    
    // Objeto
    if (compra.objetoCompra) compraDto.objetoCompra = compra.objetoCompra;
    if (compra.objeto) compraDto.objetoCompra = compra.objeto;
    
    // Informações complementares
    if (compra.informacao_complementar) compraDto.informacaoComplementar = compra.informacao_complementar;
    if (compra.informacaoComplementar) compraDto.informacaoComplementar = compra.informacaoComplementar;
    
    // Valores
    if (compra.valor_total_estimado) compraDto.valorTotalEstimado = parseFloat(compra.valor_total_estimado);
    if (compra.valorTotalEstimado) compraDto.valorTotalEstimado = parseFloat(compra.valorTotalEstimado);
    if (compra.valor_total_homologado) compraDto.valorTotalHomologado = parseFloat(compra.valor_total_homologado);
    if (compra.valorTotalHomologado) compraDto.valorTotalHomologado = parseFloat(compra.valorTotalHomologado);
    
    // Status
    if (compra.situacao_id) compraDto.situacaoCompraId = compra.situacao_id;
    if (compra.situacaoCompraId) compraDto.situacaoCompraId = compra.situacaoCompraId;
    
    // Datas (formato ISO 8601)
    if (compra.dataAberturaProposta) compraDto.dataAberturaProposta = compra.dataAberturaProposta;
    if (compra.dataEncerramentoProposta) compraDto.dataEncerramentoProposta = compra.dataEncerramentoProposta;
    
    this.logger.log(`[retificarCompra] Datas recebidas: inicio=${compra.dataAberturaProposta}, fim=${compra.dataEncerramentoProposta}`);
    this.logger.log(`[retificarCompra] DTO enviado: ${JSON.stringify(compraDto)}`);
    
    // Justificativa (obrigatória para retificação)
    if (compra.justificativa) compraDto.justificativaRetificacao = compra.justificativa;
    if (compra.justificativaRetificacao) compraDto.justificativaRetificacao = compra.justificativaRetificacao;

    try {
      await this.getValidToken();
      
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      
      await this.axiosInstance.patch(
        `/orgaos/${cnpjLimpo}/compras/${anoCompra}/${sequencialCompra}`,
        compraDto
      );

      // Retificar itens individualmente para atualizar orcamentoSigiloso
      if (compra.licitacaoId) {
        const licitacao = await this.licitacaoRepository.findOne({
          where: { id: compra.licitacaoId },
          relations: ['orgao', 'itens']
        });
        
        if (licitacao?.itens && licitacao.itens.length > 0) {
          this.logger.log(`[retificarCompra] Retificando ${licitacao.itens.length} itens para atualizar orcamentoSigiloso...`);
          this.logger.log(`[retificarCompra] sigilo_orcamento da licitação: ${licitacao.sigilo_orcamento}`);
          
          for (const item of licitacao.itens) {
            const numeroItem = item.numero_item || (licitacao.itens.indexOf(item) + 1);
            const itemDto = this.itemParaPncp(item, numeroItem, licitacao);
            
            this.logger.log(`[retificarCompra] Retificando item ${numeroItem}: orcamentoSigiloso=${itemDto.orcamentoSigiloso}`);
            
            try {
              this.logger.log(`[retificarCompra] Enviando PATCH para item ${numeroItem}: ${JSON.stringify(itemDto)}`);
              const itemResponse = await this.axiosInstance.patch(
                `/orgaos/${cnpjLimpo}/compras/${anoCompra}/${sequencialCompra}/itens/${numeroItem}`,
                itemDto
              );
              this.logger.log(`[retificarCompra] Item ${numeroItem} retificado com sucesso. Resposta: ${JSON.stringify(itemResponse.data)}`);
            } catch (itemErrorCapturado: unknown) {
              const itemError = comoErro(itemErrorCapturado);
              const errorMsg = this.extrairMensagemErro(itemError);
              const errorData = itemError.response?.data ? JSON.stringify(itemError.response.data) : 'sem dados';
              this.logger.error(`[retificarCompra] Erro ao retificar item ${numeroItem}: ${errorMsg}. Dados: ${errorData}`);
              // Continua com os outros itens mesmo se um falhar
            }
          }
        }
      }

      // E9: a retificação crua NÃO altera mais a licitação local — depois da
      // publicação a regra do edital (objeto incluído) só muda pela
      // Retificação do edital (`/api/publicacao/licitacao/:id/retificar`, E7).

      this.logger.log(`Compra retificada: ${anoCompra}/${sequencialCompra}`);

      return {
        sucesso: true,
        mensagem: 'Compra retificada com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao retificar compra: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async consultarQuantidadeItens(anoCompra: string, sequencialCompra: string, cnpjEscopo?: string): Promise<any> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    try {
      await this.getValidToken();
      
      // Consultar quantidade de itens via API de consulta do PNCP
      const response = await axios.get(
        `${this.getConsultaBaseUrl()}/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/itens/quantidade`,
        {
          headers: { 'Authorization': `Bearer ${this.token}` }
        }
      );

      return {
        sucesso: true,
        quantidade: response.data?.quantidade || response.data || 0
      };
    } catch (error) {
      // Se falhar, retorna 0 para não bloquear
      this.logger.warn(`Erro ao consultar quantidade de itens: ${this.extrairMensagemErro(error)}`);
      return { sucesso: false, quantidade: 0 };
    }
  }

  async incluirItemCompra(
    anoCompra: string, 
    sequencialCompra: string, 
    itemInput: any,
    cnpjEscopo?: string,
  ): Promise<PncpResponseDto> {
    // Buscar licitação com o item do banco de dados
    if (!itemInput.licitacaoId) {
      throw new HttpException('licitacaoId é obrigatório', HttpStatus.BAD_REQUEST);
    }

    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: itemInput.licitacaoId },
      relations: ['itens', 'orgao']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.BAD_REQUEST);
    }

    const cnpj = cnpjEscopo || this.obterCnpjPncpDoOrgao(licitacao.orgao) ||
      this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    // Buscar o item específico do banco de dados
    const itemDb = licitacao.itens?.find(i => 
      i.numero_item === parseInt(itemInput.numeroItem) || 
      i.id === itemInput.itemId
    );

    if (!itemDb) {
      throw new HttpException(`Item ${itemInput.numeroItem} não encontrado na licitação`, HttpStatus.BAD_REQUEST);
    }

    // Usar o mesmo mapeamento que funciona no enviarItens
    // Passa a licitação para obter sigilo_orcamento
    const itemDto = this.itemParaPncp(itemDb, parseInt(itemInput.numeroItem), licitacao);

    this.logger.log(`[INCLUIR ITEM] Item do banco: ${JSON.stringify(itemDb)}`);
    this.logger.log(`[INCLUIR ITEM] DTO enviado: ${JSON.stringify(itemDto)}`);

    try {
      await this.getValidToken();
      
      // PNCP espera um ARRAY de itens
      await this.axiosInstance.post(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/itens`,
        [itemDto]
      );

      this.logger.log(`Item ${itemInput.numeroItem} incluído na compra ${anoCompra}/${sequencialCompra}`);

      return {
        sucesso: true,
        mensagem: `Item ${itemInput.numeroItem} incluído com sucesso`
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao incluir item: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async retificarItemCompra(
    anoCompra: string, 
    sequencialCompra: string, 
    numeroItem: string,
    itemInput: any,
    cnpjEscopo?: string,
  ): Promise<PncpResponseDto> {
    // Buscar licitação com itens para obter dados completos
    if (!itemInput.licitacaoId) {
      throw new HttpException('licitacaoId é obrigatório', HttpStatus.BAD_REQUEST);
    }

    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: itemInput.licitacaoId },
      relations: ['itens', 'orgao']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.BAD_REQUEST);
    }

    const cnpj = cnpjEscopo || this.obterCnpjPncpDoOrgao(licitacao.orgao) ||
      this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    // Buscar o item do banco de dados
    const itemDb = licitacao.itens?.find(i => 
      i.numero_item === parseInt(numeroItem)
    );

    if (!itemDb) {
      throw new HttpException(`Item ${numeroItem} não encontrado na licitação`, HttpStatus.BAD_REQUEST);
    }

    // Usar o mesmo mapeamento que funciona no enviarItens
    const itemDto = this.itemParaPncp(itemDb, parseInt(numeroItem), licitacao);
    
    // Adicionar justificativa se fornecida
    if (itemInput.justificativaRetificacao) {
      (itemDto as any).justificativa = itemInput.justificativaRetificacao;
    }

    this.logger.log(`[RETIFICAR ITEM] DTO enviado: ${JSON.stringify(itemDto)}`);

    try {
      await this.getValidToken();
      
      await this.axiosInstance.patch(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/itens/${numeroItem}`,
        itemDto
      );

      this.logger.log(`Item ${numeroItem} da compra ${anoCompra}/${sequencialCompra} retificado`);

      return {
        sucesso: true,
        mensagem: `Item ${numeroItem} retificado com sucesso`
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao retificar item: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async excluirItemCompra(
    anoCompra: string, 
    sequencialCompra: string, 
    numeroItem: string,
    justificativa?: string,
    cnpjEscopo?: string,
  ): Promise<PncpResponseDto> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    try {
      await this.getValidToken();
      
      // A API do PNCP usa DELETE para excluir item
      // Pode requerer justificativa no body ou query param
      const url = `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/itens/${numeroItem}`;
      
      this.logger.log(`[EXCLUIR ITEM] URL: ${url}`);
      
      await this.axiosInstance.delete(url, {
        data: justificativa ? { justificativa } : undefined
      });

      this.logger.log(`Item ${numeroItem} da compra ${anoCompra}/${sequencialCompra} excluído`);

      return {
        sucesso: true,
        mensagem: `Item ${numeroItem} excluído com sucesso`
      };
    } catch (error) {
      this.logger.error(`Erro ao excluir item: ${this.extrairMensagemErro(error)}`);
      throw new HttpException(
        `Erro ao excluir item: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * CANCELAR A PUBLICAÇÃO pelo cockpit (órgão dono; motivo obrigatório) —
   * volta a licitação à fase interna (APROVACAO_INTERNA) para corrigir o
   * processo (ex.: publicado sem itens) e publicar de novo. Só antes de haver
   * propostas (pré-condição do ato; depois disso é revogar/anular).
   *  - compra já no PNCP → exclui a compra lá (mesmo caminho da tela do PNCP);
   *  - compra ainda não enviada (na fila ou com erro) → tira as operações da
   *    fila e pratica o ato — nada é enviado depois.
   */
  async cancelarPublicacaoDaLicitacao(
    licitacaoId: string,
    motivo: string,
    ator: AtorTransicao,
  ): Promise<{ sucesso: true; mensagem: string; compra_excluida_pncp: boolean }> {
    const justificativa = String(motivo ?? '').trim();
    if (justificativa.length < 10) {
      throw new HttpException('Informe o motivo do cancelamento da publicação (mínimo 10 caracteres) — ele fica nos autos.', HttpStatus.BAD_REQUEST);
    }
    const licitacao = await this.licitacaoRepository.findOne({ where: { id: licitacaoId }, relations: ['orgao'] });
    if (!licitacao) throw new HttpException('Licitação não encontrada', HttpStatus.NOT_FOUND);

    const [compra] = await this.dataSource.query(
      `SELECT ano_compra, sequencial_compra FROM pncp_sync
        WHERE licitacao_id = $1 AND tipo::text = 'COMPRA' AND status::text IN ('ENVIADO','ATUALIZADO')
          AND ano_compra IS NOT NULL AND sequencial_compra IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [licitacaoId],
    );
    const ano = compra?.ano_compra ?? (licitacao as any).ano_compra_pncp ?? null;
    const sequencial = compra?.sequencial_compra ?? (licitacao as any).sequencial_compra_pncp ?? null;
    if (ano && sequencial) {
      await this.excluirCompra(String(ano), String(sequencial), { justificativa, licitacaoId }, ator, this.obterCnpjPncpDoOrgao(licitacao.orgao) || undefined);
      return { sucesso: true, mensagem: 'Compra excluída do PNCP e publicação cancelada — o processo voltou à fase interna.', compra_excluida_pncp: true };
    }

    // Nada publicado no PNCP: confere o ato ANTES de mexer na fila
    await this.transicoes.verificar(licitacaoId, AtoLicitacao.CANCELAR_PUBLICACAO, { ator, motivo: justificativa });
    await this.dataSource.query(
      `UPDATE pncp_sync
          SET status = 'EXCLUIDO', chave_idempotencia = NULL, proximo_envio = NULL,
              erro_mensagem = $2, updated_at = now()
        WHERE licitacao_id = $1 AND status::text <> 'EXCLUIDO'
          AND tipo::text IN ('COMPRA','ITEM','DOCUMENTO','RETIFICACAO_COMPRA','SITUACAO_COMPRA','RESULTADO')`,
      [licitacaoId, `Publicação cancelada pelo órgão antes do envio ao PNCP: ${justificativa}`.slice(0, 2000)],
    );
    await this.transicoes.executar(licitacaoId, AtoLicitacao.CANCELAR_PUBLICACAO, {
      ator,
      motivo: justificativa,
      registro: { origem: 'ORGAO', compra_no_pncp: false },
    });
    return { sucesso: true, mensagem: 'Publicação cancelada — o processo voltou à fase interna (nada havia sido publicado no PNCP).', compra_excluida_pncp: false };
  }

  async excluirCompra(
    anoCompra: string,
    sequencialCompra: string,
    dados: any,
    ator: AtorTransicao = atorSistema('pncp'),
    cnpjEscopo?: string,
  ): Promise<PncpResponseDto> {
    const justificativa = typeof dados === 'string' ? dados : dados?.justificativa;
    const licitacaoId = typeof dados === 'object' ? dados?.licitacaoId : null;
    const motivo = (justificativa || '').trim() || 'Exclusão da compra no PNCP solicitada pelo órgão';

    // Buscar licitação para obter CNPJ do órgão
    let cnpj = cnpjEscopo || this.configService.get<string>('PNCP_CNPJ_ORGAO');

    // Licitação divulgada e em andamento: excluir a compra do PNCP é o ato
    // CANCELAR_PUBLICACAO (volta a APROVACAO_INTERNA) — só antes de haver
    // propostas; depois disso é revogar/anular. Conferido ANTES de excluir no
    // PNCP (409 fora da fase / 400 com propostas).
    let cancelarPublicacao = false;
    if (licitacaoId) {
      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: licitacaoId },
        relations: ['orgao']
      });
      if (!cnpjEscopo && this.obterCnpjPncpDoOrgao(licitacao?.orgao)) {
        cnpj = this.obterCnpjPncpDoOrgao(licitacao?.orgao);
      }
      const situacao = licitacao?.situacao ?? SituacaoLicitacao.ATIVA;
      if (
        licitacao &&
        !ehFaseInterna(licitacao.fase) &&
        [SituacaoLicitacao.ATIVA, SituacaoLicitacao.SUSPENSA].includes(situacao)
      ) {
        await this.transicoes.verificar(licitacaoId, AtoLicitacao.CANCELAR_PUBLICACAO, { ator, motivo });
        cancelarPublicacao = true;
      }
    }

    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.getValidToken();
      
      await this.axiosInstance.delete(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}`,
        { data: { justificativa: justificativa || 'Exclusão solicitada pelo órgão' } }
      );

      // Limpar as colunas legadas (E9: deprecated — limpar evita que a migração
      // do boot recrie a compra excluída a partir delas)
      if (licitacaoId) {
        await this.licitacaoRepository
          .createQueryBuilder()
          .update()
          .set({
            numero_controle_pncp: () => 'NULL',
            ano_compra_pncp: () => 'NULL',
            sequencial_compra_pncp: () => 'NULL',
            link_pncp: () => 'NULL',
            enviado_pncp: false,
          })
          .where('id = :id', { id: licitacaoId })
          .execute();

        this.logger.log(`Licitação ${licitacaoId} - dados PNCP limpos após exclusão`);

        // Fila (E7): as operações desta compra saem da fila e liberam a chave de
        // idempotência — uma nova publicação gera uma NOVA compra no PNCP.
        await this.dataSource.query(
          `UPDATE pncp_sync
              SET status = 'EXCLUIDO', chave_idempotencia = NULL, proximo_envio = NULL,
                  erro_mensagem = $2, updated_at = now()
            WHERE licitacao_id = $1 AND status::text <> 'EXCLUIDO'
              AND tipo::text IN ('COMPRA','ITEM','DOCUMENTO','RETIFICACAO_COMPRA','SITUACAO_COMPRA','RESULTADO')`,
          [licitacaoId, `Compra ${anoCompra}/${sequencialCompra} excluída do PNCP: ${motivo}`.slice(0, 2000)],
        );

        if (cancelarPublicacao) {
          try {
            await this.transicoes.executar(licitacaoId, AtoLicitacao.CANCELAR_PUBLICACAO, {
              ator,
              motivo,
              registro: { origem: 'PNCP', compra: `${anoCompra}/${sequencialCompra}` },
            });
          } catch (eCapturado: unknown) {
            const e = comoErro(eCapturado);
            // A compra já saiu do PNCP; a licitação fica na fase em que estava
            // (corrida: proposta chegou entre a conferência e a exclusão).
            this.logger.error(
              `Compra ${anoCompra}/${sequencialCompra} excluída do PNCP, mas a publicação da licitação ${licitacaoId} não foi cancelada: ${e?.message ?? e}`,
            );
          }
        }
      }

      this.logger.log(`Compra excluída: ${anoCompra}/${sequencialCompra}`);

      return {
        sucesso: true,
        mensagem: 'Compra excluída com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao excluir compra: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async consultarCompra(anoCompra: string, sequencialCompra: string, cnpjEscopo?: string): Promise<any> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    try {
      const response = await this.axiosInstance.get(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}`
      );

      return {
        encontrado: true,
        compra: response.data,
        numeroControlePNCP: response.data?.numeroControlePNCP || response.data?.numeroControle,
        link: `${this.getPortalBaseUrl()}/app/editais/${cnpj.replace(/\D/g, '')}/${anoCompra}/${sequencialCompra}`
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      if (error.response?.status === 404) {
        return {
          encontrado: false,
          mensagem: 'Compra não encontrada'
        };
      }
      throw new HttpException(
        `Erro ao consultar compra: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ RESULTADO DE ITENS DA COMPRA ============

  async incluirResultadoItem(anoCompra: string, sequencialCompra: string, numeroItem: string, resultado: any, cnpjEscopo?: string): Promise<PncpResponseDto> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    // Determinar tipo de pessoa pela quantidade de dígitos do NI
    // tipoPessoaId: "PJ" = Pessoa Jurídica, "PF" = Pessoa Física, "PE" = Pessoa Estrangeira
    const niFornecedor = resultado.cnpj_fornecedor?.replace(/\D/g, '') || '';
    const tipoPessoaId = niFornecedor.length === 11 ? 'PF' : 'PJ';
    
    // Calcular percentual de desconto se não informado
    const valorUnitarioEstimado = parseFloat(resultado.valor_unitario_estimado) || parseFloat(resultado.valor_unitario_homologado) || 0;
    const valorUnitarioHomologado = parseFloat(resultado.valor_unitario_homologado) || 0;
    let percentualDesconto = parseFloat(resultado.percentual_desconto) || 0;
    if (percentualDesconto === 0 && valorUnitarioEstimado > 0 && valorUnitarioHomologado < valorUnitarioEstimado) {
      percentualDesconto = ((valorUnitarioEstimado - valorUnitarioHomologado) / valorUnitarioEstimado) * 100;
    }
    
    // Conforme Manual de Integração PNCP 6.3.15
    const resultadoDto = {
      dataResultado: resultado.data_resultado || new Date().toISOString().split('T')[0],
      niFornecedor: niFornecedor,
      nomeRazaoSocialFornecedor: resultado.nome_fornecedor,
      quantidadeHomologada: parseFloat(resultado.quantidade_homologada) || 1,
      valorUnitarioHomologado: valorUnitarioHomologado,
      valorTotalHomologado: parseFloat(resultado.valor_total_homologado) || 
        (parseFloat(resultado.quantidade_homologada) * valorUnitarioHomologado) || 0,
      percentualDesconto: Math.round(percentualDesconto * 10000) / 10000, // 4 casas decimais
      indicadorSubcontratacao: resultado.subcontratacao || false,
      tipoPessoaId: tipoPessoaId, // "PJ", "PF" ou "PE" (TEXTO 2 caracteres!)
      porteFornecedorId: resultado.porte_fornecedor_id || 3, // 1=ME, 2=EPP, 3=Demais, 4=N/A, 5=Não Informado
      codigoPais: resultado.codigo_pais || 'BRA', // ISO Alpha-3: BRA, ARG, USA, etc.
      // Campos obrigatórios adicionais
      aplicacaoMargemPreferencia: resultado.aplicacao_margem_preferencia || false,
      aplicacaoBeneficioMeEpp: resultado.aplicacao_beneficio_me_epp || false,
      aplicacaoCriterioDesempate: resultado.aplicacao_criterio_desempate || false,
    };
    
    this.logger.log(`Enviando resultado: ${JSON.stringify(resultadoDto)}`);

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/itens/${numeroItem}/resultados`,
        resultadoDto
      );

      this.logger.log(`Resultado do item ${numeroItem} incluído na compra ${anoCompra}/${sequencialCompra}`);

      return {
        sucesso: true,
        mensagem: `Resultado incluído com sucesso. Link: ${this.getPortalBaseUrl()}/app/editais/${cnpj.replace(/\D/g, '')}/${anoCompra}/${sequencialCompra}`,
        dados: response.data
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao incluir resultado: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async retificarResultadoItem(anoCompra: string, sequencialCompra: string, numeroItem: string, resultado: any, cnpjEscopo?: string): Promise<PncpResponseDto> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    const resultadoDto: any = {};
    if (resultado.quantidade_homologada) resultadoDto.quantidadeHomologada = parseFloat(resultado.quantidade_homologada);
    if (resultado.valor_unitario_homologado) resultadoDto.valorUnitarioHomologado = parseFloat(resultado.valor_unitario_homologado);
    if (resultado.valor_total_homologado) resultadoDto.valorTotalHomologado = parseFloat(resultado.valor_total_homologado);
    if (resultado.situacao_id) resultadoDto.situacaoCompraItemResultadoId = resultado.situacao_id;

    // Adicionar campos obrigatórios para retificação
    const niFornecedor = resultado.cnpj_fornecedor?.replace(/\D/g, '') || '';
    const tipoPessoaId = niFornecedor.length === 11 ? 'PF' : 'PJ';
    
    if (resultado.cnpj_fornecedor) resultadoDto.niFornecedor = niFornecedor;
    if (resultado.nome_fornecedor) resultadoDto.nomeRazaoSocialFornecedor = resultado.nome_fornecedor;
    if (resultado.data_resultado) resultadoDto.dataResultado = resultado.data_resultado;
    if (resultado.percentual_desconto !== undefined) resultadoDto.percentualDesconto = parseFloat(resultado.percentual_desconto);
    
    resultadoDto.tipoPessoaId = resultado.tipo_pessoa_id || tipoPessoaId;
    resultadoDto.porteFornecedorId = resultado.porte_fornecedor_id || 3;
    resultadoDto.codigoPais = resultado.codigo_pais || 'BRA';
    resultadoDto.indicadorSubcontratacao = resultado.subcontratacao || false;
    resultadoDto.aplicacaoMargemPreferencia = resultado.aplicacao_margem_preferencia || false;
    resultadoDto.aplicacaoBeneficioMeEpp = resultado.aplicacao_beneficio_me_epp || false;
    resultadoDto.aplicacaoCriterioDesempate = resultado.aplicacao_criterio_desempate || false;
    
    this.logger.log(`Retificando resultado: ${JSON.stringify(resultadoDto)}`);

    try {
      await this.axiosInstance.put(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/itens/${numeroItem}/resultados/${resultado.sequencial_resultado || 1}`,
        resultadoDto
      );

      this.logger.log(`Resultado do item ${numeroItem} retificado`);

      return {
        sucesso: true,
        mensagem: 'Resultado retificado com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao retificar resultado: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ ATA DE REGISTRO DE PREÇO ============

  async incluirAtaRegistroPreco(anoCompra: string, sequencialCompra: string, ata: any): Promise<PncpResponseDto> {
    const cnpj = ata.cnpj_orgao || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const ataDto = {
      numeroAtaRegistroPreco: ata.numero_ata,
      anoAta: ata.ano_ata || new Date().getFullYear(),
      dataAssinatura: ata.data_assinatura,
      dataVigenciaInicio: ata.data_vigencia_inicio,
      dataVigenciaFim: ata.data_vigencia_fim,
      possibilidadeAdesao: Boolean(ata.possibilidade_adesao),
      partesEnvolvidas: ata.partes_envolvidas || [
        {
          tipoParteEnvolvidaId: 1,
          cnpj: cnpjLimpo,
          codigoUnidadeCompradora: String(ata.codigo_unidade || '1'),
        },
      ],
    };

    try {
      await this.getValidToken();
      // A API PNCP v2.5 exige multipart: metadados JSON na parte "ata"
      // e o arquivo correspondente na parte "documento".
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('ata', Buffer.from(JSON.stringify(ataDto), 'utf-8'), {
        filename: 'ata.json',
        contentType: 'application/json',
      });
      const pdfAta = ata.arquivo_buffer || Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n199\n%%EOF',
      );
      formData.append('documento', pdfAta, {
        filename: ata.nome_arquivo || 'ata-registro-precos.pdf',
        contentType: 'application/pdf',
      });

      const response = await axios.post(
        `${this.configService.get<string>('PNCP_API_URL') || 'https://treina.pncp.gov.br/api/pncp/v1'}/orgaos/${cnpjLimpo}/compras/${anoCompra}/${sequencialCompra}/atas`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.token}`,
            'Titulo-Documento': ata.titulo_documento || `Ata de Registro de Precos ${ata.numero_ata}`,
            'Tipo-Documento-Id': '11',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );

      const location = response.headers?.location || '';
      const sequencialAta =
        response.data?.sequencialAta ||
        location.match(/\/atas\/(\d+)\/?$/)?.[1];

      this.logger.log(`Ata de Registro de Preço incluída: ${sequencialAta}`);

      return {
        sucesso: true,
        mensagem: `Ata incluída com sucesso. Link: ${this.getPortalBaseUrl()}/app/atas/${cnpjLimpo}/${anoCompra}/${sequencialCompra}/${sequencialAta}`,
        dados: { sequencialAta, location, ...response.data }
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao incluir ata: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async retificarAtaRegistroPreco(anoCompra: string, sequencialCompra: string, sequencialAta: string, ata: any): Promise<PncpResponseDto> {
    const cnpj = ata.cnpj_orgao || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    // Campos para retificação da ata (todos obrigatórios para PUT)
    const ataDto: any = {
      numeroAtaRegistroPreco: ata.numero_ata,
      anoAta: ata.ano_ata || new Date().getFullYear(),
      dataAssinatura: ata.data_assinatura,
      dataVigenciaInicio: ata.data_vigencia_inicio,
      dataVigenciaFim: ata.data_vigencia_fim,
      possibilidadeAdesao: Boolean(ata.possibilidade_adesao),
      justificativa: ata.justificativa || 'Retificação de dados da ata',
    };
    
    this.logger.log(`Retificando ata: ${JSON.stringify(ataDto)}`);

    try {
      await this.axiosInstance.put(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/atas/${sequencialAta}`,
        ataDto
      );

      this.logger.log(`Ata ${sequencialAta} retificada`);

      return {
        sucesso: true,
        mensagem: 'Ata retificada com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao retificar ata: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async excluirAtaRegistroPreco(
    anoCompra: string,
    sequencialCompra: string,
    sequencialAta: string,
    justificativa: string,
    cnpjOrgao?: string,
  ): Promise<PncpResponseDto> {
    const cnpj = cnpjOrgao || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.axiosInstance.delete(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/atas/${sequencialAta}`,
        { data: { justificativa: justificativa || 'Exclusão para teste de integração' } }
      );

      this.logger.log(`Ata ${sequencialAta} excluída`);

      return {
        sucesso: true,
        mensagem: 'Ata excluída com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao excluir ata: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ CONTRATOS - INCLUSÃO / RETIFICAÇÃO / EXCLUSÃO ============

  async incluirContrato(contrato: any): Promise<PncpResponseDto> {
    const cnpj = contrato.cnpj_orgao || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    const contratoDto = {
      codigoUnidade: contrato.codigo_unidade || '1',
      anoContrato: contrato.ano_contrato || new Date().getFullYear(),
      tipoContratoId: contrato.tipo_contrato_id || 1,
      numeroContratoEmpenho: contrato.numero_contrato,
      objetoContrato: contrato.objeto,
      valorInicial: parseFloat(contrato.valor_inicial) || 0,
      valorGlobal: parseFloat(contrato.valor_global) || parseFloat(contrato.valor_inicial) || 0,
      dataAssinatura: contrato.data_assinatura,
      dataVigenciaInicio: contrato.data_vigencia_inicio,
      dataVigenciaFim: contrato.data_vigencia_fim,
      cnpjFornecedor: contrato.cnpj_fornecedor?.replace(/\D/g, ''),
      nomeRazaoSocialFornecedor: contrato.nome_fornecedor,
    };

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj.replace(/\D/g, '')}/contratos`,
        contratoDto
      );

      this.logger.log(`Contrato incluído no PNCP: ${response.data?.numeroControlePNCP}`);

      return {
        sucesso: true,
        numeroControlePNCP: response.data?.numeroControlePNCP,
        mensagem: 'Contrato incluído com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao incluir contrato: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async retificarContrato(anoContrato: string, sequencialContrato: string, contrato: any): Promise<PncpResponseDto> {
    const cnpj = contrato.cnpj_orgao || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    const contratoDto: any = {
      justificativa:
        contrato.justificativa ||
        'Retificação de dados pela plataforma PortalDCP',
    };
    if (contrato.objeto) contratoDto.objetoContrato = contrato.objeto;
    if (contrato.valor_inicial !== undefined) {
      contratoDto.valorInicial = parseFloat(contrato.valor_inicial);
    }
    if (contrato.valor_global !== undefined) {
      contratoDto.valorGlobal = parseFloat(contrato.valor_global);
    }
    if (contrato.data_vigencia_fim) {
      contratoDto.dataVigenciaFim = contrato.data_vigencia_fim;
    }
    if (contrato.informacao_complementar) {
      contratoDto.informacaoComplementar = contrato.informacao_complementar;
    }

    try {
      await this.axiosInstance.patch(
        `/orgaos/${cnpj.replace(/\D/g, '')}/contratos/${anoContrato}/${sequencialContrato}`,
        contratoDto
      );

      this.logger.log(`Contrato retificado: ${anoContrato}/${sequencialContrato}`);

      return {
        sucesso: true,
        mensagem: 'Contrato retificado com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao retificar contrato: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async excluirContrato(
    anoContrato: string,
    sequencialContrato: string,
    justificativa: string,
    cnpjOrgao?: string,
  ): Promise<PncpResponseDto> {
    const cnpj = cnpjOrgao || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.axiosInstance.delete(
        `/orgaos/${cnpj.replace(/\D/g, '')}/contratos/${anoContrato}/${sequencialContrato}`,
        { data: { justificativaExclusao: justificativa } }
      );

      this.logger.log(`Contrato excluído: ${anoContrato}/${sequencialContrato}`);

      return {
        sucesso: true,
        mensagem: 'Contrato excluído com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao excluir contrato: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async consultarContrato(anoContrato: string, sequencialContrato: string, cnpjEscopo?: string): Promise<any> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    try {
      const response = await this.axiosInstance.get(
        `/orgaos/${cnpj.replace(/\D/g, '')}/contratos/${anoContrato}/${sequencialContrato}`
      );

      return {
        encontrado: true,
        contrato: response.data
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      if (error.response?.status === 404) {
        return {
          encontrado: false,
          mensagem: 'Contrato não encontrado'
        };
      }
      throw new HttpException(
        `Erro ao consultar contrato: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ CONSULTA STATUS PCA ============

  async consultarStatusPCA(pcaId: string): Promise<any> {
    const sincronizacoes = await this.pncpSyncRepository.find({
      where: { entidade_id: pcaId, tipo: TipoSincronizacao.PCA },
      order: { created_at: 'DESC' }
    });
    
    return {
      pcaId,
      sincronizacoes,
      totalTentativas: sincronizacoes.length,
      ultimoStatus: sincronizacoes[0]?.status || 'NUNCA_ENVIADO'
    };
  }

  async consultarPCAsNoOrgao(cnpjEscopo?: string): Promise<any> {
    const cnpj = this.cnpjDaOperacao(cnpjEscopo);

    try {
      const response = await this.axiosInstance.get(`/orgaos/${cnpj.replace(/\D/g, '')}/pca`);
      return {
        orgao: cnpj,
        pcas: response.data,
        total: response.data?.length || 0
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      if (error.response?.status === 404) {
        return {
          orgao: cnpj,
          pcas: [],
          total: 0,
          mensagem: 'Nenhum PCA encontrado para este órgão'
        };
      }
      throw new HttpException(
        `Erro ao consultar PCAs: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ CONFIGURAÇÃO E TESTE ============

  async verificarConfiguracao(): Promise<any> {
    // Usar getEnvVar para garantir que funcione no Railway
    const apiUrl = this.getEnvVar('PNCP_API_URL') || '';
    const login = this.getEnvVar('PNCP_LOGIN');
    const senha = this.getEnvVar('PNCP_SENHA');
    const cnpj = this.getEnvVar('PNCP_CNPJ_ORGAO');
    this.logger.debug(
      `verificarConfiguracao: apiUrl=${!!apiUrl} login=${!!login} senha=${!!senha} cnpj=${!!cnpj}`,
    );

    return {
      configurado: !!(login && cnpj && apiUrl && senha),
      ambiente: apiUrl.includes('treina') ? 'TREINAMENTO' : 
               apiUrl.includes('pncp.gov.br') ? 'PRODUÇÃO' : 'NÃO CONFIGURADO',
      cnpjOrgao: cnpj ? this.formatarCNPJ(cnpj) : null,
      loginConfigurado: !!login,
      debug: {
        apiUrlDefinido: !!apiUrl,
        loginDefinido: !!login,
        senhaDefinida: !!senha,
        cnpjDefinido: !!cnpj,
        apiUrlParcial: apiUrl ? apiUrl.substring(0, 40) : null,
        railwayEnv: process.env.RAILWAY_ENVIRONMENT || null
      }
    };
  }

  async testarConexao(request?: any): Promise<{
    sucesso: boolean;
    mensagem: string;
    detalhes?: any;
  }> {
    try {
      // Tentar fazer login com credenciais da requisição se disponíveis
      if (request) {
        await this.getValidTokenWithRequest(request);
      } else {
        await this.login();
      }
      
      return {
        sucesso: true,
        mensagem: 'Conexão com PNCP estabelecida com sucesso!'
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      return {
        sucesso: false,
        mensagem: `Erro na conexão: ${this.extrairMensagemErro(error)}`,
        detalhes: error.response?.data
      };
    }
  }

  async atualizarConfiguracao(config: {
    apiUrl?: string;
    login?: string;
    senha?: string;
    cnpjOrgao?: string;
  }): Promise<{
    sucesso: boolean;
    mensagem: string;
  }> {
    try {
      // Atualizar variáveis de ambiente em tempo de execução
      if (config.apiUrl) {
        process.env.PNCP_API_URL = config.apiUrl;
      }
      if (config.login) {
        process.env.PNCP_LOGIN = config.login;
      }
      if (config.senha) {
        process.env.PNCP_SENHA = config.senha;
      }
      if (config.cnpjOrgao) {
        process.env.PNCP_CNPJ_ORGAO = config.cnpjOrgao;
      }

      // Reconfigurar axios com novas credenciais
      this.initializeAxios();

      this.logger.log('[CONFIG] Configurações PNCP atualizadas com sucesso');
      
      return {
        sucesso: true,
        mensagem: 'Configurações PNCP atualizadas com sucesso!'
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      this.logger.error('[CONFIG] Erro ao atualizar configurações PNCP:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao atualizar configurações: ${error.message}`
      };
    }
  }

  private formatarCNPJ(cnpj: string): string {
    const numeros = cnpj.replace(/\D/g, '');
    if (numeros.length !== 14) return cnpj;
    return numeros.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  }

  // ============ ÓRGÃOS E UNIDADES ============

  async consultarOrgao(cnpj: string): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    try {
      const response = await this.axiosInstance.get(`/orgaos/${cnpjLimpo}`);
      return {
        encontrado: true,
        orgao: response.data
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      if (error.response?.status === 404) {
        return {
          encontrado: false,
          mensagem: 'Órgão não cadastrado no PNCP. É necessário cadastrá-lo primeiro.'
        };
      }
      throw new HttpException(
        `Erro ao consultar órgão: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async cadastrarOrgao(orgao: any): Promise<any> {
    const orgaoDto = {
      cnpj: orgao.cnpj?.replace(/\D/g, ''),
      razaoSocial: orgao.razaoSocial || orgao.nome,
      poderId: orgao.poderId || 'E', // E=Executivo, L=Legislativo, J=Judiciário
      esferaId: orgao.esferaId || 'M', // F=Federal, E=Estadual, M=Municipal
    };

    try {
      const response = await this.axiosInstance.post('/orgaos', orgaoDto);
      this.logger.log(`Órgão cadastrado no PNCP: ${orgaoDto.cnpj}`);
      return {
        sucesso: true,
        orgao: response.data,
        mensagem: 'Órgão cadastrado com sucesso no PNCP'
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      throw new HttpException(
        `Erro ao cadastrar órgão: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async listarUnidades(cnpj: string): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    try {
      const response = await this.axiosInstance.get(`/orgaos/${cnpjLimpo}/unidades`);
      return {
        unidades: response.data,
        total: response.data?.length || 0
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      if (error.response?.status === 404) {
        return {
          unidades: [],
          total: 0,
          mensagem: 'Nenhuma unidade encontrada ou órgão não cadastrado'
        };
      }
      throw new HttpException(
        `Erro ao listar unidades: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async cadastrarUnidade(cnpj: string, unidade: any): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    const unidadeDto = {
      codigoUnidade: unidade.codigo || '1',
      nomeUnidade: unidade.nome || 'Unidade Principal',
      codigoIbge: unidade.codigoIbge ? parseInt(unidade.codigoIbge) : null,
      uf: unidade.uf || null,
      municipioNome: unidade.municipio || null,
    };

    try {
      const response = await this.axiosInstance.post(`/orgaos/${cnpjLimpo}/unidades`, unidadeDto);
      this.logger.log(`Unidade cadastrada no PNCP: ${unidadeDto.codigoUnidade}`);
      return {
        sucesso: true,
        unidade: response.data,
        mensagem: 'Unidade cadastrada com sucesso no PNCP'
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      throw new HttpException(
        `Erro ao cadastrar unidade: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ USUÁRIO E ENTES AUTORIZADOS ============

  private getIdUsuarioFromToken(): string | null {
    if (!this.token) return null;
    try {
      // Decodificar o JWT para obter o idBaseDados
      const parts = this.token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload.idBaseDados?.toString() || null;
    } catch {
      return null;
    }
  }

  async consultarUsuario(request?: any): Promise<any> {
    // Garantir que temos um token válido com as credenciais da requisição
    if (request) {
      await this.getValidTokenWithRequest(request);
    } else {
      await this.getValidToken();
    }
    const idUsuario = this.getIdUsuarioFromToken();
    
    if (!idUsuario) {
      throw new HttpException('Não foi possível obter o ID do usuário do token', HttpStatus.BAD_REQUEST);
    }
    
    try {
      const response = await this.axiosInstance.get(`/usuarios/${idUsuario}`);
      return {
        usuario: response.data,
        entesAutorizados: response.data?.entesAutorizados || []
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      throw new HttpException(
        `Erro ao consultar usuário: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async atualizarEntesAutorizados(cnpjs: string[]): Promise<any> {
    // Garantir que temos um token válido
    await this.getValidToken();
    const idUsuario = this.getIdUsuarioFromToken();
    
    if (!idUsuario) {
      throw new HttpException('Não foi possível obter o ID do usuário do token', HttpStatus.BAD_REQUEST);
    }
    
    // Limpar CNPJs (remover formatação)
    const cnpjsLimpos = cnpjs.map(c => c.replace(/\D/g, ''));
    
    const updateDto = {
      entesAutorizados: cnpjsLimpos
    };

    try {
      const response = await this.axiosInstance.post(
        `/usuarios/${idUsuario}/orgaos`,
        updateDto,
      );
      this.logger.log(`Entes autorizados atualizados: ${cnpjsLimpos.join(', ')}`);
      return {
        sucesso: true,
        entesAutorizados: cnpjsLimpos,
        mensagem: 'Entes autorizados atualizados com sucesso'
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      throw new HttpException(
        `Erro ao atualizar entes autorizados: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async vincularEnte(cnpj: string): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    // Primeiro, buscar os entes já autorizados
    const usuarioAtual = await this.consultarUsuario();
    const entesAtuais = usuarioAtual.entesAutorizados || [];
    
    // Extrair apenas os CNPJs dos entes (podem ser objetos ou strings)
    const cnpjsAtuais = entesAtuais.map((e: any) => 
      typeof e === 'string' ? e.replace(/\D/g, '') : e.cnpj?.replace(/\D/g, '')
    ).filter(Boolean);
    
    // Verificar se já está vinculado
    if (cnpjsAtuais.includes(cnpjLimpo)) {
      return {
        sucesso: true,
        mensagem: 'Ente já está vinculado ao usuário',
        entesAutorizados: cnpjsAtuais
      };
    }
    
    // O endpoint de inclusão recebe somente os novos entes; reenviar os já
    // existentes pode ser recusado como duplicidade pelo PNCP.
    return this.atualizarEntesAutorizados([cnpjLimpo]);
  }

  async associarEnteAoOrgaoLocal(dados: {
    cnpjEnte: string;
    orgaoId: string;
    codigoUnidade: string;
    reassociar?: boolean;
  }): Promise<any> {
    const cnpjEnte = String(dados.cnpjEnte || '').replace(/\D/g, '');
    const codigoUnidade = String(dados.codigoUnidade || '').trim();
    if (cnpjEnte.length !== 14) {
      throw new HttpException('CNPJ do ente PNCP inválido', HttpStatus.BAD_REQUEST);
    }
    if (!dados.orgaoId || !codigoUnidade) {
      throw new HttpException(
        'Selecione o órgão local e a unidade PNCP',
        HttpStatus.BAD_REQUEST,
      );
    }

    const consultaUsuario = await this.consultarUsuario();
    const entes = consultaUsuario.entesAutorizados || [];
    const enteAutorizado = entes.find((ente: any) => {
      const cnpj = typeof ente === 'string' ? ente : ente?.cnpj;
      return String(cnpj || '').replace(/\D/g, '') === cnpjEnte;
    });
    if (!enteAutorizado) {
      throw new HttpException(
        'O CNPJ informado ainda não está entre os entes autorizados deste usuário PNCP',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.getValidToken();
    const unidadesResponse = await this.axiosInstance.get(
      `/orgaos/${cnpjEnte}/unidades`,
    );
    const unidades = Array.isArray(unidadesResponse.data)
      ? unidadesResponse.data
      : [];
    const unidade = unidades.find(
      (item: any) => String(item.codigoUnidade) === codigoUnidade,
    );
    if (!unidade) {
      throw new HttpException(
        `A unidade ${codigoUnidade} não pertence ao ente autorizado`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const orgaoLocal = await this.orgaoRepository.findOne({
      where: { id: dados.orgaoId },
    });
    if (!orgaoLocal) {
      throw new HttpException('Órgão local não encontrado', HttpStatus.NOT_FOUND);
    }

    const vinculoExistente = await this.orgaoRepository.findOne({
      where: { pncp_cnpj_orgao: cnpjEnte, pncp_vinculado: true },
    });
    if (vinculoExistente && vinculoExistente.id !== orgaoLocal.id) {
      if (!dados.reassociar) {
        throw new HttpException(
          {
            codigo: 'ENTE_JA_ASSOCIADO',
            message: `O ente já está associado ao órgão local "${vinculoExistente.nome}"`,
            orgaoAtual: {
              id: vinculoExistente.id,
              nome: vinculoExistente.nome,
            },
          },
          HttpStatus.CONFLICT,
        );
      }
      vinculoExistente.pncp_vinculado = false;
      vinculoExistente.pncp_cnpj_orgao = undefined as any;
      vinculoExistente.pncp_codigo_unidade = undefined as any;
      vinculoExistente.pncp_status = 'PENDENTE';
      vinculoExistente.pncp_data_vinculacao = undefined as any;
      await this.orgaoRepository.save(vinculoExistente);
    }

    orgaoLocal.pncp_vinculado = true;
    orgaoLocal.pncp_cnpj_orgao = cnpjEnte;
    orgaoLocal.pncp_codigo_unidade = codigoUnidade;
    orgaoLocal.pncp_status = 'VINCULADO';
    orgaoLocal.pncp_data_vinculacao = new Date();
    await this.orgaoRepository.save(orgaoLocal);

    return {
      sucesso: true,
      mensagem: 'Ente PNCP associado ao órgão local com sucesso',
      vinculo: {
        orgaoId: orgaoLocal.id,
        orgaoNome: orgaoLocal.nome,
        cnpjLocal: orgaoLocal.cnpj,
        cnpjPncp: cnpjEnte,
        codigoUnidade,
        nomeUnidade: unidade.nomeUnidade || null,
      },
    };
  }

  // ============ UNIDADES DO ÓRGÃO ============

  async consultarUnidadesOrgao(cnpj: string): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    try {
      await this.getValidToken();
      
      this.logger.log(`Consultando unidades do órgão: ${cnpjLimpo}`);
      
      // Endpoint oficial: GET /v1/orgaos/{cnpj}/unidades
      const url = `/orgaos/${cnpjLimpo}/unidades`;
      const response = await this.axiosInstance.get(url);
      
      if (response.data && Array.isArray(response.data)) {
        const unidades = response.data.map((u: any) => ({
          codigoUnidade: String(u.codigoUnidade),
          nomeUnidade: u.nomeUnidade || `Unidade ${u.codigoUnidade}`,
          municipio: u.municipio?.nomeIBGE || u.municipioNome || '',
          uf: u.uf?.siglaUF || u.ufSigla || ''
        }));
        
        this.logger.log(`Encontradas ${unidades.length} unidades para o órgão ${cnpjLimpo}`);
        
        return {
          cnpj: cnpjLimpo,
          unidades: unidades,
          total: unidades.length
        };
      }
      
      // Se retornou objeto único ao invés de array
      if (response.data && response.data.codigoUnidade) {
        return {
          cnpj: cnpjLimpo,
          unidades: [{
            codigoUnidade: String(response.data.codigoUnidade),
            nomeUnidade: response.data.nomeUnidade || `Unidade ${response.data.codigoUnidade}`,
            municipio: response.data.municipio?.nomeIBGE || '',
            uf: response.data.uf?.siglaUF || ''
          }],
          total: 1
        };
      }
      
      // Fallback
      return {
        cnpj: cnpjLimpo,
        unidades: [{
          codigoUnidade: '1',
          nomeUnidade: 'Unidade Principal'
        }],
        total: 1,
        mensagem: 'Nenhuma unidade encontrada.'
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      this.logger.error(`Erro ao consultar unidades: ${error.message}`);
      return {
        cnpj: cnpjLimpo,
        unidades: [{
          codigoUnidade: '1',
          nomeUnidade: 'Unidade Principal'
        }],
        total: 1,
        erro: error.message
      };
    }
  }

  // ============ IMPORTAÇÃO DE PCAs DO PNCP ============

  async consultarPCAsNoPncp(cnpj: string, ano?: number): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    try {
      // Garantir token válido
      await this.getValidToken();
      
      this.logger.log(`Consultando PCAs para CNPJ: ${cnpjLimpo}`);
      
      const pcasEncontrados: any[] = [];
      const anoAtual = new Date().getFullYear();
      const anosParaBuscar = ano ? [ano] : [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];
      
      for (const anoBusca of anosParaBuscar) {
        try {
          // Primeiro, consultar quantidade de PCAs no ano
          // GET /v1/orgaos/{cnpj}/pca/{ano}/quantidade
          const urlQuantidade = `/orgaos/${cnpjLimpo}/pca/${anoBusca}/quantidade`;
          this.logger.log(`Consultando quantidade: ${urlQuantidade}`);
          
          const respQuantidade = await this.axiosInstance.get(urlQuantidade);
          const quantidade = respQuantidade.data?.quantidade || respQuantidade.data || 0;
          
          this.logger.log(`Ano ${anoBusca}: ${quantidade} PCA(s) encontrado(s)`);
          
          if (quantidade > 0) {
            // Buscar cada PCA pelo sequencial
            for (let seq = 1; seq <= quantidade + 5; seq++) {
              try {
                // GET /v1/orgaos/{cnpj}/pca/{ano}/{sequencial}/itens/plano
                const urlPlano = `/orgaos/${cnpjLimpo}/pca/${anoBusca}/${seq}/itens/plano`;
                this.logger.log(`Buscando PCA: ${urlPlano}`);
                
                const respPlano = await this.axiosInstance.get(urlPlano);
                if (respPlano.data) {
                  pcasEncontrados.push({
                    ...respPlano.data,
                    anoPca: anoBusca,
                    sequencialPca: seq,
                    quantidadeItensPlano: respPlano.data?.itens?.length || 0
                  });
                  this.logger.log(`PCA encontrado: ${anoBusca}/${seq}`);
                }
              } catch (errCapturado: unknown) {
                const err = comoErro(errCapturado);
                // 404 = não existe esse sequencial, continua
                if (err.response?.status !== 404) {
                  this.logger.warn(`Erro ao buscar PCA ${anoBusca}/${seq}: ${err.response?.status}`);
                }
              }
            }
          }
        } catch (errCapturado: unknown) {
          const err = comoErro(errCapturado);
          // Erro ao consultar quantidade do ano, tentar próximo ano
          this.logger.warn(`Erro ao consultar quantidade para ano ${anoBusca}: ${err.response?.status}`);
        }
      }
      
      this.logger.log(`Total de PCAs encontrados: ${pcasEncontrados.length}`);
      
      return {
        cnpj: cnpjLimpo,
        pcas: pcasEncontrados,
        total: pcasEncontrados.length,
        ambienteTreinamento: false
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      this.logger.error(`Erro ao consultar PCAs no PNCP: ${error.message}`);
      return {
        cnpj: cnpjLimpo,
        pcas: [],
        total: 0,
        ambienteTreinamento: true,
        mensagem: 'Erro ao consultar PCAs. Use a importação manual.'
      };
    }
  }

  async consultarPCADetalhado(cnpj: string, ano: number, sequencial: number): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    try {
      // Garantir token válido
      await this.getValidToken();
      
      // Usar a API autenticada: GET /orgaos/{cnpj}/pca/{ano}/{sequencial}/itens/plano
      const url = `/orgaos/${cnpjLimpo}/pca/${ano}/${sequencial}/itens/plano`;
      this.logger.log(`Consultando PCA detalhado: ${url}`);
      
      const response = await this.axiosInstance.get(url);
      return {
        sucesso: true,
        pca: response.data
      };
    } catch (errorCapturado: unknown) {
      const error = comoErro(errorCapturado);
      this.logger.error(`Erro ao consultar PCA detalhado: ${error.message}`, error.response?.data);
      if (error.response?.status === 404) {
        return {
          sucesso: false,
          mensagem: 'PCA não encontrado no PNCP'
        };
      }
      throw new HttpException(
        `Erro ao consultar PCA: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async importarPCADoPncp(orgaoId: string, cnpj: string, ano: number, sequencial: number): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    // 1. Buscar dados do PCA no PNCP
    const pcaDetalhado = await this.consultarPCADetalhado(cnpjLimpo, ano, sequencial);
    
    if (!pcaDetalhado.sucesso) {
      throw new HttpException(pcaDetalhado.mensagem || 'PCA não encontrado no PNCP', HttpStatus.NOT_FOUND);
    }

    const pcaPncp = pcaDetalhado.pca;
    
    // 2. Verificar se já existe PCA local para este ano/órgão
    const pcaExistente = await this.pcaRepository.findOne({
      where: { orgao_id: orgaoId, ano_exercicio: ano }
    });

    if (pcaExistente) {
      // Atualizar PCA existente com dados do PNCP
      pcaExistente.enviado_pncp = true;
      pcaExistente.sequencial_pncp = sequencial;
      pcaExistente.numero_controle_pncp = `${cnpjLimpo}-${ano}-${sequencial}`;
      pcaExistente.data_envio_pncp = pcaPncp.dataPublicacaoPncp ? new Date(pcaPncp.dataPublicacaoPncp) : new Date();
      pcaExistente.status = 'ENVIADO_PNCP' as any;
      
      await this.pcaRepository.save(pcaExistente);
      
      this.logger.log(`PCA ${ano}/${sequencial} sincronizado com registro existente`);
      
      return {
        sucesso: true,
        mensagem: 'PCA sincronizado com registro existente',
        pca: pcaExistente,
        acao: 'atualizado'
      };
    }

    // 3. Criar novo PCA local com dados do PNCP
    const novoPca = this.pcaRepository.create({
      orgao_id: orgaoId,
      ano_exercicio: ano,
      numero_pca: `PCA ${ano}`,
      status: 'ENVIADO_PNCP' as any,
      enviado_pncp: true,
      sequencial_pncp: sequencial,
      numero_controle_pncp: `${cnpjLimpo}-${ano}-${sequencial}`,
      data_envio_pncp: pcaPncp.dataPublicacaoPncp ? new Date(pcaPncp.dataPublicacaoPncp) : new Date(),
      data_publicacao: pcaPncp.dataPublicacaoPncp ? new Date(pcaPncp.dataPublicacaoPncp) : undefined,
      valor_total_estimado: 0,
      quantidade_itens: pcaPncp.quantidadeItensPlano || 0,
      observacoes: `Importado do PNCP em ${new Date().toISOString()}`
    });

    await this.pcaRepository.save(novoPca);
    
    this.logger.log(`PCA ${ano}/${sequencial} importado do PNCP`);

    return {
      sucesso: true,
      mensagem: 'PCA importado do PNCP com sucesso',
      pca: novoPca,
      acao: 'criado'
    };
  }

  async sincronizarTodosPCAsDoPncp(orgaoId: string, cnpj: string): Promise<any> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    // 1. Buscar todos os PCAs do órgão no PNCP
    const resultado = await this.consultarPCAsNoPncp(cnpjLimpo);
    
    if (!resultado.pcas || resultado.pcas.length === 0) {
      return {
        sucesso: true,
        mensagem: 'Nenhum PCA encontrado no PNCP para importar',
        importados: 0,
        atualizados: 0,
        erros: []
      };
    }

    const resultados = {
      importados: 0,
      atualizados: 0,
      erros: [] as string[]
    };

    // 2. Importar cada PCA
    for (const pcaPncp of resultado.pcas) {
      try {
        const importacao = await this.importarPCADoPncp(
          orgaoId, 
          cnpjLimpo, 
          pcaPncp.anoPca, 
          pcaPncp.sequencialPca
        );
        
        if (importacao.acao === 'criado') {
          resultados.importados++;
        } else {
          resultados.atualizados++;
        }
      } catch (errorCapturado: unknown) {
        const error = comoErro(errorCapturado);
        resultados.erros.push(`PCA ${pcaPncp.anoPca}/${pcaPncp.sequencialPca}: ${error.message}`);
      }
    }

    return {
      sucesso: true,
      mensagem: `Sincronização concluída: ${resultados.importados} importados, ${resultados.atualizados} atualizados`,
      ...resultados
    };
  }

  // ============ ESTATÍSTICAS ============

}

/**
 * Benefício ME/EPP do item sem consulta ao banco (prévia e ferramentas
 * manuais). A fila usa `beneficioDaUnidadeSql` (lote, cota, modo por item).
 */
function beneficioSimples(item: any, lic: any): BeneficioParaPncp {
  const ehCota = !!item?.item_cota_origem_id;
  const modo = lic?.modo_beneficio_mpe || 'GERAL';
  let tipo: BeneficioParaPncp['tipo'] = 'NENHUM';
  if (modo === 'POR_ITEM' || modo === 'POR_LOTE') {
    tipo = item?.tipo_participacao === 'EXCLUSIVO_MPE' ? 'EXCLUSIVO' : item?.tipo_participacao === 'COTA_RESERVADA' ? 'COTA_RESERVADA' : 'NENHUM';
  } else if (lic?.tipo_beneficio_mpe === 'EXCLUSIVO') {
    tipo = 'EXCLUSIVO';
  } else if (lic?.tipo_beneficio_mpe === 'COTA_RESERVADA') {
    tipo = 'COTA_RESERVADA';
  }
  if (lic?.tratamento_diferenciado_mpe === false && !ehCota) tipo = 'NENHUM';
  return { tipo: ehCota ? 'EXCLUSIVO' : tipo, ehCota, somenteMpe: ehCota || tipo === 'EXCLUSIVO' };
}
