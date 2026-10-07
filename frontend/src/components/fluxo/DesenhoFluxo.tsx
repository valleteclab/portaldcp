"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Loader2, Lock, Trash2 } from "lucide-react"
import {
  apiFluxo,
  ErroFluxo,
  rotuloTipoProcesso,
  TIPOS_PROCESSO_FLUXO,
  type Avisos,
  type Canal,
  type Desenho,
  type EtapaDesenho,
  type ItemCatalogo,
  type Notificar,
  type OpcoesDesenho,
  type TipoResponsavel,
} from "@/lib/fluxo/desenho"
import { SimulacaoFluxo } from "./SimulacaoFluxo"

/**
 * DESENHAR O FLUXO (mockup aprovado em 06/10/2026, tela "Contratação 2"):
 * paleta de etapas do catálogo, o fluxo em caixas e setas (arrastar para
 * incluir e reordenar), painel da etapa selecionada e versões — o rascunho
 * se edita; o fluxo ativo gera uma nova versão; os processos em andamento
 * continuam na versão com que começaram.
 */

const novaChave = () => `novo-${Math.random().toString(36).slice(2, 10)}`
const CANAIS: Array<{ valor: Canal; rotulo: string }> = [
  { valor: "WHATSAPP", rotulo: "WhatsApp" },
  { valor: "EMAIL", rotulo: "E-mail" },
  { valor: "TEAMS", rotulo: "Teams" },
]

export function DesenhoFluxo({ fluxoId, onTrocarFluxo }: { fluxoId: string; onTrocarFluxo: (id: string) => void }) {
  const [desenho, setDesenho] = useState<Desenho | null>(null)
  const [etapas, setEtapas] = useState<EtapaDesenho[]>([])
  const [nome, setNome] = useState("")
  const [tipoProcesso, setTipoProcesso] = useState<string>("")
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [opcoes, setOpcoes] = useState<OpcoesDesenho>({ setores: [], usuarios: [], teams: [] })
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [sujo, setSujo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [arrastandoSobre, setArrastandoSobre] = useState<number | null>(null)
  const [testando, setTestando] = useState(false)
  // Modelos de documento por tipo ("Documento produzido"), buscados quando a etapa daquele tipo é aberta
  const [modelos, setModelos] = useState<Map<string, Array<{ id: string; nome: string; do_orgao: boolean }>>>(new Map())

  function aplicar(d: Desenho, manterSelecao?: number) {
    setDesenho(d)
    setEtapas(d.etapas)
    setNome(d.modelo.nome)
    setTipoProcesso(d.modelo.tipo_processo ?? "")
    setSujo(false)
    if (manterSelecao !== undefined && d.etapas[manterSelecao]) setSelecionada(d.etapas[manterSelecao].chave)
  }

  useEffect(() => {
    let vivo = true
    setErro(null)
    Promise.all([apiFluxo<Desenho>(`/${fluxoId}/desenho`), apiFluxo<ItemCatalogo[]>("/catalogo-nos"), apiFluxo<OpcoesDesenho>("/desenhos/opcoes").catch(() => ({ setores: [], usuarios: [], teams: [] }))])
      .then(([d, c, o]) => {
        if (!vivo) return
        aplicar(d)
        setCatalogo(c)
        setOpcoes(o)
        setSelecionada(d.etapas[0]?.chave ?? null)
      })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível abrir o fluxo."))
    return () => {
      vivo = false
    }
  }, [fluxoId])

  const porTipo = useMemo(() => new Map(catalogo.map((c) => [c.tipo, c])), [catalogo])
  const paleta = catalogo.filter((c) => c.disponivel && c.tipo !== "FORMULARIO")
  const editavel = !!desenho?.editavel
  const exigidas = new Set(TIPOS_EXIGIDOS(tipoProcesso))
  const travada = (e: EtapaDesenho) => exigidas.has(e.tipo) && !!porTipo.get(e.tipo)?.obrigatoria_lei
  const etapa = etapas.find((e) => e.chave === selecionada) ?? null
  const tipoDocumento = etapa ? porTipo.get(etapa.tipo)?.tipo_documento ?? null : null
  useEffect(() => {
    if (!tipoDocumento || modelos.has(tipoDocumento)) return
    apiFluxo<Array<{ id: string; nome: string; do_orgao: boolean }>>(`/desenhos/modelos?tipo=${encodeURIComponent(tipoDocumento)}`)
      .then((lista) => setModelos((m) => new Map(m).set(tipoDocumento, lista)))
      .catch(() => setModelos((m) => new Map(m).set(tipoDocumento, [])))
  }, [tipoDocumento, modelos])
  const indice = etapa ? etapas.indexOf(etapa) : -1
  const ativa = desenho?.versoes.find((v) => v.status === "PUBLICADO") ?? null

  function mudar(fn: (lista: EtapaDesenho[]) => EtapaDesenho[]) {
    setEtapas((l) => fn(l))
    setSujo(true)
  }
  function alterarEtapa(parcial: Partial<EtapaDesenho>) {
    if (!etapa) return
    mudar((l) => l.map((e) => (e.chave === etapa.chave ? { ...e, ...parcial } : e)))
  }
  function incluir(tipo: string, posicao: number) {
    const def = porTipo.get(tipo)
    if (!def || !editavel) return
    const nova: EtapaDesenho = {
      chave: novaChave(),
      tipo,
      nome: def.rotulo,
      responsavel_tipo: "SETOR",
      responsaveis: [],
      prazo_dias_uteis: null,
      devolver_para: null,
      aceita_documento_externo: def.documento.aceita_externo,
      avisos: null,
      notificar: tipo === "NOTIFICAR" ? { destinatarios: [], canais: [], mensagem: "" } : null,
      modelo_documento_id: null,
    }
    mudar((l) => [...l.slice(0, posicao), nova, ...l.slice(posicao)])
    setSelecionada(nova.chave)
  }
  function mover(chave: string, posicao: number) {
    mudar((l) => {
      const de = l.findIndex((e) => e.chave === chave)
      if (de < 0) return l
      const item = l[de]
      const sem = [...l.slice(0, de), ...l.slice(de + 1)]
      const alvo = posicao > de ? posicao - 1 : posicao
      return [...sem.slice(0, alvo), item, ...sem.slice(alvo)]
    })
  }
  function remover() {
    if (!etapa) return
    mudar((l) => l.filter((e) => e.chave !== etapa.chave).map((e) => (e.devolver_para === etapa.chave ? { ...e, devolver_para: null } : e)))
    setSelecionada(etapas[indice + 1]?.chave ?? etapas[indice - 1]?.chave ?? null)
  }

  async function salvar(): Promise<boolean> {
    if (!desenho) return false
    setSalvando(true)
    try {
      const corpo = {
        nome,
        tipo_processo: tipoProcesso || null,
        etapas: etapas.map((e) => ({
          ...e,
          avisos: e.avisos && e.avisos.canais.length ? e.avisos : null,
          notificar: e.tipo === "NOTIFICAR" && e.notificar && e.notificar.destinatarios.length && e.notificar.canais.length ? e.notificar : null,
        })),
      }
      aplicar(await apiFluxo<Desenho>(`/${desenho.modelo.id}/desenho`, { metodo: "PUT", corpo }), indice >= 0 ? indice : undefined)
      toast.success("Rascunho salvo.")
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.")
      return false
    } finally {
      setSalvando(false)
    }
  }

  async function ativar() {
    if (!desenho) return
    if (sujo && !(await salvar())) return
    setSalvando(true)
    try {
      aplicar(await apiFluxo<Desenho>(`/${desenho.modelo.id}/ativar`, { metodo: "POST" }))
      toast.success(`Versão ${desenho.modelo.versao} ativada. Os novos processos seguem esta versão.`)
    } catch (e) {
      const erros = e instanceof ErroFluxo ? e.erros : []
      toast.error(erros.length ? erros.join(" ") : e instanceof Error ? e.message : "Não foi possível ativar.")
    } finally {
      setSalvando(false)
    }
  }

  async function novaVersao() {
    if (!desenho) return
    setSalvando(true)
    try {
      const d = await apiFluxo<Desenho>(`/${desenho.modelo.id}/nova-versao`, { metodo: "POST" })
      onTrocarFluxo(d.modelo.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a nova versão.")
      setSalvando(false)
    }
  }

  if (erro) return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erro}</p>
  if (!desenho) return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Abrindo o fluxo…</p>

  const statusRotulo = desenho.modelo.status === "RASCUNHO" ? "rascunho" : desenho.modelo.status === "PUBLICADO" ? "ativa" : "substituída"
  const nomeDe = (tipo: TipoResponsavel, id: string) => (tipo === "SETOR" ? opcoes.setores : opcoes.usuarios).find((x) => x.id === id)?.nome ?? "—"
  const resumoResponsavel = (e: EtapaDesenho) =>
    porTipo.get(e.tipo)?.automatico ? "Automático" : e.responsavel_tipo === "SOLICITANTE" ? "Solicitante" : e.responsaveis.length ? e.responsaveis.map((id) => nomeDe(e.responsavel_tipo, id)).join(", ") : "Sem responsável"

  return (
    <div className="flex flex-col gap-5 text-[#0F172A]">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-1">
          <Link href="/orgao/configuracoes/fluxos" className="inline-flex w-fit items-center gap-1 text-sm text-[#1B4A63] hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />Fluxos de processo
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {editavel ? (
              <input
                aria-label="Nome do fluxo"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value)
                  setSujo(true)
                }}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-2xl font-bold hover:border-[#E3E7EC] focus:border-[#1B4A63] focus:outline-none"
              />
            ) : (
              <h1 className="text-2xl font-bold">{desenho.modelo.nome}</h1>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusRotulo === "rascunho" ? "bg-[#FFF4DE] text-[#8A5A00]" : statusRotulo === "ativa" ? "bg-[#E8F5EE] text-[#2E7A55]" : "bg-slate-100 text-slate-600"}`}
            >
              Versão {desenho.modelo.versao} · {statusRotulo}
            </span>
          </div>
          <p className="text-sm text-[#5A6675]">
            {rotuloTipoProcesso(desenho.modelo.tipo_processo)}
            {ativa ? ` · Versão ${ativa.versao} ativa em ${ativa.em_andamento} ${ativa.em_andamento === 1 ? "processo" : "processos"} em andamento` : " · Nenhuma versão ativa ainda"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {etapas.length ? (
            <button type="button" onClick={() => setTestando((v) => !v)} aria-expanded={testando} className="rounded-lg border border-[#CBD3DA] bg-white px-4 py-2.5 text-sm font-medium text-slate-700">
              {testando ? "Fechar teste" : "Testar com processo fictício"}
            </button>
          ) : null}
          {editavel ? (
            <>
              <button type="button" onClick={salvar} disabled={!sujo || salvando} className="rounded-lg border border-[#CBD3DA] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">
                {sujo ? "Salvar rascunho" : "Rascunho salvo"}
              </button>
              <button type="button" onClick={ativar} disabled={salvando} className="rounded-lg bg-[#1B4A63] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {salvando ? "Aguarde…" : `Ativar versão ${desenho.modelo.versao}`}
              </button>
            </>
          ) : desenho.modelo.status === "PUBLICADO" ? (
            <button type="button" onClick={novaVersao} disabled={salvando} className="rounded-lg bg-[#1B4A63] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              Criar nova versão para alterar
            </button>
          ) : null}
        </div>
      </div>

      {!editavel ? (
        <p className="rounded-lg border border-[#E3E7EC] bg-[#F6F7F9] p-3 text-sm text-[#5A6675]">
          {desenho.modelo.status === "PUBLICADO"
            ? "Esta é a versão ativa: só leitura. Para alterar, crie uma nova versão — os processos em andamento continuam nesta até o fim."
            : "Versão substituída: só leitura. Os processos que começaram nela continuam nela até o fim."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="fluxo-tipo" className="text-sm font-semibold text-slate-700">
            Para qual tipo de processo
          </label>
          <select
            id="fluxo-tipo"
            value={tipoProcesso}
            onChange={(e) => {
              setTipoProcesso(e.target.value)
              setSujo(true)
            }}
            className="rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-sm"
          >
            <option value="">Sem tipo definido</option>
            {TIPOS_PROCESSO_FLUXO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
          {exigidas.size ? <span className="text-xs text-[#8A5A00]">Exige por lei: {[...exigidas].map((t) => porTipo.get(t)?.rotulo ?? t).join(" e ")}</span> : null}
        </div>
      )}

      {testando ? <SimulacaoFluxo etapas={etapas} catalogo={porTipo} opcoes={opcoes} modelos={modelos} onFechar={() => setTestando(false)} /> : null}

      {/* Paleta */}
      {editavel ? (
        <section className="flex flex-col gap-2.5 rounded-xl border border-[#E3E7EC] bg-white p-4" aria-labelledby="paleta">
          <p id="paleta" className="text-xs font-semibold uppercase tracking-wider text-[#5A6675]">
            Etapas disponíveis — arraste para o fluxo ou clique para incluir no fim
          </p>
          <div className="flex flex-wrap gap-2">
            {paleta.map((c) => (
              <button
                key={c.tipo}
                type="button"
                draggable
                title={c.descricao}
                onDragStart={(ev) => ev.dataTransfer.setData("text/x-etapa-tipo", c.tipo)}
                onClick={() => incluir(c.tipo, etapas.length)}
                className={`cursor-grab rounded-md px-3 py-1.5 text-[13px] ${c.grupo === "GERAL" ? "border border-dashed border-[#1B4A63] bg-[#EEF4F7] text-[#1B4A63]" : "border border-[#CBD3DA] bg-[#FAFBFC]"}`}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* O fluxo */}
      <section className="rounded-xl border border-[#E3E7EC] bg-white p-4" aria-label="Fluxo desenhado">
        {etapas.length === 0 ? (
          <div
            onDragOver={(ev) => editavel && ev.preventDefault()}
            onDrop={(ev) => {
              const tipo = ev.dataTransfer.getData("text/x-etapa-tipo")
              if (tipo) incluir(tipo, 0)
            }}
            className="rounded-lg border-2 border-dashed border-[#CBD3DA] p-8 text-center text-sm text-[#5A6675]"
          >
            {editavel ? "Arraste a primeira etapa para cá (ou clique numa etapa acima)." : "Este fluxo não tem etapas."}
          </div>
        ) : (
          <ol className="m-0 flex list-none flex-wrap items-center gap-y-4 p-0">
            {etapas.map((e, i) => (
              <li key={e.chave} className="flex items-center">
                <ZonaSoltar
                  ativa={arrastandoSobre === i}
                  primeira={i === 0}
                  editavel={editavel}
                  onSobre={() => setArrastandoSobre(i)}
                  onSair={() => setArrastandoSobre(null)}
                  onSoltar={(ev) => {
                    setArrastandoSobre(null)
                    const tipo = ev.dataTransfer.getData("text/x-etapa-tipo")
                    const chave = ev.dataTransfer.getData("text/x-etapa-chave")
                    if (tipo) incluir(tipo, i)
                    else if (chave) mover(chave, i)
                  }}
                />
                <button
                  type="button"
                  draggable={editavel}
                  onDragStart={(ev) => ev.dataTransfer.setData("text/x-etapa-chave", e.chave)}
                  onClick={() => setSelecionada(e.chave)}
                  aria-pressed={selecionada === e.chave}
                  className={`relative flex min-h-[76px] w-[150px] flex-col justify-center rounded-[10px] px-3 py-2 text-left text-[13px] leading-[17px] ${selecionada === e.chave ? "border-2 border-[#1B4A63] bg-[#E6EEF4] shadow-[0_0_0_4px_#E6EEF4]" : "border border-[#CBD3DA] bg-white"} ${editavel ? "cursor-grab" : ""}`}
                >
                  <b className="pr-3">{e.nome}</b>
                  <span className={`text-xs ${resumoResponsavel(e) === "Sem responsável" ? "text-[#8A5A00]" : "text-[#5A6675]"}`}>{resumoResponsavel(e)}</span>
                  {e.prazo_dias_uteis ? <span className="text-xs text-[#5A6675]">{e.prazo_dias_uteis} dias úteis</span> : null}
                  {travada(e) ? (
                    <span className="absolute right-1.5 top-1.5 text-[#8A5A00]" title="Obrigatória por lei">
                      <Lock className="h-3 w-3" aria-label="Obrigatória por lei" />
                    </span>
                  ) : null}
                </button>
                {i === etapas.length - 1 ? (
                  <ZonaSoltar
                    ativa={arrastandoSobre === etapas.length}
                    final
                    editavel={editavel}
                    onSobre={() => setArrastandoSobre(etapas.length)}
                    onSair={() => setArrastandoSobre(null)}
                    onSoltar={(ev) => {
                      setArrastandoSobre(null)
                      const tipo = ev.dataTransfer.getData("text/x-etapa-tipo")
                      const chave = ev.dataTransfer.getData("text/x-etapa-chave")
                      if (tipo) incluir(tipo, etapas.length)
                      else if (chave) mover(chave, etapas.length)
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-5">
        {/* Painel da etapa */}
        {etapa ? (
          <PainelEtapa
            key={etapa.chave}
            etapa={etapa}
            anteriores={etapas.slice(0, indice)}
            definicao={porTipo.get(etapa.tipo) ?? null}
            exigida={travada(etapa)}
            podeRemover={editavel && !(travada(etapa) && etapas.filter((x) => x.tipo === etapa.tipo).length === 1)}
            editavel={editavel}
            opcoes={opcoes}
            modelos={tipoDocumento ? modelos.get(tipoDocumento) ?? null : null}
            onAlterar={alterarEtapa}
            onMover={(d) => mover(etapa.chave, d < 0 ? indice - 1 : indice + 2)}
            primeira={indice === 0}
            ultima={indice === etapas.length - 1}
            onRemover={remover}
          />
        ) : null}

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          {editavel ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#E3E7EC] bg-white p-5">
              <h2 className="text-[15px] font-bold">Ao ativar a versão {desenho.modelo.versao}</h2>
              <p className="text-sm leading-relaxed text-slate-700">
                {ativa ? `Os ${ativa.em_andamento} processos em andamento continuam na versão ${ativa.versao} até o fim. ` : ""}Processos abertos depois seguem esta versão.
              </p>
              {sujo ? <p className="text-sm text-[#8A5A00]">Há alterações não salvas — elas são salvas antes de ativar.</p> : null}
              {desenho.pendencias_para_ativar.length ? (
                <div className="rounded-lg bg-[#FFF4DE] p-3 text-sm text-[#6B4700]">
                  <b>Antes de ativar:</b>
                  <ul className="mt-1 list-disc pl-5">
                    {desenho.pendencias_para_ativar.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                  {sujo ? <p className="mt-1 text-xs">(lista da última versão salva)</p> : null}
                </div>
              ) : !sujo ? (
                <p className="text-sm text-[#2E7A55]">Pronto para ativar.</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 rounded-xl border border-[#E3E7EC] bg-white p-5">
            <h2 className="text-[15px] font-bold">Versões</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {desenho.versoes.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <button type="button" className={`text-left ${v.id === desenho.modelo.id ? "font-semibold" : "text-[#1B4A63] hover:underline"}`} onClick={() => v.id !== desenho.modelo.id && onTrocarFluxo(v.id)}>
                    Versão {v.versao}
                  </button>
                  <span className="text-xs text-[#5A6675]">
                    {v.status === "RASCUNHO" ? "rascunho" : v.status === "PUBLICADO" ? "ativa" : "substituída"}
                    {v.em_andamento ? ` · ${v.em_andamento} em andamento` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function TIPOS_EXIGIDOS(tipoProcesso: string): string[] {
  return tipoProcesso === "CONTRATACAO" || tipoProcesso === "ADITIVO" || tipoProcesso === "RENOVACAO" ? ["PARECER_JURIDICO", "PUBLICACAO"] : []
}

function ZonaSoltar({
  ativa,
  primeira,
  final,
  editavel,
  onSobre,
  onSair,
  onSoltar,
}: {
  ativa: boolean
  primeira?: boolean
  final?: boolean
  editavel: boolean
  onSobre: () => void
  onSair: () => void
  onSoltar: (ev: React.DragEvent) => void
}) {
  const largura = primeira ? 10 : 44
  return (
    <div
      onDragOver={(ev) => {
        if (!editavel) return
        ev.preventDefault()
        onSobre()
      }}
      onDragLeave={onSair}
      onDrop={onSoltar}
      className="flex h-[76px] items-center justify-center"
      style={{ width: final ? 36 : largura }}
      aria-hidden="true"
    >
      {ativa ? (
        <span className="h-[60px] w-1 rounded bg-[#1B4A63]" />
      ) : primeira || final ? null : (
        <svg width="36" height="10" viewBox="0 0 36 10" className="text-[#7C8794]">
          <path d="M1 5 H29" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M28 1 L35 5 L28 9 Z" fill="currentColor" />
        </svg>
      )}
    </div>
  )
}

function PainelEtapa({
  etapa,
  anteriores,
  definicao,
  exigida,
  podeRemover,
  editavel,
  opcoes,
  modelos,
  onAlterar,
  onMover,
  primeira,
  ultima,
  onRemover,
}: {
  etapa: EtapaDesenho
  anteriores: EtapaDesenho[]
  definicao: ItemCatalogo | null
  exigida: boolean
  podeRemover: boolean
  editavel: boolean
  opcoes: OpcoesDesenho
  modelos: Array<{ id: string; nome: string; do_orgao: boolean }> | null
  onAlterar: (p: Partial<EtapaDesenho>) => void
  onMover: (direcao: -1 | 1) => void
  primeira: boolean
  ultima: boolean
  onRemover: () => void
}) {
  const automatico = !!definicao?.automatico
  const avisos: Avisos = etapa.avisos ?? { canais: [], chegada: true, vespera_prazo: false, teams_canal_id: null }
  const notificar: Notificar = etapa.notificar ?? { destinatarios: [], canais: [], mensagem: "", teams_canal_id: null }
  const lista = etapa.responsavel_tipo === "SETOR" ? opcoes.setores : etapa.responsavel_tipo === "USUARIO" ? opcoes.usuarios : []
  const campo = "rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-[15px] disabled:bg-slate-50"
  const rotulo = "text-[13px] font-semibold text-slate-700"

  const alternarCanalAviso = (c: Canal) => {
    const canais = avisos.canais.includes(c) ? avisos.canais.filter((x) => x !== c) : [...avisos.canais, c]
    onAlterar({ avisos: { ...avisos, canais, teams_canal_id: canais.includes("TEAMS") ? avisos.teams_canal_id ?? opcoes.teams[0]?.id ?? null : null } })
  }
  const alternarCanalNotificar = (c: Canal) => {
    const canais = notificar.canais.includes(c) ? notificar.canais.filter((x) => x !== c) : [...notificar.canais, c]
    onAlterar({ notificar: { ...notificar, canais, teams_canal_id: canais.includes("TEAMS") ? notificar.teams_canal_id ?? opcoes.teams[0]?.id ?? null : null } })
  }

  return (
    <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-xl border-2 border-[#1B4A63] bg-white p-5" aria-labelledby="etapa-selecionada">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1B4A63]">Etapa selecionada · {definicao?.rotulo ?? etapa.tipo}</p>
          <h2 id="etapa-selecionada" className="text-lg font-bold">
            {etapa.nome}
          </h2>
        </div>
        {editavel ? (
          <div className="flex gap-1.5">
            <button type="button" aria-label="Mover para a esquerda" onClick={() => onMover(-1)} disabled={primeira} className="rounded-md border border-[#CBD3DA] p-2 disabled:opacity-40">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Mover para a direita" onClick={() => onMover(1)} disabled={ultima} className="rounded-md border border-[#CBD3DA] p-2 disabled:opacity-40">
              <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={onRemover} disabled={!podeRemover} title={podeRemover ? "Remover etapa" : "Obrigatória por lei: não pode ser removida"} className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-40">
              <Trash2 className="h-4 w-4" aria-hidden="true" />Remover
            </button>
          </div>
        ) : null}
      </div>

      {exigida && definicao?.obrigatoria_lei ? (
        <div className="flex gap-2.5 rounded-lg bg-[#FFF4DE] p-3 text-[13px] leading-relaxed text-[#6B4700]">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Obrigatória pela {definicao.obrigatoria_lei.fundamento}. Não pode ser removida do fluxo
            {definicao.obrigatoria_lei.dispensa ? `; a dispensa só ocorre nas ${definicao.obrigatoria_lei.dispensa.charAt(0).toLowerCase()}${definicao.obrigatoria_lei.dispensa.slice(1)}` : "."}
          </span>
        </div>
      ) : null}

      <fieldset disabled={!editavel} className="m-0 flex flex-col gap-4 border-0 p-0">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="etapa-nome" className={rotulo}>
              Nome da etapa
            </label>
            <input id="etapa-nome" className={campo} value={etapa.nome} maxLength={160} onChange={(e) => onAlterar({ nome: e.target.value })} />
          </div>
          {!automatico ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="etapa-prazo" className={rotulo}>
                Prazo
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="etapa-prazo"
                  type="number"
                  min={0}
                  max={365}
                  className={`${campo} w-20`}
                  value={etapa.prazo_dias_uteis ?? ""}
                  onChange={(e) => onAlterar({ prazo_dias_uteis: e.target.value === "" ? null : Math.max(0, Math.min(365, Math.trunc(Number(e.target.value)))) })}
                />
                <span className="text-sm text-slate-600">dias úteis</span>
              </div>
            </div>
          ) : null}
          {!automatico ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="etapa-resp-tipo" className={rotulo}>
                Responsável
              </label>
              <select id="etapa-resp-tipo" className={campo} value={etapa.responsavel_tipo} onChange={(e) => onAlterar({ responsavel_tipo: e.target.value as TipoResponsavel, responsaveis: [] })}>
                <option value="SETOR">Um ou mais setores</option>
                <option value="USUARIO">Uma ou mais pessoas</option>
                <option value="SOLICITANTE">Quem abriu o processo</option>
              </select>
            </div>
          ) : null}
          {!automatico && anteriores.length ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="etapa-devolve" className={rotulo}>
                Se houver ressalva, devolve para
              </label>
              <select id="etapa-devolve" className={campo} value={etapa.devolver_para ?? ""} onChange={(e) => onAlterar({ devolver_para: e.target.value || null })}>
                <option value="">Etapa anterior ({anteriores[anteriores.length - 1].nome})</option>
                {anteriores.slice(0, -1).map((a) => (
                  <option key={a.chave} value={a.chave}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {!automatico && etapa.responsavel_tipo !== "SOLICITANTE" ? (
          <div className="flex flex-col gap-1.5">
            <span className={rotulo}>{etapa.responsavel_tipo === "SETOR" ? "Setores responsáveis" : "Pessoas responsáveis"}</span>
            {lista.length ? (
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-lg border border-[#E3E7EC] p-2">
                {lista.map((x) => {
                  const marcado = etapa.responsaveis.includes(x.id)
                  return (
                    <label key={x.id} htmlFor={`resp-${x.id}`} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${marcado ? "border-[#1B4A63] bg-[#E6EEF4]" : "border-[#E3E7EC]"}`}>
                      <input
                        id={`resp-${x.id}`}
                        type="checkbox"
                        checked={marcado}
                        onChange={() => onAlterar({ responsaveis: marcado ? etapa.responsaveis.filter((r) => r !== x.id) : [...etapa.responsaveis, x.id] })}
                        className="accent-[#1B4A63]"
                      />
                      {x.nome}
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-[#5A6675]">Nenhum {etapa.responsavel_tipo === "SETOR" ? "setor" : "usuário"} cadastrado no órgão.</p>
            )}
          </div>
        ) : null}

        {definicao?.tipo_documento ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="etapa-modelo" className={rotulo}>
              Documento produzido
            </label>
            <select id="etapa-modelo" className={campo} value={etapa.modelo_documento_id ?? ""} onChange={(e) => onAlterar({ modelo_documento_id: e.target.value || null })} disabled={modelos === null}>
              <option value="">{modelos === null ? "Carregando modelos..." : "Modelo padrão (o mais recente do órgão ou do sistema)"}</option>
              {(modelos ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                  {m.do_orgao ? " — do órgão" : " — do sistema"}
                </option>
              ))}
            </select>
            <span className="text-xs text-[#5A6675]">Os modelos ficam em Configurações › Modelos de documento. O editor da etapa já abre com o escolhido.</span>
          </div>
        ) : null}

        {definicao?.documento.produz ? (
          <label htmlFor="etapa-externo" className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input id="etapa-externo" type="checkbox" checked={etapa.aceita_documento_externo} onChange={(e) => onAlterar({ aceita_documento_externo: e.target.checked })} className="h-[18px] w-[18px] accent-[#1B4A63]" />
            Aceitar documento feito fora do sistema (anexar PDF pronto)
          </label>
        ) : null}

        {automatico ? (
          <div className="flex flex-col gap-3 border-t border-[#E3E7EC] pt-4">
            <p className="text-[13px] font-semibold text-slate-700">Quem recebe o aviso</p>
            <Destinatarios notificar={notificar} opcoes={opcoes} onAlterar={(n) => onAlterar({ notificar: n })} />
            <Canais canais={notificar.canais} teamsCanalId={notificar.teams_canal_id ?? null} opcoes={opcoes} onAlternar={alternarCanalNotificar} onCanalTeams={(id) => onAlterar({ notificar: { ...notificar, teams_canal_id: id } })} />
            <label htmlFor="notificar-msg" className={rotulo}>
              Mensagem
            </label>
            <textarea id="notificar-msg" className={campo} rows={3} maxLength={1000} value={notificar.mensagem} onChange={(e) => onAlterar({ notificar: { ...notificar, mensagem: e.target.value } })} placeholder="Ex.: A contratação foi publicada no PNCP." />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 border-t border-[#E3E7EC] pt-4">
            <p className="text-[13px] font-semibold text-slate-700">Avisos desta etapa</p>
            <Canais canais={avisos.canais} teamsCanalId={avisos.teams_canal_id ?? null} opcoes={opcoes} onAlternar={alternarCanalAviso} onCanalTeams={(id) => onAlterar({ avisos: { ...avisos, teams_canal_id: id } })} />
            {avisos.canais.length ? (
              <div className="flex flex-wrap gap-4 text-sm">
                <label htmlFor="aviso-chegada" className="flex items-center gap-2">
                  <input id="aviso-chegada" type="checkbox" checked={avisos.chegada} onChange={(e) => onAlterar({ avisos: { ...avisos, chegada: e.target.checked } })} className="accent-[#1B4A63]" />
                  Quando o processo chegar
                </label>
                <label htmlFor="aviso-vespera" className="flex items-center gap-2">
                  <input id="aviso-vespera" type="checkbox" checked={avisos.vespera_prazo} onChange={(e) => onAlterar({ avisos: { ...avisos, vespera_prazo: e.target.checked } })} className="accent-[#1B4A63]" />
                  1 dia útil antes do prazo
                </label>
              </div>
            ) : (
              <p className="text-xs text-[#5A6675]">Sem aviso: marque um canal para avisar o responsável.</p>
            )}
          </div>
        )}
      </fieldset>
    </section>
  )
}

function Canais({
  canais,
  teamsCanalId,
  opcoes,
  onAlternar,
  onCanalTeams,
}: {
  canais: Canal[]
  teamsCanalId: string | null
  opcoes: OpcoesDesenho
  onAlternar: (c: Canal) => void
  onCanalTeams: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CANAIS.map((c) => {
        const semTeams = c.valor === "TEAMS" && !opcoes.teams.length
        return (
          <label
            key={c.valor}
            htmlFor={`canal-${c.valor}`}
            title={semTeams ? "Cadastre um canal do Teams em Fluxos de processo › Canais de aviso" : undefined}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${canais.includes(c.valor) ? "border-[#C9DCE5] bg-[#EEF4F7]" : "border-[#E3E7EC]"} ${semTeams ? "opacity-50" : "cursor-pointer"}`}
          >
            <input id={`canal-${c.valor}`} type="checkbox" disabled={semTeams} checked={canais.includes(c.valor)} onChange={() => onAlternar(c.valor)} className="accent-[#1B4A63]" />
            {c.rotulo}
          </label>
        )
      })}
      {canais.includes("TEAMS") ? (
        <select aria-label="Canal do Teams" value={teamsCanalId ?? ""} onChange={(e) => onCanalTeams(e.target.value)} className="rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-sm">
          {opcoes.teams.map((t) => (
            <option key={t.id} value={t.id}>
              Teams · {t.nome}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}

function Destinatarios({ notificar, opcoes, onAlterar }: { notificar: Notificar; opcoes: OpcoesDesenho; onAlterar: (n: Notificar) => void }) {
  const [tipo, setTipo] = useState<TipoResponsavel>("SETOR")
  const [id, setId] = useState("")
  const nome = (d: { tipo: TipoResponsavel; id?: string }) =>
    d.tipo === "SOLICITANTE" ? "Quem abriu o processo" : (d.tipo === "SETOR" ? opcoes.setores : opcoes.usuarios).find((x) => x.id === d.id)?.nome ?? "—"
  function adicionar() {
    if (tipo !== "SOLICITANTE" && !id) return
    if (notificar.destinatarios.some((d) => d.tipo === tipo && (tipo === "SOLICITANTE" || d.id === id))) return
    onAlterar({ ...notificar, destinatarios: [...notificar.destinatarios, tipo === "SOLICITANTE" ? { tipo } : { tipo, id }] })
    setId("")
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {notificar.destinatarios.map((d, i) => (
          <span key={`${d.tipo}-${d.id ?? i}`} className="flex items-center gap-1.5 rounded-full bg-[#E6EEF4] px-3 py-1 text-sm text-[#1B4A63]">
            {nome(d)}
            <button type="button" aria-label={`Tirar ${nome(d)}`} onClick={() => onAlterar({ ...notificar, destinatarios: notificar.destinatarios.filter((_, j) => j !== i) })} className="text-[#1B4A63]">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Tipo de destinatário" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoResponsavel); setId("") }} className="rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-sm">
          <option value="SETOR">Setor</option>
          <option value="USUARIO">Pessoa</option>
          <option value="SOLICITANTE">Quem abriu o processo</option>
        </select>
        {tipo !== "SOLICITANTE" ? (
          <select aria-label="Destinatário" value={id} onChange={(e) => setId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#CBD3DA] bg-white px-3 py-2 text-sm">
            <option value="">Escolha</option>
            {(tipo === "SETOR" ? opcoes.setores : opcoes.usuarios).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" onClick={adicionar} className="rounded-lg border border-[#CBD3DA] px-3 py-2 text-sm">
          Incluir
        </button>
      </div>
    </div>
  )
}
