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
  AlertTriangle,
  Mail,
  MessageCircle,
  Receipt,
  Link2,
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
import { API_URL, authFetch, formatarDataHoraBR } from '@/lib/api';

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
  caminho_pdf?: string | null;
  codigo_validacao?: string | null;
  numeros_empenhos?: string[] | null;
  contrato_id?: string;
  contrato?: {
    id?: string;
    numero_contrato: string;
    ano?: number;
    fornecedor_cnpj?: string;
  };
  fornecedor?: {
    razao_social: string;
    email?: string;
    representante_telefone?: string;
    telefone?: string;
  };
  email_fornecedor?: string | null;
  orgao?: {
    nome: string;
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
  data_evento?: string | null;
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
  ENVIADA: 'Aguardando recebimento',
  EM_ATENDIMENTO: 'Em Atendimento',
  ATENDIDA_PARCIAL: 'Parcialmente Atendida',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
};

const TIPO_MOVIMENTO_LABELS: Record<string, string> = {
  PEDIDO_CRIADO: 'PEDIDO CRIADO',
  PEDIDO_AUTORIZADO: 'PEDIDO AUTORIZADO',
  CRIADA: 'ORDEM CRIADA',
  EDITADA: 'ORDEM EDITADA',
  EMITIDA: 'ORDEM EMITIDA',
  ENVIADA: 'ORDEM ENVIADA',
  REENVIADA: 'ORDEM REENVIADA',
  CANCELADA: 'ORDEM CANCELADA',
  REATIVADA: 'ORDEM REATIVADA',
  VISUALIZADA_FORNECEDOR: 'VISUALIZADA PELO FORNECEDOR',
  ACEITA_FORNECEDOR: 'ACEITA PELO FORNECEDOR',
  RECUSADA_FORNECEDOR: 'RECUSADA PELO FORNECEDOR',
  ENTREGA_REGISTRADA: 'ENTREGA REGISTRADA',
  ENTREGA_PARCIAL: 'ENTREGA PARCIAL',
  ENTREGA_COMPLETA: 'ENTREGA COMPLETA',
  ENTREGA_ESTORNADA: 'ENTREGA ESTORNADA',
  PDF_GERADO: 'PDF GERADO',
  PDF_BAIXADO: 'PDF BAIXADO',
  NOTIFICACAO_ENVIADA: 'NOTIFICAÇÃO ENVIADA',
  EMAIL_ENVIADO: 'EMAIL ENVIADO',
  OBSERVACAO_ADICIONADA: 'OBSERVAÇÃO ADICIONADA',
  ITEM_ALTERADO: 'ITEM ALTERADO',
};

const ACAO_ICONS: Record<string, string> = {
  PEDIDO_CRIADO: '📝',
  PEDIDO_AUTORIZADO: '✅',
  CRIADA: '📄',
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
  const [showExcluir, setShowExcluir] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);
  const [showEditar, setShowEditar] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  
  // Envio ao fornecedor (PDF assinado)
  const [showEnviarAoFornecedor, setShowEnviarAoFornecedor] = useState(false);
  const [emailEnviarFornecedor, setEmailEnviarFornecedor] = useState('');
  const [telefoneEnviarFornecedor, setTelefoneEnviarFornecedor] = useState('');
  const [enviandoTipo, setEnviandoTipo] = useState<'email' | 'whatsapp' | null>(null);
  
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

  // Vincular empenho
  const [showVincularEmpenho, setShowVincularEmpenho] = useState(false);
  const [empenhosDisponiveis, setEmpenhosDisponiveis] = useState<any[]>([]);
  const [empenhosSelecionados, setEmpenhosSelecionados] = useState<Set<string>>(new Set());
  const [loadingEmpenhosVincular, setLoadingEmpenhosVincular] = useState(false);
  const [salvandoEmpenhos, setSalvandoEmpenhos] = useState(false);
  const [anoEmpenho, setAnoEmpenho] = useState(new Date().getFullYear().toString());

  const [processando, setProcessando] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null);
  
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

  const formatarDataHora = (data: string) => formatarDataHoraBR(data);

  // Handlers
  const handleVerDetalhes = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setShowDetalhes(true);
  };

  const handleAbrirEnviarAoFornecedor = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setEmailEnviarFornecedor(ordem.fornecedor?.email || ordem.email_fornecedor || '');
    setTelefoneEnviarFornecedor(ordem.fornecedor?.representante_telefone || ordem.fornecedor?.telefone || '');
    setShowEnviarAoFornecedor(true);
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

  const handleAbrirExcluir = (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    setShowExcluir(true);
  };

  const handleEnviarAoFornecedor = async (tipo: 'email' | 'whatsapp') => {
    if (!ordemSelecionada) return;
    if (tipo === 'email' && !emailEnviarFornecedor.trim()) {
      alert('Informe o email do fornecedor');
      return;
    }
    if (tipo === 'whatsapp' && !telefoneEnviarFornecedor.trim()) {
      alert('Informe o telefone do fornecedor');
      return;
    }
    setEnviandoTipo(tipo);
    try {
      const body: Record<string, string> = { tipo };
      if (tipo === 'email') body.email_fornecedor = emailEnviarFornecedor.trim();
      if (tipo === 'whatsapp') body.telefone_fornecedor = telefoneEnviarFornecedor.replace(/\D/g, '');
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}/enviar-ao-fornecedor`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      if (response.ok) {
        const data = await response.json();
        const n = data?.notificacoes_fornecedor || {};
        const msg = tipo === 'email'
          ? (n.email ? 'Email enviado com sucesso!' : 'Email não pôde ser enviado.')
          : (n.whatsapp ? 'WhatsApp enviado com sucesso!' : 'WhatsApp não pôde ser enviado.');
        alert(msg);
        setShowEnviarAoFornecedor(false);
        carregarOrdens();
      } else {
        const err = await response.json();
        alert(`Erro: ${err.message || 'Erro ao enviar'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao enviar ao fornecedor');
    } finally {
      setEnviandoTipo(null);
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

  const abrirVincularEmpenho = async (ordem: OrdemFornecimento) => {
    setOrdemSelecionada(ordem);
    const sel = new Set<string>(ordem.numeros_empenhos ?? []);
    setEmpenhosSelecionados(sel);
    setEmpenhosDisponiveis([]);
    setShowVincularEmpenho(true);
    if (!ordem.contrato_id && !ordem.contrato?.id) return;
    const contratoId = ordem.contrato_id ?? ordem.contrato?.id;
    setLoadingEmpenhosVincular(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/empenhos?ano=${anoEmpenho}`);
      if (res.ok) {
        const data = await res.json();
        const grupos: any[] = data.grupos_exercicio ?? [];
        const compostos: any[] = [];
        for (const g of grupos) {
          if (g.empenhos_compostos?.length) compostos.push(...g.empenhos_compostos);
        }
        setEmpenhosDisponiveis(compostos);
      }
    } catch (e) { console.error(e); }
    setLoadingEmpenhosVincular(false);
  };

  const salvarEmpenhosOrdem = async () => {
    if (!ordemSelecionada) return;
    setSalvandoEmpenhos(true);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemSelecionada.id}/empenhos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empenhos: Array.from(empenhosSelecionados) }),
      });
      if (res.ok) {
        setShowVincularEmpenho(false);
        await carregarOrdens();
        if (ordemSelecionada) {
          const updated = ordens.find(o => o.id === ordemSelecionada.id);
          if (updated) setOrdemSelecionada({ ...updated, numeros_empenhos: Array.from(empenhosSelecionados) });
        }
        alert('Empenhos vinculados e PDF atualizado com sucesso!');
      } else {
        alert('Erro ao vincular empenhos');
      }
    } catch (e) { alert('Erro ao vincular empenhos'); }
    setSalvandoEmpenhos(false);
  };

  const toggleEmpenho = (numero: string) => {
    setEmpenhosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(numero)) next.delete(numero); else next.add(numero);
      return next;
    });
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
      enviarAoFornecedor: false,
      editar: false,
      registrarRecebimento: false,
      excluir: false,
      cancelar: false,
    };

    acoes.enviarAoFornecedor = !!ordem.fornecedor;

    switch (ordem.status) {
      case 'RASCUNHO':
      case 'EMITIDA':
        acoes.enviarAoFornecedor = !!ordem.fornecedor;
        acoes.editar = true;
        acoes.excluir = true;
        break;
      case 'ENVIADA':
      case 'EM_ATENDIMENTO':
        acoes.enviarAoFornecedor = !!ordem.fornecedor;
        acoes.editar = true;
        acoes.cancelar = true;
        acoes.registrarRecebimento = ordem.tipo !== 'SERVICO' && ordem.itens.some(item => item.quantidade - item.quantidade_entregue > 0);
        break;
      case 'ATENDIDA_PARCIAL':
        acoes.enviarAoFornecedor = !!ordem.fornecedor;
        acoes.editar = true;
        acoes.cancelar = true;
        acoes.registrarRecebimento = ordem.tipo !== 'SERVICO' && ordem.itens.some(item => item.quantidade - item.quantidade_entregue > 0);
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
                          
                          {/* Enviar/Reenviar ao fornecedor (PDF assinado) */}
                          {acoes.enviarAoFornecedor && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-700"
                              onClick={() => handleAbrirEnviarAoFornecedor(ordem)}
                              disabled={processando}
                              title={ordem.status === 'EMITIDA' ? 'Enviar ao fornecedor' : 'Reenviar ao fornecedor'}
                            >
                              <Send className="h-4 w-4" />
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
                          
                          {/* Registrar Recebimento - leva para página de recebimento da ordem */}
                          {acoes.registrarRecebimento && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-purple-600 hover:text-purple-700"
                              asChild
                              title="Ir para página de recebimento da ordem"
                            >
                              <Link href={`/orgao/almoxarifado/recebimentos/${ordem.id}`}>
                                <Package className="h-4 w-4" />
                              </Link>
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

              {/* Empenhos vinculados */}
              <div className="border rounded-lg p-3 bg-blue-50/50">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-blue-800">Notas de Empenho</label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setShowDetalhes(false); abrirVincularEmpenho(ordemSelecionada); }}
                  >
                    <Link2 className="h-3 w-3 mr-1" />
                    Vincular Empenho
                  </Button>
                </div>
                {ordemSelecionada.numeros_empenhos?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {ordemSelecionada.numeros_empenhos.map((num, i) => (
                      <Badge key={i} variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 font-mono text-xs">
                        #{num}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">Nenhum empenho vinculado</p>
                )}
              </div>

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
            <div className="relative">
              {/* Linha vertical da timeline */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
              
              <div className="space-y-0">
                {historico.map((item, index) => {
                  const dataExibicao = item.data_evento || item.created_at;
                  const horaExibicao = new Date(dataExibicao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  const isVerde = item.tipo_acao === 'PEDIDO_CRIADO' || index % 2 === 0;
                  return (
                    <div key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {/* Marcador na timeline */}
                      <div className="relative z-10 flex-shrink-0 w-12 flex justify-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isVerde ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          <span className="text-sm">{ACAO_ICONS[item.tipo_acao] || '📋'}</span>
                        </div>
                      </div>
                      
                      {/* Card do evento */}
                      <div className="flex-1 min-w-0">
                        <div className="bg-white border rounded-lg p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-gray-900">
                              {TIPO_MOVIMENTO_LABELS[item.tipo_acao] || item.tipo_acao}
                            </p>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Clock className="h-4 w-4" />
                              {formatarDataHora(dataExibicao)}
                            </div>
                          </div>
                          <div className="space-y-1 text-sm text-gray-600">
                            {ordemSelecionada && (
                              <>
                                <p><span className="font-medium text-gray-500">Nº do Pedido:</span> {ordemSelecionada.numero}</p>
                                <p><span className="font-medium text-gray-500">Fornecedor:</span> {ordemSelecionada.fornecedor?.razao_social || '-'}</p>
                                <p><span className="font-medium text-gray-500">Secretaria:</span> {ordemSelecionada.orgao?.nome || '-'}</p>
                              </>
                            )}
                            <p><span className="font-medium text-gray-500">Tipo de Movimento:</span> {TIPO_MOVIMENTO_LABELS[item.tipo_acao] || item.tipo_acao}</p>
                            <p><span className="font-medium text-gray-500">Descrição:</span> {item.descricao}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Enviar/Reenviar ao Fornecedor (PDF assinado digitalmente) */}
      <Dialog open={showEnviarAoFornecedor} onOpenChange={setShowEnviarAoFornecedor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              {ordemSelecionada?.status === 'EMITIDA' ? 'Enviar' : 'Reenviar'} Ordem ao Fornecedor
            </DialogTitle>
            <DialogDescription>
              A ordem será enviada com o PDF assinado digitalmente. Escolha o canal de envio:
            </DialogDescription>
          </DialogHeader>
          
          {ordemSelecionada && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
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
                  value={emailEnviarFornecedor}
                  onChange={(e) => setEmailEnviarFornecedor(e.target.value)}
                  placeholder="email@fornecedor.com"
                />
              </div>

              <div>
                <Label>Telefone (WhatsApp)</Label>
                <Input
                  type="tel"
                  value={telefoneEnviarFornecedor}
                  onChange={(e) => setTelefoneEnviarFornecedor(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => handleEnviarAoFornecedor('email')}
                  disabled={enviandoTipo !== null || !emailEnviarFornecedor.trim()}
                  className="flex-1"
                >
                  {enviandoTipo === 'email' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Enviar por Email
                </Button>
                <Button
                  onClick={() => handleEnviarAoFornecedor('whatsapp')}
                  disabled={enviandoTipo !== null || !telefoneEnviarFornecedor.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  {enviandoTipo === 'whatsapp' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <MessageCircle className="h-4 w-4 mr-2" />
                  )}
                  Enviar por WhatsApp
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnviarAoFornecedor(false)}>
              Fechar
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

      {/* Modal Vincular Empenho */}
      <Dialog open={showVincularEmpenho} onOpenChange={setShowVincularEmpenho}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />
              Vincular Empenho — {ordemSelecionada?.numero}
            </DialogTitle>
            <DialogDescription>
              Selecione os empenhos do Portal Fator Transparência. O PDF será regerado com os dados atualizados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Ano:</label>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={anoEmpenho}
                onChange={e => setAnoEmpenho(e.target.value)}
              >
                {[0, 1, 2].map(d => {
                  const y = (new Date().getFullYear() - d).toString();
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => ordemSelecionada && abrirVincularEmpenho({ ...ordemSelecionada, numeros_empenhos: ordemSelecionada.numeros_empenhos })}
                disabled={loadingEmpenhosVincular}
              >
                {loadingEmpenhosVincular ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buscar'}
              </Button>
            </div>

            {loadingEmpenhosVincular && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-500">Buscando empenhos...</span>
              </div>
            )}

            {!loadingEmpenhosVincular && empenhosDisponiveis.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4 italic">Nenhum empenho encontrado para este contrato.</p>
            )}

            {!loadingEmpenhosVincular && empenhosDisponiveis.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {empenhosDisponiveis.map((comp: any) => {
                  const num = comp.numero_empenho || comp.empenho?.numero_liquidacao || '';
                  const data = comp.empenho?.data || '';
                  const valor = comp.total_empenhado_bruto ?? comp.empenho?.valor ?? 0;
                  const credor = comp.empenho?.credor || '';
                  const key = num || `sem-${data}`;
                  const selecionado = empenhosSelecionados.has(num);
                  const saldoVirtual = comp.saldo_virtual ?? comp.saldo_a_liquidar;
                  const comprometido = comp.comprometido ?? 0;
                  const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  return (
                    <div
                      key={key}
                      onClick={() => num && toggleEmpenho(num)}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selecionado ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      } ${!num ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={selecionado}
                        disabled={!num}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold">
                            {num ? `#${num}` : 's/n'}
                          </span>
                          <span className="text-xs text-gray-500">{data}</span>
                          <span className="text-xs font-medium text-green-700">
                            Emp. {fmt(valor)}
                          </span>
                          {comprometido > 0.01 && (
                            <span className="text-xs text-orange-600">Comprometido {fmt(comprometido)}</span>
                          )}
                          <span className={`text-xs font-bold ${saldoVirtual > 0.01 ? 'text-blue-700' : 'text-red-600'}`}>
                            Disponível {fmt(saldoVirtual)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 truncate mt-0.5">{credor}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {empenhosSelecionados.size > 0 && (
              <div className="bg-blue-50 rounded-lg p-2 flex flex-wrap gap-1">
                <span className="text-xs text-blue-700 font-medium mr-1">Selecionados:</span>
                {Array.from(empenhosSelecionados).map(n => (
                  <Badge key={n} variant="outline" className="font-mono text-xs bg-blue-100 border-blue-300 text-blue-800">
                    #{n}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVincularEmpenho(false)}>Cancelar</Button>
            <Button onClick={salvarEmpenhosOrdem} disabled={salvandoEmpenhos} className="bg-blue-600 hover:bg-blue-700">
              {salvandoEmpenhos ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Salvar e Regerar PDF
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
