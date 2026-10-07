import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RegistroNos, type ContextoNo } from './executor-no';
import { PonteFaseInternaService } from '../ponte/ponte-fase-interna.service';

/**
 * Chave de etapa usada em `processo_pecas.etapa` para o documento de um nó do
 * fluxo (convenção do item 2 do pedido: nenhuma tabela nova de documento).
 */
export const chaveDaEtapaDoNo = (acaoId: string): string => `no:${acaoId}`;

/**
 * Decisão pura (sem banco): o que falta na etapa DEMANDA. Prioriza a demanda
 * vinculada (pedido do dono: reaproveitar uma demanda já cadastrada em vez de
 * redigir de novo); sem vínculo, exige o documento da etapa; vínculo que não
 * resolveu para um id válido do órgão é isolamento quebrado — vira pendência,
 * nunca passa em silêncio.
 */
export function pendenciasDemandaPura(estado: { processoLigado: boolean; demandaVinculadaId: string | null; demandaVinculadaValida: boolean; temDocumento: boolean }): string[] {
  if (!estado.processoLigado) return ['Esta etapa precisa estar ligada a um processo.'];
  if (estado.demandaVinculadaId) return estado.demandaVinculadaValida ? [] : ['A demanda vinculada não pertence a este órgão.'];
  if (estado.temDocumento) return [];
  return ['Falta o documento da demanda: escreva, anexe ou vincule uma demanda já cadastrada.'];
}

/** Decisão pura (sem banco): o que falta na etapa DFD. */
export function pendenciasDfdPura(estado: { processoLigado: boolean; temDocumento: boolean }): string[] {
  if (!estado.processoLigado) return ['Esta etapa precisa estar ligada a um processo.'];
  if (estado.temDocumento) return [];
  return ['Falta o documento do DFD.'];
}

/**
 * Executores dos nós DEMANDA e DFD: a única pendência é o documento da etapa
 * (peça em `processo_pecas` com `etapa = 'no:<acao_id>'`, escrita, gerada por
 * IA ou anexada pelo mesmo mecanismo do processo — ver `ProcessoTramitacaoService.juntar`).
 * A decisão em si é pura (`pendenciasDemandaPura`/`pendenciasDfdPura`, com teste);
 * aqui só se busca o estado no banco, sempre filtrado pelo órgão da execução.
 */
@Injectable()
export class ExecutorDemandaDfd implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly registro: RegistroNos,
    private readonly ponte: PonteFaseInternaService,
  ) {}

  onModuleInit(): void {
    this.registro.registrarExecutor({ tipo: 'DEMANDA', pendencias: (ctx) => this.pendenciasDemanda(ctx) });
    this.registro.registrarExecutor({ tipo: 'DFD', pendencias: (ctx) => this.pendenciasDfd(ctx) });
  }

  private async temDocumento(ctx: ContextoNo): Promise<boolean> {
    if (!ctx.processoId) return false;
    const [linha] = await this.ds.query(
      `SELECT 1 FROM processo_pecas WHERE processo_id = $1::uuid AND etapa = $2 LIMIT 1`,
      [ctx.processoId, chaveDaEtapaDoNo(ctx.acao.id)],
    );
    return !!linha;
  }

  /** A demanda vinculada precisa ser do MESMO órgão da execução — nunca confiar no id sem checar. */
  private async demandaValida(demandaId: string, orgaoId: string): Promise<boolean> {
    const [linha] = await this.ds.query(`SELECT 1 FROM demandas WHERE id::text = $1 AND orgao_id::text = $2`, [demandaId, orgaoId]);
    return !!linha;
  }

  private async pendenciasDemanda(ctx: ContextoNo): Promise<string[]> {
    const daPonte = await this.ponte.pendencias(ctx.processoId, 'DEMANDA');
    if (daPonte) return daPonte;
    const demandaId = typeof ctx.tarefa.resposta?.demanda_id === 'string' ? (ctx.tarefa.resposta.demanda_id as string) : null;
    return pendenciasDemandaPura({
      processoLigado: !!ctx.processoId,
      demandaVinculadaId: demandaId,
      demandaVinculadaValida: demandaId ? await this.demandaValida(demandaId, ctx.orgaoId) : false,
      temDocumento: await this.temDocumento(ctx),
    });
  }

  private async pendenciasDfd(ctx: ContextoNo): Promise<string[]> {
    const daPonte = await this.ponte.pendencias(ctx.processoId, 'DFD');
    if (daPonte) return daPonte;
    return pendenciasDfdPura({ processoLigado: !!ctx.processoId, temDocumento: await this.temDocumento(ctx) });
  }
}
