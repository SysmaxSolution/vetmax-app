/**
 * Unit — Clientes (novos × recorrentes + ticket médio).
 */
import { ticketMedio, summarizeClients } from '@/lib/reports/clients-logic'

describe('ticketMedio', () => {
  it('faturamento / atendimentos', () => {
    expect(ticketMedio(300, 3)).toBe(100)
    expect(ticketMedio(100, 3)).toBe(33.33)
  })
  it('0 quando sem atendimentos', () => {
    expect(ticketMedio(500, 0)).toBe(0)
  })
})

describe('summarizeClients', () => {
  const rows = [
    { tutor_id: '1', name: 'A', appointments: 2, faturamento: 200, is_new: true },
    { tutor_id: '2', name: 'B', appointments: 1, faturamento: 100, is_new: false },
    { tutor_id: '3', name: 'C', appointments: 3, faturamento: 0,   is_new: true },
  ]
  const s = summarizeClients(rows)

  it('conta clientes, novos e recorrentes', () => {
    expect(s.total_clients).toBe(3)
    expect(s.new_clients).toBe(2)
    expect(s.recurring_clients).toBe(1)
  })
  it('soma atendimentos e faturamento', () => {
    expect(s.total_appointments).toBe(6)
    expect(s.faturamento).toBe(300)
  })
  it('ticket médio = faturamento / atendimentos', () => {
    expect(s.ticket_medio).toBe(50)   // 300 / 6
  })
  it('lista vazia → tudo zero', () => {
    const e = summarizeClients([])
    expect(e.total_clients).toBe(0)
    expect(e.ticket_medio).toBe(0)
    expect(e.new_clients).toBe(0)
  })
})
