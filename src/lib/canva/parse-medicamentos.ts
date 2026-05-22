/**
 * Parser do textarea "Medicamentos" do form do laudo Canvas em itens de
 * Repeater (prescriptions). Usado como FALLBACK quando a tabela
 * `prescriptions` não tem entrada para a consulta — comum quando o vet
 * digita a receita direto no campo livre em vez de cadastrar item-a-item
 * via PrescriptionModal.
 *
 * Heurística de parse por linha:
 *   "Dipirona 25mg/mL — 1 mL · a cada 8h · 5 dias"
 *   "Tramadol 50mg - 50mg - a cada 12h - 5 dias  [CONTROLADO]"
 *   "Pomada Furacin — Aplicar fina camada · 3x ao dia · 7 dias  (tópico)"
 *
 *  1. Separa por linha (\n, ;)
 *  2. Para cada linha, divide por separadores fortes (—, –, |, ·, ;)
 *     e secundários (' - ').
 *  3. Mapeia em ordem: medication → dose → frequency → duration_days
 *  4. Detecta marcadores entre parênteses ou colchetes:
 *     [CONTROLADO] / (controlado) / (tópico) / (oral)…
 *  5. Default route = 'oral', prescription_type = 'common'.
 *
 * Output bate com o shape que o RepeaterRenderer espera (ver
 * src/lib/canva/mock-data.ts: MOCK_PRESCRIPTIONS).
 */

export interface ParsedPrescription {
  medication:              string
  dose?:                   string
  frequency?:              string
  duration_days?:          string
  is_controlled:           boolean
  prescription_type:       'common' | 'controlled' | 'manipulated'
  route_of_administration: 'oral' | 'topical' | 'intravenous' | 'intramuscular' | 'subcutaneous' | string
  orientation?:            string
}

const CONTROLLED_RE  = /\b(controlad[ao]|controll?ed|receituario azul|azul)\b/i
const MANIPULATED_RE = /\b(manipulad[ao]|manipulated|manipula[çc][aã]o)\b/i

const ROUTE_KEYWORDS: Array<[RegExp, ParsedPrescription['route_of_administration']]> = [
  [/\b(t[oó]pic[ao]|topical|pomada|creme)\b/i,    'topical'],
  [/\b(intravenos[ao]|endovenos[ao]|i\.?v\.?|ev)\b/i, 'intravenous'],
  [/\b(intramuscular|i\.?m\.?)\b/i,                'intramuscular'],
  [/\b(subcut[aâ]ne[ao]|sc|subcutaneous)\b/i,      'subcutaneous'],
  [/\b(oral|v\.?o\.?|via oral)\b/i,                'oral'],
]

function detectRoute(text: string): ParsedPrescription['route_of_administration'] {
  for (const [re, route] of ROUTE_KEYWORDS) if (re.test(text)) return route
  return 'oral'
}

function stripTags(s: string): string {
  // Remove marcadores como [CONTROLADO] (tópico) ⭐CONTROLADO etc.
  return s
    .replace(/[\[\(][^\]\)]*[\]\)]/g, '')
    .replace(/[★⭐✱*]\s*(CONTROLAD[OA]|MANIPULAD[OA])/gi, '')
    .trim()
}

function parseDurationDays(token: string | undefined): string | undefined {
  if (!token) return undefined
  const m = token.match(/(\d+)\s*dias?/i)
  return m ? m[1] : token.trim()
}

/** Tenta parsear UMA linha "Nome - Dose - Frequência - Duração" em
 *  qualquer ordem dos separadores comuns. */
function parseLine(rawLine: string): ParsedPrescription | null {
  const line = rawLine.trim()
  if (!line) return null

  const isControlled  = CONTROLLED_RE.test(line)
  const isManipulated = MANIPULATED_RE.test(line)
  const route         = detectRoute(line)

  // Divide por separadores fortes primeiro; se houver só 1 parte, tenta " - "
  let parts = line.split(/\s*[—–|·•]\s*|\s+;\s+/).map(stripTags).filter(Boolean)
  if (parts.length < 2) {
    parts = line.split(/\s+-\s+/).map(stripTags).filter(Boolean)
  }
  if (parts.length === 0) return null

  const [medication, dose, frequency, duration] = parts

  // Linha sem separadores — joga tudo em medication.
  const item: ParsedPrescription = {
    medication: stripTags(medication ?? line),
    dose: dose?.trim() || undefined,
    frequency: frequency?.trim() || undefined,
    duration_days: parseDurationDays(duration),
    is_controlled: isControlled,
    prescription_type: isControlled ? 'controlled' : isManipulated ? 'manipulated' : 'common',
    route_of_administration: route,
  }
  if (!item.medication) return null
  return item
}

/** Parse do conteúdo bruto do textarea em uma lista de prescrições. */
export function parseMedicamentosText(raw: string | null | undefined): ParsedPrescription[] {
  if (!raw || !raw.trim()) return []
  return raw
    .split(/\r?\n|;\s*\n?/)
    .map(parseLine)
    .filter((x): x is ParsedPrescription => x !== null)
}
