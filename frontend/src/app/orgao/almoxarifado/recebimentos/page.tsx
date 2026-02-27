'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Package, 
  Search, 
  Eye, 
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  FileText,
  ClipboardCheck,
  AlertTriangle,
  RotateCcw,
  Trash2
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

interface Recebimento {
  id: string;
  numero: string;
  tipo: string;
  status: string;
  data_recebimento: string;
  numero_nota_fiscal?: string;
  valor_total_recebido: number;
  valor_aceito: number;
  usuario_recebedor_nome: string;
  ordem_fornecimento?: {
    numero: string;
    fornecedor?: {
      razao_social: string;
    };
  };
  itens: {
    numero_item: number;
    descricao: string;
    tipo_item?: string;
    quantidade_esperada: number;
    quantidade_recebida: number;
    quantidade_aceita: number;
    valor_unitario: number;
    valor_total: number;
    observacao?: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-800',
  CONFERIDO: 'bg-blue-100 text-blue-800',
  ACEITO: 'bg-green-100 text-green-800',
  REJEITADO: 'bg-red-100 text-red-800',
  ACEITO_PARCIAL: 'bg-orange-100 text-orange-800',
  ESTORNADO: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente Conferência',
  CONFERIDO: 'Conferido',
  ACEITO: 'Aceito',
  REJEITADO: 'Rejeitado',
  ACEITO_PARCIAL: 'Aceito Parcialmente',
  ESTORNADO: 'Estornado',
};

function RecebimentosList() {
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('__all__');
  const [busca, setBusca] = useState('');
  
  // Permissões do usuário
  const [podeCancelarEstornar, setPodeCancelarEstornar] = useState(false);
  const [podeReceberPatrimonio, setPodeReceberPatrimonio] = useState(false);
  
  // Modal
  const [recebimentoSelecionado, setRecebimentoSelecionado] = useState<Recebimento | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showAceitar, setShowAceitar] = useState(false);
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [showEstornar, setShowEstornar] = useState(false);
  const [showExcluir, setShowExcluir] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [motivoEstorno, setMotivoEstorno] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    // SEMPRE busca permissões do banco de dados (fonte da verdade)
    const carregarPermissoes = async () => {
      try {
        console.log('[Recebimentos] Buscando permissões do usuário da API...');
        const response = await authFetch(`${API_URL}/api/usuarios/me`);
        if (response.ok) {
          const usuario = await response.json();
          console.log('[Recebimentos] Usuario da API:', usuario);
          setPodeCancelarEstornar(usuario.pode_cancelar_estornar === true);
          setPodeReceberPatrimonio(usuario.pode_receber_patrimonio === true);
          // Atualiza localStorage para cache (mas sempre busca da API)
          localStorage.setItem('usuario', JSON.stringify(usuario));
        } else {
          console.error('[Recebimentos] Erro ao buscar usuário da API:', response.status);
        }
      } catch (apiError) {
        console.error('[Recebimentos] Erro ao buscar da API:', apiError);
      }
    };
    
    carregarPermissoes();
  }, []);

  useEffect(() => {
    carregarRecebimentos();
  }, [filtroStatus]);

  const carregarRecebimentos = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroStatus && filtroStatus !== '__all__') params.append('status', filtroStatus);
      
      const response = await authFetch(`${API_URL}/api/almoxarifado/recebimentos?${params}`);
      
      if (response.ok) {
        const data = await response.json();
        setRecebimentos(data);
      }
    } catch (error) {
      console.error('Erro ao carregar recebimentos:', error);
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

  const handleVerDetalhes = (rec: Recebimento) => {
    setRecebimentoSelecionado(rec);
    setShowDetalhes(true);
  };

  const handleConferir = async (id: string) => {
    try {
      setProcessando(true);
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${id}/conferir`,
        { method: 'POST' }
      );

      if (response.ok) {
        alert('Recebimento conferido! Agora pode ser aceito.');
        carregarRecebimentos();
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao conferir:', error);
      alert('Erro ao conferir recebimento');
    } finally {
      setProcessando(false);
    }
  };

  const handleAbrirAceitar = (rec: Recebimento) => {
    setRecebimentoSelecionado(rec);
    setShowAceitar(true);
  };

  const handleAceitar = async () => {
    if (!recebimentoSelecionado) return;
    
    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${recebimentoSelecionado.id}/aceitar`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        alert('Recebimento aceito! Baixa realizada no contrato.');
        setShowAceitar(false);
        carregarRecebimentos();
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao aceitar:', error);
      alert('Erro ao aceitar recebimento');
    } finally {
      setProcessando(false);
    }
  };

  const handleAbrirRejeitar = (rec: Recebimento) => {
    setRecebimentoSelecionado(rec);
    setMotivoRejeicao('');
    setShowRejeitar(true);
  };

  const handleRejeitar = async () => {
    if (!recebimentoSelecionado || !motivoRejeicao.trim()) {
      alert('Informe o motivo da rejeição');
      return;
    }
    
    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${recebimentoSelecionado.id}/rejeitar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: motivoRejeicao }),
        }
      );

      if (response.ok) {
        alert('Recebimento rejeitado.');
        setShowRejeitar(false);
        carregarRecebimentos();
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao rejeitar:', error);
      alert('Erro ao rejeitar recebimento');
    } finally {
      setProcessando(false);
    }
  };

  const handleAbrirEstornar = (rec: Recebimento) => {
    setRecebimentoSelecionado(rec);
    setMotivoEstorno('');
    setShowEstornar(true);
  };

  const handleEstornar = async () => {
    if (!recebimentoSelecionado || !motivoEstorno.trim()) {
      alert('Por favor, informe o motivo do estorno.');
      return;
    }

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${recebimentoSelecionado.id}/estornar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: motivoEstorno.trim() }),
        }
      );

      if (response.ok) {
        alert(`Recebimento ${recebimentoSelecionado.numero} estornado com sucesso! O saldo foi revertido no contrato.`);
        setShowEstornar(false);
        setMotivoEstorno('');
        carregarRecebimentos();
      } else {
        const error = await response.json();
        alert(`Erro ao estornar recebimento: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao estornar recebimento:', error);
      alert('Erro ao estornar recebimento.');
    } finally {
      setProcessando(false);
    }
  };

  const handleAbrirExcluir = (rec: Recebimento) => {
    setRecebimentoSelecionado(rec);
    setShowExcluir(true);
  };

  const handleExcluir = async () => {
    if (!recebimentoSelecionado) return;

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${recebimentoSelecionado.id}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        alert(`Recebimento ${recebimentoSelecionado.numero} excluído com sucesso!`);
        setShowExcluir(false);
        carregarRecebimentos();
      } else {
        const error = await response.json();
        alert(`Erro ao excluir: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir recebimento');
    } finally {
      setProcessando(false);
    }
  };

  const recebimentosFiltrados = recebimentos.filter(rec => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      rec.numero.toLowerCase().includes(termo) ||
      rec.ordem_fornecimento?.numero?.toLowerCase().includes(termo) ||
      rec.ordem_fornecimento?.fornecedor?.razao_social?.toLowerCase().includes(termo)
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
      {/* Debug: Mostrar permissão (remover depois) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 p-2 rounded text-xs">
          Debug: podeCancelarEstornar = {podeCancelarEstornar ? 'SIM' : 'NÃO'}
        </div>
      )}
      
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
            <h1 className="text-2xl font-bold text-gray-900">Recebimentos</h1>
            <p className="text-gray-500">Conferência e aceite de materiais/serviços</p>
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
                  placeholder="Buscar por número, ordem ou fornecedor..."
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
                <SelectItem value="PENDENTE">Pendente Conferência</SelectItem>
                <SelectItem value="CONFERIDO">Conferido</SelectItem>
                <SelectItem value="ACEITO">Aceito</SelectItem>
                <SelectItem value="ACEITO_PARCIAL">Aceito Parcialmente</SelectItem>
                <SelectItem value="REJEITADO">Rejeitado</SelectItem>
                <SelectItem value="ESTORNADO">Estornado</SelectItem>
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
                <TableHead>Ordem</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recebimentosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    Nenhum recebimento encontrado
                  </TableCell>
                </TableRow>
              ) : (
                recebimentosFiltrados.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-medium">{rec.numero}</TableCell>
                    <TableCell>{rec.ordem_fornecimento?.numero || '-'}</TableCell>
                    <TableCell>{rec.ordem_fornecimento?.fornecedor?.razao_social || '-'}</TableCell>
                    <TableCell>{formatarData(rec.data_recebimento)}</TableCell>
                    <TableCell>{rec.numero_nota_fiscal || '-'}</TableCell>
                    <TableCell>{formatarMoeda(rec.valor_total_recebido)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[rec.status]}>
                        {STATUS_LABELS[rec.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalhes(rec)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {rec.status === 'PENDENTE' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => handleConferir(rec.id)}
                            disabled={processando}
                          >
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
                        )}
                        {(rec.status === 'CONFERIDO' || rec.status === 'PENDENTE') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => handleAbrirAceitar(rec)}
                              disabled={rec.itens?.some((i) => i.tipo_item === 'PERMANENTE') && !podeReceberPatrimonio}
                              title={rec.itens?.some((i) => i.tipo_item === 'PERMANENTE') && !podeReceberPatrimonio
                                ? 'Requer permissão "Receber patrimônio" para aceitar itens permanentes'
                                : 'Aceitar recebimento'}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleAbrirRejeitar(rec)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {/* Botão de estornar (apenas para recebimentos ACEITO e usuários autorizados) */}
                        {rec.status === 'ACEITO' && podeCancelarEstornar && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-orange-600 hover:text-orange-700"
                            onClick={() => handleAbrirEstornar(rec)}
                            title="Estornar recebimento (reverte baixa no contrato)"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Botão de excluir - apenas para PENDENTE ou REJEITADO */}
                        {(rec.status === 'PENDENTE' || rec.status === 'REJEITADO') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleAbrirExcluir(rec)}
                            title="Excluir recebimento permanentemente"
                          >
                            <Trash2 className="h-4 w-4" />
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
            <DialogTitle>Recebimento {recebimentoSelecionado?.numero}</DialogTitle>
            <DialogDescription>
              Detalhes do recebimento
            </DialogDescription>
          </DialogHeader>
          
          {recebimentoSelecionado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div>
                    <Badge className={STATUS_COLORS[recebimentoSelecionado.status]}>
                      {STATUS_LABELS[recebimentoSelecionado.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Tipo</label>
                  <p>{recebimentoSelecionado.tipo === 'DEFINITIVO' ? 'Recebimento Definitivo' : 'Recebimento Provisório'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Ordem de Fornecimento</label>
                  <p>{recebimentoSelecionado.ordem_fornecimento?.numero || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Fornecedor</label>
                  <p>{recebimentoSelecionado.ordem_fornecimento?.fornecedor?.razao_social || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Data do Recebimento</label>
                  <p>{formatarData(recebimentoSelecionado.data_recebimento)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Nota Fiscal</label>
                  <p>{recebimentoSelecionado.numero_nota_fiscal || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Valor Recebido</label>
                  <p className="font-semibold">{formatarMoeda(recebimentoSelecionado.valor_total_recebido)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Valor Aceito</label>
                  <p className="font-semibold text-green-600">{formatarMoeda(recebimentoSelecionado.valor_aceito)}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500 mb-2 block">Itens</label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Esperado</TableHead>
                      <TableHead>Recebido</TableHead>
                      <TableHead>Aceito</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recebimentoSelecionado.itens?.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell>
                          <Badge variant={item.tipo_item === 'PERMANENTE' ? 'secondary' : 'outline'} className={item.tipo_item === 'PERMANENTE' ? 'bg-slate-100 text-slate-800' : ''}>
                            {item.tipo_item === 'PERMANENTE' ? 'Permanente' : 'Consumo'}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.quantidade_esperada}</TableCell>
                        <TableCell>{item.quantidade_recebida}</TableCell>
                        <TableCell>
                          <Badge variant={item.quantidade_aceita > 0 ? 'default' : 'secondary'}>
                            {item.quantidade_aceita}
                          </Badge>
                        </TableCell>
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

      {/* Modal Aceitar */}
      <Dialog open={showAceitar} onOpenChange={setShowAceitar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-600">Aceitar Recebimento</DialogTitle>
            <DialogDescription>
              Ao aceitar, será realizada a baixa definitiva no contrato.
            </DialogDescription>
          </DialogHeader>
          
          {recebimentoSelecionado && (
            <div className="space-y-4">
              {recebimentoSelecionado.itens?.some((i) => i.tipo_item === 'PERMANENTE') && !podeReceberPatrimonio && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-800 text-sm">
                  Este recebimento contém itens permanentes (patrimônio). Você não tem permissão para aceitar. Solicite ao administrador a permissão &quot;Receber patrimônio&quot;.
                </div>
              )}
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="font-medium">{recebimentoSelecionado.numero}</p>
                <p className="text-sm text-gray-600">
                  Valor: {formatarMoeda(recebimentoSelecionado.valor_total_recebido)}
                </p>
                <p className="text-sm text-gray-600">
                  {recebimentoSelecionado.itens?.length || 0} item(s)
                </p>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg text-sm">
                <p className="font-medium text-yellow-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Atenção
                </p>
                <p className="text-yellow-700">
                  Ao aceitar o recebimento:
                </p>
                <ul className="list-disc list-inside text-yellow-700 mt-1">
                  <li>O saldo empenhado será convertido em entregue</li>
                  <li>A ordem de fornecimento será atualizada</li>
                  <li>Esta ação não pode ser desfeita</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAceitar(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAceitar}
              disabled={processando || (recebimentoSelecionado?.itens?.some((i) => i.tipo_item === 'PERMANENTE') && !podeReceberPatrimonio)}
              className="bg-green-600 hover:bg-green-700"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Aceite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={showRejeitar} onOpenChange={setShowRejeitar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Rejeitar Recebimento</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição.
            </DialogDescription>
          </DialogHeader>
          
          {recebimentoSelecionado && (
            <div className="space-y-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="font-medium">{recebimentoSelecionado.numero}</p>
                <p className="text-sm text-gray-600">
                  {recebimentoSelecionado.ordem_fornecimento?.fornecedor?.razao_social}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Motivo da Rejeição *</label>
                <Textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Descreva o motivo da rejeição..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejeitar(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleRejeitar} 
              disabled={processando || !motivoRejeicao.trim()} 
              variant="destructive"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Estornar Recebimento */}
      <Dialog open={showEstornar} onOpenChange={setShowEstornar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-orange-600">Estornar Recebimento</DialogTitle>
            <DialogDescription>
              Informe o motivo do estorno do recebimento {recebimentoSelecionado?.numero}.
            </DialogDescription>
          </DialogHeader>
          {recebimentoSelecionado && (
            <div className="space-y-4">
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <p className="font-medium text-orange-900">⚠️ Atenção!</p>
                <p className="text-sm text-orange-700 mt-1">
                  O estorno deste recebimento irá reverter a baixa realizada no contrato.
                  O saldo que estava como "entregue" voltará para "disponível".
                  Esta ação requer permissão especial e não pode ser desfeita facilmente.
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-gray-700">Recebimento:</p>
                <p className="text-sm text-gray-600">{recebimentoSelecionado.numero}</p>
                <p className="text-sm text-gray-600 mt-1">
                  Valor: {formatarMoeda(recebimentoSelecionado.valor_aceito)}
                </p>
                {recebimentoSelecionado.ordem_fornecimento && (
                  <p className="text-sm text-gray-600">
                    Ordem: {recebimentoSelecionado.ordem_fornecimento.numero}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Motivo do Estorno <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Descreva o motivo do estorno..."
                  value={motivoEstorno}
                  onChange={(e) => setMotivoEstorno(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEstornar(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleEstornar} 
              disabled={processando || !motivoEstorno.trim()}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <RotateCcw className="h-4 w-4 mr-2" />
              Confirmar Estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir Recebimento */}
      <Dialog open={showExcluir} onOpenChange={setShowExcluir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Recebimento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir permanentemente este recebimento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {recebimentoSelecionado && (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="font-medium">{recebimentoSelecionado.numero}</p>
              <p className="text-sm text-gray-600">
                Ordem: {recebimentoSelecionado.ordem_fornecimento?.numero || '-'}
              </p>
              <p className="text-sm text-red-700 font-semibold mt-2">
                ⚠️ Atenção: Esta ação é irreversível!
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExcluir(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleExcluir} 
              disabled={processando} 
              variant="destructive"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RecebimentosPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <RecebimentosList />
    </ModuleGuard>
  );
}
