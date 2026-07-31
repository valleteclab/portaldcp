"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
  valor_unitario: number;
  lote_numero?: number | null;
}

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

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [resItens, resComprometido] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${contratoId}/itens-cronograma`),
        authFetch(
          `${API_URL}/api/almoxarifado/requisicoes/comprometido-os/${contratoId}`,
        ),
      ]);
      setItens(resItens.ok ? await resItens.json() : []);
      setComprometido(resComprometido.ok ? await resComprometido.json() : {});
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
          const contratado =
            Number(item.quantidade) * (Number(item.quantidade_meses) || 1);
          const usado = Number(comprometido[item.id] || 0);
          total.contratado += contratado * Number(item.valor_unitario);
          total.comprometido += usado * Number(item.valor_unitario);
          return total;
        },
        { contratado: 0, comprometido: 0 },
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
            O comprometido considera somente as OS ativas do ciclo vigente.
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="text-xs text-muted-foreground">Total dos itens</p>
            <p className="font-semibold">{moeda(totais.contratado)}</p>
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
              {moeda(totais.contratado - totais.comprometido)}
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
                <th className="px-3 py-2 text-right">Em OS</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-right">Valor unit.</th>
                <th className="px-3 py-2 text-right">Saldo em valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const contratado =
                  Number(item.quantidade) *
                  (Number(item.quantidade_meses) || 1);
                const usado = Number(comprometido[item.id] || 0);
                const saldo = Math.max(0, contratado - usado);
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
