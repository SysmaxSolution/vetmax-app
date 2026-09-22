// Lógica PURA de isolamento do Portal do Tutor. Sem I/O. É o coração da
// segurança multi-clínica: garante que a pessoa logada só acessa os pets dos
// (tutor_id, clinic_id) que lhe foram VINCULADOS — nunca por CPF solto, nunca
// cruzando clínicas. Testada isoladamente (inclusive o caso CPF em 2 clínicas).

export function normalizeCpf(cpf: string | null | undefined): string {
  return (cpf ?? '').replace(/\D/g, '')
}

export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

export interface LinkRow {
  tutor_id: string
  clinic_id: string
}

/** IDs de tutor (por clínica) que a pessoa pode enxergar. */
export function allowedTutorIds(links: LinkRow[]): string[] {
  return Array.from(new Set(links.map(l => l.tutor_id)))
}

export function allowedClinicIds(links: LinkRow[]): string[] {
  return Array.from(new Set(links.map(l => l.clinic_id)))
}

/**
 * Um pet é acessível SOMENTE se existe um vínculo com o MESMO tutor_id E a MESMA
 * clinic_id do pet. Casar só por tutor_id (ou só por clinic_id) vazaria entre
 * clínicas quando o mesmo CPF é tutor em mais de uma.
 */
export function canAccessPatient(
  patientTutorId: string | null | undefined,
  patientClinicId: string | null | undefined,
  links: LinkRow[],
): boolean {
  if (!patientTutorId || !patientClinicId) return false
  return links.some(l => l.tutor_id === patientTutorId && l.clinic_id === patientClinicId)
}

/** Filtra uma lista de pets deixando só os acessíveis pela pessoa. */
export function filterAccessiblePatients<T extends { tutor_id?: string | null; clinic_id?: string | null }>(
  patients: T[],
  links: LinkRow[],
): T[] {
  return patients.filter(p => canAccessPatient(p.tutor_id, p.clinic_id, links))
}

// ── Validade de token de login (uso único) ───────────────────────────────────
export interface LoginTokenLike { expires_at: string; consumed_at: string | null }

export type TokenInvalidReason = 'consumed' | 'expired'

export function checkLoginToken(
  tok: LoginTokenLike,
  nowISO: string,
): { ok: boolean; reason?: TokenInvalidReason } {
  if (tok.consumed_at) return { ok: false, reason: 'consumed' }
  if (new Date(tok.expires_at).getTime() <= new Date(nowISO).getTime()) return { ok: false, reason: 'expired' }
  return { ok: true }
}

// ── Validade de sessão ────────────────────────────────────────────────────────
export interface SessionLike { expires_at: string; revoked_at: string | null }

export function isSessionValid(s: SessionLike, nowISO: string): boolean {
  if (s.revoked_at) return false
  return new Date(s.expires_at).getTime() > new Date(nowISO).getTime()
}

export function computeExpiryISO(nowISO: string, ms: number): string {
  return new Date(new Date(nowISO).getTime() + ms).toISOString()
}

export const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000        // 30 min
export const SESSION_TTL_MS     = 30 * 24 * 60 * 60 * 1000 // 30 dias
