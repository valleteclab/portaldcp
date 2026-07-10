"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  TrendingUp,
  CheckCircle,
  XCircle,
  Send,
  Pencil,
  Trash2,
  BarChart3,
  FileText,
  AlertTriangle,
  Calendar,
  MapPin,
  ExternalLink,
  ClipboardCheck,
  RotateCcw,
  ChevronRight,
  Eye,
  Clock,
  Shield,
  ListOrdered,
  Layers,
  DollarSign,
  Camera,
  Paperclip,
  Upload,
  Wrench,
  RefreshCw,
  Download,
  Copy,
  ArrowLeft,
  History,
} from "lucide-react";
import Link from "next/link";
import { API_URL, authFetch } from "@/lib/api";
import { derivarCompetencia } from "@/lib/pdf-medicao";
import ConciliacaoFatorCard from "@/components/contratos/ConciliacaoFatorCard";
import {
  mesesVigenciaContrato,
  execucoesSugeridasPorFrequencia,
  FREQUENCIAS_CRONOGRAMA_CONTRATO,
  parseFrequenciaSalva,
  textoFrequenciaNaTela,
  textoUnidadeCronogramaNaTela,
  type FrequenciaExecucaoContrato,
} from "@/lib/cronograma-contrato";
import { Switch } from "@/components/ui/switch";

interface OSRequisicao {
  id: string;
  numero?: string;
  numero_os?: string;
  status: string;
  descricao?: string;
  descricao_os?: string;
  local_execucao?: string;
  data_solicitacao?: string;
  data_autorizacao?: string;
  data_abertura?: string;
  data_aprovacao?: string;
  data_inicio_prevista?: string;
  data_fim_prevista?: string;
  prazo_execucao_dias?: number;
  responsavel_tecnico?: string;
  fiscal_contrato_nome?: string;
  fiscal_nome?: string;
  usuario_solicitante_nome?: string;
  usuario_autorizador_nome?: string;
  aprovador_nome?: string;
  justificativa?: string;
  sla_dias?: number;
  sla_excedido?: boolean;
}

interface Etapa {
  id: string;
  numero_etapa: number;
  descricao: string;
  percentual_fisico: number;
  valor_previsto: number;
  data_inicio_prevista: string;
  data_fim_prevista: string;
  percentual_executado: number;
  valor_executado: number;
  status: string;
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
  observacoes?: string;
}

interface ItemCronograma {
  id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  quantidade_meses?: number | null;
  frequencia_execucao?: string | null;
  numero_execucoes?: number | null;
  valor_mensal?: number;
  valor_total: number;
  quantidade_medida: number;
  valor_migracao_reais?: number | null;
  observacoes?: string;
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
  fiscal_nome: string;
  fornecedor_nome?: string;
  fornecedor_observacoes?: string;
  competencia?: string | null;
  nota_fiscal_numero?: string;
  nota_fiscal_valor?: number;
  nota_fiscal_data?: string;
  boletim_data_emissao?: string | null;
  data_submissao?: string;
  ateste_fiscal_nome?: string;
  ateste_data?: string;
  ateste_observacoes?: string;
  ateste_verificado_in_loco?: boolean;
  aprovador_nome?: string;
  data_aprovacao?: string;
  observacao_aprovador?: string;
  motivo_devolucao?: string;
  data_devolucao?: string;
  status: string;
  created_at: string;
  itens?: any[];
  execucao_fiscal?: {
    vigencia_inicio?: string;
    vigencia_fim?: string;
    dias_executados?: number;
    dias_restantes?: number;
    meses_executados?: number;
    dias_executados_extra?: number;
    meses_restantes?: number;
    dias_restantes_extra?: number;
  } | null;
}

interface Resumo {
  valor_global: number;
  valor_medido_total: number;
  valor_comprometido_total?: number;
  valor_em_analise?: number;
  saldo_disponivel: number;
  percentual_fisico_total: number;
  total_etapas: number;
  etapas_concluidas: number;
  total_medicoes: number;
  medicoes_aprovadas: number;
  pendentes_ateste: number;
  pendentes_aprovacao: number;
  os_ativa: OSRequisicao | null;
  total_os: number;
  fluxo_os?: "REQUISICAO" | "MODULO_OS";
  itens_comprometidos?: Record<string, number>;
  etapas_comprometidas?: Record<string, number>;
}

const STATUS_OS: Record<string, { label: string; cor: string }> = {
  RASCUNHO: { label: "Rascunho", cor: "bg-gray-100 text-gray-800" },
  AGUARDANDO_APROVACAO: {
    label: "Aguardando Aprovação",
    cor: "bg-amber-100 text-amber-800",
  },
  AGUARDANDO_AUTORIZACAO: {
    label: "Aguardando Autorização",
    cor: "bg-amber-100 text-amber-800",
  },
  AUTORIZADA: { label: "Autorizada", cor: "bg-blue-100 text-blue-800" },
  ABERTA: { label: "Aberta", cor: "bg-blue-100 text-blue-800" },
  EM_EXECUCAO: { label: "Em Execução", cor: "bg-indigo-100 text-indigo-800" },
  ORDEM_GERADA: { label: "Em Execução", cor: "bg-indigo-100 text-indigo-800" },
  ENTREGUE: { label: "Entregue", cor: "bg-purple-100 text-purple-800" },
  EM_ACEITE: { label: "Em Aceite", cor: "bg-orange-100 text-orange-800" },
  ACEITA: { label: "Aceita", cor: "bg-green-100 text-green-800" },
  REJEITADA: { label: "Rejeitada", cor: "bg-red-100 text-red-800" },
  CANCELADA: { label: "Cancelada", cor: "bg-red-100 text-red-800" },
  CONCLUIDA: { label: "Concluída", cor: "bg-green-100 text-green-800" },
  ATENDIDA: { label: "Concluída", cor: "bg-green-100 text-green-800" },
  NEGADA: { label: "Negada", cor: "bg-red-100 text-red-800" },
};

const STATUS_ETAPA: Record<string, { label: string; cor: string }> = {
  PENDENTE: { label: "Pendente", cor: "bg-gray-100 text-gray-800" },
  EM_EXECUCAO: { label: "Em Execução", cor: "bg-blue-100 text-blue-800" },
  MEDIDA_PARCIAL: {
    label: "Medida Parcial",
    cor: "bg-amber-100 text-amber-800",
  },
  CONCLUIDA: { label: "Concluída", cor: "bg-green-100 text-green-800" },
};

const STATUS_MEDICAO: Record<
  string,
  { label: string; cor: string; icon: any }
> = {
  RASCUNHO: {
    label: "Rascunho",
    cor: "bg-gray-100 text-gray-800",
    icon: FileText,
  },
  SUBMETIDA: {
    label: "Submetida",
    cor: "bg-blue-100 text-blue-800",
    icon: Send,
  },
  AGUARDANDO_ATESTE: {
    label: "Aguardando Ateste",
    cor: "bg-yellow-100 text-yellow-800",
    icon: ClipboardCheck,
  },
  PARCIALMENTE_ATESTADA: {
    label: "Parcialmente Atestada",
    cor: "bg-amber-100 text-amber-800",
    icon: ClipboardCheck,
  },
  AGUARDANDO_APROVACAO: {
    label: "Aguardando Aprovação",
    cor: "bg-orange-100 text-orange-800",
    icon: Clock,
  },
  APROVADA: {
    label: "Aprovada",
    cor: "bg-green-100 text-green-800",
    icon: CheckCircle,
  },
  REJEITADA: {
    label: "Rejeitada",
    cor: "bg-red-100 text-red-800",
    icon: XCircle,
  },
  DEVOLVIDA: {
    label: "Devolvida",
    cor: "bg-amber-100 text-amber-800",
    icon: RotateCcw,
  },
};

/** Corta em 2 casas sem arredondar. +1e-9 neutraliza ruído IEEE 754 de floats já truncados. */
function truncar2Casas(v: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return ((x < 0 ? -1 : 1) * Math.floor(Math.abs(x) * 100 + 1e-9)) / 100;
}

/** Produto q × vl truncado em 2 casas decimais (centavos inteiros, sem float drift). */
function prodTrunc(q: number, vl: number): number {
  return Math.floor((Math.round(q * 100) * Math.round(vl * 100)) / 100) / 100;
}

function parseDecimal(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  return Number(String(valor).replace(",", ".")) || 0;
}

function calcularSaldoFinanceiroItemCronograma(ic: ItemCronograma): number {
  const valorTotal = Number(ic.valor_total) || 0;
  const valorUnitario = Number(ic.valor_unitario) || 0;
  const quantidadeMedida = Number(ic.quantidade_medida) || 0;
  const valorMigracao = Number(ic.valor_migracao_reais || 0);

  if (ic.unidade_medida === "MENSAL" && valorMigracao > 0 && valorUnitario > 0) {
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
}

function limitarValorAoSaldoFinanceiro(valor: number, saldoFinanceiro: number): number {
  return Math.min(
    Math.round((Number(valor) || 0) * 100) / 100,
    Math.round((Number(saldoFinanceiro) || 0) * 100) / 100,
  );
}

function formatarMoeda(v: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(truncar2Casas(Number(v)));
}

function formatarData(d: string | null | undefined) {
  if (!d) return "-";
  // Se for formato YYYY-MM-DD (date-only), faz split para evitar problema de timezone UTC
  const dateOnly = d.split("T")[0];
  const parts = dateOnly.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(d).toLocaleDateString("pt-BR");
}

/** Dias entre datas usando ano comercial (30 dias/mês, máx 360).
 *  Regra: dia 31 (ou 29/28 de fev) = dia 30 no calendário comercial.
 *  Clip em dia2 ANTES de subtrair — garante 20/03→31/03 = 11, não 12. */
function diaFimComercialUtc(ano: number, mes: number, dia: number): number {
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return dia === ultimoDiaDoMes ? 30 : Math.min(dia, 30);
}

function calcularDiasMesComercial(
  data1: string,
  data2: string,
  _dataFimContrato?: string,
): number {
  const d1 = new Date(data1);
  const d2 = new Date(data2);
  const ano1 = d1.getUTCFullYear();
  const mes1 = d1.getUTCMonth();
  const dia1 = d1.getUTCDate();
  const ano2 = d2.getUTCFullYear();
  const mes2 = d2.getUTCMonth();
  const dia2 = d2.getUTCDate();
  // No calendário comercial o mês tem sempre 30 dias: clipa dia2 a 30
  const dia2Com = diaFimComercialUtc(ano2, mes2, dia2);
  let dias = 0;
  if (ano1 === ano2 && mes1 === mes2) {
    dias = dia2Com - dia1 + 1;
  } else {
    const diasPrimeiroMes = Math.min(30 - dia1 + 1, 30);
    let mesesCompletos = 0;
    if (ano2 > ano1 || mes2 > mes1 + 1)
      mesesCompletos = (ano2 - ano1) * 12 + (mes2 - mes1 - 1);
    dias = diasPrimeiroMes + mesesCompletos * 30 + dia2Com;
  }
  return Math.max(0, Math.min(dias, 360));
}

function calcularExecucaoFiscal(
  periodoInicio: string,
  periodoFim: string,
  vigenciaInicio: string,
  vigenciaFim: string,
  primeiraMedicaoCiclo = false,
  diasMigracaoAnterior = 0,
) {
  const diasPeriodo = calcularDiasMesComercial(
    periodoInicio,
    periodoFim,
    vigenciaFim,
  );
  const diasAte = primeiraMedicaoCiclo
    ? Math.min(360, diasPeriodo + Math.max(0, diasMigracaoAnterior))
    : calcularDiasMesComercial(vigenciaInicio, periodoFim, vigenciaFim);
  const diasRestantes = Math.max(0, 360 - diasAte);
  const fmt = (d: number) => {
    const m = Math.floor(d / 30);
    const r = d % 30;
    const pM = m === 1 ? "1 mês" : m > 1 ? `${m} meses` : "";
    const pD = r === 1 ? "1 dia" : r > 1 ? `${r} dias` : "";
    return pM && pD ? `${pM} e ${pD}` : pM || pD || "0 dias";
  };
  return {
    noPeriodo: fmt(diasPeriodo),
    atePeriodo: fmt(diasAte),
    aExecutar: fmt(diasRestantes),
    diasNoPeriodo: diasPeriodo,
    diasAte,
    diasRestantes,
  };
}

export default function TabMedicao({
  contratoId,
  valorGlobal,
  modalidade,
  onAtestar,
  contrato: contratoProp,
  isAdmin,
}: {
  contratoId: string;
  valorGlobal: number;
  modalidade?: string;
  onAtestar?: (medicao: any) => void;
  contrato?: {
    data_vigencia_inicio?: string;
    data_vigencia_fim?: string;
    valor_global?: number | string;
    boletim_por_quantidade?: boolean;
    valor_executado_anterior?: number | string;
    arredondar_calculo?: boolean;
    objeto?: string;
    data_renovacao_ciclo?: string;
    ciclo_ativo?: {
      valor_global?: number | string;
      valor_inicial?: number | string;
      valor_acrescimos?: number | string;
      valor_supressoes?: number | string;
      saldo_disponivel?: number | string;
      data_renovacao?: string;
    };
  };
  isAdmin?: boolean;
}) {
  const isServicoContinuado = ["CONTINUADO", "LICENCA"].includes(
    modalidade || "",
  );
  const dataRenovacaoCiclo = contratoProp?.data_renovacao_ciclo
    ? new Date(contratoProp.data_renovacao_ciclo)
    : null;
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [itensCronograma, setItensCronograma] = useState<ItemCronograma[]>([]);
  const [unidadesCronograma, setUnidadesCronograma] = useState<string[]>([
    "HORA",
    "MENSAL",
    "LITROS",
    "METROS",
    "SERVICO",
    "UNIDADE",
  ]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const exibirColunasFrequenciaCronograma = itensCronograma.some(
    (item) => !!item.frequencia_execucao,
  );

  // Contrato recorrente/mensal: itens com quantidade_meses > 1 (ex.: postos por mês × meses).
  // Nesses, a tela mostra a coluna "Meses", o Valor Total do contrato (qtd × valor unit. × meses)
  // e o Medido sobre o total contratado — evita o "Medido 40 vs Quantidade 8" confuso.
  const exibirMesesCronograma =
    !exibirColunasFrequenciaCronograma &&
    itensCronograma.some(
      (item) =>
        Number(item.quantidade_meses) > 1 && item.unidade_medida !== "MENSAL",
    );

  // Verificar se o usuário logado tem permissão de excluir medições
  const [podeExcluirMedicao, setPodeExcluirMedicao] = useState(false);
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario") || "{}");
      setPodeExcluirMedicao(u.pode_excluir_medicao === true);
    } catch {
      setPodeExcluirMedicao(false);
    }
  }, []);

  // Modais
  const [modalEtapa, setModalEtapa] = useState(false);
  const [editandoEtapa, setEditandoEtapa] = useState<Etapa | null>(null);
  const [modalItemCronograma, setModalItemCronograma] = useState(false);
  const [editandoItemCronograma, setEditandoItemCronograma] =
    useState<ItemCronograma | null>(null);
  const [modalTipoCronograma, setModalTipoCronograma] = useState(false);
  const [modalMedicao, setModalMedicao] = useState(false);
  const [carregandoReplicar, setCarregandoReplicar] = useState(false);
  const [modalAteste, setModalAteste] = useState<Medicao | null>(null);
  const [modalDevolver, setModalDevolver] = useState<Medicao | null>(null);
  const [modalDetalhe, setModalDetalhe] = useState<Medicao | null>(null);
  const [discriminacoesDetalhe, setDiscriminacoesDetalhe] = useState<any[]>([]);
  const [execucaoFinanceira, setExecucaoFinanceira] = useState<any>(null);
  const [editandoDiscriminacao, setEditandoDiscriminacao] = useState<
    string | null
  >(null);
  const [motivoCorrecao, setMotivoCorrecao] = useState("");

  // Corrigir Boletim
  const [modalCorrigir, setModalCorrigir] = useState<Medicao | null>(null);
  const [abaCorrigir, setAbaCorrigir] = useState<
    "cabecalho" | "itens_cronograma" | "execucao_fiscal" | "discriminacoes"
  >("cabecalho");
  const [cabecalhoForm, setCabecalhoForm] = useState({
    competencia: "",
    periodo_inicio: "",
    periodo_fim: "",
    nota_fiscal_numero: "",
    nota_fiscal_valor: "",
    nota_fiscal_data: "",
    data_emissao: "",
    objeto_contrato: "",
  });
  const [discCorrigir, setDiscCorrigir] = useState<
    { descricao: string; valor: string; percentual: string }[]
  >([]);
  const [discValorTotalCorrigir, setDiscValorTotalCorrigir] = useState("");
  const [motivoDiscCorrigir, setMotivoDiscCorrigir] = useState("");
  const [salvandoCorrecao, setSalvandoCorrecao] = useState(false);
  const [pdfRegeneradoUrl, setPdfRegeneradoUrl] = useState<string | null>(null);
  const [regenerandoPdf, setRegenerandoPdf] = useState(false);
  const [itensCronoCorrigir, setItensCronoCorrigir] = useState<
    {
      id: string;
      numero_item: number;
      descricao: string;
      unidade_medida: string;
    }[]
  >([]);
  const [salvandoItensCrono, setSalvandoItensCrono] = useState(false);
  const [execFiscalForm, setExecFiscalForm] = useState({
    vigencia_inicio: "",
    vigencia_fim: "",
    dias_executados: "",
    dias_restantes: "",
    meses_executados: "",
    dias_executados_extra: "",
    meses_restantes: "",
    dias_restantes_extra: "",
  });
  const [execFiscalTotaisForm, setExecFiscalTotaisForm] = useState({
    fin_no_periodo_total: "",
    fin_ate_periodo_total: "",
    fin_a_executar_total: "",
  });
  const [execFiscalItens, setExecFiscalItens] = useState<
    {
      item_cronograma_id: string;
      numero: number;
      descricao: string;
      unidade: string;
      no_periodo: string;
      ate_periodo: string;
      a_executar: string;
      fin_no_periodo: number;
      fin_ate_periodo: number;
      fin_a_executar: number;
      fin_no_periodo_str: string;
      fin_ate_periodo_str: string;
      fin_a_executar_str: string;
      orig_descricao: string;
      orig_unidade: string;
    }[]
  >([]);
  const [carregandoExecFiscal, setCarregandoExecFiscal] = useState(false);
  const [salvandoExecFiscal, setSalvandoExecFiscal] = useState(false);
  const valorGlobalCronograma = Number(
    resumo?.valor_global ??
      contratoProp?.ciclo_ativo?.valor_global ??
      contratoProp?.valor_global ??
      valorGlobal ??
      0,
  );
  const usaCicloAtivo =
    contratoProp?.ciclo_ativo?.valor_global != null ||
    !!contratoProp?.data_renovacao_ciclo;
  const labelValorCronograma = usaCicloAtivo
    ? "Valor do ciclo"
    : "Valor do contrato";

  // Forms
  const [formEtapa, setFormEtapa] = useState({
    descricao: "",
    percentual_fisico: "",
    valor_previsto: "",
    data_inicio_prevista: "",
    data_fim_prevista: "",
    observacoes: "",
    itens: [] as {
      numero_item: string;
      descricao: string;
      unidade: string;
      quantidade: string;
      valor_unitario: string;
      valor_total: string;
      marca: string;
      modelo: string;
    }[],
  });
  const [formItemCronograma, setFormItemCronograma] = useState({
    numero_item: "",
    descricao: "",
    unidade_medida: "UNIDADE",
    quantidade: "",
    valor_unitario: "",
    quantidade_meses: "",
    valor_mensal: "",
    valor_total: "",
    observacoes: "",
    quantidade_medida: "", // Apenas para admin (ajuste migração)
    valor_medida_reais: "", // Para itens MENSAL: entrada alternativa em R$
    preservar_valor_total: false,
  });
  /** Layout espelhando cláusula de preço (m² × R$/m² × execuções por frequência) */
  const [modoClausulaContrato, setModoClausulaContrato] = useState(false);
  const [frequenciaContrato, setFrequenciaContrato] =
    useState<FrequenciaExecucaoContrato>("TRIMESTRAL");
  const [unidadeClausulaBase, setUnidadeClausulaBase] = useState<
    "METROS" | "LITROS"
  >("METROS");
  const [editandoMedidoItemId, setEditandoMedidoItemId] = useState<
    string | null
  >(null);
  const [editandoMedidoValor, setEditandoMedidoValor] = useState<string>("");
  const [formMedicao, setFormMedicao] = useState({
    periodo_inicio: "",
    periodo_fim: "",
    competencia: "",
    observacoes: "",
    valor_medido: "",
    nota_fiscal_numero: "",
    nota_fiscal_valor: "",
    nota_fiscal_data: "",
    itens: [] as (
      | {
          etapa_id: string;
          percentual_executado_atual: number;
          valor_executado_atual?: number;
          modo_input?: "percentual" | "valor";
        }
      | {
          item_cronograma_id: string;
          quantidade_medida: number;
          modo_input?: "quantidade" | "valor";
          valor_override?: number;
        }
    )[],
  });
  const [execucaoFinanceiraModal, setExecucaoFinanceiraModal] =
    useState<any>(null);
  const [formAteste, setFormAteste] = useState({
    observacoes: "",
    verificado_in_loco: false,
    motivo_devolucao_parcial: "",
  });
  const [itensAteste, setItensAteste] = useState<
    Record<string, { selecionado: boolean; observacoes: string }>
  >({});

  const [motivoDevolucao, setMotivoDevolucao] = useState("");
  const [anexosMedicao, setAnexosMedicao] = useState<any[]>([]);
  const [loadingAnexos, setLoadingAnexos] = useState(false);
  const [discriminacoes, setDiscriminacoes] = useState<
    { descricao: string; valor: number; percentual: number }[]
  >([]);
  const [arquivosPendentes, setArquivosPendentes] = useState<
    { file: File; tipo: "FOTO" | "DOCUMENTO"; descricao: string }[]
  >([]);
  const [modalOtp, setModalOtp] = useState(false);
  const [otpMedicaoId, setOtpMedicaoId] = useState<string | null>(null);
  const [otpEtapa, setOtpEtapa] = useState<"enviar" | "codigo" | "sucesso">(
    "enviar",
  );
  const [otpFornecedorNome, setOtpFornecedorNome] = useState<string | null>(
    null,
  );
  const [otpCodigo, setOtpCodigo] = useState("");
  const [otpCanais, setOtpCanais] = useState<{
    telefone_mascarado?: string;
  } | null>(null);
  const [otpErro, setOtpErro] = useState<string | null>(null);
  const [otpCodigoValidacao, setOtpCodigoValidacao] = useState<string | null>(
    null,
  );
  const [otpLoading, setOtpLoading] = useState(false);

  const abrirDetalhe = async (m: Medicao) => {
    setModalDetalhe(m);
    setAnexosMedicao([]);
    setDiscriminacoesDetalhe([]);
    setExecucaoFinanceira(null);
    setEditandoDiscriminacao(null);
    setMotivoCorrecao("");
    setLoadingAnexos(true);
    try {
      const [anexosRes, discRes, execRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}/anexos`),
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}/discriminacoes`),
        authFetch(
          `${API_URL}/api/contratos/${contratoId}/execucao-financeira?medicaoId=${m.id}`,
        ),
      ]);
      if (anexosRes.ok) setAnexosMedicao(await anexosRes.json());
      if (discRes.ok) setDiscriminacoesDetalhe(await discRes.json());
      if (execRes.ok) setExecucaoFinanceira(await execRes.json());
    } catch {}
    setLoadingAnexos(false);
  };

  const handleCorrigirDiscriminacao = async (
    discId: string,
    dados: { descricao?: string; valor?: number; percentual?: number },
  ) => {
    if (!motivoCorrecao.trim()) {
      alert("Informe o motivo da correção");
      return;
    }
    try {
      const medicaoId = modalDetalhe?.id;
      if (!medicaoId) return;
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${medicaoId}/discriminacoes/${discId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...dados, motivo_correcao: motivoCorrecao }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setDiscriminacoesDetalhe((prev) =>
          prev.map((d) => (d.id === discId ? updated : d)),
        );
        setEditandoDiscriminacao(null);
        setMotivoCorrecao("");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Erro ao corrigir discriminação");
      }
    } catch {
      alert("Erro ao corrigir discriminação");
    }
  };

  const abrirModalCorrigir = async (m: Medicao) => {
    setModalCorrigir(m);
    setAbaCorrigir("cabecalho");
    setPdfRegeneradoUrl(null);
    setCabecalhoForm({
      competencia: m.competencia ?? "",
      periodo_inicio: m.periodo_inicio ? m.periodo_inicio.slice(0, 10) : "",
      periodo_fim: m.periodo_fim ? m.periodo_fim.slice(0, 10) : "",
      nota_fiscal_numero: m.nota_fiscal_numero ?? "",
      nota_fiscal_valor:
        m.nota_fiscal_valor != null ? String(m.nota_fiscal_valor) : "",
      nota_fiscal_data: m.nota_fiscal_data
        ? m.nota_fiscal_data.slice(0, 10)
        : "",
      data_emissao: m.boletim_data_emissao
        ? m.boletim_data_emissao.slice(0, 10)
        : "",
      objeto_contrato: contratoProp?.objeto ?? "",
    });
    // Itens cronograma (cópia editável)
    setItensCronoCorrigir(
      itensCronograma.map((ic) => ({
        id: ic.id,
        numero_item: ic.numero_item,
        descricao: ic.descricao,
        unidade_medida: ic.unidade_medida,
      })),
    );
    // Execução fiscal — campos globais
    const ef = m.execucao_fiscal;
    const efOverrides: any[] = (ef as any)?.item_overrides || [];
    const efTotaisOverrides: any = (ef as any)?.totais_financeiros || {};
    setExecFiscalForm({
      vigencia_inicio: ef?.vigencia_inicio
        ? ef.vigencia_inicio.slice(0, 10)
        : "",
      vigencia_fim: ef?.vigencia_fim ? ef.vigencia_fim.slice(0, 10) : "",
      dias_executados:
        ef?.dias_executados != null ? String(ef.dias_executados) : "",
      dias_restantes:
        ef?.dias_restantes != null ? String(ef.dias_restantes) : "",
      meses_executados:
        ef?.meses_executados != null ? String(ef.meses_executados) : "",
      dias_executados_extra:
        ef?.dias_executados_extra != null
          ? String(ef.dias_executados_extra)
          : "",
      meses_restantes:
        ef?.meses_restantes != null ? String(ef.meses_restantes) : "",
      dias_restantes_extra:
        ef?.dias_restantes_extra != null ? String(ef.dias_restantes_extra) : "",
    });
    setExecFiscalTotaisForm({
      fin_no_periodo_total:
        efTotaisOverrides?.no_periodo != null
          ? String(efTotaisOverrides.no_periodo)
          : "",
      fin_ate_periodo_total:
        efTotaisOverrides?.ate_periodo != null
          ? String(efTotaisOverrides.ate_periodo)
          : "",
      fin_a_executar_total:
        efTotaisOverrides?.a_executar != null
          ? String(efTotaisOverrides.a_executar)
          : "",
    });
    // Execução fiscal — itens: carrega apenas os itens medidos (igual ao PDF)
    // usando buscarMedicaoCompleta (GET /medicoes/:id) + execução financeira para valores
    setCarregandoExecFiscal(true);
    setExecFiscalItens([]);
    try {
      const [resMed, resEf] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}`),
        authFetch(
          `${API_URL}/api/contratos/${contratoId}/execucao-financeira?medicaoId=${m.id}`,
        ),
      ]);
      if (resMed.ok && resEf.ok) {
        const medData = await resMed.json();
        const efData = await resEf.json();
        setExecFiscalTotaisForm((prev) => ({
          fin_no_periodo_total:
            prev.fin_no_periodo_total !== ""
              ? prev.fin_no_periodo_total
              : efData?.totais?.no_periodo != null
                ? String(efData.totais.no_periodo)
                : "",
          fin_ate_periodo_total:
            prev.fin_ate_periodo_total !== ""
              ? prev.fin_ate_periodo_total
              : efData?.totais?.ate_periodo != null
                ? String(efData.totais.ate_periodo)
                : "",
          fin_a_executar_total:
            prev.fin_a_executar_total !== ""
              ? prev.fin_a_executar_total
              : efData?.totais?.a_executar != null
                ? String(efData.totais.a_executar)
                : "",
        }));
        // efMap: item_cronograma_id → valores financeiros calculados
        const efMap: Record<string, any> = {};
        for (const it of efData.itens || []) {
          if (it.etapa_id) efMap[it.etapa_id] = it;
        }
        // Filtrar apenas itens com tipo_item === 'item_cronograma' (os que aparecem no PDF)
        const medItens: any[] = (medData.itens || []).filter(
          (i: any) => i.tipo_item === "item_cronograma",
        );
        const itens = medItens.map((item: any) => {
          const icId = item.item_cronograma_id || "";
          const ef = efMap[icId] || {};
          const ov = efOverrides.find(
            (o: any) => o.item_cronograma_id === icId,
          );
          const origDescricao = item.item_descricao || "";
          const origUnidade = item.item_unidade || "";
          return {
            item_cronograma_id: icId,
            numero: item.item_numero,
            descricao: ov?.descricao ?? origDescricao,
            unidade: ov?.unidade ?? origUnidade,
            no_periodo:
              ov?.no_periodo != null
                ? String(ov.no_periodo)
                : ef.quantidade_no_periodo != null
                  ? String(ef.quantidade_no_periodo)
                  : String(item.quantidade_medida ?? ""),
            ate_periodo:
              ov?.ate_periodo != null
                ? String(ov.ate_periodo)
                : ef.quantidade_ate_periodo != null
                  ? String(ef.quantidade_ate_periodo)
                  : "",
            a_executar:
              ov?.a_executar != null
                ? String(ov.a_executar)
                : ef.quantidade_a_executar != null
                  ? String(ef.quantidade_a_executar)
                  : "",
            fin_no_periodo: ef.no_periodo ?? 0,
            fin_ate_periodo: ef.ate_periodo ?? 0,
            fin_a_executar: ef.a_executar ?? 0,
            fin_no_periodo_str:
              ov?.fin_no_periodo != null
                ? String(ov.fin_no_periodo)
                : ef.no_periodo != null
                  ? String(ef.no_periodo)
                  : "",
            fin_ate_periodo_str:
              ov?.fin_ate_periodo != null
                ? String(ov.fin_ate_periodo)
                : ef.ate_periodo != null
                  ? String(ef.ate_periodo)
                  : "",
            fin_a_executar_str:
              ov?.fin_a_executar != null
                ? String(ov.fin_a_executar)
                : ef.a_executar != null
                  ? String(ef.a_executar)
                  : "",
            orig_descricao: origDescricao,
            orig_unidade: origUnidade,
          };
        });
        // Ordenar por numero_item
        itens.sort((a, b) => a.numero - b.numero);
        setExecFiscalItens(itens);
      }
    } catch {
    } finally {
      setCarregandoExecFiscal(false);
    }
    // Carregar discriminações existentes
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${m.id}/discriminacoes`,
      );
      if (res.ok) {
        const disc = await res.json();
        setDiscCorrigir(
          disc.map((d: any) => ({
            descricao: d.descricao,
            valor: String(d.valor),
            percentual: String(d.percentual),
          })),
        );
      }
    } catch {}
    setDiscValorTotalCorrigir(
      m.valor_medido != null ? String(m.valor_medido) : "",
    );
    setMotivoDiscCorrigir("");
  };

  const salvarCabecalho = async () => {
    if (!modalCorrigir) return;
    setSalvandoCorrecao(true);
    try {
      const body: any = {};
      if (cabecalhoForm.competencia !== (modalCorrigir.competencia ?? ""))
        body.competencia = cabecalhoForm.competencia;
      if (
        cabecalhoForm.periodo_inicio !==
        modalCorrigir.periodo_inicio?.slice(0, 10)
      )
        body.periodo_inicio = cabecalhoForm.periodo_inicio;
      if (cabecalhoForm.periodo_fim !== modalCorrigir.periodo_fim?.slice(0, 10))
        body.periodo_fim = cabecalhoForm.periodo_fim;
      if (
        cabecalhoForm.nota_fiscal_numero !==
        (modalCorrigir.nota_fiscal_numero ?? "")
      )
        body.nota_fiscal_numero = cabecalhoForm.nota_fiscal_numero;
      if (
        cabecalhoForm.nota_fiscal_valor !==
        (modalCorrigir.nota_fiscal_valor != null
          ? String(modalCorrigir.nota_fiscal_valor)
          : "")
      ) {
        body.nota_fiscal_valor =
          cabecalhoForm.nota_fiscal_valor !== ""
            ? Number(cabecalhoForm.nota_fiscal_valor.replace(",", "."))
            : null;
      }
      if (
        cabecalhoForm.nota_fiscal_data !==
        (modalCorrigir.nota_fiscal_data?.slice(0, 10) ?? "")
      )
        body.nota_fiscal_data = cabecalhoForm.nota_fiscal_data || null;
      if (
        cabecalhoForm.data_emissao !==
        (modalCorrigir.boletim_data_emissao?.slice(0, 10) ?? "")
      )
        body.data_emissao = cabecalhoForm.data_emissao || null;
      if (cabecalhoForm.objeto_contrato !== (contratoProp?.objeto ?? ""))
        body.objeto_contrato = cabecalhoForm.objeto_contrato;
      if (Object.keys(body).length === 0) {
        alert("Nenhuma alteração detectada.");
        return;
      }
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${modalCorrigir.id}/corrigir`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      if (res.ok) {
        alert(
          'Cabeçalho salvo! Clique em "Regenerar PDF" para atualizar o documento.',
        );
        carregarDados();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Erro ao salvar cabeçalho");
      }
    } catch {
      alert("Erro ao salvar cabeçalho");
    } finally {
      setSalvandoCorrecao(false);
    }
  };

  const salvarDiscriminacoes = async () => {
    if (!modalCorrigir) return;
    if (!motivoDiscCorrigir.trim()) {
      alert("Informe o motivo da correção");
      return;
    }
    setSalvandoCorrecao(true);
    try {
      const valorTotal =
        discValorTotalCorrigir.trim() !== ""
          ? Number(discValorTotalCorrigir.replace(",", "."))
          : null;

      if (valorTotal == null || Number.isNaN(valorTotal)) {
        alert("Informe um valor total válido");
        return;
      }

      const itens = discCorrigir.map((d) => ({
        descricao: d.descricao,
        valor: Number(d.valor.replace(",", ".")),
        percentual: Number(d.percentual.replace(",", ".")),
      }));

      const resCabecalho = await authFetch(
        `${API_URL}/api/contratos/medicoes/${modalCorrigir.id}/corrigir`,
        {
          method: "PATCH",
          body: JSON.stringify({ valor_medido: valorTotal }),
        },
      );

      if (!resCabecalho.ok) {
        const err = await resCabecalho.json().catch(() => ({}));
        alert(err.message || "Erro ao salvar valor total da medição");
        return;
      }

      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${modalCorrigir.id}/discriminacoes`,
        {
          method: "PUT",
          body: JSON.stringify({ itens, motivo_correcao: motivoDiscCorrigir }),
        },
      );
      if (res.ok) {
        alert(
          'Discriminações salvas! Clique em "Regenerar PDF" para atualizar o documento.',
        );
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Erro ao salvar discriminações");
      }
    } catch {
      alert("Erro ao salvar discriminações");
    } finally {
      setSalvandoCorrecao(false);
    }
  };

  const salvarItensCronograma = async () => {
    setSalvandoItensCrono(true);
    let erros = 0;
    try {
      for (const ic of itensCronoCorrigir) {
        const original = itensCronograma.find((o) => o.id === ic.id);
        if (!original) continue;
        if (
          ic.descricao === original.descricao &&
          ic.unidade_medida === original.unidade_medida
        )
          continue;
        const res = await authFetch(
          `${API_URL}/api/contratos/itens-cronograma/${ic.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              descricao: ic.descricao,
              unidade_medida: ic.unidade_medida,
            }),
          },
        );
        if (!res.ok) erros++;
      }
      if (erros === 0) {
        alert(
          'Itens salvos! Clique em "Regenerar PDF" para atualizar o documento.',
        );
        carregarDados();
      } else {
        alert(`${erros} item(ns) não puderam ser salvos.`);
      }
    } catch {
      alert("Erro ao salvar itens");
    } finally {
      setSalvandoItensCrono(false);
    }
  };

  const salvarExecucaoFiscal = async () => {
    if (!modalCorrigir) return;
    setSalvandoExecFiscal(true);
    try {
      const body: any = {};
      if (execFiscalForm.vigencia_inicio)
        body.vigencia_inicio = execFiscalForm.vigencia_inicio;
      if (execFiscalForm.vigencia_fim)
        body.vigencia_fim = execFiscalForm.vigencia_fim;
      if (execFiscalForm.dias_executados !== "")
        body.dias_executados = Number(execFiscalForm.dias_executados);
      if (execFiscalForm.dias_restantes !== "")
        body.dias_restantes = Number(execFiscalForm.dias_restantes);
      if (execFiscalForm.meses_executados !== "")
        body.meses_executados = Number(execFiscalForm.meses_executados);
      if (execFiscalForm.dias_executados_extra !== "")
        body.dias_executados_extra = Number(
          execFiscalForm.dias_executados_extra,
        );
      if (execFiscalForm.meses_restantes !== "")
        body.meses_restantes = Number(execFiscalForm.meses_restantes);
      if (execFiscalForm.dias_restantes_extra !== "")
        body.dias_restantes_extra = Number(execFiscalForm.dias_restantes_extra);
      const finNoPeriodoTotal =
        execFiscalTotaisForm.fin_no_periodo_total !== ""
          ? parseFloat(execFiscalTotaisForm.fin_no_periodo_total.replace(",", "."))
          : undefined;
      const finAtePeriodoTotal =
        execFiscalTotaisForm.fin_ate_periodo_total !== ""
          ? parseFloat(execFiscalTotaisForm.fin_ate_periodo_total.replace(",", "."))
          : undefined;
      const finAExecutarTotal =
        execFiscalTotaisForm.fin_a_executar_total !== ""
          ? parseFloat(execFiscalTotaisForm.fin_a_executar_total.replace(",", "."))
          : undefined;
      body.totais_financeiros = {
        no_periodo:
          execFiscalTotaisForm.fin_no_periodo_total === ""
            ? null
            : finNoPeriodoTotal != null && !isNaN(finNoPeriodoTotal)
              ? finNoPeriodoTotal
              : undefined,
        ate_periodo:
          execFiscalTotaisForm.fin_ate_periodo_total === ""
            ? null
            : finAtePeriodoTotal != null && !isNaN(finAtePeriodoTotal)
              ? finAtePeriodoTotal
              : undefined,
        a_executar:
          execFiscalTotaisForm.fin_a_executar_total === ""
            ? null
            : finAExecutarTotal != null && !isNaN(finAExecutarTotal)
              ? finAExecutarTotal
              : undefined,
      };
      // Sempre salva item_overrides (mesmo que vazio, para limpar overrides anteriores)
      if (execFiscalItens.length > 0) {
        body.item_overrides = execFiscalItens.map((it) => {
          const finNoPeriodo =
            it.fin_no_periodo_str !== ""
              ? parseFloat(it.fin_no_periodo_str.replace(",", "."))
              : undefined;
          const finAtePeriodo =
            it.fin_ate_periodo_str !== ""
              ? parseFloat(it.fin_ate_periodo_str.replace(",", "."))
              : undefined;
          const finAExecutar =
            it.fin_a_executar_str !== ""
              ? parseFloat(it.fin_a_executar_str.replace(",", "."))
              : undefined;
          return {
            item_cronograma_id: it.item_cronograma_id,
            no_periodo:
              it.no_periodo !== "" ? Number(it.no_periodo) : undefined,
            ate_periodo:
              it.ate_periodo !== "" ? Number(it.ate_periodo) : undefined,
            a_executar:
              it.a_executar !== "" ? Number(it.a_executar) : undefined,
            descricao:
              it.descricao !== it.orig_descricao ? it.descricao : undefined,
            unidade: it.unidade !== it.orig_unidade ? it.unidade : undefined,
            fin_no_periodo:
              finNoPeriodo != null && !isNaN(finNoPeriodo)
                ? finNoPeriodo
                : undefined,
            fin_ate_periodo:
              finAtePeriodo != null && !isNaN(finAtePeriodo)
                ? finAtePeriodo
                : undefined,
            fin_a_executar:
              finAExecutar != null && !isNaN(finAExecutar)
                ? finAExecutar
                : undefined,
          };
        });
      }
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${modalCorrigir.id}/execucao-fiscal`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      if (res.ok) {
        alert(
          'Execução fiscal salva! Clique em "Regenerar PDF" para atualizar o documento.',
        );
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Erro ao salvar execução fiscal");
      }
    } catch {
      alert("Erro ao salvar execução fiscal");
    } finally {
      setSalvandoExecFiscal(false);
    }
  };

  const regenerarBoletim = async () => {
    if (!modalCorrigir) return;
    setRegenerandoPdf(true);
    setPdfRegeneradoUrl(null);
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${modalCorrigir.id}/regenerar-boletim`,
        { method: "POST" },
      );
      if (res.ok) {
        const data = await res.json();
        setPdfRegeneradoUrl(`${API_URL}${data.pdf_url}`);
        carregarDados();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Erro ao regenerar PDF");
      }
    } catch {
      alert("Erro ao regenerar PDF");
    } finally {
      setRegenerandoPdf(false);
    }
  };

  const handleExcluirAnexoOrgao = async (
    anexoId: string,
    nomeAnexo: string,
  ) => {
    if (!confirm(`Deseja excluir o anexo "${nomeAnexo}"?`)) return;
    if (
      !confirm(
        "CONFIRMAÇÃO FINAL: Esta ação é irreversível. Tem certeza que deseja excluir este arquivo?",
      )
    )
      return;
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/anexos/${anexoId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setAnexosMedicao((prev) => prev.filter((a) => a.id !== anexoId));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Erro ao excluir anexo");
      }
    } catch {
      alert("Erro ao excluir anexo");
    }
  };

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [resEtapas, resItens, resUnidades, resMedicoes, resResumo] =
        await Promise.all([
          authFetch(`${API_URL}/api/contratos/${contratoId}/etapas`),
          authFetch(`${API_URL}/api/contratos/${contratoId}/itens-cronograma`),
          authFetch(`${API_URL}/api/contratos/unidades-cronograma`),
          authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes`),
          authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes/resumo`),
        ]);
      if (resEtapas.ok) setEtapas(await resEtapas.json());
      if (resItens.ok) setItensCronograma(await resItens.json());
      if (resUnidades.ok) {
        const data = await resUnidades.json();
        if (data.unidades?.length) setUnidadesCronograma(data.unidades);
      }
      if (resMedicoes.ok) setMedicoes(await resMedicoes.json());
      if (resResumo.ok) setResumo(await resResumo.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [contratoId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const osAtiva = resumo?.os_ativa;
  const temOSAutorizada =
    isServicoContinuado ||
    (osAtiva &&
      ["AUTORIZADA", "EM_EXECUCAO", "ORDEM_GERADA"].includes(osAtiva.status));
  const usarItensCronograma = itensCronograma.length > 0;
  const temCronograma = etapas.length > 0 || itensCronograma.length > 0;

  // Medições separadas por status
  const medicoesPendentesAteste = medicoes.filter(
    (m) => m.status === "SUBMETIDA" || m.status === "PARCIALMENTE_ATESTADA",
  );
  const medicoesEmAndamento = medicoes.filter((m) =>
    ["RASCUNHO", "AGUARDANDO_APROVACAO", "DEVOLVIDA"].includes(m.status),
  );
  const medicoesFinalizadas = medicoes.filter((m) =>
    ["APROVADA", "REJEITADA"].includes(m.status),
  );

  // ============ ETAPAS ============

  const abrirModalEtapa = (etapa?: Etapa) => {
    if (etapa) {
      setEditandoEtapa(etapa);
      setFormEtapa({
        descricao: etapa.descricao,
        percentual_fisico: etapa.percentual_fisico.toString(),
        valor_previsto: etapa.valor_previsto.toString(),
        data_inicio_prevista: etapa.data_inicio_prevista?.split("T")[0] || "",
        data_fim_prevista: etapa.data_fim_prevista?.split("T")[0] || "",
        observacoes: "",
        itens: (etapa.itens || []).map((item, idx) => ({
          numero_item: String(item.numero_item || idx + 1),
          descricao: item.descricao || "",
          unidade: item.unidade || "",
          quantidade: item.quantidade?.toString() || "",
          valor_unitario: item.valor_unitario?.toString() || "",
          valor_total: item.valor_total?.toString() || "",
          marca: item.marca || "",
          modelo: item.modelo || "",
        })),
      });
    } else {
      setEditandoEtapa(null);
      setFormEtapa({
        descricao: "",
        percentual_fisico: "",
        valor_previsto: "",
        data_inicio_prevista: "",
        data_fim_prevista: "",
        observacoes: "",
        itens: [],
      });
    }
    setModalEtapa(true);
  };

  // Calcula saldo disponível para etapas (valor e percentual)
  const somaValorEtapas = etapas.reduce(
    (sum, e) => sum + Number(e.valor_previsto),
    0,
  );
  const somaPercentualEtapas = etapas.reduce(
    (sum, e) => sum + Number(e.percentual_fisico),
    0,
  );
  const saldoValorEtapas = valorGlobalCronograma - somaValorEtapas;
  const saldoPercentualEtapas = 100 - somaPercentualEtapas;
  const totalItensFormEtapa = formEtapa.itens.reduce(
    (sum, item) => sum + (parseFloat(item.valor_total) || 0),
    0,
  );
  const adicionarItemEtapa = () => {
    setFormEtapa({
      ...formEtapa,
      itens: [
        ...formEtapa.itens,
        {
          numero_item: String(formEtapa.itens.length + 1),
          descricao: "",
          unidade: "UN",
          quantidade: "",
          valor_unitario: "",
          valor_total: "",
          marca: "",
          modelo: "",
        },
      ],
    });
  };
  const atualizarItemEtapa = (
    idx: number,
    campo:
      | "numero_item"
      | "descricao"
      | "unidade"
      | "quantidade"
      | "valor_unitario"
      | "valor_total"
      | "marca"
      | "modelo",
    valor: string,
  ) => {
    const itens = [...formEtapa.itens];
    const item = { ...itens[idx], [campo]: valor };
    if (campo === "quantidade" || campo === "valor_unitario") {
      const qtd = parseFloat(campo === "quantidade" ? valor : item.quantidade);
      const unit = parseFloat(
        campo === "valor_unitario" ? valor : item.valor_unitario,
      );
      item.valor_total =
        Number.isFinite(qtd) && Number.isFinite(unit)
          ? (qtd * unit).toFixed(2)
          : item.valor_total;
    }
    itens[idx] = item;
    setFormEtapa({ ...formEtapa, itens });
  };
  const removerItemEtapa = (idx: number) => {
    setFormEtapa({
      ...formEtapa,
      itens: formEtapa.itens
        .filter((_, itemIdx) => itemIdx !== idx)
        .map((item, itemIdx) => ({ ...item, numero_item: String(itemIdx + 1) })),
    });
  };

  const salvarEtapa = async () => {
    const novoValor = parseFloat(formEtapa.valor_previsto) || 0;
    const novoPercentual = parseFloat(formEtapa.percentual_fisico) || 0;

    // Saldo excluindo a etapa sendo editada
    const somaValorOutras = editandoEtapa
      ? etapas
          .filter((e) => e.id !== editandoEtapa.id)
          .reduce((sum, e) => sum + Number(e.valor_previsto), 0)
      : somaValorEtapas;
    const somaPercentualOutras = editandoEtapa
      ? etapas
          .filter((e) => e.id !== editandoEtapa.id)
          .reduce((sum, e) => sum + Number(e.percentual_fisico), 0)
      : somaPercentualEtapas;

    if (somaValorOutras + novoValor > valorGlobalCronograma + 0.01) {
      const disponivel = Math.max(0, valorGlobalCronograma - somaValorOutras);
      alert(
        `O valor da etapa (R$ ${novoValor.toFixed(2)}) excede o saldo disponível.\n\n${labelValorCronograma}: R$ ${valorGlobalCronograma.toFixed(2)}\nJá alocado: R$ ${somaValorOutras.toFixed(2)}\nDisponível: R$ ${disponivel.toFixed(2)}`,
      );
      return;
    }

    if (somaPercentualOutras + novoPercentual > 100.01) {
      const disponivel = Math.max(0, 100 - somaPercentualOutras);
      alert(
        `O percentual da etapa (${novoPercentual.toFixed(2)}%) excede o disponível.\n\nJá alocado: ${somaPercentualOutras.toFixed(2)}%\nDisponível: ${disponivel.toFixed(2)}%`,
      );
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        descricao: formEtapa.descricao,
        percentual_fisico: novoPercentual,
        valor_previsto: novoValor,
        data_inicio_prevista: formEtapa.data_inicio_prevista,
        data_fim_prevista: formEtapa.data_fim_prevista,
        observacoes: formEtapa.observacoes || null,
        itens: formEtapa.itens
          .filter((item) => item.descricao.trim())
          .map((item, idx) => ({
            numero_item: parseInt(item.numero_item, 10) || idx + 1,
            descricao: item.descricao.trim(),
            unidade: item.unidade || null,
            quantidade: parseFloat(item.quantidade) || 0,
            valor_unitario: parseFloat(item.valor_unitario) || 0,
            valor_total: parseFloat(item.valor_total) || 0,
            marca: item.marca || null,
            modelo: item.modelo || null,
          })),
      };
      const url = editandoEtapa
        ? `${API_URL}/api/contratos/etapas/${editandoEtapa.id}`
        : `${API_URL}/api/contratos/${contratoId}/etapas`;
      const method = editandoEtapa ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Erro");
        return;
      }
      setModalEtapa(false);
      carregarDados();
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  const excluirEtapa = async (etapaId: string) => {
    if (!confirm("Excluir esta etapa?")) return;
    await authFetch(`${API_URL}/api/contratos/etapas/${etapaId}`, {
      method: "DELETE",
    });
    carregarDados();
  };

  // ============ ITENS DO CRONOGRAMA ============

  const abrirModalItemCronograma = (item?: ItemCronograma) => {
    if (item) {
      const freqSalva = parseFrequenciaSalva(item.frequencia_execucao);
      setFrequenciaContrato(freqSalva ?? "TRIMESTRAL");
      setEditandoItemCronograma(item);
      const metroLike =
        item.unidade_medida === "METROS" || item.unidade_medida === "LITROS";
      setModoClausulaContrato(metroLike && item.unidade_medida !== "MENSAL");
      setUnidadeClausulaBase(
        item.unidade_medida === "LITROS" ? "LITROS" : "METROS",
      );
      const itemQtd = Number(item.quantidade) || 0;
      const itemValorUnitario = Number(item.valor_unitario) || 0;
      const itemMeses =
        item.unidade_medida !== "MENSAL" && item.quantidade_meses != null
          ? Number(item.quantidade_meses)
          : null;
      const totalCalculadoItem =
        item.unidade_medida === "MENSAL"
          ? aplicarRegraMoedaContrato(itemQtd * itemValorUnitario)
          : itemMeses
            ? aplicarRegraMoedaContrato(itemQtd * itemValorUnitario * itemMeses)
            : aplicarRegraMoedaContrato(itemQtd * itemValorUnitario);
      const preservarValorTotal =
        Math.abs(Number(item.valor_total) - totalCalculadoItem) > 0.01 &&
        Math.abs(Number(item.valor_total) - totalCalculadoItem) <= 1;
      setFormItemCronograma({
        numero_item: String(item.numero_item),
        descricao: item.descricao,
        unidade_medida: item.unidade_medida,
        quantidade: String(item.quantidade),
        valor_unitario: String(item.valor_unitario),
        quantidade_meses:
          item.quantidade_meses != null ? String(item.quantidade_meses) : "",
        valor_mensal:
          item.unidade_medida === "MENSAL"
            ? String(Number(item.valor_mensal || item.valor_unitario))
            : String(Number(item.quantidade) * Number(item.valor_unitario)),
        valor_total: String(Number(item.valor_total)),
        observacoes: item.observacoes || "",
        quantidade_medida: String(Number(item.quantidade_medida) || 0),
        valor_medida_reais:
          item.unidade_medida === "MENSAL" && Number(item.quantidade_medida) > 0
            ? String(
                Number(
                  item.valor_migracao_reais ??
                    prodTrunc(
                      Number(item.quantidade_medida),
                      Number(item.valor_unitario),
                    ),
                ),
              )
            : "",
        preservar_valor_total: preservarValorTotal,
      });
    } else {
      setEditandoItemCronograma(null);
      setFrequenciaContrato("TRIMESTRAL");
      setModoClausulaContrato(false);
      setUnidadeClausulaBase("METROS");
      setFormItemCronograma({
        numero_item: "",
        descricao: "",
        unidade_medida: "UNIDADE",
        quantidade: "",
        valor_unitario: "",
        quantidade_meses: "",
        valor_mensal: "",
        valor_total: "",
        observacoes: "",
        quantidade_medida: "",
        valor_medida_reais: "",
        preservar_valor_total: false,
      });
    }
    setModalItemCronograma(true);
  };

  const somaValorItensCronograma = itensCronograma.reduce(
    (sum, i) => sum + Number(i.valor_total),
    0,
  );
  const saldoValorItens = valorGlobalCronograma - somaValorItensCronograma;
  const proximoNumeroItemCronograma =
    itensCronograma.length > 0
      ? Math.max(...itensCronograma.map((i) => i.numero_item)) + 1
      : 1;

  const mesesVigenciaModal = mesesVigenciaContrato(
    contratoProp?.data_vigencia_inicio,
    contratoProp?.data_vigencia_fim,
  );
  const execucoesSugeridasModal = execucoesSugeridasPorFrequencia(
    mesesVigenciaModal,
    frequenciaContrato,
  );

  const aplicarRegraMoedaContrato = (valor: number) => {
    const n = Number(valor);
    if (!Number.isFinite(n)) return 0;
    return contratoProp?.arredondar_calculo ?? true
      ? Math.round(n * 100) / 100
      : truncar2Casas(n);
  };

  const distribuirValoresMensaisPorTotal = (
    itens: Array<{
      id: string;
      valorUnitario: number;
      quantidadeValor: number;
      saldoFinanceiro: number;
    }>,
  ) => {
    const arredondar = contratoProp?.arredondar_calculo ?? true;
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

  const totaisFormItemCronograma = (
    qStr: string,
    vlStr: string,
    mesesStr: string,
    isMensal: boolean,
  ) => {
    const q = parseFloat(qStr) || 0;
    const vl = parseFloat(vlStr) || 0;
    const meses = mesesStr ? parseInt(mesesStr, 10) : null;
    if (isMensal) {
      const mensal = vl ? String(aplicarRegraMoedaContrato(vl)) : "";
      const total = q && vl ? String(aplicarRegraMoedaContrato(q * vl)) : "";
      return { valor_mensal: mensal, valor_total: total };
    }
    const vlMensal = q * vl;
    const novoTotal = meses != null && meses > 0 ? q * vl * meses : vlMensal;
    return {
      valor_mensal: q && vl ? String(aplicarRegraMoedaContrato(vlMensal)) : "",
      valor_total: q && vl ? String(aplicarRegraMoedaContrato(novoTotal)) : "",
    };
  };

  const unidadeFormItemCronograma = modoClausulaContrato
    ? unidadeClausulaBase
    : formItemCronograma.unidade_medida;
  const quantidadeFormItemCronograma =
    parseFloat(formItemCronograma.quantidade) || 0;
  const valorUnitarioFormItemCronograma =
    parseFloat(formItemCronograma.valor_unitario) || 0;
  const valorDisponivelEdicaoItemCronograma = editandoItemCronograma
    ? saldoValorItens + Number(editandoItemCronograma.valor_total)
    : saldoValorItens;
  const valorTotalFormItemCronograma =
    parseFloat(formItemCronograma.valor_total) || 0;
  const diferencaValorItemCronograma = aplicarRegraMoedaContrato(
    valorDisponivelEdicaoItemCronograma - valorTotalFormItemCronograma,
  );
  const podePreservarTotalJuridicoItem =
    quantidadeFormItemCronograma > 0 &&
    valorUnitarioFormItemCronograma > 0 &&
    valorDisponivelEdicaoItemCronograma > 0 &&
    valorTotalFormItemCronograma > 0 &&
    Math.abs(diferencaValorItemCronograma) > 0.01 &&
    Math.abs(diferencaValorItemCronograma) <= 1;
  const diferencaValorItemMensal =
    unidadeFormItemCronograma === "MENSAL" && quantidadeFormItemCronograma > 0
      ? aplicarRegraMoedaContrato(
          valorDisponivelEdicaoItemCronograma - valorTotalFormItemCronograma,
        )
      : 0;
  const deveAvisarDiferencaMensal =
    unidadeFormItemCronograma === "MENSAL" &&
    quantidadeFormItemCronograma > 0 &&
    valorUnitarioFormItemCronograma > 0 &&
    Math.abs(diferencaValorItemMensal) > 0.01;
  const valorMensalSugeridoPeloDisponivel =
    quantidadeFormItemCronograma > 0
      ? valorDisponivelEdicaoItemCronograma / quantidadeFormItemCronograma
      : 0;
  const diferencaMensalApenasCentavos =
    unidadeFormItemCronograma === "MENSAL" &&
    Math.abs(diferencaValorItemMensal) > 0.01 &&
    Math.abs(diferencaValorItemMensal) <= 0.05;
  const valorTotalConsideradoItemMensal =
    diferencaMensalApenasCentavos
      ? valorDisponivelEdicaoItemCronograma
      : valorTotalFormItemCronograma;
  const valorTotalConsideradoItemCronograma =
    podePreservarTotalJuridicoItem && formItemCronograma.preservar_valor_total
      ? valorDisponivelEdicaoItemCronograma
      : valorTotalConsideradoItemMensal;

  const aplicarValorMensalPeloDisponivel = () => {
    if (!quantidadeFormItemCronograma || valorMensalSugeridoPeloDisponivel <= 0) {
      return;
    }
    setFormItemCronograma((prev) => ({
      ...prev,
      valor_unitario: String(valorMensalSugeridoPeloDisponivel),
      ...totaisFormItemCronograma(
        prev.quantidade,
        String(valorMensalSugeridoPeloDisponivel),
        "",
        true,
      ),
    }));
  };

  const salvarItemCronograma = async () => {
    const qtd = parseFloat(formItemCronograma.quantidade) || 0;
    const vlUnit = parseFloat(formItemCronograma.valor_unitario) || 0;
    const unidadePayload = modoClausulaContrato
      ? unidadeClausulaBase
      : formItemCronograma.unidade_medida;
    const isMensalUnit = unidadePayload === "MENSAL";
    const meses = isMensalUnit
      ? null
      : formItemCronograma.quantidade_meses
        ? parseInt(formItemCronograma.quantidade_meses, 10)
        : null;
    const vlMensal = isMensalUnit
      ? aplicarRegraMoedaContrato(vlUnit)
      : aplicarRegraMoedaContrato(qtd * vlUnit);
    let novoValorTotal = isMensalUnit
      ? aplicarRegraMoedaContrato(qtd * vlUnit)
      : meses
        ? aplicarRegraMoedaContrato(qtd * vlUnit * meses)
        : vlMensal;

    const somaOutras = editandoItemCronograma
      ? itensCronograma
          .filter((i) => i.id !== editandoItemCronograma.id)
          .reduce((a, b) => a + Number(b.valor_total), 0)
      : somaValorItensCronograma;
    if (
      isMensalUnit &&
      Math.abs(valorGlobalCronograma - somaOutras - novoValorTotal) > 0.01 &&
      Math.abs(valorGlobalCronograma - somaOutras - novoValorTotal) <= 0.05
    ) {
      novoValorTotal = aplicarRegraMoedaContrato(
        valorGlobalCronograma - somaOutras,
      );
    }
    const valorDisponivelParaItem = aplicarRegraMoedaContrato(
      valorGlobalCronograma - somaOutras,
    );
    if (
      formItemCronograma.preservar_valor_total &&
      Math.abs(valorDisponivelParaItem - novoValorTotal) > 0.01 &&
      Math.abs(valorDisponivelParaItem - novoValorTotal) <= 1
    ) {
      novoValorTotal = valorDisponivelParaItem;
    }
    if (somaOutras + novoValorTotal > valorGlobalCronograma + 0.01) {
      const disp = Math.max(0, valorGlobalCronograma - somaOutras);
      alert(
        `O valor total do item (R$ ${novoValorTotal.toFixed(2)}) excede o saldo disponível (R$ ${disp.toFixed(2)}).`,
      );
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        ...(editandoItemCronograma &&
          formItemCronograma.numero_item !== "" && {
            numero_item:
              parseInt(formItemCronograma.numero_item) ||
              editandoItemCronograma.numero_item,
          }),
        descricao: formItemCronograma.descricao,
        unidade_medida: unidadePayload,
        quantidade: qtd,
        valor_unitario: vlUnit,
        quantidade_meses: meses,
        valor_total: novoValorTotal,
        preservar_valor_total: formItemCronograma.preservar_valor_total,
        frequencia_execucao: modoClausulaContrato ? frequenciaContrato : null,
        numero_execucoes: !isMensalUnit ? meses : null,
        observacoes: formItemCronograma.observacoes || null,
      };
      if (editandoItemCronograma) {
        const res = await authFetch(
          `${API_URL}/api/contratos/itens-cronograma/${editandoItemCronograma.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
        );
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          alert(e.message || "Erro");
          return;
        }
        if (isAdmin) {
          const qtdMedida = parseDecimal(formItemCronograma.quantidade_medida);
          const valorMigracaoReais = isMensalUnit
            ? formItemCronograma.valor_medida_reais !== ""
              ? parseDecimal(formItemCronograma.valor_medida_reais)
              : null
            : null;
          const resMig = await authFetch(
            `${API_URL}/api/contratos/${contratoId}/itens-cronograma/${editandoItemCronograma.id}/quantidade-migracao`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                quantidade_medida: qtdMedida,
                valor_migracao_reais: valorMigracaoReais,
              }),
            },
          );
          if (!resMig.ok) {
            const e = await resMig.json().catch(() => ({}));
            alert(e.message || "Erro ao salvar quantidade já utilizada");
            return;
          }
        }
      } else {
        const res = await authFetch(
          `${API_URL}/api/contratos/${contratoId}/itens-cronograma`,
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          alert(e.message || "Erro");
          return;
        }
        const itemCriado = await res.json().catch(() => null);
        const qtdMedida = parseDecimal(formItemCronograma.quantidade_medida);
        const valorMigracaoReais = isMensalUnit
          ? formItemCronograma.valor_medida_reais !== ""
            ? parseDecimal(formItemCronograma.valor_medida_reais)
            : null
          : null;
        if (isAdmin && itemCriado?.id && (qtdMedida > 0 || (valorMigracaoReais ?? 0) > 0)) {
          const resMig = await authFetch(
            `${API_URL}/api/contratos/${contratoId}/itens-cronograma/${itemCriado.id}/quantidade-migracao`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                quantidade_medida: qtdMedida,
                valor_migracao_reais: valorMigracaoReais,
              }),
            },
          );
          if (!resMig.ok) {
            const e = await resMig.json().catch(() => ({}));
            alert(e.message || "Item criado, mas houve erro ao salvar quantidade já utilizada: " + (e.message || "Erro"));
            return;
          }
        }
      }
      setModalItemCronograma(false);
      carregarDados();
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  const excluirItemCronograma = async (itemId: string) => {
    if (!confirm("Excluir este item?")) return;
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/itens-cronograma/${itemId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Erro");
        return;
      }
      carregarDados();
    } catch (e) {
      console.error(e);
    }
  };

  const salvarQuantidadeMedidaMigracao = async (
    itemId: string,
    valor: string,
  ) => {
    const qtd = parseFloat(valor);
    if (isNaN(qtd) || qtd < 0) return;
    setEditandoMedidoItemId(null);
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/${contratoId}/itens-cronograma/${itemId}/quantidade-migracao`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantidade_medida: qtd }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Erro");
        return;
      }
      carregarDados();
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar quantidade medida");
    }
  };

  // ============ MEDIÇÕES — Criação interna (fiscal) ============

  // Determina o tipo de medição atual (mensal vs quantidade) com base nos itens preenchidos
  const tipoMedicaoAtual: "mensal" | "quantidade" | null = (() => {
    if (!usarItensCronograma) return null;
    const primeiro = formMedicao.itens.find(
      (i) =>
        "item_cronograma_id" in i && Number((i as any).quantidade_medida) > 0,
    );
    if (!primeiro) return null;
    const ic = itensCronograma.find(
      (c) => c.id === (primeiro as any).item_cronograma_id,
    );
    return ic?.unidade_medida === "MENSAL" ? "mensal" : "quantidade";
  })();

  const existeMedicaoAnteriorNoCiclo = (periodoInicio?: string) => {
    if (!periodoInicio) return false;
    const inicioAtual = new Date(periodoInicio);
    if (Number.isNaN(inicioAtual.getTime())) return false;

    return medicoes.some((m) => {
      if (!m?.periodo_inicio) return false;
      const inicioMedicao = new Date(m.periodo_inicio);
      if (Number.isNaN(inicioMedicao.getTime())) return false;
      if (dataRenovacaoCiclo && inicioMedicao < dataRenovacaoCiclo)
        return false;
      return inicioMedicao < inicioAtual;
    });
  };

  const calcularDiasMigracaoTempo = () => {
    const itensMensais = itensCronograma.filter(
      (ic) => ic.unidade_medida === "MENSAL",
    );
    if (itensMensais.length === 0) return 0;

    return itensMensais.reduce((maxDias, ic) => {
      const valorUnit =
        Number(ic.valor_unitario) || Number(ic.valor_mensal) || 0;
      const mesesMigracao = Number(ic.quantidade_medida || 0);
      const mesesPeloValor =
        Number(ic.valor_migracao_reais ?? 0) > 0 && valorUnit > 0
          ? Number(ic.valor_migracao_reais) / valorUnit
          : mesesMigracao;
      const dias = Math.max(0, Math.round(mesesPeloValor * 30));
      return Math.max(maxDias, dias);
    }, 0);
  };

  const abrirModalMedicao = () => {
    setFormMedicao({
      periodo_inicio: "",
      periodo_fim: "",
      competencia: "",
      observacoes: "",
      valor_medido: "",
      nota_fiscal_numero: "",
      nota_fiscal_valor: "",
      nota_fiscal_data: "",
      itens: isServicoContinuado
        ? []
        : usarItensCronograma
          ? itensCronograma.map((i) => ({
              item_cronograma_id: i.id,
              quantidade_medida: 0,
              modo_input: "quantidade" as const,
              valor_override: 0,
            }))
          : etapas
              .filter((e) => e.status !== "CONCLUIDA")
              .map((e) => ({
                etapa_id: e.id,
                percentual_executado_atual: 0,
                modo_input: "percentual" as const,
              })),
    });
    setExecucaoFinanceiraModal(null);
    setDiscriminacoes([]);
    setArquivosPendentes([]);
    setModalMedicao(true);
  };

  const replicarMedicaoAnterior = async () => {
    const ultimaMedicao = [...medicoes].sort(
      (a, b) => b.numero_medicao - a.numero_medicao,
    )[0];
    if (!ultimaMedicao) return;
    setCarregandoReplicar(true);
    try {
      const [detRes, discRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${ultimaMedicao.id}`),
        authFetch(
          `${API_URL}/api/contratos/medicoes/${ultimaMedicao.id}/discriminacoes`,
        ),
      ]);
      const det = detRes.ok ? await detRes.json() : null;
      const discs = discRes.ok ? await discRes.json() : [];

      let novosItens = formMedicao.itens;
      if (det?.itens?.length) {
        if (usarItensCronograma) {
          novosItens = itensCronograma.map((ic) => {
            const prev = det.itens.find(
              (i: any) => i.item_cronograma_id === ic.id,
            );
            const qtd = prev?.quantidade_medida || 0;
            return {
              item_cronograma_id: ic.id,
              quantidade_medida: qtd,
              modo_input: "quantidade" as const,
              valor_override: prodTrunc(qtd, Number(ic.valor_unitario)),
            };
          });
        } else if (!isServicoContinuado) {
          novosItens = etapas
            .filter((e) => e.status !== "CONCLUIDA")
            .map((e) => {
              const prev = det.itens.find((i: any) => i.etapa_id === e.id);
              return {
                etapa_id: e.id,
                percentual_executado_atual:
                  prev?.percentual_executado_atual || 0,
                valor_executado_atual: prev?.valor_executado_atual,
                modo_input: "percentual" as const,
              };
            });
        }
      }

      setFormMedicao((prev) => ({
        ...prev,
        observacoes:
          det?.fornecedor_observacoes ||
          ultimaMedicao.fornecedor_observacoes ||
          "",
        valor_medido: isServicoContinuado
          ? String(ultimaMedicao.valor_medido ?? "")
          : prev.valor_medido,
        nota_fiscal_valor: String(ultimaMedicao.nota_fiscal_valor ?? ""),
        itens: novosItens,
      }));

      if (discs?.length) {
        setDiscriminacoes(
          discs.map((d: any) => ({
            descricao: d.descricao,
            valor: Number(d.valor),
            percentual: Number(d.percentual),
          })),
        );
      }
    } catch (e) {
      console.error("Erro ao replicar medição anterior", e);
    } finally {
      setCarregandoReplicar(false);
    }
  };

  const carregarExecucaoFinanceiraModal = useCallback(
    async (medicaoId?: string, periodoInicio?: string, periodoFim?: string) => {
      try {
        let url = `${API_URL}/api/contratos/${contratoId}/execucao-financeira`;
        const params = new URLSearchParams();
        if (medicaoId) params.set("medicaoId", medicaoId);
        else if (periodoInicio && periodoFim) {
          params.set("periodo_inicio", periodoInicio);
          params.set("periodo_fim", periodoFim);
        }
        if (params.toString()) url += `?${params.toString()}`;
        const res = await authFetch(url);
        if (res.ok) setExecucaoFinanceiraModal(await res.json());
      } catch {
        setExecucaoFinanceiraModal(null);
      }
    },
    [contratoId],
  );

  const salvarMedicao = async (comoRascunho: boolean) => {
    if (!formMedicao.periodo_inicio || !formMedicao.periodo_fim) {
      alert("Informe o período de início e fim da medição");
      return;
    }
    if (contratoProp?.data_vigencia_fim) {
      const dataFimPeriodo = new Date(formMedicao.periodo_fim);
      const dataVigenciaFim = new Date(contratoProp.data_vigencia_fim);
      if (dataFimPeriodo > dataVigenciaFim) {
        alert(
          `O período de medição não pode ultrapassar a data de vigência do contrato.`,
        );
        return;
      }
    }
    if (!comoRascunho && discriminacoes.length === 0) {
      alert(
        "A discriminação de despesas é obrigatória antes de salvar a medição.",
      );
      return;
    }
    setActionLoading(true);
    try {
      const payload: any = {
        periodo_inicio: formMedicao.periodo_inicio,
        periodo_fim: formMedicao.periodo_fim,
        competencia:
          formMedicao.competencia ||
          derivarCompetencia(formMedicao.periodo_inicio) ||
          undefined,
        observacoes: formMedicao.observacoes || null,
        nota_fiscal_numero: formMedicao.nota_fiscal_numero || undefined,
        nota_fiscal_valor: formMedicao.nota_fiscal_valor
          ? Number(formMedicao.nota_fiscal_valor)
          : undefined,
        nota_fiscal_data: formMedicao.nota_fiscal_data || undefined,
      };
      const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
      if (usuario?.id) payload.fiscal_id = usuario.id;
      if (usuario?.nome) payload.fiscal_nome = usuario.nome;
      if (isServicoContinuado) {
        const valor = parseFloat(formMedicao.valor_medido) || 0;
        if (valor <= 0) {
          alert("Informe o valor medido");
          setActionLoading(false);
          return;
        }
        payload.valor_medido = valor;
      } else if (usarItensCronograma) {
        const itensComQtd = formMedicao.itens
          .filter(
            (
              i,
            ): i is { item_cronograma_id: string; quantidade_medida: number } =>
              "item_cronograma_id" in i &&
              Number((i as any).quantidade_medida) > 0,
          )
          .map((i) => ({
            item_cronograma_id: i.item_cronograma_id,
            quantidade_medida: Number(i.quantidade_medida),
            ...((i as any).valor_medido_override != null
              ? {
                  valor_medido_override: Number(
                    (i as any).valor_medido_override,
                  ),
                }
              : {}),
          }));
        if (itensComQtd.length === 0) {
          alert("Informe a quantidade medida em pelo menos um item");
          setActionLoading(false);
          return;
        }
        // Validar que não há mistura de tipos (mensal vs quantidade)
        const itensMensaisNoSubmit = itensComQtd.filter((item) => {
          const ic = itensCronograma.find(
            (c) => c.id === item.item_cronograma_id,
          );
          return ic?.unidade_medida === "MENSAL";
        });
        if (
          itensMensaisNoSubmit.length > 0 &&
          itensMensaisNoSubmit.length < itensComQtd.length
        ) {
          alert(
            "Não é possível misturar itens mensais com itens medidos por quantidade na mesma medição.\n\nCrie uma medição separada para os itens de cada tipo.",
          );
          setActionLoading(false);
          return;
        }
        payload.itens = itensComQtd;
      } else {
        const itensComValor = formMedicao.itens
          .filter(
            (
              i,
            ): i is {
              etapa_id: string;
              percentual_executado_atual: number;
              valor_executado_atual?: number;
            } =>
              "etapa_id" in i &&
              ((i as any).percentual_executado_atual > 0 ||
                ((i as any).valor_executado_atual != null &&
                  (i as any).valor_executado_atual > 0)),
          )
          .map((i) => ({
            etapa_id: i.etapa_id,
            percentual_executado_atual:
              (i as any).percentual_executado_atual || 0,
            valor_executado_atual:
              (i as any).valor_executado_atual || undefined,
          }));
        if (itensComValor.length === 0) {
          alert(
            "Informe o percentual ou valor executado em pelo menos uma etapa",
          );
          setActionLoading(false);
          return;
        }
        payload.itens = itensComValor;
      }
      const res = await authFetch(
        `${API_URL}/api/contratos/${contratoId}/medicoes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Erro");
        setActionLoading(false);
        return;
      }
      const medicaoSalva = await res.json();

      if (discriminacoes.length > 0 && medicaoSalva?.id) {
        try {
          await authFetch(
            `${API_URL}/api/contratos/medicoes/${medicaoSalva.id}/discriminacoes`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                itens: discriminacoes,
                motivo_correcao: "Criação inicial pelo fiscal",
              }),
            },
          );
        } catch {
          /* ignore */
        }
      }
      if (medicaoSalva?.id && arquivosPendentes.length > 0) {
        for (const arq of arquivosPendentes) {
          try {
            const formData = new FormData();
            formData.append("file", arq.file);
            formData.append("tipo", arq.tipo);
            if (arq.descricao) formData.append("descricao", arq.descricao);
            await authFetch(
              `${API_URL}/api/contratos/medicoes/${medicaoSalva.id}/anexos`,
              { method: "POST", body: formData },
            );
          } catch {
            /* ignore */
          }
        }
      }

      if (!comoRascunho && medicaoSalva?.id) {
        setModalMedicao(false);
        setDiscriminacoes([]);
        setArquivosPendentes([]);
        abrirModalOtpFornecedor(medicaoSalva.id);
        return;
      }

      setModalMedicao(false);
      setDiscriminacoes([]);
      setArquivosPendentes([]);
      carregarDados();
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  const abrirModalOtpFornecedor = (medicaoId: string) => {
    setOtpMedicaoId(medicaoId);
    setOtpEtapa("enviar");
    setOtpCodigo("");
    setOtpCanais(null);
    setOtpFornecedorNome(null);
    setOtpErro(null);
    setOtpCodigoValidacao(null);
    setOtpLoading(false);
    setModalOtp(true);
  };

  const handleEnviarOtpFornecedor = async () => {
    if (!otpMedicaoId) return;
    setOtpLoading(true);
    setOtpErro(null);
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${otpMedicaoId}/solicitar-otp-fornecedor`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setOtpErro(err.message || "Erro ao enviar código");
        setOtpLoading(false);
        return;
      }
      const data = await res.json();
      setOtpCanais(data);
      setOtpFornecedorNome(data.fornecedor_nome || null);
      setOtpEtapa("codigo");
    } catch {
      setOtpErro("Erro de conexão ao enviar código");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleValidarOtpFornecedor = async () => {
    if (!otpMedicaoId || !otpCodigo) return;
    setOtpLoading(true);
    setOtpErro(null);
    try {
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${otpMedicaoId}/validar-otp-fornecedor`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: otpCodigo }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setOtpErro(err.message || "Código incorreto ou expirado");
        setOtpLoading(false);
        return;
      }
      const data = await res.json();
      setOtpCodigoValidacao(data.codigo_formatado || data.codigo_validacao);
      setOtpEtapa("sucesso");

      try {
        const resDownload = await authFetch(
          `${API_URL}/api/contratos/medicoes/${otpMedicaoId}/boletim-oficial/download`,
        );
        if (resDownload.ok) {
          const pdfBlob = await resDownload.blob();
          const objectUrl = window.URL.createObjectURL(pdfBlob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = `boletim_medicao_${otpMedicaoId}.pdf`;
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            link.remove();
            window.URL.revokeObjectURL(objectUrl);
          }, 1000);
        }
      } catch {
        /* ignore download errors */
      }

      carregarDados();
    } catch {
      setOtpErro("Erro de conexão ao validar código");
    } finally {
      setOtpLoading(false);
    }
  };

  // ============ MEDIÇÕES — Envio direto para aprovação (fiscal cria internamente) ============

  const enviarParaAprovacao = async (medicaoId: string) => {
    setActionLoading(true);
    try {
      const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
      await authFetch(
        `${API_URL}/api/contratos/medicoes/${medicaoId}/enviar-aprovacao`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fiscal_id: usuario.id || "",
            fiscal_nome: usuario.nome || "Fiscal",
          }),
        },
      );
      carregarDados();
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  // ============ MEDIÇÕES — Exclusão ============

  const excluirMedicao = async (
    medicaoId: string,
    numeroMedicao: number,
    statusAtual?: string,
  ) => {
    const msgExtra =
      statusAtual === "APROVADA"
        ? "\n\n⚠️ ATENÇÃO: Esta medição já foi APROVADA. Ao excluí-la, os valores e percentuais das etapas serão revertidos."
        : "";
    if (
      !confirm(
        `Excluir a ${numeroMedicao}ª Medição?${msgExtra}\n\nEsta ação não pode ser desfeita.`,
      )
    )
      return;
    setActionLoading(true);
    try {
      const params = podeExcluirMedicao ? "?podeExcluirMedicao=true" : "";
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${medicaoId}${params}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Erro ao excluir medição");
      } else {
        carregarDados();
      }
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  // ============ MEDIÇÕES — Ateste do Fiscal ============

  const abrirModalAteste = async (m: Medicao) => {
    setFormAteste({
      observacoes: "",
      verificado_in_loco: false,
      motivo_devolucao_parcial: "",
    });
    setItensAteste({});
    setAnexosMedicao([]);
    setLoadingAnexos(true);
    try {
      // Busca medição completa (inclui itens) + anexos em paralelo
      const [medicaoRes, anexosRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}`),
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}/anexos`),
      ]);
      const medicaoCompleta = medicaoRes.ok ? await medicaoRes.json() : m;
      if (anexosRes.ok) setAnexosMedicao(await anexosRes.json());
      setModalAteste(medicaoCompleta);
      // Inicializar estado dos itens (itens já atestados ficam marcados e bloqueados)
      const itensMap: Record<
        string,
        { selecionado: boolean; observacoes: string }
      > = {};
      for (const item of medicaoCompleta?.itens || []) {
        itensMap[item.id] = {
          selecionado: !!item.atestado,
          observacoes: item.ateste_observacoes || "",
        };
      }
      setItensAteste(itensMap);
    } catch {
      setModalAteste(m);
    }
    setLoadingAnexos(false);
  };

  const atestarMedicao = async () => {
    if (!modalAteste) return;

    const itens = ((modalAteste as any).itens || []) as any[];
    const itensSelecionados = itens.filter(
      (item) => itensAteste[item.id]?.selecionado && !item.atestado,
    );
    const itensCancelarAteste = itens
      .filter((item) => item.atestado && !itensAteste[item.id]?.selecionado)
      .map((i: any) => i.id);
    const jaAtestadosMantidos = itens.filter(
      (i: any) => i.atestado && itensAteste[i.id]?.selecionado,
    ).length;
    const todosSerao =
      jaAtestadosMantidos + itensSelecionados.length === itens.length &&
      itens.length > 0;

    const temAcao =
      itensSelecionados.length > 0 || itensCancelarAteste.length > 0;
    if (!temAcao) {
      alert(
        "Selecione itens para atestar ou desmarque itens para cancelar o ateste.",
      );
      return;
    }

    if (
      !todosSerao &&
      itensSelecionados.length > 0 &&
      !formAteste.motivo_devolucao_parcial?.trim()
    ) {
      const itensNaoSelecionados = itens.filter(
        (i) => !itensAteste[i.id]?.selecionado && !i.atestado,
      ).length;
      if (itensNaoSelecionados > 0) {
        alert(
          "No ateste parcial, informe o motivo da devolução para os itens não atestados.",
        );
        return;
      }
    }

    setActionLoading(true);
    try {
      const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${modalAteste.id}/atestar-itens`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fiscal_id: usuario.id || "",
            fiscal_nome: usuario.nome || "Fiscal",
            itens: itensSelecionados.map((item: any) => ({
              item_id: item.id,
              observacoes: itensAteste[item.id]?.observacoes || null,
            })),
            itens_cancelar_ateste:
              itensCancelarAteste.length > 0 ? itensCancelarAteste : undefined,
            observacoes_gerais: formAteste.observacoes || null,
            verificado_in_loco: formAteste.verificado_in_loco,
            motivo_devolucao: !todosSerao
              ? formAteste.motivo_devolucao_parcial?.trim() || undefined
              : undefined,
          }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Erro");
        setActionLoading(false);
        return;
      }
      const resultado = await res.json().catch(() => ({}));
      setModalAteste(null);
      setFormAteste({
        observacoes: "",
        verificado_in_loco: false,
        motivo_devolucao_parcial: "",
      });
      setItensAteste({});
      carregarDados();
      // Mensagem informativa ao fiscal
      if (resultado.status === "AGUARDANDO_APROVACAO") {
        alert(
          "Medição atestada com sucesso! Foi enviada para aprovação do gestor na Central de Aprovações.",
        );
      } else if (resultado.status === "DEVOLVIDA") {
        alert(
          "Itens atestados e medição devolvida ao fornecedor com sucesso! O fornecedor será notificado para corrigir os itens não atestados.",
        );
      } else if (resultado.status === "SUBMETIDA") {
        alert(
          "Ateste(s) cancelado(s) com sucesso! A medição voltou ao status submetida.",
        );
      } else if (resultado.status === "PARCIALMENTE_ATESTADA") {
        alert(
          "Alterações salvas com sucesso! A medição ficou parcialmente atestada.",
        );
      }
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  const devolverMedicao = async () => {
    if (!modalDevolver) return;
    setActionLoading(true);
    try {
      const usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
      const res = await authFetch(
        `${API_URL}/api/contratos/medicoes/${modalDevolver.id}/devolver`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fiscal_id: usuario.id || "",
            fiscal_nome: usuario.nome || "Fiscal",
            motivo: motivoDevolucao,
          }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Erro");
        return;
      }
      setModalDevolver(null);
      setMotivoDevolucao("");
      carregarDados();
    } catch (e) {
      console.error(e);
    }
    setActionLoading(false);
  };

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );

  // ============ RENDER ============

  return (
    <div className="space-y-6">
      {/* Conciliação com o portal de transparência (liquidado × medido) */}
      <ConciliacaoFatorCard contratoId={contratoId} />

      {/* Ordem de Serviço (para todos os contratos, exceto serviços continuados que são opcionais) */}
      {!isServicoContinuado && (
        <Card
          className={
            !osAtiva
              ? "border-amber-300 bg-amber-50/30"
              : osAtiva.status === "EM_EXECUCAO"
                ? "border-indigo-300"
                : ""
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Ordem de Serviço
            </CardTitle>
            <CardDescription>
              A OS autoriza o início da execução. Sem OS aprovada, não é
              possível registrar medições.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!osAtiva ? (
              <Link
                href={
                  resumo?.fluxo_os === "MODULO_OS"
                    ? "/orgao/ordens-servico"
                    : `/orgao/almoxarifado/requisicoes/nova?contrato=${contratoId}&tipo=ORDEM_SERVICO`
                }
                className="block"
              >
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:border-amber-300 transition-colors cursor-pointer">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-700">
                      Nenhuma Ordem de Serviço ativa
                    </p>
                    <p className="text-sm text-amber-600">
                      {resumo?.fluxo_os === "MODULO_OS"
                        ? "Clique aqui para criar uma OS no módulo de Ordens de Serviço e liberar o cadastro de medições."
                        : "Clique aqui para criar uma OS na página de Requisições e liberar o cadastro de medições."}
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-amber-500 shrink-0" />
                </div>
              </Link>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge
                    className={STATUS_OS[osAtiva.status]?.cor || "bg-gray-100"}
                  >
                    {STATUS_OS[osAtiva.status]?.label || osAtiva.status}
                  </Badge>
                  <span className="font-bold text-lg">
                    {osAtiva.numero_os || osAtiva.numero}
                  </span>
                </div>
                <p className="text-sm text-gray-700">
                  {osAtiva.descricao ||
                    osAtiva.descricao_os ||
                    osAtiva.justificativa}
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  {osAtiva.data_abertura && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Abertura: {String(osAtiva.data_abertura).split("T")[0]}
                    </span>
                  )}
                  {osAtiva.data_aprovacao && (
                    <span>
                      Aprovada: {String(osAtiva.data_aprovacao).split("T")[0]}
                    </span>
                  )}
                  {osAtiva.aprovador_nome && (
                    <span>Por: {osAtiva.aprovador_nome}</span>
                  )}
                  {osAtiva.responsavel_tecnico && (
                    <span>Resp. Técnico: {osAtiva.responsavel_tecnico}</span>
                  )}
                  {osAtiva.fiscal_nome && (
                    <span>Fiscal: {osAtiva.fiscal_nome}</span>
                  )}
                  {osAtiva.sla_dias && (
                    <span>SLA: {osAtiva.sla_dias} dias</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resumo */}
      {resumo && temOSAutorizada && (
        <div
          className={`grid grid-cols-2 ${isServicoContinuado ? "md:grid-cols-4" : "md:grid-cols-5"} gap-4`}
        >
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Valor Medido</p>
              <p className="text-xl font-bold text-blue-600">
                {formatarMoeda(resumo.valor_medido_total)}
              </p>
              <p className="text-xs text-gray-400">
                de {formatarMoeda(resumo.valor_global)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Saldo Disponível</p>
              <p
                className={`text-xl font-bold ${resumo.saldo_disponivel > 0 ? "text-green-600" : "text-red-600"}`}
              >
                {formatarMoeda(resumo.saldo_disponivel)}
              </p>
              {(resumo.valor_em_analise || 0) > 0 && (
                <p className="text-xs text-amber-600">
                  Em análise: {formatarMoeda(resumo.valor_em_analise || 0)}
                </p>
              )}
            </CardContent>
          </Card>
          {!isServicoContinuado && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-gray-500">Avanço Físico</p>
                <p className="text-xl font-bold">
                  {resumo.percentual_fisico_total.toFixed(1)}%
                </p>
                <Progress
                  value={resumo.percentual_fisico_total}
                  className="mt-2"
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">
                {isServicoContinuado ? "Medições" : "Etapas"}
              </p>
              <p className="text-xl font-bold">
                {isServicoContinuado
                  ? resumo.medicoes_aprovadas
                  : `${resumo.etapas_concluidas}/${resumo.total_etapas}`}
              </p>
              <p className="text-xs text-gray-400">
                {resumo.medicoes_aprovadas} medições aprovadas
              </p>
            </CardContent>
          </Card>
          <Card
            className={
              resumo.pendentes_ateste > 0
                ? "border-yellow-300 bg-yellow-50/50"
                : ""
            }
          >
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Pendentes</p>
              <div className="flex items-center gap-2">
                {resumo.pendentes_ateste > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800">
                    {resumo.pendentes_ateste} ateste
                  </Badge>
                )}
                {resumo.pendentes_aprovacao > 0 && (
                  <Badge className="bg-orange-100 text-orange-800">
                    {resumo.pendentes_aprovacao} aprovação
                  </Badge>
                )}
                {resumo.pendentes_ateste === 0 &&
                  resumo.pendentes_aprovacao === 0 && (
                    <p className="text-sm text-green-600 font-medium">
                      Nenhuma
                    </p>
                  )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Medições Pendentes de Ateste do Fiscal */}
      {medicoesPendentesAteste.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-yellow-600" />
              Medições Pendentes de Ateste
              <Badge className="bg-yellow-100 text-yellow-800">
                {medicoesPendentesAteste.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Medições submetidas pelo fornecedor aguardando seu ateste técnico
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {medicoesPendentesAteste.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-4 p-4 bg-white border border-yellow-200 rounded-lg"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 text-yellow-700 font-bold text-sm">
                  {m.numero_medicao}ª
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">
                      {m.numero_medicao}ª Medição
                    </span>
                    <Badge className={STATUS_MEDICAO[m.status]?.cor}>
                      {STATUS_MEDICAO[m.status]?.label}
                    </Badge>
                    {m.fornecedor_nome && (
                      <span className="text-xs text-gray-500">
                        por{" "}
                        {typeof m.fornecedor_nome === "string"
                          ? m.fornecedor_nome
                          : (m as any).fornecedor?.razao_social}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>
                      {formatarData(m.periodo_inicio)} a{" "}
                      {formatarData(m.periodo_fim)}
                    </span>
                    <span className="font-medium text-gray-700">
                      {formatarMoeda(m.valor_medido)}
                    </span>
                    <span>
                      {Number(m.percentual_fisico_medido).toFixed(1)}% físico
                    </span>
                    {m.nota_fiscal_numero && (
                      <span className="text-xs">
                        NF: {m.nota_fiscal_numero}
                      </span>
                    )}
                    {m.status === "PARCIALMENTE_ATESTADA" &&
                      (() => {
                        const itens = (m as any).itens || [];
                        const atestados = itens.filter(
                          (i: any) => i.atestado,
                        ).length;
                        return (
                          <span className="text-xs text-yellow-600 font-medium">
                            {atestados}/{itens.length} itens atestados
                          </span>
                        );
                      })()}
                  </div>
                  {m.fornecedor_observacoes && (
                    <p className="text-xs text-gray-500 mt-1 italic">
                      "{m.fornecedor_observacoes}"
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirDetalhe(m)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-violet-600 border-violet-300"
                    title="Corrigir Boletim"
                    onClick={() => abrirModalCorrigir(m)}
                  >
                    <Wrench className="w-3 h-3 mr-1" />
                    Corrigir
                  </Button>
                  <Button
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    onClick={() =>
                      onAtestar ? onAtestar(m) : abrirModalAteste(m)
                    }
                  >
                    <ClipboardCheck className="w-3 h-3 mr-1" />
                    {m.status === "PARCIALMENTE_ATESTADA"
                      ? "Continuar Ateste"
                      : "Atestar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-600 border-amber-300"
                    onClick={() => {
                      setModalDevolver(m);
                      setMotivoDevolucao("");
                    }}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Devolver
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cronograma Físico-Financeiro (etapas ou itens) */}
      {!isServicoContinuado && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Cronograma Físico-Financeiro
                </CardTitle>
                <CardDescription>
                  {usarItensCronograma
                    ? "Itens do cronograma com quantidade e valor unitário"
                    : "Etapas da obra/serviço com percentual e valor previsto"}
                </CardDescription>
              </div>
              {itensCronograma.length > 0 ? (
                <Button onClick={() => abrirModalItemCronograma()} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Novo Item
                </Button>
              ) : etapas.length > 0 ? (
                <Button onClick={() => abrirModalEtapa()} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Nova Etapa
                </Button>
              ) : (
                <Button onClick={() => setModalTipoCronograma(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {etapas.length === 0 && itensCronograma.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">
                  Nenhum item cadastrado no cronograma.
                </p>
                <p className="text-sm text-gray-400">
                  Adicione etapas (obras) ou itens (serviços) para iniciar as
                  medições.
                </p>
                <Button
                  onClick={() => setModalTipoCronograma(true)}
                  size="sm"
                  className="mt-3"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              </div>
            ) : itensCronograma.length > 0 ? (
              <>
                {etapas.length > 0 && (
                  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Este contrato possui <strong>etapas</strong> e{" "}
                    <strong>itens do cronograma</strong>. A tabela abaixo mostra
                    os <strong>itens</strong> (medição por quantidade / cláusula
                    de preço). Exclua as etapas no cadastro se o contrato for só
                    por itens.
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="min-w-[200px] max-w-[400px]">
                        Descrição
                      </TableHead>
                      <TableHead className="text-center min-w-[140px]">
                        Unidade
                      </TableHead>
                      {exibirColunasFrequenciaCronograma && (
                        <TableHead className="text-center min-w-[100px]">
                          Frequência
                        </TableHead>
                      )}
                      <TableHead className="text-right">Quantidade</TableHead>
                      {exibirMesesCronograma && (
                        <TableHead className="text-center">Meses</TableHead>
                      )}
                      <TableHead className="text-right">Valor Unit.</TableHead>
                      {exibirColunasFrequenciaCronograma && (
                        <TableHead className="text-right">Nº exec.</TableHead>
                      )}
                      {exibirColunasFrequenciaCronograma && (
                        <TableHead className="text-right">
                          Vl. por frequência
                        </TableHead>
                      )}
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-center">Medido</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...itensCronograma]
                      .sort((a, b) => a.numero_item - b.numero_item)
                      .map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">
                            {i.numero_item}
                          </TableCell>
                          <TableCell className="whitespace-normal break-words min-w-[200px] max-w-[400px]">
                            {i.descricao}
                          </TableCell>
                          <TableCell className="text-center text-sm whitespace-normal max-w-[200px]">
                            {textoUnidadeCronogramaNaTela(i.unidade_medida)}
                          </TableCell>
                          {exibirColunasFrequenciaCronograma && (
                            <TableCell className="text-center text-sm whitespace-nowrap">
                              {textoFrequenciaNaTela(i.frequencia_execucao)}
                            </TableCell>
                          )}
                          <TableCell className="text-right whitespace-nowrap">
                            {Number(i.quantidade).toLocaleString("pt-BR")}
                            {exibirMesesCronograma &&
                              Number(i.quantidade_meses) > 1 && (
                                <span className="text-[11px] text-gray-400">
                                  {" "}
                                  /mês
                                </span>
                              )}
                          </TableCell>
                          {exibirMesesCronograma && (
                            <TableCell className="text-center whitespace-nowrap">
                              {Number(i.quantidade_meses) > 1
                                ? i.quantidade_meses
                                : "-"}
                            </TableCell>
                          )}
                          <TableCell className="text-right whitespace-nowrap">
                            {formatarMoeda(i.valor_unitario)}
                          </TableCell>
                          {exibirColunasFrequenciaCronograma && (
                            <TableCell className="text-right whitespace-nowrap">
                              {i.quantidade_meses != null
                                ? i.quantidade_meses
                                : "-"}
                            </TableCell>
                          )}
                          {exibirColunasFrequenciaCronograma && (
                            <TableCell className="text-right whitespace-nowrap">
                              {formatarMoeda(
                                i.unidade_medida === "MENSAL"
                                  ? Number(i.valor_unitario)
                                  : Number(i.quantidade) *
                                      Number(i.valor_unitario),
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-medium whitespace-nowrap">
                            {Number(i.quantidade_meses) > 1 &&
                            i.unidade_medida !== "MENSAL" ? (
                              <div className="flex flex-col items-end leading-tight">
                                <span>
                                  {formatarMoeda(
                                    Number(i.quantidade) *
                                      Number(i.valor_unitario) *
                                      Number(i.quantidade_meses),
                                  )}
                                </span>
                                <span className="text-[11px] font-normal text-gray-400">
                                  {formatarMoeda(
                                    Number(i.quantidade) *
                                      Number(i.valor_unitario),
                                  )}
                                  /mês
                                </span>
                              </div>
                            ) : (
                              formatarMoeda(i.valor_total)
                            )}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            {isAdmin ? (
                              editandoMedidoItemId === i.id ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={
                                      (Number(i.quantidade) || 0) *
                                      (Number(i.quantidade_meses) > 1
                                        ? Number(i.quantidade_meses)
                                        : 1)
                                    }
                                    value={editandoMedidoValor}
                                    onChange={(e) =>
                                      setEditandoMedidoValor(e.target.value)
                                    }
                                    onBlur={() =>
                                      salvarQuantidadeMedidaMigracao(
                                        i.id,
                                        editandoMedidoValor,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        salvarQuantidadeMedidaMigracao(
                                          i.id,
                                          editandoMedidoValor,
                                        );
                                      if (e.key === "Escape")
                                        setEditandoMedidoItemId(null);
                                    }}
                                    className="w-20 h-8 text-sm text-center"
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditandoMedidoItemId(i.id);
                                    setEditandoMedidoValor(
                                      String(Number(i.quantidade_medida) || 0),
                                    );
                                  }}
                                  className="text-blue-600 font-medium hover:bg-blue-50 rounded px-1 py-0.5 text-sm"
                                  title="Clique para informar quantidade já utilizada (migração)"
                                >
                                  {Number(i.quantidade_medida).toLocaleString(
                                    "pt-BR",
                                  )}
                                  {exibirMesesCronograma &&
                                  Number(i.quantidade_meses) > 1
                                    ? ` / ${(
                                        Number(i.quantidade) *
                                        Number(i.quantidade_meses)
                                      ).toLocaleString("pt-BR")}`
                                    : ""}
                                </button>
                              )
                            ) : (
                              <span className="text-blue-600 font-medium">
                                {Number(i.quantidade_medida).toLocaleString(
                                  "pt-BR",
                                )}
                                {exibirMesesCronograma &&
                                Number(i.quantidade_meses) > 1
                                  ? ` / ${(
                                      Number(i.quantidade) *
                                      Number(i.quantidade_meses)
                                    ).toLocaleString("pt-BR")}`
                                  : ""}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => abrirModalItemCronograma(i)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => excluirItemCronograma(i.id)}
                                disabled={Number(i.quantidade_medida) > 0}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-center">% Físico</TableHead>
                    <TableHead className="text-right">Valor Previsto</TableHead>
                    <TableHead className="text-center">Executado</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {etapas.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {e.numero_etapa}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{e.descricao}</p>
                        <p className="text-xs text-gray-400">
                          {formatarData(e.data_inicio_prevista)} →{" "}
                          {formatarData(e.data_fim_prevista)}
                        </p>
                        {(e.itens?.length || 0) > 0 && (
                          <p className="text-xs text-blue-600">
                            {e.itens?.length} item(ns) cadastrado(s)
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {Number(e.percentual_fisico).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarMoeda(e.valor_previsto)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-medium">
                            {Number(e.percentual_executado).toFixed(1)}%
                          </span>
                          <Progress
                            value={Number(e.percentual_executado)}
                            className="w-16 h-1.5"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={
                            STATUS_ETAPA[e.status]?.cor || "bg-gray-100"
                          }
                        >
                          {STATUS_ETAPA[e.status]?.label || e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirModalEtapa(e)}
                            disabled={e.status === "CONCLUIDA"}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => excluirEtapa(e.id)}
                            disabled={e.status !== "PENDENTE"}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Boletins de Medição — Todos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Boletins de Medição
              </CardTitle>
              <CardDescription>
                Medições submetidas pelo fornecedor ou criadas internamente pelo
                fiscal. A aprovação final é feita na Central de Aprovações.
              </CardDescription>
            </div>
            <Button
              onClick={abrirModalMedicao}
              size="sm"
              disabled={
                !isServicoContinuado && (!temCronograma || !temOSAutorizada)
              }
            >
              <Plus className="w-4 h-4 mr-1" />
              Nova Medição {isServicoContinuado ? "" : "(Fiscal)"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {medicoes.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhuma medição registrada.</p>
              <p className="text-sm text-gray-400">
                O fornecedor pode submeter medições pelo portal, ou o fiscal
                pode criar internamente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                // Agrupar medições por ciclo
                const medicoesAnteriores: Medicao[] = [];
                const medicoesCicloAtual: Medicao[] = [];
                for (const m of medicoes) {
                  if (
                    dataRenovacaoCiclo &&
                    m.periodo_inicio &&
                    new Date(m.periodo_inicio) < dataRenovacaoCiclo
                  ) {
                    medicoesAnteriores.push(m);
                  } else {
                    medicoesCicloAtual.push(m);
                  }
                }

                const renderMedicao = (m: Medicao) => {
                  const statusInfo =
                    STATUS_MEDICAO[m.status] || STATUS_MEDICAO.RASCUNHO;
                  const StatusIcon = statusInfo.icon;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-4 p-4 border rounded-lg hover:shadow-sm transition-shadow ${
                        m.status === "DEVOLVIDA"
                          ? "border-amber-300 bg-amber-50/30"
                          : m.status === "SUBMETIDA"
                            ? "border-yellow-200 bg-yellow-50/20"
                            : m.status === "APROVADA"
                              ? "border-green-200"
                              : ""
                      }`}
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 font-bold text-sm shrink-0">
                        {m.numero_medicao}ª
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {m.numero_medicao}ª Medição
                          </span>
                          <Badge className={statusInfo.cor}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                          {m.fornecedor_nome && (
                            <span className="text-xs text-gray-400">
                              Fornecedor: {m.fornecedor_nome}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>
                            {formatarData(m.periodo_inicio)} a{" "}
                            {formatarData(m.periodo_fim)}
                          </span>
                          <span className="font-medium text-gray-700">
                            {formatarMoeda(m.valor_medido)}
                          </span>
                          <span>
                            {Number(m.percentual_fisico_medido).toFixed(1)}%
                            físico
                          </span>
                          {m.nota_fiscal_numero && (
                            <span className="text-xs">
                              NF: {m.nota_fiscal_numero}
                            </span>
                          )}
                        </div>

                        {/* Timeline mini */}
                        <div className="mt-2 flex items-center gap-1 text-xs">
                          <span
                            className={`px-1.5 py-0.5 rounded ${m.created_at ? "bg-gray-200 text-gray-600" : "bg-gray-100 text-gray-400"}`}
                          >
                            Criada
                          </span>
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <span
                            className={`px-1.5 py-0.5 rounded ${m.data_submissao ? "bg-blue-200 text-blue-700" : "bg-gray-100 text-gray-400"}`}
                          >
                            {m.data_submissao
                              ? `Submetida ${formatarData(m.data_submissao)}`
                              : "Submissão"}
                          </span>
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <span
                            className={`px-1.5 py-0.5 rounded ${m.ateste_data ? "bg-yellow-200 text-yellow-700" : "bg-gray-100 text-gray-400"}`}
                          >
                            {m.ateste_data
                              ? `Atestada ${formatarData(m.ateste_data)}`
                              : "Ateste"}
                          </span>
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              m.status === "APROVADA"
                                ? "bg-green-200 text-green-700"
                                : m.status === "REJEITADA"
                                  ? "bg-red-200 text-red-700"
                                  : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {m.data_aprovacao
                              ? `${m.status === "APROVADA" ? "Aprovada" : "Rejeitada"} ${formatarData(m.data_aprovacao)}`
                              : "Aprovação"}
                          </span>
                        </div>

                        {m.status === "DEVOLVIDA" && m.motivo_devolucao && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                            <strong>Devolvida:</strong> {m.motivo_devolucao}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.status === "RASCUNHO" && !m.fornecedor_nome && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => enviarParaAprovacao(m.id)}
                              disabled={actionLoading}
                            >
                              <Send className="w-3.5 h-3.5 mr-1" />
                              Enviar p/ Aprovação
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() =>
                                excluirMedicao(m.id, m.numero_medicao)
                              }
                              disabled={actionLoading}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {m.status === "RASCUNHO" && m.fornecedor_nome && (
                          <>
                            <Badge
                              variant="outline"
                              className="text-xs text-gray-500"
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              Rascunho do fornecedor
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() =>
                                excluirMedicao(m.id, m.numero_medicao)
                              }
                              disabled={actionLoading}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {(m.status === "SUBMETIDA" ||
                          m.status === "PARCIALMENTE_ATESTADA") && (
                          <>
                            <Button
                              size="sm"
                              className="bg-yellow-600 hover:bg-yellow-700 text-white"
                              onClick={() =>
                                onAtestar ? onAtestar(m) : abrirModalAteste(m)
                              }
                            >
                              <ClipboardCheck className="w-3.5 h-3.5 mr-1" />
                              {m.status === "PARCIALMENTE_ATESTADA"
                                ? "Continuar Ateste"
                                : "Atestar"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-amber-600"
                              onClick={() => {
                                setModalDevolver(m);
                                setMotivoDevolucao("");
                              }}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Devolver
                            </Button>
                          </>
                        )}
                        {podeExcluirMedicao && m.status !== "RASCUNHO" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() =>
                              excluirMedicao(m.id, m.numero_medicao, m.status)
                            }
                            disabled={actionLoading}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirDetalhe(m)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-violet-600"
                          title="Corrigir Boletim"
                          onClick={() => abrirModalCorrigir(m)}
                        >
                          <Wrench className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {/* Ciclo anterior (colapsado) */}
                    {medicoesAnteriores.length > 0 && (
                      <details className="group">
                        <summary className="flex items-center gap-2 p-3 bg-gray-100 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-150 list-none">
                          <ChevronRight className="w-4 h-4 text-gray-500 group-open:rotate-90 transition-transform" />
                          <History className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-medium text-gray-700">
                            Ciclo anterior
                          </span>
                          <span className="text-xs text-gray-500">
                            ({medicoesAnteriores.length} medição
                            {medicoesAnteriores.length !== 1 ? "ões" : ""} —
                            antes de{" "}
                            {dataRenovacaoCiclo &&
                              new Date(dataRenovacaoCiclo).toLocaleDateString(
                                "pt-BR",
                              )}
                            )
                          </span>
                        </summary>
                        <div className="mt-2 space-y-3 pl-2 border-l-2 border-gray-200">
                          {medicoesAnteriores.map((m) => renderMedicao(m))}
                        </div>
                      </details>
                    )}

                    {/* Separador de ciclo */}
                    {medicoesAnteriores.length > 0 &&
                      medicoesCicloAtual.length > 0 && (
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex-1 h-px bg-blue-200" />
                          <span className="text-xs font-medium text-blue-600 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" />
                            Ciclo atual (desde{" "}
                            {dataRenovacaoCiclo &&
                              new Date(dataRenovacaoCiclo).toLocaleDateString(
                                "pt-BR",
                              )}
                            )
                          </span>
                          <div className="flex-1 h-px bg-blue-200" />
                        </div>
                      )}

                    {/* Medições do ciclo atual */}
                    {medicoesCicloAtual.map((m) => renderMedicao(m))}
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ MODAIS ============ */}

      {/* Modal Escolha Tipo Cronograma (quando ambos vazios) */}
      <Dialog open={modalTipoCronograma} onOpenChange={setModalTipoCronograma}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar ao Cronograma</DialogTitle>
            <DialogDescription>
              Escolha o tipo de item a cadastrar
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => {
                setModalTipoCronograma(false);
                abrirModalEtapa();
              }}
            >
              <Layers className="w-8 h-8 text-blue-600" />
              <span className="font-medium">Etapa</span>
              <span className="text-xs text-gray-500">
                Obras: % físico, valor previsto, datas
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => {
                setModalTipoCronograma(false);
                abrirModalItemCronograma();
              }}
            >
              <ListOrdered className="w-8 h-8 text-green-600" />
              <span className="font-medium">Item</span>
              <span className="text-xs text-gray-500">
                Serviços: unidade, quantidade, valor unit.
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Nova/Editar Etapa */}
      <Dialog open={modalEtapa} onOpenChange={setModalEtapa}>
        <DialogContent className="w-[96vw] max-w-7xl max-h-[94vh]">
          <DialogHeader>
            <DialogTitle>
              {editandoEtapa ? "Editar Etapa" : "Nova Etapa do Cronograma"}
            </DialogTitle>
            <DialogDescription>
              Defina a etapa com percentual físico e valor previsto
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input
                placeholder="Ex: Fundação, Alvenaria, Cobertura..."
                value={formEtapa.descricao}
                onChange={(e) =>
                  setFormEtapa({ ...formEtapa, descricao: e.target.value })
                }
              />
            </div>
            {/* Indicador de saldo disponível */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{labelValorCronograma}:</span>
                <span className="font-medium">
                  {formatarMoeda(valorGlobalCronograma)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Alocado em etapas:</span>
                <span className="font-medium">
                  {formatarMoeda(
                    editandoEtapa
                      ? somaValorEtapas - Number(editandoEtapa.valor_previsto)
                      : somaValorEtapas,
                  )}
                </span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-1 mt-1">
                <span className="text-blue-700 font-medium">Disponível:</span>
                <span className="font-bold text-blue-700">
                  {formatarMoeda(
                    editandoEtapa
                      ? saldoValorEtapas + Number(editandoEtapa.valor_previsto)
                      : saldoValorEtapas,
                  )}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">% Alocado:</span>
                <span className="font-medium">
                  {(editandoEtapa
                    ? somaPercentualEtapas -
                      Number(editandoEtapa.percentual_fisico)
                    : somaPercentualEtapas
                  ).toFixed(2)}
                  %
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700 font-medium">% Disponível:</span>
                <span className="font-bold text-blue-700">
                  {(editandoEtapa
                    ? saldoPercentualEtapas +
                      Number(editandoEtapa.percentual_fisico)
                    : saldoPercentualEtapas
                  ).toFixed(2)}
                  %
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>% Físico da Obra</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Ex: 25"
                  value={formEtapa.percentual_fisico}
                  onChange={(e) => {
                    const perc = e.target.value;
                    const valorCalc =
                      perc && valorGlobal > 0
                        ? ((parseFloat(perc) / 100) * valorGlobal).toFixed(2)
                        : "";
                    setFormEtapa({
                      ...formEtapa,
                      percentual_fisico: perc,
                      valor_previsto: valorCalc,
                    });
                  }}
                />
                {formEtapa.percentual_fisico &&
                  (() => {
                    const dispPerc = editandoEtapa
                      ? saldoPercentualEtapas +
                        Number(editandoEtapa.percentual_fisico)
                      : saldoPercentualEtapas;
                    const excede =
                      parseFloat(formEtapa.percentual_fisico) > dispPerc + 0.01;
                    return excede ? (
                      <p className="text-xs text-red-500 font-medium">
                        Excede o % disponível ({dispPerc.toFixed(2)}%)
                      </p>
                    ) : null;
                  })()}
              </div>
              <div className="space-y-2">
                <Label>Valor Previsto (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={formEtapa.valor_previsto}
                  onChange={(e) => {
                    const valor = e.target.value;
                    const percCalc =
                      valor && valorGlobal > 0
                        ? ((parseFloat(valor) / valorGlobal) * 100).toFixed(2)
                        : "";
                    setFormEtapa({
                      ...formEtapa,
                      valor_previsto: valor,
                      percentual_fisico: percCalc,
                    });
                  }}
                />
                {formEtapa.valor_previsto &&
                  (() => {
                    const dispValor = editandoEtapa
                      ? saldoValorEtapas + Number(editandoEtapa.valor_previsto)
                      : saldoValorEtapas;
                    const excede =
                      parseFloat(formEtapa.valor_previsto) > dispValor + 0.01;
                    return excede ? (
                      <p className="text-xs text-red-500 font-medium">
                        Excede o saldo disponível ({formatarMoeda(dispValor)})
                      </p>
                    ) : null;
                  })()}
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Informe o % ou o valor em R$ - o outro campo será calculado
              automaticamente.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início Previsto *</Label>
                <Input
                  type="date"
                  value={formEtapa.data_inicio_prevista}
                  onChange={(e) =>
                    setFormEtapa({
                      ...formEtapa,
                      data_inicio_prevista: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Fim Previsto *</Label>
                <Input
                  type="date"
                  value={formEtapa.data_fim_prevista}
                  onChange={(e) =>
                    setFormEtapa({
                      ...formEtapa,
                      data_fim_prevista: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Itens da etapa</Label>
                  <p className="text-xs text-muted-foreground">
                    Cadastre os itens que compõem esta etapa para aparecerem no boletim.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={adicionarItemEtapa}>
                  <Plus className="w-4 h-4 mr-1" />
                  Item
                </Button>
              </div>
              {formEtapa.itens.length > 0 && (
                <div className="overflow-x-auto border rounded-md">
                  <Table className="min-w-[1180px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Nº</TableHead>
                        <TableHead className="min-w-[260px]">Descrição</TableHead>
                        <TableHead className="w-20">Und</TableHead>
                        <TableHead className="w-24 text-right">Qtd</TableHead>
                        <TableHead className="w-28 text-right">V. Unit.</TableHead>
                        <TableHead className="w-28 text-right">Total</TableHead>
                        <TableHead className="w-28">Marca</TableHead>
                        <TableHead className="w-28">Modelo</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formEtapa.itens.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input value={item.numero_item} onChange={(e) => atualizarItemEtapa(idx, "numero_item", e.target.value)} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Input value={item.descricao} onChange={(e) => atualizarItemEtapa(idx, "descricao", e.target.value)} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Input value={item.unidade} onChange={(e) => atualizarItemEtapa(idx, "unidade", e.target.value)} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.0001" value={item.quantidade} onChange={(e) => atualizarItemEtapa(idx, "quantidade", e.target.value)} className="h-8 text-right" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={item.valor_unitario} onChange={(e) => atualizarItemEtapa(idx, "valor_unitario", e.target.value)} className="h-8 text-right" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={item.valor_total} onChange={(e) => atualizarItemEtapa(idx, "valor_total", e.target.value)} className="h-8 text-right" />
                          </TableCell>
                          <TableCell>
                            <Input value={item.marca} onChange={(e) => atualizarItemEtapa(idx, "marca", e.target.value)} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Input value={item.modelo} onChange={(e) => atualizarItemEtapa(idx, "modelo", e.target.value)} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removerItemEtapa(idx)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={5} className="text-right font-medium">
                          Total dos itens
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatarMoeda(totalItensFormEtapa)}
                        </TableCell>
                        <TableCell colSpan={3}></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações opcionais"
                value={formEtapa.observacoes}
                onChange={(e) =>
                  setFormEtapa({ ...formEtapa, observacoes: e.target.value })
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEtapa(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvarEtapa}
              disabled={
                actionLoading ||
                !formEtapa.descricao ||
                !formEtapa.percentual_fisico ||
                !formEtapa.valor_previsto
              }
            >
              {actionLoading && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editandoEtapa ? "Salvar" : "Criar Etapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova/Editar Item do Cronograma */}
      <Dialog open={modalItemCronograma} onOpenChange={setModalItemCronograma}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editandoItemCronograma
                ? "Editar item do cronograma"
                : "Novo item do cronograma"}
            </DialogTitle>
            <DialogDescription>
              No modo &quot;igual ao contrato&quot;, os campos repetem a tabela
              da Cláusula Sexta (preço por metragem/volume e frequência). No
              modo genérico, use unidades como HORA ou UNIDADE.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{labelValorCronograma}:</span>
                <span className="font-medium">
                  {formatarMoeda(valorGlobalCronograma)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Já alocado:</span>
                <span className="font-medium">
                  {formatarMoeda(
                    editandoItemCronograma
                      ? somaValorItensCronograma -
                          Number(editandoItemCronograma.valor_total)
                      : somaValorItensCronograma,
                  )}
                </span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-1 mt-1">
                <span className="text-blue-700 font-medium">Disponível:</span>
                <span className="font-bold text-blue-700">
                  {formatarMoeda(
                    editandoItemCronograma
                      ? saldoValorItens +
                          Number(editandoItemCronograma.valor_total)
                      : saldoValorItens,
                  )}
                </span>
              </div>
            </div>
            {editandoItemCronograma && !modoClausulaContrato && (
              <div className="space-y-2">
                <Label>Nº Item</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={formItemCronograma.numero_item}
                  onChange={(e) =>
                    setFormItemCronograma({
                      ...formItemCronograma,
                      numero_item: e.target.value,
                    })
                  }
                  className="w-24"
                />
              </div>
            )}
            {!modoClausulaContrato && (
              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Input
                  placeholder="Ex: Serviço de gravações, Manutenção mensal..."
                  value={formItemCronograma.descricao}
                  onChange={(e) =>
                    setFormItemCronograma({
                      ...formItemCronograma,
                      descricao: e.target.value,
                    })
                  }
                />
              </div>
            )}
            {(!editandoItemCronograma ||
              editandoItemCronograma.unidade_medida !== "MENSAL") && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3 bg-gray-50/80">
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor="modo-clausula-cronograma"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Igual à tabela de preços do contrato (Cláusula Sexta)
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Mesma ordem e nomes da cláusula: descrição, unidade Serviço,
                    quantidade/metragem, frequência, valor por m² ou litro,
                    valor por frequência e valor total.
                  </p>
                </div>
                <Switch
                  id="modo-clausula-cronograma"
                  checked={modoClausulaContrato}
                  onCheckedChange={(c) => {
                    setModoClausulaContrato(c);
                    if (c) {
                      const mv = mesesVigenciaContrato(
                        contratoProp?.data_vigencia_inicio,
                        contratoProp?.data_vigencia_fim,
                      );
                      const sug = execucoesSugeridasPorFrequencia(
                        mv,
                        frequenciaContrato,
                      );
                      const mesesStr =
                        frequenciaContrato === "UNICA" ? "" : String(sug);
                      setFormItemCronograma((prev) => {
                        const ut = totaisFormItemCronograma(
                          prev.quantidade,
                          prev.valor_unitario,
                          mesesStr,
                          false,
                        );
                        return {
                          ...prev,
                          unidade_medida: unidadeClausulaBase,
                          quantidade_meses: mesesStr,
                          ...ut,
                        };
                      });
                    }
                  }}
                />
              </div>
            )}
            {modoClausulaContrato ? (
              <div className="space-y-4 rounded-lg border-2 border-slate-300 bg-slate-50/90 p-4 shadow-sm">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800 border-b border-slate-300 pb-2">
                    Cláusula Sexta – Do preço e da revisão
                  </h3>
                  <p className="text-xs text-slate-600 mt-2">
                    Vigência para sugerir execuções: ~{mesesVigenciaModal} meses
                    {contratoProp?.data_vigencia_inicio &&
                    contratoProp?.data_vigencia_fim
                      ? ` (${formatarData(contratoProp.data_vigencia_inicio)} a ${formatarData(contratoProp.data_vigencia_fim)})`
                      : " — cadastre início e fim da vigência no contrato para o cálculo automático."}
                  </p>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-end border-b border-slate-200 pb-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-slate-700">
                      Item
                    </Label>
                    {editandoItemCronograma ? (
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="w-28 font-semibold tabular-nums"
                        value={formItemCronograma.numero_item}
                        onChange={(e) =>
                          setFormItemCronograma({
                            ...formItemCronograma,
                            numero_item: e.target.value,
                          })
                        }
                      />
                    ) : (
                      <p className="text-lg font-semibold tabular-nums text-slate-900 py-2">
                        {proximoNumeroItemCronograma}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-slate-700">
                    Descrição detalhada do objeto *
                  </Label>
                  <Textarea
                    placeholder="Texto conforme o contrato (objeto do serviço)…"
                    rows={4}
                    className="min-h-[100px] resize-y bg-white text-sm leading-relaxed"
                    value={formItemCronograma.descricao}
                    onChange={(e) =>
                      setFormItemCronograma({
                        ...formItemCronograma,
                        descricao: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-slate-700">
                      Unidade
                    </Label>
                    <Select
                      value={unidadeClausulaBase}
                      onValueChange={(v: "METROS" | "LITROS") => {
                        setUnidadeClausulaBase(v);
                        setFormItemCronograma((prev) => ({
                          ...prev,
                          unidade_medida: v,
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="METROS">
                          Serviço (preço por m²)
                        </SelectItem>
                        <SelectItem value="LITROS">
                          Serviço (preço por litro)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500">
                      No contrato costuma constar &quot;Serviço&quot;; aqui
                      define se a base é metragem ou litros.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-slate-700">
                      Quantidade / Metragem
                      {unidadeClausulaBase === "LITROS" ? " (litros)" : " (m²)"}{" "}
                      *
                    </Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder={
                        unidadeClausulaBase === "LITROS"
                          ? "Ex.: 1000"
                          : "Ex.: 2831,40"
                      }
                      className="bg-white font-medium tabular-nums"
                      value={formItemCronograma.quantidade}
                      onChange={(e) => {
                        const q = e.target.value;
                        setFormItemCronograma((prev) => ({
                          ...prev,
                          quantidade: q,
                          ...totaisFormItemCronograma(
                            q,
                            prev.valor_unitario,
                            frequenciaContrato === "UNICA"
                              ? ""
                              : prev.quantidade_meses,
                            false,
                          ),
                        }));
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-slate-700">
                      Frequência
                    </Label>
                    <Select
                      value={frequenciaContrato}
                      onValueChange={(f: FrequenciaExecucaoContrato) => {
                        setFrequenciaContrato(f);
                        const mv = mesesVigenciaContrato(
                          contratoProp?.data_vigencia_inicio,
                          contratoProp?.data_vigencia_fim,
                        );
                        const sug = execucoesSugeridasPorFrequencia(mv, f);
                        const mesesStr = f === "UNICA" ? "" : String(sug);
                        setFormItemCronograma((prev) => ({
                          ...prev,
                          quantidade_meses: mesesStr,
                          ...totaisFormItemCronograma(
                            prev.quantidade,
                            prev.valor_unitario,
                            mesesStr,
                            false,
                          ),
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIAS_CRONOGRAMA_CONTRATO.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-slate-700">
                      Execuções na vigência
                    </Label>
                    {frequenciaContrato === "UNICA" ? (
                      <div className="rounded-md border bg-white px-3 py-2.5 text-sm text-slate-700">
                        Única — valor total igual a quantidade × valor unitário
                        por {unidadeClausulaBase === "LITROS" ? "litro" : "m²"}.
                      </div>
                    ) : (
                      <>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          placeholder={String(execucoesSugeridasModal)}
                          className="bg-white tabular-nums"
                          value={formItemCronograma.quantidade_meses}
                          onChange={(e) => {
                            const m = e.target.value;
                            setFormItemCronograma((prev) => ({
                              ...prev,
                              quantidade_meses: m,
                              ...totaisFormItemCronograma(
                                prev.quantidade,
                                prev.valor_unitario,
                                m,
                                false,
                              ),
                            }));
                          }}
                        />
                        <p className="text-[11px] text-blue-800">
                          Sugestão pela vigência: {execucoesSugeridasModal}{" "}
                          (altere se o contrato cortar no meio do período)
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-slate-700">
                    {unidadeClausulaBase === "LITROS"
                      ? "Valor unitário por litro (R$) *"
                      : "Valor unitário por m² (R$) *"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className="bg-white max-w-xs tabular-nums"
                    value={formItemCronograma.valor_unitario}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormItemCronograma((prev) => ({
                        ...prev,
                        valor_unitario: v,
                        ...totaisFormItemCronograma(
                          prev.quantidade,
                          v,
                          frequenciaContrato === "UNICA"
                            ? ""
                            : prev.quantidade_meses,
                          false,
                        ),
                      }));
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-slate-700">
                      Valor unitário por frequência (R$)
                    </Label>
                    <Input
                      type="text"
                      readOnly
                      className="bg-white font-semibold tabular-nums border-slate-300"
                      value={
                        formItemCronograma.valor_mensal
                          ? formatarMoeda(
                              parseFloat(formItemCronograma.valor_mensal),
                            )
                          : "0,00"
                      }
                    />
                    <p className="text-[11px] text-slate-500">
                      Metragem (ou litros) × valor unitário — uma execução.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-slate-700">
                      Valor total (R$)
                    </Label>
                    <Input
                      type="text"
                      readOnly
                      className="bg-white font-bold tabular-nums text-blue-900 border-blue-200"
                      value={
                        formItemCronograma.valor_total
                          ? formatarMoeda(
                              parseFloat(formItemCronograma.valor_total),
                            )
                          : "0,00"
                      }
                    />
                    <p className="text-[11px] text-slate-500">
                      Valor por frequência × número de execuções na vigência.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unidade de Medida</Label>
                    <Select
                      value={formItemCronograma.unidade_medida}
                      onValueChange={(v) => {
                        // Ao trocar para MENSAL, limpa quantidade_meses e recalcula
                        const isMensal = v === "MENSAL";
                        setFormItemCronograma({
                          ...formItemCronograma,
                          unidade_medida: v,
                          quantidade_meses: isMensal
                            ? ""
                            : formItemCronograma.quantidade_meses,
                          ...totaisFormItemCronograma(
                            formItemCronograma.quantidade,
                            formItemCronograma.valor_unitario,
                            isMensal ? "" : formItemCronograma.quantidade_meses,
                            isMensal,
                          ),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unidadesCronograma.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Quantidade{" "}
                      {formItemCronograma.unidade_medida === "MENSAL"
                        ? "(Meses) *"
                        : "*"}
                    </Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder={
                        formItemCronograma.unidade_medida === "MENSAL"
                          ? "Ex: 12"
                          : "0"
                      }
                      value={formItemCronograma.quantidade}
                      onChange={(e) => {
                        const q = e.target.value;
                        const isMensal =
                          formItemCronograma.unidade_medida === "MENSAL";
                        // MENSAL: Valor Mensal = Valor Unitário (por mês); Valor Total = Qtd. meses × Valor Unitário
                        // OUTROS: Valor Mensal = Qtd × Valor Unitário; Valor Total = Valor Mensal × Qtd.Meses
                        setFormItemCronograma({
                          ...formItemCronograma,
                          quantidade: q,
                          ...totaisFormItemCronograma(
                            q,
                            formItemCronograma.valor_unitario,
                            isMensal ? "" : formItemCronograma.quantidade_meses,
                            isMensal,
                          ),
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Valor Unitário{" "}
                      {formItemCronograma.unidade_medida === "MENSAL"
                        ? "(R$/mês) *"
                        : "(R$) *"}
                    </Label>
                    <Input
                      type="number"
                      step={formItemCronograma.unidade_medida === "MENSAL" ? "0.000000000001" : "0.01"}
                      min="0"
                      placeholder="0,00"
                      value={formItemCronograma.valor_unitario}
                      onChange={(e) => {
                        const v = e.target.value;
                        const isMensal =
                          formItemCronograma.unidade_medida === "MENSAL";
                        setFormItemCronograma({
                          ...formItemCronograma,
                          valor_unitario: v,
                          ...totaisFormItemCronograma(
                            formItemCronograma.quantidade,
                            v,
                            isMensal ? "" : formItemCronograma.quantidade_meses,
                            isMensal,
                          ),
                        });
                      }}
                    />
                  </div>
                  {/* Nº períodos/execuções: oculto para unidade MENSAL (quantidade já representa os meses) */}
                  {formItemCronograma.unidade_medida !== "MENSAL" && (
                    <div className="space-y-2">
                      <Label>Nº períodos / execuções</Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="Ex: 4 (trimestral em 12 meses)"
                        value={formItemCronograma.quantidade_meses}
                        onChange={(e) => {
                          const m = e.target.value;
                          const mensal =
                            parseFloat(formItemCronograma.valor_mensal) || 0;
                          const total =
                            m && mensal
                              ? String(
                                  aplicarRegraMoedaContrato(
                                    mensal * parseInt(m),
                                  ),
                                )
                              : formItemCronograma.valor_mensal;
                          setFormItemCronograma({
                            ...formItemCronograma,
                            quantidade_meses: m,
                            valor_total: total,
                          });
                        }}
                      />
                      <p className="text-xs text-gray-500">
                        Quantas vezes o valor por período se repete na vigência
                        (ex.: 4 trimestres).
                      </p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      {formItemCronograma.unidade_medida === "MENSAL"
                        ? "Valor Mensal (R$)"
                        : "Valor por período (R$)"}
                    </Label>
                    <Input
                      type="text"
                      readOnly
                      className="bg-gray-50 font-medium"
                      value={
                        formItemCronograma.valor_mensal
                          ? formatarMoeda(
                              parseFloat(formItemCronograma.valor_mensal),
                            )
                          : "0,00"
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Total (R$)</Label>
                    <Input
                      type="text"
                      readOnly
                      className="bg-gray-50 font-medium text-blue-700"
                      value={
                        formItemCronograma.valor_total
                          ? formatarMoeda(valorTotalConsideradoItemCronograma)
                          : "0,00"
                      }
                    />
                  </div>
                </div>
                {podePreservarTotalJuridicoItem && (
                  <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="preservar-total-cronograma"
                        checked={formItemCronograma.preservar_valor_total}
                        onCheckedChange={(checked) =>
                          setFormItemCronograma((prev) => ({
                            ...prev,
                            preservar_valor_total: checked === true,
                          }))
                        }
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor="preservar-total-cronograma"
                          className="font-medium"
                        >
                          Manter total do contrato/ciclo
                        </Label>
                        <p className="text-xs leading-relaxed">
                          Calculado pelo unitário:{" "}
                          <strong>{formatarMoeda(valorTotalFormItemCronograma)}</strong>.
                          Disponível para este item:{" "}
                          <strong>{formatarMoeda(valorDisponivelEdicaoItemCronograma)}</strong>.
                          Diferença:{" "}
                          <strong>{formatarMoeda(Math.abs(diferencaValorItemCronograma))}</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {deveAvisarDiferencaMensal && (
                  <div className={`rounded-lg border p-3 text-sm ${
                    diferencaMensalApenasCentavos
                      ? "border-blue-300 bg-blue-50 text-blue-900"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                  }`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-2">
                        <p className="font-medium">
                          {diferencaMensalApenasCentavos
                            ? "Diferença de centavos detectada no item mensal."
                            : "O valor mensal informado não fecha com o valor disponível do contrato."}
                        </p>
                        <p className="text-xs leading-relaxed">
                          Total calculado:{" "}
                          <strong>
                            {formatarMoeda(valorTotalFormItemCronograma)}
                          </strong>
                          . Disponível para este item:{" "}
                          <strong>
                            {formatarMoeda(valorDisponivelEdicaoItemCronograma)}
                          </strong>
                          . Diferença:{" "}
                          <strong>
                            {formatarMoeda(Math.abs(diferencaValorItemMensal))}
                          </strong>
                          .
                          {diferencaMensalApenasCentavos
                            ? " O sistema vai considerar o total jurídico disponível do contrato e manter o valor mensal em centavos para as notas fiscais."
                            : (
                              <>
                                {" "}Para fechar em{" "}
                                {formatarMoeda(valorDisponivelEdicaoItemCronograma)}{" "}
                                com{" "}
                                {quantidadeFormItemCronograma.toLocaleString(
                                  "pt-BR",
                                  { maximumFractionDigits: 4 },
                                )}{" "}
                                meses, o mensal deve ser{" "}
                                <strong>
                                  {formatarMoeda(valorMensalSugeridoPeloDisponivel)}
                                </strong>
                                .
                              </>
                            )}
                        </p>
                        {!diferencaMensalApenasCentavos && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                            onClick={aplicarValorMensalPeloDisponivel}
                          >
                            Usar mensal pelo disponível
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {isAdmin && (
              <div className="space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Label className="text-amber-800 font-medium">
                  {(modoClausulaContrato
                    ? unidadeClausulaBase
                    : formItemCronograma.unidade_medida) === "MENSAL"
                    ? "Valor já consumido (ajuste migração)"
                    : "Quantidade já utilizada (ajuste migração)"}
                </Label>
                {(modoClausulaContrato
                  ? unidadeClausulaBase
                  : formItemCronograma.unidade_medida) === "MENSAL" ? (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-amber-700 mb-1 block">
                        Valor em R$ (recomendado para medições parciais)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={parseFloat(formItemCronograma.valor_total) || 0}
                        value={formItemCronograma.valor_medida_reais}
                        onChange={(e) => {
                          const reais = parseFloat(e.target.value) || 0;
                          const vlUnit =
                            parseFloat(formItemCronograma.valor_unitario) || 0;
                          const meses =
                            vlUnit > 0
                              ? Math.round((reais / vlUnit) * 100000) / 100000
                              : 0;
                          setFormItemCronograma({
                            ...formItemCronograma,
                            valor_medida_reais: e.target.value,
                            quantidade_medida: String(meses),
                          });
                        }}
                        placeholder="Ex: 9282,16"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-amber-700 mb-1 block">
                        Ou informe em meses (pode ser decimal)
                      </Label>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        max={parseFloat(formItemCronograma.quantidade) || 0}
                        value={formItemCronograma.quantidade_medida}
                        onChange={(e) => {
                          const meses = parseFloat(e.target.value) || 0;
                          const vlUnit =
                            parseFloat(formItemCronograma.valor_unitario) || 0;
                          const reais = prodTrunc(meses, vlUnit);
                          setFormItemCronograma({
                            ...formItemCronograma,
                            quantidade_medida: e.target.value,
                            valor_medida_reais: reais > 0 ? String(reais) : "",
                          });
                        }}
                        placeholder="Ex: 0.5 (meio mês)"
                      />
                    </div>
                    {parseFloat(formItemCronograma.quantidade_medida) > 0 && (
                      <p className="text-xs text-amber-800 font-medium">
                        ={" "}
                        {parseFloat(
                          formItemCronograma.quantidade_medida,
                        ).toLocaleString("pt-BR", {
                          minimumFractionDigits: 4,
                        })}{" "}
                        meses (≈{" "}
                        {Math.round(
                          parseFloat(formItemCronograma.quantidade_medida) * 30,
                        )}{" "}
                        dias)
                      </p>
                    )}
                  </div>
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={parseFloat(formItemCronograma.quantidade) || 0}
                    value={formItemCronograma.quantidade_medida}
                    onChange={(e) =>
                      setFormItemCronograma({
                        ...formItemCronograma,
                        quantidade_medida: e.target.value,
                      })
                    }
                    placeholder="0"
                  />
                )}
                <p className="text-xs text-amber-700">
                  Informe o valor já consumido antes da implantação do sistema.
                  Será considerado nos cálculos de disponibilidade.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Opcional"
                value={formItemCronograma.observacoes}
                onChange={(e) =>
                  setFormItemCronograma({
                    ...formItemCronograma,
                    observacoes: e.target.value,
                  })
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalItemCronograma(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={salvarItemCronograma}
              disabled={
                actionLoading ||
                !formItemCronograma.descricao ||
                !formItemCronograma.quantidade ||
                !formItemCronograma.valor_unitario ||
                parseFloat(formItemCronograma.quantidade) <= 0 ||
                parseFloat(formItemCronograma.valor_unitario) <= 0
              }
            >
              {actionLoading && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editandoItemCronograma ? "Salvar" : "Criar Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Página Nova Medição */}
      {modalMedicao && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="border-b bg-white px-6 py-3 flex items-center gap-3 shadow-sm flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setModalMedicao(false);
                setExecucaoFinanceiraModal(null);
                setDiscriminacoes([]);
                setArquivosPendentes([]);
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="h-6 w-px bg-gray-200" />
            <div className="flex items-center justify-between flex-1">
              <div>
                <h2 className="text-xl font-semibold">
                  Boletim de Medição #{medicoes.length + 1}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {formMedicao.periodo_inicio && formMedicao.periodo_fim
                    ? `Período: ${formatarData(formMedicao.periodo_inicio)} a ${formatarData(formMedicao.periodo_fim)}`
                    : "Informe o período e preencha a execução de cada item"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Valor da Medição
                </p>
                {(() => {
                  const totalMedicao = isServicoContinuado
                    ? parseFloat(formMedicao.valor_medido) || 0
                    : usarItensCronograma
                      ? formMedicao.itens.reduce((acc, item) => {
                          if (!("item_cronograma_id" in item)) return acc;
                          const ic = itensCronograma.find(
                            (i) => i.id === item.item_cronograma_id,
                          );
                          if (!ic) return acc;
                          const subtotal =
                            item.modo_input === "valor" &&
                            (item as any).valor_override != null
                              ? (item as any).valor_override
                              : item.quantidade_medida *
                                Number(ic.valor_unitario);
                          return acc + subtotal;
                        }, 0)
                      : formMedicao.itens.reduce((acc, item, idx) => {
                          const etapa = etapas[idx];
                          if (!etapa || !("etapa_id" in item)) return acc;
                          return item.modo_input === "valor" &&
                            item.valor_executado_atual
                            ? acc + item.valor_executado_atual
                            : acc +
                                (item.percentual_executado_atual / 100) *
                                  Number(etapa.valor_previsto);
                        }, 0);
                  const saldoDisp = resumo?.saldo_disponivel ?? Infinity;
                  const excedeSaldo = totalMedicao > saldoDisp + 0.01;
                  return (
                    <>
                      <p
                        className={`text-2xl font-bold ${excedeSaldo ? "text-red-600" : "text-blue-700"}`}
                      >
                        {formatarMoeda(totalMedicao)}
                      </p>
                      {excedeSaldo && (
                        <p className="text-xs text-red-500 mt-1">
                          Excede o saldo de {formatarMoeda(saldoDisp)}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {medicoes.length > 0 &&
                (() => {
                  const ultima = [...medicoes].sort(
                    (a, b) => b.numero_medicao - a.numero_medicao,
                  )[0];
                  return (
                    <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <Copy className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-indigo-900">
                          Replicar medição #{ultima.numero_medicao}
                        </p>
                        <p className="text-xs text-indigo-700">
                          Copia itens, valores e discriminações do boletim
                          anterior. Preencha apenas o período e a nota fiscal.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={replicarMedicaoAnterior}
                        disabled={carregandoReplicar}
                        className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 whitespace-nowrap flex-shrink-0"
                      >
                        {carregandoReplicar ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Copiando...
                          </>
                        ) : (
                          "Copiar valores"
                        )}
                      </Button>
                    </div>
                  );
                })()}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border bg-orange-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-orange-700">
                    Vigência do contrato
                  </p>
                  <p className="mt-1 text-sm font-semibold text-orange-900">
                    {contratoProp?.data_vigencia_inicio &&
                    contratoProp?.data_vigencia_fim
                      ? `${formatarData(contratoProp.data_vigencia_inicio)} a ${formatarData(contratoProp.data_vigencia_fim)}`
                      : "-"}
                  </p>
                </div>
                <div className="rounded-lg border bg-blue-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                    Saldo disponível
                  </p>
                  <p
                    className={`mt-1 text-sm font-semibold ${(resumo?.saldo_disponivel || 0) > 0 ? "text-blue-900" : "text-red-700"}`}
                  >
                    {formatarMoeda(resumo?.saldo_disponivel || 0)}
                  </p>
                  {(resumo?.valor_em_analise || 0) > 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Em análise: {formatarMoeda(resumo?.valor_em_analise || 0)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Período Início *</Label>
                  <Input
                    type="date"
                    value={formMedicao.periodo_inicio}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormMedicao({ ...formMedicao, periodo_inicio: v });
                      if (v && formMedicao.periodo_fim)
                        carregarExecucaoFinanceiraModal(
                          undefined,
                          v,
                          formMedicao.periodo_fim,
                        );
                    }}
                  />
                </div>
                <div>
                  <Label>Período Fim *</Label>
                  <Input
                    type="date"
                    value={formMedicao.periodo_fim}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormMedicao({ ...formMedicao, periodo_fim: v });
                      if (formMedicao.periodo_inicio && v)
                        carregarExecucaoFinanceiraModal(
                          undefined,
                          formMedicao.periodo_inicio,
                          v,
                        );
                    }}
                  />
                </div>
              </div>

              <div>
                <Label>Competência *</Label>
                <Input
                  value={formMedicao.competencia}
                  onChange={(e) =>
                    setFormMedicao({
                      ...formMedicao,
                      competencia: e.target.value,
                    })
                  }
                  placeholder="Ex: FEVEREIRO/2026"
                  className="uppercase"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Informe a competência no formato MÊS/ANO (ex: FEVEREIRO/2026)
                </p>
              </div>

              {isServicoContinuado && (
                <div className="border rounded-lg p-4 bg-blue-50/30">
                  <Label className="text-sm font-bold text-gray-700 mb-2 block">
                    Valor Medido no Período (R$) *
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formMedicao.valor_medido}
                    onChange={(e) =>
                      setFormMedicao({
                        ...formMedicao,
                        valor_medido: e.target.value,
                      })
                    }
                    placeholder="0,00"
                    className="max-w-xs text-lg font-medium"
                  />
                  {resumo && (
                    <p className="text-xs text-gray-500 mt-2">
                      Saldo disponível: {formatarMoeda(resumo.saldo_disponivel)}{" "}
                      de {formatarMoeda(valorGlobal)}
                    </p>
                  )}
                </div>
              )}

              {!isServicoContinuado && usarItensCronograma && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b gap-3">
                    <p className="text-xs text-gray-500">
                      Para períodos parciais (ex: 21 dias), use{" "}
                      <strong>Proporcional</strong> ou informe o{" "}
                      <strong>Valor R$</strong> diretamente.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        !formMedicao.periodo_inicio || !formMedicao.periodo_fim
                      }
                      onClick={() => {
                        if (
                          !formMedicao.periodo_inicio ||
                          !formMedicao.periodo_fim
                        )
                          return;
                        const dias = calcularDiasMesComercial(
                          formMedicao.periodo_inicio,
                          formMedicao.periodo_fim,
                          contratoProp?.data_vigencia_fim,
                        );
                        const fator = Math.min(dias / 30, 1);
                        const ar = contratoProp?.arredondar_calculo ?? true;
                        const valoresMensaisProporcionais =
                          distribuirValoresMensaisPorTotal(
                            itensCronograma
                              .map((ic) => {
                                const saldo =
                                  Number(ic.quantidade) -
                                  Number(ic.quantidade_medida) -
                                  (resumo?.itens_comprometidos?.[ic.id] || 0);
                                return {
                                  id: ic.id,
                                  valorUnitario: Number(ic.valor_unitario),
                                  quantidadeValor: Math.max(
                                    0,
                                    Math.min(fator, saldo),
                                  ),
                                  saldoFinanceiro:
                                    calcularSaldoFinanceiroItemCronograma(ic),
                                  isMensal: ic.unidade_medida === "MENSAL",
                                };
                              })
                              .filter((ic) => ic.isMensal),
                          );
                        const itens = itensCronograma.map((ic) => {
                          const saldo =
                            Number(ic.quantidade) -
                            Number(ic.quantidade_medida) -
                            (resumo?.itens_comprometidos?.[ic.id] || 0);
                          const saldoFinanceiro =
                            calcularSaldoFinanceiroItemCronograma(ic);
                          const isMensal = ic.unidade_medida === "MENSAL";
                          const qtd = isMensal
                            ? Math.max(
                                0,
                                Math.min(
                                  Math.round(fator * 10000) / 10000,
                                  saldo,
                                ),
                              )
                            : Math.min(
                                Math.round(fator * saldo * 1000) / 1000,
                                saldo,
                              );
                          // Para itens MENSAL: calcula o valor proporcional exato em aritmética inteira (dias × vu_centavos / 30)
                          // evitando o erro de arredondamento do fator (ex.: 11/30 = 0,3667 → 0,3667 × 36598,50 ≠ 11/30 × 36598,50)
                          const valorProporcional = isMensal
                            ? (valoresMensaisProporcionais.get(ic.id) || 0)
                            : (ar
                                ? Math.round(qtd * Number(ic.valor_unitario) * 100) / 100
                                : Math.floor(qtd * Number(ic.valor_unitario) * 100) / 100);
                          const valorOverride = limitarValorAoSaldoFinanceiro(
                            valorProporcional,
                            saldoFinanceiro,
                          );
                          // MENSAL usa modo 'valor' para que a coluna Valor R$ exiba o valor exato (não qtd × vu)
                          const modo = isMensal
                            ? ("valor" as const)
                            : ("quantidade" as const);
                          return {
                            item_cronograma_id: ic.id,
                            quantidade_medida: qtd,
                            modo_input: modo,
                            valor_override: valorOverride,
                            ...(isMensal
                              ? { valor_medido_override: valorOverride }
                              : {}),
                          };
                        });
                        setFormMedicao({ ...formMedicao, itens });
                      }}
                      className="text-blue-700 border-blue-300 hover:bg-blue-50 whitespace-nowrap"
                    >
                      Proporcional (
                      {formMedicao.periodo_inicio && formMedicao.periodo_fim
                        ? `${calcularDiasMesComercial(formMedicao.periodo_inicio, formMedicao.periodo_fim, contratoProp?.data_vigencia_fim)}/30 dias`
                        : "defina o período"}
                      )
                    </Button>
                  </div>
                  {/* Aviso sobre mistura de tipos */}
                  {itensCronograma.some(
                    (ic) => ic.unidade_medida === "MENSAL",
                  ) &&
                    itensCronograma.some(
                      (ic) => ic.unidade_medida !== "MENSAL",
                    ) && (
                      <div className="mx-0 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                        <p className="text-xs text-amber-800">
                          <strong>Atenção:</strong> Este contrato possui itens
                          medidos por quantidade e itens mensais. Não é possível
                          incluir ambos os tipos na mesma medição — preencha
                          apenas itens de um tipo por vez.
                          {tipoMedicaoAtual && (
                            <span className="font-medium">
                              {" "}
                              Tipo atual:{" "}
                              <strong>
                                {tipoMedicaoAtual === "mensal"
                                  ? "Mensal"
                                  : "Por quantidade"}
                              </strong>
                              .
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-12 text-center font-bold text-xs uppercase">
                          Item
                        </TableHead>
                        <TableHead className="font-bold text-xs uppercase">
                          Descrição
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs uppercase w-28">
                          Unidade
                        </TableHead>
                        {exibirColunasFrequenciaCronograma && (
                          <TableHead className="text-center font-bold text-xs uppercase w-24">
                            Frequência
                          </TableHead>
                        )}
                        <TableHead className="text-right font-bold text-xs uppercase w-20">
                          Qtd. Total
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase w-24">
                          Valor Unit.
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs uppercase w-24 bg-blue-50">
                          Qtd. Mês/Dias
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs uppercase w-28 bg-green-50">
                          Valor R$
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase w-24 bg-blue-50">
                          Subtotal
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensCronograma.map((ic, idx) => {
                        const itemState = formMedicao.itens[idx] as
                          | {
                              item_cronograma_id: string;
                              quantidade_medida: number;
                              modo_input?: "quantidade" | "valor";
                              valor_override?: number;
                            }
                          | undefined;
                        const qtdMedida = itemState?.quantidade_medida || 0;
                        const valorOverride = itemState?.valor_override;
                        const modoInput = itemState?.modo_input ?? "quantidade";
                        // Total = quantidade × nº de execuções/meses (itens recorrentes:
                        // cada execução mede a quantidade cheia — ex.: trimestral 4×)
                        const qtdTotal =
                          Number(ic.quantidade) *
                          (Number(ic.quantidade_meses) || 1);
                        const qtdAprovada = Number(ic.quantidade_medida);
                        const emTransito =
                          resumo?.itens_comprometidos?.[ic.id] || 0;
                        const saldo = qtdTotal - qtdAprovada - emTransito;
                        const saldoFinanceiro =
                          calcularSaldoFinanceiroItemCronograma(ic);
                        const valorUnit = Number(ic.valor_unitario);
                        const subtotal =
                          modoInput === "valor" && valorOverride != null
                            ? valorOverride
                            : qtdMedida * valorUnit;
                        const excedeSaldo =
                          modoInput === "valor"
                            ? (valorOverride || 0) > saldoFinanceiro + 0.01
                            : qtdMedida > saldo + 0.001;
                        const isMensal = ic.unidade_medida === "MENSAL";
                        const tipoEsteItem = isMensal ? "mensal" : "quantidade";
                        const bloqueado =
                          tipoMedicaoAtual !== null &&
                          tipoEsteItem !== tipoMedicaoAtual;
                        return (
                          <TableRow
                            key={ic.id}
                            className={`hover:bg-gray-50 ${bloqueado ? "opacity-40" : ""}`}
                          >
                            <TableCell className="text-center font-mono text-sm font-medium">
                              {ic.numero_item}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words min-w-[200px]">
                              <p className="text-sm font-medium">
                                {ic.descricao}
                              </p>
                              {bloqueado && (
                                <p className="text-xs text-amber-600 mt-0.5">
                                  Inclua em medição separada (tipo:{" "}
                                  {isMensal ? "mensal" : "por quantidade"})
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs leading-tight max-w-[120px]">
                              {textoUnidadeCronogramaNaTela(ic.unidade_medida)}
                            </TableCell>
                            {exibirColunasFrequenciaCronograma && (
                              <TableCell className="text-center text-xs whitespace-nowrap">
                                {textoFrequenciaNaTela(ic.frequencia_execucao)}
                              </TableCell>
                            )}
                            <TableCell className="text-right text-sm">
                              {qtdTotal.toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatarMoeda(valorUnit)}
                            </TableCell>
                            <TableCell className="bg-blue-50/50">
                              <Input
                                type="number"
                                step="0.001"
                                min="0"
                                max={saldo}
                                placeholder="0"
                                disabled={bloqueado}
                                value={
                                  modoInput === "quantidade"
                                    ? qtdMedida || ""
                                    : qtdMedida > 0
                                      ? qtdMedida.toFixed(4)
                                      : ""
                                }
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const itens = [...formMedicao.itens];
                                  itens[idx] = {
                                    item_cronograma_id: ic.id,
                                    quantidade_medida: val,
                                    modo_input: "quantidade",
                                    valor_override:
                                      limitarValorAoSaldoFinanceiro(
                                        Math.round(val * valorUnit * 100) / 100,
                                        saldoFinanceiro,
                                      ),
                                  };
                                  setFormMedicao({ ...formMedicao, itens });
                                }}
                                className={`text-center h-8 text-sm ${modoInput === "quantidade" ? "ring-1 ring-blue-300 bg-white" : "bg-gray-50 text-gray-500"} ${excedeSaldo ? "border-red-400" : ""}`}
                              />
                            </TableCell>
                            <TableCell className="bg-green-50/50">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={saldoFinanceiro}
                                placeholder="0,00"
                                disabled={bloqueado}
                                value={
                                  modoInput === "valor"
                                    ? valorOverride || ""
                                    : subtotal > 0
                                      ? subtotal.toFixed(2)
                                      : ""
                                }
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const valorLimitado =
                                    limitarValorAoSaldoFinanceiro(
                                      val,
                                      saldoFinanceiro,
                                    );
                                  const qtdCalc =
                                    valorUnit > 0
                                      ? Math.round((valorLimitado / valorUnit) * 10000) /
                                        10000
                                      : 0;
                                  const itens = [...formMedicao.itens];
                                  itens[idx] = {
                                    item_cronograma_id: ic.id,
                                    quantidade_medida: qtdCalc,
                                    modo_input: "valor",
                                    valor_override: valorLimitado,
                                  };
                                  setFormMedicao({ ...formMedicao, itens });
                                }}
                                className={`text-center h-8 text-sm ${modoInput === "valor" ? "ring-1 ring-green-300 bg-white" : "bg-gray-50 text-gray-500"} ${excedeSaldo ? "border-red-400" : ""}`}
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium bg-blue-50/50">
                              <span
                                className={`text-sm ${subtotal > 0 ? (excedeSaldo ? "text-red-600" : "text-blue-700") : "text-gray-400"}`}
                              >
                                {formatarMoeda(subtotal)}
                              </span>
                              {excedeSaldo && (
                                <p className="text-xs text-red-500">
                                  Excede saldo
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {!isServicoContinuado && !usarItensCronograma && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-16 text-center font-bold text-xs uppercase">
                          Item
                        </TableHead>
                        <TableHead className="font-bold text-xs uppercase">
                          Descrição
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase w-28">
                          Valor Prev.
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs uppercase w-20">
                          Med. Acum.
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs uppercase w-28 bg-blue-50">
                          Exec. Mês (%)
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs uppercase w-32 bg-green-50">
                          Exec. Mês (R$)
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase w-28 bg-blue-50">
                          Subtotal
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {etapas
                        .filter((e) => e.status !== "CONCLUIDA")
                        .map((etapa, idx) => {
                          const jaExecutado = Number(
                            etapa.percentual_executado,
                          );
                          const emTransito =
                            resumo?.etapas_comprometidas?.[etapa.id] || 0;
                          const itemState = formMedicao.itens[idx] as
                            | {
                                etapa_id: string;
                                percentual_executado_atual: number;
                                valor_executado_atual?: number;
                                modo_input?: "percentual" | "valor";
                              }
                            | undefined;
                          const modoInput =
                            itemState?.modo_input ?? "percentual";
                          const execPerc =
                            itemState?.percentual_executado_atual ?? 0;
                          const execValor =
                            itemState?.valor_executado_atual ?? 0;
                          const valorPrevisto = Number(etapa.valor_previsto);
                          const restante = 100 - jaExecutado - emTransito;
                          const valorRestante =
                            (restante / 100) * valorPrevisto;
                          const subtotal =
                            modoInput === "valor"
                              ? execValor
                              : (execPerc / 100) * valorPrevisto;
                          const percExibido =
                            modoInput === "valor" && valorPrevisto > 0
                              ? (execValor / valorPrevisto) * 100
                              : execPerc;
                          const excedeLimite = percExibido > restante + 0.01;
                          return (
                            <TableRow
                              key={etapa.id}
                              className="hover:bg-gray-50"
                            >
                              <TableCell className="text-center font-mono text-sm font-medium">
                                {etapa.numero_etapa}
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium">
                                  {etapa.descricao}
                                </p>
                                <p className="text-xs text-gray-400">
                                  Disponível: {restante.toFixed(1)}% (
                                  {formatarMoeda(valorRestante)})
                                </p>
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatarMoeda(valorPrevisto)}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="text-sm font-medium text-blue-600">
                                  {jaExecutado.toFixed(0)}%
                                </span>
                              </TableCell>
                              <TableCell className="bg-blue-50/50">
                                <Input
                                  type="number"
                                  min="0"
                                  max={restante}
                                  step="0.1"
                                  placeholder="0"
                                  value={
                                    modoInput === "percentual"
                                      ? execPerc || ""
                                      : percExibido > 0
                                        ? percExibido.toFixed(2)
                                        : ""
                                  }
                                  onChange={(e) => {
                                    const num =
                                      e.target.value === ""
                                        ? 0
                                        : Number(e.target.value);
                                    const itens = [...formMedicao.itens];
                                    itens[idx] = {
                                      etapa_id: etapa.id,
                                      percentual_executado_atual: num,
                                      valor_executado_atual:
                                        valorPrevisto > 0
                                          ? (num / 100) * valorPrevisto
                                          : 0,
                                      modo_input: "percentual",
                                    };
                                    setFormMedicao({ ...formMedicao, itens });
                                  }}
                                  className={`text-center h-8 text-sm ${modoInput === "percentual" ? "ring-1 ring-blue-300 bg-white" : "bg-gray-50 text-gray-500"} ${excedeLimite ? "border-red-400" : ""}`}
                                />
                              </TableCell>
                              <TableCell className="bg-green-50/50">
                                <Input
                                  type="number"
                                  min="0"
                                  max={valorRestante}
                                  step="0.01"
                                  placeholder="0,00"
                                  value={
                                    modoInput === "valor"
                                      ? execValor || ""
                                      : subtotal > 0
                                        ? subtotal.toFixed(2)
                                        : ""
                                  }
                                  onChange={(e) => {
                                    const num =
                                      e.target.value === ""
                                        ? 0
                                        : Number(e.target.value);
                                    const perc =
                                      valorPrevisto > 0
                                        ? (num / valorPrevisto) * 100
                                        : 0;
                                    const itens = [...formMedicao.itens];
                                    itens[idx] = {
                                      etapa_id: etapa.id,
                                      percentual_executado_atual:
                                        Math.round(perc * 100) / 100,
                                      valor_executado_atual: num,
                                      modo_input: "valor",
                                    };
                                    setFormMedicao({ ...formMedicao, itens });
                                  }}
                                  className={`text-center h-8 text-sm ${modoInput === "valor" ? "ring-1 ring-green-300 bg-white" : "bg-gray-50 text-gray-500"} ${excedeLimite ? "border-red-400" : ""}`}
                                />
                              </TableCell>
                              <TableCell className="text-right bg-blue-50/50">
                                <span
                                  className={`text-sm font-medium ${subtotal > 0 ? (excedeLimite ? "text-red-600" : "text-blue-700") : "text-gray-400"}`}
                                >
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

              {formMedicao.periodo_inicio &&
                formMedicao.periodo_fim &&
                contratoProp?.data_vigencia_inicio &&
                contratoProp?.data_vigencia_fim &&
                (() => {
                  const primeiraMedicaoCiclo = !existeMedicaoAnteriorNoCiclo(
                    formMedicao.periodo_inicio,
                  );
                  const diasMigracaoTempo = calcularDiasMigracaoTempo();
                  const valorMedicaoAtual = isServicoContinuado
                    ? parseFloat(formMedicao.valor_medido) || 0
                    : usarItensCronograma
                      ? formMedicao.itens.reduce((acc, item) => {
                          if (!("item_cronograma_id" in item)) return acc;
                          const ic = itensCronograma.find(
                            (i) => i.id === item.item_cronograma_id,
                          );
                          if (!ic) return acc;
                          // Usa valor_override quando modo='valor' (ex.: proporcional MENSAL com valor exato)
                          const subtotal =
                            item.modo_input === "valor" &&
                            (item as any).valor_override != null
                              ? (item as any).valor_override
                              : item.quantidade_medida *
                                Number(ic.valor_unitario);
                          return acc + subtotal;
                        }, 0)
                      : formMedicao.itens.reduce((acc, item, idx) => {
                          const etapa = etapas[idx];
                          if (!etapa || !("etapa_id" in item)) return acc;
                          return item.modo_input === "valor" &&
                            item.valor_executado_atual
                            ? acc + item.valor_executado_atual
                            : acc +
                                (item.percentual_executado_atual / 100) *
                                  Number(etapa.valor_previsto);
                        }, 0);
                  // Calcula totais de execução financeira filtrando pelo tipo de item selecionado
                  const {
                    noPeriodoExibicao,
                    atePeriodoExibicao,
                    aExecutarExibicao,
                  } = (() => {
                    // Para null com itens cronograma: nenhum item preenchido, retornar zeros
                    if (tipoMedicaoAtual === null && usarItensCronograma) {
                      return {
                        noPeriodoExibicao: 0,
                        atePeriodoExibicao: 0,
                        aExecutarExibicao: 0,
                      };
                    }

                    // Para itens MENSAL: usar dados reais do backend para atePeriodo (evita erro de arredondamento por qtd × vm)
                    if (tipoMedicaoAtual === "mensal") {
                      // Acumular em centavos para evitar drift de ponto flutuante (ex.: 6,82×2831,40=19310,148)
                      let centNoP = 0,
                        centAteP = 0,
                        centAExec = 0;
                      const itensMens = itensCronograma.filter(
                        (ic) => ic.unidade_medida === "MENSAL",
                      );
                      for (const ic of itensMens) {
                        const itemState = formMedicao.itens.find(
                          (i) =>
                            "item_cronograma_id" in i &&
                            (i as any).item_cronograma_id === ic.id,
                        ) as any;
                        const qtdNoPeriodo = Number(
                          itemState?.quantidade_medida ?? 0,
                        );
                        if (qtdNoPeriodo <= 0) continue;
                        const vm =
                          Number(ic.valor_mensal) ||
                          Number(ic.valor_unitario) ||
                          0;
                        const centItem =
                          itemState?.modo_input === "valor" &&
                          itemState?.valor_override != null
                            ? Math.round(itemState.valor_override * 100)
                            : Math.floor(
                                (Math.round(qtdNoPeriodo * 100) *
                                  Math.round(vm * 100)) /
                                  100,
                              );
                        // Usa o valor financeiro aprovado do backend quando disponível para evitar acúmulo de arredondamento
                        // Também considera ic.quantidade_medida (migração por item) que o backend não computa
                        const backendItem =
                          execucaoFinanceiraModal?.itens?.find(
                            (i: any) => i.etapa_id === ic.id,
                          );
                        const fromBackend = backendItem
                          ? Number(
                              backendItem.ate_periodo_global ??
                                backendItem.ate_periodo ??
                                0,
                            )
                          : 0;
                        const centMigracao =
                          Number(ic.valor_migracao_reais ?? 0) > 0
                            ? Math.round(Number(ic.valor_migracao_reais) * 100)
                            : Math.floor(
                                (Math.round(
                                  Number(ic.quantidade_medida ?? 0) * 100,
                                ) *
                                  Math.round(vm * 100)) /
                                  100,
                              );
                        const centAprovadoAnterior = Math.round(
                          Math.max(fromBackend, centMigracao / 100) * 100,
                        );
                        const centAte = centAprovadoAnterior + centItem;
                        const centTotal = Math.round(
                          (Number(ic.valor_total) || 0) * 100,
                        );
                        centNoP += centItem;
                        centAteP += centAte;
                        centAExec += Math.max(0, centTotal - centAte);
                      }
                      return {
                        noPeriodoExibicao: centNoP / 100,
                        atePeriodoExibicao: centAteP / 100,
                        aExecutarExibicao: centAExec / 100,
                      };
                    }

                    // Para quantidade: espelha exatamente o fiscal (qtd × valor_unitario)
                    // Isso garante que ajustes manuais de quantidade sejam respeitados
                    if (tipoMedicaoAtual === "quantidade") {
                      // Acumular em centavos para evitar drift de ponto flutuante (ex.: 6,82×2831,40=19310,148)
                      let centNoP = 0,
                        centAteP = 0,
                        centAExec = 0;
                      const itensQtd = itensCronograma.filter(
                        (ic) => ic.unidade_medida !== "MENSAL",
                      );
                      for (const ic of itensQtd) {
                        const itemState = formMedicao.itens.find(
                          (i) =>
                            "item_cronograma_id" in i &&
                            (i as any).item_cronograma_id === ic.id,
                        ) as any;
                        const qtdNoPeriodo = Number(
                          itemState?.quantidade_medida ?? 0,
                        );
                        if (qtdNoPeriodo <= 0) continue;
                        const qtdAprovada = Number(ic.quantidade_medida ?? 0);
                        // quantidade × quantidade_meses = total físico contratado (ic.quantidade é por execução)
                        const qtdTotal =
                          Number(ic.quantidade ?? 0) *
                          (Number(ic.quantidade_meses) || 1);
                        const qtdAtePeriodo = qtdAprovada + qtdNoPeriodo;
                        const qtdAExecutar = Math.max(
                          0,
                          qtdTotal - qtdAtePeriodo,
                        );
                        const vu = Number(ic.valor_unitario);
                        centNoP += Math.floor(
                          (Math.round(qtdNoPeriodo * 100) *
                            Math.round(vu * 100)) /
                            100,
                        );
                        centAteP += Math.floor(
                          (Math.round(qtdAtePeriodo * 100) *
                            Math.round(vu * 100)) /
                            100,
                        );
                        centAExec += Math.floor(
                          (Math.round(qtdAExecutar * 100) *
                            Math.round(vu * 100)) /
                            100,
                        );
                      }
                      return {
                        noPeriodoExibicao: centNoP / 100,
                        atePeriodoExibicao: centAteP / 100,
                        aExecutarExibicao: centAExec / 100,
                      };
                    }

                    // Demais tipos: usar dados do backend ou fallback por valor global
                    const itensBase =
                      tipoMedicaoAtual === null
                        ? itensCronograma
                        : itensCronograma.filter((ic) => {
                            const isMensal = ic.unidade_medida === "MENSAL";
                            return tipoMedicaoAtual === "mensal"
                              ? isMensal
                              : !isMensal;
                          });

                    if (
                      usarItensCronograma &&
                      execucaoFinanceiraModal?.itens?.length
                    ) {
                      const idsBase = new Set(itensBase.map((ic) => ic.id));
                      const itensBack = (
                        execucaoFinanceiraModal.itens as any[]
                      ).filter((i: any) => idsBase.has(i.etapa_id));
                      const noPeriodoBk = itensBack.reduce(
                        (s: number, i: any) => s + Number(i.no_periodo || 0),
                        0,
                      );
                      const atePeriodoBk = itensBack.reduce(
                        (s: number, i: any) =>
                          s +
                          Number(i.ate_periodo_global ?? i.ate_periodo ?? 0),
                        0,
                      );
                      // Prioriza o valor do formulário (local) quando há itens preenchidos, para refletir
                      // o valor exato do proporcional antes de salvar (inclui valor_override de itens MENSAL)
                      const temItensPreenchidos = formMedicao.itens.some(
                        (i) =>
                          "item_cronograma_id" in i &&
                          Number(i.quantidade_medida) > 0,
                      );
                      const noPeriodo =
                        temItensPreenchidos && valorMedicaoAtual > 0
                          ? valorMedicaoAtual
                          : Math.max(noPeriodoBk, 0);
                      const localExtra = Math.max(0, noPeriodo - noPeriodoBk);
                      const atePeriodo = atePeriodoBk + localExtra;
                      const valorTotal = itensBase.reduce(
                        (sum, ic) => sum + Number(ic.valor_total),
                        0,
                      );
                      const aExecutar = Math.max(0, valorTotal - atePeriodo);
                      return {
                        noPeriodoExibicao: noPeriodo,
                        atePeriodoExibicao: atePeriodo,
                        aExecutarExibicao: aExecutar,
                      };
                    }
                    const noPeriodo = valorMedicaoAtual || 0;
                    if (usarItensCronograma) {
                      const valorMigracao = itensBase.reduce(
                        (sum, ic) =>
                          sum +
                          (ic.unidade_medida === "MENSAL" &&
                          Number(ic.valor_migracao_reais ?? 0) > 0
                            ? Number(ic.valor_migracao_reais ?? 0)
                            : Number(ic.quantidade_medida) *
                              Number(ic.valor_unitario)),
                        0,
                      );
                      const valorAprovadoAnterior = Number(
                        resumo?.valor_medido_total || 0,
                      );
                      const atePeriodo =
                        valorMigracao + valorAprovadoAnterior + noPeriodo;
                      const valorTotal = itensBase.reduce(
                        (sum, ic) => sum + Number(ic.valor_total),
                        0,
                      );
                      const aExecutar = Math.max(0, valorTotal - atePeriodo);
                      return {
                        noPeriodoExibicao: noPeriodo,
                        atePeriodoExibicao: atePeriodo,
                        aExecutarExibicao: aExecutar,
                      };
                    }
                    const valorAprovadoAnterior = Number(
                      resumo?.valor_medido_total || 0,
                    );
                    const valorExecAnterior = Number(
                      contratoProp?.valor_executado_anterior || 0,
                    );
                    const atePeriodo =
                      valorAprovadoAnterior + valorExecAnterior + noPeriodo;
                    const aExecutar = Math.max(
                      0,
                      Number(valorGlobal || contratoProp?.valor_global || 0) -
                        atePeriodo,
                    );
                    return {
                      noPeriodoExibicao: noPeriodo,
                      atePeriodoExibicao: atePeriodo,
                      aExecutarExibicao: aExecutar,
                    };
                  })();
                  return (
                    <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-blue-800">
                          Execução Fiscal e Financeira
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-lg p-4 border border-blue-200">
                          <h4 className="font-medium text-blue-700 mb-3 flex items-center gap-2">
                            {tipoMedicaoAtual === "quantidade" ||
                            (tipoMedicaoAtual === "mensal" &&
                              contratoProp?.boletim_por_quantidade) ? (
                              <>
                                <BarChart3 className="w-4 h-4" />
                                Execução Fiscal (Quantidade)
                              </>
                            ) : (
                              <>
                                <Clock className="w-4 h-4" />
                                Execução Fiscal (Tempo)
                              </>
                            )}
                          </h4>
                          <div className="space-y-2 text-sm">
                            {tipoMedicaoAtual === "quantidade" ||
                            (tipoMedicaoAtual === "mensal" &&
                              contratoProp?.boletim_por_quantidade) ? (
                              (() => {
                                // Itens com quantidade informada nesta medição
                                // Quando boletim_por_quantidade + MENSAL: inclui MENSAL (cada mês = 1 unidade)
                                const forcarQtdMensal =
                                  !!contratoProp?.boletim_por_quantidade;
                                const itensComQtd = itensCronograma.filter(
                                  (ic) => {
                                    if (
                                      ic.unidade_medida === "MENSAL" &&
                                      !forcarQtdMensal
                                    )
                                      return false;
                                    const itemState = formMedicao.itens.find(
                                      (i) =>
                                        "item_cronograma_id" in i &&
                                        (i as any).item_cronograma_id === ic.id,
                                    ) as any;
                                    return (
                                      itemState &&
                                      Number(itemState.quantidade_medida) > 0
                                    );
                                  },
                                );
                                if (itensComQtd.length === 0) {
                                  return (
                                    <p className="text-gray-500 text-xs">
                                      Informe quantidades nos itens para ver a
                                      execução
                                    </p>
                                  );
                                }
                                if (itensComQtd.length === 1) {
                                  const ic = itensComQtd[0];
                                  const itemState = formMedicao.itens.find(
                                    (i) =>
                                      "item_cronograma_id" in i &&
                                      (i as any).item_cronograma_id === ic.id,
                                  ) as any;
                                  const isMensalFlag =
                                    ic.unidade_medida === "MENSAL" &&
                                    forcarQtdMensal;
                                  const qtdNoPeriodo = isMensalFlag
                                    ? Math.round(
                                        Number(
                                          itemState?.quantidade_medida ?? 0,
                                        ),
                                      )
                                    : Number(itemState?.quantidade_medida ?? 0);
                                  const qtdAprovada = isMensalFlag
                                    ? Math.round(
                                        Number(ic.quantidade_medida ?? 0),
                                      )
                                    : Number(ic.quantidade_medida ?? 0);
                                  const qtdTotal = isMensalFlag
                                    ? Math.round(Number(ic.quantidade ?? 0))
                                    : Number(ic.quantidade ?? 0) *
                                      (Number(ic.quantidade_meses) || 1);
                                  const qtdAtePeriodo =
                                    qtdAprovada + qtdNoPeriodo;
                                  const qtdAExecutar = Math.max(
                                    0,
                                    qtdTotal - qtdAtePeriodo,
                                  );
                                  const unidade =
                                    ic.unidade_medida || "UNIDADE";
                                  return (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">
                                          No Período:
                                        </span>
                                        <span className="font-medium text-blue-700">
                                          {qtdNoPeriodo.toLocaleString("pt-BR")}{" "}
                                          {unidade}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">
                                          Até o Período:
                                        </span>
                                        <span className="font-medium text-blue-700">
                                          {qtdAtePeriodo.toLocaleString(
                                            "pt-BR",
                                          )}{" "}
                                          {unidade}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">
                                          A Executar:
                                        </span>
                                        <span className="font-medium text-green-700">
                                          {qtdAExecutar.toLocaleString("pt-BR")}{" "}
                                          {unidade}
                                        </span>
                                      </div>
                                    </>
                                  );
                                }
                                return (
                                  <>
                                    {itensComQtd.map((ic) => {
                                      const itemState = formMedicao.itens.find(
                                        (i) =>
                                          "item_cronograma_id" in i &&
                                          (i as any).item_cronograma_id ===
                                            ic.id,
                                      ) as any;
                                      const isMF =
                                        ic.unidade_medida === "MENSAL" &&
                                        forcarQtdMensal;
                                      const qtdNoPeriodo = isMF
                                        ? Math.round(
                                            Number(
                                              itemState?.quantidade_medida ?? 0,
                                            ),
                                          )
                                        : Number(
                                            itemState?.quantidade_medida ?? 0,
                                          );
                                      const qtdAprovada = isMF
                                        ? Math.round(
                                            Number(ic.quantidade_medida ?? 0),
                                          )
                                        : Number(ic.quantidade_medida ?? 0);
                                      const qtdAExecutar = Math.max(
                                        0,
                                        (isMF
                                          ? Math.round(Number(ic.quantidade))
                                          : Number(ic.quantidade)) -
                                          qtdAprovada -
                                          qtdNoPeriodo,
                                      );
                                      return (
                                        <div
                                          key={ic.id}
                                          className="flex justify-between text-xs"
                                        >
                                          <span className="text-gray-600 truncate mr-2">
                                            {ic.descricao?.substring(0, 30)}...
                                          </span>
                                          <span className="font-medium whitespace-nowrap">
                                            {qtdNoPeriodo > 0
                                              ? `+${qtdNoPeriodo}`
                                              : "-"}{" "}
                                            / {qtdAExecutar} {ic.unidade_medida}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </>
                                );
                              })()
                            ) : (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">
                                    No Período:
                                  </span>
                                  <span className="font-medium text-blue-700">
                                    {
                                      calcularExecucaoFiscal(
                                        formMedicao.periodo_inicio,
                                        formMedicao.periodo_fim,
                                        contratoProp.data_vigencia_inicio,
                                        contratoProp.data_vigencia_fim,
                                        primeiraMedicaoCiclo,
                                        diasMigracaoTempo,
                                      ).noPeriodo
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">
                                    Até o Período:
                                  </span>
                                  <span className="font-medium text-blue-700">
                                    {
                                      calcularExecucaoFiscal(
                                        formMedicao.periodo_inicio,
                                        formMedicao.periodo_fim,
                                        contratoProp.data_vigencia_inicio,
                                        contratoProp.data_vigencia_fim,
                                        primeiraMedicaoCiclo,
                                        diasMigracaoTempo,
                                      ).atePeriodo
                                    }
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">
                                    A Executar:
                                  </span>
                                  <span className="font-medium text-green-700">
                                    {
                                      calcularExecucaoFiscal(
                                        formMedicao.periodo_inicio,
                                        formMedicao.periodo_fim,
                                        contratoProp.data_vigencia_inicio,
                                        contratoProp.data_vigencia_fim,
                                        primeiraMedicaoCiclo,
                                        diasMigracaoTempo,
                                      ).aExecutar
                                    }
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
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
                              <span className="text-gray-600">
                                Até o Período:
                              </span>
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
                  );
                })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Observações do Boletim</Label>
                  <Textarea
                    value={formMedicao.observacoes}
                    onChange={(e) =>
                      setFormMedicao({
                        ...formMedicao,
                        observacoes: e.target.value,
                      })
                    }
                    placeholder="Observações relevantes..."
                    rows={4}
                  />
                </div>
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Nota Fiscal (opcional)
                  </Label>
                  <Input
                    value={formMedicao.nota_fiscal_numero}
                    onChange={(e) =>
                      setFormMedicao({
                        ...formMedicao,
                        nota_fiscal_numero: e.target.value,
                      })
                    }
                    placeholder="Número da NF"
                  />
                </div>
              </div>

              {/* Discriminação das Despesas — igual ao fornecedor */}
              {(() => {
                const valorMedidoAtual = isServicoContinuado
                  ? parseFloat(formMedicao.valor_medido) || 0
                  : usarItensCronograma
                    ? formMedicao.itens.reduce((acc, item) => {
                        if (!("item_cronograma_id" in item)) return acc;
                        const ic = itensCronograma.find(
                          (i) => i.id === item.item_cronograma_id,
                        );
                        if (!ic) return acc;
                        const subtotal =
                          item.modo_input === "valor" &&
                          (item as any).valor_override != null
                            ? (item as any).valor_override
                            : item.quantidade_medida *
                              Number(ic.valor_unitario);
                        return acc + subtotal;
                      }, 0)
                    : formMedicao.itens.reduce((acc, item, idx) => {
                        const etapa = etapas[idx];
                        if (!etapa || !("etapa_id" in item)) return acc;
                        return item.modo_input === "valor" &&
                          item.valor_executado_atual
                          ? acc + item.valor_executado_atual
                          : acc +
                              (item.percentual_executado_atual / 100) *
                                Number(etapa.valor_previsto);
                      }, 0);
                // Base da discriminação: valor da NF quando disponível, senão valor medido
                const valorBaseDiscriminacao =
                  parseFloat(formMedicao.nota_fiscal_valor) ||
                  0 ||
                  valorMedidoAtual;
                const totalDiscPerc = discriminacoes.reduce(
                  (s, d) => s + (Number(d.percentual) || 0),
                  0,
                );
                const totalDiscValorBruto = discriminacoes.reduce(
                  (s, d) => s + (Number(d.valor) || 0),
                  0,
                );
                const arredondamentoApenas =
                  valorBaseDiscriminacao > 0 &&
                  Math.abs(totalDiscPerc - 100) < 0.05 &&
                  Math.abs(totalDiscValorBruto - valorBaseDiscriminacao) <=
                    0.02;
                const totalDiscValor = arredondamentoApenas
                  ? valorBaseDiscriminacao
                  : totalDiscValorBruto;
                return (
                  <div className="border rounded-lg p-4 bg-amber-50/30">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                        <DollarSign className="w-4 h-4" />
                        Discriminação das Despesas
                        <span className="text-xs font-normal text-red-500">
                          * obrigatória
                        </span>
                      </Label>
                      <div className="flex gap-2">
                        {medicoes.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (valorBaseDiscriminacao <= 0) {
                                alert(
                                  isServicoContinuado
                                    ? "Informe o valor medido ou da nota fiscal antes de reaproveitar."
                                    : "Preencha os itens da planilha ou valor da NF antes de reaproveitar.",
                                );
                                return;
                              }
                              try {
                                const ultima = medicoes[medicoes.length - 1];
                                const res = await authFetch(
                                  `${API_URL}/api/contratos/medicoes/${ultima.id}/discriminacoes/sugestao`,
                                );
                                if (!res.ok) return;
                                const sugestoes = await res.json();
                                if (!sugestoes?.length) {
                                  alert(
                                    "Nenhuma medição anterior possui discriminação para reaproveitar.",
                                  );
                                  return;
                                }
                                setDiscriminacoes(
                                  sugestoes.map((s: any) => {
                                    const perc = Number(s.percentual) || 0;
                                    const valor =
                                      (perc / 100) * valorBaseDiscriminacao;
                                    return {
                                      descricao: s.descricao || "",
                                      percentual: perc,
                                      valor: Math.round(valor * 100) / 100,
                                    };
                                  }),
                                );
                              } catch {
                                alert(
                                  "Erro ao buscar despesas da última medição.",
                                );
                              }
                            }}
                            className="text-amber-700 border-amber-300 hover:bg-amber-50"
                          >
                            Reaproveitar despesas do último mês
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDiscriminacoes([
                              ...discriminacoes,
                              { descricao: "", valor: 0, percentual: 0 },
                            ])
                          }
                        >
                          <Plus className="w-3 h-3 mr-1" /> Adicionar Item
                        </Button>
                      </div>
                    </div>
                    {discriminacoes.length > 0 ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 text-xs font-semibold text-gray-500 uppercase px-1">
                          <span>Item</span>
                          <span>Discriminação</span>
                          <span className="text-right">Valor R$</span>
                          <span className="text-right">%</span>
                          <span></span>
                        </div>
                        {discriminacoes.map((disc, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 items-center"
                          >
                            <span className="text-sm text-center font-mono text-gray-500">
                              {idx + 1}
                            </span>
                            <Input
                              value={disc.descricao}
                              onChange={(e) => {
                                const u = [...discriminacoes];
                                u[idx] = {
                                  ...u[idx],
                                  descricao: e.target.value,
                                };
                                setDiscriminacoes(u);
                              }}
                              placeholder="Ex: Tributação, Serviços..."
                              className="h-8 text-sm"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={disc.valor || ""}
                              onChange={(e) => {
                                const val =
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value);
                                const perc =
                                  valorBaseDiscriminacao > 0
                                    ? (val / valorBaseDiscriminacao) * 100
                                    : 0;
                                const u = [...discriminacoes];
                                u[idx] = {
                                  ...u[idx],
                                  valor: val,
                                  percentual: Math.round(perc * 10000) / 10000,
                                };
                                setDiscriminacoes(u);
                              }}
                              placeholder="0,00"
                              className="h-8 text-sm text-right"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={disc.percentual || ""}
                              onChange={(e) => {
                                const perc =
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value);
                                const val =
                                  valorBaseDiscriminacao > 0
                                    ? (perc / 100) * valorBaseDiscriminacao
                                    : 0;
                                const u = [...discriminacoes];
                                u[idx] = {
                                  ...u[idx],
                                  percentual: perc,
                                  valor: Math.round(val * 100) / 100,
                                };
                                setDiscriminacoes(u);
                              }}
                              placeholder="0,00"
                              className="h-8 text-sm text-right"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                              onClick={() =>
                                setDiscriminacoes(
                                  discriminacoes.filter((_, i) => i !== idx),
                                )
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                        <div className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 items-center border-t pt-2 mt-2">
                          <span></span>
                          <span className="text-sm font-bold text-gray-700">
                            Total
                          </span>
                          <span
                            className={`text-sm font-bold text-right ${Math.abs(totalDiscValor - valorBaseDiscriminacao) < 0.02 ? "text-green-600" : "text-amber-600"}`}
                          >
                            {formatarMoeda(totalDiscValor)}
                          </span>
                          <span
                            className={`text-sm font-bold text-right ${Math.abs(totalDiscPerc - 100) < 0.02 ? "text-green-600" : "text-amber-600"}`}
                          >
                            {totalDiscPerc.toFixed(2)}%
                          </span>
                          <span></span>
                        </div>
                        {valorBaseDiscriminacao > 0 &&
                          Math.abs(totalDiscValor - valorBaseDiscriminacao) >
                            0.02 && (
                            <p className="text-xs text-amber-600 mt-1">
                              Valor base:{" "}
                              {formatarMoeda(valorBaseDiscriminacao)}.
                              Diferença:{" "}
                              {formatarMoeda(
                                totalDiscValor - valorBaseDiscriminacao,
                              )}
                            </p>
                          )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-3">
                        Nenhuma discriminação adicionada. Use &quot;Reaproveitar
                        despesas do último mês&quot; para trazer os % da última
                        medição (valores recalculados pela medição atual) ou
                        &quot;Adicionar Item&quot; para criar manualmente.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Fotos e Documentos — igual ao fornecedor */}
              <div className="border rounded-lg p-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <Label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                    <Paperclip className="w-4 h-4" />
                    Fotos e Documentos
                    <span className="text-xs font-normal text-gray-400">
                      (opcional)
                    </span>
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/jpeg,image/png,image/jpg";
                        input.multiple = true;
                        input.onchange = (e) => {
                          const files = (e.target as HTMLInputElement).files;
                          if (files) {
                            const titulo =
                              prompt("Título da foto (opcional):") ?? "";
                            setArquivosPendentes((prev) => [
                              ...prev,
                              ...Array.from(files).map((f) => ({
                                file: f,
                                tipo: "FOTO" as const,
                                descricao: titulo,
                              })),
                            ]);
                          }
                        };
                        input.click();
                      }}
                    >
                      <Camera className="w-3 h-3" /> Foto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "application/pdf,image/jpeg,image/png";
                        input.multiple = true;
                        input.onchange = (e) => {
                          const files = (e.target as HTMLInputElement).files;
                          if (files && files.length > 0) {
                            const titulo =
                              prompt("Título dos documentos (opcional):") ?? "";
                            setArquivosPendentes((prev) => [
                              ...prev,
                              ...Array.from(files).map((f) => ({
                                file: f,
                                tipo: "DOCUMENTO" as const,
                                descricao: titulo,
                              })),
                            ]);
                          }
                        };
                        input.click();
                      }}
                    >
                      <Upload className="w-3 h-3" /> Documento
                    </Button>
                  </div>
                </div>
                {arquivosPendentes.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">
                    Nenhum arquivo adicionado. Você pode adicionar fotos e
                    documentos agora ou depois.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {arquivosPendentes.map((arq, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-white rounded px-3 py-1.5 text-xs border"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span>{arq.tipo === "FOTO" ? "📷" : "📄"}</span>
                          <span className="truncate font-medium">
                            {arq.descricao || arq.file.name}
                          </span>
                          <span className="text-gray-400 flex-shrink-0">
                            ({(arq.file.size / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                          onClick={() =>
                            setArquivosPendentes((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
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
            <Button
              variant="outline"
              onClick={() => {
                setModalMedicao(false);
                setExecucaoFinanceiraModal(null);
                setDiscriminacoes([]);
                setArquivosPendentes([]);
              }}
            >
              Cancelar Lançamento
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => salvarMedicao(true)}
                disabled={
                  actionLoading ||
                  !formMedicao.periodo_inicio ||
                  !formMedicao.periodo_fim ||
                  (isServicoContinuado &&
                    (!formMedicao.valor_medido ||
                      parseFloat(formMedicao.valor_medido) <= 0)) ||
                  (!isServicoContinuado &&
                    !usarItensCronograma &&
                    formMedicao.itens.every(
                      (i) =>
                        "percentual_executado_atual" in i &&
                        (i as any).percentual_executado_atual <= 0 &&
                        ((i as any).valor_executado_atual == null ||
                          (i as any).valor_executado_atual <= 0),
                    )) ||
                  (!isServicoContinuado &&
                    usarItensCronograma &&
                    formMedicao.itens.every(
                      (i) =>
                        "quantidade_medida" in i &&
                        (i as any).quantidade_medida <= 0,
                    ))
                }
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Salvar Rascunho
              </Button>
              <Button
                onClick={() => salvarMedicao(false)}
                disabled={
                  actionLoading ||
                  !formMedicao.periodo_inicio ||
                  !formMedicao.periodo_fim ||
                  (isServicoContinuado &&
                    (!formMedicao.valor_medido ||
                      parseFloat(formMedicao.valor_medido) <= 0)) ||
                  (!isServicoContinuado &&
                    !usarItensCronograma &&
                    formMedicao.itens.every(
                      (i) =>
                        "percentual_executado_atual" in i &&
                        (i as any).percentual_executado_atual <= 0 &&
                        ((i as any).valor_executado_atual == null ||
                          (i as any).valor_executado_atual <= 0),
                    )) ||
                  (!isServicoContinuado &&
                    usarItensCronograma &&
                    formMedicao.itens.every(
                      (i) =>
                        "quantidade_medida" in i &&
                        (i as any).quantidade_medida <= 0,
                    ))
                }
                className="bg-blue-600 hover:bg-blue-700"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Enviar para Ateste
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Página Ateste do Fiscal */}
      {!!modalAteste && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="border-b bg-white px-6 py-3 flex items-center gap-3 shadow-sm flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModalAteste(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="h-6 w-px bg-gray-200" />
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-yellow-600" />
                Atestar {modalAteste?.numero_medicao}ª Medição
              </h2>
              <p className="text-sm text-muted-foreground">
                Valor medido:{" "}
                {modalAteste && formatarMoeda(modalAteste.valor_medido)} —{" "}
                {modalAteste &&
                  Number(modalAteste.percentual_fisico_medido).toFixed(1)}
                % físico
                {modalAteste?.status === "PARCIALMENTE_ATESTADA" && (
                  <span className="ml-2 text-yellow-600 font-medium">
                    — Ateste parcial em andamento
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {modalAteste?.fornecedor_nome && (
                <div className="p-3 bg-blue-50 rounded-lg text-sm">
                  <p className="text-blue-700">
                    <strong>Fornecedor:</strong> {modalAteste.fornecedor_nome}
                  </p>
                  {modalAteste.fornecedor_observacoes && (
                    <p className="text-blue-600 mt-1 italic">
                      "{modalAteste.fornecedor_observacoes}"
                    </p>
                  )}
                  {modalAteste.nota_fiscal_numero && (
                    <p className="text-blue-600 mt-1">
                      NF: {modalAteste.nota_fiscal_numero} —{" "}
                      {formatarMoeda(modalAteste.nota_fiscal_valor || 0)}
                    </p>
                  )}
                </div>
              )}

              {/* Tabela de Itens para Ateste */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-bold">
                    Itens do Cronograma
                  </p>
                  {(() => {
                    const itens = ((modalAteste as any)?.itens || []) as any[];
                    const totalAtestados = itens.filter(
                      (i: any) => i.atestado || itensAteste[i.id]?.selecionado,
                    ).length;
                    return (
                      <Badge
                        className={
                          totalAtestados === itens.length
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }
                      >
                        {totalAtestados}/{itens.length} atestados
                      </Badge>
                    );
                  })()}
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-10 text-center">
                          {(() => {
                            const itens = ((modalAteste as any)?.itens ||
                              []) as any[];
                            const naoAtestados = itens.filter(
                              (i: any) => !i.atestado,
                            );
                            const todosSelecionados =
                              naoAtestados.length > 0 &&
                              naoAtestados.every(
                                (i: any) => itensAteste[i.id]?.selecionado,
                              );
                            if (naoAtestados.length === 0) return null;
                            return (
                              <input
                                type="checkbox"
                                checked={todosSelecionados}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setItensAteste((prev) => {
                                    const novo = { ...prev };
                                    for (const item of naoAtestados) {
                                      novo[item.id] = {
                                        ...novo[item.id],
                                        selecionado: checked,
                                      };
                                    }
                                    return novo;
                                  });
                                }}
                                className="w-4 h-4"
                                title={
                                  todosSelecionados
                                    ? "Desmarcar todos"
                                    : "Selecionar todos"
                                }
                              />
                            );
                          })()}
                        </TableHead>
                        <TableHead className="text-xs font-bold">
                          Etapa
                        </TableHead>
                        <TableHead className="text-xs font-bold text-center w-16">
                          % Med.
                        </TableHead>
                        <TableHead className="text-xs font-bold text-right w-24">
                          Valor
                        </TableHead>
                        <TableHead className="text-xs font-bold w-10">
                          Status
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {((modalAteste as any)?.itens || []).map(
                        (item: any, idx: number) => {
                          const jaAtestado = !!item.atestado;
                          const selecionado =
                            itensAteste[item.id]?.selecionado || false;
                          const podeEditarAteste = [
                            "SUBMETIDA",
                            "PARCIALMENTE_ATESTADA",
                          ].includes((modalAteste as any)?.status || "");
                          return (
                            <TableRow
                              key={item.id || idx}
                              className={
                                jaAtestado
                                  ? "bg-green-50/50"
                                  : selecionado
                                    ? "bg-yellow-50/50"
                                    : ""
                              }
                            >
                              <TableCell className="text-center">
                                <input
                                  type="checkbox"
                                  checked={selecionado}
                                  disabled={jaAtestado && !podeEditarAteste}
                                  onChange={(e) =>
                                    setItensAteste((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        selecionado: e.target.checked,
                                      },
                                    }))
                                  }
                                  className="w-4 h-4"
                                />
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium">
                                  {item.etapa_numero}.{" "}
                                  {item.etapa_descricao || `Etapa ${idx + 1}`}
                                </p>
                                {jaAtestado && (
                                  <p className="text-xs text-green-600 mt-0.5">
                                    Atestado por {item.ateste_fiscal_nome} em{" "}
                                    {formatarData(item.ateste_data)}
                                  </p>
                                )}
                                {!jaAtestado && selecionado && (
                                  <Input
                                    placeholder="Observação sobre este item (opcional)"
                                    className="mt-1 h-7 text-xs"
                                    value={
                                      itensAteste[item.id]?.observacoes || ""
                                    }
                                    onChange={(e) =>
                                      setItensAteste((prev) => ({
                                        ...prev,
                                        [item.id]: {
                                          ...prev[item.id],
                                          observacoes: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                )}
                                {jaAtestado && item.ateste_observacoes && (
                                  <p className="text-xs text-gray-500 mt-0.5 italic">
                                    "{item.ateste_observacoes}"
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                {Number(
                                  item.percentual_executado_atual || 0,
                                ).toFixed(1)}
                                %
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatarMoeda(item.valor_medido)}
                              </TableCell>
                              <TableCell className="text-center">
                                {jaAtestado ? (
                                  <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                                ) : selecionado ? (
                                  <ClipboardCheck className="w-4 h-4 text-yellow-600 mx-auto" />
                                ) : (
                                  <Clock className="w-4 h-4 text-gray-300 mx-auto" />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        },
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <input
                  type="checkbox"
                  id="verificado_in_loco"
                  checked={formAteste.verificado_in_loco}
                  onChange={(e) =>
                    setFormAteste({
                      ...formAteste,
                      verificado_in_loco: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label
                  htmlFor="verificado_in_loco"
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-green-600" />
                  Confirmo que realizei verificação presencial (in loco)
                </label>
              </div>
              {/* Anexos do Fornecedor (fotos e documentos) */}
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold flex items-center gap-1">
                  Evidências do Fornecedor{" "}
                  {anexosMedicao.length > 0 && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {anexosMedicao.length}
                    </Badge>
                  )}
                </p>
                {loadingAnexos && (
                  <p className="text-xs text-gray-400">Carregando anexos...</p>
                )}
                {!loadingAnexos && anexosMedicao.length === 0 && (
                  <p className="text-xs text-gray-400 italic">
                    Nenhuma evidência enviada pelo fornecedor.
                  </p>
                )}
                {anexosMedicao.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {anexosMedicao.map((anexo: any) => (
                      <div
                        key={anexo.id}
                        className="relative group border rounded-lg overflow-hidden bg-gray-50"
                      >
                        <div
                          className="cursor-pointer"
                          onClick={() =>
                            window.open(`${API_URL}${anexo.url}`, "_blank")
                          }
                        >
                          {anexo.tipo === "FOTO" ? (
                            <div className="aspect-square bg-gray-100 flex items-center justify-center">
                              <img
                                src={`${API_URL}${anexo.url}`}
                                alt={anexo.descricao || anexo.nome_original}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            </div>
                          ) : (
                            <div className="aspect-square bg-blue-50 flex flex-col items-center justify-center">
                              <svg
                                className="w-8 h-8 text-blue-400 mb-1"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                />
                              </svg>
                              <p className="text-xs text-blue-600 text-center px-1 truncate w-full">
                                {anexo.nome_original}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="p-1.5">
                          {anexo.descricao && (
                            <p className="text-xs font-medium text-gray-700 truncate">
                              {anexo.descricao}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 truncate">
                            {anexo.nome_original}
                          </p>
                        </div>
                        {/* Botão excluir (órgão) */}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExcluirAnexoOrgao(
                                anexo.id,
                                anexo.descricao || anexo.nome_original,
                              );
                            }}
                            className="bg-white/90 rounded p-1 shadow hover:bg-red-50"
                            title="Excluir anexo"
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Observações gerais do Ateste</Label>
                <Textarea
                  placeholder="Observações sobre a verificação técnica..."
                  value={formAteste.observacoes}
                  onChange={(e) =>
                    setFormAteste({
                      ...formAteste,
                      observacoes: e.target.value,
                    })
                  }
                  rows={2}
                />
              </div>
              {(() => {
                const itens = ((modalAteste as any)?.itens || []) as any[];
                const novosAtestados = itens.filter(
                  (i: any) => !i.atestado && itensAteste[i.id]?.selecionado,
                ).length;
                const jaAtestados = itens.filter((i: any) => i.atestado).length;
                const todosSerao =
                  jaAtestados + novosAtestados === itens.length &&
                  itens.length > 0;
                return (
                  <>
                    {!todosSerao && novosAtestados > 0 && (
                      <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/50">
                        <Label className="text-amber-800">
                          Motivo da devolução (itens não atestados) *
                        </Label>
                        <Textarea
                          placeholder="Informe o motivo para devolver ao fornecedor (obrigatório no ateste parcial)..."
                          value={formAteste.motivo_devolucao_parcial}
                          onChange={(e) =>
                            setFormAteste({
                              ...formAteste,
                              motivo_devolucao_parcial: e.target.value,
                            })
                          }
                          rows={2}
                          className="border-amber-200"
                        />
                        <p className="text-xs text-amber-700">
                          A medição será devolvida ao fornecedor em um único
                          passo.
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      {novosAtestados === 0 &&
                      !itens.some(
                        (i: any) =>
                          i.atestado && !itensAteste[i.id]?.selecionado,
                      )
                        ? "Selecione os itens que deseja atestar."
                        : todosSerao
                          ? `Ao atestar ${novosAtestados} item(ns), todos os itens estarão atestados e a medição será encaminhada para aprovação.`
                          : itens.some(
                                (i: any) =>
                                  i.atestado && !itensAteste[i.id]?.selecionado,
                              ) && novosAtestados === 0
                            ? 'Desmarque os itens para cancelar o ateste. Clique em "Cancelar Atestes" para confirmar.'
                            : `${novosAtestados} item(ns) selecionado(s). Informe o motivo e a medição será devolvida ao fornecedor em um clique.`}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="border-t bg-white px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
            <Button variant="outline" onClick={() => setModalAteste(null)}>
              Cancelar
            </Button>
            {(() => {
              const itens = ((modalAteste as any)?.itens || []) as any[];
              const temSelecionados = itens.some(
                (i: any) => !i.atestado && itensAteste[i.id]?.selecionado,
              );
              const temCancelados = itens.some(
                (i: any) => i.atestado && !itensAteste[i.id]?.selecionado,
              );
              const temAcao = temSelecionados || temCancelados;
              const novosAtestados = itens.filter(
                (i: any) => !i.atestado && itensAteste[i.id]?.selecionado,
              ).length;
              const jaAtestadosMantidos = itens.filter(
                (i: any) => i.atestado && itensAteste[i.id]?.selecionado,
              ).length;
              const todosSerao =
                jaAtestadosMantidos + novosAtestados === itens.length &&
                itens.length > 0;
              const itensNaoSelecionados = itens.filter(
                (i: any) => !itensAteste[i.id]?.selecionado && !i.atestado,
              ).length;
              const motivoObrigatorio =
                !todosSerao &&
                temSelecionados &&
                itensNaoSelecionados > 0 &&
                !formAteste.motivo_devolucao_parcial?.trim();
              return (
                <Button
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  onClick={atestarMedicao}
                  disabled={actionLoading || !temAcao || motivoObrigatorio}
                >
                  {actionLoading && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  {temCancelados && !temSelecionados
                    ? "Cancelar Atestes"
                    : todosSerao
                      ? "Atestar Selecionados"
                      : "Atestar e Devolver"}
                </Button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal Devolver ao Fornecedor */}
      <Dialog
        open={!!modalDevolver}
        onOpenChange={() => setModalDevolver(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              Devolver {modalDevolver?.numero_medicao}ª Medição
            </DialogTitle>
            <DialogDescription>
              A medição será devolvida ao fornecedor para correção.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da Devolução *</Label>
            <Textarea
              placeholder="Descreva o que precisa ser corrigido..."
              value={motivoDevolucao}
              onChange={(e) => setMotivoDevolucao(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDevolver(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={devolverMedicao}
              disabled={actionLoading || !motivoDevolucao.trim()}
            >
              {actionLoading && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Devolver ao Fornecedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Assinatura Digital OTP — Fornecedor (quando órgão cria a medição) */}
      <Dialog
        open={modalOtp}
        onOpenChange={(open) => {
          if (!open) {
            setModalOtp(false);
            setOtpMedicaoId(null);
            setTimeout(() => {
              document.body.style.pointerEvents = "";
            }, 0);
            carregarDados();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              Assinatura Digital do Fornecedor
            </DialogTitle>
            <DialogDescription>
              {otpEtapa === "enviar" &&
                "O código será enviado para o telefone do fornecedor cadastrado. A assinatura aparecerá no campo FORNECEDOR do boletim."}
              {otpEtapa === "codigo" &&
                "Digite o código de verificação enviado ao fornecedor."}
              {otpEtapa === "sucesso" &&
                "Boletim assinado pelo fornecedor e enviado para análise do fiscal!"}
            </DialogDescription>
          </DialogHeader>

          {otpEtapa === "enviar" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium mb-1">
                  Caso excepcional: medição criada pelo órgão
                </p>
                <p className="text-amber-700">
                  O fornecedor deve assinar digitalmente. O código será enviado
                  via WhatsApp para o telefone cadastrado do fornecedor.
                </p>
              </div>
              {otpErro && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  {otpErro}
                </p>
              )}
            </div>
          )}

          {otpEtapa === "codigo" && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <p className="font-medium mb-1">
                  Código enviado ao fornecedor!
                </p>
                {otpFornecedorNome && (
                  <p className="font-medium">{otpFornecedorNome}</p>
                )}
                {otpCanais?.telefone_mascarado && (
                  <p>📱 {otpCanais.telefone_mascarado}</p>
                )}
              </div>
              <div>
                <Label>Código (6 dígitos)</Label>
                <Input
                  value={otpCodigo}
                  onChange={(e) =>
                    setOtpCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-mono mt-1"
                  maxLength={6}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && otpCodigo.length === 6)
                      handleValidarOtpFornecedor();
                  }}
                />
              </div>
              {otpErro && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  {otpErro}
                </p>
              )}
            </div>
          )}

          {otpEtapa === "sucesso" && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-green-900">
                  Boletim assinado pelo fornecedor!
                </p>
                <p className="text-sm text-green-700 mt-1">
                  A medição foi enviada para análise do fiscal.
                </p>
                {otpCodigoValidacao && (
                  <div className="mt-2 bg-white border border-green-300 rounded p-2">
                    <p className="text-xs text-gray-500">
                      Código de validação:
                    </p>
                    <p className="font-mono text-sm font-bold text-green-800">
                      {otpCodigoValidacao}
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center">
                O PDF do boletim foi baixado automaticamente.
              </p>
            </div>
          )}

          <DialogFooter>
            {otpEtapa === "enviar" && (
              <div className="flex w-full gap-2 justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setModalOtp(false);
                    carregarDados();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleEnviarOtpFornecedor}
                  disabled={otpLoading}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  {otpLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Enviar Código ao Fornecedor
                </Button>
              </div>
            )}
            {otpEtapa === "codigo" && (
              <div className="flex w-full gap-2 justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setModalOtp(false);
                    carregarDados();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleValidarOtpFornecedor}
                  disabled={otpLoading || otpCodigo.length !== 6}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  {otpLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Confirmar e Enviar
                </Button>
              </div>
            )}
            {otpEtapa === "sucesso" && (
              <Button
                onClick={() => {
                  setModalOtp(false);
                  carregarDados();
                }}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhe da Medição */}
      <Dialog open={!!modalDetalhe} onOpenChange={() => setModalDetalhe(null)}>
        <DialogContent className="w-[95vw] max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalDetalhe?.numero_medicao}ª Medição — Detalhes
            </DialogTitle>
          </DialogHeader>
          {modalDetalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Período</p>
                  <p className="font-medium">
                    {formatarData(modalDetalhe.periodo_inicio)} a{" "}
                    {formatarData(modalDetalhe.periodo_fim)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <Badge className={STATUS_MEDICAO[modalDetalhe.status]?.cor}>
                    {STATUS_MEDICAO[modalDetalhe.status]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Valor Medido</p>
                  <p className="font-medium text-blue-700">
                    {formatarMoeda(modalDetalhe.valor_medido)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">% Físico</p>
                  <p className="font-medium">
                    {Number(modalDetalhe.percentual_fisico_medido).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Acumulado</p>
                  <p className="font-medium">
                    {formatarMoeda(modalDetalhe.valor_acumulado_atual)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">% Acumulado</p>
                  <p className="font-medium">
                    {Number(modalDetalhe.percentual_fisico_acumulado).toFixed(
                      1,
                    )}
                    %
                  </p>
                </div>
              </div>

              {/* Itens da Medição (Cronograma) */}
              {(modalDetalhe as any).itens &&
                (modalDetalhe as any).itens.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">
                      Itens do Cronograma
                    </p>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="text-xs font-bold w-12">
                              Item
                            </TableHead>
                            <TableHead className="text-xs font-bold">
                              Descrição
                            </TableHead>
                            <TableHead className="text-xs font-bold text-right w-24">
                              Valor Prev.
                            </TableHead>
                            <TableHead className="text-xs font-bold text-center w-20">
                              % Anterior
                            </TableHead>
                            <TableHead className="text-xs font-bold text-center w-20 bg-blue-50">
                              % Medido
                            </TableHead>
                            <TableHead className="text-xs font-bold text-center w-20">
                              % Acum.
                            </TableHead>
                            <TableHead className="text-xs font-bold text-right w-28 bg-blue-50">
                              Valor Medido
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(modalDetalhe as any).itens.map(
                            (item: any, idx: number) => (
                              <TableRow key={item.id || idx}>
                                <TableCell className="text-sm font-mono">
                                  {item.etapa_numero || idx + 1}
                                </TableCell>
                                <TableCell className="text-sm break-words whitespace-normal">
                                  {item.etapa_descricao || `Etapa ${idx + 1}`}
                                </TableCell>
                                <TableCell className="text-sm text-right">
                                  {formatarMoeda(item.etapa_valor_previsto)}
                                </TableCell>
                                <TableCell className="text-sm text-center text-gray-500">
                                  {Number(
                                    item.percentual_executado_anterior || 0,
                                  ).toFixed(1)}
                                  %
                                </TableCell>
                                <TableCell className="text-sm text-center font-medium text-blue-700 bg-blue-50/50">
                                  {Number(
                                    item.percentual_executado_atual || 0,
                                  ).toFixed(1)}
                                  %
                                </TableCell>
                                <TableCell className="text-sm text-center font-medium">
                                  {Number(
                                    item.percentual_executado_acumulado || 0,
                                  ).toFixed(1)}
                                  %
                                </TableCell>
                                <TableCell className="text-sm text-right font-medium text-blue-700 bg-blue-50/50">
                                  {formatarMoeda(item.valor_medido)}
                                </TableCell>
                              </TableRow>
                            ),
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

              {modalDetalhe.fornecedor_nome && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Fornecedor</p>
                  <p className="text-sm font-medium">
                    {modalDetalhe.fornecedor_nome}
                  </p>
                  {modalDetalhe.fornecedor_observacoes && (
                    <p className="text-sm text-gray-600 mt-1">
                      {modalDetalhe.fornecedor_observacoes}
                    </p>
                  )}
                  {modalDetalhe.data_submissao && (
                    <p className="text-xs text-gray-400 mt-1">
                      Submetida em {formatarData(modalDetalhe.data_submissao)}
                    </p>
                  )}
                </div>
              )}

              {modalDetalhe.nota_fiscal_numero && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Nota Fiscal</p>
                  <p className="text-sm">
                    NF {modalDetalhe.nota_fiscal_numero} —{" "}
                    {formatarMoeda(modalDetalhe.nota_fiscal_valor || 0)} —{" "}
                    {formatarData(modalDetalhe.nota_fiscal_data || "")}
                  </p>
                </div>
              )}

              {/* Discriminação das Despesas */}
              {discriminacoesDetalhe.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">
                    Discriminacao das Despesas
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-amber-50">
                          <TableHead className="text-xs font-bold w-12">
                            Item
                          </TableHead>
                          <TableHead className="text-xs font-bold">
                            Discriminacao
                          </TableHead>
                          <TableHead className="text-xs font-bold text-right w-28">
                            Valor R$
                          </TableHead>
                          <TableHead className="text-xs font-bold text-right w-20">
                            %
                          </TableHead>
                          <TableHead className="text-xs font-bold w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discriminacoesDetalhe.map((d: any, idx: number) => (
                          <TableRow key={d.id || idx}>
                            <TableCell className="text-sm font-mono">
                              {d.numero_item || idx + 1}
                            </TableCell>
                            <TableCell className="text-sm">
                              {editandoDiscriminacao === d.id ? (
                                <Input
                                  defaultValue={d.descricao}
                                  className="h-7 text-sm"
                                  onBlur={(e) => {
                                    const novoValor = e.target.value;
                                    if (novoValor !== d.descricao) {
                                      handleCorrigirDiscriminacao(d.id, {
                                        descricao: novoValor,
                                      });
                                    }
                                  }}
                                />
                              ) : (
                                <>
                                  {d.descricao}
                                  {d.corrigido_por_nome && (
                                    <span
                                      className="ml-1 text-xs text-amber-600"
                                      title={`Corrigido por ${d.corrigido_por_nome}: ${d.motivo_correcao || ""}`}
                                    >
                                      (corrigido)
                                    </span>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right font-medium">
                              {formatarMoeda(d.valor)}
                            </TableCell>
                            <TableCell className="text-sm text-right">
                              {Number(d.percentual || 0).toFixed(2)}%
                            </TableCell>
                            <TableCell>
                              <button
                                onClick={() => {
                                  if (editandoDiscriminacao === d.id) {
                                    setEditandoDiscriminacao(null);
                                    setMotivoCorrecao("");
                                  } else {
                                    setEditandoDiscriminacao(d.id);
                                  }
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Corrigir"
                              >
                                <Pencil className="w-3 h-3 text-gray-400" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50 font-bold">
                          <TableCell></TableCell>
                          <TableCell className="text-sm font-bold">
                            Total
                          </TableCell>
                          <TableCell className="text-sm text-right font-bold">
                            {formatarMoeda(
                              discriminacoesDetalhe.reduce(
                                (s: number, d: any) => s + Number(d.valor || 0),
                                0,
                              ),
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right font-bold">
                            {discriminacoesDetalhe
                              .reduce(
                                (s: number, d: any) =>
                                  s + Number(d.percentual || 0),
                                0,
                              )
                              .toFixed(2)}
                            %
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  {editandoDiscriminacao && (
                    <div className="mt-2 flex gap-2 items-center">
                      <Input
                        placeholder="Motivo da correção (obrigatório)"
                        value={motivoCorrecao}
                        onChange={(e) => setMotivoCorrecao(e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Execução Fiscal/Financeira */}
              {execucaoFinanceira &&
                execucaoFinanceira.itens &&
                execucaoFinanceira.itens.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">
                      Execucao Fiscal/Financeira
                    </p>
                    <div className="border rounded-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-indigo-50">
                            <TableHead className="text-xs font-bold w-12">
                              Item
                            </TableHead>
                            <TableHead className="text-xs font-bold min-w-[220px]">
                              Descricao
                            </TableHead>
                            <TableHead className="text-xs font-bold text-right w-24">
                              Previsto
                            </TableHead>
                            <TableHead className="text-xs font-bold text-right w-24 bg-blue-50">
                              No Periodo
                            </TableHead>
                            <TableHead className="text-xs font-bold text-right w-24">
                              Ate Periodo
                            </TableHead>
                            <TableHead className="text-xs font-bold text-right w-24 bg-green-50">
                              A Executar
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {execucaoFinanceira.itens.map(
                            (item: any, idx: number) => (
                              <TableRow key={item.etapa_id || idx}>
                                <TableCell className="text-sm font-mono">
                                  {item.numero_etapa}
                                </TableCell>
                                <TableCell className="text-sm break-words whitespace-normal min-w-[220px]">
                                  {item.descricao}
                                </TableCell>
                                <TableCell className="text-sm text-right">
                                  {formatarMoeda(item.valor_previsto)}
                                </TableCell>
                                <TableCell className="text-sm text-right font-medium text-blue-700 bg-blue-50/50">
                                  {formatarMoeda(item.no_periodo)}
                                </TableCell>
                                <TableCell className="text-sm text-right">
                                  {formatarMoeda(
                                    item.ate_periodo_global ?? item.ate_periodo,
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-right font-medium text-green-700 bg-green-50/50">
                                  {formatarMoeda(
                                    item.a_executar_global ?? item.a_executar,
                                  )}
                                </TableCell>
                              </TableRow>
                            ),
                          )}
                          <TableRow className="bg-gray-50 font-bold">
                            <TableCell></TableCell>
                            <TableCell className="text-sm font-bold">
                              Total
                            </TableCell>
                            <TableCell className="text-sm text-right font-bold">
                              {formatarMoeda(
                                execucaoFinanceira.totais?.valor_previsto || 0,
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right font-bold text-blue-700">
                              {formatarMoeda(
                                execucaoFinanceira.totais?.no_periodo || 0,
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right font-bold">
                              {formatarMoeda(
                                execucaoFinanceira.totais?.ate_periodo || 0,
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right font-bold text-green-700">
                              {formatarMoeda(
                                execucaoFinanceira.totais?.a_executar || 0,
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    {execucaoFinanceira.execucao_fiscal && (
                      <div className="mt-2 p-2 bg-indigo-50/50 rounded text-xs text-gray-600">
                        <span className="font-medium">Execucao Temporal:</span>{" "}
                        {execucaoFinanceira.execucao_fiscal.meses_executados}{" "}
                        meses e{" "}
                        {
                          execucaoFinanceira.execucao_fiscal
                            .dias_executados_extra
                        }{" "}
                        dias executados
                        {" | "}
                        {
                          execucaoFinanceira.execucao_fiscal.meses_restantes
                        }{" "}
                        meses e{" "}
                        {
                          execucaoFinanceira.execucao_fiscal
                            .dias_restantes_extra
                        }{" "}
                        dias restantes
                      </div>
                    )}
                  </div>
                )}

              {modalDetalhe.ateste_fiscal_nome && (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Ateste do Fiscal</p>
                  <p className="text-sm">
                    Atestado por{" "}
                    <strong>{modalDetalhe.ateste_fiscal_nome}</strong> em{" "}
                    {formatarData(modalDetalhe.ateste_data || "")}
                  </p>
                  {modalDetalhe.ateste_verificado_in_loco && (
                    <Badge className="bg-green-100 text-green-700 mt-1">
                      Verificado in loco
                    </Badge>
                  )}
                  {modalDetalhe.ateste_observacoes && (
                    <p className="text-sm text-gray-600 mt-1">
                      {modalDetalhe.ateste_observacoes}
                    </p>
                  )}
                </div>
              )}

              {modalDetalhe.aprovador_nome && (
                <div
                  className={`p-3 rounded-lg ${modalDetalhe.status === "APROVADA" ? "bg-green-50" : "bg-red-50"}`}
                >
                  <p className="text-xs text-gray-500 mb-1">
                    {modalDetalhe.status === "APROVADA"
                      ? "Aprovação"
                      : "Rejeição"}
                  </p>
                  <p className="text-sm">
                    {modalDetalhe.status === "APROVADA"
                      ? "Aprovado"
                      : "Rejeitado"}{" "}
                    por <strong>{modalDetalhe.aprovador_nome}</strong> em{" "}
                    {formatarData(modalDetalhe.data_aprovacao || "")}
                  </p>
                  {modalDetalhe.observacao_aprovador && (
                    <p className="text-sm text-gray-600 mt-1">
                      {modalDetalhe.observacao_aprovador}
                    </p>
                  )}
                </div>
              )}

              {modalDetalhe.status === "DEVOLVIDA" &&
                modalDetalhe.motivo_devolucao && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-600 mb-1">
                      Motivo da Devolução
                    </p>
                    <p className="text-sm text-amber-700">
                      {modalDetalhe.motivo_devolucao}
                    </p>
                  </div>
                )}

              {/* Anexos (Fotos e Documentos) do Fornecedor */}
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold flex items-center gap-1">
                  📎 Evidências e Documentos{" "}
                  {anexosMedicao.length > 0 && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {anexosMedicao.length}
                    </Badge>
                  )}
                </p>
                {loadingAnexos && (
                  <p className="text-xs text-gray-400">Carregando anexos...</p>
                )}
                {!loadingAnexos && anexosMedicao.length === 0 && (
                  <p className="text-xs text-gray-400 italic">
                    Nenhuma evidência enviada pelo fornecedor.
                  </p>
                )}
                {anexosMedicao.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {anexosMedicao.map((anexo: any) => (
                      <div
                        key={anexo.id}
                        className="relative group border rounded-lg overflow-hidden bg-gray-50"
                      >
                        <div
                          className="cursor-pointer"
                          onClick={() =>
                            window.open(`${API_URL}${anexo.url}`, "_blank")
                          }
                        >
                          {anexo.tipo === "FOTO" ? (
                            <div className="aspect-square bg-gray-100 flex items-center justify-center">
                              <img
                                src={`${API_URL}${anexo.url}`}
                                alt={anexo.descricao || anexo.nome_original}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            </div>
                          ) : (
                            <div className="aspect-square bg-blue-50 flex flex-col items-center justify-center">
                              <svg
                                className="w-8 h-8 text-blue-400 mb-1"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                />
                              </svg>
                              <p className="text-xs text-blue-600 text-center px-1 truncate w-full">
                                {anexo.nome_original}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="p-1.5">
                          {anexo.descricao && (
                            <p className="text-xs font-medium text-gray-700 truncate">
                              {anexo.descricao}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 truncate">
                            {anexo.nome_original}
                          </p>
                          <p className="text-xs text-gray-400">
                            {(anexo.tamanho_bytes / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        {/* Botão excluir (órgão) */}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExcluirAnexoOrgao(
                                anexo.id,
                                anexo.descricao || anexo.nome_original,
                              );
                            }}
                            className="bg-white/90 rounded p-1 shadow hover:bg-red-50"
                            title="Excluir anexo"
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal Corrigir Boletim ── */}
      <Dialog
        open={!!modalCorrigir}
        onOpenChange={(open) => {
          if (!open) setModalCorrigir(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[92vw] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-violet-600" />
              Corrigir Boletim — {modalCorrigir?.numero_medicao}ª Medição
            </DialogTitle>
            <DialogDescription>
              Corrija os dados em cada aba e depois clique em "Regenerar PDF".
            </DialogDescription>
          </DialogHeader>

          {/* Abas */}
          <div className="flex gap-0 border-b shrink-0">
            {(
              [
                { id: "cabecalho", label: "Cabeçalho" },
                { id: "itens_cronograma", label: "Itens do Contrato" },
                { id: "execucao_fiscal", label: "Execução Fiscal" },
                { id: "discriminacoes", label: "Discriminações" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setAbaCorrigir(id)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${abaCorrigir === id ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Conteúdo das abas — rola verticalmente */}
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {/* Aba Cabeçalho */}
            {abaCorrigir === "cabecalho" && (
              <div className="space-y-4 px-1">
                <div className="space-y-1">
                  <Label>Objeto do Contrato</Label>
                  <Textarea
                    rows={3}
                    placeholder="Descreva o objeto do contrato..."
                    value={cabecalhoForm.objeto_contrato}
                    onChange={(e) =>
                      setCabecalhoForm((f) => ({
                        ...f,
                        objeto_contrato: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Competência</Label>
                    <Input
                      placeholder="ex: MARÇO/2026"
                      value={cabecalhoForm.competencia}
                      onChange={(e) =>
                        setCabecalhoForm((f) => ({
                          ...f,
                          competencia: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Nº Nota Fiscal</Label>
                    <Input
                      placeholder="ex: 000123"
                      value={cabecalhoForm.nota_fiscal_numero}
                      onChange={(e) =>
                        setCabecalhoForm((f) => ({
                          ...f,
                          nota_fiscal_numero: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Período Início</Label>
                    <Input
                      type="date"
                      value={cabecalhoForm.periodo_inicio}
                      onChange={(e) =>
                        setCabecalhoForm((f) => ({
                          ...f,
                          periodo_inicio: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Período Fim</Label>
                    <Input
                      type="date"
                      value={cabecalhoForm.periodo_fim}
                      onChange={(e) =>
                        setCabecalhoForm((f) => ({
                          ...f,
                          periodo_fim: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Valor Nota Fiscal (R$)</Label>
                    <Input
                      placeholder="ex: 19310,14"
                      value={cabecalhoForm.nota_fiscal_valor}
                      onChange={(e) =>
                        setCabecalhoForm((f) => ({
                          ...f,
                          nota_fiscal_valor: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Data Nota Fiscal</Label>
                    <Input
                      type="date"
                      value={cabecalhoForm.nota_fiscal_data}
                      onChange={(e) =>
                        setCabecalhoForm((f) => ({
                          ...f,
                          nota_fiscal_data: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Data de Emissão</Label>
                    <Input
                      type="date"
                      value={cabecalhoForm.data_emissao}
                      onChange={(e) =>
                        setCabecalhoForm((f) => ({
                          ...f,
                          data_emissao: e.target.value,
                        }))
                      }
                    />
                    <p className="text-[11px] text-gray-400">
                      Se vazio, o boletim usa a data da assinatura do
                      fornecedor.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={salvarCabecalho}
                    disabled={salvandoCorrecao}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {salvandoCorrecao ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Salvar Cabeçalho
                  </Button>
                </div>
              </div>
            )}

            {/* Aba Itens do Contrato */}
            {abaCorrigir === "itens_cronograma" && (
              <div className="space-y-3 px-1">
                <p className="text-xs text-gray-500">
                  Edite a descrição e unidade de cada item do cronograma (tabela
                  "Itens Contratados" do PDF).
                </p>
                {itensCronoCorrigir.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Nenhum item de cronograma cadastrado para este contrato.
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-center w-10">#</th>
                          <th className="px-3 py-2 text-left">Descrição</th>
                          <th className="px-3 py-2 text-center w-36">
                            Unidade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensCronoCorrigir.map((ic, i) => (
                          <tr key={ic.id} className="border-t">
                            <td className="px-3 py-1 text-center text-gray-500 text-xs">
                              {ic.numero_item}
                            </td>
                            <td className="px-3 py-1">
                              <Input
                                className="h-8 text-sm"
                                value={ic.descricao}
                                onChange={(e) =>
                                  setItensCronoCorrigir((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, descricao: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-1">
                              <Input
                                className="h-8 text-sm text-center uppercase"
                                value={ic.unidade_medida}
                                onChange={(e) =>
                                  setItensCronoCorrigir((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            unidade_medida:
                                              e.target.value.toUpperCase(),
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={salvarItensCronograma}
                    disabled={
                      salvandoItensCrono || itensCronoCorrigir.length === 0
                    }
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {salvandoItensCrono ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Salvar Itens
                  </Button>
                </div>
              </div>
            )}

            {/* Aba Execução Fiscal */}
            {abaCorrigir === "execucao_fiscal" && (
              <div className="space-y-4 px-1">
                {/* Tabela de itens — NO PERÍODO / ATÉ O PERÍODO / A EXECUTAR */}
                {carregandoExecFiscal ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                  </div>
                ) : execFiscalItens.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Nenhum item de execução encontrado para esta medição.
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                      <thead>
                        <tr className="bg-gray-800 text-white text-xs">
                          <th className="px-2 py-2 text-center w-8" rowSpan={2}>
                            Nº
                          </th>
                          <th className="px-2 py-2 text-left w-48" rowSpan={2}>
                            Descrição
                          </th>
                          <th
                            className="px-2 py-2 text-center w-20"
                            rowSpan={2}
                          >
                            Unidade
                          </th>
                          <th
                            className="px-1 py-1.5 text-center uppercase text-xs"
                            colSpan={3}
                            style={{ backgroundColor: "#1e3a5f" }}
                          >
                            Execução Fiscal
                          </th>
                          <th
                            className="px-1 py-1.5 text-center uppercase text-xs"
                            colSpan={3}
                            style={{ backgroundColor: "#14532d" }}
                          >
                            Execução Financeira
                          </th>
                        </tr>
                        <tr className="text-xs text-white">
                          <th
                            className="px-1 py-1 text-center"
                            style={{ backgroundColor: "#1e4976" }}
                          >
                            No Período
                          </th>
                          <th
                            className="px-1 py-1 text-center"
                            style={{ backgroundColor: "#1e4976" }}
                          >
                            Até o Período
                          </th>
                          <th
                            className="px-1 py-1 text-center"
                            style={{ backgroundColor: "#1e4976" }}
                          >
                            A Executar
                          </th>
                          <th
                            className="px-1 py-1 text-center"
                            style={{ backgroundColor: "#166534" }}
                          >
                            No Período
                          </th>
                          <th
                            className="px-1 py-1 text-center"
                            style={{ backgroundColor: "#166534" }}
                          >
                            Até o Período
                          </th>
                          <th
                            className="px-1 py-1 text-center"
                            style={{ backgroundColor: "#166534" }}
                          >
                            A Executar
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {execFiscalItens.map((it, i) => (
                          <tr
                            key={it.item_cronograma_id}
                            className={`border-t align-top ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                          >
                            <td className="px-2 py-2 text-center text-xs text-gray-500">
                              {it.numero}
                            </td>
                            {/* Descrição — editável */}
                            <td className="px-2 py-1">
                              <Textarea
                                className="text-xs min-h-[52px] resize-none"
                                value={it.descricao}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, descricao: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            {/* Unidade — editável */}
                            <td className="px-2 py-1">
                              <Input
                                className="h-7 text-xs text-center uppercase w-full"
                                value={it.unidade}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            unidade:
                                              e.target.value.toUpperCase(),
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            {/* Execução Fiscal — editável */}
                            <td className="px-1 py-1">
                              <Input
                                className="h-7 text-xs text-center w-14"
                                value={it.no_periodo}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, no_periodo: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-1 py-1">
                              <Input
                                className="h-7 text-xs text-center w-14"
                                value={it.ate_periodo}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, ate_periodo: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-1 py-1">
                              <Input
                                className="h-7 text-xs text-center w-14"
                                value={it.a_executar}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, a_executar: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            {/* Execução Financeira — editável */}
                            <td className="px-1 py-1">
                              <Input
                                className="h-7 text-xs text-right w-24"
                                value={it.fin_no_periodo_str}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            fin_no_periodo_str: e.target.value,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-1 py-1">
                              <Input
                                className="h-7 text-xs text-right w-24"
                                value={it.fin_ate_periodo_str}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            fin_ate_periodo_str: e.target.value,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-1 py-1">
                              <Input
                                className="h-7 text-xs text-right w-24"
                                value={it.fin_a_executar_str}
                                onChange={(e) =>
                                  setExecFiscalItens((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? {
                                            ...r,
                                            fin_a_executar_str: e.target.value,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Campos globais de vigência (para contratos não-por-quantidade) */}
                <details className="border rounded-lg">
                  <summary className="px-4 py-2 text-xs font-semibold text-gray-600 cursor-pointer select-none">
                    Vigência e dados globais (contratos por tempo)
                  </summary>
                  <div className="px-4 pb-4 pt-2 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Vigência Início</Label>
                        <Input
                          type="date"
                          value={execFiscalForm.vigencia_inicio}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              vigencia_inicio: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Vigência Fim</Label>
                        <Input
                          type="date"
                          value={execFiscalForm.vigencia_fim}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              vigencia_fim: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Meses executados</Label>
                        <Input
                          type="number"
                          min={0}
                          value={execFiscalForm.meses_executados}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              meses_executados: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Dias extras executados
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={execFiscalForm.dias_executados_extra}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              dias_executados_extra: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total dias executados</Label>
                        <Input
                          type="number"
                          min={0}
                          value={execFiscalForm.dias_executados}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              dias_executados: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Meses restantes</Label>
                        <Input
                          type="number"
                          min={0}
                          value={execFiscalForm.meses_restantes}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              meses_restantes: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Dias extras restantes</Label>
                        <Input
                          type="number"
                          min={0}
                          value={execFiscalForm.dias_restantes_extra}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              dias_restantes_extra: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total dias restantes</Label>
                        <Input
                          type="number"
                          min={0}
                          value={execFiscalForm.dias_restantes}
                          onChange={(e) =>
                            setExecFiscalForm((f) => ({
                              ...f,
                              dias_restantes: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </details>

                <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700">
                      Totais da Execução Financeira
                    </h4>
                    <p className="text-xs text-gray-500">
                      Use estes campos quando precisar ajustar manualmente a linha
                      TOTAL do quadro financeiro no boletim.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Total No Período (R$)</Label>
                      <Input
                        className="text-sm"
                        value={execFiscalTotaisForm.fin_no_periodo_total}
                        onChange={(e) =>
                          setExecFiscalTotaisForm((f) => ({
                            ...f,
                            fin_no_periodo_total: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Total Até o Período (R$)</Label>
                      <Input
                        className="text-sm"
                        value={execFiscalTotaisForm.fin_ate_periodo_total}
                        onChange={(e) =>
                          setExecFiscalTotaisForm((f) => ({
                            ...f,
                            fin_ate_periodo_total: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Total A Executar (R$)</Label>
                      <Input
                        className="text-sm"
                        value={execFiscalTotaisForm.fin_a_executar_total}
                        onChange={(e) =>
                          setExecFiscalTotaisForm((f) => ({
                            ...f,
                            fin_a_executar_total: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={salvarExecucaoFiscal}
                    disabled={salvandoExecFiscal}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {salvandoExecFiscal ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Salvar Execução Fiscal
                  </Button>
                </div>
              </div>
            )}

            {/* Aba Discriminações */}
            {abaCorrigir === "discriminacoes" && (
              <div className="space-y-3 px-1">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1 md:col-span-1">
                    <Label>Valor total (R$)</Label>
                    <Input
                      className="text-sm"
                      value={discValorTotalCorrigir}
                      onChange={(e) =>
                        setDiscValorTotalCorrigir(e.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Descrição</th>
                        <th className="px-3 py-2 text-right w-36">
                          Valor (R$)
                        </th>
                        <th className="px-3 py-2 text-right w-24">%</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {discCorrigir.map((d, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1">
                            <Input
                              className="h-8 text-sm"
                              value={d.descricao}
                              onChange={(e) =>
                                setDiscCorrigir((prev) =>
                                  prev.map((r, j) =>
                                    j === i
                                      ? { ...r, descricao: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-1">
                            <Input
                              className="h-8 text-sm text-right"
                              value={d.valor}
                              onChange={(e) =>
                                setDiscCorrigir((prev) =>
                                  prev.map((r, j) =>
                                    j === i
                                      ? { ...r, valor: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-1">
                            <Input
                              className="h-8 text-sm text-right"
                              value={d.percentual}
                              onChange={(e) =>
                                setDiscCorrigir((prev) =>
                                  prev.map((r, j) =>
                                    j === i
                                      ? { ...r, percentual: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-1 text-center">
                            <button
                              className="text-red-400 hover:text-red-600"
                              onClick={() =>
                                setDiscCorrigir((prev) =>
                                  prev.filter((_, j) => j !== i),
                                )
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDiscCorrigir((prev) => [
                      ...prev,
                      { descricao: "", valor: "0", percentual: "0" },
                    ])
                  }
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar Linha
                </Button>
                <div className="space-y-1">
                  <Label>
                    Motivo da correção <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Descreva o motivo"
                    value={motivoDiscCorrigir}
                    onChange={(e) => setMotivoDiscCorrigir(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={salvarDiscriminacoes}
                    disabled={salvandoCorrecao}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {salvandoCorrecao ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Salvar Discriminações
                  </Button>
                </div>
              </div>
            )}
          </div>
          {/* fim scroll */}

          {/* Botão Regenerar + link resultado */}
          <div className="border-t pt-4 flex items-center justify-between gap-4 shrink-0">
            <p className="text-xs text-gray-500">
              Após salvar as correções, clique para gerar o novo PDF.
            </p>
            <div className="flex items-center gap-2">
              {pdfRegeneradoUrl && (
                <a
                  href={pdfRegeneradoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <Download className="w-4 h-4" />
                  Baixar PDF
                </a>
              )}
              <Button
                onClick={regenerarBoletim}
                disabled={regenerandoPdf}
                className="bg-green-600 hover:bg-green-700"
              >
                {regenerandoPdf ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Regenerar PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
