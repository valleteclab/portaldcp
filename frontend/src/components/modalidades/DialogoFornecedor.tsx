"use client"

/**
 * DIÁLOGO COMPETITIVO — visão do licitante (Lei 14.133/2021 art. 32; plano E7c):
 * necessidades e critérios do edital, manifestação de interesse (no prazo),
 * resultado da própria pré-seleção, AS PRÓPRIAS reuniões (ata e gravação) e
 * soluções enviadas (sigilosas — §1º IV), e o edital da fase competitiva.
 */
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, MessagesSquare } from "lucide-react"
import { API_URL } from "@/lib/api"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { Campo, abrirArquivo, classeInput, fmtDataHora, usePainel } from "./comum"

export function DialogoFornecedor({ licitacaoId }: { licitacaoId: string }) {
  const base = `/api/dialogo-competitivo/licitacao/${licitacaoId}`
  const { dados, carregando, erro, executando, executar } = usePainel<any>(`${API_URL}${base}`)
  const [texto, setTexto] = useState("")
  const [doc, setDoc] = useState<File | null>(null)
  const [razoes, setRazoes] = useState("")
  const [arqRazoes, setArqRazoes] = useState<File | null>(null)
  const [sol, setSol] = useState<{ titulo?: string; descricao?: string; consentimento?: boolean; arquivo?: File | null }>({})

  if (carregando && !dados) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o diálogo…</div>
  if (!dados) return <ErroPendencias erro={erro} />
  const eu = (dados.participantes ?? [])[0] ?? null
  const etapa: string = dados.etapa
  const podeManifestar = etapa === "MANIFESTACAO" && dados.licitacao.fase === "ACOLHIMENTO_PROPOSTAS"

  return (
    <Card>
      <CardHeader className="border-b bg-teal-50">
        <CardTitle className="flex items-center gap-2 text-base"><MessagesSquare className="h-4 w-4" /> Diálogo competitivo</CardTitle>
        <CardDescription>
          Suas soluções e informações não são reveladas aos demais licitantes sem o seu consentimento (art. 32, §1º, IV).
          Propostas só na fase competitiva, e só dos pré-selecionados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <ErroPendencias erro={erro} />
        <div className="space-y-1 text-sm">
          <p><b>Necessidades:</b> {dados.configuracao?.necessidades}</p>
          <p><b>Exigências definidas:</b> {dados.configuracao?.exigencias_definidas}</p>
          <p><b>Critérios de pré-seleção:</b></p>
          <ul className="list-disc pl-5 text-xs">{(dados.configuracao?.criterios_preselecao ?? []).map((c: any) => <li key={c.id}>{c.descricao}</li>)}</ul>
        </div>

        {eu && (
          <div className="rounded border p-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Sua manifestação ({fmtDataHora(eu.manifestadoEm)})</span>
              <Badge variant="outline">{eu.situacao === "PRE_SELECIONADO" ? "pré-selecionado" : eu.situacao === "NAO_SELECIONADO" ? "não selecionado" : "em análise"}</Badge>
            </div>
            {eu.decisaoMotivo && <p className="text-xs text-red-700">{eu.decisaoMotivo}</p>}
            {eu.reconsideracao && (
              <p className="text-xs">
                Pedido de reconsideração: {eu.reconsideracao.status === "PENDENTE" ? `em análise (decisão prevista até ${fmtDataHora(eu.reconsideracao.prazoDecisao)})` : eu.reconsideracao.status === "PROVIDA" ? "provido — você foi admitido ao diálogo" : "não provido"}
                {eu.reconsideracao.fundamentacao ? ` — ${eu.reconsideracao.fundamentacao}` : ""}
              </p>
            )}
            {eu.situacao === "NAO_SELECIONADO" && !eu.reconsideracao && eu.prazoPedidoReconsideracao && new Date(eu.prazoPedidoReconsideracao).getTime() > Date.now() && (
              <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50 p-2">
                <p className="text-xs font-medium">
                  Pedido de reconsideração (Lei 14.133/2021, art. 165, II) — até {fmtDataHora(eu.prazoPedidoReconsideracao)}
                </p>
                <textarea rows={3} className={classeInput} placeholder="Razões do pedido" value={razoes} onChange={(e) => setRazoes(e.target.value)} />
                <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setArqRazoes(e.target.files?.[0] ?? null)} />
                <Button
                  size="sm"
                  disabled={!!executando}
                  onClick={() => {
                    const fd = new FormData()
                    fd.append("razoes", razoes)
                    if (arqRazoes) fd.append("arquivo", arqRazoes)
                    executar("reconsideracao", `${base}/reconsideracao`, { body: fd })
                  }}
                >
                  Pedir reconsideração
                </Button>
              </div>
            )}
          </div>
        )}

        {podeManifestar && (
          <div className="space-y-2 rounded border p-3">
            <Campo rotulo="Manifestação de interesse — como atende aos critérios de pré-seleção">
              <textarea rows={3} className={classeInput} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <Campo rotulo="Documentos (PDF/imagem/ZIP)">
              <input type="file" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
            </Campo>
            <Button
              size="sm"
              disabled={!!executando}
              onClick={() => {
                const fd = new FormData()
                fd.append("manifestacao", texto)
                if (doc) fd.append("documento", doc)
                executar("manifestar", `${base}/manifestacao`, { body: fd })
              }}
            >
              {eu ? "Atualizar manifestação" : "Manifestar interesse"}
            </Button>
          </div>
        )}

        {(dados.reunioes ?? []).length > 0 && (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">Minhas reuniões</h3>
            {dados.reunioes.map((r: any) => (
              <div key={r.id} className="rounded border p-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span>{fmtDataHora(r.agendadaPara)} · rodada {r.rodada} — {r.pauta}</span>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
                {r.localOuLink && <p className="text-xs text-slate-500">{r.localOuLink}</p>}
                {r.ataTexto && <p className="text-xs">{r.ataTexto}</p>}
                <div className="flex gap-2">
                  {r.temAtaArquivo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/ata/${r.id}`)}>Ata</Button>}
                  {r.temGravacaoArquivo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/gravacao/${r.id}`)}>Gravação</Button>}
                  {r.gravacaoLink && <a className="text-xs text-blue-700" href={r.gravacaoLink} target="_blank" rel="noopener noreferrer">Gravação (link)</a>}
                </div>
              </div>
            ))}
          </section>
        )}

        {etapa === "DIALOGO" && eu?.situacao === "PRE_SELECIONADO" && (
          <div className="space-y-2 rounded border p-3">
            <p className="text-sm font-semibold">Enviar solução/informação à comissão</p>
            <input className={classeInput} placeholder="Título" value={sol.titulo ?? ""} onChange={(e) => setSol({ ...sol, titulo: e.target.value })} />
            <textarea rows={2} className={classeInput} placeholder="Descrição" value={sol.descricao ?? ""} onChange={(e) => setSol({ ...sol, descricao: e.target.value })} />
            <input type="file" onChange={(e) => setSol({ ...sol, arquivo: e.target.files?.[0] ?? null })} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!sol.consentimento} onChange={(e) => setSol({ ...sol, consentimento: e.target.checked })} />
              Autorizo a divulgação desta solução aos demais licitantes (art. 32, §1º, IV)
            </label>
            <Button
              size="sm"
              disabled={!!executando}
              onClick={() => {
                const fd = new FormData()
                fd.append("titulo", sol.titulo ?? "")
                if (sol.descricao) fd.append("descricao", sol.descricao)
                fd.append("consentimento_divulgacao", String(!!sol.consentimento))
                if (sol.arquivo) fd.append("arquivo", sol.arquivo)
                executar("solucao", `${base}/documentos`, { body: fd })
              }}
            >
              Enviar
            </Button>
          </div>
        )}
        {(dados.documentos ?? []).length > 0 && (
          <section className="space-y-1 text-sm">
            <h3 className="font-semibold">Minhas soluções enviadas</h3>
            {dados.documentos.map((d: any) => (
              <div key={d.id} className="flex justify-between gap-2 text-xs">
                <span>{d.titulo}{d.consentimentoDivulgacao ? " (divulgação autorizada)" : " (sigilosa)"}</span>
                {d.temArquivo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/documento/${d.id}`)}>Abrir</Button>}
              </div>
            ))}
          </section>
        )}

        {etapa === "COMPETITIVA" && (
          <div className="rounded border border-teal-200 bg-teal-50 p-2 text-sm">
            <p>Fase competitiva aberta — {dados.configuracao?.especificacao_solucao}</p>
            <p className="text-xs">Critérios de seleção: {dados.configuracao?.criterios_selecao}</p>
            <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/edital-fase-competitiva`)}>Edital da fase competitiva</Button>
            {eu?.situacao === "PRE_SELECIONADO" && <p className="text-xs">Envie a sua proposta pela área de propostas desta licitação até {fmtDataHora(dados.licitacao.data_fim_acolhimento)}.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
