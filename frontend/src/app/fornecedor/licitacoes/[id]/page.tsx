"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  FileText,
  Download,
  Send,
  Gavel,
  AlertCircle,
  CheckCircle2,
  MapPin
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function DetalheLicitacaoFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()

  const [licitacao] = useState({
    id: resolvedParams.id,
    numero: 'PE 001/2025',
    modalidade: 'PREGAO_ELETRONICO',
    objeto: 'Aquisicao de equipamentos de informatica para as escolas municipais, incluindo notebooks, mouses e teclados para atender a demanda de 50 unidades escolares.',
    valorEstimado: 150000,
    fase: 'ACOLHIMENTO_PROPOSTAS',
    dataPublicacao: '2025-11-20',
    dataAbertura: '2025-11-28',
    horaAbertura: '09:00',
    orgao: {
      nome: 'Prefeitura Municipal de Sao Paulo',
      cnpj: '46.395.000/0001-39',
      endereco: 'Viaduto do Cha, 15 - Centro, Sao Paulo/SP',
    },
    pregoeiro: 'Maria Silva',
    criterioJulgamento: 'MENOR_PRECO',
    modoDisputa: 'ABERTO',
  })

  const [itens] = useState([
    { id: '1', numero: 1, descricao: 'Notebook Dell Inspiron 15, Intel Core i5, 8GB RAM, 256GB SSD', quantidade: 100, unidade: 'UN', valorRef: 3500 },
    { id: '2', numero: 2, descricao: 'Mouse USB Logitech M100, optico, 1000 DPI', quantidade: 200, unidade: 'UN', valorRef: 45 },
    { id: '3', numero: 3, descricao: 'Teclado USB ABNT2 Logitech K120', quantidade: 200, unidade: 'UN', valorRef: 65 },
  ])

  const [documentos] = useState([
    { id: '1', nome: 'Edital Completo', tipo: 'PDF', tamanho: '2.5 MB' },
    { id: '2', nome: 'Termo de Referencia', tipo: 'PDF', tamanho: '1.2 MB' },
    { id: '3', nome: 'Anexo I - Especificacoes Tecnicas', tipo: 'PDF', tamanho: '850 KB' },
    { id: '4', nome: 'Anexo II - Modelo de Proposta', tipo: 'DOCX', tamanho: '120 KB' },
    { id: '5', nome: 'Anexo III - Declaracoes', tipo: 'DOCX', tamanho: '95 KB' },
  ])

  const [minhaProposta] = useState<null | { valorTotal: number; status: string }>(null)

  const getFaseBadge = (fase: string) => {
    const map: Record<string, { label: string; className: string }> = {
      PUBLICADO: { label: 'Publicado', className: 'bg-blue-100 text-blue-800' },
      ACOLHIMENTO_PROPOSTAS: { label: 'Recebendo Propostas', className: 'bg-green-100 text-green-800' },
      EM_DISPUTA: { label: 'Em Disputa', className: 'bg-red-100 text-red-800' },
    }
    const config = map[fase] || { label: fase, className: 'bg-gray-100' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const diasRestantes = () => {
    const hoje = new Date()
    const abertura = new Date(licitacao.dataAbertura)
    const diff = Math.ceil((abertura.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">{licitacao.numero}</h1>
              {getFaseBadge(licitacao.fase)}
            </div>
            <p className="text-muted-foreground">{licitacao.modalidade.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && !minhaProposta && (
            <Link href={`/fornecedor/licitacoes/${licitacao.id}/proposta`}>
              <Button>
                <Send className="mr-2 h-4 w-4" /> Enviar Proposta
              </Button>
            </Link>
          )}
          {licitacao.fase === 'EM_DISPUTA' && (
            <Link href={`/fornecedor/licitacoes/${licitacao.id}/sala`}>
              <Button variant="destructive">
                <Gavel className="mr-2 h-4 w-4" /> Entrar na Disputa
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Alerta de Prazo */}
      {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && diasRestantes() <= 5 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-orange-600" />
              <div>
                <p className="font-medium text-orange-800">Prazo se encerrando!</p>
                <p className="text-sm text-orange-700">
                  Restam apenas {diasRestantes()} dias para envio de propostas. Abertura em {new Date(licitacao.dataAbertura).toLocaleDateString('pt-BR')} as {licitacao.horaAbertura}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Valor Estimado</p>
            <p className="text-xl font-bold">R$ {licitacao.valorEstimado.toLocaleString('pt-BR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Data de Abertura</p>
            <p className="text-xl font-bold">{new Date(licitacao.dataAbertura).toLocaleDateString('pt-BR')}</p>
            <p className="text-sm text-muted-foreground">{licitacao.horaAbertura}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Criterio de Julgamento</p>
            <p className="text-xl font-bold">Menor Preco</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Modo de Disputa</p>
            <p className="text-xl font-bold">{licitacao.modoDisputa}</p>
          </CardContent>
        </Card>
      </div>

      {/* Orgao */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Orgao Licitante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-lg">{licitacao.orgao.nome}</p>
              <p className="text-sm text-muted-foreground">CNPJ: {licitacao.orgao.cnpj}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="h-4 w-4" /> {licitacao.orgao.endereco}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="objeto">
        <TabsList>
          <TabsTrigger value="objeto">Objeto</TabsTrigger>
          <TabsTrigger value="itens">Itens ({itens.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos ({documentos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="objeto">
          <Card>
            <CardHeader>
              <CardTitle>Descricao do Objeto</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 leading-relaxed">{licitacao.objeto}</p>
              
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Pregoeiro Responsavel</p>
                  <p className="font-medium">{licitacao.pregoeiro}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Data de Publicacao</p>
                  <p className="font-medium">{new Date(licitacao.dataPublicacao).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="itens">
          <Card>
            <CardHeader>
              <CardTitle>Itens da Licitacao</CardTitle>
              <CardDescription>Especificacoes e quantidades</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Item</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead className="text-center">Quantidade</TableHead>
                    <TableHead className="text-center">Unidade</TableHead>
                    <TableHead className="text-right">Valor Ref. Unit.</TableHead>
                    <TableHead className="text-right">Valor Ref. Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="outline">{item.numero}</Badge>
                      </TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell className="text-center">{item.quantidade}</TableCell>
                      <TableCell className="text-center">{item.unidade}</TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {item.valorRef.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {(item.valorRef * item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <div className="mt-4 p-4 bg-slate-50 rounded-lg flex justify-between items-center">
                <span className="font-medium">Valor Total Estimado</span>
                <span className="text-xl font-bold">
                  R$ {itens.reduce((acc, item) => acc + (item.valorRef * item.quantidade), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <Card>
            <CardHeader>
              <CardTitle>Documentos do Edital</CardTitle>
              <CardDescription>Baixe os documentos para elaborar sua proposta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {documentos.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.nome}</p>
                        <p className="text-sm text-muted-foreground">{doc.tipo} - {doc.tamanho}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-1" /> Baixar
                    </Button>
                  </div>
                ))}
              </div>
              
              <div className="mt-4">
                <Button variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" /> Baixar Todos os Documentos
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CTA */}
      {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && !minhaProposta && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Pronto para participar?</p>
                  <p className="text-sm text-blue-700">
                    Envie sua proposta ate {new Date(licitacao.dataAbertura).toLocaleDateString('pt-BR')} as {licitacao.horaAbertura}
                  </p>
                </div>
              </div>
              <Link href={`/fornecedor/licitacoes/${licitacao.id}/proposta`}>
                <Button size="lg">
                  <Send className="mr-2 h-5 w-5" /> Enviar Proposta
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
