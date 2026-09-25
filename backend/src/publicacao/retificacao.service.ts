import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { StatusDocumento, TipoDocumentoLicitacao } from '../documentos/entities/documento-licitacao.entity';
import { Licitacao, SituacaoLicitacao } from '../licitacoes/entities/licitacao.entity';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrioridadeNotificacao, TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { formatarRelogioBrasilia } from '../impugnacoes/prazo-manifestacao.util';
import { ArquivoEnviado, EditalService, motivoArquivoEditalInvalido } from './edital.service';
import { PublicacaoEventos } from './publicacao-eventos';
import { RetificacaoEdital } from './publicacao.entities';
import { editalVigenteSql } from './publicacao.sql';
import {
  CAMPOS_CRONOGRAMA_EDITAL,
  CAMPOS_EDITAL_RETIFICAVEIS,
  fimDoRecebimento,
  formatarDataBrasilia,
  normalizarNaturezaObjeto,
} from './regras-publicacao';

export interface PedidoRetificacao {
  motivo: string;
  alteracoes: string;
  afeta_propostas: boolean | string;
  justificativa_nao_afeta?: string | null;
  /** Novas datas (ISO). Obrigatórias quando afeta as propostas. */
  cronograma?: Record<string, string | null> | null;
  /** Campos do edital alterados (lista fechada CAMPOS_EDITAL_RETIFICAVEIS). */
  campos?: Record<string, any> | null;
}

function paraBool(v: any): boolean | null {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

/**
 * ============================================================================
 * RETIFICAÇÃO / REPUBLICAÇÃO DO EDITAL (Lei 14.133/2021, art. 55 §1º — E7a)
 * ============================================================================
 *
 * "Eventuais modificações no edital implicarão nova divulgação na mesma forma
 * de sua divulgação inicial, além do cumprimento dos mesmos prazos dos atos e
 * procedimentos originais, exceto quando a alteração não comprometer a
 * formulação das propostas."
 *
 * Ato RETIFICAR_EDITAL (máquina de estados), numa transação:
 *  1. nova versão do edital (EDITAL_RETIFICADO, versão n+1, PUBLICADA; a
 *     anterior SUBSTITUIDO — histórico);
 *  2. AFETA as propostas → novo cronograma conferido pelo art. 55 a partir
 *     da data da retificação; propostas já enviadas ficam MANTIDAS com
 *     `requer_confirmacao` (o licitante confirma ou altera até o novo fim do
 *     recebimento; sem isso, sai da disputa); a sessão não abre antes;
 *     NÃO afeta → justificativa; datas mantidas (ou só adiadas);
 *  3. impugnações acolhidas com `altera_edital` pendentes ficam atendidas;
 *  4. `retificacoes_edital` com o antes/depois.
 * Depois do commit: aviso aos licitantes e evento EDITAL_RETIFICADO (o PNCP
 * — E7b — retifica a compra com o novo arquivo).
 */
@Injectable()
export class RetificacaoService {
  private readonly logger = new Logger(RetificacaoService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly edital: EditalService,
    private readonly eventos: PublicacaoEventos,
    private readonly notificacoes: NotificacoesService,
  ) {}

  async retificar(
    licitacaoId: string,
    pedido: PedidoRetificacao,
    arquivo: ArquivoEnviado | null | undefined,
    ator: AtorTransicao,
    autorNome?: string | null,
  ): Promise<{ retificacao: RetificacaoEdital; licitacao: Licitacao }> {
    const erroArquivo = motivoArquivoEditalInvalido(arquivo);
    if (erroArquivo) throw new BadRequestException(`Nova versão do edital: ${erroArquivo}`);
    const afeta = paraBool(pedido.afeta_propostas);
    const campos: Record<string, any> = {};
    for (const [k, v] of Object.entries(pedido.campos ?? {})) {
      if (!(CAMPOS_EDITAL_RETIFICAVEIS as readonly string[]).includes(k)) {
        throw new BadRequestException(`Campo "${k}" não se altera por retificação (itens/lotes: revogue e republique).`);
      }
      campos[k] = v;
    }
    if (campos.natureza_objeto !== undefined) {
      try {
        campos.natureza_objeto = normalizarNaturezaObjeto(campos.natureza_objeto);
      } catch (motivo) {
        throw new BadRequestException(String(motivo));
      }
    }
    const cronograma: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(pedido.cronograma ?? {})) {
      if (!(CAMPOS_CRONOGRAMA_EDITAL as readonly string[]).includes(k) || k === 'data_publicacao_edital') continue;
      if (v) {
        const d = new Date(v);
        if (isNaN(d.getTime())) throw new BadRequestException(`Data inválida: ${k}`);
        cronograma[k] = d.toISOString();
      }
    }
    const retificacaoId = randomUUID();
    const agora = new Date();
    let salva: RetificacaoEdital | null = null;
    let notificar: Array<{ fornecedor_id: string; email: string | null; requer: boolean }> = [];

    const licitacao = await this.transicoes.executar(licitacaoId, AtoLicitacao.RETIFICAR_EDITAL, {
      ator,
      motivo: pedido.motivo,
      dados: {
        afeta_propostas: afeta,
        alteracoes: pedido.alteracoes,
        justificativa_nao_afeta: pedido.justificativa_nao_afeta ?? null,
        cronograma,
        campos,
      },
      registro: { retificacao_id: retificacaoId },
      aplicar: async (lic, m) => {
        // cronograma/campos ANTES do efeito já foram aplicados em `lic`; o
        // retrato "anterior" vem do banco (a linha ainda não foi salva)
        const [antes] = await m.query(`SELECT * FROM licitacoes WHERE id = $1`, [licitacaoId]);
        const cronogramaAnterior: Record<string, string | null> = {};
        const cronogramaNovo: Record<string, string | null> = {};
        for (const c of CAMPOS_CRONOGRAMA_EDITAL) {
          cronogramaAnterior[c] = antes?.[c] ? new Date(antes[c]).toISOString() : null;
          cronogramaNovo[c] = (lic as any)[c] ? new Date((lic as any)[c]).toISOString() : null;
        }
        const alterados: Record<string, { de: any; para: any }> = {};
        for (const [k, v] of Object.entries(campos)) {
          if (String(antes?.[k] ?? '') !== String(v ?? '')) alterados[k] = { de: antes?.[k] ?? null, para: v };
        }

        // 1. nova versão do edital
        const anterior = await editalVigenteSql(m, licitacaoId);
        const versao = (anterior?.origem === 'DOCUMENTOS_LICITACAO' ? anterior.versao : 1) + 1;
        if (anterior?.origem === 'DOCUMENTOS_LICITACAO') {
          await m.query(`UPDATE documentos_licitacao SET status = 'SUBSTITUIDO', updated_at = NOW() WHERE id::text = $1`, [
            anterior.documento_id,
          ]);
        }
        const [{ n }] = await m.query(`SELECT COUNT(*)::int AS n FROM retificacoes_edital WHERE licitacao_id = $1`, [licitacaoId]);
        const numero = Number(n) + 1;
        const doc = await this.edital.gravarVersao(m, licitacaoId, arquivo!, {
          tipo: TipoDocumentoLicitacao.EDITAL_RETIFICADO,
          versao,
          anteriorId: anterior?.origem === 'DOCUMENTOS_LICITACAO' ? anterior.documento_id : null,
          status: StatusDocumento.PUBLICADO,
          titulo: `Edital retificado nº ${numero} — ${lic.numero_processo}`,
          descricao: pedido.alteracoes,
          autor: { id: ator.id, nome: autorNome ?? null },
        });

        // 2. impugnações acolhidas atendidas
        const imps: Array<{ id: string }> = await m.query(
          `UPDATE impugnacoes SET retificacao_id = $2
            WHERE licitacao_id::text = $1 AND altera_edital = true AND retificacao_id IS NULL
              AND status IN ('DEFERIDA','PARCIALMENTE_DEFERIDA')
            RETURNING id::text AS id`,
          [licitacaoId, retificacaoId],
        );
        const impIds = (Array.isArray((imps as any)?.[0]) ? (imps as any)[0] : imps).map((r: any) => r.id);

        // 3. propostas: confirmar (afeta) — mantidas, mas sinalizadas
        let sinalizadas = 0;
        if (afeta) {
          const r = await m.query(
            `UPDATE propostas SET requer_confirmacao = true, retificacao_pendente_id = $2, confirmada_em = NULL, updated_at = NOW()
              WHERE licitacao_id::text = $1 AND status::text NOT IN ('RASCUNHO','DESCLASSIFICADA','CANCELADA')
              RETURNING fornecedor_id::text AS fornecedor_id`,
            [licitacaoId, retificacaoId],
          );
          const linhas = Array.isArray(r?.[0]) ? r[0] : r;
          sinalizadas = linhas.length;
        }
        notificar = await m.query(
          `SELECT p.fornecedor_id::text AS fornecedor_id, f.email, p.requer_confirmacao AS requer
             FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
            WHERE p.licitacao_id::text = $1 AND p.status::text NOT IN ('RASCUNHO','CANCELADA')`,
          [licitacaoId],
        );

        const repo = m.getRepository(RetificacaoEdital);
        salva = await repo.save(
          repo.create({
            id: retificacaoId,
            licitacao_id: licitacaoId,
            numero,
            motivo: String(pedido.motivo ?? '').trim(),
            alteracoes: String(pedido.alteracoes ?? '').trim(),
            afeta_propostas: !!afeta,
            justificativa_nao_afeta: afeta ? null : String(pedido.justificativa_nao_afeta ?? '').trim() || null,
            documento_id: doc.id,
            documento_anterior_id: anterior?.documento_id ?? null,
            versao_edital: versao,
            hash_edital: doc.hash_arquivo,
            data_divulgacao: agora,
            cronograma_anterior: cronogramaAnterior,
            cronograma_novo: cronogramaNovo,
            campos_alterados: Object.keys(alterados).length ? alterados : null,
            impugnacao_ids: impIds.length ? impIds : null,
            propostas_notificadas: sinalizadas,
            ator_tipo: ator.tipo,
            ator_id: ator.id,
          }),
        );
      },
    });

    const r = salva! as RetificacaoEdital;
    this.avisarLicitantes(licitacao, r, notificar).catch(() => undefined);
    this.eventos.emitir({
      tipo: 'EDITAL_RETIFICADO',
      licitacao_id: licitacaoId,
      orgao_id: licitacao.orgao_id ?? null,
      retificacao_id: r.id,
      numero: r.numero,
      afeta_propostas: r.afeta_propostas,
      motivo: r.motivo,
      alteracoes: r.alteracoes,
      documento_id: r.documento_id,
      versao_edital: r.versao_edital,
      hash_edital: r.hash_edital,
      cronograma_novo: r.cronograma_novo,
      ocorrido_em: new Date(),
    });
    return { retificacao: r, licitacao };
  }

  async listar(licitacaoId: string): Promise<RetificacaoEdital[]> {
    return this.dataSource.getRepository(RetificacaoEdital).find({ where: { licitacao_id: licitacaoId }, order: { numero: 'ASC' } });
  }

  /**
   * Licitante confirma a proposta depois da retificação que afetou as
   * propostas (ou deixa para alterá-la — a alteração não dispensa a
   * confirmação). Só até o novo fim do recebimento.
   */
  async confirmarProposta(licitacaoId: string, fornecedorId: string): Promise<{ confirmada_em: Date }> {
    const lic = await this.dataSource.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (lic.situacao && lic.situacao !== SituacaoLicitacao.ATIVA) {
      throw new ConflictException(`Licitação ${lic.situacao.toLowerCase()} — não é possível confirmar a proposta agora.`);
    }
    const [p] = await this.dataSource.query(
      `SELECT id::text AS id, requer_confirmacao, status::text AS status FROM propostas
        WHERE licitacao_id::text = $1 AND fornecedor_id::text = $2`,
      [licitacaoId, fornecedorId],
    );
    if (!p) throw new NotFoundException('Você não tem proposta nesta licitação');
    if (!p.requer_confirmacao) throw new ConflictException('Sua proposta não aguarda confirmação.');
    if (['CANCELADA', 'DESCLASSIFICADA'].includes(p.status)) throw new ConflictException('Proposta fora da disputa.');
    const corte = fimDoRecebimento(lic);
    if (corte && Date.now() >= new Date(corte).getTime()) {
      throw new ConflictException(`O prazo para confirmar a proposta terminou em ${formatarDataBrasilia(new Date(corte))}.`);
    }
    const agora = new Date();
    await this.dataSource.query(
      `UPDATE propostas SET requer_confirmacao = false, confirmada_em = $2, updated_at = NOW() WHERE id::text = $1`,
      [p.id, agora],
    );
    return { confirmada_em: agora };
  }

  /** Situação do licitante: a proposta aguarda confirmação? Última retificação. */
  async situacaoDoLicitante(licitacaoId: string, fornecedorId: string) {
    const [p] = await this.dataSource.query(
      `SELECT id::text AS id, status::text AS status, requer_confirmacao, confirmada_em, retificacao_pendente_id::text AS retificacao_id
         FROM propostas WHERE licitacao_id::text = $1 AND fornecedor_id::text = $2`,
      [licitacaoId, fornecedorId],
    );
    const [lic] = await this.dataSource.query(
      `SELECT data_fim_acolhimento, data_abertura_sessao FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    const retificacoes = await this.listar(licitacaoId);
    const ultima = retificacoes[retificacoes.length - 1] ?? null;
    const corte = lic ? fimDoRecebimento(lic) : null;
    return {
      proposta_id: p?.id ?? null,
      status_proposta: p?.status ?? null,
      requer_confirmacao: !!p?.requer_confirmacao,
      confirmada_em: p?.confirmada_em ?? null,
      prazo_confirmacao: corte ? formatarRelogioBrasilia(new Date(corte)) : null,
      ultima_retificacao: ultima
        ? {
            id: ultima.id,
            numero: ultima.numero,
            motivo: ultima.motivo,
            alteracoes: ultima.alteracoes,
            afeta_propostas: ultima.afeta_propostas,
            data_divulgacao: ultima.data_divulgacao,
            documento_id: ultima.documento_id,
          }
        : null,
    };
  }

  private async avisarLicitantes(
    lic: Licitacao,
    r: RetificacaoEdital,
    licitantes: Array<{ fornecedor_id: string; email: string | null; requer: boolean }>,
  ): Promise<void> {
    if (!lic.orgao_id) return;
    for (const l of licitantes) {
      try {
        await this.notificacoes.criar({
          orgao_id: lic.orgao_id,
          usuario_id: l.fornecedor_id,
          usuario_email: l.email ?? undefined,
          tipo: TipoNotificacao.ALERTA,
          titulo: `Edital retificado — ${lic.numero_processo}`,
          mensagem:
            `O edital do processo ${lic.numero_processo} foi retificado (retificação nº ${r.numero}): ${r.alteracoes}\n` +
            (l.requer
              ? `A alteração afeta a formulação das propostas (art. 55, §1º, Lei 14.133/2021): CONFIRME ou altere sua proposta até o novo fim do recebimento — sem confirmação, ela não participa da disputa.`
              : `A alteração não afeta a formulação das propostas; as datas do certame foram mantidas.`),
          prioridade: l.requer ? PrioridadeNotificacao.ALTA : PrioridadeNotificacao.NORMAL,
          entidade_tipo: 'licitacao',
          entidade_id: lic.id,
          link: `/fornecedor/licitacoes/${lic.id}`,
          enviar_email: !!l.email,
          metadata: { origem: 'retificacao-edital', retificacao_id: r.id, requer_confirmacao: l.requer },
        });
      } catch (e: any) {
        this.logger.warn(`Aviso de retificação não enviado ao fornecedor ${l.fornecedor_id}: ${e?.message ?? e}`);
      }
    }
  }
}
