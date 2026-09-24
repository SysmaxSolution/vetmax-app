'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Ctx = { userId: string; clinicId: string; role: string }
async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { userId: user.id, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? '' }
}

export interface Analyte { id: string; code: string; name: string; unit: string | null; panel: string | null }
export interface Mapping { id: string; deviceCode: string | null; deviceName: string | null; analyteId: string; analyteName: string }
export interface UnmappedCode { code: string | null; name: string; unit: string | null; count: number }

export async function listAnalytes(): Promise<Analyte[]> {
  const c = await ctx(); if ('error' in c) return []
  const admin = createAdminClient()
  const { data } = await admin.from('exam_analytes')
    .select('id, code, name, unit, panel').eq('clinic_id', c.clinicId).eq('is_active', true)
    .order('panel', { ascending: true }).order('sort_order', { ascending: true }).order('name', { ascending: true })
  return (data ?? []).map((a: any) => ({ id: a.id, code: a.code, name: a.name, unit: a.unit ?? null, panel: a.panel ?? null }))
}

export async function upsertAnalyte(input: { id?: string; code: string; name: string; unit?: string; panel?: string }): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!['admin', 'owner', 'manager', 'vet'].includes(c.role)) return { error: 'Sem permissão.' }
  if (!input.code.trim() || !input.name.trim()) return { error: 'Código e nome são obrigatórios.' }
  const admin = createAdminClient()
  const rec = { clinic_id: c.clinicId, code: input.code.trim().toUpperCase(), name: input.name.trim(), unit: input.unit?.trim() || null, panel: input.panel?.trim() || null }
  if (input.id) {
    const { error } = await admin.from('exam_analytes').update(rec).eq('id', input.id).eq('clinic_id', c.clinicId)
    return error ? { error: error.message } : { ok: true }
  }
  const { error } = await admin.from('exam_analytes').upsert(rec, { onConflict: 'clinic_id,code' })
  return error ? { error: error.message } : { ok: true }
}

export async function deleteAnalyte(id: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  const admin = createAdminClient()
  await admin.from('exam_analytes').update({ is_active: false }).eq('id', id).eq('clinic_id', c.clinicId)
  return { ok: true }
}

export async function listMappings(): Promise<Mapping[]> {
  const c = await ctx(); if ('error' in c) return []
  const admin = createAdminClient()
  const { data } = await admin.from('lab_analyte_mappings')
    .select('id, device_code, device_name, analyte_id, exam_analytes!analyte_id ( name )')
    .eq('clinic_id', c.clinicId).order('created_at', { ascending: false })
  return (data ?? []).map((m: any) => ({
    id: m.id, deviceCode: m.device_code ?? null, deviceName: m.device_name ?? null,
    analyteId: m.analyte_id, analyteName: (Array.isArray(m.exam_analytes) ? m.exam_analytes[0] : m.exam_analytes)?.name ?? '—',
  }))
}

export async function upsertMapping(input: { deviceCode?: string; deviceName?: string; analyteId: string }): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!['admin', 'owner', 'manager', 'vet'].includes(c.role)) return { error: 'Sem permissão.' }
  if (!input.analyteId) return { error: 'Selecione o analito do catálogo.' }
  if (!input.deviceCode?.trim() && !input.deviceName?.trim()) return { error: 'Informe o código ou nome que o aparelho envia.' }
  const admin = createAdminClient()
  const { error } = await admin.from('lab_analyte_mappings').insert({
    clinic_id: c.clinicId, device_code: input.deviceCode?.trim() || null, device_name: input.deviceName?.trim() || null, analyte_id: input.analyteId,
  })
  return error ? { error: error.message } : { ok: true }
}

export async function deleteMapping(id: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  const admin = createAdminClient()
  await admin.from('lab_analyte_mappings').delete().eq('id', id).eq('clinic_id', c.clinicId)
  return { ok: true }
}

/** Códigos recebidos dos aparelhos que ainda não têm de-para (auto-descoberta). */
export async function listUnmappedCodes(): Promise<UnmappedCode[]> {
  const c = await ctx(); if ('error' in c) return []
  const admin = createAdminClient()
  const { data } = await admin.from('exam_results')
    .select('analyte_code, analyte_name, unit').eq('clinic_id', c.clinicId).is('analyte_id', null).eq('source', 'hl7')
    .limit(1000)
  const agg = new Map<string, UnmappedCode>()
  for (const r of (data ?? []) as any[]) {
    const key = `${r.analyte_code ?? ''}|${r.analyte_name ?? ''}`
    const cur = agg.get(key) ?? { code: r.analyte_code ?? null, name: r.analyte_name ?? '—', unit: r.unit ?? null, count: 0 }
    cur.count += 1; agg.set(key, cur)
  }
  return Array.from(agg.values()).sort((a, b) => b.count - a.count)
}

/** Semeia analitos comuns (hemograma + bioquímico) para começar. */
export async function seedDefaultAnalytes(): Promise<{ ok: true; created: number } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!['admin', 'owner', 'manager', 'vet'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const seed = [
    ['WBC', 'Leucócitos', '10³/µL', 'Hemograma'], ['RBC', 'Hemácias', '10⁶/µL', 'Hemograma'],
    ['HGB', 'Hemoglobina', 'g/dL', 'Hemograma'], ['HCT', 'Hematócrito', '%', 'Hemograma'],
    ['PLT', 'Plaquetas', '10³/µL', 'Hemograma'], ['MCV', 'VCM', 'fL', 'Hemograma'],
    ['NEU', 'Neutrófilos', '%', 'Hemograma'], ['LYM', 'Linfócitos', '%', 'Hemograma'],
    ['ALT', 'ALT (TGP)', 'U/L', 'Bioquímico'], ['AST', 'AST (TGO)', 'U/L', 'Bioquímico'],
    ['CREA', 'Creatinina', 'mg/dL', 'Bioquímico'], ['UREA', 'Ureia', 'mg/dL', 'Bioquímico'],
    ['GLU', 'Glicose', 'mg/dL', 'Bioquímico'], ['ALB', 'Albumina', 'g/dL', 'Bioquímico'],
    ['FA', 'Fosfatase Alcalina', 'U/L', 'Bioquímico'], ['TP', 'Proteínas Totais', 'g/dL', 'Bioquímico'],
  ]
  const rows = seed.map(([code, name, unit, panel], i) => ({ clinic_id: c.clinicId, code, name, unit, panel, sort_order: i }))
  const { error } = await admin.from('exam_analytes').upsert(rows, { onConflict: 'clinic_id,code', ignoreDuplicates: true })
  return error ? { error: error.message } : { ok: true, created: rows.length }
}
