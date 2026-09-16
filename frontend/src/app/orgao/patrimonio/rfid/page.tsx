"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Radio, CheckCircle2, AlertTriangle, RotateCcw, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { bemPorCodigo, atualizarBem } from "@/services/patrimonio.service"

type Bem = { id: string; plaqueta: string | null; descricao: string; epc: string | null; setor_nome: string | null }

/**
 * Associação de tags RFID no coletor (Chainway C66 com Keyboard Emulator):
 * 1) lê a plaqueta (QR, código de barras ou digita o número) → mostra o bem;
 * 2) lê a tag UHF → o EPC fica gravado no bem.
 * Para tags pré-gravadas com o número da plaqueta pelo fornecedor, este passo
 * não é necessário: a leitura já resolve o bem sozinha.
 */
export default function AssociarRfidPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [bem, setBem] = useState<Bem | null>(null)
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null)
  const [feitos, setFeitos] = useState<{ plaqueta: string | null; descricao: string; epc: string; substituiu: string | null }[]>([])
  const [ocupado, setOcupado] = useState(false)
  const ultimo = useRef<{ v: string; t: number }>({ v: "", t: 0 })

  useEffect(() => { inputRef.current?.focus() }, [])

  const processar = async (lido: string) => {
    const v = lido.trim()
    if (!v) return
    const agora = Date.now()
    if (ultimo.current.v === v.toUpperCase() && agora - ultimo.current.t < 2000) return
    ultimo.current = { v: v.toUpperCase(), t: agora }
    setOcupado(true)
    try {
      const r = await bemPorCodigo(v)
      const ehHexLongo = /^[0-9A-F]{16,64}$/i.test(v.replace(/\s+/g, ""))
      if (!bem) {
        // Passo 1: esperando a plaqueta
        if (r.bem) {
          setBem(r.bem)
          setMsg({ tipo: "info", texto: r.bem.epc ? `Bem já tem tag ${r.bem.epc}. Leia a nova tag para substituir, ou leia outra plaqueta.` : "Agora leia a tag RFID que vai neste bem." })
        } else {
          setMsg({ tipo: "erro", texto: ehHexLongo ? "Isso parece uma tag RFID. Leia primeiro a plaqueta do bem." : `Nenhum bem com o código ${v}.` })
        }
        return
      }
      // Passo 2: já tem bem; a leitura é a tag (ou outra plaqueta)
      if (r.bem && r.bem.id !== bem.id && !ehHexLongo) {
        setBem(r.bem)
        setMsg({ tipo: "info", texto: `Trocou para ${r.bem.plaqueta || r.bem.descricao}. Agora leia a tag RFID.` })
        return
      }
      if (r.bem && r.bem.id !== bem.id && ehHexLongo) {
        setMsg({ tipo: "erro", texto: `Esta tag já está vinculada ao bem ${r.bem.plaqueta || ""} · ${r.bem.descricao}. Use outra tag.` })
        return
      }
      const epc = v.replace(/\s+/g, "").toUpperCase()
      await atualizarBem(bem.id, { epc })
      setFeitos((f) => [{ plaqueta: bem.plaqueta, descricao: bem.descricao, epc, substituiu: bem.epc }, ...f])
      setMsg({ tipo: "ok", texto: `Tag ${epc} vinculada a ${bem.plaqueta || bem.descricao}. Leia a próxima plaqueta.` })
      setBem(null)
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e.message })
    } finally {
      setOcupado(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orgao/patrimonio"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Associar tags RFID</h1>
          <p className="text-muted-foreground">Vincula o chip da etiqueta ao bem, lendo plaqueta e tag no coletor</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Radio className="h-5 w-5" />Como usar no Chainway C66</CardTitle>
          <CardDescription>
            Abra esta página no Chrome do coletor, logado no portal. No app <strong>Keyboard Emulator</strong> do Chainway, ative a saída por teclado com <strong>Enter</strong> ao final, tanto para código de barras quanto para UHF.
            Depois: aperte o gatilho na plaqueta (QR ou barras) e em seguida na tag. Repita para o próximo bem. Se as tags vieram gravadas pelo fornecedor com o número da plaqueta, não precisa associar: o inventário já reconhece.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className={bem ? "border-amber-400" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{bem ? "2. Leia a tag RFID" : "1. Leia a plaqueta"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              id="entrada-coletor"
              ref={inputRef}
              className="w-full rounded-lg border px-3 py-3 font-mono text-base"
              placeholder={bem ? "Aguardando tag (EPC)…" : "Aguardando plaqueta, QR ou número…"}
              autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              disabled={ocupado}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const v = e.currentTarget.value; e.currentTarget.value = ""; processar(v) } }}
              onBlur={() => setTimeout(() => inputRef.current?.focus(), 200)}
            />
            {bem && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-amber-700" /><span className="font-mono font-semibold">{bem.plaqueta || "—"}</span></div>
                <div className="font-medium">{bem.descricao}</div>
                <div className="text-xs text-muted-foreground">{bem.setor_nome || "sem setor"}{bem.epc ? ` · tag atual ${bem.epc}` : ""}</div>
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => { setBem(null); setMsg(null); inputRef.current?.focus() }}><RotateCcw className="h-3.5 w-3.5 mr-1" />Cancelar e ler outra plaqueta</Button>
              </div>
            )}
            {msg && (
              <p className={`text-sm flex items-start gap-2 ${msg.tipo === "ok" ? "text-green-700" : msg.tipo === "erro" ? "text-red-700" : "text-blue-800"}`}>
                {msg.tipo === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : msg.tipo === "erro" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> : null}
                <span>{msg.texto}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Associadas nesta sessão ({feitos.length})</CardTitle></CardHeader>
          <CardContent>
            {feitos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ainda.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Plaqueta</TableHead><TableHead>Bem</TableHead><TableHead>EPC</TableHead></TableRow></TableHeader>
                <TableBody>
                  {feitos.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{f.plaqueta || "—"}</TableCell>
                      <TableCell className="text-sm">{f.descricao}</TableCell>
                      <TableCell className="font-mono text-xs">{f.epc}{f.substituiu ? <span className="block text-muted-foreground line-through">{f.substituiu}</span> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
