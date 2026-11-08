import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RegistroNos, type ContextoNo } from './executor-no';
import { aprovacaoJaFeita } from './aprovacao-demanda';

/** Executor do nó APROVACAO_DEMANDA: lê o estado da demanda da licitação do processo (sempre do órgão da execução). */
@Injectable()
export class ExecutorAprovacaoDemanda implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly registro: RegistroNos,
  ) {}

  onModuleInit(): void {
    this.registro.registrarExecutor({ tipo: 'APROVACAO_DEMANDA', concluiSozinha: (ctx) => this.concluiSozinha(ctx) });
  }

  private async concluiSozinha(ctx: ContextoNo): Promise<string | null> {
    if (!ctx.processoId) return null;
    const [lic] = await this.ds.query(
      `SELECT l.id::text AS id FROM processos p JOIN licitacoes l ON p.referencia_tipo = 'LICITACAO' AND l.id = p.referencia_id
        WHERE p.id::text = $1 AND p.orgao_id::text = $2`,
      [ctx.processoId, ctx.orgaoId],
    );
    if (!lic) return null;
    const demandas: Array<{ status: string }> = await this.ds.query(
      `SELECT d.id, d.status::text AS status FROM licitacoes l JOIN demandas d ON d.id = l.demanda_id WHERE l.id::text = $1
       UNION
       SELECT d.id, d.status::text FROM dfds_consolidados f JOIN dfds_consolidados_demandas fd ON fd.dfd_id = f.id JOIN demandas d ON d.id = fd.demanda_id
        WHERE f.licitacao_id::text = $1 AND f.status <> 'CANCELADO'`,
      [lic.id],
    );
    const [dfd] = await this.ds.query(
      `SELECT numero, ano, exige_aprovacao, aprovacao IS NOT NULL AS aprovado FROM dfds_consolidados WHERE licitacao_id::text = $1 AND status <> 'CANCELADO' LIMIT 1`,
      [lic.id],
    );
    const [doc] = await this.ds.query(
      `SELECT origem::text AS origem FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = 'DFD' AND versao_atual = true ORDER BY versao DESC NULLS LAST LIMIT 1`,
      [lic.id],
    );
    return aprovacaoJaFeita({ demandas, dfdConsolidado: dfd ? { numero: dfd.numero, ano: dfd.ano, exige_aprovacao: !!dfd.exige_aprovacao, aprovado: !!dfd.aprovado } : null, origemDoDfd: doc?.origem ?? null });
  }
}
