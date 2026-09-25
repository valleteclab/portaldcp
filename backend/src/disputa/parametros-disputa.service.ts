import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { FontesParametrosDisputa, ParametrosDisputa, resolverParametrosDisputa, valoresIniciaisDaSessao } from './parametros-disputa';

/**
 * Carrega as fontes (sessão, licitação, parâmetro do órgão e do sistema) e
 * devolve os parâmetros EFETIVOS da disputa — ver `parametros-disputa.ts`.
 * Stateless (só DataSource): registrado como provider onde for usado.
 */
@Injectable()
export class ParametrosDisputaService {
  constructor(private readonly dataSource: DataSource) {}

  private async fontesDaLicitacao(licitacaoId: string, m: EntityManager): Promise<Omit<FontesParametrosDisputa, 'sessao'>> {
    const [licitacao] = await m.query(
      `SELECT orgao_id, tempo_inatividade, tempo_prorrogacao, intervalo_minimo_lances,
              diferenca_minima_lances, tipo_diferenca_minima_lances, base_lance
         FROM licitacoes WHERE id = $1`,
      [licitacaoId],
    );
    const params: any[] = await m.query(
      `SELECT * FROM parametros_licitacao WHERE orgao_id IS NULL OR orgao_id = $1`,
      [licitacao?.orgao_id ?? null],
    );
    return {
      licitacao: licitacao ?? null,
      orgao: params.find((p) => p.orgao_id && p.orgao_id === licitacao?.orgao_id) ?? null,
      sistema: params.find((p) => !p.orgao_id) ?? null,
    };
  }

  /** Parâmetros efetivos para uma sessão (a sessão tem precedência nos tempos). */
  async daSessao(sessaoId: string, manager?: EntityManager): Promise<ParametrosDisputa> {
    const m = manager ?? this.dataSource.manager;
    const [sessao] = await m.query(
      `SELECT licitacao_id, tempo_inatividade_minutos, tempo_prorrogacao_minutos, intervalo_minimo_lances_minutos,
              tempo_aleatorio_min_minutos, tempo_aleatorio_max_minutos
         FROM sessoes_disputa WHERE id = $1`,
      [sessaoId],
    );
    if (!sessao) return resolverParametrosDisputa({});
    return resolverParametrosDisputa({ ...(await this.fontesDaLicitacao(sessao.licitacao_id, m)), sessao });
  }

  /** Parâmetros sem sessão (licitação → órgão → sistema). */
  async daLicitacao(licitacaoId: string, manager?: EntityManager): Promise<ParametrosDisputa> {
    return resolverParametrosDisputa(await this.fontesDaLicitacao(licitacaoId, manager ?? this.dataSource.manager));
  }

  /** Valores que a sessão copia ao ser criada. */
  async valoresIniciaisDaSessao(licitacaoId: string) {
    return valoresIniciaisDaSessao(await this.fontesDaLicitacao(licitacaoId, this.dataSource.manager));
  }
}
