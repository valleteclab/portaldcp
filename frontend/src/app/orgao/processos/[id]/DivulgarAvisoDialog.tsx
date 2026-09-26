"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { PainelPrazos } from "./PublicacaoEdital"
import { useDivulgacaoAviso } from "./useDivulgacaoAviso"

/**
 * DIVULGAR O AVISO DA DISPENSA (art. 75, §3º; IN SEGES 67/2021): escolhe o fim
 * do recebimento (prazo mínimo contado pelo backend com o calendário do
 * órgão), gera e confere o aviso de contratação direta (é o PDF que vai ao
 * PNCP) e divulga. O prazo só começa quando o PNCP confirmar (arts. 54 e 55).
 */
export function DivulgarAvisoDialog({
  licitacaoId,
  fase,
  aberto,
  onFechar,
  onAtualizado,
}: {
  licitacaoId: string
  fase: string
  aberto: boolean
  onFechar: () => void
  onAtualizado: () => void
}) {
  const {
    fimPropostas, setFimPropostas, prazos, calculando, erro, aviso, gerando, divulgando, gerarAviso, abrirAviso, divulgar: publicar,
  } = useDivulgacaoAviso(licitacaoId, fase, aberto)

  const divulgar = async () => {
    if (await publicar()) {
      onFechar()
      onAtualizado()
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !divulgando && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Divulgar aviso da dispensa</DialogTitle>
          <DialogDescription>
            A divulgação conclui a instrução e envia o aviso de contratação direta ao PNCP. O prazo de propostas começa quando o
            PNCP confirmar a publicação (se a confirmação atrasar, as datas são estendidas até o mínimo legal).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="fim-propostas" className="text-sm font-medium">Receber propostas até</label>
            <Input id="fim-propostas" type="datetime-local" value={fimPropostas} onChange={(e) => setFimPropostas(e.target.value)} className="mt-1" />
            <p className="text-xs text-gray-600 mt-1">
              Mínimo de 3 dias úteis (art. 75, §3º), descontados os feriados do órgão — já sugerido no campo. Horário de Brasília.
            </p>
          </div>
          <PainelPrazos prazos={prazos} carregando={calculando} />
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" onClick={gerarAviso} disabled={gerando || !fimPropostas}>
              {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {aviso ? "Gerar de novo" : "Gerar aviso (PDF)"}
            </Button>
            {aviso ? (
              <button type="button" className="text-sm text-blue-700 hover:underline" onClick={abrirAviso}>
                Conferir aviso v{aviso.versao}
              </button>
            ) : (
              <span className="text-xs text-gray-600">Gere e confira o aviso antes de divulgar (é o documento publicado no PNCP).</span>
            )}
          </div>
          <ErroPendencias erro={erro} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={divulgando}>Cancelar</Button>
          <Button onClick={divulgar} disabled={divulgando || !fimPropostas || !aviso}>
            {divulgando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Divulgar agora
          </Button>
        </DialogFooter>
        {!aviso && <p className="text-xs text-gray-600 text-right">Divulgar agora: gere o aviso primeiro.</p>}
      </DialogContent>
    </Dialog>
  )
}
