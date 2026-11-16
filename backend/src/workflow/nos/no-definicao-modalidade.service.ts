import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { escolherFluxo } from '../aplicacao/aplicacao-fluxo';
import { WorkflowService } from '../workflow.service';
import { RegistroNos, type ContextoNo, type EventoFluxo, type ExecutorNo, type OuvinteFluxo } from './executor-no';
import {
  fundamentoDaDefinicao, lerDefinicao, pendenciasDaDefinicao, proximoNumeroDaModalidade, rotuloDaDefinicao, textoDoDespacho, TIPO_DEFINICAO_MODALIDADE,
} from './definicao-modalidade';

/**
 * Executor da etapa DEFINIÇÃO DA MODALIDADE (fim da instrução):
 *  - pendências: modalidade, enquadramento e justificativa; e um fluxo ativo
 *    que valha para o caso (senão o processo ficaria sem caminho);
 *  - ao concluir (mesma transação): a licitação recebe modalidade,
 *    enquadramento e o número da modalidade no ano;
 *  - depois de gravado (fim da instrução): o despacho vira folha dos autos e
 *    o processo passa para o fluxo da modalidade.
 */
@Injectable()
export class DefinicaoModalidadeExecutor implements ExecutorNo, OuvinteFluxo, OnModuleInit {
  readonly tipo = TIPO_DEFINICAO_MODALIDADE;
  private readonly logger = new Logger(DefinicaoModalidadeExecutor.name);

  constructor(
    private readonly registro: RegistroNos,
    private readonly ds: DataSource,
    private readonly workflow: WorkflowService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    this.registro.registrarExecutor(this);
    this.registro.registrarOuvinte(this);
  }

  private async licitacaoDo(processoId: string | null, orgaoId: string, m?: EntityManager) {
    if (!processoId) return null;
    const [l] = await (m ?? this.ds.manager).query(
      `SELECT l.id::text AS id, l.tipo_contratacao::text AS tipo_contratacao, l.numero_edital, l.ano
         FROM processos p JOIN licitacoes l ON p.referencia_tipo = 'LICITACAO' AND l.id = p.referencia_id
        WHERE p.id::text = $1 AND p.orgao_id::text = $2`,
      [processoId, orgaoId],
    );
    return (l ?? null) as { id: string; tipo_contratacao: string | null; numero_edital: string | null; ano: number | null } | null;
  }

  async pendencias(ctx: ContextoNo): Promise<string[]> {
    const d = lerDefinicao(ctx.tarefa.resposta);
    const p = pendenciasDaDefinicao(d);
    if (p.length) return p;
    const lic = await this.licitacaoDo(ctx.processoId, ctx.orgaoId);
    if (!lic) return ['Esta etapa só serve a um processo de contratação (licitação ligada ao processo).'];
    const fundamento = fundamentoDaDefinicao(d, lic.tipo_contratacao);
    if (!escolherFluxo(await this.workflow.ativosDaContratacao(ctx.orgaoId), d.modalidade, fundamento)) {
      return [`Nenhum fluxo ativo vale para ${rotuloDaDefinicao(d.modalidade, fundamento)}. Ative em Configurações › Fluxos de processo um fluxo para essa modalidade (ou um fluxo padrão) antes de concluir.`];
    }
    return [];
  }

  async aoConcluir(ctx: ContextoNo, m: EntityManager): Promise<void> {
    const d = lerDefinicao(ctx.tarefa.resposta);
    const lic = await this.licitacaoDo(ctx.processoId, ctx.orgaoId, m);
    if (!lic) return;
    const fundamento = fundamentoDaDefinicao(d, lic.tipo_contratacao);
    let numero = lic.numero_edital && String(lic.numero_edital).trim() ? String(lic.numero_edital).trim() : null;
    if (!numero) {
      const ano = Number(lic.ano) || new Date().getFullYear();
      const usados: Array<{ n: string | null }> = await m.query(
        `SELECT numero_edital AS n FROM licitacoes WHERE orgao_id = (SELECT orgao_id FROM licitacoes WHERE id::text = $1) AND modalidade::text = $2 AND id::text <> $1`,
        [lic.id, d.modalidade],
      );
      numero = proximoNumeroDaModalidade(usados.map((u) => u.n), ano);
    }
    await m.query(
      `UPDATE licitacoes SET modalidade = $2, fundamento_legal = $3, modalidade_definida = true, numero_edital = $4, updated_at = now() WHERE id::text = $1`,
      [lic.id, d.modalidade, fundamento, numero],
    );
    // O que valeu de fato fica na resposta da tarefa (gravada logo depois pelo motor)
    ctx.tarefa.resposta = { ...(ctx.tarefa.resposta ?? {}), fundamento_efetivo: fundamento, numero };
  }

  async aoEvento(evento: EventoFluxo): Promise<void> {
    const { ctx } = evento;
    if (evento.tipo !== 'FLUXO_CONCLUIDO' || String(ctx.acao.tipo).toUpperCase() !== TIPO_DEFINICAO_MODALIDADE || !ctx.processoId) return;
    const d = lerDefinicao(ctx.tarefa.resposta);
    const r = (ctx.tarefa.resposta ?? {}) as Record<string, unknown>;
    const fundamento = (r.fundamento_efetivo as string | null) ?? d.fundamento;
    const numero = (r.numero as string | null) ?? null;
    const lic = await this.licitacaoDo(ctx.processoId, ctx.orgaoId);
    const [autor] = ctx.atorId ? await this.ds.query(`SELECT nome FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`, [ctx.atorId, ctx.orgaoId]).catch(() => []) : [];
    // Folha dos autos: o despacho da definição (como o "despacho de indicação da modalidade" da fase interna)
    if (lic) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DespachoEtapaService } = require('../../fase-interna/despacho-etapa.service');
        const despachos = this.moduleRef.get(DespachoEtapaService, { strict: false });
        await despachos.registrar(lic.id, {
          etapa: 'INDICACAO_MODALIDADE',
          titulo_etapa: 'Definição da modalidade',
          texto: textoDoDespacho(d, fundamento, numero),
          autor: { id: ctx.atorId, nome: autor?.nome ?? null },
        });
      } catch (e) {
        this.logger.warn(`Despacho da definição da modalidade não registrado (processo ${ctx.processoId}): ${(e as Error).message}`);
      }
    }
    await this.workflow.seguirParaFluxoDaModalidade(ctx.orgaoId, ctx.processoId, ctx.instancia.id, {
      modalidade: d.modalidade,
      fundamento,
      numero,
      por_id: ctx.atorId,
      em: new Date().toISOString(),
    });
  }
}
