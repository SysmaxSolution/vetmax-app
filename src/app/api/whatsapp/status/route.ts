import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionGetConnectionState } from '@/lib/evolution-api-client'

// GET /api/whatsapp/status
// Retorna o estado de conexão da instância Evolution API da clínica autenticada.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return NextResponse.json({ error: 'Clínica não encontrada.' }, { status: 400 })

  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) {
    return NextResponse.json({ state: 'not_created' })
  }

  // Lê o nome da instância salvo no banco
  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('clinic_whatsapp_settings')
    .select('evolution_instance_name')
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()

  const instanceName = settings?.evolution_instance_name
  if (!instanceName) {
    return NextResponse.json({ state: 'not_created' })
  }

  const state = await evolutionGetConnectionState({ apiUrl, instanceId: instanceName, apiKey })
  return NextResponse.json({ state, instanceName })
}
