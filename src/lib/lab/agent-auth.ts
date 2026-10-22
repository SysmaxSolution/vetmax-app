// Autenticação do agente-ponte de laboratório por Bearer token (não usa cookie).
// Usada pelos route handlers /api/lab/*. Resolve o clinic_id pelo token.

import { createAdminClient } from '@/lib/supabase/admin'
import { clinicFlowFlag } from '@/lib/clinic/flow-gate'

export interface AgentAuth { clinic_id: string; agent_id: string }

export async function authenticateAgent(req: Request): Promise<AgentAuth | null> {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('lab_agents')
    .select('id, clinic_id, is_active')
    .eq('token', token)
    .maybeSingle()
  if (!data || !data.is_active) return null
  // Gate da rotina (F-3): o token do agente sozinho não basta — a clínica precisa
  // ter o Laboratório ativado (flow_config.usa_laboratorio). Fica AQUI, e não em
  // cada route handler, para que /api/lab/* futuro já nasça fechado.
  if (!(await clinicFlowFlag(admin, data.clinic_id as string, 'usa_laboratorio'))) return null
  // best-effort: marca visto agora
  const ip = req.headers.get('x-forwarded-for') || null
  await admin.from('lab_agents').update({ last_seen_at: new Date().toISOString(), last_ip: ip }).eq('id', data.id)
  return { clinic_id: data.clinic_id as string, agent_id: data.id as string }
}

/** Busca a amostra (por nº da OS = código de barras) e seus exames. Por clinic_id. */
export async function sampleByBarcode(clinicId: string, barcode: string) {
  const admin = createAdminClient()
  const code = (barcode ?? '').trim()
  if (!code) return null
  const { data: c } = await admin
    .from('consultations')
    .select('id, os_number, status, patient_id, tutor_id, patients(name, species), tutors(name)')
    .eq('clinic_id', clinicId).eq('os_number', code)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!c) return null
  const pat = Array.isArray((c as any).patients) ? (c as any).patients[0] : (c as any).patients
  const { data: svcs } = await admin
    .from('consultation_services')
    .select('name_snapshot').eq('clinic_id', clinicId).eq('consultation_id', c.id).is('cancelled_at', null)
  return {
    consultation_id: c.id as string,
    barcode: (c.os_number as string) ?? code,
    patient_name: pat?.name ?? null,
    species: pat?.species ?? null,
    exams: (svcs ?? []).map((s: any) => ({ name: s.name_snapshot })).filter((e: any) => e.name),
  }
}
