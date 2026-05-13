'use client'

/**
 * G-10 / G-14: Aba de Funcionários — Cadastros Financeiros
 *
 * G-14 Guard de Salário:
 *  - Usuários sem permissão `edit` no módulo `financial` veem o salário como ****
 *  - Admin sempre vê o valor real
 */

import { useState } from 'react'
import { Lock, Eye, EyeOff, Loader2, Save, Trash2, Plus, User2 } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Employee {
  id:         string
  name:       string
  role:       string
  department: string | null
  salary:     number | null
  phone:      string | null
  email:      string | null
  is_active:  boolean
}

interface Props {
  employees:          Employee[]
  canEditFinancial:   boolean   // G-14: true se user tem `edit` em financial OU role=admin
  onToast:            (type: 'success' | 'error', message: string) => void
}

// ─── Salary Cell ──────────────────────────────────────────────────────────────

function SalaryCell({ salary, canEdit }: { salary: number | null; canEdit: boolean }) {
  const [revealed, setRevealed] = useState(false)

  if (!canEdit) {
    return (
      <span className="flex items-center gap-1 text-slate-400 font-mono text-sm">
        <Lock className="h-3 w-3" />
        ****
      </span>
    )
  }

  const formatted = salary != null
    ? salary.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'

  return (
    <span className="flex items-center gap-1 font-mono text-sm text-slate-800">
      {formatted}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmployeesTab({ employees, canEditFinancial, onToast }: Props) {
  const [list, setList] = useState<Employee[]>(employees)
  const [showForm, setShowForm] = useState(false)

  // form state
  const [name,       setName]       = useState('')
  const [role,       setRole]       = useState('')
  const [department, setDepartment] = useState('')
  const [salary,     setSalary]     = useState('')
  const [phone,      setPhone]      = useState('')
  const [email,      setEmail]      = useState('')
  const [saving,     setSaving]     = useState(false)

  function resetForm() {
    setName(''); setRole(''); setDepartment(''); setSalary(''); setPhone(''); setEmail('')
    setShowForm(false)
  }

  async function handleSave() {
    if (!name.trim()) { onToast('error', 'Nome é obrigatório.'); return }
    setSaving(true)
    // Placeholder: será conectado ao server action quando G-10 for finalizado
    setSaving(false)
    onToast('success', 'Funcionalidade em implementação — aguarde G-10 completo.')
    resetForm()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Funcionários</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastro de equipe para folha de pagamento e DRE
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={showForm}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Novo Funcionário
        </button>
      </div>

      {/* Guard info para usuários sem edit */}
      {!canEditFinancial && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            Você não tem permissão para visualizar salários. Contate o administrador.
          </p>
        </div>
      )}

      {/* Formulário inline */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700 mb-2">Novo Funcionário</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nome *</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Nome completo"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cargo</label>
              <input
                value={role} onChange={e => setRole(e.target.value)}
                placeholder="Ex: Atendente"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Departamento</label>
              <input
                value={department} onChange={e => setDepartment(e.target.value)}
                placeholder="Ex: Recepção"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Salário (R$)
                {!canEditFinancial && <Lock className="inline h-3 w-3 ml-1 text-amber-500" />}
              </label>
              {canEditFinancial ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salary}
                  onChange={e => setSalary(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              ) : (
                <div className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-400 font-mono text-sm">
                  <Lock className="h-3 w-3" />
                  ****
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefone</label>
              <input
                value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">E-mail</label>
              <input
                type="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <User2 className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-sm font-medium text-slate-500">Nenhum funcionário cadastrado</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "Novo Funcionário" para começar</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Cargo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Departamento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                  Salário
                  {!canEditFinancial && <Lock className="inline h-3 w-3 ml-1 text-amber-500" />}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Contato</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{emp.name}</td>
                  <td className="px-4 py-3 text-slate-600">{emp.role || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{emp.department || '—'}</td>
                  <td className="px-4 py-3">
                    <SalaryCell salary={emp.salary} canEdit={canEditFinancial} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {emp.phone || emp.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      emp.is_active
                        ? 'bg-teal-50 text-teal-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {emp.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
