'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Check, Bot, ArrowRight, AlertTriangle, TrendingUp, TrendingDown, Info, ShieldAlert } from 'lucide-react'

interface MapeamentoItem {
  produto_nf_index: number
  xProd_nf: string
  item_contrato_id: string | null
  descricao_of: string | null
  confianca: number
  justificativa: string
}

interface ProdutoXml {
  nItem: number
  xProd: string
  qCom: number
  uCom: string
  vUnCom: number
  vProd: number
}

interface ItemOf {
  item_contrato_id: string
  descricao: string
  unidade_medida: string
  quantidade: number
  quantidade_entregue?: number
  valor_unitario: number
  tipo_item?: string
}

interface EtapaMapeamentoProps {
  mapeamento: MapeamentoItem[]
  produtosXml: ProdutoXml[]
  itensOf: ItemOf[]
  itensJaRecebidos?: { item_contrato_id: string; descricao: string }[]
  recebimentosAceitos?: any[]
  iaIndisponivel: boolean
  jaConfirmado?: boolean
  valorTotalOf?: number
  valorEntregueOf?: number
  onConfirmar: (mapeamentoConfirmado: any[]) => void
  onRecusarNF?: (motivo: string) => void
  loading: boolean
}

interface Divergencia {
  tipo: 'quantidade_maior' | 'quantidade_menor' | 'valor_diferente' | 'item_extra_nf' | 'item_faltante_of'
  severidade: 'alta' | 'media' | 'baixa'
  mensagem: string
  orientacao: string
  produtoNf?: string
  itemOf?: string
}

export function EtapaMapeamento({
  mapeamento,
  produtosXml,
  itensOf,
  itensJaRecebidos = [],
  recebimentosAceitos = [],
  iaIndisponivel,
  jaConfirmado,
  valorTotalOf: valorTotalOfProp,
  valorEntregueOf = 0,
  onConfirmar,
  onRecusarNF,
  loading,
}: EtapaMapeamentoProps) {
  const [confirmados, setConfirmados] = useState<Record<number, boolean>>(() => {
    if (jaConfirmado) {
      const initial: Record<number, boolean> = {}
      mapeamento.forEach(m => { initial[m.produto_nf_index] = true })
      return initial
    }
    return {}
  })
  const [showRecusarModal, setShowRecusarModal] = useState(false)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [recusando, setRecusando] = useState(false)
  const [selecoes, setSelecoes] = useState<Record<number, string | null>>(() => {
    const initial: Record<number, string | null> = {}
    mapeamento.forEach(m => {
      initial[m.produto_nf_index] = m.item_contrato_id
    })
    return initial
  })

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const confiancaColor = (c: number) =>
    c >= 95 ? 'text-green-600' : c >= 80 ? 'text-amber-600' : 'text-red-500'

  const confiancaBg = (c: number) =>
    c >= 95 ? 'bg-green-500' : c >= 80 ? 'bg-amber-500' : 'bg-red-500'

  const confirmarItem = (index: number) => {
    setConfirmados(prev => ({ ...prev, [index]: true }))
  }

  const todosConfirmados = mapeamento.every(
    m => confirmados[m.produto_nf_index]
  )

  const idsJaRecebidos = new Set(itensJaRecebidos.map(i => i.item_contrato_id))

  const handleConfirmarTodos = () => {
    const result = mapeamento.map(m => ({
      produto_nf_index: m.produto_nf_index,
      xProd_nf: m.xProd_nf,
      item_contrato_id: selecoes[m.produto_nf_index] ?? m.item_contrato_id,
      descricao_of: itensOf.find(i => i.item_contrato_id === (selecoes[m.produto_nf_index] ?? m.item_contrato_id))?.descricao ?? m.descricao_of,
    }))
    const comItensRecebidos = result.filter(r => r.item_contrato_id && idsJaRecebidos.has(r.item_contrato_id))
    if (comItensRecebidos.length > 0) {
      alert(`Os itens [${comItensRecebidos.map(r => itensJaRecebidos.find(i => i.item_contrato_id === r.item_contrato_id)?.descricao || r.descricao_of).join(', ')}] já foram recebidos. Altere o mapeamento para itens pendentes.`)
      return
    }
    onConfirmar(result)
  }

  const matchCount = mapeamento.filter(m => m.item_contrato_id).length
  const confirmedCount = Object.values(confirmados).filter(Boolean).length

  const analise = useMemo(() => {
    const divergencias: Divergencia[] = []
    let valorTotalNf = 0
    let valorTotalOfMapeado = 0

    for (const m of mapeamento) {
      const prod = produtosXml.find(p => p.nItem === m.produto_nf_index)
      const ofItem = m.item_contrato_id
        ? itensOf.find(i => i.item_contrato_id === m.item_contrato_id)
        : null

      if (prod) valorTotalNf += prod.vProd || (prod.qCom * prod.vUnCom)

      if (prod && ofItem) {
        const qtdEntregue = ofItem.quantidade_entregue ?? 0
        const quantidadePendente = Math.max(0, ofItem.quantidade - qtdEntregue)
        valorTotalOfMapeado += ofItem.valor_unitario * quantidadePendente

        if (prod.qCom > quantidadePendente) {
          divergencias.push({
            tipo: 'quantidade_maior',
            severidade: 'alta',
            mensagem: `"${prod.xProd}": NF com ${prod.qCom} ${prod.uCom}, mas OF pendente e apenas ${quantidadePendente} ${ofItem.unidade_medida}`,
            orientacao: `Excedente de ${prod.qCom - quantidadePendente} un. Verifique se ha outra OF pendente para este fornecedor ou se sera necessario devolver o excedente.`,
            produtoNf: prod.xProd,
            itemOf: ofItem.descricao,
          })
        } else if (prod.qCom < quantidadePendente) {
          divergencias.push({
            tipo: 'quantidade_menor',
            severidade: 'media',
            mensagem: `"${prod.xProd}": NF com ${prod.qCom} ${prod.uCom}, mas OF pendente e ${quantidadePendente} ${ofItem.unidade_medida}`,
            orientacao: `Faltam ${quantidadePendente - prod.qCom} un. O recebimento sera parcial para este item. O saldo ficara em aberto na OF.`,
            produtoNf: prod.xProd,
            itemOf: ofItem.descricao,
          })
        }

        const diffValor = Math.abs(prod.vUnCom - ofItem.valor_unitario)
        const percentDiff = ofItem.valor_unitario > 0 ? (diffValor / ofItem.valor_unitario) * 100 : 0
        if (percentDiff > 5) {
          divergencias.push({
            tipo: 'valor_diferente',
            severidade: percentDiff > 20 ? 'alta' : 'media',
            mensagem: `"${prod.xProd}": Valor unitario NF ${fmt(prod.vUnCom)} vs OF ${fmt(ofItem.valor_unitario)} (${percentDiff.toFixed(0)}% de diferenca)`,
            orientacao: percentDiff > 20
              ? 'Diferenca significativa. Verifique com o fornecedor antes de aceitar.'
              : 'Diferenca pequena, pode ser arredondamento ou reajuste contratual.',
            produtoNf: prod.xProd,
            itemOf: ofItem.descricao,
          })
        }
      }
    }

    const itensOfNaoMapeados = itensOf.filter(
      of => !mapeamento.some(m => m.item_contrato_id === of.item_contrato_id || selecoes[mapeamento.find(mm => mm.item_contrato_id === of.item_contrato_id)?.produto_nf_index || -1] === of.item_contrato_id)
    )
    for (const of of itensOfNaoMapeados) {
      const qtdPend = Math.max(0, of.quantidade - (of.quantidade_entregue ?? 0))
      if (qtdPend > 0) {
        divergencias.push({
          tipo: 'item_faltante_of',
          severidade: 'media',
          mensagem: `"${of.descricao}" consta na OF mas nao foi encontrado na NF`,
          orientacao: 'Este item pode vir em outra NF ou o fornecedor nao entregou. O item ficara pendente na OF.',
          itemOf: of.descricao,
        })
      }
    }

    const valorTotalOf = valorTotalOfProp ?? valorTotalOfMapeado
    const valorPendenteOf = valorTotalOfProp != null
      ? Math.max(0, valorTotalOfProp - valorEntregueOf)
      : valorTotalOfMapeado

    const altaSeveridade = divergencias.filter(d => d.severidade === 'alta').length
    const mediaSeveridade = divergencias.filter(d => d.severidade === 'media').length

    return { divergencias, valorTotalNf, valorTotalOf, valorPendenteOf, valorEntregueOf, altaSeveridade, mediaSeveridade }
  }, [mapeamento, produtosXml, itensOf, selecoes, valorTotalOfProp, valorEntregueOf])

  const getDivergenciasItem = (prodNfIndex: number, itemContratoId: string | null) => {
    if (!itemContratoId) return []
    const prod = produtosXml.find(p => p.nItem === prodNfIndex)
    const ofItem = itensOf.find(i => i.item_contrato_id === itemContratoId)
    if (!prod || !ofItem) return []
    return analise.divergencias.filter(
      d => d.produtoNf === prod.xProd && d.itemOf === ofItem.descricao
    )
  }

  const mapeamentoComItensRecebidos = mapeamento.filter(m => m.item_contrato_id && idsJaRecebidos.has(m.item_contrato_id))
  const temItensJaRecebidosNoMapeamento = mapeamentoComItensRecebidos.length > 0

  return (
    <div className="space-y-4">
      {/* REQ-ALM-001: Alerta quando XML contém itens já atestados */}
      {temItensJaRecebidosNoMapeamento && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800 text-sm">
                  Atenção: Os itens [{mapeamentoComItensRecebidos.map(m => {
                    const item = itensJaRecebidos.find(i => i.item_contrato_id === m.item_contrato_id)
                    return item?.descricao || m.xProd_nf
                  }).join(', ')}] já foram recebidos em recebimento anterior.
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Somente os itens pendentes serão disponibilizados para ateste. Corrija o mapeamento abaixo para vincular esses produtos da NF a itens pendentes ou deixe sem vínculo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-analise */}
      {analise.divergencias.length > 0 && (
        <Card className={analise.altaSeveridade > 0 ? 'border-red-300 bg-red-50/30' : 'border-amber-300 bg-amber-50/30'}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className={`h-5 w-5 ${analise.altaSeveridade > 0 ? 'text-red-500' : 'text-amber-500'}`} />
              Pre-Analise: {analise.divergencias.length} divergencia(s) encontrada(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="bg-white rounded-lg p-3 border text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Valor Total NF</p>
                <p className="font-bold text-base">{fmt(analise.valorTotalNf)}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Valor Total OF</p>
                <p className="font-bold text-base">{fmt(analise.valorTotalOf)}</p>
              </div>
              {analise.valorEntregueOf > 0 && (
                <div className="bg-white rounded-lg p-3 border text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Ja entregue</p>
                  <p className="font-bold text-base text-green-600">{fmt(analise.valorEntregueOf)}</p>
                </div>
              )}
              <div className="bg-white rounded-lg p-3 border text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Valor pendente na OF</p>
                <p className="font-bold text-base">{fmt(analise.valorPendenteOf)}</p>
                {Math.abs(analise.valorTotalNf - analise.valorPendenteOf) > 0.01 && (
                  <p className={`text-xs mt-1 font-semibold ${analise.valorTotalNf > analise.valorPendenteOf ? 'text-red-600' : 'text-amber-600'}`}>
                    {analise.valorTotalNf > analise.valorPendenteOf
                      ? `NF excede pendente em ${fmt(analise.valorTotalNf - analise.valorPendenteOf)}`
                      : `Pendente excede NF em ${fmt(analise.valorPendenteOf - analise.valorTotalNf)}`}
                  </p>
                )}
              </div>
            </div>

            {analise.divergencias.map((div, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${
                  div.severidade === 'alta' ? 'bg-red-50 border-red-200' :
                  div.severidade === 'media' ? 'bg-amber-50 border-amber-200' :
                  'bg-blue-50 border-blue-200'
                }`}
              >
                {div.tipo === 'quantidade_maior' ? (
                  <TrendingUp className={`h-4 w-4 mt-0.5 flex-shrink-0 ${div.severidade === 'alta' ? 'text-red-500' : 'text-amber-500'}`} />
                ) : div.tipo === 'quantidade_menor' ? (
                  <TrendingDown className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
                ) : (
                  <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${div.severidade === 'alta' ? 'text-red-500' : 'text-amber-500'}`} />
                )}
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{div.mensagem}</p>
                  <p className="text-gray-600 mt-1 flex items-center gap-1">
                    <Info className="h-3 w-3" /> {div.orientacao}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${
                  div.severidade === 'alta' ? 'border-red-300 text-red-600' :
                  div.severidade === 'media' ? 'border-amber-300 text-amber-600' :
                  'border-blue-300 text-blue-600'
                }`}>
                  {div.severidade === 'alta' ? 'CRITICA' : div.severidade === 'media' ? 'ATENCAO' : 'INFO'}
                </Badge>
              </div>
            ))}

            {onRecusarNF && (
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-red-200">
                <p className="text-xs text-gray-600">
                  Caso as divergencias sejam impeditivas, recuse a NF e notifique o fornecedor.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { setShowRecusarModal(true); setMotivoRecusa('') }}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Recusar NF e Notificar Fornecedor
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {analise.divergencias.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-semibold text-green-800 text-sm">NF compativel com a OF</p>
            <p className="text-xs text-green-700">Quantidades e valores estao de acordo. Confirme os vinculos para prosseguir.</p>
          </div>
        </div>
      )}

      {iaIndisponivel && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <Bot className="h-6 w-6 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800">IA indisponivel</p>
            <p className="text-sm text-amber-700">Mapeamento manual necessario. Selecione os itens correspondentes.</p>
          </div>
        </div>
      )}

      {!iaIndisponivel && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-blue-600" />
            <div>
              <p className="font-semibold text-blue-800">
                IA identificou {matchCount} de {mapeamento.length} produtos
              </p>
              <p className="text-sm text-blue-700">Revise e confirme os vinculos antes de prosseguir.</p>
            </div>
          </div>
          <div className="bg-white rounded-lg px-3 py-1.5 border border-blue-200 text-sm font-bold text-blue-700">
            {confirmedCount}/{mapeamento.length} confirmados
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_28px_1fr_100px_90px] gap-3 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
        <div>Produto da NF</div>
        <div />
        <div>Produto no Sistema</div>
        <div>Confianca</div>
        <div>Acao</div>
      </div>

      {mapeamento.map(item => {
        const prod = produtosXml.find(p => p.nItem === item.produto_nf_index)
        const selectedItemId = selecoes[item.produto_nf_index] || item.item_contrato_id
        const ofItem = selectedItemId ? itensOf.find(i => i.item_contrato_id === selectedItemId) : null
        const isConfirmed = confirmados[item.produto_nf_index]
        const itemDivergencias = getDivergenciasItem(item.produto_nf_index, selectedItemId)

        return (
          <div key={item.produto_nf_index} className="space-y-0">
            <Card className={isConfirmed ? 'border-green-200 bg-green-50/50' : itemDivergencias.length > 0 ? 'border-amber-200' : ''}>
              <CardContent className="py-3 grid grid-cols-[1fr_28px_1fr_100px_90px] gap-3 items-center">
                <div>
                  <p className="text-sm font-semibold">{item.xProd_nf}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      {prod?.qCom} {prod?.uCom} · {fmt(prod?.vUnCom || 0)}/un
                    </span>
                  </div>
                  {ofItem && prod && (() => {
                    const qtdPend = Math.max(0, ofItem.quantidade - (ofItem.quantidade_entregue ?? 0))
                    if (prod.qCom === qtdPend) return null
                    return (
                      <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold ${prod.qCom > qtdPend ? 'text-red-600' : 'text-amber-600'}`}>
                        {prod.qCom > qtdPend ? (
                          <><TrendingUp className="h-3 w-3" /> NF: {prod.qCom} un &gt; OF pendente: {qtdPend} un (excedente: {prod.qCom - qtdPend})</>
                        ) : (
                          <><TrendingDown className="h-3 w-3" /> NF: {prod.qCom} un &lt; OF pendente: {qtdPend} un (faltam: {qtdPend - prod.qCom})</>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div className="text-center text-gray-300 text-lg">→</div>

                <div>
                  {selecoes[item.produto_nf_index] ? (
                    <div>
                      <p className="text-sm font-semibold">
                        {itensOf.find(i => i.item_contrato_id === selecoes[item.produto_nf_index])?.descricao || item.descricao_of}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ID: {selecoes[item.produto_nf_index]!.substring(0, 8)}...
                      </p>
                      {ofItem && (
                        <p className="text-xs text-gray-500">
                          OF pendente: {Math.max(0, ofItem.quantidade - (ofItem.quantidade_entregue ?? 0))} {ofItem.unidade_medida} · {fmt(ofItem.valor_unitario)}/un
                        </p>
                      )}
                    </div>
                  ) : (
                    <Select
                      onValueChange={(value) => {
                        setSelecoes(prev => ({ ...prev, [item.produto_nf_index]: value }))
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs border-amber-300 bg-amber-50">
                        <SelectValue placeholder="Selecionar item da OF..." />
                      </SelectTrigger>
                      <SelectContent>
                        {itensOf.map(of => {
                          const qtdPend = Math.max(0, of.quantidade - (of.quantidade_entregue ?? 0))
                          return (
                            <SelectItem key={of.item_contrato_id} value={of.item_contrato_id}>
                              <span className="text-xs">{of.descricao} — {qtdPend} {of.unidade_medida} pendente</span>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  {item.item_contrato_id ? (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${confiancaBg(item.confianca)}`}
                          style={{ width: `${item.confianca}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${confiancaColor(item.confianca)}`}>
                        {item.confianca}% IA
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-red-300">—</span>
                  )}
                </div>

                <div>
                  {isConfirmed ? (
                    <span className="text-xs text-green-600 font-bold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> OK
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={selecoes[item.produto_nf_index] ? 'default' : 'outline'}
                      onClick={() => confirmarItem(item.produto_nf_index)}
                      disabled={!selecoes[item.produto_nf_index]}
                      className="text-xs h-7"
                    >
                      Confirmar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })}

      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-gray-500">
          {mapeamento.length - confirmedCount > 0
            ? `${mapeamento.length - confirmedCount} item(ns) aguardando confirmacao`
            : 'Todos os vinculos confirmados'}
        </span>
        <Button
          onClick={handleConfirmarTodos}
          disabled={!todosConfirmados || loading}
          size="lg"
        >
          {loading ? 'Processando...' : 'Prosseguir para Recebimento'}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* Modal Recusar NF */}
      {showRecusarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRecusarModal(false)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="font-bold text-base">Recusar Nota Fiscal e Notificar Fornecedor</h3>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              A NF sera recusada e o fornecedor sera notificado sobre as divergencias. Informe o motivo detalhado abaixo.
            </p>

            {analise.divergencias.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs space-y-1">
                <p className="font-semibold text-gray-700 mb-1">Divergencias detectadas:</p>
                {analise.divergencias.map((d, i) => (
                  <p key={i} className="text-gray-600">• {d.mensagem}</p>
                ))}
              </div>
            )}

            <select
              value={motivoRecusa}
              onChange={(e) => setMotivoRecusa(e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm mb-2"
            >
              <option value="">Selecione o motivo principal...</option>
              <option value="Quantidade divergente da OF">Quantidade divergente da OF</option>
              <option value="Valor divergente do contrato">Valor divergente do contrato</option>
              <option value="Produto nao corresponde ao pedido">Produto nao corresponde ao pedido</option>
              <option value="NF com dados incorretos">NF com dados incorretos</option>
              <option value="Outro">Outro</option>
            </select>
            {motivoRecusa === 'Outro' && (
              <textarea
                onChange={(e) => setMotivoRecusa(e.target.value)}
                placeholder="Descreva o motivo..."
                className="w-full border rounded-lg p-3 text-sm mb-2 min-h-[60px] resize-none"
              />
            )}
            <textarea
              placeholder="Observacoes adicionais para o fornecedor (opcional)..."
              className="w-full border rounded-lg p-3 text-sm mb-4 min-h-[60px] resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowRecusarModal(false)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!motivoRecusa.trim() || recusando}
                onClick={async () => {
                  setRecusando(true)
                  try {
                    if (onRecusarNF) {
                      const detalhes = analise.divergencias.map(d => d.mensagem).join('; ')
                      await onRecusarNF(`${motivoRecusa}. Divergencias: ${detalhes}`)
                    }
                    setShowRecusarModal(false)
                  } finally {
                    setRecusando(false)
                  }
                }}
              >
                {recusando ? 'Processando...' : 'Confirmar Recusa e Notificar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
