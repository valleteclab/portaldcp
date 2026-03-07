'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Bot, Key, Cpu, CheckCircle, AlertTriangle, Save, Eye, EyeOff } from 'lucide-react'
import { adminFetch } from '@/lib/api'

const MODELOS_DISPONIVEIS = [
  // Anthropic
  { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Anthropic) ⭐ Recomendado', descricao: 'Melhor equilíbrio custo/qualidade. Excelente para extração de contratos e documentos.' },
  { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4 (Anthropic) — Mais poderoso', descricao: 'Maior precisão. Ideal para contratos complexos. Custo mais elevado.' },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (Anthropic) — Mais rápido', descricao: 'Muito rápido e econômico. Bom para tarefas simples.' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (Anthropic)', descricao: 'Versão anterior do Sonnet. Boa opção de custo-benefício.' },
  // OpenAI
  { value: 'openai/gpt-5', label: 'GPT-5 (OpenAI)', descricao: 'Modelo mais recente da OpenAI.' },
  { value: 'openai/gpt-5.1', label: 'GPT-5.1 (OpenAI)', descricao: 'Versão 5.1 do GPT.' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini (OpenAI) — Econômico', descricao: 'Versão compacta do GPT-5. Bom custo-benefício.' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano (OpenAI) — Ultra econômico', descricao: 'Versão mais leve do GPT-5. Custo muito baixo.' },
  { value: 'openai/gpt-4o', label: 'GPT-4o (OpenAI)', descricao: 'Modelo clássico com visão. Boa alternativa.' },
  { value: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B (OpenAI) — FREE', descricao: 'Modelo open source da OpenAI com 120B parâmetros. Gratuito.' },
  { value: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (OpenAI) — FREE', descricao: 'Modelo open source da OpenAI com 20B parâmetros. Gratuito.' },
  // Google
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Google)', descricao: 'Modelo Google rápido e eficiente. Suporte nativo a PDF.' },
  { value: 'google/gemini-2.5-flash-lite-preview-09-2025', label: 'Gemini 2.5 Flash Lite (Google) — Econômico', descricao: 'Versão econômica do Gemini 2.5 Flash.' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (Google)', descricao: 'Próxima geração do Gemini. Preview.' },
  { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview (Google)', descricao: 'Versão Pro do Gemini 3. Alta capacidade.' },
  // DeepSeek
  { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1 — Raciocínio avançado', descricao: 'Modelo de raciocínio em cadeia. Excelente para análise detalhada de contratos.' },
  // Meta
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (Meta) — Open Source', descricao: 'Modelo open source potente. Não suporta visão/imagens.' },
  // Mistral
  { value: 'mistralai/mistral-large', label: 'Mistral Large (Mistral AI)', descricao: 'Modelo premium da Mistral. Alta capacidade de compreensão.' },
  { value: 'mistralai/mistral-medium-3', label: 'Mistral Medium 3 (Mistral AI)', descricao: 'Equilíbrio entre capacidade e custo.' },
  { value: 'mistralai/mistral-small-3.2-24b-instruct:2506', label: 'Mistral Small 3.2 24B (Mistral AI)', descricao: 'Versão compacta e econômica da Mistral.' },
  { value: 'mistralai/codestral-2508', label: 'Codestral 2508 (Mistral AI)', descricao: 'Especializado em código. Útil para automações.' },
  // Moonshot / Kimi
  { value: 'moonshotai/kimi-k2', label: 'Kimi K2 (Moonshot AI)', descricao: 'Modelo chinês de alto desempenho.' },
  { value: 'moonshotai/kimi-k2:thinking', label: 'Kimi K2 Thinking (Moonshot AI)', descricao: 'Versão com raciocínio avançado do Kimi K2.' },
  // Perplexity
  { value: 'perplexity/sonar', label: 'Sonar (Perplexity)', descricao: 'Modelo com busca em tempo real integrada.' },
  // Qwen
  { value: 'qwen/qwen3-235b-a22b', label: 'Qwen3 235B (Alibaba)', descricao: 'Modelo open source gigante da Alibaba. Altíssima capacidade.' },
  { value: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (Alibaba) — FREE', descricao: 'Modelo especializado em código da Alibaba. Gratuito.' },
  // xAI
  { value: 'x-ai/grok-3', label: 'Grok 3 (xAI)', descricao: 'Modelo da xAI. Alto desempenho em raciocínio.' },
  { value: 'x-ai/grok-3-mini', label: 'Grok 3 Mini (xAI) — Econômico', descricao: 'Versão compacta do Grok 3.' },
  { value: 'x-ai/grok-4', label: 'Grok 4 (xAI)', descricao: 'Próxima geração do Grok.' },
  // NVIDIA
  { value: 'nvidia/llama-nemotron-embed-vl-1b-v2:free', label: 'Llama Nemotron Embed VL 1B (NVIDIA) — FREE', descricao: 'Modelo de embeddings multimodal da NVIDIA. Gratuito.' },
  // Sourceful
  { value: 'sourceful/riverflow-v2-pro', label: 'Riverflow V2 Pro (Sourceful)', descricao: 'Modelo especializado da Sourceful.' },
  // Liquid
  { value: 'liquid/lfm-2.5-1.2b-thinking:free', label: 'LFM 2.5 1.2B Thinking (Liquid) — FREE', descricao: 'Modelo thinking da Liquid com 1.2B parâmetros. Gratuito.' },
  // Z-AI
  { value: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air (Z-AI) — FREE', descricao: 'Modelo GLM da Z-AI. Gratuito.' },
]

export default function IaConfigPage() {
  const [modelo, setModelo] = useState('anthropic/claude-3.5-sonnet')
  const [apiKey, setApiKey] = useState('')
  const [mostrarKey, setMostrarKey] = useState(false)
  const [configurado, setConfigurado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null)

  useEffect(() => {
    adminFetch('/api/system-config/ia')
      .then(r => r.json())
      .then(data => {
        setModelo(data.modelo || 'anthropic/claude-3.5-sonnet')
        setConfigurado(data.configurado)
      })
      .catch(() => {})
  }, [])

  const salvar = async () => {
    setSalvando(true)
    setMensagem(null)
    try {
      const body: any = { modelo }
      if (apiKey.trim()) body.api_key = apiKey.trim()

      const res = await adminFetch('/api/system-config/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || 'Erro ao salvar')

      setMensagem({ tipo: 'success', texto: 'Configurações de IA salvas com sucesso!' })
      setApiKey('')
      if (apiKey.trim()) setConfigurado(true)
    } catch (err: any) {
      setMensagem({ tipo: 'error', texto: err.message })
    } finally {
      setSalvando(false)
    }
  }

  const modeloAtual = MODELOS_DISPONIVEIS.find(m => m.value === modelo)

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <Bot className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuração de IA</h1>
          <p className="text-sm text-gray-500">Configure o modelo de IA e a API Key para usar os recursos de inteligência artificial</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Status atual */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              Status da Integração
              <Badge className={configurado ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                {configurado ? (
                  <><CheckCircle className="w-3.5 h-3.5 mr-1" />API Key configurada</>
                ) : (
                  <><AlertTriangle className="w-3.5 h-3.5 mr-1" />API Key não configurada</>
                )}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Todos os recursos de IA do Portal DCP usam o <strong>OpenRouter</strong> como gateway, permitindo usar qualquer modelo listado abaixo com uma única API Key.
            </p>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-purple-600 hover:underline mt-2 inline-block"
            >
              → Obter API Key no OpenRouter
            </a>
          </CardContent>
        </Card>

        {/* Seleção de modelo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-500" />
              Modelo de IA
            </CardTitle>
            <CardDescription>Escolha o modelo que será usado em todas as funcionalidades de IA</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Select value={modelo} onValueChange={setModelo}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELOS_DISPONIVEIS.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {modeloAtual && (
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                <p className="text-sm text-purple-700">{modeloAtual.descricao}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Key */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-500" />
              API Key OpenRouter
            </CardTitle>
            <CardDescription>
              {configurado
                ? 'Uma API Key já está configurada. Preencha abaixo apenas para alterá-la.'
                : 'Informe sua API Key do OpenRouter. Ela será armazenada criptografada.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Input
                type={mostrarKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={configurado ? '••••••••••••••• (deixe em branco para manter)' : 'sk-or-v1-...'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setMostrarKey(!mostrarKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {mostrarKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Mensagem de resultado */}
        {mensagem && (
          <Alert className={mensagem.tipo === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            {mensagem.tipo === 'success'
              ? <CheckCircle className="w-4 h-4 text-green-600" />
              : <AlertTriangle className="w-4 h-4 text-red-600" />}
            <AlertDescription className={mensagem.tipo === 'success' ? 'text-green-700' : 'text-red-700'}>
              {mensagem.texto}
            </AlertDescription>
          </Alert>
        )}

        {/* Botão salvar */}
        <Button onClick={salvar} disabled={salvando} className="bg-purple-600 hover:bg-purple-700 w-full h-11">
          {salvando ? (
            <span className="animate-pulse">Salvando...</span>
          ) : (
            <><Save className="w-4 h-4 mr-2" />Salvar Configurações de IA</>
          )}
        </Button>

        {/* Funcionalidades que usam IA */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Funcionalidades que usam IA</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-center gap-2"><Bot className="w-3.5 h-3.5 text-purple-400" />Importação de contratos via PDF/imagem</li>
              <li className="flex items-center gap-2"><Bot className="w-3.5 h-3.5 text-purple-400" />Assistente de elaboração de ETP, TR, PP</li>
              <li className="flex items-center gap-2"><Bot className="w-3.5 h-3.5 text-purple-400" />Geração e revisão de documentos licitatórios</li>
              <li className="flex items-center gap-2"><Bot className="w-3.5 h-3.5 text-purple-400" />Chat de suporte especializado em licitações</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
