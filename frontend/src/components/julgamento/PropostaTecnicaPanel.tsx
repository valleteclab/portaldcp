'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, Save, Trash2, Upload } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * PROPOSTA TÉCNICA / DE TRABALHO do licitante (junto com a proposta, até o
 * fim do acolhimento):
 *  - melhor técnica / técnica e preço (Lei 14.133 arts. 35–37): arquivos da
 *    proposta técnica — sigilosos para os demais licitantes até a publicação
 *    das notas;
 *  - maior retorno econômico (art. 39 §1º): economia estimada (R$) e o
 *    percentual sobre a economia, por item — retorno = economia − remuneração.
 * Não aparece nos demais critérios.
 */

interface Documento {
  id: string
  fornecedorId: string
  nome: string
  tamanho: number
  enviadoEm: string
}
interface ItemProposta {
  id: string
  numero: number
  descricao: string
}

const FASES_ENVIO = ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS']

export function PropostaTecnicaPanel({ licitacaoId, fornecedorId, itens }: { licitacaoId: string; fornecedorId?: string | null; itens: ItemProposta[] }) {
  const [criterio, setCriterio] = useState<string | null>(null)
  const [fase, setFase] = useState<string>('')
  const [docs, setDocs] = useState<Documento[]>([])
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [retornos, setRetornos] = useState<Record<string, { economia: string; percentual: string; descricao: string }>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const c = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/configuracao`)
      if (!c.ok) return
      const cfg = await c.json()
      setCriterio(cfg.criterio)
      setFase(cfg.fase)
      if (!cfg.pontuado) return
      const d = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/documentos`)
      if (d.ok) {
        const lista: Documento[] = (await d.json()).documentos ?? []
        setDocs(fornecedorId ? lista.filter((x) => x.fornecedorId === fornecedorId) : lista)
      }
      if (cfg.criterio === 'MAIOR_RETORNO_ECONOMICO') {
        const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/retorno-economico`)
        if (r.ok) {
          const m: Record<string, { economia: string; percentual: string; descricao: string }> = {}
          for (const x of (await r.json()).retornos ?? []) {
            m[x.unidadeId] = { economia: String(x.economiaEstimada), percentual: String(x.percentualRemuneracao), descricao: x.descricaoEconomia ?? '' }
          }
          setRetornos(m)
        }
      }
    } catch {
      /* painel opcional */
    }
  }, [licitacaoId, fornecedorId])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!criterio || !['MELHOR_TECNICA', 'TECNICA_E_PRECO', 'MAIOR_RETORNO_ECONOMICO'].includes(criterio)) return null
  const aberto = FASES_ENVIO.includes(fase)
  const retorno = criterio === 'MAIOR_RETORNO_ECONOMICO'

  const enviar = async () => {
    if (!arquivo) return
    setOcupado(true)
    setErro(null)
    setOk(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      fd.append('descricao', retorno ? 'Proposta de trabalho' : 'Proposta técnica')
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/documentos`, { method: 'POST', body: fd })
      if (!r.ok) {
        const e = await r.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível anexar')
      }
      setArquivo(null)
      setOk('Arquivo anexado.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const remover = async (d: Documento) => {
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/documentos/${d.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Não foi possível remover')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const salvarRetorno = async () => {
    setOcupado(true)
    setErro(null)
    setOk(null)
    try {
      const corpo = itens
        .filter((i) => retornos[i.id]?.economia && retornos[i.id]?.percentual)
        .map((i) => ({
          unidadeId: i.id,
          economiaEstimada: Number(retornos[i.id].economia.replace(',', '.')),
          percentualRemuneracao: Number(retornos[i.id].percentual.replace(',', '.')),
          descricaoEconomia: retornos[i.id].descricao || null,
        }))
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/retorno-economico`, { method: 'PUT', body: JSON.stringify({ itens: corpo }) })
      if (!r.ok) {
        const e = await r.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível salvar')
      }
      setOk('Proposta de trabalho salva.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const abrir = async (d: Documento) => {
    const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/documentos/${d.id}/arquivo`).catch(() => null)
    if (r && r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank', 'noopener')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {retorno ? 'Proposta de trabalho (maior retorno econômico)' : 'Proposta técnica'}
        </CardTitle>
        <CardDescription>
          {retorno
            ? 'Lei 14.133/2021, art. 39: informe a economia estimada e o percentual sobre ela (sua remuneração). Retorno = economia − remuneração.'
            : 'Lei 14.133/2021, arts. 35–37: anexe a proposta técnica. Ela é avaliada pela banca e só fica visível aos demais licitantes depois da publicação das notas.'}
          {!aberto && ' O acolhimento terminou: a proposta não pode mais ser alterada.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

        {retorno && (
          <div className="space-y-2">
            {itens.map((i) => (
              <div key={i.id} className="grid gap-2 rounded border p-2 sm:grid-cols-4">
                <div className="text-sm sm:col-span-4">
                  Item {i.numero} — {i.descricao}
                </div>
                <Input
                  placeholder="Economia estimada (R$)"
                  inputMode="decimal"
                  disabled={!aberto}
                  value={retornos[i.id]?.economia ?? ''}
                  onChange={(e) => setRetornos((r) => ({ ...r, [i.id]: { ...(r[i.id] ?? { percentual: '', descricao: '' }), economia: e.target.value } }))}
                />
                <Input
                  placeholder="Percentual (%)"
                  inputMode="decimal"
                  disabled={!aberto}
                  value={retornos[i.id]?.percentual ?? ''}
                  onChange={(e) => setRetornos((r) => ({ ...r, [i.id]: { ...(r[i.id] ?? { economia: '', descricao: '' }), percentual: e.target.value } }))}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="Economia na unidade de medida (ex.: 120 MWh/ano)"
                  disabled={!aberto}
                  value={retornos[i.id]?.descricao ?? ''}
                  onChange={(e) => setRetornos((r) => ({ ...r, [i.id]: { ...(r[i.id] ?? { economia: '', percentual: '' }), descricao: e.target.value } }))}
                />
              </div>
            ))}
            {aberto && (
              <Button onClick={salvarRetorno} disabled={ocupado}>
                <Save className="mr-1 h-4 w-4" />
                Salvar proposta de trabalho
              </Button>
            )}
          </div>
        )}

        <ul className="space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
              <button className="truncate text-left text-blue-700 hover:underline" onClick={() => abrir(d)}>
                {d.nome}
              </button>
              {aberto && (
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => remover(d)} title="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
          {docs.length === 0 && <li className="text-slate-500">Nenhum arquivo anexado.</li>}
        </ul>
        {aberto && (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="max-w-xs" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <Button onClick={enviar} disabled={!arquivo || ocupado}>
              <Upload className="mr-1 h-4 w-4" />
              Anexar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
