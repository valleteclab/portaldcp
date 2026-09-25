import type { ExecutorSql } from '../disputa-v2/migracao-lances';
import {
  ContextoDesempate,
  CriterioDesempate,
  CRITERIOS_ART60,
  DadosLicitanteDesempate,
  PassoDesempate,
  aplicarCriteriosAutomaticos,
  empateResolvido,
} from './desempate-regras';
import { ALGORITMO_SORTEIO, sorteioAuditavel } from './sorteio';

/**
 * Funções SQL do desempate (art. 60) SEM injeção de dependência — usadas pelo
 * DesempateService e pelo julgamento da dispensa (licitacoes.service), que não
 * importa o módulo de julgamento.
 */

/** Dados do cadastro/proposta dos licitantes para os critérios automáticos + UF do órgão. */
export async function dadosParaDesempate(
  db: ExecutorSql,
  licitacaoId: string,
  fornecedores: string[],
): Promise<{ dados: DadosLicitanteDesempate[]; ctx: ContextoDesempate }> {
  const [org] = await db.query(
    `SELECT o.uf FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id = $1`,
    [licitacaoId],
  );
  const rows: any[] = fornecedores.length
    ? await db.query(
        `SELECT f.id::text AS id, f.uf, f.cpf_cnpj,
                (SELECT p.declaracao_integridade FROM propostas p
                  WHERE p.licitacao_id = $1 AND p.fornecedor_id::text = f.id::text
                    AND p.status::text NOT IN ('RASCUNHO','CANCELADA')
                  ORDER BY p.created_at DESC LIMIT 1) AS integridade
           FROM fornecedores f WHERE f.id::text = ANY($2::text[])`,
        [licitacaoId, fornecedores],
      )
    : [];
  const porId = new Map(rows.map((r) => [String(r.id), r]));
  return {
    ctx: { ufOrgao: org?.uf ?? null },
    dados: fornecedores.map((id) => {
      const r = porId.get(id);
      return {
        fornecedorId: id,
        uf: r?.uf ?? null,
        cpfCnpj: r?.cpf_cnpj ?? null,
        declaracaoIntegridade: r?.integridade == null ? null : !!r.integridade,
      };
    }),
  };
}

const info = (c: CriterioDesempate) => CRITERIOS_ART60.find((x) => x.criterio === c)!;

/** Passo da trilha para a disputa final. */
export function passoDisputaFinal(p: {
  aplicada: boolean;
  motivo?: string;
  blocos: string[][];
  ofertas?: Array<{ fornecedorId: string; valor: number }>;
}): PassoDesempate {
  const i = info(CriterioDesempate.DISPUTA_FINAL);
  return {
    criterio: CriterioDesempate.DISPUTA_FINAL,
    baseLegal: i.baseLegal,
    descricao: i.descricao,
    aplicavel: p.aplicada,
    ...(p.motivo ? { motivo: p.motivo } : {}),
    desempatou: p.blocos.length > 1,
    blocos: p.blocos,
    ...(p.ofertas ? { detalhes: { ofertas: p.ofertas } } : {}),
  };
}

/** Sorteio (IN 73 art. 28 §2º) de cada bloco ainda empatado; devolve os blocos resolvidos e o registro. */
export function sortearBlocos(
  licitacaoId: string,
  unidadeId: string,
  blocos: string[][],
  atoEm: Date,
): { blocos: string[][]; registros: Array<ReturnType<typeof sorteioAuditavel>>; passo: PassoDesempate } {
  const registros: Array<ReturnType<typeof sorteioAuditavel>> = [];
  const finais: string[][] = [];
  for (const b of blocos) {
    if (b.length <= 1) {
      finais.push(b);
      continue;
    }
    const r = sorteioAuditavel({ licitacaoId, unidadeId, candidatos: b, atoEm });
    registros.push(r);
    for (const id of r.ordem) finais.push([id]);
  }
  const i = info(CriterioDesempate.SORTEIO);
  return {
    blocos: finais,
    registros,
    passo: {
      criterio: CriterioDesempate.SORTEIO,
      baseLegal: i.baseLegal,
      descricao: i.descricao,
      aplicavel: true,
      desempatou: registros.length > 0,
      blocos: finais,
      detalhes: { algoritmo: ALGORITMO_SORTEIO, atoEm: atoEm.toISOString(), sorteios: registros },
    },
  };
}

/** Critério que decidiu por último (o último passo que desempatou). */
export function criterioDecisivo(trilha: PassoDesempate[]): string | null {
  const ultimo = [...trilha].reverse().find((p) => p.desempatou);
  return ultimo ? ultimo.criterio : null;
}

/** Desempate registrado (RESOLVIDO) que cobre o grupo (o grupo é subconjunto dos empatados do registro). */
export async function desempateResolvidoDoGrupo(
  db: ExecutorSql,
  unidadeId: string,
  grupo: string[],
): Promise<{ id: string; ordem_final: string[]; criterio_decisivo: string | null } | null> {
  const rows: any[] = await db.query(
    `SELECT id, ordem_final, criterio_decisivo FROM desempates
      WHERE unidade_id::text = $1 AND status = 'RESOLVIDO' ORDER BY resolvido_em DESC NULLS LAST`,
    [unidadeId],
  );
  return rows.find((r) => Array.isArray(r.ordem_final) && grupo.every((id) => r.ordem_final.includes(id))) ?? null;
}

/**
 * Desempate DENTRO DE UM ATO que não admite a disputa final (julgamento da
 * dispensa — ver licitacoes.service `julgarDispensa`): critérios II..§1º IV e,
 * persistindo, sorteio no próprio ato (instante do ato = entrada pública).
 * Idempotente: se já houver desempate resolvido cobrindo o grupo, reusa a ordem.
 * Devolve a ordem final do grupo.
 */
export async function desempatarNoAto(
  db: ExecutorSql,
  p: {
    licitacaoId: string;
    sessaoId?: string | null;
    tipoUnidade: 'ITEM' | 'LOTE';
    unidadeId: string;
    grupo: string[];
    valorEmpatado: number;
    motivoSemDisputaFinal: string;
    ator: { tipo: string; id: string | null };
  },
): Promise<{ ordem: string[]; desempateId: string; reusado: boolean; trilha: PassoDesempate[] }> {
  const grupo = [...new Set(p.grupo.map(String))].sort();
  const existente = await desempateResolvidoDoGrupo(db, p.unidadeId, grupo);
  if (existente) {
    const ordem = [...grupo].sort((a, b) => existente.ordem_final.indexOf(a) - existente.ordem_final.indexOf(b));
    return { ordem, desempateId: existente.id, reusado: true, trilha: [] };
  }
  const { dados, ctx } = await dadosParaDesempate(db, p.licitacaoId, grupo);
  const trilha: PassoDesempate[] = [passoDisputaFinal({ aplicada: false, motivo: p.motivoSemDisputaFinal, blocos: [grupo] })];
  const auto = aplicarCriteriosAutomaticos([grupo], dados, ctx);
  trilha.push(...auto.trilha);
  let blocos = auto.blocos;
  let atoEm: Date | null = null;
  let registros: any[] | null = null;
  if (!empateResolvido(blocos)) {
    atoEm = new Date();
    const s = sortearBlocos(p.licitacaoId, p.unidadeId, blocos, atoEm);
    blocos = s.blocos;
    registros = s.registros;
    trilha.push(s.passo);
  }
  const ordem = blocos.flat();
  const [row] = await db.query(
    `INSERT INTO desempates
       (id, licitacao_id, sessao_id, tipo_unidade, unidade_id, status, fornecedores, valor_empatado, chave,
        disputa_final_nao_aplicada, blocos, trilha, ordem_final, criterio_decisivo,
        sorteio_ato_em, sorteio_algoritmo, sorteio, resolvido_em, ator_tipo, ator_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'RESOLVIDO', $5::jsonb, $6, 'VALOR', $7, $8::jsonb, $9::jsonb, $10::jsonb, $11,
             $12, $13, $14::jsonb, now(), $15, $16, now(), now())
     RETURNING id`,
    [
      p.licitacaoId,
      p.sessaoId ?? null,
      p.tipoUnidade,
      p.unidadeId,
      JSON.stringify(grupo),
      p.valorEmpatado,
      p.motivoSemDisputaFinal,
      JSON.stringify(auto.blocos),
      JSON.stringify(trilha),
      JSON.stringify(ordem),
      criterioDecisivo(trilha),
      atoEm,
      atoEm ? ALGORITMO_SORTEIO : null,
      registros ? JSON.stringify(registros) : null,
      p.ator.tipo,
      p.ator.id,
    ],
  );
  if (p.sessaoId) {
    const passos = trilha
      .filter((x) => x.criterio !== CriterioDesempate.SORTEIO)
      .map((x) => `${x.baseLegal}: ${x.aplicavel ? (x.desempatou ? 'desempatou' : 'sem efeito') : 'não aplicável'}`)
      .join('; ');
    const sorteioTxt = registros?.length
      ? ` Sorteio em ato público (IN 73 art. 28 §2º) em ${atoEm!.toISOString()}: ` +
        registros.map((r: any) => `entrada "${r.entrada}", semente ${r.semente}, algoritmo ${r.algoritmo}`).join(' | ')
      : '';
    await db.query(
      `INSERT INTO eventos_sessao (id, sessao_id, tipo, descricao, item_id, dados_adicionais, usuario_nome, is_sistema, created_at)
       VALUES (gen_random_uuid(), $1, 'MENSAGEM_SISTEMA', $2, $3, $4::jsonb, 'Sistema', true, now())`,
      [
        p.sessaoId,
        `Empate entre ${grupo.length} licitantes (valor ${Number(p.valorEmpatado).toFixed(4)}) — desempate pelo art. 60 da Lei 14.133/2021 (${passos}).${sorteioTxt} Ordem final: ${ordem.join(', ')}.`,
        p.tipoUnidade === 'ITEM' ? p.unidadeId : null,
        JSON.stringify({ origem: 'DESEMPATE_ART60', desempate_id: row.id, ordem, sorteio: registros }),
      ],
    );
  }
  return { ordem, desempateId: String(row.id), reusado: false, trilha };
}

/** Reinício da disputa: desempates da licitação deixam de valer (histórico mantido). */
export async function cancelarDesempatesDaLicitacao(db: ExecutorSql, licitacaoId: string): Promise<void> {
  await db.query(
    `UPDATE desempates SET status = 'CANCELADO', updated_at = now() WHERE licitacao_id = $1 AND status <> 'CANCELADO'`,
    [licitacaoId],
  );
}
