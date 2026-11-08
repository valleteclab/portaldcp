import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ModuloSistema } from '../../orgaos/enums/modulos.enum';
import { CHAVES_FLUXO_PADRAO_CONTRATACAO } from '../modelos-prontos/catalogo-modelos';
import { DesenhoFluxoService } from '../desenho/desenho-fluxo.service';
import { WorkflowService } from '../workflow.service';

/**
 * UM MOTOR SÓ (11/2026): toda contratação nasce conduzida pelo fluxo — pelo
 * assistente "Novo processo", pela demanda, pela fase interna feita fora ou pelo
 * DFD consolidado. Antes só o DFD consolidado ligava o fluxo; os outros caminhos
 * caíam no motor antigo (tarefas automáticas, envio manual).
 *
 * O fluxo vale para quem tem LICITACOES ou PROCESSOS (decisão de 08/11/2026: o
 * motor antigo sai). Sem fluxo de contratação cadastrado,
 * o órgão recebe o fluxo padrão (instrução + modalidades + padrão) já ativo; o
 * administrador ajusta depois em Configurações › Fluxos de processo.
 */
@Injectable()
export class ContratacaoNoFluxoService {
  private readonly logger = new Logger(ContratacaoNoFluxoService.name);
  /** Uma provisão por órgão de cada vez (duas contratações abertas juntas não criam o padrão duas vezes). */
  private readonly emCurso = new Map<string, Promise<boolean>>();

  constructor(
    private readonly ds: DataSource,
    private readonly workflow: WorkflowService,
    private readonly desenhos: DesenhoFluxoService,
  ) {}

  /** O órgão usa o fluxo da contratação (tem Licitações ou o Processo Eletrônico)? */
  async orgaoUsaOFluxo(orgaoId: string): Promise<boolean> {
    const [o] = await this.ds.query(`SELECT modulos_habilitados FROM orgaos WHERE id::text = $1`, [orgaoId]);
    const modulos = String(o?.modulos_habilitados ?? '').split(',').map((m) => m.trim());
    // Decisão do dono (08/11/2026): o fluxo da contratação faz parte de Licitações —
    // quem tem Licitações usa o fluxo novo, com ou sem o módulo Processos
    return modulos.includes(ModuloSistema.LICITACOES) || modulos.includes(ModuloSistema.PROCESSOS);
  }

  /**
   * Põe o processo de contratação no fluxo. Nulo = ficou fora (órgão sem o módulo
   * ou nenhum fluxo vale para ele). Nunca derruba a criação do processo.
   */
  async iniciar(orgaoId: string, processoId: string, atorId: string) {
    try {
      if (!(await this.orgaoUsaOFluxo(orgaoId))) return null;
      if (await this.workflow.temFluxoEmAndamento(orgaoId, processoId)) return null;
      await this.garantirFluxoPadrao(orgaoId);
      return await this.workflow.iniciarFluxoDaContratacao(orgaoId, processoId, atorId);
    } catch (e) {
      this.logger.warn(`Contratação ${processoId} não entrou no fluxo: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** Órgão sem nenhum fluxo de contratação (nem rascunho, nem desativado): cria e ativa o padrão. */
  async garantirFluxoPadrao(orgaoId: string): Promise<boolean> {
    const pendente = this.emCurso.get(orgaoId);
    if (pendente) return pendente;
    const p = this.provisionar(orgaoId).finally(() => this.emCurso.delete(orgaoId));
    this.emCurso.set(orgaoId, p);
    return p;
  }

  private async provisionar(orgaoId: string): Promise<boolean> {
    const [r] = await this.ds.query(`SELECT count(*)::int AS n FROM workflow_modelos WHERE orgao_id::text = $1 AND tipo_processo = 'CONTRATACAO'`, [orgaoId]);
    if (Number(r?.n ?? 0) > 0) return false;
    for (const chave of CHAVES_FLUXO_PADRAO_CONTRATACAO) {
      const d = await this.desenhos.criarDeModelo(orgaoId, null, chave, { semSetorFicaComQuemAbriu: true });
      await this.desenhos.ativar(orgaoId, d.modelo.id);
    }
    this.logger.log(`Fluxo padrão da contratação ativado no órgão ${orgaoId}`);
    return true;
  }
}
