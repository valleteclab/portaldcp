"use client"

/**
 * PLANEJAMENTO NO MODELO DE FLUXO (antes do processo) — Configurações › Fluxo.
 * Quem aprova a demanda (pedido do setor), quem monta o DFD consolidado e
 * abre o processo (unidade de planejamento) e a 2ª aprovação do DFD
 * (desligada por padrão). Nada hardcoded: vem de
 * /api/fluxo-fase-interna/planejamento.
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { API_URL, authFetch } from "@/lib/api"

type TipoRegra = "PERMISSAO" | "PAPEL" | "SETOR" | "USUARIO"
interface Regra {
  tipo: TipoRegra
  valor: string | null
}
interface Planejamento {
  aprovador_demanda: Regra
  responsavel_dfd: Regra
  aprovacao_dfd: { exigida: boolean; aprovador: Regra }
}
interface TelaPlanejamento {
  proprio: boolean
  planejamento: Planejamento & { versao: number }
  rotulos: { aprovador_demanda: string; responsavel_dfd: string; aprovador_dfd: string }
  erros: Array<{ campo: string; mensagem: string }>
  papeis: Array<{ codigo: string; rotulo: string }>
  setores: Array<{ id: string; nome: string }>
  usuarios: Array<{ id: string; nome: string }>
}

async function lerErro(r: Response): Promise<string> {
  const j = await r.json().catch(() => null)
  return j?.message ? (Array.isArray(j.message) ? j.message.join(" ") : j.message) : `HTTP ${r.status}`
}

function EditorRegra({
  id,
  rotulo,
  regra,
  uso,
  tela,
  desabilitado,
  onChange,
}: {
  id: string
  rotulo: string
  regra: Regra
  uso: "APROVAR" | "MONTAR"
  tela: TelaPlanejamento
  desabilitado: boolean
  onChange: (r: Regra) => void
}) {
  const opcoes = regra.tipo === "PAPEL" ? tela.papeis.map((p) => ({ v: p.codigo, r: p.rotulo })) : regra.tipo === "SETOR" ? tela.setores.map((s) => ({ v: s.id, r: s.nome })) : regra.tipo === "USUARIO" ? tela.usuarios.map((u) => ({ v: u.id, r: u.nome })) : []
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr_1fr] gap-2 items-center">
      <label htmlFor={`${id}-tipo`} className="text-sm font-medium text-slate-700">{rotulo}</label>
      <select
        id={`${id}-tipo`}
        className="border rounded-md h-9 px-2 bg-white text-sm"
        value={regra.tipo}
        disabled={desabilitado}
        onChange={(e) => onChange({ tipo: e.target.value as TipoRegra, valor: null })}
      >
        <option value="PERMISSAO">{uso === "APROVAR" ? 'Quem tem "aprovar demandas"' : "Só o administrador do órgão"}</option>
        <option value="PAPEL">Papel</option>
        <option value="SETOR">Setor</option>
        <option value="USUARIO">Pessoa</option>
      </select>
      {regra.tipo !== "PERMISSAO" ? (
        <select
          aria-label={`${rotulo}: qual`}
          className="border rounded-md h-9 px-2 bg-white text-sm"
          value={regra.valor ?? ""}
          disabled={desabilitado}
          onChange={(e) => onChange({ ...regra, valor: e.target.value || null })}
        >
          <option value="">Escolha…</option>
          {opcoes.map((o) => (
            <option key={o.v} value={o.v}>{o.r}</option>
          ))}
        </select>
      ) : (
        <span className="text-xs text-slate-500">{uso === "MONTAR" ? "O login do órgão também pode." : "O login do órgão também pode."}</span>
      )}
    </div>
  )
}

export function PlanejamentoFluxoCard({ admin }: { admin: boolean }) {
  const [tela, setTela] = useState<TelaPlanejamento | null>(null)
  const [p, setP] = useState<Planejamento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [retorno, setRetorno] = useState<string | null>(null)

  const aplicar = useCallback((t: TelaPlanejamento) => {
    setTela(t)
    setP({ aprovador_demanda: t.planejamento.aprovador_demanda, responsavel_dfd: t.planejamento.responsavel_dfd, aprovacao_dfd: t.planejamento.aprovacao_dfd })
  }, [])

  useEffect(() => {
    authFetch(`${API_URL}/api/fluxo-fase-interna/planejamento`)
      .then(async (r) => (r.ok ? aplicar(await r.json()) : toast.error(`Planejamento: ${await lerErro(r)}`)))
      .catch(() => toast.error("Planejamento: não foi possível carregar."))
  }, [aplicar])

  if (!tela || !p) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" aria-label="Carregando" />
        </CardContent>
      </Card>
    )
  }

  const salvar = async () => {
    setSalvando(true)
    setRetorno(null)
    try {
      const r = await authFetch(`${API_URL}/api/fluxo-fase-interna/planejamento`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })
      if (!r.ok) throw new Error(await lerErro(r))
      const t: TelaPlanejamento = await r.json()
      aplicar(t)
      const texto = `Salvo às ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })} (versão ${t.planejamento.versao}).`
      setRetorno(texto)
      toast.success(`Demandas e DFD: ${texto}`)
    } catch (e) {
      toast.error(`Não foi salvo: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSalvando(false)
    }
  }
  const restaurar = async () => {
    if (!confirm("Voltar ao padrão do sistema (aprovação por \"aprovar demandas\", DFD pelo papel Planejamento e 2ª aprovação desligada)?")) return
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fluxo-fase-interna/planejamento/restaurar`, { method: "POST" })
      if (!r.ok) throw new Error(await lerErro(r))
      aplicar(await r.json())
      toast.success("Padrão restaurado.")
    } catch (e) {
      toast.error(`Não foi restaurado: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Antes do processo: demandas e DFD</CardTitle>
        <CardDescription>
          Qualquer setor cria a sua demanda (o pedido). Quem aprova as demandas faz isso na Central de Aprovações. A unidade de planejamento junta os
          pedidos parecidos num DFD consolidado (Lei 14.133, art. 12, VII) e abre o processo. A 2ª aprovação (do DFD) é opcional.
          {tela.proprio ? " · configuração própria do órgão" : " · padrão do sistema"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <EditorRegra id="aprov-demanda" rotulo="Quem aprova a demanda" regra={p.aprovador_demanda} uso="APROVAR" tela={tela} desabilitado={!admin} onChange={(r) => setP({ ...p, aprovador_demanda: r })} />
        <EditorRegra id="resp-dfd" rotulo="Quem monta o DFD e abre o processo" regra={p.responsavel_dfd} uso="MONTAR" tela={tela} desabilitado={!admin} onChange={(r) => setP({ ...p, responsavel_dfd: r })} />
        <p className="text-xs text-slate-500 sm:pl-[228px]">O administrador do órgão sempre pode montar o DFD. Dê o papel &quot;Planejamento&quot; às pessoas da unidade (Fase interna e tarefas › papéis).</p>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" className="h-4 w-4" checked={p.aprovacao_dfd.exigida} disabled={!admin} onChange={(e) => setP({ ...p, aprovacao_dfd: { ...p.aprovacao_dfd, exigida: e.target.checked } })} />
          Exigir a 2ª aprovação do DFD consolidado (o processo só abre depois dela)
        </label>
        {p.aprovacao_dfd.exigida && (
          <EditorRegra
            id="aprov-dfd"
            rotulo="Quem aprova o DFD"
            regra={p.aprovacao_dfd.aprovador}
            uso="APROVAR"
            tela={tela}
            desabilitado={!admin}
            onChange={(r) => setP({ ...p, aprovacao_dfd: { ...p.aprovacao_dfd, aprovador: r } })}
          />
        )}
        {tela.erros.length > 0 && (
          <ul className="text-sm text-red-800 list-disc pl-5">
            {tela.erros.map((e) => <li key={e.campo}>{e.mensagem}</li>)}
          </ul>
        )}
        {admin && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4 mr-1" aria-hidden="true" />}
              Salvar
            </Button>
            {tela.proprio && (
              <Button size="sm" variant="outline" onClick={restaurar} disabled={salvando}>
                <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" /> Restaurar padrão
              </Button>
            )}
            {retorno && <span role="status" className="text-sm text-green-800">{retorno}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
