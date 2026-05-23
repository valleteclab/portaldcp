"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, Sparkles, Home, ChevronRight, Loader2, AlertCircle, Plus, Trash2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

function getOrgaoId(): string {
  if (typeof window === "undefined") return ""
  try {
    const orgao = JSON.parse(localStorage.getItem("orgao") || "{}")
    return orgao.id || ""
  } catch {
    return ""
  }
}

function gerarNumeroProcesso(): string {
  const now = new Date()
  const ano = now.getFullYear()
  const mes = String(now.getMonth() + 1).padStart(2, "0")
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, "0")
  return `${ano}${mes}.${random}`
}

function mapearModalidade(frontend: string): string {
  const map: Record<string, string> = {
    "Pregão Eletrônico":    "PREGAO_ELETRONICO",
    "Concorrência":         "CONCORRENCIA",
    "Concurso":             "CONCURSO",
    "Leilão":               "LEILAO",
    "Diálogo Competitivo":  "DIALOGO_COMPETITIVO",
    "Dispensa Eletrônica":  "DISPENSA_ELETRONICA",
    "Inexigibilidade":      "INEXIGIBILIDADE",
  }
  return map[frontend] || "PREGAO_ELETRONICO"
}

function mapearCategoria(frontend: string): string {
  const map: Record<string, string> = {
    "Compras / Aquisição de Bens":          "COMPRA",
    "Serviços Comuns":                       "SERVICO",
    "Serviços de Tecnologia da Informação": "SERVICO",
    "Obras de Construção Civil":             "OBRA",
    "Serviços de Engenharia":                "SERVICO_ENGENHARIA",
    "Locação de Imóveis":                    "LOCACAO",
    "Alienação de Bens":                     "ALIENACAO",
    // legado
    "Serviços de TI":   "SERVICO",
    "Bens de TI":       "COMPRA",
    "Outros Serviços":  "SERVICO",
    "Outros":           "SERVICO",
  }
  return map[frontend] || "SERVICO"
}

function mapearCriterio(frontend: string): string {
  const map: Record<string, string> = {
    "Menor preço":                  "MENOR_PRECO",
    "Maior desconto":               "MAIOR_DESCONTO",
    "Melhor técnica":               "MELHOR_TECNICA",
    "Técnica e preço":              "TECNICA_E_PRECO",
    "Maior lance":                  "MAIOR_LANCE",
    "Maior retorno econômico":      "MAIOR_RETORNO_ECONOMICO",
  }
  return map[frontend] || "MENOR_PRECO"
}

function mapearModoDisputa(frontend: string): string {
  const map: Record<string, string> = {
    "Aberto":           "ABERTO",
    "Aberto e Fechado": "ABERTO_FECHADO",
    "Fechado e Aberto": "FECHADO_ABERTO",
    "Fechado":          "FECHADO",
  }
  return map[frontend] || "ABERTO"
}

function desmapearModalidade(backend: string): string {
  const map: Record<string, string> = {
    PREGAO_ELETRONICO:   "Pregão Eletrônico",
    CONCORRENCIA:        "Concorrência",
    CONCURSO:            "Concurso",
    LEILAO:              "Leilão",
    DIALOGO_COMPETITIVO: "Diálogo Competitivo",
    DISPENSA_ELETRONICA: "Dispensa Eletrônica",
    INEXIGIBILIDADE:     "Inexigibilidade",
    // legado
    DISPENSA:            "Dispensa Eletrônica",
  }
  return map[backend] || backend || ""
}

function desmapearCategoria(backend: string): string {
  const map: Record<string, string> = {
    COMPRA:             "Compras / Aquisição de Bens",
    SERVICO:            "Serviços Comuns",
    OBRA:               "Obras de Construção Civil",
    SERVICO_ENGENHARIA: "Serviços de Engenharia",
    LOCACAO:            "Locação de Imóveis",
    ALIENACAO:          "Alienação de Bens",
  }
  return map[backend] || backend || ""
}

function desmapearCriterio(backend: string): string {
  const map: Record<string, string> = {
    MENOR_PRECO:             "Menor preço",
    MAIOR_DESCONTO:          "Maior desconto",
    MELHOR_TECNICA:          "Melhor técnica",
    TECNICA_E_PRECO:         "Técnica e preço",
    MAIOR_LANCE:             "Maior lance",
    MAIOR_RETORNO_ECONOMICO: "Maior retorno econômico",
  }
  return map[backend] || "Menor preço"
}

function desmapearModoDisputa(backend: string): string {
  const map: Record<string, string> = {
    ABERTO:         "Aberto",
    ABERTO_FECHADO: "Aberto e Fechado",
    FECHADO_ABERTO: "Fechado e Aberto",
    FECHADO:        "Fechado",
  }
  return map[backend] || "Aberto"
}

// Modalidades de contratação direta (sem licitação formal — sem minuta de edital)
const MODALIDADES_CONTRATACAO_DIRETA = ["Dispensa Eletrônica", "Inexigibilidade"]

// ─── Etapas do wizard ──────────────────────────────────────────────
const WIZARD_ETAPAS = [
  { id: "dados",      sigla: "INI", nome: "Dados básicos",           art: "Configuração inicial" },
  { id: "dfd",        sigla: "DFD", nome: "Formalização da Demanda", art: "Art. 18, I" },
  { id: "etp",        sigla: "ETP", nome: "Estudo Técnico Preliminar",art: "Art. 18, §1º" },
  { id: "riscos",     sigla: "MR",  nome: "Análise de Riscos",       art: "Art. 18, X" },
  { id: "pesquisa",   sigla: "PP",  nome: "Pesquisa de Preços",      art: "Art. 23" },
  { id: "tr",         sigla: "TR",  nome: "Termo de Referência",     art: "Art. 6º, XXIII" },
  { id: "dotacao",    sigla: "DOT", nome: "Dotação Orçamentária",    art: "Art. 167 CF + LRF" },
  { id: "autorizacao",sigla: "AUT", nome: "Autorização",             art: "Art. 18, II" },
  { id: "edital",     sigla: "ED",  nome: "Edital / Aviso",          art: "Art. 25 / Art. 74-75" },
  { id: "juridico",   sigla: "PJ",  nome: "Parecer Jurídico",        art: "Art. 53" },
  { id: "concluido",  sigla: "OK",  nome: "Fase interna concluída",  art: "" },
]

// ─── Templates dos documentos ──────────────────────────────────────
const TEMPLATES: Record<string, {
  titulo: string
  intro: string
  artigo: string
  secoes: { id: string; titulo: string; placeholder: string; rows?: number }[]
  buildPrompt: (ctx: any) => string
}> = {
  dfd: {
    titulo: "Documento de Formalização da Demanda (DFD)",
    intro: "Formaliza a necessidade da contratação. Deve identificar a demanda, justificar e vincular ao planejamento institucional.",
    artigo: "Art. 18, I · Lei 14.133/2021",
    secoes: [
      { id: "demanda",    titulo: "1. Descrição da necessidade",   placeholder: "Descreva o problema ou demanda institucional que justifica a contratação…" },
      { id: "quantidade", titulo: "2. Quantidade estimada",        placeholder: "Volume estimado, unidade de medida e justificativa do quantitativo…" },
      { id: "previsao",   titulo: "3. Previsão no PCA",            placeholder: "Vinculação ao Plano de Contratações Anual (Art. 12, §1º)…" },
      { id: "data",       titulo: "4. Data prevista de conclusão", placeholder: "Prazo estimado para conclusão da contratação…" },
    ],
    buildPrompt: (ctx) => `Você é técnico do setor público elaborando um DFD conforme Lei 14.133/2021.

Objeto: ${ctx.objeto}
Categoria: ${ctx.categoria}
Quantidade: ${ctx.quantidade || "a definir"}
Área demandante: ${ctx.area || "não informada"}

Gere as 4 seções do DFD em JSON. Seja conciso, formal, técnico, em português brasileiro. Cada seção: 2-4 frases. Cite artigos quando pertinente.

Responda APENAS com JSON válido:
{"demanda":"...","quantidade":"...","previsao":"...","data":"..."}`,
  },
  etp: {
    titulo: "Estudo Técnico Preliminar (ETP)",
    intro: "Analisa a viabilidade técnica e econômica da contratação. Os incisos I, IV, VI, VIII e XIII são de presença obrigatória (Art. 18, §2º). Os demais exigem justificativa quando ausentes.",
    artigo: "Art. 18, §1º (I–XIII) · Lei 14.133/2021",
    secoes: [
      // Inciso I — OBRIGATÓRIO (§2º)
      { id: "necessidade",      titulo: "1. Descrição da necessidade (inc. I) *",         placeholder: "Necessidade fundamentada em estudos que caracteriza o interesse público envolvido…" },
      // Inciso II
      { id: "previsao_pca",     titulo: "2. Previsão no PCA (inc. II)",                   placeholder: "Referência ao Plano de Contratações Anual (Art. 12, §1º). Se não constar, justificar…" },
      // Inciso III
      { id: "requisitos",       titulo: "3. Requisitos da contratação (inc. III)",        placeholder: "Requisitos técnicos, de sustentabilidade (Art. 5º, IV), qualidade e desempenho…" },
      // Inciso IV — OBRIGATÓRIO (§2º)
      { id: "estimativa",       titulo: "4. Estimativa de quantidades (inc. IV) *",       placeholder: "Memória de cálculo, parâmetros utilizados e documentos de suporte para as quantidades…" },
      // Inciso V
      { id: "levantamento",     titulo: "5. Levantamento de mercado (inc. V)",            placeholder: "Alternativas de mercado analisadas, solução escolhida e justificativa técnica/econômica…" },
      // Inciso VI — OBRIGATÓRIO (§2º)
      { id: "estimativa_valor", titulo: "6. Estimativa de valor referencial (inc. VI) *", placeholder: "Valor total estimado com metodologia, composição de preços e referências utilizadas (distinto da PP)…", rows: 4 },
      // Inciso VII
      { id: "solucao",          titulo: "7. Descrição da solução escolhida (inc. VII)",   placeholder: "Descrição detalhada da solução técnica adotada e justificativa da escolha…" },
      // Inciso VIII — OBRIGATÓRIO (§2º)
      { id: "parcelamento",     titulo: "8. Parcelamento ou não (inc. VIII) *",           placeholder: "Justificativa para parcelar ou não o objeto (Art. 40, §3º). Se não parcelado, razões técnicas/econômicas…" },
      // Inciso IX
      { id: "beneficios",       titulo: "9. Resultados e benefícios esperados (inc. IX)", placeholder: "Resultados pretendidos em termos quantitativos e qualitativos com a contratação…" },
      // Inciso X
      { id: "providencias",     titulo: "10. Providências prévias necessárias (inc. X)",  placeholder: "Licenças, autorizações, certificações ou ações administrativas a serem adotadas previamente…" },
      // Inciso XI
      { id: "correlatas",       titulo: "11. Contratações correlatas (inc. XI)",          placeholder: "Contratos vigentes ou a serem celebrados que guardem relação de interdependência com esta contratação…" },
      // Inciso XII
      { id: "sustentabilidade", titulo: "12. Impactos ambientais e sustentabilidade (inc. XII)", placeholder: "Critérios de sustentabilidade (Art. 5º, IV), impactos ambientais identificados e medidas mitigadoras…" },
      // Inciso XIII — OBRIGATÓRIO (§2º)
      { id: "viabilidade",      titulo: "13. Posicionamento conclusivo (inc. XIII) *",    placeholder: "Conclusão sobre a viabilidade técnica e econômica da contratação e recomendações…" },
    ],
    buildPrompt: (ctx) => `Você é analista técnico elaborando um ETP conforme Art. 18, §1º, incisos I a XIII, da Lei 14.133/2021.

Os incisos I, IV, VI, VIII e XIII são OBRIGATÓRIOS (§2º). Os demais requerem justificativa se ausentes.

Contexto:
- Objeto: ${ctx.objeto}
- Natureza: ${ctx.categoria || "não informada"}
- Modalidade: ${ctx.modalidade || "não informada"}
- Valor estimado: ${ctx.valor ? "R$ " + ctx.valor : "não informado"}
- Área demandante: ${ctx.area || "não informada"}

Gere todas as 13 seções em JSON. 2–3 frases técnicas por seção. Cite normas quando pertinente (LGPD, IN SEGES 65/2021, IN SGD 1/2019 para TI). Inciso XII deve mencionar critérios de sustentabilidade mesmo que não aplicáveis.

Responda APENAS com JSON válido:
{"necessidade":"...","previsao_pca":"...","requisitos":"...","estimativa":"...","levantamento":"...","estimativa_valor":"...","solucao":"...","parcelamento":"...","beneficios":"...","providencias":"...","correlatas":"...","sustentabilidade":"...","viabilidade":"..."}`,
  },
  tr: {
    titulo: "Termo de Referência (TR)",
    intro: "Consolida tudo o que foi estudado e define com precisão o objeto, requisitos, modelo de execução e fiscalização. Deve conter todos os elementos do Art. 6º, XXIII, alíneas a–j.",
    artigo: "Art. 6º, XXIII · Art. 40 · Lei 14.133/2021",
    secoes: [
      { id: "objeto",                  titulo: "1. Objeto (alínea a)",                            placeholder: "Descrição precisa do objeto da contratação…" },
      { id: "fundamentacao",           titulo: "2. Fundamentação e justificativa (alínea b)",      placeholder: "Base legal e justificativa da necessidade da contratação…" },
      { id: "descricao",               titulo: "3. Descrição da solução (alínea c)",               placeholder: "Solução técnica completa, incluindo os resultados esperados…" },
      { id: "requisitos",              titulo: "4. Requisitos da contratação (alínea d)",          placeholder: "Requisitos técnicos, qualidade, desempenho, sustentabilidade e outras condicionantes…" },
      { id: "modelo_execucao",         titulo: "5. Modelo de execução do objeto (alínea e)",      placeholder: "Prazos, locais de entrega/execução, dinâmica de execução e demais condições práticas…" },
      { id: "modelo_gestao",           titulo: "6. Modelo de gestão e fiscalização (alínea f)",   placeholder: "Estrutura de gestão, designação de fiscais, indicadores de desempenho e penalidades…" },
      { id: "pagamento",               titulo: "7. Critérios de medição e pagamento (alínea g)",  placeholder: "Forma, condições, prazos e critérios objetivos de medição e pagamento…" },
      { id: "selecao_habilitacao",     titulo: "8. Critérios de seleção e habilitação (alínea h)", placeholder: "Forma de seleção do fornecedor, modalidade, critério de julgamento, modo de disputa e requisitos de habilitação jurídica, fiscal, técnica e econômico-financeira…" },
      { id: "estimativa_valor_tr",     titulo: "9. Estimativa de valor e sigilo (alínea i)",      placeholder: "Estimativa do valor do objeto com metodologia utilizada. Se aplicável, indicar sigilo do orçamento (Art. 24, §1º) e fundamentar…", rows: 4 },
      { id: "dotacao_orcamentaria_tr", titulo: "10. Adequação orçamentária (alínea j)",           placeholder: "Elemento de despesa, fonte de recurso, programa/ação e dotação orçamentária. Indicar exercício e disponibilidade de crédito ou justificativa de dispensa (SRP/exercício subsequente)…" },
    ],
    buildPrompt: (ctx) => `Você elabora um Termo de Referência completo conforme Art. 6º, XXIII (alíneas a–j) e Art. 40 da Lei 14.133/2021.

Contexto:
- Objeto: ${ctx.objeto}
- Categoria: ${ctx.categoria}
- Quantidade: ${ctx.quantidade || "a definir"}
- Modalidade: ${ctx.modalidade || "não informada"}
- Critério de julgamento: ${ctx.criterio || "Menor preço"}
- Valor estimado mediano da pesquisa de preços: R$ ${(ctx.valorMediano || 0).toLocaleString("pt-BR")}
- ETP concluído: SIM

Gere as 10 seções do TR em JSON. 3-4 frases formais, técnicas, com citações legais. A seção 8 deve mencionar a modalidade e critério de julgamento. A seção 9 deve referenciar a pesquisa de preços realizada. A seção 10 deve indicar que a dotação orçamentária será indicada conforme disponibilidade no exercício financeiro vigente.

Responda APENAS com JSON válido:
{"objeto":"...","fundamentacao":"...","descricao":"...","requisitos":"...","modelo_execucao":"...","modelo_gestao":"...","pagamento":"...","selecao_habilitacao":"...","estimativa_valor_tr":"...","dotacao_orcamentaria_tr":"..."}`,
  },
  aviso: {
    titulo: "Aviso de Contratação Direta",
    intro: "Publicação obrigatória no PNCP e no Diário Oficial para contratações por dispensa eletrônica ou inexigibilidade. Substitui a minuta do edital nestes casos.",
    artigo: "Art. 74-75 · Art. 54, §1º · Lei 14.133/2021",
    secoes: [
      { id: "amparo_legal",       titulo: "1. Amparo legal",                                         placeholder: "Fundamento legal da contratação direta. Ex: Art. 75, I – valor abaixo do limite; Art. 74, III, d – notória especialização…" },
      { id: "objeto_contratacao", titulo: "2. Objeto da contratação",                                placeholder: "Descrição objetiva do bem, serviço ou obra objeto da contratação direta…" },
      { id: "justificativa",      titulo: "3. Justificativa da contratação direta",                  placeholder: "Razões fáticas e jurídicas que enquadram a contratação na hipótese de dispensa ou inexigibilidade…", rows: 4 },
      { id: "caracterizacao",     titulo: "4. Caracterização da situação e escolha do fornecedor",   placeholder: "Demonstração objetiva do enquadramento legal, cotações realizadas, análises técnicas ou pareceres que embasam a escolha do fornecedor…" },
    ],
    buildPrompt: (ctx) => `Você elabora um Aviso de Contratação Direta conforme Arts. 74-75 da Lei 14.133/2021.

Objeto: ${ctx.objeto}
Modalidade: ${ctx.modalidade || "Dispensa Eletrônica"}
Categoria: ${ctx.categoria || "não informada"}
Valor estimado: ${ctx.valor ? "R$ " + ctx.valor : "não informado"}

Gere as 4 seções em JSON. Seja objetivo e formal. Indique o amparo legal mais provável com base no objeto e modalidade. Para Dispensa Eletrônica use Art. 75; para Inexigibilidade use Art. 74.

Responda APENAS com JSON válido:
{"amparo_legal":"...","objeto_contratacao":"...","justificativa":"...","caracterizacao":"..."}`,
  },
  edital: {
    titulo: "Minuta do Edital",
    intro: "A minuta consolida as regras da licitação, vinculada ao TR e aos demais documentos da fase interna.",
    artigo: "Art. 25 · Lei 14.133/2021",
    secoes: [
      { id: "preambulo",     titulo: "1. Preâmbulo",                placeholder: "Identificação do órgão, objeto, modalidade…" },
      { id: "objeto_edital", titulo: "2. Do objeto",               placeholder: "Objeto da licitação…" },
      { id: "participacao",  titulo: "3. Da participação",         placeholder: "Quem pode participar e vedações…" },
      { id: "habilitacao",   titulo: "4. Da habilitação",          placeholder: "Documentação necessária para habilitação…" },
      { id: "julgamento",    titulo: "5. Critério de julgamento",  placeholder: "Critério aplicado e justificativa…" },
      { id: "recursos",      titulo: "6. Dos recursos",            placeholder: "Prazos e procedimentos recursais…" },
      { id: "contratacao",   titulo: "7. Da contratação",          placeholder: "Condições e prazos de contratação…" },
    ],
    buildPrompt: (ctx) => `Você redige trechos de minuta de Edital conforme Lei 14.133/2021, Art. 25.

Objeto: ${ctx.objeto}
Modalidade: ${ctx.modalidade || "não informada"}
Critério: ${ctx.criterio_julgamento || "não informado"}

Gere as 7 seções em JSON. 2-3 frases em linguagem editalícia formal.

Responda APENAS com JSON válido:
{"preambulo":"...","objeto_edital":"...","participacao":"...","habilitacao":"...","julgamento":"...","recursos":"...","contratacao":"..."}`,
  },
}

// ─── Helpers ───────────────────────────────────────────────────────
async function chamarIA(prompt: string, tipo: string): Promise<string> {
  const res = await authFetch(`${API_URL}/api/ia/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mensagens: [{ role: "user", content: prompt }],
      tipoDocumento: tipo,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.resposta || ""
}

async function typewriterFill(
  text: string,
  setter: (v: string) => void,
  onDone?: () => void
) {
  let i = 0
  const step = Math.max(3, Math.round(text.length / 50))
  return new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      i += step
      setter(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(tick)
        setter(text)
        onDone?.()
        resolve()
      }
    }, 16)
  })
}

// ─── Sidebar ───────────────────────────────────────────────────────
function WizardSidebar({ etapas, current, completed, onJump }: {
  etapas: typeof WIZARD_ETAPAS
  current: string
  completed: string[]
  onJump: (id: string) => void
}) {
  const visivel = etapas.slice(0, -1)
  const progresso = (completed.length / visivel.length) * 100

  return (
    <div className="w-[220px] shrink-0 border-r border-gray-100 bg-white flex flex-col">
      <div className="px-4 pt-5 pb-3">
        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">
          Fase interna · {completed.length}/{visivel.length}
        </div>
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#1351b4] rounded-full transition-all duration-500" style={{ width: `${progresso}%` }} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {visivel.map((e) => {
          const isActive = e.id === current
          const isDone = completed.includes(e.id)
          return (
            <button
              key={e.id}
              onClick={() => (isDone || isActive) && onJump(e.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                isActive ? "bg-[#ecf3fc]" : isDone ? "hover:bg-gray-50 cursor-pointer" : "cursor-default opacity-50"
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                isDone ? "bg-[#168821] text-white" : isActive ? "bg-[#1351b4] text-white" : "bg-gray-100 text-gray-400"
              }`}>
                {isDone ? <Check className="w-3.5 h-3.5" /> : e.sigla}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-semibold leading-tight truncate ${isActive ? "text-[#1351b4]" : isDone ? "text-gray-700" : "text-gray-400"}`}>
                  {e.nome}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{e.art}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Modalidades com licitação formal (critério + modo de disputa obrigatórios)
const MODALIDADES_LICITACAO = ["Pregão Eletrônico", "Concorrência", "Concurso", "Leilão", "Diálogo Competitivo"]
// Critérios compatíveis por modalidade
const CRITERIOS_POR_MODALIDADE: Record<string, string[]> = {
  "Pregão Eletrônico":   ["Menor preço", "Maior desconto"],
  "Concorrência":        ["Menor preço", "Maior desconto", "Melhor técnica", "Técnica e preço", "Maior retorno econômico"],
  "Concurso":            ["Melhor técnica"],
  "Leilão":              ["Maior lance"],
  "Diálogo Competitivo": ["Menor preço", "Maior desconto", "Melhor técnica", "Técnica e preço"],
}

// ─── Step: Dados básicos ───────────────────────────────────────────
function StepDados({ dados, onChange, onNext }: { dados: any; onChange: (k: string, v: string) => void; onNext: () => void }) {
  const objetoOk = (dados.objeto || "").trim().length >= 10
  const ehLicitacaoFormal = MODALIDADES_LICITACAO.includes(dados.modalidade)
  const valido = dados.objeto && dados.categoria && dados.modalidade &&
    (!ehLicitacaoFormal || dados.criterio)

  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [animando, setAnimando] = useState<string | null>(null)

  // Ao trocar modalidade: limpa critério incompatível e ajusta modo de disputa
  const handleModalidade = (v: string) => {
    onChange("modalidade", v)
    const criteriosValidos = CRITERIOS_POR_MODALIDADE[v] || []
    if (!criteriosValidos.includes(dados.criterio)) {
      onChange("criterio", criteriosValidos[0] || "")
    }
    if (!MODALIDADES_LICITACAO.includes(v)) {
      onChange("modoDisputa", "")
    } else if (!dados.modoDisputa) {
      onChange("modoDisputa", "Aberto")
    }
  }

  const gerarComIA = async () => {
    if (!objetoOk) {
      setErro("Descreva o objeto da contratação (mínimo 10 caracteres) antes de usar a IA.")
      return
    }
    setBusy(true)
    setErro(null)
    try {
      const resposta = await chamarIA(
        `Você é especialista em fase interna de licitações conforme a Lei 14.133/2021.

A partir da descrição inicial abaixo, complete os dados básicos do processo licitatório com sugestões plausíveis, formais e objetivas.

Descrição inicial do objeto: ${dados.objeto}
Categoria atual: ${dados.categoria || "não informada"}
Modalidade atual: ${dados.modalidade || "não informada"}
Critério de julgamento atual: ${dados.criterio || "não informado"}
Área demandante atual: ${dados.area || "não informada"}
Valor estimado atual: ${dados.valor || "não informado"}

Regras (respeite rigorosamente):
- Linguagem formal e administrativa conforme Lei 14.133/2021;
- Categoria — escolha EXATAMENTE um dos valores: "Compras / Aquisição de Bens", "Serviços Comuns", "Serviços de Tecnologia da Informação", "Obras de Construção Civil", "Serviços de Engenharia", "Locação de Imóveis", "Alienação de Bens";
- Modalidade (Art. 28) — escolha EXATAMENTE um dos valores: "Pregão Eletrônico", "Concorrência", "Concurso", "Leilão", "Diálogo Competitivo", "Dispensa Eletrônica", "Inexigibilidade";
- Critério de julgamento (Art. 33) — escolha EXATAMENTE um dos valores: "Menor preço", "Maior desconto", "Melhor técnica", "Técnica e preço", "Maior lance", "Maior retorno econômico". Para Pregão use "Menor preço" ou "Maior desconto"; para Leilão use "Maior lance"; para Concurso use "Melhor técnica"; para Dispensa/Inexigibilidade retorne string vazia;
- Se não houver base para estimar valor, retorne string vazia em "valor";
- Responda APENAS com JSON válido, sem texto adicional.

Formato de resposta:
{"objeto":"...","categoria":"...","modalidade":"...","criterio":"...","area":"...","valor":"..."}`,
        "dados_basicos_fase_interna"
      )
      const jsonMatch = resposta.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("JSON não encontrado na resposta")
      const parsed = JSON.parse(jsonMatch[0])
      const campos = ["objeto", "categoria", "modalidade", "criterio", "area", "valor"]
      for (const campo of campos) {
        if (typeof parsed[campo] === "string" && parsed[campo].trim()) {
          setAnimando(campo)
          await typewriterFill(parsed[campo].trim(), (v) => onChange(campo, v))
        }
      }
    } catch (e) {
      setErro("Erro ao gerar com IA. Você pode preencher manualmente.")
      console.error(e)
    } finally {
      setBusy(false)
      setAnimando(null)
    }
  }

  const criteriosDisponiveis = CRITERIOS_POR_MODALIDADE[dados.modalidade] ||
    ["Menor preço", "Maior desconto", "Melhor técnica", "Técnica e preço", "Maior lance", "Maior retorno econômico"]

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Dados básicos do processo</h2>
          <p className="text-sm text-gray-500 mt-1">
            Informações iniciais que guiarão a elaboração de todos os documentos.
          </p>
          <span className="text-xs text-[#1351b4] font-medium">Configuração inicial · Lei 14.133/2021</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={gerarComIA}
          disabled={busy || !objetoOk}
          title={!objetoOk ? "Descreva o objeto primeiro (mín. 10 caracteres)" : "Completar campos com IA"}
          className="shrink-0 ml-4 text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc] disabled:opacity-40"
        >
          {busy
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</>
            : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gerar com IA</>
          }
        </Button>
      </div>

      {erro && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {erro}
        </div>
      )}

      <div className="space-y-5">
        {/* Objeto */}
        <div>
          <Label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
            Objeto da contratação *
            {animando === "objeto" && <Sparkles className="w-3 h-3 text-[#1351b4] animate-pulse" />}
          </Label>
          <Textarea
            value={dados.objeto || ""}
            onChange={(e) => onChange("objeto", e.target.value)}
            placeholder="Descreva o objeto de forma clara e objetiva conforme Art. 6º, XXIII da Lei 14.133/2021…"
            className="resize-none"
            rows={3}
          />
          <p className="mt-1.5 text-[11px] text-gray-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#1351b4]" />
            Descreva o objeto acima para habilitar o botão <strong>Gerar com IA</strong> e completar os demais campos automaticamente.
          </p>
        </div>

        {/* Categoria + Modalidade */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              Natureza do objeto *
              {animando === "categoria" && <Sparkles className="w-3 h-3 text-[#1351b4] animate-pulse" />}
            </Label>
            <Select value={dados.categoria || ""} onValueChange={(v) => onChange("categoria", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Compras / Aquisição de Bens">Compras / Aquisição de Bens</SelectItem>
                <SelectItem value="Serviços Comuns">Serviços Comuns</SelectItem>
                <SelectItem value="Serviços de Tecnologia da Informação">Serviços de Tecnologia da Informação</SelectItem>
                <SelectItem value="Obras de Construção Civil">Obras de Construção Civil</SelectItem>
                <SelectItem value="Serviços de Engenharia">Serviços de Engenharia</SelectItem>
                <SelectItem value="Locação de Imóveis">Locação de Imóveis</SelectItem>
                <SelectItem value="Alienação de Bens">Alienação de Bens</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-gray-400">Art. 6º, XIV, XXI e XXII</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              Modalidade *
              {animando === "modalidade" && <Sparkles className="w-3 h-3 text-[#1351b4] animate-pulse" />}
            </Label>
            <Select value={dados.modalidade || ""} onValueChange={handleModalidade}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pregão Eletrônico">Pregão Eletrônico</SelectItem>
                <SelectItem value="Concorrência">Concorrência</SelectItem>
                <SelectItem value="Concurso">Concurso</SelectItem>
                <SelectItem value="Leilão">Leilão</SelectItem>
                <SelectItem value="Diálogo Competitivo">Diálogo Competitivo</SelectItem>
                <SelectItem value="Dispensa Eletrônica">Dispensa Eletrônica</SelectItem>
                <SelectItem value="Inexigibilidade">Inexigibilidade</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-gray-400">Art. 28 (licitação) · Art. 74-75 (contratação direta)</p>
          </div>
        </div>

        {/* Critério de Julgamento + Modo de Disputa (só para licitação formal) */}
        {ehLicitacaoFormal && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                Critério de julgamento *
                {animando === "criterio" && <Sparkles className="w-3 h-3 text-[#1351b4] animate-pulse" />}
              </Label>
              <Select value={dados.criterio || ""} onValueChange={(v) => onChange("criterio", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {criteriosDisponiveis.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-gray-400">Art. 33 · Lei 14.133/2021</p>
            </div>
            {(dados.modalidade === "Pregão Eletrônico" || dados.modalidade === "Concorrência" || dados.modalidade === "Diálogo Competitivo") && (
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1.5">
                  Modo de disputa
                </Label>
                <Select value={dados.modoDisputa || "Aberto"} onValueChange={(v) => onChange("modoDisputa", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aberto">Aberto</SelectItem>
                    <SelectItem value="Aberto e Fechado">Aberto e Fechado</SelectItem>
                    <SelectItem value="Fechado e Aberto">Fechado e Aberto</SelectItem>
                    <SelectItem value="Fechado">Fechado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-gray-400">Art. 56 · Lei 14.133/2021</p>
              </div>
            )}
          </div>
        )}

        {/* Área demandante + Valor estimado */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              Área demandante *
              {animando === "area" && <Sparkles className="w-3 h-3 text-[#1351b4] animate-pulse" />}
            </Label>
            <Input
              value={dados.area || ""}
              onChange={(e) => onChange("area", e.target.value)}
              placeholder="Ex: SETIC, Gabinete, DCOMP…"
            />
            <p className="mt-1 text-[10px] text-gray-400">Unidade requisitante (Art. 18, §1º)</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              Valor total estimado (R$)
              {animando === "valor" && <Sparkles className="w-3 h-3 text-[#1351b4] animate-pulse" />}
            </Label>
            <Input
              value={dados.valor || ""}
              onChange={(e) => onChange("valor", e.target.value)}
              placeholder="Ex: 150000.00"
            />
            <p className="mt-1 text-[10px] text-gray-400">Influencia modalidade (Art. 6º, XXXVIII)</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={onNext} disabled={!valido} className="bg-[#1351b4] hover:bg-[#0c326f]">
          Próxima etapa <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step: Documento genérico (DFD / ETP / TR / Edital) ──────────
function StepDocumento({ stepKey, secoes, onChangeSec, onNext, onBack, ctx }: {
  stepKey: string
  secoes: Record<string, string>
  onChangeSec: (id: string, val: string) => void
  onNext: () => void
  onBack: () => void
  ctx: any
}) {
  const tpl = TEMPLATES[stepKey]
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [animando, setAnimando] = useState<string | null>(null)

  const gerarComIA = async () => {
    setBusy(true)
    setErro(null)
    try {
      const resposta = await chamarIA(tpl.buildPrompt(ctx), stepKey)
      const jsonMatch = resposta.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("JSON não encontrado na resposta")
      const parsed = JSON.parse(jsonMatch[0])
      for (const sec of tpl.secoes) {
        if (parsed[sec.id]) {
          setAnimando(sec.id)
          await typewriterFill(parsed[sec.id], (v) => onChangeSec(sec.id, v))
        }
      }
      setAnimando(null)
    } catch (e: any) {
      setErro("Erro ao gerar com IA. Você pode preencher manualmente.")
      console.error(e)
    } finally {
      setBusy(false)
      setAnimando(null)
    }
  }

  const preenchidas = tpl.secoes.filter((s) => (secoes[s.id] || "").length > 10).length
  const todasPreenchidas = preenchidas === tpl.secoes.length

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
      {/* Header do documento */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{tpl.titulo}</h2>
          <p className="text-sm text-gray-500 mt-1">{tpl.intro}</p>
          <a className="text-xs text-[#1351b4] font-medium mt-1 inline-block">{tpl.artigo}</a>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={gerarComIA}
          disabled={busy}
          className="shrink-0 ml-4 text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc]"
        >
          {busy
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</>
            : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gerar com IA</>
          }
        </Button>
      </div>

      {/* Erro */}
      {erro && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {erro}
        </div>
      )}

      {/* Seções */}
      <div className="space-y-5">
        {tpl.secoes.map((sec) => {
          const val = secoes[sec.id] || ""
          const isAnimando = animando === sec.id
          const preenchida = val.length > 10
          return (
            <div
              key={sec.id}
              className={`rounded-xl p-4 border transition-all duration-300 ${
                isAnimando ? "bg-[#f0f5fe] border-[#1351b4]/30" : "bg-white border-gray-100"
              }`}
            >
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                {sec.titulo}
                {preenchida && !isAnimando && <Check className="w-3 h-3 text-[#168821]" />}
                {isAnimando && (
                  <span className="text-[10px] text-[#1351b4] font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 animate-pulse" /> escrevendo…
                  </span>
                )}
              </label>
              <Textarea
                value={val}
                onChange={(e) => onChangeSec(sec.id, e.target.value)}
                placeholder={sec.placeholder}
                rows={sec.rows || Math.max(2, val.split("\n").length + 1)}
                className="resize-none text-sm bg-transparent border-gray-200"
              />
            </div>
          )
        })}
      </div>

      {/* Conformidade */}
      <div className={`mt-5 p-3 rounded-xl border flex items-start gap-3 text-xs ${
        todasPreenchidas ? "bg-green-50 border-green-200" : "bg-[#f6f9fd] border-[#dbe8fb]"
      }`}>
        {todasPreenchidas
          ? <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          : <AlertCircle className="w-4 h-4 text-[#1351b4] shrink-0 mt-0.5" />
        }
        <div>
          <span className={`font-semibold ${todasPreenchidas ? "text-green-700" : "text-[#1351b4]"}`}>
            Conformidade: {preenchidas}/{tpl.secoes.length} seções preenchidas.
          </span>{" "}
          <span className="text-gray-500">Texto gerado por IA deve ser revisado pelo servidor responsável.</span>
        </div>
      </div>

      {/* Navegação */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-gray-600">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Anterior
        </Button>
        <Button onClick={onNext} disabled={!todasPreenchidas} className="bg-[#1351b4] hover:bg-[#0c326f]">
          Próxima etapa <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step: Riscos ──────────────────────────────────────────────────
function StepRiscos({ riscos, setRiscos, onNext, onBack, ctx }: any) {
  const [busy, setBusy] = useState(false)

  const NIVEL = (p: number, i: number) => {
    const s = p * i
    if (s >= 15) return { label: "Crítico", color: "text-red-600 bg-red-50" }
    if (s >= 8)  return { label: "Alto",    color: "text-orange-600 bg-orange-50" }
    if (s >= 4)  return { label: "Médio",   color: "text-yellow-700 bg-yellow-50" }
    return               { label: "Baixo",  color: "text-green-700 bg-green-50" }
  }

  const sugerirComIA = async () => {
    setBusy(true)
    try {
      const resposta = await chamarIA(
        `Sugira 4 riscos típicos para a seguinte contratação pública, conforme Art. 18, X da Lei 14.133/2021:
Objeto: ${ctx.objeto}
Categoria: ${ctx.categoria}

Retorne APENAS JSON: [{"descricao":"...","categoria":"...","probabilidade":1-5,"impacto":1-5,"mitigacao":"..."}]`,
        "mapa_riscos"
      )
      const m = resposta.match(/\[[\s\S]*\]/)
      if (m) {
        const novos = JSON.parse(m[0])
        setRiscos((prev: any[]) => [...prev, ...novos.map((r: any, i: number) => ({
          id: `ia-${Date.now()}-${i}`,
          ...r,
          probabilidade: Math.min(5, Math.max(1, r.probabilidade || 3)),
          impacto: Math.min(5, Math.max(1, r.impacto || 3)),
        }))])
      }
    } catch (e) { console.error(e) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Análise de Riscos</h2>
          <p className="text-sm text-gray-500 mt-1">Identifique e avalie os riscos da contratação.</p>
          <span className="text-xs text-[#1351b4] font-medium">Art. 18, X · Lei 14.133/2021</span>
        </div>
        <Button variant="outline" size="sm" onClick={sugerirComIA} disabled={busy} className="text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc] shrink-0 ml-4">
          {busy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Sugerir com IA</>}
        </Button>
      </div>

      <div className="space-y-3 mb-4">
        {riscos.map((r: any) => {
          const n = NIVEL(r.probabilidade, r.impacto)
          return (
            <div key={r.id} className="border border-gray-100 rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${n.color}`}>{n.label}</span>
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r.categoria}</span>
                    <span className="text-[10px] text-gray-400">P{r.probabilidade}×I{r.impacto}</span>
                  </div>
                  <p className="text-sm text-gray-800 font-medium">{r.descricao}</p>
                  <p className="text-xs text-gray-500 mt-1">{r.mitigacao}</p>
                </div>
                <button onClick={() => setRiscos((p: any[]) => p.filter((x: any) => x.id !== r.id))} className="text-gray-300 hover:text-red-400 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <Button variant="outline" size="sm" onClick={() => setRiscos((p: any[]) => [...p, { id: `m-${Date.now()}`, descricao: "", categoria: "Geral", probabilidade: 3, impacto: 3, mitigacao: "" }])} className="w-full border-dashed border-gray-300 text-gray-500 h-9">
        <Plus className="w-4 h-4 mr-2" /> Adicionar risco manualmente
      </Button>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-gray-600"><ArrowLeft className="w-4 h-4 mr-1.5" /> Anterior</Button>
        <Button onClick={onNext} disabled={riscos.length === 0} className="bg-[#1351b4] hover:bg-[#0c326f]">Próxima etapa <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </div>
    </div>
  )
}

// ─── Step: Pesquisa de Preços ──────────────────────────────────────
function StepPesquisa({ fontes, setFontes, onNext, onBack }: any) {
  const validas = fontes.filter((f: any) => f.valor > 0)
  const media = validas.length ? validas.reduce((a: number, b: any) => a + b.valor, 0) / validas.length : 0

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900">Pesquisa de Preços</h2>
        <p className="text-sm text-gray-500 mt-1">Inclua pelo menos 3 fontes válidas (PNCP, Pesquisa de Precos Compras.gov.br ou cotações diretas).</p>
        <span className="text-xs text-[#1351b4] font-medium">Art. 23 · IN SEGES/ME 65/2021</span>
      </div>

      {validas.length >= 3 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span><strong>{validas.length} fontes válidas</strong> — Conformidade com Art. 23, §1º</span>
        </div>
      )}

      {media > 0 && (
        <div className="mb-4 p-3 bg-[#ecf3fc] border border-[#c5d4eb] rounded-xl text-xs text-[#1351b4] font-semibold">
          Valor médio das fontes: {media.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </div>
      )}

      <div className="space-y-3 mb-4">
        {fontes.map((f: any, idx: number) => (
          <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-white flex items-center gap-3">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input value={f.fonte} onChange={(e) => setFontes((p: any[]) => p.map((x, i) => i === idx ? { ...x, fonte: e.target.value } : x))} placeholder="Descrição da fonte…" className="text-xs h-8" />
              <Input value={f.valor || ""} onChange={(e) => setFontes((p: any[]) => p.map((x, i) => i === idx ? { ...x, valor: parseFloat(e.target.value) || 0 } : x))} placeholder="Valor unitário (R$)" type="number" className="text-xs h-8" />
            </div>
            <button onClick={() => setFontes((p: any[]) => p.filter((_: any, i: number) => i !== idx))} className="text-gray-300 hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={() => setFontes((p: any[]) => [...p, { fonte: "", valor: 0 }])} className="w-full border-dashed border-gray-300 text-gray-500 h-9">
        <Plus className="w-4 h-4 mr-2" /> Adicionar fonte de preço
      </Button>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-gray-600"><ArrowLeft className="w-4 h-4 mr-1.5" /> Anterior</Button>
        <Button onClick={onNext} disabled={validas.length < 3} className="bg-[#1351b4] hover:bg-[#0c326f]">Próxima etapa <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </div>
    </div>
  )
}

// ─── Step: Dotação Orçamentária ───────────────────────────────────
function StepDotacao({ dotacao, setDotacao, onNext, onBack }: any) {
  const isSRP = dotacao.srp === "true"
  const isExercicioSeguinte = dotacao.exercicio_seguinte === "true"
  const dispensada = isSRP || isExercicioSeguinte

  const valido = dispensada || (
    dotacao.elemento_despesa &&
    dotacao.fonte_recurso &&
    dotacao.dotacao &&
    dotacao.exercicio
  )

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900">Dotação Orçamentária</h2>
        <p className="text-sm text-gray-500 mt-1">
          Registre os dados orçamentários do processo. A reserva de dotação é obrigação do órgão (Art. 167 CF + Art. 16 LRF).
          O sistema registra as informações — a reserva efetiva é realizada diretamente no sistema contábil do órgão.
        </p>
        <span className="text-xs text-[#1351b4] font-medium">Art. 167 CF/88 · Art. 16 LRF · Art. 82, §1º e Art. 105 · Lei 14.133/2021</span>
      </div>

      {/* Casos de dispensa de dotação prévia */}
      <div className="mb-5 p-4 bg-[#f6f9fd] rounded-xl border border-[#dbe8fb] space-y-3">
        <p className="text-xs font-semibold text-gray-700 mb-1">Dotação prévia dispensada em:</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isSRP}
            onChange={(e) => setDotacao((p: any) => ({ ...p, srp: String(e.target.checked) }))}
            className="mt-0.5"
          />
          <div>
            <span className="text-xs font-medium text-gray-800">Sistema de Registro de Preços (SRP)</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Art. 82, §1º, I — a dotação é exigida somente na emissão da Nota de Empenho.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isExercicioSeguinte}
            onChange={(e) => setDotacao((p: any) => ({ ...p, exercicio_seguinte: String(e.target.checked) }))}
            className="mt-0.5"
          />
          <div>
            <span className="text-xs font-medium text-gray-800">Contrato para exercício financeiro subsequente</span>
            <p className="text-[10px] text-gray-500 mt-0.5">Art. 105 — dotação a indicar quando do exercício em que ocorrer a despesa.</p>
          </div>
        </label>
      </div>

      {/* Campos de dotação */}
      {!dispensada && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1.5">Elemento de despesa *</Label>
              <Input
                value={dotacao.elemento_despesa || ""}
                onChange={(e) => setDotacao((p: any) => ({ ...p, elemento_despesa: e.target.value }))}
                placeholder="Ex: 339039 – Outros Serviços de PJ"
              />
              <p className="mt-1 text-[10px] text-gray-400">Classificação da despesa pública</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1.5">Fonte de recurso *</Label>
              <Input
                value={dotacao.fonte_recurso || ""}
                onChange={(e) => setDotacao((p: any) => ({ ...p, fonte_recurso: e.target.value }))}
                placeholder="Ex: 0100 – Recursos Ordinários"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-700 mb-1.5">Dotação orçamentária *</Label>
            <Input
              value={dotacao.dotacao || ""}
              onChange={(e) => setDotacao((p: any) => ({ ...p, dotacao: e.target.value }))}
              placeholder="Ex: 20.122.0000.2272.0001 – Programa/Ação/Sub-ação"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1.5">Valor disponível (R$)</Label>
              <Input
                value={dotacao.valor_dotacao || ""}
                onChange={(e) => setDotacao((p: any) => ({ ...p, valor_dotacao: e.target.value }))}
                placeholder="Ex: 150000.00"
                type="number"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1.5">Exercício financeiro *</Label>
              <Input
                value={dotacao.exercicio || ""}
                onChange={(e) => setDotacao((p: any) => ({ ...p, exercicio: e.target.value }))}
                placeholder={String(new Date().getFullYear())}
                maxLength={4}
              />
            </div>
          </div>
        </div>
      )}

      {dispensada && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          Dotação prévia dispensada. Os dados orçamentários serão indicados no momento da solicitação/empenho.
        </div>
      )}

      <div className="mt-4">
        <Label className="text-xs font-semibold text-gray-700 mb-1.5">Observações</Label>
        <Textarea
          value={dotacao.observacoes || ""}
          onChange={(e) => setDotacao((p: any) => ({ ...p, observacoes: e.target.value }))}
          placeholder="Informações adicionais: ofício de reserva, certificação do setor financeiro, número do processo orçamentário…"
          rows={3}
          className="resize-none"
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-gray-600"><ArrowLeft className="w-4 h-4 mr-1.5" /> Anterior</Button>
        <Button onClick={onNext} disabled={!valido} className="bg-[#1351b4] hover:bg-[#0c326f]">Próxima etapa <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </div>
    </div>
  )
}

// ─── Step: Autorização ────────────────────────────────────────────
function StepAutorizacao({ autorizacao, setAutorizacao, onNext, onBack, ctx }: any) {
  const [busy, setBusy] = useState(false)

  const gerarComIA = async () => {
    setBusy(true)
    try {
      const r = await chamarIA(
        `Redija um parágrafo de autorização para início da fase externa de uma licitação conforme Art. 18, II da Lei 14.133/2021.\n\nObjeto: ${ctx.objeto}\nModalidade: ${ctx.modalidade || "não informada"}\n\nSeja formal, conciso, em primeira pessoa do plural.`,
        "autorizacao"
      )
      setAutorizacao(r.replace(/^["']|["']$/g, ""))
    } catch (e) { console.error(e) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Autorização da Autoridade Competente</h2>
          <p className="text-sm text-gray-500 mt-1">A autoridade competente autoriza o início do processo licitatório.</p>
          <span className="text-xs text-[#1351b4] font-medium">Art. 18, II · Lei 14.133/2021</span>
        </div>
        <Button variant="outline" size="sm" onClick={gerarComIA} disabled={busy} className="text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc] shrink-0 ml-4">
          {busy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gerar rascunho</>}
        </Button>
      </div>
      <Textarea value={autorizacao} onChange={(e) => setAutorizacao(e.target.value)} placeholder="Rascunho da autorização…" rows={8} className="resize-none" />
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-gray-600"><ArrowLeft className="w-4 h-4 mr-1.5" /> Anterior</Button>
        <Button onClick={onNext} disabled={!autorizacao} className="bg-[#1351b4] hover:bg-[#0c326f]">Próxima etapa <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </div>
    </div>
  )
}

// ─── Step: Parecer Jurídico ────────────────────────────────────────
function StepJuridico({ parecer, setParecer, onNext, onBack, ctx }: any) {
  const [busy, setBusy] = useState(false)

  const gerarComIA = async () => {
    setBusy(true)
    try {
      const r = await chamarIA(
        `Redija um parecer jurídico favorável para a fase interna de uma licitação, conforme Art. 53 da Lei 14.133/2021.\n\nObjeto: ${ctx.objeto}\nModalidade: ${ctx.modalidade || "não informada"}\n\nIncluir: análise formal, material, verificação dos documentos (DFD, ETP, MR, PP, TR) e conclusão. Linguagem jurídica formal.`,
        "parecer_juridico"
      )
      setParecer(r.replace(/^["']|["']$/g, ""))
    } catch (e) { console.error(e) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Parecer Jurídico</h2>
          <p className="text-sm text-gray-500 mt-1">A Procuradoria emite parecer sobre a regularidade formal e material dos documentos.</p>
          <span className="text-xs text-[#1351b4] font-medium">Art. 53 · Lei 14.133/2021</span>
        </div>
        <Button variant="outline" size="sm" onClick={gerarComIA} disabled={busy} className="text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc] shrink-0 ml-4">
          {busy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gerar minuta</>}
        </Button>
      </div>
      <Textarea value={parecer} onChange={(e) => setParecer(e.target.value)} placeholder="Minuta do parecer jurídico…" rows={10} className="resize-none" />
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-gray-600"><ArrowLeft className="w-4 h-4 mr-1.5" /> Anterior</Button>
        <Button onClick={onNext} disabled={!parecer} className="bg-[#1351b4] hover:bg-[#0c326f]">Concluir fase interna <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </div>
    </div>
  )
}

// ─── Step: Conclusão ───────────────────────────────────────────────
function StepConcluido({ ctx, onCriar, criando }: { ctx: any; onCriar: () => void; criando: boolean }) {
  const isContratacaoDireta = MODALIDADES_CONTRATACAO_DIRETA.includes(ctx.modalidade)
  const docs = [
    "DFD",
    "ETP",
    "Mapa de Riscos",
    "Pesquisa de Preços",
    "Termo de Referência",
    "Dotação Orçamentária",
    "Autorização",
    isContratacaoDireta ? "Aviso de Contratação Direta" : "Minuta do Edital",
    "Parecer Jurídico",
  ]
  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-6">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Fase interna concluída!</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-md">
        Todos os documentos foram elaborados em conformidade com a Lei 14.133/2021.
        {isContratacaoDireta && " Fluxo de contratação direta (sem minuta de edital)."}
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs mb-8 text-left w-full max-w-sm">
        {docs.map((doc) => (
          <div key={doc} className="flex items-center gap-2 text-green-700">
            <Check className="w-3.5 h-3.5 text-green-500 shrink-0" /> {doc}
          </div>
        ))}
      </div>
      <Button onClick={onCriar} disabled={criando} className="bg-[#1351b4] hover:bg-[#0c326f] px-8">
        {criando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando processo…</> : "Criar processo no sistema →"}
      </Button>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────
export default function NovoProcessoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const processoId = searchParams.get("id")
  const stepParam = searchParams.get("step")
  const [step, setStep] = useState(stepParam || "dados")
  const [completed, setCompleted] = useState<string[]>([])
  const [criando, setCriando] = useState(false)
  const [salvandoRascunho, setSalvandoRascunho] = useState(false)

  const [dados, setDados] = useState<Record<string, string>>({})
  const [docs, setDocs] = useState<Record<string, Record<string, string>>>({
    dfd: {}, etp: {}, tr: {}, edital: {}, aviso: {}
  })
  const [dotacao, setDotacao] = useState<Record<string, string>>({})
  const [riscos, setRiscos] = useState<any[]>([])
  const [fontes, setFontes] = useState<any[]>([{ fonte: "", valor: 0 }, { fonte: "", valor: 0 }, { fonte: "", valor: 0 }])
  const [autorizacao, setAutorizacao] = useState("")
  const [parecer, setParecer] = useState("")

  useEffect(() => {
    if (!processoId) return

    const aplicarTextoNasSecoes = (stepKey: string, texto?: string) => {
      if (!texto) return {}
      const secoes = TEMPLATES[stepKey]?.secoes || []
      const partes = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      return Object.fromEntries(secoes.map((secao, index) => [secao.id, partes[index] || ""]))
    }

    const aplicarDocumentoNasSecoes = (stepKey: string, documento?: any) => {
      const estruturado = documento?.dados_estruturados
      const secoes = TEMPLATES[stepKey]?.secoes || []
      const temChavesDoFormulario = estruturado && secoes.some((secao) => typeof estruturado[secao.id] === "string")
      return temChavesDoFormulario ? estruturado : aplicarTextoNasSecoes(stepKey, documento?.descricao)
    }

    const carregarRascunho = async () => {
      try {
        const [licitacaoRes, documentosRes] = await Promise.all([
          authFetch(`${API_URL}/api/licitacoes/${processoId}`),
          authFetch(`${API_URL}/api/fase-interna/${processoId}/documentos`),
        ])

        if (licitacaoRes.ok) {
          const licitacao = await licitacaoRes.json()
          setDados({
            objeto: licitacao.objeto || "",
            modalidade: desmapearModalidade(licitacao.modalidade),
            categoria: desmapearCategoria(licitacao.tipo_contratacao),
            criterio: desmapearCriterio(licitacao.criterio_julgamento),
            modoDisputa: desmapearModoDisputa(licitacao.modo_disputa),
            valor: licitacao.valor_total_estimado ? String(licitacao.valor_total_estimado) : "",
          })
        }

        if (documentosRes.ok) {
          const documentos = await documentosRes.json()
          const porTipo = Object.fromEntries(documentos.map((doc: any) => [doc.tipo, doc]))

          setDocs((prev) => ({
            ...prev,
            dfd: aplicarDocumentoNasSecoes("dfd", porTipo.DFD),
            etp: aplicarDocumentoNasSecoes("etp", porTipo.ETP),
            tr: aplicarDocumentoNasSecoes("tr", porTipo.TR),
            edital: aplicarDocumentoNasSecoes("edital", porTipo.ME),
            aviso: aplicarDocumentoNasSecoes("aviso", porTipo.AVISO),
          }))
          setAutorizacao(porTipo.AA?.descricao || "")
          setParecer(porTipo.PJ?.descricao || "")
        }
      } catch (e) {
        console.error("Erro ao carregar rascunho:", e)
      }
    }

    setStep(stepParam || "dfd")
    carregarRascunho()
  }, [processoId, stepParam])

  const ctx = {
    ...dados,
    valorMediano: fontes.filter((f) => f.valor > 0).length
      ? [...fontes.filter((f) => f.valor > 0)].sort((a, b) => a.valor - b.valor)[Math.floor(fontes.filter((f) => f.valor > 0).length / 2)]?.valor
      : 0,
  }

  const goToStep = useCallback((nextStep: string) => {
    if (nextStep === "pesquisa" && processoId) {
      router.push(`/orgao/fase-interna/processos/${processoId}/precos`)
      return
    }
    setStep(nextStep)
    if (processoId) {
      router.replace(`/orgao/fase-interna/processos/novo?id=${processoId}&step=${nextStep}`, { scroll: false })
    }
  }, [processoId, router])

  useEffect(() => {
    if (stepParam === "pesquisa" && processoId) {
      router.replace(`/orgao/fase-interna/processos/${processoId}/precos`)
    }
  }, [processoId, router, stepParam])

  const advance = useCallback(() => {
    setCompleted((prev) => prev.includes(step) ? prev : [...prev, step])
    const idx = WIZARD_ETAPAS.findIndex((e) => e.id === step)
    if (idx < WIZARD_ETAPAS.length - 1) goToStep(WIZARD_ETAPAS[idx + 1].id)
  }, [goToStep, step])

  const back = useCallback(() => {
    const idx = WIZARD_ETAPAS.findIndex((e) => e.id === step)
    if (idx > 0) goToStep(WIZARD_ETAPAS[idx - 1].id)
  }, [goToStep, step])

  const jump = useCallback((id: string) => goToStep(id), [goToStep])

  const updateDoc = (docKey: string, secId: string, val: string) => {
    setDocs((prev) => ({ ...prev, [docKey]: { ...prev[docKey], [secId]: val } }))
  }

  const buildWizardPayload = () => ({
    dfd: Object.values(docs.dfd).join("\n\n"),
    etp: docs.etp,
    etp_necessidade: Object.values(docs.etp).join("\n\n"),
    riscos: JSON.stringify(riscos),
    precos_fontes: JSON.stringify(fontes.filter((f) => f.valor > 0)),
    tr: docs.tr,
    tr_requisitos: Object.values(docs.tr).join("\n\n"),
    dotacao: JSON.stringify(dotacao),
    autorizacao_autoridade: autorizacao,
    edital_notas: Object.values(docs.edital || {}).join("\n\n"),
    aviso_notas: Object.values(docs.aviso || {}).join("\n\n"),
    juridico_obs: parecer,
  })

  const criarProcesso = async () => {
    setCriando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objeto: dados.objeto,
          modalidade: dados.modalidade,
          categoria: dados.categoria,
          valor_total_estimado: dados.valor || 0,
          fase: "PLANEJAMENTO",
        }),
      })
      if (res.ok) {
        const licitacao = await res.json()
        await authFetch(`${API_URL}/api/fase-interna/${licitacao.id}/wizard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildWizardPayload()),
        })
        router.push(`/orgao/fase-interna/processos/${licitacao.id}`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCriando(false)
    }
  }

  const salvarRascunho = async () => {
    if (!dados.objeto || !dados.modalidade || !dados.categoria) {
      alert("Preencha os dados básicos primeiro (objeto, modalidade e categoria)")
      return
    }
    const orgaoId = getOrgaoId()
    if (!orgaoId) {
      alert("Erro: órgão não identificado. Faça login novamente.")
      return
    }
    
    let valorEstimado = 0
    if (dados.valor) {
      const valorLimpo = dados.valor.replace(/[R$\s.,]/g, "").replace(",", ".")
      valorEstimado = parseFloat(valorLimpo) || 0
    }
    
    setSalvandoRascunho(true)
    try {
      const payloadLicitacao = {
        numero_processo: gerarNumeroProcesso(),
        orgao_id: orgaoId,
        objeto: dados.objeto,
        modalidade: mapearModalidade(dados.modalidade),
        tipo_contratacao: mapearCategoria(dados.categoria),
        criterio_julgamento: mapearCriterio(dados.criterio || "Menor preço"),
        modo_disputa: mapearModoDisputa(dados.modoDisputa || "Aberto"),
        valor_total_estimado: valorEstimado > 0 ? valorEstimado : undefined,
      }
      const res = await authFetch(
        processoId ? `${API_URL}/api/licitacoes/${processoId}` : `${API_URL}/api/licitacoes`,
        {
        method: processoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadLicitacao),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err.message || err.errors?.[0]?.message || "Erro ao criar processo"
        throw new Error(msg)
      }
      const licitacao = await res.json()
      const licitacaoId = processoId || licitacao.id
      const wizardRes = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildWizardPayload()),
      })
      if (!wizardRes.ok) {
        const err = await wizardRes.json().catch(() => ({}))
        throw new Error(err.message || "Erro ao salvar documentos do rascunho")
      }
      router.push(`/orgao/fase-interna/processos/novo?id=${licitacaoId}&step=${step}`)
    } catch (e: any) {
      console.error(e)
      alert(e.message || "Erro ao salvar rascunho")
    } finally {
      setSalvandoRascunho(false)
    }
  }

  const etapaAtual = WIZARD_ETAPAS.find((e) => e.id === step)
  const idxAtual = WIZARD_ETAPAS.findIndex((e) => e.id === step)

  const isContratacaoDireta = MODALIDADES_CONTRATACAO_DIRETA.includes(dados.modalidade)

  let content: React.ReactNode
  if (step === "dados")       content = <StepDados dados={dados} onChange={(k, v) => setDados((p) => ({ ...p, [k]: v }))} onNext={advance} />
  else if (step === "dfd")    content = <StepDocumento stepKey="dfd" secoes={docs.dfd} onChangeSec={(s, v) => updateDoc("dfd", s, v)} onNext={advance} onBack={back} ctx={ctx} />
  else if (step === "etp")    content = <StepDocumento stepKey="etp" secoes={docs.etp} onChangeSec={(s, v) => updateDoc("etp", s, v)} onNext={advance} onBack={back} ctx={ctx} />
  else if (step === "riscos") content = <StepRiscos riscos={riscos} setRiscos={setRiscos} onNext={advance} onBack={back} ctx={ctx} />
  else if (step === "pesquisa") content = <StepPesquisa fontes={fontes} setFontes={setFontes} onNext={advance} onBack={back} />
  else if (step === "tr")     content = <StepDocumento stepKey="tr" secoes={docs.tr} onChangeSec={(s, v) => updateDoc("tr", s, v)} onNext={advance} onBack={back} ctx={ctx} />
  else if (step === "dotacao") content = <StepDotacao dotacao={dotacao} setDotacao={setDotacao} onNext={advance} onBack={back} />
  else if (step === "autorizacao") content = <StepAutorizacao autorizacao={autorizacao} setAutorizacao={setAutorizacao} onNext={advance} onBack={back} ctx={ctx} />
  else if (step === "edital") content = isContratacaoDireta
    ? <StepDocumento stepKey="aviso" secoes={docs.aviso} onChangeSec={(s, v) => updateDoc("aviso", s, v)} onNext={advance} onBack={back} ctx={ctx} />
    : <StepDocumento stepKey="edital" secoes={docs.edital} onChangeSec={(s, v) => updateDoc("edital", s, v)} onNext={advance} onBack={back} ctx={ctx} />
  else if (step === "juridico") content = <StepJuridico parecer={parecer} setParecer={setParecer} onNext={advance} onBack={back} ctx={ctx} />
  else content = <StepConcluido ctx={ctx} onCriar={criarProcesso} criando={criando} />

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 px-6 py-3 border-b border-gray-100 shrink-0">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">Fase Interna</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna/processos" className="hover:text-[#1351b4]">Processos</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">Novo processo</span>
      </div>

      {/* Header da etapa */}
      {step !== "concluido" && (
        <div className="px-6 py-2.5 border-b border-gray-100 bg-[#f6f9fd] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold bg-[#1351b4] text-white px-2.5 py-1 rounded-full">
              Fase interna · {idxAtual + 1} de {WIZARD_ETAPAS.length - 1}
            </span>
            <span className="text-xs font-bold text-gray-800">{etapaAtual?.nome}</span>
            {etapaAtual?.art && <span className="text-xs text-gray-400">{etapaAtual.art}</span>}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={salvarRascunho}
            disabled={salvandoRascunho}
            className="text-[#1351b4] border-[#c5d4eb] hover:bg-[#f6f9fd]"
          >
            {salvandoRascunho ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="w-3.5 h-3.5 mr-1.5" /> Salvar rascunho</>
            )}
          </Button>
        </div>
      )}

      {/* Corpo: sidebar + conteúdo */}
      <div className="flex flex-1 min-h-0">
        {step !== "concluido" && (
          <WizardSidebar etapas={WIZARD_ETAPAS} current={step} completed={completed} onJump={jump} />
        )}
        {content}
      </div>
    </div>
  )
}
