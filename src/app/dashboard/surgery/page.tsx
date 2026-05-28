import { redirect } from 'next/navigation'
import { Syringe } from 'lucide-react'
import { isCentroCirurgico } from '@/lib/actions/clinic-settings'

export const metadata = { title: 'Centro Cirúrgico | SysVetMax' }

// Módulo isolado, gated pela feature flag flow_config.centro_cirurgico.
// Scaffold da Fase 0 — o Kanban Cirúrgico (Preparo → Sala → RPA) e a
// SurgeryFichaModal (acordeão) chegam na Fase 3.
export default async function SurgeryPage() {
  const enabled = await isCentroCirurgico()
  if (!enabled) redirect('/dashboard')

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-200">
          <Syringe className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Centro Cirúrgico</h1>
          <p className="text-sm text-slate-500">Fluxo do bloco cirúrgico: Preparo → Sala Cirúrgica → RPA.</p>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50/40 p-10 text-center">
        <Syringe className="h-10 w-10 text-red-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-700">Módulo em construção</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          O Kanban Cirúrgico e a Ficha Cirúrgica (Checklist Pré-Op, Ficha Anestésica e Relatório por
          voz) serão entregues na Fase 3 desta sprint. A rota e o item de menu já estão isolados e
          ativos via a configuração <span className="font-mono">Centro Cirúrgico</span>.
        </p>
      </div>
    </main>
  )
}
