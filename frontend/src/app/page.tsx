import Link from "next/link"
import Image from "next/image"
import { User, Building2, ChevronRight, ShieldCheck, FileText, Users, BarChart2 } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left Panel */}
      <div className="flex-1 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 text-white flex flex-col justify-between p-8 md:p-14 min-h-[340px] md:min-h-screen">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <Image
              src="/logo.png"
              alt="Portal DCP"
              width={52}
              height={52}
              className="rounded-lg bg-white/10 p-1"
            />
            <div>
              <span className="text-2xl font-bold tracking-tight">Portal DCP</span>
              <p className="text-xs text-blue-200">Diário de Compras Públicas</p>
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
            Bem-vindo ao Portal DCP!
          </h1>

          {/* Description */}
          <p className="text-blue-100 text-base md:text-lg mb-4 leading-relaxed">
            Plataforma completa para gestão de compras públicas, em conformidade com a{" "}
            <strong className="text-white">Lei 14.133/2021</strong> (Nova Lei de Licitações).
          </p>
          <p className="text-blue-200 text-sm md:text-base mb-8 leading-relaxed">
            Órgãos públicos gerenciam licitações, contratos, credenciamentos e contratações diretas.
            Fornecedores se cadastram, enviam propostas e participam de pregões eletrônicos com
            transparência e segurança.
          </p>

          {/* Features */}
          <ul className="space-y-3">
            {[
              { icon: FileText, label: "Licitações e pregões eletrônicos" },
              { icon: ShieldCheck, label: "Conformidade com a Lei 14.133/2021" },
              { icon: Users, label: "Gestão de fornecedores e órgãos" },
              { icon: BarChart2, label: "Transparência e publicidade dos atos" },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-blue-100 text-sm">
                <div className="h-7 w-7 rounded-full bg-blue-700/60 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-blue-200" />
                </div>
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-blue-300 text-xs mt-10">
          © {new Date().getFullYear()} Portal DCP — Todos os direitos reservados.
        </p>
      </div>

      {/* Right Panel */}
      <div className="flex-1 bg-white flex flex-col justify-center px-8 md:px-16 py-12">
        {/* Top links */}
        <div className="hidden md:flex justify-end gap-6 text-sm text-blue-700 font-medium mb-12">
          <Link href="/cadastro" className="hover:underline">Criar Conta</Link>
          <Link href="#" className="hover:underline">Perguntas Frequentes</Link>
        </div>

        <div className="max-w-sm mx-auto w-full">
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Acesse sua Conta</h2>
          <p className="text-slate-500 text-sm mb-8">Selecione o perfil desejado</p>

          {/* Profile Options */}
          <div className="space-y-4">
            {/* Fornecedor */}
            <Link
              href="/login"
              className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
            >
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 group-hover:text-blue-700">Fornecedor</p>
                <p className="text-xs text-slate-500">Empresas e pessoas físicas que participam de licitações</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </Link>

            {/* Governo */}
            <Link
              href="/orgao-login"
              className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
            >
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 group-hover:text-blue-700">Governo</p>
                <p className="text-xs text-slate-500">Órgãos públicos, prefeituras e câmaras municipais</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </Link>
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-slate-500 mt-8">
            Não tem cadastro?{" "}
            <Link href="/cadastro" className="text-blue-600 font-medium hover:underline">
              Criar Conta de Fornecedor
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
