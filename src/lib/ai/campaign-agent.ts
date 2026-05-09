import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateCampaignMessage(params: {
  clinicName:  string
  tutorName:   string
  petName:     string
  context:     string
}): Promise<string> {
  const { clinicName, tutorName, petName, context } = params

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role:    'user',
        content: `Você é o assistente de marketing de ${clinicName}.
Escreva uma mensagem de WhatsApp curta para ${tutorName} lembrando que ${petName} ${context}.
Regras: máximo 3 linhas, tom cordial e informal, termine com CTA simples (ex: "Quer agendar?"), sem formatação em asteriscos, no máximo 1 emoji.`,
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    return text.trim() || fallback(tutorName, petName, context)
  } catch {
    return fallback(tutorName, petName, context)
  }
}

function fallback(tutorName: string, petName: string, context: string): string {
  return `Olá ${tutorName}! Notamos que ${petName} ${context}. Que tal agendar uma visita? Estamos à disposição!`
}
