'use server'

/**
 * Módulo Faturamento — Orçamento de Serviços (O.S.) e NFS-e.
 *
 * Fase 1 (08/06/2026): criação/listagem/detalhe/cancelamento de Orçamentos +
 * geração de PDF vetorial. O documento nasce SEM compromisso (draft), pode ser
 * enviado ao tutor e depois faturado (Fase 2) ou virar NFS-e (Fase 3).
 *
 * Multi-tenant: clinic_id resolvido do profile; itens validados pelo
 * documento-pai (RLS). Numeração via RPC atômica rpc_next_billing_number.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { computeBillingTotal } from '@/lib/billing/compute'

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type BillingDocType = 'orcamento' | 'nfse'
export type BillingStatus =
  | 'draft' | 'sent' | 'billed' | 'cancelled'        // orçamento
  | 'processing' | 'authorized' | 'rejected'         // nfse

export interface BillingDocumentItem {
  id?:           string
  stock_item_id: string | null
  description:   string
  quantity:      number
  unit_price:    number
  total_price:   number
  sort_order:    number
}

export interface BillingDocumentRow {
  id:                  string
  doc_type:            BillingDocType
  doc_number:          string
  status:              BillingStatus
  is_billed:           boolean
  issue_date:          string
  billed_date:         string | null
  valid_until:         string | null
  tutor_id:            string | null
  patient_id:          string | null
  professional_id:     string | null
  total_amount:        number
  related_document_id: string | null
  related_doc_number:  string | null
  consultation_id:     string | null
  pdf_path:            string | null
  created_at:          string
  // desnormalizados p/ a tabela
  tutor_name:          string | null
  patient_name:        string | null
  professional_name:   string | null
}

export interface BillingDocumentDetail extends BillingDocumentRow {
  items:   BillingDocumentItem[]
  payload: Record<string, unknown>
}

export interface BillingFilters {
  dateFrom?:       string  // ISO yyyy-mm-dd
  dateTo?:         string
  tutorOrPet?:     string
  professionalId?: string
  docNumber?:      string
  docType?:        BillingDocType | 'all'
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

type Ctx = { admin: ReturnType<typeof createAdminClient>; clinic_id: string; user_id: string }

async function getCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { admin, clinic_id: profile.clinic_id as string, user_id: user.id }
}

// ─── listBillingDocuments ─────────────────────────────────────────────────────

function firstOfMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function listBillingDocuments(
  filters: BillingFilters = {},
): Promise<BillingDocumentRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const from = filters.dateFrom || firstOfMonthISO()
  const to   = filters.dateTo   || todayISO()

  let qb = admin
    .from('billing_documents')
    .select(`
      id, doc_type, doc_number, status, is_billed, issue_date, billed_date,
      valid_until, tutor_id, patient_id, professional_id, total_amount,
      related_document_id, consultation_id, pdf_path, created_at,
      tutors:tutor_id ( name ),
      patients:patient_id ( name ),
      professional:professional_id ( full_name ),
      related:related_document_id ( doc_number )
    `)
    .eq('clinic_id', clinic_id)
    .gte('issue_date', `${from}T00:00:00`)
    .lte('issue_date', `${to}T23:59:59`)
    .order('issue_date', { ascending: false })
    .limit(500)

  if (filters.docType && filters.docType !== 'all') qb = qb.eq('doc_type', filters.docType)
  if (filters.professionalId) qb = qb.eq('professional_id', filters.professionalId)
  if (filters.docNumber)      qb = qb.ilike('doc_number', `%${filters.docNumber.trim()}%`)

  const { data, error } = await qb
  if (error) return { error: error.message }

  let rows = (data ?? []).map((d: any): BillingDocumentRow => ({
    id:                  d.id,
    doc_type:            d.doc_type,
    doc_number:          d.doc_number,
    status:              d.status,
    is_billed:           d.is_billed,
    issue_date:          d.issue_date,
    billed_date:         d.billed_date,
    valid_until:         d.valid_until,
    tutor_id:            d.tutor_id,
    patient_id:          d.patient_id,
    professional_id:     d.professional_id,
    total_amount:        Number(d.total_amount),
    related_document_id: d.related_document_id,
    related_doc_number:  d.related?.doc_number ?? null,
    consultation_id:     d.consultation_id,
    pdf_path:            d.pdf_path,
    created_at:          d.created_at,
    tutor_name:          d.tutors?.name ?? null,
    patient_name:        d.patients?.name ?? null,
    professional_name:   d.professional?.full_name ?? null,
  }))

  // Filtro tutor/pet aplicado em memória (cobre nome do tutor OU do pet)
  if (filters.tutorOrPet?.trim()) {
    const q = filters.tutorOrPet.trim().toLowerCase()
    rows = rows.filter(r =>
      (r.tutor_name ?? '').toLowerCase().includes(q) ||
      (r.patient_name ?? '').toLowerCase().includes(q),
    )
  }

  return rows
}

// ─── getBillingDocument ───────────────────────────────────────────────────────

export async function getBillingDocument(
  id: string,
): Promise<BillingDocumentDetail | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data: d, error } = await admin
    .from('billing_documents')
    .select(`
      id, doc_type, doc_number, status, is_billed, issue_date, billed_date,
      valid_until, tutor_id, patient_id, professional_id, total_amount,
      related_document_id, consultation_id, pdf_path, payload, created_at,
      tutors:tutor_id ( name ),
      patients:patient_id ( name ),
      professional:professional_id ( full_name ),
      related:related_document_id ( doc_number )
    `)
    .eq('id', id)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (error)  return { error: error.message }
  if (!d)     return { error: 'Documento não encontrado.' }

  const { data: items } = await admin
    .from('billing_document_items')
    .select('id, stock_item_id, description, quantity, unit_price, total_price, sort_order')
    .eq('document_id', id)
    .order('sort_order', { ascending: true })

  return {
    id:                  d.id,
    doc_type:            d.doc_type,
    doc_number:          d.doc_number,
    status:              d.status,
    is_billed:           d.is_billed,
    issue_date:          d.issue_date,
    billed_date:         d.billed_date,
    valid_until:         d.valid_until,
    tutor_id:            d.tutor_id,
    patient_id:          d.patient_id,
    professional_id:     d.professional_id,
    total_amount:        Number(d.total_amount),
    related_document_id: d.related_document_id,
    related_doc_number:  (d as any).related?.doc_number ?? null,
    consultation_id:     d.consultation_id,
    pdf_path:            d.pdf_path,
    created_at:          d.created_at,
    tutor_name:          (d as any).tutors?.name ?? null,
    patient_name:        (d as any).patients?.name ?? null,
    professional_name:   (d as any).professional?.full_name ?? null,
    payload:             (d.payload as Record<string, unknown>) ?? {},
    items: (items ?? []).map((it: any): BillingDocumentItem => ({
      id:            it.id,
      stock_item_id: it.stock_item_id,
      description:   it.description,
      quantity:      Number(it.quantity),
      unit_price:    Number(it.unit_price),
      total_price:   Number(it.total_price),
      sort_order:    it.sort_order,
    })),
  }
}

// ─── createQuotation ──────────────────────────────────────────────────────────

export interface CreateQuotationInput {
  tutor_id:        string | null
  patient_id:      string | null
  professional_id: string | null
  valid_until?:    string | null
  items: Array<{ stock_item_id: string | null; description: string; quantity: number; unit_price: number }>
  /** Snapshot livre (formas de pagamento, descontos, observações). */
  payload?:        Record<string, unknown>
}

export async function createQuotation(
  input: CreateQuotationInput,
): Promise<{ id: string; doc_number: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id, user_id } = ctx

  const cleanItems = (input.items ?? []).filter(i => i.description?.trim() && Number(i.quantity) > 0)
  if (cleanItems.length === 0) return { error: 'Adicione ao menos um serviço/item ao orçamento.' }

  const total = computeBillingTotal(cleanItems)

  // Numeração atômica (RPC SECURITY DEFINER)
  const supabase = await createClient()
  const { data: numberData, error: numErr } = await supabase.rpc('rpc_next_billing_number', {
    p_clinic_id: clinic_id,
    p_doc_type:  'orcamento',
  })
  if (numErr || !numberData) return { error: 'Erro ao gerar número do documento: ' + (numErr?.message ?? '') }
  const docNumber = numberData as string

  // Snapshot imutável para reimpressão fiel
  const tutorName   = await nameOf(admin, 'tutors', input.tutor_id)
  const patientName = await nameOf(admin, 'patients', input.patient_id, 'name')
  const profName    = await nameOf(admin, 'profiles', input.professional_id, 'full_name')

  const { data: doc, error: docErr } = await admin
    .from('billing_documents')
    .insert({
      clinic_id,
      doc_type:        'orcamento',
      doc_number:      docNumber,
      status:          'draft',
      is_billed:       false,
      issue_date:      new Date().toISOString(),
      valid_until:     input.valid_until || null,
      tutor_id:        input.tutor_id,
      patient_id:      input.patient_id,
      professional_id: input.professional_id,
      total_amount:    total,
      payload: {
        ...(input.payload ?? {}),
        snapshot: { tutor_name: tutorName, patient_name: patientName, professional_name: profName },
      },
      created_by: user_id,
    })
    .select('id, doc_number')
    .single()
  if (docErr || !doc) return { error: 'Erro ao criar orçamento: ' + (docErr?.message ?? '') }

  const itemRows = cleanItems.map((it, idx) => ({
    clinic_id,
    document_id:   doc.id,
    stock_item_id: it.stock_item_id,
    description:   it.description.trim(),
    quantity:      Number(it.quantity),
    unit_price:    Number(it.unit_price),
    total_price:   Math.round(Number(it.quantity) * Number(it.unit_price) * 100) / 100,
    sort_order:    idx,
  }))
  const { error: itemsErr } = await admin.from('billing_document_items').insert(itemRows)
  if (itemsErr) {
    await admin.from('billing_documents').delete().eq('id', doc.id)
    return { error: 'Erro ao gravar itens: ' + itemsErr.message }
  }

  revalidatePath('/dashboard/billing')
  return { id: doc.id as string, doc_number: doc.doc_number as string }
}

async function nameOf(
  admin: Ctx['admin'], table: 'tutors' | 'patients' | 'profiles', id: string | null, col: string = 'name',
): Promise<string | null> {
  if (!id) return null
  const { data } = await admin.from(table).select(col).eq('id', id).maybeSingle()
  return (data as any)?.[col] ?? null
}

// ─── updateQuotation ──────────────────────────────────────────────────────────

export async function updateQuotation(
  id: string,
  input: Partial<CreateQuotationInput>,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data: doc } = await admin
    .from('billing_documents')
    .select('id, status, doc_type, payload')
    .eq('id', id).eq('clinic_id', clinic_id).maybeSingle()
  if (!doc) return { error: 'Documento não encontrado.' }
  if (doc.doc_type !== 'orcamento') return { error: 'Apenas orçamentos podem ser editados.' }
  if (doc.status === 'billed' || doc.status === 'cancelled') {
    return { error: 'Orçamento faturado ou cancelado não pode ser editado.' }
  }

  const patch: Record<string, unknown> = {}
  if (input.valid_until !== undefined)    patch.valid_until = input.valid_until || null
  if (input.tutor_id !== undefined)       patch.tutor_id = input.tutor_id
  if (input.patient_id !== undefined)     patch.patient_id = input.patient_id
  if (input.professional_id !== undefined) patch.professional_id = input.professional_id

  if (input.items) {
    const cleanItems = input.items.filter(i => i.description?.trim() && Number(i.quantity) > 0)
    if (cleanItems.length === 0) return { error: 'O orçamento precisa de ao menos um item.' }
    patch.total_amount = computeBillingTotal(cleanItems)

    await admin.from('billing_document_items').delete().eq('document_id', id)
    const itemRows = cleanItems.map((it, idx) => ({
      clinic_id, document_id: id, stock_item_id: it.stock_item_id,
      description: it.description.trim(), quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      total_price: Math.round(Number(it.quantity) * Number(it.unit_price) * 100) / 100,
      sort_order: idx,
    }))
    const { error: e } = await admin.from('billing_document_items').insert(itemRows)
    if (e) return { error: 'Erro ao atualizar itens: ' + e.message }
  }
  if (input.payload) {
    patch.payload = { ...((doc.payload as object) ?? {}), ...input.payload }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from('billing_documents').update(patch).eq('id', id)
    if (error) return { error: error.message }
  }
  // PDF antigo fica obsoleto após edição
  await admin.from('billing_documents').update({ pdf_path: null }).eq('id', id)

  revalidatePath('/dashboard/billing')
  return { success: true }
}

// ─── markQuotationSent / cancelBillingDocument ────────────────────────────────

export async function markQuotationSent(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  const { error } = await admin
    .from('billing_documents')
    .update({ status: 'sent' })
    .eq('id', id).eq('clinic_id', clinic_id)
    .eq('doc_type', 'orcamento').in('status', ['draft', 'sent'])
  if (error) return { error: error.message }
  revalidatePath('/dashboard/billing')
  return { success: true }
}

export async function cancelBillingDocument(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  const { data: doc } = await admin
    .from('billing_documents').select('status').eq('id', id).eq('clinic_id', clinic_id).maybeSingle()
  if (!doc) return { error: 'Documento não encontrado.' }
  if (doc.status === 'billed')    return { error: 'Documento já faturado não pode ser cancelado aqui.' }
  if (doc.status === 'cancelled') return { error: 'Documento já está cancelado.' }
  const { error } = await admin
    .from('billing_documents').update({ status: 'cancelled' }).eq('id', id).eq('clinic_id', clinic_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/billing')
  return { success: true }
}

// ─── getBillingSummary (KPIs do mês) ──────────────────────────────────────────

export async function getBillingSummary(filters: BillingFilters = {}): Promise<{
  count: number; total: number; billed_count: number; billed_total: number; open_count: number
} | { error: string }> {
  const list = await listBillingDocuments(filters)
  if ('error' in list) return list
  return {
    count:        list.length,
    total:        Math.round(list.reduce((s, d) => s + d.total_amount, 0) * 100) / 100,
    billed_count: list.filter(d => d.is_billed).length,
    billed_total: Math.round(list.filter(d => d.is_billed).reduce((s, d) => s + d.total_amount, 0) * 100) / 100,
    open_count:   list.filter(d => d.doc_type === 'orcamento' && (d.status === 'draft' || d.status === 'sent')).length,
  }
}

// ─── generateBillingDocumentPdf ───────────────────────────────────────────────
// Renderiza o layout fixo (@react-pdf/renderer, server-side) → Storage →
// signed URL. PDF gravado em pdf_path (path determinístico, upsert).

export async function generateBillingDocumentPdf(
  id: string,
): Promise<{ signed_url: string; storage_path: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const detail = await getBillingDocument(id)
  if ('error' in detail) return detail

  // Dados do emitente (clínica) + tutor/pet + profissional para o documento
  const [{ data: clinic }, { data: tutor }, { data: patient }, { data: professional }] = await Promise.all([
    admin.from('clinics')
      .select('name, cnpj, phone, address, city, state, cep, neighborhood, logo_url')
      .eq('id', clinic_id).maybeSingle(),
    detail.tutor_id
      ? admin.from('tutors')
          .select('name, cpf, phone, email, address, cep, street, neighborhood, city, state, address_number, address_complement')
          .eq('id', detail.tutor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    detail.patient_id
      ? admin.from('patients')
          .select('name, species, breed, gender, birth_date, coat_color, last_known_weight')
          .eq('id', detail.patient_id).maybeSingle()
      : Promise.resolve({ data: null }),
    detail.professional_id
      ? admin.from('profiles').select('full_name, crmv').eq('id', detail.professional_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Render do PDF (lib pesada importada sob demanda — fica fora do bundle das pages)
  const { renderQuotationPdfBuffer } = await import('@/lib/billing/render-quotation-pdf')
  let buffer: Buffer
  try {
    buffer = await renderQuotationPdfBuffer({
      doc:          detail,
      clinic:       (clinic as any) ?? {},
      tutor:        (tutor as any) ?? null,
      patient:      (patient as any) ?? null,
      professional: (professional as any) ?? null,
    })
  } catch (e) {
    return { error: 'Falha ao gerar o PDF: ' + (e instanceof Error ? e.message : 'erro') }
  }

  const storagePath = `${clinic_id}/billing/${detail.doc_number}.pdf`
  const { error: upErr } = await admin.storage
    .from('clinic-attachments')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })
  if (upErr) return { error: 'Erro ao salvar o PDF: ' + upErr.message }

  await admin.from('billing_documents').update({ pdf_path: storagePath }).eq('id', id)

  const { data: signed } = await admin.storage
    .from('clinic-attachments')
    .createSignedUrl(storagePath, 3600)

  revalidatePath('/dashboard/billing')
  return { signed_url: signed?.signedUrl ?? '', storage_path: storagePath }
}

// ─── sendBillingDocumentWhatsApp (Fase 1.6) ──────────────────────────────────
// Gera/assina o PDF e envia ao tutor via Evolution (reusa sendWhatsAppMessage,
// que valida consentimento LGPD). Marca o orçamento como 'sent'.

export async function sendBillingDocumentWhatsApp(
  id: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data: doc } = await admin
    .from('billing_documents')
    .select('id, doc_type, doc_number, total_amount, tutor_id, tutors:tutor_id ( name, phone )')
    .eq('id', id).eq('clinic_id', clinic_id).maybeSingle()
  if (!doc) return { error: 'Documento não encontrado.' }
  if (!doc.tutor_id) return { error: 'Documento sem tutor vinculado — não é possível enviar.' }
  const tutor = (doc as any).tutors as { name?: string; phone?: string } | null
  if (!tutor?.phone) return { error: 'Tutor sem telefone cadastrado.' }

  const pdf = await getBillingDocumentSignedUrl(id)
  if ('error' in pdf) return pdf

  const tipoLabel = doc.doc_type === 'nfse' ? 'Nota Fiscal de Serviço' : 'Orçamento de Serviços'
  const valor = Number(doc.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const message = `Olá${tutor.name ? `, ${tutor.name}` : ''}! Segue em anexo o seu ${tipoLabel} ${doc.doc_number} no valor de ${valor}. Qualquer dúvida, estamos à disposição. 🐾`

  const { sendWhatsAppMessage } = await import('./whatsapp')
  const res = await sendWhatsAppMessage({
    phone:       tutor.phone,
    message,
    trigger:     'documents_sent',
    tutorName:   tutor.name,
    tutorId:     doc.tutor_id,
    attachments: [{ name: `${doc.doc_number}.pdf`, signedUrl: pdf.signed_url, mimeType: 'application/pdf' }],
  })
  if ('error' in res) return res

  // Marca como enviado (orçamento)
  if (doc.doc_type === 'orcamento') {
    await admin.from('billing_documents').update({ status: 'sent' })
      .eq('id', id).eq('clinic_id', clinic_id).in('status', ['draft', 'sent'])
  }
  revalidatePath('/dashboard/billing')
  return { success: true }
}

/** Documentos de faturamento do pet — para o feed (timeline). */
export async function getPetBillingDocuments(
  patientId: string,
): Promise<Array<{ id: string; doc_type: BillingDocType; doc_number: string; status: BillingStatus; total_amount: number; issue_date: string }>> {
  const ctx = await getCtx()
  if ('error' in ctx) return []
  const { admin, clinic_id } = ctx
  const { data } = await admin
    .from('billing_documents')
    .select('id, doc_type, doc_number, status, total_amount, issue_date')
    .eq('clinic_id', clinic_id)
    .eq('patient_id', patientId)
    .neq('status', 'cancelled')
    .order('issue_date', { ascending: false })
  return (data ?? []).map((d: any) => ({
    id: d.id, doc_type: d.doc_type, doc_number: d.doc_number,
    status: d.status, total_amount: Number(d.total_amount), issue_date: d.issue_date,
  }))
}

/** Lista profissionais da clínica (filtro + autor do documento). */
export async function listClinicProfessionals(): Promise<
  Array<{ id: string; name: string; role: string }> | { error: string }
> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('clinic_id', clinic_id)
    .order('full_name')
  if (error) return { error: error.message }
  return (data ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? '—', role: p.role ?? '' }))
}

/** Assina o pdf_path atual (ou gera se ausente) — usado pelo feed/WhatsApp. */
export async function getBillingDocumentSignedUrl(
  id: string,
): Promise<{ signed_url: string; doc_number: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  const { data: d } = await admin
    .from('billing_documents').select('doc_number, pdf_path').eq('id', id).eq('clinic_id', clinic_id).maybeSingle()
  if (!d) return { error: 'Documento não encontrado.' }
  let path = d.pdf_path as string | null
  if (!path) {
    const gen = await generateBillingDocumentPdf(id)
    if ('error' in gen) return gen
    path = gen.storage_path
  }
  const { data: signed } = await admin.storage.from('clinic-attachments').createSignedUrl(path, 3600)
  return { signed_url: signed?.signedUrl ?? '', doc_number: d.doc_number as string }
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 2 — Amarração no fluxo clínico (08/06/2026)
// Recepção (badge) → Check-in (pré-carga de serviços) → cabeçalho clínico →
// Caixa (baixa automática + decremento seletivo de estoque) + gate NFS-e.
// ════════════════════════════════════════════════════════════════════════════

export interface OpenQuotation {
  id:             string
  doc_number:     string
  status:         BillingStatus
  total_amount:   number
  issue_date:     string
  valid_until:    string | null
  patient_id:     string | null
  patient_name:   string | null
  item_count:     number
  consultation_id: string | null
  is_linked:      boolean
}

/** Mapeia linhas cruas de billing_documents → OpenQuotation (com contagem de itens). */
function toOpenQuotation(d: any, itemCount: number): OpenQuotation {
  return {
    id:              d.id,
    doc_number:      d.doc_number,
    status:          d.status,
    total_amount:    Number(d.total_amount),
    issue_date:      d.issue_date,
    valid_until:     d.valid_until,
    patient_id:      d.patient_id,
    patient_name:    d.patients?.name ?? null,
    item_count:      itemCount,
    consultation_id: d.consultation_id,
    is_linked:       Boolean(d.consultation_id),
  }
}

/**
 * Orçamentos em aberto de um tutor (badge + lista na Recepção).
 * Em aberto = orçamento (draft|sent), não faturado, não cancelado.
 * Inclui os já vinculados a uma consulta (is_linked) para a UI distinguir.
 */
export async function getOpenQuotationsForTutor(
  tutorId: string,
): Promise<OpenQuotation[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!tutorId) return []

  const { data, error } = await admin
    .from('billing_documents')
    .select('id, doc_number, status, total_amount, issue_date, valid_until, patient_id, consultation_id, patients:patient_id ( name )')
    .eq('clinic_id', clinic_id)
    .eq('tutor_id', tutorId)
    .eq('doc_type', 'orcamento')
    .eq('is_billed', false)
    .in('status', ['draft', 'sent'])
    .order('issue_date', { ascending: false })
  if (error) return { error: error.message }

  const ids = (data ?? []).map((d: any) => d.id)
  const counts = await countItemsByDocument(admin, ids)
  return (data ?? []).map((d: any) => toOpenQuotation(d, counts.get(d.id) ?? 0))
}

/**
 * Orçamentos disponíveis para puxar no Check-in: em aberto, AINDA NÃO
 * vinculados a uma consulta, opcionalmente filtrados pelo pet.
 */
export async function getOpenQuotationsForCheckin(
  tutorId: string,
  patientId?: string | null,
): Promise<OpenQuotation[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!tutorId) return []

  let qb = admin
    .from('billing_documents')
    .select('id, doc_number, status, total_amount, issue_date, valid_until, patient_id, consultation_id, patients:patient_id ( name )')
    .eq('clinic_id', clinic_id)
    .eq('tutor_id', tutorId)
    .eq('doc_type', 'orcamento')
    .eq('is_billed', false)
    .is('consultation_id', null)
    .in('status', ['draft', 'sent'])
    .order('issue_date', { ascending: false })
  if (patientId) qb = qb.or(`patient_id.eq.${patientId},patient_id.is.null`)

  const { data, error } = await qb
  if (error) return { error: error.message }
  const ids = (data ?? []).map((d: any) => d.id)
  const counts = await countItemsByDocument(admin, ids)
  return (data ?? []).map((d: any) => toOpenQuotation(d, counts.get(d.id) ?? 0))
}

/** Conta itens por documento numa única query (evita N+1). */
async function countItemsByDocument(
  admin: Ctx['admin'], documentIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (documentIds.length === 0) return map
  const { data } = await admin
    .from('billing_document_items')
    .select('document_id')
    .in('document_id', documentIds)
  for (const row of data ?? []) {
    const id = (row as any).document_id as string
    map.set(id, (map.get(id) ?? 0) + 1)
  }
  return map
}

/**
 * Vincula orçamentos a uma consulta no Check-in e pré-carrega os serviços.
 *
 * Para cada item do orçamento:
 *  - com stock_item_id → addServiceToConsultation honrando o preço orçado
 *    (price_override = preço da linha, compromisso comercial do orçamento);
 *  - manual (sem stock_item_id) → find-or-create de um stock_item de serviço
 *    pelo nome normalizado e então lança na consulta com o preço orçado.
 *
 * Marca billing_documents.consultation_id. NÃO fatura ainda (a baixa acontece
 * no Caixa via settleQuotationsForConsultation). Idempotente por documento:
 * orçamento já vinculado a outra consulta é ignorado.
 */
export async function linkQuotationsToConsultation(
  consultationId: string,
  documentIds: string[],
): Promise<{ linked: number; services_added: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!consultationId) return { error: 'consultation_id obrigatório.' }
  if (!documentIds?.length) return { linked: 0, services_added: 0 }

  // Consulta precisa pertencer à clínica
  const { data: consult } = await admin
    .from('consultations').select('id').eq('id', consultationId).eq('clinic_id', clinic_id).maybeSingle()
  if (!consult) return { error: 'Consulta não encontrada na clínica.' }

  const { normalizeServiceName } = await import('@/lib/service-name-normalize')
  const { addServiceToConsultation } = await import('@/lib/actions/services')

  // Índice do catálogo de serviços (para find-or-create de itens manuais)
  const { data: catalog } = await admin
    .from('stock_items')
    .select('id, name')
    .eq('clinic_id', clinic_id)
    .eq('is_service', true)
    .order('created_at', { ascending: true })
  const catalogIndex = new Map<string, string>()
  for (const r of catalog ?? []) {
    const key = normalizeServiceName((r as any).name ?? '')
    if (key && !catalogIndex.has(key)) catalogIndex.set(key, (r as any).id)
  }

  let linked = 0
  let servicesAdded = 0

  for (const docId of documentIds) {
    // Carrega o documento e seus itens; só vincula orçamento em aberto e livre
    const { data: doc } = await admin
      .from('billing_documents')
      .select('id, doc_type, status, is_billed, consultation_id')
      .eq('id', docId).eq('clinic_id', clinic_id).maybeSingle()
    if (!doc) continue
    if (doc.doc_type !== 'orcamento') continue
    if (doc.is_billed || doc.status === 'cancelled') continue
    if (doc.consultation_id && doc.consultation_id !== consultationId) continue // já preso a outra consulta

    const { data: items } = await admin
      .from('billing_document_items')
      .select('stock_item_id, description, quantity, unit_price')
      .eq('document_id', docId)
      .order('sort_order', { ascending: true })

    for (const it of items ?? []) {
      let stockItemId = (it as any).stock_item_id as string | null
      const desc = String((it as any).description ?? '').trim()
      const qty  = Number((it as any).quantity ?? 1)
      const price = Number((it as any).unit_price ?? 0)

      // Item manual → find-or-create stock_item de serviço pelo nome normalizado
      if (!stockItemId) {
        if (!desc) continue
        const key = normalizeServiceName(desc)
        stockItemId = catalogIndex.get(key) ?? null
        if (!stockItemId) {
          const { data: created } = await admin
            .from('stock_items')
            .insert({
              clinic_id, name: desc, category: 'vet_service', unit: 'un',
              unit_price: price, quantity: 0, min_quantity: 0,
              is_service: true, is_controlled: false,
            })
            .select('id').single()
          if (!created) continue
          stockItemId = created.id as string
          catalogIndex.set(key, stockItemId)
        }
      }

      const res = await addServiceToConsultation({
        consultation_id: consultationId,
        stock_item_id:   stockItemId,
        quantity:        qty > 0 ? qty : 1,
        added_at_stage:  'reception',
        price_override:  price, // honra o valor orçado (compromisso comercial)
      })
      if (!('error' in res)) servicesAdded++
    }

    // Prende o orçamento à consulta (sem faturar)
    await admin
      .from('billing_documents')
      .update({ consultation_id: consultationId })
      .eq('id', docId).eq('clinic_id', clinic_id)
    linked++
  }

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/billing')
  return { linked, services_added: servicesAdded }
}

/**
 * Orçamentos vinculados a uma consulta — cabeçalho dos módulos clínicos
 * (Triagem/Consultório/Cirurgia/Internação) e baixa no Caixa.
 */
export async function getConsultationQuotations(
  consultationId: string,
): Promise<Array<{ id: string; doc_number: string; status: BillingStatus; is_billed: boolean; total_amount: number }> | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!consultationId) return []
  const { data, error } = await admin
    .from('billing_documents')
    .select('id, doc_number, status, is_billed, total_amount')
    .eq('clinic_id', clinic_id)
    .eq('consultation_id', consultationId)
    .eq('doc_type', 'orcamento')
    .neq('status', 'cancelled')
    .order('issue_date', { ascending: true })
  if (error) return { error: error.message }
  return (data ?? []).map((d: any) => ({
    id: d.id, doc_number: d.doc_number, status: d.status,
    is_billed: d.is_billed, total_amount: Number(d.total_amount),
  }))
}

/**
 * Baixa (faturamento) dos orçamentos de uma consulta — chamada no Caixa quando
 * o pagamento é concluído. Marca is_billed=true/status='billed'/billed_date e
 * decrementa estoque APENAS de itens físicos (stock_items.is_service=false).
 *
 * Sem duplo-débito: o fluxo consulta→caixa NÃO decrementa consultation_services
 * (confirmado: único trigger em consultation_services é o updated_at). Este é o
 * ponto único de baixa de estoque dos produtos vendidos via orçamento.
 *
 * Idempotente: orçamento já faturado é ignorado (não re-decrementa).
 */
export async function settleQuotationsForConsultation(
  consultationId: string,
): Promise<{ settled: number; stock_decremented: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!consultationId) return { settled: 0, stock_decremented: 0 }

  const { data: docs } = await admin
    .from('billing_documents')
    .select('id')
    .eq('clinic_id', clinic_id)
    .eq('consultation_id', consultationId)
    .eq('doc_type', 'orcamento')
    .eq('is_billed', false)
    .in('status', ['draft', 'sent'])
  if (!docs?.length) return { settled: 0, stock_decremented: 0 }

  let settled = 0
  let stockDecremented = 0
  const nowIso = new Date().toISOString()

  for (const doc of docs) {
    // Itens com stock_item vinculado → candidatos a decremento (só físicos)
    const { data: items } = await admin
      .from('billing_document_items')
      .select('stock_item_id, quantity')
      .eq('document_id', doc.id)
      .not('stock_item_id', 'is', null)

    for (const it of items ?? []) {
      const stockItemId = (it as any).stock_item_id as string
      const qty = Number((it as any).quantity ?? 0)
      if (!stockItemId || qty <= 0) continue
      const { data: si } = await admin
        .from('stock_items')
        .select('id, is_service, quantity')
        .eq('id', stockItemId).eq('clinic_id', clinic_id).maybeSingle()
      if (!si || si.is_service) continue // só produto físico decrementa
      const newQty = Math.max(0, Number(si.quantity ?? 0) - qty)
      await admin.from('stock_items').update({ quantity: newQty }).eq('id', stockItemId).eq('clinic_id', clinic_id)
      stockDecremented++
    }

    await admin
      .from('billing_documents')
      .update({ is_billed: true, status: 'billed', billed_date: nowIso })
      .eq('id', doc.id).eq('clinic_id', clinic_id)
    settled++
  }

  revalidatePath('/dashboard/billing')
  return { settled, stock_decremented: stockDecremented }
}

/**
 * Gate de cadastro do tutor para emissão de NFS-e. Retorna os campos
 * obrigatórios ausentes (CPF/CNPJ, endereço completo). Usado no Check-in e no
 * Caixa quando a clínica emite nota — não bloqueia o orçamento (apenas a nota).
 */
export async function validateTutorForNfse(
  tutorId: string,
): Promise<{ valid: boolean; missing: string[]; tutor_name: string | null } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!tutorId) return { valid: false, missing: ['Tutor'], tutor_name: null }

  const { data: t } = await admin
    .from('tutors')
    .select('name, cpf, cep, street, address, address_number, city, state')
    .eq('id', tutorId).eq('clinic_id', clinic_id).maybeSingle()
  if (!t) return { error: 'Tutor não encontrado.' }

  const missing: string[] = []
  if (!String(t.cpf ?? '').trim())   missing.push('CPF/CNPJ')
  if (!String(t.cep ?? '').trim())   missing.push('CEP')
  // street é o campo estruturado; address é o legado de linha única
  if (!String(t.street ?? '').trim() && !String(t.address ?? '').trim()) missing.push('Logradouro')
  if (!String(t.address_number ?? '').trim()) missing.push('Número')
  if (!String(t.city ?? '').trim())  missing.push('Cidade')
  if (!String(t.state ?? '').trim()) missing.push('UF')

  return { valid: missing.length === 0, missing, tutor_name: (t.name as string) ?? null }
}

/**
 * Indica se a clínica emite NFS-e (config fiscal ativa). A tabela
 * clinic_fiscal_config é criada na Fase 3 — enquanto não existir, retorna
 * false (sem quebrar). Usado para revelar o gate de NFS-e no Caixa/Check-in.
 */
export async function clinicEmitsNfse(): Promise<{ emits: boolean }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { emits: false }
  const { admin, clinic_id } = ctx
  try {
    const { data, error } = await admin
      .from('clinic_fiscal_config')
      .select('emits_nfse, is_active')
      .eq('clinic_id', clinic_id)
      .maybeSingle()
    if (error) return { emits: false } // tabela ausente (Fase 3 pendente) ou sem config
    return { emits: Boolean(data?.emits_nfse && data?.is_active) }
  } catch {
    return { emits: false }
  }
}

/**
 * Cria um documento NFS-e (doc_type='nfse') a partir dos serviços ATIVOS de uma
 * consulta — fonte da verdade do que foi cobrado no caixa. Idempotente por
 * consulta: se já existe uma NFS-e não-cancelada para a consulta, devolve-a.
 * A emissão real (provedor) é feita em seguida por emitNfse (módulo nfse.ts).
 */
export async function createNfseDocumentForConsultation(
  consultationId: string,
): Promise<{ id: string; doc_number: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id, user_id } = ctx
  if (!consultationId) return { error: 'consultation_id obrigatório.' }

  // Já existe NFS-e para a consulta? Reaproveita (não duplica nota).
  const { data: existing } = await admin
    .from('billing_documents')
    .select('id, doc_number')
    .eq('clinic_id', clinic_id)
    .eq('consultation_id', consultationId)
    .eq('doc_type', 'nfse')
    .neq('status', 'cancelled')
    .maybeSingle()
  if (existing) return { id: existing.id as string, doc_number: existing.doc_number as string }

  // Dados da consulta (tutor/pet/profissional) + serviços ativos
  const { data: consult } = await admin
    .from('consultations')
    .select('id, patient_id, tutor_id, vet_id')
    .eq('id', consultationId).eq('clinic_id', clinic_id).maybeSingle()
  if (!consult) return { error: 'Consulta não encontrada.' }

  const { data: services } = await admin
    .from('consultation_services')
    .select('stock_item_id, name_snapshot, price_snapshot, quantity')
    .eq('clinic_id', clinic_id)
    .eq('consultation_id', consultationId)
    .is('cancelled_at', null)
    .order('created_at', { ascending: true })
  const items = (services ?? []).map((s: any) => ({
    stock_item_id: (s.stock_item_id as string) ?? null,
    description:   String(s.name_snapshot ?? 'Serviço'),
    quantity:      Number(s.quantity ?? 1),
    unit_price:    Number(s.price_snapshot ?? 0),
  }))
  if (items.length === 0) return { error: 'Consulta sem serviços para emitir NFS-e.' }

  const total = computeBillingTotal(items)

  // Numeração atômica NFSE-AAAA-NNNN
  const supabase = await createClient()
  const { data: numberData, error: numErr } = await supabase.rpc('rpc_next_billing_number', {
    p_clinic_id: clinic_id, p_doc_type: 'nfse',
  })
  if (numErr || !numberData) return { error: 'Erro ao gerar número da NFS-e: ' + (numErr?.message ?? '') }
  const docNumber = numberData as string

  const tutorName   = await nameOf(admin, 'tutors', consult.tutor_id)
  const patientName = await nameOf(admin, 'patients', consult.patient_id, 'name')
  const profName    = await nameOf(admin, 'profiles', consult.vet_id, 'full_name')

  const { data: doc, error: docErr } = await admin
    .from('billing_documents')
    .insert({
      clinic_id,
      doc_type:        'nfse',
      doc_number:      docNumber,
      status:          'processing',
      is_billed:       true,
      issue_date:      new Date().toISOString(),
      tutor_id:        consult.tutor_id,
      patient_id:      consult.patient_id,
      professional_id: consult.vet_id,
      consultation_id: consultationId,
      total_amount:    total,
      payload: { snapshot: { tutor_name: tutorName, patient_name: patientName, professional_name: profName } },
      created_by: user_id,
    })
    .select('id, doc_number')
    .single()
  if (docErr || !doc) return { error: 'Erro ao criar NFS-e: ' + (docErr?.message ?? '') }

  const itemRows = items.map((it, idx) => ({
    clinic_id, document_id: doc.id, stock_item_id: it.stock_item_id,
    description: it.description, quantity: it.quantity, unit_price: it.unit_price,
    total_price: Math.round(it.quantity * it.unit_price * 100) / 100, sort_order: idx,
  }))
  const { error: itemsErr } = await admin.from('billing_document_items').insert(itemRows)
  if (itemsErr) {
    await admin.from('billing_documents').delete().eq('id', doc.id)
    return { error: 'Erro ao gravar itens da NFS-e: ' + itemsErr.message }
  }

  revalidatePath('/dashboard/billing')
  return { id: doc.id as string, doc_number: doc.doc_number as string }
}
