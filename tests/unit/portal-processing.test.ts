/** Unit — rótulos "em processamento" do portal (nunca expõem valores). */
import { examStatusLabel, imagingStatusLabel } from '@/lib/portal/processing'

describe('examStatusLabel', () => {
  it('coletado', () => expect(examStatusLabel('collected')).toMatch(/coletada/i))
  it('em análise', () => expect(examStatusLabel('in_progress')).toMatch(/análise/i))
  it('default', () => expect(examStatusLabel('pending')).toMatch(/aguardando/i))
})

describe('imagingStatusLabel', () => {
  it('com laudo → revisão final', () => expect(imagingStatusLabel('reported', true)).toMatch(/revisão/i))
  it('imagens prontas', () => expect(imagingStatusLabel('images_ready', false)).toMatch(/elaboração/i))
  it('agendado', () => expect(imagingStatusLabel('scheduled', false)).toMatch(/agendado/i))
  it('default', () => expect(imagingStatusLabel(null, false)).toMatch(/aguardando/i))
})
