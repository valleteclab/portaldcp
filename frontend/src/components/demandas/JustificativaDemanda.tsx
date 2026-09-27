'use client'

/**
 * Justificativa da necessidade da demanda (salva em `observacoes`, com
 * salvamento automático) e "Redigir/Melhorar com IA".
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'
import { SecaoDemanda } from './SecaoDemanda'

export function JustificativaDemanda({
  demandaId,
  justificativa,
  podeEditar,
  onSalvo,
  contextoObjeto,
}: {
  demandaId: string
  justificativa: string
  podeEditar: boolean
  onSalvo: (texto: string) => void
  contextoObjeto?: string
}) {
  const [texto, setTexto] = useState(justificativa)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(true)
  const [melhorando, setMelhorando] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza quando a prop muda (ex.: reload)
  useEffect(() => { setTexto(justificativa) }, [justificativa])

  const salvar = useCallback(async (valor: string) => {
    setSalvando(true)
    try {
      await authFetch(`${API_URL}/api/demandas/${demandaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacoes: valor }),
      })
      onSalvo(valor)
      setSalvo(true)
    } finally {
      setSalvando(false)
    }
  }, [demandaId, onSalvo])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setTexto(val)
    setSalvo(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => salvar(val), 1200)
  }

  // Redige/melhora a justificativa com IA usando o objeto da demanda como
  // contexto — o servidor escreve tópicos (ou nada) e revisa o resultado
  const melhorarComIA = async () => {
    if (melhorando) return
    setMelhorando(true)
    try {
      const atual = texto.trim()
      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: [{
            role: 'user',
            content:
              `Você redige justificativas de necessidade para demandas de contratação pública (Art. 18, I, Lei 14.133/2021). ` +
              (atual
                ? `Melhore e desenvolva o texto do usuário, preservando todos os fatos e intenções. `
                : `Redija a justificativa da necessidade a partir do objeto informado. `) +
              `Texto formal, 2 a 4 parágrafos, sem placeholders. Responda APENAS com o texto final.\n\n` +
              `Objeto da demanda: ${contextoObjeto || 'não informado'}\n` +
              (atual ? `\nTexto do usuário:\n${atual}` : ''),
          }],
          tipoDocumento: 'DFD',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const novo = String(data.resposta || '').trim()
      if (!novo) throw new Error('vazio')
      setTexto(novo)
      setSalvo(false)
      await salvar(novo)
    } catch {
      toast.error('Não foi possível gerar agora — tente novamente em instantes.')
    } finally {
      setMelhorando(false)
    }
  }

  const caracteres = texto.trim().length

  return (
    <SecaoDemanda
      id="secao-2"
      numero={2}
      titulo="Justificativa da necessidade"
      completa={!!justificativa.trim()}
      descricao="Por que o setor precisa disso? Ex.: o que falta hoje, o que acontece se não comprar. (Lei 14.133, art. 18, I)"
      acoes={podeEditar ? (
        <>
          {(salvando || (salvo && texto)) && (
            <span className={`text-xs ${salvando ? 'text-amber-700' : 'text-green-700'}`} role="status">
              {salvando ? 'Salvando…' : 'Salvo'}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-[#1351b4] border-[#c5d4eb] bg-[#f6f9fd] hover:bg-[#ecf3fc]"
            onClick={melhorarComIA}
            disabled={melhorando}
            title={texto.trim() ? 'A IA desenvolve o seu texto preservando os fatos' : 'A IA redige a justificativa a partir do objeto da demanda'}
          >
            {melhorando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {melhorando ? 'Gerando…' : texto.trim() ? 'Melhorar com IA' : 'Redigir com IA'}
          </Button>
        </>
      ) : undefined}
    >
      {podeEditar ? (
        <>
          <Textarea
            aria-label="Justificativa da necessidade"
            value={texto}
            onChange={handleChange}
            placeholder="Escreva do seu jeito — a IA pode formalizar. Ex.: as cadeiras do atendimento estão quebradas e não há reposição; sem elas o setor não atende o público."
            rows={8}
            className="min-h-[180px] w-full resize-y leading-relaxed"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
            <span>Salva sozinho enquanto você escreve. O planejamento aproveita este texto no DFD.</span>
            <span>{caracteres.toLocaleString('pt-BR')} caracteres</span>
          </div>
        </>
      ) : (
        <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
          {texto || <span className="text-gray-500 italic">Sem justificativa informada.</span>}
        </div>
      )}
    </SecaoDemanda>
  )
}

