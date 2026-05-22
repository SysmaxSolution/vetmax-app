'use server'

/**
 * Wrapper de server action para `extractEntitiesFromAnamneseCore`.
 * Mantido por retro-compat e quando o caller é um client component
 * que precisa invocar via Server Action. Adiciona checagem de
 * autenticação (a função core não autentica — caller decide).
 *
 * A lógica de extração vive em `@/lib/ai/anamnese-extractor` para
 * evitar bundle especial de 'use server' em paths críticos do build
 * (route handlers e server resolvers).
 */

import { createClient } from '@/lib/supabase/server'
import {
  extractEntitiesFromAnamneseCore,
  type ExtractedAnamneseEntities,
} from '@/lib/ai/anamnese-extractor'

export type { ExtractedAnamneseEntities } from '@/lib/ai/anamnese-extractor'

export async function extractEntitiesFromAnamnese(
  text: string | null | undefined,
): Promise<ExtractedAnamneseEntities> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { prescriptions: [], confidence: 'high', source: 'empty' }
  return extractEntitiesFromAnamneseCore(text)
}
