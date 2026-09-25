// Moldura do portal DENTRO do contexto de uma clínica.
//
// É aqui que o white-label acontece: o slug da URL vira clínica, a clínica vira
// marca (nome, logo, cores, fonte, capa) e a marca vira variáveis CSS.
// Se o slug não for de uma clínica VINCULADA à pessoa logada, a moldura é a
// neutra — e a página abaixo recusa. Nunca se mostra a marca de uma clínica
// para quem não é tutor nela.

import { resolvePortalContext } from '@/lib/portal/clinic-context-server'
import PortalShell from '@/components/portal/PortalShell'
import { NEUTRAL_PORTAL_BRAND } from '@/lib/portal/brand-server'

export default async function PortalClinicLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const res = await resolvePortalContext(slug)

  const brand = res.ok ? res.brand : NEUTRAL_PORTAL_BRAND
  const tutorName = res.ok ? res.tutor.fullName : (res.tutor?.fullName ?? null)
  const multi = res.ok ? res.multiClinic : false

  return (
    <PortalShell brand={brand} tutorName={tutorName} showLogout={!!res.tutor} showClinicSwitch={multi}>
      {children}
    </PortalShell>
  )
}
