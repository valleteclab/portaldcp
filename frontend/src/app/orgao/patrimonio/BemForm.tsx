"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

export const TIPO_AQUISICAO_LABELS: Record<string, string> = {
  COMPRA: "Compra",
  DOACAO: "Doação",
  CESSAO: "Cessão",
  COMODATO: "Comodato",
  PERMUTA: "Permuta",
  PRODUCAO_PROPRIA: "Produção própria",
  OUTRO: "Outro",
}

const TIPO_BEM_LABELS: Record<string, string> = {
  BEM_PROPRIO: "Bem Próprio",
  BEM_LOCADO: "Bem Locado",
  BEM_SERVIDOR: "Bem de Servidor",
  BEM_COMODATO: "Bem em Comodato",
}

const ESTADO_LABELS: Record<string, string> = { BOM: "Bom", REGULAR: "Regular", RUIM: "Ruim", INSERVIVEL: "Inservível" }

/** Campos do formulário (todos como string para facilitar os inputs). */
export type BemFormValues = {
  plaqueta: string
  epc: string
  descricao: string
  categoria_id: string
  tipo: string
  quantidade: string
  estado_conservacao: string
  marca: string
  modelo: string
  numero_serie: string
  // Aquisição
  tipo_aquisicao: string
  licitacao_id: string
  contrato_id: string
  valor_aquisicao: string
  data_aquisicao: string
  nota_fiscal_numero: string
  fornecedor_nome: string
  processo_pagamento: string
  data_pagamento: string
  referencia_contabil: string
  // Contábil
  conta_contabil: string
  vida_util_anos: string
  valor_residual_pct: string
  // Localização e responsáveis
  setor_id: string
  localizacao_nome: string
  responsavel_nome: string
  responsavel_cargo: string
  corresponsavel_nome: string
  // Garantia e seguro
  garantia_ate: string
  seguro_seguradora: string
  seguro_apolice: string
  seguro_vigencia_inicio: string
  seguro_vigencia_fim: string
  seguro_valor: string
  // Outros
  observacoes: string
}

const CAMPOS_NUMERICOS: (keyof BemFormValues)[] = ["valor_aquisicao", "valor_residual_pct", "seguro_valor"]
const CAMPOS_INTEIROS: (keyof BemFormValues)[] = ["quantidade", "vida_util_anos"]
const CAMPOS_DATA: (keyof BemFormValues)[] = ["data_aquisicao", "data_pagamento", "garantia_ate", "seguro_vigencia_inicio", "seguro_vigencia_fim"]
/** Campos que nunca são enviados como null (obrigatórios ou com regra própria no backend). */
const CAMPOS_SEM_NULL: (keyof BemFormValues)[] = ["plaqueta", "descricao", "tipo", "quantidade"]

const str = (v: any) => (v === null || v === undefined ? "" : String(v))
const dataStr = (v: any) => (v ? String(v).slice(0, 10) : "")
const numStr = (v: any) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","))

/** Converte um bem vindo da API (ou vazio) nos valores do formulário. */
export function bemParaForm(bem?: any): BemFormValues {
  const b = bem || {}
  return {
    plaqueta: str(b.plaqueta),
    epc: str(b.epc),
    descricao: str(b.descricao),
    categoria_id: str(b.categoria_id || b.categoria?.id),
    tipo: str(b.tipo) || "BEM_PROPRIO",
    quantidade: b.quantidade != null ? String(b.quantidade) : "1",
    estado_conservacao: str(b.estado_conservacao),
    marca: str(b.marca),
    modelo: str(b.modelo),
    numero_serie: str(b.numero_serie),
    tipo_aquisicao: str(b.tipo_aquisicao),
    licitacao_id: str(b.licitacao_id || b.licitacao?.id),
    contrato_id: str(b.contrato_id || b.contrato?.id),
    valor_aquisicao: numStr(b.valor_aquisicao),
    data_aquisicao: dataStr(b.data_aquisicao),
    nota_fiscal_numero: str(b.nota_fiscal_numero),
    fornecedor_nome: str(b.fornecedor_nome),
    processo_pagamento: str(b.processo_pagamento),
    data_pagamento: dataStr(b.data_pagamento),
    referencia_contabil: str(b.referencia_contabil),
    conta_contabil: str(b.conta_contabil),
    vida_util_anos: b.vida_util_anos != null ? String(b.vida_util_anos) : "",
    valor_residual_pct: numStr(b.valor_residual_pct),
    setor_id: str(b.setor_id || b.setor?.id),
    localizacao_nome: str(b.localizacao_nome),
    responsavel_nome: str(b.responsavel_nome),
    responsavel_cargo: str(b.responsavel_cargo),
    corresponsavel_nome: str(b.corresponsavel_nome),
    garantia_ate: dataStr(b.garantia_ate),
    seguro_seguradora: str(b.seguro_seguradora),
    seguro_apolice: str(b.seguro_apolice),
    seguro_vigencia_inicio: dataStr(b.seguro_vigencia_inicio),
    seguro_vigencia_fim: dataStr(b.seguro_vigencia_fim),
    seguro_valor: numStr(b.seguro_valor),
    observacoes: str(b.observacoes),
  }
}

/** Aceita "1.234,56", "1234,56" e "1234.56". */
const parseDecimal = (v: string) => {
  const t = String(v).trim()
  return t.includes(",") ? parseFloat(t.replace(/\./g, "").replace(",", ".")) : parseFloat(t)
}

/**
 * Monta o payload para a API: remove campos vazios (modo criar) ou envia null
 * para limpar campos opcionais (modo editar) e converte números aceitando vírgula.
 */
export function formParaPayload(form: BemFormValues, modo: "criar" | "editar"): Record<string, any> {
  const data: Record<string, any> = {}
  for (const [k, raw] of Object.entries(form)) {
    const key = k as keyof BemFormValues
    const vazio = raw === "" || raw === null || raw === undefined
    if (vazio) {
      if (modo === "editar" && !CAMPOS_SEM_NULL.includes(key)) data[key] = null
      continue
    }
    if (CAMPOS_NUMERICOS.includes(key)) {
      const n = parseDecimal(raw)
      if (!Number.isNaN(n)) data[key] = n
    } else if (CAMPOS_INTEIROS.includes(key)) {
      const n = parseInt(String(raw), 10)
      if (!Number.isNaN(n)) data[key] = n
    } else if (CAMPOS_DATA.includes(key)) {
      data[key] = String(raw).slice(0, 10)
    } else {
      data[key] = typeof raw === "string" ? raw.trim() : raw
    }
  }
  if (modo === "criar" && !data.quantidade) data.quantidade = 1
  return data
}

type Opcao = { id: string; rotulo: string; detalhe?: string }

/** Select com um campo de busca simples acima da lista. */
function SelectComBusca({ value, onChange, opcoes, placeholder, carregando }: {
  value: string
  onChange: (v: string) => void
  opcoes: Opcao[]
  placeholder: string
  carregando?: boolean
}) {
  const [busca, setBusca] = useState("")
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = q ? opcoes.filter((o) => `${o.rotulo} ${o.detalhe || ""}`.toLowerCase().includes(q)) : opcoes
    // Garante que a opção selecionada continue na lista (senão o Select perde o rótulo).
    const sel = opcoes.find((o) => o.id === value)
    if (sel && !base.some((o) => o.id === sel.id)) return [sel, ...base.slice(0, 99)]
    return base.slice(0, 100)
  }, [busca, opcoes, value])

  return (
    <div className="space-y-1">
      <Input
        placeholder="Filtrar por número, fornecedor ou objeto..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="h-8 text-xs"
        disabled={carregando || opcoes.length === 0}
      />
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder={carregando ? "Carregando..." : placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Nenhum</SelectItem>
          {filtradas.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <span>{o.rotulo}</span>
              {o.detalhe && <span className="text-muted-foreground"> — {o.detalhe.length > 70 ? o.detalhe.slice(0, 70) + "…" : o.detalhe}</span>}
            </SelectItem>
          ))}
          {filtradas.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum resultado</div>}
        </SelectContent>
      </Select>
    </div>
  )
}

function getOrgaoId(): string {
  if (typeof window === "undefined") return ""
  try { return JSON.parse(localStorage.getItem("orgao") || "{}").id || "" } catch { return "" }
}

function useContratosLicitacoes() {
  const [contratos, setContratos] = useState<Opcao[]>([])
  const [licitacoes, setLicitacoes] = useState<Opcao[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    const orgaoId = getOrgaoId()
    const extrair = async (res: Response) => {
      if (!res.ok) return []
      const j = await res.json().catch(() => [])
      return Array.isArray(j) ? j : j?.data || []
    }
    Promise.all([
      authFetch(`${API_URL}/api/contratos?orgaoId=${orgaoId}&limit=500`).then(extrair).catch(() => []),
      authFetch(`${API_URL}/api/licitacoes?orgao_id=${orgaoId}&limit=500`).then(extrair).catch(() => []),
    ]).then(([cs, ls]) => {
      if (!ativo) return
      setContratos(cs.map((c: any) => ({
        id: c.id,
        rotulo: c.numero_contrato || c.numero || "Contrato sem número",
        detalhe: c.fornecedor_razao_social || c.fornecedor?.razao_social || c.objeto || undefined,
      })))
      setLicitacoes(ls.map((l: any) => ({
        id: l.id,
        rotulo: l.numero_processo || l.numero || "Processo sem número",
        detalhe: l.objeto || undefined,
      })))
    }).finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [])

  return { contratos, licitacoes, carregando }
}

/** Bloco com título; fica fora do formulário para não remontar os inputs a cada render. */
function Secao({ titulo, compacto, children }: { titulo: string; compacto?: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className={compacto ? "py-3" : undefined}>
        <CardTitle className={compacto ? "text-base" : undefined}>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

export type BemFormProps = {
  /** Valores iniciais (bem vindo da API ou vazio). */
  initial?: any
  categorias: any[]
  setores: { id: string; nome: string }[]
  onSubmit: (payload: Record<string, any>) => Promise<void>
  onCancel?: () => void
  modo: "criar" | "editar"
  submitLabel?: string
  sugestaoPlaqueta?: string
  /** Layout mais compacto (para diálogos): uma coluna de cards, sem títulos grandes. */
  compacto?: boolean
}

export default function BemForm({ initial, categorias, setores, onSubmit, onCancel, modo, submitLabel, sugestaoPlaqueta, compacto }: BemFormProps) {
  const [form, setForm] = useState<BemFormValues>(() => bemParaForm(initial))
  const [salvando, setSalvando] = useState(false)
  const { contratos, licitacoes, carregando } = useContratosLicitacoes()

  const set = (campo: keyof BemFormValues, valor: string) => setForm((f) => ({ ...f, [campo]: valor }))
  const categoriaSel = categorias.find((c: any) => c.id === form.categoria_id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      await onSubmit(formParaPayload(form, modo))
    } finally {
      setSalvando(false)
    }
  }

  const grid2 = "grid grid-cols-1 sm:grid-cols-2 gap-4"
  const grid3 = "grid grid-cols-1 sm:grid-cols-3 gap-4"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Secao titulo="Identificação" compacto={compacto}>
        <div className={grid2}>
          <div>
            <Label>Plaqueta</Label>
            <Input
              placeholder={sugestaoPlaqueta ? `Automática: ${sugestaoPlaqueta}` : "Código da plaqueta"}
              value={form.plaqueta}
              onChange={(e) => set("plaqueta", e.target.value)}
            />
            {modo === "criar" && <p className="text-xs text-muted-foreground mt-1">Vazio = o sistema numera. Informe só para manter uma numeração já existente.</p>}
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_BEM_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Descrição *</Label>
          <Input required placeholder="Descrição do bem" value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </div>

        <div className={grid3}>
          <div>
            <Label>Categoria</Label>
            <Select value={form.categoria_id || "__none__"} onValueChange={(v) => set("categoria_id", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem categoria</SelectItem>
                {categorias.map((cat: any) => <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={form.quantidade} onChange={(e) => set("quantidade", e.target.value)} />
          </div>
          <div>
            <Label>Estado de conservação</Label>
            <Select value={form.estado_conservacao || "__none__"} onValueChange={(v) => set("estado_conservacao", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não informado</SelectItem>
                {Object.entries(ESTADO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className={grid3}>
          <div>
            <Label>Marca</Label>
            <Input value={form.marca} onChange={(e) => set("marca", e.target.value)} />
          </div>
          <div>
            <Label>Modelo</Label>
            <Input value={form.modelo} onChange={(e) => set("modelo", e.target.value)} />
          </div>
          <div>
            <Label>Nº de série</Label>
            <Input value={form.numero_serie} onChange={(e) => set("numero_serie", e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Código RFID (EPC)</Label>
          <Input placeholder="Preenchido quando a etiqueta tiver chip RFID" value={form.epc} onChange={(e) => set("epc", e.target.value)} className="font-mono" />
        </div>
      </Secao>

      <Secao titulo="Aquisição" compacto={compacto}>
        <div className={grid3}>
          <div>
            <Label>Tipo de aquisição</Label>
            <Select value={form.tipo_aquisicao || "__none__"} onValueChange={(v) => set("tipo_aquisicao", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não informado</SelectItem>
                {Object.entries(TIPO_AQUISICAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Licitação / processo</Label>
            <SelectComBusca value={form.licitacao_id} onChange={(v) => set("licitacao_id", v)} opcoes={licitacoes} placeholder="Selecione o processo" carregando={carregando} />
          </div>
          <div>
            <Label>Contrato</Label>
            <SelectComBusca value={form.contrato_id} onChange={(v) => set("contrato_id", v)} opcoes={contratos} placeholder="Selecione o contrato" carregando={carregando} />
          </div>
        </div>

        <div className={grid3}>
          <div>
            <Label>Valor de aquisição (R$)</Label>
            <Input inputMode="decimal" placeholder="0,00" value={form.valor_aquisicao} onChange={(e) => set("valor_aquisicao", e.target.value)} />
          </div>
          <div>
            <Label>Data de aquisição</Label>
            <Input type="date" value={form.data_aquisicao} onChange={(e) => set("data_aquisicao", e.target.value)} />
          </div>
          <div>
            <Label>Nota fiscal</Label>
            <Input value={form.nota_fiscal_numero} onChange={(e) => set("nota_fiscal_numero", e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Fornecedor</Label>
          <Input value={form.fornecedor_nome} onChange={(e) => set("fornecedor_nome", e.target.value)} />
        </div>

        <div className={grid3}>
          <div>
            <Label>Processo de pagamento</Label>
            <Input placeholder="Nº do processo" value={form.processo_pagamento} onChange={(e) => set("processo_pagamento", e.target.value)} />
          </div>
          <div>
            <Label>Data de pagamento</Label>
            <Input type="date" value={form.data_pagamento} onChange={(e) => set("data_pagamento", e.target.value)} />
          </div>
          <div>
            <Label>Nº da despesa (contabilidade)</Label>
            <Input placeholder="Referência na contabilidade" value={form.referencia_contabil} onChange={(e) => set("referencia_contabil", e.target.value)} />
          </div>
        </div>
      </Secao>

      <Secao titulo="Contábil" compacto={compacto}>
        <p className="text-xs text-muted-foreground">
          Vazio = usa o da categoria{categoriaSel ? ` (${categoriaSel.nome}: ${categoriaSel.vida_util_anos ? `${categoriaSel.vida_util_anos} anos` : "vida útil não definida"}, residual ${categoriaSel.valor_residual_pct ?? 0}%${categoriaSel.conta_contabil ? `, conta ${categoriaSel.conta_contabil}` : ""})` : ""}. Preencha só quando este bem seguir parâmetros próprios.
        </p>
        <div className={grid3}>
          <div>
            <Label>Conta contábil</Label>
            <Input placeholder={categoriaSel?.conta_contabil || "Ex.: 1.2.3.1.1.01.01"} value={form.conta_contabil} onChange={(e) => set("conta_contabil", e.target.value)} className="font-mono" />
          </div>
          <div>
            <Label>Vida útil (anos)</Label>
            <Input type="number" min={1} step={1} placeholder={categoriaSel?.vida_util_anos ? String(categoriaSel.vida_util_anos) : ""} value={form.vida_util_anos} onChange={(e) => set("vida_util_anos", e.target.value)} />
          </div>
          <div>
            <Label>Valor residual (%)</Label>
            <Input inputMode="decimal" placeholder={categoriaSel?.valor_residual_pct != null ? String(categoriaSel.valor_residual_pct) : "Ex.: 10"} value={form.valor_residual_pct} onChange={(e) => set("valor_residual_pct", e.target.value)} />
          </div>
        </div>
      </Secao>

      <Secao titulo="Localização e responsáveis" compacto={compacto}>
        <div className={grid2}>
          <div>
            <Label>Setor {modo === "criar" ? "*" : ""}</Label>
            <Select value={form.setor_id || "__none__"} onValueChange={(v) => set("setor_id", v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={setores.length ? "Selecione o setor" : "Cadastre setores em Configurações"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem setor</SelectItem>
                {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">O inventário confere setor a setor: o bem só entra na lista do responsável se tiver setor.</p>
          </div>
          <div>
            <Label>Sala / localização (texto)</Label>
            <Input placeholder="Ex: Sala 12, 2º andar" value={form.localizacao_nome} onChange={(e) => set("localizacao_nome", e.target.value)} />
          </div>
        </div>
        <div className={grid3}>
          <div>
            <Label>Responsável</Label>
            <Input placeholder="Nome do responsável" value={form.responsavel_nome} onChange={(e) => set("responsavel_nome", e.target.value)} />
          </div>
          <div>
            <Label>Cargo do responsável</Label>
            <Input placeholder="Cargo" value={form.responsavel_cargo} onChange={(e) => set("responsavel_cargo", e.target.value)} />
          </div>
          <div>
            <Label>Corresponsável</Label>
            <Input placeholder="Nome do corresponsável" value={form.corresponsavel_nome} onChange={(e) => set("corresponsavel_nome", e.target.value)} />
          </div>
        </div>
      </Secao>

      <Secao titulo="Garantia e seguro" compacto={compacto}>
        <div className={grid3}>
          <div>
            <Label>Garantia até</Label>
            <Input type="date" value={form.garantia_ate} onChange={(e) => set("garantia_ate", e.target.value)} />
          </div>
          <div>
            <Label>Seguradora</Label>
            <Input value={form.seguro_seguradora} onChange={(e) => set("seguro_seguradora", e.target.value)} />
          </div>
          <div>
            <Label>Apólice</Label>
            <Input value={form.seguro_apolice} onChange={(e) => set("seguro_apolice", e.target.value)} />
          </div>
        </div>
        <div className={grid3}>
          <div>
            <Label>Vigência do seguro (início)</Label>
            <Input type="date" value={form.seguro_vigencia_inicio} onChange={(e) => set("seguro_vigencia_inicio", e.target.value)} />
          </div>
          <div>
            <Label>Vigência do seguro (fim)</Label>
            <Input type="date" value={form.seguro_vigencia_fim} onChange={(e) => set("seguro_vigencia_fim", e.target.value)} />
          </div>
          <div>
            <Label>Valor segurado (R$)</Label>
            <Input inputMode="decimal" placeholder="0,00" value={form.seguro_valor} onChange={(e) => set("seguro_valor", e.target.value)} />
          </div>
        </div>
      </Secao>

      <Secao titulo="Observações" compacto={compacto}>
        <Textarea placeholder="Observações adicionais" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
      </Secao>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : submitLabel || (modo === "criar" ? "Cadastrar Bem" : "Salvar alterações")}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={salvando}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
