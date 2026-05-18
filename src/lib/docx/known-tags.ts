/**
 * Tags literais usadas nos templates DOCX da clinica
 * (formato AlmaVet: sem delimitadores, texto cru).
 *
 * O motor docx-engine injeta `{tag}` no XML antes de chamar
 * docxtemplater, usando esta whitelist + heuristicas de prefixo.
 *
 * Cada entrada mapeia o nome LITERAL no DOCX -> chave canonica que
 * o backend conhece (ver canonical-whitelist.ts e SYSTEM_FIELDS).
 */

export interface KnownTag {
  literal: string             // exatamente como aparece no DOCX
  canonical: string           // chave usada na renderizacao
  description?: string
}

export const KNOWN_TAGS: KnownTag[] = [
  // Profissional
  { literal: 'Custom_nome_profissional', canonical: 'professional_name' },
  { literal: 'Custom_cargo_funcao',       canonical: 'professional_role' },
  { literal: 'Code_crmv',                 canonical: 'professional_crmv' },

  // Paciente
  { literal: 'Custom_patient',  canonical: 'patient_name' },
  { literal: 'Custom_tutor',    canonical: 'tutor_name' },
  { literal: 'Custom_especie',  canonical: 'patient_species' },
  { literal: 'Custom_raca',     canonical: 'patient_breed' },
  { literal: 'Custom_idade',    canonical: 'patient_age' },
  { literal: 'Custom_peso',     canonical: 'patient_weight' },
  { literal: 'Patient_is_male',          canonical: 'patient_is_male' },
  { literal: 'Patient_is_famale_is_male', canonical: 'patient_sex_label' }, // legacy AlmaVet

  // Clinica / data
  { literal: 'Cidade_da_clinica',     canonical: 'clinic_city' },
  { literal: 'sigla_estado_clinica',  canonical: 'clinic_uf' },
  { literal: 'Dia_atendimento',       canonical: 'today_dia' },
  { literal: 'mes_atendimento',       canonical: 'today_mes' },
  { literal: 'ano_atendimento',       canonical: 'today_ano' },

  // Medicamento (via uso global)
  { literal: 'Medicaments_via_uso',  canonical: 'medicamento_via_uso' },
]

// Tags geradas dinamicamente (Medicamento{N}_posologia, etc.)
// Suportamos ate 10 medicamentos por receituario.
export const MAX_MEDICAMENTOS = 10

export function buildDynamicMedicamentoTags(): KnownTag[] {
  const tags: KnownTag[] = []
  for (let i = 1; i <= MAX_MEDICAMENTOS; i++) {
    tags.push(
      { literal: `Medicamento${i}_posologia`,            canonical: `medicamento_${i}_posologia` },
      { literal: `medicamento${i}_posologia`,            canonical: `medicamento_${i}_posologia` },
      { literal: `Custom_indicações_medicamento${i}`,    canonical: `medicamento_${i}_indicacoes` },
      { literal: `Custom_indicacoes_medicamento${i}`,    canonical: `medicamento_${i}_indicacoes` },
      { literal: `Custom_medicamento${i}_nome`,          canonical: `medicamento_${i}_nome` },
      { literal: `Medicamento${i}_nome`,                 canonical: `medicamento_${i}_nome` },
    )
  }
  return tags
}

export function getAllKnownTags(): KnownTag[] {
  return [...KNOWN_TAGS, ...buildDynamicMedicamentoTags()]
}

export function buildLiteralToCanonical(): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of getAllKnownTags()) {
    map.set(t.literal, t.canonical)
  }
  return map
}
