"use client"

import { useEffect, useState, use } from "react"
import { io, Socket } from "socket.io-client"
import { Gavel, AlertCircle, Send } from "lucide-react"

// Evita pre-render estático para rotas dinâmicas
export const dynamic = 'force-dynamic'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type Lance = {
  id: string;
  valor: number;
  fornecedor_identificador: string;
  created_at: string;
}

// Componente Wrapper para resolver Params (Cliente)
export default function SalaPageWrapper({ params }: { params: Promise<{ id: string }> }) {
  // Desembrulhando a promise de params com hook use() do React 19 (Next 15)
  const resolvedParams = use(params);
  return <SalaDisputa id={resolvedParams.id} />;
}

function SalaDisputa({ id }: { id: string }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [lances, setLances] = useState<Lance[]>([])
  const [isConnected, setIsConnected] = useState(false)
  
  // Estado do formulário
  const [valorLance, setValorLance] = useState("")
  const [nomeFornecedor, setNomeFornecedor] = useState("") // Simulação de Login
  
  // Conectar ao WebSocket
  useEffect(() => {
    // Conecta ao backend na porta 3000
    const newSocket = io('http://localhost:3000', {
      transports: ['websocket'], // Força websocket para performance
    })

    newSocket.on('connect', () => {
      console.log('Conectado ao WebSocket!')
      setIsConnected(true)
      // Entra na sala específica desta licitação
      newSocket.emit('entrar_sala', id)
    })

    newSocket.on('disconnect', () => {
      console.log('Desconectado!')
      setIsConnected(false)
    })

    // Recebe histórico inicial
    newSocket.on('historico_lances', (historico: Lance[]) => {
      setLances(historico)
    })

    // Recebe novos lances em tempo real
    newSocket.on('novo_lance', (lance: Lance) => {
      setLances((prev) => [...prev, lance])
    })

    newSocket.on('erro_lance', (erro) => {
      alert(`Erro: ${erro.message}`)
    })

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [id])

  const enviarLance = (e: React.FormEvent) => {
    e.preventDefault()
    if (!socket || !valorLance || !nomeFornecedor) return

    const valor = parseFloat(valorLance)
    if (isNaN(valor) || valor <= 0) {
      alert("Valor inválido")
      return
    }

    socket.emit('enviar_lance', {
      licitacaoId: id,
      valor,
      fornecedor: nomeFornecedor
    })
    
    setValorLance("") // Limpa input
  }

  // Melhor lance atual (o menor, assumindo pregão)
  const melhorLance = lances.length > 0 
    ? Math.min(...lances.map(l => Number(l.valor))) 
    : 0

  return (
    <div className="container mx-auto p-4 max-w-4xl h-screen flex flex-col">
      <header className="mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gavel className="h-6 w-6" /> Sala de Disputa
          </h1>
          <p className="text-muted-foreground">Licitação #{id.slice(0, 8)}...</p>
        </div>
        <Badge variant={isConnected ? "default" : "destructive"}>
          {isConnected ? "Conectado em Tempo Real" : "Desconectado"}
        </Badge>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
        
        {/* Painel de Lances (Feed) */}
        <Card className="md:col-span-2 flex flex-col min-h-0">
          <CardHeader>
            <CardTitle>Histórico de Lances</CardTitle>
            <CardDescription>Acompanhe as ofertas em tempo real.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-4 pr-4">
            {lances.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                Nenhum lance registrado ainda. Seja o primeiro!
              </div>
            ) : (
              lances.map((lance) => (
                <div key={lance.id} className="flex justify-between items-center p-3 border rounded-lg bg-card hover:bg-accent/10 transition-colors animate-in slide-in-from-bottom-2">
                  <div>
                    <div className="font-bold text-lg">R$ {Number(lance.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(lance.created_at).toLocaleTimeString()} - {lance.fornecedor_identificador}
                    </div>
                  </div>
                  {Number(lance.valor) === melhorLance && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">Vencedor Atual</Badge>
                  )}
                </div>
              )).reverse()
            )}
          </CardContent>
        </Card>

        {/* Painel de Ação (Dar Lance) */}
        <div className="space-y-6">
          <Card className="bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle>Sua Oferta</CardTitle>
              <CardDescription>Informe seus dados e dê seu lance.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={enviarLance} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Identificação (Simulado)</label>
                  <Input 
                    placeholder="Ex: Fornecedor ABC" 
                    value={nomeFornecedor}
                    onChange={(e) => setNomeFornecedor(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Valor do Lance (R$)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={valorLance}
                    onChange={(e) => setValorLance(e.target.value)}
                    required
                  />
                </div>

                {melhorLance > 0 && (
                  <Alert className="bg-yellow-50 border-yellow-200 text-yellow-800">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Melhor oferta atual</AlertTitle>
                    <AlertDescription>
                      R$ {melhorLance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full h-12 text-lg" disabled={!isConnected}>
                  <Send className="mr-2 h-5 w-5" /> Enviar Lance
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
