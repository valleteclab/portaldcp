"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft,
  Gavel,
  MessageSquare,
  AlertTriangle,
  Send,
  TrendingDown,
  Award,
  CheckCircle2
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useSessaoDisputa, formatarTempo } from "@/hooks/useSessaoDisputa"

// Função para obter dados do fornecedor logado do localStorage
function getFornecedorLogado(): { id: string; nome: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const fornecedorStr = localStorage.getItem('fornecedor')
    if (fornecedorStr) {
      const fornecedor = JSON.parse(fornecedorStr)
      return {
        id: fornecedor.id,
        nome: fornecedor.razao_social || fornecedor.nome_fantasia || 'Fornecedor'
      }
    }
  } catch (e) {
    console.error('Erro ao obter fornecedor do localStorage:', e)
  }
  return null
}

export default function SalaDisputaFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [novoLance, setNovoLance] = useState('')
  const [novaMensagem, setNovaMensagem] = useState('')
  
  // Obter dados do fornecedor logado
  const [fornecedor, setFornecedor] = useState<{ id: string; nome: string } | null>(null)
  
  useEffect(() => {
    const f = getFornecedorLogado()
    if (f) {
      setFornecedor(f)
    } else {
      // Se não está logado, redirecionar para login
      alert('Você precisa estar logado como fornecedor para acessar a sala de disputa')
      router.push('/fornecedor/login')
    }
  }, [router])

  // Hook compartilhado - FORNECEDOR (usa dados do fornecedor logado)
  const {
    sessao,
    conectado,
    itemAtual,
    melhorLance,
    minhaPosicao,
    meuMelhorLance,
    enviarLance,
    enviarMensagem: enviarMsg,
  } = useSessaoDisputa(
    resolvedParams.id, 
    'FORNECEDOR', 
    fornecedor?.id || '', 
    fornecedor?.nome || ''
  )

  // Encontrar meu participante
  const meuParticipante = sessao.participantes.find(p => p.id === fornecedor?.id)

  const handleEnviarLance = () => {
    const valor = parseFloat(novoLance.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      alert('Valor invalido')
      return
    }

    const resultado = enviarLance(valor)
    if (resultado && !resultado.success) {
      alert(resultado.error)
      return
    }
    
    setNovoLance('')
  }

  const handleEnviarMensagem = () => {
    if (!novaMensagem.trim()) return
    enviarMsg(novaMensagem)
    setNovaMensagem('')
  }

  const calcularLanceSugerido = () => {
    // Sugere lance 0.5% abaixo do melhor
    const melhor = melhorLance?.valor || itemAtual?.valorReferencia || 0
    return (melhor * 0.995).toFixed(2)
  }

  // Calcular diferenca percentual
  const diferencaPercentual = meuMelhorLance && melhorLance 
    ? ((meuMelhorLance - melhorLance.valor) / melhorLance.valor * 100)
    : 0

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
              <p className="text-slate-400 text-sm">{sessao.orgaoNome}</p>
            </div>
          </div>

          {/* Cronometro */}
          <div className={`text-center px-6 py-2 rounded-lg ${
            sessao.emTempoAleatorio ? 'bg-red-900 animate-pulse' : 
            sessao.tempoRestante < 60 ? 'bg-yellow-900' : 'bg-slate-700'
          }`}>
            <p className="text-xs text-slate-400">
              {sessao.emTempoAleatorio ? 'TEMPO ALEATORIO - ENCERRA A QUALQUER MOMENTO!' : 'Tempo sem lances'}
            </p>
            <p className="text-3xl font-mono font-bold">
              {formatarTempo(sessao.tempoRestante)}
            </p>
          </div>

          {/* Minha Posicao */}
          <div className={`text-center px-6 py-2 rounded-lg ${
            minhaPosicao === 1 ? 'bg-green-900' : 'bg-orange-900'
          }`}>
            <p className="text-xs text-slate-300">Sua Posicao</p>
            <p className="text-3xl font-bold">
              {minhaPosicao || '-'}o
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-3 gap-4">
        {/* Coluna Esquerda - Item e Lances */}
        <div className="col-span-2 space-y-4">
          {/* Item Atual */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2">
                <Badge className="bg-red-500">Item {itemAtual?.numero}</Badge>
                {itemAtual?.descricao}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-slate-700 p-3 rounded">
                  <p className="text-xs text-slate-400">Quantidade</p>
                  <p className="text-xl font-bold">{itemAtual?.quantidade} {itemAtual?.unidade}</p>
                </div>
                <div className="bg-slate-700 p-3 rounded">
                  <p className="text-xs text-slate-400">Valor Referencia</p>
                  <p className="text-xl font-bold">R$ {itemAtual?.valorReferencia?.toLocaleString('pt-BR')}</p>
                </div>
                <div className="bg-green-900 p-3 rounded">
                  <p className="text-xs text-green-400">Melhor Lance</p>
                  <p className="text-xl font-bold text-green-400">R$ {melhorLance?.valor?.toLocaleString('pt-BR') || '-'}</p>
                </div>
                <div className={`p-3 rounded ${minhaPosicao === 1 ? 'bg-green-900' : 'bg-blue-900'}`}>
                  <p className="text-xs text-blue-400">Meu Melhor Lance</p>
                  <p className="text-xl font-bold text-blue-400">R$ {meuMelhorLance?.toLocaleString('pt-BR') || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enviar Lance */}
          <Card className="bg-blue-900 border-blue-700">
            <CardContent className="pt-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm text-blue-200 mb-2 block">Novo Lance (R$)</label>
                  <Input 
                    type="text"
                    placeholder="Digite o valor do lance"
                    className="bg-slate-800 border-slate-600 text-xl h-14 font-mono"
                    value={novoLance}
                    onChange={(e) => setNovoLance(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleEnviarLance()}
                  />
                </div>
                <Button 
                  variant="outline" 
                  className="h-14 border-blue-400 text-blue-400"
                  onClick={() => setNovoLance(calcularLanceSugerido())}
                >
                  Sugerir: R$ {calcularLanceSugerido()}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="h-14 px-8 bg-green-600 hover:bg-green-700">
                      <TrendingDown className="mr-2 h-5 w-5" />
                      Enviar Lance
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-800 border-slate-700">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">Confirmar Lance</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-300">
                        Voce esta prestes a enviar um lance de <strong className="text-green-400">R$ {novoLance}</strong>.
                        <br /><br />
                        Este valor sera multiplicado pela quantidade ({itemAtual?.quantidade} {itemAtual?.unidade}), 
                        totalizando <strong className="text-green-400">R$ {(parseFloat(novoLance.replace(',', '.') || '0') * (itemAtual?.quantidade || 1)).toLocaleString('pt-BR')}</strong>.
                        <br /><br />
                        Esta acao nao pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-slate-700 border-slate-600 text-white">Cancelar</AlertDialogCancel>
                      <AlertDialogAction className="bg-green-600" onClick={handleEnviarLance}>Confirmar Lance</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              
              {minhaPosicao && minhaPosicao > 1 && (
                <p className="text-sm text-yellow-400 mt-2">
                  Voce esta {diferencaPercentual.toFixed(2)}% acima do melhor lance. 
                  Para assumir a lideranca, envie um lance menor que R$ {melhorLance?.valor?.toLocaleString('pt-BR') || '-'}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Ranking */}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessao.lances.map((lance, index) => (
                    <TableRow key={lance.id} className={`border-slate-700 ${
                      lance.fornecedorId === FORNECEDOR_ID ? 'bg-blue-900/30' : index === 0 ? 'bg-green-900/30' : ''
                    }`}>
                      <TableCell>
                        <Badge className={index === 0 ? 'bg-yellow-500' : lance.fornecedorId === FORNECEDOR_ID ? 'bg-blue-500' : 'bg-slate-600'}>
                          {lance.posicao}o
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {lance.fornecedorId === FORNECEDOR_ID ? (
                          <span className="text-blue-400 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" /> Voce
                          </span>
                        ) : lance.fornecedorNomeExibicao}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {lance.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {lance.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-slate-400">{lance.horario}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita - Chat e Info */}
        <div className="space-y-4">
          {/* Status */}
          {minhaPosicao === 1 ? (
            <Card className="bg-green-900 border-green-700">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-green-200">
                  <CheckCircle2 className="h-6 w-6" />
                  <div>
                    <p className="font-bold text-lg">Voce esta em 1o lugar!</p>
                    <p className="text-sm">Mantenha-se atento ao tempo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-orange-900 border-orange-700">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-orange-200">
                  <AlertTriangle className="h-6 w-6" />
                  <div>
                    <p className="font-bold text-lg">Voce esta em {minhaPosicao}o lugar</p>
                    <p className="text-sm">Envie um lance para melhorar sua posicao</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Alerta Tempo Aleatorio */}
          {sessao.emTempoAleatorio && (
            <Card className="bg-red-900 border-red-700 animate-pulse">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-red-200">
                  <AlertTriangle className="h-6 w-6" />
                  <div>
                    <p className="font-bold">TEMPO ALEATORIO!</p>
                    <p className="text-sm">O item pode encerrar a qualquer momento!</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                    <div key={msg.id} className={`text-sm ${msg.tipo === 'PREGOEIRO' ? 'bg-yellow-900/50' : msg.tipo === 'SISTEMA' ? 'bg-yellow-900/30' : 'bg-slate-700'} p-2 rounded`}>
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
                  placeholder="Enviar mensagem..."
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

          {/* Dicas */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm">Dicas</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400 space-y-2">
              <p>• O tempo reinicia a cada lance enviado</p>
              <p>• Apos 3 minutos sem lances, inicia o tempo aleatorio</p>
              <p>• No tempo aleatorio, o item pode encerrar entre 2 e 30 minutos</p>
              <p>• Fique atento as mensagens do pregoeiro</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
