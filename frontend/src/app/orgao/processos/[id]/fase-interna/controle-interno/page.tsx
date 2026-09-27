"use client"

/**
 * CONTROLE INTERNO (opcional por órgão — Entrega 3B; decisão 3 do dono).
 * Com o controle interno ativado em Configurações › Fase interna, a etapa
 * aparece entre o parecer e a publicação: manifestação favorável ou com
 * apontamentos, feita aqui (assinada por quem tem o papel Controle interno)
 * ou anexada (feita fora). É AVISO, não bloqueio.
 * API: GET /api/fase-interna/:id/controle-interno, POST /controle-interno/manifestar.
 */
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, Loader2, PenLine } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { RascunhoIaFaixa } from "@/components/fase-interna/etapas/RascunhoIaFaixa"
import { erroDaApi, fmtDia } from "@/lib/fase-interna/telas"

interface ControleTela {
  ativo: boolean
  licitacao: { id: string; numero_processo: string; objeto: string; fase_interna?: boolean }
  peca?: { status: string; versao: number; anexada: boolean } | null
  manifestacao?: { conclusao: string; apontamentos: string | null; por_nome: string | null; em: string } | null
  parecer?: { status: string } | null
  pode_manifestar?: boolean
  aviso?: string
}

export default function ControleInternoPage() {
  const { id } = useParams() as { id: string }
  const [d, setD] = useState<ControleTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)
  const [conclusao, setConclusao] = useState<"FAVORAVEL" | "COM_APONTAMENTOS">("FAVORAVEL")
  const [texto, setTexto] = useState("")
  const [apontamentos, setApontamentos] = useState("")
  /** Recusa do backend fica na tela (não só no aviso que some) — homologação E5. */
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/controle-interno`)
      if (!r.ok) throw new Error(await erroDaApi(r))
      setD(await r.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const manifestar = async () => {
    setOcupado(true)
    setErroAcao(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/controle-interno/manifestar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Apontamentos só na manifestação "com apontamentos" (o campo fica escondido na favorável)
        body: JSON.stringify({ conclusao, texto, apontamentos: conclusao === "COM_APONTAMENTOS" ? apontamentos : "" }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      setD(await r.json())
      setAtualizacao((n) => n + 1)
      toast.success("Manifestação assinada e juntada aos autos.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErroAcao(msg)
      toast.error(msg)
    } finally {
      setOcupado(false)
    }
  }

  if (erro) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-600 mb-2" aria-hidden="true" />
        <p>{erro}</p>
        <Link href={`/orgao/processos/${id}`} className="text-blue-800 hover:underline text-sm">Voltar ao processo</Link>
      </div>
    )
  }
  if (!d) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando o controle interno" />
      </div>
    )
  }

  return (
    <EtapaShell licitacaoId={id} tela="controle-interno" titulo="Controle interno" subtitulo="Art. 169, II da Lei 14.133/2021 — regulamento do órgão" atualizacao={atualizacao}>
      {erroAcao && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          <b>Não foi possível concluir:</b> {erroAcao}
        </div>
      )}
      {!d.ativo ? (
        <div className="rounded-lg border bg-slate-50 p-4 text-sm text-gray-800">
          O controle interno está <b>desativado</b> para este órgão — a etapa não se aplica. O administrador pode ativá-la em{" "}
          <Link className="text-blue-800 hover:underline" href="/orgao/configuracoes/fase-interna">Configurações › Fase interna</Link>.
        </div>
      ) : (
        <>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">{d.aviso}</p>
          <CaminhosDaPeca
            licitacaoId={id}
            tipo="MCI"
            titulo="Manifestação do controle interno"
            fazerAqui="manifestar-se aqui (assinada por quem tem o papel Controle interno)"
            atualizacao={atualizacao}
            permitirAssinatura={false}
            onAtualizado={() => {
              carregar()
              setAtualizacao((n) => n + 1)
            }}
          />
          {d.manifestacao && (
            <div className="rounded-lg border bg-white p-4 text-sm">
              Manifestação <b>{d.manifestacao.conclusao === "FAVORAVEL" ? "favorável" : "com apontamentos"}</b> — {d.manifestacao.por_nome ?? "controle interno"}, {fmtDia(d.manifestacao.em)}
              {d.manifestacao.apontamentos && <p className="mt-1 text-gray-800">Apontamentos: {d.manifestacao.apontamentos}</p>}
            </div>
          )}
          {d.parecer && d.parecer.status !== "OK" && d.parecer.status !== "NAO_SE_APLICA" && (
            <p className="text-sm text-amber-900">O parecer jurídico ainda não está pronto — a manifestação costuma vir depois dele.</p>
          )}
          <RascunhoIaFaixa
            licitacaoId={id}
            peca="MCI"
            somenteLeitura={!d.pode_manifestar || d.licitacao.fase_interna === false || !!d.manifestacao}
            atualizacao={atualizacao}
            rotuloAceitar="Levar para o formulário"
            explicacaoAceite="O texto vai para os campos vazios do formulário abaixo. A conclusão (favorável ou com apontamentos) é sua."
            onAceito={(a) => {
              const c = a.campos ?? {}
              if (c.texto && !texto.trim()) setTexto(c.texto)
              if (c.apontamentos && !apontamentos.trim()) setApontamentos(c.apontamentos)
            }}
          />
          {d.pode_manifestar ? (
            <section aria-label="Manifestação" className="rounded-lg border bg-white p-4 space-y-2 max-w-3xl">
              <div className="flex gap-4 text-sm flex-wrap">
                <label className="flex items-center gap-2">
                  <input type="radio" name="conclusao" checked={conclusao === "FAVORAVEL"} onChange={() => setConclusao("FAVORAVEL")} /> Favorável
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="conclusao" checked={conclusao === "COM_APONTAMENTOS"} onChange={() => setConclusao("COM_APONTAMENTOS")} /> Com apontamentos
                </label>
              </div>
              <Label htmlFor="texto">Análise (opcional)</Label>
              <Textarea id="texto" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
              {conclusao === "COM_APONTAMENTOS" && (
                <>
                  <Label htmlFor="apont">Apontamentos</Label>
                  <Textarea id="apont" rows={3} value={apontamentos} onChange={(e) => setApontamentos(e.target.value)} />
                </>
              )}
              <Button onClick={manifestar} disabled={ocupado || d.licitacao.fase_interna === false}>
                {ocupado ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PenLine className="w-4 h-4 mr-1" />} Assinar manifestação
              </Button>
            </section>
          ) : (
            <p className="text-xs text-gray-600">Só quem tem o papel <b>Controle interno</b> se manifesta aqui; a manifestação feita fora pode ser anexada acima.</p>
          )}
        </>
      )}
    </EtapaShell>
  )
}
