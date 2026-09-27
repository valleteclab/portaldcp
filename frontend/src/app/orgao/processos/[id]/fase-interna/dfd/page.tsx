"use client"

/**
 * ETAPA 1 — DOCUMENTO DE FORMALIZAÇÃO DA DEMANDA (Entrega 3A; mockup DFD.dc.html).
 * Necessidade, itens e quantidades com CATMAT/CATSER, prazo, unidade
 * requisitante, responsável e vínculo ao item do PCA (ou justificativa de
 * ausência — art. 12, §1º). Listas das tabelas do órgão (setores, usuários,
 * PCA, catálogo), sem digitação livre. Autosave em rascunho; "Gerar DFD"
 * monta a peça pelo modelo; ou "Anexar DFD feito fora".
 * API: GET/PUT /api/fase-interna/:id/dfd, POST /documentos/DFD/gerar.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, FileText, Loader2, Package, Sparkles } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { PERMISSAO_LIVRE, type PermissaoTrabalho } from "@/lib/fase-interna/permissao-etapa"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { EditorItensDialog } from "@/components/fase-interna/etapas/EditorItensDialog"
import { RascunhoIaFaixa } from "@/components/fase-interna/etapas/RascunhoIaFaixa"
import { criarUltimaCarga, erroDaApi, rotaDaTela } from "@/lib/fase-interna/telas"

const SecaoEditor = dynamic(() => import("@/components/editor/SecaoEditor").then((m) => ({ default: m.SecaoEditor })), {
  ssr: false,
  loading: () => <div className="h-24 rounded-lg border bg-gray-50 animate-pulse" />,
})

interface DfdTela {
  licitacao: { id: string; numero_processo: string; objeto: string; fase_interna: boolean; item_pca_id: string | null; sem_pca: boolean; justificativa_sem_pca: string | null }
  peca: { documento_id: string; tem_arquivo: boolean; origem: string; anexada: boolean; pdf_gerado_em: string | null } | null
  secoes: Record<string, string>
  campos: {
    unidade_requisitante_id: string | null
    responsavel_id: string | null
    fiscal_sugerido_id: string | null
    data_pretendida: string | null
    prioridade: string | null
  }
  itens: Array<{ id: string; numero_item: number; descricao: string; unidade: string; quantidade: number; codigo: string | null; catalogo: string | null }>
  demanda: { unidade_requisitante: string; responsavel_nome: string | null } | null
  checklist: Array<{ chave: string; ok: boolean; texto: string; atencao?: boolean }>
  opcoes: {
    setores: Array<{ id: string; nome: string }>
    usuarios: Array<{ id: string; nome: string; cargo: string | null }>
    itens_pca: Array<{ id: string; numero_item: number; descricao_objeto: string; ano: number }>
    prioridades: string[]
  }
}

const ROTULO_PRIORIDADE: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" }
const selectCls = "w-full h-9 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"

export default function DfdPage() {
  const { id } = useParams() as { id: string }
  // Isolamento das peças: a permissão de quem vê nesta etapa (EtapaShell)
  const [perm, setPerm] = useState<PermissaoTrabalho>(PERMISSAO_LIVRE)
  const [d, setD] = useState<DfdTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<"idle" | "salvando" | "salvo" | "erro">("idle")
  const [gerando, setGerando] = useState(false)
  const [editarItens, setEditarItens] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)
  // O editor da necessidade só lê o valor ao montar: o aceite do rascunho da IA remonta
  const [editorChave, setEditorChave] = useState(0)
  const [objeto, setObjeto] = useState("")
  const [justSemPca, setJustSemPca] = useState("")
  // "Não consta do PCA" marcado e ainda sem justificativa gravada: fica marcado na tela
  // (o servidor só grava com a justificativa) — antes qualquer autosave/recarga desmarcava
  const [semPcaLocal, setSemPcaLocal] = useState(false)
  // Texto digitado e ainda não gravado não é sobrescrito por recarga
  const objetoSujo = useRef(false)
  const justSujo = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const necessidadePendente = useRef<string | null>(null)
  // Respostas fora de ordem (autosave × seleção × recarga) não voltam a tela para um estado velho
  const ultima = useRef(criarUltimaCarga()).current

  const aplicar = useCallback((j: DfdTela) => {
    setD(j)
    if (!objetoSujo.current) setObjeto(j.licitacao.objeto || "")
    if (!justSujo.current) setJustSemPca(j.licitacao.justificativa_sem_pca || "")
    if (j.licitacao.sem_pca || j.licitacao.item_pca_id) setSemPcaLocal(false)
  }, [])

  const carregar = useCallback(async () => {
    const vale = ultima()
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/dfd`)
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = (await r.json()) as DfdTela
      if (vale()) aplicar(j)
    } catch (e) {
      if (vale()) setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id, ultima, aplicar])
  useEffect(() => {
    carregar()
  }, [carregar])

  const salvar = useCallback(
    async (corpo: Record<string, unknown>) => {
      setSalvando("salvando")
      const vale = ultima()
      try {
        const r = await authFetch(`${API_URL}/api/fase-interna/${id}/dfd`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        })
        if (!r.ok) throw new Error(await erroDaApi(r))
        const j = (await r.json()) as DfdTela
        if ("objeto" in corpo) objetoSujo.current = false
        if ("justificativa_sem_pca" in corpo || "sem_pca" in corpo) justSujo.current = false
        if (vale()) aplicar(j)
        setSalvando("salvo")
        setAtualizacao((n) => n + 1)
      } catch (e) {
        setSalvando("erro")
        toast.error(e instanceof Error ? e.message : String(e))
      }
    },
    [id, ultima, aplicar],
  )

  const salvarNecessidade = (html: string) => {
    if (timer.current) clearTimeout(timer.current)
    setSalvando("idle")
    necessidadePendente.current = html
    timer.current = setTimeout(() => {
      necessidadePendente.current = null
      salvar({ necessidade_html: html })
    }, 900)
  }

  // Saiu da tela com a necessidade digitada há menos de 1 s: grava assim mesmo
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    const html = necessidadePendente.current
    if (html !== null) {
      authFetch(`${API_URL}/api/fase-interna/${id}/dfd`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ necessidade_html: html }),
        keepalive: true,
      }).catch(() => undefined)
    }
  }, [id])

  const gerar = async () => {
    setGerando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/documentos/DFD/gerar`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success("DFD gerado pelo modelo (PDF). Confira e, se for o caso, envie para assinatura.")
      await carregar()
      setAtualizacao((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setGerando(false)
    }
  }

  if (erro) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-600 mb-2" aria-hidden="true" />
        <p>{erro}</p>
        <Link href={`/orgao/processos/${id}`} className="text-blue-800 hover:underline text-sm">Voltar ao processo</Link>
      </div>
    )
  }
  if (!d) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando o DFD" />
      </div>
    )
  }

  const bloqueada = !d.licitacao.fase_interna || !perm.pode
  const semPca = d.licitacao.sem_pca || semPcaLocal
  const itemPcaSel = d.licitacao.item_pca_id ?? ""

  return (
    <EtapaShell
      onPermissao={setPerm}
      licitacaoId={id}
      tela="dfd"
      titulo="Documento de Formalização da Demanda"
      subtitulo={
        <span>
          Art. 12, VII e §1º, e art. 18, I, da Lei 14.133/2021 ·{" "}
          {salvando === "salvando" ? "salvando…" : salvando === "salvo" ? "rascunho salvo automaticamente" : salvando === "erro" ? "erro ao salvar" : "rascunho salvo automaticamente"}
        </span>
      }
      atualizacao={atualizacao}
      acoes={
        <>
          <Button onClick={gerar} disabled={gerando || bloqueada} title="Monta o DFD pelo modelo com os dados desta tela e gera o PDF">
            {gerando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} Gerar DFD
          </Button>
          <Button asChild variant="outline">
            <Link href={rotaDaTela(id, "etp")}>
              <Sparkles className="w-4 h-4 mr-1" /> Ir ao ETP (rascunho com IA)
            </Link>
          </Button>
        </>
      }
    >
      <CaminhosDaPeca licitacaoId={id} tipo="DFD" titulo="DFD" fazerAqui="preencher e gerar o DFD" atualizacao={atualizacao} onAtualizado={() => { carregar(); setAtualizacao((n) => n + 1) }} />
      <RascunhoIaFaixa
        licitacaoId={id}
        peca="DFD"
        somenteLeitura={bloqueada}
        atualizacao={atualizacao}
        explicacaoAceite="Aceitar preenche a necessidade só se ela estiver vazia. A lista de quantidades, o PCA e a data o sistema monta dos itens e dos campos desta tela."
        onAceito={async () => {
          if (timer.current) clearTimeout(timer.current)
          necessidadePendente.current = null
          await carregar()
          setEditorChave((n) => n + 1)
          setAtualizacao((n) => n + 1)
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          <section className="rounded-lg border bg-white p-4 space-y-4" aria-label="Dados da demanda">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="dfd-unidade">Unidade requisitante</Label>
                <select
                  id="dfd-unidade"
                  className={selectCls}
                  disabled={bloqueada}
                  value={d.campos.unidade_requisitante_id ?? ""}
                  onChange={(e) => salvar({ unidade_requisitante_id: e.target.value || null })}
                >
                  <option value="">Selecione…</option>
                  {d.opcoes.setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
                {!d.opcoes.setores.length && (
                  <p className="text-xs text-amber-800">
                    Nenhum setor cadastrado. Cadastre em <Link className="underline" href="/orgao/configuracoes">Configurações</Link>.
                  </p>
                )}
                {d.demanda && <p className="text-xs text-gray-600">Demanda de origem: {d.demanda.unidade_requisitante}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="dfd-responsavel">Responsável pela demanda</Label>
                <select id="dfd-responsavel" className={selectCls} disabled={bloqueada} value={d.campos.responsavel_id ?? ""} onChange={(e) => salvar({ responsavel_id: e.target.value || null })}>
                  <option value="">Selecione…</option>
                  {d.opcoes.usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}{u.cargo ? ` — ${u.cargo}` : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="dfd-pca">Item do Plano de Contratações Anual</Label>
              <select
                id="dfd-pca"
                className={selectCls}
                disabled={bloqueada || semPca}
                value={itemPcaSel}
                onChange={(e) => salvar({ item_pca_id: e.target.value || null })}
              >
                <option value="">{d.opcoes.itens_pca.length ? "Selecione o item do PCA…" : "Nenhum item de PCA cadastrado"}</option>
                {d.opcoes.itens_pca.map((i) => (
                  <option key={i.id} value={i.id}>
                    PCA {i.ano} · item {i.numero_item} — {i.descricao_objeto.length > 90 ? `${i.descricao_objeto.slice(0, 87)}…` : i.descricao_objeto}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm mt-1">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  disabled={bloqueada}
                  checked={semPca}
                  onChange={(e) => {
                    if (e.target.checked) {
                      // só grava com a justificativa (art. 12, §1º); até lá fica marcado aqui
                      setSemPcaLocal(true)
                      setD({ ...d, licitacao: { ...d.licitacao, item_pca_id: null } })
                    } else {
                      setSemPcaLocal(false)
                      justSujo.current = false
                      if (d.licitacao.sem_pca) salvar({ sem_pca: false, item_pca_id: null })
                    }
                  }}
                />
                A contratação não consta do PCA
              </label>
              {semPca && (
                <div className="space-y-1">
                  <Label htmlFor="dfd-just-pca">Justificativa (art. 12, §1º)</Label>
                  <Textarea
                    id="dfd-just-pca"
                    rows={2}
                    value={justSemPca}
                    disabled={bloqueada}
                    onChange={(e) => { justSujo.current = true; setJustSemPca(e.target.value) }}
                    onBlur={() => justSemPca.trim().length >= 10 && salvar({ sem_pca: true, justificativa_sem_pca: justSemPca })}
                    placeholder="Por que a contratação não foi prevista no plano anual?"
                  />
                  {justSemPca.trim().length > 0 && justSemPca.trim().length < 10 && <p className="text-xs text-amber-800">Descreva o motivo (mínimo 10 caracteres).</p>}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="dfd-objeto">Objeto</Label>
              <Textarea
                id="dfd-objeto"
                rows={2}
                value={objeto}
                disabled={bloqueada}
                onChange={(e) => { objetoSujo.current = true; setObjeto(e.target.value) }}
                onBlur={() => {
                  if (objeto.trim() && objeto.trim() !== d.licitacao.objeto) salvar({ objeto: objeto.trim() })
                  else objetoSujo.current = false
                }}
              />
              <p className="text-xs text-gray-600">Descreva a função, não o produto: evite marcas e modelos (art. 41, I).</p>
            </div>

            <div className="space-y-1">
              <Label>Por que o órgão precisa disso? (necessidade)</Label>
              <SecaoEditor
                key={editorChave}
                value={d.secoes.demanda || ""}
                onChange={salvarNecessidade}
                readOnly={bloqueada}
                placeholder="Descreva o problema ou a demanda institucional que justifica a contratação…"
              />
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Itens e quantidades">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900">Itens e quantidades</h2>
              <Button size="sm" variant="outline" disabled={bloqueada} onClick={() => setEditarItens(true)}>
                <Package className="w-4 h-4 mr-1" /> {d.itens.length ? "Editar itens (catálogo)" : "Adicionar itens"}
              </Button>
            </div>
            {d.itens.length ? (
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-700">
                    <tr>
                      <th scope="col" className="text-left px-3 py-2">Item</th>
                      <th scope="col" className="text-left px-3 py-2">Descrição</th>
                      <th scope="col" className="text-left px-3 py-2">Unidade</th>
                      <th scope="col" className="text-right px-3 py-2">Qtde</th>
                      <th scope="col" className="text-left px-3 py-2">CATMAT/CATSER</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.itens.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{String(i.numero_item).padStart(2, "0")}</td>
                        <td className="px-3 py-2">{i.descricao}</td>
                        <td className="px-3 py-2">{i.unidade}</td>
                        <td className="px-3 py-2 text-right">{i.quantidade.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2">
                          {i.codigo ? (
                            <span className="text-xs">{i.catalogo} {i.codigo}</span>
                          ) : (
                            <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">sem código</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Nenhum item. Adicione pelo catálogo (CATMAT para bens, CATSER para serviços).</p>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4 grid gap-4 sm:grid-cols-3" aria-label="Prazo e responsáveis">
            <div className="space-y-1">
              <Label htmlFor="dfd-data">Data pretendida</Label>
              <Input
                id="dfd-data"
                type="date"
                disabled={bloqueada}
                defaultValue={d.campos.data_pretendida ?? ""}
                key={d.campos.data_pretendida ?? "vazia"}
                onBlur={(e) => e.target.value !== (d.campos.data_pretendida ?? "") && salvar({ data_pretendida: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dfd-prioridade">Prioridade</Label>
              <select id="dfd-prioridade" className={selectCls} disabled={bloqueada} value={d.campos.prioridade ?? ""} onChange={(e) => salvar({ prioridade: e.target.value || null })}>
                <option value="">Selecione…</option>
                {d.opcoes.prioridades.map((p) => (
                  <option key={p} value={p}>{ROTULO_PRIORIDADE[p] ?? p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dfd-fiscal">Fiscal sugerido</Label>
              <select id="dfd-fiscal" className={selectCls} disabled={bloqueada} value={d.campos.fiscal_sugerido_id ?? ""} onChange={(e) => salvar({ fiscal_sugerido_id: e.target.value || null })}>
                <option value="">Selecione…</option>
                {d.opcoes.usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
          </section>
        </div>

        <aside className="space-y-4" aria-label="Antes de enviar">
          <section className="rounded-lg border bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Antes de gerar</h2>
            <ul className="space-y-1.5 text-sm">
              {d.checklist.map((c) => (
                <li key={c.chave} className="flex items-start gap-2">
                  {c.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0 mt-0.5" aria-label="ok" />
                  ) : (
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${c.atencao ? "text-amber-600" : "text-orange-700"}`} aria-label="pendente" />
                  )}
                  <span className={c.ok ? "text-gray-800" : "text-gray-900"}>{c.texto}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border bg-slate-50 p-4 space-y-1 text-sm text-gray-700">
            <h2 className="text-sm font-semibold text-gray-900">Encaminhamento</h2>
            <p>
              Gerado o DFD (ou anexado o feito fora), a etapa conclui sozinha e nascem as tarefas do estudo técnico, do termo de referência e da pesquisa
              de preços. Para colher assinaturas, use &quot;Enviar para assinatura&quot; acima.
            </p>
            {d.peca?.tem_arquivo && d.peca.pdf_gerado_em && <p className="text-xs text-gray-600">PDF gerado pelo modelo.</p>}
          </section>
        </aside>
      </div>

      <EditorItensDialog
        licitacaoId={id}
        aberto={editarItens}
        onFechar={() => setEditarItens(false)}
        onSalvo={() => {
          setEditarItens(false)
          carregar()
          setAtualizacao((n) => n + 1)
        }}
      />
    </EtapaShell>
  )
}
