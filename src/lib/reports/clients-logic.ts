// Núcleo puro do relatório de Clientes: novos × recorrentes + ticket médio.
// "Novo" = primeiro atendimento de sempre dentro do período. SEM I/O.

export interface ClientRow {
  tutor_id:     string
  name:         string
  appointments: number
  faturamento:  number
  is_new:       boolean
}

export interface ClientsSummary {
  total_clients:     number
  new_clients:       number
  recurring_clients: number
  total_appointments: number
  faturamento:       number
  ticket_medio:      number   // faturamento / atendimentos
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function ticketMedio(faturamento: number, appointments: number): number {
  if (!appointments) return 0
  return r2(faturamento / appointments)
}

export function summarizeClients(rows: ClientRow[]): ClientsSummary {
  let appts = 0, fat = 0, novos = 0
  for (const r of rows) {
    appts += r.appointments
    fat += r.faturamento
    if (r.is_new) novos++
  }
  fat = r2(fat)
  return {
    total_clients: rows.length,
    new_clients: novos,
    recurring_clients: rows.length - novos,
    total_appointments: appts,
    faturamento: fat,
    ticket_medio: ticketMedio(fat, appts),
  }
}
