'use server'

// Livro de Controlados (Fase 1 · item 1.7) — Portaria 344/1998 + RDC 22/2014.
// Razão POR SUBSTÂNCIA, separando forma HUMANA × VETERINÁRIA, em ordem
// cronológica (entrada/saída/perda/saldo), montada a partir dos lançamentos que
// já existem: stock_movements (compras/reposição, consumo em internação/consulta,
// ajustes) UNIÃO sale_items do PDV (que baixam estoque sem gravar movimento).
// Suporta retroativo (qualquer intervalo). Somente leitura.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { movementDelta, buildItemLedger } from '@/lib/controlled/ledger'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { admin: createAdminClient(), clinic_id: profile.clinic_id as string, role: (profile.role as string) ?? 'staff' }
}

export type ControlledKind = 'entrada' | 'saida' | 'perda' | 'ajuste'

export interface ControlledLedgerEntry {
  date:      string
  kind:      ControlledKind
  quantity:  number           // sinalizado (+entrada / −saída)
  balance:   number           // saldo após o evento
  origin:    string           // Compra/Reposição, Venda (PDV), Internação, Consulta, Ajuste…
  reference: string | null    // tutor / observação
  document:  string | null    // nota/nº quando houver
}

export interface ControlledItemBook {
  stock_item_id:   string
  name:            string
  substance:       string | null
  concentration:   string | null
  control_class:   string | null
  is_human_use:    boolean
  unit:            string | null
  opening_balance: number
  total_in:        number
  total_out:       number
  total_loss:      number
  closing_balance: number
  entries:         ControlledLedgerEntry[]
}

export interface ControlledBook {
  from: string
  to:   string
  human:      ControlledItemBook[]
  veterinary: ControlledItemBook[]
}

export async function getControlledBook(params: {
  from: string
  to:   string
}): Promise<ControlledBook | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'accountant', 'vet'].includes(ctx.role)) {
    return { error: 'Acesso negado ao Livro de Controlados.' }
  }
  const { admin, clinic_id } = ctx
  const toEnd = params.to + 'T23:59:59'

  // 1) Itens controlados
  const { data: itemsRaw, error: itemsErr } = await admin
    .from('stock_items')
    .select('id, name, unit, substance, concentration, control_class, is_human_use')
    .eq('clinic_id', clinic_id)
    .eq('is_controlled', true)
  if (itemsErr) return { error: 'Erro ao carregar itens controlados: ' + itemsErr.message }
  const items = (itemsRaw ?? []) as any[]
  if (items.length === 0) return { from: params.from, to: params.to, human: [], veterinary: [] }
  const itemIds = items.map(i => i.id)
  const itemById = new Map<string, any>(items.map(i => [i.id, i]))

  // 2) Movimentos de estoque (até o fim do período) — dão entrada/saída/ajuste
  const { data: movsRaw } = await admin
    .from('stock_movements')
    .select('stock_item_id, movement_type, quantity_change, quantity_before, quantity_after, source, notes, created_at')
    .eq('clinic_id', clinic_id)
    .in('stock_item_id', itemIds)
    .lte('created_at', toEnd)
    .order('created_at', { ascending: true })
  const movs = (movsRaw ?? []) as any[]

  // 3) Vendas do PDV (saídas que NÃO gravam stock_movements)
  const { data: saleItemsRaw } = await admin
    .from('sale_items')
    .select('stock_item_id, quantity, sale:sales!inner(id, tutor_id, created_at, cancelled_at)')
    .eq('clinic_id', clinic_id)
    .in('stock_item_id', itemIds)
  const saleItems = (saleItemsRaw ?? []).filter((s: any) => {
    const sale = Array.isArray(s.sale) ? s.sale[0] : s.sale
    return sale && !sale.cancelled_at && sale.created_at <= toEnd
  }) as any[]

  // Nomes de tutores das vendas (identificação do tomador)
  const tutorIds = [...new Set(saleItems.map((s: any) => {
    const sale = Array.isArray(s.sale) ? s.sale[0] : s.sale
    return sale?.tutor_id
  }).filter(Boolean))] as string[]
  const tutorName = new Map<string, string>()
  if (tutorIds.length > 0) {
    const { data: tuts } = await admin.from('tutors').select('id, name').in('id', tutorIds)
    for (const t of (tuts ?? []) as any[]) tutorName.set(t.id, t.name)
  }

  // 4) Eventos unificados sinalizados
  type Ev = { item_id: string; date: string; delta: number; kind: ControlledKind; origin: string; reference: string | null; document: string | null }
  const SOURCE_LABEL: Record<string, string> = {
    RESTOCK: 'Compra/Reposição', INITIAL_STOCK: 'Estoque inicial', CONSULTATION: 'Consulta',
    HOSPITALIZATION: 'Internação', MANUAL_ADJUSTMENT: 'Ajuste manual',
  }
  const events: Ev[] = []

  for (const m of movs) {
    const { delta, kind } = movementDelta(m.movement_type, m.quantity_change, m.quantity_before, m.quantity_after)
    events.push({
      item_id: m.stock_item_id, date: m.created_at, delta, kind,
      origin: SOURCE_LABEL[m.source] ?? (m.source ?? 'Movimento'),
      reference: m.notes ?? null, document: null,
    })
  }
  for (const s of saleItems) {
    const sale = Array.isArray(s.sale) ? s.sale[0] : s.sale
    events.push({
      item_id: s.stock_item_id, date: sale.created_at, delta: -Math.abs(Number(s.quantity ?? 0)), kind: 'saida',
      origin: 'Venda (PDV)',
      reference: sale.tutor_id ? (tutorName.get(sale.tutor_id) ?? null) : null,
      document: null,
    })
  }

  // 5) Monta a razão por item: saldo inicial (eventos < from) + eventos do período
  const byItem = new Map<string, Ev[]>()
  for (const e of events) {
    if (!byItem.has(e.item_id)) byItem.set(e.item_id, [])
    byItem.get(e.item_id)!.push(e)
  }

  const books: ControlledItemBook[] = []
  for (const item of items) {
    const evs = (byItem.get(item.id) ?? []).map(e => ({
      date: e.date, delta: e.delta, kind: e.kind, origin: e.origin, reference: e.reference,
    }))
    const led = buildItemLedger(evs, params.from)
    // Só inclui itens com saldo inicial ou algum movimento no período
    if (led.opening === 0 && led.entries.length === 0) continue
    books.push({
      stock_item_id: item.id, name: item.name, substance: item.substance ?? null,
      concentration: item.concentration ?? null, control_class: item.control_class ?? null,
      is_human_use: Boolean(item.is_human_use), unit: item.unit ?? null,
      opening_balance: led.opening, total_in: led.total_in, total_out: led.total_out,
      total_loss: led.total_loss, closing_balance: led.closing,
      entries: led.entries.map(l => ({ ...l, document: null })),
    })
  }

  const sortFn = (a: ControlledItemBook, b: ControlledItemBook) =>
    (a.substance ?? a.name).localeCompare(b.substance ?? b.name, 'pt-BR')

  return {
    from: params.from, to: params.to,
    human:      books.filter(b => b.is_human_use).sort(sortFn),
    veterinary: books.filter(b => !b.is_human_use).sort(sortFn),
  }
}
