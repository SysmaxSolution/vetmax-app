'use server'

// Tabela de referência do laudo — a clínica edita a sua.
//
// Quem manda no laudo é esta tabela, não o analisador: ela define a ordem das
// linhas, os rótulos, as faixas impressas, quais analitos entram e de onde vem
// cada valor (aparelho, lâmina ou texto). Ver src/lib/lab/reference-set.ts.
//
// Sem conjunto cadastrado o laudo continua como antes, com as faixas do
// aparelho — é o que mantém as clínicas que não usam isto intactas.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { parseFaixa } from '@/lib/lab/reference-range'

import { mensagemErro } from '@/lib/errors'
const PODE_EDITAR = ['admin', 'owner', 'manager', 'vet']

type Ctx = { admin: ReturnType<typeof createAdminClient>; clinicId: string; role: string }

async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return {
    admin: createAdminClient(),
    clinicId: profile.clinic_id as string,
    role: (profile.role as string) ?? '',
  }
}

export interface RefItemInput {
  label:        string
  analyte_code: string | null
  section:      string
  input_source: string
  unit:         string | null
  ref_text:     string | null
  ref_abs_text: string | null
  is_visible:   boolean
  is_editable:  boolean
  default_text: string | null
}

export interface RefItem extends RefItemInput {
  id:         string
  sort_order: number
  ref_low:    number | null
  ref_high:   number | null
  ref_abs_low:  number | null
  ref_abs_high: number | null
}

export interface RefSet {
  id:         string
  panel_key:  string
  species:    string | null
  name:       string
  is_active:  boolean
  notes:      string | null
  items:      RefItem[]
}

export async function listReferenceSets(): Promise<RefSet[]> {
  const c = await ctx(); if ('error' in c) return []
  const { data } = await c.admin
    .from('lab_reference_sets')
    .select('id, panel_key, species, name, is_active, notes, lab_reference_items(id, sort_order, label, analyte_code, section, input_source, unit, ref_text, ref_low, ref_high, ref_abs_text, ref_abs_low, ref_abs_high, is_visible, is_editable, default_text)')
    .eq('clinic_id', c.clinicId)
    .order('panel_key').order('species', { nullsFirst: true })
  return (data ?? []).map(s => ({
    id: s.id as string,
    panel_key: s.panel_key as string,
    species: (s.species as string) ?? null,
    name: s.name as string,
    is_active: s.is_active as boolean,
    notes: (s.notes as string) ?? null,
    items: (((s as { lab_reference_items?: RefItem[] }).lab_reference_items) ?? [])
      .slice().sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export async function createReferenceSet(input: {
  panel_key: string; species: string | null; name: string
}): Promise<{ ok: true; id: string } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para editar a tabela de referência.' }
  if (!input.name.trim()) return { error: 'Dê um nome à tabela.' }

  const { data, error } = await c.admin.from('lab_reference_sets').insert({
    clinic_id: c.clinicId,
    panel_key: input.panel_key.trim().toLowerCase(),
    species: input.species || null,
    name: input.name.trim(),
  }).select('id').single()

  if (error) {
    // O índice único é por clínica/exame/espécie — o erro cru não ajuda ninguém.
    if (error.code === '23505') return { error: 'Já existe uma tabela desse exame para essa espécie.' }
    return { error: mensagemErro(error, 'lib/actions/lab-reference-sets.ts') }
  }
  revalidatePath('/dashboard/management')
  return { ok: true, id: data.id as string }
}

/** Copia uma tabela inteira para outra espécie — o caminho de cão → gato. */
export async function duplicateReferenceSet(
  setId: string, input: { species: string | null; name: string },
): Promise<{ ok: true; id: string } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para editar a tabela de referência.' }

  const { data: origem } = await c.admin
    .from('lab_reference_sets').select('panel_key')
    .eq('clinic_id', c.clinicId).eq('id', setId).maybeSingle()
  if (!origem) return { error: 'Tabela de origem não encontrada.' }

  const novo = await createReferenceSet({
    panel_key: origem.panel_key as string, species: input.species, name: input.name,
  })
  if ('error' in novo) return novo

  const { data: itens } = await c.admin
    .from('lab_reference_items')
    .select('sort_order, label, analyte_code, section, input_source, unit, ref_text, ref_low, ref_high, ref_abs_text, ref_abs_low, ref_abs_high, is_visible, is_editable, default_text')
    .eq('clinic_id', c.clinicId).eq('set_id', setId)

  if ((itens ?? []).length) {
    const { error } = await c.admin.from('lab_reference_items').insert(
      (itens ?? []).map(i => ({ ...i, clinic_id: c.clinicId, set_id: novo.id })),
    )
    if (error) return { error: 'Tabela criada, mas as linhas não foram copiadas: ' + mensagemErro(error, 'lib/actions/lab-reference-sets.ts') }
  }
  revalidatePath('/dashboard/management')
  return novo
}

export async function updateReferenceSet(
  setId: string, patch: { name?: string; species?: string | null; is_active?: boolean; notes?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para editar a tabela de referência.' }
  const { error } = await c.admin.from('lab_reference_sets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('clinic_id', c.clinicId).eq('id', setId)
  if (error) return { error: mensagemErro(error, 'lib/actions/lab-reference-sets.ts') }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

export async function deleteReferenceSet(setId: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para editar a tabela de referência.' }
  const { error } = await c.admin.from('lab_reference_sets')
    .delete().eq('clinic_id', c.clinicId).eq('id', setId)
  if (error) return { error: mensagemErro(error, 'lib/actions/lab-reference-sets.ts') }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

/**
 * Grava a tabela inteira de uma vez (a tela edita o conjunto, não linha a linha).
 * As faixas numéricas são derivadas do texto que a clínica digitou — ela escreve
 * "5,5 A 8,5 milhões/mm³" e o sistema entende os limites sozinho.
 */
export async function saveReferenceItems(
  setId: string, itens: RefItemInput[],
): Promise<{ ok: true; count: number } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para editar a tabela de referência.' }

  const { data: conj } = await c.admin.from('lab_reference_sets')
    .select('id').eq('clinic_id', c.clinicId).eq('id', setId).maybeSingle()
  if (!conj) return { error: 'Tabela não encontrada nesta clínica.' }

  const limpos = itens.filter(i => i.label?.trim())
  const vistos = new Set<string>()
  for (const i of limpos) {
    const k = i.label.trim().toUpperCase()
    if (vistos.has(k)) return { error: `A linha "${i.label.trim()}" está repetida.` }
    vistos.add(k)
  }

  await c.admin.from('lab_reference_items').delete().eq('clinic_id', c.clinicId).eq('set_id', setId)

  if (limpos.length) {
    const rows = limpos.map((i, idx) => {
      const f = parseFaixa(i.ref_text)
      const fa = parseFaixa(i.ref_abs_text)
      return {
        clinic_id: c.clinicId, set_id: setId, sort_order: (idx + 1) * 10,
        label: i.label.trim(),
        analyte_code: i.analyte_code?.trim() || null,
        section: i.section, input_source: i.input_source,
        unit: i.unit?.trim() || null,
        ref_text: i.ref_text?.trim() || null, ref_low: f.low, ref_high: f.high,
        ref_abs_text: i.ref_abs_text?.trim() || null, ref_abs_low: fa.low, ref_abs_high: fa.high,
        is_visible: i.is_visible,
        // Linha de lâmina e de texto são sempre digitáveis; o campo só controla
        // o que vem do aparelho e pode ser corrigido (plaquetas).
        is_editable: i.input_source === 'device' ? i.is_editable : true,
        default_text: i.input_source === 'text' ? (i.default_text?.trim() || null) : null,
      }
    })
    const { error } = await c.admin.from('lab_reference_items').insert(rows)
    if (error) return { error: 'Erro ao gravar as linhas: ' + mensagemErro(error, 'lib/actions/lab-reference-sets.ts') }
  }

  revalidatePath('/dashboard/management')
  return { ok: true, count: limpos.length }
}
