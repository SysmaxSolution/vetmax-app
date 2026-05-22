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

// Linhas em prosa narrativa ("Receitarei ao tutor...", "Vou prescrever...")
// NÃO são candidatas ao parser determinístico — extrair estrutura delas
// é trabalho da IA (extractEntitiesFromAnamneseCore). Se aceitas aqui,
// o texto inteiro vira `medication` e os campos dose/freq/duration ficam
// vazios, sujando o template com separadores órfãos.
const PROSE_INTRO_RE =
  /^\s*(receitar(ei)?|receito|vou (receitar|prescrever|indicar)|prescr(everei|evo|i[cç][aã]o)|indic(o|arei|a)\b|administrar|aplicar|iniciar (tratamento|com)|manter (com )?|tratamento com)\b/i

// Heurística de "tem estrutura" usada pelo extractor para decidir se o
// parser produziu algo aproveitável. Linhas com pelo menos 2 separadores
// fortes contam como estruturadas.
const STRONG_SEPARATOR_RE = /\s*[—–|·•]\s*/g

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
 *  qualquer ordem dos separadores comuns. Devolve null para linhas em
 *  prosa narrativa (deixa a IA estruturar) — evita sujar o template com
 *  o texto bruto colocado em `medication`. */
function parseLine(rawLine: string): ParsedPrescription | null {
  const line = rawLine.trim()
  if (!line) return null

  // Prosa narrativa: rejeita e deixa a IA decidir.
  if (PROSE_INTRO_RE.test(line)) return null

  const isControlled  = CONTROLLED_RE.test(line)
  const isManipulated = MANIPULATED_RE.test(line)
  const route         = detectRoute(line)

  // Divide por separadores fortes primeiro; se houver só 1 parte, tenta " - "
  let parts = line.split(/\s*[—–|·•]\s*|\s+;\s+/).map(stripTags).filter(Boolean)
  if (parts.length < 2) {
    parts = line.split(/\s+-\s+/).map(stripTags).filter(Boolean)
  }

  // Sem separador algum E mais de 6 palavras → muito provavelmente
  // prosa não-estruturada. Rejeita para a IA tentar.
  if (parts.length < 2 && line.split(/\s+/).length > 6) return null
  if (parts.length === 0) return null

  const [medication, dose, frequency, duration] = parts

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

/** True quando ao menos um item carrega informação útil além de
 *  `medication`. O extractor usa para decidir se chama a IA. */
export function prescriptionsHaveStructure(items: ParsedPrescription[]): boolean {
  return items.some(p => Boolean(p.dose || p.frequency || p.duration_days))
}

/** Parse do conteúdo bruto do textarea em uma lista de prescrições. */
export function parseMedicamentosText(raw: string | null | undefined): ParsedPrescription[] {
  if (!raw || !raw.trim()) return []
  return raw
    .split(/\r?\n|;\s*\n?/)
    .map(parseLine)
    .filter((x): x is ParsedPrescription => x !== null)
}
