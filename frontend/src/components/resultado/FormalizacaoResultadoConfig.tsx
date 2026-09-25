"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { API_URL, authFetch } from "@/lib/api";

type Modo = "REGISTRO_DIRETO" | "ASSINATURA_ELETRONICA" | "TERMO_EXTERNO";

interface Autoridade {
  id?: string;
  nome: string;
  cargo: string;
  cpf?: string | null;
  email?: string | null;
  ato_delegacao_numero?: string | null;
  ato_delegacao_data?: string | null;
  padrao?: boolean;
}

interface Configuracao {
  modo: Modo;
  modos: Array<{ valor: Modo; rotulo: string }>;
  autoridades: Autoridade[];
}

const DESCRICAO_MODO: Record<Modo, string> = {
  REGISTRO_DIRETO:
    "O agente de contratação registra a adjudicação/homologação e o efeito é imediato; o termo é gerado com os dados da autoridade escolhida.",
  ASSINATURA_ELETRONICA:
    "O ato fica pendente até a autoridade assinar o termo no assinador (link por e-mail com CPF + código, ou Portal de Assinaturas). Exige e-mail da autoridade.",
  TERMO_EXTERNO:
    "O agente anexa o termo assinado pela autoridade ou a publicação no Diário Oficial; o efeito acontece com o envio do arquivo.",
};

const VAZIA: Autoridade = { nome: "", cargo: "", cpf: "", email: "", ato_delegacao_numero: "", ato_delegacao_data: "", padrao: false };

/** Data `date` (AAAA-MM-DD) exibida sem deslocar o dia (UTC-3). */
const fmtData = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

/**
 * FORMALIZAÇÃO DO RESULTADO (Lei 14.133/2021 art. 71 IV): autoridades
 * competentes do órgão (uma padrão) e o modo de formalização da adjudicação e
 * da homologação. Alteração: conta do órgão ou ADMIN do órgão.
 */
export function FormalizacaoResultadoConfig() {
  const [cfg, setCfg] = useState<Configuracao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<Autoridade | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await authFetch(`${API_URL}/api/resultado/configuracao`);
      if (res.ok) setCfg(await res.json());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const erroDe = async (res: Response) => {
    const j = await res.json().catch(() => null);
    return Array.isArray(j?.message) ? j.message.join("; ") : j?.message || `HTTP ${res.status}`;
  };

  const definirModo = async (modo: Modo) => {
    setSalvando(true);
    try {
      const res = await authFetch(`${API_URL}/api/resultado/configuracao/modo`, { method: "PUT", body: JSON.stringify({ modo }) });
      if (!res.ok) throw new Error(await erroDe(res));
      setCfg(await res.json());
      toast.success("Modo de formalização salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const salvarAutoridade = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      const corpo = {
        nome: editando.nome,
        cargo: editando.cargo,
        cpf: editando.cpf || null,
        email: editando.email || null,
        ato_delegacao_numero: editando.ato_delegacao_numero || null,
        ato_delegacao_data: editando.ato_delegacao_data || null,
        padrao: !!editando.padrao,
      };
      const res = await authFetch(
        editando.id ? `${API_URL}/api/resultado/configuracao/autoridades/${editando.id}` : `${API_URL}/api/resultado/configuracao/autoridades`,
        { method: editando.id ? "PUT" : "POST", body: JSON.stringify(corpo) },
      );
      if (!res.ok) throw new Error(await erroDe(res));
      setEditando(null);
      await carregar();
      toast.success("Autoridade salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const tornarPadrao = async (a: Autoridade) => {
    const res = await authFetch(`${API_URL}/api/resultado/configuracao/autoridades/${a.id}`, { method: "PUT", body: JSON.stringify({ padrao: true }) });
    if (!res.ok) return toast.error(await erroDe(res));
    await carregar();
  };

  const remover = async (a: Autoridade) => {
    if (!confirm(`Remover ${a.nome} das autoridades? Os atos já registrados mantêm os dados dela.`)) return;
    const res = await authFetch(`${API_URL}/api/resultado/configuracao/autoridades/${a.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(await erroDe(res));
    await carregar();
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 text-[#1351b4]" />
          Adjudicação e homologação — autoridade e formalização
        </CardTitle>
        <CardDescription className="text-xs">
          Adjudicar e homologar são atos da autoridade competente (Lei 14.133/2021, art. 71, IV). O agente de contratação registra no sistema e
          escolhe a autoridade; o termo publicado leva os dados dela.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando || !cfg ? (
          <div className="flex justify-center py-6 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-sm">Modo de formalização</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {cfg.modos.map((m) => (
                  <button
                    key={m.valor}
                    type="button"
                    disabled={salvando}
                    onClick={() => m.valor !== cfg.modo && definirModo(m.valor)}
                    className={`rounded-lg border p-3 text-left text-xs transition ${
                      cfg.modo === m.valor ? "border-[#1351b4] bg-blue-50 ring-1 ring-[#1351b4]" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{m.rotulo}</div>
                    <div className="mt-1 text-gray-500">{DESCRICAO_MODO[m.valor]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Autoridades competentes</Label>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditando({ ...VAZIA, padrao: cfg.autoridades.length === 0 })}>
                  <Plus className="w-3.5 h-3.5" /> Nova autoridade
                </Button>
              </div>
              {cfg.autoridades.length === 0 ? (
                <p className="text-xs text-amber-700">
                  Nenhuma autoridade cadastrada — os termos saem com o responsável do órgão (cadastro do órgão).
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {cfg.autoridades.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium text-gray-900">
                          {a.nome} {a.padrao && <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-800">padrão</span>}
                        </div>
                        <div className="text-xs text-gray-500">
                          {a.cargo}
                          {a.ato_delegacao_numero ? ` · delegação ${a.ato_delegacao_numero}${a.ato_delegacao_data ? ` de ${fmtData(a.ato_delegacao_data)}` : ""}` : ""}
                          {a.email ? ` · ${a.email}` : " · sem e-mail"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!a.padrao && (
                          <Button size="sm" variant="ghost" title="Tornar padrão" onClick={() => tornarPadrao(a)}>
                            <Star className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" title="Editar" onClick={() => setEditando({ ...a, ato_delegacao_data: a.ato_delegacao_data?.slice(0, 10) ?? "" })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Remover" className="text-red-600" onClick={() => remover(a)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar autoridade" : "Nova autoridade"}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input className="mt-1" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Cargo</Label>
                <Input className="mt-1" placeholder="Ex.: Prefeito Municipal" value={editando.cargo} onChange={(e) => setEditando({ ...editando, cargo: e.target.value })} />
              </div>
              <div>
                <Label>CPF (opcional)</Label>
                <Input className="mt-1" value={editando.cpf ?? ""} onChange={(e) => setEditando({ ...editando, cpf: e.target.value })} />
              </div>
              <div>
                <Label>E-mail (assinatura eletrônica)</Label>
                <Input className="mt-1" type="email" value={editando.email ?? ""} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </div>
              <div>
                <Label>Ato de delegação (nº)</Label>
                <Input
                  className="mt-1"
                  placeholder="Ex.: Decreto 10/2026"
                  value={editando.ato_delegacao_numero ?? ""}
                  onChange={(e) => setEditando({ ...editando, ato_delegacao_numero: e.target.value })}
                />
              </div>
              <div>
                <Label>Data do ato de delegação</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={editando.ato_delegacao_data ?? ""}
                  onChange={(e) => setEditando({ ...editando, ato_delegacao_data: e.target.value })}
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editando.padrao} onChange={(e) => setEditando({ ...editando, padrao: e.target.checked })} />
                Autoridade padrão (sugerida ao registrar o ato)
              </label>
              <p className="col-span-2 text-xs text-gray-500">
                Com CPF e e-mail, a autoridade assina pelo link enviado ao e-mail (CPF + código), sem precisar de login. Sem CPF, assina pelo Portal de
                Assinaturas do órgão.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button className="bg-[#1351b4] hover:bg-[#0c326f] text-white" disabled={salvando} onClick={salvarAutoridade}>
              {salvando && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
