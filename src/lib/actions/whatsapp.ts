'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { evolutionSendText, evolutionSendMedia, evolutionGetConnectionState } from '@/lib/evolution-api-client'
import { TRIGGER_MODULE, TRIGGER_MODULE_LABELS } from '@/lib/whatsapp-triggers'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhatsAppTrigger =
  | 'triage_called'
  | 'triage_completed'
  | 'documents_sent'
  | 'exam_completed'
  | 'hospitalization_update'
  | 'hospitalization_discharge'
  | 'hospitalization_evolution_saved'
  | 'hospitalization_status_changed'
  | 'sent_to_review'
  | 'consultation_finished'
  | 'hospitalization_started'
  | 'grooming_ready_for_pickup'
  | 'grooming_delivered'
  | 'grooming_evolution_saved'
  | 'appointment_scheduled'
  | 'sale_receipt'
  | 'package_renewal'

// ─── Attachable Items ─────────────────────────────────────────────────────────

export type AttachableItem = {
  id:        string
  name:      string
  /** 'file' = PDF físico em patient_attachments (pode ser enviado).
   *  'legacy_doc' = patient_document sem PDF físico (só JSON); envio desabilitado. */
  itemType:  'file' | 'legacy_doc'
  mimeType:  string
  signedUrl: string
  /** true = documento legado sem arquivo físico; checkbox desabilitado no modal. */
  isLegacy:  boolean
}

/** Retorna TODOS os arquivos físicos (patient_attachments) do pet, de qualquer fase do
 *  atendimento (check-in, triagem, consulta, internação). Prioriza patientId para cobrir
 *  todos os registros do ciclo clínico. Usa consultationId apenas como fallback quando
 *  patientId não está disponível.
 *  Documentos JSON (patient_documents) não são incluídos — não têm PDF físico. */
export async function getAttachableItems(params: {
  consultationId?: string
  patientId?:      string
}): Promise<AttachableItem[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  let fileQuery = admin
    .from('patient_attachments')
    .select('id, file_name, file_type, file_url, created_at')
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })

  // patientId tem prioridade: abrange TODOS os arquivos do ciclo do pet (check-in,
  // triagem, consulta…). Só filtra por consultation_id quando patientId não está disponível.
  if (params.patientId) {
    fileQuery = (fileQuery as any).eq('patient_id', params.patientId)
  } else if (params.consultationId) {
    fileQuery = (fileQuery as any).eq('consultation_id', params.consultationId)
  }

  const { data: files } = await fileQuery

  // ── Gerar signed URLs para arquivos físicos ───────────────────────────────
  const signedResults = await Promise.all(
    (files ?? []).map(f =>
      admin.storage.from('clinic-attachments').createSignedUrl(f.file_url, 3600)
    )
  )

  const physicalItems: AttachableItem[] = (files ?? []).map((f, i) => ({
    id:        f.id,
    name:      f.file_name,
    itemType:  'file',
    mimeType:  f.file_type,
    signedUrl: signedResults[i].data?.signedUrl ?? '',
    isLegacy:  false,
  }))

  // ── Buscar patient_documents para expor legados (sem PDF físico) ──────────
  // Documentos recentes já têm um PDF em patient_attachments (via uploadDocumentPdf).
  // Somente docs sem arquivo físico são marcados como legados e aparecem desabilitados.
  const legacyItems: AttachableItem[] = []

  // Busca patient_documents por patientId (preferencial) ou consultationId (fallback)
  let docsQuery = admin
    .from('patient_documents')
    .select('id, document_name, created_at')
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })

  if (params.patientId) {
    docsQuery = (docsQuery as any).eq('patient_id', params.patientId)
  } else if (params.consultationId) {
    docsQuery = (docsQuery as any).eq('consultation_id', params.consultationId)
  } else {
    docsQuery = null as any
  }

  if (docsQuery) {
    const { data: docs, error: docsError } = await docsQuery

    if (docsError) {
      console.error('[WhatsApp] Erro ao buscar patient_documents:', docsError.message)
    }

    if (docs && docs.length > 0) {
      // Set dos nomes de arquivo físicos já presentes (em lowercase para comparação segura)
      const physicalNames = new Set(
        (files ?? []).map(f => f.file_name.toLowerCase())
      )

      for (const doc of docs) {
        // uploadDocumentPdf armazena o file_name como "document_name + .pdf"
        const docName = doc.document_name ?? ''
        if (!docName) continue   // nome nulo não pode ser exibido nem enviado
        const expectedName = (docName + '.pdf').toLowerCase()
        if (physicalNames.has(expectedName)) continue   // PDF físico existe → não duplicar

        legacyItems.push({
          id:        `legacy_${doc.id}`,
          name:      docName,
          itemType:  'legacy_doc',
          mimeType:  '',
          signedUrl: '',
          isLegacy:  true,
        })
      }
    }
  }

  console.log('[WhatsApp] getAttachableItems — Físicos:', physicalItems.length, '| Legados:', legacyItems.length)

  // Físicos primeiro (mais recentes no topo), legados ao final
  return [...physicalItems, ...legacyItems]
}

export type WhatsAppContext = {
  petName:        string
  tutorName:      string
  tutorPhone:     string
  species?:       string
  breed?:         string
  gender?:        string
  // triage_called
  // triage_completed
  weight?:        number
  lastWeight?:    number
  temperature?:   number
  mucous?:        string
  // documents_sent
  documentTitles?: string[]
  vetName?:        string
  // exam_completed
  examType?:       string
  // hospitalization_update
  evolutionStatus?: 'melhorou' | 'estavel' | 'piorou'
  evolutionNotes?:  string
  medications?:     string[]
  // hospitalization_discharge / hospitalization_started
  // (reutiliza petName, tutorName, species, breed, gender)
  hospitalizationReason?:  string
  hospitalizationStatus?:  'observation' | 'ward' | 'icu'
  // hospitalization_status_changed
  fromWard?: string
  toWard?:   string
  // grooming_ready_for_pickup / grooming_delivered
  groomingServices?: string[]
  groomingBox?:      string
  // sale_receipt
  saleTotal?:        string
  // consultation_finished
  vetNotes?:                    string
  diagnosisSummary?:            string
  examsSummary?:                string
  hospitalizationSummary?:      string
  postConsultRecommendations?:  string
  /**
   * Motivo da visita (consultation.visit_reason). Usado para a IA adequar o tom da
   * mensagem ao que realmente foi feito — ex.: vacina/microchip/retorno não devem
   * receber texto de pós-operatório ou diagnóstico inventado.
   */
  visitReason?:                 string
}

// ─── WhatsApp Settings ────────────────────────────────────────────────────────

/** Verifica se a clínica tem WhatsApp configurado e ativo. */
export async function isWhatsAppEnabled(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return false

  const { data } = await supabase
    .from('clinic_whatsapp_settings')
    .select('id')
    .eq('clinic_id', profile.clinic_id)
    .eq('is_active', true)
    .maybeSingle()

  return !!data
}

// ─── Geração de mensagem com Claude ──────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um assistente especializado em comunicação veterinária humanizada.
Gera mensagens de WhatsApp curtas (máx. 3 parágrafos), calorosas e em português brasileiro informal-cordial, para enviar a tutores de animais.
NÃO use asteriscos para negrito. NÃO use emojis em excesso (no máx. 2 por mensagem, apenas se naturais).
NÃO mencione laudos, receitas ou prontuários como "documentos jurídicos". Use linguagem leve.
Sempre mencione o nome do pet. Seja empático, positivo e objetivo.
Retorne SOMENTE a mensagem, sem explicações adicionais.`

const TRIGGER_PROMPTS: Record<WhatsAppTrigger, (ctx: WhatsAppContext) => string> = {
  triage_called: (ctx) =>
    `O pet ${ctx.petName} (tutor: ${ctx.tutorName}) foi chamado para a triagem agora.
    Gere uma mensagem avisando que chegou a vez do pet e que ele vai passar pela triagem.`,

  triage_completed: (ctx) => {
    const pesoInfo = ctx.weight
      ? `Peso atual: ${ctx.weight}kg${ctx.lastWeight ? ` (na última consulta era ${ctx.lastWeight}kg)` : ''}.`
      : ''
    const tempInfo = ctx.temperature ? `Temperatura: ${ctx.temperature}°C.` : ''
    return `O pet ${ctx.petName} acabou de ter a triagem concluída. ${pesoInfo} ${tempInfo} Sinais vitais registrados.
    Gere uma mensagem animada para o tutor ${ctx.tutorName} com esses dados, dizendo que em breve o médico veterinário vai chamá-los.`
  },

  documents_sent: (ctx) => {
    const docs = ctx.documentTitles?.join(', ') ?? 'documentos da consulta'
    const vet = ctx.vetName ? ` pelo ${ctx.vetName}` : ''
    return `A consulta do ${ctx.petName} foi concluída${vet} e os seguintes documentos foram gerados: ${docs}.
    Gere uma mensagem para o tutor ${ctx.tutorName} informando que os documentos da consulta estão disponíveis e que a equipe está à disposição para dúvidas.`
  },

  exam_completed: (ctx) => {
    const tipo = ctx.examType ?? 'exame'
    return `O ${tipo} do ${ctx.petName} foi concluído e o resultado foi encaminhado ao médico veterinário para análise.
    Gere uma mensagem tranquilizadora para o tutor ${ctx.tutorName} dizendo que o exame foi realizado e que em breve o veterinário entrará em contato com mais informações.`
  },

  hospitalization_update: (ctx) => {
    const status = ctx.evolutionStatus === 'melhorou' ? 'apresentando melhora'
      : ctx.evolutionStatus === 'piorou' ? 'sendo acompanhado de perto'
      : 'estável'
    const meds = ctx.medications?.length
      ? `Medicações aplicadas: ${ctx.medications.join(', ')}.`
      : ''
    const notes = ctx.evolutionNotes ? `Observação clínica: ${ctx.evolutionNotes}.` : ''
    return `O ${ctx.petName} está internado e ${status}. ${meds} ${notes}
    Gere uma mensagem de atualização de internação para o tutor ${ctx.tutorName}, tranquilizando-o e mostrando que a equipe cuida do pet com carinho.
    ${ctx.evolutionStatus === 'piorou' ? 'Tom deve ser sério mas tranquilizador, sem alarmar.' : 'Tom deve ser positivo e acolhedor.'}`
  },

  hospitalization_evolution_saved: (ctx) => {
    const speciesMap: Record<string, string> = {
      dog: 'cachorro', cat: 'gato', bird: 'pássaro', rabbit: 'coelho',
      rodent: 'roedor', reptile: 'réptil', fish: 'peixe', exotic: 'animal exótico',
    }
    const speciesLabel = speciesMap[ctx.species ?? ''] ?? ctx.species ?? 'pet'
    const breedLabel   = ctx.breed ? ` da raça ${ctx.breed}` : ''
    const statusLabel  =
      ctx.evolutionStatus === 'melhorou' ? 'apresentando melhora e respondendo bem ao tratamento'
      : ctx.evolutionStatus === 'piorou' ? 'sendo monitorado de perto pela equipe'
      : 'estável e confortável'
    const meds  = ctx.medications?.length
      ? `Medicações aplicadas nesta avaliação: ${ctx.medications.join(', ')}.`
      : ''
    const notes = ctx.evolutionNotes ? `Observação clínica: "${ctx.evolutionNotes}".` : ''
    const docs  = ctx.documentTitles?.length
      ? `Documentos gerados e disponíveis: ${ctx.documentTitles.join(', ')}.`
      : ''

    return `DADOS DO PACIENTE:
Nome: ${ctx.petName}. Espécie: ${speciesLabel}${breedLabel}. Tutor: ${ctx.tutorName}.
Status atual: ${statusLabel}. ${meds} ${notes} ${docs}

Gere um boletim de plantão curto (máx. 2 parágrafos), rápido e carinhoso para o tutor ${ctx.tutorName}.
Tom: íntimo, tranquilizador — como uma mensagem pessoal do plantonista.
Exemplo de abertura: "Oi ${ctx.tutorName}! O ${ctx.petName} acabou de passar por mais uma avaliação de plantão."
Mencione as medicações se houver. NÃO use termos técnicos frios nem asteriscos.`
  },

  hospitalization_discharge: (ctx) =>
    `O ${ctx.petName} recebeu alta da internação e está aguardando o tutor para ir para casa.
    Gere uma mensagem comemorativa e calorosa para o tutor ${ctx.tutorName} avisando que o pet recebeu alta e está pronto para ir pra casa.`,

  hospitalization_started: (ctx) => {
    const speciesMap: Record<string, string> = {
      dog: 'cachorro', cat: 'gato', bird: 'pássaro', rabbit: 'coelho',
      rodent: 'roedor', reptile: 'réptil', fish: 'peixe', exotic: 'animal exótico',
    }
    const speciesLabel = speciesMap[ctx.species ?? ''] ?? ctx.species ?? 'pet'
    const breedLabel   = ctx.breed ? `da raça ${ctx.breed}` : ''
    const isMale       = ctx.gender === 'male'
    const isFemale     = ctx.gender === 'female'

    let termCarinhoso = ctx.petName
    if (ctx.species === 'dog') {
      termCarinhoso = isMale
        ? `seu ${ctx.breed ?? 'cachorrão'} corajoso`
        : isFemale ? `sua ${ctx.breed ?? 'cachorrinha'} querida` : `seu ${speciesLabel}`
    } else if (ctx.species === 'cat') {
      termCarinhoso = isMale ? 'seu gatinho' : isFemale ? 'sua gatinha' : 'seu gato'
    }

    const wardMap: Record<string, string> = {
      observation: 'observação (monitoramento de curta duração)',
      ward:        'enfermaria (internação padrão)',
      icu:         'UTI (cuidados intensivos)',
    }
    const wardLabel  = wardMap[ctx.hospitalizationStatus ?? ''] ?? ctx.hospitalizationStatus ?? 'internação'
    const reasonInfo = ctx.hospitalizationReason ? `Motivo: ${ctx.hospitalizationReason}.` : ''

    return `DADOS DO PACIENTE (use OBRIGATORIAMENTE):
Nome: ${ctx.petName}. Espécie: ${speciesLabel}${breedLabel ? ` ${breedLabel}` : ''}. Sexo: ${isMale ? 'macho' : isFemale ? 'fêmea' : 'não informado'}.
Ala: ${wardLabel}. ${reasonInfo}

INSTRUÇÃO CRÍTICA: O paciente é um(a) ${speciesLabel}. NUNCA chame ${ctx.petName} de "gatinho" se for cachorro, nem de "cachorrinho" se for gato. Use ${termCarinhoso} ao se referir ao pet com carinho.

Gere uma mensagem para o tutor ${ctx.tutorName} informando que ${ctx.petName} foi ADMITIDO(A) na internação veterinária:
- Mencione a ala/setor (${wardLabel}) e o motivo da internação;
- Se for UTI, use tom sério mas tranquilizador (sem alarmar);
- Se for observação/enfermaria, tom seja acolhedor e positivo;
- Diga que a equipe está cuidando com atenção e carinho;
- Convide o tutor a entrar em contato se tiver dúvidas.
Máx. 3 parágrafos.`
  },

  hospitalization_status_changed: (ctx) => {
    const from   = ctx.fromWard ?? 'ala anterior'
    const to     = ctx.toWard   ?? 'nova ala'
    const isIcu  = to.toLowerCase().includes('uti')
    const isWard = to.toLowerCase().includes('enfermaria')
    return `O pet ${ctx.petName} foi transferido de ${from} para ${to} na internação. Tutor: ${ctx.tutorName}.
${isIcu  ? 'Tom: sério mas tranquilizador — a equipe está intensificando os cuidados.' : ''}
${isWard ? 'Tom: positivo — é sinal de melhora clínica.' : ''}
Gere uma mensagem curta (máx. 2 parágrafos) informando ao tutor ${ctx.tutorName} que ${ctx.petName} foi transferido(a) de ${from} para ${to}, explicando brevemente o que isso significa e reforçando que a equipe está cuidando com atenção.`
  },

  sent_to_review: (ctx) =>
    `O pet ${ctx.petName} encerrou a internação e está retornando ao consultório do médico veterinário para revisão clínica pós-internação. Tutor: ${ctx.tutorName}.
Gere uma mensagem calorosa e tranquilizadora para o tutor ${ctx.tutorName}: ${ctx.petName} saiu da internação e está indo para uma consulta de revisão com o veterinário, que avaliará a recuperação e orientará sobre os cuidados em casa. Tom positivo e levemente comemorativo. Máx. 2 parágrafos.`,

  grooming_evolution_saved: (ctx) => {
    const svcs = ctx.groomingServices?.length ? ctx.groomingServices.join(', ') : 'banho e tosa'
    const obs  = ctx.evolutionNotes ? ` Observações: ${ctx.evolutionNotes}.` : ''
    return `Pet ${ctx.petName} em atendimento de ${svcs}.${obs} Tutor: ${ctx.tutorName}.
Gere uma mensagem simpática e tranquilizadora para o tutor ${ctx.tutorName} informando que ${ctx.petName} está sendo cuidado e tudo corre muito bem. Tom: amigável e acolhedor. Máx. 1 parágrafo curto.`
  },

  grooming_ready_for_pickup: (ctx) => {
    const svcs = ctx.groomingServices?.length ? ctx.groomingServices.join(', ') : 'banho e tosa'
    const box  = ctx.groomingBox ? ` (Box ${ctx.groomingBox})` : ''
    return `O pet ${ctx.petName}${box} terminou o serviço de ${svcs} e está pronto para ser retirado. Tutor: ${ctx.tutorName}.
Gere uma mensagem animada e calorosa avisando que ${ctx.petName} está prontinho e lindinho para ir pra casa. Tom: celebratório e fofo. Máx. 2 parágrafos.`
  },

  grooming_delivered: (ctx) => {
    const svcs = ctx.groomingServices?.length ? ctx.groomingServices.join(', ') : 'banho e tosa'
    return `O pet ${ctx.petName} foi entregue ao tutor ${ctx.tutorName} após o serviço de ${svcs}.
Gere uma mensagem de agradecimento pela visita, elogiando o pet pelo comportamento e convidando a agendar a próxima sessão. Tom: caloroso e fidelizador. Máx. 2 parágrafos.`
  },

  consultation_finished: (ctx) => {
    // ── Identidade do paciente ─────────────────────────────────────────────────
    const speciesMap: Record<string, string> = {
      dog: 'cachorro', cat: 'gato', bird: 'pássaro', rabbit: 'coelho',
      rodent: 'roedor', reptile: 'réptil', fish: 'peixe', exotic: 'animal exótico',
    }
    const speciesLabel = speciesMap[ctx.species ?? ''] ?? ctx.species ?? 'pet'
    const breedLabel   = ctx.breed ? `da raça ${ctx.breed}` : ''
    const isMale       = ctx.gender === 'male'
    const isFemale     = ctx.gender === 'female'

    // Termos carinhosos por espécie+gênero — OBRIGATÓRIO para evitar erro de espécie
    let termCarinhoso = ctx.petName
    if (ctx.species === 'dog') {
      termCarinhoso = isMale
        ? `seu ${ctx.breed ? ctx.breed : 'cachorrão'} corajoso`
        : isFemale
        ? `sua ${ctx.breed ? ctx.breed : 'cachorrinha'} querida`
        : `seu ${speciesLabel}`
    } else if (ctx.species === 'cat') {
      termCarinhoso = isMale ? 'seu gatinho' : isFemale ? 'sua gatinha' : 'seu gato'
    }

    const petIdentity = `Nome: ${ctx.petName}. Espécie: ${speciesLabel}${breedLabel ? ` ${breedLabel}` : ''}. Sexo: ${isMale ? 'macho' : isFemale ? 'fêmea' : 'não informado'}.`

    // ── Dados clínicos ─────────────────────────────────────────────────────────
    const motivo    = ctx.visitReason ? `Motivo da visita: ${ctx.visitReason}.` : ''
    const diagnosis = ctx.diagnosisSummary ? `Diagnóstico/achados: ${ctx.diagnosisSummary}.` : ''
    const exams     = ctx.examsSummary     ? `Procedimentos e medicações realizados: ${ctx.examsSummary}.` : ''
    const hosp      = ctx.hospitalizationSummary ? `Internação: ${ctx.hospitalizationSummary}.` : ''
    const rec       = ctx.postConsultRecommendations ? `Cuidados em casa / orientações: ${ctx.postConsultRecommendations}.` : ''
    const vet       = ctx.vetName ? `MV responsável: ${ctx.vetName}.` : ''

    // Sinaliza atendimento simples (sem dados clínicos relevantes) — ex.: vacina,
    // microchip, retorno rápido. Nesses casos a mensagem deve ser curta e NÃO pode
    // inventar diagnóstico, exames, pomadas, curativos ou pós-operatório.
    const semDadosClinicos = !ctx.diagnosisSummary && !ctx.examsSummary && !ctx.hospitalizationSummary && !ctx.postConsultRecommendations

    return `DADOS DO ATENDIMENTO (baseie-se SOMENTE nestes dados — não invente nada):
${petIdentity}
${motivo}
${vet}
${diagnosis}
${exams}
${hosp}
${rec}

INSTRUÇÃO CRÍTICA DE ESPÉCIE: O paciente é um(a) ${speciesLabel}${breedLabel ? ` ${breedLabel}` : ''}, ${isMale ? 'macho' : isFemale ? 'fêmea' : ''}. NUNCA chame ${ctx.petName} de "gatinho" se for cachorro, nem de "cachorrinho" se for gato. Use ${termCarinhoso} ao se referir ao pet de forma carinhosa.

REGRA ANTI-ALUCINAÇÃO (OBRIGATÓRIA): A mensagem deve refletir APENAS o que consta nos dados acima. É PROIBIDO inventar diagnósticos, exames, medicações, pomadas, curativos, internação ou orientações de pós-operatório que não tenham sido informados.${semDadosClinicos ? ` Este foi um atendimento simples${ctx.visitReason ? ` (${ctx.visitReason})` : ''} sem diagnóstico/procedimento clínico registrado — gere uma mensagem CURTA (1 parágrafo) apenas confirmando que o atendimento foi realizado, agradecendo a visita e colocando-se à disposição. NÃO mencione tratamento, recuperação, medicação ou cuidados em casa.` : ''}

Gere uma mensagem calorosa para o tutor ${ctx.tutorName} contendo, conforme os dados disponíveis:
(a) o que foi detectado ou tratado — cite procedimentos específicos (pomadas, medicações, curativos) APENAS se informados;
(b) resumo dos exames realizados, se houver;
(c) se passou por internação, mencione brevemente;
(d) as orientações de cuidado em casa, SOMENTE se houver orientações informadas.
Tom: acolhedor e positivo. Máx. 3 parágrafos.`
  },

  appointment_scheduled: (ctx) =>
    `O pet ${ctx.petName} (tutor: ${ctx.tutorName}) teve um novo agendamento criado na clínica.
    Gere uma mensagem curta e amigável confirmando o agendamento, pedindo para chegar com alguns minutos de antecedência. Tom: acolhedor e profissional.`,

  sale_receipt: (ctx) =>
    `O tutor ${ctx.tutorName} realizou uma compra na clínica agora. Valor: R$ ${ctx.saleTotal ?? '0,00'}.
    Gere uma mensagem curta de agradecimento pela compra, mencionando o nome da clínica. Tom: cordial e objetivo. Máx. 2 linhas.`,

  package_renewal: (ctx) =>
    `O pacote/plano de ${ctx.petName} (tutor: ${ctx.tutorName}) foi totalmente utilizado.
    Gere uma mensagem simpática convidando a renovar o pacote, destacando os benefícios de continuar o tratamento. Tom: amigável e motivador. Máx. 3 linhas.`,
}

export async function generateWhatsAppMessage(
  trigger: WhatsAppTrigger,
  context: WhatsAppContext
): Promise<{ message: string } | { error: string }> {
  try {
    const userPrompt = TRIGGER_PROMPTS[trigger](context)
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    if (!text) return { error: 'Resposta vazia do modelo.' }
    return { message: text }
  } catch (err: any) {
    return { error: 'Erro ao gerar mensagem: ' + (err?.message ?? String(err)) }
  }
}

// ─── Envio via Evolution API ──────────────────────────────────────────────────

function formatBRPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}

/** Busca o nome da instância Evolution da clínica logada. Credenciais da
 *  plataforma (URL e API key) ficam em env vars no servidor — nunca no banco. */
async function getActiveCredentials(): Promise<{
  instanceId: string
  apiKey:     string
  apiUrl:     string
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return null

  const { data } = await supabase
    .from('clinic_whatsapp_settings')
    .select('instance_id, evolution_instance_name')
    .eq('clinic_id', profile.clinic_id)
    .eq('is_active', true)
    .single()

  if (!data) return null

  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) return null

  const instanceId = data.evolution_instance_name ?? data.instance_id
  if (!instanceId) return null

  return { instanceId, apiKey, apiUrl }
}

// ─── M8: gatilhos por módulo ──────────────────────────────────────────────────

/** Lê os módulos com gatilho desligado da clínica do usuário atual. */
async function getDisabledTriggerModules(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return []
  const { data } = await supabase
    .from('clinic_whatsapp_settings')
    .select('disabled_trigger_modules')
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()
  return (data?.disabled_trigger_modules as string[] | null) ?? []
}

/** Config para a UI: módulos com gatilho desligado. */
export async function getTriggerModulesConfig(): Promise<string[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const { data } = await supabase
    .from('clinic_whatsapp_settings')
    .select('disabled_trigger_modules')
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()
  return (data?.disabled_trigger_modules as string[] | null) ?? []
}

/** Salva a lista de módulos com gatilho desligado. */
export async function setTriggerModulesConfig(
  disabledModules: string[],
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const valid = new Set(TRIGGER_MODULE_LABELS.map(m => m.key))
  const clean = [...new Set(disabledModules.filter(m => valid.has(m)))]

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinic_whatsapp_settings')
    .update({ disabled_trigger_modules: clean, updated_at: new Date().toISOString() })
    .eq('clinic_id', profile.clinic_id)
  if (error) return { error: 'Erro ao salvar gatilhos: ' + error.message }

  revalidatePath('/dashboard/management')
  return { success: true }
}

export async function sendWhatsAppMessage(params: {
  phone:              string
  message:            string
  trigger:            WhatsAppTrigger
  tutorName?:         string
  tutorId?:           string   // LGPD: obrigatório para verificar consentimento
  consultationId?:    string
  hospitalizationId?: string
  attachments?:       Array<{ name: string; signedUrl: string; mimeType: string }>
}): Promise<{ success: true; failedAttachments?: string[] } | { error: string }> {
  // ── M8: gatilho do módulo desligado nas configurações? não envia. ───────────
  const moduleKey = TRIGGER_MODULE[params.trigger]
  if (moduleKey && (await getDisabledTriggerModules()).includes(moduleKey)) {
    console.info(`[WhatsApp] Gatilho do módulo "${moduleKey}" desligado — envio ignorado.`)
    return { error: 'Gatilho de WhatsApp deste módulo está desativado nas configurações.' }
  }

  // ── LGPD Art. 7, I: verificar consentimento WhatsApp antes de enviar ────────
  if (params.tutorId) {
    const supabase = await createClient()
    const { data: tutor } = await supabase
      .from('tutors')
      .select('whatsapp_consent')
      .eq('id', params.tutorId)
      .single()

    // Opt-in (LGPD): só envia para tutores que consentiram EXPLICITAMENTE
    // (whatsapp_consent = true). Qualquer outro valor (false ou null) bloqueia —
    // a notificação só deve sair para quem tem a flag ativa no cadastro.
    if (!tutor || tutor.whatsapp_consent !== true) {
      console.info(`[WhatsApp LGPD] Envio bloqueado: tutor ${params.tutorId} sem consentimento WhatsApp ativo`)
      return { error: 'LGPD: tutor não consentiu com notificações via WhatsApp. Habilite em Recepção → Dados do Tutor.' }
    }
  }

  const creds = await getActiveCredentials()

  if (!creds) {
    return { error: 'WhatsApp não configurado para esta clínica. Leia o QR Code em Gestão → Configurações → WhatsApp.' }
  }

  const phone = formatBRPhone(params.phone)

  const evolutionCreds = {
    apiUrl:     creds.apiUrl,
    instanceId: creds.instanceId,
    apiKey:     creds.apiKey,
  }

  // Pré-checagem de conexão: enviar para uma instância desconectada devolve o
  // erro críptico "Connection Closed" do Baileys. Antes de tentar, confirmamos
  // que a sessão está 'open' e, se não, devolvemos uma mensagem acionável.
  const connState = await evolutionGetConnectionState(evolutionCreds)
  if (connState !== 'open') {
    const motivo = connState === 'connecting'
      ? 'O WhatsApp está reconectando. Aguarde alguns segundos e tente novamente.'
      : 'O WhatsApp desta clínica está desconectado. Releia o QR Code em Gestão → Configurações → WhatsApp para reconectar.'
    return { error: motivo }
  }

  try {
    const validAttachments = (params.attachments ?? []).filter(a => a.signedUrl)
    const singleAttachment = validAttachments.length === 1

    if (!singleAttachment) {
      await evolutionSendText(evolutionCreds, phone, params.message)
    }

    await logNotification(params)

    const failedAttachments: string[] = []

    if (validAttachments.length > 0) {
      await new Promise(r => setTimeout(r, 1500))

      const results = await Promise.allSettled(
        validAttachments.map((a, i) =>
          new Promise<void>((resolve, reject) =>
            setTimeout(async () => {
              try {
                await evolutionSendMedia(evolutionCreds, phone, {
                  mediaUrl: a.signedUrl,
                  fileName: a.name,
                  mimeType: a.mimeType,
                  caption:  singleAttachment ? params.message : a.name.replace(/\.[^.]+$/, ''),
                })
                resolve()
              } catch (e) { reject(e) }
            }, i * 1500)
          )
        )
      )
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const errMsg = (r.reason as any)?.message ?? String(r.reason)
          console.error(`[WhatsApp/Evolution] Falha ao enviar anexo "${validAttachments[i].name}": ${errMsg}`)
          failedAttachments.push(validAttachments[i].name)
        }
      })
    }

    return failedAttachments.length > 0
      ? { success: true, failedAttachments }
      : { success: true }
  } catch (err: any) {
    console.error('[WhatsApp/Evolution] Erro:', err)
    return { error: 'Erro Evolution API: ' + (err?.message ?? String(err)) }
  }
}

// ─── Log no banco ─────────────────────────────────────────────────────────────

async function logNotification(params: {
  phone:              string
  message:            string
  trigger:            WhatsAppTrigger
  tutorName?:         string
  consultationId?:    string
  hospitalizationId?: string
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return

    await supabase.from('whatsapp_notifications').insert({
      clinic_id:          profile.clinic_id,
      consultation_id:    params.consultationId    ?? null,
      hospitalization_id: params.hospitalizationId ?? null,
      tutor_phone:        params.phone,
      tutor_name:         params.tutorName         ?? null,
      trigger_type:       params.trigger,
      message:            params.message,
      sent_by:            user.id,
    })
  } catch {
    // Log failure não quebra o fluxo
  }
}
