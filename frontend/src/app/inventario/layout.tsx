import type { Metadata, Viewport } from 'next'
import { InventarioPwa } from './InventarioPwa'

// Conferência de patrimônio no celular: app instalável (PWA) como o DCP Frota.
export const metadata: Metadata = {
  title: 'DCP Inventário',
  manifest: '/inventario/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'DCP Inventário' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#1f3a5f',
}

export default function InventarioStandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InventarioPwa />
      {children}
    </>
  )
}
