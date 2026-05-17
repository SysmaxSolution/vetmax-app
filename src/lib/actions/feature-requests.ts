'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface FeatureRequestRow {
  id: string
  tenant_id: string
  clinic_name: string
  feature_name: string
  user_message: string
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'planned' | 'in_progress' | 'done'
  created_at: string
}

export interface FeatureGroup {
  feature_name: string
  total: number
  high: number
  medium: number
  low: number
  status: 'pending' | 'planned' | 'in_progress' | 'done'
  requests: FeatureRequestRow[]
}

async function assertSysmax() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado.')
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_sysmax')
    .eq('id', user.id)
    .single()
  if (!profile?.is_sysmax) throw new Error('Acesso negado.')
}

export async function getFeatureRequests(): Promise<FeatureGroup[]> {
  await assertSysmax()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('feature_requests')
    .select('*, clinics(name)')
    .order('feature_name')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows: FeatureRequestRow[] = (data ?? []).map((r: any) => ({
    id:           r.id,
    tenant_id:    r.tenant_id,
    clinic_name:  r.clinics?.name ?? 'Clínica desconhecida',
    feature_name: r.feature_name,
    user_message: r.user_message,
    priority:     r.priority,
    status:       r.status,
    created_at:   r.created_at,
  }))

  // Agrupa por feature_name usando status da solicitação mais recente
  const map = new Map<string, FeatureGroup>()
  for (const row of rows) {
    const existing = map.get(row.feature_name)
    if (!existing) {
      map.set(row.feature_name, {
        feature_name: row.feature_name,
        total:    1,
        high:     row.priority === 'high'   ? 1 : 0,
        medium:   row.priority === 'medium' ? 1 : 0,
        low:      row.priority === 'low'    ? 1 : 0,
        status:   row.status,
        requests: [row],
      })
    } else {
      existing.total++
      if (row.priority === 'high')   existing.high++
      if (row.priority === 'medium') existing.medium++
      if (row.priority === 'low')    existing.low++
      existing.requests.push(row)
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export async function updateFeatureRequestStatus(
  id: string,
  status: 'pending' | 'planned' | 'in_progress' | 'done'
): Promise<void> {
  await assertSysmax()
  const admin = createAdminClient()
  const { error } = await admin
    .from('feature_requests')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateFeatureGroupStatus(
  featureName: string,
  status: 'pending' | 'planned' | 'in_progress' | 'done'
): Promise<void> {
  await assertSysmax()
  const admin = createAdminClient()
  const { error } = await admin
    .from('feature_requests')
    .update({ status })
    .eq('feature_name', featureName)
  if (error) throw new Error(error.message)
}
