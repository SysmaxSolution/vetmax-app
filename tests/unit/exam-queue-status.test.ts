import { describe, it, expect } from '@jest/globals'
import { EXAM_QUEUE_STATUSES, isInExamQueue, examQueueMoveError } from '@/lib/exams/queue-status'

describe('EXAM_QUEUE_STATUSES', () => {
  it('cobre os DOIS estados da fila de exames', () => {
    expect([...EXAM_QUEUE_STATUSES]).toEqual(['waiting_exam', 'awaiting_lab_result'])
  })
  it('awaiting_lab_result está incluído — era a causa da falha silenciosa', () => {
    expect(isInExamQueue('awaiting_lab_result')).toBe(true)
  })
  it('waiting_exam continua valendo', () => {
    expect(isInExamQueue('waiting_exam')).toBe(true)
  })
  it('estados fora da fila não passam', () => {
    for (const s of ['in_progress', 'completed', 'triage', 'hospitalized', 'awaiting_review', 'cancelled']) {
      expect(isInExamQueue(s)).toBe(false)
    }
  })
  it('nulo/indefinido não passa', () => {
    expect(isInExamQueue(null)).toBe(false)
    expect(isInExamQueue(undefined)).toBe(false)
    expect(isInExamQueue('')).toBe(false)
  })
})

describe('examQueueMoveError — nunca reportar sucesso sem ter movido nada', () => {
  it('diz a situação real quando a consulta saiu da fila', () => {
    expect(examQueueMoveError('completed')).toContain('completed')
    expect(examQueueMoveError('completed')).toContain('não está mais na fila')
  })
  it('avisa quando o atendimento sequer foi encontrado', () => {
    expect(examQueueMoveError(null)).toContain('não encontrado')
  })
  it('em estado válido (corrida rara) devolve mensagem de retentativa, não sucesso', () => {
    expect(examQueueMoveError('awaiting_lab_result')).toContain('Tente novamente')
  })
})
