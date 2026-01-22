'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ArrowRight,
  Check,
  Plus, 
  Trash2, 
  Search,
  Loader2,
  Save,
  Send,
  Package,
  FileText,
  Building2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

interface Contrato {
  id: string;
  numero_contrato: string;
  objeto: string;
  valor_inicial: number;
  data_inicio: string;
  data_fim: string;
  status: string;
  fornecedor?: {
    razao_social: string;
  };
}

interface ItemContrato {
  id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  valor_unitario: number;
  quantidade_contratada: number;
  quantidade_empenhada: number;
  quantidade_entregue: number;
  saldo_disponivel: number;
}

interface ItemRequisicao {
  item_contrato_id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade_solicitada: number;
  valor_unitario: number;
  valor_total: number;
  saldo_disponivel: number;
}

// Componente de Progresso das Etapas
function StepProgress({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center">
          <div className={`
            flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm
            ${index < currentStep 
              ? 'bg-green-500 text-white' 
              : index === currentStep 
                ? 'bg-blue-600 text-white ring-4 ring-blue-200' 
                : 'bg-gray-200 text-gray-500'
            }
          `}>
            {index < currentStep ? <Check className="h-5 w-5" /> : index + 1}
          </div>
          <span className={`
            ml-2 text-sm font-medium hidden sm:inline
            ${index === currentStep ? 'text-blue-600' : 'text-gray-500'}
          `}>
            {step}
          </span>
          {index < steps.length - 1 && (
            <div className={`
              w-12 sm:w-24 h-1 mx-2 sm:mx-4 rounded
              ${index < currentStep ? 'bg-green-500' : 'bg-gray-200'}
            `} />
          )}
        </div>
      ))}
    </div>
  );
}

function NovaRequisicaoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contratoIdUrl = searchParams.get('contrato');
  
  // Etapa atual (0 = Contrato, 1 = Itens, 2 = Dados, 3 = Resumo)
  const [etapa, setEtapa] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  
  // Etapa 1: Contrato
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [buscaContrato, setBuscaContrato] = useState('');
  
  // Etapa 2: Itens
  const [itensContrato, setItensContrato] = useState<ItemContrato[]>([]);
  const [itensRequisicao, setItensRequisicao] = useState<ItemRequisicao[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');
  
  // Etapa 3: Dados da Requisição
  const [tipo, setTipo] = useState('MATERIAL');
  const [setorSolicitante, setSetorSolicitante] = useState('');
  const [codigoSetor, setCodigoSetor] = useState('');
  const [localEntrega, setLocalEntrega] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [prioridade, setPrioridade] = useState('NORMAL');
  const [dataNecessidade, setDataNecessidade] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const STEPS = ['Contrato', 'Itens', 'Dados', 'Resumo'];

  useEffect(() => {
    carregarContratos();
  }, []);

  // Se veio com contrato na URL, pula para etapa 2
  useEffect(() => {
    if (contratoIdUrl && contratos.length > 0) {
      const contrato = contratos.find(c => c.id === contratoIdUrl);
      if (contrato) {
        setContratoSelecionado(contrato);
        setEtapa(1);
      }
    }
  }, [contratoIdUrl, contratos]);

  // Carrega itens quando seleciona contrato
  useEffect(() => {
    if (contratoSelecionado) {
      carregarItensContrato();
    }
  }, [contratoSelecionado]);

  const carregarContratos = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/contratos`);
      if (response.ok) {
        const data = await response.json();
        // Filtra contratos ativos
        const contratosAtivos = data.filter((c: Contrato) => 
          c.status === 'ATIVO' || c.status === 'VIGENTE'
        );
        setContratos(contratosAtivos);
      }
    } catch (error) {
      console.error('Erro ao carregar contratos:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarItensContrato = async () => {
    if (!contratoSelecionado) return;
    
    setCarregandoItens(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/contratos/${contratoSelecionado.id}/itens`
      );
      if (response.ok) {
        const data = await response.json();
        setItensContrato(data);
      }
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
    } finally {
      setCarregandoItens(false);
    }
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor || 0);
  };

  const formatarData = (data: string) => {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR');
  };

  // Filtrar contratos
  const contratosFiltrados = contratos.filter(c => 
    c.numero_contrato.toLowerCase().includes(buscaContrato.toLowerCase()) ||
    c.objeto?.toLowerCase().includes(buscaContrato.toLowerCase()) ||
    c.fornecedor?.razao_social?.toLowerCase().includes(buscaContrato.toLowerCase())
  );

  // Filtrar itens
  const itensFiltrados = itensContrato.filter(i =>
    i.descricao.toLowerCase().includes(buscaItem.toLowerCase()) ||
    String(i.numero_item).includes(buscaItem)
  );

  const handleSelecionarContrato = (contrato: Contrato) => {
    setContratoSelecionado(contrato);
    setItensRequisicao([]); // Limpa itens ao mudar contrato
    setEtapa(1);
  };

  const handleToggleItem = (item: ItemContrato) => {
    const jaAdicionado = itensRequisicao.find(i => i.item_contrato_id === item.id);
    
    if (jaAdicionado) {
      // Remove
      setItensRequisicao(prev => prev.filter(i => i.item_contrato_id !== item.id));
    } else {
      // Adiciona com quantidade 1
      setItensRequisicao(prev => [
        ...prev,
        {
          item_contrato_id: item.id,
          numero_item: item.numero_item,
          descricao: item.descricao,
          unidade_medida: item.unidade_medida,
          quantidade_solicitada: 1,
          valor_unitario: Number(item.valor_unitario),
          valor_total: Number(item.valor_unitario),
          saldo_disponivel: Number(item.saldo_disponivel),
        }
      ]);
    }
  };

  const handleAlterarQuantidade = (itemContratoId: string, quantidade: number) => {
    setItensRequisicao(prev => prev.map(item => {
      if (item.item_contrato_id === itemContratoId) {
        const qtd = Math.max(1, Math.min(quantidade, item.saldo_disponivel));
        return {
          ...item,
          quantidade_solicitada: qtd,
          valor_total: qtd * item.valor_unitario,
        };
      }
      return item;
    }));
  };

  const calcularTotal = () => {
    return itensRequisicao.reduce((total, item) => total + item.valor_total, 0);
  };

  const validarEtapa = (): string | null => {
    switch (etapa) {
      case 0:
        if (!contratoSelecionado) return 'Selecione um contrato';
        break;
      case 1:
        if (itensRequisicao.length === 0) return 'Selecione pelo menos um item';
        for (const item of itensRequisicao) {
          if (item.quantidade_solicitada > item.saldo_disponivel) {
            return `Item "${item.descricao}" excede o saldo disponível`;
          }
        }
        break;
      case 2:
        if (!setorSolicitante.trim()) return 'Informe o setor solicitante';
        if (!justificativa.trim()) return 'Informe a justificativa';
        break;
    }
    return null;
  };

  const handleProximaEtapa = () => {
    const erro = validarEtapa();
    if (erro) {
      alert(erro);
      return;
    }
    setEtapa(prev => Math.min(prev + 1, 3));
  };

  const handleEtapaAnterior = () => {
    setEtapa(prev => Math.max(prev - 1, 0));
  };

  const handleSalvar = async (enviarParaAutorizacao: boolean = false) => {
    setSalvando(true);
    try {
      const dados = {
        contrato_id: contratoSelecionado?.id,
        tipo,
        setor_solicitante: setorSolicitante,
        codigo_setor: codigoSetor || undefined,
        local_entrega: localEntrega || undefined,
        justificativa,
        prioridade,
        data_necessidade: dataNecessidade || undefined,
        observacoes: observacoes || undefined,
        itens: itensRequisicao.map((item, index) => ({
          item_contrato_id: item.item_contrato_id,
          numero_item: index + 1,
          descricao: item.descricao,
          unidade_medida: item.unidade_medida,
          quantidade_solicitada: Number(item.quantidade_solicitada),
          valor_unitario: Number(item.valor_unitario),
        })),
      };

      const response = await authFetch(`${API_URL}/api/almoxarifado/requisicoes`, {
        method: 'POST',
        body: JSON.stringify(dados),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao criar requisição');
      }

      const requisicao = await response.json();

      if (enviarParaAutorizacao) {
        const responseEnviar = await authFetch(
          `${API_URL}/api/almoxarifado/requisicoes/${requisicao.id}/enviar`,
          { method: 'POST' }
        );

        if (!responseEnviar.ok) {
          alert('Requisição criada, mas erro ao enviar para autorização.');
        } else {
          alert('✅ Requisição criada e enviada para autorização!\n\nSaldo reservado no contrato.');
        }
      } else {
        alert('✅ Requisição salva como rascunho!\n\nSaldo reservado no contrato.');
      }

      router.push('/orgao/almoxarifado/requisicoes');
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      alert(error.message || 'Erro ao salvar requisição');
    } finally {
      setSalvando(false);
    }
  };

  // =========================================================================
  // RENDERIZAÇÃO DAS ETAPAS
  // =========================================================================

  const renderEtapa0Contrato = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Selecione o Contrato
          </CardTitle>
          <CardDescription>
            Escolha o contrato de onde serão solicitados os itens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por número, objeto ou fornecedor..."
              value={buscaContrato}
              onChange={(e) => setBuscaContrato(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : contratosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum contrato ativo encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto">
              {contratosFiltrados.map((contrato) => (
                <Card
                  key={contrato.id}
                  className={`
                    cursor-pointer transition-all hover:shadow-md
                    ${contratoSelecionado?.id === contrato.id 
                      ? 'ring-2 ring-blue-500 bg-blue-50' 
                      : 'hover:bg-gray-50'
                    }
                  `}
                  onClick={() => handleSelecionarContrato(contrato)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant="outline" className="font-mono">
                        {contrato.numero_contrato}
                      </Badge>
                      {contratoSelecionado?.id === contrato.id && (
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-700 line-clamp-2 mb-3">
                      {contrato.objeto || 'Sem objeto definido'}
                    </p>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      <Building2 className="h-4 w-4" />
                      <span className="truncate">
                        {contrato.fornecedor?.razao_social || 'Fornecedor não definido'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Vigência: {formatarData(contrato.data_inicio)} - {formatarData(contrato.data_fim)}</span>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-sm font-medium text-blue-600">
                        {formatarMoeda(contrato.valor_inicial)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderEtapa1Itens = () => (
    <div className="space-y-6">
      {/* Card do contrato selecionado */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="outline" className="font-mono mb-1">
                {contratoSelecionado?.numero_contrato}
              </Badge>
              <p className="text-sm text-gray-600">
                {contratoSelecionado?.fornecedor?.razao_social}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEtapa(0)}>
              Trocar Contrato
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Seleção de Itens */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-green-600" />
            Selecione os Itens
          </CardTitle>
          <CardDescription>
            Marque os itens que deseja solicitar e informe as quantidades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar item..."
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              className="pl-10"
            />
          </div>

          {carregandoItens ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum item encontrado neste contrato</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-20">Unid.</TableHead>
                    <TableHead className="w-28 text-right">Saldo</TableHead>
                    <TableHead className="w-28 text-right">Valor Unit.</TableHead>
                    <TableHead className="w-32">Quantidade</TableHead>
                    <TableHead className="w-28 text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensFiltrados.map((item) => {
                    const itemReq = itensRequisicao.find(i => i.item_contrato_id === item.id);
                    const selecionado = !!itemReq;
                    const semSaldo = Number(item.saldo_disponivel) <= 0;

                    return (
                      <TableRow 
                        key={item.id}
                        className={`
                          ${selecionado ? 'bg-green-50' : ''}
                          ${semSaldo ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}
                        `}
                        onClick={() => !semSaldo && handleToggleItem(item)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selecionado}
                            disabled={semSaldo}
                            onChange={() => handleToggleItem(item)}
                            className="h-4 w-4 rounded"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.numero_item}
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <span className="line-clamp-2">{item.descricao}</span>
                        </TableCell>
                        <TableCell>{item.unidade_medida}</TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={semSaldo ? 'destructive' : 'outline'} 
                            className={semSaldo ? '' : 'text-green-600 border-green-300'}
                          >
                            {Number(item.saldo_disponivel).toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatarMoeda(item.valor_unitario)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {selecionado ? (
                            <Input
                              type="number"
                              min={1}
                              max={item.saldo_disponivel}
                              value={itemReq?.quantidade_solicitada || 1}
                              onChange={(e) => handleAlterarQuantidade(item.id, Number(e.target.value))}
                              className="w-24"
                            />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {selecionado 
                            ? formatarMoeda(itemReq?.valor_total || 0)
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {itensRequisicao.length > 0 && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-green-800 font-medium">
                  {itensRequisicao.length} item(ns) selecionado(s)
                </span>
              </div>
              <div className="text-lg font-bold text-green-700">
                Total: {formatarMoeda(calcularTotal())}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderEtapa2Dados = () => (
    <div className="space-y-6">
      {/* Resumo do que foi selecionado */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                <strong>{itensRequisicao.length}</strong> itens do contrato{' '}
                <strong>{contratoSelecionado?.numero_contrato}</strong>
              </p>
              <p className="text-lg font-bold text-blue-600">
                {formatarMoeda(calcularTotal())}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEtapa(1)}>
              Editar Itens
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Formulário de Dados */}
      <Card>
        <CardHeader>
          <CardTitle>Dados da Requisição</CardTitle>
          <CardDescription>
            Preencha as informações complementares
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MATERIAL">Material de Consumo</SelectItem>
                  <SelectItem value="SERVICO">Serviço</SelectItem>
                  <SelectItem value="PERMANENTE">Bem Permanente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="URGENTE">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Setor Solicitante *</Label>
              <Input
                value={setorSolicitante}
                onChange={(e) => setSetorSolicitante(e.target.value)}
                placeholder="Ex: Departamento de Compras"
              />
            </div>
            <div>
              <Label>Código do Setor</Label>
              <Input
                value={codigoSetor}
                onChange={(e) => setCodigoSetor(e.target.value)}
                placeholder="Ex: DCOMP-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Local de Entrega</Label>
              <Input
                value={localEntrega}
                onChange={(e) => setLocalEntrega(e.target.value)}
                placeholder="Ex: Sala 101, Bloco A"
              />
            </div>
            <div>
              <Label>Data de Necessidade</Label>
              <Input
                type="date"
                value={dataNecessidade}
                onChange={(e) => setDataNecessidade(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Justificativa *</Label>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Descreva a necessidade e o motivo da solicitação..."
              rows={3}
            />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações adicionais (opcional)"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderEtapa3Resumo = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Resumo da Requisição
          </CardTitle>
          <CardDescription>
            Confira os dados antes de finalizar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contrato */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">Contrato</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Número:</span>{' '}
                <strong>{contratoSelecionado?.numero_contrato}</strong>
              </div>
              <div>
                <span className="text-gray-500">Fornecedor:</span>{' '}
                <strong>{contratoSelecionado?.fornecedor?.razao_social}</strong>
              </div>
            </div>
          </div>

          {/* Dados da Requisição */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">Dados</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Setor:</span>{' '}
                <strong>{setorSolicitante}</strong>
              </div>
              <div>
                <span className="text-gray-500">Prioridade:</span>{' '}
                <Badge className={
                  prioridade === 'URGENTE' ? 'bg-red-100 text-red-600' :
                  prioridade === 'ALTA' ? 'bg-orange-100 text-orange-600' :
                  prioridade === 'NORMAL' ? 'bg-blue-100 text-blue-600' :
                  'bg-gray-100 text-gray-600'
                }>
                  {prioridade}
                </Badge>
              </div>
              {localEntrega && (
                <div className="col-span-2">
                  <span className="text-gray-500">Local de Entrega:</span>{' '}
                  <strong>{localEntrega}</strong>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-gray-500">Justificativa:</span>{' '}
                <strong>{justificativa}</strong>
              </div>
            </div>
          </div>

          {/* Itens */}
          <div>
            <h4 className="font-medium mb-2">Itens ({itensRequisicao.length})</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensRequisicao.map((item, index) => (
                  <TableRow key={item.item_contrato_id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {item.descricao}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantidade_solicitada} {item.unidade_medida}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatarMoeda(item.valor_unitario)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatarMoeda(item.valor_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Total */}
          <div className="p-4 bg-green-50 rounded-lg flex items-center justify-between">
            <span className="text-lg font-medium">Valor Total da Requisição</span>
            <span className="text-2xl font-bold text-green-700">
              {formatarMoeda(calcularTotal())}
            </span>
          </div>

          {/* Alerta sobre saldo */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Importante:</strong> Ao criar a requisição, o saldo será{' '}
              <strong>reservado imediatamente</strong> no contrato.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/orgao/almoxarifado/requisicoes">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nova Requisição</h1>
          <p className="text-gray-500">Solicite materiais ou serviços</p>
        </div>
      </div>

      {/* Progress Steps */}
      <StepProgress currentStep={etapa} steps={STEPS} />

      {/* Conteúdo da Etapa */}
      {etapa === 0 && renderEtapa0Contrato()}
      {etapa === 1 && renderEtapa1Itens()}
      {etapa === 2 && renderEtapa2Dados()}
      {etapa === 3 && renderEtapa3Resumo()}

      {/* Navegação */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleEtapaAnterior}
          disabled={etapa === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <div className="flex gap-2">
          {etapa < 3 ? (
            <Button onClick={handleProximaEtapa}>
              Próximo
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <>
              <Button 
                variant="outline"
                onClick={() => handleSalvar(false)}
                disabled={salvando}
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Rascunho
              </Button>
              <Button 
                onClick={() => handleSalvar(true)}
                disabled={salvando}
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Enviar para Autorização
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NovaRequisicaoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <NovaRequisicaoForm />
    </ModuleGuard>
  );
}
