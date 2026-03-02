import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ContratosService } from './contratos.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';

export interface PortalTransparenciaContrato {
  contratoNumero: string;
  documento: string;
  favorecido: string;
  contratoObjeto: string;
  vigencia: string;
  vigencia_inicio?: string;
  aditivos_valor_total?: string | null;
  valor_contrato?: string;
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
    apenas_vigentes?: boolean;
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

      let data = response.data.data || [];
      
      // Filtrar apenas contratos vigentes se solicitado
      if (params.apenas_vigentes) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        data = data.filter(contrato => {
          const dataVigencia = this.parseDataBrasileira(contrato.vigencia);
          return dataVigencia >= hoje;
        });
        
        this.logger.log(`Filtrados ${data.length} contratos vigentes de ${response.data.data?.length || 0} total`);
      }

      return {
        resource: response.data.resource,
        count: data.length,
        data: data
      };
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
      apenas_vigentes?: boolean;
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
            numero: contratoApi.contratoNumero,
            status: 'sucesso',
          });
        } catch (error) {
          resultado.erros++;
          resultado.detalhes.push({
            numero: contratoApi.contratoNumero,
            status: 'erro',
            mensagem: error.message,
          });
          this.logger.error(`Erro ao importar contrato ${contratoApi.contratoNumero}: ${error.message}`);
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
    const cnpjLimpo = contratoApi.documento.replace(/\D/g, '');
    
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
      this.logger.log(`Criando fornecedor: ${contratoApi.favorecido} - ${cnpjLimpo}`);
      // Usar cadastro rápido que já existe no sistema
      fornecedor = await this.fornecedoresService.cadastroRapidoOrgao(
        cnpjLimpo,
        contratoApi.favorecido
      );
    }

    // Converter vigência para data
    const dataVigencia = this.parseDataBrasileira(contratoApi.vigencia);
    
    // Converter valor - usar aditivos_valor_total se existir, senão valor_contrato
    let valorGlobal = 0;
    if (contratoApi.aditivos_valor_total) {
      valorGlobal = parseFloat(contratoApi.aditivos_valor_total) || 0;
    } else if (contratoApi.valor_contrato) {
      // Remover 'R$' e converter formato brasileiro (1.234,56 -> 1234.56)
      const valorLimpo = contratoApi.valor_contrato
        .replace(/^R\$\s*/, '')
        .replace(/\./g, '')
        .replace(',', '.');
      valorGlobal = parseFloat(valorLimpo) || 0;
    }

    // Extrair ano do número do contrato (ex: 001/2024-Contrato -> 2024)
    const anoMatch = contratoApi.contratoNumero.match(/\/(\d{4})/);
    const ano = anoMatch ? parseInt(anoMatch[1]) : new Date().getFullYear();

    // Criar contrato usando o método existente
    this.logger.log(`Criando contrato: ${contratoApi.contratoNumero}`);
    
    // Buscar se contrato já existe
    try {
      const contratoExistente = await this.contratosService.findByNumero(
        orgaoId,
        contratoApi.contratoNumero
      );
      
      if (contratoExistente) {
        this.logger.log(`Contrato ${contratoApi.contratoNumero} já existe, pulando...`);
        return;
      }
    } catch (e) {
      // Contrato não existe, continuar
    }

    // Criar DTO para o contrato
    const createDto = {
      numero_contrato: contratoApi.contratoNumero.replace('-Contrato', ''),
      ano,
      objeto: contratoApi.contratoObjeto,
      valor_global: valorGlobal,
      data_inicio: contratoApi.vigencia_inicio ? this.parseDataBrasileira(contratoApi.vigencia_inicio) : new Date(),
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
