/**
 * RASCUNHO DA IA POR ETAPA (F4a) — regras PURAS: o que cada peça pede à IA,
 * quando o rascunho nasce sozinho, o contexto enviado (só do processo, sem
 * dados pessoais), o prompt, a leitura da resposta e o que entra na peça no
 * aceite (só seção vazia).
 *
 * É o catálogo do "como fazer" (código, como o catálogo das etapas). QUAIS
 * etapas têm rascunho ao chegar é dado do modelo de fluxo (`ia_rascunho`).
 */
import { textoPuro } from '../telas/etp-analise';

export type PecaRascunho = 'DFD' | 'ETP' | 'TR' | 'AA' | 'PJ' | 'MCI' | 'REGISTRO' | 'TRAMITACAO';
export const PECAS_RASCUNHO: PecaRascunho[] = ['DFD', 'ETP', 'TR', 'AA', 'PJ', 'MCI', 'REGISTRO', 'TRAMITACAO'];

export type FormatoCampo = 'HTML' | 'TEXTO';

export interface CampoRascunho {
  id: string;
  titulo: string;
  orientacao: string;
  formato: FormatoCampo;
  /** Tamanho máximo (caracteres) do texto aceito da IA. */
  max: number;
}

export interface DefinicaoRascunho {
  peca: PecaRascunho;
  titulo: string;
  /**
   * Peças por seção (DFD, ETP, TR): os campos vêm das seções do MODELO do
   * documento (o do órgão ou o padrão do sistema) — `secoes_permitidas` limita
   * (DFD) e `secoes_do_sistema` exclui as que o sistema preenche com dados do
   * processo (valor da pesquisa, dotação, PCA, modalidade).
   */
  usa_modelo_de_documento: boolean;
  secoes_permitidas?: string[];
  secoes_do_sistema?: string[];
  /** Campos fixos (peças sem seções no modelo). */
  campos?: CampoRascunho[];
  instrucoes: string;
  /** Aviso fixo na tela (ex.: "minuta para o jurídico revisar"). */
  aviso: string;
}

const AVISO_PADRAO = 'Rascunho gerado pela IA — revise antes de emitir. Nada entra na peça sem o seu clique, e o texto que alguém já escreveu não é substituído.';

export const DEFINICOES_RASCUNHO: Record<PecaRascunho, DefinicaoRascunho> = {
  DFD: {
    peca: 'DFD',
    titulo: 'Documento de formalização da demanda (DFD)',
    usa_modelo_de_documento: true,
    // Só a necessidade: é a seção que a tela do DFD mostra e deixa editar. A
    // lista de quantidades, o PCA e a data o sistema monta dos itens e dos campos.
    secoes_permitidas: ['demanda'],
    instrucoes:
      'Redija a seção "demanda" do DFD (art. 72, I, e art. 18, I, da Lei nº 14.133/2021) em três partes: (1) a NECESSIDADE — o problema a resolver e o interesse público; ' +
      '(2) a JUSTIFICATIVA da contratação; (3) as QUANTIDADES a partir dos itens informados — quantidade e unidade de cada item e o critério do quantitativo ' +
      '(se o contexto não trouxer a base do cálculo, diga que o quantitativo segue os itens do processo e deve ser confirmado pelo requisitante). ' +
      'Descreva pela FUNÇÃO — não cite marca, modelo ou fabricante (art. 41, I).',
    aviso: AVISO_PADRAO,
  },
  ETP: {
    peca: 'ETP',
    titulo: 'Estudo técnico preliminar (ETP)',
    usa_modelo_de_documento: true,
    secoes_do_sistema: ['previsao_pca', 'estimativa_valor'],
    instrucoes:
      'Redija o Estudo Técnico Preliminar (art. 18, §1º, da Lei nº 14.133/2021), uma seção por inciso pedido, com conteúdo técnico e concreto a partir do DFD e dos itens. ' +
      'Descreva a solução pela FUNÇÃO e pelo desempenho — não cite marca, modelo ou fabricante (art. 41, I). Onde faltar informação do processo, escreva o texto de forma que o servidor complete (sem inventar números, datas ou contratos).',
    aviso: AVISO_PADRAO,
  },
  TR: {
    peca: 'TR',
    titulo: 'Termo de referência (TR)',
    usa_modelo_de_documento: true,
    secoes_do_sistema: ['estimativa_valor_tr', 'dotacao_orcamentaria_tr', 'selecao_habilitacao'],
    instrucoes:
      'Redija o Termo de Referência (art. 6º, XXIII, da Lei nº 14.133/2021), uma seção por alínea pedida, coerente com o ETP e com os itens. ' +
      'Não cite marca, modelo ou fabricante (art. 41, I). Não invente prazos, locais ou valores que o contexto não traga: deixe a indicação para o servidor completar.',
    aviso: AVISO_PADRAO,
  },
  AA: {
    peca: 'AA',
    titulo: 'Despacho de autorização da autoridade',
    usa_modelo_de_documento: false,
    campos: [
      {
        id: 'autorizacao',
        titulo: 'Texto da autorização',
        orientacao:
          'Despacho em que a autoridade competente, considerando a instrução do processo, AUTORIZA a contratação (na contratação direta: art. 72, VIII, da Lei nº 14.133/2021), citando o número do processo, o objeto, o fundamento legal informado, o valor máximo e a dotação. Sem local, data e assinatura (o sistema acrescenta).',
        formato: 'HTML',
        max: 6000,
      },
    ],
    instrucoes: 'Redija o despacho de autorização da autoridade competente, em linguagem formal e objetiva, na primeira pessoa ("AUTORIZO"). Use exatamente o fundamento legal, o número do processo e os valores do contexto.',
    aviso: 'Rascunho do despacho gerado pela IA — revise antes de gerar. "Aceitar como base" gera o despacho com este texto (ele só vale depois de assinado pela autoridade).',
  },
  PJ: {
    peca: 'PJ',
    titulo: 'Minuta de parecer jurídico',
    usa_modelo_de_documento: false,
    campos: [
      { id: 'relatorio', titulo: 'Relatório', orientacao: 'Resumo do que consta dos autos (objeto, fundamento, peças da instrução e valores).', formato: 'TEXTO', max: 6000 },
      {
        id: 'fundamentacao',
        titulo: 'Fundamentação',
        orientacao: 'Análise da conformidade com a Lei nº 14.133/2021 (art. 53; na contratação direta, art. 72 e o fundamento do art. 74/75), apontando o que está cumprido e o que falta, sem afirmar fatos que o contexto não traga.',
        formato: 'TEXTO',
        max: 12000,
      },
      { id: 'ressalvas', titulo: 'Ressalvas', orientacao: 'Pendências ou recomendações objetivas (vazio se não houver).', formato: 'TEXTO', max: 6000 },
      { id: 'conclusao', titulo: 'Conclusão', orientacao: 'Conclusão SUGERIDA para o jurídico decidir (favorável, favorável com ressalvas ou desfavorável), com o motivo em uma frase.', formato: 'TEXTO', max: 2000 },
    ],
    instrucoes:
      'Redija uma MINUTA de parecer jurídico para o controle prévio de legalidade (art. 53 da Lei nº 14.133/2021). É um rascunho para o jurídico revisar: não é o parecer emitido. ' +
      'Seja fiel ao contexto: aponte como pendência o que estiver "pendente" ou "em elaboração" na instrução. Inclua também "conclusao_sugerida" com FAVORAVEL, FAVORAVEL_COM_RESSALVAS ou DESFAVORAVEL.',
    aviso: 'MINUTA gerada pela IA para o jurídico revisar — não é parecer. A conclusão é sempre do jurídico; nada é emitido automaticamente.',
  },
  MCI: {
    peca: 'MCI',
    titulo: 'Manifestação do controle interno',
    usa_modelo_de_documento: false,
    campos: [
      { id: 'texto', titulo: 'Texto da manifestação', orientacao: 'Exame da regularidade formal da instrução (peças, pesquisa de preços, reserva, parecer).', formato: 'TEXTO', max: 8000 },
      { id: 'apontamentos', titulo: 'Apontamentos', orientacao: 'Pontos a corrigir ou acompanhar (vazio se não houver).', formato: 'TEXTO', max: 6000 },
    ],
    instrucoes:
      'Redija o rascunho da manifestação da unidade de controle interno sobre a regularidade formal do processo. Seja fiel ao contexto. Inclua "conclusao_sugerida" com FAVORAVEL ou COM_APONTAMENTOS.',
    aviso: 'Rascunho gerado pela IA para o controle interno revisar — a conclusão é de quem se manifesta.',
  },
  REGISTRO: {
    peca: 'REGISTRO',
    titulo: 'Despacho da etapa',
    usa_modelo_de_documento: false,
    campos: [{ id: 'texto', titulo: 'Despacho', orientacao: 'Despacho curto (1 a 3 frases), formal, que registra o ato da etapa.', formato: 'TEXTO', max: 2000 }],
    instrucoes: 'Redija o despacho curto que conclui esta etapa do processo, em linguagem formal de autos administrativos.',
    aviso: 'Texto sugerido pela IA — revise antes de registrar o despacho.',
  },
  TRAMITACAO: {
    peca: 'TRAMITACAO',
    titulo: 'Despacho de envio',
    usa_modelo_de_documento: false,
    campos: [{ id: 'texto', titulo: 'Despacho', orientacao: 'Despacho de encaminhamento curto (1 ou 2 frases), no padrão "Encaminhe-se ao(à) <destino> para <finalidade>."', formato: 'TEXTO', max: 1500 }],
    instrucoes: 'Ajuste o despacho de encaminhamento para deixar clara a finalidade do envio, sem acrescentar fatos que o contexto não traga.',
    aviso: 'Texto sugerido pela IA — revise antes de enviar.',
  },
};

/** Orientação por etapa de REGISTRO (o que o despacho registra). */
export const ORIENTACAO_REGISTRO: Record<string, string> = {
  AUTORIZACAO_INICIO: 'Despacho da autoridade que AUTORIZA O INÍCIO do processo de contratação (regulamento do órgão), citando o objeto e o encaminhamento ao setor de compras.',
  INDICACAO_MODALIDADE:
    'Despacho do agente/setor de licitações que INDICA A MODALIDADE e o enquadramento legal da contratação a partir do valor estimado apurado (Portaria 089/2024, art. 56), citando o fundamento informado.',
};

/**
 * Campos do rascunho das peças por seção: as seções do MODELO do documento
 * (do órgão ou do sistema), menos as que o sistema preenche com dados do
 * processo. Peças sem seções no modelo usam os campos fixos da definição.
 */
export function camposDoRascunho(
  def: DefinicaoRascunho,
  secoesDoModelo: Array<{ id: string; titulo: string; placeholder?: string; fundamento_legal?: string; texto_padrao?: string }>,
): CampoRascunho[] {
  if (!def.usa_modelo_de_documento) return def.campos ?? [];
  return secoesDoModelo
    .filter((s) => !def.secoes_permitidas || def.secoes_permitidas.includes(s.id))
    .filter((s) => !(def.secoes_do_sistema ?? []).includes(s.id))
    // Seção com texto padrão do modelo (lê o processo) não é da IA
    .filter((s) => !s.texto_padrao)
    .map((s) => ({
      id: s.id,
      titulo: s.titulo.replace(/\s*\*$/, ''),
      orientacao: [s.placeholder, s.fundamento_legal ? `(${s.fundamento_legal})` : null].filter(Boolean).join(' ') || s.titulo,
      formato: 'HTML' as const,
      max: 12000,
    }));
}

/** Tipos de peça (instrução) produzidos por cada etapa que têm rascunho da IA. */
export const PECAS_DO_PASSO: Record<string, PecaRascunho[]> = {
  DFD: ['DFD'],
  ETP: ['ETP'],
  TR: ['TR'],
  AUTORIZACAO: ['AA'],
  PARECER: ['PJ'],
  CONTROLE_INTERNO: ['MCI'],
};

/** Etapa (código do modelo) de cada peça — o inverso de PECAS_DO_PASSO. */
export function etapaDaPeca(peca: PecaRascunho): string | null {
  for (const [etapa, pecas] of Object.entries(PECAS_DO_PASSO)) if (pecas.includes(peca)) return etapa;
  return null;
}

export function ehPecaRascunho(v: unknown): v is PecaRascunho {
  return typeof v === 'string' && (PECAS_RASCUNHO as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Quando nasce sozinho (rascunho ao chegar)
// ---------------------------------------------------------------------------

export interface PassoParaRascunho {
  passo: string;
  situacao: string;
  pode_iniciar: boolean;
  ia_rascunho: boolean;
  conclusao: string;
  pecas: Array<{ tipo: string; pronta: boolean }>;
  reaberta?: { em?: string | null } | null;
}

export interface RascunhoAoChegar {
  etapa: string;
  peca: PecaRascunho;
  /** Chave de idempotência (uma vez por etapa/peça e por ciclo de reabertura). */
  chave: string;
}

const SITUACOES_DE_TRABALHO = new Set(['DISPONIVEL', 'EM_ANDAMENTO']);

/**
 * Etapas que acabaram de ficar disponíveis (ou estão em andamento) com
 * `ia_rascunho` ligado no modelo: um rascunho por peça ainda não pronta. A
 * chave muda só quando a etapa é REABERTA (novo ciclo) — editar a peça, gerar
 * versão nova ou sincronizar de novo não gera outro rascunho.
 */
export function rascunhosAoChegar(licitacaoId: string, passos: PassoParaRascunho[]): RascunhoAoChegar[] {
  const r: RascunhoAoChegar[] = [];
  for (const p of passos) {
    if (!p.ia_rascunho || !p.pode_iniciar || !SITUACOES_DE_TRABALHO.has(p.situacao)) continue;
    const ciclo = p.reaberta?.em ? `:r${p.reaberta.em}` : '';
    if (p.conclusao === 'REGISTRO') {
      r.push({ etapa: p.passo, peca: 'REGISTRO', chave: `auto:${licitacaoId}:${p.passo}:REGISTRO${ciclo}` });
      continue;
    }
    for (const peca of PECAS_DO_PASSO[p.passo] ?? []) {
      const naEtapa = p.pecas.find((x) => x.tipo === peca);
      if (!naEtapa || naEtapa.pronta) continue;
      r.push({ etapa: p.passo, peca, chave: `auto:${licitacaoId}:${p.passo}:${peca}${ciclo}` });
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Privacidade: o que sai para a IA
// ---------------------------------------------------------------------------

/**
 * Tira do texto enviado à IA dados pessoais e identificadores que ela não
 * precisa: CPF, CNPJ, e-mail, telefone. (O contexto só tem dados do próprio
 * processo; isto protege o texto livre que as pessoas escreveram.)
 */
export function anonimizar(texto: unknown): string {
  return String(texto ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\(\d{2}\)\s?9?\d{4}-?\d{4}\b/g, '[telefone]')
    .replace(/\b\d{2}\s9?\d{4}-\d{4}\b/g, '[telefone]')
    .replace(/\b9?\d{4}-\d{4}\b/g, '[telefone]');
}

/** Texto puro, anonimizado e cortado (para caber no contexto). */
export function resumoDeTexto(html: unknown, max = 1500): string {
  const t = anonimizar(textoPuro(html)).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ---------------------------------------------------------------------------
// Contexto do processo
// ---------------------------------------------------------------------------

export interface DadosContexto {
  processo: {
    numero_processo: string | null;
    objeto: string | null;
    modalidade: string | null;
    contratacao_direta: boolean;
    fundamento: string | null;
    sigiloso: boolean;
    valor_estimado: number | null;
    orgao: string | null;
  };
  itens: Array<{ numero_item: number; descricao: string; quantidade: number; unidade: string | null; valor_unitario: number | null }>;
  reserva: { dotacao: string | null; situacao: string | null; leis: string | null } | null;
  /** Peças prontas antes desta (texto das feitas no sistema; nº e data das anexadas). */
  pecas_prontas: Array<{ tipo: string; titulo: string; anexada: boolean; numero?: string | null; data?: string | null; secoes?: Record<string, string> }>;
  /** Situação da instrução (para o parecer e o controle interno). */
  instrucao?: Array<{ titulo: string; status: string }>;
  /** Informação própria do pedido (ex.: destino e finalidade do envio; etapa de registro). */
  extra?: Record<string, string | null | undefined>;
}

const BRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ROTULO_STATUS: Record<string, string> = {
  OK: 'pronta',
  NAO_SE_APLICA: 'não se aplica',
  PENDENTE: 'pendente',
  EM_ELABORACAO: 'em elaboração',
  EM_APROVACAO: 'em aprovação',
  EM_ASSINATURA: 'em assinatura',
};

/**
 * Contexto em texto: SÓ dados do processo (o do órgão do JWT — quem monta os
 * dados garante), sem nome de fornecedor, sem CPF/CNPJ/e-mail/telefone. No
 * orçamento sigiloso (art. 24) o valor não sai do sistema.
 */
export function montarContexto(d: DadosContexto): string {
  const l: string[] = [];
  const p = d.processo;
  l.push(`Órgão: ${anonimizar(p.orgao ?? '—')}`);
  l.push(`Processo administrativo nº ${anonimizar(p.numero_processo ?? '—')}`);
  l.push(`Objeto: ${anonimizar(p.objeto ?? '—')}`);
  l.push(`Modalidade: ${p.modalidade ?? '—'}${p.contratacao_direta ? ' (contratação direta)' : ''}`);
  l.push(`Fundamento legal informado no processo: ${p.fundamento || 'não informado'}`);
  if (p.sigiloso) l.push('Orçamento estimado: SIGILOSO (art. 24) — não cite valores; escreva "valor estimado constante dos autos".');
  else l.push(`Valor estimado (itens/pesquisa de preços): ${p.valor_estimado ? BRL(p.valor_estimado) : 'ainda não apurado'}`);
  if (d.itens.length) {
    l.push('Itens:');
    for (const i of d.itens.slice(0, 60)) {
      const valor = !p.sigiloso && i.valor_unitario ? ` — valor unitário estimado ${BRL(i.valor_unitario)}` : '';
      l.push(`  ${i.numero_item}) ${anonimizar(i.descricao)} — ${i.quantidade} ${i.unidade ?? 'un'}${valor}`);
    }
    if (d.itens.length > 60) l.push(`  … e mais ${d.itens.length - 60} itens`);
  } else {
    l.push('Itens: ainda não cadastrados.');
  }
  if (d.reserva) {
    l.push(`Reserva orçamentária: ${d.reserva.situacao ?? '—'}${d.reserva.dotacao ? `; dotação: ${anonimizar(d.reserva.dotacao)}` : ''}${d.reserva.leis ? `; ${d.reserva.leis}` : ''}`);
  }
  if (d.instrucao?.length) {
    l.push('Instrução (peças do processo):');
    for (const i of d.instrucao) l.push(`  - ${i.titulo}: ${ROTULO_STATUS[i.status] ?? i.status.toLowerCase()}`);
  }
  for (const peca of d.pecas_prontas) {
    if (peca.anexada) {
      l.push(`${peca.titulo}: juntada (feita fora)${peca.numero ? `, nº ${anonimizar(peca.numero)}` : ''}${peca.data ? `, de ${peca.data}` : ''}.`);
      continue;
    }
    const secoes = Object.entries(peca.secoes ?? {})
      .map(([k, v]) => [k, resumoDeTexto(v, 1200)] as const)
      .filter(([, v]) => v);
    if (!secoes.length) continue;
    l.push(`${peca.titulo} (pronta):`);
    for (const [k, v] of secoes) l.push(`  [${k}] ${v}`);
  }
  for (const [k, v] of Object.entries(d.extra ?? {})) if (v) l.push(`${k}: ${anonimizar(v)}`);
  return l.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const PROMPT_SISTEMA =
  'Você é um servidor experiente em contratações públicas (Lei nº 14.133/2021) que prepara RASCUNHOS de peças da fase interna para outro servidor revisar. ' +
  'Escreva em português do Brasil, em linguagem formal de autos administrativos, fiel ao contexto: nunca invente números, datas, nomes, valores, contratos ou leis locais que o contexto não traga. ' +
  'Nunca inclua dados pessoais (CPF, e-mail, telefone). Responda APENAS com um objeto JSON válido, sem texto antes ou depois.';

export interface PedidoRascunho {
  sistema: string;
  usuario: string;
}

export function montarPrompt(def: DefinicaoRascunho, campos: CampoRascunho[], contexto: string, orientacaoExtra?: string | null): PedidoRascunho {
  const chaves = campos.map((c) => `"${c.id}"`);
  const extras = CONCLUSOES_SUGERIDAS[def.peca] ? ', "conclusao_sugerida"' : '';
  const formatoHtml = campos.some((c) => c.formato === 'HTML');
  const usuario = [
    `Peça: ${def.titulo}.`,
    def.instrucoes,
    orientacaoExtra ? `Orientação desta etapa: ${orientacaoExtra}` : null,
    'Campos a redigir:',
    ...campos.map((c) => `- "${c.id}" — ${c.titulo.replace(/\s*\*$/, '')}: ${c.orientacao}`),
    formatoHtml
      ? 'Formato: nos campos de seção use HTML simples (<p>, <ul>, <li>, <strong>), sem títulos; nos demais, texto corrido.'
      : 'Formato: texto corrido, sem HTML e sem markdown.',
    `Responda com um JSON com as chaves ${chaves.join(', ')}${extras}.`,
    '',
    'CONTEXTO DO PROCESSO:',
    contexto,
  ]
    .filter((x) => x !== null)
    .join('\n');
  return { sistema: PROMPT_SISTEMA, usuario };
}

// ---------------------------------------------------------------------------
// Leitura da resposta
// ---------------------------------------------------------------------------

/** Tira as cercas de código e pega o primeiro objeto JSON da resposta. */
export function extrairJson(texto: string): Record<string, unknown> | null {
  let t = String(texto ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try {
    const o = JSON.parse(t.slice(ini, fim + 1));
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const TAGS_PERMITIDAS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br']);
const escapar = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

/**
 * HTML simples e seguro: só p/ul/ol/li/strong/em/br, sem atributos; script,
 * style e o resto somem. Texto sem tags vira parágrafos.
 */
export function htmlSeguro(entrada: unknown, max = 12000): string {
  let s = String(entrada ?? '').trim();
  if (!s) return '';
  if (!/<[a-z!/]/i.test(s)) {
    return s
      .slice(0, max)
      .split(/\n{2,}/)
      .map((par) => par.trim())
      .filter(Boolean)
      .map((par) => `<p>${escapar(par).replace(/\n/g, '<br/>')}</p>`)
      .join('');
  }
  s = s.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, nome: string) => {
    const n = nome.toLowerCase();
    if (!TAGS_PERMITIDAS.has(n)) return n === 'div' || /^h[1-6]$/.test(n) ? (tag.startsWith('</') ? '</p>' : '<p>') : '';
    if (n === 'br') return '<br/>';
    return tag.startsWith('</') ? `</${n}>` : `<${n}>`;
  });
  s = s.replace(/<p>\s*<\/p>/g, '').trim();
  return s.slice(0, max);
}

/** Texto corrido (sem HTML, sem markdown de ênfase). */
export function textoPlano(entrada: unknown, max = 8000): string {
  return textoPuro(String(entrada ?? ''))
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, max);
}

export const CONCLUSOES_SUGERIDAS: Partial<Record<PecaRascunho, string[]>> = {
  PJ: ['FAVORAVEL', 'FAVORAVEL_COM_RESSALVAS', 'DESFAVORAVEL'],
  MCI: ['FAVORAVEL', 'COM_APONTAMENTOS'],
};

export interface RespostaInterpretada {
  secoes: Record<string, string>;
  extras: Record<string, unknown>;
}

/**
 * Lê a resposta da IA: só os campos pedidos, no formato de cada um (HTML
 * seguro ou texto), com o limite de tamanho. Sem nenhum campo com conteúdo →
 * erro (a tela oferece "Gerar com IA" de novo).
 */
export function interpretarResposta(def: DefinicaoRascunho, campos: CampoRascunho[], texto: string): RespostaInterpretada {
  const json = extrairJson(texto);
  // Um campo só e a IA respondeu texto puro: aceita como o texto do campo
  const bruto: Record<string, unknown> = json ?? (campos.length === 1 && String(texto ?? '').trim() && !/^\s*[{[]/.test(texto) ? { [campos[0].id]: texto } : {});
  const secoes: Record<string, string> = {};
  for (const c of campos) {
    const v = bruto[c.id];
    if (typeof v !== 'string' || !v.trim()) continue;
    const limpo = c.formato === 'HTML' ? htmlSeguro(v, c.max) : textoPlano(v, c.max);
    if (textoPuro(limpo).trim()) secoes[c.id] = limpo;
  }
  if (!Object.keys(secoes).length) throw new Error('A IA não devolveu o rascunho no formato esperado.');
  const extras: Record<string, unknown> = {};
  const permitidas = CONCLUSOES_SUGERIDAS[def.peca];
  if (permitidas) {
    const c = String(bruto.conclusao_sugerida ?? '').toUpperCase().trim();
    if (permitidas.includes(c)) extras.conclusao_sugerida = c;
  }
  return { secoes, extras };
}

// ---------------------------------------------------------------------------
// Aceite: só seção vazia
// ---------------------------------------------------------------------------

/**
 * O que o aceite grava: só as seções VAZIAS na peça (ou no rascunho do
 * jurídico). Texto que alguém já escreveu fica como está.
 */
export function secoesParaAplicar(atual: Record<string, unknown>, rascunho: Record<string, string>): { aplicar: Record<string, string>; mantidas: string[] } {
  const aplicar: Record<string, string> = {};
  const mantidas: string[] = [];
  for (const [id, texto] of Object.entries(rascunho)) {
    if (!textoPuro(texto).trim()) continue;
    if (textoPuro(atual?.[id] ?? '').trim()) mantidas.push(id);
    else aplicar[id] = texto;
  }
  return { aplicar, mantidas };
}

/** Rascunho "gerando" parado há mais que isto é tratado como falho (a tela oferece gerar de novo). */
export const GERANDO_EXPIRA_MS = 10 * 60_000;

export function situacaoVisivel(status: string, atualizadoEm: Date | string | null, agora = Date.now()): string {
  if (status === 'GERANDO' && atualizadoEm && agora - new Date(atualizadoEm).getTime() > GERANDO_EXPIRA_MS) return 'FALHOU';
  return status;
}

/**
 * Metadado discreto da peça para as telas: "rascunho inicial pela IA (modelo
 * X), aceito por Fulano, revisado na emissão por Beltrano". Nunca vai para o
 * texto oficial da peça.
 */
export function resumoIaDaPeca(dados: any): {
  modelo_ia: string | null;
  gerado_em: string | null;
  aceito_por_nome: string | null;
  aceito_em: string | null;
  revisado_por_nome: string | null;
  revisado_em: string | null;
} | null {
  const m = dados?._ia_rascunho;
  if (!m || typeof m !== 'object') return null;
  return {
    modelo_ia: m.modelo_ia ?? null,
    gerado_em: m.gerado_em ?? null,
    aceito_por_nome: m.aceito_por_nome ?? null,
    aceito_em: m.aceito_em ?? null,
    revisado_por_nome: m.revisado_por_nome ?? null,
    revisado_em: m.revisado_em ?? null,
  };
}
