"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfigSiga, obterConfigSiga, salvarConfigSiga } from "@/services/siga.service"

/**
 * Códigos do órgão no SIGA (TCM-BA). Compartilhado pelas telas de Patrimônio
 * e Frota; `onChange` avisa a tela quando a configuração muda.
 */
export default function ConfiguracaoSiga({ onChange }: { onChange?: (c: ConfigSiga) => void }) {
  const [config, setConfig] = useState<ConfigSiga | null>(null)
  const [form, setForm] = useState({ codigo_unidade: "", codigo_orgao: "", codigo_unidade_orcamentaria: "", data_inicio: "" })
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)

  const aplicar = (c: ConfigSiga) => {
    setConfig(c)
    setForm({
      codigo_unidade: c.codigo_unidade || "",
      codigo_orgao: c.codigo_orgao || "",
      codigo_unidade_orcamentaria: c.codigo_unidade_orcamentaria || "",
      data_inicio: c.data_inicio || "",
    })
    onChange?.(c)
  }

  useEffect(() => {
    obterConfigSiga().then(aplicar).catch((e) => setMensagem({ tipo: "erro", texto: e.message }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function salvar() {
    setSalvando(true)
    setMensagem(null)
    try {
      aplicar(await salvarConfigSiga(form))
      setMensagem({ tipo: "ok", texto: "Configuração salva." })
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao salvar." })
    } finally {
      setSalvando(false)
    }
  }

  const campo = (id: keyof typeof form, rotulo: string, ajuda: string, tipo = "text") => (
    <div className="space-y-1">
      <Label htmlFor={`siga-${id}`}>{rotulo}</Label>
      <Input
        id={`siga-${id}`}
        type={tipo}
        inputMode={tipo === "text" ? "numeric" : undefined}
        maxLength={tipo === "text" ? 4 : undefined}
        value={form[id]}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
      />
      <p className="text-xs text-muted-foreground">{ajuda}</p>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuração do SIGA (TCM-BA)</CardTitle>
        <CardDescription>
          Códigos do órgão usados nos arquivos de importação. Confira com a contabilidade ou na tela de cadastro do SIGA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {campo("codigo_unidade", "Código da unidade gestora", "cd_Unidade — código do órgão no SIGA")}
          {campo("codigo_orgao", "Código do órgão", "Do orçamento (cd_Órgão)")}
          {campo("codigo_unidade_orcamentaria", "Unidade orçamentária", "Do orçamento (cd_UnidadeOrcamentaria)")}
          {campo("data_inicio", "Início no SIGA (opcional)", "Bens adquiridos antes vão como “Anterior SIGA”", "date")}
        </div>
        {config && config.pendencias.length > 0 && (
          <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-900">
            Falta preencher: {config.pendencias.join(", ")}. Sem isso o arquivo não é gerado.
          </p>
        )}
        {mensagem && (
          <p role="status" className={mensagem.tipo === "ok" ? "text-sm text-green-700" : "text-sm text-red-700"}>
            {mensagem.texto}
          </p>
        )}
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar configuração"}
        </Button>
      </CardContent>
    </Card>
  )
}
