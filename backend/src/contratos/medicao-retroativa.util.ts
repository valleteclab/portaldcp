/**
 * ============================================================================
 * LANÇAMENTO RETROATIVO DE MEDIÇÃO — regras puras (sem banco)
 * ============================================================================
 *
 * Suporte registra uma medição JÁ APROVADA quando a execução foi liquidada e
 * paga na contabilidade sem ter passado pelo fluxo do sistema (caso da Ata de
 * Registro de Preços 001/2025, OS-0116/2026 — NF 14, 240 unidades do item 01).
 *
 * As validações e o cálculo do valor ficam aqui para poderem ser testados sem
 * banco; o serviço faz as consultas e chama estas funções.
 */

import { BadRequestException } from '@nestjs/common';

/** Tamanho mínimo do motivo — o registro precisa explicar a origem contábil. */
export const MOTIVO_RETROATIVO_MIN_CARACTERES = 10;

export interface ItemCronogramaRetroativo {
  id: string;
  descricao?: string | null;
  valor_total?: number | string | null;
}

export interface ItemMedicaoRetroativoPayload {
  item_cronograma_id: string;
  quantidade_medida: number | string;
}

export interface ItensMedicaoRetroativaCalculados {
  itens: Array<{
    item_cronograma_id: string;
    quantidade_medida: number;
    valor_medido: number;
  }>;
  valor_medido: number;
  percentual_fisico_medido: number;
}

/** Motivo obrigatório; devolve o motivo já aparado. */
export function validarMotivoRetroativo(motivo?: string | null): string {
  const texto = String(motivo ?? '').trim();
  if (texto.length < MOTIVO_RETROATIVO_MIN_CARACTERES) {
    throw new BadRequestException(
      `Informe o motivo do lançamento retroativo (mínimo ${MOTIVO_RETROATIVO_MIN_CARACTERES} caracteres) — ex.: número da NF, valor e data do pagamento.`,
    );
  }
  return texto;
}

export interface OsParaMedicaoRetroativa {
  id: string;
  numero?: string | null;
  contrato_id: string;
  tipo: string;
  /** Medição ativa (status <> REJEITADA) já vinculada a esta OS, se houver. */
  medicao_ativa?: { numero_medicao?: number | null; status?: string | null } | null;
}

/**
 * A OS informada precisa ser do mesmo contrato, ser ordem de serviço e ainda não
 * ter medição ativa — caso contrário o lançamento retroativo duplicaria consumo.
 */
export function validarOsMedicaoRetroativa(
  os: OsParaMedicaoRetroativa | null | undefined,
  contratoId: string,
  tipoOrdemServico: string,
): void {
  if (!os) {
    throw new BadRequestException(
      'Ordem de serviço informada não encontrada.',
    );
  }
  if (os.contrato_id !== contratoId) {
    throw new BadRequestException(
      'A ordem de serviço escolhida pertence a outro contrato.',
    );
  }
  if (os.tipo !== tipoOrdemServico) {
    throw new BadRequestException(
      'A requisição escolhida não é uma ordem de serviço.',
    );
  }
  if (os.medicao_ativa) {
    throw new BadRequestException(
      `A OS ${os.numero || os.id} já está vinculada à ${os.medicao_ativa.numero_medicao || '?'}ª medição ` +
        `(${os.medicao_ativa.status || '—'}). Use o fluxo normal ou corrija a OS daquela medição.`,
    );
  }
}

/**
 * Valor da medição a partir dos itens do cronograma: soma de
 * `quantidade × valor_unitario` (o cálculo por item vem do serviço, que conhece
 * a regra de arredondamento do contrato e o proporcional de itens MENSAL).
 */
export function calcularItensMedicaoRetroativa(
  itensPayload: ItemMedicaoRetroativoPayload[] | null | undefined,
  buscarItemCronograma: (id: string) => ItemCronogramaRetroativo | null | undefined,
  calcularValorItem: (item: ItemCronogramaRetroativo, quantidade: number) => number,
): ItensMedicaoRetroativaCalculados {
  const payload = (itensPayload || []).filter((i) => i && i.item_cronograma_id);
  if (payload.length === 0) {
    throw new BadRequestException(
      'Informe pelo menos um item do cronograma com a quantidade medida.',
    );
  }

  const itens: ItensMedicaoRetroativaCalculados['itens'] = [];
  let valorMedido = 0;
  let percentualFisicoMedido = 0;

  for (const linha of payload) {
    const itemCron = buscarItemCronograma(linha.item_cronograma_id);
    if (!itemCron) {
      throw new BadRequestException(
        `Item do cronograma ${linha.item_cronograma_id} não encontrado neste contrato.`,
      );
    }
    const quantidade = Number(linha.quantidade_medida) || 0;
    if (quantidade <= 0) continue;

    const valorItem = calcularValorItem(itemCron, quantidade);
    valorMedido += valorItem;

    const valorTotalItem = Number(itemCron.valor_total) || 1;
    percentualFisicoMedido += (valorItem / valorTotalItem) * 100;

    itens.push({
      item_cronograma_id: linha.item_cronograma_id,
      quantidade_medida: quantidade,
      valor_medido: valorItem,
    });
  }

  if (itens.length === 0 || valorMedido <= 0) {
    throw new BadRequestException(
      'A medição retroativa deve ter pelo menos um item com quantidade maior que zero.',
    );
  }

  return {
    itens,
    valor_medido: valorMedido,
    percentual_fisico_medido: percentualFisicoMedido,
  };
}

// ============================================================================
// PERÍODO x CICLO DO CONTRATO
// ============================================================================
//
// Caso real (Ata 001/2025, OS-0116/2026): o suporte digitou o período
// 01/05/2026 a 30/05/2026 para uma OS de 22/06/2026, num contrato com renovação
// de ciclo em 14/05/2026. Como o consumo do ciclo só soma medições com
// periodo_inicio >= a data de corte, a medição ficou FORA do ciclo e o saldo do
// item subiu em vez de cair. As funções abaixo existem para sugerir o período
// certo a partir da data da OS e para avisar quando o período informado cai
// antes do corte (aviso, não bloqueio: uma medição retroativa pode legitimamente
// pertencer ao ciclo anterior).

export interface PeriodoSugerido {
  /** Primeiro dia do mês da OS, em 'YYYY-MM-DD'. */
  inicio: string;
  /** Último dia do mesmo mês, em 'YYYY-MM-DD'. */
  fim: string;
}

/**
 * Normaliza uma data para 'YYYY-MM-DD' comparável como data pura.
 * Strings já vêm no formato ISO (o driver devolve date como 'YYYY-MM-DD');
 * objetos Date usam o ISO em UTC — a mesma normalização do corte de ciclo em
 * `calcularQuantidadeAprovadaPorItem`, para não recuar um dia por fuso.
 */
export function normalizarDataPura(
  valor: string | Date | null | undefined,
): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime())
      ? null
      : valor.toISOString().slice(0, 10);
  }
  const texto = String(valor).trim();
  if (!texto) return null;
  const casa = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (casa) return `${casa[1]}-${casa[2]}-${casa[3]}`;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

/**
 * Período sugerido a partir da data da ordem de serviço: do primeiro ao último
 * dia do mês da OS. É só sugestão — o suporte continua podendo editar.
 */
export function sugerirPeriodoDaOrdem(
  dataOrdem: string | Date | null | undefined,
): PeriodoSugerido | null {
  const pura = normalizarDataPura(dataOrdem);
  if (!pura) return null;
  const ano = Number(pura.slice(0, 4));
  const mes = Number(pura.slice(5, 7));
  if (!ano || !mes || mes < 1 || mes > 12) return null;
  // Dia 0 do mês seguinte = último dia do mês (cobre dezembro e fevereiro bissexto).
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mesTexto = String(mes).padStart(2, '0');
  return {
    inicio: `${ano}-${mesTexto}-01`,
    fim: `${ano}-${mesTexto}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

/**
 * Devolve o texto do aviso quando o período informado começa ANTES do corte do
 * ciclo vigente — nesse caso a medição não entra no consumo do ciclo atual.
 * Retorna null quando não há ciclo ou quando o período está dentro dele.
 */
export function avisoPeriodoForaDoCiclo(
  periodoInicio: string | Date | null | undefined,
  dataCorteCiclo: string | Date | null | undefined,
): string | null {
  const inicio = normalizarDataPura(periodoInicio);
  const corte = normalizarDataPura(dataCorteCiclo);
  if (!inicio || !corte) return null;
  if (inicio >= corte) return null;
  const parteBR = (iso: string) => iso.split('-').reverse().join('/');
  return (
    `O período informado começa em ${parteBR(inicio)}, antes do início do ciclo vigente ` +
    `(${parteBR(corte)}). Esta medição ficou FORA do ciclo atual e por isso NÃO consome ` +
    `o saldo do ciclo vigente. Se a execução é do ciclo atual, corrija o período da medição.`
  );
}
