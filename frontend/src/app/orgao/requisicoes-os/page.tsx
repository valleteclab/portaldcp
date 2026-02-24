'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  ArrowLeft,
  ClipboardList,
  FileText,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useModulosOrgao, ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

// --- Tipos ---
interface Requisicao {
  id: string;
  numero: string;
  tipo: string;
  setor_solicitante: string;
  status: string;
  data_solicitacao: string;
  data_autorizacao?: string;
  usuario_solicitante_nome: string;
  usuario_autorizador_nome?: string;
  valor_total_estimado: number;
  contrato?: {
    numero_contrato: string;
    fornecedor?: { razao_social: string };
  };
}

interface OrdemServico {
  id: string;
  numero_os: string;
  contrato_id: string;
  descricao?: string;
  valor_total: number;
  saldo_os: number;
  data_abertura: string;
  data_prazo?: string;
  data_aprovacao?: string;
  status: string;
  numero_contrato?: string;
  fornecedor_nome?: string;
  aprovador_nome?: string;
}

// --- Labels e cores ---
const STATUS_REQ: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_AUTORIZACAO: 'Aguardando Autorização',
  AUTORIZADA: 'Autorizada',
  NEGADA: 'Negada',
  CANCELADA: 'Cancelada',
  ORDEM_GERADA: 'Ordem Gerada',
  ATENDIDA_PARCIAL: 'Parcialmente Atendida',
  ATENDIDA: 'Atendida',
};

const STATUS_OS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  AUTORIZADA: 'Autorizada',
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em Execução',
  ENTREGUE: 'Entregue',
  EM_ACEITE: 'Em Aceite',
  ACEITA: 'Aceita',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
  CONCLUIDA: 'Concluída',
};

const STATUS_REQ_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-800',
  AGUARDANDO_AUTORIZACAO: 'bg-amber-100 text-amber-800',
  AUTORIZADA: 'bg-green-100 text-green-800',
  NEGADA: 'bg-red-100 text-red-800',
  CANCELADA: 'bg-gray-100 text-gray-800',
  ORDEM_GERADA: 'bg-blue-100 text-blue-800',
  ATENDIDA_PARCIAL: 'bg-purple-100 text-purple-800',
  ATENDIDA: 'bg-emerald-100 text-emerald-800',
};

const STATUS_OS_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-800',
  AGUARDANDO_APROVACAO: 'bg-amber-100 text-amber-800',
  AUTORIZADA: 'bg-blue-100 text-blue-800',
  ABERTA: 'bg-blue-100 text-blue-800',
  EM_EXECUCAO: 'bg-indigo-100 text-indigo-800',
  ENTREGUE: 'bg-purple-100 text-purple-800',
  EM_ACEITE: 'bg-orange-100 text-orange-800',
  ACEITA: 'bg-green-100 text-green-800',
  REJEITADA: 'bg-red-100 text-red-800',
  CANCELADA: 'bg-red-100 text-red-800',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800',
};

function formatarMoeda(v: number | string | null | undefined): string {
  const n = Number(v);
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(d: string | null | undefined): string {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('pt-BR');
}

// Agrupa por categoria para cards
function categoriaRequisicao(status: string): 'pendentes' | 'andamento' | 'concluidas' {
  if (['RASCUNHO', 'AGUARDANDO_AUTORIZACAO'].includes(status)) return 'pendentes';
  if (['AUTORIZADA', 'ORDEM_GERADA', 'ATENDIDA_PARCIAL'].includes(status)) return 'andamento';
  return 'concluidas';
}

function categoriaOS(status: string): 'pendentes' | 'andamento' | 'concluidas' {
  if (['RASCUNHO', 'AGUARDANDO_APROVACAO', 'REJEITADA'].includes(status)) return 'pendentes';
  if (['AUTORIZADA', 'ABERTA', 'EM_EXECUCAO', 'ENTREGUE', 'EM_ACEITE'].includes(status)) return 'andamento';
  return 'concluidas';
}

export default function RequisicoesOSPage() {
  const router = useRouter();
  const { modulos, loading: modulosLoading, temAcesso } = useModulosOrgao();
  const temAlmoxarifado = temAcesso(ModuloSistema.ALMOXARIFADO);
  const temOrdensServico = temAcesso(ModuloSistema.ORDENS_SERVICO);

  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'lista' | 'cards'>('cards');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'requisicao' | 'os'>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('__all__');
  const [busca, setBusca] = useState('');

  const temAcessoPagina = temAlmoxarifado || temOrdensServico;

  const carregarRequisicoes = useCallback(async () => {
    if (!temAlmoxarifado) return;
    try {
      const params = new URLSearchParams();
      if (filtroStatus && filtroStatus !== '__all__') params.append('status', filtroStatus);
      const r = await authFetch(`${API_URL}/api/almoxarifado/requisicoes?${params}`);
      if (r.ok) {
        const data = await r.json();
        setRequisicoes(Array.isArray(data) ? data : []);
      }
    } catch {
      setRequisicoes([]);
    }
  }, [temAlmoxarifado, filtroStatus]);

  const carregarOS = useCallback(async () => {
    if (!temOrdensServico) return;
    try {
      const params = new URLSearchParams();
      if (filtroStatus && filtroStatus !== '__all__') params.append('status', filtroStatus);
      const r = await authFetch(`${API_URL}/api/contratos/ordens-servico/listar?${params}`);
      if (r.ok) {
        const data = await r.json();
        setOrdens(Array.isArray(data) ? data : []);
      }
    } catch {
      setOrdens([]);
    }
  }, [temOrdensServico, filtroStatus]);

  useEffect(() => {
    if (!temAcessoPagina) return;
    setLoading(true);
    Promise.all([carregarRequisicoes(), carregarOS()]).finally(() => setLoading(false));
  }, [temAcessoPagina, carregarRequisicoes, carregarOS]);

  // Itens unificados para exibição
  const itensRequisicao = useMemo(() => {
    return requisicoes.map((r) => ({
      tipo: 'requisicao' as const,
      id: r.id,
      numero: r.numero,
      tipoLabel: r.tipo === 'ORDEM_SERVICO' ? 'OS' : 'REQ',
      setor: r.setor_solicitante,
      solicitante: r.usuario_solicitante_nome,
      data: r.data_solicitacao,
      valor: r.valor_total_estimado,
      status: r.status,
      contrato: r.contrato?.numero_contrato,
      empresa: r.contrato?.fornecedor?.razao_social,
      atendida: ['ATENDIDA', 'ATENDIDA_PARCIAL'].includes(r.status),
      aprovador: r.usuario_autorizador_nome,
      dataAprovacao: r.data_autorizacao,
      categoria: categoriaRequisicao(r.status),
    }));
  }, [requisicoes]);

  const itensOS = useMemo(() => {
    return ordens.map((o) => {
      const consumido = Number(o.valor_total) - Number(o.saldo_os);
      const pctConsumido = Number(o.valor_total) > 0 ? (consumido / Number(o.valor_total)) * 100 : 0;
      return {
        tipo: 'os' as const,
        id: o.id,
        numero: o.numero_os,
        tipoLabel: 'OS',
        setor: '-',
        solicitante: (o as any).usuario_cadastro_nome || '-',
        aprovador: o.aprovador_nome,
        data: o.data_abertura,
        valor: o.valor_total,
        saldo: o.saldo_os,
        consumido,
        pctConsumido,
        status: o.status,
        contrato: o.numero_contrato,
        empresa: o.fornecedor_nome,
        dataAprovacao: o.data_aprovacao,
        categoria: categoriaOS(o.status),
      };
    });
  }, [ordens]);

  const todosItens = useMemo(() => {
    const req = itensRequisicao.map((i) => ({ ...i, origem: 'requisicao' as const }));
    const os = itensOS.map((i) => ({ ...i, origem: 'os' as const }));
    return [...req, ...os];
  }, [itensRequisicao, itensOS]);

  const itensFiltrados = useMemo(() => {
    let list = todosItens;
    if (filtroTipo === 'requisicao') list = list.filter((i) => i.origem === 'requisicao');
    if (filtroTipo === 'os') list = list.filter((i) => i.origem === 'os');
    if (busca.trim()) {
      const b = busca.toLowerCase();
      list = list.filter(
        (i) =>
          i.numero.toLowerCase().includes(b) ||
          (i.setor || '').toLowerCase().includes(b) ||
          (i.solicitante || '').toLowerCase().includes(b) ||
          (i.empresa || '').toLowerCase().includes(b) ||
          (i.contrato || '').toLowerCase().includes(b)
      );
    }
    return list;
  }, [todosItens, filtroTipo, busca]);

  const stats = useMemo(() => {
    const pendentes = itensFiltrados.filter((i) => i.categoria === 'pendentes').length;
    const andamento = itensFiltrados.filter((i) => i.categoria === 'andamento').length;
    const concluidas = itensFiltrados.filter((i) => i.categoria === 'concluidas').length;
    return {
      total: itensFiltrados.length,
      pendentes,
      andamento,
      concluidas,
    };
  }, [itensFiltrados]);

  if (modulosLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!temAcessoPagina) {
    router.replace('/orgao');
    return null;
  }

  const linkNovaRequisicao = '/orgao/almoxarifado/requisicoes/nova';
  const linkNovaOS = '/orgao/ordens-servico';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/orgao" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Requisições e Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie requisições, pedidos e ordens de serviço
          </p>
        </div>
        <div className="flex gap-2">
          {temAlmoxarifado && (
            <Button asChild>
              <Link href={linkNovaRequisicao}>
                <Plus className="mr-2 h-4 w-4" /> Nova Requisição
              </Link>
            />
          )}
          {temOrdensServico && (
            <Button asChild variant={temAlmoxarifado ? 'outline' : 'default'}>
              <Link href={linkNovaOS}>
                <Plus className="mr-2 h-4 w-4" /> Nova OS
              </Link>
            />
          )}
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{stats.total}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-amber-600">{stats.pendentes}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Em andamento</CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-indigo-600">{stats.andamento}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-600">{stats.concluidas}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, setor, solicitante ou empresa..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filtroTipo} onValueChange={(v: any) => setFiltroTipo(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {temAlmoxarifado && <SelectItem value="requisicao">Requisições</SelectItem>}
                {temOrdensServico && <SelectItem value="os">Ordens de Serviço</SelectItem>}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                {Object.entries(STATUS_REQ).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
                {Object.entries(STATUS_OS)
                  .filter(([k]) => !STATUS_REQ[k])
                  .map(([k, v]) => (
                    <SelectItem key={`os-${k}`} value={k}>{v}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'lista' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('lista')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lista de Requisições e OS</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-3 opacity-30" />
              <p>Nenhum item encontrado.</p>
            </div>
          ) : viewMode === 'lista' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  {filtroTipo !== 'requisicao' && <TableHead>Consumido / Saldo</TableHead>}
                  {filtroTipo !== 'os' && <TableHead>Atendida</TableHead>}
                  <TableHead>Contrato</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Aprovador</TableHead>
                  <TableHead>Data Aprovação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensFiltrados.map((item) => {
                  const isOS = item.origem === 'os';
                  const statusMap = isOS ? STATUS_OS : STATUS_REQ;
                  const statusColors = isOS ? STATUS_OS_COLORS : STATUS_REQ_COLORS;
                  const linkDetalhe = isOS
                    ? `/orgao/ordens-servico`
                    : `/orgao/almoxarifado/requisicoes?detalhe=${item.id}`;
                  return (
                    <TableRow key={`${item.origem}-${item.id}`} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">{item.numero}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{item.tipoLabel}</Badge>
                      </TableCell>
                      <TableCell>{item.setor}</TableCell>
                      <TableCell>{item.solicitante}</TableCell>
                      <TableCell>{formatarData(item.data)}</TableCell>
                      <TableCell>{formatarMoeda(item.valor)}</TableCell>
                      {filtroTipo !== 'requisicao' && (
                        <TableCell>
                          {isOS && 'consumido' in item && 'saldo' in item ? (
                            <span className="text-sm">
                              {formatarMoeda(item.consumido)} / {formatarMoeda(item.saldo)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      )}
                      {filtroTipo !== 'os' && (
                        <TableCell>
                          {'atendida' in item && item.atendida ? (
                            <Badge className="bg-green-100 text-green-800">Sim</Badge>
                          ) : item.origem === 'requisicao' ? (
                            <Badge variant="secondary">Não</Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      )}
                      <TableCell>{item.contrato || '-'}</TableCell>
                      <TableCell>{item.empresa || '-'}</TableCell>
                      <TableCell>{'aprovador' in item ? item.aprovador : (item as any).aprovador_nome || '-'}</TableCell>
                      <TableCell>{formatarData(item.dataAprovacao)}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[item.status] ?? 'bg-gray-100 text-gray-800'}>
                          {statusMap[item.status] ?? item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={linkDetalhe}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            /* Vista em cards por coluna (Pendentes | Em andamento | Concluídas) */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(['pendentes', 'andamento', 'concluidas'] as const).map((cat) => {
                const itens = itensFiltrados.filter((i) => i.categoria === cat);
                const labels = { pendentes: 'Pendentes', andamento: 'Em andamento', concluidas: 'Concluídas' };
                const icons = { pendentes: Clock, andamento: TrendingUp, concluidas: CheckCircle2 };
                const Icon = icons[cat];
                return (
                  <div key={cat} className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {labels[cat]} ({itens.length})
                    </h3>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {itens.map((item) => {
                        const isOS = item.origem === 'os';
                        const statusMap = isOS ? STATUS_OS : STATUS_REQ;
                        const statusColors = isOS ? STATUS_OS_COLORS : STATUS_REQ_COLORS;
                        const linkDetalhe = isOS ? `/orgao/ordens-servico` : `/orgao/almoxarifado/requisicoes?detalhe=${item.id}`;
                        return (
                          <Link key={`${item.origem}-${item.id}`} href={linkDetalhe}>
                            <Card className="hover:shadow-md transition-shadow cursor-pointer border-slate-200">
                              <CardContent className="p-4">
                                {/* Empresa em destaque no topo */}
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <h4 className="font-semibold text-slate-900 leading-tight">
                                    {item.empresa || item.numero}
                                  </h4>
                                  <Badge className={`shrink-0 ${statusColors[item.status] ?? 'bg-gray-100 text-gray-800'}`} variant="secondary">
                                    {statusMap[item.status] ?? item.status}
                                  </Badge>
                                </div>
                                {/* Número do contrato em azul */}
                                {item.contrato && (
                                  <p className="text-sm font-medium text-blue-600 mb-2">
                                    Contrato {item.contrato}
                                  </p>
                                )}
                                {/* Barra de progresso (OS) */}
                                {isOS && 'pctConsumido' in item && (
                                  <div className="mb-3">
                                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                      <span>Utilizado</span>
                                      <span className="font-medium">{Math.min(item.pctConsumido, 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                      <div
                                        className={`h-2 rounded-full transition-all ${
                                          item.pctConsumido > 90 ? 'bg-red-500' : item.pctConsumido > 70 ? 'bg-amber-500' : 'bg-blue-500'
                                        }`}
                                        style={{ width: `${Math.min(item.pctConsumido, 100)}%` }}
                                      />
                                    </div>
                                    <div className="flex justify-between text-xs mt-1 text-muted-foreground">
                                      <span>Consumido: {formatarMoeda(item.consumido)}</span>
                                      <span>Saldo: {formatarMoeda(item.saldo)}</span>
                                    </div>
                                  </div>
                                )}
                                {/* Requisição: atendida e aprovador */}
                                {!isOS && 'atendida' in item && (
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    <Badge variant={item.atendida ? 'default' : 'secondary'} className={item.atendida ? 'bg-emerald-100 text-emerald-800' : ''}>
                                      Atendida: {item.atendida ? 'Sim' : 'Não'}
                                    </Badge>
                                    {item.aprovador && (
                                      <span className="text-xs text-muted-foreground">Aprovador: {item.aprovador}</span>
                                    )}
                                  </div>
                                )}
                                {/* Data de aprovação em evidência */}
                                {item.dataAprovacao && (
                                  <p className="text-xs font-medium text-slate-600 bg-slate-50 rounded px-2 py-1 mb-2">
                                    Aprovado em {formatarData(item.dataAprovacao)}
                                  </p>
                                )}
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                  <span className="text-xs text-muted-foreground">{item.numero}</span>
                                  <span className="text-sm font-semibold">{formatarMoeda(item.valor)}</span>
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
