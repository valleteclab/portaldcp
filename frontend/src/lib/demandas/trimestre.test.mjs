// Trimestre do item derivado do "Para quando" da demanda (não mais "1º" por padrão).
// Rodar: npm run test:unit
import { test } from "node:test"
import assert from "node:assert/strict"
import { trimestreDaData, trimestreInicialDoItem } from "./trimestre.ts"

test("mês → trimestre", () => {
  assert.equal(trimestreDaData("2026-01-31"), 1)
  assert.equal(trimestreDaData("2026-03-01"), 1)
  assert.equal(trimestreDaData("2026-04-01"), 2)
  assert.equal(trimestreDaData("2026-09-30"), 3)
  assert.equal(trimestreDaData("2026-10-01"), 4)
  assert.equal(trimestreDaData("2026-12-31"), 4)
  // com hora (vinda de timestamp) usa o dia gravado
  assert.equal(trimestreDaData("2026-07-01T00:00:00.000Z"), 3)
})

test("sem data / inválida → null (usuário escolhe)", () => {
  assert.equal(trimestreDaData(null), null)
  assert.equal(trimestreDaData(undefined), null)
  assert.equal(trimestreDaData(""), null)
  assert.equal(trimestreDaData("2026-13-01"), null)
  assert.equal(trimestreDaData("amanhã"), null)
})

test("valor inicial do campo do item", () => {
  assert.equal(trimestreInicialDoItem("2026-05-10"), "2")
  assert.equal(trimestreInicialDoItem(null), "")
})
