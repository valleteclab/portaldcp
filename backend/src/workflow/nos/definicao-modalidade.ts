/**
 * DEFINIÇÃO DA MODALIDADE (mockup aprovado em 12/10/2026) — regras puras.
 *
 * Nos autos da Câmara a modalidade não nasce no DFD: o ETP ou o TR indicam,
 * o Setor de Licitações justifica e a numeração por modalidade sai na
 * autuação. No sistema é uma etapa do fluxo de INSTRUÇÃO (sempre a última):
 * ao concluir, a licitação recebe modalidade, enquadramento e número, e o
 * processo passa para o fluxo daquela modalidade.
 */
import { definicaoDoFundamento, fundamentoPadrao, motivoFundamentoInvalido } from '../../licitacoes/fundamento-legal';
import { MODALIDADES_CONTRATACAO, rotuloModalidade } from '../aplicacao/aplicacao-fluxo';

export const TIPO_DEFINICAO_MODALIDADE = 'DEFINICAO_MODALIDADE';
export const JUSTIFICATIVA_MINIMA_MODALIDADE = 20;

export interface DefinicaoModalidade {
  modalidade: string;
  fundamento: string | null;
  justificativa: string;
}

/** Lê a resposta da tarefa (o que a tela mandou ao concluir). */
export function lerDefinicao(resposta: unknown): DefinicaoModalidade {
  const r = (resposta ?? {}) as Record<string, unknown>;
  const modalidade = String(r.modalidade ?? '').trim().toUpperCase();
  const fundamento = r.fundamento ? String(r.fundamento).trim().toUpperCase() : null;
  return { modalidade, fundamento: fundamento || null, justificativa: String(r.justificativa ?? '').trim() };
}

/** O enquadramento que vale: o escolhido, senão o padrão da modalidade (art. 75, II; art. 74, caput…). */
export function fundamentoDaDefinicao(d: DefinicaoModalidade, tipoContratacao?: string | null): string | null {
  return d.fundamento || fundamentoPadrao(d.modalidade, tipoContratacao) || null;
}

/** O que impede concluir a etapa (vazio = pode). */
export function pendenciasDaDefinicao(d: DefinicaoModalidade): string[] {
  const p: string[] = [];
  if (!MODALIDADES_CONTRATACAO.some((m) => m.codigo === d.modalidade)) p.push('Escolha a modalidade da contratação.');
  else if (d.fundamento) {
    const recusa = motivoFundamentoInvalido(d.modalidade, d.fundamento);
    if (recusa) p.push(recusa);
  }
  if (d.justificativa.length < JUSTIFICATIVA_MINIMA_MODALIDADE) p.push(`Escreva a justificativa da escolha (ao menos ${JUSTIFICATIVA_MINIMA_MODALIDADE} caracteres): ela vai para os autos.`);
  return p;
}

/** "Inexigibilidade · art. 74, III, "f"" — como a escolha aparece no andamento e nos avisos. */
export function rotuloDaDefinicao(modalidade: string, fundamento: string | null): string {
  const ref = definicaoDoFundamento(fundamento)?.referencia;
  return ref ? `${rotuloModalidade(modalidade)} · ${ref}` : rotuloModalidade(modalidade);
}

/** Texto do despacho que entra nos autos como folha. */
export function textoDoDespacho(d: DefinicaoModalidade, fundamento: string | null, numero: string | null): string {
  const ref = definicaoDoFundamento(fundamento)?.referencia;
  return [
    `Definida a modalidade ${rotuloModalidade(d.modalidade)}${ref ? `, com fundamento na Lei 14.133/2021, ${ref}` : ''}${numero ? ` (${rotuloModalidade(d.modalidade)} nº ${numero})` : ''}.`,
    '',
    `Justificativa: ${d.justificativa}`,
  ].join('\n');
}

/** Próximo número da modalidade no ano ("034/2026"), a partir dos números já usados. */
export function proximoNumeroDaModalidade(usados: Array<string | null>, ano: number): string {
  const doAno = usados
    .map((u) => String(u ?? '').match(/^(\d+)\s*\/\s*(\d{4})$/))
    .filter((m): m is RegExpMatchArray => !!m && Number(m[2]) === ano)
    .map((m) => Number(m[1]));
  const proximo = (doAno.length ? Math.max(...doAno) : 0) + 1;
  return `${String(proximo).padStart(3, '0')}/${ano}`;
}

/** O fluxo de instrução é o de Contratação que termina na Definição da modalidade. */
export function ehFluxoDeInstrucao(tiposDasEtapas: string[]): boolean {
  return tiposDasEtapas.map((t) => String(t).toUpperCase()).includes(TIPO_DEFINICAO_MODALIDADE);
}

/** Na instrução, a Definição da modalidade é sempre a última etapa. */
export function errosDaInstrucao(tiposDasEtapas: string[]): string[] {
  const tipos = tiposDasEtapas.map((t) => String(t).toUpperCase());
  const n = tipos.filter((t) => t === TIPO_DEFINICAO_MODALIDADE).length;
  if (!n) return [];
  const erros: string[] = [];
  if (n > 1) erros.push('A Definição da modalidade aparece mais de uma vez: deixe só uma.');
  if (tipos[tipos.length - 1] !== TIPO_DEFINICAO_MODALIDADE) erros.push('A Definição da modalidade precisa ser a última etapa da instrução: depois dela o processo segue o fluxo da modalidade.');
  return erros;
}
