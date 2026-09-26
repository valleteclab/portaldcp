import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { FaseLicitacao, Licitacao, SituacaoLicitacao } from '../entities/licitacao.entity';
import { definicaoDoAto, prazoEstendido } from './definicoes';
import type { TransicoesService } from './transicoes.service';
import { AtoLicitacao, AtorTransicao, atorSistema } from './transicoes.tipos';

/**
 * ============================================================================
 * DIVULGAÇÃO OFICIAL CONFIRMADA (Lei 14.133/2021 arts. 54, 55 e 174;
 * art. 75 §3º; IN SEGES 67/2021 arts. 6º e 7º)
 * ============================================================================
 *
 * O PUBLICAR só envia o edital/aviso ao PNCP: a licitação fica em
 * AGUARDANDO_DIVULGACAO — não pública, sem receber propostas, sem prazo
 * correndo. Quando o PNCP devolve o número de controle da COMPRA (fila) — ou,
 * para quem ainda não adotou o PNCP, quando o órgão registra a publicação no
 * diário oficial (art. 176 par. único) —, este passo:
 *  1. pratica CONFIRMAR_DIVULGACAO (data/meio/referência + reconferência do
 *     cronograma pela data CONFIRMADA — o prazo mínimo é piso, as datas são
 *     estendidas quando preciso; o ajuste fica no histórico);
 *  2. avisa o órgão quando o cronograma foi estendido;
 *  3. inicia o recebimento de propostas se a data de início já chegou (o
 *     relógio faria o mesmo no minuto seguinte).
 * Idempotente: fora de AGUARDANDO_DIVULGACAO não faz nada.
 */

const logger = new Logger('DivulgacaoOficial');

export interface DadosDivulgacao {
  data_divulgacao?: Date;
  meio: 'PNCP' | 'DIARIO_OFICIAL';
  referencia?: string | null;
}

export interface ResultadoConfirmacao {
  confirmada: boolean;
  licitacao?: Licitacao;
  ajuste_descricao?: string | null;
  cronograma_ajustado?: Array<{ campo: string; de: string | null; para: string | null }>;
}

export async function confirmarDivulgacaoOficial(
  transicoes: TransicoesService,
  ds: DataSource,
  licitacaoId: string,
  dados: DadosDivulgacao,
  ator: AtorTransicao,
): Promise<ResultadoConfirmacao> {
  const [l] = await ds.query(`SELECT fase::text AS fase FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
  if (!l || l.fase !== FaseLicitacao.AGUARDANDO_DIVULGACAO) return { confirmada: false };
  const dadosAto: Record<string, any> = {
    data_divulgacao: (dados.data_divulgacao ?? new Date()).toISOString(),
    meio: dados.meio,
    referencia: dados.referencia ?? null,
  };
  let lic = await transicoes.executar(licitacaoId, AtoLicitacao.CONFIRMAR_DIVULGACAO, {
    ator,
    dados: dadosAto,
    ignorarSeJaAplicado: true,
  });
  const ajustes = (dadosAto.cronograma_ajustado ?? []) as ResultadoConfirmacao['cronograma_ajustado'];
  if (prazoEstendido(ajustes)) {
    await notificarOrgao(ds, lic, 'Prazo da contratação estendido ao mínimo legal', String(dadosAto.ajuste_descricao ?? ''));
  }
  lic = await iniciarRecebimentoSeNoPrazo(transicoes, lic);
  return { confirmada: true, licitacao: lic, ajuste_descricao: dadosAto.ajuste_descricao ?? null, cronograma_ajustado: ajustes };
}

/** INICIAR_ACOLHIMENTO já, se a data de início chegou e o prazo não terminou (mesma regra do relógio). */
export async function iniciarRecebimentoSeNoPrazo(transicoes: TransicoesService, lic: Licitacao, agora = new Date()): Promise<Licitacao> {
  if (lic.fase !== FaseLicitacao.PUBLICADO || (lic.situacao && lic.situacao !== SituacaoLicitacao.ATIVA)) return lic;
  if (!definicaoDoAto(lic.modalidade, AtoLicitacao.INICIAR_ACOLHIMENTO)) return lic;
  const inicio = lic.data_inicio_acolhimento ? new Date(lic.data_inicio_acolhimento) : null;
  const fim = lic.data_fim_acolhimento ? new Date(lic.data_fim_acolhimento) : null;
  if (!inicio || inicio > agora || (fim && fim <= agora)) return lic;
  try {
    return await transicoes.executar(lic.id, AtoLicitacao.INICIAR_ACOLHIMENTO, {
      ator: atorSistema('scheduler'),
      ignorarSeJaAplicado: true,
      registro: { origem: 'divulgacao_confirmada' },
    });
  } catch (e: any) {
    logger.warn(`Recebimento da licitação ${lic.id} não iniciado após a confirmação: ${e?.message ?? e}`);
    return lic;
  }
}

async function notificarOrgao(ds: DataSource, lic: Licitacao, titulo: string, mensagem: string): Promise<void> {
  if (!lic.orgao_id || !mensagem) return;
  try {
    await ds.query(
      `INSERT INTO notificacoes (id, orgao_id, usuario_id, tipo, titulo, mensagem, prioridade, entidade_tipo, entidade_id, link, lida, email_enviado, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $6, 'SISTEMA', $2, $3, 'ALTA', 'LICITACAO', $4, $5, false, false, NOW(), NOW())`,
      [lic.orgao_id, `${titulo} — ${lic.numero_processo ?? ''}`.trim(), mensagem, lic.id, `/orgao/processos/${lic.id}`, String(lic.orgao_id)],
    );
  } catch (e: any) {
    logger.warn(`Aviso ao órgão sobre o cronograma da licitação ${lic.id} não gravado: ${e?.message ?? e}`);
  }
}
