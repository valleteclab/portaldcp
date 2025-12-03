import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { PncpSync, TipoSincronizacao, StatusSincronizacao } from './entities/pncp-sync.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
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

  constructor(
    @InjectRepository(PncpSync)
    private pncpSyncRepository: Repository<PncpSync>,
    @InjectRepository(Licitacao)
    private licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(PlanoContratacaoAnual)
    private pcaRepository: Repository<PlanoContratacaoAnual>,
    private configService: ConfigService,
  ) {
    this.initializeAxios();
  }

  private initializeAxios() {
    const baseURL = this.configService.get<string>('PNCP_API_URL') || 'https://treina.pncp.gov.br/api/pncp/v1';
    
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

      // Atualizar PCA no banco com número de controle, sequencial e marcar como enviado
      await this.pcaRepository.update(pcaId, {
        enviado_pncp: true,
        numero_controle_pncp: numeroControlePncp,
        sequencial_pncp: sequencial,
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
        itemCategoriaId: item.item_categoria_id || 3, // 3 = Não se aplica
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
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    const compraDto: any = {};
    if (compra.objeto) compraDto.objetoCompra = compra.objeto;
    if (compra.valor_total_estimado) compraDto.valorTotalEstimado = parseFloat(compra.valor_total_estimado);
    if (compra.valor_total_homologado) compraDto.valorTotalHomologado = parseFloat(compra.valor_total_homologado);
    if (compra.situacao_id) compraDto.situacaoCompraId = compra.situacao_id;
    if (compra.informacao_complementar) compraDto.informacaoComplementar = compra.informacao_complementar;

    try {
      await this.axiosInstance.patch(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}`,
        compraDto
      );

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

  async excluirCompra(anoCompra: string, sequencialCompra: string, justificativa: string): Promise<PncpResponseDto> {
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');
    if (!cnpj) {
      throw new HttpException('CNPJ do órgão não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.axiosInstance.delete(
        `/orgaos/${cnpj.replace(/\D/g, '')}/compras/${anoCompra}/${sequencialCompra}`,
        { data: { justificativa: justificativa || 'Exclusão para teste de integração' } }
      );

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

  async verificarConfiguracao(): Promise<{
    configurado: boolean;
    ambiente: string;
    cnpjOrgao: string | null;
    loginConfigurado: boolean;
    debug?: any;
  }> {
    const apiUrl = this.configService.get<string>('PNCP_API_URL') || '';
    const login = this.configService.get<string>('PNCP_LOGIN');
    const senha = this.configService.get<string>('PNCP_SENHA');
    const cnpj = this.configService.get<string>('PNCP_CNPJ_ORGAO');

    const ambiente = apiUrl.includes('treina') ? 'TREINAMENTO' : 
                     apiUrl.includes('pncp.gov.br') ? 'PRODUÇÃO' : 'NÃO CONFIGURADO';

    // Log para debug no Railway
    this.logger.log(`[CONFIG] PNCP_API_URL: ${apiUrl ? 'DEFINIDO' : 'NÃO DEFINIDO'} (${apiUrl?.substring(0, 30)}...)`);
    this.logger.log(`[CONFIG] PNCP_LOGIN: ${login ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    this.logger.log(`[CONFIG] PNCP_SENHA: ${senha ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    this.logger.log(`[CONFIG] PNCP_CNPJ_ORGAO: ${cnpj ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);

    return {
      configurado: !!(login && cnpj && apiUrl && senha),
      ambiente,
      cnpjOrgao: cnpj ? this.formatarCNPJ(cnpj) : null,
      loginConfigurado: !!login,
      debug: {
        apiUrlDefinido: !!apiUrl,
        loginDefinido: !!login,
        senhaDefinida: !!senha,
        cnpjDefinido: !!cnpj,
        apiUrlParcial: apiUrl ? apiUrl.substring(0, 40) : null
      }
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

  async consultarUsuario(): Promise<any> {
    // Garantir que temos um token válido
    await this.getValidToken();
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
