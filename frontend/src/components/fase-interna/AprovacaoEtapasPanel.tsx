"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CircleCheck,
  CircleX,
  Loader2,
  SendHorizonal,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL, authFetch, formatarDataHoraBR } from "@/lib/api";

export interface EtapaAprovacao {
  id: string;
  ordem: number;
  nome: string;
  setor_nome?: string;
  usuario_nome?: string;
  exige_assinatura: boolean;
  status: "PENDENTE" | "EM_ANALISE" | "APROVADA" | "REPROVADA" | "CANCELADA";
  decidido_por_nome?: string;
  data_decisao?: string;
  justificativa?: string;
  created_at: string;
}

const STATUS_ETAPA: Record<
  EtapaAprovacao["status"],
  { label: string; cls: string }
> = {
  PENDENTE: { label: "Aguardando vez", cls: "bg-gray-100 text-gray-500" },
  EM_ANALISE: { label: "Em análise", cls: "bg-yellow-100 text-yellow-700" },
  APROVADA: { label: "Aprovada", cls: "bg-green-100 text-green-700" },
  REPROVADA: { label: "Reprovada", cls: "bg-red-100 text-red-700" },
  CANCELADA: { label: "Cancelada", cls: "bg-gray-100 text-gray-400" },
};

function usuarioLogado(): { id?: string; nome?: string } {
  try {
    const u = localStorage.getItem("usuario");
    if (u) {
      const parsed = JSON.parse(u);
      return { id: parsed.id, nome: parsed.nome || parsed.email };
    }
    const o = localStorage.getItem("orgao");
    if (o) {
      const parsed = JSON.parse(o);
      return { id: parsed.id, nome: parsed.nome };
    }
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Painel de aprovação multi-etapa de um documento da fase interna (estilo SEI).
 * Mostra a trilha de etapas; permite submeter o documento ao fluxo e
 * aprovar/reprovar a etapa em análise.
 */
export function AprovacaoEtapasPanel({
  documentoId,
  statusDocumento,
  onMudou,
}: {
  documentoId: string;
  /** Status atual do documento (EM_ELABORACAO, AGUARDANDO_APROVACAO, APROVADO…) */
  statusDocumento?: string;
  /** Callback após submeter/aprovar/reprovar (para o pai recarregar o documento) */
  onMudou?: () => void;
}) {
  const [etapas, setEtapas] = useState<EtapaAprovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reprovando, setReprovando] = useState<EtapaAprovacao | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `${API_URL}/api/fase-interna/documento/${documentoId}/etapas-aprovacao`,
      );
      if (res.ok) setEtapas(await res.json());
    } catch {
      /* mantém estado anterior */
    } finally {
      setLoading(false);
    }
  }, [documentoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Só a rodada mais recente (etapas criadas na mesma submissão — tolerância
  // de 5s para diferenças de milissegundos). Backend retorna created_at DESC.
  const rodadaAtual = (() => {
    if (!etapas.length) return [];
    const referencia = new Date(etapas[0].created_at).getTime();
    return etapas
      .filter(
        (e) => Math.abs(new Date(e.created_at).getTime() - referencia) < 5000,
      )
      .sort((a, b) => a.ordem - b.ordem);
  })();

  const emAnalise = rodadaAtual.find((e) => e.status === "EM_ANALISE");
  const podeSubmeter =
    !statusDocumento ||
    ["EM_ELABORACAO", "PENDENTE", "REPROVADO"].includes(statusDocumento);

  const chamar = async (url: string, body: Record<string, unknown>) => {
    setAgindo(true);
    setErro(null);
    try {
      const res = await authFetch(url, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Operação não permitida");
      }
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro na operação");
    } finally {
      setAgindo(false);
    }
  };

  const submeter = () => {
    const u = usuarioLogado();
    return chamar(
      `${API_URL}/api/fase-interna/documento/${documentoId}/submeter-fluxo`,
      { usuarioId: u.id, usuarioNome: u.nome },
    );
  };

  const aprovar = (etapa: EtapaAprovacao) => {
    const u = usuarioLogado();
    return chamar(
      `${API_URL}/api/fase-interna/aprovacoes/etapa/${etapa.id}/aprovar`,
      { usuarioId: u.id, usuarioNome: u.nome },
    );
  };

  const reprovar = async () => {
    if (!reprovando || !justificativa.trim()) return;
    const u = usuarioLogado();
    await chamar(
      `${API_URL}/api/fase-interna/aprovacoes/etapa/${reprovando.id}/reprovar`,
      { usuarioId: u.id, usuarioNome: u.nome, justificativa: justificativa.trim() },
    );
    setReprovando(null);
    setJustificativa("");
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1351b4]" />
            Aprovação do documento
          </CardTitle>
          {podeSubmeter && (
            <Button
              size="sm"
              className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5"
              disabled={agindo}
              onClick={submeter}
            >
              {agindo ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <SendHorizonal className="w-3.5 h-3.5" />
              )}
              Submeter para aprovação
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rodadaAtual.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">
            Documento ainda não submetido. As etapas do fluxo de aprovação do
            órgão aparecerão aqui.
          </p>
        ) : (
          <ol className="space-y-3">
            {rodadaAtual.map((etapa) => {
              const badge = STATUS_ETAPA[etapa.status];
              return (
                <li
                  key={etapa.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50"
                >
                  <div className="w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
                    {etapa.status === "APROVADA" ? (
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      etapa.ordem
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {etapa.nome}
                      </span>
                      <Badge className={`${badge.cls} border-0 text-[10px]`}>
                        {badge.label}
                      </Badge>
                      {etapa.exige_assinatura && (
                        <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px] gap-1">
                          <PenLine className="w-2.5 h-2.5" />
                          Exige assinatura
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {etapa.setor_nome || etapa.usuario_nome
                        ? `Responsável: ${[etapa.setor_nome, etapa.usuario_nome].filter(Boolean).join(" · ")}`
                        : "Qualquer aprovador"}
                      {etapa.data_decisao &&
                        ` · ${etapa.status === "APROVADA" ? "Aprovada" : "Decidida"} por ${etapa.decidido_por_nome || "—"} em ${formatarDataHoraBR(etapa.data_decisao)}`}
                    </p>
                    {etapa.justificativa && (
                      <p className="text-xs text-gray-600 mt-1 italic">
                        “{etapa.justificativa}”
                      </p>
                    )}
                    {etapa.status === "EM_ANALISE" && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-[#168821] hover:bg-[#0f6a19] text-white"
                          disabled={agindo}
                          onClick={() => aprovar(etapa)}
                        >
                          <CircleCheck className="w-3 h-3" />
                          Aprovar etapa
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          disabled={agindo}
                          onClick={() => setReprovando(etapa)}
                        >
                          <CircleX className="w-3 h-3" />
                          Reprovar
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {emAnalise && (
          <p className="text-[11px] text-gray-400 mt-3">
            Etapa atual: <strong>{emAnalise.nome}</strong>. As demais aguardam a
            conclusão desta.
          </p>
        )}
        {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
      </CardContent>

      {/* Dialog: reprovar */}
      <Dialog open={!!reprovando} onOpenChange={(v) => !v && setReprovando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar etapa</DialogTitle>
            <DialogDescription>
              O documento voltará ao status Reprovado e o elaborador poderá
              corrigi-lo e submeter novamente.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Justificativa *</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReprovando(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!justificativa.trim() || agindo}
              onClick={reprovar}
            >
              Reprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
