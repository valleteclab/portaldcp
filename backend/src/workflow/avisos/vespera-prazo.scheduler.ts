import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { WorkflowHistorico } from '../workflow.entities';
import { AvisosService } from './avisos.service';
import { mesmaData, proximoDiaUtil } from './dias-uteis';
import { montarMensagemVespera } from './mensagens';
import type { ConfigAvisos, TipoDestinatario } from './destinatarios';

interface LinhaTarefaComPrazo {
  tarefa_id: string;
  instancia_id: string;
  responsavel_tipo: TipoDestinatario;
  responsaveis: string[] | null;
  prazo_em: Date;
  orgao_id: string;
  numero: string;
  iniciado_por_id: string | null;
  vinculo_id: string | null;
  acao_nome: string;
  acao_configuracao: { avisos?: ConfigAvisos } | null;
}

/** Tarefa entra no aviso de véspera quando o prazo cai no próximo dia útil a partir de `hoje`. */
export function tarefaVenceNaVespera(prazoEm: Date, hoje: Date): boolean {
  return mesmaData(prazoEm, proximoDiaUtil(hoje));
}

/** Dedup puro: já existe um aviso de véspera registrado no histórico para esta tarefa? */
export function jaFoiAvisada(historicoDaInstancia: Array<{ evento: string; detalhes: unknown }>, tarefaId: string): boolean {
  return historicoDaInstancia.some((h) => h.evento === 'AVISO_VESPERA' && (h.detalhes as Record<string, unknown> | null)?.tarefa_id === tarefaId);
}

/**
 * Rotina diária: avisa quem está com tarefa ABERTA cujo prazo cai no próximo
 * dia útil e cuja etapa marcou "1 dia antes do prazo". Uma vez só por
 * tarefa — a dedup é feita olhando o histórico antes de enviar.
 */
@Injectable()
export class VesperaPrazoScheduler {
  private readonly logger = new Logger(VesperaPrazoScheduler.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly avisos: AvisosService,
    @InjectRepository(WorkflowHistorico) private readonly historico: Repository<WorkflowHistorico>,
  ) {}

  @Cron('0 8 * * 1-5', { name: 'workflow-avisos-vespera', timeZone: 'America/Sao_Paulo' })
  async rotina(): Promise<void> {
    if (process.env.WORKFLOW_AVISOS_VESPERA === 'false') return;
    try {
      const resultado = await this.executar();
      if (resultado.avisados) this.logger.log(`Avisos de véspera de prazo: ${resultado.avisados} tarefa(s).`);
    } catch (e) {
      this.logger.error(`Avisos de véspera de prazo não executados: ${(e as Error).message}`);
    }
  }

  async executar(agora = new Date()): Promise<{ avisados: number }> {
    const alvo = proximoDiaUtil(agora);
    const linhas: LinhaTarefaComPrazo[] = await this.dataSource.query(
      `SELECT t.id AS tarefa_id, t.instancia_id, t.responsavel_tipo, t.responsaveis, t.prazo_em,
              i.orgao_id, i.numero, i.iniciado_por_id, i.vinculo_id,
              a.nome AS acao_nome, a.configuracao AS acao_configuracao
       FROM workflow_tarefas t
       JOIN workflow_instancias i ON i.id = t.instancia_id
       JOIN workflow_acoes a ON a.id = t.acao_id
       WHERE t.status = 'ABERTA' AND t.prazo_em IS NOT NULL
         AND date(t.prazo_em) = date($1)
         AND (a.configuracao -> 'avisos' ->> 'vespera_prazo') = 'true'`,
      [alvo],
    );

    let avisados = 0;
    for (const linha of linhas) {
      const [existente] = await this.dataSource.query(
        `SELECT 1 FROM workflow_historico WHERE instancia_id::text = $1 AND evento = 'AVISO_VESPERA' AND detalhes->>'tarefa_id' = $2 LIMIT 1`,
        [linha.instancia_id, linha.tarefa_id],
      );
      if (existente) continue;

      const avisosCfg = linha.acao_configuracao?.avisos;
      const responsaveis = Array.isArray(linha.responsaveis) ? linha.responsaveis : [];
      const [destinatarios, label] = await Promise.all([
        this.avisos.resolverContatos(linha.orgao_id, linha.responsavel_tipo, responsaveis, linha.iniciado_por_id),
        this.avisos.resolverLabel(linha.orgao_id, linha.responsavel_tipo, responsaveis),
      ]);
      const mensagem = montarMensagemVespera({ numero: linha.numero, acaoNome: linha.acao_nome, responsavelLabel: label, prazo: linha.prazo_em });
      await this.avisos.enviar({
        orgaoId: linha.orgao_id,
        destinatarios,
        canais: avisosCfg?.canais ?? [],
        teamsCanalId: avisosCfg?.teams_canal_id,
        mensagem,
        instanciaId: linha.instancia_id,
        card: {
          titulo: 'Processo vence prazo amanhã',
          numero: linha.numero,
          etapa: linha.acao_nome,
          setor: label,
          prazo: linha.prazo_em.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          link: linha.vinculo_id ? `${(process.env.FRONTEND_URL || 'https://www.portaldcp.com.br').replace(/\/$/, '')}/orgao/processo/${linha.vinculo_id}` : null,
        },
      });
      await this.historico.save(this.historico.create({
        instancia_id: linha.instancia_id,
        evento: 'AVISO_VESPERA',
        descricao: `Aviso de véspera de prazo enviado: ${linha.acao_nome}`,
        ator_id: null,
        detalhes: { tarefa_id: linha.tarefa_id },
      }));
      avisados++;
    }
    return { avisados };
  }
}
