'use client'

import { useState } from 'react'
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
