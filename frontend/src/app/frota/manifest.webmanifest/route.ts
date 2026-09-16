import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Manifest do PWA "DCP Frota", montado por rota: o posto instala com
 * start_url no painel dele, o vereador no link dele — cada um vira um
 * ícone próprio (id distinto), dentro do mesmo escopo /frota/.
 */
export function GET(req: NextRequest) {
  const pedido = req.nextUrl.searchParams.get('start') || '/frota'
  const startUrl = /^\/frota(\/[a-zA-Z0-9\-_/]*)?$/.test(pedido) ? pedido : '/frota'
  const perfil = startUrl.includes('/posto/') ? 'Posto' : startUrl.includes('/vereador/') ? 'Vereador' : ''

  const manifest = {
    id: startUrl,
    name: perfil ? `DCP Frota — ${perfil}` : 'DCP Frota',
    short_name: 'DCP Frota',
    description: 'Requisições e abastecimentos de combustível da Câmara',
    lang: 'pt-BR',
    start_url: startUrl,
    scope: '/frota/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#1e293b',
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
