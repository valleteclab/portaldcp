"use client"

import { useEffect, useState, use } from "react"
import { io, Socket } from "socket.io-client"
import { Gavel, AlertCircle, Send, Trash2, UserCog } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

type Lance = {
  id: string;
  valor: number;
  fornecedor_identificador: string;
  created_at: string;
}

export default function SalaPageWrapper({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  return <SalaDisputa id={resolvedParams.id} />;
}

function SalaDisputa({ id }: { id: string }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [lances, setLances] = useState<Lance[]>([])
  const [isConnected, setIsConnected] = useState(false)
  
  const [valorLance, setValorLance] = useState("")
  const [nomeFornecedor, setNomeFornecedor] = useState("")
  const [isPregoeiro, setIsPregoeiro] = useState(false) // Simulação de Role

  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      transports: ['websocket'],
    })

    newSocket.on('connect', () => {
      console.log('Conectado ao WebSocket!')
      setIsConnected(true)
      newSocket.emit('entrar_sala', id)
    })

    newSocket.on('disconnect', () => {
      setIsConnected(false)
    })

    newSocket.on('historico_lances', (historico: Lance[]) => {
      setLances(historico)
    })

    newSocket.on('novo_lance', (lance: Lance) => {
      setLances((prev) => [...prev, lance])
    })

    newSocket.on('erro_lance', (erro) => {
      alert(`Erro: ${erro.message}`)
    })
    
    newSocket.on('notificacao', (data) => {
      alert(`SISTEMA: ${data.mensagem}`)
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
    
    setValorLance("")
  }

  const cancelarLance = (lanceId: string) => {
    if (!socket) return;
    const justificativa = prompt("Motivo do cancelamento:");
    if (!justificativa) return;

    socket.emit('cancelar_lance', {
      lanceId,
      licitacaoId: id,
      justificativa
    })
  }

  const melhorLance = lances.length > 0 
    ? Math.min(...lances.map(l => Number(l.valor))) 
    : 0

  return (
    <div className="container mx-auto p-4 max-w-4xl h-screen flex flex-col">
      <header className="mb-4 flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-lg border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Gavel className="h-6 w-6 text-blue-600" /> Sala de Disputa
          </h1>
          <p className="text-muted-foreground text-sm">Licitação #{id.slice(0, 8)}...</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2 border-r pr-4">
            <Switch id="role-mode" checked={isPregoeiro} onCheckedChange={setIsPregoeiro} />
            <Label htmlFor="role-mode" className="flex items-center gap-1">
              <UserCog className="h-4 w-4" /> {isPregoeiro ? "Modo Pregoeiro" : "Modo Fornecedor"}
            </Label>
          </div>
          
          <Badge variant={isConnected ? "default" : "destructive"} className={isConnected ? "bg-green-600" : ""}>
            {isConnected ? "Online" : "Offline"}
          </Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
        
        <Card className="md:col-span-2 flex flex-col min-h-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle>Histórico de Lances</CardTitle>
            <CardDescription>Lances validados pelo sistema.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3 pr-2">
            {lances.length === 0 ? (
              <div className="text-center text-muted-foreground py-20 bg-slate-50 rounded-lg border border-dashed">
                <Gavel className="h-10 w-10 mx-auto mb-2 opacity-20" />
                Nenhum lance registrado ainda.
              </div>
            ) : (
              lances.map((lance) => {
                const isVencedor = Number(lance.valor) === melhorLance;
                return (
                  <div key={lance.id} className={`flex justify-between items-center p-3 border rounded-lg transition-all animate-in slide-in-from-left-2 ${isVencedor ? 'bg-green-50 border-green-200 ring-1 ring-green-200' : 'bg-white hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center ${isVencedor ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {isVencedor ? '1º' : '#'}
                      </div>
                      <div>
                        <div className={`font-bold text-lg ${isVencedor ? 'text-green-700' : 'text-slate-700'}`}>
                          R$ {Number(lance.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {new Date(lance.created_at).toLocaleTimeString()} • {lance.fornecedor_identificador}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isVencedor && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">Vencedor</Badge>
                      )}
                      {isPregoeiro && (
                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => cancelarLance(lance.id)} title="Cancelar Lance">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              }).reverse()
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-md">
            <CardHeader>
              <CardTitle>Painel de Ofertas</CardTitle>
              <CardDescription>Dê seu melhor lance.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={enviarLance} className="space-y-4">
                <div className="space-y-2">
                  <Label>Identificação</Label>
                  <Input 
                    placeholder="Ex: Fornecedor ABC" 
                    value={nomeFornecedor}
                    onChange={(e) => setNomeFornecedor(e.target.value)}
                    className="bg-white"
                    disabled={isPregoeiro} // Pregoeiro não dá lance
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Valor do Lance (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={valorLance}
                    onChange={(e) => setValorLance(e.target.value)}
                    className="bg-white text-lg font-bold"
                    disabled={isPregoeiro}
                  />
                  <p className="text-xs text-muted-foreground">Deve ser menor que o atual.</p>
                </div>

                {melhorLance > 0 && (
                  <Alert className="bg-blue-50 border-blue-200 text-blue-800">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-sm font-bold">Melhor oferta atual</AlertTitle>
                    <AlertDescription className="text-lg font-bold">
                      R$ {melhorLance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full h-12 text-lg bg-blue-600 hover:bg-blue-700" disabled={!isConnected || isPregoeiro}>
                  <Send className="mr-2 h-5 w-5" /> {isPregoeiro ? "Modo Observador" : "Enviar Lance"}
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <div className="text-center text-xs text-muted-foreground">
            <p>Ambiente protegido por SSL.</p>
            <p>Endereço IP registrado para auditoria.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
