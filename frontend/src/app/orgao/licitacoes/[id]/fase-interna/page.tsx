"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, FileText, Upload, Check, AlertCircle, Loader2, RefreshCw, Info, Eye, PenLine, Download, Trash2, ClipboardList, Search, Scale, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Documentos da Fase Interna - Lei 14.133/2021
// O pregoeiro IMPORTA/ANEXA documentos já elaborados FORA do sistema
const TIPOS_DOCUMENTO = [
  { value: 'ETP', label: 'Estudo Técnico Preliminar', obrigatorio: true },
  { value: 'TR', label: 'Termo de Referência', obrigatorio: true },
  { value: 'PB', label: 'Projeto Básico', obrigatorio: false },
  { value: 'PP', label: 'Pesquisa de Preços', obrigatorio: true },
  { value: 'MR', label: 'Matriz de Riscos', obrigatorio: false },
  { value: 'PJ', label: 'Parecer Jurídico', obrigatorio: true },
  { value: 'AA', label: 'Autorização da Autoridade', obrigatorio: true },
  { value: 'DP', label: 'Designação do Pregoeiro', obrigatorio: true },
  { value: 'DO', label: 'Dotação Orçamentária', obrigatorio: true },
  { value: 'ME', label: 'Minuta do Edital', obrigatorio: true },
  { value: 'OUT', label: 'Outros Documentos', obrigatorio: false },
]

interface Documento { id: string; tipo: string; titulo: string; descricao?: string; nome_arquivo?: string; created_at: string }
interface Licitacao { id: string; numero_processo: string; objeto: string; fase_interna_concluida: boolean }

export default function FaseInternaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const licitacaoId = resolvedParams.id

  const [loading, setLoading] = useState(true)
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [showAnexar, setShowAnexar] = useState(false)
  const [tipoSelecionado, setTipoSelecionado] = useState('')
  const [tituloDoc, setTituloDoc] = useState('')
  const [descricaoDoc, setDescricaoDoc] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregarDados() }, [licitacaoId])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const resLic = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
      if (resLic.ok) setLicitacao(await resLic.json())
      const resDocs = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos`)
      if (resDocs.ok) setDocumentos(await resDocs.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const anexarDocumento = async () => {
    if (!tipoSelecionado || !tituloDoc) return
    setSalvando(true)
    try {
      const res = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/documento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipoSelecionado, titulo: tituloDoc, descricao: descricaoDoc }),
      })
      if (res.ok) { setShowAnexar(false); setTipoSelecionado(''); setTituloDoc(''); setDescricaoDoc(''); carregarDados() }
    } catch (e) { console.error(e) }
    finally { setSalvando(false) }
  }

  const concluirFaseInterna = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/avancar`, { method: 'PUT' })
      if (res.ok) router.push(`/orgao/licitacoes/${licitacaoId}`)
    } catch (e) { console.error(e) }
  }

  const docsObrigatorios = TIPOS_DOCUMENTO.filter(t => t.obrigatorio)
  const docsAnexados = documentos.map(d => d.tipo)
  const docsFaltantes = docsObrigatorios.filter(t => !docsAnexados.includes(t.value))
  const podeAvancar = docsFaltantes.length === 0

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <div>
            <h1 className="text-2xl font-bold">Documentos da Fase Interna</h1>
            <p className="text-muted-foreground">{licitacao?.numero_processo} - {licitacao?.objeto?.substring(0, 50)}...</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={carregarDados}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
          {podeAvancar && !licitacao?.fase_interna_concluida && (
            <Button onClick={concluirFaseInterna} className="bg-green-600 hover:bg-green-700">
              <Check className="mr-2 h-4 w-4" />Concluir Fase Interna
            </Button>
          )}
        </div>
      </div>

      {/* Progresso */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Progresso da Fase Interna</span>
            <span className="text-lg font-bold text-blue-600">{Math.round((docsObrigatorios.length - docsFaltantes.length) / docsObrigatorios.length * 100)}%</span>
          </div>
          <Progress value={(docsObrigatorios.length - docsFaltantes.length) / docsObrigatorios.length * 100} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">{docsObrigatorios.length - docsFaltantes.length} de {docsObrigatorios.length} documentos obrigatórios</p>
        </CardContent>
      </Card>

      {/* Info - Opções */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-slate-600 mt-0.5" />
            <div>
              <p className="font-medium text-slate-800">Fase Interna (Planejamento) - Lei 14.133/2021</p>
              <p className="text-sm text-slate-600 mt-1">Você pode:</p>
              <ul className="text-sm text-slate-600 mt-1 space-y-1">
                <li className="flex items-center gap-2"><PenLine className="h-4 w-4" /><strong>Elaborar no sistema</strong> - Criar os documentos diretamente aqui</li>
                <li className="flex items-center gap-2"><Download className="h-4 w-4" /><strong>Importar</strong> - Trazer de outro sistema (ex: PNCP, SEI)</li>
                <li className="flex items-center gap-2"><Upload className="h-4 w-4" /><strong>Anexar</strong> - Apenas registrar documentos já elaborados</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documentos Faltantes */}
      {docsFaltantes.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-4">
            <p className="font-medium text-amber-800 flex items-center gap-2"><AlertCircle className="h-4 w-4" />Documentos obrigatórios pendentes:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {docsFaltantes.map(t => <Badge key={t.value} variant="outline" className="bg-white">{t.label}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Documentos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>Documentos da Fase Interna</CardTitle><CardDescription>Elabore, importe ou anexe os documentos da fase preparatória</CardDescription></div>
            <Button onClick={() => setShowAnexar(true)}><PenLine className="mr-2 h-4 w-4" />Adicionar Documento</Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Form Anexar/Elaborar */}
          {showAnexar && (
            <div className="mb-6 p-4 border rounded-lg bg-slate-50">
              <h4 className="font-medium mb-4">Adicionar Documento</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Documento *</Label>
                  <Select value={tipoSelecionado} onValueChange={setTipoSelecionado}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTO.map(t => <SelectItem key={t.value} value={t.value}>{t.label} {t.obrigatorio && '(obrigatório)'}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input placeholder="Ex: ETP - Aquisição de Computadores" value={tituloDoc} onChange={(e) => setTituloDoc(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Descrição / Conteúdo</Label>
                  <Textarea placeholder="Descreva o documento ou cole o conteúdo aqui..." value={descricaoDoc} onChange={(e) => setDescricaoDoc(e.target.value)} rows={4} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => { setShowAnexar(false); setTipoSelecionado(''); setTituloDoc(''); setDescricaoDoc('') }}>Cancelar</Button>
                <Button onClick={anexarDocumento} disabled={salvando || !tipoSelecionado || !tituloDoc}>
                  {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Salvar Documento
                </Button>
              </div>
            </div>
          )}

          {/* Lista */}
          {documentos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">Nenhum documento anexado</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowAnexar(true)}><Upload className="mr-2 h-4 w-4" />Anexar Primeiro Documento</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {documentos.map(doc => {
                const tipo = TIPOS_DOCUMENTO.find(t => t.value === doc.tipo)
                return (
                  <div key={doc.id} className="p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{doc.titulo}</p>
                            {tipo?.obrigatorio && <Badge className="bg-green-100 text-green-700 text-xs"><Check className="w-3 h-3 mr-1" />Obrigatório</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{tipo?.label || doc.tipo}</p>
                          {doc.descricao && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{doc.descricao}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button size="sm" variant="outline" title="Visualizar"><Eye className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" title="Excluir" className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
