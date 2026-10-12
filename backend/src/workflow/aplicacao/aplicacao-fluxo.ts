/**
 * ONDE O FLUXO VALE (mockup aprovado em 12/10/2026) — cada modalidade, e
 * dentro dela cada enquadramento, pode ter o seu fluxo de Contratação ativo.
 * Regras puras (sem banco):
 *
 *  - Um caso, um fluxo: o mesmo enquadramento (ou a mesma modalidade inteira,
 *    ou o padrão) não fica em dois fluxos ativos — a ativação é barrada.
 *  - Escolha do mais específico: enquadramento > modalidade > padrão.
 *  - Fluxo sem "onde vale" gravado (os de antes desta regra) vale como padrão.
 */
import { definicaoDoFundamento, fundamentosDaModalidade } from '../../licitacoes/fundamento-legal';

export interface AplicacaoFluxo {
  /** Modalidades (ModalidadeLicitacao) em que o fluxo vale. */
  modalidades: string[];
  /** Enquadramentos (FundamentoLegal) em que vale; vazio = todos os das modalidades. */
  fundamentos: string[];
  /** Vale para o que não tem fluxo próprio. */
  padrao: boolean;
}

export interface FluxoAtivo {
  id: string;
  /** Família de versões (para não comparar o fluxo com uma versão dele mesmo). */
  familia?: string;
  nome: string;
  versao: number;
  aplicacao: AplicacaoFluxo | null;
}

export type MotivoEscolha = 'ENQUADRAMENTO' | 'MODALIDADE' | 'PADRAO';

export interface Escolha {
  fluxo: FluxoAtivo;
  motivo: MotivoEscolha;
}

/** Modalidades da contratação, na ordem das telas. */
export const MODALIDADES_CONTRATACAO: ReadonlyArray<{ codigo: string; rotulo: string }> = [
  { codigo: 'DISPENSA_ELETRONICA', rotulo: 'Dispensa' },
  { codigo: 'INEXIGIBILIDADE', rotulo: 'Inexigibilidade' },
  { codigo: 'PREGAO_ELETRONICO', rotulo: 'Pregão eletrônico' },
  { codigo: 'CONCORRENCIA', rotulo: 'Concorrência' },
  { codigo: 'CREDENCIAMENTO', rotulo: 'Credenciamento' },
  { codigo: 'LEILAO', rotulo: 'Leilão' },
  { codigo: 'CONCURSO', rotulo: 'Concurso' },
  { codigo: 'DIALOGO_COMPETITIVO', rotulo: 'Diálogo competitivo' },
];

/** Só nestas modalidades o enquadramento divide o caso (as demais têm um só). */
export const MODALIDADES_COM_ENQUADRAMENTO = ['DISPENSA_ELETRONICA', 'INEXIGIBILIDADE'];

const MODALIDADES = new Set(MODALIDADES_CONTRATACAO.map((m) => m.codigo));

export function rotuloModalidade(codigo: string | null | undefined): string {
  return MODALIDADES_CONTRATACAO.find((m) => m.codigo === codigo)?.rotulo ?? String(codigo ?? '');
}

/** Sem "onde vale" gravado: vale como padrão (comportamento de antes). */
export function aplicacaoEfetiva(a: AplicacaoFluxo | null | undefined): AplicacaoFluxo {
  return a ?? { modalidades: [], fundamentos: [], padrao: true };
}

/** Valida e limpa o que veio da tela. Lança Error com a mensagem para o usuário. */
export function normalizarAplicacao(body: unknown): AplicacaoFluxo {
  const b = (body ?? {}) as Record<string, unknown>;
  const modalidades = [...new Set((Array.isArray(b.modalidades) ? b.modalidades : []).map((m) => String(m).toUpperCase()))];
  for (const m of modalidades) if (!MODALIDADES.has(m)) throw new Error(`Modalidade inválida: ${m}.`);
  const fundamentos = [...new Set((Array.isArray(b.fundamentos) ? b.fundamentos : []).map((f) => String(f).toUpperCase()))];
  for (const f of fundamentos) {
    const daModalidade = modalidades.filter((m) => MODALIDADES_COM_ENQUADRAMENTO.includes(m)).some((m) => fundamentosDaModalidade(m).some((d) => d.codigo === f));
    if (!daModalidade) throw new Error(`O enquadramento ${definicaoDoFundamento(f)?.referencia ?? f} não pertence às modalidades marcadas.`);
  }
  const padrao = b.padrao === true;
  if (!modalidades.length && !padrao) throw new Error('Marque ao menos uma modalidade ou use o fluxo como padrão.');
  return { modalidades, fundamentos, padrao };
}

/** Enquadramentos da aplicação que pertencem à modalidade (vazio = a modalidade inteira). */
function fundamentosNa(a: AplicacaoFluxo, modalidade: string): string[] {
  if (!MODALIDADES_COM_ENQUADRAMENTO.includes(modalidade)) return [];
  const daModalidade = new Set(fundamentosDaModalidade(modalidade).map((d) => d.codigo as string));
  return a.fundamentos.filter((f) => daModalidade.has(f));
}

/**
 * Fluxo que um processo novo segue. Nulo = nenhum fluxo cobre o caso, ou o
 * caso está em dois fluxos no mesmo nível (dado antigo): o processo abre sem
 * fluxo e a tramitação fica manual, em vez de escolher às cegas.
 */
export function escolherFluxo(ativos: FluxoAtivo[], modalidade: string | null | undefined, fundamento: string | null | undefined): Escolha | null {
  const m = String(modalidade ?? '').toUpperCase();
  const f = String(fundamento ?? '').toUpperCase();
  const unico = (lista: FluxoAtivo[], motivo: MotivoEscolha): Escolha | null | undefined => (lista.length === 1 ? { fluxo: lista[0], motivo } : lista.length > 1 ? null : undefined);

  const comModalidade = ativos.filter((x) => aplicacaoEfetiva(x.aplicacao).modalidades.includes(m));
  const porEnquadramento = f ? comModalidade.filter((x) => fundamentosNa(aplicacaoEfetiva(x.aplicacao), m).includes(f)) : [];
  const r1 = unico(porEnquadramento, 'ENQUADRAMENTO');
  if (r1 !== undefined) return r1;
  const porModalidade = comModalidade.filter((x) => fundamentosNa(aplicacaoEfetiva(x.aplicacao), m).length === 0);
  const r2 = unico(porModalidade, 'MODALIDADE');
  if (r2 !== undefined) return r2;
  const r3 = unico(ativos.filter((x) => aplicacaoEfetiva(x.aplicacao).padrao), 'PADRAO');
  return r3 ?? null;
}

/** Casos que dois fluxos disputariam (mensagens para o usuário). Vazio = pode ativar. */
export function conflitosDeAplicacao(novo: AplicacaoFluxo | null, outros: FluxoAtivo[]): string[] {
  const a = aplicacaoEfetiva(novo);
  const conflitos: string[] = [];
  for (const o of outros) {
    const b = aplicacaoEfetiva(o.aplicacao);
    if (a.padrao && b.padrao) conflitos.push(`"${o.nome}" já é o fluxo padrão da contratação.`);
    for (const m of a.modalidades.filter((x) => b.modalidades.includes(x))) {
      const fa = fundamentosNa(a, m);
      const fb = fundamentosNa(b, m);
      if (!fa.length && !fb.length) conflitos.push(`${rotuloModalidade(m)} já está no fluxo "${o.nome}".`);
      const comuns = fa.filter((x) => fb.includes(x));
      if (comuns.length) conflitos.push(`${rotuloModalidade(m)} · ${comuns.map((x) => definicaoDoFundamento(x)?.referencia ?? x).join(', ')} já está no fluxo "${o.nome}".`);
    }
  }
  return conflitos;
}

export interface LinhaCobertura {
  modalidade: string;
  modalidade_rotulo: string;
  enquadramento: string;
  fluxo: { id: string; nome: string; versao: number } | null;
  motivo: MotivoEscolha | 'NENHUM' | 'AMBIGUO';
}

/** Tabela "Qual fluxo cada contratação segue": uma linha por modalidade e por enquadramento com fluxo próprio. */
export function cobertura(ativos: FluxoAtivo[]): LinhaCobertura[] {
  const linhas: LinhaCobertura[] = [];
  const resumo = (x: FluxoAtivo | undefined) => (x ? { id: x.id, nome: x.nome, versao: x.versao } : null);
  for (const { codigo: m, rotulo } of MODALIDADES_CONTRATACAO) {
    const especificos = ativos
      .map((x) => ({ x, fs: fundamentosNa(aplicacaoEfetiva(x.aplicacao), m) }))
      .filter(({ x, fs }) => aplicacaoEfetiva(x.aplicacao).modalidades.includes(m) && fs.length);
    for (const { x, fs } of especificos) {
      linhas.push({ modalidade: m, modalidade_rotulo: rotulo, enquadramento: fs.map((f) => definicaoDoFundamento(f)?.referencia ?? f).join('; '), fluxo: resumo(x), motivo: 'ENQUADRAMENTO' });
    }
    // O resto da modalidade: escolha sem enquadramento específico
    const resto = escolherFluxo(ativos, m, null);
    const ambiguo = resto === null && ativos.length > 0 && (ativos.filter((x) => aplicacaoEfetiva(x.aplicacao).modalidades.includes(m) && !fundamentosNa(aplicacaoEfetiva(x.aplicacao), m).length).length > 1 || ativos.filter((x) => aplicacaoEfetiva(x.aplicacao).padrao).length > 1);
    linhas.push({
      modalidade: m,
      modalidade_rotulo: rotulo,
      enquadramento: especificos.length ? 'Demais casos' : 'Todos',
      fluxo: resumo(resto?.fluxo),
      motivo: resto ? resto.motivo : ambiguo ? 'AMBIGUO' : 'NENHUM',
    });
  }
  return linhas;
}

/** "Dispensa · art. 75, I; art. 75, II" — o que a tela mostra em "Vale para". */
export function rotulosDaAplicacao(a: AplicacaoFluxo | null): string[] {
  const ef = aplicacaoEfetiva(a);
  const rotulos = ef.modalidades.map((m) => {
    const fs = fundamentosNa(ef, m);
    return fs.length ? `${rotuloModalidade(m)} · ${fs.map((f) => definicaoDoFundamento(f)?.referencia ?? f).join('; ')}` : rotuloModalidade(m);
  });
  if (ef.padrao) rotulos.push('Padrão: o que não tem fluxo próprio');
  return rotulos;
}
