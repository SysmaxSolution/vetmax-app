'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  X, ChevronRight, ChevronDown, Check, Loader2, Shield, Search,
  AlertTriangle, ToggleLeft, ToggleRight,
} from 'lucide-react'
import {
  ACCESS_CATALOG, ACTION_LABELS, buildPermissionKey,
  type AccessAction, type AccessModule,
} from '@/config/access-catalog'
import {
  getUserAccessRights, setUserAccessRight, setUserAccessRightsBulk,
  type GranularPermissionRow,
} from '@/lib/actions/access-rights'
import { getUserModuleAccess } from '@/lib/actions/user-management'

interface Props {
  userId:       string
  userName:     string
  activeModules: string[]              // ATIVOS na clínica (do header layout)
  currentUserId: string                // pra impedir auto-edição
  onClose:      () => void
}

// Mapa em memória: "moduleKey" ou "moduleKey.tabKey" + ":" + action → allowed
type PermMap = Map<string, boolean>

function permKey(module: string, action: AccessAction) {
  return `${module}:${action}`
}

export default function UserAccessRightsModal({
  userId, userName, activeModules, currentUserId, onClose,
}: Props) {
  const isSelfEditing = userId === currentUserId

  const [perms,    setPerms]    = useState<PermMap>(new Map())
  const [disabledModules, setDisabledModules] = useState<Set<string>>(new Set())
  const [loading,  setLoading]  = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [isBulkLoading, startBulk] = useTransition()

  // Carrega permissões + módulos desabilitados (do toggle ON/OFF) ao montar
  useEffect(() => {
    if (isSelfEditing) { setLoading(false); return }
    Promise.all([
      getUserAccessRights(userId),
      getUserModuleAccess(userId),
    ]).then(([rightsRes, accessRes]) => {
      setLoading(false)
      if ('error' in rightsRes) { setError(rightsRes.error); return }
      const m: PermMap = new Map()
      for (const r of rightsRes) m.set(permKey(r.module, r.action), r.allowed)
      setPerms(m)
      if (!('error' in accessRes)) {
        const dis = new Set<string>()
        for (const r of accessRes) if (r.enabled === false) dis.add(r.module_name)
        setDisabledModules(dis)
      }
    })
  }, [userId, isSelfEditing])

  // Filtra módulos pelo que está ativo NA CLÍNICA + busca
  const visibleModules = ACCESS_CATALOG
    .filter(m => activeModules.includes(m.key))
    .filter(m => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      if (m.label.toLowerCase().includes(q)) return true
      return m.tabs?.some(t => t.label.toLowerCase().includes(q)) ?? false
    })

  function isModuleBlockedForUser(moduleKey: string) {
    return disabledModules.has(moduleKey)
  }

  // ── Default: se NÃO existe entrada na DB, considera ALLOWED ────────────────
  function getEffective(module: string, action: AccessAction): boolean {
    const k = permKey(module, action)
    const v = perms.get(k)
    return v !== false   // ausente OU true → allowed; só false → denied
  }

  async function togglePerm(module: string, action: AccessAction, currentlyAllowed: boolean) {
    const newAllowed = !currentlyAllowed
    const key = permKey(module, action)
    setSavingKey(key)
    setError(null)
    const res = await setUserAccessRight({
      targetUserId: userId, module, action, allowed: newAllowed,
    })
    setSavingKey(null)
    if ('error' in res) { setError(res.error); return }
    setPerms(prev => {
      const next = new Map(prev)
      next.set(key, newAllowed)
      return next
    })
  }

  // ── Atalho: liberar/bloquear TODAS as ações de um módulo ───────────────────
  function bulkAllModule(module: AccessModule, allow: boolean) {
    startBulk(async () => {
      const rows: GranularPermissionRow[] = []
      const fanout = (modKey: string, actions: AccessAction[]) => {
        for (const a of actions) rows.push({ module: modKey, action: a, allowed: allow })
      }
      if (module.actions) fanout(module.key, module.actions)
      for (const t of module.tabs ?? []) fanout(buildPermissionKey(module.key, t.key), t.actions)
      const res = await setUserAccessRightsBulk(userId, rows)
      if ('error' in res) { setError(res.error); return }
      setPerms(prev => {
        const next = new Map(prev)
        for (const r of rows) next.set(permKey(r.module, r.action), r.allowed)
        return next
      })
    })
  }

  function toggleExpanded(modKey: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(modKey)) next.delete(modKey)
      else next.add(modKey)
      return next
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Direitos de Acesso</h2>
              <p className="text-xs text-indigo-100">{userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-indigo-100 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search + alerta self-edit */}
        <div className="border-b border-slate-200 px-6 py-3 flex-shrink-0 space-y-3">
          {isSelfEditing && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Você não pode alterar seus próprios direitos de acesso.</p>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar módulo ou aba…"
              className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Lista de módulos */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : visibleModules.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-8 text-center">
              Nenhum módulo ativo nesta clínica. Habilite primeiro em <strong>Configurações &gt; Módulos</strong>.
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleModules.map(mod => {
                const blocked = isModuleBlockedForUser(mod.key)
                const isExpanded = expanded.has(mod.key)
                return (
                  <li key={mod.key} className={`rounded-xl border ${blocked ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}`}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(mod.key)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-slate-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <div>
                          <p className={`text-sm font-semibold ${blocked ? 'text-slate-400' : 'text-slate-800'}`}>
                            {mod.label}
                          </p>
                          {mod.description && (
                            <p className="text-xs text-slate-400">{mod.description}</p>
                          )}
                          {blocked && (
                            <p className="text-[11px] text-amber-600 mt-0.5">
                              Módulo desativado para este usuário no toggle geral — direitos abaixo ficam sem efeito.
                            </p>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isSelfEditing || isBulkLoading}
                          onClick={() => bulkAllModule(mod, true)}
                          className="px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 rounded-md disabled:opacity-30"
                          title="Liberar tudo neste módulo"
                        >
                          Liberar tudo
                        </button>
                        <button
                          type="button"
                          disabled={isSelfEditing || isBulkLoading}
                          onClick={() => bulkAllModule(mod, false)}
                          className="px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 rounded-md disabled:opacity-30"
                          title="Bloquear tudo neste módulo"
                        >
                          Bloquear tudo
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 px-4 py-3 space-y-3">
                        {/* Caso A: módulo SEM abas → grid direto de ações */}
                        {mod.actions && (
                          <ActionRow
                            label="Ações neste módulo"
                            module={mod.key}
                            actions={mod.actions}
                            perms={perms}
                            savingKey={savingKey}
                            getEffective={getEffective}
                            onToggle={togglePerm}
                            disabled={isSelfEditing}
                          />
                        )}

                        {/* Caso B: módulo COM abas → cada aba lista suas ações */}
                        {(mod.tabs ?? []).map(tab => (
                          <ActionRow
                            key={tab.key}
                            label={tab.label}
                            description={tab.description}
                            module={buildPermissionKey(mod.key, tab.key)}
                            actions={tab.actions}
                            perms={perms}
                            savingKey={savingKey}
                            getEffective={getEffective}
                            onToggle={togglePerm}
                            disabled={isSelfEditing}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-500">
            {error
              ? <span className="text-rose-600">{error}</span>
              : 'Alterações são salvas automaticamente.'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componente: linha de ações ──────────────────────────────────────────

function ActionRow({
  label, description, module, actions, perms, savingKey, getEffective, onToggle, disabled,
}: {
  label:        string
  description?: string
  module:       string
  actions:      AccessAction[]
  perms:        PermMap
  savingKey:    string | null
  getEffective: (module: string, action: AccessAction) => boolean
  onToggle:     (module: string, action: AccessAction, currentlyAllowed: boolean) => void
  disabled:     boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          {description && <p className="text-[11px] text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {actions.map(action => {
          const allowed = getEffective(module, action)
          const isSaving = savingKey === `${module}:${action}`
          return (
            <button
              key={action}
              type="button"
              disabled={disabled || isSaving}
              onClick={() => onToggle(module, action, allowed)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                allowed
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200'
                  : 'bg-white text-slate-400 hover:bg-slate-100 border border-slate-200'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {isSaving
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : allowed
                  ? <ToggleRight className="h-3.5 w-3.5" />
                  : <ToggleLeft className="h-3.5 w-3.5" />}
              {ACTION_LABELS[action]}
              {allowed && !isSaving && <Check className="h-3 w-3" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
