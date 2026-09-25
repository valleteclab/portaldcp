"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, Gavel, Loader2, ShieldQuestion, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { API_URL, authFetch } from "@/lib/api";
import {
  BadgeStatusRecurso,
  DetalheRecurso,
  PRESSUPOSTOS,
  PainelRecursos,
  Recurso,
  dataHoraBr,
  useContagem,
} from "./recursos-comum";

/**
 * RECURSOS — painel do AGENTE DE CONTRATAÇÃO e da AUTORIDADE SUPERIOR
 * (plano E5 — Lei 14.133/2021 art. 165; IN SEGES 73/2022 art. 40):
 *  - abre a janela de intenção (≥ 10 min) sobre o resultado da habilitação;
 *  - admite ou não admite a intenção (só por falta evidente de pressuposto);
 *  - acompanha os prazos das partes (razões e contrarrazões são enviadas
 *    pelos próprios licitantes na sala deles — o órgão só lê e baixa);
 *  - reconsidera ou mantém (fundamentado) e encaminha à autoridade superior;
 *  - autoridade superior (conta do órgão ou usuário administrador) decide.
 * Prazos vencidos do agente/autoridade aparecem sinalizados (não há decisão automática).
 */
export function RecursosPanel({ sessaoId }: { sessaoId: string }) {
  const [painel, setPainel] = useState<PainelRecursos | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [minutos, setMinutos] = useState<string>("");
  // rascunhos por recurso
  const [recusa, setRecusa] = useState<Record<string, { pressuposto: string; motivo: string }>>({});
  const [fundamento, setFundamento] = useState<Record<string, string>>({});
  const [autoridade, setAutoridade] = useState<Record<string, { nome: string; cargo: string }>>({});

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/recursos/sessao/${sessaoId}`);
      if (r.ok) setPainel(await r.json());
    } catch {
      /* ignora — próxima atualização */
    } finally {
      setLoading(false);
    }
  }, [sessaoId]);

  useEffect(() => {
    carregar();
    const iv = setInterval(carregar, 6000);
    return () => clearInterval(iv);
  }, [carregar]);

  const chamar = async (key: string, url: string, body: unknown) => {
    setBusy(key);
    setErro(null);
    try {
      const res = await authFetch(url, { method: "POST", body: JSON.stringify(body ?? {}) });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        const msg = Array.isArray(e?.message) ? e.message.join("; ") : e?.message;
        throw new Error(msg || "Operação não permitida");
      }
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const janela = painel?.janela ?? null;
  const contagem = useContagem(janela?.estado === "ABERTA" ? janela.fechaEm : null);
  const recursos = painel?.recursos ?? [];

  return (
    <Card>
      <CardHeader className="border-b bg-slate-900 text-white">
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Recursos (Art. 165)
        </CardTitle>
        <CardDescription className="text-slate-300">
          Intenção na sala pelo licitante · razões e contrarrazões pelos licitantes · reconsideração do agente · decisão da autoridade
          superior.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {loading ? (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Janela de intenção */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Intenção de recurso</div>
                  {janela?.estado === "ABERTA" ? (
                    <div className="text-sm text-amber-900">
                      Janela aberta até {dataHoraBr(janela.fechaEm)} — os licitantes manifestam pela sala deles.
                    </div>
                  ) : janela?.estado === "ENCERRADA" ? (
                    <div className="text-sm text-amber-900">
                      Janela encerrada em {dataHoraBr(janela.fechaEm)} ({janela.minutos} min) — intenções posteriores precluem.
                    </div>
                  ) : (
                    <div className="text-sm text-amber-900">
                      Abra o prazo (mínimo {painel?.prazos.minutosIntencao ?? 10} min) depois do resultado da habilitação.
                    </div>
                  )}
                </div>
                {janela?.estado === "ABERTA" && (
                  <div className="text-3xl font-bold tabular-nums text-amber-800">
                    <Clock3 className="mr-1 inline h-5 w-5" />
                    {contagem.texto}
                  </div>
                )}
              </div>
              {painel?.podeAbrirJanela ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-xs text-amber-800">Duração (min)</label>
                    <Input
                      className="h-8 w-24 bg-white"
                      type="number"
                      min={painel.prazos.minutosIntencao}
                      placeholder={String(painel.prazos.minutosIntencao)}
                      value={minutos}
                      onChange={(e) => setMinutos(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={busy === "janela"}
                    onClick={() =>
                      chamar("janela", `${API_URL}/api/recursos/sessao/${sessaoId}/janela`, minutos ? { minutos: Number(minutos) } : {})
                    }
                  >
                    Abrir prazo de intenção de recurso
                  </Button>
                </div>
              ) : (
                painel?.motivoNaoAbreJanela &&
                janela?.estado !== "ABERTA" && <div className="mt-2 text-xs text-amber-700">{painel.motivoNaoAbreJanela}</div>
              )}
            </div>

            {recursos.map((r) => (
              <CartaoRecurso
                key={r.id}
                r={r}
                busy={busy}
                recusa={recusa[r.id] ?? { pressuposto: "", motivo: "" }}
                setRecusa={(v) => setRecusa((s) => ({ ...s, [r.id]: v }))}
                fundamento={fundamento[r.id] ?? ""}
                setFundamento={(v) => setFundamento((s) => ({ ...s, [r.id]: v }))}
                autoridade={autoridade[r.id] ?? { nome: "", cargo: "" }}
                setAutoridade={(v) => setAutoridade((s) => ({ ...s, [r.id]: v }))}
                chamar={chamar}
              />
            ))}

            {recursos.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-400">
                <ShieldQuestion className="h-6 w-6" />
                Nenhuma intenção de recurso manifestada.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CartaoRecurso({
  r,
  busy,
  recusa,
  setRecusa,
  fundamento,
  setFundamento,
  autoridade,
  setAutoridade,
  chamar,
}: {
  r: Recurso;
  busy: string | null;
  recusa: { pressuposto: string; motivo: string };
  setRecusa: (v: { pressuposto: string; motivo: string }) => void;
  fundamento: string;
  setFundamento: (v: string) => void;
  autoridade: { nome: string; cargo: string };
  setAutoridade: (v: { nome: string; cargo: string }) => void;
  chamar: (key: string, url: string, body: unknown) => Promise<boolean>;
}) {
  const [recusando, setRecusando] = useState(false);
  const base = `${API_URL}/api/recursos/${r.id}`;
  const fundamentoOk = fundamento.trim().length >= 20;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-900">{r.recorrente.nome}</span>
        <BadgeStatusRecurso status={r.status} />
      </div>
      <DetalheRecurso r={r} />

      {/* Admissibilidade */}
      {r.podeAdmitir && (
        <div className="space-y-2 border-t pt-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 gap-1 bg-[#168821] text-xs hover:bg-[#0f6a19]"
              disabled={busy === `adm-${r.id}`}
              onClick={() => chamar(`adm-${r.id}`, `${base}/admitir`, {})}
            >
              <Check className="h-3 w-3" /> Admitir (abre as razões)
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 border-red-200 text-xs text-red-600" onClick={() => setRecusando((v) => !v)}>
              <X className="h-3 w-3" /> Não admitir
            </Button>
          </div>
          {recusando && (
            <div className="space-y-1 rounded bg-red-50 p-2">
              <div className="text-xs text-red-800">
                Só a falta EVIDENTE de pressuposto recursal justifica a não admissão (art. 165 §1º I).
              </div>
              <select
                className="h-8 w-full rounded border px-2 text-xs"
                value={recusa.pressuposto}
                onChange={(e) => setRecusa({ ...recusa, pressuposto: e.target.value })}
              >
                <option value="">Pressuposto ausente…</option>
                {PRESSUPOSTOS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
              <Textarea
                rows={2}
                className="bg-white text-xs"
                placeholder="Fundamentação (mín. 20 caracteres)"
                value={recusa.motivo}
                onChange={(e) => setRecusa({ ...recusa, motivo: e.target.value })}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-red-300 text-xs text-red-700"
                disabled={busy === `rec-${r.id}` || !recusa.pressuposto || recusa.motivo.trim().length < 20}
                onClick={() => chamar(`rec-${r.id}`, `${base}/recusar`, recusa).then((ok) => ok && setRecusando(false))}
              >
                Confirmar não admissão
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Prazos das partes em curso */}
      {(r.status === "AGUARDANDO_RAZOES" || r.status === "CONTRARRAZOES") && (
        <div className="border-t pt-2 text-xs text-slate-500">
          {r.status === "AGUARDANDO_RAZOES"
            ? "Aguardando as razões do recorrente (enviadas por ele na sala)."
            : "Prazo de contrarrazões dos demais licitantes em curso. A decisão só é possível depois dele."}
        </div>
      )}

      {/* Reconsideração pelo agente (art. 165 §2º) */}
      {r.podeReconsiderar && (
        <div className="space-y-1 border-t pt-2">
          <div className="text-xs font-semibold text-slate-600">Juízo de reconsideração (até {dataHoraBr(r.prazoReconsideracao)})</div>
          <Textarea
            rows={3}
            className="text-xs"
            placeholder="Fundamentação (mín. 20 caracteres)"
            value={fundamento}
            onChange={(e) => setFundamento(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-7 bg-[#168821] text-xs hover:bg-[#0f6a19]"
              disabled={busy === `rcs-${r.id}` || !fundamentoOk}
              onClick={() =>
                chamar(`rcs-${r.id}`, `${base}/reconsiderar`, { reconsiderar: true, fundamentacao: fundamento }).then(
                  (ok) => ok && setFundamento(""),
                )
              }
            >
              Reconsiderar (dar provimento)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy === `rcs-${r.id}` || !fundamentoOk}
              onClick={() =>
                chamar(`rcs-${r.id}`, `${base}/reconsiderar`, { reconsiderar: false, fundamentacao: fundamento }).then(
                  (ok) => ok && setFundamento(""),
                )
              }
            >
              Manter e encaminhar à autoridade superior
            </Button>
          </div>
        </div>
      )}

      {/* Decisão da autoridade superior (art. 165 §2º) */}
      {r.podeDecidirAutoridade && (
        <div className="space-y-1 rounded border border-indigo-200 bg-indigo-50 p-2">
          <div className="text-xs font-semibold text-indigo-800">
            Decisão da autoridade superior (até {dataHoraBr(r.prazoDecisaoAutoridade)})
          </div>
          <div className="text-[11px] text-indigo-700">
            Ato da autoridade superior: conta do órgão (informe nome e cargo) ou usuário administrador do órgão — nunca quem manteve a
            decisão.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              className="h-8 bg-white text-xs"
              placeholder="Nome da autoridade"
              value={autoridade.nome}
              onChange={(e) => setAutoridade({ ...autoridade, nome: e.target.value })}
            />
            <Input
              className="h-8 bg-white text-xs"
              placeholder="Cargo"
              value={autoridade.cargo}
              onChange={(e) => setAutoridade({ ...autoridade, cargo: e.target.value })}
            />
          </div>
          <Textarea
            rows={3}
            className="bg-white text-xs"
            placeholder="Fundamentação da decisão (mín. 20 caracteres)"
            value={fundamento}
            onChange={(e) => setFundamento(e.target.value)}
          />
          <div className="flex gap-2">
            {[true, false].map((provido) => (
              <Button
                key={String(provido)}
                size="sm"
                variant={provido ? "default" : "outline"}
                className={`h-7 text-xs ${provido ? "bg-[#168821] hover:bg-[#0f6a19]" : "border-red-200 text-red-600"}`}
                disabled={busy === `aut-${r.id}` || !fundamentoOk || !autoridade.cargo.trim()}
                onClick={() =>
                  chamar(`aut-${r.id}`, `${base}/decisao-autoridade`, {
                    provido,
                    fundamentacao: fundamento,
                    nome: autoridade.nome || undefined,
                    cargo: autoridade.cargo,
                  })
                }
              >
                {provido ? "Dar provimento" : "Negar provimento"}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
