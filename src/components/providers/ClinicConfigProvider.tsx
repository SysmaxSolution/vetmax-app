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
  /** flow_config.require_attending_vet — exige selecionar o profissional responsável no check-in. */
  requireAttendingVet: boolean
  /** flow_config.uses_advance — habilita o lançamento de adiantamento no Caixa. */
  usesAdvance:         boolean
  /** flow_config.usa_convenios — a clínica trabalha com convênios (gate global). */
  usaConvenios:        boolean
  /** flow_config.usa_imagem — módulo de Imagem/DICOM. Padrão: desligado. */
  usaImagem:           boolean
  /** flow_config.usa_laboratorio — painel de laboratório dentro do exame. Padrão: desligado. */
  usaLaboratorio:      boolean
  /** flow_config.usa_boleto — aba/rotina de Boletos no Financeiro. Padrão: desligado. */
  usaBoleto:           boolean
  /** flow_config.portal_enabled — Portal do Tutor. Padrão: desligado. */
  portalEnabled:       boolean
}

const ClinicConfigContext = createContext<ClinicConfig>({
  aiTranscriptionMode: 'ai_assisted',
  internacaoCompleta:  false,
  centroCirurgico:     false,
  animaisFoundation:   false,
  requireAttendingVet: false,
  usesAdvance:         false,
  usaConvenios:        false,
  usaImagem:           false,
  usaLaboratorio:      false,
  usaBoleto:           false,
  portalEnabled:       false,
})

export function ClinicConfigProvider({
  aiTranscriptionMode,
  internacaoCompleta = false,
  centroCirurgico = false,
  animaisFoundation = false,
  requireAttendingVet = false,
  usesAdvance = false,
  usaConvenios = false,
  usaImagem = false,
  usaLaboratorio = false,
  usaBoleto = false,
  portalEnabled = false,
  children,
}: {
  aiTranscriptionMode: AiTranscriptionMode
  internacaoCompleta?: boolean
  centroCirurgico?:    boolean
  animaisFoundation?:  boolean
  requireAttendingVet?: boolean
  usesAdvance?:        boolean
  usaConvenios?:       boolean
  usaImagem?:          boolean
  usaLaboratorio?:     boolean
  usaBoleto?:          boolean
  portalEnabled?:      boolean
  children: React.ReactNode
}) {
  return (
    <ClinicConfigContext.Provider value={{ aiTranscriptionMode, internacaoCompleta, centroCirurgico, animaisFoundation, requireAttendingVet, usesAdvance, usaConvenios, usaImagem, usaLaboratorio, usaBoleto, portalEnabled }}>
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

/** Hook client: exigir profissional responsável no check-in? */
export function useRequireAttendingVet(): boolean {
  return useContext(ClinicConfigContext).requireAttendingVet
}

/** Hook client: a clínica usa adiantamento no Caixa? */
export function useUsesAdvance(): boolean {
  return useContext(ClinicConfigContext).usesAdvance
}

/** Hook client: a clínica trabalha com convênios? (gate de convênio/repasse na UI) */
export function useUsaConvenios(): boolean {
  return useContext(ClinicConfigContext).usaConvenios
}

/** Hook client: a clínica ativou o módulo de Imagem/DICOM? */
export function useUsaImagem(): boolean {
  return useContext(ClinicConfigContext).usaImagem
}

/** Hook client: a clínica ativou o Laboratório (resultados dentro do exame)? */
export function useUsaLaboratorio(): boolean {
  return useContext(ClinicConfigContext).usaLaboratorio
}

/** Hook client: a clínica ativou os Boletos de cobrança? */
export function useUsaBoleto(): boolean {
  return useContext(ClinicConfigContext).usaBoleto
}

/** Hook client: a clínica ativou o Portal do Tutor? */
export function usePortalEnabled(): boolean {
  return useContext(ClinicConfigContext).portalEnabled
}
