'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Warehouse, 
  FileText, 
  Package, 
  ClipboardList, 
  TrendingUp, 
  AlertTriangle,
  Plus,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

interface EstatisticasRequisicoes {
  total: number;
  por_status: Record<string, number>;
  valor_total_autorizadas: number;
  pendentes_autorizacao: number;
}

function AlmoxarifadoDashboardContent() {
  const [loading, setLoading] = useState(true);
  const [estatisticas, setEstatisticas] = useState<EstatisticasRequisicoes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/estatisticas`);
      
      if (response.ok) {
        const data = await response.json();
        setEstatisticas(data);
      } else {
        // Se o endpoint ainda não existe, usa dados vazios
        setEstatisticas({
          total: 0,
          por_status: {},
          valor_total_autorizadas: 0,
          pendentes_autorizacao: 0,
        });
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err);
      setEstatisticas({
        total: 0,
        por_status: {},
        valor_total_autorizadas: 0,
        pendentes_autorizacao: 0,
      });
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
            <Warehouse className="h-7 w-7 text-blue-600" />
            Almoxarifado
          </h1>
          <p className="text-gray-500 mt-1">
            Gestão de requisições, ordens de fornecimento e estoque
          </p>
        </div>
        <Button asChild>
          <Link href="/orgao/almoxarifado/requisicoes/nova">
            <Plus className="h-4 w-4 mr-2" />
            Nova Requisição
          </Link>
        </Button>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total de Requisições
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {estatisticas?.total || 0}
            </div>
          </CardContent>
        </Card>

        <Card className={estatisticas?.pendentes_autorizacao ? 'border-yellow-200 bg-yellow-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Pendentes de Autorização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {estatisticas?.pendentes_autorizacao || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Autorizadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {estatisticas?.por_status?.AUTORIZADA || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Valor Total Autorizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatarMoeda(estatisticas?.valor_total_autorizadas || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/orgao/almoxarifado/requisicoes">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ClipboardList className="h-6 w-6 text-blue-600" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <CardTitle className="mt-4">Requisições</CardTitle>
              <CardDescription>
                Criar e gerenciar requisições de materiais e serviços
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/orgao/almoxarifado/ordens">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FileText className="h-6 w-6 text-green-600" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <CardTitle className="mt-4">Ordens de Fornecimento</CardTitle>
              <CardDescription>
                Gerenciar ordens enviadas aos fornecedores
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <Link href="/orgao/almoxarifado/estoque">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Package className="h-6 w-6 text-purple-600" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <CardTitle className="mt-4">Estoque</CardTitle>
              <CardDescription>
                Controle de estoque e movimentações
              </CardDescription>
            </CardHeader>
          </Link>
        </Card>
      </div>

      {/* Requisições Pendentes */}
      {estatisticas && estatisticas.pendentes_autorizacao > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Requisições Aguardando Autorização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              Você tem {estatisticas.pendentes_autorizacao} requisição(ões) aguardando autorização.
            </p>
            <Button variant="outline" asChild>
              <Link href="/orgao/almoxarifado/requisicoes?status=AGUARDANDO_AUTORIZACAO">
                Ver Requisições Pendentes
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Status do Fluxo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fluxo de Aquisição</CardTitle>
          <CardDescription>
            Acompanhe o ciclo de compras do seu órgão
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-blue-600" />
              </div>
              <span className="text-sm mt-2 font-medium">Requisição</span>
              <span className="text-xs text-gray-500">{estatisticas?.por_status?.RASCUNHO || 0} rascunhos</span>
            </div>
            
            <ArrowRight className="h-5 w-5 text-gray-300" />
            
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-yellow-600" />
              </div>
              <span className="text-sm mt-2 font-medium">Autorização</span>
              <span className="text-xs text-gray-500">{estatisticas?.pendentes_autorizacao || 0} pendentes</span>
            </div>
            
            <ArrowRight className="h-5 w-5 text-gray-300" />
            
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <span className="text-sm mt-2 font-medium">Ordem de Fornecimento</span>
              <span className="text-xs text-gray-500">{estatisticas?.por_status?.ORDEM_GERADA || 0} geradas</span>
            </div>
            
            <ArrowRight className="h-5 w-5 text-gray-300" />
            
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Package className="h-6 w-6 text-purple-600" />
              </div>
              <span className="text-sm mt-2 font-medium">Recebimento</span>
              <span className="text-xs text-gray-500">{estatisticas?.por_status?.ATENDIDA || 0} concluídas</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AlmoxarifadoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <AlmoxarifadoDashboardContent />
    </ModuleGuard>
  );
}
