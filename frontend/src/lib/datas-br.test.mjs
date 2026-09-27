// Datas em Brasília (formatarDataBR) — "Para quando" da demanda saía "undefined/undefined/undefined".
// Rodar: npm run test:unit   (node --experimental-strip-types --test)
import { test } from "node:test"
import assert from "node:assert/strict"
import { formatarDataBR } from "./api.ts"

test("data só-dia (coluna DATE) sai DD/MM/AAAA, sem voltar 1 dia", () => {
  assert.equal(formatarDataBR("2026-10-01"), "01/10/2026")
  assert.equal(formatarDataBR("2026-12-31"), "31/12/2026")
  assert.equal(formatarDataBR(" 2026-01-05 "), "05/01/2026")
})

test("nula/vazia sai '-'", () => {
  assert.equal(formatarDataBR(null), "-")
  assert.equal(formatarDataBR(undefined), "-")
  assert.equal(formatarDataBR(""), "-")
})

test("data com hora em UTC é mostrada no dia de Brasília", () => {
  // 02h UTC = 23h do dia anterior em Brasília
  assert.equal(formatarDataBR("2026-10-02T02:00:00.000Z"), "01/10/2026")
  assert.equal(formatarDataBR("2026-10-01T15:00:00.000Z"), "01/10/2026")
  // sem fuso: tratada como UTC
  assert.equal(formatarDataBR("2026-10-01T15:00:00"), "01/10/2026")
})

test("texto que não é data volta como veio", () => {
  assert.equal(formatarDataBR("a definir"), "a definir")
})
