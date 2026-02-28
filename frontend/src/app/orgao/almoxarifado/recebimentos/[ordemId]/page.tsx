'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Package, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch } from '@/lib/api'
import { StepIndicator } from '../components/StepIndicator'
import { EtapaNF } from '../components/EtapaNF'
import { EtapaMapeamento } from '../components/EtapaMapeamento'
import { EtapaRecebimento } from '../components/EtapaRecebimento'

const STEPS = [
  { key: 'nf', label: '1. Nota Fiscal' },
  { key: 'mapeamento', label: '2. Vincular Produtos' },
  { key: 'recebimento', label: '3. Recebimento' },
]

function RecebimentoUnificadoContent() {
  const params = useParams()
  const router = useRouter()
  const ordemId = params.ordemId as string

  const [loading, setLoading] = useState(true)
  const [ordem, setOrdem] = useState<any>(null)
  const [notaFiscal, setNotaFiscal] = useState<any>(null)
  const [recebimentos, setRecebimentos] = useState<any[]>([])
  const [mapeamento, setMapeamento] = useState<any[]>([])
  const [iaIndisponivel, setIaIndisponivel] = useState(false)
  const [etapa, setEtapa] = useState<string>('nf')
  const [processing, setProcessing] = useState(false)
  const [podeReceberPatrimonio, setPodeReceberPatrimonio] = useState(false)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [resUnif, resUser] = await Promise.all([
        authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/recebimento-unificado`),
        authFetch(`${API_URL}/api/usuarios/me`),
      ])

      if (resUnif.ok) {
        const data = await resUnif.json()
        setOrdem(data.ordem)
        setNotaFiscal(data.notaFiscal)
        setRecebimentos(data.recebimentos || [])

        if (data.recebimentos?.length > 0) {
          setEtapa('recebimento')
        } else if (data.notaFiscal?.mapeamento_ai || data.notaFiscal?.mapeamento_confirmado) {
          setMapeamento(data.notaFiscal.mapeamento_ai || data.notaFiscal.mapeamento_confirmado || [])
          if (data.notaFiscal.mapeamento_confirmado) {
            setEtapa('recebimento')
          } else {
            setEtapa('mapeamento')
          }
        } else if (data.notaFiscal) {
          setEtapa('nf')
        } else {
          setEtapa('nf')
        }
      }

      if (resUser.ok) {
        const user = await resUser.json()
        setPodeReceberPatrimonio(!!user.pode_receber_patrimonio)
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }, [ordemId])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const handleImportarXml = async () => {
    setProcessing(true)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/matching-ia`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setMapeamento(data.mapeamento || [])
        setIaIndisponivel(data.ia_indisponivel || false)
        setEtapa('mapeamento')
      }
    } catch {
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirmarMapeamento = async (mapeamentoConfirmado: any[]) => {
    if (!notaFiscal) return
    setProcessing(true)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${notaFiscal.id}/confirmar-mapeamento`, {
        method: 'POST',
        body: JSON.stringify({ mapeamento: mapeamentoConfirmado }),
      })
      if (res.ok) {
        await carregarDados()
        setEtapa('recebimento')
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.message || 'Erro ao confirmar mapeamento')
      }
    } catch {
    } finally {
      setProcessing(false)
    }
  }

  const completedSteps = (() => {
    const completed: string[] = []
    if (notaFiscal) completed.push('nf')
    if (mapeamento.length > 0 && etapa !== 'mapeamento') completed.push('mapeamento')
    if (recebimentos.length > 0 && (recebimentos[0]?.aceite_almoxarifado_data || recebimentos[0]?.aceite_patrimonio_data)) {
      completed.push('recebimento')
    }
    return completed
  })()

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b">
        <Button variant="ghost" size="sm" onClick={() => router.push('/orgao/almoxarifado/recebimentos')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-blue-600" />
          <div>
            <h1 className="text-base font-bold">Recebimento — OF {ordem?.numero || '-'}</h1>
            <p className="text-xs text-gray-500">
              {ordem?.fornecedor?.razao_social || '-'} · {fmt(ordem?.valor_total)}
            </p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      {notaFiscal && (
        <StepIndicator
          steps={STEPS}
          currentStep={etapa}
          completedSteps={completedSteps}
          onStepClick={setEtapa}
        />
      )}

      {/* Content */}
      <div className="p-6">
        {etapa === 'nf' && (
          <EtapaNF
            notaFiscal={notaFiscal}
            ordem={ordem}
            onImportarXml={handleImportarXml}
            onNfEnviada={carregarDados}
            loading={processing}
          />
        )}

        {etapa === 'mapeamento' && (
          <EtapaMapeamento
            mapeamento={mapeamento}
            produtosXml={notaFiscal?.produtos_xml || []}
            itensOf={ordem?.itens || []}
            iaIndisponivel={iaIndisponivel}
            jaConfirmado={!!notaFiscal?.mapeamento_confirmado || recebimentos.length > 0}
            onConfirmar={handleConfirmarMapeamento}
            onRecusarNF={async (motivo: string) => {
              try {
                if (recebimentos.length > 0) {
                  await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recebimentos[0].id}/cancelar`, {
                    method: 'POST',
                    body: JSON.stringify({ motivo }),
                  })
                }
                if (ordem?.id) {
                  const motivoCompleto = `NF recusada na pre-analise: ${motivo}`
                  await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordem.id}/cancelar`, {
                    method: 'POST',
                    body: JSON.stringify({ motivo: motivoCompleto }),
                  })
                }
                carregarDados()
              } catch (e) {
                console.error('Erro ao recusar NF:', e)
              }
            }}
            loading={processing}
          />
        )}

        {etapa === 'recebimento' && recebimentos.length > 0 && (
          <EtapaRecebimento
            recebimento={recebimentos[0]}
            ordemId={ordemId}
            podeReceberPatrimonio={podeReceberPatrimonio}
            onUpdate={carregarDados}
          />
        )}

        {etapa === 'recebimento' && recebimentos.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              <p>Nenhum recebimento criado ainda. Complete o mapeamento para prosseguir.</p>
              <Button className="mt-4" onClick={() => setEtapa('mapeamento')}>
                Voltar para Mapeamento
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Resumo da OF */}
        {ordem && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm">Detalhes da Ordem de Fornecimento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                <div>
                  <p className="text-gray-500 text-xs">Numero</p>
                  <p className="font-semibold">{ordem.numero}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Fornecedor</p>
                  <p className="font-semibold">{ordem.fornecedor?.razao_social || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Valor Total</p>
                  <p className="font-semibold">{fmt(ordem.valor_total)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Status</p>
                  <Badge>{ordem.status}</Badge>
                </div>
              </div>

              {ordem.itens?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-500 uppercase">Itens ({ordem.itens.length})</p>
                  {ordem.itens.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded text-xs">
                      <span className="flex-1">{item.descricao}</span>
                      <Badge variant="outline" className="text-[10px] ml-2">
                        {item.tipo_item || 'CONSUMO'}
                      </Badge>
                      <span className="ml-3 font-semibold whitespace-nowrap">
                        {item.quantidade} {item.unidade_medida}
                      </span>
                      <span className="ml-3 text-gray-500 whitespace-nowrap">{fmt(item.valor_unitario)}/un</span>
                      <span className="ml-3 font-bold whitespace-nowrap">{fmt(item.valor_total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function RecebimentoUnificadoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <RecebimentoUnificadoContent />
    </ModuleGuard>
  )
}
