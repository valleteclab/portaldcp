import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { PncpSync, TipoSincronizacao, StatusSincronizacao } from './entities/pncp-sync.entity';
import { Licitacao, FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { PlanoContratacaoAnual } from '../pca/entities/pca.entity';
import {
  CompraDto,
  ItemCompraDto,
  ResultadoItemDto,
  AtaRegistroPrecoDto,
  ContratoDto,
  PncpResponseDto,
  MODALIDADE_SISTEMA_PARA_PNCP,
  FASE_SISTEMA_PARA_PNCP,
  MODO_DISPUTA,
  SITUACAO_COMPRA
} from './dto/pncp.dto';

@Injectable()
export class PncpService {
  private readonly logger = new Logger(PncpService.name);
  private axiosInstance: AxiosInstance;
  private token: string = '';
  private tokenExpiration: Date | null = null;

  // Credenciais da plataforma armazenadas em memória
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
    private configService: ConfigService,
  ) {
    // Debug: verificar se as variáveis estão sendo lidas
    this.logger.log(`[INIT] ConfigService PNCP_LOGIN: ${this.configService.get('PNCP_LOGIN') ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    this.logger.log(`[INIT] process.env PNCP_LOGIN: ${process.env.PNCP_LOGIN ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    this.logger.log(`[INIT] process.env PNCP_API_URL: ${process.env.PNCP_API_URL || 'NÃO DEFINIDO'}`);
    this.initializeAxios();
  }

  // Helper para obter variáveis de ambiente
  // Prioriza process.env pois o dotenv é carregado no main.ts antes do NestJS
  private getEnvVar(key: string): string | undefined {
    return process.env[key] || this.configService.get<string>(key);
  }

  // ============ CREDENCIAIS DA PLATAFORMA ============

  setPlatformCredentials(credentials: {
    apiUrl?: string;
    login?: string;
    senha?: string;
    cnpjOrgao?: string;
  }): void {
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
    } catch (error: any) {
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
    } catch (error: any) {
      this.logger.error('Erro ao fazer login no PNCP', error.response?.data || error.message);
      throw new HttpException('Falha na autenticação PNCP', HttpStatus.UNAUTHORIZED);
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
    if (licitacao.orgao?.cnpj) {
      const cnpjLimpo = licitacao.orgao.cnpj.replace(/\D/g, '');
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
    const modalidadesValidas = ['PREGAO_ELETRONICO', 'CONCORRENCIA', 'CONCURSO', 'LEILAO', 'DIALOGO_COMPETITIVO'];
    if (modalidadesValidas.includes(licitacao.modalidade)) {
      checklist.push({ campo: 'Modalidade', status: 'ok', mensagem: licitacao.modalidade });
    } else {
      erros.push(`Modalidade inválida: ${licitacao.modalidade}`);
      checklist.push({ campo: 'Modalidade', status: 'erro', mensagem: 'Modalidade não suportada pelo PNCP' });
    }

    // === DATAS ===
    if (licitacao.data_abertura_sessao) {
      const dataAbertura = new Date(licitacao.data_abertura_sessao);
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
      const cnpj = licitacao.orgao?.cnpj || '';
      dadosEnvio = this.mapearLicitacaoParaCompra(licitacao, cnpj);
    }

    return {
      valido,
      erros,
      avisos,
      checklist,
      dadosEnvio
    };
  }

  // ============ COMPRA/LICITAÇÃO ============

  async enviarCompra(licitacaoId: string): Promise<PncpResponseDto> {
    // Primeiro validar
    const validacao = await this.validarLicitacaoParaPNCP(licitacaoId);
    if (!validacao.valido) {
      throw new HttpException(
        `Licitação não pode ser enviada ao PNCP:\n${validacao.erros.join('\n')}`,
        HttpStatus.BAD_REQUEST
      );
    }

    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.NOT_FOUND);
    }

    if (!licitacao.data_abertura_sessao) {
      throw new HttpException(
        'A data de abertura da sessão é obrigatória para enviar ao PNCP.',
        HttpStatus.BAD_REQUEST
      );
    }

    // Priorizar CNPJ do órgão da licitação, não da plataforma
    const cnpj = licitacao.orgao?.cnpj || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado. Verifique se o órgão da licitação possui CNPJ cadastrado.', HttpStatus.BAD_REQUEST);
    }
    
    this.logger.log(`Enviando compra para órgão CNPJ: ${cnpj}`);

    // Verificar se já foi enviada
    const syncExistente = await this.pncpSyncRepository.findOne({
      where: { 
        licitacao_id: licitacaoId, 
        tipo: TipoSincronizacao.COMPRA,
        status: StatusSincronizacao.ENVIADO
      }
    });

    if (syncExistente?.numero_controle_pncp) {
      // Atualizar ao invés de criar
      return this.atualizarCompra(licitacaoId, syncExistente);
    }

    // Mapear dados da licitação para o formato PNCP
    const compraDto = this.mapearLicitacaoParaCompra(licitacao, cnpj);
    
    // Log detalhado do payload para debug
    this.logger.log(`[enviarCompra] Payload completo: ${JSON.stringify(compraDto, null, 2)}`);

    // Criar registro de sincronização
    const sync = this.pncpSyncRepository.create({
      tipo: TipoSincronizacao.COMPRA,
      licitacao_id: licitacaoId,
      status: StatusSincronizacao.ENVIANDO,
      payload_enviado: compraDto
    });
    await this.pncpSyncRepository.save(sync);

    try {
      // Obter token válido
      await this.getValidToken();
      
      // PNCP requer multipart/form-data para compras
      const FormData = require('form-data');
      const formData = new FormData();
      
      // Adicionar dados da compra como JSON
      const compraBuffer = Buffer.from(JSON.stringify(compraDto), 'utf-8');
      formData.append('compra', compraBuffer, {
        filename: 'compra.json',
        contentType: 'application/json'
      });
      
      // Criar PDF mínimo válido para o documento obrigatório
      const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n199\n%%EOF');
      formData.append('documento', pdfContent, {
        filename: 'edital.pdf',
        contentType: 'application/pdf'
      });

      // Determinar tipo de documento baseado na modalidade
      // TABELA "Tipo de Documento" do PNCP (diferente de "Instrumento Convocatório"):
      // 1 = Aviso de Contratação Direta
      // 2 = Edital ← Para pregão, concorrência, etc.
      // 3 = Minuta do Contrato
      // 4 = Termo de Referência
      // etc.
      let tipoDocumentoId = '2'; // Default: Edital (código 2 na tabela Tipo de Documento)
      let tituloDocumento = 'Edital de Licitacao';
      
      const modalidade = licitacao.modalidade?.toUpperCase() || '';
      if (modalidade.includes('DISPENSA') || modalidade.includes('INEXIGIBILIDADE')) {
        tipoDocumentoId = '1'; // Aviso de Contratação Direta (código 1 na tabela Tipo de Documento)
        tituloDocumento = 'Aviso de Contratacao Direta';
      }
      
      this.logger.log(`Tipo de documento: ${tipoDocumentoId} (${tituloDocumento}) - Modalidade: ${modalidade}`);
      this.logger.log(`Enviando compra ao PNCP: ${JSON.stringify(compraDto)}`);

      const response = await axios.post(
        `${this.configService.get<string>('PNCP_API_URL') || 'https://treina.pncp.gov.br/api/pncp/v1'}/orgaos/${cnpj.replace(/\D/g, '')}/compras`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.token}`,
            'Titulo-Documento': tituloDocumento,
            'Tipo-Documento-Id': tipoDocumentoId,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      this.logger.log(`Resposta PNCP data: ${JSON.stringify(response.data)}`);
      this.logger.log(`Resposta PNCP headers: ${JSON.stringify(response.headers)}`);
      
      // Extrair dados da resposta (PNCP pode retornar em diferentes formatos)
      // Tentar do body primeiro, depois do header Location
      let numeroControlePNCP = response.data?.numeroControlePNCP || response.data?.numeroControle;
      
      // Se não veio no body, tentar extrair do header Location
      // Formato típico: /orgaos/CNPJ/compras/ANO/SEQUENCIAL
      if (!numeroControlePNCP && response.headers?.location) {
        const locationMatch = response.headers.location.match(/\/compras\/(\d+)\/(\d+)/);
        if (locationMatch) {
          const [, anoFromLocation, seqFromLocation] = locationMatch;
          // Construir número de controle
          const cnpjLimpo = cnpj.replace(/\D/g, '');
          numeroControlePNCP = `${cnpjLimpo}-1-${seqFromLocation.padStart(6, '0')}/${anoFromLocation}`;
          this.logger.log(`Número de controle extraído do header Location: ${numeroControlePNCP}`);
        }
      }
      
      // Extrair ano e sequencial do número de controle se não vier separado
      // Formato: "81448637000147-1-000003/2025" -> sequencial=3, ano=2025
      let anoCompra = response.data.ano || response.data.anoCompra;
      let sequencialCompra = response.data.sequencial || response.data.sequencialCompra;
      
      if ((!anoCompra || !sequencialCompra) && numeroControlePNCP) {
        // Formato completo: CNPJ-UNIDADE-SEQUENCIAL/ANO
        const matchCompleto = numeroControlePNCP.match(/\d+-\d+-(\d+)\/(\d+)$/);
        if (matchCompleto) {
          sequencialCompra = parseInt(matchCompleto[1]); // Remove zeros à esquerda automaticamente
          anoCompra = parseInt(matchCompleto[2]);
        }
      }
      
      sync.status = StatusSincronizacao.ENVIADO;
      sync.resposta_pncp = response.data;
      sync.numero_controle_pncp = numeroControlePNCP;
      sync.ano_compra = anoCompra;
      sync.sequencial_compra = sequencialCompra;
      await this.pncpSyncRepository.save(sync);

      // Gerar link do PNCP
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      const baseUrl = this.configService.get<string>('PNCP_API_URL')?.includes('treina') 
        ? 'https://treina.pncp.gov.br' 
        : 'https://pncp.gov.br';
      const linkPncp = `${baseUrl}/app/editais/${cnpjLimpo}/${anoCompra}/${sequencialCompra}`;

      // Atualizar licitação com número de controle PNCP e mudar fase para PUBLICADO
      // Conforme Art. 17 da Lei 14.133/2021, a publicação do edital marca o início da fase externa
      await this.licitacaoRepository.update(licitacaoId, {
        numero_controle_pncp: numeroControlePNCP, // Usar a variável já extraída (pode vir do body ou header)
        ano_compra_pncp: anoCompra,
        sequencial_compra_pncp: sequencialCompra,
        link_pncp: linkPncp,
        enviado_pncp: true,
        fase: FaseLicitacao.PUBLICADO, // Transição para fase externa - Art. 17, II da Lei 14.133/2021
        data_publicacao_edital: new Date() // Registrar data real de publicação
      });

      this.logger.log(`Compra enviada ao PNCP: ${numeroControlePNCP} - Link: ${linkPncp}`);

      return {
        sucesso: true,
        numeroControlePNCP: numeroControlePNCP, // Usar a variável já extraída
        ano: anoCompra,
        sequencial: sequencialCompra,
        link: linkPncp
      };
    } catch (error) {
      const mensagemErro = this.extrairMensagemErro(error);
      
      // Verificar se o erro indica que a compra já existe
      // Formato: "Id contratação PNCP: 81448637000147-1-000002/2025"
      const matchJaExiste = mensagemErro.match(/Id contrata[çc][aã]o PNCP:\s*(\d+)-(\d+)-(\d+)\/(\d+)/i);
      
      if (matchJaExiste) {
        // Extrair dados do ID existente
        const [, cnpjExistente, unidadeExistente, sequencialStr, anoStr] = matchJaExiste;
        const anoExistente = parseInt(anoStr);
        const sequencialExistente = parseInt(sequencialStr);
        const numeroControlePNCP = `${cnpjExistente}-${unidadeExistente}-${sequencialStr.padStart(6, '0')}/${anoStr}`;
        
        // Gerar link
        const baseUrl = this.configService.get<string>('PNCP_API_URL')?.includes('treina') 
          ? 'https://treina.pncp.gov.br' 
          : 'https://pncp.gov.br';
        const linkPncp = `${baseUrl}/app/editais/${cnpjExistente}/${anoExistente}/${sequencialExistente}`;
        
        // Vincular automaticamente
        await this.licitacaoRepository.update(licitacaoId, {
          numero_controle_pncp: numeroControlePNCP,
          ano_compra_pncp: anoExistente,
          sequencial_compra_pncp: sequencialExistente,
          link_pncp: linkPncp,
          enviado_pncp: true,
          fase: FaseLicitacao.PUBLICADO
        });
        
        sync.status = StatusSincronizacao.ENVIADO;
        sync.numero_controle_pncp = numeroControlePNCP;
        sync.ano_compra = anoExistente;
        sync.sequencial_compra = sequencialExistente;
        await this.pncpSyncRepository.save(sync);
        
        this.logger.log(`Compra já existia no PNCP, vinculada: ${numeroControlePNCP}`);
        
        return {
          sucesso: true,
          mensagem: 'Compra já existia no PNCP e foi vinculada automaticamente',
          numeroControlePNCP,
          ano: anoExistente,
          sequencial: sequencialExistente,
          link: linkPncp
        };
      }
      
      sync.status = StatusSincronizacao.ERRO;
      sync.erro_mensagem = mensagemErro;
      sync.tentativas += 1;
      sync.ultima_tentativa = new Date();
      await this.pncpSyncRepository.save(sync);

      throw new HttpException(
        `Erro ao enviar compra ao PNCP: ${mensagemErro}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // Vincular manualmente uma licitação já enviada ao PNCP
  async vincularLicitacaoExistente(
    licitacaoId: string,
    numeroControlePNCP: string,
    anoCompra: number,
    sequencialCompra: number
  ): Promise<PncpResponseDto> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.NOT_FOUND);
    }

    // Gerar link do PNCP
    const cnpj = licitacao.orgao?.cnpj?.replace(/\D/g, '') || '';
    const baseUrl = this.configService.get<string>('PNCP_API_URL')?.includes('treina') 
      ? 'https://treina.pncp.gov.br' 
      : 'https://pncp.gov.br';
    const linkPncp = `${baseUrl}/app/editais/${cnpj}/${anoCompra}/${sequencialCompra}`;

    // Atualizar licitação
    await this.licitacaoRepository.update(licitacaoId, {
      numero_controle_pncp: numeroControlePNCP,
      ano_compra_pncp: anoCompra,
      sequencial_compra_pncp: sequencialCompra,
      link_pncp: linkPncp,
      enviado_pncp: true,
      fase: FaseLicitacao.PUBLICADO
    });

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

  async atualizarCompra(licitacaoId: string, sync: PncpSync): Promise<PncpResponseDto> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.NOT_FOUND);
    }

    // Priorizar CNPJ do órgão da licitação
    const cnpj = licitacao.orgao?.cnpj || this.configService.get<string>('PNCP_CNPJ_ORGAO') || '';
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const compraDto = this.mapearLicitacaoParaCompra(licitacao, cnpj);
    
    this.logger.log(`[atualizarCompra] Atualizando compra ${sync.ano_compra}/${sync.sequencial_compra}`);
    this.logger.log(`[atualizarCompra] sigilo_orcamento=${licitacao.sigilo_orcamento}`);

    try {
      // 1. Atualizar dados da compra
      const response = await this.axiosInstance.put(
        `/orgaos/${cnpjLimpo}/compras/${sync.ano_compra}/${sync.sequencial_compra}`,
        compraDto
      );

      // 2. Retificar cada item individualmente para atualizar orcamentoSigiloso
      // O PUT da compra não atualiza os itens, precisa usar PATCH em cada item
      if (licitacao.itens && licitacao.itens.length > 0) {
        this.logger.log(`[atualizarCompra] Retificando ${licitacao.itens.length} itens...`);
        
        // Garantir token válido antes de retificar itens
        await this.getValidToken();
        
        for (const item of licitacao.itens) {
          const numeroItem = item.numero_item || (licitacao.itens.indexOf(item) + 1);
          const itemDto = this.mapearItemParaPNCP(item, numeroItem, licitacao);
          
          this.logger.log(`[atualizarCompra] Retificando item ${numeroItem}: orcamentoSigiloso=${itemDto.orcamentoSigiloso}`);
          
          try {
            this.logger.log(`[atualizarCompra] Enviando PATCH para item ${numeroItem}: ${JSON.stringify(itemDto)}`);
            const itemResponse = await this.axiosInstance.patch(
              `/orgaos/${cnpjLimpo}/compras/${sync.ano_compra}/${sync.sequencial_compra}/itens/${numeroItem}`,
              itemDto
            );
            this.logger.log(`[atualizarCompra] Item ${numeroItem} retificado com sucesso. Resposta: ${JSON.stringify(itemResponse.data)}`);
          } catch (itemError: any) {
            const errorMsg = this.extrairMensagemErro(itemError);
            const errorData = itemError.response?.data ? JSON.stringify(itemError.response.data) : 'sem dados';
            this.logger.error(`[atualizarCompra] Erro ao retificar item ${numeroItem}: ${errorMsg}. Dados: ${errorData}`);
            // Continua com os outros itens mesmo se um falhar
          }
        }
      }

      sync.status = StatusSincronizacao.ATUALIZADO;
      sync.resposta_pncp = response.data;
      sync.payload_enviado = compraDto;
      await this.pncpSyncRepository.save(sync);

      return {
        sucesso: true,
        numeroControlePNCP: sync.numero_controle_pncp,
        mensagem: 'Compra e itens atualizados com sucesso'
      };
    } catch (error) {
      sync.erro_mensagem = this.extrairMensagemErro(error);
      sync.tentativas += 1;
      sync.ultima_tentativa = new Date();
      await this.pncpSyncRepository.save(sync);

      throw new HttpException(
        `Erro ao atualizar compra no PNCP: ${sync.erro_mensagem}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ ITENS ============

  async enviarItens(licitacaoId: string): Promise<PncpResponseDto> {
    const sync = await this.pncpSyncRepository.findOne({
      where: { 
        licitacao_id: licitacaoId, 
        tipo: TipoSincronizacao.COMPRA,
        status: StatusSincronizacao.ENVIADO
      }
    });

    if (!sync?.numero_controle_pncp) {
      throw new HttpException('Compra não foi enviada ao PNCP ainda', HttpStatus.BAD_REQUEST);
    }

    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['itens', 'orgao']
    });

    if (!licitacao?.itens?.length) {
      throw new HttpException('Licitação não possui itens', HttpStatus.BAD_REQUEST);
    }

    // Priorizar CNPJ do órgão da licitação
    const cnpj = licitacao.orgao?.cnpj || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    const itensDto = licitacao.itens.map((item, index) => this.mapearItemParaPNCP(item, index + 1, licitacao));

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj}/compras/${sync.ano_compra}/${sync.sequencial_compra}/itens`,
        itensDto
      );

      // Registrar sincronização dos itens
      const syncItens = this.pncpSyncRepository.create({
        tipo: TipoSincronizacao.ITEM,
        licitacao_id: licitacaoId,
        status: StatusSincronizacao.ENVIADO,
        payload_enviado: itensDto,
        resposta_pncp: response.data,
        numero_controle_pncp: sync.numero_controle_pncp
      });
      await this.pncpSyncRepository.save(syncItens);

      return {
        sucesso: true,
        mensagem: `${itensDto.length} itens enviados com sucesso`
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao enviar itens ao PNCP: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ DOCUMENTOS ============

  async enviarDocumento(
    licitacaoId: string, 
    tipoDocumentoId: number, 
    arquivo: Buffer, 
    nomeArquivo: string
  ): Promise<PncpResponseDto> {
    const sync = await this.pncpSyncRepository.findOne({
      where: { 
        licitacao_id: licitacaoId, 
        tipo: TipoSincronizacao.COMPRA,
        status: StatusSincronizacao.ENVIADO
      }
    });

    if (!sync?.numero_controle_pncp) {
      throw new HttpException('Compra não foi enviada ao PNCP ainda', HttpStatus.BAD_REQUEST);
    }

    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('tipoDocumentoId', tipoDocumentoId.toString());
    formData.append('arquivo', arquivo, { filename: nomeArquivo });

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj}/compras/${sync.ano_compra}/${sync.sequencial_compra}/arquivos`,
        formData,
        {
          headers: {
            ...formData.getHeaders()
          }
        }
      );

      // Registrar sincronização do documento
      const syncDoc = this.pncpSyncRepository.create({
        tipo: TipoSincronizacao.DOCUMENTO,
        licitacao_id: licitacaoId,
        status: StatusSincronizacao.ENVIADO,
        payload_enviado: { tipoDocumentoId, nomeArquivo },
        resposta_pncp: response.data,
        numero_controle_pncp: sync.numero_controle_pncp
      });
      await this.pncpSyncRepository.save(syncDoc);

      return {
        sucesso: true,
        mensagem: 'Documento enviado com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao enviar documento ao PNCP: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ RESULTADO ============

  async enviarResultado(licitacaoId: string, itemNumero: number, resultado: ResultadoItemDto): Promise<PncpResponseDto> {
    const sync = await this.pncpSyncRepository.findOne({
      where: { 
        licitacao_id: licitacaoId, 
        tipo: TipoSincronizacao.COMPRA,
        status: StatusSincronizacao.ENVIADO
      }
    });

    if (!sync?.numero_controle_pncp) {
      throw new HttpException('Compra não foi enviada ao PNCP ainda', HttpStatus.BAD_REQUEST);
    }

    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj}/compras/${sync.ano_compra}/${sync.sequencial_compra}/itens/${itemNumero}/resultados`,
        resultado
      );

      // Registrar sincronização do resultado
      const syncResultado = this.pncpSyncRepository.create({
        tipo: TipoSincronizacao.RESULTADO,
        licitacao_id: licitacaoId,
        entidade_id: itemNumero.toString(),
        status: StatusSincronizacao.ENVIADO,
        payload_enviado: resultado,
        resposta_pncp: response.data,
        numero_controle_pncp: sync.numero_controle_pncp
      });
      await this.pncpSyncRepository.save(syncResultado);

      return {
        sucesso: true,
        mensagem: 'Resultado enviado com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao enviar resultado ao PNCP: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============ CONTRATO ============

  async enviarContrato(contratoData: ContratoDto): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj}/contratos`,
        contratoData
      );

      // Registrar sincronização do contrato
      const syncContrato = this.pncpSyncRepository.create({
        tipo: TipoSincronizacao.CONTRATO,
        status: StatusSincronizacao.ENVIADO,
        payload_enviado: contratoData,
        resposta_pncp: response.data,
        numero_controle_pncp: response.data.numeroControlePNCP
      });
      await this.pncpSyncRepository.save(syncContrato);

      return {
        sucesso: true,
        numeroControlePNCP: response.data.numeroControlePNCP,
        mensagem: 'Contrato enviado com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao enviar contrato ao PNCP: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
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

  async listarPendentes(): Promise<PncpSync[]> {
    return this.pncpSyncRepository.find({
      where: { status: StatusSincronizacao.PENDENTE },
      order: { created_at: 'ASC' }
    });
  }

  async listarErros(): Promise<PncpSync[]> {
    return this.pncpSyncRepository.find({
      where: { status: StatusSincronizacao.ERRO },
      order: { updated_at: 'DESC' }
    });
  }

  async reenviar(syncId: string): Promise<PncpResponseDto> {
    const sync = await this.pncpSyncRepository.findOne({ where: { id: syncId } });
    
    if (!sync) {
      throw new HttpException('Registro de sincronização não encontrado', HttpStatus.NOT_FOUND);
    }

    if (sync.tipo === TipoSincronizacao.COMPRA && sync.licitacao_id) {
      return this.enviarCompra(sync.licitacao_id);
    }

    throw new HttpException('Tipo de sincronização não suportado para reenvio', HttpStatus.BAD_REQUEST);
  }

  // ============ MAPEAMENTOS ============

  private mapearLicitacaoParaCompra(licitacao: any, cnpj: string): CompraDto {
    const anoCompra = new Date(licitacao.created_at).getFullYear();
    
    // Formatar datas no padrão ISO 8601 (YYYY-MM-DDTHH:mm:ss) SEM converter para UTC
    // O PNCP espera horário de Brasília, não UTC
    const formatarDataHora = (data: any): string => {
      if (!data) {
        // Se não tem data, usar data futura padrão (30 dias)
        const dataFutura = new Date();
        dataFutura.setDate(dataFutura.getDate() + 30);
        // Formatar em horário local (Brasília)
        const ano = dataFutura.getFullYear();
        const mes = String(dataFutura.getMonth() + 1).padStart(2, '0');
        const dia = String(dataFutura.getDate()).padStart(2, '0');
        const hora = String(dataFutura.getHours()).padStart(2, '0');
        const min = String(dataFutura.getMinutes()).padStart(2, '0');
        const seg = String(dataFutura.getSeconds()).padStart(2, '0');
        return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
      }
      
      // Se já é string no formato correto, usar diretamente
      if (typeof data === 'string') {
        // Se já tem T, extrair apenas a parte datetime
        if (data.includes('T')) {
          return data.slice(0, 19);
        }
        // Se é só data (YYYY-MM-DD), adicionar horário padrão
        return `${data}T00:00:00`;
      }
      
      const d = new Date(data);
      if (isNaN(d.getTime())) {
        const dataFutura = new Date();
        dataFutura.setDate(dataFutura.getDate() + 30);
        const ano = dataFutura.getFullYear();
        const mes = String(dataFutura.getMonth() + 1).padStart(2, '0');
        const dia = String(dataFutura.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}T00:00:00`;
      }
      
      // Formatar em horário local (Brasília), não UTC
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      const hora = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const seg = String(d.getSeconds()).padStart(2, '0');
      return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
    };

    // Datas do cronograma:
    // - data_inicio_acolhimento: Início do recebimento de propostas
    // - data_fim_acolhimento: Fim do recebimento de propostas
    // - data_abertura_sessao: Data/hora da sessão pública
    
    // Data de início de recebimento de propostas
    const dataInicioPropostas = formatarDataHora(licitacao.data_inicio_acolhimento || licitacao.data_abertura_sessao);
    
    // Data de fim de recebimento de propostas (antes da sessão)
    let dataFimPropostas = licitacao.data_fim_acolhimento;
    if (!dataFimPropostas) {
      // Se não definida, usar data da sessão como fim
      dataFimPropostas = licitacao.data_abertura_sessao;
    }
    dataFimPropostas = formatarDataHora(dataFimPropostas);
    
    this.logger.log(`[mapearLicitacaoParaCompra] Datas: inicio=${dataInicioPropostas}, fim=${dataFimPropostas}`);
    
    // Orçamento sigiloso vem da LICITAÇÃO (aba Configuração), não do item
    // Campo: sigilo_orcamento = 'PUBLICO' | 'SIGILOSO'
    const orcamentoSigiloso = licitacao.sigilo_orcamento === 'SIGILOSO';
    this.logger.log(`[mapearLicitacaoParaCompra] sigilo_orcamento=${licitacao.sigilo_orcamento}, orcamentoSigiloso=${orcamentoSigiloso}`);
    
    // Mapear itens da licitação
    // IMPORTANTE: Quando orcamentoSigiloso=true, os valores são enviados mas o PNCP deve ocultá-los
    // Conforme documentação, o campo orcamentoSigiloso indica se o valor deve ser sigiloso
    const itensCompra = (licitacao.itens || []).map((item: any, index: number) => {
      const valorUnitario = parseFloat(item.valor_unitario_estimado) || 0;
      const quantidade = parseFloat(item.quantidade) || 1;
      const valorTotal = quantidade * valorUnitario;
      
      const itemCompra: any = {
        numeroItem: item.numero_item || (index + 1),
        descricao: item.descricao_resumida || item.descricao || 'Item sem descrição',
        materialOuServico: item.tipo === 'SERVICO' ? 'S' : 'M',
        tipoBeneficioId: 1,
        incentivoProdutivoBasico: false,
        quantidade: quantidade,
        unidadeMedida: item.unidade_medida || 'Unidade',
        valorUnitarioEstimado: valorUnitario,
        valorTotal: valorTotal,
        criterioJulgamentoId: 1,
        orcamentoSigiloso: orcamentoSigiloso,
        // itemCategoriaId removido - campo opcional que pode causar conflito com modalidade
        aplicabilidadeMargemPreferenciaNormal: false,
        aplicabilidadeMargemPreferenciaAdicional: false,
      };
      
      this.logger.log(`[mapearLicitacaoParaCompra] Item ${itemCompra.numeroItem}: orcamentoSigiloso=${orcamentoSigiloso}, valorUnitario=${valorUnitario}, valorTotal=${valorTotal}`);
      
      return itemCompra;
    });

    // Determinar tipo de instrumento convocatório baseado na modalidade
    // 1 = Edital (pregão, concorrência, diálogo competitivo, concurso, leilão, manifestação de interesse, pré-qualificação, credenciamento)
    // 2 = Aviso de Contratação Direta (dispensa com disputa)
    // 3 = Ato que autoriza a Contratação Direta (dispensa sem disputa, inexigibilidade)
    let tipoInstrumento = 1; // Edital por padrão
    const modalidadeUpper = (licitacao.modalidade || '').toUpperCase();
    
    if (modalidadeUpper.includes('DISPENSA')) {
      // Verificar se é dispensa com ou sem disputa
      if (licitacao.modo_disputa === 'ABERTO' || licitacao.modo_disputa === 'FECHADO' || licitacao.modo_disputa === 'ABERTO_FECHADO') {
        tipoInstrumento = 2; // Aviso de Contratação Direta (dispensa com disputa)
      } else {
        tipoInstrumento = 3; // Ato que autoriza a Contratação Direta (dispensa sem disputa)
      }
    } else if (modalidadeUpper.includes('INEXIGIBILIDADE')) {
      tipoInstrumento = 3; // Ato que autoriza a Contratação Direta
    }
    
    this.logger.log(`[mapearLicitacaoParaCompra] Modalidade: ${licitacao.modalidade}, tipoInstrumento: ${tipoInstrumento}`);

    // Determinar modo de disputa
    // 1=Aberto, 2=Fechado, 3=Aberto-Fechado, 4=Fechado-Aberto, 5=Não se aplica
    let modoDisputa = 1; // Aberto por padrão
    if (licitacao.modo_disputa === 'FECHADO') modoDisputa = 2;
    else if (licitacao.modo_disputa === 'ABERTO_FECHADO') modoDisputa = 3;
    else if (licitacao.modo_disputa === 'FECHADO_ABERTO') modoDisputa = 4;
    else if (licitacao.modalidade === 'DISPENSA' || licitacao.modalidade === 'INEXIGIBILIDADE') modoDisputa = 5;

    // Calcular valor total se não informado
    let valorTotal = parseFloat(licitacao.valor_total_estimado) || 0;
    if (valorTotal === 0 && itensCompra.length > 0) {
      valorTotal = itensCompra.reduce((sum: number, item: any) => sum + (item.valorTotal || 0), 0);
    }

    // Formato conforme método incluirCompra que funciona (testado em 01/12/2025)
    // IMPORTANTE: Priorizar a unidade da licitação, senão usar a do órgão
    const codigoUnidade = licitacao.codigo_unidade_compradora || licitacao.orgao?.pncp_codigo_unidade;
    if (!codigoUnidade) {
      throw new Error('Código da unidade compradora não definido na licitação. Selecione a unidade compradora antes de enviar ao PNCP.');
    }
    
    this.logger.log(`[mapearLicitacaoParaCompra] Unidade compradora: ${codigoUnidade} (${licitacao.nome_unidade_compradora || 'sem nome'})`);

    return {
      codigoUnidadeCompradora: codigoUnidade,
      anoCompra,
      numeroCompra: licitacao.numero_processo,
      numeroProcesso: licitacao.numero_processo,
      objetoCompra: licitacao.objeto,
      tipoInstrumentoConvocatorioId: tipoInstrumento, // 1=Edital, 2=Aviso, 3=Ato
      modalidadeId: MODALIDADE_SISTEMA_PARA_PNCP[licitacao.modalidade] || 6,
      modoDisputaId: modoDisputa, // 1=Aberto, 2=Fechado, 5=Não se aplica
      srp: licitacao.srp || false,
      dataAberturaProposta: dataInicioPropostas,
      dataEncerramentoProposta: dataFimPropostas,
      informacaoComplementar: licitacao.informacoes_complementares || '',
      amparoLegalId: 1, // 1 = Lei nº 14.133/2021, Art. 28, caput
      linkSistemaOrigem: `${this.configService.get('APP_URL') || 'http://localhost:3000'}/licitacoes/${licitacao.id}`,
      itensCompra: itensCompra
    } as any;
  }

  private mapearItemParaPNCP(item: any, numeroItem: number, licitacao?: any): ItemCompraDto {
    // Campos da entidade ItemLicitacao:
    // - descricao_resumida (obrigatório)
    // - descricao_detalhada (opcional)
    // - unidade_medida (enum)
    // - valor_unitario_estimado
    // - valor_total_estimado
    const descricao = item.descricao_resumida || item.descricao || '';
    const valorTotal = parseFloat(item.valor_total_estimado) || parseFloat(item.valor_total) || 0;
    
    // Orçamento sigiloso vem da LICITAÇÃO (aba Configuração), não do item
    // Campo: sigilo_orcamento = 'PUBLICO' | 'SIGILOSO'
    const orcamentoSigiloso = licitacao?.sigilo_orcamento === 'SIGILOSO';
    
    // Margem de preferência vem do item (campo margem_preferencia)
    // Se não tem margem, não envia os campos de percentual (evita inconsistência)
    const margemPreferencia = item.margem_preferencia === true;
    
    // Tipo de benefício ME/EPP
    // PNCP: 1=Exclusivo ME/EPP, 2=Cota reservada, 3=Subcontratação, 4=Sem benefício
    // Hierarquia: modo_beneficio_mpe define de onde vem o benefício
    // - GERAL: usa tipo_beneficio_mpe da licitação
    // - POR_LOTE: usa tipo_beneficio_mpe do lote (futuro)
    // - POR_ITEM: usa tipo_participacao do item
    let tipoBeneficioId = 4; // Default: Sem benefício (Ampla participação)
    
    const modoBeneficio = licitacao?.modo_beneficio_mpe || 'GERAL';
    
    if (modoBeneficio === 'POR_ITEM') {
      // Usa o tipo_participacao do item
      if (item.tipo_participacao === 'EXCLUSIVO_MPE') {
        tipoBeneficioId = 1;
      } else if (item.tipo_participacao === 'COTA_RESERVADA') {
        tipoBeneficioId = 2;
      }
    } else if (modoBeneficio === 'POR_LOTE') {
      // TODO: Implementar quando lotes tiverem tipo_beneficio_mpe
      // Por enquanto, usa o tipo_participacao do item como fallback
      if (item.tipo_participacao === 'EXCLUSIVO_MPE') {
        tipoBeneficioId = 1;
      } else if (item.tipo_participacao === 'COTA_RESERVADA') {
        tipoBeneficioId = 2;
      }
    } else {
      // GERAL: usa tipo_beneficio_mpe da licitação
      if (licitacao?.tipo_beneficio_mpe === 'EXCLUSIVO') {
        tipoBeneficioId = 1;
      } else if (licitacao?.tipo_beneficio_mpe === 'COTA_RESERVADA') {
        tipoBeneficioId = 2;
      }
      // Fallback para campos antigos (compatibilidade)
      else if (licitacao?.exclusivo_mpe === true) {
        tipoBeneficioId = 1;
      } else if (licitacao?.cota_reservada === true) {
        tipoBeneficioId = 2;
      }
    }
    
    const valorUnitario = parseFloat(item.valor_unitario_estimado) || 0;
    
    this.logger.log(`[mapearItemParaPNCP] Item ${numeroItem}: orcamentoSigiloso=${orcamentoSigiloso}, valorUnitario=${valorUnitario}, valorTotal=${valorTotal}`);
    
    const itemDto: any = {
      numeroItem,
      materialOuServico: item.tipo === 'SERVICO' ? 'S' : 'M',
      tipoBeneficioId: tipoBeneficioId,
      incentivoProdutivoBasico: false,
      descricao: descricao,
      quantidade: parseFloat(item.quantidade) || 1,
      unidadeMedida: item.unidade_medida || 'UN',
      valorUnitarioEstimado: valorUnitario,
      valorTotal: valorTotal,
      situacaoCompraItemId: 1,
      criterioJulgamentoId: 1,
      codigoItemCatalogo: item.codigo_catalogo || '',
      patrimonio: false,
      orcamentoSigiloso: orcamentoSigiloso,
      // Margem de preferência - campos obrigatórios
      aplicabilidadeMargemPreferenciaNormal: margemPreferencia,
      aplicabilidadeMargemPreferenciaAdicional: false
    };
    
    // Só adiciona percentuais se tiver margem de preferência
    if (margemPreferencia) {
      itemDto.percentualMargemPreferenciaNormal = parseFloat(item.percentual_margem) || 0;
      itemDto.percentualMargemPreferenciaAdicional = 0;
    }
    
    return itemDto;
  }

  private extrairMensagemErro(error: any): string {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.mensagem) {
      return error.response.data.mensagem;
    }
    if (error.response?.data?.erros && Array.isArray(error.response.data.erros)) {
      // Erros podem ser objetos com propriedades como {campo, mensagem}
      return error.response.data.erros.map((e: any) => {
        if (typeof e === 'string') return e;
        if (e.mensagem) return `${e.campo || 'Campo'}: ${e.mensagem}`;
        if (e.message) return `${e.field || 'Campo'}: ${e.message}`;
        return JSON.stringify(e);
      }).join(' | ');
    }
    if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
      return error.response.data.errors.map((e: any) => {
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

    const cnpjPadrao = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    const cnpjOrgaoLimpo = (orgao.cnpj || '').replace(/\D/g, '');
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

    // Opcional: garantir que órgão está marcado como vinculado ao PNCP
    if (!orgao.pncp_vinculado) {
      throw new HttpException('Órgão não está vinculado ao PNCP na plataforma', HttpStatus.BAD_REQUEST);
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
                                 (cnpjEnvio && sequencial ? `${cnpjEnvio}-${pcaEntity.ano_exercicio}-${sequencial}` : null);

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

  async enviarItemPCA(pcaId: string, item: any): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

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
    const mapa: Record<string, number> = {
      'MATERIAL': 1,
      'SERVICO': 2,
      'OBRA': 3,
      'SERVICO_ENGENHARIA': 4,
      'SOLUCAO_TIC': 5,
      'LOCACAO_IMOVEL': 6,
      'ALIENACAO': 7
    };
    return mapa[categoria] || 1;
  }

  // ============ PCA - RETIFICAÇÃO E EXCLUSÃO ============

  async retificarPCA(anoPca: string, sequencialPca: string, pca: any): Promise<PncpResponseDto> {
    const cnpj = await this.obterCnpjParaOperacaoPca(anoPca, sequencialPca);

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

  async excluirPCA(anoPca: string, sequencialPca: string, justificativa?: string): Promise<PncpResponseDto> {
    const cnpj = await this.obterCnpjParaOperacaoPca(anoPca, sequencialPca);

    try {
      // PNCP requer justificativa para exclusão
      await this.axiosInstance.delete(
        `/orgaos/${cnpj}/pca/${anoPca}/${sequencialPca}`,
        { data: { justificativa: justificativa || 'Exclusão para teste de integração' } }
      );

      this.logger.log(`PCA excluído do PNCP: ${anoPca}/${sequencialPca}`);

      return {
        sucesso: true,
        mensagem: 'PCA excluído com sucesso'
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao excluir PCA: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private async obterCnpjParaOperacaoPca(anoPca: string | number, sequencialPca: string | number): Promise<string> {
    const ano = parseInt(String(anoPca), 10);
    const sequencial = parseInt(String(sequencialPca), 10);

    const pca = await this.pcaRepository.findOne({
      where: { ano_exercicio: ano, sequencial_pncp: sequencial },
      relations: ['orgao'],
    });

    const cnpjPadrao = this.configService.get<string>('PNCP_CNPJ_ORGAO') || '';
    const cnpjPadraoLimpo = cnpjPadrao.replace(/\D/g, '');

    if (pca?.orgao?.cnpj) {
      const cnpjOrgaoLimpo = pca.orgao.cnpj.replace(/\D/g, '');
      if (cnpjOrgaoLimpo && cnpjOrgaoLimpo !== '12345678000199') {
        return cnpjOrgaoLimpo;
      }
    }

    if (!cnpjPadraoLimpo) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    return cnpjPadraoLimpo;
  }

  async retificarItemPCA(anoPca: string, sequencialPca: string, numeroItem: string, item: any): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

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

  async excluirItemPCA(anoPca: string, sequencialPca: string, numeroItem: string): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

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

  async incluirCompra(compra: any): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    // Mapeamento conforme manual PNCP 6.3.1
    // Conformidade válida conforme exemplo da documentação:
    // - tipoInstrumentoConvocatorioId: 1 (Edital)
    // - modalidadeId: 6 (Pregão Eletrônico)
    // - modoDisputaId: 1 (Aberto)
    // - amparoLegalId: 1 (Lei nº 14.133/2021, Art. 28, caput)
    const compraDto = {
      codigoUnidadeCompradora: compra.codigo_unidade || '1',
      anoCompra: compra.ano_compra || new Date().getFullYear(),
      numeroCompra: compra.numero_compra || compra.numero_processo,
      numeroProcesso: compra.numero_processo,
      objetoCompra: compra.objeto,
      tipoInstrumentoConvocatorioId: compra.tipo_instrumento_id || 1, // 1 = Edital
      modalidadeId: compra.modalidade_id || 6, // 6 = Pregão Eletrônico
      modoDisputaId: compra.modo_disputa_id || 1, // 1 = Aberto
      srp: compra.srp || false,
      dataAberturaProposta: compra.data_abertura_proposta,
      dataEncerramentoProposta: compra.data_encerramento_proposta,
      informacaoComplementar: compra.informacao_complementar || '',
      amparoLegalId: compra.amparo_legal_id || 1, // 1 = Lei nº 14.133/2021, Art. 28, caput
      linkSistemaOrigem: compra.link_sistema_origem,
      // Itens com campos obrigatórios de margem de preferência DENTRO de cada item
      itensCompra: (compra.itens || []).map((item: any, index: number) => ({
        numeroItem: item.numero_item || (index + 1),
        descricao: item.descricao,
        materialOuServico: item.tipo === 'SERVICO' ? 'S' : 'M',
        tipoBeneficioId: item.tipo_beneficio_id || 1,
        incentivoProdutivoBasico: item.incentivo_produtivo || false,
        quantidade: parseFloat(item.quantidade) || 1,
        unidadeMedida: item.unidade_medida || 'Unidade',
        valorUnitarioEstimado: parseFloat(item.valor_unitario) || 0,
        valorTotal: parseFloat(item.valor_total) || (parseFloat(item.quantidade) * parseFloat(item.valor_unitario)) || 0,
        criterioJulgamentoId: item.criterio_julgamento_id || 1,
        orcamentoSigiloso: item.orcamento_sigiloso || false,
        // itemCategoriaId removido - campo opcional que pode causar conflito com modalidade
        // Campos obrigatórios de margem de preferência (por item)
        aplicabilidadeMargemPreferenciaNormal: item.margem_preferencia_normal || false,
        aplicabilidadeMargemPreferenciaAdicional: item.margem_preferencia_adicional || false,
      }))
    };

    try {
      // PNCP requer multipart/form-data para compras com documento obrigatório
      const FormData = require('form-data');
      const formData = new FormData();
      
      // Log para debug
      this.logger.log(`Enviando compra: ${JSON.stringify(compraDto)}`);
      
      // Adicionar dados da compra como Buffer com nome de arquivo
      const compraBuffer = Buffer.from(JSON.stringify(compraDto), 'utf-8');
      formData.append('compra', compraBuffer, 'compra.json');
      
      // Criar PDF de teste mínimo válido
      const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n199\n%%EOF');
      formData.append('documento', pdfContent, 'edital.pdf');

      // Obter token válido
      await this.getValidToken();

      const response = await axios.post(
        `${this.configService.get<string>('PNCP_API_URL') || 'https://treina.pncp.gov.br/api/pncp/v1'}/orgaos/${cnpj.replace(/\D/g, '')}/compras`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.token}`,
            'Titulo-Documento': compra.titulo_documento || 'Edital de Licitacao',
            'Tipo-Documento-Id': '1'
          },
          timeout: 60000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      const numeroControlePNCP = response.data?.numeroControlePNCP;
      const anoCompra = response.data?.anoCompra || compraDto.anoCompra;
      const sequencialCompra = response.data?.sequencialCompra;

      this.logger.log(`Compra incluída no PNCP: ${numeroControlePNCP}`);

      return {
        sucesso: true,
        numeroControlePNCP,
        mensagem: `Compra incluída com sucesso. Link: https://treina.pncp.gov.br/app/editais/${cnpj.replace(/\D/g, '')}/${anoCompra}/${sequencialCompra}`,
        dados: { anoCompra, sequencialCompra }
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao incluir compra: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async retificarCompra(anoCompra: string, sequencialCompra: string, compra: any): Promise<PncpResponseDto> {
    // Buscar licitação para obter CNPJ do órgão
    let cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
    if (compra.licitacaoId) {
      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: compra.licitacaoId },
        relations: ['orgao']
      });
      if (licitacao?.orgao?.cnpj) {
        cnpj = licitacao.orgao.cnpj;
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
            const itemDto = this.mapearItemParaPNCP(item, numeroItem, licitacao);
            
            this.logger.log(`[retificarCompra] Retificando item ${numeroItem}: orcamentoSigiloso=${itemDto.orcamentoSigiloso}`);
            
            try {
              this.logger.log(`[retificarCompra] Enviando PATCH para item ${numeroItem}: ${JSON.stringify(itemDto)}`);
              const itemResponse = await this.axiosInstance.patch(
                `/orgaos/${cnpjLimpo}/compras/${anoCompra}/${sequencialCompra}/itens/${numeroItem}`,
                itemDto
              );
              this.logger.log(`[retificarCompra] Item ${numeroItem} retificado com sucesso. Resposta: ${JSON.stringify(itemResponse.data)}`);
            } catch (itemError: any) {
              const errorMsg = this.extrairMensagemErro(itemError);
              const errorData = itemError.response?.data ? JSON.stringify(itemError.response.data) : 'sem dados';
              this.logger.error(`[retificarCompra] Erro ao retificar item ${numeroItem}: ${errorMsg}. Dados: ${errorData}`);
              // Continua com os outros itens mesmo se um falhar
            }
          }
        }
      }

      // Atualizar licitação local se informado
      if (compra.licitacaoId && compra.objetoCompra) {
        await this.licitacaoRepository.update(compra.licitacaoId, {
          objeto: compra.objetoCompra
        });
      }

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

  async consultarQuantidadeItens(anoCompra: string, sequencialCompra: string): Promise<any> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.getValidToken();
      
      // Consultar quantidade de itens via API de consulta do PNCP
      const response = await axios.get(
        `https://treina.pncp.gov.br/api/consulta/v1/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/itens/quantidade`,
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
    itemInput: any
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

    const cnpj = licitacao.orgao?.cnpj || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
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
    const itemDto = this.mapearItemParaPNCP(itemDb, parseInt(itemInput.numeroItem), licitacao);

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
    itemInput: any
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

    const cnpj = licitacao.orgao?.cnpj || this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
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
    const itemDto = this.mapearItemParaPNCP(itemDb, parseInt(numeroItem), licitacao);
    
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
    justificativa?: string
  ): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

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

  async excluirCompra(anoCompra: string, sequencialCompra: string, dados: any): Promise<PncpResponseDto> {
    const justificativa = typeof dados === 'string' ? dados : dados?.justificativa;
    const licitacaoId = typeof dados === 'object' ? dados?.licitacaoId : null;

    // Buscar licitação para obter CNPJ do órgão
    let cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    
    if (licitacaoId) {
      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: licitacaoId },
        relations: ['orgao']
      });
      if (licitacao?.orgao?.cnpj) {
        cnpj = licitacao.orgao.cnpj;
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

      // Limpar dados PNCP da licitação local
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
            fase: FaseLicitacao.PLANEJAMENTO // Volta para planejamento
          })
          .where('id = :id', { id: licitacaoId })
          .execute();
        
        this.logger.log(`Licitação ${licitacaoId} - dados PNCP limpos após exclusão`);
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

  async consultarCompra(anoCompra: string, sequencialCompra: string): Promise<any> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await this.axiosInstance.get(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}`
      );

      return {
        encontrado: true,
        compra: response.data,
        numeroControlePNCP: response.data?.numeroControlePNCP || response.data?.numeroControle,
        link: `https://treina.pncp.gov.br/app/editais/${cnpj.replace(/\D/g, '')}/${anoCompra}/${sequencialCompra}`
      };
    } catch (error: any) {
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

  // Método auxiliar para atualizar número de controle na licitação
  async atualizarNumeroControleLicitacao(
    licitacaoId: string, 
    numeroControlePNCP: string, 
    ano: number, 
    sequencial: number
  ): Promise<void> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    const baseUrl = this.configService.get<string>('PNCP_API_URL')?.includes('treina') 
      ? 'https://treina.pncp.gov.br' 
      : 'https://pncp.gov.br';
    const linkPncp = `${baseUrl}/app/editais/${cnpj?.replace(/\D/g, '')}/${ano}/${sequencial}`;
    
    await this.licitacaoRepository.update(licitacaoId, {
      numero_controle_pncp: numeroControlePNCP,
      ano_compra_pncp: ano,
      sequencial_compra_pncp: sequencial,
      link_pncp: linkPncp,
      enviado_pncp: true
    });
    
    this.logger.log(`Número de controle atualizado: ${numeroControlePNCP}`);
  }

  // ============ RESULTADO DE ITENS DA COMPRA ============

  async incluirResultadoItem(anoCompra: string, sequencialCompra: string, numeroItem: string, resultado: any): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

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
        mensagem: `Resultado incluído com sucesso. Link: https://treina.pncp.gov.br/app/editais/${cnpj.replace(/\D/g, '')}/${anoCompra}/${sequencialCompra}`,
        dados: response.data
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao incluir resultado: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async retificarResultadoItem(anoCompra: string, sequencialCompra: string, numeroItem: string, resultado: any): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

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
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    const ataDto = {
      numeroAtaRegistroPreco: ata.numero_ata,
      anoAta: ata.ano_ata || new Date().getFullYear(),
      dataAssinatura: ata.data_assinatura,
      dataVigenciaInicio: ata.data_vigencia_inicio,
      dataVigenciaFim: ata.data_vigencia_fim,
      niFornecedor: ata.cnpj_fornecedor?.replace(/\D/g, ''),
      nomeRazaoSocialFornecedor: ata.nome_fornecedor,
      situacaoAtaId: ata.situacao_id || 1, // 1 = Vigente
      tipoPessoaId: ata.tipo_pessoa_id || 2, // 2 = Pessoa Jurídica
      itensAta: (ata.itens || []).map((item: any) => ({
        numeroItem: item.numero_item,
        quantidade: parseFloat(item.quantidade) || 1,
        valorUnitario: parseFloat(item.valor_unitario) || 0,
        valorTotal: parseFloat(item.valor_total) || (parseFloat(item.quantidade) * parseFloat(item.valor_unitario)) || 0,
      }))
    };

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}/atas`,
        ataDto
      );

      const sequencialAta = response.data?.sequencialAta;

      this.logger.log(`Ata de Registro de Preço incluída: ${sequencialAta}`);

      return {
        sucesso: true,
        mensagem: `Ata incluída com sucesso. Link: https://treina.pncp.gov.br/app/atas/${cnpj.replace(/\D/g, '')}/${anoCompra}/${sequencialCompra}/${sequencialAta}`,
        dados: { sequencialAta, ...response.data }
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao incluir ata: ${this.extrairMensagemErro(error)}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async retificarAtaRegistroPreco(anoCompra: string, sequencialCompra: string, sequencialAta: string, ata: any): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
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
      justificativa: ata.justificativa || 'Retificação de dados da ata',
    };
    
    if (ata.situacao_id) ataDto.situacaoAtaId = ata.situacao_id;
    
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

  async excluirAtaRegistroPreco(anoCompra: string, sequencialCompra: string, sequencialAta: string, justificativa: string): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
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
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
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
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    const contratoDto = {
      objetoContrato: contrato.objeto,
      valorInicial: parseFloat(contrato.valor_inicial) || undefined,
      valorGlobal: parseFloat(contrato.valor_global) || undefined,
      dataVigenciaFim: contrato.data_vigencia_fim,
    };

    try {
      await this.axiosInstance.put(
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

  async excluirContrato(anoContrato: string, sequencialContrato: string, justificativa: string): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
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

  async consultarContrato(anoContrato: string, sequencialContrato: string): Promise<any> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await this.axiosInstance.get(
        `/orgaos/${cnpj.replace(/\D/g, '')}/contratos/${anoContrato}/${sequencialContrato}`
      );

      return {
        encontrado: true,
        contrato: response.data
      };
    } catch (error: any) {
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

  async consultarPCAsNoOrgao(): Promise<any> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await this.axiosInstance.get(`/orgaos/${cnpj.replace(/\D/g, '')}/pca`);
      return {
        orgao: cnpj,
        pcas: response.data,
        total: response.data?.length || 0
      };
    } catch (error: any) {
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
    console.log('[SERVICE] verificarConfiguracao iniciado');
    
    // Teste direto do process.env
    console.log('[SERVICE] process.env direto:', {
      PNCP_API_URL: process.env.PNCP_API_URL ? 'DEFINIDO' : 'NÃO DEFINIDO',
      PNCP_LOGIN: process.env.PNCP_LOGIN ? 'DEFINIDO' : 'NÃO DEFINIDO',
      PNCP_SENHA: process.env.PNCP_SENHA ? 'DEFINIDO' : 'NÃO DEFINIDO',
      PNCP_CNPJ_ORGAO: process.env.PNCP_CNPJ_ORGAO ? 'DEFINIDO' : 'NÃO DEFINIDO'
    });
    
    // Usar getEnvVar para garantir que funcione no Railway
    const apiUrl = this.getEnvVar('PNCP_API_URL') || '';
    const login = this.getEnvVar('PNCP_LOGIN');
    const senha = this.getEnvVar('PNCP_SENHA');
    const cnpj = this.getEnvVar('PNCP_CNPJ_ORGAO');
    
    console.log('[SERVICE] Variáveis lidas via getEnvVar:', { 
      apiUrl: !!apiUrl, 
      login: !!login, 
      senha: !!senha, 
      cnpj: !!cnpj 
    });

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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
      const response = await this.axiosInstance.put(`/usuarios/${idUsuario}`, updateDto);
      this.logger.log(`Entes autorizados atualizados: ${cnpjsLimpos.join(', ')}`);
      return {
        sucesso: true,
        entesAutorizados: cnpjsLimpos,
        mensagem: 'Entes autorizados atualizados com sucesso'
      };
    } catch (error: any) {
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
    
    // Adicionar o novo CNPJ
    const novosEntes = [...cnpjsAtuais, cnpjLimpo];
    
    return this.atualizarEntesAutorizados(novosEntes);
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
    } catch (error: any) {
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
              } catch (err: any) {
                // 404 = não existe esse sequencial, continua
                if (err.response?.status !== 404) {
                  this.logger.warn(`Erro ao buscar PCA ${anoBusca}/${seq}: ${err.response?.status}`);
                }
              }
            }
          }
        } catch (err: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
      } catch (error: any) {
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

  async getEstatisticasSincronizacao(): Promise<{
    total: number;
    enviados: number;
    pendentes: number;
    erros: number;
    porTipo: Record<string, number>;
  }> {
    const todos = await this.pncpSyncRepository.find();
    
    const porStatus = {
      enviados: todos.filter(s => s.status === StatusSincronizacao.ENVIADO).length,
      pendentes: todos.filter(s => s.status === StatusSincronizacao.PENDENTE).length,
      erros: todos.filter(s => s.status === StatusSincronizacao.ERRO).length,
    };

    const porTipo: Record<string, number> = {};
    todos.forEach(s => {
      porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1;
    });

    return {
      total: todos.length,
      ...porStatus,
      porTipo
    };
  }
}
