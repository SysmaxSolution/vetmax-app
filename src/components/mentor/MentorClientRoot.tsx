'use client'

import { MentorProvider } from './MentorContext'
import { MentorTour } from './MentorTour'
import { MentorChat } from './MentorChat'

interface Props {
  idleEnabled?: boolean
  idleSeconds?: number
  isFreePlan?:  boolean
}

export function MentorClientRoot({ idleEnabled = true, idleSeconds = 30, isFreePlan = true }: Props) {
  return (
    <MentorProvider>
      <MentorTour />
      <MentorChat idleEnabled={idleEnabled} idleSeconds={idleSeconds} isFreePlan={isFreePlan} />
    </MentorProvider>
  )
}
