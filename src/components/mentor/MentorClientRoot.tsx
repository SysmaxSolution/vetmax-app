'use client'

import { MentorProvider } from './MentorContext'
import { MentorTour } from './MentorTour'
import { MentorChat } from './MentorChat'

/**
 * Client root for the VetMax Mentor module.
 * Rendered by MentorGlobalWrapper (Server Component) only when
 * the 'mentor' module is active for the clinic.
 */
export function MentorClientRoot() {
  return (
    <MentorProvider>
      <MentorTour />
      <MentorChat />
    </MentorProvider>
  )
}
