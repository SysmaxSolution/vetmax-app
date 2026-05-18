'use server'

/**
 * Server actions para o motor docx-native (docxtemplater + pizzip).
 *
 * Fluxo de importacao do template (admin):
 *   1) Cliente chama getDocxTemplateUploadUrl({}) -> recebe { folder_id, docx: { path, token } }
 *   2) Cliente faz upload direto via supabase.storage.uploadToSignedUrl(path, token, file)
 *   3) Cliente chama scanDocxTemplate(file) para extrair tags em paralelo
 *   4) Cliente persiste em document_templates: engine='docx-native', original_docx_path, docx_tags, extracted_fields
 *
 * Fluxo de geracao por paciente: ver document-generation-docx.ts.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'
import { logAudit } from './audit'
import { scanDocxTags, type ScannedTag } from '@/lib/docx/scan-tags'

const TEMPLATE_BUCKET = 'document-templates'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MAX_DOCX_BYTES = 100 * 1024 * 1024 // 100MB (sincronizado com bucket)

export async function getDocxTemplateUploadUrl(input: {
  folder_id?: string
}): Promise<{
  folder_id: string
  docx: { path: string; token: string }
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }
  if (profile.role !== 'admin') return { error: 'Apenas admin pode subir templates' }

  const folderId = input.folder_id && /^[0-9a-f-]{36}$/i.test(input.folder_id)
    ? input.folder_id
    : randomUUID()
  const path = `${profile.clinic_id}/${folderId}/template.docx`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(TEMPLATE_BUCKET)
    .createSignedUploadUrl(path, { upsert: false })
  if (error || !data) return { error: 'Erro criando token DOCX: ' + (error?.message || '') }

  await logAudit({
    action: 'TEMPLATE_DOCX_UPLOAD_URL_ISSUED',
    entity_type: 'document_templates_storage',
    entity_id: folderId,
    details: { folder_id: folderId, path },
  })

  return { folder_id: folderId, docx: { path, token: data.token } }
}

/**
 * Escaneia o DOCX (sem persistir no banco) e devolve tags + lista de fields
 * sugeridos no formato do `extracted_fields` ja consumido pelo editor.
 *
 * Roda 100% server-side para evitar enviar o binario do DOCX duas vezes.
 */
export async function scanDocxTemplate(
  formData: FormData,
): Promise<{
  tags: ScannedTag[]
  unknownLiterals: string[]
  fields: Array<{
    field_name: string
    field_type: string
    is_required: boolean
    label: string
    description: string
  }>
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Arquivo nao fornecido' }
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return { error: 'Arquivo deve ser .docx' }
  }
  if (file.size > MAX_DOCX_BYTES) {
    return { error: `Arquivo excede ${MAX_DOCX_BYTES / 1024 / 1024}MB` }
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const result = scanDocxTags(buf)

    // Deriva extracted_fields: 1 entry por canonical unico (deduplica
    // multiplas literais com mesma canonical, ex: medicamento1_posologia /
    // Medicamento1_posologia).
    const seenCanonical = new Set<string>()
    const fields: Array<{
      field_name: string
      field_type: string
      is_required: boolean
      label: string
      description: string
    }> = []
    for (const t of result.tags) {
      if (seenCanonical.has(t.canonical)) continue
      seenCanonical.add(t.canonical)
      const label = humanizeLabel(t.canonical)
      fields.push({
        field_name: t.canonical,
        field_type: guessFieldType(t.canonical),
        is_required: isRequiredCanonical(t.canonical),
        label,
        // Descricao obrigatoria pela validacao do saveTemplate; deriva do
        // proprio campo + tag literal pra dar contexto na UI.
        description: `${label} (preenchido automaticamente a partir do tag ${t.literal})`,
      })
    }

    return {
      tags: result.tags,
      unknownLiterals: result.unknownLiterals,
      fields,
    }
  } catch (err) {
    return {
      error: 'Falha ao escanear DOCX: ' + (err instanceof Error ? err.message : String(err)),
    }
  }
}

function guessFieldType(canonical: string): string {
  if (canonical.includes('weight') || canonical.includes('peso')) return 'number'
  if (canonical.includes('age') || canonical.includes('idade')) return 'text'
  if (canonical.endsWith('_dia') || canonical.endsWith('_mes') || canonical.endsWith('_ano')) return 'text'
  if (canonical.includes('crmv')) return 'text'
  if (canonical.includes('posologia') || canonical.includes('indicacoes')) return 'textarea'
  return 'text'
}

function isRequiredCanonical(canonical: string): boolean {
  const required = new Set([
    'patient_name',
    'tutor_name',
    'professional_name',
    'professional_crmv',
  ])
  return required.has(canonical)
}

function humanizeLabel(canonical: string): string {
  // medicamento_1_posologia -> "Medicamento 1 — Posologia"
  return canonical
    .replace(/^medicamento_(\d+)_(\w+)/, (_, n, k) =>
      `Medicamento ${n} — ${humanizeWord(k)}`,
    )
    .replace(/^patient_/, 'Pet ')
    .replace(/^professional_/, 'Profissional ')
    .replace(/^clinic_/, 'Clinica ')
    .replace(/^today_/, 'Data ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function humanizeWord(s: string): string {
  const m: Record<string, string> = {
    posologia: 'Posologia',
    indicacoes: 'Indicacoes',
    nome: 'Nome',
  }
  return m[s] ?? s
}

/**
 * Baixa o buffer DOCX do template para uso server-side (geracao por paciente).
 * RLS-checked: valida que o path comeca com clinic_id do usuario.
 */
export async function downloadDocxTemplate(
  docxPath: string,
): Promise<{ buffer: ArrayBuffer } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }
  if (!docxPath.startsWith(`${profile.clinic_id}/`)) {
    return { error: 'Acesso negado a este template' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(TEMPLATE_BUCKET).download(docxPath)
  if (error || !data) return { error: 'Erro download DOCX: ' + (error?.message || '') }
  return { buffer: await data.arrayBuffer() }
}

/**
 * Gera preview visual do template DOCX para exibicao no editor de
 * importacao. Pipeline:
 *   1) baixa DOCX do bucket (RLS-checked)
 *   2) renderiza com mock vazio (preserva placeholders na pagina)
 *   3) converte via Gotenberg -> PDF
 *   4) devolve PDF base64 ; cliente rasteriza com pdfToImages
 *
 * Quando Gotenberg nao esta configurado, retorna { ok: false, reason } —
 * o modal mostra banner explicativo e segue com a importacao mesmo assim.
 */
export async function getDocxTemplatePreviewPdf(
  docxPath: string,
): Promise<
  | { ok: true; pdf_base64: string }
  | { ok: false; reason: 'not_configured' | 'timeout' | 'http' | 'network' | 'error'; detail: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'error', detail: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { ok: false, reason: 'error', detail: 'Perfil sem clinica' }
  if (!docxPath.startsWith(`${profile.clinic_id}/`)) {
    return { ok: false, reason: 'error', detail: 'Acesso negado a este template' }
  }

  const { renderDocxTemplate } = await import('@/lib/docx/engine')
  const { tryConvertDocxToPdf } = await import('@/lib/docx/gotenberg')

  const admin = createAdminClient()
  const dl = await admin.storage.from(TEMPLATE_BUCKET).download(docxPath)
  if (dl.error || !dl.data) {
    return { ok: false, reason: 'error', detail: 'Erro download DOCX: ' + (dl.error?.message || '') }
  }

  let docxBuf: Buffer
  try {
    const arr = await dl.data.arrayBuffer()
    // mock vazio: deixa os placeholders intactos para a preview mostrar a
    // estrutura visual do template (logo, margens, distribuicao das secoes).
    const rendered = renderDocxTemplate(Buffer.from(arr), {}, { nullStrategy: 'literal' })
    docxBuf = rendered.buffer
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      detail: 'Falha render DOCX preview: ' + (err instanceof Error ? err.message : String(err)),
    }
  }

  const conv = await tryConvertDocxToPdf(docxBuf, { filename: 'preview.docx' })
  if (!conv.ok) return conv

  return { ok: true, pdf_base64: conv.pdf.toString('base64') }
}

