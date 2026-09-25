"use client"

/**
 * DIÁLOGO COMPETITIVO — painel do órgão (Lei 14.133/2021 art. 32; plano E7c).
 *  - fase interna: hipótese, necessidades, exigências e critérios de pré-seleção (§1º I e II);
 *  - comissão com ≥ 3 servidores efetivos e assessores com termo (§1º XI; §2º);
 *  - pré-seleção objetiva dos interessados; início da fase de diálogo;
 *  - reuniões com UM licitante, registradas em ata e gravadas (§1º VI);
 *  - conclusão motivada (§1º V e VIII) e edital da fase competitiva (≥ 60 dias úteis).
 */
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, MessagesSquare } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { inputLocalParaISO } from "@/lib/publicacao"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { FormConfiguracaoDialogo, type Valores } from "./formularios"
import { Campo, abrirArquivo, classeInput, fmtDataHora, usePainel } from "./comum"

const FASES_INTERNAS = ["PLANEJAMENTO", "TERMO_REFERENCIA", "PESQUISA_PRECOS", "ANALISE_JURIDICA", "APROVACAO_INTERNA"]
const ROTULO_ETAPA: Record<string, string> = {
  MANIFESTACAO: "Manifestação de interesse",
  PRE_SELECAO: "Pré-seleção",
  DIALOGO: "Fase de diálogo",
  CONCLUIDO: "Diálogo concluído",
  COMPETITIVA: "Fase competitiva",
}

export function DialogoPainel({ licitacaoId, onAtualizado }: { licitacaoId: string; onAtualizado?: () => void }) {
  const base = `/api/dialogo-competitivo/licitacao/${licitacaoId}`
  const { dados, carregando, erro, executando, executar } = usePainel<any>(`${API_URL}${base}`)
  const [cfg, setCfg] = useState<Valores>({})
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string; cargo: string | null }>>([])
  const [membros, setMembros] = useState<Array<Valores>>([])
  const [decisao, setDecisao] = useState<Record<string, Valores>>({})
  const [fundRecons, setFundRecons] = useState<Record<string, string>>({})
  const [reuniao, setReuniao] = useState<Valores>({})
  const [registro, setRegistro] = useState<Record<string, Valores>>({})
  const [conclusao, setConclusao] = useState<Valores>({})
  const [competitiva, setCompetitiva] = useState<Valores>({ criterio_julgamento: "MENOR_PRECO", modo_disputa: "ABERTO" })
  const [edital, setEdital] = useState<File | null>(null)

  useEffect(() => {
    if (!dados) return
    setCfg(dados.configuracao ?? { hipoteses: [], criterios_preselecao: [] })
    setMembros(
      (dados.comissao ?? []).map((c: any) => ({ usuario_id: c.usuario_id, nome: c.nome, vinculo: c.vinculo, papel: c.papel, termo_confidencialidade: !!c.termo_confidencialidade_em })),
    )
  }, [dados])
  useEffect(() => {
    authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/usuarios-elegiveis`)
      .then((r) => (r.ok ? r.json() : []))
      .then((u) => setUsuarios(Array.isArray(u) ? u : []))
      .catch(() => setUsuarios([]))
  }, [licitacaoId])

  const ato = async (chave: string, caminho: string, init: { method?: string; body?: any } = {}) => {
    const r = await executar(chave, caminho, init)
    if (r) onAtualizado?.()
    return r
  }

  if (carregando && !dados) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando o diálogo…</div>
  if (!dados) return <ErroPendencias erro={erro} />
  const fase: string = dados.licitacao.fase
  const interna = FASES_INTERNAS.includes(fase)
  const etapa: string = dados.etapa
  const criterios: Array<{ id: string; descricao: string }> = dados.configuracao?.criterios_preselecao ?? []
  const preSelecionados = (dados.participantes ?? []).filter((p: any) => p.situacao === "PRE_SELECIONADO")

  return (
    <Card>
      <CardHeader className="border-b bg-teal-50">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessagesSquare className="h-4 w-4" /> Diálogo competitivo — {ROTULO_ETAPA[etapa] ?? etapa}
        </CardTitle>
        <CardDescription>
          Lei 14.133/2021, art. 32. Sigilo: cada licitante vê só os próprios registros; nenhuma solução é revelada a outro sem consentimento (§1º IV).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <ErroPendencias erro={erro} />

        {interna ? (
          <section className="space-y-2">
            {dados.pendenciasEdital?.length > 0 && <p className="text-xs text-amber-700">{dados.pendenciasEdital.join(" · ")}</p>}
            <FormConfiguracaoDialogo valor={cfg} onChange={setCfg} />
            <Button size="sm" onClick={() => ato("cfg", `${base}/configuracao`, { method: "PUT", body: cfg })} disabled={!!executando}>Salvar edital do diálogo</Button>
          </section>
        ) : (
          <p className="text-sm text-slate-600">
            <b>Necessidades:</b> {dados.configuracao?.necessidades} · interessados: {dados.totais.interessados} · pré-selecionados: {dados.totais.preSelecionados}
          </p>
        )}

        {etapa !== "CONCLUIDO" && etapa !== "COMPETITIVA" && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Comissão de contratação (§1º XI; §2º)</h3>
            {membros.map((m, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                {m.vinculo === "ASSESSOR_CONTRATADO" ? (
                  <input className={`${classeInput} max-w-xs`} placeholder="Nome do assessor" value={m.nome ?? ""} onChange={(e) => setMembros(membros.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                ) : (
                  <select className={`${classeInput} max-w-xs`} value={m.usuario_id ?? ""} onChange={(e) => setMembros(membros.map((x, j) => (j === i ? { ...x, usuario_id: e.target.value } : x)))}>
                    <option value="">Servidor…</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                )}
                <select className={`${classeInput} max-w-[14rem]`} value={m.vinculo} onChange={(e) => setMembros(membros.map((x, j) => (j === i ? { ...x, vinculo: e.target.value } : x)))}>
                  <option value="EFETIVO">Servidor efetivo</option>
                  <option value="EMPREGADO_PERMANENTE">Empregado público permanente</option>
                  <option value="ASSESSOR_CONTRATADO">Assessor técnico contratado</option>
                </select>
                {m.vinculo === "ASSESSOR_CONTRATADO" && (
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={!!m.termo_confidencialidade} onChange={(e) => setMembros(membros.map((x, j) => (j === i ? { ...x, termo_confidencialidade: e.target.checked } : x)))} />
                    termo de confidencialidade assinado
                  </label>
                )}
                <button type="button" className="text-xs text-red-600" onClick={() => setMembros(membros.filter((_, j) => j !== i))}>remover</button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setMembros([...membros, { vinculo: "EFETIVO" }])}>+ membro</Button>
              <Button size="sm" variant="outline" onClick={() => ato("comissao", `${base}/comissao`, { method: "PUT", body: { membros } })} disabled={!!executando}>Salvar comissão</Button>
            </div>
            {dados.pendenciasComissao?.length > 0 && <p className="text-xs text-amber-700">{dados.pendenciasComissao.join(" · ")}</p>}
          </section>
        )}

        {!interna && (dados.participantes ?? []).length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Interessados e pré-seleção (§1º II)</h3>
            {dados.participantes.map((p: any) => {
              const d = decisao[p.id] ?? { criterios_atendidos: p.criteriosAtendidos ?? [] }
              return (
                <div key={p.id} className="space-y-1 rounded border p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.razaoSocial}</span>
                    <Badge variant="outline">{p.situacao}</Badge>
                  </div>
                  <p className="text-xs text-slate-600">{p.manifestacao}</p>
                  {p.temDocumento && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/manifestacao/${p.id}`)}>Documentos</Button>}
                  {p.reconsideracao && (
                    <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                      <p className="font-medium">
                        Pedido de reconsideração (art. 165, II) — {p.reconsideracao.status === "PENDENTE" ? `decidir até ${fmtDataHora(p.reconsideracao.prazoDecisao)}` : p.reconsideracao.status === "PROVIDA" ? "provido" : "não provido"}
                        {p.reconsideracao.decisaoAtrasada && <span className="ml-1 text-red-700">(prazo de decisão vencido)</span>}
                      </p>
                      <p>{p.reconsideracao.razoes}</p>
                      {p.reconsideracao.temArquivo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/reconsideracao/${p.id}`)}>Arquivo das razões</Button>}
                      {p.reconsideracao.status === "PENDENTE" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input className={`${classeInput} max-w-md`} placeholder="Fundamentação da decisão" value={fundRecons[p.id] ?? ""} onChange={(e) => setFundRecons({ ...fundRecons, [p.id]: e.target.value })} />
                          <Button size="sm" disabled={!!executando} onClick={() => ato(`rec-ok-${p.id}`, `${base}/participantes/${p.id}/reconsideracao/decisao`, { body: { provido: true, fundamentacao: fundRecons[p.id] ?? "" } })}>
                            Prover (admitir)
                          </Button>
                          <Button size="sm" variant="outline" disabled={!!executando} onClick={() => ato(`rec-no-${p.id}`, `${base}/participantes/${p.id}/reconsideracao/decisao`, { body: { provido: false, fundamentacao: fundRecons[p.id] ?? "" } })}>
                            Não prover
                          </Button>
                        </div>
                      ) : (
                        p.reconsideracao.fundamentacao && <p className="text-slate-600">Fundamentação: {p.reconsideracao.fundamentacao}</p>
                      )}
                    </div>
                  )}
                  {etapa === "PRE_SELECAO" && (
                    <div className="flex flex-wrap items-center gap-2">
                      {criterios.map((c) => (
                        <label key={c.id} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={(d.criterios_atendidos ?? []).includes(c.id)}
                            onChange={(e) =>
                              setDecisao({ ...decisao, [p.id]: { ...d, criterios_atendidos: e.target.checked ? [...(d.criterios_atendidos ?? []), c.id] : (d.criterios_atendidos ?? []).filter((x: string) => x !== c.id) } })
                            }
                          />
                          {c.descricao}
                        </label>
                      ))}
                      <input className={`${classeInput} max-w-xs`} placeholder="Motivo (se não selecionado)" value={d.motivo ?? ""} onChange={(e) => setDecisao({ ...decisao, [p.id]: { ...d, motivo: e.target.value } })} />
                      <Button size="sm" onClick={() => ato(`pre-${p.id}`, `${base}/participantes/${p.id}/pre-selecao`, { body: { ...d, decisao: "PRE_SELECIONADO" } })} disabled={!!executando}>Pré-selecionar</Button>
                      <Button size="sm" variant="outline" onClick={() => ato(`nao-${p.id}`, `${base}/participantes/${p.id}/pre-selecao`, { body: { ...d, decisao: "NAO_SELECIONADO" } })} disabled={!!executando}>Não selecionar</Button>
                    </div>
                  )}
                </div>
              )
            })}
            {etapa === "PRE_SELECAO" && (
              <>
                {dados.pendenciasInicioDialogo?.length > 0 && <p className="text-xs text-amber-700">{dados.pendenciasInicioDialogo.join(" · ")}</p>}
                <Button size="sm" onClick={() => ato("iniciar", `${base}/iniciar-dialogo`)} disabled={!!executando}>Iniciar a fase de diálogo</Button>
              </>
            )}
          </section>
        )}

        {["DIALOGO", "CONCLUIDO", "COMPETITIVA"].includes(etapa) && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Reuniões (§1º VI — ata e gravação)</h3>
            {(dados.reunioes ?? []).map((r: any) => {
              const p = dados.participantes.find((x: any) => x.id === r.participanteId)
              const reg = registro[r.id] ?? {}
              return (
                <div key={r.id} className="space-y-1 rounded border p-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>{fmtDataHora(r.agendadaPara)} · rodada {r.rodada} · {p?.razaoSocial}</span>
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-600">{r.pauta}</p>
                  {r.status === "REALIZADA" && (
                    <div className="flex gap-2">
                      {r.temAtaArquivo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/ata/${r.id}`)}>Ata</Button>}
                      {r.temGravacaoArquivo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/gravacao/${r.id}`)}>Gravação</Button>}
                      {r.gravacaoLink && <a className="text-xs text-blue-700" href={r.gravacaoLink} target="_blank" rel="noopener noreferrer">Gravação (link)</a>}
                    </div>
                  )}
                  {r.status === "AGENDADA" && etapa === "DIALOGO" && (
                    <div className="grid gap-2 md:grid-cols-2">
                      <textarea rows={2} className={classeInput} placeholder="Ata (texto)" value={reg.ata_texto ?? ""} onChange={(e) => setRegistro({ ...registro, [r.id]: { ...reg, ata_texto: e.target.value } })} />
                      <input className={classeInput} placeholder="Link da gravação (https://…)" value={reg.gravacao_link ?? ""} onChange={(e) => setRegistro({ ...registro, [r.id]: { ...reg, gravacao_link: e.target.value } })} />
                      <label className="text-xs">Ata (arquivo) <input type="file" onChange={(e) => setRegistro({ ...registro, [r.id]: { ...reg, ata: e.target.files?.[0] } })} /></label>
                      <label className="text-xs">Gravação (vídeo/áudio) <input type="file" accept="video/*,audio/*" onChange={(e) => setRegistro({ ...registro, [r.id]: { ...reg, gravacao: e.target.files?.[0] } })} /></label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!!executando}
                          onClick={() => {
                            const fd = new FormData()
                            if (reg.ata_texto) fd.append("ata_texto", reg.ata_texto)
                            if (reg.gravacao_link) fd.append("gravacao_link", reg.gravacao_link)
                            if (reg.ata) fd.append("ata", reg.ata)
                            if (reg.gravacao) fd.append("gravacao", reg.gravacao)
                            ato(`reg-${r.id}`, `${base}/reunioes/${r.id}/registro`, { body: fd })
                          }}
                        >
                          Registrar reunião
                        </Button>
                        <Button size="sm" variant="outline" disabled={!!executando} onClick={() => ato(`canc-${r.id}`, `${base}/reunioes/${r.id}/cancelar`, { body: { motivo: reg.ata_texto || "Reunião cancelada" } })}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {etapa === "DIALOGO" && (
              <div className="grid gap-2 rounded border border-dashed p-2 md:grid-cols-4">
                <select className={classeInput} value={reuniao.participanteId ?? ""} onChange={(e) => setReuniao({ ...reuniao, participanteId: e.target.value })}>
                  <option value="">Licitante pré-selecionado…</option>
                  {preSelecionados.map((p: any) => <option key={p.id} value={p.id}>{p.razaoSocial}</option>)}
                </select>
                <input type="datetime-local" className={classeInput} value={reuniao.quando ?? ""} onChange={(e) => setReuniao({ ...reuniao, quando: e.target.value })} />
                <input className={classeInput} placeholder="Pauta" value={reuniao.pauta ?? ""} onChange={(e) => setReuniao({ ...reuniao, pauta: e.target.value })} />
                <Button size="sm" disabled={!!executando} onClick={() => ato("agendar", `${base}/reunioes`, { body: { participanteId: reuniao.participanteId, agendada_para: inputLocalParaISO(reuniao.quando), pauta: reuniao.pauta, local_ou_link: reuniao.local } })}>
                  Agendar reunião
                </Button>
              </div>
            )}
            {(dados.documentos ?? []).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Soluções/documentos dos licitantes (sigilosos)</p>
                {dados.documentos.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>{dados.participantes.find((p: any) => p.id === d.participanteId)?.razaoSocial} — {d.titulo}{d.consentimentoDivulgacao ? " (divulgação consentida)" : ""}</span>
                    {d.temArquivo && <Button size="sm" variant="ghost" onClick={() => abrirArquivo(`${base}/arquivos/documento/${d.id}`)}>Abrir</Button>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {etapa === "DIALOGO" && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Concluir o diálogo (§1º V e VIII)</h3>
            <Campo rotulo="Solução identificada">
              <textarea rows={2} className={classeInput} value={conclusao.solucao_identificada ?? ""} onChange={(e) => setConclusao({ ...conclusao, solucao_identificada: e.target.value })} />
            </Campo>
            <Campo rotulo="Decisão fundamentada (juntada dos registros e gravações aos autos)">
              <textarea rows={3} className={classeInput} value={conclusao.motivacao ?? ""} onChange={(e) => setConclusao({ ...conclusao, motivacao: e.target.value })} />
            </Campo>
            <Button size="sm" onClick={() => ato("concluir", `${base}/concluir-dialogo`, { body: conclusao })} disabled={!!executando}>Concluir o diálogo</Button>
          </section>
        )}

        {etapa === "CONCLUIDO" && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Edital da fase competitiva (§1º VIII — mínimo de 60 dias úteis)</h3>
            <p className="text-xs text-slate-500">Data mínima hoje para o fim das propostas: {fmtDataHora(dados.prazos?.minimoFaseCompetitivaHoje)}</p>
            <div className="grid gap-2 md:grid-cols-2">
              <Campo rotulo="Especificação da solução">
                <textarea rows={2} className={classeInput} value={competitiva.especificacao_solucao ?? ""} onChange={(e) => setCompetitiva({ ...competitiva, especificacao_solucao: e.target.value })} />
              </Campo>
              <Campo rotulo="Critérios objetivos de seleção (§1º X)">
                <textarea rows={2} className={classeInput} value={competitiva.criterios_selecao ?? ""} onChange={(e) => setCompetitiva({ ...competitiva, criterios_selecao: e.target.value })} />
              </Campo>
              <Campo rotulo="Critério de julgamento">
                <select className={classeInput} value={competitiva.criterio_julgamento} onChange={(e) => setCompetitiva({ ...competitiva, criterio_julgamento: e.target.value })}>
                  <option value="MENOR_PRECO">Menor preço</option>
                  <option value="MAIOR_DESCONTO">Maior desconto</option>
                  <option value="MELHOR_TECNICA">Melhor técnica</option>
                  <option value="TECNICA_E_PRECO">Técnica e preço</option>
                  <option value="MAIOR_RETORNO_ECONOMICO">Maior retorno econômico</option>
                </select>
              </Campo>
              <Campo rotulo="Modo de disputa">
                <select className={classeInput} value={competitiva.modo_disputa} onChange={(e) => setCompetitiva({ ...competitiva, modo_disputa: e.target.value })}>
                  <option value="ABERTO">Aberto</option>
                  <option value="ABERTO_FECHADO">Aberto e fechado</option>
                  <option value="FECHADO_ABERTO">Fechado e aberto</option>
                  <option value="FECHADO">Fechado</option>
                </select>
              </Campo>
              <Campo rotulo="Início do recebimento">
                <input type="datetime-local" className={classeInput} value={competitiva.ini ?? ""} onChange={(e) => setCompetitiva({ ...competitiva, ini: e.target.value })} />
              </Campo>
              <Campo rotulo="Fim do recebimento / abertura da sessão">
                <input type="datetime-local" className={classeInput} value={competitiva.fim ?? ""} onChange={(e) => setCompetitiva({ ...competitiva, fim: e.target.value })} />
              </Campo>
              <Campo rotulo="Edital da fase competitiva (PDF)">
                <input type="file" accept="application/pdf" onChange={(e) => setEdital(e.target.files?.[0] ?? null)} />
              </Campo>
            </div>
            <Button
              size="sm"
              disabled={!!executando}
              onClick={() => {
                const fd = new FormData()
                for (const k of ["especificacao_solucao", "criterios_selecao", "criterio_julgamento", "modo_disputa"]) if (competitiva[k]) fd.append(k, competitiva[k])
                const ini = inputLocalParaISO(competitiva.ini)
                const fim = inputLocalParaISO(competitiva.fim)
                if (ini) fd.append("data_inicio_acolhimento", ini)
                if (fim) {
                  fd.append("data_fim_acolhimento", fim)
                  fd.append("data_abertura_sessao", fim)
                }
                if (edital) fd.append("edital", edital)
                ato("competitiva", `${base}/fase-competitiva`, { body: fd })
              }}
            >
              Publicar o edital da fase competitiva
            </Button>
          </section>
        )}
        {etapa === "COMPETITIVA" && (
          <p className="text-sm text-slate-600">
            Fase competitiva publicada em {fmtDataHora(dados.configuracao?.fase_competitiva_publicada_em)} — propostas só dos pré-selecionados; segue o rito da
            concorrência (sala, julgamento, habilitação, recursos, adjudicação, homologação e contrato).{" "}
            <button className="text-blue-700" onClick={() => abrirArquivo(`${base}/edital-fase-competitiva`)}>Edital da fase competitiva</button>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
