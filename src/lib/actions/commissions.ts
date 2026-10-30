'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

import { mensagemErro } from '@/lib/errors'
import type { UserCommission, CommissionReport, CommissionableItem } from '@/types/commissions'
// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getClinicCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return null
  return { user_id: user.id, ...profile }
}

// ─── Processamento automático após venda ──────────────────────────────────────

/**
 * Chamada internamente por createSale() após confirmação da venda.
 * Consulta as regras de comissão do vendedor e cria lançamentos em financial_entries.
 */
export async function processCommissions(params: {
  sale_id:     string
  clinic_id:   string
  seller_id:   string
  seller_name: string
  items:       { stock_item_id: string | null; description: string; quantity: number; unit_price: number; discount: number }[]
  sale_date:   string
}): Promise<void> {
  const admin = createAdminClient()

  const { data: rules } = await admin
    .from('user_commissions')
    .select('*')
    .eq('clinic_id', params.clinic_id)
    .eq('user_id', params.seller_id)

  if (!rules || rules.length === 0) return

  const saleRef = params.sale_id.slice(0, 8).toUpperCase()
  const entries: Record<string, unknown>[] = []

  // Setor dos itens vendidos (comissão por setor, 0526) — uma consulta só.
  const idsItens = params.items.map(i => i.stock_item_id).filter((x): x is string => !!x)
  const setorDoItem = new Map<string, string | null>()
  if (idsItens.length && rules.some((r: any) => r.item_type === 'sector')) {
    const { data: itens } = await admin.from('stock_items').select('id, sector').eq('clinic_id', params.clinic_id).in('id', idsItens)
    for (const it of (itens ?? []) as any[]) setorDoItem.set(it.id, it.sector ?? null)
  }
  const valorDaRegra = (rule: any, base: number, quantidade: number) =>
    rule.fixed_amount != null && Number(rule.fixed_amount) > 0
      ? +(Number(rule.fixed_amount) * quantidade).toFixed(2)
      : +(base * (Number(rule.percentage ?? 0) / 100)).toFixed(2)

  for (const rule of rules) {
    if (rule.item_type === 'all') {
      // Comissão sobre o total líquido da venda
      const saleTotal = params.items.reduce(
        (sum, i) => sum + (i.quantity * i.unit_price - i.discount), 0
      )
      const amount = +(saleTotal * (rule.percentage / 100)).toFixed(2)
      if (amount <= 0) continue

      const names = params.items.map(i => i.description).join(', ')
      entries.push({
        clinic_id:       params.clinic_id,
        type:            'payable',
        category:        'commission',
        source:          'commission',
        description:     `Comissão ref. a ${names}, Data da venda: ${params.sale_date} - Venda #${saleRef} - Profissional: ${params.seller_name}`,
        amount,
        due_date:        params.sale_date,
        professional_id: params.seller_id,
        status:          'pending',
        discount:        0,
        interest:        0,
      })
    } else {
      // Comissão por item específico ou por tipo
      for (const item of params.items) {
        if (!item.stock_item_id) continue
        if (rule.item_id && item.stock_item_id !== rule.item_id) continue
        if (rule.item_type === 'sector' && (setorDoItem.get(item.stock_item_id) ?? '') !== String(rule.sector ?? '')) continue

        const itemTotal = item.quantity * item.unit_price - item.discount
        const amount = valorDaRegra(rule, itemTotal, item.quantity)
        if (amount <= 0) continue

        entries.push({
          clinic_id:       params.clinic_id,
          type:            'payable',
          category:        'commission',
          source:          'commission',
          description:     `Comissão ref. a ${item.description}, Data da venda: ${params.sale_date} - Venda #${saleRef} - Profissional: ${params.seller_name}`,
          amount,
          due_date:        params.sale_date,
          professional_id: params.seller_id,
          status:          'pending',
          discount:        0,
          interest:        0,
        })
      }
    }
  }

  if (entries.length > 0) {
    await admin.from('financial_entries').insert(entries)
  }
}

// ─── CRUD de regras de comissão ───────────────────────────────────────────────

export async function listUserCommissions(userId?: string): Promise<UserCommission[] | { error: string }> {
  const ctx = await getClinicCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  let query = admin
    .from('user_commissions')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)
    .order('created_at', { ascending: false })

  if (userId) query = (query as any).eq('user_id', userId)

  const { data, error } = await query
  if (error) return { error: mensagemErro(error, 'lib/actions/commissions.ts') }

  return (data ?? []).map((r: any) => ({
    id:          r.id,
    clinic_id:   r.clinic_id,
    user_id:     r.user_id,
    item_type:   r.item_type,
    item_id:     r.item_id ?? null,
    percentage:  Number(r.percentage ?? 0),
    sector:      r.sector ?? null,
    fixed_amount: r.fixed_amount == null ? null : Number(r.fixed_amount),
    description: r.description ?? null,
    created_at:  r.created_at,
  }))
}

/** Setores em uso nos itens da clínica (para a regra de comissão por setor). */
export async function listItemSectors(): Promise<string[]> {
  const ctx = await getClinicCtx()
  if (!ctx) return []
  const admin = createAdminClient()
  const { data } = await admin.from('stock_items').select('sector').eq('clinic_id', ctx.clinic_id).not('sector', 'is', null).is('archived_at', null)
  return [...new Set(((data ?? []) as { sector: string | null }[]).map(r => r.sector).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export async function upsertUserCommission(data: {
  id?:          string
  user_id:      string
  item_type:    UserCommission['item_type']
  item_id?:     string | null
  percentage:   number
  sector?:      string | null
  fixed_amount?: number | null
  description?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicCtx()
  if (!ctx) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const payload = {
    clinic_id:   ctx.clinic_id,
    user_id:     data.user_id,
    item_type:   data.item_type,
    item_id:     data.item_id ?? null,
    percentage:  data.percentage,
    sector:      data.item_type === 'sector' ? (data.sector?.trim() || null) : null,
    fixed_amount: data.fixed_amount != null && Number.isFinite(data.fixed_amount) && data.fixed_amount > 0 ? data.fixed_amount : null,
    description: data.description ?? null,
    updated_at:  new Date().toISOString(),
  }
  if (data.item_type === 'sector' && !payload.sector) return { error: 'Informe o setor da regra.' }
  if (!(data.percentage > 0) && !payload.fixed_amount) return { error: 'Informe o percentual ou o valor fixo da comissão.' }

  const { data: result, error } = data.id
    ? await admin.from('user_commissions').update(payload).eq('id', data.id).select('id').single()
    : await admin.from('user_commissions').insert(payload).select('id').single()

  if (error) return { error: mensagemErro(error, 'lib/actions/commissions.ts') }

  revalidatePath('/dashboard/reports/commissions')
  return { id: result.id }
}

export async function deleteUserCommission(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicCtx()
  if (!ctx) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_commissions')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: mensagemErro(error, 'lib/actions/commissions.ts') }

  revalidatePath('/dashboard/reports/commissions')
  return { success: true }
}

// ─── Busca de itens para comissão por item específico ────────────────────────

export async function searchItemsForCommission(
  query: string,
  type:  'product' | 'service' | 'package',
): Promise<CommissionableItem[] | { error: string }> {
  const ctx = await getClinicCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const q = query.trim()

  if (type === 'package') {
    const { data, error } = await admin
      .from('catalog_packages')
      .select('id, name, price')
      .eq('clinic_id', ctx.clinic_id)
      .eq('active', true)
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(15)
    if (error) return { error: mensagemErro(error, 'lib/actions/commissions.ts') }
    return (data ?? []).map((p: any) => ({
      id: p.id, name: p.name, price: Number(p.price ?? 0), category: 'package',
    }))
  }

  // product or service — differentiated by is_service flag
  const isService = type === 'service'
  const { data, error } = await admin
    .from('stock_items')
    .select('id, name, unit_price, category, is_service')
    .eq('clinic_id', ctx.clinic_id)
    .eq('is_service', isService)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(15)

  if (error) return { error: mensagemErro(error, 'lib/actions/commissions.ts') }
  return (data ?? []).map((p: any) => ({
    id: p.id, name: p.name, price: Number(p.unit_price ?? 0), category: p.category ?? type,
  }))
}

// ─── Comissão por valor total (grooming, billing) ─────────────────────────────

/**
 * Processa comissão sobre um valor total já confirmado (checkout de tosa ou consulta).
 * Aplica regras do profissional onde item_type está em `item_types`.
 * Fire-and-forget — nunca bloqueia o fluxo principal.
 */
export async function processAmountCommission(params: {
  clinic_id:         string
  professional_id:   string
  professional_name: string
  amount:            number
  description:       string
  date:              string
  item_types:        Array<'all' | 'service' | 'package'>
}): Promise<void> {
  if (params.amount <= 0) return
  const admin = createAdminClient()

  const { data: rules } = await admin
    .from('user_commissions')
    .select('id, item_type, percentage')
    .eq('clinic_id', params.clinic_id)
    .eq('user_id', params.professional_id)
    .in('item_type', params.item_types)

  if (!rules || rules.length === 0) return

  const entries = rules.map((rule: any) => {
    const amount = +(params.amount * (Number(rule.percentage) / 100)).toFixed(2)
    return {
      clinic_id:       params.clinic_id,
      type:            'payable',
      category:        'commission',
      source:          'commission',
      description:     params.description,
      amount,
      due_date:        params.date,
      professional_id: params.professional_id,
      status:          'pending',
      discount:        0,
      interest:        0,
    }
  }).filter((e: any) => e.amount > 0)

  if (entries.length > 0) {
    await admin.from('financial_entries').insert(entries)
  }
}

// ─── Relatório de comissões ───────────────────────────────────────────────────

export async function getCommissionsReport(filters?: {
  from?:             string
  to?:               string
  professional_id?:  string
}): Promise<CommissionReport[] | { error: string }> {
  const ctx = await getClinicCtx()
  if (!ctx) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Sem permissão para acessar relatório de comissões.' }
  }

  const admin = createAdminClient()
  let query = admin
    .from('financial_entries')
    .select(`
      id, description, amount, due_date, status, professional_id,
      profiles!professional_id ( full_name )
    `)
    .eq('clinic_id', ctx.clinic_id)
    .eq('category', 'commission')
    .eq('type', 'payable')
    .order('due_date', { ascending: false })

  if (filters?.from)            query = (query as any).gte('due_date', filters.from)
  if (filters?.to)              query = (query as any).lte('due_date', filters.to)
  if (filters?.professional_id) query = (query as any).eq('professional_id', filters.professional_id)

  const { data, error } = await query
  if (error) return { error: mensagemErro(error, 'lib/actions/commissions.ts') }

  const byProfessional: Record<string, CommissionReport> = {}

  for (const row of (data ?? [])) {
    const pid  = (row as any).professional_id ?? 'unknown'
    const name = (row as any).profiles?.full_name ?? 'Desconhecido'

    if (!byProfessional[pid]) {
      byProfessional[pid] = {
        professional_id:   pid,
        professional_name: name,
        total_amount:      0,
        pending_amount:    0,
        entry_count:       0,
        entries:           [],
      }
    }

    const r = byProfessional[pid]
    r.total_amount  += Number((row as any).amount)
    r.entry_count   += 1
    if ((row as any).status === 'pending') r.pending_amount += Number((row as any).amount)
    r.entries.push({
      id:          (row as any).id,
      description: (row as any).description,
      amount:      Number((row as any).amount),
      due_date:    (row as any).due_date,
      status:      (row as any).status,
    })
  }

  return Object.values(byProfessional)
}

// ─── Pagamento de comissões (1.5) — baixa os títulos de comissão pendentes ────
// do profissional no período (competência) selecionado.
export async function payCommissions(params: {
  professional_id: string
  from?: string
  to?:   string
}): Promise<{ ok: true; paid: number; total: number } | { error: string }> {
  const ctx = await getClinicCtx()
  if (!ctx) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Sem permissão para pagar comissões.' }
  const admin = createAdminClient()
  let q = admin.from('financial_entries')
    .select('id, amount')
    .eq('clinic_id', ctx.clinic_id).eq('category', 'commission').eq('type', 'payable')
    .eq('status', 'pending').eq('professional_id', params.professional_id)
  if (params.from) q = (q as any).gte('due_date', params.from)
  if (params.to)   q = (q as any).lte('due_date', params.to)
  const { data: rows } = await q
  const list = (rows ?? []) as { id: string; amount: number }[]
  if (list.length === 0) return { error: 'Nenhuma comissão pendente no período.' }
  const total = Math.round(list.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await admin.from('financial_entries')
    .update({ status: 'paid', payment_date: today, updated_at: new Date().toISOString() })
    .in('id', list.map(r => r.id))
  if (error) return { error: 'Erro ao pagar comissões: ' + mensagemErro(error, 'lib/actions/commissions.ts') }
  revalidatePath('/dashboard/reports/commissions')
  revalidatePath('/dashboard/financial')
  return { ok: true, paid: list.length, total }
}
