'use client'

import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'

/**
 * Layout que protege TODAS as rotas de licitações (/orgao/licitacoes/*).
 * Sem isso, /orgao/licitacoes/nova e outras sub-rotas poderiam ser acessadas
 * diretamente por URL mesmo sem permissão ao módulo LICITACOES.
 */
export default function LicitacoesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ModuleGuard modulo={ModuloSistema.LICITACOES} fallbackUrl="/orgao">
      {children}
    </ModuleGuard>
  )
}
