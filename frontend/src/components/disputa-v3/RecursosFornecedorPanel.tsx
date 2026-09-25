"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, FileUp, Gavel, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { API_URL, authFetch } from "@/lib/api";
import { BadgeStatusRecurso, DetalheRecurso, PainelRecursos, dataHoraBr, useContagem } from "./recursos-comum";

/**
 * RECURSOS — painel do LICITANTE na sala (plano E5 — Lei 14.133/2021 art.
 * 165; IN SEGES 73/2022 art. 40). Tudo pelo próprio token:
 *  - durante a janela aberta pelo agente (contagem regressiva), manifesta a
 *    intenção de recorrer, com o ato recorrido e a motivação — encerrada a
 *    janela, preclui;
 *  - o recorrente apresenta as razões (texto + arquivo) até o prazo;
 *  - os demais licitantes apresentam contrarrazões até o prazo;
 *  - todos os licitantes acompanham as peças e as decisões.
 * Não renderiza nada antes de haver janela ou recurso na sessão.
 */
export function RecursosFornecedorPanel({ sessaoId }: { sessaoId: string }) {
  const [painel, setPainel] = useState<PainelRecursos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ato, setAto] = useState<string>("");
  const [motivacao, setMotivacao] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/recursos/sessao/${sessaoId}`);
      if (r.ok) setPainel(await r.json());
    } catch {
      /* próxima atualização */
    }
  }, [sessaoId]);

  useEffect(() => {
    carregar();
    const iv = setInterval(carregar, 6000);
    return () => clearInterval(iv);
  }, [carregar]);

  const janela = painel?.janela ?? null;
  const aberta = janela?.estado === "ABERTA";
  const contagem = useContagem(aberta ? janela!.fechaEm : null);

  if (!painel || (!janela && painel.recursos.length === 0)) return null;

  const opcoes = painel.atosRecorriveis ?? [];
  const escolhido = opcoes.find((o) => `${o.ato}|${o.fornecedorAlvoId ?? ""}|${o.unidadeId ?? ""}` === ato) ?? null;

  const manifestar = async () => {
    setErro(null);
    setOk(null);
    if (!escolhido) return setErro("Escolha o ato de que pretende recorrer.");
    if (motivacao.trim().length < 10) return setErro("Informe, em síntese, a motivação (mín. 10 caracteres).");
    setEnviando(true);
    try {
      const res = await authFetch(`${API_URL}/api/recursos/sessao/${sessaoId}/intencao`, {
        method: "POST",
        body: JSON.stringify({
          atoRecorrido: escolhido.ato,
          fornecedorAlvoId: escolhido.fornecedorAlvoId ?? undefined,
          unidadeId: escolhido.unidadeId ?? undefined,
          motivacao: motivacao.trim(),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.message || "Não foi possível registrar a intenção");
      }
      setOk("Intenção de recurso registrada. Aguarde o juízo de admissibilidade do agente de contratação.");
      setMotivacao("");
      setAto("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="border-amber-200">
      <CardHeader className="border-b bg-amber-50">
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Gavel className="h-4 w-4" /> Recursos (Art. 165)
        </CardTitle>
        <CardDescription>
          Intenção imediata na janela aberta pelo agente, sob pena de preclusão · razões em {painel.prazos.diasRazoes} dias úteis ·
          contrarrazões em {painel.prazos.diasContrarrazoes} dias úteis do fim do prazo das razões.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {ok && <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</div>}

        {janela && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            {aberta ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-amber-900">
                    Prazo para manifestar intenção de recurso até {dataHoraBr(janela.fechaEm)}.
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-amber-800">
                    <Clock3 className="mr-1 inline h-4 w-4" />
                    {contagem.texto}
                  </div>
                </div>
                {painel.podeManifestarIntencao && (
                  <>
                    <select className="h-9 w-full rounded border bg-white px-2 text-sm" value={ato} onChange={(e) => setAto(e.target.value)}>
                      <option value="">Ato de que pretende recorrer…</option>
                      {opcoes.map((o) => (
                        <option key={`${o.ato}|${o.fornecedorAlvoId ?? ""}|${o.unidadeId ?? ""}`} value={`${o.ato}|${o.fornecedorAlvoId ?? ""}|${o.unidadeId ?? ""}`}>
                          {o.rotulo}
                        </option>
                      ))}
                    </select>
                    <Textarea
                      rows={2}
                      className="bg-white text-sm"
                      placeholder="Motivação resumida (as razões completas vêm depois, no prazo próprio)"
                      value={motivacao}
                      onChange={(e) => setMotivacao(e.target.value)}
                    />
                    <Button size="sm" className="gap-1" disabled={enviando || contagem.segundos === 0} onClick={manifestar}>
                      <Send className="h-3 w-3" /> Manifestar intenção de recurso
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="text-sm text-amber-900">
                {janela.estado === "SUPERADA"
                  ? "O resultado foi refeito por recurso provido; aguarde a nova janela de intenção."
                  : `Prazo de intenção de recurso encerrado em ${dataHoraBr(janela.fechaEm)} (preclusão para quem não se manifestou).`}
              </div>
            )}
          </div>
        )}

        {painel.recursos.map((r) => (
          <div key={r.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900">
                {r.souRecorrente ? "Meu recurso" : `Recurso de ${r.recorrente.nome}`}
              </span>
              <BadgeStatusRecurso status={r.status} />
            </div>
            <DetalheRecurso r={r} />
            {r.podeApresentarRazoes && (
              <FormularioPeca
                titulo={`Razões do recurso — até ${dataHoraBr(r.prazoRazoes)}`}
                url={`${API_URL}/api/recursos/${r.id}/razoes`}
                onEnviado={carregar}
              />
            )}
            {r.podeContrarrazoar && (
              <FormularioPeca
                titulo={`Contrarrazões — até ${dataHoraBr(r.prazoContrarrazoes)}`}
                url={`${API_URL}/api/recursos/${r.id}/contrarrazoes`}
                onEnviado={carregar}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FormularioPeca({ titulo, url, onEnviado }: { titulo: string; url: string; onEnviado: () => void }) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    setErro(null);
    if (texto.trim().length < 20) return setErro("Escreva a peça (mín. 20 caracteres).");
    if (arquivo && arquivo.size > 10 * 1024 * 1024) return setErro("Arquivo acima de 10 MB.");
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("texto", texto.trim());
      if (arquivo) fd.append("arquivo", arquivo);
      const res = await authFetch(url, { method: "POST", body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.message || "Não foi possível enviar");
      }
      setTexto("");
      setArquivo(null);
      onEnviado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-2">
      <div className="text-xs font-semibold text-blue-900">{titulo}</div>
      {erro && <div className="text-xs text-red-700">{erro}</div>}
      <Textarea rows={4} className="bg-white text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-blue-800">
          <FileUp className="h-3 w-3" />
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="h-8 w-60 bg-white text-xs"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button size="sm" className="h-8 gap-1" disabled={enviando} onClick={enviar}>
          <Send className="h-3 w-3" /> Enviar
        </Button>
      </div>
      <div className="text-[11px] text-blue-700">PDF, JPG ou PNG, até 10 MB (opcional). A peça fica visível aos demais licitantes.</div>
    </div>
  );
}

