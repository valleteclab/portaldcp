/**
 * MODELOS PRONTOS do construtor de fluxo — pontos de partida que o órgão
 * carrega no RASCUNHO (nada é ativado sozinho). Código porque descrevem o
 * sistema (como a semente): o que o órgão faz com eles fica nos dados.
 *
 *  - "Câmara — Portaria 089": o modelo do sistema (a semente), como grafo;
 *  - "Câmara — Portaria 089, com controle interno": o mesmo, com a
 *    manifestação do controle interno ligada (Portaria 089/2024, art. 85);
 *  - "Prefeitura — Finanças aprova acima de R$ 50 mil" (contratação direta):
 *    depois da pesquisa, o sistema confere o valor estimado; acima do limite,
 *    o secretário de Finanças aprova (ou devolve à pesquisa) antes da reserva.
 */
import { PapelFaseInterna } from './codigos';
import { GrafoFluxo, autoPosicionar, grafoDeEtapas } from './grafo-fluxo';
import { TIPOS_PROCESSO_FLUXO, TipoProcessoFluxo } from './modelo-fluxo';
import { etapasSemente } from './semente-fluxo';

export interface ModeloPronto {
  codigo: string;
  nome: string;
  descricao: string;
  tipos: TipoProcessoFluxo[];
  grafo: (tipo: TipoProcessoFluxo) => GrafoFluxo;
}

/** Acrescenta ao grafo (com PESQUISA → RESERVA) a condição de valor e a aprovação de Finanças. */
export function comAprovacaoDeFinancas(base: GrafoFluxo, limite = 50000): GrafoFluxo {
  const g: GrafoFluxo = JSON.parse(JSON.stringify(base));
  const pesquisa = g.nos.find((n) => n.codigo === 'PESQUISA');
  const reserva = g.nos.find((n) => n.codigo === 'RESERVA');
  if (!pesquisa || !reserva) return g;
  g.arestas = g.arestas.filter((a) => !(a.de === pesquisa.id && a.para === reserva.id && a.rotulo !== 'devolve'));
  const valor = limite.toLocaleString('pt-BR');
  g.nos.push(
    {
      id: 'valor_financas',
      tipo: 'condicao',
      nome: `Valor estimado acima de R$ ${valor}?`,
      x: 0,
      y: 0,
      codigo: 'C_VALOR_FINANCAS',
      pecas: [],
      conclusao: 'CONDICAO',
      responsavel: { papel: PapelFaseInterna.AGENTE_CONTRATACAO, setor_id: null, usuario_id: null },
      prazo_dias_uteis: null,
      obrigatoria: false,
      ligada: true,
      ordem: 46,
      condicao: { campo: 'valor_total_estimado', operador: '>', valor: limite },
    },
    {
      id: 'financas',
      tipo: 'aprovacao',
      nome: 'Secretário de Finanças aprova a despesa',
      x: 0,
      y: 0,
      codigo: 'U_FINANCAS',
      pecas: [],
      conclusao: 'REGISTRO',
      tela: null,
      portao: null,
      fundamento: 'regulamento do órgão',
      responsavel: { papel: PapelFaseInterna.CONTABILIDADE, setor_id: null, usuario_id: null },
      prazo_dias_uteis: 2,
      obrigatoria: true,
      ligada: true,
      ia_rascunho: false,
      aprovacao_interna: false,
      dispensavel_por_ato: false,
      ordem: 47,
    },
  );
  let i = g.arestas.length;
  const aresta = (de: string, para: string, rotulo: 'normal' | 'sim' | 'nao' | 'devolve') => g.arestas.push({ id: `p${++i}`, de, para, rotulo });
  aresta(pesquisa.id, 'valor_financas', 'normal');
  aresta('valor_financas', 'financas', 'sim');
  aresta('valor_financas', reserva.id, 'nao');
  aresta('financas', reserva.id, 'normal');
  aresta('financas', pesquisa.id, 'devolve');
  return autoPosicionar(g);
}

export const MODELOS_PRONTOS: ModeloPronto[] = [
  {
    codigo: 'CAMARA_PORTARIA_089',
    nome: 'Câmara — Portaria 089',
    descricao:
      'O modelo do sistema: demanda → ETP, TR e pesquisa em paralelo → reserva → relatório e minutas → parecer jurídico → autorização → publicação (contratação direta; na licitação, o parecer antes da autorização da abertura). Autorização de início, indicação da modalidade e controle interno vêm desligados.',
    tipos: TIPOS_PROCESSO_FLUXO,
    grafo: (tipo) => grafoDeEtapas(etapasSemente(tipo)),
  },
  {
    codigo: 'CAMARA_089_CONTROLE_INTERNO',
    nome: 'Câmara — Portaria 089, com controle interno',
    descricao: 'O modelo do sistema com a manifestação do controle interno ligada, entre o parecer jurídico e a autorização (Portaria 089/2024, art. 85).',
    tipos: TIPOS_PROCESSO_FLUXO,
    grafo: (tipo) => grafoDeEtapas(etapasSemente(tipo).map((e) => (e.codigo === 'CONTROLE_INTERNO' ? { ...e, ligada: true } : e))),
  },
  {
    codigo: 'PREFEITURA_FINANCAS_VALOR',
    nome: 'Prefeitura — Finanças aprova acima de R$ 50 mil',
    descricao:
      'Contratação direta: depois da pesquisa de preços, o sistema confere o valor estimado. Acima de R$ 50 mil, o secretário de Finanças aprova a despesa (ou devolve à pesquisa) antes da reserva orçamentária. Ajuste o setor de Finanças e o limite ao seu órgão.',
    tipos: ['DISPENSA', 'INEXIGIBILIDADE'],
    grafo: (tipo) => comAprovacaoDeFinancas(grafoDeEtapas(etapasSemente(tipo)), 50000),
  },
];

export const modeloPronto = (codigo: string) => MODELOS_PRONTOS.find((m) => m.codigo === codigo) ?? null;
