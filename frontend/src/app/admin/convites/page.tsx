'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Send,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone,
  User,
  Building2,
  Info,
} from 'lucide-react'
import { API_URL, adminFetch } from '@/lib/api'

interface Orgao {
  id: string
  nome: string
  cnpj: string
}

interface ConviteEnviado {
  nome: string
  telefone: string
  orgao: string
  horario: string
  sucesso: boolean
}

export default function AdminConvitesPage() {
  const router = useRouter()
  const [orgaos, setOrgaos] = useState<Orgao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ success: boolean; mensagem: string } | null>(null)
  const [historico, setHistorico] = useState<ConviteEnviado[]>([])

  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    orgaoId: '',
  })

  useEffect(() => {
    adminFetch(`${API_URL}/api/orgaos`)
      .then(r => r.json())
      .then(data => setOrgaos(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [])

  const formatarTelefone = (v: string) => {
    const digits = v.replace(/\D/g, '')
    return digits
  }

  const handleEnviar = async () => {
    if (!form.telefone || !form.orgaoId) return
    setEnviando(true)
    setResultado(null)

    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/convite-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({
          telefone: form.telefone,
          nome: form.nome || undefined,
          orgaoId: form.orgaoId,
        }),
      })
      const data = await res.json()
      setResultado(data)

      if (data.success) {
        const orgao = orgaos.find(o => o.id === form.orgaoId)
        setHistorico(prev => [
          {
            nome: form.nome || 'Sem nome',
            telefone: form.telefone,
            orgao: orgao?.nome || form.orgaoId,
            horario: new Date().toLocaleTimeString('pt-BR'),
            sucesso: true,
          },
          ...prev,
        ])
        setForm(f => ({ ...f, nome: '', telefone: '' }))
      }
    } catch {
      setResultado({ success: false, mensagem: 'Erro ao enviar convite. Tente novamente.' })
    } finally {
      setEnviando(false)
    }
  }

  const orgaoSelecionado = orgaos.find(o => o.id === form.orgaoId)

  const previewMensagem = `Olá${form.nome ? `, ${form.nome}` : ''}! 👋

Você foi convidado(a) para acessar o *Portal DCP* – sistema de gestão de contratações públicas.

📋 *Como funciona:*
1️⃣ Acesse o link abaixo
2️⃣ Clique em *"Entrar com Google"* e use sua conta Google
3️⃣ Selecione o órgão ao qual pertence
4️⃣ Aguarde a aprovação do administrador
5️⃣ Você receberá uma notificação aqui no WhatsApp quando seu acesso for liberado ✅

🔗 *Link de acesso:*
https://www.portaldcp.com.br/orgao-login

Em caso de dúvidas, entre em contato com o administrador do sistema.`

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => router.push('/admin/usuarios')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-green-600" />
              Enviar Convite por WhatsApp
            </h1>
            <p className="text-gray-500 text-sm">Convide pessoas para se cadastrar no sistema via WhatsApp</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Formulário */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados do Convite</CardTitle>
                <CardDescription>Preencha as informações para enviar o convite</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="flex items-center gap-1 mb-1">
                    <Building2 className="h-4 w-4" />
                    Órgão *
                  </Label>
                  <Select value={form.orgaoId} onValueChange={v => setForm(f => ({ ...f, orgaoId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={carregando ? 'Carregando...' : 'Selecione o órgão'} />
                    </SelectTrigger>
                    <SelectContent>
                      {orgaos.map(o => (
                        <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {orgaoSelecionado && (
                    <p className="text-xs text-gray-400 mt-1">CNPJ: {orgaoSelecionado.cnpj}</p>
                  )}
                </div>

                <div>
                  <Label className="flex items-center gap-1 mb-1">
                    <Phone className="h-4 w-4" />
                    WhatsApp (com DDD) *
                  </Label>
                  <Input
                    placeholder="Ex: 11999999999"
                    value={form.telefone}
                    onChange={e => setForm(f => ({ ...f, telefone: formatarTelefone(e.target.value) }))}
                    maxLength={13}
                  />
                  <p className="text-xs text-gray-400 mt-1">Apenas números, com código do país (ex: 5511999999999)</p>
                </div>

                <div>
                  <Label className="flex items-center gap-1 mb-1">
                    <User className="h-4 w-4" />
                    Nome (opcional)
                  </Label>
                  <Input
                    placeholder="Nome do convidado"
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  />
                </div>

                {resultado && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${resultado.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {resultado.success
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                      : <XCircle className="h-4 w-4 shrink-0" />}
                    {resultado.mensagem}
                  </div>
                )}

                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={!form.telefone || !form.orgaoId || enviando}
                  onClick={handleEnviar}
                >
                  {enviando ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" />Enviar Convite pelo WhatsApp</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Histórico */}
            {historico.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Convites enviados nesta sessão</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {historico.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium">{c.nome}</p>
                          <p className="text-gray-400 text-xs">{c.telefone} · {c.orgao}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{c.horario}</span>
                          <Badge className={c.sucesso ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                            {c.sucesso ? 'Enviado' : 'Falhou'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Preview da mensagem */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-green-600" />
                  Preview da Mensagem
                </CardTitle>
                <CardDescription>Esta é a mensagem que será enviada pelo WhatsApp</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[300px]">
                  <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-[85%] ml-auto">
                    <p className="text-sm whitespace-pre-line text-gray-800 leading-relaxed">
                      {previewMensagem}
                    </p>
                    <p className="text-xs text-gray-400 text-right mt-2">Portal DCP ✓✓</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-4">
                <div className="flex gap-2 text-sm text-blue-800">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">Como funciona o fluxo de cadastro:</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                      <li>Convidado recebe o WhatsApp e acessa o link</li>
                      <li>Clica em <strong>"Entrar com Google"</strong> na tela de login</li>
                      <li>Autentica com a conta Google e seleciona o órgão</li>
                      <li>Cadastro fica com status <strong>PENDENTE</strong></li>
                      <li>Admin aprova em <strong>Admin → Usuários</strong></li>
                      <li>Convidado recebe notificação no WhatsApp com o acesso liberado</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
