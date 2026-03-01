'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Package, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const searchParams = useSearchParams()
  const ordemId = params.ordemId as string
  const nfIdUrl = searchParams.get('nf_id') || undefined

  const [loading, setLoading] = useState(true)
  const [ordem, setOrdem] = useState<any>(null)
  const [notaFiscal, setNotaFiscal] = useState<any>(null)
  const [recebimentos, setRecebimentos] = useState<any[]>([])
  const [itensPendentes, setItensPendentes] = useState<any[]>([])
  const [itensJaRecebidos, setItensJaRecebidos] = useState<any[]>([])
  const [recebimentoAtivo, setRecebimentoAtivo] = useState<any>(null)
  const [notasFiscais, setNotasFiscais] = useState<any[]>([])
  const [aguardarProximaNf, setAguardarProximaNf] = useState(false)
  const [mapeamento, setMapeamento] = useState<any[]>([])
  const [iaIndisponivel, setIaIndisponivel] = useState(false)
  const [etapa, setEtapa] = useState<string>('nf')
  const [processing, setProcessing] = useState(false)
  const [podeReceberPatrimonio, setPodeReceberPatrimonio] = useState(false)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const url = nfIdUrl
        ? `${API_URL}/api/almoxarifado/ordens/${ordemId}/recebimento-unificado?nf_id=${nfIdUrl}`
        : `${API_URL}/api/almoxarifado/ordens/${ordemId}/recebimento-unificado`
      const [resUnif, resUser] = await Promise.all([
        authFetch(url),
        authFetch(`${API_URL}/api/usuarios/me`),
      ])

      if (resUnif.ok) {
        const data = await resUnif.json()
        setOrdem(data.ordem)
        setNotaFiscal(data.notaFiscal)
        setRecebimentos(data.recebimentos || [])
        setItensPendentes(data.itensPendentes || [])
        setItensJaRecebidos(data.itensJaRecebidos || [])
        setNotasFiscais(data.notasFiscais || [])
        setAguardarProximaNf(data.aguardarProximaNf || false)

        if (data.aguardarProximaNf && nfIdUrl) {
          router.replace(`/orgao/almoxarifado/recebimentos/${ordemId}`, { scroll: false })
        }

        const recebimentosAtivos = (data.recebimentos || []).filter(
          (r: any) => r.status !== 'REJEITADO' && r.status !== 'ESTORNADO'
        )
        const recebimentosCancelados = (data.recebimentos || []).filter(
          (r: any) => r.status === 'REJEITADO' || r.status === 'ESTORNADO'
        )
        // REQ-ALM-001: recebimento ativo da NF atual (pode haver múltiplas NFs em OF parcial)
        const recAtivoParaNfAtual = data.notaFiscal
          ? recebimentosAtivos.find((r: any) => r.nota_fiscal_fornecedor_id === data.notaFiscal?.id)
          : null

        if (recAtivoParaNfAtual) {
          const mapeamentoFonte = data.notaFiscal?.mapeamento_confirmado || data.notaFiscal?.mapeamento_ai || []
          setMapeamento(mapeamentoFonte)
          setRecebimentoAtivo(recAtivoParaNfAtual)
          setEtapa('recebimento')
        } else if (recebimentosAtivos.length > 0 && data.notaFiscal) {
          // Há recebimentos de outra NF (OF parcial), mas a NF atual ainda não tem recebimento → mapeamento
          setMapeamento(data.notaFiscal?.mapeamento_ai || data.notaFiscal?.mapeamento_confirmado || [])
          setEtapa(data.notaFiscal?.mapeamento_confirmado ? 'mapeamento' : data.notaFiscal?.mapeamento_ai ? 'mapeamento' : 'nf')
        } else if (recebimentosCancelados.length > 0 && !data.notaFiscal) {
          setEtapa('nf')
        } else if (data.notaFiscal?.status === 'RECUSADA') {
          setEtapa('nf')
        } else if (recebimentosCancelados.length > 0 && data.notaFiscal) {
          // NF RECUSADA: não reutilizar mapeamento - recebimento deve iniciar do zero
          if (data.notaFiscal.status === 'RECUSADA') {
            setMapeamento([])
          } else {
            const mapeamentoFonte = data.notaFiscal?.mapeamento_confirmado || data.notaFiscal?.mapeamento_ai || []
            setMapeamento(mapeamentoFonte)
          }
          setEtapa('nf')
        } else if (data.notaFiscal?.mapeamento_confirmado) {
          setMapeamento(data.notaFiscal.mapeamento_confirmado)
          setRecebimentoAtivo(recebimentosAtivos.find((r: any) => r.nota_fiscal_fornecedor_id === data.notaFiscal?.id) || recebimentosAtivos[0] || null)
          setEtapa('recebimento')
        } else if (data.notaFiscal?.mapeamento_ai) {
          setMapeamento(data.notaFiscal.mapeamento_ai)
          setEtapa('mapeamento')
        } else if (data.notaFiscal) {
          setEtapa('nf')
        } else if (data.aguardarProximaNf) {
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
  }, [ordemId, nfIdUrl])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const handleImportarXml = async () => {
    setProcessing(true)
    try {
      const body = notaFiscal?.id ? { nf_id: notaFiscal.id } : {}
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/matching-ia`, {
        method: 'POST',
        body: JSON.stringify(body),
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

      {/* Seletor NF quando múltiplas NFs */}
      {notasFiscais.length > 1 && (
        <div className="px-6 py-2 bg-gray-50 border-b flex gap-2 flex-wrap">
          {notasFiscais.map((nf: any) => (
            <Button
              key={nf.id}
              variant={notaFiscal?.id === nf.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => router.push(`/orgao/almoxarifado/recebimentos/${ordemId}?nf_id=${nf.id}`)}
            >
              NF {nf.numero || nf.id?.slice(0, 8)}
            </Button>
          ))}
        </div>
      )}

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
          <>
            {aguardarProximaNf && (
              <Card className="mb-6 border-amber-200 bg-amber-50/50">
                <CardContent className="py-4">
                  <p className="font-semibold text-amber-800">
                    OF parcialmente atendida. Envie a próxima nota fiscal para continuar.
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    O valor da ordem ainda não foi atingido. Anexe o XML e o PDF da próxima NF abaixo.
                  </p>
                </CardContent>
              </Card>
            )}
            <EtapaNF
              notaFiscal={notaFiscal}
              ordem={ordem}
              notasFiscais={notasFiscais}
              aguardarProximaNf={aguardarProximaNf}
              onImportarXml={handleImportarXml}
              onNfEnviada={carregarDados}
              loading={processing}
            />
          </>
        )}

        {etapa === 'mapeamento' && (
          <EtapaMapeamento
            mapeamento={mapeamento}
            produtosXml={notaFiscal?.produtos_xml || []}
            itensOf={itensPendentes.length > 0 ? itensPendentes : (ordem?.itens || [])}
            itensJaRecebidos={itensJaRecebidos}
            recebimentosAceitos={recebimentos.filter((r: any) => r.status === 'ACEITO')}
            iaIndisponivel={iaIndisponivel}
            jaConfirmado={!!notaFiscal?.mapeamento_confirmado || recebimentos.some((r: any) => r.status !== 'REJEITADO' && r.status !== 'ESTORNADO')}
            onConfirmar={handleConfirmarMapeamento}
            onRecusarNF={async (motivo: string) => {
              try {
                if (notaFiscal?.id) {
                  await authFetch(`${API_URL}/api/almoxarifado/notas-fiscais-fornecedor/${notaFiscal.id}/recusar`, {
                    method: 'POST',
                    body: JSON.stringify({ motivo }),
                  })
                } else {
                  const recAtivo = recebimentos.find((r: any) => r.status !== 'REJEITADO' && r.status !== 'ESTORNADO')
                  if (recAtivo) {
                    await authFetch(`${API_URL}/api/almoxarifado/recebimentos/${recAtivo.id}/cancelar`, {
                      method: 'POST',
                      body: JSON.stringify({ motivo }),
                    })
                  }
                }
                carregarDados()
              } catch (e) {
                console.error('Erro ao recusar NF:', e)
              }
            }}
            loading={processing}
          />
        )}

        {etapa === 'recebimento' && (() => {
          const recAtivos = recebimentos.filter((r: any) => r.status !== 'REJEITADO' && r.status !== 'ESTORNADO')
          const recCancelados = recebimentos.filter((r: any) => r.status === 'REJEITADO' || r.status === 'ESTORNADO')
          const recExibir = recebimentoAtivo || (notaFiscal ? recAtivos.find((r: any) => r.nota_fiscal_fornecedor_id === notaFiscal?.id) : null) || recAtivos[0]
          const ofAberta = (ordem?.valor_entregue ?? 0) < (ordem?.valor_total ?? 0) - 0.01

          if (recExibir) {
            return (
              <div className="space-y-4">
                {ofAberta && (
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="py-4">
                      <p className="text-sm font-medium text-amber-800">
                        Recebimento aceito. Aguardando envio de outras notas para fechar o valor da OF.
                      </p>
                    </CardContent>
                  </Card>
                )}
                <EtapaRecebimento
                  recebimento={recExibir}
                  ordemId={ordemId}
                  podeReceberPatrimonio={podeReceberPatrimonio}
                  onUpdate={carregarDados}
                />
              </div>
            )
          }
          
          if (recCancelados.length > 0) {
            return (
              <div className="space-y-4">
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="py-6">
                    <p className="font-bold text-amber-800">Recebimento anterior foi cancelado/rejeitado</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Motivo: {recCancelados[0].motivo_rejeicao || recCancelados[0].motivo_estorno || 'Não informado'}
                    </p>
                    <p className="text-sm text-amber-700 mt-2">
                      A ordem voltou ao status ENVIADA. Os documentos foram marcados como rejeitados e o fornecedor foi notificado para reenviar. O recebimento deve ser iniciado do zero.
                    </p>
                    <Button onClick={() => setEtapa('nf')} className="mt-4">
                      Iniciar Novo Recebimento
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )
          }

          return (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <p>Nenhum recebimento criado ainda. Complete o mapeamento para prosseguir.</p>
                <Button className="mt-4" onClick={() => setEtapa('mapeamento')}>
                  Voltar para Mapeamento
                </Button>
              </CardContent>
            </Card>
          )
        })()}

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
