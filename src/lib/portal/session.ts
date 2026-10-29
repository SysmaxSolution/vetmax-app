// Sessão do Portal do Tutor (cookie HttpOnly próprio, sem Supabase Auth).
// Módulo server-only (usa next/headers cookies + admin client). Importado por
// server components e server actions do portal. Não é 'use server' para poder
// exportar também constantes/tipos.
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  isSessionValid, computeExpiryISO, SESSION_TTL_MS,
  allowedClinicIds, filterLinksByEnabledClinics, type LinkRow,
} from '@/lib/portal/access'

export const TUTOR_COOKIE = 'sysvet_tutor'

export interface TutorContext {
  tutorUserId: string
  fullName: string | null
  /** Vínculos VISÍVEIS — só clínicas com `flow_config.portal_enabled === true`. */
  links: LinkRow[]
  /** Há vínculo, mas nenhuma das clínicas tem o Portal ligado. Para a mensagem. */
  portalDisabled: boolean
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * Dentre as clínicas informadas, quais têm a rotina do Portal ligada.
 * Leitura ESTRITA (`=== true`): chave ausente = desligada.
 */
export async function portalEnabledClinicIds(admin: Admin, clinicIds: string[]): Promise<string[]> {
  if (clinicIds.length === 0) return []
  try {
    const { data } = await admin.from('clinics').select('id, flow_config').in('id', clinicIds)
    return (data ?? [])
      .filter((c: any) => ((c.flow_config ?? {}) as Record<string, unknown>).portal_enabled === true)
      .map((c: any) => c.id as string)
  } catch {
    return []   // fail-closed: na dúvida, o Portal não abre
  }
}

/** Resolve a sessão do tutor a partir do cookie. Retorna null se ausente/inválida. */
export async function getTutorContext(): Promise<TutorContext | null> {
  const jar = await cookies()
  const token = jar.get(TUTOR_COOKIE)?.value
  if (!token) return null

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('tutor_sessions')
    .select('id, tutor_user_id, expires_at, revoked_at')
    .eq('session_token', token)
    .maybeSingle()
  if (!session) return null
  if (!isSessionValid(session as any, new Date().toISOString())) return null

  const [{ data: user }, { data: links }] = await Promise.all([
    admin.from('tutor_users').select('full_name').eq('id', session.tutor_user_id).maybeSingle(),
    admin.from('tutor_user_links').select('tutor_id, clinic_id').eq('tutor_user_id', session.tutor_user_id),
  ])

  // best-effort: marca atividade e RENOVA a validade (sessão deslizante — o tutor
  // permanece logado enquanto usar o portal e o cadastro estiver ativo).
  const nowISO = new Date().toISOString()
  await admin.from('tutor_sessions').update({
    last_seen_at: nowISO,
    expires_at: computeExpiryISO(nowISO, SESSION_TTL_MS),
  }).eq('id', session.id)

  // Gate da rotina: a sessão pode ser válida e MESMO ASSIM a clínica não usar o
  // Portal. Antes deste filtro, um tutor com sessão entrava em /portal e via o
  // pet de uma clínica com `portal_enabled` desligado (achado F-1 do QA).
  // O filtro é por clínica — vínculo com outra clínica que usa o Portal continua
  // funcionando normalmente.
  const rawLinks: LinkRow[] = (links ?? []).map((l: any) => ({ tutor_id: l.tutor_id, clinic_id: l.clinic_id }))
  const enabled = await portalEnabledClinicIds(admin, allowedClinicIds(rawLinks))
  const visibleLinks = filterLinksByEnabledClinics(rawLinks, enabled)

  return {
    tutorUserId: session.tutor_user_id as string,
    fullName: (user as any)?.full_name ?? null,
    links: visibleLinks,
    portalDisabled: rawLinks.length > 0 && visibleLinks.length === 0,
  }
}
