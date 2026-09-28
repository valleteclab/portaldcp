/**
 * DFD CONSOLIDADO — "o que fazer agora", regras de EXIBIÇÃO puras (sem React,
 * sem imports: testadas com `node --test`, ver proxima-acao-dfd.test.mjs).
 *
 * O caminho da unidade de planejamento tem 3 passos:
 *   1. Escolha as demandas  →  2. Monte e confira o DFD  →  3. Abra o processo
 * As regras (quem monta, 2ª aprovação, quando o processo pode abrir) são do
 * servidor (/api/dfds-consolidados/permissoes e o `permissoes` de cada DFD):
 * aqui só se decide QUAL botão mostrar e o texto que orienta. O servidor
 * confere tudo de novo e responde 403/400/409 com a razão.
 */

export type StatusDfd = 'RASCUNHO' | 'AGUARDANDO_APROVACAO' | 'APROVADO' | 'EM_PROCESSO' | 'CANCELADO'

/** Situação legível do DFD (lista, cabeçalho e badges). */
export const SITUACAO_DFD: Record<StatusDfd, string> = {
  RASCUNHO: 'Em elaboração',
  AGUARDANDO_APROVACAO: 'Aguardando 2ª aprovação',
  APROVADO: 'Aprovado',
  EM_PROCESSO: 'Processo aberto',
  CANCELADO: 'Cancelado',
}

export const situacaoDoDfd = (status: string): string => SITUACAO_DFD[status as StatusDfd] ?? status

// ---------------------------------------------------------------------------
// Guia de 3 passos
// ---------------------------------------------------------------------------

export type PassoGuia = 1 | 2 | 3

/**
 * Onde o DFD está no guia: `atual` = passo destacado; `concluidos` = passos já
 * feitos. Processo aberto = os 3 concluídos (atual null). Cancelado = sem
 * destaque (o caminho parou).
 */
export function passoDoDfd(status: string, exigeAprovacao: boolean): { atual: PassoGuia | null; concluidos: PassoGuia[] } {
  switch (status) {
    case 'RASCUNHO':
      return { atual: 2, concluidos: [1] }
    case 'AGUARDANDO_APROVACAO':
      // Com a 2ª aprovação desligada depois do envio, o processo já pode abrir
      return exigeAprovacao ? { atual: 2, concluidos: [1] } : { atual: 3, concluidos: [1, 2] }
    case 'APROVADO':
      return { atual: 3, concluidos: [1, 2] }
    case 'EM_PROCESSO':
      return { atual: null, concluidos: [1, 2, 3] }
    default:
      return { atual: null, concluidos: [1] }
  }
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

/** Ação que a tela do DFD executa ao abrir (`?acao=`): vinda do botão da lista. */
export type AcaoNaTelaDoDfd = 'abrir-processo' | 'enviar'

export function rotaDoDfd(id: string, extra?: { acao?: AcaoNaTelaDoDfd; montado?: boolean }): string {
  const q: string[] = []
  if (extra?.montado) q.push('montado=1')
  if (extra?.acao) q.push(`acao=${extra.acao}`)
  return `/orgao/demandas/dfd/${id}${q.length ? `?${q.join('&')}` : ''}`
}

/** Tela do processo com o aviso "Processo nº X aberto" (lido por AvisoProcessoAberto). */
export function rotaDoProcessoAberto(licitacaoId: string, dfdRotulo?: string | null): string {
  const q = ['aberto=dfd']
  if (dfdRotulo) q.push(`dfd=${encodeURIComponent(dfdRotulo)}`)
  return `/orgao/processos/${licitacaoId}?${q.join('&')}`
}

/** Acrescenta o aviso de abertura a um destino já pronto (ex.: `destino` do "feita fora"). */
export function comAvisoDeAbertura(destino: string, dfdRotulo?: string | null): string {
  if (!/^\/orgao\/processos\/[^/?#]+$/.test(destino)) return destino
  const id = destino.split('/').pop() as string
  return rotaDoProcessoAberto(id, dfdRotulo)
}

// ---------------------------------------------------------------------------
// Lista "DFDs em andamento": próxima ação de cada DFD
// ---------------------------------------------------------------------------

export interface DfdNaLista {
  id: string
  status: string
  licitacao_id?: string | null
  numero_processo?: string | null
}

/** GET /api/dfds-consolidados/permissoes (o que quem consulta pode fazer). */
export interface PermissoesGeraisDfd {
  pode_montar: boolean
  exige_aprovacao_dfd: boolean
  pode_aprovar_dfd?: boolean
  aprovador_dfd?: string | null
  responsavel_dfd?: string | null
}

export interface BotaoDfd {
  rotulo: string
  href: string
}

export interface ProximaAcaoDfd {
  situacao: string
  /** Frase curta: em que pé está e o que falta. */
  dica: string
  /** Botão principal (a próxima ação); null = nada a fazer por quem consulta. */
  principal: BotaoDfd | null
  /** Botão secundário (abrir o DFD). */
  secundaria: BotaoDfd | null
}

const entre = (s?: string | null) => (s ? ` (${s})` : '')

export function proximaAcaoDfd(dfd: DfdNaLista, perm: PermissoesGeraisDfd | null | undefined): ProximaAcaoDfd {
  const situacao = situacaoDoDfd(dfd.status)
  const montar = !!perm?.pode_montar
  const exige = !!perm?.exige_aprovacao_dfd
  const verDfd: BotaoDfd = { rotulo: 'Ver DFD', href: rotaDoDfd(dfd.id) }
  const abrir: BotaoDfd = { rotulo: 'Abrir processo', href: rotaDoDfd(dfd.id, { acao: 'abrir-processo' }) }

  switch (dfd.status) {
    case 'RASCUNHO':
      if (!montar) return { situacao, dica: `Em elaboração pela unidade de planejamento${entre(perm?.responsavel_dfd)}.`, principal: null, secundaria: verDfd }
      if (exige) {
        return {
          situacao,
          dica: `Confira os itens e envie para a 2ª aprovação${entre(perm?.aprovador_dfd)}.`,
          principal: { rotulo: 'Enviar para aprovação', href: rotaDoDfd(dfd.id, { acao: 'enviar' }) },
          secundaria: { rotulo: 'Continuar DFD', href: rotaDoDfd(dfd.id) },
        }
      }
      return { situacao, dica: 'Confira os itens e abra o processo.', principal: abrir, secundaria: { rotulo: 'Continuar DFD', href: rotaDoDfd(dfd.id) } }

    case 'AGUARDANDO_APROVACAO':
      if (!exige && montar) {
        return { situacao, dica: 'A 2ª aprovação foi desligada: o processo já pode ser aberto.', principal: abrir, secundaria: verDfd }
      }
      if (perm?.pode_aprovar_dfd) {
        return { situacao, dica: 'Aguarda a sua aprovação.', principal: { rotulo: 'Revisar e aprovar', href: rotaDoDfd(dfd.id) }, secundaria: null }
      }
      return { situacao, dica: `Aguardando a 2ª aprovação${entre(perm?.aprovador_dfd)}.`, principal: null, secundaria: verDfd }

    case 'APROVADO':
      if (!montar) return { situacao, dica: 'Aprovado — a unidade de planejamento abre o processo.', principal: null, secundaria: verDfd }
      return { situacao, dica: 'Aprovado — falta abrir o processo.', principal: abrir, secundaria: verDfd }

    case 'EM_PROCESSO':
      if (dfd.licitacao_id) {
        const numero = dfd.numero_processo ? ` nº ${dfd.numero_processo}` : ''
        return {
          situacao,
          dica: `Processo${numero} aberto.`,
          principal: { rotulo: `Ver processo${numero}`, href: `/orgao/processos/${dfd.licitacao_id}` },
          secundaria: verDfd,
        }
      }
      return { situacao, dica: 'Processo aberto.', principal: null, secundaria: verDfd }

    case 'CANCELADO':
      return { situacao, dica: 'Cancelado — as demandas voltaram a ficar livres.', principal: null, secundaria: verDfd }

    default:
      return { situacao, dica: '', principal: null, secundaria: verDfd }
  }
}

/** DFDs que ainda pedem ação (os "em andamento") primeiro; depois os com processo; cancelados por último. */
export function ordemDaLista(status: string): number {
  return ({ RASCUNHO: 0, AGUARDANDO_APROVACAO: 1, APROVADO: 0, EM_PROCESSO: 2, CANCELADO: 3 } as Record<string, number>)[status] ?? 4
}

// ---------------------------------------------------------------------------
// Tela do DFD: próximo passo em destaque
// ---------------------------------------------------------------------------

/** O `permissoes` de GET /api/dfds-consolidados/:id (já calculado para ESTE DFD). */
export interface PermissoesDoDfd {
  pode_montar: boolean
  exige_aprovacao_dfd: boolean
  aprovador_dfd?: string | null
  responsavel_dfd?: string | null
  enviar_aprovacao: boolean
  aprovar: boolean
  abrir_processo: boolean
}

export type AcaoDoPasso = 'ABRIR_PROCESSO' | 'ENVIAR_APROVACAO' | 'APROVAR' | 'VER_PROCESSO' | null

export interface ProximoPassoNoDfd {
  acao: AcaoDoPasso
  titulo: string
  texto: string
}

export function proximoPassoNoDfd(
  dfd: { status: string; processo?: { id: string; numero_processo: string | null } | null },
  p: PermissoesDoDfd,
): ProximoPassoNoDfd {
  if (dfd.processo && dfd.status === 'EM_PROCESSO') {
    const n = dfd.processo.numero_processo ? ` nº ${dfd.processo.numero_processo}` : ''
    return { acao: 'VER_PROCESSO', titulo: `Processo${n} aberto`, texto: 'O DFD já virou processo. Acompanhe a fase interna na tela do processo.' }
  }
  if (p.abrir_processo) {
    return {
      acao: 'ABRIR_PROCESSO',
      titulo: 'Próximo passo: abrir o processo',
      texto:
        dfd.status === 'APROVADO'
          ? 'O DFD foi aprovado. Clique em Abrir processo: ele nasce com os itens somados e a peça DFD já preenchida.'
          : 'Confira os dados e os itens abaixo e clique em Abrir processo. Ele nasce com os itens somados e a peça DFD já preenchida.',
    }
  }
  if (p.enviar_aprovacao) {
    return {
      acao: 'ENVIAR_APROVACAO',
      titulo: 'Próximo passo: enviar para aprovação',
      texto: `A 2ª aprovação do DFD está ligada neste órgão${entre(p.aprovador_dfd)}. Confira os itens e clique em Enviar para aprovação; depois dela, o processo pode ser aberto.`,
    }
  }
  if (p.aprovar) {
    return { acao: 'APROVAR', titulo: 'Este DFD aguarda a sua aprovação', texto: 'Confira os dados e os itens. Aprove para liberar a abertura do processo, ou devolva com o motivo.' }
  }
  switch (dfd.status) {
    case 'AGUARDANDO_APROVACAO':
      return {
        acao: null,
        titulo: 'Aguardando a 2ª aprovação',
        texto: `Quem aprova${entre(p.aprovador_dfd)} recebe o aviso. Depois da aprovação, a unidade de planejamento abre o processo.`,
      }
    case 'CANCELADO':
      return { acao: null, titulo: 'DFD cancelado', texto: 'As demandas voltaram a ficar livres e podem entrar em outro DFD.' }
    default:
      return {
        acao: null,
        titulo: 'Consulta',
        texto: `Só a unidade de planejamento${entre(p.responsavel_dfd)} altera o DFD e abre o processo.`,
      }
  }
}

// ---------------------------------------------------------------------------
// Tela do processo: aviso "Processo nº X aberto — está com… Próximo passo: …"
// ---------------------------------------------------------------------------

/** Subconjunto de GET /api/fase-interna/:id/tramitacao/com-quem-esta. */
export interface PosseDoProcesso {
  status: string
  setor: { nome: string | null } | null
  usuario: { nome: string | null } | null
}

/** Subconjunto de GET /api/fase-interna/:id/etapas. */
export interface EtapasDoProcesso {
  etapa_atual?: string | null
  etapas: Array<{
    etapa: string
    titulo: string
    passos?: Array<{
      passo: string
      titulo: string
      situacao: string
      tarefa?: { status: string; responsavel: { rotulo: string } } | null
      responsavel_previsto?: { rotulo: string } | null
    }>
  }>
}

const SITUACOES_EM_CURSO = ['EM_ANDAMENTO', 'A_REVISAR', 'DISPONIVEL']

/** Com quem está: "setor (pessoa)", só o setor, só a pessoa ou null (ainda não tramitado). */
export function comQuemEstaTexto(posse: PosseDoProcesso | null | undefined): string | null {
  if (!posse || posse.status === 'SEM_TRAMITACAO') return null
  const setor = posse.setor?.nome?.trim() || null
  const pessoa = posse.usuario?.nome?.trim() || null
  if (setor && pessoa) return `${setor} (${pessoa})`
  return setor || pessoa
}

/**
 * Próximo passo da fase interna: a 1ª etapa em curso (em andamento, a revisar
 * ou que pode começar), com quem responde por ela. Sem etapas → null.
 */
export function proximoPassoDoProcesso(etapas: EtapasDoProcesso | null | undefined): { titulo: string; quem: string | null } | null {
  const passos = (etapas?.etapas ?? []).flatMap((e) => e.passos ?? [])
  if (!passos.length) return null
  const peso = (s: string) => SITUACOES_EM_CURSO.indexOf(s)
  const emCurso = passos.filter((p) => peso(p.situacao) >= 0)
  // Em andamento/a revisar antes de "pode começar"; na ordem do fluxo
  const escolhido = emCurso.find((p) => p.situacao !== 'DISPONIVEL') ?? emCurso[0]
  if (!escolhido) return null
  const quem = (escolhido.tarefa?.status === 'ABERTA' ? escolhido.tarefa.responsavel?.rotulo : null) || escolhido.responsavel_previsto?.rotulo || null
  return { titulo: escolhido.titulo, quem }
}
