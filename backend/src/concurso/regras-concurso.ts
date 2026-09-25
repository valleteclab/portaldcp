import { randomInt } from 'crypto';

/**
 * ============================================================================
 * CONCURSO — regras PURAS (Lei 14.133/2021; plano E7c)
 * ============================================================================
 *  - art. 6º XXXIX: modalidade para escolha de trabalho técnico, científico
 *    ou artístico, critério melhor técnica ou conteúdo artístico, com prêmio
 *    ou remuneração ao vencedor;
 *  - art. 30: o edital indicará I a qualificação exigida dos participantes;
 *    II as diretrizes e formas de apresentação do trabalho; III as condições
 *    de realização e o prêmio ou remuneração; parágrafo único: no concurso
 *    para elaboração de PROJETO, o vencedor cede os direitos patrimoniais
 *    (art. 93) e autoriza a execução;
 *  - art. 37 §1º: banca com no mínimo 3 membros (julgamento técnico — E3);
 *  - art. 55 IV: 35 dias úteis de divulgação.
 *
 * SIGILO DE AUTORIA (decisão do plano E7c — prática consolidada dos
 * concursos): o trabalho é identificado só por um CÓDIGO aleatório; o autor
 * (e os documentos de qualificação — "envelope de identificação") só é
 * revelado depois que a banca publica o julgamento. Antes disso nenhuma
 * leitura do órgão (banca, agente) liga código a licitante.
 *
 * Decisões a validar: um único prêmio por concurso (um item — "prêmio do
 * vencedor"); demais colocações ficam registradas na classificação publicada,
 * sem premiação própria nesta versão; qualificação conferida só do vencedor
 * (não qualificado → próximo da classificação).
 */

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

/** Código anônimo do trabalho: "T-" + 5 símbolos (≈ 33 milhões de combinações). */
export function gerarCodigoTrabalho(aleatorio: (n: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALFABETO[aleatorio(ALFABETO.length)];
  return `T-${s}`;
}

export interface RegulamentoEntrada {
  natureza_trabalho?: string | null;
  qualificacao_exigida?: string | null;
  diretrizes_trabalho?: string | null;
  forma_apresentacao?: string | null;
  condicoes_realizacao?: string | null;
  tipo_retribuicao?: string | null;
  valor_premio?: number | string | null;
  elaboracao_projeto?: boolean | null;
  exige_cessao_direitos?: boolean | null;
}

const vazio = (v: unknown) => !String(v ?? '').trim();

export function validarRegulamento(r: RegulamentoEntrada): string[] {
  const e: string[] = [];
  if (!['TECNICO', 'CIENTIFICO', 'ARTISTICO'].includes(String(r.natureza_trabalho ?? ''))) {
    e.push('Natureza do trabalho: técnico, científico ou artístico (art. 6º, XXXIX).');
  }
  if (vazio(r.qualificacao_exigida)) e.push('Informe a qualificação exigida dos participantes (art. 30, I).');
  if (vazio(r.diretrizes_trabalho)) e.push('Informe as diretrizes do trabalho (art. 30, II).');
  if (vazio(r.forma_apresentacao)) e.push('Informe as formas de apresentação do trabalho (art. 30, II).');
  if (vazio(r.condicoes_realizacao)) e.push('Informe as condições de realização (art. 30, III).');
  if (!['PREMIO', 'REMUNERACAO'].includes(String(r.tipo_retribuicao ?? 'PREMIO'))) e.push('Retribuição: prêmio ou remuneração (art. 30, III).');
  if (!(Number(r.valor_premio) > 0)) e.push('Informe o valor do prêmio ou da remuneração ao vencedor (art. 30, III).');
  if (r.elaboracao_projeto && r.exige_cessao_direitos === false) {
    e.push('Concurso para elaboração de projeto exige a cessão dos direitos patrimoniais (art. 30, parágrafo único; art. 93).');
  }
  return e;
}

/** Pendências do PUBLICAR no concurso. */
export function pendenciasEditalConcurso(p: {
  criterio: string | null | undefined;
  regulamento: RegulamentoEntrada | null;
  itens: Array<{ numero_item: number; valor_total: number }>;
  quesitos: number;
}): string[] {
  const pend: string[] = [];
  if (String(p.criterio ?? '') !== 'MELHOR_TECNICA') pend.push('Concurso é julgado por melhor técnica ou conteúdo artístico (art. 33, III).');
  if (!p.regulamento) pend.push('Preencha o regulamento do concurso (art. 30, I a III).');
  else pend.push(...validarRegulamento(p.regulamento));
  if (p.itens.length !== 1) {
    pend.push('O concurso tem um único item — o prêmio/remuneração do vencedor (decisão desta versão).');
  } else if (p.regulamento && Number(p.regulamento.valor_premio) > 0 && Math.abs(Number(p.itens[0].valor_total) - Number(p.regulamento.valor_premio)) > 0.005) {
    pend.push('O valor do item deve ser o do prêmio/remuneração do regulamento (salve o regulamento de novo para sincronizar).');
  }
  if (p.quesitos < 1) pend.push('Defina os quesitos de julgamento da banca (art. 37, II) — critérios objetivos do edital.');
  return pend;
}

export const TAMANHO_MAXIMO_PADRAO_MB = 20;
export const MIMES_TRABALHO = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/zip', 'application/x-zip-compressed'];
export const MIMES_IDENTIFICACAO = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

export function motivoArquivoTrabalhoInvalido(a: { mimetype?: string; size?: number } | null | undefined, maxMb: number, identificacao = false): string | null {
  if (!a || !(Number(a.size) > 0)) return identificacao ? 'Anexe o envelope de identificação (documentos da qualificação — art. 30, I).' : 'Anexe o arquivo do trabalho.';
  const mimes = identificacao ? MIMES_IDENTIFICACAO : MIMES_TRABALHO;
  if (!mimes.includes(String(a.mimetype))) return identificacao ? 'Identificação: use PDF, JPG ou PNG.' : 'Trabalho: use PDF, JPG, PNG ou ZIP.';
  if (Number(a.size) > maxMb * 1024 * 1024) return `Arquivo acima de ${maxMb} MB.`;
  return null;
}

/**
 * Sinais de identificação no trabalho (o edital pode desclassificar trabalho
 * identificado): o nome do arquivo não pode conter o nome/CPF/CNPJ do autor.
 * Checagem mínima e objetiva — a banca continua responsável.
 */
export function motivoTrabalhoIdentificado(nomeArquivo: string, autor: { nome?: string | null; documento?: string | null }): string | null {
  const nome = String(nomeArquivo || '').toLowerCase();
  const doc = String(autor.documento || '').replace(/\D/g, '');
  if (doc && nome.replace(/\D/g, '').includes(doc)) return 'O nome do arquivo do trabalho identifica o autor (CPF/CNPJ) — renomeie (sigilo de autoria).';
  const partes = String(autor.nome || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 5);
  if (partes.some((p) => nome.includes(p))) return 'O nome do arquivo do trabalho identifica o autor — renomeie (sigilo de autoria).';
  return null;
}

/** Pendências de conclusão do concurso: premiação gerada e, quando exigida, a cessão aceita. */
export function pendenciasPremiacao(premiacoes: Array<{ status: string; exige_cessao: boolean; termo_gerado_em: Date | string | null }>): string[] {
  if (!premiacoes.length) return ['Premiação não registrada (é gerada na homologação).'];
  const p: string[] = [];
  for (const x of premiacoes) {
    if (!x.termo_gerado_em) p.push('Termo de premiação/cessão de direitos não gerado.');
    if (x.exige_cessao && x.status === 'AGUARDANDO_CESSAO') p.push('Cessão dos direitos patrimoniais pendente de aceite do vencedor (art. 30, parágrafo único; art. 93).');
  }
  return p;
}
