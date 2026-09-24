'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, CheckCircle2, Flag, Users, Sliders, BarChart3 } from 'lucide-react'
import { getTrainingAdminOverview, setTrainingModuleAccess, updateTrainingReportStatus } from '@/lib/actions/training'
import { TRAINING_MODULES, TRAINING_MODULE_NAME } from '@/lib/training-modules'

type AUser = { id: string; name: string; role: string; completed: number; total: number; lastActive: string | null }
type AReport = { id: string; type: 'request' | 'bug'; message: string; status: string; createdAt: string; moduleKey: string | null; videoCode: string | null; userName: string }
type AAccess = { profileId: string; moduleKey: string; canView: boolean }

export default function TrainingAdmin({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'users' | 'reports' | 'access'>('users')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AUser[]>([])
  const [reports, setReports] = useState<AReport[]>([])
  const [access, setAccess] = useState<AAccess[]>([])
  const [selUser, setSelUser] = useState<string>('')

  async function load() {
    setLoading(true)
    const r = await getTrainingAdminOverview()
    setLoading(false)
    if ('error' in r) return
    setUsers(r.users); setReports(r.reports); setAccess(r.access)
    if (!selUser && r.users.length) setSelUser(r.users[0].id)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  async function resolve(id: string) {
    setReports(rs => rs.map(r => r.id === id ? { ...r, status: 'resolved' } : r))
    await updateTrainingReportStatus(id, 'resolved')
  }
  function canView(profileId: string, moduleKey: string) {
    const row = access.find(a => a.profileId === profileId && a.moduleKey === moduleKey)
    return row ? row.canView : true // sem linha = liberado
  }
  async function toggleAccess(profileId: string, moduleKey: string) {
    const next = !canView(profileId, moduleKey)
    setAccess(a => {
      const others = a.filter(x => !(x.profileId === profileId && x.moduleKey === moduleKey))
      return [...others, { profileId, moduleKey, canView: next }]
    })
    await setTrainingModuleAccess(profileId, moduleKey, next)
  }

  const openReports = reports.filter(r => r.status !== 'resolved').length

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600"><ArrowLeft className="w-4 h-4" /> Voltar à Academia</button>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 ml-2">Painel do Gestor — Treinamento</h1>
      </div>

      <div className="flex gap-2">
        <Tab active={tab === 'users'} onClick={() => setTab('users')}><Users className="w-4 h-4" /> Evolução da equipe</Tab>
        <Tab active={tab === 'reports'} onClick={() => setTab('reports')}><Flag className="w-4 h-4" /> Reports{openReports > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 rounded-full">{openReports}</span>}</Tab>
        <Tab active={tab === 'access'} onClick={() => setTab('access')}><Sliders className="w-4 h-4" /> Acesso por módulo</Tab>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : tab === 'users' ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase">
              <tr><th className="text-left px-4 py-2.5">Usuário</th><th className="text-left px-4 py-2.5">Função</th><th className="text-left px-4 py-2.5 w-[42%]">Progresso</th><th className="text-left px-4 py-2.5">Última atividade</th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const pct = u.total ? Math.round((u.completed / u.total) * 100) : 0
                return (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-slate-700/60">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{u.role}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden max-w-[220px]"><div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{u.completed}/{u.total} · {pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{u.lastActive ? new Date(u.lastActive).toLocaleDateString('pt-BR') : '—'}</td>
                  </tr>
                )
              })}
              {!users.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Nenhum usuário na clínica.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : tab === 'reports' ? (
        <div className="space-y-2">
          {reports.map(r => (
            <div key={r.id} className={`bg-white dark:bg-slate-800 border rounded-xl p-4 flex items-start gap-3 ${r.status === 'resolved' ? 'opacity-60 border-slate-200 dark:border-slate-700' : 'border-amber-200 dark:border-amber-500/30'}`}>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${r.type === 'request' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>{r.type === 'request' ? 'PEDIDO' : 'PROBLEMA'}</span>
              <div className="flex-1">
                <p className="text-sm text-slate-800 dark:text-slate-100">{r.message}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {r.userName}{r.videoCode ? ` · ${r.videoCode.toUpperCase()}` : ''}{r.moduleKey ? ` · ${TRAINING_MODULE_NAME[r.moduleKey] ?? r.moduleKey}` : ''} · {new Date(r.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              {r.status === 'resolved' ? (
                <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Resolvido</span>
              ) : (
                <button onClick={() => resolve(r.id)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-emerald-400 hover:text-emerald-600 text-slate-500">Marcar resolvido</button>
              )}
            </div>
          ))}
          {!reports.length && <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-2"><Flag className="w-8 h-8" /> Nenhum report ainda.</div>}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            <label className="text-sm text-slate-600 dark:text-slate-300">Liberar/bloquear módulos de treino para:</label>
            <select value={selUser} onChange={e => setSelUser(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm">
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-400">Marcado = o usuário pode treinar esse módulo. Sem restrições cadastradas, todos os módulos ficam liberados por padrão.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {TRAINING_MODULES.map(m => {
              const on = selUser ? canView(selUser, m.key) : true
              return (
                <button key={m.key} disabled={!selUser} onClick={() => toggleAccess(selUser, m.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition ${on ? 'border-teal-500 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300' : 'border-slate-200 dark:border-slate-700 text-slate-400 line-through'}`}>
                  <span>{m.icon}</span> <span className="truncate">{m.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition ${active ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-teal-600'}`}>{children}</button>
  )
}
