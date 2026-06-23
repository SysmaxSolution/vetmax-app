import type { Metadata, Viewport } from 'next'
import './globals.css'
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
    <html lang="pt-BR">
      <body>
        <SplashOverlay />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
