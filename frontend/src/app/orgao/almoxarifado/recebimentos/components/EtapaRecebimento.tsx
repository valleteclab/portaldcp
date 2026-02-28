'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  CheckCircle, Warehouse, Building2, Lock, XCircle, Ban,
  History, AlertTriangle, Check, Percent,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

type ItemMode = 'none' | 'total' | 'parcial' | 'recusado'

interface ItemState {
  mode: ItemMode
  quantidade: number
  motivoRecusa: string
  observacao: string
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
  const [salvando, setSalvando] = useState(false)
  const [showCancelarModal, setShowCancelarModal] = useState(false)
  const [motivoCancelar, setMotivoCancelar] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [showRecusaGlobal, setShowRecusaGlobal] = useState(false)

  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(() => {
    const states: Record<string, ItemState> = {}
    const itens = recebimento?.itens || []
    for (const item of itens) {
      states[item.item_contrato_id] = {
        mode: 'none',
        quantidade: item.quantidade_recebida,
        motivoRecusa: '',
        observacao: '',
      }
    }
    return states
  })

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const itens = recebimento?.itens || []
  const itensConsumo = itens.filter((i: any) => i.tipo_item === 'CONSUMO' || !i.tipo_item)
  const itensPermanente = itens.filter((i: any) => i.tipo_item === 'PERMANENTE')

  const almoxAceito = !!recebimento?.aceite_almoxarifado_data
  const patrimAceito = !!recebimento?.aceite_patrimonio_data
  const isRejeitado = recebimento?.status === 'REJEITADO'
  const isEstornado = recebimento?.status === 'ESTORNADO'
  const isCancelado = isRejeitado || isEstornado

  const aceitos = (almoxAceito ? 1 : 0) + (patrimAceito ? 1 : 0)
  const total = itensPermanente.length > 0 ? 2 : 1
  const ocorrencias = recebimento?.ocorrencias || []

  const itensRecusados = Object.entries(itemStates).filter(([, s]) => s.mode === 'recusado')
  const hasRecusados = itensRecusados.length > 0
  const allItensDecididos = itens.every((i: any) => itemStates[i.item_contrato_id]?.mode !== 'none')

  const setItemState = (itemId: string, partial: Partial<ItemState>) => {
    setItemStates(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...partial },
    }))
  }

  const hasParcial = Object.values(itemStates).some(s => s.mode === 'parcial')

  const handleSalvarDecisoes = async () => {
    setSalvando(true)
    setErro(null)
    try {
      if (hasRecusados) {
        const recusaMotivos = itensRecusados.map(([id, s]) => {
          const item = itens.find((i: any) => i.item_contrato_id === id)
          return `${item?.descricao}: ${s.motivoRecusa}`
        }).join('; ')

        if (itensRecusados.some(([, s]) => !s.motivoRecusa.trim())) {
          setErro('Informe o motivo de todas as recusas')
          setSalvando(false)
          return
        }

        const firstRecusado = itensRecusados[0]
        const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimento.id}/recusar-item`, {
          method: 'POST',
          body: JSON.stringify({
            item_contrato_id: firstRecusado[0],
            motivo: recusaMotivos,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setErro(data.message || 'Erro ao recusar itens')
        } else {
          onUpdate()
        }
      } else if (hasParcial) {
        const itensUpdate = Object.entries(itemStates).map(([item_contrato_id, s]) => ({
          item_contrato_id,
          quantidade_recebida: s.mode === 'total'
            ? itens.find((i: any) => i.item_contrato_id === item_contrato_id)?.quantidade_esperada || s.quantidade
            : s.quantidade,
        }))

        const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimento.id}/atualizar-quantidades`, {
          method: 'PATCH',
          body: JSON.stringify({ itens: itensUpdate }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setErro(data.message || 'Erro ao atualizar quantidades')
        } else {
          onUpdate()
        }
      }
    } catch {
      setErro('Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  const handleCancelar = async () => {
    if (!motivoCancelar.trim()) {
      setErro('Informe o motivo do cancelamento')
      return
    }
    setCancelando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimento.id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivoCancelar }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErro(data.message || 'Erro ao cancelar recebimento')
      } else {
        setShowCancelarModal(false)
        onUpdate()
      }
    } catch {
      setErro('Erro ao cancelar recebimento')
    } finally {
      setCancelando(false)
    }
  }

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

  const renderItemCard = (item: any, aceito: boolean) => {
    const state = itemStates[item.item_contrato_id]
    if (!state) return null
    const isTotal = state.mode === 'total'
    const isParcial = state.mode === 'parcial'
    const isRecusado = state.mode === 'recusado'
    const falta = item.quantidade_esperada - state.quantidade

    return (
      <div key={item.item_contrato_id} className={`border rounded-lg overflow-hidden ${isRecusado ? 'border-red-300 bg-red-50/30' : isParcial ? 'border-amber-300 bg-amber-50/20' : isTotal ? 'border-green-300 bg-green-50/20' : 'border-gray-200'}`}>
        <div className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <p className="font-semibold text-sm text-gray-800">{item.descricao}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px]">{item.item_contrato_id?.substring(0, 8)}</Badge>
                <Badge className={`text-[10px] ${item.tipo_item === 'PERMANENTE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {item.tipo_item || 'CONSUMO'}
                </Badge>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[10px] text-gray-400 uppercase font-bold">QTD OF</p>
              <p className="font-bold text-sm">{item.quantidade_esperada} <span className="text-gray-500 text-xs">{item.unidade_medida}</span></p>
            </div>

            <div className="text-center">
              <p className="text-[10px] text-gray-400 uppercase font-bold">QTD NF</p>
              <p className="font-bold text-sm">{item.quantidade_recebida} <span className="text-gray-500 text-xs">{item.unidade_medida}</span></p>
            </div>

            {isParcial ? (
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold">RECEBER</p>
                <Input
                  type="number"
                  min={0}
                  max={item.quantidade_esperada}
                  value={state.quantidade}
                  onChange={(e) => setItemState(item.item_contrato_id, { quantidade: Number(e.target.value) })}
                  className="w-20 h-8 text-center text-sm font-bold border-amber-400"
                  disabled={aceito}
                />
              </div>
            ) : isRecusado ? (
              <div className="text-center">
                <p className="text-[10px] text-red-500 uppercase font-bold">RECUSADO</p>
                <p className="font-bold text-sm text-red-600">{item.quantidade_recebida} <span className="text-red-400 text-xs">{item.unidade_medida}</span></p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-[10px] text-gray-400 uppercase font-bold">RECEBER</p>
                <p className="font-bold text-sm">{isTotal ? item.quantidade_esperada : '—'}</p>
              </div>
            )}

            {!aceito && !isCancelado && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={isTotal ? 'default' : 'outline'}
                  className={`h-7 px-2 text-xs ${isTotal ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => setItemState(item.item_contrato_id, { mode: 'total', quantidade: item.quantidade_esperada })}
                >
                  <Check className="h-3 w-3 mr-1" /> Total
                </Button>
                <Button
                  size="sm"
                  variant={isParcial ? 'default' : 'outline'}
                  className={`h-7 px-2 text-xs ${isParcial ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                  onClick={() => setItemState(item.item_contrato_id, { mode: 'parcial', quantidade: item.quantidade_recebida })}
                >
                  <Percent className="h-3 w-3 mr-1" /> Parcial
                </Button>
                <Button
                  size="sm"
                  variant={isRecusado ? 'destructive' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setItemState(item.item_contrato_id, { mode: 'recusado', motivoRecusa: '' })}
                >
                  <XCircle className="h-3 w-3 mr-1" /> Recusar
                </Button>
              </div>
            )}

            <span className="font-bold text-sm whitespace-nowrap">
              {fmt(item.valor_unitario * (isTotal ? item.quantidade_esperada : isParcial ? state.quantidade : item.quantidade_recebida))}
            </span>
          </div>
        </div>

        {isParcial && !aceito && (
          <div className="px-3 pb-3 space-y-2">
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              Recebimento parcial: {state.quantidade} de {item.quantidade_esperada} {item.unidade_medida}.
              Saldo de {falta} {item.unidade_medida} ficara em aberto na OF.
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Observacao (opcional)</p>
              <textarea
                value={state.observacao}
                onChange={(e) => setItemState(item.item_contrato_id, { observacao: e.target.value })}
                placeholder="Observacoes sobre este item..."
                className="w-full border rounded p-2 text-xs min-h-[50px] resize-none"
              />
            </div>
          </div>
        )}

        {isRecusado && !aceito && (
          <div className="px-3 pb-3 space-y-2">
            <div>
              <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Motivo da Recusa *</p>
              <select
                value={state.motivoRecusa}
                onChange={(e) => setItemState(item.item_contrato_id, { motivoRecusa: e.target.value })}
                className="w-full border border-red-300 rounded p-2 text-xs"
              >
                <option value="">Selecione o motivo...</option>
                <option value="Produto com defeito">Produto com defeito</option>
                <option value="Produto diferente do pedido">Produto diferente do pedido</option>
                <option value="Quantidade divergente">Quantidade divergente</option>
                <option value="Produto com validade vencida">Produto com validade vencida</option>
                <option value="Embalagem danificada">Embalagem danificada</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            {state.motivoRecusa === 'Outro' && (
              <textarea
                onChange={(e) => setItemState(item.item_contrato_id, { motivoRecusa: e.target.value })}
                placeholder="Descreva o motivo da recusa..."
                className="w-full border border-red-300 rounded p-2 text-xs min-h-[50px] resize-none"
              />
            )}
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Observacao (complemento)</p>
              <textarea
                value={state.observacao}
                onChange={(e) => setItemState(item.item_contrato_id, { observacao: e.target.value })}
                placeholder="Descreva detalhes da recusa..."
                className="w-full border rounded p-2 text-xs min-h-[50px] resize-none"
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  if (isCancelado) {
    return (
      <div className="space-y-5">
        <Card className="border-red-300 bg-red-50/30">
          <CardContent className="py-6 text-center">
            <Ban className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="font-bold text-red-700 text-base">
              Recebimento {isEstornado ? 'Estornado' : 'Cancelado / Rejeitado'}
            </p>
            {recebimento.motivo_rejeicao && (
              <p className="text-sm text-red-600 mt-2">Motivo: {recebimento.motivo_rejeicao}</p>
            )}
            {recebimento.motivo_estorno && (
              <p className="text-sm text-red-600 mt-2">Motivo estorno: {recebimento.motivo_estorno}</p>
            )}
          </CardContent>
        </Card>

        {ocorrencias.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4" /> Historico de Acoes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ocorrencias.map((oc: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 py-2 px-3 bg-gray-50 rounded text-xs border-l-2 border-gray-300">
                  <div className="flex-1">
                    <span className="font-semibold">{oc.tipo}</span>
                    <span className="text-gray-500 ml-2">{oc.usuario}</span>
                    <p className="text-gray-600 mt-0.5">{oc.descricao}</p>
                  </div>
                  <span className="text-gray-400 whitespace-nowrap">
                    {new Date(oc.data).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Alerta de itens recusados */}
      {hasRecusados && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-bold text-red-700 text-sm">Ha {itensRecusados.length} item(ns) recusado(s)</p>
              <p className="text-xs text-red-600">Qualquer recusa implica na <strong>devolucao integral da NF</strong> ao fornecedor.</p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleSalvarDecisoes}
            disabled={salvando || itensRecusados.some(([, s]) => !s.motivoRecusa.trim())}
          >
            {salvando ? 'Processando...' : 'Informar o motivo de todas as recusas'}
          </Button>
        </div>
      )}

      {/* Toolbar - always show cancel if no baixa */}
      {!recebimento?.baixa_realizada && (
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { setShowCancelarModal(true); setMotivoCancelar('') }}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Cancelar Recebimento
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Almoxarifado */}
        <Card className={almoxAceito ? 'border-green-300 border-2' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Warehouse className="h-5 w-5 text-blue-600" />
                Almoxarifado — Consumo
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{itensConsumo.length} itens</span>
                <Badge variant={almoxAceito ? 'default' : 'secondary'}>
                  {almoxAceito ? 'Aceito' : 'Pendente'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {itensConsumo.map((item: any) => renderItemCard(item, almoxAceito))}
            {itensConsumo.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum item de consumo</p>
            )}

            <div className="pt-3">
              {almoxAceito ? (
                <div className="bg-green-50 rounded-lg p-3 text-center text-green-700 font-bold text-sm">
                  <CheckCircle className="h-4 w-4 inline mr-1" />
                  Recebido por {recebimento.aceite_almoxarifado_usuario_nome}
                </div>
              ) : !hasRecusados ? (
                <div className="space-y-2">
                  {!allItensDecididos && itensConsumo.length > 0 && (
                    <p className="text-xs text-amber-600 text-center">
                      Defina Total, Parcial ou Recusar para cada item antes de aceitar.
                    </p>
                  )}
                  <Button
                    onClick={async () => {
                      if (hasParcial) {
                        await handleSalvarDecisoes()
                      }
                      await handleAceitarAlmoxarifado()
                    }}
                    disabled={loadingAlmox || !itensConsumo.every((i: any) => itemStates[i.item_contrato_id]?.mode !== 'none')}
                    className="w-full"
                  >
                    {loadingAlmox ? 'Processando...' : 'Aceitar Almoxarifado'}
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Patrimonio */}
        <Card className={patrimAceito ? 'border-green-300 border-2' : itensPermanente.length === 0 ? 'opacity-50' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-purple-600" />
                Patrimonio — Permanentes
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{itensPermanente.length} itens</span>
                <Badge variant={patrimAceito ? 'default' : 'secondary'}>
                  {patrimAceito ? 'Aceito' : 'Pendente'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {itensPermanente.map((item: any) => renderItemCard(item, patrimAceito))}
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
                  Somente o agente de Patrimonio pode aceitar estes itens
                </div>
              ) : !hasRecusados ? (
                <div className="space-y-2">
                  {!allItensDecididos && itensPermanente.length > 0 && (
                    <p className="text-xs text-amber-600 text-center">
                      Defina Total, Parcial ou Recusar para cada item.
                    </p>
                  )}
                  <Button
                    onClick={async () => {
                      if (hasParcial) {
                        await handleSalvarDecisoes()
                      }
                      await handleAceitarPatrimonio()
                    }}
                    disabled={loadingPatrim || itensPermanente.length === 0 || !itensPermanente.every((i: any) => itemStates[i.item_contrato_id]?.mode !== 'none')}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {loadingPatrim ? 'Processando...' : 'Aceitar Patrimonio'}
                  </Button>
                </div>
              ) : null}
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
              OF {recebimento?.numero} · Valor recebido: {fmt(recebimento?.valor_total_recebido)}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center font-extrabold text-sm ${aceitos >= total ? 'border-green-500 text-green-500' : 'border-gray-200 text-gray-400'}`}>
            {aceitos}/{total}
          </div>
        </CardContent>
      </Card>

      {/* Historico */}
      {ocorrencias.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="h-4 w-4" /> Historico de Acoes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ocorrencias.map((oc: any, idx: number) => {
              const tipoLabels: Record<string, { label: string; color: string }> = {
                'ACEITE_ALMOXARIFADO': { label: 'Aceite Almoxarifado', color: 'border-blue-400' },
                'ACEITE_PATRIMONIO': { label: 'Aceite Patrimonio', color: 'border-purple-400' },
                'ALTERACAO_QUANTIDADE': { label: 'Recebimento Parcial', color: 'border-amber-400' },
                'CANCELAMENTO': { label: 'Cancelamento', color: 'border-red-400' },
                'RECUSA_ITEM': { label: 'Recusa de Item', color: 'border-red-400' },
                'REJEICAO': { label: 'Rejeicao', color: 'border-red-400' },
                'ESTORNO': { label: 'Estorno', color: 'border-red-400' },
                'BAIXA': { label: 'Baixa no Contrato', color: 'border-green-400' },
              }
              const info = tipoLabels[oc.tipo] || { label: oc.tipo, color: 'border-gray-300' }
              return (
                <div key={idx} className={`flex items-start gap-3 py-2 px-3 bg-gray-50 rounded text-xs border-l-2 ${info.color}`}>
                  <div className="flex-1">
                    <span className="font-semibold">{info.label}</span>
                    <span className="text-gray-500 ml-2">{oc.usuario}</span>
                    <p className="text-gray-600 mt-0.5">{oc.descricao}</p>
                </div>
                <span className="text-gray-400 whitespace-nowrap">
                  {new Date(oc.data).toLocaleString('pt-BR')}
                </span>
              </div>
            )})}
          </CardContent>
        </Card>
      )}

      {erro && <p className="text-sm text-red-600 text-center">{erro}</p>}

      {/* Modal Cancelar */}
      {showCancelarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCancelarModal(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="font-bold text-base">Cancelar Recebimento</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Esta ação cancelará o recebimento completo. A ordem de fornecimento voltará ao status anterior (ENVIADA). Os documentos enviados serão marcados como rejeitados e o fornecedor será notificado para reenviar os documentos. O recebimento deverá ser iniciado do zero.
            </p>
            <textarea
              value={motivoCancelar}
              onChange={(e) => setMotivoCancelar(e.target.value)}
              placeholder="Informe o motivo do cancelamento..."
              className="w-full border rounded-lg p-3 text-sm mb-4 min-h-[80px] resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCancelarModal(false)}>
                Voltar
              </Button>
              <Button variant="destructive" size="sm" onClick={handleCancelar} disabled={cancelando}>
                {cancelando ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
