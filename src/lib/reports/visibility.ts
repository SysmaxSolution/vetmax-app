// Visibilidade de relatório — lógica PURA (sem 'use server'/'use client').
//
// Tarefa 0: substituiu o ALWAYS_ON de ReportsWorkspace, que forçava 12
// relatórios ignorando o `reports_enabled` por clínica. Regra única agora:
//   (1) a clínica precisa ter o relatório ligado em reports_enabled; e
//   (2) relatório que pertence a uma ROTINA some junto com a rotina.

/** Rotinas que "possuem" um relatório. Chave = key do relatório. */
export const REPORT_ROUTINE: Record<string, 'boleto' | 'exam_rejection'> = {
  boleto_movement: 'boleto',
  exam_rejections: 'exam_rejection',
}

export interface ReportRoutineContext {
  /** flow_config.usa_boleto */
  usaBoleto: boolean
  /** flow_config.usa_fluxo_rejeicao_exame */
  usesExamRejection: boolean
}

export function isReportVisible(
  key: string,
  enabled: Record<string, boolean | undefined> | null | undefined,
  ctx: ReportRoutineContext,
): boolean {
  // Ausente = ligado (compatibilidade com reports_enabled antigos, que não
  // tinham as chaves novas). Só `false` explícito desliga.
  if (enabled?.[key] === false) return false
  const routine = REPORT_ROUTINE[key]
  if (routine === 'boleto') return ctx.usaBoleto
  if (routine === 'exam_rejection') return ctx.usesExamRejection
  return true
}
