'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/**
 * CONFERÊNCIA ME/EPP DO EDITAL (LC 123/2006 arts. 48 e 49) no cockpit da
 * licitação — a mesma regra da pré-condição do ato PUBLICAR:
 *  - exclusivo acima do limite do inciso I (R$ 80.000; no lote, o total) BLOQUEIA;
 *  - itens até o limite sem exclusividade exigem a justificativa do art. 49
 *    (gravada na licitação e na transição da publicação);
 *  - cota reservada (inciso III) ainda não gerada → "Gerar cotas reservadas".
 * Não aparece sem pendência.
 */
export function CotasMeEppCard({ licitacaoId, onGerado }: { licitacaoId: string; onGerado?: () => void }) {
  const [problemas, setProblemas] = useState<string[]>([])
  const [bloqueios, setBloqueios] = useState<string[]>([])
  const [exigeJustificativa, setExigeJustificativa] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/me-epp/conferencia`)
      if (!res.ok) return
      const dados = await res.json()
      setProblemas(Array.isArray(dados?.problemas) ? dados.problemas : [])
      setBloqueios(Array.isArray(dados?.bloqueiosPublicacao) ? dados.bloqueiosPublicacao : [])
      setExigeJustificativa(!!dados?.exigeJustificativaArt49)
      setJustificativa(dados?.justificativaArt49 ?? '')
    } catch {
      /* conferência é informativa */
    }
  }, [licitacaoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const executar = async (acao: () => Promise<Response>, ok: (dados: any) => string) => {
    setOcupado(true)
    setMensagem(null)
    try {
      const res = await acao()
      const dados = await res.json().catch(() => null)
      if (!res.ok) throw new Error(dados?.message || 'Operação não concluída')
      setMensagem({ tipo: 'ok', texto: ok(dados) })
      await carregar()
      onGerado?.()
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Erro' })
    } finally {
      setOcupado(false)
    }
  }

  const gerar = () =>
    executar(
      () => authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/me-epp/cotas`, { method: 'POST', body: '{}' }),
      (d) => (Array.isArray(d?.criadas) && d.criadas.length ? `${d.criadas.length} cota(s) reservada(s) gerada(s).` : 'Nenhuma cota pendente.'),
    )

  const salvarJustificativa = () =>
    executar(
      () =>
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`, {
          method: 'PUT',
          body: JSON.stringify({ justificativa_nao_exclusividade_mpe: justificativa.trim() }),
        }),
      () => 'Justificativa do art. 49 registrada.',
    )

  const pendencias = [...new Set([...problemas, ...bloqueios])]
  if (pendencias.length === 0 && !exigeJustificativa && !mensagem) return null
  const temCotaPendente = problemas.some((p) => /cota reservada/i.test(p))

  return (
    <Card className="mb-4 border-amber-300">
      <CardHeader className="bg-amber-50 py-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-900">
          <ShieldCheck className="h-4 w-4" />
          Tratamento ME/EPP (LC 123/2006, arts. 48 e 49)
        </CardTitle>
        <CardDescription>
          Exclusividade só até R$ 80.000 por item (no lote, pelo total) — acima disso a publicação é bloqueada; itens até o limite
          sem exclusividade exigem justificativa; cota reservada de até 25%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-3 text-sm">
        {pendencias.map((p) => (
          <div key={p} className="flex items-start gap-2 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{p}</span>
          </div>
        ))}
        {exigeJustificativa && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700" htmlFor="just-art49">
              Justificativa para não reservar itens até R$ 80.000 a ME/EPP (art. 49)
            </label>
            <Textarea
              id="just-art49"
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: art. 49, II — não há um mínimo de 3 fornecedores ME/EPP competitivos sediados local ou regionalmente..."
            />
            <Button size="sm" variant="outline" onClick={salvarJustificativa} disabled={ocupado || justificativa.trim().length < 20}>
              Salvar justificativa
            </Button>
          </div>
        )}
        {mensagem && (
          <div className={`flex items-center gap-2 ${mensagem.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
            {mensagem.tipo === 'ok' && <CheckCircle2 className="h-4 w-4" />}
            {mensagem.texto}
          </div>
        )}
        {temCotaPendente && (
          <Button size="sm" onClick={gerar} disabled={ocupado}>
            Gerar cotas reservadas
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
