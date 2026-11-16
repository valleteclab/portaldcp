'use client'

import { useEffect, useState } from 'react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

type MotivoSuspensao = 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL'

/** Suspensão da sessão com motivo e justificativa (substitui prompt()). */
export function DialogoSuspender({
  aberto,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean
  onFechar: () => void
  onConfirmar: (p: { motivo: MotivoSuspensao; justificativa: string }) => void
}) {
  const [motivo, setMotivo] = useState<MotivoSuspensao>('ADMINISTRATIVO')
  const [justificativa, setJustificativa] = useState('')
  const confirmar = () => {
    if (!justificativa.trim()) return
    onConfirmar({ motivo, justificativa: justificativa.trim() })
    setJustificativa('')
    onFechar()
  }
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspender sessão</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['ADMINISTRATIVO', 'CAUTELAR', 'JUDICIAL'] as const).map((m) => (
              <Button key={m} type="button" variant={motivo === m ? 'default' : 'outline'} onClick={() => setMotivo(m)}>
                {m}
              </Button>
            ))}
          </div>
          <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Descreva o motivo da suspensão..." rows={4} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!justificativa.trim()}>Confirmar suspensão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Diálogo genérico de ato com justificativa obrigatória. */
export function DialogoJustificativa({
  aberto,
  titulo,
  texto,
  rotuloConfirmar,
  destrutivo,
  enviando,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean
  titulo: string
  texto: string
  rotuloConfirmar: string
  destrutivo?: boolean
  enviando?: boolean
  onFechar: () => void
  /** Retorna true (ou void) quando o ato foi aceito — o diálogo fecha. */
  onConfirmar: (justificativa: string) => Promise<boolean | void> | boolean | void
}) {
  const [justificativa, setJustificativa] = useState('')
  const confirmar = async () => {
    if (!justificativa.trim()) return
    const ok = await onConfirmar(justificativa.trim())
    if (ok !== false) {
      setJustificativa('')
      onFechar()
    }
  }
  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) {
          setJustificativa('')
          onFechar()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{texto}</p>
          <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Justificativa (obrigatória)..." rows={4} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button variant={destrutivo ? 'destructive' : 'default'} onClick={confirmar} disabled={enviando || !justificativa.trim()}>
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SituacaoReinicio {
  modo: 'SIMPLES' | 'REFORCADO' | 'BLOQUEADO'
  motivo: string | null
  minimoJustificativa: number
}

/**
 * Reinício da etapa de lances. O sistema diz como o ato se apresenta agora:
 * simples (lances em curso), reforçado (lances encerrados: só como anulação por
 * vício, confirmada e descrita) ou bloqueado (fase recursal aberta, adjudicada
 * ou homologada).
 */
export function DialogoReiniciar(p: {
  aberto: boolean
  sessaoId: string | null | undefined
  onFechar: () => void
  onConfirmar: (justificativa: string, confirmaVicio: boolean) => void
}) {
  // Montado só enquanto aberto: cada abertura consulta a fase de novo e começa em branco
  return p.aberto ? <DialogoReiniciarAberto {...p} /> : null
}

function DialogoReiniciarAberto({
  aberto,
  sessaoId,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean
  sessaoId: string | null | undefined
  onFechar: () => void
  onConfirmar: (justificativa: string, confirmaVicio: boolean) => void
}) {
  const [situacao, setSituacao] = useState<SituacaoReinicio | null>(null)
  const [falha, setFalha] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [confirmaVicio, setConfirmaVicio] = useState(false)

  useEffect(() => {
    if (!aberto || !sessaoId) return
    let vivo = true
    authFetch(`${API_URL}/api/disputa/sessao/${sessaoId}/reinicio`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: SituacaoReinicio) => vivo && setSituacao(j))
      .catch(() => vivo && setFalha(true))
    return () => {
      vivo = false
    }
  }, [aberto, sessaoId])

  const reforcado = situacao?.modo === 'REFORCADO'
  const bloqueado = situacao?.modo === 'BLOQUEADO'
  const texto = justificativa.trim()
  const minimo = situacao?.minimoJustificativa ?? 1
  const pode = !!situacao && !bloqueado && texto.length >= minimo && (!reforcado || confirmaVicio)
  const confirmar = () => {
    if (!pode) return
    onConfirmar(texto, reforcado && confirmaVicio)
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reforcado ? 'Anular e reiniciar a etapa de lances' : 'Reiniciar a etapa de lances'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!situacao && !falha && <p className="text-sm text-slate-500">Verificando a fase da licitação...</p>}
          {falha && <p className="text-sm text-red-700">Não foi possível verificar a fase da licitação. Feche e tente de novo.</p>}
          {bloqueado && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {situacao?.motivo}
            </div>
          )}
          {situacao?.modo === 'SIMPLES' && (
            <p className="text-sm text-slate-600">
              Use este ato apenas quando for necessário recomeçar a etapa de lances. Os lances não são apagados: ficam no retrato congelado e
              cancelados logicamente.
            </p>
          )}
          {reforcado && (
            <>
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {situacao?.motivo}
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={confirmaVicio}
                  onChange={(e) => setConfirmaVicio(e.target.checked)}
                />
                <span>Declaro que há vício que compromete a disputa e que a etapa de lances precisa ser anulada e refeita.</span>
              </label>
            </>
          )}
          {situacao && !bloqueado && (
            <div>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder={reforcado ? 'Descreva o vício que compromete a disputa (vai para a ata)...' : 'Justificativa (obrigatória)...'}
                rows={4}
              />
              {reforcado && texto.length < minimo && (
                <p className="mt-1 text-xs text-slate-500">
                  Mínimo de {minimo} caracteres ({texto.length}/{minimo}).
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>{bloqueado ? 'Fechar' : 'Voltar'}</Button>
          {!bloqueado && (
            <Button variant="destructive" onClick={confirmar} disabled={!pode}>
              {reforcado ? 'Anular e reiniciar os lances' : 'Reiniciar os lances'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
