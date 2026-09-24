import {
  nextExamState,
  awaitsClientDecision,
  isTerminallyUnbillable,
  isExamBillable,
  resolveRejectionRecipients,
  hasNoReachableRecipient,
  buildRejectionMessage,
  DEFAULT_REJECTION_REASONS,
  type BillableLine,
  type ExamState,
} from '@/lib/exams/rejection-flow'

// ─── Máquina de estados ──────────────────────────────────────────────────────

describe('nextExamState', () => {
  it('entra no fluxo com collect quando a linha ainda não tem estado', () => {
    const r = nextExamState(null, { type: 'collect' })
    expect(r).toEqual({ ok: true, state: 'pending' })
  })

  it('recusa collect em linha que já está no fluxo', () => {
    const r = nextExamState('pending', { type: 'collect' })
    expect(r.ok).toBe(false)
  })

  it('pending → performed', () => {
    expect(nextExamState('pending', { type: 'perform' })).toEqual({ ok: true, state: 'performed' })
  })

  it('pending → rejected', () => {
    expect(nextExamState('pending', { type: 'reject' })).toEqual({ ok: true, state: 'rejected' })
  })

  it('trata estado nulo como pending (linha entrando no fluxo pela rejeição)', () => {
    expect(nextExamState(null, { type: 'reject' })).toEqual({ ok: true, state: 'rejected' })
    expect(nextExamState(null, { type: 'perform' })).toEqual({ ok: true, state: 'performed' })
  })

  it('rejected → recollect_requested pela decisão do cliente', () => {
    expect(nextExamState('rejected', { type: 'decide', decision: 'recollect' }))
      .toEqual({ ok: true, state: 'recollect_requested' })
  })

  it('rejected → closed_no_recollect pela decisão do cliente', () => {
    expect(nextExamState('rejected', { type: 'decide', decision: 'no_recollect' }))
      .toEqual({ ok: true, state: 'closed_no_recollect' })
  })

  it('não aceita decisão do cliente sobre exame que não foi rejeitado', () => {
    const r = nextExamState('pending', { type: 'decide', decision: 'recollect' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/inválida/i)
  })

  it('performed é terminal — não pode ser rejeitado depois', () => {
    expect(nextExamState('performed', { type: 'reject' }).ok).toBe(false)
  })

  it('não reprocessa um encerramento já decidido', () => {
    expect(nextExamState('closed_no_recollect', { type: 'decide', decision: 'recollect' }).ok).toBe(false)
    expect(nextExamState('recollect_requested', { type: 'decide', decision: 'no_recollect' }).ok).toBe(false)
  })

  it('recusa transição para o mesmo estado', () => {
    const r = nextExamState('rejected', { type: 'reject' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já está neste estado/i)
  })
})

describe('awaitsClientDecision / isTerminallyUnbillable', () => {
  it('só o rejeitado espera decisão', () => {
    expect(awaitsClientDecision('rejected')).toBe(true)
    const others: Array<ExamState | null> = ['pending', 'performed', 'recollect_requested', 'closed_no_recollect', null]
    others.forEach(s => expect(awaitsClientDecision(s)).toBe(false))
  })

  it('rejeitado, recoleta solicitada e encerrado nunca viram título', () => {
    expect(isTerminallyUnbillable('rejected')).toBe(true)
    expect(isTerminallyUnbillable('recollect_requested')).toBe(true)
    expect(isTerminallyUnbillable('closed_no_recollect')).toBe(true)
    expect(isTerminallyUnbillable('performed')).toBe(false)
    expect(isTerminallyUnbillable('pending')).toBe(false)
    expect(isTerminallyUnbillable(null)).toBe(false)
  })
})

// ─── Elegibilidade de cobrança ───────────────────────────────────────────────

function line(over: Partial<BillableLine> = {}): BillableLine {
  return { exam_state: null, exam_billing_hold_at: null, cancelled_at: null, billed_in_invoice_id: null, ...over }
}

describe('isExamBillable — flag DESLIGADA (todos os outros clientes)', () => {
  it('cobra a linha normal, exatamente como hoje', () => {
    expect(isExamBillable(line(), false)).toBe(true)
  })

  it('IGNORA por completo as colunas novas quando a flag está desligada', () => {
    const suspeita = line({ exam_state: 'rejected', exam_billing_hold_at: '2026-09-24T10:00:00Z' })
    expect(isExamBillable(suspeita, false)).toBe(true)
  })

  it('mantém os dois únicos filtros atuais: cancelled_at e billed_in_invoice_id', () => {
    expect(isExamBillable(line({ cancelled_at: '2026-09-24T10:00:00Z' }), false)).toBe(false)
    expect(isExamBillable(line({ billed_in_invoice_id: 'inv-1' }), false)).toBe(false)
  })

  it('para toda combinação possível, flag OFF == filtro atual', () => {
    const states: Array<ExamState | null> = [null, 'pending', 'performed', 'rejected', 'recollect_requested', 'closed_no_recollect']
    const holds = [null, '2026-09-24T10:00:00Z']
    const cancels = [null, '2026-09-24T10:00:00Z']
    const billed = [null, 'inv-1']
    for (const s of states) for (const h of holds) for (const c of cancels) for (const b of billed) {
      const l = line({ exam_state: s, exam_billing_hold_at: h, cancelled_at: c, billed_in_invoice_id: b })
      const atual = l.cancelled_at === null && l.billed_in_invoice_id === null
      expect(isExamBillable(l, false)).toBe(atual)
    }
  })
})

describe('isExamBillable — flag LIGADA', () => {
  it('cobra o exame realizado', () => {
    expect(isExamBillable(line({ exam_state: 'performed' }), true)).toBe(true)
  })

  it('NÃO cobra o exame rejeitado', () => {
    expect(isExamBillable(line({ exam_state: 'rejected' }), true)).toBe(false)
  })

  it('NÃO cobra o exame encerrado sem recoleta (nem custo operacional)', () => {
    expect(isExamBillable(line({ exam_state: 'closed_no_recollect' }), true)).toBe(false)
  })

  it('NÃO cobra a coleta substituída por recoleta', () => {
    expect(isExamBillable(line({ exam_state: 'recollect_requested' }), true)).toBe(false)
  })

  it('adia a cobrança enquanto houver trava, mesmo com estado pendente', () => {
    expect(isExamBillable(line({ exam_state: 'pending', exam_billing_hold_at: '2026-09-24T10:00:00Z' }), true)).toBe(false)
  })

  it('cobra assim que a trava é liberada', () => {
    expect(isExamBillable(line({ exam_state: 'performed', exam_billing_hold_at: null }), true)).toBe(true)
  })
})

// ─── Destinatários ───────────────────────────────────────────────────────────

describe('resolveRejectionRecipients', () => {
  const tutor = { id: 't1', name: 'Ana Souza', phone: '16999990000' }

  it('MV solicitante decide e o tutor só é avisado', () => {
    const r = resolveRejectionRecipients({
      referringProfessional: { id: 'p1', name: 'Dra. Carla', phone: '1', email: 'c@x.com' },
      partner: { id: 'c1', name: 'Clínica Parceira', phone: '2', email: 'p@x.com' },
      tutor,
    })
    expect(r.map(x => x.kind)).toEqual(['referring_professional', 'partner', 'tutor'])
    expect(r[0].canDecide).toBe(true)
    expect(r[1].canDecide).toBe(true)
    expect(r[2].canDecide).toBe(false)
  })

  it('sem MV identificado, a clínica parceira decide', () => {
    const r = resolveRejectionRecipients({ partner: { id: 'c1', name: 'Protetor Amigos', phone: '2' }, tutor })
    expect(r.map(x => x.kind)).toEqual(['partner', 'tutor'])
    expect(r[0].canDecide).toBe(true)
    expect(r[1].canDecide).toBe(false)
  })

  it('sem encaminhamento, o tutor decide', () => {
    const r = resolveRejectionRecipients({ tutor })
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('tutor')
    expect(r[0].canDecide).toBe(true)
  })

  it('não inventa destinatário quando não há ninguém', () => {
    expect(resolveRejectionRecipients({})).toEqual([])
    expect(resolveRejectionRecipients({ partner: null, tutor: null })).toEqual([])
  })

  it('o tutor nunca recebe e-mail por este canal (só WhatsApp/portal)', () => {
    const r = resolveRejectionRecipients({ tutor })
    expect(r[0].email).toBeNull()
  })
})

describe('hasNoReachableRecipient', () => {
  it('detecta quando ninguém tem telefone nem e-mail', () => {
    const r = resolveRejectionRecipients({ partner: { id: 'c1', name: 'X' }, tutor: { id: 't', name: 'Y', phone: null } })
    expect(hasNoReachableRecipient(r)).toBe(true)
  })

  it('basta um canal para ser alcançável', () => {
    const r = resolveRejectionRecipients({ partner: { id: 'c1', name: 'X', email: 'a@b.com' } })
    expect(hasNoReachableRecipient(r)).toBe(false)
  })
})

// ─── Mensagem ────────────────────────────────────────────────────────────────

describe('buildRejectionMessage', () => {
  const base = { petName: 'Tutu', examName: 'Hemograma', reason: 'Amostra lipêmica', clinicName: 'Clínica Animais', canDecide: true }

  it('diz o motivo e deixa explícito que não será cobrado', () => {
    const m = buildRejectionMessage(base)
    expect(m).toContain('Tutu')
    expect(m).toContain('Hemograma')
    expect(m).toContain('Amostra lipêmica')
    expect(m).toMatch(/não será cobrado/i)
  })

  it('pergunta pela decisão e inclui o link só para quem decide', () => {
    const comLink = buildRejectionMessage({ ...base, link: 'https://x/parceiro' })
    expect(comLink).toMatch(/recoletar/i)
    expect(comLink).toContain('https://x/parceiro')

    const soAviso = buildRejectionMessage({ ...base, canDecide: false, link: 'https://x/parceiro' })
    expect(soAviso).not.toMatch(/prefere/i)
    expect(soAviso).not.toContain('https://x/parceiro')
  })

  it('inclui a observação quando houver e ignora observação vazia', () => {
    expect(buildRejectionMessage({ ...base, note: 'Jejum de 12h' })).toContain('Jejum de 12h')
    expect(buildRejectionMessage({ ...base, note: '   ' })).not.toMatch(/Observação/)
  })
})

// ─── Catálogo semente ────────────────────────────────────────────────────────

describe('DEFAULT_REJECTION_REASONS', () => {
  it('cobre os motivos comuns de rejeição de amostra', () => {
    const codes = DEFAULT_REJECTION_REASONS.map(r => r.code)
    for (const c of ['lipemica', 'hemolisada', 'coagulada', 'volume_insuficiente', 'sem_identificacao', 'tubo_incorreto', 'mal_conservada', 'extravio']) {
      expect(codes).toContain(c)
    }
  })

  it('não tem código duplicado e todo motivo tem rótulo', () => {
    const codes = DEFAULT_REJECTION_REASONS.map(r => r.code)
    expect(new Set(codes).size).toBe(codes.length)
    DEFAULT_REJECTION_REASONS.forEach(r => expect(r.label.trim().length).toBeGreaterThan(0))
  })
})
