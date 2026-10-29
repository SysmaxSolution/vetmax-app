// Monta o Livro de Controlados de uma clínica (razão por substância) a partir
// dos movimentos de estoque e das vendas do PDV. Servidor, sem auth: quem chama
// (action ou rota de exportação) já conferiu usuário, clínica e papel.
//
// Fonte dos dados: stock_movements (compras, consumo em consulta/cirurgia/
// internação, perdas, ajustes) ∪ sale_items (PDV não grava movimento). Cada
// linha carrega o HISTÓRICO da folha fiscal — vindo das colunas-snapshot da
// 0523 ou, para movimentos antigos, resolvido pela referência (cirurgia /
// aplicação na consulta).

import type { SupabaseClient } from '@supabase/supabase-js'
import { movementDelta, buildItemLedger, type LedgerEvent } from '@/lib/controlled/ledger'
import type { ControlledBook, ControlledBookClinic, ControlledItemBook, ControlledKind, ControlledLedgerEntry } from '@/types/controlled-book'

const SOURCE_LABEL: Record<string, string> = {
  RESTOCK: 'Compra/Reposição', INITIAL_STOCK: 'Estoque inicial', CONSULTATION: 'Consulta',
  HOSPITALIZATION: 'Internação', MANUAL_ADJUSTMENT: 'Ajuste manual',
}

type Ev = LedgerEvent & {
  item_id: string
  movement_id: string | null
  document: string | null
  os_number: string | null
  patient_name: string | null
  tutor_name: string | null
  procedure_name: string | null
  counterparty: string | null
  batch_number: string | null
  expires_at: string | null
  loss_reason: string | null
  responsible: string | null
  notes: string | null
  reference_id: string | null
  source: string | null
}

const COLS_MOV = 'id, stock_item_id, movement_type, quantity_change, quantity_before, quantity_after, source, notes, created_at, created_by, reference_id, os_number, patient_name, tutor_name, procedure_name, counterparty, document_number, batch_number, expires_at, loss_reason'

/** PostgREST devolve no máximo 1000 linhas por chamada; o livro de um ano passa disso. */
async function todasAsPaginas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  const pagina = 1000
  for (let de = 0; ; de += pagina) {
    const { data, error } = await consulta(de, de + pagina - 1)
    if (error) throw new Error(error.message)
    const lote = data ?? []
    out.push(...lote)
    if (lote.length < pagina) break
  }
  return out
}

export async function montarLivroControlados(
  admin: SupabaseClient,
  clinicId: string,
  from: string,
  to: string,
): Promise<ControlledBook> {
  // Período no fuso da clínica (Brasília): o que aconteceu antes de 00:00 do
  // primeiro dia é saldo anterior. Instantes normalizados em UTC para a
  // comparação de datas do razão não depender do formato que o banco devolve.
  const toEnd = to + 'T23:59:59.999-03:00'
  const fromInstant = new Date(from + 'T00:00:00-03:00').toISOString()
  const instante = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toISOString() }

  const { data: clinicRow } = await admin
    .from('clinics')
    .select('name, cnpj, address, city, state, cep, technical_responsible_name, technical_responsible_crmv')
    .eq('id', clinicId)
    .maybeSingle()
  const clinic: ControlledBookClinic = {
    name: clinicRow?.name ?? '', cnpj: clinicRow?.cnpj ?? null, address: clinicRow?.address ?? null,
    city: clinicRow?.city ?? null, state: clinicRow?.state ?? null, cep: clinicRow?.cep ?? null,
    technical_responsible_name: clinicRow?.technical_responsible_name ?? null,
    technical_responsible_crmv: clinicRow?.technical_responsible_crmv ?? null,
  }
  const vazio: ControlledBook = { from, to, generated_at: new Date().toISOString(), clinic, human: [], veterinary: [] }

  // 1) Itens controlados da clínica
  const { data: itemsRaw, error: itemsErr } = await admin
    .from('stock_items')
    .select('id, name, unit, substance, concentration, control_class, is_human_use')
    .eq('clinic_id', clinicId)
    .eq('is_controlled', true)
  if (itemsErr) throw new Error('Erro ao carregar itens controlados: ' + itemsErr.message)
  const items = (itemsRaw ?? []) as { id: string; name: string; unit: string | null; substance: string | null; concentration: string | null; control_class: string | null; is_human_use: boolean | null }[]
  if (items.length === 0) return vazio
  const itemIds = items.map(i => i.id)

  // 2) Movimentos até o fim do período (os anteriores a `from` formam o saldo inicial)
  const movs = await todasAsPaginas<Record<string, unknown>>((de, ate) => admin
    .from('stock_movements')
    .select(COLS_MOV)
    .eq('clinic_id', clinicId)
    .in('stock_item_id', itemIds)
    .lte('created_at', toEnd)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(de, ate))

  // 3) Vendas do PDV (saídas que não gravam stock_movements)
  const saleItems = await todasAsPaginas<Record<string, unknown>>((de, ate) => admin
    .from('sale_items')
    .select('stock_item_id, quantity, sale:sales!inner(id, tutor_id, created_at, cancelled_at)')
    .eq('clinic_id', clinicId)
    .in('stock_item_id', itemIds)
    .range(de, ate))
  const vendas = saleItems.map(s => {
    const sale = (Array.isArray(s.sale) ? s.sale[0] : s.sale) as { id: string; tutor_id: string | null; created_at: string; cancelled_at: string | null } | null
    return { item_id: s.stock_item_id as string, quantity: Number(s.quantity ?? 0), sale }
  }).filter(v => v.sale && !v.sale.cancelled_at && v.sale.created_at <= toEnd)

  // 4) Nomes: quem registrou, tutores das vendas, e o histórico de movimentos antigos
  const userIds = [...new Set(movs.map(m => m.created_by as string | null).filter((x): x is string => !!x))]
  const nomeUsuario = new Map<string, string>()
  if (userIds.length) {
    const { data } = await admin.from('profiles').select('id, full_name').in('id', userIds)
    for (const p of data ?? []) nomeUsuario.set(p.id as string, (p.full_name as string) ?? '')
  }
  const tutorIds = [...new Set(vendas.map(v => v.sale!.tutor_id).filter((x): x is string => !!x))]
  const nomeTutor = new Map<string, string>()
  if (tutorIds.length) {
    const { data } = await admin.from('tutors').select('id, name').eq('clinic_id', clinicId).in('id', tutorIds)
    for (const t of data ?? []) nomeTutor.set(t.id as string, t.name as string)
  }
  const historico = await resolverHistoricoAntigo(admin, clinicId, movs)

  // 5) Eventos unificados
  const events: Ev[] = []
  for (const m of movs) {
    const { delta, kind } = movementDelta(m.movement_type as string, Number(m.quantity_change), m.quantity_before as number | null, m.quantity_after as number | null)
    const kindFinal: ControlledKind = (m.loss_reason && delta < 0) ? 'perda' : kind
    const antigo = historico.get(m.id as string)
    events.push({
      item_id: m.stock_item_id as string, movement_id: m.id as string, date: instante(m.created_at as string), delta, kind: kindFinal,
      origin: SOURCE_LABEL[m.source as string] ?? ((m.source as string) ?? 'Movimento'),
      reference: (m.notes as string | null) ?? null,
      document: (m.document_number as string | null) ?? null,
      os_number: (m.os_number as string | null) ?? antigo?.os_number ?? null,
      patient_name: (m.patient_name as string | null) ?? antigo?.patient_name ?? null,
      tutor_name: (m.tutor_name as string | null) ?? antigo?.tutor_name ?? null,
      procedure_name: (m.procedure_name as string | null) ?? antigo?.procedure_name ?? null,
      counterparty: (m.counterparty as string | null) ?? null,
      batch_number: (m.batch_number as string | null) ?? null,
      expires_at: (m.expires_at as string | null) ?? null,
      loss_reason: (m.loss_reason as string | null) ?? null,
      responsible: m.created_by ? (nomeUsuario.get(m.created_by as string) ?? null) : null,
      notes: (m.notes as string | null) ?? null,
      reference_id: (m.reference_id as string | null) ?? null,
      source: (m.source as string | null) ?? null,
    })
  }
  for (const v of vendas) {
    events.push({
      item_id: v.item_id, movement_id: null, date: instante(v.sale!.created_at), delta: -Math.abs(v.quantity), kind: 'saida',
      origin: 'Venda (PDV)', reference: v.sale!.tutor_id ? (nomeTutor.get(v.sale!.tutor_id) ?? null) : null,
      document: null, os_number: null, patient_name: null, tutor_name: v.sale!.tutor_id ? (nomeTutor.get(v.sale!.tutor_id) ?? null) : null,
      procedure_name: 'Venda (PDV)', counterparty: null, batch_number: null, expires_at: null, loss_reason: null,
      responsible: null, notes: null, reference_id: v.sale!.id, source: 'SALE',
    })
  }

  // 6) Razão por item
  const porItem = new Map<string, Ev[]>()
  for (const e of events) { if (!porItem.has(e.item_id)) porItem.set(e.item_id, []); porItem.get(e.item_id)!.push(e) }

  const books: ControlledItemBook[] = []
  for (const item of items) {
    const led = buildItemLedger(porItem.get(item.id) ?? [], fromInstant)
    if (led.opening === 0 && led.entries.length === 0) continue
    const entries: ControlledLedgerEntry[] = led.entries.map(l => ({
      movement_id: l.movement_id, date: l.date, kind: l.kind, quantity: l.quantity, balance: l.balance, origin: l.origin,
      reference: l.reference, document: l.document, os_number: l.os_number, patient_name: l.patient_name, tutor_name: l.tutor_name,
      procedure_name: l.procedure_name, counterparty: l.counterparty, batch_number: l.batch_number, expires_at: l.expires_at,
      loss_reason: l.loss_reason, responsible: l.responsible, notes: l.notes,
    }))
    books.push({
      stock_item_id: item.id, name: item.name, substance: item.substance ?? null, concentration: item.concentration ?? null,
      control_class: item.control_class ?? null, is_human_use: Boolean(item.is_human_use), unit: item.unit ?? null,
      opening_balance: led.opening, total_in: led.total_in, total_out: led.total_out, total_loss: led.total_loss, closing_balance: led.closing,
      entries,
    })
  }
  const ordem = (a: ControlledItemBook, b: ControlledItemBook) => (a.substance ?? a.name).localeCompare(b.substance ?? b.name, 'pt-BR')
  return {
    from, to, generated_at: new Date().toISOString(), clinic,
    human: books.filter(b => b.is_human_use).sort(ordem),
    veterinary: books.filter(b => !b.is_human_use).sort(ordem),
  }
}

interface HistoricoResolvido { os_number: string | null; patient_name: string | null; tutor_name: string | null; procedure_name: string | null }

/**
 * Movimentos gravados antes da 0523 só têm reference_id. Resolve o que dá:
 * kit cirúrgico (reference = cirurgia) e aplicação na consulta (reference =
 * applied_medications). O que não resolver sai com a observação original.
 */
async function resolverHistoricoAntigo(admin: SupabaseClient, clinicId: string, movs: Record<string, unknown>[]): Promise<Map<string, HistoricoResolvido>> {
  const out = new Map<string, HistoricoResolvido>()
  const pendentes = movs.filter(m => m.movement_type === 'DEBIT' && !m.os_number && !m.patient_name && m.reference_id)
  if (pendentes.length === 0) return out
  const refs = [...new Set(pendentes.map(m => m.reference_id as string))]

  const porConsulta = new Map<string, { os_number: string | null; patient_id: string | null; tutor_id: string | null }>()
  const consultaDe = new Map<string, { consultation_id: string | null; patient_id: string | null; procedure_name: string | null }>()

  const { data: cirurgias } = await admin.from('surgeries').select('id, consultation_id, patient_id, procedure_name').eq('clinic_id', clinicId).in('id', refs)
  for (const s of cirurgias ?? []) consultaDe.set(s.id as string, { consultation_id: (s.consultation_id as string | null) ?? null, patient_id: (s.patient_id as string | null) ?? null, procedure_name: (s.procedure_name as string | null) ?? null })

  const { data: aplicacoes } = await admin.from('applied_medications').select('id, consultation_id').eq('clinic_id', clinicId).in('id', refs)
  for (const a of aplicacoes ?? []) consultaDe.set(a.id as string, { consultation_id: (a.consultation_id as string | null) ?? null, patient_id: null, procedure_name: null })

  const consultaIds = [...new Set([...consultaDe.values()].map(c => c.consultation_id).filter((x): x is string => !!x))]
  if (consultaIds.length) {
    const { data } = await admin.from('consultations').select('id, os_number, patient_id, tutor_id').eq('clinic_id', clinicId).in('id', consultaIds)
    for (const c of data ?? []) porConsulta.set(c.id as string, { os_number: c.os_number == null ? null : String(c.os_number), patient_id: (c.patient_id as string | null) ?? null, tutor_id: (c.tutor_id as string | null) ?? null })
  }
  const patientIds = [...new Set([...consultaDe.values()].map(c => c.patient_id).concat([...porConsulta.values()].map(c => c.patient_id)).filter((x): x is string => !!x))]
  const nomePet = new Map<string, { name: string; tutor_id: string | null }>()
  if (patientIds.length) {
    const { data } = await admin.from('patients').select('id, name, tutor_id').eq('clinic_id', clinicId).in('id', patientIds)
    for (const p of data ?? []) nomePet.set(p.id as string, { name: p.name as string, tutor_id: (p.tutor_id as string | null) ?? null })
  }
  const tutorIds = [...new Set([...nomePet.values()].map(p => p.tutor_id).concat([...porConsulta.values()].map(c => c.tutor_id)).filter((x): x is string => !!x))]
  const nomeTutor = new Map<string, string>()
  if (tutorIds.length) {
    const { data } = await admin.from('tutors').select('id, name').eq('clinic_id', clinicId).in('id', tutorIds)
    for (const t of data ?? []) nomeTutor.set(t.id as string, t.name as string)
  }

  for (const m of pendentes) {
    const ref = consultaDe.get(m.reference_id as string)
    if (!ref) continue
    const cons = ref.consultation_id ? porConsulta.get(ref.consultation_id) : undefined
    const petId = ref.patient_id ?? cons?.patient_id ?? null
    const pet = petId ? nomePet.get(petId) : undefined
    const tutorId = cons?.tutor_id ?? pet?.tutor_id ?? null
    out.set(m.id as string, {
      os_number: cons?.os_number ?? null,
      patient_name: pet?.name ?? null,
      tutor_name: tutorId ? (nomeTutor.get(tutorId) ?? null) : null,
      procedure_name: ref.procedure_name ?? null,
    })
  }
  return out
}
