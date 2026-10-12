/**
 * PREVISÃO NO PCA — dado único, lido do planejamento (DFD/demanda → item do
 * PCA), nunca redigitado no ETP (decisão do dono, 12/10/2026: "essa
 * informação já não é feita na demanda ou DFD?"). O DFD (seção "previsao") e
 * o ETP (inc. II, art. 18, § 1º) recebem o MESMO texto, montado aqui.
 *
 * Regras puras + a consulta reaproveitada pela derivação e pela tela do ETP.
 */

export interface ItemPcaDaContratacao {
  id: string;
  numero_item: number;
  descricao_objeto: string;
  valor_estimado: number | null;
  trimestre_previsto: number | null;
  mes_previsto_contratacao: number | null;
  pca_id: string;
  ano_exercicio: number;
  numero_pca: string | null;
  pca_status: string | null;
  data_aprovacao: string | null;
}

export interface PrevisaoPca {
  /** Item do PCA ligado à contratação (pelo processo, pelos itens, pelo DFD consolidado ou pela demanda). */
  item: ItemPcaDaContratacao | null;
  /** De onde veio o vínculo (para a tela dizer "vem do DFD nº 17/2026"). */
  origem: 'PROCESSO' | 'ITENS' | 'DFD' | 'DEMANDA' | null;
  /** DFD consolidado do processo, quando houver ("17/2026"). */
  dfd_numero: string | null;
  /** O processo foi marcado como fora do PCA, com justificativa (art. 12, § 1º). */
  sem_pca: boolean;
  justificativa_sem_pca: string | null;
  /** Texto do inciso II (HTML), pronto para o DFD e o ETP. */
  texto: string;
  /** Situação para a tela: PREVISTA (item), FORA_DO_PCA (justificada) ou SEM_VINCULO (falta decidir). */
  situacao: 'PREVISTA' | 'FORA_DO_PCA' | 'SEM_VINCULO';
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "4º trimestre" / "outubro" — quando o PCA tem previsão de quando contratar. */
export function quandoPrevisto(item: Pick<ItemPcaDaContratacao, 'trimestre_previsto' | 'mes_previsto_contratacao'>): string | null {
  if (item.trimestre_previsto && item.trimestre_previsto >= 1 && item.trimestre_previsto <= 4) return `${item.trimestre_previsto}º trimestre`;
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const m = Number(item.mes_previsto_contratacao);
  return m >= 1 && m <= 12 ? meses[m - 1] : null;
}

/** Texto do inciso II (HTML) a partir do que o planejamento já decidiu. */
export function textoPrevisaoPca(e: { item: ItemPcaDaContratacao | null; sem_pca: boolean; justificativa_sem_pca: string | null }): string {
  if (e.item) {
    const i = e.item;
    const plano = i.numero_pca ? esc(i.numero_pca) : `PCA ${i.ano_exercicio}`;
    const valor = i.valor_estimado != null && Number(i.valor_estimado) > 0 ? `, com valor estimado de ${BRL.format(Number(i.valor_estimado))}` : '';
    const quando = quandoPrevisto(i);
    return `<p>A contratação está prevista no Plano de Contratações Anual de ${i.ano_exercicio} (${plano}), item nº ${i.numero_item} — ${esc(i.descricao_objeto)}${valor}${quando ? `, previsto para o ${quando}` : ''}, em conformidade com o art. 12, § 1º, da Lei nº 14.133/2021.</p>`;
  }
  if (e.sem_pca && e.justificativa_sem_pca) {
    return `<p>A contratação não consta do Plano de Contratações Anual. Justificativa (art. 12, § 1º, da Lei nº 14.133/2021): ${esc(e.justificativa_sem_pca)}</p>`;
  }
  return '<p>A presente contratação não consta no PCA; justificativa a ser detalhada.</p>';
}

export function situacaoPrevisaoPca(e: { item: ItemPcaDaContratacao | null; sem_pca: boolean; justificativa_sem_pca: string | null }): PrevisaoPca['situacao'] {
  if (e.item) return 'PREVISTA';
  return e.sem_pca && e.justificativa_sem_pca ? 'FORA_DO_PCA' : 'SEM_VINCULO';
}

type Consulta = (sql: string, params: unknown[]) => Promise<any[]>;

/**
 * Previsão no PCA da contratação. O vínculo vale nesta ordem: o do processo
 * (tela do DFD), o dos itens, o do DFD consolidado, o da demanda — sempre
 * pela licitação, nunca por id vindo de fora.
 */
export async function previsaoPcaDaContratacao(consulta: Consulta, licitacaoId: string): Promise<PrevisaoPca> {
  const [lic] = await consulta(
    `SELECT l.item_pca_id::text AS processo,
            (SELECT il.item_pca_id::text FROM itens_licitacao il WHERE il.licitacao_id = l.id AND il.item_pca_id IS NOT NULL ORDER BY il.numero_item LIMIT 1) AS itens,
            (SELECT c.item_pca_id::text FROM dfds_consolidados c WHERE c.licitacao_id = l.id AND c.status <> 'CANCELADO' LIMIT 1) AS dfd,
            (SELECT c.numero || '/' || c.ano FROM dfds_consolidados c WHERE c.licitacao_id = l.id AND c.status <> 'CANCELADO' LIMIT 1) AS dfd_numero,
            (SELECT d.item_pca_id::text FROM demandas d WHERE d.id = l.demanda_id) AS demanda,
            COALESCE(l.sem_pca, false) AS sem_pca, l.justificativa_sem_pca
       FROM licitacoes l WHERE l.id::text = $1`,
    [licitacaoId],
  );
  const vazio: PrevisaoPca = { item: null, origem: null, dfd_numero: null, sem_pca: false, justificativa_sem_pca: null, texto: textoPrevisaoPca({ item: null, sem_pca: false, justificativa_sem_pca: null }), situacao: 'SEM_VINCULO' };
  if (!lic) return vazio;
  const origens: Array<[PrevisaoPca['origem'], string | null]> = [['PROCESSO', lic.processo], ['ITENS', lic.itens], ['DFD', lic.dfd], ['DEMANDA', lic.demanda]];
  const achado = origens.find(([, id]) => !!id) ?? null;
  let item: ItemPcaDaContratacao | null = null;
  if (achado) {
    const [i] = await consulta(
      `SELECT i.id::text AS id, i.numero_item, i.descricao_objeto, i.valor_estimado, i.trimestre_previsto, i.mes_previsto_contratacao,
              p.id::text AS pca_id, p.ano_exercicio, p.numero_pca, p.status::text AS pca_status, p.data_aprovacao::text AS data_aprovacao
         FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id
        WHERE i.id::text = $1`,
      [achado[1]],
    );
    if (i) item = { ...i, numero_item: Number(i.numero_item), valor_estimado: i.valor_estimado == null ? null : Number(i.valor_estimado) };
  }
  const base = { item, sem_pca: !!lic.sem_pca, justificativa_sem_pca: lic.justificativa_sem_pca ? String(lic.justificativa_sem_pca) : null };
  return {
    ...base,
    origem: item ? achado![0] : null,
    dfd_numero: lic.dfd_numero ? String(lic.dfd_numero) : null,
    texto: textoPrevisaoPca(base),
    situacao: situacaoPrevisaoPca(base),
  };
}
