"use client";

import { useCallback, useEffect, useState } from "react";
import { Gavel, Loader2, Check, X, FileText, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_URL, authFetch } from "@/lib/api";

interface Intencao {
  fornecedorId: string;
  mensagem?: string;
}
interface Participante {
  fornecedorId: string;
  razaoSocial: string;
}
interface IntencaoStatus {
  intencoes: Intencao[];
  semIntencao: Participante[];
  participantes: Participante[];
  totalIntencoes: number;
}
interface Recurso {
  id: string;
  fornecedor_id: string;
  fornecedor_nome?: string;
  status: string;
  razoes?: string;
  contrarrazoes?: Array<{ fornecedor_nome?: string; fornecedor_id: string; texto: string }>;
  decisao?: string;
  decidido_por?: string;
  motivo_recusa_intencao?: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  INTENCAO: { label: "Intenção", cls: "bg-slate-100 text-slate-600" },
  AGUARDANDO_RAZOES: { label: "Aguardando razões", cls: "bg-amber-100 text-amber-700" },
  RAZOES_APRESENTADAS: { label: "Razões apresentadas", cls: "bg-blue-100 text-blue-700" },
  CONTRARRAZOES: { label: "Contrarrazões", cls: "bg-blue-100 text-blue-700" },
  EM_ANALISE: { label: "Em análise", cls: "bg-purple-100 text-purple-700" },
  PROVIDO: { label: "Provido", cls: "bg-green-100 text-green-700" },
  IMPROVIDO: { label: "Improvido", cls: "bg-red-100 text-red-700" },
  NAO_CONHECIDO: { label: "Não conhecido", cls: "bg-red-100 text-red-600" },
};

/**
 * Painel de recursos administrativos do pregoeiro (Art. 165):
 * admite/recusa intenções, registra razões e contrarrazões e decide o recurso.
 */
export function RecursosPanel({ sessaoId }: { sessaoId: string }) {
  const [intencao, setIntencao] = useState<IntencaoStatus | null>(null);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // rascunhos por recurso
  const [razoes, setRazoes] = useState<Record<string, string>>({});
  const [contra, setContra] = useState<Record<string, string>>({});
  const [decisao, setDecisao] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    try {
      const [rInt, rRec] = await Promise.all([
        authFetch(`${API_URL}/api/sessao/${sessaoId}/recursos/intencoes`),
        authFetch(`${API_URL}/api/sessao/${sessaoId}/recursos`),
      ]);
      if (rInt.ok) setIntencao(await rInt.json());
      if (rRec.ok) setRecursos(await rRec.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [sessaoId]);

  useEffect(() => {
    carregar();
    const iv = setInterval(carregar, 6000);
    return () => clearInterval(iv);
  }, [carregar]);

  const chamar = async (key: string, url: string, body: unknown, method = "PUT") => {
    setBusy(key);
    setErro(null);
    try {
      const res = await authFetch(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.message || "Operação não permitida");
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  };

  const nomeDe = (fornecedorId: string) =>
    intencao?.participantes.find((p) => p.fornecedorId === fornecedorId)?.razaoSocial || fornecedorId;

  // Intenções ainda sem recurso formal criado
  const intencoesPendentes = (intencao?.intencoes || []).filter(
    (it) => !recursos.some((r) => r.fornecedor_id === it.fornecedorId),
  );

  return (
    <Card>
      <CardHeader className="border-b bg-slate-900 text-white">
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Recursos administrativos (Art. 165)
        </CardTitle>
        <CardDescription className="text-slate-300">
          Admita as intenções, registre razões e contrarrazões e decida.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {erro && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-520px)] pr-2">
            <div className="space-y-4">
              {/* Intenções a admitir */}
              {intencoesPendentes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Intenções a decidir ({intencoesPendentes.length})
                  </div>
                  {intencoesPendentes.map((it) => (
                    <div key={it.fornecedorId} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="font-medium text-amber-800">{nomeDe(it.fornecedorId)}</div>
                      {it.mensagem && <div className="text-xs text-slate-600 mt-0.5">{it.mensagem}</div>}
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 gap-1 bg-[#168821] hover:bg-[#0f6a19] text-xs"
                          disabled={busy === `adm-${it.fornecedorId}`}
                          onClick={() =>
                            chamar(
                              `adm-${it.fornecedorId}`,
                              `${API_URL}/api/sessao/${sessaoId}/recursos/${it.fornecedorId}/admitir`,
                              { fornecedorNome: nomeDe(it.fornecedorId), motivacao: it.mensagem },
                              "POST",
                            )
                          }
                        >
                          <Check className="h-3 w-3" /> Admitir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs text-red-600 border-red-200"
                          disabled={busy === `rec-${it.fornecedorId}`}
                          onClick={() => {
                            const motivo = prompt("Motivo da não admissão da intenção:");
                            if (motivo)
                              chamar(
                                `rec-${it.fornecedorId}`,
                                `${API_URL}/api/sessao/${sessaoId}/recursos/${it.fornecedorId}/recusar`,
                                { motivo, fornecedorNome: nomeDe(it.fornecedorId) },
                                "POST",
                              );
                          }}
                        >
                          <X className="h-3 w-3" /> Não admitir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recursos formais */}
              {recursos.map((r) => {
                const st = STATUS_LABEL[r.status] || { label: r.status, cls: "bg-slate-100" };
                return (
                  <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{r.fornecedor_nome || r.fornecedor_id}</span>
                      <Badge className={`${st.cls} border-0 text-[10px]`}>{st.label}</Badge>
                    </div>

                    {r.motivo_recusa_intencao && (
                      <div className="text-xs text-red-600">Não admitida: {r.motivo_recusa_intencao}</div>
                    )}
                    {r.razoes && (
                      <div className="rounded bg-slate-50 p-2 text-xs text-slate-700">
                        <FileText className="inline h-3 w-3 mr-1" />
                        <strong>Razões:</strong> {r.razoes}
                      </div>
                    )}
                    {r.contrarrazoes?.map((c, i) => (
                      <div key={i} className="rounded bg-blue-50 p-2 text-xs text-slate-700">
                        <strong>Contrarrazões</strong> ({c.fornecedor_nome || c.fornecedor_id}): {c.texto}
                      </div>
                    ))}
                    {r.decisao && (
                      <div className="rounded bg-slate-100 p-2 text-xs">
                        <strong>Decisão:</strong> {r.decisao}
                        {r.decidido_por && <span className="text-slate-400"> — {r.decidido_por}</span>}
                      </div>
                    )}

                    {/* Ações conforme status */}
                    {r.status === "AGUARDANDO_RAZOES" && (
                      <div className="space-y-1">
                        <Textarea
                          rows={2}
                          className="text-xs"
                          placeholder="Registrar razões apresentadas pelo recorrente…"
                          value={razoes[r.id] || ""}
                          onChange={(e) => setRazoes({ ...razoes, [r.id]: e.target.value })}
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={busy === `raz-${r.id}` || !razoes[r.id]?.trim()}
                          onClick={() =>
                            chamar(`raz-${r.id}`, `${API_URL}/api/sessao/recursos/${r.id}/razoes`, {
                              razoes: razoes[r.id],
                            })
                          }
                        >
                          Registrar razões
                        </Button>
                      </div>
                    )}

                    {r.status === "CONTRARRAZOES" && (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          className="text-xs"
                          placeholder="Registrar contrarrazões de outro licitante…"
                          value={contra[r.id] || ""}
                          onChange={(e) => setContra({ ...contra, [r.id]: e.target.value })}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={busy === `con-${r.id}` || !contra[r.id]?.trim()}
                          onClick={() => {
                            const fid = prompt("CNPJ/ID do licitante que apresenta contrarrazões:");
                            if (fid)
                              chamar(`con-${r.id}`, `${API_URL}/api/sessao/recursos/${r.id}/contrarrazoes`, {
                                fornecedorId: fid,
                                texto: contra[r.id],
                              }).then(() => setContra({ ...contra, [r.id]: "" }));
                          }}
                        >
                          Adicionar contrarrazões
                        </Button>
                        <div className="border-t pt-2">
                          <Textarea
                            rows={2}
                            className="text-xs"
                            placeholder="Fundamentação da decisão…"
                            value={decisao[r.id] || ""}
                            onChange={(e) => setDecisao({ ...decisao, [r.id]: e.target.value })}
                          />
                          <div className="mt-1 flex gap-2">
                            <Button
                              size="sm"
                              className="h-7 gap-1 bg-[#168821] hover:bg-[#0f6a19] text-xs"
                              disabled={busy === `dec-${r.id}` || !decisao[r.id]?.trim()}
                              onClick={() =>
                                chamar(`dec-${r.id}`, `${API_URL}/api/sessao/recursos/${r.id}/decidir`, {
                                  provido: true,
                                  decisao: decisao[r.id],
                                })
                              }
                            >
                              Prover
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs text-red-600 border-red-200"
                              disabled={busy === `dec-${r.id}` || !decisao[r.id]?.trim()}
                              onClick={() =>
                                chamar(`dec-${r.id}`, `${API_URL}/api/sessao/recursos/${r.id}/decidir`, {
                                  provido: false,
                                  decisao: decisao[r.id],
                                })
                              }
                            >
                              Improver
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {intencoesPendentes.length === 0 && recursos.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-400">
                  <ShieldQuestion className="h-6 w-6" />
                  Nenhuma intenção de recurso registrada.
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
