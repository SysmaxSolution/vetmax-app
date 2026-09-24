/**
 * Unit — Máquina de estados e visibilidade do estudo de imagem (Fase 3).
 * Regra central: o VET SOLICITANTE vê as imagens ANTES do laudo.
 */
import {
  nextStatusOnImageUpload,
  nextStatusOnLaudoRelease,
  shouldSendImagesEmail,
  shouldSendLaudoEmail,
  imagesVisibleToReferringVet,
  laudoVisible,
  visibleToTutor,
  studyVisibility,
  type StudyLike,
} from '@/lib/imaging/study-status'

const base: StudyLike = {
  status: 'awaiting_images',
  images_uploaded_at: null,
  images_email_sent_at: null,
  referring_vet_email: 'dr@vet.com',
  laudo_document_id: null,
  laudo_released_at: null,
  laudo_email_sent_at: null,
  released_to_tutor_at: null,
}

describe('transições de status', () => {
  it('1º upload: awaiting_images → images_ready', () => {
    expect(nextStatusOnImageUpload('awaiting_images')).toBe('images_ready')
  })
  it('upload em estudo já reported não regride', () => {
    expect(nextStatusOnImageUpload('reported')).toBe('reported')
  })
  it('upload em cancelado permanece cancelado', () => {
    expect(nextStatusOnImageUpload('cancelled')).toBe('cancelled')
  })
  it('liberar laudo → reported', () => {
    expect(nextStatusOnLaudoRelease('images_ready')).toBe('reported')
  })
  it('cancelado não vira reported', () => {
    expect(nextStatusOnLaudoRelease('cancelled')).toBe('cancelled')
  })
})

describe('disparo de e-mail ao vet', () => {
  it('imagens: envia na 1ª vez com imagem+email', () => {
    const s = { ...base, status: 'images_ready' as const, images_uploaded_at: 'now' }
    expect(shouldSendImagesEmail(s)).toBe(true)
  })
  it('imagens: não reenvia se já enviado', () => {
    const s = { ...base, images_uploaded_at: 'now', images_email_sent_at: 'now' }
    expect(shouldSendImagesEmail(s)).toBe(false)
  })
  it('imagens: não envia sem e-mail do vet', () => {
    const s = { ...base, images_uploaded_at: 'now', referring_vet_email: null }
    expect(shouldSendImagesEmail(s)).toBe(false)
  })
  it('imagens: não envia com e-mail inválido (sem @)', () => {
    const s = { ...base, images_uploaded_at: 'now', referring_vet_email: 'invalido' }
    expect(shouldSendImagesEmail(s)).toBe(false)
  })
  it('laudo: envia quando liberado e ainda não enviado', () => {
    const s = { ...base, laudo_released_at: 'now' }
    expect(shouldSendLaudoEmail(s)).toBe(true)
  })
  it('laudo: não reenvia', () => {
    const s = { ...base, laudo_released_at: 'now', laudo_email_sent_at: 'now' }
    expect(shouldSendLaudoEmail(s)).toBe(false)
  })
  it('nada é enviado em estudo cancelado', () => {
    const s = { ...base, status: 'cancelled' as const, images_uploaded_at: 'now', laudo_released_at: 'now' }
    expect(shouldSendImagesEmail(s)).toBe(false)
    expect(shouldSendLaudoEmail(s)).toBe(false)
  })
})

describe('visibilidade', () => {
  it('vet vê imagens em images_ready (pré-laudo)', () => {
    const s = { ...base, status: 'images_ready' as const, images_uploaded_at: 'now' }
    expect(imagesVisibleToReferringVet(s)).toBe(true)
    expect(laudoVisible(s)).toBe(false)
    expect(studyVisibility(s, 'referring_vet')).toEqual({ canSeeImages: true, canSeeLaudo: false })
  })
  it('vet vê imagens+laudo em reported', () => {
    const s = { ...base, status: 'reported' as const, images_uploaded_at: 'now', laudo_document_id: 'd', laudo_released_at: 'now' }
    expect(studyVisibility(s, 'referring_vet')).toEqual({ canSeeImages: true, canSeeLaudo: true })
  })
  it('tutor não vê nada antes da liberação ao tutor', () => {
    const s = { ...base, status: 'reported' as const, images_uploaded_at: 'now', laudo_document_id: 'd', laudo_released_at: 'now' }
    expect(visibleToTutor(s)).toBe(false)
    expect(studyVisibility(s, 'tutor')).toEqual({ canSeeImages: false, canSeeLaudo: false })
  })
  it('tutor vê após released_to_tutor_at', () => {
    const s = { ...base, status: 'reported' as const, images_uploaded_at: 'now', laudo_document_id: 'd', laudo_released_at: 'now', released_to_tutor_at: 'now' }
    expect(studyVisibility(s, 'tutor')).toEqual({ canSeeImages: true, canSeeLaudo: true })
  })
  it('awaiting_images: vet ainda não vê imagens', () => {
    expect(imagesVisibleToReferringVet(base)).toBe(false)
  })
})
