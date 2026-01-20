'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  CheckCircle, 
  XCircle,
  Clock,
  FileText,
  Loader2,
  ArrowLeft
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

interface ItemRequisicao {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade_solicitada: number;
  quantidade_autorizada?: number;
  valor_unitario?: number;
  valor_total_estimado?: number;
  unidade_medida?: string;
  status: string;
}

interface Requisicao {
  id: string;
  numero: string;
  tipo: string;
  setor_solicitante: string;
  justificativa: string;
  prioridade: string;
  status: string;
  data_solicitacao: string;
  data_autorizacao?: string;
  usuario_solicitante_nome: string;
  usuario_autorizador_nome?: string;
  observacao_autorizador?: string;
  valor_total_estimado: number;
  contrato?: {
    numero_contrato: string;
    fornecedor?: {
      razao_social: string;
    };
  };
  itens: ItemRequisicao[];
}

const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-800',
  AGUARDANDO_AUTORIZACAO: 'bg-yellow-100 text-yellow-800',
  AUTORIZADA: 'bg-green-100 text-green-800',
  NEGADA: 'bg-red-100 text-red-800',
  CANCELADA: 'bg-gray-100 text-gray-800',
  ORDEM_GERADA: 'bg-blue-100 text-blue-800',
  ATENDIDA_PARCIAL: 'bg-purple-100 text-purple-800',
  ATENDIDA: 'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_AUTORIZACAO: 'Aguardando Autorização',
  AUTORIZADA: 'Autorizada',
  NEGADA: 'Negada',
  CANCELADA: 'Cancelada',
  ORDEM_GERADA: 'Ordem Gerada',
  ATENDIDA_PARCIAL: 'Parcialmente Atendida',
  ATENDIDA: 'Atendida',
};

const PRIORIDADE_COLORS: Record<string, string> = {
  BAIXA: 'bg-gray-100 text-gray-600',
  NORMAL: 'bg-blue-100 text-blue-600',
  ALTA: 'bg-orange-100 text-orange-600',
  URGENTE: 'bg-red-100 text-red-600',
};

function RequisicoesList() {
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [busca, setBusca] = useState('');
  
  // Modal de detalhes/autorização
  const [requisicaoSelecionada, setRequisicaoSelecionada] = useState<Requisicao | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showAutorizar, setShowAutorizar] = useState(false);
  const [showNegar, setShowNegar] = useState(false);
  const [motivoNegativa, setMotivoNegativa] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    carregarRequisicoes();
  }, [filtroStatus]);

  const carregarRequisicoes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroStatus) params.append('status', filtroStatus);
      
      const response = await authFetch(`${API_URL}/api/almoxarifado/requisicoes?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        setRequisicoes(data);
      }
    } catch (error) {
      console.error('Erro ao carregar requisições:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleVerDetalhes = (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setShowDetalhes(true);
  };

  const handleAbrirAutorizar = (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setShowAutorizar(true);
  };

  const handleAbrirNegar = (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setMotivoNegativa('');
    setShowNegar(true);
  };

  const handleAutorizar = async () => {
    if (!requisicaoSelecionada) return;
    
    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/autorizar`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        alert('Requisição autorizada com sucesso! Saldo reservado no contrato.');
        setShowAutorizar(false);
        carregarRequisicoes();
      } else {
        const error = await response.json();
        alert(`Erro ao autorizar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao autorizar:', error);
      alert('Erro ao autorizar requisição');
    } finally {
      setProcessando(false);
    }
  };

  const handleNegar = async () => {
    if (!requisicaoSelecionada || !motivoNegativa.trim()) {
      alert('Informe o motivo da negativa');
      return;
    }
    
    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/negar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: motivoNegativa }),
        }
      );

      if (response.ok) {
        alert('Requisição negada.');
        setShowNegar(false);
        carregarRequisicoes();
      } else {
        const error = await response.json();
        alert(`Erro ao negar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao negar:', error);
      alert('Erro ao negar requisição');
    } finally {
      setProcessando(false);
    }
  };

  const requisicoesFiltradas = requisicoes.filter(req => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      req.numero.toLowerCase().includes(termo) ||
      req.setor_solicitante.toLowerCase().includes(termo) ||
      req.usuario_solicitante_nome.toLowerCase().includes(termo)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orgao/almoxarifado">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Requisições</h1>
            <p className="text-gray-500">Gerencie as requisições de materiais e serviços</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/orgao/almoxarifado/requisicoes/nova">
            <Plus className="h-4 w-4 mr-2" />
            Nova Requisição
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por número, setor ou solicitante..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os status</SelectItem>
                <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                <SelectItem value="AGUARDANDO_AUTORIZACAO">Aguardando Autorização</SelectItem>
                <SelectItem value="AUTORIZADA">Autorizada</SelectItem>
                <SelectItem value="NEGADA">Negada</SelectItem>
                <SelectItem value="ORDEM_GERADA">Ordem Gerada</SelectItem>
                <SelectItem value="ATENDIDA">Atendida</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requisicoesFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    Nenhuma requisição encontrada
                  </TableCell>
                </TableRow>
              ) : (
                requisicoesFiltradas.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.numero}</TableCell>
                    <TableCell>{req.setor_solicitante}</TableCell>
                    <TableCell>{req.usuario_solicitante_nome}</TableCell>
                    <TableCell>{formatarData(req.data_solicitacao)}</TableCell>
                    <TableCell>
                      <Badge className={PRIORIDADE_COLORS[req.prioridade]}>
                        {req.prioridade}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatarMoeda(req.valor_total_estimado)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[req.status]}>
                        {STATUS_LABELS[req.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalhes(req)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {req.status === 'AGUARDANDO_AUTORIZACAO' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => handleAbrirAutorizar(req)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleAbrirNegar(req)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal Detalhes */}
      <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Requisição {requisicaoSelecionada?.numero}</DialogTitle>
            <DialogDescription>
              Detalhes da requisição
            </DialogDescription>
          </DialogHeader>
          
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div>
                    <Badge className={STATUS_COLORS[requisicaoSelecionada.status]}>
                      {STATUS_LABELS[requisicaoSelecionada.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Prioridade</label>
                  <div>
                    <Badge className={PRIORIDADE_COLORS[requisicaoSelecionada.prioridade]}>
                      {requisicaoSelecionada.prioridade}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Setor</label>
                  <p>{requisicaoSelecionada.setor_solicitante}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Solicitante</label>
                  <p>{requisicaoSelecionada.usuario_solicitante_nome}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Data da Solicitação</label>
                  <p>{formatarData(requisicaoSelecionada.data_solicitacao)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Valor Total</label>
                  <p className="font-semibold">{formatarMoeda(requisicaoSelecionada.valor_total_estimado)}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Justificativa</label>
                <p className="bg-gray-50 p-3 rounded-md">{requisicaoSelecionada.justificativa}</p>
              </div>

              {requisicaoSelecionada.contrato && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Contrato</label>
                  <p>
                    {requisicaoSelecionada.contrato.numero_contrato}
                    {requisicaoSelecionada.contrato.fornecedor && 
                      ` - ${requisicaoSelecionada.contrato.fornecedor.razao_social}`
                    }
                  </p>
                </div>
              )}

              {requisicaoSelecionada.observacao_autorizador && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Observação do Autorizador</label>
                  <p className="bg-yellow-50 p-3 rounded-md">{requisicaoSelecionada.observacao_autorizador}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-500 mb-2 block">Itens</label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Qtd. Solicitada</TableHead>
                      <TableHead>Qtd. Autorizada</TableHead>
                      <TableHead>Valor Unit.</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requisicaoSelecionada.itens?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell>{item.quantidade_solicitada} {item.unidade_medida}</TableCell>
                        <TableCell>{item.quantidade_autorizada || '-'}</TableCell>
                        <TableCell>{item.valor_unitario ? formatarMoeda(item.valor_unitario) : '-'}</TableCell>
                        <TableCell>{item.valor_total_estimado ? formatarMoeda(item.valor_total_estimado) : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Autorizar */}
      <Dialog open={showAutorizar} onOpenChange={setShowAutorizar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-600">Autorizar Requisição</DialogTitle>
            <DialogDescription>
              Ao autorizar, o saldo será reservado no contrato.
            </DialogDescription>
          </DialogHeader>
          
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="font-medium">{requisicaoSelecionada.numero}</p>
                <p className="text-sm text-gray-600">
                  Valor: {formatarMoeda(requisicaoSelecionada.valor_total_estimado)}
                </p>
                <p className="text-sm text-gray-600">
                  {requisicaoSelecionada.itens?.length || 0} item(s)
                </p>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg text-sm">
                <p className="font-medium text-yellow-800">⚠️ Atenção</p>
                <p className="text-yellow-700">
                  Ao autorizar, o saldo dos itens será reservado no contrato.
                  Se a requisição for cancelada posteriormente, o saldo será liberado.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutorizar(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAutorizar} disabled={processando} className="bg-green-600 hover:bg-green-700">
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Autorização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Negar */}
      <Dialog open={showNegar} onOpenChange={setShowNegar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Negar Requisição</DialogTitle>
            <DialogDescription>
              Informe o motivo da negativa.
            </DialogDescription>
          </DialogHeader>
          
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="font-medium">{requisicaoSelecionada.numero}</p>
                <p className="text-sm text-gray-600">
                  Solicitante: {requisicaoSelecionada.usuario_solicitante_nome}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Motivo da Negativa *</label>
                <Textarea
                  value={motivoNegativa}
                  onChange={(e) => setMotivoNegativa(e.target.value)}
                  placeholder="Descreva o motivo da negativa..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNegar(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleNegar} 
              disabled={processando || !motivoNegativa.trim()} 
              variant="destructive"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Negativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RequisicoesPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <RequisicoesList />
    </ModuleGuard>
  );
}
