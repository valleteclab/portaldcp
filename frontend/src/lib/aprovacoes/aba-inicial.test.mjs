// Central de Aprovações: abre na 1ª aba com pendência (ou na pedida em ?tab=).
// Rodar: npm run test:unit
import { test } from "node:test"
import assert from "node:assert/strict"
import { abaInicialDaCentral } from "./aba-inicial.ts"

const abas = (p) => [
  { valor: "contratos", visivel: p.contratosVisivel ?? true, pendentes: p.contratos ?? 0 },
  { valor: "demandas", visivel: true, pendentes: p.demandas ?? 0 },
  { valor: "documentos", visivel: true, pendentes: p.documentos ?? 0 },
  { valor: "medicoes", visivel: true, pendentes: p.medicoes ?? 0 },
]

test("abre na primeira aba com pendência (não em contratos vazio)", () => {
  assert.equal(abaInicialDaCentral(abas({ demandas: 3 })), "demandas")
  assert.equal(abaInicialDaCentral(abas({ documentos: 1, medicoes: 2 })), "documentos")
  assert.equal(abaInicialDaCentral(abas({ contratos: 1, demandas: 3 })), "contratos")
})

test("sem pendência: a primeira aba visível", () => {
  assert.equal(abaInicialDaCentral(abas({})), "contratos")
  assert.equal(abaInicialDaCentral(abas({ contratosVisivel: false })), "demandas")
})

test("aba invisível com pendência não é escolhida", () => {
  assert.equal(abaInicialDaCentral(abas({ contratosVisivel: false, contratos: 5, medicoes: 1 })), "medicoes")
})

test("?tab= válido manda; inválido ou invisível é ignorado", () => {
  assert.equal(abaInicialDaCentral(abas({ demandas: 3 }), "medicoes"), "medicoes")
  assert.equal(abaInicialDaCentral(abas({ demandas: 3 }), "xyz"), "demandas")
  assert.equal(abaInicialDaCentral(abas({ contratosVisivel: false, demandas: 1 }), "contratos"), "demandas")
})
