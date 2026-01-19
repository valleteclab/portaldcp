'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useModulosOrgao, ModuloSistema } from '@/hooks/useModulosOrgao'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ModuleGuardProps {
  modulo: ModuloSistema
  children: React.ReactNode
  fallbackUrl?: string
}

/**
 * Componente que protege páginas baseado nos módulos habilitados do órgão.
 * Se o módulo não estiver habilitado, redireciona para o Dashboard ou mostra erro.
 */
export function ModuleGuard({ modulo, children, fallbackUrl = '/orgao' }: ModuleGuardProps) {
  const router = useRouter()
  const { modulos, loading, temAcesso } = useModulosOrgao()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // Só verifica após carregar os módulos
    if (loading) return

    console.log(`[ModuleGuard] Verificando acesso ao módulo ${modulo}:`, { modulos, temAcesso: temAcesso(modulo) })

    // Se o módulo não está habilitado, redireciona
    if (!temAcesso(modulo)) {
      console.log(`[ModuleGuard] Acesso negado ao módulo ${modulo}, redirecionando para ${fallbackUrl}`)
      router.replace(fallbackUrl)
      return
    }

    setChecked(true)
  }, [modulo, modulos, loading, temAcesso, router, fallbackUrl])

  // Enquanto carrega ou verifica, mostra loading
  if (loading || !checked) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    )
  }

  // Módulo habilitado, renderiza conteúdo
  return <>{children}</>
}

/**
 * Componente alternativo que mostra uma mensagem de erro ao invés de redirecionar
 */
export function ModuleGuardWithMessage({ modulo, children }: Omit<ModuleGuardProps, 'fallbackUrl'>) {
  const { modulos, loading, temAcesso } = useModulosOrgao()
  const router = useRouter()

  // Enquanto carrega, mostra loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    )
  }

  // Se o módulo não está habilitado, mostra mensagem de erro
  if (!temAcesso(modulo)) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Seu órgão não tem acesso ao módulo <strong>{modulo}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Entre em contato com o administrador do sistema para habilitar este módulo.
            </p>
            <Button onClick={() => router.push('/orgao')}>
              Voltar ao Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Módulo habilitado, renderiza conteúdo
  return <>{children}</>
}
