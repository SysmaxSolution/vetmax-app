import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/get-current-user
 * Retorna dados do usuário logado (UUID + role)
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, clinic_id, full_name')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      user_id: user.id,
      email: user.email,
      role: profile?.role ?? 'unknown',
      clinic_id: profile?.clinic_id,
      full_name: profile?.full_name,
    })
  } catch (error) {
    console.error('Erro ao buscar usuário:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar usuário' },
      { status: 500 }
    )
  }
}
