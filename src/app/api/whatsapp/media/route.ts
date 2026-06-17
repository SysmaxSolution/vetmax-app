import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/whatsapp/media
// Recebe multipart/form-data com:
//   - file:           File
//   - conversationId: string
// Faz upload para Supabase Storage 'whatsapp-media'
// Retorna: { url, mimeType, fileName }

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav',
  'video/mp4', 'video/webm', 'video/ogg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])

const MAX_SIZE = 50 * 1024 * 1024 // 50 MB

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return NextResponse.json({ error: 'Clínica não encontrada.' }, { status: 403 })

  const clinicId = profile.clinic_id

  let formData: FormData
  try { formData = await request.formData() }
  catch { return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 }) }

  const file           = formData.get('file') as File | null
  const conversationId = formData.get('conversationId') as string | null

  if (!file) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 400 })
  if (!conversationId) return NextResponse.json({ error: 'conversationId obrigatório.' }, { status: 400 })

  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo muito grande (máx 50 MB).' }, { status: 413 })

  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ error: `Tipo de arquivo não suportado: ${mimeType}` }, { status: 415 })
  }

  // Verifica que a conversa pertence à clínica
  const admin = createAdminClient()
  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })

  // Gera nome único para o arquivo
  const ext      = file.name.split('.').pop() ?? 'bin'
  const uid      = crypto.randomUUID()
  const path     = `${clinicId}/${conversationId}/${uid}.${ext}`
  const fileName = file.name

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('whatsapp-media')
    .upload(path, bytes, { contentType: mimeType, upsert: false })

  if (uploadError) {
    console.error('[WPP Media Upload]', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = admin.storage
    .from('whatsapp-media')
    .getPublicUrl(path)

  return NextResponse.json({
    url:      urlData.publicUrl,
    mimeType,
    fileName,
  })
}
