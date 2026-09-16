"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Tag, Printer, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { listarBens, gerarEtiquetas, gerarZpl } from "@/services/patrimonio.service"

const TIPOS_ETIQUETA = [
  { value: "PLAQUETA", label: "Plaqueta com QR code (inventário)", cor: "bg-[#1f3a5f]" },
  { value: "AVARIA", label: "Etiqueta de Avaria", cor: "bg-red-500" },
  { value: "SITUACAO_PATRIMONIO", label: "Situação Patrimônio", cor: "bg-blue-500" },
  { value: "BEM_PARTICULAR_SERVIDOR", label: "Bem Particular - Servidor", cor: "bg-purple-500" },
  { value: "BEM_LOCADO", label: "Bem Locado", cor: "bg-green-500" },
  { value: "BEM_COMODATO", label: "Bem em Comodato", cor: "bg-cyan-500" },
]

export default function EtiquetasPage() {
  const [bens, setBens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [tipoEtiqueta, setTipoEtiqueta] = useState("PLAQUETA")
  const [formato, setFormato] = useState<"individual" | "folha_a4">("folha_a4")
  const [gerando, setGerando] = useState(false)
  const [zpl, setZpl] = useState({ largura_mm: 50, altura_mm: 25, dpi: 203 })
  const [busca, setBusca] = useState("")
  const [filtroSetor, setFiltroSetor] = useState("todos")
  const [tamanho, setTamanho] = useState<"50x20" | "50x25" | "100x25">("50x25")
  const [incluirEpc, setIncluirEpc] = useState(false)

  const nomeSetor = (b: any) => b.setor?.nome || b.localizacao_nome || ""
  const setores = useMemo(
    () => Array.from(new Set(bens.map(nomeSetor).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [bens],
  )
  // Lista visível: filtro de setor + busca, em ordem de setor e tombo (é a ordem de impressão)
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return bens
      .filter((b: any) => filtroSetor === "todos" || nomeSetor(b) === filtroSetor)
      .filter((b: any) => !q || [b.plaqueta, b.descricao, nomeSetor(b)].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a: any, b: any) =>
        nomeSetor(a).localeCompare(nomeSetor(b), "pt-BR") ||
        String(a.plaqueta || "").localeCompare(String(b.plaqueta || ""), "pt-BR", { numeric: true }))
  }, [bens, busca, filtroSetor])
  // Paginação da lista (a seleção e o "marcar filtrados" continuam valendo para todas as páginas)
  const POR_PAGINA = 50
  const [pagina, setPagina] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA))
  useEffect(() => { setPagina(1) }, [busca, filtroSetor])
  useEffect(() => { if (pagina > totalPaginas) setPagina(totalPaginas) }, [pagina, totalPaginas])
  const paginaAtual = visiveis.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const marcadosVisiveis = visiveis.filter((b: any) => selecionados.has(b.id)).length
  const todosVisiveisMarcados = visiveis.length > 0 && marcadosVisiveis === visiveis.length
  /** Ids selecionados na ordem de impressão (setor, tombo), inclusive os fora do filtro atual. */
  const idsEmOrdem = () => {
    const ordem = [...bens].sort((a: any, b: any) =>
      nomeSetor(a).localeCompare(nomeSetor(b), "pt-BR") ||
      String(a.plaqueta || "").localeCompare(String(b.plaqueta || ""), "pt-BR", { numeric: true }))
    return ordem.filter((b: any) => selecionados.has(b.id)).map((b: any) => b.id)
  }

  const handleZpl = async () => {
    if (selecionados.size === 0) { alert("Selecione pelo menos um bem"); return }
    setGerando(true)
    try {
      const texto = await gerarZpl({ bem_ids: idsEmOrdem(), ...zpl, incluir_epc: incluirEpc })
      const blob = new Blob([texto], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `plaquetas-${selecionados.size}.zpl`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (error) {
      console.error("Erro ao gerar ZPL:", error)
      alert("Erro ao gerar arquivo ZPL")
    } finally {
      setGerando(false)
    }
  }

  useEffect(() => {
    listarBens()
      .then(setBens)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const toggleSelecionado = (id: string) => {
    const novo = new Set(selecionados)
    if (novo.has(id)) {
      novo.delete(id)
    } else {
      novo.add(id)
    }
    setSelecionados(novo)
  }

  /** Marca ou desmarca só o que está visível (filtro de setor e busca). */
  const toggleTodos = () => {
    const novo = new Set(selecionados)
    if (todosVisiveisMarcados) visiveis.forEach((b: any) => novo.delete(b.id))
    else visiveis.forEach((b: any) => novo.add(b.id))
    setSelecionados(novo)
  }

  const handleGerar = async () => {
    if (selecionados.size === 0) {
      alert("Selecione pelo menos um bem")
      return
    }
    setGerando(true)
    try {
      const blob = await gerarEtiquetas({
        tipo: tipoEtiqueta,
        bem_ids: idsEmOrdem(),
        formato,
        ...(tipoEtiqueta === "PLAQUETA" ? { tamanho, incluir_epc: incluirEpc } : {}),
      })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    } catch (error) {
      console.error("Erro ao gerar etiquetas:", error)
      alert("Erro ao gerar etiquetas")
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orgao/patrimonio"><Button variant="ghost" size="icon" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Etiquetas de Patrimônio</h1>
          <p className="text-muted-foreground">Selecione os bens e gere etiquetas para impressão</p>
        </div>
      </div>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Configuração da Etiqueta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[250px]">
              <label className="text-sm font-medium mb-2 block">Tipo de Etiqueta</label>
              <Select value={tipoEtiqueta} onValueChange={setTipoEtiqueta}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ETIQUETA.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${t.cor}`} />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Formato</label>
              <Select value={formato} onValueChange={(v: any) => setFormato(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="folha_a4">Folha A4 adesiva</SelectItem>
                  <SelectItem value="individual">Uma por página (impressora de etiquetas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipoEtiqueta === "PLAQUETA" && (
              <div className="min-w-[160px]">
                <label className="text-sm font-medium mb-2 block">Tamanho</label>
                <Select value={tamanho} onValueChange={(v: any) => { setTamanho(v); const [l, a] = String(v).split("x").map(Number); setZpl((z) => ({ ...z, largura_mm: l, altura_mm: a })) }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50x20">50 × 20 mm</SelectItem>
                    <SelectItem value="50x25">50 × 25 mm</SelectItem>
                    <SelectItem value="100x25">100 × 25 mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleGerar} disabled={gerando || selecionados.size === 0}>
              <Printer className="h-4 w-4 mr-2" />
              {gerando ? "Gerando..." : `Gerar PDF (${selecionados.size})`}
            </Button>
          </div>

          {tipoEtiqueta === "PLAQUETA" && (
            <div className="mt-4 space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={incluirEpc} onCheckedChange={(v) => setIncluirEpc(!!v)} />
                Imprimir o código RFID (EPC) nos bens que tiverem tag
              </label>
              <p className="text-xs text-muted-foreground">
                A plaqueta leva o brasão do órgão (cadastrado nas configurações), &quot;PATRIMÔNIO PÚBLICO&quot;, o tombo e o QR code,
                que abre a ficha do bem e é lido pela câmera na conferência do inventário. Sem RFID, é só imprimir e colar.
              </p>
            </div>
          )}

          {tipoEtiqueta === "PLAQUETA" && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Impressora de etiquetas Zebra (ZPL)</p>
              <p className="text-xs text-muted-foreground mb-2">
                Gera um arquivo .zpl com o mesmo layout do PDF (brasão em preto e branco, tombo e QR), no tamanho da etiqueta da impressora.
                Envie pelo Zebra Setup Utilities, pelo driver (&quot;imprimir arquivo&quot;) ou pelo Browser Print. Em 300 dpi o brasão sai mais nítido.
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="w-28">
                  <label className="text-xs">Largura (mm)</label>
                  <Input type="number" value={zpl.largura_mm} onChange={(e) => setZpl({ ...zpl, largura_mm: Number(e.target.value) })} />
                </div>
                <div className="w-28">
                  <label className="text-xs">Altura (mm)</label>
                  <Input type="number" value={zpl.altura_mm} onChange={(e) => setZpl({ ...zpl, altura_mm: Number(e.target.value) })} />
                </div>
                <div className="w-32">
                  <label className="text-xs">Resolução</label>
                  <Select value={String(zpl.dpi)} onValueChange={(v) => setZpl({ ...zpl, dpi: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="203">203 dpi</SelectItem>
                      <SelectItem value="300">300 dpi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={handleZpl} disabled={gerando || selecionados.size === 0}>
                  <Printer className="h-4 w-4 mr-2" />Baixar ZPL ({selecionados.size})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filtroSetor} onValueChange={setFiltroSetor}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os setores</SelectItem>
            {setores.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Filtrar por plaqueta ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <Button variant="outline" size="sm" onClick={toggleTodos} disabled={!visiveis.length}>
          {todosVisiveisMarcados ? "Desmarcar" : "Marcar"} {visiveis.length} {filtroSetor !== "todos" || busca.trim() ? "filtrados" : "todos"}
        </Button>
        <span className="text-sm text-muted-foreground">{selecionados.size} selecionado(s)</span>
        {selecionados.size > 0 && <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>Limpar seleção</Button>}
      </div>

      {/* Tabela de seleção */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={todosVisiveisMarcados ? true : marcadosVisiveis > 0 ? "indeterminate" : false}
                  onCheckedChange={toggleTodos}
                />
              </TableHead>
              <TableHead>Plaqueta</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : visiveis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{bens.length ? "Nenhum bem com esse filtro" : "Nenhum bem cadastrado"}</TableCell>
              </TableRow>
            ) : (
              paginaAtual.map((bem: any) => (
                <TableRow key={bem.id} className={selecionados.has(bem.id) ? "bg-blue-50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selecionados.has(bem.id)}
                      onCheckedChange={() => toggleSelecionado(bem.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{bem.plaqueta || "-"}</TableCell>
                  <TableCell>{bem.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{bem.tipo?.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>{bem.categoria?.nome || "-"}</TableCell>
                  <TableCell>{bem.setor?.nome || bem.localizacao_nome || "-"}</TableCell>
                  <TableCell>
                    <Badge className={
                      bem.status === "ATIVO" ? "bg-green-100 text-green-800" :
                      bem.status === "EM_MANUTENCAO" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }>
                      {bem.status?.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {visiveis.length > POR_PAGINA && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, visiveis.length)} de {visiveis.length} bens
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPagina(1)} disabled={pagina === 1}>Primeira</Button>
            <Button variant="outline" size="sm" onClick={() => setPagina(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <span>Página {pagina} de {totalPaginas}</span>
            <Button variant="outline" size="sm" onClick={() => setPagina(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas}>Última</Button>
          </div>
        </div>
      )}
    </div>
  )
}
