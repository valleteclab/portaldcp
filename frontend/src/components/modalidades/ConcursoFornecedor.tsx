"use client"

/**
 * CONCURSO — visão do participante (Lei 14.133/2021 art. 30; plano E7c):
 * regulamento, inscrição do trabalho (arquivo SEM identificação + envelope de
 * identificação com a qualificação exigida), o próprio trabalho com o código,
 * classificação publicada, recursos e, se vencedor, aceite da cessão de
 * direitos (art. 93) e o termo de premiação.
 */
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Award, Loader2 } from "lucide-react"
import { API_URL } from "@/lib/api"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { RecursosFornecedorPanel } from "@/components/sala/RecursosFornecedorPanel"
import { Campo, abrirArquivo, classeInput, fmtMoeda, usePainel } from "./comum"

export function ConcursoFornecedor({ licitacaoId }: { licitacaoId: string }) {
  const base = `/api/concurso/licitacao/${licitacaoId}`
  const { dados, carregando, erro, executando, executar } = usePainel<any>(`${API_URL}${base}`)
  const [titulo, setTitulo] = useState("")
  const [resumo, setResumo] = useState("")
  const [trabalho, setTrabalho] = useState<File | null>(null)
  const [identificacao, setIdentificacao] = useState<File | null>(null)
  const [autoria, setAutoria] = useState(false)
  const [cessao, setCessao] = useState(false)

  if (carregando && !dados) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o concurso…</div>
  if (!dados) return <ErroPendencias erro={erro} />
  const reg = dados.regulamento ?? {}
  const meu = (dados.trabalhos ?? [])[0] ?? null
  const minhaPremiacao = (dados.premiacoes ?? [])[0] ?? null

  const enviar = async () => {
    const fd = new FormData()
    fd.append("titulo", titulo)
    fd.append("resumo", resumo)
    fd.append("declaracao_autoria", String(autoria))
    fd.append("declaracao_cessao", String(cessao))
    if (trabalho) fd.append("trabalho", trabalho)
    if (identificacao) fd.append("identificacao", identificacao)
    await executar("inscrever", `${base}/trabalho`, { body: fd })
  }

  return (
    <Card>
      <CardHeader className="border-b bg-violet-50">
        <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4" /> Concurso — inscrição do trabalho</CardTitle>
        <CardDescription>
          A banca recebe só o CÓDIGO do seu trabalho; a sua identificação fica em envelope separado, aberto só depois do julgamento.
          Não coloque seu nome no arquivo do trabalho.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <ErroPendencias erro={erro} />
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p><b>Qualificação exigida:</b> {reg.qualificacao_exigida ?? "—"}</p>
          <p><b>Diretrizes:</b> {reg.diretrizes_trabalho ?? "—"}</p>
          <p><b>Forma de apresentação:</b> {reg.forma_apresentacao ?? "—"}</p>
          <p><b>Condições de realização:</b> {reg.condicoes_realizacao ?? "—"}</p>
          <p><b>{reg.tipo_retribuicao === "REMUNERACAO" ? "Remuneração" : "Prêmio"}:</b> {fmtMoeda(reg.valor_premio)} {reg.descricao_premio ?? ""}</p>
          {reg.exige_cessao_direitos && <p><b>Cessão de direitos:</b> o vencedor cede os direitos patrimoniais do trabalho (art. 30 parágrafo único; art. 93).</p>}
        </div>

        {meu ? (
          <div className="rounded border p-2 text-sm">
            <p>
              Seu trabalho: <span className="font-mono font-semibold">{meu.codigo}</span> — {meu.titulo} ({meu.status === "RETIRADO" ? "retirado" : "inscrito"})
            </p>
            <p className="text-xs text-slate-500">Resumo SHA-256 do arquivo: {meu.arquivo?.sha256}</p>
            <div className="mt-1 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/trabalhos/${meu.id}/arquivo`)}>Meu trabalho</Button>
              {dados.inscricaoAberta && meu.status === "SUBMETIDO" && (
                <Button size="sm" variant="outline" disabled={!!executando} onClick={() => executar("retirar", `${base}/trabalho`, { method: "DELETE" })}>Retirar para reenviar</Button>
              )}
            </div>
            {meu.qualificacao && meu.qualificacao !== "PENDENTE" && (
              <p className="text-xs">Qualificação: {meu.qualificacao === "QUALIFICADO" ? "conferida" : `não atendida — ${meu.qualificacaoMotivo ?? ""}`}</p>
            )}
          </div>
        ) : null}

        {dados.inscricaoAberta && (!meu || meu.status === "RETIRADO") && (
          <div className="space-y-2 rounded border p-3">
            <Campo rotulo="Título do trabalho (sem identificar o autor)">
              <input className={classeInput} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Campo>
            <Campo rotulo="Resumo">
              <textarea rows={2} className={classeInput} value={resumo} onChange={(e) => setResumo(e.target.value)} />
            </Campo>
            <Campo rotulo="Arquivo do trabalho (PDF, imagem ou ZIP)">
              <input type="file" accept="application/pdf,image/jpeg,image/png,application/zip" onChange={(e) => setTrabalho(e.target.files?.[0] ?? null)} />
            </Campo>
            <Campo rotulo="Envelope de identificação — documentos da qualificação exigida (PDF/JPG/PNG)">
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setIdentificacao(e.target.files?.[0] ?? null)} />
            </Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoria} onChange={(e) => setAutoria(e.target.checked)} /> Declaro a autoria do trabalho e o atendimento ao regulamento</label>
            {reg.exige_cessao_direitos && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cessao} onChange={(e) => setCessao(e.target.checked)} /> Concordo em ceder os direitos patrimoniais se vencer (art. 93)</label>
            )}
            <Button size="sm" onClick={enviar} disabled={!!executando}>{executando === "inscrever" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Enviar inscrição</Button>
          </div>
        )}

        {dados.classificacao && (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">Classificação publicada</h3>
            {dados.classificacao.map((c: any) => (
              <p key={c.codigo} className="text-sm">{c.posicao}º <span className="font-mono">{c.codigo}</span> — {c.autor} · nota {Number(c.notaTecnica).toFixed(2)}</p>
            ))}
          </section>
        )}
        {dados.sessaoId && <RecursosFornecedorPanel sessaoId={dados.sessaoId} />}
        {minhaPremiacao && (
          <section className="space-y-2 rounded border border-violet-200 bg-violet-50 p-2 text-sm">
            <p>Você venceu o concurso: {fmtMoeda(minhaPremiacao.valor)}.</p>
            {minhaPremiacao.termoGeradoEm && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/premiacao/${minhaPremiacao.id}/termo`)}>Termo de premiação</Button>}
            {minhaPremiacao.status === "AGUARDANDO_CESSAO" && (
              <Button size="sm" disabled={!!executando} onClick={() => executar("cessao", `${base}/premiacao/cessao`)}>Aceitar a cessão dos direitos patrimoniais (art. 93)</Button>
            )}
            {minhaPremiacao.status === "PAGO" && <p className="text-xs text-emerald-700">Pagamento do prêmio registrado.</p>}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
