// "Concluir etapa" na tela do documento. Rodar: npm run test:unit
import { test } from "node:test"
import assert from "node:assert/strict"
import { destinoAposConcluir, etapaDestaTela, proximaEtapa } from "./concluir-etapa.ts"

const no = (chave, tipo, situacao, responsavel, tarefa_id = null) => ({
  chave,
  titulo: chave,
  tipo,
  responsavel,
  situacao,
  desde: null,
  concluida_em: null,
  prazo_em: null,
  atrasada: false,
  devolvida: false,
  obrigatoria_lei: null,
  tarefa_id,
})

const base = () => {
  const nos = [no("DFD", "DFD", "CONCLUIDA", "DIRETORIA"), no("ETP", "ETP", "EM_ANDAMENTO", "DIRETORIA", "t1"), no("Docs", "TAREFA", "A_REALIZAR", "DIRETORIA"), no("Pesquisa", "PESQUISA_PRECO", "A_REALIZAR", "COMPRAS")]
  return { modo: "FLUXO", fluxo: null, instancia_id: "i1", nos, concluidas: 1, total: 4, atual: nos[1], encerrado: false, pode_agir: true }
}

test("só a etapa em andamento desta tela, com tarefa e permissão de agir", () => {
  assert.equal(etapaDestaTela(base(), "etp")?.chave, "ETP")
  assert.equal(etapaDestaTela(base(), "tr"), null)
  assert.equal(etapaDestaTela({ ...base(), pode_agir: false }, "etp"), null)
  assert.equal(etapaDestaTela({ ...base(), encerrado: true }, "etp"), null)
  assert.equal(etapaDestaTela({ ...base(), modo: "LIVRE" }, "etp"), null)
  assert.equal(etapaDestaTela(null, "etp"), null)
})

test("mapa de riscos e ETP abrem a mesma tela", () => {
  const a = base()
  a.nos[1] = no("Riscos", "MAPA_RISCOS", "EM_ANDAMENTO", "DIRETORIA", "t1")
  a.atual = a.nos[1]
  assert.equal(etapaDestaTela(a, "etp")?.chave, "Riscos")
})

test("depois de concluir: próxima com tela e mesmo responsável abre a tela; senão volta ao processo", () => {
  const a = base()
  assert.equal(proximaEtapa(a, a.nos[1])?.chave, "Docs")
  // próxima é TAREFA (sem tela) → processo
  assert.equal(destinoAposConcluir(a, a.nos[1], "lic", "proc"), "/orgao/processo/proc")
  a.nos.splice(2, 1) // próxima vira Pesquisa, de outro setor → processo
  assert.equal(destinoAposConcluir(a, a.nos[1], "lic", "proc"), "/orgao/processo/proc")
  a.nos[2] = no("TR", "TR", "A_REALIZAR", "DIRETORIA")
  assert.equal(destinoAposConcluir(a, a.nos[1], "lic", "proc"), "/orgao/processos/lic/fase-interna/tr")
  // última etapa → processo
  assert.equal(destinoAposConcluir(a, a.nos[2], "lic", "proc"), "/orgao/processo/proc")
  assert.equal(proximaEtapa(a, a.nos[2]), null)
})
