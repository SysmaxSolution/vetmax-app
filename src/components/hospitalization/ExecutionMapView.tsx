'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { Printer, Pill, Biohazard, Clock, FlaskConical, Stethoscope, Utensils, ClipboardList } from 'lucide-react'
import { medicationTickStore } from '@/lib/medication-tick'
import type { HospitalizationCard } from '@/lib/actions/hospitalizations'
import type { HospPrescription } from '@/lib/actions/hospitalization-prescriptions'
import type { HospTask, TaskKind } from '@/lib/actions/hospitalization-tasks'

/**
 * Mapa de Execução Visual (Internação Completa).
 *
 * Grade horária do dia: cada prescrição ativa vira uma linha com os horários
 * de dose previstos para hoje, coloridos por estado (aplicado/atrasado/pendente).
 * Inclui geração de uma "folha de internação" imprimível para a enfermagem
 * assinar à mão.
 *
 * O estado deriva de `Date.now()` + `last_applied_at` (sem next_dose_at no
 * banco) e re-renderiza no mesmo tick de 15s do scheduler.
 */

type SlotStatus = 'done' | 'overdue' | 'imminent' | 'pending'

interface Slot {
  at:     Date
  status: SlotStatus
}

const IMMINENT_MS = 10 * 60 * 1000

function dayBounds(now: number): { start: number; end: number } {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
  return { start, end: start + 24 * 3_600_000 }
}

/** Item agendável genérico — medicação (last_applied_at) ou tarefa (last_done_at). */
interface Schedulable {
  status:          string
  frequency_hours: number | null
  started_at:      string
  duration_hours:  number | null
  lastAt:          string | null
}

// Linha unificada da grade: medicação ou tarefa de enfermagem.
type LineType = 'med' | 'task'
interface Line {
  id:       string
  type:     LineType
  taskKind?: TaskKind
  name:     string
  sub:      string
  slots:    Slot[]
  single:   boolean   // SOS / tarefa única (sem grade fixa)
}

function computeSlots(p: Schedulable, now: number): Slot[] {
  if (p.status !== 'active') return []
  if (p.frequency_hours === null || p.frequency_hours <= 0) return [] // SOS / única — sem grade fixa

  const startedAt = new Date(p.started_at).getTime()
  const freqMs    = p.frequency_hours * 3_600_000
  const lastApplied = p.lastAt ? new Date(p.lastAt).getTime() : null
  const { start, end } = dayBounds(now)

  // Fim do ciclo, se houver duração definida.
  const endsAt = p.duration_hours !== null ? startedAt + p.duration_hours * 3_600_000 : Infinity

  // Primeiro slot do dia: alinhado à cadência a partir de started_at.
  let k = Math.ceil((start - startedAt) / freqMs)
  if (k < 0) k = 0
  const slots: Slot[] = []
  for (let t = startedAt + k * freqMs; t <= end && t <= endsAt; t += freqMs) {
    if (t < start) continue
    let status: SlotStatus
    if (lastApplied !== null && t <= lastApplied + 60_000) {
      status = 'done'
    } else if (t <= now) {
      status = 'overdue'
    } else if (t - now <= IMMINENT_MS) {
      status = 'imminent'
    } else {
      status = 'pending'
    }
    slots.push({ at: new Date(t), status })
    if (slots.length > 48) break // guarda de segurança
  }
  return slots
}

const SLOT_STYLE: Record<SlotStatus, string> = {
  done:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  overdue:  'bg-rose-100 text-rose-700 border-rose-300 font-bold',
  imminent: 'bg-amber-100 text-amber-700 border-amber-300',
  pending:  'bg-slate-50 text-slate-500 border-slate-200',
}

function fmt(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const TASK_KIND_LABEL: Record<TaskKind, string> = { exam: 'Exame', procedure: 'Procedimento', feeding: 'Alimentação', other: 'Tarefa' }

function TaskIcon({ kind }: { kind: TaskKind }) {
  const cls = 'h-3.5 w-3.5'
  if (kind === 'exam')      return <FlaskConical className={`${cls} text-sky-500`} />
  if (kind === 'procedure') return <Stethoscope  className={`${cls} text-amber-500`} />
  if (kind === 'feeding')   return <Utensils     className={`${cls} text-emerald-500`} />
  return <ClipboardList className={`${cls} text-slate-400`} />
}

// Constrói as linhas da grade unificando medicações e tarefas de enfermagem.
function buildLines(prescriptions: HospPrescription[], tasks: HospTask[], now: number): Line[] {
  const lines: Line[] = []
  for (const p of prescriptions.filter(x => x.status === 'active')) {
    const single = p.frequency_hours === null || p.frequency_hours <= 0
    lines.push({
      id: p.id, type: 'med', name: p.medication_name,
      sub: [[p.dose, p.route].filter(Boolean).join(' • '), single ? 'SOS' : `${p.frequency_hours}/${p.frequency_hours}h`].filter(Boolean).join(' • '),
      slots: computeSlots({ status: p.status, frequency_hours: p.frequency_hours, started_at: p.started_at, duration_hours: p.duration_hours, lastAt: p.last_applied_at }, now),
      single,
    })
  }
  for (const t of tasks.filter(x => x.status === 'active')) {
    const single = t.frequency_hours === null || t.frequency_hours <= 0
    lines.push({
      id: t.id, type: 'task', taskKind: t.kind, name: t.description,
      sub: [TASK_KIND_LABEL[t.kind], single ? 'única' : `${t.frequency_hours}/${t.frequency_hours}h`].join(' • '),
      slots: computeSlots({ status: t.status, frequency_hours: t.frequency_hours, started_at: t.started_at, duration_hours: t.duration_hours, lastAt: t.last_done_at }, now),
      single,
    })
  }
  return lines
}

interface Props {
  cards:               HospitalizationCard[]
  prescriptionsByHosp: Map<string, HospPrescription[]>
  tasksByHosp?:        Map<string, HospTask[]>
  /** Clique numa linha: 'med' abre a tela de medicações; 'task' abre a aba Tarefas do card. */
  onLineClick?:        (card: HospitalizationCard, type: LineType) => void
}

export default function ExecutionMapView({ cards, prescriptionsByHosp, tasksByHosp, onLineClick }: Props) {
  // Re-render a cada tick (15s) para recalcular os estados dos slots.
  useSyncExternalStore(
    medicationTickStore.subscribe,
    medicationTickStore.getSnapshot,
    medicationTickStore.getServerSnapshot,
  )

  const now = Date.now()

  const rows = useMemo(() => {
    return cards
      .map(card => ({
        card,
        lines: buildLines(prescriptionsByHosp.get(card.id) ?? [], tasksByHosp?.get(card.id) ?? [], now),
      }))
      .filter(r => r.lines.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, prescriptionsByHosp, tasksByHosp, medicationTickStore.getSnapshot()])

  function handlePrint() {
    printExecutionSheet(rows, now)
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
        <Clock className="h-10 w-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-500">Sem prescrições ou tarefas ativas</p>
        <p className="text-xs text-slate-400 mt-1">Medicações e tarefas (exames, procedimentos, alimentação) com aprazamento aparecem aqui em grade horária.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-400" /> Aplicado</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-rose-400" /> Atrasado</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400" /> Chegando</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-slate-300" /> Pendente</span>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Printer className="h-3.5 w-3.5" /> Imprimir folha
        </button>
      </div>

      <div className="space-y-4">
        {rows.map(({ card, lines }) => (
          <div
            key={card.id}
            className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${
              card.isolation_required ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'
            }`}
          >
            <div className={`px-4 py-2.5 flex items-center justify-between ${card.isolation_required ? 'bg-rose-50' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{card.patient.name}</span>
                <span className="text-[11px] text-slate-500 uppercase">{card.patient.species} • {card.patient.breed || 'SRD'}</span>
              </div>
              {card.isolation_required && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full">
                  <Biohazard className="h-3 w-3" /> Isolamento — EPI
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-50">
              {lines.map(line => (
                <div
                  key={`${line.type}-${line.id}`}
                  onClick={onLineClick ? () => onLineClick(card, line.type) : undefined}
                  className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 ${onLineClick ? 'cursor-pointer hover:bg-violet-50/50 transition-colors' : ''}`}
                  data-testid={line.type === 'task' ? `map-task-${line.id}` : `map-med-${line.id}`}
                  title={onLineClick ? (line.type === 'med' ? 'Abrir medicações' : 'Abrir tarefas') : undefined}
                >
                  <div className="sm:w-56 flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      {line.type === 'med' ? <Pill className="h-3.5 w-3.5 text-violet-500" /> : <TaskIcon kind={line.taskKind!} />} {line.name}
                    </p>
                    <p className="text-[11px] text-slate-500">{line.sub}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {line.slots.length === 0 ? (
                      <span className="text-[11px] text-violet-600 font-semibold">{line.single ? (line.type === 'task' ? 'Tarefa única' : 'SOS / dose única') : '—'}</span>
                    ) : line.slots.map((s, i) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded-md border text-[11px] tabular-nums ${SLOT_STYLE[s.status]}`}
                        title={s.status}
                      >
                        {fmt(s.at)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Folha de internação imprimível ──────────────────────────────────────────

function printExecutionSheet(
  rows: { card: HospitalizationCard; lines: Line[] }[],
  now: number,
) {
  const dateLabel = new Date(now).toLocaleDateString('pt-BR')
  const body = rows.map(({ card, lines }) => {
    const iso = card.isolation_required
      ? '<span style="color:#b91c1c;font-weight:bold"> ⚠ ISOLAMENTO (EPI)</span>' : ''
    const presRows = lines.map(line => {
      const times = line.slots.length === 0
        ? (line.single ? (line.type === 'task' ? 'Tarefa única' : 'SOS / dose única') : '—')
        : line.slots.map(s => `${fmt(s.at)} ☐`).join('&nbsp;&nbsp;')
      const tipo = line.type === 'task' ? (TASK_KIND_LABEL[line.taskKind!] ?? 'Tarefa') : 'Medicação'
      return `<tr>
        <td style="padding:4px 6px;border:1px solid #e2e8f0;font-weight:bold">${line.name}</td>
        <td style="padding:4px 6px;border:1px solid #e2e8f0">${tipo}${line.sub ? ` — ${line.sub}` : ''}</td>
        <td style="padding:4px 6px;border:1px solid #e2e8f0">${times}</td>
      </tr>`
    }).join('')
    return `
      <h3 style="margin:14px 0 4px;font-size:13px">${card.patient.name} — ${card.patient.species}${card.patient.breed ? ' / ' + card.patient.breed : ''}${iso}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:4px 6px;border:1px solid #e2e8f0;text-align:left">Item</th>
          <th style="padding:4px 6px;border:1px solid #e2e8f0;text-align:left">Tipo / Detalhe</th>
          <th style="padding:4px 6px;border:1px solid #e2e8f0;text-align:left">Horários (☐ = assinar ao executar)</th>
        </tr></thead>
        <tbody>${presRows}</tbody>
      </table>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>Folha de Internação — ${dateLabel}</title></head>
    <body style="font-family:Arial,sans-serif;color:#1e293b;padding:24px">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #7c3aed;padding-bottom:8px;margin-bottom:8px">
        <div style="font-size:16px;font-weight:bold;color:#7c3aed">Mapa de Execução — Internação</div>
        <div style="font-size:11px;color:#64748b">${dateLabel}</div>
      </div>
      ${body || '<p style="color:#94a3b8">Sem prescrições ativas.</p>'}
      <div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px;color:#94a3b8;font-size:9px">
        SysVetMax — folha de plantão. Assine cada dose ao administrar.
      </div>
    </body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Permita pop-ups para imprimir a folha.'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 250)
}
