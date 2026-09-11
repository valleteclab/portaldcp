"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ClipboardCheck, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { listarInventarios, criarInventario, listarSetores } from "@/services/patrimonio.service"

type SetorForm = { setor_id: string; nome: string; incluir: boolean; responsavel_nome: string; responsavel_telefone: string }

export default function InventariosPage() {
  const router = useRouter()
  const [lista, setLista] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")
  const [form, setForm] = useState({ nome: `Inventário ${new Date().getFullYear()}`, ano: new Date().getFullYear(), comissao: "", observacoes: "" })
  const [setores, setSetores] = useState<SetorForm[]>([])
  const [setorLivre, setSetorLivre] = useState("")

  const carregar = () => {
    setLoading(true)
    listarInventarios().then(setLista).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(carregar, [])

  const abrirNovo = async () => {
    setErro("")
    try {
      const s = await listarSetores()
      setSetores(s.map((x) => ({ setor_id: x.id, nome: x.nome, incluir: true, responsavel_nome: "", responsavel_telefone: "" })))
    } catch { setSetores([]) }
    setAberto(true)
  }

  const adicionarSetorLivre = () => {
    const nome = setorLivre.trim()
    if (!nome) return
    setSetores([...setores, { setor_id: "", nome, incluir: true, responsavel_nome: "", responsavel_telefone: "" }])
    setSetorLivre("")
  }

  const salvar = async () => {
    setErro("")
    const escolhidos = setores.filter((s) => s.incluir)
    if (!escolhidos.length) { setErro("Marque ao menos um setor"); return }
    setSalvando(true)
    try {
      const inv = await criarInventario({
        nome: form.nome,
        ano: Number(form.ano),
        comissao: form.comissao || undefined,
        observacoes: form.observacoes || undefined,
        setores: escolhidos.map((s) => ({
          setor_id: s.setor_id || undefined,
          setor_nome: s.setor_id ? undefined : s.nome,
          responsavel_nome: s.responsavel_nome || undefined,
          responsavel_telefone: s.responsavel_telefone || undefined,
        })),
      })
      setAberto(false)
      router.push(`/orgao/patrimonio/inventarios/${inv.id}`)
    } catch (e: any) {
      setErro(e.message || "Erro ao criar campanha")
    } finally { setSalvando(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orgao/patrimonio"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Inventários</h1>
          <p className="text-muted-foreground">Campanhas de conferência física dos bens, setor a setor, pelo celular</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Nova campanha</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" />Como funciona</CardTitle>
          <CardDescription>
            A comissão abre a campanha e escolhe os setores. Cada responsável recebe um link por WhatsApp, abre no celular,
            lê o QR das plaquetas (ou usa o leitor RFID) e finaliza o setor. O sistema aponta os bens não localizados,
            os encontrados em outro setor e os sem plaqueta. Quando todos os setores fecham, a comissão fecha a campanha.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campanha</TableHead>
              <TableHead>Ano</TableHead>
              <TableHead>Setores</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aberta por</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : lista.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma campanha ainda. Crie a primeira para iniciar a conferência.</TableCell></TableRow>
            ) : lista.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.nome}</TableCell>
                <TableCell>{inv.ano}</TableCell>
                <TableCell>{inv.setores_fechados} / {inv.setores_total} fechados</TableCell>
                <TableCell><Badge className={inv.status === "ABERTO" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>{inv.status === "ABERTO" ? "Em andamento" : "Fechada"}</Badge></TableCell>
                <TableCell className="text-sm">{inv.aberto_por || "-"}</TableCell>
                <TableCell><Link href={`/orgao/patrimonio/inventarios/${inv.id}`}><Button size="sm" variant="ghost">Abrir</Button></Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova campanha de inventário</DialogTitle>
            <DialogDescription>Escolha os setores e, se quiser, já informe quem confere cada um e o WhatsApp para receber o link.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Ano</Label>
              <Input type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Comissão de inventário (nomes, portaria)</Label>
            <Textarea rows={2} value={form.comissao} onChange={(e) => setForm({ ...form, comissao: e.target.value })} placeholder="Ex.: Portaria 12/2026 — Maria (presidente), João, Ana" />
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Responsável pela conferência</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setores.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">Nenhum setor cadastrado em Configurações → Setores. Adicione setores abaixo pelo nome.</TableCell></TableRow>
                )}
                {setores.map((s, i) => (
                  <TableRow key={`${s.setor_id}-${i}`} className={s.incluir ? "" : "opacity-50"}>
                    <TableCell><Checkbox checked={s.incluir} onCheckedChange={(v) => setSetores(setores.map((x, j) => j === i ? { ...x, incluir: !!v } : x))} /></TableCell>
                    <TableCell className="font-medium">{s.nome}{!s.setor_id && <span className="ml-2 text-xs text-muted-foreground">(sem cadastro)</span>}</TableCell>
                    <TableCell><Input value={s.responsavel_nome} onChange={(e) => setSetores(setores.map((x, j) => j === i ? { ...x, responsavel_nome: e.target.value } : x))} placeholder="Nome" /></TableCell>
                    <TableCell><Input value={s.responsavel_telefone} onChange={(e) => setSetores(setores.map((x, j) => j === i ? { ...x, responsavel_telefone: e.target.value } : x))} placeholder="77 9 9999-9999" /></TableCell>
                    <TableCell>{!s.setor_id && <Button size="icon" variant="ghost" onClick={() => setSetores(setores.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-2">
            <Input value={setorLivre} onChange={(e) => setSetorLivre(e.target.value)} placeholder="Adicionar setor pelo nome (sem cadastro: só registra presença)" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarSetorLivre() } }} />
            <Button type="button" variant="outline" onClick={adicionarSetorLivre}>Adicionar</Button>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? "Criando..." : "Criar campanha"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
