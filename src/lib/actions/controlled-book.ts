'use server'

// Livro de Controlados (Fase 1 · item 1.7) — Portaria 344/1998 + RDC 22/2014.
// A montagem vive em src/lib/server/controlled-book-data.ts (compartilhada com
// a rota de exportação PDF/Excel). Aqui ficam só auth e o cadastro do
// responsável técnico que assina as folhas.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import { montarLivroControlados } from '@/lib/server/controlled-book-data'
import type { ControlledBook } from '@/types/controlled-book'

const PAPEIS_LEITURA = ['admin', 'owner', 'manager', 'accountant', 'vet']
const PAPEIS_EDICAO  = ['admin', 'owner', 'manager']

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { admin: createAdminClient(), clinic_id: profile.clinic_id as string, role: (profile.role as string) ?? 'staff' }
}

export async function getControlledBook(params: {
  from: string
  to:   string
}): Promise<ControlledBook | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!PAPEIS_LEITURA.includes(ctx.role)) return { error: 'Acesso negado ao Livro de Controlados.' }
  try {
    return await montarLivroControlados(ctx.admin, ctx.clinic_id, params.from, params.to)
  } catch (e) {
    return { error: 'Não foi possível montar o livro: ' + mensagemErro(e, 'lib/actions/controlled-book.ts') }
  }
}

/** Responsável técnico (MV) que assina as folhas do livro — um por estabelecimento. */
export async function salvarResponsavelTecnico(input: { name: string; crmv: string }): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!PAPEIS_EDICAO.includes(ctx.role)) return { error: 'Só a gestão da clínica altera o responsável técnico.' }
  const name = input.name.trim()
  const crmv = input.crmv.trim()
  if (name.length < 3) return { error: 'Informe o nome do responsável técnico.' }
  const { error } = await ctx.admin
    .from('clinics')
    .update({ technical_responsible_name: name, technical_responsible_crmv: crmv || null })
    .eq('id', ctx.clinic_id)
  if (error) return { error: 'Erro ao salvar: ' + mensagemErro(error, 'lib/actions/controlled-book.ts') }
  revalidatePath('/dashboard/reports')
  return { success: true }
}
