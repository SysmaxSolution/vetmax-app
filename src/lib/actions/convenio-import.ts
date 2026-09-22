'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMatchEngine } from '@/lib/actions/petlove-matching'
import { parseConvenioCsv, type ColumnMapping } from '@/lib/finance/convenio-csv'

type Ctx = { userId: string; clinicId: string; role: string }
async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { userId: user.id, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? '' }
}

async function findOrCreateProvider(admin: ReturnType<typeof createAdminClient>, clinicId: string, name: string): Promise<string> {
  const { data: existing } = await admin.from('insurance_providers').select('id').eq('clinic_id', clinicId).ilike('name', name).maybeSingle()
  if ((existing as any)?.id) return (existing as any).id
  const { data } = await admin.from('insurance_providers').insert({ clinic_id: clinicId, name, plan_types: [], contact_info: {}, is_active: true }).select('id').single()
  return (data as any).id
}

/** Só lê os cabeçalhos do CSV para a UI montar o de-para de colunas. */
export async function previewConvenioHeaders(csvText: string): Promise<{ headers: string[] } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  const r = parseConvenioCsv(csvText)
  if ('error' in r) return { error: r.error }
  return { headers: r.headers }
}

/**
 * Importa um demonstrativo de convênio (genérico) e roda o motor de match.
 * Reusa as tabelas petlove_remittances/lines (agnósticas ao convênio) e o
 * runMatchEngine já existente. Prepara a conferência do AVA.
 */
export async function importConvenioRemittance(input: {
  providerName: string
  remittanceNumber: string
  periodStart?: string
  periodEnd?: string
  csvText: string
  mapping: ColumnMapping
}): Promise<{ ok: true; remittanceId: string; lines: number; matched: number; orphan: number } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const parsed = parseConvenioCsv(input.csvText, input.mapping)
  if ('error' in parsed) return { error: parsed.error }
  if (parsed.lines.length === 0) return { error: 'Nenhuma linha reconhecida no arquivo.' }

  const admin = createAdminClient()
  const providerId = await findOrCreateProvider(admin, c.clinicId, input.providerName.trim() || 'Convênio')

  // bloqueia reimportação do mesmo número
  const { data: dupe } = await admin.from('petlove_remittances')
    .select('id').eq('clinic_id', c.clinicId).eq('provider_id', providerId).eq('remittance_number', input.remittanceNumber).maybeSingle()
  if ((dupe as any)?.id) return { error: 'Demonstrativo com este número já foi importado.' }

  const total = parsed.lines.reduce((s, l) => s + l.repass_value, 0)
  const dates = parsed.lines.map(l => l.service_date).filter(Boolean).sort()
  const { data: rem, error: remErr } = await admin.from('petlove_remittances').insert({
    clinic_id: c.clinicId, provider_id: providerId, remittance_number: input.remittanceNumber,
    period_start: input.periodStart || dates[0] || null, period_end: input.periodEnd || dates[dates.length - 1] || null,
    status: 'imported', is_preview: false, source_format: 'closed',
    total_service_value: total, referral_bonus_value: 0, credit_adjustment: 0, debit_adjustment: 0, total_gross_value: total,
    raw_summary: { imported_via: 'convenio_csv', provider: input.providerName }, imported_by: c.userId, imported_at: new Date().toISOString(),
  }).select('id').single()
  if (remErr) return { error: 'Falha ao criar demonstrativo: ' + remErr.message }
  const remittanceId = (rem as any).id

  const linesPayload = parsed.lines.map(l => ({
    clinic_id: c.clinicId, remittance_id: remittanceId,
    external_appointment_id: l.external_appointment_id, service_date: l.service_date,
    tutor_name_raw: l.tutor_name_raw, pet_name_raw: l.pet_name_raw, procedure_name_raw: l.procedure_name_raw,
    veterinarian_raw: l.veterinarian_raw, microchip_raw: l.microchip_raw, plan_name_raw: l.plan_name_raw,
    repass_value: l.repass_value, coparticipation_value: l.coparticipation_value, match_status: 'pending',
  }))
  const { error: linErr } = await admin.from('petlove_remittance_lines').insert(linesPayload)
  if (linErr) return { error: 'Falha ao gravar linhas: ' + linErr.message }

  const match = await runMatchEngine(remittanceId)
  const matched = 'error' in match ? 0 : match.matched
  const orphan = 'error' in match ? 0 : match.orphan
  return { ok: true, remittanceId, lines: parsed.lines.length, matched, orphan }
}
