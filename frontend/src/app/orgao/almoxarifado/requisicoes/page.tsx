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
  ExternalLink,
  Send,
  Pencil,
  History,
  ShoppingCart,
  Receipt,
  Link2,
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
  orgao?: { nome: string };
  contrato?: {
    numero_contrato: string;
    fornecedor?: {
      id?: string;
      razao_social: string;
      email?: string;
      telefone?: string;
      representante_telefone?: string;
    };
  };
  itens: ItemRequisicao[];
  status_anterior_cancelamento?: string | null;
  // Assinatura digital
  codigo_validacao?: string | null;
  pdf_assinado_url?: string | null;
  enviado_ao_fornecedor?: boolean;
  data_envio_fornecedor?: string | null;
  // Campos específicos de OS
  descricao_os?: string | null;
  local_execucao?: string | null;
  data_inicio_prevista?: string | null;
  data_fim_prevista?: string | null;
  prazo_execucao_dias?: number | null;
  responsavel_tecnico?: string | null;
  fiscal_contrato_nome?: string | null;
  modo_os?: string | null;
  numeros_empenhos?: string | null;
  itensOS?: Array<{
    id: string;
    quantidade_solicitada: number;
    itemCronograma?: { descricao?: string; unidade_medida?: string; valor_unitario?: number };
  }>;
  etapasOS?: Array<{
    id: string;
    percentual_solicitado: number;
    valor_solicitado?: number;
    etapa?: { numero_etapa?: number; descricao?: string; valor_previsto?: number };
  }>;
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

const getStatusDisplay = (req: Requisicao) => {
  if (req.tipo === 'ORDEM_SERVICO' && req.enviado_ao_fornecedor) {
    return {
      label: 'Enviada ao Fornecedor',
      className: 'bg-teal-100 text-teal-800',
    };
  }

  return {
    label: STATUS_LABELS[req.status] || req.status,
    className: STATUS_COLORS[req.status] || 'bg-gray-100 text-gray-800',
  };
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

  // Vincular empenho (OS)
  const [showVincularEmpenhoOS, setShowVincularEmpenhoOS] = useState(false);
  const [empenhosDisponiveisOS, setEmpenhosDisponiveisOS] = useState<any[]>([]);
  const [empenhosSelecionadosOS, setEmpenhosSelecionadosOS] = useState<Set<string>>(new Set());
  const [loadingEmpenhosOS, setLoadingEmpenhosOS] = useState(false);
  const [salvandoEmpenhosOS, setSalvandoEmpenhosOS] = useState(false);
  const [anoEmpenhoOS, setAnoEmpenhoOS] = useState(new Date().getFullYear().toString());
  
  // Formulário de gerar ordem
  const [formGerarOrdem, setFormGerarOrdem] = useState({
    local_entrega: '',
    data_entrega_prevista: '',
    prazo_entrega_dias: '',
    observacoes: '',
  });

  // Overrides para notificação ao fornecedor (OS) - editáveis antes de autorizar
  const [emailFornecedor, setEmailFornecedor] = useState('');
  const [telefoneFornecedor, setTelefoneFornecedor] = useState('');
  const [enviarAoFornecedor, setEnviarAoFornecedor] = useState(true);

  // Modal Enviar/Reenviar ao fornecedor (OS já aprovada)
  const [showEnviarFornecedor, setShowEnviarFornecedor] = useState(false);
  const [emailEnviarFornecedor, setEmailEnviarFornecedor] = useState('');
  const [telefoneEnviarFornecedor, setTelefoneEnviarFornecedor] = useState('');
  const [enviandoFornecedorId, setEnviandoFornecedorId] = useState<string | null>(null);
  const [regenerandoPdfId, setRegenerandoPdfId] = useState<string | null>(null);

  // Modal Histórico (OS)
  const [showHistoricoOS, setShowHistoricoOS] = useState(false);
  const [historicoOS, setHistoricoOS] = useState<Array<{ id: string; tipo_acao: string; descricao: string; usuario_nome?: string; created_at: string; data_evento?: string | null }>>([]);
  const [carregandoHistoricoOS, setCarregandoHistoricoOS] = useState(false);

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

  const abrirVincularEmpenhoOS = async (req: typeof requisicaoSelecionada) => {
    if (!req) return;
    const numsAtuais = (() => {
      try {
        const parsed = typeof req.numeros_empenhos === 'string' ? JSON.parse(req.numeros_empenhos) : req.numeros_empenhos;
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    })();
    setEmpenhosSelecionadosOS(new Set(numsAtuais));
    setEmpenhosDisponiveisOS([]);
    setShowVincularEmpenhoOS(true);
    const contratoId = req.contrato_id;
    if (!contratoId) return;
    setLoadingEmpenhosOS(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/empenhos?ano=${anoEmpenhoOS}`);
      if (res.ok) {
        const data = await res.json();
        const grupos: any[] = data.grupos_exercicio ?? [];
        const compostos: any[] = [];
        for (const g of grupos) {
          if (g.empenhos_compostos?.length) compostos.push(...g.empenhos_compostos);
        }
        setEmpenhosDisponiveisOS(compostos);
      }
    } catch (e) { console.error(e); }
    setLoadingEmpenhosOS(false);
  };

  const salvarEmpenhosOS = async () => {
    if (!requisicaoSelecionada) return;
    setSalvandoEmpenhosOS(true);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/empenhos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empenhos: Array.from(empenhosSelecionadosOS).map(num => {
          const comp = empenhosDisponiveisOS.find((c: any) =>
            (c.numero_empenho || c.empenho?.numero_liquidacao || '') === num
          );
          if (comp?.ano_exercicio) return `${num}-${comp.ano_exercicio}`;
          return num;
        }) }),
      });
      if (res.ok) {
        setShowVincularEmpenhoOS(false);
        await carregarRequisicoes();
        alert('Empenhos vinculados e PDF atualizado com sucesso!');
      } else {
        alert('Erro ao vincular empenhos');
      }
    } catch { alert('Erro ao vincular empenhos'); }
    setSalvandoEmpenhosOS(false);
  };

  const toggleEmpenhoOS = (num: string) => {
    setEmpenhosSelecionadosOS(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  };

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

  const handleVerDetalhes = async (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setShowDetalhes(true);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${req.id}`);
      if (res.ok) {
        const data = await res.json();
        setRequisicaoSelecionada(data);
      }
    } catch {
      // mantém dados parciais da lista
    }
  };

  const handleAbrirAutorizar = (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setEnviarAoFornecedor(true);
    if (req.tipo === 'ORDEM_SERVICO' && req.contrato?.fornecedor) {
      const f = req.contrato.fornecedor;
      setEmailFornecedor(f.email || '');
      setTelefoneFornecedor(f.representante_telefone || f.telefone || '');
    } else {
      setEmailFornecedor('');
      setTelefoneFornecedor('');
    }
    setShowAutorizar(true);
  };

  const handleAbrirEnviarFornecedor = (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    if (req.contrato?.fornecedor) {
      const f = req.contrato.fornecedor;
      setEmailEnviarFornecedor(f.email || '');
      setTelefoneEnviarFornecedor(f.representante_telefone || f.telefone || '');
    } else {
      setEmailEnviarFornecedor('');
      setTelefoneEnviarFornecedor('');
    }
    setShowEnviarFornecedor(true);
  };

  const handleAbrirHistorico = async (req: Requisicao) => {
    setRequisicaoSelecionada(req);
    setShowHistoricoOS(true);
    setCarregandoHistoricoOS(true);
    try {
      // Sempre busca histórico da REQUISIÇÃO (desde criação, envio aprovação, autorização)
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${req.id}/historico`);
      if (res.ok) {
        const data = await res.json();
        setHistoricoOS(data);
      } else {
        setHistoricoOS([]);
      }
    } catch {
      setHistoricoOS([]);
    } finally {
      setCarregandoHistoricoOS(false);
    }
  };

  const handleEnviarAoFornecedor = async () => {
    if (!requisicaoSelecionada) return;
    setEnviandoFornecedorId(requisicaoSelecionada.id);
    try {
      const body: Record<string, string> = {};
      if (emailEnviarFornecedor.trim()) body.email_fornecedor = emailEnviarFornecedor.trim();
      if (telefoneEnviarFornecedor.trim()) body.telefone_fornecedor = telefoneEnviarFornecedor.trim();
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/enviar-ao-fornecedor`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      if (response.ok) {
        const data = await response.json();
        const n = data?.notificacoes_fornecedor;
        const partes: string[] = [];
        if (n) {
          const envios: string[] = [];
          if (n.email) envios.push('Email enviado');
          else envios.push('Email não enviado (sem endereço ou erro)');
          if (n.notificacao) envios.push('Notificação criada');
          else envios.push('Notificação não criada');
          if (n.whatsapp) envios.push('WhatsApp enviado');
          else envios.push('WhatsApp não enviado (não configurado ou sem telefone)');
          partes.push(envios.join(' • '));
        } else {
          partes.push('Envio concluído.');
        }
        alert(partes.join('\n'));
        setShowEnviarFornecedor(false);
        carregarRequisicoes();
      } else {
        const err = await response.json();
        alert(`Erro: ${err.message || 'Erro ao enviar ao fornecedor'}`);
      }
    } catch (error) {
      console.error('Erro ao enviar ao fornecedor:', error);
        alert('Erro ao enviar ao fornecedor');
    } finally {
      setEnviandoFornecedorId(null);
    }
  };

  const handleRegenerarPdf = async (req: Requisicao) => {
    if (!confirm(`Regenerar PDF da ${req.numero}? O PDF atual será substituído.`)) return;
    setRegenerandoPdfId(req.id);
    try {
      const response = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${req.id}/regenerar-pdf`, { method: 'POST' });
      if (response.ok) {
        alert('PDF regenerado com sucesso!');
        carregarRequisicoes();
      } else {
        const err = await response.json();
        alert(`Erro: ${err.message || 'Erro ao regenerar PDF'}`);
      }
    } catch (error) {
      alert('Erro ao regenerar PDF');
    } finally {
      setRegenerandoPdfId(null);
    }
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
    const geraOF = requisicaoSelecionada.contrato_id && !isOS;
    const reqId = requisicaoSelecionada.id;

    const body: Record<string, unknown> = {};
    if (isOS || geraOF) {
      body.enviar_ao_fornecedor = enviarAoFornecedor;
      if (emailFornecedor.trim()) body.email_fornecedor = emailFornecedor.trim();
      if (telefoneFornecedor.trim()) body.telefone_fornecedor = telefoneFornecedor.trim();
    }

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${reqId}/autorizar`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );

      if (response.ok) {
        setShowAutorizar(false);
        await carregarRequisicoes();

        if (isOS) {
          const data = await response.json();
          const n = data?.notificacoes_fornecedor;
          const partes: string[] = ['OS autorizada e assinada digitalmente! PDF disponível para download.'];
          if (enviarAoFornecedor && n) {
            const envios: string[] = [];
            if (n.email) envios.push('Email enviado');
            else envios.push('Email não enviado (sem endereço ou erro)');
            if (n.notificacao) envios.push('Notificação criada no sistema');
            else envios.push('Notificação não criada');
            if (n.whatsapp) envios.push('WhatsApp enviado');
            else envios.push('WhatsApp não enviado (não configurado ou sem telefone)');
            partes.push(`Fornecedor: ${envios.join(' • ')}`);
          } else if (!enviarAoFornecedor) {
            partes.push('Você pode enviar ao fornecedor depois usando o botão "Enviar ao fornecedor" nas ações.');
          } else {
            partes.push('O fornecedor receberá por email, notificação e WhatsApp (se configurado).');
          }
          alert(partes.join('\n\n'));
        } else if (geraOF) {
          const data = await response.json();
          const n = data?.notificacoes_fornecedor;
          const partes: string[] = ['Requisição autorizada! Ordem de Fornecimento gerada e assinada digitalmente.'];
          if (enviarAoFornecedor && n) {
            const envios: string[] = [];
            if (n.email) envios.push('Email enviado');
            else envios.push('Email não enviado');
            if (n.notificacao) envios.push('Notificação criada');
            if (n.whatsapp) envios.push('WhatsApp enviado');
            partes.push(`Fornecedor: ${envios.join(' • ')}`);
          } else if (!enviarAoFornecedor) {
            partes.push('Você pode enviar ao fornecedor depois na tela de Ordens.');
          }
          alert(partes.join('\n\n'));
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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'PDF assinado não disponível');
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
      alert(error instanceof Error && error.message 
        ? error.message 
        : 'Erro ao baixar PDF assinado. O PDF pode não ter sido gerado. Entre em contato com o suporte.');
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
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/orgao/almoxarifado/requisicoes/pedido">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Pedido de Compras
            </Link>
          </Button>
          <Button asChild>
            <Link href={filtroContrato
              ? `/orgao/almoxarifado/requisicoes/nova?contrato=${filtroContrato}`
              : "/orgao/almoxarifado/requisicoes/nova"}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Requisição
            </Link>
          </Button>
        </div>
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
        <CardContent className="pt-6 overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Número</TableHead>
                <TableHead className="w-12">Tipo</TableHead>
                <TableHead className="whitespace-nowrap">Setor</TableHead>
                <TableHead className="whitespace-nowrap">Solicitante</TableHead>
                <TableHead className="whitespace-nowrap">Data</TableHead>
                <TableHead className="w-20">Prioridade</TableHead>
                <TableHead className="whitespace-nowrap">Valor</TableHead>
                <TableHead className="whitespace-nowrap">Empresa</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requisicoesFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                    Nenhuma requisição encontrada
                  </TableCell>
                </TableRow>
              ) : (
                requisicoesFiltradas.map((req) => {
                  const statusDisplay = getStatusDisplay(req)
                  return (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium whitespace-nowrap">{req.numero}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${req.tipo === 'ORDEM_SERVICO' ? 'border-indigo-300 text-indigo-700 bg-indigo-50' : ''}`}>
                        {req.tipo === 'ORDEM_SERVICO' ? 'OS' : req.tipo === 'MATERIAL' ? 'Mat.' : req.tipo === 'SERVICO' ? 'Serv.' : req.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{req.setor_solicitante}</TableCell>
                    <TableCell className="whitespace-nowrap">{req.usuario_solicitante_nome}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(req.data_solicitacao)}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${PRIORIDADE_COLORS[req.prioridade]}`}>
                        {req.prioridade}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatarMoeda(req.valor_total_estimado)}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-[220px] truncate" title={req.contrato?.fornecedor?.razao_social}>
                      {req.contrato?.fornecedor?.razao_social || '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge className={`text-xs ${statusDisplay.className}`}>
                        {statusDisplay.label}
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
                        {/* OS em rascunho → Editar */}
                        {req.tipo === 'ORDEM_SERVICO' && req.status === 'RASCUNHO' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700"
                            asChild
                            title="Editar OS"
                          >
                            <Link href={`/orgao/almoxarifado/requisicoes/nova?editar=${req.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        {/* OS aprovada → botão para baixar PDF assinado (visível para toda OS autorizada) */}
                        {req.tipo === 'ORDEM_SERVICO' && (req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => handleDownloadPDFAssinado(req)}
                            disabled={gerandoPDF === req.id}
                            title={req.codigo_validacao 
                              ? `Baixar PDF Assinado - Código: ${req.codigo_validacao}` 
                              : 'Baixar PDF Assinado'}
                          >
                            {gerandoPDF === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {/* OS aprovada com PDF → Enviar/Reenviar ao fornecedor */}
                        {req.tipo === 'ORDEM_SERVICO' && (req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA') && req.pdf_assinado_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-teal-600 hover:text-teal-700"
                            onClick={() => handleAbrirEnviarFornecedor(req)}
                            disabled={!!enviandoFornecedorId}
                            title="Enviar ou reenviar ao fornecedor"
                          >
                            {enviandoFornecedorId === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {/* OS autorizada → Regenerar PDF */}
                        {req.tipo === 'ORDEM_SERVICO' && (req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-orange-600 hover:text-orange-700"
                            onClick={() => handleRegenerarPdf(req)}
                            disabled={!!regenerandoPdfId}
                            title="Regenerar PDF da OS"
                          >
                            {regenerandoPdfId === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
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
                        {/* Ver Histórico: todas as requisições (desde criação, envio aprovação, autorização) */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-600 hover:text-slate-700"
                            onClick={() => handleAbrirHistorico(req)}
                            title="Ver histórico da requisição"
                          >
                            <History className="h-4 w-4" />
                          </Button>
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
                          <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-md border border-amber-200">
                            Pendente na Central de Aprovações
                          </span>
                        )}
                        {req.tipo !== 'ORDEM_SERVICO' && (req.status === 'AUTORIZADA' || req.status === 'ORDEM_GERADA') && req.ordem_fornecimento_id && (
                          <span className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-50 rounded-md border border-blue-200">
                            OF gerada — acesse Ordens de Fornecimento
                          </span>
                        )}
                        {req.tipo === 'ORDEM_SERVICO' && req.enviado_ao_fornecedor && (
                          <span className="text-xs text-teal-600 font-medium px-2 py-1 bg-teal-50 rounded-md border border-teal-200">
                            Enviada ao fornecedor
                          </span>
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
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal Detalhes */}
      <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Requisição {requisicaoSelecionada?.numero}</DialogTitle>
            <DialogDescription>
              Detalhes da requisição
            </DialogDescription>
          </DialogHeader>
          
          {requisicaoSelecionada && (
            <div className="space-y-4">
              {/* Banner de clareza: requisição aprovada gerou OF */}
              {requisicaoSelecionada.tipo !== 'ORDEM_SERVICO' &&
                (requisicaoSelecionada.status === 'AUTORIZADA' || requisicaoSelecionada.status === 'ORDEM_GERADA') &&
                requisicaoSelecionada.ordem_fornecimento_id && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-900">
                        Ordem de Fornecimento gerada
                      </p>
                      <p className="text-sm text-blue-800 mt-1">
                        Sua requisição foi aprovada e gerou a Ordem de Fornecimento{' '}
                        <strong>{requisicaoSelecionada.ordem_fornecimento?.numero || ''}</strong>.
                        Acesse a página de Ordens de Fornecimento para enviar ao fornecedor e acompanhar o recebimento.
                      </p>
                      <Button variant="outline" size="sm" className="mt-3" asChild>
                        <Link href="/orgao/almoxarifado/ordens">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ir para Ordens de Fornecimento
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div>
                    <Badge className={getStatusDisplay(requisicaoSelecionada).className}>
                      {getStatusDisplay(requisicaoSelecionada).label}
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
                {requisicaoSelecionada.data_autorizacao && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Data Autorização</label>
                    <p>{formatarData(requisicaoSelecionada.data_autorizacao)}</p>
                  </div>
                )}
                {requisicaoSelecionada.usuario_autorizador_nome && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Autorizador</label>
                    <p>{requisicaoSelecionada.usuario_autorizador_nome}</p>
                  </div>
                )}
                {requisicaoSelecionada.tipo === 'ORDEM_SERVICO' && requisicaoSelecionada.enviado_ao_fornecedor && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Envio ao Fornecedor</label>
                    <p>
                      Enviada{requisicaoSelecionada.data_envio_fornecedor ? ` em ${formatarData(requisicaoSelecionada.data_envio_fornecedor)}` : ''}
                    </p>
                  </div>
                )}
                {(() => {
                  let numsEmpenho: string[] = [];
                  try {
                    const raw = requisicaoSelecionada.numeros_empenhos;
                    if (raw) {
                      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                      if (Array.isArray(parsed)) numsEmpenho = parsed;
                    }
                  } catch {}
                  return (
                    <div className="col-span-2 border rounded-lg p-3 bg-blue-50/50">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-blue-800">Notas de Empenho</label>
                        {requisicaoSelecionada.tipo === 'ORDEM_SERVICO' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => abrirVincularEmpenhoOS(requisicaoSelecionada)}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            Vincular Empenho
                          </Button>
                        )}
                      </div>
                      {numsEmpenho.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {numsEmpenho.map((num, i) => (
                            <Badge key={i} variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 font-mono text-xs">
                              #{num}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">Nenhum empenho vinculado</p>
                      )}
                    </div>
                  );
                })()}
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

              {/* Informações específicas da OS */}
              {requisicaoSelecionada.tipo === 'ORDEM_SERVICO' && (
                <div className="border rounded-lg p-4 space-y-3 bg-indigo-50">
                  <h4 className="font-semibold text-indigo-800">Informações da Ordem de Serviço</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {requisicaoSelecionada.modo_os && (
                      <div>
                        <label className="text-gray-500">Tipo de Ordem</label>
                        <p className="font-medium">{requisicaoSelecionada.modo_os === 'ORDEM_GLOBAL' ? 'Ordem Global (100%)' : 'Ordem por Demanda'}</p>
                      </div>
                    )}
                    {requisicaoSelecionada.descricao_os && (
                      <div className="col-span-2">
                        <label className="text-gray-500">Objeto da OS</label>
                        <p className="font-medium">{requisicaoSelecionada.descricao_os}</p>
                      </div>
                    )}
                    {requisicaoSelecionada.local_execucao && (
                      <div>
                        <label className="text-gray-500">Local de Execução</label>
                        <p className="font-medium">{requisicaoSelecionada.local_execucao}</p>
                      </div>
                    )}
                    {requisicaoSelecionada.responsavel_tecnico && (
                      <div>
                        <label className="text-gray-500">Responsável Técnico</label>
                        <p className="font-medium">{requisicaoSelecionada.responsavel_tecnico}</p>
                      </div>
                    )}
                    {requisicaoSelecionada.fiscal_contrato_nome && (
                      <div>
                        <label className="text-gray-500">Fiscal</label>
                        <p className="font-medium">{requisicaoSelecionada.fiscal_contrato_nome}</p>
                      </div>
                    )}
                    {requisicaoSelecionada.data_inicio_prevista && (
                      <div>
                        <label className="text-gray-500">Início Previsto</label>
                        <p className="font-medium">{formatarData(requisicaoSelecionada.data_inicio_prevista)}</p>
                      </div>
                    )}
                    {requisicaoSelecionada.data_fim_prevista && (
                      <div>
                        <label className="text-gray-500">Fim Previsto</label>
                        <p className="font-medium">{formatarData(requisicaoSelecionada.data_fim_prevista)}</p>
                      </div>
                    )}
                    {requisicaoSelecionada.prazo_execucao_dias != null && (
                      <div>
                        <label className="text-gray-500">Prazo de Execução</label>
                        <p className="font-medium">{requisicaoSelecionada.prazo_execucao_dias} dias</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {requisicaoSelecionada.observacao_autorizador && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Observação do Autorizador</label>
                  <p className="bg-yellow-50 p-3 rounded-md">{requisicaoSelecionada.observacao_autorizador}</p>
                </div>
              )}

              {/* Itens de cronograma (itensOS) */}
              {requisicaoSelecionada.itensOS && requisicaoSelecionada.itensOS.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-500 mb-2 block">Itens da OS</label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Unidade</TableHead>
                        <TableHead className="text-right">Qtd. Solicitada</TableHead>
                        <TableHead className="text-right">Valor Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisicaoSelecionada.itensOS.map((item, idx) => {
                        const ic = item.itemCronograma;
                        const total = item.quantidade_solicitada * Number(ic?.valor_unitario ?? 0);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell>{ic?.descricao ?? '-'}</TableCell>
                            <TableCell className="text-right">{ic?.unidade_medida ?? '-'}</TableCell>
                            <TableCell className="text-right">{item.quantidade_solicitada}</TableCell>
                            <TableCell className="text-right">{ic?.valor_unitario ? formatarMoeda(ic.valor_unitario) : '-'}</TableCell>
                            <TableCell className="text-right font-medium">{formatarMoeda(total)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Etapas (etapasOS) */}
              {requisicaoSelecionada.etapasOS && requisicaoSelecionada.etapasOS.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-500 mb-2 block">Etapas da OS</label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">Valor Previsto</TableHead>
                        <TableHead className="text-right">Total Autorizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisicaoSelecionada.etapasOS.map((e, idx) => {
                        const perc = Number(e.percentual_solicitado ?? 0) || 100;
                        const valorPrevisto = Number(e.etapa?.valor_previsto ?? 0);
                        const total = valorPrevisto * perc / 100;
                        return (
                          <TableRow key={e.id}>
                            <TableCell>{e.etapa?.numero_etapa ?? idx + 1}</TableCell>
                            <TableCell>{e.etapa?.descricao ?? '-'}</TableCell>
                            <TableCell className="text-right">{perc}%</TableCell>
                            <TableCell className="text-right">{formatarMoeda(valorPrevisto)}</TableCell>
                            <TableCell className="text-right font-medium">{formatarMoeda(total)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Itens de requisição normal */}
              {(!requisicaoSelecionada.itensOS?.length && !requisicaoSelecionada.etapasOS?.length) && (
                <div>
                  <label className="text-sm font-medium text-gray-500 mb-2 block">Itens</label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 whitespace-nowrap">#</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="whitespace-nowrap w-28">Qtd. Sol.</TableHead>
                        <TableHead className="whitespace-nowrap w-28">Qtd. Aut.</TableHead>
                        <TableHead className="whitespace-nowrap w-28 text-right">Valor Unit.</TableHead>
                        <TableHead className="whitespace-nowrap w-28 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisicaoSelecionada.itens?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm align-top">{item.numero_item}</TableCell>
                          <TableCell className="align-top">
                            <span className="whitespace-normal break-words text-sm leading-relaxed">{item.descricao}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top">{item.quantidade_solicitada} {item.unidade_medida}</TableCell>
                          <TableCell className="whitespace-nowrap align-top">{item.quantidade_autorizada || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap text-right align-top">{item.valor_unitario ? formatarMoeda(item.valor_unitario) : '-'}</TableCell>
                          <TableCell className="whitespace-nowrap text-right align-top font-medium">{item.valor_total_estimado ? formatarMoeda(item.valor_total_estimado) : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {requisicaoSelecionada.pdf_assinado_url && (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                  <span className="text-sm text-green-700">PDF assinado digitalmente disponível</span>
                  {requisicaoSelecionada.codigo_validacao && (
                    <span className="text-xs text-gray-500 ml-auto">Código: {requisicaoSelecionada.codigo_validacao}</span>
                  )}
                </div>
              )}
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
                <>
                  <div className="bg-blue-50 p-4 rounded-lg text-sm border border-blue-200">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-blue-800">Assinatura Digital Automática</p>
                        <p className="text-blue-700 mt-1">
                          Ao confirmar, esta OS será assinada digitalmente conforme a Lei 14.063/2020.
                          O <strong>PDF será gerado automaticamente</strong>. Você pode escolher se deseja enviar ao fornecedor agora ou depois.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <input
                      type="checkbox"
                      id="enviar-fornecedor"
                      checked={enviarAoFornecedor}
                      onChange={(e) => setEnviarAoFornecedor(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="enviar-fornecedor" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Enviar notificação ao fornecedor agora (email, notificação e WhatsApp)
                    </label>
                  </div>
                  {requisicaoSelecionada.contrato?.fornecedor && enviarAoFornecedor && (
                    <div className="space-y-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-sm font-medium text-gray-700">Contato do fornecedor para notificação (pode alterar)</p>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Email</label>
                        <input
                          type="email"
                          value={emailFornecedor}
                          onChange={(e) => setEmailFornecedor(e.target.value)}
                          placeholder="email@fornecedor.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Telefone (WhatsApp)</label>
                        <input
                          type="tel"
                          value={telefoneFornecedor}
                          onChange={(e) => setTelefoneFornecedor(e.target.value)}
                          placeholder="(00) 00000-0000"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : requisicaoSelecionada.contrato_id ? (
                <>
                  <div className="bg-blue-50 p-4 rounded-lg text-sm border border-blue-200">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-blue-800">Ordem de Fornecimento</p>
                        <p className="text-blue-700 mt-1">
                          Ao autorizar, será gerada uma Ordem de Fornecimento assinada digitalmente.
                          O <strong>PDF será gerado automaticamente</strong>. Você pode escolher se deseja enviar ao fornecedor agora ou depois.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <input
                      type="checkbox"
                      id="enviar-fornecedor-of"
                      checked={enviarAoFornecedor}
                      onChange={(e) => setEnviarAoFornecedor(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="enviar-fornecedor-of" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Enviar notificação ao fornecedor agora (email, notificação e WhatsApp)
                    </label>
                  </div>
                  {requisicaoSelecionada.contrato?.fornecedor && enviarAoFornecedor && (
                    <div className="space-y-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                      <p className="text-sm font-medium text-gray-700">Contato do fornecedor para notificação (pode alterar)</p>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Email</label>
                        <input
                          type="email"
                          value={emailFornecedor}
                          onChange={(e) => setEmailFornecedor(e.target.value)}
                          placeholder="email@fornecedor.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Telefone (WhatsApp)</label>
                        <input
                          type="tel"
                          value={telefoneFornecedor}
                          onChange={(e) => setTelefoneFornecedor(e.target.value)}
                          placeholder="(00) 00000-0000"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      </div>
                    </div>
                  )}
                </>
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

      {/* Modal Enviar/Reenviar ao Fornecedor */}
      <Dialog open={showEnviarFornecedor} onOpenChange={setShowEnviarFornecedor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-teal-600">
              Enviar ao Fornecedor
            </DialogTitle>
            <DialogDescription>
              Envia o PDF assinado da OS ao fornecedor por email, notificação no sistema e WhatsApp (se configurado).
            </DialogDescription>
          </DialogHeader>
          {requisicaoSelecionada && (
            <div className="space-y-4">
              <div className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                <p className="font-medium text-teal-900">{requisicaoSelecionada.numero}</p>
                {requisicaoSelecionada.contrato?.fornecedor && (
                  <p className="text-sm text-teal-700 mt-1">
                    Fornecedor: {requisicaoSelecionada.contrato.fornecedor.razao_social}
                  </p>
                )}
              </div>
              {requisicaoSelecionada.contrato?.fornecedor && (
                <div className="space-y-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">Contato (opcional - usa cadastro se vazio)</p>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Email</label>
                    <input
                      type="email"
                      value={emailEnviarFornecedor}
                      onChange={(e) => setEmailEnviarFornecedor(e.target.value)}
                      placeholder="email@fornecedor.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Telefone (WhatsApp)</label>
                    <input
                      type="tel"
                      value={telefoneEnviarFornecedor}
                      onChange={(e) => setTelefoneEnviarFornecedor(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnviarFornecedor(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEnviarAoFornecedor} disabled={!!enviandoFornecedorId} className="bg-teal-600 hover:bg-teal-700">
              {enviandoFornecedorId && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Histórico (OS ou OF) */}
      <Dialog open={showHistoricoOS} onOpenChange={setShowHistoricoOS}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico da Requisição {requisicaoSelecionada?.numero}
            </DialogTitle>
            <DialogDescription>
              Desde a criação do pedido até a autorização (quem criou, enviou para aprovação, autorizou)
            </DialogDescription>
          </DialogHeader>
          {carregandoHistoricoOS ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : historicoOS.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum histórico encontrado</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-0">
                {historicoOS.map((item, index) => {
                  const dataExibicao = item.data_evento || item.created_at;
                  const isVerde = item.tipo_acao === 'PEDIDO_CRIADO' || index % 2 === 0;
                  const labels: Record<string, string> = {
                    PEDIDO_CRIADO: 'PEDIDO CRIADO',
                    ENVIADA_APROVACAO: 'ENVIADA PARA APROVAÇÃO',
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
                  };
                  const icones: Record<string, string> = {
                    PEDIDO_CRIADO: '📝',
                    PEDIDO_AUTORIZADO: '✅',
                    ENVIADA_APROVACAO: '📤',
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
                  };
                  return (
                    <div key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
                      <div className="relative z-10 flex-shrink-0 w-12 flex justify-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isVerde ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          <span className="text-sm">{icones[item.tipo_acao] || '📋'}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="bg-white border rounded-lg p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-gray-900">
                              {labels[item.tipo_acao] || item.tipo_acao}
                            </p>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Clock className="h-4 w-4" />
                              {new Date(dataExibicao).toLocaleString('pt-BR')}
                            </div>
                          </div>
                          <div className="space-y-1 text-sm text-gray-600">
                            {requisicaoSelecionada && (
                              <>
                                <p><span className="font-medium text-gray-500">Nº do Pedido:</span> {requisicaoSelecionada.numero}</p>
                                <p><span className="font-medium text-gray-500">Fornecedor:</span> {requisicaoSelecionada.contrato?.fornecedor?.razao_social || '-'}</p>
                                <p><span className="font-medium text-gray-500">Secretaria:</span> {requisicaoSelecionada.orgao?.nome || '-'}</p>
                              </>
                            )}
                            <p><span className="font-medium text-gray-500">Tipo de Movimento:</span> {labels[item.tipo_acao] || item.tipo_acao}</p>
                            <p><span className="font-medium text-gray-500">Descrição:</span> {item.descricao}</p>
                            {(item as any).detalhes && (
                              <p><span className="font-medium text-gray-500">Detalhes:</span> <span className="text-blue-700">{(item as any).detalhes}</span></p>
                            )}
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

      {/* Modal Vincular Empenho (OS) */}
      <Dialog open={showVincularEmpenhoOS} onOpenChange={setShowVincularEmpenhoOS}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />
              Vincular Empenho — {requisicaoSelecionada?.numero}
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
                value={anoEmpenhoOS}
                onChange={e => setAnoEmpenhoOS(e.target.value)}
              >
                {[0, 1, 2].map(d => {
                  const y = (new Date().getFullYear() - d).toString();
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => requisicaoSelecionada && abrirVincularEmpenhoOS(requisicaoSelecionada)}
                disabled={loadingEmpenhosOS}
              >
                {loadingEmpenhosOS ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buscar'}
              </Button>
            </div>

            {loadingEmpenhosOS && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-500">Buscando empenhos...</span>
              </div>
            )}

            {!loadingEmpenhosOS && empenhosDisponiveisOS.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4 italic">Nenhum empenho encontrado para este contrato.</p>
            )}

            {!loadingEmpenhosOS && empenhosDisponiveisOS.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {empenhosDisponiveisOS.map((comp: any) => {
                  const num = comp.numero_empenho || comp.empenho?.numero_liquidacao || '';
                  const data = comp.empenho?.data || '';
                  const valor = comp.total_empenhado_bruto ?? comp.empenho?.valor ?? 0;
                  const credor = comp.empenho?.credor || '';
                  const key = num || `sem-${data}`;
                  const selecionado = empenhosSelecionadosOS.has(num);
                  const saldoVirtual = comp.saldo_virtual ?? comp.saldo_a_liquidar;
                  const comprometido = comp.comprometido ?? 0;
                  const ano = comp.ano_exercicio;
                  const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  return (
                    <div
                      key={key}
                      onClick={() => num && toggleEmpenhoOS(num)}
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
                            {num ? `#${num}${ano ? `-${ano}` : ''}` : 's/n'}
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

            {empenhosSelecionadosOS.size > 0 && (
              <div className="bg-blue-50 rounded-lg p-2 flex flex-wrap gap-1">
                <span className="text-xs text-blue-700 font-medium mr-1">Selecionados:</span>
                {Array.from(empenhosSelecionadosOS).map(n => (
                  <Badge key={n} variant="outline" className="font-mono text-xs bg-blue-100 border-blue-300 text-blue-800">
                    #{n}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVincularEmpenhoOS(false)}>Cancelar</Button>
            <Button onClick={salvarEmpenhosOS} disabled={salvandoEmpenhosOS} className="bg-blue-600 hover:bg-blue-700">
              {salvandoEmpenhosOS ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Salvar e Regerar PDF
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
