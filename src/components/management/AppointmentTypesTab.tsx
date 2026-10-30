'use client'

// Gestão → Salas/Boxes → Tipos de atendimento da agenda (0527).
// Cada tipo diz duração, setor, se exige profissional e qual sala/aparelho
// ocupa por padrão. A recepção escolhe o tipo ao marcar e o resto se preenche.

import { useEffect, useState } from 'react'
import { CalendarClock, Plus, Pencil, Check, X, Loader2, Trash2 } from 'lucide-react'
import { listAppointmentTypes, upsertAppointmentType, deleteAppointmentType } from '@/lib/actions/appointment-types'
import type { AppointmentType, AppointmentTypeInput } from '@/types/appointment-types'
import type { Room } from '@/types/rooms'

interface Props { rooms: Room[] }

const VAZIO: AppointmentTypeInput = { name: '', sector: '', duration_minutes: 30, color: '#2563eb', requires_professional: false, default_room_id: '' }

export default function AppointmentTypesTab({ rooms }: Props) {
  const [tipos, setTipos]     = useState<AppointmentType[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft]     = useState<AppointmentTypeInput | null>(null)
  const [saving, setSaving]   = useState(false)
  const [erro, setErro]       = useState<string | null>(null)
  const recursos = rooms.filter(r => r.active && r.schedulable)

  async function carregar() {
    const r = await listAppointmentTypes()
    if (Array.isArray(r)) setTipos(r); else setErro(r.error)
    setLoading(false)
  }
  useEffect(() => { void carregar() }, [])

  async function salvar() {
    if (!draft) return
    setSaving(true); setErro(null)
    const r = await upsertAppointmentType({ ...draft, default_room_id: draft.default_room_id || null })
    setSaving(false)
    if ('error' in r) { setErro(r.error); return }
    setDraft(null); await carregar()
  }
  async function desativar(id: string) {
    setSaving(true); setErro(null)
    const r = await deleteAppointmentType(id)
    setSaving(false)
    if ('error' in r) { setErro(r.error); return }
    await carregar()
  }

  const set = <K extends keyof AppointmentTypeInput>(k: K, v: AppointmentTypeInput[K]) => setDraft(d => d ? { ...d, [k]: v } : d)
  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-teal-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Tipos de atendimento da agenda</p>
            <p className="text-xs text-slate-500">Duração padrão, setor e a sala/aparelho que cada atendimento ocupa. A recepção escolhe o tipo e a marcação se preenche.</p>
          </div>
        </div>
        {!draft && (
          <button type="button" onClick={() => setDraft({ ...VAZIO })}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
            <Plus className="h-3.5 w-3.5" /> Novo tipo
          </button>
        )}
      </div>

      {erro && <p className="mx-6 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}

      {draft && (
        <div className="mx-6 my-4 rounded-xl border-2 border-teal-300 bg-teal-50/40 p-4 grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Nome</label>
            <input value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Ex.: Ultrassom abdominal" className={input} autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Setor</label>
            <input value={draft.sector ?? ''} onChange={e => set('sector', e.target.value)} placeholder="Imagem" className={input} list="setores-agenda" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Duração (min)</label>
            <input type="number" min={5} max={1440} step={5} value={draft.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))} className={input} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Sala / aparelho padrão</label>
            <select value={draft.default_room_id ?? ''} onChange={e => set('default_room_id', e.target.value)} className={input + ' bg-white'}>
              <option value="">— nenhum —</option>
              {recursos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Cor</label>
            <input type="color" value={draft.color ?? '#2563eb'} onChange={e => set('color', e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 bg-white p-1" />
          </div>
          <label className="sm:col-span-4 flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={draft.requires_professional === true} onChange={e => set('requires_professional', e.target.checked)} className="rounded border-slate-300 text-teal-600" />
            Exige escolher o profissional ao marcar (ex.: exame com anestesia)
          </label>
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            <button type="button" onClick={salvar} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar
            </button>
          </div>
        </div>
      )}

      <datalist id="setores-agenda">
        {[...new Set([...tipos.map(t => t.sector), ...rooms.map(r => r.sector)].filter(Boolean))].map(s => <option key={s as string} value={s as string} />)}
      </datalist>

      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="flex justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : tipos.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">Nenhum tipo cadastrado. Sem tipos, a agenda segue marcando por profissional como sempre.</p>
        ) : tipos.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-6 py-3">
            <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color ?? '#2563eb' }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{t.name}</p>
              <p className="text-[11px] text-slate-500">
                {t.duration_minutes} min{t.sector ? ` · ${t.sector}` : ''}{t.default_room_name ? ` · ${t.default_room_name}` : ''}{t.requires_professional ? ' · exige profissional' : ''}
              </p>
            </div>
            <button type="button" onClick={() => setDraft({ id: t.id, name: t.name, sector: t.sector ?? '', duration_minutes: t.duration_minutes, color: t.color ?? '#2563eb', requires_professional: t.requires_professional, default_room_id: t.default_room_id ?? '', service_item_id: t.service_item_id })}
              className="text-slate-400 hover:text-teal-600"><Pencil className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => void desativar(t.id)} disabled={saving} className="text-slate-400 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
