'use server'

/**
 * Motor docx-native — geracao de documentos por paciente.
 *
 * Fluxo:
 *   1. Auth + RLS via clinic_id
 *   2. Carrega template (engine='docx-native') + path do DOCX original
 *   3. Baixa DOCX do bucket document-templates
 *   4. Monta contexto a partir de profiles + clinics + patients + tutors
 *      + dados clinicos do consultation (se houver) + overrides
 *   5. Renderiza via docxtemplater (lib/docx/engine)
 *   6. Upload do DOCX preenchido para bucket patient-documents
 *   7. Insert em patient_documents
 *
 * Conversao para PDF (LibreOffice / Gotenberg) eh feita em camada separada
 * fora desta server action — esta apenas devolve DOCX preenchido.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'
import { renderDocxTemplate } from '@/lib/docx/engine'
import { tryConvertDocxToPdf, isGotenbergConfigured } from '@/lib/docx/gotenberg'
import { downloadDocxTemplate } from './template-docx-storage'
import { logAudit } from './audit'

const PATIENT_DOC_BUCKET = 'patient-documents'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF_MIME = 'application/pdf'

const MESES_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
]

export interface GenerateDocxInput {
  template_id: string
  patient_id: string
  consultation_id?: string | null
  document_name: string
  /**
   * Overrides explicitos (medicamento_1_posologia, indicacoes etc.)
   * Esses sobrescrevem o que vier do contexto auto-derivado.
   */
  overrides?: Record<string, string | number | boolean | null>
}

export interface GenerateDocxResult {
  document_id: string
  storage_path: string
  signed_url: string
  /** Formato realmente entregue: 'pdf' (Gotenberg ok) ou 'docx' (fallback). */
  format: 'pdf' | 'docx'
  /** Quando format='docx', razao do fallback. Util para alertas/observabilidade. */
  fallback_reason?: 'not_configured' | 'timeout' | 'http' | 'network'
  tagsUsed: string[]
  tagsMissing: string[]
}

function formatCrmv(raw: string): string {
  if (!raw) return ''
  const m = raw.toUpperCase().match(/^([A-Z]{2})([0-9]{4,10})$/)
  if (!m) return raw
  return `CRMV-${m[1]} ${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

function formatWeightKg(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  if (!isFinite(n)) return String(v)
  return n.toFixed(2).replace('.', ',') + ' kg'
}

function patientSexLabel(sex: string | null | undefined): string {
  if (!sex) return ''
  const s = sex.toLowerCase()
  if (s === 'male' || s === 'macho' || s === 'm') return 'Macho'
  if (s === 'female' || s === 'femea' || s === 'fêmea' || s === 'f') return 'Fêmea'
  return sex
}

export async function generateDocxDocument(
  input: GenerateDocxInput,
): Promise<GenerateDocxResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, full_name, crmv, role, specialty')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clinica' }

  const admin = createAdminClient()

  // ── Template ──────────────────────────────────────────────────────────────
  const { data: template, error: tplErr } = await admin
    .from('document_templates')
    .select('id, name, type, engine, original_docx_path, docx_tags, clinic_id')
    .eq('id', input.template_id)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (tplErr || !template) return { error: 'Template nao encontrado' }
  if (template.engine !== 'docx-native') {
    return { error: 'Template nao eh docx-native (engine=' + template.engine + ')' }
  }
  if (!template.original_docx_path) {
    return { error: 'Template sem original_docx_path' }
  }

  // ── Paciente + tutor ──────────────────────────────────────────────────────
  const { data: patient, error: patErr } = await admin
    .from('patients')
    .select('id, name, species, breed, sex, birth_date, weight_kg, tutor_id, clinic_id')
    .eq('id', input.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (patErr || !patient) return { error: 'Pet nao encontrado' }

  let tutorName = ''
  if (patient.tutor_id) {
    const { data: tutor } = await admin
      .from('tutors')
      .select('full_name')
      .eq('id', patient.tutor_id)
      .single()
    tutorName = tutor?.full_name ?? ''
  }

  // ── Clinica ───────────────────────────────────────────────────────────────
  const { data: clinic } = await admin
    .from('clinics')
    .select('name, address')
    .eq('id', profile.clinic_id)
    .single()
  const clinicName = clinic?.name ?? ''
  const clinicCity = clinicName
    .replace(/^(?:cl[íi]nica|hospital|consultorio)\s+/i, '')
    .replace(/\s+veterin[áa]ri[oa]\s*/i, '')
    .trim()

  // ── Profissional ──────────────────────────────────────────────────────────
  const crmvRaw = profile.crmv ?? ''
  const crmvUf = crmvRaw.match(/^([A-Z]{2})/)?.[1] ?? ''
  const profName = profile.full_name ?? ''
  const profCrmv = formatCrmv(crmvRaw)
  const profRole = profile.crmv
    ? (profile.specialty ? `Médico Veterinário – ${profile.specialty}` : 'Médico Veterinário')
    : (profile.role ?? '')

  // ── Idade ─────────────────────────────────────────────────────────────────
  let patientAge = ''
  if (patient.birth_date) {
    const bd = new Date(patient.birth_date as string)
    const today = new Date()
    let years = today.getFullYear() - bd.getFullYear()
    let months = today.getMonth() - bd.getMonth()
    if (months < 0) { years--; months += 12 }
    if (today.getDate() < bd.getDate()) {
      months--
      if (months < 0) { years--; months += 12 }
    }
    patientAge =
      years > 0
        ? `${years} ${years === 1 ? 'ano' : 'anos'}${months > 0 ? ` e ${months} m` : ''}`
        : `${months} ${months === 1 ? 'mes' : 'meses'}`
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const today = new Date()
  const dia = today.getDate()
  const mesPt = MESES_PT[today.getMonth()]
  const ano = today.getFullYear()

  // ── Contexto canônico (chaves usadas em known-tags.ts) ────────────────────
  const ctx: Record<string, unknown> = {
    professional_name: profName,
    professional_role: profRole,
    professional_crmv: profCrmv,

    patient_name: patient.name ?? '',
    tutor_name: tutorName,
    patient_species: patient.species ?? '',
    patient_breed: patient.breed ?? '',
    patient_age: patientAge,
    patient_weight: formatWeightKg(patient.weight_kg),
    patient_is_male: patient.sex === 'male' ? 'M' : (patient.sex === 'female' ? 'F' : ''),
    patient_sex_label: patientSexLabel(patient.sex),

    clinic_city: clinicCity,
    clinic_uf: crmvUf,
    today_dia: String(dia),
    today_mes: mesPt,
    today_ano: String(ano),

    medicamento_via_uso: '',
  }

  // ── Aplica overrides (medicamentos, indicacoes etc.) ──────────────────────
  if (input.overrides) {
    for (const [k, v] of Object.entries(input.overrides)) {
      if (v !== null && v !== undefined) ctx[k] = v
    }
  }

  // ── Download + render ─────────────────────────────────────────────────────
  const dl = await downloadDocxTemplate(template.original_docx_path)
  if ('error' in dl) return { error: dl.error }

  let result
  try {
    result = renderDocxTemplate(Buffer.from(dl.buffer), ctx)
  } catch (e) {
    return { error: 'Falha na renderizacao DOCX: ' + (e instanceof Error ? e.message : String(e)) }
  }

  // ── Ultima milha: Gotenberg (DOCX -> PDF) com fallback silencioso ─────────
  // Se Gotenberg responder ok, entregamos o PDF imutavel. Se falhar (timeout,
  // 500, indisponivel), o usuario recebe o .docx editavel — melhor do que tela
  // de erro. O motivo do fallback fica no audit + overlay_values para alerta.
  let finalBuffer: Buffer = result.buffer
  let finalFormat: 'pdf' | 'docx' = 'docx'
  let finalContentType = DOCX_MIME
  let fallbackReason: 'not_configured' | 'timeout' | 'http' | 'network' | undefined

  if (isGotenbergConfigured()) {
    const conv = await tryConvertDocxToPdf(result.buffer, {
      filename: `${input.document_name || 'documento'}.docx`,
    })
    if (conv.ok) {
      finalBuffer = conv.pdf
      finalFormat = 'pdf'
      finalContentType = PDF_MIME
    } else {
      fallbackReason = conv.reason
      console.warn(
        `[generateDocxDocument] Gotenberg falhou (${conv.reason}): ${conv.detail}. Entregando DOCX como fallback.`,
      )
    }
  } else {
    fallbackReason = 'not_configured'
  }

  // ── Upload + insert ───────────────────────────────────────────────────────
  const documentId = randomUUID()
  const ext = finalFormat === 'pdf' ? 'pdf' : 'docx'
  const path = `${profile.clinic_id}/${input.patient_id}/${documentId}.${ext}`
  const { error: upErr } = await admin.storage
    .from(PATIENT_DOC_BUCKET)
    .upload(path, finalBuffer, {
      contentType: finalContentType,
      cacheControl: '3600',
      upsert: false,
    })
  if (upErr) return { error: 'Erro upload documento gerado: ' + upErr.message }

  const { error: insErr } = await admin
    .from('patient_documents')
    .insert({
      id: documentId,
      patient_id: input.patient_id,
      consultation_id: input.consultation_id ?? null,
      template_id: input.template_id,
      clinic_id: profile.clinic_id,
      name: input.document_name,
      generated_pdf_path: path,                        // reusa coluna existente
      generated_format: finalFormat,                   // migration 0158
      overlay_values: {
        ...ctx,
        _gotenberg_fallback_reason: fallbackReason ?? null,
      },
      generated_at: new Date().toISOString(),
      created_by: user.id,
    })
  if (insErr) {
    // tenta limpar storage para evitar arquivo orfao
    await admin.storage.from(PATIENT_DOC_BUCKET).remove([path]).catch(() => {})
    return { error: 'Erro inserindo patient_documents: ' + insErr.message }
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(PATIENT_DOC_BUCKET)
    .createSignedUrl(path, 3600)
  if (signErr || !signed) {
    return { error: 'Documento gerado mas falha ao gerar signed URL: ' + (signErr?.message || '') }
  }

  await logAudit({
    action: 'GENERATE_DOCX_DOCUMENT',
    entity_type: 'patient_documents',
    entity_id: documentId,
    details: {
      template_id: input.template_id,
      patient_id: input.patient_id,
      tags_used: result.tagsUsed.length,
      tags_missing: result.tagsMissing.length,
      format: finalFormat,
      fallback_reason: fallbackReason ?? null,
    },
  })

  return {
    document_id: documentId,
    storage_path: path,
    signed_url: signed.signedUrl,
    format: finalFormat,
    fallback_reason: fallbackReason,
    tagsUsed: result.tagsUsed,
    tagsMissing: result.tagsMissing,
  }
}
