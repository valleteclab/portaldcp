import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService } from '../audit-log.service';
import { DEFINICOES_RASCUNHO, PecaRascunho } from './rascunho-ia-regras';
import { RascunhoIaFaseInterna } from './rascunho-ia.entity';

export type AutorRevisao = { id: string | null; nome: string | null };

/**
 * Meta DISCRETA do rascunho da IA que entrou na peça — em
 * `dados_estruturados._ia_rascunho`: chave interna (`_…`), fora do texto, da
 * impressão da peça (não "despronta" nada) e do PDF oficial.
 */
export interface MetaIaRascunho {
  rascunho_id: string;
  origem: 'IA';
  modelo_ia: string | null;
  gerado_em: string | null;
  disparo: string;
  aceito_por_id: string | null;
  aceito_por_nome: string | null;
  aceito_em: string;
  secoes: string[];
  revisado_por_id?: string | null;
  revisado_por_nome?: string | null;
  revisado_em?: string | null;
  revisado_documento_id?: string | null;
}

/**
 * Peças em que o texto aceito não fica guardado numa peça antes da emissão
 * (vai para o formulário da tela): vale o último rascunho ACEITO. Nas peças
 * por seção (DFD, ETP, TR) e no despacho (AA), só a meta da peça conta — o
 * aceite que não preencheu nada não vira "revisado".
 */
const PECAS_SEM_META = new Set<PecaRascunho>(['PJ', 'MCI', 'REGISTRO', 'TRAMITACAO']);

const dataHora = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * REVISÃO HUMANA DO RASCUNHO DA IA (F4a). Chamado por quem EMITE a peça
 * (gerar DFD/ETP/TR, gerar o despacho, emitir o parecer, manifestar o
 * controle interno, registrar o despacho da etapa, enviar o processo):
 * se a peça veio de um rascunho da IA aceito, registra QUEM revisou (usuário
 * do JWT) — no histórico (IA_REVISADA_POR), no rascunho e, de forma
 * discreta, nos metadados da peça. Sem rascunho da IA: não faz nada.
 *
 * Sem dependência das telas (elas é que chamam aqui) e sempre DEPOIS do ato
 * (fora de qualquer transação): falha aqui nunca derruba a emissão.
 */
@Injectable()
export class RevisaoIaService {
  private readonly logger = new Logger(RevisaoIaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(RascunhoIaFaseInterna) private readonly repo: Repository<RascunhoIaFaseInterna>,
    private readonly auditLog: AuditLogService,
  ) {}

  static meta(r: RascunhoIaFaseInterna, autor: AutorRevisao, secoes: string[]): MetaIaRascunho {
    return {
      rascunho_id: r.id,
      origem: 'IA',
      modelo_ia: r.modelo_ia ?? null,
      gerado_em: r.gerado_em ? new Date(r.gerado_em).toISOString() : null,
      disparo: r.disparo,
      aceito_por_id: autor.id,
      aceito_por_nome: autor.nome,
      aceito_em: new Date().toISOString(),
      secoes,
    };
  }

  /** Grava a meta na peça (SQL direto: só a chave interna; não mexe no texto nem dispara nada). */
  async gravarMetaNaPeca(documentoId: string, meta: MetaIaRascunho): Promise<void> {
    await this.ds.query(
      `UPDATE documentos_fase_interna
          SET dados_estruturados = jsonb_set(COALESCE(dados_estruturados, '{}'::jsonb), '{_ia_rascunho}', $2::jsonb, true)
        WHERE id::text = $1`,
      [documentoId, JSON.stringify(meta)],
    );
  }

  /**
   * A peça foi emitida. `documentoId`: a peça emitida (a meta dela diz se veio
   * da IA). Sem meta na peça, vale o último rascunho ACEITO ainda não revisado
   * da peça/etapa (parecer, controle interno, despacho da etapa, envio).
   */
  async registrarNaEmissao(
    licitacaoId: string,
    peca: PecaRascunho,
    opcoes: { documentoId?: string | null; etapa?: string | null; autor: AutorRevisao; ato?: string },
  ): Promise<boolean> {
    try {
      let meta: MetaIaRascunho | null = null;
      if (opcoes.documentoId) {
        const [d] = await this.ds.query(`SELECT dados_estruturados->'_ia_rascunho' AS meta FROM documentos_fase_interna WHERE id::text = $1 AND licitacao_id::text = $2`, [
          opcoes.documentoId,
          licitacaoId,
        ]);
        meta = d?.meta && typeof d.meta === 'object' ? (d.meta as MetaIaRascunho) : null;
        // Já registrada para ESTA versão da peça (gerar de novo a mesma versão não repete)
        if (meta?.revisado_documento_id === opcoes.documentoId) return false;
      }
      let rascunho: RascunhoIaFaseInterna | null = null;
      if (meta?.rascunho_id) {
        rascunho = await this.repo.findOne({ where: { id: meta.rascunho_id, licitacao_id: licitacaoId } });
      } else if (PECAS_SEM_META.has(peca)) {
        rascunho = await this.repo.findOne({
          where: {
            licitacao_id: licitacaoId,
            peca,
            status: 'ACEITO',
            revisado_em: IsNull(),
            ...(opcoes.etapa ? { etapa: opcoes.etapa } : {}),
            // Despacho de envio: só o aceito agora há pouco (o diálogo de envio que ficou sem enviar não conta depois)
            ...(peca === 'TRAMITACAO' ? { decidido_em: MoreThan(new Date(Date.now() - 2 * 3_600_000)) } : {}),
          },
          order: { decidido_em: 'DESC' },
        });
      }
      if (!rascunho && !meta) return false;
      const agora = new Date();
      if (rascunho) {
        await this.repo.update(rascunho.id, {
          revisado_por_id: opcoes.autor.id,
          revisado_por_nome: opcoes.autor.nome,
          revisado_em: agora,
          documento_id: opcoes.documentoId ?? rascunho.documento_id ?? null,
        });
      }
      if (opcoes.documentoId) {
        const base: MetaIaRascunho = meta ?? RevisaoIaService.meta(rascunho!, { id: rascunho!.decidido_por_id, nome: rascunho!.decidido_por_nome }, rascunho!.secoes_aplicadas ?? Object.keys(rascunho!.secoes ?? {}));
        if (!meta && rascunho?.decidido_em) base.aceito_em = new Date(rascunho.decidido_em).toISOString();
        await this.gravarMetaNaPeca(opcoes.documentoId, {
          ...base,
          revisado_por_id: opcoes.autor.id,
          revisado_por_nome: opcoes.autor.nome,
          revisado_em: agora.toISOString(),
          revisado_documento_id: opcoes.documentoId,
        });
      }
      const titulo = DEFINICOES_RASCUNHO[peca]?.titulo ?? peca;
      const modelo = rascunho?.modelo_ia ?? meta?.modelo_ia ?? null;
      const geradoEm = rascunho?.gerado_em ?? meta?.gerado_em ?? null;
      await this.auditLog
        .log({
          licitacao_id: licitacaoId,
          documento_id: opcoes.documentoId ?? undefined,
          acao: AcaoLogFaseInterna.IA_REVISADA_POR,
          descricao: `${titulo} ${opcoes.ato ?? 'emitido'} a partir do rascunho da IA (${[modelo ? `modelo ${modelo}` : null, `gerado em ${dataHora(geradoEm)}`].filter(Boolean).join(', ')}) — revisado por ${opcoes.autor.nome ?? 'usuário'}`,
          dados_depois: {
            rascunho_id: rascunho?.id ?? meta?.rascunho_id ?? null,
            peca,
            etapa: opcoes.etapa ?? rascunho?.etapa ?? null,
            modelo_ia: modelo,
            gerado_em: geradoEm,
            revisado_por_id: opcoes.autor.id,
            revisado_por_nome: opcoes.autor.nome,
            documento_id: opcoes.documentoId ?? null,
          },
          contexto: { usuario_id: opcoes.autor.id ?? undefined, usuario_nome: opcoes.autor.nome ?? undefined },
        })
        .catch(() => undefined);
      return true;
    } catch (e: any) {
      this.logger.warn(`Revisão do rascunho da IA não registrada (${peca}, processo ${licitacaoId}): ${e?.message ?? e}`);
      return false;
    }
  }
}
