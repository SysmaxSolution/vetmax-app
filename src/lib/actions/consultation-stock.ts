'use server'

// Gate da cobrança automática do insumo aplicado na consulta (Fase 1 · item 1.7).
//
// A BAIXA de estoque não tem flag: hoje ela simplesmente não acontece (a função
// antiga procurava o item numa tabela legada e vazia), então passar a funcionar é
// conserto, não mudança de comportamento. O que tem flag é a COBRANÇA automática,
// porque isso muda a conta do tutor — clínica que embute a medicação no preço da
// consulta cobraria duas vezes. Padrão desligado, como toda rotina nova.
//
// Quem LIGA a flag é o FlowFlagCard em Gestão › Configurações, que já concentra a
// gravação de `clinics.flow_config`. Aqui só se lê.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FlowConfig } from '@/types/clinic-settings'

/** TRUE quando a clínica lança o insumo aplicado na conta da OS automaticamente. */
export async function usaCobrancaDeInsumoAplicado(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return false

  const { data: clinic } = await admin
    .from('clinics')
    .select('flow_config')
    .eq('id', profile.clinic_id)
    .single()

  const flow = (clinic?.flow_config ?? {}) as FlowConfig
  return flow.cobra_insumo_aplicado === true
}
