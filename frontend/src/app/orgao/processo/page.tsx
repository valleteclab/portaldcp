"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { chamarProcessos, dataHora, rotuloDoTipo, textoDoErro, type ProcessoResumo } from "@/lib/processo/processo"
import { TemaProcesso, estilos as s } from "@/components/processo/BlocosProcesso"
import { ModuloSistema, useModulosOrgao } from "@/hooks/useModulosOrgao"
import { API_URL, authFetch } from "@/lib/api"

type TipoNovo = "OFICIO" | "CONTRATACAO" | "ADITIVO" | "RENOVACAO" | "AVULSO"

/**
 * Tipos do "Novo processo" (mockup aprovado em 06/10/2026). Livre = a pessoa
 * escolhe para quem enviar a cada passo; Com fluxo = o caminho já vem do órgão.
 * Cada tipo só aparece se o órgão tem o módulo dele.
 */
const OPCOES_NOVO: Array<{ valor: TipoNovo; nome: string; selo: "Livre" | "Com fluxo"; texto: string; modulo?: ModuloSistema }> = [
  { valor: "OFICIO", nome: "Ofício", selo: "Livre", texto: "Escreve, assina e envia para outro setor. O número sai na sequência do seu setor." },
  { valor: "CONTRATACAO", nome: "Contratação", selo: "Com fluxo", texto: "Da demanda à publicação: licitação, dispensa ou inexigibilidade.", modulo: ModuloSistema.LICITACOES },
  { valor: "ADITIVO", nome: "Aditivo de contrato", selo: "Com fluxo", texto: "Prazo, valor ou quantidade de um contrato vigente.", modulo: ModuloSistema.CONTRATOS },
  { valor: "RENOVACAO", nome: "Renovação de contrato", selo: "Com fluxo", texto: "Prorrogação de um contrato por novo período.", modulo: ModuloSistema.CONTRATOS },
  { valor: "AVULSO", nome: "Processo avulso", selo: "Livre", texto: "Qualquer outro assunto que precise de autos e tramitação." },
]

interface ContratoOpcao {
  id: string
  numero_contrato: string
  objeto?: string | null
  status?: string | null
}

function textoEstaCom(p: ProcessoResumo): string {
  if (p.situacao === "ENCERRADO") return "—"
  const c = p.esta_com
  if (!c) return "Sem tramitação"
  const quem = [c.setor_nome, c.usuario_nome].filter(Boolean).join(" · ") || "Órgão"
  return c.recebida ? quem : `${quem} (a receber)`
}

/** Lista de processos do órgão (módulo Processo eletrônico) + "Novo processo" com todos os tipos. */
export default function ListaProcessosPage() {
  const router = useRouter()
  const [resultado, setResultado] = useState<{ chave: string; itens: ProcessoResumo[]; erro: string | null } | null>(null)
  const [tipo, setTipo] = useState("")
  const [situacao, setSituacao] = useState("ABERTO")
  const [busca, setBusca] = useState("")
  const [buscaAplicada, setBuscaAplicada] = useState("")

  const [novo, setNovo] = useState(false)
  const [tipoNovo, setTipoNovo] = useState<TipoNovo>("OFICIO")
  const [contratos, setContratos] = useState<ContratoOpcao[] | null>(null)
  const [contratoId, setContratoId] = useState("")
  const { temAcesso, loading: carregandoModulos } = useModulosOrgao()
  const opcoes = OPCOES_NOVO.filter((o) => !o.modulo || carregandoModulos || temAcesso(o.modulo))
  const ehDeContrato = tipoNovo === "ADITIVO" || tipoNovo === "RENOVACAO"
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

  // Aditivo e renovação nascem de um contrato: a lista só é buscada quando o tipo é escolhido
  useEffect(() => {
    if (!ehDeContrato || contratos !== null) return
    let vivo = true
    authFetch(`${API_URL}/api/contratos?limit=500`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        if (!vivo) return
        const lista: ContratoOpcao[] = Array.isArray(j) ? j : j?.data || []
        setContratos(lista.slice().sort((a, b) => String(b.numero_contrato).localeCompare(String(a.numero_contrato), "pt-BR", { numeric: true })))
      })
      .catch(() => vivo && setContratos([]))
    return () => {
      vivo = false
    }
  }, [ehDeContrato, contratos])

  async function criar() {
    setErroNovo(null)
    // Contratação: segue para o assistente que já existe (DFD, pesquisa, ETP, TR… e a licitação)
    if (tipoNovo === "CONTRATACAO") return router.push("/orgao/fase-interna/processos/novo")
    const contrato = ehDeContrato ? contratos?.find((c) => c.id === contratoId) ?? null : null
    if (ehDeContrato && !contrato) return setErroNovo("Escolha o contrato.")
    const assunto =
      objeto.trim() ||
      (contrato ? (tipoNovo === "ADITIVO" ? `Termo aditivo ao contrato nº ${contrato.numero_contrato}` : `Renovação do contrato nº ${contrato.numero_contrato}`) : "")
    if (assunto.length < 5) return setErroNovo("Descreva o assunto do processo (pelo menos 5 letras).")
    setCriando(true)
    try {
      const p = await chamarProcessos<ProcessoResumo>("", {
        metodo: "POST",
        padrao: "Não foi possível abrir o processo.",
        corpo: { tipo: tipoNovo, objeto: assunto, contrato_id: contrato?.id },
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
            Novo processo
          </div>
          <div className={s.formulario} style={{ marginTop: 8 }}>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <legend className={s.rotulo} style={{ marginBottom: 6 }}>
                O que você vai abrir?
              </legend>
              {opcoes.map((op) => (
                <label
                  key={op.valor}
                  htmlFor={`novo-tipo-${op.valor}`}
                  className={s.bloco}
                  style={{ margin: 0, cursor: "pointer", borderWidth: tipoNovo === op.valor ? 2 : 1, borderColor: tipoNovo === op.valor ? "var(--azul)" : undefined }}
                >
                  <input
                    id={`novo-tipo-${op.valor}`}
                    type="radio"
                    name="novo-tipo"
                    value={op.valor}
                    checked={tipoNovo === op.valor}
                    onChange={() => setTipoNovo(op.valor)}
                    style={{ marginRight: 8 }}
                  />
                  <b>{op.nome}</b>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: op.selo === "Livre" ? "var(--linha2)" : "var(--azul-fundo)",
                      color: op.selo === "Livre" ? "var(--tinta2)" : "var(--azul-tinta)",
                    }}
                  >
                    {op.selo}
                  </span>
                  <span className={s.texto} style={{ display: "block", marginTop: 4 }}>
                    {op.texto}
                  </span>
                </label>
              ))}
            </fieldset>
            <p className={s.texto} style={{ margin: 0 }}>
              <b>Livre</b> — você escolhe para quem enviar a cada passo. <b>Com fluxo</b> — o caminho já vem definido pelo órgão.
            </p>
            {tipoNovo === "CONTRATACAO" ? (
              <p className={s.texto}>A contratação abre no assistente da fase interna: demanda, DFD, pesquisa de preço, ETP, TR e a escolha da modalidade.</p>
            ) : (
              <>
                {ehDeContrato ? (
                  <>
                    <label className={s.rotulo} htmlFor="novo-contrato">
                      Contrato
                    </label>
                    <select id="novo-contrato" className={s.campo} value={contratoId} onChange={(e) => setContratoId(e.target.value)} disabled={contratos === null}>
                      <option value="">{contratos === null ? "Carregando contratos..." : contratos.length ? "Escolha o contrato" : "Nenhum contrato encontrado"}</option>
                      {(contratos ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.numero_contrato}
                          {c.objeto ? ` — ${c.objeto.slice(0, 80)}` : ""}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                <label className={s.rotulo} htmlFor="novo-objeto">
                  {ehDeContrato ? "Assunto (opcional)" : "Assunto"}
                </label>
                <textarea
                  id="novo-objeto"
                  className={s.campo}
                  value={objeto}
                  maxLength={500}
                  onChange={(e) => setObjeto(e.target.value)}
                  placeholder={
                    tipoNovo === "OFICIO"
                      ? "Ex.: Remanejamento de mobiliário para a sala das comissões"
                      : ehDeContrato
                        ? "Em branco: “Termo aditivo ao contrato nº …” ou “Renovação do contrato nº …”"
                        : "Ex.: Solicitação de manutenção do ar-condicionado da sala 3"
                  }
                />
              </>
            )}
            {erroNovo ? (
              <div className={s.erro} role="alert">
                {erroNovo}
              </div>
            ) : null}
            <div className={s.acoes}>
              <button type="button" className={`${s.botao} ${s.primario}`} onClick={criar} disabled={criando}>
                {criando ? "Abrindo..." : tipoNovo === "OFICIO" ? "Escrever ofício" : tipoNovo === "CONTRATACAO" ? "Continuar para a contratação" : "Abrir processo"}
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
            <option value="OFICIO">Ofício</option>
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
                    <th>Está com</th>
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
                      <td>{textoEstaCom(p)}</td>
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
                    {p.situacao !== "ENCERRADO" && p.esta_com ? ` · com ${textoEstaCom(p)}` : ""}
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
