"use client"

/**
 * ITENS E QUANTIDADES da demanda — reaproveita o editor de itens (ItensTab:
 * catálogo CATMAT/CATSER, planilha, digitação) de "Editar processo". Grava
 * pelo mesmo PUT /api/licitacoes/:id { itens } (só na fase interna).
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ItensTab } from "@/components/cadastro-licitacao/ItensTab"
import type { ItemLicitacao } from "@/components/cadastro-licitacao/types"
import { erroDaApi } from "@/lib/fase-interna/telas"

export function EditorItensDialog({ licitacaoId, aberto, onFechar, onSalvo }: { licitacaoId: string; aberto: boolean; onFechar: () => void; onSalvo: () => void }) {
  const [itens, setItens] = useState<ItemLicitacao[]>([])
  const [dados, setDados] = useState<any>(null)
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setCarregando(true)
    authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await erroDaApi(r))
        const d = await r.json()
        setDados(d)
        setItens(
          (d.itens || []).map((item: any) => ({
            id: item.id,
            numero: item.numero_item || item.numero,
            descricao: item.descricao_resumida || item.descricao || "",
            descricao_detalhada: item.descricao_detalhada,
            quantidade: parseFloat(item.quantidade) || 1,
            unidade: item.unidade_medida || item.unidade || "UNIDADE",
            valor_unitario: parseFloat(item.valor_unitario_estimado || item.valor_unitario) || 0,
            codigo_catalogo: item.codigo_catalogo,
            codigo_catmat: item.codigo_catmat,
            codigo_catser: item.codigo_catser,
            classe_catalogo: item.classe_catalogo,
            lote_id: item.lote_id,
            lote_numero: item.numero_lote || item.lote_numero,
            item_pca_id: item.item_pca_id,
            item_pca_descricao: item.item_pca?.descricao_objeto || item.item_pca_descricao,
            item_pca_ano: item.item_pca?.pca?.ano_exercicio || item.item_pca_ano,
            sem_pca: item.sem_pca || false,
            justificativa_sem_pca: item.justificativa_sem_pca,
            tipo_participacao: item.tipo_participacao || "AMPLA",
            tipo_item: item.tipo_item || undefined,
          })),
        )
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false))
  }, [aberto, licitacaoId])

  const salvar = async () => {
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens, valor_total_estimado: itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0) }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success("Itens salvos")
      onSalvo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Itens e quantidades</DialogTitle>
          <DialogDescription>
            Escolha cada item no catálogo — CATMAT (bens) ou CATSER (serviços). O código é necessário para somar o limite da dispensa no ramo
            (art. 75, §1º) e para o PNCP.
          </DialogDescription>
        </DialogHeader>
        {carregando || !dados ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando os itens" />
          </div>
        ) : (
          <ItensTab
            itens={itens}
            onChange={setItens}
            orgaoId={dados.orgao_id}
            modoVinculacaoPca={dados.modo_vinculacao_pca || "POR_LICITACAO"}
            itemPcaSelecionado={dados.item_pca ?? null}
            usaLotes={!!dados.usa_lotes}
            lotes={dados.lotes || []}
            modoBeneficioMpe={dados.modo_beneficio_mpe}
            enviadoPncp={!!dados.numero_controle_pncp}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar itens
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
