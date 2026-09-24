// Moldura das telas do pet (`/portal/pet/<id>` e filhas).
//
// Estas URLs existem desde antes do contexto de clínica e estão dentro de links
// já enviados a tutores — não podem mudar. Mas elas também não são ambíguas: um
// pet pertence a EXATAMENTE uma clínica, então dá para resolver a marca a partir
// do próprio pet. Resultado: o link antigo continua funcionando e passa a
// aparecer com a identidade visual certa, sem nenhuma migração de link.
//
// Se a pessoa não tiver acesso ao pet, a marca é a neutra — a identidade da
// clínica não vaza para quem não é tutor nela. A recusa em si é da página.

import { resolvePetBrand } from '@/lib/portal/clinic-context-server'
import PortalShell from '@/components/portal/PortalShell'
import { NEUTRAL_PORTAL_BRAND } from '@/lib/portal/brand-server'

export default async function PortalPetLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  const { tutor, brand, multiClinic } = await resolvePetBrand(id)

  return (
    <PortalShell
      brand={brand ?? NEUTRAL_PORTAL_BRAND}
      tutorName={tutor?.fullName ?? null}
      showLogout={!!tutor}
      showClinicSwitch={multiClinic}
    >
      {children}
    </PortalShell>
  )
}
