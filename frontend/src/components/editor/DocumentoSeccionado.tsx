"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2,
  AlertTriangle,
  FileText,
  Eye,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { API_URL, authFetch } from '@/lib/api'
import { SecaoEditor } from './SecaoEditor'
import { PainelIA } from './PainelIA'
import {
  getSecoes,
  getTemplate,
  TITULOS_TIPO,
  type SecaoTemplate,
} from '@/lib/fase-interna/secoes-template'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentoFaseInterna {
  id?: string
  tipo: string
  titulo?: string
  descricao?: string
  dados_estruturados?: Record<string, unknown>
  status?: string
}

interface LicitacaoMini {
  numero_processo?: string
  objeto?: string
  modalidade?: string
  criterio_julgamento?: string
  valor_estimado?: number
  natureza_objeto?: string
}

interface DocumentoSeccionadoProps {
  licitacaoId: string
  tipo: string
  documento: DocumentoFaseInterna | null
  licitacao?: LicitacaoMini | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrai os valores de cada seção a partir de dados_estruturados ou descricao.
 * Se dados_estruturados tem os IDs das seções → usa diretamente.
 * Se não → tenta parsear descricao HTML por headings H2.
 */
function extrairConteudoSecoes(
  doc: DocumentoFaseInterna | null,
  secoes: SecaoTemplate[],
): Record<string, string> {
  if (!doc) return {}

  const dados = doc.dados_estruturados as Record<string, string> | undefined

  // 1. Se dados_estruturados tem pelo menos uma chave que é uma das seções → usa
  if (dados && secoes.some((s) => s.id in dados)) {
    const result: Record<string, string> = {}
    for (const s of secoes) {
      const val = dados[s.id]
      if (typeof val === 'string') {
        // Se parece HTML rico → usa direto; caso contrário, envolve em <p>
        result[s.id] = val.trim().startsWith('<') ? val : val ? `<p>${val}</p>` : ''
      } else {
        result[s.id] = ''
      }
    }
    return result
  }

  // 2. Fallback: dados_estruturados não tem chaves das seções mas tem valores
  // (caso legado onde o JSON tem chaves diferentes)
  if (dados && Object.keys(dados).length > 0) {
    const result: Record<string, string> = {}
    for (const s of secoes) {
      // Tenta match por substring do id
      const found = Object.entries(dados).find(
        ([k]) => k === s.id || k.includes(s.id) || s.id.includes(k),
      )
      result[s.id] = found ? `<p>${found[1]}</p>` : ''
    }
    return result
  }

  // 3. Último recurso: descricao HTML pura (caso de texto sem estrutura)
  if (doc.descricao?.trim()) {
    // Distribuir no primeiro campo
    const result: Record<string, string> = {}
    if (secoes.length > 0) {
      result[secoes[0].id] = doc.descricao
    }
    return result
  }

  return {}
}

// ─── Herdar de documentos anteriores (seed) ──────────────────────────────────

interface SeedEntry {
  html: string
  origem: string
}

type SeedSecoes = Record<string, SeedEntry>

/** Remove tags HTML e retorna o texto puro, com espaços normalizados. */
function textoPuro(html: string): string {
  return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function preview(html: string, max = 120): string {
  const t = textoPuro(html)
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}

// ─── Status de auto-save por seção ────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ─── Componente principal ─────────────────────────────────────────────────────

export function DocumentoSeccionado({
  licitacaoId,
  tipo,
  documento,
  licitacao,
}: DocumentoSeccionadoProps) {
  const secoes = getSecoes(tipo)
  const template = getTemplate(tipo)
  const tituloDocumento = TITULOS_TIPO[tipo] || tipo

  // Estado do conteúdo por seção (HTML)
  const [conteudo, setConteudo] = useState<Record<string, string>>(() =>
    extrairConteudoSecoes(documento, secoes),
  )

  // Status de save por seção
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({})

  // Timers de debounce por seção
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Sync quando documento muda (ex: reload externo)
  useEffect(() => {
    const novo = extrairConteudoSecoes(documento, secoes)
    setConteudo(novo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documento?.id, documento?.dados_estruturados])

  // ─── Auto-save por seção ───────────────────────────────────────────────────

  const salvarSecao = useCallback(
    async (secaoId: string, html: string) => {
      setSaveStatus((prev) => ({ ...prev, [secaoId]: 'saving' }))
      try {
        const res = await authFetch(
          `${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/secao/${secaoId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html }),
          },
        )
        setSaveStatus((prev) => ({
          ...prev,
          [secaoId]: res.ok ? 'saved' : 'error',
        }))
        // Limpa o indicador "saved" após 3s
        if (res.ok) {
          setTimeout(() => {
            setSaveStatus((prev) => ({ ...prev, [secaoId]: 'idle' }))
          }, 3000)
        }
      } catch {
        setSaveStatus((prev) => ({ ...prev, [secaoId]: 'error' }))
      }
    },
    [licitacaoId, tipo],
  )

  const handleSecaoChange = useCallback(
    (secaoId: string, html: string) => {
      setConteudo((prev) => ({ ...prev, [secaoId]: html }))

      // Debounce: cancela timer anterior, agenda novo save em 700ms
      if (debounceTimers.current[secaoId]) {
        clearTimeout(debounceTimers.current[secaoId])
      }
      setSaveStatus((prev) => ({ ...prev, [secaoId]: 'idle' }))
      debounceTimers.current[secaoId] = setTimeout(() => {
        salvarSecao(secaoId, html)
      }, 700)
    },
    [salvarSecao],
  )

  // ─── Inserir de IA ─────────────────────────────────────────────────────────

  // Ref map para forçar conteúdo nas seções via chave (re-render trick)
  const [inserirConteudo, setInserirConteudo] = useState<Record<string, string>>({})

  const handleInserirNaSecao = useCallback(
    (secaoId: string, html: string) => {
      const atual = conteudo[secaoId] || ''
      const novo = atual ? atual + '\n' + html : html
      setConteudo((prev) => ({ ...prev, [secaoId]: novo }))
      setInserirConteudo((prev) => ({ ...prev, [secaoId]: novo }))
      // Agenda save imediato
      salvarSecao(secaoId, novo)
    },
    [conteudo, salvarSecao],
  )

  // ─── Herdar de documentos anteriores (seed) ───────────────────────────────

  const [seedLoading, setSeedLoading] = useState(false)
  const [seedModalAberto, setSeedModalAberto] = useState(false)
  const [seedSecoes, setSeedSecoes] = useState<SeedSecoes>({})
  const [seedSelecionadas, setSeedSelecionadas] = useState<Record<string, boolean>>({})
  const [seedAplicando, setSeedAplicando] = useState(false)
  const [seedErro, setSeedErro] = useState<string | null>(null)
  // Banner exibido quando não há nada a herdar
  const [seedSemHeranca, setSeedSemHeranca] = useState(false)

  const tituloDaSecao = useCallback(
    (secaoId: string) => secoes.find((s) => s.id === secaoId)?.titulo.replace(/\s*\*$/, '') ?? secaoId,
    [secoes],
  )

  const buscarSeed = useCallback(async () => {
    setSeedLoading(true)
    setSeedSemHeranca(false)
    setSeedErro(null)
    try {
      const res = await authFetch(
        `${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/seed`,
      )
      const data: { secoes?: SeedSecoes } = await res.json().catch(() => ({}))
      const dados = data?.secoes ?? {}
      const ids = Object.keys(dados)

      if (ids.length === 0) {
        setSeedSemHeranca(true)
        return
      }

      // Marca por padrão apenas as seções atualmente vazias
      const selecao: Record<string, boolean> = {}
      for (const id of ids) {
        const atual = conteudo[id] ?? ''
        selecao[id] = textoPuro(atual).length === 0
      }
      setSeedSecoes(dados)
      setSeedSelecionadas(selecao)
      setSeedModalAberto(true)
    } catch {
      setSeedErro('Não foi possível buscar o conteúdo dos documentos anteriores.')
      setSeedSemHeranca(true)
    } finally {
      setSeedLoading(false)
    }
  }, [licitacaoId, tipo, conteudo])

  const idsSelecionados = Object.keys(seedSelecionadas).filter((id) => seedSelecionadas[id])

  const aplicarSeed = useCallback(async () => {
    if (idsSelecionados.length === 0) return
    setSeedAplicando(true)
    setSeedErro(null)
    try {
      const res = await authFetch(
        `${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/aplicar-seed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secoes: idsSelecionados, sobrescrever: true }),
        },
      )

      if (!res.ok) {
        const erro = await res.json().catch(() => null)
        setSeedErro(erro?.message || 'Não foi possível aplicar o conteúdo selecionado.')
        return
      }

      const data: { dados_estruturados?: Record<string, unknown> } = await res
        .json()
        .catch(() => ({}))
      const dados = data?.dados_estruturados ?? {}

      // Apenas valores string
      const atualizacao: Record<string, string> = {}
      for (const [id, val] of Object.entries(dados)) {
        if (typeof val === 'string') atualizacao[id] = val
      }

      setConteudo((prev) => ({ ...prev, ...atualizacao }))
      setInserirConteudo((prev) => ({ ...prev, ...atualizacao }))
      setSeedModalAberto(false)
    } catch {
      setSeedErro('Não foi possível aplicar o conteúdo selecionado.')
    } finally {
      setSeedAplicando(false)
    }
  }, [idsSelecionados, licitacaoId, tipo])

  // ─── Cálculo de progresso ──────────────────────────────────────────────────

  const secoesObrigatorias = secoes.filter((s) => s.obrigatorio)
  const secoesPreenchidas = secoesObrigatorias.filter((s) => {
    const c = conteudo[s.id] || ''
    return c.replace(/<[^>]+>/g, '').trim().length > 10
  })
  const progresso =
    secoesObrigatorias.length > 0
      ? Math.round((secoesPreenchidas.length / secoesObrigatorias.length) * 100)
      : 0

  // ─── Sem template (ex: AR, PP) ─────────────────────────────────────────────

  if (!template || secoes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <div>
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <h3 className="font-medium text-gray-700 mb-1">
            Este tipo de documento não usa o editor de seções
          </h3>
          <p className="text-sm text-gray-500">
            {tituloDocumento} é gerenciado por uma interface especializada.
          </p>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Coluna principal: seções ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 min-w-0">
        {/* Cabeçalho do documento */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <FileText className="w-4 h-4 text-[#1351b4] shrink-0" />
                <h2 className="text-sm font-semibold text-gray-900 truncate">{tituloDocumento}</h2>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1351b4]/10 text-[#1351b4] shrink-0">
                  {tipo}
                </span>
              </div>
              {template.artigo && (
                <p className="text-[11px] text-gray-400">{template.artigo}</p>
              )}
            </div>

            {/* Progresso + botão PDF */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progresso >= 80
                        ? 'bg-green-500'
                        : progresso >= 50
                          ? 'bg-amber-400'
                          : 'bg-[#1351b4]'
                    }`}
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <span className="text-[11px] text-gray-500 w-8">{progresso}%</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={buscarSeed}
                disabled={seedLoading}
                title="Preencher as seções a partir dos documentos e da demanda já cadastrados"
              >
                {seedLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                Preencher dos anteriores
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  window.open(
                    `${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/pdf`,
                    '_blank',
                  )
                }}
              >
                <Eye className="w-3.5 h-3.5" /> PDF
              </Button>
            </div>
          </div>

          {/* Intro legal */}
          {template.intro && (
            <p className="text-xs text-gray-500 mt-2 leading-relaxed border-t border-gray-100 pt-2">
              {template.intro}
            </p>
          )}
        </div>

        {/* Seções */}
        <div className="p-6 space-y-6 max-w-3xl mx-auto">
          {/* Aviso: nada a herdar */}
          {seedSemHeranca && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <p className="flex-1 leading-relaxed">
                {seedErro ??
                  'Nada a herdar ainda — preencha os documentos anteriores primeiro.'}
              </p>
              <button
                type="button"
                onClick={() => setSeedSemHeranca(false)}
                className="shrink-0 text-amber-500 hover:text-amber-700"
                aria-label="Dispensar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {secoes.map((secao) => (
            <SecaoCard
              key={secao.id}
              secao={secao}
              value={inserirConteudo[secao.id] ?? conteudo[secao.id] ?? ''}
              saveStatus={saveStatus[secao.id] || 'idle'}
              onChange={(html) => handleSecaoChange(secao.id, html)}
            />
          ))}

          {/* Rodapé */}
          <div className="pb-8 text-center">
            <p className="text-xs text-gray-400">
              {secoesPreenchidas.length}/{secoesObrigatorias.length} seções obrigatórias preenchidas
              · Salvo automaticamente
            </p>
          </div>
        </div>
      </div>

      {/* ── Painel IA fixo à direita ── */}
      <div className="w-80 shrink-0 border-l border-gray-200 overflow-hidden">
        <PainelIA
          tipoDocumento={tipo}
          licitacaoId={licitacaoId}
          secoes={secoes}
          conteudoSecoes={conteudo}
          dadosProcesso={
            licitacao
              ? {
                  objeto: licitacao.objeto,
                  modalidade: licitacao.modalidade,
                  criterio_julgamento: licitacao.criterio_julgamento,
                  valor_estimado: licitacao.valor_estimado,
                  numero_processo: licitacao.numero_processo,
                  natureza_objeto: licitacao.natureza_objeto,
                }
              : undefined
          }
          onInserirNaSecao={handleInserirNaSecao}
        />
      </div>

      {/* ── Modal: preencher dos documentos anteriores ── */}
      <Dialog
        open={seedModalAberto}
        onOpenChange={(aberto) => {
          if (!seedAplicando) setSeedModalAberto(aberto)
        }}
      >
        <DialogContent className="max-w-xl bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-gray-900">
              <Wand2 className="w-4 h-4 text-[#1351b4]" />
              Preencher dos documentos anteriores
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-gray-500 -mt-1">
            Selecione as seções que deseja preencher com o conteúdo derivado dos
            documentos e da demanda já cadastrados.
          </p>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {Object.entries(seedSecoes).map(([secaoId, entry]) => {
              const atual = conteudo[secaoId] ?? ''
              const temConteudoAtual = textoPuro(atual).length > 0
              const checked = !!seedSelecionadas[secaoId]
              return (
                <label
                  key={secaoId}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    checked
                      ? 'border-[#1351b4]/40 bg-[#1351b4]/5'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#1351b4]"
                    checked={checked}
                    onChange={(e) =>
                      setSeedSelecionadas((prev) => ({
                        ...prev,
                        [secaoId]: e.target.checked,
                      }))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {tituloDaSecao(secaoId)}
                      </span>
                      {entry.origem && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1351b4]/10 text-[#1351b4] shrink-0">
                          {entry.origem}
                        </span>
                      )}
                    </div>
                    {preview(entry.html) && (
                      <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                        {preview(entry.html)}
                      </p>
                    )}
                    {temConteudoAtual && checked && (
                      <p className="text-[11px] text-amber-600 mt-1">
                        substituirá o conteúdo atual
                      </p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>

          {seedErro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {seedErro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSeedModalAberto(false)}
              disabled={seedAplicando}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={aplicarSeed}
              disabled={seedAplicando || idsSelecionados.length === 0}
            >
              {seedAplicando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Aplicar selecionadas ({idsSelecionados.length})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Card de seção ────────────────────────────────────────────────────────────

function SecaoCard({
  secao,
  value,
  saveStatus,
  onChange,
}: {
  secao: SecaoTemplate
  value: string
  saveStatus: SaveStatus
  onChange: (html: string) => void
}) {
  const temConteudo = value.replace(/<[^>]+>/g, '').trim().length > 0
  const vazia = secao.obrigatorio && !temConteudo

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Cabeçalho da seção */}
      <div
        className={`px-4 py-3 border-b flex items-start justify-between gap-2 ${
          vazia ? 'border-red-100 bg-red-50/50' : 'border-gray-100 bg-gray-50/60'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-800 leading-tight">
              {secao.titulo.replace(/\s*\*$/, '')}
            </h3>
            {secao.obrigatorio && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                  vazia
                    ? 'bg-red-100 text-red-600'
                    : 'bg-green-100 text-green-600'
                }`}
              >
                {vazia ? '⚠ Obrigatório' : '✓ Obrigatório'}
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">{secao.fundamentoLegal}</p>
        </div>

        {/* Indicador de save */}
        <SaveIndicator status={saveStatus} />
      </div>

      {/* Editor da seção */}
      <div className="p-3">
        <SecaoEditor
          value={value}
          onChange={onChange}
          placeholder={secao.placeholder}
        />
      </div>
    </div>
  )
}

// ─── Indicador de save ────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null

  return (
    <div className="shrink-0 flex items-center gap-1 text-[10px] font-medium">
      {status === 'saving' && (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
          <span className="text-amber-500">Salvando…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <span className="text-green-600">✓ Salvo</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertTriangle className="w-3 h-3 text-red-500" />
          <span className="text-red-500">Erro</span>
        </>
      )}
    </div>
  )
}
