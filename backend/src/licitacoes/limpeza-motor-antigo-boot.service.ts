import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { FASES_INTERNAS } from './transicoes/fases';
import { LicitacoesService } from './licitacoes.service';

/**
 * LIMPEZA DOS PROCESSOS DO MOTOR ANTIGO (decisão do dono, 08/11/2026: "um motor
 * só"; os processos que ainda andam no motor antigo podem ser apagados — só
 * existem na homologação).
 *
 * Alvo: contratação ainda na FASE INTERNA que NÃO é conduzida por um fluxo
 * novo em andamento. Publicadas (fase externa) e as conduzidas pelo fluxo não
 * são tocadas. Apaga pelo mesmo caminho do "Excluir processo" (peças, itens,
 * autuação do processo eletrônico…).
 *
 * NÃO roda sozinho: só com a variável de ambiente
 *   LIMPAR_PROCESSOS_MOTOR_ANTIGO=listar  → só registra no log o que apagaria
 *   LIMPAR_PROCESSOS_MOTOR_ANTIGO=apagar  → apaga e registra no log
 * Sem a variável (padrão, e na VPS da Câmara), não faz nada.
 */
@Injectable()
export class LimpezaMotorAntigoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LimpezaMotorAntigoBootService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly licitacoes: LicitacoesService,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    const modo = String(process.env.LIMPAR_PROCESSOS_MOTOR_ANTIGO ?? '').trim().toLowerCase();
    if (modo !== 'listar' && modo !== 'apagar') return Promise.resolve();
    return executarMigracaoDeBoot(this.dataSource, () => this.executar(modo === 'apagar')).then(() => undefined);
  }

  /** Contratações na fase interna fora do fluxo novo. */
  async alvos(): Promise<Array<{ id: string; numero_processo: string | null; objeto: string | null; fase: string; orgao: string | null }>> {
    return this.dataSource.query(
      `SELECT l.id::text AS id, l.numero_processo, LEFT(l.objeto, 90) AS objeto, l.fase::text AS fase, o.nome AS orgao
         FROM licitacoes l
         LEFT JOIN orgaos o ON o.id = l.orgao_id
        WHERE l.fase::text = ANY($1::text[])
          AND NOT EXISTS (
            SELECT 1 FROM processos p
              JOIN workflow_instancias i ON i.vinculo_tipo = 'PROCESSO' AND i.vinculo_id = p.id AND i.status = 'EM_ANDAMENTO'
             WHERE p.referencia_tipo = 'LICITACAO' AND p.referencia_id = l.id)
        ORDER BY o.nome, l.created_at`,
      [FASES_INTERNAS],
    );
  }

  async executar(apagar: boolean): Promise<{ encontrados: number; apagados: number; falhas: number }> {
    try {
      const lista = await this.alvos();
      this.logger.warn(`Motor antigo: ${lista.length} contratação(ões) na fase interna fora do fluxo novo (${apagar ? 'APAGAR' : 'só listar'}).`);
      let apagados = 0;
      let falhas = 0;
      for (const l of lista) {
        const desc = `[${l.orgao ?? 'sem órgão'}] ${l.numero_processo ?? 's/nº'} · ${l.fase} · ${l.objeto ?? ''} (${l.id})`;
        if (!apagar) {
          this.logger.warn(`  apagaria: ${desc}`);
          continue;
        }
        try {
          await this.licitacoes.delete(l.id);
          apagados++;
          this.logger.warn(`  apagado: ${desc}`);
        } catch (e: any) {
          falhas++;
          this.logger.error(`  falhou: ${desc} — ${e?.message ?? e}`);
        }
      }
      this.logger.warn(`Motor antigo: fim — ${apagar ? `${apagados} apagado(s), ${falhas} falha(s)` : 'nada apagado (modo listar)'}.`);
      return { encontrados: lista.length, apagados, falhas };
    } catch (e: any) {
      this.logger.error(`Limpeza do motor antigo não executada: ${e?.message ?? e}`);
      return { encontrados: 0, apagados: 0, falhas: 0 };
    }
  }
}
