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
  Clock,
  Download,
  ClipboardCheck,
  Trash2,
  Edit,
  History,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
  data_cancelamento?: string;
  motivo_cancelamento?: string;
  valor_total: number;
  valor_entregue: number;
  usuario_emitente_nome: string;
  local_entrega?: string | null;
  prazo_entrega_dias?: number;
  observacoes?: string;
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
    item_contrato_id: string;
    numero_item: number;
    descricao: string;
    quantidade: number;
    quantidade_entregue: number;
    valor_unitario: number;
    valor_total: number;
    unidade_medida?: string;
  }[];
}

interface HistoricoOrdem {
  id: string;
  tipo_acao: string;
  descricao: string;
  status_anterior?: string;
  status_novo?: string;
  usuario_nome?: string;
  usuario_tipo?: string;
  created_at: string;
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

const ACAO_ICONS: Record<string, string> = {
  CRIADA: '📝',
  EDITADA: '✏️',
  EMITIDA: '📄',
  ENVIADA: '📤',
  REENVIADA: '🔄',
  CANCELADA: '❌',
  REATIVADA: '♻️',
  VISUALIZADA_FORNECEDOR: '👁️',
  ACEITA_FORNECEDOR: '✅',
  RECUSADA_FORNECEDOR: '🚫',
  ENTREGA_REGISTRADA: '📦',
  ENTREGA_PARCIAL: '📦',
  ENTREGA_COMPLETA: '🎉',
  ENTREGA_ESTORNADA: '↩️',
  PDF_GERADO: '📋',
  PDF_BAIXADO: '⬇️',
  NOTIFICACAO_ENVIADA: '🔔',
  EMAIL_ENVIADO: '📧',
  OBSERVACAO_ADICIONADA: '💬',
  ITEM_ALTERADO: '🔧',
};

function OrdensList() {
  const [ordens, setOrdens] = useState<OrdemFornecimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('__all__');
  const [busca, setBusca] = useState('');
  
  // Modais
  const [ordemSelecionada, setOrdemSelecionada] = useState<OrdemFornecimento | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showRecebimento, setShowRecebimento] = useState(false);
  const [showExcluir, setShowExcluir] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);
  const [showEditar, setShowEditar] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  
  // Envio
  const [emailFornecedor, setEmailFornecedor] = useState('');
  const [observacoesEnvio, setObservacoesEnvio] = useState('');
  const [isReenvio, setIsReenvio] = useState(false);
  
  // Cancelamento
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  
  // Edição
  const [formEditar, setFormEditar] = useState({
    local_entrega: '',
    data_entrega_prevista: '',
    prazo_entrega_dias: '',
    observacoes: '',
  });
  
  // Histórico
  const [historico, setHistorico] = useState<HistoricoOrdem[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  
  const [processando, setProcessando] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null);
  
  // Formulário de recebimento
  const [formRecebimento, setFormRecebimento] = useState({
    tipo: 'PROVISORIO',
    numero_nota_fiscal: '',
    serie_nota_fiscal: '',
    data_nota_fiscal: '',
    chave_nfe: '',
    valor_nota_fiscal: '',
    local_recebimento: '',
    observacoes: '',
    itens: [] as Array<{
      item_contrato_id: string;
      quantidade_recebida: number;
      observacao?: string;
    }>,
  });

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

  const carregarHistorico = async (ordemId: string) => {
    setCarregandoHistorico(true);
    try {
      const response = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/historico`);
      if (response.ok) {
        const data = await response.json();
        setHistorico(data);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setCarregandoHistorico(false);
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

  const formatarDataHora = (data: string) => {
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handlers
  const handleVerDetalhes = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setShowDetalhes(true);
  };

  const handleAbrirEnviar = (ordem: OrdemFornecimento, reenvio: boolean = false) => {
    setOrdemSelecionada(ordem);
    setEmailFornecedor(ordem.fornecedor?.email || '');
    setObservacoesEnvio('');
    setIsReenvio(reenvio);
    setShowEnviar(true);
  };

  const handleAbrirCancelar = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setMotivoCancelamento('');
    setShowCancelar(true);
  };

  const handleAbrirEditar = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setFormEditar({
      local_entrega: ordem.local_entrega || '',
      data_entrega_prevista: ordem.data_entrega_prevista ? ordem.data_entrega_prevista.split('T')[0] : '',
      prazo_entrega_dias: ordem.prazo_entrega_dias?.toString() || '',
      observacoes: ordem.observacoes || '',
    });
    setShowEditar(true);
  };

  const handleAbrirHistorico = async (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setShowHistorico(true);
    await carregarHistorico(ordem.id);
  };

  const handleAbrirRecebimento = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    const itensPreenchidos = ordem.itens.map(item => ({
      item_contrato_id: item.item_contrato_id,
      quantidade_recebida: item.quantidade - item.quantidade_entregue,
      observacao: '',
    }));
    
    setFormRecebimento({
      tipo: 'PROVISORIO',
      numero_nota_fiscal: '',
      serie_nota_fiscal: '',
      data_nota_fiscal: '',
      chave_nfe: '',
      valor_nota_fiscal: '',
      local_recebimento: ordem.local_entrega || '',
      observacoes: '',
      itens: itensPreenchidos,
    });
    setShowRecebimento(true);
  };

  const handleAbrirExcluir = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setShowExcluir(true);
  };

  // Ações
  const handleEnviar = async () => {
    if (!ordemSelecionada) return;
    
    setProcessando(true);
    try {
      const endpoint = isReenvio 
        ? `${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}/reenviar`
        : `${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}/enviar`;
      
      const response = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          email_fornecedor: emailFornecedor,
          observacoes: observacoesEnvio,
        }),
      });

      if (response.ok) {
        alert(`Ordem ${isReenvio ? 'reenviada' : 'enviada'} com sucesso!`);
        setShowEnviar(false);
        carregarOrdens();
      } else {
        const error = await response.json();
        alert(`Erro ao ${isReenvio ? 'reenviar' : 'enviar'}: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro ao enviar ordem');
    } finally {
      setProcessando(false);
    }
  };

  const handleCancelar = async () => {
    if (!ordemSelecionada) return;
    
    if (!motivoCancelamento.trim() || motivoCancelamento.trim().length < 10) {
      alert('Por favor, informe o motivo do cancelamento (mínimo 10 caracteres)');
      return;
    }

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}/cancelar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: motivoCancelamento.trim() }),
        }
      );

      if (response.ok) {
        const foiEnviada = ['ENVIADA', 'EM_ATENDIMENTO', 'ATENDIDA_PARCIAL'].includes(ordemSelecionada.status);
        alert(
          `Ordem ${ordemSelecionada.numero} cancelada com sucesso!` + 
          (foiEnviada ? '\n\nO fornecedor foi notificado sobre o cancelamento.' : '')
        );
        setShowCancelar(false);
        carregarOrdens();
      } else {
        const error = await response.json();
        alert(`Erro ao cancelar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      alert('Erro ao cancelar ordem');
    } finally {
      setProcessando(false);
    }
  };

  const handleEditar = async () => {
    if (!ordemSelecionada) return;

    setProcessando(true);
    try {
      const payload: any = {};
      
      if (formEditar.local_entrega !== ordemSelecionada.local_entrega) {
        payload.local_entrega = formEditar.local_entrega;
      }
      if (formEditar.observacoes !== ordemSelecionada.observacoes) {
        payload.observacoes = formEditar.observacoes;
      }
      if (formEditar.data_entrega_prevista) {
        payload.data_entrega_prevista = formEditar.data_entrega_prevista;
      }
      if (formEditar.prazo_entrega_dias) {
        payload.prazo_entrega_dias = Number(formEditar.prazo_entrega_dias);
      }

      const response = await authFetch(
        `${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        alert('Ordem atualizada com sucesso!');
        setShowEditar(false);
        carregarOrdens();
      } else {
        const error = await response.json();
        alert(`Erro ao editar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao editar:', error);
      alert('Erro ao editar ordem');
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluir = async () => {
    if (!ordemSelecionada) return;

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        alert(`Ordem ${ordemSelecionada.numero} excluída com sucesso!`);
        setShowExcluir(false);
        carregarOrdens();
      } else {
        const error = await response.json();
        alert(`Erro ao excluir: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir ordem');
    } finally {
      setProcessando(false);
    }
  };

  const handleCriarRecebimento = async () => {
    if (!ordemSelecionada) return;
    
    const itensComQuantidade = formRecebimento.itens.filter(item => item.quantidade_recebida > 0);
    if (itensComQuantidade.length === 0) {
      alert('É necessário informar quantidades recebidas para pelo menos um item');
      return;
    }

    setProcessando(true);
    try {
      const payload: any = {
        ordem_fornecimento_id: ordemSelecionada.id,
        tipo: formRecebimento.tipo,
        itens: itensComQuantidade.map(item => ({
          item_contrato_id: item.item_contrato_id,
          quantidade_recebida: Number(item.quantidade_recebida),
          observacao: item.observacao || undefined,
        })),
      };

      if (formRecebimento.numero_nota_fiscal.trim()) {
        payload.numero_nota_fiscal = formRecebimento.numero_nota_fiscal.trim();
      }
      if (formRecebimento.serie_nota_fiscal.trim()) {
        payload.serie_nota_fiscal = formRecebimento.serie_nota_fiscal.trim();
      }
      if (formRecebimento.data_nota_fiscal) {
        payload.data_nota_fiscal = formRecebimento.data_nota_fiscal;
      }
      if (formRecebimento.chave_nfe.trim()) {
        payload.chave_nfe = formRecebimento.chave_nfe.trim();
      }
      if (formRecebimento.valor_nota_fiscal) {
        payload.valor_nota_fiscal = Number(formRecebimento.valor_nota_fiscal);
      }
      if (formRecebimento.local_recebimento.trim()) {
        payload.local_recebimento = formRecebimento.local_recebimento.trim();
      }
      if (formRecebimento.observacoes.trim()) {
        payload.observacoes = formRecebimento.observacoes.trim();
      }

      const response = await authFetch(`${API_URL}/api/almoxarifado/recebimentos`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const recebimentoCriado = await response.json();
        alert(`Recebimento ${recebimentoCriado.numero} criado com sucesso!`);
        setShowRecebimento(false);
        carregarOrdens();
      } else {
        const error = await response.json();
        alert(`Erro ao criar recebimento: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao criar recebimento:', error);
      alert('Erro ao criar recebimento');
    } finally {
      setProcessando(false);
    }
  };

  const handleDownloadPDF = async (ordemId: string, ordemNumero: string) => {
    try {
      setGerandoPDF(ordemId);
      const response = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/pdf`);
      
      if (!response.ok) {
        throw new Error('Erro ao gerar PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ordem_${ordemNumero.replace(/\//g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      alert('Erro ao baixar PDF da ordem');
    } finally {
      setGerandoPDF(null);
    }
  };

  const getPercentualAtendimento = (ordem: OrdemFornecimento) => {
    if (Number(ordem.valor_total) === 0) return 0;
    return (Number(ordem.valor_entregue) / Number(ordem.valor_total)) * 100;
  };

  // Determina quais ações estão disponíveis para cada status
  const getAcoesDisponiveis = (ordem: OrdemFornecimento) => {
    const acoes = {
      verDetalhes: true,
      baixarPDF: true,
      verHistorico: true,
      enviar: false,
      reenviar: false,
      editar: false,
      registrarRecebimento: false,
      excluir: false,
      cancelar: false,
    };

    switch (ordem.status) {
      case 'RASCUNHO':
      case 'EMITIDA':
        acoes.enviar = true;
        acoes.editar = true;
        acoes.excluir = true;
        break;
      case 'ENVIADA':
      case 'EM_ATENDIMENTO':
        acoes.reenviar = true;
        acoes.editar = true;
        acoes.cancelar = true;
        acoes.registrarRecebimento = ordem.itens.some(item => item.quantidade - item.quantidade_entregue > 0);
        break;
      case 'ATENDIDA_PARCIAL':
        acoes.reenviar = true;
        acoes.editar = true;
        acoes.cancelar = true;
        acoes.registrarRecebimento = ordem.itens.some(item => item.quantidade - item.quantidade_entregue > 0);
        break;
      case 'ATENDIDA':
        // Só pode ver detalhes, PDF e histórico
        break;
      case 'CANCELADA':
        // Só pode ver detalhes, PDF e histórico
        break;
    }

    return acoes;
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
                <SelectItem value="CANCELADA">Cancelada</SelectItem>
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
                ordensFiltradas.map((ordem) => {
                  const acoes = getAcoesDisponiveis(ordem);
                  return (
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
                              className={`h-2 rounded-full ${ordem.status === 'CANCELADA' ? 'bg-red-500' : 'bg-green-500'}`}
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
                          {/* Ver Detalhes */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVerDetalhes(ordem)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          {/* Histórico */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAbrirHistorico(ordem)}
                            title="Ver histórico"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          
                          {/* Baixar PDF */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleDownloadPDF(ordem.id, ordem.numero)}
                            disabled={gerandoPDF === ordem.id}
                            title="Baixar PDF"
                          >
                            {gerandoPDF === ordem.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                          
                          {/* Enviar */}
                          {acoes.enviar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700"
                              onClick={() => handleAbrirEnviar(ordem, false)}
                              title="Enviar ao fornecedor"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* Reenviar */}
                          {acoes.reenviar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700"
                              onClick={() => handleAbrirEnviar(ordem, true)}
                              title="Reenviar ao fornecedor"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* Editar */}
                          {acoes.editar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-600 hover:text-amber-700"
                              onClick={() => handleAbrirEditar(ordem)}
                              title="Editar ordem"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* Registrar Recebimento */}
                          {acoes.registrarRecebimento && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-purple-600 hover:text-purple-700"
                              onClick={() => handleAbrirRecebimento(ordem)}
                              title="Registrar Recebimento"
                            >
                              <Package className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* Cancelar */}
                          {acoes.cancelar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-orange-600 hover:text-orange-700"
                              onClick={() => handleAbrirCancelar(ordem)}
                              title="Cancelar ordem"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* Excluir */}
                          {acoes.excluir && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleAbrirExcluir(ordem)}
                              title="Excluir ordem"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
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
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPDF(ordemSelecionada.id, ordemSelecionada.numero)}
                  disabled={gerandoPDF === ordemSelecionada.id}
                >
                  {gerandoPDF === ordemSelecionada.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando PDF...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Baixar PDF
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDetalhes(false);
                    handleAbrirHistorico(ordemSelecionada);
                  }}
                >
                  <History className="h-4 w-4 mr-2" />
                  Ver Histórico
                </Button>
              </div>

              {/* Alerta de Cancelamento */}
              {ordemSelecionada.status === 'CANCELADA' && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <div className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">Ordem Cancelada</p>
                      <p className="text-sm text-red-700">{ordemSelecionada.motivo_cancelamento}</p>
                      {ordemSelecionada.data_cancelamento && (
                        <p className="text-xs text-red-600 mt-1">
                          Em {formatarDataHora(ordemSelecionada.data_cancelamento)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
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

      {/* Modal Histórico */}
      <Dialog open={showHistorico} onOpenChange={setShowHistorico}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico da Ordem {ordemSelecionada?.numero}
            </DialogTitle>
            <DialogDescription>
              Timeline de todas as ações realizadas nesta ordem
            </DialogDescription>
          </DialogHeader>
          
          {carregandoHistorico ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum histórico encontrado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {historico.map((item, index) => (
                <div 
                  key={item.id} 
                  className={`flex gap-4 ${index !== historico.length - 1 ? 'pb-4 border-b' : ''}`}
                >
                  <div className="text-2xl">
                    {ACAO_ICONS[item.tipo_acao] || '📋'}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.descricao}</p>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <span>{formatarDataHora(item.created_at)}</span>
                      {item.usuario_nome && (
                        <>
                          <span>•</span>
                          <span>{item.usuario_nome}</span>
                        </>
                      )}
                      {item.status_novo && (
                        <>
                          <span>•</span>
                          <Badge className={STATUS_COLORS[item.status_novo]} variant="outline">
                            {STATUS_LABELS[item.status_novo]}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Enviar/Reenviar */}
      <Dialog open={showEnviar} onOpenChange={setShowEnviar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isReenvio ? 'Reenviar' : 'Enviar'} Ordem ao Fornecedor</DialogTitle>
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
                <Label>Email do Fornecedor</Label>
                <Input
                  type="email"
                  value={emailFornecedor}
                  onChange={(e) => setEmailFornecedor(e.target.value)}
                  placeholder="email@fornecedor.com"
                />
              </div>

              <div>
                <Label>Observações</Label>
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
              {isReenvio ? <RefreshCw className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {isReenvio ? 'Reenviar' : 'Enviar'} Ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cancelar */}
      <Dialog open={showCancelar} onOpenChange={setShowCancelar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-orange-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Cancelar Ordem
            </DialogTitle>
            <DialogDescription>
              {ordemSelecionada && ['ENVIADA', 'EM_ATENDIMENTO', 'ATENDIDA_PARCIAL'].includes(ordemSelecionada.status) 
                ? 'O fornecedor será notificado sobre o cancelamento.'
                : 'Esta ação irá cancelar a ordem de fornecimento.'
              }
            </DialogDescription>
          </DialogHeader>
          
          {ordemSelecionada && (
            <div className="space-y-4">
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <p className="font-medium">{ordemSelecionada.numero}</p>
                <p className="text-sm text-gray-600">
                  Fornecedor: {ordemSelecionada.fornecedor?.razao_social}
                </p>
                <p className="text-sm text-gray-600">
                  Valor: {formatarMoeda(ordemSelecionada.valor_total)}
                </p>
                {ordemSelecionada.status === 'ATENDIDA_PARCIAL' && (
                  <p className="text-sm text-orange-700 font-medium mt-2">
                    ⚠️ Esta ordem já possui entregas parciais. Os recebimentos serão estornados.
                  </p>
                )}
              </div>

              <div>
                <Label>Motivo do Cancelamento *</Label>
                <Textarea
                  value={motivoCancelamento}
                  onChange={(e) => setMotivoCancelamento(e.target.value)}
                  placeholder="Descreva o motivo do cancelamento (mínimo 10 caracteres)..."
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {motivoCancelamento.length}/10 caracteres mínimos
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelar(false)}>
              Voltar
            </Button>
            <Button 
              onClick={handleCancelar} 
              disabled={processando || motivoCancelamento.trim().length < 10}
              variant="destructive"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <XCircle className="h-4 w-4 mr-2" />
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar */}
      <Dialog open={showEditar} onOpenChange={setShowEditar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-amber-600" />
              Editar Ordem {ordemSelecionada?.numero}
            </DialogTitle>
            <DialogDescription>
              Altere os dados da ordem de fornecimento
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Local de Entrega</Label>
              <Input
                value={formEditar.local_entrega}
                onChange={(e) => setFormEditar({ ...formEditar, local_entrega: e.target.value })}
                placeholder="Ex: Almoxarifado Central..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Entrega Prevista</Label>
                <Input
                  type="date"
                  value={formEditar.data_entrega_prevista}
                  onChange={(e) => setFormEditar({ ...formEditar, data_entrega_prevista: e.target.value })}
                />
              </div>
              <div>
                <Label>Prazo (dias úteis)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formEditar.prazo_entrega_dias}
                  onChange={(e) => setFormEditar({ ...formEditar, prazo_entrega_dias: e.target.value })}
                  placeholder="Ex: 15"
                />
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={formEditar.observacoes}
                onChange={(e) => setFormEditar({ ...formEditar, observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditar(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditar} disabled={processando}>
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Edit className="h-4 w-4 mr-2" />
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Criar Recebimento */}
      <Dialog open={showRecebimento} onOpenChange={setShowRecebimento}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-purple-600">Registrar Recebimento</DialogTitle>
            <DialogDescription>
              Registre o recebimento de materiais/serviços da ordem {ordemSelecionada?.numero}
            </DialogDescription>
          </DialogHeader>
          
          {ordemSelecionada && (
            <div className="space-y-4">
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="font-medium">{ordemSelecionada.numero}</p>
                <p className="text-sm text-gray-600">
                  Fornecedor: {ordemSelecionada.fornecedor?.razao_social}
                </p>
                <p className="text-sm text-gray-600">
                  Valor Total: {formatarMoeda(ordemSelecionada.valor_total)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Recebimento *</Label>
                  <Select
                    value={formRecebimento.tipo}
                    onValueChange={(value) => setFormRecebimento({ ...formRecebimento, tipo: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PROVISORIO">Provisório</SelectItem>
                      <SelectItem value="DEFINITIVO">Definitivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Local de Recebimento</Label>
                  <Input
                    placeholder="Ex: Almoxarifado Central..."
                    value={formRecebimento.local_recebimento}
                    onChange={(e) => setFormRecebimento({ ...formRecebimento, local_recebimento: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Dados da Nota Fiscal</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Número da NF</Label>
                    <Input
                      placeholder="000000000"
                      value={formRecebimento.numero_nota_fiscal}
                      onChange={(e) => setFormRecebimento({ ...formRecebimento, numero_nota_fiscal: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Série</Label>
                    <Input
                      placeholder="001"
                      value={formRecebimento.serie_nota_fiscal}
                      onChange={(e) => setFormRecebimento({ ...formRecebimento, serie_nota_fiscal: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Data da NF</Label>
                    <Input
                      type="date"
                      value={formRecebimento.data_nota_fiscal}
                      onChange={(e) => setFormRecebimento({ ...formRecebimento, data_nota_fiscal: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Valor da NF</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formRecebimento.valor_nota_fiscal}
                      onChange={(e) => setFormRecebimento({ ...formRecebimento, valor_nota_fiscal: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Itens Recebidos</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Qtd Ordem</TableHead>
                        <TableHead>Já Entregue</TableHead>
                        <TableHead>Qtd Recebida *</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordemSelecionada.itens.map((itemOrdem, index) => {
                        const itemRecebimento = formRecebimento.itens.find(
                          i => i.item_contrato_id === itemOrdem.item_contrato_id
                        ) || { item_contrato_id: itemOrdem.item_contrato_id, quantidade_recebida: 0, observacao: '' };
                        const quantidadePendente = itemOrdem.quantidade - itemOrdem.quantidade_entregue;
                        
                        return (
                          <TableRow key={itemOrdem.item_contrato_id || index}>
                            <TableCell>{itemOrdem.numero_item}</TableCell>
                            <TableCell>{itemOrdem.descricao}</TableCell>
                            <TableCell>{itemOrdem.quantidade}</TableCell>
                            <TableCell>{itemOrdem.quantidade_entregue}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={quantidadePendente}
                                  placeholder="0"
                                  value={itemRecebimento.quantidade_recebida || ''}
                                  onChange={(e) => {
                                    const novaQuantidade = Number(e.target.value) || 0;
                                    const novosItens = formRecebimento.itens.filter(
                                      i => i.item_contrato_id !== itemOrdem.item_contrato_id
                                    );
                                    if (novaQuantidade > 0) {
                                      novosItens.push({
                                        item_contrato_id: itemOrdem.item_contrato_id,
                                        quantidade_recebida: novaQuantidade,
                                        observacao: itemRecebimento.observacao || '',
                                      });
                                    }
                                    setFormRecebimento({ ...formRecebimento, itens: novosItens });
                                  }}
                                  className="w-24"
                                />
                                <span className="text-xs text-gray-500">
                                  (pend: {quantidadePendente})
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <Label>Observações Gerais</Label>
                <Textarea
                  placeholder="Observações sobre o recebimento..."
                  value={formRecebimento.observacoes}
                  onChange={(e) => setFormRecebimento({ ...formRecebimento, observacoes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecebimento(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCriarRecebimento}
              disabled={processando}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Package className="h-4 w-4 mr-2" />
              Registrar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir */}
      <Dialog open={showExcluir} onOpenChange={setShowExcluir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Ordem</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir permanentemente esta ordem? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {ordemSelecionada && (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="font-medium">{ordemSelecionada.numero}</p>
              <p className="text-sm text-gray-600">
                Fornecedor: {ordemSelecionada.fornecedor?.razao_social || '-'}
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

export default function OrdensPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <OrdensList />
    </ModuleGuard>
  );
}
