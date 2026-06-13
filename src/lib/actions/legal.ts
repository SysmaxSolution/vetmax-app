'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantCtx } from '@/lib/data/context'
import { headers } from 'next/headers'

export type LegalDocumentType =
  | 'terms_privacy_dpa'
  | 'subscription_terms'
  | 'enterprise_contract'

const DOCUMENT_VERSIONS: Record<LegalDocumentType, string> = {
  terms_privacy_dpa:   'v1.0.0-2026-06-13',
  subscription_terms:  'v1.0.0-2026-06-13',
  enterprise_contract: 'v1.0.0-2026-06-13',
}

// SHA-256 do texto de cada documento (placeholder até geração automática).
const DOCUMENT_HASHES: Record<LegalDocumentType, string> = {
  terms_privacy_dpa:   'sha256-pending-v1-2026-06-13',
  subscription_terms:  'sha256-pending-v1-2026-06-13',
  enterprise_contract: 'sha256-pending-v1-2026-06-13',
}

export async function getRequestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0].trim()
    ?? hdrs.get('x-real-ip')
    ?? null
  return { ip, userAgent: hdrs.get('user-agent') ?? null }
}

/**
 * Registra o aceite de um documento legal na tabela `legal_acceptances`.
 * Chamado imediatamente após a ação que exibiu o checkbox (upgrade de plano,
 * login pós-confirmação de e-mail).
 */
export async function recordLegalAcceptance(
  documentType: LegalDocumentType,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getTenantCtx()
  if (!ctx) return { error: 'Não autenticado.' }

  const { ip, userAgent } = await getRequestMeta()
  const admin = createAdminClient()

  const { error } = await admin.from('legal_acceptances').insert({
    clinic_id:         ctx.clinicId,
    user_id:           ctx.userId,
    document_type:     documentType,
    document_version:  DOCUMENT_VERSIONS[documentType],
    document_hash:     DOCUMENT_HASHES[documentType],
    ip_address:        ip,
    user_agent:        userAgent,
    acceptance_method: 'clickwrap_checkbox',
  })

  if (error) return { error: 'Erro ao registrar aceite: ' + error.message }
  return { ok: true }
}

/**
 * Versão interna para ser chamada dentro de outras server actions (evita
 * dependência de getTenantCtx para casos onde o contexto já foi obtido).
 */
export async function insertLegalAcceptanceRaw(params: {
  clinicId:     string
  userId:       string
  documentType: LegalDocumentType
  ip:           string | null
  userAgent:    string | null
}): Promise<void> {
  const admin = createAdminClient()
  await admin.from('legal_acceptances').insert({
    clinic_id:         params.clinicId,
    user_id:           params.userId,
    document_type:     params.documentType,
    document_version:  DOCUMENT_VERSIONS[params.documentType],
    document_hash:     DOCUMENT_HASHES[params.documentType],
    ip_address:        params.ip,
    user_agent:        params.userAgent,
    acceptance_method: 'clickwrap_checkbox',
  })
}
