import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Manifest do PWA "DCP Inventário": cada responsável de setor instala com
 * start_url no link do seu setor (id distinto), no escopo /inventario/.
 */
export function GET(req: NextRequest) {
  const pedido = req.nextUrl.searchParams.get('start') || '/inventario'
  const startUrl = /^\/inventario(\/[a-zA-Z0-9\-_/]*)?$/.test(pedido) ? pedido : '/inventario'

  const manifest = {
    id: startUrl,
    name: 'DCP Inventário — Conferência de patrimônio',
    short_name: 'Inventário',
    description: 'Conferência de bens patrimoniais pelo celular (QR code e RFID)',
    lang: 'pt-BR',
    start_url: startUrl,
    scope: '/inventario/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#1f3a5f',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
