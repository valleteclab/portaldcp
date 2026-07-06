"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CornerUpLeft,
  Loader2,
  Send,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_URL, authFetch, formatarDataHoraBR } from "@/lib/api";

interface Setor {
  id: string;
  codigo: string;
  nome: string;
}

export interface Tramitacao {
  id: string;
  sequencia: number;
  de_setor_nome?: string;
  de_usuario_nome?: string;
  para_setor_nome: string;
  para_usuario_nome?: string;
  despacho: string;
  prazo_dias?: number;
  data_prazo?: string;
  status: "PENDENTE" | "RECEBIDA" | "DEVOLVIDA" | "CONCLUIDA";
  data_envio: string;
  data_recebimento?: string;
  recebido_por_nome?: string;
  motivo_devolucao?: string;
}

const STATUS_BADGE: Record<Tramitacao["status"], { label: string; cls: string }> = {
  PENDENTE: { label: "Aguardando recebimento", cls: "bg-yellow-100 text-yellow-700" },
  RECEBIDA: { label: "Recebida", cls: "bg-blue-100 text-[#1351b4]" },
  DEVOLVIDA: { label: "Devolvida", cls: "bg-red-100 text-red-700" },
  CONCLUIDA: { label: "Concluída", cls: "bg-gray-100 text-gray-600" },
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
 * Tramitação do processo entre setores (estilo SEI):
 * timeline de despachos + encaminhar/receber/devolver.
 */
export function TramitacaoProcessoCard({
  licitacaoId,
  abrirEncaminharExterno,
  onEncaminharFechado,
}: {
  licitacaoId: string;
  /** Quando true, abre o dialog de encaminhamento (controlado pelo pai). */
  abrirEncaminharExterno?: boolean;
  onEncaminharFechado?: () => void;
}) {
  const [tramitacoes, setTramitacoes] = useState<Tramitacao[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Form de encaminhamento
  const [setorDestino, setSetorDestino] = useState("");
  const [despacho, setDespacho] = useState("");
  const [prazoDias, setPrazoDias] = useState("");

  // Devolução
  const [devolvendoId, setDevolvendoId] = useState<string | null>(null);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      let orgaoId: string | undefined;
      try {
        orgaoId = JSON.parse(localStorage.getItem("orgao") || "{}")?.id;
      } catch {
        /* ignore */
      }
      const [resTram, resSetores] = await Promise.all([
        authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/tramitacoes`),
        orgaoId
          ? authFetch(`${API_URL}/api/orgaos/${orgaoId}/setores`)
          : Promise.resolve(null),
      ]);
      if (resTram.ok) setTramitacoes(await resTram.json());
      if (resSetores?.ok) {
        const data = await resSetores.json();
        setSetores(Array.isArray(data) ? data : data?.setores || []);
      }
    } catch {
      /* mantém estado anterior */
    } finally {
      setLoading(false);
    }
  }, [licitacaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (abrirEncaminharExterno) setDialogAberto(true);
  }, [abrirEncaminharExterno]);

  const fecharDialog = () => {
    setDialogAberto(false);
    setErro(null);
    onEncaminharFechado?.();
  };

  const tramitar = async () => {
    if (!setorDestino || !despacho.trim()) {
      setErro("Selecione o setor de destino e escreva o despacho.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const usuario = usuarioLogado();
    try {
      const res = await authFetch(
        `${API_URL}/api/fase-interna/${licitacaoId}/tramitar`,
        {
          method: "POST",
          body: JSON.stringify({
            para_setor_id: setorDestino,
            despacho: despacho.trim(),
            prazo_dias: prazoDias ? parseInt(prazoDias, 10) : undefined,
            usuarioId: usuario.id,
            usuarioNome: usuario.nome,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Falha ao tramitar o processo");
      }
      setSetorDestino("");
      setDespacho("");
      setPrazoDias("");
      fecharDialog();
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao tramitar");
    } finally {
      setEnviando(false);
    }
  };

  const receber = async (tramitacaoId: string) => {
    const usuario = usuarioLogado();
    const res = await authFetch(
      `${API_URL}/api/fase-interna/tramitacoes/${tramitacaoId}/receber`,
      {
        method: "PUT",
        body: JSON.stringify({ usuarioId: usuario.id, usuarioNome: usuario.nome }),
      },
    );
    if (res.ok) await carregar();
  };

  const devolver = async () => {
    if (!devolvendoId || !motivoDevolucao.trim()) return;
    const usuario = usuarioLogado();
    const res = await authFetch(
      `${API_URL}/api/fase-interna/tramitacoes/${devolvendoId}/devolver`,
      {
        method: "PUT",
        body: JSON.stringify({
          motivo: motivoDevolucao.trim(),
          usuarioId: usuario.id,
          usuarioNome: usuario.nome,
        }),
      },
    );
    if (res.ok) {
      setDevolvendoId(null);
      setMotivoDevolucao("");
      await carregar();
    }
  };

  const atual = tramitacoes.length
    ? tramitacoes[tramitacoes.length - 1]
    : null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#1351b4]" />
            Tramitação do processo
          </CardTitle>
          <Button
            size="sm"
            className="bg-[#1351b4] hover:bg-[#0c326f] text-white gap-1.5"
            onClick={() => setDialogAberto(true)}
          >
            <Send className="w-3.5 h-3.5" />
            Encaminhar
          </Button>
        </div>
        {atual && (
          <p className="text-xs text-gray-500 mt-1">
            Processo atualmente em: <strong>{atual.para_setor_nome}</strong>
            {atual.para_usuario_nome ? ` (${atual.para_usuario_nome})` : ""}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : tramitacoes.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            O processo ainda não foi tramitado. Use &quot;Encaminhar&quot; para
            enviá-lo a um setor com despacho.
          </p>
        ) : (
          <ol className="relative border-l border-gray-200 ml-3 space-y-5">
            {[...tramitacoes].reverse().map((t) => {
              const badge = STATUS_BADGE[t.status];
              return (
                <li key={t.id} className="ml-5">
                  <span className="absolute -left-[9px] mt-1 w-4 h-4 rounded-full bg-white border-2 border-[#1351b4] flex items-center justify-center">
                    {t.status === "RECEBIDA" || t.status === "CONCLUIDA" ? (
                      <Check className="w-2.5 h-2.5 text-[#1351b4]" />
                    ) : t.status === "PENDENTE" ? (
                      <Clock className="w-2.5 h-2.5 text-yellow-600" />
                    ) : (
                      <CornerUpLeft className="w-2.5 h-2.5 text-red-600" />
                    )}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {t.de_setor_nome || t.de_usuario_nome || "Origem"}
                    </span>
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-900">
                      {t.para_setor_nome}
                      {t.para_usuario_nome ? ` · ${t.para_usuario_nome}` : ""}
                    </span>
                    <Badge className={`${badge.cls} border-0 text-[10px]`}>
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                    {t.despacho}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Enviado em {formatarDataHoraBR(t.data_envio)}
                    {t.data_recebimento &&
                      ` · Recebido em ${formatarDataHoraBR(t.data_recebimento)}${t.recebido_por_nome ? ` por ${t.recebido_por_nome}` : ""}`}
                    {t.data_prazo && ` · Prazo: ${formatarDataHoraBR(t.data_prazo)}`}
                  </p>
                  {t.motivo_devolucao && (
                    <p className="text-[11px] text-red-600 mt-0.5">
                      Motivo da devolução: {t.motivo_devolucao}
                    </p>
                  )}
                  {t.status === "PENDENTE" && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => receber(t.id)}
                      >
                        <Check className="w-3 h-3" />
                        Confirmar recebimento
                      </Button>
                      {t.de_setor_nome && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setDevolvendoId(t.id)}
                        >
                          <CornerUpLeft className="w-3 h-3" />
                          Devolver
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>

      {/* Dialog: encaminhar */}
      <Dialog open={dialogAberto} onOpenChange={(v) => !v && fecharDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encaminhar processo</DialogTitle>
            <DialogDescription>
              O despacho é obrigatório e fica registrado no histórico do processo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Setor de destino</Label>
              <Select value={setorDestino} onValueChange={setSetorDestino}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o setor…" />
                </SelectTrigger>
                <SelectContent>
                  {setores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.codigo ? `${s.codigo} — ` : ""}
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {setores.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Nenhum setor cadastrado. Cadastre em Configurações → Setores.
                </p>
              )}
            </div>
            <div>
              <Label>Despacho *</Label>
              <Textarea
                className="mt-1"
                rows={4}
                placeholder="Ex.: Encaminho para análise e elaboração do parecer jurídico, nos termos do Art. 53 da Lei 14.133/2021."
                value={despacho}
                onChange={(e) => setDespacho(e.target.value)}
              />
            </div>
            <div>
              <Label>Prazo (dias, opcional)</Label>
              <Input
                type="number"
                min={1}
                className="mt-1 w-32"
                value={prazoDias}
                onChange={(e) => setPrazoDias(e.target.value)}
              />
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharDialog}>
              Cancelar
            </Button>
            <Button
              className="bg-[#1351b4] hover:bg-[#0c326f] text-white"
              disabled={enviando}
              onClick={tramitar}
            >
              {enviando && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Encaminhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: devolver */}
      <Dialog
        open={!!devolvendoId}
        onOpenChange={(v) => !v && setDevolvendoId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver processo</DialogTitle>
            <DialogDescription>
              O processo retornará ao setor de origem com o motivo registrado.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo da devolução *</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={motivoDevolucao}
              onChange={(e) => setMotivoDevolucao(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevolvendoId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!motivoDevolucao.trim()}
              onClick={devolver}
            >
              Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
