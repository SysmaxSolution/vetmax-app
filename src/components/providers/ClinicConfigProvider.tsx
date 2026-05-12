'use client'

import { createContext, useContext } from 'react'
import type { AiTranscriptionMode } from '@/lib/actions/clinic-settings'

interface ClinicConfig {
  aiTranscriptionMode: AiTranscriptionMode
}

const ClinicConfigContext = createContext<ClinicConfig>({ aiTranscriptionMode: 'ai_assisted' })

export function ClinicConfigProvider({
  aiTranscriptionMode,
  children,
}: {
  aiTranscriptionMode: AiTranscriptionMode
  children: React.ReactNode
}) {
  return (
    <ClinicConfigContext.Provider value={{ aiTranscriptionMode }}>
      {children}
    </ClinicConfigContext.Provider>
  )
}

export function useAiTranscriptionMode(): AiTranscriptionMode {
  return useContext(ClinicConfigContext).aiTranscriptionMode
}
