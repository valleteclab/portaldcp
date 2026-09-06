import type { Metadata, Viewport } from 'next'
import { FrotaPwa } from './FrotaPwa'

// Telas do posto e do vereador são "app" (PWA): manifest próprio, tela cheia,
// cor de status escura. O FrotaPwa aponta o manifest para a rota aberta.
export const metadata: Metadata = {
  title: 'DCP Frota',
  manifest: '/frota/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'DCP Frota' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#1e293b',
}

export default function FrotaStandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FrotaPwa />
      {children}
    </>
  )
}
