'use client'

import { useState } from 'react'
import { Plus, Loader2, DoorOpen, ToggleLeft, ToggleRight, Pencil, Check, X } from 'lucide-react'
import { createRoom, updateRoom, toggleRoomActive, type Room, type RoomType } from '@/lib/actions/rooms'

const ROOM_TYPE_OPTIONS: { value: RoomType; label: string; color: string }[] = [
  { value: 'consultation',    label: 'Consultório',  color: 'bg-blue-100 text-blue-700' },
  { value: 'surgery',         label: 'Cirurgia',     color: 'bg-red-100 text-red-700' },
  { value: 'grooming',        label: 'Banho e Tosa', color: 'bg-purple-100 text-purple-700' },
  { value: 'exam',            label: 'Exames',       color: 'bg-amber-100 text-amber-700' },
  { value: 'hospitalization', label: 'Internação',   color: 'bg-orange-100 text-orange-700' },
]

interface Props {
  initialRooms: Room[]
}

export default function RoomsTab({ initialRooms }: Props) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New room form
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<RoomType>('consultation')
  const [newCapacity, setNewCapacity] = useState('1')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<RoomType>('consultation')

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)

    const result = await createRoom(newName.trim(), newType, parseInt(newCapacity) || 1)
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
    } else {
      setRooms(prev => [...prev, {
        id: result.id,
        clinic_id: '',
        name: newName.trim(),
        type: newType,
        capacity: parseInt(newCapacity) || 1,
        active: true,
        daily_rate: 0,
        operational_status: 'active',
        default_care_level: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      setNewName('')
      setNewType('consultation')
      setNewCapacity('1')
      setShowForm(false)
    }
  }

  async function handleToggle(id: string, active: boolean) {
    const result = await toggleRoomActive(id, !active)
    if (!('error' in result)) {
      setRooms(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r))
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    const result = await updateRoom(id, { name: editName.trim(), type: editType })
    setSaving(false)

    if (!('error' in result)) {
      setRooms(prev => prev.map(r => r.id === id ? { ...r, name: editName.trim(), type: editType } : r))
      setEditingId(null)
    }
  }

  function startEdit(room: Room) {
    setEditingId(room.id)
    setEditName(room.name)
    setEditType(room.type as RoomType)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
            <DoorOpen className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Salas / Boxes</h2>
            <p className="text-xs text-slate-500">Gerencie os espaços de atendimento</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Sala
        </button>
      </div>

      {/* New Room Form */}
      {showForm && (
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nome *</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: Sala 1, Box A..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as RoomType)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {ROOM_TYPE_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Capacidade</label>
              <input
                type="number"
                min="1"
                value={newCapacity}
                onChange={e => setNewCapacity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Room List */}
      <div className="divide-y divide-slate-100">
        {rooms.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <DoorOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhuma sala cadastrada</p>
          </div>
        ) : (
          rooms.map(room => {
            const typeInfo = ROOM_TYPE_OPTIONS.find(t => t.value === room.type) ?? ROOM_TYPE_OPTIONS[0]

            if (editingId === room.id) {
              return (
                <div key={room.id} className="px-6 py-3 flex items-center gap-3 bg-teal-50/40">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 rounded-lg border border-teal-300 px-3 py-1.5 text-sm focus:outline-none"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(room.id); if (e.key === 'Escape') setEditingId(null) }}
                  />
                  <select
                    value={editType}
                    onChange={e => setEditType(e.target.value as RoomType)}
                    className="rounded-lg border border-teal-300 px-2 py-1.5 text-xs"
                  >
                    {ROOM_TYPE_OPTIONS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <button onClick={() => handleSaveEdit(room.id)} disabled={saving} className="text-teal-600 hover:text-teal-800">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            }

            return (
              <div key={room.id} className={`px-6 py-3 flex items-center justify-between gap-4 ${!room.active ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <DoorOpen className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-900 truncate">{room.name}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  {room.capacity > 1 && (
                    <span className="text-[10px] text-slate-400">{room.capacity} vagas</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(room)} className="text-slate-400 hover:text-teal-600 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleToggle(room.id, room.active)} className="transition-colors">
                    {room.active
                      ? <ToggleRight className="h-5 w-5 text-teal-600" />
                      : <ToggleLeft className="h-5 w-5 text-slate-300" />
                    }
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
