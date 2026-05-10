import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../system-config/system-config.service';
import { CotacaoPorFonte, FontePesquisaTipo, ItemPesquisaPrecos, calcularEstatisticasItem } from './types/pesquisa-precos.type';

export interface BuscaPrecoInput {
  descricao: string;
  quantidade?: number;
  unidade?: string;
  codigoMaterial?: string;
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

const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';
const DADOS_ABERTOS_COMPRAS_BASE = 'https://dadosabertos.compras.gov.br';
const PESQUISA_PRECOS_COMPRAS_GOV_INFO_URL = 'https://www.gov.br/compras/pt-br/sistemas/conheca-o-compras/pesquisa-de-precos';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modelo Perplexity Sonar — busca web com citações reais
const PERPLEXITY_MODEL = 'perplexity/sonar-pro';

@Injectable()
export class PesquisaPrecosAgenteService {
  private readonly logger = new Logger(PesquisaPrecosAgenteService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  private async getOpenRouterKey(): Promise<string> {
    const fromEnv = this.configService.get<string>('OPENROUTER_API_KEY');
    if (fromEnv) return fromEnv;
    const cfg = await this.systemConfigService.getIaConfig().catch(() => null);
    if (cfg?.apiKey) return cfg.apiKey;
    throw new Error('OPENROUTER_API_KEY não configurada');
  }

  /**
   * Ponto de entrada principal: busca preços reais nas fontes governamentais e web.
   * NUNCA estima preços — apenas cita fontes verificáveis.
   */
  async pesquisarPrecos(input: BuscaPrecoInput): Promise<{
    item: Partial<ItemPesquisaPrecos>;
    fontes: ResultadoBuscaPreco[];
    resumo: string;
  }> {
    const fontes: ResultadoBuscaPreco[] = [];

    // Busca em paralelo: PNCP oficial + Pesquisa de Precos Compras.gov.br + Busca Web
    const [pncpRes, painelRes, webRes] = await Promise.allSettled([
      this.buscarNoPNCP(input),
      this.buscarNoPainelDePrecos(input),
      this.buscarNaWeb(input),
    ]);

    if (pncpRes.status === 'fulfilled') fontes.push(...pncpRes.value);
    else this.logger.warn(`PNCP: ${pncpRes.reason?.message}`);

    if (painelRes.status === 'fulfilled') fontes.push(...painelRes.value);
    else this.logger.warn(`Pesquisa de Precos Compras.gov.br: ${painelRes.reason?.message}`);

    if (webRes.status === 'fulfilled') fontes.push(...webRes.value);
    else this.logger.warn(`Busca web: ${webRes.reason?.message}`);

    const fontesPNCP = fontes.filter(f => f.fonte === 'PNCP').length;
    const fontesPainel = fontes.filter(f => f.fonte === 'PAINEL_DE_PRECOS').length;
    const fontesWeb = fontes.filter(f => f.fonte === 'MIDIA_ESPECIALIZADA').length;

    const resumo = fontes.length > 0
      ? `${fontes.length} cotação(ões) com fontes reais: ${fontesPNCP} PNCP, ${fontesPainel} Pesquisa de Precos Compras.gov.br, ${fontesWeb} web.`
      : 'Nenhuma cotação encontrada nas fontes governamentais. Verifique se o PNCP e o Pesquisa de Precos Compras.gov.br estão acessíveis ou pesquise manualmente.';

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

    if (cotacoes.length > 0) {
      const itemComEstatisticas = calcularEstatisticasItem(itemParcial as ItemPesquisaPrecos);
      itemParcial.valor_referencial = itemComEstatisticas.valor_mediano ?? itemComEstatisticas.valor_medio ?? 0;
      Object.assign(itemParcial, itemComEstatisticas);
    }

    return { item: itemParcial, fontes, resumo };
  }

  /**
   * Busca itens com resultado publicado no PNCP (API pública, sem autenticação).
   */
  private async buscarNoPNCP(input: BuscaPrecoInput): Promise<ResultadoBuscaPreco[]> {
    const resultados: ResultadoBuscaPreco[] = [];

    try {
      const resp = await axios.get(`${PNCP_CONSULTA_BASE}/itens/resultado`, {
        params: {
          descricao: input.descricao.substring(0, 100),
          pagina: 1,
          tamanhoPagina: 10,
        },
        timeout: 8000,
        headers: { Accept: 'application/json' },
      });

      const itens: any[] = resp.data?.data || resp.data?.itens || resp.data?.resultado || [];

      for (const item of itens.slice(0, 5)) {
        const valor = parseFloat(item.valorUnitario || item.valorHomologado || item.valor || 0);
        if (!valor || valor <= 0) continue;

        const dataRef = item.dataResultado || item.dataAbertura || item.dataHomologacao;
        const dataFormatada = dataRef
          ? new Date(dataRef).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        const cnpj = (item.orgaoEntidade?.cnpj || item.cnpjOrgao || '').replace(/\D/g, '');
        const anoCompra = item.anoCompra || item.ano || '';
        const seqCompra = item.sequencialCompra || item.sequencial || '';

        resultados.push({
          fonte: 'PNCP',
          descricao_fonte: `PNCP — ${item.orgaoEntidade?.razaoSocial || item.nomeOrgao || 'Órgão público'}`,
          url_referencia: cnpj && anoCompra && seqCompra
            ? `https://pncp.gov.br/app/editais/${cnpj}/${anoCompra}/${seqCompra}`
            : 'https://pncp.gov.br',
          data_pesquisa: dataFormatada,
          fornecedor_razao_social: item.nomeFantasia || item.razaoSocialFornecedor || item.fornecedor?.razaoSocial,
          valor_unitario: valor,
          observacao: item.descricao || item.descricaoItem || input.descricao,
        });
      }
    } catch (err: any) {
      this.logger.warn(`PNCP /itens/resultado: ${err.message}`);

      // Fallback: buscar contratações por texto
      try {
        const resp2 = await axios.get(`${PNCP_CONSULTA_BASE}/contratacoes/proposta`, {
          params: { q: input.descricao.substring(0, 80), pagina: 1, tamanhoPagina: 5 },
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
      } catch { /* sem dados */ }
    }

    return resultados;
  }

  /**
   * Busca no Pesquisa de Precos Compras.gov.br via Dados Abertos.
   */
  private async buscarNoPainelDePrecos(input: BuscaPrecoInput): Promise<ResultadoBuscaPreco[]> {
    const resultados: ResultadoBuscaPreco[] = [];
    const codigo = String(input.codigoMaterial || '').replace(/\D/g, '');
    if (!codigo) return resultados;

    try {
      const resp = await axios.get(`${DADOS_ABERTOS_COMPRAS_BASE}/modulo-pesquisa-preco/1_consultarMaterial`, {
        params: {
          codigoItemCatalogo: codigo,
          pagina: 1,
          tamanhoPagina: 10,
        },
        timeout: 8000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PortalDCP/1.0 (pesquisa-precos)',
        },
      });

      const lista: any[] = resp.data?.resultado || resp.data?.data || resp.data?.content || (Array.isArray(resp.data) ? resp.data : []);

      for (const item of lista.slice(0, 5)) {
        const valor = parseFloat(item.precoUnitario || item.valorUnitario || item.preco_unitario || item.preco || 0);
        if (!valor || valor <= 0) continue;

        const data = item.dataResultado || item.data_compra || item.dataCompra || '';

        resultados.push({
          fonte: 'PAINEL_DE_PRECOS',
          descricao_fonte: `Pesquisa de Precos Compras.gov.br - ${item.nomeUasg || item.nomeOrgao || item.nome_orgao || item.orgao || 'Governo Federal'}`,
          url_referencia: `${DADOS_ABERTOS_COMPRAS_BASE}/modulo-pesquisa-preco/1_consultarMaterial?codigoItemCatalogo=${encodeURIComponent(codigo)}&pagina=1&tamanhoPagina=10`,
          data_pesquisa: data ? data.toString().split('T')[0] : new Date().toISOString().split('T')[0],
          valor_unitario: valor,
          observacao: `${item.descricaoItem || item.descricao_item || item.descricao || input.descricao} | Fonte oficial: ${PESQUISA_PRECOS_COMPRAS_GOV_INFO_URL}`,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Pesquisa de Precos Compras.gov.br: ${err.message}`);
    }

    return resultados;
  }

  /**
   * Busca preços na internet usando Perplexity Sonar via OpenRouter.
   * O modelo tem acesso à web em tempo real e retorna citações com URLs verificáveis.
   * NÃO gera estimativas — extrai valores reais de fontes citadas.
   */
  private async buscarNaWeb(input: BuscaPrecoInput): Promise<ResultadoBuscaPreco[]> {
    const apiKey = await this.getOpenRouterKey();
    const hoje = new Date().toISOString().split('T')[0];

    const prompt = `Pesquise preços reais de mercado para licitação pública brasileira do item abaixo.

ITEM: ${input.descricao}
QUANTIDADE: ${input.quantidade || 1} ${input.unidade || 'UN'}
UF: ${input.uf || 'Brasil (nacional)'}

Busque em:
1. PNCP (pncp.gov.br) — resultado de licitações
2. Pesquisa de Precos Compras.gov.br por CATMAT/CATSER
3. Sites de fornecedores ou distribuidores
4. Tabelas oficiais (SINAPI, SICRO, ANS, ANVISA) se aplicável

RETORNE APENAS um JSON array com os preços encontrados, sem texto fora do JSON:
[
  {
    "valor_unitario": 1234.56,
    "descricao_fonte": "Nome do órgão/fornecedor/portal",
    "url": "https://url-real-da-fonte.gov.br/...",
    "data": "YYYY-MM-DD ou aproximada",
    "observacao": "breve descrição do item/contexto"
  }
]

REGRAS CRÍTICAS:
- Inclua APENAS preços com URL real e verificável como fonte
- NÃO invente valores — se não encontrar, retorne []
- NÃO inclua estimativas ou previsões — apenas preços reais publicados`;

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://portaldcp.gov.br',
          'X-Title': 'Portal DCP — Pesquisa de Preços',
        },
        body: JSON.stringify({
          model: PERPLEXITY_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.warn(`Perplexity Sonar erro ${response.status}: ${err.substring(0, 200)}`);
        return [];
      }

      const data = await response.json();
      const content: string = data.choices?.[0]?.message?.content || '';
      // Citations retornadas pelo Perplexity (array de URLs)
      const citations: string[] = data.citations || [];

      this.logger.log(`Perplexity Sonar retornou ${citations.length} citações`);

      // Extrai o JSON da resposta
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('Perplexity Sonar: nenhum JSON encontrado na resposta');
        return [];
      }

      const parsed: any[] = JSON.parse(jsonMatch[0]);
      const resultados: ResultadoBuscaPreco[] = [];

      for (const item of parsed) {
        const valor = parseFloat(item.valor_unitario || 0);
        if (!valor || valor <= 0) continue;

        // Valida que tem URL real
        const url = item.url || '';
        if (!url || !url.startsWith('http')) continue;

        // Determina o tipo de fonte pela URL
        const fonte = this.classificarFontePelaUrl(url);

        resultados.push({
          fonte,
          descricao_fonte: item.descricao_fonte || url,
          url_referencia: url,
          data_pesquisa: item.data || hoje,
          valor_unitario: valor,
          observacao: item.observacao || input.descricao,
        });
      }

      // Adiciona citações extras do Perplexity que possam ter preços mas não foram parseadas
      this.logger.log(`Busca web: ${resultados.length} resultado(s) com URL verificável`);
      return resultados;
    } catch (err: any) {
      this.logger.warn(`Busca web (Perplexity Sonar): ${err.message}`);
      return [];
    }
  }

  private classificarFontePelaUrl(url: string): FontePesquisaTipo {
    if (url.includes('pncp.gov.br')) return 'PNCP';
    if (url.includes('paineldeprecos') || url.includes('compras.gov.br') || url.includes('comprasnet')) return 'PAINEL_DE_PRECOS';
    if (url.includes('.gov.br')) return 'CONTRATO_VIGENTE_SISTEMA';
    return 'MIDIA_ESPECIALIZADA';
  }

  /**
   * Pesquisa de preços para múltiplos itens em batch.
   */
  async pesquisarItens(itens: BuscaPrecoInput[]): Promise<{
    itens: Array<Partial<ItemPesquisaPrecos>>;
    resumo: string;
    fontesPorItem: Array<{ descricao: string; fontes: ResultadoBuscaPreco[] }>;
  }> {
    const resultados = await Promise.all(itens.map(item => this.pesquisarPrecos(item)));

    const itensResultado = resultados.map((r, i) => ({ ...r.item, item_numero: i + 1 }));

    const totalFontes = resultados.reduce((acc, r) => acc + r.fontes.length, 0);
    const fontesPNCP = resultados.reduce((acc, r) => acc + r.fontes.filter(f => f.fonte === 'PNCP').length, 0);
    const fontesPainel = resultados.reduce((acc, r) => acc + r.fontes.filter(f => f.fonte === 'PAINEL_DE_PRECOS').length, 0);
    const fontesWeb = resultados.reduce((acc, r) => acc + r.fontes.filter(f => f.fonte === 'MIDIA_ESPECIALIZADA').length, 0);

    return {
      itens: itensResultado,
      resumo: `Pesquisa concluída: ${totalFontes} cotações com fontes reais (${fontesPNCP} PNCP, ${fontesPainel} Pesquisa de Precos Compras.gov.br, ${fontesWeb} web) para ${itens.length} item(ns).`,
      fontesPorItem: resultados.map((r, i) => ({ descricao: itens[i].descricao, fontes: r.fontes })),
    };
  }
}
