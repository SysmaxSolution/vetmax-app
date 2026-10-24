'use server'

// Checklist pré-operatório e kit padrão POR SERVIÇO (migration 0518).
//
// Vive separado de `stock.ts` de propósito: é configuração do centro
// cirúrgico pendurada no serviço, lida pela ficha da cirurgia, e não parte do
// estoque em si.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import type { ServiceSurgeryConfig, SurgicalServiceOption } from '@/types/service-surgery'

async function getCtx(): Promise<{ clinicId: string; role: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id as string, role: String(profile.role ?? '') }
}

function lerChecklist(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(x => String(x ?? '').trim()).filter(Boolean) : []
}

export async function getServiceSurgeryConfig(itemId: string): Promise<ServiceSurgeryConfig | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin.from('stock_items')
    .select('preop_checklist, default_kit_id')
    .eq('id', itemId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (error) return { error: mensagemErro(error, 'lib/actions/service-surgery-config.ts') }
  return {
    preop_checklist: lerChecklist(data?.preop_checklist),
    default_kit_id:  (data?.default_kit_id as string | null) ?? null,
  }
}

export async function saveServiceSurgeryConfig(itemId: string, input: ServiceSurgeryConfig): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager', 'vet'].includes(ctx.role)) return { error: 'Sem permissão para configurar o serviço.' }
  const admin = createAdminClient()

  // O kit tem de ser desta clínica — o id vem do navegador.
  let kitId: string | null = null
  if (input.default_kit_id) {
    const { data: kit } = await admin.from('service_kits').select('id').eq('id', input.default_kit_id).eq('clinic_id', ctx.clinicId).maybeSingle()
    if (!kit) return { error: 'Kit cirúrgico não encontrado nesta clínica.' }
    kitId = kit.id as string
  }

  const { error } = await admin.from('stock_items')
    .update({ preop_checklist: lerChecklist(input.preop_checklist).slice(0, 40), default_kit_id: kitId, updated_at: new Date().toISOString() })
    .eq('id', itemId).eq('clinic_id', ctx.clinicId).eq('is_service', true)
  if (error) return { error: mensagemErro(error, 'lib/actions/service-surgery-config.ts') }
  revalidatePath('/dashboard/pharmacy')
  revalidatePath('/dashboard/surgery')
  return { ok: true }
}

/** Serviços do catálogo para a tela "Nova cirurgia" (com o que cada um traz de checklist e kit). */
export async function listSurgicalServices(): Promise<SurgicalServiceOption[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin.from('stock_items')
    .select('id, name, preop_checklist, default_kit_id, kit:service_kits!default_kit_id ( name )')
    .eq('clinic_id', ctx.clinicId).eq('is_service', true).is('archived_at', null)
    .order('name').limit(400)
  if (error) return { error: mensagemErro(error, 'lib/actions/service-surgery-config.ts') }
  return (data ?? []).map(r => {
    const row = r as { id: string; name: string; preop_checklist: unknown; default_kit_id: string | null; kit: { name?: string } | { name?: string }[] | null }
    const kit = Array.isArray(row.kit) ? row.kit[0] : row.kit
    return {
      id: row.id, name: row.name,
      preop_checklist: lerChecklist(row.preop_checklist),
      default_kit_id: row.default_kit_id ?? null,
      default_kit_name: kit?.name ?? null,
    }
  })
}
