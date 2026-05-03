import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CRMV_REGEX = /^[A-Z]{2}[0-9]{4,10}$/

/**
 * POST /api/update-user-crmv
 * Atualiza o CRMV de um usuário (vet) da mesma clínica.
 * Apenas admin/owner/manager podem alterar CRMV de outros usuários.
 *
 * Body:
 *   - user_id: UUID do usuário alvo
 *   - crmv: string (ex: "SP12345") ou null para limpar
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { user_id, crmv } = await request.json()

    if (!user_id) {
      return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
    }

    // Valida formato CRMV se fornecido
    if (crmv !== null && crmv !== undefined && crmv !== '') {
      const upper = String(crmv).trim().toUpperCase()
      if (!CRMV_REGEX.test(upper)) {
        return NextResponse.json(
          { error: `Formato CRMV inválido: "${crmv}". Use 2 letras (UF) + 4-10 dígitos. Ex: SP12345` },
          { status: 400 }
        )
      }
    }

    // Verifica permissão: caller deve ser admin/owner/manager da mesma clínica
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single()

    if (!callerProfile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 403 })
    }

    if (!['admin', 'owner', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json(
        { error: 'Apenas administradores podem alterar o CRMV de outros usuários' },
        { status: 403 }
      )
    }

    const admin = createAdminClient()

    // Garante que o usuário alvo pertence à mesma clínica
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('clinic_id, role')
      .eq('id', user_id)
      .single()

    if (!targetProfile || targetProfile.clinic_id !== callerProfile.clinic_id) {
      return NextResponse.json({ error: 'Usuário não encontrado nesta clínica' }, { status: 404 })
    }

    const normalizedCrmv = crmv ? String(crmv).trim().toUpperCase() : null

    const { error } = await admin
      .from('profiles')
      .update({ crmv: normalizedCrmv })
      .eq('id', user_id)

    if (error) {
      // Erro de constraint = formato inválido chegou até o banco
      if (error.code === '23514') {
        return NextResponse.json(
          { error: 'CRMV com formato inválido. Padrão: UF (2 letras) + 4-10 dígitos.' },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user_id,
      crmv: normalizedCrmv,
    })
  } catch (err) {
    console.error('update-user-crmv error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
