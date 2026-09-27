"use client"

/**
 * FUNDAMENTO LEGAL NA CRIAÇÃO DO PROCESSO (homologação 26/09/2026): o
 * assistente gravava o art. 75, II sem mostrar nada ao agente. Agora o
 * enquadramento é um campo visível e alterável, com as opções da modalidade
 * vindas da fonte única do backend (`backend/src/licitacoes/fundamento-legal.ts`
 * via GET /parametros-licitacao/fundamentos-legais) — o mesmo endpoint de
 * "Editar processo › Classificação" e da entrada "feita fora".
 *
 * Pré-sugestão: o padrão da modalidade e da natureza (dispensa → art. 75, I
 * para obra/engenharia, II para o resto). O valor estimado é conferido com o
 * limite do exercício (GET /parametros-licitacao/limites-dispensa — tabela
 * por exercício com o decreto): acima do limite, aviso para rever o
 * enquadramento. O servidor confere de novo (fundamento × modalidade) ao gravar.
 */
import { useEffect, useState } from "react"
import { AlertTriangle, Info } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

export interface FundamentoOpcao {
  codigo: string
  referencia: string
  texto: string
  descricao: string
  inciso_limite: "I" | "II" | null
}

interface LimiteExercicio {
  exercicio: number
  valor: number
  ato_normativo: string
  provisorio: boolean
}

const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

/** Fundamentos da modalidade (e o padrão para a natureza) — fonte única do backend. */
export function useFundamentosLegais(modalidade?: string | null, tipoContratacao?: string | null) {
  // A resposta guarda a consulta que a gerou: trocar a modalidade não mostra as opções da anterior
  const chave = modalidade ? new URLSearchParams({ modalidade, tipo_contratacao: tipoContratacao || "" }).toString() : ""
  const [lido, setLido] = useState<{ chave: string; fundamentos: FundamentoOpcao[]; padrao: string | null } | null>(null)
  useEffect(() => {
    if (!chave) return
    let vivo = true
    authFetch(`${API_URL}/api/parametros-licitacao/fundamentos-legais?${chave}`)
      .then(async (r) => {
        if (!r.ok || !vivo) return
        const j = await r.json()
        if (vivo) setLido({ chave, fundamentos: j.fundamentos || [], padrao: j.padrao || null })
      })
      .catch(() => null)
    return () => {
      vivo = false
    }
  }, [chave])
  return lido && lido.chave === chave ? { fundamentos: lido.fundamentos, padrao: lido.padrao } : { fundamentos: [] as FundamentoOpcao[], padrao: null }
}

/** Limites do art. 75, I e II no exercício corrente (com o decreto). */
function useLimitesDispensa() {
  const [limites, setLimites] = useState<{ I: LimiteExercicio | null; II: LimiteExercicio | null } | null>(null)
  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/parametros-licitacao/limites-dispensa`)
      .then(async (r) => (r.ok && vivo ? setLimites(await r.json()) : null))
      .catch(() => null)
    return () => {
      vivo = false
    }
  }, [])
  return limites
}

/**
 * Aviso do limite da dispensa por valor (art. 75, I/II) para o fundamento
 * escolhido e o valor estimado. Nada quando o fundamento não tem limite de valor.
 */
export function AvisoLimiteFundamento({
  modalidade,
  tipoContratacao,
  fundamento,
  valor,
}: {
  modalidade?: string | null
  tipoContratacao?: string | null
  /** Código escolhido (vazio = o padrão da modalidade). */
  fundamento?: string | null
  valor?: number | null
}) {
  const { fundamentos, padrao } = useFundamentosLegais(modalidade, tipoContratacao)
  return <AvisoDoInciso efetivo={fundamentos.find((f) => f.codigo === (fundamento || padrao))} valor={valor} />
}

function AvisoDoInciso({ efetivo, valor }: { efetivo?: FundamentoOpcao; valor?: number | null }) {
  const limites = useLimitesDispensa()
  const inciso = efetivo?.inciso_limite
  const limite = inciso && limites ? limites[inciso] : null
  if (!efetivo || !inciso || !limite) return null
  const v = Number(valor) || 0
  const acima = v > limite.valor
  const pct = v > 0 ? Math.floor((v / limite.valor) * 1000) / 10 : null
  return (
    <p
      role={acima ? "alert" : undefined}
      className={`mt-1.5 flex items-start gap-1.5 text-[11px] ${acima ? "text-red-800" : pct !== null && pct > 80 ? "text-amber-800" : "text-gray-600"}`}
    >
      {acima ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" /> : <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />}
      <span>
        Limite do {efetivo.referencia} em {limite.exercicio}: <b>{moeda(limite.valor)}</b> ({limite.ato_normativo}
        {limite.provisorio ? ", provisório — decreto do ano ainda não cadastrado" : ""}).
        {pct !== null && ` Valor estimado ${moeda(v)} = ${pct.toLocaleString("pt-BR")}% do limite (sem somar outras dispensas do mesmo ramo no ano).`}
        {acima && " Acima do limite: este inciso não cabe — reveja o enquadramento (outro inciso do art. 75 ou licitação)."}
      </span>
    </p>
  )
}

/**
 * Select "Fundamento legal" com as opções da modalidade. `value` vazio = o
 * padrão (mostrado já selecionado, para o agente ver o que será gravado).
 */
export function CampoFundamentoLegal({
  modalidade,
  tipoContratacao,
  value,
  onChange,
  valor,
  id = "fundamento-legal",
}: {
  /** Código da modalidade (ex.: DISPENSA_ELETRONICA). */
  modalidade?: string | null
  /** Código do tipo de contratação (COMPRA, SERVICO, OBRA...). */
  tipoContratacao?: string | null
  value?: string | null
  onChange: (codigo: string) => void
  /** Valor estimado (para conferir o limite do art. 75, I/II). */
  valor?: number | null
  id?: string
}) {
  const { fundamentos, padrao } = useFundamentosLegais(modalidade, tipoContratacao)
  const atual = value || padrao || ""
  const escolhido = fundamentos.find((f) => f.codigo === atual)
  const unico = fundamentos.length <= 1
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-semibold text-gray-700 mb-1.5 block">
        Fundamento legal *
      </Label>
      <Select value={atual} onValueChange={onChange} disabled={!modalidade || unico}>
        <SelectTrigger id={id} aria-label="Fundamento legal" className="w-full">
          <SelectValue placeholder={modalidade ? "Selecione o fundamento legal" : "Escolha a modalidade primeiro"} />
        </SelectTrigger>
        <SelectContent>
          {fundamentos.map((f) => (
            <SelectItem key={f.codigo} value={f.codigo}>
              {f.referencia} — {f.descricao}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-[10px] text-gray-500">
        {unico
          ? "Definido pela modalidade (Lei 14.133/2021)."
          : `Sugerido pela modalidade e pela natureza do objeto${!value && padrao ? " (padrão)" : ""} — confira e troque se for outra hipótese. Vai para o PNCP (amparo legal), as peças e o limite da dispensa.`}
        {escolhido && !unico ? ` Texto nas peças: "${escolhido.texto}".` : ""}
      </p>
      <AvisoDoInciso efetivo={escolhido} valor={valor} />
    </div>
  )
}
