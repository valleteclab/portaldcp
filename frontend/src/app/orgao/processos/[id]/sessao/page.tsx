'use client'

import { use, useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, FileText, Loader2 } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SalaOrgao } from '@/components/sala/orgao/SalaOrgao'
import { AberturaSessao } from '@/components/sala/orgao/AberturaSessao'

interface SessaoResumo {
  id: string
  status: string
  etapa: string
  criadaEm: string
}

/** Modalidades conduzidas no próprio processo, sem sessão pública de lances. */
const SEM_SESSAO: Record<string, string> = {
  DISPENSA_ELETRONICA: 'A janela de lances da dispensa eletrônica é aberta e acompanhada no processo.',
  INEXIGIBILIDADE: 'Inexigibilidade não tem sessão pública de disputa.',
  CONCURSO: 'O concurso é julgado pela comissão no processo (trabalhos, notas e premiação).',
  DIALOGO_COMPETITIVO: 'O diálogo competitivo é conduzido no processo (fase de diálogo e fase competitiva).',
  CREDENCIAMENTO: 'O credenciamento não tem disputa: os credenciados são contratados por inexigibilidade.',
}

const ROTULO_STATUS: Record<string, string> = {
  AGUARDANDO_INICIO: 'aguardando início',
  EM_ANDAMENTO: 'em andamento',
  SUSPENSA: 'suspensa',
  ENCERRADA: 'encerrada',
  CANCELADA: 'cancelada',
}

/**
 * SALA ÚNICA DO ÓRGÃO (plano E8 item 4; decisão 5 — rota aprovada).
 * A sessão é resolvida pela licitação: sem sessão → abertura; com mais de uma
 * (sessão refeita) → seletor; com sessão → sala do motor único.
 */
export default function SessaoDoProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: licitacaoId } = use(params)
  const [modalidade, setModalidade] = useState<string | null>(null)
  const [sessoes, setSessoes] = useState<SessaoResumo[] | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async (preferida?: string) => {
    setErro(null)
    try {
      const [resLic, resSessoes] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}/sessoes`),
      ])
      if (!resLic.ok) throw new Error('Processo não encontrado ou sem acesso.')
      const lic = await resLic.json()
      setModalidade(String(lic?.modalidade || ''))
      const lista: SessaoResumo[] = resSessoes.ok ? await resSessoes.json() : []
      setSessoes(lista)
      setSelecionada((atual) => preferida || (atual && lista.some((s) => s.id === atual) ? atual : lista[0]?.id ?? null))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar a sessão')
    }
  }, [licitacaoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const sessao = sessoes?.find((s) => s.id === selecionada) || null
  const voltar = (
    <Link href={`/orgao/processos/${licitacaoId}`}>
      <Button variant="outline">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Processo
      </Button>
    </Link>
  )

  let conteudo: ReactNode
  if (erro) {
    conteudo = (
      <Card className="border-red-200">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <p className="font-medium text-red-700">{erro}</p>
        </CardContent>
      </Card>
    )
  } else if (sessoes === null || modalidade === null) {
    conteudo = (
      <div className="flex items-center justify-center py-20 text-slate-600">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Carregando a sessão do processo...
      </div>
    )
  } else if (SEM_SESSAO[modalidade] && sessoes.length === 0) {
    conteudo = (
      <Card>
        <CardContent className="space-y-4 py-10 text-center text-slate-700">
          <p>{SEM_SESSAO[modalidade]}</p>
          {voltar}
        </CardContent>
      </Card>
    )
  } else if (!sessao || sessao.status === 'AGUARDANDO_INICIO') {
    conteudo = (
      <AberturaSessao
        licitacaoId={licitacaoId}
        sessaoAguardando={sessao?.id ?? null}
        onAberta={(id) => void carregar(id)}
      />
    )
  } else {
    conteudo = null
  }

  if (conteudo === null && sessao) {
    return (
      <ModuleGuard modulo={ModuloSistema.DISPUTA} fallbackUrl="/orgao">
        <SalaOrgao
          key={sessao.id}
          sessaoId={sessao.id}
          acoesCabecalho={
            <>
              {voltar}
              {sessoes && sessoes.length > 1 && (
                <Select value={sessao.id} onValueChange={(v) => setSelecionada(v)}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Sessão" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessoes.map((s, i) => (
                      <SelectItem key={s.id} value={s.id}>
                        Sessão {sessoes.length - i} — {ROTULO_STATUS[s.status] || s.status} ({new Date(s.criadaEm).toLocaleDateString('pt-BR')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Link href={`/orgao/processos/${licitacaoId}/ata`}>
                <Button variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  Ata da sessão
                </Button>
              </Link>
            </>
          }
        />
      </ModuleGuard>
    )
  }

  return (
    <ModuleGuard modulo={ModuloSistema.DISPUTA} fallbackUrl="/orgao">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Sessão pública</h1>
            <p className="text-sm text-slate-600">Abertura e condução da sessão do processo.</p>
          </div>
          {voltar}
        </div>
        {conteudo}
      </div>
    </ModuleGuard>
  )
}
