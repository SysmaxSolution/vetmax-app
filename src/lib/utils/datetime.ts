/**
 * Combina uma data ('YYYY-MM-DD') e um horário ('HH:MM' ou 'HH:MM:SS') no
 * fuso horário LOCAL do navegador e retorna a representação ISO em UTC.
 *
 * Por que existe: a coluna `appointment_datetime` (e outras TIMESTAMPTZ) é
 * interpretada pelo Postgres no fuso da sessão (UTC em produção). Se enviarmos
 * uma string "naive" como '2026-05-22T14:00:00', o banco grava 14h UTC e ao
 * exibir no navegador em Brasília (UTC-3) o horário aparece como 11h.
 *
 * Esta função garante que o horário escolhido pelo usuário (em sua hora local)
 * seja persistido de forma consistente: convertemos para UTC antes do envio,
 * e ao ler de volta `new Date(iso)` o navegador renderiza no mesmo fuso local.
 */
export function localDateTimeToISO(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss = 0] = time.split(':').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, ss).toISOString()
}

/**
 * Aceita uma string 'YYYY-MM-DDTHH:MM' (formato de <input type="datetime-local">)
 * e devolve a representação ISO em UTC respeitando o fuso local do navegador.
 */
export function localDateTimeInputToISO(value: string): string {
  if (!value) return ''
  const [date, time = '00:00'] = value.split('T')
  return localDateTimeToISO(date, time)
}
