import { Suspense } from 'react'
import ManagementNav from '@/components/management/ManagementNav'

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Gestão da Clínica</h1>
        <p className="mt-0.5 text-sm text-slate-500">Templates, configurações e usuários</p>
      </div>
      <Suspense>
        <ManagementNav />
      </Suspense>
      {children}
    </div>
  )
}
