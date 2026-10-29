// Estados em que uma consulta está NA FILA DE EXAMES. Módulo puro.
//
// Bug pré-existente corrigido na Tarefa 0: `dischargeFromExams` e `returnToVet`
// filtravam por `status = 'waiting_exam'` apenas. Quando o exame foi enviado a
// laboratório parceiro a consulta fica em 'awaiting_lab_result' — o UPDATE
// casava zero linhas, o Supabase NÃO devolve erro nesse caso, e as actions
// retornavam `{ success: true }`. A UI mostrava o botão e reportava sucesso
// enquanto nada acontecia (falha silenciosa).
//
// Valores conferidos no CHECK de consultations.status:
// scheduled_future, reception, scheduled, triage, in_progress, waiting_exam,
// awaiting_lab_result, medication, completed, cancelled, hospitalized,
// revisao_pos_internacao, awaiting_review.

export const EXAM_QUEUE_STATUSES = ['waiting_exam', 'awaiting_lab_result'] as const

export type ExamQueueStatus = (typeof EXAM_QUEUE_STATUSES)[number]

/** A consulta está na fila de exames e pode sair dela (alta / devolver ao MV)? */
export function isInExamQueue(status: string | null | undefined): status is ExamQueueStatus {
  return !!status && (EXAM_QUEUE_STATUSES as readonly string[]).includes(status)
}

/**
 * Mensagem para quando o UPDATE não casou linha nenhuma. Nunca devolver sucesso
 * aqui: era exatamente a falha silenciosa que o usuário via como "cliquei e não
 * aconteceu nada".
 */
export function examQueueMoveError(currentStatus: string | null | undefined): string {
  if (!currentStatus) return 'Atendimento não encontrado nesta clínica.'
  if (isInExamQueue(currentStatus)) return 'Não foi possível atualizar o atendimento. Tente novamente.'
  return `Este atendimento não está mais na fila de exames (situação atual: ${currentStatus}). Atualize a tela.`
}
