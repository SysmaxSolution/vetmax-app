// Rótulos amigáveis do status "em processamento" mostrado ao tutor.
// Nunca expõe valores/resultado — só o estágio do fluxo. Puro (testável).

/** Estágios de exam_requests que ainda estão em andamento (não liberados/cancelados). */
export const EXAM_PROCESSING_STATUSES = ['pending', 'in_progress', 'collected', 'processing'] as const

/** Estágios de imaging_studies que ainda não foram liberados ao tutor. */
export const IMAGING_PROCESSING_STATUSES = ['ordered', 'scheduled', 'acquired', 'images_ready', 'reported'] as const

/** Rótulo de exame laboratorial pendente. */
export function examStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'collected': return 'Amostra coletada — em análise'
    case 'in_progress':
    case 'processing': return 'Em análise no laboratório'
    default: return 'Aguardando coleta/análise'
  }
}

/** Rótulo de exame de imagem ainda não liberado ao tutor. */
export function imagingStatusLabel(status: string | null | undefined, hasLaudo: boolean): string {
  const s = (status ?? '').toLowerCase()
  if (hasLaudo || s === 'reported') return 'Laudo em revisão final'
  if (s === 'images_ready' || s === 'acquired') return 'Imagens prontas — laudo em elaboração'
  if (s === 'scheduled') return 'Exame agendado'
  return 'Aguardando realização'
}
