/**
 * Núcleo PURO da resolução de preço convênio (fix B1, reunião 04/06/2026).
 *
 * Extraído de resolveServicePricing (src/lib/actions/insurance-pricing.ts)
 * para teste unitário da hierarquia completa:
 *
 *   1) Pet SEM convênio ativo                       → particular (unit_price puro)
 *   2) Pet COM convênio + patient_custom_prices     → trio (custom_price, copay, repass)
 *   3) Pet COM convênio + default_insurance_price   → default + split pendente
 *   4) Pet COM convênio sem nenhum dos dois         → particular como fallback + flag
 *      requires_split_input para a UI exigir copay/repass no consultório.
 */

export interface ResolvedPricing {
  unit_price: number
  /** Preenchido APENAS quando o pet tem convênio ativo. */
  insurance: null | {
    total:                number
    copay:                number | null   // null quando ainda não cadastrado (UI exige preencher)
    repass:               number | null
    source:               'custom' | 'default' | 'fallback_unit'
    /** True quando UI deve forçar o vet a inserir copay/repass antes de salvar. */
    requires_split_input: boolean
    /** Nome do provider (para label na UI). */
    provider_name:        string | null
  }
}

export interface PricingDecisionInput {
  /** stock_items.unit_price */
  unit_price: number
  /** stock_items.default_insurance_price (null = não cadastrado) */
  default_insurance_price: number | null
  /** Pet tem pet_insurance com coverage_status='active'? */
  has_active_insurance: boolean
  /** insurance_providers.name (label da UI) */
  provider_name: string | null
  /** Linha de patient_custom_prices do pet+item (null = não existe) */
  custom: null | {
    custom_price:  number
    copay_amount:  number | null
    repass_amount: number | null
  }
}

export function decideServicePricing(input: PricingDecisionInput): ResolvedPricing {
  const unit_price = Number(input.unit_price ?? 0)

  // 1) Sem convênio ativo → particular puro
  if (!input.has_active_insurance) {
    return { unit_price, insurance: null }
  }

  // 2) Split completo cadastrado no pet (custom_price + copay + repass)
  if (
    input.custom &&
    input.custom.copay_amount !== null &&
    input.custom.repass_amount !== null
  ) {
    return {
      unit_price,
      insurance: {
        total:                Number(input.custom.custom_price),
        copay:                Number(input.custom.copay_amount),
        repass:               Number(input.custom.repass_amount),
        source:               'custom',
        requires_split_input: false,
        provider_name:        input.provider_name,
      },
    }
  }

  // 3) Default de convênio cadastrado no serviço
  if (input.default_insurance_price !== null) {
    return {
      unit_price,
      insurance: {
        total:                Number(input.default_insurance_price),
        copay:                null,
        repass:               null,
        source:               'default',
        requires_split_input: true,
        provider_name:        input.provider_name,
      },
    }
  }

  // 4) Fallback: cobra particular (unit_price), mas marca para UI mostrar
  //    inputs de split caso o vet queira registrar o acordo agora.
  return {
    unit_price,
    insurance: {
      total:                unit_price,
      copay:                null,
      repass:               null,
      source:               'fallback_unit',
      requires_split_input: true,
      provider_name:        input.provider_name,
    },
  }
}
