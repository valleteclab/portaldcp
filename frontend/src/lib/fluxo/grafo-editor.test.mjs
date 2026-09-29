// Testes das regras puras do construtor de fluxo (editor de arrastar e soltar).
// Rodar: npm run test:unit   (node --experimental-strip-types --test)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ALTURA_NO,
  LARGURA_NO,
  alcanca,
  apagarSelecao,
  caminhoDaAresta,
  codigoPrevisto,
  criarNo,
  definirEtapaDoSistema,
  descreverCondicao,
  etapasUsadas,
  focoEmCampoDeTexto,
  grafoEmBranco,
  grafoParaEnvio,
  lerValorEmReais,
  ligarNos,
  moverNo,
  naGrade,
  noDoErro,
  nosComErro,
  responsavelDoValor,
  rotuloDaAresta,
  rotuloDoResponsavel,
  rotulosPermitidos,
  sugerirPosicao,
  tamanhoDoDesenho,
  valorDoResponsavel,
} from "./grafo-editor.ts"

const no = (id, tipo, extra = {}) => ({ id, tipo, nome: extra.nome ?? id, x: extra.x ?? 0, y: extra.y ?? 0, ...extra })
const aresta = (id, de, para, rotulo = "normal") => ({ id, de, para, rotulo })

/** Início → Pesquisa → Finanças aprova → Fim, e uma pergunta solta. */
const base = () => ({
  formato: 1,
  nos: [no("inicio", "inicio"), no("pesq", "etapa", { codigo: "PESQUISA" }), no("fin", "aprovacao", { nome: "Finanças aprova" }), no("q", "condicao"), no("fim", "fim")],
  arestas: [aresta("a1", "inicio", "pesq"), aresta("a2", "pesq", "fin"), aresta("a3", "fin", "fim")],
})

const CATALOGO = [
  { codigo: "PESQUISA", titulo: "Pesquisa de preços", pecas: ["PP", "MCP"], papel_padrao: "AGENTE_CONTRATACAO", prazo_padrao: 10 },
  { codigo: "RESERVA", titulo: "Reserva orçamentária", pecas: ["DO"], papel_padrao: "CONTABILIDADE", prazo_padrao: 3 },
]

test("grade: encaixa de 10 em 10 e nunca fica negativo", () => {
  assert.equal(naGrade(14), 10)
  assert.equal(naGrade(15), 20)
  assert.equal(naGrade(-30), 0)
})

test("seta para a frente sai da borda direita e chega na esquerda; para trás faz a curva por baixo", () => {
  const frente = caminhoDaAresta({ x: 0, y: 0 }, { x: 400, y: 0 })
  assert.ok(frente.d.startsWith(`M${LARGURA_NO} ${ALTURA_NO / 2}`))
  assert.ok(frente.d.endsWith(`398 ${ALTURA_NO / 2}`))
  const tras = caminhoDaAresta({ x: 400, y: 0 }, { x: 0, y: 0 })
  assert.ok(tras.my > ALTURA_NO, "rótulo da volta fica abaixo das caixas")
})

test("tamanho do desenho: cabe a caixa mais distante com folga; mínimo fixo", () => {
  assert.deepEqual(tamanhoDoDesenho([]), { largura: 1400, altura: 760 })
  const t = tamanhoDoDesenho([{ x: 3000, y: 1200 }])
  assert.ok(t.largura >= 3000 + LARGURA_NO)
  assert.ok(t.altura >= 1200 + ALTURA_NO)
})

test("posição sugerida: dentro da parte visível e sem cobrir outra caixa", () => {
  const nos = [{ x: 40, y: 40 }]
  const p = sugerirPosicao(nos, { x: 0, y: 0, largura: 1000, altura: 600 })
  assert.ok(Math.abs(p.x - 40) >= LARGURA_NO + 20 || Math.abs(p.y - 40) >= ALTURA_NO + 20)
  const rolado = sugerirPosicao([], { x: 800, y: 300, largura: 600, altura: 400 })
  assert.deepEqual(rolado, { x: 840, y: 340 })
})

test("criar caixa: id único, nome padrão, etapa sem quem faz e condição manual", () => {
  const g = base()
  const e = criarNo(g, "etapa", 101, 49)
  const n = e.grafo.nos.find((x) => x.id === e.id)
  assert.equal(n.nome, "Nova etapa")
  assert.deepEqual([n.x, n.y], [100, 50])
  assert.deepEqual(n.responsavel, { papel: null, setor_id: null, usuario_id: null })
  assert.equal(g.nos.length, 5, "não muda o grafo recebido")
  const c = criarNo(e.grafo, "condicao", 0, 0)
  assert.notEqual(c.id, e.id)
  assert.deepEqual(c.grafo.nos.find((x) => x.id === c.id).condicao, { campo: "manual" })
})

test("ligar: a condição ganha 'sim' e depois 'não'; a terceira saída é recusada", () => {
  let g = base()
  const r1 = ligarNos(g, "q", "fin")
  assert.equal(r1.grafo.arestas.at(-1).rotulo, "sim")
  g = r1.grafo
  const r2 = ligarNos(g, "q", "fim")
  assert.equal(r2.grafo.arestas.at(-1).rotulo, "nao")
  g = r2.grafo
  assert.match(ligarNos(g, "q", "pesq").erro, /já tem as saídas/)
})

test("ligar: da aprovação para uma caixa ANTERIOR vira 'devolve'; para a frente, normal", () => {
  const g = base()
  assert.equal(ligarNos(g, "fin", "pesq").grafo.arestas.at(-1).rotulo, "devolve")
  const g2 = criarNo(g, "etapa", 0, 0)
  assert.equal(ligarNos(g2.grafo, "fin", g2.id).grafo.arestas.at(-1).rotulo, "normal")
})

test("ligar: recusa a própria caixa, entrar no início, sair do fim e ligação repetida", () => {
  const g = base()
  assert.ok(ligarNos(g, "pesq", "pesq").erro)
  assert.match(ligarNos(g, "pesq", "inicio").erro, /início/)
  assert.match(ligarNos(g, "fim", "pesq").erro, /fim/)
  assert.match(ligarNos(g, "inicio", "pesq").erro, /já estão ligadas/)
})

test("alcança: segue as setas normais e ignora 'devolve'", () => {
  const g = { ...base(), arestas: [...base().arestas, aresta("d", "fin", "pesq", "devolve")] }
  assert.equal(alcanca(g, "inicio", "fim"), true)
  assert.equal(alcanca(g, "fin", "pesq"), false)
})

test("apagar: a caixa leva as setas dela; o início não se apaga; a seta sozinha", () => {
  const g = base()
  const semPesq = apagarSelecao(g, { no: "pesq" })
  assert.equal(semPesq.nos.some((n) => n.id === "pesq"), false)
  assert.deepEqual(semPesq.arestas.map((a) => a.id), ["a3"])
  assert.equal(apagarSelecao(g, { no: "inicio" }), g)
  assert.deepEqual(apagarSelecao(g, { aresta: "a2" }).arestas.map((a) => a.id), ["a1", "a3"])
  assert.equal(apagarSelecao(g, null), g)
})

test("mover: encaixa na grade e não cria grafo novo sem mudança", () => {
  const g = base()
  const m = moverNo(g, "pesq", 233, 118)
  assert.deepEqual([m.nos[1].x, m.nos[1].y], [230, 120])
  assert.equal(moverNo(m, "pesq", 231, 121), m)
})

test("etapa do sistema: traz as peças, o nome e quem faz; 'nada' volta a ser etapa do órgão", () => {
  const n = no("n9", "etapa", { nome: "Nova etapa", pecas: [], responsavel: { papel: null, setor_id: null, usuario_id: null }, prazo_dias_uteis: null })
  const p = definirEtapaDoSistema(n, "PESQUISA", CATALOGO)
  assert.equal(p.codigo, "PESQUISA")
  assert.deepEqual(p.pecas, ["PP", "MCP"])
  assert.equal(p.nome, "Pesquisa de preços")
  assert.equal(p.responsavel.papel, "AGENTE_CONTRATACAO")
  assert.equal(p.prazo_dias_uteis, 10)
  const nomeProprio = definirEtapaDoSistema({ ...n, nome: "Cotação", responsavel: { papel: null, setor_id: "s1", usuario_id: null } }, "PESQUISA", CATALOGO)
  assert.equal(nomeProprio.nome, "Cotação", "nome dado pelo órgão fica")
  assert.equal(nomeProprio.responsavel.setor_id, "s1", "quem faz escolhido fica")
  const volta = definirEtapaDoSistema({ ...p, tela: "pesquisa", conclusao: "PECAS", fundamento: "art. 23" }, null, CATALOGO)
  assert.equal(volta.codigo, undefined)
  assert.equal(volta.tela, undefined)
  assert.deepEqual(volta.pecas, [])
})

test("etapas já usadas em outra caixa ficam indisponíveis", () => {
  const g = base()
  assert.deepEqual([...etapasUsadas(g, null, CATALOGO)], ["PESQUISA"])
  assert.deepEqual([...etapasUsadas(g, "pesq", CATALOGO)], [])
})

test("código previsto: igual ao da normalização do servidor (U_/C_ + id)", () => {
  assert.equal(codigoPrevisto({ id: "n12", tipo: "aprovacao" }), "U_N12")
  assert.equal(codigoPrevisto({ id: "q-valor", tipo: "condicao" }), "C_Q_VALOR")
  assert.equal(codigoPrevisto({ id: "x", tipo: "etapa", codigo: "DFD" }), "DFD")
  assert.equal(codigoPrevisto({ id: "inicio", tipo: "inicio" }), null)
})

test("erros da conferência marcam a caixa (pelo código ou pelo nome citado)", () => {
  const g = base()
  const erros = [
    { codigo: "GRAFO_SEM_RESPONSAVEL", etapa: "U_FIN", fundamento: null, mensagem: "x" },
    { codigo: "GRAFO_NAO_ALCANCAVEL", etapa: null, fundamento: null, mensagem: '"q" não está ligada a nada que venha do início.' },
  ]
  assert.deepEqual([...nosComErro(g, erros)].sort(), ["fin", "q"])
  assert.equal(noDoErro(g, erros[0]), "fin")
  assert.equal(noDoErro(g, { codigo: "X", etapa: null, fundamento: null, mensagem: "nada" }), null)
})

test("rótulos: 'nao' aparece como 'não'; normal não tem rótulo; opções por tipo de caixa", () => {
  assert.equal(rotuloDaAresta("nao"), "não")
  assert.equal(rotuloDaAresta("normal"), "")
  assert.deepEqual(rotulosPermitidos("condicao"), ["sim", "nao"])
  assert.deepEqual(rotulosPermitidos("aprovacao"), ["normal", "devolve"])
  assert.deepEqual(rotulosPermitidos("etapa"), ["normal"])
})

test("condição descrita em português, com valor em reais", () => {
  assert.equal(descreverCondicao({ campo: "valor_total_estimado", operador: ">", valor: 50000 }), "valor estimado acima de R$ 50.000,00")
  assert.match(descreverCondicao({ campo: "valor_total_estimado", operador: "entre", valor: 1000, valor_ate: 2000 }), /entre R\$ 1\.000,00 e R\$ 2\.000,00/)
  assert.equal(descreverCondicao({ campo: "tipo_contratacao", operador: "igual", valor: "OBRA" }), "tipo de contratação igual a Obra")
  assert.equal(descreverCondicao({ campo: "manual" }), "quem conduz responde sim ou não")
})

test("valor em reais: aceita 50.000,00, 50000 e R$ 50.000", () => {
  assert.equal(lerValorEmReais("50.000,00"), 50000)
  assert.equal(lerValorEmReais("50000"), 50000)
  assert.equal(lerValorEmReais("R$ 50.000"), 50000)
  assert.equal(lerValorEmReais("1234,5"), 1234.5)
  assert.equal(lerValorEmReais(""), null)
  assert.equal(lerValorEmReais("abc"), null)
})

test("quem faz: uma escolha só (papel, setor ou pessoa); combinação antiga fica como está", () => {
  assert.equal(valorDoResponsavel({ papel: null, setor_id: "s1", usuario_id: null }), "setor:s1")
  assert.deepEqual(responsavelDoValor("usuario:u1"), { papel: null, setor_id: null, usuario_id: "u1" })
  assert.deepEqual(responsavelDoValor(""), { papel: null, setor_id: null, usuario_id: null })
  const combinado = { papel: "AGENTE_CONTRATACAO", setor_id: "s1", usuario_id: null }
  assert.equal(valorDoResponsavel(combinado), "combinado")
  assert.deepEqual(responsavelDoValor("combinado", combinado), combinado)
  const listas = { papeis: [{ codigo: "AGENTE_CONTRATACAO", rotulo: "Agente de contratação" }], setores: [{ id: "s1", nome: "Compras" }], usuarios: [{ id: "u1", nome: "Maria" }] }
  assert.equal(rotuloDoResponsavel(combinado, listas), "Agente de contratação no setor Compras")
  assert.equal(rotuloDoResponsavel({ papel: null, setor_id: null, usuario_id: "u1" }, listas), "Maria")
  assert.equal(rotuloDoResponsavel({ papel: null, setor_id: null, usuario_id: null }, listas), null)
})

test("envio e desenho em branco", () => {
  const g = grafoEmBranco()
  assert.deepEqual(g.nos.map((n) => n.tipo), ["inicio", "fim"])
  const env = grafoParaEnvio({ nos: g.nos, arestas: [{ ...g.arestas[0], extra: 1 }] })
  assert.equal(env.formato, 1)
  assert.deepEqual(Object.keys(env.arestas[0]).sort(), ["de", "id", "para", "rotulo"])
})

test("tecla Delete: não apaga caixa com o foco num campo de texto", () => {
  assert.equal(focoEmCampoDeTexto({ tagName: "INPUT" }), true)
  assert.equal(focoEmCampoDeTexto({ tagName: "DIV", isContentEditable: true }), true)
  assert.equal(focoEmCampoDeTexto({ tagName: "DIV" }), false)
  assert.equal(focoEmCampoDeTexto(null), false)
})
