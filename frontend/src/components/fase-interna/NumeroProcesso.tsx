"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Hash, Loader2, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { API_URL, authFetch } from "@/lib/api"

/**
 * Nº do PROCESSO ADMINISTRATIVO (licitacoes.numero_processo) — um só gerador,
 * no servidor, sequencial por órgão e ano (formato da configuração do órgão).
 * Não confundir com o nº da dispensa/licitação (numero_edital).
 */

interface ConfiguracaoNumeracao {
  mascara: string
  mascara_padrao: string
  personalizada: boolean
  ano: number
  proximo: string
}

async function lerConfiguracao(mascara?: string): Promise<{ ok: true; cfg: ConfiguracaoNumeracao } | { ok: false; erro: string }> {
  const q = mascara !== undefined ? `?mascara=${encodeURIComponent(mascara)}` : ""
  const r = await authFetch(`${API_URL}/api/numero-processo/configuracao${q}`)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, erro: corpo?.message || "Não foi possível carregar a numeração" }
  return { ok: true, cfg: corpo as ConfiguracaoNumeracao }
}

/**
 * Campo do assistente "Novo processo": opcional. Em branco, o sistema gera o
 * próximo número do órgão (mostra a prévia); preenchido (o órgão já tem um,
 * do protocolo/papel), confere se está livre no órgão.
 */
export function CampoNumeroProcesso({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [proximo, setProximo] = useState<string | null>(null)
  const [situacao, setSituacao] = useState<"livre" | "ocupado" | "conferindo" | null>(null)

  useEffect(() => {
    lerConfiguracao().then((r) => r.ok && setProximo(r.cfg.proximo)).catch(() => undefined)
  }, [])

  const conferir = async () => {
    const n = value.trim()
    if (!n) return setSituacao(null)
    setSituacao("conferindo")
    try {
      const r = await authFetch(`${API_URL}/api/numero-processo/disponivel?numero=${encodeURIComponent(n)}`)
      const d = await r.json()
      setSituacao(r.ok ? (d.disponivel ? "livre" : "ocupado") : null)
    } catch {
      setSituacao(null)
    }
  }

  return (
    <div>
      <Label htmlFor="numero-processo-administrativo" className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
        Processo administrativo nº <span className="font-normal text-gray-400">(opcional)</span>
      </Label>
      <Input
        id="numero-processo-administrativo"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setSituacao(null)
        }}
        onBlur={conferir}
        maxLength={60}
        placeholder={proximo ? `Em branco: o sistema gera ${proximo}` : "Em branco: o sistema gera o próximo número"}
        aria-describedby="numero-processo-ajuda"
      />
      <p id="numero-processo-ajuda" className="mt-1 text-[10px] text-gray-400">
        Preencha só se o órgão já tem o número (protocolo/papel). Não é o nº da dispensa/licitação.
      </p>
      {situacao === "conferindo" && (
        <p className="mt-1 text-[11px] text-gray-500 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Conferindo…
        </p>
      )}
      {situacao === "ocupado" && (
        <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1" role="alert">
          <AlertCircle className="w-3 h-3" /> Já existe um processo administrativo nº {value.trim()} neste órgão.
        </p>
      )}
      {situacao === "livre" && (
        <p className="mt-1 text-[11px] text-green-700 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Número livre neste órgão.
        </p>
      )}
    </div>
  )
}

/**
 * Configurações › Parâmetros de licitação: formato (máscara) do nº do processo
 * gerado pelo sistema, com a prévia do próximo número.
 */
export function NumeracaoProcessoConfig() {
  const [cfg, setCfg] = useState<ConfiguracaoNumeracao | null>(null)
  const [mascara, setMascara] = useState("")
  const [previa, setPrevia] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregar = useCallback(async () => {
    const r = await lerConfiguracao()
    if (r.ok) {
      setCfg(r.cfg)
      setMascara(r.cfg.mascara)
      setPrevia(r.cfg.proximo)
      setErro(null)
    } else setErro(r.erro)
  }, [])

  useEffect(() => {
    carregar().catch(() => setErro("Não foi possível carregar a numeração"))
  }, [carregar])

  // Prévia ao digitar (sem gravar)
  useEffect(() => {
    if (!cfg) return
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(async () => {
      const r = await lerConfiguracao(mascara).catch(() => null)
      if (!r) return
      if (r.ok) {
        setPrevia(r.cfg.proximo)
        setErro(null)
      } else {
        setPrevia(null)
        setErro(r.erro)
      }
    }, 400)
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    }
  }, [mascara, cfg])

  const salvar = async (valor: string) => {
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/numero-processo/configuracao`, { method: "PUT", body: JSON.stringify({ mascara: valor }) })
      const corpo = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(corpo?.message || "Erro ao salvar a numeração")
      setCfg(corpo)
      setMascara(corpo.mascara)
      setPrevia(corpo.proximo)
      toast.success("Numeração do processo salva")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a numeração")
    } finally {
      setSalvando(false)
    }
  }

  const alterada = !!cfg && mascara.trim() !== cfg.mascara

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Hash className="w-4 h-4 text-[#1351b4]" />
          Numeração do processo administrativo
        </CardTitle>
        <CardDescription className="text-xs">
          O sistema numera os processos do órgão em sequência, recomeçando a cada ano. O órgão também pode digitar o número ao criar
          o processo (quando já tem um, do protocolo). Não é o nº da dispensa/licitação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!cfg && !erro ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div>
                <Label htmlFor="mascara-numero-processo" className="text-sm">Formato do número</Label>
                <Input
                  id="mascara-numero-processo"
                  value={mascara}
                  onChange={(e) => setMascara(e.target.value)}
                  maxLength={40}
                  className="mt-1 font-mono"
                  placeholder={cfg?.mascara_padrao ?? "{ano}/{seq:5}"}
                  aria-invalid={!!erro}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  <code>{"{ano}"}</code> ano (2026) · <code>{"{aa}"}</code> ano com 2 dígitos · <code>{"{seq}"}</code> sequencial ·{" "}
                  <code>{"{seq:5}"}</code> sequencial com 5 dígitos (zeros à esquerda). Padrão: <code>{cfg?.mascara_padrao ?? "{ano}/{seq:5}"}</code>
                </p>
              </div>
              <div>
                <Label className="text-sm">Próximo número</Label>
                <p className="mt-1 h-9 flex items-center px-3 rounded-md bg-gray-50 border text-sm font-mono text-gray-900" aria-live="polite">
                  {previa ?? "—"}
                </p>
                {erro && (
                  <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1" role="alert">
                    <AlertCircle className="w-3 h-3" /> {erro}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              {cfg?.personalizada && (
                <Button variant="outline" size="sm" className="gap-1.5" disabled={salvando} onClick={() => salvar("")}>
                  <RotateCcw className="w-4 h-4" /> Usar o padrão
                </Button>
              )}
              <Button
                size="sm"
                className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5"
                disabled={salvando || !alterada || !!erro}
                onClick={() => salvar(mascara)}
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar numeração
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
