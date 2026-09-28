/**
 * VISÃO DA FASE INTERNA (F3b) — regras de EXIBIÇÃO, puras (sem React, sem
 * imports: testadas com `node --test`, ver visao-fluxo.test.mjs).
 *
 * Tudo o que decide o fluxo vem do servidor (GET /api/fase-interna/:id/etapas,
 * …/tramitacao/com-quem-esta, …/tramitacao/sugestao-envio): aqui só se monta o
 * desenho (colunas por nível de dependência), o estado de cada etapa e quais
 * botões aparecem. O servidor confere tudo de novo e responde 403/400/409 com
 * a razão — a tela mostra essa razão.
 */

// ---------------------------------------------------------------------------
// Tipos da resposta de GET /api/fase-interna/:id/etapas (F1 — PR #519)
// ---------------------------------------------------------------------------

export type SituacaoPasso = "AGUARDANDO" | "DISPONIVEL" | "EM_ANDAMENTO" | "A_REVISAR" | "CONCLUIDO" | "NAO_REALIZADO" | "CANCELADO"
export type SituacaoGrupo = "AGUARDANDO" | "DISPONIVEL" | "EM_ANDAMENTO" | "A_REVISAR" | "CONCLUIDA" | "NAO_REALIZADA" | "CANCELADA"
export type ConclusaoEtapa = "PECAS" | "DIVULGACAO" | "REGISTRO"

export interface MarcaFluxo {
  em?: string | null
  por_nome?: string | null
  motivo?: string | null
  texto?: string | null
  origem?: string | null
}

/** Subconjunto da tarefa (TarefaTela) que a visão usa. */
export interface TarefaDoPasso {
  status: "ABERTA" | "CONCLUIDA" | "CANCELADA"
  prazo: string | null
  atrasada: boolean
  dias_uteis_restantes: number | null
  responsavel: { rotulo: string }
  concluida_por_nome: string | null
  concluida_em: string | null
}

export interface PecaDoPassoTela {
  tipo: string
  titulo: string
  status: string
  pronta: boolean
}

export interface PassoFluxo {
  passo: string
  titulo: string
  situacao: SituacaoPasso
  pecas: PecaDoPassoTela[]
  depende_de?: string[]
  pendencias: string[]
  pode_iniciar?: boolean
  peca_pendente: string | null
  tarefa: TarefaDoPasso | null
  responsavel_previsto?: { rotulo: string } | null
  prazo_dias_uteis: number | null
  /** Pendências da trava da lei (portão A) que seguram a conclusão. */
  bloqueio_portao?: string[]
  conclusao?: ConclusaoEtapa
  obrigatoria?: boolean
  opcional?: boolean
  fundamento?: string | null
  dispensavel_por_ato?: boolean
  aguardando_aprovacao?: boolean
  reaberta?: MarcaFluxo | null
  a_revisar?: MarcaFluxo | null
  registro?: MarcaFluxo | null
  /** Pode voltar (reabrir) esta etapa: quem conduz o processo ou o responsável por ela. */
  pode_reabrir?: boolean
}

export interface GrupoFluxo {
  etapa: string
  numero: number
  titulo: string
  situacao: SituacaoGrupo
  nao_se_aplica: boolean
  passos: PassoFluxo[]
}

export interface PermissoesFluxo {
  conduzir: boolean
  reabrir: boolean
  dispensar_parecer?: boolean
}

export interface AprovacaoDemanda {
  exigida: boolean
  aprovada: boolean
  etapa?: string
  pode_aprovar: boolean
  aprovador: { rotulo: string }
  registro?: { origem?: string | null; por_nome?: string | null; em?: string | null; observacao?: string | null } | null
}

export interface DispensaParecer {
  numero_ato: string
  data_ato: string
  hipotese?: string | null
  por_nome?: string | null
}

export interface EtapasFluxoResposta {
  modo: "SIMPLES" | "POR_SETOR"
  controle_interno_ativo: boolean
  etapa_atual: string | null
  concluidas: number
  total: number
  etapas: GrupoFluxo[]
  historico: Array<{ acao: string; descricao: string; usuario_nome: string | null; created_at: string }>
  modelo?: { nome: string; versao: number; legado?: boolean } | null
  aprovacao_demanda?: AprovacaoDemanda
  parecer?: { dispensavel_por_ato: boolean; dispensa: DispensaParecer | null }
  desenho?: Array<{ nivel: number; etapas: string[] }>
  permissoes?: PermissoesFluxo
}

// ---------------------------------------------------------------------------
// Situação (cor + texto)
// ---------------------------------------------------------------------------

/** Tom visual — o mesmo vocabulário da barra de etapas do processo (BarraEtapas). */
export type TomSituacao = "ok" | "atual" | "alerta" | "futura" | "neutra"

export const SITUACAO_DO_PASSO: Record<SituacaoPasso, { texto: string; tom: TomSituacao }> = {
  CONCLUIDO: { texto: "Concluída", tom: "ok" },
  EM_ANDAMENTO: { texto: "Em andamento", tom: "atual" },
  DISPONIVEL: { texto: "Pode começar", tom: "atual" },
  A_REVISAR: { texto: "A revisar", tom: "alerta" },
  AGUARDANDO: { texto: "Aguardando", tom: "futura" },
  NAO_REALIZADO: { texto: "Não realizada", tom: "neutra" },
  CANCELADO: { texto: "Cancelada", tom: "neutra" },
}

/** Texto da situação do passo, com o detalhe que muda a leitura (reaberta, aguarda aprovação). */
export function textoDaSituacao(p: Pick<PassoFluxo, "situacao" | "reaberta" | "aguardando_aprovacao">): string {
  if (p.reaberta && p.situacao !== "CONCLUIDO") return "Reaberta (voltou para ajuste)"
  if (p.aguardando_aprovacao) return "Pronta — aguarda a aprovação da demanda"
  return SITUACAO_DO_PASSO[p.situacao]?.texto ?? p.situacao
}

// ---------------------------------------------------------------------------
// Desenho: colunas por nível de dependência
// ---------------------------------------------------------------------------

export function todosOsPassos(r: Pick<EtapasFluxoResposta, "etapas"> | null | undefined): PassoFluxo[] {
  return (r?.etapas ?? []).flatMap((e) => e.passos ?? [])
}

export interface ColunaDoDesenho {
  nivel: number
  passos: PassoFluxo[]
}

/**
 * Colunas do desenho: usa o `desenho` do servidor (níveis do grafo do modelo);
 * sem ele (servidor antigo), calcula pelo `depende_de` — nível 1 = não depende
 * de ninguém; senão 1 + o maior nível das dependências. Passo que não está no
 * desenho entra no nível calculado. Etapas do mesmo nível podem andar juntas.
 */
export function colunasDoDesenho(r: Pick<EtapasFluxoResposta, "etapas" | "desenho"> | null | undefined): ColunaDoDesenho[] {
  const passos = todosOsPassos(r)
  if (!passos.length) return []
  const porCodigo = new Map(passos.map((p) => [p.passo, p]))
  const nivel = new Map<string, number>()
  for (const n of r?.desenho ?? []) {
    for (const c of n.etapas) if (porCodigo.has(c) && !nivel.has(c)) nivel.set(c, n.nivel)
  }
  // Calcula o que faltou (com proteção contra ciclo)
  const calcular = (c: string, pilha: Set<string>): number => {
    const ja = nivel.get(c)
    if (ja !== undefined) return ja
    if (pilha.has(c)) return 1
    pilha.add(c)
    const deps = (porCodigo.get(c)?.depende_de ?? []).filter((d) => porCodigo.has(d))
    const n = 1 + Math.max(0, ...deps.map((d) => calcular(d, pilha)))
    pilha.delete(c)
    nivel.set(c, n)
    return n
  }
  for (const p of passos) calcular(p.passo, new Set())
  // Numeração contínua (sem coluna vazia) e ordem sugerida dentro da coluna
  const niveis = [...new Set(nivel.values())].sort((a, b) => a - b)
  return niveis.map((n, i) => ({
    nivel: i + 1,
    passos: passos.filter((p) => nivel.get(p.passo) === n),
  }))
}

// ---------------------------------------------------------------------------
// Ações de cada etapa
// ---------------------------------------------------------------------------

export interface AcaoConcluir {
  tipo: "REGISTRO" | "REVISAO"
  rotulo: string
  /** Pergunta do diálogo (o texto vai para o histórico). */
  pedido: string
}

export interface AcoesDoPasso {
  /** Etapa de peça: o "Abrir" leva à tela da etapa (quando ela tem tela). */
  abrir: boolean
  /** Avançar: despacho da etapa de registro ou confirmação da revisão. */
  concluir: AcaoConcluir | null
  /** Voltar (reabrir) — só quem conduz, só etapa concluída ou a revisar. */
  voltar: boolean
  /** Etapas de que depende e que ainda não terminaram (títulos). Vazio = pode iniciar. */
  aguardando: string[]
  /** Pode iniciar (todas as dependências cumpridas)? */
  podeIniciar: boolean
}

/**
 * Botões de uma etapa. `interna`: o processo ainda está na fase interna (fora
 * dela nada muda). A permissão fina (responsável pela etapa) é do servidor:
 * o "Concluir" aparece para quem está na fase interna e o 403 explica.
 */
export function acoesDoPasso(p: PassoFluxo, ctx: { interna: boolean; permissoes?: PermissoesFluxo | null; passos?: PassoFluxo[] }): AcoesDoPasso {
  const titulos = new Map((ctx.passos ?? []).map((x) => [x.passo, x.titulo]))
  const podeIniciar = p.pode_iniciar ?? p.pendencias.length === 0
  const aguardando = podeIniciar || !["AGUARDANDO", "DISPONIVEL"].includes(p.situacao) ? [] : p.pendencias.map((d) => titulos.get(d) ?? d)
  const vivo = ctx.interna && p.situacao !== "CANCELADO" && p.situacao !== "NAO_REALIZADO"
  let concluir: AcaoConcluir | null = null
  if (vivo) {
    if (p.reaberta && p.situacao !== "CONCLUIDO") {
      concluir =
        p.conclusao === "REGISTRO"
          ? { tipo: "REGISTRO", rotulo: "Registrar o despacho", pedido: "Despacho desta etapa (vai para o histórico do processo)" }
          : { tipo: "REVISAO", rotulo: "Concluir a revisão", pedido: "O que foi revisto (vai para o histórico do processo)" }
    } else if (p.situacao === "A_REVISAR") {
      concluir = { tipo: "REVISAO", rotulo: "Confirmar a revisão", pedido: "O que foi conferido — a etapa continua valendo (vai para o histórico)" }
    } else if (p.conclusao === "REGISTRO" && p.situacao === "DISPONIVEL" && podeIniciar) {
      concluir = { tipo: "REGISTRO", rotulo: "Registrar o despacho", pedido: "Despacho desta etapa (vai para o histórico do processo)" }
    }
  }
  const voltar = vivo && (p.pode_reabrir ?? !!ctx.permissoes?.reabrir) && (p.situacao === "CONCLUIDO" || p.situacao === "A_REVISAR") && p.conclusao !== "DIVULGACAO"
  return {
    abrir: p.conclusao !== "REGISTRO",
    concluir,
    voltar,
    aguardando,
    podeIniciar,
  }
}

/**
 * Quem fica "a revisar" se esta etapa voltar: as que dependem dela (direta ou
 * indiretamente) e já estão concluídas ou a revisar. Mostrado na confirmação.
 */
export function dependentesAfetados(codigo: string, passos: PassoFluxo[]): PassoFluxo[] {
  const saida: PassoFluxo[] = []
  const vistos = new Set<string>([codigo])
  const fila = [codigo]
  while (fila.length) {
    const atual = fila.shift()!
    for (const p of passos) {
      if (vistos.has(p.passo) || !(p.depende_de ?? []).includes(atual)) continue
      vistos.add(p.passo)
      fila.push(p.passo)
      if (p.situacao === "CONCLUIDO" || p.situacao === "A_REVISAR") saida.push(p)
    }
  }
  return saida
}

// ---------------------------------------------------------------------------
// "Anexar feito fora" no topo: peças pendentes das etapas que podem andar agora
// ---------------------------------------------------------------------------

export interface PecaParaAnexar {
  tipo: string
  titulo: string
  etapa: string
  jaTem: boolean
}

export function pecasParaAnexar(r: Pick<EtapasFluxoResposta, "etapas"> | null | undefined): PecaParaAnexar[] {
  const saida: PecaParaAnexar[] = []
  const vistos = new Set<string>()
  for (const p of todosOsPassos(r)) {
    if (p.conclusao === "REGISTRO" || p.conclusao === "DIVULGACAO") continue
    if (!["DISPONIVEL", "EM_ANDAMENTO", "A_REVISAR"].includes(p.situacao)) continue
    if ((p.pode_iniciar ?? p.pendencias.length === 0) === false) continue
    const reaberta = !!p.reaberta || p.situacao === "A_REVISAR"
    for (const x of p.pecas) {
      if ((x.pronta && !reaberta) || vistos.has(x.tipo)) continue
      vistos.add(x.tipo)
      saida.push({ tipo: x.tipo, titulo: x.titulo, etapa: p.titulo, jaTem: x.pronta || x.status !== "PENDENTE" })
    }
  }
  return saida
}

// ---------------------------------------------------------------------------
// Tramitação: "Está com…" e envio
// ---------------------------------------------------------------------------

export interface ComQuemEsta {
  tramitacao_id: string | null
  status: "PENDENTE" | "RECEBIDA" | "DEVOLVIDA" | "CONCLUIDA" | "SEM_TRAMITACAO"
  setor: { id: string; nome: string | null } | null
  usuario: { id: string; nome: string | null } | null
  desde: string | null
  recebido_em: string | null
  recebido_por: string | null
  prazo: string | null
  prazo_dias_uteis: number | null
  dias_uteis_restantes: number | null
  vencido: boolean
  de: { setor_nome: string | null; usuario_nome: string | null } | null
  despacho: string | null
  automatico: boolean
  lancado_posteriormente: boolean
  folha: { folha_inicial: number | null; folha_final: number | null; url: string } | null
  /** Opcional (se o servidor passar a informar): o que quem consulta pode fazer. */
  permissoes?: { receber?: boolean; devolver?: boolean; enviar?: boolean } | null
}

/** "faltam 2 dias úteis" · "vence hoje" · "atrasado 3 dias úteis" (null = sem prazo). */
export function situacaoDoPrazo(c: Pick<ComQuemEsta, "prazo" | "dias_uteis_restantes" | "vencido">): { texto: string; atrasado: boolean } | null {
  if (!c.prazo) return null
  const n = c.dias_uteis_restantes
  const du = (k: number) => (k === 1 ? "1 dia útil" : `${k} dias úteis`)
  if (c.vencido || (n !== null && n < 0)) return { texto: n !== null && n < 0 ? `atrasado ${du(-n)}` : "atrasado", atrasado: true }
  if (n === null) return null
  if (n === 0) return { texto: "vence hoje", atrasado: false }
  return { texto: n === 1 ? "falta 1 dia útil" : `faltam ${du(n)}`, atrasado: false }
}

/** "Contabilidade (Maria)" · "Maria" · "Contabilidade". */
export function rotuloDoDestino(c: Pick<ComQuemEsta, "setor" | "usuario">): string {
  const s = c.setor?.nome ?? null
  const u = c.usuario?.nome ?? null
  if (s && u) return `${s} (${u})`
  return s || u || "destino não identificado"
}

/** Botões do topo. Sem `permissoes` do servidor: pela situação (o servidor confere e explica o 403). */
export function acoesDoTopo(c: ComQuemEsta | null): { receber: boolean; devolver: boolean; enviar: boolean } {
  if (!c) return { receber: false, devolver: false, enviar: true }
  const vigente = c.status === "PENDENTE" || c.status === "RECEBIDA"
  const temOrigem = !!(c.de?.setor_nome || c.de?.usuario_nome)
  const base = { receber: c.status === "PENDENTE", devolver: vigente && temOrigem, enviar: true }
  const p = c.permissoes
  if (!p) return base
  return {
    receber: base.receber && p.receber !== false,
    devolver: base.devolver && p.devolver !== false,
    enviar: p.enviar !== false,
  }
}

/** GET /api/fase-interna/:id/tramitacao/sugestao-envio (F3a). */
export interface SugestaoEnvio {
  destinos: Array<{
    setor_id: string | null
    usuario_id: string | null
    rotulo: string
    /** Pares [código, nome] das etapas que o destino faz. */
    etapas: Array<[string, string]>
    principal: boolean
    /** Destino antecipado: vale depois de concluir estas etapas de quem está com o processo. */
    depois_de?: Array<[string, string]> | null
  }>
  despacho_sugerido: string
  finalidade: string | null
  pode_enviar: boolean
  motivo_bloqueio?: string
  /** Etapas que ainda estão com quem tem o processo. */
  pendentes_do_detentor?: Array<[string, string]>
  /** Etapas disponíveis sem setor/pessoa definidos no modelo (envio manual). */
  etapas_sem_destino?: Array<[string, string]>
}

export interface OpcaoDestino {
  chave: string
  setor_id: string | null
  usuario_id: string | null
  rotulo: string
  etapas: Array<[string, string]>
  principal: boolean
  origem: "SUGESTAO" | "SETOR"
  depois_de?: Array<[string, string]> | null
}

/**
 * Opções de destino do "Enviar para": as da sugestão (principal primeiro) e,
 * depois, os setores do órgão que não estão na sugestão. Sem sugestão (404 —
 * servidor sem a F3a): só os setores (modo manual).
 */
export function opcoesDeDestino(sugestao: SugestaoEnvio | null, setores: Array<{ id: string; nome: string; codigo?: string | null }>): { opcoes: OpcaoDestino[]; inicial: string | null; manual: boolean } {
  const opcoes: OpcaoDestino[] = []
  const destinos = [...(sugestao?.destinos ?? [])].sort((a, b) => Number(b.principal) - Number(a.principal))
  for (const d of destinos) {
    if (!d.setor_id && !d.usuario_id) continue
    opcoes.push({
      chave: `s:${d.setor_id ?? ""}|u:${d.usuario_id ?? ""}`,
      setor_id: d.setor_id,
      usuario_id: d.usuario_id,
      rotulo: d.rotulo,
      etapas: d.etapas ?? [],
      principal: !!d.principal,
      origem: "SUGESTAO",
      depois_de: d.depois_de ?? null,
    })
  }
  for (const s of setores) {
    if (opcoes.some((o) => o.setor_id === s.id && !o.usuario_id)) continue
    opcoes.push({
      chave: `s:${s.id}|u:`,
      setor_id: s.id,
      usuario_id: null,
      rotulo: s.codigo ? `${s.codigo} — ${s.nome}` : s.nome,
      etapas: [],
      principal: false,
      origem: "SETOR",
    })
  }
  const principal = opcoes.find((o) => o.principal) ?? null
  return { opcoes, inicial: principal?.chave ?? null, manual: !sugestao }
}

/** Despacho proposto para o destino escolhido (o da sugestão vale para o principal). */
export function despachoParaDestino(o: OpcaoDestino | null, sugestao: SugestaoEnvio | null): string {
  if (!o) return ""
  if (o.principal && sugestao?.despacho_sugerido) return sugestao.despacho_sugerido
  if (o.origem === "SETOR" && !sugestao) return ""
  const nomes = o.etapas.map(([, nome]) => nome.charAt(0).toLowerCase() + nome.slice(1))
  const para = nomes.length ? ` para ${nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0]}` : ""
  return `Encaminhe-se ao(à) ${o.rotulo}${para}.`
}

/** Prazo sugerido (dias úteis) = o maior prazo das etapas que o destino faz. */
export function prazoParaDestino(o: OpcaoDestino | null, passos: PassoFluxo[]): number | null {
  if (!o?.etapas.length) return null
  const prazos = o.etapas.map(([c]) => passos.find((p) => p.passo === c)?.prazo_dias_uteis ?? 0).filter((n) => n > 0)
  return prazos.length ? Math.max(...prazos) : null
}

/** "fl. 5" · "fls. 5–6" (null = sem folha). */
export function rotuloDaFolha(f: { folha_inicial: number | null; folha_final: number | null } | null | undefined): string | null {
  if (!f?.folha_inicial) return null
  return f.folha_final && f.folha_final > f.folha_inicial ? `fls. ${f.folha_inicial}–${f.folha_final}` : `fl. ${f.folha_inicial}`
}
