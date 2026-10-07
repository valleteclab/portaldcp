import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { DOCUMENTO_DA_ETAPA, pendenciasDaPonte, STATUS_PRONTO } from './ponte-fase-interna';

/**
 * Lê o estado da fase interna para as etapas de um fluxo ligado a um processo
 * de CONTRATAÇÃO (ponte, decisão de 07/10/2026). Só leitura, sempre pelo
 * processo do órgão da execução.
 */
@Injectable()
export class PonteFaseInternaService {
  constructor(private readonly ds: DataSource) {}

  /** Licitação da contratação ligada ao processo (nulo se o processo não é de contratação). */
  async licitacaoDoProcesso(processoId: string): Promise<{ id: string; fase: string; demanda_id: string | null } | null> {
    const [l] = await this.ds.query(
      `SELECT l.id::text AS id, l.fase::text AS fase, l.demanda_id::text AS demanda_id
         FROM processos p JOIN licitacoes l ON l.id = p.referencia_id AND l.orgao_id = p.orgao_id
        WHERE p.id::text = $1 AND p.tipo = 'CONTRATACAO' AND p.referencia_tipo = 'LICITACAO'`,
      [processoId],
    );
    return l ?? null;
  }

  /** Pendências da etapa pela fase interna; nulo quando o processo não é de contratação (vale a regra comum). */
  async pendencias(processoId: string | null, tipoNo: string): Promise<string[] | null> {
    if (!processoId) return null;
    const lic = await this.licitacaoDoProcesso(processoId);
    if (!lic) return null;
    const tipo = String(tipoNo).toUpperCase();
    const tipoDoc = DOCUMENTO_DA_ETAPA[tipo];
    let documentoPronto = false;
    if (tipoDoc) {
      const [d] = await this.ds.query(
        `SELECT 1 FROM documentos_fase_interna
          WHERE licitacao_id::text = $1 AND tipo::text = $2 AND versao_atual = true
            AND (status::text = ANY($3::text[]) OR COALESCE(dados_estruturados->>'nao_se_aplica', '') = 'true')
          LIMIT 1`,
        [lic.id, tipoDoc, STATUS_PRONTO],
      );
      documentoPronto = !!d;
      if (!documentoPronto && tipo === 'DFD') {
        const [c] = await this.ds.query(`SELECT 1 FROM dfds_consolidados WHERE licitacao_id::text = $1 AND status <> 'CANCELADO' LIMIT 1`, [lic.id]);
        documentoPronto = !!c;
      }
    }
    let temDemanda = !!lic.demanda_id;
    if (!temDemanda && tipo === 'DEMANDA') {
      const [c] = await this.ds.query(`SELECT 1 FROM dfds_consolidados WHERE licitacao_id::text = $1 AND status <> 'CANCELADO' LIMIT 1`, [lic.id]);
      temDemanda = !!c;
    }
    return pendenciasDaPonte(tipo, { documentoPronto, publicada: !ehFaseInterna(lic.fase), temDemanda });
  }
}
