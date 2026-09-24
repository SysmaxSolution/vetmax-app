import { requireModuleAccess } from '@/lib/server/require-module'
import { getReportsEnabled } from '@/lib/actions/reports-g13'
import { usesFluxoRejeicaoExame } from '@/lib/actions/clinic-settings'
import ReportsWorkspace from '@/components/reports/ReportsWorkspace'

export const metadata = { title: 'Relatórios | SysVetMax' }

export default async function ReportsPage() {
  await requireModuleAccess('reports')

  const enabledResult = await getReportsEnabled()
  const initialEnabled = 'error' in enabledResult
    ? {
        pet_frequency: true,
        productivity:  true,
        financial:     true,
        dre:           true,
        curva_abc:     true,
        whatsapp:      true,
        operational:   true,
      }
    : enabledResult

  // Relatório de exames não realizados: só para clínicas com o fluxo ligado.
  const usesExamRejection = await usesFluxoRejeicaoExame()

  return <ReportsWorkspace initialEnabled={initialEnabled} usesExamRejection={usesExamRejection} />
}
