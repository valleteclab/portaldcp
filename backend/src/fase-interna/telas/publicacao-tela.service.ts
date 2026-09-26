import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Ator } from '../../auth/acesso/ator';
import { FaseLicitacao } from '../../licitacoes/entities/licitacao.entity';
import { confirmarDivulgacaoOficial } from '../../licitacoes/transicoes/divulgacao';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { TransicoesService } from '../../licitacoes/transicoes/transicoes.service';
import type { AtorTransicao } from '../../licitacoes/transicoes/transicoes.tipos';
import { modoDisputaDaDispensa } from '../../licitacoes/modo-disputa-dispensa';
import { pecaContaComoPronta } from '../peca-regras';
import { PecasFaseInternaService, type ArquivoRecebido } from '../pecas-fase-interna.service';
import { TarefasService } from '../tarefas/tarefas.service';

/** Situação de um canal de divulgação (quadro do aviso — mockup Conformidade). */
export interface CanalPublicacao {
  chave: 'PNCP' | 'SITIO' | 'DIARIO_OFICIAL' | 'PLATAFORMA';
  nome: string;
  situacao: string;
  ok: boolean;
  detalhe?: string | null;
}

const fmtDia = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const fmtDataHora = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * ETAPA 8 — PUBLICAÇÃO (fase interna, Entrega 5), ligada à divulgação que já
 * existe (Etapa A): o ato PUBLICAR (portão C) leva a AGUARDANDO_DIVULGACAO e a
 * confirmação do PNCP — ou, no órgão sem PNCP, o registro do Diário Oficial
 * (art. 176, par. único) — conclui a etapa e a tarefa. Aqui:
 *  - o QUADRO do aviso: modo da dispensa (com/sem lances), canais (PNCP, sítio
 *    oficial, Diário Oficial, plataforma) com a situação real de cada um e o
 *    aviso do controle interno (decisão 3: aparece antes de publicar, não
 *    bloqueia);
 *  - o REGISTRO no Diário Oficial do órgão como peça da publicação (PDO), que,
 *    no órgão sem PNCP e aguardando a divulgação, É a divulgação oficial
 *    (reaproveita `confirmarDivulgacaoOficial` da Etapa A).
 */
@Injectable()
export class PublicacaoTelaService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly pecas: PecasFaseInternaService,
    private readonly tarefas: TarefasService,
  ) {}

  private async lic(id: string) {
    const [l] = await this.ds.query(
      `SELECT l.id::text AS id, l.orgao_id::text AS orgao_id, l.fase::text AS fase, l.situacao::text AS situacao,
              l.modalidade::text AS modalidade, l.selecao_externa, l.dispensa_com_lances, l.numero_processo,
              l.data_publicacao_edital, l.data_divulgacao_oficial, l.meio_divulgacao_oficial, l.referencia_divulgacao_oficial,
              l.data_inicio_acolhimento, l.data_fim_acolhimento, l.data_abertura_sessao, l.dispensa_lances_inicio, l.dispensa_lances_fim,
              (COALESCE(o.pncp_vinculado, false) OR NULLIF(o.pncp_codigo_unidade::text, '') IS NOT NULL OR NULLIF(l.codigo_unidade_compradora::text, '') IS NOT NULL) AS integrado,
              o.nome AS orgao_nome
         FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id::text = $1`,
      [id],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    return l;
  }

  /** Quadro da publicação (tela da conformidade — etapa 8). `impedem`: achados que seguram o PUBLICAR. */
  async quadro(licitacaoId: string, opcoes: { impedem?: number } = {}) {
    const l = await this.lic(licitacaoId);
    const interna = ehFaseInterna(l.fase);
    const aguardando = l.fase === FaseLicitacao.AGUARDANDO_DIVULGACAO;
    const [cfg] = l.orgao_id
      ? await this.ds.query(`SELECT dispensa_com_lances, controle_interno_ativo FROM configuracoes_fase_interna WHERE orgao_id::text = $1`, [l.orgao_id])
      : [];
    const modo = modoDisputaDaDispensa(l, cfg?.dispensa_com_lances);
    const [compra] = await this.ds.query(
      `SELECT status::text AS status, numero_controle_pncp, erro_mensagem, erro_status_http, enviado_em
         FROM pncp_sync WHERE licitacao_id::text = $1 AND tipo::text = 'COMPRA' AND status::text <> 'EXCLUIDO'
        ORDER BY (chave_idempotencia IS NOT NULL) DESC, created_at DESC LIMIT 1`,
      [licitacaoId],
    );
    const registrosDo: any[] = await this.ds.query(
      `SELECT id::text AS id, versao, versao_atual, numero_peca, data_documento, dados_estruturados->'_diario_oficial' AS dados,
              caminho_arquivo IS NOT NULL AS anexada, folha_inicial, folha_final, created_at
         FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = 'PDO'
        ORDER BY versao DESC`,
      [licitacaoId],
    );
    const doVigente = registrosDo.find((r) => r.versao_atual) ?? null;
    const [mci] = await this.ds.query(
      `SELECT tipo::text AS tipo, status::text AS status, caminho_arquivo, arquivo_pdf_path, descricao, dados_estruturados
         FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = 'MCI' AND versao_atual = true LIMIT 1`,
      [licitacaoId],
    );
    const impedem = opcoes.impedem ?? 0;
    const confirmada = !interna && !aguardando;
    const erroPncp = !!compra && ['ERRO', 'ERRO_TEMPORARIO', 'ERRO_DEFINITIVO'].includes(compra.status);

    const canais: CanalPublicacao[] = [];
    // PNCP — a divulgação oficial (arts. 54 e 174)
    canais.push({
      chave: 'PNCP',
      nome: 'PNCP (API — aviso e anexos)',
      ok: confirmada && (l.meio_divulgacao_oficial === 'PNCP' || !!compra?.numero_controle_pncp),
      situacao: l.selecao_externa
        ? 'Divulgado pela plataforma de origem'
        : interna
          ? impedem
            ? 'Aguardando a conformidade'
            : 'Envio automático ao publicar'
          : aguardando
            ? !l.integrado
              ? 'Órgão sem integração — registre o Diário Oficial (art. 176)'
              : erroPncp
                ? `Recusado pelo PNCP${compra?.erro_status_http ? ` (HTTP ${compra.erro_status_http})` : ''} — corrija e reenvie`
                : 'Na fila de envio — aguardando a confirmação'
            : compra?.numero_controle_pncp
              ? `Publicado — nº ${compra.numero_controle_pncp}`
              : l.meio_divulgacao_oficial === 'DIARIO_OFICIAL'
                ? 'Sem PNCP — divulgação pelo Diário Oficial (art. 176)'
                : 'Publicado',
      detalhe: aguardando && erroPncp ? compra?.erro_mensagem ?? null : null,
    });
    // Sítio oficial — o portal público do Portal DCP mostra o processo divulgado
    canais.push({
      chave: 'SITIO',
      nome: 'Sítio oficial (portal público do órgão)',
      ok: confirmada,
      situacao: interna ? 'Publicado automaticamente com a confirmação' : aguardando ? 'Aguardando a confirmação do PNCP' : 'Publicado no portal público',
      detalhe: confirmada ? `/licitacoes/${licitacaoId}` : null,
    });
    // Diário Oficial do órgão — peça da publicação (PDO)
    const d = doVigente?.dados ?? null;
    canais.push({
      chave: 'DIARIO_OFICIAL',
      nome: 'Diário Oficial do órgão',
      ok: !!doVigente,
      situacao: doVigente
        ? `${doVigente.numero_peca ?? 'Registrado'} — ${fmtDia(d?.data_publicacao ? `${d.data_publicacao}T12:00:00-03:00` : doVigente.data_documento)}${doVigente.anexada ? ' (página anexada)' : ''}`
        : interna
          ? 'Registrar depois de publicar'
          : 'Pendente — registre o número, a data e a página',
      detalhe: d?.link ?? null,
    });
    // Plataforma de disputa (recebimento de propostas e, se houver, lances)
    const fim = l.data_fim_acolhimento ?? l.data_abertura_sessao;
    canais.push({
      chave: 'PLATAFORMA',
      nome: 'Portal DCP (propostas e disputa)',
      ok: confirmada,
      situacao: interna
        ? impedem
          ? 'Aguardando a conformidade'
          : 'Pronto'
        : aguardando
          ? 'Abre com a confirmação do PNCP'
          : `Propostas até ${fmtDataHora(fim)}${modo.aplica ? ` · ${modo.com_lances ? 'com etapa de lances' : 'sem lances'}` : ''}`,
    });

    return {
      estado: interna ? 'NAO_PUBLICADO' : aguardando ? 'AGUARDANDO' : l.selecao_externa ? 'EXTERNA' : 'CONFIRMADA',
      etapa8: {
        situacao: interna ? 'PENDENTE' : aguardando ? 'AGUARDANDO_CONFIRMACAO' : 'CONCLUIDA',
        texto: interna
          ? 'Publicar pratica o ato PUBLICAR (portão C) e envia o aviso ao PNCP.'
          : aguardando
            ? 'Aviso enviado — a etapa conclui quando o PNCP confirmar a publicação (o prazo corre dessa data).'
            : `Publicação confirmada em ${fmtDataHora(l.data_divulgacao_oficial)}${l.meio_divulgacao_oficial === 'DIARIO_OFICIAL' ? ' (Diário Oficial)' : ' (PNCP)'}.`,
      },
      integrado_pncp: !!l.integrado,
      data_ato_publicacao: l.data_publicacao_edital,
      data_divulgacao_oficial: l.data_divulgacao_oficial,
      meio_divulgacao_oficial: l.meio_divulgacao_oficial,
      referencia_divulgacao_oficial: l.referencia_divulgacao_oficial,
      modo_disputa: modo.aplica ? modo : null,
      canais,
      diario_oficial: {
        pode_registrar: !interna && !['REVOGADA', 'ANULADA'].includes(String(l.situacao ?? '')),
        confirma_divulgacao: aguardando && !l.integrado,
        registros: registrosDo.map((r) => ({
          id: r.id,
          versao: Number(r.versao) || 1,
          vigente: !!r.versao_atual,
          numero: r.numero_peca,
          data_publicacao: r.dados?.data_publicacao ?? null,
          pagina: r.dados?.pagina ?? null,
          link: r.dados?.link ?? null,
          anexada: !!r.anexada,
          folhas: r.folha_inicial ? (r.folha_final && r.folha_final !== r.folha_inicial ? `fls. ${r.folha_inicial}–${r.folha_final}` : `fl. ${r.folha_inicial}`) : null,
        })),
      },
      controle_interno: {
        ativo: !!cfg?.controle_interno_ativo,
        manifestado: !!mci && pecaContaComoPronta(mci),
        aviso:
          cfg?.controle_interno_ativo && !(mci && pecaContaComoPronta(mci)) && interna
            ? 'Controle interno ativo no órgão e ainda sem manifestação. Não impede a publicação (aviso — o regulamento do órgão pode exigi-la).'
            : null,
      },
    };
  }

  /**
   * Registra a publicação no Diário Oficial do órgão (peça PDO, com ou sem a
   * página anexada). Órgão SEM PNCP aguardando a divulgação: este registro É a
   * divulgação oficial (art. 176, par. único) — confirma pelo mesmo caminho da
   * Etapa A (`confirmarDivulgacaoOficial`), o prazo corre dessa data e a etapa
   * 8 conclui. Órgão integrado: só a peça (a confirmação vem do PNCP).
   */
  async registrarDiarioOficial(
    licitacaoId: string,
    arquivo: ArquivoRecebido | null | undefined,
    meta: { numero_edicao?: string; data_publicacao?: string; pagina?: string; link?: string; observacao?: string },
    ator: Ator,
    atorTransicao: AtorTransicao,
  ) {
    const antes = await this.lic(licitacaoId);
    const dia = String(meta?.data_publicacao ?? '').slice(0, 10);
    const ato = antes.data_publicacao_edital ? new Date(antes.data_publicacao_edital) : null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && ato && new Date(`${dia}T23:59:59-03:00`).getTime() < ato.getTime() - 86_400_000) {
      throw new BadRequestException('A publicação no Diário Oficial não pode ser anterior ao ato de publicação do processo.');
    }
    const doc = await this.pecas.registrarPublicacaoDiarioOficial(licitacaoId, arquivo, meta, ator);
    const l = await this.lic(licitacaoId);
    let confirmou = false;
    if (l.fase === FaseLicitacao.AGUARDANDO_DIVULGACAO && !l.integrado) {
      const data = new Date(Math.min(new Date(`${dia}T12:00:00-03:00`).getTime(), Date.now()));
      const r = await confirmarDivulgacaoOficial(
        this.transicoes,
        this.ds,
        licitacaoId,
        { data_divulgacao: data, meio: 'DIARIO_OFICIAL', referencia: String(doc.numero_peca ?? 'Diário Oficial') },
        atorTransicao,
      );
      confirmou = r.confirmada;
    }
    await this.tarefas.agendar(licitacaoId);
    await this.tarefas.aguardarPendentes();
    return { documento_id: doc.id, versao: doc.versao, confirmou_divulgacao: confirmou, publicacao: await this.quadro(licitacaoId) };
  }
}
