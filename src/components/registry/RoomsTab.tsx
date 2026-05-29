'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, X, BedDouble, DoorOpen, Wrench, CheckCircle2, EyeOff } from 'lucide-react'
import {
  getRooms, createRoom, updateRoom, toggleRoomActive,
  type Room, type RoomType, type RoomOperationalStatus, type RoomCareLevel,
} from '@/lib/actions/rooms'

/**
 * CRUD de infraestrutura física (Cadastros). Reutilizável:
 *  - kind='box'  → leitos/boxes de internação (type=hospitalization, com diária).
 *  - kind='sala' → salas de cirurgia/consultório/exame (sem diária).
 */

interface Props { kind: 'box' | 'sala' }

const SALA_TYPES: { value: RoomType; label: string }[] = [
  { value: 'surgery',      label: 'Cirurgia' },
  { value: 'consultation', label: 'Consultório' },
  { value: 'exam',         label: 'Exame' },
]
const TYPE_LABEL: Record<string, string> = { hospitalization: 'Internação', surgery: 'Cirurgia', consultation: 'Consultório', exam: 'Exame', grooming: 'Banho e Tosa' }

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

interface Draft {
  id?: string
  name: string
  type: RoomType
  capacity: string
  daily_rate: string
  operational_status: RoomOperationalStatus
  default_care_level: '' | RoomCareLevel
}

export default function RoomsTab({ kind }: Props) {
  const isBox = kind === 'box'
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  async function reload() {
    const res = await getRooms()
    if (Array.isArray(res)) {
      setRooms(res.filter(r => isBox ? r.type === 'hospitalization' : ['surgery', 'consultation', 'exam'].includes(r.type)))
    }
    setLoading(false)
  }
  useEffect(() => { void reload() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  function newDraft() {
    setError(null)
    setDraft({ name: '', type: isBox ? 'hospitalization' : 'surgery', capacity: '1', daily_rate: '', operational_status: 'active', default_care_level: '' })
  }
  function editDraft(r: Room) {
    setError(null)
    setDraft({ id: r.id, name: r.name, type: r.type, capacity: String(r.capacity ?? 1), daily_rate: r.daily_rate ? String(r.daily_rate) : '', operational_status: r.operational_status, default_care_level: r.default_care_level ?? '' })
  }

  async function save() {
    if (!draft) return
    if (!draft.name.trim()) { setError('Informe o nome.'); return }
    const capacity = Math.max(1, parseInt(draft.capacity || '1', 10) || 1)
    const daily_rate = isBox ? (parseFloat((draft.daily_rate || '0').replace(',', '.')) || 0) : 0
    setBusy(true); setError(null)
    const default_care_level = isBox ? (draft.default_care_level || null) : null
    const res = draft.id
      ? await updateRoom(draft.id, { name: draft.name.trim(), type: draft.type, capacity, daily_rate, operational_status: draft.operational_status, default_care_level })
      : await createRoom(draft.name.trim(), draft.type, capacity, { daily_rate, operational_status: draft.operational_status, default_care_level })
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setDraft(null); await reload()
  }

  async function toggleActive(r: Room) {
    setBusy(true); await toggleRoomActive(r.id, !r.active); setBusy(false); await reload()
  }

  const Icon = isBox ? BedDouble : DoorOpen

  return (
    <div className="space-y-4" data-testid={`rooms-tab-${kind}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{isBox ? 'Leitos/boxes de internação (capacidade, status e valor da diária).' : 'Salas de cirurgia, consultório e exame.'}</p>
        <button onClick={newDraft} data-testid={`room-new-${kind}`}
          className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> {isBox ? 'Novo Box' : 'Nova Sala'}
        </button>
      </div>

      {/* Form */}
      {draft && (
        <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{draft.id ? 'Editar' : 'Novo'} {isBox ? 'Box' : 'Sala'}</h3>
            <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Nome</span>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={isBox ? 'Ex.: Box UTI 01' : 'Ex.: Sala Cirúrgica 1'}
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
            </label>
            {!isBox && (
              <label className="block">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Tipo</span>
                <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as RoomType })}
                  className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                  {SALA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Capacidade Máxima</span>
              <input type="number" min="1" step="1" value={draft.capacity} onChange={e => setDraft({ ...draft, capacity: e.target.value })}
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
            </label>
            {isBox && (
              <>
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Valor da Diária (R$)</span>
                  <input type="number" min="0" step="0.01" value={draft.daily_rate} onChange={e => setDraft({ ...draft, daily_rate: e.target.value })} placeholder="Ex.: 300,00 (fallback se não houver tarifa por categoria)"
                    className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Categoria padrão</span>
                  <select value={draft.default_care_level} onChange={e => setDraft({ ...draft, default_care_level: e.target.value as Draft['default_care_level'] })}
                    className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                    <option value="">— Sem categoria —</option>
                    <option value="enfermaria">Enfermaria</option>
                    <option value="semi_intensiva">Semi-Intensiva</option>
                    <option value="uti">UTI</option>
                    <option value="isolamento">Isolamento</option>
                  </select>
                </label>
              </>
            )}
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Status de Operação</span>
              <select value={draft.operational_status} onChange={e => setDraft({ ...draft, operational_status: e.target.value as RoomOperationalStatus })}
                className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                <option value="active">Ativo</option>
                <option value="maintenance">Em Manutenção</option>
              </select>
            </label>
          </div>
          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
          <button onClick={save} disabled={busy} data-testid={`room-save-${kind}`}
            className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
          <Icon className="h-10 w-10 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-500">{isBox ? 'Nenhum box cadastrado' : 'Nenhuma sala cadastrada'}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rooms.map(r => (
            <div key={r.id} data-testid={`room-row-${r.id}`} className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 ${r.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${r.operational_status === 'maintenance' ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-600'}`}>
                {r.operational_status === 'maintenance' ? <Wrench className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{r.name}</p>
                <p className="text-[11px] text-slate-500">
                  {TYPE_LABEL[r.type] ?? r.type} • Cap. {r.capacity}{isBox && r.daily_rate > 0 ? ` • Diária ${fmtBRL(r.daily_rate)}` : ''}
                  {r.operational_status === 'maintenance' && <span className="ml-1 text-amber-600 font-semibold">• Em manutenção</span>}
                  {!r.active && <span className="ml-1 text-slate-400 font-semibold">• Inativo</span>}
                </p>
              </div>
              <button onClick={() => editDraft(r)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => toggleActive(r)} disabled={busy} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title={r.active ? 'Inativar' : 'Reativar'}><EyeOff className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
