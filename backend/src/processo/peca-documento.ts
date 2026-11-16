/**
 * PEÇA FEITA NO SISTEMA — regras puras (sem banco).
 *
 * A peça escrita no editor (ou rascunhada pela IA) chega como HTML simples.
 * Aqui ela é limpa, conferida (lacunas abertas não entram nos autos),
 * convertida em blocos para o PDF e, antes disso, pode nascer de um MODELO
 * do tipo de peça ou de um RASCUNHO da IA.
 *
 * Lacuna = <mark>…</mark>: o que o modelo ou a IA não souberam preencher.
 */

const TAGS = new Set(['p', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'br', 'mark']);
const ALINHAMENTOS = new Set(['left', 'center', 'right', 'justify']);

const escapar = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

export const HTML_PECA_MAX = 60000;

/**
 * HTML seguro da peça: só p/h3/ul/ol/li/strong/em/b/i/u/br/mark; p e h3 podem
 * ter alinhamento (style="text-align:…"); o resto (script, style, atributos,
 * div/span/h1…) some ou vira parágrafo. Texto sem tags vira parágrafos.
 */
export function htmlDaPecaSeguro(entrada: unknown, max = HTML_PECA_MAX): string {
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
  s = s.replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-z0-9]+)\b([^>]*)>/gi, (tag, nome: string, attrs: string) => {
    const n = nome.toLowerCase();
    const fecha = tag.startsWith('</');
    if (!TAGS.has(n)) {
      if (n === 'div' || /^h[1-6]$/.test(n)) return fecha ? '</p>' : '<p>';
      return '';
    }
    if (n === 'br') return '<br/>';
    if (fecha) return `</${n}>`;
    if (n === 'p' || n === 'h3') {
      const al = /text-align\s*:\s*(left|center|right|justify)/i.exec(attrs || '')?.[1]?.toLowerCase();
      return al && ALINHAMENTOS.has(al) && al !== 'left' ? `<${n} style="text-align:${al}">` : `<${n}>`;
    }
    return `<${n}>`;
  });
  s = s.replace(/<p(?: style="[^"]*")?>\s*<\/p>/g, '').trim();
  return s.slice(0, max);
}

export function temLacuna(html: string): boolean {
  return /<mark>[\s\S]*?<\/mark>/i.test(html);
}

export function contarLacunas(html: string): number {
  return (html.match(/<mark>/gi) || []).length;
}

const decodificar = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Texto corrido da peça (para busca e para o contexto da IA). */
export function textoDaPeca(html: unknown, max = 60000): string {
  return decodificar(
    String(html ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h3|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, max);
}

export type Alinhamento = 'left' | 'center' | 'right' | 'justify';

export interface BlocoDaPeca {
  tipo: 'titulo' | 'paragrafo' | 'item';
  texto: string;
  alinhamento: Alinhamento;
  /** Número do item em lista numerada; null em lista com marcador. */
  numero: number | null;
}

/** Blocos na ordem do documento, para o PDF (ênfase inline vira texto corrido). */
export function blocosDaPeca(html: string): BlocoDaPeca[] {
  const blocos: BlocoDaPeca[] = [];
  const re = /<(p|h3)(?: style="text-align:(left|center|right|justify)")?>([\s\S]*?)<\/\1>|<(ul|ol)>([\s\S]*?)<\/\4>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const texto = textoDaPeca(m[3]).replace(/\n+/g, '\n').trim();
      if (texto) blocos.push({ tipo: m[1].toLowerCase() === 'h3' ? 'titulo' : 'paragrafo', texto, alinhamento: (m[2] as Alinhamento) || 'left', numero: null });
    } else {
      const numerada = m[4].toLowerCase() === 'ol';
      let n = 0;
      for (const item of m[5].match(/<li>[\s\S]*?<\/li>/gi) || []) {
        const texto = textoDaPeca(item).replace(/\n+/g, ' ').trim();
        if (texto) blocos.push({ tipo: 'item', texto, alinhamento: 'left', numero: numerada ? ++n : null });
      }
    }
  }
  if (!blocos.length) {
    const texto = textoDaPeca(html);
    if (texto) blocos.push({ tipo: 'paragrafo', texto, alinhamento: 'left', numero: null });
  }
  return blocos;
}

// ---------------------------------------------------------------------------
// Contexto (o que o modelo e a IA sabem do processo)
// ---------------------------------------------------------------------------

export interface ContextoDaPeca {
  orgao_nome: string;
  setor_nome: string | null;
  numero_processo: string;
  tipo_processo: string;
  objeto: string;
  etapa_rotulo: string;
  tipo_peca: string | null;
  titulo_peca: string;
  contrato: { numero: string; objeto: string | null; fornecedor: string | null; valor_global: number | null } | null;
  /** Peças já juntadas, na ordem (título + texto resumido). */
  pecas: Array<{ titulo: string; folhas: string; texto: string | null }>;
  autor_nome: string;
  autor_cargo: string | null;
  /** Modelo escolhido no desenho do fluxo para esta etapa (vai primeiro na lista). */
  modelo_preferido_id?: string | null;
}

export function moeda(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---------------------------------------------------------------------------
// Modelos por tipo de peça (ponto de partida no editor)
// ---------------------------------------------------------------------------

type Modelo = (c: ContextoDaPeca) => string;

const refContrato = (c: ContextoDaPeca) =>
  c.contrato ? `contrato nº ${c.contrato.numero}${c.contrato.fornecedor ? `, firmado com ${escapar(c.contrato.fornecedor)}` : ''}` : 'contrato <mark>número do contrato</mark>';

const MODELOS: Record<string, Modelo> = {
  OFICIO: (c) =>
    `<h3 style="text-align:center">OFÍCIO Nº [número do ofício]</h3>` +
    (c.setor_nome ? `<p>${escapar(c.setor_nome)}</p>` : '') +
    `<p>Ao(À) <mark>setor ou autoridade de destino</mark></p>` +
    `<p><strong>Assunto:</strong> ${escapar(c.objeto)}</p>` +
    `<p>Senhor(a),</p>` +
    `<p><mark>texto do ofício: o que se comunica ou solicita, e por quê</mark>.</p>` +
    `<p>Atenciosamente,</p>`,
  PEDIDO_ADITIVO: (c) =>
    `<h3 style="text-align:center">PEDIDO DE TERMO ADITIVO</h3>` +
    `<p>Ao <mark>setor responsável pela reserva de recurso</mark>.</p>` +
    `<p>Solicitamos a formalização de termo aditivo ao ${refContrato(c)}${c.contrato?.objeto ? `, cujo objeto é ${escapar(c.contrato.objeto)}` : ''}, para <mark>o que se pede: acréscimo, supressão ou prorrogação, com valores e prazos</mark>.</p>` +
    `<p>Justificativa: <mark>por que o aditivo é necessário e por que não cabe nova contratação</mark>.</p>` +
    `<p>O pedido observa os limites do art. 125 da Lei nº 14.133/2021 e a vigência do contrato.</p>`,
  VANTAJOSIDADE: (c) =>
    `<h3 style="text-align:center">DEMONSTRAÇÃO DE VANTAJOSIDADE DA RENOVAÇÃO</h3>` +
    `<p>Trata-se da prorrogação do ${refContrato(c)}, por novo ciclo de <mark>prazo</mark>, com fundamento no art. 107 da Lei nº 14.133/2021.</p>` +
    `<p>Os preços praticados permanecem vantajosos para a Administração, conforme <mark>pesquisa de preços ou comparação com o mercado</mark>.</p>` +
    `<p>O serviço foi prestado a contento, sem registro de <mark>penalidades ou ocorrências relevantes</mark>, e permanece a necessidade da contratação.</p>`,
  RESERVA_DOTACAO: (c) =>
    `<h3 style="text-align:center">RESERVA DE DOTAÇÃO ORÇAMENTÁRIA</h3>` +
    `<p>Ao Setor de Contratos.</p>` +
    `<p>Em atenção ao pedido constante dos autos, informamos que há disponibilidade orçamentária para a despesa relativa ao ${refContrato(c)}, no valor de <mark>valor</mark>, conforme:</p>` +
    `<ul><li>Unidade orçamentária: <mark>unidade</mark></li><li>Funcional programática: <mark>funcional programática</mark></li><li>Elemento de despesa: <mark>elemento</mark></li></ul>` +
    `<p>Fica reservado o valor indicado para o exercício de <mark>ano</mark>.</p>`,
  PARECER_PROCESSO: (c) =>
    `<h3 style="text-align:center">PARECER JURÍDICO</h3>` +
    `<p><strong>Assunto:</strong> ${c.tipo_processo === 'RENOVACAO' ? 'prorrogação' : 'termo aditivo'} do ${refContrato(c)}.</p>` +
    `<p><strong>Relatório.</strong> <mark>Resumo do que consta nos autos: pedido, reserva de recurso e documentos</mark>.</p>` +
    `<p><strong>Fundamentação.</strong> <mark>Análise à luz da Lei nº 14.133/2021 (arts. 104 a 107, 124 e 125) e das cláusulas do contrato</mark>.</p>` +
    `<p><strong>Conclusão.</strong> Opina-se pela <mark>possibilidade ou impossibilidade</mark> da formalização, <mark>com as recomendações cabíveis</mark>.</p>`,
  AUTORIZACAO_PROCESSO: (c) =>
    `<h3 style="text-align:center">AUTORIZAÇÃO</h3>` +
    `<p>À vista do que consta nos autos, em especial do parecer jurídico, <strong>autorizo</strong> a formalização do ${c.tipo_processo === 'RENOVACAO' ? 'termo de renovação' : 'termo aditivo'} do ${refContrato(c)}.</p>` +
    `<p>Encaminhe-se ao Setor de Contratos para a lavratura do termo.</p>`,
};

/** Variáveis que um modelo de peça pode usar ({{processo.numero}}, {{contrato.fornecedor}}…). */
export function variaveisDaPeca(c: ContextoDaPeca, agora = new Date()): Record<string, string> {
  const v: Record<string, string> = {
    'orgao.nome': c.orgao_nome,
    'setor.nome': c.setor_nome ?? '',
    'processo.numero': c.numero_processo,
    'processo.objeto': c.objeto,
    'processo.tipo': rotuloTipo(c.tipo_processo),
    'contrato.numero': c.contrato?.numero ?? '',
    'contrato.objeto': c.contrato?.objeto ?? '',
    'contrato.fornecedor': c.contrato?.fornecedor ?? '',
    'contrato.valor_global': moeda(c.contrato?.valor_global) ?? '',
    'autor.nome': c.autor_nome,
    'autor.cargo': c.autor_cargo ?? '',
    data_atual: agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' }),
  };
  return v;
}

export const VARIAVEIS_PECA = Object.keys(variaveisDaPeca({ orgao_nome: '', setor_nome: null, numero_processo: '', tipo_processo: 'ADITIVO', objeto: '', etapa_rotulo: '', tipo_peca: null, titulo_peca: '', contrato: null, pecas: [], autor_nome: '', autor_cargo: null }));

/** Aplica as variáveis ao HTML do modelo; a que não tem valor vira LACUNA (nunca `{{…}}` cru). */
export function aplicarVariaveisDaPeca(html: string, c: ContextoDaPeca): string {
  const v = variaveisDaPeca(c);
  return String(html ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, chave: string) => {
    const valor = v[chave];
    return valor && valor.trim() ? escapar(valor) : `<mark>${escapar(chave.replace(/[._]/g, ' '))}</mark>`;
  });
}

/** HTML de um modelo da tela "Modelos de documento": uma seção = o texto; várias = título + texto de cada. */
export function htmlDoModelo(secoes: Array<{ titulo?: string; texto_padrao?: string | null }>): string {
  const uteis = (secoes || []).filter((s) => (s.texto_padrao ?? '').trim());
  if (!uteis.length) return '';
  if (uteis.length === 1) return uteis[0].texto_padrao!;
  return uteis.map((s) => `<h3>${escapar(s.titulo ?? '')}</h3>${s.texto_padrao}`).join('');
}

/** Modelo do tipo de peça com o contexto aplicado; sem modelo, um começo mínimo. */
export function modeloDaPeca(c: ContextoDaPeca): string {
  const m = c.tipo_peca ? MODELOS[c.tipo_peca] : null;
  if (m) return m(c);
  return `<h3 style="text-align:center">${escapar(c.titulo_peca.toUpperCase())}</h3><p><mark>Escreva aqui o conteúdo da peça</mark>.</p>`;
}

// ---------------------------------------------------------------------------
// Rascunho pela IA
// ---------------------------------------------------------------------------

export const PROMPT_SISTEMA_PECA =
  'Você é um servidor experiente em contratações públicas (Lei nº 14.133/2021) que prepara o RASCUNHO de uma peça de processo administrativo para outro servidor revisar e assinar. ' +
  'Escreva em português do Brasil, em linguagem formal de autos administrativos, fiel ao contexto: nunca invente números, datas, nomes, valores, dotações, contratos ou leis locais que o contexto não traga. ' +
  'O que você não souber com certeza, escreva como lacuna: <mark>o que falta informar</mark>. Nunca inclua dados pessoais (CPF, e-mail, telefone). ' +
  'Responda APENAS com um objeto JSON válido, sem texto antes ou depois.';

/**
 * Estrutura obrigatória por tipo de peça no rascunho da IA. ETP: os 13
 * elementos do art. 18, § 1º (I, IV, VI, VIII e XIII obrigatórios pelo § 2º;
 * os demais, quando não se aplicarem, com a justificativa).
 */
const ESTRUTURA_DA_PECA: Record<string, string[]> = {
  ETP: [
    'Estrutura: um <h3> para cada elemento do art. 18, § 1º, nesta ordem: I – Descrição da necessidade; II – Previsão no plano de contratações anual; III – Requisitos da contratação; IV – Estimativa das quantidades, com memória de cálculo; V – Levantamento de mercado; VI – Estimativa do valor da contratação; VII – Descrição da solução como um todo; VIII – Justificativa para o parcelamento ou não; IX – Resultados pretendidos; X – Providências prévias; XI – Contratações correlatas e/ou interdependentes; XII – Impactos ambientais; XIII – Posicionamento conclusivo sobre a adequação da contratação.',
    'Os elementos I, IV, VI, VIII e XIII são obrigatórios (art. 18, § 2º). Nos demais, se não se aplicarem, escreva a justificativa em vez de omitir.',
    'Use o DFD, as demandas reunidas e a pesquisa de preço que estão nos autos; o que não estiver nos autos vira lacuna.',
  ],
};

export function montarPromptDaPeca(c: ContextoDaPeca, orientacao?: string | null): { sistema: string; usuario: string } {
  const linhas = [
    `Peça a redigir: ${c.titulo_peca} (etapa "${c.etapa_rotulo}" de um processo de ${rotuloTipo(c.tipo_processo)}).`,
    'Formato: HTML simples — <h3> para o título centralizado, <p> para parágrafos, <ul>/<ol>/<li> para listas, <strong> para ênfase, <mark> para lacunas. Sem <html>, <body>, estilos ou markdown.',
    'Comece pelo título da peça e termine antes da assinatura (o sistema põe local, data e assinatura).',
    orientacao ? `Orientação de quem pediu: ${orientacao}` : null,
    ...(ESTRUTURA_DA_PECA[c.tipo_peca ?? ''] ?? []),
    'Responda com um JSON com as chaves "titulo" (texto) e "html".',
    '',
    'CONTEXTO DO PROCESSO:',
    `Órgão: ${c.orgao_nome}${c.setor_nome ? ` — setor que redige: ${c.setor_nome}` : ''}.`,
    `Processo administrativo nº ${c.numero_processo}: ${c.objeto}.`,
    c.contrato
      ? `Contrato nº ${c.contrato.numero}${c.contrato.fornecedor ? ` com ${c.contrato.fornecedor}` : ''}${c.contrato.objeto ? ` — objeto: ${c.contrato.objeto}` : ''}${moeda(c.contrato.valor_global) ? ` — valor global ${moeda(c.contrato.valor_global)}` : ''}.`
      : null,
    c.pecas.length ? 'Peças já juntadas aos autos:' : 'Ainda não há peças nos autos.',
    ...c.pecas.map((p) => `- ${p.titulo} (${p.folhas})${p.texto ? `: ${p.texto}` : ''}`),
  ];
  return { sistema: PROMPT_SISTEMA_PECA, usuario: linhas.filter((l) => l !== null).join('\n') };
}

function rotuloTipo(t: string): string {
  return t === 'ADITIVO' ? 'termo aditivo' : t === 'RENOVACAO' ? 'renovação de contrato' : t === 'AVULSO' ? 'assunto avulso' : t.toLowerCase();
}

/** Tira as cercas de código e pega o primeiro objeto JSON da resposta. */
export function extrairJsonDaResposta(texto: string): { titulo: string | null; html: string } | null {
  let t = String(texto ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try {
    const o = JSON.parse(t.slice(ini, fim + 1));
    if (!o || typeof o !== 'object') return null;
    const html = htmlDaPecaSeguro(o.html ?? o.texto ?? '');
    if (!html) return null;
    const titulo = String(o.titulo ?? '').trim().slice(0, 300) || null;
    return { titulo, html };
  } catch {
    return null;
  }
}
