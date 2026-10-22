// Máquina de estados pura do estudo de imagem + regras de visibilidade e de
// disparo de e-mail ao VET SOLICITANTE / tutor. Sem I/O. Testável isoladamente.
//
// Fluxo pedido pelo cliente:
//   awaiting_images --(1º upload)--> images_ready  → e-mail com link ao vet (PRÉ-LAUDO)
//   images_ready    --(laudo liberado)--> reported → e-mail do laudo ao vet
// O tutor só enxerga quando released_to_tutor_at é preenchido (gate separado).

export type StudyStatus = 'awaiting_images' | 'images_ready' | 'reported' | 'cancelled'

export const STUDY_STATUS_LABELS: Record<StudyStatus, string> = {
  awaiting_images: 'Aguardando imagens',
  images_ready:    'Imagens disponíveis',
  reported:        'Laudo liberado',
  cancelled:       'Cancelado',
}

export interface StudyLike {
  status:               StudyStatus
  images_uploaded_at:   string | null
  images_email_sent_at: string | null
  referring_vet_email:  string | null
  laudo_document_id:    string | null
  laudo_released_at:    string | null
  laudo_email_sent_at:  string | null
  released_to_tutor_at: string | null
}

/** Novo status após um upload de imagem. Só avança a partir de awaiting_images;
 *  nunca regride um estudo já com laudo (reported) nem um cancelado. */
export function nextStatusOnImageUpload(current: StudyStatus): StudyStatus {
  if (current === 'awaiting_images') return 'images_ready'
  return current
}

/** Novo status ao liberar o laudo. */
export function nextStatusOnLaudoRelease(current: StudyStatus): StudyStatus {
  if (current === 'cancelled') return current
  return 'reported'
}

const hasEmail = (s: StudyLike) => !!(s.referring_vet_email && s.referring_vet_email.includes('@'))

/** Deve disparar o e-mail de "imagens disponíveis" ao vet? (1ª vez, tem imagem e e-mail) */
export function shouldSendImagesEmail(s: StudyLike): boolean {
  return !!s.images_uploaded_at && !s.images_email_sent_at && hasEmail(s) && s.status !== 'cancelled'
}

/** Deve disparar o e-mail do laudo ao vet? (laudo liberado, ainda não enviado, tem e-mail) */
export function shouldSendLaudoEmail(s: StudyLike): boolean {
  return !!s.laudo_released_at && !s.laudo_email_sent_at && hasEmail(s) && s.status !== 'cancelled'
}

/** O vet solicitante vê as imagens assim que ficam prontas — inclusive antes do laudo. */
export function imagesVisibleToReferringVet(s: StudyLike): boolean {
  return (s.status === 'images_ready' || s.status === 'reported') && !!s.images_uploaded_at
}

/** O laudo só aparece quando liberado. */
export function laudoVisible(s: StudyLike): boolean {
  return !!s.laudo_released_at && !!s.laudo_document_id
}

/** O tutor só enxerga qualquer coisa após a liberação explícita ao tutor. */
export function visibleToTutor(s: StudyLike): boolean {
  return !!s.released_to_tutor_at && s.status !== 'cancelled'
}

/** O que um público (vet ou tutor) pode ver neste estudo, dado o link. */
export function studyVisibility(
  s: StudyLike,
  audience: 'referring_vet' | 'tutor',
): { canSeeImages: boolean; canSeeLaudo: boolean } {
  if (audience === 'tutor') {
    const ok = visibleToTutor(s)
    return { canSeeImages: ok && !!s.images_uploaded_at, canSeeLaudo: ok && laudoVisible(s) }
  }
  // referring_vet
  return { canSeeImages: imagesVisibleToReferringVet(s), canSeeLaudo: laudoVisible(s) }
}
