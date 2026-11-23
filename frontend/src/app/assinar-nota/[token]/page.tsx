'use client'

/**
 * Assinatura do termo de atesto da nota de fornecimento pelo link pessoal
 * (recebido no WhatsApp ou no e-mail). Mesma experiência da assinatura do
 * boletim de medição: conferir os documentos, receber o código, assinar ou
 * recusar. Página pública — a credencial é o token do link.
 */
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { API_URL } from '@/lib/api'
import { CheckCircle, XCircle, Loader2, ShieldCheck, PenLine } from 'lucide-react'

type Etapa = 'carregando' | 'erro' | 'idle' | 'aguardando-otp' | 'confirmando' | 'assinado' | 'recusado' | 'cancelado'

interface Dados {
  situacao: string
  signatario: { nome: string; papel: string | null; data_assinatura: string | null; canal: 'whatsapp' | 'email'; destino_codigo: string }
  orgao_nome: string
  nota: { numero: string | null; serie: string | null; data_emissao: string | null; valor_total: number | null; fornecedor: string; ordem: string | null; contrato: string | null; tem_pdf: boolean }
  itens: Array<{ descricao: string; unidade: string; quantidade: number; valor_unitario: number; valor_total: number }>
  demais: Array<{ nome: string; papel: string | null; status: string }>
}

const fmtMoeda = (v: number | null) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string | null) => {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return a && m && dia ? `${dia}/${m}/${a}` : d
}
const mensagem = async (r: Response, padrao: string) => {
  try { const j = await r.json(); return Array.isArray(j?.message) ? j.message.join(' ') : j?.message || padrao } catch { return padrao }
}

export default function AssinarNotaPage() {
  const params = useParams()
  const token = params?.token as string
  const base = `${API_URL}/api/assinar-nota/${token}`

  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [dados, setDados] = useState<Dados | null>(null)
  const [erroMsg, setErroMsg] = useState('')
  const [otp, setOtp] = useState('')
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [mostraRecusa, setMostraRecusa] = useState(false)
  const [loadingOtp, setLoadingOtp] = useState(false)
  const [loadingAssinar, setLoadingAssinar] = useState(false)
  const [loadingRecusar, setLoadingRecusar] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(base)
      .then(async (r) => {
        if (!r.ok) { setErroMsg(await mensagem(r, 'Link de assinatura inválido.')); setEtapa('erro'); return }
        const d: Dados = await r.json()
        setDados(d)
        setEtapa(d.situacao === 'ASSINADO' ? 'assinado' : d.situacao === 'REJEITADO' ? 'recusado' : d.situacao === 'CANCELADO' ? 'cancelado' : 'idle')
      })
      .catch(() => { setErroMsg('Não foi possível abrir o link. Tente de novo em instantes.'); setEtapa('erro') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const solicitarOtp = async () => {
    setLoadingOtp(true); setErroMsg('')
    try {
      const r = await fetch(`${base}/solicitar-codigo`, { method: 'POST' })
      if (r.ok) setEtapa('aguardando-otp')
      else setErroMsg(await mensagem(r, 'Não foi possível enviar o código.'))
    } catch { setErroMsg('Não foi possível enviar o código.') }
    setLoadingOtp(false)
  }

  const assinar = async () => {
    if (otp.length !== 6) return
    setLoadingAssinar(true); setErroMsg(''); setEtapa('confirmando')
    try {
      const r = await fetch(`${base}/assinar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: otp }) })
      if (r.ok) setEtapa('assinado')
      else { setErroMsg(await mensagem(r, 'Não foi possível registrar a assinatura.')); setEtapa('aguardando-otp') }
    } catch { setErroMsg('Não foi possível registrar a assinatura.'); setEtapa('aguardando-otp') }
    setLoadingAssinar(false)
  }

  const recusar = async () => {
    setLoadingRecusar(true); setErroMsg('')
    try {
      const r = await fetch(`${base}/recusar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivoRecusa }) })
      if (r.ok) setEtapa('recusado')
      else setErroMsg(await mensagem(r, 'Não foi possível registrar a recusa.'))
    } catch { setErroMsg('Não foi possível registrar a recusa.') }
    setLoadingRecusar(false)
  }

  const canal = dados?.signatario.canal === 'email' ? 'e-mail' : 'WhatsApp'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-blue-700 p-2 rounded-lg"><ShieldCheck className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Portal DCP — Assinatura de Nota de Fornecimento</h1>
            <p className="text-xs text-gray-500">Assinatura Eletrônica · Lei nº 14.063/2020</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {etapa === 'carregando' && (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>
        )}

        {etapa === 'erro' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-red-800 mb-1">Link inválido</h2>
            <p className="text-sm text-red-600">{erroMsg}</p>
          </div>
        )}

        {etapa === 'cancelado' && (
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 text-center">
            <XCircle className="w-10 h-10 text-gray-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-gray-800 mb-1">Pedido de assinatura cancelado</h2>
            <p className="text-sm text-gray-600">O órgão cancelou este pedido. Se ainda precisar da sua assinatura, você receberá um novo link.</p>
          </div>
        )}

        {etapa === 'assinado' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-green-800 mb-1">Assinatura registrada!</h2>
            <p className="text-sm text-green-700">O termo de atesto da nota fiscal foi assinado digitalmente com sucesso.</p>
          </div>
        )}

        {etapa === 'recusado' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 text-center">
            <XCircle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-orange-800 mb-1">Recusa registrada</h2>
            <p className="text-sm text-orange-600">O solicitante foi notificado sobre a recusa.</p>
          </div>
        )}

        {dados && ['idle', 'aguardando-otp', 'confirmando'].includes(etapa) && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Dados da Nota Fiscal</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div><span className="text-gray-500">Órgão:</span> <span className="font-medium">{dados.orgao_nome}</span></div>
                <div><span className="text-gray-500">Contrato:</span> <span className="font-medium">{dados.nota.contrato || '—'}</span></div>
                <div><span className="text-gray-500">Nota fiscal Nº:</span> <span className="font-medium">{dados.nota.numero || 's/n'}{dados.nota.serie ? ` · série ${dados.nota.serie}` : ''}</span></div>
                <div><span className="text-gray-500">Valor:</span> <span className="font-medium text-blue-700">{fmtMoeda(dados.nota.valor_total)}</span></div>
                <div><span className="text-gray-500">Emissão:</span> <span className="font-medium">{fmtData(dados.nota.data_emissao)}</span></div>
                <div><span className="text-gray-500">Ordem de fornecimento:</span> <span className="font-medium">{dados.nota.ordem || '—'}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Fornecedor:</span> <span className="font-medium">{dados.nota.fornecedor}</span></div>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700 mt-2">
                <strong>{dados.signatario.papel ? `${dados.signatario.papel}:` : 'Quem assina:'}</strong> {dados.signatario.nome}
              </div>
              {dados.demais.length > 0 && (
                <p className="text-xs text-gray-500">
                  Também assinam: {dados.demais.map((d) => `${d.nome}${d.status === 'ASSINADO' ? ' (já assinou)' : d.status === 'REJEITADO' ? ' (recusou)' : ''}`).join(', ')}.
                </p>
              )}
            </div>

            {dados.itens.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Itens ({dados.itens.length})</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 border-b"><th className="py-1.5 font-medium">Descrição</th><th className="py-1.5 pl-3 font-medium text-right">Qtd.</th><th className="py-1.5 pl-3 font-medium text-right">Unitário</th><th className="py-1.5 pl-3 font-medium text-right">Total</th></tr></thead>
                    <tbody>
                      {dados.itens.map((it, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5">{it.descricao}</td>
                          <td className="py-1.5 pl-3 text-right whitespace-nowrap">{Number(it.quantidade).toLocaleString('pt-BR')} {it.unidade}</td>
                          <td className="py-1.5 pl-3 text-right whitespace-nowrap">{fmtMoeda(it.valor_unitario)}</td>
                          <td className="py-1.5 pl-3 text-right whitespace-nowrap">{fmtMoeda(it.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {dados.nota.tem_pdf && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Nota Fiscal</h2>
                <iframe src={`${base}/arquivo/nota`} className="w-full rounded border border-gray-200" style={{ height: 'min(70vh, 700px)' }} title="Nota fiscal" />
                <a href={`${base}/arquivo/nota`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-blue-600 underline">Abrir a nota fiscal em outra aba</a>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Termo de Atesto</h2>
              <iframe src={`${base}/arquivo/termo`} className="w-full rounded border border-gray-200" style={{ height: 'min(75vh, 800px)' }} title="Termo de atesto" />
              <a href={`${base}/arquivo/termo`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-blue-600 underline">Abrir o termo de atesto em outra aba</a>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                <PenLine className="w-4 h-4 text-indigo-600" /> Assinatura Digital
              </h2>

              {erroMsg && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroMsg}</div>}

              {etapa === 'idle' && !mostraRecusa && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Revise os documentos acima e, quando estiver pronto, clique para receber o código de verificação no {canal} cadastrado ({dados.signatario.destino_codigo}).
                  </p>
                  <div className="flex gap-2">
                    <button disabled={loadingOtp} onClick={solicitarOtp}
                      className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                      {loadingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Receber código via {canal}
                    </button>
                    <button onClick={() => setMostraRecusa(true)} className="py-2.5 px-4 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg">Recusar</button>
                  </div>
                </div>
              )}

              {etapa === 'aguardando-otp' && !mostraRecusa && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Código enviado para o {canal} cadastrado. Digite abaixo:</p>
                  <input type="text" inputMode="numeric" maxLength={6} value={otp} aria-label="Código de verificação"
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-center tracking-widest text-xl font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <div className="flex gap-2">
                    <button disabled={otp.length !== 6 || loadingAssinar} onClick={assinar}
                      className="flex-1 py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2">
                      {loadingAssinar ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Assinar Digitalmente
                    </button>
                    <button onClick={() => setMostraRecusa(true)} className="py-2.5 px-4 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg">Recusar</button>
                  </div>
                  <button onClick={solicitarOtp} disabled={loadingOtp} className="text-xs text-gray-400 underline">Reenviar código</button>
                </div>
              )}

              {etapa === 'confirmando' && (
                <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Registrando assinatura...</div>
              )}

              {mostraRecusa && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700 font-medium">Motivo da recusa (opcional):</p>
                  <textarea rows={3} value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="Ex.: valores incorretos, material não conferido..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  <div className="flex gap-2">
                    <button disabled={loadingRecusar} onClick={recusar} className="py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center gap-2">
                      {loadingRecusar ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Confirmar Recusa
                    </button>
                    <button onClick={() => setMostraRecusa(false)} className="py-2 px-4 border border-gray-300 text-gray-600 text-sm rounded-lg">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">Portal DCP · Assinatura Eletrônica · Lei nº 14.063/2020</footer>
    </div>
  )
}
