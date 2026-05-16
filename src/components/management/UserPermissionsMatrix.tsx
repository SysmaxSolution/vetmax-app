'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save, Check, Lock, Shield } from 'lucide-react'
import { listUserPermissions, upsertUserPermissions } from '@/lib/actions/permissions'
import type { UserPermission } from '@/lib/actions/permissions'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MODULES: { key: string; label: string }[] = [
  { key: 'reception',       label: 'Recepção' },
  { key: 'triage',          label: 'Triagem' },
  { key: 'vet',             label: 'Consultório' },
  { key: 'exams',           label: 'Exames' },
  { key: 'pharmacy',        label: 'Farmácia' },
  { key: 'grooming',        label: 'Banho e Tosa' },
  { key: 'hospitalization', label: 'Internação' },
  { key: 'cashier',         label: 'Caixa' },
  { key: 'financial',       label: 'Financeiro' },
  { key: 'purchases',       label: 'Compras' },
  { key: 'sales',           label: 'Vendas (PDV)' },
  { key: 'reports',         label: 'Relatórios' },
  { key: 'management',      label: 'Gestão' },
  { key: 'whatsapp',        label: 'WhatsApp' },
]

const ACTIONS: { key: 'view' | 'create' | 'edit' | 'delete'; label: string }[] = [
  { key: 'view',   label: 'Visualizar' },
  { key: 'create', label: 'Criar' },
  { key: 'edit',   label: 'Editar' },
  { key: 'delete', label: 'Excluir' },
]

// Mapa: module+action → allowed
type PermMap = Record<string, Record<string, boolean>>

function buildKey(module: string, action: string) {
  return `${module}::${action}`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userId:       string
  userFullName: string
  isAdmin:      boolean   // se true, mostra como somente-leitura (tudo liberado)
  onToast:      (type: 'success' | 'error', message: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UserPermissionsMatrix({
  userId, userFullName, isAdmin, onToast,
}: Props) {
  const [permMap, setPermMap]   = useState<PermMap>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [dirty, setDirty]       = useState(false)

  // ── Carregar permissões ──────────────────────────────────────────────────

  const loadPermissions = useCallback(async () => {
    setLoading(true)
    const res = await listUserPermissions(userId)
    setLoading(false)
    if ('error' in res) {
      onToast('error', res.error)
      return
    }
    const map: PermMap = {}
    for (const p of res) {
      if (!map[p.module]) map[p.module] = {}
      map[p.module][p.action] = p.allowed
    }
    setPermMap(map)
    setDirty(false)
  }, [userId, onToast])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getPermission(module: string, action: 'view' | 'create' | 'edit' | 'delete'): boolean {
    if (isAdmin) return true
    return permMap[module]?.[action] ?? false
  }

  function togglePermission(module: string, action: 'view' | 'create' | 'edit' | 'delete') {
    if (isAdmin) return
    const current = getPermission(module, action)
    const next = !current

    setPermMap(prev => {
      const updated = { ...prev, [module]: { ...(prev[module] ?? {}) } }
      updated[module][action] = next

      // Se desmarcar "view", desmarcar todas as ações do módulo
      if (action === 'view' && !next) {
        for (const a of ACTIONS) {
          updated[module][a.key] = false
        }
      }
      // Se marcar qualquer ação (não view), forçar view=true
      if (action !== 'view' && next) {
        updated[module]['view'] = true
      }
      return updated
    })
    setDirty(true)
  }

  // ── Salvar ──────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    const rows: { module: string; action: string; allowed: boolean }[] = []
    for (const mod of MODULES) {
      for (const act of ACTIONS) {
        rows.push({
          module:  mod.key,
          action:  act.key,
          allowed: permMap[mod.key]?.[act.key] ?? false,
        })
      }
    }
    const res = await upsertUserPermissions(userId, rows)
    setSaving(false)
    if ('error' in res) {
      onToast('error', res.error)
    } else {
      onToast('success', `Permissões de ${userFullName} salvas com sucesso!`)
      setDirty(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header info */}
      {isAdmin ? (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Shield className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Administradores têm <strong>todas as permissões</strong> por padrão e não podem ser restritos.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <Lock className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">
            Clique em qualquer ação para liberar ou revogar. Marcar Criar/Editar/Excluir
            ativa <strong>Visualizar</strong> automaticamente.
          </p>
        </div>
      )}

      {/* Matriz */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 rounded-xl">
        <div className="rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-32 sm:w-40 min-w-[128px]">Módulo</th>
              {ACTIONS.map(a => (
                <th key={a.key} className="px-3 py-3 text-center text-xs font-semibold text-slate-600 min-w-[80px]">
                  {a.key === 'view'   && <><span className="hidden sm:inline">Visualizar</span><span className="sm:hidden">Ver</span></>}
                  {a.key === 'create' && <span>Criar</span>}
                  {a.key === 'edit'   && <span>Editar</span>}
                  {a.key === 'delete' && <><span className="hidden sm:inline">Excluir</span><span className="sm:hidden">Del</span></>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MODULES.map(mod => (
              <tr key={mod.key} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-slate-800 max-w-[100px] sm:max-w-none truncate">{mod.label}</td>
                {ACTIONS.map(act => {
                  const checked = getPermission(mod.key, act.key)
                  const viewOn  = getPermission(mod.key, 'view')
                  // Não-view sem view ativo fica visualmente mais suave, mas ainda clicável
                  const dimmed  = !isAdmin && act.key !== 'view' && !viewOn && !checked

                  return (
                    <td key={act.key} className="px-3 py-3 text-center">
                      {isAdmin ? (
                        <div className="flex items-center justify-center">
                          <div className="h-5 w-5 rounded bg-teal-100 flex items-center justify-center">
                            <Check className="h-3 w-3 text-teal-600" />
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => togglePermission(mod.key, act.key)}
                          className={`mx-auto flex h-5 w-5 items-center justify-center rounded border-2 transition-all cursor-pointer ${
                            checked
                              ? 'border-teal-500 bg-teal-500 hover:border-teal-600 hover:bg-teal-600'
                              : dimmed
                                ? 'border-slate-200 bg-white hover:border-teal-300'
                                : 'border-slate-300 bg-white hover:border-teal-400'
                          }`}
                          title={checked ? 'Revogar permissão' : 'Conceder permissão'}
                        >
                          {checked && <Check className="h-3 w-3 text-white" />}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Footer: Salvar */}
      {!isAdmin && (
        <div className="flex items-center justify-end gap-3">
          {dirty && (
            <span className="text-xs text-amber-600 font-medium">
              Alterações não salvas
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
            }
            {saving ? 'Salvando...' : 'Salvar Permissões'}
          </button>
        </div>
      )}
    </div>
  )
}
