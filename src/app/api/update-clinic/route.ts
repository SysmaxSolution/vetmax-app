import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logServerError } from '@/lib/error-logger'

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

    const {
      name, cnpj, address, phone, reception_checklist,
      city, state, cep, neighborhood,
    } = await request.json()

    const admin = createAdminClient()

    // Normaliza UF para 2 chars maiúsculas (evita inconsistência ao
    // resolver clinica.state nas Dynamic Tags).
    const normalizedState = typeof state === 'string'
      ? state.trim().toUpperCase().slice(0, 2)
      : null

    const { error } = await admin
      .from('clinics')
      .update({
        name,
        cnpj,
        address,
        phone,
        reception_checklist,
        city:         typeof city === 'string' ? city.trim() || null : null,
        state:        normalizedState || null,
        cep:          typeof cep === 'string' ? cep.trim() || null : null,
        neighborhood: typeof neighborhood === 'string' ? neighborhood.trim() || null : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.clinic_id)

    if (error) {
      await logServerError({
        path:     '/api/update-clinic',
        error:    error.message,
        source:   'api',
        module:   'management',
        clinicId: profile.clinic_id,
        userId:   user.id,
      })
      return NextResponse.json(
        { error: `Erro ao atualizar clínica: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Dados da clínica atualizados com sucesso',
    })
  } catch (err) {
    await logServerError({
      path:   '/api/update-clinic',
      error:  err,
      source: 'api',
      module: 'management',
    })
    return NextResponse.json(
      { error: 'Erro ao atualizar dados da clínica' },
      { status: 500 }
    )
  }
}
