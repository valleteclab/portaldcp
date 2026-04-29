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
  Trash2,
  Warehouse,
  Archive,
  FolderOpen,
  FileCheck,
  Clock,
  Download
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
  aceite_almoxarifado_data?: string | null;
  aceite_almoxarifado_usuario_nome?: string | null;
  aceite_patrimonio_data?: string | null;
  aceite_patrimonio_usuario_nome?: string | null;
  ordem_fornecimento_id?: string;
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
  PENDENTE: 'border border-amber-300 bg-amber-50 text-amber-700',
  CONFERIDO: 'border border-blue-200 bg-blue-50 text-blue-700',
  ACEITO: 'border border-emerald-300 bg-emerald-50 text-emerald-700',
  REJEITADO: 'border border-red-200 bg-red-50 text-red-700',
  ACEITO_PARCIAL: 'border border-orange-300 bg-orange-50 text-orange-700',
  ESTORNADO: 'border border-slate-200 bg-slate-100 text-slate-600',
  PENDENTE_ALMOXARIFADO: 'border border-cyan-200 bg-cyan-50 text-cyan-700',
  PENDENTE_PATRIMONIO: 'border border-purple-200 bg-purple-50 text-purple-700',
};

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente Conferência',
  CONFERIDO: 'Conferido',
  ACEITO: 'Aceito',
  REJEITADO: 'Rejeitado',
  ACEITO_PARCIAL: 'Aceito Parcialmente',
  ESTORNADO: 'Estornado',
  PENDENTE_ALMOXARIFADO: 'Pendente aceite almoxarifado',
  PENDENTE_PATRIMONIO: 'Pendente aceite patrimônio',
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
  const [recebimentoSelecionado, setRecebimentoSelecionado] = useState<Recebimento>({} as Recebimento);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showAceitar, setShowAceitar] = useState(false);
  const [showAceitarAlmox, setShowAceitarAlmox] = useState(false);
  const [showAceitarPatrimonio, setShowAceitarPatrimonio] = useState(false);
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [showEstornar, setShowEstornar] = useState(false);
  const [showExcluir, setShowExcluir] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [motivoEstorno, setMotivoEstorno] = useState('');
  const [processando, setProcessando] = useState(false);
  const [ordensAguardando, setOrdensAguardando] = useState<any[]>([]);

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
    carregarOrdensAguardando();
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

  const carregarOrdensAguardando = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/almoxarifado/ordens/em-andamento`);
      if (response.ok) {
        const data = await response.json();
        setOrdensAguardando(Array.isArray(data) ? data : data.data || []);
      }
    } catch {}
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const formatarData = (data?: string | null) => {
    if (!data) return '-';
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

  const handleAceitarAlmoxarifado = async () => {
    if (!recebimentoSelecionado) return;
    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${recebimentoSelecionado.id}/aceitar-almoxarifado`,
        { method: 'POST' }
      );
      if (response.ok) {
        alert('Itens de almoxarifado (consumo) aceitos! Baixa realizada.');
        setShowAceitarAlmox(false);
        carregarRecebimentos();
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao aceitar almoxarifado:', error);
      alert('Erro ao aceitar itens de almoxarifado');
    } finally {
      setProcessando(false);
    }
  };

  const handleAceitarPatrimonio = async () => {
    if (!recebimentoSelecionado) return;
    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${recebimentoSelecionado.id}/aceitar-patrimonio`,
        { method: 'POST' }
      );
      if (response.ok) {
        alert('Itens de patrimônio (permanente) aceitos! Baixa realizada.');
        setShowAceitarPatrimonio(false);
        carregarRecebimentos();
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao aceitar patrimônio:', error);
      alert('Erro ao aceitar itens de patrimônio');
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

  const handleDownloadPDF = async (rec: Recebimento) => {
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/recebimentos/${rec.id}/comprovacao-aceite`
      );
      
      if (!response.ok) {
        const error = await response.json();
        alert(error.message || 'PDF não disponível');
        return;
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Comprovacao_Aceite_${rec.numero.replace(/\//g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao baixar PDF:', error);
      alert('Erro ao baixar PDF');
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

  const dataHoje = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const fornecedorCurto = (nome?: string) => {
    if (!nome) return '-';
    return nome.length > 42 ? `${nome.slice(0, 42)}...` : nome;
  };

  if (loading) {
    return (
      <div className="min-h-[520px] bg-[#edf3ff] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#123f82]" />
      </div>
    );
  }

  return (
    <div className="-m-6 min-h-[calc(100vh-4rem)] bg-[#edf3ff] text-[#0d2342]">
      <div className="bg-[#102b63] text-white">
        <div className="mx-auto flex h-[62px] max-w-[1280px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/orgao/almoxarifado"
              className="flex h-9 items-center rounded-lg bg-[#ffd33d] px-4 text-[13px] font-black tracking-wide text-[#102b63]"
            >
              ALMOX
            </Link>
            <div>
              <h1 className="text-[17px] font-black leading-tight tracking-tight">Recebimentos</h1>
              <p className="text-xs font-medium text-blue-100">Conferencia e aceite de materiais/servicos</p>
            </div>
          </div>
          <p className="hidden text-xs font-medium text-blue-100 sm:block">{dataHoje}</p>
        </div>
      </div>

      <div className="mx-auto max-w-[1020px] space-y-7 px-4 py-8 sm:px-6">
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Package className="h-5 w-5 text-[#123f82]" />
            <h2 className="text-xl font-black tracking-tight text-[#123f82]">Ordens Aguardando Recebimento</h2>
            <span className="rounded-full bg-[#123f82] px-3 py-0.5 text-xs font-black text-[#ffd33d]">
              {ordensAguardando.length}
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#d8e2f2] bg-white shadow-[0_10px_24px_rgba(16,43,99,0.08)]">
            {ordensAguardando.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                Nenhuma ordem aguardando recebimento.
              </div>
            ) : (
              ordensAguardando.map((of: any) => {
                const nfDisponivel = !!of.nf_disponivel;
                return (
                  <div
                    key={of.id}
                    className="grid grid-cols-1 gap-4 border-b border-[#e7edf6] px-5 py-4 last:border-b-0 md:grid-cols-[1fr_170px_72px_132px_96px]"
                  >
                    <div className="min-w-0">
                      <p className="text-[17px] font-black tracking-tight text-[#0f4388]">{of.numero}</p>
                      <p className="mt-1 truncate text-xs font-bold uppercase tracking-wide text-slate-500">
                        {of.fornecedor?.razao_social || '-'}
                      </p>
                    </div>

                    <div className="flex items-center md:justify-center">
                      {nfDisponivel ? (
                        <Badge className="h-8 rounded-full border border-emerald-300 bg-emerald-50 px-4 text-xs font-black text-emerald-700">
                          NF Disponivel
                        </Badge>
                      ) : of.nf_recusada ? (
                        <Badge className="h-8 rounded-full border border-red-300 bg-red-50 px-4 text-xs font-black text-red-700">
                          NF recusada
                        </Badge>
                      ) : (
                        <Badge className="h-8 rounded-full border border-amber-300 bg-amber-50 px-4 text-xs font-black text-amber-700">
                          Aguard. NF
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 md:block md:text-center">
                      <span className="text-[11px] font-semibold text-slate-400">Itens</span>
                      <p className="text-base font-black text-[#0d2342]">{of.itens?.length || 0}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:block md:text-right">
                      <span className="text-[11px] font-semibold text-slate-400">Valor</span>
                      <p className="text-base font-black text-[#0d2342]">{formatarMoeda(of.valor_total || 0)}</p>
                    </div>

                    <div className="flex items-center md:justify-end">
                      {nfDisponivel ? (
                        <Button asChild className="h-10 rounded-lg bg-[#123f82] px-5 text-sm font-black text-white shadow-none hover:bg-[#0e3470]">
                          <Link href={`/orgao/almoxarifado/recebimentos/${of.id}`}>
                            <span className="mr-2 text-[#ffd33d]">-&gt;</span>
                            Abrir
                          </Link>
                        </Button>
                      ) : (
                        <Button disabled variant="outline" className="h-10 w-14 rounded-lg border-[#e5ebf5] bg-[#f6f8fc] text-lg font-black text-slate-300">
                          -
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[#c98962]" />
              <h2 className="text-xl font-black tracking-tight text-[#24324a]">Historico de Recebimentos</h2>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por numero, ordem ou fornecedor..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-9 w-full rounded-lg border-[#d7e0ee] bg-white pl-11 text-sm shadow-none sm:w-[270px]"
                />
              </div>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-9 w-full rounded-lg border-[#d7e0ee] bg-white text-sm font-bold shadow-none sm:w-[154px]">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os status</SelectItem>
                  <SelectItem value="PENDENTE">Pend. Conferencia</SelectItem>
                  <SelectItem value="CONFERIDO">Conferido</SelectItem>
                  <SelectItem value="PENDENTE_ALMOXARIFADO">Pendente almoxarifado</SelectItem>
                  <SelectItem value="PENDENTE_PATRIMONIO">Pendente patrimonio</SelectItem>
                  <SelectItem value="ACEITO">Aceito</SelectItem>
                  <SelectItem value="ACEITO_PARCIAL">Aceito Parcial</SelectItem>
                  <SelectItem value="REJEITADO">Rejeitado</SelectItem>
                  <SelectItem value="ESTORNADO">Estornado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#d8e2f2] bg-white shadow-[0_10px_24px_rgba(16,43,99,0.08)]">
            <Table>
              <TableHeader className="bg-[#f8fafd]">
                <TableRow className="border-[#dfe7f2] hover:bg-[#f8fafd]">
                  <TableHead className="h-10 px-5 text-[11px] font-black uppercase tracking-widest text-slate-500">Numero</TableHead>
                  <TableHead className="h-10 text-[11px] font-black uppercase tracking-widest text-slate-500">Ordem</TableHead>
                  <TableHead className="h-10 text-[11px] font-black uppercase tracking-widest text-slate-500">Fornecedor</TableHead>
                  <TableHead className="h-10 text-[11px] font-black uppercase tracking-widest text-slate-500">Data</TableHead>
                  <TableHead className="h-10 text-[11px] font-black uppercase tracking-widest text-slate-500">NF</TableHead>
                  <TableHead className="h-10 text-[11px] font-black uppercase tracking-widest text-slate-500">Valor</TableHead>
                  <TableHead className="h-10 text-[11px] font-black uppercase tracking-widest text-slate-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recebimentosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm font-semibold text-slate-500">
                      Nenhum recebimento encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  recebimentosFiltrados.map((rec) => (
                    <TableRow key={rec.id} className="border-[#edf1f7] hover:bg-[#f8fbff]">
                      <TableCell className="px-5 py-4 font-black text-[#0f4388]">{rec.numero}</TableCell>
                      <TableCell className="py-4 font-bold text-[#24324a]">{rec.ordem_fornecimento?.numero || '-'}</TableCell>
                      <TableCell className="max-w-[260px] truncate py-4 text-xs font-bold text-[#24324a]">
                        {fornecedorCurto(rec.ordem_fornecimento?.fornecedor?.razao_social)}
                      </TableCell>
                      <TableCell className="py-4 font-medium text-slate-600">{formatarData(rec.data_recebimento)}</TableCell>
                      <TableCell className="py-4 font-black text-[#24324a]">{rec.numero_nota_fiscal || '-'}</TableCell>
                      <TableCell className="py-4 font-black text-[#24324a]">{formatarMoeda(rec.valor_total_recebido)}</TableCell>
                      <TableCell className="py-4">
                        <Badge className={`rounded-full px-3 py-1 text-xs font-black ${STATUS_COLORS[rec.status]}`}>
                          {STATUS_LABELS[rec.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
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

