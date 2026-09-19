"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, authFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Pagamento = {
  chave: string;
  numero_empenho: string;
  numero_liquidacao: string;
  data: string;
  valor: number;
  bem_servico: string;
  elegivel: boolean;
  conciliado: number;
  disponivel: number;
  sugestoes: string[];
};
type Medicao = {
  id: string;
  numero: number;
  nota_fiscal: string;
  periodo_inicio: string;
  valor: number;
  conciliado: number;
  pendente: number;
  aprovada: boolean;
  situacao: string;
};
type Vinculo = {
  id: string;
  medicao_id: string;
  pagamento_chave: string;
  pagamento: Pagamento;
  valor: number;
  justificativa: string;
  usuario_id: string;
  usuario_nome: string;
  criado_em: string;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  revisar: boolean;
};
type Dados = {
  consultado_em: string;
  pagamentos: Pagamento[];
  medicoes: Medicao[];
  vinculos: Vinculo[];
};
const moeda = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const situacoes: Record<string, string> = {
  REVISAR: "Revisão necessária",
  SEM_PAGAMENTO: "Sem pagamento conciliado",
  INTEGRAL: "Valor integral conciliado",
  PARCIAL: "Pagamento parcial conciliado",
};

export default function ConciliacaoPagamentos({
  contratoId,
}: {
  contratoId: string;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroFormulario, setErroFormulario] = useState("");
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const [cancelar, setCancelar] = useState<Vinculo | null>(null);
  const [medicaoId, setMedicaoId] = useState("");
  const [valor, setValor] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const endpoint = `${API_URL}/api/contratos/${contratoId}/conciliacao-pagamentos`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await authFetch(endpoint);
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          Array.isArray(json.message)
            ? json.message.join(" ")
            : json.message || "Não foi possível consultar a contabilidade.",
        );
      setDados(json);
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Consulta indisponível. Tente novamente.",
      );
    } finally {
      setCarregando(false);
    }
  }, [endpoint]);
  useEffect(() => {
    setDados(null);
  }, [contratoId]);

  async function salvar() {
    setSalvando(true);
    setErroFormulario("");
    try {
      const res = await authFetch(
        cancelar ? `${endpoint}/${cancelar.id}/cancelar` : endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            cancelar
              ? { justificativa }
              : {
                  pagamento_chave: pagamento?.chave,
                  medicao_id: medicaoId,
                  valor: Number(valor.replace(",", ".")),
                  justificativa,
                },
          ),
        },
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          Array.isArray(json.message)
            ? json.message.join(" ")
            : json.message || "Não foi possível salvar o vínculo.",
        );
      setPagamento(null);
      setCancelar(null);
      await carregar();
    } catch (e) {
      setErroFormulario(
        e instanceof Error ? e.message : "Não foi possível salvar.",
      );
    } finally {
      setSalvando(false);
    }
  }

  function abrir(p: Pagamento) {
    setPagamento(p);
    setMedicaoId("");
    setValor(String(p.disponivel));
    setJustificativa("");
    setErroFormulario("");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Conciliação dos pagamentos</CardTitle>
          <Button
            variant="outline"
            onClick={carregar}
            disabled={carregando || salvando}
          >
            {carregando
              ? "Consultando contabilidade…"
              : dados
                ? "Atualizar conciliação"
                : "Consultar pagamentos para conciliar"}
          </Button>
        </div>
        <CardDescription>
          Relacione os pagamentos da contabilidade às medições aprovadas. O
          vínculo registra a conferência financeira e não desconta novamente o
          saldo do contrato.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && (
          <p
            role="alert"
            className="rounded bg-red-50 p-3 text-sm text-red-800"
          >
            {erro}{" "}
            {dados &&
              "Os dados abaixo são da consulta anterior. Atualize antes de confirmar vínculos."}
          </p>
        )}
        {!dados && !erro && (
          <p className="text-sm text-muted-foreground">
            Consulte para identificar pagamentos sem vínculo e conferir os
            valores já conciliados.
          </p>
        )}
        {dados && (
          <>
            <p className="text-xs text-muted-foreground">
              Consulta realizada em{" "}
              {new Date(dados.consultado_em).toLocaleString("pt-BR")}. Abrange
              os exercícios consultados desde o início do contrato. Ausência de
              vínculo não comprova ausência de pagamento.
            </p>
            {dados.pagamentos.some(
              (p) => p.valor < 0 && p.disponivel !== 0,
            ) && (
              <p
                role="alert"
                className="rounded bg-amber-50 p-3 text-sm text-amber-900"
              >
                Há estornos sem conciliação. Confira os vínculos das medições
                afetadas antes de considerar o pagamento concluído.
              </p>
            )}
            {dados.vinculos.some((v) => v.revisar) && (
              <p
                role="alert"
                className="rounded bg-amber-50 p-3 text-sm text-amber-900"
              >
                Há vínculos cujo pagamento não foi confirmado na consulta atual
                ou cuja medição deixou de estar aprovada. Revise o histórico
                abaixo.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="mb-2 text-left font-semibold">
                  Medições e pagamentos vinculados
                </caption>
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Medição / NF</th>
                    <th className="p-2">Valor medido</th>
                    <th className="p-2">Conciliado</th>
                    <th className="p-2">Diferença a conferir</th>
                    <th className="p-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.medicoes.map((m) => (
                    <tr key={m.id} className="border-b">
                      <td className="p-2">
                        {m.numero}ª medição · NF{" "}
                        {m.nota_fiscal || "não informada"}
                        <div className="text-xs text-muted-foreground">
                          Período:{" "}
                          {String(m.periodo_inicio)
                            .slice(0, 10)
                            .split("-")
                            .reverse()
                            .join("/")}
                        </div>
                      </td>
                      <td className="p-2">{moeda(m.valor)}</td>
                      <td className="p-2">{moeda(m.conciliado)}</td>
                      <td className="p-2">{moeda(m.pendente)}</td>
                      <td className="p-2">{situacoes[m.situacao]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!dados.medicoes.length && (
                <p className="py-3 text-sm">
                  Nenhuma medição aprovada disponível para conciliação.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A diferença pode envolver pagamento pendente, retenções ou glosas.
              Confira os documentos antes de concluir a análise.
            </p>
            <div className="space-y-2">
              <h3 className="font-semibold">
                Pagamentos e estornos consultados
              </h3>
              {!dados.pagamentos.length && (
                <p className="text-sm">
                  Nenhum pagamento retornado nesta consulta.
                </p>
              )}
              {dados.pagamentos.map((p, i) => (
                <div
                  key={`${p.chave}-${i}`}
                  className="rounded border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>
                      {p.valor < 0 ? "Estorno" : "Pagamento"}{" "}
                      {p.numero_liquidacao || "sem número"} · Empenho{" "}
                      {p.numero_empenho} · {p.data}
                    </strong>
                    <span>{moeda(p.valor)}</span>
                  </div>
                  <p className="my-1 whitespace-pre-wrap text-muted-foreground">
                    {p.bem_servico}
                  </p>
                  <p>
                    Conciliado: {moeda(p.conciliado)} · Sem vínculo:{" "}
                    {moeda(p.disponivel)}
                  </p>
                  {dados.vinculos
                    .filter(
                      (v) => !v.cancelado_em && v.pagamento_chave === p.chave,
                    )
                    .map((v) => (
                      <p key={v.id} className="text-xs">
                        ↳{" "}
                        {dados.medicoes.find((m) => m.id === v.medicao_id)
                          ?.numero || "?"}
                        ª medição: {moeda(v.valor)}
                      </p>
                    ))}
                  {!p.elegivel ? (
                    <p className="mt-2 text-amber-800">
                      Vínculo indisponível: contrato/fornecedor não confirmado
                      ou identificação do pagamento insuficiente/ambígua.
                    </p>
                  ) : p.disponivel !== 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !!erro ||
                          carregando ||
                          salvando ||
                          !dados.medicoes.some((m) => m.aprovada)
                        }
                        onClick={() => abrir(p)}
                      >
                        Conciliar {p.valor < 0 ? "estorno" : "pagamento"}
                      </Button>
                      {p.sugestoes.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Valor igual ao das medições{" "}
                          {p.sugestoes
                            .map(
                              (id) =>
                                dados.medicoes.find((m) => m.id === id)?.numero,
                            )
                            .join(", ")}
                          . Sugestão a conferir.
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-green-700">
                      Valor integral vinculado
                    </p>
                  )}
                </div>
              ))}
            </div>
            <details className="rounded border p-3">
              <summary className="cursor-pointer font-semibold">
                Histórico de vínculos ({dados.vinculos.length})
              </summary>
              {dados.vinculos.map((v) => (
                <div key={v.id} className="mt-3 border-t pt-3 text-sm">
                  <p>
                    {dados.medicoes.find((m) => m.id === v.medicao_id)
                      ?.numero || "?"}
                    ª medição · Empenho {v.pagamento.numero_empenho} ·{" "}
                    {moeda(v.valor)} ·{" "}
                    {v.cancelado_em
                      ? "Cancelado"
                      : v.revisar
                        ? "Revisar"
                        : "Ativo"}
                  </p>
                  <p>{v.justificativa}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.criado_em).toLocaleString("pt-BR")} ·
                    Responsável: {v.usuario_nome}
                  </p>
                  {v.cancelado_em ? (
                    <p>Cancelamento: {v.motivo_cancelamento}</p>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={salvando || carregando}
                      onClick={() => {
                        setCancelar(v);
                        setJustificativa("");
                        setErroFormulario("");
                      }}
                    >
                      Cancelar vínculo
                    </Button>
                  )}
                </div>
              ))}
            </details>
          </>
        )}
        <Dialog
          open={!!pagamento || !!cancelar}
          onOpenChange={(open) => {
            if (!open && !salvando) {
              setPagamento(null);
              setCancelar(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {cancelar ? "Cancelar vínculo" : "Confirmar conciliação"}
              </DialogTitle>
              <DialogDescription>
                {cancelar
                  ? "O cancelamento permanece no histórico para auditoria."
                  : "Confira a medição e o documento contábil. Você pode vincular parte do valor e conciliar o restante em outra medição."}
              </DialogDescription>
            </DialogHeader>
            {pagamento && (
              <>
                <p className="text-sm">
                  Empenho {pagamento.numero_empenho} · {pagamento.data} ·
                  Disponível: {moeda(pagamento.disponivel)}
                </p>
                <Label htmlFor="conciliacao-medicao">Medição aprovada</Label>
                <select
                  id="conciliacao-medicao"
                  className="w-full rounded border bg-background p-2"
                  value={medicaoId}
                  onChange={(e) => setMedicaoId(e.target.value)}
                >
                  <option value="">Selecione e confira a nota fiscal</option>
                  {dados?.medicoes
                    .filter((m) => m.aprovada)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.numero}ª · NF {m.nota_fiscal || "não informada"} ·
                        Medido {moeda(m.valor)} · Conciliado{" "}
                        {moeda(m.conciliado)}
                      </option>
                    ))}
                </select>
                <Label htmlFor="conciliacao-valor">
                  Valor a vincular (R$)
                  {pagamento.valor < 0 ? " — negativo para estorno" : ""}
                </Label>
                <Input
                  id="conciliacao-valor"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </>
            )}
            <Label htmlFor="conciliacao-justificativa">
              Justificativa da conferência
            </Label>
            <Textarea
              id="conciliacao-justificativa"
              maxLength={2000}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Informe os documentos e referências conferidos."
            />
            {erroFormulario && (
              <p role="alert" className="text-sm text-red-700">
                {erroFormulario}
              </p>
            )}
            <Button
              disabled={
                salvando ||
                justificativa.trim().length < 5 ||
                (!cancelar && (!medicaoId || !valor))
              }
              onClick={salvar}
            >
              {salvando
                ? "Salvando…"
                : cancelar
                  ? "Confirmar cancelamento"
                  : "Confirmar vínculo"}
            </Button>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
