'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CatalogPackage = {
  id:           string
  clinic_id:    string
  name:         string
  description:  string | null
  price:        number
  interval_days: number
  total_sessions: number
  default_professional_id: string | null
  active:       boolean
  created_at:   string
  updated_at:   string
  items?:       PackageItem[]
}

export type PackageItem = {
  id:         string
  package_id: string
  item_type:  'product' | 'service'
  item_id:    string
  quantity:   number
  stock_item?: {
    id:       string
    name:     string
    unit:     string
    unit_price: number
    is_service: boolean
  }
}

export type PatientActivePackage = {
  id:         string
  clinic_id:  string
  pet_id:     string
  package_id: string
  status:     'active' | 'completed' | 'cancelled'
  price_paid: number | null
  started_at: string
  created_at: string
  package?:   CatalogPackage
  sessions?:  PackageSession[]
  sessions_total?:     number
  sessions_remaining?: number
  sessions_used?:      number
  sessions_scheduled?: number
}

export type PackageSessionInfo = {
  session_number:            number
  total_sessions:            number
  package_name:              string
  patient_active_package_id: string
  is_last:                   boolean
}

export type PackageSession = {
  id:                        string
  patient_active_package_id: string
  appointment_id:            string | null
  status:                    'pending' | 'used' | 'cancelled'
  session_number:            number
  scheduled_for:             string | null
  used_at:                   string | null
  created_at:                string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return null
  return { supabase, clinic_id: profile.clinic_id, role: profile.role }
}

// ─── Catalog CRUD ─────────────────────────────────────────────────────────────

export async function listCatalogPackages(): Promise<CatalogPackage[] | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('catalog_packages')
    .select(`
      id, clinic_id, name, description, price, interval_days, total_sessions,
      default_professional_id, active, created_at, updated_at,
      items:package_items(
        id, package_id, item_type, item_id, quantity,
        stock_item:stock_items(id, name, unit, unit_price, is_service)
      )
    `)
    .eq('clinic_id', ctx.clinic_id)
    .order('name', { ascending: true })

  if (error) return { error: 'Erro ao listar pacotes: ' + error.message }
  return (data ?? []) as unknown as CatalogPackage[]
}

export type UpsertPackagePayload = {
  id?:          string
  name:         string
  description?: string
  price:        number
  interval_days: number
  total_sessions: number
  default_professional_id?: string | null
  active?:      boolean
  items: { item_type: 'product' | 'service'; item_id: string; quantity: number }[]
}

export async function upsertCatalogPackage(
  payload: UpsertPackagePayload
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const isEdit = !!payload.id

  const pkgData = {
    clinic_id:               ctx.clinic_id,
    name:                    payload.name.trim(),
    description:             payload.description?.trim() ?? null,
    price:                   payload.price,
    interval_days:           payload.interval_days,
    total_sessions:          payload.total_sessions,
    default_professional_id: payload.default_professional_id ?? null,
    active:                  payload.active ?? true,
  }

  let pkgId: string

  if (isEdit) {
    const { error } = await ctx.supabase
      .from('catalog_packages')
      .update(pkgData)
      .eq('id', payload.id!)
      .eq('clinic_id', ctx.clinic_id)
    if (error) return { error: 'Erro ao atualizar pacote: ' + error.message }
    pkgId = payload.id!
    // Redelete items e recria
    await ctx.supabase.from('package_items').delete().eq('package_id', pkgId)
  } else {
    const { data, error } = await ctx.supabase
      .from('catalog_packages')
      .insert(pkgData)
      .select('id')
      .single()
    if (error) return { error: 'Erro ao criar pacote: ' + error.message }
    pkgId = data.id
  }

  if (payload.items.length > 0) {
    const { error: itemsError } = await ctx.supabase
      .from('package_items')
      .insert(
        payload.items.map(item => ({
          package_id: pkgId,
          item_type:  item.item_type,
          item_id:    item.item_id,
          quantity:   item.quantity,
        }))
      )
    if (itemsError) return { error: 'Erro ao salvar itens: ' + itemsError.message }
  }

  revalidatePath('/dashboard/pharmacy')
  return { id: pkgId }
}

export async function togglePackageActive(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data: pkg } = await ctx.supabase
    .from('catalog_packages')
    .select('active')
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)
    .single()

  if (!pkg) return { error: 'Pacote não encontrado.' }

  const { error } = await ctx.supabase
    .from('catalog_packages')
    .update({ active: !pkg.active })
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao alterar status: ' + error.message }
  revalidatePath('/dashboard/pharmacy')
  return { ok: true }
}

export async function deleteCatalogPackage(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { error } = await ctx.supabase
    .from('catalog_packages')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: 'Erro ao excluir pacote: ' + error.message }
  revalidatePath('/dashboard/pharmacy')
  return { ok: true }
}

// ─── Contrato (venda do pacote para um pet) ───────────────────────────────────

export async function sellPackageToPet(payload: {
  pet_id:     string
  package_id: string
  price_paid?: number
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  // Usa total_sessions do catálogo (campo canônico)
  const { data: pkgInfo } = await ctx.supabase
    .from('catalog_packages')
    .select('total_sessions')
    .eq('id', payload.package_id)
    .single()

  const totalSessions = pkgInfo?.total_sessions ?? 1

  const { data, error } = await ctx.supabase
    .from('patient_active_packages')
    .insert({
      clinic_id:  ctx.clinic_id,
      pet_id:     payload.pet_id,
      package_id: payload.package_id,
      price_paid: payload.price_paid ?? null,
      status:     'active',
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao criar contrato: ' + error.message }

  // Gera sessões individuais (pending)
  if (totalSessions > 0) {
    const sessions = Array.from({ length: totalSessions }, (_, i) => ({
      patient_active_package_id: data.id,
      session_number:            i + 1,
      status:                    'pending' as const,
    }))
    await ctx.supabase.from('patient_package_sessions').insert(sessions)
  }

  revalidatePath('/dashboard/reception')
  return { id: data.id }
}

// ─── Sessões restantes de um pet ─────────────────────────────────────────────

export async function getPetActivePackages(
  petId: string
): Promise<PatientActivePackage[] | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('patient_active_packages')
    .select(`
      id, clinic_id, pet_id, package_id, status, price_paid, started_at, created_at,
      package:catalog_packages(id, name, description, price, interval_days),
      sessions:patient_package_sessions(id, status, session_number, scheduled_for, used_at)
    `)
    .eq('pet_id', petId)
    .eq('clinic_id', ctx.clinic_id)
    .eq('status', 'active')

  if (error) return { error: 'Erro ao buscar pacotes do pet: ' + error.message }

  const result = (data ?? []) as unknown as PatientActivePackage[]
  return result.map(pap => {
    const sessions = pap.sessions ?? []
    return {
      ...pap,
      sessions_total:     sessions.length,
      sessions_remaining: sessions.filter(s => s.status === 'pending').length,
    }
  })
}

// ─── Marcar sessão como usada (com webhook log para WhatsApp) ─────────────────

export async function usePackageSession(
  sessionId: string,
  appointmentId?: string
): Promise<{ ok: true; sessionsRemaining: number } | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data: session, error: fetchErr } = await ctx.supabase
    .from('patient_package_sessions')
    .select('id, patient_active_package_id, status, session_number')
    .eq('id', sessionId)
    .single()

  if (fetchErr || !session) return { error: 'Sessão não encontrada.' }
  if (session.status !== 'pending') return { error: 'Sessão já utilizada ou cancelada.' }

  const { error } = await ctx.supabase
    .from('patient_package_sessions')
    .update({ status: 'used', used_at: new Date().toISOString(), appointment_id: appointmentId ?? null })
    .eq('id', sessionId)

  if (error) return { error: 'Erro ao registrar sessão: ' + error.message }

  // Conta restantes
  const { count: remaining } = await ctx.supabase
    .from('patient_package_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('patient_active_package_id', session.patient_active_package_id)
    .eq('status', 'pending')

  const sessionsRemaining = remaining ?? 0

  // Fase 4: Log de gatilho WhatsApp
  if (sessionsRemaining === 0) {
    console.log('[Smart Packages] Disparar WhatsApp: Renovação de Pacote', {
      patient_active_package_id: session.patient_active_package_id,
    })
    // Marca contrato como completed
    await ctx.supabase
      .from('patient_active_packages')
      .update({ status: 'completed' })
      .eq('id', session.patient_active_package_id)
  } else {
    console.log('[Smart Packages] Disparar WhatsApp: Agendar próxima sessão', {
      patient_active_package_id: session.patient_active_package_id,
      sessions_remaining: sessionsRemaining,
    })
  }

  return { ok: true, sessionsRemaining: sessionsRemaining as number }
}

// ─── Agendar uma sessão (scheduled) ──────────────────────────────────────────

export async function schedulePackageSession(payload: {
  patient_active_package_id: string
  scheduled_for: string       // ISO datetime
  appointment_id?: string
}): Promise<{ ok: true; sessionsRemaining: number; isLast: boolean } | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  // Pega a próxima sessão pending
  const { data: session } = await ctx.supabase
    .from('patient_package_sessions')
    .select('id')
    .eq('patient_active_package_id', payload.patient_active_package_id)
    .eq('status', 'pending')
    .order('session_number', { ascending: true })
    .limit(1)
    .single()

  if (!session) return { error: 'Nenhuma sessão pendente encontrada.' }

  const { error } = await ctx.supabase
    .from('patient_package_sessions')
    .update({
      status:        'used',
      used_at:       payload.scheduled_for,
      appointment_id: payload.appointment_id ?? null,
    })
    .eq('id', session.id)

  if (error) return { error: 'Erro ao agendar sessão: ' + error.message }

  // Verifica se foi a última
  const { count: remaining } = await ctx.supabase
    .from('patient_package_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('patient_active_package_id', payload.patient_active_package_id)
    .eq('status', 'pending')

  const sessionsRemaining = remaining ?? 0
  const isLast = sessionsRemaining === 0

  if (isLast) {
    await ctx.supabase.from('patient_active_packages').update({ status: 'completed' }).eq('id', payload.patient_active_package_id)

    // Dispara WhatsApp de renovação
    try {
      const { data: pap } = await ctx.supabase
        .from('patient_active_packages')
        .select('pet_id, package:catalog_packages(name)')
        .eq('id', payload.patient_active_package_id)
        .single()
      if (pap) {
        const { data: patient } = await ctx.supabase.from('patients').select('name, tutor_id').eq('id', pap.pet_id).single()
        if (patient) {
          const { data: tutor } = await ctx.supabase.from('tutors').select('id, name, phone').eq('id', patient.tutor_id).single()
          const pkgName = (pap.package as any)?.name ?? 'pacote'
          if (tutor?.phone) {
            const { sendWhatsAppMessage } = await import('@/lib/actions/whatsapp')
            await sendWhatsAppMessage({
              phone: tutor.phone,
              message: `Olá, ${tutor.name}! 🐾\nO pacote *${pkgName}* de *${patient.name}* foi concluído hoje. Gostaríamos de renovar e garantir a continuidade do atendimento! Entre em contato para reagendar. 😊`,
              trigger: 'package_renewal',
              tutorId: tutor.id,
              tutorName: tutor.name,
            })
          }
        }
      }
    } catch { /* best-effort */ }
  }

  return { ok: true as const, sessionsRemaining, isLast }
}

// ─── Vincular appointment à próxima sessão pendente (sem consumir) ────────────

export async function linkSessionToAppointment(
  patientActivePackageId: string,
  appointmentId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data: session } = await ctx.supabase
    .from('patient_package_sessions')
    .select('id')
    .eq('patient_active_package_id', patientActivePackageId)
    .eq('status', 'pending')
    .is('appointment_id', null)
    .order('session_number', { ascending: true })
    .limit(1)
    .single()

  if (!session) return { error: 'Nenhuma sessão disponível para vincular.' }

  const { error } = await ctx.supabase
    .from('patient_package_sessions')
    .update({ appointment_id: appointmentId })
    .eq('id', session.id)

  if (error) return { error: 'Erro ao vincular sessão: ' + error.message }
  return { ok: true }
}

// ─── Resumo de pacotes do pet (histórico) ─────────────────────────────────────

export async function getPetPackageSummary(
  petId: string
): Promise<PatientActivePackage[] | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data, error } = await ctx.supabase
    .from('patient_active_packages')
    .select(`
      id, clinic_id, pet_id, package_id, status, price_paid, started_at, created_at,
      package:catalog_packages(id, name, description, price, interval_days, total_sessions),
      sessions:patient_package_sessions(id, status, session_number, scheduled_for, used_at, appointment_id)
    `)
    .eq('pet_id', petId)
    .eq('clinic_id', ctx.clinic_id)
    .in('status', ['active', 'completed'])
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) return { error: 'Erro ao buscar resumo de pacotes: ' + error.message }

  const result = (data ?? []) as unknown as (PatientActivePackage & { sessions: (PackageSession & { appointment_id: string | null })[] })[]
  return result.map(pap => {
    const sessions = pap.sessions ?? []
    return {
      ...pap,
      sessions_total:     sessions.length,
      sessions_used:      sessions.filter(s => s.status === 'used').length,
      sessions_scheduled: sessions.filter(s => s.status === 'pending' && s.appointment_id).length,
      sessions_remaining: sessions.filter(s => s.status === 'pending' && !s.appointment_id).length,
    }
  })
}

// ─── Info de pacote por lista de appointmentIds (para agenda/calendário) ──────

export async function getPackageInfoForAppointments(
  appointmentIds: string[]
): Promise<Record<string, PackageSessionInfo> | { error: string }> {
  if (appointmentIds.length === 0) return {}
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data: sessions } = await ctx.supabase
    .from('patient_package_sessions')
    .select(`
      appointment_id,
      session_number,
      patient_active_package_id,
      pap:patient_active_packages(
        package:catalog_packages(name, total_sessions)
      )
    `)
    .in('appointment_id', appointmentIds)

  if (!sessions?.length) return {}

  const map: Record<string, PackageSessionInfo> = {}
  for (const s of sessions) {
    if (!s.appointment_id) continue
    const pkg   = (s.pap as any)?.package
    const total = pkg?.total_sessions ?? 1
    map[s.appointment_id] = {
      session_number:            s.session_number,
      total_sessions:            total,
      package_name:              pkg?.name ?? '—',
      patient_active_package_id: s.patient_active_package_id,
      is_last:                   s.session_number === total,
    }
  }
  return map
}

// ─── Mapa appointmentId → info de sessão de pacote (para timeline) ────────────

export async function getPackageSessionsMap(
  petId: string
): Promise<Record<string, PackageSessionInfo> | { error: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { data: paps } = await ctx.supabase
    .from('patient_active_packages')
    .select('id, package:catalog_packages(name, total_sessions)')
    .eq('pet_id', petId)
    .eq('clinic_id', ctx.clinic_id)

  if (!paps?.length) return {}

  const papIds = paps.map(p => p.id)

  const { data: sessions } = await ctx.supabase
    .from('patient_package_sessions')
    .select('appointment_id, session_number, patient_active_package_id')
    .in('patient_active_package_id', papIds)
    .not('appointment_id', 'is', null)

  if (!sessions?.length) return {}

  const map: Record<string, PackageSessionInfo> = {}
  for (const s of sessions) {
    if (!s.appointment_id) continue
    const pap      = paps.find(p => p.id === s.patient_active_package_id) as any
    const pkg      = pap?.package
    const total    = pkg?.total_sessions ?? 1
    map[s.appointment_id] = {
      session_number:            s.session_number,
      total_sessions:            total,
      package_name:              pkg?.name ?? '—',
      patient_active_package_id: s.patient_active_package_id,
      is_last:                   s.session_number === total,
    }
  }
  return map
}
