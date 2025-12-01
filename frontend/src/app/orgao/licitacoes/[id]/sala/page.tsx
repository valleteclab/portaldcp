"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft,
  Gavel,
  Users,
  MessageSquare,
  AlertTriangle,
  Check,
  X,
  Send,
  Pause,
  Award
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { useSessaoDisputa, formatarTempo } from "@/hooks/useSessaoDisputa"

export default function SalaDisputaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [novaMensagem, setNovaMensagem] = useState('')

  // Hook compartilhado - PREGOEIRO
  const {
    sessao,
    conectado,
    itemAtual,
    melhorLance,
    enviarMensagem: enviarMsg,
    encerrarItem: encerrarItemAction,
    suspenderSessao: suspenderAction,
  } = useSessaoDisputa(resolvedParams.id, 'PREGOEIRO', 'pregoeiro-1', 'Maria Silva')

  const handleEnviarMensagem = () => {
    if (!novaMensagem.trim()) return
    enviarMsg(novaMensagem)
    setNovaMensagem('')
  }

  const handleEncerrarItem = () => {
    if (confirm(`Encerrar Item ${itemAtual?.numero}? ${melhorLance ? `Vencedor: ${melhorLance.fornecedorNomeExibicao}` : 'Sem lances'}`)) {
      encerrarItemAction()
    }
  }

  const handleSuspender = () => {
    const motivo = prompt('Motivo da suspensao:')
    if (motivo) {
      suspenderAction(motivo)
    }
  }

  const handleSelecionarItem = (itemId: string) => {
    // TODO: Implementar seleção de item via WebSocket
    console.log('Selecionar item:', itemId)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="text-white" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Sair
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Gavel className="h-5 w-5 text-red-500" />
                Sala de Disputa - {sessao.licitacaoNumero}
              </h1>
              <p className="text-slate-400 text-sm">Pregoeiro: {sessao.pregoeiroNome}</p>
            </div>
          </div>

          {/* Cronometro */}
          <div className={`text-center px-6 py-2 rounded-lg ${
            sessao.emTempoAleatorio ? 'bg-red-900 animate-pulse' : 
            sessao.tempoRestante < 60 ? 'bg-yellow-900' : 'bg-slate-700'
          }`}>
            <p className="text-xs text-slate-400">
              {sessao.emTempoAleatorio ? 'TEMPO ALEATORIO' : 'Tempo sem lances'}
            </p>
            <p className="text-3xl font-mono font-bold">
              {formatarTempo(sessao.tempoRestante)}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="border-yellow-500 text-yellow-500" onClick={handleSuspender}>
              <Pause className="mr-2 h-4 w-4" /> Suspender
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-3 gap-4">
        {/* Coluna Esquerda - Itens e Lances */}
        <div className="col-span-2 space-y-4">
          {/* Item Atual */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Badge className="bg-red-500">Item {itemAtual?.numero}</Badge>
                  {itemAtual?.descricao}
                </CardTitle>
                <Select value={sessao.itemAtualId || ''} onValueChange={handleSelecionarItem}>
                  <SelectTrigger className="w-[200px] bg-slate-700 border-slate-600">
                    <SelectValue placeholder="Selecionar item" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessao.itens.map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        Item {item.numero} - {item.descricao.substring(0, 20)}...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-slate-700 p-3 rounded">
                  <p className="text-xs text-slate-400">Quantidade</p>
                  <p className="text-xl font-bold">{itemAtual?.quantidade}</p>
                </div>
                <div className="bg-slate-700 p-3 rounded">
                  <p className="text-xs text-slate-400">Valor Referencia</p>
                  <p className="text-xl font-bold">R$ {itemAtual?.valorReferencia.toLocaleString('pt-BR')}</p>
                </div>
                <div className="bg-green-900 p-3 rounded">
                  <p className="text-xs text-green-400">Melhor Lance</p>
                  <p className="text-xl font-bold text-green-400">R$ {melhorLance?.valor.toLocaleString('pt-BR')}</p>
                </div>
                <div className="bg-blue-900 p-3 rounded">
                  <p className="text-xs text-blue-400">Economia</p>
                  <p className="text-xl font-bold text-blue-400">
                    {(((itemAtual?.valorReferencia || 0) - (melhorLance?.valor || 0)) / (itemAtual?.valorReferencia || 1) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ranking de Lances */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-500" />
                Ranking de Lances
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Pos.</TableHead>
                    <TableHead className="text-slate-400">Fornecedor</TableHead>
                    <TableHead className="text-slate-400 text-right">Valor Unit.</TableHead>
                    <TableHead className="text-slate-400 text-right">Valor Total</TableHead>
                    <TableHead className="text-slate-400">Horario</TableHead>
                    <TableHead className="text-slate-400">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessao.lances.map((lance, index) => (
                    <TableRow key={lance.id} className={`border-slate-700 ${index === 0 ? 'bg-green-900/30' : ''}`}>
                      <TableCell>
                        <Badge className={index === 0 ? 'bg-yellow-500' : 'bg-slate-600'}>
                          {lance.posicao}o
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{lance.fornecedorNomeExibicao}</TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {lance.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {(lance.valor * (itemAtual?.quantidade || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-slate-400">{lance.horario}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Acoes do Pregoeiro */}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-4">
              <div className="flex gap-2">
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleEncerrarItem}>
                  <Check className="mr-2 h-4 w-4" /> Encerrar Item
                </Button>
                <Button variant="outline" className="flex-1 border-slate-600">
                  <Users className="mr-2 h-4 w-4" /> Convocar Habilitacao
                </Button>
                <Button variant="outline" className="flex-1 border-slate-600">
                  <MessageSquare className="mr-2 h-4 w-4" /> Negociar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita - Chat e Participantes */}
        <div className="space-y-4">
          {/* Participantes */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Participantes Online ({sessao.participantes.filter(p => p.online).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-yellow-400">PREGOEIRO</span>
                </div>
                {sessao.participantes.filter(p => p.tipo === 'FORNECEDOR').map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${p.online ? 'bg-green-500' : 'bg-slate-500'}`} />
                    <span>{p.nomeExibicao}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Chat */}
          <Card className="bg-slate-800 border-slate-700 flex flex-col" style={{ height: '400px' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat da Sessao
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-3">
                  {sessao.mensagens.map(msg => (
                    <div key={msg.id} className={`text-sm ${msg.tipo === 'PREGOEIRO' ? 'bg-blue-900/50' : msg.tipo === 'SISTEMA' ? 'bg-yellow-900/30' : 'bg-slate-700'} p-2 rounded`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium ${msg.tipo === 'PREGOEIRO' ? 'text-yellow-400' : msg.tipo === 'SISTEMA' ? 'text-yellow-300' : 'text-slate-300'}`}>
                          {msg.remetente}
                        </span>
                        <span className="text-xs text-slate-500">{msg.horario}</span>
                      </div>
                      <p className="text-slate-200">{msg.mensagem}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2 mt-4">
                <Input 
                  placeholder="Digite sua mensagem..."
                  className="bg-slate-700 border-slate-600"
                  value={novaMensagem}
                  onChange={(e) => setNovaMensagem(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleEnviarMensagem()}
                />
                <Button size="icon" onClick={handleEnviarMensagem}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Alertas */}
          {sessao.emTempoAleatorio && (
            <Card className="bg-red-900 border-red-700">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-red-200">
                  <AlertTriangle className="h-5 w-5" />
                  <div>
                    <p className="font-bold">TEMPO ALEATORIO ATIVO</p>
                    <p className="text-sm">O item sera encerrado a qualquer momento!</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
