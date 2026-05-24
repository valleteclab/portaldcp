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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_URL, authFetch } from "@/lib/api";

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

// ─── Constants ────────────────────────────────────────────────────────────────

/** 8 steps of fase interna per Lei 14.133/2021 */
const ETAPAS = [
  {
    id: "DFD",
    nome: "Documento de Formalização de Demanda",
    art: "Art. 18, I",
    // Abre o editor colaborativo Tiptap para DFD
    route: "/orgao/fase-interna/processos/:id/editor?tipo=DFD",
  },
  {
    id: "ETP",
    nome: "Estudo Técnico Preliminar",
    art: "Art. 18, §1º",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=ETP",
  },
  {
    id: "MR",
    nome: "Mapa de Riscos",
    art: "Art. 18, X",
    route: "/orgao/fase-interna/processos/:id/riscos",
  },
  {
    id: "PP",
    nome: "Pesquisa de Preços",
    art: "Art. 23",
    route: "/orgao/fase-interna/processos/:id/precos",
  },
  {
    id: "TR",
    nome: "Termo de Referência",
    art: "Art. 6º, XXIII",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=TR",
  },
  {
    id: "AUT",
    nome: "Autorização para abertura",
    art: "Art. 18, II",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=AA",
  },
  {
    id: "ED",
    nome: "Elaboração do Edital",
    art: "Art. 25",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=ME",
  },
  {
    id: "PJ",
    nome: "Parecer Jurídico",
    art: "Art. 53",
    route: "/orgao/fase-interna/processos/:id/editor?tipo=PJ",
  },
];

/**
 * Map licitacao.fase to how many steps are done (index of current step).
 * Steps with index < done are "concluida", index === done is "andamento", rest are "pendente".
 */
const FASE_STEP_INDEX: Record<string, number> = {
  PLANEJAMENTO: 0,
  TERMO_REFERENCIA: 1,
  PESQUISA_PRECOS: 2,
  ANALISE_JURIDICA: 4,
  APROVACAO_INTERNA: 7,
};

type StepStatus = "concluida" | "andamento" | "pendente";

interface EtapaComStatus {
  id: string;
  nome: string;
  art: string;
  route: string;
  status: StepStatus;
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

function buildEtapas(fase: string): EtapaComStatus[] {
  const currentIdx = FASE_STEP_INDEX[fase] ?? 0;
  return ETAPAS.map((e, i) => ({
    ...e,
    status:
      i < currentIdx
        ? "concluida"
        : i === currentIdx
          ? "andamento"
          : "pendente",
  }));
}

function documentoTemConteudo(doc?: Documento) {
  if (!doc) return false;
  if (doc.descricao?.trim()) return true;
  return (
    !!doc.dados_estruturados && Object.keys(doc.dados_estruturados).length > 0
  );
}

function buildEtapasPorDocumentos(
  documentos: Documento[],
  fase: string,
): EtapaComStatus[] {
  const fallbackIdx = FASE_STEP_INDEX[fase] ?? 0;
  const currentIdx = documentos.reduce((ultimo, doc) => {
    if (!documentoTemConteudo(doc)) return ultimo;
    const idx = ETAPAS.findIndex((etapa) => etapa.id === doc.tipo);
    return idx > ultimo ? idx : ultimo;
  }, fallbackIdx);

  return ETAPAS.map((e, i) => ({
    ...e,
    status:
      i < currentIdx
        ? "concluida"
        : i === currentIdx
          ? "andamento"
          : "pendente",
  }));
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

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
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

  return (
    <div className="flex gap-3">
      {/* Left: icon + vertical line */}
      <div className="flex flex-col items-center">
        <StepIcon status={etapa.status} index={index} />
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
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {etapa.art} ·{" "}
              {etapa.status === "concluida"
                ? "Concluída"
                : etapa.status === "andamento"
                  ? "Em andamento"
                  : "Pendente"}
            </div>
          </div>

          <Button
            size="sm"
            variant={etapa.status === "andamento" ? "default" : "outline"}
            className={`h-7 text-xs shrink-0 ${
              etapa.status === "andamento"
                ? "bg-[#1351b4] hover:bg-[#0c326f] text-white"
                : ""
            }`}
            onClick={() =>
              router.push(
                etapa.route.startsWith("/")
                  ? etapa.route.replace(":id", processoId)
                  : `/orgao/fase-interna/processos/${processoId}/${etapa.route}`,
              )
            }
          >
            {actionLabel}
          </Button>
        </div>
      </div>
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregar();
  }, [id]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [licitacaoRes, documentosRes] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${id}`),
        authFetch(`${API_URL}/api/fase-interna/${id}/documentos`),
      ]);
      if (licitacaoRes.ok) {
        setLicitacao(await licitacaoRes.json());
      }
      if (documentosRes.ok) {
        setDocumentos(await documentosRes.json());
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

  const etapas = buildEtapasPorDocumentos(documentos, licitacao.fase);
  const concluidas = etapas.filter((e) => e.status === "concluida").length;
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
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Encaminhar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="visao-geral">
        <TabsList className="border-b border-gray-200 bg-transparent rounded-none p-0 h-auto gap-0 mb-6 w-full justify-start">
          {[
            { key: "visao-geral", label: "Visão geral" },
            { key: "documentos", label: "Documentos (8)" },
            { key: "comentarios", label: "Comentários (4)" },
            { key: "historico", label: "Histórico" },
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
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Nenhuma análise de conformidade disponível para este
                    processo.
                  </p>
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
        <TabsContent value="comentarios">
          <div className="py-16 text-center text-gray-400 text-sm">
            Aba de comentários em desenvolvimento.
          </div>
        </TabsContent>
        <TabsContent value="historico">
          <div className="py-16 text-center text-gray-400 text-sm">
            Histórico de tramitação em desenvolvimento.
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
