"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Download, Upload, Loader2, AlertTriangle, CheckCircle2, FileText, ExternalLink } from "lucide-react"

type Previa = {
  numero_edital_sugerido: number | null
  numero_edital_cadastro?: string | null
  ano: number
  processo: string
  orgao: string
  registro_precos: boolean
  ata_vigencia_meses: number | null
  entrega_local: string | null
  entrega_prazo: string | null
  garantia_produto: string | null
  total_itens: number
  total_lotes: number
  erros: string[]
  avisos: string[]
  pode_exportar: boolean
}
type PreviaImport = {
  arquivo: string; edital: number | null; ano: number | null
  fornecedores: { documento: string; razao_social: string; cidade: string; uf: string; micro_empresa: boolean; situacao: "EXISTENTE" | "NOVO"; razao_social_cadastro: string | null }[]
  vencedores: { item_id: string; numero_item: number; lote: number; descricao: string; quantidade: number; valor_unitario: number; valor_total: number; marca: string; fornecedor: string; documento: string; fornecedor_novo: boolean; acima_do_estimado: boolean; ja_adjudicado: boolean }[]
  itens_sem_vencedor: number[]; lances_nao_vencedores: number; erros: string[]; avisos: string[]; pode_aplicar: boolean
}
type Historico = { id: string; tipo: string; status: string; nome_arquivo: string; usuario_nome: string | null; created_at: string; resumo: any }

const fmtMoeda = (v?: number | null) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/**
 * Card "BLL Compras" do processo: gera o .IMP para o portal e importa o .EXP
 * com o resultado. A aplicação usa a mesma rota da seleção externa.
 */
export function BllIntegracao({ licitacaoId, homologado, onAtualizado }: { licitacaoId: string; homologado: boolean; onAtualizado: () => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [historico, setHistorico] = useState<Historico[]>([])
  const [form, setForm] = useState({ numero_edital: "", entrega_local: "", entrega_prazo: "", garantia_produto: "", ata_vigencia_meses: "" })
  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [previaImport, setPreviaImport] = useState<PreviaImport | null>(null)
  const [arquivoImport, setArquivoImport] = useState<File | null>(null)
  const [mostrarExport, setMostrarExport] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/bll/previa-exportacao`).then((r) => (r.ok ? r.json() : null)),
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/bll/historico`).then((r) => (r.ok ? r.json() : [])),
      ])
      if (p) {
        setPrevia(p)
        setForm({
          numero_edital: p.numero_edital_sugerido ? String(p.numero_edital_sugerido) : "",
          entrega_local: p.entrega_local || "", entrega_prazo: p.entrega_prazo || "",
          garantia_produto: p.garantia_produto || "", ata_vigencia_meses: p.ata_vigencia_meses ? String(p.ata_vigencia_meses) : "",
        })
      }
      setHistorico(Array.isArray(h) ? h : [])
    } catch { /* card fica em modo básico */ }
  }, [licitacaoId])
  useEffect(() => { carregar() }, [carregar])

  const exportar = async () => {
    setExportando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/bll/exportar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_edital: form.numero_edital || undefined,
          entrega_local: form.entrega_local, entrega_prazo: form.entrega_prazo, garantia_produto: form.garantia_produto,
          ata_vigencia_meses: form.ata_vigencia_meses ? Number(form.ata_vigencia_meses) : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        const lista = err?.message?.erros || err?.erros
        throw new Error(lista ? lista.join("\n") : err?.message?.message || err?.message || `HTTP ${res.status}`)
      }
      const nome = decodeURIComponent((res.headers.get("Content-Disposition") || "").match(/filename=([^;]+)/)?.[1] || `edital-${form.numero_edital}.imp`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = nome; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      const avisos = res.headers.get("X-Avisos")
      if (avisos) { try { const l = JSON.parse(decodeURIComponent(avisos)); if (l.length) alert(`Arquivo gerado com avisos:\n\n${l.join("\n")}`) } catch { /* sem avisos */ } }
      setMostrarExport(false)
      carregar()
    } catch (e: any) { alert(`Não foi possível gerar o arquivo:\n\n${e.message}`) } finally { setExportando(false) }
  }

  const enviarArquivo = async (file: File, aplicar: boolean) => {
    const fd = new FormData(); fd.append("file", file)
    const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/bll/importar?aplicar=${aplicar}`, { method: "POST", body: fd })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const lista = json?.message?.erros || json?.erros
      throw new Error(lista ? lista.join("\n") : json?.message?.message || json?.message || `HTTP ${res.status}`)
    }
    return json
  }

  const escolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ""
    if (!file) return
    setImportando(true)
    try {
      const r = await enviarArquivo(file, false)
      setArquivoImport(file); setPreviaImport(r.previa)
    } catch (err: any) { alert(`Não foi possível ler o arquivo:\n\n${err.message}`) } finally { setImportando(false) }
  }

  const aplicar = async () => {
    if (!arquivoImport || !previaImport) return
    if (!confirm(`Aplicar o resultado da BLL?\n\n${previaImport.vencedores.length} item(ns) serão adjudicados e ${previaImport.fornecedores.filter((f) => f.situacao === "NOVO").length} fornecedor(es) novo(s) cadastrado(s). Depois é só homologar para gerar o contrato.`)) return
    setAplicando(true)
    try {
      const r = await enviarArquivo(arquivoImport, true)
      setPreviaImport(null); setArquivoImport(null)
      if (r?.previa?.avisos?.length) alert(`Resultado aplicado.\n\nAvisos:\n${r.previa.avisos.join("\n")}`)
      onAtualizado(); carregar()
    } catch (err: any) { alert(`Não foi possível aplicar:\n\n${err.message}`) } finally { setAplicando(false) }
  }

  const baixar = (h: Historico) => window.open(`${API_URL}/api/licitacoes/${licitacaoId}/bll/historico/${h.id}/arquivo`, "_blank")

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ExternalLink className="w-4 h-4" /> Disputa na BLL Compras
          <span className="text-xs font-normal text-gray-500">troca de arquivos no leiaute oficial (serve também para Compras BR e VA Sistemas)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">1. Enviar o edital para o portal</div>
              {previa && <Badge variant="outline">{previa.total_lotes} lote(s) · {previa.total_itens} item(ns)</Badge>}
            </div>
            <p className="text-xs text-gray-500">Gera o arquivo <code>.IMP</code>. No portal: Processos → Cadastro de Processos → cadastre o pregão com os mesmos dados → botão Lotes → "importar lotes de arquivo".</p>
            {previa?.erros?.length ? (
              <ul className="text-xs text-red-700 list-disc pl-4">{previa.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
            ) : null}
            <Button size="sm" onClick={() => setMostrarExport(true)} disabled={!previa || !previa.pode_exportar}>
              <Download className="w-4 h-4 mr-2" />Gerar arquivo .IMP
            </Button>
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <div className="font-medium text-sm">2. Trazer o resultado do portal</div>
            <p className="text-xs text-gray-500">No portal, após a habilitação, use o botão Exportação do processo e salve o <code>.EXP</code>. Aqui você confere antes de aplicar: os vencedores entram por item e os fornecedores que faltam são cadastrados.</p>
            <input ref={inputRef} type="file" accept=".exp,.txt" className="hidden" onChange={escolherArquivo} />
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={importando || homologado}>
              {importando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}Importar resultado .EXP
            </Button>
            {homologado && <p className="text-xs text-gray-500">Processo homologado: o resultado não pode mais ser alterado.</p>}
          </div>
        </div>

        {historico.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Histórico de arquivos</div>
            <div className="divide-y rounded-lg border text-sm">
              {historico.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium">{h.tipo === "EXPORTACAO" ? "Edital exportado" : "Resultado importado"}</span>
                    <span className="text-gray-500"> · {new Date(h.created_at).toLocaleString("pt-BR")}{h.usuario_nome ? ` · ${h.usuario_nome}` : ""}</span>
                    <div className="text-xs text-gray-500 truncate">
                      {h.tipo === "EXPORTACAO" ? `Edital ${h.resumo?.edital}/${h.resumo?.ano} · ${h.resumo?.lotes} lote(s) · ${h.resumo?.itens} item(ns)` : `${h.resumo?.itens_adjudicados ?? 0} item(ns) adjudicado(s) · ${h.resumo?.fornecedores ?? 0} fornecedor(es)`}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => baixar(h)} title={h.nome_arquivo}><FileText className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Exportação: campos do leiaute */}
      <Dialog open={mostrarExport} onOpenChange={setMostrarExport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar arquivo para a BLL</DialogTitle>
            <DialogDescription>Estes campos vão no arquivo como o portal pede. Ficam salvos na licitação para a próxima vez.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Número do edital na BLL *</Label>
                <Input value={form.numero_edital} onChange={(e) => setForm({ ...form, numero_edital: e.target.value.replace(/\D/g, "") })} placeholder="Só números" />
                {previa?.numero_edital_cadastro && <p className="text-xs text-gray-500 mt-1">No cadastro: {previa.numero_edital_cadastro}</p>}
              </div>
              <div>
                <Label>Ano</Label>
                <Input value={previa?.ano ?? ""} disabled />
              </div>
            </div>
            <div><Label>Local de entrega</Label><Input value={form.entrega_local} onChange={(e) => setForm({ ...form, entrega_local: e.target.value })} placeholder="Ex.: Almoxarifado central, Rua X, 100" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prazo de entrega</Label><Input value={form.entrega_prazo} onChange={(e) => setForm({ ...form, entrega_prazo: e.target.value })} placeholder="Ex.: até 30 dias após a OF" /></div>
              {previa?.registro_precos && <div><Label>Vigência da ata (meses)</Label><Input type="number" min={1} value={form.ata_vigencia_meses} onChange={(e) => setForm({ ...form, ata_vigencia_meses: e.target.value })} /></div>}
            </div>
            <div><Label>Garantia</Label><Input value={form.garantia_produto} onChange={(e) => setForm({ ...form, garantia_produto: e.target.value })} placeholder="Ex.: 12 meses" /></div>
            {previa?.avisos?.length ? <ul className="text-xs text-amber-700 list-disc pl-4">{previa.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMostrarExport(false)}>Cancelar</Button>
            <Button onClick={exportar} disabled={exportando || !form.numero_edital}>{exportando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Gerar e baixar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Importação: prévia */}
      <Dialog open={!!previaImport} onOpenChange={(v) => { if (!v) { setPreviaImport(null); setArquivoImport(null) } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resultado da BLL · edital {previaImport?.edital}/{previaImport?.ano}</DialogTitle>
            <DialogDescription>Confira antes de aplicar. Nada foi gravado ainda.</DialogDescription>
          </DialogHeader>
          {previaImport && (
            <div className="space-y-4 text-sm">
              {previaImport.erros.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                  <div className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Pendências que impedem aplicar</div>
                  <ul className="list-disc pl-5 mt-1">{previaImport.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              {previaImport.avisos.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <div className="font-semibold">Avisos</div>
                  <ul className="list-disc pl-5 mt-1">{previaImport.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
              )}
              <div>
                <div className="font-semibold mb-1">Vencedores ({previaImport.vencedores.length})</div>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr><th className="px-2 py-1.5 text-left">Item</th><th className="px-2 py-1.5 text-left">Descrição</th><th className="px-2 py-1.5 text-left">Vencedor</th><th className="px-2 py-1.5 text-left">Marca</th><th className="px-2 py-1.5 text-right">Qtd</th><th className="px-2 py-1.5 text-right">Unitário</th><th className="px-2 py-1.5 text-right">Total</th></tr></thead>
                    <tbody>
                      {previaImport.vencedores.map((v) => (
                        <tr key={v.item_id} className={v.acima_do_estimado ? "bg-amber-50" : ""}>
                          <td className="px-2 py-1.5 whitespace-nowrap">{v.numero_item}{v.lote !== v.numero_item ? <span className="text-gray-400"> · lote {v.lote}</span> : null}</td>
                          <td className="px-2 py-1.5">{String(v.descricao || "").slice(0, 60)}</td>
                          <td className="px-2 py-1.5">{v.fornecedor}{v.fornecedor_novo && <Badge variant="outline" className="ml-1 text-[10px]">novo</Badge>}<div className="text-gray-400">{v.documento}</div></td>
                          <td className="px-2 py-1.5">{v.marca || "—"}</td>
                          <td className="px-2 py-1.5 text-right">{v.quantidade}</td>
                          <td className="px-2 py-1.5 text-right">{fmtMoeda(v.valor_unitario)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{fmtMoeda(v.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="bg-gray-50 font-semibold"><td colSpan={6} className="px-2 py-1.5 text-right">Total</td><td className="px-2 py-1.5 text-right">{fmtMoeda(previaImport.vencedores.reduce((s, v) => s + v.valor_total, 0))}</td></tr></tfoot>
                  </table>
                </div>
                {previaImport.itens_sem_vencedor.length > 0 && <p className="text-xs text-gray-500 mt-1">Sem vencedor no arquivo: itens {previaImport.itens_sem_vencedor.join(", ")}.</p>}
                {previaImport.lances_nao_vencedores > 0 && <p className="text-xs text-gray-500">{previaImport.lances_nao_vencedores} lance(s) não vencedor(es) ficam guardados no histórico para consulta.</p>}
              </div>
              <div>
                <div className="font-semibold mb-1">Fornecedores no arquivo ({previaImport.fornecedores.length})</div>
                <div className="rounded-lg border divide-y text-xs">
                  {previaImport.fornecedores.map((f) => (
                    <div key={f.documento} className="flex items-center justify-between px-2 py-1.5 gap-2">
                      <div><span className="font-medium">{f.razao_social}</span> <span className="text-gray-400">{f.documento}</span>{f.cidade ? <span className="text-gray-400"> · {f.cidade}/{f.uf}</span> : null}{f.micro_empresa ? <Badge variant="outline" className="ml-1 text-[10px]">ME/EPP</Badge> : null}</div>
                      <Badge className={f.situacao === "NOVO" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>{f.situacao === "NOVO" ? "será cadastrado" : "já cadastrado"}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviaImport(null); setArquivoImport(null) }}>Cancelar</Button>
            <Button onClick={aplicar} disabled={aplicando || !previaImport?.pode_aplicar}>{aplicando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}Aplicar resultado</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
