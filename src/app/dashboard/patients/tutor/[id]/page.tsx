/**
 * /dashboard/patients/tutor/[id]
 *
 * Dashboard de Direitos do Titular (LGPD Art. 18)
 * Permite ao usuário autorizado ver e exercer os direitos do tutor:
 *   - Confirmação e acesso a dados (Art. 18, I e II)
 *   - Solicitar eliminação (Art. 18, IV)
 *   - Ver políticas de retenção (Art. 18, V)
 */

import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getDataSubjectReport,
  getRetentionPolicies,
  listDeletionRequests,
  type DataAccessEntry,
  type RetentionPolicy,
} from '@/lib/actions/compliance'
import TutorRightsClient from './TutorRightsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Direitos LGPD do Tutor — VetMax',
  robots: { index: false, follow: false },
}

interface PageProps {
  params: { id: string }
}

export default async function TutorRightsDashboard({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Apenas roles autorizados
  const allowedRoles = ['admin', 'owner', 'manager', 'vet', 'receptionist']
  if (!allowedRoles.includes(profile.role)) notFound()

  // Buscar dados do tutor
  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, name, email, phone, cpf, whatsapp_consent, created_at')
    .eq('id', params.id)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (!tutor) notFound()

  // Buscar pets do tutor
  const { data: pets } = await supabase
    .from('pets')
    .select('id, name, species, breed')
    .eq('tutor_id', params.id)
    .eq('clinic_id', profile.clinic_id)
    .order('name')

  const [accessReport, retentionPolicies] = await Promise.all([
    getDataSubjectReport(params.id),
    getRetentionPolicies(),
  ])

  const accessEntries = Array.isArray(accessReport) ? accessReport : []
  const policies = Array.isArray(retentionPolicies) ? retentionPolicies : []

  return (
    <Suspense fallback={<div className="p-8 text-slate-500 text-sm">Carregando...</div>}>
      <TutorRightsClient
        tutor={tutor}
        pets={pets ?? []}
        accessEntries={accessEntries}
        retentionPolicies={policies}
        userRole={profile.role}
      />
    </Suspense>
  )
}
