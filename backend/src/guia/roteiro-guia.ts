/**
 * GUIA DE PRIMEIROS PASSOS — regras puras dos dois roteiros (sem banco).
 *
 * O andamento é DEDUZIDO dos dados do órgão: nada se marca à mão. Roteiro A
 * olha os fluxos de contratação; roteiro B segue uma demanda de teste até a
 * publicação, passando pelas etapas do fluxo ativo (o roteiro muda junto
 * com o desenho do fluxo).
 */

export type SituacaoPasso = 'CONCLUIDO' | 'ATUAL' | 'A_FAZER';

export interface PessoaGuia {
  nome: string;
  email: string | null;
}

/** Tela onde o passo se faz e o elemento destacado nela (`data-guia`). */
export interface TelaPasso {
  rota: string;
  alvo: string | null;
  balao: string;
}

export interface PassoGuia {
  chave: string;
  titulo: string;
  o_que_fazer: string;
  quem: string;
  por_que: string | null;
  conclui_quando: string;
  situacao: SituacaoPasso;
  tela: TelaPasso | null;
  /** Quem está logado pode fazer este passo? (só faz sentido no passo atual) */
  pode_agir: boolean;
  quem_pode: PessoaGuia[];
}

export interface RoteiroGuia {
  chave: 'FLUXO' | 'DISPENSA';
  titulo: string;
  descricao: string;
  iniciado: boolean;
  /** Impede o roteiro de andar (ex.: sem fluxo ativo). */
  bloqueio: string | null;
  referencia: string | null;
  passos: PassoGuia[];
  concluidos: number;
  total: number;
}

type PassoSemSituacao = Omit<PassoGuia, 'situacao'> & { feito: boolean };

/** O primeiro passo não feito é o atual (roteiro não iniciado: nenhum atual). */
export function comSituacao(passos: PassoSemSituacao[], iniciado: boolean): PassoGuia[] {
  let atualMarcado = !iniciado;
  return passos.map(({ feito, ...p }) => {
    if (feito) return { ...p, situacao: 'CONCLUIDO' as const };
    if (!atualMarcado) {
      atualMarcado = true;
      return { ...p, situacao: 'ATUAL' as const };
    }
    return { ...p, situacao: 'A_FAZER' as const };
  });
}

function fechar(r: Omit<RoteiroGuia, 'concluidos' | 'total'>): RoteiroGuia {
  return { ...r, concluidos: r.passos.filter((p) => p.situacao === 'CONCLUIDO').length, total: r.passos.length };
}

// ---------------------------------------------------------------------------
// Roteiro A — configurar o fluxo de contratação
// ---------------------------------------------------------------------------

export interface DadosRoteiroFluxo {
  /** Fluxo de contratação mais relevante (o ativo, senão o rascunho mais recente). */
  fluxo: { id: string; nome: string; status: string; etapas: number; etapas_sem_responsavel: number } | null;
  ativo: { id: string; nome: string } | null;
  pode_agir: boolean;
  quem_pode: PessoaGuia[];
}

export function roteiroFluxo(d: DadosRoteiroFluxo): RoteiroGuia {
  const telaFluxo = d.fluxo ? `/orgao/configuracoes/fluxos?fluxo=${d.fluxo.id}` : '/orgao/configuracoes/fluxos';
  const desenhado = !!d.ativo || (!!d.fluxo && d.fluxo.etapas >= 2 && d.fluxo.etapas_sem_responsavel === 0);
  const base = { quem: 'Administração do órgão', pode_agir: d.pode_agir, quem_pode: d.quem_pode };
  const passos = comSituacao(
    [
      {
        ...base,
        chave: 'fluxo-criar',
        titulo: 'Criar o fluxo de contratação',
        o_que_fazer: 'Em Fluxos de processo, clique em "Novo fluxo", dê um nome (ex.: Contratação direta — dispensa) e escolha o tipo Contratação.',
        por_que: 'O fluxo define por quais setores o processo passa e em que ordem. Com ele, cada etapa concluída segue sozinha para o setor seguinte.',
        conclui_quando: 'Conclui quando o fluxo de contratação for criado.',
        tela: { rota: '/orgao/configuracoes/fluxos', alvo: 'novo-fluxo', balao: 'Clique em "Novo fluxo", informe o nome e escolha o tipo Contratação.' },
        feito: !!d.fluxo || !!d.ativo,
      },
      {
        ...base,
        chave: 'fluxo-desenhar',
        titulo: 'Desenhar etapas, responsáveis e prazos',
        o_que_fazer: 'Arraste as etapas da paleta (DFD, Pesquisa de preço, ETP, Parecer jurídico, Autorização, Publicação). Em cada uma, indique o setor responsável e o prazo em dias úteis.',
        por_que: 'Cada etapa vira uma providência na caixa do setor responsável, com prazo contado em dias úteis.',
        conclui_quando: 'Conclui quando o fluxo tiver ao menos duas etapas, todas com responsável.',
        tela: { rota: telaFluxo, alvo: 'paleta-fluxo', balao: 'Arraste as etapas para o desenho e defina o responsável e o prazo de cada uma.' },
        feito: desenhado,
      },
      {
        ...base,
        chave: 'fluxo-ativar',
        titulo: 'Ativar o fluxo',
        o_que_fazer: 'Confira o desenho e clique em "Ativar". Só um fluxo de contratação fica ativo por vez; os processos novos passam a segui-lo.',
        por_que: 'Processos abertos depois da ativação nascem neste fluxo. Os que já estão em andamento não mudam.',
        conclui_quando: 'Conclui quando houver um fluxo de contratação ativo.',
        tela: { rota: telaFluxo, alvo: 'ativar-fluxo', balao: 'Confira o desenho e clique em "Ativar".' },
        feito: !!d.ativo,
      },
    ],
    true,
  );
  return fechar({
    chave: 'FLUXO',
    titulo: 'Configurar o fluxo de contratação',
    descricao: 'Criar o fluxo, definir etapas, setores responsáveis e prazos, e ativá-lo. Feito por quem administra o órgão.',
    iniciado: true,
    bloqueio: null,
    referencia: d.ativo ? `Fluxo ativo: "${d.ativo.nome}"` : null,
    passos,
  });
}

// ---------------------------------------------------------------------------
// Roteiro B — uma dispensa do começo ao fim
// ---------------------------------------------------------------------------

export interface EtapaDoFluxoGuia {
  chave: string;
  titulo: string;
  tipo: string | null;
  responsavel: string | null;
  concluida: boolean;
}

export interface DadosRoteiroDispensa {
  iniciado: boolean;
  fluxo_ativo: boolean;
  demanda: { id: string; rotulo: string | null; enviada: boolean; aprovada: boolean } | null;
  dfd: { id: string } | null;
  processo: { id: string; numero: string | null; licitacao_id: string | null } | null;
  /** Etapas do processo (andamento) ou, antes de abrir o processo, as do fluxo ativo. */
  etapas: EtapaDoFluxoGuia[];
  publicado: boolean;
  pode: { demanda: boolean; aprovar: boolean; montar: boolean; etapa: boolean; publicar: boolean };
  /** `etapa` = quem pode a etapa ATUAL do processo. */
  quem_pode: { aprovar: PessoaGuia[]; montar: PessoaGuia[]; etapa: PessoaGuia[]; publicar: PessoaGuia[] };
}

/** Fundamento legal de cada tipo de etapa (Lei 14.133/2021), mostrado em "Por quê". */
const POR_QUE_ETAPA: Record<string, string> = {
  DEMANDA: 'Formaliza a necessidade da contratação (art. 72, I).',
  DFD: 'Formaliza a demanda e reúne os pedidos do planejamento (art. 12, VII, e art. 72, I).',
  PESQUISA_PRECO: 'A estimativa da despesa vem da pesquisa de preços (art. 23 e art. 72, II). Use as buscas no PNCP, na internet e nas fontes configuradas.',
  ETP: 'Estudo técnico preliminar, quando for o caso (art. 18, § 1º, e art. 72, I).',
  MAPA_RISCOS: 'Análise de riscos, quando for o caso (art. 72, I).',
  TR: 'Termo de referência (art. 6º, XXIII, e art. 72, I).',
  RESERVA_ORCAMENTARIA: 'Demonstra a compatibilidade da previsão de recursos com o compromisso assumido (art. 72, IV).',
  PARECER_JURIDICO: 'Parecer jurídico que demonstra o atendimento dos requisitos exigidos (art. 53 e art. 72, III).',
  CONTROLE_INTERNO: 'Manifestação do controle interno, quando prevista pelo órgão.',
  AUTORIZACAO: 'Autorização da autoridade competente (art. 72, VIII).',
  APROVACAO: 'Aprovação registrada nos autos, conforme o fluxo do órgão.',
  PUBLICACAO: 'Aviso da dispensa em sítio oficial por no mínimo 3 dias úteis (art. 75, § 3º) e divulgação no PNCP (art. 72, parágrafo único).',
};

/** Etapas que o fluxo faz sozinho não aparecem no roteiro. */
const ETAPAS_AUTOMATICAS = new Set(['NOTIFICAR']);

export function porQueDaEtapa(tipo: string | null | undefined): string | null {
  return POR_QUE_ETAPA[String(tipo ?? '').toUpperCase()] ?? null;
}

export function roteiroDispensa(d: DadosRoteiroDispensa): RoteiroGuia {
  const dem = d.demanda;
  const proc = d.processo;
  const etapas = d.etapas.filter((e) => !ETAPAS_AUTOMATICAS.has(String(e.tipo ?? '').toUpperCase()));
  const temPublicacaoNoFluxo = etapas.some((e) => String(e.tipo ?? '').toUpperCase() === 'PUBLICACAO');

  const passos: PassoSemSituacao[] = [
    {
      chave: 'demanda',
      titulo: 'Registrar e enviar a demanda',
      o_que_fazer: dem
        ? 'Confira os itens e a justificativa da demanda e clique em "Enviar demanda".'
        : 'Em Demandas, clique em "Nova Demanda", descreva o que o setor precisa, por quê e a quantidade estimada. Depois, envie a demanda.',
      quem: 'Setor requisitante',
      por_que: 'É o pedido do setor: o que precisa, por quê e para quando. Ainda não é o DFD.',
      conclui_quando: 'Conclui quando a demanda for enviada.',
      tela: dem
        ? { rota: `/orgao/demandas/${dem.id}`, alvo: 'enviar-demanda', balao: 'Confira a demanda e clique em "Enviar demanda".' }
        : { rota: '/orgao/demandas', alvo: 'nova-demanda', balao: 'Clique em "Nova Demanda" e descreva o que o setor precisa.' },
      pode_agir: d.pode.demanda,
      quem_pode: [],
      feito: !!dem?.enviada,
    },
    {
      chave: 'aprovacao',
      titulo: 'Aprovar a demanda',
      o_que_fazer: 'Na Central de Aprovações, aba "Demandas e DFD", localize a demanda e clique em "Aprovar".',
      quem: 'Aprovador de demandas',
      por_que: 'A demanda só segue para o planejamento depois de aprovada por quem tem essa competência no órgão.',
      conclui_quando: 'Conclui quando a demanda for aprovada.',
      tela: { rota: '/orgao/aprovacoes?tab=demandas', alvo: dem ? `aprovar-demanda-${dem.id}` : null, balao: 'Confira a demanda e clique em "Aprovar".' },
      pode_agir: d.pode.aprovar,
      quem_pode: d.quem_pode.aprovar,
      feito: !!dem?.aprovada,
    },
    {
      chave: 'abrir-processo',
      titulo: 'Consolidar no DFD e abrir o processo',
      o_que_fazer: d.dfd
        ? 'Na tela do DFD, clique no botão do próximo passo. Se o órgão exige a 2ª aprovação do DFD, envie para aprovação; aprovado, clique em "Abrir processo" e escolha Dispensa eletrônica.'
        : 'Em Pedidos aprovados aguardando DFD, marque a demanda, clique em "Montar DFD" e, na tela do DFD, em "Abrir processo", escolhendo Dispensa eletrônica.',
      quem: 'Unidade de planejamento',
      por_que: 'O DFD reúne as demandas do planejamento (art. 12, VII). O processo já nasce no fluxo ativo e segue para a etapa seguinte sem envio manual.',
      conclui_quando: 'Conclui quando o processo for aberto.',
      tela: d.dfd
        ? { rota: `/orgao/demandas/dfd/${d.dfd.id}`, alvo: 'dfd-proximo-passo', balao: 'Clique aqui. Ao abrir o processo, escolha a modalidade Dispensa eletrônica.' }
        : { rota: '/orgao/demandas/consolidacao', alvo: 'montar-dfd', balao: 'Marque a demanda e clique em "Montar DFD".' },
      pode_agir: d.pode.montar,
      quem_pode: d.quem_pode.montar,
      feito: !!proc,
    },
    ...etapas.map<PassoSemSituacao>((e) => ({
      chave: `etapa:${e.chave}`,
      titulo: e.titulo,
      o_que_fazer: proc
        ? `Na tela do processo, use o botão da etapa atual para fazer a etapa "${e.titulo}". Ao concluir, o processo segue pelo fluxo para a próxima etapa.`
        : `Etapa do fluxo ativo. Fica disponível depois que o processo for aberto.`,
      quem: e.responsavel ?? 'Responsável da etapa',
      por_que: porQueDaEtapa(e.tipo),
      conclui_quando: 'Conclui quando a etapa for concluída no processo.',
      tela: proc ? { rota: `/orgao/processo/${proc.id}`, alvo: 'etapa-atual', balao: `Use o botão em destaque: receba o processo, se for pedido, e faça a etapa "${e.titulo}". Ao concluir, o processo segue sozinho para a próxima etapa.` } : null,
      pode_agir: d.pode.etapa,
      quem_pode: d.quem_pode.etapa,
      feito: e.concluida,
    })),
  ];

  if (!temPublicacaoNoFluxo) {
    passos.push({
      chave: 'publicacao',
      titulo: 'Publicação no PNCP',
      o_que_fazer: 'Na tela da licitação, confira a lista de pré-publicação e divulgue o aviso da dispensa no PNCP.',
      quem: 'Agente de contratação',
      por_que: porQueDaEtapa('PUBLICACAO'),
      conclui_quando: 'Conclui quando a compra constar como enviada ao PNCP.',
      tela: proc?.licitacao_id
        ? { rota: `/orgao/processos/${proc.licitacao_id}?detalhes=1`, alvo: 'publicacao', balao: 'Confira a lista de pré-publicação e divulgue o aviso da dispensa no PNCP.' }
        : null,
      pode_agir: d.pode.publicar,
      quem_pode: d.quem_pode.publicar,
      feito: d.publicado,
    });
  }

  return fechar({
    chave: 'DISPENSA',
    titulo: 'Uma dispensa do começo ao fim',
    descricao: 'Da demanda do setor até a publicação. Passa por vários setores: o guia indica com quem entrar em cada passo.',
    iniciado: d.iniciado,
    bloqueio: d.fluxo_ativo ? null : 'Ative primeiro um fluxo de contratação (roteiro A): o processo de teste precisa nascer num fluxo.',
    referencia: [dem?.rotulo ? `Demanda: ${dem.rotulo}` : null, proc?.numero ? `Processo nº ${proc.numero}` : null].filter(Boolean).join(' · ') || null,
    // Quem pode a etapa do processo só vale para a etapa atual
    passos: comSituacao(passos, d.iniciado && d.fluxo_ativo).map((p) =>
      p.chave.startsWith('etapa:') && p.situacao !== 'ATUAL' ? { ...p, quem_pode: [] } : p,
    ),
  });
}
