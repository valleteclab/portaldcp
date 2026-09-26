import { EntityManager } from 'typeorm';
import { fundamentoDoTexto, fundamentoPadrao } from './fundamento-legal';

/**
 * MIGRAÇÃO (boot, idempotente) — preenche `licitacoes.fundamento_legal` nos
 * processos que ainda não têm o campo, a partir do que já existe:
 *  1. o "Amparo legal" escrito na peça de justificativa/aviso da contratação
 *     direta (documento JC, seção `amparo_legal`), quando cita o inciso;
 *  2. o `amparo_legal` do contrato gerado pelo processo (ex.: "Art. 75, II");
 *  3. senão, o padrão da modalidade (o mesmo que o sistema já mandava ao PNCP).
 * O texto só vale se for compatível com a modalidade (fundamentoDoTexto).
 * Só toca linhas com o campo NULL — rodar de novo não muda nada.
 */
export async function migrarFundamentoLegal(m: EntityManager): Promise<{ preenchidas: number; doTexto: number }> {
  const pendentes: Array<{
    id: string;
    modalidade: string;
    tipo_contratacao: string | null;
    amparo_peca: string | null;
    amparo_contrato: string | null;
  }> = await m.query(
    `SELECT l.id::text AS id, l.modalidade::text AS modalidade, l.tipo_contratacao::text AS tipo_contratacao,
            (SELECT d.dados_estruturados->>'amparo_legal' FROM documentos_fase_interna d
              WHERE d.licitacao_id::text = l.id::text AND d.tipo::text = 'JC' AND d.versao_atual = true
              ORDER BY d.updated_at DESC LIMIT 1) AS amparo_peca,
            (SELECT c.amparo_legal FROM contratos c
              WHERE c.licitacao_id::text = l.id::text AND c.amparo_legal IS NOT NULL
              ORDER BY c.created_at ASC LIMIT 1) AS amparo_contrato
       FROM licitacoes l
      WHERE l.fundamento_legal IS NULL`,
  );
  let preenchidas = 0;
  let doTexto = 0;
  for (const p of pendentes) {
    const lido = fundamentoDoTexto(p.amparo_peca, p.modalidade) ?? fundamentoDoTexto(p.amparo_contrato, p.modalidade);
    const codigo = lido ?? fundamentoPadrao(p.modalidade, p.tipo_contratacao);
    if (!codigo) continue;
    const r = await m.query(`UPDATE licitacoes SET fundamento_legal = $2 WHERE id::text = $1 AND fundamento_legal IS NULL`, [p.id, codigo]);
    // UPDATE no driver do Postgres devolve [linhas, quantidade]
    if (Number(Array.isArray(r) ? r[1] : 0) > 0) {
      preenchidas++;
      if (lido) doTexto++;
    }
  }
  return { preenchidas, doTexto };
}
