// Busca de títulos no Contas a Pagar / Receber.
//
// Quem procura um título sabe ora o nome, ora o CNPJ/CPF, ora um pedaço de
// qualquer um dos dois. A regra: texto casa sem acento e em qualquer caixa
// com nome do fornecedor/tutor, pet e descrição; se o que foi digitado tem
// dígitos, casa também com o documento (só os dígitos, pode ser parte —
// "04.852" ou "0001-08" acham o mesmo CNPJ).
//
// Módulo puro, testável.

export interface TituloBuscavel {
  description?:       string | null
  beneficiary?:       string | null
  tutor_name?:        string | null
  patient_name?:      string | null
  tutor_document?:    string | null
  supplier_document?: string | null
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Texto livre da barra de busca: nome, pet, descrição ou documento. */
export function tituloCombina(t: TituloBuscavel, busca: string): boolean {
  const q = busca.trim()
  if (!q) return true
  const alvo = semAcento([t.description, t.beneficiary, t.tutor_name, t.patient_name].filter(Boolean).join(' | '))
  if (alvo.includes(semAcento(q))) return true
  const d = digitos(q)
  // Três dígitos é o mínimo para valer como documento — "12" bateria com quase tudo.
  if (d.length >= 3 && (digitos(t.tutor_document).includes(d) || digitos(t.supplier_document).includes(d))) return true
  return false
}

/** Filtro avançado "Cliente/Fornecedor": nome, pet OU documento. */
export function donoCombina(t: TituloBuscavel, busca: string): boolean {
  const q = busca.trim()
  if (!q) return true
  const alvo = semAcento([t.beneficiary, t.tutor_name, t.patient_name].filter(Boolean).join(' | '))
  if (alvo.includes(semAcento(q))) return true
  const d = digitos(q)
  return d.length >= 3 && (digitos(t.tutor_document).includes(d) || digitos(t.supplier_document).includes(d))
}
