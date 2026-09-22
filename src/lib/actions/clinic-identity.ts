'use server'

/**
 * Identidade documental da clínica — server actions (tabela
 * clinic_document_identity, migration 0467, RLS por clinic_id).
 * Tipos vivem em src/lib/canva/identity.ts (módulo puro) — nunca
 * re-exportar tipos daqui (quebra as actions no Turbopack).
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DocumentIdentity } from '@/lib/canva/identity'
import { hydrateIdentity } from '@/lib/canva/identity'

async function requireClinic() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()
  if (error || !profile?.clinic_id) throw new Error('no clinic')
  return { supabase, user, profile }
}

export interface ClinicIdentityResult {
  identity: DocumentIdentity
  /** false = clínica ainda não configurou (identity = padrão). */
  configured: boolean
  updated_at: string | null
}

/** Identidade da clínica do usuário. Nunca lança — devolve o padrão. */
export async function getClinicDocumentIdentity(): Promise<ClinicIdentityResult> {
  try {
    const { supabase, profile } = await requireClinic()
    const { data } = await supabase
      .from('clinic_document_identity')
      .select('config, updated_at')
      .eq('clinic_id', profile.clinic_id)
      .maybeSingle()
    if (!data) return { identity: hydrateIdentity(null), configured: false, updated_at: null }
    return { identity: hydrateIdentity(data.config), configured: true, updated_at: data.updated_at }
  } catch {
    return { identity: hydrateIdentity(null), configured: false, updated_at: null }
  }
}

export async function saveClinicDocumentIdentity(config: DocumentIdentity): Promise<{ ok: true }> {
  const { supabase, profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode configurar a identidade documental')

  const clean = hydrateIdentity(config)
  const { error } = await supabase
    .from('clinic_document_identity')
    .upsert({
      clinic_id: profile.clinic_id,
      config: clean,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id' })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/management')
  return { ok: true }
}
