import { EntityManager } from 'typeorm';

/**
 * Estado da COMPRA da licitação no PNCP — fonte única: `pncp_sync` (E9).
 *
 * Antes da E9 a licitação guardava uma cópia (`numero_controle_pncp`,
 * `ano_compra_pncp`, `sequencial_compra_pncp`, `link_pncp`, `enviado_pncp`)
 * gravada em paralelo à fila (E7). Agora:
 *  - a fila (ou o vínculo manual) registra a compra em `pncp_sync`
 *    (tipo COMPRA, status ENVIADO/ATUALIZADO, `ano_compra`/`sequencial_compra`);
 *  - ninguém mais grava as colunas da licitação (deprecated — drop físico
 *    listado no plano, E9); as leituras usam `estadoCompraPncp`, e as telas
 *    recebem os MESMOS nomes de campo por `aplicarEstadoCompraPncp`
 *    (compatibilidade de leitura);
 *  - `link_pncp` digitado pelo órgão (seleção externa — compra publicada por
 *    OUTRA plataforma) continua valendo quando não há compra desta plataforma.
 *
 * Funções SEM injeção de dependência (mesmo padrão dos `*.sql.ts`).
 */

export interface EstadoCompraPncp {
  numero_controle_pncp: string | null;
  ano_compra_pncp: number | null;
  sequencial_compra_pncp: number | null;
  link_pncp: string | null;
  enviado_pncp: boolean;
}

const ESTADO_VAZIO: EstadoCompraPncp = {
  numero_controle_pncp: null,
  ano_compra_pncp: null,
  sequencial_compra_pncp: null,
  link_pncp: null,
  enviado_pncp: false,
};

/** Base do portal público do PNCP no mesmo ambiente de PNCP_API_URL. */
export function portalPncpBase(): string {
  // Mesma regra do PncpService.getPortalBaseUrl
  return String(process.env.PNCP_API_URL || '').includes('treina') ? 'https://treina.pncp.gov.br' : 'https://pncp.gov.br';
}

export function linkCompraPncp(cnpj: string, ano: number | string, sequencial: number | string): string {
  return `${portalPncpBase()}/app/editais/${String(cnpj).replace(/\D/g, '')}/${ano}/${sequencial}`;
}

/** Linha COMPRA publicada mais recente de cada licitação (subconsulta reutilizável). */
const SQL_COMPRAS = `
  SELECT DISTINCT ON (s.licitacao_id::text)
         s.licitacao_id::text AS licitacao_id, s.numero_controle_pncp, s.ano_compra, s.sequencial_compra,
         COALESCE(NULLIF(o.pncp_cnpj_orgao, ''), o.cnpj) AS cnpj
    FROM pncp_sync s
    JOIN licitacoes l ON l.id::text = s.licitacao_id::text
    LEFT JOIN orgaos o ON o.id = l.orgao_id
   WHERE s.licitacao_id::text = ANY($1::text[])
     AND s.tipo::text = 'COMPRA'
     AND s.status::text IN ('ENVIADO', 'ATUALIZADO')
     AND s.ano_compra IS NOT NULL AND s.sequencial_compra IS NOT NULL
   ORDER BY s.licitacao_id::text, s.created_at DESC`;

/** Estado da compra no PNCP de cada licitação pedida (as sem compra ficam fora do mapa). */
export async function estadoCompraPncp(m: EntityManager, licitacaoIds: string[]): Promise<Map<string, EstadoCompraPncp>> {
  const mapa = new Map<string, EstadoCompraPncp>();
  const ids = [...new Set(licitacaoIds.filter(Boolean).map(String))];
  if (!ids.length) return mapa;
  const linhas: Array<{ licitacao_id: string; numero_controle_pncp: string | null; ano_compra: number; sequencial_compra: number; cnpj: string | null }> =
    await m.query(SQL_COMPRAS, [ids]);
  for (const r of linhas) {
    const cnpj = String(r.cnpj || process.env.PNCP_CNPJ_ORGAO || '').replace(/\D/g, '');
    mapa.set(r.licitacao_id, {
      numero_controle_pncp: r.numero_controle_pncp ?? null,
      ano_compra_pncp: Number(r.ano_compra),
      sequencial_compra_pncp: Number(r.sequencial_compra),
      link_pncp: cnpj ? linkCompraPncp(cnpj, r.ano_compra, r.sequencial_compra) : null,
      enviado_pncp: true,
    });
  }
  return mapa;
}

type ComEstadoPncp = { id: string; link_pncp?: string | null } & Partial<Record<keyof EstadoCompraPncp, unknown>>;

/**
 * Compatibilidade de leitura: preenche, nos objetos da licitação devolvidos às
 * telas, os campos PNCP com o estado da fila. Sem compra desta plataforma, só
 * o `link_pncp` informado manualmente (seleção externa) permanece.
 */
export async function aplicarEstadoCompraPncp<T extends ComEstadoPncp>(m: EntityManager, licitacoes: T[]): Promise<T[]> {
  const mapa = await estadoCompraPncp(m, licitacoes.map((l) => l.id));
  for (const l of licitacoes) {
    const e = mapa.get(String(l.id)) ?? { ...ESTADO_VAZIO, link_pncp: l.link_pncp ?? null };
    Object.assign(l, e);
  }
  return licitacoes;
}

/**
 * Registra uma compra JÁ existente no PNCP (vínculo manual, migração) como
 * linha ENVIADA da fila — sem chave de idempotência (histórico: o worker não
 * processa) — para que a fila e as leituras a enxerguem. Idempotente.
 */
export async function registrarCompraExistente(
  m: EntityManager,
  c: { licitacaoId: string; orgaoId?: string | null; numeroControle?: string | null; ano: number; sequencial: number; origem: string },
): Promise<boolean> {
  const [ja] = await m.query(
    `SELECT 1 FROM pncp_sync
      WHERE licitacao_id::text = $1 AND tipo::text = 'COMPRA' AND status::text IN ('ENVIADO','ATUALIZADO')
        AND ano_compra = $2 AND sequencial_compra = $3
      LIMIT 1`,
    [c.licitacaoId, c.ano, c.sequencial],
  );
  if (ja) return false;
  await m.query(
    `INSERT INTO pncp_sync (id, tipo, licitacao_id, entidade_id, orgao_id, numero_controle_pncp, ano_compra, sequencial_compra,
                            status, tentativas, referencia, ordem, max_tentativas, enviado_em, created_at, updated_at)
     VALUES (gen_random_uuid(), 'COMPRA', $1, NULL, $2, $3, $4, $5, 'ENVIADO', 0, $6::jsonb, 0, 0, now(), now(), now())`,
    [c.licitacaoId, c.orgaoId ?? null, c.numeroControle ?? null, c.ano, c.sequencial, JSON.stringify({ origem: c.origem })],
  );
  return true;
}

/** "cnpj-unidade-sequencial/ano" → { ano, sequencial }. */
export function anoSequencialDoControle(numeroControle: string | null | undefined): { ano: number; sequencial: number } | null {
  const m = String(numeroControle || '').match(/-(\d+)\/(\d{4})$/);
  return m ? { sequencial: Number(m[1]), ano: Number(m[2]) } : null;
}

/**
 * Migração E9 (boot, idempotente): licitações com a compra gravada só nas
 * colunas antigas (vínculo manual / envio anterior à fila) ganham a linha
 * ENVIADA em `pncp_sync`. Nada é apagado — as colunas ficam como estão até o
 * drop físico.
 */
export async function migrarEstadoCompraPncp(m: EntityManager): Promise<{ migradas: number }> {
  const [col] = await m.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'licitacoes' AND column_name = 'enviado_pncp'`,
  );
  if (!col) return { migradas: 0 };
  const linhas: Array<{ id: string; orgao_id: string | null; numero_controle_pncp: string | null; ano_compra_pncp: number | null; sequencial_compra_pncp: number | null }> =
    await m.query(
      `SELECT l.id::text AS id, l.orgao_id::text AS orgao_id, l.numero_controle_pncp, l.ano_compra_pncp, l.sequencial_compra_pncp
         FROM licitacoes l
        WHERE (l.enviado_pncp = true OR l.numero_controle_pncp IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM pncp_sync s
             WHERE s.licitacao_id::text = l.id::text AND s.tipo::text = 'COMPRA'
               AND s.status::text IN ('ENVIADO','ATUALIZADO')
               AND s.ano_compra IS NOT NULL AND s.sequencial_compra IS NOT NULL)`,
    );
  let migradas = 0;
  for (const l of linhas) {
    const doControle = anoSequencialDoControle(l.numero_controle_pncp);
    const ano = l.ano_compra_pncp ?? doControle?.ano;
    const sequencial = l.sequencial_compra_pncp ?? doControle?.sequencial;
    if (!ano || !sequencial) continue;
    if (
      await registrarCompraExistente(m, {
        licitacaoId: l.id,
        orgaoId: l.orgao_id,
        numeroControle: l.numero_controle_pncp,
        ano: Number(ano),
        sequencial: Number(sequencial),
        origem: 'MIGRACAO_E9_COLUNAS_LICITACAO',
      })
    ) {
      migradas++;
    }
  }
  return { migradas };
}
