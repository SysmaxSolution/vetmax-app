import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk, Spline_Sans_Mono } from 'next/font/google'
import './globals.css'

// Design System 2026 — tipografia oficial (self-hosted via next/font).
// Hanken Grotesk: UI e display. Spline Sans Mono: dinheiro, IDs e horários
// (usar com `font-mono tabular-nums` em células de valores).
const fontSans = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-hanken',
  display: 'swap',
})

const fontMono = Spline_Sans_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-spline-mono',
  display: 'swap',
})
import { Analytics } from '@vercel/analytics/next'
import { SplashOverlay } from '@/components/ui/SplashOverlay'

export const metadata: Metadata = {
  title: 'SysVetMax — HIS Veterinário',
  description: 'Sistema de Informação Hospitalar Veterinário com IA e transcrição por voz',
  openGraph: {
    title: 'SysVetMax — HIS Veterinário',
    description: 'Sistema de Informação Hospitalar Veterinário com IA e transcrição por voz',
    type: 'website',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SysVetMax',
  },
  formatDetection: { telephone: false },
}

// viewport-fit=cover é o que habilita os env(safe-area-inset-*) no iOS;
// sem ele, o Dynamic Island e a home indicator cobrem o conteúdo.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="font-sans antialiased">
        <SplashOverlay />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
