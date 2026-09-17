/**
 * Boletim de medição de OBRA — modelo 2 (leitura).
 *
 * Monta, a partir dos mesmos dados do boletim oficial (montarDadosPdfFrontend),
 * o que o modelo novo mostra: situação de TODAS as etapas na data desta
 * medição, resumo do contrato (anterior / período / acumulado / saldo),
 * quantidades dos itens medidos e o valor líquido a pagar. Não altera o
 * boletim oficial.
 */

const centavos = (v: unknown) => Math.round((Number(v) || 0) * 100);
const reais = (c: number) => c / 100;

export interface EtapaContratadaV2 {
  numero: number;
  descricao: string;
  valor_previsto: number;
  percentual_fisico?: number;
  itens?: ItemEtapaV2[];
}

export interface ItemEtapaV2 {
  descricao: string;
  unidade?: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total?: number;
  marca?: string;
  modelo?: string;
}

/** Etapa medida nesta medição, como vem em dados.etapas do boletim oficial. */
export interface EtapaMedidaV2 {
  numero: number;
  percentual_executado_anterior: number;
  percentual_executado_atual: number;
  percentual_executado_acumulado: number;
  valor_acumulado_anterior: number;
  valor_medido: number;
  valor_ate_periodo: number;
  valor_a_executar: number;
  itens?: ItemEtapaV2[];
}

/** Soma das medições aprovadas ANTERIORES a esta, por número de etapa. */
export interface AnteriorPorEtapa {
  percentual: number;
  valor: number;
}

export interface LinhaEtapaV2 {
  numero: number;
  descricao: string;
  valor_previsto: number;
  pct_anterior: number;
  pct_periodo: number;
  pct_acumulado: number;
  valor_anterior: number;
  valor_periodo: number;
  valor_acumulado: number;
  valor_saldo: number;
  medida_no_periodo: boolean;
}

export interface ResumoV2 {
  valor_contrato: number;
  valor_anterior: number;
  valor_periodo: number;
  valor_acumulado: number;
  valor_saldo: number;
  pct_anterior: number;
  pct_periodo: number;
  pct_acumulado: number;
  pct_saldo: number;
}

const limitarPct = (v: number) => Math.min(100, Math.max(0, Number(v) || 0));

/**
 * Uma linha por etapa do cronograma. Etapas medidas agora usam os números do
 * boletim oficial; as demais usam o acumulado das medições anteriores.
 */
export function situacaoEtapas(
  contratadas: EtapaContratadaV2[],
  medidas: EtapaMedidaV2[],
  anteriores: Map<number, AnteriorPorEtapa>,
): LinhaEtapaV2[] {
  const medidaPorNumero = new Map(medidas.map((m) => [Number(m.numero), m]));
  return [...contratadas]
    .sort((a, b) => Number(a.numero) - Number(b.numero))
    .map((e) => {
      const previstoC = centavos(e.valor_previsto);
      const m = medidaPorNumero.get(Number(e.numero));
      if (m) {
        const anteriorC = centavos(m.valor_acumulado_anterior);
        const periodoC = centavos(m.valor_medido);
        const acumuladoC = centavos(m.valor_ate_periodo) || anteriorC + periodoC;
        return {
          numero: Number(e.numero),
          descricao: e.descricao,
          valor_previsto: reais(previstoC),
          pct_anterior: limitarPct(m.percentual_executado_anterior),
          pct_periodo: limitarPct(m.percentual_executado_atual),
          pct_acumulado: limitarPct(m.percentual_executado_acumulado),
          valor_anterior: reais(anteriorC),
          valor_periodo: reais(periodoC),
          valor_acumulado: reais(acumuladoC),
          valor_saldo: reais(Math.max(0, previstoC - acumuladoC)),
          medida_no_periodo: true,
        };
      }
      const ant = anteriores.get(Number(e.numero));
      const anteriorC = Math.min(previstoC, centavos(ant?.valor));
      const pct = limitarPct(ant?.percentual ?? 0);
      return {
        numero: Number(e.numero),
        descricao: e.descricao,
        valor_previsto: reais(previstoC),
        pct_anterior: pct,
        pct_periodo: 0,
        pct_acumulado: pct,
        valor_anterior: reais(anteriorC),
        valor_periodo: 0,
        valor_acumulado: reais(anteriorC),
        valor_saldo: reais(Math.max(0, previstoC - anteriorC)),
        medida_no_periodo: false,
      };
    });
}

/** Resumo do contrato; percentuais sobre o valor do contrato (ou a soma das etapas). */
export function resumoContrato(linhas: LinhaEtapaV2[], valorContrato?: number | null): ResumoV2 {
  const soma = (campo: keyof LinhaEtapaV2) => linhas.reduce((s, l) => s + centavos(l[campo]), 0);
  const previstoC = soma('valor_previsto');
  const contratoC = centavos(valorContrato) || previstoC;
  const anteriorC = soma('valor_anterior');
  const periodoC = soma('valor_periodo');
  const acumuladoC = anteriorC + periodoC;
  const saldoC = Math.max(0, contratoC - acumuladoC);
  const pct = (c: number) => (contratoC > 0 ? Math.round((c / contratoC) * 10000) / 100 : 0);
  return {
    valor_contrato: reais(contratoC),
    valor_anterior: reais(anteriorC),
    valor_periodo: reais(periodoC),
    valor_acumulado: reais(acumuladoC),
    valor_saldo: reais(saldoC),
    pct_anterior: pct(anteriorC),
    pct_periodo: pct(periodoC),
    pct_acumulado: pct(acumuladoC),
    pct_saldo: pct(saldoC),
  };
}

export interface LinhaItemMedidoV2 {
  descricao: string;
  unidade: string;
  qtd_contratada: number;
  qtd_anterior: number;
  qtd_periodo: number;
  qtd_saldo: number;
  valor_unitario: number;
  valor_periodo: number;
}

/**
 * Quantidades de cada item da etapa medida, pelo percentual da etapa (regra
 * atual do sistema). O valor do período dos itens fecha exatamente o valor
 * medido da etapa: a diferença de centavos vai para o maior item.
 */
export function itensMedidosDaEtapa(etapa: EtapaMedidaV2, itensContratados: ItemEtapaV2[]): LinhaItemMedidoV2[] {
  const itens = (itensContratados || []).filter((i) => String(i?.descricao || '').trim());
  if (!itens.length) return [];
  const pAnt = limitarPct(etapa.percentual_executado_anterior) / 100;
  const pPer = limitarPct(etapa.percentual_executado_atual) / 100;
  const q = (v: number) => Math.round(v * 100) / 100;
  const linhas = itens.map((i) => {
    const qtd = Number(i.quantidade) || 0;
    const total = Number(i.valor_total) || qtd * (Number(i.valor_unitario) || 0);
    const qAnt = q(qtd * pAnt);
    const qPer = q(qtd * pPer);
    return {
      descricao: i.descricao,
      unidade: String(i.unidade || '').trim(),
      qtd_contratada: qtd,
      qtd_anterior: qAnt,
      qtd_periodo: qPer,
      qtd_saldo: Math.max(0, q(qtd - qAnt - qPer)),
      valor_unitario: Number(i.valor_unitario) || 0,
      valor_periodo_c: Math.round(total * pPer * 100),
      total_c: Math.round(total * 100),
    };
  });
  const alvoC = centavos(etapa.valor_medido);
  const somaC = linhas.reduce((s, l) => s + l.valor_periodo_c, 0);
  if (alvoC > 0 && somaC !== alvoC) {
    const maior = linhas.reduce((a, b) => (b.total_c > a.total_c ? b : a));
    maior.valor_periodo_c += alvoC - somaC;
  }
  return linhas.map(({ valor_periodo_c, total_c: _t, ...l }) => ({ ...l, valor_periodo: valor_periodo_c / 100 }));
}

const TRIBUTOS = /\b(ISS|ISSQN|IRRF|IR|INSS|PIS|COFINS|CSLL|PCC|CPRB)\b/i;

/**
 * Do bruto ao líquido: linhas da discriminação que são tributos viram
 * descontos; o líquido é recalculado (a linha "SERVIÇOS" do boletim atual é
 * justamente esse líquido).
 */
export function valorAPagar(bruto: number, discriminacoes: Array<{ descricao: string; valor: number; percentual?: number }> | undefined) {
  const brutoC = centavos(bruto);
  const descontos = (discriminacoes || [])
    .filter((d) => TRIBUTOS.test(String(d.descricao || '')))
    .map((d) => ({ descricao: String(d.descricao).trim(), valor: reais(centavos(d.valor)), percentual: Number(d.percentual) || 0 }));
  const descontosC = descontos.reduce((s, d) => s + centavos(d.valor), 0);
  return { bruto: reais(brutoC), descontos, liquido: reais(Math.max(0, brutoC - descontosC)) };
}
