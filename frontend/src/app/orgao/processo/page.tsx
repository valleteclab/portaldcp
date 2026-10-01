"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { chamarProcessos, dataHora, rotuloDoTipo, textoDoErro, type ProcessoResumo } from "@/lib/processo/processo"
import { TemaProcesso, estilos as s } from "@/components/processo/BlocosProcesso"

/** Lista de processos do órgão (módulo Processo eletrônico) + abertura de processo avulso. */
export default function ListaProcessosPage() {
  const router = useRouter()
  const [resultado, setResultado] = useState<{ chave: string; itens: ProcessoResumo[]; erro: string | null } | null>(null)
  const [tipo, setTipo] = useState("")
  const [situacao, setSituacao] = useState("ABERTO")
  const [busca, setBusca] = useState("")
  const [buscaAplicada, setBuscaAplicada] = useState("")

  const [novo, setNovo] = useState(false)
  const [objeto, setObjeto] = useState("")
  const [criando, setCriando] = useState(false)
  const [erroNovo, setErroNovo] = useState<string | null>(null)

  const chave = [tipo, situacao, buscaAplicada.trim()].join("|")
  const carregando = resultado?.chave !== chave
  const itens = resultado?.chave === chave ? resultado.itens : []
  const erro = resultado?.chave === chave ? resultado.erro : null

  useEffect(() => {
    let vivo = true
    const q = new URLSearchParams()
    if (tipo) q.set("tipo", tipo)
    if (situacao) q.set("situacao", situacao)
    if (buscaAplicada.trim()) q.set("q", buscaAplicada.trim())
    q.set("limit", "200")
    chamarProcessos<ProcessoResumo[]>(`?${q.toString()}`, { padrao: "Não foi possível carregar os processos." })
      .then((r) => vivo && setResultado({ chave, itens: Array.isArray(r) ? r : [], erro: null }))
      .catch((e) => vivo && setResultado({ chave, itens: [], erro: textoDoErro(e, "Não foi possível carregar os processos.") }))
    return () => {
      vivo = false
    }
  }, [chave, tipo, situacao, buscaAplicada])

  async function criar() {
    setErroNovo(null)
    if (objeto.trim().length < 5) return setErroNovo("Descreva o assunto do processo (pelo menos 5 letras).")
    setCriando(true)
    try {
      const p = await chamarProcessos<ProcessoResumo>("", {
        metodo: "POST",
        padrao: "Não foi possível abrir o processo.",
        corpo: { tipo: "AVULSO", objeto: objeto.trim() },
      })
      router.push(`/orgao/processo/${p.id}`)
    } catch (e) {
      setErroNovo(textoDoErro(e, "Não foi possível abrir o processo."))
      setCriando(false)
    }
  }

  return (
    <TemaProcesso>
      <div className={s.cabecalhoLista}>
        <h1>Processos</h1>
        <button type="button" className={`${s.botao} ${s.primario}`} onClick={() => setNovo((v) => !v)} aria-expanded={novo}>
          Novo processo
        </button>
      </div>

      {novo ? (
        <section className={s.bloco} aria-labelledby="novo-processo">
          <div className={s.eyebrow} id="novo-processo">
            Novo processo avulso
          </div>
          <div className={s.formulario} style={{ marginTop: 8 }}>
            <p className={s.texto}>
              Para um assunto que não é licitação nem contrato (ofício, solicitação, consulta). Depois de aberto, você envia para o setor que deve tratar.
            </p>
            <label className={s.rotulo} htmlFor="novo-objeto">
              Assunto
            </label>
            <textarea
              id="novo-objeto"
              className={s.campo}
              value={objeto}
              maxLength={500}
              onChange={(e) => setObjeto(e.target.value)}
              placeholder="Ex.: Solicitação de manutenção do ar-condicionado da sala 3"
            />
            {erroNovo ? (
              <div className={s.erro} role="alert">
                {erroNovo}
              </div>
            ) : null}
            <div className={s.acoes}>
              <button type="button" className={`${s.botao} ${s.primario}`} onClick={criar} disabled={criando}>
                {criando ? "Abrindo..." : "Abrir processo"}
              </button>
              <button type="button" className={`${s.botao} ${s.secundario}`} onClick={() => setNovo(false)} disabled={criando}>
                Cancelar
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className={s.bloco}>
        <form
          className={s.filtros}
          onSubmit={(e) => {
            e.preventDefault()
            setBuscaAplicada(busca)
          }}
        >
          <input
            className={s.campo}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número ou assunto"
            aria-label="Buscar por número ou assunto"
          />
          <select className={s.campo} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de processo">
            <option value="">Todos os tipos</option>
            <option value="CONTRATACAO">Contratação</option>
            <option value="ADITIVO">Termo aditivo</option>
            <option value="RENOVACAO">Renovação de contrato</option>
            <option value="AVULSO">Avulso</option>
          </select>
          <select className={s.campo} value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
            <option value="ABERTO">Em andamento</option>
            <option value="ENCERRADO">Encerrados</option>
            <option value="">Todos</option>
          </select>
          <button type="submit" className={`${s.botao} ${s.secundario}`}>
            Buscar
          </button>
        </form>

        {carregando ? (
          <p className={s.vazio} role="status">
            Carregando...
          </p>
        ) : erro ? (
          <div className={s.erro} role="alert">
            {erro}
          </div>
        ) : itens.length === 0 ? (
          <p className={s.vazio}>Nenhum processo encontrado com esses filtros.</p>
        ) : (
          <>
            <div className={s.tabelaCaixa}>
              <table className={s.tabela}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Assunto</th>
                    <th>Tipo</th>
                    <th>Situação</th>
                    <th>Aberto em</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((p) => (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link className={s.link} href={`/orgao/processo/${p.id}`}>
                          {p.numero}
                        </Link>
                      </td>
                      <td className={s.celulaObjeto}>{p.objeto}</td>
                      <td>{rotuloDoTipo(p.tipo)}</td>
                      <td>
                        <span className={`${s.chip} ${p.situacao === "ENCERRADO" ? s.chipOk : s.chipEspera}`}>
                          {p.situacao === "ENCERRADO" ? "Encerrado" : "Em andamento"}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{dataHora(p.aberto_em).slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.cartoes}>
              {itens.map((p) => (
                <Link key={p.id} href={`/orgao/processo/${p.id}`} className={s.cartao}>
                  <strong>{p.numero}</strong>
                  <span>{p.objeto}</span>
                  <span className={s.pecaMeta}>
                    {rotuloDoTipo(p.tipo)} · {p.situacao === "ENCERRADO" ? "Encerrado" : "Em andamento"}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </TemaProcesso>
  )
}
