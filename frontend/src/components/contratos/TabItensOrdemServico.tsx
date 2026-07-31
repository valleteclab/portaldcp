"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { API_URL, authFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ItemCronogramaOS {
  id: string;
  numero_item: number;
  descricao: string;
  unidade_medida: string;
  quantidade: number;
  quantidade_meses?: number | null;
  quantidade_medida?: number | null;
  valor_unitario: number;
  lote_numero?: number | null;
}

// Mesma conta da tela de nova OS: o contratado considera os meses do item e o
// saldo desconta o que já foi medido além do que está preso em OS ativas.
const contratadoDoItem = (item: ItemCronogramaOS) =>
  Number(item.quantidade) * (Number(item.quantidade_meses) || 1);

const moeda = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const quantidade = (valor: number) =>
  valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });

export default function TabItensOrdemServico({
  contratoId,
}: {
  contratoId: string;
}) {
  const [itens, setItens] = useState<ItemCronogramaOS[]>([]);
  const [comprometido, setComprometido] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [resItens, resComprometido] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${contratoId}/itens-cronograma`),
        authFetch(
          `${API_URL}/api/almoxarifado/requisicoes/comprometido-os/${contratoId}`,
        ),
      ]);
      if (!resItens.ok) {
        // Sem isso a tela mostrava tabela vazia e R$ 0,00 como se o contrato não
        // tivesse itens — o usuário não tinha como saber que a chamada falhou.
        const corpo = await resItens.json().catch(() => null);
        setErro(corpo?.message || "Não foi possível carregar os itens do contrato.");
        setItens([]);
        setComprometido({});
        return;
      }
      setItens(await resItens.json());
      setComprometido(resComprometido.ok ? await resComprometido.json() : {});
    } catch {
      setErro("Não foi possível carregar os itens do contrato.");
      setItens([]);
      setComprometido({});
    } finally {
      setCarregando(false);
    }
  }, [contratoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totais = useMemo(
    () =>
      itens.reduce(
        (total, item) => {
          const unitario = Number(item.valor_unitario);
          const medido = Number(item.quantidade_medida) || 0;
          const usado = Number(comprometido[item.id] || 0);
          total.contratado += contratadoDoItem(item) * unitario;
          total.medido += medido * unitario;
          total.comprometido += usado * unitario;
          return total;
        },
        { contratado: 0, medido: 0, comprometido: 0 },
      ),
    [itens, comprometido],
  );

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Itens da Ordem de Serviço</CardTitle>
          <CardDescription>
            O saldo desconta o que já foi medido no ciclo vigente e o que está
            comprometido nas OS ativas.
          </CardDescription>
        </div>
        <Button asChild>
          <Link
            href={`/orgao/almoxarifado/requisicoes/nova?contrato=${contratoId}&tipo=ORDEM_SERVICO`}
          >
            <Plus className="mr-2 h-4 w-4" /> Nova OS
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>{erro}</p>
              <Button size="sm" variant="outline" onClick={carregar}>
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Total dos itens</p>
            <p className="font-semibold">{moeda(totais.contratado)}</p>
          </div>
          <div className="rounded-lg border bg-sky-50 p-3">
            <p className="text-xs text-sky-700">Medido no ciclo</p>
            <p className="font-semibold text-sky-800">{moeda(totais.medido)}</p>
          </div>
          <div className="rounded-lg border bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Comprometido em OS</p>
            <p className="font-semibold text-amber-800">
              {moeda(totais.comprometido)}
            </p>
          </div>
          <div className="rounded-lg border bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">Saldo dos itens</p>
            <p className="font-semibold text-emerald-800">
              {moeda(
                Math.max(
                  0,
                  totais.contratado - totais.medido - totais.comprometido,
                ),
              )}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Lote/item</th>
                <th className="px-3 py-2 text-left">Descrição</th>
                <th className="px-3 py-2 text-right">Contratado</th>
                <th className="px-3 py-2 text-right">Medido</th>
                <th className="px-3 py-2 text-right">Em OS</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">Valor unit.</th>
                <th className="px-3 py-2 text-right">Saldo em valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 && !erro && (
                <tr className="border-t">
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Este contrato não possui itens cadastrados.
                  </td>
                </tr>
              )}
              {itens.map((item) => {
                const contratado = contratadoDoItem(item);
                const medido = Number(item.quantidade_medida) || 0;
                const usado = Number(comprometido[item.id] || 0);
                const saldo = Math.max(0, contratado - medido - usado);
                return (
                  <tr key={item.id} className="border-t">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {item.lote_numero ? `L${item.lote_numero} · ` : ""}
                      {item.numero_item}
                    </td>
                    <td className="px-3 py-2">{item.descricao}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {quantidade(contratado)} {item.unidade_medida}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sky-700">
                      {quantidade(medido)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-amber-700">
                      {quantidade(usado)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {quantidade(saldo)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {moeda(Number(item.valor_unitario))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-emerald-700">
                      {moeda(saldo * Number(item.valor_unitario))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
