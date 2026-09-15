"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Wrench, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  obterBem, criarManutencao, atualizarBem, listarSetores, listarCategorias,
  listarFotosBem, adicionarFotoBem, definirCapaFotoBem, excluirFotoBem,
  ORIGEM_FOTO_LABELS, type FotoBem, type OrigemFotoBem,
} from "@/services/patrimonio.service"
import BemForm, { TIPO_AQUISICAO_LABELS } from "../BemForm"
import { useRef } from "react"
import { Camera, QrCode, Star, Trash2, ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { API_URL } from "@/lib/api"
import { BemAcoes } from "../movimentacoes/BemAcoes"
import { listarMovimentacoes, devolverEmprestimo, abrirPdf, urlTermoTransferencia, urlTermoBaixa } from "@/services/patrimonio.service"

const TIPO_MOV: Record<string, string> = { TRANSFERENCIA: "Transferência", BAIXA: "Baixa", EMPRESTIMO: "Empréstimo" }
const STATUS_MOV: Record<string, string> = { PENDENTE: "aguardando aceite", ACEITA: "aceita", RECUSADA: "recusada", CANCELADA: "cancelada", EM_ANDAMENTO: "em andamento", CONCLUIDA: "concluída" }

const ESTADO_LABELS: Record<string, string> = { BOM: "Bom", REGULAR: "Regular", RUIM: "Ruim", INSERVIVEL: "Inservível" }
const fmtMoeda = (v: any) => (v == null || v === "" ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
const fmtData = (v: any) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-")
const fmtPct = (v: any) => (v == null || v === "" ? "-" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`)
/** Dias entre hoje e a data (negativo = já passou). */
const diasAte = (v: any) => {
  if (!v) return null
  const alvo = new Date(String(v).slice(0, 10) + "T12:00:00")
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

const STATUS_COLORS: Record<string, string> = {
  ATIVO: "bg-green-100 text-green-800",
  EM_MANUTENCAO: "bg-yellow-100 text-yellow-800",
  BAIXADO: "bg-red-100 text-red-800",
  DEVOLVIDO: "bg-blue-100 text-blue-800",
}

const STATUS_MANUT_COLORS: Record<string, string> = {
  AGUARDANDO_DIAGNOSTICO: "bg-orange-100 text-orange-800",
  AGUARDANDO_CONSERTO: "bg-yellow-100 text-yellow-800",
  EM_CONSERTO: "bg-blue-100 text-blue-800",
  CONCLUIDO: "bg-green-100 text-green-800",
}

const STATUS_MANUT_LABELS: Record<string, string> = {
  AGUARDANDO_DIAGNOSTICO: "Aguardando Diagnóstico",
  AGUARDANDO_CONSERTO: "Aguardando Conserto",
  EM_CONSERTO: "Em Conserto",
  CONCLUIDO: "Concluído",
}

export default function DetalheBemPage() {
  const params = useParams()
  const router = useRouter()
  const [bem, setBem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [manutDialog, setManutDialog] = useState(false)
  const [manutForm, setManutForm] = useState({
    setor: "",
    motivo: "",
    data_entrada: new Date().toISOString().split("T")[0],
  })
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [movs, setMovs] = useState<any[]>([])
  const [editDialog, setEditDialog] = useState(false)

  // Galeria de fotos
  const [fotos, setFotos] = useState<FotoBem[]>([])
  const [fotoDialog, setFotoDialog] = useState(false)
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoOrigem, setFotoOrigem] = useState<OrigemFotoBem>("CADASTRO")
  const [fotoLegenda, setFotoLegenda] = useState("")
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [fotoAcao, setFotoAcao] = useState<string | null>(null) // id da foto em ação (capa/excluir)
  const inputFoto = useRef<HTMLInputElement>(null)

  const carregarFotos = async () => {
    try { setFotos(await listarFotosBem(params.id as string)) }
    catch { setFotos([]) }
  }

  const carregarBem = async () => {
    try {
      const data = await obterBem(params.id as string)
      setBem(data)
      listarMovimentacoes({ bem_id: params.id as string }).then(setMovs).catch(() => setMovs([]))
      carregarFotos()
    } catch (error) {
      console.error("Erro ao carregar bem:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarBem()
    listarSetores().then(setSetores).catch(() => setSetores([]))
    listarCategorias().then(setCategorias).catch(() => setCategorias([]))
  }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSalvarEdicao = async (payload: Record<string, any>) => {
    try {
      await atualizarBem(params.id as string, payload)
      toast.success("Dados do bem atualizados")
      setEditDialog(false)
      carregarBem()
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar alterações")
    }
  }

  const trocarSetor = async (setorId: string) => {
    try {
      await atualizarBem(params.id as string, { setor_id: setorId || null })
      carregarBem()
    } catch (e: any) { alert(e?.message || "Erro ao alterar setor") }
  }

  const abrirDialogFoto = () => {
    setFotoArquivo(null)
    setFotoPreview(null)
    setFotoOrigem("CADASTRO")
    setFotoLegenda("")
    setFotoDialog(true)
  }

  const escolherArquivoFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setFotoArquivo(file)
    setFotoPreview(file ? URL.createObjectURL(file) : null)
  }

  const handleEnviarFoto = async () => {
    if (!fotoArquivo) return
    setEnviandoFoto(true)
    try {
      await adicionarFotoBem(params.id as string, fotoArquivo, fotoOrigem, fotoLegenda || undefined)
      toast.success("Foto adicionada")
      setFotoDialog(false)
      carregarBem()
    } catch (err: any) { toast.error(err?.message || "Erro ao enviar foto") }
    finally { setEnviandoFoto(false) }
  }

  const handleDefinirCapa = async (fotoId: string) => {
    setFotoAcao(fotoId)
    try {
      await definirCapaFotoBem(params.id as string, fotoId)
      toast.success("Capa atualizada")
      carregarBem()
    } catch (err: any) { toast.error(err?.message || "Erro ao definir capa") }
    finally { setFotoAcao(null) }
  }

  const handleExcluirFoto = async (fotoId: string) => {
    if (!confirm("Excluir esta foto? Esta ação não pode ser desfeita.")) return
    setFotoAcao(fotoId)
    try {
      await excluirFotoBem(params.id as string, fotoId)
      toast.success("Foto excluída")
      carregarBem()
    } catch (err: any) { toast.error(err?.message || "Erro ao excluir foto") }
    finally { setFotoAcao(null) }
  }

  const handleEnviarManutencao = async () => {
    try {
      await criarManutencao(params.id as string, manutForm)
      setManutDialog(false)
      setManutForm({ setor: "", motivo: "", data_entrada: new Date().toISOString().split("T")[0] })
      carregarBem()
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12">Carregando...</div>
  }

  if (!bem) {
    return <div className="text-center py-12 text-muted-foreground">Bem não encontrado</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{bem.descricao}</h1>
          <p className="text-muted-foreground">
            {bem.plaqueta ? `Plaqueta: ${bem.plaqueta}` : "Sem plaqueta"} | {bem.tipo?.replace(/_/g, " ")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditDialog(true)} title="Editar os dados cadastrais do bem">
          <Pencil className="h-4 w-4 mr-2" />Editar dados
        </Button>
        <Badge className={STATUS_COLORS[bem.status] || ""}>
          {bem.status?.replace(/_/g, " ")}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/p/${bem.id}`} target="_blank" rel="noreferrer">
          <Button variant="outline" title="Página que o QR da plaqueta abre"><QrCode className="h-4 w-4 mr-2" />Página do QR</Button>
        </a>
        <Button variant="outline" onClick={() => setManutDialog(true)} disabled={bem.status === "BAIXADO"}>
          <Wrench className="h-4 w-4 mr-2" />Enviar para Manutenção
        </Button>
        <BemAcoes bem={bem} onDone={carregarBem} />
      </div>
      {bem.emprestado_ate && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 flex items-center justify-between gap-3">
          <span>Emprestado para <strong>{bem.emprestado_para}</strong> · retorno previsto {fmtData(bem.emprestado_ate)}{new Date(String(bem.emprestado_ate).slice(0, 10) + "T23:59:59") < new Date() ? <span className="ml-2 font-semibold text-red-700">(atrasado)</span> : null}</span>
          {movs.find((m) => m.tipo === "EMPRESTIMO" && m.status === "EM_ANDAMENTO") && (
            <Button size="sm" variant="outline" onClick={async () => { try { await devolverEmprestimo(movs.find((m) => m.tipo === "EMPRESTIMO" && m.status === "EM_ANDAMENTO").id); carregarBem() } catch (e: any) { alert(e.message) } }}>Registrar devolução</Button>
          )}
        </div>
      )}
      {bem.status === "BAIXADO" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          Bem baixado em {fmtData(bem.data_baixa)}{bem.motivo_baixa ? ` · ${bem.motivo_baixa.replace(/_/g, " ").toLowerCase()}` : ""}.
        </div>
      )}

      {/* Informações do Bem */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Plaqueta:</span><span className="font-mono">{bem.plaqueta || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">RFID (EPC):</span><span className="font-mono text-xs">{bem.epc || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Categoria:</span><span>{bem.categoria?.nome || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Marca / modelo:</span><span>{[bem.marca, bem.modelo].filter(Boolean).join(" ") || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nº de série:</span><span className="font-mono text-xs">{bem.numero_serie || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantidade:</span><span>{bem.quantidade}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Estado:</span><span>{ESTADO_LABELS[bem.estado_conservacao] || bem.estado_conservacao || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Última conferência:</span><span>{bem.ultima_conferencia_em ? new Date(bem.ultima_conferencia_em).toLocaleString("pt-BR") : "nunca"}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Aquisição</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Tipo de aquisição:</span><span>{TIPO_AQUISICAO_LABELS[bem.tipo_aquisicao] || bem.tipo_aquisicao || "-"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Licitação / processo:</span>
              {bem.licitacao_id ? (
                <Link href={`/orgao/processos/${bem.licitacao_id}`} className="text-blue-600 hover:underline text-right">{bem.licitacao?.numero_processo || "abrir processo"}</Link>
              ) : <span>-</span>}
            </div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Contrato:</span>
              {bem.contrato_id ? (
                <Link href={`/orgao/contratos/${bem.contrato_id}`} className="text-blue-600 hover:underline text-right">{bem.contrato?.numero_contrato || "abrir contrato"}</Link>
              ) : <span>-</span>}
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span>{fmtMoeda(bem.valor_aquisicao)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Data:</span><span>{fmtData(bem.data_aquisicao)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nota fiscal:</span><span>{bem.nota_fiscal_numero || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fornecedor:</span><span className="text-right">{bem.fornecedor_nome || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Processo de pagamento:</span><span className="text-right">{bem.processo_pagamento || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Data de pagamento:</span><span>{fmtData(bem.data_pagamento)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nº da despesa (contabilidade):</span><span className="font-mono text-xs text-right">{bem.referencia_contabil || "-"}</span></div>
            {bem.foto_url && (
              <div className="pt-2 border-t flex items-center gap-3">
                <a href={`${API_URL}${bem.foto_url}`} target="_blank" rel="noreferrer">
                  <img src={`${API_URL}${bem.foto_url}`} alt="Capa do bem" className="w-16 h-16 object-cover rounded-md border" />
                </a>
                <span className="text-xs text-muted-foreground">Foto de capa. Gerencie as fotos no card abaixo.</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Localização e Responsável</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-muted-foreground text-sm">Setor (inventário):</span>
              <Select value={bem.setor_id || ""} onValueChange={trocarSetor}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={setores.length ? "Sem setor — selecione" : "Cadastre setores em Configurações"} /></SelectTrigger>
                <SelectContent>
                  {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sala / local:</span><span>{bem.localizacao_nome || "-"} {bem.localizacao_codigo ? `(${bem.localizacao_codigo})` : ""}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Responsável:</span><span>{bem.responsavel_nome || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cargo:</span><span>{bem.responsavel_cargo || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Corresponsável:</span><span>{bem.corresponsavel_nome || "-"}</span></div>
            {bem.observacoes && <div className="pt-2 border-t"><span className="text-muted-foreground text-sm">Obs: </span><span className="text-sm">{bem.observacoes}</span></div>}
          </CardContent>
        </Card>

        {/* Contábil e depreciação */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Contábil e depreciação</CardTitle>
            {bem.depreciacao && (
              <Badge variant="outline" className="font-normal">
                {bem.depreciacao.origem_parametros === "BEM" ? "parâmetros do bem" : "parâmetros da categoria"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {bem.depreciacao ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Conta contábil:</span><span className="font-mono text-xs">{bem.depreciacao.conta_contabil || "-"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vida útil:</span><span>{bem.depreciacao.vida_util_anos ? `${bem.depreciacao.vida_util_anos} anos` : "-"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor residual:</span><span>{fmtPct(bem.depreciacao.valor_residual_pct)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Taxa anual:</span><span>{fmtPct(bem.depreciacao.taxa_anual_pct)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Meses depreciados:</span><span>{bem.depreciacao.meses_depreciados ?? "-"}{bem.depreciacao.vida_util_anos ? ` / ${bem.depreciacao.vida_util_anos * 12}` : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Depreciação mensal:</span><span>{fmtMoeda(bem.depreciacao.depreciacao_mensal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Depreciação acumulada:</span><span className="text-orange-700">{fmtMoeda(bem.depreciacao.depreciacao_acumulada)}</span></div>
                <div className="flex justify-between items-baseline pt-2 border-t">
                  <span className="text-muted-foreground">Valor atual:</span>
                  <span className="text-lg font-bold text-green-700">{fmtMoeda(bem.depreciacao.valor_atual)}</span>
                </div>
                {bem.depreciacao.totalmente_depreciado && (
                  <p className="text-xs text-muted-foreground">Bem totalmente depreciado: já atingiu o valor residual.</p>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Sem cálculo de depreciação. Para calcular, o bem precisa de:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li className={bem.valor_aquisicao ? "line-through opacity-60" : ""}>valor de aquisição</li>
                  <li className={bem.data_aquisicao ? "line-through opacity-60" : ""}>data de aquisição</li>
                  <li className={bem.vida_util_anos || bem.categoria?.vida_util_anos ? "line-through opacity-60" : ""}>vida útil (no bem ou na categoria)</li>
                </ul>
                <p>Complete em <button type="button" className="text-blue-600 hover:underline" onClick={() => setEditDialog(true)}>Editar dados</button>{!bem.categoria?.vida_util_anos && !bem.vida_util_anos ? " ou defina a vida útil da categoria em Configurações" : ""}.</p>
                {bem.conta_contabil && <div className="flex justify-between text-foreground"><span className="text-muted-foreground">Conta contábil:</span><span className="font-mono text-xs">{bem.conta_contabil}</span></div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Garantia e seguro */}
        {(bem.garantia_ate || bem.seguro_seguradora || bem.seguro_apolice || bem.seguro_vigencia_inicio || bem.seguro_vigencia_fim || bem.seguro_valor != null) && (() => {
          const dGar = diasAte(bem.garantia_ate)
          const dSeg = diasAte(bem.seguro_vigencia_fim)
          const garantiaVencida = dGar != null && dGar < 0
          const garantiaVencendo = dGar != null && dGar >= 0 && dGar <= 30
          const seguroVencido = dSeg != null && dSeg < 0
          const seguroVencendo = dSeg != null && dSeg >= 0 && dSeg <= 30
          return (
            <Card>
              <CardHeader><CardTitle>Garantia e seguro</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Garantia até:</span>
                  <span className={garantiaVencida ? "text-red-700 font-semibold" : garantiaVencendo ? "text-amber-700 font-semibold" : ""}>
                    {fmtData(bem.garantia_ate)}
                    {garantiaVencida && " (vencida)"}
                    {garantiaVencendo && ` (vence em ${dGar} dia${dGar === 1 ? "" : "s"})`}
                  </span>
                </div>
                {(bem.seguro_seguradora || bem.seguro_apolice || bem.seguro_vigencia_inicio || bem.seguro_vigencia_fim || bem.seguro_valor != null) && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Seguradora:</span><span className="text-right">{bem.seguro_seguradora || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Apólice:</span><span className="font-mono text-xs">{bem.seguro_apolice || "-"}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vigência:</span>
                      <span className={seguroVencido ? "text-red-700 font-semibold" : seguroVencendo ? "text-amber-700 font-semibold" : ""}>
                        {fmtData(bem.seguro_vigencia_inicio)} a {fmtData(bem.seguro_vigencia_fim)}
                        {seguroVencido && " (vencido)"}
                        {seguroVencendo && ` (vence em ${dSeg} dia${dSeg === 1 ? "" : "s"})`}
                      </span>
                    </div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor segurado:</span><span>{fmtMoeda(bem.seguro_valor)}</span></div>
                  </>
                )}
              </CardContent>
            </Card>
          )
        })()}
      </div>

      {/* Fotos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Fotos{fotos.length ? ` (${fotos.length})` : ""}</CardTitle>
          <Button size="sm" variant="outline" onClick={abrirDialogFoto}>
            <Camera className="h-4 w-4 mr-2" />Adicionar foto
          </Button>
        </CardHeader>
        <CardContent>
          {fotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <ImageIcon className="h-8 w-8" />
              <span>Nenhuma foto cadastrada para este bem.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {fotos.map((f) => (
                <div key={f.id} className="rounded-lg border overflow-hidden flex flex-col">
                  <a href={`${API_URL}${f.url}`} target="_blank" rel="noreferrer" className="relative block bg-muted">
                    <img src={`${API_URL}${f.url}`} alt={f.legenda || "Foto do bem"} className="w-full h-36 object-cover" />
                    {f.capa && (
                      <Badge className="absolute top-2 left-2 bg-amber-500 text-white hover:bg-amber-500"><Star className="h-3 w-3 mr-1" />capa</Badge>
                    )}
                  </a>
                  <div className="p-2 text-xs space-y-1 flex-1">
                    {f.legenda && <p className="font-medium leading-snug">{f.legenda}</p>}
                    <p className="text-muted-foreground">
                      <Badge variant="outline" className="mr-1 text-[10px] px-1.5 py-0">{ORIGEM_FOTO_LABELS[f.origem] || f.origem}</Badge>
                      {new Date(f.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                    {f.tirada_por && <p className="text-muted-foreground truncate" title={f.tirada_por}>por {f.tirada_por}</p>}
                  </div>
                  <div className="flex border-t divide-x">
                    {!f.capa && (
                      <Button size="sm" variant="ghost" className="flex-1 rounded-none h-8 text-xs" disabled={fotoAcao === f.id} onClick={() => handleDefinirCapa(f.id)}>
                        <Star className="h-3.5 w-3.5 mr-1" />Definir capa
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="flex-1 rounded-none h-8 text-xs text-red-600 hover:text-red-700" disabled={fotoAcao === f.id} onClick={() => handleExcluirFoto(f.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manutenções */}
      {bem.manutencoes?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Histórico de Manutenções</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Retorno</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bem.manutencoes.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.setor}</TableCell>
                    <TableCell>{m.motivo}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_MANUT_COLORS[m.status] || ""}>
                        {STATUS_MANUT_LABELS[m.status] || m.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{m.data_entrada ? new Date(m.data_entrada).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell>{m.data_saida ? new Date(m.data_saida).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell>{m.data_retorno ? new Date(m.data_retorno).toLocaleDateString("pt-BR") : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Movimentações */}
      {movs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Movimentações</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="outline">{TIPO_MOV[m.tipo] || m.tipo}</Badge></TableCell>
                    <TableCell className="text-sm">
                      {m.tipo === "TRANSFERENCIA" && <>{m.setor_origem_nome || "sem setor"} → {m.setor_destino_nome}</>}
                      {m.tipo === "EMPRESTIMO" && <>{m.destino_texto} · retorno {fmtData(m.data_prevista_retorno)}{m.data_retorno ? ` · devolvido ${fmtData(m.data_retorno)}` : ""}</>}
                      {m.tipo === "BAIXA" && <>{m.motivo}</>}
                    </TableCell>
                    <TableCell className="text-sm">{STATUS_MOV[m.status] || m.status}{m.recusa_motivo ? ` — ${m.recusa_motivo}` : ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.solicitado_por}{m.aceito_por && m.aceito_por !== m.solicitado_por ? ` / ${m.aceito_por}` : ""}</TableCell>
                    <TableCell>
                      {m.tipo === "TRANSFERENCIA" && m.status === "ACEITA" && <Button size="sm" variant="ghost" onClick={() => abrirPdf(urlTermoTransferencia(m.lote_id)).catch((e) => alert(e.message))}>Termo</Button>}
                      {m.tipo === "BAIXA" && <Button size="sm" variant="ghost" onClick={() => abrirPdf(urlTermoBaixa(m.id)).catch((e) => alert(e.message))}>Termo</Button>}
                      {m.tipo === "TRANSFERENCIA" && m.status === "PENDENTE" && m.link_aceite && <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(m.link_aceite); alert("Link de aceite copiado") }}>Copiar link</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {bem.historicos?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Histórico de Ações</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bem.historicos.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 text-sm border-b pb-2">
                  <Badge variant="outline">{h.acao}</Badge>
                  <span className="flex-1">{h.descricao}</span>
                  <span className="text-muted-foreground">{h.usuario_nome}</span>
                  <span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog: adicionar foto */}
      <Dialog open={fotoDialog} onOpenChange={(v) => { if (!enviandoFoto) setFotoDialog(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar foto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Imagem *</Label>
              <input ref={inputFoto} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherArquivoFoto} />
              <div className="mt-1 flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => inputFoto.current?.click()} disabled={enviandoFoto}>
                  <Camera className="h-4 w-4 mr-2" />{fotoArquivo ? "Trocar imagem" : "Escolher ou fotografar"}
                </Button>
                <span className="text-xs text-muted-foreground truncate">{fotoArquivo?.name || "Nenhum arquivo selecionado"}</span>
              </div>
              {fotoPreview && <img src={fotoPreview} alt="Pré-visualização" className="mt-2 w-full max-h-48 object-contain rounded-md border bg-muted" />}
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={fotoOrigem} onValueChange={(v) => setFotoOrigem(v as OrigemFotoBem)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORIGEM_FOTO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Legenda (opcional)</Label>
              <Input value={fotoLegenda} onChange={(e) => setFotoLegenda(e.target.value)} placeholder="Ex.: lateral esquerda com avaria" maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFotoDialog(false)} disabled={enviandoFoto}>Cancelar</Button>
            <Button onClick={handleEnviarFoto} disabled={!fotoArquivo || enviandoFoto}>
              {enviandoFoto ? "Enviando..." : "Enviar foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar dados do bem */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar dados do bem</DialogTitle>
          </DialogHeader>
          {editDialog && (
            <BemForm
              key={bem.id}
              modo="editar"
              compacto
              initial={bem}
              categorias={categorias}
              setores={setores}
              onSubmit={handleSalvarEdicao}
              onCancel={() => setEditDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog manutenção */}
      <Dialog open={manutDialog} onOpenChange={setManutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Setor *</Label>
              <Input value={manutForm.setor} onChange={(e) => setManutForm({ ...manutForm, setor: e.target.value })} placeholder="Setor responsável" />
            </div>
            <div>
              <Label>Motivo da Manutenção *</Label>
              <Input value={manutForm.motivo} onChange={(e) => setManutForm({ ...manutForm, motivo: e.target.value })} placeholder="Descreva o motivo" />
            </div>
            <div>
              <Label>Data de Entrada</Label>
              <Input type="date" value={manutForm.data_entrada} onChange={(e) => setManutForm({ ...manutForm, data_entrada: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManutDialog(false)}>Cancelar</Button>
            <Button onClick={handleEnviarManutencao} disabled={!manutForm.setor || !manutForm.motivo}>
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
