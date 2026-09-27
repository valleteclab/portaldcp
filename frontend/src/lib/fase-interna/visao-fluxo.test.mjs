// Testes das regras de exibição da visão da fase interna (F3b).
// Rodar: npm run test:unit   (node --experimental-strip-types --test)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  acoesDoPasso,
  acoesDoTopo,
  colunasDoDesenho,
  dependentesAfetados,
  despachoParaDestino,
  opcoesDeDestino,
  pecasParaAnexar,
  prazoParaDestino,
  rotuloDaFolha,
  rotuloDoDestino,
  situacaoDoPrazo,
  textoDaSituacao,
} from "./visao-fluxo.ts"
import { textoDaTrava } from "./travas.ts"

const passo = (codigo, extra = {}) => ({
  passo: codigo,
  titulo: extra.titulo ?? codigo,
  situacao: "AGUARDANDO",
  pecas: [],
  depende_de: [],
  pendencias: [],
  pode_iniciar: true,
  peca_pendente: null,
  tarefa: null,
  prazo_dias_uteis: null,
  conclusao: "PECAS",
  ...extra,
})

const resposta = (passos, desenho) => ({ etapas: [{ etapa: "G", numero: 1, titulo: "G", situacao: "EM_ANDAMENTO", nao_se_aplica: false, passos }], desenho })

test("desenho: usa os níveis do servidor e põe as paralelas na mesma coluna", () => {
  const r = resposta(
    [passo("DFD"), passo("ETP", { depende_de: ["DFD"] }), passo("TR", { depende_de: ["DFD"] }), passo("PESQUISA", { depende_de: ["TR"] })],
    [
      { nivel: 1, etapas: ["DFD"] },
      { nivel: 2, etapas: ["ETP", "TR"] },
      { nivel: 3, etapas: ["PESQUISA"] },
    ],
  )
  const c = colunasDoDesenho(r)
  assert.deepEqual(c.map((x) => x.passos.map((p) => p.passo)), [["DFD"], ["ETP", "TR"], ["PESQUISA"]])
})

test("desenho: sem `desenho` (servidor antigo) calcula pelo depende_de, sem coluna vazia", () => {
  const r = resposta([passo("DFD"), passo("RESERVA"), passo("AUTORIZACAO", { depende_de: ["DFD", "RESERVA"] }), passo("X", { depende_de: ["AUTORIZACAO"] })])
  const c = colunasDoDesenho(r)
  assert.deepEqual(c.map((x) => x.nivel), [1, 2, 3])
  assert.deepEqual(c[0].passos.map((p) => p.passo), ["DFD", "RESERVA"])
})

test("desenho: passo fora do desenho entra no nível calculado; ciclo não trava", () => {
  const r = resposta([passo("A"), passo("B", { depende_de: ["A"] }), passo("C", { depende_de: ["C"] })], [{ nivel: 1, etapas: ["A"] }])
  const c = colunasDoDesenho(r)
  assert.equal(c.flatMap((x) => x.passos).length, 3)
  assert.ok(c.find((x) => x.passos.some((p) => p.passo === "B")).nivel > 1)
})

test("etapa que depende de outra não iniciada: mostra 'Aguardando' e não tem ação de início", () => {
  const ps = [passo("DFD", { titulo: "Demanda", situacao: "EM_ANDAMENTO" }), passo("ETP", { situacao: "AGUARDANDO", depende_de: ["DFD"], pendencias: ["DFD"], pode_iniciar: false })]
  const a = acoesDoPasso(ps[1], { interna: true, permissoes: { conduzir: true, reabrir: true }, passos: ps })
  assert.deepEqual(a.aguardando, ["Demanda"])
  assert.equal(a.podeIniciar, false)
  assert.equal(a.concluir, null)
  assert.equal(a.voltar, false)
})

test("independentes ficam disponíveis ao mesmo tempo", () => {
  const ps = [passo("DFD", { situacao: "DISPONIVEL" }), passo("RESERVA", { situacao: "DISPONIVEL" })]
  for (const p of ps) assert.deepEqual(acoesDoPasso(p, { interna: true, passos: ps }).aguardando, [])
})

test("etapa de registro disponível: 'Registrar o despacho'; aguardando: nada", () => {
  const disp = passo("AUTORIZACAO_INICIO", { conclusao: "REGISTRO", situacao: "DISPONIVEL" })
  assert.equal(acoesDoPasso(disp, { interna: true }).concluir?.tipo, "REGISTRO")
  assert.equal(acoesDoPasso(disp, { interna: true }).abrir, false)
  const agu = passo("AUTORIZACAO_INICIO", { conclusao: "REGISTRO", situacao: "AGUARDANDO", pendencias: ["DFD"], pode_iniciar: false })
  assert.equal(acoesDoPasso(agu, { interna: true }).concluir, null)
  assert.equal(acoesDoPasso(disp, { interna: false }).concluir, null, "fora da fase interna nada muda")
})

test("a revisar: 'Confirmar a revisão' e 'Voltar' só para quem conduz", () => {
  const p = passo("TR", { situacao: "A_REVISAR" })
  assert.equal(acoesDoPasso(p, { interna: true, permissoes: { conduzir: true, reabrir: true } }).concluir?.tipo, "REVISAO")
  assert.equal(acoesDoPasso(p, { interna: true, permissoes: { conduzir: true, reabrir: true } }).voltar, true)
  assert.equal(acoesDoPasso(p, { interna: true, permissoes: { conduzir: false, reabrir: false } }).voltar, false)
})

test("voltar: só concluída/a revisar e nunca a publicação", () => {
  const perm = { interna: true, permissoes: { conduzir: true, reabrir: true } }
  assert.equal(acoesDoPasso(passo("ETP", { situacao: "CONCLUIDO" }), perm).voltar, true)
  assert.equal(acoesDoPasso(passo("ETP", { situacao: "EM_ANDAMENTO" }), perm).voltar, false)
  assert.equal(acoesDoPasso(passo("PUBLICACAO", { situacao: "CONCLUIDO", conclusao: "DIVULGACAO" }), perm).voltar, false)
})

test("reaberta: situação diz 'Reaberta' e a ação é concluir a revisão", () => {
  const p = passo("ETP", { situacao: "EM_ANDAMENTO", reaberta: { motivo: "ajustar" } })
  assert.match(textoDaSituacao(p), /Reaberta/)
  assert.equal(acoesDoPasso(p, { interna: true }).concluir?.rotulo, "Concluir a revisão")
  assert.match(textoDaSituacao(passo("DFD", { situacao: "EM_ANDAMENTO", aguardando_aprovacao: true })), /aprovação da demanda/)
})

test("dependentes afetados pelo voltar: transitivos, só os concluídos ou a revisar", () => {
  const ps = [
    passo("DFD", { situacao: "CONCLUIDO" }),
    passo("ETP", { situacao: "CONCLUIDO", depende_de: ["DFD"] }),
    passo("TR", { situacao: "EM_ANDAMENTO", depende_de: ["DFD"] }),
    passo("PESQUISA", { situacao: "A_REVISAR", depende_de: ["TR"] }),
    passo("RESERVA", { situacao: "CONCLUIDO" }),
  ]
  assert.deepEqual(dependentesAfetados("DFD", ps).map((p) => p.passo).sort(), ["ETP", "PESQUISA"])
})

test("anexar feito fora: peças pendentes das etapas que podem andar agora", () => {
  const r = resposta([
    passo("DFD", { situacao: "CONCLUIDO", pecas: [{ tipo: "DFD", titulo: "DFD", status: "OK", pronta: true }] }),
    passo("ETP", { situacao: "DISPONIVEL", pecas: [{ tipo: "ETP", titulo: "Estudo", status: "PENDENTE", pronta: false }] }),
    passo("TR", { situacao: "AGUARDANDO", pode_iniciar: false, pendencias: ["ETP"], pecas: [{ tipo: "TR", titulo: "TR", status: "PENDENTE", pronta: false }] }),
    passo("AUTORIZACAO_INICIO", { situacao: "DISPONIVEL", conclusao: "REGISTRO" }),
  ])
  assert.deepEqual(pecasParaAnexar(r).map((x) => x.tipo), ["ETP"])
})

test("prazo do topo: faltam / vence hoje / atrasado", () => {
  assert.deepEqual(situacaoDoPrazo({ prazo: "2026-09-30", dias_uteis_restantes: 2, vencido: false }), { texto: "faltam 2 dias úteis", atrasado: false })
  assert.deepEqual(situacaoDoPrazo({ prazo: "2026-09-30", dias_uteis_restantes: 1, vencido: false }), { texto: "falta 1 dia útil", atrasado: false })
  assert.deepEqual(situacaoDoPrazo({ prazo: "2026-09-30", dias_uteis_restantes: 0, vencido: false }), { texto: "vence hoje", atrasado: false })
  assert.deepEqual(situacaoDoPrazo({ prazo: "2026-09-30", dias_uteis_restantes: -3, vencido: true }), { texto: "atrasado 3 dias úteis", atrasado: true })
  assert.equal(situacaoDoPrazo({ prazo: null, dias_uteis_restantes: null, vencido: false }), null)
})

test("com quem está: rótulo e botões pela situação (e pelas permissões, se vierem)", () => {
  assert.equal(rotuloDoDestino({ setor: { id: "1", nome: "Contabilidade" }, usuario: { id: "2", nome: "Maria" } }), "Contabilidade (Maria)")
  const base = { status: "PENDENTE", de: { setor_nome: "Compras", usuario_nome: null } }
  assert.deepEqual(acoesDoTopo(base), { receber: true, devolver: true, enviar: true })
  assert.deepEqual(acoesDoTopo({ ...base, status: "RECEBIDA" }), { receber: false, devolver: true, enviar: true })
  assert.deepEqual(acoesDoTopo({ status: "SEM_TRAMITACAO", de: null }), { receber: false, devolver: false, enviar: true })
  assert.deepEqual(acoesDoTopo({ ...base, permissoes: { receber: false, devolver: false, enviar: false } }), { receber: false, devolver: false, enviar: false })
})

test("enviar: principal pré-selecionado, despacho sugerido e prazo das etapas do destino", () => {
  const sugestao = {
    destinos: [
      { setor_id: "s2", usuario_id: null, rotulo: "Jurídico", etapas: [["PARECER", "Parecer jurídico"]], principal: false },
      { setor_id: "s1", usuario_id: null, rotulo: "Contabilidade", etapas: [["RESERVA", "Reserva orçamentária"]], principal: true },
    ],
    despacho_sugerido: "Encaminhe-se à Contabilidade para a reserva orçamentária.",
    finalidade: "a reserva orçamentária",
    pode_enviar: true,
  }
  const { opcoes, inicial, manual } = opcoesDeDestino(sugestao, [{ id: "s1", nome: "Contabilidade" }, { id: "s3", nome: "Compras" }])
  assert.equal(manual, false)
  assert.equal(opcoes[0].rotulo, "Contabilidade")
  assert.equal(inicial, opcoes[0].chave)
  assert.deepEqual(opcoes.map((o) => o.setor_id), ["s1", "s2", "s3"], "setor da sugestão não repete na lista manual")
  assert.equal(despachoParaDestino(opcoes[0], sugestao), sugestao.despacho_sugerido)
  assert.equal(despachoParaDestino(opcoes[1], sugestao), "Encaminhe-se ao(à) Jurídico para parecer jurídico.")
  assert.equal(prazoParaDestino(opcoes[0], [passo("RESERVA", { prazo_dias_uteis: 3 })]), 3)
})

test("enviar sem a sugestão (404): modo manual, lista de setores e despacho em branco", () => {
  const { opcoes, inicial, manual } = opcoesDeDestino(null, [{ id: "s1", nome: "Compras", codigo: "CPL" }])
  assert.equal(manual, true)
  assert.equal(inicial, null)
  assert.equal(opcoes[0].rotulo, "CPL — Compras")
  assert.equal(despachoParaDestino(opcoes[0], null), "")
})

test("folha do despacho", () => {
  assert.equal(rotuloDaFolha({ folha_inicial: 5, folha_final: 5 }), "fl. 5")
  assert.equal(rotuloDaFolha({ folha_inicial: 5, folha_final: 6 }), "fls. 5–6")
  assert.equal(rotuloDaFolha(null), null)
})

test("trava da lei: troca o 'Portão A/B/C' das mensagens do servidor", () => {
  assert.equal(
    textoDaTrava("Portão A (limite e fracionamento) — LIM-01: passou o limite"),
    "Trava da lei — concluir a pesquisa (limite da dispensa, art. 75, §1º) — LIM-01: passou o limite",
  )
  assert.equal(textoDaTrava("Portão B (art. 72) — A72-II: falta a pesquisa"), "Trava da lei — autorizar (art. 72) — A72-II: falta a pesquisa")
  assert.equal(textoDaTrava("Portão C (conformidade) — ASS-01: x"), "Trava da lei — publicar — ASS-01: x")
  assert.equal(textoDaTrava("Pendências do portão B (art. 72): a | b"), "Pendências da trava da lei — autorizar (art. 72): a | b")
  assert.equal(textoDaTrava("o portão B é conferido antes"), "a trava da lei — autorizar (art. 72) é conferido antes")
  assert.equal(textoDaTrava("não autoriza (portão B): faça"), "não autoriza (trava da lei — autorizar (art. 72)): faça")
  assert.equal(textoDaTrava("sem trava"), "sem trava")
  assert.equal(textoDaTrava(null), "")
})
