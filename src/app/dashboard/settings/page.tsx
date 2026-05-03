import { redirect } from 'next/navigation'

// Módulo Configurações extinto — absorvido pelo Gestão (diretriz SisMax Solutions 2026-04-10)
export default function SettingsPage() {
  redirect('/dashboard/management')
}
