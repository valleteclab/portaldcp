import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portal DCP - Diário de Compras Públicas",
  description: "Sistema completo de gestão de licitações públicas conforme Lei 14.133/2021. Participe de licitações de forma simples, segura e transparente.",
  keywords: ["licitações", "compras públicas", "pregão", "Lei 14.133", "PNCP", "fornecedores"],
  authors: [{ name: "ValletecLab" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
