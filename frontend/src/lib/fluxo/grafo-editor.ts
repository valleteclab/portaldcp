/**
 * CONSTRUTOR DE FLUXO — regras PURAS do editor de arrastar e soltar (sem
 * React e sem imports: testadas com `node --test`, ver grafo-editor.test.mjs).
 *
 * O desenho (grafo) é o mesmo da API do motor (PR #538,
 * docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md): caixas (início, etapa,
 * aprovação, condição, fim) e setas (normal, sim, não, devolve). Aqui ficam só
 * a geometria do desenho, as operações de edição (criar, ligar, apagar,
 * mover) e os rótulos. Quem confere a estrutura e a lei, normaliza e simula é
 * o servidor.
 */

// ---------------------------------------------------------------------------
// Tipos (espelham backend/src/fase-interna/fluxo/grafo-fluxo.ts)
// ---------------------------------------------------------------------------

export type TipoNo = "inicio" | "etapa" | "aprovacao" | "condicao" | "fim"
export type RotuloAresta = "normal" | "sim" | "nao" | "devolve"
export type CampoCondicao = "manual" | "valor_total_estimado" | "tipo_contratacao" | "modalidade" | "fundamento_legal"

export interface ResponsavelNo {
  papel: string | null
  setor_id: string | null
  usuario_id: string | null
}

export interface CondicaoNo {
  campo: CampoCondicao
  operador?: string | null
  valor?: number | string | null
  valor_ate?: number | null
  valores?: string[] | null
}

export interface NoFluxo {
  id: string
  tipo: TipoNo
  nome: string
  x: number
  y: number
  codigo?: string
  pecas?: string[]
  responsavel?: ResponsavelNo
  prazo_dias_uteis?: number | null
  ia_rascunho?: boolean
  aprovacao_interna?: boolean
  dispensavel_por_ato?: boolean
  obrigatoria?: boolean
  ligada?: boolean
  condicao?: CondicaoNo | null
  // Campos do catálogo que a normalização do servidor preenche (tela, fundamento…)
  [extra: string]: unknown
}

export interface ArestaFluxo {
  id: string
  de: string
  para: string
  rotulo: RotuloAresta
}

export interface GrafoFluxo {
  formato?: 1
  nos: NoFluxo[]
  arestas: ArestaFluxo[]
}

/** Etapa que o sistema sabe fazer (GET construtor/:tipo → catalogo.etapas). */
export interface EtapaDoCatalogo {
  codigo: string
  titulo: string
  grupo_titulo?: string
  pecas: string[]
  conclusao?: string
  fundamento?: string | null
  papel_padrao?: string | null
  prazo_padrao?: number | null
  tipo_no_sugerido?: "etapa" | "aprovacao"
}

export interface ErroConferencia {
  codigo: string
  etapa: string | null
  fundamento: string | null
  mensagem: string
}

export interface ItemLei {
  codigo: string
  ok: boolean
  texto: string
  fundamento: string
}

export interface Conferencia {
  ok: boolean
  erros: ErroConferencia[]
  avisos: ErroConferencia[]
  lei: ItemLei[]
  ajustes?: Array<{ no: string | null; mensagem: string }>
}

export type Selecao = { no: string } | { aresta: string } | null

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

export const LARGURA_NO = 200
export const ALTURA_NO = 80
export const PASSO_GRADE = 10

/** Encaixa na grade (nunca negativo). */
export const naGrade = (v: number): number => Math.max(0, Math.round(v / PASSO_GRADE) * PASSO_GRADE)

/**
 * Caminho da seta entre duas caixas (da borda direita de uma à esquerda da
 * outra). Para trás (ex.: "devolve"), a seta faz a curva por baixo. `mx`/`my`:
 * onde vai o rótulo.
 */
export function caminhoDaAresta(de: { x: number; y: number }, para: { x: number; y: number }): { d: string; mx: number; my: number } {
  const sx = de.x + LARGURA_NO
  const sy = de.y + ALTURA_NO / 2
  const tx = para.x
  const ty = para.y + ALTURA_NO / 2
  if (tx >= sx - 10) {
    const dx = Math.max(40, (tx - sx) / 2)
    return { d: `M${sx} ${sy} C${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx - 2} ${ty}`, mx: (sx + tx) / 2, my: (sy + ty) / 2 - 8 }
  }
  const baixo = Math.max(sy, ty) + 110
  return { d: `M${sx} ${sy} C${sx + 90} ${baixo}, ${tx - 90} ${baixo}, ${tx - 2} ${ty}`, mx: (sx + tx) / 2, my: baixo - 20 }
}

/** Tamanho da área de desenho: cabe tudo, com folga para arrastar mais caixas. */
export function tamanhoDoDesenho(nos: Array<{ x: number; y: number }>): { largura: number; altura: number } {
  const maxX = Math.max(0, ...nos.map((n) => n.x))
  const maxY = Math.max(0, ...nos.map((n) => n.y))
  return { largura: Math.max(1400, maxX + LARGURA_NO + 320), altura: Math.max(760, maxY + ALTURA_NO + 260) }
}

const sobrepoe = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < LARGURA_NO + 20 && Math.abs(a.y - b.y) < ALTURA_NO + 20

/**
 * Lugar livre para uma caixa nova (clique na paleta): dentro da parte visível
 * do desenho, sem cobrir outra caixa. Sem lugar livre, logo abaixo de tudo.
 */
export function sugerirPosicao(nos: Array<{ x: number; y: number }>, visivel: { x: number; y: number; largura: number; altura: number }): { x: number; y: number } {
  const x0 = naGrade(visivel.x + 40)
  const y0 = naGrade(visivel.y + 40)
  const colunas = Math.max(1, Math.floor((visivel.largura - 40) / (LARGURA_NO + 40)))
  const linhas = Math.max(1, Math.floor((visivel.altura - 40) / (ALTURA_NO + 40)))
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      const p = { x: x0 + c * (LARGURA_NO + 40), y: y0 + l * (ALTURA_NO + 40) }
      if (!nos.some((n) => sobrepoe(n, p))) return p
    }
  }
  const maxY = Math.max(0, ...nos.map((n) => n.y))
  return { x: x0, y: naGrade(maxY + ALTURA_NO + 40) }
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

export const ROTULO_TIPO_NO: Record<TipoNo, string> = {
  inicio: "Início",
  etapa: "Etapa",
  aprovacao: "Aprovação",
  condicao: "Condição",
  fim: "Fim",
}

export const NOME_PADRAO: Record<TipoNo, string> = {
  inicio: "Início",
  etapa: "Nova etapa",
  aprovacao: "Nova aprovação",
  condicao: "Nova pergunta?",
  fim: "Fim",
}

/** Texto da seta no desenho ("" para a normal). */
export const rotuloDaAresta = (r: RotuloAresta): string => (r === "nao" ? "não" : r === "normal" ? "" : r)

export const ROTULO_OPCAO_ARESTA: Record<RotuloAresta, string> = {
  normal: "segue (normal)",
  sim: "sim",
  nao: "não",
  devolve: "devolve (volta para corrigir)",
}

/** Tipos de seta que fazem sentido saindo de uma caixa deste tipo. */
export function rotulosPermitidos(tipoOrigem: TipoNo | undefined): RotuloAresta[] {
  if (tipoOrigem === "condicao") return ["sim", "nao"]
  if (tipoOrigem === "aprovacao") return ["normal", "devolve"]
  return ["normal"]
}

export const ROTULO_TIPO_CONTRATACAO: Record<string, string> = {
  COMPRA: "Compra",
  SERVICO: "Serviço",
  OBRA: "Obra",
  SERVICO_ENGENHARIA: "Serviço de engenharia",
  LOCACAO: "Locação",
  ALIENACAO: "Alienação",
}

export const ROTULO_OPERADOR: Record<string, string> = {
  ">": "acima de",
  ">=": "a partir de",
  "<": "abaixo de",
  "<=": "até",
  entre: "entre",
  igual: "igual a",
  diferente: "diferente de",
  em: "é um destes",
  contem: "contém",
}

export const moeda = (n: number): string => `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "Valor estimado acima de R$ 50.000,00" — subtítulo da caixa e painel. */
export function descreverCondicao(c: CondicaoNo | null | undefined): string {
  if (!c || c.campo === "manual") return "quem conduz responde sim ou não"
  const op = ROTULO_OPERADOR[String(c.operador ?? "")] ?? String(c.operador ?? "")
  if (c.campo === "valor_total_estimado") {
    const v = Number(c.valor)
    if (!Number.isFinite(v)) return "valor estimado (informe o valor)"
    if (c.operador === "entre") return `valor estimado entre ${moeda(v)} e ${moeda(Number(c.valor_ate))}`
    return `valor estimado ${ROTULO_OPERADOR[String(c.operador ?? ">")] ?? "acima de"} ${moeda(v)}`
  }
  const rot = { tipo_contratacao: "tipo de contratação", modalidade: "modalidade", fundamento_legal: "fundamento legal" }[c.campo]
  const nome = (x: unknown) => (c.campo === "tipo_contratacao" ? ROTULO_TIPO_CONTRATACAO[String(x)] ?? String(x ?? "") : String(x ?? ""))
  if (c.operador === "em") return `${rot} é um destes: ${(c.valores ?? []).map(nome).join(", ") || "(escolha)"}`
  return `${rot} ${op || "igual a"} ${nome(c.valor) || "(informe)"}`
}

/** "50.000,00", "50000", "R$ 50.000" → 50000 (null quando não é número). */
export function lerValorEmReais(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null
  let t = String(texto).replace(/[R$\s]/g, "")
  if (!t) return null
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".")
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "")
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Responsável (quem faz / quem aprova): uma escolha só na tela
// ---------------------------------------------------------------------------

export interface ListasDoOrgao {
  papeis: Array<{ codigo: string; rotulo: string }>
  setores: Array<{ id: string; nome: string }>
  usuarios: Array<{ id: string; nome: string }>
}

/**
 * Valor do seletor "Quem faz": `papel:X`, `setor:ID`, `usuario:ID`; "" sem
 * responsável; `combinado` quando o modelo antigo guardou papel E setor (a
 * tela mantém como está até a pessoa escolher outro).
 */
export function valorDoResponsavel(r: ResponsavelNo | null | undefined): string {
  if (!r) return ""
  const n = [r.papel, r.setor_id, r.usuario_id].filter(Boolean).length
  if (n > 1) return "combinado"
  if (r.usuario_id) return `usuario:${r.usuario_id}`
  if (r.setor_id) return `setor:${r.setor_id}`
  if (r.papel) return `papel:${r.papel}`
  return ""
}

export function responsavelDoValor(v: string, atual?: ResponsavelNo | null): ResponsavelNo {
  if (v === "combinado" && atual) return { ...atual }
  const [tipo, ...resto] = v.split(":")
  const valor = resto.join(":") || null
  return {
    papel: tipo === "papel" ? valor : null,
    setor_id: tipo === "setor" ? valor : null,
    usuario_id: tipo === "usuario" ? valor : null,
  }
}

/** "Contabilidade" · "Maria" · "Agente de contratação" · "Agente de contratação no setor Compras". */
export function rotuloDoResponsavel(r: ResponsavelNo | null | undefined, l: ListasDoOrgao): string | null {
  if (!r) return null
  const pessoa = r.usuario_id ? l.usuarios.find((u) => u.id === r.usuario_id)?.nome ?? "pessoa designada" : null
  const setor = r.setor_id ? l.setores.find((s) => s.id === r.setor_id)?.nome ?? "setor designado" : null
  const papel = r.papel ? l.papeis.find((p) => p.codigo === r.papel)?.rotulo ?? r.papel : null
  if (pessoa) return pessoa
  if (papel && setor) return `${papel} no setor ${setor}`
  return setor || papel || null
}

// ---------------------------------------------------------------------------
// Operações de edição (devolvem um grafo novo; nunca mudam o recebido)
// ---------------------------------------------------------------------------

export function novoIdUnico(prefixo: string, usados: Iterable<string>): string {
  const s = new Set(usados)
  let i = s.size + 1
  while (s.has(`${prefixo}${i}`)) i++
  return `${prefixo}${i}`
}

/** Caixa nova do tipo, na posição (encaixada na grade). */
export function criarNo(g: GrafoFluxo, tipo: TipoNo, x: number, y: number): { grafo: GrafoFluxo; id: string } {
  const id = novoIdUnico("n", g.nos.map((n) => n.id))
  const no: NoFluxo = { id, tipo, nome: NOME_PADRAO[tipo], x: naGrade(x), y: naGrade(y) }
  if (tipo === "etapa" || tipo === "aprovacao") {
    Object.assign(no, { pecas: [], responsavel: { papel: null, setor_id: null, usuario_id: null }, prazo_dias_uteis: tipo === "aprovacao" ? 2 : 3 })
  }
  if (tipo === "condicao") no.condicao = { campo: "manual" }
  return { grafo: { ...g, nos: [...g.nos, no] }, id }
}

/** `alvo` é alcançável a partir de `de` pelas setas que seguem (não conta "devolve")? */
export function alcanca(g: GrafoFluxo, de: string, alvo: string): boolean {
  const vistos = new Set<string>()
  const pilha = [de]
  while (pilha.length) {
    const x = pilha.pop()!
    if (x === alvo) return true
    if (vistos.has(x)) continue
    vistos.add(x)
    for (const a of g.arestas) if (a.de === x && a.rotulo !== "devolve") pilha.push(a.para)
  }
  return false
}

/**
 * LIGAR duas caixas (arrastar da bolinha de uma até a outra). O tipo da seta
 * é deduzido: da condição, a primeira saída livre entre "sim" e "não"; da
 * aprovação para uma caixa que vem ANTES dela, "devolve"; senão, normal.
 */
export function ligarNos(g: GrafoFluxo, de: string, para: string): { grafo: GrafoFluxo; id: string } | { erro: string } {
  const a = g.nos.find((n) => n.id === de)
  const b = g.nos.find((n) => n.id === para)
  if (!a || !b) return { erro: "Caixa não encontrada." }
  if (de === para) return { erro: "Uma caixa não se liga a ela mesma." }
  if (b.tipo === "inicio") return { erro: "Nada entra no início." }
  if (a.tipo === "fim") return { erro: "Nada sai do fim." }
  if (g.arestas.some((x) => x.de === de && x.para === para)) return { erro: "Essas caixas já estão ligadas." }
  let rotulo: RotuloAresta = "normal"
  if (a.tipo === "condicao") {
    const usados = g.arestas.filter((x) => x.de === de).map((x) => x.rotulo)
    if (!usados.includes("sim")) rotulo = "sim"
    else if (!usados.includes("nao")) rotulo = "nao"
    else return { erro: `A pergunta "${a.nome}" já tem as saídas "sim" e "não".` }
  } else if (a.tipo === "aprovacao" && alcanca(g, para, de)) {
    rotulo = "devolve"
  }
  const id = novoIdUnico("a", g.arestas.map((x) => x.id))
  return { grafo: { ...g, arestas: [...g.arestas, { id, de, para, rotulo }] }, id }
}

/** Apaga a caixa (e as setas dela) ou a seta selecionada. O início não se apaga. */
export function apagarSelecao(g: GrafoFluxo, sel: Selecao): GrafoFluxo {
  if (!sel) return g
  if ("no" in sel) {
    const n = g.nos.find((x) => x.id === sel.no)
    if (!n || n.tipo === "inicio") return g
    return { ...g, nos: g.nos.filter((x) => x.id !== sel.no), arestas: g.arestas.filter((a) => a.de !== sel.no && a.para !== sel.no) }
  }
  return { ...g, arestas: g.arestas.filter((a) => a.id !== sel.aresta) }
}

export function moverNo(g: GrafoFluxo, id: string, x: number, y: number): GrafoFluxo {
  const nx = naGrade(x)
  const ny = naGrade(y)
  const n = g.nos.find((q) => q.id === id)
  if (!n || (n.x === nx && n.y === ny)) return g
  return { ...g, nos: g.nos.map((q) => (q.id === id ? { ...q, x: nx, y: ny } : q)) }
}

export function alterarNo(g: GrafoFluxo, id: string, mudanca: Partial<NoFluxo>): GrafoFluxo {
  return { ...g, nos: g.nos.map((n) => (n.id === id ? { ...n, ...mudanca } : n)) }
}

export function alterarAresta(g: GrafoFluxo, id: string, rotulo: RotuloAresta): GrafoFluxo {
  return { ...g, arestas: g.arestas.map((a) => (a.id === id ? { ...a, rotulo } : a)) }
}

/** Campos do catálogo que a normalização do servidor preenche — saem quando a caixa troca de etapa do sistema. */
const CAMPOS_DO_CATALOGO = ["codigo", "grupo", "grupo_titulo", "tela", "conclusao", "fase_maquina", "portao", "fundamento", "ordem", "obrigatoria", "ligada"]

/**
 * "O que esta caixa produz": uma etapa do sistema (as peças dela, a tela, as
 * travas da lei) ou nada (`null`: etapa criada pelo órgão, conclui por
 * despacho). Caixa ainda com o nome padrão ganha o nome da etapa; sem quem
 * faz, ganha o papel e o prazo padrão da etapa.
 */
export function definirEtapaDoSistema(no: NoFluxo, codigo: string | null, catalogo: EtapaDoCatalogo[]): NoFluxo {
  const limpo: NoFluxo = { ...no }
  for (const k of CAMPOS_DO_CATALOGO) delete limpo[k]
  const cat = codigo ? catalogo.find((c) => c.codigo === codigo) : null
  if (!cat) return { ...limpo, pecas: [], aprovacao_interna: false, dispensavel_por_ato: false }
  const semResponsavel = !no.responsavel || valorDoResponsavel(no.responsavel) === ""
  return {
    ...limpo,
    codigo: cat.codigo,
    pecas: [...cat.pecas],
    nome: !no.nome || Object.values(NOME_PADRAO).includes(no.nome) ? cat.titulo : no.nome,
    ...(semResponsavel && cat.papel_padrao ? { responsavel: { papel: cat.papel_padrao, setor_id: null, usuario_id: null } } : {}),
    ...(no.prazo_dias_uteis == null && cat.prazo_padrao ? { prazo_dias_uteis: cat.prazo_padrao } : {}),
  }
}

/** Etapas do sistema já usadas em OUTRA caixa (cada uma entra uma vez só no desenho). */
export function etapasUsadas(g: GrafoFluxo, excetoNo: string | null, catalogo: EtapaDoCatalogo[]): Set<string> {
  const codigos = new Set(catalogo.map((c) => c.codigo))
  return new Set(g.nos.filter((n) => n.id !== excetoNo && n.codigo && codigos.has(n.codigo)).map((n) => n.codigo!))
}

// ---------------------------------------------------------------------------
// Conferência × caixas
// ---------------------------------------------------------------------------

const slug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "NO"

/**
 * Código que o servidor dá à caixa (o mesmo da normalização): o do catálogo;
 * criada pelo órgão `U_<id>`; condição `C_<id>`. Liga o erro da conferência
 * (que cita o código) à caixa do desenho.
 */
export function codigoPrevisto(n: Pick<NoFluxo, "id" | "tipo" | "codigo">): string | null {
  if (n.tipo === "inicio" || n.tipo === "fim") return null
  if (n.codigo) return n.codigo
  return `${n.tipo === "condicao" ? "C_" : "U_"}${slug(n.id)}`
}

/** Caixas com erro na conferência (pelo código da etapa citado no erro). */
export function nosComErro(g: GrafoFluxo, erros: ErroConferencia[]): Set<string> {
  const porCodigo = new Map<string, string>()
  for (const n of g.nos) {
    const c = codigoPrevisto(n)
    if (c) porCodigo.set(c, n.id)
  }
  const s = new Set<string>()
  for (const e of erros) {
    const id = e.etapa ? porCodigo.get(e.etapa) : undefined
    if (id) s.add(id)
    else for (const n of g.nos) if (e.mensagem.includes(`"${n.nome}"`)) s.add(n.id)
  }
  return s
}

/** Id da caixa citada por um erro (para selecionar ao clicar no erro). */
export function noDoErro(g: GrafoFluxo, e: ErroConferencia): string | null {
  if (e.etapa) {
    const n = g.nos.find((x) => codigoPrevisto(x) === e.etapa)
    if (n) return n.id
  }
  return g.nos.find((n) => e.mensagem.includes(`"${n.nome}"`))?.id ?? null
}

/** Grafo como a API recebe (sem campos de tela). */
export function grafoParaEnvio(g: GrafoFluxo): GrafoFluxo {
  return { formato: 1, nos: g.nos, arestas: g.arestas.map(({ id, de, para, rotulo }) => ({ id, de, para, rotulo })) }
}

/** Desenho em branco: início ligado ao fim. */
export function grafoEmBranco(): GrafoFluxo {
  return {
    formato: 1,
    nos: [
      { id: "inicio", tipo: "inicio", nome: "Início", x: 40, y: 200 },
      { id: "fim", tipo: "fim", nome: "Fase interna concluída", x: 520, y: 200 },
    ],
    arestas: [{ id: "a1", de: "inicio", para: "fim", rotulo: "normal" }],
  }
}

/** "14:05" em Brasília. */
export const horaBrasilia = (d: Date | string): string =>
  new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

/** "28/09/2026 14:05" em Brasília. */
export const dataHoraBrasilia = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

/** O campo com foco é de texto (a tecla Delete é dele, não do desenho)? */
export function focoEmCampoDeTexto(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(String(el.tagName ?? "")) || !!el.isContentEditable
}
