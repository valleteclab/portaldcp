/**
 * OFÍCIO (mockup aprovado em 06/10/2026): processo livre — escreve, assina e
 * envia. O número do ofício sai ao juntar o documento, na sequência do setor
 * de quem assina, por ano (fuso de Brasília): "Ofício nº 014/2026".
 *
 * O texto traz a marca "[número do ofício]" onde o número deve aparecer; ela
 * é trocada pelo número definitivo ao assinar, antes de gerar o PDF. (Não é
 * uma variável {{…}}: essas viram lacuna no editor e travariam a assinatura.)
 */

export const TIPO_PECA_OFICIO = 'OFICIO';
export const MARCA_NUMERO_OFICIO = '[número do ofício]';

/** Ano no fuso de Brasília (um ofício de 31/12 às 22h é do ano que termina). */
export function anoDeBrasilia(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(d));
}

export function numeroDoOficio(sequencia: number, ano: number): string {
  if (!Number.isInteger(sequencia) || sequencia < 1) throw new Error('Sequência do ofício inválida');
  return `${String(sequencia).padStart(3, '0')}/${ano}`;
}

export function tituloDoOficio(numero: string): string {
  return `Ofício nº ${numero}`;
}

export function numerarTexto(texto: string, numero: string): string {
  return texto.split(MARCA_NUMERO_OFICIO).join(numero);
}

/** Chave do bloqueio da sequência (um contador por órgão, setor e ano). */
export function chaveSequenciaOficio(orgaoId: string, setorId: string | null, ano: number): string {
  return `oficio:${orgaoId}:${setorId ?? 'sem-setor'}:${ano}`;
}
