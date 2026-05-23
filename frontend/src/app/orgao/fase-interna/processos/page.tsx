"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  ChevronRight,
  Filter,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { API_URL, authFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Licitacao {
  id: string;
  numero_processo: string;
  objeto: string;
  fase: string;
  modalidade: string;
  valor_total_estimado: number | string;
  responsavel?: string;
  area?: string;
  created_at?: string;
  etapaAtual?: EtapaInfo;
}

interface Documento {
  tipo: string;
  descricao?: string;
  dados_estruturados?: Record<string, unknown>;
}

interface EtapaInfo {
  sigla: string;
  art: string;
  progresso: number;
  step?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FASES_INTERNAS = [
  "PLANEJAMENTO",
  "TERMO_REFERENCIA",
  "PESQUISA_PRECOS",
  "ANALISE_JURIDICA",
  "APROVACAO_INTERNA",
];

/** Map fase → status display slug */
const FASE_STATUS: Record<string, string> = {
  PLANEJAMENTO: "rascunho",
  TERMO_REFERENCIA: "andamento",
  PESQUISA_PRECOS: "andamento",
  ANALISE_JURIDICA: "juridico",
  APROVACAO_INTERNA: "revisao",
};

/** Map fase → etapa sigla e art */
const FASE_ETAPA: Record<string, EtapaInfo> = {
  PLANEJAMENTO: { sigla: "DFD", art: "Art. 18, I", progresso: 1, step: "dfd" },
  TERMO_REFERENCIA: {
    sigla: "ETP",
    art: "Art. 18, §1º",
    progresso: 2,
    step: "etp",
  },
  PESQUISA_PRECOS: {
    sigla: "PP",
    art: "Art. 23",
    progresso: 4,
    step: "pesquisa",
  },
  ANALISE_JURIDICA: {
    sigla: "TR",
    art: "Art. 6º, XXIII",
    progresso: 5,
    step: "tr",
  },
  APROVACAO_INTERNA: {
    sigla: "PJ",
    art: "Art. 53",
    progresso: 8,
    step: "juridico",
  },
};

const DOCUMENTO_ETAPA: Record<string, EtapaInfo> = {
  DFD: { sigla: "DFD", art: "Art. 18, I", progresso: 1, step: "dfd" },
  ETP: { sigla: "ETP", art: "Art. 18, §1º", progresso: 2, step: "etp" },
  MR: { sigla: "MR", art: "Art. 18, X", progresso: 3, step: "riscos" },
  PP: { sigla: "PP", art: "Art. 23", progresso: 4, step: "pesquisa" },
  TR: { sigla: "TR", art: "Art. 6º, XXIII", progresso: 5, step: "tr" },
  AA: { sigla: "AUT", art: "Art. 18, II", progresso: 6, step: "autorizacao" },
  ME: { sigla: "ED", art: "Art. 25", progresso: 7, step: "edital" },
  PJ: { sigla: "PJ", art: "Art. 53", progresso: 8, step: "juridico" },
};

/** Status filter tabs */
type FilterTab =
  | "todos"
  | "rascunho"
  | "andamento"
  | "revisao"
  | "juridico"
  | "aprovado";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "rascunho", label: "Rascunho" },
  { key: "andamento", label: "Em andamento" },
  { key: "revisao", label: "Em revisão" },
  { key: "juridico", label: "Jurídico" },
  { key: "aprovado", label: "Aprovado" },
];

/** Status chip styles */
const STATUS_CHIP: Record<string, { bg: string; text: string; label: string }> =
  {
    rascunho: { bg: "bg-gray-100", text: "text-gray-600", label: "Rascunho" },
    andamento: {
      bg: "bg-blue-100",
      text: "text-[#1351b4]",
      label: "Em andamento",
    },
    revisao: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      label: "Em revisão",
    },
    juridico: {
      bg: "bg-purple-100",
      text: "text-purple-700",
      label: "Jurídico",
    },
    aprovado: { bg: "bg-green-100", text: "text-[#168821]", label: "Aprovado" },
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

function documentoTemConteudo(doc?: Documento) {
  if (!doc) return false;
  if (doc.descricao?.trim()) return true;
  return (
    !!doc.dados_estruturados && Object.keys(doc.dados_estruturados).length > 0
  );
}

function calcularEtapaAtual(documentos: Documento[]): EtapaInfo | undefined {
  return documentos.reduce<EtapaInfo | undefined>((ultima, doc) => {
    if (!documentoTemConteudo(doc)) return ultima;
    const etapa = DOCUMENTO_ETAPA[doc.tipo];
    if (!etapa) return ultima;
    if (!ultima || etapa.progresso > ultima.progresso) return etapa;
    return ultima;
  }, undefined);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProcessosPage() {
  const [processos, setProcessos] = useState<Licitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroTab, setFiltroTab] = useState<FilterTab>("todos");

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes?limit=100`);
      if (res.ok) {
        const data = await res.json();
        const lista: Licitacao[] = Array.isArray(data)
          ? data
          : data.data || data.items || [];
        const internas = lista.filter((l) => FASES_INTERNAS.includes(l.fase));
        const enriquecidas = await Promise.all(
          internas.map(async (processo) => {
            try {
              const documentosRes = await authFetch(
                `${API_URL}/api/fase-interna/${processo.id}/documentos`,
              );
              if (!documentosRes.ok) return processo;
              const documentos = await documentosRes.json();
              return {
                ...processo,
                etapaAtual: calcularEtapaAtual(documentos) || undefined,
              };
            } catch {
              return processo;
            }
          }),
        );
        setProcessos(enriquecidas);
      } else {
        setProcessos([]);
      }
    } catch (e) {
      console.error(e);
      setProcessos([]);
    } finally {
      setLoading(false);
    }
  };

  const filtrados = processos.filter((p) => {
    const status = FASE_STATUS[p.fase] || "rascunho";
    const matchBusca =
      !busca ||
      p.numero_processo?.toLowerCase().includes(busca.toLowerCase()) ||
      p.objeto?.toLowerCase().includes(busca.toLowerCase());
    const matchTab = filtroTab === "todos" || status === filtroTab;
    return matchBusca && matchTab;
  });

  const excluirProcesso = async (processo: Licitacao) => {
    const identificador =
      processo.numero_processo || processo.objeto || processo.id;
    const confirmado = window.confirm(
      `Excluir o processo ${identificador}?\n\nEsta ação remove o processo e não pode ser desfeita.`,
    );

    if (!confirmado) return;

    setExcluindoId(processo.id);
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${processo.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Erro ao excluir processo");
      }

      setProcessos((prev) => prev.filter((p) => p.id !== processo.id));
      window.dispatchEvent(new CustomEvent('processos-updated'));
      toast.success("Processo excluído com sucesso");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao excluir processo",
      );
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <div className="p-6 pb-10 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <span>Processos</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Processos licitatórios
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading
              ? "Carregando…"
              : `${filtrados.length} processo${filtrados.length !== 1 ? "s" : ""} · Fase interna em curso`}
          </p>
        </div>
        <Link href="/orgao/fase-interna/processos/novo">
          <Button className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5">
            <Plus className="w-4 h-4" />
            Novo processo
          </Button>
        </Link>
      </div>

      {/* Filter card */}
      <Card className="border-0 shadow-sm mb-5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por nº ou objeto…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 bg-white h-9 text-sm"
              />
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFiltroTab(tab.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filtroTab === tab.key
                      ? "bg-[#1351b4] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mais filtros */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 ml-auto text-gray-500"
            >
              <Filter className="w-3.5 h-3.5" />
              Mais filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando processos…
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              Nenhum processo encontrado. Ajuste os filtros ou crie um novo
              processo.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">
                    Nº / Objeto
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                    Modalidade
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                    Etapa atual
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-3 w-36">
                    Progresso
                  </th>
                  <th className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                    Valor estimado
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                    Responsável
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                    Status
                  </th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const etapa = p.etapaAtual ||
                    FASE_ETAPA[p.fase] || {
                      sigla: "—",
                      art: "—",
                      progresso: 0,
                    };
                  const status = FASE_STATUS[p.fase] || "rascunho";
                  const chip = STATUS_CHIP[status] || STATUS_CHIP.rascunho;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors cursor-pointer"
                    >
                      {/* Nº / Objeto */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-sm text-gray-900">
                          {p.numero_processo || `#${p.id.slice(0, 8)}`}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">
                          {p.objeto}
                        </div>
                      </td>

                      {/* Modalidade */}
                      <td className="px-3 py-4 text-xs text-gray-700 whitespace-nowrap">
                        {p.modalidade?.replace(/_/g, " ") || "—"}
                      </td>

                      {/* Etapa atual */}
                      <td className="px-3 py-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-[#ecf3fc] text-[#1351b4] mb-0.5">
                          {etapa.sigla}
                        </span>
                        <div className="text-[10px] text-gray-400">
                          {etapa.art}
                        </div>
                      </td>

                      {/* Progresso */}
                      <td className="px-3 py-4 w-36">
                        <Progress
                          value={(etapa.progresso / 8) * 100}
                          className="h-1.5 mb-1"
                        />
                        <div className="text-[10px] text-gray-400">
                          {etapa.progresso}/8
                        </div>
                      </td>

                      {/* Valor estimado */}
                      <td className="px-3 py-4 text-right">
                        <div className="text-sm font-bold text-gray-800">
                          {fmtMoeda(p.valor_total_estimado)}
                        </div>
                      </td>

                      {/* Responsável */}
                      <td className="px-3 py-4">
                        <div className="text-xs font-medium text-gray-700">
                          {p.responsavel || "—"}
                        </div>
                        {p.area && (
                          <div className="text-[10px] text-gray-400">
                            {p.area}
                          </div>
                        )}
                      </td>

                      {/* Status chip */}
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip.bg} ${chip.text}`}
                        >
                          {chip.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => excluirProcesso(p)}
                            disabled={excluindoId === p.id}
                            title="Excluir processo"
                          >
                            {excluindoId === p.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                          <Link href={`/orgao/fase-interna/processos/${p.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 hover:bg-[#ecf3fc] hover:text-[#1351b4]"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
