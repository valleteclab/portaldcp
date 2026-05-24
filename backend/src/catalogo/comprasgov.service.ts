import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface ItemComprasGov {
  codigo: number;
  descricao: string;
  classe?: number;
  nome_classe?: string;
  grupo?: number;
  pdm?: string | number;
  unidade_fornecimento?: string;
  status?: boolean;
  sustentavel?: boolean;
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
  private readonly cnbsInstance: AxiosInstance;
  private readonly baseUrl = 'https://dadosabertos.compras.gov.br';
  private readonly cnbsBaseUrl = 'https://cnbs.estaleiro.serpro.gov.br/cnbs-api';

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    });
    this.cnbsInstance = axios.create({
      baseURL: this.cnbsBaseUrl,
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  private montarDescricaoMaterial(item: any): string {
    const caracteristicas = (item.buscaItemCaracteristica || [])
      .map((c: any) => `${c.nomeCaracteristica}: ${c.nomeValorCaracteristica}`)
      .filter(Boolean)
      .join(', ');
    return [item.nomePdm || item.descricaoPDM || item.descricaoItem, caracteristicas]
      .filter(Boolean)
      .join(' - ');
  }

  // ============ MATERIAIS (CATMAT) ============

  async buscarMateriais(termo: string, pagina = 1, limite = 50): Promise<ItemComprasGov[]> {
    try {
      const response = await this.cnbsInstance.get('/material/v1/palavra', {
        params: { palavra: termo },
      });

      const pdms = Array.isArray(response.data) ? response.data : [];
      const inicio = Math.max(0, (pagina - 1) * limite);
      const materiais: ItemComprasGov[] = [];
      const pdmsPagina = pdms.slice(inicio, inicio + Math.min(8, limite));
      const itensPorPdm = Math.max(1, Math.ceil(limite / Math.max(1, pdmsPagina.length)));

      for (const pdm of pdmsPagina) {
        const codigoPdm = pdm.codigoPdm ?? pdm.codigoPDM;
        if (!codigoPdm) continue;
        const itensResponse = await this.cnbsInstance.get('/material/v1/materialCaracteristicaValorPdmSemFiltro', {
          params: { codigo_pdm: codigoPdm },
        });
        const itens = Array.isArray(itensResponse.data) ? itensResponse.data : [];
        for (const item of itens.slice(0, itensPorPdm)) {
          materiais.push({
            codigo: item.codigoItem,
            descricao: this.montarDescricaoMaterial(item),
            classe: item.codigoClasse ?? pdm.codigoClasse,
            nome_classe: item.nomeClasse ?? pdm.nomeClasse,
            grupo: pdm.codigoGrupo,
            pdm: item.codigoPdm ?? codigoPdm,
            status: item.statusItem,
            sustentavel: item.itemSustentavel,
            tipo: 'MATERIAL',
          });
          if (materiais.length >= limite) return materiais;
        }
      }

      return materiais;
    } catch (error) {
      this.logger.error(`Erro ao buscar materiais: ${error.message}`);
      return [];
    }
  }

  async buscarMaterialPorCodigo(codigo: string): Promise<ItemComprasGov | null> {
    try {
      const response = await this.axiosInstance.get('/modulo-material/4_consultarItemMaterial', {
        params: { codigoItem: codigo, pagina: 1, tamanhoPagina: 10 },
      });
      const m = response.data?.resultado?.[0];
      if (!m) return null;
      return {
        codigo: m.codigoItem,
        descricao: m.descricaoItem,
        classe: m.codigoClasse,
        grupo: m.codigoGrupo,
        pdm: m.codigoPdm,
        unidade_fornecimento: m.unidade_fornecimento,
        status: m.statusItem,
        sustentavel: m.itemSustentavel,
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
      const response = await this.cnbsInstance.get('/servico/v1/palavra', {
        params: { palavra: termo },
      });

      const servicos = Array.isArray(response.data) ? response.data : [];
      const inicio = Math.max(0, (pagina - 1) * limite);
      return servicos.slice(inicio, inicio + limite).map((s: any) => ({
        codigo: s.codigoServico ?? s.codigo,
        descricao: s.descricaoServicoAcentuado || s.nomeServicoAcentuado || s.nomeServico,
        classe: s.codigoClasse,
        nome_classe: s.nomeClasse,
        grupo: s.codigoGrupo,
        status: s.statusServico ?? s.status,
        tipo: 'SERVICO' as const,
      }));
    } catch (error) {
      this.logger.error(`Erro ao buscar serviços: ${error.message}`);
      return [];
    }
  }

  async buscarServicoPorCodigo(codigo: string): Promise<ItemComprasGov | null> {
    try {
      const response = await this.axiosInstance.get('/modulo-servico/6_consultarItemServico', {
        params: { codigoServico: codigo, pagina: 1, tamanhoPagina: 10 },
      });
      const s = response.data?.resultado?.[0];
      if (!s) return null;
      return {
        codigo: s.codigoServico,
        descricao: s.nomeServico || s.descricaoServicoAcentuado,
        classe: s.codigoClasse,
        grupo: s.codigoGrupo,
        status: s.statusServico,
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
