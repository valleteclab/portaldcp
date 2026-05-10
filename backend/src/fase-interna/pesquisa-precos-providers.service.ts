import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ILike, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Contrato, StatusContrato } from '../contratos/entities/contrato.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { PesquisaPrecoAgentContext, PesquisaPrecoCandidateInput, PesquisaPrecoProvider } from './pesquisa-precos-agent.types';
import { FontePesquisaTipo } from './types/pesquisa-precos.type';
import { SystemConfigService } from '../system-config/system-config.service';

const REQUEST_TIMEOUT_MS = 4500;

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

function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
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
    const limite6meses = new Date();
    limite6meses.setMonth(limite6meses.getMonth() - 6);

    for (const item of context.itens) {
      const descricao = (item.descricao_resumida || item.descricao_detalhada || '').substring(0, 100);
      if (!descricao) continue;

      try {
        // Endpoint correto: itens com resultado de licitação por descrição
        const res = await axios.get('https://pncp.gov.br/api/consulta/v1/itens/resultado', {
          params: {
            descricao,
            pagina: 1,
            tamanhoPagina: context.scope.maxPorFonte || 5,
          },
          timeout: REQUEST_TIMEOUT_MS,
          headers: { Accept: 'application/json' },
        });

        const itens: any[] = res.data?.data || res.data?.itens || [];
        for (const registro of itens.slice(0, context.scope.maxPorFonte || 5)) {
          const valor = Number(registro.valorUnitario || registro.valorHomologado || 0);
          if (valor <= 0) continue;

          const dataRef = registro.dataResultado || registro.dataAbertura || registro.dataHomologacao;
          const dataParsed = dataRef ? new Date(dataRef) : null;
          if (dataParsed && dataParsed < limite6meses) continue;

          const cnpj = (registro.orgaoEntidade?.cnpj || '').replace(/\D/g, '');
          const ano = registro.anoCompra || '';
          const seq = registro.sequencialCompra || '';
          const url = cnpj && ano && seq
            ? `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`
            : 'https://pncp.gov.br';

          candidatos.push({
            item_numero: item.numero_item,
            fonte_tipo: 'PNCP',
            descricao_fonte: `PNCP — ${registro.orgaoEntidade?.razaoSocial || 'Órgão público'}`,
            url_referencia: url,
            data_pesquisa: dataParsed ? dataParsed.toISOString().split('T')[0] : hojeISO(),
            fornecedor_razao_social: registro.nomeFantasia || registro.razaoSocialFornecedor,
            valor_unitario: valor,
            quantidade_base: Number(item.quantidade) || 1,
            unidade: String(item.unidade_medida || 'UN'),
            evidencia: {
              tipo: 'api',
              origem: 'PNCP itens/resultado',
              coletado_em: new Date().toISOString(),
              titulo: registro.descricao || registro.descricaoItem || descricao,
            },
            score: 92,
          });
        }
      } catch (error) {
        this.logger.warn(`PNCP item ${item.numero_item}: ${(error as Error).message}`);
      }
    }

    return candidatos;
  }
}

@Injectable()
export class PainelComprasGovProvider implements PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo = 'PAINEL_DE_PRECOS';

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    return context.itens
      .filter((item) => Number(item.valor_unitario_estimado) > 0)
      .map((item) => ({
        item_numero: item.numero_item,
        fonte_tipo: 'PAINEL_DE_PRECOS',
        descricao_fonte: 'Painel de Precos / ComprasGov - valor estimado do item',
        url_referencia: 'https://paineldeprecos.planejamento.gov.br/',
        data_pesquisa: hojeISO(),
        valor_unitario: Number(item.valor_unitario_estimado),
        quantidade_base: Number(item.quantidade) || 1,
        unidade: String(item.unidade_medida || 'UN'),
        evidencia: {
          tipo: 'manual',
          origem: 'Valor estimado cadastrado no processo para conferencia no Painel de Precos',
          coletado_em: new Date().toISOString(),
        },
        score: 78,
        flags: ['Validar no Painel de Precos antes de aprovar como fonte oficial.'],
      }));
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
  private readonly openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly model = 'perplexity/sonar-pro';

  constructor(
    private readonly configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  private async getApiKey(): Promise<string> {
    const fromEnv = this.configService.get<string>('OPENROUTER_API_KEY');
    if (fromEnv) return fromEnv;
    const cfg = await this.systemConfigService.getIaConfig().catch(() => null);
    if (cfg?.apiKey) return cfg.apiKey;
    throw new Error('OPENROUTER_API_KEY nao configurada');
  }

  private classificarFonte(url: string): FontePesquisaTipo {
    if (url.includes('pncp.gov.br')) return 'PNCP';
    if (url.includes('paineldeprecos') || url.includes('compras.gov.br') || url.includes('comprasnet')) return 'PAINEL_DE_PRECOS';
    if (url.includes('.gov.br')) return 'CONTRATO_VIGENTE_SISTEMA';
    return 'MIDIA_ESPECIALIZADA';
  }

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    const candidatos: PesquisaPrecoCandidateInput[] = [];
    const maxPorFonte = context.scope.maxPorFonte || 5;
    const limite6meses = new Date();
    limite6meses.setMonth(limite6meses.getMonth() - 6);

    this.logger.log(`Iniciando busca web de precos para ${context.itens.length} item(ns), maxPorFonte=${maxPorFonte}`);

    let apiKey: string;
    try {
      apiKey = await this.getApiKey();
    } catch {
      this.logger.warn('OpenRouter nao configurado — WebEspecializadaProvider desativado');
      return [];
    }

    for (const item of context.itens) {
      const descricao = termoItem(item);
      if (!descricao) continue;

      const prompt = `Pesquise preços reais de licitação/compra pública brasileira para o item abaixo.

ITEM: ${descricao}
QUANTIDADE: ${item.quantidade || 1} ${item.unidade_medida || 'UN'}

Busque no PNCP (pncp.gov.br), Painel de Preços (paineldeprecos.planejamento.gov.br), sites de fornecedores e distribuidores.

Retorne SOMENTE um JSON array, sem texto fora do JSON:
[{"valor_unitario":1234.56,"descricao_fonte":"Órgão/portal","url":"https://url-real.gov.br","data":"YYYY-MM-DD","fornecedor":"nome se disponível","observacao":"contexto breve"}]

REGRAS: inclua apenas preços com URL real verificável. NÃO invente valores. Se não encontrar, retorne [].`;

      try {
        const response = await fetch(this.openrouterUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://portaldcp.gov.br',
            'X-Title': 'Portal DCP — Pesquisa de Preços',
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 1500,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          this.logger.warn(`OpenRouter erro ${response.status} para item ${item.numero_item}`);
          continue;
        }

        const data = await response.json();
        const content: string = data.choices?.[0]?.message?.content || '';

        this.logger.log(`OpenRouter retornou ${content.length} caractere(s), ` +
          `${(content.match(/valor_unitario/g) || []).length} item(ns) JSON parseado(s). ` +
          `Prévia: ${content.substring(0, 200)}`);

        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) continue;

        const parsed: any[] = JSON.parse(jsonMatch[0]);
        let aceitos = 0;
        let descartados = 0;

        for (const p of parsed.slice(0, maxPorFonte)) {
          const valor = Number(p.valor_unitario || 0);
          const url = String(p.url || '');
          if (valor <= 0 || !url.startsWith('http')) continue;

          const dataStr = p.data || '';
          const dataParsed = dataStr ? new Date(dataStr) : null;
          if (dataParsed && !isNaN(dataParsed.getTime()) && dataParsed < limite6meses) {
            descartados++;
            continue;
          }

          aceitos++;
          const fonte = this.classificarFonte(url);
          candidatos.push({
            item_numero: item.numero_item,
            fonte_tipo: fonte,
            descricao_fonte: p.descricao_fonte || p.fornecedor || url,
            url_referencia: url,
            data_pesquisa: dataParsed && !isNaN(dataParsed.getTime())
              ? dataParsed.toISOString().split('T')[0]
              : hojeISO(),
            fornecedor_razao_social: p.fornecedor || undefined,
            valor_unitario: valor,
            quantidade_base: Number(item.quantidade) || 1,
            unidade: String(item.unidade_medida || 'UN'),
            observacao: p.observacao || descricao,
            evidencia: {
              tipo: 'api',
              origem: 'Perplexity Sonar via OpenRouter',
              coletado_em: new Date().toISOString(),
              titulo: p.descricao_fonte || descricao,
            },
            score: fonte === 'PNCP' ? 92 : fonte === 'PAINEL_DE_PRECOS' ? 88 : 72,
            flags: fonte === 'MIDIA_ESPECIALIZADA'
              ? ['Conferir especificacao, frete e disponibilidade antes de aprovar.']
              : undefined,
          });
        }

        this.logger.log(`Busca web item ${item.numero_item}: ${parsed.length} resultado(s) parseado(s), ${descartados} descartado(s) por data, ${aceitos} candidato(s) aceito(s)`);
      } catch (error) {
        this.logger.warn(`Busca web item ${item.numero_item}: ${(error as Error).message}`);
      }
    }

    return candidatos;
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
