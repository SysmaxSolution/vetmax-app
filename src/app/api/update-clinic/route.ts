import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/update-clinic
 * Atualiza dados da clínica (admin only)
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

    // Verificar se é admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Apenas administradores podem editar dados da clínica' },
        { status: 403 }
      )
    }

    const { name, cnpj, address, phone, reception_checklist } = await request.json()

    const admin = createAdminClient()

    const { error } = await admin
      .from('clinics')
      .update({
        name,
        cnpj,
        address,
        phone,
        reception_checklist,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.clinic_id)

    if (error) {
      return NextResponse.json(
        { error: `Erro ao atualizar clínica: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Dados da clínica atualizados com sucesso',
    })
  } catch (error) {
    console.error('Erro ao atualizar clínica:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar dados da clínica' },
      { status: 500 }
    )
  }
}
