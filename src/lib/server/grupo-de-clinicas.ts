// Busca no banco o grupo de clínicas de uma clínica (ver src/lib/clinics/grupo-empresas.ts).
//
// As consultas atravessam tenants de propósito: o grupo existe justamente para
// ligar clínicas diferentes pelo CNPJ. Por isso roda com o admin client e só é
// chamado por actions que já conferiram que quem pede é admin da clínica de
// origem. Cada salto consulta por lista explícita de ids/CNPJs — nunca lê a
// tabela inteira.

import type { SupabaseClient } from '@supabase/supabase-js'
import { montarGrupo, variantesCnpj, type ClinicaDoGrupo, type EmpresaCnpj } from '@/lib/clinics/grupo-empresas'

const MAX_SALTOS = 4

export async function clinicasDoGrupo(admin: SupabaseClient, clinicaId: string): Promise<ClinicaDoGrupo[]> {
  const clinicas = new Map<string, ClinicaDoGrupo>()
  const empresas: EmpresaCnpj[] = []
  const empresasDe = new Set<string>()      // clínicas cujas empresas já foram lidas

  const { data: origem } = await admin.from('clinics').select('id, name, cnpj, status, flow_config').eq('id', clinicaId).maybeSingle()
  if (!origem || origem.status !== 'active') return []
  clinicas.set(origem.id, { id: origem.id, name: origem.name, cnpj: origem.cnpj })

  // Modo "conjunto" (matriz e filiais dentro de UMA clínica): as empresas são
  // CNPJs internos, não ligações com outras clínicas — o grupo é só ela.
  const modo = ((origem.flow_config ?? {}) as { empresas_modo?: string }).empresas_modo
  if (modo === 'conjunto') return montarGrupo(clinicaId, [...clinicas.values()], [])

  for (let salto = 0; salto < MAX_SALTOS; salto++) {
    const pendentes = [...clinicas.keys()].filter(id => !empresasDe.has(id))
    if (!pendentes.length) break
    pendentes.forEach(id => empresasDe.add(id))

    // ida: empresas cadastradas nestas clínicas
    const { data: emp } = await admin.from('companies').select('clinic_id, cnpj')
      .in('clinic_id', pendentes).eq('is_active', true).not('cnpj', 'is', null)
    for (const e of emp ?? []) empresas.push({ clinic_id: e.clinic_id, cnpj: e.cnpj })

    // volta: empresas de outras clínicas que apontam para o CNPJ destas
    const cnpjsDestas = pendentes.flatMap(id => variantesCnpj(clinicas.get(id)?.cnpj))
    if (cnpjsDestas.length) {
      const { data: reverso } = await admin.from('companies').select('clinic_id, cnpj')
        .in('cnpj', cnpjsDestas).eq('is_active', true)
      for (const e of reverso ?? []) empresas.push({ clinic_id: e.clinic_id, cnpj: e.cnpj })
    }

    // clínicas alcançadas por qualquer das arestas acima, ainda não carregadas
    const cnpjsAlvo = [...new Set(empresas.flatMap(e => variantesCnpj(e.cnpj)))]
    const idsAlvo = [...new Set(empresas.map(e => e.clinic_id))].filter(id => !clinicas.has(id))
    const faltam: ClinicaDoGrupo[] = []
    if (cnpjsAlvo.length) {
      const { data } = await admin.from('clinics').select('id, name, cnpj, status').in('cnpj', cnpjsAlvo).eq('status', 'active')
      faltam.push(...(data ?? []))
    }
    if (idsAlvo.length) {
      const { data } = await admin.from('clinics').select('id, name, cnpj, status').in('id', idsAlvo).eq('status', 'active')
      faltam.push(...(data ?? []))
    }
    let novas = 0
    for (const c of faltam) if (!clinicas.has(c.id)) { clinicas.set(c.id, { id: c.id, name: c.name, cnpj: c.cnpj }); novas++ }
    if (!novas) break
  }

  return montarGrupo(clinicaId, [...clinicas.values()], empresas)
}
