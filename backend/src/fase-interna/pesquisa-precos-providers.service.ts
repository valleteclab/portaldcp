import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ILike, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Contrato, StatusContrato } from '../contratos/entities/contrato.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { SystemConfigService } from '../system-config/system-config.service';
import { PesquisaPrecoAgentContext, PesquisaPrecoCandidateInput, PesquisaPrecoProvider } from './pesquisa-precos-agent.types';
import { FontePesquisaTipo } from './types/pesquisa-precos.type';

const REQUEST_TIMEOUT_MS = 15000;
const MAX_IDADE_PRECO_DIAS = 365;
const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';
const PNCP_API_BASE = 'https://pncp.gov.br/api/pncp/v1';
const DADOS_ABERTOS_COMPRAS_BASE = 'https://dadosabertos.compras.gov.br';
const PESQUISA_PRECOS_COMPRAS_GOV_INFO_URL = 'https://www.gov.br/compras/pt-br/sistemas/conheca-o-compras/pesquisa-de-precos';
const PESQUISA_PRECOS_DADOS_ABERTOS_URL = 'https://suportedadoslivres.streamlit.app/';
const FONTE_PRECOS_DEFAULT_PERIOD_DIAS = 365;
const HTTP_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'PortalDCP/1.0 (pesquisa-precos; contato=suporte@portaldcp.com.br)',
};
const HTTP_BROWSER_HEADERS = {
  ...HTTP_HEADERS,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 PortalDCP/1.0',
};
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const WEB_SEARCH_MODEL = 'perplexity/sonar-pro';

function termoItem(item: ItemLicitacao): string {
  return [
    item.codigo_catmat,
    item.codigo_catser,
    item.codigo_catalogo,
    item.descricao_resumida,
    item.descricao_detalhada,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codigoCatalogoItem(item: ItemLicitacao): string {
  return String(item.codigo_catmat || item.codigo_catser || item.codigo_catalogo || '').replace(/\D/g, '');
}

function endpointsPesquisaPreco(item: ItemLicitacao): Array<{ tipo: 'material' | 'servico'; path: string }> {
  const material = { tipo: 'material' as const, path: '/modulo-pesquisa-preco/1_consultarMaterial' };
  const servico = { tipo: 'servico' as const, path: '/modulo-pesquisa-preco/3_consultarServico' };

  if (item.codigo_catser) return [servico, material];
  if (item.codigo_catmat) return [material, servico];
  return [material, servico];
}

function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
}

function normalizarDataPesquisa(valor: unknown): string {
  const hoje = hojeISO();
  if (!valor) return hoje;
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  if (/^\d{4}$/.test(texto)) return `${texto}-01-01`;
  const matchAnoMes = texto.match(/^(\d{4})-(\d{2})$/);
  if (matchAnoMes) return `${matchAnoMes[1]}-${matchAnoMes[2]}-01`;
  const matchBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (matchBr) return `${matchBr[3]}-${matchBr[2]}-${matchBr[1]}`;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? hoje : data.toISOString().split('T')[0];
}

function dataRegistroPreco(registro: any): string {
  const valor =
    registro?.dataResultado ||
    registro?.dataCompra ||
    registro?.dataHomologacao ||
    registro?.dataPublicacaoPncp ||
    registro?.dataInclusao ||
    registro?.dataAtualizacao;
  return valor ? normalizarDataPesquisa(valor) : '';
}

function tamanhoPaginaPesquisaPreco(limite: number): number {
  const desejado = Math.max(10, limite * 4);
  if (desejado <= 10) return 10;
  if (desejado <= 20) return 20;
  if (desejado <= 50) return 50;
  if (desejado <= 100) return 100;
  return 500;
}

function dataDentroDosUltimosDias(dataIso: string, dias: number): boolean {
  const data = new Date(`${dataIso}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime())) return false;
  const limite = new Date();
  limite.setUTCHours(0, 0, 0, 0);
  limite.setUTCDate(limite.getUTCDate() - dias);
  return data >= limite;
}

function especificacaoObrigatoria(item: ItemLicitacao): string {
  return [item.descricao_resumida, item.descricao_detalhada]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarBusca(valor: unknown): string {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoRegistroPncp(registro: any): string {
  return [
    registro?.codigoItemCatalogo,
    registro?.catalogoCodigoItem,
    registro?.descricao,
    registro?.descricaoItem,
    registro?.descricaoDetalhadaItem,
    registro?.objetoCompra,
    registro?.objeto,
    registro?.informacaoComplementar,
  ]
    .filter(Boolean)
    .join(' ');
}

function registroPncpAderente(registro: any, item: ItemLicitacao): boolean {
  const texto = normalizarBusca(textoRegistroPncp(registro));
  const codigo = codigoCatalogoItem(item);
  if (codigo && texto.includes(codigo)) return true;

  const descricao = normalizarBusca(especificacaoObrigatoria(item) || termoItem(item));
  const termosEssenciais = [
    'notebook',
    'memoria ram',
    'superior a 8',
    'armazenamento ssd',
    '480 a 1.000',
    'garantia on site',
    'superior a 36',
  ];
  const precisaNotebook = descricao.includes('notebook');
  if (precisaNotebook) {
    return termosEssenciais.filter((termo) => texto.includes(termo)).length >= 4;
  }

  const tokens = descricao
    .split(' ')
    .filter((token) => token.length > 3)
    .slice(0, 8);
  return tokens.length > 0 && tokens.filter((token) => texto.includes(token)).length >= Math.min(3, tokens.length);
}

function valorUnitarioPncp(registro: any): number {
  return Number(
    registro?.valorUnitarioHomologado ||
      registro?.valorUnitarioResultado ||
      registro?.valorUnitarioEstimado ||
      registro?.valorUnitario ||
      0,
  );
}

function normalizarValorPreco(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor || '').trim();
  if (!texto) return 0;
  const limpo = texto
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

export function normalizarValorFontePrecos(valor: unknown): number {
  return normalizarValorPreco(valor);
}

function aderenteMarcadoComoFalso(valor: unknown): boolean {
  if (valor === false) return true;
  const texto = normalizarBusca(valor);
  return ['false', 'falso', 'nao', 'não', 'no', '0'].includes(texto);
}

function urlValida(url: unknown): string {
  const texto = String(url || '').trim();
  if (!texto.startsWith('http')) return '';
  try {
    const parsed = new URL(texto);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function extrairPrimeiraUrl(valor: unknown): string {
  if (!valor) return '';
  const texto = String(valor);
  const match = texto.match(/https?:\/\/[^\s"'<>\\]+/i);
  return match ? urlValida(match[0]) : '';
}

function parsePossivelJson(valor: unknown): any {
  if (!valor || typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return null;
  }
}

function extrairJsonArray(texto: string): any[] {
  const limpo = (texto || '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();

  const inicio = limpo.indexOf('[');
  const fim = limpo.lastIndexOf(']');
  if (inicio === -1 || fim === -1 || fim <= inicio) return [];

  const trecho = limpo.slice(inicio, fim + 1);
  try {
    const parsed = JSON.parse(trecho);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const objetos = trecho.match(/\{[\s\S]*?\}/g) || [];
    return objetos.flatMap((objeto) => {
      try {
        return [JSON.parse(objeto)];
      } catch {
        return [];
      }
    });
  }
}

function asArray(data: any): any[] {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.itens)) return data.itens;
  if (Array.isArray(data?.resultado)) return data.resultado;
  if (Array.isArray(data)) return data;
  return [];
}

function asFontePrecosArray(data: any): any[] {
  const result = data?.result ?? data?.results ?? data?.data ?? data;
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') return Object.values(result);
  return [];
}

function montarUrlPncp(registro: any): string {
  const cnpj = String(registro.orgaoEntidade?.cnpj || registro.cnpjOrgao || registro.cnpj || '').replace(/\D/g, '');
  const ano = registro.anoCompra || registro.ano || registro.anoContratacao || '';
  const sequencial = registro.sequencialCompra || registro.sequencial || registro.numeroCompra || '';
  if (cnpj && ano && sequencial) return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${sequencial}`;
  return registro.linkSistemaOrigem || registro.linkProcessoEletronico || 'https://pncp.gov.br/app/editais';
}

function dadosContratacaoPncp(registro: any): { cnpj: string; ano: string; sequencial: string } | null {
  const numeroControle = String(registro.numeroControlePNCP || '');
  const matchControle = numeroControle.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  const cnpj = String(registro.orgaoEntidade?.cnpj || registro.cnpjOrgao || registro.cnpj || matchControle?.[1] || '').replace(/\D/g, '');
  const ano = String(registro.anoCompra || registro.ano || registro.anoContratacao || matchControle?.[3] || '');
  const sequencial = String(registro.sequencialCompra || registro.sequencial || registro.numeroCompra || matchControle?.[2] || '').replace(/\D/g, '');
  if (cnpj.length !== 14 || !ano || !sequencial) return null;
  return { cnpj, ano, sequencial: String(Number(sequencial)) };
}

function itemPncpComContexto(itemPncp: any, contratacao: any): any {
  return {
    ...itemPncp,
    orgaoEntidade: contratacao.orgaoEntidade,
    nomeOrgao: contratacao.nomeOrgao,
    objetoCompra: contratacao.objetoCompra,
    numeroControlePNCP: contratacao.numeroControlePNCP,
    anoCompra: contratacao.anoCompra,
    sequencialCompra: contratacao.sequencialCompra,
    cnpj: contratacao.orgaoEntidade?.cnpj || contratacao.cnpj,
    dataPublicacaoPncp: contratacao.dataPublicacaoPncp,
    dataHomologacao: contratacao.dataHomologacao,
    linkSistemaOrigem: contratacao.linkSistemaOrigem,
    linkProcessoEletronico: contratacao.linkProcessoEletronico,
  };
}

function valorUnitarioContrato(contrato: Contrato, item: ItemLicitacao): number {
  const quantidade = Number(item.quantidade) || 1;
  const valorGlobal = Number(contrato.valor_global) || Number(contrato.valor_inicial) || 0;
  return quantidade > 0 ? Number((valorGlobal / quantidade).toFixed(4)) : valorGlobal;
}

@Injectable()
export class PncpPriceProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'PNCP';
  private readonly logger = new Logger(PncpPriceProvider.name);

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    const candidatos: PesquisaPrecoCandidateInput[] = [];
    if (!context.scope.usarBrowserFallback) return candidatos;

    for (const item of context.itens) {
      const termo = termoItem(item);
      if (!termo) continue;

      try {
        const registros = await this.consultarPncp(termo, Math.max(5, context.scope.maxPorFonte || 5));
        for (const registro of registros.slice(0, Math.max(5, context.scope.maxPorFonte || 5))) {
          const itensPncp = await this.consultarItensContratacao(registro);
          if (!itensPncp.length) {
            this.logger.debug(`PNCP sem itens detalhados para item ${item.numero_item}: ${montarUrlPncp(registro)}`);
            continue;
          }

          for (const itemPncp of itensPncp) {
            const registroItem = itemPncpComContexto(itemPncp, registro);
            if (!registroPncpAderente(registroItem, item)) {
              this.logger.debug(`Item PNCP descartado por baixa aderencia ao item ${item.numero_item}: ${String(itemPncp.descricao || registro.objetoCompra || '').slice(0, 120)}`);
              continue;
            }
            const valorUnitario = valorUnitarioPncp(registroItem);
            const quantidade = Number(itemPncp.quantidade) || Number(item.quantidade) || 1;
            if (valorUnitario <= 0) {
              this.logger.debug(`Item PNCP descartado sem valor unitario para item ${item.numero_item}: ${String(itemPncp.descricao || '').slice(0, 120)}`);
              continue;
            }

            candidatos.push({
              item_numero: item.numero_item,
              fonte_tipo: 'PNCP',
              descricao_fonte: `PNCP item ${itemPncp.numeroItem || ''} - ${registro.orgaoEntidade?.razaoSocial || registro.nomeOrgao || 'Contratacao publica'}`.trim(),
              url_referencia: montarUrlPncp(registro),
              data_pesquisa: (itemPncp.dataAtualizacao || itemPncp.dataInclusao || registro.dataResultado || registro.dataHomologacao || registro.dataPublicacaoPncp || hojeISO()).toString().split('T')[0],
              valor_unitario: Number(valorUnitario.toFixed(4)),
              quantidade_base: quantidade,
              unidade: String(itemPncp.unidadeMedida || item.unidade_medida || 'UN'),
              evidencia: {
                tipo: 'api',
                origem: 'PNCP item da contratacao',
                coletado_em: new Date().toISOString(),
                titulo: itemPncp.descricao || registro.objetoCompra || termo,
              },
              score: 92,
            });

            if (candidatos.filter((c) => c.item_numero === item.numero_item && c.fonte_tipo === 'PNCP').length >= (context.scope.maxPorFonte || 5)) {
              break;
            }
          }

          if (candidatos.filter((c) => c.item_numero === item.numero_item && c.fonte_tipo === 'PNCP').length >= (context.scope.maxPorFonte || 5)) {
            break;
          }
        }
      } catch (error) {
        this.logger.debug(`Consulta direta PNCP indisponível para item ${item.numero_item}: ${(error as Error).message}`);
      }
    }

    return candidatos;
  }

  private async consultarItensContratacao(registro: any): Promise<any[]> {
    const dados = dadosContratacaoPncp(registro);
    if (!dados) return [];

    try {
      const res = await axios.get(`${PNCP_API_BASE}/orgaos/${dados.cnpj}/compras/${dados.ano}/${dados.sequencial}/itens`, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: HTTP_HEADERS,
      });
      return asArray(res.data);
    } catch (error) {
      this.logger.debug(`PNCP itens falhou em ${montarUrlPncp(registro)}: ${(error as Error).message}`);
      return [];
    }
  }

  private async consultarPncp(termo: string, limite: number): Promise<any[]> {
    const consultas = [
      {
        url: `${PNCP_CONSULTA_BASE}/contratacoes/publicacao`,
        params: {
          dataInicial: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, ''),
          dataFinal: new Date().toISOString().split('T')[0].replace(/-/g, ''),
          codigoModalidadeContratacao: 6,
          pagina: 1,
          tamanhoPagina: tamanhoPaginaPesquisaPreco(limite),
        },
      },
    ];

    let ultimoErro: any;
    for (const consulta of consultas) {
      try {
        const res = await axios.get(consulta.url, {
          params: consulta.params,
          timeout: REQUEST_TIMEOUT_MS,
          headers: HTTP_HEADERS,
        });
        const registros = asArray(res.data);
        if (registros.length) return registros;
      } catch (error) {
        ultimoErro = error;
        this.logger.debug(`Fallback PNCP falhou em ${consulta.url}: ${(error as Error).message}`);
      }
    }

    if (ultimoErro) throw ultimoErro;
    return [];
  }
}

@Injectable()
export class PainelComprasGovProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'PAINEL_DE_PRECOS';
  private readonly logger = new Logger(PainelComprasGovProvider.name);

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    const candidatos: PesquisaPrecoCandidateInput[] = [];

    for (const item of context.itens) {
      const codigo = codigoCatalogoItem(item);
      if (codigo) {
        try {
          const registros = await this.consultarPesquisaPreco(item, codigo, Math.max(5, context.scope.maxPorFonte || 5));
          for (const registro of registros) {
            const valor = Number(registro.precoUnitario || registro.valorUnitario || 0);
            if (valor <= 0) continue;
            const dataPreco = dataRegistroPreco(registro);
            if (!dataPreco) continue;
            candidatos.push({
              item_numero: item.numero_item,
              fonte_tipo: 'PAINEL_DE_PRECOS',
              descricao_fonte: `Pesquisa de Precos Compras.gov.br - ${registro.nomeUasg || registro.nomeOrgao || 'Dados Abertos'}`,
              url_referencia: registro.urlConsulta,
              data_pesquisa: dataPreco,
              fornecedor_cnpj: registro.niFornecedor,
              fornecedor_razao_social: registro.nomeFornecedor,
              valor_unitario: Number(valor.toFixed(4)),
              quantidade_base: Number(registro.quantidade) || Number(item.quantidade) || 1,
              unidade: String(registro.siglaUnidadeFornecimento || registro.siglaUnidadeMedida || item.unidade_medida || 'UN'),
              evidencia: {
                tipo: 'api',
                origem: `Pesquisa de Precos Compras.gov.br por CATMAT/CATSER - ${PESQUISA_PRECOS_COMPRAS_GOV_INFO_URL}`,
                coletado_em: new Date().toISOString(),
                titulo: registro.descricaoItem || registro.objetoCompra || termoItem(item),
              },
              score: 95,
              flags: [`Fonte oficial: ${PESQUISA_PRECOS_COMPRAS_GOV_INFO_URL}`],
            });
          }
          if (registros.length) continue;
        } catch (error) {
          this.logger.warn(`Falha ao consultar Compras.gov.br para item ${item.numero_item}: ${(error as Error).message}`);
        }
      }

      this.logger.debug(`Pesquisa de Precos Compras.gov.br sem resultado oficial para item ${item.numero_item}.`);
    }

    return candidatos;
  }

  private async consultarPesquisaPreco(item: ItemLicitacao, codigo: string, limite: number): Promise<any[]> {
    const tamanhoPagina = tamanhoPaginaPesquisaPreco(limite);
    let ultimoErro: unknown;

    for (const endpoint of endpointsPesquisaPreco(item)) {
      try {
        const res = await axios.get(`${DADOS_ABERTOS_COMPRAS_BASE}${endpoint.path}`, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: HTTP_HEADERS,
          params: {
            codigoItemCatalogo: codigo,
            pagina: 1,
            tamanhoPagina,
          },
        });
        const registros = asArray(res.data)
          .filter((registro) => Number(registro.precoUnitario || registro.valorUnitario || 0) > 0)
          .map((registro) => ({
            ...registro,
            tipoCatalogoConsultado: endpoint.tipo,
            urlConsulta: `${DADOS_ABERTOS_COMPRAS_BASE}${endpoint.path}?codigoItemCatalogo=${encodeURIComponent(codigo)}&pagina=1&tamanhoPagina=${tamanhoPagina}`,
            urlFerramenta: PESQUISA_PRECOS_DADOS_ABERTOS_URL,
          }))
          .slice(0, limite);

        if (registros.length) return registros;
      } catch (error) {
        ultimoErro = error;
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        this.logger.debug(
          `Pesquisa de Precos Compras.gov.br ${endpoint.tipo} falhou para codigo ${codigo}${status ? ` (HTTP ${status})` : ''}: ${(error as Error).message}`,
        );
      }
    }

    if (ultimoErro) throw ultimoErro;
    return [];
  }
}

type FontePrecosSession = {
  cookies: string;
  autenticadoEm: number;
};

type FontePrecosConfig = {
  baseUrl: string;
  email: string;
  password: string;
  periodo: number;
};

function textoFontePrecos(registro: any): string {
  return [
    registro?.catmat_catser,
    registro?.codigo_br,
    registro?.termo_id,
    registro?.descricao,
    registro?.descricao_comp,
    registro?.descricao_comp_limit_25,
    registro?.objeto,
    registro?.marca,
    registro?.partnumber,
  ]
    .filter(Boolean)
    .join(' ');
}

function textoFontePrecosFonte(registro: any): string {
  return [
    registro?.base,
    registro?.uasg?.descricao,
    registro?.uasg_name,
    registro?.fornecedor?.fornecedor,
    registro?.fornecedor?.razao_social,
    registro?.fornecedor?.nome_fantasia,
  ]
    .filter(Boolean)
    .join(' - ');
}

export function fontePrecosAderenteAoItem(registro: any, item: Pick<ItemLicitacao, 'codigo_catmat' | 'codigo_catser' | 'codigo_catalogo' | 'descricao_resumida' | 'descricao_detalhada'>): {
  aderente: boolean;
  score: number;
  flags: string[];
} {
  const texto = normalizarBusca(textoFontePrecos(registro));
  const descricaoItem = normalizarBusca(especificacaoObrigatoria(item as ItemLicitacao) || termoItem(item as ItemLicitacao));
  const codigo = codigoCatalogoItem(item as ItemLicitacao);
  const flags: string[] = [];

  if (codigo && texto.includes(codigo)) {
    return { aderente: true, score: 90, flags };
  }

  const itemNotebook = descricaoItem.includes('notebook') || descricaoItem.includes('laptop');
  if (itemNotebook) {
    const bloqueios = [
      'veiculo',
      'veiculos',
      'carro',
      'caminhao',
      'caminhonete',
      'onibus',
      'motocicleta',
      'desktop',
      'computador desktop',
      'monitor',
      'tablet',
      'bateria para notebook',
      'bateria notebook',
      'carregador',
      'fonte para notebook',
      'mouse',
      'teclado',
      'suporte',
      'switch',
      'roteador',
      'impressora',
      'notebook infantil',
      'infantil educativo',
      'brinquedo',
    ];
    const bloqueio = bloqueios.find((termo) => texto.includes(termo));
    if (bloqueio) {
      return { aderente: false, score: 0, flags: [`Descartado por incompatibilidade aparente: ${bloqueio}.`] };
    }

    const temNotebook = texto.includes('notebook') || texto.includes('laptop') || texto.includes('computador portatil');
    if (!temNotebook) {
      return { aderente: false, score: 0, flags: ['Descartado: resultado nao descreve notebook/laptop.'] };
    }

    const criterios = [
      texto.includes('14') || texto.includes('15') || texto.includes('16') || texto.includes('tela'),
      texto.includes('ram') || texto.includes('memoria'),
      texto.includes('ssd') || texto.includes('480') || texto.includes('512') || texto.includes('1tb') || texto.includes('1.000'),
      texto.includes('windows') || texto.includes('proprietario') || texto.includes('sistema operacional'),
      texto.includes('garantia') || texto.includes('on site') || texto.includes('onsite'),
      texto.includes('nucleo') || texto.includes('core') || texto.includes('i5') || texto.includes('i7') || texto.includes('ryzen'),
    ];
    const confirmados = criterios.filter(Boolean).length;
    if (confirmados < 2) {
      return {
        aderente: false,
        score: 0,
        flags: ['Descartado: notebook com poucos criterios tecnicos confirmados na fonte.'],
      };
    }
    if (confirmados < 4) {
      flags.push('Aderencia parcial: revisar criterios tecnicos completos antes de aprovar.');
    }
    return { aderente: true, score: confirmados >= 4 ? 84 : 68, flags };
  }

  const tokens = descricaoItem
    .split(' ')
    .filter((token) => token.length > 3)
    .slice(0, 10);
  const encontrados = tokens.filter((token) => texto.includes(token)).length;
  const minimo = Math.min(3, tokens.length);
  return {
    aderente: tokens.length > 0 && encontrados >= minimo,
    score: encontrados >= 5 ? 82 : 66,
    flags: encontrados < 5 ? ['Aderencia textual parcial: revisar antes de aprovar.'] : flags,
  };
}

export function mapearResultadoFontePrecos(registro: any, item: ItemLicitacao): PesquisaPrecoCandidateInput | null {
  const valor = normalizarValorFontePrecos(registro?.valor_unitario);
  if (valor <= 0) return null;

  const aderencia = fontePrecosAderenteAoItem(registro, item);
  if (!aderencia.aderente) return null;

  const partnumber = parsePossivelJson(registro?.partnumber);
  const urlPartnumber =
    extrairPrimeiraUrl(partnumber?.links?.processo) ||
    extrairPrimeiraUrl(partnumber?.links?.edital) ||
    extrairPrimeiraUrl(partnumber?.links?.ata) ||
    extrairPrimeiraUrl(partnumber?.documento) ||
    extrairPrimeiraUrl(registro?.partnumber);
  const url =
    urlValida(registro?.url_ata) ||
    urlValida(registro?.url_edital) ||
    urlValida(registro?.download_link) ||
    urlValida(registro?.links?.ata) ||
    urlValida(registro?.links?.edital) ||
    urlValida(registro?.links?.homolog_link) ||
    urlValida(registro?.links?.adjudicacao_link) ||
    urlValida(registro?.links?.resultadopfornecedor_link) ||
    urlPartnumber ||
    urlValida(registro?.fonte);
  if (!url) return null;

  const dataPesquisa = normalizarDataPesquisa(
    registro?.dt_homologacao || registro?.dt_abertura_proposta || registro?.dt_entrega_proposta || registro?.data || registro?.created_at,
  );
  const fonte = textoFontePrecosFonte(registro);
  const descricao = [registro?.descricao, registro?.descricao_comp, registro?.objeto].filter(Boolean).join(' - ').replace(/\s+/g, ' ').trim();

  return {
    item_numero: item.numero_item,
    fonte_tipo: 'MIDIA_ESPECIALIZADA',
    descricao_fonte: `Fonte de Precos${fonte ? ` - ${fonte}` : ''}`.slice(0, 500),
    url_referencia: url,
    data_pesquisa: dataPesquisa,
    fornecedor_cnpj: registro?.fornecedor?.cnpj,
    fornecedor_razao_social: registro?.fornecedor?.razao_social || registro?.fornecedor?.fornecedor || registro?.fornecedor?.nome_fantasia,
    valor_unitario: Number(valor.toFixed(4)),
    quantidade_base: normalizarValorFontePrecos(registro?.quant) || Number(item.quantidade) || 1,
    unidade: String(registro?.unidade || item.unidade_medida || 'UN'),
    evidencia: {
      tipo: 'api',
      origem: 'Fonte de Precos - Pesquisa Expressa autenticada',
      coletado_em: new Date().toISOString(),
      titulo: descricao || termoItem(item),
    },
    score: aderencia.score,
    flags: [
      'Fonte complementar Fonte de Precos: validar comprovante antes de aprovar como fonte oficial.',
      ...aderencia.flags,
    ],
  };
}

@Injectable()
export class FontePrecosProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'MIDIA_ESPECIALIZADA';
  private readonly logger = new Logger(FontePrecosProvider.name);
  private session: FontePrecosSession | null = null;

  constructor(private readonly configService: ConfigService) {}

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    const config = this.getConfig();
    if (!config) {
      this.logger.debug('Fonte de Precos desabilitada: configure FONTE_PRECOS_BASE_URL, FONTE_PRECOS_EMAIL e FONTE_PRECOS_PASSWORD.');
      return [];
    }

    const candidatos: PesquisaPrecoCandidateInput[] = [];
    const limitePorItem = Math.max(5, context.scope.maxPorFonte || 5);

    for (const item of context.itens) {
      const candidatosItem: PesquisaPrecoCandidateInput[] = [];
      let descartadosDuplicados = 0;
      let descartadosAderencia = 0;
      let descartadosInvalidos = 0;

      try {
        const consultas = this.montarConsultas(item, config.periodo);
        const vistos = new Set<string>();

        for (const consulta of consultas) {
          if (candidatosItem.length >= limitePorItem) break;
          const registros = await this.consultarPesquisaExpressa(config, consulta, limitePorItem - candidatosItem.length);
          for (const registro of registros) {
            const mapeado = mapearResultadoFontePrecos(registro, item);
            if (!mapeado) {
              const valor = normalizarValorFontePrecos(registro?.valor_unitario);
              const aderencia = fontePrecosAderenteAoItem(registro, item);
              if (valor <= 0 || !this.urlDoRegistro(registro)) descartadosInvalidos += 1;
              else if (!aderencia.aderente) descartadosAderencia += 1;
              continue;
            }

            const chave = [
              mapeado.item_numero,
              mapeado.url_referencia?.toLowerCase(),
              normalizarBusca(mapeado.descricao_fonte),
              mapeado.valor_unitario,
              mapeado.data_pesquisa,
            ].join('|');
            if (vistos.has(chave)) {
              descartadosDuplicados += 1;
              continue;
            }
            vistos.add(chave);
            candidatosItem.push(mapeado);
            if (candidatosItem.length >= limitePorItem) break;
          }
        }

        candidatos.push(...candidatosItem);
        this.logger.log(
          `Fonte de Precos item ${item.numero_item}: ${candidatosItem.length} aceito(s), ${descartadosDuplicados} duplicado(s), ${descartadosAderencia} descartado(s) por aderencia, ${descartadosInvalidos} descartado(s) sem preco/url.`,
        );
      } catch (error) {
        this.logger.warn(`Falha ao consultar Fonte de Precos para item ${item.numero_item}: ${(error as Error).message}`);
        this.session = null;
      }
    }

    return candidatos;
  }

  private getConfig(): FontePrecosConfig | null {
    const baseUrl = this.configService.get<string>('FONTE_PRECOS_BASE_URL') || this.configService.get<string>('FONTEPRECOS_BASE_URL') || '';
    const email = this.configService.get<string>('FONTE_PRECOS_EMAIL') || this.configService.get<string>('FONTEPRECOS_EMAIL') || '';
    const password = this.configService.get<string>('FONTE_PRECOS_PASSWORD') || this.configService.get<string>('FONTEPRECOS_PASSWORD') || '';
    const periodo = Number(this.configService.get<string>('FONTE_PRECOS_PERIODO_DIAS') || FONTE_PRECOS_DEFAULT_PERIOD_DIAS);
    if (!baseUrl || !email || !password) return null;
    return {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      email,
      password,
      periodo: Number.isFinite(periodo) && periodo > 0 ? periodo : FONTE_PRECOS_DEFAULT_PERIOD_DIAS,
    };
  }

  private montarConsultas(item: ItemLicitacao, periodo: number): Array<Record<string, string | number | boolean>> {
    const codigo = codigoCatalogoItem(item);
    const tipo = item.codigo_catser ? 's' : item.codigo_catmat ? 'm' : 't';
    const descricaoCurta = (item.descricao_resumida || item.descricao_detalhada || '').replace(/\s+/g, ' ').trim();
    const termoCurto = this.termoCurto(descricaoCurta);
    const base = {
      tipo,
      pregao: '',
      nome_uasg: '',
      razao_social: '',
      marca: '',
      codigo_br: '',
      uasg: '',
      cnpj: '',
      fornecedor_porte: '',
      filtros: 'on',
      periodo,
    };

    return [
      codigo ? { ...base, termo: termoCurto || codigo, catmat_catser: codigo } : null,
      { ...base, termo: termoCurto || termoItem(item), catmat_catser: '' },
      descricaoCurta && descricaoCurta !== termoCurto ? { ...base, termo: descricaoCurta.slice(0, 180), catmat_catser: '' } : null,
    ].filter(Boolean) as Array<Record<string, string | number | boolean>>;
  }

  private termoCurto(descricao: string): string {
    const normalizada = descricao.replace(/\s+/g, ' ').trim();
    const principal = normalizada.split(/\s+-\s+|:/)[0]?.trim();
    if (principal && principal.length >= 3) return principal.slice(0, 80);
    return normalizada.slice(0, 80);
  }

  private async consultarPesquisaExpressa(config: FontePrecosConfig, params: Record<string, string | number | boolean>, limite: number): Promise<any[]> {
    const session = await this.ensureSession(config);
    const registros: any[] = [];
    const paginas = Math.max(1, Math.min(3, Math.ceil(limite / 10) + 1));

    for (let page = 1; page <= paginas && registros.length < limite; page += 1) {
      const res = await axios.get(`${config.baseUrl}/api/expressa/search/page${page}`, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          ...HTTP_BROWSER_HEADERS,
          Accept: 'application/json',
          Cookie: session.cookies,
          Referer: `${config.baseUrl}/v2/cotacoes/expressa`,
        },
        params,
        validateStatus: () => true,
      });

      if (res.status === 401 || res.status === 403 || String(res.data || '').includes('/login')) {
        this.session = null;
        throw new Error(`sessao Fonte de Precos expirada ou negada (HTTP ${res.status})`);
      }
      if (res.status >= 400) {
        throw new Error(`Pesquisa Expressa Fonte de Precos HTTP ${res.status}`);
      }

      registros.push(...asFontePrecosArray(res.data));
    }

    return registros.slice(0, limite * 4);
  }

  private async ensureSession(config: FontePrecosConfig): Promise<FontePrecosSession> {
    if (this.session && Date.now() - this.session.autenticadoEm < 45 * 60 * 1000) {
      const valida = await this.validarSessao(config, this.session).catch(() => false);
      if (valida) return this.session;
    }
    this.session = await this.login(config);
    return this.session;
  }

  private async validarSessao(config: FontePrecosConfig, session: FontePrecosSession): Promise<boolean> {
    const res = await axios.get(`${config.baseUrl}/api/check-session`, {
      timeout: 8000,
      headers: {
        ...HTTP_BROWSER_HEADERS,
        Accept: 'application/json',
        Cookie: session.cookies,
      },
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300 && Boolean(res.data);
  }

  private async login(config: FontePrecosConfig): Promise<FontePrecosSession> {
    const loginPage = await axios.get(`${config.baseUrl}/login`, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: HTTP_BROWSER_HEADERS,
      responseType: 'text',
    });
    const csrf = String(loginPage.data || '').match(/name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/i)?.[1];
    if (!csrf) throw new Error('CSRF da Fonte de Precos nao encontrado');

    const cookiesIniciais = this.montarCookieHeader(loginPage.headers['set-cookie']);
    const body = new URLSearchParams();
    body.set('csrfmiddlewaretoken', csrf);
    body.set('email', config.email);
    body.set('password', config.password);

    const auth = await axios.post(`${config.baseUrl}/login`, body.toString(), {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        ...HTTP_BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookiesIniciais,
        Referer: `${config.baseUrl}/login`,
        'X-CSRFToken': csrf,
      },
    });

    const cookies = this.montarCookieHeader([...(loginPage.headers['set-cookie'] || []), ...(auth.headers['set-cookie'] || [])]);
    if (!cookies.includes('sessionid=')) throw new Error('Login Fonte de Precos nao retornou sessionid');
    const session = { cookies, autenticadoEm: Date.now() };
    const valida = await this.validarSessao(config, session).catch(() => false);
    if (!valida) throw new Error('Sessao Fonte de Precos nao validada apos login');
    return session;
  }

  private montarCookieHeader(setCookie?: string[] | string): string {
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const map = new Map<string, string>();
    for (const cookie of cookies) {
      const primeiro = cookie.split(';')[0];
      const idx = primeiro.indexOf('=');
      if (idx <= 0) continue;
      map.set(primeiro.slice(0, idx), primeiro.slice(idx + 1));
    }
    return [...map.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  private urlDoRegistro(registro: any): string {
    return (
      urlValida(registro?.url_ata) ||
      urlValida(registro?.url_edital) ||
      urlValida(registro?.download_link) ||
      urlValida(registro?.fonte) ||
      extrairPrimeiraUrl(registro?.partnumber)
    );
  }
}

@Injectable()
export class ContratosVigentesProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'CONTRATO_VIGENTE_SISTEMA';

  constructor(
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
  ) {}

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    const candidatos: PesquisaPrecoCandidateInput[] = [];

    for (const item of context.itens) {
      const termo = item.descricao_resumida?.split(/\s+/).filter((p) => p.length > 3).slice(0, 4).join(' ') || '';
      if (!termo) continue;

      const contratos = await this.contratoRepository.find({
        where: [
          { objeto: ILike(`%${termo}%`), status: StatusContrato.VIGENTE },
          { objeto_detalhado: ILike(`%${termo}%`), status: StatusContrato.VIGENTE },
        ],
        take: context.scope.maxPorFonte || 5,
        order: { data_assinatura: 'DESC' },
      });

      for (const contrato of contratos) {
        const valor = valorUnitarioContrato(contrato, item);
        if (valor <= 0) continue;
        candidatos.push({
          item_numero: item.numero_item,
          fonte_tipo: 'CONTRATO_VIGENTE_SISTEMA',
          descricao_fonte: `Contrato vigente ${contrato.numero_contrato}`,
          data_pesquisa: hojeISO(),
          fornecedor_cnpj: contrato.fornecedor_cnpj,
          fornecedor_razao_social: contrato.fornecedor_razao_social,
          valor_unitario: valor,
          quantidade_base: Number(item.quantidade) || 1,
          unidade: String(item.unidade_medida || 'UN'),
          evidencia: {
            tipo: 'manual',
            origem: 'Contrato vigente registrado no sistema',
            coletado_em: new Date().toISOString(),
            titulo: contrato.objeto,
          },
          score: 88,
        });
      }
    }

    return candidatos;
  }
}

@Injectable()
export class WebEspecializadaProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'MIDIA_ESPECIALIZADA';
  private readonly logger = new Logger(WebEspecializadaProvider.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    const candidatos: PesquisaPrecoCandidateInput[] = [];
    this.logger.log(`Iniciando busca web de precos para ${context.itens.length} item(ns), maxPorFonte=${context.scope.maxPorFonte || 5}`);

    for (const item of context.itens) {
      const termo = termoItem(item);
      if (!termo) continue;

      try {
        const results = await this.buscarComIaWeb(item, Math.max(5, context.scope.maxPorFonte || 5));
        let descartadosPorData = 0;
        let sinalizadosPorAderencia = 0;
        let descartadosInvalidos = 0;
        let sinalizadosSemUrl = 0;
        let sinalizadosUrlIndisponivel = 0;
        for (const produto of results) {
          const valor = normalizarValorPreco(produto.valor_unitario || produto.valorUnitario || produto.preco || produto.valor);
          const url = urlValida(produto.url || produto.url_referencia || produto.urlReferencia);
          if (valor <= 0) {
            descartadosInvalidos += 1;
            continue;
          }
          let urlReferencia: string | undefined = url || undefined;
          let alertaUrl: string | null = null;
          if (url) {
            const verificacaoUrl = await this.verificarUrlWeb(url);
            if (!verificacaoUrl.ok) {
              sinalizadosUrlIndisponivel += 1;
              urlReferencia = undefined;
              alertaUrl = `URL informada pela busca web indisponivel (${verificacaoUrl.status || 'sem status'}); validar fonte, objeto e comprovante antes de aprovar.`;
              this.logger.debug(`Busca web aceitou resultado sem URL verificavel (${verificacaoUrl.status || 'sem status'}) para item ${item.numero_item}: ${url}`);
            }
          } else {
            sinalizadosSemUrl += 1;
            alertaUrl = 'Resultado sem URL verificavel; validar fonte, objeto e comprovante antes de aprovar.';
          }
          const aderenciaNaoComprovada = aderenteMarcadoComoFalso(produto.aderente);
          if (aderenciaNaoComprovada) sinalizadosPorAderencia += 1;
          const dataPesquisa = normalizarDataPesquisa(produto.data || produto.data_pesquisa);
          if (!dataDentroDosUltimosDias(dataPesquisa, MAX_IDADE_PRECO_DIAS)) {
            descartadosPorData += 1;
            continue;
          }
          candidatos.push({
            item_numero: item.numero_item,
            fonte_tipo: this.classificarFontePelaUrl(url),
            descricao_fonte: produto.descricao_fonte || produto.fonte || 'Fonte web verificada',
            url_referencia: urlReferencia,
            data_pesquisa: dataPesquisa,
            fornecedor_razao_social: produto.fornecedor,
            valor_unitario: valor,
            quantidade_base: 1,
            unidade: String(item.unidade_medida || 'UN'),
            evidencia: {
              tipo: 'api',
              origem: 'Busca web via Perplexity Sonar/OpenRouter',
              coletado_em: new Date().toISOString(),
              titulo: produto.observacao || termo,
            },
            score: aderenciaNaoComprovada ? 58 : 82,
            flags: [
              'Fonte encontrada por busca web: validar aderencia tecnica antes de aprovar.',
              ...(alertaUrl ? [alertaUrl] : []),
              ...(aderenciaNaoComprovada ? ['A IA nao comprovou aderencia integral a especificacao; revisar antes de usar como referencia.'] : []),
              ...(Array.isArray(produto.criterios_confirmados) && produto.criterios_confirmados.length
                ? [`Criterios confirmados: ${produto.criterios_confirmados.join('; ')}`]
                : []),
            ],
          });
        }
        this.logger.log(
          `Busca web item ${item.numero_item}: ${results.length} resultado(s) recebidos, ${descartadosInvalidos} descartado(s) sem preco, ${sinalizadosSemUrl} sem URL, ${sinalizadosUrlIndisponivel} com URL indisponivel, ${descartadosPorData} descartado(s) por data, ${sinalizadosPorAderencia} sinalizado(s) por aderencia, ${candidatos.filter((c) => c.item_numero === item.numero_item).length} candidato(s) aceito(s)`,
        );
      } catch (error) {
        this.logger.warn(`Falha ao consultar web para item ${item.numero_item}: ${(error as Error).message}`);
      }
    }

    return candidatos;
  }

  private async getOpenRouterKey(): Promise<string | null> {
    const cfg = await this.systemConfigService.getIaConfig().catch(() => null);
    if (cfg?.apiKey) return cfg.apiKey;
    return this.configService.get<string>('OPENROUTER_API_KEY') || null;
  }

  private async verificarUrlWeb(url: string): Promise<{ ok: boolean; status?: number }> {
    try {
      const head = await axios.head(url, {
        timeout: 8000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: HTTP_BROWSER_HEADERS,
      });
      if (head.status >= 200 && head.status < 400) return { ok: true, status: head.status };
      if (![403, 405, 406].includes(head.status)) return { ok: false, status: head.status };
    } catch {
      // Alguns sites bloqueiam HEAD; tenta GET leve abaixo.
    }

    try {
      const get = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: () => true,
        headers: HTTP_BROWSER_HEADERS,
      });
      return { ok: get.status >= 200 && get.status < 400, status: get.status };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      return { ok: false, status };
    }
  }

  private async buscarComIaWeb(item: ItemLicitacao, limite: number): Promise<any[]> {
    const apiKey = await this.getOpenRouterKey();
    if (!apiKey) {
      this.logger.warn('Busca web indisponível: configure a API Key OpenRouter em Admin → Configurações de IA.');
      return [];
    }

    const termo = termoItem(item);
    const especificacao = especificacaoObrigatoria(item) || termo;
    const dataMinima = new Date();
    dataMinima.setUTCDate(dataMinima.getUTCDate() - MAX_IDADE_PRECO_DIAS);
    const dataMinimaIso = dataMinima.toISOString().split('T')[0];

    const codigoCatalogo = codigoCatalogoItem(item);
    const consultasSugeridas = [
      codigoCatalogo ? `"${codigoCatalogo}" "precoUnitario" notebook` : '',
      codigoCatalogo ? `"codigoItemCatalogo" "${codigoCatalogo}"` : '',
      `"${especificacao}"`,
      `"Notebook" "garantia on site" "superior a 36" "480 a 1.000"`,
      `"Notebook" "núcleos por processador" "superior a 8" "PNCP"`,
    ].filter(Boolean);

    const prompt = `Use busca web em tempo real. Pesquise no mínimo ${limite} preços reais atuais no Brasil para pesquisa de preços de contratação pública brasileira.

Item: ${termo}
Especificação técnica obrigatória: ${especificacao}
Código CATMAT/CATSER se houver: ${codigoCatalogo || 'não informado'}
Quantidade: ${Number(item.quantidade) || 1}
Unidade: ${item.unidade_medida || 'UN'}
País/mercado: Brasil
Período obrigatório: somente preços publicados ou vigentes entre ${dataMinimaIso} e ${hojeISO()}.

Pesquise explicitamente estas consultas, além de variações equivalentes:
${consultasSugeridas.map((consulta, index) => `${index + 1}. ${consulta}`).join('\n')}

Priorize fontes verificáveis:
1. PNCP em pncp.gov.br
2. Pesquisa de Precos Compras.gov.br por CATMAT/CATSER
3. portais oficiais .gov.br com editais, atas, termos de referência, adjudicações ou homologações
4. diários oficiais, câmaras, prefeituras, universidades e conselhos profissionais
5. fornecedores/distribuidores com página pública de preço

Critério de aderência:
- Retorne apenas produtos/serviços que atendam integralmente à especificação técnica obrigatória.
- Para notebook, confira explicitamente tela, interatividade da tela, memória RAM, núcleos do processador, ausência de HDD quando exigida, faixa do SSD, bateria, alimentação, sistema operacional e garantia on site.
- Se a fonte pública usa o mesmo código CATMAT/CATSER ou reproduz a mesma descrição técnica do item, considere aderente mesmo que a página esteja em edital, ata, homologação, termo de referência ou PDF.
- Se a fonte não comprovar o código ou as características obrigatórias, descarte o resultado.
- Não substitua por item parecido, inferior ou sem garantia/SSD/memória/processador compatíveis.

Retorne somente JSON array válido, sem markdown:
[
  {
    "valor_unitario": 123.45,
    "descricao_fonte": "nome do órgão, fornecedor ou portal",
    "url": "https://url-real-verificavel",
    "data": "YYYY-MM-DD",
    "fornecedor": "nome se houver",
    "observacao": "descrição breve do contexto encontrado",
    "aderente": true,
    "criterios_confirmados": ["critério técnico verificado 1", "critério técnico verificado 2"]
  }
]

Regras:
- Não invente preço.
- Nunca retorne valor_unitario 0. Se a fonte não tiver preço unitário real, ignore a fonte.
- Retorne até ${limite} resultados aderentes; tente preencher pelo menos 5 resultados quando houver fontes verificáveis suficientes.
- Não retorne preços internacionais, em dólar, ou indisponíveis no mercado brasileiro.
- Pode retornar atas, contratos, homologações, adjudicações, editais e PDFs, desde que tragam preço unitário real e data dentro do período obrigatório.
- Não retorne páginas ou tabelas com data anterior a ${dataMinimaIso}.
- Inclua apenas itens com URL real começando com http.
- A data deve estar sempre no formato completo YYYY-MM-DD; se só souber o ano, use YYYY-01-01.
- Se não encontrar preço brasileiro verificável e tecnicamente aderente dos últimos ${MAX_IDADE_PRECO_DIAS} dias, retorne [].`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://portaldcp.gov.br',
        'X-Title': 'Portal DCP - Pesquisa de Precos',
      },
      body: JSON.stringify({
        model: WEB_SEARCH_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 3500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.warn(`Busca web OpenRouter ${response.status}: ${err.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extrairJsonArray(content);
    this.logger.log(
      `OpenRouter retornou ${content.length} caractere(s), ${parsed.length} item(ns) JSON parseado(s). Prévia: ${content.substring(0, 300).replace(/\s+/g, ' ')}`,
    );
    if (!Array.isArray(parsed)) return [];
    const validos = parsed.filter((r) => {
      const valor = normalizarValorPreco(r.valor_unitario || r.valorUnitario || r.preco || r.valor);
      const url = urlValida(r.url || r.url_referencia || r.urlReferencia);
      return valor > 0 && Boolean(url);
    });
    const removidos = parsed.length - validos.length;
    if (removidos > 0) {
      this.logger.debug(`Busca web removeu ${removidos} item(ns) sem preco/url antes de montar candidatos.`);
    }
    if (validos.length > 0) return validos.slice(0, limite);

    const promptComplementar = `Use busca web em tempo real. A busca oficial não encontrou preços complementares com aderência integral.

Faça uma busca complementar de mercado brasileiro para o item abaixo e retorne SOMENTE páginas com preço unitário real maior que zero.

Item: ${termo}
Especificação desejada: ${especificacao}
Código CATMAT/CATSER: ${codigoCatalogo || 'não informado'}
Período: entre ${dataMinimaIso} e ${hojeISO()}.

Busque em lojas, marketplaces e distribuidores brasileiros conhecidos, além de páginas oficiais de fornecedores.
Para notebook, priorize produtos com tela superior a 14, RAM superior a 8GB, SSD entre 480GB e 1TB, Windows ou sistema proprietário, processador com mais de 8 núcleos e garantia informada.
Se não conseguir comprovar garantia on site superior a 36 meses ou outro requisito, ainda retorne o preço, mas marque "aderente": false e explique o que falta na observação.

Retorne somente JSON array válido, sem markdown:
[
  {
    "valor_unitario": 123.45,
    "descricao_fonte": "nome da loja/fornecedor",
    "url": "https://url-da-pagina-com-preco",
    "data": "YYYY-MM-DD",
    "fornecedor": "nome se houver",
    "observacao": "modelo e critérios atendidos/faltantes",
    "aderente": false,
    "criterios_confirmados": ["critério confirmado"]
  }
]

Regras:
- Nunca retorne valor_unitario 0.
- Não retorne páginas sem preço visível.
- Não invente preço.
- Não retorne produto claramente incompatível, como desktop, monitor, tablet, veículo ou acessório.
- Retorne até ${limite} resultados com preço real em reais brasileiros.`;

    const responseComplementar = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://portaldcp.gov.br',
        'X-Title': 'Portal DCP - Pesquisa de Precos',
      },
      body: JSON.stringify({
        model: WEB_SEARCH_MODEL,
        messages: [{ role: 'user', content: promptComplementar }],
        temperature: 0.1,
        max_tokens: 3500,
      }),
    });

    if (!responseComplementar.ok) {
      const err = await responseComplementar.text();
      this.logger.warn(`Busca web complementar OpenRouter ${responseComplementar.status}: ${err.substring(0, 200)}`);
      return [];
    }

    const dataComplementar = await responseComplementar.json();
    const contentComplementar = dataComplementar.choices?.[0]?.message?.content || '';
    const parsedComplementar = extrairJsonArray(contentComplementar);
    const validosComplementares = parsedComplementar.filter((r) => {
      const valor = normalizarValorPreco(r.valor_unitario || r.valorUnitario || r.preco || r.valor);
      const url = urlValida(r.url || r.url_referencia || r.urlReferencia);
      return valor > 0 && Boolean(url);
    });
    this.logger.log(
      `OpenRouter complementar retornou ${contentComplementar.length} caractere(s), ${parsedComplementar.length} item(ns) JSON parseado(s), ${validosComplementares.length} com preco/url. Prévia: ${contentComplementar.substring(0, 300).replace(/\s+/g, ' ')}`,
    );
    return validosComplementares.slice(0, limite);
  }

  private classificarFontePelaUrl(url?: string): FontePesquisaTipo {
    if (!url) return 'MIDIA_ESPECIALIZADA';
    if (url.includes('pncp.gov.br')) return 'PNCP';
    if (url.includes('paineldeprecos') || url.includes('compras.gov.br') || url.includes('comprasnet')) return 'PAINEL_DE_PRECOS';
    if (url.includes('.gov.br')) return 'CONTRATO_VIGENTE_SISTEMA';
    return 'MIDIA_ESPECIALIZADA';
  }
}

@Injectable()
export class FornecedorDiretoProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'FORNECEDOR_DIRETO';

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    return context.itens
      .filter((item) => Number(item.valor_unitario_estimado) > 0)
      .map((item) => ({
        item_numero: item.numero_item,
        fonte_tipo: 'FORNECEDOR_DIRETO',
        descricao_fonte: 'Pesquisa direta com fornecedor - pendente de cotacao formal',
        data_pesquisa: hojeISO(),
        valor_unitario: Number(item.valor_unitario_estimado),
        quantidade_base: Number(item.quantidade) || 1,
        unidade: String(item.unidade_medida || 'UN'),
        evidencia: {
          tipo: 'manual',
          origem: 'Rascunho para solicitacao de cotacao direta',
          coletado_em: new Date().toISOString(),
        },
        score: 48,
        flags: ['Informe CNPJ, razao social e documento da cotacao antes de aprovar.'],
      }));
  }
}

@Injectable()
export class NfeProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'NOTA_FISCAL_ELETRONICA';

  async buscar(): Promise<PesquisaPrecoCandidateInput[]> {
    return [];
  }
}

@Injectable()
export class BrowserFallbackProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'OUTRA';

  async buscar(): Promise<PesquisaPrecoCandidateInput[]> {
    return [];
  }
}
