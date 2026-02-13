'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
  ArrowLeft,
  FileText,
  Calendar,
  DollarSign,
  Building,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Send,
  Plus,
  Eye,
  RotateCcw,
  ChevronRight,
  Loader2,
  Camera,
  Paperclip,
  Trash2,
  Image,
  Download,
  Upload,
} from 'lucide-react';
import { API_URL, authFetch } from '@/lib/api';

// ============ INTERFACES ============

interface Contrato {
  id: string;
  numero_contrato: string;
  ano: number;
  objeto: string;
  objeto_detalhado?: string;
  status: string;
  categoria: string;
  modalidade_execucao: string;
  valor_global: number;
  valor_inicial: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  fiscal_nome?: string;
  orgao?: { id: string; nome: string; cidade: string; uf: string };
}

interface Etapa {
  id: string;
  numero_etapa: number;
  descricao: string;
  percentual_fisico: number;
  valor_previsto: number;
  percentual_executado: number;
  valor_executado: number;
  status: string;
  data_inicio_prevista?: string;
  data_fim_prevista?: string;
}

interface Medicao {
  id: string;
  numero_medicao: number;
  periodo_inicio: string;
  periodo_fim: string;
  valor_medido: number;
  valor_acumulado_atual: number;
  percentual_fisico_medido: number;
  percentual_fisico_acumulado: number;
  status: string;
  fornecedor_observacoes?: string;
  nota_fiscal_numero?: string;
  nota_fiscal_valor?: number;
  nota_fiscal_data?: string;
  data_submissao?: string;
  ateste_fiscal_nome?: string;
  ateste_data?: string;
  ateste_observacoes?: string;
  aprovador_nome?: string;
  data_aprovacao?: string;
  observacao_aprovador?: string;
  motivo_devolucao?: string;
  data_devolucao?: string;
  created_at: string;
  itens?: any[];
}

interface Resumo {
  valor_global: number;
  valor_medido_total: number;
  saldo_disponivel: number;
  percentual_fisico_total: number;
  total_etapas: number;
  etapas_concluidas: number;
  total_medicoes: number;
  medicoes_aprovadas: number;
  pendentes_ateste: number;
  pendentes_aprovacao: number;
  os_ativa: any;
}

interface Anexo {
  id: string;
  medicao_id: string;
  tipo: 'FOTO' | 'DOCUMENTO';
  nome_original: string;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  url: string;
  descricao?: string;
  enviado_por_nome?: string;
  origem: string;
  created_at: string;
}

// ============ HELPERS ============

const formatarMoeda = (valor: number | null | undefined) => {
  if (valor === null || valor === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
};

const formatarData = (data: string | null | undefined) => {
  if (!data) return '-';
  // Se for formato YYYY-MM-DD (date-only), faz split para evitar problema de timezone UTC
  const dateOnly = data.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(data).toLocaleDateString('pt-BR');
};

const STATUS_MEDICAO: Record<string, { label: string; cor: string; icon: any }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-700', icon: FileText },
  SUBMETIDA: { label: 'Submetida', cor: 'bg-blue-100 text-blue-700', icon: Send },
  AGUARDANDO_ATESTE: { label: 'Aguardando Ateste', cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', cor: 'bg-orange-100 text-orange-700', icon: Clock },
  APROVADA: { label: 'Aprovada', cor: 'bg-green-100 text-green-700', icon: CheckCircle },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-700', icon: XCircle },
  DEVOLVIDA: { label: 'Devolvida', cor: 'bg-amber-100 text-amber-700', icon: RotateCcw },
};

const STATUS_ETAPA: Record<string, { label: string; cor: string }> = {
  PENDENTE: { label: 'Pendente', cor: 'bg-gray-100 text-gray-700' },
  EM_ANDAMENTO: { label: 'Em Andamento', cor: 'bg-blue-100 text-blue-700' },
  MEDIDA_PARCIAL: { label: 'Medida Parcial', cor: 'bg-yellow-100 text-yellow-700' },
  CONCLUIDA: { label: 'Concluída', cor: 'bg-green-100 text-green-700' },
};

// ============ MAIN COMPONENT ============

export default function FornecedorContratoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const contratoId = params.id as string;

  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fornecedor, setFornecedor] = useState<any>(null);

  // Modal Nova Medição
  const [modalNovaMedicao, setModalNovaMedicao] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [novaMedicao, setNovaMedicao] = useState({
    periodo_inicio: '',
    periodo_fim: '',
    observacoes: '',
    nota_fiscal_numero: '',
    nota_fiscal_valor: '',
    nota_fiscal_data: '',
    itens: [] as { etapa_id: string; percentual_executado_atual: number; valor_executado_atual?: number; modo_input?: 'percentual' | 'valor' }[],
  });

  // Modal Submeter
  const [modalSubmeter, setModalSubmeter] = useState(false);
  const [medicaoParaSubmeter, setMedicaoParaSubmeter] = useState<Medicao | null>(null);
  const [dadosSubmissao, setDadosSubmissao] = useState({
    fornecedor_observacoes: '',
    nota_fiscal_numero: '',
    nota_fiscal_valor: '',
    nota_fiscal_data: '',
  });

  // Modal Detalhe
  const [modalDetalhe, setModalDetalhe] = useState(false);
  const [medicaoDetalhe, setMedicaoDetalhe] = useState<Medicao | null>(null);

  // Anexos
  const [anexos, setAnexos] = useState<Record<string, Anexo[]>>({});
  const [uploadingAnexo, setUploadingAnexo] = useState(false);

  useEffect(() => {
    const fornecedorData = localStorage.getItem('fornecedor');
    if (fornecedorData) {
      setFornecedor(JSON.parse(fornecedorData));
    }
    carregarDados();
  }, [contratoId]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const fornecedorData = localStorage.getItem('fornecedor');
      const fId = fornecedorData ? JSON.parse(fornecedorData).id : '';
      const qp = fId ? `?fornecedorId=${fId}` : '';

      const [contratoRes, etapasRes, medicoesRes, resumoRes] = await Promise.all([
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/detalhe${qp}`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/etapas${qp}`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes/resumo`),
      ]);

      if (contratoRes.ok) setContrato(await contratoRes.json());
      if (etapasRes.ok) setEtapas(await etapasRes.json());
      if (medicoesRes.ok) {
        const medicoesData = await medicoesRes.json();
        setMedicoes(medicoesData);
        // Carregar anexos de cada medição
        for (const m of medicoesData) {
          try {
            const anexoRes = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${m.id}/anexos`);
            if (anexoRes.ok) {
              const anexoData = await anexoRes.json();
              setAnexos(prev => ({ ...prev, [m.id]: anexoData }));
            }
          } catch { }
        }
      }
      if (resumoRes.ok) setResumo(await resumoRes.json());
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarAnexos = async (medicaoId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoId}/anexos`);
      if (res.ok) {
        const data = await res.json();
        setAnexos(prev => ({ ...prev, [medicaoId]: data }));
      }
    } catch (error) {
      console.error('Erro ao carregar anexos:', error);
    }
  };

  const handleUploadAnexo = async (medicaoId: string, file: File, tipo: 'FOTO' | 'DOCUMENTO', descricao?: string) => {
    if (!fornecedor) return;
    setUploadingAnexo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', tipo);
      formData.append('fornecedor_id', fornecedor.id);
      formData.append('fornecedor_nome', fornecedor.razao_social || fornecedor.nome);
      if (descricao) formData.append('descricao', descricao);

      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoId}/anexos`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });

      if (res.ok) {
        await carregarAnexos(medicaoId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Erro ao enviar arquivo');
      }
    } catch (error) {
      alert('Erro ao enviar arquivo');
    } finally {
      setUploadingAnexo(false);
    }
  };

  const handleExcluirAnexo = async (anexoId: string, medicaoId: string) => {
    if (!confirm('Excluir este anexo?')) return;
    try {
      const fId = fornecedor?.id || '';
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/anexos/${anexoId}?fornecedorId=${fId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await carregarAnexos(medicaoId);
      }
    } catch (error) {
      alert('Erro ao excluir anexo');
    }
  };

  const formatarTamanho = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCriarMedicao = async () => {
    if (!fornecedor) return;
    setSubmitting(true);
    try {
      const itensComValor = novaMedicao.itens
        .filter(i => i.percentual_executado_atual > 0 || (i.valor_executado_atual && i.valor_executado_atual > 0))
        .map(i => ({
          etapa_id: i.etapa_id,
          percentual_executado_atual: i.percentual_executado_atual || 0,
          valor_executado_atual: i.valor_executado_atual || undefined,
        }));

      if (itensComValor.length === 0) {
        alert('Informe o percentual ou valor executado em pelo menos uma etapa');
        setSubmitting(false);
        return;
      }

      // Validar saldo disponível
      if (resumo) {
        const totalMedicao = novaMedicao.itens.reduce((acc, item, idx) => {
          const etapa = etapas[idx];
          if (!etapa) return acc;
          if (item.modo_input === 'valor' && item.valor_executado_atual) {
            return acc + item.valor_executado_atual;
          }
          return acc + (item.percentual_executado_atual / 100) * Number(etapa.valor_previsto);
        }, 0);

        if (totalMedicao > resumo.saldo_disponivel + 0.01) {
          alert(`O valor da medição (${formatarMoeda(totalMedicao)}) excede o saldo disponível do contrato (${formatarMoeda(resumo.saldo_disponivel)}).`);
          setSubmitting(false);
          return;
        }
      }

      // Validar que nenhum item excede o restante da etapa
      for (let idx = 0; idx < novaMedicao.itens.length; idx++) {
        const item = novaMedicao.itens[idx];
        const etapa = etapas[idx];
        if (!etapa || !item) continue;
        const restante = 100 - Number(etapa.percentual_executado);
        const percUsado = item.modo_input === 'valor' && Number(etapa.valor_previsto) > 0
          ? ((item.valor_executado_atual || 0) / Number(etapa.valor_previsto)) * 100
          : item.percentual_executado_atual;
        if (percUsado > restante + 0.01) {
          alert(`A etapa "${etapa.descricao}" tem ${restante.toFixed(1)}% restante, mas você informou ${percUsado.toFixed(1)}%.`);
          setSubmitting(false);
          return;
        }
      }

      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo_inicio: novaMedicao.periodo_inicio || undefined,
          periodo_fim: novaMedicao.periodo_fim || undefined,
          observacoes: novaMedicao.observacoes || undefined,
          nota_fiscal_numero: novaMedicao.nota_fiscal_numero || undefined,
          nota_fiscal_valor: novaMedicao.nota_fiscal_valor ? Number(novaMedicao.nota_fiscal_valor) : undefined,
          nota_fiscal_data: novaMedicao.nota_fiscal_data || undefined,
          fornecedor_id: fornecedor.id,
          fornecedor_nome: fornecedor.razao_social || fornecedor.nome,
          itens: itensComValor,
        }),
      });

      if (res.ok) {
        setModalNovaMedicao(false);
        setNovaMedicao({
          periodo_inicio: '', periodo_fim: '', observacoes: '',
          nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '',
          itens: [],
        });
        carregarDados();
      } else {
        const err = await res.json();
        alert(err.message || 'Erro ao criar medição');
      }
    } catch (error) {
      alert('Erro ao criar medição');
    } finally {
      setSubmitting(false);
    }
  };

  // Criar medição E submeter em um único passo (botão "Enviar para Ateste")
  const handleCriarESubmeter = async () => {
    if (!fornecedor) return;
    setSubmitting(true);
    try {
      const itensComValor = novaMedicao.itens
        .filter(i => i.percentual_executado_atual > 0 || (i.valor_executado_atual && i.valor_executado_atual > 0))
        .map(i => ({
          etapa_id: i.etapa_id,
          percentual_executado_atual: i.percentual_executado_atual || 0,
          valor_executado_atual: i.valor_executado_atual || undefined,
        }));

      if (itensComValor.length === 0) {
        alert('Informe o percentual ou valor executado em pelo menos uma etapa');
        setSubmitting(false);
        return;
      }

      // Validar saldo disponível
      if (resumo) {
        const totalMedicao = novaMedicao.itens.reduce((acc, item, idx) => {
          const etapa = etapas[idx];
          if (!etapa) return acc;
          if (item.modo_input === 'valor' && item.valor_executado_atual) {
            return acc + item.valor_executado_atual;
          }
          return acc + (item.percentual_executado_atual / 100) * Number(etapa.valor_previsto);
        }, 0);

        if (totalMedicao > resumo.saldo_disponivel + 0.01) {
          alert(`O valor da medição (${formatarMoeda(totalMedicao)}) excede o saldo disponível do contrato (${formatarMoeda(resumo.saldo_disponivel)}).`);
          setSubmitting(false);
          return;
        }
      }

      // Validar que nenhum item excede o restante da etapa
      for (let idx = 0; idx < novaMedicao.itens.length; idx++) {
        const item = novaMedicao.itens[idx];
        const etapa = etapas[idx];
        if (!etapa || !item) continue;
        const restante = 100 - Number(etapa.percentual_executado);
        const percUsado = item.modo_input === 'valor' && Number(etapa.valor_previsto) > 0
          ? ((item.valor_executado_atual || 0) / Number(etapa.valor_previsto)) * 100
          : item.percentual_executado_atual;
        if (percUsado > restante + 0.01) {
          alert(`A etapa "${etapa.descricao}" tem ${restante.toFixed(1)}% restante, mas você informou ${percUsado.toFixed(1)}%.`);
          setSubmitting(false);
          return;
        }
      }

      // Passo 1: Criar medição como RASCUNHO
      const resCriar = await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo_inicio: novaMedicao.periodo_inicio || undefined,
          periodo_fim: novaMedicao.periodo_fim || undefined,
          observacoes: novaMedicao.observacoes || undefined,
          nota_fiscal_numero: novaMedicao.nota_fiscal_numero || undefined,
          nota_fiscal_valor: novaMedicao.nota_fiscal_valor ? Number(novaMedicao.nota_fiscal_valor) : undefined,
          nota_fiscal_data: novaMedicao.nota_fiscal_data || undefined,
          fornecedor_id: fornecedor.id,
          fornecedor_nome: fornecedor.razao_social || fornecedor.nome,
          itens: itensComValor,
        }),
      });

      if (!resCriar.ok) {
        const err = await resCriar.json();
        alert(err.message || 'Erro ao criar medição');
        setSubmitting(false);
        return;
      }

      const medicaoCriada = await resCriar.json();

      // Passo 2: Submeter automaticamente (RASCUNHO → SUBMETIDA)
      const resSubmeter = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoCriada.id}/submeter`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor_id: fornecedor.id,
          fornecedor_observacoes: novaMedicao.observacoes || undefined,
          nota_fiscal_numero: novaMedicao.nota_fiscal_numero || undefined,
          nota_fiscal_valor: novaMedicao.nota_fiscal_valor ? Number(novaMedicao.nota_fiscal_valor) : undefined,
          nota_fiscal_data: novaMedicao.nota_fiscal_data || undefined,
        }),
      });

      if (resSubmeter.ok) {
        setModalNovaMedicao(false);
        setNovaMedicao({
          periodo_inicio: '', periodo_fim: '', observacoes: '',
          nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '',
          itens: [],
        });
        carregarDados();
      } else {
        // Medição foi criada mas falhou ao submeter - informa o usuário
        alert('Medição criada como rascunho, mas houve erro ao enviar. Clique em "Submeter" na lista para tentar novamente.');
        setModalNovaMedicao(false);
        carregarDados();
      }
    } catch (error) {
      alert('Erro ao criar medição');
    } finally {
      setSubmitting(false);
    }
  };

  // Excluir medição em rascunho/devolvida
  const handleExcluirMedicao = async (medicao: Medicao) => {
    if (!fornecedor) return;
    if (!confirm(`Excluir a ${medicao.numero_medicao}ª Medição? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicao.id}?fornecedorId=${fornecedor.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        carregarDados();
      } else {
        const err = await res.json();
        alert(err.message || 'Erro ao excluir medição');
      }
    } catch (error) {
      alert('Erro ao excluir medição');
    }
  };

  const handleSubmeterMedicao = async () => {
    if (!medicaoParaSubmeter || !fornecedor) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoParaSubmeter.id}/submeter`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor_id: fornecedor.id,
          ...dadosSubmissao,
          nota_fiscal_valor: dadosSubmissao.nota_fiscal_valor ? Number(dadosSubmissao.nota_fiscal_valor) : undefined,
        }),
      });

      if (res.ok) {
        setModalSubmeter(false);
        setMedicaoParaSubmeter(null);
        setDadosSubmissao({ fornecedor_observacoes: '', nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '' });
        carregarDados();
      } else {
        const err = await res.json();
        alert(err.message || 'Erro ao submeter medição');
      }
    } catch (error) {
      alert('Erro ao submeter medição');
    } finally {
      setSubmitting(false);
    }
  };

  const abrirModalNovaMedicao = () => {
    setNovaMedicao({
      periodo_inicio: '', periodo_fim: '', observacoes: '',
      nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '',
      itens: etapas.map(e => ({ etapa_id: e.id, percentual_executado_atual: 0, valor_executado_atual: 0, modo_input: 'percentual' as const })),
    });
    setModalNovaMedicao(true);
  };

  const abrirModalSubmeter = (medicao: Medicao) => {
    setMedicaoParaSubmeter(medicao);
    setDadosSubmissao({
      fornecedor_observacoes: medicao.fornecedor_observacoes || '',
      nota_fiscal_numero: medicao.nota_fiscal_numero || '',
      nota_fiscal_valor: medicao.nota_fiscal_valor ? String(medicao.nota_fiscal_valor) : '',
      nota_fiscal_data: medicao.nota_fiscal_data || '',
    });
    setModalSubmeter(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!contrato) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Contrato não encontrado.</p>
        <Link href="/fornecedor/contratos">
          <Button variant="outline" className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/fornecedor/contratos">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Contrato {contrato.numero_contrato}</h1>
          <p className="text-gray-500 text-sm">{contrato.objeto}</p>
        </div>
        <Badge className={contrato.status === 'VIGENTE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
          {contrato.status}
        </Badge>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-gray-500">Órgão</p>
                <p className="font-medium text-sm">{contrato.orgao?.nome || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">Valor Global</p>
                <p className="font-medium text-sm">{formatarMoeda(contrato.valor_global)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-xs text-gray-500">Vigência</p>
                <p className="font-medium text-sm">{formatarData(contrato.data_vigencia_inicio)} a {formatarData(contrato.data_vigencia_fim)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-xs text-gray-500">Avanço Físico</p>
                <p className="font-medium text-sm">{resumo ? `${Number(resumo.percentual_fisico_total || 0).toFixed(1)}%` : '0%'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo de Medição */}
      {resumo && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-500">Valor Medido</p>
                <p className="text-lg font-bold text-green-700">{formatarMoeda(resumo.valor_medido_total)}</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-gray-500">Saldo Disponível</p>
                <p className="text-lg font-bold text-blue-700">{formatarMoeda(resumo.saldo_disponivel)}</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-gray-500">Avanço Físico</p>
                <p className="text-lg font-bold text-purple-700">{Number(resumo.percentual_fisico_total || 0).toFixed(1)}%</p>
                <Progress value={resumo.percentual_fisico_total} className="mt-1 h-2" />
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-xs text-gray-500">Etapas</p>
                <p className="text-lg font-bold text-orange-700">{resumo.etapas_concluidas}/{resumo.total_etapas}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Medições Aprovadas</p>
                <p className="text-lg font-bold">{resumo.medicoes_aprovadas}/{resumo.total_medicoes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="medicoes">
        <TabsList>
          <TabsTrigger value="medicoes" className="gap-2">
            <FileText className="w-4 h-4" />Medições ({medicoes.length})
          </TabsTrigger>
          <TabsTrigger value="cronograma" className="gap-2">
            <TrendingUp className="w-4 h-4" />Cronograma ({etapas.length})
          </TabsTrigger>
          <TabsTrigger value="detalhes" className="gap-2">
            <Eye className="w-4 h-4" />Detalhes
          </TabsTrigger>
        </TabsList>

        {/* Tab Medições */}
        <TabsContent value="medicoes" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Boletins de Medição</h3>
              <p className="text-sm text-gray-500">Crie e submeta medições para análise do fiscal do contrato</p>
            </div>
            <Button onClick={abrirModalNovaMedicao} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4" />Abrir Medição do Mês
            </Button>
          </div>

          {medicoes.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Nenhuma medição registrada</p>
                <p className="text-sm text-gray-400">Clique em "Nova Medição" para criar seu primeiro boletim</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {medicoes.map((medicao) => {
                const statusInfo = STATUS_MEDICAO[medicao.status] || STATUS_MEDICAO.RASCUNHO;
                const StatusIcon = statusInfo.icon;
                return (
                  <Card key={medicao.id} className={`hover:shadow-md transition-shadow ${medicao.status === 'DEVOLVIDA' ? 'border-amber-300' : ''}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 font-bold text-sm">
                          {medicao.numero_medicao}ª
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{medicao.numero_medicao}ª Medição</span>
                            <Badge className={statusInfo.cor}>
                              <StatusIcon className="w-3 h-3 mr-1" />{statusInfo.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>{formatarData(medicao.periodo_inicio)} a {formatarData(medicao.periodo_fim)}</span>
                            <span className="font-medium text-gray-700">{formatarMoeda(medicao.valor_medido)}</span>
                            <span>{Number(medicao.percentual_fisico_medido || 0).toFixed(1)}% físico</span>
                          </div>
                          {medicao.status === 'DEVOLVIDA' && medicao.motivo_devolucao && (
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                              <strong>Motivo da devolução:</strong> {medicao.motivo_devolucao}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(medicao.status === 'RASCUNHO' || medicao.status === 'DEVOLVIDA') && (
                            <>
                              <Button size="sm" onClick={() => abrirModalSubmeter(medicao)} className="gap-1">
                                <Send className="w-3 h-3" />Submeter
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => handleExcluirMedicao(medicao)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" onClick={() => { setMedicaoDetalhe(medicao); setModalDetalhe(true); }}>
                            <Eye className="w-3 h-3 mr-1" />Ver
                          </Button>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div className="mt-3 flex items-center gap-1 text-xs">
                        <span className={`px-2 py-0.5 rounded ${medicao.created_at ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-400'}`}>
                          Criada {formatarData(medicao.created_at)}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-2 py-0.5 rounded ${medicao.data_submissao ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {medicao.data_submissao ? `Submetida ${formatarData(medicao.data_submissao)}` : 'Submissão'}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-2 py-0.5 rounded ${medicao.ateste_data ? 'bg-yellow-200 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>
                          {medicao.ateste_data ? `Atestada ${formatarData(medicao.ateste_data)}` : 'Ateste Fiscal'}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-2 py-0.5 rounded ${medicao.data_aprovacao ? 'bg-green-200 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {medicao.data_aprovacao ? `Aprovada ${formatarData(medicao.data_aprovacao)}` : 'Aprovação'}
                        </span>
                      </div>

                      {/* Seção de Anexos (Fotos e Documentos) */}
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> Evidências e Documentos
                            {anexos[medicao.id] && anexos[medicao.id].length > 0 && (
                              <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0">{anexos[medicao.id].length}</Badge>
                            )}
                          </p>
                          {(medicao.status === 'RASCUNHO' || medicao.status === 'DEVOLVIDA' || medicao.status === 'SUBMETIDA') && (
                            <div className="flex gap-1">
                              <Button
                                size="sm" variant="outline" className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'image/jpeg,image/png,image/jpg';
                                  input.multiple = true;
                                  input.onchange = async (e) => {
                                    const files = (e.target as HTMLInputElement).files;
                                    if (files) {
                                      for (const file of Array.from(files)) {
                                        await handleUploadAnexo(medicao.id, file, 'FOTO');
                                      }
                                    }
                                  };
                                  input.click();
                                }}
                                disabled={uploadingAnexo}
                              >
                                <Camera className="w-3 h-3" />Foto
                              </Button>
                              <Button
                                size="sm" variant="outline" className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'application/pdf,image/jpeg,image/png';
                                  input.onchange = async (e) => {
                                    const files = (e.target as HTMLInputElement).files;
                                    if (files && files[0]) {
                                      await handleUploadAnexo(medicao.id, files[0], 'DOCUMENTO');
                                    }
                                  };
                                  input.click();
                                }}
                                disabled={uploadingAnexo}
                              >
                                <Upload className="w-3 h-3" />Documento
                              </Button>
                            </div>
                          )}
                          {!anexos[medicao.id] && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => carregarAnexos(medicao.id)}>
                              Carregar anexos
                            </Button>
                          )}
                        </div>

                        {uploadingAnexo && (
                          <div className="flex items-center gap-2 text-xs text-blue-600 mb-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Enviando arquivo...
                          </div>
                        )}

                        {anexos[medicao.id] && anexos[medicao.id].length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {anexos[medicao.id].map((anexo) => (
                              <div key={anexo.id} className="relative group border rounded-lg overflow-hidden bg-gray-50">
                                {anexo.tipo === 'FOTO' ? (
                                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                                    <img
                                      src={`${API_URL}${anexo.url}`}
                                      alt={anexo.descricao || anexo.nome_original}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'; }}
                                    />
                                  </div>
                                ) : (
                                  <div className="aspect-square bg-blue-50 flex flex-col items-center justify-center p-2">
                                    <FileText className="w-8 h-8 text-blue-400 mb-1" />
                                    <p className="text-xs text-center text-gray-600 line-clamp-2">{anexo.nome_original}</p>
                                  </div>
                                )}
                                <div className="p-1.5">
                                  <p className="text-xs text-gray-500 truncate">{anexo.nome_original}</p>
                                  <p className="text-xs text-gray-400">{formatarTamanho(anexo.tamanho_bytes)}</p>
                                </div>
                                {/* Ações no hover */}
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                  <a
                                    href={`${API_URL}${anexo.url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-white/90 rounded p-1 shadow hover:bg-white"
                                  >
                                    <Download className="w-3 h-3 text-gray-600" />
                                  </a>
                                  {(medicao.status === 'RASCUNHO' || medicao.status === 'DEVOLVIDA') && (
                                    <button
                                      onClick={() => handleExcluirAnexo(anexo.id, medicao.id)}
                                      className="bg-white/90 rounded p-1 shadow hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3 h-3 text-red-500" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {anexos[medicao.id] && anexos[medicao.id].length === 0 && (
                          <p className="text-xs text-gray-400 italic">Nenhum anexo enviado</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab Cronograma */}
        <TabsContent value="cronograma">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cronograma Físico-Financeiro</CardTitle>
              <CardDescription>Etapas da obra/serviço com percentual e valor previsto</CardDescription>
            </CardHeader>
            <CardContent>
              {etapas.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nenhuma etapa cadastrada pelo órgão</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-center">% Físico</TableHead>
                      <TableHead className="text-right">Valor Previsto</TableHead>
                      <TableHead className="text-center">Executado</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {etapas.map((etapa) => {
                      const statusEtapa = STATUS_ETAPA[etapa.status] || STATUS_ETAPA.PENDENTE;
                      return (
                        <TableRow key={etapa.id}>
                          <TableCell className="font-medium">{etapa.numero_etapa}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{etapa.descricao}</p>
                              {etapa.data_inicio_prevista && (
                                <p className="text-xs text-gray-400">
                                  {formatarData(etapa.data_inicio_prevista)} — {formatarData(etapa.data_fim_prevista)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{etapa.percentual_fisico}%</TableCell>
                          <TableCell className="text-right">{formatarMoeda(etapa.valor_previsto)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center gap-2 justify-center">
                              <Progress value={Number(etapa.percentual_executado)} className="w-16 h-2" />
                              <span className="text-sm font-medium">{Number(etapa.percentual_executado).toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusEtapa.cor}>{statusEtapa.label}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Detalhes */}
        <TabsContent value="detalhes">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detalhes do Contrato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-gray-500">Número</p><p className="font-medium">{contrato.numero_contrato}</p></div>
                <div><p className="text-xs text-gray-500">Categoria</p><p className="font-medium">{contrato.categoria}</p></div>
                <div><p className="text-xs text-gray-500">Modalidade</p><p className="font-medium">{contrato.modalidade_execucao}</p></div>
                <div><p className="text-xs text-gray-500">Fiscal</p><p className="font-medium">{contrato.fiscal_nome || '-'}</p></div>
                <div><p className="text-xs text-gray-500">Data Assinatura</p><p className="font-medium">{formatarData(contrato.data_assinatura)}</p></div>
                <div><p className="text-xs text-gray-500">Valor Inicial</p><p className="font-medium">{formatarMoeda(contrato.valor_inicial)}</p></div>
              </div>
              {contrato.objeto_detalhado && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Objeto Detalhado</p>
                  <p className="text-sm whitespace-pre-wrap">{contrato.objeto_detalhado}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ MODAL: Nova Medição (Planilha Orçamentária) ============ */}
      <Dialog open={modalNovaMedicao} onOpenChange={setModalNovaMedicao}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl">
                  Boletim de Medição #{(medicoes.length || 0) + 1}
                </DialogTitle>
                <DialogDescription>
                  {novaMedicao.periodo_inicio && novaMedicao.periodo_fim
                    ? `Período: ${formatarData(novaMedicao.periodo_inicio)} a ${formatarData(novaMedicao.periodo_fim)}`
                    : 'Informe o período e preencha a execução de cada item'}
                </DialogDescription>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Valor da Medição</p>
                {(() => {
                  const totalMedicao = novaMedicao.itens.reduce((acc, item, idx) => {
                    const etapa = etapas[idx];
                    if (!etapa) return acc;
                    if (item.modo_input === 'valor' && item.valor_executado_atual) {
                      return acc + item.valor_executado_atual;
                    }
                    return acc + (item.percentual_executado_atual / 100) * Number(etapa.valor_previsto);
                  }, 0);
                  const saldoDisp = resumo ? resumo.saldo_disponivel : Infinity;
                  const excedeSaldo = totalMedicao > saldoDisp + 0.01;
                  return (
                    <>
                      <p className={`text-2xl font-bold ${excedeSaldo ? 'text-red-600' : 'text-blue-700'}`}>
                        {formatarMoeda(totalMedicao)}
                      </p>
                      {excedeSaldo && (
                        <p className="text-xs text-red-500 mt-1">Excede o saldo de {formatarMoeda(saldoDisp)}</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Período */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Período Início *</Label>
                <Input type="date" value={novaMedicao.periodo_inicio}
                  onChange={(e) => setNovaMedicao({ ...novaMedicao, periodo_inicio: e.target.value })} />
              </div>
              <div>
                <Label>Período Fim *</Label>
                <Input type="date" value={novaMedicao.periodo_fim}
                  onChange={(e) => setNovaMedicao({ ...novaMedicao, periodo_fim: e.target.value })} />
              </div>
            </div>

            {/* Planilha Orçamentária */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-16 text-center font-bold text-xs uppercase">Item</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Descrição do Serviço</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-28">Valor Prev.</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-20">Med. Acum.</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-28 bg-blue-50">Exec. Mês (%)</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-32 bg-green-50">Exec. Mês (R$)</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-28 bg-blue-50">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {etapas.map((etapa, idx) => {
                    const jaExecutado = Number(etapa.percentual_executado);
                    const itemState = novaMedicao.itens[idx];
                    const modoInput = itemState?.modo_input || 'percentual';
                    const execPerc = itemState?.percentual_executado_atual || 0;
                    const execValor = itemState?.valor_executado_atual || 0;
                    const valorPrevisto = Number(etapa.valor_previsto);
                    const restante = 100 - jaExecutado;
                    const valorRestante = (restante / 100) * valorPrevisto;

                    // Calcula subtotal baseado no modo de input
                    const subtotal = modoInput === 'valor'
                      ? execValor
                      : (execPerc / 100) * valorPrevisto;

                    // Calcula % exibido baseado no modo
                    const percExibido = modoInput === 'valor' && valorPrevisto > 0
                      ? (execValor / valorPrevisto) * 100
                      : execPerc;

                    const excedeLimite = percExibido > restante + 0.01;

                    return (
                      <TableRow key={etapa.id} className="hover:bg-gray-50">
                        <TableCell className="text-center font-mono text-sm font-medium">{etapa.numero_etapa}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{etapa.descricao}</p>
                          <p className="text-xs text-gray-400">
                            Previsto: {formatarMoeda(valorPrevisto)} · Restante: {restante.toFixed(1)}% ({formatarMoeda(valorRestante)})
                          </p>
                          {excedeLimite && (
                            <p className="text-xs text-red-500 font-medium mt-0.5">Excede o restante disponível!</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatarMoeda(valorPrevisto)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm font-medium ${jaExecutado > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            {jaExecutado.toFixed(0)}%
                          </span>
                        </TableCell>
                        {/* Input Percentual (%) */}
                        <TableCell className="bg-blue-50/50">
                          <Input
                            type="number"
                            min="0"
                            max={restante}
                            step="0.1"
                            placeholder="0"
                            value={modoInput === 'percentual' ? (execPerc || '') : (percExibido > 0 ? percExibido.toFixed(2) : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              const num = val === '' ? 0 : Number(val);
                              const itens = [...novaMedicao.itens];
                              itens[idx] = {
                                etapa_id: etapa.id,
                                percentual_executado_atual: num,
                                valor_executado_atual: valorPrevisto > 0 ? (num / 100) * valorPrevisto : 0,
                                modo_input: 'percentual',
                              };
                              setNovaMedicao({ ...novaMedicao, itens });
                            }}
                            className={`text-center h-8 text-sm font-medium ${modoInput === 'percentual' ? 'ring-1 ring-blue-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeLimite ? 'border-red-400' : ''}`}
                          />
                        </TableCell>
                        {/* Input Valor (R$) */}
                        <TableCell className="bg-green-50/50">
                          <Input
                            type="number"
                            min="0"
                            max={valorRestante}
                            step="0.01"
                            placeholder="0,00"
                            value={modoInput === 'valor' ? (execValor || '') : (subtotal > 0 ? subtotal.toFixed(2) : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              const num = val === '' ? 0 : Number(val);
                              const perc = valorPrevisto > 0 ? (num / valorPrevisto) * 100 : 0;
                              const itens = [...novaMedicao.itens];
                              itens[idx] = {
                                etapa_id: etapa.id,
                                percentual_executado_atual: Math.round(perc * 100) / 100,
                                valor_executado_atual: num,
                                modo_input: 'valor',
                              };
                              setNovaMedicao({ ...novaMedicao, itens });
                            }}
                            className={`text-center h-8 text-sm font-medium ${modoInput === 'valor' ? 'ring-1 ring-green-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeLimite ? 'border-red-400' : ''}`}
                          />
                        </TableCell>
                        <TableCell className="text-right bg-blue-50/50">
                          <span className={`text-sm font-medium ${subtotal > 0 ? (excedeLimite ? 'text-red-600' : 'text-blue-700') : 'text-gray-400'}`}>
                            {formatarMoeda(subtotal)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Observações e NF lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" />
                  Observações do Boletim
                </Label>
                <Textarea value={novaMedicao.observacoes}
                  onChange={(e) => setNovaMedicao({ ...novaMedicao, observacoes: e.target.value })}
                  placeholder="Descreva observações relevantes sobre o andamento da obra neste período..."
                  rows={4} />
              </div>
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Nota Fiscal (opcional)
                </Label>
                <Input value={novaMedicao.nota_fiscal_numero}
                  onChange={(e) => setNovaMedicao({ ...novaMedicao, nota_fiscal_numero: e.target.value })}
                  placeholder="Número da NF" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="0.01" value={novaMedicao.nota_fiscal_valor}
                    onChange={(e) => setNovaMedicao({ ...novaMedicao, nota_fiscal_valor: e.target.value })}
                    placeholder="Valor NF" />
                  <Input type="date" value={novaMedicao.nota_fiscal_data}
                    onChange={(e) => setNovaMedicao({ ...novaMedicao, nota_fiscal_data: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button variant="outline" onClick={() => setModalNovaMedicao(false)}>Cancelar Lançamento</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCriarMedicao} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Salvar Rascunho
              </Button>
              <Button onClick={handleCriarESubmeter} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar para Ateste
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: Submeter Medição ============ */}
      <Dialog open={modalSubmeter} onOpenChange={setModalSubmeter}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submeter {medicaoParaSubmeter?.numero_medicao}ª Medição</DialogTitle>
            <DialogDescription>
              Ao submeter, a medição será enviada para análise do fiscal do contrato.
              Valor: {formatarMoeda(medicaoParaSubmeter?.valor_medido)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Observações para o Fiscal</Label>
              <Textarea value={dadosSubmissao.fornecedor_observacoes}
                onChange={(e) => setDadosSubmissao({ ...dadosSubmissao, fornecedor_observacoes: e.target.value })}
                placeholder="Informações relevantes sobre os serviços executados..." />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Nº Nota Fiscal</Label>
                <Input value={dadosSubmissao.nota_fiscal_numero}
                  onChange={(e) => setDadosSubmissao({ ...dadosSubmissao, nota_fiscal_numero: e.target.value })} />
              </div>
              <div>
                <Label>Valor NF</Label>
                <Input type="number" step="0.01" value={dadosSubmissao.nota_fiscal_valor}
                  onChange={(e) => setDadosSubmissao({ ...dadosSubmissao, nota_fiscal_valor: e.target.value })} />
              </div>
              <div>
                <Label>Data NF</Label>
                <Input type="date" value={dadosSubmissao.nota_fiscal_data}
                  onChange={(e) => setDadosSubmissao({ ...dadosSubmissao, nota_fiscal_data: e.target.value })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalSubmeter(false)}>Cancelar</Button>
            <Button onClick={handleSubmeterMedicao} disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submeter para Análise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: Detalhe da Medição ============ */}
      <Dialog open={modalDetalhe} onOpenChange={setModalDetalhe}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{medicaoDetalhe?.numero_medicao}ª Medição — Detalhes</DialogTitle>
          </DialogHeader>

          {medicaoDetalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-gray-500">Período</p><p className="font-medium">{formatarData(medicaoDetalhe.periodo_inicio)} a {formatarData(medicaoDetalhe.periodo_fim)}</p></div>
                <div><p className="text-xs text-gray-500">Status</p><Badge className={STATUS_MEDICAO[medicaoDetalhe.status]?.cor}>{STATUS_MEDICAO[medicaoDetalhe.status]?.label}</Badge></div>
                <div><p className="text-xs text-gray-500">Valor Medido</p><p className="font-medium text-blue-700">{formatarMoeda(medicaoDetalhe.valor_medido)}</p></div>
                <div><p className="text-xs text-gray-500">% Físico</p><p className="font-medium">{Number(medicaoDetalhe.percentual_fisico_medido || 0).toFixed(1)}%</p></div>
                <div><p className="text-xs text-gray-500">Acumulado</p><p className="font-medium">{formatarMoeda(medicaoDetalhe.valor_acumulado_atual)}</p></div>
                <div><p className="text-xs text-gray-500">% Acumulado</p><p className="font-medium">{Number(medicaoDetalhe.percentual_fisico_acumulado || 0).toFixed(1)}%</p></div>
              </div>

              {/* Itens da Medição (Cronograma) */}
              {medicaoDetalhe.itens && medicaoDetalhe.itens.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">Itens do Cronograma</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-bold w-12">Item</TableHead>
                          <TableHead className="text-xs font-bold">Descrição</TableHead>
                          <TableHead className="text-xs font-bold text-right w-24">Valor Prev.</TableHead>
                          <TableHead className="text-xs font-bold text-center w-20">% Anterior</TableHead>
                          <TableHead className="text-xs font-bold text-center w-20 bg-blue-50">% Medido</TableHead>
                          <TableHead className="text-xs font-bold text-center w-20">% Acum.</TableHead>
                          <TableHead className="text-xs font-bold text-right w-28 bg-blue-50">Valor Medido</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {medicaoDetalhe.itens.map((item: any, idx: number) => (
                          <TableRow key={item.id || idx}>
                            <TableCell className="text-sm font-mono">{item.etapa_numero || idx + 1}</TableCell>
                            <TableCell className="text-sm">{item.etapa_descricao || `Etapa ${idx + 1}`}</TableCell>
                            <TableCell className="text-sm text-right">{formatarMoeda(item.etapa_valor_previsto)}</TableCell>
                            <TableCell className="text-sm text-center text-gray-500">{Number(item.percentual_executado_anterior || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-center font-medium text-blue-700 bg-blue-50/50">{Number(item.percentual_executado_atual || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-center font-medium">{Number(item.percentual_executado_acumulado || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-right font-medium text-blue-700 bg-blue-50/50">{formatarMoeda(item.valor_medido)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {medicaoDetalhe.nota_fiscal_numero && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Nota Fiscal</p>
                  <p className="text-sm">NF {medicaoDetalhe.nota_fiscal_numero} — {formatarMoeda(medicaoDetalhe.nota_fiscal_valor || 0)} — {formatarData(medicaoDetalhe.nota_fiscal_data || '')}</p>
                </div>
              )}

              {medicaoDetalhe.ateste_fiscal_nome && (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Ateste do Fiscal</p>
                  <p className="text-sm">Atestado por <strong>{medicaoDetalhe.ateste_fiscal_nome}</strong> em {formatarData(medicaoDetalhe.ateste_data || '')}</p>
                  {medicaoDetalhe.ateste_observacoes && <p className="text-sm text-gray-600 mt-1">{medicaoDetalhe.ateste_observacoes}</p>}
                </div>
              )}

              {medicaoDetalhe.aprovador_nome && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Aprovação</p>
                  <p className="text-sm">Aprovado por <strong>{medicaoDetalhe.aprovador_nome}</strong> em {formatarData(medicaoDetalhe.data_aprovacao || '')}</p>
                  {medicaoDetalhe.observacao_aprovador && <p className="text-sm text-gray-600 mt-1">{medicaoDetalhe.observacao_aprovador}</p>}
                </div>
              )}

              {medicaoDetalhe.status === 'DEVOLVIDA' && medicaoDetalhe.motivo_devolucao && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-600 mb-1">Motivo da Devolução</p>
                  <p className="text-sm text-amber-700">{medicaoDetalhe.motivo_devolucao}</p>
                </div>
              )}

              {medicaoDetalhe.status === 'REJEITADA' && medicaoDetalhe.observacao_aprovador && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600 mb-1">Motivo da Rejeição</p>
                  <p className="text-sm text-red-700">{medicaoDetalhe.observacao_aprovador}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
