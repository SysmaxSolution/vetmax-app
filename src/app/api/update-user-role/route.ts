import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_ROLES = ['admin', 'vet', 'assistant', 'receptionist', 'pharmacist'] as const
type Role = typeof VALID_ROLES[number]

/**
 * POST /api/update-user-role
 * Atualiza a role de um usuário na clínica. Requer que o caller seja admin.
 *
 * Body:
 *   - role: Role
 *   - target_user_id?: string  (omitir = atualiza o próprio perfil, apenas para auto-demoção)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const { role, target_user_id } = body as { role: unknown; target_user_id?: unknown }

    if (!role || !VALID_ROLES.includes(role as Role)) {
      return NextResponse.json({ error: 'Role inválida' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Busca perfil + clínica do caller
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, clinic_id')
      .eq('id', user.id)
      .single()

    if (!callerProfile?.clinic_id) {
      return NextResponse.json({ error: 'Perfil incompleto' }, { status: 403 })
    }

    if (callerProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Permissão insuficiente — apenas administradores podem alterar perfis' },
        { status: 403 },
      )
    }

    const targetId = typeof target_user_id === 'string' && target_user_id ? target_user_id : user.id

    // Garante que o target pertence à mesma clínica
    if (targetId !== user.id) {
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('clinic_id')
        .eq('id', targetId)
        .single()
      if (!targetProfile || targetProfile.clinic_id !== callerProfile.clinic_id) {
        return NextResponse.json({ error: 'Usuário não pertence a esta clínica' }, { status: 403 })
      }
    }

    const { error } = await admin
      .from('profiles')
      .update({ role: role as Role })
      .eq('id', targetId)
      .eq('clinic_id', callerProfile.clinic_id)

    if (error) {
      return NextResponse.json({ error: `Erro ao atualizar role: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, user_id: targetId, new_role: role })
  } catch (error) {
    console.error('Erro ao atualizar role:', error)
    return NextResponse.json({ error: 'Erro ao atualizar role' }, { status: 500 })
  }
}
