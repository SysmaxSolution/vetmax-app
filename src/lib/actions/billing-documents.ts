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
