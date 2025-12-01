"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft,
  Play,
  Users,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Gavel,
  Settings
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function IniciarSessaoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()

  const [licitacao] = useState({
    id: resolvedParams.id,
    numero: 'PE 001/2025',
    objeto: 'Aquisicao de equipamentos de informatica para as escolas municipais',
    modalidade: 'PREGAO_ELETRONICO',
    valorEstimado: 150000,
    dataAbertura: '2025-11-28',
  })

  const [propostas] = useState([
    { id: '1', fornecedor: 'Tech Solutions LTDA', cnpj: '12.345.678/0001-90', valorTotal: 142000, itens: 3, status: 'VALIDA' },
    { id: '2', fornecedor: 'Info Comercio ME', cnpj: '98.765.432/0001-10', valorTotal: 145500, itens: 3, status: 'VALIDA' },
    { id: '3', fornecedor: 'Digital Store EPP', cnpj: '11.222.333/0001-44', valorTotal: 148000, itens: 3, status: 'VALIDA' },
    { id: '4', fornecedor: 'Mega Informatica SA', cnpj: '55.666.777/0001-88', valorTotal: 139500, itens: 3, status: 'VALIDA' },
    { id: '5', fornecedor: 'CompuTech EIRELI', cnpj: '33.444.555/0001-22', valorTotal: 151000, itens: 3, status: 'DESCLASSIFICADA' },
  ])

  const [itens] = useState([
    { id: '1', numero: 1, descricao: 'Notebook Dell Inspiron 15', quantidade: 100, valorRef: 3500 },
    { id: '2', numero: 2, descricao: 'Mouse USB Logitech', quantidade: 200, valorRef: 45 },
    { id: '3', numero: 3, descricao: 'Teclado USB ABNT2', quantidade: 200, valorRef: 65 },
  ])

  const [configuracao, setConfiguracao] = useState({
    modoDisputa: 'ABERTO',
    tempoInatividade: 180,
    tempoAleatorioMin: 2,
    tempoAleatorioMax: 30,
    intervaloMinLances: 3,
    decrementoMinimo: 0.5,
  })

  const [pregoeiro, setPregoeiro] = useState({
    id: '1',
    nome: 'Maria Silva',
  })

  const propostasValidas = propostas.filter(p => p.status === 'VALIDA')

  const iniciarSessao = () => {
    // Em producao, chamaria a API para criar a sessao
    router.push(`/orgao/licitacoes/${licitacao.id}/sala`)
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
            <h1 className="text-2xl font-bold text-slate-800">Iniciar Sessao Publica</h1>
            <p className="text-muted-foreground">{licitacao.numero} - {licitacao.objeto}</p>
          </div>
        </div>
      </div>

      {/* Verificacoes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Verificacoes Pre-Sessao
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Fase Interna Concluida</p>
                <p className="text-sm text-muted-foreground">Todos os documentos aprovados</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Edital Publicado</p>
                <p className="text-sm text-muted-foreground">PNCP e Diario Oficial</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Prazo de Impugnacao</p>
                <p className="text-sm text-muted-foreground">Encerrado sem impugnacoes</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Propostas Recebidas</p>
                <p className="text-sm text-muted-foreground">{propostasValidas.length} propostas validas</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Propostas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Propostas Recebidas ({propostas.length})
            </CardTitle>
            <CardDescription>{propostasValidas.length} propostas validas para disputa</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propostas.map((proposta) => (
                  <TableRow key={proposta.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{proposta.fornecedor}</p>
                        <p className="text-xs text-muted-foreground">{proposta.cnpj}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      R$ {proposta.valorTotal.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge className={proposta.status === 'VALIDA' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {proposta.status === 'VALIDA' ? 'Valida' : 'Desclassificada'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Itens */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Itens da Licitacao ({itens.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor Ref.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline">{item.numero}</Badge>
                    </TableCell>
                    <TableCell>{item.descricao}</TableCell>
                    <TableCell className="text-right">{item.quantidade}</TableCell>
                    <TableCell className="text-right font-mono">
                      R$ {item.valorRef.toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Configuracao da Sessao */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuracao da Sessao
          </CardTitle>
          <CardDescription>Parametros conforme Lei 14.133/2021 e IN SEGES/ME</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Modo de Disputa</Label>
              <Select 
                value={configuracao.modoDisputa} 
                onValueChange={(v) => setConfiguracao(c => ({...c, modoDisputa: v}))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ABERTO">Aberto (Art. 56, I)</SelectItem>
                  <SelectItem value="FECHADO">Fechado (Art. 56, II)</SelectItem>
                  <SelectItem value="ABERTO_FECHADO">Aberto e Fechado (Art. 56, III)</SelectItem>
                  <SelectItem value="FECHADO_ABERTO">Fechado e Aberto (Art. 56, IV)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tempo de Inatividade (segundos)</Label>
              <Input 
                type="number" 
                value={configuracao.tempoInatividade}
                onChange={(e) => setConfiguracao(c => ({...c, tempoInatividade: parseInt(e.target.value)}))}
              />
              <p className="text-xs text-muted-foreground">Tempo sem lances para iniciar encerramento</p>
            </div>

            <div className="space-y-2">
              <Label>Intervalo Minimo entre Lances (segundos)</Label>
              <Input 
                type="number" 
                value={configuracao.intervaloMinLances}
                onChange={(e) => setConfiguracao(c => ({...c, intervaloMinLances: parseInt(e.target.value)}))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tempo Aleatorio Minimo (minutos)</Label>
              <Input 
                type="number" 
                value={configuracao.tempoAleatorioMin}
                onChange={(e) => setConfiguracao(c => ({...c, tempoAleatorioMin: parseInt(e.target.value)}))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tempo Aleatorio Maximo (minutos)</Label>
              <Input 
                type="number" 
                value={configuracao.tempoAleatorioMax}
                onChange={(e) => setConfiguracao(c => ({...c, tempoAleatorioMax: parseInt(e.target.value)}))}
              />
            </div>

            <div className="space-y-2">
              <Label>Decremento Minimo (%)</Label>
              <Input 
                type="number" 
                step="0.1"
                value={configuracao.decrementoMinimo}
                onChange={(e) => setConfiguracao(c => ({...c, decrementoMinimo: parseFloat(e.target.value)}))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pregoeiro */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Pregoeiro Responsavel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-xl font-bold text-blue-600">
                {pregoeiro.nome.split(' ').map(n => n[0]).join('')}
              </span>
            </div>
            <div>
              <p className="font-medium">{pregoeiro.nome}</p>
              <p className="text-sm text-muted-foreground">Pregoeiro(a) Oficial</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Acoes */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Pronto para iniciar a sessao</p>
                <p className="text-sm text-blue-700">
                  Ao iniciar, todos os fornecedores serao notificados e poderao acessar a sala de disputa.
                </p>
              </div>
            </div>
            <Button size="lg" onClick={iniciarSessao}>
              <Play className="mr-2 h-5 w-5" />
              Iniciar Sessao Publica
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
