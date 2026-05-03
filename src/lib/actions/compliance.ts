'use server'

/**
 * compliance.ts — LGPD Rights Endpoints (Sprint 2)
 *
 * Implementa os direitos do titular conforme LGPD Art. 18:
 *   - getDataSubjectReport: direito de confirmação e acesso (Art. 18, I e II)
 *   - requestDeletion: direito de eliminação (Art. 18, IV)
 *   - updateWhatsAppConsent: consentimento granular para notificações (Art. 7, I)
 *   - getRetentionPolicies: transparência sobre retenção (Art. 9)
 *   - runRetentionAudit: auditoria de dados expirados (admin)
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataAccessEntry = {
  data_type:         string
  entity_type:       string
  access_type:       string
  purpose:           string | null
  accessed_by_name:  string | null
  accessed_by_role:  string | null
  created_at:        string
}

export type RetentionPolicy = {
  data_type:       string
  retention_years: number
  legal_basis:     string
  auto_anonymize:  boolean
}

export type DeletionRequest = {
  id:              string
  status:          string
  requested_at:    string
  resolved_at:     string | null
  denial_reason:   string | null
}

export type RetentionAuditEntry = {
  tutor_id:        string
  tutor_name:      string
  created_at:      string
  retention_years: number | null
  expires_at:      string | null
  is_expired:      boolean
}

// ─── 1. Relatório de acesso a dados do titular (LGPD Art. 18, I e II) ────────

export async function getDataSubjectReport(
  tutorId: string
): Promise<DataAccessEntry[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Perfil não encontrado.' }
  if (!['admin', 'owner', 'manager', 'vet'].includes(profile.role)) {
    return { error: 'Sem permissão para acessar relatório de dados.' }
  }

  const { data, error } = await supabase
    .from('data_subject_access_report')
    .select('data_type, entity_type, access_type, purpose, accessed_by_name, accessed_by_role, created_at')
    .eq('clinic_id', profile.clinic_id)
    .eq('data_subject_id', tutorId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { error: error.message }
  return (data ?? []) as DataAccessEntry[]
}

// ─── 2. Solicitar exclusão de dados (LGPD Art. 18, IV) ───────────────────────

export async function requestDeletion(payload: {
  tutorId?:         string
  requesterName:    string
  requesterEmail:   string
  requesterCpf?:    string
  notes?:           string
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('deletion_requests')
    .insert({
      clinic_id:       profile.clinic_id,
      tutor_id:        payload.tutorId ?? null,
      requester_name:  payload.requesterName,
      requester_email: payload.requesterEmail,
      requester_cpf:   payload.requesterCpf ?? null,
      notes:           payload.notes ?? null,
      status:          'pending',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

// ─── 3. Listar e atualizar solicitações de exclusão (admin) ──────────────────

export async function listDeletionRequests(): Promise<
  (DeletionRequest & { requester_name: string; requester_email: string })[] | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'owner', 'manager'].includes(profile?.role ?? '')) {
    return { error: 'Acesso negado.' }
  }

  const { data, error } = await supabase
    .from('deletion_requests')
    .select('id, status, requester_name, requester_email, requested_at, resolved_at, denial_reason')
    .eq('clinic_id', profile!.clinic_id)
    .order('requested_at', { ascending: false })

  if (error) return { error: error.message }
  return data ?? []
}

export async function resolveDeletionRequest(
  requestId: string,
  resolution: { status: 'completed' | 'denied' | 'partial'; denial_reason?: string }
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'owner'].includes(profile?.role ?? '')) {
    return { error: 'Apenas administradores podem resolver solicitações.' }
  }

  const { error } = await supabase
    .from('deletion_requests')
    .update({
      status:        resolution.status,
      denial_reason: resolution.denial_reason ?? null,
      resolved_at:   new Date().toISOString(),
      resolved_by:   user.id,
    })
    .eq('id', requestId)
    .eq('clinic_id', profile!.clinic_id)

  if (error) return { error: error.message }
  return { success: true }
}

// ─── 4. Consentimento WhatsApp (LGPD Art. 7, I — granular) ───────────────────

export async function updateWhatsAppConsent(
  tutorId: string,
  consent: boolean
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (!['admin', 'owner', 'manager', 'receptionist'].includes(profile.role)) {
    return { error: 'Sem permissão para alterar consentimento.' }
  }

  const { error } = await supabase
    .from('tutors')
    .update({
      whatsapp_consent:           consent,
      whatsapp_consent_given_at:  consent ? new Date().toISOString() : null,
    })
    .eq('id', tutorId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: error.message }
  return { success: true }
}

// ─── 5. Políticas de retenção da clínica ─────────────────────────────────────

export async function getRetentionPolicies(): Promise<RetentionPolicy[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'owner', 'manager'].includes(profile?.role ?? '')) {
    return { error: 'Acesso negado.' }
  }

  const { data, error } = await supabase
    .from('data_retention_policies')
    .select('data_type, retention_years, legal_basis, auto_anonymize')
    .eq('clinic_id', profile!.clinic_id)
    .order('data_type')

  if (error) return { error: error.message }
  return data ?? []
}

// ─── 6. Auditoria de retenção (admin — dry_run por padrão) ───────────────────

export async function runRetentionAudit(
  dryRun = true
): Promise<{ affected_type: string; affected_count: number; action_taken: string }[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'owner'].includes(profile?.role ?? '')) {
    return { error: 'Apenas administradores podem executar auditoria de retenção.' }
  }

  const { data, error } = await supabase.rpc('anonymize_expired_data', {
    p_clinic_id: profile!.clinic_id,
    p_dry_run:   dryRun,
  })

  if (error) return { error: error.message }
  return data ?? []
}

// ─── 7. Log de acesso a dado (chamado por outros server actions) ──────────────

export async function logDataAccess(params: {
  clinicId:       string
  dataSubjectId:  string
  dataType:       string
  entityType:     string
  entityId:       string
  accessType?:    'read' | 'write' | 'export' | 'delete' | 'share'
  purpose?:       string
}): Promise<void> {
  const supabase = await createClient()

  // Fire-and-forget — não bloqueia o fluxo principal
  void supabase.rpc('rpc_log_data_access', {
    p_clinic_id:       params.clinicId,
    p_data_subject_id: params.dataSubjectId,
    p_data_type:       params.dataType,
    p_entity_type:     params.entityType,
    p_entity_id:       params.entityId,
    p_access_type:     params.accessType ?? 'read',
    p_purpose:         params.purpose ?? null,
  }) // fire-and-forget — log nunca deve quebrar o fluxo
}
