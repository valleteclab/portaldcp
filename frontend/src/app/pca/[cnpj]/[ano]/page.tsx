'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { API_URL, getAssetUrl } from '@/lib/api'
import { baixarXlsxPca } from '@/lib/pca-export'
import { Calendar, Download, Home, LogIn, Search } from 'lucide-react'

interface ItemPcaPublico {
  id: string
  numero_item: number
  categoria: string
  status: string
  descricao_objeto: string
  valor_estimado: number | string
  valor_unitario_estimado?: number | string | null
  quantidade_estimada?: number | string | null
  unidade_medida?: string
  unidade_requisitante?: string
  codigo_item_catalogo?: string
  nome_classe?: string
  catalogo_utilizado?: string
  classificacao_catalogo?: string
  codigo_classe?: string
  codigo_pdm?: string
  nome_pdm?: string
  valor_orcamentario_exercicio?: number | string | null
  renovacao_contrato?: string
  trimestre_previsto?: number | string | null
  codigo_grupo?: string
  nome_grupo?: string
}

interface OrgaoPublico {
  nome: string
  cnpj: string
  esfera?: string
  tipo?: string
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
}

interface PcaPublico extends PcaResumo {
  numero_pca: string
  codigo_unidade?: string
  nome_unidade?: string
  orgao: OrgaoPublico
  itens: ItemPcaPublico[]
}

const categorias: Record<string, string> = {
  MATERIAL: 'Material',
  SERVICO: 'Serviço',
  OBRA: 'Obras',
  SERVICO_ENGENHARIA: 'Serviços de Engenharia',
  SOLUCAO_TIC: 'Soluções de TIC',
  LOCACAO_IMOVEL: 'Locação de Imóveis',
  ALIENACAO: 'Alienação',
}

function moeda(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function numero(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString('pt-BR')
}

function formatarCnpj(cnpj: string) {
  const limpo = (cnpj || '').replace(/\D/g, '')
  return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function poderOrgao(tipo?: string) {
  return tipo === 'CAMARA' ? 'Legislativo' : 'Executivo'
}

function logoOrgao(orgao?: OrgaoPublico | null) {
  if (orgao?.logo_url) return getAssetUrl(orgao.logo_url)
  return '/logo_cmlem.png'
}

function normalizarBusca(valor: unknown) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function montarIdItemPca(pca: PcaPublico, item: ItemPcaPublico) {
  return `${formatarCnpj(pca.orgao.cnpj)}-${pca.codigo_unidade || '1'}-${String(item.numero_item).padStart(6, '0')}/${pca.ano_exercicio}`
}

export default function PcaPublicoPage() {
  const params = useParams<{ cnpj: string; ano: string }>()
  const [pca, setPca] = useState<PcaPublico | null>(null)
  const [anos, setAnos] = useState<PcaResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      setErro('')

      try {
        const [pcaResponse, anosResponse] = await Promise.all([
          fetch(`${API_URL}/api/pca/publico/${params.cnpj}/${params.ano}`, { cache: 'no-store' }),
          fetch(`${API_URL}/api/pca/publico/${params.cnpj}`, { cache: 'no-store' }),
        ])

        if (!pcaResponse.ok) {
          const data = await pcaResponse.json().catch(() => null)
          throw new Error(data?.message || 'PCA público não encontrado')
        }

        setPca(await pcaResponse.json())

        if (anosResponse.ok) {
          const data = await anosResponse.json()
          setAnos(data.pcas || [])
        }
      } catch (error) {
        setErro(error instanceof Error ? error.message : 'Erro ao carregar PCA público')
      } finally {
        setLoading(false)
      }
    }

    carregar()
  }, [params.ano, params.cnpj])

  const resumoCategorias = useMemo(() => {
    const mapa = new Map<string, { categoria: string; quantidade: number; valor: number }>()

    for (const item of pca?.itens || []) {
      const chave = item.categoria || 'SERVICO'
      const atual = mapa.get(chave) || {
        categoria: categorias[chave] || chave,
        quantidade: 0,
        valor: 0,
      }
      atual.quantidade += 1
      atual.valor += Number(item.valor_estimado || 0)
      mapa.set(chave, atual)
    }

    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor)
  }, [pca])

  const itensFiltrados = useMemo(() => {
    const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean)
    if (!termos.length) return pca?.itens || []
    if (!pca) return []

    return pca.itens.filter((item) => {
      const textoPesquisavel = [
        montarIdItemPca(pca, item),
        item.numero_item,
        item.descricao_objeto,
        item.unidade_requisitante,
        pca.codigo_unidade,
        pca.nome_unidade,
        item.codigo_item_catalogo,
        item.catalogo_utilizado,
        item.classificacao_catalogo,
        item.codigo_classe,
        item.nome_classe,
        item.codigo_pdm,
        item.nome_pdm,
        item.codigo_grupo,
        item.nome_grupo,
        categorias[item.categoria] || item.categoria,
        item.categoria,
        item.status,
        item.unidade_medida,
        item.quantidade_estimada,
        item.valor_estimado,
        moeda(item.valor_estimado),
      ].map(normalizarBusca).join(' ')

      return termos.every((termo) => textoPesquisavel.includes(termo))
    })
  }, [busca, pca])

  const maiorValorCategoria = Math.max(...resumoCategorias.map((item) => item.valor), 1)

  if (loading) {
    return (
      <main
        id="conteudo-principal"
        className="pca-publica min-h-screen bg-[#F0F2F5]"
      >
        <SkipLinks />
        <PortalHeader />
        <div className="mx-auto max-w-[1760px] px-6 py-16 text-center text-[#4A5568] lg:px-10 xl:px-14">
          Carregando PCA público...
        </div>
      </main>
    )
  }

  if (erro || !pca) {
    return (
      <main
        id="conteudo-principal"
        className="pca-publica min-h-screen bg-[#F0F2F5]"
      >
        <SkipLinks />
        <PortalHeader />
        <div className="mx-auto max-w-[1760px] px-6 py-16 lg:px-10 xl:px-14">
          <h1 className="text-3xl font-bold text-[#071D41]">PCA não encontrado</h1>
          <p className="mt-3 text-[#4A5568]">{erro || 'Não foi possível localizar este plano publicado.'}</p>
          <Link href={`/pca/${params.cnpj}`} className="mt-8 inline-flex items-center gap-2 rounded-md border border-[#1351B4] px-4 py-2 text-sm font-semibold text-[#1351B4]">
            <Home className="h-4 w-4" />
            Ver anos disponíveis
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main
      id="conteudo-principal"
      className="pca-publica min-h-screen bg-[#F0F2F5] text-[#1B1C1E]"
    >
      <SkipLinks />
      <PortalHeader />

      <section className="bg-white border-b border-[#D9DDE3]" aria-labelledby="titulo-pca-publico">
        <div className="mx-auto max-w-[1760px] px-6 py-8 lg:px-10 xl:px-14">
          <nav aria-label="Você está aqui" className="mb-6 flex items-center gap-2 text-[12.5px] text-[#718096]">
            <Home aria-hidden="true" className="h-4 w-4 text-[#1351B4]" />
            <span>Início</span>
            <span>/</span>
            <Link className="font-semibold text-[#1351B4]" href={`/pca/${pca.orgao.cnpj}`}>
              PCA publicados
            </Link>
            <span>/</span>
            <span>PCA {pca.ano_exercicio}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
            <div className="flex items-start gap-5">
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-md border border-[#D9DDE3] bg-white p-3 shadow-sm">
                <img src={logoOrgao(pca.orgao)} alt={`Brasão ou logomarca de ${pca.orgao.nome}`} className="max-h-full max-w-full object-contain" />
              </div>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#718096]">Documento publicado</p>
                <h1 id="titulo-pca-publico" className="mt-2 text-[clamp(26px,3vw,40px)] font-bold leading-tight text-[#071D41]">
                  Plano de Contratações Anual (PCA) {pca.ano_exercicio}
                </h1>
                <p className="mt-3 text-[15px] text-[#4A5568]">
                  {pca.orgao.nome} · CNPJ {formatarCnpj(pca.orgao.cnpj)} · {[pca.orgao.cidade, pca.orgao.uf].filter(Boolean).join(' - ')}
                </p>
                <p className="mt-2 max-w-3xl text-sm text-[#4A5568]">
                  PCA significa Plano de Contratações Anual, documento que consolida as contratações planejadas pelo órgão para o exercício.
                </p>
              </div>
            </div>

            <aside id="lista-anos" className="rounded-lg border border-[#D9DDE3] bg-[#FAFBFC] p-4" aria-labelledby="titulo-anos-pca">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#071D41]">
                <Calendar aria-hidden="true" className="h-4 w-4 text-[#1351B4]" />
                <span id="titulo-anos-pca">PCAs disponíveis</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {anos.length > 0 ? anos.map((ano) => (
                  <Link
                    key={ano.id}
                    href={`/pca/${pca.orgao.cnpj}/${ano.ano_exercicio}`}
                    aria-current={ano.ano_exercicio === pca.ano_exercicio ? 'page' : undefined}
                    aria-label={`Abrir PCA ${ano.ano_exercicio}`}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                      ano.ano_exercicio === pca.ano_exercicio
                        ? 'border-[#1351B4] bg-[#1351B4] text-white'
                        : 'border-[#D9DDE3] bg-white text-[#1351B4] hover:bg-[#EAF0FB]'
                    }`}
                  >
                    {ano.ano_exercicio}
                  </Link>
                )) : (
                  <span className="text-sm text-[#718096]">Apenas {pca.ano_exercicio}</span>
                )}
              </div>
              <Link href={`/pca/${pca.orgao.cnpj}`} className="mt-4 inline-block text-sm font-semibold text-[#1351B4] hover:underline">
                Ver página do órgão
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1760px] px-6 py-8 lg:px-10 xl:px-14" aria-labelledby="titulo-resumo-pca">
        <h2 id="titulo-resumo-pca" className="sr-only">Resumo do PCA publicado</h2>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_480px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <InfoTile label="Esfera" value={pca.orgao.esfera || 'Municipal'} />
              <InfoTile label="Poder" value={poderOrgao(pca.orgao.tipo)} />
              <InfoTile label="Localidade" value={[pca.orgao.cidade, pca.orgao.uf].filter(Boolean).join(' - ') || '-'} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <MetricCard label="Valor Total Estimado" value={moeda(pca.valor_total_estimado)} />
              <MetricCard label="Quantidade de Itens" value={numero(pca.quantidade_itens || pca.itens.length)} accent="green" />
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[#D9DDE3] bg-white p-5">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-[#1351B4] px-5 py-2.5 font-semibold text-white hover:bg-[#0C326F]"
                aria-label={`Baixar arquivo XLSX do PCA ${pca.ano_exercicio}`}
                onClick={() => baixarXlsxPca(pca, `PCA_${pca.ano_exercicio}_Itens_PNCP.xlsx`)}
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Baixar arquivo XLSX
              </button>
              <p className="text-sm text-[#4A5568]">
                Relação dos itens do plano anual do órgão no modelo de envio do PNCP.
              </p>
            </div>
          </div>

          <section className="rounded-lg border border-[#D9DDE3] bg-white p-5 shadow-sm" aria-labelledby="titulo-grafico-categorias">
            <h2 id="titulo-grafico-categorias" className="text-lg font-bold text-[#071D41]">Valor e itens por categoria</h2>
            <div className="sr-only">
              <p>Resumo textual do gráfico de categorias.</p>
              <ul>
                {resumoCategorias.map((item) => (
                  <li key={item.categoria}>
                    {item.categoria}: {item.quantidade} item(ns), total de {moeda(item.valor)}.
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-5 space-y-4">
              {resumoCategorias.map((item) => (
                <div key={item.categoria}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="font-medium text-[#4A5568]">{item.categoria}</span>
                    <span className="font-semibold text-[#071D41]">{moeda(item.valor)}</span>
                  </div>
                  <div className="h-9 overflow-hidden rounded bg-[#EDF2F7]">
                    <div
                      className="flex h-full items-center justify-end bg-[#1351B4] px-3 text-xs font-bold text-white"
                      style={{ width: `${Math.max((item.valor / maiorValorCategoria) * 100, 8)}%` }}
                    >
                      {item.quantidade} item(ns)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section id="tabela-itens" className="mt-8 rounded-lg border border-[#D9DDE3] bg-white shadow-sm" aria-labelledby="titulo-itens-pca">
          <div className="flex flex-col justify-between gap-4 border-b border-[#D9DDE3] p-5 md:flex-row md:items-center">
            <div>
              <h2 id="titulo-itens-pca" className="text-xl font-bold text-[#071D41]">Itens do PCA {pca.ano_exercicio}</h2>
              <p className="mt-1 text-sm text-[#718096]">{itensFiltrados.length} item(ns) exibido(s)</p>
            </div>
            <label htmlFor="busca-itens-pca" className="flex w-full max-w-sm items-center gap-2 rounded-md border border-[#D9DDE3] px-3 py-2">
              <Search aria-hidden="true" className="h-4 w-4 text-[#1351B4]" />
              <span className="sr-only">Buscar item, unidade ou categoria</span>
              <input
                id="busca-itens-pca"
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Buscar por item, unidade, código ou valor"
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Itens publicados no Plano de Contratações Anual {pca.ano_exercicio}, com unidade, descrição e valor total.
              </caption>
              <thead className="bg-[#F4F6F9] text-[#0C326F]">
                <tr>
                  <th className="px-5 py-4 font-semibold">Id PCA DCP</th>
                  <th className="px-5 py-4 font-semibold">Unidade</th>
                  <th className="px-5 py-4 font-semibold">Item</th>
                  <th className="px-5 py-4 font-semibold">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.map((item) => (
                  <tr key={item.id} className="border-t border-[#EDF2F7] align-top hover:bg-[#FAFBFC]">
                    <td className="px-5 py-4 font-mono text-xs text-[#4A5568]">
                      {formatarCnpj(pca.orgao.cnpj)}-{pca.codigo_unidade || '1'}-{String(item.numero_item).padStart(6, '0')}/{pca.ano_exercicio}
                    </td>
                    <td className="px-5 py-4">{(pca.codigo_unidade || '1') + ' - ' + (pca.nome_unidade || 'Unidade Principal')}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#1B1C1E]">{item.descricao_objeto}</p>
                      <p className="mt-1 text-xs text-[#718096]">
                        {categorias[item.categoria] || item.categoria} · Qtd. {numero(item.quantidade_estimada || 1)} {item.unidade_medida || 'UN'}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-semibold">{moeda(item.valor_estimado)}</td>
                  </tr>
                ))}
                {itensFiltrados.length === 0 && (
                  <tr>
                    <td className="px-5 py-8 text-center text-[#718096]" colSpan={4}>
                      Nenhum item encontrado para a busca informada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  )
}

function SkipLinks() {
  return (
    <nav aria-label="Atalhos de acessibilidade" className="skip-links">
      <a href="#conteudo-principal">Ir para o conteúdo</a>
      <a href="#lista-anos">Ir para anos disponíveis</a>
      <a href="#busca-itens-pca">Ir para a busca de itens</a>
      <a href="#tabela-itens">Ir para a tabela de itens</a>
    </nav>
  )
}

function PortalHeader() {
  return (
    <>
      <div className="flex min-h-[34px] items-center justify-between gap-4 bg-[#071D41] px-6 py-1 md:px-12">
        <span className="text-[11.5px] text-white/70">
          Câmara Municipal de <strong className="font-bold text-[#FFCD07]">Luís Eduardo Magalhães</strong> · Poder Legislativo Municipal
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

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#D9DDE3] bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#718096]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#071D41]">{value}</p>
    </div>
  )
}

function MetricCard({ label, value, accent = 'blue' }: { label: string; value: string; accent?: 'blue' | 'green' }) {
  return (
    <div className={`rounded-lg p-5 text-white shadow-sm ${accent === 'green' ? 'bg-[#168821]' : 'bg-[#1351B4]'}`}>
      <p className="text-sm font-bold uppercase text-white/85">{label}</p>
      <p className="mt-5 text-2xl font-bold">{value}</p>
    </div>
  )
}
