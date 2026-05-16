'use server'

import { createClient } from '@/lib/supabase/server'
import type { PatientSpecies } from '@/types'

export type BreedSuggestion = {
  id: string
  name: string
  species: PatientSpecies
  is_global: boolean
}

const MAX_RESULTS = 10

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Busca sugestões de raça por espécie + query (case/accent-insensitive).
 * Retorna até 10 resultados, priorizando match exato → prefixo → contains.
 * Inclui catálogo global + raças customizadas da clínica do usuário.
 */
export async function searchBreeds(
  species: PatientSpecies,
  query: string,
): Promise<BreedSuggestion[]> {
  const supabase = await createClient()
  const q = normalize(query)

  // Sem query: top 10 alfabético (mostra opções comuns ao focar o input)
  if (!q) {
    const { data, error } = await supabase
      .from('breeds')
      .select('id, name, species, is_global')
      .eq('species', species)
      .order('name', { ascending: true })
      .limit(MAX_RESULTS)
    if (error) return []
    return (data ?? []) as BreedSuggestion[]
  }

  // Busca por contains em name_norm. A ordenação por relevância é feita em JS
  // após o fetch (pequeno volume — máx ~30 candidatos).
  const { data, error } = await supabase
    .from('breeds')
    .select('id, name, name_norm, species, is_global')
    .eq('species', species)
    .ilike('name_norm', `%${q}%`)
    .limit(30)

  if (error) return []

  const scored = (data ?? []).map((b) => {
    const norm = b.name_norm as string
    let score = 2
    if (norm === q) score = 0          // exato
    else if (norm.startsWith(q)) score = 1   // prefixo
    return { id: b.id, name: b.name, species: b.species, is_global: b.is_global, score }
  })

  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'))

  return scored.slice(0, MAX_RESULTS).map(({ id, name, species, is_global }) => ({
    id, name, species, is_global,
  })) as BreedSuggestion[]
}

/**
 * Cria a raça no escopo da clínica do usuário caso ainda não exista
 * (no global nem na própria clínica). Idempotente.
 * Retorna a raça resultante ou erro.
 */
export async function createBreedIfMissing(
  species: PatientSpecies,
  name: string,
): Promise<{ breed: BreedSuggestion } | { error: string }> {
  const supabase = await createClient()
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Nome vazio.' }
  if (trimmed.length > 80) return { error: 'Nome muito longo (máx. 80 caracteres).' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const norm = normalize(trimmed)

  // Já existe (global ou na própria clínica)?
  const { data: existing } = await supabase
    .from('breeds')
    .select('id, name, species, is_global')
    .eq('species', species)
    .eq('name_norm', norm)
    .or(`clinic_id.is.null,clinic_id.eq.${profile.clinic_id}`)
    .limit(1)
    .maybeSingle()

  if (existing) return { breed: existing as BreedSuggestion }

  // Insere no escopo da clínica
  const { data: inserted, error } = await supabase
    .from('breeds')
    .insert({
      species,
      name: trimmed,
      clinic_id: profile.clinic_id,
      created_by: user.id,
    })
    .select('id, name, species, is_global')
    .single()

  if (error) {
    // Corrida: outra request inseriu entre o SELECT e o INSERT — tenta releitura
    const { data: retry } = await supabase
      .from('breeds')
      .select('id, name, species, is_global')
      .eq('species', species)
      .eq('name_norm', norm)
      .or(`clinic_id.is.null,clinic_id.eq.${profile.clinic_id}`)
      .limit(1)
      .maybeSingle()
    if (retry) return { breed: retry as BreedSuggestion }
    return { error: error.message }
  }

  return { breed: inserted as BreedSuggestion }
}
