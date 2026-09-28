"use client"

/**
 * CENTRAL DE APROVAÇÕES › ASSINATURAS (homologação multiusuário, E1: o TR
 * "Aguardando assinaturas" não tinha onde ser assinado). Tudo o que o USUÁRIO
 * DO LOGIN precisa assinar — peças da fase interna (TR, despacho de
 * autorização, parecer…), contratos e outros documentos do portal —, com
 * "Ver PDF" e "Assinar" (mesmo mecanismo do "Autorizar e assinar": o
 * signatário é o próprio usuário logado). Quem não é signatário não vê (e o
 * servidor recusa: 403).
 * Por que uma aba própria (e não "Documentos"): "Documentos" é a aprovação
 * interna (aprovar/reprovar com motivo, etapa a etapa); assinar é outro ato —
 * pessoal, com a data da assinatura — e precisa ficar achável e contado.
 * API: GET /api/assinaturas-internas/pendentes · POST /api/assinaturas-internas/:id/assinar
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckCircle2, FileSignature, FileText, Loader2, PenLine } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { avisarTarefasAtualizadas } from "@/lib/tarefas"
import { avisarFaseInternaAtualizada, erroDaApi, fmtDia } from "@/lib/fase-interna/telas"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"

export interface AssinaturaPendente {
  documento_assinatura_id: string
  origem: "FASE_INTERNA" | "CONTRATO" | "OUTRO"
  titulo: string
  papel: string | null
  enviado_em: string | null
  signatarios: Array<{ nome: string; papel: string | null; assinou: boolean; sou_eu: boolean }>
  processo: { id: string; numero_processo: string | null; objeto: string | null } | null
  peca: { documento_id: string; tipo: string; titulo: string; versao: number; tela: string | null } | null
  pdf_url: string
  link: string | null
}

const ROTULO_ORIGEM: Record<AssinaturaPendente["origem"], string> = {
  FASE_INTERNA: "Peça da fase interna",
  CONTRATO: "Contrato",
  OUTRO: "Documento",
}

/** Contagem para o badge da aba (quantas assinaturas esperam o usuário do login). */
export async function carregarAssinaturasPendentes(): Promise<{ itens: AssinaturaPendente[]; aviso: string | null } | null> {
  try {
    const r = await authFetch(`${API_URL}/api/assinaturas-internas/pendentes`, { cache: "no-store" })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export function CaixaAssinaturas({ processoDestacado, onContagem }: { processoDestacado?: string | null; onContagem?: (n: number) => void }) {
  const { confirmar, dialogo } = useDialogoConfirmacao()
  const [itens, setItens] = useState<AssinaturaPendente[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [assinando, setAssinando] = useState<string | null>(null)
  const [assinadas, setAssinadas] = useState<string[]>([])

  const carregar = useCallback(async () => {
    const r = await carregarAssinaturasPendentes()
    setItens(r?.itens ?? [])
    setAviso(r?.aviso ?? null)
    onContagem?.(r?.itens.length ?? 0)
  }, [onContagem])
  useEffect(() => {
    carregar()
  }, [carregar])

  const assinar = async (a: AssinaturaPendente) => {
    const outros = a.signatarios.filter((s) => !s.sou_eu)
    const ok = await confirmar({
      titulo: `Assinar ${a.titulo}`,
      mensagem:
        `Você assina${a.papel ? ` como ${a.papel}` : ""}, com o seu usuário. A assinatura fica registrada com data e hora (Brasília) e o código de validação.` +
        (outros.length ? ` A peça só vale quando todos assinarem (${outros.map((s) => `${s.nome}${s.assinou ? " ✓" : ""}`).join(", ")}).` : ""),
      confirmarRotulo: "Assinar",
    })
    if (!ok) return
    setAssinando(a.documento_assinatura_id)
    try {
      const r = await authFetch(`${API_URL}/api/assinaturas-internas/${a.documento_assinatura_id}/assinar`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json().catch(() => null)
      toast.success(j?.concluida ? `${a.titulo}: assinada por todos — documento concluído.` : `${a.titulo}: sua assinatura foi registrada. Faltam os demais signatários.`)
      setAssinadas((l) => [...l, a.documento_assinatura_id])
      if (a.processo) avisarFaseInternaAtualizada(a.processo.id)
      avisarTarefasAtualizadas()
      await carregar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setAssinando(null)
    }
  }

  if (itens === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando o que você precisa assinar…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {dialogo}
      {aviso && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{aviso}</p>}
      {!itens.length && !aviso && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-600">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" aria-hidden="true" />
            Nada esperando a sua assinatura.
            {assinadas.length > 0 && <span className="block mt-1">Você assinou {assinadas.length} documento(s) agora.</span>}
          </CardContent>
        </Card>
      )}
      {itens.map((a) => {
        const destacado = !!processoDestacado && a.processo?.id === processoDestacado
        return (
          <Card key={a.documento_assinatura_id} className={`border-l-4 border-l-violet-400 ${destacado ? "ring-2 ring-violet-300" : ""}`}>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileSignature className="w-4 h-4 text-violet-700 shrink-0" aria-hidden="true" />
                    <span className="font-medium text-gray-900">{a.titulo}</span>
                    <Badge variant="outline" className="text-[11px]">{ROTULO_ORIGEM[a.origem]}</Badge>
                  </div>
                  {a.processo && (
                    <p className="text-xs text-gray-700">
                      Processo {a.processo.numero_processo ?? "—"}
                      {a.processo.objeto ? ` · ${a.processo.objeto.length > 110 ? `${a.processo.objeto.slice(0, 107)}…` : a.processo.objeto}` : ""}
                    </p>
                  )}
                  <p className="text-xs text-gray-700">
                    {a.papel ? <>Você assina como <b>{a.papel}</b></> : "Você é signatário"}
                    {a.enviado_em ? ` · enviado em ${fmtDia(a.enviado_em)}` : ""}
                  </p>
                  {a.signatarios.length > 1 && (
                    <p className="text-xs text-gray-600">
                      Signatários:{" "}
                      {a.signatarios.map((s, i) => (
                        <span key={i}>
                          {i > 0 ? ", " : ""}
                          {s.sou_eu ? <b>você</b> : s.nome}
                          {s.papel ? ` (${s.papel})` : ""}
                          {s.assinou ? " — assinou" : " — falta"}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => abrirArquivoAutenticado(`${API_URL}${a.pdf_url}`)}>
                    <FileText className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Ver PDF
                  </Button>
                  {a.link && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={a.link}>Abrir {a.peca ? "a peça" : "o documento"}</Link>
                    </Button>
                  )}
                  <Button size="sm" onClick={() => assinar(a)} disabled={assinando !== null} aria-busy={assinando === a.documento_assinatura_id}>
                    {assinando === a.documento_assinatura_id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" aria-hidden="true" /> : <PenLine className="w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                    Assinar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
