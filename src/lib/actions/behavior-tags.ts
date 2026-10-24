'use server'

// Tags de comportamento próprias da clínica (além das padrão do sistema).
//
// Guardadas em `clinics.behavior_tags` (JSONB, migration 0517). A lista é
// pequena e lida junto com a configuração; não há tabela própria de propósito.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemErro } from '@/lib/errors'
import {
  BEHAVIOR_TAG_COLORS, normalizarRotuloDeTag,
  type BehaviorTagColor, type ClinicBehaviorTag,
} from '@/types/behavior-tags'

const ROTULO_MAX = 40

async function getCtx(): Promise<{ clinicId: string; role: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id as string, role: String(profile.role ?? '') }
}

function lerTags(raw: unknown): ClinicBehaviorTag[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(t => ({
      label: normalizarRotuloDeTag(String((t as { label?: unknown })?.label ?? '')),
      color: (BEHAVIOR_TAG_COLORS as readonly string[]).includes(String((t as { color?: unknown })?.color))
        ? (String((t as { color?: unknown }).color) as BehaviorTagColor)
        : 'gray',
    }))
    .filter(t => t.label)
}

export async function listClinicBehaviorTags(): Promise<ClinicBehaviorTag[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin.from('clinics').select('behavior_tags').eq('id', ctx.clinicId).maybeSingle()
  if (error) return { error: mensagemErro(error, 'lib/actions/behavior-tags.ts') }
  return lerTags(data?.behavior_tags)
}

/**
 * Cria uma tag nova para a clínica. Quem cadastra pet (recepção, MV,
 * gestão) pode criar — é no cadastro que a necessidade aparece.
 */
export async function addClinicBehaviorTag(input: { label: string; color: BehaviorTagColor }): Promise<ClinicBehaviorTag[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager', 'vet', 'receptionist', 'assistant'].includes(ctx.role)) return { error: 'Sem permissão para criar tags.' }

  const label = normalizarRotuloDeTag(input.label)
  if (!label) return { error: 'Escreva o nome da tag.' }
  if (label.length > ROTULO_MAX) return { error: `A tag pode ter no máximo ${ROTULO_MAX} letras.` }
  const color: BehaviorTagColor = (BEHAVIOR_TAG_COLORS as readonly string[]).includes(input.color) ? input.color : 'gray'

  const admin = createAdminClient()
  const { data } = await admin.from('clinics').select('behavior_tags').eq('id', ctx.clinicId).maybeSingle()
  const atuais = lerTags(data?.behavior_tags)
  if (atuais.some(t => t.label.toLowerCase() === label.toLowerCase())) return { error: `A tag "${label}" já existe.` }

  const novas = [...atuais, { label, color }]
  const { error } = await admin.from('clinics').update({ behavior_tags: novas }).eq('id', ctx.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/behavior-tags.ts') }
  return novas
}

/** Remove uma tag da clínica. Os pets que a tinham continuam com o texto — só deixa de ser sugerida. */
export async function removeClinicBehaviorTag(label: string): Promise<ClinicBehaviorTag[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Só a gestão pode remover tags da clínica.' }

  const admin = createAdminClient()
  const { data } = await admin.from('clinics').select('behavior_tags').eq('id', ctx.clinicId).maybeSingle()
  const alvo = normalizarRotuloDeTag(label).toLowerCase()
  const novas = lerTags(data?.behavior_tags).filter(t => t.label.toLowerCase() !== alvo)
  const { error } = await admin.from('clinics').update({ behavior_tags: novas }).eq('id', ctx.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/behavior-tags.ts') }
  return novas
}
