"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, History, Loader2 } from "lucide-react";
import { API_URL, authFetch, formatarDataBR } from "@/lib/api";
import { toast } from "sonner";

interface ItemContexto {
  id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  valor_unitario: number;
  saldo_disponivel: number;
}

interface OrdemSemMedicao {
  id: string;
  numero: string;
  data_solicitacao: string;
  valor_total_estimado: number;
  /** Período sugerido pelo backend: 1º ao último dia do mês da OS. */
  periodo_sugerido: { inicio: string; fim: string } | null;
  itens: Array<{ item_cronograma_id: string; quantidade_solicitada: number }>;
}

interface ContextoRetroativa {
  usa_itens_cronograma: boolean;
  itens: ItemContexto[];
  ordens_sem_medicao: OrdemSemMedicao[];
  /** Corte do ciclo vigente ('YYYY-MM-DD'); medição anterior a ele não consome o saldo do ciclo. */
  ciclo?: { tem_renovacao: boolean; data_corte: string | null };
  proximo_numero_medicao: number;
}

const SEM_OS = "__sem_os__";

function formatarMoeda(v: number | string) {
  const n = Number(v) || 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function numeroOuZero(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function ModalMedicaoRetroativa({
  contratoId,
  open,
  onOpenChange,
  onSucesso,
  ordemInicial,
  pagamentoInicial,
}: {
  contratoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSucesso: () => void;
  /** Abre já com esta OS selecionada (vem da aba de requisições). */
  ordemInicial?: string;
  /** Pagamento do portal que liberou o lançamento, para o motivo e o valor. */
  pagamentoInicial?: { numero_empenho: string; data: string; valor: number } | null;
}) {
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [contexto, setContexto] = useState<ContextoRetroativa | null>(null);

  const [requisicaoId, setRequisicaoId] = useState<string>(SEM_OS);
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [notaFiscalNumero, setNotaFiscalNumero] = useState("");
  const [notaFiscalValor, setNotaFiscalValor] = useState("");
  const [notaFiscalData, setNotaFiscalData] = useState("");
  const [valorMedido, setValorMedido] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");

  const limpar = useCallback(() => {
    setRequisicaoId(SEM_OS);
    setPeriodoInicio("");
    setPeriodoFim("");
    setCompetencia("");
    setNotaFiscalNumero("");
    setNotaFiscalValor("");
    setNotaFiscalData("");
    setValorMedido("");
    setQuantidades({});
    setMotivo("");
  }, []);

  useEffect(() => {
    if (!open) return;
    limpar();
    setContexto(null);
    setCarregando(true);
    (async () => {
      try {
        const res = await authFetch(
          `${API_URL}/api/contratos/${contratoId}/medicoes/retroativa/contexto`,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}) as any);
          throw new Error(
            typeof err?.message === "string"
              ? err.message
              : "Não foi possível carregar os dados do contrato",
          );
        }
        setContexto(await res.json());
      } catch (e: any) {
        toast.error(e?.message || "Erro ao carregar os dados do contrato");
        onOpenChange(false);
      } finally {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contratoId]);

  const usaItens = contexto?.usa_itens_cronograma === true;
  const itens = useMemo(() => contexto?.itens || [], [contexto]);

  // Aberto pela aba de requisições: já vem com a OS e o motivo do pagamento
  useEffect(() => {
    if (!open || !contexto || !ordemInicial) return;
    aplicarOrdem(ordemInicial);
    const os = contexto.ordens_sem_medicao.find((o) => o.id === ordemInicial);
    if (pagamentoInicial) {
      setMotivo(
        `Execução paga na contabilidade sem medição no sistema: empenho ${pagamentoInicial.numero_empenho}, ` +
          `pago em ${pagamentoInicial.data}, no valor de ${formatarMoeda(pagamentoInicial.valor)}` +
          `${os ? `, referente à ${os.numero}` : ""}.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contexto, ordemInicial]);

  const aplicarOrdem = (valor: string) => {
    setRequisicaoId(valor);
    if (valor === SEM_OS) return;
    const os = contexto?.ordens_sem_medicao.find((o) => o.id === valor);
    if (!os) return;
    // Período do mês da OS: o erro real foi digitar um mês anterior ao corte do
    // ciclo e a medição não consumir o saldo. Continua editável.
    if (os.periodo_sugerido) {
      setPeriodoInicio(os.periodo_sugerido.inicio);
      setPeriodoFim(os.periodo_sugerido.fim);
    }
    if (usaItens) {
      const novas: Record<string, string> = {};
      for (const i of os.itens || []) {
        novas[i.item_cronograma_id] = String(i.quantidade_solicitada ?? "");
      }
      setQuantidades(novas);
    } else if (os.valor_total_estimado != null) {
      setValorMedido(String(os.valor_total_estimado));
    }
  };

  const linhas = useMemo(
    () =>
      itens.map((item) => {
        const qtd = numeroOuZero(quantidades[item.id] || "");
        return {
          item,
          qtd,
          valor: qtd * (Number(item.valor_unitario) || 0),
          excedeSaldo: qtd > (Number(item.saldo_disponivel) || 0),
        };
      }),
    [itens, quantidades],
  );

  const total = useMemo(() => {
    if (usaItens) return linhas.reduce((s, l) => s + l.valor, 0);
    return numeroOuZero(valorMedido);
  }, [usaItens, linhas, valorMedido]);

  const dataCorteCiclo =
    contexto?.ciclo?.tem_renovacao && contexto.ciclo.data_corte
      ? contexto.ciclo.data_corte
      : null;
  // Comparação como texto 'YYYY-MM-DD' (ordem lexicográfica = ordem cronológica),
  // sem Date, para não deslocar o dia por fuso.
  const periodoAntesDoCiclo =
    !!dataCorteCiclo && !!periodoInicio && periodoInicio < dataCorteCiclo;

  const motivoValido = motivo.trim().length >= 10;
  const podeEnviar = motivoValido && total > 0 && !salvando && !carregando;

  const registrar = async () => {
    if (!podeEnviar) return;
    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        requisicao_id: requisicaoId === SEM_OS ? null : requisicaoId,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        motivo: motivo.trim(),
      };
      if (competencia) body.competencia = competencia;
      if (notaFiscalNumero) body.nota_fiscal_numero = notaFiscalNumero;
      body.nota_fiscal_valor = notaFiscalValor
        ? numeroOuZero(notaFiscalValor)
        : null;
      body.nota_fiscal_data = notaFiscalData || null;
      if (usaItens) {
        body.itens = linhas
          .filter((l) => l.qtd > 0)
          .map((l) => ({
            item_cronograma_id: l.item.id,
            quantidade_medida: l.qtd,
          }));
      } else {
        body.valor_medido = numeroOuZero(valorMedido);
      }

      const res = await authFetch(
        `${API_URL}/api/contratos/${contratoId}/medicoes/retroativa`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}) as any);
      if (!res.ok) {
        const msg = data?.message;
        if (msg && typeof msg === "object") {
          const erros = Array.isArray(msg.erros) ? msg.erros : [];
          throw new Error(
            [msg.message, ...erros].filter(Boolean).join(" — ") ||
              "Erro ao registrar a medição retroativa",
          );
        }
        throw new Error(
          (Array.isArray(msg) ? msg.join(" — ") : msg) ||
            "Erro ao registrar a medição retroativa",
        );
      }
      const numero = data?.numero_medicao;
      const base = numero
        ? `${numero}ª medição registrada retroativamente e já aprovada.`
        : "Medição registrada retroativamente e já aprovada.";
      if (typeof data?.aviso === "string" && data.aviso) {
        toast.warning(`${base} ${data.aviso}`, { duration: 12000 });
      } else {
        toast.success(base);
      }
      onOpenChange(false);
      onSucesso();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao registrar a medição retroativa");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-600" />
            Registrar medição retroativa
          </DialogTitle>
          <DialogDescription>
            Ação de suporte para regularizar no sistema uma execução que já foi
            paga pela contabilidade
            {contexto
              ? ` — será a ${contexto.proximo_numero_medicao}ª medição do contrato.`
              : "."}
          </DialogDescription>
        </DialogHeader>

        {carregando || !contexto ? (
          <div className="py-12 flex items-center justify-center text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Carregando dados do contrato...
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <p>
                Esta medição entra já aprovada, sem submissão, ateste ou
                assinatura, e consome o saldo na hora. Use apenas quando a
                execução já foi paga fora do sistema.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Ordem de serviço</Label>
              <Select value={requisicaoId} onValueChange={aplicarOrdem}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a ordem de serviço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_OS}>Sem ordem de serviço</SelectItem>
                  {contexto.ordens_sem_medicao.map((os) => (
                    <SelectItem key={os.id} value={os.id}>
                      {os.numero} — {formatarDataBR(os.data_solicitacao)} —{" "}
                      {formatarMoeda(os.valor_total_estimado)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Ao escolher uma ordem, as quantidades são pré-preenchidas com o
                que foi solicitado. Ajuste se a execução foi diferente.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Período — início</Label>
                <Input
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Período — fim</Label>
                <Input
                  type="date"
                  value={periodoFim}
                  onChange={(e) => setPeriodoFim(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Competência</Label>
                <Input
                  placeholder="06/2026"
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                />
              </div>
            </div>

            {dataCorteCiclo && (
              <p className="-mt-3 text-xs text-gray-500">
                Ciclo vigente desde {formatarDataBR(dataCorteCiclo)}. Medição com
                período anterior a essa data pertence ao ciclo anterior.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Nota fiscal — número</Label>
                <Input
                  placeholder="14"
                  value={notaFiscalNumero}
                  onChange={(e) => setNotaFiscalNumero(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nota fiscal — valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={notaFiscalValor}
                  onChange={(e) => setNotaFiscalValor(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nota fiscal — data</Label>
                <Input
                  type="date"
                  value={notaFiscalData}
                  onChange={(e) => setNotaFiscalData(e.target.value)}
                />
              </div>
            </div>

            {usaItens ? (
              <div className="space-y-2">
                <Label>Itens medidos</Label>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Nº</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Unidade</TableHead>
                        <TableHead className="w-28 text-right">
                          Saldo disp.
                        </TableHead>
                        <TableHead className="w-32 text-right">
                          Quantidade
                        </TableHead>
                        <TableHead className="w-32 text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.map(({ item, qtd, valor, excedeSaldo }) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">
                            {item.numero_item}
                          </TableCell>
                          <TableCell
                            className="text-sm max-w-[280px] truncate"
                            title={item.descricao}
                          >
                            {item.descricao}
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.unidade_medida}
                          </TableCell>
                          <TableCell className="text-sm text-right">
                            {Number(item.saldo_disponivel).toLocaleString(
                              "pt-BR",
                              { maximumFractionDigits: 4 },
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              step="0.0001"
                              min="0"
                              className={`h-8 text-right ${excedeSaldo ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                              value={quantidades[item.id] ?? ""}
                              onChange={(e) =>
                                setQuantidades((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                            />
                            {excedeSaldo && (
                              <p className="text-[11px] text-red-600 mt-1">
                                Acima do saldo disponível
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right font-medium">
                            {qtd > 0 ? formatarMoeda(valor) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border rounded-lg">
                  <span className="text-sm text-gray-600">
                    Total da medição
                  </span>
                  <span className="text-lg font-semibold text-blue-700">
                    {formatarMoeda(total)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Valor medido</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={valorMedido}
                  onChange={(e) => setValorMedido(e.target.value)}
                />
                <p className="text-sm text-gray-600">
                  Total da medição:{" "}
                  <strong className="text-blue-700">
                    {formatarMoeda(total)}
                  </strong>
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>
                Motivo do lançamento retroativo{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="NF 14, empenho 324, liquidado e pago em 30/06/2026 conforme portal da transparência"
              />
              <p className="text-xs text-gray-500">
                Mínimo de 10 caracteres. Fica registrado no histórico da
                medição.
              </p>
            </div>

            {periodoAntesDoCiclo && (
              <div className="flex gap-3 p-3 rounded-lg border-2 border-amber-400 bg-amber-100 text-amber-900 text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <p>
                  <strong>
                    Este período é anterior ao início do ciclo vigente
                    {dataCorteCiclo
                      ? ` (${formatarDataBR(dataCorteCiclo)})`
                      : ""}
                    .
                  </strong>{" "}
                  A medição não vai consumir o saldo do ciclo atual. Se a
                  execução é do ciclo vigente, corrija o período antes de
                  registrar.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            onClick={registrar}
            disabled={!podeEnviar}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <History className="w-4 h-4 mr-1" />
            )}
            Registrar medição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
