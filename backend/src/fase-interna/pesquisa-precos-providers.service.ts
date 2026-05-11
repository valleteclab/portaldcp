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
const MAX_IDADE_PRECO_DIAS = 90;
const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';
const DADOS_ABERTOS_COMPRAS_BASE = 'https://dadosabertos.compras.gov.br';
const PESQUISA_PRECOS_COMPRAS_GOV_INFO_URL = 'https://www.gov.br/compras/pt-br/sistemas/conheca-o-compras/pesquisa-de-precos';
const PESQUISA_PRECOS_DADOS_ABERTOS_URL = 'https://suportedadoslivres.streamlit.app/';
const HTTP_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'PortalDCP/1.0 (pesquisa-precos; contato=suporte@portaldcp.com.br)',
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

function montarUrlPncp(registro: any): string {
  const cnpj = String(registro.orgaoEntidade?.cnpj || registro.cnpjOrgao || registro.cnpj || '').replace(/\D/g, '');
  const ano = registro.anoCompra || registro.ano || registro.anoContratacao || '';
  const sequencial = registro.sequencialCompra || registro.sequencial || registro.numeroCompra || '';
  if (cnpj && ano && sequencial) return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${sequencial}`;
  return registro.linkSistemaOrigem || registro.linkProcessoEletronico || 'https://pncp.gov.br/app/editais';
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
        const registros = await this.consultarPncp(termo, context.scope.maxPorFonte || 5);
        for (const registro of registros.slice(0, context.scope.maxPorFonte || 5)) {
          const valor = Number(
            registro.valorUnitarioHomologado ||
            registro.valorUnitarioEstimado ||
            registro.valorUnitario ||
            registro.valorHomologado ||
            registro.valorTotalEstimado ||
            registro.valorTotalHomologado ||
            registro.valorTotal ||
            registro.valor ||
            0,
          );
          const quantidade = Number(item.quantidade) || 1;
          if (valor <= 0) continue;
          const valorUnitario = registro.valorUnitario || registro.valorUnitarioHomologado || registro.valorUnitarioEstimado
            ? valor
            : Number((valor / quantidade).toFixed(4));

          candidatos.push({
            item_numero: item.numero_item,
            fonte_tipo: 'PNCP',
            descricao_fonte: `PNCP - ${registro.orgaoEntidade?.razaoSocial || registro.nomeOrgao || 'Contratacao publica'}`,
            url_referencia: montarUrlPncp(registro),
            data_pesquisa: (registro.dataResultado || registro.dataHomologacao || registro.dataPublicacaoPncp || hojeISO()).toString().split('T')[0],
            valor_unitario: Number(valorUnitario.toFixed(4)),
            quantidade_base: quantidade,
            unidade: String(item.unidade_medida || 'UN'),
            evidencia: {
              tipo: 'api',
              origem: 'PNCP consulta publica',
              coletado_em: new Date().toISOString(),
              titulo: registro.descricao || registro.descricaoItem || registro.objetoCompra || registro.objeto || termo,
            },
            score: 92,
          });
        }
      } catch (error) {
        this.logger.debug(`Consulta direta PNCP indisponível para item ${item.numero_item}: ${(error as Error).message}`);
      }
    }

    return candidatos;
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
          tamanhoPagina: limite,
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
        let descartadosPorAderencia = 0;
        for (const produto of results) {
          const valor = Number(produto.valor_unitario || 0);
          if (valor <= 0) continue;
          if (produto.aderente === false) {
            descartadosPorAderencia += 1;
            continue;
          }
          const dataPesquisa = normalizarDataPesquisa(produto.data || produto.data_pesquisa);
          if (!dataDentroDosUltimosDias(dataPesquisa, MAX_IDADE_PRECO_DIAS)) {
            descartadosPorData += 1;
            continue;
          }
          candidatos.push({
            item_numero: item.numero_item,
            fonte_tipo: this.classificarFontePelaUrl(produto.url || produto.url_referencia),
            descricao_fonte: produto.descricao_fonte || produto.fonte || 'Fonte web verificada',
            url_referencia: produto.url || produto.url_referencia,
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
            score: 82,
            flags: [
              'Fonte encontrada por busca web: validar aderencia tecnica antes de aprovar.',
              ...(Array.isArray(produto.criterios_confirmados) && produto.criterios_confirmados.length
                ? [`Criterios confirmados: ${produto.criterios_confirmados.join('; ')}`]
                : []),
            ],
          });
        }
        this.logger.log(
          `Busca web item ${item.numero_item}: ${results.length} resultado(s) aderente(s) recebidos, ${descartadosPorData} descartado(s) por data, ${descartadosPorAderencia} descartado(s) por aderencia, ${candidatos.filter((c) => c.item_numero === item.numero_item).length} candidato(s) aceito(s)`,
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

    const prompt = `Pesquise no mínimo ${limite} preços reais atuais no Brasil para pesquisa de preços de contratação pública brasileira.

Item: ${termo}
Especificação técnica obrigatória: ${especificacao}
Quantidade: ${Number(item.quantidade) || 1}
Unidade: ${item.unidade_medida || 'UN'}
País/mercado: Brasil
Período obrigatório: somente preços publicados ou vigentes entre ${dataMinimaIso} e ${hojeISO()}.

Priorize fontes verificáveis:
1. PNCP em pncp.gov.br
2. Pesquisa de Precos Compras.gov.br por CATMAT/CATSER
3. portais oficiais .gov.br
4. fornecedores/distribuidores com página pública de preço

Critério de aderência:
- Retorne apenas produtos/serviços que atendam integralmente à especificação técnica obrigatória.
- Para notebook, confira explicitamente tela, interatividade da tela, memória RAM, núcleos do processador, ausência de HDD quando exigida, faixa do SSD, bateria, alimentação, sistema operacional e garantia on site.
- Se a fonte não comprovar uma característica obrigatória, descarte o resultado.
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
- Retorne até ${limite} resultados aderentes; tente preencher pelo menos 5 resultados quando houver fontes verificáveis suficientes.
- Não retorne preços internacionais, em dólar, ou indisponíveis no mercado brasileiro.
- Não retorne atas, contratos, páginas ou tabelas com data anterior a ${dataMinimaIso}.
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
    return Array.isArray(parsed)
      ? parsed
          .filter((r) => r.aderente !== false && Number(r.valor_unitario) > 0 && String(r.url || r.url_referencia || '').startsWith('http'))
          .slice(0, limite)
      : [];
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
