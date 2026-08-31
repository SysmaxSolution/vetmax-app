'use client'

import { useState } from 'react'
import { Truck, BedDouble, DoorOpen, Package, Receipt, Building2, Tags } from 'lucide-react'
import type { Supplier } from '@/lib/actions/suppliers'
import SuppliersTab from './suppliers/SuppliersTab'
import RoomsTab from './RoomsTab'
import KitsTab from './KitsTab'
import RatesTab from './RatesTab'
import PartnerClinicsTab from './partner-clinics/PartnerClinicsTab'
import PricingTab from './pricing/PricingTab'
import { useCentroCirurgico, useInternacaoCompleta, useAnimaisFoundation } from '@/components/providers/ClinicConfigProvider'

type Tab = 'suppliers' | 'partners' | 'pricing' | 'boxes' | 'salas' | 'kits' | 'rates'

interface Props {
  initialSuppliers: Supplier[]
  userRole:         string
}

export default function RegistryWorkspace({ initialSuppliers, userRole }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('suppliers')
  const centroCirurgico   = useCentroCirurgico()
  const internacaoCompleta = useInternacaoCompleta()
  const animaisFoundation = useAnimaisFoundation()

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'suppliers', label: 'Fornecedores', icon: Truck },
    ...(animaisFoundation  ? [{ key: 'partners' as Tab, label: 'Clínicas Parceiras', icon: Building2 }] : []),
    ...(animaisFoundation  ? [{ key: 'pricing'  as Tab, label: 'Precificação',       icon: Tags }] : []),
    { key: 'boxes',     label: 'Boxes',        icon: BedDouble },
    { key: 'salas',     label: 'Salas',        icon: DoorOpen },
    ...(centroCirurgico    ? [{ key: 'kits'  as Tab, label: 'Kits Cirúrgicos',   icon: Package }] : []),
    ...(internacaoCompleta ? [{ key: 'rates' as Tab, label: 'Tarifas de Diária', icon: Receipt }] : []),
  ]

  return (
    <>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Cadastros Gerais</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          Gestão centralizada dos cadastros operacionais da clínica
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'suppliers' && (
        <SuppliersTab initialSuppliers={initialSuppliers} userRole={userRole} />
      )}
      {activeTab === 'partners' && <PartnerClinicsTab userRole={userRole} />}
      {activeTab === 'pricing' && <PricingTab userRole={userRole} />}
      {activeTab === 'boxes' && <RoomsTab kind="box" />}
      {activeTab === 'salas' && <RoomsTab kind="sala" />}
      {activeTab === 'kits' && <KitsTab />}
      {activeTab === 'rates' && <RatesTab />}
    </>
  )
}
