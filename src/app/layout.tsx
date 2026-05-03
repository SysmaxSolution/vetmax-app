import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VetMax — HIS Veterinário',
  description: 'Sistema de Informação Hospitalar Veterinário com IA e transcrição por voz',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
