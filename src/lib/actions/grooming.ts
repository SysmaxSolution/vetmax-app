'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroomingStatus =
  | 'received'
  | 'grooming'
  | 'bathing'
  | 'waiting_pickup'
  | 'delivered'

export type GroomingCatalogItem = {
  id:    string
  name:  string
  price: number
}

export type GroomingServicePrice = {
  name:  string
  price: number
}

export type GroomingCard = {
  id:                 string
  clinic_id:          string
  patient_id:         string
  tutor_id:           string
  status:             GroomingStatus
  services_requested: string[]
  box_number:         string | null
  notes:              string | null
  scheduled_at:       string | null
  started_at:         string | null
  completed_at:       string | null
  created_at:         string
  // Pricing (migration 0040)
  price_total:        number | null
  service_prices:     GroomingServicePrice[]
  discount_percent:   number
  payment_status:     'pending' | 'paid' | 'waived'
  patient: {
    id:            string
    name:          string
    species:       string
    breed:         string | null
    photo_url:     string | null
    behavior_tags: string[]
  }
  tutor: {
    name:  string
    phone: string | null
  }
}

export type GroomingBoard = {
  scheduled:      GroomingCard[]   // scheduled_at no futuro, status = received
  received:       GroomingCard[]
  bathing:        GroomingCard[]
  grooming:       GroomingCard[]
  waiting_pickup: GroomingCard[]
  delivered:      GroomingCard[]
}

export type GroomingRecord = {
  id:                  string
  session_id:          string
  clinic_id:           string
  voice_transcription: string | null
  services_applied:    string[]
  products_used:       string[]
  behavior:            string | null
  observations:        string | null
  user_name:           string
  created_at:          string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ClinicCtx = {
  supabase:  Awaited<ReturnType<typeof createClient>>
  user:      { id: string }
  clinicId:  string
  userName:  string
}

async function getClinicAndUser(): Promise<ClinicCtx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, full_name')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  return { supabase, user, clinicId: profile.clinic_id, userName: profile.full_name as string }
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

export async function getGroomingBoard(): Promise<GroomingBoard | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx

  const { supabase, clinicId } = ctx

  // Show today's sessions + all non-delivered active ones
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('grooming_sessions')
    .select(`
      id, clinic_id, patient_id, tutor_id, status, services_requested,
      box_number, notes, scheduled_at, started_at, completed_at, created_at,
      price_total, service_prices, discount_percent, payment_status,
      patients ( id, name, species, breed, photo_url, behavior_tags,
        tutors ( name, phone )
      )
    `)
    .eq('clinic_id', clinicId)
    .or(`status.neq.delivered,created_at.gte.${today.toISOString()}`)
    .neq('current_status', 'cancelled')
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar sessões: ' + error.message }

  const now = new Date()
  const board: GroomingBoard = {
    scheduled:      [],
    received:       [],
    bathing:        [],
    grooming:       [],
    waiting_pickup: [],
    delivered:      [],
  }

  for (const s of data ?? []) {
    const p = s.patients as any
    const t = p?.tutors as any
    const card: GroomingCard = {
      id:                 s.id,
      clinic_id:          s.clinic_id,
      patient_id:         s.patient_id,
      tutor_id:           s.tutor_id,
      status:             s.status as GroomingStatus,
      services_requested: Array.isArray(s.services_requested) ? s.services_requested : [],
      box_number:         s.box_number ?? null,
      notes:              s.notes ?? null,
      scheduled_at:       s.scheduled_at ?? null,
      started_at:         s.started_at ?? null,
      completed_at:       s.completed_at ?? null,
      created_at:         s.created_at,
      price_total:        s.price_total ?? null,
      service_prices:     Array.isArray(s.service_prices) ? s.service_prices : [],
      discount_percent:   s.discount_percent ?? 0,
      payment_status:     (s.payment_status ?? 'pending') as 'pending' | 'paid' | 'waived',
      patient: {
        id:            p?.id ?? '',
        name:          p?.name ?? '—',
        species:       p?.species ?? '',
        breed:         p?.breed ?? null,
        photo_url:     p?.photo_url ?? null,
        behavior_tags: Array.isArray(p?.behavior_tags) ? p.behavior_tags : [],
      },
      tutor: {
        name:  t?.name ?? '—',
        phone: t?.phone ?? null,
      },
    }

    // Sessões agendadas no futuro (scheduled_at > agora, ainda não iniciadas)
    const isScheduledFuture =
      s.status === 'received' &&
      s.scheduled_at &&
      new Date(s.scheduled_at) > now

    if (isScheduledFuture) {
      board.scheduled.push(card)
    } else if (s.status in board) {
      board[s.status as keyof GroomingBoard].push(card)
    }
  }

  return board
}

// ─── Criar Sessão (Check-in de Banho e Tosa) ─────────────────────────────────

export async function createGroomingSession(data: {
  patient_id:         string
  tutor_id:           string
  services_requested: string[]
  box_number?:        string
  notes?:             string
  scheduled_at?:      string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase, clinicId, user } = ctx

  if (!data.services_requested.length) return { error: 'Selecione ao menos um serviço.' }

  const { data: session, error } = await supabase
    .from('grooming_sessions')
    .insert({
      clinic_id:          clinicId,
      patient_id:         data.patient_id,
      tutor_id:           data.tutor_id,
      services_requested: data.services_requested,
      box_number:         data.box_number ?? null,
      notes:              data.notes ?? null,
      scheduled_at:       data.scheduled_at ?? null,
      status:             'received',
      created_by:         user.id,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao criar sessão: ' + error.message }

  revalidatePath('/dashboard/grooming')
  revalidatePath('/dashboard/reception/calendar')
  return { id: session.id }
}

// ─── Cancelar Sessão ──────────────────────────────────────────────────────────

export async function cancelGroomingSession(
  sessionId: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { error } = await supabase
    .from('grooming_sessions')
    .update({ current_status: 'cancelled' })
    .eq('id', sessionId)
    .eq('clinic_id', clinicId)
    .in('status', ['received'])           // só cancela se ainda não iniciou
    .is('started_at', null)               // proteção extra: não cancelar em andamento

  if (error) return { error: 'Erro ao cancelar: ' + error.message }

  revalidatePath('/dashboard/grooming')
  revalidatePath('/dashboard/reception/calendar')
  return { success: true }
}

// ─── Atualizar Status ─────────────────────────────────────────────────────────

// Mapeamento status (coluna 0032) → current_status (coluna 0043)
const STATUS_TO_CURRENT: Record<GroomingStatus, string> = {
  received:       'arrived',
  bathing:        'bathing',
  grooming:       'grooming',
  waiting_pickup: 'waiting_pickup',
  delivered:      'delivered',
}

export async function updateGroomingStatus(
  sessionId: string,
  status:     GroomingStatus,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const patch: Record<string, unknown> = {
    status,
    current_status: STATUS_TO_CURRENT[status] ?? status,
  }
  if (status === 'grooming')   patch.started_at   = new Date().toISOString()
  if (status === 'delivered')  patch.completed_at = new Date().toISOString()

  const { error } = await supabase
    .from('grooming_sessions')
    .update(patch)
    .eq('id', sessionId)

  if (error) return { error: 'Erro ao atualizar status: ' + error.message }

  revalidatePath('/dashboard/grooming')
  return { success: true }
}

// ─── Adicionar Registro de Evolução ──────────────────────────────────────────

export async function addGroomingRecord(data: {
  session_id:          string
  voice_transcription?: string
  services_applied:    string[]
  products_used:       string[]
  behavior?:           string
  observations?:       string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase, clinicId, user, userName } = ctx

  const { data: record, error } = await supabase
    .from('grooming_records')
    .insert({
      session_id:          data.session_id,
      clinic_id:           clinicId,
      voice_transcription: data.voice_transcription ?? null,
      services_applied:    data.services_applied,
      products_used:       data.products_used,
      behavior:            data.behavior ?? null,
      observations:        data.observations ?? null,
      user_name:           userName,
      created_by:          user.id,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao salvar registro: ' + error.message }

  revalidatePath('/dashboard/grooming')
  return { id: record.id }
}

// ─── Documentos / Fotos ───────────────────────────────────────────────────────

export type GroomingDocument = {
  id:           string
  session_id:   string
  clinic_id:    string
  file_name:    string
  file_type:    'image' | 'pdf' | 'other'
  storage_path: string
  user_name:    string
  created_at:   string
}

export async function getGroomingDocuments(
  sessionId: string,
): Promise<GroomingDocument[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const { data, error } = await supabase
    .from('grooming_documents')
    .select('id, session_id, clinic_id, file_name, file_type, storage_path, user_name, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar documentos: ' + error.message }
  return (data ?? []) as GroomingDocument[]
}

export async function saveGroomingDocument(data: {
  session_id:   string
  file_name:    string
  file_type:    'image' | 'pdf' | 'other'
  storage_path: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase, clinicId, user, userName } = ctx

  const { data: doc, error } = await supabase
    .from('grooming_documents')
    .insert({
      session_id:   data.session_id,
      clinic_id:    clinicId,
      file_name:    data.file_name,
      file_type:    data.file_type,
      storage_path: data.storage_path,
      user_name:    userName,
      created_by:   user.id,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao salvar documento: ' + error.message }
  return { id: doc.id }
}

export async function deleteGroomingDocument(
  docId:       string,
  storagePath: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  await supabase.storage.from('grooming-documents').remove([storagePath])

  const { error } = await supabase
    .from('grooming_documents')
    .delete()
    .eq('id', docId)

  if (error) return { error: 'Erro ao remover documento: ' + error.message }
  return { success: true }
}

// ─── Catálogo de Serviços de Grooming ────────────────────────────────────────

export async function getGroomingCatalog(): Promise<GroomingCatalogItem[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('clinic_catalog')
    .select('id, name, price')
    .eq('clinic_id', clinicId)
    .eq('item_type', 'grooming')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) return { error: 'Erro ao buscar catálogo: ' + error.message }
  return (data ?? []) as GroomingCatalogItem[]
}

// ─── Atualizar Pricing da Sessão ──────────────────────────────────────────────

export async function updateGroomingPricing(
  sessionId:       string,
  servicePrices:   GroomingServicePrice[],
  discountPercent: number = 0,
): Promise<{ success: true; price_total: number } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const subtotal    = servicePrices.reduce((sum, s) => sum + s.price, 0)
  const price_total = subtotal * (1 - discountPercent / 100)

  const { error } = await supabase
    .from('grooming_sessions')
    .update({ service_prices: servicePrices, discount_percent: discountPercent, price_total })
    .eq('id', sessionId)

  if (error) return { error: 'Erro ao atualizar preço: ' + error.message }

  revalidatePath('/dashboard/grooming')
  return { success: true, price_total }
}

// ─── Marcar Sessão como Paga / Isenta ────────────────────────────────────────

export async function updateGroomingPaymentStatus(
  sessionId:     string,
  paymentStatus: 'pending' | 'paid' | 'waived',
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  const { error } = await supabase
    .from('grooming_sessions')
    .update({ payment_status: paymentStatus })
    .eq('id', sessionId)

  if (error) return { error: 'Erro ao atualizar pagamento: ' + error.message }

  revalidatePath('/dashboard/grooming')
  return { success: true }
}

// ─── Confirmar Chegada de Sessão Agendada ─────────────────────────────────────

export async function confirmGroomingArrival(
  sessionId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase } = ctx

  // Zera scheduled_at → card sai de "Agendados" e vai para "Recebido"
  const { error } = await supabase
    .from('grooming_sessions')
    .update({
      scheduled_at: null,
      started_at:   new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (error) return { error: 'Erro ao confirmar chegada: ' + error.message }

  revalidatePath('/dashboard/grooming')
  return { success: true }
}

// ─── Caixa: Sessões de Grooming com Pagamento Pendente ───────────────────────

export type PendingGroomingPayment = {
  id:                string
  patient_name:      string
  patient_species:   string
  tutor_name:        string
  tutor_phone:       string | null
  services_requested: string[]
  price_total:       number
  discount_percent:  number
  status:            GroomingStatus
  created_at:        string
}

export async function getPendingGroomingSessions(): Promise<PendingGroomingPayment[] | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('grooming_sessions')
    .select(`
      id, status, services_requested, price_total, discount_percent, created_at,
      patients ( name, species, tutors ( name, phone ) )
    `)
    .eq('clinic_id', clinicId)
    .eq('payment_status', 'pending')
    .gt('price_total', 0)
    .neq('status', 'delivered')
    .order('created_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar sessões: ' + error.message }

  return (data ?? []).map((s: any) => {
    const p = s.patients as any
    const t = p?.tutors as any
    return {
      id:                  s.id,
      patient_name:        p?.name ?? '—',
      patient_species:     p?.species ?? '',
      tutor_name:          t?.name ?? '—',
      tutor_phone:         t?.phone ?? null,
      services_requested:  Array.isArray(s.services_requested) ? s.services_requested : [],
      price_total:         s.price_total ?? 0,
      discount_percent:    s.discount_percent ?? 0,
      status:              s.status as GroomingStatus,
      created_at:          s.created_at,
    }
  }) as PendingGroomingPayment[]
}

export async function processGroomingPaymentFromCashier(
  sessionId:     string,
  paymentMethod: 'pix' | 'credit' | 'debit' | 'cash',
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicAndUser()
  if ('error' in ctx) return ctx
  const { supabase, clinicId, user } = ctx

  // Fetch session to validate
  const { data: session, error: fetchErr } = await supabase
    .from('grooming_sessions')
    .select('id, price_total, payment_status, status, patients ( name, tutors ( name ) )')
    .eq('id', sessionId)
    .eq('clinic_id', clinicId)
    .single()

  if (fetchErr || !session) return { error: 'Sessão não encontrada.' }
  if (session.payment_status !== 'pending') return { error: 'Esta sessão já foi paga.' }

  const s = session as any
  const patientName = s.patients?.name ?? null
  const tutorName   = s.patients?.tutors?.name ?? null
  const amount      = s.price_total ?? 0

  // Find open cashier session
  const { data: openSession } = await supabase
    .from('cashier_sessions')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('status', 'open')
    .maybeSingle()

  // Insert into central_cashier
  const { data: entry, error: insertErr } = await supabase
    .from('central_cashier')
    .insert({
      clinic_id:      clinicId,
      source_module:  'grooming',
      source_id:      sessionId,
      amount,
      status:         'recorded',
      payment_method: paymentMethod,
      patient_name:   patientName,
      tutor_name:     tutorName,
      recorded_by:    user.id,
      session_id:     openSession?.id ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !entry) return { error: 'Erro ao registrar no caixa: ' + (insertErr?.message ?? '') }

  // Mark grooming session as paid and update current_status
  const { error: updateErr } = await supabase
    .from('grooming_sessions')
    .update({
      payment_status:      'paid',
      payment_recorded_at: new Date().toISOString(),
      current_status:      'paid',
    })
    .eq('id', sessionId)
    .eq('clinic_id', clinicId)

  if (updateErr) return { error: 'Caixa registrado mas status não atualizado: ' + updateErr.message }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/grooming')
  return { success: true }
}

// ─── IA: Extrair dados da fala (Voice-to-Action) ─────────────────────────────

export async function extractGroomingVoice(transcript: string): Promise<{
  services_applied: string[]
  products_used:    string[]
  behavior:         'tranquilo' | 'agitado' | 'agressivo' | 'ansioso' | null
  observations:     string
} | { error: string }> {
  if (!transcript.trim()) return { error: 'Transcrição vazia.' }

  const prompt = `Você é um assistente de petshop veterinário. Analise o relato do tosador/banhista e extraia um JSON estrito.
Transcrição: "${transcript}"

RETORNE ESTE JSON:
{
  "services_applied": ["lista dos serviços realizados — ex: Banho Simples, Tosa Higiênica, Hidratação"],
  "products_used": ["lista de produtos usados — ex: Shampoo Neutro, Condicionador"],
  "behavior": "tranquilo" | "agitado" | "agressivo" | "ansioso" | null,
  "observations": "Resumo das observações sobre o animal durante o serviço"
}

Serviços possíveis: Banho Simples, Banho Completo, Tosa Higiênica, Tosa Completa, Tosa na Tesoura, Tosa Bebê, Hidratação, Escovação, Limpeza de Ouvidos, Corte de Unhas, Secagem Completa, Perfume, Bandana.
Se o comportamento não for mencionado, retorne null para "behavior".
Se não mencionar produtos, retorne array vazio para "products_used".
Retorne SOMENTE o JSON, sem markdown.`

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'IA não retornou JSON válido.' }
    return JSON.parse(match[0])
  } catch (err) {
    console.error('Erro na IA de Grooming:', err)
    return { error: 'Erro ao processar áudio.' }
  }
}
