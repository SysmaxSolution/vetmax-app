'use client'

import { useState, useTransition } from 'react'
import {
  listEmployees, createEmployee, updateEmployee, deleteEmployee,
  importEmployeesFromProfiles,
  type Employee, type CreateEmployeeData,
} from '@/lib/actions/financial'
import {
  Plus, Pencil, Trash2, X, Loader2, AlertCircle, Users,
  Download, ChevronDown, ChevronUp, Eye, EyeOff,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'admin',       label: 'Administrador' },
  { value: 'vet',         label: 'Médico Veterinário' },
  { value: 'aux_vet',     label: 'Auxiliar Veterinário' },
  { value: 'groomer',     label: 'Tosador / Banhista' },
  { value: 'receptionist',label: 'Recepcionista' },
  { value: 'financial',   label: 'Financeiro' },
  { value: 'other',       label: 'Outro' },
]

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase mb-1.5'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  initialEmployees: Employee[]
  isAdmin: boolean
}

type FormTab = 'pessoal' | 'endereco' | 'contrato' | 'banco'

// ─── Modal ────────────────────────────────────────────────────────────────────

function EmployeeModal({
  mode,
  employee,
  isAdmin,
  onClose,
  onSuccess,
}: {
  mode: 'create' | 'edit'
  employee?: Employee
  isAdmin: boolean
  onClose: () => void
  onSuccess: (employees: Employee[]) => void
}) {
  const [tab, setTab] = useState<FormTab>('pessoal')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)
  const [showSalary, setShowSalary] = useState(false)

  const [form, setForm] = useState<CreateEmployeeData & { address: Record<string, string> }>({
    name:          employee?.name          ?? '',
    role:          employee?.role          ?? 'other',
    email:         employee?.email         ?? '',
    phone:         employee?.phone         ?? '',
    cpf:           employee?.cpf           ?? '',
    hire_date:     employee?.hire_date     ?? '',
    salary:        employee?.salary        ?? undefined,
    pix_key:       employee?.pix_key       ?? '',
    vacation_days: employee?.vacation_days ?? 30,
    user_id:       employee?.user_id       ?? '',
    address: {
      street:       (employee?.address as Record<string, string>)?.street      ?? '',
      number:       (employee?.address as Record<string, string>)?.number      ?? '',
      complement:   (employee?.address as Record<string, string>)?.complement  ?? '',
      neighborhood: (employee?.address as Record<string, string>)?.neighborhood ?? '',
      city:         (employee?.address as Record<string, string>)?.city        ?? '',
      state:        (employee?.address as Record<string, string>)?.state       ?? '',
      zip:          (employee?.address as Record<string, string>)?.zip         ?? '',
    },
  })

  function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Nome obrigatório.'); setTab('pessoal'); return }

    startTransition(async () => {
      const data: CreateEmployeeData = {
        name:          form.name.trim(),
        role:          form.role,
        email:         form.email   || undefined,
        phone:         form.phone   || undefined,
        cpf:           form.cpf     || undefined,
        hire_date:     form.hire_date || undefined,
        salary:        isAdmin ? form.salary : undefined,
        pix_key:       form.pix_key || undefined,
        vacation_days: form.vacation_days,
        user_id:       form.user_id || undefined,
        address:       Object.values(form.address).some(v => v)
          ? form.address
          : undefined,
      }

      const res = mode === 'create'
        ? await createEmployee(data)
        : await updateEmployee(employee!.id, data)

      if ('error' in res) { setError((res as { error: string }).error); return }
      const listRes = await listEmployees(isAdmin)
      onSuccess(Array.isArray(listRes) ? listRes : [])
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteEmployee(employee!.id)
      if (res?.error) { setError(res.error); return }
      const listRes = await listEmployees(isAdmin)
      onSuccess(Array.isArray(listRes) ? listRes : [])
    })
  }

  const tabs: { id: FormTab; label: string }[] = [
    { id: 'pessoal',  label: 'Dados Pessoais' },
    { id: 'endereco', label: 'Endereço' },
    { id: 'contrato', label: 'Contrato' },
    { id: 'banco',    label: 'Banco' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">
            {mode === 'create' ? 'Novo Funcionário' : 'Editar Funcionário'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-slate-100 px-5 gap-1 bg-slate-50">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                tab === t.id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">

          {/* Tab: Dados Pessoais */}
          {tab === 'pessoal' && (
            <>
              <div>
                <label className={labelClass}>Nome Completo *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={fieldClass} placeholder="Nome do funcionário" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Cargo / Função</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={fieldClass}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>CPF</label>
                  <input value={form.cpf ?? ''} onChange={e => setForm(f => ({ ...f, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                    className={fieldClass} placeholder="00000000000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>E-mail</label>
                  <input type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className={fieldClass} placeholder="email@clinica.com" />
                </div>
                <div>
                  <label className={labelClass}>Telefone</label>
                  <input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={fieldClass} placeholder="(11) 99999-9999" />
                </div>
              </div>
            </>
          )}

          {/* Tab: Endereço */}
          {tab === 'endereco' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Logradouro</label>
                  <input value={form.address.street} onChange={e => setForm(f => ({ ...f, address: { ...f.address, street: e.target.value } }))}
                    className={fieldClass} placeholder="Rua, Av., etc." />
                </div>
                <div>
                  <label className={labelClass}>Número</label>
                  <input value={form.address.number} onChange={e => setForm(f => ({ ...f, address: { ...f.address, number: e.target.value } }))}
                    className={fieldClass} placeholder="123" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Complemento</label>
                  <input value={form.address.complement} onChange={e => setForm(f => ({ ...f, address: { ...f.address, complement: e.target.value } }))}
                    className={fieldClass} placeholder="Apto, Sala..." />
                </div>
                <div>
                  <label className={labelClass}>Bairro</label>
                  <input value={form.address.neighborhood} onChange={e => setForm(f => ({ ...f, address: { ...f.address, neighborhood: e.target.value } }))}
                    className={fieldClass} placeholder="Bairro" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Cidade</label>
                  <input value={form.address.city} onChange={e => setForm(f => ({ ...f, address: { ...f.address, city: e.target.value } }))}
                    className={fieldClass} placeholder="Cidade" />
                </div>
                <div>
                  <label className={labelClass}>UF</label>
                  <input value={form.address.state} onChange={e => setForm(f => ({ ...f, address: { ...f.address, state: e.target.value.toUpperCase().slice(0, 2) } }))}
                    className={fieldClass} placeholder="SP" />
                </div>
              </div>
              <div>
                <label className={labelClass}>CEP</label>
                <input value={form.address.zip} onChange={e => setForm(f => ({ ...f, address: { ...f.address, zip: e.target.value } }))}
                  className={fieldClass} placeholder="00000-000" />
              </div>
            </>
          )}

          {/* Tab: Contrato */}
          {tab === 'contrato' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Data de Admissão</label>
                  <input type="date" value={form.hire_date ?? ''} onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))}
                    className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Dias de Férias</label>
                  <input type="number" min={0} value={form.vacation_days} onChange={e => setForm(f => ({ ...f, vacation_days: Number(e.target.value) }))}
                    className={fieldClass} />
                </div>
              </div>

              {isAdmin && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={labelClass + ' mb-0'}>Salário (R$)</label>
                    <button onClick={() => setShowSalary(v => !v)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                      {showSalary ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {showSalary ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
                    <input
                      type={showSalary ? 'number' : 'password'}
                      min={0} step={0.01}
                      value={form.salary ?? ''}
                      onChange={e => setForm(f => ({ ...f, salary: e.target.value ? Number(e.target.value) : undefined }))}
                      className={`${fieldClass} pl-9`}
                      placeholder="0,00"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Informação sensível — visível apenas para administradores.</p>
                </div>
              )}
            </>
          )}

          {/* Tab: Banco */}
          {tab === 'banco' && (
            <div>
              <label className={labelClass}>Chave PIX para Pagamento</label>
              <input value={form.pix_key ?? ''} onChange={e => setForm(f => ({ ...f, pix_key: e.target.value }))}
                className={fieldClass} placeholder="CPF, e-mail, telefone ou chave aleatória" />
              <p className="mt-1.5 text-xs text-slate-400">Usada para transferência de salário via PIX.</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {confirmDel && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-700">Desativar este funcionário?</p>
              <p className="text-xs text-red-500">O registro será mantido mas marcado como inativo.</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={isPending}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirmar'}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4">
          {mode === 'edit' && !confirmDel && isAdmin && (
            <button onClick={() => setConfirmDel(true)}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
              <Trash2 className="h-3.5 w-3.5" /> Desativar
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? 'Criar Funcionário' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeesTab({ initialEmployees, isAdmin }: Props) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees)
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; employee?: Employee } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [importResult, setImportResult] = useState<string | null>(null)

  function handleImport() {
    startTransition(async () => {
      const res = await importEmployeesFromProfiles()
      if (res.error) { setImportResult(`Erro: ${res.error}`); return }
      setImportResult(`${res.imported} funcionário(s) importado(s) com sucesso.`)
      const listRes = await listEmployees(isAdmin)
      if (Array.isArray(listRes)) setEmployees(listRes)
    })
  }

  function handleModalSuccess(updated: Employee[]) {
    setEmployees(updated)
    setModal(null)
  }

  const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label ?? role

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-sm text-slate-500 flex-1">
          {employees.filter(e => e.is_active).length} funcionário(s) ativo(s)
        </p>
        {isAdmin && (
          <button onClick={handleImport} disabled={isPending}
            className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-60">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Importar do Sistema
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" /> Novo Funcionário
          </button>
        )}
      </div>

      {importResult && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-2 text-sm text-teal-700 flex items-center justify-between">
          {importResult}
          <button onClick={() => setImportResult(null)} className="text-teal-500 hover:text-teal-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List */}
      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white">
          <Users className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-sm text-slate-400 font-medium">Nenhum funcionário cadastrado.</p>
          {isAdmin && (
            <div className="flex gap-3 mt-3">
              <button onClick={handleImport} disabled={isPending}
                className="text-sm text-teal-600 font-semibold hover:text-teal-700">
                Importar do sistema
              </button>
              <span className="text-slate-300">|</span>
              <button onClick={() => setModal({ mode: 'create' })}
                className="text-sm text-teal-600 font-semibold hover:text-teal-700">
                + Adicionar manualmente
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Nome</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Cargo</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Contato</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Admissão</th>
                <th className="py-3 px-4 text-center text-xs font-bold text-slate-500 uppercase">Status</th>
                {isAdmin && <th className="py-3 px-4" />}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className={`border-b border-slate-100 hover:bg-teal-50/40 transition-colors ${!emp.is_active ? 'opacity-50' : ''}`}>
                  <td className="py-3 px-4">
                    <p className="text-sm font-semibold text-slate-800">{emp.name}</p>
                    {emp.cpf && <p className="text-xs text-slate-400">CPF: {emp.cpf}</p>}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">{roleLabel(emp.role)}</td>
                  <td className="py-3 px-4">
                    {emp.email && <p className="text-xs text-slate-600">{emp.email}</p>}
                    {emp.phone && <p className="text-xs text-slate-400">{emp.phone}</p>}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${emp.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {emp.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="py-3 px-4">
                      <button onClick={() => setModal({ mode: 'edit', employee: emp })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <EmployeeModal
          mode={modal.mode}
          employee={modal.employee}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}
