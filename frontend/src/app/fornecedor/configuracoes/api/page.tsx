'use client'

import { useEffect, useState } from 'react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Key,
  ShieldCheck,
  ShieldOff,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Bot,
  Code2,
  Terminal,
  Trash2,
} from 'lucide-react'

interface FornecedorBasico {
  id: string
  razao_social: string
}

export default function ApiKeyPage() {
  const [fornecedor, setFornecedor] = useState<FornecedorBasico | null>(null)
  const [temChave, setTemChave] = useState<boolean | null>(null)
  const [novaChave, setNovaChave] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoRevogacao, setConfirmandoRevogacao] = useState(false)

  // Carrega dados do fornecedor do localStorage
  useEffect(() => {
    const raw = localStorage.getItem('fornecedor')
    if (raw) {
      try {
        const f = JSON.parse(raw)
        setFornecedor(f)
      } catch {
        setErro('Sessão inválida. Faça login novamente.')
        setCarregando(false)
        return
      }
    } else {
      setErro('Sessão expirada. Faça login novamente.')
      setCarregando(false)
      return
    }
  }, [])

  // Busca status da chave
  useEffect(() => {
    if (!fornecedor) return
    verificarStatus()
  }, [fornecedor])

  async function verificarStatus() {
    if (!fornecedor) return
    setCarregando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/${fornecedor.id}/api-key`)
      if (!res.ok) throw new Error('Erro ao verificar status da API Key')
      const data = await res.json()
      setTemChave(data.ativa)
    } catch (e: any) {
      setErro(e.message || 'Erro ao verificar API Key')
    } finally {
      setCarregando(false)
    }
  }

  async function gerarChave() {
    if (!fornecedor) return
    setProcessando(true)
    setErro(null)
    setNovaChave(null)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/${fornecedor.id}/api-key`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao gerar API Key')
      }
      const data = await res.json()
      setNovaChave(data.api_key)
      setTemChave(true)
    } catch (e: any) {
      setErro(e.message || 'Erro ao gerar API Key')
    } finally {
      setProcessando(false)
    }
  }

  async function revogarChave() {
    if (!fornecedor) return
    setProcessando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/${fornecedor.id}/api-key`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Erro ao revogar API Key')
      setTemChave(false)
      setNovaChave(null)
      setConfirmandoRevogacao(false)
    } catch (e: any) {
      setErro(e.message || 'Erro ao revogar API Key')
    } finally {
      setProcessando(false)
    }
  }

  async function copiarChave() {
    if (!novaChave) return
    await navigator.clipboard.writeText(novaChave)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Bot className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Acesso via IA (API Key)</h1>
          <p className="text-sm text-gray-500">
            Permite que agentes de IA (Claude, etc.) submetam medições automaticamente em seu nome.
          </p>
        </div>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* Status da chave */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-gray-500" />
              <CardTitle className="text-base">API Key</CardTitle>
            </div>
            {temChave !== null && (
              <Badge
                className={
                  temChave
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : 'bg-gray-100 text-gray-600 border-gray-200'
                }
              >
                {temChave ? (
                  <><ShieldCheck className="w-3 h-3 mr-1" />Ativa</>
                ) : (
                  <><ShieldOff className="w-3 h-3 mr-1" />Sem chave</>
                )}
              </Badge>
            )}
          </div>
          <CardDescription>
            {temChave
              ? 'Você possui uma API Key ativa. O valor não é exibido por segurança.'
              : 'Nenhuma API Key gerada. Gere uma para integrar com agentes de IA.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chave recém-gerada */}
          {novaChave && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <AlertDescription>
                <p className="font-semibold text-amber-800 mb-2">
                  Copie e salve esta chave agora — ela não será exibida novamente.
                </p>
                <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-md p-3 font-mono text-sm break-all">
                  <span className="flex-1 text-gray-800">{novaChave}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copiarChave}
                    className="shrink-0 text-amber-700 hover:text-amber-900"
                  >
                    {copiado ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Ações */}
          <div className="flex gap-2">
            <Button
              onClick={gerarChave}
              disabled={processando}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {processando ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Key className="w-4 h-4 mr-2" />
              )}
              {temChave ? 'Gerar nova chave' : 'Gerar API Key'}
            </Button>

            {temChave && !confirmandoRevogacao && (
              <Button
                variant="outline"
                onClick={() => setConfirmandoRevogacao(true)}
                disabled={processando}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Revogar
              </Button>
            )}

            {confirmandoRevogacao && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Confirmar revogação?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={revogarChave}
                  disabled={processando}
                >
                  {processando ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Revogar'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmandoRevogacao(false)}
                  disabled={processando}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Instruções de configuração */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-gray-500" />
            <CardTitle className="text-base">Como configurar o Claude Desktop</CardTitle>
          </div>
          <CardDescription>
            Configure o agente de IA para usar sua API Key automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-4 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-semibold text-xs">1</span>
              <span>
                Abra o <strong>Claude Desktop</strong> e acesse{' '}
                <code className="bg-gray-100 px-1 rounded">Configurações → Developer → Edit Config</code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-semibold text-xs">2</span>
              <div className="flex-1">
                <p className="mb-2">Adicione o seguinte ao arquivo <code className="bg-gray-100 px-1 rounded">claude_desktop_config.json</code>:</p>
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed">{`{
  "mcpServers": {
    "portaldcp": {
      "command": "npx",
      "args": ["-y", "portaldcp-mcp"],
      "env": {
        "PORTALDCP_URL": "https://portaldcp.com.br",
        "PORTALDCP_API_KEY": "SUA_API_KEY_AQUI"
      }
    }
  }
}`}</pre>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-semibold text-xs">3</span>
              <span>Reinicie o Claude Desktop. O agente terá acesso às ferramentas do Portal DCP.</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* O que o agente pode fazer */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-gray-500" />
            <CardTitle className="text-base">O que o agente pode fazer</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              'Listar seus contratos e ver saldos disponíveis',
              'Criar novas medições com período e itens',
              'Anexar notas fiscais e documentos (PDF, JPG)',
              'Assinar digitalmente e enviar medições para aprovação do fiscal',
              'Consultar o status de medições enviadas',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 font-medium mb-1">Exemplo de uso:</p>
            <p className="text-xs text-gray-600 italic">
              &ldquo;Submeta a medição de março/2026 do contrato 025A/2023. Executamos o mês completo.
              NF 000456, valor R$ 5.000. Anexe o arquivo /home/user/NF_marco.pdf.&rdquo;
            </p>
          </div>

          <Alert className="mt-4 border-blue-200 bg-blue-50">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-xs text-blue-800">
              <strong>Segurança:</strong> O agente acessa apenas contratos vinculados ao seu CNPJ.
              A API Key substitui o OTP (código WhatsApp) para assinaturas digitais.
              Revogue a chave a qualquer momento se suspeitar de uso indevido.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
