// Grupo de clínicas ligadas por CNPJ das Empresas faturantes.
//
// Uma clínica cadastra em Configurações → Empresas os CNPJs do grupo. Quando um
// desses CNPJs é também o CNPJ de outra clínica do SYSVETMAX, as duas passam a
// formar um grupo — e o administrador de uma pode dar (ou tirar) acesso de
// usuários às outras, sem pedir ao suporte.
//
// A ligação vale nos dois sentidos e é transitiva: se Diagnóstico cadastrou o
// CNPJ da Pet e o do Francisco, as três se enxergam, mesmo que Pet não tenha
// cadastrado empresa nenhuma. Quem pode cadastrar empresa com CNPJ de OUTRA
// clínica é só o suporte SysMax (trava em upsertCompany) — senão qualquer
// admin daria a si mesmo acesso a tenant alheio.
//
// Módulo puro: sem I/O, testável. A busca no banco fica em
// src/lib/server/grupo-de-clinicas.ts.

import { apenasDigitos } from '@/lib/validation/documento'

export interface ClinicaDoGrupo {
  id:   string
  name: string
  cnpj: string | null
}

export interface EmpresaCnpj {
  clinic_id: string
  cnpj:      string | null
}

/** CNPJ em 14 dígitos, ou null quando não há como comparar. */
export function cnpjChave(v: string | null | undefined): string | null {
  const d = apenasDigitos(v ?? '')
  return d.length === 14 ? d : null
}

/**
 * Variantes como o CNPJ pode estar gravado (com máscara ou só dígitos), para
 * consultas `in (...)` sem depender de função no banco.
 */
export function variantesCnpj(v: string | null | undefined): string[] {
  const d = cnpjChave(v)
  if (!d) return []
  const mascara = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return [d, mascara]
}

/**
 * Fecha o grupo a partir de uma clínica: segue as arestas clínica→empresa→clínica
 * (pelo CNPJ) nos dois sentidos até não achar clínica nova. A clínica de origem
 * vem sempre em primeiro; as demais em ordem alfabética.
 */
export function montarGrupo(
  clinicaId: string,
  clinicas: ClinicaDoGrupo[],
  empresas: EmpresaCnpj[],
): ClinicaDoGrupo[] {
  const porId = new Map(clinicas.map(c => [c.id, c]))
  const porCnpj = new Map<string, ClinicaDoGrupo>()
  for (const c of clinicas) { const k = cnpjChave(c.cnpj); if (k && !porCnpj.has(k)) porCnpj.set(k, c) }

  const origem = porId.get(clinicaId)
  if (!origem) return []

  const visitadas = new Set<string>([clinicaId])
  const fila = [clinicaId]
  while (fila.length) {
    const atual = fila.shift()!
    const cnpjAtual = cnpjChave(porId.get(atual)?.cnpj)
    for (const e of empresas) {
      const k = cnpjChave(e.cnpj)
      if (!k) continue
      // ida: empresa desta clínica aponta para outra clínica
      if (e.clinic_id === atual) {
        const alvo = porCnpj.get(k)
        if (alvo && !visitadas.has(alvo.id)) { visitadas.add(alvo.id); fila.push(alvo.id) }
      }
      // volta: outra clínica cadastrou o CNPJ desta
      if (cnpjAtual && k === cnpjAtual && e.clinic_id !== atual && porId.has(e.clinic_id) && !visitadas.has(e.clinic_id)) {
        visitadas.add(e.clinic_id); fila.push(e.clinic_id)
      }
    }
  }

  const outras = [...visitadas].filter(id => id !== clinicaId).map(id => porId.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return [origem, ...outras]
}
