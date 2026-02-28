'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CheckCircle, Warehouse, Building2, Lock, XCircle, Ban, History, Edit3, Save, AlertTriangle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

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
  const [editandoQtd, setEditandoQtd] = useState(false)
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [salvandoQtd, setSalvandoQtd] = useState(false)
  const [showCancelarModal, setShowCancelarModal] = useState(false)
  const [motivoCancelar, setMotivoCancelar] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [showRecusarModal, setShowRecusarModal] = useState<string | null>(null)
  const [motivoRecusar, setMotivoRecusar] = useState('')
  const [recusando, setRecusando] = useState(false)
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null)

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

  const iniciarEdicao = () => {
    const qtds: Record<string, number> = {}
    itens.forEach((i: any) => {
      qtds[i.item_contrato_id] = i.quantidade_recebida
    })
    setQuantidades(qtds)
    setEditandoQtd(true)
  }

  const salvarQuantidades = async () => {
    setSalvandoQtd(true)
    setErro(null)
    try {
      const itensUpdate = Object.entries(quantidades).map(([item_contrato_id, quantidade_recebida]) => ({
        item_contrato_id,
        quantidade_recebida,
      }))
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimento.id}/atualizar-quantidades`, {
        method: 'PATCH',
        body: JSON.stringify({ itens: itensUpdate }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErro(data.message || 'Erro ao atualizar quantidades')
      } else {
        setEditandoQtd(false)
        setSucessoMsg('Quantidades atualizadas com sucesso')
        setTimeout(() => setSucessoMsg(null), 3000)
        onUpdate()
      }
    } catch {
      setErro('Erro ao atualizar quantidades')
    } finally {
      setSalvandoQtd(false)
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
        setMotivoCancelar('')
        onUpdate()
      }
    } catch {
      setErro('Erro ao cancelar recebimento')
    } finally {
      setCancelando(false)
    }
  }

  const handleRecusar = async () => {
    if (!motivoRecusar.trim()) {
      setErro('Informe o motivo da recusa')
      return
    }
    setRecusando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimento.id}/recusar-item`, {
        method: 'POST',
        body: JSON.stringify({ item_contrato_id: showRecusarModal, motivo: motivoRecusar }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErro(data.message || 'Erro ao recusar item')
      } else {
        setShowRecusarModal(null)
        setMotivoRecusar('')
        onUpdate()
      }
    } catch {
      setErro('Erro ao recusar item')
    } finally {
      setRecusando(false)
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

  const renderItemRow = (item: any, idx: number, canRecusar: boolean) => {
    const isParcial = item.quantidade_recebida < item.quantidade_esperada
    const falta = item.quantidade_esperada - item.quantidade_recebida
    return (
      <div key={idx} className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded-lg text-sm">
        <span className="text-gray-700 flex-1 min-w-0 truncate">{item.descricao}</span>
        {editandoQtd && !isCancelado && !almoxAceito && !patrimAceito ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={item.quantidade_esperada}
              value={quantidades[item.item_contrato_id] ?? item.quantidade_recebida}
              onChange={(e) => setQuantidades(prev => ({
                ...prev,
                [item.item_contrato_id]: Number(e.target.value),
              }))}
              className="w-20 h-7 text-xs text-center"
            />
            <span className="text-gray-400 text-xs">/ {item.quantidade_esperada}</span>
          </div>
        ) : (
          <span className={`font-semibold ml-2 whitespace-nowrap ${isParcial ? 'text-amber-600' : ''}`}>
            {item.quantidade_recebida} / {item.quantidade_esperada} {item.unidade_medida}
          </span>
        )}
        {isParcial && !editandoQtd && (
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
            Falta {falta}
          </Badge>
        )}
        <span className="font-semibold ml-2 text-gray-500 whitespace-nowrap text-xs">
          {fmt(item.valor_unitario * item.quantidade_recebida)}
        </span>
        {canRecusar && !isCancelado && !editandoQtd && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => {
              setShowRecusarModal(item.item_contrato_id)
              setMotivoRecusar('')
            }}
            title="Recusar item (cancela recebimento total)"
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
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
      {/* Toolbar */}
      {!almoxAceito && !patrimAceito && (
        <div className="flex items-center gap-2 justify-end">
          {editandoQtd ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditandoQtd(false)}>
                Cancelar Edicao
              </Button>
              <Button size="sm" onClick={salvarQuantidades} disabled={salvandoQtd}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {salvandoQtd ? 'Salvando...' : 'Salvar Quantidades'}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={iniciarEdicao}>
                <Edit3 className="h-3.5 w-3.5 mr-1" />
                Recebimento Parcial
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { setShowCancelarModal(true); setMotivoCancelar('') }}
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                Cancelar Recebimento
              </Button>
            </>
          )}
        </div>
      )}

      {sucessoMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center">
          {sucessoMsg}
        </div>
      )}

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
            {itensConsumo.map((item: any, idx: number) => renderItemRow(item, idx, !almoxAceito))}
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
                  disabled={loadingAlmox || editandoQtd}
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
            {itensPermanente.map((item: any, idx: number) => renderItemRow(item, idx, !patrimAceito))}
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
                  disabled={loadingPatrim || itensPermanente.length === 0 || editandoQtd}
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
              OF {recebimento?.numero} · Valor recebido: {fmt(recebimento?.valor_total_recebido)}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center font-extrabold text-sm ${aceitos >= total ? 'border-green-500 text-green-500' : 'border-gray-200 text-gray-400'}`}>
            {aceitos}/{total}
          </div>
        </CardContent>
      </Card>

      {/* Historico de ocorrencias */}
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

      {erro && <p className="text-sm text-red-600 text-center">{erro}</p>}

      {/* Modal Cancelar Recebimento */}
      {showCancelarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCancelarModal(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="font-bold text-base">Cancelar Recebimento</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Esta acao cancelara o recebimento completo. A ordem de fornecimento voltara ao status anterior.
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

      {/* Modal Recusar Item */}
      {showRecusarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRecusarModal(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <XCircle className="h-6 w-6 text-red-500" />
              <h3 className="font-bold text-base">Recusar Item</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <strong>Atencao:</strong> Recusar um item cancela o recebimento inteiro.
              A nota fiscal sera devolvida e um novo recebimento devera ser feito.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Item: {itens.find((i: any) => i.item_contrato_id === showRecusarModal)?.descricao || '-'}
            </p>
            <select
              value={motivoRecusar}
              onChange={(e) => setMotivoRecusar(e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm mb-2"
            >
              <option value="">Selecione o motivo...</option>
              <option value="Produto com defeito">Produto com defeito</option>
              <option value="Produto diferente do pedido">Produto diferente do pedido</option>
              <option value="Quantidade divergente">Quantidade divergente</option>
              <option value="Produto com validade vencida">Produto com validade vencida</option>
              <option value="Embalagem danificada">Embalagem danificada</option>
              <option value="Outro">Outro</option>
            </select>
            {motivoRecusar === 'Outro' && (
              <textarea
                onChange={(e) => setMotivoRecusar(e.target.value)}
                placeholder="Descreva o motivo..."
                className="w-full border rounded-lg p-3 text-sm mb-2 min-h-[60px] resize-none"
              />
            )}
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowRecusarModal(null)}>
                Voltar
              </Button>
              <Button variant="destructive" size="sm" onClick={handleRecusar} disabled={recusando}>
                {recusando ? 'Processando...' : 'Recusar e Cancelar Recebimento'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
