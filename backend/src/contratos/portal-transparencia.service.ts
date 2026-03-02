import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ContratosService } from './contratos.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';

export interface PortalTransparenciaContrato {
  contratos_contratoNumero: string;
  contratos_documento: string;
  contratos_favorecido: string;
  contratos_contratoObjeto: string;
  contratos_vigencia: string;
  aditivos_valor_total: string;
}

export interface PortalTransparenciaResponse {
  resource: string;
  count: number;
  data: PortalTransparenciaContrato[];
}

@Injectable()
export class PortalTransparenciaService {
  private readonly logger = new Logger(PortalTransparenciaService.name);
  private readonly baseUrl = 'https://portaldatransparencia.cmlem.ba.gov.br/api';

  constructor(
    private readonly httpService: HttpService,
    private readonly contratosService: ContratosService,
    private readonly fornecedoresService: FornecedoresService,
  ) {}

  /**
   * Busca contratos na API do Portal de Transparência
   */
  async buscarContratos(params: {
    numero?: string;
    limit?: number;
    offset?: number;
  }): Promise<PortalTransparenciaResponse> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('resource', 'contratos');
      
      if (params.numero) queryParams.append('numero', params.numero);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());

      const url = `${this.baseUrl}/?${queryParams.toString()}`;
      this.logger.log(`Buscando contratos na API: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<PortalTransparenciaResponse>(url)
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Erro ao buscar contratos na API: ${error.message}`, error.stack);
      throw new Error(`Falha ao consultar API do Portal de Transparência: ${error.message}`);
    }
  }

  /**
   * Importa contratos da API para o sistema
   */
  async importarContratos(
    orgaoId: string,
    params: {
      numero?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    importados: number;
    erros: number;
    detalhes: Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>;
  }> {
    const resultado = {
      importados: 0,
      erros: 0,
      detalhes: [] as Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>,
    };

    try {
      const apiResponse = await this.buscarContratos(params);
      
      if (!apiResponse.data || apiResponse.data.length === 0) {
        this.logger.log('Nenhum contrato encontrado na API');
        return resultado;
      }

      this.logger.log(`Encontrados ${apiResponse.data.length} contratos para importar`);

      for (const contratoApi of apiResponse.data) {
        try {
          await this.importarContratoIndividual(orgaoId, contratoApi);
          resultado.importados++;
          resultado.detalhes.push({
            numero: contratoApi.contratos_contratoNumero,
            status: 'sucesso',
          });
        } catch (error) {
          resultado.erros++;
          resultado.detalhes.push({
            numero: contratoApi.contratos_contratoNumero,
            status: 'erro',
            mensagem: error.message,
          });
          this.logger.error(`Erro ao importar contrato ${contratoApi.contratos_contratoNumero}: ${error.message}`);
        }
      }

      return resultado;
    } catch (error) {
      this.logger.error(`Erro na importação: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Importa um contrato individual
   */
  private async importarContratoIndividual(
    orgaoId: string,
    contratoApi: PortalTransparenciaContrato
  ): Promise<void> {
    // Limpar CNPJ (remover formatação)
    const cnpjLimpo = contratoApi.contratos_documento.replace(/\D/g, '');
    
    // Buscar ou criar fornecedor usando métodos existentes
    let fornecedor;
    try {
      const verificacao = await this.fornecedoresService.verificarCnpjExistente(cnpjLimpo);
      if (verificacao.existe && verificacao.fornecedor) {
        fornecedor = verificacao.fornecedor;
      }
    } catch (e) {
      // Fornecedor não existe
    }
    
    if (!fornecedor) {
      this.logger.log(`Criando fornecedor: ${contratoApi.contratos_favorecido} - ${cnpjLimpo}`);
      // Usar cadastro rápido que já existe no sistema
      fornecedor = await this.fornecedoresService.cadastroRapidoOrgao(
        cnpjLimpo,
        contratoApi.contratos_favorecido
      );
    }

    // Converter vigência para data
    const dataVigencia = this.parseDataBrasileira(contratoApi.contratos_vigencia);
    
    // Converter valor
    const valorGlobal = parseFloat(contratoApi.aditivos_valor_total) || 0;

    // Extrair ano do número do contrato (ex: 001/2024 -> 2024)
    const anoMatch = contratoApi.contratos_contratoNumero.match(/\/(\d{4})$/);
    const ano = anoMatch ? parseInt(anoMatch[1]) : new Date().getFullYear();

    // Criar contrato usando o método existente
    this.logger.log(`Criando contrato: ${contratoApi.contratos_contratoNumero}`);
    
    // Buscar se contrato já existe
    try {
      const contratoExistente = await this.contratosService.findByNumero(
        orgaoId,
        contratoApi.contratos_contratoNumero
      );
      
      if (contratoExistente) {
        this.logger.log(`Contrato ${contratoApi.contratos_contratoNumero} já existe, pulando...`);
        return;
      }
    } catch (e) {
      // Contrato não existe, continuar
    }

    // Criar DTO para o contrato
    const createDto = {
      numero_contrato: contratoApi.contratos_contratoNumero,
      ano,
      objeto: contratoApi.contratos_contratoObjeto,
      valor_global: valorGlobal,
      data_inicio: new Date(),
      data_fim: dataVigencia,
      fornecedor_id: fornecedor.id,
      modalidade: 'CONTRATACAO_DIRETA',
      situacao: 'VIGENTE',
      origem: 'IMPORTADO_PORTAL_TRANSPARENCIA',
    };

    await this.contratosService.criar(createDto);
  }

  /**
   * Converte data no formato brasileiro (DD/MM/YYYY) para Date
   */
  private parseDataBrasileira(dataStr: string): Date {
    if (!dataStr) return new Date();
    
    const partes = dataStr.split('/');
    if (partes.length === 3) {
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1; // Mês em JS é 0-11
      const ano = parseInt(partes[2], 10);
      return new Date(ano, mes, dia);
    }
    
    return new Date();
  }
}
