"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2,
  AlertTriangle,
  FileText,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
