// Sessão do Portal do Parceiro (vet solicitante). Cookie próprio, separado do
// tutor e da equipe. Server-only.
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSessionValid, computeExpiryISO, SESSION_TTL_MS } from '@/lib/portal/access'

export const PARTNER_COOKIE = 'sysvet_parceiro'

export interface PartnerContext {
  kind: 'admin' | 'professional'
  partnerClinicId: string
  professionalId: string | null
  clinicId: string
  name: string
}

export async function getPartnerContext(): Promise<PartnerContext | null> {
  const jar = await cookies()
  const token = jar.get(PARTNER_COOKIE)?.value
  if (!token) return null
  const admin = createAdminClient()
  const { data: s } = await admin
    .from('partner_clinic_sessions')
    .select('id, kind, partner_clinic_id, professional_id, clinic_id, expires_at, revoked_at')
    .eq('session_token', token).maybeSingle()
  if (!s || !isSessionValid(s as any, new Date().toISOString())) return null

  // nome para exibição
  let name = 'Clínica parceira'
  if ((s as any).professional_id) {
    const { data: p } = await admin.from('partner_clinic_professionals').select('name').eq('id', (s as any).professional_id).maybeSingle()
    name = (p as any)?.name ?? name
  } else {
    const { data: pc } = await admin.from('partner_clinics').select('name').eq('id', (s as any).partner_clinic_id).maybeSingle()
    name = (pc as any)?.name ?? name
  }

  const nowISO = new Date().toISOString()
  await admin.from('partner_clinic_sessions').update({ last_seen_at: nowISO, expires_at: computeExpiryISO(nowISO, SESSION_TTL_MS) }).eq('id', (s as any).id)

  return {
    kind: (s as any).kind, partnerClinicId: (s as any).partner_clinic_id,
    professionalId: (s as any).professional_id ?? null, clinicId: (s as any).clinic_id, name,
  }
}
