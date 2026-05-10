import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ILike, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Contrato, StatusContrato } from '../contratos/entities/contrato.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { PesquisaPrecoAgentContext, PesquisaPrecoCandidateInput, PesquisaPrecoProvider } from './pesquisa-precos-agent.types';
import { FontePesquisaTipo } from './types/pesquisa-precos.type';

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
    const hoje = new Date();
    const dataFinal = hoje.toISOString().split('T')[0].replace(/-/g, '');
    const dataInicial = new Date(hoje.getTime() - 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '');

    for (const item of context.itens) {
      const termo = termoItem(item);
      if (!termo) continue;

      try {
        const res = await axios.get('https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao', {
          params: {
            dataInicial,
            dataFinal,
            pagina: 1,
            tamanhoPagina: context.scope.maxPorFonte || 5,
            termo,
          },
          timeout: REQUEST_TIMEOUT_MS,
        });

        const registros = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
        for (const registro of registros.slice(0, context.scope.maxPorFonte || 5)) {
          const valor = Number(registro.valorTotalEstimado || registro.valorTotalHomologado || registro.valorTotal || 0);
          const quantidade = Number(item.quantidade) || 1;
          if (valor <= 0) continue;

          candidatos.push({
            item_numero: item.numero_item,
            fonte_tipo: 'PNCP',
            descricao_fonte: `PNCP - ${registro.orgaoEntidade?.razaoSocial || registro.nomeOrgao || 'Contratacao publica'}`,
            url_referencia: registro.linkSistemaOrigem || registro.linkProcessoEletronico || 'https://pncp.gov.br/app/editais',
            data_pesquisa: hojeISO(),
            valor_unitario: Number((valor / quantidade).toFixed(4)),
            quantidade_base: quantidade,
            unidade: String(item.unidade_medida || 'UN'),
            evidencia: {
              tipo: 'api',
              origem: 'PNCP consulta publica',
              coletado_em: new Date().toISOString(),
              titulo: registro.objetoCompra || registro.objeto || termo,
            },
            score: 92,
          });
        }
      } catch (error) {
        this.logger.warn(`Falha ao consultar PNCP para item ${item.numero_item}: ${(error as Error).message}`);
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

  async buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]> {
    const candidatos: PesquisaPrecoCandidateInput[] = [];

    for (const item of context.itens) {
      const termo = termoItem(item);
      if (!termo) continue;

      try {
        const res = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
          params: { q: termo, limit: context.scope.maxPorFonte || 5 },
          timeout: REQUEST_TIMEOUT_MS,
        });
        const results = Array.isArray(res.data?.results) ? res.data.results : [];

        for (const produto of results) {
          const valor = Number(produto.price || 0);
          if (valor <= 0) continue;
          candidatos.push({
            item_numero: item.numero_item,
            fonte_tipo: 'MIDIA_ESPECIALIZADA',
            descricao_fonte: `Internet - ${produto.title || 'produto encontrado'}`,
            url_referencia: produto.permalink,
            data_pesquisa: hojeISO(),
            fornecedor_razao_social: produto.seller?.nickname,
            valor_unitario: valor,
            quantidade_base: 1,
            unidade: String(item.unidade_medida || 'UN'),
            evidencia: {
              tipo: 'api',
              origem: 'Mercado Livre API publica',
              coletado_em: new Date().toISOString(),
              titulo: produto.title,
            },
            score: 70,
            flags: ['Preco de marketplace: conferir frete, marca, especificacao e disponibilidade.'],
          });
        }
      } catch (error) {
        this.logger.warn(`Falha ao consultar web para item ${item.numero_item}: ${(error as Error).message}`);
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
