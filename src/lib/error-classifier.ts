import Anthropic from '@anthropic-ai/sdk'

export interface ClassificationResult {
  priority: 'P0' | 'P1' | 'P2'
  module: string | null
  severity_reason: string
}

const client = new Anthropic()

const SYSTEM_PROMPT = `Você é um classificador de erros para SysVetMax, SaaS veterinário. Classifique o erro recebido:

P0 — CRÍTICO: bloqueia fluxo principal (auth, caixa, salvar consulta, pagamento), perda de dados, statusCode 500+ em rota crítica, ou mensagem contém "Cannot read", "TypeError", "FATAL", "database error", "RLS", "auth".
P1 — ALTO: funcionalidade importante degradada (diagnóstico IA, exame, internação, receita), afeta múltiplos usuários, tem workaround.
P2 — MÉDIO: UI menor, feature opcional, erro isolado, warning, timeout raro, rota de admin/config.

Módulos válidos (retorne null se não identificado): reception, triage, vet, exams, grooming, hospitalization, cashier, pharmacy, patients, registry, management, mentor, auth, whatsapp.

Responda APENAS com JSON válido (sem markdown):
{"priority":"P0","module":"vet","severity_reason":"Falha em X impede Y"}`

export async function classifyError(opts: {
  path: string
  errorMessage: string
  stackTrace?: string
  source?: string
}): Promise<ClassificationResult> {
  const fallback: ClassificationResult = {
    priority:        'P1',
    module:          inferModuleFromPath(opts.path),
    severity_reason: 'Classificação automática indisponível',
  }

  try {
    const stackPreview = opts.stackTrace
      ? `\nSTACK (5 linhas):\n${opts.stackTrace.split('\n').slice(0, 5).join('\n')}`
      : ''

    const userContent = [
      `PATH: ${opts.path}`,
      `SOURCE: ${opts.source ?? 'unknown'}`,
      `ERROR: ${opts.errorMessage.slice(0, 600)}`,
      stackPreview,
    ].filter(Boolean).join('\n')

    const response = await client.messages.create({
      model:     'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system:     SYSTEM_PROMPT,
      messages:  [{ role: 'user', content: userContent }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    // Extrai JSON mesmo se houver texto antes/depois
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) return fallback

    const parsed = JSON.parse(match[0])

    return {
      priority:        ['P0','P1','P2'].includes(parsed.priority) ? parsed.priority : 'P1',
      module:          parsed.module          ?? inferModuleFromPath(opts.path),
      severity_reason: parsed.severity_reason ?? fallback.severity_reason,
    }
  } catch {
    return fallback
  }
}

/** Heurística de fallback: infere módulo pelo path sem chamar Claude */
function inferModuleFromPath(path: string): string | null {
  const p = path.toLowerCase()
  if (p.includes('auth')         || p.includes('login'))       return 'auth'
  if (p.includes('triage')       || p.includes('transcribe'))  return 'triage'
  if (p.includes('mentor')       || p.includes('mentor-chat')) return 'mentor'
  if (p.includes('diagnosis')    || p.includes('vet'))         return 'vet'
  if (p.includes('prescription')) return 'vet'
  if (p.includes('exam'))        return 'exams'
  if (p.includes('grooming'))    return 'grooming'
  if (p.includes('hospitali'))   return 'hospitalization'
  if (p.includes('cashier')      || p.includes('caixa'))       return 'cashier'
  if (p.includes('pharmacy')     || p.includes('farmacia'))    return 'pharmacy'
  if (p.includes('patient')      || p.includes('paciente'))    return 'patients'
  if (p.includes('whatsapp')     || p.includes('wpp'))         return 'whatsapp'
  if (p.includes('reception')    || p.includes('recepcao'))    return 'reception'
  if (p.includes('management')   || p.includes('gestao'))      return 'management'
  if (p.includes('template')     || p.includes('registry'))    return 'registry'
  return null
}
