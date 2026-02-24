'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Search,
  FileText,
  Eye,
  Send,
  XCircle,
  Loader2,
} from 'lucide-react';
import { API_URL, authFetch } from '@/lib/api';
import { formatarMoeda, formatarData } from '@/lib/utils';
import { ModuleGuard } from '@/components/ModuleGuard';

interface OrdemServico {
  id: string;
  contrato_id: string;
  numero_os: string;
  descricao: string;
  valor_total: number;
  saldo_os: number;
  data_abertura: string;
  data_prazo: string;
  data_entrega?: string;
  metrica: string;
  status: string;
  usuario_cadastro_nome?: string;
  aprovador_nome?: string;
  data_aprovacao?: string;
  observacao_aprovador?: string;
  responsavel_tecnico?: string;
  sla_excedido?: boolean;
  created_at: string;
  numero_contrato?: string;
  fornecedor_nome?: string;
  escopo_detalhado?: string;
  modalidade_execucao?: string;
}

interface ContratoSimples {
  id: string;
  numero_contrato: string;
  fornecedor_razao_social: string;
  modalidade_execucao: string;
}

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovacao',
  AUTORIZADA: 'Autorizada',
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em Execucao',
  ENTREGUE: 'Entregue',
  EM_ACEITE: 'Em Aceite',
  ACEITA: 'Aceita',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
  CONCLUIDA: 'Concluida',
};

const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-800',
  AGUARDANDO_APROVACAO: 'bg-yellow-100 text-yellow-800',
  AUTORIZADA: 'bg-blue-100 text-blue-800',
  ABERTA: 'bg-blue-100 text-blue-800',
  EM_EXECUCAO: 'bg-indigo-100 text-indigo-800',
  ENTREGUE: 'bg-purple-100 text-purple-800',
  EM_ACEITE: 'bg-orange-100 text-orange-800',
  ACEITA: 'bg-green-100 text-green-800',
  REJEITADA: 'bg-red-100 text-red-800',
  CANCELADA: 'bg-red-100 text-red-800',
  CONCLUIDA: 'bg-green-100 text-green-800',
};

const MODALIDADES_COM_OS = ['ORDEM_SERVICO', 'CONTINUADO', 'LICENCA', 'MEDICAO'];

function OrdensServicoPage() {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [contratos, setContratos] = useState<ContratoSimples[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroContrato, setFiltroContrato] = useState<string>('todos');
  const [showNovaOS, setShowNovaOS] = useState(false);
  const [sel, setSel] = useState<OrdemServico | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);

  const [novaOS, setNovaOS] = useState({
    contrato_id: '',
    descricao: '',
    escopo_detalhado: '',
    valor_total: '',
    responsavel_tecnico: '',
    data_abertura: '',
    data_prazo: '',
    submeter: false,
  });

  const carregarOrdens = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStatus !== 'todos') params.set('status', filtroStatus);
      if (filtroContrato !== 'todos') params.set('contratoId', filtroContrato);
      const res = await authFetch(
        `${API_URL}/api/contratos/ordens-servico/listar?${params}`
      );
      const data = await res.json();
      setOrdens(Array.isArray(data) ? data : []);
    } catch (e) {
      setOrdens([]);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, filtroContrato]);

  const carregarContratos = useCallback(async () => {
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos?status=VIGENTE`
      );
      const data = await res.json();
      const lista = Array.isArray(data) ? data : data?.data ?? [];
      const filtrados = lista.filter((c: ContratoSimples) =>
        MODALIDADES_COM_OS.includes(c.modalidade_execucao)
      );
      setContratos(filtrados);
    } catch {
      setContratos([]);
    }
  }, []);

  useEffect(() => {
    carregarOrdens();
  }, [carregarOrdens]);

  useEffect(() => {
    carregarContratos();
  }, [carregarContratos]);

  const ordensFiltradas = ordens.filter((o) => {
    const matchSearch =
      !search ||
      o.numero_os?.toLowerCase().includes(search.toLowerCase()) ||
      o.descricao?.toLowerCase().includes(search.toLowerCase()) ||
      o.numero_contrato?.toLowerCase().includes(search.toLowerCase()) ||
      o.fornecedor_nome?.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const totalOS = ordens.length;
  const pendentesAprovacao = ordens.filter(
    (o) => o.status === 'AGUARDANDO_APROVACAO'
  ).length;
  const emExecucao = ordens.filter(
    (o) =>
      o.status === 'EM_EXECUCAO' ||
      o.status === 'ABERTA' ||
      o.status === 'AUTORIZADA'
  ).length;
  const concluidas = ordens.filter(
    (o) => o.status === 'CONCLUIDA' || o.status === 'ACEITA'
  ).length;

  const abrirNovaOS = () => {
    setNovaOS({
      contrato_id: '',
      descricao: '',
      escopo_detalhado: '',
      valor_total: '',
      responsavel_tecnico: '',
      data_abertura: '',
      data_prazo: '',
      submeter: false,
    });
    setShowNovaOS(true);
  };

  const salvarNovaOS = async () => {
    const cid = novaOS.contrato_id ? parseInt(novaOS.contrato_id, 10) : 0;
    if (!cid || !novaOS.descricao || !novaOS.valor_total) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        descricao: novaOS.descricao,
        valor_total: parseFloat(novaOS.valor_total),
        data_abertura: novaOS.data_abertura || undefined,
        data_prazo: novaOS.data_prazo || undefined,
        responsavel_tecnico: novaOS.responsavel_tecnico || undefined,
        escopo_detalhado: novaOS.escopo_detalhado || undefined,
        submeter_aprovacao: novaOS.submeter,
      };
      const res = await authFetch(
        `${API_URL}/api/contratos/${cid}/ordens-servico`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        setShowNovaOS(false);
        carregarOrdens();
      }
    } finally {
      setSaving(false);
    }
  };

  const submeterOS = async (id: string) => {
    setSaving(true);
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/ordens-servico/${id}/submeter`,
        { method: 'PATCH' }
      );
      if (res.ok) carregarOrdens();
    } finally {
      setSaving(false);
    }
  };

  const cancelarOS = async (id: string) => {
    const motivo = window.prompt('Informe o motivo do cancelamento:');
    if (motivo == null || motivo.trim() === '') return;
    setSaving(true);
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/ordens-servico/${id}/cancelar`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ observacao: motivo.trim() }),
        }
      );
      if (res.ok) {
        setShowDetalhes(false);
        setSel(null);
        carregarOrdens();
      }
    } finally {
      setSaving(false);
    }
  };

  const verDetalhes = (o: OrdemServico) => {
    setSel(o);
    setShowDetalhes(true);
  };

  return (
    <ModuleGuard modulo="ORDENS_SERVICO">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ordens de Servico</h1>
          <Button onClick={abrirNovaOS}>
            <Plus className="mr-2 h-4 w-4" />
            Nova OS
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total OS</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{totalOS}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Pendentes Aprovacao
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-yellow-600">
                {pendentesAprovacao}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Em Execucao</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-indigo-600">
                {emExecucao}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Concluidas</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-green-600">
                {concluidas}
              </span>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por numero, descricao, contrato..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroContrato} onValueChange={setFiltroContrato}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Contrato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {contratos.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.numero_contrato} - {c.fornecedor_razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Ordens</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numero OS</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Saldo OS</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordensFiltradas.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.numero_os}</TableCell>
                      <TableCell>
                        {o.numero_contrato}
                        {o.fornecedor_nome && (
                          <span className="block text-xs text-muted-foreground">
                            {o.fornecedor_nome}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {o.descricao || '-'}
                      </TableCell>
                      <TableCell>{formatarMoeda(o.valor_total)}</TableCell>
                      <TableCell>
                        <span
                          className={
                            o.saldo_os >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }
                        >
                          {formatarMoeda(o.saldo_os)}
                        </span>
                      </TableCell>
                      <TableCell>{formatarData(o.data_prazo)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-800'
                          }
                        >
                          {STATUS_LABELS[o.status] ?? o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => verDetalhes(o)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(o.status === 'RASCUNHO' ||
                            o.status === 'REJEITADA') && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => submeterOS(o.id)}
                              disabled={saving}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {o.status !== 'CANCELADA' &&
                            o.status !== 'CONCLUIDA' &&
                            o.status !== 'ACEITA' && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => cancelarOS(o.id)}
                                disabled={saving}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!loading && ordensFiltradas.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                Nenhuma ordem de servico encontrada.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showNovaOS} onOpenChange={setShowNovaOS}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Servico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Contrato</Label>
              <Select
                value={novaOS.contrato_id}
                onValueChange={(v) =>
                  setNovaOS((p) => ({ ...p, contrato_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o contrato" />
                </SelectTrigger>
                <SelectContent>
                  {contratos.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.numero_contrato} - {c.fornecedor_razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descricao</Label>
              <Textarea
                value={novaOS.descricao}
                onChange={(e) =>
                  setNovaOS((p) => ({ ...p, descricao: e.target.value }))
                }
                placeholder="Descricao da OS"
                rows={3}
              />
            </div>
            <div>
              <Label>Escopo Detalhado</Label>
              <Textarea
                value={novaOS.escopo_detalhado}
                onChange={(e) =>
                  setNovaOS((p) => ({ ...p, escopo_detalhado: e.target.value }))
                }
                placeholder="Escopo detalhado (opcional)"
                rows={3}
              />
            </div>
            <div>
              <Label>Valor Total</Label>
              <Input
                type="number"
                step="0.01"
                value={novaOS.valor_total}
                onChange={(e) =>
                  setNovaOS((p) => ({ ...p, valor_total: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Responsavel Tecnico</Label>
              <Input
                value={novaOS.responsavel_tecnico}
                onChange={(e) =>
                  setNovaOS((p) => ({
                    ...p,
                    responsavel_tecnico: e.target.value,
                  }))
                }
                placeholder="Nome do responsavel"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data Abertura</Label>
                <Input
                  type="date"
                  value={novaOS.data_abertura}
                  onChange={(e) =>
                    setNovaOS((p) => ({ ...p, data_abertura: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Data Prazo</Label>
                <Input
                  type="date"
                  value={novaOS.data_prazo}
                  onChange={(e) =>
                    setNovaOS((p) => ({ ...p, data_prazo: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="submeter"
                checked={novaOS.submeter}
                onChange={(e) =>
                  setNovaOS((p) => ({ ...p, submeter: e.target.checked }))
                }
              />
              <Label htmlFor="submeter">Enviar para aprovacao</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovaOS(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarNovaOS} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalhes - {sel?.numero_os ?? 'OS'}
            </DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Numero OS</Label>
                  <p className="font-medium">{sel.numero_os}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Contrato</Label>
                  <p className="font-medium">
                    {sel.numero_contrato} - {sel.fornecedor_nome}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge
                    variant="secondary"
                    className={
                      STATUS_COLORS[sel.status] ?? 'bg-gray-100 text-gray-800'
                    }
                  >
                    {STATUS_LABELS[sel.status] ?? sel.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor Total</Label>
                  <p className="font-medium">{formatarMoeda(sel.valor_total)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Saldo OS</Label>
                  <p
                    className={
                      sel.saldo_os >= 0 ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {formatarMoeda(sel.saldo_os)}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data Abertura</Label>
                  <p>{formatarData(sel.data_abertura)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data Prazo</Label>
                  <p>{formatarData(sel.data_prazo)}</p>
                </div>
                {sel.data_entrega && (
                  <div>
                    <Label className="text-muted-foreground">
                      Data Entrega
                    </Label>
                    <p>{formatarData(sel.data_entrega)}</p>
                  </div>
                )}
                {sel.responsavel_tecnico && (
                  <div>
                    <Label className="text-muted-foreground">
                      Responsavel Tecnico
                    </Label>
                    <p>{sel.responsavel_tecnico}</p>
                  </div>
                )}
                {sel.usuario_cadastro_nome && (
                  <div>
                    <Label className="text-muted-foreground">
                      Usuario Cadastro
                    </Label>
                    <p>{sel.usuario_cadastro_nome}</p>
                  </div>
                )}
                {sel.aprovador_nome && (
                  <div>
                    <Label className="text-muted-foreground">Aprovador</Label>
                    <p>{sel.aprovador_nome}</p>
                  </div>
                )}
                {sel.data_aprovacao && (
                  <div>
                    <Label className="text-muted-foreground">
                      Data Aprovacao
                    </Label>
                    <p>{formatarData(sel.data_aprovacao)}</p>
                  </div>
                )}
                {sel.sla_excedido && (
                  <div>
                    <Badge variant="destructive">SLA Excedido</Badge>
                  </div>
                )}
              </div>
              {sel.descricao && (
                <div>
                  <Label className="text-muted-foreground">Descricao</Label>
                  <p className="whitespace-pre-wrap">{sel.descricao}</p>
                </div>
              )}
              {sel.escopo_detalhado && (
                <div>
                  <Label className="text-muted-foreground">
                    Escopo Detalhado
                  </Label>
                  <p className="whitespace-pre-wrap">{sel.escopo_detalhado}</p>
                </div>
              )}
              {sel.observacao_aprovador && (
                <div>
                  <Label className="text-muted-foreground">
                    Observacao Aprovador
                  </Label>
                  <p className="whitespace-pre-wrap">
                    {sel.observacao_aprovador}
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                {(sel.status === 'RASCUNHO' || sel.status === 'REJEITADA') && (
                  <Button
                    onClick={() => submeterOS(sel.id)}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Submeter
                  </Button>
                )}
                {sel.status !== 'CANCELADA' &&
                  sel.status !== 'CONCLUIDA' &&
                  sel.status !== 'ACEITA' && (
                    <Button
                      variant="destructive"
                      onClick={() => cancelarOS(sel.id)}
                      disabled={saving}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancelar OS
                    </Button>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ModuleGuard>
  );
}

export default OrdensServicoPage;
