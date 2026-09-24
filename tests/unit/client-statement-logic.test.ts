import {
  resolveSettledBy,
  settledByLabel,
  summarizeStatement,
  applyFilters,
  matchesFilters,
  periodDateOf,
  daysOverdue,
  isOverdue,
  NO_COMPANY_LABEL,
  SETTLED_BY_UNKNOWN_LABEL,
  type StatementRow,
  type SettledByResult,
} from '@/lib/reports/client-statement-logic'

const NAMES = {
  'u-bruna': 'Bruna Cruz',
  'u-aline': 'Aline',
  'u-ana':   'Ana Lucia Detore Develey',
}

const noActor: SettledByResult = {
  operator_id: null, operator_name: null, source: 'unknown', at: null,
}

function row(over: Partial<StatementRow> = {}): StatementRow {
  return {
    id:              over.id ?? 'e1',
    description:     'Hemograma completo',
    document_number: 'REC-2026-000001',
    due_date:        '2026-09-10',
    payment_date:    null,
    amount:          100,
    discount:        0,
    status:          'pending',
    payment_method:  null,
    company_id:      null,
    company_name:    null,
    patient_name:    'Mel',
    type:            'receivable',
    settled:         noActor,
    ...over,
  }
}

// ─── Pedido da Bruna (a): quem deu baixa ─────────────────────────────────────

describe('resolveSettledBy — rastreabilidade da baixa', () => {
  it('prefere settled_by (baixa gravada pela própria ação) sobre o caixa', () => {
    const r = resolveSettledBy({
      settled_by:          'u-bruna',
      settled_at:          '2026-09-18T14:03:00Z',
      cashier_recorded_by: 'u-aline',
      cashier_recorded_at: '2026-09-18T09:00:00Z',
      session_opened_by:   'u-ana',
      names:               NAMES,
    })
    expect(r).toEqual({
      operator_id:   'u-bruna',
      operator_name: 'Bruna Cruz',
      source:        'direct',
      at:            '2026-09-18T14:03:00Z',
    })
  })

  it('cai para central_cashier.recorded_by quando a baixa é anterior a 0480', () => {
    const r = resolveSettledBy({
      settled_by:          null,
      settled_at:          null,
      cashier_recorded_by: 'u-aline',
      cashier_recorded_at: '2026-09-18T09:00:00Z',
      session_opened_by:   'u-ana',
      names:               NAMES,
    })
    expect(r.source).toBe('cashier')
    expect(r.operator_name).toBe('Aline')
    expect(r.at).toBe('2026-09-18T09:00:00Z')
  })

  it('cai para o operador da sessão de caixa como último recurso', () => {
    const r = resolveSettledBy({
      settled_by: null, settled_at: null,
      cashier_recorded_by: null, cashier_recorded_at: '2026-09-18T09:00:00Z',
      session_opened_by: 'u-ana', names: NAMES,
    })
    expect(r.source).toBe('session')
    expect(r.operator_name).toBe('Ana Lucia Detore Develey')
  })

  it('devolve unknown — e NUNCA inventa ator — quando não há rastro', () => {
    const r = resolveSettledBy({
      settled_by: null, settled_at: null,
      cashier_recorded_by: null, cashier_recorded_at: null,
      session_opened_by: null, names: NAMES,
    })
    expect(r).toEqual(noActor)
    expect(settledByLabel(r)).toBe(SETTLED_BY_UNKNOWN_LABEL)
  })

  it('mantém o id quando o perfil foi removido, sem fingir que não houve ator', () => {
    const r = resolveSettledBy({
      settled_by: 'u-demitido', settled_at: null,
      cashier_recorded_by: null, cashier_recorded_at: null,
      session_opened_by: null, names: NAMES,
    })
    expect(r.operator_id).toBe('u-demitido')
    expect(r.operator_name).toBeNull()
    expect(settledByLabel(r)).toBe('Operador removido')
  })

  it('marca no rótulo quando o nome veio da sessão, não da baixa', () => {
    const r = resolveSettledBy({
      settled_by: null, settled_at: null,
      cashier_recorded_by: null, cashier_recorded_at: null,
      session_opened_by: 'u-aline', names: NAMES,
    })
    expect(settledByLabel(r)).toBe('Aline (operador da sessão)')
  })
})

// ─── Atraso ───────────────────────────────────────────────────────────────────

describe('daysOverdue / isOverdue', () => {
  it('conta os dias corridos desde o vencimento', () => {
    expect(daysOverdue('2026-09-10', '2026-09-24')).toBe(14)
  })
  it('não devolve atraso negativo para título a vencer', () => {
    expect(daysOverdue('2026-10-10', '2026-09-24')).toBe(0)
  })
  it('título pago nunca conta como vencido, mesmo com vencimento no passado', () => {
    const paid = row({ status: 'paid', due_date: '2026-01-01', payment_date: '2026-01-05' })
    expect(isOverdue(paid, '2026-09-24')).toBe(false)
  })
  it('tolera vencimento nulo', () => {
    expect(daysOverdue(null, '2026-09-24')).toBe(0)
  })
})

// ─── Pedido da Bruna (b): pago × a pagar num só lugar ────────────────────────

describe('summarizeStatement — pago × a pagar', () => {
  const rows = [
    row({ id: 'p1', status: 'paid',    amount: 200, discount: 20, payment_date: '2026-09-02' }),
    row({ id: 'p2', status: 'paid',    amount: 150, discount: 0,  payment_date: '2026-09-15' }),
    row({ id: 'a1', status: 'pending', amount: 300, discount: 0,  due_date: '2026-09-10' }),
    row({ id: 'a2', status: 'pending', amount: 100, discount: 0,  due_date: '2026-12-01' }),
  ]

  it('separa os dois lados e soma líquido (amount - discount)', () => {
    const s = summarizeStatement(rows, '2026-09-24')
    expect(s.totals.paid_count).toBe(2)
    expect(s.totals.paid_total).toBe(330)      // (200-20) + 150
    expect(s.totals.pending_count).toBe(2)
    expect(s.totals.pending_total).toBe(400)
    expect(s.totals.balance).toBe(400)
  })

  it('destaca apenas o que já venceu dentro do que está em aberto', () => {
    const s = summarizeStatement(rows, '2026-09-24')
    expect(s.totals.overdue_count).toBe(1)
    expect(s.totals.overdue_total).toBe(300)   // só o a1, vencido em 10/09
  })

  it('exclui movimento entre CNPJs do extrato do cliente', () => {
    const s = summarizeStatement(
      [...rows, row({ id: 'x', status: 'paid', amount: 9999, is_intercompany: true, payment_date: '2026-09-03' })],
      '2026-09-24',
    )
    expect(s.totals.paid_total).toBe(330)
    expect(s.paid.map(r => r.id)).not.toContain('x')
  })

  it('ordena os pagos por data de pagamento e os abertos por vencimento', () => {
    const s = summarizeStatement(rows, '2026-09-24')
    expect(s.paid.map(r => r.id)).toEqual(['p1', 'p2'])
    expect(s.pending.map(r => r.id)).toEqual(['a1', 'a2'])
  })

  it('não quebra com lista vazia', () => {
    const s = summarizeStatement([], '2026-09-24')
    expect(s.totals).toEqual({
      paid_count: 0, paid_total: 0, pending_count: 0, pending_total: 0,
      overdue_count: 0, overdue_total: 0, balance: 0,
    })
    expect(s.byCompany).toEqual([])
  })

  it('arredonda em centavos, sem erro de ponto flutuante', () => {
    const s = summarizeStatement([
      row({ id: 'c1', status: 'paid', amount: 0.1, payment_date: '2026-09-01' }),
      row({ id: 'c2', status: 'paid', amount: 0.2, payment_date: '2026-09-01' }),
    ], '2026-09-24')
    expect(s.totals.paid_total).toBe(0.3)
  })
})

// ─── Multi-CNPJ (Animais tem 3 empresas faturantes) ──────────────────────────

describe('summarizeStatement — quebra por empresa faturante', () => {
  const rows = [
    row({ id: '1', status: 'paid',    amount: 500, company_id: 'co-1', company_name: 'Animais Diagnóstico', payment_date: '2026-09-02' }),
    row({ id: '2', status: 'pending', amount: 200, company_id: 'co-1', company_name: 'Animais Diagnóstico' }),
    row({ id: '3', status: 'paid',    amount: 100, company_id: 'co-2', company_name: 'Animais Clínica',     payment_date: '2026-09-03' }),
    row({ id: '4', status: 'pending', amount:  50, company_id: null,   company_name: null }),
  ]

  it('soma pago e em aberto por empresa', () => {
    const { byCompany } = summarizeStatement(rows, '2026-09-24')
    const co1 = byCompany.find(c => c.company_id === 'co-1')
    expect(co1).toMatchObject({ company_name: 'Animais Diagnóstico', paid_total: 500, pending_total: 200 })
  })

  it('rotula explicitamente o título sem empresa em vez de somá-lo em outra', () => {
    const { byCompany } = summarizeStatement(rows, '2026-09-24')
    const none = byCompany.find(c => c.company_id === null)
    expect(none).toMatchObject({ company_name: NO_COMPANY_LABEL, pending_total: 50, paid_total: 0 })
  })

  it('a soma das empresas fecha com os totais gerais', () => {
    const s = summarizeStatement(rows, '2026-09-24')
    const paid    = s.byCompany.reduce((a, c) => a + c.paid_total, 0)
    const pending = s.byCompany.reduce((a, c) => a + c.pending_total, 0)
    expect(paid).toBe(s.totals.paid_total)
    expect(pending).toBe(s.totals.pending_total)
  })

  it('ordena por volume total decrescente', () => {
    const { byCompany } = summarizeStatement(rows, '2026-09-24')
    expect(byCompany.map(c => c.company_id)).toEqual(['co-1', 'co-2', null])
  })
})

// ─── Pedido da Ana Lucia: filtro data + cliente ──────────────────────────────

describe('filtros de período', () => {
  it('usa payment_date para pago e due_date para aberto', () => {
    expect(periodDateOf(row({ status: 'paid', payment_date: '2026-09-15', due_date: '2026-08-01' }))).toBe('2026-09-15')
    expect(periodDateOf(row({ status: 'pending', due_date: '2026-08-01' }))).toBe('2026-08-01')
  })

  it('pago sem payment_date cai no vencimento em vez de sumir do extrato', () => {
    expect(periodDateOf(row({ status: 'paid', payment_date: null, due_date: '2026-08-01' }))).toBe('2026-08-01')
  })

  it('inclui os extremos do período', () => {
    const f = { from: '2026-09-01', to: '2026-09-30' }
    expect(matchesFilters(row({ due_date: '2026-09-01' }), f)).toBe(true)
    expect(matchesFilters(row({ due_date: '2026-09-30' }), f)).toBe(true)
    expect(matchesFilters(row({ due_date: '2026-08-31' }), f)).toBe(false)
    expect(matchesFilters(row({ due_date: '2026-10-01' }), f)).toBe(false)
  })

  it('filtra por empresa faturante quando informada', () => {
    const f = { from: '2026-09-01', to: '2026-09-30', company_id: 'co-1' }
    expect(matchesFilters(row({ due_date: '2026-09-10', company_id: 'co-1' }), f)).toBe(true)
    expect(matchesFilters(row({ due_date: '2026-09-10', company_id: 'co-2' }), f)).toBe(false)
  })

  it('company_id nulo no filtro significa todas as empresas', () => {
    const f = { from: '2026-09-01', to: '2026-09-30', company_id: null }
    expect(matchesFilters(row({ due_date: '2026-09-10', company_id: 'co-2' }), f)).toBe(true)
  })

  it('descarta linha sem data de referência em vez de assumir hoje', () => {
    const f = { from: '2026-09-01', to: '2026-09-30' }
    expect(matchesFilters(row({ status: 'pending', due_date: null }), f)).toBe(false)
  })

  it('applyFilters devolve só o que passa', () => {
    const rows = [
      row({ id: 'in',  due_date: '2026-09-10' }),
      row({ id: 'out', due_date: '2026-07-10' }),
    ]
    expect(applyFilters(rows, { from: '2026-09-01', to: '2026-09-30' }).map(r => r.id)).toEqual(['in'])
  })
})
