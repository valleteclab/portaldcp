import type { Metadata, Viewport } from "next"

// Painel para TV do setor de licitação: fora do layout do órgão (sem menu),
// tela cheia e escura. Não indexar (a URL leva o token de acesso).
export const metadata: Metadata = {
  title: "Painel de licitações — TV",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b14",
}

export default function PainelTvLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#070b14", minHeight: "100vh" }}>{children}</div>
}
