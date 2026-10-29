'use server'

// Fechamento do convênio por período (Fase 1 · item 1.9).
//
// É o lado NOSSO da conferência: quanto o convênio deve, apurado do que foi
// efetivamente lançado nas OS do período. O lado DELES já existe —
// `convenio-import.ts` importa o demonstrativo com de-para de colunas e o
// `runMatchEngine` casa linha por linha. O que faltava era este espelho, que é
// exatamente o que a Bruna monta à mão, OS por OS, todos os dias.
//
// Os valores saem dos SNAPSHOTS de `consultation_services` (migration 0215), não
// de preço recalculado: o que foi acordado no atendimento é o que se cobra,
// mesmo que a tabela mude depois. O convênio também é snapshot (migration 0506),
// então trocar o convênio do pet não reescreve um período já fechado.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemErro } from '@/lib/errors'
import { janelaDoCiclo, janelaAnterior, ultimasJanelas } from '@/lib/insurance/ciclo'
import { descreverRegraCopay } from '@/lib/insurance/copay'
import type { CicloRepasse, JanelaFechamento } from '@/lib/insurance/ciclo'
import type { ModoCopay } from '@/lib/insurance/copay'
import type { FechamentoConvenio, LinhaFechamento } from '@/types/insurance-closing'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' as const }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' as const }
  return { admin, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? 'staff' }
}

const duasCasas = (v: number) => Math.round(v * 100) / 100

/** Hoje em 'YYYY-MM-DD' no fuso de São Paulo — o dia de quem opera a clínica. */
function hojeLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Janelas sugeridas para o seletor da tela, derivadas do ciclo configurado no
 * convênio. Evita que alguém digite data e feche o período errado.
 */
export async function listarJanelasDoConvenio(
  providerId: string,
  quantidade = 6,
): Promise<{ ciclo: CicloRepasse; janelas: JanelaFechamento[] } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { data: prov, error } = await ctx.admin
    .from('insurance_providers')
    .select('repass_cycle, repass_cycle_day')
    .eq('id', providerId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  if (error) return { error: 'Erro ao ler o convênio: ' + mensagemErro(error, 'lib/actions/insurance-closing.ts') }
  if (!prov) return { error: 'Convênio não encontrado nesta clínica.' }

  const ciclo = ((prov.repass_cycle as string) ?? 'monthly') as CicloRepasse
  const dia = prov.repass_cycle_day === null ? null : Number(prov.repass_cycle_day)
  return { ciclo, janelas: ultimasJanelas(ciclo, dia, hojeLocal(), quantidade) }
}

/**
 * Apura o fechamento de um convênio num período.
 *
 * Sem `inicio`/`fim`, usa a janela ANTERIOR do ciclo — o período já encerrado,
 * que é o que se fecha na prática.
 */
export async function getFechamentoConvenio(input: {
  providerId: string
  inicio?: string
  fim?: string
}): Promise<FechamentoConvenio | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'accountant', 'vet'].includes(ctx.role)) {
    return { error: 'Acesso negado ao fechamento de convênio.' }
  }
  const { admin, clinicId } = ctx

  const { data: prov, error: erroProv } = await admin
    .from('insurance_providers')
    .select('id, name, receipt_mode, repass_cycle, repass_cycle_day, copay_mode, copay_percent, copay_fixed')
    .eq('id', input.providerId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (erroProv) return { error: 'Erro ao ler o convênio: ' + mensagemErro(erroProv, 'lib/actions/insurance-closing.ts') }
  if (!prov) return { error: 'Convênio não encontrado nesta clínica.' }

  const ciclo = ((prov.repass_cycle as string) ?? 'monthly') as CicloRepasse
  const diaRef = prov.repass_cycle_day === null ? null : Number(prov.repass_cycle_day)

  const periodo = (input.inicio && input.fim)
    ? { inicio: input.inicio, fim: input.fim, rotulo: janelaDoCiclo(ciclo, diaRef, input.inicio).rotulo }
    : janelaAnterior(ciclo, diaRef, hojeLocal())

  // ─── itens conveniados do período ─────────────────────────────────────────
  //
  // Filtro por convênio: a linha nova traz o snapshot `insurance_provider_id`;
  // linhas anteriores à 0506 não têm, então entram pelo vínculo atual do pet.
  // Sem esse segundo caminho, o primeiro fechamento apareceria vazio e alguém
  // concluiria que o período não teve atendimento.
  const { data: petsDoConvenio } = await admin
    .from('pet_insurance')
    .select('patient_id')
    .eq('clinic_id', clinicId)
    .eq('provider_id', input.providerId)
    .eq('coverage_status', 'active')
  const idsPets = [...new Set((petsDoConvenio ?? []).map(p => p.patient_id as string))]

  const { data: linhasRaw, error: erroLinhas } = await admin
    .from('consultation_services')
    .select(`
      id, consultation_id, quantity, price_snapshot,
      insurance_total_snapshot, copay_snapshot, repass_snapshot,
      insurance_provider_id, cancelled_at,
      consultation:consultations!inner(
        id, os_number, created_at, clinic_id, patient_id,
        patient:patients(name, tutor:tutors(name))
      )
    `)
    .eq('clinic_id', clinicId)
    .is('cancelled_at', null)
    .gte('consultation.created_at', periodo.inicio)
    .lte('consultation.created_at', periodo.fim + 'T23:59:59')
  if (erroLinhas) return { error: 'Erro ao apurar o período: ' + mensagemErro(erroLinhas, 'lib/actions/insurance-closing.ts') }

  type Bruta = {
    consultation_id: string
    quantity: number
    insurance_total_snapshot: number | null
    copay_snapshot: number | null
    repass_snapshot: number | null
    insurance_provider_id: string | null
    consultation: unknown
  }

  const doConvenio = ((linhasRaw ?? []) as unknown as Bruta[]).filter(l => {
    if (l.insurance_provider_id) return l.insurance_provider_id === input.providerId
    // Sem snapshot: cai no vínculo atual do pet, e só quando a linha tem valor
    // de convênio — linha particular não entra em fechamento de convênio.
    const c = l.consultation as { patient_id?: string } | null
    const temValorConvenio = l.insurance_total_snapshot !== null || l.repass_snapshot !== null
    return temValorConvenio && Boolean(c?.patient_id) && idsPets.includes(c!.patient_id!)
  })

  // ─── agrupa por OS ────────────────────────────────────────────────────────
  const porOs = new Map<string, LinhaFechamento>()
  for (const l of doConvenio) {
    const c = l.consultation as {
      id: string; os_number?: string | number | null; created_at: string
      patient?: { name?: string; tutor?: { name?: string } | { name?: string }[] } | { name?: string }[] | null
    }
    const pet = Array.isArray(c.patient) ? c.patient[0] : c.patient
    const tutorRaw = (pet as { tutor?: unknown } | null)?.tutor
    const tutor = Array.isArray(tutorRaw) ? tutorRaw[0] : tutorRaw

    const chave = l.consultation_id
    const atual = porOs.get(chave) ?? {
      consultation_id: chave,
      os_number:       c.os_number === null || c.os_number === undefined ? null : String(c.os_number),
      data:            String(c.created_at).slice(0, 10),
      pet_nome:        (pet as { name?: string } | null)?.name ?? null,
      tutor_nome:      (tutor as { name?: string } | null)?.name ?? null,
      itens:           0,
      total:           0,
      copay:           0,
      repass:          0,
      split_pendente:  false,
    }

    const total = Number(l.insurance_total_snapshot ?? 0)
    const copay = l.copay_snapshot === null ? null : Number(l.copay_snapshot)
    const repass = l.repass_snapshot === null ? null : Number(l.repass_snapshot)

    atual.itens += 1
    atual.total = duasCasas(atual.total + total)
    atual.copay = duasCasas(atual.copay + (copay ?? 0))
    atual.repass = duasCasas(atual.repass + (repass ?? 0))
    // Split pendente: ninguém definiu quanto é do tutor e quanto é do convênio.
    // Fica visível em vez de virar zero silencioso na coluna do repasse.
    if (repass === null) atual.split_pendente = true

    porOs.set(chave, atual)
  }

  const linhas = [...porOs.values()].sort((a, b) =>
    a.data.localeCompare(b.data) || (a.os_number ?? '').localeCompare(b.os_number ?? ''))

  const totais = linhas.reduce((acc, l) => ({
    os:            acc.os + 1,
    itens:         acc.itens + l.itens,
    total:         duasCasas(acc.total + l.total),
    copay:         duasCasas(acc.copay + l.copay),
    repass:        duasCasas(acc.repass + l.repass),
    com_pendencia: acc.com_pendencia + (l.split_pendente ? 1 : 0),
  }), { os: 0, itens: 0, total: 0, copay: 0, repass: 0, com_pendencia: 0 })

  // ─── demonstrativos já importados que cruzam o período ───────────────────
  const { data: remessasRaw } = await admin
    .from('petlove_remittances')
    .select('id, remittance_number, period_start, period_end, status, total_gross_value')
    .eq('clinic_id', clinicId)
    .eq('provider_id', input.providerId)
    .lte('period_start', periodo.fim)
    .gte('period_end', periodo.inicio)
    .order('period_start', { ascending: true })

  const remessas = (remessasRaw ?? []).map(r => ({
    id:              r.id as string,
    numero:          (r.remittance_number as string) ?? '',
    period_start:    r.period_start as string,
    period_end:      r.period_end as string,
    status:          r.status as string,
    total_informado: Number(r.total_gross_value ?? 0),
  }))

  // Divergência só faz sentido quando o convênio já mandou algo. Sem remessa
  // importada fica null — "zero" diria que bate, e não é verdade.
  const divergencia = remessas.length > 0
    ? duasCasas(totais.repass - remessas.reduce((s, r) => s + r.total_informado, 0))
    : null

  return {
    provider_id:   prov.id as string,
    provider_name: prov.name as string,
    receipt_mode:  (prov.receipt_mode as string) ?? 'convenio_repasse',
    ciclo,
    copay_mode:    ((prov.copay_mode as string) ?? 'per_item') as ModoCopay,
    regra: descreverRegraCopay({
      modo:    ((prov.copay_mode as string) ?? 'per_item') as ModoCopay,
      percent: prov.copay_percent === null ? null : Number(prov.copay_percent),
      fixed:   prov.copay_fixed === null ? null : Number(prov.copay_fixed),
    }),
    periodo,
    linhas,
    totais,
    remessas,
    divergencia,
  }
}
