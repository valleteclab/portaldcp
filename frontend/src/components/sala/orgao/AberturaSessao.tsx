'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Gavel, Loader2, Play, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface DadosPreparacao {
  licitacao: {
    id: string
    numero: string
    objeto: string
    modoDisputa: string
    dataAbertura: string
    pregoeiroNome: string
    pregoeiroId: string
  }
  verificacoes: {
    faseInternaOk: boolean
    faseInternaMsg: string
    editalPublicado: boolean
    editalPublicadoMsg: string
    prazoImpugnacao: boolean
    prazoImpugnacaoMsg: string
    propostasRecebidas: boolean
    propostasRecebidasMsg: string
    quantidadePropostas: number
    dataAbertura: boolean
    dataAberturaMsg: string
    podeIniciar: boolean
  }
  itens: Array<{ id: string }>
  sessaoExistente: { id: string; status: string } | null
}

function mensagemErro(corpo: unknown, padrao: string) {
  const msg = (corpo as { message?: string | string[] } | null)?.message
  return Array.isArray(msg) ? msg.join(', ') : msg || padrao
}

/**
 * ABERTURA DA SESSÃO PÚBLICA (ex-/orgao/licitacoes/[id]/sessao): conferências
 * pré-sessão do backend e o ato "abrir a sessão" (cria, se preciso, e inicia).
 * Fica dentro da sala única — é o primeiro estado dela.
 */
export function AberturaSessao({
  licitacaoId,
  sessaoAguardando,
  onAberta,
}: {
  licitacaoId: string
  /** Sessão já criada e ainda não iniciada (AGUARDANDO_INICIO). */
  sessaoAguardando?: string | null
  onAberta: (sessaoId: string) => void
}) {
  const [dados, setDados] = useState<DadosPreparacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [erroAto, setErroAto] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}/preparar`)
      const corpo = await res.json().catch(() => null)
      if (!res.ok) throw new Error(mensagemErro(corpo, 'Não foi possível carregar as conferências da sessão.'))
      setDados(corpo)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    }
  }, [licitacaoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const abrir = async () => {
    if (!dados) return
    setErroAto(null)
    setAbrindo(true)
    try {
      let sessaoId = sessaoAguardando || null
      if (!sessaoId) {
        let usuarioId: string | null = null
        try {
          usuarioId = JSON.parse(localStorage.getItem('usuario') || 'null')?.id ?? null
        } catch {
          usuarioId = null
        }
        const res = await authFetch(`${API_URL}/api/sessao/${licitacaoId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pregoeiroId: dados.licitacao.pregoeiroId || usuarioId,
            pregoeiroNome: dados.licitacao.pregoeiroNome,
          }),
        })
        const corpo = await res.json().catch(() => null)
        if (!res.ok) throw new Error(mensagemErro(corpo, 'Não foi possível criar a sessão.'))
        sessaoId = corpo.id as string
      }
      const resIni = await authFetch(`${API_URL}/api/sessao/${sessaoId}/iniciar`, { method: 'PUT' })
      const corpoIni = await resIni.json().catch(() => null)
      if (!resIni.ok) {
        // Sessão criada mas não iniciada: fica aguardando, o ato pode ser repetido
        throw new Error(mensagemErro(corpoIni, 'Não foi possível iniciar a sessão.'))
      }
      onAberta(sessaoId!)
    } catch (e) {
      setErroAto(e instanceof Error ? e.message : 'Erro ao abrir a sessão')
      void carregar()
    } finally {
      setAbrindo(false)
    }
  }

  if (erro) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-10 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <p className="text-red-700">{erro}</p>
        </CardContent>
      </Card>
    )
  }
  if (!dados) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-600">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Carregando conferências da sessão...
      </div>
    )
  }

  const v = dados.verificacoes
  const conferencias = [
    { ok: v.faseInternaOk, titulo: 'Fase interna', msg: v.faseInternaMsg, aviso: false },
    { ok: v.editalPublicado, titulo: 'Edital publicado', msg: v.editalPublicadoMsg, aviso: false },
    { ok: v.prazoImpugnacao, titulo: 'Prazo de impugnação', msg: v.prazoImpugnacaoMsg, aviso: true },
    { ok: v.propostasRecebidas, titulo: 'Propostas recebidas', msg: v.propostasRecebidasMsg, aviso: false },
    { ok: v.dataAbertura, titulo: 'Data de abertura', msg: v.dataAberturaMsg, aviso: true },
  ]
  const semPregoeiro = !dados.licitacao.pregoeiroNome

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {v.podeIniciar ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-yellow-600" />}
            Conferências antes da sessão pública
          </CardTitle>
          <CardDescription>
            {dados.licitacao.numero} — {dados.licitacao.objeto}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {conferencias.map((c) => (
              <div
                key={c.titulo}
                className={`flex items-center gap-3 rounded-lg p-3 ${c.ok ? 'bg-green-50' : c.aviso ? 'bg-yellow-50' : 'bg-red-50'}`}
              >
                {c.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : c.aviso ? (
                  <Clock className="h-5 w-5 text-yellow-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <div>
                  <p className="font-medium">{c.titulo}</p>
                  <p className="text-sm text-muted-foreground">{c.msg}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
            <Badge variant="outline">{v.quantidadePropostas} proposta(s)</Badge>
            <Badge variant="outline">{dados.itens.length} item(ns)</Badge>
            <Badge variant="outline">Modo {dados.licitacao.modoDisputa || 'ABERTO'}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" /> Agente de contratação / pregoeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          {semPregoeiro ? (
            <div className="flex items-center gap-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Defina o pregoeiro/agente de contratação no processo antes de abrir a sessão.
            </div>
          ) : (
            <p className="font-medium">{dados.licitacao.pregoeiroNome}</p>
          )}
        </CardContent>
      </Card>

      <Card className={v.podeIniciar ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}>
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className={`font-medium ${v.podeIniciar ? 'text-blue-900' : 'text-gray-600'}`}>
              {v.podeIniciar ? 'Pronto para abrir a sessão pública' : 'Ainda não é possível abrir a sessão'}
            </p>
            <p className={`text-sm ${v.podeIniciar ? 'text-blue-700' : 'text-gray-500'}`}>
              {v.podeIniciar
                ? 'Ao abrir, os licitantes com proposta são avisados e passam a acompanhar a sala.'
                : 'Resolva as conferências acima antes de abrir.'}
            </p>
            {erroAto && <p className="mt-2 text-sm text-red-700">{erroAto}</p>}
          </div>
          <Button size="lg" onClick={abrir} disabled={!v.podeIniciar || semPregoeiro || abrindo}>
            {abrindo ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
            {sessaoAguardando ? 'Iniciar sessão pública' : 'Abrir sessão pública'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
