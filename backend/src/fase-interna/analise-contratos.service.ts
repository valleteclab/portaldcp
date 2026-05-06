import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contrato } from '../contratos/entities/contrato.entity';

export interface BuscarSimilaresParams {
  objeto_keywords: string[];
  modalidade?: string;
  valor_min?: number;
  valor_max?: number;
  apenas_concluidos?: boolean;
  limite?: number;
}

export interface ContratoSimilar {
  id: string;
  numero_contrato: string;
  objeto: string;
  valor_global: number;
  prazo_execucao_dias: number;
  fornecedor_razao_social: string;
  modalidade_licitacao: string;
  data_assinatura: Date;
  status: string;
}

export interface ResumoSimilares {
  total_encontrados: number;
  valor_medio: number;
  valor_mediano: number;
  valor_minimo: number;
  valor_maximo: number;
  prazo_medio_dias: number;
  fornecedores_distintos: number;
  contratos: ContratoSimilar[];
}

/**
 * Serviço de análise de contratos pretéritos para subsidiar a Fase Interna
 * (ETP / Pesquisa de Preços) — Art. 18, X da Lei 14.133/2021.
 */
@Injectable()
export class AnaliseContratosService {
  private static readonly DEFAULT_LIMIT = 20;

  constructor(
    @InjectRepository(Contrato)
    private readonly contratoRepo: Repository<Contrato>,
  ) {}

  /**
   * Busca contratos cujo `objeto` casa com qualquer uma das keywords (ILIKE OR).
   */
  async buscarSimilares(params: BuscarSimilaresParams): Promise<ContratoSimilar[]> {
    const limite = params.limite && params.limite > 0
      ? params.limite
      : AnaliseContratosService.DEFAULT_LIMIT;

    const qb = this.contratoRepo.createQueryBuilder('c');

    const keywords = (params.objeto_keywords || [])
      .map((k) => (k || '').trim())
      .filter((k) => k.length > 0);

    if (keywords.length > 0) {
      qb.andWhere(
        '(' +
          keywords
            .map((_, idx) => `c.objeto ILIKE :kw${idx}`)
            .join(' OR ') +
          ')',
        keywords.reduce((acc, kw, idx) => {
          acc[`kw${idx}`] = `%${kw}%`;
          return acc;
        }, {} as Record<string, string>),
      );
    }

    if (params.modalidade) {
      qb.andWhere('c.modalidade_licitacao = :modalidade', { modalidade: params.modalidade });
    }

    if (params.valor_min !== undefined && params.valor_min !== null) {
      qb.andWhere('c.valor_global >= :valor_min', { valor_min: params.valor_min });
    }

    if (params.valor_max !== undefined && params.valor_max !== null) {
      qb.andWhere('c.valor_global <= :valor_max', { valor_max: params.valor_max });
    }

    if (params.apenas_concluidos) {
      qb.andWhere('c.status = :statusConcluido', { statusConcluido: 'CONCLUIDO' });
    }

    qb.orderBy('c.data_assinatura', 'DESC').limit(limite);

    const contratos = await qb.getMany();
    return contratos.map((c) => this.toSimilar(c));
  }

  /**
   * Resumo agregado a partir do conjunto retornado por `buscarSimilares`.
   * Estatísticas calculadas em JS para simplicidade.
   */
  async resumoSimilares(params: BuscarSimilaresParams): Promise<ResumoSimilares> {
    const contratos = await this.buscarSimilares(params);

    const total = contratos.length;
    if (total === 0) {
      return {
        total_encontrados: 0,
        valor_medio: 0,
        valor_mediano: 0,
        valor_minimo: 0,
        valor_maximo: 0,
        prazo_medio_dias: 0,
        fornecedores_distintos: 0,
        contratos: [],
      };
    }

    const valores = contratos
      .map((c) => Number(c.valor_global) || 0)
      .sort((a, b) => a - b);

    const prazos = contratos
      .map((c) => Number(c.prazo_execucao_dias) || 0)
      .filter((p) => p > 0);

    const soma = valores.reduce((acc, v) => acc + v, 0);
    const valorMedio = soma / total;
    const valorMediano = this.mediana(valores);
    const valorMin = valores[0];
    const valorMax = valores[valores.length - 1];

    const prazoMedio = prazos.length > 0
      ? prazos.reduce((acc, p) => acc + p, 0) / prazos.length
      : 0;

    const fornecedoresDistintos = new Set(
      contratos
        .map((c) => (c.fornecedor_razao_social || '').trim().toUpperCase())
        .filter((f) => f.length > 0),
    ).size;

    return {
      total_encontrados: total,
      valor_medio: this.round(valorMedio),
      valor_mediano: this.round(valorMediano),
      valor_minimo: this.round(valorMin),
      valor_maximo: this.round(valorMax),
      prazo_medio_dias: Math.round(prazoMedio),
      fornecedores_distintos: fornecedoresDistintos,
      contratos: contratos.slice(0, 10),
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private toSimilar(c: Contrato): ContratoSimilar {
    return {
      id: (c as any).id,
      numero_contrato: (c as any).numero_contrato,
      objeto: (c as any).objeto,
      valor_global: Number((c as any).valor_global) || 0,
      prazo_execucao_dias: Number((c as any).prazo_execucao_dias) || 0,
      fornecedor_razao_social: (c as any).fornecedor_razao_social,
      modalidade_licitacao: (c as any).modalidade_licitacao,
      data_assinatura: (c as any).data_assinatura,
      status: (c as any).status,
    };
  }

  private mediana(ordenados: number[]): number {
    const n = ordenados.length;
    if (n === 0) return 0;
    const meio = Math.floor(n / 2);
    return n % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio];
  }

  private round(v: number): number {
    return Math.round(v * 100) / 100;
  }
}
