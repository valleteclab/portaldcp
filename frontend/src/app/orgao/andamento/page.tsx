'use client'

import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { PainelGestorAndamento } from '@/components/processo/painel-gestor'

export default function AndamentoDosProcessosPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.LICITACOES}>
      <PainelGestorAndamento />
    </ModuleGuard>
  )
}
