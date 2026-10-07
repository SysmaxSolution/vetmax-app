// Resolução do contexto de clínica do Portal do Tutor, com I/O.
//
// Server-only e NÃO `'use server'` (precisa exportar tipos — ver
// feedback_use_server_type_reexports).
//
// Embrulhado em `cache()` do React porque o layout e a página do mesmo ramo
// pedem o mesmo contexto na mesma requisição; sem isso seriam duas rodadas de
// consulta por tela.

import { cache } from 'react'
import { getTutorContext, type TutorContext } from '@/lib/portal/session'
import { allowedClinicIds, canAccessPatient } from '@/lib/portal/access'
import { resolvePortalClinic, linksForClinic } from '@/lib/portal/clinic-context'
import { loadClinicSlugs, loadPortalBrand, loadPetOwnership, type PortalBrand } from '@/lib/portal/brand-server'
import type { LinkRow } from '@/lib/portal/access'

export type PortalContextResult =
  | { ok: true; tutor: TutorContext; clinicId: string; links: LinkRow[]; brand: PortalBrand; multiClinic: boolean }
  | { ok: false; reason: 'auth' | 'disabled' | 'unknown'; tutor: TutorContext | null }

/**
 * Dado o slug da URL, devolve o contexto ou a recusa.
 *
 * Ordem deliberada — a URL entra por ÚLTIMO:
 *   1. sessão válida?                          (`auth`)
 *   2. alguma clínica do vínculo usa o Portal? (`disabled`)
 *   3. o slug aponta para uma clínica VINCULADA A ESTA PESSOA? (`unknown`)
 *
 * O passo 3 só consulta clínicas que já estão em `tutor.links`, então um slug de
 * clínica alheia é indistinguível de um slug inexistente — a URL nunca amplia
 * acesso, e nem serve de oráculo para descobrir quais clínicas existem.
 */
export const resolvePortalContext = cache(async (slug: string): Promise<PortalContextResult> => {
  const tutor = await getTutorContext()
  if (!tutor) return { ok: false, reason: 'auth', tutor: null }
  if (tutor.portalDisabled || tutor.links.length === 0) return { ok: false, reason: 'disabled', tutor }

  const clinics = await loadClinicSlugs(allowedClinicIds(tutor.links))
  const res = resolvePortalClinic(slug, clinics, tutor.links)
  if (!res.ok) return { ok: false, reason: 'unknown', tutor }

  const brand = await loadPortalBrand(res.clinicId)
  return {
    ok: true,
    tutor,
    clinicId: res.clinicId,
    links: linksForClinic(tutor.links, res.clinicId),
    brand,
    multiClinic: allowedClinicIds(tutor.links).length > 1,
  }
})

/**
 * Contexto da tela `/portal/pet/<id>` (link antigo, sem slug). O pet pertence a
 * exatamente UMA clínica, então o contexto é inequívoco — basta descobrir de
 * quem ele é. Continua sem decidir acesso: isso é do `getPortalPetDetail`.
 */
export const resolvePetBrand = cache(async (petId: string): Promise<{
  tutor: TutorContext | null; brand: PortalBrand | null; multiClinic: boolean
}> => {
  const tutor = await getTutorContext()
  if (!tutor) return { tutor: null, brand: null, multiClinic: false }

  const own = await loadPetOwnership(petId)
  const multiClinic = allowedClinicIds(tutor.links).length > 1
  if (!canAccessPatient(own.tutorId, own.clinicId, tutor.links)) return { tutor, brand: null, multiClinic }

  return { tutor, brand: await loadPortalBrand(own.clinicId as string), multiClinic }
})
