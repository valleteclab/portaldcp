'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Building2,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Send,
  Shield,
  Clock,
  FileText
} from 'lucide-react'
import Link from 'next/link'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

export default function SolicitarAcessoPage() {
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  
  const [form, setForm] = useState({
    cnpj: '',
    razao_social: '',
    email: '',
    nome_responsavel: '',
    telefone: '',
    cargo_responsavel: '',
    mensagem: ''
  })

  const formatarCNPJ = (valor: string) => {
    const numeros = valor.replace(/\D/g, '')
    return numeros
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .substring(0, 18)
  }

  const formatarTelefone = (valor: string) => {
    const numeros = valor.replace(/\D/g, '')
    if (numeros.length <= 10) {
      return numeros
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
    }
    return numeros
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .substring(0, 15)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErro(null)

    try {
      const response = await fetch(`${API_URL}/api/solicitacoes-acesso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })

      if (response.ok) {
        setSucesso(true)
      } else {
        const data = await response.json()
        setErro(data.message || 'Erro ao enviar solicitação')
      }
    } catch (error) {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Solicitação Enviada!
            </h2>
            <p className="text-gray-600 mb-6">
              Sua solicitação foi recebida com sucesso. Nossa equipe irá analisar 
              e entrar em contato pelo email informado em até 48 horas úteis.
            </p>
            <div className="space-y-3">
              <Link href="/">
                <Button className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar ao Início
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold">Portal DCP</span>
          </Link>
          <Link href="/orgao-login">
            <Button variant="outline">
              Já tenho acesso
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Título */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Solicitar Acesso para Órgão Público
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Preencha o formulário abaixo para solicitar acesso à plataforma. 
            Nossa equipe irá analisar sua solicitação e entrar em contato.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Formulário */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Dados do Órgão
                </CardTitle>
                <CardDescription>
                  Informe os dados do órgão público que deseja cadastrar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cnpj">CNPJ *</Label>
                      <Input
                        id="cnpj"
                        value={form.cnpj}
                        onChange={(e) => setForm({ ...form, cnpj: formatarCNPJ(e.target.value) })}
                        placeholder="00.000.000/0000-00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="razao_social">Razão Social *</Label>
                      <Input
                        id="razao_social"
                        value={form.razao_social}
                        onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                        placeholder="Nome oficial do órgão"
                        required
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-medium mb-4">Dados do Responsável</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nome_responsavel">Nome Completo *</Label>
                        <Input
                          id="nome_responsavel"
                          value={form.nome_responsavel}
                          onChange={(e) => setForm({ ...form, nome_responsavel: e.target.value })}
                          placeholder="Nome do responsável"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cargo_responsavel">Cargo</Label>
                        <Input
                          id="cargo_responsavel"
                          value={form.cargo_responsavel}
                          onChange={(e) => setForm({ ...form, cargo_responsavel: e.target.value })}
                          placeholder="Ex: Pregoeiro, Secretário"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="email@orgao.gov.br"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefone">Telefone</Label>
                      <Input
                        id="telefone"
                        value={form.telefone}
                        onChange={(e) => setForm({ ...form, telefone: formatarTelefone(e.target.value) })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mensagem">Mensagem (opcional)</Label>
                    <Textarea
                      id="mensagem"
                      value={form.mensagem}
                      onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                      placeholder="Informações adicionais sobre o órgão ou necessidades específicas..."
                      rows={3}
                    />
                  </div>

                  {erro && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {erro}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar Solicitação
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Informações */}
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Segurança</h3>
                    <p className="text-sm text-gray-600">
                      Seus dados são protegidos e utilizados apenas para validação do cadastro.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Prazo de Análise</h3>
                    <p className="text-sm text-gray-600">
                      Sua solicitação será analisada em até 48 horas úteis.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Órgãos Públicos</h3>
                    <p className="text-sm text-gray-600">
                      Acesso exclusivo para órgãos da administração pública.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Dúvidas?</h3>
              <p className="text-sm text-blue-700">
                Entre em contato pelo email{' '}
                <a href="mailto:suporte@portaldcp.com.br" className="underline">
                  suporte@portaldcp.com.br
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-400">
            © {new Date().getFullYear()} Portal DCP - Todos os direitos reservados
          </p>
        </div>
      </footer>
    </div>
  )
}
