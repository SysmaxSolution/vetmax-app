'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'
import { correctTranscript } from './voice-corrections'
import { consumeStockForApplication, returnStockConsumption } from './stock-consumption'
import { usaCobrancaDeInsumoAplicado } from './consultation-stock'
import { addServiceToConsultation, cancelConsultationService } from './services'
import { resumirBaixa, deveCobrarAplicacao, formatarQuantidade } from '@/lib/stock/aplicacao'
import type { StatusBaixaEstoque } from '@/lib/stock/aplicacao'
import type {
  AppliedMedication,
  AppliedMedicationResult,
  Referral,
  ExtractedClinicalActions,
} from '@/types/pharmacy'
import type { VoiceExtractionResult, FlowConfigInput } from '@/types/pharmacy-voice'

import { mensagemErro } from '@/lib/errors'
// ─── Types ───────────────────────────────────────────────────────────────────

// Colunas lidas em toda consulta de medicacao aplicada: as clinicas mais o
// vinculo de estoque/cobranca da migration 0505.
const COLUNAS_MEDICACAO =
  'id, consultation_id, medication_name, dosage, route, notes, is_controlled, created_at, stock_item_id, quantity, unit, stock_movement_id, stock_status, consultation_service_id, prescription_notification'

// ─── Medicações Aplicadas ─────────────────────────────────────────────────────

export async function getAppliedMedications(
  consultationId: string
): Promise<AppliedMedication[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('applied_medications')
    .select(COLUNAS_MEDICACAO)
    .eq('consultation_id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar medicações: ' + mensagemErro(error, 'lib/actions/pharmacy.ts') }
  return (data ?? []) as AppliedMedication[]
}

export async function addAppliedMedication(data: {
  consultation_id: string
  medication_name: string
  dosage?: string
  route?: string
  notes?: string
  is_controlled?: boolean
  /** Item escolhido no estoque. Ausente = registro em texto livre. */
  stock_item_id?: string | null
  /** Quantidade aplicada, na unidade do item. Padrao 1. */
  quantity?: number | null
  /** No da notificacao de receita, exigido no controlado (Portaria 344/1998). */
  prescription_notification?: string | null
  /** Registro clinico sem efeito de estoque — ex.: medicacao trazida pelo tutor. */
  sem_baixa?: boolean
}): Promise<AppliedMedicationResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clinica.' }

  const admin = createAdminClient()
  const nome = data.medication_name.trim()
  if (!nome) return { error: 'Informe o medicamento ou insumo aplicado.' }

  const quantidade = Number(data.quantity ?? 1)
  if (!(quantidade > 0)) return { error: 'A quantidade aplicada deve ser maior que zero.' }

  // --- Item do estoque (quando o MV escolheu do catalogo) -------------------
  // Tipo local, nao exportado: 'use server' nao pode exportar tipo (a guarda
  // guard-use-server-types bloqueia, e em producao viraria 500).
  type ItemAplicado = { id: string; name: string; unit: string | null; is_service: boolean; is_controlled: boolean }
  let item: ItemAplicado | null = null
  if (data.stock_item_id) {
    const { data: encontrado } = await admin
      .from('stock_items')
      .select('id, name, unit, is_service, is_controlled')
      .eq('id', data.stock_item_id)
      .eq('clinic_id', profile.clinic_id)
      .maybeSingle()
    if (!encontrado) return { error: 'Item nao encontrado no estoque desta clinica.' }
    item = encontrado as unknown as ItemAplicado
  }

  // Controlado nao e opiniao de quem digita: quando o item vem do estoque, quem
  // manda e o cadastro. No texto livre fica o que a tela inferiu pela DCB.
  const ehControlado = item ? Boolean(item.is_controlled) : Boolean(data.is_controlled)

  const { data: result, error } = await admin
    .from('applied_medications')
    .insert({
      clinic_id:                 profile.clinic_id,
      consultation_id:           data.consultation_id,
      medication_name:           nome,
      dosage:                    data.dosage ?? null,
      route:                     data.route ?? null,
      notes:                     data.notes ?? null,
      is_controlled:             ehControlado,
      administered_by:           user.id,
      stock_item_id:             item?.id ?? null,
      quantity:                  quantidade,
      unit:                      item?.unit ?? null,
      prescription_notification: data.prescription_notification?.trim() || null,
    })
    .select(COLUNAS_MEDICACAO)
    .single()

  if (error || !result) return { error: 'Erro ao registrar medicacao: ' + ((error ? mensagemErro(error, 'lib/actions/pharmacy.ts') : '')) }

  // --- Baixa do estoque -----------------------------------------------------
  // Nunca trava o registro clinico (seguranca do paciente > controle de
  // estoque), mas o resultado SEMPRE volta para a tela: item fora do estoque e
  // saldo negativo viram divergencia visivel, nao silencio.
  let resumo: AppliedMedicationResult['stock'] = null
  let movementId: string | null = null

  if (data.sem_baixa) {
    resumo = resumirBaixa({ resultado: null, nome, quantidade, unidade: item?.unit ?? null })
  } else {
    // Contexto que vai no movimento e aparece no Livro de Controlados.
    const { data: consulta } = await admin
      .from('consultations')
      .select('os_number, patient:patients(name)')
      .eq('id', data.consultation_id)
      .eq('clinic_id', profile.clinic_id)
      .maybeSingle()
    const pet = (consulta as { patient?: { name?: string } | { name?: string }[] } | null)?.patient
    const petNome = Array.isArray(pet) ? pet[0]?.name : pet?.name
    const osNumero = (consulta as { os_number?: string | number } | null)?.os_number
    const contexto = ['Consulta', osNumero ? 'OS ' + osNumero : null, petNome ?? null]
      .filter(Boolean).join(' - ')

    const baixa = await consumeStockForApplication({
      stock_item_id:   item?.id ?? null,
      medication_name: nome,
      quantity:        quantidade,
      source:          'CONSULTATION',
      reference_id:    result.id as string,
      notes:           contexto,
    })

    if ('error' in baixa) {
      resumo = resumirBaixa({ resultado: null, nome, quantidade, unidade: item?.unit ?? null, erro: baixa.error })
    } else {
      movementId = baixa.movement_id
      resumo = resumirBaixa({ resultado: baixa, nome, quantidade, unidade: item?.unit ?? null })
    }
  }

  // --- Cobranca automatica na conta da OS (item 0.7, sob flag) -------------
  let serviceId: string | null = null
  let avisoCobranca: string | null = null

  const cobrancaAutomatica = await usaCobrancaDeInsumoAplicado()
  if (item && deveCobrarAplicacao({
    cobrancaAutomatica,
    stockItemId:   item.id,
    itemEhServico: Boolean(item.is_service),
    status:        resumo?.status ?? 'sem_baixa',
  })) {
    const lancado = await addServiceToConsultation({
      consultation_id: data.consultation_id,
      stock_item_id:   item.id,
      quantity:        quantidade,
      added_at_stage:  'vet',
    })
    if ('error' in lancado) {
      avisoCobranca = 'O item nao entrou na conta da OS: ' + lancado.error
    } else {
      serviceId = lancado.id
    }
  }

  // Grava o que aconteceu no proprio registro — e o que a tela rele depois.
  await admin
    .from('applied_medications')
    .update({
      stock_movement_id:       movementId,
      stock_status:            resumo?.status ?? null,
      consultation_service_id: serviceId,
    })
    .eq('id', result.id)
    .eq('clinic_id', profile.clinic_id)

  await logAudit({
    action: 'ADD_MEDICATION',
    entity_type: 'applied_medications',
    entity_id: result.id,
    details: {
      medication_name: nome,
      is_controlled:   ehControlado,
      consultation_id: data.consultation_id,
      stock_item_id:   item?.id ?? null,
      quantity:        quantidade,
      stock_status:    resumo?.status ?? null,
      movement_id:     movementId,
      service_id:      serviceId,
    },
  })

  revalidatePath('/dashboard/vet/' + data.consultation_id)

  return {
    medication: {
      ...(result as unknown as AppliedMedication),
      stock_movement_id:       movementId,
      stock_status:            (resumo?.status ?? null) as StatusBaixaEstoque | null,
      consultation_service_id: serviceId,
    },
    stock: resumo,
    avisoCobranca,
  }
}

export async function deleteAppliedMedication(
  id: string,
  consultationId: string
): Promise<{ success: true; mensagem?: string; aviso?: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clinica.' }

  const admin = createAdminClient()

  // Le o registro ANTES de apagar: e dele que saem o movimento a devolver e a
  // linha de cobranca a cancelar.
  const { data: registro } = await admin
    .from('applied_medications')
    .select(COLUNAS_MEDICACAO)
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()

  if (!registro) return { error: 'Medicacao nao encontrada nesta clinica.' }

  const medicacao = registro as unknown as AppliedMedication
  const avisos: string[] = []
  const feitos: string[] = []

  // --- 1. devolve ao estoque -----------------------------------------------
  if (medicacao.stock_movement_id && medicacao.stock_status !== 'devolvido') {
    const devolucao = await returnStockConsumption(
      medicacao.stock_movement_id,
      'Devolucao: medicacao removida do prontuario da consulta ' + consultationId,
    )
    if ('error' in devolucao) {
      avisos.push('o estoque NAO foi devolvido (' + devolucao.error + ')')
    } else {
      feitos.push(
        formatarQuantidade(devolucao.returned, medicacao.unit) + ' devolvido(s) ao estoque'
      )
    }
  }

  // --- 2. cancela a cobranca que a aplicacao gerou --------------------------
  if (medicacao.consultation_service_id) {
    const cancelado = await cancelConsultationService(
      medicacao.consultation_service_id,
      'Medicacao removida do prontuario',
    )
    if ('error' in cancelado) {
      avisos.push('o item continua na conta da OS (' + cancelado.error + ')')
    } else {
      feitos.push('item retirado da conta da OS')
    }
  }

  // --- 3. apaga o registro clinico -----------------------------------------
  const { error } = await admin
    .from('applied_medications')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao remover medicacao: ' + mensagemErro(error, 'lib/actions/pharmacy.ts') }

  await logAudit({
    action: 'DELETE_MEDICATION',
    entity_type: 'applied_medications',
    entity_id: id,
    details: {
      consultation_id:  consultationId,
      medication_name:  medicacao.medication_name,
      stock_item_id:    medicacao.stock_item_id,
      quantity:         medicacao.quantity,
      movimento_origem: medicacao.stock_movement_id,
      servico_cancelado: medicacao.consultation_service_id,
      efeitos:          feitos,
      falhas:           avisos,
      reason: 'Removido manualmente pelo painel',
    },
  })

  revalidatePath('/dashboard/vet/' + consultationId)

  // Falha secundaria nao derruba a remocao, mas tambem nao se esconde: volta
  // para a tela de quem removeu.
  return {
    success: true,
    mensagem: feitos.length > 0 ? feitos.join(' - ') : undefined,
    aviso:    avisos.length > 0 ? 'Medicacao removida, mas ' + avisos.join(' e ') + '.' : undefined,
  }
}

export async function updateAppliedMedication(
  id: string,
  consultationId: string,
  // Quantidade e item de estoque NAO se editam aqui de proposito: mexer neles
  // exigiria refazer a baixa. Para corrigir o que saiu do estoque, remova a
  // medicacao (o que devolve ao lote de origem) e lance de novo.
  data: { medication_name: string; dosage?: string; route?: string; notes?: string; is_controlled?: boolean; prescription_notification?: string | null }
): Promise<AppliedMedication | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data: result, error } = await supabase
    .from('applied_medications')
    .update({
      medication_name: data.medication_name,
      dosage:          data.dosage ?? null,
      route:           data.route  ?? null,
      notes:           data.notes  ?? null,
      ...(data.is_controlled !== undefined && { is_controlled: data.is_controlled }),
      ...(data.prescription_notification !== undefined && { prescription_notification: data.prescription_notification?.trim() || null }),
    })
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .select(COLUNAS_MEDICACAO)
    .single()

  if (error || !result) return { error: 'Erro ao atualizar medicação: ' + ((error ? mensagemErro(error, 'lib/actions/pharmacy.ts') : '')) }

  await logAudit({
    action: 'UPDATE_MEDICATION',
    entity_type: 'applied_medications',
    entity_id: id,
    details: { medication_name: data.medication_name, consultation_id: consultationId },
  })

  revalidatePath(`/dashboard/vet/${consultationId}`)
  return result as AppliedMedication
}

// ─── Encaminhamentos e Receitas ───────────────────────────────────────────────

export async function getReferrals(
  consultationId: string
): Promise<Referral[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('referrals_and_external_rx')
    .select('id, consultation_id, type, description, doctor_notes, created_at')
    .eq('consultation_id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar encaminhamentos: ' + mensagemErro(error, 'lib/actions/pharmacy.ts') }
  return (data ?? []) as Referral[]
}

export async function addReferral(data: {
  consultation_id: string
  type: 'exam_internal' | 'exam_external' | 'prescription_external'
  description: string
  doctor_notes?: string
}): Promise<Referral | { error: string }> {
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

  const { data: result, error } = await admin
    .from('referrals_and_external_rx')
    .insert({
      clinic_id:       profile.clinic_id,
      consultation_id: data.consultation_id,
      type:            data.type,
      description:     data.description,
      doctor_notes:    data.doctor_notes ?? null,
    })
    .select('id, consultation_id, type, description, doctor_notes, created_at')
    .single()

  if (error || !result) return { error: 'Erro ao registrar encaminhamento: ' + ((error ? mensagemErro(error, 'lib/actions/pharmacy.ts') : '')) }

  revalidatePath(`/dashboard/vet/${data.consultation_id}`)
  return result as Referral
}

export async function deleteReferral(
  id: string,
  consultationId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { error } = await supabase
    .from('referrals_and_external_rx')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao remover encaminhamento: ' + mensagemErro(error, 'lib/actions/pharmacy.ts') }

  revalidatePath(`/dashboard/vet/${consultationId}`)
  return { success: true }
}

// ─── Extração Completa via Voz (Single Voice Engine) ─────────────────────────


export async function extractFullVoice(
  transcript: string,
  patientContext: {
    name: string
    species: string
    weight?: number
    allergies?: string
    vet_notes?: string
  },
  flowConfig?: FlowConfigInput
): Promise<VoiceExtractionResult | { error: string }> {
  if (!transcript.trim()) return { error: 'Transcrição vazia.' }

  // Frente 2: corrige termos veterinários/fármacos que o STT erra ANTES do Haiku
  // (e antes de virar prontuário no modo transcribe_only). Falha segura: na dúvida
  // devolve o texto original.
  transcript = await correctTranscript(transcript)

  const today = new Date()
  // Usa o timezone da clínica para `todayIso`/`todayFormatted` — Node em UTC no
  // Vercel mudaria o dia 3h antes do real (ex.: 21h BRT → "amanhã" no UTC).
  const todayIso = today.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) // "2026-05-29"
  const todayFormatted = today.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })

  const merged = flowConfig?.vet_merged_modules ?? []
  const triageMerged = merged.includes('triage')
  const examsMerged  = merged.includes('exams')

  // Aumentamos de 6 para 7 chaves base
  const totalKeys = 7 + (triageMerged ? 1 : 0) + (examsMerged ? 1 : 0)

  const triageBlock = triageMerged ? `

${totalKeys - (examsMerged ? 1 : 0)}. "sinais_vitais": objeto com os sinais vitais mencionados. Extraia APENAS valores mencionados explicitamente; use null para os não mencionados:
   {"weight": número em kg ou null, "temperature": número em °C ou null, "heart_rate": número em bpm ou null, "respiratory_rate": número em mrpm ou null, "chief_complaint": "queixa principal resumida ou null"}
   Exemplos de detecção: "pesa 5kg" → weight: 5; "temperatura 39" → temperature: 39; "frequência cardíaca 80" → heart_rate: 80` : ''

  const examsBlock = examsMerged ? `

${totalKeys}. "laudo_exame": string com o laudo ou resultado de exame ditado pelo veterinário...` : ''

  const dynamicKeys = [
    '"notas_clinicas"',
    '"medicacoes_aplicadas"',
    '"documentos_sugeridos"',
    '"agendamentos_sugeridos"',
    '"vaccines_applied"',
    '"pet_profile_updates"',
    '"suggested_routing"', // <--- ADICIONE ESTA CHAVE
    ...(triageMerged ? ['"sinais_vitais"'] : []),
    ...(examsMerged  ? ['"laudo_exame"']   : []),
  ].join(', ')

  const prompt = `Você é um assistente clínico veterinário com IA. Analise a transcrição e extraia ${totalKeys} categorias estruturadas.${triageMerged || examsMerged ? ' Este consultório opera em FLUXO CONTÍNUO: o veterinário realiza triagem e/ou exames na mesma sessão.' : ''}

CONTEXTO TEMPORAL: Hoje é ${todayFormatted} (${todayIso}). Use essa data para calcular datas de retorno mencionadas pelo veterinário.

CONTEXTO DO ANIMAL:
- Nome: ${patientContext.name}
- Espécie: ${patientContext.species}
- Peso: ${patientContext.weight ? patientContext.weight + ' kg' : 'não informado'}
- Alergias: ${patientContext.allergies || 'nenhuma conhecida'}
- Notas já registradas: ${patientContext.vet_notes ? '"' + patientContext.vet_notes.slice(0, 300) + '"' : 'nenhuma'}

TRANSCRIÇÃO DO VETERINÁRIO:
"${transcript}"

RETORNE UM JSON com exatamente estas ${totalKeys} chaves: ${dynamicKeys}

1. "notas_clinicas": string com o texto clínico para o PRONTUÁRIO veterinário (SOAP: Subjetivo, Objetivo, Avaliação, Plano). Inclua queixa principal, achados clínicos e conduta veterinária. Se não houver conteúdo, retorne string vazia.

2. "medicacoes_aplicadas": array de medicações administradas no animal durante a consulta.
   Cada item: {"medication_name": "nome", "dosage": "dose ou null", "route": "IV|IM|SC|oral|topical|other|null", "notes": "observações ou null", "is_controlled": true|false}
   Se nenhuma medicação foi mencionada, retorne array vazio.

3. "documentos_sugeridos": array de documentos clínicos que devem ser gerados para este atendimento.
   Cada item: {"tipo": "receita|encaminhamento|exame|laudo", "title": "título específico do documento (ex: 'Receita Digital: Dipirona + Meloxicam')", "summary": "resumo curto da prescrição/indicação (ex: 'Dosagem oral por 5 dias, jejum 2h antes')", "motivo": "motivo clínico completo", "is_controlled": true|false}
   Exemplos de title: "Receita: Amoxicilina 250mg", "Encaminhamento: Cardiologista Veterinário", "Solicitação de Exame: Hemograma + Bioquímica", "Laudo Pós-Cirúrgico"
   Exemplos de summary: "Via oral, 1 comprimido a cada 12h por 7 dias", "Suspeita de cardiopatia — ECG urgente", "Em jejum de 8h", "Alta após recuperação anestésica"
   Se nenhum documento for necessário, retorne array vazio.

4. "agendamentos_sugeridos": array de agendamentos futuros mencionados pelo veterinário.
   Cada item: {"data_sugerida": "YYYY-MM-DD calculada a partir de hoje (${todayIso})", "motivo": "Retorno|Consulta|Exame|Vacinação|Cirurgia"}
   Se nenhum agendamento foi mencionado, retorne array vazio.

5. "vaccines_applied": array de vacinas aplicadas durante esta consulta.
   Cada item: {"vaccine_name": "nome da vacina", "next_due_date": "YYYY-MM-DD da próxima dose ou null", "notes": "observações ou null"}
   Se nenhuma vacina foi aplicada, retorne array vazio.

6. "pet_profile_updates": objeto com fofocas e fatos novos sobre o histórico fixo do paciente (Cadastro Vivo) que não sejam apenas desta consulta.
   {"medical_history": "novo histórico/alergia ou null", "reproductive_status": "Castrado|Inteiro ou null", "coat_color": "cor da pelagem ou null", "behavior_tags": ["Agressivo", "Medroso", "Dócil"] ou []}
   Exemplo: Se o médico disser "Tutor relata que ele desenvolveu alergia a frango", adicione isso ao medical_history. Se disser "Foi castrado semana passada", coloque "Castrado". Se não houver atualizações cadastrais, retorne {"medical_history": null, "reproductive_status": null, "coat_color": null, "behavior_tags": []}.${triageBlock}${examsBlock}

7. "suggested_routing": string com a intenção do médico para o fim da consulta. 
   Retorne "discharge" se ele disser "dar alta", "liberar paciente", "vai para casa". 
   Retorne "hospitalization" se ele disser "internar", "vai para UTI", "ficará em observação". 
   Retorne "exams" se ele disser "aguardar exames", "fazer ultrassom agora". 
   Retorne null se não houver clareza.

REGRAS ABSOLUTAS:
- Retorne SOMENTE JSON válido, sem markdown...
`

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  try {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'IA não retornou JSON válido.' }
    const parsed = JSON.parse(match[0])

    const result: VoiceExtractionResult = {
      notas_clinicas:         typeof parsed.notas_clinicas === 'string' ? parsed.notas_clinicas : '',
      medicacoes_aplicadas:   Array.isArray(parsed.medicacoes_aplicadas)
        ? parsed.medicacoes_aplicadas.map((m: any) => ({
            ...m,
            is_controlled: m.is_controlled === true,
          }))
        : [],
      documentos_sugeridos:   Array.isArray(parsed.documentos_sugeridos)
        ? parsed.documentos_sugeridos.map((d: any) => ({
            ...d,
            title:         typeof d.title   === 'string' ? d.title   : '',
            summary:       typeof d.summary === 'string' ? d.summary : '',
            is_controlled: d.is_controlled === true,
          }))
        : [],
      agendamentos_sugeridos: Array.isArray(parsed.agendamentos_sugeridos) ? parsed.agendamentos_sugeridos : [],
      vaccines_applied:       Array.isArray(parsed.vaccines_applied)       ? parsed.vaccines_applied        : [],
      pet_profile_updates:    parsed.pet_profile_updates ?? null,
      suggested_routing:      parsed.suggested_routing ?? null, // <--- ADICIONE AQUI
      transcript_corrected:   transcript,  // Frente 2: já passou pelo dicionário
    }

    if (triageMerged && parsed.sinais_vitais && typeof parsed.sinais_vitais === 'object') {
      result.sinais_vitais = {
        weight:           parsed.sinais_vitais.weight           ?? null,
        temperature:      parsed.sinais_vitais.temperature      ?? null,
        heart_rate:       parsed.sinais_vitais.heart_rate       ?? null,
        respiratory_rate: parsed.sinais_vitais.respiratory_rate ?? null,
        chief_complaint:  parsed.sinais_vitais.chief_complaint  ?? null,
      }
    }

    if (examsMerged && typeof parsed.laudo_exame === 'string') {
      result.laudo_exame = parsed.laudo_exame
    }

    return result
  } catch {
    return { error: 'Erro ao interpretar resposta da IA.' }
  }
}
export async function extractHospitalizationVoice(transcript: string) {
  if (!transcript.trim()) return { error: 'Transcrição vazia.' }

  const prompt = `Você é um assistente de UTI veterinária. Analise o áudio do plantonista e extraia um JSON estrito.
  Transcrição: "${transcript}"
  
  RETORNE ESTE JSON:
  {
    "improvement_level": "melhorou" | "estavel" | "piorou",
    "notes": "Resumo clínico detalhado da evolução do paciente",
    "medications": [
      { "name": "Nome do remédio", "dose": "Dose", "route": "Via de admin", "notes": "Frequência/Obs" }
    ]
  }
  Se não falar medicação, retorne "medications": []. Inferir o improvement_level pelo tom do relato.
  Retorne SOMENTE o JSON, sem markdown nem explicações extras.`

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    
    // Extrair apenas o JSON da resposta
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'IA não retornou JSON válido.' }
    
    return JSON.parse(match[0])
  } catch (error) {
    console.error('Erro na IA da Internação:', error)
    return { error: 'Erro ao processar áudio da internação.' }
  }
}