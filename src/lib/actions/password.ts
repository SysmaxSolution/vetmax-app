'use server'

import { createClient } from '@/lib/supabase/server'

export async function sendPasswordResetEmail(
  email: string
): Promise<{ success: true } | { error: string }> {
  if (!email || !email.includes('@')) {
    return { error: 'Informe um e-mail válido.' }
  }

  const supabase = await createClient()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?type=recovery`,
  })

  if (error) {
    return { error: 'Erro ao enviar e-mail de recuperação. Tente novamente.' }
  }

  return { success: true }
}
