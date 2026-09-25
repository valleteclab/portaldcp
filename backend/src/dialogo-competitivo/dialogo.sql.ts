import type { ExecutorSql } from '../disputa-v2/migracao-lances';
import { calendarioDoOrgao } from '../common/prazos/dias-uteis';
import { etapaEfetiva, pendenciasConclusaoDialogo, pendenciasFaseCompetitiva, pendenciasReconsideracao, validarConfiguracaoDialogo } from './regras-dialogo';

/** Consultas do diálogo competitivo SEM injeção de dependência (pré-condições e guarda da proposta). */

async function dialogoDe(db: ExecutorSql, licitacaoId: string) {
  const [d] = await db.query(
    `SELECT d.*, l.fase::text AS fase, l.orgao_id::text AS orgao_id FROM dialogo_competitivo d
       JOIN licitacoes l ON l.id = d.licitacao_id WHERE d.licitacao_id = $1`,
    [licitacaoId],
  );
  return d ?? null;
}

export async function pendenciasEditalDialogoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const d = await dialogoDe(db, licitacaoId);
  if (!d) return ['Configure o diálogo competitivo: hipótese legal, necessidades, exigências e critérios de pré-seleção (art. 32, §1º, I e II).'];
  return validarConfiguracaoDialogo(d);
}

export async function pendenciasConclusaoDialogoSql(db: ExecutorSql, licitacaoId: string, dados: Record<string, any> | undefined, somenteAvaliacao?: boolean): Promise<string[]> {
  const d = await dialogoDe(db, licitacaoId);
  if (!d) return ['Diálogo competitivo não configurado.'];
  const comissao: any[] = await db.query(`SELECT vinculo, papel, nome, termo_confidencialidade_em FROM dialogo_comissao WHERE licitacao_id = $1`, [licitacaoId]);
  const reunioes: any[] = await db.query(
    `SELECT r.status, r.ata_texto, r.ata_arquivo, r.gravacao_arquivo, r.gravacao_link, r.rodada, r.agendada_para
       FROM dialogo_reunioes r WHERE r.licitacao_id = $1 ORDER BY r.agendada_para`,
    [licitacaoId],
  );
  const parts: any[] = await db.query(
    `SELECT p.situacao, p.decidido_em, p.reconsideracao_status, COALESCE(f.razao_social, 'Interessado') AS rotulo
       FROM dialogo_participantes p LEFT JOIN fornecedores f ON f.id::text = p.fornecedor_id WHERE p.licitacao_id = $1`,
    [licitacaoId],
  );
  return pendenciasConclusaoDialogo({
    reconsideracoes: pendenciasReconsideracao(parts, new Date(), calendarioDoOrgao(d.orgao_id ?? null)),
    etapa: etapaEfetiva(d.etapa, d.fase),
    comissao,
    reunioes: reunioes.map((r, i) => ({ ...r, rotulo: `Reunião ${i + 1} (rodada ${r.rodada})` })),
    solucaoIdentificada: dados?.solucao_identificada,
    somenteAvaliacao,
  });
}

export async function pendenciasFaseCompetitivaSql(
  db: ExecutorSql,
  licitacaoId: string,
  dados: Record<string, any> | undefined,
  agora: Date,
  somenteAvaliacao?: boolean,
): Promise<string[]> {
  const d = await dialogoDe(db, licitacaoId);
  if (!d) return ['Diálogo competitivo não configurado.'];
  return pendenciasFaseCompetitiva({
    etapa: etapaEfetiva(d.etapa, d.fase),
    dados: dados ?? {},
    agora,
    cal: calendarioDoOrgao(d.orgao_id ?? null),
    temEdital: !!(dados?.edital_sha256 || d.edital_competitivo_sha256),
    somenteAvaliacao,
  });
}

/** A disputa só começa na fase competitiva (art. 32, §1º, VIII). */
export async function pendenciasDisputaDialogoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const d = await dialogoDe(db, licitacaoId);
  if (d?.etapa === 'COMPETITIVA') return [];
  return ['Diálogo competitivo: a sessão de disputa só existe na fase competitiva (conclua o diálogo e publique o edital da fase competitiva — art. 32, §1º, VIII).'];
}

/** Proposta no diálogo: só na fase competitiva e só de licitante PRÉ-SELECIONADO (art. 32, §1º, VIII). */
export async function motivoPropostaDialogoSql(db: ExecutorSql, licitacaoId: string, fornecedorId: string): Promise<string | null> {
  const d = await dialogoDe(db, licitacaoId);
  if (!d || d.etapa !== 'COMPETITIVA') {
    return 'Diálogo competitivo: propostas só na fase competitiva. Nesta etapa, manifeste interesse pelo painel do diálogo (art. 32, §1º, I).';
  }
  const [p] = await db.query(
    `SELECT situacao FROM dialogo_participantes WHERE licitacao_id = $1 AND fornecedor_id = $2`,
    [licitacaoId, fornecedorId],
  );
  if (p?.situacao !== 'PRE_SELECIONADO') {
    return 'Somente os licitantes pré-selecionados apresentam proposta na fase competitiva (art. 32, §1º, VIII).';
  }
  return null;
}
