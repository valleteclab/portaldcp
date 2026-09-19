/**
 * Sugestão do tipo de bem do SIGA (tp_BemPatrimonial, 1–9) pela descrição,
 * por palavras-chave — sem IA. Ignora maiúsculas e acentos e respeita os
 * limites de palavra ("moto" não casa com "motor"). Quando a descrição cita
 * mais de um bem ("Mesa para computador"), vale o termo que aparece primeiro,
 * que em português costuma ser o núcleo; em empate de posição, o termo mais
 * longo ("quadro branco" vence "quadro").
 */

const REGRAS: { tipo: number; termos: string[] }[] = [
  {
    tipo: 1,
    termos: [
      'mesas?', 'mesinhas?', 'cadeiras?', 'poltronas?', 'longarinas?', 'bancos?', 'banquetas?', 'armarios?',
      'estantes?', 'arquivos?', 'gaveteiros?', 'sofas?', 'balc(ao|oes)', 'biros?', 'escrivaninhas?', 'racks?',
      'prateleiras?', 'roupeiros?', 'criados? mudos?', 'aparador(es)?', 'cabideiros?', 'divisorias?',
      'quadros? (branco|brancos|de avisos?|magneticos?|negros?|verdes?|de cortica)', 'lousas?', 'tribunas?',
      'pulpitos?', 'porta bandeiras?', 'mobiliarios?', 'moveis', 'movel',
      // Legado da Câmara de LEM: itens frequentes sem tipo na primeira passada
      'suportes?', 'persianas?', 'percianas?', 'cortinas?', 'lixeiras?', 'estofados?',
      'conteiner(es)?', 'containers?', 'botij(ao|oes)',
    ],
  },
  {
    tipo: 2,
    termos: [
      'gerador(es)?', 'grupos? gerador(es)?', 'motor(es)?', 'motobombas?', 'bombas?', 'compressor(es)?', 'rocadeiras?',
      'motosserras?', 'maquinas?', 'betoneiras?', 'lavadoras? de alta pressao', 'cortador(es)? de grama',
      'transformador(es)?',
    ],
  },
  {
    tipo: 3,
    termos: [
      'computador(es)?', 'microcomputador(es)?', 'desktops?', 'cpus?', 'notebooks?', 'laptops?', 'tablets?',
      'impressoras?', 'multifuncion(al|ais)', 'scanners?', 'monitor(es)?', 'estabilizador(es)?',
      'no ?breaks?', 'ar condicionados?', 'ares condicionados?', 'condicionador(es)? de ar', 'splits?',
      'telefones?', 'aparelhos? telefonicos?', 'celulares?', 'smartphones?', 'cameras?', 'filmadoras?',
      'projetor(es)?', 'data ?shows?', 'ferramentas?', 'microfones?', 'caixas? de som', 'caixas? acusticas?',
      'amplificador(es)?', 'mesas? de som', 'televisor(es)?', 'televis(ao|oes)', 'tvs?', 'switch(es)?',
      'roteador(es)?', 'servidor(es)? de rede', 'ventilador(es)?', 'bebedouros?', 'geladeiras?',
      'refrigerador(es)?', 'freezers?', 'frigobar(es)?', 'micro ondas', 'fog(ao|oes)', 'purificador(es)?',
      'fragmentadoras?', 'maquinas? fotograficas?', 'maquinas? de escrever', 'maquinas? de calcular', 'calculadoras?', 'guilhotinas?', 'furadeiras?', 'parafusadeiras?', 'escadas?', 'balancas?',
      'relogios? de ponto', 'aparelhos?', 'equipamentos?', 'instrumentos?', 'teclados?', 'violao',
      'violoes', 'guitarras?', 'baterias? musica(l|is)', 'sonorizac(ao|oes)', 'nobreaks?', 'hds? externos?',
      'auto falantes?', 'alto falantes?', 'extintor(es)?', 'mikrotik', 'suitch(es)?', 'receptor(es)?',
      'radios?', 'conversor(es)?', 'converter', 'notbooks?', 'copiadoras?', 'maquinas? (de )?xerox',
      'placas? de (video|rede|som|captura)',
    ],
  },
  { tipo: 4, termos: ['semoventes?', 'bovinos?', 'equinos?', 'caes', 'cavalos?'] },
  { tipo: 5, termos: ['livros?', 'colec(ao|oes)', 'enciclopedias?', 'dicionarios?', 'acervos? bibliografic(o|os)', 'biblioteca'] },
  {
    tipo: 6,
    termos: ['imove(l|is)', 'terrenos?', 'predios?', 'salas?', 'edificios?', 'edificac(ao|oes)', 'galp(ao|oes)'],
  },
  {
    tipo: 7,
    termos: ['quadros?', 'obras? de arte', 'esculturas?', 'bandeiras?', 'bras(ao|oes)', 'pinturas?', 'telas? a oleo', 'estatuas?', 'bustos?', 'placas? comemorativas?', 'placas?', 'tapecarias?'],
  },
  {
    tipo: 9,
    termos: [
      'veiculos?', 'carros?', 'automove(l|is)', 'motos?', 'motocicletas?', 'caminhonetes?', 'camionetes?', 'onibus',
      'micro onibus', 'caminh(ao|oes)', 'vans?', 'utilitarios?', 'pick ?ups?', 'ambulancias?',
    ],
  },
];

const PADROES = REGRAS.flatMap((r) =>
  r.termos.map((t) => ({ tipo: r.tipo, re: new RegExp(`(^|[^a-z0-9])(${t})(?![a-z0-9])`, 'g') })),
);

/** Minúsculas, sem acento, hífen/pontuação viram espaço. */
export function normalizarDescricao(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[-_/.,;:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tipo SIGA sugerido (1–9) pela descrição, ou null se nenhum termo casar. */
export function sugerirTipoSiga(descricao: unknown): number | null {
  const texto = normalizarDescricao(descricao);
  if (!texto) return null;
  let melhor: { pos: number; tam: number; tipo: number } | null = null;
  for (const { tipo, re } of PADROES) {
    re.lastIndex = 0;
    const m = re.exec(texto);
    if (!m) continue;
    const pos = m.index + m[1].length;
    const tam = m[2].length;
    if (!melhor || pos < melhor.pos || (pos === melhor.pos && tam > melhor.tam)) melhor = { pos, tam, tipo };
  }
  return melhor?.tipo ?? null;
}
