'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { API_URL, getAssetUrl } from '@/lib/api'
import { Calendar, FileSpreadsheet, Home, LogIn } from 'lucide-react'

interface OrgaoPublico {
  nome: string
  cnpj: string
  tipo?: string
  esfera?: string
  cidade?: string
  uf?: string
  logo_url?: string
}

interface PcaResumo {
  id: string
  ano_exercicio: number
  status: string
  data_publicacao?: string
  updated_at?: string
  valor_total_estimado: number | string
  quantidade_itens: number
  nome_unidade?: string
}

function moeda(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarCnpj(cnpj: string) {
  const limpo = (cnpj || '').replace(/\D/g, '')
  return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function logoOrgao(orgao?: OrgaoPublico | null) {
  if (orgao?.logo_url) return getAssetUrl(orgao.logo_url)
  return '/logo_cmlem.png'
}

export default function PcaOrgaoPage() {
  const params = useParams<{ cnpj: string }>()
  const [orgao, setOrgao] = useState<OrgaoPublico | null>(null)
  const [pcas, setPcas] = useState<PcaResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      setErro('')

      try {
        const response = await fetch(`${API_URL}/api/pca/publico/${params.cnpj}`, { cache: 'no-store' })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.message || 'Nenhum PCA público encontrado')
        }

        const data = await response.json()
        setOrgao(data.orgao)
        setPcas(data.pcas || [])
      } catch (error) {
        setErro(error instanceof Error ? error.message : 'Erro ao carregar PCAs públicos')
      } finally {
        setLoading(false)
      }
    }

    carregar()
  }, [params.cnpj])

  return (
    <main
      id="conteudo-principal"
      className="pca-publica min-h-screen bg-[#F0F2F5] text-[#1B1C1E]"
    >
      <SkipLinks />
      <PortalHeader />

      <section className="bg-white border-b border-[#D9DDE3]" aria-labelledby="titulo-pagina-pca">
        <div className="mx-auto max-w-[1760px] px-6 py-8 lg:px-10 xl:px-14">
          <nav aria-label="Você está aqui" className="mb-6 flex items-center gap-2 text-[12.5px] text-[#718096]">
            <Home aria-hidden="true" className="h-4 w-4 text-[#1351B4]" />
            <span>Início</span>
            <span>/</span>
            <span className="font-semibold text-[#1351B4]">PCAs publicados</span>
          </nav>

          {loading ? (
            <p className="py-12 text-center text-[#4A5568]">Carregando PCAs...</p>
          ) : erro || !orgao ? (
            <div className="py-12">
              <h1 className="text-3xl font-bold text-[#071D41]">Nenhum PCA encontrado</h1>
              <p className="mt-3 text-[#4A5568]">{erro}</p>
            </div>
          ) : (
            <div className="flex items-start gap-5">
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-md border border-[#D9DDE3] bg-white p-3 shadow-sm">
                <img src={logoOrgao(orgao)} alt={`Brasão ou logomarca de ${orgao.nome}`} className="max-h-full max-w-full object-contain" />
              </div>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#718096]">Consulta pública</p>
                <h1 id="titulo-pagina-pca" className="mt-2 text-[clamp(26px,3vw,40px)] font-bold leading-tight text-[#071D41]">
                  {orgao.nome}
                </h1>
                <p className="mt-3 text-[15px] text-[#4A5568]">
                  CNPJ {formatarCnpj(orgao.cnpj)} · {[orgao.cidade, orgao.uf].filter(Boolean).join(' - ')}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {!loading && orgao && (
        <section id="lista-pcas" aria-labelledby="titulo-lista-pcas" className="mx-auto max-w-[1760px] px-6 py-8 lg:px-10 xl:px-14">
          <div className="mb-5 flex items-center gap-2">
            <Calendar aria-hidden="true" className="h-5 w-5 text-[#1351B4]" />
            <h2 id="titulo-lista-pcas" className="text-2xl font-bold text-[#071D41]">Planos por ano</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5" aria-live="polite">
            {pcas.map((pca) => (
              <Link
                key={pca.id}
                href={`/pca/${orgao.cnpj}/${pca.ano_exercicio}`}
                aria-label={`Abrir PCA ${pca.ano_exercicio} de ${orgao.nome}`}
                className="rounded-lg border border-[#D9DDE3] bg-white p-5 shadow-sm transition hover:border-[#1351B4] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[1px] text-[#718096]">PCA</p>
                    <h3 className="mt-1 text-3xl font-bold text-[#071D41]">{pca.ano_exercicio}</h3>
                  </div>
                  <FileSpreadsheet aria-hidden="true" className="h-7 w-7 text-[#1351B4]" />
                </div>
                <div className="mt-5 space-y-2 text-sm text-[#4A5568]">
                  <p><strong className="text-[#071D41]">Valor:</strong> {moeda(pca.valor_total_estimado)}</p>
                  <p><strong className="text-[#071D41]">Itens:</strong> {Number(pca.quantidade_itens || 0).toLocaleString('pt-BR')}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function SkipLinks() {
  return (
    <nav aria-label="Atalhos de acessibilidade" className="skip-links">
      <a href="#conteudo-principal">Ir para o conteúdo</a>
      <a href="#lista-pcas">Ir para a lista de PCAs</a>
    </nav>
  )
}

function PortalHeader() {
  return (
    <>
      <div className="flex min-h-[34px] items-center justify-between gap-4 bg-[#071D41] px-6 py-1 md:px-12">
        <span className="text-[11.5px] text-white/70">
          Câmara Municipal de <strong className="font-bold text-[#FFCD07]">Luis Eduardo Magalhães</strong> · Poder Legislativo Municipal
        </span>
        <div className="hidden items-center gap-4 sm:flex" aria-label="Barra de acessibilidade">
          <a href="#conteudo-principal" className="text-[11px] font-semibold text-white/80 hover:text-white">Conteúdo</a>
          <a href="#acessibilidade" className="text-[11px] font-semibold text-white/80 hover:text-white">Acessibilidade</a>
          <a href="https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/acessibilidade-digital/modelo-de-acessibilidade" className="text-[11px] font-semibold text-white/80 hover:text-white">
            eMAG
          </a>
        </div>
      </div>
      <header role="banner" className="flex min-h-[80px] items-center justify-between gap-4 border-b-2 border-[#1351B4] bg-white px-6 py-3 shadow-sm md:px-12">
        <Link href="/" className="flex items-center gap-4">
          <img src="/logo_cmlem.png" alt="Brasão da Câmara Municipal de Luís Eduardo Magalhães" className="h-14 w-14 object-contain" />
          <div className="h-10 w-px bg-[#D9DDE3]" />
          <div>
            <div className="text-[16px] font-bold leading-tight text-[#0C326F]">Câmara Municipal de Luís Eduardo Magalhães</div>
            <div className="mt-0.5 text-[12.5px] text-[#718096]">Portal de Compras Públicas</div>
          </div>
        </Link>
        <Link href="/orgao-login" className="inline-flex items-center gap-2 rounded-md bg-[#1351B4] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0C326F]" aria-label="Entrar na área administrativa do órgão">
          <LogIn aria-hidden="true" className="h-4 w-4" />
          Entrar
        </Link>
      </header>
    </>
  )
}
