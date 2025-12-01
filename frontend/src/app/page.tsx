import Link from "next/link"
import Image from "next/image"
import { Shield, FileCheck, Users, ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <Image 
              src="/logo.png" 
              alt="Portal DCP" 
              width={45} 
              height={45}
              className="rounded"
            />
            <div>
              <span className="text-xl font-bold text-slate-800">Portal DCP</span>
              <p className="text-xs text-slate-500">O seu Diário de Compras Públicas</p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/cadastro">
              <Button>Criar Conta</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-slate-800 mb-6">
            Participe de Licitações Públicas de Forma{" "}
            <span className="text-blue-600">Simples e Segura</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Plataforma completa para fornecedores se cadastrarem e participarem de processos 
            licitatórios com transparência e agilidade.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/cadastro">
              <Button size="lg" className="text-lg px-8">
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-12">
          Por que usar o Portal DCP?
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="bg-white rounded-xl p-6 shadow-lg border">
            <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Cadastro Unificado</h3>
            <p className="text-muted-foreground">
              Sistema completo com todos os níveis de habilitação para participação 
              em licitações de prefeituras e câmaras municipais.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border">
            <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
              <FileCheck className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Consulta Automática</h3>
            <p className="text-muted-foreground">
              Dados da empresa preenchidos automaticamente através da consulta à Receita Federal.
              Economize tempo no cadastro.
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border">
            <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Múltiplos Órgãos</h3>
            <p className="text-muted-foreground">
              Acesse licitações de diversos órgãos públicos em uma única plataforma.
              Centralize sua participação.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-800 mb-12">
            Como Funciona
          </h2>
          <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              { step: 1, title: "Crie sua conta", desc: "Informe email e crie uma senha" },
              { step: 2, title: "Complete o cadastro", desc: "Informe o CNPJ e dados da empresa" },
              { step: 3, title: "Envie documentos", desc: "Faça upload das certidões necessárias" },
              { step: 4, title: "Participe", desc: "Busque licitações e envie propostas" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-800 mb-12">
            Benefícios para Fornecedores
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              "Cadastro único para múltiplos órgãos",
              "Consulta automática de dados do CNPJ",
              "Gestão centralizada de documentos",
              "Alertas de novas licitações",
              "Acompanhamento em tempo real",
              "Histórico de participações",
              "Suporte especializado",
              "100% digital e seguro",
            ].map((benefit, i) => (
              <div key={i} className="flex items-center gap-3 p-4 bg-white rounded-lg border">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-slate-700">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Pronto para começar?
          </h2>
          <p className="text-blue-100 mb-8 max-w-xl mx-auto">
            Crie sua conta gratuitamente e comece a participar de licitações públicas hoje mesmo.
          </p>
          <Link href="/cadastro">
            <Button size="lg" variant="secondary" className="text-lg px-8">
              Criar Conta Grátis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Image 
                  src="/logo.png" 
                  alt="Portal DCP" 
                  width={35} 
                  height={35}
                  className="rounded"
                />
                <div>
                  <span className="text-lg font-bold">Portal DCP</span>
                  <p className="text-xs text-slate-500">Diário de Compras Públicas</p>
                </div>
              </div>
              <p className="text-slate-400 text-sm">
                Plataforma de licitações públicas para fornecedores e órgãos governamentais.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Fornecedores</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/cadastro" className="hover:text-white">Criar Conta</Link></li>
                <li><Link href="/login" className="hover:text-white">Entrar</Link></li>
                <li><Link href="#" className="hover:text-white">Como Funciona</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Órgãos</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/orgao-login" className="hover:text-white">Portal do Órgão</Link></li>
                <li><Link href="#" className="hover:text-white">Solicitar Acesso</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Suporte</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="#" className="hover:text-white">Central de Ajuda</Link></li>
                <li><Link href="#" className="hover:text-white">Contato</Link></li>
                <li><Link href="#" className="hover:text-white">Termos de Uso</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-8 text-center text-sm text-slate-400">
            © 2025 Portal DCP - Diário de Compras Públicas. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
