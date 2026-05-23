'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  listChartOfAccounts, createChartOfAccount, deleteChartOfAccount,
  updateChartOfAccount, replicateDefaultChartOfAccounts,
  type ChartOfAccount, type CreateChartOfAccountData,
} from '@/lib/actions/financial'
import { Plus, Trash2, X, Loader2, AlertCircle, BookOpen, ChevronRight, Pencil, Sparkles } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  initialAccounts: ChartOfAccount[]
}

type AccountType = 'receita' | 'despesa' | 'ativo' | 'passivo'

const TYPE_LABELS: Record<AccountType, string> = {
  receita:  'Receita',
  despesa:  'Despesa',
  ativo:    'Ativo',
  passivo:  'Passivo',
}

const TYPE_COLORS: Record<AccountType, string> = {
  receita: 'bg-emerald-100 text-emerald-700',
  despesa: 'bg-red-100 text-red-700',
  ativo:   'bg-blue-100 text-blue-700',
  passivo: 'bg-amber-100 text-amber-700',
}

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase mb-1.5'

// ─── Add modal ────────────────────────────────────────────────────────────────

function AccountFormModal({
  parents,
  initial,
  onClose,
  onSuccess,
}: {
  parents: ChartOfAccount[]
  initial?: ChartOfAccount
  onClose: () => void
  onSuccess: (accounts: ChartOfAccount[]) => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState<CreateChartOfAccountData>({
    code:      initial?.code      ?? '',
    name:      initial?.name      ?? '',
    type:      initial?.type      ?? 'receita',
    parent_id: initial?.parent_id ?? undefined,
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    if (!form.code.trim()) { setError('Código obrigatório.'); return }
    if (!form.name.trim()) { setError('Nome obrigatório.'); return }

    startTransition(async () => {
      const res = isEdit && initial
        ? await updateChartOfAccount(initial.id, form)
        : await createChartOfAccount(form)
      if ('error' in res) { setError((res as { error: string }).error); return }
      const listRes = await listChartOfAccounts()
      onSuccess(Array.isArray(listRes) ? listRes : [])
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">{isEdit ? 'Editar Conta' : 'Nova Conta'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Código *</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                className={fieldClass} placeholder="Ex: 3.1" />
            </div>
            <div>
              <label className={labelClass}>Tipo *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))} className={fieldClass}>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
                <option value="ativo">Ativo</option>
                <option value="passivo">Passivo</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Nome *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={fieldClass} placeholder="Ex: Serviços de Estética" />
          </div>

          <div>
            <label className={labelClass}>Conta Pai (opcional)</label>
            <select value={form.parent_id ?? ''} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || undefined }))} className={fieldClass}>
              <option value="">— Sem pai (conta raiz) —</option>
              {parents.filter(p => !p.parent_id && p.id !== initial?.id).map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEdit ? 'Salvar Alterações' : 'Criar Conta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Account row ──────────────────────────────────────────────────────────────

function AccountRow({
  account,
  children,
  onDelete,
  onEdit,
}: {
  account: ChartOfAccount
  children?: React.ReactNode
  onDelete: (id: string) => void
  onEdit:   (account: ChartOfAccount) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = !!children

  return (
    <div>
      <div className={`flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-slate-50 group transition-colors ${account.parent_id ? 'ml-6 border-l-2 border-slate-100 pl-4' : ''}`}>
        {hasChildren ? (
          <button onClick={() => setExpanded(v => !v)} className="text-slate-400 hover:text-slate-600">
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        <span className="text-xs font-mono font-semibold text-slate-500 w-12 shrink-0">{account.code}</span>
        <span className="text-sm font-medium text-slate-800 flex-1">{account.name}</span>

        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${TYPE_COLORS[account.type as AccountType]}`}>
          {TYPE_LABELS[account.type as AccountType]}
        </span>

        {account.is_system ? (
          <span className="text-xs text-slate-400 shrink-0">Sistema</span>
        ) : (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onEdit(account)}
              title="Editar conta"
              className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(account.id)}
              title="Excluir conta"
              className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {hasChildren && expanded && <div className="mt-1">{children}</div>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChartOfAccountsTab({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>(initialAccounts)
  const [filterType, setFilterType] = useState<AccountType | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ChartOfAccount | null>(null)
  const [replicating, setReplicating] = useState(false)
  const [replicateMsg, setReplicateMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleReplicate() {
    if (!confirm('Replicar o plano de contas padrão Sysmax? Contas com mesmo código serão preservadas.')) return
    setReplicating(true)
    setReplicateMsg(null)
    const res = await replicateDefaultChartOfAccounts()
    setReplicating(false)
    if ('error' in res) { setReplicateMsg('Erro: ' + res.error); return }
    setReplicateMsg(`${res.created} conta${res.created !== 1 ? 's' : ''} criada${res.created !== 1 ? 's' : ''}, ${res.skipped} já existia${res.skipped !== 1 ? 'm' : ''}.`)
    const listRes = await listChartOfAccounts()
    if (Array.isArray(listRes)) setAccounts(listRes)
    setTimeout(() => setReplicateMsg(null), 5000)
  }

  // Build tree
  const tree = useMemo(() => {
    const filtered = filterType === 'all' ? accounts : accounts.filter(a => a.type === filterType)
    const roots = filtered.filter(a => !a.parent_id)
    const childrenOf = (parentId: string) => filtered.filter(a => a.parent_id === parentId)
    return { roots, childrenOf }
  }, [accounts, filterType])

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteChartOfAccount(id)
      if (!res?.error) {
        const listRes = await listChartOfAccounts()
        if (Array.isArray(listRes)) setAccounts(listRes)
      }
    })
  }

  function handleModalSuccess(updated: ChartOfAccount[]) {
    setAccounts(updated)
    setShowModal(false)
  }

  const rootParents = accounts.filter(a => !a.parent_id)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'receita', 'despesa', 'ativo', 'passivo'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                filterType === t
                  ? 'bg-teal-600 text-white'
                  : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {t === 'all' ? 'Todos' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={handleReplicate}
          disabled={replicating}
          title="Cria as contas padrão Sysmax (já existentes são preservadas)"
          className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-60"
        >
          {replicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Replicar Padrão
        </button>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Nova Conta
        </button>
      </div>

      {replicateMsg && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-700">
          {replicateMsg}
        </div>
      )}

      {/* Tree */}
      {tree.roots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white">
          <BookOpen className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-sm text-slate-400 font-medium">Nenhuma conta encontrada.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1 overflow-x-auto">
          {tree.roots.map(root => {
            const children = tree.childrenOf(root.id)
            return (
              <AccountRow key={root.id} account={root} onDelete={handleDelete} onEdit={setEditing}>
                {children.length > 0 ? (
                  <div className="space-y-1">
                    {children.map(child => (
                      <AccountRow key={child.id} account={child} onDelete={handleDelete} onEdit={setEditing} />
                    ))}
                  </div>
                ) : undefined}
              </AccountRow>
            )
          })}
        </div>
      )}

      <p className="text-xs text-slate-400">
        {accounts.length} conta{accounts.length !== 1 ? 's' : ''} no plano de contas. Contas do sistema não podem ser excluídas.
      </p>

      {showModal && (
        <AccountFormModal
          parents={rootParents}
          onClose={() => setShowModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {editing && (
        <AccountFormModal
          parents={rootParents}
          initial={editing}
          onClose={() => setEditing(null)}
          onSuccess={(updated) => { setAccounts(updated); setEditing(null) }}
        />
      )}
    </div>
  )
}
