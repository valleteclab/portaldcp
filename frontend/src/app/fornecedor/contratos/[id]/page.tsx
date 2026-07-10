'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  BarChart3,
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
  FileDown,
  Edit,
  Copy,
  ShoppingCart,
  ExternalLink,
} from 'lucide-react';
import { API_URL, authFetch } from '@/lib/api';
import { textoFrequenciaNaTela, textoUnidadeCronogramaNaTela } from '@/lib/cronograma-contrato';

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
  boletim_por_quantidade?: boolean;
  arredondar_calculo?: boolean;
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
  itens?: EtapaItem[];
}

interface EtapaItem {
  id?: string;
  numero_item: number;
  descricao: string;
  unidade?: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total?: number;
  marca?: string;
  modelo?: string;
}

type ItemMedicaoEtapaState = {
  etapa_id: string;
  percentual_executado_atual: number;
  valor_executado_atual?: number;
  modo_input?: 'percentual' | 'valor' | 'itens';
  itens_etapa_medidos?: string[];
};

type ItemMedicaoCronogramaState = {
  item_cronograma_id: string;
  quantidade_medida: number;
  modo_input?: 'quantidade' | 'valor';
  valor_override?: number;
};

interface ItemCronograma {
  id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  frequencia_execucao?: string | null;
  valor_mensal?: number;
  valor_total: number;
  quantidade_medida: number;
  valor_migracao_reais?: number | null;
}

interface Medicao {
  id: string;
  numero_medicao: number;
  periodo_inicio: string;
  periodo_fim: string;
  competencia?: string;
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
  execucao_fiscal?: {
    vigencia_inicio: string;
    vigencia_fim: string;
    total_dias: number;
    dias_executados: number;
    dias_restantes: number;
    meses_executados: number;
    dias_executados_extra: number;
    meses_restantes: number;
    dias_restantes_extra: number;
    ano_comercial: boolean;
  };
  execucao_financeira?: {
    itens: Array<{
      etapa_id: string;
      numero_etapa: number;
      descricao: string;
      valor_previsto: number;
      percentual_fisico: number;
      no_periodo: number;
      ate_periodo: number;
      a_executar: number;
      no_periodo_item?: number;
      ate_periodo_item?: number;
      a_executar_item?: number;
      no_periodo_global?: number;
      ate_periodo_global?: number;
      a_executar_global?: number;
    }>;
    totais: {
      valor_previsto: number;
      no_periodo: number;
      ate_periodo: number;
      a_executar: number;
    };
    ajuste_migracao?: number;
  };
}

interface Resumo {
  valor_global: number;
  valor_medido_total: number;
  valor_comprometido_total?: number;
  valor_em_analise?: number;
  saldo_disponivel: number;
  percentual_fisico_total: number;
  etapas_comprometidas?: Record<string, number>;
  itens_etapa_medidos?: Record<string, string[]>;
  itens_comprometidos?: Record<string, number>;
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

interface AnexoReaproveitado {
  id: string;
  tipo: 'FOTO' | 'DOCUMENTO';
  nome_original: string;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  url: string;
  descricao: string;
}

// ============ FUNÇÕES ============

// Função para calcular dias com ano comercial (360 dias)
function diaFimComercial(ano: number, mes: number, dia: number): number {
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return dia === ultimoDiaDoMes ? 30 : Math.min(dia, 30);
}

function calcularDiasMesComercial(dataInicio: string, dataFim: string, dataFimContrato?: string): number {
  const d1 = new Date(dataInicio);
  const d2 = new Date(dataFim);
  const dataFimContratoDate = dataFimContrato ? new Date(dataFimContrato) : null;
  
  // Usar UTC para evitar problemas de timezone
  const ano1 = d1.getUTCFullYear();
  const mes1 = d1.getUTCMonth();
  const dia1 = d1.getUTCDate();
  
  const ano2 = d2.getUTCFullYear();
  const mes2 = d2.getUTCMonth();
  const dia2 = d2.getUTCDate();
  const ehUltimoDiaDoContrato = dataFimContratoDate
    ? d2.getUTCFullYear() === dataFimContratoDate.getUTCFullYear() &&
      d2.getUTCMonth() === dataFimContratoDate.getUTCMonth() &&
      d2.getUTCDate() === dataFimContratoDate.getUTCDate()
    : false;
  const dia2Com = ehUltimoDiaDoContrato
    ? Math.min(dia2 - 1, 30)
    : diaFimComercial(ano2, mes2, dia2);
  
  let dias = 0;
  
  // Se mesmo mês
  if (ano1 === ano2 && mes1 === mes2) {
    // Para períodos normais: conta ambos os dias (dia_fim - dia_início + 1)
    // Apenas não conta o dia final se for o último dia do contrato
    dias = dia2Com - dia1 + 1;
  } else {
    // Dias no primeiro mês (ano comercial) - conta o dia inicial
    const diasPrimeiroMes = Math.min(30 - dia1 + 1, 30);
    
    // Meses completos no meio
    let mesesCompletos = 0;
    if (ano2 > ano1 || mes2 > mes1 + 1) {
      mesesCompletos = (ano2 - ano1) * 12 + (mes2 - mes1 - 1);
    }
    
    // Dias no último mês (ano comercial)
    // Não conta o dia final se for o último dia do contrato
    const diasUltimoMes = dia2Com;
    
    dias = diasPrimeiroMes + (mesesCompletos * 30) + diasUltimoMes;
  }
  
  // IMPORTANTE: Ano comercial sempre = 360 dias
  return Math.max(0, Math.min(dias, 360));
}

// Função para calcular execução fiscal com ano comercial
function calcularExecucaoFiscal(periodoInicio: string, periodoFim: string, vigenciaInicio: string, vigenciaFim: string) {
  // Dias no período da medição
  const diasPeriodo = calcularDiasMesComercial(periodoInicio, periodoFim, vigenciaFim);
  
  // Dias executados até o fim do período
  const diasAte = calcularDiasMesComercial(vigenciaInicio, periodoFim, vigenciaFim);
  
  // Dias restantes até o fim do contrato
  const diasRestantes = Math.max(0, 360 - diasAte);
  
  // Formatar como meses e dias
  const formatarDias = (dias: number) => {
    const meses = Math.floor(dias / 30);
    const diasResto = dias % 30;
    if (meses === 0) return `${diasResto} dias`;
    if (diasResto === 0) return `${meses} mês${meses > 1 ? 'es' : ''}`;
    return `${meses} mês${meses > 1 ? 'es' : ''} e ${diasResto} dias`;
  };
  
  return {
    noPeriodo: formatarDias(diasPeriodo),
    atePeriodo: formatarDias(diasAte),
    aExecutar: formatarDias(diasRestantes),
    diasNoPeriodo: diasPeriodo,
    diasAte: diasAte,
    diasRestantes: diasRestantes
  };
}

// Calcular execução financeira
function calcularExecucaoFinanceira(valorMedido: number, valorAcumulado: number, percentualFisico: number) {
  // Calcular valor executado
  const valorExecutado = valorMedido * (percentualFisico / 100);
  
  // Calcular valor restante
  const valorRestante = valorAcumulado - valorExecutado;
  
  return {
    valorExecutado: valorExecutado,
    valorRestante: valorRestante
  };
}

// ============ HELPERS ============

const formatarMoeda = (valor: number | null | undefined) => {
  if (valor === null || valor === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
};

const formatarQuantidade = (valor: number | null | undefined) => {
  const numero = Number(valor) || 0;
  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(numero) ? 0 : 2,
    maximumFractionDigits: 4,
  });
};

const parseValorDecimal = (valor: string | number | null | undefined) => {
  if (valor == null) return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const limpo = valor.replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!limpo) return 0;
  if (limpo.includes(',')) return Number(limpo.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(limpo) || 0;
};

const escolherValorBaseDiscriminacao = (
  notaFiscalValor: string | number | null | undefined,
  valorMedidoAtual: number,
) => {
  const valorNf = parseValorDecimal(notaFiscalValor);
  const valorMedido = Number(valorMedidoAtual) || 0;
  if (valorNf > 0 && valorMedido > 0 && (valorNf > valorMedido * 10 || valorMedido > valorNf * 10)) {
    return valorMedido;
  }
  return valorNf || valorMedido;
};

const aplicarRegraArredondamentoContrato = (valor: number, arredondar = true) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  if (arredondar) return Math.round(numero * 100) / 100;
  return Math.trunc(numero * 100) / 100;
};

const distribuirValoresMensaisPorTotal = (
  itens: Array<{
    id: string;
    valorUnitario: number;
    quantidadeValor: number;
    saldoFinanceiro: number;
  }>,
  arredondar = true,
) => {
  const calculos = itens
    .map((item, index) => {
      const valorUnitarioCentavos = Math.round(item.valorUnitario * 100);
      const brutoCentavos =
        valorUnitarioCentavos * Math.max(0, item.quantidadeValor);
      const baseCentavos = Math.floor(brutoCentavos);
      return {
        ...item,
        index,
        brutoCentavos,
        baseCentavos,
        fracao: brutoCentavos - baseCentavos,
      };
    })
    .filter((item) => item.brutoCentavos > 0);
  const valores = new Map<string, number>();
  if (calculos.length === 0) return valores;

  const totalBruto = calculos.reduce(
    (total, item) => total + item.brutoCentavos,
    0,
  );
  const totalCentavos = arredondar
    ? Math.round(totalBruto)
    : Math.floor(totalBruto);
  let ajuste =
    totalCentavos -
    calculos.reduce((total, item) => total + item.baseCentavos, 0);

  const centavosPorId = new Map(
    calculos.map((item) => [item.id, item.baseCentavos]),
  );
  const ordem = [...calculos].sort(
    (a, b) => b.fracao - a.fracao || a.index - b.index,
  );
  for (let i = 0; ajuste > 0 && ordem.length > 0; i = (i + 1) % ordem.length) {
    centavosPorId.set(ordem[i].id, (centavosPorId.get(ordem[i].id) || 0) + 1);
    ajuste -= 1;
  }

  for (const item of calculos) {
    const valor = (centavosPorId.get(item.id) || 0) / 100;
    valores.set(item.id, Math.min(valor, item.saldoFinanceiro));
  }
  return valores;
};

const calcularSaldoFinanceiroItemCronograma = (ic: ItemCronograma) => {
  const valorTotal = Number(ic.valor_total) || 0;
  const valorUnitario = Number(ic.valor_unitario) || 0;
  const quantidadeMedida = Number(ic.quantidade_medida) || 0;
  const valorMigracao = Number(ic.valor_migracao_reais || 0);

  if (ic.unidade_medida === 'MENSAL' && valorMigracao > 0 && valorUnitario > 0) {
    const mesesMigracao = valorMigracao / valorUnitario;
    const quantidadeAprovadaRaw = Math.max(0, quantidadeMedida - mesesMigracao);
    const quantidadeAprovada =
      Math.abs(quantidadeAprovadaRaw - Math.round(quantidadeAprovadaRaw)) < 0.01
        ? Math.round(quantidadeAprovadaRaw)
        : quantidadeAprovadaRaw;
    const valorAprovado = Math.round(quantidadeAprovada * valorUnitario * 100) / 100;
    return Math.max(0, Math.round((valorTotal - valorMigracao - valorAprovado) * 100) / 100);
  }

  return Math.max(0, Math.round((valorTotal - quantidadeMedida * valorUnitario) * 100) / 100);
};

const limitarValorAoSaldoFinanceiro = (valor: number, saldoFinanceiro: number) =>
  Math.min(
    Math.round((Number(valor) || 0) * 100) / 100,
    Math.round((Number(saldoFinanceiro) || 0) * 100) / 100,
  );

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
  EM_ATESTE: { label: 'Em Ateste', cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  ATESTADA: { label: 'Atestada', cor: 'bg-indigo-100 text-indigo-700', icon: CheckCircle },
  PARCIALMENTE_ATESTADA: { label: 'Parcialmente Atestada', cor: 'bg-amber-100 text-amber-700', icon: Clock },
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
  const searchParams = useSearchParams();
  const contratoId = params.id as string;

  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [itensCronograma, setItensCronograma] = useState<ItemCronograma[]>([]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [abaAtiva, setAbaAtiva] = useState(searchParams.get('tab') || 'medicoes');

  const isServicoContinuado = ['CONTINUADO', 'LICENCA'].includes(contrato?.modalidade_execucao || '');
  const usarItensCronograma = itensCronograma.length > 0;
  const temCronograma = etapas.length > 0 || itensCronograma.length > 0;

  // Modal Nova Medição
  const [modalNovaMedicao, setModalNovaMedicao] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [carregandoReplicar, setCarregandoReplicar] = useState(false);
  const [novaMedicao, setNovaMedicao] = useState({
    periodo_inicio: '',
    periodo_fim: '',
    competencia: '',
    observacoes: '',
    nota_fiscal_numero: '',
    nota_fiscal_valor: '',
    nota_fiscal_data: '',
    valor_medido: '',
    itens: [] as (ItemMedicaoEtapaState | ItemMedicaoCronogramaState)[],
  });
  // Discriminação de Despesas
  const [discriminacoes, setDiscriminacoes] = useState<{ descricao: string; valor: number; percentual: number }[]>([]);

  // Arquivos pendentes para upload após criação da medição
  const [arquivosPendentes, setArquivosPendentes] = useState<{ file: File; tipo: 'FOTO' | 'DOCUMENTO'; descricao: string }[]>([]);
  const [anexosReaproveitados, setAnexosReaproveitados] = useState<AnexoReaproveitado[]>([]);

  // Estado para execução financeira do backend
  const [execucaoFinanceira, setExecucaoFinanceira] = useState<any>(null);

  // Modal Submeter (legado — mantido para compatibilidade de estado)
  const [modalSubmeter, setModalSubmeter] = useState(false);
  const [medicaoParaSubmeter, setMedicaoParaSubmeter] = useState<Medicao | null>(null);
  const [dadosSubmissao, setDadosSubmissao] = useState({
    fornecedor_observacoes: '',
    nota_fiscal_numero: '',
    nota_fiscal_valor: '',
    nota_fiscal_data: '',
  });

  // Modal OTP Assinatura Digital
  const [modalOtp, setModalOtp] = useState(false);
  const [otpMedicaoId, setOtpMedicaoId] = useState<string | null>(null);
  const [otpEtapa, setOtpEtapa] = useState<'info' | 'codigo' | 'sucesso'>('info');
  const [otpCodigo, setOtpCodigo] = useState('');
  const [otpCanais, setOtpCanais] = useState<{ canais_enviados: string[]; telefone_mascarado?: string; email_mascarado?: string } | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpErro, setOtpErro] = useState<string | null>(null);
  const [otpCodigoValidacao, setOtpCodigoValidacao] = useState<string | null>(null);

  // Modal Detalhe
  const [modalDetalhe, setModalDetalhe] = useState(false);
  const [modalComprasAviso, setModalComprasAviso] = useState(false);
  const [medicaoDetalhe, setMedicaoDetalhe] = useState<Medicao | null>(null);
  const [discriminacoesDetalhe, setDiscriminacoesDetalhe] = useState<any[]>([]);
  const [editandoItensDetalhe, setEditandoItensDetalhe] = useState(false);
  const [itensEditados, setItensEditados] = useState<Record<string, { percentual_executado_atual: number; valor_executado_atual: number }>>({});

  // Modo de edição de medição devolvida
  const [medicaoParaEditar, setMedicaoParaEditar] = useState<Medicao | null>(null);

  // Anexos
  const [anexos, setAnexos] = useState<Record<string, Anexo[]>>({});
  const [uploadingAnexo, setUploadingAnexo] = useState(false);

  const valorItemEtapaMedicao = (
    item: ItemMedicaoEtapaState,
    etapa: Etapa,
  ) => {
    if (
      (item.modo_input === 'valor' || item.modo_input === 'itens') &&
      item.valor_executado_atual != null
    ) {
      return Number(item.valor_executado_atual) || 0;
    }
    return (Number(item.percentual_executado_atual) / 100) * Number(etapa.valor_previsto);
  };

  const valorSaldoEtapa = (etapa: Etapa, percentualEmTransito = 0) => {
    const valorPrevisto = Number(etapa.valor_previsto) || 0;
    const valorExecutado = Number(etapa.valor_executado) || 0;
    const valorEmTransito = (percentualEmTransito / 100) * valorPrevisto;
    return Math.max(0, valorPrevisto - valorExecutado - valorEmTransito);
  };

  const valorMedicaoAtual = isServicoContinuado
    ? (parseFloat(novaMedicao.valor_medido) || 0)
    : usarItensCronograma
      ? novaMedicao.itens.reduce((acc, item) => {
          if (!('item_cronograma_id' in item)) return acc;
          const ic = itensCronograma.find(i => i.id === item.item_cronograma_id);
          if (!ic) return acc;
          const subtotal =
            item.modo_input === 'valor' && item.valor_override != null
              ? item.valor_override
              : Number(item.quantidade_medida || 0) * Number(ic.valor_unitario);
          return acc + subtotal;
        }, 0)
      : novaMedicao.itens.reduce((acc, item, idx) => {
          const etapa = etapas[idx];
          if (!etapa || !('etapa_id' in item)) return acc;
          return acc + valorItemEtapaMedicao(item, etapa);
        }, 0);

  // Determina o tipo de medição atual com base nos itens já preenchidos (mensal vs quantidade)
  const tipoMedicaoAtual: 'mensal' | 'quantidade' | null = (() => {
    if (!usarItensCronograma) return null;
    const primeiro = novaMedicao.itens.find(i => 'item_cronograma_id' in i && Number((i as any).quantidade_medida) > 0);
    if (!primeiro) return null;
    const ic = itensCronograma.find(c => c.id === (primeiro as any).item_cronograma_id);
    return ic?.unidade_medida === 'MENSAL' ? 'mensal' : 'quantidade';
  })();

  // Calcula totais de execução financeira filtrando pelo tipo de item selecionado
  const { noPeriodoExibicao, atePeriodoExibicao, aExecutarExibicao } = (() => {
    // MENSAL: cálculo por item (igual ao portal do órgão)
    if (tipoMedicaoAtual === 'mensal') {
      let noPeriodo = 0, atePeriodo = 0, aExecutar = 0;
      const itensMens = itensCronograma.filter(ic => ic.unidade_medida === 'MENSAL');
      for (const ic of itensMens) {
        const itemState = novaMedicao.itens.find(i => 'item_cronograma_id' in i && (i as any).item_cronograma_id === ic.id) as any;
        const qtdNoPeriodo = Number(itemState?.quantidade_medida ?? 0);
        if (qtdNoPeriodo <= 0) continue;
        const vm = Number(ic.valor_mensal) || Number(ic.valor_unitario) || 0;
        const valorNoPeriodo =
          itemState?.modo_input === 'valor' && itemState?.valor_override != null
            ? Number(itemState.valor_override)
            : qtdNoPeriodo * vm;
        const backendItem = execucaoFinanceira?.itens?.find((i: any) => i.etapa_id === ic.id);
        const fromBackend = backendItem ? Number(backendItem.ate_periodo_global ?? backendItem.ate_periodo ?? 0) : 0;
        const fromMigracao =
          Number(ic.valor_migracao_reais ?? 0) > 0
            ? Number(ic.valor_migracao_reais)
            : Number(ic.quantidade_medida ?? 0) * vm;
        const valorAprovadoAnterior = Math.max(fromBackend, fromMigracao);
        const valorAtePeriodo = valorAprovadoAnterior + valorNoPeriodo;
        const valorTotal = Number(ic.valor_total) || 0;
        noPeriodo += valorNoPeriodo;
        atePeriodo += valorAtePeriodo;
        aExecutar += Math.max(0, valorTotal - valorAtePeriodo);
      }
      return { noPeriodoExibicao: noPeriodo, atePeriodoExibicao: atePeriodo, aExecutarExibicao: aExecutar };
    }

    // Para tipo null sem itens: fallback proporcional por dias comerciais
    if (tipoMedicaoAtual === null &&
        novaMedicao.periodo_inicio && novaMedicao.periodo_fim &&
        contrato?.data_vigencia_inicio && contrato?.data_vigencia_fim) {
      const vg = Number(contrato?.valor_global || 0);
      const fiscal = calcularExecucaoFiscal(novaMedicao.periodo_inicio, novaMedicao.periodo_fim, contrato.data_vigencia_inicio, contrato.data_vigencia_fim);
      return {
        noPeriodoExibicao: (fiscal.diasNoPeriodo / 360) * vg,
        atePeriodoExibicao: (fiscal.diasAte / 360) * vg,
        aExecutarExibicao: (fiscal.diasRestantes / 360) * vg,
      };
    }

    // Para quantidade: espelha exatamente o fiscal (qtd × valor_unitario)
    // Isso garante que ajustes manuais de quantidade sejam respeitados
    if (tipoMedicaoAtual === 'quantidade') {
      let noPeriodo = 0, atePeriodo = 0, aExecutar = 0;
      const itensQtd = itensCronograma.filter(ic => ic.unidade_medida !== 'MENSAL');
      for (const ic of itensQtd) {
        const itemState = novaMedicao.itens.find(i => 'item_cronograma_id' in i && (i as any).item_cronograma_id === ic.id) as any;
        const qtdNoPeriodo = Number(itemState?.quantidade_medida ?? 0);
        if (qtdNoPeriodo <= 0) continue;
        const qtdAprovada = Number(ic.quantidade_medida ?? 0);
        const qtdTotal = Number(ic.quantidade ?? 0);
        const qtdAtePeriodo = qtdAprovada + qtdNoPeriodo;
        const qtdAExecutar = Math.max(0, qtdTotal - qtdAtePeriodo);
        const vu = Number(ic.valor_unitario);
        noPeriodo += qtdNoPeriodo * vu;
        atePeriodo += qtdAtePeriodo * vu;
        aExecutar += qtdAExecutar * vu;
      }
      return { noPeriodoExibicao: noPeriodo, atePeriodoExibicao: atePeriodo, aExecutarExibicao: aExecutar };
    }

    // Demais tipos: usar dados do backend ou fallback por valor global
    const itensBase = tipoMedicaoAtual === null
      ? itensCronograma
      : itensCronograma.filter(ic => {
          const isMensal = ic.unidade_medida === 'MENSAL';
          return tipoMedicaoAtual === 'mensal' ? isMensal : !isMensal;
        });

    // Quando temos backend data com itens
    if (usarItensCronograma && execucaoFinanceira?.itens?.length) {
      const idsBase = new Set(itensBase.map(ic => ic.id));
      const itensBack = (execucaoFinanceira.itens as any[]).filter((i: any) => idsBase.has(i.etapa_id));
      const noPeriodoBk = itensBack.reduce((s: number, i: any) => s + Number(i.no_periodo || 0), 0);
      const atePeriodoBk = itensBack.reduce((s: number, i: any) => s + Number(i.ate_periodo_global ?? i.ate_periodo ?? 0), 0);
      const noPeriodo = Math.max(noPeriodoBk, valorMedicaoAtual || 0);
      const localExtra = Math.max(0, noPeriodo - noPeriodoBk);
      const atePeriodo = atePeriodoBk + localExtra;
      const valorTotal = itensBase.reduce((sum, ic) => sum + Number(ic.valor_total), 0);
      const aExecutar = Math.max(0, valorTotal - atePeriodo);
      return { noPeriodoExibicao: noPeriodo, atePeriodoExibicao: atePeriodo, aExecutarExibicao: aExecutar };
    }

    // Fallback: sem dados do backend — calcular a partir dos itens do cronograma
    const noPeriodo = valorMedicaoAtual || 0;
    if (usarItensCronograma) {
      const valorMigracao = itensBase.reduce(
        (sum, ic) =>
          sum +
          (ic.unidade_medida === 'MENSAL' && Number(ic.valor_migracao_reais ?? 0) > 0
            ? Number(ic.valor_migracao_reais ?? 0)
            : Number(ic.quantidade_medida) * Number(ic.valor_unitario)),
        0,
      );
      const valorAprovadoAnterior = Number(resumo?.valor_medido_total || 0);
      const atePeriodo = valorMigracao + valorAprovadoAnterior + noPeriodo;
      const valorTotal = itensBase.reduce((sum, ic) => sum + Number(ic.valor_total), 0);
      const aExecutar = Math.max(0, valorTotal - atePeriodo);
      return { noPeriodoExibicao: noPeriodo, atePeriodoExibicao: atePeriodo, aExecutarExibicao: aExecutar };
    }

    // Sem itens cronograma — fallback genérico com valor global do contrato
    const valorAprovadoAnterior = Number(resumo?.valor_medido_total || 0);
    const atePeriodo = valorAprovadoAnterior + noPeriodo;
    const aExecutar = Math.max(0, Number(contrato?.valor_global || 0) - atePeriodo);
    return { noPeriodoExibicao: noPeriodo, atePeriodoExibicao: atePeriodo, aExecutarExibicao: aExecutar };
  })();

  useEffect(() => {
    const fornecedorData = localStorage.getItem('fornecedor');
    if (fornecedorData) {
      setFornecedor(JSON.parse(fornecedorData));
    }
    carregarDados();
  }, [contratoId]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setAbaAtiva(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const acao = searchParams.get('acao');
    const medicaoId = searchParams.get('medicaoId');

    if (tab === 'medicoes') {
      setAbaAtiva('medicoes');
    }

    if (loading || tab !== 'medicoes' || !acao) return;

    const executarAcao = async () => {
      if (acao === 'nova') {
        if (contrato?.categoria === 'COMPRAS') {
          setModalComprasAviso(true);
          return;
        }
        await abrirModalNovaMedicao();
      } else if (acao === 'continuar') {
        const rascunho = medicaoId ? medicoes.find((medicao) => medicao.id === medicaoId) : medicoes.find((medicao) => medicao.status === 'RASCUNHO');
        if (rascunho) {
          await carregarDadosMedicao(rascunho);
          setModalNovaMedicao(true);
        }
      } else if (acao === 'editar') {
        const medicaoEditar = medicaoId ? medicoes.find((medicao) => medicao.id === medicaoId) : medicoes.find((medicao) => medicao.status === 'DEVOLVIDA');
        if (medicaoEditar) {
          await carregarDadosMedicao(medicaoEditar);
          setModalNovaMedicao(true);
        }
      } else if (acao === 'ver') {
        const medicaoVisualizar = medicaoId ? medicoes.find((medicao) => medicao.id === medicaoId) : medicoes[medicoes.length - 1];
        if (medicaoVisualizar) {
          await abrirDetalheMedicao(medicaoVisualizar);
        }
      }

      const novosParams = new URLSearchParams(searchParams.toString());
      novosParams.delete('acao');
      novosParams.delete('medicaoId');
      router.replace(`/fornecedor/contratos/${contratoId}?${novosParams.toString()}`);
    };

    executarAcao();
  }, [searchParams, loading, medicoes, contratoId]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const fornecedorData = localStorage.getItem('fornecedor');
      const fId = fornecedorData ? JSON.parse(fornecedorData).id : '';
      const qp = fId ? `?fornecedorId=${fId}` : '';

      const [contratoRes, etapasRes, itensRes, medicoesRes, resumoRes] = await Promise.all([
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/detalhe${qp}`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/etapas${qp}`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/itens-cronograma${qp}`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes/resumo`),
      ]);

      if (contratoRes.ok) setContrato(await contratoRes.json());
      if (etapasRes.ok) setEtapas(await etapasRes.json());
      if (itensRes.ok) setItensCronograma(await itensRes.json());
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

  const reaproveitarAnexosExistentes = async (medicaoId: string) => {
    let anexosOriginais = anexos[medicaoId];

    if (!anexosOriginais) {
      try {
        const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoId}/anexos`);
        if (res.ok) {
          anexosOriginais = await res.json();
          setAnexos(prev => ({ ...prev, [medicaoId]: anexosOriginais || [] }));
        }
      } catch {
        anexosOriginais = [];
      }
    }

    setAnexosReaproveitados((anexosOriginais || []).map((anexo: Anexo) => ({
      id: anexo.id,
      tipo: anexo.tipo,
      nome_original: anexo.nome_original,
      nome_arquivo: anexo.nome_arquivo,
      mime_type: anexo.mime_type,
      tamanho_bytes: anexo.tamanho_bytes,
      url: anexo.url,
      descricao: anexo.descricao || '',
    })));
  };

  const uploadAnexosReaproveitados = async (medicaoId: string) => {
    if (anexosReaproveitados.length === 0 || !fornecedor) return;

    for (const anexo of anexosReaproveitados) {
      try {
        const arquivoUrl = anexo.url.startsWith('http') ? anexo.url : `${API_URL}${anexo.url}`;
        const arquivoRes = await fetch(arquivoUrl);
        if (!arquivoRes.ok) continue;

        const blob = await arquivoRes.blob();
        const file = new File([blob], anexo.nome_original || anexo.nome_arquivo, { type: anexo.mime_type || blob.type });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('tipo', anexo.tipo);
        formData.append('fornecedor_id', fornecedor.id);
        formData.append('fornecedor_nome', fornecedor.razao_social || fornecedor.nome);
        if (anexo.descricao) formData.append('descricao', anexo.descricao);

        await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoId}/anexos`, {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        console.error('Erro ao reaproveitar anexo:', err);
      }
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

  // Função para buscar execução financeira do backend
  const carregarExecucaoFinanceira = async (medicaoId?: string) => {
    if (!contrato || !fornecedor) return;
    
    try {
      const url = medicaoId 
        ? `${API_URL}/api/fornecedor/contratos/${contrato.id}/execucao-financeira?fornecedorId=${fornecedor.id}&medicaoId=${medicaoId}`
        : `${API_URL}/api/fornecedor/contratos/${contrato.id}/execucao-financeira?fornecedorId=${fornecedor.id}`;
      
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log('DEBUG: Execução financeira recebida:', data);
        console.log('DEBUG: totais:', data.totais);
        console.log('DEBUG: no_periodo:', data.totais?.no_periodo);
        console.log('DEBUG: ate_periodo:', data.totais?.ate_periodo);
        console.log('DEBUG: a_executar:', data.totais?.a_executar);
        setExecucaoFinanceira(data);
      }
    } catch (error) {
      console.error('Erro ao carregar execução financeira:', error);
    }
  };

  const handleUploadAnexo = async (medicaoId: string, file: File, tipo: 'FOTO' | 'DOCUMENTO', descricao?: string) => {
    if (!fornecedor) return;

    // Validação de tamanho (máx 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Tamanho máximo: 10MB.`);
      return;
    }

    // Validação de tipo
    const tiposPermitidos = tipo === 'FOTO'
      ? ['image/jpeg', 'image/jpg', 'image/png']
      : ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!tiposPermitidos.includes(file.type)) {
      alert(`Tipo de arquivo não permitido (${file.type}). ${tipo === 'FOTO' ? 'Use JPG ou PNG.' : 'Use PDF, JPG ou PNG.'}`);
      return;
    }

    setUploadingAnexo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', tipo);
      formData.append('fornecedor_id', fornecedor.id);
      formData.append('fornecedor_nome', fornecedor.razao_social || fornecedor.nome);
      if (descricao) formData.append('descricao', descricao);

      // Usar authFetch que já gerencia o token corretamente (não adiciona Content-Type para FormData)
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoId}/anexos`, {
        method: 'POST',
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

  // Função para calcular dias do período considerando mês comercial (30 dias)
  // e excluindo o último dia do contrato (data de término não é faturada)
  const calcularDiasMesComercial = (dataInicio: string, dataFim: string, dataVigenciaFim?: string): number => {
    const inicio = new Date(dataInicio + 'T00:00:00');
    let fim = new Date(dataFim + 'T00:00:00');
    
    // Se o período termina na data de vigência fim do contrato,
    // não consideramos o último dia (dia de encerramento não é faturado)
    if (dataVigenciaFim) {
      const vigenciaFim = new Date(dataVigenciaFim + 'T00:00:00');
      // Se a data fim é igual à data de vigência fim, ajustamos para o dia anterior
      if (fim.getTime() === vigenciaFim.getTime()) {
        fim = new Date(fim.getTime() - 86400000); // Subtrai 1 dia (24h em ms)
      }
    }
    
    // Verifica se é um mês completo (do dia 1 ao último dia do mês)
    const anoInicio = inicio.getFullYear();
    const mesInicio = inicio.getMonth(); // 0-11
    const diaInicio = inicio.getDate();
    
    const anoFim = fim.getFullYear();
    const mesFim = fim.getMonth();
    const diaFim = fim.getDate();
    const diaFimCom = diaFimComercial(anoFim, mesFim, diaFim);
    let dias = 0;

    if (anoInicio === anoFim && mesInicio === mesFim) {
      dias = diaFimCom - diaInicio + 1;
    } else {
      const diasPrimeiroMes = Math.min(30 - diaInicio + 1, 30);
      let mesesCompletos = 0;
      if (anoFim > anoInicio || mesFim > mesInicio + 1) {
        mesesCompletos = (anoFim - anoInicio) * 12 + (mesFim - mesInicio - 1);
      }
      dias = diasPrimeiroMes + (mesesCompletos * 30) + diaFimCom;
    }

    return Math.max(0, Math.min(dias, 360));
  };

  const replicarMedicaoAnterior = async () => {
    const ultimaMedicao = [...medicoes].sort((a, b) => b.numero_medicao - a.numero_medicao)[0];
    if (!ultimaMedicao) return;
    setCarregandoReplicar(true);
    try {
      const [detRes, discRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${ultimaMedicao.id}`),
        authFetch(`${API_URL}/api/contratos/medicoes/${ultimaMedicao.id}/discriminacoes`),
      ]);
      const det = detRes.ok ? await detRes.json() : null;
      const discs = discRes.ok ? await discRes.json() : [];

      let novosItens = novaMedicao.itens;
      if (det?.itens?.length) {
        if (usarItensCronograma) {
          novosItens = itensCronograma.map(ic => {
            const prev = det.itens.find((i: any) => i.item_cronograma_id === ic.id);
            const qtd = prev?.quantidade_medida || 0;
            return { item_cronograma_id: ic.id, quantidade_medida: qtd, modo_input: 'quantidade' as const, valor_override: Math.floor(Math.round(qtd * 100) * Math.round(Number(ic.valor_unitario) * 100) / 100) / 100 };
          });
        } else if (!isServicoContinuado) {
          novosItens = etapas.filter((e: Etapa) => e.status !== 'CONCLUIDA').map((e: Etapa) => {
            const prev = det.itens.find((i: any) => i.etapa_id === e.id);
            return { etapa_id: e.id, percentual_executado_atual: prev?.percentual_executado_atual || 0, valor_executado_atual: prev?.valor_executado_atual, modo_input: 'percentual' as const };
          });
        }
      }

      setNovaMedicao(prev => ({
        ...prev,
        observacoes: det?.fornecedor_observacoes || ultimaMedicao.fornecedor_observacoes || '',
        valor_medido: isServicoContinuado ? String(ultimaMedicao.valor_medido ?? '') : prev.valor_medido,
        nota_fiscal_valor: String(ultimaMedicao.nota_fiscal_valor ?? ''),
        itens: novosItens,
      }));

      if (discs?.length) {
        setDiscriminacoes(discs.map((d: any) => ({ descricao: d.descricao, valor: Number(d.valor), percentual: Number(d.percentual) })));
      }
    } catch (e) {
      console.error('Erro ao replicar medição anterior', e);
    } finally {
      setCarregandoReplicar(false);
    }
  };

  // Detecta "buraco" entre o fim da última medição (ou início da vigência) e o
  // início do novo período. Esse intervalo não é contado como executado no
  // boletim (o físico deriva do medido), então o fornecedor deve confirmar que
  // realmente não houve serviço no intervalo. Retorna a mensagem ou null.
  const verificarGapMedicao = (): string | null => {
    if (!novaMedicao.periodo_inicio) return null;
    const toDate = (s: string) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
    const inicio = toDate(novaMedicao.periodo_inicio);
    const validas = medicoes.filter(
      (m) =>
        m.periodo_fim &&
        !['REJEITADA', 'REPROVADA', 'CANCELADA', 'RASCUNHO'].includes(
          (m.status || '').toUpperCase(),
        ),
    );
    let referencia: Date | null = null;
    if (validas.length > 0) {
      const ultimoFim = validas
        .map((m) => toDate(m.periodo_fim as string).getTime())
        .reduce((a, b) => Math.max(a, b), 0);
      referencia = new Date(ultimoFim);
      referencia.setUTCDate(referencia.getUTCDate() + 1);
    } else if (contrato?.data_vigencia_inicio) {
      referencia = toDate(contrato.data_vigencia_inicio as string);
    }
    if (!referencia) return null;
    const diffDias = Math.round((inicio.getTime() - referencia.getTime()) / 86400000);
    if (diffDias > 2) {
      const refStr = referencia.toISOString().slice(0, 10);
      return (
        `Existe um intervalo SEM medição entre ${formatarData(refStr)} e ` +
        `${formatarData(novaMedicao.periodo_inicio)} (${diffDias} dias).\n\n` +
        `Esse período NÃO será contado como executado no boletim. Confirme que o ` +
        `serviço realmente não foi prestado nesse intervalo.\n\nDeseja continuar mesmo assim?`
      );
    }
    return null;
  };

  const handleCriarMedicao = async () => {
    if (!fornecedor) return;
    setSubmitting(true);
    try {
      if (!novaMedicao.periodo_inicio || !novaMedicao.periodo_fim) {
        alert('Informe o período de início e fim da medição');
        setSubmitting(false);
        return;
      }

      // Validar que período da medição não ultrapassa a data de vigência fim do contrato
      if (contrato?.data_vigencia_fim) {
        const dataFimPeriodo = new Date(novaMedicao.periodo_fim);
        const dataVigenciaFim = new Date(contrato.data_vigencia_fim);
        if (dataFimPeriodo > dataVigenciaFim) {
          alert(`O período de medição não pode ultrapassar a data de vigência do contrato.\n\nPeríodo informado: ${formatarData(novaMedicao.periodo_fim)}\nVigência do contrato: ${formatarData(contrato.data_vigencia_fim)}`);
          setSubmitting(false);
          return;
        }
      }

      // Aviso de "gap": período que pula um intervalo sem medição (não conta como executado)
      const gapMsg = verificarGapMedicao();
      if (gapMsg && !window.confirm(gapMsg)) {
        setSubmitting(false);
        return;
      }

      const payload: any = {
        periodo_inicio: novaMedicao.periodo_inicio || undefined,
        periodo_fim: novaMedicao.periodo_fim || undefined,
        competencia: novaMedicao.competencia || undefined,
        observacoes: novaMedicao.observacoes || undefined,
        nota_fiscal_numero: novaMedicao.nota_fiscal_numero || undefined,
        nota_fiscal_valor: novaMedicao.nota_fiscal_valor ? parseValorDecimal(novaMedicao.nota_fiscal_valor) : undefined,
        nota_fiscal_data: novaMedicao.nota_fiscal_data || undefined,
        fornecedor_id: fornecedor.id,
        fornecedor_nome: fornecedor.razao_social || fornecedor.nome,
      };

      if (isServicoContinuado) {
        const valor = parseFloat(novaMedicao.valor_medido) || 0;
        if (valor <= 0) { alert('Informe o valor medido'); setSubmitting(false); return; }
        if (resumo && valor > resumo.saldo_disponivel + 0.01) {
          alert(`O valor da medição (${formatarMoeda(valor)}) excede o saldo disponível (${formatarMoeda(resumo.saldo_disponivel)}).`);
          setSubmitting(false); return;
        }
        payload.valor_medido = valor;
      } else if (usarItensCronograma) {
        const itensComQtd = novaMedicao.itens
          .filter((i): i is { item_cronograma_id: string; quantidade_medida: number; valor_override?: number } => 'item_cronograma_id' in i && Number((i as any).quantidade_medida) > 0)
          .map(i => ({
            item_cronograma_id: i.item_cronograma_id,
            quantidade_medida: Number(i.quantidade_medida),
            valor_medido_override: i.valor_override,
          }));
        if (itensComQtd.length === 0) { alert('Informe a quantidade medida em pelo menos um item'); setSubmitting(false); return; }
        // Validar que não há mistura de tipos (mensal vs quantidade)
        const itensMensaisNoSubmit = itensComQtd.filter(item => {
          const ic = itensCronograma.find(c => c.id === item.item_cronograma_id);
          return ic?.unidade_medida === 'MENSAL';
        });
        if (itensMensaisNoSubmit.length > 0 && itensMensaisNoSubmit.length < itensComQtd.length) {
          alert('Não é possível misturar itens mensais com itens medidos por quantidade na mesma medição.\n\nCrie uma medição separada para os itens de cada tipo.');
          setSubmitting(false);
          return;
        }
        if (resumo) {
          const totalMedicao = itensComQtd.reduce((acc, item) => {
            const ic = itensCronograma.find(i => i.id === item.item_cronograma_id);
            return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0);
          }, 0);
          if (totalMedicao > resumo.saldo_disponivel + 0.01) { alert(`O valor da medição (${formatarMoeda(totalMedicao)}) excede o saldo disponível (${formatarMoeda(resumo.saldo_disponivel)}).`); setSubmitting(false); return; }
        }
        payload.itens = itensComQtd;
      } else {
        const itensComValor = novaMedicao.itens
          .filter((i): i is ItemMedicaoEtapaState => 'etapa_id' in i && (i.percentual_executado_atual > 0 || (i.valor_executado_atual != null && i.valor_executado_atual > 0)))
          .map(i => ({ etapa_id: i.etapa_id, percentual_executado_atual: i.percentual_executado_atual || 0, valor_executado_atual: i.valor_executado_atual || undefined, itens_etapa_medidos: i.itens_etapa_medidos || undefined }));
        if (itensComValor.length === 0) { alert('Informe o percentual ou valor executado em pelo menos uma etapa'); setSubmitting(false); return; }

        if (resumo) {
          const totalMedicao = novaMedicao.itens.reduce((acc, item, idx) => {
            const etapa = etapas[idx]; if (!etapa || !('etapa_id' in item)) return acc;
            return acc + valorItemEtapaMedicao(item, etapa);
          }, 0);
          if (totalMedicao > resumo.saldo_disponivel + 0.01) { alert(`O valor da medição (${formatarMoeda(totalMedicao)}) excede o saldo disponível do contrato (${formatarMoeda(resumo.saldo_disponivel)}).`); setSubmitting(false); return; }
        }

        const etapasCompr = resumo?.etapas_comprometidas || {};
        for (let idx = 0; idx < novaMedicao.itens.length; idx++) {
          const item = novaMedicao.itens[idx]; const etapa = etapas[idx]; if (!etapa || !item || !('etapa_id' in item)) continue;
          const percAprovado = Number(etapa.percentual_executado); const percEmTransito = etapasCompr[etapa.id] || 0; const restante = 100 - percAprovado - percEmTransito;
          const valorUsado = valorItemEtapaMedicao(item, etapa);
          const saldoValorEtapa = valorSaldoEtapa(etapa, percEmTransito);
          const percUsado = (item.modo_input === 'valor' || item.modo_input === 'itens') && Number(etapa.valor_previsto) > 0 ? ((item.valor_executado_atual || 0) / Number(etapa.valor_previsto)) * 100 : item.percentual_executado_atual;
          if (valorUsado > saldoValorEtapa + 0.01) { alert(`A etapa "${etapa.descricao}" tem ${formatarMoeda(saldoValorEtapa)} disponivel, mas voce informou ${formatarMoeda(valorUsado)}.`); setSubmitting(false); return; }
          if (percUsado > restante + 0.01) { alert(`A etapa "${etapa.descricao}" tem ${restante.toFixed(1)}% disponível, mas você informou ${percUsado.toFixed(1)}%.`); setSubmitting(false); return; }
        }
        payload.itens = itensComValor;
      }

      let res;
      if (medicaoParaEditar) {
        // Atualizar medição existente
        res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoParaEditar.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        // Criar nova medição
        res = await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const medicaoSalva = await res.json();
        if (discriminacoes.length > 0 && medicaoSalva?.id) {
          try { await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoSalva.id}/discriminacoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fornecedor_id: fornecedor.id, itens: discriminacoes }) }); } catch { }
        }
        if (medicaoSalva?.id) {
          if (anexosReaproveitados.length > 0) { await uploadAnexosReaproveitados(medicaoSalva.id); }
          if (arquivosPendentes.length > 0) { await uploadArquivosPendentes(medicaoSalva.id); }
        }
        setModalNovaMedicao(false);
        setNovaMedicao({ periodo_inicio: '', periodo_fim: '', competencia: '', observacoes: '', nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '', valor_medido: '', itens: [] });
        setDiscriminacoes([]); setArquivosPendentes([]); setAnexosReaproveitados([]); setMedicaoParaEditar(null); carregarDados();
        
        if (medicaoParaEditar) {
          alert('Medição atualizada com sucesso! Clique em "Submeter" para reenviar.');
        }
      } else {
        const err = await res.json(); alert(err.message || `Erro ao ${medicaoParaEditar ? 'atualizar' : 'criar'} medição`);
      }
    } catch (error) {
      alert(`Erro ao ${medicaoParaEditar ? 'atualizar' : 'criar'} medição`);
    } finally {
      setSubmitting(false);
    }
  };

  // Criar medição E submeter em um único passo (botão "Enviar para Ateste")
  const handleCriarESubmeter = async () => {
    if (!fornecedor) return;
    setSubmitting(true);
    try {
      if (!novaMedicao.periodo_inicio || !novaMedicao.periodo_fim) {
        alert('Informe o período de início e fim da medição');
        setSubmitting(false);
        return;
      }
      if (discriminacoes.length === 0) {
        alert('A discriminação de despesas é obrigatória antes de enviar para ateste.');
        setSubmitting(false);
        return;
      }

      // Validar que período da medição não ultrapassa a data de vigência fim do contrato
      if (contrato?.data_vigencia_fim) {
        const dataFimPeriodo = new Date(novaMedicao.periodo_fim);
        const dataVigenciaFim = new Date(contrato.data_vigencia_fim);
        if (dataFimPeriodo > dataVigenciaFim) {
          alert(`O período de medição não pode ultrapassar a data de vigência do contrato.\n\nPeríodo informado: ${formatarData(novaMedicao.periodo_fim)}\nVigência do contrato: ${formatarData(contrato.data_vigencia_fim)}`);
          setSubmitting(false);
          return;
        }
      }

      // Aviso de "gap": período que pula um intervalo sem medição (não conta como executado)
      const gapMsg = verificarGapMedicao();
      if (gapMsg && !window.confirm(gapMsg)) {
        setSubmitting(false);
        return;
      }

      const payload: any = {
        periodo_inicio: novaMedicao.periodo_inicio || undefined,
        periodo_fim: novaMedicao.periodo_fim || undefined,
        competencia: novaMedicao.competencia || undefined,
        observacoes: novaMedicao.observacoes || undefined,
        nota_fiscal_numero: novaMedicao.nota_fiscal_numero || undefined,
        nota_fiscal_valor: novaMedicao.nota_fiscal_valor ? parseValorDecimal(novaMedicao.nota_fiscal_valor) : undefined,
        nota_fiscal_data: novaMedicao.nota_fiscal_data || undefined,
        fornecedor_id: fornecedor.id,
        fornecedor_nome: fornecedor.razao_social || fornecedor.nome,
      };

      if (isServicoContinuado) {
        const valor = parseFloat(novaMedicao.valor_medido) || 0;
        if (valor <= 0) { alert('Informe o valor medido'); setSubmitting(false); return; }
        if (resumo && valor > resumo.saldo_disponivel + 0.01) {
          alert(`O valor da medição (${formatarMoeda(valor)}) excede o saldo disponível (${formatarMoeda(resumo.saldo_disponivel)}).`);
          setSubmitting(false); return;
        }
        payload.valor_medido = valor;
      } else if (usarItensCronograma) {
        const itensComQtd = novaMedicao.itens
          .filter((i): i is { item_cronograma_id: string; quantidade_medida: number; valor_override?: number } => 'item_cronograma_id' in i && Number((i as any).quantidade_medida) > 0)
          .map(i => ({
            item_cronograma_id: i.item_cronograma_id,
            quantidade_medida: Number(i.quantidade_medida),
            valor_medido_override: i.valor_override,
          }));
        if (itensComQtd.length === 0) { alert('Informe a quantidade medida em pelo menos um item'); setSubmitting(false); return; }
        // Validar que não há mistura de tipos (mensal vs quantidade)
        const itensMensaisNoSubmit = itensComQtd.filter(item => {
          const ic = itensCronograma.find(c => c.id === item.item_cronograma_id);
          return ic?.unidade_medida === 'MENSAL';
        });
        if (itensMensaisNoSubmit.length > 0 && itensMensaisNoSubmit.length < itensComQtd.length) {
          alert('Não é possível misturar itens mensais com itens medidos por quantidade na mesma medição.\n\nCrie uma medição separada para os itens de cada tipo.');
          setSubmitting(false);
          return;
        }
        if (resumo) {
          const totalMedicao = itensComQtd.reduce((acc, item) => {
            const ic = itensCronograma.find(i => i.id === item.item_cronograma_id);
            return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0);
          }, 0);
          if (totalMedicao > resumo.saldo_disponivel + 0.01) { alert(`O valor da medição (${formatarMoeda(totalMedicao)}) excede o saldo disponível (${formatarMoeda(resumo.saldo_disponivel)}).`); setSubmitting(false); return; }
        }
        payload.itens = itensComQtd;
      } else {
        const itensComValor = novaMedicao.itens
          .filter((i): i is ItemMedicaoEtapaState => 'etapa_id' in i && (i.percentual_executado_atual > 0 || (i.valor_executado_atual != null && i.valor_executado_atual > 0)))
          .map(i => ({ etapa_id: i.etapa_id, percentual_executado_atual: i.percentual_executado_atual || 0, valor_executado_atual: i.valor_executado_atual || undefined, itens_etapa_medidos: i.itens_etapa_medidos || undefined }));
        if (itensComValor.length === 0) { alert('Informe o percentual ou valor executado em pelo menos uma etapa'); setSubmitting(false); return; }

        if (resumo) {
          const totalMedicao = novaMedicao.itens.reduce((acc, item, idx) => {
            const etapa = etapas[idx]; if (!etapa || !('etapa_id' in item)) return acc;
            return acc + valorItemEtapaMedicao(item, etapa);
          }, 0);
          if (totalMedicao > resumo.saldo_disponivel + 0.01) { alert(`O valor da medição (${formatarMoeda(totalMedicao)}) excede o saldo disponível do contrato (${formatarMoeda(resumo.saldo_disponivel)}).`); setSubmitting(false); return; }
        }

        const etapasComprCS = resumo?.etapas_comprometidas || {};
        for (let idx = 0; idx < novaMedicao.itens.length; idx++) {
          const item = novaMedicao.itens[idx]; const etapa = etapas[idx]; if (!etapa || !item || !('etapa_id' in item)) continue;
          const percAprovado = Number(etapa.percentual_executado); const percEmTransito = etapasComprCS[etapa.id] || 0; const restante = 100 - percAprovado - percEmTransito;
          const valorUsado = valorItemEtapaMedicao(item, etapa);
          const saldoValorEtapa = valorSaldoEtapa(etapa, percEmTransito);
          const percUsado = (item.modo_input === 'valor' || item.modo_input === 'itens') && Number(etapa.valor_previsto) > 0 ? ((item.valor_executado_atual || 0) / Number(etapa.valor_previsto)) * 100 : item.percentual_executado_atual;
          if (valorUsado > saldoValorEtapa + 0.01) { alert(`A etapa "${etapa.descricao}" tem ${formatarMoeda(saldoValorEtapa)} disponivel, mas voce informou ${formatarMoeda(valorUsado)}.`); setSubmitting(false); return; }
          if (percUsado > restante + 0.01) { alert(`A etapa "${etapa.descricao}" tem ${restante.toFixed(1)}% disponível, mas você informou ${percUsado.toFixed(1)}%.`); setSubmitting(false); return; }
        }
        payload.itens = itensComValor;
      }

      const resCriar = medicaoParaEditar
        ? await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoParaEditar.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/medicoes`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });

      if (!resCriar.ok) {
        const err = await resCriar.json();
        alert(err.message || `Erro ao ${medicaoParaEditar ? 'atualizar' : 'criar'} medição`);
        setSubmitting(false);
        return;
      }
      const medicaoCriada = await resCriar.json();

      if (discriminacoes.length > 0 && medicaoCriada?.id) {
        try { await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoCriada.id}/discriminacoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fornecedor_id: fornecedor.id, itens: discriminacoes }) }); } catch { }
      }
      if (medicaoCriada?.id) {
        if (anexosReaproveitados.length > 0) { await uploadAnexosReaproveitados(medicaoCriada.id); }
        if (arquivosPendentes.length > 0) { await uploadArquivosPendentes(medicaoCriada.id); }
      }

      // Abrir modal OTP para assinatura digital antes de submeter
      // Delay to allow Radix to fully unmount the creation dialog before opening OTP,
      // preventing pointer-events:none from getting stuck on body.
      setModalNovaMedicao(false);
      setNovaMedicao({ periodo_inicio: '', periodo_fim: '', competencia: '', observacoes: '', nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '', valor_medido: '', itens: [] });
      setDiscriminacoes([]); setArquivosPendentes([]); setAnexosReaproveitados([]); setMedicaoParaEditar(null);
      const medicaoIdParaOtp = medicaoCriada.id;
      setTimeout(() => { abrirModalOtp(medicaoIdParaOtp); }, 150);
    } catch (error) {
      alert(`Erro ao ${medicaoParaEditar ? 'atualizar' : 'criar'} medição`);
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
    // Ao invés de submeter direto, abre modal OTP
    setModalSubmeter(false);
    abrirModalOtp(medicaoParaSubmeter.id);
    setMedicaoParaSubmeter(null);
    setDadosSubmissao({ fornecedor_observacoes: '', nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '' });
  };

  // ============ FUNÇÕES DO MODAL OTP ============

  const abrirModalOtp = (medicaoId: string) => {
    setOtpMedicaoId(medicaoId);
    setOtpEtapa('info');
    setOtpCodigo('');
    setOtpCanais(null);
    setOtpErro(null);
    setOtpCodigoValidacao(null);
    setOtpLoading(false);
    setModalOtp(true);
  };

  const handleEnviarOtp = async () => {
    if (!otpMedicaoId || !fornecedor) return;
    setOtpLoading(true);
    setOtpErro(null);
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${otpMedicaoId}/solicitar-otp-assinatura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedor_id: fornecedor.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        setOtpErro(err.message || 'Erro ao enviar código de verificação');
        setOtpLoading(false);
        return;
      }
      const data = await res.json();
      setOtpCanais(data);
      setOtpEtapa('codigo');
    } catch {
      setOtpErro('Erro de conexão ao enviar código');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleValidarOtp = async () => {
    if (!otpMedicaoId || !fornecedor || !otpCodigo) return;
    setOtpLoading(true);
    setOtpErro(null);
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${otpMedicaoId}/validar-otp-assinatura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedor_id: fornecedor.id, codigo: otpCodigo }),
      });
      if (!res.ok) {
        const err = await res.json();
        setOtpErro(err.message || 'Código incorreto ou expirado');
        setOtpLoading(false);
        return;
      }
      const data = await res.json();
      setOtpCodigoValidacao(data.codigo_formatado || data.codigo_validacao);
      setOtpEtapa('sucesso');

      await baixarPdfArmazenado(otpMedicaoId);

      carregarDados();
    } catch {
      setOtpErro('Erro de conexão ao validar código');
    } finally {
      setOtpLoading(false);
    }
  };

  const baixarPdfArmazenado = async (medicaoId: string): Promise<boolean> => {
    try {
      const resBoletim = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoId}/boletim-oficial?fornecedorId=${fornecedor?.id || ''}`);
      if (!resBoletim.ok) return false;

      const boletim = await resBoletim.json();
      if (!boletim?.pdf_url) return false;

      const pdfUrl = boletim.pdf_url.startsWith('http')
        ? boletim.pdf_url
        : `${API_URL}${boletim.pdf_url}`;

      const arquivoRes = await fetch(pdfUrl);
      if (!arquivoRes.ok) return false;

      const pdfBlob = await arquivoRes.blob();
      const objectUrl = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = boletim.filename || `boletim_medicao_${medicaoId}.pdf`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        window.URL.revokeObjectURL(objectUrl);
      }, 1000);
      return true;
    } catch {
      return false;
    }
  };

  const abrirModalNovaMedicao = async () => {
    setNovaMedicao({
      periodo_inicio: '', periodo_fim: '', competencia: '', observacoes: '',
      nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '',
      valor_medido: '',
      itens: isServicoContinuado ? [] : usarItensCronograma
        ? itensCronograma.map(i => ({ item_cronograma_id: i.id, quantidade_medida: 0 }))
        : etapas.map(e => ({ etapa_id: e.id, percentual_executado_atual: 0, valor_executado_atual: 0, modo_input: 'percentual' as const })),
    });
    setArquivosPendentes([]);
    setAnexosReaproveitados([]);
    setDiscriminacoes([]);
    setModalNovaMedicao(true);
  };

  // Reaproveitar despesas do último mês: usa apenas % da última medição aprovada e recalcula valores pela medição atual
  const reaproveitarDespesasUltimoMes = async () => {
    const valorMedidoAtual = isServicoContinuado
      ? (parseFloat(novaMedicao.valor_medido) || 0)
      : usarItensCronograma
        ? novaMedicao.itens.reduce((acc, item) => {
            if (!('item_cronograma_id' in item)) return acc;
            const ic = itensCronograma.find(i => i.id === item.item_cronograma_id);
            return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0);
          }, 0)
        : novaMedicao.itens.reduce((acc, item, idx) => {
            const etapa = etapas[idx]; if (!etapa || !('etapa_id' in item)) return acc;
            return acc + valorItemEtapaMedicao(item, etapa);
          }, 0);
    // Base da discriminação: valor da NF quando disponível, senão valor medido
    const valorBaseDiscriminacao = escolherValorBaseDiscriminacao(novaMedicao.nota_fiscal_valor, valorMedidoAtual);

    if (valorBaseDiscriminacao <= 0) {
      alert(isServicoContinuado ? 'Informe o valor medido ou da nota fiscal antes de reaproveitar.' : 'Preencha os itens da planilha ou valor da NF antes de reaproveitar.');
      return;
    }
    if (medicoes.length === 0) {
      alert('Não há medições anteriores para reaproveitar.');
      return;
    }

    try {
      const fId = fornecedor?.id || '';
      const ultimaMedicao = medicoes[medicoes.length - 1];
      const sugRes = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${ultimaMedicao.id}/discriminacoes/sugestao?fornecedorId=${fId}`);
      if (!sugRes.ok) return;
      const sugestoes = await sugRes.json();
      if (!sugestoes || sugestoes.length === 0) {
        alert('Nenhuma medição anterior possui discriminação de despesas para reaproveitar.');
        return;
      }
      // Usa apenas descricao e % da última medição; recalcula valor pela medição atual
      setDiscriminacoes(sugestoes.map((s: any) => {
        const perc = Number(s.percentual) || 0;
        const valor = (perc / 100) * valorBaseDiscriminacao;
        return {
          descricao: s.descricao || '',
          percentual: perc,
          valor: Math.round(valor * 100) / 100,
        };
      }));
    } catch {
      alert('Erro ao buscar despesas da última medição.');
    }
  };

  const salvarItensMedicao = async () => {
    if (!medicaoDetalhe || !fornecedor) return;
    const itens = medicaoDetalhe.itens || [];
    const payload = itens.map((item: any) => ({
      item_id: item.id,
      percentual_executado_atual: itensEditados[item.id]?.percentual_executado_atual ?? Number(item.percentual_executado_atual),
      valor_executado_atual: itensEditados[item.id]?.valor_executado_atual ?? Number(item.valor_medido),
    }));
    setSubmitting(true);
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoDetalhe.id}/itens`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedor_id: fornecedor.id, itens: payload }),
      });
      if (res.ok) {
        const atualizada = await res.json();
        setMedicaoDetalhe(atualizada);
        setEditandoItensDetalhe(false);
        setItensEditados({});
        carregarDados();
      } else {
        const err = await res.json();
        alert(err?.message || 'Erro ao salvar itens.');
      }
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar itens.');
    } finally {
      setSubmitting(false);
    }
  };

  // Upload dos arquivos pendentes após criação da medição
  const uploadArquivosPendentes = async (medicaoId: string) => {
    if (arquivosPendentes.length === 0 || !fornecedor) return;
    for (const arq of arquivosPendentes) {
      try {
        const formData = new FormData();
        formData.append('file', arq.file);
        formData.append('tipo', arq.tipo);
        formData.append('fornecedor_id', fornecedor.id);
        formData.append('fornecedor_nome', fornecedor.razao_social || fornecedor.nome);
        if (arq.descricao) formData.append('descricao', arq.descricao);
        await authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicaoId}/anexos`, {
          method: 'POST',
          body: formData,
        });
      } catch (err) {
        console.error('Erro ao enviar anexo pendente:', err);
      }
    }
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

  const abrirDetalheMedicao = async (medicao: Medicao) => {
    setModalDetalhe(true);
    setMedicaoDetalhe(medicao);
    setDiscriminacoesDetalhe([]);
    setEditandoItensDetalhe(false);
    setItensEditados({});

    try {
      const [medRes, dRes] = await Promise.all([
        authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicao.id}`),
        authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicao.id}/discriminacoes?fornecedorId=${fornecedor?.id || ''}`),
      ]);

      if (medRes.ok) setMedicaoDetalhe(await medRes.json());
      if (dRes.ok) setDiscriminacoesDetalhe(await dRes.json());
    } catch {}
  };

  // Carregar dados da medição devolvida para edição
  const carregarDadosMedicao = async (medicao: Medicao) => {
    try {
      // Buscar itens da medição
      const fornecedorData = localStorage.getItem('fornecedor');
      const fornecedorAtual = fornecedor || (fornecedorData ? JSON.parse(fornecedorData) : null);
      const fornecedorIdAtual = fornecedorAtual?.id || '';
      const [res, discriminacoesRes] = await Promise.all([
        authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicao.id}`),
        authFetch(`${API_URL}/api/fornecedor/contratos/medicoes/${medicao.id}/discriminacoes?fornecedorId=${fornecedorIdAtual}`),
      ]);
      if (res.ok) {
        const medicaoCompleta = await res.json();
        const discriminacoesExistentes = discriminacoesRes.ok
          ? await discriminacoesRes.json()
          : [];
        
        // Preparar nova medição com os dados da devolvida
        setNovaMedicao({
          periodo_inicio: medicao.periodo_inicio,
          periodo_fim: medicao.periodo_fim,
          competencia: medicao.competencia || '',
          observacoes: medicao.fornecedor_observacoes || '',
          nota_fiscal_numero: medicaoCompleta.nota_fiscal_numero || medicao.nota_fiscal_numero || '',
          nota_fiscal_valor: medicaoCompleta.nota_fiscal_valor ? String(medicaoCompleta.nota_fiscal_valor) : (medicao.nota_fiscal_valor ? String(medicao.nota_fiscal_valor) : ''),
          nota_fiscal_data: medicaoCompleta.nota_fiscal_data || medicao.nota_fiscal_data || '',
          valor_medido: String(medicaoCompleta.valor_medido || medicao.valor_medido || ''),
          itens: medicaoCompleta.itens?.map((item: any) => {
            if (item.tipo_item === 'item_cronograma') {
              return {
                item_cronograma_id: item.item_cronograma_id,
                quantidade_medida: item.quantidade_medida || 0,
                modo_input: 'quantidade',
              };
            } else {
              return {
                etapa_id: item.etapa_id,
                percentual_executado_atual: item.percentual_executado_atual || 0,
                valor_executado_atual: item.valor_executado_atual || 0,
                modo_input: 'percentual',
              };
            }
          }) || [],
        });
        
        // Setar a medição original para atualização
        setDiscriminacoes((discriminacoesExistentes || []).map((item: any) => ({
          descricao: item.descricao || '',
          valor: Number(item.valor) || 0,
          percentual: Number(item.percentual) || 0,
        })));
        setMedicaoParaEditar(medicao);
        await reaproveitarAnexosExistentes(medicao.id);
        await carregarExecucaoFinanceira(medicao.id);
      }
    } catch (error) {
      console.error('Erro ao carregar medição:', error);
      alert('Erro ao carregar dados da medição para edição.');
    }
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
    <div className="space-y-4">
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
        {!isServicoContinuado && (
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
        )}
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
                <p className="text-xs text-gray-500">Saldo Disponivel</p>
                <p className={`text-lg font-bold ${resumo.saldo_disponivel > 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatarMoeda(resumo.saldo_disponivel)}</p>
                {(resumo.valor_em_analise || 0) > 0 && (
                  <p className="text-xs text-amber-600">Em analise: {formatarMoeda(resumo.valor_em_analise || 0)}</p>
                )}
              </div>
              {!isServicoContinuado && (
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-gray-500">Avanço Físico</p>
                <p className="text-lg font-bold text-purple-700">{Number(resumo.percentual_fisico_total || 0).toFixed(1)}%</p>
                <Progress value={resumo.percentual_fisico_total} className="mt-1 h-2" />
              </div>
              )}
              {!isServicoContinuado && (
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-xs text-gray-500">Etapas</p>
                <p className="text-lg font-bold text-orange-700">{resumo.etapas_concluidas}/{resumo.total_etapas}</p>
              </div>
              )}
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Medições Aprovadas</p>
                <p className="text-lg font-bold">{resumo.medicoes_aprovadas}/{resumo.total_medicoes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList>
          <TabsTrigger value="medicoes" className="gap-2">
            <FileText className="w-4 h-4" />Medições ({medicoes.length})
          </TabsTrigger>
          {!isServicoContinuado && (
          <TabsTrigger value="cronograma" className="gap-2">
            <TrendingUp className="w-4 h-4" />Cronograma ({usarItensCronograma ? itensCronograma.length : etapas.length})
          </TabsTrigger>
          )}
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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                asChild
                className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                <Link href={`/fornecedor/contratos/${contratoId}/medicao-chat`}>
                  <FileText className="w-4 h-4" />Assistente IA
                </Link>
              </Button>
              <Button onClick={() => contrato?.categoria === 'COMPRAS' ? setModalComprasAviso(true) : abrirModalNovaMedicao()} className="gap-2 bg-blue-600 hover:bg-blue-700" disabled={!isServicoContinuado && !temCronograma && contrato?.categoria !== 'COMPRAS'}>
                <Plus className="w-4 h-4" />Abrir Medição do Mês
              </Button>
            </div>
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
                const medicaoDevolvidaSuperada = medicao.status === 'DEVOLVIDA' && medicoes.some((outraMedicao) => outraMedicao.numero_medicao > medicao.numero_medicao);
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
                          {medicao.status === 'RASCUNHO' && (
                            <>
                              <Button size="sm" onClick={() => abrirModalSubmeter(medicao)} className="gap-1">
                                <Send className="w-3 h-3" />Submeter
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => handleExcluirMedicao(medicao)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                          {medicao.data_submissao && (
                            <Button size="sm" variant="outline" className="gap-1 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={async () => {
                              await baixarPdfArmazenado(medicao.id)
                            }}>
                              <FileDown className="w-3 h-3" />PDF - BOLETIM DE MEDIÇÃO
                            </Button>
                          )}
                          <Button size="sm" variant="outline" disabled={medicaoDevolvidaSuperada} title={medicaoDevolvidaSuperada ? 'Esta medição devolvida já foi substituída por uma medição posterior.' : undefined} onClick={async () => {
                            if (medicao.status === 'DEVOLVIDA') {
                              // Abrir modal de criação com dados da medição devolvida
                              await carregarDadosMedicao(medicao);
                              setModalNovaMedicao(true);
                            } else {
                              // Abrir modal de detalhes para outros status
                              await abrirDetalheMedicao(medicao);
                            }
                          }}>
                            {medicao.status === 'DEVOLVIDA' ? (
                              <>
                                <Edit className="w-3 h-3 mr-1" />{medicaoDevolvidaSuperada ? 'Corrigida' : 'Editar'}
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3 mr-1" />Ver
                              </>
                            )}
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
                        <span className={`px-2 py-0.5 rounded ${medicao.status === 'PARCIALMENTE_ATESTADA' ? 'bg-amber-200 text-amber-700' : medicao.ateste_data ? 'bg-yellow-200 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>
                          {medicao.status === 'PARCIALMENTE_ATESTADA' ? 'Ateste parcial' : medicao.ateste_data ? `Atestada ${formatarData(medicao.ateste_data)}` : 'Ateste Fiscal'}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-2 py-0.5 rounded ${medicao.data_aprovacao ? 'bg-green-200 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {medicao.data_aprovacao ? `Aprovada ${formatarData(medicao.data_aprovacao)}` : 'Aprovação'}
                        </span>
                      </div>

                      {/* Seção de Anexos (Fotos e Documentos) */}
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-gray-500 mb-1">Evidências e Documentos</p>
                          <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />{anexos[medicao.id] && anexos[medicao.id].length > 0 && (
                              <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0">{anexos[medicao.id].length}</Badge>
                            )}
                          </p>
                          {(medicao.status === 'RASCUNHO' || medicao.status === 'DEVOLVIDA' || medicao.status === 'PARCIALMENTE_ATESTADA') && (
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
                                      const titulo = prompt('Título da foto (ex: Fundação concluída, Alvenaria 2º pavimento):');
                                      if (titulo === null) return;
                                      for (const file of Array.from(files)) {
                                        await handleUploadAnexo(medicao.id, file, 'FOTO', titulo || undefined);
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
                                      const titulo = prompt('Título do documento (ex: Nota Fiscal, Relatório de medição):');
                                      if (titulo === null) return;
                                      await handleUploadAnexo(medicao.id, files[0], 'DOCUMENTO', titulo || undefined);
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
                                  {anexo.descricao && <p className="text-xs font-medium text-gray-700 truncate">{anexo.descricao}</p>}
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
                                  {(medicao.status === 'RASCUNHO' || medicao.status === 'DEVOLVIDA' || medicao.status === 'PARCIALMENTE_ATESTADA') && (
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
              <CardDescription>{usarItensCronograma ? 'Itens do cronograma com quantidade e valor unitário' : 'Etapas da obra/serviço com percentual e valor previsto'}</CardDescription>
            </CardHeader>
            <CardContent>
              {usarItensCronograma ? (
                itensCronograma.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Nenhum item cadastrado pelo órgão</p>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead className="min-w-[180px] max-w-[260px]">Descrição</TableHead>
                        <TableHead className="text-center min-w-[120px]">Unidade</TableHead>
                        <TableHead className="text-center min-w-[100px]">Frequência</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Qtd.</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Vl. Unit.</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Nº exec.</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Vl./freq.</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Vl. Total</TableHead>
                        <TableHead className="text-center whitespace-nowrap">Medido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...itensCronograma].sort((a, b) => a.numero_item - b.numero_item).map((ic) => (
                        <TableRow key={ic.id}>
                          <TableCell className="font-medium">{ic.numero_item}</TableCell>
                          <TableCell className="min-w-[180px] max-w-[320px]">
                            <p className="text-sm whitespace-normal break-words">{ic.descricao}</p>
                          </TableCell>
                          <TableCell className="text-center text-sm">{textoUnidadeCronogramaNaTela(ic.unidade_medida)}</TableCell>
                          <TableCell className="text-center text-sm whitespace-nowrap">{textoFrequenciaNaTela(ic.frequencia_execucao)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{Number(ic.quantidade).toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatarMoeda(ic.valor_unitario)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{ic.quantidade_meses != null ? ic.quantidade_meses : '—'}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatarMoeda(ic.valor_mensal ?? (Number(ic.quantidade) * Number(ic.valor_unitario)))}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatarMoeda(ic.valor_total)}</TableCell>
                          <TableCell className="text-center text-blue-600 font-medium whitespace-nowrap">{Number(ic.quantidade_medida).toLocaleString('pt-BR')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )
              ) : etapas.length === 0 ? (
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

      {/* ============ PÁGINA: Nova Medição (Planilha Orçamentária) ============ */}
      {modalNovaMedicao && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="border-b bg-white px-6 py-3 flex items-center gap-3 shadow-sm flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setModalNovaMedicao(false);
                setMedicaoParaEditar(null);
                setNovaMedicao({ periodo_inicio: '', periodo_fim: '', competencia: '', observacoes: '', nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '', valor_medido: '', itens: [] });
                setDiscriminacoes([]);
                setArquivosPendentes([]);
                setAnexosReaproveitados([]);
                setTimeout(() => { document.body.style.pointerEvents = ''; }, 0);
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center justify-between flex-1">
              <div>
                <h2 className="text-xl font-semibold">
                  {medicaoParaEditar ? (
                    <>
                      Editar Medição #{medicaoParaEditar.numero_medicao}
                      <Badge className="ml-2 bg-amber-100 text-amber-800 text-xs">Devolvida</Badge>
                    </>
                  ) : (
                    <>Boletim de Medição #{(medicoes.length || 0) + 1}</>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {novaMedicao.periodo_inicio && novaMedicao.periodo_fim
                    ? `Período: ${formatarData(novaMedicao.periodo_inicio)} a ${formatarData(novaMedicao.periodo_fim)}`
                    : 'Informe o período e preencha a execução de cada item'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Valor da Medição</p>
                {(() => {
                  const totalMedicao = isServicoContinuado
                    ? (parseFloat(novaMedicao.valor_medido) || 0)
                    : usarItensCronograma
                      ? novaMedicao.itens.reduce((acc, item, idx) => {
                          if (!('item_cronograma_id' in item)) return acc;
                          const ic = itensCronograma.find(i => i.id === item.item_cronograma_id);
                          return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0);
                        }, 0)
                      : novaMedicao.itens.reduce((acc, item, idx) => {
                          const etapa = etapas[idx];
                          if (!etapa || !('etapa_id' in item)) return acc;
                          return acc + valorItemEtapaMedicao(item, etapa);
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
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {!medicaoParaEditar && medicoes.length > 0 && (() => {
              const ultima = [...medicoes].sort((a, b) => b.numero_medicao - a.numero_medicao)[0];
              return (
                <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <Copy className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-indigo-900">Replicar medição #{ultima.numero_medicao}</p>
                    <p className="text-xs text-indigo-700">Copia itens, valores e discriminações do boletim anterior. Preencha apenas o período e a nota fiscal.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={replicarMedicaoAnterior} disabled={carregandoReplicar}
                    className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 whitespace-nowrap flex-shrink-0">
                    {carregandoReplicar ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Copiando...</> : 'Copiar valores'}
                  </Button>
                </div>
              );
            })()}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border bg-orange-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-orange-700">Vigência do contrato</p>
                <p className="mt-1 text-sm font-semibold text-orange-900">
                  {contrato?.data_vigencia_inicio && contrato?.data_vigencia_fim
                    ? `${formatarData(contrato.data_vigencia_inicio)} a ${formatarData(contrato.data_vigencia_fim)}`
                    : '-'}
                </p>
              </div>
              <div className="rounded-lg border bg-blue-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Saldo disponível</p>
                <p className={`mt-1 text-sm font-semibold ${(resumo?.saldo_disponivel || 0) > 0 ? 'text-blue-900' : 'text-red-700'}`}>
                  {formatarMoeda(resumo?.saldo_disponivel || 0)}
                </p>
                {(resumo?.valor_em_analise || 0) > 0 && (
                  <p className="mt-1 text-xs text-amber-600">Em análise: {formatarMoeda(resumo?.valor_em_analise || 0)}</p>
                )}
              </div>
            </div>

            {/* Período */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Período Início *</Label>
                <Input type="date" value={novaMedicao.periodo_inicio}
                  onChange={(e) => {
                    const novoInicio = e.target.value;
                    setNovaMedicao({ ...novaMedicao, periodo_inicio: novoInicio });
                    // Recarregar execução financeira quando mudar o período
                    if (novoInicio && novaMedicao.periodo_fim) {
                      carregarExecucaoFinanceira(medicaoParaEditar?.id);
                    }
                  }} />
              </div>
              <div>
                <Label>Período Fim *</Label>
                <Input type="date" value={novaMedicao.periodo_fim}
                  onChange={(e) => {
                    const novoFim = e.target.value;
                    setNovaMedicao({ ...novaMedicao, periodo_fim: novoFim });
                    // Recarregar execução financeira quando mudar o período
                    if (novaMedicao.periodo_inicio && novoFim) {
                      carregarExecucaoFinanceira(medicaoParaEditar?.id);
                    }
                  }} />
              </div>
            </div>

            {/* Competência */}
            <div>
              <Label>Competência *</Label>
              <Input 
                value={novaMedicao.competencia}
                onChange={(e) => setNovaMedicao({ ...novaMedicao, competencia: e.target.value })}
                placeholder="Ex: FEVEREIRO/2026"
                className="uppercase"
              />
              <p className="text-xs text-gray-500 mt-1">
                Informe a competência no formato MÊS/ANO (ex: FEVEREIRO/2026)
              </p>
            </div>

            {/* Valor Medido (serviços continuados) */}
            {isServicoContinuado && (
              <div className="border rounded-lg p-4 bg-blue-50/30">
                <Label className="text-sm font-bold text-gray-700 mb-2 block">Valor Medido no Período (R$) *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={novaMedicao.valor_medido}
                  onChange={(e) => setNovaMedicao({ ...novaMedicao, valor_medido: e.target.value })}
                  placeholder="0,00"
                  className="max-w-xs text-lg font-medium"
                />
                {resumo && (
                  <p className="text-xs text-gray-500 mt-2">
                    Saldo disponível: {formatarMoeda(resumo.saldo_disponivel)} de {formatarMoeda(resumo.valor_global)}
                  </p>
                )}
              </div>
            )}

            {/* Planilha por Itens (quantidade medida) */}
            {!isServicoContinuado && usarItensCronograma && (
            <div className="border rounded-lg overflow-hidden">
              {/* Barra de ações: Proporcional */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b gap-3">
                <p className="text-xs text-gray-500">
                  Para períodos parciais (ex: 21 dias), use <strong>Proporcional</strong> ou informe o <strong>Valor R$</strong> diretamente.
                </p>
                <Button
                  type="button" variant="outline" size="sm"
                  disabled={!novaMedicao.periodo_inicio || !novaMedicao.periodo_fim}
                  title="Calcula a fração de dias do período em relação ao mês e preenche as quantidades proporcionalmente"
                  onClick={() => {
                    if (!novaMedicao.periodo_inicio || !novaMedicao.periodo_fim) return;
                    const diasPeriodo = calcularDiasMesComercial(novaMedicao.periodo_inicio, novaMedicao.periodo_fim, contrato?.data_vigencia_fim);
                    // Convenção de mês comercial: 30 dias (padrão em contratos públicos brasileiros)
                    const diasNoMes = 30;
                    const fator = Math.min(diasPeriodo / diasNoMes, 1);
                    const arredondar = contrato?.arredondar_calculo ?? true;
                    const valoresMensaisProporcionais = distribuirValoresMensaisPorTotal(
                      itensCronograma
                        .map((ic) => {
                          const qtdTotal = Number(ic.quantidade);
                          const qtdAprovada = Number(ic.quantidade_medida);
                          const emTransito = resumo?.itens_comprometidos?.[ic.id] || 0;
                          const saldo = qtdTotal - qtdAprovada - emTransito;
                          const isMensalProp = ic.unidade_medida === 'MENSAL';
                          const tipoItemProp = isMensalProp ? 'mensal' : 'quantidade';
                          return {
                            id: ic.id,
                            valorUnitario: Number(ic.valor_unitario),
                            quantidadeValor: Math.max(0, Math.min(fator, saldo)),
                            saldoFinanceiro: calcularSaldoFinanceiroItemCronograma(ic),
                            isMensalProp,
                            tipoItemProp,
                          };
                        })
                        .filter((ic) => ic.isMensalProp && (tipoMedicaoAtual === null || ic.tipoItemProp === tipoMedicaoAtual)),
                      arredondar,
                    );
                    const itens = itensCronograma.map((ic, idx) => {
                      const qtdTotal = Number(ic.quantidade);
                      const qtdAprovada = Number(ic.quantidade_medida);
                      const emTransito = resumo?.itens_comprometidos?.[ic.id] || 0;
                      const saldo = qtdTotal - qtdAprovada - emTransito;
                      const saldoFinanceiro = calcularSaldoFinanceiroItemCronograma(ic);
                      const isMensalProp = ic.unidade_medida === 'MENSAL';
                      const tipoItemProp = isMensalProp ? 'mensal' : 'quantidade';
                      // Se já há um tipo selecionado, não preencher itens de tipo diferente
                      if (tipoMedicaoAtual !== null && tipoItemProp !== tipoMedicaoAtual) {
                        return { item_cronograma_id: ic.id, quantidade_medida: 0, modo_input: 'quantidade' as const, valor_override: 0 };
                      }
                      const qtdProporcional = isMensalProp
                        ? Math.max(0, Math.min(Math.round(fator * 1000) / 1000, saldo))
                        : Math.min(Math.round(fator * saldo * 1000) / 1000, saldo);
                      const valorProporcional = isMensalProp
                        ? (valoresMensaisProporcionais.get(ic.id) || 0)
                        : aplicarRegraArredondamentoContrato(
                            qtdProporcional * Number(ic.valor_unitario),
                            arredondar,
                          );
                      const valorOverride = limitarValorAoSaldoFinanceiro(valorProporcional, saldoFinanceiro);
                      return {
                        item_cronograma_id: ic.id,
                        quantidade_medida: qtdProporcional,
                        modo_input: isMensalProp ? ('valor' as const) : ('quantidade' as const),
                        valor_override: valorOverride,
                      };
                    });
                    setNovaMedicao({ ...novaMedicao, itens });
                  }}
                  className="text-blue-700 border-blue-300 hover:bg-blue-50 whitespace-nowrap"
                >
                  Proporcional ({novaMedicao.periodo_inicio && novaMedicao.periodo_fim
                    ? `${calcularDiasMesComercial(novaMedicao.periodo_inicio, novaMedicao.periodo_fim, contrato?.data_vigencia_fim)}/30 dias`
                    : 'defina o período'})
                </Button>
              </div>
              {/* Aviso sobre mistura de tipos */}
              {itensCronograma.some(ic => ic.unidade_medida === 'MENSAL') && itensCronograma.some(ic => ic.unidade_medida !== 'MENSAL') && (
                <div className="mx-0 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-xs text-amber-800">
                    <strong>Atenção:</strong> Este contrato possui itens medidos por quantidade e itens mensais.
                    Não é possível incluir ambos os tipos na mesma medição — preencha apenas itens de um tipo por vez.
                    {tipoMedicaoAtual && <span className="font-medium"> Tipo atual: <strong>{tipoMedicaoAtual === 'mensal' ? 'Mensal' : 'Por quantidade'}</strong>.</span>}
                  </p>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-12 text-center font-bold text-xs uppercase">Item</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Descrição</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-28">Unidade</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-24">Frequência</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-20">Qtd. Total</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-24">Valor Unit.</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-24 bg-blue-50">Qtd. Mês/Dias</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-28 bg-green-50">Valor R$</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-24 bg-blue-50">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensCronograma.map((ic, idx) => {
                    const itemState = novaMedicao.itens[idx] as { item_cronograma_id: string; quantidade_medida: number; modo_input?: 'quantidade' | 'valor'; valor_override?: number } | undefined;
                    const qtdMedida = itemState?.quantidade_medida || 0;
                    const valorOverride = itemState?.valor_override;
                    const modoInput = itemState?.modo_input ?? 'quantidade';
                    // Total = quantidade × nº de execuções/meses (itens recorrentes:
                    // cada execução mede a quantidade cheia — ex.: trimestral 4×)
                    const qtdTotal = Number(ic.quantidade) * (Number(ic.quantidade_meses) || 1);
                    const qtdAprovada = Number(ic.quantidade_medida);
                    const emTransito = resumo?.itens_comprometidos?.[ic.id] || 0;
                    const saldo = qtdTotal - qtdAprovada - emTransito;
                    const saldoQuantidade = Math.max(0, saldo);
                    const saldoFinanceiro = calcularSaldoFinanceiroItemCronograma(ic);
                    const valorUnit = Number(ic.valor_unitario);
                    const subtotal = modoInput === 'valor' && valorOverride != null ? valorOverride : qtdMedida * valorUnit;
                    const excedeSaldo = modoInput === 'valor'
                      ? (valorOverride || 0) > saldoFinanceiro + 0.01
                      : qtdMedida > saldoQuantidade + 0.001;
                    const isMensal = ic.unidade_medida === 'MENSAL';
                    const tipoEsteItem = isMensal ? 'mensal' : 'quantidade';
                    const bloqueado = tipoMedicaoAtual !== null && tipoEsteItem !== tipoMedicaoAtual;
                    const unidadeTela = textoUnidadeCronogramaNaTela(ic.unidade_medida);
                    return (
                      <TableRow key={ic.id} className={`hover:bg-gray-50 ${bloqueado ? 'opacity-40' : ''}`}>
                        <TableCell className="text-center font-mono text-sm font-medium">{ic.numero_item}</TableCell>
                        <TableCell className="whitespace-normal break-words align-top min-w-[320px] max-w-[520px]">
                          <p className="text-sm font-medium whitespace-normal break-words">{ic.descricao}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                              Saldo disponivel: {formatarQuantidade(saldoQuantidade)} {unidadeTela}
                            </span>
                            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-700">
                              {formatarMoeda(saldoFinanceiro)}
                            </span>
                            {emTransito > 0 && (
                              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                                Em analise: {formatarQuantidade(emTransito)} {unidadeTela}
                              </span>
                            )}
                          </div>
                          {bloqueado && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              Inclua em medição separada (tipo: {isMensal ? 'mensal' : 'por quantidade'})
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs leading-tight max-w-[120px]">{unidadeTela}</TableCell>
                        <TableCell className="text-center text-xs whitespace-nowrap">{textoFrequenciaNaTela(ic.frequencia_execucao)}</TableCell>
                        <TableCell className="text-right text-sm">{qtdTotal.toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right text-sm">{formatarMoeda(valorUnit)}</TableCell>
                        {/* Qtd. Mês */}
                        <TableCell className="bg-blue-50/50">
                          <Input
                            type="number" step="0.001" min="0" max={saldoQuantidade}
                            placeholder="0"
                            disabled={bloqueado}
                            value={modoInput === 'quantidade' ? (qtdMedida || '') : (qtdMedida > 0 ? qtdMedida.toFixed(4) : '')}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const itens = [...novaMedicao.itens];
                              itens[idx] = {
                                item_cronograma_id: ic.id,
                                quantidade_medida: val,
                                modo_input: 'quantidade',
                                valor_override: limitarValorAoSaldoFinanceiro(
                                  aplicarRegraArredondamentoContrato(
                                    val * valorUnit,
                                    contrato?.arredondar_calculo ?? true,
                                  ),
                                  saldoFinanceiro,
                                ),
                              };
                              setNovaMedicao({ ...novaMedicao, itens });
                            }}
                            className={`text-center h-8 text-sm ${modoInput === 'quantidade' ? 'ring-1 ring-blue-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeSaldo ? 'border-red-400' : ''}`}
                          />
                          {qtdMedida > 0 && qtdMedida !== 1 && (ic.unidade_medida === 'MES' || ic.unidade_medida === 'MÊS') && (
                            <p className="text-xs text-blue-700 font-medium text-center mt-0.5">= {Math.round(qtdMedida * 30)} dias</p>
                          )}
                        </TableCell>
                        {/* Valor R$ */}
                        <TableCell className="bg-green-50/50">
                          <Input
                            type="number" step="0.01" min="0" max={saldoFinanceiro}
                            placeholder="0,00"
                            disabled={bloqueado}
                            value={modoInput === 'valor' ? (valorOverride || '') : (subtotal > 0 ? subtotal.toFixed(2) : '')}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const valorLimitado = limitarValorAoSaldoFinanceiro(val, saldoFinanceiro);
                              const qtdCalc = valorUnit > 0 ? Math.round((valorLimitado / valorUnit) * 10000) / 10000 : 0;
                              const itens = [...novaMedicao.itens];
                              itens[idx] = { item_cronograma_id: ic.id, quantidade_medida: qtdCalc, modo_input: 'valor', valor_override: valorLimitado };
                              setNovaMedicao({ ...novaMedicao, itens });
                            }}
                            className={`text-center h-8 text-sm ${modoInput === 'valor' ? 'ring-1 ring-green-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeSaldo ? 'border-red-400' : ''}`}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium bg-blue-50/50">
                          <span className={`text-sm ${subtotal > 0 ? (excedeSaldo ? 'text-red-600' : 'text-blue-700') : 'text-gray-400'}`}>
                            {formatarMoeda(subtotal)}
                          </span>
                          {excedeSaldo && <p className="text-xs text-red-500">Excede saldo</p>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            )}

            {/* Planilha Orçamentária (etapas/obras) */}
            {!isServicoContinuado && !usarItensCronograma && (
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
                    const etapasComprT = resumo?.etapas_comprometidas || {};
                    const emTransito = etapasComprT[etapa.id] || 0;
                    const itemState = novaMedicao.itens[idx] as ItemMedicaoEtapaState | undefined;
                    const modoInput = itemState?.modo_input ?? 'percentual';
                    const execPerc = itemState?.percentual_executado_atual ?? 0;
                    const execValor = itemState?.valor_executado_atual ?? 0;
                    const valorPrevisto = Number(etapa.valor_previsto);
                    const valorRestante = valorSaldoEtapa(etapa, emTransito);
                    const restante = valorPrevisto > 0 ? (valorRestante / valorPrevisto) * 100 : 0;
                    const itensEtapa = etapa.itens || [];
                    const itensJaMedidos = new Set(resumo?.itens_etapa_medidos?.[etapa.id] || []);
                    const itensSelecionados = itemState?.itens_etapa_medidos || [];
                    const atualizarItensEtapaMedidos = (itemId: string, marcado: boolean) => {
                      if (itensJaMedidos.has(itemId)) return;
                      const selecionados = new Set(itensSelecionados.filter((id) => !itensJaMedidos.has(id)));
                      if (marcado) selecionados.add(itemId);
                      else selecionados.delete(itemId);
                      const ids = Array.from(selecionados);
                      const valorItens = itensEtapa
                        .filter((item) => item.id && !itensJaMedidos.has(item.id) && ids.includes(item.id))
                        .reduce((sum, item) => sum + Number(item.valor_total || 0), 0);
                      const percItens = valorPrevisto > 0 ? (valorItens / valorPrevisto) * 100 : 0;
                      const itens = [...novaMedicao.itens];
                      itens[idx] = {
                        etapa_id: etapa.id,
                        percentual_executado_atual: Math.round(percItens * 100) / 100,
                        valor_executado_atual: valorItens,
                        modo_input: 'itens',
                        itens_etapa_medidos: ids,
                      };
                      setNovaMedicao({ ...novaMedicao, itens });
                    };

                    // Calcula subtotal baseado no modo de input
                    const subtotal = modoInput === 'valor' || modoInput === 'itens'
                      ? execValor
                      : (execPerc / 100) * valorPrevisto;

                    // Calcula % exibido baseado no modo
                    const percExibido = (modoInput === 'valor' || modoInput === 'itens') && valorPrevisto > 0
                      ? (execValor / valorPrevisto) * 100
                      : execPerc;

                    const excedeLimite = percExibido > restante + 0.01;

                    return (
                      <TableRow key={etapa.id} className="hover:bg-gray-50">
                        <TableCell className="text-center font-mono text-sm font-medium">{etapa.numero_etapa}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{etapa.descricao}</p>
                          <p className="text-xs text-gray-400">
                            Previsto: {formatarMoeda(valorPrevisto)} · Disponivel: {restante.toFixed(1)}% ({formatarMoeda(valorRestante)})
                            {emTransito > 0 && <span className="text-amber-600"> · Em analise: {emTransito.toFixed(1)}%</span>}
                          </p>
                          {excedeLimite && (
                            <p className="text-xs text-red-500 font-medium mt-0.5">Excede o disponivel!</p>
                          )}
                          {itensEtapa.length > 0 && (
                            <div className="mt-2 space-y-1 rounded border bg-white p-2">
                              {itensEtapa.map((item) => {
                                const itemId = item.id || `${etapa.id}-${item.numero_item}`;
                                const marcado = itensSelecionados.includes(itemId);
                                const jaMedido = itensJaMedidos.has(itemId);
                                return (
                                  <label key={itemId} className={`flex items-start gap-2 text-xs ${jaMedido ? 'text-gray-400' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={!jaMedido && marcado}
                                      disabled={jaMedido}
                                      onChange={(e) => atualizarItensEtapaMedidos(itemId, e.target.checked)}
                                      className="mt-0.5 h-4 w-4 disabled:cursor-not-allowed"
                                    />
                                    <span className="flex-1">
                                      <span className={`font-medium ${jaMedido ? 'line-through' : ''}`}>{item.numero_item}. {item.descricao}</span>
                                      <span className="ml-1 text-gray-500">
                                        {item.quantidade ? `${Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${item.unidade || ''} · ` : ''}
                                        {formatarMoeda(Number(item.valor_total || 0))}
                                        {jaMedido ? ' - ja medido' : ''}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatarMoeda(valorPrevisto)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm font-medium ${jaExecutado > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            {jaExecutado.toFixed(0)}%
                            {emTransito > 0 && <span className="text-amber-500 text-xs ml-0.5">+{emTransito.toFixed(0)}%</span>}
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
            )}

            {/* Execução Fiscal e Financeira */}
            {novaMedicao.periodo_inicio && novaMedicao.periodo_fim && contrato?.data_vigencia_inicio && contrato?.data_vigencia_fim && (
              <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-blue-800">Execução Fiscal e Financeira</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Execução Fiscal (Tempo ou Quantidade) */}
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <h4 className="font-medium text-blue-700 mb-3 flex items-center gap-2">
                      {(tipoMedicaoAtual === 'quantidade' || (tipoMedicaoAtual === 'mensal' && contrato?.boletim_por_quantidade)) ? (
                        <><BarChart3 className="w-4 h-4" />Execução Fiscal (Quantidade)</>
                      ) : (
                        <><Clock className="w-4 h-4" />Execução Fiscal (Tempo)</>
                      )}
                    </h4>
                    <div className="space-y-2 text-sm">
                      {(tipoMedicaoAtual === 'quantidade' || (tipoMedicaoAtual === 'mensal' && contrato?.boletim_por_quantidade)) ? (() => {
                        const forcarQtdMensal = !!(contrato?.boletim_por_quantidade);
                        const itensComQtd = itensCronograma.filter(ic => {
                          if (ic.unidade_medida === 'MENSAL' && !forcarQtdMensal) return false;
                          const itemState = novaMedicao.itens.find(i => 'item_cronograma_id' in i && (i as any).item_cronograma_id === ic.id) as any;
                          return itemState && Number(itemState.quantidade_medida) > 0;
                        });
                        if (itensComQtd.length === 0) {
                          return <p className="text-gray-500 text-xs">Informe quantidades nos itens para ver a execução</p>;
                        }
                        if (itensComQtd.length === 1) {
                          const ic = itensComQtd[0];
                          const itemState = novaMedicao.itens.find(i => 'item_cronograma_id' in i && (i as any).item_cronograma_id === ic.id) as any;
                          const isMensalComFlag = ic.unidade_medida === 'MENSAL' && forcarQtdMensal;
                          const qtdNoPeriodo = isMensalComFlag ? Math.round(Number(itemState?.quantidade_medida ?? 0)) : Number(itemState?.quantidade_medida ?? 0);
                          const qtdAprovada = isMensalComFlag ? Math.round(Number(ic.quantidade_medida ?? 0)) : Number(ic.quantidade_medida ?? 0);
                          const qtdTotal = isMensalComFlag ? Math.round(Number(ic.quantidade ?? 0)) : Number(ic.quantidade ?? 0);
                          const qtdAtePeriodo = qtdAprovada + qtdNoPeriodo;
                          const qtdAExecutar = Math.max(0, qtdTotal - qtdAtePeriodo);
                          const unidade = ic.unidade_medida || 'UNIDADE';
                          return (
                            <>
                              <div className="flex justify-between"><span className="text-gray-600">No Período:</span><span className="font-medium text-blue-700">{qtdNoPeriodo.toLocaleString('pt-BR')} {unidade}</span></div>
                              <div className="flex justify-between"><span className="text-gray-600">Até o Período:</span><span className="font-medium text-blue-700">{qtdAtePeriodo.toLocaleString('pt-BR')} {unidade}</span></div>
                              <div className="flex justify-between"><span className="text-gray-600">A Executar:</span><span className="font-medium text-green-700">{qtdAExecutar.toLocaleString('pt-BR')} {unidade}</span></div>
                            </>
                          );
                        }
                        // Múltiplos itens — mostrar resumo por item
                        return (
                          <>
                            {itensComQtd.map(ic => {
                              const itemState = novaMedicao.itens.find(i => 'item_cronograma_id' in i && (i as any).item_cronograma_id === ic.id) as any;
                              const isMensalComFlag = ic.unidade_medida === 'MENSAL' && forcarQtdMensal;
                              const qtdNoPeriodo = isMensalComFlag ? Math.round(Number(itemState?.quantidade_medida ?? 0)) : Number(itemState?.quantidade_medida ?? 0);
                              const qtdAprovada = isMensalComFlag ? Math.round(Number(ic.quantidade_medida ?? 0)) : Number(ic.quantidade_medida ?? 0);
                              const qtdAExecutar = Math.max(0, (isMensalComFlag ? Math.round(Number(ic.quantidade)) : Number(ic.quantidade)) - qtdAprovada - qtdNoPeriodo);
                              return (
                                <div key={ic.id} className="flex justify-between text-xs">
                                  <span className="text-gray-600 truncate mr-2">{ic.descricao?.substring(0, 30)}...</span>
                                  <span className="font-medium whitespace-nowrap">{qtdNoPeriodo > 0 ? `+${qtdNoPeriodo}` : '-'} / {qtdAExecutar} {ic.unidade_medida}</span>
                                </div>
                              );
                            })}
                          </>
                        );
                      })() : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">No Período:</span>
                            <span className="font-medium text-blue-700">
                              {calcularExecucaoFiscal(
                                novaMedicao.periodo_inicio,
                                novaMedicao.periodo_fim,
                                contrato.data_vigencia_inicio,
                                contrato.data_vigencia_fim
                              ).noPeriodo}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Até o Período:</span>
                            <span className="font-medium text-blue-700">
                              {calcularExecucaoFiscal(
                                novaMedicao.periodo_inicio,
                                novaMedicao.periodo_fim,
                                contrato.data_vigencia_inicio,
                                contrato.data_vigencia_fim
                              ).atePeriodo}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">A Executar:</span>
                            <span className="font-medium text-green-700">
                              {calcularExecucaoFiscal(
                                novaMedicao.periodo_inicio,
                                novaMedicao.periodo_fim,
                                contrato.data_vigencia_inicio,
                                contrato.data_vigencia_fim
                              ).aExecutar}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Execução Financeira (Valores) */}
                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <h4 className="font-medium text-green-700 mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Execução Financeira (Valores)
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">No Período:</span>
                        <span className="font-medium text-green-700">
                          {formatarMoeda(noPeriodoExibicao)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Até o Período:</span>
                        <span className="font-medium text-blue-700">
                          {formatarMoeda(atePeriodoExibicao)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">A Executar:</span>
                        <span className="font-medium text-orange-700">
                          {formatarMoeda(aExecutarExibicao)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
              </div>
            </div>

            {/* Discriminação das Despesas */}
            {(() => {
              const valorMedidoAtual = isServicoContinuado
                ? (parseFloat(novaMedicao.valor_medido) || 0)
                : usarItensCronograma
                  ? novaMedicao.itens.reduce((acc, item) => {
                      if (!('item_cronograma_id' in item)) return acc;
                      const ic = itensCronograma.find(i => i.id === item.item_cronograma_id);
                      return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0);
                    }, 0)
                  : novaMedicao.itens.reduce((acc, item, idx) => {
                      const etapa = etapas[idx]; if (!etapa || !('etapa_id' in item)) return acc;
                      return acc + valorItemEtapaMedicao(item, etapa);
                    }, 0);
              // Base da discriminação: valor da NF quando disponível, senão valor medido
              const valorBaseDiscriminacao = escolherValorBaseDiscriminacao(novaMedicao.nota_fiscal_valor, valorMedidoAtual);

              const totalDiscPerc = discriminacoes.reduce((s, d) => s + (Number(d.percentual) || 0), 0);
              const totalDiscValorBruto = discriminacoes.reduce((s, d) => s + (Number(d.valor) || 0), 0);
              // Quando % somam ~100% e diferença é só arredondamento (≤ 1 cent), exibe o valor exato da base
              const arredondamentoApenas = valorBaseDiscriminacao > 0
                && Math.abs(totalDiscPerc - 100) < 0.05
                && Math.abs(totalDiscValorBruto - valorBaseDiscriminacao) <= 0.02;
              const totalDiscValor = arredondamentoApenas ? valorBaseDiscriminacao : totalDiscValorBruto;

              return (
                <div className="border rounded-lg p-4 bg-amber-50/30">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                      <DollarSign className="w-4 h-4" />
                      Discriminação das Despesas
                      <span className="text-xs font-normal text-red-500">* obrigatória</span>
                    </Label>
                    <div className="flex gap-2">
                      {medicoes.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={reaproveitarDespesasUltimoMes}
                          className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          Reaproveitar despesas do último mês
                        </Button>
                        )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDiscriminacoes([...discriminacoes, { descricao: '', valor: 0, percentual: 0 }])}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Adicionar Item
                      </Button>
                    </div>
                  </div>

                  {discriminacoes.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 text-xs font-semibold text-gray-500 uppercase px-1">
                        <span>Item</span>
                        <span>Discriminacao</span>
                        <span className="text-right">Valor R$</span>
                        <span className="text-right">%</span>
                        <span></span>
                      </div>
                      {discriminacoes.map((disc, idx) => (
                        <div key={idx} className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 items-center">
                          <span className="text-sm text-center font-mono text-gray-500">{idx + 1}</span>
                          <Input
                            value={disc.descricao}
                            onChange={(e) => {
                              const updated = [...discriminacoes];
                              updated[idx] = { ...updated[idx], descricao: e.target.value };
                              setDiscriminacoes(updated);
                            }}
                            placeholder="Ex: Tributacao, Servicos..."
                            className="h-8 text-sm"
                          />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={disc.valor || ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              const perc = valorBaseDiscriminacao > 0 ? (val / valorBaseDiscriminacao) * 100 : 0;
                              const updated = [...discriminacoes];
                              updated[idx] = { ...updated[idx], valor: val, percentual: Math.round(perc * 10000) / 10000 };
                              setDiscriminacoes(updated);
                            }}
                            placeholder="0,00"
                            className="h-8 text-sm text-right"
                          />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={disc.percentual || ''}
                            onChange={(e) => {
                              const perc = e.target.value === '' ? 0 : Number(e.target.value);
                              const val = valorBaseDiscriminacao > 0 ? (perc / 100) * valorBaseDiscriminacao : 0;
                              const updated = [...discriminacoes];
                              updated[idx] = { ...updated[idx], percentual: perc, valor: Math.round(val * 100) / 100 };
                              setDiscriminacoes(updated);
                            }}
                            placeholder="0,00"
                            className="h-8 text-sm text-right"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                            onClick={() => {
                              setDiscriminacoes(discriminacoes.filter((_, i) => i !== idx));
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                      {/* Totais */}
                      <div className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 items-center border-t pt-2 mt-2">
                        <span></span>
                        <span className="text-sm font-bold text-gray-700">Total</span>
                        <span className={`text-sm font-bold text-right ${Math.abs(totalDiscValor - valorBaseDiscriminacao) < 0.02 ? 'text-green-600' : 'text-amber-600'}`}>
                          {formatarMoeda(totalDiscValor)}
                        </span>
                        <span className={`text-sm font-bold text-right ${Math.abs(totalDiscPerc - 100) < 0.02 ? 'text-green-600' : 'text-amber-600'}`}>
                          {totalDiscPerc.toFixed(2)}%
                        </span>
                        <span></span>
                      </div>
                      {valorBaseDiscriminacao > 0 && Math.abs(totalDiscValor - valorBaseDiscriminacao) > 0.02 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Valor base: {formatarMoeda(valorBaseDiscriminacao)}. Diferenca: {formatarMoeda(totalDiscValor - valorBaseDiscriminacao)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-3">
                      Nenhuma discriminacao adicionada. Use &quot;Reaproveitar despesas do último mês&quot; para trazer os % da última medição (valores recalculados pela medição atual) ou &quot;Adicionar Item&quot; para criar manualmente.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Fotos e Documentos */}
            <div className="border rounded-lg p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <Label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Paperclip className="w-4 h-4" />
                  Fotos e Documentos
                  <span className="text-xs font-normal text-gray-400">(opcional)</span>
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/jpeg,image/png,image/jpg';
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) {
                          const titulo = prompt('Título da foto (opcional):') ?? '';
                          const novos = Array.from(files).map(f => ({ file: f, tipo: 'FOTO' as const, descricao: titulo }));
                          setArquivosPendentes(prev => [...prev, ...novos]);
                        }
                      };
                      input.click();
                    }}
                  >
                    <Camera className="w-3 h-3" /> Foto
                  </Button>
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'application/pdf,image/jpeg,image/png';
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files && files.length > 0) {
                          const titulo = prompt('Título dos documentos (opcional):') ?? '';
                          setArquivosPendentes(prev => [...prev, ...Array.from(files).map(f => ({ file: f, tipo: 'DOCUMENTO' as const, descricao: titulo }))]);
                        }
                      };
                      input.click();
                    }}
                  >
                    <Upload className="w-3 h-3" /> Documento
                  </Button>
                </div>
              </div>
              {anexosReaproveitados.length === 0 && arquivosPendentes.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Nenhum arquivo adicionado. Você pode adicionar fotos e documentos agora ou depois.</p>
              ) : (
                <div className="space-y-1">
                  {anexosReaproveitados.map((arq, idx) => (
                    <div key={arq.id} className="flex items-center justify-between bg-blue-50 rounded px-3 py-1.5 text-xs border border-blue-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{arq.tipo === 'FOTO' ? '📷' : '📄'}</span>
                        <span className="truncate font-medium">{arq.descricao || arq.nome_original || arq.nome_arquivo}</span>
                        <span className="text-blue-500 flex-shrink-0">(reaproveitado)</span>
                        <span className="text-gray-400 flex-shrink-0">({(arq.tamanho_bytes / 1024).toFixed(0)} KB)</span>
                      </div>
                      <Button
                        type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                        onClick={() => setAnexosReaproveitados(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {arquivosPendentes.map((arq, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white rounded px-3 py-1.5 text-xs border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{arq.tipo === 'FOTO' ? '📷' : '📄'}</span>
                        <span className="truncate font-medium">{arq.descricao || arq.file.name}</span>
                        <span className="text-gray-400 flex-shrink-0">({(arq.file.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <Button
                        type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                        onClick={() => setArquivosPendentes(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
          <div className="border-t bg-white px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
            <Button variant="outline" onClick={() => {
              setModalNovaMedicao(false);
              setMedicaoParaEditar(null);
              setNovaMedicao({ periodo_inicio: '', periodo_fim: '', competencia: '', observacoes: '', nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '', valor_medido: '', itens: [] });
              setDiscriminacoes([]);
              setArquivosPendentes([]);
              setAnexosReaproveitados([]);
              setTimeout(() => { document.body.style.pointerEvents = ''; }, 0);
            }}>Cancelar Lançamento</Button>
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
          </div>
        </div>
      )}

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
      <Dialog open={modalDetalhe} onOpenChange={(open) => { setModalDetalhe(open); if (!open) setTimeout(() => { document.body.style.pointerEvents = ''; }, 0); }}>
        <DialogContent className="w-[98vw] max-w-7xl max-h-[96vh] overflow-y-auto">
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

              {/* Itens da Medição (Cronograma) — com status de ateste por item */}
              {medicaoDetalhe.itens && medicaoDetalhe.itens.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-bold">Itens do Cronograma</p>
                    {medicaoDetalhe.status === 'DEVOLVIDA' && (
                      editandoItensDetalhe ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setEditandoItensDetalhe(false); setItensEditados({}); }}>Cancelar</Button>
                          <Button size="sm" onClick={salvarItensMedicao} disabled={submitting} className="gap-1">
                            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Salvar alterações
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setEditandoItensDetalhe(true)}>
                          Editar itens
                        </Button>
                      )
                    )}
                  </div>
                  {(medicaoDetalhe.status === 'DEVOLVIDA' || medicaoDetalhe.status === 'PARCIALMENTE_ATESTADA') && medicaoDetalhe.itens.some((i: any) => i.atestado !== undefined) && (
                    <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                      <strong>Ateste parcial:</strong> {medicaoDetalhe.itens.filter((i: any) => i.atestado).length} de {medicaoDetalhe.itens.length} itens atestados. 
                      {medicaoDetalhe.itens.some((i: any) => !i.atestado) && ' Corrija os itens pendentes e reenvie.'}
                    </div>
                  )}
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
                          {(medicaoDetalhe.status === 'DEVOLVIDA' || medicaoDetalhe.status === 'PARCIALMENTE_ATESTADA') && (
                            <>
                              <TableHead className="text-xs font-bold text-center w-20">Atestado</TableHead>
                              <TableHead className="text-xs font-bold min-w-[140px]">Obs. Fiscal</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {medicaoDetalhe.itens.map((item: any, idx: number) => (
                          <TableRow key={item.id || idx} className={item.atestado === false ? 'bg-amber-50/50' : ''}>
                            <TableCell className="text-sm font-mono">{item.etapa_numero || idx + 1}</TableCell>
                            <TableCell className="text-sm whitespace-normal break-words align-top min-w-[280px] max-w-[480px]">{item.etapa_descricao || `Etapa ${idx + 1}`}</TableCell>
                            <TableCell className="text-sm text-right">{formatarMoeda(item.etapa_valor_previsto)}</TableCell>
                            <TableCell className="text-sm text-center text-gray-500">{Number(item.percentual_executado_anterior || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-center font-medium text-blue-700 bg-blue-50/50">
                              {editandoItensDetalhe && medicaoDetalhe.status === 'DEVOLVIDA' ? (
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                  className="w-16 h-7 text-center text-sm"
                                  value={itensEditados[item.id]?.percentual_executado_atual ?? Number(item.percentual_executado_atual || 0)}
                                  onChange={(e) => {
                                    const v = e.target.value === '' ? 0 : Number(e.target.value);
                                    const valorPrev = Number(item.etapa_valor_previsto) || 0;
                                    setItensEditados(prev => ({ ...prev, [item.id]: { ...prev[item.id], percentual_executado_atual: v, valor_executado_atual: (v / 100) * valorPrev } }));
                                  }}
                                />
                              ) : (
                                `${Number(item.percentual_executado_atual || 0).toFixed(1)}%`
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-center font-medium">{Number(item.percentual_executado_acumulado || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-right font-medium text-blue-700 bg-blue-50/50">
                              {editandoItensDetalhe && medicaoDetalhe.status === 'DEVOLVIDA' ? (
                                formatarMoeda(itensEditados[item.id]?.valor_executado_atual ?? Number(item.valor_medido || 0))
                              ) : (
                                formatarMoeda(item.valor_medido)
                              )}
                            </TableCell>
                            {(medicaoDetalhe.status === 'DEVOLVIDA' || medicaoDetalhe.status === 'PARCIALMENTE_ATESTADA') && (
                              <>
                                <TableCell className="text-sm text-center">
                                  {item.atestado ? (
                                    <span className="inline-flex items-center gap-1 text-green-600 font-medium" title="Atestado pelo fiscal">
                                      <CheckCircle className="w-4 h-4" /> Sim
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium" title="Pendente de ateste">
                                      <AlertTriangle className="w-4 h-4" /> Não
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-amber-700">
                                  {item.ateste_observacoes || '-'}
                                </TableCell>
                              </>
                            )}
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
                  <p className="text-sm">
                    NF {medicaoDetalhe.nota_fiscal_numero}
                    {medicaoDetalhe.nota_fiscal_data ? ` - ${formatarData(medicaoDetalhe.nota_fiscal_data)}` : ''}
                  </p>
                </div>
              )}

              {/* Discriminação de Despesas (read-only) */}
              {discriminacoesDetalhe.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">Discriminacao das Despesas</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-amber-50">
                          <TableHead className="text-xs font-bold w-12">Item</TableHead>
                          <TableHead className="text-xs font-bold">Discriminacao</TableHead>
                          <TableHead className="text-xs font-bold text-right w-28">Valor R$</TableHead>
                          <TableHead className="text-xs font-bold text-right w-20">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discriminacoesDetalhe.map((d: any, idx: number) => (
                          <TableRow key={d.id || idx}>
                            <TableCell className="text-sm font-mono">{d.numero_item || idx + 1}</TableCell>
                            <TableCell className="text-sm">
                              {d.descricao}
                              {d.corrigido_por_nome && (
                                <span className="ml-2 text-xs text-amber-600" title={`Corrigido por ${d.corrigido_por_nome}: ${d.motivo_correcao || ''}`}>
                                  (corrigido pelo fiscal)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right font-medium">{formatarMoeda(d.valor)}</TableCell>
                            <TableCell className="text-sm text-right">{Number(d.percentual || 0).toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50 font-bold">
                          <TableCell></TableCell>
                          <TableCell className="text-sm font-bold">Total</TableCell>
                          <TableCell className="text-sm text-right font-bold">{formatarMoeda(discriminacoesDetalhe.reduce((s: number, d: any) => s + Number(d.valor || 0), 0))}</TableCell>
                          <TableCell className="text-sm text-right font-bold">{discriminacoesDetalhe.reduce((s: number, d: any) => s + Number(d.percentual || 0), 0).toFixed(2)}%</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
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

              {medicaoDetalhe.status === 'RASCUNHO' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-4">
                  <p className="text-sm text-blue-800">Esta medição ainda não foi enviada para ateste.</p>
                  <Button size="sm" className="gap-1 shrink-0" onClick={() => { setModalDetalhe(false); abrirModalSubmeter(medicaoDetalhe); }}>
                    <Send className="w-3 h-3" /> Assinar e Enviar
                  </Button>
                </div>
              )}

              {medicaoDetalhe.status === 'DEVOLVIDA' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  {medicaoDetalhe.motivo_devolucao && (
                    <>
                      <p className="text-xs text-amber-600 font-bold">Motivo da Devolução</p>
                      <p className="text-sm text-amber-700">{medicaoDetalhe.motivo_devolucao}</p>
                    </>
                  )}
                  <p className="text-sm text-amber-800">
                    Feche este modal, corrija os itens pendentes (acima) e clique em <strong>Submeter</strong> para reenviar.
                  </p>
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

          {/* Botão Baixar PDF */}
          {medicaoDetalhe && (
            <div className="flex justify-end pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={async () => {
                  await baixarPdfArmazenado(medicaoDetalhe.id)
                }}
              >
                <FileDown className="w-4 h-4" />
                Baixar PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: Assinatura Digital com OTP ============ */}
      <Dialog open={modalOtp} onOpenChange={(open) => { if (!open) { setModalOtp(false); setTimeout(() => { document.body.style.pointerEvents = ''; }, 0); if (otpEtapa !== 'sucesso') { carregarDados(); } } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              Assinatura Digital do Boletim
            </DialogTitle>
            <DialogDescription>
              {otpEtapa === 'info' && 'O boletim de medição será gerado e assinado digitalmente.'}
              {otpEtapa === 'codigo' && 'Digite o código de verificação enviado.'}
              {otpEtapa === 'sucesso' && 'Boletim assinado e enviado com sucesso!'}
            </DialogDescription>
          </DialogHeader>

          {otpEtapa === 'info' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-sm text-blue-900 font-medium">Ao confirmar, o sistema irá:</p>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>Enviar um código de verificação para seu <strong>WhatsApp</strong> e/ou <strong>email</strong> cadastrado</li>
                  <li>Gerar o PDF do Boletim de Medição</li>
                  <li>Registrar sua <strong>assinatura digital</strong> no documento</li>
                  <li>Enviar o boletim assinado para o órgão</li>
                </ul>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  <strong>Importante:</strong> Ao assinar, você confirma que os dados da medição estão corretos e concorda com o envio para análise do fiscal do contrato.
                </p>
              </div>
              {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
            </div>
          )}

          {otpEtapa === 'codigo' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <p className="font-medium mb-1">Código enviado com sucesso!</p>
                {otpCanais?.canais_enviados.includes('whatsapp') && otpCanais.telefone_mascarado && (
                  <p>📱 WhatsApp: {otpCanais.telefone_mascarado}</p>
                )}
                {otpCanais?.canais_enviados.includes('email') && otpCanais.email_mascarado && (
                  <p>📧 Email: {otpCanais.email_mascarado}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Código de Verificação (6 dígitos)</Label>
                <Input
                  value={otpCodigo}
                  onChange={(e) => setOtpCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-mono mt-1"
                  maxLength={6}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && otpCodigo.length === 6) handleValidarOtp(); }}
                />
                <p className="text-xs text-gray-500 mt-1">O código expira em 5 minutos.</p>
              </div>
              {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
              <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={handleEnviarOtp} disabled={otpLoading}>
                Não recebeu? Reenviar código
              </Button>
            </div>
          )}

          {otpEtapa === 'sucesso' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center space-y-2">
                <CheckCircle className="w-10 h-10 text-green-600 mx-auto" />
                <p className="text-green-900 font-semibold">Boletim assinado digitalmente!</p>
                <p className="text-sm text-green-700">A medição foi enviada para análise do fiscal do contrato.</p>
                {otpCodigoValidacao && (
                  <div className="mt-2 bg-white border border-green-300 rounded p-2">
                    <p className="text-xs text-gray-500">Código de validação da assinatura:</p>
                    <p className="font-mono text-sm font-bold text-green-800">{otpCodigoValidacao}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center">
                O PDF do boletim foi baixado automaticamente. Ele também está disponível na tela de detalhes da medição.
              </p>
            </div>
          )}

          <DialogFooter>
            {otpEtapa === 'info' && (
              <div className="flex w-full gap-2 justify-between">
                <Button variant="outline" onClick={() => { setModalOtp(false); carregarDados(); }}>Cancelar</Button>
                <Button onClick={handleEnviarOtp} disabled={otpLoading} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar Código e Assinar
                </Button>
              </div>
            )}
            {otpEtapa === 'codigo' && (
              <div className="flex w-full gap-2 justify-between">
                <Button variant="outline" onClick={() => { setModalOtp(false); carregarDados(); }}>Cancelar</Button>
                <Button onClick={handleValidarOtp} disabled={otpLoading || otpCodigo.length !== 6} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Confirmar Assinatura
                </Button>
              </div>
            )}
            {otpEtapa === 'sucesso' && (
              <Button onClick={() => { setModalOtp(false); carregarDados(); }} className="w-full bg-green-600 hover:bg-green-700">
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: contrato de Compras não usa medição */}
      <Dialog open={modalComprasAviso} onOpenChange={setModalComprasAviso}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-amber-100 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle>Contrato de Compras</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-gray-600 leading-relaxed">
              O contrato <strong className="text-gray-800">{contrato?.numero_contrato}</strong> é de
              categoria <strong className="text-gray-800">Compras</strong>. Para este tipo de contrato, o
              atendimento é realizado pela <strong className="text-gray-800">Ordem de Fornecimento</strong> —
              envie o XML da NF-e e a nota fiscal diretamente pela ordem correspondente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setModalComprasAviso(false)}>
              Fechar
            </Button>
            <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Link href="/fornecedor/ordens">
                <ExternalLink className="w-4 h-4" />Ir para Ordens de Fornecimento
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
