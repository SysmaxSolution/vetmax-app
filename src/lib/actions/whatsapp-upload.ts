'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BYTES = 16 * 1024 * 1024 // 16 MB (limite WhatsApp)

export async function uploadWhatsAppAttachment(formData: FormData): Promise<
  { url: string; name: string; mimeType: string } | { error: string }
> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'Nenhum arquivo recebido.' }
  if (file.size > MAX_BYTES) return { error: `Arquivo muito grande. Limite: 16 MB. (${(file.size / 1024 / 1024).toFixed(1)} MB)` }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path     = `${profile.clinic_id}/whatsapp-temp/${Date.now()}-${safeName}`
  const bytes    = await file.arrayBuffer()
  const admin    = createAdminClient()

  const { error: uploadError } = await admin.storage
    .from('patient-attachments')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadError) return { error: 'Falha no upload: ' + uploadError.message }

  const { data: signed } = await admin.storage
    .from('patient-attachments')
    .createSignedUrl(path, 7200) // 2 horas

  if (!signed?.signedUrl) return { error: 'Falha ao gerar URL assinada.' }

  return { url: signed.signedUrl, name: file.name, mimeType: file.type || 'application/octet-stream' }
}
