"use client"

import { useEffect, useState } from "react"
import { Bot, Copy, Check, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { adminFetch } from "@/lib/api"

export default function WhatsappAgentPage() {
  const [ativo, setAtivo] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp/agent/webhook`
      : "/api/whatsapp/agent/webhook"

  useEffect(() => {
    adminFetch("/api/system-config/whatsapp-agent")
      .then((r) => r.json())
      .then((data) => setAtivo(data.ativo === true))
      .catch(() => toast.error("Erro ao carregar configuração"))
      .finally(() => setCarregando(false))
  }, [])

  const handleToggle = async () => {
    const novoEstado = !ativo
    setSalvando(true)
    try {
      const resp = await adminFetch("/api/system-config/whatsapp-agent", {
        method: "PUT",
        body: JSON.stringify({ ativo: novoEstado }),
      })
      if (!resp.ok) throw new Error("Erro ao salvar")
      setAtivo(novoEstado)
      toast.success(novoEstado ? "Agente ativado com sucesso!" : "Agente desativado com sucesso!")
    } catch {
      toast.error("Erro ao salvar configuração")
    } finally {
      setSalvando(false)
    }
  }

  const handleCopiar = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 rounded-lg">
          <Bot className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agente de IA — WhatsApp</h1>
          <p className="text-slate-500 text-sm">
            Atendimento automático de fornecedores via WhatsApp
          </p>
        </div>
      </div>

      {/* Card: Status */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Status do Agente</h2>

        {carregando ? (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400" />
            Carregando...
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    ativo ? "bg-green-500" : "bg-slate-300"
                  }`}
                />
                <span className="font-medium text-slate-700">
                  {ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-sm text-slate-500">
                {ativo
                  ? "O agente está respondendo mensagens de fornecedores no WhatsApp automaticamente."
                  : "O agente está pausado. Mensagens recebidas serão ignoradas."}
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              onClick={handleToggle}
              disabled={salvando}
              className={`relative w-14 h-7 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                ativo ? "bg-green-500" : "bg-slate-300"
              } ${salvando ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              aria-label={ativo ? "Desativar agente" : "Ativar agente"}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  ativo ? "translate-x-7" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Card: Funcionalidades */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-3">O que o agente faz</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>
              <strong>Cadastro de fornecedores:</strong> Guia o fornecedor para criar uma conta no
              portal via WhatsApp (CNPJ, e-mail, link de senha por e-mail)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>
              <strong>FAQ inteligente:</strong> Responde dúvidas sobre o portal (contratos,
              medições, ordens, credenciamento) usando IA
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>
              <strong>Sessão persistente:</strong> Mantém o contexto da conversa por até 24h
            </span>
          </li>
        </ul>
      </div>

      {/* Card: Webhook */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-1">
          Configuração do Webhook (Z-API)
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Configure esta URL no painel do Z-API em:{" "}
          <strong>Instância → Webhooks → URL Recebida</strong>
        </p>

        <div className="flex items-center gap-2">
          <code className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 break-all">
            {webhookUrl}
          </code>
          <button
            onClick={handleCopiar}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm transition-colors"
            title="Copiar URL"
          >
            {copiado ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar
              </>
            )}
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Certifique-se de que as credenciais do Z-API estejam configuradas em{" "}
            <strong>Admin → Integração WhatsApp</strong> para que o agente consiga enviar
            respostas.
          </span>
        </div>
      </div>
    </div>
  )
}
