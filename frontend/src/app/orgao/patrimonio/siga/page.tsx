"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, AlertTriangle, Send, FileMinus, Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import ConfiguracaoSiga from "@/components/siga/ConfiguracaoSiga"
import { baixarArquivoSiga, ConfigSiga } from "@/services/siga.service"
import {
  abrirPdf,
  BemSiga,
  listarCategorias,
  listarSetores,
  PendenciaSigaBem,
  ResumoSigaPatrimonio,
  sigaPatrimonio,
} from "@/services/patrimonio.service"

const TIPOS_SIGA: Record<number, string> = {
  1: "Móveis, utensílios e mobiliários",
  2: "Máquinas, motores e geradores",
  3: "Equipamentos, instrumentos e ferramentas",
  4: "Semoventes",
  5: "Biblioteca",
  6: "Imóveis",
  7: "Diversos bens móveis e objetos de arte",
  8: "Natureza industrial",
  9: "Veículos",
}

const SEM_SETOR = "SEM_SETOR"
const dataBR = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—")
const moeda = (v: any) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
const mascaraCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2")
}

type Mensagem = { tipo: "ok" | "erro"; texto: string } | null

function Aviso({ msg }: { msg: Mensagem }) {
  if (!msg) return null
  return <p className={`text-sm ${msg.tipo === "ok" ? "text-green-700" : "text-red-600"}`}>{msg.texto}</p>
}

function SelectTipo({ value, onChange, placeholder = "Sem tipo" }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <Select value={value ? String(value) : "none"} onValueChange={(v) => onChange(v === "none" ? null : Number(v))}>
      <SelectTrigger className="h-8 w-[260px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {Object.entries(TIPOS_SIGA).map(([k, v]) => (
          <SelectItem key={k} value={k}>{k} - {v}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function PatrimonioSigaPage() {
  const [config, setConfig] = useState<ConfigSiga | null>(null)
  const [resumo, setResumo] = useState<ResumoSigaPatrimonio | null>(null)
  const [erroResumo, setErroResumo] = useState("")

  const carregarResumo = useCallback(() => {
    sigaPatrimonio.resumo().then((r) => { setResumo(r); setErroResumo("") }).catch((e) => setErroResumo(e.message))
  }, [])

  useEffect(() => { carregarResumo() }, [carregarResumo])

  const configPendente = !config || config.pendencias.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orgao/patrimonio"><Button variant="ghost" size="icon" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">SIGA (TCM-BA)</h1>
          <p className="text-muted-foreground">Arquivo de bens patrimoniais para importar no SIGA Captura e inventário anual para o e-TCM</p>
        </div>
      </div>

      <ConfiguracaoSiga onChange={(c) => { setConfig(c); carregarResumo() }} />

      {erroResumo && <p className="text-sm text-red-600">{erroResumo}</p>}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CardResumo titulo="Prontos para o arquivo" valor={resumo.prontos} icone={<CheckCircle2 className="h-5 w-5 text-green-600" />} />
          <CardResumo titulo="Com pendência" valor={resumo.com_pendencia} icone={<AlertTriangle className="h-5 w-5 text-amber-600" />} />
          <CardResumo titulo="Já enviados ao SIGA" valor={resumo.enviados} icone={<Send className="h-5 w-5 text-blue-600" />} />
          <CardResumo titulo="Baixas a lançar" valor={resumo.baixas_a_lancar} icone={<FileMinus className="h-5 w-5 text-red-600" />} />
        </div>
      )}

      <SecaoTipo onAlterado={carregarResumo} />
      <SecaoResponsavel onAlterado={carregarResumo} />
      <SecaoPendencias resumo={resumo} />
      <SecaoArquivo resumo={resumo} configPendente={configPendente} onEnviado={carregarResumo} />
      <SecaoBaixas onAlterado={carregarResumo} />
      <SecaoInventario />
    </div>
  )
}

function CardResumo({ titulo, valor, icone }: { titulo: string; valor: number; icone: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <p className="text-2xl font-bold">{valor.toLocaleString("pt-BR")}</p>
        </div>
        {icone}
      </CardContent>
    </Card>
  )
}

// ─── Tipo SIGA ─────────────────────────────────────────────────────

function SecaoTipo({ onAlterado }: { onAlterado: () => void }) {
  const [categorias, setCategorias] = useState<{ id: string; nome: string; sistema: boolean; siga_tipo_bem: number | null }[]>([])
  const [dados, setDados] = useState<Awaited<ReturnType<typeof sigaPatrimonio.sugestoes>> | null>(null)
  const [pagina, setPagina] = useState(1)
  const [filtro, setFiltro] = useState<"com" | "sem" | "todos">("com")
  const [escolhas, setEscolhas] = useState<Record<string, number | null>>({})
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)
  const [msg, setMsg] = useState<Mensagem>(null)

  const carregar = useCallback(() => {
    const com = filtro === "com" ? true : filtro === "sem" ? false : undefined
    sigaPatrimonio.sugestoes(pagina, com).then((d) => {
      setDados(d)
      setEscolhas(Object.fromEntries(d.itens.map((i) => [i.id, i.sugestao])))
      setSelecionados(new Set(d.itens.filter((i) => i.sugestao).map((i) => i.id)))
    }).catch((e) => setMsg({ tipo: "erro", texto: e.message }))
  }, [pagina, filtro])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { listarCategorias().then(setCategorias).catch(() => setCategorias([])) }, [])

  async function salvarCategoria(id: string, tipo: number | null) {
    setMsg(null)
    try {
      await sigaPatrimonio.classificarCategoria(id, tipo)
      setCategorias((cs) => cs.map((c) => (c.id === id ? { ...c, siga_tipo_bem: tipo } : c)))
      setMsg({ tipo: "ok", texto: "Tipo da categoria salvo." })
      carregar()
      onAlterado()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao salvar." })
    }
  }

  async function aplicar() {
    const itens = [...selecionados].filter((id) => escolhas[id]).map((id) => ({ bem_id: id, siga_tipo_bem: escolhas[id] }))
    if (!itens.length) { setMsg({ tipo: "erro", texto: "Selecione bens com um tipo escolhido." }); return }
    setAplicando(true)
    setMsg(null)
    try {
      const r = await sigaPatrimonio.aplicarClassificacao(itens)
      setMsg({ tipo: "ok", texto: `${r.atualizados} bem(ns) classificados.` })
      carregar()
      onAlterado()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao aplicar." })
    } finally {
      setAplicando(false)
    }
  }

  const itens = dados?.itens || []
  const todosMarcados = itens.length > 0 && itens.every((i) => selecionados.has(i.id))
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.por_pagina)) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipo SIGA</CardTitle>
        <CardDescription>
          O SIGA exige o tipo de cada bem (1 a 9). Defina por categoria (vale para todos os bens dela) ou bem a bem, aproveitando a sugestão feita pela descrição.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h3 className="font-medium">Por categoria</h3>
          {categorias.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {categorias.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                  <span className="text-sm">{c.nome}{c.sistema && <span className="text-xs text-muted-foreground"> (padrão)</span>}</span>
                  <SelectTipo value={c.siga_tipo_bem} onChange={(v) => salvarCategoria(c.id, v)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
              Bens sem tipo {dados && <span className="text-muted-foreground font-normal">({dados.total_sem_tipo.toLocaleString("pt-BR")}; {dados.total_com_sugestao.toLocaleString("pt-BR")} com sugestão)</span>}
            </h3>
            <div className="flex items-center gap-2">
              <Select value={filtro} onValueChange={(v) => { setFiltro(v as any); setPagina(1) }}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="com">Com sugestão</SelectItem>
                  <SelectItem value="sem">Sem sugestão</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={aplicar} disabled={aplicando || selecionados.size === 0}>
                {aplicando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Aplicar selecionados ({selecionados.size})
              </Button>
            </div>
          </div>
          <Aviso msg={msg} />
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum bem nesta lista.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={todosMarcados}
                      onCheckedChange={(v) => setSelecionados(v ? new Set(itens.map((i) => i.id)) : new Set())}
                      aria-label="Selecionar todos da página"
                    />
                  </TableHead>
                  <TableHead>Tombo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo SIGA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Checkbox
                        checked={selecionados.has(i.id)}
                        onCheckedChange={(v) => setSelecionados((s) => { const n = new Set(s); if (v) n.add(i.id); else n.delete(i.id); return n })}
                        aria-label={`Selecionar ${i.plaqueta || i.descricao}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono">{i.plaqueta || "—"}</TableCell>
                    <TableCell>{i.descricao}</TableCell>
                    <TableCell>
                      <SelectTipo
                        value={escolhas[i.id] ?? null}
                        placeholder="Escolha o tipo"
                        onChange={(v) => {
                          setEscolhas((e) => ({ ...e, [i.id]: v }))
                          if (v) setSelecionados((s) => new Set(s).add(i.id))
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
        </div>
      </CardContent>
    </Card>
  )
}

function Paginacao({ pagina, total, onChange }: { pagina: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}>Anterior</Button>
      <span>Página {pagina} de {total}</span>
      <Button variant="outline" size="sm" disabled={pagina >= total} onClick={() => onChange(pagina + 1)}>Próxima</Button>
    </div>
  )
}

// ─── Responsável e CPF por setor ───────────────────────────────────

function SecaoResponsavel({ onAlterado }: { onAlterado: () => void }) {
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [form, setForm] = useState({ setor_id: "", nome: "", cpf: "", somente_sem_responsavel: true })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<Mensagem>(null)

  useEffect(() => { listarSetores().then(setSetores).catch(() => setSetores([])) }, [])

  async function aplicar() {
    setSalvando(true)
    setMsg(null)
    try {
      const r = await sigaPatrimonio.aplicarResponsavelPorSetor(form)
      setMsg({ tipo: "ok", texto: `Responsável aplicado a ${r.atualizados} bem(ns).` })
      onAlterado()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao aplicar." })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Responsável e CPF por setor</CardTitle>
        <CardDescription>O SIGA exige o nome e o CPF do responsável por cada bem. Aplique de uma vez para todos os bens de um setor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Setor</Label>
            <Select value={form.setor_id} onValueChange={(v) => setForm((f) => ({ ...f, setor_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
              <SelectContent>
                {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                <SelectItem value={SEM_SETOR}>Bens sem setor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="siga-resp-nome">Nome do responsável</Label>
            <Input id="siga-resp-nome" value={form.nome} maxLength={50} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="siga-resp-cpf">CPF</Label>
            <Input id="siga-resp-cpf" inputMode="numeric" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: mascaraCpf(e.target.value) }))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.somente_sem_responsavel} onCheckedChange={(v) => setForm((f) => ({ ...f, somente_sem_responsavel: !!v }))} />
          Só nos bens sem responsável (não substitui quem já está cadastrado)
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={aplicar} disabled={salvando || !form.setor_id || !form.nome.trim() || form.cpf.replace(/\D/g, "").length !== 11}>
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Aplicar ao setor
          </Button>
          <Aviso msg={msg} />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Pendências ────────────────────────────────────────────────────

function SecaoPendencias({ resumo }: { resumo: ResumoSigaPatrimonio | null }) {
  const [tipo, setTipo] = useState("")
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<{ total: number; por_pagina: number; itens: (BemSiga & { pendencias: PendenciaSigaBem[] })[] } | null>(null)
  const [erro, setErro] = useState("")

  useEffect(() => {
    sigaPatrimonio.pendencias(tipo, pagina).then((d) => { setDados(d); setErro("") }).catch((e) => setErro(e.message))
  }, [tipo, pagina, resumo])

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.por_pagina)) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pendências</CardTitle>
        <CardDescription>Bens que ainda não podem ir para o arquivo. Corrija no cadastro do bem ou pelas ações acima.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {resumo && resumo.pendencias_por_tipo.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge variant={tipo === "" ? "default" : "outline"} className="cursor-pointer" onClick={() => { setTipo(""); setPagina(1) }}>
              Todas ({resumo.com_pendencia.toLocaleString("pt-BR")})
            </Badge>
            {resumo.pendencias_por_tipo.map((p) => (
              <Badge key={p.tipo} variant={tipo === p.tipo ? "default" : "outline"} className="cursor-pointer" onClick={() => { setTipo(p.tipo); setPagina(1) }}>
                {p.rotulo} ({p.quantidade.toLocaleString("pt-BR")})
              </Badge>
            ))}
          </div>
        )}
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {dados && dados.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tombo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>O que falta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados?.itens.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono">
                    <Link className="underline" href={`/orgao/patrimonio/${b.id}`}>{b.plaqueta || "—"}</Link>
                  </TableCell>
                  <TableCell>{b.descricao}</TableCell>
                  <TableCell>{b.setor_nome || "—"}</TableCell>
                  <TableCell>
                    <ul className="list-disc pl-4 text-sm">
                      {b.pendencias.map((p, i) => <li key={i}>{p.mensagem}</li>)}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
      </CardContent>
    </Card>
  )
}

// ─── Arquivo ───────────────────────────────────────────────────────

function SecaoArquivo({ resumo, configPendente, onEnviado }: { resumo: ResumoSigaPatrimonio | null; configPendente: boolean; onEnviado: () => void }) {
  const [gerando, setGerando] = useState(false)
  const [idsGerados, setIdsGerados] = useState<string[] | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [msg, setMsg] = useState<Mensagem>(null)

  async function gerar() {
    setGerando(true)
    setMsg(null)
    try {
      const { bem_ids } = await sigaPatrimonio.idsArquivo()
      if (!bem_ids.length) throw new Error("Nenhum bem pronto para o arquivo.")
      await baixarArquivoSiga(sigaPatrimonio.urlArquivo(), "Patrimonio.txt")
      setIdsGerados(bem_ids)
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao gerar o arquivo." })
    } finally {
      setGerando(false)
    }
  }

  async function confirmar() {
    if (!idsGerados) return
    setConfirmando(true)
    setMsg(null)
    try {
      const r = await sigaPatrimonio.marcarEnviados(idsGerados)
      setMsg({ tipo: "ok", texto: `${r.marcados} bem(ns) marcados como enviados ao SIGA.` })
      setIdsGerados(null)
      onEnviado()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao confirmar." })
    } finally {
      setConfirmando(false)
    }
  }

  const prontos = resumo?.prontos ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerar arquivo para o SIGA</CardTitle>
        <CardDescription>
          Gera o arquivo &quot;Patrimonio&quot; com os bens prontos e ainda não enviados, para importar no SIGA Captura.
          O SIGA não aceita alteração de bens por arquivo: bem já enviado não entra de novo, então os próximos arquivos levam só os bens novos.
          Correções e baixas de bens já enviados são feitas digitando nas telas do SIGA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {configPendente && (
          <p className="text-sm text-amber-700">Complete a configuração do SIGA (códigos da unidade, do órgão e da unidade orçamentária) para gerar o arquivo.</p>
        )}
        {resumo && resumo.partes_arquivo > 1 && (
          <p className="text-sm text-muted-foreground">
            São {prontos.toLocaleString("pt-BR")} bens: o SIGA aceita até 5.000 linhas por arquivo, então o download vem em um .zip com {resumo.partes_arquivo} partes. Importe todas.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={gerar} disabled={gerando || configPendente || prontos === 0}>
            {gerando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Gerar arquivo para o SIGA ({prontos.toLocaleString("pt-BR")} bens)
          </Button>
          <Aviso msg={msg} />
        </div>
        {idsGerados && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 space-y-3">
            <p className="text-sm">
              Depois de importar no SIGA Captura, confirme para marcar {idsGerados.length.toLocaleString("pt-BR")} bens como enviados.
              Se o SIGA recusar o arquivo, não confirme: corrija e gere de novo.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmar} disabled={confirmando}>
                {confirmando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar importação
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIdsGerados(null)}>Ainda não importei</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Baixas a lançar ───────────────────────────────────────────────

function SecaoBaixas({ onAlterado }: { onAlterado: () => void }) {
  const [baixas, setBaixas] = useState<Awaited<ReturnType<typeof sigaPatrimonio.baixasALancar>>>([])
  const [marcando, setMarcando] = useState<string | null>(null)
  const [msg, setMsg] = useState<Mensagem>(null)

  const carregar = useCallback(() => {
    sigaPatrimonio.baixasALancar().then(setBaixas).catch((e) => setMsg({ tipo: "erro", texto: e.message }))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function marcar(id: string) {
    setMarcando(id)
    setMsg(null)
    try {
      await sigaPatrimonio.marcarBaixas([id])
      carregar()
      onAlterado()
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao marcar." })
    } finally {
      setMarcando(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Baixas a lançar na tela do SIGA</CardTitle>
        <CardDescription>Bens já enviados ao SIGA que foram baixados depois. Lance a baixa digitando no SIGA e marque aqui.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Aviso msg={msg} />
        {baixas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma baixa pendente de lançamento.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tombo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Data da baixa</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {baixas.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono">{b.plaqueta || "—"}</TableCell>
                  <TableCell>{b.descricao}</TableCell>
                  <TableCell>{dataBR(b.data_baixa)}</TableCell>
                  <TableCell>{b.motivo_baixa || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={marcando === b.id} onClick={() => marcar(b.id)}>
                      {marcando === b.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Marcar como lançada
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Inventário anual ──────────────────────────────────────────────

function SecaoInventario() {
  const anoAtual = new Date().getFullYear()
  const anos = useMemo(() => Array.from({ length: 8 }, (_, i) => anoAtual - i), [anoAtual])
  const [ano, setAno] = useState(String(anoAtual - 1))
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState("")

  async function abrir() {
    setAbrindo(true)
    setErro("")
    try {
      await abrirPdf(sigaPatrimonio.caminhoInventarioAnual(Number(ano)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar o inventário.")
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventário anual (e-TCM)</CardTitle>
        <CardDescription>
          Relação dos bens existentes em 31/12 do exercício, por setor, com a certidão de registro no Livro Tombo (Resolução TCM-BA nº 1060/05), para anexar à prestação de contas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Exercício</Label>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={abrir} disabled={abrindo}>
          {abrindo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}Abrir inventário em PDF
        </Button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </CardContent>
    </Card>
  )
}
