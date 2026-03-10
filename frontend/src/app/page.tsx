import Link from "next/link"
import Image from "next/image"

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F0F2F5]" style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>

      {/* ── Gov Bar ── */}
      <div className="bg-[#071D41] h-[34px] flex items-center justify-between px-6 md:px-12 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🇧🇷</span>
          <span className="text-[11.5px] text-white/65">
            Câmara Municipal de  <strong className="text-[#FFCD07] font-bold">Luis Eduardo Magalhães</strong>
            &nbsp;·&nbsp; Poder Legislativo Municipal
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-5">
          <a href="#" className="text-[11px] text-white/50 hover:text-white/90 no-underline transition-colors">Acessibilidade</a>
          <a href="#" className="text-[11px] text-white/50 hover:text-white/90 no-underline transition-colors">Mapa do site</a>
          <a href="#" className="text-[11px] text-white/50 hover:text-white/90 no-underline transition-colors">Política de privacidade</a>
        </div>
      </div>

      {/* ── Header ── */}
      <header className="bg-white border-b-2 border-[#1351B4] h-[72px] flex items-center justify-between px-6 md:px-12 shadow-sm flex-shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <Image src="/logo.png" alt="CMLEM" width={48} height={48} className="object-contain" />
          <div className="w-px h-9 bg-[#D9DDE3]" />
          <div>
            <div className="text-[15px] font-bold text-[#0C326F] leading-tight">
              Câmara Municipal de Luís Eduardo Magalhães
            </div>
            <div className="text-[11.5px] text-[#718096] mt-0.5">Portal de Compras Públicas</div>
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 bg-[#F0F7F0] border border-[#B7DFBA] rounded px-2.5 py-1.5 mr-2">
            <span className="text-[11.5px] text-[#168821] font-semibold">🔒 Site oficial</span>
          </div>
          <a
            href="https://cmlem.ba.gov.br/"
            className="text-[13px] font-medium text-[#1351B4] px-4 py-[7px] rounded border border-transparent hover:bg-[#EAF0FB] hover:border-[#1351B4]/20 transition-all"
          >
            Ajuda
          </a>
          <Link
            href="/cadastro"
            className="text-[13px] font-semibold text-white px-4 py-2 rounded bg-[#1351B4] border border-[#1351B4] hover:bg-[#0C326F] hover:border-[#0C326F] transition-all"
          >
            Criar Conta
          </Link>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 py-10">
        <div className="max-w-[1120px] mx-auto px-6">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-8">
            <span className="text-[12.5px] text-[#718096]">Início</span>
            <span className="text-[12.5px] text-[#D9DDE3]">/</span>
            <span className="text-[12.5px] text-[#1351B4] font-semibold">Acesso ao Portal</span>
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 items-start">

            {/* ── Left panel ── */}
            <div>
              {/* Title */}
              <h1 className="text-[clamp(22px,2.8vw,32px)] font-bold text-[#071D41] leading-tight tracking-tight mb-3">
                Portal de Compras<br />
                da <span className="text-[#1351B4]">Câmara Municipal</span>
              </h1>

              {/* Description */}
              <p className="text-[15px] text-[#4A5568] leading-[1.75] mb-7 max-w-[500px]">
                Plataforma oficial para gestão de licitações, contratos, pregões eletrônicos e
                credenciamentos da Câmara Municipal de Luís Eduardo Magalhães.
                Acesse com segurança em{" "}
                <strong className="text-[#1B1C1E]">compras.cmlem.ba.gov.br</strong>.
              </p>

              {/* Info card */}
              <div className="bg-[#EAF0FB] border border-[#1351B4]/15 border-l-4 border-l-[#1351B4] rounded px-[18px] py-[14px] flex gap-3 items-start mb-8">
                <span className="text-[18px] flex-shrink-0 mt-px">⚖️</span>
                <p className="text-[13px] text-[#0C326F] leading-[1.55]">
                  Em conformidade com a{" "}
                  <strong className="font-bold">Lei Federal nº 14.133/2021</strong> —
                  Nova Lei de Licitações e Contratos Administrativos do Governo Federal.
                </p>
              </div>

              {/* Section title */}
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className="text-[12px] font-bold tracking-[1.4px] uppercase text-[#718096]">
                  Serviços disponíveis
                </span>
                <div className="flex-1 h-px bg-[#D9DDE3]" />
              </div>

              {/* Feature list */}
              <div className="flex flex-col gap-2.5">
                {[
                  { icon: "📋", title: "Licitações e Pregões Eletrônicos", sub: "Processos públicos com disputa em tempo real" },
                  { icon: "🏢", title: "Cadastro e Habilitação de Fornecedores", sub: "Empresas e pessoas físicas participantes" },
                  { icon: "📄", title: "Contratos e Atas de Registro de Preços", sub: "Gestão completa de instrumentos contratuais" },
                  { icon: "🔍", title: "Transparência e Publicidade dos Atos", sub: "Publicação conforme a legislação vigente" },
                ].map(({ icon, title, sub }) => (
                  <div
                    key={title}
                    className="flex items-center gap-3.5 bg-white border border-[#D9DDE3] rounded-md px-4 py-3 hover:border-[#1351B4]/30 hover:shadow-sm transition-all"
                  >
                    <div className="w-[34px] h-[34px] rounded-md bg-[#EAF0FB] flex items-center justify-center text-base flex-shrink-0">
                      {icon}
                    </div>
                    <div>
                      <p className="text-[13.5px] font-semibold text-[#1B1C1E] leading-tight">{title}</p>
                      <span className="text-[11.5px] text-[#718096]">{sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Login card (right, sticky) ── */}
            <div className="bg-white border border-[#D9DDE3] rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.08)] overflow-hidden lg:sticky lg:top-8">
              {/* Top accent */}
              <div className="h-1 bg-gradient-to-r from-[#071D41] via-[#1351B4] to-[#4A90D9]" />

              <div className="px-8 pt-8 pb-7">
                {/* Card head */}
                <div className="mb-6">
                  <h2 className="text-[19px] font-bold text-[#071D41] tracking-tight mb-1">Acesse sua Conta</h2>
                  <p className="text-[13px] text-[#718096]">Selecione o perfil desejado para continuar</p>
                </div>

                {/* Profile label */}
                <div className="text-[10.5px] font-bold tracking-[1.4px] uppercase text-[#718096] mb-2.5">
                  Selecionar perfil de acesso
                </div>

                {/* Profile cards */}
                <div className="flex flex-col gap-2.5 mb-6">
                  {/* Fornecedor */}
                  <Link
                    href="/login"
                    className="group flex items-center gap-3 border-[1.5px] border-[#D9DDE3] rounded-md px-3.5 py-3 bg-[#FAFBFC] relative overflow-hidden transition-all duration-200 hover:bg-white hover:border-[#1351B4] hover:shadow-[0_3px_12px_rgba(19,81,180,0.1)] hover:-translate-y-px no-underline"
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1351B4] opacity-0 group-hover:opacity-100 transition-opacity rounded-l-md" />
                    <div className="w-10 h-10 rounded-md bg-[#EAF0FB] flex items-center justify-center text-[19px] flex-shrink-0">
                      🏢
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[13.5px] font-bold text-[#071D41] mb-0.5">Fornecedor</h4>
                      <p className="text-[11.5px] text-[#718096] leading-snug">Empresas e pessoas físicas participantes de licitações</p>
                    </div>
                    <div className="w-[26px] h-[26px] rounded border border-[#D9DDE3] flex items-center justify-center text-[#718096] bg-white text-base leading-none flex-shrink-0 transition-all group-hover:bg-[#1351B4] group-hover:border-[#1351B4] group-hover:text-white">
                      ›
                    </div>
                  </Link>

                  {/* Câmara Municipal */}
                  <Link
                    href="/orgao-login"
                    className="group flex items-center gap-3 border-[1.5px] border-[#D9DDE3] rounded-md px-3.5 py-3 bg-[#FAFBFC] relative overflow-hidden transition-all duration-200 hover:bg-white hover:border-[#C0272D] hover:shadow-[0_3px_12px_rgba(192,39,45,0.1)] hover:-translate-y-px no-underline"
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#C0272D] opacity-0 group-hover:opacity-100 transition-opacity rounded-l-md" />
                    <div className="w-10 h-10 rounded-md bg-[#FFF0F0] flex items-center justify-center text-[19px] flex-shrink-0">
                      🏛️
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[13.5px] font-bold text-[#071D41] mb-0.5">Câmara Municipal</h4>
                      <p className="text-[11.5px] text-[#718096] leading-snug">Gestores e servidores da CMLEM</p>
                    </div>
                    <div className="w-[26px] h-[26px] rounded border border-[#D9DDE3] flex items-center justify-center text-[#718096] bg-white text-base leading-none flex-shrink-0 transition-all group-hover:bg-[#C0272D] group-hover:border-[#C0272D] group-hover:text-white">
                      ›
                    </div>
                  </Link>
                </div>

                {/* Divider */}
                <hr className="border-t border-[#D9DDE3] mb-5" />

                {/* Register */}
                <div className="text-center text-[13px] text-[#718096] leading-relaxed">
                  Não possui cadastro?<br />
                  <Link href="/cadastro" className="text-[#1351B4] font-semibold hover:underline">
                    Criar Conta de Fornecedor
                  </Link>
                </div>
              </div>

              {/* Trust bar */}
              <div className="bg-[#F4F6F9] border-t border-[#D9DDE3] px-8 py-3 flex items-center justify-around flex-wrap gap-2">
                {[
                  "🔒 Conexão SSL",
                  "✅ LGPD Conforme",
                  "🇧🇷 Gov. Municipal · BA",
                ].map((item) => (
                  <span key={item} className="text-[11px] text-[#718096] font-medium">{item}</span>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#071D41] px-6 md:px-12 py-7 flex items-center justify-between flex-wrap gap-3 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <strong className="text-[12px] text-white/85 font-semibold">Câmara Municipal de Luís Eduardo Magalhães</strong>
          <p className="text-[12px] text-white/50">© {new Date().getFullYear()} — Todos os direitos reservados · compras.cmlem.ba.gov.br</p>
        </div>
        <div className="flex gap-4 flex-wrap">
          {["Política de Privacidade", "Termos de Uso", "Fale Conosco", "Acessibilidade"].map((label) => (
            <a key={label} href="#" className="text-[12px] text-white/45 hover:text-white/85 transition-colors no-underline">
              {label}
            </a>
          ))}
        </div>
      </footer>

    </div>
  )
}
