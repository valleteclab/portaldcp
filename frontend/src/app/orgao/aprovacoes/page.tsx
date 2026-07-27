'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  User,
  Calendar,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Building2,
  Unlock,
  Lock,
  ClipboardList,
  FileCheck,
  Eye,
  Send,
  TrendingUp,
  ChevronRight,
  Shield,
  RotateCcw,
  Download,
  Mail,
  MessageCircle,
  FileDown,
  PenLine,
  Paperclip,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { API_URL, authFetch } from '@/lib/api';

// ============ INTERFACES ============

interface ItemRequisicao {
  id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade_solicitada: number;
  valor_unitario: number | null;
  valor_total_estimado: number | null;
}

interface Requisicao {
  id: string;
  numero: string;
  tipo: string;
  setor_solicitante: string;
  justificativa: string;
  prioridade: string;
  data_solicitacao: string;
  usuario_solicitante_nome: string;
  valor_total_estimado: number;
  contrato?: {
    id: string;
    numero_contrato: string;
    fornecedor?: {
      razao_social: string;
    };
  };
  itens: ItemRequisicao[];
}

interface Contrato {
  id: string;
  numero_contrato: string;
  numero_processo: string;
  objeto: string;
  objeto_detalhado?: string;
  fornecedor_razao_social: string;
  fornecedor_cnpj: string;
  fornecedor?: {
    razao_social: string;
    cpf_cnpj: string;
    nome_fantasia?: string;
  };
  status: string;
  tipo: string;
  categoria: string;
  valor_inicial: number;
  valor_global: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  fiscal_nome?: string;
  observacoes?: string;
  created_at: string;
}

interface OSPendente {
  id: string;
  numero_os: string;
  descricao: string;
  valor_total: number;
  data_abertura: string;
  data_prazo: string;
  metrica: string;
  quantidade_metrica?: number;
  status: string;
  usuario_cadastro_nome?: string;
  created_at: string;
  numero_contrato?: string;
  objeto_contrato?: string;
  fornecedor_nome?: string;
  modalidade_execucao?: string;
}

interface MedicaoPendente {
  id: string;
  contrato_id?: string;
  numero_medicao: number;
  periodo_inicio: string;
  periodo_fim: string;
  valor_medido: number;
  valor_acumulado_atual: number;
  percentual_fisico_medido: number;
  percentual_fisico_acumulado: number;
  status: string;
  fornecedor_nome?: string;
  fornecedor_observacoes?: string;
  nota_fiscal_numero?: string;
  nota_fiscal_valor?: number;
  nota_fiscal_data?: string;
  data_submissao?: string;
  ateste_fiscal_nome?: string;
  ateste_data?: string;
  ateste_observacoes?: string;
  ateste_verificado_in_loco?: boolean;
  boletim_pdf_url?: string;
  created_at: string;
  contrato?: {
    id: string;
    numero_contrato: string;
    objeto: string;
    fornecedor_razao_social?: string;
    fornecedor?: { razao_social: string; cpf_cnpj?: string; nome_fantasia?: string };
  };
}

interface DemandaAprovacao {
  id: string;
  ano_referencia: number;
  unidade_requisitante: string;
  responsavel_nome?: string;
  status: 'ENVIADA' | 'EM_ANALISE';
  observacoes?: string;
  descricao_sucinta_objeto?: string;
  data_envio?: string;
  created_at: string;
  itens: {
    id: string;
    descricao_objeto: string;
    quantidade_estimada: number;
    valor_total_estimado?: number;
  }[];
}

// ============ CONSTANTS ============

const PRIORIDADE_COLORS: Record<string, string> = {
  URGENTE: 'bg-red-100 text-red-800',
  ALTA: 'bg-orange-100 text-orange-800',
  NORMAL: 'bg-blue-100 text-blue-800',
  BAIXA: 'bg-gray-100 text-gray-800',
};

const CATEGORIA_LABELS: Record<string, string> = {
  COMPRAS: 'Compras',
  SERVICOS: 'Serviços',
  OBRAS: 'Obras',
  LOCACAO: 'Locação',
  OUTROS: 'Outros',
};

// ============ HELPERS ============

const formatarData = (data: string) => {
  if (!data) return '-';
  const dateOnly = data.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return new Date(data).toLocaleDateString('pt-BR');
};

const formatarMoeda = (valor: number | null | undefined) => {
  if (valor === null || valor === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
};

const formatarCNPJ = (cnpj: string) => {
  if (!cnpj || cnpj.length < 14) return cnpj;
  const limpo = cnpj.replace(/\D/g, '');
  if (limpo.length === 14) {
    return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  if (limpo.length === 11) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cnpj;
};

// ============ MAIN COMPONENT ============

export default function CentralAprovacoesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contratos');

  // Permissões
  const [podeAprovarRequisicoes, setPodeAprovarRequisicoes] = useState(false);
  const [podeLiberarContratos, setPodeLiberarContratos] = useState(false);
  const [orgaoId, setOrgaoId] = useState<string | null>(null);

  // Dados
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [demandas, setDemandas] = useState<DemandaAprovacao[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [medicoes, setMedicoes] = useState<MedicaoPendente[]>([]);
  const [ordensServico, setOrdensServico] = useState<OSPendente[]>([]);

  // UI State
  const [loadingContratos, setLoadingContratos] = useState(false);
  const [loadingRequisicoes, setLoadingRequisicoes] = useState(false);
  const [loadingDemandas, setLoadingDemandas] = useState(false);
  const [loadingMedicoes, setLoadingMedicoes] = useState(false);
  const [loadingOS, setLoadingOS] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Discriminação e Execução Financeira (carregados ao expandir medição)
  const [discriminacoesAprov, setDiscriminacoesAprov] = useState<Record<string, any[]>>({});
  const [execucaoAprov, setExecucaoAprov] = useState<Record<string, any>>({});
  const [assinaturasAprov, setAssinaturasAprov] = useState<Record<string, any[]>>({});
  const [anexosAprov, setAnexosAprov] = useState<Record<string, any[]>>({});
  const [baixandoBoletim, setBaixandoBoletim] = useState<string | null>(null);

  const carregarDadosMedicaoExpanded = async (medicaoId: string, contratoId: string) => {
    if (discriminacoesAprov[medicaoId]) return; // já carregado
    try {
      const [discRes, execRes, assinRes, anexRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/discriminacoes`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/execucao-financeira?medicaoId=${medicaoId}`),
        authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/assinaturas`),
        authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/anexos`),
      ]);
      if (discRes.ok) {
        const discData = await discRes.json();
        setDiscriminacoesAprov(prev => ({ ...prev, [medicaoId]: discData }));
      }
      if (execRes.ok) {
        const execData = await execRes.json();
        setExecucaoAprov(prev => ({ ...prev, [medicaoId]: execData }));
      }
      if (assinRes.ok) {
        const assinData = await assinRes.json();
        setAssinaturasAprov(prev => ({ ...prev, [medicaoId]: Array.isArray(assinData) ? assinData : [] }));
      }
      if (anexRes.ok) {
        const anexData = await anexRes.json();
        setAnexosAprov(prev => ({ ...prev, [medicaoId]: Array.isArray(anexData) ? anexData : [] }));
      } else {
        setAnexosAprov(prev => ({ ...prev, [medicaoId]: [] }));
      }
    } catch { /* ignore */ }
  };

  const baixarBoletimAprov = async (medicao: MedicaoPendente) => {
    setBaixandoBoletim(medicao.id);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicao.id}/boletim-oficial`);
      if (!res.ok) { alert('Boletim não disponível'); return; }
      const boletim = await res.json();
      if (!boletim?.pdf_url) { alert('Boletim não disponível'); return; }
      const fileRes = await fetch(boletim.pdf_url.startsWith('http') ? boletim.pdf_url : `${API_URL}${boletim.pdf_url}`);
      if (!fileRes.ok) { alert('Erro ao baixar arquivo'); return; }
      const blob = await fileRes.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = boletim.filename || `boletim_medicao_${medicao.numero_medicao}.pdf`;
      a.click();
    } finally {
      setBaixandoBoletim(null);
    }
  };

  // Modais Requisição
  const [requisicaoSelecionada, setRequisicaoSelecionada] = useState<Requisicao | null>(null);
  const [showAprovarRequisicao, setShowAprovarRequisicao] = useState(false);
  const [showNegarRequisicao, setShowNegarRequisicao] = useState(false);
  const [showDevolverRequisicao, setShowDevolverRequisicao] = useState(false);
  const [showPosAprovacao, setShowPosAprovacao] = useState(false);
  const [posAprovacaoData, setPosAprovacaoData] = useState<{
    notificacoes?: { email?: boolean; whatsapp?: boolean };
    fornecedor_info?: { nome: string; email?: string | null; telefone?: string | null } | null;
    envio_automatico?: boolean;
    ordem_fornecimento_id?: string;
  } | null>(null);
  const [observacaoRequisicao, setObservacaoRequisicao] = useState('');
  const [motivoNegativaRequisicao, setMotivoNegativaRequisicao] = useState('');
  const [motivoDevolucaoRequisicao, setMotivoDevolucaoRequisicao] = useState('');
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [enviandoFornecedor, setEnviandoFornecedor] = useState<'email' | 'whatsapp' | null>(null);
  const [emailFornecedorEdit, setEmailFornecedorEdit] = useState('');
  const [telefoneFornecedorEdit, setTelefoneFornecedorEdit] = useState('');

  // Modais Contrato
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [showLiberarContrato, setShowLiberarContrato] = useState(false);
  const [showRejeitarContrato, setShowRejeitarContrato] = useState(false);
  const [motivoRejeicaoContrato, setMotivoRejeicaoContrato] = useState('');

  // Modais OS
  const [osSelecionada, setOsSelecionada] = useState<OSPendente | null>(null);
  const [showAprovarOS, setShowAprovarOS] = useState(false);
  const [showRejeitarOS, setShowRejeitarOS] = useState(false);
  const [observacaoOS, setObservacaoOS] = useState('');
  const [motivoRejeicaoOS, setMotivoRejeicaoOS] = useState('');

  // Modais Medição
  const [medicaoSelecionada, setMedicaoSelecionada] = useState<MedicaoPendente | null>(null);
  const [showAprovarMedicao, setShowAprovarMedicao] = useState(false);
  const [showRejeitarMedicao, setShowRejeitarMedicao] = useState(false);
  const [observacaoMedicao, setObservacaoMedicao] = useState('');
  const [motivoRejeicaoMedicao, setMotivoRejeicaoMedicao] = useState('');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (!tabParam) return;
    const tabsPermitidas = new Set(['contratos', 'demandas', 'requisicoes', 'medicoes', 'ordens-servico']);
    if (tabsPermitidas.has(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Verifica permissões
  useEffect(() => {
    try {
      const usuarioStr = localStorage.getItem('usuario');
      const orgaoStr = localStorage.getItem('orgao');

      if (usuarioStr) {
        const usuario = JSON.parse(usuarioStr);
        setPodeAprovarRequisicoes(usuario.pode_aprovar_requisicoes === true);
        setPodeLiberarContratos(usuario.pode_liberar_contratos === true);
        setOrgaoId(usuario.orgao_id);
      } else if (orgaoStr) {
        // Login direto como órgão — tem todas as permissões
        const orgao = JSON.parse(orgaoStr);
        setPodeAprovarRequisicoes(true);
        setPodeLiberarContratos(true);
        setOrgaoId(orgao.id);
      } else {
        router.push('/orgao-login');
        return;
      }
    } catch (e) {
      console.error('Erro ao verificar permissões:', e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!loading && orgaoId) {
      if (podeLiberarContratos) carregarContratos();
      if (podeAprovarRequisicoes) carregarDemandas();
      if (podeAprovarRequisicoes) carregarRequisicoes();
      carregarMedicoes();
      carregarOrdensServico();
    }
  }, [loading, orgaoId, podeLiberarContratos, podeAprovarRequisicoes]);

  useEffect(() => {
    if (!orgaoId) return;
    const interval = setInterval(() => {
      if (podeAprovarRequisicoes) carregarRequisicoes();
      if (podeAprovarRequisicoes) carregarDemandas();
      carregarMedicoes();
      carregarOrdensServico();
    }, 30000);
    return () => clearInterval(interval);
  }, [orgaoId, podeAprovarRequisicoes]);

  // ============ CARREGAR DADOS ============

  const carregarContratos = async () => {
    setLoadingContratos(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos?status=AGUARDANDO_LIBERACAO&orgaoId=${orgaoId}`);
      if (res.ok) {
        const json = await res.json();
        setContratos(Array.isArray(json) ? json : (json.data || []));
      }
    } catch (error) {
      console.error('Erro ao carregar contratos:', error);
    } finally {
      setLoadingContratos(false);
    }
  };

  const carregarRequisicoes = async () => {
    setLoadingRequisicoes(true);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/pendentes`);
      if (res.ok) {
        setRequisicoes(await res.json());
      }
    } catch (error) {
      console.error('Erro ao carregar requisições:', error);
    } finally {
      setLoadingRequisicoes(false);
    }
  };

  const carregarDemandas = async () => {
    if (!orgaoId) return;
    setLoadingDemandas(true);
    try {
      const [enviadasRes, analiseRes] = await Promise.all([
        authFetch(`${API_URL}/api/demandas?orgaoId=${orgaoId}&status=ENVIADA`),
        authFetch(`${API_URL}/api/demandas?orgaoId=${orgaoId}&status=EM_ANALISE`),
      ]);
      const enviadas = enviadasRes.ok ? await enviadasRes.json() : [];
      const analise = analiseRes.ok ? await analiseRes.json() : [];
      setDemandas([...(Array.isArray(enviadas) ? enviadas : []), ...(Array.isArray(analise) ? analise : [])]);
    } catch (error) {
      console.error('Erro ao carregar demandas:', error);
    } finally {
      setLoadingDemandas(false);
    }
  };

  const carregarMedicoes = async () => {
    setLoadingMedicoes(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/pendentes-aprovacao?orgaoId=${orgaoId}`);
      if (res.ok) {
        setMedicoes(await res.json());
      }
    } catch (error) {
      console.error('Erro ao carregar medições:', error);
    } finally {
      setLoadingMedicoes(false);
    }
  };

  const carregarOrdensServico = async () => {
    setLoadingOS(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/ordens-servico/pendentes-aprovacao?orgaoId=${orgaoId}`);
      if (res.ok) {
        setOrdensServico(await res.json());
      }
    } catch (error) {
      console.error('Erro ao carregar OS:', error);
    } finally {
      setLoadingOS(false);
    }
  };

  const recarregarTudo = () => {
    if (podeLiberarContratos) carregarContratos();
    if (podeAprovarRequisicoes) carregarDemandas();
    if (podeAprovarRequisicoes) carregarRequisicoes();
    carregarMedicoes();
    carregarOrdensServico();
  };

  // ============ AÇÕES CONTRATOS ============

  const liberarContrato = async () => {
    if (!contratoSelecionado) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoSelecionado.id}/liberar`, { method: 'POST' });
      if (res.ok) {
        setShowLiberarContrato(false);
        await carregarContratos();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao liberar contrato');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao liberar contrato');
    } finally {
      setProcessando(false);
    }
  };

  const rejeitarContrato = async () => {
    if (!contratoSelecionado) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoSelecionado.id}/rejeitar-liberacao`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivoRejeicaoContrato }),
      });
      if (res.ok) {
        setShowRejeitarContrato(false);
        setMotivoRejeicaoContrato('');
        await carregarContratos();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao rejeitar contrato');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao rejeitar liberação');
    } finally {
      setProcessando(false);
    }
  };

  // ============ AÇÕES REQUISIÇÕES ============

  const aprovarRequisicao = async () => {
    if (!requisicaoSelecionada) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/autorizar`, {
        method: 'POST',
        body: JSON.stringify({ observacao: observacaoRequisicao }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowAprovarRequisicao(false);
        setPosAprovacaoData({
          notificacoes: data.notificacoes_fornecedor,
          fornecedor_info: data.fornecedor_info,
          envio_automatico: data.envio_automatico,
          ordem_fornecimento_id: data.ordem_fornecimento_id,
        });
        setEmailFornecedorEdit(data.fornecedor_info?.email || '');
        setTelefoneFornecedorEdit(data.fornecedor_info?.telefone || '');
        setShowPosAprovacao(true);
        await carregarRequisicoes();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao aprovar requisição');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao aprovar requisição');
    } finally {
      setProcessando(false);
    }
  };

  const negarRequisicao = async () => {
    if (!requisicaoSelecionada || !motivoNegativaRequisicao.trim()) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/negar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivoNegativaRequisicao }),
      });
      if (res.ok) {
        setShowNegarRequisicao(false);
        setMotivoNegativaRequisicao('');
        await carregarRequisicoes();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao negar requisição');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao negar requisição');
    } finally {
      setProcessando(false);
    }
  };

  const aprovarDemanda = async (demanda: DemandaAprovacao) => {
    if (!confirm(`Aprovar a demanda "${demanda.unidade_requisitante}" para o PCA ${demanda.ano_referencia}?`)) return;
    setProcessando(true);
    try {
      const usuarioStr = localStorage.getItem('usuario');
      const usuario = usuarioStr ? JSON.parse(usuarioStr) : {};
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/aprovar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprovadoPor: usuario.nome || usuario.email || 'Usuário' }),
      });
      if (res.ok) {
        await carregarDemandas();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Erro ao aprovar demanda');
      }
    } finally {
      setProcessando(false);
    }
  };

  const rejeitarDemanda = async (demanda: DemandaAprovacao) => {
    const motivo = prompt(`Informe o motivo da rejeição da demanda "${demanda.unidade_requisitante}":`);
    if (!motivo?.trim()) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/rejeitar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      if (res.ok) {
        await carregarDemandas();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Erro ao rejeitar demanda');
      }
    } finally {
      setProcessando(false);
    }
  };

  const devolverRequisicao = async () => {
    if (!requisicaoSelecionada || !motivoDevolucaoRequisicao.trim()) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/devolver`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivoDevolucaoRequisicao }),
      });
      if (res.ok) {
        setShowDevolverRequisicao(false);
        setMotivoDevolucaoRequisicao('');
        await carregarRequisicoes();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao devolver requisição');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao devolver requisição');
    } finally {
      setProcessando(false);
    }
  };

  const baixarPdfRequisicao = async () => {
    if (!requisicaoSelecionada) return;
    setBaixandoPdf(true);
    try {
      const isOF = !!posAprovacaoData?.ordem_fornecimento_id;
      const url = isOF
        ? `${API_URL}/api/almoxarifado/ordens/${posAprovacaoData!.ordem_fornecimento_id}/pdf`
        : `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/pdf-assinado`;
      const res = await authFetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const urlObj = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = urlObj;
        link.download = isOF ? `OF_${requisicaoSelecionada.numero.replace(/\//g, '_')}_assinada.pdf` : `OS_${requisicaoSelecionada.numero.replace(/\//g, '_')}_assinada.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(urlObj);
      } else {
        alert(isOF ? 'PDF não disponível. A OF pode ainda estar sendo processada.' : 'PDF não disponível. A OS pode ainda estar sendo processada.');
      }
    } catch {
      alert('Erro ao baixar PDF');
    } finally {
      setBaixandoPdf(false);
    }
  };

  const enviarAoFornecedorRequisicao = async (tipo: 'email' | 'whatsapp') => {
    if (!requisicaoSelecionada) return;
    setEnviandoFornecedor(tipo);
    try {
      const body: Record<string, string> = { tipo };
      if (tipo === 'email' && emailFornecedorEdit) body.email_fornecedor = emailFornecedorEdit;
      if (tipo === 'whatsapp' && telefoneFornecedorEdit) body.telefone_fornecedor = telefoneFornecedorEdit;

      const isOF = !!posAprovacaoData?.ordem_fornecimento_id;
      const url = isOF
        ? `${API_URL}/api/almoxarifado/ordens/${posAprovacaoData!.ordem_fornecimento_id}/enviar-ao-fornecedor`
        : `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/enviar-ao-fornecedor`;

      const res = await authFetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const n = data.notificacoes_fornecedor;
        if (tipo === 'email') {
          alert(n?.email ? 'Email enviado ao fornecedor!' : 'Email não pôde ser enviado. Verifique o endereço.');
        } else {
          alert(n?.whatsapp ? 'WhatsApp enviado ao fornecedor!' : 'WhatsApp não pôde ser enviado. Verifique o telefone.');
        }
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao enviar notificação');
      }
    } catch {
      alert('Erro ao enviar notificação ao fornecedor');
    } finally {
      setEnviandoFornecedor(null);
    }
  };

  // ============ AÇÕES ORDENS DE SERVIÇO ============

  const aprovarOrdemServico = async () => {
    if (!osSelecionada) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/ordens-servico/${osSelecionada.id}/aprovar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacao: observacaoOS || undefined }),
      });
      if (res.ok) {
        setShowAprovarOS(false);
        setObservacaoOS('');
        await carregarOrdensServico();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao aprovar OS');
      }
    } catch (error) {
      alert('Erro ao aprovar OS');
    } finally {
      setProcessando(false);
    }
  };

  const rejeitarOrdemServico = async () => {
    if (!osSelecionada || !motivoRejeicaoOS.trim()) return;
    setProcessando(true);
    try {
      const res = await authFetch(`${API_URL}/api/contratos/ordens-servico/${osSelecionada.id}/rejeitar-aprovacao`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacao: motivoRejeicaoOS }),
      });
      if (res.ok) {
        setShowRejeitarOS(false);
        setMotivoRejeicaoOS('');
        await carregarOrdensServico();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao rejeitar OS');
      }
    } catch (error) {
      alert('Erro ao rejeitar OS');
    } finally {
      setProcessando(false);
    }
  };

  // ============ AÇÕES MEDIÇÕES ============

  const aprovarMedicao = async () => {
    if (!medicaoSelecionada) return;
    setProcessando(true);
    try {
      const usuarioStr = localStorage.getItem('usuario');
      const orgaoStr = localStorage.getItem('orgao');
      let aprovadorId = '';
      let aprovadorNome = '';
      if (usuarioStr) {
        const u = JSON.parse(usuarioStr);
        aprovadorId = u.id;
        aprovadorNome = u.nome || u.email;
      } else if (orgaoStr) {
        const o = JSON.parse(orgaoStr);
        aprovadorId = o.id;
        aprovadorNome = o.nome || o.razao_social;
      }

      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoSelecionada.id}/aprovar`, {
        method: 'PATCH',
        body: JSON.stringify({
          aprovador_id: aprovadorId,
          aprovador_nome: aprovadorNome,
        }),
      });
      if (res.ok) {
        setShowAprovarMedicao(false);
        setObservacaoMedicao('');
        await carregarMedicoes();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao aprovar medição');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao aprovar medição');
    } finally {
      setProcessando(false);
    }
  };

  const rejeitarMedicao = async () => {
    if (!medicaoSelecionada || !motivoRejeicaoMedicao.trim()) return;
    setProcessando(true);
    try {
      const usuarioStr = localStorage.getItem('usuario');
      const orgaoStr = localStorage.getItem('orgao');
      let aprovadorId = '';
      let aprovadorNome = '';
      if (usuarioStr) {
        const u = JSON.parse(usuarioStr);
        aprovadorId = u.id;
        aprovadorNome = u.nome || u.email;
      } else if (orgaoStr) {
        const o = JSON.parse(orgaoStr);
        aprovadorId = o.id;
        aprovadorNome = o.nome || o.razao_social;
      }

      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoSelecionada.id}/rejeitar`, {
        method: 'PATCH',
        body: JSON.stringify({
          aprovador_id: aprovadorId,
          aprovador_nome: aprovadorNome,
          observacao: motivoRejeicaoMedicao,
        }),
      });
      if (res.ok) {
        setShowRejeitarMedicao(false);
        setMotivoRejeicaoMedicao('');
        await carregarMedicoes();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error.message || 'Erro ao rejeitar medição');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao rejeitar medição');
    } finally {
      setProcessando(false);
    }
  };

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!podeAprovarRequisicoes && !podeLiberarContratos) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Lock className="h-12 w-12 text-gray-400" />
        <h2 className="text-xl font-semibold text-gray-700">Sem permissão</h2>
        <p className="text-gray-500">Você não possui permissão para acessar a central de aprovações.</p>
        <Button variant="outline" onClick={() => router.push('/orgao')}>Voltar ao Dashboard</Button>
      </div>
    );
  }

  const totalPendentes = contratos.length + demandas.length + requisicoes.length + medicoes.length + ordensServico.length;
  const valorTotalContratos = contratos.reduce((acc, c) => acc + Number(c.valor_global || 0), 0);
  const valorTotalDemandas = demandas.reduce(
    (acc, d) => acc + (d.itens || []).reduce((sum, item) => sum + Number(item.valor_total_estimado || 0), 0),
    0,
  );
  const valorTotalRequisicoes = requisicoes.reduce((acc, r) => acc + Number(r.valor_total_estimado || 0), 0);
  const valorTotalMedicoes = medicoes.reduce((acc, m) => acc + Number(m.valor_medido || 0), 0);
  const valorTotalOS = ordensServico.reduce((acc, os) => acc + Number(os.valor_total || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-7 w-7 text-amber-600" />
            Central de Aprovações
          </h1>
          <p className="text-gray-500 mt-1">
            Itens aguardando sua autorização
          </p>
        </div>
        <Button variant="outline" onClick={recarregarTudo}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={totalPendentes > 0 ? 'border-amber-200 bg-amber-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Total Pendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{totalPendentes}</div>
          </CardContent>
        </Card>

        {podeLiberarContratos && (
          <Card className={contratos.length > 0 ? 'border-blue-200 bg-blue-50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-blue-500" />
                Contratos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{contratos.length}</div>
              <p className="text-xs text-gray-500 mt-1">{formatarMoeda(valorTotalContratos)}</p>
            </CardContent>
          </Card>
        )}

        {podeAprovarRequisicoes && (
          <Card className={demandas.length > 0 ? 'border-amber-200 bg-amber-50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-500" />
                Demandas DFD
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{demandas.length}</div>
              <p className="text-xs text-gray-500 mt-1">{formatarMoeda(valorTotalDemandas)}</p>
            </CardContent>
          </Card>
        )}

        {podeAprovarRequisicoes && (
          <Card className={requisicoes.length > 0 ? 'border-purple-200 bg-purple-50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-purple-500" />
                Requisições
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{requisicoes.length}</div>
              <p className="text-xs text-gray-500 mt-1">{formatarMoeda(valorTotalRequisicoes)}</p>
            </CardContent>
          </Card>
        )}

        <Card className={medicoes.length > 0 ? 'border-emerald-200 bg-emerald-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Medições
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{medicoes.length}</div>
            <p className="text-xs text-gray-500 mt-1">{formatarMoeda(valorTotalMedicoes)}</p>
          </CardContent>
        </Card>

        <Card className={ordensServico.length > 0 ? 'border-indigo-200 bg-indigo-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-indigo-500" />
              Ordens de Serviço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">{ordensServico.length}</div>
            <p className="text-xs text-gray-500 mt-1">{formatarMoeda(valorTotalOS)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Valor Total Pendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-700">
              {formatarMoeda(valorTotalContratos + valorTotalDemandas + valorTotalRequisicoes + valorTotalMedicoes + valorTotalOS)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {podeLiberarContratos && (
            <TabsTrigger value="contratos" className="flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Contratos
              {contratos.length > 0 && (
                <Badge className="ml-1 bg-blue-600 text-white text-xs px-1.5 py-0">{contratos.length}</Badge>
              )}
            </TabsTrigger>
          )}
          {podeAprovarRequisicoes && (
            <TabsTrigger value="demandas" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Demandas DFD
              {demandas.length > 0 && (
                <Badge className="ml-1 bg-amber-600 text-white text-xs px-1.5 py-0">{demandas.length}</Badge>
              )}
            </TabsTrigger>
          )}
          {podeAprovarRequisicoes && (
            <TabsTrigger value="requisicoes" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Requisições
              {requisicoes.length > 0 && (
                <Badge className="ml-1 bg-purple-600 text-white text-xs px-1.5 py-0">{requisicoes.length}</Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="medicoes" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Medições
            {medicoes.length > 0 && (
              <Badge className="ml-1 bg-emerald-600 text-white text-xs px-1.5 py-0">{medicoes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ordens-servico" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Ordens de Serviço
            {ordensServico.length > 0 && (
              <Badge className="ml-1 bg-blue-600 text-white text-xs px-1.5 py-0">{ordensServico.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB DEMANDAS DFD ============ */}
        <TabsContent value="demandas" className="space-y-4">
          {loadingDemandas ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : demandas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma demanda pendente</h3>
                <p className="text-gray-500">Todas as demandas DFD foram processadas.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {demandas.map((demanda) => {
                const valorDemanda = (demanda.itens || []).reduce((sum, item) => sum + Number(item.valor_total_estimado || 0), 0);
                return (
                  <Card key={demanda.id} className="overflow-hidden border-l-4 border-l-amber-400">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-lg text-gray-900 truncate">{demanda.unidade_requisitante}</h3>
                            <Badge className="bg-amber-100 text-amber-800">
                              {demanda.status === 'EM_ANALISE' ? 'Em análise' : 'Aguardando aprovação'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            PCA {demanda.ano_referencia} • Responsável: {demanda.responsavel_nome || 'Não informado'}
                          </p>
                          {demanda.descricao_sucinta_objeto && (
                            <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap break-words">
                              {demanda.descricao_sucinta_objeto}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">{demanda.itens?.length || 0} itens</p>
                          <p className="font-bold text-blue-700">{formatarMoeda(valorDemanda)}</p>
                        </div>
                      </div>

                      {demanda.observacoes && (
                        <div className="mt-4 rounded-lg bg-gray-50 border p-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Justificativa</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{demanda.observacoes}</p>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => aprovarDemanda(demanda)}
                          disabled={processando}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => rejeitarDemanda(demanda)}
                          disabled={processando}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Rejeitar
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/orgao/demandas/${demanda.id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            Ver DFD
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============ TAB CONTRATOS ============ */}
        <TabsContent value="contratos" className="space-y-4">
          {loadingContratos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : contratos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum contrato pendente</h3>
                <p className="text-gray-500">Todos os contratos foram liberados.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {contratos.map((contrato) => (
                <Card key={contrato.id} className="overflow-hidden border-l-4 border-l-amber-400 hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    {/* Header do Card */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-lg text-gray-900">{contrato.numero_contrato}</span>
                          <Badge className="bg-amber-100 text-amber-800 text-xs">
                            <Lock className="w-3 h-3 mr-1" />
                            Aguardando Liberação
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">Processo: {contrato.numero_processo || '-'}</p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {CATEGORIA_LABELS[contrato.categoria] || contrato.categoria}
                      </Badge>
                    </div>

                    {/* Empresa */}
                    <div className="bg-slate-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-4 w-4 text-slate-600" />
                        <span className="font-semibold text-slate-800">
                          {contrato.fornecedor?.razao_social || contrato.fornecedor_razao_social || 'Não informado'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 ml-6">
                        CNPJ: {formatarCNPJ(contrato.fornecedor?.cpf_cnpj || contrato.fornecedor_cnpj || '')}
                      </p>
                      {contrato.fornecedor?.nome_fantasia && (
                        <p className="text-xs text-slate-500 ml-6">
                          Nome Fantasia: {contrato.fornecedor.nome_fantasia}
                        </p>
                      )}
                    </div>

                    {/* Objeto */}
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Objeto</p>
                      <p className="text-sm text-gray-700 line-clamp-2">{contrato.objeto}</p>
                    </div>

                    {/* Grid de informações */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-blue-50 rounded-lg p-2.5">
                        <p className="text-xs text-blue-600 font-medium">Valor Global</p>
                        <p className="text-base font-bold text-blue-700">{formatarMoeda(contrato.valor_global)}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2.5">
                        <p className="text-xs text-green-600 font-medium">Valor Inicial</p>
                        <p className="text-base font-bold text-green-700">{formatarMoeda(contrato.valor_inicial)}</p>
                      </div>
                    </div>

                    {/* Vigência */}
                    <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                      <div>
                        <p className="text-gray-500">Assinatura</p>
                        <p className="font-medium">{formatarData(contrato.data_assinatura)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Início Vigência</p>
                        <p className="font-medium">{formatarData(contrato.data_vigencia_inicio)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Fim Vigência</p>
                        <p className="font-medium">{formatarData(contrato.data_vigencia_fim)}</p>
                      </div>
                    </div>

                    {/* Fiscal */}
                    {contrato.fiscal_nome && (
                      <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                        <User className="h-3.5 w-3.5" />
                        <span>Fiscal: <strong>{contrato.fiscal_nome}</strong></span>
                      </div>
                    )}

                    {/* Criado em */}
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Criado em {formatarData(contrato.created_at)}</span>
                    </div>

                    {/* Ações */}
                    <div className="flex gap-2 pt-3 border-t">
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => { setContratoSelecionado(contrato); setShowLiberarContrato(true); }}
                      >
                        <Unlock className="h-4 w-4 mr-1" />
                        Liberar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => { setContratoSelecionado(contrato); setMotivoRejeicaoContrato(''); setShowRejeitarContrato(true); }}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Rejeitar
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/orgao/contratos/${contrato.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============ TAB REQUISIÇÕES ============ */}
        <TabsContent value="requisicoes" className="space-y-4">
          {loadingRequisicoes ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            </div>
          ) : requisicoes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma requisição pendente</h3>
                <p className="text-gray-500">Todas as requisições foram processadas.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {requisicoes.map((requisicao) => (
                <Card key={requisicao.id} className="overflow-hidden">
                  <Collapsible open={expandedId === requisicao.id} onOpenChange={() => setExpandedId(expandedId === requisicao.id ? null : requisicao.id)}>
                    <div className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-lg">{requisicao.numero}</span>
                            <Badge className={PRIORIDADE_COLORS[requisicao.prioridade]}>
                              {requisicao.prioridade}
                            </Badge>
                            <Badge variant="outline" className={requisicao.tipo === 'ORDEM_SERVICO' ? 'border-indigo-300 text-indigo-700 bg-indigo-50' : ''}>
                              {requisicao.tipo === 'ORDEM_SERVICO' ? 'Ordem de Serviço' : requisicao.tipo === 'MATERIAL' ? 'Material' : requisicao.tipo === 'SERVICO' ? 'Serviço' : requisicao.tipo}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-1 text-gray-600">
                              <User className="h-4 w-4" />
                              <span>{requisicao.usuario_solicitante_nome}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-600">
                              <FileText className="h-4 w-4" />
                              <span>{requisicao.setor_solicitante}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-600">
                              <Calendar className="h-4 w-4" />
                              <span>{formatarData(requisicao.data_solicitacao)}</span>
                            </div>
                            <div className="flex items-center gap-1 font-semibold text-blue-600">
                              <DollarSign className="h-4 w-4" />
                              <span>{formatarMoeda(requisicao.valor_total_estimado)}</span>
                            </div>
                          </div>

                          {requisicao.contrato && (
                            <div className="mt-2 text-sm text-gray-600">
                              <span className="font-medium">Contrato:</span>{' '}
                              {requisicao.contrato.numero_contrato}
                              {requisicao.contrato.fornecedor && ` - ${requisicao.contrato.fornecedor.razao_social}`}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm">
                              {expandedId === requisicao.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => { setRequisicaoSelecionada(requisicao); setObservacaoRequisicao(''); setShowAprovarRequisicao(true); }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { setRequisicaoSelecionada(requisicao); setMotivoNegativaRequisicao(''); setShowNegarRequisicao(true); }}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Negar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-amber-600 border-amber-300 hover:bg-amber-50"
                            onClick={() => { setRequisicaoSelecionada(requisicao); setMotivoDevolucaoRequisicao(''); setShowDevolverRequisicao(true); }}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Devolver
                          </Button>
                        </div>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 border-t bg-gray-50">
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Justificativa</h4>
                          <p className="text-sm text-gray-600 bg-white p-3 rounded-md">{requisicao.justificativa}</p>
                        </div>

                        {requisicao.tipo === 'ORDEM_SERVICO' ? (
                          <div className="mt-4 space-y-4">
                            <div>
                              <h4 className="font-medium mb-2">Dados da Ordem de Serviço</h4>
                              <div className="bg-white p-4 rounded-md space-y-2 text-sm">
                                {(requisicao as any).descricao_os && (
                                  <div><span className="text-gray-500">Objeto da OS:</span> <strong>{(requisicao as any).descricao_os}</strong></div>
                                )}
                                {(requisicao as any).local_execucao && (
                                  <div><span className="text-gray-500">Local de Execução:</span> <strong>{(requisicao as any).local_execucao}</strong></div>
                                )}
                                {(requisicao as any).modo_os && (
                                  <div><span className="text-gray-500">Modalidade:</span> <strong>{(requisicao as any).modo_os === 'ORDEM_GLOBAL' ? 'Ordem Global (todos os itens)' : 'Ordem por Demanda'}</strong></div>
                                )}
                                <div className="flex flex-wrap gap-4">
                                  {(requisicao as any).data_inicio_prevista && (
                                    <span><span className="text-gray-500">Início:</span> <strong>{formatarData((requisicao as any).data_inicio_prevista)}</strong></span>
                                  )}
                                  {(requisicao as any).data_fim_prevista && (
                                    <span><span className="text-gray-500">Fim:</span> <strong>{formatarData((requisicao as any).data_fim_prevista)}</strong></span>
                                  )}
                                  {(requisicao as any).prazo_execucao_dias && (
                                    <span><span className="text-gray-500">Prazo:</span> <strong>{(requisicao as any).prazo_execucao_dias} dias</strong></span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-4">
                                  {(requisicao as any).responsavel_tecnico && (
                                    <span><span className="text-gray-500">Resp. Técnico:</span> <strong>{(requisicao as any).responsavel_tecnico}</strong></span>
                                  )}
                                  {(requisicao as any).fiscal_contrato_nome && (
                                    <span><span className="text-gray-500">Fiscal:</span> <strong>{(requisicao as any).fiscal_contrato_nome}</strong></span>
                                  )}
                                </div>
                                {(requisicao as any).contrato?.fornecedor && (
                                  <div className="flex flex-wrap gap-4 pt-1 border-t">
                                    <span><span className="text-gray-500">Fornecedor:</span> <strong>{(requisicao as any).contrato.fornecedor.razao_social}</strong></span>
                                    {(requisicao as any).contrato.fornecedor.cpf_cnpj && (
                                      <span><span className="text-gray-500">CNPJ/CPF:</span> <strong>{(requisicao as any).contrato.fornecedor.cpf_cnpj}</strong></span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {(requisicao as any).itensOS?.length > 0 && (
                              <div>
                                <h4 className="font-medium mb-2">Itens da OS ({(requisicao as any).itensOS.length})</h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Descrição</TableHead>
                                      <TableHead className="text-center">Unidade</TableHead>
                                      <TableHead className="text-right">Qtd.</TableHead>
                                      <TableHead className="text-right">Meses</TableHead>
                                      <TableHead className="text-right">Val. Mensal</TableHead>
                                      <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(requisicao as any).itensOS.map((item: any) => {
                                      const ic = item.itemCronograma || {}
                                      const qtd = Number(item.quantidade_solicitada)
                                      const vlUnit = Number(ic.valor_unitario ?? 0)
                                      // meses_solicitados: what was requested in the OS (not the contract total)
                                      const meses = item.meses_solicitados ? Number(item.meses_solicitados) : null
                                      // vlMensal: per-period value from the contract item (ic.quantidade × vlUnit)
                                      const vlMensal = ic.valor_mensal ?? (Number(ic.quantidade ?? 0) * vlUnit)
                                      // total: qtd (já incorpora meses × qty_per_period) × vlUnit
                                      const total = qtd * vlUnit
                                      return (
                                        <TableRow key={item.id}>
                                          <TableCell>
                                            {ic.descricao || '-'}
                                            {/^(SINAPRO|Terceiros|Mídia)/.test(ic.observacoes || '') && (
                                              <p className="text-xs text-gray-500 mt-0.5">{ic.observacoes}</p>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-center">{ic.unidade_medida || '-'}</TableCell>
                                          <TableCell className="text-right">
                                            {String(ic.unidade_medida || '').toUpperCase() === 'MENSAL' && qtd > 0 && Math.abs(qtd - Math.round(qtd)) > 0.0001
                                              ? `${Math.round(qtd * 30)} dias`
                                              : qtd.toLocaleString('pt-BR')}
                                          </TableCell>
                                          <TableCell className="text-right">{meses ?? '-'}</TableCell>
                                          <TableCell className="text-right">{formatarMoeda(vlMensal)}</TableCell>
                                          <TableCell className="text-right font-medium">{formatarMoeda(total)}</TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}

                            {(requisicao as any).etapasOS?.length > 0 && (
                              <div>
                                <h4 className="font-medium mb-2">Etapas da OS ({(requisicao as any).etapasOS.length})</h4>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Etapa</TableHead>
                                      <TableHead className="text-right">% Solicitado</TableHead>
                                      <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(requisicao as any).etapasOS.map((e: any) => (
                                      <TableRow key={e.id}>
                                        <TableCell>{e.etapa?.descricao || '-'}</TableCell>
                                        <TableCell className="text-right">{e.percentual_solicitado ?? '-'}%</TableCell>
                                        <TableCell className="text-right font-medium">{formatarMoeda(e.valor_solicitado ?? 0)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4">
                            <h4 className="font-medium mb-2">Itens ({requisicao.itens?.length || 0})</h4>
                            <Table className="table-fixed">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-16">#</TableHead>
                                  <TableHead>Descrição</TableHead>
                                  <TableHead className="text-center">Unid.</TableHead>
                                  <TableHead className="text-right">Qtd.</TableHead>
                                  <TableHead className="text-right">Valor Unit.</TableHead>
                                  <TableHead className="text-right">Valor Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {requisicao.itens?.map((item) => (
                                  <TableRow key={item.id}>
                                    <TableCell className="font-mono">{item.numero_item}</TableCell>
                                    <TableCell>{item.descricao}</TableCell>
                                    <TableCell className="text-center">{item.unidade_medida}</TableCell>
                                    <TableCell className="text-right">{item.quantidade_solicitada}</TableCell>
                                    <TableCell className="text-right">{formatarMoeda(item.valor_unitario)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatarMoeda(item.valor_total_estimado)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============ TAB MEDIÇÕES ============ */}
        <TabsContent value="medicoes" className="space-y-4">
          {loadingMedicoes ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : medicoes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma medição pendente</h3>
                <p className="text-gray-500">Todas as medições foram processadas.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {medicoes.map((medicao) => (
                <Card key={medicao.id} className="overflow-hidden border-l-4 border-l-emerald-400 hover:shadow-md transition-shadow">
                  <Collapsible open={expandedId === medicao.id} onOpenChange={() => {
                    const newId = expandedId === medicao.id ? null : medicao.id;
                    setExpandedId(newId);
                    const contratoId = medicao.contrato?.id || medicao.contrato_id;
                    if (newId && contratoId) {
                      carregarDadosMedicaoExpanded(medicao.id, contratoId);
                    }
                  }}>
                    <div className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-lg">Medição #{medicao.numero_medicao}</span>
                            <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                              <Shield className="w-3 h-3 mr-1" />
                              Aguardando Aprovação
                            </Badge>
                            {medicao.contrato && (
                              <Badge variant="outline" className="text-xs">
                                {medicao.contrato.numero_contrato}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-1 text-gray-600">
                              <Calendar className="h-4 w-4" />
                              <span>{formatarData(medicao.periodo_inicio)} a {formatarData(medicao.periodo_fim)}</span>
                            </div>
                            <div className="flex items-center gap-1 font-semibold text-emerald-600">
                              <DollarSign className="h-4 w-4" />
                              <span>{formatarMoeda(medicao.valor_medido)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-600">
                              <TrendingUp className="h-4 w-4" />
                              <span>{Number(medicao.percentual_fisico_medido || 0).toFixed(1)}% físico</span>
                            </div>
                            {medicao.ateste_fiscal_nome && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <User className="h-4 w-4" />
                                <span>Atestado por: {medicao.ateste_fiscal_nome}</span>
                              </div>
                            )}
                          </div>

                          {medicao.contrato && (
                            <div className="mt-2 text-sm text-gray-600">
                              <span className="font-medium">Fornecedor:</span>{' '}
                              {medicao.contrato.fornecedor?.razao_social || medicao.contrato.fornecedor_razao_social || '-'}
                              {' · '}
                              <span className="font-medium">Objeto:</span>{' '}
                              <span className="line-clamp-1">{medicao.contrato.objeto}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm">
                              {expandedId === medicao.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                          {medicao.boletim_pdf_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              title="Baixar Boletim Assinado"
                              disabled={baixandoBoletim === medicao.id}
                              onClick={() => baixarBoletimAprov(medicao)}
                            >
                              {baixandoBoletim === medicao.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <FileDown className="h-4 w-4" />}
                              <span className="ml-1 hidden sm:inline">Boletim</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => { setMedicaoSelecionada(medicao); setObservacaoMedicao(''); setShowAprovarMedicao(true); }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { setMedicaoSelecionada(medicao); setMotivoRejeicaoMedicao(''); setShowRejeitarMedicao(true); }}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Rejeitar
                          </Button>
                        </div>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 border-t bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                          {/* Dados da Medição */}
                          <div className="bg-white p-4 rounded-lg space-y-3">
                            <h4 className="font-medium text-gray-900 flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-emerald-600" />
                              Dados da Medição
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-gray-500">Valor Medido</p>
                                <p className="font-bold text-emerald-700">{formatarMoeda(medicao.valor_medido)}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">Valor Acumulado</p>
                                <p className="font-bold text-blue-700">{formatarMoeda(medicao.valor_acumulado_atual)}</p>
                              </div>
                              <div>
                                <p className="text-gray-500">% Físico Medido</p>
                                <p className="font-semibold">{Number(medicao.percentual_fisico_medido || 0).toFixed(1)}%</p>
                              </div>
                              <div>
                                <p className="text-gray-500">% Físico Acumulado</p>
                                <p className="font-semibold">{Number(medicao.percentual_fisico_acumulado || 0).toFixed(1)}%</p>
                              </div>
                            </div>
                            {medicao.fornecedor_observacoes && (
                              <div className="pt-2 border-t">
                                <p className="text-xs text-gray-500 mb-1">Observações do Fornecedor</p>
                                <p className="text-sm text-gray-700">{medicao.fornecedor_observacoes}</p>
                              </div>
                            )}
                          </div>

                          {/* Nota Fiscal e Ateste */}
                          <div className="space-y-3">
                            {medicao.nota_fiscal_numero && (
                              <div className="bg-white p-4 rounded-lg space-y-2">
                                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-blue-600" />
                                  Nota Fiscal
                                </h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <p className="text-gray-500">Número</p>
                                    <p className="font-semibold">{medicao.nota_fiscal_numero}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-500">Valor</p>
                                    <p className="font-semibold">{formatarMoeda(medicao.nota_fiscal_valor || 0)}</p>
                                  </div>
                                  {medicao.nota_fiscal_data && (
                                    <div>
                                      <p className="text-gray-500">Data</p>
                                      <p className="font-semibold">{formatarData(medicao.nota_fiscal_data)}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {medicao.ateste_fiscal_nome && (
                              <div className="bg-green-50 p-4 rounded-lg space-y-2">
                                <h4 className="font-medium text-green-900 flex items-center gap-2">
                                  <Shield className="h-4 w-4 text-green-600" />
                                  Ateste do Fiscal
                                </h4>
                                <div className="text-sm space-y-1">
                                  <p><span className="text-green-700">Fiscal:</span> <strong>{medicao.ateste_fiscal_nome}</strong></p>
                                  {medicao.ateste_data && (
                                    <p><span className="text-green-700">Data:</span> <strong>{formatarData(medicao.ateste_data)}</strong></p>
                                  )}
                                  {medicao.ateste_verificado_in_loco && (
                                    <Badge className="bg-green-200 text-green-800 text-xs mt-1">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Verificado in loco
                                    </Badge>
                                  )}
                                  {medicao.ateste_observacoes && (
                                    <p className="pt-1"><span className="text-green-700">Obs:</span> {medicao.ateste_observacoes}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Assinaturas Digitais + Boletim */}
                        {(assinaturasAprov[medicao.id] || medicao.boletim_pdf_url) && (
                          <div className="mt-4 bg-white p-4 rounded-lg">
                            <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                              <PenLine className="h-4 w-4 text-indigo-600" />
                              Assinaturas Digitais
                            </h4>
                            {assinaturasAprov[medicao.id]?.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                {assinaturasAprov[medicao.id].map((as: any, idx: number) => (
                                  <div key={idx} className={`p-3 rounded-lg border text-sm ${as.papel_assinante === 'FISCAL' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                                    <p className="font-semibold text-xs uppercase tracking-wide mb-1 text-gray-500">
                                      {as.papel_assinante === 'FISCAL' ? 'Fiscal de Contrato' : 'Fornecedor / Contratado'}
                                    </p>
                                    <p className="font-medium text-gray-800">{as.usuario_nome}</p>
                                    {as.usuario_cargo && <p className="text-gray-500 text-xs">{as.usuario_cargo}</p>}
                                    {as.data_assinatura && (
                                      <p className="text-gray-500 text-xs mt-1">
                                        {new Date(as.data_assinatura).toLocaleString('pt-BR')}
                                      </p>
                                    )}
                                    {as.codigo_validacao && (
                                      <code className="text-xs font-mono text-indigo-600 mt-1 block">
                                        {as.codigo_validacao.match(/.{1,4}/g)?.join('-')}
                                      </code>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400 mb-3">Nenhuma assinatura digital registrada</p>
                            )}
                            {medicao.boletim_pdf_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                disabled={baixandoBoletim === medicao.id}
                                onClick={() => baixarBoletimAprov(medicao)}
                              >
                                {baixandoBoletim === medicao.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <FileDown className="h-4 w-4" />}
                                Baixar Boletim Assinado
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Anexos enviados pelo fornecedor */}
                        {anexosAprov[medicao.id] !== undefined && (
                          <div className="mt-4 bg-white p-4 rounded-lg">
                            <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                              <Paperclip className="h-4 w-4 text-indigo-600" />
                              Documentos e Evidências do Fornecedor
                              <Badge variant="outline" className="ml-1 text-xs">
                                {anexosAprov[medicao.id]?.length || 0}
                              </Badge>
                            </h4>

                            {(anexosAprov[medicao.id]?.length || 0) === 0 ? (
                              <p className="text-sm text-gray-500">
                                Nenhum anexo enviado pelo fornecedor nesta medição.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {anexosAprov[medicao.id].map((anexo: any) => {
                                  const anexoUrl = anexo?.url
                                    ? (anexo.url.startsWith('http') ? anexo.url : `${API_URL}${anexo.url}`)
                                    : '';
                                  const isFoto = anexo?.tipo === 'FOTO';
                                  return (
                                    <div key={anexo.id} className="border rounded-lg overflow-hidden bg-white">
                                      {isFoto && anexoUrl ? (
                                        <img
                                          src={anexoUrl}
                                          alt={anexo.descricao || anexo.nome_original || 'Anexo da medição'}
                                          className="w-full h-28 object-cover bg-gray-100"
                                        />
                                      ) : (
                                        <div className="w-full h-28 flex items-center justify-center bg-gray-50">
                                          <FileText className="h-8 w-8 text-gray-400" />
                                        </div>
                                      )}
                                      <div className="p-2 space-y-1">
                                        <p className="text-xs font-medium text-gray-800 line-clamp-2">
                                          {anexo.descricao || anexo.nome_original || 'Arquivo'}
                                        </p>
                                        <p className="text-[11px] text-gray-500">
                                          {(anexo.tamanho_bytes || 0) > 0
                                            ? `${Math.max(1, Math.round((anexo.tamanho_bytes || 0) / 1024))} KB`
                                            : 'Tamanho não informado'}
                                        </p>
                                        {anexoUrl && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs gap-1.5"
                                            onClick={() => window.open(anexoUrl, '_blank')}
                                          >
                                            <Eye className="h-3.5 w-3.5" />
                                            Abrir anexo
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Discriminação das Despesas */}
                        {discriminacoesAprov[medicao.id] && discriminacoesAprov[medicao.id].length > 0 && (
                          <div className="mt-4 bg-white p-4 rounded-lg">
                            <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                              <DollarSign className="h-4 w-4 text-amber-600" />
                              Discriminacao das Despesas
                            </h4>
                            <Table className="table-fixed">
                              <TableHeader>
                                <TableRow className="bg-amber-50">
                                  <TableHead className="text-xs font-bold w-12">Item</TableHead>
                                  <TableHead className="text-xs font-bold">Discriminacao</TableHead>
                                  <TableHead className="text-xs font-bold text-right w-28">Valor R$</TableHead>
                                  <TableHead className="text-xs font-bold text-right w-20">%</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {discriminacoesAprov[medicao.id].map((d: any, idx: number) => (
                                  <TableRow key={d.id || idx}>
                                    <TableCell className="text-sm font-mono">{d.numero_item || idx + 1}</TableCell>
                                    <TableCell className="text-sm whitespace-normal break-words max-w-[520px] align-top">
                                      {d.descricao}
                                      {d.corrigido_por_nome && <span className="ml-1 text-xs text-amber-600">(corrigido)</span>}
                                    </TableCell>
                                    <TableCell className="text-sm text-right font-medium">{formatarMoeda(d.valor)}</TableCell>
                                    <TableCell className="text-sm text-right">{Number(d.percentual || 0).toFixed(2)}%</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-gray-50 font-bold">
                                  <TableCell></TableCell>
                                  <TableCell className="text-sm font-bold">Total</TableCell>
                                  <TableCell className="text-sm text-right font-bold">{formatarMoeda(discriminacoesAprov[medicao.id].reduce((s: number, d: any) => s + Number(d.valor || 0), 0))}</TableCell>
                                  <TableCell className="text-sm text-right font-bold">{discriminacoesAprov[medicao.id].reduce((s: number, d: any) => s + Number(d.percentual || 0), 0).toFixed(2)}%</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        {/* Execução Fiscal/Financeira */}
                        {execucaoAprov[medicao.id] && execucaoAprov[medicao.id].itens && execucaoAprov[medicao.id].itens.length > 0 && (
                          <div className="mt-4 bg-white p-4 rounded-lg">
                            <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                              <TrendingUp className="h-4 w-4 text-indigo-600" />
                              Execucao Fiscal/Financeira
                            </h4>
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-indigo-50">
                                  <TableHead className="text-xs font-bold w-12">Item</TableHead>
                                  <TableHead className="text-xs font-bold">Descricao</TableHead>
                                  <TableHead className="text-xs font-bold text-right w-24">Previsto</TableHead>
                                  <TableHead className="text-xs font-bold text-right w-24 bg-blue-50">No Periodo</TableHead>
                                  <TableHead className="text-xs font-bold text-right w-24">Ate Periodo</TableHead>
                                  <TableHead className="text-xs font-bold text-right w-24 bg-green-50">A Executar</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {execucaoAprov[medicao.id].itens.map((item: any, idx: number) => (
                                  <TableRow key={item.etapa_id || idx}>
                                    <TableCell className="text-sm font-mono">{item.numero_etapa}</TableCell>
                                    <TableCell className="text-sm whitespace-normal break-words max-w-[520px] align-top">
                                      {item.descricao}
                                    </TableCell>
                                    <TableCell className="text-sm text-right">{formatarMoeda(item.valor_previsto)}</TableCell>
                                    <TableCell className="text-sm text-right font-medium text-blue-700 bg-blue-50/50">{formatarMoeda(item.no_periodo)}</TableCell>
                                    <TableCell className="text-sm text-right">{formatarMoeda(item.ate_periodo)}</TableCell>
                                    <TableCell className="text-sm text-right font-medium text-green-700 bg-green-50/50">{formatarMoeda(item.a_executar)}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-gray-50 font-bold">
                                  <TableCell></TableCell>
                                  <TableCell className="text-sm font-bold">Total</TableCell>
                                  <TableCell className="text-sm text-right font-bold">{formatarMoeda(execucaoAprov[medicao.id].totais?.valor_previsto || 0)}</TableCell>
                                  <TableCell className="text-sm text-right font-bold text-blue-700">{formatarMoeda(execucaoAprov[medicao.id].totais?.no_periodo || 0)}</TableCell>
                                  <TableCell className="text-sm text-right font-bold">{formatarMoeda(execucaoAprov[medicao.id].totais?.ate_periodo || 0)}</TableCell>
                                  <TableCell className="text-sm text-right font-bold text-green-700">{formatarMoeda(execucaoAprov[medicao.id].totais?.a_executar || 0)}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                            {execucaoAprov[medicao.id].execucao_fiscal && (
                              <div className="mt-2 text-xs text-gray-600">
                                <span className="font-medium">Execucao Temporal:</span>{' '}
                                {execucaoAprov[medicao.id].execucao_fiscal.meses_executados}m {execucaoAprov[medicao.id].execucao_fiscal.dias_executados_extra}d executados
                                {' | '}{execucaoAprov[medicao.id].execucao_fiscal.meses_restantes}m {execucaoAprov[medicao.id].execucao_fiscal.dias_restantes_extra}d restantes
                              </div>
                            )}
                          </div>
                        )}

                        {/* Timeline resumida */}
                        <div className="mt-4 bg-white p-4 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-3">Fluxo da Medição</h4>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Criada</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Submetida</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Atestada</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <div className="flex items-center gap-1 text-amber-600 font-semibold">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Aguardando Aprovação</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <div className="flex items-center gap-1 text-gray-400">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Aprovada</span>
                            </div>
                          </div>
                        </div>

                        {/* Link para contrato */}
                        {medicao.contrato && (
                          <div className="mt-3 flex justify-end">
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/orgao/contratos/${medicao.contrato.id}`}>
                                <Eye className="h-4 w-4 mr-1" />
                                Ver Contrato
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        {/* ============ TAB ORDENS DE SERVIÇO ============ */}
        <TabsContent value="ordens-servico" className="space-y-4">
          {loadingOS ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : ordensServico.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma OS pendente de aprovação</h3>
                <p className="text-gray-500">Todas as Ordens de Serviço foram processadas</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {ordensServico.map((os) => (
                <Card key={os.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{os.numero_os}</span>
                          <Badge className="bg-yellow-100 text-yellow-700">Aguardando Aprovação</Badge>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{os.numero_contrato} — {os.fornecedor_nome}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">{formatarMoeda(os.valor_total)}</p>
                        <p className="text-xs text-gray-500">Valor da OS</p>
                      </div>
                    </div>

                    <p className="text-sm mb-3">{os.descricao}</p>

                    <div className="flex gap-6 text-sm text-gray-500 mb-3">
                      <span><Calendar className="w-3 h-3 inline mr-1" />Abertura: {formatarData(os.data_abertura)}</span>
                      <span><Clock className="w-3 h-3 inline mr-1" />Prazo: {formatarData(os.data_prazo)}</span>
                      {os.usuario_cadastro_nome && <span><User className="w-3 h-3 inline mr-1" />Criado por: {os.usuario_cadastro_nome}</span>}
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => { setOsSelecionada(os); setShowRejeitarOS(true); }}
                      >
                        <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => { setOsSelecionada(os); setShowAprovarOS(true); }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ============ MODAIS OS ============ */}

      <Dialog open={showAprovarOS} onOpenChange={setShowAprovarOS}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar Ordem de Serviço</DialogTitle>
          </DialogHeader>
          {osSelecionada && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded">
                <p className="font-medium">{osSelecionada.numero_os}</p>
                <p className="text-sm text-gray-500">{osSelecionada.descricao}</p>
                <p className="text-sm mt-1 font-bold">{formatarMoeda(osSelecionada.valor_total)}</p>
              </div>
              <div className="space-y-2">
                <Label>Observação (opcional)</Label>
                <Textarea value={observacaoOS} onChange={(e) => setObservacaoOS(e.target.value)} placeholder="Observação sobre a aprovação..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAprovarOS(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={aprovarOrdemServico} disabled={processando}>
              {processando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Aprovar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejeitarOS} onOpenChange={setShowRejeitarOS}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Ordem de Serviço</DialogTitle>
          </DialogHeader>
          {osSelecionada && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded">
                <p className="font-medium">{osSelecionada.numero_os}</p>
                <p className="text-sm text-gray-500">{osSelecionada.descricao}</p>
                <p className="text-sm mt-1 font-bold">{formatarMoeda(osSelecionada.valor_total)}</p>
              </div>
              <div className="space-y-2">
                <Label>Motivo da rejeição *</Label>
                <Textarea value={motivoRejeicaoOS} onChange={(e) => setMotivoRejeicaoOS(e.target.value)} placeholder="Informe o motivo da rejeição..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejeitarOS(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitarOrdemServico} disabled={processando || !motivoRejeicaoOS.trim()}>
              {processando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Rejeitar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MODAIS CONTRATOS ============ */}

      {/* Modal Liberar Contrato */}
      <Dialog open={showLiberarContrato} onOpenChange={setShowLiberarContrato}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Unlock className="h-5 w-5" />
              Liberar Contrato
            </DialogTitle>
            <DialogDescription>
              Confirma a liberação do contrato {contratoSelecionado?.numero_contrato}?
            </DialogDescription>
          </DialogHeader>

          {contratoSelecionado && (
            <div className="py-4 space-y-3">
              <div className="bg-green-50 p-4 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-green-700" />
                  <span className="font-semibold text-green-800">
                    {contratoSelecionado.fornecedor?.razao_social || contratoSelecionado.fornecedor_razao_social}
                  </span>
                </div>
                <p className="text-sm text-green-700">
                  CNPJ: {formatarCNPJ(contratoSelecionado.fornecedor?.cpf_cnpj || contratoSelecionado.fornecedor_cnpj || '')}
                </p>
                <p className="text-sm text-green-700">
                  <strong>Valor:</strong> {formatarMoeda(contratoSelecionado.valor_global)}
                </p>
                <p className="text-sm text-green-700">
                  <strong>Vigência:</strong> {formatarData(contratoSelecionado.data_vigencia_inicio)} a {formatarData(contratoSelecionado.data_vigencia_fim)}
                </p>
                <p className="text-sm text-green-800 mt-2 pt-2 border-t border-green-200">
                  Ao liberar, o contrato ficará <strong>VIGENTE</strong> e poderá receber requisições e pedidos.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLiberarContrato(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={liberarContrato} disabled={processando}>
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlock className="h-4 w-4 mr-2" />}
              Confirmar Liberação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar Contrato */}
      <Dialog open={showRejeitarContrato} onOpenChange={setShowRejeitarContrato}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              Rejeitar Liberação
            </DialogTitle>
            <DialogDescription>
              Rejeitar a liberação do contrato {contratoSelecionado?.numero_contrato}?
            </DialogDescription>
          </DialogHeader>

          {contratoSelecionado && (
            <div className="py-4 space-y-3">
              <div className="bg-red-50 p-4 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-red-700" />
                  <span className="font-semibold text-red-800">
                    {contratoSelecionado.fornecedor?.razao_social || contratoSelecionado.fornecedor_razao_social}
                  </span>
                </div>
                <p className="text-sm text-red-700">
                  <strong>Valor:</strong> {formatarMoeda(contratoSelecionado.valor_global)}
                </p>
                <p className="text-sm text-red-800 mt-2">
                  O contrato permanecerá aguardando liberação e poderá ser editado e re-avaliado.
                </p>
              </div>

              <div>
                <Label htmlFor="motivo-rejeicao">Motivo da Rejeição (opcional)</Label>
                <Textarea
                  id="motivo-rejeicao"
                  value={motivoRejeicaoContrato}
                  onChange={(e) => setMotivoRejeicaoContrato(e.target.value)}
                  placeholder="Informe o motivo da rejeição"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejeitarContrato(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitarContrato} disabled={processando}>
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MODAIS REQUISIÇÕES ============ */}

      {/* Modal Aprovar Requisição */}
      <Dialog open={showAprovarRequisicao} onOpenChange={setShowAprovarRequisicao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              Aprovar Requisição
            </DialogTitle>
            <DialogDescription>
              Confirma a aprovação da requisição {requisicaoSelecionada?.numero}?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-green-50 p-4 rounded-lg mb-4">
              <p className="text-sm text-green-800">
                <strong>Valor:</strong> {formatarMoeda(requisicaoSelecionada?.valor_total_estimado || 0)}
              </p>
              <p className="text-sm text-green-800">
                <strong>Itens:</strong> {requisicaoSelecionada?.itens?.length || 0} item(ns)
              </p>
              <p className="text-sm text-green-800 mt-2">
                Ao aprovar, o saldo será reservado no contrato e o solicitante será notificado.
              </p>
            </div>
            <div>
              <Label htmlFor="obs-aprovacao">Observação (opcional)</Label>
              <Textarea
                id="obs-aprovacao"
                value={observacaoRequisicao}
                onChange={(e) => setObservacaoRequisicao(e.target.value)}
                placeholder="Adicione uma observação se necessário"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAprovarRequisicao(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={aprovarRequisicao} disabled={processando}>
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Confirmar Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Negar Requisição */}
      <Dialog open={showNegarRequisicao} onOpenChange={setShowNegarRequisicao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              Negar Requisição
            </DialogTitle>
            <DialogDescription>
              Confirma a negativa da requisição {requisicaoSelecionada?.numero}?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-red-50 p-4 rounded-lg mb-4">
              <p className="text-sm text-red-800">
                Ao negar, o solicitante será notificado com o motivo informado.
              </p>
            </div>
            <div>
              <Label htmlFor="motivo-negativa">Motivo da Negativa *</Label>
              <Textarea
                id="motivo-negativa"
                value={motivoNegativaRequisicao}
                onChange={(e) => setMotivoNegativaRequisicao(e.target.value)}
                placeholder="Informe o motivo da negativa"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNegarRequisicao(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={negarRequisicao} disabled={processando || !motivoNegativaRequisicao.trim()}>
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirmar Negativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Devolver Requisição */}
      <Dialog open={showDevolverRequisicao} onOpenChange={setShowDevolverRequisicao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <RotateCcw className="h-5 w-5" />
              Devolver para Revisão
            </DialogTitle>
            <DialogDescription>
              Devolve a requisição {requisicaoSelecionada?.numero} para o solicitante corrigir.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 p-4 rounded-lg mb-4">
              <p className="text-sm text-amber-800">
                A requisição será devolvida ao solicitante com o motivo informado para que ele faça as correções necessárias e reenvie para aprovação.
              </p>
            </div>
            <div>
              <Label htmlFor="motivo-devolucao">Motivo da Devolução *</Label>
              <Textarea
                id="motivo-devolucao"
                value={motivoDevolucaoRequisicao}
                onChange={(e) => setMotivoDevolucaoRequisicao(e.target.value)}
                placeholder="Informe o que deve ser corrigido ou ajustado"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDevolverRequisicao(false)}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={devolverRequisicao}
              disabled={processando || !motivoDevolucaoRequisicao.trim()}
            >
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Confirmar Devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Pós-Aprovação */}
      <Dialog open={showPosAprovacao} onOpenChange={setShowPosAprovacao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              Requisição Aprovada!
            </DialogTitle>
            <DialogDescription>
              {requisicaoSelecionada?.numero} foi aprovada com sucesso.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* Info do fornecedor + campos editáveis */}
            {posAprovacaoData?.fornecedor_info && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                <p className="text-sm font-semibold text-gray-700">{posAprovacaoData.fornecedor_info.nome}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-gray-500">Email do fornecedor</Label>
                    <Input
                      type="email"
                      value={emailFornecedorEdit}
                      onChange={(e) => setEmailFornecedorEdit(e.target.value)}
                      placeholder="email@fornecedor.com"
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">WhatsApp (c/ DDD)</Label>
                    <Input
                      type="tel"
                      value={telefoneFornecedorEdit}
                      onChange={(e) => setTelefoneFornecedorEdit(e.target.value)}
                      placeholder="77999999999"
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Status de envio automático */}
            {posAprovacaoData?.envio_automatico && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-medium text-green-800 mb-1">Notificações enviadas automaticamente:</p>
                <div className="flex gap-3 text-sm">
                  <span className={posAprovacaoData.notificacoes?.email ? 'text-green-700' : 'text-red-600'}>
                    {posAprovacaoData.notificacoes?.email ? '✓ Email enviado' : '✗ Email não enviado'}
                  </span>
                  <span className={posAprovacaoData.notificacoes?.whatsapp ? 'text-green-700' : 'text-red-600'}>
                    {posAprovacaoData.notificacoes?.whatsapp ? '✓ WhatsApp enviado' : '✗ WhatsApp não enviado'}
                  </span>
                </div>
                {(!posAprovacaoData.notificacoes?.email || !posAprovacaoData.notificacoes?.whatsapp) && (
                  <p className="text-xs text-amber-700 mt-1">Verifique se o fornecedor possui email e telefone cadastrado.</p>
                )}
              </div>
            )}

            {/* Ações manuais para OS e OF */}
            {(requisicaoSelecionada?.tipo === 'ORDEM_SERVICO' || posAprovacaoData?.ordem_fornecimento_id) && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Ações:</p>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={baixarPdfRequisicao}
                  disabled={baixandoPdf}
                >
                  {baixandoPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {posAprovacaoData?.ordem_fornecimento_id ? 'Baixar PDF da Ordem de Fornecimento' : 'Baixar PDF da Ordem de Serviço'}
                </Button>
                {!posAprovacaoData?.envio_automatico && (
                  <>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => enviarAoFornecedorRequisicao('email')}
                      disabled={enviandoFornecedor !== null || !emailFornecedorEdit.trim()}
                    >
                      {enviandoFornecedor === 'email' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                      Enviar por Email ao Fornecedor
                      {!emailFornecedorEdit.trim() && <span className="ml-auto text-xs text-red-400">informe o email</span>}
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => enviarAoFornecedorRequisicao('whatsapp')}
                      disabled={enviandoFornecedor !== null || !telefoneFornecedorEdit.trim()}
                    >
                      {enviandoFornecedor === 'whatsapp' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                      Enviar via WhatsApp ao Fornecedor
                      {!telefoneFornecedorEdit.trim() && <span className="ml-auto text-xs text-red-400">informe o telefone</span>}
                    </Button>
                  </>
                )}
                {posAprovacaoData?.envio_automatico && (
                  <>
                    <p className="text-xs text-gray-500 font-medium">Reenviar notificação:</p>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      size="sm"
                      onClick={() => enviarAoFornecedorRequisicao('email')}
                      disabled={enviandoFornecedor !== null || !emailFornecedorEdit.trim()}
                    >
                      {enviandoFornecedor === 'email' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                      Reenviar Email
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      size="sm"
                      onClick={() => enviarAoFornecedorRequisicao('whatsapp')}
                      disabled={enviandoFornecedor !== null || !telefoneFornecedorEdit.trim()}
                    >
                      {enviandoFornecedor === 'whatsapp' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                      Reenviar WhatsApp
                    </Button>
                  </>
                )}
              </div>
            )}

            <div className="text-sm text-gray-500 text-center border-t pt-3">
              O solicitante já foi notificado automaticamente sobre a aprovação.
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setShowPosAprovacao(false); setRequisicaoSelecionada(null); setPosAprovacaoData(null); }}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MODAIS MEDIÇÕES ============ */}

      {/* Modal Aprovar Medição */}
      <Dialog open={showAprovarMedicao} onOpenChange={setShowAprovarMedicao}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              Aprovar Medição
            </DialogTitle>
            <DialogDescription>
              Confirma a aprovação da Medição #{medicaoSelecionada?.numero_medicao}?
            </DialogDescription>
          </DialogHeader>

          {medicaoSelecionada && (
            <div className="py-4 space-y-3">
              <div className="bg-green-50 p-4 rounded-lg space-y-2">
                {medicaoSelecionada.contrato && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-green-700" />
                    <span className="font-semibold text-green-800">
                      Contrato {medicaoSelecionada.contrato.numero_contrato}
                    </span>
                  </div>
                )}
                <p className="text-sm text-green-700">
                  <strong>Período:</strong> {formatarData(medicaoSelecionada.periodo_inicio)} a {formatarData(medicaoSelecionada.periodo_fim)}
                </p>
                <p className="text-sm text-green-700">
                  <strong>Valor Medido:</strong> {formatarMoeda(medicaoSelecionada.valor_medido)}
                </p>
                <p className="text-sm text-green-700">
                  <strong>% Físico:</strong> {Number(medicaoSelecionada.percentual_fisico_medido || 0).toFixed(1)}%
                </p>
                {medicaoSelecionada.ateste_fiscal_nome && (
                  <p className="text-sm text-green-700">
                    <strong>Atestado por:</strong> {medicaoSelecionada.ateste_fiscal_nome}
                    {medicaoSelecionada.ateste_data && ` em ${formatarData(medicaoSelecionada.ateste_data)}`}
                  </p>
                )}
                {medicaoSelecionada.nota_fiscal_numero && (
                  <p className="text-sm text-green-700">
                    <strong>NF:</strong> {medicaoSelecionada.nota_fiscal_numero} — {formatarMoeda(medicaoSelecionada.nota_fiscal_valor || 0)}
                  </p>
                )}
                <p className="text-sm text-green-800 mt-2 pt-2 border-t border-green-200">
                  Ao aprovar, o valor será contabilizado como executado no contrato.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAprovarMedicao(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={aprovarMedicao} disabled={processando}>
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Confirmar Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar Medição */}
      <Dialog open={showRejeitarMedicao} onOpenChange={setShowRejeitarMedicao}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              Rejeitar Medição
            </DialogTitle>
            <DialogDescription>
              Rejeitar a Medição #{medicaoSelecionada?.numero_medicao}?
            </DialogDescription>
          </DialogHeader>

          {medicaoSelecionada && (
            <div className="py-4 space-y-3">
              <div className="bg-red-50 p-4 rounded-lg space-y-2">
                {medicaoSelecionada.contrato && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-red-700" />
                    <span className="font-semibold text-red-800">
                      Contrato {medicaoSelecionada.contrato.numero_contrato}
                    </span>
                  </div>
                )}
                <p className="text-sm text-red-700">
                  <strong>Valor Medido:</strong> {formatarMoeda(medicaoSelecionada.valor_medido)}
                </p>
                <p className="text-sm text-red-800 mt-2">
                  A medição será rejeitada e o fornecedor/fiscal serão notificados.
                </p>
              </div>

              <div>
                <Label htmlFor="motivo-rejeicao-medicao">Motivo da Rejeição *</Label>
                <Textarea
                  id="motivo-rejeicao-medicao"
                  value={motivoRejeicaoMedicao}
                  onChange={(e) => setMotivoRejeicaoMedicao(e.target.value)}
                  placeholder="Informe o motivo da rejeição da medição"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejeitarMedicao(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitarMedicao} disabled={processando || !motivoRejeicaoMedicao.trim()}>
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
