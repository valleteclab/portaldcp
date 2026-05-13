"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import { ExternalLink, FileText } from "lucide-react";

type Cotacao = {
  fonte: string;
  descricao_fonte: string;
  url_referencia?: string;
  data_pesquisa: string;
  fornecedor_cnpj?: string;
  fornecedor_razao_social?: string;
  valor_unitario: number;
  observacao?: string;
  documento_comprobatorio_path?: string;
};

type ItemPesquisa = {
  item_numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_referencial: number;
  valor_medio?: number;
  valor_mediano?: number;
  cv_percent?: number;
  cotacoes: Cotacao[];
};

type DadosPublicos = {
  licitacao: {
    numero_processo: string;
    numero_edital?: string;
    objeto: string;
    modalidade?: string;
    criterio_julgamento?: string;
  };
  orgao?: {
    nome: string;
    cnpj?: string;
    cidade?: string;
    uf?: string;
  };
  dados: {
    itens: ItemPesquisa[];
  };
  estatisticas: {
    valorTotal: number;
    totalFontes: number;
  };
  geradoEm: string;
};

const formatCurrency = (value?: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatDate = (value?: string) => {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR");
};

const fonteLabel = (cotacao: Cotacao) => {
  if (
    /Fonte de Precos/i.test(
      `${cotacao.descricao_fonte} ${cotacao.observacao || ""}`,
    )
  ) {
    return "Fonte de Preços";
  }
  const labels: Record<string, string> = {
    PAINEL_DE_PRECOS: "Compras.gov.br",
    PNCP: "PNCP",
    CONTRATO_VIGENTE_SISTEMA: "Contrato vigente",
    MIDIA_ESPECIALIZADA: "Mídia especializada",
    FORNECEDOR_DIRETO: "Fornecedor",
    NOTA_FISCAL_ELETRONICA: "NF-e",
    OUTRA: "Outra",
  };
  return labels[cotacao.fonte] || cotacao.fonte || "-";
};

const limparObservacao = (observacao?: string) =>
  String(observacao || "")
    .split("|")
    .map((parte) => parte.trim())
    .filter(
      (parte) =>
        parte &&
        !/Fonte complementar Fonte de Precos: validar comprovante antes de aprovar como fonte oficial/i.test(
          parte,
        ),
    )
    .join(" | ");

export default function PesquisaPrecosPublicaPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<DadosPublicos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_URL}/api/fase-interna/publico/precos/${id}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Cotação não encontrada");
        setData(await response.json());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao carregar cotação",
        );
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  const totalItens = useMemo(() => data?.dados?.itens?.length || 0, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-700">
        Carregando cotação...
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-700">
        {error || "Cotação indisponível"}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-start gap-3">
            <FileText className="mt-1 h-6 w-6 text-blue-700" />
            <div>
              <h1 className="text-2xl font-semibold">Pesquisa de Preços</h1>
              <p className="mt-1 text-sm text-slate-600">
                Processo {data.licitacao.numero_processo}{" "}
                {data.orgao?.nome ? `- ${data.orgao.nome}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Info label="Órgão" value={data.orgao?.nome || "-"} />
            <Info label="CNPJ" value={data.orgao?.cnpj || "-"} />
            <Info label="Itens" value={String(totalItens)} />
            <Info
              label="Valor estimado"
              value={formatCurrency(data.estatisticas.valorTotal)}
            />
          </div>

          <div className="mt-6 rounded border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Objeto
            </p>
            <p className="mt-1 text-sm leading-6">{data.licitacao.objeto}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="space-y-8">
          {data.dados.itens.map((item) => (
            <article
              key={item.item_numero}
              className="overflow-hidden rounded border border-slate-200 bg-white"
            >
              <header className="border-b bg-slate-100 px-4 py-3">
                <h2 className="font-semibold">
                  Item {item.item_numero} - {item.descricao}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Quantidade: {item.quantidade} {item.unidade} | Valor
                  referencial: {formatCurrency(item.valor_referencial)}
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-left text-white">
                      <th className="px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Fonte</th>
                      <th className="px-3 py-2">
                        Origem / processo / fornecedor
                      </th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2 text-right">Valor unit.</th>
                      <th className="px-3 py-2">Referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.cotacoes.map((cotacao, index) => (
                      <tr
                        key={`${item.item_numero}-${index}`}
                        className="border-b border-slate-100 odd:bg-white even:bg-slate-50"
                      >
                        <td className="px-3 py-3 align-top">{index + 1}</td>
                        <td className="px-3 py-3 align-top">
                          {fonteLabel(cotacao)}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p>{cotacao.descricao_fonte}</p>
                          {cotacao.fornecedor_razao_social && (
                            <p className="mt-1 text-slate-600">
                              Fornecedor: {cotacao.fornecedor_razao_social}
                              {cotacao.fornecedor_cnpj
                                ? ` (${cotacao.fornecedor_cnpj})`
                                : ""}
                            </p>
                          )}
                          {limparObservacao(cotacao.observacao) && (
                            <p className="mt-1 text-xs text-slate-500">
                              {limparObservacao(cotacao.observacao)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {formatDate(cotacao.data_pesquisa)}
                        </td>
                        <td className="px-3 py-3 text-right align-top font-medium">
                          {formatCurrency(cotacao.valor_unitario)}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {cotacao.url_referencia ? (
                            <a
                              className="inline-flex items-center gap-1 text-blue-700 underline"
                              href={cotacao.url_referencia}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Link <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-slate-500">
                              Comprovante interno
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-8 text-xs text-slate-500">
          Dados públicos da cotação atualizados em {formatDate(data.geradoEm)}.
        </p>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
