import type { EntityManager } from 'typeorm';
import type { EstadoRecursal } from '../licitacoes/transicoes/transicoes.tipos';

/**
 * Estado recursal da licitação para as PRÉ-CONDIÇÕES da máquina de estados
 * (plano E5; sem DI — a máquina não importa o módulo da sessão):
 *  - janela de intenção aberta / encerrada e não superada;
 *  - recursos e intenções sem decisão final (efeito suspensivo — art. 168);
 *  - intenções admitidas (o prazo recursal só se abre com recurso admitido);
 *  - provimentos cujo efeito ainda não levou a licitação ao ato de fase.
 * Instantes comparados no Node (colunas `timestamp` sem fuso — mesma convenção
 * de gravação).
 */
export async function estadoRecursalSql(m: EntityManager, licitacaoId: string, agora = new Date()): Promise<EstadoRecursal> {
  const janelas: any[] = await m.query(
    `SELECT fecha_em FROM janelas_intencao_recurso WHERE licitacao_id = $1 AND superada_em IS NULL`,
    [licitacaoId],
  );
  const recursos: any[] = await m.query(
    `SELECT r.status::text AS status, r.fornecedor_id, r.efeitos, f.razao_social
       FROM recursos_administrativos r
       LEFT JOIN fornecedores f ON f.id::text = r.fornecedor_id
      WHERE r.licitacao_id::text = $1`,
    [licitacaoId],
  );
  const PENDENTES = ['INTENCAO', 'AGUARDANDO_RAZOES', 'RAZOES_APRESENTADAS', 'CONTRARRAZOES', 'EM_ANALISE', 'AGUARDANDO_AUTORIDADE'];
  const ROTULO: Record<string, string> = {
    INTENCAO: 'intenção aguardando admissibilidade',
    AGUARDANDO_RAZOES: 'prazo de razões',
    RAZOES_APRESENTADAS: 'contrarrazões',
    CONTRARRAZOES: 'contrarrazões',
    EM_ANALISE: 'reconsideração pelo agente',
    AGUARDANDO_AUTORIDADE: 'decisão da autoridade superior',
  };
  const pendentes = recursos
    .filter((r) => PENDENTES.includes(r.status))
    .map((r) => `recurso de ${r.razao_social || r.fornecedor_id} (${ROTULO[r.status] ?? r.status})`);
  const efeitos = (r: any) => (typeof r.efeitos === 'string' ? JSON.parse(r.efeitos) : r.efeitos) ?? {};
  return {
    janelaAberta: janelas.some((j) => new Date(j.fecha_em).getTime() > agora.getTime()),
    janelaEncerrada: janelas.some((j) => new Date(j.fecha_em).getTime() <= agora.getTime()),
    pendentes,
    intencoesAdmitidas: recursos.filter((r) => PENDENTES.includes(r.status) && r.status !== 'INTENCAO').length,
    providosSemDesfecho: recursos.filter((r) => r.status === 'PROVIDO' && efeitos(r).alterou_resultado && !efeitos(r).fase_concluida).length,
  };
}
