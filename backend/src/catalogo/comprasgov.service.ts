import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface ItemComprasGov {
  codigo: number;
  descricao: string;
  nome_pdm?: string;
  caracteristicas?: { nome: string; valor: string }[];
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

export interface PdmComprasGov {
  codigoPdm: number;
  nomePdm: string;
  codigoClasse?: number;
  nomeClasse?: string;
  codigoGrupo?: number;
  nomeGrupo?: string;
  statusPdm?: boolean;
}

export interface FiltroPdmComprasGov {
  codigo: string;
  nome: string;
  obrigatoria: boolean;
  valores: { codigo: string; nome: string }[];
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
      .map((c: any) => {
        const unidade = c.siglaUnidadeMedida ? ` ${c.siglaUnidadeMedida}` : '';
        return `${c.nomeCaracteristica}: ${c.nomeValorCaracteristica}${unidade}`;
      })
      .filter(Boolean)
      .join(', ');
    return [item.nomePdm || item.descricaoPDM || item.descricaoItem, caracteristicas]
      .filter(Boolean)
      .join(' - ');
  }

  private normalizarTermo(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private mapearMaterial(item: any, pdm?: any): ItemComprasGov {
    const codigoPdm = item.codigoPdm ?? item.codigoPDM ?? pdm?.codigoPdm ?? pdm?.codigoPDM;
    const nomePdm = item.nomePdm || pdm?.nomePdm || pdm?.descricaoPDM || '';
    const caracts: { nome: string; valor: string }[] = (item.buscaItemCaracteristica || [])
      .map((c: any) => ({
        nome: c.nomeCaracteristica,
        valor: [c.nomeValorCaracteristica, c.siglaUnidadeMedida].filter(Boolean).join(' '),
      }))
      .filter((c: any) => c.nome && c.valor);

    return {
      codigo: item.codigoItem,
      descricao: this.montarDescricaoMaterial(item),
      nome_pdm: nomePdm,
      caracteristicas: caracts,
      classe: item.codigoClasse ?? pdm?.codigoClasse,
      nome_classe: item.nomeClasse ?? pdm?.nomeClasse ?? pdm?.descricaoClasse,
      grupo: pdm?.codigoGrupo,
      pdm: codigoPdm,
      status: item.statusItem,
      sustentavel: item.itemSustentavel,
      tipo: 'MATERIAL',
    };
  }

  private mapearPdm(pdm: any): PdmComprasGov {
    return {
      codigoPdm: pdm.codigoPdm ?? pdm.codigoPDM,
      nomePdm: pdm.nomePdm || pdm.descricaoPDM,
      codigoClasse: pdm.codigoClasse,
      nomeClasse: pdm.nomeClasse || pdm.descricaoClasse,
      codigoGrupo: pdm.codigoGrupo,
      nomeGrupo: pdm.nomeGrupo || pdm.descricaoGrupo,
      statusPdm: pdm.statusPDM ?? pdm.statusPdm,
    };
  }

  private montarFiltrosPdm(itens: any[]): FiltroPdmComprasGov[] {
    const filtros = new Map<string, FiltroPdmComprasGov>();

    for (const item of itens) {
      for (const caracteristica of item.buscaItemCaracteristica || []) {
        const codigo = String(caracteristica.codigoCaracteristica || caracteristica.nomeCaracteristica || '');
        if (!codigo) continue;

        if (!filtros.has(codigo)) {
          filtros.set(codigo, {
            codigo,
            nome: caracteristica.nomeCaracteristica,
            obrigatoria: Boolean(caracteristica.caracteristicaObrigatoria),
            valores: [],
          });
        }

        const filtro = filtros.get(codigo)!;
        const codigoValor = String(caracteristica.codigoValorCaracteristica || caracteristica.nomeValorCaracteristica || '');
        const unidade = caracteristica.siglaUnidadeMedida ? ` ${caracteristica.siglaUnidadeMedida}` : '';
        const nomeValor = `${caracteristica.nomeValorCaracteristica}${unidade}`;

        if (codigoValor && !filtro.valores.some((valor) => valor.codigo === codigoValor)) {
          filtro.valores.push({ codigo: codigoValor, nome: nomeValor });
        }
      }
    }

    return Array.from(filtros.values()).map((filtro) => ({
      ...filtro,
      valores: filtro.valores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }));
  }

  private itemAtendeFiltros(item: any, filtros: Record<string, string>): boolean {
    const caracteristicas = item.buscaItemCaracteristica || [];
    return Object.entries(filtros).every(([codigoCaracteristica, codigoValor]) =>
      caracteristicas.some((caracteristica: any) =>
        String(caracteristica.codigoCaracteristica) === codigoCaracteristica
        && String(caracteristica.codigoValorCaracteristica || caracteristica.nomeValorCaracteristica) === codigoValor,
      ),
    );
  }

  // ============ MATERIAIS (CATMAT) ============

  async buscarPdmsMateriais(termo: string, limite = 20): Promise<PdmComprasGov[]> {
    try {
      const response = await this.cnbsInstance.get('/material/v1/palavra', {
        params: { palavra: termo },
      });

      const termoNormalizado = this.normalizarTermo(termo);
      const pdms = (Array.isArray(response.data) ? response.data : [])
        .map((pdm: any) => this.mapearPdm(pdm))
        .filter((pdm: PdmComprasGov) => pdm.codigoPdm && pdm.nomePdm);

      return pdms
        .sort((a, b) => {
          const aExato = this.normalizarTermo(a.nomePdm) === termoNormalizado ? 0 : 1;
          const bExato = this.normalizarTermo(b.nomePdm) === termoNormalizado ? 0 : 1;
          return aExato - bExato || a.nomePdm.localeCompare(b.nomePdm, 'pt-BR');
        })
        .slice(0, limite);
    } catch (error) {
      this.logger.error(`Erro ao buscar PDMs: ${error.message}`);
      return [];
    }
  }

  async buscarItensPdmMaterial(
    codigoPdm: string,
    filtros: Record<string, string> = {},
    limite = 100,
  ): Promise<{ itens: ItemComprasGov[]; filtros: FiltroPdmComprasGov[]; unidade?: any; total: number }> {
    try {
      const [itensResponse, unidadeResponse] = await Promise.all([
        this.cnbsInstance.get('/material/v1/materialCaracteristcaValorporPDM', {
          params: { codigo_pdm: codigoPdm },
        }),
        this.cnbsInstance.get('/material/v1/unidadeFornecimentoPorCodigoPdm', {
          params: { codigo_pdm: codigoPdm },
        }).catch(() => ({ data: undefined })),
      ]);

      const itensAtivos = (Array.isArray(itensResponse.data) ? itensResponse.data : [])
        .filter((item: any) => item.statusItem !== false && item.itemSuspenso !== true);
      const itensFiltrados = itensAtivos.filter((item: any) => this.itemAtendeFiltros(item, filtros));
      const pdm = itensAtivos[0]
        ? {
            codigoPdm: Number(codigoPdm),
            nomePdm: itensAtivos[0].nomePdm,
            codigoClasse: itensAtivos[0].codigoClasse,
          }
        : undefined;

      return {
        itens: itensFiltrados.slice(0, limite).map((item: any) => this.mapearMaterial(item, pdm)),
        filtros: this.montarFiltrosPdm(itensAtivos),
        unidade: unidadeResponse.data,
        total: itensFiltrados.length,
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar itens do PDM ${codigoPdm}: ${error.message}`);
      return { itens: [], filtros: [], total: 0 };
    }
  }

  async buscarMateriais(termo: string, pagina = 1, limite = 50): Promise<ItemComprasGov[]> {
    try {
      const response = await this.cnbsInstance.get('/material/v1/palavra', {
        params: { palavra: termo },
      });

      const pdms = Array.isArray(response.data) ? response.data : [];
      const inicio = Math.max(0, (pagina - 1) * limite);
      const materiais: ItemComprasGov[] = [];
      const termoNormalizado = this.normalizarTermo(termo);
      const pdmsExatos = pdms.filter((pdm: any) =>
        this.normalizarTermo(pdm.nomePdm || pdm.descricaoPDM || '') === termoNormalizado,
      );
      const pdmsOrdenados = [
        ...pdmsExatos,
        ...pdms.filter((pdm: any) => !pdmsExatos.includes(pdm)),
      ];
      const pdmsPagina = pdmsOrdenados.slice(inicio, inicio + Math.min(8, limite));
      const itensPorPdm = Math.max(1, Math.ceil(limite / Math.max(1, pdmsPagina.length)));
      const limitarPorPdm = pdmsExatos.length === 0;

      for (const pdm of pdmsPagina) {
        const codigoPdm = pdm.codigoPdm ?? pdm.codigoPDM;
        if (!codigoPdm) continue;
        const itensResponse = await this.cnbsInstance.get('/material/v1/materialCaracteristicaValorPdmSemFiltro', {
          params: { codigo_pdm: codigoPdm },
        });
        const itens = (Array.isArray(itensResponse.data) ? itensResponse.data : [])
          .filter((item: any) => item.statusItem !== false && item.itemSuspenso !== true);
        const itensSelecionados = limitarPorPdm ? itens.slice(0, itensPorPdm) : itens;
        for (const item of itensSelecionados) {
          materiais.push(this.mapearMaterial(item, pdm));
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
