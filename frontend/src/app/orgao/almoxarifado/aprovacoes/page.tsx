'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Eye, 
  AlertTriangle,
  Clock,
  DollarSign,
  User,
  Calendar,
  FileText,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

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

interface PermissaoAprovacao {
  pode_aprovar: boolean;
  motivo?: string;
  configuracao?: {
    exigir_justificativa_aprovacao: boolean;
    exigir_justificativa_negacao: boolean;
  };
}

const PRIORIDADE_COLORS: Record<string, string> = {
  URGENTE: 'bg-red-100 text-red-800',
  ALTA: 'bg-orange-100 text-orange-800',
  NORMAL: 'bg-blue-100 text-blue-800',
  BAIXA: 'bg-gray-100 text-gray-800',
};

function AprovacoesContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [requisicaoSelecionada, setRequisicaoSelecionada] = useState<Requisicao | null>(null);
  const [permissao, setPermissao] = useState<PermissaoAprovacao | null>(null);
  const [showAprovacao, setShowAprovacao] = useState(false);
  const [showNegacao, setShowNegacao] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [motivoNegativa, setMotivoNegativa] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [temPermissaoAprovador, setTemPermissaoAprovador] = useState<boolean | null>(null);

  // Verifica permissão de aprovador
  useEffect(() => {
    try {
      const usuarioStr = localStorage.getItem('usuario');
      if (usuarioStr) {
        const usuario = JSON.parse(usuarioStr);
        const podeAprovar = usuario.pode_aprovar_requisicoes === true;
        setTemPermissaoAprovador(podeAprovar);
        
        if (!podeAprovar) {
          alert('Você não tem permissão para acessar a página de aprovações.');
          router.push('/orgao/almoxarifado');
          return;
        }
      } else {
        setTemPermissaoAprovador(false);
        router.push('/orgao-login');
        return;
      }
    } catch (e) {
      console.error('Erro ao verificar permissão:', e);
      setTemPermissaoAprovador(false);
    }
  }, [router]);

  useEffect(() => {
    if (temPermissaoAprovador === true) {
      carregarRequisicoes();
    }
  }, [temPermissaoAprovador]);

  const carregarRequisicoes = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/pendentes`);
      
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

  const verificarPermissao = async (requisicao: Requisicao) => {
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicao.id}/verificar-permissao-aprovacao`,
        { method: 'POST' }
      );
      
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      return { pode_aprovar: true };
    } catch (error) {
      console.error('Erro ao verificar permissão:', error);
      return { pode_aprovar: true };
    }
  };

  const abrirAprovacao = async (requisicao: Requisicao) => {
    setRequisicaoSelecionada(requisicao);
    const perm = await verificarPermissao(requisicao);
    setPermissao(perm);
    
    if (!perm.pode_aprovar) {
      alert(perm.motivo || 'Você não tem permissão para aprovar esta requisição');
      return;
    }
    
    setObservacao('');
    setShowAprovacao(true);
  };

  const abrirNegacao = async (requisicao: Requisicao) => {
    setRequisicaoSelecionada(requisicao);
    const perm = await verificarPermissao(requisicao);
    setPermissao(perm);
    
    if (!perm.pode_aprovar) {
      alert(perm.motivo || 'Você não tem permissão para negar esta requisição');
      return;
    }
    
    setMotivoNegativa('');
    setShowNegacao(true);
  };

  const aprovar = async () => {
    if (!requisicaoSelecionada) return;
    
    if (permissao?.configuracao?.exigir_justificativa_aprovacao && !observacao.trim()) {
      alert('É obrigatório informar uma justificativa para aprovar esta requisição');
      return;
    }

    setProcessando(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/requisicoes/${requisicaoSelecionada.id}/autorizar`,
        {
          method: 'POST',
          body: JSON.stringify({ observacao }),
        }
      );

      if (response.ok) {
        setShowAprovacao(false);
        await carregarRequisicoes();
        alert('Requisição aprovada com sucesso! O solicitante será notificado.');
      } else {
        const error = await response.json();
        alert(`Erro ao aprovar: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao aprovar:', error);
      alert('Erro ao aprovar requisição');
    } finally {
      setProcessando(false);
    }
  };

  const negar = async () => {
    if (!requisicaoSelecionada) return;
    
    if (!motivoNegativa.trim()) {
      alert('É obrigatório informar o motivo da negativa');
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
        setShowNegacao(false);
        await carregarRequisicoes();
        alert('Requisição negada. O solicitante será notificado.');
      } else {
        const error = await response.json();
        alert(`Erro ao negar: ${error.message}`);
      }
    } catch (error) {
      console.error('Erro ao negar:', error);
      alert('Erro ao negar requisição');
    } finally {
      setProcessando(false);
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatarMoeda = (valor: number | null | undefined) => {
    if (valor === null || valor === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Aguarda verificação de permissão ou se não tem permissão
  if (temPermissaoAprovador === null || temPermissaoAprovador === false) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-7 w-7 text-yellow-600" />
            Aprovações Pendentes
          </h1>
          <p className="text-gray-500 mt-1">
            Requisições aguardando sua autorização
          </p>
        </div>
        <Button variant="outline" onClick={carregarRequisicoes}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Contador */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={requisicoes.length > 0 ? 'border-yellow-200 bg-yellow-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {requisicoes.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Valor Total Pendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatarMoeda(requisicoes.reduce((acc, r) => acc + Number(r.valor_total_estimado || 0), 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Urgentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {requisicoes.filter(r => r.prioridade === 'URGENTE' || r.prioridade === 'ALTA').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Requisições */}
      {requisicoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhuma requisição pendente
            </h3>
            <p className="text-gray-500">
              Você está em dia! Todas as requisições foram processadas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requisicoes.map((requisicao) => (
            <Card key={requisicao.id} className="overflow-hidden">
              <Collapsible open={expandedId === requisicao.id} onOpenChange={() => toggleExpand(requisicao.id)}>
                {/* Cabeçalho da Requisição */}
                <div className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-lg">{requisicao.numero}</span>
                        <Badge className={PRIORIDADE_COLORS[requisicao.prioridade]}>
                          {requisicao.prioridade}
                        </Badge>
                        <Badge variant="outline">{requisicao.tipo}</Badge>
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
                          {expandedId === requisicao.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => abrirAprovacao(requisicao)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => abrirNegacao(requisicao)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Negar
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Detalhes Expandidos */}
                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t bg-gray-50">
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Justificativa</h4>
                      <p className="text-sm text-gray-600 bg-white p-3 rounded-md">
                        {requisicao.justificativa}
                      </p>
                    </div>

                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Itens ({requisicao.itens?.length || 0})</h4>
                      <Table>
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
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Aprovação */}
      <Dialog open={showAprovacao} onOpenChange={setShowAprovacao}>
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
              <Label htmlFor="observacao">
                Observação {permissao?.configuracao?.exigir_justificativa_aprovacao ? '*' : '(opcional)'}
              </Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Adicione uma observação se necessário"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAprovacao(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={aprovar}
              disabled={processando}
            >
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Confirmar Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Negação */}
      <Dialog open={showNegacao} onOpenChange={setShowNegacao}>
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
              <Label htmlFor="motivo">Motivo da Negativa *</Label>
              <Textarea
                id="motivo"
                value={motivoNegativa}
                onChange={(e) => setMotivoNegativa(e.target.value)}
                placeholder="Informe o motivo da negativa"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNegacao(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={negar}
              disabled={processando || !motivoNegativa.trim()}
            >
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirmar Negativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AprovacoesPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        <AprovacoesContent />
      </Suspense>
    </ModuleGuard>
  );
}
