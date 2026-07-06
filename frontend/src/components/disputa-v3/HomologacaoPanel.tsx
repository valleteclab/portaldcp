"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL, authFetch } from "@/lib/api";

interface ItemAdj {
  itemId: string;
  numero: number;
  descricao: string;
  vencedor?: { razaoSocial: string; cpfCnpj: string; valor: number } | null;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Painel de homologação (Art. 71): ato final da autoridade competente que
 * confirma o resultado adjudicado e encerra a sessão.
 */
export function HomologacaoPanel({ sessaoId }: { sessaoId: string }) {
  const [itens, setItens] = useState<ItemAdj[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [homologado, setHomologado] = useState<{ totalHomologado: number; valorTotal: number } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/adjudicacao`);
      if (res.ok) {
        const data = await res.json();
        setItens(data.itens || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [sessaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const homologar = async () => {
    setBusy(true);
    setErro(null);
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/homologar`, {
        method: "PUT",
        body: JSON.stringify({ nome, cargo }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.message || "Erro ao homologar");
      }
      setHomologado(await res.json());
      setDialog(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const valorTotal = itens.reduce((s, i) => s + (i.vencedor?.valor || 0), 0);

  return (
    <Card>
      <CardHeader className="border-b bg-emerald-900 text-white">
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4" />
          Homologação (Art. 71)
        </CardTitle>
        <CardDescription className="text-emerald-100">
          Ato final da autoridade competente. Confirma o resultado e encerra a sessão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}
        {homologado ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <BadgeCheck className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
            <div className="font-semibold text-emerald-800">Resultado homologado</div>
            <div className="text-sm text-emerald-700">
              {homologado.totalHomologado} item(ns) · {fmt(homologado.valorTotal)}
            </div>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-8 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <ScrollArea className="h-[calc(100vh-580px)] pr-1">
              <div className="space-y-3">
                {itens.map((item) => (
                  <div key={item.itemId} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Item {item.numero}
                    </div>
                    <div className="font-medium text-slate-900">{item.descricao}</div>
                    {item.vencedor ? (
                      <>
                        <div className="mt-1 text-sm font-semibold text-emerald-700">{fmt(item.vencedor.valor)}</div>
                        <div className="text-sm text-slate-600">{item.vencedor.razaoSocial}</div>
                      </>
                    ) : (
                      <div className="mt-1 text-sm text-slate-400">Sem vencedor</div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">Valor total</span>
              <span className="font-semibold text-slate-900">{fmt(valorTotal)}</span>
            </div>
            <Button
              className="w-full bg-emerald-700 hover:bg-emerald-800"
              onClick={() => setDialog(true)}
              disabled={!itens.some((i) => i.vencedor)}
            >
              <BadgeCheck className="mr-2 h-4 w-4" />
              Homologar resultado
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Homologar resultado</DialogTitle>
            <DialogDescription>
              Identifique a autoridade competente. A homologação é irreversível e encerra a sessão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da autoridade</Label>
              <Input className="mt-1" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input className="mt-1" value={cargo} onChange={(e) => setCargo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancelar
            </Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" disabled={busy} onClick={homologar}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Confirmar homologação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
