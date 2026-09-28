// DFD consolidado: "próxima ação" por situação (lista), próximo passo na tela
// do DFD, guia de 3 passos e o aviso "Processo nº X aberto".
// Rodar: npm run test:unit
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  comAvisoDeAbertura, comQuemEstaTexto, ordemDaLista, passoDoDfd, proximaAcaoDfd, proximoPassoDoProcesso, proximoPassoNoDfd,
  rotaDoDfd, rotaDoProcessoAberto, situacaoDoDfd,
} from "./proxima-acao-dfd.ts"

const PLANEJ = { pode_montar: true, exige_aprovacao_dfd: false, pode_aprovar_dfd: false, aprovador_dfd: "Autoridade", responsavel_dfd: "Planejamento" }
const PLANEJ_2A = { ...PLANEJ, exige_aprovacao_dfd: true }
const CONSULTA = { pode_montar: false, exige_aprovacao_dfd: false, pode_aprovar_dfd: false, responsavel_dfd: "Planejamento" }
const APROVADOR = { pode_montar: false, exige_aprovacao_dfd: true, pode_aprovar_dfd: true, aprovador_dfd: "Autoridade" }

test("situação legível", () => {
  assert.equal(situacaoDoDfd("RASCUNHO"), "Em elaboração")
  assert.equal(situacaoDoDfd("AGUARDANDO_APROVACAO"), "Aguardando 2ª aprovação")
  assert.equal(situacaoDoDfd("APROVADO"), "Aprovado")
  assert.equal(situacaoDoDfd("EM_PROCESSO"), "Processo aberto")
  assert.equal(situacaoDoDfd("CANCELADO"), "Cancelado")
  assert.equal(situacaoDoDfd("OUTRO"), "OUTRO")
})

test("rotas", () => {
  assert.equal(rotaDoDfd("d1"), "/orgao/demandas/dfd/d1")
  assert.equal(rotaDoDfd("d1", { montado: true }), "/orgao/demandas/dfd/d1?montado=1")
  assert.equal(rotaDoDfd("d1", { acao: "abrir-processo" }), "/orgao/demandas/dfd/d1?acao=abrir-processo")
  assert.equal(rotaDoProcessoAberto("p1", "DFD nº 3/2026"), "/orgao/processos/p1?aberto=dfd&dfd=DFD%20n%C2%BA%203%2F2026")
  assert.equal(rotaDoProcessoAberto("p1"), "/orgao/processos/p1?aberto=dfd")
  assert.equal(comAvisoDeAbertura("/orgao/processos/p1"), "/orgao/processos/p1?aberto=dfd")
  // destino que não é a tela do processo fica como veio
  assert.equal(comAvisoDeAbertura("/orgao/fase-interna/processos/p1"), "/orgao/fase-interna/processos/p1")
  assert.equal(comAvisoDeAbertura("/orgao/processos/p1?x=1"), "/orgao/processos/p1?x=1")
})

test("lista — em elaboração, sem 2ª aprovação: Abrir processo (+ Continuar DFD)", () => {
  const a = proximaAcaoDfd({ id: "d1", status: "RASCUNHO" }, PLANEJ)
  assert.equal(a.situacao, "Em elaboração")
  assert.deepEqual(a.principal, { rotulo: "Abrir processo", href: "/orgao/demandas/dfd/d1?acao=abrir-processo" })
  assert.deepEqual(a.secundaria, { rotulo: "Continuar DFD", href: "/orgao/demandas/dfd/d1" })
})

test("lista — em elaboração, com 2ª aprovação: Enviar para aprovação", () => {
  const a = proximaAcaoDfd({ id: "d1", status: "RASCUNHO" }, PLANEJ_2A)
  assert.equal(a.principal?.rotulo, "Enviar para aprovação")
  assert.equal(a.principal?.href, "/orgao/demandas/dfd/d1?acao=enviar")
  assert.equal(a.secundaria?.rotulo, "Continuar DFD")
  assert.match(a.dica, /Autoridade/)
})

test("lista — aguardando 2ª aprovação", () => {
  // planejamento espera; sem botão de ação
  const p = proximaAcaoDfd({ id: "d1", status: "AGUARDANDO_APROVACAO" }, PLANEJ_2A)
  assert.equal(p.situacao, "Aguardando 2ª aprovação")
  assert.equal(p.principal, null)
  assert.equal(p.secundaria?.rotulo, "Ver DFD")
  // quem aprova: Revisar e aprovar
  assert.equal(proximaAcaoDfd({ id: "d1", status: "AGUARDANDO_APROVACAO" }, APROVADOR).principal?.rotulo, "Revisar e aprovar")
  // 2ª aprovação desligada depois do envio: o servidor já deixa abrir
  assert.equal(proximaAcaoDfd({ id: "d1", status: "AGUARDANDO_APROVACAO" }, PLANEJ).principal?.rotulo, "Abrir processo")
})

test("lista — aprovado: Abrir processo (só o planejamento)", () => {
  assert.equal(proximaAcaoDfd({ id: "d1", status: "APROVADO" }, PLANEJ_2A).principal?.rotulo, "Abrir processo")
  assert.equal(proximaAcaoDfd({ id: "d1", status: "APROVADO" }, CONSULTA).principal, null)
})

test("lista — processo aberto: Ver processo nº X", () => {
  const a = proximaAcaoDfd({ id: "d1", status: "EM_PROCESSO", licitacao_id: "p9", numero_processo: "012/2026" }, CONSULTA)
  assert.deepEqual(a.principal, { rotulo: "Ver processo nº 012/2026", href: "/orgao/processos/p9" })
  assert.equal(a.secundaria?.rotulo, "Ver DFD")
  // sem o vínculo (dado antigo): só ver o DFD
  assert.equal(proximaAcaoDfd({ id: "d1", status: "EM_PROCESSO", licitacao_id: null }, PLANEJ).principal, null)
})

test("lista — cancelado e quem só consulta: nenhuma ação, só Ver DFD", () => {
  const c = proximaAcaoDfd({ id: "d1", status: "CANCELADO" }, PLANEJ)
  assert.equal(c.principal, null)
  assert.equal(c.secundaria?.rotulo, "Ver DFD")
  for (const s of ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADO"]) {
    const a = proximaAcaoDfd({ id: "d1", status: s }, CONSULTA)
    assert.equal(a.principal, null, s)
    assert.equal(a.secundaria?.rotulo, "Ver DFD", s)
  }
  // sem permissões carregadas = consulta
  assert.equal(proximaAcaoDfd({ id: "d1", status: "RASCUNHO" }, null).principal, null)
})

test("ordem da lista: o que pede ação primeiro", () => {
  const l = ["CANCELADO", "EM_PROCESSO", "AGUARDANDO_APROVACAO", "RASCUNHO"].sort((a, b) => ordemDaLista(a) - ordemDaLista(b))
  assert.deepEqual(l, ["RASCUNHO", "AGUARDANDO_APROVACAO", "EM_PROCESSO", "CANCELADO"])
})

test("guia de 3 passos", () => {
  assert.deepEqual(passoDoDfd("RASCUNHO", false), { atual: 2, concluidos: [1] })
  assert.deepEqual(passoDoDfd("AGUARDANDO_APROVACAO", true), { atual: 2, concluidos: [1] })
  assert.deepEqual(passoDoDfd("AGUARDANDO_APROVACAO", false), { atual: 3, concluidos: [1, 2] })
  assert.deepEqual(passoDoDfd("APROVADO", true), { atual: 3, concluidos: [1, 2] })
  assert.deepEqual(passoDoDfd("EM_PROCESSO", false), { atual: null, concluidos: [1, 2, 3] })
  assert.deepEqual(passoDoDfd("CANCELADO", false), { atual: null, concluidos: [1] })
})

const P = (o) => ({ pode_montar: true, exige_aprovacao_dfd: false, aprovador_dfd: "Autoridade", responsavel_dfd: "Planejamento", enviar_aprovacao: false, aprovar: false, abrir_processo: false, ...o })

test("tela do DFD — próximo passo segue as permissões do servidor", () => {
  assert.equal(proximoPassoNoDfd({ status: "RASCUNHO" }, P({ abrir_processo: true })).acao, "ABRIR_PROCESSO")
  const env = proximoPassoNoDfd({ status: "RASCUNHO" }, P({ exige_aprovacao_dfd: true, enviar_aprovacao: true }))
  assert.equal(env.acao, "ENVIAR_APROVACAO")
  assert.match(env.texto, /Autoridade/)
  assert.equal(proximoPassoNoDfd({ status: "AGUARDANDO_APROVACAO" }, P({ pode_montar: false, aprovar: true })).acao, "APROVAR")
  const esp = proximoPassoNoDfd({ status: "AGUARDANDO_APROVACAO" }, P({ exige_aprovacao_dfd: true }))
  assert.equal(esp.acao, null)
  assert.match(esp.titulo, /2ª aprovação/)
  const ap = proximoPassoNoDfd({ status: "APROVADO" }, P({ exige_aprovacao_dfd: true, abrir_processo: true }))
  assert.equal(ap.acao, "ABRIR_PROCESSO")
  assert.match(ap.texto, /aprovado/)
  const proc = proximoPassoNoDfd({ status: "EM_PROCESSO", processo: { id: "p9", numero_processo: "012/2026" } }, P({}))
  assert.equal(proc.acao, "VER_PROCESSO")
  assert.match(proc.titulo, /012\/2026/)
  assert.equal(proximoPassoNoDfd({ status: "CANCELADO" }, P({})).acao, null)
  const consulta = proximoPassoNoDfd({ status: "RASCUNHO" }, P({ pode_montar: false }))
  assert.equal(consulta.acao, null)
  assert.match(consulta.texto, /Planejamento/)
})

test("processo aberto — com quem está", () => {
  assert.equal(comQuemEstaTexto({ status: "RECEBIDA", setor: { nome: "COMPRAS" }, usuario: { nome: "Paulo" } }), "COMPRAS (Paulo)")
  assert.equal(comQuemEstaTexto({ status: "PENDENTE", setor: { nome: "COMPRAS" }, usuario: null }), "COMPRAS")
  assert.equal(comQuemEstaTexto({ status: "PENDENTE", setor: null, usuario: { nome: "Paulo" } }), "Paulo")
  assert.equal(comQuemEstaTexto({ status: "SEM_TRAMITACAO", setor: null, usuario: null }), null)
  assert.equal(comQuemEstaTexto(null), null)
})

test("processo aberto — próximo passo = 1ª etapa em curso, com o responsável", () => {
  const etapas = {
    etapas: [
      {
        etapa: "PLANEJAMENTO",
        titulo: "Planejamento",
        passos: [
          { passo: "DFD", titulo: "Formalização da demanda", situacao: "CONCLUIDO", tarefa: null },
          { passo: "ETP", titulo: "Estudo técnico preliminar", situacao: "DISPONIVEL", responsavel_previsto: { rotulo: "Setor de Compras" } },
          { passo: "PESQUISA", titulo: "Pesquisa de preços", situacao: "EM_ANDAMENTO", tarefa: { status: "ABERTA", responsavel: { rotulo: "Paulo" } } },
        ],
      },
    ],
  }
  assert.deepEqual(proximoPassoDoProcesso(etapas), { titulo: "Pesquisa de preços", quem: "Paulo" })
  // só "pode começar": a 1ª delas, com o responsável previsto
  etapas.etapas[0].passos[2].situacao = "AGUARDANDO"
  assert.deepEqual(proximoPassoDoProcesso(etapas), { titulo: "Estudo técnico preliminar", quem: "Setor de Compras" })
  assert.equal(proximoPassoDoProcesso({ etapas: [] }), null)
  assert.equal(proximoPassoDoProcesso(null), null)
})
