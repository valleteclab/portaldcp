"use client"

import { useState, useEffect } from "react"
import {
  Search,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Users,
  Phone,
  Mail,
  RefreshCw,
  Loader2,
  FileText,
  Pencil,
  KeyRound,
  MessageCircle,
  Send,
  ChevronDown,
  BadgeCheck,
  CircleDashed,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { API_URL, authFetch } from "@/lib/api"

interface FornecedorContrato {
  cnpj: string
  razao_social: string
  fornecedor_id: string | null
  total_contratos: number
  cadastrado_sistema: boolean
  nome_fantasia?: string
  email?: string
  telefone?: string
  whatsapp?: string
  status_cadastro?: string
  cidade?: string
  uf?: string
  porte?: string
}

const TEMPLATES_WHATSAPP = [
  {
    label: "Solicitar Medição",
    texto: (razao: string) =>
      `Olá, ${razao}! Entramos em contato para solicitar o envio da medição referente ao contrato vigente. Por favor, acesse o Portal DCP e registre a medição o quanto antes. Em caso de dúvidas, estamos à disposição.`,
  },
  {
    label: "Lembrete de Vencimento",
    texto: (razao: string) =>
      `Olá, ${razao}! Informamos que seu contrato está próximo do vencimento. Entre em contato com nosso setor de contratos para providenciar a renovação ou encerramento. Atenciosamente.`,
  },
  {
    label: "Solicitação de Documentos",
    texto: (razao: string) =>
      `Olá, ${razao}! Precisamos que você envie a documentação atualizada (certidões negativas, etc.) para regularização cadastral. Por favor, acesse o Portal DCP ou entre em contato conosco. Obrigado.`,
  },
  {
    label: "Confirmação de Serviço",
    texto: (razao: string) =>
      `Olá, ${razao}! Gostaríamos de confirmar a execução do serviço previsto para este período. Por favor, nos informe o status da entrega/execução. Agradecemos a atenção.`,
  },
  {
    label: "Mensagem Personalizada",
    texto: () => "",
  },
]

export default function FornecedoresOrgaoPage() {
  const [busca, setBusca] = useState("")
  const [fornecedores, setFornecedores] = useState<FornecedorContrato[]>([])
  const [loading, setLoading] = useState(true)

  // Modal detalhes
  const [selecionado, setSelecionado] = useState<FornecedorContrato | null>(null)
  const [modalDetalhes, setModalDetalhes] = useState(false)

  // Modal editar
  const [modalEditar, setModalEditar] = useState(false)
  const [editForm, setEditForm] = useState({
    nome_fantasia: "",
    email: "",
    telefone: "",
    representante_whatsapp: "",
    representante_nome: "",
    representante_cargo: "",
  })
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  // Modal reset senha
  const [modalReset, setModalReset] = useState(false)
  const [enviandoReset, setEnviandoReset] = useState(false)
  const [resetOk, setResetOk] = useState(false)

  // Modal WhatsApp
  const [modalWhatsApp, setModalWhatsApp] = useState(false)
  const [templateSelecionado, setTemplateSelecionado] = useState(0)
  const [mensagemWpp, setMensagemWpp] = useState("")
  const [enviandoWpp, setEnviandoWpp] = useState(false)
  const [wppOk, setWppOk] = useState(false)

  const fetchFornecedores = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/fornecedores-do-orgao`)
      if (res.ok) {
        const data = await res.json()
        setFornecedores(data)
      }
    } catch (error) {
      console.error("Erro ao buscar fornecedores:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFornecedores()
  }, [])

  // ── Detalhes ──────────────────────────────────────────────────────────────
  const abrirDetalhes = (f: FornecedorContrato) => {
    setSelecionado(f)
    setModalDetalhes(true)
  }

  // ── Editar ────────────────────────────────────────────────────────────────
  const abrirEditar = (f: FornecedorContrato) => {
    setSelecionado(f)
    setEditForm({
      nome_fantasia: f.nome_fantasia || "",
      email: f.email || "",
      telefone: f.telefone || "",
      representante_whatsapp: f.whatsapp || "",
      representante_nome: "",
      representante_cargo: "",
    })
    setModalEditar(true)
  }

  const salvarEdicao = async () => {
    if (!selecionado?.fornecedor_id) return
    setSalvandoEdicao(true)
    try {
      const res = await authFetch(
        `${API_URL}/api/fornecedores/${selecionado.fornecedor_id}/orgao/contato`,
        { method: "PUT", body: JSON.stringify(editForm) }
      )
      if (res.ok) {
        await fetchFornecedores()
        setModalEditar(false)
      }
    } finally {
      setSalvandoEdicao(false)
    }
  }

  // ── Reset Senha ───────────────────────────────────────────────────────────
  const abrirReset = (f: FornecedorContrato) => {
    setSelecionado(f)
    setResetOk(false)
    setModalReset(true)
  }

  const confirmarReset = async () => {
    if (!selecionado?.fornecedor_id) return
    setEnviandoReset(true)
    try {
      const res = await authFetch(
        `${API_URL}/api/fornecedores/${selecionado.fornecedor_id}/orgao/solicitar-reset`,
        { method: "POST" }
      )
      if (res.ok) setResetOk(true)
    } finally {
      setEnviandoReset(false)
    }
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const abrirWhatsApp = (f: FornecedorContrato) => {
    setSelecionado(f)
    setTemplateSelecionado(0)
    setMensagemWpp(TEMPLATES_WHATSAPP[0].texto(f.razao_social))
    setWppOk(false)
    setModalWhatsApp(true)
  }

  const selecionarTemplate = (idx: number) => {
    setTemplateSelecionado(idx)
    if (selecionado) {
      setMensagemWpp(TEMPLATES_WHATSAPP[idx].texto(selecionado.razao_social))
    }
  }

  const enviarWhatsApp = async () => {
    if (!selecionado?.whatsapp || !mensagemWpp.trim()) return
    setEnviandoWpp(true)
    try {
      // Inicia conversa e envia mensagem via WhatsApp Chat
      const tel = selecionado.whatsapp.replace(/\D/g, "")
      const res1 = await authFetch(`${API_URL}/api/whatsapp/chat/conversas/iniciar`, {
        method: "POST",
        body: JSON.stringify({ phone: tel, nomeContato: selecionado.razao_social }),
      })
      if (res1.ok) {
        const conversa = await res1.json()
        const res2 = await authFetch(
          `${API_URL}/api/whatsapp/chat/conversas/${conversa.id}/mensagens`,
          { method: "POST", body: JSON.stringify({ conteudo: mensagemWpp }) }
        )
        if (res2.ok) setWppOk(true)
      }
    } finally {
      setEnviandoWpp(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatarCnpj = (v?: string) => {
    if (!v) return "-"
    const l = v.replace(/\D/g, "")
    return l.length === 14 ? l.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v
  }

  const getBadgeSistema = (cadastrado: boolean) =>
    cadastrado ? (
      <Badge className="bg-green-100 text-green-800 gap-1">
        <BadgeCheck className="w-3 h-3" /> Cadastrado
      </Badge>
    ) : (
      <Badge className="bg-slate-100 text-slate-600 gap-1">
        <CircleDashed className="w-3 h-3" /> Não cadastrado
      </Badge>
    )

  const getBadgeStatus = (status?: string) => {
    if (!status) return null
    const map: Record<string, { label: string; className: string }> = {
      APROVADO: { label: "Aprovado", className: "bg-green-100 text-green-800" },
      PENDENTE: { label: "Pendente", className: "bg-yellow-100 text-yellow-800" },
      EM_ANALISE: { label: "Em análise", className: "bg-blue-100 text-blue-800" },
      SUSPENSO: { label: "Suspenso", className: "bg-red-100 text-red-800" },
      REJEITADO: { label: "Rejeitado", className: "bg-red-100 text-red-800" },
    }
    const cfg = map[status] || { label: status, className: "bg-gray-100 text-gray-700" }
    return <Badge className={cfg.className}>{cfg.label}</Badge>
  }

  const filtrados = fornecedores.filter((f) => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return f.razao_social?.toLowerCase().includes(q) || f.cnpj?.includes(busca)
  })

  const totalCadastrados = fornecedores.filter((f) => f.cadastrado_sistema).length

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestão de Fornecedores</h1>
          <p className="text-muted-foreground">Fornecedores cadastrados no sistema e com contratos com seu órgão</p>
        </div>
        <Button variant="outline" onClick={fetchFornecedores} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Fornecedores</p>
                <p className="text-2xl font-bold">{fornecedores.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <BadgeCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cadastrados no Sistema</p>
                <p className="text-2xl font-bold text-green-600">{totalCadastrados}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Contratos</p>
                <p className="text-2xl font-bold text-purple-600">
                  {fornecedores.reduce((acc, f) => acc + f.total_contratos, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por razão social ou CNPJ..."
              className="pl-10"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Fornecedores ({filtrados.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum fornecedor encontrado</p>
              <p className="text-sm">Os fornecedores aparecem aqui quando há contratos cadastrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Sistema</TableHead>
                  <TableHead className="text-center">Contratos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((f) => (
                  <TableRow key={f.cnpj}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{f.razao_social || "-"}</p>
                        {f.nome_fantasia && (
                          <p className="text-xs text-muted-foreground">{f.nome_fantasia}</p>
                        )}
                        {f.cidade && (
                          <p className="text-xs text-muted-foreground">
                            {f.cidade}/{f.uf}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatarCnpj(f.cnpj)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {f.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate max-w-[160px]">{f.email}</span>
                          </div>
                        )}
                        {f.telefone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {f.telefone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {getBadgeSistema(f.cadastrado_sistema)}
                        {f.status_cadastro && getBadgeStatus(f.status_cadastro)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{f.total_contratos}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Ações <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => abrirDetalhes(f)}>
                            <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
                          </DropdownMenuItem>
                          {f.cadastrado_sistema && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => abrirEditar(f)}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar Cadastro
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => abrirReset(f)}>
                                <KeyRound className="h-4 w-4 mr-2" /> Reset de Senha
                              </DropdownMenuItem>
                            </>
                          )}
                          {(f.whatsapp || f.telefone) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => abrirWhatsApp(f)}>
                                <MessageCircle className="h-4 w-4 mr-2" /> Enviar WhatsApp
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modal: Detalhes ─────────────────────────────────────────────── */}
      <Dialog open={modalDetalhes} onOpenChange={setModalDetalhes}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Fornecedor</DialogTitle>
          </DialogHeader>
          {selecionado && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{selecionado.razao_social}</h3>
                  {selecionado.nome_fantasia && (
                    <p className="text-sm text-muted-foreground">{selecionado.nome_fantasia}</p>
                  )}
                </div>
                {getBadgeSistema(selecionado.cadastrado_sistema)}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm border-t pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">CNPJ</p>
                  <p className="font-mono font-medium">{formatarCnpj(selecionado.cnpj)}</p>
                </div>
                {selecionado.porte && (
                  <div>
                    <p className="text-xs text-muted-foreground">Porte</p>
                    <p>{selecionado.porte}</p>
                  </div>
                )}
                {selecionado.email && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p>{selecionado.email}</p>
                  </div>
                )}
                {selecionado.telefone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p>{selecionado.telefone}</p>
                  </div>
                )}
                {selecionado.whatsapp && (
                  <div>
                    <p className="text-xs text-muted-foreground">WhatsApp</p>
                    <p>{selecionado.whatsapp}</p>
                  </div>
                )}
                {selecionado.cidade && (
                  <div>
                    <p className="text-xs text-muted-foreground">Localização</p>
                    <p>
                      {selecionado.cidade}/{selecionado.uf}
                    </p>
                  </div>
                )}
              </div>
              {selecionado.status_cadastro && (
                <div className="flex items-center gap-2 border-t pt-3">
                  <span className="text-sm text-muted-foreground">Status no sistema:</span>
                  {getBadgeStatus(selecionado.status_cadastro)}
                </div>
              )}
              <div className="bg-slate-50 rounded-lg p-3 text-center border-t pt-4">
                <p className="text-2xl font-bold text-blue-600">{selecionado.total_contratos}</p>
                <p className="text-xs text-muted-foreground">Contrato(s) com seu órgão</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDetalhes(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Editar ───────────────────────────────────────────────── */}
      <Dialog open={modalEditar} onOpenChange={setModalEditar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cadastro</DialogTitle>
            <DialogDescription>
              Edite os dados de contato de{" "}
              <span className="font-semibold">{selecionado?.razao_social}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome Fantasia</Label>
              <Input
                value={editForm.nome_fantasia}
                onChange={(e) => setEditForm((p) => ({ ...p, nome_fantasia: e.target.value }))}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefone</Label>
                <Input
                  value={editForm.telefone}
                  onChange={(e) => setEditForm((p) => ({ ...p, telefone: e.target.value }))}
                />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={editForm.representante_whatsapp}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, representante_whatsapp: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Representante</Label>
                <Input
                  value={editForm.representante_nome}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, representante_nome: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Cargo</Label>
                <Input
                  value={editForm.representante_cargo}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, representante_cargo: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEditar(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdicao}>
              {salvandoEdicao && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Reset de Senha ───────────────────────────────────────── */}
      <Dialog open={modalReset} onOpenChange={setModalReset}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset de Senha</DialogTitle>
            <DialogDescription>
              Enviar link de redefinição de senha para o fornecedor
            </DialogDescription>
          </DialogHeader>
          {resetOk ? (
            <div className="flex flex-col items-center py-4 gap-3">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-center font-medium">Link enviado com sucesso!</p>
              <p className="text-sm text-muted-foreground text-center">
                O fornecedor receberá um e-mail com o link para redefinir a senha. Válido por 24h.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Será enviado um e-mail com link de redefinição de senha para{" "}
                <span className="font-semibold">{selecionado?.razao_social}</span>.
              </p>
              {selecionado?.email && (
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{selecionado.email}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                O link será válido por 24 horas. A senha atual permanece ativa até que o
                fornecedor redefina.
              </p>
            </div>
          )}
          <DialogFooter>
            {resetOk ? (
              <Button onClick={() => setModalReset(false)}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setModalReset(false)}>
                  Cancelar
                </Button>
                <Button onClick={confirmarReset} disabled={enviandoReset}>
                  {enviandoReset ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4 mr-2" />
                  )}
                  Enviar Link
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: WhatsApp ─────────────────────────────────────────────── */}
      <Dialog open={modalWhatsApp} onOpenChange={setModalWhatsApp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              Enviar WhatsApp
            </DialogTitle>
            <DialogDescription>
              Para: <span className="font-semibold">{selecionado?.razao_social}</span>
              {selecionado?.whatsapp && (
                <span className="ml-2 text-muted-foreground">
                  ({selecionado.whatsapp})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {wppOk ? (
            <div className="flex flex-col items-center py-4 gap-3">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-medium">Mensagem enviada com sucesso!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Templates */}
              <div>
                <Label className="mb-2 block">Modelo de mensagem</Label>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES_WHATSAPP.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => selecionarTemplate(idx)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        templateSelecionado === idx
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-slate-700 border-slate-300 hover:border-green-400"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Textarea */}
              <div>
                <Label className="mb-2 block">Mensagem</Label>
                <Textarea
                  rows={6}
                  value={mensagemWpp}
                  onChange={(e) => setMensagemWpp(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  {mensagemWpp.length} caracteres
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            {wppOk ? (
              <Button onClick={() => setModalWhatsApp(false)}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setModalWhatsApp(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={enviarWhatsApp}
                  disabled={enviandoWpp || !mensagemWpp.trim()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {enviandoWpp ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Enviar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
