import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { RegistroNos, type EventoFluxo } from '../nos/executor-no';

/**
 * FASE DA LICITAÇÃO ACOMPANHA O FLUXO (pregão 2026/00070, homologação
 * 09/11/2026). No rito completo o PUBLICAR só parte de APROVACAO_INTERNA, mas
 * o fluxo novo conduz as etapas sem mover a fase da licitação: o pregão chegava
 * à etapa de Publicação ainda em PLANEJAMENTO e o edital não podia ser
 * publicado. Quando a etapa de Publicação do fluxo abre, o sistema aplica, em
 * ordem, os atos de conclusão das fases internas — cada um com as suas travas
 * (documentos da etapa); o que travar fica onde está e aparece na conferência.
 * No boot, alinha os processos que já estão na etapa de Publicação.
 * A contratação direta publica de qualquer fase interna: não precisa.
 */
export const SEQUENCIA_FASE_INTERNA: Array<{ fase: string; ato: string }> = [
  { fase: 'PLANEJAMENTO', ato: 'CONCLUIR_PLANEJAMENTO' },
  { fase: 'TERMO_REFERENCIA', ato: 'CONCLUIR_TERMO_REFERENCIA' },
  { fase: 'PESQUISA_PRECOS', ato: 'CONCLUIR_PESQUISA_PRECOS' },
  { fase: 'ANALISE_JURIDICA', ato: 'CONCLUIR_ANALISE_JURIDICA' },
];

const MODALIDADES_DIRETAS = ['DISPENSA_ELETRONICA', 'INEXIGIBILIDADE', 'CREDENCIAMENTO'];

/** Atos a aplicar, a partir da fase atual, para a licitação chegar a APROVACAO_INTERNA (vazio se já está ou não se aplica). */
export function atosAteAprovacaoInterna(modalidade: string | null | undefined, fase: string | null | undefined): string[] {
  if (!modalidade || MODALIDADES_DIRETAS.includes(String(modalidade))) return [];
  const i = SEQUENCIA_FASE_INTERNA.findIndex((s) => s.fase === fase);
  return i < 0 ? [] : SEQUENCIA_FASE_INTERNA.slice(i).map((s) => s.ato);
}

@Injectable()
export class FaseDaLicitacaoNoFluxoService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(FaseDaLicitacaoNoFluxoService.name);

  constructor(
    private readonly registro: RegistroNos,
    private readonly ds: DataSource,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    this.registro.registrarOuvinte({ aoEvento: (e) => this.aoEvento(e) });
  }

  onApplicationBootstrap(): void {
    if (process.env.ALINHAR_FASE_AO_FLUXO === 'false') return;
    // Sem bloquear a subida: processos que já estão na etapa de Publicação do fluxo
    setTimeout(() => void this.alinharPendentes().catch((e) => this.logger.warn(`Alinhamento da fase ao fluxo falhou: ${e?.message ?? e}`)), 15_000);
  }

  private async aoEvento(e: EventoFluxo): Promise<void> {
    if (e.tipo !== 'TAREFA_CRIADA' || String(e.ctx.acao?.tipo).toUpperCase() !== 'PUBLICACAO' || !e.ctx.processoId) return;
    const [l] = await this.ds.query(
      `SELECT l.id::text AS id FROM processos p JOIN licitacoes l ON p.referencia_tipo = 'LICITACAO' AND l.id = p.referencia_id WHERE p.id::text = $1`,
      [e.ctx.processoId],
    );
    // Depois da transação que abriu a tarefa (a conclusão da etapa anterior)
    if (l) setTimeout(() => void this.alinhar(l.id).catch((err) => this.logger.warn(`Fase da licitação ${l.id} não alinhada ao fluxo: ${err?.message ?? err}`)), 500);
  }

  /** Licitações do rito completo com a etapa de Publicação aberta no fluxo e a fase ainda antes de APROVACAO_INTERNA. */
  async alinharPendentes(): Promise<number> {
    const lics: Array<{ id: string }> = await this.ds.query(
      `SELECT DISTINCT l.id::text AS id
         FROM workflow_tarefas t
         JOIN workflow_acoes a ON a.id = t.acao_id AND upper(a.tipo) = 'PUBLICACAO'
         JOIN workflow_instancias i ON i.id = t.instancia_id AND i.vinculo_tipo = 'PROCESSO'
         JOIN processos p ON p.id = i.vinculo_id AND p.referencia_tipo = 'LICITACAO'
         JOIN licitacoes l ON l.id = p.referencia_id
        WHERE t.status = 'ABERTA' AND l.fase::text = ANY($1) AND l.modalidade::text <> ALL($2)`,
      [SEQUENCIA_FASE_INTERNA.map((s) => s.fase), MODALIDADES_DIRETAS],
    );
    let n = 0;
    for (const l of lics) if (await this.alinhar(l.id).catch(() => false)) n++;
    if (lics.length) this.logger.log(`Fase alinhada ao fluxo (etapa de Publicação aberta): ${n} de ${lics.length} licitação(ões)`);
    return n;
  }

  /** Aplica os atos até APROVACAO_INTERNA; para no primeiro que travar. true = chegou. */
  async alinhar(licitacaoId: string): Promise<boolean> {
    const [lic] = await this.ds.query(`SELECT modalidade::text AS modalidade, fase::text AS fase FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    const atos = atosAteAprovacaoInterna(lic?.modalidade, lic?.fase);
    if (!atos.length) return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../licitacoes/transicoes/transicoes.service');
    const transicoes = this.moduleRef.get(mod.TransicoesService, { strict: false });
    if (!transicoes) return false;
    for (const ato of atos) {
      try {
        await transicoes.executar(licitacaoId, ato, {
          ator: { tipo: 'SISTEMA', id: 'fluxo' },
          motivo: 'A etapa de Publicação do fluxo do processo abriu: as fases internas acompanham o fluxo.',
          ignorarSeJaAplicado: true,
        });
      } catch (e: any) {
        this.logger.warn(`Licitação ${licitacaoId}: ${ato} não aplicado ao alinhar com o fluxo — ${e?.response?.message ?? e?.message ?? e}`);
        return false;
      }
    }
    return true;
  }
}
