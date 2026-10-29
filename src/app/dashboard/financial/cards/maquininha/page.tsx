import { requireModuleAccess } from '@/lib/server/require-module'
import { listActiveCompanies } from '@/lib/actions/companies'
import ExtratoMaquininha from '@/components/financial/ExtratoMaquininha'

export const metadata = { title: 'Maquininha FinPet — Financeiro | SysVetMax' }

export default async function MaquininhaFinPetPage() {
  const profile = await requireModuleAccess('financial')
  const empresas = await listActiveCompanies()
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-4">
        <a href="/dashboard/financial/cards" className="text-xs text-slate-500 hover:text-slate-700">← Recebíveis de Cartão</a>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1">Maquininha FinPet</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Cobranças feitas pela maquininha integrada: situação na operadora, título baixado ou em aberto, repasse do profissional e estorno.
        </p>
      </div>
      <ExtratoMaquininha empresas={empresas} userRole={profile.role} />
    </div>
  )
}
