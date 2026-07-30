import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1d4ed8",
}

export const metadata: Metadata = {
  title: "PortalDCP — Diário de Compras Públicas",
  description:
    "Plataforma privada de tecnologia para gestão de licitações, contratos e publicações de órgãos e entidades públicas.",
  keywords: [
    "plataforma de contratações públicas",
    "licitações",
    "compras públicas",
    "Lei 14.133",
    "PNCP",
    "contratos administrativos",
  ],
  authors: [{ name: "PortalDCP" }],
  manifest: "/site.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
