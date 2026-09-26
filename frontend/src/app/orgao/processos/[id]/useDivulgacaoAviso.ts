"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import {
  consultarPrazos, inputLocalParaISO, lerErro, erroDeExcecao, sugestaoAPartirDoMinimo,
  type ErroBackend, type PrazosPublicacao,
} from "@/lib/publicacao"

/**
 * DIVULGAR O AVISO DA DISPENSA (art. 75, §3º; IN SEGES 67/2021) — lógica
 * única do "Divulgar aviso" (diálogo da tela do processo) e do "Publicar" da
 * tela da conformidade (etapa 8 — Entrega 5 da fase interna): escolhe o fim
 * do recebimento (prazo mínimo contado pelo backend com o calendário do
 * órgão), gera e confere o aviso de contratação direta (o PDF que vai ao PNCP)
 * e pratica o ato PUBLICAR (com o portão C). O prazo só começa quando o PNCP
 * confirmar (arts. 54 e 55).
 */
export function useDivulgacaoAviso(licitacaoId: string, fase: string, ativo: boolean) {
  const [fimPropostas, setFimPropostas] = useState("")
  const [prazos, setPrazos] = useState<PrazosPublicacao | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [erro, setErro] = useState<ErroBackend | null>(null)
  const [aviso, setAviso] = useState<{ documento_id: string; versao: number } | null>(null)
  const [gerando, setGerando] = useState(false)
  const [divulgando, setDivulgando] = useState(false)

  // Ao abrir: sugere o dia mínimo legal (feriados do órgão já descontados)
  useEffect(() => {
    if (!ativo) return
    setErro(null)
    setPrazos(null)
    setFimPropostas("")
    setAviso(null)
    consultarPrazos(licitacaoId, { data_publicacao_edital: new Date().toISOString() })
      .then((p) => setFimPropostas(sugestaoAPartirDoMinimo(p.data_minima_abertura)))
      .catch((e) => setErro(erroDeExcecao(e)))
  }, [ativo, licitacaoId])

  // Confere a data escolhida (pendências do backend se for cedo demais)
  useEffect(() => {
    if (!ativo || !fimPropostas) return
    let cancelado = false
    setCalculando(true)
    const t = setTimeout(async () => {
      try {
        const fim = inputLocalParaISO(fimPropostas)
        const p = await consultarPrazos(licitacaoId, {
          data_publicacao_edital: new Date().toISOString(),
          data_fim_acolhimento: fim,
          data_abertura_sessao: fim,
          data_limite_impugnacao: fim,
        })
        if (!cancelado) setPrazos(p)
      } catch {
        if (!cancelado) setPrazos(null)
      } finally {
        if (!cancelado) setCalculando(false)
      }
    }, 400)
    return () => { cancelado = true; clearTimeout(t) }
  }, [ativo, fimPropostas, licitacaoId])

  const cronograma = () => {
    const agora = new Date().toISOString()
    const fim = new Date(fimPropostas).toISOString()
    return { data_publicacao_edital: agora, data_limite_impugnacao: fim, data_inicio_acolhimento: agora, data_fim_acolhimento: fim, data_abertura_sessao: fim }
  }

  const gerarAviso = async () => {
    if (!fimPropostas) return
    setGerando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/aviso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cronograma()),
      })
      if (!res.ok) {
        setErro(await lerErro(res, "Erro ao gerar o aviso"))
        return
      }
      const a = await res.json()
      setAviso({ documento_id: a.documento_id, versao: a.versao })
    } catch (e) {
      setErro(erroDeExcecao(e))
    } finally {
      setGerando(false)
    }
  }

  const abrirAviso = async () => {
    if (!aviso) return
    const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/aviso/${aviso.documento_id}/arquivo`)
    if (!res.ok) return toast.error("Não foi possível abrir o aviso")
    window.open(URL.createObjectURL(await res.blob()), "_blank")
  }

  /** Pratica o PUBLICAR (portão C incluso). true = enviado ao PNCP. */
  const divulgar = async (): Promise<boolean> => {
    if (!fimPropostas) return false
    setDivulgando(true)
    setErro(null)
    try {
      // Etapa única da contratação direta: conclui a instrução se ainda não concluída
      if (fase !== "APROVACAO_INTERNA") {
        const ra = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/avancar`, { method: "PUT" })
        if (!ra.ok) {
          setErro(await lerErro(ra, "Erro ao concluir a instrução"))
          return false
        }
      }
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/publicar-edital`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cronograma()),
      })
      if (!res.ok) {
        setErro(await lerErro(res, "Erro ao divulgar"))
        return false
      }
      toast.success("Aviso enviado ao PNCP. O prazo de propostas só começa quando o PNCP confirmar a publicação (arts. 54 e 55) — acompanhe no alerta do processo.")
      return true
    } catch (e) {
      setErro(erroDeExcecao(e))
      return false
    } finally {
      setDivulgando(false)
    }
  }

  return { fimPropostas, setFimPropostas, prazos, calculando, erro, aviso, gerando, divulgando, gerarAviso, abrirAviso, divulgar }
}
