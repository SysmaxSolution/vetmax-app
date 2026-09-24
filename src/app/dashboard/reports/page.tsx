import { requireModuleAccess } from '@/lib/server/require-module'
import { getReportsEnabled, type ReportsEnabled } from '@/lib/actions/reports-g13'
import { usesFluxoRejeicaoExame } from '@/lib/actions/clinic-settings'
import ReportsWorkspace from '@/components/reports/ReportsWorkspace'

export const metadata = { title: 'Relatórios | SysVetMax' }

export default async function ReportsPage() {
  await requireModuleAccess('reports')

  const enabledResult = await getReportsEnabled()
  // Fallback quando a leitura falha: tudo ligado, igual ao REPORTS_DEFAULTS.
  // Precisa listar TODAS as chaves de ReportsEnabled (as 12 novas incluídas).
  const initialEnabled: ReportsEnabled = 'error' in enabledResult
    ? {
        pet_frequency:   true,
        productivity:    true,
        financial:       true,
        dre:             true,
        curva_abc:       true,
        whatsapp:        true,
        operational:     true,
        dashboard:       true,
        smart:           true,
        commissions:     true,
        controlled:      true,
        aging:           true,
        cashflow:        true,
        revenue:         true,
        stock_position:  true,
        clients:         true,
        dre_company:     true,
        boleto_movement: true,
        exam_rejections: true,
      }
    : enabledResult

  // Relatório de exames não realizados: só para clínicas com o fluxo ligado.
  const usesExamRejection = await usesFluxoRejeicaoExame()

  return <ReportsWorkspace initialEnabled={initialEnabled} usesExamRejection={usesExamRejection} />
}
