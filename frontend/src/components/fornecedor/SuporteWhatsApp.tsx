"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"
import { API_URL } from "@/lib/api"

/** Usado se a rota do suporte não responder. */
const WHATSAPP_PADRAO = "5577981251987"

let numeroEmCache: string | null | undefined

async function numeroDoSuporte(): Promise<string | null> {
  if (numeroEmCache !== undefined) return numeroEmCache
  try {
    const res = await fetch(`${API_URL}/api/suporte/contato`)
    const dados = res.ok ? await res.json() : null
    // null = suporte desligado pelo admin (configuração vazia)
    numeroEmCache = dados ? dados.whatsapp ?? null : WHATSAPP_PADRAO
  } catch {
    numeroEmCache = WHATSAPP_PADRAO
  }
  return numeroEmCache ?? null
}

function fornecedorLogado(): { nome?: string; cnpj?: string } {
  try {
    const dados = JSON.parse(localStorage.getItem("fornecedor") || "null")
    if (!dados) return {}
    return {
      nome: dados.razao_social || dados.nome,
      cnpj: dados.cpf_cnpj || dados.cnpj,
    }
  } catch {
    return {}
  }
}

/**
 * Abre o WhatsApp do suporte com a mensagem já preenchida: quem é o
 * fornecedor, em que tela está e, quando houver, o erro que apareceu.
 */
export async function abrirSuporteWhatsApp(detalhe?: string) {
  const numero = await numeroDoSuporte()
  if (!numero) return
  const { nome, cnpj } = fornecedorLogado()
  const linhas = [
    "Olá! Preciso de ajuda no Portal DCP.",
    nome || cnpj ? `Fornecedor: ${[nome, cnpj && `CNPJ ${cnpj}`].filter(Boolean).join(" — ")}` : null,
    typeof window !== "undefined" ? `Tela: ${window.location.pathname}` : null,
    detalhe ? `Problema: ${detalhe}` : null,
  ].filter(Boolean)
  window.open(
    `https://wa.me/${numero}?text=${encodeURIComponent(linhas.join("\n"))}`,
    "_blank",
    "noopener,noreferrer",
  )
}

/** Botão fixo no canto da tela do portal do fornecedor. */
export function BotaoSuporteWhatsApp() {
  const [numero, setNumero] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    numeroDoSuporte().then(setNumero)
  }, [])

  if (!numero) return null

  return (
    <button
      type="button"
      onClick={() => abrirSuporteWhatsApp()}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400"
      title="Falar com o suporte pelo WhatsApp"
      aria-label="Falar com o suporte pelo WhatsApp"
    >
      <MessageCircle className="h-5 w-5" />
      Suporte
    </button>
  )
}
