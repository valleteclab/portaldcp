'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { gerarPdfMedicao } from '@/lib/pdf-medicao'
import { API_URL } from '@/lib/api'
import {
  CheckCircle,
  XCircle,
  FileText,
  Loader2,
  ShieldCheck,
  PenLine,
  Paperclip,
} from 'lucide-react'

type Etapa = 'carregando' | 'erro' | 'idle' | 'aguardando-otp' | 'confirmando' | 'assinado' | 'recusado'

export default function AssinarMedicaoPage() {
  const params = useParams()
  const token = params?.token as string

  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [dados, setDados] = useState<any>(null)
  const [erroMsg, setErroMsg] = useState('')
  const [otp, setOtp] = useState('')
  const [codigoValidacao, setCodigoValidacao] = useState('')
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [mostraRecusa, setMostraRecusa] = useState(false)
  const [loadingOtp, setLoadingOtp] = useState(false)
  const [loadingAssinar, setLoadingAssinar] = useState(false)
  const [loadingRecusar, setLoadingRecusar] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/api/assinar/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.message || 'Link inválido')))
      .then(d => { setDados(d); setEtapa('idle') })
      .catch(msg => { setErroMsg(typeof msg === 'string' ? msg : 'Link inválido ou expirado.'); setEtapa('erro') })
  }, [token])

  const solicitarOtp = async () => {
    setLoadingOtp(true)
    try {
      const r = await fetch(`${API_URL}/api/assinar/${token}/solicitar-otp`, { method: 'POST' })
      if (r.ok) setEtapa('aguardando-otp')
      else setErroMsg('Não foi possível enviar o código. Verifique se o fiscal possui telefone cadastrado.')
    } catch {
      setErroMsg('Erro de rede. Tente novamente.')
    }
    setLoadingOtp(false)
  }

  const assinar = async () => {
    if (otp.length !== 6) return
    setLoadingAssinar(true)
    setEtapa('confirmando')
    try {
      const r = await fetch(`${API_URL}/api/assinar/${token}/assinar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: otp }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setErroMsg(err.message || 'Código inválido ou expirado.')
        setEtapa('aguardando-otp')
        setLoadingAssinar(false)
        return
      }
      const data = await r.json()
      setCodigoValidacao(data.codigo_formatado || data.codigo_validacao || '')

      // Regenerar PDF com layout correto (jsPDF) e fazer upload
      if (data.dados_pdf && data.medicao_id) {
        try {
          const pdfBlob = gerarPdfMedicao(data.dados_pdf)
          const formData = new FormData()
          formData.append('arquivo', pdfBlob, `boletim_${data.medicao_id}.pdf`)
          await fetch(
            `${API_URL}/api/contratos/medicoes/${data.medicao_id}/upload-boletim-oficial`,
            { method: 'POST', body: formData },
          )
        } catch (e) {
          console.warn('Não foi possível fazer upload do PDF assinado:', e)
        }
      }

      setEtapa('assinado')
    } catch {
      setErroMsg('Erro de rede. Tente novamente.')
      setEtapa('aguardando-otp')
    }
    setLoadingAssinar(false)
  }

  const recusar = async () => {
    setLoadingRecusar(true)
    try {
      const r = await fetch(`${API_URL}/api/assinar/${token}/recusar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoRecusa }),
      })
      if (r.ok) setEtapa('recusado')
      else setErroMsg('Erro ao registrar recusa.')
    } catch {
      setErroMsg('Erro de rede.')
    }
    setLoadingRecusar(false)
  }

  const fmtMoeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtData  = (d: string) => d ? new Date(d).toLocaleDateString('pt-BR') : ''

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-blue-700 p-2 rounded-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Portal DCP — Assinatura de Boletim</h1>
            <p className="text-xs text-gray-500">Assinatura Eletrônica · Lei nº 14.063/2020</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Carregando */}
        {etapa === 'carregando' && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        )}

        {/* Erro */}
        {etapa === 'erro' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-red-800 mb-1">Link inválido ou expirado</h2>
            <p className="text-sm text-red-600">{erroMsg}</p>
          </div>
        )}

        {/* Assinado */}
        {etapa === 'assinado' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-green-800 mb-1">Assinatura registrada!</h2>
            <p className="text-sm text-green-700 mb-3">
              O boletim de medição foi assinado digitalmente com sucesso.
            </p>
            {codigoValidacao && (
              <div className="inline-block bg-white border border-green-300 rounded-lg px-4 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Código de validação</p>
                <code className="font-mono font-bold text-blue-700 text-sm">{codigoValidacao}</code>
              </div>
            )}
          </div>
        )}

        {/* Recusado */}
        {etapa === 'recusado' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center">
            <XCircle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-orange-800 mb-1">Recusa registrada</h2>
            <p className="text-sm text-orange-600">O solicitante foi notificado sobre a recusa.</p>
          </div>
        )}

        {/* Conteúdo principal (idle / aguardando-otp / confirmando) */}
        {dados && ['idle', 'aguardando-otp', 'confirmando'].includes(etapa) && (
          <>
            {/* Dados da medição */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Dados da Medição</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div><span className="text-gray-500">Órgão:</span> <span className="font-medium">{dados.orgao_nome}</span></div>
                <div><span className="text-gray-500">Contrato:</span> <span className="font-medium">{dados.numero_contrato}</span></div>
                <div><span className="text-gray-500">Medição Nº:</span> <span className="font-medium">{String(dados.numero_medicao || '').padStart(3, '0')}</span></div>
                <div><span className="text-gray-500">Valor:</span> <span className="font-medium text-blue-700">{fmtMoeda(dados.valor_medido)}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Período:</span> <span className="font-medium">{fmtData(dados.periodo_inicio)} a {fmtData(dados.periodo_fim)}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Fornecedor:</span> <span className="font-medium">{dados.fornecedor_nome}</span></div>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700 mt-2">
                <strong>Fiscal:</strong> {dados.fiscal_nome}
              </div>
            </div>

            {/* Anexos */}
            {dados.anexos?.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4" /> Documentos Anexados ({dados.anexos.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {dados.anexos.map((a: any) => (
                    <a key={a.id} href={`${API_URL}${a.url}`} target="_blank" rel="noopener noreferrer"
                      className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      {a.tipo === 'FOTO'
                        ? <img src={`${API_URL}${a.url}`} alt={a.nome_original} className="w-full h-20 object-cover" />
                        : (
                          <div className="w-full h-20 flex items-center justify-center bg-gray-50">
                            <FileText className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                      <div className="p-1.5">
                        <p className="text-xs text-gray-600 truncate">{a.nome_original}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Boletim PDF */}
            {dados.boletim_pdf_url && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Boletim de Medição</h2>
                <iframe
                  src={`${API_URL}${dados.boletim_pdf_url}`}
                  className="w-full rounded border border-gray-200"
                  style={{ height: '480px' }}
                  title="Boletim de Medição"
                />
              </div>
            )}

            {/* Seção de assinatura */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                <PenLine className="w-4 h-4 text-indigo-600" /> Assinatura Digital
              </h2>

              {erroMsg && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {erroMsg}
                </div>
              )}

              {etapa === 'idle' && !mostraRecusa && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Revise os documentos acima e, quando estiver pronto, clique para receber o
                    código de verificação no WhatsApp cadastrado.
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={loadingOtp}
                      onClick={solicitarOtp}
                      className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
                    >
                      {loadingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Receber código OTP via WhatsApp
                    </button>
                    <button
                      onClick={() => setMostraRecusa(true)}
                      className="py-2.5 px-4 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg"
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              )}

              {etapa === 'aguardando-otp' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Código enviado para o WhatsApp cadastrado. Digite abaixo:
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-center tracking-widest text-xl font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={otp.length !== 6 || loadingAssinar}
                      onClick={assinar}
                      className="flex-1 py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2"
                    >
                      {loadingAssinar ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Assinar Digitalmente
                    </button>
                    <button
                      onClick={() => setMostraRecusa(true)}
                      className="py-2.5 px-4 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg"
                    >
                      Recusar
                    </button>
                  </div>
                  <button
                    onClick={solicitarOtp}
                    disabled={loadingOtp}
                    className="text-xs text-gray-400 underline"
                  >
                    Reenviar código
                  </button>
                </div>
              )}

              {etapa === 'confirmando' && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registrando assinatura...
                </div>
              )}

              {/* Modal de recusa */}
              {mostraRecusa && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700 font-medium">Motivo da recusa (opcional):</p>
                  <textarea
                    rows={3}
                    value={motivoRecusa}
                    onChange={e => setMotivoRecusa(e.target.value)}
                    placeholder="Ex: Documentação incompleta, valores incorretos..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={loadingRecusar}
                      onClick={recusar}
                      className="py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-2"
                    >
                      {loadingRecusar ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Confirmar Recusa
                    </button>
                    <button
                      onClick={() => setMostraRecusa(false)}
                      className="py-2 px-4 border border-gray-300 text-gray-600 text-sm rounded-lg"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">
        Portal DCP · Assinatura Eletrônica · Lei nº 14.063/2020
      </footer>
    </div>
  )
}
