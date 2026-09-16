"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Download,
  FileText,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CredenciamentoPublico {
  id: string;
  numero_edital: string;
  numero_processo: string;
  tipo: string;
  status: string;
  objeto: string;
  objeto_detalhado?: string;
  justificativa?: string;
  requisitos_habilitacao?: string;
  requisitos_tecnicos?: string;
  documentos_exigidos?: string;
  valor_estimado?: number | string;
  forma_pagamento?: string;
  data_publicacao?: string;
  data_inicio_inscricoes?: string;
  data_fim_inscricoes?: string;
  inscricao_permanente: boolean;
  edital_url?: string;
  anexos_url?: string;
  amparo_legal?: string;
  orgao: {
    nome: string;
    cnpj: string;
    cidade: string;
    uf: string;
  };
}

export default function CredenciamentoPublicoDetalhePage() {
  const params = useParams();
  const id = params.id as string;
  const [credenciamento, setCredenciamento] =
    useState<CredenciamentoPublico | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/api/credenciamento/publicos/${id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Credenciamento não encontrado");
        setCredenciamento(await response.json());
      })
      .catch(() => setCredenciamento(null))
      .finally(() => setLoading(false));
  }, [id]);

  const formatarData = (data?: string) =>
    data ? new Date(data).toLocaleDateString("pt-BR") : "-";

  const formatarMoeda = (valor?: number | string) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando...
      </div>
    );
  }

  if (!credenciamento) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Credenciamento público não encontrado.</p>
        <Button asChild>
          <Link href="/credenciamento">Voltar</Link>
        </Button>
      </div>
    );
  }

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
              <div className="mb-2 flex gap-2">
                <Badge>{credenciamento.status}</Badge>
                <Badge variant="outline">
                  {credenciamento.tipo === "PRE_QUALIFICACAO"
                    ? "Pré-qualificação"
                    : "Credenciamento"}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold">
                Edital nº {credenciamento.numero_edital}
              </h1>
              <p className="text-gray-600">
                Processo {credenciamento.numero_processo}
              </p>
            </div>
            <div className="flex gap-2">
              {credenciamento.edital_url && (
                <Button asChild>
                  <a
                    href={credenciamento.edital_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar edital
                  </a>
                </Button>
              )}
              {credenciamento.anexos_url && (
                <Button variant="outline" asChild>
                  <a
                    href={credenciamento.anexos_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Baixar anexos
                  </a>
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
              <p>{credenciamento.objeto}</p>
              {credenciamento.objeto_detalhado && (
                <p className="whitespace-pre-line text-sm text-gray-600">
                  {credenciamento.objeto_detalhado}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Condições de participação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <strong>Habilitação:</strong>
                <p className="whitespace-pre-line text-gray-600">
                  {credenciamento.requisitos_habilitacao || "-"}
                </p>
              </div>
              <div>
                <strong>Requisitos técnicos:</strong>
                <p className="whitespace-pre-line text-gray-600">
                  {credenciamento.requisitos_tecnicos || "-"}
                </p>
              </div>
              <div>
                <strong>Documentos exigidos:</strong>
                <p className="whitespace-pre-line text-gray-600">
                  {credenciamento.documentos_exigidos || "-"}
                </p>
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
              <p className="font-medium">{credenciamento.orgao.nome}</p>
              <p>CNPJ {credenciamento.orgao.cnpj}</p>
              <p>
                {credenciamento.orgao.cidade}/{credenciamento.orgao.uf}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Prazos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Publicação: {formatarData(credenciamento.data_publicacao)}</p>
              <p>
                Início: {formatarData(credenciamento.data_inicio_inscricoes)}
              </p>
              <p>
                Fim:{" "}
                {credenciamento.inscricao_permanente
                  ? "Inscrição permanente"
                  : formatarData(credenciamento.data_fim_inscricoes)}
              </p>
              <p>
                Valor estimado: {formatarMoeda(credenciamento.valor_estimado)}
              </p>
              <p>Amparo legal: {credenciamento.amparo_legal || "-"}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
