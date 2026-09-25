'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { API_URL, authFetch, hasValidSession } from '@/lib/api'
import { erroDaResposta } from '@/lib/credenciamento'

/**
 * INSCRIÇÃO NO CREDENCIAMENTO (plano E7b — antes era 404). O fornecedor
 * precisa estar logado (a identidade vem do token); a inscrição abre a
 * habilitação com as exigências do edital e o que o registro cadastral já
 * cobre, e leva à tela "minha inscrição" para enviar os documentos.
 */
export default function InscreverCredenciamentoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [cred, setCred] = useState<any | null>(null)
  const [logado, setLogado] = useState<boolean | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const fornecedor = localStorage.getItem('fornecedor')
    setLogado(hasValidSession() && !!fornecedor)
    fetch(`${API_URL}/api/credenciamento/publicos/${id}`)
      .then(async (r) => (r.ok ? setCred(await r.json()) : setErro('Credenciamento não encontrado ou não publicado')))
      .catch(() => setErro('Credenciamento não encontrado'))
  }, [id])

  const inscrever = async () => {
    setEnviando(true)
    setErro(null)
    try {
      const r = await authFetch(`${API_URL}/api/credenciamento/${id}/inscrever`, { method: 'POST', body: JSON.stringify({}) })
      // 409 "já inscrito": segue para a própria inscrição
      if (!r.ok && r.status !== 409) throw new Error(await erroDaResposta(r, 'Não foi possível se inscrever'))
      router.push(`/fornecedor/credenciamentos/${id}`)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle>Inscrição no credenciamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!cred && !erro && <Loader2 className="w-4 h-4 animate-spin" />}
          {cred && (
            <>
              <p className="font-medium">{cred.objeto}</p>
              <p className="text-gray-600">
                {cred.orgao?.nome} · Edital {cred.numero_edital || '—'}
              </p>
              {!cred.inscricoes_abertas && <p className="text-amber-700">As inscrições deste credenciamento não estão abertas.</p>}
              {logado === false && (
                <div className="space-y-2">
                  <p>Entre com o login de fornecedor para se inscrever (os dados da inscrição vêm do seu cadastro).</p>
                  <Button asChild>
                    <Link href={`/login?redirect=${encodeURIComponent(`/credenciamento/${id}/inscrever`)}`}>Entrar como fornecedor</Link>
                  </Button>
                </div>
              )}
              {logado && cred.inscricoes_abertas && (
                <Button onClick={inscrever} disabled={enviando}>
                  {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Confirmar inscrição
                </Button>
              )}
            </>
          )}
          {erro && <p className="text-red-600">{erro}</p>}
          <Link href={`/credenciamento/${id}`} className="text-blue-600 block">
            Voltar ao edital
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
