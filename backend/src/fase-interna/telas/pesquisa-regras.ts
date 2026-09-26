/**
 * PESQUISA DE PREÇOS — regras puras da tela da etapa (Entrega 3A; SPEC §2
 * "Cotacao", "ParametroPesquisa", "PesquisaPrecos"; mockup Pesquisa.dc.html).
 *
 * Os dados continuam no documento PP (`documentos_fase_interna.dados_estruturados`,
 * tipo `PesquisaPrecosDados`) — a fonte que o gerador do mapa, o agente de
 * pesquisa e o relatório público já leem. Aqui ficam só os cálculos:
 *  - os 5 parâmetros do art. 23, §1º (consultado em [data], resultado,
 *    evidência — inclusive "consultado sem retorno");
 *  - menor, média e mediana; o método adotado (MENOR, MEDIA ou MEDIANA);
 *  - a regra dos 3 preços (art. 23, §1º, IV; IN SEGES 65/2021, art. 6º, §5º);
 *  - alertas de validade e de idade da cotação (PRECO-02 e PRECO-03 da SPEC);
 *  - as cotações diretas agrupadas por proposta (fornecedor).
 */
import type { CotacaoPorFonte, FontePesquisaTipo, ItemPesquisaPrecos } from '../types/pesquisa-precos.type';

export type IncisoArt23 = 'I' | 'II' | 'III' | 'IV' | 'V';
export const INCISOS_ART23: IncisoArt23[] = ['I', 'II', 'III', 'IV', 'V'];

export const PARAMETROS_ART23: Record<IncisoArt23, { titulo: string; texto: string }> = {
  I: {
    titulo: 'Painel de preços / banco de preços (PNCP)',
    texto: 'Composição de custos unitários menores ou iguais à mediana do item no painel para consulta de preços ou no banco de preços em saúde disponíveis no PNCP.',
  },
  II: {
    titulo: 'Contratações similares (último ano)',
    texto: 'Contratações similares feitas pela Administração Pública, em execução ou concluídas no período de 1 (um) ano anterior à data de pesquisa de preços.',
  },
  III: {
    titulo: 'Mídia especializada, tabelas de referência e sítios eletrônicos',
    texto: 'Dados de pesquisa publicada em mídia especializada, de tabela de referência formalmente aprovada pelo Poder Executivo federal e de sítios eletrônicos especializados ou de domínio amplo, com data e hora de acesso.',
  },
  IV: {
    titulo: 'Pesquisa direta com fornecedores (mín. 3)',
    texto: 'Pesquisa direta com no mínimo 3 (três) fornecedores, mediante solicitação formal de cotação, com justificativa da escolha desses fornecedores e orçamentos obtidos há no máximo 6 (seis) meses da divulgação do edital.',
  },
  V: {
    titulo: 'Base nacional de notas fiscais eletrônicas',
    texto: 'Pesquisa na base nacional de notas fiscais eletrônicas, na forma de regulamento.',
  },
};

/** Inciso do art. 23, §1º de cada fonte já usada pelo módulo de pesquisa (agente, cotações). */
export const INCISO_DA_FONTE: Partial<Record<FontePesquisaTipo, IncisoArt23>> = {
  PAINEL_DE_PRECOS: 'I',
  PNCP: 'II',
  CONTRATO_VIGENTE_SISTEMA: 'II',
  MIDIA_ESPECIALIZADA: 'III',
  FORNECEDOR_DIRETO: 'IV',
  NOTA_FISCAL_ELETRONICA: 'V',
};

/**
 * Registro de um parâmetro do art. 23, §1º. "Consultado sem retorno" é um
 * registro válido e vai para a certidão (o que faltava no módulo antigo).
 */
export interface ParametroArt23 {
  inciso: IncisoArt23;
  /** CONSULTADO = com resultado aproveitado; SEM_RETORNO = consultado, nada equivalente; NAO_CONSULTADO. */
  situacao: 'CONSULTADO' | 'SEM_RETORNO' | 'NAO_CONSULTADO';
  data_consulta: string | null; // AAAA-MM-DD
  resultado: string | null;
  evidencia_path?: string | null;
  evidencia_nome?: string | null;
  evidencia_hash?: string | null;
  registrado_por_nome?: string | null;
  registrado_em?: string | null;
}

export type SituacaoParametroTela = 'ATENDIDO' | 'SEM_RETORNO' | 'PENDENTE';

export interface ParametroCalculado extends ParametroArt23 {
  titulo: string;
  texto: string;
  /** Situação para a tela: ATENDIDO (com preços), SEM_RETORNO ou PENDENTE (não consultado). */
  situacao_tela: SituacaoParametroTela;
  /** Cotações registradas nos itens vindas de fontes deste inciso. */
  cotacoes: number;
  /** Texto curto: "Consultado 10/12/2025 · 0 resultados", "Não consultado", "3 propostas". */
  evidencia_resumo: string;
}

const fmtDiaBr = (dia: string | null | undefined) => {
  const m = String(dia ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * Os 5 parâmetros com a situação da tela. Sem registro manual, o parâmetro
 * conta como consultado se há cotação de fonte daquele inciso nos itens
 * (a data é a da cotação mais recente).
 */
export function parametrosDaPesquisa(registrados: ParametroArt23[] | null | undefined, itens: ItemPesquisaPrecos[]): ParametroCalculado[] {
  const lista = Array.isArray(registrados) ? registrados : [];
  return INCISOS_ART23.map((inciso) => {
    const cotacoes = (itens || []).flatMap((i) => i.cotacoes || []).filter((c) => INCISO_DA_FONTE[c.fonte] === inciso);
    const reg = lista.find((p) => p?.inciso === inciso);
    const base: ParametroArt23 = reg
      ? { ...reg, inciso }
      : cotacoes.length
        ? {
            inciso,
            situacao: 'CONSULTADO',
            data_consulta: cotacoes.map((c) => String(c.data_pesquisa || '').slice(0, 10)).filter(Boolean).sort().pop() ?? null,
            resultado: null,
          }
        : { inciso, situacao: 'NAO_CONSULTADO', data_consulta: null, resultado: null };
    let situacaoTela: SituacaoParametroTela;
    if (base.situacao === 'NAO_CONSULTADO') situacaoTela = cotacoes.length ? 'ATENDIDO' : 'PENDENTE';
    else if (base.situacao === 'SEM_RETORNO' && !cotacoes.length) situacaoTela = 'SEM_RETORNO';
    else situacaoTela = 'ATENDIDO';

    const data = fmtDiaBr(base.data_consulta);
    let resumo: string;
    if (situacaoTela === 'PENDENTE') resumo = 'Não consultado';
    else if (situacaoTela === 'SEM_RETORNO') resumo = `Consultado${data ? ` ${data}` : ''} · sem retorno${base.resultado ? ` — ${base.resultado}` : ''}`;
    else {
      const n = cotacoes.length;
      const qtd = inciso === 'IV' ? `${n} ${n === 1 ? 'proposta' : 'propostas'}` : `${n} ${n === 1 ? 'preço' : 'preços'}`;
      resumo = `Consultado${data ? ` ${data}` : ''} · ${qtd}${base.resultado ? ` — ${base.resultado}` : ''}`;
    }
    return {
      ...base,
      titulo: PARAMETROS_ART23[inciso].titulo,
      texto: PARAMETROS_ART23[inciso].texto,
      situacao_tela: situacaoTela,
      cotacoes: cotacoes.length,
      evidencia_resumo: resumo,
    };
  });
}

/** Valida o registro manual de um parâmetro (data não futura; sem retorno exige data). */
export function validarParametro(p: Partial<ParametroArt23>, hoje: string): string | null {
  if (!p.inciso || !INCISOS_ART23.includes(p.inciso)) return 'Inciso do art. 23, §1º inválido (I a V).';
  if (!p.situacao || !['CONSULTADO', 'SEM_RETORNO', 'NAO_CONSULTADO'].includes(p.situacao)) return 'Situação inválida.';
  if (p.situacao !== 'NAO_CONSULTADO') {
    const d = String(p.data_consulta ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Informe a data da consulta (AAAA-MM-DD).';
    if (d > hoje) return 'A data da consulta não pode ser futura.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estatística e método
// ---------------------------------------------------------------------------

export type MetodoPesquisa = 'MENOR' | 'MEDIA' | 'MEDIANA';
export const METODOS: MetodoPesquisa[] = ['MENOR', 'MEDIA', 'MEDIANA'];

/** Método da tela ↔ metodologia do documento PP (compatibilidade com o módulo antigo). */
export const METODOLOGIA_DO_METODO: Record<MetodoPesquisa, 'MENOR_VALOR' | 'MEDIA' | 'MEDIANA'> = {
  MENOR: 'MENOR_VALOR',
  MEDIA: 'MEDIA',
  MEDIANA: 'MEDIANA',
};
export function metodoDaMetodologia(m: string | null | undefined): MetodoPesquisa | null {
  if (m === 'MENOR_VALOR' || m === 'MENOR') return 'MENOR';
  if (m === 'MEDIA') return 'MEDIA';
  if (m === 'MEDIANA') return 'MEDIANA';
  return null;
}

const arred2 = (n: number) => Math.round(n * 100) / 100;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;

export interface EstatisticaPrecos {
  quantidade: number;
  menor: number | null;
  maior: number | null;
  media: number | null;
  mediana: number | null;
}

/** Menor, maior, média e mediana dos valores positivos. */
export function estatisticaDePrecos(valores: Array<number | string | null | undefined>): EstatisticaPrecos {
  const v = valores.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return { quantidade: 0, menor: null, maior: null, media: null, mediana: null };
  const meio = Math.floor(v.length / 2);
  const mediana = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  const media = v.reduce((a, b) => a + b, 0) / v.length;
  return { quantidade: v.length, menor: v[0], maior: v[v.length - 1], media: arred4(media), mediana: arred4(mediana) };
}

export function valorPeloMetodo(e: EstatisticaPrecos, metodo: MetodoPesquisa): number | null {
  if (metodo === 'MENOR') return e.menor;
  if (metodo === 'MEDIA') return e.media;
  return e.mediana;
}

/**
 * REGRA DOS 3 PREÇOS: a estimativa usa no mínimo 3 preços válidos; com menos,
 * só com justificativa (art. 23, §1º, IV; IN SEGES/ME 65/2021, art. 6º, §5º).
 */
export function regraDosTresPrecos(precosValidos: number, justificativa?: string | null): { atende: boolean; motivo: string } {
  if (precosValidos >= 3) return { atende: true, motivo: `${precosValidos} preços válidos (mínimo 3).` };
  if (String(justificativa ?? '').trim().length >= 10) {
    return { atende: true, motivo: `Só ${precosValidos} ${precosValidos === 1 ? 'preço válido' : 'preços válidos'}, com justificativa registrada.` };
  }
  return { atende: false, motivo: `Só ${precosValidos} ${precosValidos === 1 ? 'preço válido' : 'preços válidos'}: são necessários 3, ou a justificativa de por que não foi possível obtê-los.` };
}

// ---------------------------------------------------------------------------
// Validade e idade da cotação (PRECO-02 e PRECO-03)
// ---------------------------------------------------------------------------

export interface AlertaCotacao {
  codigo: 'VENCIDA' | 'VENCE_ANTES_DA_PUBLICACAO' | 'EMITIDA_HA_MAIS_DE_6_MESES' | 'SEM_DATA_DE_EMISSAO';
  mensagem: string;
}

/** Soma meses a uma data AAAA-MM-DD (fim de mês ajustado). */
export function somarMeses(dia: string, meses: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Alertas de uma cotação (datas AAAA-MM-DD, no dia de Brasília):
 *  - VENCIDA: validade anterior a hoje;
 *  - VENCE_ANTES_DA_PUBLICACAO: validade anterior à publicação prevista;
 *  - EMITIDA_HA_MAIS_DE_6_MESES: emissão mais de 6 meses antes da
 *    publicação prevista (ou de hoje, sem previsão) — art. 23, §1º, IV.
 */
export function alertasDaCotacao(
  c: { data_emissao?: string | null; validade_ate?: string | null; data_pesquisa?: string | null },
  ref: { hoje: string; publicacao_prevista?: string | null },
): AlertaCotacao[] {
  const alertas: AlertaCotacao[] = [];
  const emissao = String(c.data_emissao || c.data_pesquisa || '').slice(0, 10);
  const validade = String(c.validade_ate || '').slice(0, 10);
  const publicacao = String(ref.publicacao_prevista || '').slice(0, 10);
  const data = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (data(validade)) {
    if (validade < ref.hoje) alertas.push({ codigo: 'VENCIDA', mensagem: `Cotação vencida em ${fmtDiaBr(validade)}.` });
    else if (data(publicacao) && validade < publicacao) {
      alertas.push({
        codigo: 'VENCE_ANTES_DA_PUBLICACAO',
        mensagem: `Vence em ${fmtDiaBr(validade)}, antes da publicação prevista (${fmtDiaBr(publicacao)}). Renovar ou registrar a ressalva.`,
      });
    }
  }
  if (!data(emissao)) {
    alertas.push({ codigo: 'SEM_DATA_DE_EMISSAO', mensagem: 'Sem data de emissão — informe a data que consta na proposta.' });
  } else {
    const base = data(publicacao) && publicacao > ref.hoje ? publicacao : ref.hoje;
    if (somarMeses(emissao, 6) < base) {
      alertas.push({
        codigo: 'EMITIDA_HA_MAIS_DE_6_MESES',
        mensagem: `Emitida em ${fmtDiaBr(emissao)}: mais de 6 meses antes da ${base === publicacao ? 'publicação prevista' : 'data de hoje'} (art. 23, §1º, IV).`,
      });
    }
  }
  return alertas;
}

/** A cotação conta como preço válido? (sem vencimento e emitida há até 6 meses) */
export function cotacaoValida(alertas: AlertaCotacao[]): boolean {
  return !alertas.some((a) => a.codigo === 'VENCIDA' || a.codigo === 'EMITIDA_HA_MAIS_DE_6_MESES');
}

// ---------------------------------------------------------------------------
// Cotações diretas (propostas) e resumo da pesquisa
// ---------------------------------------------------------------------------

export interface CotacaoComGrupo extends CotacaoPorFonte {
  grupo_id?: string;
  data_emissao?: string;
  validade_ate?: string;
}

export interface PropostaDireta {
  grupo_id: string;
  fornecedor: string;
  cnpj: string | null;
  data_emissao: string | null;
  validade_ate: string | null;
  comprovante: boolean;
  itens: Array<{ item_numero: number; descricao: string; quantidade: number; valor_unitario: number; valor_total: number }>;
  total: number;
  alertas: AlertaCotacao[];
  valida: boolean;
}

const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/**
 * Cotações diretas (fonte FORNECEDOR_DIRETO) agrupadas por proposta: pelo
 * `grupo_id` (propostas lançadas pela tela nova) ou pelo CNPJ/fornecedor
 * (cotações lançadas item a item no módulo antigo).
 */
export function propostasDiretas(itens: ItemPesquisaPrecos[], ref: { hoje: string; publicacao_prevista?: string | null }): PropostaDireta[] {
  const mapa = new Map<string, PropostaDireta>();
  for (const item of itens || []) {
    (item.cotacoes || []).forEach((c0) => {
      const c = c0 as CotacaoComGrupo;
      if (c.fonte !== 'FORNECEDOR_DIRETO') return;
      const chave = c.grupo_id || `cnpj:${soDigitos(c.fornecedor_cnpj) || String(c.fornecedor_razao_social || c.descricao_fonte || '').trim().toLowerCase()}`;
      let p = mapa.get(chave);
      if (!p) {
        p = {
          grupo_id: chave,
          fornecedor: String(c.fornecedor_razao_social || c.descricao_fonte || 'Fornecedor'),
          cnpj: c.fornecedor_cnpj || null,
          data_emissao: (c.data_emissao || c.data_pesquisa || '').slice(0, 10) || null,
          validade_ate: (c.validade_ate || '').slice(0, 10) || null,
          comprovante: !!c.documento_comprobatorio_path,
          itens: [],
          total: 0,
          alertas: [],
          valida: true,
        };
        mapa.set(chave, p);
      }
      const q = Number(item.quantidade) || 1;
      const vu = Number(c.valor_unitario) || 0;
      p.itens.push({ item_numero: item.item_numero, descricao: item.descricao, quantidade: q, valor_unitario: vu, valor_total: arred2(q * vu) });
      p.total = arred2(p.total + q * vu);
      p.comprovante = p.comprovante || !!c.documento_comprobatorio_path;
    });
  }
  const lista = [...mapa.values()];
  for (const p of lista) {
    p.alertas = alertasDaCotacao({ data_emissao: p.data_emissao, validade_ate: p.validade_ate }, ref);
    p.valida = cotacaoValida(p.alertas);
  }
  return lista.sort((a, b) => a.total - b.total);
}

export interface ItemResumo {
  item_numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  estatistica: EstatisticaPrecos;
  valor_unitario_adotado: number | null;
  valor_total_adotado: number | null;
  tres_precos: { atende: boolean; motivo: string };
}

export interface ResumoPesquisa {
  metodo: MetodoPesquisa | null;
  itens: ItemResumo[];
  /** Totais (Σ quantidade × valor) por método — "Menor preço", "Mediana", "Média" do mockup. */
  totais: Record<MetodoPesquisa, number>;
  total_adotado: number | null;
  tres_precos: { atende: boolean; motivo: string };
  precos_validos_por_item_minimo: number;
}

/**
 * Resumo da pesquisa: estatística por item (sem as cotações descartadas como
 * outlier e sem as cotações diretas inválidas — vencidas ou com mais de 6
 * meses), totais por método e o total adotado.
 */
export function resumoDaPesquisa(
  itens: ItemPesquisaPrecos[],
  metodo: MetodoPesquisa | null,
  ref: { hoje: string; publicacao_prevista?: string | null },
  justificativaMenosDeTres?: string | null,
): ResumoPesquisa {
  const totais: Record<MetodoPesquisa, number> = { MENOR: 0, MEDIA: 0, MEDIANA: 0 };
  let minimo = Infinity;
  const linhas: ItemResumo[] = (itens || []).map((item) => {
    const q = Number(item.quantidade) || 1;
    const valores = (item.cotacoes || [])
      .filter((_, idx) => !item.outliers_descartados?.some((o) => o.cotacao_index === idx))
      .filter((c0) => {
        const c = c0 as CotacaoComGrupo;
        if (c.fonte !== 'FORNECEDOR_DIRETO') return true;
        return cotacaoValida(alertasDaCotacao({ data_emissao: c.data_emissao ?? c.data_pesquisa, validade_ate: c.validade_ate }, ref));
      })
      .map((c) => Number(c.valor_unitario));
    const e = estatisticaDePrecos(valores);
    minimo = Math.min(minimo, e.quantidade);
    for (const m of METODOS) totais[m] = arred2(totais[m] + q * (valorPeloMetodo(e, m) ?? 0));
    const adotado = metodo ? valorPeloMetodo(e, metodo) : null;
    return {
      item_numero: item.item_numero,
      descricao: item.descricao,
      quantidade: q,
      unidade: item.unidade,
      estatistica: e,
      valor_unitario_adotado: adotado !== null ? arred2(adotado) : null,
      valor_total_adotado: adotado !== null ? arred2(q * adotado) : null,
      tres_precos: regraDosTresPrecos(e.quantidade, justificativaMenosDeTres),
    };
  });
  const minimoValidos = Number.isFinite(minimo) ? minimo : 0;
  return {
    metodo,
    itens: linhas,
    totais,
    total_adotado: metodo ? totais[metodo] : null,
    tres_precos: linhas.length
      ? regraDosTresPrecos(minimoValidos, justificativaMenosDeTres)
      : { atende: false, motivo: 'A pesquisa não tem itens.' },
    precos_validos_por_item_minimo: minimoValidos,
  };
}

/**
 * Pendências para emitir o mapa e a certidão: método e justificativa
 * obrigatórios; justificativa da escolha dos fornecedores quando há cotação
 * direta; regra dos 3 preços; todos os 5 parâmetros registrados (consultado,
 * sem retorno ou não consultado — o "não consultado" fica como pendência de
 * atenção, não bloqueia).
 */
export function pendenciasDaPesquisa(
  resumo: ResumoPesquisa,
  dados: { justificativa_metodo?: string | null; justificativa_fornecedores?: string | null; tem_cotacao_direta: boolean },
): { bloqueios: string[]; avisos: string[] } {
  const bloqueios: string[] = [];
  const avisos: string[] = [];
  if (!resumo.itens.length) bloqueios.push('A pesquisa não tem itens.');
  if (!resumo.metodo) bloqueios.push('Escolha o método: menor preço, média ou mediana.');
  if (String(dados.justificativa_metodo ?? '').trim().length < 10) bloqueios.push('Justifique o método adotado (obrigatória).');
  if (dados.tem_cotacao_direta && String(dados.justificativa_fornecedores ?? '').trim().length < 10) {
    bloqueios.push('Justifique a escolha dos fornecedores consultados (art. 23, §1º, IV).');
  }
  if (!resumo.tres_precos.atende) bloqueios.push(resumo.tres_precos.motivo);
  if (resumo.itens.some((i) => i.estatistica.quantidade === 0)) bloqueios.push('Há item sem nenhum preço válido.');
  return { bloqueios, avisos };
}
