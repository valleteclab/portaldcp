"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Calendar, CheckCircle, Download, ExternalLink, FileText, Users } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HIPOTESES, REGRAS, dataCurta, dataHora, moeda, situacaoCredenciamento } from "@/lib/credenciamento";

/**
 * EDITAL DE CREDENCIAMENTO — página pública (plano E7b). Só o que foi
 * divulgado: regras do art. 79 (hipótese, distribuição, vigência, condições
 * padronizadas, denúncia), tabela de valores, exigências de habilitação,
 * edital em PDF, PNCP e a relação de credenciados.
 */
export default function CredenciamentoPublicoDetalhePage() {
  const params = useParams();
  const id = params.id as string;
  const [c, setC] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/api/credenciamento/publicos/${id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Credenciamento não encontrado");
        setC(await response.json());
      })
      .catch(() => setC(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!c) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Credenciamento público não encontrado.</p>
        <Button asChild>
          <Link href="/credenciamento">Voltar</Link>
        </Button>
      </div>
    );
  }

  const s = situacaoCredenciamento(c);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/credenciamento">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex gap-2 flex-wrap">
                <Badge className={s.cor}>{s.label}</Badge>
                <Badge variant="outline">Credenciamento</Badge>
                {c.hipotese && <Badge variant="outline">{HIPOTESES[c.hipotese]?.rotulo}</Badge>}
              </div>
              <h1 className="text-2xl font-bold">Edital de credenciamento nº {c.numero_edital}</h1>
              <p className="text-gray-600">Processo {c.numero_processo}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {c.edital?.arquivo_url && (
                <Button asChild variant="outline">
                  <a href={`${API_URL}${c.edital.arquivo_url}`} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar edital
                  </a>
                </Button>
              )}
              {c.link_pncp && (
                <Button asChild variant="outline">
                  <a href={c.link_pncp} target="_blank" rel="noreferrer">
                    PNCP <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              )}
              {c.inscricoes_abertas && (
                <Button asChild>
                  <Link href={`/credenciamento/${c.id}/inscrever`}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Inscrever-se
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid gap-6 px-4 py-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Objeto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>{c.objeto}</p>
              {c.objeto_detalhado && <p className="whitespace-pre-line text-sm text-gray-600">{c.objeto_detalhado}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Valores da contratação</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-2">
                {c.hipotese === "MERCADO_FLUIDO"
                  ? "Valores de referência — o preço é cotado no momento de cada contratação (art. 79, parágrafo único, IV)."
                  : "Valor fixado no edital (art. 79, parágrafo único, III) — igual para todos os credenciados."}
              </p>
              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-right">Demanda estimada</th>
                    <th className="p-2 text-right">Valor unitário</th>
                  </tr>
                </thead>
                <tbody>
                  {(c.itens || []).map((i: any) => (
                    <tr key={i.numero_item} className="border-t">
                      <td className="p-2">
                        {i.numero_item}. {i.descricao}
                      </td>
                      <td className="p-2 text-right">
                        {i.quantidade_estimada} {String(i.unidade_medida || "").toLowerCase()}
                      </td>
                      <td className="p-2 text-right">{moeda(i.valor_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condições de participação e contratação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <strong>Distribuição da demanda:</strong> {REGRAS[c.regra_distribuicao] ?? "—"}
                {c.regras_distribuicao_texto && <p className="whitespace-pre-line text-gray-600">{c.regras_distribuicao_texto}</p>}
              </div>
              <div>
                <strong>Condições padronizadas:</strong>
                <p className="whitespace-pre-line text-gray-600">{c.condicoes_padronizadas || "-"}</p>
              </div>
              <div>
                <strong>Denúncia:</strong> qualquer das partes pode denunciar o credenciamento com aviso prévio de {c.prazo_denuncia_dias ?? "—"} dia(s) (art. 79, parágrafo único, VI).
              </div>
              <div>
                <strong>Documentos de habilitação exigidos:</strong>
                <ul className="list-disc pl-5 text-gray-600">
                  {(c.exigencias || []).map((e: any) => (
                    <li key={e.id}>
                      {e.descricao} {e.obrigatorio ? "" : "(opcional)"} {e.base_legal ? <span className="text-xs text-gray-400">— {e.base_legal}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Órgão
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{c.orgao?.nome}</p>
              <p>CNPJ {c.orgao?.cnpj}</p>
              <p>
                {c.orgao?.cidade}/{c.orgao?.uf}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Vigência
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Publicação: {dataHora(c.data_publicacao)}</p>
              <p>Inscrições: de {dataHora(c.data_inicio_inscricoes)} até {dataHora(c.data_fim_inscricoes)} (a qualquer tempo durante a vigência)</p>
              <p>Validade do credenciamento: {c.validade_credenciado_meses ? `${c.validade_credenciado_meses} mês(es)` : "até o fim da vigência"}</p>
              <p className="flex items-start gap-1">
                <FileText className="h-4 w-4 mt-0.5" /> {c.amparo_legal}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Credenciados ({c.credenciados?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {!c.credenciados?.length && <p className="text-gray-500">Nenhum credenciado até o momento.</p>}
              {c.credenciados?.map((x: any, k: number) => (
                <p key={k}>
                  {x.razao_social} <span className="text-xs text-gray-500">({x.cnpj}) — desde {dataCurta(x.credenciado_em)}</span>
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
