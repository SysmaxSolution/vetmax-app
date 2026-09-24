// Fluxo de Rejeição de Exame — lógica PURA (sem I/O, sem 'use server').
// Máquina de estados do exame, elegibilidade de cobrança e resolução do
// destinatário da notificação. Testado em tests/unit/exam-rejection-flow.test.ts.
//
// Regra de negócio confirmada pela cliente: exame NÃO REALIZADO não é cobrado —
// nem valor cheio, nem custo operacional reduzido.

// ─── Estados ─────────────────────────────────────────────────────────────────

/**
 * Estado do exame na linha cobrável (consultation_services.exam_state).
 * `null` = linha fora do fluxo (clínica sem a flag) — comportamento atual.
 */
export type ExamState =
  | 'pending'              // coleta feita, aguardando o laboratório concluir
  | 'performed'            // realizado → pode ser cobrado
  | 'rejected'             // não realizado; aguardando a decisão do cliente
  | 'recollect_requested'  // cliente pediu recoleta; nova linha foi aberta
  | 'closed_no_recollect'  // cliente dispensou; exame encerrado SEM cobrança

export type ExamEvent =
  | { type: 'collect' }
  | { type: 'perform' }
  | { type: 'reject' }
  | { type: 'decide'; decision: ExamDecision }

export type ExamDecision = 'recollect' | 'no_recollect'

export type DecisionActorKind = 'partner' | 'tutor' | 'staff'

const TRANSITIONS: Record<ExamState, ExamState[]> = {
  pending:             ['performed', 'rejected'],
  performed:           [],                                        // terminal (cobrável)
  rejected:            ['recollect_requested', 'closed_no_recollect'],
  recollect_requested: [],                                        // terminal (a recoleta é OUTRA linha)
  closed_no_recollect: [],                                        // terminal (nunca cobrado)
}

/**
 * Aplica um evento ao estado atual. Devolve o próximo estado ou um erro
 * explicativo — nunca lança. `current` nulo é tratado como 'pending' (linha que
 * entrou no fluxo agora).
 */
export function nextExamState(
  current: ExamState | null,
  event: ExamEvent,
): { ok: true; state: ExamState } | { ok: false; error: string } {
  const from: ExamState = current ?? 'pending'

  let target: ExamState
  switch (event.type) {
    case 'collect':
      // Só faz sentido para uma linha ainda sem estado.
      if (current !== null) return { ok: false, error: 'Este exame já está no fluxo.' }
      return { ok: true, state: 'pending' }
    case 'perform': target = 'performed'; break
    case 'reject':  target = 'rejected';  break
    case 'decide':
      target = event.decision === 'recollect' ? 'recollect_requested' : 'closed_no_recollect'
      break
  }

  if (from === target) return { ok: false, error: 'O exame já está neste estado.' }
  if (!TRANSITIONS[from].includes(target)) {
    return { ok: false, error: `Transição inválida: ${STATE_LABEL[from]} → ${STATE_LABEL[target]}.` }
  }
  return { ok: true, state: target }
}

export const STATE_LABEL: Record<ExamState, string> = {
  pending:             'Aguardando realização',
  performed:           'Realizado',
  rejected:            'Não realizado',
  recollect_requested: 'Recoleta solicitada',
  closed_no_recollect: 'Encerrado sem recoleta',
}

/** Estados em que o exame está travado esperando a decisão de quem encaminhou. */
export function awaitsClientDecision(state: ExamState | null): boolean {
  return state === 'rejected'
}

/** Estados que NUNCA podem virar título financeiro. */
export function isTerminallyUnbillable(state: ExamState | null): boolean {
  return state === 'rejected' || state === 'recollect_requested' || state === 'closed_no_recollect'
}

// ─── Elegibilidade de cobrança ───────────────────────────────────────────────

export interface BillableLine {
  /** Estado do exame; null = linha comum (não é exame no fluxo). */
  exam_state:           ExamState | null
  /** Trava de cobrança (consultation_services.exam_billing_hold_at). */
  exam_billing_hold_at: string | null
  cancelled_at:         string | null
  billed_in_invoice_id: string | null
}

/**
 * A linha entra na fatura?
 *
 * Com a flag DESLIGADA o resultado é exatamente o filtro atual do faturamento
 * (`cancelled_at IS NULL AND billed_in_invoice_id IS NULL`) — nenhuma coluna
 * nova participa da decisão. É essa garantia que mantém o comportamento dos
 * demais clientes bit-a-bit igual.
 */
export function isExamBillable(line: BillableLine, flagOn: boolean): boolean {
  if (line.cancelled_at !== null) return false
  if (line.billed_in_invoice_id !== null) return false
  if (!flagOn) return true
  if (line.exam_billing_hold_at !== null) return false
  return !isTerminallyUnbillable(line.exam_state)
}

// ─── Destinatário da notificação ─────────────────────────────────────────────

export interface NotificationContext {
  /** Clínica parceira / protetor que encaminhou o pet (consultations.partner_clinic_id). */
  partner?: { id: string; name: string; phone?: string | null; email?: string | null } | null
  /** MV solicitante da parceira (consultations.referring_professional_id). */
  referringProfessional?: { id: string; name: string; phone?: string | null; email?: string | null } | null
  /** Tutor do pet — avisado quando existir. */
  tutor?: { id: string; name: string | null; phone?: string | null } | null
}

export interface Recipient {
  kind:  'partner' | 'referring_professional' | 'tutor'
  id:    string
  name:  string
  phone: string | null
  email: string | null
  /** Quem decide recoletar ou não. O tutor recebe aviso, mas não decide
   *  quando o encaminhamento veio de uma clínica parceira. */
  canDecide: boolean
}

/**
 * Quem deve ser avisado da rejeição, em ordem de prioridade.
 *
 * Regra: avisa SEMPRE quem encaminhou (o MV solicitante quando identificado,
 * senão a clínica parceira / protetor) e, quando houver, também o tutor.
 * A decisão é de quem encaminhou; sem parceira identificada, o tutor decide.
 */
export function resolveRejectionRecipients(ctx: NotificationContext): Recipient[] {
  const out: Recipient[] = []

  if (ctx.referringProfessional?.id) {
    const p = ctx.referringProfessional
    out.push({
      kind: 'referring_professional', id: p.id, name: p.name,
      phone: p.phone ?? null, email: p.email ?? null, canDecide: true,
    })
  }
  if (ctx.partner?.id) {
    const p = ctx.partner
    out.push({
      kind: 'partner', id: p.id, name: p.name,
      phone: p.phone ?? null, email: p.email ?? null, canDecide: true,
    })
  }
  if (ctx.tutor?.id) {
    const t = ctx.tutor
    out.push({
      kind: 'tutor', id: t.id, name: t.name ?? 'Tutor',
      phone: t.phone ?? null, email: null,
      // O tutor só decide quando não houve encaminhamento por parceira/MV.
      canDecide: out.length === 0,
    })
  }
  return out
}

/** TRUE quando ninguém pode ser avisado (sem telefone e sem e-mail). */
export function hasNoReachableRecipient(recipients: Recipient[]): boolean {
  return recipients.every(r => !r.phone && !r.email)
}

// ─── Mensagem ────────────────────────────────────────────────────────────────

export interface RejectionMessageInput {
  petName:    string
  examName:   string
  reason:     string
  note?:      string | null
  clinicName: string
  /** Link do portal onde o cliente responde (parceiro ou tutor). */
  link?:      string | null
  canDecide:  boolean
}

/** Texto único usado em WhatsApp e no corpo do e-mail. */
export function buildRejectionMessage(i: RejectionMessageInput): string {
  const lines: string[] = [
    `*${i.clinicName}* — exame não realizado`,
    '',
    `Pet: *${i.petName}*`,
    `Exame: *${i.examName}*`,
    `Motivo: *${i.reason}*`,
  ]
  if (i.note?.trim()) lines.push(`Observação: ${i.note.trim()}`)
  lines.push('', 'Este exame *não será cobrado*.')
  if (i.canDecide) {
    lines.push(
      '',
      'Você prefere *recoletar* a amostra ou *não recoletar*?',
      i.link ? `Responda por aqui ou no portal: ${i.link}` : 'Responda por aqui, por favor.',
    )
  }
  return lines.join('\n')
}

// ─── Catálogo semente de motivos ─────────────────────────────────────────────
// A lista DEFINITIVA é da clínica (editável em Gestão > Configurações >
// Laboratório). Estes são os motivos comuns de rejeição de amostra, semeados
// quando a clínica liga a flag.

export interface DefaultReason { code: string; label: string; description: string }

export const DEFAULT_REJECTION_REASONS: DefaultReason[] = [
  { code: 'lipemica',            label: 'Amostra lipêmica',              description: 'Excesso de gordura no soro/plasma interfere na leitura. Recomenda-se jejum de 8 a 12 horas antes da nova coleta.' },
  { code: 'hemolisada',          label: 'Amostra hemolisada',            description: 'Rompimento das hemácias invalida vários analitos. Recoletar com técnica atraumática.' },
  { code: 'coagulada',           label: 'Amostra coagulada',             description: 'Coágulo no tubo com anticoagulante impede o processamento. Homogeneizar o tubo logo após a coleta.' },
  { code: 'volume_insuficiente', label: 'Quantidade insuficiente',       description: 'Volume abaixo do mínimo necessário para o painel solicitado.' },
  { code: 'sem_identificacao',   label: 'Amostra sem identificação',     description: 'Tubo sem etiqueta ou sem correspondência com a requisição.' },
  { code: 'tubo_incorreto',      label: 'Tubo/anticoagulante incorreto', description: 'O tubo utilizado não é o indicado para o exame solicitado.' },
  { code: 'mal_conservada',      label: 'Amostra vencida / mal conservada', description: 'Temperatura ou tempo de transporte fora do aceitável.' },
  { code: 'extravio',            label: 'Extravio da amostra',           description: 'A amostra não chegou ao laboratório ou foi perdida no transporte.' },
  { code: 'contaminada',         label: 'Amostra contaminada',           description: 'Contaminação que compromete o resultado (ex.: urina, cultura).' },
  { code: 'outro',               label: 'Outro motivo',                  description: 'Descrever na observação.' },
]
