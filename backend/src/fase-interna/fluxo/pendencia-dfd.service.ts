import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import type { Ator } from '../../auth/acesso/ator';
import { NotificacoesService } from '../../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../../notificacoes/entities/notificacao.entity';
import { DestinatarioAviso, PlanejamentoFluxoService } from './planejamento-fluxo.service';
import {
  DemandasLivres,
  ENTIDADE_AVISO_DFD,
  anoDeBrasilia,
  anoMinimoDaPendencia,
  decidirAviso,
  destinatariosDoAviso,
  linkDaPendencia,
  pendenciaDaCaixa,
  textoAvisoPlanejamento,
} from './pendencia-dfd';

/** Status da demanda que pode entrar num DFD (espelho de STATUS_DEMANDA_PARA_DFD — demandas/entities). */
const STATUS_PARA_DFD = ['APROVADA', 'CONSOLIDADA'];

/** Demanda recém-aprovada (o que o aviso precisa). */
export interface DemandaAprovadaAviso {
  id: string;
  orgao_id: string;
  descricao_sucinta_objeto?: string | null;
  unidade_requisitante?: string | null;
  criado_por_id?: string | null;
}

/**
 * "DEMANDA APROVADA → MONTE O DFD" (pergunta do dono: quem é avisado de que
 * há demanda aprovada para iniciar a compra?).
 *
 *  - AVISO (sino, e-mail e WhatsApp) a quem monta o DFD pela regra do órgão
 *    (Configurações › Fluxo — padrão papel PLANEJAMENTO + administradores),
 *    agrupado: várias aprovações seguidas atualizam o mesmo aviso não lido.
 *  - PENDÊNCIA "Montar o DFD — N demanda(s) aprovada(s) aguardando" na caixa
 *    "Para mim" e no contador do menu. É DERIVADA das demandas livres (sem
 *    DFD e sem processo): uma por órgão e pessoa, some sozinha quando todas
 *    entram num DFD — sem tabela nova e sem mexer em `tarefas` (que é por
 *    processo, com `licitacao_id` obrigatório).
 *
 * Isolamento: tudo pelo órgão informado (sempre o do token no controller) —
 * destinatários só do mesmo órgão (`PlanejamentoFluxoService.destinatarios`).
 */
@Injectable()
export class PendenciaDfdService {
  private readonly logger = new Logger(PendenciaDfdService.name);
  /** Avisos do mesmo órgão em fila (duas aprovações ao mesmo tempo não criam dois avisos). */
  private readonly filas = new Map<string, Promise<unknown>>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly planejamento: PlanejamentoFluxoService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  /**
   * Demandas aprovadas LIVRES do órgão (sem DFD e sem processo), do ano
   * passado em diante, por exercício. `incluir`: conta esta demanda mesmo
   * fora da faixa (a que acabou de ser aprovada).
   */
  async demandasLivres(orgaoId: string, incluir?: string | null): Promise<DemandasLivres> {
    if (!ehUuid(orgaoId)) return { total: 0, por_ano: [] };
    const linhas: Array<{ ano: number; n: number }> = await this.ds.query(
      `SELECT d.ano_referencia::int AS ano, count(*)::int AS n FROM demandas d
        WHERE d.orgao_id::text = $1 AND d.status::text = ANY($2::text[])
          AND (d.ano_referencia >= $3 OR d.id::text = $4)
          AND NOT EXISTS (SELECT 1 FROM dfds_consolidados_demandas fd WHERE fd.demanda_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM licitacoes l WHERE l.demanda_id = d.id)
        GROUP BY 1 ORDER BY 1`,
      [orgaoId, STATUS_PARA_DFD, anoMinimoDaPendencia(anoDeBrasilia()), incluir ?? ''],
    );
    const por_ano = linhas.map((l) => ({ ano: Number(l.ano), n: Number(l.n) }));
    return { total: por_ano.reduce((t, a) => t + a.n, 0), por_ano };
  }

  /**
   * Para quem consulta (menu "DFD consolidado (N)"): só quem monta o DFD vê
   * o número; os demais, zero (nem a consulta às demandas é feita).
   */
  async resumo(ator: Ator | null | undefined, orgaoId: string) {
    const pode_montar = await this.planejamento.podeMontarDfd(ator, orgaoId);
    if (!pode_montar) return { pode_montar, demandas_livres: 0, por_ano: [] as DemandasLivres['por_ano'], destino: null as string | null };
    const livres = await this.demandasLivres(orgaoId);
    return { pode_montar, demandas_livres: livres.total, por_ano: livres.por_ano, destino: livres.total ? linkDaPendencia(livres, anoDeBrasilia()) : null };
  }

  /** Pendência da caixa "Para mim" (null: não monta DFD ou nada livre). Nunca derruba a caixa. */
  async pendenciaDaCaixa(ator: Ator | null | undefined, orgaoId: string) {
    try {
      if (!(await this.planejamento.podeMontarDfd(ator, orgaoId))) return null;
      return pendenciaDaCaixa(await this.demandasLivres(orgaoId), anoDeBrasilia());
    } catch (e: any) {
      this.logger.warn(`Pendência do DFD não calculada: ${e?.message ?? e}`);
      return null;
    }
  }

  /**
   * AVISO a quem monta o DFD, na aprovação da demanda. Não repete ninguém,
   * não avisa quem aprovou e agrupa aprovações seguidas (`decidirAviso`).
   * Devolve se quem pediu a demanda já recebeu por aqui (então o aviso ao
   * requisitante não sai de novo). Best-effort: nunca derruba a aprovação.
   */
  async avisarDemandaAprovada(d: DemandaAprovadaAviso, aprovadorId: string | null): Promise<{ avisados: string[]; requisitanteIncluido: boolean }> {
    const anterior = this.filas.get(d.orgao_id) ?? Promise.resolve();
    const atual = anterior.catch(() => undefined).then(() => this.avisar(d, aprovadorId));
    this.filas.set(d.orgao_id, atual);
    try {
      return await atual;
    } catch (e: any) {
      this.logger.warn(`Aviso ao planejamento não enviado: ${e?.message ?? e}`);
      return { avisados: [], requisitanteIncluido: false };
    } finally {
      if (this.filas.get(d.orgao_id) === atual) this.filas.delete(d.orgao_id);
    }
  }

  private async avisar(d: DemandaAprovadaAviso, aprovadorId: string | null): Promise<{ avisados: string[]; requisitanteIncluido: boolean }> {
    if (!this.notificacoes || !ehUuid(d.orgao_id)) return { avisados: [], requisitanteIncluido: false };
    const regra = (await this.planejamento.vigente(d.orgao_id)).responsavel_dfd;
    const todos = await this.planejamento.destinatarios(d.orgao_id, regra, 'MONTAR');
    const { para, requisitanteIncluido } = destinatariosDoAviso<DestinatarioAviso>(todos, { aprovadorId, requisitanteId: d.criado_por_id ?? null });
    // Ninguém do planejamento cadastrado (nem administrador): o sino do órgão
    const alvos: DestinatarioAviso[] = para.length ? para : todos.length || aprovadorId === d.orgao_id ? [] : [{ id: d.orgao_id }];
    if (!alvos.length) return { avisados: [], requisitanteIncluido: false };

    const livres = await this.demandasLivres(d.orgao_id, d.id);
    const link = linkDaPendencia(livres, anoDeBrasilia());
    const { titulo, mensagem } = textoAvisoPlanejamento({ objeto: d.descricao_sucinta_objeto, setor: d.unidade_requisitante, total: livres.total });
    const metadata = { whatsapp_url: `${process.env.APP_URL || 'https://portaldcp.com.br'}${link}`, demandas_livres: livres.total };
    const avisados: string[] = [];
    for (const u of alvos) {
      try {
        const [ant] = await this.ds.query(
          `SELECT id::text AS id, lida, created_at FROM notificacoes
            WHERE orgao_id::text = $1 AND usuario_id::text = $2 AND entidade_tipo = $3
            ORDER BY created_at DESC LIMIT 1`,
          [d.orgao_id, u.id, ENTIDADE_AVISO_DFD],
        );
        if (decidirAviso(ant) === 'ATUALIZAR') {
          // mesma pendência, ainda não lida: só o total novo (sem outro e-mail/WhatsApp)
          await this.ds.query(
            `UPDATE notificacoes SET titulo = $2, mensagem = $3, link = $4, metadata = $5::jsonb, entidade_id = $6, updated_at = now() WHERE id::text = $1`,
            [ant.id, titulo, mensagem, link, JSON.stringify(metadata), d.id],
          );
        } else {
          await this.notificacoes.criar({
            orgao_id: d.orgao_id,
            usuario_id: u.id,
            usuario_email: u.email,
            usuario_telefone: u.telefone,
            tipo: TipoNotificacao.SISTEMA,
            titulo,
            mensagem,
            entidade_tipo: ENTIDADE_AVISO_DFD,
            entidade_id: d.id,
            link,
            metadata,
            enviar_email: u.id !== d.orgao_id,
          });
        }
        avisados.push(u.id);
      } catch (e: any) {
        this.logger.warn(`Aviso ao planejamento (${u.id}) não enviado: ${e?.message ?? e}`);
      }
    }
    return { avisados, requisitanteIncluido: requisitanteIncluido && avisados.includes(d.criado_por_id ?? '') };
  }
}
