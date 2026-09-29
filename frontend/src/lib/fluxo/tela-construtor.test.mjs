// Testes das regras da tela do construtor de fluxo (rascunho × versão ativa).
// Rodar: npm run test:unit   (node --experimental-strip-types --test)
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  assinatura,
  assinaturaDaConferencia,
  corpoDoRascunho,
  dispensaveisPorAto,
  erroDoCorpo,
  exigidasPelaLei,
  mensagemAtivado,
  modeloEmEdicao,
  rotuloDaOrigem,
  situacaoDaEdicao,
} from "./tela-construtor.ts"

const aprovacao = { exigida: false, etapa: "DFD", aprovador: { tipo: "PERMISSAO", valor: null }, aceita_peca_externa: true }
const grafo = (nome) => ({
  formato: 1,
  nos: [
    { id: "inicio", tipo: "inicio", nome: "Início", x: 40, y: 40 },
    { id: "n1", tipo: "etapa", nome, x: 280, y: 40 },
    { id: "fim", tipo: "fim", nome: "Fim", x: 520, y: 40 },
  ],
  arestas: [
    { id: "a1", de: "inicio", para: "n1", rotulo: "normal" },
    { id: "a2", de: "n1", para: "fim", rotulo: "normal" },
  ],
})
const ativo = { versao: 3, nome: "Ativo", descricao: null, aprovacao_demanda: aprovacao, exigir_posse_pecas: true, grafo: grafo("Ativa"), ativado_em: null, ativado_por_nome: null }

test("em edição: o rascunho quando existe; senão, a versão ativa", () => {
  assert.equal(modeloEmEdicao({ ativo, rascunho: null }).grafo.nos[1].nome, "Ativa")
  const rascunho = { ...ativo, nome: "Rascunho", grafo: grafo("Nova"), exigir_posse_pecas: false }
  const m = modeloEmEdicao({ ativo, rascunho })
  assert.equal(m.nome, "Rascunho")
  assert.equal(m.grafo.nos[1].nome, "Nova")
  assert.equal(m.exigir_posse_pecas, false)
})

test("corpo do rascunho: só o que a tela edita (aprovação sem a etapa; seta sem campos extras)", () => {
  const m = modeloEmEdicao({ ativo, rascunho: null })
  m.grafo.arestas[0].extra = "x"
  const c = corpoDoRascunho(m)
  assert.deepEqual(Object.keys(c).sort(), ["aprovacao_demanda", "exigir_posse_pecas", "grafo", "nome"])
  assert.equal(c.aprovacao_demanda.etapa, undefined)
  assert.equal(c.grafo.arestas[0].extra, undefined)
})

test("arrastar uma caixa muda o que salvar, mas não pede conferência nova", () => {
  const a = modeloEmEdicao({ ativo, rascunho: null })
  const b = { ...a, grafo: { ...a.grafo, nos: a.grafo.nos.map((n) => (n.id === "n1" ? { ...n, x: 300 } : n)) } }
  assert.notEqual(assinatura(a), assinatura(b))
  assert.equal(assinaturaDaConferencia(a), assinaturaDaConferencia(b))
  const c = { ...a, grafo: { ...a.grafo, nos: a.grafo.nos.map((n) => (n.id === "n1" ? { ...n, nome: "Outra" } : n)) } }
  assert.notEqual(assinaturaDaConferencia(a), assinaturaDaConferencia(c))
})

test("rascunho × versão ativa: a frase do topo", () => {
  const vendo = situacaoDaEdicao({ ativo, rascunho: null }, { temRascunho: false, salvoEm: null, salvando: false, alterado: false, erroAoSalvar: null })
  assert.equal(vendo.titulo, "Você está vendo a versão ativa 3.")
  const base = { temRascunho: true, salvoEm: null, salvando: false, alterado: false, erroAoSalvar: null }
  assert.equal(situacaoDaEdicao({ ativo, rascunho: null }, base).titulo, "Você está editando o rascunho; a versão ativa é a 3.")
  assert.match(situacaoDaEdicao({ ativo, rascunho: null }, { ...base, salvoEm: "2026-09-28T17:05:00Z" }).detalhe, /^Rascunho salvo às 14:05\.$/)
  assert.match(situacaoDaEdicao({ ativo, rascunho: null }, { ...base, salvando: true }).detalhe, /Salvando/)
  assert.match(situacaoDaEdicao({ ativo, rascunho: null }, { ...base, erroAoSalvar: "sem permissão" }).detalhe, /Não foi salvo: sem permissão/)
  assert.match(situacaoDaEdicao({ ativo, rascunho: null }, { ...base, temRascunho: false, alterado: true }).titulo, /editando o rascunho/)
})

test("mensagem depois de ativar", () => {
  assert.equal(mensagemAtivado(4), "Versão 4 ativa — processos novos seguem este fluxo; os em andamento continuam no fluxo em que começaram.")
})

test("requisitos: exigidas pela lei e dispensáveis por ato", () => {
  const req = [
    { codigo: "R1", tipo: "ETAPA_OBRIGATORIA", etapa: "PARECER", outra_etapa: null, permite_dispensa_por_ato: true, fundamento: "art. 53", mensagem: "" },
    { codigo: "R2", tipo: "ETAPA_OBRIGATORIA", etapa: "DFD", outra_etapa: null, permite_dispensa_por_ato: false, fundamento: "art. 72", mensagem: "" },
    { codigo: "R3", tipo: "DEPENDENCIA", etapa: "AUTORIZACAO", outra_etapa: "PARECER", permite_dispensa_por_ato: false, fundamento: "", mensagem: "" },
  ]
  assert.deepEqual([...exigidasPelaLei(req)].sort(), ["DFD", "PARECER"])
  assert.deepEqual([...dispensaveisPorAto(req)], ["PARECER"])
})

test("erro do Ativar (400): texto e a lista da conferência", () => {
  const e = erroDoCorpo({ message: "O fluxo não foi ativado: x", erros: [{ codigo: "A", etapa: null, fundamento: null, mensagem: "x" }], lei: [] }, 400)
  assert.equal(e.texto, "O fluxo não foi ativado: x")
  assert.equal(e.erros.length, 1)
  assert.deepEqual(e.avisos, [])
  assert.equal(erroDoCorpo(null, 503).texto, "HTTP 503")
  assert.equal(rotuloDaOrigem("CONSTRUTOR"), "desenho")
  assert.equal(rotuloDaOrigem(null), "—")
})
