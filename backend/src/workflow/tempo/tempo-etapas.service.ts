import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { calendarioDoOrgao, diasUteisEntre } from '../../common/prazos/dias-uteis';
import { detalheTempoEtapa, mediasPorEtapa, resumoTempoEtapas, type InstanciaTempo, type PassoTempo, type TarefaTempo } from './tempo-etapas';

const ROTULO_RESPONSAVEL: Record<string, string> = { SOLICITANTE: 'Solicitante', FISCAL_CONTRATO: 'Fiscal do contrato', GESTOR_CONTRATO: 'Gestor do contrato' };
const PERIODOS = new Set([30, 90, 180, 365]);
/** Janela para achar a tramitação que o fluxo abriu ao criar a tarefa (posse da contratação). */
const JANELA_TRAMITACAO_MS = { antes: 2 * 60_000, depois: 10 * 60_000 };

/**
 * TEMPO POR ETAPA — leitura das tarefas do fluxo (workflow_tarefas) de UMA
 * versão, sempre presa ao órgão de quem pede. A conta fica em tempo-etapas.ts.
 */
@Injectable()
export class TempoEtapasService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Versões que já rodaram em algum processo (as que têm o que medir). */
  async opcoes(orgaoId: string) {
    const linhas: Array<{ id: string; nome: string; versao: number; status: string; tipo_processo: string | null; processos: number }> = await this.ds.query(
      `SELECT m.id::text AS id, m.nome, m.versao, m.status, m.tipo_processo,
              (SELECT COUNT(*)::int FROM workflow_instancias i WHERE i.workflow_id = m.id AND i.orgao_id = m.orgao_id AND i.vinculo_tipo = 'PROCESSO') AS processos
         FROM workflow_modelos m
        WHERE m.orgao_id::text = $1 AND m.status <> 'RASCUNHO'
          AND EXISTS (SELECT 1 FROM workflow_instancias i WHERE i.workflow_id = m.id AND i.orgao_id = m.orgao_id AND i.vinculo_tipo = 'PROCESSO')
        ORDER BY (m.status = 'PUBLICADO') DESC, m.nome, m.versao DESC`,
      [orgaoId],
    );
    return linhas.map((l) => ({ ...l, ativo: l.status === 'PUBLICADO' }));
  }

  async resumo(orgaoId: string, fluxoId: string, dias: unknown) {
    const e = await this.entrada(orgaoId, fluxoId, dias, false);
    return { fluxo: e.fluxo, periodo_dias: e.periodo, ...resumoTempoEtapas(e) };
  }

  async detalhe(orgaoId: string, fluxoId: string, acaoId: string, dias: unknown, mostrarPessoas: boolean) {
    const e = await this.entrada(orgaoId, fluxoId, dias, true);
    const det = detalheTempoEtapa({ ...e, acao_id: acaoId, mostrarPessoas });
    if (!det) throw new NotFoundException('Etapa não encontrada neste fluxo');
    return { fluxo: e.fluxo, periodo_dias: e.periodo, ...det };
  }

  /** Média de cada etapa (últimos 90 dias) das versões informadas — para a fila do Andamento. */
  async mediasDasVersoes(orgaoId: string, fluxoIds: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    for (const id of [...new Set(fluxoIds)].filter(ehUuid)) {
      const e = await this.entrada(orgaoId, id, 90, false).catch(() => null);
      if (!e) continue;
      for (const [acao, media] of mediasPorEtapa(e)) out.set(acao, media);
    }
    return out;
  }

  private async entrada(orgaoId: string, fluxoId: string, diasInformado: unknown, comEspera: boolean) {
    if (!ehUuid(fluxoId)) throw new NotFoundException('Fluxo não encontrado');
    const [fluxo]: Array<{ id: string; nome: string; versao: number; status: string; tipo_processo: string | null }> = await this.ds.query(
      `SELECT id::text AS id, nome, versao, status, tipo_processo FROM workflow_modelos WHERE id::text = $1 AND orgao_id::text = $2`,
      [fluxoId, orgaoId],
    );
    if (!fluxo) throw new NotFoundException('Fluxo não encontrado');
    const periodo = PERIODOS.has(Number(diasInformado)) ? Number(diasInformado) : 90;
    const agora = new Date();
    const desde = new Date(agora.getTime() - periodo * 86_400_000);

    const acoes: Array<{ id: string; nome: string; responsavel_tipo: string | null; responsavel_valor: string | null; prazo_dias_uteis: number | null; configuracao: any }> = await this.ds.query(
      `SELECT a.id::text AS id, a.nome, a.responsavel_tipo, a.responsavel_valor, a.prazo_dias_uteis, a.configuracao
         FROM workflow_acoes a JOIN workflow_fases f ON f.id = a.fase_id
        WHERE f.workflow_id::text = $1 ORDER BY f.ordem, a.ordem`,
      [fluxo.id],
    );
    const instancias: Array<InstanciaTempo & { referencia_id: string | null }> = await this.ds.query(
      `SELECT i.id::text AS id, i.status, p.id::text AS processo_id, p.numero AS processo_numero, p.objeto, p.referencia_id::text AS referencia_id
         FROM workflow_instancias i
         LEFT JOIN processos p ON i.vinculo_tipo = 'PROCESSO' AND p.id::text = i.vinculo_id::text AND p.orgao_id = i.orgao_id
        WHERE i.workflow_id::text = $1 AND i.orgao_id::text = $2 AND i.vinculo_tipo = 'PROCESSO'`,
      [fluxo.id, orgaoId],
    );
    const ids = instancias.map((i) => i.id);
    const linhas: Array<{ id: string; acao_id: string; instancia_id: string; status: string; created_at: Date; concluida_em: Date | null; concluida_por_nome: string | null }> = ids.length
      ? await this.ds.query(
          `SELECT t.id::text AS id, t.acao_id::text AS acao_id, t.instancia_id::text AS instancia_id, t.status, t.created_at, t.concluida_em, u.nome AS concluida_por_nome
             FROM workflow_tarefas t
             LEFT JOIN usuarios u ON u.id::text = t.concluida_por_id AND u.orgao_id::text = $2
            WHERE t.instancia_id::text = ANY($1::text[])`,
          [ids, orgaoId],
        )
      : [];

    const cal = calendarioDoOrgao(orgaoId);
    const diasUteis = (de: Date, ate: Date) => diasUteisEntre(new Date(de), new Date(ate), cal);
    const nomes = await this.nomes(orgaoId, acoes);
    const passos: PassoTempo[] = acoes.map((a) => ({ acao_id: a.id, nome: a.nome, responsavel: this.responsavel(a, nomes), prazo_dias_uteis: a.prazo_dias_uteis ?? null }));
    const esperas = comEspera && fluxo.tipo_processo === 'CONTRATACAO' ? await this.esperas(instancias, linhas, diasUteis) : new Map<string, number>();
    const tarefas: TarefaTempo[] = linhas.map((l) => ({
      ...l,
      created_at: new Date(l.created_at),
      concluida_em: l.concluida_em ? new Date(l.concluida_em) : null,
      espera_dias: comEspera && fluxo.tipo_processo === 'CONTRATACAO' && l.concluida_em ? (esperas.get(l.id) ?? 0) : null,
    }));
    return { fluxo, periodo, passos, tarefas, instancias, desde, agora, diasUteis };
  }

  /**
   * Contratação: o fluxo entrega o processo pela tramitação da fase interna
   * ("Encaminhado pelo fluxo: etapa …") e ele espera alguém dar "Receber".
   * Espera = do envio ao recebimento (ou ao fim da etapa, se ninguém recebeu).
   * Sem tramitação na hora da tarefa (já estava com a pessoa) = sem espera.
   */
  private async esperas(instancias: Array<{ id: string; referencia_id: string | null }>, tarefas: Array<{ id: string; instancia_id: string; created_at: Date; concluida_em: Date | null }>, diasUteis: (de: Date, ate: Date) => number) {
    const licPorInstancia = new Map(instancias.filter((i) => ehUuid(i.referencia_id)).map((i) => [i.id, i.referencia_id!]));
    const lics = [...new Set(licPorInstancia.values())];
    const out = new Map<string, number>();
    if (!lics.length) return out;
    const trams: Array<{ licitacao_id: string; data_envio: Date; data_recebimento: Date | null }> = await this.ds.query(
      `SELECT licitacao_id::text AS licitacao_id, data_envio, data_recebimento FROM tramitacoes_processo
        WHERE licitacao_id::text = ANY($1::text[]) AND automatico = true AND despacho LIKE 'Encaminhado pelo fluxo%'`,
      [lics],
    );
    for (const t of tarefas) {
      if (!t.concluida_em) continue;
      const lic = licPorInstancia.get(t.instancia_id);
      const criada = new Date(t.created_at).getTime();
      const tram = trams.find((x) => x.licitacao_id === lic && new Date(x.data_envio).getTime() >= criada - JANELA_TRAMITACAO_MS.antes && new Date(x.data_envio).getTime() <= criada + JANELA_TRAMITACAO_MS.depois);
      if (!tram) continue;
      const fim = new Date(t.concluida_em);
      const recebido = tram.data_recebimento && new Date(tram.data_recebimento) < fim ? new Date(tram.data_recebimento) : fim;
      out.set(t.id, diasUteis(new Date(tram.data_envio), recebido));
    }
    return out;
  }

  private idsDe(a: { responsavel_valor: string | null; configuracao: any }): string[] {
    const lista = Array.isArray(a.configuracao?.responsaveis) ? (a.configuracao.responsaveis as unknown[]).map(String) : [];
    return lista.length ? lista : a.responsavel_valor ? [a.responsavel_valor] : [];
  }

  private async nomes(orgaoId: string, acoes: Array<{ responsavel_valor: string | null; configuracao: any }>): Promise<Map<string, string>> {
    const ids = [...new Set(acoes.flatMap((a) => this.idsDe(a)))].filter(ehUuid);
    if (!ids.length) return new Map();
    const [setores, usuarios]: Array<Array<{ id: string; nome: string }>> = await Promise.all([
      this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`, [orgaoId, ids]),
      this.ds.query(`SELECT id::text AS id, nome FROM usuarios WHERE orgao_id::text = $1 AND id::text = ANY($2::text[])`, [orgaoId, ids]),
    ]);
    return new Map([...setores, ...usuarios].map((x) => [x.id, x.nome]));
  }

  private responsavel(a: { responsavel_tipo: string | null; responsavel_valor: string | null; configuracao: any }, nomes: Map<string, string>): string | null {
    const tipo = String(a.responsavel_tipo ?? '').toUpperCase();
    if (ROTULO_RESPONSAVEL[tipo]) return ROTULO_RESPONSAVEL[tipo];
    const achados = this.idsDe(a).map((id) => nomes.get(id)).filter((n): n is string => !!n);
    return achados.length ? achados.join(', ') : null;
  }
}
