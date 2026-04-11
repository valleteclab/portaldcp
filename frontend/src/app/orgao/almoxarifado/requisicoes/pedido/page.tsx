'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Loader2,
  Save,
  Send,
  Building2,
  ShoppingCart,
  Minus,
  Plus,
  X,
  Package,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Wallet,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Contrato {
  id: string;
  numero_contrato: string;
  objeto: string;
  categoria: string;
  valor_global: number;
  saldo_total_em_valor?: number;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  status: string;
  fornecedor_razao_social?: string;
  fornecedor?: { razao_social: string };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarMoeda(v: number | string | undefined | null): string {
  const n = Number(v) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.floor(n * 100) / 100);
}

function getNomeFornecedor(c: Contrato): string {
  return c.fornecedor_razao_social || c.fornecedor?.razao_social || '—';
}

function getSaldoDisponivel(c: Contrato): number {
  if (c.saldo_total_em_valor != null) return Number(c.saldo_total_em_valor);
  return Number(c.valor_global);
}

function getDiasRestantes(dataFim: string): number {
  if (!dataFim) return 0;
  const fim = new Date(dataFim);
  const hoje = new Date();
  return Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function formatarData(data: string): string {
  if (!data) return '—';
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR');
}

// ─── Componente: Card de Item ─────────────────────────────────────────────────

function ItemCard({
  item,
  quantidade,
  onChangeQtd,
}: {
  item: ItemContrato;
  quantidade: number;
  onChangeQtd: (qtd: number) => void;
}) {
  const saldo = Number(item.saldo_disponivel);
  const temSaldo = saldo > 0;
  const selecionado = quantidade > 0;

  const handleInput = (e: { target: HTMLInputElement }) => {
    const raw = e.target.value.replace(',', '.');
    const v = parseFloat(raw);
    if (isNaN(v) || v < 0) {
      onChangeQtd(0);
    } else {
      onChangeQtd(Math.min(v, saldo));
    }
  };

  return (
    <div
      className={`
        rounded-xl border p-4 transition-all duration-150 select-none
        ${!temSaldo ? 'opacity-50 bg-gray-50 border-gray-200' : ''}
        ${selecionado ? 'border-blue-400 bg-blue-50 shadow-sm' : temSaldo ? 'border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Info do item */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
            {item.descricao}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
              {item.unidade_medida}
            </span>
            <Badge
              variant={temSaldo ? 'outline' : 'destructive'}
              className={`text-xs px-1.5 py-0 ${temSaldo ? 'border-green-300 text-green-700 bg-green-50' : ''}`}
            >
              Saldo: {saldo.toLocaleString('pt-BR')}
            </Badge>
            <span className="text-xs font-semibold text-gray-700">
              {formatarMoeda(item.valor_unitario)}
              <span className="font-normal text-gray-500">/{item.unidade_medida.toLowerCase()}</span>
            </span>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 rounded-full"
            disabled={!temSaldo || quantidade <= 0}
            onClick={() => onChangeQtd(Math.max(0, quantidade - 1))}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            min="0"
            max={saldo}
            step="1"
            className="w-16 text-center h-8 text-sm px-1"
            value={quantidade > 0 ? quantidade : ''}
            placeholder="0"
            disabled={!temSaldo}
            onChange={handleInput}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 rounded-full"
            disabled={!temSaldo || quantidade >= saldo}
            onClick={() => onChangeQtd(Math.min(quantidade + 1, saldo))}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Subtotal quando selecionado */}
      {selecionado && (
        <div className="mt-2 pt-2 border-t border-blue-200 flex justify-between items-center">
          <span className="text-xs text-blue-600">
            {quantidade} {item.unidade_medida.toLowerCase()}
          </span>
          <span className="text-sm font-bold text-blue-700">
            {formatarMoeda(quantidade * Number(item.valor_unitario))}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PedidoComprasPage() {
  const router = useRouter();

  // Estado: contratos
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [carregandoContratos, setCarregandoContratos] = useState(true);
  const [buscaContrato, setBuscaContrato] = useState('');
  const [contratoAberto, setContratoAberto] = useState(false);
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);

  // Estado: itens
  const [itensContrato, setItensContrato] = useState<ItemContrato[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');

  // Carrinho: map item_contrato_id → quantidade
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});

  // Dados do pedido
  const [setorSolicitante, setSetorSolicitante] = useState('');
  const [localEntrega, setLocalEntrega] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [prioridade, setPrioridade] = useState<'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE'>('NORMAL');
  const [dataNecessidade, setDataNecessidade] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Ações
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // ── Carregar contratos (apenas COMPRAS) ──────────────────────────────────

  useEffect(() => {
    const carregar = async () => {
      setCarregandoContratos(true);
      try {
        const res = await authFetch(`${API_URL}/api/contratos?limit=500`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const lista: Contrato[] = (data.data || data || []);
        const compras = lista.filter(
          (c) =>
            c.categoria === 'COMPRAS' &&
            (c.status === 'ATIVO' || c.status === 'VIGENTE' || c.status === 'LIBERADO')
        );
        setContratos(compras);
      } catch {
        setErro('Erro ao carregar contratos');
      } finally {
        setCarregandoContratos(false);
      }
    };
    carregar();
  }, []);

  // ── Carregar itens ao selecionar contrato ────────────────────────────────

  const selecionarContrato = async (contrato: Contrato) => {
    setContratoSelecionado(contrato);
    setContratoAberto(false);
    setBuscaContrato('');
    setCarrinho({});
    setBuscaItem('');
    setCarregandoItens(true);
    try {
      const res = await authFetch(
        `${API_URL}/api/almoxarifado/contratos/${contrato.id}/itens`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const itens: ItemContrato[] = (data.data || data || []).sort(
        (a: ItemContrato, b: ItemContrato) => a.numero_item - b.numero_item
      );
      setItensContrato(itens);
    } catch {
      setErro('Erro ao carregar itens do contrato');
    } finally {
      setCarregandoItens(false);
    }
  };

  // ── Filtros ──────────────────────────────────────────────────────────────

  const contratosFiltrados = useMemo(() => {
    if (!buscaContrato.trim()) return contratos;
    const q = buscaContrato.toLowerCase();
    return contratos.filter(
      (c) =>
        c.numero_contrato.toLowerCase().includes(q) ||
        c.objeto.toLowerCase().includes(q) ||
        getNomeFornecedor(c).toLowerCase().includes(q)
    );
  }, [contratos, buscaContrato]);

  const itensFiltrados = useMemo(() => {
    if (!buscaItem.trim()) return itensContrato;
    const q = buscaItem.toLowerCase();
    return itensContrato.filter(
      (i) =>
        i.descricao.toLowerCase().includes(q) ||
        String(i.numero_item).includes(q)
    );
  }, [itensContrato, buscaItem]);

  // ── Carrinho ─────────────────────────────────────────────────────────────

  const atualizarCarrinho = (itemId: string, quantidade: number) => {
    setCarrinho((prev) => {
      const novo = { ...prev };
      if (quantidade <= 0) {
        delete novo[itemId];
      } else {
        novo[itemId] = quantidade;
      }
      return novo;
    });
  };

  const itensCarrinho = useMemo(() => {
    return Object.entries(carrinho)
      .filter(([, qtd]) => qtd > 0)
      .map(([id, qtd]) => {
        const item = itensContrato.find((i) => i.id === id);
        if (!item) return null;
        return { item, quantidade: qtd, subtotal: qtd * Number(item.valor_unitario) };
      })
      .filter(Boolean) as { item: ItemContrato; quantidade: number; subtotal: number }[];
  }, [carrinho, itensContrato]);

  const totalPedido = useMemo(
    () => itensCarrinho.reduce((s, e) => s + e.subtotal, 0),
    [itensCarrinho]
  );

  // ── Validação ────────────────────────────────────────────────────────────

  const validar = (): string | null => {
    if (!contratoSelecionado) return 'Selecione um contrato.';
    if (itensCarrinho.length === 0) return 'Adicione pelo menos um item ao pedido.';
    if (!setorSolicitante.trim()) return 'Informe o setor solicitante.';
    if (!justificativa.trim() || justificativa.trim().length < 10)
      return 'A justificativa deve ter pelo menos 10 caracteres.';
    return null;
  };

  // ── Submissão ────────────────────────────────────────────────────────────

  const handleSalvar = async (enviarParaAutorizacao: boolean) => {
    const errValidacao = validar();
    if (errValidacao) {
      setErro(errValidacao);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      const payload = {
        contrato_id: contratoSelecionado!.id,
        tipo: 'MATERIAL',
        setor_solicitante: setorSolicitante.trim(),
        local_entrega: localEntrega.trim() || undefined,
        justificativa: justificativa.trim(),
        prioridade,
        data_necessidade: dataNecessidade || undefined,
        observacoes: observacoes.trim() || undefined,
        itens: itensCarrinho.map((e, idx) => ({
          item_contrato_id: e.item.id,
          numero_item: idx + 1,
          descricao: e.item.descricao,
          unidade_medida: e.item.unidade_medida,
          quantidade_solicitada: e.quantidade,
          valor_unitario: Number(e.item.valor_unitario),
        })),
      };

      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Erro ao criar pedido');
      }

      const requisicao = await res.json();

      if (enviarParaAutorizacao) {
        const resEnviar = await authFetch(
          `${API_URL}/api/almoxarifado/requisicoes/${requisicao.id}/enviar`,
          { method: 'POST' }
        );
        if (!resEnviar.ok) {
          alert('Pedido criado, mas ocorreu um erro ao enviar para autorização. Acesse a listagem para reenviar.');
        }
      }

      router.push('/orgao/almoxarifado/requisicoes');
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar pedido');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSalvando(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const diasRestantes = contratoSelecionado
    ? getDiasRestantes(contratoSelecionado.data_vigencia_fim)
    : 0;

  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <div className="min-h-screen bg-gray-50">
        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-4">
            <Link href="/orgao/almoxarifado/requisicoes">
              <Button variant="ghost" size="sm" className="gap-1.5 text-gray-600">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
              <h1 className="text-lg font-semibold text-gray-900">Novo Pedido de Compras</h1>
            </div>
          </div>
        </div>

        <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-4">
          {/* ── Alerta de erro ───────────────────────────────────────────── */}
          {erro && (
            <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{erro}</span>
              <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setErro('')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── Seletor de Contrato ──────────────────────────────────────── */}
          <div className="relative">
            <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Contrato de Compras
            </Label>

            {/* Dropdown trigger */}
            <button
              type="button"
              onClick={() => setContratoAberto((v) => !v)}
              className={`
                w-full flex items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left
                bg-white transition-all text-sm
                ${contratoAberto ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-300 hover:border-gray-400'}
                ${carregandoContratos ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}
              `}
              disabled={carregandoContratos}
            >
              {carregandoContratos ? (
                <span className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando contratos...
                </span>
              ) : contratoSelecionado ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="font-medium text-gray-900">
                    {contratoSelecionado.numero_contrato}
                  </span>
                  <span className="text-gray-500 truncate">
                    — {contratoSelecionado.objeto}
                  </span>
                </span>
              ) : (
                <span className="text-gray-400">Buscar e selecionar um contrato...</span>
              )}
              <ChevronDown
                className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${contratoAberto ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown */}
            {contratoAberto && (
              <div className="absolute z-40 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {/* Busca */}
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      autoFocus
                      placeholder="Buscar por número, objeto ou fornecedor..."
                      value={buscaContrato}
                      onChange={(e) => setBuscaContrato(e.target.value)}
                      className="pl-9 h-9 text-sm border-gray-200"
                    />
                  </div>
                </div>
                {/* Lista */}
                <div className="max-h-72 overflow-y-auto">
                  {contratosFiltrados.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">
                      Nenhum contrato de compras encontrado
                    </div>
                  ) : (
                    contratosFiltrados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selecionarContrato(c)}
                        className={`
                          w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0
                          ${contratoSelecionado?.id === c.id ? 'bg-blue-50' : ''}
                        `}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">
                              {c.numero_contrato}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{c.objeto}</p>
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <Building2 className="h-3 w-3" />
                              {getNomeFornecedor(c)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-medium text-green-700">
                              {formatarMoeda(getSaldoDisponivel(c))}
                            </p>
                            <p className="text-xs text-gray-400">saldo disponível</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Info bar do contrato selecionado ─────────────────────────── */}
          {contratoSelecionado && (
            <Card className="border-blue-200 bg-blue-50/40">
              <CardContent className="py-3 px-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Fornecedor</p>
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-1 mt-0.5">
                      <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      {getNomeFornecedor(contratoSelecionado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo Disponível</p>
                    <p className="text-sm font-bold text-green-700 flex items-center gap-1 mt-0.5">
                      <Wallet className="h-3.5 w-3.5 shrink-0" />
                      {formatarMoeda(getSaldoDisponivel(contratoSelecionado))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Vigência</p>
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      {formatarData(contratoSelecionado.data_vigencia_inicio)} a{' '}
                      {formatarData(contratoSelecionado.data_vigencia_fim)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Prazo Restante</p>
                    <p
                      className={`text-sm font-bold flex items-center gap-1 mt-0.5 ${diasRestantes > 30 ? 'text-blue-700' : diasRestantes > 0 ? 'text-amber-600' : 'text-red-600'}`}
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {diasRestantes > 0 ? `${diasRestantes} dias` : 'Vencido'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Layout principal: Catálogo + Carrinho ────────────────────── */}
          {contratoSelecionado && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* ── Catálogo de Itens (2/3) ─────────────────────────────── */}
              <div className="lg:col-span-2 space-y-3">
                {/* Header do catálogo */}
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    Itens do Contrato
                    {!carregandoItens && (
                      <span className="text-xs font-normal text-gray-400">
                        ({itensContrato.length} {itensContrato.length === 1 ? 'item' : 'itens'})
                      </span>
                    )}
                  </h2>
                  {itensCarrinho.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-red-500 underline"
                      onClick={() => setCarrinho({})}
                    >
                      Limpar seleção
                    </button>
                  )}
                </div>

                {/* Busca de itens */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar item por descrição ou número..."
                    value={buscaItem}
                    onChange={(e) => setBuscaItem(e.target.value)}
                    className="pl-9 bg-white"
                  />
                </div>

                {/* Loading */}
                {carregandoItens ? (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    Carregando itens...
                  </div>
                ) : itensFiltrados.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Package className="h-10 w-10 mb-2 text-gray-300" />
                    <p className="text-sm">Nenhum item encontrado</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {itensFiltrados.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        quantidade={carrinho[item.id] || 0}
                        onChangeQtd={(qtd) => atualizarCarrinho(item.id, qtd)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Painel do Pedido (1/3) — sticky ─────────────────────── */}
              <div className="space-y-4 lg:sticky lg:top-20">
                {/* Resumo do carrinho */}
                <Card className="shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                      Itens Selecionados
                      {itensCarrinho.length > 0 && (
                        <Badge className="ml-auto bg-blue-600 text-white text-xs">
                          {itensCarrinho.length}
                        </Badge>
                      )}
                    </h3>

                    {itensCarrinho.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        Nenhum item adicionado ainda
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {itensCarrinho.map(({ item, quantidade, subtotal }) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-700 line-clamp-1">
                                {item.descricao}
                              </p>
                              <p className="text-xs text-gray-400">
                                {quantidade} {item.unidade_medida} × {formatarMoeda(item.valor_unitario)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs font-bold text-blue-700">
                                {formatarMoeda(subtotal)}
                              </span>
                              <button
                                type="button"
                                onClick={() => atualizarCarrinho(item.id, 0)}
                                className="text-gray-300 hover:text-red-400 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-700">Total estimado</span>
                          <span className="text-base font-bold text-blue-700">
                            {formatarMoeda(totalPedido)}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Dados do pedido */}
                <Card className="shadow-sm">
                  <CardContent className="p-4 space-y-4">
                    <h3 className="font-semibold text-gray-800">Dados do Pedido</h3>

                    {/* Setor */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-1 block">
                        Setor Solicitante <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={setorSolicitante}
                        onChange={(e) => setSetorSolicitante(e.target.value)}
                        placeholder="Ex: Setor de TI, Administração..."
                        className="text-sm"
                      />
                    </div>

                    {/* Local de entrega */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-1 block">
                        Local de Entrega
                      </Label>
                      <Input
                        value={localEntrega}
                        onChange={(e) => setLocalEntrega(e.target.value)}
                        placeholder="Ex: Almoxarifado central, Sala 12..."
                        className="text-sm"
                      />
                    </div>

                    {/* Prioridade */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-1 block">
                        Prioridade
                      </Label>
                      <Select
                        value={prioridade}
                        onValueChange={(v) => setPrioridade(v as typeof prioridade)}
                      >
                        <SelectTrigger className="text-sm h-9">
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

                    {/* Data necessidade */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-1 block">
                        Data de Necessidade
                      </Label>
                      <Input
                        type="date"
                        value={dataNecessidade}
                        onChange={(e) => setDataNecessidade(e.target.value)}
                        className="text-sm h-9"
                      />
                    </div>

                    {/* Justificativa */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-1 block">
                        Justificativa <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        placeholder="Descreva o motivo do pedido..."
                        rows={3}
                        className="text-sm resize-none"
                      />
                      {justificativa.length > 0 && justificativa.length < 10 && (
                        <p className="text-xs text-amber-600 mt-1">Mínimo 10 caracteres</p>
                      )}
                    </div>

                    {/* Observações */}
                    <div>
                      <Label className="text-xs font-medium text-gray-600 mb-1 block">
                        Observações
                      </Label>
                      <Textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Informações adicionais (opcional)..."
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Botões de ação */}
                <div className="space-y-2">
                  <Button
                    className="w-full h-10"
                    onClick={() => handleSalvar(true)}
                    disabled={salvando || itensCarrinho.length === 0}
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
                    className="w-full h-10"
                    onClick={() => handleSalvar(false)}
                    disabled={salvando || itensCarrinho.length === 0}
                  >
                    {salvando ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Rascunho
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Estado inicial: nenhum contrato selecionado */}
          {!contratoSelecionado && !carregandoContratos && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <ShoppingCart className="h-14 w-14 mb-4 text-gray-200" />
              <p className="text-base font-medium text-gray-500">Selecione um contrato para começar</p>
              <p className="text-sm mt-1">
                {contratos.length === 0
                  ? 'Nenhum contrato de compras ativo encontrado'
                  : `${contratos.length} contrato${contratos.length > 1 ? 's' : ''} disponível${contratos.length > 1 ? 'eis' : ''}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </ModuleGuard>
  );
}
