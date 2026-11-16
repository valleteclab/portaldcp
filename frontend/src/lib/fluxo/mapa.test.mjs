// Mapa do fluxo: zigue-zague, setas e grupos. Rodar: npm run test:unit
import { test } from "node:test"
import assert from "node:assert/strict"
import { etapaGenerica, grupoDaEtapa, posicaoNoMapa } from "./mapa.ts"

test("1ª linha vai para a direita e desce no fim", () => {
  assert.deepEqual(posicaoNoMapa(0, 14), { coluna: 1, linha: 1, seta: "DIREITA" })
  assert.deepEqual(posicaoNoMapa(3, 14), { coluna: 4, linha: 1, seta: "BAIXO" })
})

test("2ª linha volta da direita para a esquerda, começando embaixo da 4ª", () => {
  assert.deepEqual(posicaoNoMapa(4, 14), { coluna: 4, linha: 2, seta: "ESQUERDA" })
  assert.deepEqual(posicaoNoMapa(7, 14), { coluna: 1, linha: 2, seta: "BAIXO" })
  assert.deepEqual(posicaoNoMapa(8, 14), { coluna: 1, linha: 3, seta: "DIREITA" })
})

test("última etapa não tem seta, mesmo no meio da linha", () => {
  assert.equal(posicaoNoMapa(13, 14).seta, "FIM")
  assert.equal(posicaoNoMapa(16, 17).seta, "FIM")
  assert.deepEqual(posicaoNoMapa(16, 17), { coluna: 1, linha: 5, seta: "FIM" })
})

test("cor por grupo e etapas genéricas", () => {
  assert.equal(grupoDaEtapa("AUTORIZACAO"), "DECISAO")
  assert.equal(grupoDaEtapa("PARECER_JURIDICO"), "PUBLICIDADE")
  assert.equal(grupoDaEtapa("PUBLICACAO"), "PUBLICIDADE")
  assert.equal(grupoDaEtapa("ETP"), "INSTRUCAO")
  assert.equal(grupoDaEtapa(null), "INSTRUCAO")
  assert.equal(etapaGenerica("DOCUMENTO"), true)
  assert.equal(etapaGenerica("RESERVA_ORCAMENTARIA"), false)
})
