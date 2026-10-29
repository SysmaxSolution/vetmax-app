'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from './audit'
import { revalidatePath } from 'next/cache'
import { consumeStockForApplication, returnStockConsumption } from './stock-consumption'
import { conferirDevolucaoDoKit, resumirConferencia } from '@/lib/stock/kit-conferencia'
import type { ItemAplicado, MarcacaoConferencia } from '@/lib/stock/kit-conferencia'
import type {
  KitItem,
  ServiceKitSummary,
  ServiceKit,
  SurgeryChargeRow,
  SurgeryAccount,
  ApplyKitResult,
  KitApplicationRow,
  KitApplicationItemRow,
  ConferirKitResult,
} from '@/types/surgery-kits'

import { mensagemErro } from '@/lib/errors'
async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

// ─── Kits CRUD ────────────────────────────────────────────────────────────────

export async function listServiceKits(): Promise<ServiceKitSummary[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('service_kits')
    .select('id, name, description, service_kit_items(count)')
    .eq('clinic_id', ctx.clinicId).eq('is_active', true)
    .order('name', { ascending: true })
  if (error) return { error: mensagemErro(error, 'lib/actions/surgery-kits.ts') }
  return (data ?? []).map((r): ServiceKitSummary => ({
    id: r.id as string, name: r.name as string, description: (r.description as string | null) ?? null,
    item_count: Number((r.service_kit_items as { count: number }[] | null)?.[0]?.count ?? 0),
  }))
}

export async function createServiceKit(payload: { name: string; description?: string | null; items: KitItem[] }): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.name?.trim()) return { error: 'Informe o nome do kit.' }
  const items = (payload.items ?? []).filter(i => i.item_name?.trim() && i.quantity > 0)
  if (items.length === 0) return { error: 'Adicione ao menos um insumo ao kit.' }

  const admin = createAdminClient()
  const { data: kit, error } = await admin.from('service_kits')
    .insert({ clinic_id: ctx.clinicId, name: payload.name.trim(), description: payload.description?.trim() || null, created_by: ctx.userId })
    .select('id').single()
  if (error) return { error: 'Erro ao criar kit: ' + mensagemErro(error, 'lib/actions/surgery-kits.ts') }

  const rows = items.map((i, idx) => ({
    clinic_id: ctx.clinicId, kit_id: kit.id as string,
    stock_item_id: i.stock_item_id ?? null, item_name: i.item_name.trim(),
    quantity: i.quantity, sort_order: idx,
  }))
  const { error: itErr } = await admin.from('service_kit_items').insert(rows)
  if (itErr) { await admin.from('service_kits').delete().eq('id', kit.id); return { error: 'Erro ao salvar insumos: ' + mensagemErro(itErr, 'lib/actions/surgery-kits.ts') } }

  revalidatePath('/dashboard/surgery')
  return { id: kit.id as string }
}

export async function getServiceKit(id: string): Promise<ServiceKit | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data: kit, error } = await admin
    .from('service_kits')
    .select('id, name, description')
    .eq('id', id).eq('clinic_id', ctx.clinicId).single()
  if (error || !kit) return { error: (error ? mensagemErro(error, 'lib/actions/surgery-kits.ts') : 'Kit não encontrado.') }
  const { data: items } = await admin
    .from('service_kit_items')
    .select('stock_item_id, item_name, quantity')
    .eq('kit_id', id).eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })
  return {
    id: kit.id as string, name: kit.name as string, description: (kit.description as string | null) ?? null,
    item_count: items?.length ?? 0,
    items: (items ?? []).map((i): KitItem => ({
      stock_item_id: (i.stock_item_id as string | null) ?? null,
      item_name: i.item_name as string, quantity: Number(i.quantity ?? 1),
    })),
  }
}

export async function updateServiceKit(id: string, payload: { name: string; description?: string | null; items: KitItem[] }): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.name?.trim()) return { error: 'Informe o nome do kit.' }
  const items = (payload.items ?? []).filter(i => i.item_name?.trim() && i.quantity > 0)
  if (items.length === 0) return { error: 'Adicione ao menos um insumo ao kit.' }

  const admin = createAdminClient()
  const { error: upErr } = await admin.from('service_kits')
    .update({ name: payload.name.trim(), description: payload.description?.trim() || null })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (upErr) return { error: 'Erro ao atualizar kit: ' + mensagemErro(upErr, 'lib/actions/surgery-kits.ts') }

  // Substitui os insumos (delete + reinsert) para refletir a edição.
  await admin.from('service_kit_items').delete().eq('kit_id', id).eq('clinic_id', ctx.clinicId)
  const rows = items.map((i, idx) => ({
    clinic_id: ctx.clinicId, kit_id: id,
    stock_item_id: i.stock_item_id ?? null, item_name: i.item_name.trim(),
    quantity: i.quantity, sort_order: idx,
  }))
  const { error: itErr } = await admin.from('service_kit_items').insert(rows)
  if (itErr) return { error: 'Erro ao salvar insumos: ' + mensagemErro(itErr, 'lib/actions/surgery-kits.ts') }

  revalidatePath('/dashboard/surgery')
  return { success: true }
}

export async function deleteServiceKit(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin.from('service_kits').update({ is_active: false }).eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/surgery-kits.ts') }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}

// ─── Aplicar Kit a uma cirurgia (baixa FIFO + fatura) ─────────────────────────

/**
 * Faz o unroll do kit: consome cada insumo via rpc_apply_stock_consumption
 * (FIFO da Fase 1b) e lança o valor total na fatura da cirurgia (surgery_charges).
 */
/**
 * Aplica o kit a uma cirurgia: baixa cada insumo pela RPC FIFO e lanca o valor
 * na conta da cirurgia.
 *
 * Mudanca da Fase 4 (item 4.1): o que saiu passa a ser gravado ITEM A ITEM em
 * `surgery_kit_applications` + `..._items`, com o movimento de estoque de cada
 * linha. Antes a funcao consumia o kit e lancava um unico valor total, sem
 * guardar quais movimentos foram feitos — e por isso NAO HAVIA COMO DEVOLVER
 * nada. O material que voltava fechado para a prateleira continuava cobrado do
 * tutor e fora do saldo. E o vazamento que o Vinicius aponta como numero 1.
 */
export async function applyKitToSurgery(kitId: string, surgeryId: string): Promise<ApplyKitResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: kit } = await admin.from('service_kits').select('id, name').eq('id', kitId).eq('clinic_id', ctx.clinicId).single()
  if (!kit) return { error: 'Kit nao encontrado.' }

  const { data: surgery } = await admin
    .from('surgeries')
    .select('id, procedure_name, patient_id, consultation_id, patients ( name, tutors ( name ) )')
    .eq('id', surgeryId).eq('clinic_id', ctx.clinicId).single()
  if (!surgery) return { error: 'Cirurgia nao encontrada.' }

  // HISTÓRICO do Livro de Controlados: nº da OS vem da consulta que originou a cirurgia.
  let osNumero: string | null = null
  if (surgery.consultation_id) {
    const { data: cons } = await admin.from('consultations').select('os_number').eq('id', surgery.consultation_id as string).eq('clinic_id', ctx.clinicId).maybeSingle()
    osNumero = cons?.os_number == null ? null : String(cons.os_number)
  }
  const petLivro = Array.isArray(surgery.patients) ? surgery.patients[0] : surgery.patients
  const tutorLivro = petLivro ? (Array.isArray((petLivro as { tutors?: unknown }).tutors) ? ((petLivro as { tutors: { name?: string }[] }).tutors[0]) : ((petLivro as { tutors?: { name?: string } | null }).tutors)) : null
  const livro = {
    os_number:      osNumero,
    patient_name:   (petLivro as { name?: string } | null)?.name ?? null,
    tutor_name:     (tutorLivro as { name?: string } | null)?.name ?? null,
    procedure_name: ((surgery as { procedure_name?: string | null }).procedure_name ?? null) || `Cirurgia — kit ${kit.name as string}`,
  }

  const { data: items } = await admin
    .from('service_kit_items')
    .select('stock_item_id, item_name, quantity')
    .eq('kit_id', kitId).eq('clinic_id', ctx.clinicId).order('sort_order', { ascending: true })
  if (!items || items.length === 0) return { error: 'Kit sem insumos.' }

  // Preco, unidade e retornabilidade dos insumos vinculados a estoque.
  type Ficha = { unit_price: number; unit: string | null; returnable: boolean }
  const stockIds = items.map(i => i.stock_item_id).filter((x): x is string => !!x)
  const fichas = new Map<string, Ficha>()
  if (stockIds.length > 0) {
    const { data: stk } = await admin
      .from('stock_items')
      .select('id, unit_price, unit, returnable')
      .eq('clinic_id', ctx.clinicId)
      .in('id', stockIds)
    for (const r of stk ?? []) {
      fichas.set(r.id as string, {
        unit_price: Number(r.unit_price ?? 0),
        unit:       (r.unit as string | null) ?? null,
        returnable: r.returnable !== false,
      })
    }
  }

  // Cabecalho da aplicacao primeiro: as linhas penduram nele.
  const { data: app, error: appErr } = await admin
    .from('surgery_kit_applications')
    .insert({
      clinic_id:  ctx.clinicId,
      surgery_id: surgeryId,
      kit_id:     kitId,
      kit_name:   kit.name as string,
      applied_by: ctx.userId,
    })
    .select('id')
    .single()
  if (appErr || !app) {
    return { error: 'Erro ao registrar a aplicacao do kit: ' + ((appErr ? mensagemErro(appErr, 'lib/actions/surgery-kits.ts') : '')) }
  }
  const applicationId = app.id as string

  const pet = Array.isArray((surgery as Record<string, unknown>).patients)
    ? ((surgery as Record<string, unknown>).patients as { name?: string }[])[0]
    : ((surgery as Record<string, unknown>).patients as { name?: string } | null)
  const contexto = ['Kit ' + (kit.name as string),
    (surgery as { procedure_name?: string }).procedure_name ?? null,
    pet?.name ?? null,
  ].filter(Boolean).join(' - ')

  let total = 0, consumed = 0, reconciliation = 0, semVinculo = 0

  for (const it of items) {
    const qty = Number(it.quantity ?? 1)
    const stockItemId = (it.stock_item_id as string | null) ?? null
    const ficha = stockItemId ? fichas.get(stockItemId) : undefined
    let movementId: string | null = null

    if (stockItemId) {
      const res = await consumeStockForApplication({
        stock_item_id:   stockItemId,
        medication_name: it.item_name as string,
        quantity:        qty,
        source:          'CONSULTATION',
        reference_id:    applicationId,
        notes:           contexto,
        book:            livro,
      })
      if ('error' in res) {
        // Falha isolada de um insumo nao derruba a aplicacao do kit, mas fica
        // registrada: a linha entra sem movimento e aparece na conferencia.
        reconciliation++
      } else {
        movementId = res.movement_id
        consumed++
        if (res.requires_reconciliation) reconciliation++
      }
      total += (ficha?.unit_price ?? 0) * qty
    } else {
      // Insumo do kit sem vinculo com o estoque: nao baixa nada. Vale registrar
      // para quem confere saber que aquela linha nao mexe em saldo.
      semVinculo++
    }

    await admin.from('surgery_kit_application_items').insert({
      clinic_id:        ctx.clinicId,
      application_id:   applicationId,
      stock_item_id:    stockItemId,
      item_name:        it.item_name as string,
      unit:             ficha?.unit ?? null,
      quantity_planned: qty,
      unit_price:       ficha?.unit_price ?? 0,
      movement_id:      movementId,
      returnable:       ficha?.returnable ?? true,
    })
  }

  // Lanca o valor do kit na conta da cirurgia, amarrado a aplicacao para que a
  // conferencia possa abater o que voltou.
  await admin.from('surgery_charges').insert({
    clinic_id: ctx.clinicId, surgery_id: surgeryId, kind: 'kit',
    description: `Kit: ${kit.name}`, quantity: 1, unit_amount: total, amount: total,
    status: 'open', source_ref: kitId, created_by: ctx.userId,
    kit_application_id: applicationId,
  })

  revalidatePath('/dashboard/surgery')
  revalidatePath('/dashboard/pharmacy')
  return { application_id: applicationId, charged: total, consumed, reconciliation, sem_vinculo: semVinculo }
}

// ─── Conferencia da devolucao do nao-usado (item 4.1) ────────────────────────

/** Kits aplicados a uma cirurgia, com o que saiu e o que ja foi conferido. */
export async function listKitApplications(surgeryId: string): Promise<KitApplicationRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()

  const { data: apps, error } = await admin
    .from('surgery_kit_applications')
    .select(`
      id, surgery_id, kit_id, kit_name, status, applied_at, reconciled_at,
      aplicou:profiles!surgery_kit_applications_applied_by_fkey ( full_name ),
      conferiu:profiles!surgery_kit_applications_reconciled_by_fkey ( full_name )
    `)
    .eq('clinic_id', ctx.clinicId)
    .eq('surgery_id', surgeryId)
    .neq('status', 'cancelado')
    .order('applied_at', { ascending: false })
  if (error) return { error: mensagemErro(error, 'lib/actions/surgery-kits.ts') }
  if (!apps || apps.length === 0) return []

  const ids = apps.map(a => a.id as string)
  const { data: linhas } = await admin
    .from('surgery_kit_application_items')
    .select('id, application_id, stock_item_id, item_name, unit, quantity_planned, quantity_returned, quantity_lost, unit_price, returnable')
    .eq('clinic_id', ctx.clinicId)
    .in('application_id', ids)
    .order('created_at', { ascending: true })

  const { data: cobrancas } = await admin
    .from('surgery_charges')
    .select('kit_application_id, amount')
    .eq('clinic_id', ctx.clinicId)
    .in('kit_application_id', ids)
    .neq('status', 'void')

  const porApp = new Map<string, KitApplicationItemRow[]>()
  for (const l of linhas ?? []) {
    const chave = l.application_id as string
    if (!porApp.has(chave)) porApp.set(chave, [])
    porApp.get(chave)!.push({
      id:                l.id as string,
      stock_item_id:     (l.stock_item_id as string | null) ?? null,
      item_name:         l.item_name as string,
      unit:              (l.unit as string | null) ?? null,
      quantity_planned:  Number(l.quantity_planned ?? 0),
      quantity_returned: Number(l.quantity_returned ?? 0),
      quantity_lost:     Number(l.quantity_lost ?? 0),
      unit_price:        Number(l.unit_price ?? 0),
      returnable:        l.returnable !== false,
    })
  }

  const totalPorApp = new Map<string, number>()
  for (const c of cobrancas ?? []) {
    const chave = c.kit_application_id as string
    totalPorApp.set(chave, (totalPorApp.get(chave) ?? 0) + Number(c.amount ?? 0))
  }

  const nome = (v: unknown): string | null => {
    const p = Array.isArray(v) ? v[0] : v
    return (p as { full_name?: string } | null)?.full_name ?? null
  }

  return apps.map((a): KitApplicationRow => ({
    id:                 a.id as string,
    surgery_id:         a.surgery_id as string,
    kit_id:             (a.kit_id as string | null) ?? null,
    kit_name:           a.kit_name as string,
    status:             a.status as KitApplicationRow['status'],
    applied_at:         a.applied_at as string,
    applied_by_name:    nome((a as Record<string, unknown>).aplicou),
    reconciled_at:      (a.reconciled_at as string | null) ?? null,
    reconciled_by_name: nome((a as Record<string, unknown>).conferiu),
    items:              porApp.get(a.id as string) ?? [],
    total_cobrado:      Number(totalPorApp.get(a.id as string) ?? 0),
  }))
}

/**
 * Confere a devolucao do kit: devolve ao estoque o que voltou fechado, registra
 * como perda o que foi aberto sem uso, e abate da conta do tutor o que nao ficou
 * no animal.
 *
 * A conferencia e POR EXCECAO: quem confere marca so o que voltou; o resto se
 * assume consumido. No fim de uma cirurgia ninguem digita linha por linha, e
 * conferencia trabalhosa nao e feita — nao ser feita e o estado de hoje.
 *
 * A devolucao vai para os LOTES EXATOS de onde o material saiu, pelo rastro da
 * migration 0505. Falha de uma linha nao impede as outras, mas volta na resposta.
 */
export async function conferirDevolucaoKit(
  applicationId: string,
  marcacoes: MarcacaoConferencia[],
): Promise<ConferirKitResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()

  const { data: app } = await admin
    .from('surgery_kit_applications')
    .select('id, surgery_id, kit_name, status')
    .eq('id', applicationId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!app) return { error: 'Aplicacao de kit nao encontrada nesta clinica.' }
  if (app.status === 'conferido') return { error: 'Este kit ja foi conferido.' }
  if (app.status === 'cancelado') return { error: 'Esta aplicacao de kit foi cancelada.' }

  const { data: linhas } = await admin
    .from('surgery_kit_application_items')
    .select('id, stock_item_id, item_name, unit, quantity_planned, unit_price, returnable, movement_id')
    .eq('clinic_id', ctx.clinicId)
    .eq('application_id', applicationId)
  if (!linhas || linhas.length === 0) return { error: 'Aplicacao sem itens para conferir.' }

  const itens: ItemAplicado[] = linhas.map(l => ({
    id:               l.id as string,
    item_name:        l.item_name as string,
    unit:             (l.unit as string | null) ?? null,
    quantity_planned: Number(l.quantity_planned ?? 0),
    unit_price:       Number(l.unit_price ?? 0),
    returnable:       l.returnable !== false,
  }))

  const resultado = conferirDevolucaoDoKit(itens, marcacoes)
  const avisos = [...resultado.avisos]
  const porId = new Map(linhas.map(l => [l.id as string, l]))

  for (const linha of resultado.linhas) {
    const original = porId.get(linha.item_id)
    if (!original) continue
    const stockItemId = (original.stock_item_id as string | null) ?? null
    const movimentoOrigem = (original.movement_id as string | null) ?? null

    let returnMovementId: string | null = null
    let lossMovementId:   string | null = null

    // ─── devolucao ao estoque, nos lotes de origem ─────────────────────────
    // A RPC aceita devolucao parcial (p_quantity) e rateia sobre o rastro de
    // lote, entao total e parcial seguem o mesmo caminho. A trava de nao
    // devolver mais do que saiu e do banco.
    if (linha.devolvido > 0 && stockItemId) {
      if (!movimentoOrigem) {
        avisos.push(`"${linha.item_name}" nao tem baixa registrada — a devolucao nao pode ser aplicada ao estoque.`)
      } else {
        const dev = await returnStockConsumption(
          movimentoOrigem,
          `Devolucao do kit "${app.kit_name}" — material nao usado`,
          linha.devolvido,
        )
        if ('error' in dev) avisos.push(`"${linha.item_name}": ${dev.error}`)
        else returnMovementId = dev.movement_id
      }
    }

    // ─── perda do que abriu e nao usou ────────────────────────────────────
    if (linha.perdido > 0 && stockItemId) {
      const { data: perda, error: perdaErr } = await admin.rpc('rpc_register_stock_loss', {
        p_clinic_id:     ctx.clinicId,
        p_stock_item_id: stockItemId,
        p_quantity:      linha.perdido,
        p_reason:        'Material aberto sem uso na cirurgia',
        p_batch_id:      null,
        p_user_id:       ctx.userId,
        p_reference_id:  applicationId,
        p_notes:         `Kit "${app.kit_name}"`,
      })
      if (perdaErr) {
        avisos.push(`"${linha.item_name}": a perda nao foi registrada (${mensagemErro(perdaErr, 'lib/actions/surgery-kits.ts')}).`)
      } else {
        const row = Array.isArray(perda) ? perda[0] : perda
        lossMovementId = (row?.movement_id as string | undefined) ?? null
      }
    }

    await admin.from('surgery_kit_application_items')
      .update({
        quantity_returned:  linha.devolvido,
        quantity_lost:      linha.perdido,
        return_movement_id: returnMovementId,
        loss_movement_id:   lossMovementId,
      })
      .eq('id', linha.item_id)
      .eq('clinic_id', ctx.clinicId)
  }

  // ─── abate da conta da cirurgia o que nao ficou no animal ───────────────
  if (resultado.total_abatimento > 0) {
    const { data: cobranca } = await admin
      .from('surgery_charges')
      .select('id, amount')
      .eq('clinic_id', ctx.clinicId)
      .eq('kit_application_id', applicationId)
      .neq('status', 'void')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (cobranca) {
      const novo = Math.max(0, Number(cobranca.amount ?? 0) - resultado.total_abatimento)
      const { error: ajErr } = await admin.from('surgery_charges')
        .update({ amount: novo, unit_amount: novo })
        .eq('id', cobranca.id as string)
        .eq('clinic_id', ctx.clinicId)
      if (ajErr) {
        avisos.push('O valor do kit na conta da cirurgia NAO foi abatido: ' + mensagemErro(ajErr, 'lib/actions/surgery-kits.ts'))
      }
    } else {
      avisos.push('Nao encontrei a cobranca deste kit na conta da cirurgia — o abatimento precisa ser feito a mao.')
    }
  }

  await admin.from('surgery_kit_applications')
    .update({ status: 'conferido', reconciled_by: ctx.userId, reconciled_at: new Date().toISOString() })
    .eq('id', applicationId)
    .eq('clinic_id', ctx.clinicId)

  await logAudit({
    action: 'SURGERY_KIT_RECONCILED',
    entity_type: 'surgery_kit_applications',
    entity_id: applicationId,
    details: {
      surgery_id:  app.surgery_id,
      kit_name:    app.kit_name,
      devolvido:   resultado.total_devolvido,
      perdido:     resultado.total_perdido,
      abatimento:  resultado.total_abatimento,
      avisos,
    },
  })

  revalidatePath('/dashboard/surgery')
  revalidatePath('/dashboard/pharmacy')

  return {
    devolvido:  resultado.total_devolvido,
    perdido:    resultado.total_perdido,
    abatimento: resultado.total_abatimento,
    mensagem:   resumirConferencia(resultado),
    avisos,
  }
}

// ─── Fatura da cirurgia ───────────────────────────────────────────────────────

export async function getSurgeryAccount(surgeryId: string): Promise<SurgeryAccount | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('surgery_charges')
    .select('id, kind, description, amount, status, created_at')
    .eq('clinic_id', ctx.clinicId).eq('surgery_id', surgeryId).neq('status', 'void')
    .order('created_at', { ascending: false })
  if (error) return { error: mensagemErro(error, 'lib/actions/surgery-kits.ts') }
  const charges = (data ?? []).map((r): SurgeryChargeRow => ({
    id: r.id as string, kind: r.kind as string, description: r.description as string,
    amount: Number(r.amount ?? 0), status: r.status as string, created_at: r.created_at as string,
  }))
  return { charges, total: charges.reduce((s, c) => s + c.amount, 0) }
}
