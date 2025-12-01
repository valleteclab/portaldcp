import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { PncpSync, TipoSincronizacao, StatusSincronizacao } from './entities/pncp-sync.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
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

  constructor(
    @InjectRepository(PncpSync)
    private pncpSyncRepository: Repository<PncpSync>,
    @InjectRepository(Licitacao)
    private licitacaoRepository: Repository<Licitacao>,
    private configService: ConfigService,
  ) {
    this.initializeAxios();
  }

  private initializeAxios() {
    const baseURL = this.configService.get<string>('PNCP_API_URL') || 'https://treina.pncp.gov.br/api/pncp/v1';
    
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000,
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

  async login(): Promise<string> {
    const login = this.configService.get<string>('PNCP_LOGIN');
    const senha = this.configService.get<string>('PNCP_SENHA');

    if (!login || !senha) {
      throw new HttpException('Credenciais PNCP não configuradas', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      const response = await axios.post(
        `${this.configService.get<string>('PNCP_API_URL')}/usuarios/login`,
        { login, senha }
      );

      const tokenFromHeader = response.headers['authorization']?.replace('Bearer ', '');
      this.token = tokenFromHeader || response.data.token || '';
      // Token expira em 1 hora, renovar antes
      this.tokenExpiration = new Date(Date.now() + 55 * 60 * 1000);
      
      this.logger.log('Login PNCP realizado com sucesso');
      return this.token;
    } catch (error) {
      this.logger.error('Erro ao fazer login no PNCP', error);
      throw new HttpException('Falha na autenticação PNCP', HttpStatus.UNAUTHORIZED);
    }
  }

  async getValidToken(): Promise<string> {
    if (!this.token || !this.tokenExpiration || new Date() >= this.tokenExpiration) {
      await this.login();
    }
    return this.token;
  }

  // ============ COMPRA/LICITAÇÃO ============

  async enviarCompra(licitacaoId: string): Promise<PncpResponseDto> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.NOT_FOUND);
    }

    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO') || licitacao.orgao?.cnpj;
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

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

    // Criar registro de sincronização
    const sync = this.pncpSyncRepository.create({
      tipo: TipoSincronizacao.COMPRA,
      licitacao_id: licitacaoId,
      status: StatusSincronizacao.ENVIANDO,
      payload_enviado: compraDto
    });
    await this.pncpSyncRepository.save(sync);

    try {
      const response = await this.axiosInstance.post(
        `/orgaos/${cnpj}/compras`,
        compraDto
      );

      sync.status = StatusSincronizacao.ENVIADO;
      sync.resposta_pncp = response.data;
      sync.numero_controle_pncp = response.data.numeroControlePNCP;
      sync.ano_compra = response.data.ano;
      sync.sequencial_compra = response.data.sequencial;
      await this.pncpSyncRepository.save(sync);

      // Atualizar licitação com número de controle PNCP
      await this.licitacaoRepository.update(licitacaoId, {
        numero_controle_pncp: response.data.numeroControlePNCP
      });

      this.logger.log(`Compra enviada ao PNCP: ${response.data.numeroControlePNCP}`);

      return {
        sucesso: true,
        numeroControlePNCP: response.data.numeroControlePNCP,
        ano: response.data.ano,
        sequencial: response.data.sequencial
      };
    } catch (error) {
      sync.status = StatusSincronizacao.ERRO;
      sync.erro_mensagem = this.extrairMensagemErro(error);
      sync.tentativas += 1;
      sync.ultima_tentativa = new Date();
      await this.pncpSyncRepository.save(sync);

      throw new HttpException(
        `Erro ao enviar compra ao PNCP: ${sync.erro_mensagem}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async atualizarCompra(licitacaoId: string, sync: PncpSync): Promise<PncpResponseDto> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens']
    });

    if (!licitacao) {
      throw new HttpException('Licitação não encontrada', HttpStatus.NOT_FOUND);
    }

    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO') || licitacao.orgao?.cnpj;
    const compraDto = this.mapearLicitacaoParaCompra(licitacao, cnpj);

    try {
      const response = await this.axiosInstance.put(
        `/orgaos/${cnpj}/compras/${sync.ano_compra}/${sync.sequencial_compra}`,
        compraDto
      );

      sync.status = StatusSincronizacao.ATUALIZADO;
      sync.resposta_pncp = response.data;
      sync.payload_enviado = compraDto;
      await this.pncpSyncRepository.save(sync);

      return {
        sucesso: true,
        numeroControlePNCP: sync.numero_controle_pncp,
        mensagem: 'Compra atualizada com sucesso'
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
      relations: ['itens']
    });

    if (!licitacao?.itens?.length) {
      throw new HttpException('Licitação não possui itens', HttpStatus.BAD_REQUEST);
    }

    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    const itensDto = licitacao.itens.map((item, index) => this.mapearItemParaPNCP(item, index + 1));

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
    
    return {
      anoCompra,
      codigoModalidadeContratacao: MODALIDADE_SISTEMA_PARA_PNCP[licitacao.modalidade] || 6,
      codigoModoDisputa: MODO_DISPUTA.ABERTO,
      codigoSituacaoCompra: FASE_SISTEMA_PARA_PNCP[licitacao.fase] || SITUACAO_COMPRA.DIVULGADA,
      dataAberturaProposta: licitacao.data_abertura_sessao,
      dataEncerramentoProposta: licitacao.data_encerramento_propostas,
      dataInclusao: new Date().toISOString().split('T')[0],
      numeroCompra: licitacao.numero_processo,
      numeroProcesso: licitacao.numero_processo,
      objetoCompra: licitacao.objeto,
      orgaoEntidade: {
        cnpj: cnpj.replace(/\D/g, ''),
        razaoSocial: licitacao.orgao?.razao_social || 'Órgão'
      },
      srp: licitacao.srp || false,
      unidadeOrgao: {
        codigoUnidade: '001',
        nomeUnidade: licitacao.orgao?.razao_social || 'Unidade Principal'
      },
      valorTotalEstimado: parseFloat(licitacao.valor_total_estimado) || 0,
      linkSistemaOrigem: `${this.configService.get('APP_URL')}/licitacoes/${licitacao.id}`,
      informacaoComplementar: licitacao.informacoes_complementares || ''
    };
  }

  private mapearItemParaPNCP(item: any, numeroItem: number): ItemCompraDto {
    return {
      numeroItem,
      materialOuServico: item.tipo === 'SERVICO' ? 'S' : 'M',
      tipoBeneficioId: 1,
      incentivoProdutivoBasico: false,
      descricao: item.descricao,
      quantidade: parseFloat(item.quantidade) || 1,
      unidadeMedida: item.unidade_medida || 'UN',
      valorUnitarioEstimado: parseFloat(item.valor_unitario_estimado) || 0,
      valorTotal: parseFloat(item.valor_total) || 0,
      situacaoCompraItemId: 1,
      criterioJulgamentoId: 1,
      codigoItemCatalogo: item.codigo_catalogo || '',
      patrimonio: false
    };
  }

  private extrairMensagemErro(error: any): string {
    if (error.response?.data?.mensagem) {
      return error.response.data.mensagem;
    }
    if (error.response?.data?.erros) {
      return error.response.data.erros.join(', ');
    }
    if (error.response?.data) {
      return JSON.stringify(error.response.data);
    }
    return error.message || 'Erro desconhecido';
  }

  // ============ PCA (Plano de Contratações Anual) ============

  async enviarPCA(pcaId: string, pca: any): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    // Mapear dados do PCA para o formato PNCP
    const pcaDto = {
      anoExercicio: pca.ano_exercicio,
      dataPublicacao: pca.data_publicacao || new Date().toISOString().split('T')[0],
      itens: pca.itens.map((item: any, index: number) => ({
        numeroItem: index + 1,
        categoriaItemPca: this.mapearCategoriaPCA(item.categoria),
        descricao: item.descricao_objeto,
        unidadeRequisitante: item.unidade_requisitante || 'Unidade Principal',
        valorEstimado: parseFloat(item.valor_estimado) || 0,
        quantidadeEstimada: parseFloat(item.quantidade_estimada) || 1,
        unidadeMedida: item.unidade_medida || 'UN',
        dataDesejada: item.data_prevista_inicio || null,
        grauPrioridade: item.prioridade || 3,
        renovacaoContrato: item.renovacao_contrato || false,
        catalogoItemPca: item.codigo_catalogo || null
      }))
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
        `/orgaos/${cnpj.replace(/\D/g, '')}/pca`,
        pcaDto
      );

      sync.status = StatusSincronizacao.ENVIADO;
      sync.resposta_pncp = response.data;
      sync.numero_controle_pncp = response.data.numeroControlePNCP;
      await this.pncpSyncRepository.save(sync);

      this.logger.log(`PCA enviado ao PNCP: ${response.data.numeroControlePNCP}`);

      return {
        sucesso: true,
        numeroControlePNCP: response.data.numeroControlePNCP,
        mensagem: 'PCA enviado com sucesso'
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

  // ============ CONSULTA STATUS PCA ============

  async consultarStatusPCA(pcaId: string): Promise<PncpSync[]> {
    return this.pncpSyncRepository.find({
      where: { entidade_id: pcaId, tipo: TipoSincronizacao.PCA },
      order: { created_at: 'DESC' }
    });
  }

  // ============ CONFIGURAÇÃO E TESTE ============

  async verificarConfiguracao(): Promise<{
    configurado: boolean;
    ambiente: string;
    cnpjOrgao: string | null;
    loginConfigurado: boolean;
  }> {
    const apiUrl = this.configService.get<string>('PNCP_API_URL') || '';
    const login = this.configService.get<string>('PNCP_LOGIN');
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');

    const ambiente = apiUrl.includes('treina') ? 'TREINAMENTO' : 
                     apiUrl.includes('pncp.gov.br') ? 'PRODUÇÃO' : 'NÃO CONFIGURADO';

    return {
      configurado: !!(login && cnpj && apiUrl),
      ambiente,
      cnpjOrgao: cnpj ? this.formatarCNPJ(cnpj) : null,
      loginConfigurado: !!login
    };
  }

  async testarConexao(): Promise<{
    sucesso: boolean;
    mensagem: string;
    detalhes?: any;
  }> {
    try {
      // Tentar fazer login
      await this.login();
      
      return {
        sucesso: true,
        mensagem: 'Conexão com PNCP estabelecida com sucesso!',
        detalhes: {
          tokenObtido: !!this.token,
          expiracao: this.tokenExpiration
        }
      };
    } catch (error) {
      return {
        sucesso: false,
        mensagem: `Falha na conexão: ${error.message}`,
        detalhes: {
          erro: this.extrairMensagemErro(error)
        }
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
