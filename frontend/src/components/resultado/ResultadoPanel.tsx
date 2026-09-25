"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, Gavel, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL, authFetch } from "@/lib/api";

interface ItemResultado {
  itemId: string;
  numero: number;
  descricao: string;
  quantidade: number;
  unidadeMedida: string | null;
  status: string;
  valorUnitario: number | null;
  valorTotal: number | null;
  gravado: boolean;
}

interface UnidadeResultado {
  tipo: "ITEM" | "LOTE";
  unidadeId: string;
  numero: number;
  descricao: string;
  situacao: "DESERTA" | "SEM_RESULTADO" | "HOMOLOGADA" | "ADJUDICADA" | "A_ADJUDICAR" | "PENDENTE";
  vencedor: { fornecedorId: string; razaoSocial: string; cpfCnpj: string } | null;
  valorTotal: number;
  itens: ItemResultado[];
}

interface AtoResultado {
  disponivel: boolean;
  pendencias: string[];
}

interface PainelResultado {
  licitacao: {
    id: string;
    fase: string;
    srp: boolean;
    valor_homologado: number | null;
    data_homologacao: string | null;
    autoridade_homologacao: { nome: string; cargo: string | null } | null;
  };
  adjudicaPelaSala: boolean;
  unidades: UnidadeResultado[];
  valorAdjudicado: number;
  valorPrevia: number | null;
  atos: { adjudicar: AtoResultado | null; homologar: AtoResultado | null };
  autoridade: { nome: string; cargo: string } | null;
  instrumentos: {
    tipo: "ATA" | "CONTRATO";
    contratos: Array<{ id: string; numero_contrato: string; fornecedor_razao_social: string; valor_global: number; status: string; data_assinatura: string | null; prazo_execucao_dias: number | null }>;
    atas: Array<{ id: string; numero_ata: string; fornecedor_razao_social: string; valor_total: number; status: string }>;
  };
}

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO_SITUACAO: Record<UnidadeResultado["situacao"], { texto: string; cor: string }> = {
  HOMOLOGADA: { texto: "Homologada", cor: "bg-emerald-100 text-emerald-800" },
  ADJUDICADA: { texto: "Adjudicada", cor: "bg-blue-100 text-blue-800" },
  A_ADJUDICAR: { texto: "A adjudicar", cor: "bg-amber-100 text-amber-800" },
  PENDENTE: { texto: "Pendente", cor: "bg-slate-100 text-slate-700" },
  DESERTA: { texto: "Deserta", cor: "bg-slate-100 text-slate-500" },
  SEM_RESULTADO: { texto: "Fracassada/cancelada", cor: "bg-slate-100 text-slate-500" },
};

/**
 * RESULTADO (plano E6 — Lei 14.133/2021 art. 71): um só painel para o órgão,
 * na sala e no cockpit. "Adjudicar" grava o vencedor HABILITADO de cada
 * unidade com os valores da proposta adequada aceita; "Homologar" é da
 * autoridade (identificada pelo login) e o valor é a SOMA calculada pelo
 * backend — não há campo de valor nem de nome/cargo na tela.
 */
export function ResultadoPanel({ licitacaoId, onAtualizado }: { licitacaoId: string; onAtualizado?: () => void }) {
  const [painel, setPainel] = useState<PainelResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<"adjudicar" | "homologar" | null>(null);
  const [executando, setExecutando] = useState(false);
  const [avisoInstrumento, setAvisoInstrumento] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/resultado/licitacao/${licitacaoId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      setPainel(j);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o resultado");
    } finally {
      setCarregando(false);
    }
  }, [licitacaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (ato: "adjudicar" | "homologar") => {
    setExecutando(true);
    setErro(null);
    setAvisoInstrumento(null);
    try {
      const res = await authFetch(`${API_URL}/api/resultado/licitacao/${licitacaoId}/${ato}`, { method: "POST", body: "{}" });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const pend = Array.isArray(j?.pendencias) ? `: ${j.pendencias.join(" | ")}` : "";
        throw new Error((j?.message || `HTTP ${res.status}`) + (j?.message?.includes("Pendências") ? "" : pend));
      }
      if (ato === "homologar" && j?.instrumentos?.erro) setAvisoInstrumento(j.instrumentos.erro);
      setDialogo(null);
      await carregar();
      onAtualizado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setExecutando(false);
    }
  };

  const gerarInstrumentos = async () => {
    setExecutando(true);
    setErro(null);
    try {
      const res = await authFetch(`${API_URL}/api/resultado/licitacao/${licitacaoId}/instrumentos`, { method: "POST", body: "{}" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      setAvisoInstrumento(null);
      await carregar();
      onAtualizado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setExecutando(false);
    }
  };

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }
  if (!painel) {
    return erro ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div> : null;
  }

  const { atos } = painel;
  const homologada = painel.licitacao.fase === "HOMOLOGACAO" || !!painel.licitacao.data_homologacao;
  const total = homologada && painel.licitacao.valor_homologado != null
    ? painel.licitacao.valor_homologado
    : painel.valorAdjudicado > 0
      ? painel.valorAdjudicado
      : painel.valorPrevia ?? 0;
  const semInstrumento = homologada && painel.instrumentos.contratos.length === 0 && painel.instrumentos.atas.length === 0;

  return (
    <Card>
      <CardHeader className="border-b bg-slate-900 text-white">
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Resultado — adjudicação e homologação (art. 71)
        </CardTitle>
        <CardDescription className="text-slate-300">
          Vencedor habilitado de cada unidade com os valores da proposta adequada aceita. O valor homologado é a soma calculada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {avisoInstrumento && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Homologação registrada, mas o {painel.licitacao.srp ? "a ata de registro de preços" : "contrato"} não foi gerado: {avisoInstrumento}
          </div>
        )}

        <div className="space-y-2">
          {painel.unidades.map((u) => (
            <div key={u.unidadeId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {u.tipo === "LOTE" ? "Lote" : "Item"} {u.numero}
                </div>
                <Badge variant="outline" className={ROTULO_SITUACAO[u.situacao].cor}>
                  {ROTULO_SITUACAO[u.situacao].texto}
                </Badge>
              </div>
              <div className="font-medium text-slate-900">{u.descricao}</div>
              {u.vencedor ? (
                <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">
                    {u.vencedor.razaoSocial} <span className="text-xs text-slate-400">{u.vencedor.cpfCnpj}</span>
                  </span>
                  <span className="font-semibold text-emerald-700">{fmt(u.valorTotal)}</span>
                </div>
              ) : (
                <div className="mt-1 text-sm text-slate-400">Sem vencedor habilitado</div>
              )}
              {u.tipo === "LOTE" && u.vencedor && (
                <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-slate-600">
                  {u.itens.map((i) => (
                    <div key={i.itemId} className="flex justify-between gap-2">
                      <span>
                        Item {i.numero} — {i.quantidade} × {fmt(i.valorUnitario)}
                      </span>
                      <span>{fmt(i.valorTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">{homologada ? "Valor homologado" : painel.valorAdjudicado > 0 ? "Valor adjudicado" : "Valor a adjudicar"}</span>
          <span className="font-semibold text-slate-900">{fmt(total)}</span>
        </div>
        {painel.licitacao.autoridade_homologacao && (
          <div className="text-xs text-slate-500">
            Homologado por {painel.licitacao.autoridade_homologacao.nome}
            {painel.licitacao.autoridade_homologacao.cargo ? ` (${painel.licitacao.autoridade_homologacao.cargo})` : ""}
            {painel.licitacao.data_homologacao ? ` em ${new Date(painel.licitacao.data_homologacao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
          </div>
        )}

        {atos.adjudicar && !homologada && (
          <div className="space-y-1">
            <Button className="w-full" onClick={() => setDialogo("adjudicar")} disabled={executando || !atos.adjudicar.disponivel}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Adjudicar
            </Button>
            {!atos.adjudicar.disponivel && atos.adjudicar.pendencias.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-amber-700">
                {atos.adjudicar.pendencias.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </div>
        )}

        {atos.homologar && !homologada && (
          <div className="space-y-1">
            <Button className="w-full bg-emerald-700 hover:bg-emerald-800" onClick={() => setDialogo("homologar")} disabled={executando || !atos.homologar.disponivel}>
              <BadgeCheck className="mr-2 h-4 w-4" />
              Homologar
            </Button>
            {!atos.homologar.disponivel && atos.homologar.pendencias.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-amber-700">
                {atos.homologar.pendencias.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </div>
        )}

        {semInstrumento && (
          <Button variant="outline" className="w-full" onClick={gerarInstrumentos} disabled={executando}>
            {executando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {painel.licitacao.srp ? "Gerar ata de registro de preços" : "Gerar contrato(s)"}
          </Button>
        )}

        {homologada && (painel.instrumentos.contratos.length > 0 || painel.instrumentos.atas.length > 0) && (
          <div className="space-y-1 text-sm">
            {painel.instrumentos.contratos.map((c) => (
              <div key={c.id} className="flex justify-between gap-2 rounded border px-2 py-1">
                <span>
                  Contrato {c.numero_contrato} — {c.fornecedor_razao_social}
                </span>
                <span className="text-slate-500">
                  {fmt(c.valor_global)} · {c.status === "AGUARDANDO_ASSINATURA" ? "aguardando assinaturas" : c.status}
                </span>
              </div>
            ))}
            {painel.instrumentos.atas.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 rounded border px-2 py-1">
                <span>
                  Ata {a.numero_ata} — {a.fornecedor_razao_social}
                </span>
                <span className="text-slate-500">{fmt(a.valor_total)} · {a.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogo !== null} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogo === "homologar" ? "Homologar o resultado" : "Adjudicar o objeto"}</DialogTitle>
            <DialogDescription>
              {dialogo === "homologar"
                ? `Ato da autoridade competente (art. 71 IV). ${painel.licitacao.srp ? "Será gerada a ata de registro de preços." : "Será gerado um contrato por vencedor, aguardando as assinaturas."}`
                : "Cada unidade será adjudicada ao licitante habilitado, pelos valores da proposta adequada aceita (art. 71 IV; IN SEGES 73/2022, art. 29)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {painel.unidades
              .filter((u) => u.vencedor)
              .map((u) => (
                <div key={u.unidadeId} className="flex justify-between gap-2 rounded border bg-slate-50 px-3 py-2">
                  <span>
                    {u.tipo === "LOTE" ? "Lote" : "Item"} {u.numero} — {u.vencedor?.razaoSocial}
                  </span>
                  <span className="font-medium text-emerald-700">{fmt(u.valorTotal)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total {dialogo === "homologar" ? "a homologar" : "a adjudicar"}</span>
              <span>{fmt(dialogo === "homologar" ? painel.valorAdjudicado : painel.valorPrevia ?? painel.valorAdjudicado)}</span>
            </div>
            {dialogo === "homologar" && painel.autoridade && (
              <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                Autoridade: <b>{painel.autoridade.nome}</b> — {painel.autoridade.cargo}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={executando}>
              Cancelar
            </Button>
            <Button
              className={dialogo === "homologar" ? "bg-emerald-700 hover:bg-emerald-800" : undefined}
              disabled={executando}
              onClick={() => dialogo && executar(dialogo)}
            >
              {executando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {dialogo === "homologar" ? "Confirmar homologação" : "Confirmar adjudicação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
