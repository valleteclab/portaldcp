import type { ExecutorSql } from '../disputa/migracao-lances';
import { pendenciasPublicacao } from '../julgamento/criterios-julgamento';
import { pendenciasEditalConcurso, pendenciasPremiacao } from './regras-concurso';

/**
 * Consultas do concurso SEM injeção de dependência (pré-condições da máquina
 * de estados e ofertas do ranking único). Nunca devolvem o nome do autor.
 */

export async function ehConcursoSql(db: ExecutorSql, licitacaoId: string): Promise<boolean> {
  const [l] = await db.query(`SELECT modalidade::text AS m FROM licitacoes WHERE id = $1`, [licitacaoId]);
  return l?.m === 'CONCURSO';
}

export async function pendenciasEditalConcursoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const [lic] = await db.query(`SELECT criterio_julgamento::text AS criterio FROM licitacoes WHERE id = $1`, [licitacaoId]);
  const [reg] = await db.query(`SELECT * FROM concurso_regulamentos WHERE licitacao_id = $1`, [licitacaoId]);
  const itens: any[] = await db.query(
    `SELECT numero_item, COALESCE(valor_total_estimado, valor_unitario_estimado * quantidade) AS total FROM itens_licitacao WHERE licitacao_id = $1`,
    [licitacaoId],
  );
  const [{ n }] = await db.query(`SELECT COUNT(*)::int AS n FROM quesitos_tecnicos WHERE licitacao_id = $1`, [licitacaoId]);
  return pendenciasEditalConcurso({
    criterio: lic?.criterio,
    regulamento: reg ?? null,
    itens: itens.map((i) => ({ numero_item: Number(i.numero_item), valor_total: Number(i.total) })),
    quesitos: Number(n),
  });
}

/** Banca completa (≥ 3 — art. 37 §1º) e todas as notas de todos os membros para todos os trabalhos. */
export async function pendenciasJulgamentoConcursoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const [jt] = await db.query(`SELECT publicado_em FROM julgamento_tecnico WHERE licitacao_id = $1`, [licitacaoId]);
  if (jt?.publicado_em) return [];
  const trabalhos: any[] = await db.query(
    `SELECT fornecedor_id, codigo FROM concurso_trabalhos WHERE licitacao_id = $1 AND status = 'SUBMETIDO' ORDER BY codigo`,
    [licitacaoId],
  );
  if (!trabalhos.length) return ['Nenhum trabalho inscrito — declare o concurso deserto.'];
  const quesitos: any[] = await db.query(`SELECT id::text AS id, descricao FROM quesitos_tecnicos WHERE licitacao_id = $1`, [licitacaoId]);
  const membros: any[] = await db.query(
    `SELECT c.usuario_id::text AS id, COALESCE(u.nome, 'Membro') AS nome FROM comissao_julgamento c
       LEFT JOIN usuarios u ON u.id::text = c.usuario_id::text WHERE c.licitacao_id = $1`,
    [licitacaoId],
  );
  const notas: any[] = await db.query(
    `SELECT quesito_id::text AS quesito_id, fornecedor_id, membro_id::text AS membro_id, nota FROM notas_tecnicas WHERE licitacao_id = $1`,
    [licitacaoId],
  );
  return pendenciasPublicacao({
    quesitos,
    membros,
    // a banca só conhece o CÓDIGO (sigilo de autoria)
    licitantes: trabalhos.map((t) => ({ id: String(t.fornecedor_id), nome: t.codigo })),
    notas: notas.map((x) => ({ quesitoId: x.quesito_id, fornecedorId: String(x.fornecedor_id), membroId: x.membro_id, nota: Number(x.nota) })),
  });
}

/** Unidade(s) com resultado possível sem trabalho vencedor declarado (ACEITO — qualificação conferida). */
export async function pendenciasResultadoConcursoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const rows: any[] = await db.query(
    `SELECT i.numero_item FROM itens_licitacao i
      WHERE i.licitacao_id = $1 AND i.status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO')
        AND NOT EXISTS (SELECT 1 FROM licitantes_unidade lu WHERE lu.unidade_id::text = i.id::text AND lu.situacao IN ('ACEITO','VENCEDOR'))
      ORDER BY i.numero_item`,
    [licitacaoId],
  );
  return rows.map((r) => `Item ${r.numero_item}: confira a qualificação do trabalho vencedor e declare o resultado (art. 30, I).`);
}

export async function pendenciasPremiacaoConcursoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const rows: any[] = await db.query(`SELECT status, exige_cessao, termo_gerado_em FROM concurso_premiacoes WHERE licitacao_id = $1`, [licitacaoId]);
  return pendenciasPremiacao(rows);
}

/**
 * Ofertas do concurso para o RANKING ÚNICO: sem lances — cada trabalho
 * inscrito concorre pelo valor fixo do prêmio; a ordem vem da nota técnica
 * publicada (ranking pontuado — melhor técnica). Registro = envio.
 */
export async function ofertasDoConcursoSql(
  db: ExecutorSql,
  unidadeId: string,
): Promise<Array<{ fornecedorId: string; fornecedorNome: string; melhorValor: number; registradoEm: Date; totalLances: number }>> {
  const rows: any[] = await db.query(
    `SELECT t.fornecedor_id, COALESCE(f.razao_social, 'Participante') AS nome, t.created_at,
            COALESCE(pi.valor_total, i.valor_total_estimado, i.valor_unitario_estimado * i.quantidade) AS valor
       FROM concurso_trabalhos t
       JOIN itens_licitacao i ON i.id::text = $1 AND i.licitacao_id = t.licitacao_id
       LEFT JOIN proposta_itens pi ON pi.proposta_id = t.proposta_id AND pi.item_licitacao_id = i.id
       LEFT JOIN fornecedores f ON f.id::text = t.fornecedor_id
      WHERE t.status = 'SUBMETIDO'
      ORDER BY t.created_at`,
    [unidadeId],
  );
  return rows.map((r) => ({
    fornecedorId: String(r.fornecedor_id),
    fornecedorNome: r.nome,
    melhorValor: Number(r.valor),
    registradoEm: new Date(r.created_at),
    totalLances: 0,
  }));
}
