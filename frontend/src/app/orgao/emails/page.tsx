'use client'

import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Mail, Loader2, RefreshCw, Reply, Inbox } from 'lucide-react'
import { API_URL, authFetch, formatarDataHoraBR } from '@/lib/api'

interface EmailResumido {
  uid: number
  subject: string
  from: string
  date: string
  seen: boolean
}

interface EmailDetalhe {
  uid: number
  subject: string
  from: string
  to: string[]
  date: string
  seen: boolean
  text?: string
  html?: string
}

function OrgaoEmailsPageContent() {
  const [orgaoId, setOrgaoId] = useState<string | null>(null)
  const [emails, setEmails] = useState<EmailResumido[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [emailSelecionado, setEmailSelecionado] = useState<EmailDetalhe | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [showResponder, setShowResponder] = useState(false)
  const [respostaTexto, setRespostaTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [imapNaoConfigurado, setImapNaoConfigurado] = useState(false)

  useEffect(() => {
    const orgaoStr = localStorage.getItem('orgao')
    if (orgaoStr) {
      try {
        const orgao = JSON.parse(orgaoStr)
        setOrgaoId(orgao.id)
      } catch {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (orgaoId) {
      carregarEmails()
    }
  }, [orgaoId])

  const carregarEmails = async () => {
    if (!orgaoId) return
    setLoading(true)
    setImapNaoConfigurado(false)
    try {
      const res = await authFetch(`${API_URL}/api/orgaos/${orgaoId}/emails?limit=50&offset=0`)
      if (res.ok) {
        const data = await res.json()
        setEmails(data.emails || [])
        setTotal(data.total || 0)
      } else if (res.status === 404) {
        setImapNaoConfigurado(true)
        setEmails([])
        setTotal(0)
      } else {
        const err = await res.json().catch(() => ({}))
        if (err.message?.includes('IMAP')) {
          setImapNaoConfigurado(true)
        }
        setEmails([])
        setTotal(0)
      }
    } catch (e) {
      console.error('Erro ao carregar emails:', e)
      setEmails([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const abrirEmail = async (uid: number) => {
    if (!orgaoId) return
    setLoadingDetalhe(true)
    setEmailSelecionado(null)
    try {
      const res = await authFetch(`${API_URL}/api/orgaos/${orgaoId}/emails/${uid}`)
      if (res.ok) {
        const data = await res.json()
        setEmailSelecionado(data)
        setRespostaTexto('')
      }
    } catch (e) {
      console.error('Erro ao abrir email:', e)
    } finally {
      setLoadingDetalhe(false)
    }
  }

  const enviarResposta = async () => {
    if (!orgaoId || !emailSelecionado) return
    setEnviando(true)
    try {
      const res = await authFetch(`${API_URL}/api/orgaos/${orgaoId}/emails/${emailSelecionado.uid}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `Re: ${emailSelecionado.subject}`,
          text: respostaTexto,
          replyTo: emailSelecionado.from,
        }),
      })
      if (res.ok) {
        alert('Resposta enviada com sucesso!')
        setShowResponder(false)
        setRespostaTexto('')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao enviar resposta')
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao enviar resposta')
    } finally {
      setEnviando(false)
    }
  }

  const extrairEmail = (from: string) => {
    const m = from.match(/<([^>]+)>/)
    return m ? m[1] : from
  }

  if (!orgaoId && !loading) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">Sessão inválida. Faça login novamente.</p>
      </div>
    )
  }

  if (imapNaoConfigurado) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="w-7 h-7 text-blue-600" />
            Caixa de Entrada
          </h1>
          <p className="text-gray-600">Leia e responda emails pelo sistema</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Inbox className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">
                A recepção de emails (IMAP) não está configurada para este órgão.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Entre em contato com o administrador para configurar o IMAP em Admin → Órgãos → Configurar Email.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="w-7 h-7 text-blue-600" />
            Caixa de Entrada
          </h1>
          <p className="text-gray-600">Leia e responda emails pelo sistema</p>
        </div>
        <Button variant="outline" onClick={carregarEmails} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription>
            {total} mensagem(ns) na caixa de entrada
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600" />
              <p className="mt-4 text-gray-600">Carregando emails...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum email na caixa de entrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>De</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((e) => (
                  <TableRow
                    key={e.uid}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => abrirEmail(e.uid)}
                  >
                    <TableCell className={e.seen ? '' : 'font-medium'}>
                      {e.from}
                    </TableCell>
                    <TableCell className={e.seen ? '' : 'font-medium'}>
                      {e.subject}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {formatarDataHoraBR(e.date)}
                    </TableCell>
                    <TableCell>
                      {e.seen ? (
                        <span className="text-xs text-gray-500">Lido</span>
                      ) : (
                        <span className="text-xs text-blue-600 font-medium">Novo</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Detalhe do Email */}
      <Dialog open={!!emailSelecionado || loadingDetalhe} onOpenChange={(open) => !open && setEmailSelecionado(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {loadingDetalhe ? 'Carregando...' : emailSelecionado?.subject}
            </DialogTitle>
          </DialogHeader>
          {loadingDetalhe ? (
            <div className="py-8 text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-600" />
            </div>
          ) : emailSelecionado ? (
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                <p><strong>De:</strong> {emailSelecionado.from}</p>
                <p><strong>Para:</strong> {emailSelecionado.to?.join(', ') || '-'}</p>
                <p><strong>Data:</strong> {formatarDataHoraBR(emailSelecionado.date)}</p>
              </div>
              <div className="border-t pt-4">
                {emailSelecionado.html ? (
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: emailSelecionado.html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm font-sans">{emailSelecionado.text || '(sem conteúdo)'}</pre>
                )}
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={() => setShowResponder(true)}>
                  <Reply className="w-4 h-4 mr-2" />
                  Responder
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Modal Responder */}
      <Dialog open={showResponder} onOpenChange={setShowResponder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-gray-600">Para: {emailSelecionado?.from}</p>
              <p className="text-sm text-gray-600">Assunto: Re: {emailSelecionado?.subject}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Mensagem</label>
              <textarea
                className="mt-2 w-full min-h-[120px] p-3 border rounded-md"
                value={respostaTexto}
                onChange={(e) => setRespostaTexto(e.target.value)}
                placeholder="Digite sua resposta..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowResponder(false)}>
              Cancelar
            </Button>
            <Button onClick={enviarResposta} disabled={enviando || !respostaTexto.trim()}>
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function OrgaoEmailsPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.EMAILS}>
      <OrgaoEmailsPageContent />
    </ModuleGuard>
  )
}
