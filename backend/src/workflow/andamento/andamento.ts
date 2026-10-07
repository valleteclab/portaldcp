import { travaLegal } from '../nos/catalogo-nos';

/**
 * ANDAMENTO DO PROCESSO — o que a tela de acompanhamento desenha: uma fila de
 * nós (concluída / em andamento / a realizar), igual para o processo livre
 * (ofício, avulso: o caminho é o que aconteceu) e para o processo com fluxo
 * desenhado (o caminho vem do desenho e os nós futuros já aparecem).
 *
 * Funções puras: o serviço busca as linhas e entrega aqui.
 */

export type SituacaoNo = 'CONCLUIDA' | 'EM_ANDAMENTO' | 'A_REALIZAR';

export interface NoAndamento {
  chave: string;
  titulo: string;
  /** Tipo do catálogo (fluxo desenhado) ou do evento (livre). */
  tipo: string | null;
  /** Setor ou pessoa: "Setor de Compras", "Maria Souza". */
  responsavel: string | null;
  situacao: SituacaoNo;
  /** Desde quando está nesta etapa (EM_ANDAMENTO) ou quando aconteceu (CONCLUIDA no livre). */
  desde: string | null;
  concluida_em: string | null;
  prazo_em: string | null;
  atrasada: boolean;
  /** Etapa que voltou por devolução e ainda não foi refeita. */
  devolvida: boolean;
  /** Fundamento legal quando a etapa é obrigatória por lei (cadeado). */
  obrigatoria_lei: string | null;
  /** Tarefa aberta desta etapa (fluxo desenhado, situação EM_ANDAMENTO) — id para concluir/devolver/indeferir. */
  tarefa_id: string | null;
}

export interface Andamento {
  modo: 'LIVRE' | 'FLUXO';
  fluxo: { id: string; nome: string; versao: number } | null;
  instancia_id: string | null;
  nos: NoAndamento[];
  concluidas: number;
  total: number;
  atual: NoAndamento | null;
  encerrado: boolean;
  /** Quem está vendo pode concluir/devolver a etapa atual (fluxo desenhado). Preenchido pelo serviço. */
  pode_agir?: boolean;
}

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function fechar(modo: Andamento['modo'], nos: NoAndamento[], extra: Partial<Andamento> = {}): Andamento {
  return {
    modo,
    fluxo: null,
    instancia_id: null,
    encerrado: false,
    ...extra,
    nos,
    concluidas: nos.filter((n) => n.situacao === 'CONCLUIDA').length,
    total: nos.length,
    atual: nos.find((n) => n.situacao === 'EM_ANDAMENTO') ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fluxo desenhado
// ---------------------------------------------------------------------------

export interface PassoDoFluxo {
  acao_id: string;
  titulo: string;
  tipo: string;
  responsavel: string | null;
}

export interface TarefaDoFluxo {
  id: string;
  acao_id: string;
  status: string; // ABERTA | CONCLUIDA | DEVOLVIDA | INDEFERIDA
  created_at: Date | string;
  concluida_em: Date | string | null;
  prazo_em: Date | string | null;
}

/**
 * Um nó por passo do desenho, na ordem. A situação vem da tarefa MAIS RECENTE
 * do passo: aberta = em andamento; concluída = concluída; devolvida = volta a
 * "a realizar" marcada como devolvida; sem tarefa = a realizar.
 */
export function andamentoDoFluxo(entrada: {
  fluxo: { id: string; nome: string; versao: number };
  instancia_id: string;
  status_instancia: string;
  passos: PassoDoFluxo[];
  tarefas: TarefaDoFluxo[];
  agora: Date;
}): Andamento {
  const ultima = new Map<string, TarefaDoFluxo>();
  for (const t of entrada.tarefas) {
    const atual = ultima.get(t.acao_id);
    if (!atual || new Date(t.created_at).getTime() >= new Date(atual.created_at).getTime()) ultima.set(t.acao_id, t);
  }
  const nos = entrada.passos.map((p): NoAndamento => {
    const t = ultima.get(p.acao_id);
    const status = t?.status ?? null;
    // INDEFERIDA conta como concluída na fila (a etapa foi decidida; quem encerra o fluxo é o status da instância).
    const situacao: SituacaoNo = status === 'ABERTA' ? 'EM_ANDAMENTO' : status === 'CONCLUIDA' || status === 'INDEFERIDA' ? 'CONCLUIDA' : 'A_REALIZAR';
    const prazo = situacao === 'EM_ANDAMENTO' ? iso(t?.prazo_em) : null;
    return {
      chave: p.acao_id,
      titulo: p.titulo,
      tipo: p.tipo,
      responsavel: p.responsavel,
      situacao,
      desde: situacao === 'EM_ANDAMENTO' ? iso(t?.created_at) : null,
      concluida_em: situacao === 'CONCLUIDA' ? iso(t?.concluida_em) : null,
      prazo_em: prazo,
      atrasada: !!prazo && new Date(prazo).getTime() < entrada.agora.getTime(),
      devolvida: status === 'DEVOLVIDA',
      obrigatoria_lei: travaLegal(p.tipo),
      tarefa_id: situacao === 'EM_ANDAMENTO' ? (t?.id ?? null) : null,
    };
  });
  return fechar('FLUXO', nos, {
    fluxo: entrada.fluxo,
    instancia_id: entrada.instancia_id,
    encerrado: entrada.status_instancia === 'CONCLUIDA' || entrada.status_instancia === 'INDEFERIDA',
  });
}

// ---------------------------------------------------------------------------
// Processo livre (sem desenho)
// ---------------------------------------------------------------------------

export interface MovimentacaoLivre {
  tipo: string; // ABERTURA | ENVIO | DEVOLUCAO
  created_at: Date | string;
  para_setor_nome: string | null;
  para_usuario_nome: string | null;
  recebida_em: Date | string | null;
}

export interface PecaLivre {
  titulo: string;
  created_at: Date | string;
  criado_por_nome: string | null;
}

const destino = (m: MovimentacaoLivre) => [m.para_setor_nome, m.para_usuario_nome].filter(Boolean).join(' · ') || 'Órgão';

/**
 * O caminho é o que aconteceu: autuação, peças juntadas, envios e
 * recebimentos em ordem cronológica, e por último onde o processo está agora
 * (em andamento). Encerrado: o último nó é o encerramento, sem nó em
 * andamento. Não há nós "a realizar" — quem decide o próximo passo é a pessoa.
 */
export function andamentoLivre(entrada: {
  movimentacoes: MovimentacaoLivre[];
  pecas: PecaLivre[];
  encerramento: { em: Date | string } | null;
  /** Próximo passo esperado, desenhado como "a realizar" (ofício enviado: a resposta). */
  esperada?: { titulo: string } | null;
}): Andamento {
  const movs = [...entrada.movimentacoes].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const ultima = movs.length ? movs[movs.length - 1] : null;
  const aberto = !entrada.encerramento;

  type Evento = { quando: number; no: NoAndamento };
  const eventos: Evento[] = [];
  const concluido = (chave: string, titulo: string, tipo: string, responsavel: string | null, quando: Date | string): Evento => ({
    quando: new Date(quando).getTime(),
    no: { chave, titulo, tipo, responsavel, situacao: 'CONCLUIDA', desde: iso(quando), concluida_em: iso(quando), prazo_em: null, atrasada: false, devolvida: false, obrigatoria_lei: null, tarefa_id: null },
  });

  movs.forEach((m, i) => {
    const ehUltima = m === ultima;
    if (m.tipo === 'ABERTURA') {
      eventos.push(concluido(`mov-${i}`, 'Autuado', 'ABERTURA', destino(m), m.created_at));
      return;
    }
    eventos.push(concluido(`mov-${i}`, m.tipo === 'DEVOLUCAO' ? 'Devolvido' : 'Enviado', m.tipo, `para ${destino(m)}`, m.created_at));
    // O recebimento da última remessa vira o nó "em andamento" no fim.
    if (m.recebida_em && !(ehUltima && aberto)) eventos.push(concluido(`rec-${i}`, 'Recebido', 'RECEBIMENTO', destino(m), m.recebida_em));
  });
  entrada.pecas.forEach((p, i) => eventos.push(concluido(`peca-${i}`, p.titulo, 'PECA', p.criado_por_nome, p.created_at)));
  eventos.sort((a, b) => a.quando - b.quando);
  const nos = eventos.map((e) => e.no);

  if (entrada.encerramento) {
    nos.push({ ...concluido('encerramento', 'Encerrado', 'ENCERRAMENTO', null, entrada.encerramento.em).no });
  } else if (ultima) {
    const aguardando = ultima.tipo !== 'ABERTURA' && !ultima.recebida_em;
    const desde = aguardando ? ultima.created_at : ultima.recebida_em ?? ultima.created_at;
    nos.push({
      chave: 'atual',
      titulo: aguardando ? 'Aguardando recebimento' : ultima.tipo === 'ABERTURA' ? `Com ${destino(ultima)}` : 'Recebido',
      tipo: aguardando ? 'AGUARDANDO_RECEBIMENTO' : 'POSSE',
      responsavel: destino(ultima),
      situacao: 'EM_ANDAMENTO',
      desde: iso(desde),
      concluida_em: null,
      prazo_em: null,
      atrasada: false,
      devolvida: false,
      obrigatoria_lei: null,
      tarefa_id: null,
    });
  }
  if (!entrada.encerramento && ultima && entrada.esperada) {
    nos.push({
      chave: 'esperada',
      titulo: entrada.esperada.titulo,
      tipo: 'ESPERADA',
      responsavel: destino(ultima),
      situacao: 'A_REALIZAR',
      desde: null,
      concluida_em: null,
      prazo_em: null,
      atrasada: false,
      devolvida: false,
      obrigatoria_lei: null,
      tarefa_id: null,
    });
  }
  return fechar('LIVRE', nos, { encerrado: !!entrada.encerramento });
}
