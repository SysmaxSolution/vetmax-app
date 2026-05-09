import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionCreateInstance, evolutionGetConnectionState, evolutionSetWebhook } from '@/lib/evolution-api-client'

// POST /api/whatsapp/instance
// Cria (ou garante existência) de uma instância Evolution API para a clínica autenticada.
// Salva o nome da instância em clinic_whatsapp_settings.evolution_instance_name.
export async function POST() {
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
    return NextResponse.json({ error: 'Evolution API não configurada no servidor.' }, { status: 500 })
  }

  // Nome da instância = prefixo do clinic_id sem hífens (8 chars)
  const instanceName = 'vet' + profile.clinic_id.replace(/-/g, '').substring(0, 8)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const webhookUrl = appUrl.startsWith('http')
    ? `${appUrl}/api/webhooks/whatsapp/${profile.clinic_id}`
    : undefined

  const admin = createAdminClient()

  // Verifica se a instância já existe na Evolution API
  const currentState = await evolutionGetConnectionState({ apiUrl, instanceId: instanceName, apiKey })

  if (currentState === 'not_created') {
    const created = await evolutionCreateInstance({ apiUrl, apiKey, instanceName, webhookUrl })
    if (!created.ok) {
      console.error('[WhatsApp Instance] Falha ao criar instância:', created.status, created.body)
      return NextResponse.json({
        error:       'Falha ao criar instância na Evolution API.',
        apiStatus:   created.status,
        apiResponse: created.body,
      }, { status: 502 })
    }
    // Configura eventos do webhook separadamente (v1.8.4)
    if (webhookUrl) {
      await evolutionSetWebhook({ creds: { apiUrl, instanceId: instanceName, apiKey }, webhookUrl })
    }
  } else {
    // Instância existe — garante que o webhook está atualizado
    if (webhookUrl) {
      await evolutionSetWebhook({ creds: { apiUrl, instanceId: instanceName, apiKey }, webhookUrl })
    }
  }

  // Upsert em clinic_whatsapp_settings com as credenciais da Evolution API
  const { error: dbError } = await admin
    .from('clinic_whatsapp_settings')
    .upsert({
      clinic_id:               profile.clinic_id,
      provider_name:           'evolution-api',
      api_url:                 apiUrl,
      instance_id:             instanceName,
      token:                   apiKey,
      client_token:            null,
      is_active:               true,
      evolution_instance_name: instanceName,
    }, { onConflict: 'clinic_id' })

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ instanceName, state: currentState === 'not_created' ? 'created' : currentState })
}
