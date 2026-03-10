'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Users,
  ExternalLink,
  BookmarkPlus,
  AlertCircle,
  PlayCircle,
  StopCircle,
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

interface ResultadoBulk {
  telefone: string
  sucesso: boolean
  mensagem: string
}

const FRONTEND_URL = 'https://compras.cmlem.ba.gov.br'

export default function AdminConvitesPage() {
  const router = useRouter()
  const [orgaos, setOrgaos] = useState<Orgao[]>([])
  const [carregando, setCarregando] = useState(true)

  // Estado do convite unitário (órgão)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ success: boolean; mensagem: string } | null>(null)
  const [historico, setHistorico] = useState<ConviteEnviado[]>([])
  const [form, setForm] = useState({ nome: '', telefone: '', orgaoId: '' })

  // Estado do convite em massa para fornecedores
  const [orgaoIdFornecedor, setOrgaoIdFornecedor] = useState('')
  const [numerosTexto, setNumerosTexto] = useState('')
  const [enviandoBulk, setEnviandoBulk] = useState(false)
  const [cancelarBulk, setCancelarBulk] = useState(false)
  const [progressoBulk, setProgressoBulk] = useState(0)
  const [totalBulk, setTotalBulk] = useState(0)
  const [resultadosBulk, setResultadosBulk] = useState<ResultadoBulk[]>([])

  useEffect(() => {
    adminFetch(`${API_URL}/api/orgaos`)
      .then(r => r.json())
      .then(data => setOrgaos(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [])

  const formatarTelefone = (v: string) => v.replace(/\D/g, '')

  const handleEnviarUnitario = async () => {
    if (!form.telefone || !form.orgaoId) return
    setEnviando(true)
    setResultado(null)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/convite-whatsapp`, {
        method: 'POST',
        body: JSON.stringify({ telefone: form.telefone, nome: form.nome || undefined, orgaoId: form.orgaoId }),
      })
      const data = await res.json()
      setResultado(data)
      if (data.success) {
        const orgao = orgaos.find(o => o.id === form.orgaoId)
        setHistorico(prev => [{
          nome: form.nome || 'Sem nome',
          telefone: form.telefone,
          orgao: orgao?.nome || form.orgaoId,
          horario: new Date().toLocaleTimeString('pt-BR'),
          sucesso: true,
        }, ...prev])
        setForm(f => ({ ...f, nome: '', telefone: '' }))
      }
    } catch {
      setResultado({ success: false, mensagem: 'Erro ao enviar convite. Tente novamente.' })
    } finally {
      setEnviando(false)
    }
  }

  const parsearNumeros = () => {
    return numerosTexto
      .split(/[\n,;]/)
      .map(n => n.trim().replace(/\D/g, ''))
      .filter(n => n.length >= 10)
  }

  const handleEnviarBulk = async () => {
    const numeros = parsearNumeros()
    if (numeros.length === 0 || !orgaoIdFornecedor) return

    setEnviandoBulk(true)
    setCancelarBulk(false)
    setResultadosBulk([])
    setProgressoBulk(0)
    setTotalBulk(numeros.length)

    let cancelado = false
    const onCancelar = () => { cancelado = true }
    // Registra callback de cancelamento via ref
    cancelarRef.current = onCancelar

    for (let i = 0; i < numeros.length; i++) {
      if (cancelado) break

      const telefone = numeros[i]
      let sucesso = false
      let msg = ''
      try {
        const res = await adminFetch(`${API_URL}/api/orgaos/convite-fornecedor-whatsapp`, {
          method: 'POST',
          body: JSON.stringify({ telefone, orgaoId: orgaoIdFornecedor }),
        })
        const data = await res.json()
        sucesso = data.success
        msg = data.mensagem
      } catch {
        sucesso = false
        msg = 'Erro de conexão'
      }

      setResultadosBulk(prev => [...prev, { telefone, sucesso, mensagem: msg }])
      setProgressoBulk(i + 1)

      // Delay de 1s entre envios, exceto no último
      if (i < numeros.length - 1 && !cancelado) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    setEnviandoBulk(false)
    cancelarRef.current = null
  }

  const cancelarRef = { current: null as (() => void) | null }

  const orgaoSelecionado = orgaos.find(o => o.id === form.orgaoId)

  const previewMensagemOrgao = `Olá${form.nome ? `, ${form.nome}` : ''}! 👋

Você foi convidado(a) para acessar o *Portal DCP* – sistema de gestão de contratações públicas.

📋 *Como funciona:*
1️⃣ Acesse o link abaixo
2️⃣ Clique em *"Entrar com Google"* e use sua conta Google
3️⃣ Selecione o órgão ao qual pertence
4️⃣ Aguarde a aprovação do administrador
5️⃣ Você receberá uma notificação aqui no WhatsApp quando seu acesso for liberado ✅

🔗 *Link de acesso:*
${FRONTEND_URL}/orgao-login

Em caso de dúvidas, entre em contato com o administrador do sistema.`

  const previewMensagemFornecedor = `Olá! 👋

Você está recebendo esta mensagem porque a *Câmara Municipal de Luís Eduardo Magalhães – BA* identificou contratos em seu nome ou empresa em nossos registros.

Gostaríamos de convidá-lo(a) a se cadastrar no nosso *Portal de Compras Públicas*, onde você poderá acompanhar contratos, processos licitatórios e receber comunicações oficiais de forma rápida e segura.

📋 *Como se cadastrar:*
1️⃣ Acesse o link abaixo
2️⃣ Clique em *"Criar conta"* e preencha seus dados
3️⃣ Informe o CNPJ da sua empresa para vincular seus contratos
4️⃣ Aguarde a confirmação de cadastro ✅

🔗 *Acesse o portal:*
${FRONTEND_URL}/login

💾 *IMPORTANTE:* Salve este número em seus contatos! As notificações oficiais da Câmara Municipal de Luís Eduardo Magalhães serão enviadas pelo WhatsApp por este número.

Em caso de dúvidas, entre em contato diretamente por este WhatsApp.`

  const numerosValidos = parsearNumeros()
  const sucessosBulk = resultadosBulk.filter(r => r.sucesso).length
  const falhasBulk = resultadosBulk.filter(r => !r.sucesso).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => router.push('/admin/usuarios')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-green-600" />
              Convites por WhatsApp
            </h1>
            <p className="text-gray-500 text-sm">Envie convites individuais ou em massa pelo WhatsApp</p>
          </div>
        </div>

        <Tabs defaultValue="fornecedores">
          <TabsList className="mb-6">
            <TabsTrigger value="fornecedores" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Fornecedores (Massa)
            </TabsTrigger>
            <TabsTrigger value="orgao" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Servidores (Individual)
            </TabsTrigger>
          </TabsList>

          {/* ======================== TAB: FORNECEDORES ======================== */}
          <TabsContent value="fornecedores">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Coluna esquerda */}
              <div className="space-y-4">
                {/* Card de configuração */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-600" />
                      Convite em Massa para Fornecedores
                    </CardTitle>
                    <CardDescription>
                      Envie convite de apresentação para fornecedores com contratos na Câmara de Vereadores de Luís Eduardo Magalhães
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="flex items-center gap-1 mb-1">
                        <Building2 className="h-4 w-4" />
                        Órgão (WhatsApp remetente) *
                      </Label>
                      <Select value={orgaoIdFornecedor} onValueChange={setOrgaoIdFornecedor}>
                        <SelectTrigger>
                          <SelectValue placeholder={carregando ? 'Carregando...' : 'Selecione o órgão'} />
                        </SelectTrigger>
                        <SelectContent>
                          {orgaos.map(o => (
                            <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 mt-1">O WhatsApp configurado neste órgão será usado para envio</p>
                    </div>

                    <div>
                      <Label className="flex items-center gap-1 mb-1">
                        <Phone className="h-4 w-4" />
                        Números de WhatsApp *
                      </Label>
                      <Textarea
                        placeholder={`Cole os números aqui, um por linha:\n5577999990001\n5577999990002\n5577999990003`}
                        value={numerosTexto}
                        onChange={e => setNumerosTexto(e.target.value)}
                        rows={8}
                        className="font-mono text-sm"
                        disabled={enviandoBulk}
                      />
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-400">Um número por linha. Apenas dígitos (com DDI e DDD).</p>
                        {numerosValidos.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {numerosValidos.length} número{numerosValidos.length !== 1 ? 's' : ''} válido{numerosValidos.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    {(enviandoBulk || resultadosBulk.length > 0) && totalBulk > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            {enviandoBulk ? `Enviando ${progressoBulk} de ${totalBulk}...` : `Concluído: ${progressoBulk} de ${totalBulk}`}
                          </span>
                          <span className="text-gray-500">{Math.round((progressoBulk / totalBulk) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${enviandoBulk ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${(progressoBulk / totalBulk) * 100}%` }}
                          />
                        </div>
                        {resultadosBulk.length > 0 && (
                          <div className="flex gap-4 text-xs">
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> {sucessosBulk} enviado{sucessosBulk !== 1 ? 's' : ''}
                            </span>
                            <span className="text-red-500 flex items-center gap-1">
                              <XCircle className="h-3 w-3" /> {falhasBulk} falha{falhasBulk !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={numerosValidos.length === 0 || !orgaoIdFornecedor || enviandoBulk}
                        onClick={handleEnviarBulk}
                      >
                        {enviandoBulk ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando ({progressoBulk}/{totalBulk})...</>
                        ) : (
                          <><PlayCircle className="h-4 w-4 mr-2" />Enviar {numerosValidos.length > 0 ? `${numerosValidos.length} Convite${numerosValidos.length !== 1 ? 's' : ''}` : 'Convites'}</>
                        )}
                      </Button>
                      {enviandoBulk && (
                        <Button
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => { setCancelarBulk(true); if (cancelarRef.current) cancelarRef.current() }}
                        >
                          <StopCircle className="h-4 w-4 mr-1" />
                          Parar
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Delay de <strong>1 segundo</strong> entre envios para evitar bloqueio. Não feche a página durante o envio.</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Log de resultados */}
                {resultadosBulk.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Log de Envios</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {resultadosBulk.map((r, i) => (
                          <div key={i} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${r.sucesso ? 'bg-green-50' : 'bg-red-50'}`}>
                            <span className="font-mono text-gray-700">{r.telefone}</span>
                            <Badge className={`text-xs ${r.sucesso ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {r.sucesso ? 'Enviado' : 'Falhou'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Coluna direita: preview da mensagem */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-green-600" />
                      Preview da Mensagem
                    </CardTitle>
                    <CardDescription>Mensagem enviada a cada fornecedor</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[300px]">
                      <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-[90%]">
                        <p className="text-sm whitespace-pre-line text-gray-800 leading-relaxed">
                          {previewMensagemFornecedor}
                        </p>
                        <p className="text-xs text-gray-400 text-right mt-2">Câmara CMLEM ✓✓</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Informações adicionais */}
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="pt-4">
                    <div className="flex gap-2 text-sm text-blue-800">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <p className="font-medium">O que a mensagem comunica:</p>
                        <ul className="list-disc list-inside space-y-1 text-blue-700 text-xs">
                          <li>Identificação como fornecedor com contratos na Câmara de LEM</li>
                          <li>Convite para cadastro no Portal de Compras</li>
                          <li>Passo a passo de como se cadastrar</li>
                          <li className="flex items-center gap-1">
                            Link direto para o portal:
                            <a href={`${FRONTEND_URL}/login`} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
                              {FRONTEND_URL}/login <ExternalLink className="h-3 w-3" />
                            </a>
                          </li>
                          <li className="flex items-start gap-1">
                            <BookmarkPlus className="h-3 w-3 mt-0.5 shrink-0" />
                            Pedido para salvar o número — notificações serão enviadas por este WhatsApp
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ======================== TAB: SERVIDORES / ÓRGÃO ======================== */}
          <TabsContent value="orgao">
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
                        placeholder="Ex: 5577999999999"
                        value={form.telefone}
                        onChange={e => setForm(f => ({ ...f, telefone: formatarTelefone(e.target.value) }))}
                        maxLength={13}
                      />
                      <p className="text-xs text-gray-400 mt-1">Apenas números, com código do país (ex: 5577999999999)</p>
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
                      onClick={handleEnviarUnitario}
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
                          {previewMensagemOrgao}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
