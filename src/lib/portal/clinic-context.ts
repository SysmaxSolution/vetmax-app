// Contexto de CLÍNICA no Portal do Tutor. Lógica PURA, sem I/O.
//
// O portal nasceu "um login, todos os pets": a URL era só `/portal` e a lista
// misturava as clínicas. Com o white-label isso deixou de servir — a mesma
// pessoa pode ser tutora na clínica A e na B, e cada uma tem a sua identidade.
// A partir daqui a URL carrega a clínica (`/portal/c/<slug>`).
//
// REGRA DE OURO: o contexto da URL só pode RESTRINGIR, nunca ampliar. Ele é
// aplicado DEPOIS do filtro de vínculos (`links`), e o par exato
// (tutor_id, clinic_id) de `canAccessPatient` continua sendo a última palavra.

import type { LinkRow } from '@/lib/portal/access'
import { isValidClinicSlug } from '@/lib/portal/theme'

export interface ClinicSlugRow {
  id: string
  portal_slug: string | null
}

export type PortalClinicResolution =
  | { ok: true; clinicId: string }
  | { ok: false; reason: 'invalid' | 'unknown' }

/**
 * slug → clinic_id, olhando SOMENTE as clínicas às quais a pessoa está
 * vinculada. Uma clínica que existe mas não é dela responde exatamente como
 * uma que não existe (`unknown`): a mensagem não revela a diferença.
 */
export function resolvePortalClinic(
  slug: string | null | undefined,
  clinics: ClinicSlugRow[],
  links: LinkRow[],
): PortalClinicResolution {
  if (!isValidClinicSlug(slug)) return { ok: false, reason: 'invalid' }
  const linked = new Set(links.map(l => l.clinic_id))
  const hit = clinics.find(c => c.portal_slug === slug && linked.has(c.id))
  if (!hit) return { ok: false, reason: 'unknown' }
  return { ok: true, clinicId: hit.id }
}

/** Vínculos restritos a UMA clínica — a base de tudo que o contexto mostra. */
export function linksForClinic(links: LinkRow[], clinicId: string): LinkRow[] {
  return links.filter(l => l.clinic_id === clinicId)
}

/**
 * Para onde `/portal` (link antigo, sem contexto) deve levar:
 *  - nenhum vínculo visível → fica onde está (tela de aviso/login);
 *  - exatamente um         → entra direto no contexto daquela clínica;
 *  - vários                → seletor.
 * É a garantia de retrocompatibilidade dos links já enviados aos tutores.
 */
export type PortalEntryDecision =
  | { kind: 'empty' }
  | { kind: 'redirect'; clinicId: string }
  | { kind: 'select'; clinicIds: string[] }

export function decidePortalEntry(links: LinkRow[]): PortalEntryDecision {
  const ids = Array.from(new Set(links.map(l => l.clinic_id)))
  if (ids.length === 0) return { kind: 'empty' }
  if (ids.length === 1) return { kind: 'redirect', clinicId: ids[0] }
  return { kind: 'select', clinicIds: ids }
}

/** Caminho canônico do portal de uma clínica. */
export function portalClinicPath(slug: string, sub = ''): string {
  const tail = sub ? (sub.startsWith('/') ? sub : `/${sub}`) : ''
  return `/portal/c/${slug}${tail}`
}
