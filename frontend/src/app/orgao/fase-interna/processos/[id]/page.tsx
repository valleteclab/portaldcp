"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Check,
  Sparkles,
  Download,
  MessageSquare,
  ArrowRight,
  Loader2,
  Users,
  Lock,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_URL, authFetch } from "@/lib/api";
import { TramitacaoProcessoCard } from "@/components/fase-interna/TramitacaoProcessoCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Licitacao {
  id: string;
  numero_processo: string;
  objeto: string;
  fase: string;
  modalidade: string;
  valor_total_estimado: number | string;
  created_at?: string;
  area?: string;
  responsavel?: string;
  numero_sei?: string;
  criterio_julgamento?: string;
}

interface Documento {
  id: string;
  tipo: string;
  titulo: string;
  status: string;
  created_at: string;
  descricao?: string;
  dados_estruturados?: Record<string, unknown>;
}

// Resposta de GET /api/fase-interna/:licitacaoId/contexto
interface DocumentoContexto {
  tipo: string;
  status: string;
  secoes_preenchidas: number;
  secoes_total: number;
  resumo: string;
}

interface ContextoLicitacao {
  licitacao: {
    id: string;
    objeto: string;
    numero_processo: string;
    modalidade: string;
    criterio_julgamento: string;
    valor_total_estimado: number | null;
    natureza_objeto: string;
    prazo_execucao: string | null;
    itens: Array<{
      descricao_resumida: string;
      quantidade: number;
      unidade_medida: string;
      valor_unitario_estimado: number | null;
    }>;
  };
  demanda: {
    unidade_requisitante: string;
    ano_referencia: number;
    itens_count: number;
  } | null;
  documentos: DocumentoContexto[];
  pesquisa_preco: {
    valor_mediano: number | null;
    fontes_count: number;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * 8 etapas da fase interna (Lei 14.133/2021).
 * - `id`: rótulo curto exibido no cockpit.
 * - `docTipo`: código do documento (enum TipoDocumentoFaseInterna) usado para
 *   casar com os documentos persistidos e com o /contexto.
 * - `prereqs`: etapas que precisam estar concluídas antes desta (encadeamento).
 */
const ETAPAS = [
  {
    id: "DFD",
    docTipo: "DFD",
    nome: "Documento de Formalização de Demanda",
    art: "Art. 18, I",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=DFD",
    prereqs: [] as string[],
  },
  {
    id: "ETP",
    docTipo: "ETP",
    nome: "Estudo Técnico Preliminar",
    art: "Art. 18, §1º",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=ETP",
    prereqs: ["DFD"],
  },
  {
    id: "MR",
    docTipo: "AR",
    nome: "Mapa de Riscos",
    art: "Art. 18, X",
    route: "/orgao/fase-interna/processos/:id/riscos",
    prereqs: ["ETP"],
  },
  {
    id: "PP",
    docTipo: "PP",
    nome: "Pesquisa de Preços",
    art: "Art. 23",
    route: "/orgao/fase-interna/processos/:id/precos",
    prereqs: ["ETP"],
  },
  {
    id: "TR",
    docTipo: "TR",
    nome: "Termo de Referência",
    art: "Art. 6º, XXIII",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=TR",
    prereqs: ["ETP", "PP"],
  },
  {
    id: "AUT",
    docTipo: "AA",
    nome: "Autorização para abertura",
    art: "Art. 18, II",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=AA",
    prereqs: ["TR"],
  },
  {
    id: "ED",
    docTipo: "ME",
    nome: "Elaboração do Edital",
    art: "Art. 25",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=ME",
    prereqs: ["TR", "AUT"],
  },
  {
    id: "PJ",
    docTipo: "PJ",
    nome: "Parecer Jurídico",
    art: "Art. 53",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=PJ",
    prereqs: ["ED"],
  },
];

type StepStatus = "concluida" | "andamento" | "pendente";

interface EtapaComStatus {
  id: string;
  docTipo: string;
  nome: string;
  art: string;
  route: string;
  prereqs: string[];
  status: StepStatus;
  /** Seções preenchidas / total (quando o documento é seccionado). */
  preenchidas: number;
  total: number;
  /** Bloqueada por pré-requisito não concluído. */
  bloqueada: boolean;
  /** Rótulo do(s) pré-requisito(s) que está(ão) bloqueando. */
  bloqueadaPor: string[];
}

const STATUS_CHIP_FASE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  PLANEJAMENTO: { bg: "bg-gray-100", text: "text-gray-600", label: "Rascunho" },
  TERMO_REFERENCIA: {
    bg: "bg-blue-100",
    text: "text-[#1351b4]",
    label: "Em andamento",
  },
  PESQUISA_PRECOS: {
    bg: "bg-blue-100",
    text: "text-[#1351b4]",
    label: "Em andamento",
  },
  ANALISE_JURIDICA: {
    bg: "bg-purple-100",
    text: "text-purple-700",
    label: "Análise Jurídica",
  },
  APROVACAO_INTERNA: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    label: "Aprovação interna",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoeda(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!n || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtData(d?: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
}

function documentoTemConteudo(doc?: Documento) {
  if (!doc) return false;
  if (doc.descricao?.trim()) return true;
  return (
    !!doc.dados_estruturados && Object.keys(doc.dados_estruturados).length > 0
  );
}

const STATUS_APROVADO = new Set(["APROVADO", "EA"]); // documento concluído/aprovado

/**
 * Calcula o status de cada etapa cruzando os documentos persistidos com o
 * /contexto (que traz seções preenchidas/total e status reais), e marca
 * bloqueios por pré-requisito do encadeamento da fase interna.
 */
function computarEtapas(
  documentos: Documento[],
  contexto: ContextoLicitacao | null,
): EtapaComStatus[] {
  const porDocTipo = new Map<string, Documento>();
  for (const d of documentos) porDocTipo.set(d.tipo, d);

  const ctxPorTipo = new Map<string, DocumentoContexto>();
  for (const d of contexto?.documentos || []) ctxPorTipo.set(d.tipo, d);

  // 1ª passada: status individual de cada etapa (sem considerar bloqueio).
  const base = ETAPAS.map((e) => {
    const ctx = ctxPorTipo.get(e.docTipo);
    const doc = porDocTipo.get(e.docTipo);
    const total = ctx?.secoes_total ?? 0;
    const preenchidas = ctx?.secoes_preenchidas ?? 0;
    const aprovado =
      (ctx && STATUS_APROVADO.has(ctx.status)) ||
      (doc && STATUS_APROVADO.has(doc.status));

    let status: StepStatus;
    if (aprovado || (total > 0 && preenchidas >= total)) {
      status = "concluida";
    } else if (preenchidas > 0 || documentoTemConteudo(doc)) {
      status = "andamento";
    } else {
      status = "pendente";
    }

    return { ...e, status, preenchidas, total };
  });

  const statusPorId = new Map(base.map((e) => [e.id, e.status]));

  // 2ª passada: aplica bloqueios por pré-requisito.
  return base.map((e) => {
    const bloqueadaPor = e.prereqs.filter(
      (pid) => statusPorId.get(pid) !== "concluida",
    );
    return {
      ...e,
      bloqueada: bloqueadaPor.length > 0 && e.status === "pendente",
      bloqueadaPor,
    };
  });
}

/**
 * Próximo passo recomendado: primeira etapa em andamento; senão, primeira
 * pendente desbloqueada. Null quando tudo concluído.
 */
function proximoPasso(etapas: EtapaComStatus[]): EtapaComStatus | null {
  const emAndamento = etapas.find((e) => e.status === "andamento");
  if (emAndamento) return emAndamento;
  const pendenteLivre = etapas.find(
    (e) => e.status === "pendente" && !e.bloqueada,
  );
  return pendenteLivre ?? null;
}

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIcon({
  status,
  index,
  bloqueada,
}: {
  status: StepStatus;
  index: number;
  bloqueada?: boolean;
}) {
  if (status === "concluida") {
    return (
      <div className="w-8 h-8 rounded-full bg-[#e3f5e8] border-2 border-[#168821] flex items-center justify-center shrink-0">
        <Check className="w-4 h-4 text-[#168821]" />
      </div>
    );
  }
  if (status === "andamento") {
    return (
      <div className="w-8 h-8 rounded-full bg-[#ecf3fc] border-2 border-[#1351b4] flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-[#1351b4]">{index + 1}</span>
      </div>
    );
  }
  if (bloqueada) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-50 border-2 border-gray-200 flex items-center justify-center shrink-0">
        <Lock className="w-3.5 h-3.5 text-gray-300" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center shrink-0">
      <span className="text-xs font-medium text-gray-400">{index + 1}</span>
    </div>
  );
}

function EtapaRow({
  etapa,
  index,
  isLast,
  processoId,
}: {
  etapa: EtapaComStatus;
  index: number;
  isLast: boolean;
  processoId: string;
}) {
  const router = useRouter();
  const actionLabel =
    etapa.status === "pendente"
      ? "Iniciar"
      : etapa.status === "andamento"
        ? "Continuar"
        : "Abrir";

  const irParaEtapa = () =>
    router.push(
      etapa.route.startsWith("/")
        ? etapa.route.replace(":id", processoId)
        : `/orgao/fase-interna/processos/${processoId}/${etapa.route}`,
    );

  const labelPrereqs = etapa.bloqueadaPor
    .map((pid) => ETAPAS.find((e) => e.id === pid)?.id || pid)
    .join(", ");

  return (
    <div className="flex gap-3">
      {/* Left: icon + vertical line */}
      <div className="flex flex-col items-center">
        <StepIcon
          status={etapa.status}
          index={index}
          bloqueada={etapa.bloqueada}
        />
        {!isLast && (
          <div
            className={`w-0.5 flex-1 mt-1 ${
              etapa.status === "concluida" ? "bg-[#168821]" : "bg-gray-200"
            }`}
            style={{ minHeight: 24 }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className={`flex-1 pb-5 ${isLast ? "pb-0" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                  etapa.status === "concluida"
                    ? "bg-[#e3f5e8] text-[#168821]"
                    : etapa.status === "andamento"
                      ? "bg-[#ecf3fc] text-[#1351b4]"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {etapa.id}
              </span>
              <span
                className={`text-sm font-semibold ${
                  etapa.status === "pendente"
                    ? "text-gray-400"
                    : "text-gray-800"
                }`}
              >
                {etapa.nome}
              </span>
              {etapa.total > 0 && etapa.status !== "concluida" && (
                <span className="text-[11px] text-gray-400 font-medium">
                  {etapa.preenchidas}/{etapa.total} seções
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {etapa.art} ·{" "}
              {etapa.bloqueada
                ? `Aguardando ${labelPrereqs}`
                : etapa.status === "concluida"
                  ? "Concluída"
                  : etapa.status === "andamento"
                    ? "Em andamento"
                    : "Pendente"}
            </div>
          </div>

          <Button
            size="sm"
            variant={etapa.status === "andamento" ? "default" : "outline"}
            disabled={etapa.bloqueada}
            title={
              etapa.bloqueada
                ? `Conclua ${labelPrereqs} antes de iniciar esta etapa`
                : undefined
            }
            className={`h-7 text-xs shrink-0 ${
              etapa.status === "andamento"
                ? "bg-[#1351b4] hover:bg-[#0c326f] text-white"
                : ""
            }`}
            onClick={irParaEtapa}
          >
            {etapa.bloqueada ? "Bloqueada" : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Banner "próximo passo recomendado" — guia o analista ao que fazer agora.
function ProximoPassoBanner({
  etapa,
  processoId,
}: {
  etapa: EtapaComStatus | null;
  processoId: string;
}) {
  const router = useRouter();

  if (!etapa) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#168821]/30 bg-[#e3f5e8] px-4 py-3">
        <CircleCheck className="w-5 h-5 text-[#168821] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0d5b18]">
            Fase interna concluída
          </p>
          <p className="text-xs text-[#168821]/80">
            Todas as etapas foram preenchidas. O processo está pronto para
            encaminhamento.
          </p>
        </div>
      </div>
    );
  }

  const irParaEtapa = () =>
    router.push(
      etapa.route.startsWith("/")
        ? etapa.route.replace(":id", processoId)
        : `/orgao/fase-interna/processos/${processoId}/${etapa.route}`,
    );

  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#1351b4]/25 bg-gradient-to-r from-[#ecf3fc] to-white px-4 py-3">
      <Sparkles className="w-5 h-5 text-[#1351b4] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1351b4]/70">
          Próximo passo recomendado
        </p>
        <p className="text-sm font-semibold text-gray-900">
          {etapa.status === "andamento" ? "Continuar" : "Iniciar"}: {etapa.nome}
          <span className="ml-2 text-xs font-normal text-gray-400">
            {etapa.art}
          </span>
        </p>
      </div>
      <Button
        size="sm"
        className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5 shrink-0"
        onClick={irParaEtapa}
      >
        {etapa.status === "andamento" ? "Continuar" : "Iniciar"}
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProcessoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [contexto, setContexto] = useState<ContextoLicitacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState("visao-geral");
  const [abrirEncaminhar, setAbrirEncaminhar] = useState(false);

  useEffect(() => {
    carregar();
  }, [id]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [licitacaoRes, documentosRes, contextoRes] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${id}`),
        authFetch(`${API_URL}/api/fase-interna/${id}/documentos`),
        authFetch(`${API_URL}/api/fase-interna/${id}/contexto`),
      ]);
      if (licitacaoRes.ok) {
        setLicitacao(await licitacaoRes.json());
      }
      if (documentosRes.ok) {
        setDocumentos(await documentosRes.json());
      }
      if (contextoRes.ok) {
        setContexto(await contextoRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#1351b4]" />
      </div>
    );
  }

  if (!licitacao) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Processo não encontrado.</p>
        <Link href="/orgao/fase-interna/processos">
          <Button variant="outline" className="mt-4">
            Voltar à lista
          </Button>
        </Link>
      </div>
    );
  }

  const etapas = computarEtapas(documentos, contexto);
  const concluidas = etapas.filter((e) => e.status === "concluida").length;
  const proxima = proximoPasso(etapas);
  // Conformidade global: % de seções preenchidas entre documentos seccionados.
  const totalSecoes = etapas.reduce((s, e) => s + e.total, 0);
  const secoesPreenchidas = etapas.reduce((s, e) => s + e.preenchidas, 0);
  const conformidadePct =
    totalSecoes > 0 ? Math.round((secoesPreenchidas / totalSecoes) * 100) : 0;
  const statusChip =
    STATUS_CHIP_FASE[licitacao.fase] || STATUS_CHIP_FASE.PLANEJAMENTO;
  const equipe = licitacao.responsavel
    ? [
        {
          nome: licitacao.responsavel,
          papel: "Responsável",
          initials: initialsFromName(licitacao.responsavel),
        },
      ]
    : [];

  return (
    <div className="p-6 pb-12 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link
          href="/orgao/fase-interna/processos"
          className="hover:text-[#1351b4]"
        >
          Processos
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">
          {licitacao.numero_processo || `#${id.slice(0, 8)}`}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1 min-w-0 mr-4">
          <h1 className="text-xl font-bold text-gray-900 leading-snug mb-2">
            {licitacao.objeto || `Processo ${licitacao.numero_processo}`}
          </h1>

          {/* chips row */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {licitacao.area && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                {licitacao.area}
              </span>
            )}
            {licitacao.responsavel && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                {licitacao.responsavel}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              {fmtMoeda(licitacao.valor_total_estimado)}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              Criado: {fmtData(licitacao.created_at)}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusChip.bg} ${statusChip.text}`}
            >
              {statusChip.label}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Comentar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Exportar dossiê
          </Button>
          <Button
            size="sm"
            className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5"
            onClick={() => {
              setAbaAtiva("tramitacao");
              setAbrirEncaminhar(true);
            }}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Encaminhar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList className="border-b border-gray-200 bg-transparent rounded-none p-0 h-auto gap-0 mb-6 w-full justify-start">
          {[
            { key: "visao-geral", label: "Visão geral" },
            { key: "documentos", label: "Documentos (8)" },
            { key: "tramitacao", label: "Tramitação" },
            { key: "comentarios", label: "Comentários" },
            { key: "permissoes", label: "Permissões" },
          ].map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1351b4] data-[state=active]:text-[#1351b4] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="visao-geral">
          {/* Próximo passo recomendado */}
          <ProximoPassoBanner etapa={proxima} processoId={id} />

          <div className="grid grid-cols-[2fr_1fr] gap-5">
            {/* Left: Steps card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    Etapas da fase interna · Lei 14.133/2021
                  </CardTitle>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#ecf3fc] text-[#1351b4]">
                    {concluidas}/8 concluídas
                  </span>
                </div>
                <Progress
                  value={(concluidas / 8) * 100}
                  className="h-1.5 mt-2"
                />
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-0">
                  {etapas.map((etapa, idx) => (
                    <EtapaRow
                      key={etapa.id}
                      etapa={etapa}
                      index={idx}
                      isLast={idx === etapas.length - 1}
                      processoId={id}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Right sidebar */}
            <div className="space-y-4">
              {/* Card: Informações */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    Informações
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {[
                    {
                      label: "Nº SEI",
                      value:
                        licitacao.numero_sei ||
                        licitacao.numero_processo ||
                        "—",
                    },
                    {
                      label: "Modalidade",
                      value: licitacao.modalidade?.replace(/_/g, " ") || "—",
                    },
                    {
                      label: "Critério de julgamento",
                      value:
                        licitacao.criterio_julgamento?.replace(/_/g, " ") ||
                        "—",
                    },
                    { label: "Forma", value: "—" },
                    {
                      label: "Criado em",
                      value: fmtData(licitacao.created_at),
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-start justify-between gap-2 text-xs"
                    >
                      <span className="text-gray-500 shrink-0">
                        {row.label}
                      </span>
                      <span className="text-gray-800 font-medium text-right">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Card: Conformidade IA */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#1351b4]" />
                      Conformidade IA
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {totalSecoes === 0 ? (
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Comece a preencher os documentos para acompanhar a
                      conformidade do processo.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">
                            Preenchimento geral
                          </span>
                          <span className="text-xs font-bold text-[#1351b4]">
                            {conformidadePct}%
                          </span>
                        </div>
                        <Progress value={conformidadePct} className="h-1.5" />
                        <p className="text-[11px] text-gray-400 mt-1">
                          {secoesPreenchidas} de {totalSecoes} seções
                          preenchidas
                        </p>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        {etapas
                          .filter((e) => e.total > 0)
                          .map((e) => {
                            const completa = e.preenchidas >= e.total;
                            return (
                              <div
                                key={e.id}
                                className="flex items-center gap-2 text-[11px]"
                              >
                                {completa ? (
                                  <CircleCheck className="w-3.5 h-3.5 text-[#168821] shrink-0" />
                                ) : (
                                  <CircleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                )}
                                <span className="font-medium text-gray-700">
                                  {e.id}
                                </span>
                                <span className="text-gray-400">
                                  {e.preenchidas}/{e.total}
                                </span>
                                {e.bloqueada && (
                                  <Lock className="w-3 h-3 text-gray-300 ml-auto" />
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card: Equipe */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-gray-400" />
                    Equipe
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {equipe.length === 0 && (
                    <p className="text-xs text-gray-400">
                      Nenhuma equipe vinculada.
                    </p>
                  )}
                  {equipe.map((m) => (
                    <div key={m.nome} className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold bg-[#1351b4]">
                        {m.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800">
                          {m.nome}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {m.papel}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Other tabs — placeholder */}
        <TabsContent value="documentos">
          <div className="grid grid-cols-2 gap-4">
            {etapas.map((etapa, index) => {
              const href = etapa.route.replace(":id", id);
              const statusLabel =
                etapa.status === "concluida"
                  ? "Concluído"
                  : etapa.status === "andamento"
                    ? "Em andamento"
                    : "Pendente";
              const actionLabel =
                etapa.status === "pendente"
                  ? "Iniciar"
                  : etapa.status === "andamento"
                    ? "Continuar"
                    : "Abrir";

              return (
                <Card key={etapa.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <StepIcon status={etapa.status} index={index} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#ecf3fc] px-2 py-0.5 text-[11px] font-bold text-[#1351b4]">
                            {etapa.id}
                          </span>
                          <span className="text-xs text-gray-400">
                            {etapa.art}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">
                          {etapa.nome}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          {statusLabel}
                        </p>
                      </div>
                      <Link href={href}>
                        <Button
                          size="sm"
                          variant={
                            etapa.status === "andamento" ? "default" : "outline"
                          }
                          className={`h-8 text-xs ${
                            etapa.status === "andamento"
                              ? "bg-[#1351b4] hover:bg-[#0c326f] text-white"
                              : ""
                          }`}
                        >
                          {actionLabel}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="tramitacao">
          <TramitacaoProcessoCard
            licitacaoId={id}
            abrirEncaminharExterno={abrirEncaminhar}
            onEncaminharFechado={() => setAbrirEncaminhar(false)}
          />
        </TabsContent>
        <TabsContent value="comentarios">
          <div className="py-16 text-center text-gray-400 text-sm">
            Aba de comentários em desenvolvimento.
          </div>
        </TabsContent>
        <TabsContent value="permissoes">
          <div className="py-16 text-center text-gray-400 text-sm">
            Gestão de permissões em desenvolvimento.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
