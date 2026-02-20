'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  ArrowLeft,
  X,
  Download,
  FilePlus,
  Ban,
  Trash2,
  RotateCcw,
  BarChart2,
  ShieldCheck,
  ExternalLink
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
  contrato_id?: string | null;
  ordem_fornecimento_id?: string | null;
  ordem_fornecimento?: {
    id: string;
    numero: string;
  };
  local_entrega?: string | null;
  contrato?: {
    numero_contrato: string;
    fornecedor?: {
      razao_social: string;
    };
  };
  itens: ItemRequisicao[];
  status_anterior_cancelamento?: string | null;
  // Assinatura digital
  codigo_validacao?: string | null;
  pdf_assinado_url?: string | null;
  // Campos específicos de OS
  descricao_os?: string | null;
  local_execucao?: string | null;
  data_inicio_prevista?: string | null;
  data_fim_prevista?: string | null;
  prazo_execucao_dias?: number | null;
  responsavel_tecnico?: string | null;
  fiscal_contrato_nome?: string | null;
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
  const searchParams = useSearchParams();
  const contratoIdUrl = searchParams.get('contrato');
  
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('__all__');
  const [filtroTipo, setFiltroTipo] = useState<string>('__all__');
  const [filtroContrato, setFiltroContrato] = useState<string | null>(contratoIdUrl);
  const [contratoInfo, setContratoInfo] = useState<{ numero_contrato: string; fornecedor_razao_social?: string } | null>(null);
  const [busca, setBusca] = useState('');
  
  // Permissões do usuário
  const [podeCancelarEstornar, setPodeCancelarEstornar] = useState(false);

  // Modal de detalhes/autorização
  const [requisicaoSelecionada, setRequisicaoSelecionada] = useState<Requisicao | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showAutorizar, setShowAutorizar] = useState(false);
  const [showNegar, setShowNegar] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);
  const [showExcluir, setShowExcluir] = useState(false);
  const [showReativar, setShowReativar] = useState(false);
  const [showGerarOrdem, setShowGerarOrdem] = useState(false);
  const [motivoNegativa, setMotivoNegativa] = useState('');
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [motivoReativacao, setMotivoReativacao] = useState('');
  const [processando, setProcessando] = useState(false);
  const [infoExclusao, setInfoExclusao] = useState<{
    temOrdem: boolean;
    ordemNumero?: string;
    recebimentos: Array<{ id: string; numero: string; status: string; baixaRealizada: boolean }>;
    saldoReservado: boolean;
  } | null>(null);
  const [gerandoPDF, setGerandoPDF] = useState<string | null>(null); // ID da ordem sendo processada
  const [gerandoOrdem, setGerandoOrdem] = useState(false);
  
  // Formulário de gerar ordem
  const [formGerarOrdem, setFormGerarOrdem] = useState({
    local_entrega: '',
    data_entrega_prevista: '',
    prazo_entrega_dias: '',
    observacoes: '',
  });

  // Carregar info do contrato se filtrado
  useEffect(() => {
    if (filtroContrato) {
      carregarInfoContrato();
    } else {
      setContratoInfo(null);
    }
  }, [filtroContrato]);

  const carregarInfoContrato = async () => {
    if (!filtroContrato) return;
    try {
      const response = await authFetch(`${API_URL}/api/contratos/${filtroContrato}`);
      if (response.ok) {
        const data = await response.json();
        setContratoInfo({
          numero_contrato: data.numero_contrato,
          fornecedor_razao_social: data.fornecedor_razao_social
        });
      }
    } catch (error) {
      console.error('Erro ao carregar contrato:', error);
    }
  };

  useEffect(() => {
    // SEMPRE busca permissões do banco de dados (fonte da verdade)
    const carregarPermissoes = async () => {
      try {
        console.log('[Requisicoes] Buscando permissões do usuário da API...');
        const response = await authFetch(`${API_URL}/api/usuarios/me`);
        if (response.ok) {
          const usuario = await response.json();
          console.log('[Requisicoes] Usuario da API:', usuario);
          console.log('[Requisicoes] pode_cancelar_estornar:', usuario.pode_cancelar_estornar);
          const temPermissao = usuario.pode_cancelar_estornar === true;
          console.log('[Requisicoes] Tem permissão?', temPermissao);
          setPodeCancelarEstornar(temPermissao);
          // Atualiza localStorage para cache (mas sempre busca da API)
          localStorage.setItem('usuario', JSON.stringify(usuario));
        } else {
          console.error('[Requisicoes] Erro ao buscar usuário da API:', response.status);
        }
      } catch (apiError) {
        console.error('[Requisicoes] Erro ao buscar da API:', apiError);
      }
    };
    
    carregarPermissoes();
  }, []);

  useEffect(() => {
    carregarRequisicoes();
  }, [filtroStatus, filtroContrato]);

  const carregarRequisicoes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroStatus && filtroStatus !== '__all__') params.append('status', filtroStatus);
      if (filtroContrato) params.append('contratoId', filtroContrato);
      
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

  const handleAbrirGerarOrdem = (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setFormGerarOrdem({
      local_entrega: req.local_entrega || '',
      data_entrega_prevista: '',
      prazo_entrega_dias: '',
      observacoes: '',
    });
    setShowGerarOrdem(true);
  };

  const handleAbrirCancelar = async (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setMotivoCancelamento('');
    
    // Busca informações sobre o que será excluído
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${req.id}/info-exclusao`
      );
      if (response.ok) {
        const info = await response.json();
        setInfoExclusao(info);
      }
    } catch (error) {
      console.error('Erro ao buscar informações de exclusão:', error);
    }
    
    setShowCancelar(true);
  };

  const handleAbrirExcluir = async (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    
    // Busca informações sobre o que será excluído
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${req.id}/info-exclusao`
      );
      if (response.ok) {
        const info = await response.json();
        setInfoExclusao(info);
      }
    } catch (error) {
      console.error('Erro ao buscar informações de exclusão:', error);
    }
    
    setShowExcluir(true);
  };

  const handleExcluir = async () => {
    if (!requisicaoSelecionada) return;

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(data.message || `Requisição ${requisicaoSelecionada.numero} excluída com sucesso!`);
        setShowExcluir(false);
        setInfoExclusao(null);
        carregarRequisicoes();
      } else {
        const error = await response.json();
        alert(`Erro ao excluir: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir requisição');
    } finally {
      setProcessando(false);
    }
  };

  const handleAbrirReativar = (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setMotivoReativacao('');
    setShowReativar(true);
  };

  const handleReativar = async () => {
    if (!requisicaoSelecionada || !motivoReativacao.trim()) {
      alert('Por favor, informe o motivo da reativação.');
      return;
    }

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/reativar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: motivoReativacao.trim() }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(data.mensagem || `Requisição ${requisicaoSelecionada.numero} reativada com sucesso!`);
        setShowReativar(false);
        setMotivoReativacao('');
        carregarRequisicoes();
      } else {
        const error = await response.json();
        alert(`Erro ao reativar: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao reativar:', error);
      alert('Erro ao reativar requisição.');
    } finally {
      setProcessando(false);
    }
  };

  const handleCancelar = async () => {
    if (!requisicaoSelecionada || !motivoCancelamento.trim()) {
      alert('Por favor, informe o motivo do cancelamento.');
      return;
    }

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/cancelar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: motivoCancelamento.trim() }),
        }
      );

      if (response.ok) {
        alert(`Requisição ${requisicaoSelecionada.numero} cancelada com sucesso!`);
        setShowCancelar(false);
        setMotivoCancelamento('');
        carregarRequisicoes();
      } else {
        const error = await response.json();
        alert(`Erro ao cancelar requisição: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao cancelar requisição:', error);
      alert('Erro ao cancelar requisição.');
    } finally {
      setProcessando(false);
    }
  };

  const handleGerarOrdem = async () => {
    if (!requisicaoSelecionada) return;
    
    setGerandoOrdem(true);
    try {
      const payload: any = {
        requisicao_id: requisicaoSelecionada.id,
      };

      if (formGerarOrdem.local_entrega.trim()) {
        payload.local_entrega = formGerarOrdem.local_entrega.trim();
      }
      if (formGerarOrdem.data_entrega_prevista) {
        payload.data_entrega_prevista = formGerarOrdem.data_entrega_prevista;
      }
      if (formGerarOrdem.prazo_entrega_dias) {
        payload.prazo_entrega_dias = Number(formGerarOrdem.prazo_entrega_dias);
      }
      if (formGerarOrdem.observacoes.trim()) {
        payload.observacoes = formGerarOrdem.observacoes.trim();
      }

      const response = await authFetch(
        `${API_URL}/api/almoxarifado/ordens/gerar`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const ordemGerada = await response.json();
        alert(`Ordem de fornecimento ${ordemGerada.numero} gerada com sucesso!`);
        setShowGerarOrdem(false);
        carregarRequisicoes();
      } else {
        const error = await response.json();
        alert(`Erro ao gerar ordem: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao gerar ordem:', error);
      alert('Erro ao gerar ordem de fornecimento');
    } finally {
      setGerandoOrdem(false);
    }
  };

  const handleAutorizar = async () => {
    if (!requisicaoSelecionada) return;
    
    const isOS = requisicaoSelecionada.tipo === 'ORDEM_SERVICO';
    const reqId = requisicaoSelecionada.id;
    const reqNumero = requisicaoSelecionada.numero;

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${reqId}/autorizar`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        setShowAutorizar(false);
        await carregarRequisicoes();

        if (isOS) {
          // Baixar o PDF assinado automaticamente
          try {
            setGerandoPDF(reqId);
            const pdfResponse = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${reqId}/pdf-assinado`);
            if (pdfResponse.ok) {
              const blob = await pdfResponse.blob();
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `OS_${reqNumero.replace(/\//g, '_')}_assinada.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(url);
            }
          } catch (pdfErr) {
            console.warn('PDF gerado mas não foi possível baixar automaticamente:', pdfErr);
          } finally {
            setGerandoPDF(null);
          }
        } else {
          alert('Requisição autorizada com sucesso! Saldo reservado no contrato.');
        }
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

  const handleDownloadPDFAssinado = async (req: Requisicao) => {
    try {
      setGerandoPDF(req.id);
      const response = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${req.id}/pdf-assinado`);
      
      if (!response.ok) {
        throw new Error('PDF assinado não disponível');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `OS_${req.numero.replace(/\//g, '_')}_assinada.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar PDF assinado:', error);
      alert('Erro ao baixar PDF assinado. Tente novamente.');
    } finally {
      setGerandoPDF(null);
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

  const handleDownloadPDF = async (ordemId: string, ordemNumero: string) => {
    try {
      setGerandoPDF(ordemId);
      const response = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordemId}/pdf`);
      
      if (!response.ok) {
        throw new Error('Erro ao gerar PDF');
      }

      // Cria um blob do PDF
      const blob = await response.blob();
      
      // Cria um link temporário e faz o download
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

  const requisicoesFiltradas = requisicoes.filter(req => {
    // Filtro por tipo
    if (filtroTipo && filtroTipo !== '__all__' && req.tipo !== filtroTipo) return false;
    // Filtro por busca
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

  const limparFiltroContrato = () => {
    setFiltroContrato(null);
    // Atualiza a URL sem o parâmetro
    window.history.replaceState({}, '', '/orgao/almoxarifado/requisicoes');
  };

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
            <Link href={filtroContrato ? "/orgao/contratos" : "/orgao/almoxarifado"}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Requisições e Ordens de Serviço</h1>
            <p className="text-gray-500">
              {filtroContrato && contratoInfo
                ? `Requisições do contrato ${contratoInfo.numero_contrato}`
                : 'Gerencie requisições, pedidos e ordens de serviço'}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href={filtroContrato 
            ? `/orgao/almoxarifado/requisicoes/nova?contrato=${filtroContrato}` 
            : "/orgao/almoxarifado/requisicoes/nova"}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Requisição
          </Link>
        </Button>
      </div>

      {/* Banner de filtro por contrato */}
      {filtroContrato && contratoInfo && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">
                    Filtrando por: Contrato {contratoInfo.numero_contrato}
                  </p>
                  {contratoInfo.fornecedor_razao_social && (
                    <p className="text-sm text-blue-700">
                      Fornecedor: {contratoInfo.fornecedor_razao_social}
                    </p>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={limparFiltroContrato}
                className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
              >
                <X className="h-4 w-4 mr-1" />
                Limpar filtro
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                <SelectItem value="__all__">Todos os status</SelectItem>
                <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                <SelectItem value="AGUARDANDO_AUTORIZACAO">Aguardando Autorização</SelectItem>
                <SelectItem value="AUTORIZADA">Autorizada</SelectItem>
                <SelectItem value="NEGADA">Negada</SelectItem>
                <SelectItem value="ORDEM_GERADA">Ordem Gerada</SelectItem>
                <SelectItem value="ATENDIDA">Atendida</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                <SelectItem value="MATERIAL">Material</SelectItem>
                <SelectItem value="SERVICO">Serviço</SelectItem>
                <SelectItem value="PERMANENTE">Permanente</SelectItem>
                <SelectItem value="ORDEM_SERVICO">Ordem de Serviço</SelectItem>
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
                <TableHead>Tipo</TableHead>
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
                  <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                    Nenhuma requisição encontrada
                  </TableCell>
                </TableRow>
              ) : (
                requisicoesFiltradas.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.numero}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={req.tipo === 'ORDEM_SERVICO' ? 'border-indigo-300 text-indigo-700 bg-indigo-50' : ''}>
                        {req.tipo === 'ORDEM_SERVICO' ? 'OS' : req.tipo === 'MATERIAL' ? 'Material' : req.tipo === 'SERVICO' ? 'Serviço' : req.tipo}
                      </Badge>
                    </TableCell>
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
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {/* OS aprovada com assinatura digital → badge + download PDF */}
                        {req.tipo === 'ORDEM_SERVICO' && req.codigo_validacao && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => handleDownloadPDFAssinado(req)}
                            disabled={gerandoPDF === req.id}
                            title={`PDF Assinado Digitalmente - Código: ${req.codigo_validacao}`}
                          >
                            {gerandoPDF === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {/* OS aprovada → link para medições do contrato */}
                        {req.tipo === 'ORDEM_SERVICO' && (req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA') && req.contrato_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-indigo-600 hover:text-indigo-700"
                            asChild
                            title="Ver medições do contrato"
                          >
                            <Link href={`/orgao/contratos/${req.contrato_id}?tab=medicao`}>
                              <BarChart2 className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        {/* Botão para gerar ordem manualmente (apenas para requisições de material/serviço aprovadas sem ordem) */}
                        {req.tipo !== 'ORDEM_SERVICO' && (req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA') && !req.ordem_fornecimento_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => handleAbrirGerarOrdem(req)}
                            disabled={gerandoOrdem}
                            title="Gerar Ordem de Fornecimento"
                          >
                            {gerandoOrdem ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FilePlus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {/* Botão para baixar PDF (requisições com ordem gerada) */}
                        {(req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA' || req.status === 'ATENDIDA_PARCIAL' || req.status === 'ATENDIDA') && req.ordem_fornecimento_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleDownloadPDF(req.ordem_fornecimento_id!, req.ordem_fornecimento?.numero || '')}
                            disabled={gerandoPDF === req.ordem_fornecimento_id}
                            title="Baixar PDF da Ordem de Fornecimento"
                          >
                            {gerandoPDF === req.ordem_fornecimento_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {req.status === 'AGUARDANDO_AUTORIZACAO' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => handleAbrirAutorizar(req)}
                              title="Autorizar requisição"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleAbrirNegar(req)}
                              title="Negar requisição"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {/* Botão de cancelar */}
                        {/* Qualquer usuário pode cancelar: RASCUNHO, AGUARDANDO_AUTORIZACAO, NEGADA */}
                        {req.status === 'RASCUNHO' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-600 hover:text-gray-700"
                            onClick={() => handleAbrirCancelar(req)}
                            title="Cancelar requisição"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {req.status === 'NEGADA' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-600 hover:text-gray-700"
                            onClick={() => handleAbrirCancelar(req)}
                            title="Cancelar requisição"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {/* AUTORIZADA e ORDEM_GERADA requerem permissão especial */}
                        {(req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA') && podeCancelarEstornar && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleAbrirCancelar(req)}
                            title="Cancelar requisição (requer permissão)"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Botão de reativar - apenas para CANCELADA */}
                        {req.status === 'CANCELADA' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleAbrirReativar(req)}
                            title="Reativar requisição cancelada"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Botão de excluir - QUALQUER STATUS (nova lógica com cascata) */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleAbrirExcluir(req)}
                          title="Excluir requisição e tudo relacionado (ordem, recebimentos)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
            <DialogTitle className="text-green-600">
              {requisicaoSelecionada?.tipo === 'ORDEM_SERVICO' ? 'Autorizar Ordem de Serviço' : 'Autorizar Requisição'}
            </DialogTitle>
            <DialogDescription>
              {requisicaoSelecionada?.tipo === 'ORDEM_SERVICO'
                ? 'Ao autorizar, a OS será assinada digitalmente e um PDF será gerado.'
                : 'Ao autorizar, o saldo será reservado no contrato.'}
            </DialogDescription>
          </DialogHeader>
          
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="font-medium">{requisicaoSelecionada.numero}</p>
                {requisicaoSelecionada.tipo === 'ORDEM_SERVICO' && requisicaoSelecionada.descricao_os && (
                  <p className="text-sm text-gray-700 mt-1">{requisicaoSelecionada.descricao_os}</p>
                )}
                <p className="text-sm text-gray-600">
                  Valor: {formatarMoeda(requisicaoSelecionada.valor_total_estimado)}
                </p>
                {requisicaoSelecionada.tipo !== 'ORDEM_SERVICO' && (
                  <p className="text-sm text-gray-600">
                    {requisicaoSelecionada.itens?.length || 0} item(s)
                  </p>
                )}
              </div>

              {requisicaoSelecionada.tipo === 'ORDEM_SERVICO' ? (
                <div className="bg-blue-50 p-4 rounded-lg text-sm border border-blue-200">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-blue-800">Assinatura Digital Automática</p>
                      <p className="text-blue-700 mt-1">
                        Ao confirmar, esta OS será assinada digitalmente conforme a Lei 14.063/2020.
                        O <strong>PDF assinado será baixado automaticamente</strong> para o seu computador.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 p-4 rounded-lg text-sm">
                  <p className="font-medium text-yellow-800">⚠️ Atenção</p>
                  <p className="text-yellow-700">
                    Ao autorizar, o saldo dos itens será reservado no contrato.
                    Se a requisição for cancelada posteriormente, o saldo será liberado.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutorizar(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAutorizar} disabled={processando} className="bg-green-600 hover:bg-green-700">
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {requisicaoSelecionada?.tipo === 'ORDEM_SERVICO' ? 'Autorizar e Assinar' : 'Confirmar Autorização'}
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

      {/* Modal Cancelar Requisição */}
      <Dialog open={showCancelar} onOpenChange={setShowCancelar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Cancelar Requisição</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento da requisição {requisicaoSelecionada?.numero}.
            </DialogDescription>
          </DialogHeader>
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="font-medium text-red-900">Atenção!</p>
                <p className="text-sm text-red-700 mt-1">
                  {requisicaoSelecionada.status === 'AUTORIZADA' || requisicaoSelecionada.status === 'ORDEM_GERADA' 
                    ? 'Esta requisição está aprovada. O cancelamento liberará o saldo reservado no contrato.'
                    : 'O cancelamento desta requisição não pode ser desfeito.'}
                </p>
                
                {infoExclusao && (
                  <div className="mt-3 space-y-2">
                    {infoExclusao.temOrdem && (
                      <div className="bg-red-100 p-3 rounded border border-red-300">
                        <p className="text-sm font-semibold text-red-900">
                          ⚠️ Serão excluídos automaticamente:
                        </p>
                        <ul className="text-sm text-red-800 mt-1 ml-4 list-disc">
                          <li>Ordem de fornecimento {infoExclusao.ordemNumero}</li>
                          {infoExclusao.recebimentos.length > 0 && (
                            <li>
                              {infoExclusao.recebimentos.length} recebimento(s) relacionado(s)
                              {infoExclusao.recebimentos.some(r => r.baixaRealizada) && (
                                <span className="text-red-900 font-semibold">
                                  {' '}(incluindo recebimentos aceitos que serão estornados)
                                </span>
                              )}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {infoExclusao.saldoReservado && (
                      <p className="text-sm text-yellow-700 font-semibold">
                        💰 Saldo reservado será liberado no contrato.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Motivo do Cancelamento <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Descreva o motivo do cancelamento..."
                  value={motivoCancelamento}
                  onChange={(e) => setMotivoCancelamento(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelar(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCancelar} 
              disabled={processando || !motivoCancelamento.trim()}
              variant="destructive"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Reativar Requisição */}
      <Dialog open={showReativar} onOpenChange={setShowReativar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-600">Reativar Requisição</DialogTitle>
            <DialogDescription>
              Informe o motivo da reativação da requisição {requisicaoSelecionada?.numero}.
            </DialogDescription>
          </DialogHeader>
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="font-medium text-green-900">Atenção!</p>
                <p className="text-sm text-green-700 mt-1">
                  {requisicaoSelecionada.status_anterior_cancelamento === 'AUTORIZADA' || 
                   requisicaoSelecionada.status_anterior_cancelamento === 'ORDEM_GERADA'
                    ? 'Esta requisição estava aprovada. Ao reativar, o saldo será re-reservado no contrato (se houver disponibilidade).'
                    : requisicaoSelecionada.status_anterior_cancelamento === 'NEGADA'
                    ? 'Esta requisição estava negada. Ao reativar, voltará para aguardando aprovação.'
                    : 'Ao reativar, a requisição voltará para o status anterior.'}
                </p>
                {requisicaoSelecionada.status_anterior_cancelamento && (
                  <p className="text-xs text-gray-600 mt-2">
                    Status anterior: <span className="font-semibold">{requisicaoSelecionada.status_anterior_cancelamento}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Motivo da Reativação <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Descreva o motivo da reativação..."
                  value={motivoReativacao}
                  onChange={(e) => setMotivoReativacao(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReativar(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleReativar} 
              disabled={processando || !motivoReativacao.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {processando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Reativação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir Requisição - NOVA LÓGICA: Exclusão completa em cascata */}
      <Dialog open={showExcluir} onOpenChange={setShowExcluir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">⚠️ Excluir Requisição</DialogTitle>
            <DialogDescription>
              Esta ação vai excluir PERMANENTEMENTE a requisição e TUDO relacionado a ela.
            </DialogDescription>
          </DialogHeader>
          {requisicaoSelecionada && (
            <div className="bg-red-50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-lg">{requisicaoSelecionada.numero}</p>
                  <p className="text-sm text-gray-600">
                    Status: <Badge className={STATUS_COLORS[requisicaoSelecionada.status]}>
                      {STATUS_LABELS[requisicaoSelecionada.status]}
                    </Badge>
                  </p>
                </div>
                <p className="font-medium text-blue-600">
                  {formatarMoeda(requisicaoSelecionada.valor_total_estimado)}
                </p>
              </div>
              
              <div className="bg-red-100 p-3 rounded border border-red-300">
                <p className="text-sm font-semibold text-red-900 mb-2">
                  🗑️ O que será excluído/estornado:
                </p>
                <ul className="text-sm text-red-800 ml-4 list-disc space-y-1">
                  <li>A requisição {requisicaoSelecionada.numero}</li>
                  <li>Todos os itens da requisição</li>
                  {infoExclusao?.temOrdem && (
                    <>
                      <li>Ordem de fornecimento {infoExclusao.ordemNumero}</li>
                      {infoExclusao.recebimentos.length > 0 && (
                        <li>
                          {infoExclusao.recebimentos.length} recebimento(s) 
                          {infoExclusao.recebimentos.some((r: {status: string}) => r.status === 'ACEITO') && 
                            ' (serão estornados)'}
                        </li>
                      )}
                    </>
                  )}
                </ul>
              </div>

              <div className="bg-green-100 p-3 rounded border border-green-300">
                <p className="text-sm font-semibold text-green-900">
                  💰 Saldo do contrato será restaurado automaticamente
                </p>
                <p className="text-xs text-green-700 mt-1">
                  Quantidade empenhada e quantidade entregue serão devolvidas ao saldo disponível.
                </p>
              </div>
              
              <p className="text-sm text-red-700 font-bold text-center">
                ⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL!
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
              Excluir Tudo Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Gerar Ordem */}
      <Dialog open={showGerarOrdem} onOpenChange={setShowGerarOrdem}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-blue-600">Gerar Ordem de Fornecimento</DialogTitle>
            <DialogDescription>
              Preencha os dados para gerar a ordem de fornecimento/serviço.
            </DialogDescription>
          </DialogHeader>
          
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="font-medium">{requisicaoSelecionada.numero}</p>
                <p className="text-sm text-gray-600">
                  Valor: {formatarMoeda(requisicaoSelecionada.valor_total_estimado)}
                </p>
                {requisicaoSelecionada.contrato && (
                  <p className="text-sm text-gray-600">
                    Contrato: {requisicaoSelecionada.contrato.numero_contrato}
                    {requisicaoSelecionada.contrato.fornecedor && 
                      ` - ${requisicaoSelecionada.contrato.fornecedor.razao_social}`
                    }
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Local de Entrega
                  </label>
                  <Input
                    placeholder="Ex: Almoxarifado Central, Setor de Compras..."
                    value={formGerarOrdem.local_entrega}
                    onChange={(e) => setFormGerarOrdem({ ...formGerarOrdem, local_entrega: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Data de Entrega Prevista
                    </label>
                    <Input
                      type="date"
                      value={formGerarOrdem.data_entrega_prevista}
                      onChange={(e) => setFormGerarOrdem({ ...formGerarOrdem, data_entrega_prevista: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Prazo de Entrega (dias)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Ex: 30"
                      value={formGerarOrdem.prazo_entrega_dias}
                      onChange={(e) => setFormGerarOrdem({ ...formGerarOrdem, prazo_entrega_dias: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Observações (opcional)
                  </label>
                  <Textarea
                    placeholder="Informações adicionais sobre a ordem..."
                    value={formGerarOrdem.observacoes}
                    onChange={(e) => setFormGerarOrdem({ ...formGerarOrdem, observacoes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGerarOrdem(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleGerarOrdem}
              disabled={gerandoOrdem}
            >
              {gerandoOrdem && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <FilePlus className="h-4 w-4 mr-2" />
              Gerar Ordem
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
