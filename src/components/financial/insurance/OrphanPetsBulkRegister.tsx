'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckSquare, Square, PawPrint, Loader2, CheckCircle2, AlertCircle, UserPlus, Users } from 'lucide-react'
import { bulkCreatePatientsFromPetlove, type RemittanceLineRow } from '@/lib/actions/petlove-matching'

interface OrphanPetGroup {
  key:          string
  rep_line_id:  string   // representative line.id (used for bulkCreate call)
  pet_name:     string
  tutor_name:   string
  species:      string
  breed:        string | null
  plan_name:    string | null
  microchip:    string | null
  line_ids:     string[] // all lines belonging to this pet
  total_value:  number
  service_dates: string[]
}

function groupLinesByPet(lines: RemittanceLineRow[]): OrphanPetGroup[] {
  const groups = new Map<string, OrphanPetGroup>()
  for (const l of lines) {
    const chip = (l.microchip_raw ?? '').replace(/^#/, '').trim()
    const key = chip || `${(l.pet_name_raw ?? '').toLowerCase()}|${(l.tutor_name_raw ?? '').toLowerCase()}`
    if (!key) continue
    const existing = groups.get(key)
    if (existing) {
      existing.line_ids.push(l.id)
      existing.total_value += Number(l.repass_value)
      if (!existing.service_dates.includes(l.service_date)) existing.service_dates.push(l.service_date)
    } else {
      groups.set(key, {
        key,
        rep_line_id:  l.id,
        pet_name:     l.pet_name_raw ?? '(sem nome)',
        tutor_name:   l.tutor_name_raw ?? '(sem tutor)',
        species:      l.species_raw ?? '?',
        breed:        l.breed_raw,
        plan_name:    l.plan_name_raw,
        microchip:    chip || null,
        line_ids:     [l.id],
        total_value:  Number(l.repass_value),
        service_dates: [l.service_date],
      })
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.pet_name.localeCompare(b.pet_name, 'pt-BR'))
}

type CreateResult = {
  created_patients: number
  created_tutors: number
  created_pet_insurance: number
  reused_tutors: number
  errors: string[]
}

export default function OrphanPetsBulkRegister({
  lines,
  onComplete,
}: {
  lines: RemittanceLineRow[]
  onComplete?: () => void
}) {
  const groups = useMemo(() => groupLinesByPet(lines), [lines])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<CreateResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const allSelected = groups.length > 0 && selected.size === groups.length

  function toggle(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key); else next.add(key)
    setSelected(next)
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(groups.map(g => g.key)))
  }

  function handleBulk(scope: 'selected' | 'all') {
    const targetGroups = scope === 'all' ? groups : groups.filter(g => selected.has(g.key))
    if (targetGroups.length === 0) {
      setErrorMsg('Selecione pelo menos um pet.')
      return
    }
    setErrorMsg(null)
    setResult(null)

    // Envia 1 line.id por grupo (representante) — a server action propaga para as demais linhas do mesmo pet
    const repLineIds = targetGroups.map(g => g.rep_line_id)

    startTransition(async () => {
      const res = await bulkCreatePatientsFromPetlove(repLineIds)
      if ('error' in res) {
        setErrorMsg(res.error)
        return
      }
      setResult(res)
      // Após 2.5s recarrega para refletir as linhas reclassificadas
      setTimeout(() => onComplete?.(), 2500)
    })
  }

  if (groups.length === 0) {
    return (
      <>
        <header className="px-5 py-4 border-b border-purple-200 bg-purple-50">
          <h2 className="font-semibold text-purple-900 flex items-center gap-2">
            <PawPrint className="h-4 w-4" />
            Pets na Planilha Não Cadastrados no Sistema
          </h2>
        </header>
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">Todos os pets desta remessa já estão cadastrados.</p>
          <p className="text-xs text-slate-400 mt-1">Nenhuma ação necessária aqui.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <header className="px-5 py-4 border-b border-purple-200 bg-purple-50 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-purple-900 flex items-center gap-2">
            <PawPrint className="h-4 w-4" />
            Pets na Planilha Não Cadastrados no Sistema
          </h2>
          <p className="text-xs text-purple-600 mt-0.5">
            {groups.length} pet{groups.length !== 1 ? 's' : ''} novo{groups.length !== 1 ? 's' : ''}
            {' · '}
            cadastro rápido cria tutor + pet + vínculo Petlove em 1 clique
          </p>
        </div>
      </header>

      {/* Ações */}
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={toggleAll}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 disabled:opacity-50"
        >
          {allSelected ? <CheckSquare className="h-4 w-4 text-purple-600" /> : <Square className="h-4 w-4" />}
          {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
          <span className="text-xs text-slate-400 ml-1">({selected.size}/{groups.length})</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleBulk('selected')}
            disabled={isPending || selected.size === 0}
            className="inline-flex items-center gap-1.5 bg-white border border-purple-300 text-purple-700 hover:bg-purple-50 font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Cadastrar Selecionados ({selected.size})
          </button>
          <button
            onClick={() => handleBulk('all')}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Cadastrar Todos ({groups.length})
          </button>
        </div>
      </div>

      {/* Feedback */}
      {errorMsg && (
        <div className="mx-5 mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">{errorMsg}</p>
        </div>
      )}
      {result && (
        <div className="mx-5 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-semibold">Cadastros realizados:</p>
            <ul className="text-xs mt-1 space-y-0.5">
              <li>• {result.created_patients} pet{result.created_patients !== 1 ? 's' : ''} novo{result.created_patients !== 1 ? 's' : ''}</li>
              <li>• {result.created_tutors} tutor{result.created_tutors !== 1 ? 'es' : ''} novo{result.created_tutors !== 1 ? 's' : ''} ({result.reused_tutors} reaproveitado{result.reused_tutors !== 1 ? 's' : ''})</li>
              <li>• {result.created_pet_insurance} vínculo{result.created_pet_insurance !== 1 ? 's' : ''} Petlove ativado{result.created_pet_insurance !== 1 ? 's' : ''}</li>
              {result.errors.length > 0 && (
                <li className="text-rose-700">⚠ {result.errors.length} erro{result.errors.length !== 1 ? 's' : ''}: {result.errors.slice(0, 2).join('; ')}</li>
              )}
            </ul>
            <p className="text-xs text-emerald-600 mt-1">Recarregando a tela…</p>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-2 text-left w-10"></th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Pet</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Tutor</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Plano</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 text-xs uppercase tracking-wide">Microchip</th>
              <th className="px-2 py-2 text-right font-medium text-slate-500 text-xs uppercase tracking-wide">Atend.</th>
              <th className="px-5 py-2 text-right font-medium text-slate-500 text-xs uppercase tracking-wide">Repasse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map(g => {
              const checked = selected.has(g.key)
              return (
                <tr
                  key={g.key}
                  onClick={() => toggle(g.key)}
                  className={`cursor-pointer transition-colors ${checked ? 'bg-purple-50' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-5 py-3">
                    {checked
                      ? <CheckSquare className="h-4 w-4 text-purple-600" />
                      : <Square className="h-4 w-4 text-slate-300" />}
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-slate-800">{g.pet_name}</p>
                    <p className="text-xs text-slate-500">
                      {g.species}{g.breed ? ` · ${g.breed}` : ''}
                    </p>
                  </td>
                  <td className="px-2 py-3 text-slate-700">{g.tutor_name}</td>
                  <td className="px-2 py-3">
                    {g.plan_name ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                        <PawPrint className="h-2.5 w-2.5" />
                        {g.plan_name}
                      </span>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-2 py-3 text-xs text-slate-500 font-mono">
                    {g.microchip ? `#${g.microchip}` : <span className="text-slate-300">sem chip</span>}
                  </td>
                  <td className="px-2 py-3 text-right text-sm text-slate-600 font-mono tabular-nums">{g.line_ids.length}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-slate-900 font-mono tabular-nums">
                    {g.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="px-5 py-3 bg-slate-50 border-t border-slate-100">
        <p className="text-[11px] text-slate-500">
          Cadastros rápidos são marcados com <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-purple-700 text-[10px]">created_from=petlove_import</code> para revisão posterior.
          CPF e telefone recebem placeholders.
        </p>
      </footer>
    </>
  )
}
