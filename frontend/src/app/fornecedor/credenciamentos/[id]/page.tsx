'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { HabilitacaoFornecedorPanel } from '@/components/sala/HabilitacaoFornecedorPanel'
import { HIPOTESES, REGRAS, STATUS_INSCRICAO, dataCurta, dataHora, erroDaResposta, moeda, situacaoCredenciamento } from '@/lib/credenciamento'

/**
 * FORNECEDOR — minha inscrição no credenciamento (plano E7b). Documentos pela
 * habilitação da E4 (exigências do edital, registro cadastral aproveitado,
 * entrega sem substituição, diligência). Situação, recurso contra o
 * indeferimento (art. 165, I — 3 dias úteis), denúncia (art. 79, par. único,
 * VI) e as demandas recebidas. Sempre a inscrição do próprio token.
 */
export default function MinhaInscricaoPage() {
  const { id } = useParams<{ id: string }>()
  const [v, setV] = useState<any | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/credenciamento/${id}/minha-inscricao`)
      if (!r.ok) throw new Error(await erroDaResposta(r, 'Credenciamento não encontrado'))
      setV(await r.json())
    } catch (e: any) {
      setErro(e.message)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const acao = async (url: string, corpo: any, ok: string) => {
    setOcupado(true)
    setErro(null)
    setAviso(null)
    try {
      const r = await authFetch(`${API_URL}${url}`, { method: 'POST', body: JSON.stringify(corpo) })
      if (!r.ok) throw new Error(await erroDaResposta(r, 'Não foi possível concluir'))
      setAviso(ok)
      setTexto('')
      await carregar()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  /** Razões do recurso (art. 165, I, "a") com arquivo opcional (multipart). */
  const recorrer = async () => {
    if (!v?.inscricao) return
    setOcupado(true)
    setErro(null)
    setAviso(null)
    try {
      const fd = new FormData()
      fd.append('razoes', texto)
      if (arquivo) fd.append('arquivo', arquivo)
      const r = await authFetch(`${API_URL}/api/credenciamento/inscricoes/${v.inscricao.id}/recurso`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error(await erroDaResposta(r, 'Não foi possível interpor o recurso'))
      setAviso('Recurso interposto — o agente tem 3 dias úteis para reconsiderar; mantida a decisão, a autoridade superior decide em 10 dias úteis.')
      setTexto('')
      setArquivo(null)
      await carregar()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!v) {
    return <div className="p-6 text-gray-500">{erro ? <span className="text-red-600">{erro}</span> : <Loader2 className="w-4 h-4 animate-spin" />}</div>
  }

  const cred = v.credenciamento
  const i = v.inscricao
  const st = i ? STATUS_INSCRICAO[i.status] ?? { label: i.status, cor: '' } : null
  const proc = situacaoCredenciamento(cred)

  return (
    <div className="space-y-4">
      <Link href="/fornecedor/credenciamentos" className="text-sm text-blue-600 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Meus credenciamentos
      </Link>
      <div>
        <div className="flex gap-2 flex-wrap">
          <Badge className={proc.cor}>{proc.label}</Badge>
          {st && <Badge className={st.cor}>{st.label}</Badge>}
        </div>
        <h1 className="text-xl font-bold mt-1">{cred.objeto}</h1>
        <p className="text-sm text-gray-600">
          Edital {cred.numero_edital || '—'} · {HIPOTESES[cred.configuracao?.hipotese]?.rotulo} · distribuição: {REGRAS[cred.configuracao?.regra_distribuicao]} · vigência até{' '}
          {dataHora(cred.configuracao?.vigencia_fim)}
        </p>
      </div>

      {erro && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      {aviso && <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">{aviso}</div>}

      {!i ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p>Você não tem inscrição neste credenciamento.</p>
            {cred.inscricoes_abertas && (
              <Button onClick={() => acao(`/api/credenciamento/${id}/inscrever`, {}, 'Inscrição registrada — envie os documentos.')} disabled={ocupado}>
                Inscrever-me
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Situação da inscrição</CardTitle>
              <CardDescription>Inscrita em {dataHora(i.inscrita_em)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {i.status === 'CREDENCIADO' && (
                <p>
                  Credenciado desde {dataHora(i.credenciado_em)} — validade até {dataCurta(i.validade_ate)}. Posição no rodízio: {i.ordem_rodizio ?? '—'}.
                </p>
              )}
              {i.decisao_motivo && <p>Decisão: {i.decisao_motivo}</p>}
              {i.recurso && (
                <p>
                  Recurso:{' '}
                  {i.recurso.status === 'INTERPOSTO'
                    ? `aguardando reconsideração do agente (até ${dataHora(i.recurso.prazo_reconsideracao)})`
                    : i.recurso.status === 'AGUARDANDO_AUTORIDADE'
                      ? `mantido pelo agente — aguardando a autoridade superior (até ${dataHora(i.recurso.prazo_autoridade)})`
                      : i.recurso.status ?? (i.recurso.prazo_aberto ? `prazo aberto até ${dataHora(i.recurso.prazo_ate)}` : 'prazo encerrado')}
                  {i.recurso.decisao && ` — ${i.recurso.decisao}`}
                </p>
              )}
              {i.descredenciamento && (
                <p>
                  {i.descredenciamento.iniciativa === 'CREDENCIADO_DENUNCIA' ? 'Sua denúncia' : 'Descredenciamento'}: {i.descredenciamento.motivo} — efeitos em{' '}
                  {dataHora(i.descredenciamento.efeitos_em)}
                </p>
              )}
              {(v.pode_recorrer || v.pode_denunciar) && (
                <div className="space-y-2">
                  <Textarea rows={3} placeholder={v.pode_recorrer ? 'Razões do recurso (art. 165, I)' : 'Motivo da denúncia'} value={texto} onChange={(e) => setTexto(e.target.value)} />
                  {v.pode_recorrer && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                      <Button size="sm" disabled={ocupado} onClick={recorrer}>
                        Interpor recurso
                      </Button>
                    </div>
                  )}
                  {v.pode_denunciar && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado}
                      onClick={() => acao(`/api/credenciamento/inscricoes/${i.id}/denunciar`, { motivo: texto }, 'Denúncia registrada — efeito após o aviso prévio do edital.')}
                    >
                      Denunciar o credenciamento (sair)
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {i.habilitacao_id && <HabilitacaoFornecedorPanel licitacaoId={id} />}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demandas recebidas</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {!v.contratacoes?.length && <p className="text-gray-500">Nenhuma demanda ainda.</p>}
              {v.contratacoes?.map((k: any) => (
                <div key={k.id} className="border rounded p-2 flex justify-between gap-2 flex-wrap">
                  <span>
                    Demanda nº {k.numero} — {k.descricao} ({k.regra_rotulo})
                  </span>
                  <span>
                    {moeda(k.valor_total)}{' '}
                    {k.contrato_id && (
                      <Link className="text-blue-600" href="/fornecedor/contratos">
                        contrato
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
