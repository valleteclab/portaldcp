import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';

export const MENSAGEM_COPILOTO_INTERROMPIDO =
  'A preparação foi interrompida porque o servidor reiniciou. Rode o copiloto de novo.';

/**
 * COPILOTO INTERROMPIDO PELO REINÍCIO (27/09/2026).
 *
 * A preparação automática roda em segundo plano dentro do processo do
 * servidor. Se o servidor reinicia (deploy), a execução morre e o processo
 * ficava para sempre em EXECUTANDO — e o copiloto recusava rodar de novo.
 * No boot, toda preparação ainda EXECUTANDO é marcada como ERRO com a
 * mensagem acima (a tela então oferece rodar de novo).
 *
 * Idempotente; SQL direto. Falha é logada e NÃO derruba o boot.
 * Desligar: FASE_INTERNA_COPILOTO_BOOT=false.
 */
@Injectable()
export class CopilotoInterrompidoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CopilotoInterrompidoBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao()).then(() => undefined);
  }

  async executarMigracao(): Promise<{ marcadas: number }> {
    if (process.env.FASE_INTERNA_COPILOTO_BOOT === 'false') return { marcadas: 0 };
    try {
      const linhas: any[] = await this.dataSource.query(
        `UPDATE licitacoes
            SET preparacao_automatica = preparacao_automatica
                || jsonb_build_object('status', 'ERRO', 'erro', $1::text, 'concluida_em', $2::text)
          WHERE preparacao_automatica->>'status' = 'EXECUTANDO'
          RETURNING id`,
        [MENSAGEM_COPILOTO_INTERROMPIDO, new Date().toISOString()],
      );
      const marcadas = Array.isArray(linhas?.[0]) ? linhas[0].length : Array.isArray(linhas) ? linhas.length : 0;
      if (marcadas) this.logger.log(`Copiloto: ${marcadas} preparação(ões) interrompida(s) pelo reinício marcada(s) como ERRO`);
      return { marcadas };
    } catch (e: unknown) {
      this.logger.error(`Copiloto interrompido: marcação não executada: ${e instanceof Error ? e.message : String(e)}`);
      return { marcadas: 0 };
    }
  }
}
