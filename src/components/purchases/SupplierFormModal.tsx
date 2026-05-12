'use client'

import { useState, useTransition } from 'react'
import { X, Building2, Loader2, AlertCircle } from 'lucide-react'
import type { Supplier, SupplierCategory } from '@/lib/actions/suppliers'
import { upsertSupplier } from '@/lib/actions/suppliers'

interface Props {
  supplier?: Supplier | null
  onClose:   () => void
  onSaved:   () => void
}

const CATEGORIES: { value: SupplierCategory; label: string }[] = [
  { value: 'medicamentos',  label: 'Medicamentos' },
  { value: 'alimentos',     label: 'Alimentos / Rações' },
  { value: 'equipamentos',  label: 'Equipamentos' },
  { value: 'limpeza',       label: 'Limpeza e Higiene' },
  { value: 'servicos',      label: 'Serviços' },
  { value: 'escritorio',    label: 'Escritório' },
  { value: 'outros',        label: 'Outros' },
]

function field(label: string, content: React.ReactNode) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {content}
    </div>
  )
}

const INPUT_CLS = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none'

export function SupplierFormModal({ supplier, onClose, onSaved }: Props) {
  const isEdit = !!supplier
  const [form, setForm] = useState({
    name:             supplier?.name ?? '',
    document:         supplier?.document ?? '',
    category:         supplier?.category ?? ('outros' as SupplierCategory),
    phone:            supplier?.phone ?? '',
    email:            supplier?.email ?? '',
    address:          supplier?.address ?? '',
    contact_person:   supplier?.contact_person ?? '',
    notes:            supplier?.notes ?? '',
    ie:               (supplier as any)?.ie ?? '',
    city:             (supplier as any)?.city ?? '',
    state:            (supplier as any)?.state ?? '',
    zip_code:         (supplier as any)?.zip_code ?? '',
    address_number:   (supplier as any)?.address_number ?? '',
    website:          (supplier as any)?.website ?? '',
  })
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg]      = useState<string | null>(null)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      setErrorMsg(null)
      const res = await upsertSupplier({
        id:             supplier?.id,
        name:           form.name,
        document:       form.document || undefined,
        category:       form.category,
        phone:          form.phone || undefined,
        email:          form.email || undefined,
        address:        form.address || undefined,
        contact_person: form.contact_person || undefined,
        notes:          form.notes || undefined,
      })
      if ('error' in res) { setErrorMsg(res.error); return }
      onSaved()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-600" />
            <h2 className="font-bold text-slate-800">{isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form id="supplier-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              {field('Razão Social *',
                <input required value={form.name} onChange={set('name')} className={INPUT_CLS} placeholder="Nome do fornecedor" />
              )}
            </div>
            {field('CNPJ / CPF', <input value={form.document} onChange={set('document')} className={INPUT_CLS} placeholder="00.000.000/0001-00" />)}
            {field('IE', <input value={form.ie} onChange={set('ie')} className={INPUT_CLS} placeholder="Inscrição Estadual" />)}
            <div className="col-span-2">
              {field('Categoria *',
                <select required value={form.category} onChange={set('category')} className={INPUT_CLS}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              )}
            </div>
            {field('Telefone', <input value={form.phone} onChange={set('phone')} className={INPUT_CLS} placeholder="(11) 9 0000-0000" />)}
            {field('E-mail', <input type="email" value={form.email} onChange={set('email')} className={INPUT_CLS} placeholder="contato@fornecedor.com.br" />)}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              {field('Endereço', <input value={form.address} onChange={set('address')} className={INPUT_CLS} placeholder="Rua, Logradouro" />)}
            </div>
            {field('Número', <input value={form.address_number} onChange={set('address_number')} className={INPUT_CLS} placeholder="123" />)}
            {field('Cidade', <input value={form.city} onChange={set('city')} className={INPUT_CLS} placeholder="São Paulo" />)}
            {field('UF', <input value={form.state} onChange={set('state')} className={INPUT_CLS} maxLength={2} placeholder="SP" />)}
            {field('CEP', <input value={form.zip_code} onChange={set('zip_code')} className={INPUT_CLS} placeholder="01310-100" />)}
          </div>

          {field('Contato / Representante',
            <input value={form.contact_person} onChange={set('contact_person')} className={INPUT_CLS} placeholder="Nome do responsável" />
          )}
          {field('Site',
            <input value={form.website} onChange={set('website')} className={INPUT_CLS} placeholder="https://fornecedor.com.br" />
          )}
          {field('Observações',
            <textarea value={form.notes} onChange={set('notes')} className={`${INPUT_CLS} resize-none`} rows={2} placeholder="Notas internas..." />
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 shrink-0">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="submit"
            form="supplier-form"
            disabled={isPending || form.name.length < 2}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
