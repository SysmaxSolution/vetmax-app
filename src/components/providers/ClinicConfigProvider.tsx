'use client'

import { createContext, useContext } from 'react'
import type { AiTranscriptionMode } from '@/lib/actions/clinic-settings'

interface ClinicConfig {
  aiTranscriptionMode: AiTranscriptionMode
  /** flow_config.internacao_completa — liga a versão avançada da Internação. */
  internacaoCompleta:  boolean
  /** flow_config.centro_cirurgico — liga o módulo Centro Cirúrgico. */
  centroCirurgico:     boolean
  /** flow_config.animais_foundation — liga a fundação da Sprint Animais (multi-CNPJ, clínicas parceiras, tabelas de preço, OS/urgência). */
  animaisFoundation:   boolean
}

const ClinicConfigContext = createContext<ClinicConfig>({
  aiTranscriptionMode: 'ai_assisted',
  internacaoCompleta:  false,
  centroCirurgico:     false,
  animaisFoundation:   false,
})

export function ClinicConfigProvider({
  aiTranscriptionMode,
  internacaoCompleta = false,
  centroCirurgico = false,
  animaisFoundation = false,
  children,
}: {
  aiTranscriptionMode: AiTranscriptionMode
  internacaoCompleta?: boolean
  centroCirurgico?:    boolean
  animaisFoundation?:  boolean
  children: React.ReactNode
}) {
  return (
    <ClinicConfigContext.Provider value={{ aiTranscriptionMode, internacaoCompleta, centroCirurgico, animaisFoundation }}>
      {children}
    </ClinicConfigContext.Provider>
  )
}

export function useAiTranscriptionMode(): AiTranscriptionMode {
  return useContext(ClinicConfigContext).aiTranscriptionMode
}

/** Hook client: a clínica ativou a versão avançada da Internação? */
export function useInternacaoCompleta(): boolean {
  return useContext(ClinicConfigContext).internacaoCompleta
}

/** Hook client: a clínica ativou o módulo Centro Cirúrgico? */
export function useCentroCirurgico(): boolean {
  return useContext(ClinicConfigContext).centroCirurgico
}

/** Hook client: a clínica ativou a fundação da Sprint Animais? */
export function useAnimaisFoundation(): boolean {
  return useContext(ClinicConfigContext).animaisFoundation
}
