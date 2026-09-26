"use client"

/**
 * CONFIGURAÇÕES › PAINEL PARA TV (só o administrador do órgão).
 *  - gerar link (com nome — uma TV por setor), copiar, revogar e gerar outro;
 *  - o link aparece UMA vez (no banco fica só o hash): se perder, revogue e gere outro;
 *  - prazo dos "contratos vencendo" (30/60/90/120 dias);
 *  - "Abrir pré-visualização" (os mesmos dados da TV, pelo seu login).
 * Fonte: /api/painel-tv-gestao.
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Copy, ExternalLink, Loader2, Pencil, Plus, Trash2, Tv } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { API_URL, authFetch } from "@/lib/api"
import { confirmarAcao } from "@/components/DialogoGlobal"

interface LinkTv {
  id: string
  nome: string
  ativo: boolean
  criado_por_nome: string | null
  created_at: string
  ultimo_acesso: string | null
  revogado_em: string | null
  revogado_por_nome: string | null
}

interface Gestao {
  janela_contratos_dias: number
  janelas_permitidas: number[]
  links: LinkTv[]
}

const BASE = `${API_URL}/api/painel-tv-gestao`

async function lerErro(r: Response): Promise<string> {
  const j = await r.json().catch(() => null)
  return j?.message ? (Array.isArray(j.message) ? j.message.join(" ") : j.message) : `HTTP ${r.status}`
}

const dataHora = (d: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

export function PainelTvConfig() {
  const [gestao, setGestao] = useState<Gestao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [semPermissao, setSemPermissao] = useState(false)
  const [nome, setNome] = useState("")
  const [gerando, setGerando] = useState(false)
  const [novo, setNovo] = useState<{ nome: string; url: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null)
  const [salvandoJanela, setSalvandoJanela] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await authFetch(BASE)
      if (r.status === 403) {
        setSemPermissao(true)
        return
      }
      if (!r.ok) throw new Error(await lerErro(r))
      setGestao(await r.json())
    } catch (e: any) {
      toast.error(`Não foi possível carregar o painel para TV: ${e?.message ?? e}`)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const gerar = async () => {
    setGerando(true)
    try {
      const r = await authFetch(`${BASE}/links`, { method: "POST", body: JSON.stringify({ nome }) })
      if (!r.ok) throw new Error(await lerErro(r))
      const j = await r.json()
      setNovo({ nome: j.nome, url: `${window.location.origin}${j.caminho}` })
      setCopiado(false)
      setNome("")
      await carregar()
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar o link")
    } finally {
      setGerando(false)
    }
  }

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success("Link copiado")
    } catch {
      toast.error("Não foi possível copiar — selecione o link e copie à mão")
    }
  }

  const revogar = async (l: LinkTv) => {
    const ok = await confirmarAcao({
      titulo: "Revogar o link?",
      mensagem: `A TV "${l.nome}" deixa de mostrar o painel na próxima atualização (até 1 minuto). Para voltar, gere um link novo.`,
      confirmarRotulo: "Revogar",
      destrutivo: true,
    })
    if (!ok) return
    const r = await authFetch(`${BASE}/links/${l.id}`, { method: "DELETE" })
    if (!r.ok) return toast.error(await lerErro(r))
    toast.success("Link revogado")
    await carregar()
  }

  const renomear = async () => {
    if (!editando) return
    const r = await authFetch(`${BASE}/links/${editando.id}`, { method: "PATCH", body: JSON.stringify({ nome: editando.nome }) })
    if (!r.ok) return toast.error(await lerErro(r))
    setEditando(null)
    await carregar()
  }

  const salvarJanela = async (dias: number) => {
    setSalvandoJanela(true)
    try {
      const r = await authFetch(`${BASE}/configuracao`, { method: "PUT", body: JSON.stringify({ janela_contratos_dias: dias }) })
      if (!r.ok) throw new Error(await lerErro(r))
      setGestao((g) => (g ? { ...g, janela_contratos_dias: dias } : g))
      toast.success(`Contratos vencendo: próximos ${dias} dias`)
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar")
    } finally {
      setSalvandoJanela(false)
    }
  }

  if (carregando && !gestao) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  if (semPermissao) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Só o administrador do órgão gerencia o painel para TV.</CardContent>
      </Card>
    )
  }

  const ativos = gestao?.links.filter((l) => l.ativo) ?? []
  const revogados = gestao?.links.filter((l) => !l.ativo) ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="h-5 w-5" /> Painel para TV
          </CardTitle>
          <CardDescription>
            Quadro do setor de licitação para uma TV na sala: processos por etapa (com quem está, dias na etapa e atraso), sessões,
            publicações e contratos que vão vencer. Só leitura, sem login, atualiza sozinho a cada minuto. Não mostra valores de
            processos, propostas, textos de pareceres nem dados pessoais (CPF, e-mail, telefone).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5 flex-1 min-w-[16rem]">
              <Label htmlFor="nome-tv">Nome da TV</Label>
              <Input id="nome-tv" placeholder='Ex.: "TV da sala de licitações"' value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
            </div>
            <Button onClick={gerar} disabled={gerando || nome.trim().length < 3} className="gap-1.5">
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Gerar link
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => window.open("/painel-tv/previa", "_blank", "noopener")}>
              <ExternalLink className="h-4 w-4" /> Abrir pré-visualização
            </Button>
          </div>

          {novo && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 space-y-2 dark:bg-emerald-950/30">
              <p className="text-sm font-medium">
                Link da TV &ldquo;{novo.nome}&rdquo; — copie agora. Por segurança ele <strong>não é mostrado de novo</strong>; se perder, revogue e gere outro.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={novo.url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" className="gap-1.5 shrink-0" onClick={() => copiar(novo.url)}>
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
                <Button variant="ghost" className="shrink-0" onClick={() => setNovo(null)}>Fechar</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Na TV: abra o link no navegador (Smart TV, Chromecast/Google TV ou mini-PC) e deixe em tela cheia. Quem tiver o link vê o
                painel — não publique em lugar aberto.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Links ativos ({ativos.length})</p>
            {ativos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum link ativo.</p>}
            {ativos.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
                {editando?.id === l.id ? (
                  <>
                    <Input className="max-w-xs h-8" value={editando.nome} maxLength={80} onChange={(e) => setEditando({ id: l.id, nome: e.target.value })} />
                    <Button size="sm" onClick={renomear} disabled={editando.nome.trim().length < 3}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{l.nome}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Renomear" onClick={() => setEditando({ id: l.id, nome: l.nome })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <span className="text-xs text-muted-foreground">
                  criado em {dataHora(l.created_at)}
                  {l.criado_por_nome ? ` por ${l.criado_por_nome}` : ""} · último acesso: {l.ultimo_acesso ? dataHora(l.ultimo_acesso) : "nunca"}
                </span>
                <Button size="sm" variant="outline" className="ml-auto gap-1.5 text-red-600 hover:text-red-700" onClick={() => revogar(l)}>
                  <Trash2 className="h-3.5 w-3.5" /> Revogar
                </Button>
              </div>
            ))}
          </div>

          {revogados.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Links revogados ({revogados.length})</summary>
              <ul className="mt-2 space-y-1">
                {revogados.map((l) => (
                  <li key={l.id} className="text-muted-foreground">
                    {l.nome} — revogado em {dataHora(l.revogado_em)}
                    {l.revogado_por_nome ? ` por ${l.revogado_por_nome}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contratos vencendo</CardTitle>
          <CardDescription>Contratos vigentes cujo fim da vigência cai dentro deste prazo aparecem na página de contratos da TV.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(gestao?.janelas_permitidas ?? [30, 60, 90, 120]).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={gestao?.janela_contratos_dias === d ? "default" : "outline"}
              disabled={salvandoJanela}
              onClick={() => salvarJanela(d)}
            >
              {d} dias
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
