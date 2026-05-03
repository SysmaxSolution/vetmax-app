import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/update-user-role
 * Atualiza a role do usuário logado
 *
 * Body:
 *   - role: 'admin' | 'vet' | 'assistant' | 'receptionist' | 'pharmacist'
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      )
    }

    const { role } = await request.json()

    if (!role || !['admin', 'vet', 'assistant', 'receptionist', 'pharmacist'].includes(role)) {
      return NextResponse.json(
        { error: 'Role inválida' },
        { status: 400 }
      )
    }

    // Usar admin client para atualizar
    const admin = createAdminClient()

    const { error } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', user.id)

    if (error) {
      return NextResponse.json(
        { error: `Erro ao atualizar role: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user_id: user.id,
      new_role: role,
      message: `Role atualizada para '${role}'`,
    })
  } catch (error) {
    console.error('Erro ao atualizar role:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar role' },
      { status: 500 }
    )
  }
}
