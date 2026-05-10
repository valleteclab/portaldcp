import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IaService } from '../ia/ia.service';
import { CotacaoPorFonte, FontePesquisaTipo, ItemPesquisaPrecos, calcularEstatisticasItem } from './types/pesquisa-precos.type';

export interface BuscaPrecoInput {
  descricao: string;
  quantidade?: number;
  unidade?: string;
  codigoMaterial?: string; // CATMAT/CATSER
  uf?: string;
}

export interface ResultadoBuscaPreco {
  fonte: FontePesquisaTipo;
  descricao_fonte: string;
  url_referencia?: string;
  data_pesquisa: string;
  fornecedor_razao_social?: string;
  valor_unitario: number;
  observacao?: string;
}

// API pública do PNCP — sem autenticação
const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';
// API pública do Painel de Preços — sem autenticação
const PAINEL_BASE = 'https://api.compras.dados.gov.br/pessoal/v1';
// Painel de Preços (antigo)
const PAINEL_PRECOS_BASE = 'https://paineldeprecos.planejamento.gov.br/api';

@Injectable()
export class PesquisaPrecosAgenteService {
  private readonly logger = new Logger(PesquisaPrecosAgenteService.name);

  constructor(private readonly iaService: IaService) {}

  /**
   * Ponto de entrada principal: busca preços em todas as fontes disponíveis.
   */
  async pesquisarPrecos(input: BuscaPrecoInput): Promise<{
    item: Partial<ItemPesquisaPrecos>;
    fontes: ResultadoBuscaPreco[];
    resumo: string;
  }> {
    const hoje = new Date().toISOString().split('T')[0];
    const fontes: ResultadoBuscaPreco[] = [];

    // Busca em paralelo nas fontes disponíveis
    const [pncpItens, painelPrecos] = await Promise.allSettled([
      this.buscarNoPNCP(input),
      this.buscarNoPainelDePrecos(input),
    ]);

    if (pncpItens.status === 'fulfilled') {
      fontes.push(...pncpItens.value);
    } else {
      this.logger.warn(`PNCP: ${pncpItens.reason?.message}`);
    }

    if (painelPrecos.status === 'fulfilled') {
      fontes.push(...painelPrecos.value);
    } else {
      this.logger.warn(`Painel de Preços: ${painelPrecos.reason?.message}`);
    }

    // Se não encontrou dados suficientes, usa IA para complementar estimativa
    let resumo = '';
    if (fontes.length < 3) {
      const iaFontes = await this.complementarComIA(input, fontes, hoje);
      fontes.push(...iaFontes);
      resumo = `Fontes reais encontradas: ${fontes.length - iaFontes.length}. IA complementou com ${iaFontes.length} referência(s) baseada em dados históricos de mercado.`;
    } else {
      resumo = `${fontes.length} cotação(ões) obtida(s) de fontes governamentais reais (PNCP, Painel de Preços).`;
    }

    // Monta item parcial com cotações
    const cotacoes: CotacaoPorFonte[] = fontes.map(f => ({
      fonte: f.fonte,
      descricao_fonte: f.descricao_fonte,
      url_referencia: f.url_referencia,
      data_pesquisa: f.data_pesquisa,
      fornecedor_razao_social: f.fornecedor_razao_social,
      valor_unitario: f.valor_unitario,
      observacao: f.observacao,
    }));

    const itemParcial: Partial<ItemPesquisaPrecos> = {
      descricao: input.descricao,
      quantidade: input.quantidade || 1,
      unidade: input.unidade || 'UN',
      cotacoes,
      metodologia: 'MEDIANA',
    };

    const itemComEstatisticas = calcularEstatisticasItem(itemParcial as ItemPesquisaPrecos);
    itemParcial.valor_referencial = itemComEstatisticas.valor_mediano || itemComEstatisticas.valor_medio || 0;

    return { item: itemParcial, fontes, resumo };
  }

  /**
   * Busca itens com resultado (vencedores) no PNCP pela descrição do item.
   * Usa a API pública de consulta — não requer autenticação.
   */
  private async buscarNoPNCP(input: BuscaPrecoInput): Promise<ResultadoBuscaPreco[]> {
    const resultados: ResultadoBuscaPreco[] = [];

    try {
      // Endpoint público: GET /itens/resultado?descricao=...&pagina=1&tamanhoPagina=10
      const resp = await axios.get(`${PNCP_CONSULTA_BASE}/itens/resultado`, {
        params: {
          descricao: input.descricao.substring(0, 100),
          pagina: 1,
          tamanhoPagina: 10,
        },
        timeout: 8000,
        headers: { Accept: 'application/json' },
      });

      const data = resp.data;
      const itens: any[] = data?.data || data?.itens || data?.resultado || [];

      for (const item of itens.slice(0, 5)) {
        const valor = parseFloat(item.valorUnitario || item.valorHomologado || item.valor || 0);
        if (!valor || valor <= 0) continue;

        const dataRef = item.dataResultado || item.dataAbertura || item.dataHomologacao;
        const dataFormatada = dataRef ? new Date(dataRef).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

        const anoCompra = item.anoCompra || item.ano;
        const seqCompra = item.sequencialCompra || item.sequencial;
        const cnpjOrgao = item.orgaoEntidade?.cnpj || item.cnpjOrgao || '';

        resultados.push({
          fonte: 'PNCP',
          descricao_fonte: `PNCP — ${item.orgaoEntidade?.razaoSocial || item.nomeOrgao || 'Órgão público'}`,
          url_referencia: cnpjOrgao && anoCompra && seqCompra
            ? `https://pncp.gov.br/app/editais/${cnpjOrgao}/${anoCompra}/${seqCompra}`
            : 'https://pncp.gov.br',
          data_pesquisa: dataFormatada,
          fornecedor_razao_social: item.nomeFantasia || item.razaoSocialFornecedor || item.fornecedor?.razaoSocial,
          valor_unitario: valor,
          observacao: item.descricao || item.descricaoItem || input.descricao,
        });
      }
    } catch (err: any) {
      this.logger.warn(`PNCP itens/resultado: ${err.message}`);

      // Fallback: busca por compras recentes com itens similares
      try {
        const resp2 = await axios.get(`${PNCP_CONSULTA_BASE}/contratacoes/proposta`, {
          params: {
            q: input.descricao.substring(0, 80),
            pagina: 1,
            tamanhoPagina: 5,
          },
          timeout: 8000,
          headers: { Accept: 'application/json' },
        });

        const itens2: any[] = resp2.data?.data || resp2.data?.itens || [];
        for (const item of itens2.slice(0, 3)) {
          const valor = parseFloat(item.valorEstimadoTotal || item.valorUnitario || 0);
          if (!valor || valor <= 0) continue;

          resultados.push({
            fonte: 'PNCP',
            descricao_fonte: `PNCP — ${item.orgaoEntidade?.razaoSocial || 'Órgão público'}`,
            url_referencia: 'https://pncp.gov.br',
            data_pesquisa: new Date().toISOString().split('T')[0],
            valor_unitario: valor,
            observacao: item.objetoCompra || input.descricao,
          });
        }
      } catch {
        // Ignora — não há dados disponíveis do PNCP
      }
    }

    return resultados;
  }

  /**
   * Busca no Painel de Preços (paineldeprecos.planejamento.gov.br).
   * API pública: não requer autenticação.
   */
  private async buscarNoPainelDePrecos(input: BuscaPrecoInput): Promise<ResultadoBuscaPreco[]> {
    const resultados: ResultadoBuscaPreco[] = [];

    try {
      // Endpoint oficial do Painel de Preços
      const resp = await axios.get(`${PAINEL_PRECOS_BASE}/preco_painel`, {
        params: {
          descricao_item: input.descricao.substring(0, 80),
          quantidade: 10,
          pagina: 1,
          ...(input.uf ? { uf: input.uf } : {}),
        },
        timeout: 8000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PortalDCP/1.0 (pesquisa-precos-automatica)',
        },
      });

      const itens: any[] = resp.data?.resultado || resp.data?.data || resp.data || [];
      const lista = Array.isArray(itens) ? itens : [];

      for (const item of lista.slice(0, 5)) {
        const valor = parseFloat(item.preco_unitario || item.valorUnitario || item.preco || 0);
        if (!valor || valor <= 0) continue;

        const data = item.data_compra || item.dataCompra || new Date().toISOString().split('T')[0];

        resultados.push({
          fonte: 'PAINEL_DE_PRECOS',
          descricao_fonte: `Painel de Preços — ${item.nome_orgao || item.orgao || 'Governo Federal'}`,
          url_referencia: 'https://paineldeprecos.planejamento.gov.br',
          data_pesquisa: typeof data === 'string' ? data.split('T')[0] : new Date().toISOString().split('T')[0],
          valor_unitario: valor,
          observacao: item.descricao_item || item.descricao || input.descricao,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Painel de Preços: ${err.message}`);

      // Fallback: API alternativa do compras.dados.gov.br
      try {
        const resp2 = await axios.get('https://compras.dados.gov.br/licitacoes/v1/itens_participantes.json', {
          params: {
            descricao_item: input.descricao.substring(0, 60),
            _limit: 5,
          },
          timeout: 8000,
        });

        const itens2: any[] = resp2.data?._embedded?.itens_participantes || [];
        for (const item of itens2.slice(0, 3)) {
          const valor = parseFloat(item.preco_unitario || 0);
          if (!valor || valor <= 0) continue;

          resultados.push({
            fonte: 'PAINEL_DE_PRECOS',
            descricao_fonte: 'Painel de Preços Gov.br (compras.dados.gov.br)',
            url_referencia: 'https://compras.dados.gov.br',
            data_pesquisa: new Date().toISOString().split('T')[0],
            valor_unitario: valor,
            observacao: item.descricao_item || input.descricao,
          });
        }
      } catch {
        // Sem dados disponíveis
      }
    }

    return resultados;
  }

  /**
   * Usa IA para complementar as cotações quando não há dados suficientes nas fontes reais.
   * A IA é instruída a fornecer estimativas baseadas em conhecimento de mercado.
   */
  private async complementarComIA(
    input: BuscaPrecoInput,
    fontesReais: ResultadoBuscaPreco[],
    hoje: string,
  ): Promise<ResultadoBuscaPreco[]> {
    const jaTemPNCP = fontesReais.some(f => f.fonte === 'PNCP');
    const jaTemPainel = fontesReais.some(f => f.fonte === 'PAINEL_DE_PRECOS');
    const fontesFaltando = 3 - fontesReais.length;
    if (fontesFaltando <= 0) return [];

    const contexto = `
Objeto da pesquisa: ${input.descricao}
Quantidade: ${input.quantidade || 1} ${input.unidade || 'UN'}
UF de referência: ${input.uf || 'BR (nacional)'}
Data da pesquisa: ${hoje}
Fontes já coletadas: ${fontesReais.map(f => `${f.fonte}: R$ ${f.valor_unitario}`).join(', ') || 'nenhuma'}
Fontes que JÁ EXISTEM (não repetir): ${[jaTemPNCP ? 'PNCP' : '', jaTemPainel ? 'PAINEL_DE_PRECOS' : ''].filter(Boolean).join(', ') || 'nenhuma'}
Quantidade de fontes complementares necessárias: ${fontesFaltando}

Forneça estimativas de preço baseadas em:
- Tabelas SINAPI/SICRO (para construção/engenharia)
- Catálogos de fornecedores reconhecidos
- Preços históricos de licitações similares
- Mídias especializadas do setor
`;

    try {
      const resposta = await this.iaService.chat([
        {
          role: 'user',
          content: `Você é um especialista em pesquisa de preços públicos (Lei 14.133/2021, Art. 23).

Contexto:
${contexto}

Retorne APENAS um array JSON com ${fontesFaltando} cotação(ões) complementar(es) no formato:
[
  {
    "fonte": "MIDIA_ESPECIALIZADA" | "CONTRATO_VIGENTE_SISTEMA" | "OUTRA",
    "descricao_fonte": "string (ex: Tabela SINAPI abril/2025, site fornecedor X)",
    "url_referencia": "string URL ou vazio",
    "data_pesquisa": "${hoje}",
    "valor_unitario": number,
    "observacao": "string — explique a base da estimativa"
  }
]

IMPORTANTE: retorne APENAS o JSON array, sem markdown, sem texto adicional.`,
        },
      ]);

      const json = resposta.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed: any[] = JSON.parse(json.startsWith('[') ? json : `[${json}]`);

      return parsed
        .filter(p => p.valor_unitario && p.valor_unitario > 0)
        .map(p => ({
          fonte: (p.fonte || 'OUTRA') as FontePesquisaTipo,
          descricao_fonte: p.descricao_fonte || 'Estimativa IA baseada em referências de mercado',
          url_referencia: p.url_referencia || undefined,
          data_pesquisa: hoje,
          valor_unitario: parseFloat(p.valor_unitario),
          observacao: p.observacao || 'Estimativa gerada por IA com base em dados históricos',
        }));
    } catch (err: any) {
      this.logger.warn(`IA complemento: ${err.message}`);
      return [];
    }
  }

  /**
   * Pesquisa de preços para múltiplos itens (batch).
   */
  async pesquisarItens(itens: BuscaPrecoInput[]): Promise<{
    itens: Array<Partial<ItemPesquisaPrecos>>;
    resumo: string;
    fontesPorItem: Array<{ descricao: string; fontes: ResultadoBuscaPreco[] }>;
  }> {
    const resultados = await Promise.all(
      itens.map(item => this.pesquisarPrecos(item))
    );

    const itensResultado = resultados.map((r, i) => ({
      ...r.item,
      item_numero: i + 1,
    }));

    const totalFontes = resultados.reduce((acc, r) => acc + r.fontes.length, 0);
    const fontesPNCP = resultados.reduce((acc, r) => acc + r.fontes.filter(f => f.fonte === 'PNCP').length, 0);
    const fontesPainel = resultados.reduce((acc, r) => acc + r.fontes.filter(f => f.fonte === 'PAINEL_DE_PRECOS').length, 0);

    return {
      itens: itensResultado,
      resumo: `Pesquisa concluída: ${totalFontes} cotações coletadas (${fontesPNCP} do PNCP, ${fontesPainel} do Painel de Preços) para ${itens.length} item(ns).`,
      fontesPorItem: resultados.map((r, i) => ({
        descricao: itens[i].descricao,
        fontes: r.fontes,
      })),
    };
  }
}
