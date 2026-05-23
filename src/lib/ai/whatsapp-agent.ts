import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Vet surgery status ───────────────────────────────────────────────────────

interface VetSurgeryInfo {
  isInSurgery: boolean
  vetName:     string | null
  vetPhone:    string | null
  vetUserId:   string | null
}

async function getVetSurgeryInfo(clinicId: string): Promise<VetSurgeryInfo> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, phone')
    .eq('clinic_id', clinicId)
    .eq('role', 'vet')
    .eq('is_in_surgery', true)
    .limit(1)
    .maybeSingle()

  return {
    isInSurgery: !!data,
    vetName:     data?.full_name ?? null,
    vetPhone:    data?.phone     ?? null,
    vetUserId:   data?.id        ?? null,
  }
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_clinic_info',
    description: 'Retorna informações da clínica: nome, endereço, telefone e lista de serviços com preços.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_price',
    description: 'Busca o preço de um serviço ou produto pelo nome.',
    input_schema: {
      type: 'object' as const,
      properties: {
        service: { type: 'string', description: 'Nome do serviço ou produto a pesquisar' },
      },
      required: ['service'],
    },
  },
  {
    name: 'get_availability',
    description: 'Verifica horários disponíveis para agendamento em uma data específica.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Agenda uma consulta veterinária para o tutor. Use após confirmar data, horário, nome do pet e motivo com o tutor.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date:        { type: 'string', description: 'Data da consulta no formato YYYY-MM-DD' },
        time:        { type: 'string', description: 'Horário no formato HH:MM (ex: 09:00)' },
        pet_name:    { type: 'string', description: 'Nome do pet/animal' },
        pet_species: { type: 'string', description: 'Espécie: dog, cat, bird, exotic, rabbit, rodent, reptile ou fish' },
        reason:      { type: 'string', description: 'Motivo: consultation, follow_up, vaccination, exam, surgery' },
        notes:       { type: 'string', description: 'Observações adicionais (opcional)' },
      },
      required: ['date', 'time', 'pet_name'],
    },
  },
  {
    name: 'request_human_handoff',
    description: 'Transfere a conversa para um atendente humano. Use quando: frustração do tutor, pergunta fora do escopo ou pedido explícito. Para urgências médicas com veterinário em cirurgia, use escalate_urgency_to_reception.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Motivo da transferência' },
      },
      required: ['reason'],
    },
  },
]

// Tools disponíveis apenas quando há um agendamento pendente de confirmação
const CONFIRMATION_TOOLS: Anthropic.Tool[] = [
  {
    name: 'confirm_appointment',
    description: 'Confirma o agendamento pendente. Use quando o tutor disser que vai comparecer (CONFIRMAR, "tá certo", "vou sim", "ok", "confirmo", etc).',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela o agendamento pendente. Use quando o tutor disser CANCELAR, "não vou", "desmarcar", etc. O cancelamento é definitivo.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'reschedule_appointment',
    description: 'Remarca o agendamento pendente para uma nova data e horário. Antes de chamar, use get_availability para confirmar que o slot escolhido está livre. O tutor deve ter escolhido um horário entre as opções oferecidas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        new_date: { type: 'string', description: 'Nova data no formato YYYY-MM-DD' },
        new_time: { type: 'string', description: 'Novo horário no formato HH:MM' },
      },
      required: ['new_date', 'new_time'],
    },
  },
]

const SURGERY_TOOL: Anthropic.Tool = {
  name: 'escalate_urgency_to_reception',
  description: 'Use SOMENTE quando (1) o veterinário está em Modo Cirurgia E (2) a mensagem indica urgência médica real: convulsão, dificuldade respiratória, trauma grave, envenenamento, desmaio, sangramento intenso, inconsciência. Cria alerta sonoro na recepção e envia push ao veterinário.',
  input_schema: {
    type: 'object' as const,
    properties: {
      urgency_level: {
        type: 'string',
        enum: ['high', 'critical'],
        description: 'high = urgente. critical = risco de vida imediato.',
      },
      message_snippet: {
        type: 'string',
        description: 'Resumo em 1 frase do motivo para a recepção. Ex: "Pet com convulsões há 10 min".',
      },
    },
    required: ['urgency_level', 'message_snippet'],
  },
}

// ─── Tool executors ───────────────────────────────────────────────────────────

async function execGetClinicInfo(clinicId: string, includePrices: boolean): Promise<string> {
  const admin = createAdminClient()
  const [clinicRes, catalogRes] = await Promise.all([
    admin.from('clinics').select('name, address, phone').eq('id', clinicId).single(),
    admin.from('clinic_catalog').select('name, item_type, price').eq('clinic_id', clinicId).eq('is_active', true).order('item_type').limit(25),
  ])
  const c = clinicRes.data
  if (!c) return 'Informações da clínica não disponíveis.'
  const services = (catalogRes.data ?? [])
    .map(s => includePrices
      ? `  • ${s.name}: R$ ${Number(s.price).toFixed(2).replace('.', ',')}`
      : `  • ${s.name}`)
    .join('\n')
  return [
    `Clínica: ${c.name}`,
    `Endereço: ${c.address ?? 'não informado'}`,
    `Telefone: ${c.phone ?? 'não informado'}`,
    `Serviços:\n${services || '  (nenhum cadastrado)'}`,
  ].join('\n')
}

async function execGetPrice(clinicId: string, service: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('clinic_catalog')
    .select('name, price')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .ilike('name', `%${service}%`)
    .limit(5)
  if (!data?.length) return `Serviço "${service}" não encontrado no catálogo.`
  return data.map(s => `${s.name}: R$ ${Number(s.price).toFixed(2).replace('.', ',')}`).join('\n')
}

async function execGetAvailability(clinicId: string, date: string): Promise<string> {
  const admin = createAdminClient()
  const dayStart = `${date}T00:00:00`
  const dayEnd   = `${date}T23:59:59`

  const { data: appts } = await admin
    .from('appointments')
    .select('appointment_datetime')
    .eq('clinic_id', clinicId)
    .gte('appointment_datetime', dayStart)
    .lte('appointment_datetime', dayEnd)
    .neq('status', 'cancelled')

  const bookedHours = new Set(
    (appts ?? []).map(a => new Date(a.appointment_datetime).getHours())
  )

  // Horário padrão 08–18h (hora cheia)
  const allSlots  = Array.from({ length: 10 }, (_, i) => i + 8)
  const available = allSlots.filter(h => !bookedHours.has(h))

  if (!available.length) return `Sem horários disponíveis em ${date}.`
  const slots = available.map(h => `  • ${String(h).padStart(2, '0')}:00`).join('\n')
  return `Horários disponíveis em ${date}:\n${slots}`
}

async function execEscalateUrgency(params: {
  clinicId:       string
  conversationId: string
  tutorPhone:     string
  tutorName:      string | null
  vetUserId:      string | null
  vetPhone:       string | null
  urgencyLevel:   string
  messageSnippet: string
}): Promise<string> {
  const admin = createAdminClient()

  const { data: log } = await admin
    .from('urgency_escalation_logs')
    .insert({
      clinic_id:       params.clinicId,
      conversation_id: params.conversationId,
      tutor_phone:     params.tutorPhone,
      tutor_name:      params.tutorName,
      urgency_level:   params.urgencyLevel,
      message_snippet: params.messageSnippet,
      vet_user_id:     params.vetUserId,
    })
    .select('id')
    .single()

  let vetNotified = false
  if (params.vetPhone) {
    const apiUrl = process.env.EVOLUTION_API_URL
    const apiKey = process.env.EVOLUTION_API_KEY
    if (apiUrl && apiKey) {
      const { data: wppSettings } = await admin
        .from('clinic_whatsapp_settings')
        .select('evolution_instance_name')
        .eq('clinic_id', params.clinicId)
        .maybeSingle()
      if (wppSettings?.evolution_instance_name) {
        const label  = params.tutorName ?? params.tutorPhone
        const pushMsg = `🚨 URGÊNCIA WPP\nTutor: ${label}\n${params.messageSnippet}\n✅ Recepção alertada.`
        try {
          await evolutionSendText(
            { apiUrl, instanceId: wppSettings.evolution_instance_name, apiKey },
            params.vetPhone,
            pushMsg,
          )
          vetNotified = true
        } catch { /* best effort */ }
      }
    }
  }

  const { data: clinic } = await admin.from('clinics').select('phone').eq('id', params.clinicId).single()

  return JSON.stringify({
    reception_alerted: !!log,
    vet_notified:      vetNotified,
    clinic_phone:      clinic?.phone ?? null,
  })
}

async function execBookAppointment(params: {
  clinicId:   string
  tutorPhone: string
  tutorName:  string | null
  petName:    string
  petSpecies: string
  date:       string
  time:       string
  reason:     string
  notes:      string
}): Promise<string> {
  const admin = createAdminClient()
  const { clinicId, tutorPhone, tutorName, petName, petSpecies, date, time, reason, notes } = params

  // 1. Find or create tutor by phone
  let tutorId: string
  const { data: existingTutor } = await admin
    .from('tutors')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('phone', tutorPhone)
    .maybeSingle()

  if (existingTutor) {
    tutorId = existingTutor.id
  } else {
    const { data: newTutor, error: tutorErr } = await admin
      .from('tutors')
      .insert({
        clinic_id: clinicId,
        name:      tutorName ?? 'Tutor WhatsApp',
        cpf:       `WPP-${tutorPhone}`,
        phone:     tutorPhone,
      })
      .select('id')
      .single()
    if (tutorErr || !newTutor) return `Erro ao registrar tutor: ${tutorErr?.message ?? 'desconhecido'}`
    tutorId = newTutor.id
  }

  // 2. Find or create patient by name + tutor
  const validSpecies = ['dog','cat','bird','exotic','rabbit','rodent','reptile','fish']
  const species = validSpecies.includes(petSpecies) ? petSpecies : 'dog'

  let petId: string
  const { data: existingPet } = await admin
    .from('patients')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('tutor_id', tutorId)
    .ilike('name', petName)
    .maybeSingle()

  if (existingPet) {
    petId = existingPet.id
  } else {
    const { data: newPet, error: petErr } = await admin
      .from('patients')
      .insert({ clinic_id: clinicId, tutor_id: tutorId, name: petName, species })
      .select('id')
      .single()
    if (petErr || !newPet) return `Erro ao registrar pet: ${petErr?.message ?? 'desconhecido'}`
    petId = newPet.id
  }

  // 3. Create appointment
  const datetime = `${date}T${time}:00`
  const { error: apptErr } = await admin
    .from('appointments')
    .insert({
      clinic_id:            clinicId,
      pet_id:               petId,
      tutor_id:             tutorId,
      appointment_datetime: datetime,
      reason:               reason || 'consultation',
      notes:                notes || null,
      status:               'scheduled',
      source:               'whatsapp',
    })

  if (apptErr) return `Erro ao criar agendamento: ${apptErr.message}`

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `Agendamento confirmado! ${petName} está marcado para ${dateLabel} às ${time}. Até lá!`
}

// ─── Executores de confirmação de agendamento ─────────────────────────────────

async function execConfirmAppointment(appointmentId: string): Promise<string> {
  const admin = createAdminClient()
  const now   = new Date().toISOString()
  const { error } = await admin
    .from('appointments')
    .update({
      status:                  'confirmed',
      bot_confirmation_status: 'confirmed',
      bot_confirmation_at:     now,
    })
    .eq('id', appointmentId)
  if (error) return `Erro ao confirmar: ${error.message}`
  return 'Agendamento marcado como confirmado. Pode responder ao tutor agradecendo a confirmação.'
}

async function execCancelAppointment(appointmentId: string): Promise<string> {
  const admin = createAdminClient()
  const now   = new Date().toISOString()
  const { error } = await admin
    .from('appointments')
    .update({
      status:                  'cancelled',
      bot_confirmation_status: 'cancelled',
      bot_confirmation_at:     now,
    })
    .eq('id', appointmentId)
  if (error) return `Erro ao cancelar: ${error.message}`
  return 'Agendamento cancelado. Pode responder ao tutor confirmando o cancelamento e oferecendo ajuda para reagendar quando quiser.'
}

async function execRescheduleAppointment(params: {
  appointmentId: string
  newDate:       string
  newTime:       string
}): Promise<string> {
  const admin    = createAdminClient()
  const datetime = `${params.newDate}T${params.newTime}:00`
  const now      = new Date().toISOString()

  // Verifica conflito no novo slot
  const slotStart = `${params.newDate}T${params.newTime}:00`
  const slotEnd   = `${params.newDate}T${params.newTime}:59`
  const { data: conflict } = await admin
    .from('appointments')
    .select('id')
    .eq('clinic_id', (await admin.from('appointments').select('clinic_id').eq('id', params.appointmentId).single()).data?.clinic_id ?? '')
    .neq('status', 'cancelled')
    .neq('id', params.appointmentId)
    .gte('appointment_datetime', slotStart)
    .lte('appointment_datetime', slotEnd)
    .maybeSingle()

  if (conflict) {
    return `Slot ${params.newDate} ${params.newTime} já ocupado. Peça ao tutor para escolher outro horário entre os disponíveis.`
  }

  const { error } = await admin
    .from('appointments')
    .update({
      appointment_datetime:    datetime,
      status:                  'scheduled',
      bot_confirmation_status: 'rescheduled',
      bot_confirmation_at:     now,
    })
    .eq('id', params.appointmentId)
  if (error) return `Erro ao remarcar: ${error.message}`

  const dateLabel = new Date(`${params.newDate}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `Agendamento remarcado para ${dateLabel} às ${params.newTime}. Confirme ao tutor.`
}

// ─── Main agent ───────────────────────────────────────────────────────────────

export type AgentResult = {
  reply:   string
  handoff: boolean
  handoffReason?: string
}

export async function runWhatsappAgent(params: {
  clinicId:               string
  conversationId:         string
  userMessage:            string
  tutorName:              string | null
  tutorPhone:             string
  personalityPrompt?:     string | null
  canBook?:               boolean
  canInformPrices?:       boolean
  pendingAppointmentId?:  string | null
  pendingAppointmentAt?:  string | null   // ISO datetime do appointment pendente
}): Promise<AgentResult & { confirmationResolved?: 'confirmed' | 'rescheduled' | 'cancelled' }> {
  const admin = createAdminClient()

  // Verifica se algum veterinário está em Modo Cirurgia
  const vetInfo = await getVetSurgeryInfo(params.clinicId)

  // Histórico recente da conversa (últimas 10 mensagens)
  const { data: history } = await admin
    .from('whatsapp_messages')
    .select('direction, content')
    .eq('conversation_id', params.conversationId)
    .order('created_at', { ascending: false })
    .limit(10)

  const messages: Anthropic.MessageParam[] = (history ?? [])
    .reverse()
    .map(m => ({
      role:    m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content,
    }))

  // Adiciona a mensagem atual
  messages.push({ role: 'user', content: params.userMessage })

  // Capacidades configuradas pela clínica (default: tudo habilitado)
  const canBook         = params.canBook         ?? true
  const canInformPrices = params.canInformPrices ?? true

  // Prompt de sistema
  const { data: clinic } = await admin.from('clinics').select('name').eq('id', params.clinicId).single()
  const clinicName = clinic?.name ?? 'a clínica'
  const tutorGreeting = params.tutorName ? `O nome do tutor nesta conversa é ${params.tutorName}.` : ''

  const defaultPersonality = `Você é o assistente virtual de ${clinicName} no WhatsApp.
Seja cordial, conciso e profissional. Use linguagem informal-cordial (sem asteriscos, sem emojis em excesso).
Responda apenas sobre: serviços veterinários, preços, horários e agendamentos.
Para emergências ou pedidos fora do escopo, transfira para um atendente humano.`

  const surgeryContext = vetInfo.isInSurgery
    ? `\n⚠️ MODO FOCO CLÍNICO ATIVO: O médico veterinário está em cirurgia neste momento.\n- Se a mensagem indicar urgência médica real (convulsão, dificuldade respiratória, trauma grave, envenenamento, desmaio, sangramento intenso): chame 'escalate_urgency_to_reception' e oriente o tutor a ir à recepção imediatamente.\n- Para casos não urgentes: responda normalmente e informe que o MV está em cirurgia, mas a recepção pode ajudar.`
    : ''

  const priceRestriction = !canInformPrices
    ? 'RESTRIÇÃO: Não informe valores, preços ou tabelas de preços ao tutor, mesmo que perguntado. Quando solicitado preço de qualquer serviço, responda que as informações de valores devem ser consultadas diretamente com a clínica pelo telefone.'
    : ''

  const bookingRestriction = !canBook
    ? 'RESTRIÇÃO: Você NÃO pode confirmar agendamentos diretamente. Quando o tutor quiser agendar, use get_availability para informar os dias e horários disponíveis e, em seguida, use request_human_handoff (reason: "agendamento_pendente_confirmacao") para transferir ao atendente que fará a confirmação.'
    : ''

  // Contexto de confirmação de agendamento — ativado quando a conversa tem um
  // appointment pendente vindo da campanha appointment_confirmation.
  let confirmationContext = ''
  if (params.pendingAppointmentId && params.pendingAppointmentAt) {
    const dt = new Date(params.pendingAppointmentAt)
    const dateLabel = dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    const timeLabel = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    confirmationContext = `\nCONFIRMAÇÃO DE AGENDAMENTO PENDENTE: O tutor recebeu um lembrete sobre o agendamento marcado para ${dateLabel} às ${timeLabel}. A próxima mensagem dele deve ser interpretada como:
- Se for CONFIRMAR / "tá certo" / "vou sim" / "ok" / "confirmo" → chame confirm_appointment.
- Se for CANCELAR / "não vou" / "desmarcar" → chame cancel_appointment.
- Se for REMARCAR / "preciso mudar" / "outro dia" → pergunte para qual dia ele prefere, use get_availability para listar horários e, depois que o tutor escolher, chame reschedule_appointment com a nova data e horário.
Não chame book_appointment neste fluxo — sempre use reschedule_appointment para alterar a data deste agendamento existente.`
  }

  const systemPrompt = [
    params.personalityPrompt ?? defaultPersonality,
    tutorGreeting,
    'Hoje é ' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) + '.',
    surgeryContext,
    priceRestriction,
    bookingRestriction,
    confirmationContext,
    'Use as ferramentas disponíveis quando precisar de dados reais antes de responder.',
  ].filter(Boolean).join('\n')

  // Filtra tools de acordo com as capacidades habilitadas
  const baseTools = TOOLS.filter(t => {
    if (t.name === 'get_price'        && !canInformPrices) return false
    if (t.name === 'book_appointment' && !canBook)         return false
    return true
  })
  let activeTools = vetInfo.isInSurgery ? [...baseTools, SURGERY_TOOL] : baseTools
  if (params.pendingAppointmentId) {
    activeTools = [...activeTools, ...CONFIRMATION_TOOLS]
  }

  // Resultado lateral: indica ao caller qual decisão o bot tomou (para limpar pending_appointment_id)
  let confirmationResolved: 'confirmed' | 'rescheduled' | 'cancelled' | undefined

  // Agentic loop — máximo 5 iterações
  let currentMessages = [...messages]

  for (let iter = 0; iter < 5; iter++) {
    let response: Awaited<ReturnType<typeof anthropic.messages.create>>
    try {
      response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:     systemPrompt,
        tools:      activeTools,
        messages:   currentMessages,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isCredits = msg.includes('credit balance') || msg.includes('insufficient_quota')
      console.error('[WPP Agent] Erro Anthropic API:', isCredits ? 'créditos insuficientes' : msg)
      return {
        reply:   isCredits
          ? 'No momento estamos com dificuldades técnicas. Um atendente entrará em contato em breve!'
          : 'Desculpe, ocorreu um erro interno. Um atendente irá te atender em breve.',
        handoff: true,
        handoffReason: isCredits ? 'anthropic_no_credits' : 'anthropic_error',
      }
    }

    // Verifica handoff imediato (stop_reason = tool_use com request_human_handoff)
    const toolUses = response.content.filter(b => b.type === 'tool_use')

    if (toolUses.some(b => b.type === 'tool_use' && b.name === 'request_human_handoff')) {
      const handoffBlock = toolUses.find(b => b.type === 'tool_use' && b.name === 'request_human_handoff')!
      const reason = (handoffBlock as Anthropic.ToolUseBlock).input as { reason: string }
      return { reply: 'Vou te transferir para um de nossos atendentes. Em breve alguém entrará em contato!', handoff: true, handoffReason: reason.reason }
    }

    // stop_reason = end_turn → resposta final
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      const reply = textBlock?.type === 'text' ? textBlock.text.trim() : ''
      return { reply: reply || 'Desculpe, não consegui processar sua mensagem.', handoff: false, confirmationResolved }
    }

    // stop_reason = tool_use → executa ferramentas e continua
    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of toolUses) {
        if (block.type !== 'tool_use') continue
        const input = block.input as Record<string, string>
        let result = ''

        if (block.name === 'get_clinic_info')  result = await execGetClinicInfo(params.clinicId, canInformPrices)
        if (block.name === 'get_price')         result = await execGetPrice(params.clinicId, input.service)
        if (block.name === 'get_availability')  result = await execGetAvailability(params.clinicId, input.date)
        if (block.name === 'escalate_urgency_to_reception') result = await execEscalateUrgency({
          clinicId:       params.clinicId,
          conversationId: params.conversationId,
          tutorPhone:     params.tutorPhone,
          tutorName:      params.tutorName,
          vetUserId:      vetInfo.vetUserId,
          vetPhone:       vetInfo.vetPhone,
          urgencyLevel:   input.urgency_level,
          messageSnippet: input.message_snippet,
        })
        if (block.name === 'book_appointment')  result = await execBookAppointment({
          clinicId:   params.clinicId,
          tutorPhone: params.tutorPhone,
          tutorName:  params.tutorName,
          petName:    input.pet_name,
          petSpecies: input.pet_species ?? 'dog',
          date:       input.date,
          time:       input.time,
          reason:     input.reason ?? 'consultation',
          notes:      input.notes ?? '',
        })

        if (block.name === 'confirm_appointment' && params.pendingAppointmentId) {
          result = await execConfirmAppointment(params.pendingAppointmentId)
          confirmationResolved = 'confirmed'
        }
        if (block.name === 'cancel_appointment' && params.pendingAppointmentId) {
          result = await execCancelAppointment(params.pendingAppointmentId)
          confirmationResolved = 'cancelled'
        }
        if (block.name === 'reschedule_appointment' && params.pendingAppointmentId) {
          result = await execRescheduleAppointment({
            appointmentId: params.pendingAppointmentId,
            newDate:       input.new_date,
            newTime:       input.new_time,
          })
          if (!result.startsWith('Slot') && !result.startsWith('Erro')) {
            confirmationResolved = 'rescheduled'
          }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user',      content: toolResults },
      ]
      continue
    }

    break
  }

  return { reply: 'Desculpe, não consegui processar sua solicitação no momento.', handoff: false, confirmationResolved }
}
