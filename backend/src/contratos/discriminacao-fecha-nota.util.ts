/**
 * A discriminação das despesas da medição tem que FECHAR com o valor da nota
 * fiscal: a soma das linhas é o valor bruto da nota. Câmara, medição 007 do
 * contrato 039/2023 (11/2026): o fornecedor lançou só "ISS R$ 520,51" numa nota
 * de R$ 20.820,48 e o boletim saiu com total de 2,5% — faltou o serviço.
 * O nome de cada linha é livre (o fornecedor pode errar o nome do imposto); o
 * que não pode é o total não ser o da nota.
 */
export const TOLERANCIA_DISCRIMINACAO = 0.02;

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface ConferenciaDiscriminacao {
  ok: boolean;
  soma: number;
  esperado: number;
  /** esperado − soma: positivo = falta discriminar; negativo = passou do valor da nota. */
  diferenca: number;
  mensagem: string | null;
}

/**
 * Confere a soma das linhas contra o valor da nota (ou, sem nota informada, o
 * valor da medição). Sem nenhuma linha, ou sem valor de referência, não há o
 * que conferir.
 */
export function conferirDiscriminacaoFechaNota(
  linhas: Array<{ valor: number | string | null | undefined }>,
  valorNota: number | string | null | undefined,
  valorMedicao: number | string | null | undefined,
): ConferenciaDiscriminacao {
  const centavos = (v: unknown) => Math.round((Number(v) || 0) * 100);
  const soma = linhas.reduce((s, l) => s + centavos(l.valor), 0) / 100;
  const nota = centavos(valorNota) / 100;
  const esperado = nota > 0 ? nota : centavos(valorMedicao) / 100;
  const diferenca = Math.round((esperado - soma) * 100) / 100;
  if (linhas.length === 0 || esperado <= 0 || Math.abs(diferenca) <= TOLERANCIA_DISCRIMINACAO) {
    return { ok: true, soma, esperado, diferenca, mensagem: null };
  }
  const referencia = nota > 0 ? 'da nota fiscal' : 'da medição';
  const oQueFazer =
    diferenca > 0
      ? `Faltam ${reais(diferenca)}: inclua as linhas que faltam (por exemplo, o valor dos serviços) até a soma dar o valor ${referencia}.`
      : `Passou ${reais(-diferenca)}: ajuste as linhas até a soma dar o valor ${referencia}.`;
  return {
    ok: false,
    soma,
    esperado,
    diferenca,
    mensagem:
      `A discriminação das despesas soma ${reais(soma)}, mas o valor ${referencia} é ${reais(esperado)}. ${oQueFazer}`,
  };
}
