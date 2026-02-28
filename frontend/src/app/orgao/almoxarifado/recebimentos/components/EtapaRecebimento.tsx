'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Warehouse, Building2, Lock } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface RecebimentoItem {
  item_contrato_id: string
  descricao: string
  unidade_medida: string
  tipo_item?: string
  quantidade_esperada: number
  quantidade_recebida: number
  valor_unitario: number
}

interface EtapaRecebimentoProps {
  recebimento: any
  ordemId: string
  podeReceberPatrimonio: boolean
  onUpdate: () => void
}

export function EtapaRecebimento({
  recebimento,
  ordemId,
  podeReceberPatrimonio,
  onUpdate,
}: EtapaRecebimentoProps) {
  const [loadingAlmox, setLoadingAlmox] = useState(false)
  const [loadingPatrim, setLoadingPatrim] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const itens = recebimento?.itens || []
  const itensConsumo = itens.filter((i: any) => i.tipo_item === 'CONSUMO' || !i.tipo_item)
  const itensPermanente = itens.filter((i: any) => i.tipo_item === 'PERMANENTE')

  const almoxAceito = !!recebimento?.aceite_almoxarifado_data
  const patrimAceito = !!recebimento?.aceite_patrimonio_data

  const aceitos = (almoxAceito ? 1 : 0) + (patrimAceito ? 1 : 0)
  const total = itensPermanente.length > 0 ? 2 : 1

  const handleAceitarAlmoxarifado = async () => {
    setLoadingAlmox(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimento.id}/aceitar-almoxarifado`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErro(data.message || 'Erro ao aceitar almoxarifado')
      } else {
        onUpdate()
      }
    } catch {
      setErro('Erro ao aceitar almoxarifado')
    } finally {
      setLoadingAlmox(false)
    }
  }

  const handleAceitarPatrimonio = async () => {
    setLoadingPatrim(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimento.id}/aceitar-patrimonio`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErro(data.message || 'Erro ao aceitar patrimonio')
      } else {
        onUpdate()
      }
    } catch {
      setErro('Erro ao aceitar patrimonio')
    } finally {
      setLoadingPatrim(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Almoxarifado */}
        <Card className={almoxAceito ? 'border-green-300 border-2' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Warehouse className="h-5 w-5 text-blue-600" />
                Almoxarifado
              </CardTitle>
              <Badge variant={almoxAceito ? 'default' : 'secondary'}>
                {almoxAceito ? 'Aceito' : 'Pendente'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">Itens de Consumo</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {itensConsumo.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-700 flex-1">{item.descricao}</span>
                <span className="font-semibold ml-3 whitespace-nowrap">
                  {item.quantidade_recebida || item.quantidade_esperada} {item.unidade_medida}
                </span>
                <span className="font-semibold ml-3 text-gray-500 whitespace-nowrap">
                  {fmt(item.valor_unitario * (item.quantidade_recebida || item.quantidade_esperada))}
                </span>
              </div>
            ))}
            {itensConsumo.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum item de consumo</p>
            )}

            <div className="pt-3">
              {almoxAceito ? (
                <div className="bg-green-50 rounded-lg p-3 text-center text-green-700 font-bold text-sm">
                  <CheckCircle className="h-4 w-4 inline mr-1" />
                  Recebido por {recebimento.aceite_almoxarifado_usuario_nome}
                </div>
              ) : (
                <Button
                  onClick={handleAceitarAlmoxarifado}
                  disabled={loadingAlmox}
                  className="w-full"
                >
                  {loadingAlmox ? 'Processando...' : 'Aceitar Almoxarifado'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Patrimonio */}
        <Card className={patrimAceito ? 'border-green-300 border-2' : itensPermanente.length === 0 ? 'opacity-50' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-purple-600" />
                Patrimonio
              </CardTitle>
              <Badge variant={patrimAceito ? 'default' : 'secondary'}>
                {patrimAceito ? 'Aceito' : 'Pendente'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">Itens Permanentes</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {itensPermanente.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-700 flex-1">{item.descricao}</span>
                <span className="font-semibold ml-3 whitespace-nowrap">
                  {item.quantidade_recebida || item.quantidade_esperada} {item.unidade_medida}
                </span>
                <span className="font-semibold ml-3 text-gray-500 whitespace-nowrap">
                  {fmt(item.valor_unitario * (item.quantidade_recebida || item.quantidade_esperada))}
                </span>
              </div>
            ))}
            {itensPermanente.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum item permanente</p>
            )}

            <div className="pt-3">
              {patrimAceito ? (
                <div className="bg-green-50 rounded-lg p-3 text-center text-green-700 font-bold text-sm">
                  <CheckCircle className="h-4 w-4 inline mr-1" />
                  Recebido por {recebimento.aceite_patrimonio_usuario_nome}
                </div>
              ) : !podeReceberPatrimonio ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center text-amber-700 text-sm">
                  <Lock className="h-4 w-4 inline mr-1" />
                  Aguardando agente de Patrimonio
                </div>
              ) : (
                <Button
                  onClick={handleAceitarPatrimonio}
                  disabled={loadingPatrim || itensPermanente.length === 0}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {loadingPatrim ? 'Processando...' : 'Aceitar Patrimonio'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status geral */}
      <Card className={aceitos >= total ? 'border-green-300 bg-green-50/30' : ''}>
        <CardContent className="py-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">
              {aceitos >= total
                ? 'Recebimento concluido — NF liberada para o Financeiro'
                : aceitos === 1
                ? 'Aguardando segundo aceite'
                : 'Aguardando os dois aceites'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              OF {recebimento?.numero} · {recebimento?.ordem_fornecimento?.fornecedor?.razao_social || '-'}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center font-extrabold text-sm ${aceitos >= total ? 'border-green-500 text-green-500' : 'border-gray-200 text-gray-400'}`}>
            {aceitos}/{total}
          </div>
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-red-600 text-center">{erro}</p>}
    </div>
  )
}
