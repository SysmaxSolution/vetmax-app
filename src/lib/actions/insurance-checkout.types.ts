// Tipos do insurance-checkout — separados do arquivo 'use server' para evitar
// conflito de runtime no Next.js quando importados de client components.
//
// Boas práticas: arquivos com 'use server' devem exportar APENAS funções
// async; tipos podem ser exportados mas em alguns cenários (especialmente
// edge runtime / build de produção) causam comportamento indefinido.

import type { ProcedureCoverageResult } from '@/lib/actions/insurance-coverage'

export interface CheckoutInsurancePreview {
  has_insurance: boolean
  provider_name?: string
  plan_type?: string
  items: Array<{
    invoice_item_id:  string
    description:      string
    quantity:         number
    total_price:      number
    coverage:         ProcedureCoverageResult
    charge_now:       number       // valor a cobrar do tutor no caixa AGORA
    deferred_provider: number      // valor que a Petlove cobrará no cartão depois
    receivable:       number       // valor que vira A Receber do convênio
  }>
  totals: {
    grand_total:       number     // soma de total_price (preço cheio)
    charge_now:        number     // total a cobrar do tutor no caixa
    deferred_provider: number     // total que a Petlove cobra do tutor
    receivable:        number     // total que vira A Receber Petlove (em aberto)
    tutor_saved:       number     // economia do tutor frente ao particular
    clinic_discount:   number     // diferença entre preço cheio e o que a clínica recebe pelo plano
  }
}
