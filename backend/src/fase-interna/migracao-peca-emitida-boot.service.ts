import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { FASES_INTERNAS } from '../licitacoes/transicoes/fases';
import { pecaProntaPelaRegraAnterior, RegistroEmissao } from './peca-regras';

/**
 * PEÇA PRONTA SÓ DEPOIS DE EMITIDA (homologação 26/09/2026, E4) — dados
 * existentes. A regra nova (`pecaContaComoPronta`) exige que a peça feita no
 * sistema tenha sido GERADA/EMITIDA; antes, o texto bastava.
 *
 *  - Peça com PDF gerado antes da regra: já conta (a própria regra a aceita —
 *    nada a migrar; não se "despronta" o que foi emitido).
 *  - Peça só com texto em processo JÁ DIVULGADO (fora da fase interna): conta
 *    pela regra anterior e continua contando — recebe o registro de emissão
 *    `legado` (os autos e as etapas desses processos não mudam).
 *  - Peça só com texto em processo AINDA na fase interna: é rascunho — passa a
 *    "em elaboração" até ser gerada (é o que a regra corrige).
 *
 * Idempotente (só linhas sem `_emitido`); SQL direto, sem mexer em
 * `updated_at` nem disparar as rotinas de gravação de peça. Falha é logada e
 * NÃO derruba o boot. Desligar: FASE_INTERNA_PECA_EMITIDA_NO_BOOT=false.
 */
@Injectable()
export class MigracaoPecaEmitidaBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoPecaEmitidaBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao()).then(() => undefined);
  }

  async executarMigracao(): Promise<{ marcadas: number }> {
    if (process.env.FASE_INTERNA_PECA_EMITIDA_NO_BOOT === 'false') return { marcadas: 0 };
    try {
      const linhas: any[] = await this.dataSource.query(
        `SELECT d.id::text AS id, d.tipo::text AS tipo, d.status::text AS status, d.caminho_arquivo, d.arquivo_pdf_path, d.descricao, d.dados_estruturados
           FROM documentos_fase_interna d
           JOIN licitacoes l ON l.id = d.licitacao_id
          WHERE d.versao_atual = true
            AND d.origem::text = 'INTERNO'
            AND d.status::text IN ('EM_ELABORACAO', 'AGUARDANDO_APROVACAO')
            AND d.caminho_arquivo IS NULL AND d.arquivo_pdf_path IS NULL
            AND (d.dados_estruturados IS NULL OR NOT (d.dados_estruturados ? '_emitido'))
            AND l.fase::text <> ALL($1::text[])`,
        [FASES_INTERNAS],
      );
      let marcadas = 0;
      const em = new Date().toISOString();
      for (const d of linhas) {
        if (!pecaProntaPelaRegraAnterior(d)) continue;
        const registro: RegistroEmissao = { em, legado: true, motivo: 'Peça pronta pela regra anterior (texto) em processo já divulgado.' };
        await this.dataSource.query(
          `UPDATE documentos_fase_interna
              SET dados_estruturados = COALESCE(dados_estruturados, '{}'::jsonb) || jsonb_build_object('_emitido', $2::jsonb)
            WHERE id::text = $1 AND (dados_estruturados IS NULL OR NOT (dados_estruturados ? '_emitido'))`,
          [d.id, JSON.stringify(registro)],
        );
        marcadas++;
      }
      if (marcadas) this.logger.log(`Fase interna: ${marcadas} peça(s) de processos já divulgados marcadas como emitidas (regra anterior)`);
      return { marcadas };
    } catch (e: unknown) {
      this.logger.error(`Registro de emissão das peças antigas não executado: ${e instanceof Error ? e.message : String(e)}`);
      return { marcadas: 0 };
    }
  }
}
