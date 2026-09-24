// Gate do Fluxo de Rejeição de Exame para uso DENTRO das actions que já têm o
// clinic_id em mãos (faturamento, exames, resultados). Módulo server-only sem
// 'use server'.
//
// Contrato: enquanto esta função devolver false, nenhum caminho de faturamento
// pode olhar para as colunas exam_* — é isso que mantém o comportamento das
// demais clínicas bit-a-bit igual ao de antes da sprint.

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export async function usesExamRejectionFlow(admin: Admin, clinicId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from('clinics').select('flow_config').eq('id', clinicId).maybeSingle()
    const flow = (data?.flow_config ?? {}) as { usa_fluxo_rejeicao_exame?: boolean }
    return flow.usa_fluxo_rejeicao_exame === true
  } catch {
    return false
  }
}
