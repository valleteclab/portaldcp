import { interessadosDaLicitacaoSql } from './publicacao.sql';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { calendarioDoOrgao } from '../common/prazos/calendario';
import { fimDoPrazoEmDiasUteis } from '../common/prazos/dias-uteis';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PublicacaoEventos } from './publicacao-eventos';
import { ExtincaoLicitacao, ManifestacaoExtincao, StatusExtincao, TipoExtincao } from './publicacao.entities';
import { formatarDataBrasilia } from './regras-publicacao';

export const PRAZO_MANIFESTACAO_EXTINCAO_PADRAO = 3;
export const TAMANHO_MINIMO_MOTIVO_EXTINCAO = 10;

/**
 * ============================================================================
 * REVOGAÇÃO / ANULAÇÃO EM DOIS TEMPOS (Lei 14.133/2021, art. 71 §3º — E7a)
 * ============================================================================
 *
 * "Nos casos de anulação e revogação, deverá ser assegurada a prévia
 * manifestação dos interessados."
 *  1. INTENCAO_REVOGAR / INTENCAO_ANULAR (ato da máquina, sem mudar fase):
 *     motivo, prazo de manifestação em dias úteis do calendário do órgão
 *     (parâmetro `prazo_manifestacao_extincao_dias_uteis`, padrão 3) e aviso
 *     a todos os licitantes;
 *  2. licitantes manifestam-se no prazo (uma manifestação por licitante,
 *     editável até o fim do prazo);
 *  3. REVOGAR / ANULAR (PUT /licitacoes/:id/revogar|anular) só depois do
 *     prazo (pré-condição `manifestacaoPreviaAssegurada`); o ato fecha a
 *     intenção (CONCLUIDA) e as manifestações ficam no processo.
 * Sem licitantes (nenhuma proposta), não há interessados a ouvir: o ato é
 * direto. A Administração pode desistir (cancelar a intenção).
 */
@Injectable()
export class ExtincaoService {
  private readonly logger = new Logger(ExtincaoService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly eventos: PublicacaoEventos,
    private readonly notificacoes: NotificacoesService,
  ) {}

  private async prazoPadrao(orgaoId: string | null): Promise<number> {
    const [p] = await this.dataSource.query(
      `SELECT prazo_manifestacao_extincao_dias_uteis AS dias FROM parametros_licitacao
        WHERE orgao_id::text = $1 OR orgao_id IS NULL ORDER BY (orgao_id IS NULL) LIMIT 1`,
      [orgaoId ?? '00000000-0000-0000-0000-000000000000'],
    ).catch(() => []);
    const n = Number(p?.dias);
    return n > 0 ? n : PRAZO_MANIFESTACAO_EXTINCAO_PADRAO;
  }

  async abrirIntencao(
    licitacaoId: string,
    pedido: { tipo: string; motivo: string; prazo_dias_uteis?: number | string | null },
    ator: AtorTransicao,
  ): Promise<ExtincaoLicitacao> {
    const tipo = String(pedido.tipo ?? '').toUpperCase();
    if (tipo !== TipoExtincao.REVOGAR && tipo !== TipoExtincao.ANULAR) {
      throw new BadRequestException('Tipo deve ser REVOGAR ou ANULAR.');
    }
    const motivo = String(pedido.motivo ?? '').trim();
    if (motivo.length < TAMANHO_MINIMO_MOTIVO_EXTINCAO) {
      throw new BadRequestException(`Motivo obrigatório (mínimo ${TAMANHO_MINIMO_MOTIVO_EXTINCAO} caracteres) — fundamente a ${tipo === 'ANULAR' ? 'anulação' : 'revogação'}.`);
    }
    const lic = await this.dataSource.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    let dias = pedido.prazo_dias_uteis != null && pedido.prazo_dias_uteis !== '' ? Number(pedido.prazo_dias_uteis) : await this.prazoPadrao(lic.orgao_id);
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) throw new BadRequestException('Prazo de manifestação: de 1 a 30 dias úteis.');
    const agora = new Date();
    const prazoFim = fimDoPrazoEmDiasUteis(agora, dias, calendarioDoOrgao(lic.orgao_id));
    const id = randomUUID();
    let criada: ExtincaoLicitacao | null = null;
    let licitantes: Array<{ fornecedor_id: string; email: string | null }> = [];
    await this.transicoes.executar(
      licitacaoId,
      tipo === TipoExtincao.ANULAR ? AtoLicitacao.INTENCAO_ANULAR : AtoLicitacao.INTENCAO_REVOGAR,
      {
        ator,
        motivo,
        dados: { prazo_dias_uteis: dias, prazo_fim: prazoFim.toISOString() },
        registro: { extincao_id: id },
        aplicar: async (_l, m) => {
          // licitantes com proposta e, no credenciamento, os inscritos (E7b)
          licitantes = await interessadosDaLicitacaoSql(m, licitacaoId);
          const repo = m.getRepository(ExtincaoLicitacao);
          criada = await repo.save(
            repo.create({
              id,
              licitacao_id: licitacaoId,
              tipo: tipo as TipoExtincao,
              status: StatusExtincao.ABERTA,
              motivo,
              prazo_dias_uteis: dias,
              aberta_em: agora,
              prazo_fim: prazoFim,
              licitantes_notificados: licitantes.length,
              ator_tipo: ator.tipo,
              ator_id: ator.id,
            }),
          );
        },
      },
    );
    const e = criada! as ExtincaoLicitacao;
    this.avisar(lic, e, licitantes).catch(() => undefined);
    this.eventos.emitir({
      tipo: 'INTENCAO_EXTINCAO_ABERTA',
      licitacao_id: licitacaoId,
      orgao_id: lic.orgao_id ?? null,
      extincao_id: e.id,
      extincao: e.tipo,
      motivo,
      prazo_fim: prazoFim,
      ocorrido_em: new Date(),
    });
    return e;
  }

  async cancelarIntencao(licitacaoId: string, motivo: string, ator: AtorTransicao): Promise<ExtincaoLicitacao> {
    const e = await this.aberta(licitacaoId);
    if (!e) throw new NotFoundException('Não há intenção de revogar/anular aberta.');
    if (String(motivo ?? '').trim().length < TAMANHO_MINIMO_MOTIVO_EXTINCAO) {
      throw new BadRequestException(`Informe o motivo da desistência (mínimo ${TAMANHO_MINIMO_MOTIVO_EXTINCAO} caracteres).`);
    }
    e.status = StatusExtincao.CANCELADA;
    e.motivo_cancelamento = `${String(motivo).trim()} (${ator.tipo}:${ator.id ?? '-'})`;
    e.concluida_em = new Date();
    const salva = await this.dataSource.getRepository(ExtincaoLicitacao).save(e);
    const [l] = await this.dataSource.query(`SELECT orgao_id::text AS orgao_id FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
    this.eventos.emitir({
      tipo: 'INTENCAO_EXTINCAO_CANCELADA',
      licitacao_id: licitacaoId,
      orgao_id: l?.orgao_id ?? null,
      extincao_id: e.id,
      extincao: e.tipo,
      motivo: e.motivo_cancelamento ?? '',
      prazo_fim: e.prazo_fim,
      ocorrido_em: new Date(),
    });
    return salva;
  }

  async manifestar(licitacaoId: string, fornecedorId: string, texto: string): Promise<ManifestacaoExtincao> {
    const t = String(texto ?? '').trim();
    if (t.length < TAMANHO_MINIMO_MOTIVO_EXTINCAO) throw new BadRequestException('Manifestação: mínimo 10 caracteres.');
    const e = await this.aberta(licitacaoId);
    if (!e) throw new ConflictException('Não há prazo de manifestação aberto nesta licitação.');
    if (Date.now() > new Date(e.prazo_fim).getTime()) {
      throw new ConflictException(`O prazo de manifestação terminou em ${formatarDataBrasilia(new Date(e.prazo_fim))}.`);
    }
    const p = (await interessadosDaLicitacaoSql(this.dataSource.manager, licitacaoId)).find((x) => x.fornecedor_id === String(fornecedorId));
    if (!p) throw new ForbiddenException('Somente os interessados (licitantes com proposta ou inscritos no credenciamento) se manifestam.');
    const repo = this.dataSource.getRepository(ManifestacaoExtincao);
    const existente = await repo.findOne({ where: { extincao_id: e.id, fornecedor_id: fornecedorId } });
    if (existente) {
      existente.texto = t;
      return repo.save(existente);
    }
    return repo.save(
      repo.create({ extincao_id: e.id, licitacao_id: licitacaoId, fornecedor_id: fornecedorId, fornecedor_nome: p.razao_social ?? null, texto: t }),
    );
  }

  async aberta(licitacaoId: string): Promise<ExtincaoLicitacao | null> {
    return this.dataSource.getRepository(ExtincaoLicitacao).findOne({
      where: { licitacao_id: licitacaoId, status: StatusExtincao.ABERTA },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Visão: órgão dono → todas as intenções com as manifestações; licitante →
   * intenções + a própria manifestação; público → só as intenções (motivo,
   * prazo, situação).
   */
  async consultar(licitacaoId: string, visao: { tipo: 'ORGAO' } | { tipo: 'FORNECEDOR'; fornecedorId: string } | { tipo: 'PUBLICO' }) {
    const intencoes = await this.dataSource.getRepository(ExtincaoLicitacao).find({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' },
    });
    const manifestacoes = intencoes.length
      ? await this.dataSource.getRepository(ManifestacaoExtincao).find({ where: { licitacao_id: licitacaoId }, order: { created_at: 'ASC' } })
      : [];
    const agora = Date.now();
    return intencoes.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      status: e.status,
      motivo: e.motivo,
      prazo_dias_uteis: e.prazo_dias_uteis,
      aberta_em: e.aberta_em,
      prazo_fim: e.prazo_fim,
      prazo_aberto: e.status === StatusExtincao.ABERTA && agora <= new Date(e.prazo_fim).getTime(),
      pode_praticar_ato: e.status === StatusExtincao.ABERTA && agora > new Date(e.prazo_fim).getTime(),
      licitantes_notificados: e.licitantes_notificados,
      concluida_em: e.concluida_em,
      motivo_cancelamento: e.motivo_cancelamento,
      manifestacoes:
        visao.tipo === 'ORGAO'
          ? manifestacoes.filter((m) => m.extincao_id === e.id)
          : visao.tipo === 'FORNECEDOR'
            ? manifestacoes.filter((m) => m.extincao_id === e.id && m.fornecedor_id === visao.fornecedorId)
            : undefined,
      total_manifestacoes: visao.tipo === 'PUBLICO' ? undefined : manifestacoes.filter((m) => m.extincao_id === e.id).length,
    }));
  }

  private async avisar(lic: Licitacao, e: ExtincaoLicitacao, licitantes: Array<{ fornecedor_id: string; email: string | null }>) {
    if (!lic.orgao_id) return;
    const ato = e.tipo === TipoExtincao.ANULAR ? 'anular' : 'revogar';
    for (const l of licitantes) {
      try {
        await this.notificacoes.criar({
          orgao_id: lic.orgao_id,
          usuario_id: l.fornecedor_id,
          usuario_email: l.email ?? undefined,
          tipo: TipoNotificacao.ALERTA,
          titulo: `Intenção de ${ato} a licitação ${lic.numero_processo}`,
          mensagem:
            `A Administração pretende ${ato} a licitação ${lic.numero_processo}. Motivo: ${e.motivo}\n` +
            `Você pode se manifestar até ${formatarDataBrasilia(new Date(e.prazo_fim))} (Lei 14.133/2021, art. 71, §3º).`,
          prioridade: PrioridadeNotificacao.ALTA,
          entidade_tipo: 'licitacao',
          entidade_id: lic.id,
          link: `/fornecedor/licitacoes/${lic.id}`,
          enviar_email: !!l.email,
          metadata: { origem: 'intencao-extincao', extincao_id: e.id, tipo: e.tipo },
        });
      } catch (err: any) {
        this.logger.warn(`Aviso de intenção de ${ato} não enviado ao fornecedor ${l.fornecedor_id}: ${err?.message ?? err}`);
      }
    }
  }
}
