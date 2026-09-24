/**
 * Unit — Gate da ROTINA do Portal do Tutor (achado F-1 do QA pré-produção).
 *
 * Antes deste gate, uma clínica SEM `flow_config.portal_enabled` continuava
 * entregando /portal para um tutor com sessão válida: a rota respondia HTTP 200
 * e o pet aparecia. O isolamento por (tutor_id, clinic_id) estava correto — o
 * que faltava era a rotina estar LIGADA na clínica do vínculo.
 *
 * A regra crítica: um tutor pode ter vínculo com MAIS DE UMA clínica. Desligar
 * o Portal na clínica A não pode derrubar o acesso aos pets da clínica B.
 */
import {
  filterLinksByEnabledClinics, blockedClinicIds,
  allowedTutorIds, allowedClinicIds, canAccessPatient, type LinkRow,
} from '@/lib/portal/access'

// A mesma pessoa é tutora em 3 clínicas.
const C1 = 'clinic-1', C2 = 'clinic-2', C3 = 'clinic-3'
const links: LinkRow[] = [
  { tutor_id: 'tutor-A', clinic_id: C1 },
  { tutor_id: 'tutor-B', clinic_id: C2 },
  { tutor_id: 'tutor-C', clinic_id: C3 },
]

describe('filterLinksByEnabledClinics', () => {
  it('nenhuma clínica com a flag → nenhum vínculo sobrevive (padrão DESLIGADO)', () => {
    expect(filterLinksByEnabledClinics(links, [])).toEqual([])
  })

  it('negação é POR CLÍNICA: só a que tem a flag ligada passa', () => {
    const out = filterLinksByEnabledClinics(links, [C2])
    expect(out).toEqual([{ tutor_id: 'tutor-B', clinic_id: C2 }])
  })

  it('duas ligadas, uma desligada — as duas continuam funcionando', () => {
    const out = filterLinksByEnabledClinics(links, [C1, C3])
    expect(allowedClinicIds(out).sort()).toEqual([C1, C3])
    expect(allowedTutorIds(out).sort()).toEqual(['tutor-A', 'tutor-C'])
  })

  it('não inventa vínculo: clínica ligada sem vínculo não entra', () => {
    expect(filterLinksByEnabledClinics(links, [C1, 'clinic-estranha'])).toHaveLength(1)
  })

  it('sem vínculo nenhum, continua vazio', () => {
    expect(filterLinksByEnabledClinics([], [C1, C2, C3])).toEqual([])
  })
})

describe('o pet da clínica com o Portal desligado deixa de ser acessível', () => {
  const visible = filterLinksByEnabledClinics(links, [C1])

  it('ANTES do gate (links crus) o pet da clínica desligada era acessível', () => {
    expect(canAccessPatient('tutor-B', C2, links)).toBe(true)
  })

  it('DEPOIS do gate, o mesmo pet é negado', () => {
    expect(canAccessPatient('tutor-B', C2, visible)).toBe(false)
  })

  it('e o pet da clínica que ligou a rotina continua acessível', () => {
    expect(canAccessPatient('tutor-A', C1, visible)).toBe(true)
  })

  it('não vaza cruzando tutor com clínica ligada', () => {
    expect(canAccessPatient('tutor-B', C1, visible)).toBe(false)
    expect(canAccessPatient('tutor-A', C2, visible)).toBe(false)
  })
})

describe('blockedClinicIds — para a mensagem ao tutor', () => {
  it('lista as clínicas vinculadas com a rotina desligada, sem repetir', () => {
    const dup: LinkRow[] = [...links, { tutor_id: 'tutor-D', clinic_id: C2 }]
    expect(blockedClinicIds(dup, [C1]).sort()).toEqual([C2, C3])
  })

  it('tudo ligado → nada bloqueado', () => {
    expect(blockedClinicIds(links, [C1, C2, C3])).toEqual([])
  })
})

describe('portalDisabled — a condição da tela de indisponível', () => {
  // Réplica da regra de getTutorContext: `rawLinks.length > 0 && visible.length === 0`.
  const portalDisabled = (raw: LinkRow[], enabled: string[]) =>
    raw.length > 0 && filterLinksByEnabledClinics(raw, enabled).length === 0

  it('tem vínculo mas nenhuma clínica ligada → mostra a mensagem', () => {
    expect(portalDisabled(links, [])).toBe(true)
  })

  it('tem pelo menos uma ligada → portal normal', () => {
    expect(portalDisabled(links, [C3])).toBe(false)
  })

  it('sem vínculo nenhum NÃO é "rotina desligada" (é cadastro sem vínculo)', () => {
    expect(portalDisabled([], [])).toBe(false)
  })
})
