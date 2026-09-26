import type { EntityManager } from 'typeorm';
import { REGISTRO_MIGRACAO_DIVULGACAO } from './transicoes.tipos';

/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS — divulgação oficial confirmada (PNCP)
 * ============================================================================
 *
 * Antes desta etapa o PUBLICAR levava direto a PUBLICADO (e o relógio ao
 * recebimento de propostas) mesmo quando a compra NÃO chegava ao PNCP. Regra
 * (decisão do usuário, 25/09/2026):
 *
 *  1. licitação já na fase externa com a COMPRA ENVIADA ao PNCP (fila) e sem
 *     `data_divulgacao_oficial` → divulgação CONFIRMADA na data do envio
 *     (fase inalterada);
 *  2. PUBLICADO / IMPUGNACAO / ACOLHIMENTO_PROPOSTAS sem compra enviada (e não
 *     seleção externa) → volta a AGUARDANDO_DIVULGACAO (`fase_anterior` =
 *     fase de antes): o prazo não correu. Propostas já recebidas ficam
 *     guardadas (nada é apagado); quando o PNCP confirmar, o cronograma é
 *     reconferido pela data confirmada e estendido se preciso.
 *
 * IDEMPOTENTE: só toca linhas sem `data_divulgacao_oficial`; cada linha
 * alterada ganha registro em `licitacao_transicoes` (MIGRACAO_DIVULGACAO,
 * ator SISTEMA/migracao). Fases mais adiantadas sem compra no PNCP não são
 * mexidas (o processo já andou — correção caso a caso).
 */
export async function migrarDivulgacaoOficial(m: EntityManager): Promise<{ confirmadas: number; aguardando: number }> {
  const confirmadas: Array<{ id: string; fase: string; situacao: string; numero: string | null }> = await m.query(
    `WITH compra AS (
       SELECT DISTINCT ON (s.licitacao_id::text) s.licitacao_id::text AS lic, COALESCE(s.enviado_em, s.updated_at) AS em, s.numero_controle_pncp
         FROM pncp_sync s
        WHERE s.tipo::text = 'COMPRA' AND s.status::text IN ('ENVIADO','ATUALIZADO')
        ORDER BY s.licitacao_id::text, s.created_at DESC)
     UPDATE licitacoes l
        SET data_divulgacao_oficial = COALESCE(c.em, l.data_publicacao_edital, NOW()),
            meio_divulgacao_oficial = 'PNCP',
            referencia_divulgacao_oficial = c.numero_controle_pncp
       FROM compra c
      WHERE c.lic = l.id::text AND l.data_divulgacao_oficial IS NULL
        AND l.fase::text NOT IN ('PLANEJAMENTO','TERMO_REFERENCIA','PESQUISA_PRECOS','ANALISE_JURIDICA','APROVACAO_INTERNA')
     RETURNING l.id::text AS id, l.fase::text AS fase, COALESCE(l.situacao::text, 'ATIVA') AS situacao, c.numero_controle_pncp AS numero`,
  );
  const linhasC = Array.isArray(confirmadas?.[0]) ? (confirmadas[0] as any) : confirmadas;
  for (const c of linhasC ?? []) {
    await registrar(m, c.id, c.fase, c.fase, c.situacao, `Divulgação oficial confirmada pela compra já enviada ao PNCP${c.numero ? ` (${c.numero})` : ''}.`);
  }

  const voltaram: Array<{ id: string; fase: string; situacao: string }> = await m.query(
    `UPDATE licitacoes l
        SET fase_anterior = l.fase::text, fase = 'AGUARDANDO_DIVULGACAO'
      WHERE l.fase::text IN ('PUBLICADO','IMPUGNACAO','ACOLHIMENTO_PROPOSTAS')
        AND l.data_divulgacao_oficial IS NULL
        AND COALESCE(l.selecao_externa, false) = false
     RETURNING l.id::text AS id, l.fase_anterior AS fase, COALESCE(l.situacao::text, 'ATIVA') AS situacao`,
  );
  const linhasV = Array.isArray(voltaram?.[0]) ? (voltaram[0] as any) : voltaram;
  for (const v of linhasV ?? []) {
    await registrar(
      m,
      v.id,
      v.fase,
      'AGUARDANDO_DIVULGACAO',
      v.situacao,
      'Aviso/edital sem compra publicada no PNCP: a divulgação oficial (arts. 54 e 174 da Lei 14.133/2021) não ocorreu e o prazo não correu — aguardando a confirmação do PNCP.',
    );
  }
  return { confirmadas: (linhasC ?? []).length, aguardando: (linhasV ?? []).length };
}

async function registrar(m: EntityManager, id: string, de: string, para: string, situacao: string, motivo: string) {
  await m.query(
    `INSERT INTO licitacao_transicoes (id, licitacao_id, fase_de, fase_para, situacao_de, situacao_para, ato, motivo, ator_tipo, ator_id, dados, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $4, $5, $6, 'SISTEMA', 'migracao', $7::jsonb, NOW())`,
    [id, de, para, situacao, REGISTRO_MIGRACAO_DIVULGACAO, motivo, JSON.stringify({ migracao: 'divulgacao-oficial' })],
  );
}
