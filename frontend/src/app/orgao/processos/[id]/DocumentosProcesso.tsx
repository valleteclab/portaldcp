"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"

interface Documento {
  id: string
  tipo: string
  titulo?: string
  nome_original?: string
  status?: string
  publico?: boolean
  tamanho?: number
  versao?: number
  created_at?: string
}

/**
 * Tipos anexáveis aqui. O EDITAL não entra: o PDF do edital tem caminho
 * próprio (Publicação do edital na fase interna; Retificação depois) — E7.
 */
const TIPOS = [
  { v: "TERMO_REFERENCIA", l: "Termo de Referência" },
  { v: "ETP", l: "Estudo Técnico Preliminar" },
  { v: "PROJETO_BASICO", l: "Projeto Básico" },
  { v: "MINUTA_CONTRATO", l: "Minuta do contrato" },
  { v: "PESQUISA_PRECOS", l: "Pesquisa de preços" },
  { v: "PARECER_JURIDICO", l: "Parecer jurídico" },
  { v: "AVISO_LICITACAO", l: "Aviso da licitação" },
  { v: "ANEXO", l: "Anexo do edital" },
  { v: "OUTROS", l: "Outros" },
]

const ROTULO_TIPO: Record<string, string> = {
  ...Object.fromEntries(TIPOS.map((t) => [t.v, t.l])),
  EDITAL: "Edital",
  EDITAL_RETIFICADO: "Edital retificado",
  ATA_SESSAO: "Ata da sessão",
  TERMO_ADJUDICACAO: "Termo de adjudicação",
  TERMO_HOMOLOGACAO: "Termo de homologação",
  ATA_REGISTRO_PRECO: "Ata de registro de preços",
  CONTRATO: "Contrato",
}

/** Peça da fase interna (processo-completo.documentos — documentos_fase_interna). */
export interface DocumentoFaseInterna {
  id: string
  tipo: string
  titulo?: string
  status?: string
  created_at?: string
}

const ROTULO_TIPO_FASE_INTERNA: Record<string, string> = {
  DFD: "Formalização da demanda (DFD)",
  ETP: "Estudo Técnico Preliminar",
  TR: "Termo de Referência",
  PP: "Pesquisa de preços",
  AA: "Autorização da autoridade",
  PJ: "Parecer jurídico",
  ME: "Minuta do edital / aviso",
  MR: "Matriz de riscos",
  AR: "Análise de riscos",
  DO: "Dotação / informação orçamentária",
  DP: "Portaria de designação",
  JC: "Justificativa da contratação direta",
  RAG: "Relatório do agente de contratação",
  MC: "Minuta do contrato",
  PJE: "Parecer jurídico da fase externa",
}

const normalizar = (t?: string) => String(t || "").trim().toLowerCase().replace(/\s+/g, " ")

/**
 * DOCUMENTOS DO PROCESSO — lista ÚNICA: as peças anexadas/publicadas da
 * licitação (módulo `documentos`) e as peças elaboradas na fase interna
 * (DFD, ETP, TR, pesquisa de preços, autorização, pareceres), vindas de fontes
 * diferentes no backend e juntadas aqui, sem repetir (mesmo id ou mesmo
 * título), com a ORIGEM indicada.
 */
export function DocumentosProcesso({
  licitacaoId,
  faseInterna = [],
  onTotal,
}: {
  licitacaoId: string
  faseInterna?: DocumentoFaseInterna[]
  /** Informa o total da lista unificada (badge da aba). */
  onTotal?: (n: number) => void
}) {
  const { confirmar, dialogo } = useDialogoConfirmacao()
  const [docs, setDocs] = useState<Documento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState("ANEXO")
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [publico, setPublico] = useState(true)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/documentos/licitacao/${licitacaoId}`)
      if (res.ok) {
        const j = await res.json()
        setDocs(Array.isArray(j) ? j : [])
      }
    } catch { /* lista fica vazia */ } finally {
      setCarregando(false)
    }
  }, [licitacaoId])

  useEffect(() => { carregar() }, [carregar])

  const titulosProcesso = new Set(docs.map((d) => normalizar(d.titulo || d.nome_original)))
  const idsProcesso = new Set(docs.map((d) => d.id))
  const internas = faseInterna.filter((d) => !idsProcesso.has(d.id) && !titulosProcesso.has(normalizar(d.titulo)))
  const total = docs.length + internas.length
  useEffect(() => { onTotal?.(total) }, [total, onTotal])

  const abrir = () => {
    setTipo("ANEXO"); setTitulo(""); setDescricao(""); setPublico(true); setArquivo(null); setErro(null)
    setAberto(true)
  }

  const enviar = async () => {
    if (!arquivo || !titulo.trim()) {
      setErro("Selecione o arquivo e informe o título.")
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append("arquivo", arquivo)
      fd.append("tipo", tipo)
      fd.append("titulo", titulo.trim())
      fd.append("descricao", descricao.trim())
      fd.append("publico", String(publico))
      const res = await authFetch(`${API_URL}/api/documentos/licitacao/${licitacaoId}`, { method: "POST", body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.message || `HTTP ${res.status}`)
      }
      toast.success("Documento anexado ao processo")
      setAberto(false)
      await carregar()
    } catch (e: any) {
      setErro(e.message || "Erro ao enviar o documento")
    } finally {
      setEnviando(false)
    }
  }

  const excluir = async (d: Documento) => {
    const ok = await confirmar({
      titulo: "Excluir documento",
      mensagem: `Excluir "${d.titulo || d.nome_original}" do processo? Peças do edital publicado não podem ser excluídas.`,
      confirmarRotulo: "Excluir",
      destrutivo: true,
    })
    if (!ok) return
    try {
      const res = await authFetch(`${API_URL}/api/documentos/${d.id}`, { method: "DELETE" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.message || `HTTP ${res.status}`)
      }
      toast.success("Documento excluído")
      await carregar()
    } catch (e: any) {
      toast.error(`Não foi possível excluir: ${e.message}`)
    }
  }

  return (
    <>
      {dialogo}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Documentos do processo
            {total > 0 && <Badge variant="secondary">{total}</Badge>}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={abrir}>
            <Upload className="w-4 h-4 mr-1" /> Anexar documento
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {carregando ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : total === 0 ? (
            <p className="text-sm text-gray-700">Nenhum documento no processo ainda.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{d.titulo || d.nome_original}</span>
                      <Badge variant="outline" className="text-[10px]">processo</Badge>
                      {d.publico && <Badge variant="outline" className="text-[10px]">público</Badge>}
                      {d.status && d.status !== "PUBLICADO" && (
                        <Badge variant="outline" className="text-[10px]">{d.status.toLowerCase()}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-700">
                      {ROTULO_TIPO[d.tipo] || d.tipo}
                      {d.versao ? ` · v${d.versao}` : ""}
                      {d.tamanho ? ` · ${(d.tamanho / 1024).toFixed(0)} KB` : ""}
                      {d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" aria-label={`Baixar ${d.titulo || d.nome_original}`}
                      onClick={() => abrirArquivoAutenticado(`${API_URL}/api/documentos/${d.id}/download`)}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Excluir ${d.titulo || d.nome_original}`} className="text-red-700" onClick={() => excluir(d)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {internas.map((d) => (
                <div key={`fi-${d.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{d.titulo || ROTULO_TIPO_FASE_INTERNA[d.tipo] || d.tipo}</span>
                      <Badge variant="outline" className="text-[10px] border-slate-400">fase interna</Badge>
                      {d.status && <Badge variant="outline" className="text-[10px]">{d.status.toLowerCase().replace(/_/g, " ")}</Badge>}
                    </div>
                    <p className="text-xs text-gray-700">
                      {ROTULO_TIPO_FASE_INTERNA[d.tipo] || d.tipo}
                      {d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })}` : ""}
                    </p>
                  </div>
                  <Link href={`/orgao/fase-interna/processos/${licitacaoId}`} className="text-xs text-blue-800 hover:underline shrink-0">
                    abrir na fase interna
                  </Link>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-600">
            O PDF do edital é anexado em &quot;Publicação do edital&quot; (e depois só por retificação). As peças da fase interna são
            editadas e aprovadas no{" "}
            <Link href={`/orgao/fase-interna/processos/${licitacaoId}`} className="text-blue-800 hover:underline">processo eletrônico da fase interna</Link>.
          </p>
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Anexar documento ao processo</DialogTitle>
            <DialogDescription>Documento público fica visível aos licitantes e no portal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <select className="w-full border rounded-md h-9 px-2 text-sm bg-white mt-1" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input className="mt-1" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Anexo I — Termo de Referência" />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Textarea className="mt-1" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Arquivo</label>
              <Input className="mt-1" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={publico} onChange={(e) => setPublico(e.target.checked)} />
              Documento público (visível aos licitantes)
            </label>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Anexar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
