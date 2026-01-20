'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  FileText, 
  Search, 
  Eye, 
  Send,
  Package,
  Loader2,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle,
  XCircle,
  Clock
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

interface OrdemFornecimento {
  id: string;
  numero: string;
  tipo: string;
  status: string;
  data_emissao: string;
  data_entrega_prevista?: string;
  data_envio?: string;
  valor_total: number;
  valor_entregue: number;
  usuario_emitente_nome: string;
  contrato?: {
    numero_contrato: string;
  };
  fornecedor?: {
    razao_social: string;
    email?: string;
  };
  requisicao?: {
    numero: string;
  };
  itens: {
    numero_item: number;
    descricao: string;
    quantidade: number;
    quantidade_entregue: number;
    valor_unitario: number;
    valor_total: number;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-800',
  EMITIDA: 'bg-yellow-100 text-yellow-800',
  ENVIADA: 'bg-blue-100 text-blue-800',
  EM_ATENDIMENTO: 'bg-purple-100 text-purple-800',
  ATENDIDA_PARCIAL: 'bg-orange-100 text-orange-800',
  ATENDIDA: 'bg-green-100 text-green-800',
  CANCELADA: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EMITIDA: 'Emitida',
  ENVIADA: 'Enviada',
  EM_ATENDIMENTO: 'Em Atendimento',
  ATENDIDA_PARCIAL: 'Parcialmente Atendida',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
};

function OrdensList() {
  const [ordens, setOrdens] = useState<OrdemFornecimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('__all__');
  const [busca, setBusca] = useState('');
  
  // Modal de detalhes
  const [ordemSelecionada, setOrdemSelecionada] = useState<OrdemFornecimento | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [emailFornecedor, setEmailFornecedor] = useState('');
  const [observacoesEnvio, setObservacoesEnvio] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    carregarOrdens();
  }, [filtroStatus]);

  const carregarOrdens = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroStatus && filtroStatus !== '__all__') params.append('status', filtroStatus);
      
      const response = await authFetch(`${API_URL}/api/almoxarifado/ordens?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        setOrdens(data);
      }
    } catch (error) {
      console.error('Erro ao carregar ordens:', error);
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

  const handleVerDetalhes = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setShowDetalhes(true);
  };

  const handleAbrirEnviar = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setEmailFornecedor(ordem.fornecedor?.email || '');
    setObservacoesEnvio('');
    setShowEnviar(true);
  };

  const handleEnviar = async () => {
    if (!ordemSelecionada) return;
    
    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}/enviar`,
        {
          method: 'POST',
          body: JSON.stringify({
            email_fornecedor: emailFornecedor,
            observacoes: observacoesEnvio,
          }),
        }
      );

      if (response.ok) {
        alert('Ordem enviada com sucesso!');
        setShowEnviar(false);
        carregarOrdens();
      } else {
        const error = await response.json();
        alert(`Erro ao enviar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro ao enviar ordem');
    } finally {
      setProcessando(false);
    }
  };

  const getPercentualAtendimento = (ordem: OrdemFornecimento) => {
    if (Number(ordem.valor_total) === 0) return 0;
    return (Number(ordem.valor_entregue) / Number(ordem.valor_total)) * 100;
  };

  const ordensFiltradas = ordens.filter(ordem => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      ordem.numero.toLowerCase().includes(termo) ||
      ordem.fornecedor?.razao_social?.toLowerCase().includes(termo) ||
      ordem.contrato?.numero_contrato?.toLowerCase().includes(termo)
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
            <h1 className="text-2xl font-bold text-gray-900">Ordens de Fornecimento</h1>
            <p className="text-gray-500">Gerencie as ordens enviadas aos fornecedores</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por número, fornecedor ou contrato..."
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
                <SelectItem value="__all__">Todos os status</SelectItem>
                <SelectItem value="EMITIDA">Emitida</SelectItem>
                <SelectItem value="ENVIADA">Enviada</SelectItem>
                <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
                <SelectItem value="ATENDIDA_PARCIAL">Parcialmente Atendida</SelectItem>
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
                <TableHead>Fornecedor</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Atendimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordensFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    Nenhuma ordem encontrada
                  </TableCell>
                </TableRow>
              ) : (
                ordensFiltradas.map((ordem) => (
                  <TableRow key={ordem.id}>
                    <TableCell className="font-medium">{ordem.numero}</TableCell>
                    <TableCell>{ordem.fornecedor?.razao_social || '-'}</TableCell>
                    <TableCell>{ordem.contrato?.numero_contrato || '-'}</TableCell>
                    <TableCell>{formatarData(ordem.data_emissao)}</TableCell>
                    <TableCell>{formatarMoeda(ordem.valor_total)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ width: `${getPercentualAtendimento(ordem)}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">
                          {getPercentualAtendimento(ordem).toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[ordem.status]}>
                        {STATUS_LABELS[ordem.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalhes(ordem)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {ordem.status === 'EMITIDA' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => handleAbrirEnviar(ordem)}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
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
            <DialogTitle>Ordem {ordemSelecionada?.numero}</DialogTitle>
            <DialogDescription>
              Detalhes da ordem de {ordemSelecionada?.tipo === 'SERVICO' ? 'serviço' : 'fornecimento'}
            </DialogDescription>
          </DialogHeader>
          
          {ordemSelecionada && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div>
                    <Badge className={STATUS_COLORS[ordemSelecionada.status]}>
                      {STATUS_LABELS[ordemSelecionada.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Tipo</label>
                  <p>{ordemSelecionada.tipo === 'SERVICO' ? 'Ordem de Serviço' : 'Ordem de Fornecimento'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Fornecedor</label>
                  <p>{ordemSelecionada.fornecedor?.razao_social || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Contrato</label>
                  <p>{ordemSelecionada.contrato?.numero_contrato || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Data de Emissão</label>
                  <p>{formatarData(ordemSelecionada.data_emissao)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Entrega Prevista</label>
                  <p>{ordemSelecionada.data_entrega_prevista ? formatarData(ordemSelecionada.data_entrega_prevista) : '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Valor Total</label>
                  <p className="font-semibold">{formatarMoeda(ordemSelecionada.valor_total)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Valor Entregue</label>
                  <p className="font-semibold text-green-600">{formatarMoeda(ordemSelecionada.valor_entregue)}</p>
                </div>
              </div>

              {ordemSelecionada.requisicao && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Requisição de Origem</label>
                  <p>{ordemSelecionada.requisicao.numero}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-500 mb-2 block">Itens</label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Entregue</TableHead>
                      <TableHead>Valor Unit.</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordemSelecionada.itens?.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell>{item.quantidade}</TableCell>
                        <TableCell>
                          <Badge variant={item.quantidade_entregue >= item.quantidade ? 'default' : 'secondary'}>
                            {item.quantidade_entregue}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatarMoeda(item.valor_unitario)}</TableCell>
                        <TableCell>{formatarMoeda(item.valor_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Enviar */}
      <Dialog open={showEnviar} onOpenChange={setShowEnviar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Ordem ao Fornecedor</DialogTitle>
            <DialogDescription>
              A ordem será enviada por email ao fornecedor
            </DialogDescription>
          </DialogHeader>
          
          {ordemSelecionada && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="font-medium">{ordemSelecionada.numero}</p>
                <p className="text-sm text-gray-600">
                  Fornecedor: {ordemSelecionada.fornecedor?.razao_social}
                </p>
                <p className="text-sm text-gray-600">
                  Valor: {formatarMoeda(ordemSelecionada.valor_total)}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Email do Fornecedor</label>
                <Input
                  type="email"
                  value={emailFornecedor}
                  onChange={(e) => setEmailFornecedor(e.target.value)}
                  placeholder="email@fornecedor.com"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  value={observacoesEnvio}
                  onChange={(e) => setObservacoesEnvio(e.target.value)}
                  placeholder="Observações adicionais para o fornecedor..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnviar(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={processando}>
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Enviar Ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrdensPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <OrdensList />
    </ModuleGuard>
  );
}
