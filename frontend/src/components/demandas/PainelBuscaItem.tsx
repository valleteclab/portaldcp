'use client'

/**
 * Painel de busca do item da demanda com as duas fontes: catálogo federal
 * (CATMAT/CATSER) e catálogo próprio do órgão (com "Cadastrar novo item").
 */
import { useState } from 'react'
import { Database, Globe, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BuscaItemCatalogoProprio } from '@/components/catalogo'
import { BuscaCatalogoFederal } from './BuscaCatalogoFederal'
import type { ItemSelecionado } from './tipos'

type FonteBusca = 'federal' | 'proprio'

export function PainelBuscaItem({
  orgaoId,
  onSelect,
}: {
  orgaoId: string
  onSelect: (item: ItemSelecionado) => void
}) {
  const [fonte, setFonte] = useState<FonteBusca>('federal')

  return (
    <div className="space-y-4">
      {/* Onde procurar: catálogo federal ou o do órgão */}
      <div role="tablist" aria-label="Onde procurar o item" className="flex gap-2 flex-wrap">
        <Button type="button" role="tab" aria-selected={fonte === 'federal'} size="sm"
          variant={fonte === 'federal' ? 'default' : 'outline'} onClick={() => setFonte('federal')}>
          <Globe className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Catálogo federal (CATMAT/CATSER)
        </Button>
        <Button type="button" role="tab" aria-selected={fonte === 'proprio'} size="sm"
          variant={fonte === 'proprio' ? 'default' : 'outline'} onClick={() => setFonte('proprio')}>
          <Database className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Catálogo do órgão / novo item
        </Button>
      </div>

      {/* Conteúdo da busca */}
      {fonte === 'federal' ? (
        <div className="space-y-3">
          <BuscaCatalogoFederal onSelect={onSelect} />
          <BuscaItemCatalogoProprio
            orgaoId={orgaoId}
            manualOnly
            onChange={(item) => {
              if (item) {
                onSelect({
                  codigo: item.codigo,
                  descricao: item.descricao,
                  tipo: item.tipo,
                  unidade_padrao: item.unidade_padrao,
                  codigo_classe: item.classificacao?.codigo,
                  nome_classe: item.classificacao?.nome,
                  fonte: 'PROPRIO',
                })
              }
            }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">
            Busque no catálogo do órgão ou clique em <strong>&quot;Cadastrar novo item&quot;</strong> para criar um novo.
          </p>
          <BuscaItemCatalogoProprio
            orgaoId={orgaoId}
            placeholder="Buscar no catálogo próprio ou criar novo..."
            onChange={(item) => {
              if (item) {
                onSelect({
                  codigo: item.codigo,
                  descricao: item.descricao,
                  tipo: item.tipo,
                  unidade_padrao: item.unidade_padrao,
                  codigo_classe: item.classificacao?.codigo,
                  nome_classe: item.classificacao?.nome,
                  fonte: 'PROPRIO',
                })
              }
            }}
          />
          <p className="text-xs text-blue-800 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
            O botão &quot;Cadastrar novo item&quot; no campo acima abre um formulário completo de criação.
          </p>
        </div>
      )}
    </div>
  )
}
