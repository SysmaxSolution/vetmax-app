'use server'

// Reposição e validade do estoque (Fase 4 · item 4.4) — a dor da Aline, que hoje
// mantém lista de compras e planilha de validades à mão.
//
// Tudo aqui é leitura derivada do que já é gravado: a sugestão de compra sai do
// consumo real (`stock_movements`), não de uma previsão cadastrada; o alerta de
// validade sai dos lotes (`stock_batches`). Nada precisa ser alimentado à parte,
// e é isso que faz a lista continuar verdadeira depois do primeiro mês.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import {
  sugerirCompra, ordenarSugestoes, alertasDeValidade, PARAMETROS_PADRAO,
} from '@/lib/stock/reposicao'
import type { ItemParaRepor, LoteComValidade, SugestaoDeCompra } from '@/lib/stock/reposicao'
import type { ListaDeCompras, PainelDeValidade, LocalDeEstoque, ItemEnderecavel } from '@/types/estoque-reposicao'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' as const }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' as const }
  return { admin, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? 'staff', userId: user.id }
}

/** Hoje em 'YYYY-MM-DD' no fuso de quem opera a clínica. */
function hojeLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// ─── Lista de compras ───────────────────────────────────────────────────────

/**
 * Monta a lista de compras a partir da SAÍDA real do período.
 *
 * O consumo vem dos movimentos de débito — consulta, internação, cirurgia e
 * PDV todos passam por lá. Perda entra no consumo de propósito: material que
 * venceu ou quebrou também precisa ser reposto para a clínica não ficar sem.
 */
export async function getListaDeCompras(diasObservados = 90): Promise<ListaDeCompras | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso negado à lista de compras.' }
  }
  const { admin, clinicId } = ctx

  const dias = Math.min(365, Math.max(7, Math.floor(diasObservados) || 90))
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  // Itens físicos ativos (serviço não tem estoque para repor).
  const { data: itensRaw, error: erroItens } = await admin
    .from('stock_items')
    .select(`
      id, name, unit, quantity, min_quantity,
      lead_time_days, coverage_days, purchase_multiple, purchase_minimum,
      shelf_code,
      local:stock_locations ( name ),
      fornecedor:suppliers ( name )
    `)
    .eq('clinic_id', clinicId)
    .eq('is_service', false)
    .is('archived_at', null)
  if (erroItens) return { error: 'Erro ao ler o estoque: ' + mensagemErro(erroItens, 'lib/actions/stock-reposicao.ts') }

  const itens = itensRaw ?? []
  if (itens.length === 0) {
    return { dias_observados: dias, itens: [], totais: { itens: 0, criticos: 0, atencao: 0 } }
  }

  // Consumo do período: soma dos débitos por item.
  const { data: movs } = await admin
    .from('stock_movements')
    .select('stock_item_id, quantity_change, movement_type')
    .eq('clinic_id', clinicId)
    .gte('created_at', desde)
    .in('movement_type', ['DEBIT', 'ADJUSTMENT'])
    .not('stock_item_id', 'is', null)

  const consumoPorItem = new Map<string, number>()
  for (const m of movs ?? []) {
    const delta = Number(m.quantity_change ?? 0)
    // Só saída conta como consumo; ajuste positivo é entrada.
    if (delta >= 0) continue
    const chave = m.stock_item_id as string
    consumoPorItem.set(chave, (consumoPorItem.get(chave) ?? 0) + Math.abs(delta))
  }

  const umNome = (v: unknown): string | null => {
    const o = Array.isArray(v) ? v[0] : v
    return (o as { name?: string } | null)?.name ?? null
  }

  const sugestoes: SugestaoDeCompra[] = []
  for (const i of itens) {
    const entrada: ItemParaRepor = {
      stock_item_id:     i.id as string,
      name:              i.name as string,
      unit:              (i.unit as string | null) ?? null,
      quantity:          Number(i.quantity ?? 0),
      min_quantity:      Number(i.min_quantity ?? 0),
      consumo_periodo:   consumoPorItem.get(i.id as string) ?? 0,
      dias_periodo:      dias,
      lead_time_days:    i.lead_time_days === null ? null : Number(i.lead_time_days),
      coverage_days:     i.coverage_days === null ? null : Number(i.coverage_days),
      purchase_multiple: i.purchase_multiple === null ? null : Number(i.purchase_multiple),
      purchase_minimum:  i.purchase_minimum === null ? null : Number(i.purchase_minimum),
      shelf_code:        (i.shelf_code as string | null) ?? null,
      location_name:     umNome((i as Record<string, unknown>).local),
      supplier_name:     umNome((i as Record<string, unknown>).fornecedor),
    }
    const s = sugerirCompra(entrada, PARAMETROS_PADRAO)
    if (s) sugestoes.push(s)
  }

  const ordenadas = ordenarSugestoes(sugestoes)
  return {
    dias_observados: dias,
    itens: ordenadas,
    totais: {
      itens:    ordenadas.length,
      criticos: ordenadas.filter(s => s.urgencia === 'critico').length,
      atencao:  ordenadas.filter(s => s.urgencia === 'atencao').length,
    },
  }
}

// ─── Painel de validade ─────────────────────────────────────────────────────

/**
 * Lotes vencidos ou vencendo na janela. A antecedência padrão é 60 dias, que dá
 * tempo de usar ou negociar troca com o fornecedor; a clínica ajusta na tela.
 */
export async function getPainelDeValidade(janelaDias = 60): Promise<PainelDeValidade | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const { admin, clinicId } = ctx

  const janela = Math.min(365, Math.max(1, Math.floor(janelaDias) || 60))
  const hoje = hojeLocal()
  // Teto da consulta no banco; o módulo puro é quem classifica e ordena.
  const limite = new Date(Date.now() + janela * 86400000).toISOString().slice(0, 10)

  const { data: lotes, error } = await admin
    .from('stock_batches')
    .select(`
      id, stock_item_id, batch_number, expiry_date, quantity,
      item:stock_items!inner ( name, unit, shelf_code, is_controlled, archived_at,
        local:stock_locations ( name ) )
    `)
    .eq('clinic_id', clinicId)
    .not('expiry_date', 'is', null)
    .lte('expiry_date', limite)
    .gt('quantity', 0)
  if (error) return { error: 'Erro ao ler os lotes: ' + mensagemErro(error, 'lib/actions/stock-reposicao.ts') }

  const entradas: LoteComValidade[] = []
  for (const l of lotes ?? []) {
    const itemRaw = (l as Record<string, unknown>).item
    const item = (Array.isArray(itemRaw) ? itemRaw[0] : itemRaw) as {
      name?: string; unit?: string | null; shelf_code?: string | null
      is_controlled?: boolean; archived_at?: string | null
      local?: { name?: string } | { name?: string }[] | null
    } | null
    // Item arquivado não entra: alerta sobre o que saiu de linha treina a equipe
    // a ignorar o painel.
    if (!item || item.archived_at) continue
    const local = Array.isArray(item.local) ? item.local[0] : item.local
    entradas.push({
      batch_id:      l.id as string,
      stock_item_id: l.stock_item_id as string,
      item_name:     item.name ?? '(sem nome)',
      unit:          item.unit ?? null,
      batch_number:  (l.batch_number as string | null) ?? null,
      expiry_date:   (l.expiry_date as string | null) ?? null,
      quantity:      Number(l.quantity ?? 0),
      shelf_code:    item.shelf_code ?? null,
      location_name: local?.name ?? null,
      is_controlled: Boolean(item.is_controlled),
    })
  }

  const alertas = alertasDeValidade(entradas, hoje, janela)
  const vencidos = alertas.filter(a => a.situacao === 'vencido')

  return {
    janela_dias: janela,
    hoje,
    alertas,
    totais: {
      vencidos:           vencidos.length,
      vencendo:           alertas.length - vencidos.length,
      quantidade_vencida: Math.round(vencidos.reduce((s, a) => s + a.quantity, 0) * 1000) / 1000,
    },
  }
}

/**
 * Dá baixa de perda num lote — o caminho do item vencido.
 *
 * Motivo obrigatório, validado no banco: perda sem motivo é o caminho mais curto
 * para o estoque não fechar nunca. O lote é informado de propósito, porque o que
 * venceu é aquele lote e não "um pouco do saldo".
 */
export async function baixarPerdaDeLote(input: {
  stockItemId: string
  batchId:     string
  quantidade:  number
  motivo:      string
}): Promise<{ saldo_depois: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Só a gestão da clínica pode dar baixa de perda.' }
  }
  if (!(input.quantidade > 0)) return { error: 'A quantidade da perda deve ser maior que zero.' }
  if (!input.motivo?.trim() || input.motivo.trim().length < 3) {
    return { error: 'Informe o motivo da perda.' }
  }

  const { data, error } = await ctx.admin.rpc('rpc_register_stock_loss', {
    p_clinic_id:     ctx.clinicId,
    p_stock_item_id: input.stockItemId,
    p_quantity:      input.quantidade,
    p_reason:        input.motivo.trim(),
    p_batch_id:      input.batchId,
    p_user_id:       ctx.userId,
    p_reference_id:  null,
    p_notes:         null,
  })
  if (error) return { error: 'Erro ao registrar a perda: ' + mensagemErro(error, 'lib/actions/stock-reposicao.ts') }

  const row = Array.isArray(data) ? data[0] : data
  revalidatePath('/dashboard/pharmacy')
  return { saldo_depois: Number(row?.quantity_after ?? 0) }
}

// ─── Locais de armazenagem e endereço de prateleira ─────────────────────────

export async function listLocaisDeEstoque(): Promise<LocalDeEstoque[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { data, error } = await ctx.admin
    .from('stock_locations')
    .select('id, name, description, is_active, stock_items(count)')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return { error: 'Erro ao ler os locais: ' + mensagemErro(error, 'lib/actions/stock-reposicao.ts') }

  return (data ?? []).map((r): LocalDeEstoque => ({
    id:          r.id as string,
    name:        r.name as string,
    description: (r.description as string | null) ?? null,
    is_active:   r.is_active !== false,
    itens:       Number((r.stock_items as { count: number }[] | null)?.[0]?.count ?? 0),
  }))
}

export async function salvarLocalDeEstoque(input: {
  id?:          string
  name:         string
  description?: string | null
  is_active?:   boolean
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Só a gestão da clínica pode cadastrar locais de estoque.' }
  }
  const nome = input.name?.trim()
  if (!nome) return { error: 'Informe o nome do local.' }

  const patch = {
    name:        nome,
    description: input.description?.trim() || null,
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
  }

  if (input.id) {
    const { error } = await ctx.admin
      .from('stock_locations')
      .update(patch)
      .eq('id', input.id)
      .eq('clinic_id', ctx.clinicId)
    if (error) return { error: 'Erro ao salvar o local: ' + mensagemErro(error, 'lib/actions/stock-reposicao.ts') }
    revalidatePath('/dashboard/pharmacy')
    return { id: input.id }
  }

  const { data, error } = await ctx.admin
    .from('stock_locations')
    .insert({ clinic_id: ctx.clinicId, ...patch })
    .select('id')
    .single()
  if (error) return { error: 'Erro ao criar o local: ' + mensagemErro(error, 'lib/actions/stock-reposicao.ts') }
  revalidatePath('/dashboard/pharmacy')
  return { id: data.id as string }
}

/**
 * Grava o endereço de prateleira e os parâmetros de compra de um item.
 *
 * Fica aqui, e não no cadastro geral do item, porque é a rotina de quem organiza
 * o estoque: a Aline passa pela prateleira e endereça vários itens em sequência.
 */
export async function salvarEnderecoEParametros(input: {
  stockItemId:        string
  locationId?:        string | null
  shelfCode?:         string | null
  leadTimeDays?:      number | null
  coverageDays?:      number | null
  purchaseMultiple?:  number | null
  purchaseMinimum?:   number | null
  returnable?:        boolean
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Só a gestão da clínica pode alterar o endereçamento do estoque.' }
  }

  const patch: Record<string, unknown> = {}
  if (input.locationId !== undefined)       patch.location_id = input.locationId || null
  if (input.shelfCode !== undefined)        patch.shelf_code = input.shelfCode?.trim() || null
  if (input.leadTimeDays !== undefined)     patch.lead_time_days = input.leadTimeDays ?? null
  if (input.coverageDays !== undefined)     patch.coverage_days = input.coverageDays ?? null
  if (input.purchaseMultiple !== undefined) patch.purchase_multiple = input.purchaseMultiple ?? null
  if (input.purchaseMinimum !== undefined)  patch.purchase_minimum = input.purchaseMinimum ?? null
  if (input.returnable !== undefined)       patch.returnable = input.returnable

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await ctx.admin
    .from('stock_items')
    .update(patch)
    .eq('id', input.stockItemId)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Erro ao salvar: ' + mensagemErro(error, 'lib/actions/stock-reposicao.ts') }

  revalidatePath('/dashboard/pharmacy')
  return { ok: true }
}

/**
 * Itens físicos para endereçar e parametrizar em sequência.
 *
 * Existe como listagem própria porque a tarefa é de prateleira: quem organiza o
 * estoque percorre a estante e endereça vários itens de uma vez. Abrir o cadastro
 * completo de cada item para preencher dois campos faria ninguém endereçar nada.
 */
export async function listItensParaEnderecar(busca?: string): Promise<ItemEnderecavel[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  let qb = ctx.admin
    .from('stock_items')
    .select(`
      id, name, unit, quantity, category, location_id, shelf_code,
      lead_time_days, coverage_days, purchase_multiple, purchase_minimum,
      returnable, is_controlled,
      local:stock_locations ( name )
    `)
    .eq('clinic_id', ctx.clinicId)
    .eq('is_service', false)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(300)

  const termo = (busca ?? '').trim()
  if (termo.length >= 2) {
    const pat = `%${termo}%`
    qb = qb.or(`name.ilike.${pat},sku.ilike.${pat},barcode.ilike.${pat},shelf_code.ilike.${pat}`)
  }

  const { data, error } = await qb
  if (error) return { error: 'Erro ao listar os itens: ' + mensagemErro(error, 'lib/actions/stock-reposicao.ts') }

  return (data ?? []).map((r): ItemEnderecavel => {
    const localRaw = (r as Record<string, unknown>).local
    const local = (Array.isArray(localRaw) ? localRaw[0] : localRaw) as { name?: string } | null
    return {
      id:                r.id as string,
      name:              r.name as string,
      unit:              (r.unit as string | null) ?? null,
      quantity:          Number(r.quantity ?? 0),
      category:          r.category as string,
      location_id:       (r.location_id as string | null) ?? null,
      location_name:     local?.name ?? null,
      shelf_code:        (r.shelf_code as string | null) ?? null,
      lead_time_days:    r.lead_time_days === null ? null : Number(r.lead_time_days),
      coverage_days:     r.coverage_days === null ? null : Number(r.coverage_days),
      purchase_multiple: r.purchase_multiple === null ? null : Number(r.purchase_multiple),
      purchase_minimum:  r.purchase_minimum === null ? null : Number(r.purchase_minimum),
      returnable:        r.returnable !== false,
      is_controlled:     Boolean(r.is_controlled),
    }
  })
}
