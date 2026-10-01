import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { REFERENCIA_LICITACAO, TipoProcesso } from './entities/processo.entity';
import { SITUACOES_LICITACAO_QUE_ENCERRAM } from './processo-regras';
import { TABELAS_COM_PROCESSO_ID } from './processo.service';
import { ProcessoTiposService } from './processo-tipos.service';

export interface ResultadoMigracaoProcesso {
  processos_criados: number;
  ligacoes: Record<string, number>;
  tipos_semeados: number;
}

/**
 * MIGRAÇÃO DE BOOT DO PROCESSO ELETRÔNICO (idempotente; fila única
 * `executarMigracaoDeBoot`; desligar com PROCESSO_MIGRAR_NO_BOOT=false):
 *
 *  1. semeia o registro em dados dos tipos de processo (`tipos_processo`);
 *  2. cria UM `Processo` do tipo CONTRATACAO para cada licitação existente que
 *     ainda não tem (número = `licitacoes.numero_processo`, objeto, órgão,
 *     situação derivada da licitação, `origem = MIGRACAO`);
 *  3. preenche `processo_id` nas tabelas da fase interna (tramitação, autos,
 *     peças, despachos, fluxo, tarefas) das linhas ainda sem ligação.
 *
 * Cada passo é um comando SQL em conjunto (não linha a linha): roda em
 * segundos mesmo com milhares de processos, e rodar de novo não muda nada.
 * Licitação sem órgão (dado antigo inconsistente) fica de fora.
 */
@Injectable()
export class MigracaoProcessoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoProcessoBootService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tipos: ProcessoTiposService,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.ds, () => this.executarMigracao()).then(() => undefined);
  }

  async executarMigracao(): Promise<ResultadoMigracaoProcesso> {
    const r: ResultadoMigracaoProcesso = { processos_criados: 0, ligacoes: {}, tipos_semeados: 0 };
    if (process.env.PROCESSO_MIGRAR_NO_BOOT === 'false') return r;
    try {
      r.tipos_semeados = await this.tipos.semear();
      r.processos_criados = await this.criarProcessosDasLicitacoes();
      r.ligacoes = await this.ligarFilhos();
      const ligadas = Object.values(r.ligacoes).reduce((a, b) => a + b, 0);
      if (r.processos_criados || ligadas) {
        this.logger.log(
          `Processo eletrônico: ${r.processos_criados} processo(s) criado(s) para licitações existentes; ${ligadas} linha(s) ligada(s) (${Object.entries(r.ligacoes)
            .filter(([, n]) => n)
            .map(([t, n]) => `${t}=${n}`)
            .join(', ') || 'nada novo'})`,
        );
      }
    } catch (e: unknown) {
      this.logger.error(`Migração do processo eletrônico não executada: ${e instanceof Error ? e.message : String(e)}`);
    }
    return r;
  }

  /** Um processo por licitação sem processo. `ON CONFLICT DO NOTHING`: nunca duplica (referência e órgão+número únicos). */
  private async criarProcessosDasLicitacoes(): Promise<number> {
    const encerram = SITUACOES_LICITACAO_QUE_ENCERRAM as ReadonlyArray<string>;
    const r = await this.ds.query(
      `INSERT INTO processos (orgao_id, tipo, numero, objeto, situacao, referencia_tipo, referencia_id, origem, aberto_em, encerrado_em)
       SELECT l.orgao_id::uuid, $1, l.numero_processo, COALESCE(NULLIF(l.objeto, ''), '(sem objeto)'),
              CASE WHEN l.situacao::text = ANY($3::text[]) THEN 'ENCERRADO' ELSE 'ABERTO' END,
              $2, l.id, 'MIGRACAO', COALESCE(l.data_abertura_processo, l.created_at, now()),
              CASE WHEN l.situacao::text = ANY($3::text[]) THEN COALESCE(l.updated_at, now()) ELSE NULL END
         FROM licitacoes l
        WHERE l.orgao_id IS NOT NULL AND l.numero_processo IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM processos p WHERE p.referencia_tipo = $2 AND p.referencia_id = l.id)
        ORDER BY l.created_at ASC
       ON CONFLICT DO NOTHING`,
      [TipoProcesso.CONTRATACAO, REFERENCIA_LICITACAO, encerram],
    );
    return Number(Array.isArray(r) ? r[1] ?? 0 : 0);
  }

  /** `processo_id` das linhas sem ligação, tabela a tabela. */
  private async ligarFilhos(): Promise<Record<string, number>> {
    const saida: Record<string, number> = {};
    for (const tabela of TABELAS_COM_PROCESSO_ID) {
      const r = await this.ds.query(
        `UPDATE ${tabela} t SET processo_id = p.id FROM processos p
          WHERE p.referencia_tipo = $1 AND p.referencia_id::text = t.licitacao_id::text AND t.processo_id IS NULL`,
        [REFERENCIA_LICITACAO],
      );
      saida[tabela] = Number(Array.isArray(r) ? r[1] ?? 0 : 0);
    }
    return saida;
  }
}
