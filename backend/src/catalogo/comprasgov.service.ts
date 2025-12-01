import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface ItemComprasGov {
  codigo: number;
  descricao: string;
  classe?: number;
  unidade_fornecimento?: string;
  status?: boolean;
  tipo?: 'MATERIAL' | 'SERVICO';
}

export interface ClasseComprasGov {
  codigo: number;
  descricao: string;
  tipo?: 'MATERIAL' | 'SERVICO';
}

@Injectable()
export class ComprasGovService {
  private readonly logger = new Logger(ComprasGovService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://compras.dados.gov.br';

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  // ============ MATERIAIS (CATMAT) ============

  async buscarMateriais(termo: string, pagina = 1, limite = 50): Promise<ItemComprasGov[]> {
    try {
      const offset = (pagina - 1) * limite;
      const response = await this.axiosInstance.get('/materiais/v1/materiais.json', {
        params: {
          descricao: termo,
          offset,
          limit: limite,
        },
      });

      const materiais = response.data?._embedded?.materiais || [];
      return materiais.map((m: any) => ({
        codigo: m.codigo,
        descricao: m.descricao,
        classe: m.classe,
        unidade_fornecimento: m.unidade_fornecimento,
        status: m.status,
        tipo: 'MATERIAL' as const,
      }));
    } catch (error) {
      this.logger.error(`Erro ao buscar materiais: ${error.message}`);
      return [];
    }
  }

  async buscarMaterialPorCodigo(codigo: string): Promise<ItemComprasGov | null> {
    try {
      const response = await this.axiosInstance.get(`/materiais/v1/materiais/${codigo}.json`);
      const m = response.data;
      return {
        codigo: m.codigo,
        descricao: m.descricao,
        classe: m.classe,
        unidade_fornecimento: m.unidade_fornecimento,
        status: m.status,
        tipo: 'MATERIAL',
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar material ${codigo}: ${error.message}`);
      return null;
    }
  }

  // ============ SERVIÇOS (CATSER) ============

  async buscarServicos(termo: string, pagina = 1, limite = 50): Promise<ItemComprasGov[]> {
    try {
      const offset = (pagina - 1) * limite;
      const response = await this.axiosInstance.get('/servicos/v1/servicos.json', {
        params: {
          descricao: termo,
          offset,
          limit: limite,
        },
      });

      const servicos = response.data?._embedded?.servicos || [];
      return servicos.map((s: any) => ({
        codigo: s.codigo,
        descricao: s.descricao,
        classe: s.classe,
        unidade_fornecimento: s.unidade_fornecimento,
        status: s.status,
        tipo: 'SERVICO' as const,
      }));
    } catch (error) {
      this.logger.error(`Erro ao buscar serviços: ${error.message}`);
      return [];
    }
  }

  async buscarServicoPorCodigo(codigo: string): Promise<ItemComprasGov | null> {
    try {
      const response = await this.axiosInstance.get(`/servicos/v1/servicos/${codigo}.json`);
      const s = response.data;
      return {
        codigo: s.codigo,
        descricao: s.descricao,
        classe: s.classe,
        unidade_fornecimento: s.unidade_fornecimento,
        status: s.status,
        tipo: 'SERVICO',
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar serviço ${codigo}: ${error.message}`);
      return null;
    }
  }

  // ============ BUSCA GENÉRICA ============

  async buscarPorCodigo(codigo: string): Promise<ItemComprasGov[]> {
    const resultados: ItemComprasGov[] = [];

    // Tentar como material
    const material = await this.buscarMaterialPorCodigo(codigo);
    if (material) resultados.push(material);

    // Tentar como serviço
    const servico = await this.buscarServicoPorCodigo(codigo);
    if (servico) resultados.push(servico);

    return resultados;
  }

  // ============ CLASSES ============

  async listarClassesMateriais(): Promise<ClasseComprasGov[]> {
    try {
      const response = await this.axiosInstance.get('/materiais/v1/classes.json', {
        params: { limit: 500 },
      });

      const classes = response.data?._embedded?.classes || [];
      return classes.map((c: any) => ({
        codigo: c.codigo,
        descricao: c.descricao,
        tipo: 'MATERIAL' as const,
      }));
    } catch (error) {
      this.logger.error(`Erro ao listar classes de materiais: ${error.message}`);
      return [];
    }
  }

  async listarClassesServicos(): Promise<ClasseComprasGov[]> {
    try {
      const response = await this.axiosInstance.get('/servicos/v1/classes.json', {
        params: { limit: 500 },
      });

      const classes = response.data?._embedded?.classes || [];
      return classes.map((c: any) => ({
        codigo: c.codigo,
        descricao: c.descricao,
        tipo: 'SERVICO' as const,
      }));
    } catch (error) {
      this.logger.error(`Erro ao listar classes de serviços: ${error.message}`);
      return [];
    }
  }

  // ============ UNIDADES DE FORNECIMENTO ============

  async listarUnidadesFornecimento(): Promise<{ sigla: string; nome: string }[]> {
    try {
      const response = await this.axiosInstance.get('/materiais/v1/unidades_fornecimento.json', {
        params: { limit: 100 },
      });

      const unidades = response.data?._embedded?.unidades_fornecimento || [];
      return unidades.map((u: any) => ({
        sigla: u.sigla,
        nome: u.descricao,
      }));
    } catch (error) {
      this.logger.error(`Erro ao listar unidades: ${error.message}`);
      return [];
    }
  }

  // ============ VERIFICAR DISPONIBILIDADE ============

  async verificarDisponibilidade(): Promise<boolean> {
    try {
      await this.axiosInstance.get('/materiais/v1/materiais.json', {
        params: { limit: 1 },
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }
}
