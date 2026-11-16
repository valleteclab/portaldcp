'use client'

import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { AreaDeTrabalho } from '@/components/area-trabalho/AreaDeTrabalho'

export default function AreaDeTrabalhoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.LICITACOES}>
      <AreaDeTrabalho />
    </ModuleGuard>
  )
}
