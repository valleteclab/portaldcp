import Link from "next/link"
import Image from "next/image"
import {
  Gavel,
  FileText,
  Package,
  ShoppingCart,
  BarChart2,
  Shield,
  ArrowRight,
  CheckCircle2,
  UserCircle,
  Building2,
  ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1B3A6B] shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-cmlem.png"
              alt="Câmara Municipal de Luís Eduardo Magalhães"
              width={52}
              height={52}
              className="rounded-full bg-white p-1"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).src = "/logo.png"
              }}
            />
            <div>
              <span className="text-white font-bold text-base leading-tight block">
                Câmara Municipal
              </span>
              <span className="text-blue-200 text-xs leading-tight block">
                Luís Eduardo Magalhães — BA
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button
                variant="outline"
                size="sm"
                className="border-white text-white bg-transparent hover:bg-white hover:text-[#1B3A6B] text-xs"
              >
                <UserCircle className="h-4 w-4 mr-1" />
                Acesso Fornecedor
              </Button>
            </Link>
            <Link href="/orgao-login">
              <Button
                size="sm"
                className="bg-white text-[#1B3A6B] hover:bg-blue-100 font-semibold text-xs"
              >
                <Building2 className="h-4 w-4 mr-1" />
                Acesso Órgão
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="py-20"
        style={{
          background: "linear-gradient(135deg, #1B3A6B 0%, #2C5282 60%, #1B3A6B 100%)",
        }}
      >
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-6">
              <Image
                src="/logo-cmlem.png"
                alt="CMLEM"
                width={100}
                height={100}
                className="rounded-full bg-white p-2 shadow-xl"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = "/logo.png"
                }}
              />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
              Portal de Compras e Contratos Públicos
            </h1>
            <p className="text-blue-200 text-lg mb-3 font-medium">
              Câmara Municipal de Luís Eduardo Magalhães
            </p>
            <p className="text-blue-100 text-base mb-10 max-w-2xl mx-auto">
              Sistema integrado de gestão de licitações, contratos, requisições, almoxarifado e
              ordens de serviço — em conformidade com a Lei 14.133/2021.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-white text-[#1B3A6B] hover:bg-blue-50 font-semibold px-8 w-full sm:w-auto"
                >
                  <UserCircle className="mr-2 h-5 w-5" />
                  Sou Fornecedor — Entrar
                </Button>
              </Link>
              <Link href="/orgao-login">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white bg-transparent hover:bg-white/10 px-8 w-full sm:w-auto"
                >
                  <Building2 className="mr-2 h-5 w-5" />
                  Acesso Institucional
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Seção Fornecedor */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold text-[#1B3A6B] mb-3">Para Fornecedores</h2>
            <p className="text-gray-600 text-lg">
              Cadastre-se e participe dos processos de compras da Câmara Municipal
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-10">
            {[
              {
                step: 1,
                icon: UserCircle,
                title: "Crie sua conta",
                desc: "Acesse o portal, informe seus dados e CNPJ. Os dados da empresa são preenchidos automaticamente via Receita Federal.",
              },
              {
                step: 2,
                icon: ClipboardList,
                title: "Envie sua documentação",
                desc: "Faça upload das certidões e habilitações exigidas para participar dos processos licitatórios.",
              },
              {
                step: 3,
                icon: Gavel,
                title: "Participe das licitações",
                desc: "Acompanhe os processos abertos, envie propostas e participe da sala de disputa ao vivo.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center"
              >
                <div className="w-12 h-12 rounded-full bg-[#1B3A6B] text-white flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <item.icon className="h-7 w-7 text-[#1B3A6B] mx-auto mb-3" />
                <h3 className="font-semibold text-[#1B3A6B] mb-2 text-lg">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/cadastro">
              <Button
                size="lg"
                className="bg-[#1B3A6B] hover:bg-[#2C5282] text-white px-10"
              >
                Criar Conta de Fornecedor
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Módulos do Sistema */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-[#1B3A6B] mb-3">O que o sistema oferece</h2>
              <p className="text-gray-600 text-lg">
                Gestão completa do ciclo de compras públicas em uma única plataforma
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Gavel,
                  color: "bg-blue-50",
                  iconColor: "text-[#1B3A6B]",
                  title: "Licitações",
                  desc: "Pregão eletrônico, concorrência, dispensa e mais. Sala de disputa ao vivo e integração automática com o PNCP.",
                },
                {
                  icon: FileText,
                  color: "bg-red-50",
                  iconColor: "text-[#C0392B]",
                  title: "Contratos",
                  desc: "Gestão completa do ciclo contratual — criação, execução, medições, análise por IA e assinatura digital.",
                },
                {
                  icon: Package,
                  color: "bg-green-50",
                  iconColor: "text-green-700",
                  title: "Almoxarifado",
                  desc: "Requisições de materiais, ordens de fornecimento, controle de estoque e fluxo de aprovações.",
                },
                {
                  icon: ShoppingCart,
                  color: "bg-orange-50",
                  iconColor: "text-orange-600",
                  title: "Compras & Demandas",
                  desc: "Planejamento Anual de Contratações (PCA), demandas de aquisição e acompanhamento de processos.",
                },
                {
                  icon: BarChart2,
                  color: "bg-purple-50",
                  iconColor: "text-purple-700",
                  title: "Relatórios",
                  desc: "Análise de economia em licitações, execução contratual e consumo de almoxarifado com exportação.",
                },
                {
                  icon: Shield,
                  color: "bg-blue-50",
                  iconColor: "text-[#2C5282]",
                  title: "Transparência",
                  desc: "Publicação automática no PNCP, dossiê do fiscal e portal de assinaturas digitais com rastreabilidade.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div
                    className={`h-12 w-12 rounded-lg ${item.color} flex items-center justify-center mb-4`}
                  >
                    <item.icon className={`h-6 w-6 ${item.iconColor}`} />
                  </div>
                  <h3 className="font-semibold text-[#1B3A6B] text-lg mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Faixa de conformidade */}
      <section className="py-12 bg-[#1B3A6B]">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
                <Shield className="h-7 w-7 text-white" />
              </div>
            </div>
            <h3 className="text-white text-2xl font-bold mb-2">
              Em conformidade com a Lei 14.133/2021
            </h3>
            <p className="text-blue-200 text-base">
              Nova Lei de Licitações e Contratos Administrativos. Sistema auditável, seguro e
              transparente para todos os processos de compras públicas.
            </p>
            <div className="flex flex-wrap justify-center gap-6 mt-8">
              {[
                "Pregão Eletrônico",
                "Dispensa Eletrônica",
                "Concorrência",
                "Registro de Preços",
                "PNCP Integrado",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-blue-100">
                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: "#0F2547" }} className="text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/logo-cmlem.png"
                  alt="CMLEM"
                  width={48}
                  height={48}
                  className="rounded-full bg-white p-1"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).src = "/logo.png"
                  }}
                />
                <div>
                  <span className="text-white font-bold block">Câmara Municipal</span>
                  <span className="text-blue-300 text-sm">Luís Eduardo Magalhães — BA</span>
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                Portal de Gestão de Compras e Contratos Públicos da Câmara Municipal de Luís
                Eduardo Magalhães.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Fornecedores</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <Link href="/cadastro" className="hover:text-white transition-colors">
                    Criar Conta
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white transition-colors">
                    Entrar
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Institucional</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <Link href="/orgao-login" className="hover:text-white transition-colors">
                    Acesso do Órgão
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Suporte
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-6 text-center text-sm text-slate-400">
            © 2025 Câmara Municipal de Luís Eduardo Magalhães — BA. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
