'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ArrowRight,
  Check,
  Trash2, 
  Search,
  Loader2,
  Save,
  Send,
  Package,
  FileText,
  Building2,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  RotateCcw,
  Calendar,
  DollarSign,
  Filter,
  Clock,
  Wallet,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ModuleGuard } from '@/components/ModuleGuard';
import { ModuloSistema } from '@/hooks/useModulosOrgao';
import { API_URL, authFetch } from '@/lib/api';

// Chave para localStorage
const RASCUNHO_KEY = 'requisicao_rascunho';

interface Contrato {
  id: string;
  numero_contrato: string;
  objeto: string;
  tipo: string;
  categoria: string;
  valor_inicial: number;
  valor_global: number;
  saldo_total_em_valor?: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  // Compat: campos antigos mapeados
  data_inicio?: string;
  data_fim?: string;
  status: string;
  fornecedor_razao_social?: string;
  fornecedor_cnpj?: string;
  fornecedor?: {
    razao_social: string;
    cpf_cnpj?: string;
  };
  total_itens?: number;
  modalidade_execucao?: string;
}

const CATEGORIA_LABELS: Record<string, { label: string; cor: string }> = {
  COMPRAS: { label: 'Compras', cor: 'bg-blue-100 text-blue-800' },
  SERVICOS: { label: 'Serviços', cor: 'bg-purple-100 text-purple-800' },
  OBRAS: { label: 'Obras', cor: 'bg-orange-100 text-orange-800' },
  LOCACAO: { label: 'Locação', cor: 'bg-teal-100 text-teal-800' },
  OUTROS: { label: 'Outros', cor: 'bg-gray-100 text-gray-800' },
};

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

/** Item do cronograma (medição por itens) - usado em contratos MEDICAO/SERVICOS */
interface ItemCronograma {
  id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  valor_mensal?: number;
  valor_total: number;
  quantidade_medida: number;
  observacoes?: string;
}

interface Setor {
  id: string;
  codigo: string;
  nome: string;
}

interface RascunhoRequisicao {
  etapa: number;
  contratoId: string | null;
  itensRequisicao: ItemRequisicao[];
  tipo: string;
  setorSolicitante: string;
  codigoSetor: string;
  localEntrega: string;
  justificativa: string;
  prioridade: string;
  dataNecessidade: string;
  observacoes: string;
  savedAt: string;
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

// Componente de Input de Quantidade melhorado
function QuantidadeInput({ 
  value, 
  max, 
  onChange,
  disabled = false,
}: { 
  value: number; 
  max: number; 
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState(String(value));
  
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Permite campo vazio, ponto ou vírgula decimal
    if (val === '' || /^\d*([\.,]\d*)?$/.test(val)) {
      setInputValue(val);
    }
  };

  const handleBlur = () => {
    const valorNormalizado = inputValue.replace(',', '.');
    let numValue = parseFloat(valorNormalizado) || 0;
    // Garante mínimo > 0 e máximo = saldo
    numValue = Math.max(0.01, Math.min(numValue, max));
    setInputValue(String(numValue));
    onChange(numValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="w-24 text-center"
    />
  );
}

// Input de valor monetário para etapas (min=0, aceita decimais)
function ValorInput({
  value,
  max,
  onChange,
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState(String(value));
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) setInputValue(val);
  };
  const handleBlur = () => {
    let numValue = parseFloat(inputValue) || 0;
    numValue = Math.max(0, Math.min(numValue, max));
    setInputValue(String(numValue));
    onChange(numValue);
  };
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
      disabled={disabled}
      className="w-28 text-right"
    />
  );
}

function NovaRequisicaoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contratoIdUrl = searchParams.get('contrato');
  const tipoUrl = searchParams.get('tipo');
  const editarId = searchParams.get('editar');
  
  // Dados da OS carregada para edição (itens/etapas aplicados após cronograma carregar)
  const [requisicaoEdicao, setRequisicaoEdicao] = useState<{
    itensOS?: Array<{ item_cronograma_id: string; quantidade_solicitada: number }>;
    etapasOS?: Array<{ etapa_id: string; valor_solicitado?: number; percentual_solicitado?: number }>;
  } | null>(null);
  
  // Etapa atual (0 = Contrato, 1 = Itens, 2 = Dados, 3 = Resumo)
  const [etapa, setEtapa] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  
  // Modal de recuperação de rascunho
  const [showRecuperarRascunho, setShowRecuperarRascunho] = useState(false);
  const [rascunhoSalvo, setRascunhoSalvo] = useState<RascunhoRequisicao | null>(null);
  
  // Visualização de contratos (cards ou lista)
  const [visualizacaoContratos, setVisualizacaoContratos] = useState<'cards' | 'lista'>('cards');
  
  // Etapa 1: Contrato
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [buscaContrato, setBuscaContrato] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODOS');
  
  // Etapa 2: Itens
  const [itensContrato, setItensContrato] = useState<ItemContrato[]>([]);
  const [itensRequisicao, setItensRequisicao] = useState<ItemRequisicao[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');
  
  // Setores (para select)
  const [orgaoId, setOrgaoId] = useState<string | null>(null);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [setorId, setSetorId] = useState<string>('OUTRO'); // 'OUTRO' = digitação manual

  // Etapa 3: Dados da Requisição
  const [tipo, setTipo] = useState('MATERIAL');
  const [setorSolicitante, setSetorSolicitante] = useState('');
  const [codigoSetor, setCodigoSetor] = useState('');
  const [localEntrega, setLocalEntrega] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [prioridade, setPrioridade] = useState('NORMAL');
  const [dataNecessidade, setDataNecessidade] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Campos específicos de OS
  const [descricaoOS, setDescricaoOS] = useState('');
  const [localExecucao, setLocalExecucao] = useState('');
  const [dataInicioPrevista, setDataInicioPrevista] = useState('');
  const [dataFimPrevista, setDataFimPrevista] = useState('');
  const [prazoExecucaoDias, setPrazoExecucaoDias] = useState('');
  const [responsavelTecnico, setResponsavelTecnico] = useState('');
  const [fiscalNome, setFiscalNome] = useState('');

  // OS com ItemCronograma (medição por itens): Ordem Global vs Ordem por Demanda
  const [itensCronograma, setItensCronograma] = useState<ItemCronograma[]>([]);
  const [etapasOS, setEtapasOS] = useState<any[]>([]);
  const [carregandoCronograma, setCarregandoCronograma] = useState(false);
  const [modoOS, setModoOS] = useState<'ORDEM_GLOBAL' | 'ORDEM_DEMANDA' | null>(null);
  const [itensOSDemanda, setItensOSDemanda] = useState<{ item_cronograma_id: string; quantidade_solicitada: number }[]>([]);
  const [etapasOSDemanda, setEtapasOSDemanda] = useState<{ etapa_id: string; percentual_solicitado?: number; valor_solicitado?: number }[]>([]);

  // Ref para controlar auto-save
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const [ultimoSalvamento, setUltimoSalvamento] = useState<Date | null>(null);

  const isOS = tipo === 'ORDEM_SERVICO';
  const usarItensCronograma = isOS && itensCronograma.length > 0;
  const usarEtapasCronograma = isOS && etapasOS.length > 0 && itensCronograma.length === 0;
  const STEPS = isOS ? ['Contrato', 'Dados da OS', 'Resumo'] : ['Contrato', 'Itens', 'Dados', 'Resumo'];

  const handleSetorChange = (value: string) => {
    setSetorId(value);
    if (value === 'OUTRO') {
      // Mantém valores atuais ou limpa
      if (!setorSolicitante && !codigoSetor) {
        setSetorSolicitante('');
        setCodigoSetor('');
      }
    } else {
      const s = setores.find((x) => x.id === value);
      if (s) {
        setSetorSolicitante(s.nome);
        setCodigoSetor(s.codigo);
      }
    }
  };

  const renderSetorFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {setores.length > 0 ? (
        <>
          <div className="md:col-span-2">
            <Label>Setor Solicitante *</Label>
            <Select value={setorId} onValueChange={handleSetorChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.codigo} — {s.nome}
                  </SelectItem>
                ))}
                <SelectItem value="OUTRO">Outro (digitar manualmente)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {setorId === 'OUTRO' && (
            <>
              <div>
                <Label>Nome do Setor *</Label>
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
            </>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );

  // =========================================================================
  // AUTO-SAVE LOCAL
  // =========================================================================

  const salvarRascunhoLocal = useCallback(() => {
    // Só salva se tiver itens selecionados OU dados preenchidos
    // Não salva apenas por selecionar contrato (é muito rápido refazer)
    const temItens = itensRequisicao.length > 0;
    const temDados = setorSolicitante.trim() || justificativa.trim();
    
    if (!temItens && !temDados) {
      return; // Não salva se só selecionou contrato
    }

    const rascunho: RascunhoRequisicao = {
      etapa,
      contratoId: contratoSelecionado?.id || null,
      itensRequisicao,
      tipo,
      setorSolicitante,
      codigoSetor,
      localEntrega,
      justificativa,
      prioridade,
      dataNecessidade,
      observacoes,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(RASCUNHO_KEY, JSON.stringify(rascunho));
    setUltimoSalvamento(new Date());
  }, [etapa, contratoSelecionado, itensRequisicao, tipo, setorSolicitante, codigoSetor, localEntrega, justificativa, prioridade, dataNecessidade, observacoes]);

  const limparRascunhoLocal = () => {
    localStorage.removeItem(RASCUNHO_KEY);
    setUltimoSalvamento(null);
  };

  const carregarRascunhoLocal = (): RascunhoRequisicao | null => {
    const saved = localStorage.getItem(RASCUNHO_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  };

  const aplicarRascunho = (rascunho: RascunhoRequisicao) => {
    setEtapa(rascunho.etapa);
    setItensRequisicao(rascunho.itensRequisicao);
    setTipo(rascunho.tipo);
    setSetorSolicitante(rascunho.setorSolicitante);
    setCodigoSetor(rascunho.codigoSetor);
    setLocalEntrega(rascunho.localEntrega);
    setJustificativa(rascunho.justificativa);
    setPrioridade(rascunho.prioridade);
    setDataNecessidade(rascunho.dataNecessidade);
    setObservacoes(rascunho.observacoes);
    setShowRecuperarRascunho(false);
  };

  // Auto-save com debounce
  useEffect(() => {
    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current);
    }

    autoSaveTimeout.current = setTimeout(() => {
      salvarRascunhoLocal();
    }, 2000); // Salva após 2 segundos de inatividade

    return () => {
      if (autoSaveTimeout.current) {
        clearTimeout(autoSaveTimeout.current);
      }
    };
  }, [salvarRascunhoLocal]);

  // Verificar rascunho ao carregar (não mostrar se estiver editando)
  useEffect(() => {
    const rascunho = carregarRascunhoLocal();
    if (rascunho && !contratoIdUrl && !editarId) {
      setRascunhoSalvo(rascunho);
      setShowRecuperarRascunho(true);
    }
  }, [contratoIdUrl, editarId]);

  // =========================================================================
  // CARREGAR DADOS
  // =========================================================================

  useEffect(() => {
    carregarContratos();
  }, []);

  // Carregar orgao e setores
  useEffect(() => {
    const init = async () => {
      const orgaoStr = localStorage.getItem('orgao');
      const usuarioStr = localStorage.getItem('usuario');
      let id: string | null = null;
      if (orgaoStr) {
        const orgao = JSON.parse(orgaoStr);
        id = orgao?.id || null;
      } else if (usuarioStr) {
        const usuario = JSON.parse(usuarioStr);
        id = usuario?.orgao_id || null;
      }
      if (!id) {
        const res = await authFetch(`${API_URL}/api/orgaos/me`);
        if (res.ok) {
          const orgao = await res.json();
          id = orgao?.id || null;
        }
      }
      setOrgaoId(id);
      if (id) {
        const res = await authFetch(`${API_URL}/api/orgaos/${id}/setores`);
        if (res.ok) setSetores(await res.json());
      }
    };
    init();
  }, []);

  // Sincronizar setorId quando setorSolicitante/codigoSetor mudam (rascunho, edição)
  useEffect(() => {
    if (setores.length === 0) return;
    const match = setores.find(
      (s) => s.codigo === codigoSetor || (s.nome === setorSolicitante && setorSolicitante)
    );
    if (match && (setorSolicitante || codigoSetor)) {
      setSetorId(match.id);
    } else if (setorSolicitante || codigoSetor) {
      setSetorId('OUTRO');
    }
  }, [setores, setorSolicitante, codigoSetor]);

  // Carregar OS para edição (rascunho)
  useEffect(() => {
    if (!editarId || contratos.length === 0) return;
    setLoading(true);
    const carregarParaEdicao = async () => {
      try {
        const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${editarId}`);
        if (!res.ok) {
          alert('Requisição não encontrada ou sem permissão.');
          router.push('/orgao/almoxarifado/requisicoes');
          return;
        }
        const req = await res.json();
        if (req.status !== 'RASCUNHO' || req.tipo !== 'ORDEM_SERVICO') {
          alert('Apenas OS em rascunho podem ser editadas.');
          router.push('/orgao/almoxarifado/requisicoes');
          return;
        }
        const contrato = req.contrato;
        if (!contrato) {
          alert('Contrato da OS não encontrado.');
          router.push('/orgao/almoxarifado/requisicoes');
          return;
        }
        setContratoSelecionado(contrato);
        setTipo('ORDEM_SERVICO');
        setSetorSolicitante(req.setor_solicitante || '');
        setCodigoSetor(req.codigo_setor || '');
        setLocalEntrega(req.local_entrega || '');
        setJustificativa(req.justificativa || '');
        setPrioridade(req.prioridade || 'NORMAL');
        setDataNecessidade(req.data_necessidade ? req.data_necessidade.split('T')[0] : '');
        setObservacoes(req.observacoes || '');
        setDescricaoOS(req.descricao_os || '');
        setLocalExecucao(req.local_execucao || '');
        setDataInicioPrevista(req.data_inicio_prevista ? req.data_inicio_prevista.split('T')[0] : '');
        setDataFimPrevista(req.data_fim_prevista ? req.data_fim_prevista.split('T')[0] : '');
        setPrazoExecucaoDias(req.prazo_execucao_dias ? String(req.prazo_execucao_dias) : '');
        setResponsavelTecnico(req.responsavel_tecnico || '');
        setFiscalNome(req.fiscal_contrato_nome || '');
        setModoOS(req.modo_os || 'ORDEM_GLOBAL');
        if (req.itensOS?.length) {
          setRequisicaoEdicao({
            itensOS: req.itensOS.map((io: any) => ({
              item_cronograma_id: io.item_cronograma_id || io.itemCronograma?.id,
              quantidade_solicitada: Number(io.quantidade_solicitada || 0),
            })),
          });
        } else if (req.etapasOS?.length) {
          setRequisicaoEdicao({
            etapasOS: req.etapasOS.map((eo: any) => ({
              etapa_id: eo.etapa_id || eo.etapa?.id,
              valor_solicitado: Number(eo.valor_solicitado || 0),
              percentual_solicitado: Number(eo.percentual_solicitado || 0),
            })),
          });
        }
        setEtapa(1);
        limparRascunhoLocal();
      } catch (e) {
        console.error('Erro ao carregar OS para edição:', e);
        alert('Erro ao carregar OS para edição.');
        router.push('/orgao/almoxarifado/requisicoes');
      } finally {
        setLoading(false);
      }
    };
    carregarParaEdicao();
  }, [editarId, contratos.length]);

  // Aplicar itens/etapas da OS carregada para edição após cronograma estar pronto
  useEffect(() => {
    if (!requisicaoEdicao || carregandoCronograma) return;
    if (requisicaoEdicao.itensOS?.length) {
      setItensOSDemanda(prev => {
        const byId = new Map(requisicaoEdicao.itensOS!.map(i => [i.item_cronograma_id, i.quantidade_solicitada]));
        return prev.map(p => ({
          ...p,
          quantidade_solicitada: byId.get(p.item_cronograma_id) ?? p.quantidade_solicitada,
        }));
      });
    }
    if (requisicaoEdicao.etapasOS?.length) {
      setEtapasOSDemanda(prev => {
        const byId = new Map(requisicaoEdicao.etapasOS!.map(e => [e.etapa_id, e.valor_solicitado ?? 0]));
        return prev.map(p => ({
          ...p,
          valor_solicitado: byId.get(p.etapa_id) ?? p.valor_solicitado,
        }));
      });
    }
    setRequisicaoEdicao(null);
  }, [requisicaoEdicao, carregandoCronograma]);

  // Se veio com contrato na URL, pula para etapa 2
  useEffect(() => {
    if (contratoIdUrl && contratos.length > 0) {
      const contrato = contratos.find(c => c.id === contratoIdUrl);
      if (contrato) {
        setContratoSelecionado(contrato);
        // Tipo da URL tem prioridade; senão deriva da modalidade/categoria
        if (tipoUrl === 'ORDEM_SERVICO' || tipoUrl === 'MATERIAL' || tipoUrl === 'SERVICO') {
          setTipo(tipoUrl);
        } else if (contrato.modalidade_execucao === 'MEDICAO' || contrato.modalidade_execucao === 'ORDEM_SERVICO' || contrato.categoria === 'OBRAS') {
          setTipo('ORDEM_SERVICO');
        } else if (contrato.categoria === 'SERVICOS') {
          setTipo('SERVICO');
        } else if (contrato.categoria === 'COMPRAS') {
          setTipo('MATERIAL');
        }
        setEtapa(1);
        limparRascunhoLocal(); // Limpa rascunho se veio da URL
      }
    }
  }, [contratoIdUrl, tipoUrl, contratos]);

  // Carrega itens quando seleciona contrato
  useEffect(() => {
    if (contratoSelecionado) {
      carregarItensContrato();
    }
  }, [contratoSelecionado]);

  // Carrega itens-cronograma e etapas quando OS + contrato selecionado (para detectar medição por itens vs obras)
  useEffect(() => {
    if (!contratoSelecionado || tipo !== 'ORDEM_SERVICO') {
      setItensCronograma([]);
      setEtapasOS([]);
      setModoOS(null);
      setItensOSDemanda([]);
      return;
    }
    const carregarCronograma = async () => {
      setCarregandoCronograma(true);
      try {
        const [resItens, resEtapas] = await Promise.all([
          authFetch(`${API_URL}/api/contratos/${contratoSelecionado.id}/itens-cronograma`),
          authFetch(`${API_URL}/api/contratos/${contratoSelecionado.id}/etapas`),
        ]);
        const itens: ItemCronograma[] = resItens.ok ? await resItens.json() : [];
        const etapas: any[] = resEtapas.ok ? await resEtapas.json() : [];
        setItensCronograma(itens);
        setEtapasOS(etapas);
        if (itens.length > 0) {
          setModoOS('ORDEM_GLOBAL');
          setItensOSDemanda(itens.map(i => ({
            item_cronograma_id: i.id,
            quantidade_solicitada: Number(i.quantidade) - Number(i.quantidade_medida),
          })));
          setEtapasOSDemanda([]);
        } else if (etapas.length > 0) {
          setModoOS('ORDEM_GLOBAL');
          setEtapasOSDemanda(etapas.map((e: any) => ({
            etapa_id: e.id,
            valor_solicitado: Number(e.valor_previsto || 0) - Number(e.valor_executado || 0),
          })));
        } else {
          setModoOS(null);
          setItensOSDemanda([]);
          setEtapasOSDemanda([]);
        }
      } catch (e) {
        console.error('Erro ao carregar cronograma:', e);
        setItensCronograma([]);
        setEtapasOS([]);
        setModoOS(null);
        setItensOSDemanda([]);
        setEtapasOSDemanda([]);
      } finally {
        setCarregandoCronograma(false);
      }
    };
    carregarCronograma();
  }, [contratoSelecionado?.id, tipo]);

  // Preencher descricaoOS com objeto do contrato sempre que for OS e tiver contrato selecionado
  useEffect(() => {
    if (isOS && contratoSelecionado?.objeto && !descricaoOS) {
      setDescricaoOS(contratoSelecionado.objeto);
    }
  }, [isOS, contratoSelecionado?.objeto]);

  // Aplicar contrato do rascunho após carregar contratos
  useEffect(() => {
    if (rascunhoSalvo?.contratoId && contratos.length > 0 && !showRecuperarRascunho) {
      const contrato = contratos.find(c => c.id === rascunhoSalvo.contratoId);
      if (contrato) {
        setContratoSelecionado(contrato);
      }
    }
  }, [rascunhoSalvo, contratos, showRecuperarRascunho]);

  const carregarContratos = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/contratos?limit=500`);
      if (response.ok) {
        const json = await response.json();
        const lista: Contrato[] = Array.isArray(json) ? json : (json.data || []);
        // Filtra contratos ativos
        const contratosAtivos = lista.filter((c: Contrato) => 
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

  // =========================================================================
  // HELPERS
  // =========================================================================

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

  const formatarDataHora = (data: string) => {
    if (!data) return '-';
    return new Date(data).toLocaleString('pt-BR');
  };

  // Filtrar contratos
  const contratosFiltrados = contratos.filter(c => {
    // Filtro por categoria
    if (filtroCategoria !== 'TODOS' && c.categoria !== filtroCategoria) return false;
    // Filtro por busca
    if (buscaContrato) {
      const busca = buscaContrato.toLowerCase();
      const matchNumero = c.numero_contrato?.toLowerCase().includes(busca);
      const matchObjeto = c.objeto?.toLowerCase().includes(busca);
      const matchFornecedor = (c.fornecedor?.razao_social || c.fornecedor_razao_social || '').toLowerCase().includes(busca);
      if (!matchNumero && !matchObjeto && !matchFornecedor) return false;
    }
    return true;
  });

  // Helper: nome do fornecedor
  const getNomeFornecedor = (c: Contrato) => c.fornecedor?.razao_social || c.fornecedor_razao_social || 'Não informado';

  // Helper: vigência formatada
  const getVigencia = (c: Contrato) => ({
    inicio: c.data_vigencia_inicio || c.data_inicio || '',
    fim: c.data_vigencia_fim || c.data_fim || '',
  });

  // Helper: saldo do contrato
  const getSaldo = (c: Contrato) => c.saldo_total_em_valor ?? c.valor_global ?? c.valor_inicial ?? 0;

  // Helper: percentual consumido
  const getPercentualConsumido = (c: Contrato) => {
    const valorTotal = Number(c.valor_global || c.valor_inicial || 0);
    const saldo = Number(getSaldo(c));
    if (valorTotal <= 0) return 0;
    return Math.max(0, Math.min(100, ((valorTotal - saldo) / valorTotal) * 100));
  };

  // Helper: dias restantes de vigência
  const getDiasRestantes = (c: Contrato) => {
    const fim = getVigencia(c).fim;
    if (!fim) return null;
    const diff = new Date(fim).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Filtrar itens
  const itensFiltrados = itensContrato.filter(i =>
    i.descricao.toLowerCase().includes(buscaItem.toLowerCase()) ||
    String(i.numero_item).includes(buscaItem)
  );

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleSelecionarContrato = (contrato: Contrato) => {
    setContratoSelecionado(contrato);
    setItensRequisicao([]); // Limpa itens ao mudar contrato
    // Auto-preencher tipo baseado na modalidade/categoria do contrato
    // Contratos de MEDICAO (obras/serviços por medição) usam fluxo de OS
    if (contrato.modalidade_execucao === 'MEDICAO' || contrato.categoria === 'OBRAS') {
      setTipo('ORDEM_SERVICO');
    } else if (contrato.categoria === 'SERVICOS') {
      setTipo('SERVICO');
    } else if (contrato.categoria === 'COMPRAS') {
      setTipo('MATERIAL');
    }
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
        const qtd = Math.max(0.01, Math.min(quantidade, item.saldo_disponivel));
        return {
          ...item,
          quantidade_solicitada: qtd,
          valor_total: qtd * item.valor_unitario,
        };
      }
      return item;
    }));
  };

  const handleSolicitarTodosItens = () => {
    const itensDisponiveis = itensFiltrados.filter(item => Number(item.saldo_disponivel) > 0);

    setItensRequisicao(itensDisponiveis.map(item => ({
      item_contrato_id: item.id,
      numero_item: item.numero_item,
      descricao: item.descricao,
      unidade_medida: item.unidade_medida,
      quantidade_solicitada: Number(item.saldo_disponivel),
      valor_unitario: Number(item.valor_unitario),
      valor_total: Number(item.saldo_disponivel) * Number(item.valor_unitario),
      saldo_disponivel: Number(item.saldo_disponivel),
    })));
  };

  const handleLimparSelecaoItens = () => {
    setItensRequisicao([]);
  };

  const handleAlterarQuantidadeOSDemanda = (itemCronogramaId: string, quantidade: number) => {
    setItensOSDemanda(prev => prev.map(item => {
      if (item.item_cronograma_id === itemCronogramaId) {
        const itemCron = itensCronograma.find(i => i.id === itemCronogramaId);
        const saldo = itemCron ? Number(itemCron.quantidade) - Number(itemCron.quantidade_medida) : 0;
        const qtd = Math.max(0, Math.min(quantidade, saldo));
        return { ...item, quantidade_solicitada: qtd };
      }
      return item;
    }));
  };

  const handleAlterarValorEtapaOSDemanda = (etapaId: string, valor: number) => {
    setEtapasOSDemanda(prev => prev.map(item => {
      if (item.etapa_id === etapaId) {
        const etapa = etapasOS.find((e: any) => e.id === etapaId);
        const saldo = etapa ? Number(etapa.valor_previsto || 0) - Number(etapa.valor_executado || 0) : 0;
        const v = Math.max(0, Math.min(valor, saldo));
        return { ...item, valor_solicitado: v };
      }
      return item;
    }));
  };

  const calcularTotal = () => {
    return itensRequisicao.reduce((total, item) => total + item.valor_total, 0);
  };

  const validarEtapa = (): string | null => {
    if (isOS) {
      // Fluxo OS: Etapa 0 = Contrato, Etapa 1 = Dados OS, Etapa 2 = Resumo
      switch (etapa) {
        case 0:
          if (!contratoSelecionado) return 'Selecione um contrato';
          break;
        case 1:
          if (!setorSolicitante.trim()) return 'Informe o setor solicitante';
          if (!justificativa.trim()) return 'Informe a justificativa';
          if (usarItensCronograma) {
            if (!modoOS) return 'Selecione o tipo de ordem (Global ou por Demanda)';
            if (modoOS === 'ORDEM_DEMANDA') {
              const temAlgum = itensOSDemanda.some(d => d.quantidade_solicitada > 0);
              if (!temAlgum) return 'Informe a quantidade de pelo menos um item na Ordem por Demanda';
            }
          } else if (usarEtapasCronograma) {
            if (!modoOS) return 'Selecione o tipo de ordem (Global ou por Demanda)';
            if (modoOS === 'ORDEM_DEMANDA') {
              const temAlgum = etapasOSDemanda.some(d => (d.valor_solicitado ?? 0) > 0);
              if (!temAlgum) return 'Informe o valor de pelo menos uma etapa na Ordem por Demanda';
            }
          } else {
            if (!descricaoOS.trim()) return 'Informe a descrição/objeto da OS';
          }
          break;
      }
    } else {
      // Fluxo normal: Etapa 0 = Contrato, Etapa 1 = Itens, Etapa 2 = Dados, Etapa 3 = Resumo
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
    }
    return null;
  };

  const handleProximaEtapa = () => {
    const erro = validarEtapa();
    if (erro) {
      alert(erro);
      return;
    }
    setEtapa(prev => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleEtapaAnterior = () => {
    setEtapa(prev => Math.max(prev - 1, 0));
  };

  const handleSalvar = async (enviarParaAutorizacao: boolean = false) => {
    setSalvando(true);
    try {
      const dados: any = {
        contrato_id: contratoSelecionado?.id,
        tipo,
        setor_solicitante: setorSolicitante,
        codigo_setor: codigoSetor || undefined,
        local_entrega: localEntrega || undefined,
        justificativa,
        prioridade,
        data_necessidade: dataNecessidade || undefined,
        observacoes: observacoes || undefined,
      };

      if (isOS) {
        // Campos específicos de OS
        if (usarItensCronograma && modoOS) {
          dados.modo_os = modoOS;
          dados.itens_os = modoOS === 'ORDEM_GLOBAL'
            ? itensCronograma.map(i => ({
                item_cronograma_id: i.id,
                quantidade_solicitada: Number(i.quantidade) - Number(i.quantidade_medida),
              }))
            : itensOSDemanda.filter(d => d.quantidade_solicitada > 0).map(d => ({
                item_cronograma_id: d.item_cronograma_id,
                quantidade_solicitada: d.quantidade_solicitada,
              }));
          dados.descricao_os = modoOS === 'ORDEM_GLOBAL'
            ? 'Ordem Global - todos os itens do cronograma'
            : 'Ordem por Demanda - itens selecionados';
        } else if (usarEtapasCronograma && modoOS) {
          dados.modo_os = modoOS;
          dados.etapas_os = modoOS === 'ORDEM_GLOBAL'
            ? etapasOS.map((e: any) => ({
                etapa_id: e.id,
                valor_solicitado: Number(e.valor_previsto || 0) - Number(e.valor_executado || 0),
              }))
            : etapasOSDemanda.filter(d => (d.valor_solicitado ?? 0) > 0).map(d => ({
                etapa_id: d.etapa_id,
                valor_solicitado: d.valor_solicitado ?? 0,
              }));
          dados.descricao_os = descricaoOS || contratoSelecionado?.objeto || (modoOS === 'ORDEM_GLOBAL' ? 'Ordem Global - todas as etapas' : 'Ordem por Demanda - etapas selecionadas');
        } else {
          dados.descricao_os = descricaoOS;
          dados.local_execucao = localExecucao || undefined;
          dados.data_inicio_prevista = dataInicioPrevista || undefined;
          dados.data_fim_prevista = dataFimPrevista || undefined;
          dados.prazo_execucao_dias = prazoExecucaoDias ? parseInt(prazoExecucaoDias) : undefined;
          dados.responsavel_tecnico = responsavelTecnico || undefined;
          dados.fiscal_contrato_nome = fiscalNome || undefined;
        }
      } else {
        // Itens da requisição normal
        dados.itens = itensRequisicao.map((item, index) => ({
          item_contrato_id: item.item_contrato_id,
          numero_item: index + 1,
          descricao: item.descricao,
          unidade_medida: item.unidade_medida,
          quantidade_solicitada: Number(item.quantidade_solicitada),
          valor_unitario: Number(item.valor_unitario),
        }));
      }

      const isEdicao = !!editarId;
      const url = isEdicao
        ? `${API_URL}/api/almoxarifado/requisicoes/${editarId}`
        : `${API_URL}/api/almoxarifado/requisicoes`;
      const response = await authFetch(url, {
        method: isEdicao ? 'PUT' : 'POST',
        body: JSON.stringify(isEdicao ? { ...dados, contrato_id: undefined, tipo: undefined } : dados),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || (isEdicao ? 'Erro ao atualizar requisição' : 'Erro ao criar requisição'));
      }

      const requisicao = await response.json();
      const reqId = requisicao.id || editarId;

      // Limpa rascunho local após salvar com sucesso
      limparRascunhoLocal();

      if (enviarParaAutorizacao) {
        const responseEnviar = await authFetch(
          `${API_URL}/api/almoxarifado/requisicoes/${reqId}/enviar`,
          { method: 'POST' }
        );

        if (!responseEnviar.ok) {
          alert(isOS ? 'OS criada, mas erro ao enviar para autorização.' : 'Requisição criada, mas erro ao enviar para autorização.');
        } else {
          alert(isOS 
            ? '✅ Ordem de Serviço criada e enviada para autorização!' 
            : '✅ Requisição criada e enviada para autorização!\n\nSaldo reservado no contrato.');
        }
      } else {
        alert(isOS 
          ? '✅ Ordem de Serviço salva como rascunho!' 
          : '✅ Requisição salva como rascunho!\n\nSaldo reservado no contrato.');
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Selecione o Contrato
              </CardTitle>
              <CardDescription>
                Escolha o contrato de onde serão solicitados os itens
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <Button
                variant={visualizacaoContratos === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setVisualizacaoContratos('cards')}
                title="Visualização em cards"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={visualizacaoContratos === 'lista' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setVisualizacaoContratos('lista')}
                title="Visualização em lista"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Busca + Filtros */}
          <div className="space-y-3 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por número, objeto ou fornecedor..."
                value={buscaContrato}
                onChange={(e) => setBuscaContrato(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filtro por Categoria */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-gray-400" />
              {[
                { key: 'TODOS', label: 'Todos' },
                { key: 'COMPRAS', label: 'Compras' },
                { key: 'SERVICOS', label: 'Serviços' },
                { key: 'OBRAS', label: 'Obras' },
                { key: 'LOCACAO', label: 'Locação' },
              ].map(cat => (
                <Button
                  key={cat.key}
                  variant={filtroCategoria === cat.key ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFiltroCategoria(cat.key)}
                >
                  {cat.label}
                  {cat.key !== 'TODOS' && (
                    <span className="ml-1 opacity-70">
                      ({contratos.filter(c => c.categoria === cat.key).length})
                    </span>
                  )}
                </Button>
              ))}
            </div>
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
          ) : visualizacaoContratos === 'cards' ? (
            // VISUALIZAÇÃO EM CARDS
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1">
              {contratosFiltrados.map((contrato) => {
                const vigencia = getVigencia(contrato);
                const saldo = getSaldo(contrato);
                const percentual = getPercentualConsumido(contrato);
                const diasRestantes = getDiasRestantes(contrato);
                const catInfo = CATEGORIA_LABELS[contrato.categoria] || CATEGORIA_LABELS.OUTROS;

                return (
                  <Card
                    key={contrato.id}
                    className={`
                      cursor-pointer transition-all hover:shadow-md
                      ${contratoSelecionado?.id === contrato.id 
                        ? 'ring-2 ring-blue-500 bg-blue-50/50' 
                        : 'hover:bg-gray-50'
                      }
                    `}
                    onClick={() => handleSelecionarContrato(contrato)}
                  >
                    <CardContent className="p-4">
                      {/* Header: Número + Categoria + Check */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono text-xs">
                            {contrato.numero_contrato}
                          </Badge>
                          <Badge className={`${catInfo.cor} text-xs`}>
                            {catInfo.label}
                          </Badge>
                        </div>
                        {contratoSelecionado?.id === contrato.id && (
                          <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
                        )}
                      </div>

                      {/* Objeto */}
                      <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                        {contrato.objeto || 'Sem objeto definido'}
                      </p>

                      {/* Fornecedor */}
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate font-medium">{getNomeFornecedor(contrato)}</span>
                      </div>

                      {/* Valores: Inicial + Saldo */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-gray-50 rounded-md p-2">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor Global</p>
                          <p className="text-sm font-bold text-gray-800">
                            {formatarMoeda(contrato.valor_global || contrato.valor_inicial)}
                          </p>
                        </div>
                        <div className="bg-green-50 rounded-md p-2">
                          <p className="text-[10px] text-green-600 uppercase tracking-wide">Saldo Disponível</p>
                          <p className="text-sm font-bold text-green-700">
                            {formatarMoeda(saldo)}
                          </p>
                        </div>
                      </div>

                      {/* Barra de consumo */}
                      <div className="mb-3">
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                          <span>Consumido</span>
                          <span>{percentual.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              percentual > 90 ? 'bg-red-500' : percentual > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${percentual}%` }}
                          />
                        </div>
                      </div>

                      {/* Vigência + Dias restantes */}
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatarData(vigencia.inicio)} a {formatarData(vigencia.fim)}</span>
                        </div>
                        {diasRestantes !== null && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              diasRestantes <= 30 ? 'border-red-300 text-red-600' :
                              diasRestantes <= 90 ? 'border-yellow-300 text-yellow-700' :
                              'border-green-300 text-green-600'
                            }`}
                          >
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {diasRestantes > 0 ? `${diasRestantes}d restantes` : 'Vencido'}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            // VISUALIZAÇÃO EM LISTA (TABELA)
            <div className="max-h-[600px] overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="max-w-[200px]">Objeto</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Vigência</TableHead>
                    <TableHead className="text-right">Valor Global</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.map((contrato) => {
                    const vigencia = getVigencia(contrato);
                    const saldo = getSaldo(contrato);
                    const diasRestantes = getDiasRestantes(contrato);
                    const catInfo = CATEGORIA_LABELS[contrato.categoria] || CATEGORIA_LABELS.OUTROS;

                    return (
                      <TableRow
                        key={contrato.id}
                        className={`cursor-pointer ${
                          contratoSelecionado?.id === contrato.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleSelecionarContrato(contrato)}
                      >
                        <TableCell>
                          <input
                            type="radio"
                            checked={contratoSelecionado?.id === contrato.id}
                            onChange={() => handleSelecionarContrato(contrato)}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {contrato.numero_contrato}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${catInfo.cor} text-xs`}>{catInfo.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="line-clamp-2 text-sm">{contrato.objeto || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{getNomeFornecedor(contrato)}</span>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                          <div>{formatarData(vigencia.inicio)} - {formatarData(vigencia.fim)}</div>
                          {diasRestantes !== null && diasRestantes <= 90 && (
                            <span className={`text-[10px] ${diasRestantes <= 30 ? 'text-red-500' : 'text-yellow-600'}`}>
                              {diasRestantes > 0 ? `${diasRestantes}d restantes` : 'Vencido'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-700 whitespace-nowrap">
                          {formatarMoeda(contrato.valor_global || contrato.valor_inicial)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600 whitespace-nowrap">
                          {formatarMoeda(saldo)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Info de quantidade */}
          <div className="mt-4 text-sm text-gray-500 text-center">
            {contratosFiltrados.length} contrato(s) encontrado(s)
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderEtapa1Itens = () => {
    const vigenciaContrato = contratoSelecionado ? getVigencia(contratoSelecionado) : { inicio: '', fim: '' };
    const saldoContrato = contratoSelecionado ? getSaldo(contratoSelecionado) : 0;
    const diasRestantesContrato = contratoSelecionado ? getDiasRestantes(contratoSelecionado) : null;

    return (
    <div className="space-y-6">
      {/* Card do contrato selecionado - expandido */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">
                {contratoSelecionado?.numero_contrato}
              </Badge>
              {contratoSelecionado?.categoria && (
                <Badge className={`${(CATEGORIA_LABELS[contratoSelecionado.categoria] || CATEGORIA_LABELS.OUTROS).cor} text-xs`}>
                  {(CATEGORIA_LABELS[contratoSelecionado.categoria] || CATEGORIA_LABELS.OUTROS).label}
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEtapa(0)}>
              Trocar Contrato
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-700 mb-3">
            <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
            <span className="font-medium">{contratoSelecionado ? getNomeFornecedor(contratoSelecionado) : '-'}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/70 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor Global</p>
              <p className="text-sm font-bold text-gray-800">
                {formatarMoeda(contratoSelecionado?.valor_global || contratoSelecionado?.valor_inicial || 0)}
              </p>
            </div>
            <div className="bg-white/70 rounded-lg p-2.5">
              <p className="text-[10px] text-green-600 uppercase tracking-wide">Saldo Disponível</p>
              <p className="text-sm font-bold text-green-700">{formatarMoeda(saldoContrato)}</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Vigência</p>
              <p className="text-xs font-medium text-gray-700">
                {formatarData(vigenciaContrato.inicio)} a {formatarData(vigenciaContrato.fim)}
              </p>
            </div>
            <div className="bg-white/70 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Prazo</p>
              <p className={`text-sm font-bold ${
                diasRestantesContrato !== null && diasRestantesContrato <= 30 ? 'text-red-600' :
                diasRestantesContrato !== null && diasRestantesContrato <= 90 ? 'text-yellow-600' :
                'text-gray-700'
              }`}>
                {diasRestantesContrato !== null
                  ? diasRestantesContrato > 0 ? `${diasRestantesContrato} dias` : 'Vencido'
                  : '-'}
              </p>
            </div>
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
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar item..."
                value={buscaItem}
                onChange={(e) => setBuscaItem(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleLimparSelecaoItens}
                disabled={itensRequisicao.length === 0}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Limpar seleção
              </Button>
              <Button
                type="button"
                onClick={handleSolicitarTodosItens}
                disabled={itensFiltrados.filter(item => Number(item.saldo_disponivel) > 0).length === 0}
              >
                <Package className="h-4 w-4 mr-2" />
                Pedir tudo de vez
              </Button>
            </div>
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
                          <span className="whitespace-normal break-words text-sm">{item.descricao}</span>
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
                            <QuantidadeInput
                              value={itemReq?.quantidade_solicitada || 1}
                              max={Number(item.saldo_disponivel)}
                              onChange={(val) => handleAlterarQuantidade(item.id, val)}
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
  };

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

          {renderSetorFields()}

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

  // =========================================================================
  // ETAPA OS: Dados da Ordem de Serviço (substitui Itens + Dados para OS)
  // =========================================================================
  const renderEtapaOSDados = () => (
    <div className="space-y-6">
      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Badge className="bg-indigo-100 text-indigo-800">Ordem de Serviço</Badge>
            <p className="text-sm text-indigo-700">
              Contrato <strong>{contratoSelecionado?.numero_contrato}</strong> — {contratoSelecionado ? getNomeFornecedor(contratoSelecionado) : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {carregandoCronograma ? (
        <Card>
          <CardContent className="p-8 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando itens do cronograma...</span>
          </CardContent>
        </Card>
      ) : usarItensCronograma ? (
        /* Fluxo com ItemCronograma: Ordem Global vs Ordem por Demanda */
        <Card>
          <CardHeader>
            <CardTitle>Dados da Ordem de Serviço</CardTitle>
            <CardDescription>
              Contrato com medição por itens. Escolha o tipo de ordem e confira os itens.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Tipo de Ordem *</Label>
              <div className="flex gap-6 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modoOS"
                    checked={modoOS === 'ORDEM_GLOBAL'}
                    onChange={() => setModoOS('ORDEM_GLOBAL')}
                    className="h-4 w-4"
                  />
                  <span>Ordem Global</span>
                  <span className="text-sm text-gray-500">— Autoriza todos os itens conforme contrato</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modoOS"
                    checked={modoOS === 'ORDEM_DEMANDA'}
                    onChange={() => setModoOS('ORDEM_DEMANDA')}
                    className="h-4 w-4"
                  />
                  <span>Ordem por Demanda</span>
                  <span className="text-sm text-gray-500">— Define quantidades específicas para este período</span>
                </label>
              </div>
            </div>

            <div>
              <Label>Itens do Contrato</Label>
              <div className="border rounded-lg overflow-hidden mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Unidade</TableHead>
                      <TableHead className="text-right">Qtd contratada</TableHead>
                      <TableHead className="text-right">Qtd medida</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Meses</TableHead>
                      <TableHead className="text-right">Val. Mensal</TableHead>
                      <TableHead className="text-right">Valor unit.</TableHead>
                      {modoOS === 'ORDEM_DEMANDA' && (
                        <TableHead className="text-right">Qtd solicitada</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensCronograma.map((item) => {
                      const saldo = Number(item.quantidade) - Number(item.quantidade_medida);
                      const demanda = itensOSDemanda.find(d => d.item_cronograma_id === item.id);
                      const qtdSolicitada = demanda?.quantidade_solicitada ?? saldo;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>{item.numero_item}</TableCell>
                          <TableCell className="max-w-[280px]">
                            <span className="whitespace-normal break-words text-sm">{item.descricao}</span>
                          </TableCell>
                          <TableCell className="text-right">{item.unidade_medida}</TableCell>
                          <TableCell className="text-right">{Number(item.quantidade)}</TableCell>
                          <TableCell className="text-right">{Number(item.quantidade_medida)}</TableCell>
                          <TableCell className="text-right font-medium">{saldo}</TableCell>
                          <TableCell className="text-right">{item.quantidade_meses != null ? item.quantidade_meses : '-'}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(item.valor_mensal ?? (Number(item.quantidade) * Number(item.valor_unitario)))}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(Number(item.valor_unitario))}</TableCell>
                          {modoOS === 'ORDEM_DEMANDA' ? (
                            <TableCell className="text-right">
                              <QuantidadeInput
                                value={qtdSolicitada}
                                max={saldo}
                                onChange={(v) => handleAlterarQuantidadeOSDemanda(item.id, v)}
                              />
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {renderSetorFields()}

            <div>
              <Label>Justificativa *</Label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Justificativa para emissão da OS..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      ) : usarEtapasCronograma ? (
        /* Fluxo EtapaCronograma: Ordem Global vs Ordem por Demanda */
        <Card>
          <CardHeader>
            <CardTitle>Dados da Ordem de Serviço</CardTitle>
            <CardDescription>
              Contrato com medição por etapas. Escolha o tipo de ordem e confira as etapas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Descrição / Objeto da OS *</Label>
              <Textarea
                value={descricaoOS}
                onChange={(e) => setDescricaoOS(e.target.value)}
                placeholder="Objeto do contrato (preenchido automaticamente)"
                rows={2}
              />
            </div>
            <div>
              <Label>Tipo de Ordem *</Label>
              <div className="flex gap-6 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modoOSEtapas"
                    checked={modoOS === 'ORDEM_GLOBAL'}
                    onChange={() => setModoOS('ORDEM_GLOBAL')}
                    className="h-4 w-4"
                  />
                  <span>Ordem Global</span>
                  <span className="text-sm text-gray-500">— Autoriza todas as etapas conforme contrato</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="modoOSEtapas"
                    checked={modoOS === 'ORDEM_DEMANDA'}
                    onChange={() => setModoOS('ORDEM_DEMANDA')}
                    className="h-4 w-4"
                  />
                  <span>Ordem por Demanda</span>
                  <span className="text-sm text-gray-500">— Define valores específicos por etapa</span>
                </label>
              </div>
            </div>
            <div>
              <Label>Etapas do Contrato</Label>
              <div className="border rounded-lg overflow-hidden mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor previsto</TableHead>
                      <TableHead className="text-right">Valor executado</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      {modoOS === 'ORDEM_DEMANDA' && (
                        <TableHead className="text-right">Valor solicitado</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {etapasOS.map((etapa: any) => {
                      const valorPrevisto = Number(etapa.valor_previsto || 0);
                      const valorExecutado = Number(etapa.valor_executado || 0);
                      const saldo = valorPrevisto - valorExecutado;
                      const demanda = etapasOSDemanda.find(d => d.etapa_id === etapa.id);
                      const valorSolicitado = demanda?.valor_solicitado ?? saldo;
                      return (
                        <TableRow key={etapa.id}>
                          <TableCell>{etapa.numero_etapa ?? etapa.ordem ?? '-'}</TableCell>
                          <TableCell className="max-w-[280px]">
                            <span className="whitespace-normal break-words text-sm">{etapa.descricao}</span>
                          </TableCell>
                          <TableCell className="text-right">{formatarMoeda(valorPrevisto)}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(valorExecutado)}</TableCell>
                          <TableCell className="text-right font-medium">{formatarMoeda(saldo)}</TableCell>
                          {modoOS === 'ORDEM_DEMANDA' ? (
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                max={saldo}
                                step={0.01}
                                value={valorSolicitado}
                                onChange={(e) => handleAlterarValorEtapaOSDemanda(etapa.id, parseFloat(e.target.value) || 0)}
                                className="w-28 text-right"
                              />
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            {renderSetorFields()}
            <div>
              <Label>Justificativa *</Label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Justificativa para emissão da OS..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      ) : (
        /* Fluxo obras: formulário tradicional */
        <Card>
          <CardHeader>
            <CardTitle>Dados da Ordem de Serviço</CardTitle>
            <CardDescription>
              Preencha as informações da OS que autoriza o início da execução da obra/serviço
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Descrição / Objeto da OS *</Label>
              <Textarea
                value={descricaoOS}
                onChange={(e) => setDescricaoOS(e.target.value)}
                placeholder="Ex: Execução da obra de reforma do prédio sede conforme projeto básico"
                rows={3}
              />
            </div>

            {renderSetorFields()}

            <div>
              <Label>Justificativa *</Label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Justificativa para emissão da OS..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Local de Execução</Label>
                <Input
                  value={localExecucao}
                  onChange={(e) => setLocalExecucao(e.target.value)}
                  placeholder="Endereço ou local da obra"
                />
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

            <div>
              <Label>Fiscal do Contrato</Label>
              <Input
                value={fiscalNome}
                onChange={(e) => setFiscalNome(e.target.value)}
                placeholder="Nome do fiscal"
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
      )}
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
                <strong>{contratoSelecionado ? getNomeFornecedor(contratoSelecionado) : '-'}</strong>
              </div>
              <div>
                <span className="text-gray-500">Valor Global:</span>{' '}
                <strong>{formatarMoeda(contratoSelecionado?.valor_global || contratoSelecionado?.valor_inicial || 0)}</strong>
              </div>
              <div>
                <span className="text-gray-500">Saldo Disponível:</span>{' '}
                <strong className="text-green-600">{contratoSelecionado ? formatarMoeda(getSaldo(contratoSelecionado)) : '-'}</strong>
              </div>
            </div>
          </div>

          {/* Dados */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">{isOS ? 'Dados da OS' : 'Dados'}</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Tipo:</span>{' '}
                <Badge className={isOS ? 'bg-indigo-100 text-indigo-800' : ''}>
                  {isOS ? 'Ordem de Serviço' : tipo === 'MATERIAL' ? 'Material' : tipo === 'SERVICO' ? 'Serviço' : tipo}
                </Badge>
              </div>
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
              {isOS && usarItensCronograma && modoOS && (
                <div className="col-span-2">
                  <span className="text-gray-500">Tipo de Ordem:</span>{' '}
                  <strong>{modoOS === 'ORDEM_GLOBAL' ? 'Ordem Global' : 'Ordem por Demanda'}</strong>
                </div>
              )}
              {isOS && !usarItensCronograma && descricaoOS && (
                <div className="col-span-2">
                  <span className="text-gray-500">Objeto da OS:</span>{' '}
                  <strong>{descricaoOS}</strong>
                </div>
              )}
              {isOS && localExecucao && (
                <div className="col-span-2">
                  <span className="text-gray-500">Local de Execução:</span>{' '}
                  <strong>{localExecucao}</strong>
                </div>
              )}
              {isOS && (dataInicioPrevista || dataFimPrevista || prazoExecucaoDias) && (
                <div className="col-span-2 flex gap-4">
                  {dataInicioPrevista && <span><span className="text-gray-500">Início:</span> <strong>{formatarData(dataInicioPrevista)}</strong></span>}
                  {dataFimPrevista && <span><span className="text-gray-500">Fim:</span> <strong>{formatarData(dataFimPrevista)}</strong></span>}
                  {prazoExecucaoDias && <span><span className="text-gray-500">Prazo:</span> <strong>{prazoExecucaoDias} dias</strong></span>}
                </div>
              )}
              {isOS && (responsavelTecnico || fiscalNome) && (
                <div className="col-span-2 flex gap-4">
                  {responsavelTecnico && <span><span className="text-gray-500">Resp. Técnico:</span> <strong>{responsavelTecnico}</strong></span>}
                  {fiscalNome && <span><span className="text-gray-500">Fiscal:</span> <strong>{fiscalNome}</strong></span>}
                </div>
              )}
              {!isOS && localEntrega && (
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

          {/* Itens da OS (quando usarItensCronograma) */}
          {isOS && usarItensCronograma && itensCronograma.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Itens da OS ({itensCronograma.length})</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Unidade</TableHead>
                    <TableHead className="text-right">Qtd solicitada</TableHead>
                    <TableHead className="text-right">Meses</TableHead>
                    <TableHead className="text-right">Val. Mensal</TableHead>
                    <TableHead className="text-right">Valor unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensCronograma.map((item) => {
                    const saldo = Number(item.quantidade) - Number(item.quantidade_medida);
                    const demanda = itensOSDemanda.find(d => d.item_cronograma_id === item.id);
                    const qtd = modoOS === 'ORDEM_GLOBAL' ? saldo : (demanda?.quantidade_solicitada ?? 0);
                    const vlMensal = item.valor_mensal ?? (Number(item.quantidade) * Number(item.valor_unitario));
                    const total = item.quantidade_meses ? vlMensal * item.quantidade_meses : qtd * Number(item.valor_unitario);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.numero_item}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{item.descricao}</TableCell>
                        <TableCell className="text-right">{item.unidade_medida}</TableCell>
                        <TableCell className="text-right">{qtd}</TableCell>
                        <TableCell className="text-right">{item.quantidade_meses != null ? item.quantidade_meses : '-'}</TableCell>
                        <TableCell className="text-right">{formatarMoeda(vlMensal)}</TableCell>
                        <TableCell className="text-right">{formatarMoeda(Number(item.valor_unitario))}</TableCell>
                        <TableCell className="text-right font-medium">{formatarMoeda(total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-2 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-800">
                <strong>Total estimado:</strong>{' '}
                {formatarMoeda(itensCronograma.reduce((s, i) => {
                  const saldo = Number(i.quantidade) - Number(i.quantidade_medida);
                  const d = itensOSDemanda.find(x => x.item_cronograma_id === i.id);
                  const q = modoOS === 'ORDEM_GLOBAL' ? saldo : (d?.quantidade_solicitada ?? 0);
                  const vlMensal = i.valor_mensal ?? (Number(i.quantidade) * Number(i.valor_unitario));
                  return s + (i.quantidade_meses ? vlMensal * i.quantidade_meses : q * Number(i.valor_unitario));
                }, 0))}
              </div>
            </div>
          )}

          {/* Etapas do cronograma (OS com etapas) */}
          {isOS && usarEtapasCronograma && etapasOS.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">
                Etapas Autorizadas ({etapasOS.length}) — {modoOS === 'ORDEM_GLOBAL' ? 'Ordem Global (100%)' : 'Ordem por Demanda'}
              </h4>
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
                  {etapasOS.map((etapa, idx) => {
                    const demanda = etapasOSDemanda.find(d => d.etapa_id === etapa.id);
                    const perc = modoOS === 'ORDEM_GLOBAL' ? 100 : (demanda?.percentual_solicitado ?? 0);
                    const valorPrevisto = Number(etapa.valor_previsto ?? 0);
                    const total = valorPrevisto * perc / 100;
                    return (
                      <TableRow key={etapa.id}>
                        <TableCell>{etapa.numero_etapa ?? idx + 1}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{etapa.descricao}</TableCell>
                        <TableCell className="text-right">{perc}%</TableCell>
                        <TableCell className="text-right">{formatarMoeda(valorPrevisto)}</TableCell>
                        <TableCell className="text-right font-medium">{formatarMoeda(total)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-2 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-800">
                <strong>Total autorizado:</strong>{' '}
                {formatarMoeda(etapasOS.reduce((s, etapa) => {
                  const demanda = etapasOSDemanda.find(d => d.etapa_id === etapa.id);
                  const perc = modoOS === 'ORDEM_GLOBAL' ? 100 : (demanda?.percentual_solicitado ?? 0);
                  return s + Number(etapa.valor_previsto ?? 0) * perc / 100;
                }, 0))}
              </div>
            </div>
          )}

          {/* Itens (apenas para requisição normal) */}
          {!isOS && (
            <>
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
            </>
          )}

          {/* Alerta OS */}
          {isOS && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-indigo-600 mt-0.5" />
              <div className="text-sm text-indigo-800">
                <strong>Ordem de Serviço:</strong> Após enviar para autorização, a OS será analisada pelo gestor.
                Uma vez autorizada, as medições poderão ser registradas no contrato.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Modal de Recuperação de Rascunho */}
      <Dialog open={showRecuperarRascunho} onOpenChange={setShowRecuperarRascunho}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-600" />
              Rascunho Encontrado
            </DialogTitle>
            <DialogDescription>
              Encontramos um rascunho de requisição não finalizado.
            </DialogDescription>
          </DialogHeader>
          
          {rascunhoSalvo && (
            <div className="bg-blue-50 p-4 rounded-lg space-y-2">
              <p className="text-sm">
                <strong>Salvo em:</strong> {formatarDataHora(rascunhoSalvo.savedAt)}
              </p>
              {rascunhoSalvo.contratoId && (() => {
                const contrato = contratos.find(c => c.id === rascunhoSalvo.contratoId);
                return (
                  <p className="text-sm">
                    <strong>Contrato:</strong>{' '}
                    {contrato 
                      ? `${contrato.numero_contrato} - ${getNomeFornecedor(contrato)}`
                      : 'Carregando...'}
                  </p>
                );
              })()}
              {rascunhoSalvo.itensRequisicao.length > 0 && (
                <>
                  <p className="text-sm">
                    <strong>Itens:</strong> {rascunhoSalvo.itensRequisicao.length}
                  </p>
                  <p className="text-sm font-medium text-blue-700">
                    <strong>Valor Total:</strong>{' '}
                    {formatarMoeda(rascunhoSalvo.itensRequisicao.reduce((total, item) => total + (item.valor_total || 0), 0))}
                  </p>
                </>
              )}
              {rascunhoSalvo.setorSolicitante && (
                <p className="text-sm">
                  <strong>Setor:</strong> {rascunhoSalvo.setorSolicitante}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                limparRascunhoLocal();
                setShowRecuperarRascunho(false);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Descartar
            </Button>
            <Button
              onClick={() => rascunhoSalvo && aplicarRascunho(rascunhoSalvo)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Continuar Rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orgao/almoxarifado/requisicoes">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isOS ? 'Nova Autorização de Início (OS)' : 'Nova Requisição'}
            </h1>
            <p className="text-gray-500 mt-1">
              {isOS 
                ? 'Emita uma Ordem de Serviço para autorizar o início de obras ou serviços por medição.'
                : 'Preencha os dados abaixo para solicitar materiais ou serviços do almoxarifado/contrato.'}
            </p>
          </div>
        </div>
        {ultimoSalvamento && (
          <div className="text-sm text-gray-500 flex items-center">
            <Save className="h-4 w-4 mr-2" />
            Salvo localmente às {ultimoSalvamento.toLocaleTimeString('pt-BR')}
          </div>
        )}
      </div>

      {/* Progress Steps */}
      <StepProgress currentStep={etapa} steps={STEPS} />

      {/* Conteúdo da Etapa */}
      {etapa === 0 && renderEtapa0Contrato()}
      {isOS ? (
        <>
          {etapa === 1 && renderEtapaOSDados()}
          {etapa === 2 && renderEtapa3Resumo()}
        </>
      ) : (
        <>
          {etapa === 1 && renderEtapa1Itens()}
          {etapa === 2 && renderEtapa2Dados()}
          {etapa === 3 && renderEtapa3Resumo()}
        </>
      )}

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
          {etapa < STEPS.length - 1 ? (
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
