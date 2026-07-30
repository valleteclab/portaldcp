import Link from "next/link"

const recursos = [
  {
    titulo: "Licitações e contratações",
    descricao: "Publicação e gestão de editais, avisos e disputas eletrônicas.",
  },
  {
    titulo: "Contratos e atas",
    descricao: "Gestão de contratos, termos aditivos e atas de registro de preços.",
  },
  {
    titulo: "Órgãos e fornecedores",
    descricao: "Ambientes separados para agentes públicos e participantes.",
  },
  {
    titulo: "Transparência pública",
    descricao: "Consulta pública dos atos e documentos de cada órgão atendido.",
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-sm font-black tracking-wide text-white">
              DCP
            </span>
            <span>
              <strong className="block text-lg leading-tight text-slate-950">PortalDCP</strong>
              <span className="text-xs text-slate-500">Diário de Compras Públicas</span>
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/licitacoes"
              className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex"
            >
              Consultar publicações
            </Link>
            <Link
              href="/orgao-login"
              className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
            >
              Acessar plataforma
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 text-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
            <div>
              <span className="inline-flex rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-100">
                Plataforma privada de tecnologia para contratações públicas
              </span>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Tecnologia para órgãos públicos comprarem com transparência.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-100/85">
                O PortalDCP é uma plataforma multiórgão para gestão de licitações,
                contratações diretas, credenciamentos, atas, contratos e termos aditivos,
                preparada para integração e publicação de atos no PNCP.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/demonstracao-pncp"
                  className="rounded-lg bg-white px-5 py-3 text-sm font-bold text-blue-900 hover:bg-blue-50"
                >
                  Ver demonstração pública
                </Link>
                <Link
                  href="/licitacoes"
                  className="rounded-lg border border-white/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
                >
                  Consultar processos
                </Link>
              </div>
            </div>

            <aside className="rounded-2xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
                Quem utiliza
              </p>
              <h2 className="mt-3 text-2xl font-bold">Uma plataforma, diversos órgãos.</h2>
              <p className="mt-3 leading-7 text-blue-100/80">
                Cada órgão ou entidade pública possui ambiente próprio, usuários,
                processos e identidade institucional, com gestão centralizada e
                segregação dos dados.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Link
                  href="/orgao-login"
                  className="rounded-xl bg-white p-4 text-slate-950 hover:bg-blue-50"
                >
                  <strong className="block text-sm">Órgãos e entidades</strong>
                  <span className="mt-1 block text-xs text-slate-500">Gestores e agentes públicos</span>
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl bg-white p-4 text-slate-950 hover:bg-blue-50"
                >
                  <strong className="block text-sm">Fornecedores</strong>
                  <span className="mt-1 block text-xs text-slate-500">Empresas participantes</span>
                </Link>
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
              Gestão completa
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Do planejamento à execução contratual
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Recursos desenvolvidos para apoiar a Administração Pública no cumprimento
              da Lei nº 14.133/2021 e na publicidade dos atos de contratação.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recursos.map((recurso, indice) => (
              <article
                key={recurso.titulo}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-sm font-black text-blue-700">
                  {String(indice + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 font-bold text-slate-950">{recurso.titulo}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{recurso.descricao}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 py-14 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Transparência e integração institucional
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-slate-600">
                O PortalDCP organiza e disponibiliza informações de contratações dos órgãos
                atendidos. A demonstração pública apresenta exemplos fictícios preparados
                para validação da plataforma e do fluxo de integração com o PNCP.
              </p>
            </div>
            <Link
              href="/demonstracao-pncp"
              className="inline-flex rounded-lg border border-blue-700 px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50"
            >
              Acessar demonstração
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 px-6 py-9 sm:flex-row sm:items-center">
          <div>
            <strong className="text-white">PortalDCP — Diário de Compras Públicas</strong>
            <p className="mt-1 text-xs text-slate-500">
              Plataforma privada de tecnologia para a Administração Pública.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} PortalDCP · portaldcp.com.br
          </p>
        </div>
      </footer>
    </div>
  )
}
