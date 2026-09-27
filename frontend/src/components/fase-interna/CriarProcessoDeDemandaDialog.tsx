"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ClipboardList, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_URL, authFetch } from "@/lib/api";
import {
  type ModoFaseInterna,
  lembrarEscolhaModo,
  rotaFaseInternaFeitaFora,
  ultimaEscolhaModo,
} from "@/lib/fase-interna/criacao";
import { OpcoesModoFaseInterna } from "@/components/fase-interna/externa/EscolhaModoFaseInterna";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ItemDemanda {
  descricao_objeto?: string;
  quantidade_estimada?: number | string;
  unidade_medida?: string;
  valor_total_estimado?: number | string;
  categoria?: string;
  nome_classe?: string;
}

interface Demanda {
  id: string;
  unidade_requisitante?: string;
  ano_referencia?: number | string;
  status?: string;
  itens?: ItemDemanda[];
  /** Juntada num DFD consolidado: o processo sai do DFD (não aparece aqui). */
  dfd?: { id: string } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOrgaoId(): string {
  if (typeof window === "undefined") return "";
  try {
    const orgao = JSON.parse(localStorage.getItem("orgao") || "{}");
    return orgao.id || "";
  } catch {
    return "";
  }
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function somarValores(itens?: ItemDemanda[]): number {
  if (!itens?.length) return 0;
  return itens.reduce((acc, it) => {
    const v =
      typeof it.valor_total_estimado === "string"
        ? parseFloat(it.valor_total_estimado)
        : it.valor_total_estimado;
    return acc + (Number.isFinite(v) ? (v as number) : 0);
  }, 0);
}

function previewObjeto(itens?: ItemDemanda[]): string {
  if (!itens?.length) return "Sem itens cadastrados";
  const primeiro = itens[0]?.descricao_objeto?.trim() || "Item sem descrição";
  const truncado =
    primeiro.length > 80 ? `${primeiro.slice(0, 80)}…` : primeiro;
  const restantes = itens.length - 1;
  return restantes > 0 ? `${truncado} +${restantes} itens` : truncado;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CriarProcessoDeDemandaDialog({
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Pergunta da criação: guiado aqui ou fase interna já feita fora (sugestão = última escolha)
  const [modo, setModo] = useState<ModoFaseInterna | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelecionada(null);
    setErro(null);
    setModo(ultimaEscolhaModo());
    carregarDemandas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const carregarDemandas = async () => {
    setLoading(true);
    setErro(null);
    try {
      const orgaoId = getOrgaoId();
      const res = await authFetch(
        `${API_URL}/api/demandas?orgaoId=${orgaoId}&status=APROVADA`,
      );
      if (res.ok) {
        const data = await res.json();
        const lista: Demanda[] = Array.isArray(data)
          ? data
          : data.data || data.items || [];
        setDemandas(lista.filter((d) => !d.dfd));
      } else {
        setDemandas([]);
        const data = await res.json().catch(() => null);
        setErro(data?.message || "Erro ao carregar demandas aprovadas.");
      }
    } catch (e) {
      console.error(e);
      setDemandas([]);
      setErro("Erro ao carregar demandas aprovadas.");
    } finally {
      setLoading(false);
    }
  };

  const criarProcesso = async () => {
    if (!selecionada || !modo) return;
    lembrarEscolhaModo(modo);
    // Fase interna já feita fora: o fluxo curto (dados, itens e PDFs) com a demanda pré-carregada
    if (modo === "FORA") {
      onOpenChange(false);
      router.push(rotaFaseInternaFeitaFora({ demandaId: selecionada }));
      return;
    }
    setCriando(true);
    setErro(null);
    try {
      const res = await authFetch(
        `${API_URL}/api/licitacoes/a-partir-de-demanda`,
        {
          method: "POST",
          body: JSON.stringify({ demanda_id: selecionada }),
        },
      );
      if (res.ok) {
        const created = await res.json();
        onOpenChange(false);
        // Toda criação abre a tela do processo, com o quadro "Fluxo da fase
        // interna" (homologação 26/09/2026 — E7; o DFD é a 1ª etapa do quadro)
        window.dispatchEvent(new Event("processos-updated"));
        router.push(`/orgao/processos/${created.id}`);
        return;
      }
      const data = await res.json().catch(() => null);
      setErro(data?.message || "Não foi possível criar o processo.");
    } catch (e) {
      console.error(e);
      setErro("Não foi possível criar o processo.");
    } finally {
      setCriando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#1351b4]" />
            Criar processo a partir de demanda
          </DialogTitle>
          <DialogDescription>
            Unidade de planejamento: selecione uma demanda aprovada (vira um DFD
            de 1 demanda). O objeto, os itens e os valores são aproveitados no
            novo processo. Para juntar pedidos parecidos de vários setores, use o{" "}
            <a href="/orgao/demandas/consolidacao" className="text-[#1351b4] underline">
              DFD consolidado
            </a>{" "}
            (art. 12, VII).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1 py-1">
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando demandas…
            </div>
          ) : demandas.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              Nenhuma demanda aprovada disponível
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {demandas.map((d) => {
                const ativo = selecionada === d.id;
                const total = somarValores(d.itens);
                const qtdItens = d.itens?.length || 0;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelecionada(d.id)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      ativo
                        ? "border-[#1351b4] bg-[#ecf3fc] ring-1 ring-[#1351b4]"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-gray-900 truncate">
                          {d.unidade_requisitante || "Unidade não informada"}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {previewObjeto(d.itens)}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="shrink-0 bg-[#ecf3fc] text-[#1351b4] border-transparent"
                      >
                        {d.ano_referencia || "—"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span>
                        {qtdItens} {qtdItens === 1 ? "item" : "itens"}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="font-semibold text-gray-800">
                        {brl.format(total)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <OpcoesModoFaseInterna valor={modo} onChange={setModo} compacto />

        {erro && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={criando}
          >
            Cancelar
          </Button>
          <Button
            className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5"
            onClick={criarProcesso}
            disabled={!selecionada || !modo || criando}
          >
            {criando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Criando…
              </>
            ) : modo === "FORA" ? (
              "Continuar: dados, itens e PDFs"
            ) : (
              "Criar processo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
