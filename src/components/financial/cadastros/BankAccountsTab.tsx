'use client'

import { useState, useTransition } from 'react'
import {
  listBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount,
  type BankAccount, type CreateBankAccountData,
} from '@/lib/actions/financial'
import { Plus, Search, Pencil, Trash2, Star, X, Loader2, AlertCircle, Building2 } from 'lucide-react'

// ─── BCB Top-20 banks ─────────────────────────────────────────────────────────

const BCB_BANKS = [
  { code: '001', ispb: '00000000', name: 'Banco do Brasil' },
  { code: '341', ispb: '60701190', name: 'Itaú Unibanco' },
  { code: '237', ispb: '60746948', name: 'Bradesco' },
  { code: '033', ispb: '90400888', name: 'Santander' },
  { code: '104', ispb: '00360305', name: 'Caixa Econômica Federal' },
  { code: '260', ispb: '18236120', name: 'Nubank' },
  { code: '077', ispb: '00416968', name: 'Banco Inter' },
  { code: '336', ispb: '13720915', name: 'C6 Bank' },
  { code: '208', ispb: '34111187', name: 'BTG Pactual' },
  { code: '422', ispb: '58160789', name: 'Banco Safra' },
  { code: '102', ispb: '02332886', name: 'XP Investimentos' },
  { code: '756', ispb: '02038232', name: 'Sicoob' },
  { code: '212', ispb: '92874270', name: 'Banco Original' },
  { code: '290', ispb: '08561701', name: 'PagBank' },
  { code: '536', ispb: '20855875', name: 'Neon Pagamentos' },
  { code: '323', ispb: '10573521', name: 'Mercado Pago' },
  { code: '748', ispb: '01181521', name: 'Sicredi' },
  { code: '041', ispb: '92702067', name: 'Banrisul' },
  { code: '070', ispb: '00000208', name: 'BRB' },
  { code: '746', ispb: '54403563', name: 'Modal Mais' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  initialAccounts: BankAccount[]
}

const emptyForm = (): CreateBankAccountData => ({
  name: '', bank_name: '', bank_code: '', ispb: '',
  agency: '', account: '', pix_key: '', is_default: false, initial_balance: 0,
})

const fieldClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase mb-1.5'

// ─── Modal form ───────────────────────────────────────────────────────────────

function AccountModal({
  mode,
  account,
  onClose,
  onSuccess,
}: {
  mode: 'create' | 'edit'
  account?: BankAccount
  onClose: () => void
  onSuccess: (accounts: BankAccount[]) => void
}) {
  const [form, setForm] = useState<CreateBankAccountData>(
    account
      ? {
          name: account.name, bank_name: account.bank_name ?? '',
          bank_code: account.bank_code ?? '', ispb: account.ispb ?? '',
          agency: account.agency ?? '', account: account.account ?? '',
          pix_key: account.pix_key ?? '', is_default: account.is_default,
          initial_balance: account.initial_balance ?? 0,
        }
      : emptyForm()
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)

  function selectBank(code: string) {
    const b = BCB_BANKS.find(b => b.code === code)
    if (b) setForm(f => ({ ...f, bank_name: b.name, bank_code: b.code, ispb: b.ispb }))
    else   setForm(f => ({ ...f, bank_name: '', bank_code: code, ispb: '' }))
  }

  function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Nome da conta obrigatório.'); return }

    startTransition(async () => {
      const res = mode === 'create'
        ? await createBankAccount(form)
        : await updateBankAccount(account!.id, form)

      if ('error' in res) { setError((res as { error: string }).error); return }
      const listRes = await listBankAccounts()
      onSuccess(Array.isArray(listRes) ? listRes : [])
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteBankAccount(account!.id)
      if (res?.error) { setError(res.error); return }
      const listRes = await listBankAccounts()
      onSuccess(Array.isArray(listRes) ? listRes : [])
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">
            {mode === 'create' ? 'Nova Conta Bancária' : 'Editar Conta'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={labelClass}>Nome da Conta *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={fieldClass} placeholder="Ex: Conta Corrente Principal" />
          </div>

          <div>
            <label className={labelClass}>Banco</label>
            <select
              value={form.bank_code ?? ''}
              onChange={e => selectBank(e.target.value)}
              className={fieldClass}
            >
              <option value="">— Selecione o banco —</option>
              {BCB_BANKS.map(b => (
                <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
              ))}
              <option value="other">Outro</option>
            </select>
          </div>

          {form.bank_code === 'other' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Nome do Banco</label>
                <input value={form.bank_name ?? ''} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  className={fieldClass} placeholder="Nome do banco" />
              </div>
              <div>
                <label className={labelClass}>ISPB</label>
                <input value={form.ispb ?? ''} onChange={e => setForm(f => ({ ...f, ispb: e.target.value }))}
                  className={fieldClass} placeholder="00000000" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Agência</label>
              <input value={form.agency ?? ''} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))}
                className={fieldClass} placeholder="0001" />
            </div>
            <div>
              <label className={labelClass}>Conta</label>
              <input value={form.account ?? ''} onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                className={fieldClass} placeholder="12345-6" />
            </div>
          </div>

          <div>
            <label className={labelClass}>Chave PIX</label>
            <input value={form.pix_key ?? ''} onChange={e => setForm(f => ({ ...f, pix_key: e.target.value }))}
              className={fieldClass} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
          </div>

          <div>
            <label className={labelClass}>Saldo Inicial (R$)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.initial_balance ?? 0}
                onChange={e => setForm(f => ({ ...f, initial_balance: Number(e.target.value) || 0 }))}
                className={`${fieldClass} pl-9`}
                placeholder="0,00"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Saldo pré-existente antes do início dos lançamentos neste sistema.</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default ?? false}
              onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-slate-700">Definir como conta padrão</span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {confirmDel && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-700">Excluir esta conta bancária?</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={isPending}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirmar'}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4">
          {mode === 'edit' && !confirmDel && (
            <button onClick={() => setConfirmDel(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? 'Criar Conta' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BankAccountsTab({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[]>(initialAccounts)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; account?: BankAccount } | null>(null)

  const filtered = accounts.filter(a =>
    search.trim() === '' ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.bank_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.ispb ?? '').includes(search)
  )

  function handleModalSuccess(updated: BankAccount[]) {
    setAccounts(updated)
    setModal(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou banco..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Nova Conta
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-200 bg-white">
          <Building2 className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-sm text-slate-400 font-medium">
            {search ? 'Nenhuma conta encontrada.' : 'Nenhuma conta bancária cadastrada.'}
          </p>
          {!search && (
            <button onClick={() => setModal({ mode: 'create' })}
              className="mt-3 text-sm text-teal-600 font-semibold hover:text-teal-700">
              + Adicionar conta
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto -mx-px">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Conta</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase hidden sm:table-cell">Banco</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase hidden sm:table-cell">Agência / Conta</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Chave PIX</th>
                  <th className="py-3 px-4 text-right text-xs font-bold text-slate-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(acc => (
                  <tr key={acc.id} className="border-b border-slate-100 hover:bg-teal-50/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{acc.name}</span>
                        {acc.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                            <Star className="h-3 w-3" /> Padrão
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 hidden sm:table-cell">
                      {acc.bank_name ?? '—'}
                      {acc.bank_code && <span className="ml-1 text-xs text-slate-400">({acc.bank_code})</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 hidden sm:table-cell">
                      {acc.agency || acc.account
                        ? `${acc.agency ?? '—'} / ${acc.account ?? '—'}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 truncate">
                      {acc.pix_key ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setModal({ mode: 'edit', account: acc })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2">
            <p className="text-xs text-slate-400">{accounts.length} conta{accounts.length !== 1 ? 's' : ''} cadastrada{accounts.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {modal && (
        <AccountModal
          mode={modal.mode}
          account={modal.account}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}
