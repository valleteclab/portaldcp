'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Search,
  Loader2,
  Save,
  Send,
  Package
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

interface Contrato {
  id: string;
  numero_contrato: string;
  objeto: string;
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
  saldo_disponivel: number;
}

interface ItemRequisicao {
  item_contrato_id?: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade_solicitada: number;
  valor_unitario: number;
  valor_total: number;
  saldo_disponivel?: number;
}

function NovaRequisicaoForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  
  // Dados do formulário
  const [tipo, setTipo] = useState('MATERIAL');
  const [setorSolicitante, setSetorSolicitante] = useState('');
  const [codigoSetor, setCodigoSetor] = useState('');
  const [localEntrega, setLocalEntrega] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [prioridade, setPrioridade] = useState('NORMAL');
  const [dataNecessidade, setDataNecessidade] = useState('');
  const [observacoes, setObservacoes] = useState('');
  
  // Contrato e itens
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState('');
  const [itensContrato, setItensContrato] = useState<ItemContrato[]>([]);
  const [itensRequisicao, setItensRequisicao] = useState<ItemRequisicao[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  
  // Modal de seleção de itens
  const [showSelecionarItens, setShowSelecionarItens] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set());
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});

  useEffect(() => {
    carregarContratos();
  }, []);

  useEffect(() => {
    if (contratoId) {
      carregarItensContrato();
    } else {
      setItensContrato([]);
    }
  }, [contratoId]);

  const carregarContratos = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/contratos`);
      if (response.ok) {
        const data = await response.json();
        // Filtra apenas contratos ativos
        const contratosAtivos = data.filter((c: any) => 
          c.status === 'ATIVO' || c.status === 'VIGENTE'
        );
        setContratos(contratosAtivos);
      }
    } catch (error) {
      console.error('Erro ao carregar contratos:', error);
    }
  };

  const carregarItensContrato = async () => {
    if (!contratoId) return;
    
    setCarregandoItens(true);
    try {
      const response = await authFetch(
        `${API_URL}/api/almoxarifado/contratos/${contratoId}/itens/disponiveis`
      );
      if (response.ok) {
        const data = await response.json();
        setItensContrato(data);
      }
    } catch (error) {
      console.error('Erro ao carregar itens do contrato:', error);
    } finally {
      setCarregandoItens(false);
    }
  };

  const handleSelecionarItem = (itemId: string) => {
    const novosSelecionados = new Set(itensSelecionados);
    if (novosSelecionados.has(itemId)) {
      novosSelecionados.delete(itemId);
    } else {
      novosSelecionados.add(itemId);
      // Inicializa quantidade com 1
      if (!quantidades[itemId]) {
        setQuantidades(prev => ({ ...prev, [itemId]: 1 }));
      }
    }
    setItensSelecionados(novosSelecionados);
  };

  const handleConfirmarItens = () => {
    const novosItens: ItemRequisicao[] = [];
    
    itensContrato.forEach((item) => {
      if (itensSelecionados.has(item.id)) {
        const quantidade = quantidades[item.id] || 1;
        novosItens.push({
          item_contrato_id: item.id,
          numero_item: itensRequisicao.length + novosItens.length + 1,
          descricao: item.descricao,
          unidade_medida: item.unidade_medida,
          quantidade_solicitada: quantidade,
          valor_unitario: item.valor_unitario,
          valor_total: quantidade * item.valor_unitario,
          saldo_disponivel: item.saldo_disponivel,
        });
      }
    });

    setItensRequisicao(prev => [...prev, ...novosItens]);
    setShowSelecionarItens(false);
    setItensSelecionados(new Set());
    setQuantidades({});
  };

  const handleRemoverItem = (index: number) => {
    setItensRequisicao(prev => {
      const novos = prev.filter((_, i) => i !== index);
      // Renumera os itens
      return novos.map((item, i) => ({ ...item, numero_item: i + 1 }));
    });
  };

  const handleAlterarQuantidade = (index: number, quantidade: number) => {
    setItensRequisicao(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          quantidade_solicitada: quantidade,
          valor_total: quantidade * item.valor_unitario,
        };
      }
      return item;
    }));
  };

  const calcularTotal = () => {
    return itensRequisicao.reduce((total, item) => total + item.valor_total, 0);
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  };

  const validarFormulario = (): string | null => {
    if (!setorSolicitante.trim()) return 'Informe o setor solicitante';
    if (!justificativa.trim()) return 'Informe a justificativa';
    if (itensRequisicao.length === 0) return 'Adicione pelo menos um item';
    
    // Valida quantidades
    for (const item of itensRequisicao) {
      if (item.quantidade_solicitada <= 0) {
        return `Item "${item.descricao}" deve ter quantidade maior que zero`;
      }
      if (item.saldo_disponivel !== undefined && item.quantidade_solicitada > item.saldo_disponivel) {
        return `Item "${item.descricao}" excede o saldo disponível (${item.saldo_disponivel})`;
      }
    }
    
    return null;
  };

  const handleSalvar = async (enviarParaAutorizacao: boolean = false) => {
    const erro = validarFormulario();
    if (erro) {
      alert(erro);
      return;
    }

    setSalvando(true);
    try {
      const dados = {
        contrato_id: contratoId || undefined,
        tipo,
        setor_solicitante: setorSolicitante,
        codigo_setor: codigoSetor || undefined,
        local_entrega: localEntrega || undefined,
        justificativa,
        prioridade,
        data_necessidade: dataNecessidade || undefined,
        observacoes: observacoes || undefined,
        itens: itensRequisicao.map(item => ({
          item_contrato_id: item.item_contrato_id,
          numero_item: item.numero_item,
          descricao: item.descricao,
          unidade_medida: item.unidade_medida,
          quantidade_solicitada: item.quantidade_solicitada,
          valor_unitario: item.valor_unitario,
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

      // Se deve enviar para autorização
      if (enviarParaAutorizacao) {
        const responseEnviar = await authFetch(
          `${API_URL}/api/almoxarifado/requisicoes/${requisicao.id}/enviar`,
          { method: 'POST' }
        );

        if (!responseEnviar.ok) {
          alert('Requisição criada, mas erro ao enviar para autorização. Você pode enviar depois.');
        } else {
          alert('Requisição criada e enviada para autorização!');
        }
      } else {
        alert('Requisição salva como rascunho!');
      }

      router.push('/orgao/almoxarifado/requisicoes');
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      alert(error.message || 'Erro ao salvar requisição');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
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

      {/* Formulário */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dados Básicos */}
          <Card>
            <CardHeader>
              <CardTitle>Dados da Requisição</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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

          {/* Seleção de Contrato */}
          <Card>
            <CardHeader>
              <CardTitle>Contrato</CardTitle>
              <CardDescription>
                Selecione o contrato de onde serão consumidos os itens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={contratoId} onValueChange={setContratoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um contrato..." />
                </SelectTrigger>
                <SelectContent>
                  {contratos.map((contrato) => (
                    <SelectItem key={contrato.id} value={contrato.id}>
                      {contrato.numero_contrato} - {contrato.objeto?.substring(0, 50)}...
                      {contrato.fornecedor && ` (${contrato.fornecedor.razao_social})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Itens */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Itens da Requisição</CardTitle>
                  <CardDescription>
                    {itensRequisicao.length} item(s) adicionado(s)
                  </CardDescription>
                </div>
                <Dialog open={showSelecionarItens} onOpenChange={setShowSelecionarItens}>
                  <DialogTrigger asChild>
                    <Button disabled={!contratoId}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Itens
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Selecionar Itens do Contrato</DialogTitle>
                      <DialogDescription>
                        Selecione os itens e informe as quantidades desejadas
                      </DialogDescription>
                    </DialogHeader>
                    
                    {carregandoItens ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                      </div>
                    ) : itensContrato.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum item com saldo disponível neste contrato</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead>Unid.</TableHead>
                              <TableHead>Saldo</TableHead>
                              <TableHead>Valor Unit.</TableHead>
                              <TableHead>Quantidade</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {itensContrato.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={itensSelecionados.has(item.id)}
                                    onChange={() => handleSelecionarItem(item.id)}
                                    className="h-4 w-4"
                                  />
                                </TableCell>
                                <TableCell>{item.numero_item}</TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {item.descricao}
                                </TableCell>
                                <TableCell>{item.unidade_medida}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-green-600">
                                    {item.saldo_disponivel}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatarMoeda(item.valor_unitario)}</TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={item.saldo_disponivel}
                                    value={quantidades[item.id] || 1}
                                    onChange={(e) => setQuantidades(prev => ({
                                      ...prev,
                                      [item.id]: parseInt(e.target.value) || 1
                                    }))}
                                    disabled={!itensSelecionados.has(item.id)}
                                    className="w-20"
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setShowSelecionarItens(false)}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleConfirmarItens}
                            disabled={itensSelecionados.size === 0}
                          >
                            Adicionar {itensSelecionados.size} Item(s)
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {itensRequisicao.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum item adicionado</p>
                  <p className="text-sm">
                    {contratoId 
                      ? 'Clique em "Adicionar Itens" para selecionar itens do contrato'
                      : 'Selecione um contrato primeiro'
                    }
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Unid.</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Valor Unit.</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensRequisicao.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell>{item.unidade_medida}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            max={item.saldo_disponivel}
                            value={item.quantidade_solicitada}
                            onChange={(e) => handleAlterarQuantidade(index, parseInt(e.target.value) || 1)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>{formatarMoeda(item.valor_unitario)}</TableCell>
                        <TableCell className="font-medium">
                          {formatarMoeda(item.valor_total)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoverItem(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna Lateral - Resumo */}
        <div className="space-y-6">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Itens:</span>
                <span className="font-medium">{itensRequisicao.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Prioridade:</span>
                <Badge className={
                  prioridade === 'URGENTE' ? 'bg-red-100 text-red-600' :
                  prioridade === 'ALTA' ? 'bg-orange-100 text-orange-600' :
                  prioridade === 'NORMAL' ? 'bg-blue-100 text-blue-600' :
                  'bg-gray-100 text-gray-600'
                }>
                  {prioridade}
                </Badge>
              </div>
              <hr />
              <div className="flex justify-between text-lg">
                <span className="font-medium">Valor Total:</span>
                <span className="font-bold text-blue-600">
                  {formatarMoeda(calcularTotal())}
                </span>
              </div>

              <div className="space-y-2 pt-4">
                <Button 
                  className="w-full" 
                  onClick={() => handleSalvar(true)}
                  disabled={salvando || itensRequisicao.length === 0}
                >
                  {salvando ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Enviar para Autorização
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => handleSalvar(false)}
                  disabled={salvando}
                >
                  {salvando ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar como Rascunho
                </Button>
              </div>

              <div className="text-xs text-gray-500 pt-2">
                <p>• Rascunhos podem ser editados depois</p>
                <p>• Ao enviar, a requisição vai para aprovação</p>
                <p>• Saldo só é reservado após autorização</p>
              </div>
            </CardContent>
          </Card>
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
