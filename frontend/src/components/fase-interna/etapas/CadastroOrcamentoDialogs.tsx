"use client"

/**
 * CADASTRO RÁPIDO das tabelas orçamentárias do órgão (Entrega 3A): dotação
 * (classificação por exercício) e lei (LDO/LOA/PPA — tabela única). Usado
 * na tela da reserva, quando o órgão ainda não tem cadastro, e na tela de
 * Configurações › Orçamento. API: POST/PUT /api/orcamento/{dotacoes,leis}.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { erroDaApi } from "@/lib/fase-interna/telas"

export interface DotacaoTabela {
  id: string
  exercicio: number
  unidade_orcamentaria: string
  programa: string | null
  projeto_atividade: string
  elemento_despesa: string
  fonte_recurso: string
  saldo: number | string | null
  ativo?: boolean
}

export interface LeiTabela {
  id: string
  tipo: "LDO" | "LOA" | "PPA"
  numero: string
  exercicio: number
  exercicio_fim: number | null
  data_publicacao?: string | null
  ementa?: string | null
  ativo?: boolean
}

const anoAtual = () => Number(new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 4))

export function DotacaoDialog({
  aberto,
  inicial,
  exercicioSugerido,
  onFechar,
  onSalvo,
}: {
  aberto: boolean
  inicial?: DotacaoTabela | null
  exercicioSugerido?: number
  onFechar: () => void
  onSalvo: (d: DotacaoTabela) => void
}) {
  const vazio = { exercicio: String(exercicioSugerido ?? anoAtual()), unidade_orcamentaria: "", programa: "", projeto_atividade: "", elemento_despesa: "", fonte_recurso: "", saldo: "" }
  const [f, setF] = useState(vazio)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (!aberto) return
    setF(
      inicial
        ? {
            exercicio: String(inicial.exercicio),
            unidade_orcamentaria: inicial.unidade_orcamentaria,
            programa: inicial.programa ?? "",
            projeto_atividade: inicial.projeto_atividade,
            elemento_despesa: inicial.elemento_despesa,
            fonte_recurso: inicial.fonte_recurso,
            saldo: inicial.saldo === null || inicial.saldo === undefined ? "" : String(inicial.saldo),
          }
        : { ...vazio, exercicio: String(exercicioSugerido ?? anoAtual()) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, inicial, exercicioSugerido])

  const salvar = async () => {
    setSalvando(true)
    try {
      const corpo = {
        exercicio: Number(f.exercicio),
        unidade_orcamentaria: f.unidade_orcamentaria,
        programa: f.programa || null,
        projeto_atividade: f.projeto_atividade,
        elemento_despesa: f.elemento_despesa,
        fonte_recurso: f.fonte_recurso,
        saldo: f.saldo ? Number(f.saldo.replace(/\./g, "").replace(",", ".")) : null,
      }
      const r = await authFetch(`${API_URL}/api/orcamento/dotacoes${inicial ? `/${inicial.id}` : ""}`, {
        method: inicial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success(inicial ? "Dotação atualizada" : "Dotação cadastrada")
      onSalvo(await r.json())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const campo = (k: keyof typeof f, rotulo: string, ph?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`dot-${k}`}>{rotulo}</Label>
      <Input id={`dot-${k}`} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  )

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar dotação" : "Cadastrar dotação"}</DialogTitle>
          <DialogDescription>Classificação da despesa no exercício (QDD). Código e nome em cada campo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("exercicio", "Exercício")}
          {campo("saldo", "Saldo disponível (opcional)", "0,00")}
          <div className="sm:col-span-2">{campo("unidade_orcamentaria", "Unidade orçamentária", "01.01.000 — Câmara Municipal")}</div>
          <div className="sm:col-span-2">{campo("programa", "Programa (opcional)", "0001 — Ação legislativa")}</div>
          <div className="sm:col-span-2">{campo("projeto_atividade", "Projeto/atividade", "1.31.101.2.029 — Gestão das ações da TV e Rádio")}</div>
          {campo("elemento_despesa", "Elemento de despesa", "3.3.90.40 — Serviços de TIC — PJ")}
          {campo("fonte_recurso", "Fonte de recurso", "500 — Recursos não vinculados")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LeiDialog({
  aberto,
  inicial,
  tipoSugerido,
  onFechar,
  onSalvo,
}: {
  aberto: boolean
  inicial?: LeiTabela | null
  tipoSugerido?: "LDO" | "LOA" | "PPA"
  onFechar: () => void
  onSalvo: (l: LeiTabela) => void
}) {
  const [f, setF] = useState({ tipo: "LDO", numero: "", exercicio: String(anoAtual()), exercicio_fim: "", data_publicacao: "", ementa: "" })
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (!aberto) return
    setF(
      inicial
        ? {
            tipo: inicial.tipo,
            numero: inicial.numero,
            exercicio: String(inicial.exercicio),
            exercicio_fim: inicial.exercicio_fim ? String(inicial.exercicio_fim) : "",
            data_publicacao: inicial.data_publicacao ?? "",
            ementa: inicial.ementa ?? "",
          }
        : { tipo: tipoSugerido ?? "LDO", numero: "", exercicio: String(anoAtual()), exercicio_fim: "", data_publicacao: "", ementa: "" },
    )
  }, [aberto, inicial, tipoSugerido])

  const salvar = async () => {
    setSalvando(true)
    try {
      const corpo = {
        tipo: f.tipo,
        numero: f.numero,
        exercicio: Number(f.exercicio),
        exercicio_fim: f.tipo === "PPA" && f.exercicio_fim ? Number(f.exercicio_fim) : null,
        data_publicacao: f.data_publicacao || null,
        ementa: f.ementa || null,
      }
      const r = await authFetch(`${API_URL}/api/orcamento/leis${inicial ? `/${inicial.id}` : ""}`, {
        method: inicial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success(inicial ? "Lei atualizada" : "Lei cadastrada")
      onSalvo(await r.json())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar lei" : "Cadastrar lei orçamentária"}</DialogTitle>
          <DialogDescription>Tabela única: despacho, informação orçamentária e parecer citam sempre o mesmo número.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="lei-tipo">Tipo</Label>
            <select id="lei-tipo" className="w-full h-9 rounded-md border px-3 text-sm bg-white" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="LDO">LDO — Diretrizes Orçamentárias</option>
              <option value="LOA">LOA — Orçamento Anual</option>
              <option value="PPA">PPA — Plano Plurianual</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lei-numero">Número</Label>
            <Input id="lei-numero" placeholder="1.234/2024" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lei-ex">{f.tipo === "PPA" ? "Primeiro ano" : "Exercício"}</Label>
            <Input id="lei-ex" inputMode="numeric" value={f.exercicio} onChange={(e) => setF({ ...f, exercicio: e.target.value })} />
          </div>
          {f.tipo === "PPA" ? (
            <div className="space-y-1">
              <Label htmlFor="lei-fim">Último ano</Label>
              <Input id="lei-fim" inputMode="numeric" value={f.exercicio_fim} onChange={(e) => setF({ ...f, exercicio_fim: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="lei-pub">Publicação (opcional)</Label>
              <Input id="lei-pub" type="date" value={f.data_publicacao} onChange={(e) => setF({ ...f, data_publicacao: e.target.value })} />
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="lei-ementa">Ementa (opcional)</Label>
            <Textarea id="lei-ementa" rows={2} value={f.ementa} onChange={(e) => setF({ ...f, ementa: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
