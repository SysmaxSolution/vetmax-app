/** Unit — publicação de exames de lab no portal por serviço (Fase 3). */
import {
  normalizeServiceName, isPanelPublished, filterPublishedExams,
} from '@/lib/portal/exam-publish'

describe('normalizeServiceName', () => {
  it('remove acento, caixa, colchetes e pontuação', () => {
    expect(normalizeServiceName('Hemograma [DEMO]')).toBe('hemograma')
    expect(normalizeServiceName('Perfil Bioquímico')).toBe('perfil bioquimico')
    expect(normalizeServiceName(null)).toBe('')
  })
})

describe('isPanelPublished', () => {
  const pub = ['hemograma completo', 'perfil bioquimico']
  it('casa painel curto com serviço longo', () => {
    expect(isPanelPublished('Hemograma', pub)).toBe(true)          // "hemograma completo".includes("hemograma")
    expect(isPanelPublished('Bioquímico [DEMO]', pub)).toBe(true)  // "perfil bioquimico".includes("bioquimico")
  })
  it('não casa painel alheio', () => {
    expect(isPanelPublished('Urinálise', pub)).toBe(false)
  })
  it('painel vazio sempre aparece', () => {
    expect(isPanelPublished(null, pub)).toBe(true)
    expect(isPanelPublished('', pub)).toBe(true)
  })
})

describe('filterPublishedExams', () => {
  const exams = [
    { panel: 'Hemograma [DEMO]', v: 1 },
    { panel: 'Bioquímico [DEMO]', v: 2 },
    { panel: 'Urinálise', v: 3 },
    { panel: null, v: 4 },
  ]
  it('sem serviço marcado → mostra tudo', () => {
    const services = [{ name: 'Hemograma Completo', publish_to_portal: false }]
    expect(filterPublishedExams(exams, services)).toHaveLength(4)
  })
  it('sem serviços → mostra tudo', () => {
    expect(filterPublishedExams(exams, [])).toHaveLength(4)
  })
  it('com serviços marcados → só os casados (+ painel vazio)', () => {
    const services = [
      { name: 'Hemograma Completo', publish_to_portal: true },
      { name: 'Perfil Bioquímico', publish_to_portal: true },
      { name: 'Urinálise', publish_to_portal: false },
    ]
    const out = filterPublishedExams(exams, services).map(e => e.v)
    expect(out).toEqual([1, 2, 4]) // hemograma, bioquímico, painel-nulo; urinálise fora
  })
})
