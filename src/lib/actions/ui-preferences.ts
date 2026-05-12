'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface UiPreferences {
  intensity: 'normal' | 'intense' | 'off'
  custom_bg: string | null
}

export async function saveUiPreferences(prefs: UiPreferences): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase
    .from('profiles')
    .update({ ui_preferences: prefs })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard', 'layout')
  return {}
}
