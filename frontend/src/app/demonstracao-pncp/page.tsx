import Link from "next/link";
import { ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const categories = [
  {
    title: "Credenciamento e anexos",
    description: "Edital de credenciamento fictício, requisitos e anexos.",
    detail: "/credenciamento/d0000000-0000-4000-8000-000000000301",
    documents: [
      [
        "Edital de credenciamento",
        "/api/demo-docs/edital-credenciamento-demo.pdf",
      ],
      [
        "Anexo do credenciamento",
        "/api/demo-docs/anexo-credenciamento-demo.pdf",
      ],
    ],
  },
  {
    title: "Aviso de contratação direta e anexos",
    description:
      "Dispensa eletrônica fictícia acompanhada de termo de referência.",
    detail: "/licitacoes/d0000000-0000-4000-8000-000000000102",
    documents: [
      [
        "Aviso de contratação direta",
        "/api/demo-docs/aviso-contratacao-direta-demo.pdf",
      ],
      [
        "Termo de referência",
        "/api/demo-docs/termo-referencia-contratacao-direta-demo.pdf",
      ],
    ],
  },
  {
    title: "Edital de licitação e anexos",
    description: "Pregão eletrônico fictício para registro de preços.",
    detail: "/licitacoes/d0000000-0000-4000-8000-000000000101",
    documents: [
      [
        "Edital do pregão eletrônico",
        "/api/demo-docs/edital-pregao-eletronico-demo.pdf",
      ],
      ["Anexo do edital", "/api/demo-docs/anexo-edital-pregao-demo.pdf"],
    ],
  },
  {
    title: "Ata de registro de preços",
    description: "Ata fictícia vinculada ao pregão eletrônico de demonstração.",
    detail: "/atas/d0000000-0000-4000-8000-000000000401",
    documents: [
      [
        "Ata de registro de preços",
        "/api/demo-docs/ata-registro-precos-demo.pdf",
      ],
    ],
  },
  {
    title: "Contrato e termo aditivo",
    description: "Contrato fictício com acréscimo demonstrativo de 10%.",
    detail: "/contratos/d0000000-0000-4000-8000-000000000501",
    documents: [
      [
        "Contrato administrativo",
        "/api/demo-docs/contrato-administrativo-demo.pdf",
      ],
      ["1º termo aditivo", "/api/demo-docs/termo-aditivo-demo.pdf"],
    ],
  },
];

export default function DemonstracaoPncpPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b bg-white">
        <div className="container mx-auto px-4 py-10">
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="h-9 w-9 text-blue-700" />
            <div>
              <Badge
                variant="outline"
                className="mb-2 border-red-300 bg-red-50 text-red-700"
              >
                Ambiente de homologação
              </Badge>
              <h1 className="text-3xl font-bold text-slate-900">
                Demonstração de integração com o PNCP
              </h1>
            </div>
          </div>
          <p className="max-w-4xl text-slate-600">
            Todos os órgãos, fornecedores, números, datas, valores e documentos
            desta página são fictícios e existem exclusivamente para validação
            técnica do Portal DCP. Nenhum registro possui validade jurídica ou
            produz obrigação financeira.
          </p>
        </div>
      </section>

      <section className="container mx-auto grid gap-5 px-4 py-8 lg:grid-cols-2">
        {categories.map((category) => (
          <Card key={category.title}>
            <CardHeader>
              <CardTitle>{category.title}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button asChild>
                <Link href={category.detail}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver publicação no portal
                </Link>
              </Button>
              <div className="space-y-2 border-t pt-4">
                {category.documents.map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-700 hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    {label}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
