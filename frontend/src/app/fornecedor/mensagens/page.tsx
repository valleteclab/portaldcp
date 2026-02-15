'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Mail, Loader2, FileText, Building2, ChevronRight } from 'lucide-react'
import { authFetch, formatarDataHoraBR } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface MensagemRecebida {
  id: string
  contrato_id: string
  numero_contrato: string
  orgao_nome?: string
  mes_referencia: string
  titulo: string
  mensagem: string
  solicitado_por_nome: string
  created_at: string
  lida: boolean
  lida_em: string | null
}

function formatarMesReferencia(ym: string): string {
  const [y, m] = ym.split('-')
  if (!m || !y) return ym
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const idx = parseInt(m, 10) - 1
  return idx >= 0 && idx < 12 ? `${meses[idx]}/${y}` : ym
}

export default function MensagensFornecedorPage() {
  const [mensagens, setMensagens] = useState<MensagemRecebida[]>([])
  const [loading, setLoading] = useState(true)
  const [detalhe, setDetalhe] = useState<MensagemRecebida | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)

  const carregarLista = useCallback(async () => {
    setLoading(true)
    try {
      const fornecedor = JSON.parse(localStorage.getItem('fornecedor') || '{}')
      const fornecedorId = fornecedor.id
      if (!fornecedorId) return
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/mensagens?fornecedorId=${fornecedorId}`)
      if (res.ok) setMensagens(await res.json())
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { carregarLista() }, [carregarLista])

  const abrirDetalhe = async (msg: MensagemRecebida) => {
    setLoadingDetalhe(true)
    try {
      const fornecedor = JSON.parse(localStorage.getItem('fornecedor') || '{}')
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/mensagens/${msg.id}?fornecedorId=${fornecedor.id}`)
      if (res.ok) {
        const dados = await res.json()
        setDetalhe(dados)
        carregarLista()
      }
    } catch (e) {
      console.error('Erro ao abrir mensagem:', e)
    }
    setLoadingDetalhe(false)
  }

  const naoLidas = mensagens.filter(m => !m.lida).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-6 h-6 text-blue-600" />
          Caixa de entrada
        </h1>
        <p className="text-gray-500 mt-1">
          Mensagens enviadas pelo órgão (solicitações de medição e outras comunicações)
        </p>
      </div>

      {mensagens.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">Nenhuma mensagem</h3>
            <p className="text-sm text-gray-400 mt-1">Quando o órgão enviar solicitações de medição, elas aparecerão aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mensagens.map((msg) => (
            <Card
              key={msg.id}
              className={`cursor-pointer hover:shadow-md transition-shadow ${!msg.lida ? 'border-l-4 border-l-blue-500 bg-blue-50/30' : ''}`}
              onClick={() => abrirDetalhe(msg)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    {!msg.lida && (
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" title="Não lida" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{msg.titulo}</p>
                      <p className="text-sm text-gray-500 flex items-center gap-2 mt-0.5">
                        <Building2 className="w-3.5 h-3.5" />
                        {msg.orgao_nome || 'Órgão'}
                        <span className="text-gray-400">•</span>
                        <span>Contrato {msg.numero_contrato}</span>
                        <span className="text-gray-400">•</span>
                        <span>{formatarMesReferencia(msg.mes_referencia)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">
                      {formatarDataHoraBR(msg.created_at)}
                    </span>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal detalhe da mensagem */}
      <Dialog open={!!detalhe} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {detalhe?.titulo}
            </DialogTitle>
          </DialogHeader>
          {loadingDetalhe ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : detalhe && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 space-y-1">
                <p><span className="text-gray-500">De:</span> {detalhe.solicitado_por_nome} {detalhe.orgao_nome && `(${detalhe.orgao_nome})`}</p>
                <p><span className="text-gray-500">Contrato:</span> {detalhe.numero_contrato}</p>
                <p><span className="text-gray-500">Mês referência:</span> {formatarMesReferencia(detalhe.mes_referencia)}</p>
                <p><span className="text-gray-500">Data:</span> {formatarDataHoraBR(detalhe.created_at)}</p>
              </div>
              <div className="pt-3 border-t">
                <p className="text-gray-500 text-sm mb-1">Mensagem:</p>
                <p className="whitespace-pre-wrap text-gray-800">{detalhe.mensagem}</p>
              </div>
              <div className="pt-2">
                <Link href={`/fornecedor/contratos/${detalhe.contrato_id}`}>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    <FileText className="w-4 h-4 mr-2" />
                    Ir para o contrato
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
