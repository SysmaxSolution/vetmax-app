'use client'

import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

/**
 * Dispara router.refresh() periodicamente — re-executa os Server Components da
 * rota e atualiza a tela sem reload manual. Para telas server-rendered
 * (Internação, Centro Cirúrgico). Renderiza nada.
 */
export default function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter()
  useAutoRefresh(() => router.refresh(), intervalMs)
  return null
}
