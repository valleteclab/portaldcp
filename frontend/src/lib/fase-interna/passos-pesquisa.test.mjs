// Passos da tela da pesquisa de preços. Rodar: npm run test:unit
import { test } from "node:test"
import assert from "node:assert/strict"
import { passosDaPesquisa } from "./passos-pesquisa.ts"

const p = (situacao_tela) => ({ situacao_tela })
const base = () => ({
  parametros: [p("ATENDIDO"), p("ATENDIDO"), p("SEM_RETORNO"), p("PENDENTE"), p("PENDENTE")],
  propostas: [
    { valida: true, alertas: [{ codigo: "VENCE_ANTES_DA_PUBLICACAO" }] },
    { valida: true, alertas: [] },
  ],
  resumo: { metodo: "MEDIANA", total_adotado: 42720, tres_precos: { atende: true } },
  justificativa_metodo: "Adotada a mediana por reduzir extremos.",
  pendencias: { bloqueios: ["x"] },
  certidao: null,
  mapa: null,
})

test("começo: fontes faltando, cotação vencendo antes, valor justificado, mapa depois", () => {
  const [f, c, v, m] = passosDaPesquisa(base())
  assert.equal(f.situacao, "3 de 5 registradas · faltam 2")
  assert.equal(f.tom, "falta")
  assert.equal(c.situacao, "2 recebidas · 1 vence antes da publicação")
  assert.equal(c.tom, "falta")
  assert.match(v.situacao, /^Mediana · R\$\s?42\.720,00 · justificado$/)
  assert.equal(v.tom, "ok")
  assert.equal(m.situacao, "Emitir depois do passo 1") // cotação que vence antes é aviso, não trava
  assert.equal(m.tom, "neutro")
})

test("tudo pronto: fontes ok, cotações válidas, emitido", () => {
  const d = base()
  d.parametros = d.parametros.map(() => p("ATENDIDO"))
  d.propostas[0].alertas = []
  d.pendencias.bloqueios = []
  d.certidao = { gerada_em: "2026-10-13T15:00:00Z" }
  d.mapa = { tem_arquivo: true }
  const [f, c, v, m] = passosDaPesquisa(d)
  assert.equal(f.tom, "ok")
  assert.equal(c.situacao, "2 recebidas · válidas")
  assert.equal(c.tom, "ok")
  assert.equal(v.tom, "ok")
  assert.equal(m.situacao, "Emitidos em 13/10/2026")
  assert.equal(m.tom, "ok")
})

test("sem método e sem cotações: passo 3 pede o método; 2 neutro", () => {
  const d = base()
  d.resumo = { metodo: null, total_adotado: null, tres_precos: { atende: false } }
  d.propostas = []
  d.justificativa_metodo = ""
  const [, c, v, m] = passosDaPesquisa(d)
  assert.equal(c.situacao, "Nenhuma recebida")
  assert.equal(c.tom, "neutro")
  assert.equal(v.situacao, "Escolha o método")
  assert.equal(v.tom, "atual")
  assert.equal(m.situacao, "Emitir depois dos passos 1 e 3")
})

test("cotação inválida conta separado da que vence antes", () => {
  const d = base()
  d.propostas = [{ valida: false, alertas: [{ codigo: "VENCIDA" }] }, { valida: true, alertas: [] }]
  const [, c] = passosDaPesquisa(d)
  assert.equal(c.situacao, "2 recebidas · 1 inválida")
})
