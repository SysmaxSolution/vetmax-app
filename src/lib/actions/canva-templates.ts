'use server'

/**
 * Canva Nativo — server actions (CRUD + signed URL de upload do papel timbrado).
 *
 * RLS por clinic_id já garantido pelas policies do bucket patient-documents-bg
 * e pela tabela document_templates / patient_documents.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CanvaContentJson, CanvaTemplateConfig, CanvaBlockStyle, CanvaDynamicField,
} from '@/lib/canva/types'
import { CANVA_DEFAULT_MARGINS, validateContent } from '@/lib/canva/types'
import type { CanvasState } from '@/lib/canva/canvas-state'
import { isCanvasState } from '@/lib/canva/canvas-state'
import type { FillableFieldElement } from '@/lib/canva/elements'
import type { VitalSigns } from '@/types'
import type { ResolveContext } from '@/lib/canva/dynamic-tags'
import { buildResolveContext } from '@/lib/canva/resolve-context'

const BG_BUCKET = 'patient-documents-bg'

async function requireClinic() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()

  if (error || !profile?.clinic_id) throw new Error('no clinic')
  return { supabase, user, profile }
}

/** Guard: apenas usuários is_sysmax = true podem executar a ação.
 *  Usado para operações cross-clinic (replicação de templates). */
async function requireSysmaxSupport() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, clinic_id, role, is_sysmax')
    .eq('id', user.id)
    .single()

  if (error || !profile) throw new Error('profile not found')
  if (!profile.is_sysmax) throw new Error('apenas Sysmax Suporte pode executar esta ação')
  return { supabase, user, profile }
}

// ── Upload do papel timbrado de fundo ────────────────────────────────────────

/**
 * Etapa 1: assina o PUT do papel timbrado de fundo.
 * Browser sobe o arquivo direto pro Supabase Storage usando upload_url.
 * Para obter a URL de leitura, chame getBackgroundReadUrl(storage_path)
 * APÓS o PUT completar — gerar antes resulta em "Object not found".
 */
export async function getBackgroundUploadUrl(filename: string): Promise<{
  upload_url: string
  storage_path: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode trocar papel timbrado')

  const admin = createAdminClient()
  const ext = filename.split('.').pop()?.toLowerCase() || 'png'
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    throw new Error('formato inválido — use PNG, JPG ou WEBP')
  }

  const path = `${profile.clinic_id}/bg_${Date.now()}.${ext}`

  const { data: upload, error: upErr } = await admin.storage
    .from(BG_BUCKET)
    .createSignedUploadUrl(path)
  if (upErr || !upload) throw new Error(upErr?.message ?? 'falha ao gerar URL de upload')

  return { upload_url: upload.signedUrl, storage_path: path }
}

/** Etapa 2: gera signed read URL (1 ano) APÓS o objeto existir no bucket. */
export async function getBackgroundReadUrl(storagePath: string): Promise<{
  signed_read_url: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode acessar papel timbrado')

  // Tenant guard: caminho começa com clinic_id?
  if (!storagePath.startsWith(`${profile.clinic_id}/`)) {
    throw new Error('caminho fora do escopo da clínica')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(BG_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  if (error || !data) throw new Error(error?.message ?? 'falha ao gerar URL de leitura')

  return { signed_read_url: data.signedUrl }
}

// ── Atualizar configuração do template (canva-native) ────────────────────────

export interface UpdateTemplateCanvaConfigInput {
  template_id: string
  background_image_url: string | null
  margin_top: number
  margin_bottom: number
  margin_left: number
  margin_right: number
  block_style: CanvaBlockStyle
}

export async function updateTemplateCanvaConfig(
  input: UpdateTemplateCanvaConfigInput,
): Promise<{ ok: true }> {
  const { supabase, profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode configurar modelo')

  const margins = [
    input.margin_top, input.margin_bottom, input.margin_left, input.margin_right,
  ]
  if (margins.some(m => m < 0 || m > 10)) throw new Error('margens devem estar entre 0 e 10cm')
  if (!['solid', 'transparent'].includes(input.block_style)) throw new Error('block_style inválido')

  const { error } = await supabase
    .from('document_templates')
    .update({
      background_image_url: input.background_image_url,
      margin_top: input.margin_top,
      margin_bottom: input.margin_bottom,
      margin_left: input.margin_left,
      margin_right: input.margin_right,
      block_style: input.block_style,
      engine: 'canva-native',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/management')
  return { ok: true }
}

// ── Sysmax Suporte: replicação cross-clinic de templates ────────────────────

export interface ClinicSummary {
  id: string
  name: string
  business_type: string
  status: string
}

export async function listClinicsForSupport(): Promise<ClinicSummary[]> {
  await requireSysmaxSupport()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinics')
    .select('id, name, business_type, status')
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as ClinicSummary[]
}

export interface DuplicateTemplateInput {
  template_id: string
  target_clinic_ids: string[]
  new_name?: string
  /** Quando true (default), copia papel timbrado e imagens fisicamente
   *  no Storage para a clínica destino (mantém path correto da RLS).
   *  Quando false, só estrutura — assets ficam vazios na cópia. */
  replicate_assets?: boolean
}

export interface DuplicateTemplateResult {
  created_ids: string[]
  skipped: Array<{ clinic_id: string; reason: string }>
  assets_copied: number
  assets_failed: number
}

export async function duplicateTemplateToClinics(
  input: DuplicateTemplateInput,
): Promise<DuplicateTemplateResult> {
  const { profile } = await requireSysmaxSupport()
  if (input.target_clinic_ids.length === 0) throw new Error('escolha ao menos uma clínica de destino')

  const replicateAssets = input.replicate_assets !== false
  const admin = createAdminClient()

  // 1. Lê template original — admin bypassa RLS (sysmax suporte é cross-clinic)
  const { data: original, error: readErr } = await admin
    .from('document_templates')
    .select(`
      name, type, file_url, extracted_fields, template_html, page_images,
      original_pdf_path, original_pdf_size_bytes, page_count, page_dimensions,
      layout_overlays, page_images_storage_paths, cleaned_page_paths,
      engine, background_image_url, margin_top, margin_bottom, margin_left, margin_right,
      block_style, canvas_state
    `)
    .eq('id', input.template_id)
    .single()
  if (readErr || !original) throw new Error(readErr?.message ?? 'template original não encontrado')

  const finalName = (input.new_name?.trim() || original.name)

  const created_ids: string[] = []
  const skipped: Array<{ clinic_id: string; reason: string }> = []
  let assets_copied = 0
  let assets_failed = 0

  for (const clinicId of input.target_clinic_ids) {
    // Idempotência via name + type
    const { data: existing } = await admin
      .from('document_templates')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('name', finalName)
      .eq('type', original.type)
      .maybeSingle()

    if (existing) {
      skipped.push({ clinic_id: clinicId, reason: `Já existe template "${finalName}" do tipo ${original.type}` })
      continue
    }

    // 2. Copia os assets fisicamente — cada clínica fica com seu próprio path
    //    no bucket (respeita RLS por clinic_id) mas conteúdo idêntico.
    let bgUrl: string | null = null
    let newCanvasState: unknown = original.canvas_state

    if (replicateAssets) {
      // Background da tabela document_templates (campo legado)
      if (original.background_image_url) {
        const cloned = await cloneStorageAsset(admin, original.background_image_url, null, clinicId)
        if (cloned) { bgUrl = cloned.signedUrl; assets_copied++ }
        else assets_failed++
      }
      // canvas_state (papel timbrado + image elements)
      const result = await replicateCanvasAssets(admin, original.canvas_state, clinicId)
      newCanvasState = result.state
      assets_copied += result.copied
      assets_failed += result.failed
    } else {
      // Modo estrutura-só: limpa as URLs
      bgUrl = null
      newCanvasState = stripCanvasAssetUrls(original.canvas_state)
    }

    const { data: inserted, error: insErr } = await admin
      .from('document_templates')
      .insert({
        clinic_id: clinicId,
        name: finalName,
        type: original.type,
        file_url: original.file_url,
        extracted_fields: original.extracted_fields ?? [],
        template_html: original.template_html,
        page_images: original.page_images,
        original_pdf_path: null,   // PDF original (motor pixel-perfect legado) — pula
        original_pdf_size_bytes: original.original_pdf_size_bytes,
        page_count: original.page_count,
        page_dimensions: original.page_dimensions,
        layout_overlays: original.layout_overlays,
        page_images_storage_paths: null,
        cleaned_page_paths: null,
        engine: original.engine,
        background_image_url: bgUrl,
        margin_top: original.margin_top,
        margin_bottom: original.margin_bottom,
        margin_left: original.margin_left,
        margin_right: original.margin_right,
        block_style: original.block_style,
        canvas_state: newCanvasState,
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      skipped.push({ clinic_id: clinicId, reason: insErr?.message ?? 'falha ao inserir' })
      continue
    }
    created_ids.push(inserted.id)
  }

  revalidatePath('/dashboard/management')

  console.log(
    `[sysmax-support] ${profile.id} duplicou template ${input.template_id} para ` +
    `${created_ids.length} clínica(s) (skipped: ${skipped.length}, ` +
    `assets: ${assets_copied} copiados / ${assets_failed} falhos)`
  )

  return { created_ids, skipped, assets_copied, assets_failed }
}

// ── Storage asset replication helpers ────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

/** Extrai o storage_path de uma signed URL do bucket patient-documents-bg.
 *  Formatos comuns:
 *    /storage/v1/object/sign/patient-documents-bg/<clinic_id>/<file>?token=...
 *    /storage/v1/object/public/patient-documents-bg/<clinic_id>/<file>
 *    /storage/v1/render/image/sign/patient-documents-bg/<path>?...
 */
function extractStoragePath(url: string): string | null {
  if (!url) return null
  const m = url.match(
    /\/storage\/v1\/(?:object|render\/image)\/(?:sign|public|authenticated)\/patient-documents-bg\/([^?]+)/,
  )
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}

/** Copia um asset do bucket patient-documents-bg para um novo path
 *  pertencente à clínica destino. Retorna a signed URL nova (1 ano). */
async function cloneStorageAsset(
  admin: AdminClient,
  sourceUrl: string | null | undefined,
  knownSourcePath: string | null | undefined,
  targetClinicId: string,
): Promise<{ signedUrl: string; storagePath: string } | null> {
  const sourcePath = knownSourcePath || (sourceUrl ? extractStoragePath(sourceUrl) : null)
  if (!sourcePath) {
    console.warn('[duplicate] sem storage_path extraível para asset:', sourceUrl)
    return null
  }

  const fileName = sourcePath.split('/').pop() ?? `asset_${Date.now()}.png`
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'png'
  // Prefixo "dup_" deixa claro no bucket que veio de uma replicação
  const targetPath = `${targetClinicId}/dup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`

  const { error: copyErr } = await admin.storage.from(BG_BUCKET).copy(sourcePath, targetPath)
  if (copyErr) {
    console.error(`[duplicate] copy ${sourcePath} → ${targetPath} falhou:`, copyErr.message)
    return null
  }

  const { data: read, error: readErr } = await admin.storage
    .from(BG_BUCKET)
    .createSignedUrl(targetPath, 60 * 60 * 24 * 365)
  if (readErr || !read) {
    console.error(`[duplicate] signedUrl ${targetPath} falhou:`, readErr?.message)
    return null
  }

  return { signedUrl: read.signedUrl, storagePath: targetPath }
}

/** Percorre canvas_state, copia background da página + URLs de image elements
 *  para a clínica destino. Retorna o novo canvas_state com URLs atualizadas. */
async function replicateCanvasAssets(
  admin: AdminClient,
  canvasState: unknown,
  targetClinicId: string,
): Promise<{ state: unknown; copied: number; failed: number }> {
  if (!canvasState || typeof canvasState !== 'object') return { state: canvasState, copied: 0, failed: 0 }
  const cs = { ...(canvasState as Record<string, unknown>) }
  let copied = 0
  let failed = 0

  // Background da página
  const page = cs.page as Record<string, unknown> | undefined
  if (page?.backgroundImageUrl && typeof page.backgroundImageUrl === 'string') {
    const cloned = await cloneStorageAsset(admin, page.backgroundImageUrl, null, targetClinicId)
    if (cloned) { cs.page = { ...page, backgroundImageUrl: cloned.signedUrl }; copied++ }
    else { failed++ }
  }

  // Image elements (kind='image' com url + storagePath opcional)
  const elements = cs.elements as Array<Record<string, unknown>> | undefined
  if (Array.isArray(elements)) {
    const replaced = await Promise.all(elements.map(async el => {
      if (el.kind === 'image' && typeof el.url === 'string' && el.url) {
        const cloned = await cloneStorageAsset(
          admin, el.url, typeof el.storagePath === 'string' ? el.storagePath : null,
          targetClinicId,
        )
        if (cloned) { copied++; return { ...el, url: cloned.signedUrl, storagePath: cloned.storagePath } }
        failed++
        return el
      }
      return el
    }))
    cs.elements = replaced
  }

  return { state: cs, copied, failed }
}

/** Limpa URLs de assets (modo "estrutura-só" no Duplicate). */
function stripCanvasAssetUrls(canvasState: unknown): unknown {
  if (!canvasState || typeof canvasState !== 'object') return canvasState
  const cs = canvasState as Record<string, unknown>
  const page = (cs.page as Record<string, unknown> | undefined) ?? null
  const elements = (cs.elements as Array<Record<string, unknown>> | undefined) ?? []
  return {
    ...cs,
    page: page ? { ...page, backgroundImageUrl: null } : page,
    elements: elements.map(el => el.kind === 'image' ? { ...el, url: '', storagePath: undefined } : el),
  }
}

// ── IA preenchendo Fillable Fields do Canvas Visual ──────────────────────────

export interface CanvasDraftResult {
  template_id: string
  template_name: string
  template_type: string
  /** Layout completo do template para renderizar preview ao vivo no
   *  modal de consulta (sem precisar recarregar dados do servidor). */
  canvas_state: CanvasState
  /** Config legacy (background/margens/block_style) — fallback quando
   *  canvas_state for null. */
  template_config: CanvaTemplateConfig
  /** Dados reais (clínica/vet/patient/tutor/consulta) para resolver
   *  Dynamic Tags no preview. */
  resolve_context: ResolveContext
  /** Snapshot do patient header pra exibir no modal. */
  patient_header: {
    patient_name?: string
    species?: string
    breed?: string
    sex?: string
    date?: string
    vet_name?: string
    crmv?: string
  }
  /** Definições dos FillableFieldElement extraídos do canvas_state. */
  fillable_definitions: FillableFieldElement[]
  /** Valores que a IA conseguiu inferir do contexto + transcrição. */
  fillable_values: Record<string, string>
  /** fieldKeys que a IA preencheu. */
  filled_keys: string[]
  /** fieldKeys que ficaram vazios (IA não soube preencher). */
  unfilled_keys: string[]
}

/**
 * Gera rascunho de documento Canvas Visual usando IA — preenche os
 * FillableFieldElement com base no contexto da consulta (transcrição de
 * voz + notas do vet + sinais vitais + dados do pet/tutor).
 *
 * Mesmo padrão da legacy generateDocumentDraft, mas trabalha com canvas_state
 * em vez de extracted_fields. Templates sem FillableFieldElement retornam
 * um draft vazio (vet preenche manualmente no editor).
 */
export async function generateCanvasDocumentDraft(
  templateId: string,
  consultationId: string,
  hint?: string,
): Promise<CanvasDraftResult | { error: string }> {
  const { supabase, profile } = await requireClinic()
  const admin = createAdminClient()

  // 1. Carrega template — incluindo config legacy para fallback do preview
  const { data: template, error: tErr } = await admin
    .from('document_templates')
    .select('id, name, type, canvas_state, background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style')
    .eq('id', templateId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (tErr || !template) return { error: 'Template não encontrado.' }
  if (!isCanvasState(template.canvas_state)) {
    return { error: 'Template não é Canvas Visual.' }
  }

  // 1.5. Pega patient_id da consulta (necessário pra buildResolveContext)
  const { data: consultMeta } = await admin
    .from('consultations')
    .select('patient_id')
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (!consultMeta) return { error: 'Consulta não encontrada.' }

  // 2. Extrai FillableFieldElement do canvas_state
  const cs = template.canvas_state as CanvasState
  const fillableDefs = cs.elements.filter(
    (e): e is FillableFieldElement => e.kind === 'fillable_field',
  )

  // Helper: monta payload comum independente de ter ou não fillable_fields.
  const buildBasePayload = async (): Promise<Omit<CanvasDraftResult,
    'fillable_definitions' | 'fillable_values' | 'filled_keys' | 'unfilled_keys'>> => {
    const resolveCtx = await buildResolveContext(
      supabase, profile.clinic_id, consultMeta.patient_id, consultationId,
    )
    return {
      template_id: template.id,
      template_name: template.name,
      template_type: template.type,
      canvas_state: cs,
      template_config: {
        background_image_url: template.background_image_url ?? null,
        margins: {
          top:    Number(template.margin_top ?? 2),
          bottom: Number(template.margin_bottom ?? 2),
          left:   Number(template.margin_left ?? 2),
          right:  Number(template.margin_right ?? 2),
        },
        block_style: (template.block_style as 'solid' | 'transparent') ?? 'solid',
      },
      resolve_context: resolveCtx,
      patient_header: {
        patient_name: (resolveCtx.patient as any)?.name,
        species:      (resolveCtx.patient as any)?.species,
        breed:        (resolveCtx.patient as any)?.breed,
        sex:          (resolveCtx.patient as any)?.gender,
        date:         new Date().toLocaleDateString('pt-BR'),
        vet_name:     (resolveCtx.vet as any)?.full_name,
        crmv:         (resolveCtx.vet as any)?.crmv,
      },
    }
  }

  // Sem campos preenchíveis → draft vazio (vet preenche manualmente, sem IA)
  if (fillableDefs.length === 0) {
    const base = await buildBasePayload()
    return {
      ...base,
      fillable_definitions: [],
      fillable_values: {},
      filled_keys: [],
      unfilled_keys: [],
    }
  }

  // 3. Carrega contexto da consulta (igual ao generateDocumentDraft legacy)
  const { data: consult, error: cErr } = await admin
    .from('consultations')
    .select('id, visit_reason, weight, temperature, triage_notes, vet_notes, audio_transcript, vital_signs, patient_id')
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (cErr || !consult) return { error: 'Consulta não encontrada.' }

  const { data: patient } = await admin
    .from('patients')
    .select('name, species, breed, gender, color, birth_date, neutered, allergies, chronic_diseases, past_surgeries, tutor_id')
    .eq('id', consult.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .single()

  const { data: tutor } = patient?.tutor_id
    ? await admin.from('tutors').select('name, cpf, phone').eq('id', patient.tutor_id).eq('clinic_id', profile.clinic_id).single()
    : { data: null }

  // 4. Reconstrói sinais vitais
  let vitals: Partial<VitalSigns> = {}
  if (consult.vital_signs && typeof consult.vital_signs === 'object') {
    vitals = consult.vital_signs as Partial<VitalSigns>
  } else if (consult.weight || consult.temperature || consult.triage_notes) {
    try { vitals = JSON.parse(consult.triage_notes ?? '') } catch { /* texto livre */ }
    vitals.weight = consult.weight ?? vitals.weight
    vitals.temperature = consult.temperature ?? vitals.temperature
  }

  // 5. Idade do pet
  const age = patient?.birth_date
    ? (() => {
        const months = Math.floor(
          (Date.now() - new Date(patient.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 30.5)
        )
        return months < 12 ? `${months} meses` : `${Math.floor(months / 12)} anos`
      })()
    : 'Não informada'

  // 6. Pacote de contexto pra IA
  const context = [
    `DADOS DO ATENDIMENTO:`,
    `Pet: ${patient?.name ?? 'N/I'} | Espécie: ${patient?.species ?? 'N/I'} | Raça: ${patient?.breed ?? 'N/I'}`,
    `Sexo: ${patient?.gender ?? 'N/I'} | Idade: ${age} | Pelagem: ${patient?.color ?? 'N/I'} | Castrado: ${patient?.neutered ? 'Sim' : 'Não'}`,
    `Alergias: ${patient?.allergies ?? 'Nenhuma conhecida'}`,
    `Doenças crônicas: ${patient?.chronic_diseases ?? 'Nenhuma'}`,
    `Cirurgias anteriores: ${patient?.past_surgeries ?? 'Nenhuma'}`,
    ``,
    `Tutor: ${tutor?.name ?? 'N/I'} | CPF: ${tutor?.cpf ?? 'N/I'} | Tel: ${tutor?.phone ?? 'N/I'}`,
    ``,
    `SINAIS VITAIS (Triagem):`,
    `Peso: ${vitals.weight ?? 'N/I'} kg | Temp. Retal: ${vitals.temperature ?? 'N/I'}°C`,
    `FC: ${vitals.heart_rate ?? 'N/I'} bpm | FR: ${vitals.respiratory_rate ?? 'N/I'} mov/min`,
    `Mucosas: ${vitals.mucous_color ?? 'N/I'} | TRC: ${vitals.crt ?? 'N/I'}`,
    `Queixa Principal: ${vitals.chief_complaint ?? 'N/I'}`,
    ``,
    `NOTAS DO VETERINÁRIO:`,
    consult.vet_notes || 'Não registradas',
    ``,
    `TRANSCRIÇÃO DE VOZ:`,
    consult.audio_transcript || 'Não disponível',
  ].join('\n')

  const fieldsDesc = fillableDefs
    .map(f => {
      const type = f.inputType ?? 'text'
      const req = f.required ? ' [OBRIGATÓRIO]' : ''
      const hintTxt = f.placeholder ? ` (formato: ${f.placeholder})` : ''
      return `- ${f.fieldKey} — "${f.label.replace(/:\s*$/, '').trim()}"${req} (tipo: ${type})${hintTxt}`
    })
    .join('\n')

  const hintSection = hint
    ? `\nCONTEXTO ADICIONAL (sugestão de voz):\n"${hint}"\n`
    : ''

  const prompt = `Você é um assistente de documentação clínica veterinária. Preencha os CAMPOS do laudo abaixo com base nos dados do atendimento.

${context}
${hintSection}
CAMPOS A PREENCHER — template "${template.name}" (${template.type}):
${fieldsDesc}

REGRAS ABSOLUTAS:
1. Retorne APENAS um objeto JSON válido, sem markdown, sem texto extra
2. Use os fieldKey exatos como chaves (snake_case)
3. Preencha SOMENTE campos onde há informação concreta nos dados acima
4. Para campos sem informação concreta, use null — NUNCA invente dados clínicos
5. Datas em formato DD/MM/AAAA (ex: para "data_retirada_pontos", se a transcrição menciona "10 dias", calcule a partir de HOJE)
6. Números sem unidades (ex: 12.5 não "12.5 kg")
7. Texto em PT-BR formal e objetivo
8. Hoje é ${new Date().toLocaleDateString('pt-BR')}

Responda SOMENTE com o JSON:`

  // 7. Chama IA
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    let aiValues: Record<string, unknown> = {}
    try {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) aiValues = JSON.parse(match[0])
    } catch {
      // Sem fallback útil — segue retornando vazio para vet preencher
      aiValues = {}
    }

    // 8. Normaliza valores: apenas strings não-vazias contam como "preenchido"
    const fillable_values: Record<string, string> = {}
    const filled_keys: string[] = []
    const unfilled_keys: string[] = []

    for (const def of fillableDefs) {
      const raw = aiValues[def.fieldKey]
      if (raw === null || raw === undefined || raw === '') {
        // IA não preencheu — usa defaultValue se houver
        if (def.defaultValue) {
          fillable_values[def.fieldKey] = def.defaultValue
          filled_keys.push(def.fieldKey)
        } else {
          unfilled_keys.push(def.fieldKey)
        }
      } else {
        fillable_values[def.fieldKey] = String(raw)
        filled_keys.push(def.fieldKey)
      }
    }

    const base = await buildBasePayload()
    return {
      ...base,
      fillable_definitions: fillableDefs,
      fillable_values,
      filled_keys,
      unfilled_keys,
    }
  } catch (e: any) {
    return { error: e?.message ?? 'IA indisponível no momento.' }
  }
}

// ── Criação de modelo em branco (entrada do Canvas Editor) ──────────────────

export interface CreateBlankCanvasTemplateInput {
  name: string
  type: 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'
}

export async function createBlankCanvasTemplate(
  input: CreateBlankCanvasTemplateInput,
): Promise<{ id: string }> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode criar modelos')

  const name = input.name.trim()
  if (!name) throw new Error('informe um nome para o modelo')

  const admin = createAdminClient()

  const blankCanvasState = {
    version: 1,
    page: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 2, bottom: 2, left: 2, right: 2 },
      backgroundImageUrl: null,
    },
    elements: [],
  }

  const { data, error } = await admin
    .from('document_templates')
    .insert({
      clinic_id: profile.clinic_id,
      name,
      type: input.type,
      file_url: null,
      extracted_fields: [],
      canvas_state: blankCanvasState,
      engine: 'canva-native',
      margin_top: 2.0,
      margin_bottom: 2.0,
      margin_left: 2.0,
      margin_right: 2.0,
      block_style: 'solid',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'falha ao criar modelo')

  revalidatePath('/dashboard/management')
  return { id: data.id }
}

// ── Herdar de modelo existente (lista + clonagem dentro da mesma clínica) ───

export interface InheritableTemplateSummary {
  id: string
  name: string
  type: 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'
  updated_at: string | null
  has_background: boolean
  element_count: number
}

/** Lista templates Canvas Visual da clínica do usuário, para herdar layout.
 *  Filtra somente os que têm canvas_state válido (engine canva-native ou
 *  templates legados que tenham sido convertidos). */
export async function listCanvasTemplatesForInherit(): Promise<InheritableTemplateSummary[]> {
  const { supabase, profile } = await requireClinic()

  const { data, error } = await supabase
    .from('document_templates')
    .select('id, name, type, updated_at, canvas_state, background_image_url')
    .eq('clinic_id', profile.clinic_id)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  return (data ?? [])
    .filter(t => isCanvasState(t.canvas_state))
    .map(t => {
      const cs = t.canvas_state as CanvasState
      return {
        id: t.id,
        name: t.name,
        type: t.type as InheritableTemplateSummary['type'],
        updated_at: t.updated_at,
        has_background: Boolean(cs.page?.backgroundImageUrl || t.background_image_url),
        element_count: Array.isArray(cs.elements) ? cs.elements.length : 0,
      }
    })
}

export interface CreateCanvasTemplateFromExistingInput {
  name: string
  type: 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'
  source_template_id: string
}

/** Cria um novo template Canvas clonando canvas_state + assets de um template
 *  existente da MESMA clínica. Assets são fisicamente copiados no Storage para
 *  novos paths — assim deletar o pai não quebra o filho. */
export async function createCanvasTemplateFromExisting(
  input: CreateCanvasTemplateFromExistingInput,
): Promise<{ id: string; canvas_state: CanvasState }> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode criar modelos')

  const name = input.name.trim()
  if (!name) throw new Error('informe um nome para o modelo')

  const admin = createAdminClient()

  // 1. Lê o source — admin client + filtro explícito de clinic_id garante isolamento
  const { data: source, error: srcErr } = await admin
    .from('document_templates')
    .select(`
      canvas_state, background_image_url,
      margin_top, margin_bottom, margin_left, margin_right, block_style
    `)
    .eq('id', input.source_template_id)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (srcErr || !source) throw new Error(srcErr?.message ?? 'template de origem não encontrado')
  if (!isCanvasState(source.canvas_state)) {
    throw new Error('template de origem não é Canvas Visual')
  }

  // 2. Clona assets (papel timbrado + image elements) para novos paths
  const { state: clonedRaw } = await replicateCanvasAssets(
    admin, source.canvas_state, profile.clinic_id,
  )
  if (!isCanvasState(clonedRaw)) {
    throw new Error('canvas_state clonado ficou inválido — abortando herança')
  }
  const newCanvasState: CanvasState = clonedRaw

  // 3. Clona background da coluna legada (se houver)
  let bgUrl: string | null = null
  if (source.background_image_url) {
    const cloned = await cloneStorageAsset(admin, source.background_image_url, null, profile.clinic_id)
    if (cloned) bgUrl = cloned.signedUrl
  }

  const { data: inserted, error: insErr } = await admin
    .from('document_templates')
    .insert({
      clinic_id: profile.clinic_id,
      name,
      type: input.type,
      file_url: null,
      extracted_fields: [],
      canvas_state: newCanvasState,
      engine: 'canva-native',
      background_image_url: bgUrl,
      margin_top: source.margin_top ?? 2.0,
      margin_bottom: source.margin_bottom ?? 2.0,
      margin_left: source.margin_left ?? 2.0,
      margin_right: source.margin_right ?? 2.0,
      block_style: source.block_style ?? 'solid',
    })
    .select('id')
    .single()

  if (insErr || !inserted) throw new Error(insErr?.message ?? 'falha ao criar modelo herdado')

  revalidatePath('/dashboard/management')
  return { id: inserted.id, canvas_state: newCanvasState }
}

// ── Canvas Editor (drag&drop) ────────────────────────────────────────────────

/**
 * Etapa 1: assina o PUT de uma imagem interna do canvas (logo, carimbo).
 * Browser faz o PUT; depois chama getCanvasImageReadUrl(storage_path)
 * para obter a URL de leitura. Gerar read URL antes do PUT falha com
 * "Object not found" no Supabase Storage.
 */
export async function getCanvasImageUploadUrl(filename: string): Promise<{
  upload_url: string
  storage_path: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode subir imagens do canvas')

  const admin = createAdminClient()
  const ext = filename.split('.').pop()?.toLowerCase() || 'png'
  if (!['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
    throw new Error('formato inválido — use PNG, JPG, WEBP ou SVG')
  }

  const path = `${profile.clinic_id}/canvas/img_${Date.now()}.${ext}`

  const { data: up, error: upErr } = await admin.storage.from(BG_BUCKET).createSignedUploadUrl(path)
  if (upErr || !up) throw new Error(upErr?.message ?? 'falha ao gerar URL upload')

  return { upload_url: up.signedUrl, storage_path: path }
}

/** Etapa 2: gera signed read URL após o PUT da imagem do canvas. */
export async function getCanvasImageReadUrl(storagePath: string): Promise<{
  signed_read_url: string
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode acessar imagens do canvas')

  if (!storagePath.startsWith(`${profile.clinic_id}/`)) {
    throw new Error('caminho fora do escopo da clínica')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BG_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  if (error || !data) throw new Error(error?.message ?? 'falha ao gerar URL leitura')

  return { signed_read_url: data.signedUrl }
}

export interface UpdateTemplateCanvasStateInput {
  template_id: string
  canvas_state: CanvasState
}

export async function updateTemplateCanvasState(
  input: UpdateTemplateCanvasStateInput,
): Promise<{ ok: true }> {
  const { supabase, profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode configurar modelo')

  if (!isCanvasState(input.canvas_state)) {
    throw new Error('canvas_state inválido (esperado {version:1, page, elements})')
  }

  const { error } = await supabase
    .from('document_templates')
    .update({
      canvas_state: input.canvas_state,
      // Sincroniza espelhos legados para que o motor Canva básico siga
      // funcionando se o admin recuar para o editor simples.
      background_image_url: input.canvas_state.page.backgroundImageUrl ?? null,
      margin_top:    input.canvas_state.page.margins.top,
      margin_bottom: input.canvas_state.page.margins.bottom,
      margin_left:   input.canvas_state.page.margins.left,
      margin_right:  input.canvas_state.page.margins.right,
      engine: 'canva-native',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/management')
  return { ok: true }
}

export async function loadTemplateCanvasState(templateId: string): Promise<CanvasState | null> {
  const { supabase, profile } = await requireClinic()

  const { data, error } = await supabase
    .from('document_templates')
    .select('canvas_state')
    .eq('id', templateId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error || !data) return null
  return isCanvasState(data.canvas_state) ? (data.canvas_state as CanvasState) : null
}

// ── Persistir patient_document gerado ────────────────────────────────────────

export interface CreateCanvaPatientDocumentInput {
  template_id: string
  patient_id: string
  consultation_id: string
  document_name: string
  content_json: CanvaContentJson
}

export async function createCanvaPatientDocument(
  input: CreateCanvaPatientDocumentInput,
): Promise<{ id: string }> {
  const { supabase, profile } = await requireClinic()

  if (!validateContent(input.content_json)) {
    throw new Error('content_json inválido (esperado static_fields + dynamic_fields[])')
  }

  // Lê config do template para snapshot (vet pode imprimir histórico anos depois
  // mesmo se o admin trocar o papel timbrado no meio do caminho)
  const { data: tpl, error: tplErr } = await supabase
    .from('document_templates')
    .select('background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style')
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (tplErr || !tpl) throw new Error(tplErr?.message ?? 'template não encontrado')

  const { data, error } = await supabase
    .from('patient_documents')
    .insert({
      clinic_id: profile.clinic_id,
      patient_id: input.patient_id,
      consultation_id: input.consultation_id,
      template_id: input.template_id,
      document_name: input.document_name,
      content_json: input.content_json,
      background_image_url: tpl.background_image_url,
      margin_top: tpl.margin_top ?? CANVA_DEFAULT_MARGINS.top,
      margin_bottom: tpl.margin_bottom ?? CANVA_DEFAULT_MARGINS.bottom,
      margin_left: tpl.margin_left ?? CANVA_DEFAULT_MARGINS.left,
      margin_right: tpl.margin_right ?? CANVA_DEFAULT_MARGINS.right,
      block_style: tpl.block_style ?? 'solid',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'falha ao salvar laudo')
  revalidatePath('/dashboard/consultation')
  return { id: data.id }
}

export async function loadCanvaPatientDocument(documentId: string): Promise<{
  config: CanvaTemplateConfig
  content: CanvaContentJson
  document_name: string
  canvas_state: CanvasState | null
}> {
  const { supabase, profile } = await requireClinic()

  const { data, error } = await supabase
    .from('patient_documents')
    .select('document_name, content_json, background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style, template_id')
    .eq('id', documentId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'documento não encontrado')

  // Busca canvas_state do template (motor visual). Snapshot por documento
  // ainda não é persistido — para histórico fiel, copiar canvas_state em
  // patient_documents é uma melhoria futura.
  let canvas_state: CanvasState | null = null
  if (data.template_id) {
    const { data: tpl } = await supabase
      .from('document_templates')
      .select('canvas_state')
      .eq('id', data.template_id)
      .eq('clinic_id', profile.clinic_id)
      .single()
    if (tpl && isCanvasState(tpl.canvas_state)) {
      canvas_state = tpl.canvas_state as CanvasState
    }
  }

  return {
    document_name: data.document_name,
    content: (data.content_json as CanvaContentJson) ?? { static_fields: {}, dynamic_fields: [] },
    canvas_state,
    config: {
      background_image_url: data.background_image_url ?? null,
      margins: {
        top: Number(data.margin_top ?? 2),
        bottom: Number(data.margin_bottom ?? 2),
        left: Number(data.margin_left ?? 2),
        right: Number(data.margin_right ?? 2),
      },
      block_style: (data.block_style as CanvaBlockStyle) ?? 'solid',
    },
  }
}

// ── Edit / Delete de documentos já gerados ───────────────────────────────────

export interface UpdateCanvaPatientDocumentInput {
  document_id: string
  document_name: string
  content_json: CanvaContentJson
}

/** Atualiza nome + content_json de um patient_document Canvas já criado.
 *  Usado quando o vet reabre o documento no consultório pra ajustar
 *  fillable_fields. NÃO toca em template_id, background, margens —
 *  esses ficam congelados no snapshot original da geração. */
export async function updateCanvaPatientDocument(
  input: UpdateCanvaPatientDocumentInput,
): Promise<{ id: string }> {
  const { supabase, profile } = await requireClinic()

  if (!validateContent(input.content_json)) {
    throw new Error('content_json inválido (esperado static_fields + dynamic_fields[])')
  }

  const { data, error } = await supabase
    .from('patient_documents')
    .update({
      document_name: input.document_name,
      content_json: input.content_json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.document_id)
    .eq('clinic_id', profile.clinic_id)
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'falha ao atualizar documento')
  revalidatePath('/dashboard/consultation')
  revalidatePath(`/dashboard/laudos/${input.document_id}/print`)
  return { id: data.id }
}

/** Exclui um patient_document — vale tanto pra docs Canvas quanto legados,
 *  porque a tabela é a mesma. RLS por clinic_id garante isolamento. */
export async function deletePatientDocument(documentId: string): Promise<{ id: string }> {
  const { supabase, profile } = await requireClinic()

  const { data, error } = await supabase
    .from('patient_documents')
    .delete()
    .eq('id', documentId)
    .eq('clinic_id', profile.clinic_id)
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'falha ao excluir documento')
  revalidatePath('/dashboard/consultation')
  return { id: data.id }
}

/** Carrega doc Canvas existente no shape CanvasDraftResult (+ document_id)
 *  para reabertura no CanvasDocumentDraftModal em modo edição.
 *  Reutiliza canvas_state ATUAL do template (não snapshot histórico). */
export async function loadCanvaDocumentForEdit(documentId: string): Promise<
  (CanvasDraftResult & { document_id: string; existing_doc_name: string }) | { error: string }
> {
  const { supabase, profile } = await requireClinic()

  const { data: doc, error: docErr } = await supabase
    .from('patient_documents')
    .select('id, document_name, content_json, template_id, patient_id, consultation_id, created_at, background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style')
    .eq('id', documentId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (docErr || !doc) return { error: 'Documento não encontrado.' }
  if (!doc.template_id) return { error: 'Documento sem template — não pode ser editado no motor Canvas.' }

  const { data: template, error: tplErr } = await supabase
    .from('document_templates')
    .select('id, name, type, canvas_state')
    .eq('id', doc.template_id)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (tplErr || !template) return { error: 'Template do documento não encontrado.' }
  if (!isCanvasState(template.canvas_state)) {
    return { error: 'Template não é Canvas Visual — use o motor legado pra editar.' }
  }

  const cs = template.canvas_state as CanvasState
  const fillableDefs = cs.elements.filter(
    (e): e is FillableFieldElement => e.kind === 'fillable_field',
  )

  // Para edição usamos a data ORIGINAL da emissão — assim consulta.date no
  // preview reflete a data em que o documento foi gerado, não "agora".
  const resolveCtx = await buildResolveContext(
    supabase, profile.clinic_id, doc.patient_id, doc.consultation_id,
    { documentDate: doc.created_at ? new Date(doc.created_at) : undefined },
  )

  // fillable_values vem do content_json salvo; vazios viram unfilled_keys
  const content = (doc.content_json as CanvaContentJson) ?? { static_fields: {}, dynamic_fields: [] }
  const savedFillable = content.fillable_fields ?? {}
  const fillable_values: Record<string, string> = {}
  const filled_keys: string[] = []
  const unfilled_keys: string[] = []
  for (const def of fillableDefs) {
    const v = savedFillable[def.fieldKey]
    if (v && String(v).trim() !== '') {
      fillable_values[def.fieldKey] = String(v)
      filled_keys.push(def.fieldKey)
    } else {
      unfilled_keys.push(def.fieldKey)
    }
  }

  return {
    document_id: doc.id,
    existing_doc_name: doc.document_name,
    template_id: template.id,
    template_name: template.name,
    template_type: template.type,
    canvas_state: cs,
    template_config: {
      background_image_url: doc.background_image_url ?? null,
      margins: {
        top:    Number(doc.margin_top ?? 2),
        bottom: Number(doc.margin_bottom ?? 2),
        left:   Number(doc.margin_left ?? 2),
        right:  Number(doc.margin_right ?? 2),
      },
      block_style: (doc.block_style as 'solid' | 'transparent') ?? 'solid',
    },
    resolve_context: resolveCtx,
    patient_header: {
      patient_name: (resolveCtx.patient as any)?.name,
      species:      (resolveCtx.patient as any)?.species,
      breed:        (resolveCtx.patient as any)?.breed,
      sex:          (resolveCtx.patient as any)?.gender,
      date:         doc.created_at
        ? new Date(doc.created_at).toLocaleDateString('pt-BR')
        : new Date().toLocaleDateString('pt-BR'),
      vet_name:     (resolveCtx.vet as any)?.full_name,
      crmv:         (resolveCtx.vet as any)?.crmv,
    },
    fillable_definitions: fillableDefs,
    fillable_values,
    filled_keys,
    unfilled_keys,
  }
}
