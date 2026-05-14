export function generateBatchScheduleDates(
  startDate: Date,
  intervalDays: number,
  count: number
): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i * intervalDays)
    return d
  })
}
